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

        const m = url.pathname.match(/^\/v1beta\/models\/([^/]+):(streamGenerateContent|generateContent)$/);
        if (request.method !== 'POST' || !m) {
            return json({ error: { code: 404, message: 'not found: ' + url.pathname } }, 404);
        }

        const key = url.searchParams.get('key') || request.headers.get('x-goog-api-key') || '';
        if (!key) {
            return json({ error: { code: 401, message: 'missing key: 请把你的 oc_sk_... 填进酒馆的「代理密码」' } }, 401);
        }

        const bodyText = await request.text();
        let session = '';
        try {
            const payload = JSON.parse(bodyText);
            const t = firstUserText(payload);
            if (t) session = 'st-' + (await sha1Hex(t.slice(0, 500))).slice(0, 20);
        } catch (e) { /* 体不是 JSON 也照样转发，交给上游报错 */ }
        if (!session) session = 'st-' + (await sha1Hex(key)).slice(0, 20);

        const qs = new URLSearchParams();
        const alt = url.searchParams.get('alt');
        if (alt) qs.set('alt', alt);
        else if (m[2] === 'streamGenerateContent') qs.set('alt', 'sse');

        const target = UPSTREAM + '/v1beta/models/' + m[1] + ':' + m[2] + (qs.toString() ? '?' + qs.toString() : '');

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
            });
        } catch (e) {
            return json({ error: { code: 502, message: 'upstream fetch failed: ' + String((e && e.message) || e) } }, 502);
        }

        const headers = new Headers(CORS);
        const ct = upstream.headers.get('content-type');
        if (ct) headers.set('content-type', ct);
        headers.set('cache-control', 'no-store, no-transform');   // 别让边缘节点压缩/改流（长 SSE 更稳）
        return new Response(upstream.body, { status: upstream.status, headers });
    },
};
