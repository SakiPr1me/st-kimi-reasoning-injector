#!/usr/bin/env node
/**
 * ============================================================================
 *  yw-oc-local · OpenCode Go 的【本地】反代（单文件、零依赖）
 * ----------------------------------------------------------------------------
 *  为什么需要它：酒馆原版 ST 的 Google 源没法带自定义请求头，走云端中转才行；
 *  但云端中转多一跳（本机 → Cloudflare → OpenCode），有人会觉得吐字比 TT 直连"一顿一顿"。
 *  这个脚本把那一跳换成 127.0.0.1：酒馆 → 你的电脑 → OpenCode，链路最短。
 *
 *  用法：
 *    1) 装好 Node 18+（酒馆用户本来就有）
 *    2) 双击「启动本地反代.bat」（或 node yw-oc-local.js）
 *    3) 酒馆：来源 = Google AI Studio；反向代理 = http://127.0.0.1:8787；
 *       代理密码 = 你的 oc_sk_…；API 密钥留空；模型 = gemini-4-argon
 *
 *  它做的事（和云端中转一模一样）：
 *    · 把 ?key= 换成 Authorization: Bearer + x-goog-api-key
 *    · 补 x-opencode-session（请求里带了就用你的）
 *    · 起始标记（</content> 或 <talk>）之后见到 <mutter> ⇒ 立刻中止上游，省后面的钱
 * ============================================================================
 */
'use strict';

// 本地小工具：中止上游时 fetch 可能抛出 AbortError（无人接管）⇒ 不让它把进程带崩
process.on('unhandledRejection', (e) => { console.log('[warn] 忽略未处理的 rejection:', String((e && e.message) || e)); });
process.on('uncaughtException', (e) => { console.log('[warn] 忽略未捕获异常:', String((e && e.message) || e)); });

const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.YW_LOCAL_PORT || 8787);
const UPSTREAM = 'https://opencode.ai/inference/go/google';
const START_MARKERS = ['</content>', '<talk>'];
const END_MARKER = '<mutter>';

function sha1Hex(text) {
    return crypto.createHash('sha1').update(String(text)).digest('hex');
}
function firstUserText(payload) {
    const contents = Array.isArray(payload && payload.contents) ? payload.contents : [];
    for (const c of contents) {
        if (c && c.role === 'user' && Array.isArray(c.parts)) {
            const t = c.parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
            if (t) return t;
        }
    }
    return '';
}
function jsonBody(res, code, obj) {
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length });
    res.end(b);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return jsonBody(res, 200, { ok: true, service: 'yw-oc-local', port: PORT, hint: '反向代理填 http://127.0.0.1:' + PORT });
    }

    const m = url.pathname.match(/^\/v1beta\/models\/([^/]+):(streamGenerateContent|generateContent)$/);
    if (req.method !== 'POST' || !m) return jsonBody(res, 404, { error: { code: 404, message: 'not found: ' + url.pathname } });

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const key = url.searchParams.get('key') || String(req.headers['x-goog-api-key'] || '');
        if (!key) return jsonBody(res, 401, { error: { code: 401, message: 'missing key: 把 oc_sk_... 填进酒馆的「代理密码」' } });

        // 会话 id：请求里带了就用（TT 的插件会带），没带就按首条 user 正文算
        let session = String(req.headers['x-opencode-session'] || '').trim();
        if (!session) {
            try {
                const payload = JSON.parse(bodyText);
                const t = firstUserText(payload);
                if (t) session = 'st-' + sha1Hex(t.slice(0, 500)).slice(0, 20);
            } catch (e) { }
            if (!session) session = 'st-' + sha1Hex(key).slice(0, 20);
        }

        const qs = new URLSearchParams();
        if (url.searchParams.get('alt')) qs.set('alt', url.searchParams.get('alt'));
        else if (m[2] === 'streamGenerateContent') qs.set('alt', 'sse');
        const target = UPSTREAM + '/v1beta/models/' + m[1] + ':' + m[2] + (qs.toString() ? '?' + qs.toString() : '');

        const abort = new AbortController();
        let upstream;
        try {
            upstream = await fetch(target, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer ' + key,
                    'x-goog-api-key': key,
                    'x-opencode-session': session,
                    'user-agent': 'yw-oc-local/1.0',
                },
                body: bodyText,
                signal: abort.signal,
            });
        } catch (e) {
            return jsonBody(res, 502, { error: { code: 502, message: 'upstream fetch failed: ' + String((e && e.message) || e) } });
        }

        const ct = upstream.headers.get('content-type') || '';
        if (!upstream.ok || !upstream.body || ct.indexOf('text/event-stream') < 0) {
            res.writeHead(upstream.status, { 'content-type': ct || 'application/json' });
            try { for await (const c of upstream.body) res.write(c); } catch (e) { }
            return res.end();
        }

        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', 'connection': 'keep-alive' });
        const dec = new TextDecoder();
        const reader = upstream.body.getReader();
        let pending = '', tail = '', seenStart = false;
        const finishWithStop = () => {
            try { res.write('data: ' + JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '' }] } }] }) + '\n\n'); } catch (e) { }
            try { res.end(); } catch (e) { }
            try { abort.abort(); } catch (e) { }
            try { reader.cancel(); } catch (e) { }
        };

        try {
            for (;;) {
                const r = await reader.read();
                if (r.done) break;
                pending += dec.decode(r.value, { stream: true });
                let i;
                while ((i = pending.indexOf('\n')) >= 0) {
                    const line = pending.slice(0, i); pending = pending.slice(i + 1);
                    if (line.indexOf('data:') !== 0) { try { res.write(line + '\n'); } catch (e) { break; } continue; }
                    const payload = line.slice(5).trim();
                    if (!payload) { try { res.write(line + '\n'); } catch (e) { break; } continue; }
                    let obj = null;
                    try { obj = JSON.parse(payload); } catch (e) { }
                    if (!obj) { try { res.write(line + '\n'); } catch (e) { break; } continue; }

                    let chunkText = '';
                    for (const c of (obj.candidates || [])) {
                        for (const p of ((c.content || {}).parts || [])) {
                            if (p.thought || typeof p.text !== 'string' || !p.text) continue;
                            chunkText += p.text;
                        }
                    }
                    let hit = false;
                    if (chunkText) {
                        const prevLen = tail.length;
                        tail = (tail + chunkText).slice(-400);
                        if (!seenStart) {
                            let si = -1;
                            for (const x of START_MARKERS) { const k = tail.lastIndexOf(x); if (k > si) si = k; }
                            if (si >= 0) { seenStart = true; tail = tail.slice(si); }
                        }
                        if (seenStart && tail.indexOf(END_MARKER) >= 0) hit = true;
                        if (hit) {
                            const posInChunk = chunkText.indexOf(END_MARKER);
                            let keep = posInChunk >= 0 ? posInChunk : (tail.indexOf(END_MARKER) >= prevLen ? tail.indexOf(END_MARKER) - prevLen : 0);
                            if (keep < 0) keep = 0;
                            let used = 0;
                            for (const c of (obj.candidates || [])) {
                                for (const p of ((c.content || {}).parts || [])) {
                                    if (p.thought || typeof p.text !== 'string') continue;
                                    const room = Math.max(0, keep - used);
                                    p.text = p.text.slice(0, room);
                                    used += p.text.length;
                                }
                            }
                            try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) { }
                            console.log('[cut] 命中 <mutter>，已中止上游');
                            return finishWithStop();
                        }
                    }
                    try { res.write(line + '\n'); } catch (e) { break; }
                }
            }
            if (pending) { try { res.write(pending); } catch (e) { } }
            res.end();
        } catch (e) {
            try { res.end(); } catch (_) { }
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    const line = '  ' + '-'.repeat(52);
    console.log('');
    console.log('  OpenCode Go 本地反代已启动：' + 'http://127.0.0.1:' + PORT);
    console.log(line);
    console.log('  接下来在「余温工具箱」里（推荐）：');
    console.log('    1) 打开 基础设置 → 「Gemini 4 Argon」那块');
    console.log('    2) 配置串填：http://127.0.0.1:' + PORT);
    console.log('    3) Key 填你的 oc_sk_...');
    console.log('    4) 点「确定」');
    console.log(line);
    console.log(line);
    console.log('  关掉这个窗口 / 按 Ctrl+C = 停止反代。');
    console.log('');
});
