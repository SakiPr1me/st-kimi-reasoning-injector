// ===== API 池（额度轮换）=====
// 多号党场景：Custom(OpenAI兼容) 连接列表，命中 limit 类错误时横幅询问/自动切换到下一条，
// 切换 = 只改 custom_url + api_key_custom + custom_model 三个值，预置/采样/其它参数一概不动。
// ⚠️ 密钥以明文存 settings.json（酒馆 secret 是全局单值，无法存多份，只能在池里各存一份）。

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders } from "../../../../script.js";
import { oai_settings, chat_completion_sources } from "../../../openai.js";
import { writeSecret, findSecret } from "../../../secrets.js";
import { t } from "./index.js"; // 三语文案（函数声明循环引用安全，仅运行期调用）

const KEY = 'api_pool';
if (!extension_settings[KEY]) extension_settings[KEY] = {};
const settings = extension_settings[KEY];
if (!Array.isArray(settings.pool)) settings.pool = [];
if (settings.enabled === undefined) settings.enabled = false;
if (settings.autoSwitch === undefined) settings.autoSwitch = false;
if (!settings.keywords || !String(settings.keywords).trim()) settings.keywords = 'limit,quota,rate';
if (settings.showMenuBtn === undefined) settings.showMenuBtn = false; // 左下角拓展菜单入口（默认关）

// 生成中才检测（防误触其他请求/非生成报错）
let generating = false;
let lastLimitHit = 0;
let bannerRef = null;

eventSource.on(event_types.GENERATION_STARTED, () => { generating = true; });
eventSource.on(event_types.GENERATION_ENDED, () => { generating = false; });
eventSource.on(event_types.GENERATION_STOPPED, () => { generating = false; });

function matchKeywords(text) {
    const arr = String(settings.keywords || 'limit').split(',').map(k => k.trim()).filter(Boolean);
    const t = String(text || '').toLowerCase();
    return arr.some(k => k && t.includes(k.toLowerCase()));
}

function norm(u) { return String(u || '').trim().replace(/\/+$/, ''); }

function isCustomSource() {
    return oai_settings?.chat_completion_source === chat_completion_sources?.CUSTOM;
}

function currentIndex() {
    const cur = norm(oai_settings?.custom_url);
    const curModel = String(oai_settings?.custom_model || '').trim();
    // 优先「URL+模型」都匹配（同 URL 不同模型的池记录能精确定位当前行）；
    // 池记录没填模型（切它时不动 custom_model）→ 只按 URL 兜底匹配第一条；
    // 全无匹配回退纯 URL 匹配（兼容自定义模型名不在池里记录等场景）
    let idx = settings.pool.findIndex(e => e.url && norm(e.url) === cur && e.model && String(e.model).trim() && String(e.model).trim() === curModel);
    if (idx < 0) idx = settings.pool.findIndex(e => e.url && norm(e.url) === cur && !(e.model && String(e.model).trim()));
    if (idx < 0) idx = settings.pool.findIndex(e => e.url && norm(e.url) === cur);
    return idx;
}

function validEntries() {
    return settings.pool.filter(e => e.url && norm(e.url));
}

// "下一条"仅在池里有 ≥2 条有效接口时才存在（只有1条时切自己毫无意义）
function findNext() {
    const ents = validEntries();
    if (ents.length < 2) return null;
    const idx = currentIndex();
    return ents[(idx + 1) % ents.length];
}

async function doSwitch(entry, { auto = false } = {}) {
    try {
        // 1) URL
        oai_settings.custom_url = norm(entry.url);
        try { $('#custom_api_url_text').val(norm(entry.url)).trigger('input'); } catch (e) { /* 输入框可能不存在 */ }
        // 2) 模型名（Custom 连接的手动模型输入框）
        if (entry.model) {
            oai_settings.custom_model = entry.model;
            try { $('#custom_model_id').val(entry.model).trigger('input'); } catch (e) { /* 输入框可能不存在 */ }
        }
        saveSettingsDebounced();
        // 先刷新界面（金框跟到新当前行），再做较慢的密钥写入与连接触发——密钥慢/失败也不影响界面状态
        refreshCurrentIndicator();
        // 3) 密钥（该条没填则不碰现有 secret）
        if (entry.key) {
            await writeSecret('api_key_custom', entry.key, 'Custom API');
        }
        // 等效用户手点一次「连接」按钮（ST 自己切源也是这么触发的）：
        // 让新的 URL/密钥/模型立刻生效并测试连通，不改兼容 OpenAI/聊天补全等任何其它设置
        if (isCustomSource()) {
            setTimeout(() => { try { $('#api_button_openai').trigger('click'); } catch (e) { } }, 300);
        }
        updateApiMenuItem(); // 菜单标签显示“下一条是谁”，切换后刷新（界面金框已在上方刷新过，不重复渲）
        const n = validEntries().indexOf(entry); // 编号与 total 同口径（只数有效条目，池中混空条目不错位）
        const total = validEntries().length;
        const label = entry.model || norm(entry.url);
        const msg = String(t('apiSwitched')).replace('{name}', label).replace('{n}', n + 1).replace('{total}', total);
        try { toastr.success(msg, 'API \u989d\u5ea6', { timeOut: 3000 }); } catch (e) { }
        console.log('[API池] ' + msg + (auto ? '（自动切换）' : ''));
    } catch (e) {
        console.warn('[API池] 切换失败:', e);
        try { toastr.error('切换失败：' + String(e && e.message || e)); } catch (e2) { }
    }
}

// 常驻横幅：直到切换或点 ✕ 关闭
function showBanner(next) {
    try {
        if (bannerRef) toastr.clear(bannerRef, true);
        const total = validEntries().length;
        const n = validEntries().indexOf(next) + 1;
        const label = next.model || norm(next.url);
        const switchBtn = `<button class="kimi-api-banner-btn menu_button" style="margin-left:8px;display:inline-block;width:auto">${String(t('apiBannerSwitch')).replace('{name}', label).replace('{n}', n).replace('{total}', total)}</button>`;
        const msg = String(t('apiBannerMsg')).replace('{name}', label) + ' ' + switchBtn;
        bannerRef = toastr.error(msg, 'API \u989d\u5ea6', {
            timeOut: 0, extendedTimeOut: 0, closeButton: true, escapeHtml: false,
            onHidden: () => { bannerRef = null; },
        });
        // 按钮事件：挂到当前横幅 DOM
        const $banner = $(bannerRef.el || bannerRef);
        $banner.find('.kimi-api-banner-btn').on('click', async () => { await doSwitch(next); toastr.clear(bannerRef, true); });
    } catch (e) { console.warn('[API池] 横幅失败:', e); }
}

function handleLimitHit(reason) {
    const now = Date.now();
    if (now - lastLimitHit < 20000) return; // 20 秒冷却，防连环弹
    lastLimitHit = now;
    if (!settings.enabled || !generating) return;
    if (!isCustomSource()) {
        try { toastr.warning(String(t('apiNotCustom')), 'API \u989d\u5ea6', { timeOut: 3000 }); } catch (e) { }
        return;
    }
    const next = findNext();
    if (!next) {
        const msg = validEntries().length ? t('apiOnlyOne') : t('apiNoPool');
        try { toastr.warning(String(msg), 'API \u989d\u5ea6', { timeOut: 3000 }); } catch (e) { }
        return;
    }
    console.log('[API池] 检测到 limit 类错误 → ' + (settings.autoSwitch ? '自动切换' : '询问') + '：' + reason);
    if (settings.autoSwitch) {
        doSwitch(next, { auto: true });
    } else {
        showBanner(next);
    }
}

// 响应侧钩子（index.js fetch 包装器调用）
async function onResponse(res) {
    try {
        if (!settings.enabled || !generating || res.ok) return;
        const text = await res.clone().text();
        if (matchKeywords(text)) handleLimitHit(text.slice(0, 200));
    } catch (e) { /* 读体失败静默 */ }
}
window.__apiPoolOnResponse = onResponse;

// toastr 红字兜底（SSE 流内错误最终也走 toastr.error）
(function patchToastr() {
    if (window.__apiPoolToastPatched) return;
    window.__apiPoolToastPatched = true;
    if (typeof toastr === 'undefined' || !toastr.error) return;
    const orig = toastr.error;
    toastr.error = function (msg, title, opts) {
        try {
            if (settings.enabled && generating && matchKeywords(String(msg))) handleLimitHit(String(msg).slice(0, 200));
        } catch (e) { }
        return orig.apply(this, arguments);
    };
})();

// ---- 扩展菜单「⇄ 切换API」入口（可选，与标签修复入口同款模式） ----
function updateApiMenuItem() {
    $('#kimi_api_menu_item').remove();
    if (!settings.showMenuBtn) return;
    const $menu = $('#extensionsMenu');
    if (!$menu.length) { const tries = (updateApiMenuItem._r || 0) + 1; if (tries <= 5) { updateApiMenuItem._r = tries; setTimeout(updateApiMenuItem, 1500); } return; } // 菜单未就绪稍后重试（上限5次防堆积）
    const next = findNext();
    const label = next ? (next.model || norm(next.url)) : '';
    const text = String(t('apiMenuSwitch')) + (label ? ` → ${label}` : ''); // 图标已由 <i> 提供，文字不再带 ⇄
    $menu.append(`<a id="kimi_api_menu_item" class="list-group-item" href="#" title="${t('apiMenuSwitch')}">
        <i class="fa-solid fa-key"></i> ${text}
    </a>`);
    $('#kimi_api_menu_item').on('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        $('#extensionsMenu').fadeOut(200);
        const nx = findNext();
        if (!nx) {
            const msg = validEntries().length ? t('apiOnlyOne') : t('apiNoPool');
            try { toastr.warning(String(msg), 'API \u989d\u5ea6', { timeOut: 3000 }); } catch (err) { }
            return;
        }
        await doSwitch(nx);
    });
}
// 供余温工具箱「基础设置·快捷入口」面板刷新菜单项（v1.37.17：开关已统一搬去基础设置）
window.__apiPoolMenuRefresh = updateApiMenuItem;

// ---- 设置卡 UI ----
let mountedSlot = ''; // 重渲染列表时恢复当前行高亮需知道挂载点

function rowHTML(e, i) {
    const curStyle = (currentIndex() === i)
        ? 'border:1.5px solid var(--golden-color,#e0a800)!important;background:rgba(224,168,0,.07)'
        : 'border:1px solid rgba(128,128,128,.2)';
    // 固定两行布局（电脑手机同构，任何宽度都不会溢出）：
    //   第一行 = 模型名 + URL；第二行 = 密钥 + 天数 + 切换 + 删除
    // 弹性项全部 min-width:0 允许收缩；按钮固定不缩；天数超长省略号
    return `
    <div class="kimi-api-row" style="display:block;${curStyle};border-radius:6px;padding:5px 6px;margin-top:5px">
        <div class="kimi-api-l1" style="display:flex;gap:6px;align-items:center;width:100%;min-width:0">
            <input type="text" class="kimi-api-model text_pole" data-i="${i}" value="${escHtml(e.model || '')}" placeholder="${t('apiModel')}" style="width:32%;min-width:60px"/>
            <button class="kimi-api-fetch kimi-btn kimi-api-btn-sm" data-i="${i}" title="${t('apiFetchModels')}" style="flex:none">${t('apiFetchBtn')}</button>
            <input type="text" class="kimi-api-url text_pole" data-i="${i}" value="${escHtml(e.url || '')}" placeholder="https://.../v1" style="flex:1;min-width:0"/>
        </div>
        <div class="kimi-api-l2" style="display:flex;gap:6px;align-items:center;width:100%;min-width:0;margin-top:4px">
            <input type="password" class="kimi-api-key text_pole" data-i="${i}" value="${escHtml(e.key || '')}" placeholder="${t('apiKey')}" style="width:34%;min-width:64px"/>
            <span class="kimi-api-age" title="${ageText(e.addedAt)}" style="font-size:.72em;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:26%">${ageText(e.addedAt)}</span>
            <button class="kimi-api-switch kimi-btn kimi-api-btn-sm" data-i="${i}" title="${t('apiSwitchTo')}" style="margin-left:auto">⇄</button>
            <button class="kimi-api-del kimi-btn kimi-api-btn-sm" data-i="${i}" title="${t('apiDel')}">✕</button>
        </div>
        <div class="kimi-api-models" data-i="${i}" style="display:none;margin-top:4px;border:1px solid rgba(128,128,128,.25);border-radius:6px;max-height:180px;overflow-y:auto"></div>
    </div>`;
}

// 手机自适应样式（挂一次）
function ensureApiRespStyle() {
    if (document.getElementById('kimi-api-resp-style')) return;
    const st = document.createElement('style');
    st.id = 'kimi-api-resp-style';
    st.textContent = '.kimi-api-row input{padding:4px 6px!important;height:auto;font-size:.9em}' +
        '.kimi-api-btn-sm{padding:3px 9px!important;font-size:.85em!important;white-space:nowrap;flex:none}';
    document.head.appendChild(st);
}

function poolHTML() {
    const rows = settings.pool.map((e, i) => rowHTML(e, i)).join('');
    return `
    <details class="kimi-card">
    <summary><i class="fa-solid fa-plug kimi-card-ico" aria-hidden="true"></i>${t('apiTitle')}</summary>
    <div class="kimi-card-body">
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:2px">
            <label class="checkbox_label" style="margin:0"><input type="checkbox" id="kimi_api_enabled" ${settings.enabled ? 'checked' : ''}/> ${t('apiEnabled')}</label>
            <label class="checkbox_label" style="margin:0"><input type="checkbox" id="kimi_api_auto" ${settings.autoSwitch ? 'checked' : ''}/> ${t('apiAuto')}</label>
        </div>
        <div style="margin-top:5px">
            <label class="kimi-label" for="kimi_api_keywords">${t('apiKeywords')}</label>
            <input id="kimi_api_keywords" type="text" class="text_pole" style="width:100%;box-sizing:border-box" value="${escHtml(settings.keywords)}"/>
        </div>
        <div id="kimi_api_list" style="margin-top:5px">${rows || '<span style="opacity:.5;font-size:.85em">' + t('apiNoPool') + '</span>'}</div>
        <div style="margin-top:5px"><button id="kimi_api_add" class="kimi-btn">${t('apiAdd')}</button></div>
        <p class="kimi-hint">${t('apiHint')}</p>
    </div>
    </details>`;
}

function ageText(addedAt) {
    if (!addedAt) return '';
    const ms = Date.now() - Number(addedAt);
    if (!Number.isFinite(ms) || ms < 0) return '';
    const h = Math.floor(ms / 3600000);
    const d = Math.floor(h / 24);
    return String(t('apiAge')).replace('{d}', d).replace('{h}', h % 24);
}

function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function refreshCurrentIndicator() {
    // 当前行重渲染（金色边框 + *当前 标记与切换联动；renderList 内部自带边框判定）
    renderList(mountedSlot);
}

// ===== 「📋 获取可用模型」：按行内 url(+key) 拉模型列表，点选填入模型名 =====
// 复用 ST 官方 status 接口（与「连接」按钮同一后端）：POST /api/backends/chat-completions/status
// 返回 { data: [{ id, ... }, ...] }。key 优先用行内填的；没填则回退当前已保存的 custom key。
async function fetchModelsForRow(i) {
    const e = settings.pool[i];
    if (!e) return null;
    const url = norm(e.url);
    if (!url) {
        try { toastr.warning(t('apiModelEmpty'), 'API 额度', { timeOut: 3000 }); } catch (e2) { }
        return null;
    }
    // 行内有 key 且与当前 secret 不同 → 临时写入（拉完恢复，避免污染当前连接）
    let prevKey = null;
    try { prevKey = await findSecret('api_key_custom'); } catch (e) { }
    const needSwap = e.key && String(e.key).trim() && String(e.key).trim() !== String(prevKey || '');
    if (needSwap) {
        try { await writeSecret('api_key_custom', e.key, 'Custom API'); } catch (e) { }
    }
    try {
        const data = {
            chat_completion_source: 'custom',
            custom_url: url,
            custom_include_headers: oai_settings?.custom_include_headers || '',
        };
        const resp = await fetch('/api/backends/chat-completions/status', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(data),
            cache: 'no-cache',
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const j = await resp.json().catch(() => null);
        if (j && Array.isArray(j.data)) {
            return j.data
                .map(m => (m && typeof m === 'object') ? (m.id ?? m.name ?? '') : String(m))
                .map(s => String(s).trim()).filter(Boolean);
        }
        return [];
    } catch (err) {
        try { toastr.error(String(t('apiModelErr')) + '：' + String(err && err.message || err), 'API 额度', { timeOut: 4000 }); } catch (e2) { }
        return null;
    } finally {
        if (needSwap && prevKey) {
            try { await writeSecret('api_key_custom', prevKey, 'Custom API'); } catch (e) { }
        }
    }
}

// 展开/刷新某行的模型下拉（不重复请求：已展开且有内容则直接显示）
async function toggleModelsDropdown(i) {
    const e = settings.pool[i];
    if (!e) return;
    // 收起其它行下拉
    document.querySelectorAll('.kimi-api-models').forEach(d => { if (Number(d.getAttribute('data-i')) !== i) { d.style.display = 'none'; d.innerHTML = ''; } });
    const box = document.querySelector(`.kimi-api-models[data-i="${i}"]`);
    if (!box) return;
    if (box.style.display === 'block' && box.innerHTML.trim()) { box.style.display = 'none'; box.innerHTML = ''; return; } // 再点收起
    // 请求中
    box.style.display = 'block';
    box.innerHTML = '<div style="padding:6px;opacity:.6;font-size:.85em">' + t('apiModelsLoading') + '</div>';
    const models = await fetchModelsForRow(i);
    if (models === null) { box.style.display = 'none'; box.innerHTML = ''; return; } // 错误已 toastr
    if (!models.length) {
        box.innerHTML = '<div style="padding:6px;opacity:.6;font-size:.85em">' + t('apiModelEmpty') + '</div>';
        return;
    }
    box.innerHTML = models.map(m =>
        `<div class="kimi-api-model-opt" data-i="${i}" data-model="${escHtml(m)}" style="padding:3px 8px;cursor:pointer;font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(m)}">${escHtml(m)}</div>`
    ).join('');
}

// 收起所有模型下拉（点行外/切换聊天等）
function closeAllModelsDropdown() {
    document.querySelectorAll('.kimi-api-models').forEach(d => { d.style.display = 'none'; d.innerHTML = ''; });
}


function renderList(slotSel) {
    // 刷新所有 #kimi_api_list：面板重建会在 slot 挂新卡，而旧卡可能仍被移入悬浮窗 → 两份并存，
    // getElementById 只取第一份会让另一份黄框不跟随（真 bug）。全量遍历刷新。
    document.querySelectorAll('#kimi_api_list').forEach(list => {
        list.innerHTML = settings.pool.map((e, i) => rowHTML(e, i)).join('') || '<span style="opacity:.5;font-size:.85em">' + t('apiNoPool') + '</span>';
    });
}

export function mountApiPoolCard(slotSel) {
    mountedSlot = slotSel;
    ensureApiRespStyle();
    const slot = document.querySelector(slotSel);
    if (!slot) return;
    slot.innerHTML = poolHTML();

    $('#kimi_api_enabled').on('change', function () { settings.enabled = this.checked; saveSettingsDebounced(); });
    $('#kimi_api_auto').on('change', function () { settings.autoSwitch = this.checked; saveSettingsDebounced(); });
    $('#kimi_api_keywords').on('input', function () { settings.keywords = $(this).val(); saveSettingsDebounced(); });

    updateApiMenuItem();

    $('#kimi_api_add').on('click', function () {
        settings.pool.push({ id: Date.now(), model: '', url: '', key: '', addedAt: Date.now() });
        saveSettingsDebounced();
        renderList(slotSel);
        updateApiMenuItem();
    });

    // 列表事件委托（增删改都走这里，重渲染后依然有效；document 级覆盖所有 #kimi_api_list，
    // 含被移入悬浮窗的旧卡——主界面与悬浮框两份并存时切换/删除都生效）。
    // 防重复：document 级委托 + data 标志，语言切换/重挂多次调用只绑一次。
    if (!$(document).data('kimiApiDelegated')) {
        $(document).data('kimiApiDelegated', true);
        $(document).on('input', '#kimi_api_list .kimi-api-model, #kimi_api_list .kimi-api-url, #kimi_api_list .kimi-api-key', function () {
            const i = Number($(this).attr('data-i'));
            const e = settings.pool[i];
            if (!e) return;
            if ($(this).hasClass('kimi-api-model')) e.model = $(this).val();
            else if ($(this).hasClass('kimi-api-url')) e.url = $(this).val();
            else e.key = $(this).val();
            saveSettingsDebounced();
        });
        $(document).on('click', '#kimi_api_list .kimi-api-switch', function () {
            const e = settings.pool[Number($(this).attr('data-i'))];
            if (e) doSwitch(e);
        });
        $(document).on('click', '#kimi_api_list .kimi-api-del', function () {
            const i = Number($(this).attr('data-i'));
            settings.pool.splice(i, 1);
            saveSettingsDebounced();
            updateApiMenuItem();
            renderList(); // 只重渲染列表；整卡重挂是重复绑定的源头，不再使用
        });
    }
    // 📋 获取可用模型委托——独立命名空间 + off 防重复（不依赖 kimiApiDelegated：
    // 旧缓存实例可能已设该标志但无 fetch handler → 新实例需总能绑上）。
    $(document).off('click.kimiApiFetch').on('click.kimiApiFetch', '#kimi_api_list .kimi-api-fetch', function () {
        const i = Number($(this).attr('data-i'));
        toggleModelsDropdown(i);
    });
    $(document).off('click.kimiApiModelOpt').on('click.kimiApiModelOpt', '#kimi_api_list .kimi-api-model-opt', function () {
        const i = Number($(this).attr('data-i'));
        const m = $(this).attr('data-model');
        const e = settings.pool[i];
        if (e && m) {
            e.model = m;
            saveSettingsDebounced();
            // 同步该行 model 输入框（不整卡重渲染，避免下拉闪烁/丢焦点）
            const inp = document.querySelector(`#kimi_api_list .kimi-api-model[data-i="${i}"]`);
            if (inp) inp.value = m;
        }
        closeAllModelsDropdown();
    });
    // 点行外任意处收起所有模型下拉
    $(document).off('click.kimiApiCloseModels').on('click.kimiApiCloseModels', function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest('.kimi-api-fetch, .kimi-api-models, .kimi-api-model-opt')) return;
        closeAllModelsDropdown();
    });
}

// 调试出口（CDP 测试用）
window.__apiPoolDebug = { updateApiMenuItem,
  doSwitch, findNext, handleLimitHit, matchKeywords, settings, ageText, renderList,
  toggleModelsDropdown, fetchModelsForRow, closeAllModelsDropdown,
  setGenerating: (v) => { generating = !!v; },
  simulateLimit: (reason) => { generating = true; handleLimitHit(reason || 'limit reached'); generating = false; },
  currentIndex, isCustomSource,
};