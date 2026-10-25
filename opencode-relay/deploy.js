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
    const o = { token: process.env.CF_API_TOKEN || '', accountId: '', projectName: '', dryRun: false, probe: true, worker: '', checkWorker: false };
    for (const a of argv.slice(2)) {
        if (a === '--dry-run') o.dryRun = true;
        else if (a === '--no-probe') o.probe = false;
        else if (a === '--check-worker') o.checkWorker = true;
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
    // 没指定名字 ⇒ 先找账号里已有的 yw-oc-relay-* 项目复用（上次跑到一半失败也能接上，不会越堆越多）
    if (!ctx.projectName) {
        try {
            const list = await cfCall(ctx.token, 'GET', '/accounts/' + ctx.accountId + '/pages/projects');
            const cand = (Array.isArray(list) ? list : [])
                .filter((p) => p && /^yw-oc-relay-/.test(String(p.name)))
                .sort((a, b) => String(b.created_on || '').localeCompare(String(a.created_on || '')))[0];
            if (cand) {
                ctx.projectName = cand.name;
                good('找到上次建的站点，复用：' + ctx.projectName);
            }
        } catch (e) { /* 列不出来就新建 */ }
    }
    if (!ctx.projectName) ctx.projectName = 'yw-oc-relay-' + crypto.randomBytes(3).toString('hex');

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
    // ★建完就落盘：后面哪一步失败，重跑也能接上同一个站点
    saveState({ projectName: ctx.projectName, accountId: ctx.accountId, url: ctx.url });
}

async function loadWorkerSource(ctx) {
    const okWorker = (src) => typeof src === 'string' && src.indexOf(SERVICE_TAG) >= 0 && src.indexOf('export default') >= 0;
    // ★W166n（作者报「重新部署但后端没变」）：默认**总是下载仓库里最新的 _worker.js**，
    //   不要用本地那份 —— 本地文件可能是很早以前下的旧版本，会让"重新部署"看起来没生效。
    //   （--worker= 显式指定时才用本地文件；下载失败才退回本地。）
    if (ctx.worker) {
        const src = fs.readFileSync(ctx.worker, 'utf8');
        if (okWorker(src)) return { src, file: ctx.worker };
        warn('--worker 指定的文件不是本项目的转发代码，改走下载：' + ctx.worker);
    }
    try {
        const r = await fetch(WORKER_URL, { signal: AbortSignal.timeout(30000) });
        if (r.ok) {
            const src = await r.text();
            if (okWorker(src)) {
                try { fs.writeFileSync(path.join(__dirname, '_worker.js'), src); } catch (e) { /* 只读目录也没关系 */ }
                return { src, file: WORKER_URL };
            }
            warn('下载回来的内容不对（可能被网络换成了跳转页），开头是：' + JSON.stringify(String(src).slice(0, 60)));
        } else {
            warn('下载 _worker.js 失败：HTTP ' + r.status);
        }
    } catch (e) {
        warn('下载 _worker.js 出错：' + String((e && e.message) || e));
    }
    try {
        const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');
        if (okWorker(src)) { warn('下载不通，改用本地 _worker.js（可能是旧版）'); return { src, file: path.join(__dirname, '_worker.js') }; }
    } catch (e) { /* 没有就算了 */ }
    die('拿不到正确的 _worker.js。', '检查网络后重跑；还是不行就把上面这段原话发给作者。');;
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
    out('把下面这一整行粘进「余温工具箱 → 连接 OpenCode Go」的「配置串」里：');
    out('');
    out('    ' + CONFIG_PREFIX + ctx.url);
    line();
    out('（地址只认你自己的 Cloudflare 账号；钥匙还是填在插件里，作者看不到。）');
}

(async () => {
    const opt = parseArgs(process.argv);
    const state = loadState();
    const ctx = {
        token: opt.token,
        accountId: opt.accountId || state.accountId || '',
        projectName: opt.projectName || state.projectName || '',
        probe: opt.probe,
        dryRun: opt.dryRun,
        checkWorker: opt.checkWorker,
    };

    line();
    out('OpenCode Go 中转 · 部署到你自己 Cloudflare 账号');
    out('（只跟 api.cloudflare.com 说话；令牌和中转流量都不经过作者）');
    line();
    out('它会：在你的 Cloudflare 里建一个只做转发的小站点 → 上传中转代码 → 打印一行配置串给你。');
    line();

    if (ctx.checkWorker) {
        const w = await loadWorkerSource(ctx);
        out('✅ 用的是：' + w.file + '（' + w.src.length + ' 字节，含 ' + SERVICE_TAG + '）');
        return;
    }

    if (ctx.dryRun) {
        out('【干跑】不联网。站点名：' + (ctx.projectName || '（自动：优先复用你账号里已有的 yw-oc-relay-*）'));
        out('【干跑】部署完成后会给的地址：https://' + (ctx.projectName || 'yw-oc-relay-xxxxxx') + '.pages.dev');
        return;
    }

    if (!ctx.token) {
        out('需要两样东西，第一次大概 2 分钟。');
        line();
        out('  1) Cloudflare 账号（注册就行，谷歌一键登录不用验证，邮箱注册需要去邮箱点一下验证）：');
        out('     ' + REGISTER_URL);
        line();
        out('  2) 令牌（打开链接，内容权限已经预填好，直接点击右下角，然后「创建令牌」→ 复制）：');
        out('     ' + TOKEN_DEEP_LINK);
        line();
        ctx.token = await ask('粘贴令牌到此处：  ');
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
