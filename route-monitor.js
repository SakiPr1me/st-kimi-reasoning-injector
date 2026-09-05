// ===== Cline 路由监视（纯只读探测）=====
// 请求侧：注入 X-OpenRouter-Metadata: enabled，让 Cline/OpenRouter 网关在响应里回传路由元数据；
// 响应侧：clone 副本解析（递归找 openrouter_metadata / 顶层 provider / finalProvider 等），
// 提炼「最终实际使用的 provider」写入 window.__kimiRouteInfo。
// 不修改任何路由逻辑；原响应原封不动交回 ST；解析在流结束后异步完成。

import { extension_settings } from "../../../extensions.js";

function s() { return extension_settings['kimi_reasoning_injector'] || {}; }

// 是否需要探测：用户开启了提供商指定，或模型名走 cline-pass 通道
export function shouldProbe(model) {
    const st = s();
    if (st.clineProviderEnabled) return true;
    return /^cline-pass\//i.test(String(model || ''));
}

// 请求侧：往 custom_include_headers 追加 metadata 开关（YAML 一行一个 header，与 ST 附加参数格式一致）
export function injectRouteProbe(bodyObj) {
    try {
        if (!bodyObj || !shouldProbe(bodyObj.model)) return false;
        const NL = String.fromCharCode(10);
        const inc = String(bodyObj.custom_include_headers || '');
        if (/(^|\n)\s*X-OpenRouter-Metadata\s*:/i.test(inc)) return false; // 已有，不重复
        bodyObj.custom_include_headers = (inc.trim() ? inc.replace(/\s*$/, NL) : '') + 'X-OpenRouter-Metadata: enabled';
        return true;
    } catch (e) { return false; }
}

function isRecord(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// openrouter_metadata → { provider, attempts:[name...] }
function normalizeOpenRouterMetadata(md) {
    const attempts = Array.isArray(md.attempts) ? md.attempts : [];
    const names = attempts.filter(a => a && typeof a.provider === 'string').map(a => a.provider);
    let selected = null;
    if (isRecord(md.endpoints) && Array.isArray(md.endpoints.available)) {
        selected = md.endpoints.available.find(e => e && e.selected === true);
    }
    const okAttempt = names.length ? names[names.length - 1] : '';
    const provider = (selected && typeof selected.provider === 'string' && selected.provider)
        || okAttempt
        || (typeof md.attempt === 'object' && md.attempt && typeof md.attempt.provider === 'string' ? md.attempt.provider : '')
        || '';
    return { provider, attempts: names };
}

// chunk 顶层直接带 provider（OpenRouter/Cline 兼容流式场景）
function normalizeDirectProvider(node) {
    const p = node.provider;
    if (typeof p === 'string' && p) return { provider: p, attempts: [] };
    if (isRecord(p)) {
        const n = (typeof p.name === 'string' && p.name) || (typeof p.id === 'string' && p.id) || '';
        if (n) return { provider: n, attempts: [] };
    }
    return null;
}

// 递归收集（限深16 + seen 防循环），取最后找到的路由对象
function collectRoutingObjects(node, out, depth, seen) {
    if (!isRecord(node) || depth > 16 || seen.has(node)) return;
    seen.add(node);
    if (isRecord(node.openrouter_metadata)) out.push(normalizeOpenRouterMetadata(node.openrouter_metadata));
    const d = normalizeDirectProvider(node);
    if (d) out.push(d);
    if (typeof node.finalProvider === 'string' && node.finalProvider) out.push({ provider: node.finalProvider, attempts: [] });
    if (typeof node.resolvedProvider === 'string' && node.resolvedProvider) out.push({ provider: node.resolvedProvider, attempts: [] });
    for (const k in node) {
        try { collectRoutingObjects(node[k], out, depth + 1, seen); } catch (e) { }
    }
}

// 从响应全文提取：整段 JSON 或 SSE 逐行 data:{...}
function extractRoutingMetadata(text) {
    const candidates = [];
    try { const j = JSON.parse(text); if (isRecord(j)) candidates.push(j); } catch (e) { }
    const re = /^\s*data:\s*(\{.*\})\s*$/;
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(re);
        if (m) { try { const j = JSON.parse(m[1]); if (isRecord(j)) candidates.push(j); } catch (e) { } }
    }
    const routes = [];
    const seen = new Set();
    for (const c of candidates) collectRoutingObjects(c, routes, 0, seen);
    return routes.length ? routes[routes.length - 1] : null;
}

function normName(v) { return String(v || '').toLowerCase().replace(/[\s_-]+/g, ''); }

// 响应侧入口：解析 + 存储 + 通知 UI 刷新 + 可选不符提醒
export function inspectResponse(text, model) {
    try {
        const st = s();
        const route = extractRoutingMetadata(String(text || ''));
        const expected = st.clineProviderEnabled ? String(st.clineProvider || '') : '';
        if (!route || !route.provider) {
            // 网关未回传路由元数据（如 New API 类中转会剥掉）→ 诚实显示暂无数据
            window.__kimiRouteInfo = { provider: '', attempts: [], time: Date.now(), model: String(model || ''), unknown: true };
        } else {
            window.__kimiRouteInfo = {
                provider: route.provider,
                attempts: route.attempts || [],
                time: Date.now(),
                model: String(model || ''),
                unknown: false,
                matched: !expected || normName(route.provider) === normName(expected),
            };
            console.log('[余温工具箱] 本次Cline路由:', route.provider, '| 尝试:', (route.attempts || []).join(' → ') || '1次', '| 模型:', model);
            if (st.clineRouteAlert && expected && window.__kimiRouteInfo.matched === false) {
                try { toastr.warning('实际上游 ' + route.provider + ' 与指定 ' + expected + ' 不符', 'Cline 路由', { timeOut: 6000 }); } catch (e) { }
            }
        }
        try { if (typeof window.__kimiRouteUpdated === 'function') window.__kimiRouteUpdated(); } catch (e) { }
        return window.__kimiRouteInfo;
    } catch (e) { console.warn('[余温工具箱] 路由解析失败:', e); return null; }
}

// 调试出口
window.__kimiRouteDebug = {
    info: () => window.__kimiRouteInfo || null,
    injectRouteProbe, shouldProbe, inspectResponse, extractRoutingMetadata,
};
