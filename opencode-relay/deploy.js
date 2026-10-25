#!/usr/bin/env node
/**
 * ============================================================================
 *  yw-opencode-relay · 一行式部署脚本（用户自己的 Cloudflare 账号）
 * ----------------------------------------------------------------------------
 *  作用：在你的 Cloudflare 上建一个只做转发的小站点，把酒馆「Google AI Studio」
 *        的请求转给 OpenCode Go 的 Gemini 4 Argon。
 *  承诺：只跟 api.cloudflare.com 说话；令牌和中转流量都不会发给作者或任何第三方。
 *  可重复跑：建过的东西会复用；配置串丢了再跑一遍会重新打印（同一个地址）。
 *
 *  用法（Windows CMD / PowerShell）：
 *      node deploy.js
 *  或者先给令牌（不给就按提示粘）：
 *      node deploy.js --token=xxxxx
 *  干跑（不联网，只看流程）：
 *      node deploy.js --dry-run
 * ============================================================================
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');

const SERVICE_TAG = 'yw-opencode-relay';
const API_BASE = 'https://api.cloudflare.com/client/v4';
const COMPAT_DATE = '2026-09-01';
const TIMEOUT_MS = 60000;
const UPLOAD_TIMEOUT_MS = 180000;
const DEPLOY_WAIT_MS = 180000;
const SITE_WAIT_MS = 210000;
const SITE_INTERVAL_MS = 15000;
const CONFIG_PREFIX = 'ywoc1:';

const REGISTER_URL = 'https://dash.cloudflare.com/sign-up';
// 预填权限的「创建令牌」深链：Pages:Edit + Account Settings:Read
const TOKEN_DEEP_LINK = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=OpenCode%20%E4%B8%AD%E8%BD%AC';

const STATE_DIR = path.join(os.homedir(), '.yw-opencode-relay');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
// 一行式入口只下 deploy.js；缺 _worker.js 时从这里补（和「一键云同步」同一个做法）
const WORKER_URL = 'https://gitee.com/satosaki/st-kimi-reasoning-injector/raw/main/opencode-relay/_worker.js';

function out(m) { process.stdout.write(String(m) + '\n'); }
function line() { out(''); }
function title(m) { line(); out('── ' + m + ' ' + '─'.repeat(Math.max(0, 58 - m.length))); }
function sub(m) { out('    ' + m); }
function good(m) { out('    ✅ ' + m); }
function warn(m) { out('    ⚠️  ' + m); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

class DeployError extends Error {
    constructor(human, hint) { super(human); this.human = human; this.hint = hint || ''; }
}
function die(human, hint) { throw new DeployError(human, hint); }

// ---------------------------------------------------------------- 参数 / 状态
function parseArgs(argv) {
    const o = { token: process.env.CF_API_TOKEN || '', accountId: '', projectName: '', dryRun: false, probe: true, worker: '' };
    for (const a of argv.slice(2)) {
        if (a === '--dry-run') o.dryRun = true;
        else if (a === '--no-probe') o.probe = false;
        else if (a.startsWith('--token=')) o.token = a.slice(8).trim();
        else if (a.startsWith('--account-id=')) o.accountId = a.slice(13).trim();
        else if (a.startsWith('--project-name=')) o.projectName = a.slice(15).trim();
        else if (a.startsWith('--worker=')) o.worker = a.slice(9).trim();
        else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    }
    return o;
}

function printHelp() {
    out('yw-opencode-relay 部署脚本');
    out('');
    out('  node deploy.js                 按提示粘令牌，全自动');
    out('  node deploy.js --token=xxx     直接把令牌给它');
    out('  node deploy.js --dry-run       干跑，不联网');
    out('  node deploy.js --project-name=xxx');
    out('  node deploy.js --no-probe      不等站点生效（自己回头试）');
}

function loadState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveState(obj) {
    try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2)); } catch (e) { /* 存不下不影响部署 */ }
}

// ---------------------------------------------------------------- 交互
function ask(q) {
    if (!process.stdin.isTTY) {
        return new Promise((resolve) => {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.question(q, (a) => { rl.close(); resolve(String(a || '').trim()); });
        });
    }
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(q, (a) => { rl.close(); resolve(String(a || '').trim()); });
    });
}

function askHidden(q) {
    if (!process.stdin.isTTY) return ask(q);
    return new Promise((resolve) => {
        process.stdout.write(q);
        const stdin = process.stdin;
        stdin.resume();
        if (stdin.setRawMode) stdin.setRawMode(true);
        let buf = '';
        const onData = (chunk) => {
            const s = chunk.toString('utf8');
            for (const ch of s) {
                if (ch === '\r' || ch === '\n') {
                    if (stdin.setRawMode) stdin.setRawMode(false);
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    resolve(buf.trim());
                    return;
                }
                if (ch === '\u0003') { process.exit(1); }
                if (ch === '\u007f') { buf = buf.slice(0, -1); continue; }
                buf += ch;
            }
        };
        stdin.on('data', onData);
    });
}

// ---------------------------------------------------------------- Cloudflare API
async function cfCall(token, method, apiPath, opt) {
    const o = opt || {};
    const url = API_BASE + apiPath;
    const headers = { authorization: 'Bearer ' + token };
    let body;
    if (o.form) { body = o.form; }
    else if (o.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.json); }
    let res;
    try {
        res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(o.timeoutMs || TIMEOUT_MS) });
    } catch (e) {
        die('连不上 Cloudflare（' + String((e && e.message) || e) + '）。',
            '先看浏览器能不能打开 https://dash.cloudflare.com —— 打不开就是网络问题，挂梯子后重跑。');
    }
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch (e) { /* 不是 JSON */ }
    if (!res.ok || (data && data.success === false)) {
        const msgs = data && Array.isArray(data.errors) ? data.errors.map((x) => x.message).join(' · ') : text.slice(0, 300);
        const err = new Error(msgs || ('HTTP ' + res.status));
        err.httpStatus = res.status;
        throw err;
    }
    return data ? data.result : null;
}

async function stepVerifyToken(ctx) {
    title('1/5 检查令牌');
    const r = await cfCall(ctx.token, 'GET', '/user/tokens/verify');
    if (!r || r.status !== 'active') die('这个令牌不是有效状态（' + (r && r.status) + '）。', '回后台重新建一个，或确认没复制漏字符。');
    good('令牌有效');
}

async function stepFindAccount(ctx) {
    title('2/5 找你的账号');
    const list = await cfCall(ctx.token, 'GET', '/accounts');
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) die('这个令牌看不到任何账号。', '建令牌时要选「Account Settings: Read」，并且账号要选对。');
    const chosen = ctx.accountId ? arr.find((a) => a.id === ctx.accountId) : arr[0];
    if (!chosen) die('你给的 --account-id 不在账号列表里。', '你名下是：' + arr.map((a) => a.name + ' (' + a.id + ')').join(' · '));
    ctx.accountId = chosen.id;
    good('账号：' + chosen.name + ' (' + chosen.id + ')');
}

async function stepEnsureProject(ctx) {
    title('3/5 建站点');
    let proj = null;
    try {
        proj = await cfCall(ctx.token, 'GET', '/accounts/' + ctx.accountId + '/pages/projects/' + ctx.projectName);
        good('站点已存在，复用：' + ctx.projectName);
    } catch (e) {
        if (e.httpStatus === 404) {
            proj = await cfCall(ctx.token, 'POST', '/accounts/' + ctx.accountId + '/pages/projects', {
                json: { name: ctx.projectName, production_branch: 'main' },
            });
            good('已新建站点：' + ctx.projectName);
        } else {
            throw e;
        }
    }
    ctx.url = 'https://' + ctx.projectName + '.pages.dev';
    sub('地址：' + ctx.url);
}

async function loadWorkerSource(ctx) {
    const candidates = [];
    if (ctx.worker) candidates.push(ctx.worker);
    candidates.push(path.join(__dirname, '_worker.js'));
    for (const p of candidates) {
        try {
            const src = fs.readFileSync(p, 'utf8');
            if (src.indexOf(SERVICE_TAG) < 0 || src.indexOf('export default') < 0) {
                die('这个 _worker.js 不是本项目的转发代码（找不到 ' + SERVICE_TAG + '）。', '把仓库里的 _worker.js 放到 deploy.js 旁边再跑。');
            }
            return { src, file: p };
        } catch (e) { if (e instanceof DeployError) throw e; /* 试下一个 */ }
    }
    // 本地没有 ⇒ 自己补（一行式入口只下 deploy.js）
    try {
        const r = await fetch(WORKER_URL, { signal: AbortSignal.timeout(30000) });
        if (r.ok) {
            const src = await r.text();
            if (src.indexOf(SERVICE_TAG) >= 0 && src.indexOf('export default') >= 0) {
                try { fs.writeFileSync(path.join(__dirname, '_worker.js'), src); } catch (e) { /* 只读目录也没关系 */ }
                return { src, file: WORKER_URL };
            }
        }
    } catch (e) { /* 下面统一报人话 */ }
    die('找不到 _worker.js，也下载不下来。', '把 _worker.js 和 deploy.js 放在同一个文件夹里再跑（两个文件都要）。');
}

function buildForm(worker, mode) {
    const form = new FormData();
    form.append('manifest', '{}');
    form.append('commit_message', 'yw-opencode-relay deploy');
    form.append('commit_dirty', 'true');
    if (mode === 'plain') {
        form.append('_worker.js', new Blob([worker.src], { type: 'application/javascript+module' }), '_worker.js');
    } else {
        const inner = new FormData();
        inner.append('metadata', JSON.stringify({ main_module: '_worker.js', compatibility_date: COMPAT_DATE }));
        inner.append('_worker.js', new Blob([worker.src], { type: 'application/javascript+module' }), '_worker.js');
        form.append('_worker.bundle', new Response(inner).blob(), '_worker.bundle');
    }
    return form;
}

async function createDeployment(ctx, worker, mode) {
    return await cfCall(ctx.token, 'POST', '/accounts/' + ctx.accountId + '/pages/projects/' + ctx.projectName + '/deployments', {
        form: buildForm(worker, mode), timeoutMs: UPLOAD_TIMEOUT_MS,
    });
}

async function waitDeployment(ctx, depId) {
    const p = '/accounts/' + ctx.accountId + '/pages/projects/' + ctx.projectName + '/deployments/' + depId;
    const t0 = Date.now();
    let last = '';
    while (Date.now() - t0 < DEPLOY_WAIT_MS) {
        let dep = null;
        try { dep = await cfCall(ctx.token, 'GET', p); } catch (e) { dep = null; }
        if (dep && dep.latest_stage) {
            const st = dep.latest_stage;
            last = st.name + '/' + st.status;
            if (st.name === 'deploy' && st.status === 'success') return { ok: true, stage: last };
            if (st.status === 'failure' || st.status === 'canceled') return { ok: false, stage: last };
        }
        await sleep(3000);
    }
    return { ok: false, stage: last || '（一直没回话）' };
}

async function stepDeploy(ctx) {
    title('4/5 上传并发布');
    const worker = await loadWorkerSource(ctx);
    sub('代码：' + worker.file + '（' + (Buffer.byteLength(worker.src) / 1024).toFixed(1) + ' KB）');
    let mode = 'plain';
    let dep;
    try {
        dep = await createDeployment(ctx, worker, 'plain');
    } catch (e) {
        if (e.httpStatus === 400) {
            warn('第一种提交方式被拒（' + e.message + '），自动换第二种…');
            mode = 'bundle';
            dep = await createDeployment(ctx, worker, 'bundle');
        } else { throw e; }
    }
    good('已提交（部署 id ' + (dep && dep.id) + '）');
    let w = await waitDeployment(ctx, dep && dep.id);
    if (!w.ok) {
        warn('这次发布没成功（' + w.stage + '），自动换第二种方式再发一次…');
        mode = 'bundle';
        dep = await createDeployment(ctx, worker, 'bundle');
        w = await waitDeployment(ctx, dep && dep.id);
        if (!w.ok) die('上传成功但 Cloudflare 发布失败：' + w.stage, '把上面 Cloudflare 的原话发给作者，或去后台 Pages → 项目 → Deployments 看详情。');
    }
    good('发布成功');
}

async function siteAlive(base) {
    try {
        const r = await fetch(base + '/', { signal: AbortSignal.timeout(15000) });
        const t = await r.text();
        return r.ok && t.indexOf(SERVICE_TAG) >= 0;
    } catch (e) { return false; }
}

async function stepWaitSite(ctx) {
    title('5/5 等站点生效（全自动）');
    if (!ctx.probe) { sub('（用了 --no-probe，跳过）'); return; }
    const t0 = Date.now();
    while (Date.now() - t0 < SITE_WAIT_MS) {
        if (await siteAlive(ctx.url)) { good('已生效：' + ctx.url); return; }
        const sec = Math.round((Date.now() - t0) / 1000);
        out('    ⏳ 还没通（已等 ' + sec + ' 秒）…');
        await sleep(SITE_INTERVAL_MS);
    }
    warn('虽然站点暂时没通，不代表坏了：你先把下面的地址填进酒馆试试，过一会儿就行了。');
}

function printResult(ctx) {
    line();
    out('部署完成。');
    line();
    out('把下面这一整行粘进「余温工具箱 → 连接 OpenCode Go」：');
    out('');
    out('    ' + CONFIG_PREFIX + ctx.url);
    line();
    out('（也可以只填地址）');
    out('    反向代理：' + ctx.url);
    out('    代理密码：你的 oc_sk_... 钥匙');
    out('    API 密钥：留空');
    out('    模型：gemini-4-argon');
    line();
    out('这个地址只认你自己的 Cloudflare 账号，钥匙只在你自己的中转里过一下，作者看不到。');
}

(async () => {
    const opt = parseArgs(process.argv);
    const state = loadState();
    const ctx = {
        token: opt.token,
        accountId: opt.accountId || state.accountId || '',
        projectName: opt.projectName || state.projectName || ('yw-oc-relay-' + crypto.randomBytes(3).toString('hex')),
        probe: opt.probe,
        dryRun: opt.dryRun,
    };

    line();
    out('OpenCode Go 中转 · 部署到你自己 Cloudflare 账号');
    out('（只跟 api.cloudflare.com 说话；令牌和中转流量都不经过作者）');
    line();

    if (ctx.dryRun) {
        out('【干跑】不联网。将要创建/复用的站点名：' + ctx.projectName);
        out('【干跑】部署完成后会给的地址：https://' + ctx.projectName + '.pages.dev');
        return;
    }

    if (!ctx.token) {
        out('需要两样东西，第一次大概 2 分钟：');
        out('  1) Cloudflare 账号（没有就注册）：' + REGISTER_URL);
        out('  2) 一个令牌（权限已经预填好，点开直接「创建令牌」→ 复制）：');
        out('     ' + TOKEN_DEEP_LINK);
        line();
        const ans = await ask('准备好了就按回车（或先粘注册/令牌的网页地址也行）…  ');
        if (ans && /^https?:\/\//.test(ans)) {
            out('请先在上面那个页面建好令牌，然后把令牌粘进来。');
        }
        ctx.token = await askHidden('把令牌粘到这里（不会显示，粘完回车）：  ');
        if (!ctx.token) die('没拿到令牌。', '重跑一次，把令牌粘进来。');
    }

    try {
        await stepVerifyToken(ctx);
        await stepFindAccount(ctx);
        await stepEnsureProject(ctx);
        await stepDeploy(ctx);
        await stepWaitSite(ctx);
        saveState({ projectName: ctx.projectName, accountId: ctx.accountId, url: ctx.url });
        printResult(ctx);
    } catch (e) {
        if (e instanceof DeployError) {
            line();
            out('❌ ' + e.human);
            if (e.hint) { line(); out('   ' + e.hint); }
            process.exitCode = 1;
        } else {
            line();
            out('❌ 出错了：' + String((e && e.message) || e));
            out('   把上面这段原话发给作者。');
            process.exitCode = 1;
        }
    }
})();
