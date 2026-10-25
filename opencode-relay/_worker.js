/**
 * ============================================================================
 *  yw-opencode-relay · 把「OpenCode Go」的 Gemini 4 Argon 接到酒馆原生 Google 源
 *  Cloudflare Pages 高级模式入口（_worker.js）
 * ============================================================================
 *
 * 为什么需要它（三条硬约束，都是实测出来的）：
 *   ① OpenCode Go 的钥匙只认 `Authorization: Bearer` 或 `x-goog-api-key`，
 *      酒馆原生 Google 源只把钥匙放在 `?key=` ⇒ 必 401「Go requires a credential」
 *   ② OpenCode Go 强制要求 `x-opencode-session` 头，酒馆 Google 源不发送自定义头
 *   ③ 酒馆 Google 源拼出的路径是 `{反代}/v1beta/models/{模型}:方法` —— 与 OpenCode 的
 *      `/inference/go/google/v1beta/models/...` 正好对得上（这一段不用改）
 *
 * 于是本中转只做两件事（其余原样透传）：
 *   · 把 `?key=` 搬成 `x-goog-api-key` 头
 *   · 按「首条 user 正文」算一个稳定会话 id 塞进 `x-opencode-session`（同一段对话固定 ⇒ 缓存命中）
 * 响应流原样返回 —— 酒馆拿到的就是标准 Gemini SSE，提示词转换、安全过滤、思维链全都还是酒馆自己那套。
 *
 * 自报名字 = SERVICE_TAG（部署脚本靠它确认「_worker.js 没拿错」）
 */

const SERVICE_TAG = 'yw-opencode-relay';
const UPSTREAM = 'https://opencode.ai/inference/go/google';

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function json(obj, status) {
    return new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS),
    });
}

async function sha1Hex(text) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(String(text)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS });
        }

        if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
            return json({ ok: true, service: SERVICE_TAG, hint: '这个地址填进酒馆「反向代理」，钥匙填「代理密码」，模型填 gemini-4-argon' });
        }

        // ★W166q 调试：GET /demo —— 每 100ms 发一行，用来判断 CF 边缘有没有把 SSE 攒成块
        if (request.method === 'GET' && url.pathname === '/demo') {
            const enc2 = new TextEncoder();
            const demo = new ReadableStream({
                async start(c) {
                    const t0 = Date.now();
                    for (let i = 0; i < 50; i++) {
                        try { c.enqueue(enc2.encode('data: ' + JSON.stringify({ i: i, t: Date.now() - t0 }) + String.fromCharCode(10, 10))); } catch (e) { break; }
                        await new Promise(function (r) { setTimeout(r, 100); });
                    }
                    try { c.close(); } catch (e) { }
                },
            });
            const h2 = new Headers(CORS);
            h2.set('content-type', 'text/event-stream');
            h2.set('cache-control', 'no-store, no-transform');
            return new Response(demo, { status: 200, headers: h2 });
        }

        const m = url.pathname.match(/^\/v1beta\/models\/([^/]+):(streamGenerateContent|generateContent)$/);
        if (request.method !== 'POST' || !m) {
            return json({ error: { code: 404, message: 'not found: ' + url.pathname } }, 404);
        }

        const key = url.searchParams.get('key') || request.headers.get('x-goog-api-key') || '';
        if (!key) {
            return json({ error: { code: 401, message: 'missing key: 请把你的 oc_sk_... 填进酒馆的「代理密码」' } }, 401);
        }

        const bodyText = await request.text();
        // 会话 id：上游强制要求（缺了回 400 MissingSessionID，实测），所以不能去掉。
        // 客户端/插件如果自己带了 x-opencode-session，就尊重它（避免两边各算一个）；没带才自己算。
        let session = String(request.headers.get('x-opencode-session') || '').trim();
        if (!session) {
            try {
                const payload = JSON.parse(bodyText);
                const t = firstUserText(payload);
                if (t) session = 'st-' + (await sha1Hex(t.slice(0, 500))).slice(0, 20);
            } catch (e) { /* 体不是 JSON 也照样转发，交给上游报错 */ }
            if (!session) session = 'st-' + (await sha1Hex(key)).slice(0, 20);
        }

        const qs = new URLSearchParams();
        const alt = url.searchParams.get('alt');
        if (alt) qs.set('alt', alt);
        else if (m[2] === 'streamGenerateContent') qs.set('alt', 'sse');

        const target = UPSTREAM + '/v1beta/models/' + m[1] + ':' + m[2] + (qs.toString() ? '?' + qs.toString() : '');

        const abort = new AbortController();
        let upstream;
        try {
            upstream = await fetch(target, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-goog-api-key': key,
                    'x-opencode-session': session,
                    'user-agent': 'yw-opencode-relay/1.0',
                },
                body: bodyText,
                signal: abort.signal,
            });
        } catch (e) {
            return json({ error: { code: 502, message: 'upstream fetch failed: ' + String((e && e.message) || e) } }, 502);
        }

        const headers = new Headers(CORS);
        const ct = upstream.headers.get('content-type');
        if (ct) headers.set('content-type', ct);
        headers.set('cache-control', 'no-store, no-transform');   // 别让边缘节点压缩/改流（长 SSE 更稳）

        // ★W166p（作者 2026-10-25）：**中转侧自动截断** ——
        //   先见到起始标记（</content> 或 <talk>），之后见到 <mutter> ⇒ 立刻中止上游 + 给客户端补一个 STOP 收尾。
        //   为什么放在中转：客户端偶尔会成批到字，等它看到标记再停，上游可能已经又写了一长段；在这里命中就当场 abort。
        //   注意：只能省掉标记之后**还没生成**的部分，已经在路上的省不了。
        const START_MARKERS = ['</content>', '<talk>'];
        const END_MARKER = '<mutter>';
        if (!upstream.ok || !upstream.body || (ct && ct.indexOf('text/event-stream') < 0)) {
            return new Response(upstream.body, { status: upstream.status, headers });   // 错误/非流：原样透传，保留状态码
        }

        const dec = new TextDecoder();
        const enc = new TextEncoder();
        const NL = String.fromCharCode(10);
        const stream = new ReadableStream({
            async start(controller) {
                const reader = upstream.body.getReader();
                let pending = '', tail = '', seenStart = false;
                const cutDone = () => {
                    try { controller.enqueue(enc.encode('data: ' + JSON.stringify({
                        candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '' }] } }],
                    }) + NL + NL)); } catch (e) { }
                    try { controller.close(); } catch (e) { }
                    try { abort.abort(); } catch (e) { }
                    try { reader.cancel(); } catch (e) { }
                };
                try {
                    for (;;) {
                        const r = await reader.read();
                        if (r.done) break;
                        pending += dec.decode(r.value, { stream: true });
                        let i;
                        while ((i = pending.indexOf(NL)) >= 0) {
                            const line = pending.slice(0, i); pending = pending.slice(i + 1);
                            if (line.indexOf('data:') !== 0) {
                                try { controller.enqueue(enc.encode(line + NL)); } catch (e) { break; }
                                continue;
                            }
                            const payload = line.slice(5).trim();
                            if (!payload) {
                                try { controller.enqueue(enc.encode(line + NL)); } catch (e) { break; }
                                continue;
                            }
                            let obj = null;
                            try { obj = JSON.parse(payload); } catch (e) { }
                            if (!obj) {
                                try { controller.enqueue(enc.encode(line + NL)); } catch (e) { break; }
                                continue;
                            }
                            // 逐段收集本行的正文（跳过 thought）
                            let hit = false;
                            const prevLen = tail.length;
                            let chunkText = '';
                            for (const c of (obj.candidates || [])) {
                                for (const p of ((c.content || {}).parts || [])) {
                                    if (p.thought || typeof p.text !== 'string' || !p.text) continue;
                                    chunkText += p.text;
                                }
                            }
                            if (chunkText) {
                                tail = (tail + chunkText).slice(-400);
                                if (!seenStart) {
                                    let si = -1;
                                    for (const x of START_MARKERS) { const k = tail.lastIndexOf(x); if (k > si) si = k; }
                                    if (si >= 0) { seenStart = true; tail = tail.slice(si); }
                                }
                                if (seenStart && tail.indexOf(END_MARKER) >= 0) hit = true;
                            }
                            if (hit) {
                                // 只把 <mutter> 之前的部分留下（本行内能定位就精确截，跨行就整行丢掉正文）
                                const posInChunk = chunkText.indexOf(END_MARKER);
                                let keep = posInChunk >= 0 ? posInChunk : (tail.indexOf(END_MARKER) >= prevLen ? tail.indexOf(END_MARKER) - prevLen : -1);
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
                                try { controller.enqueue(enc.encode('data: ' + JSON.stringify(obj) + NL + NL)); } catch (e) { }
                                cutDone();
                                return;
                            }
                            try { controller.enqueue(enc.encode(line + NL)); } catch (e) { break; }
                        }
                    }
                    if (pending) { try { controller.enqueue(enc.encode(pending)); } catch (e) { } }
                    try { controller.close(); } catch (e) { }
                } catch (e) {
                    try { controller.close(); } catch (_) { }
                }
            },
            cancel() { try { abort.abort(); } catch (e) { } },
        });
        return new Response(stream, { status: 200, headers });
    },
};
