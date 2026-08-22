// ===== API 池（额度轮换）=====
// 多号党场景：Custom(OpenAI兼容) 连接列表，命中 limit 类错误时横幅询问/自动切换到下一条，
// 切换 = 只改 custom_url + api_key_custom + custom_model 三个值，预置/采样/其它参数一概不动。
// ⚠️ 密钥以明文存 settings.json（酒馆 secret 是全局单值，无法存多份，只能在池里各存一份）。

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
import { oai_settings, chat_completion_sources } from "../../../openai.js";
import { writeSecret } from "../../../secrets.js";
import { t } from "./index.js"; // 三语文案（函数声明循环引用安全，仅运行期调用）

const KEY = 'api_pool';
if (!extension_settings[KEY]) extension_settings[KEY] = {};
const settings = extension_settings[KEY];
if (!Array.isArray(settings.pool)) settings.pool = [];
if (settings.enabled === undefined) settings.enabled = false;
if (settings.autoSwitch === undefined) settings.autoSwitch = false;
if (!settings.keywords || !String(settings.keywords).trim()) settings.keywords = 'limit,quota,rate';
if (settings.showMenuBtn === undefined) settings.showMenuBtn = true;

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
    const idx = settings.pool.findIndex(e => e.url && norm(e.url) === cur);
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
        // 3) 密钥（该条没填则不碰现有 secret）
        if (entry.key) {
            await writeSecret('api_key_custom', entry.key, 'Custom API');
        }
        // 等效用户手点一次「连接」按钮（ST 自己切源也是这么触发的）：
        // 让新的 URL/密钥/模型立刻生效并测试连通，不改兼容 OpenAI/聊天补全等任何其它设置
        if (isCustomSource()) {
            setTimeout(() => { try { $('#api_button_openai').trigger('click'); } catch (e) { } }, 300);
        }
        refreshCurrentIndicator();
        updateApiMenuItem(); // 菜单标签显示“下一条是谁”，切换后刷新
        const n = settings.pool.findIndex(e => e === entry);
        const total = settings.pool.filter(e => e.url && norm(e.url)).length;
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
        const total = settings.pool.filter(e => e.url && norm(e.url)).length;
        const n = settings.pool.indexOf(next) + 1;
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
    if (!$menu.length) { setTimeout(updateApiMenuItem, 1500); return; } // 菜单未就绪则稍后重试
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

// ---- 设置卡 UI ----
let mountedSlot = ''; // 重渲染列表时恢复当前行高亮需知道挂载点

function rowHTML(e, i, cur) {
    const curStyle = (currentIndex() === i)
        ? 'border:1px solid var(--golden-color,#e0a800)!important;background:rgba(224,168,0,.07)'
        : 'border:1px solid rgba(128,128,128,.2)';
    // 两段式行：l1=模型名+URL（主信息），l2=密钥+天数+操作。
    // 桌面一行排开；≤700px 媒体查询把 l1/l2 各占整行 → 手机上整齐两行不参差
    return `
    <div class="kimi-api-row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px;${curStyle};border-radius:4px;padding:5px">
        <span class="kimi-api-l1" style="display:inline-flex;gap:6px;align-items:center;flex:2;min-width:0">
            <input type="text" class="kimi-api-model" data-i="${i}" value="${escHtml(e.model || '')}" placeholder="${t('apiModel')}" style="width:130px"/>
            <input type="text" class="kimi-api-url" data-i="${i}" value="${escHtml(e.url || '')}" placeholder="https://.../v1" style="flex:1;min-width:120px"/>
        </span>
        <span class="kimi-api-l2" style="display:inline-flex;gap:6px;align-items:center;flex:1;min-width:0">
            <input type="password" class="kimi-api-key" data-i="${i}" value="${escHtml(e.key || '')}" placeholder="${t('apiKey')}" style="width:130px"/>
            <span style="opacity:.6;font-size:.8em;white-space:nowrap">${ageText(e.addedAt)}</span>${cur}
            <button class="kimi-api-switch kimi-btn" data-i="${i}">${t('apiSwitchTo')}</button>
            <button class="kimi-api-del kimi-btn" data-i="${i}">${t('apiDel')}</button>
        </span>
    </div>`;
}

// 手机自适应样式（挂一次）
function ensureApiRespStyle() {
    if (document.getElementById('kimi-api-resp-style')) return;
    const st = document.createElement('style');
    st.id = 'kimi-api-resp-style';
    st.textContent = '@media(max-width:700px){' +
        '.kimi-api-l1,.kimi-api-l2{display:flex!important;width:100%}' +
        '.kimi-api-l1 .kimi-api-model{flex:0 0 40%;width:auto}' +
        '.kimi-api-l1 .kimi-api-url{flex:1}' +
        '.kimi-api-l2 .kimi-api-key{flex:1;width:auto;min-width:90px}' +
        '}';
    document.head.appendChild(st);
}

function poolHTML() {
    const rows = settings.pool.map((e, i) => {
        const cur = currentIndex() === i ? ` <span class="kimi-api-cur" style="color:var(--golden-color,#e0a800)">*${t('apiCurrent')}</span>` : '';
        return rowHTML(e, i, cur);
    }).join('');
    return `
    <details class="kimi-card">
    <summary><i class="fa-solid fa-plug kimi-card-ico" aria-hidden="true"></i>${t('apiTitle')}</summary>
    <div class="kimi-card-body">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
            <label class="checkbox_label" style="margin:0"><input type="checkbox" id="kimi_api_enabled" ${settings.enabled ? 'checked' : ''}/> ${t('apiEnabled')}</label>
            <label class="checkbox_label" style="margin:0"><input type="checkbox" id="kimi_api_auto" ${settings.autoSwitch ? 'checked' : ''}/> ${t('apiAuto')}</label>
            <label class="checkbox_label" style="margin:0"><input type="checkbox" id="kimi_api_menu_entry" ${settings.showMenuBtn ? 'checked' : ''}/> ${t('apiMenuEntry')}</label>
        </div>
        <div style="margin-top:5px">
            <label class="kimi-label" for="kimi_api_keywords">${t('apiKeywords')}</label>
            <input id="kimi_api_keywords" type="text" class="text_pole" style="width:100%;box-sizing:border-box" value="${escHtml(settings.keywords)}"/>
        </div>
        <div id="kimi_api_list" style="margin-top:5px">${rows || '<span style="opacity:.5;font-size:.85em">' + t('apiNoPool') + '</span>'}</div>
        <div style="margin-top:5px"><button id="kimi_api_add" class="menu_button" style="display:inline-block;width:auto">${t('apiAdd')}</button></div>
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

function renderList(slotSel) {
    const list = document.getElementById('kimi_api_list');
    if (list) list.innerHTML = settings.pool.map((e, i) => {
        const cur = currentIndex() === i ? ` <span class="kimi-api-cur" style="color:var(--golden-color,#e0a800)">*${t('apiCurrent')}</span>` : '';
        return rowHTML(e, i, cur);
    }).join('') || '<span style="opacity:.5;font-size:.85em">' + t('apiNoPool') + '</span>';
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

    $('#kimi_api_menu_entry').on('change', function () {
        settings.showMenuBtn = this.checked;
        saveSettingsDebounced();
        updateApiMenuItem();
    });
    updateApiMenuItem();

    $('#kimi_api_add').on('click', function () {
        settings.pool.push({ id: Date.now(), model: '', url: '', key: '', addedAt: Date.now() });
        saveSettingsDebounced();
        renderList(slotSel);
        updateApiMenuItem();
    });

    // 列表事件委托（增删改都走这里，重渲染后依然有效）
    $('#kimi_api_list').on('input', '.kimi-api-model, .kimi-api-url, .kimi-api-key', function () {
        const i = Number($(this).attr('data-i'));
        const e = settings.pool[i];
        if (!e) return;
        if ($(this).hasClass('kimi-api-model')) e.model = $(this).val();
        else if ($(this).hasClass('kimi-api-url')) e.url = $(this).val();
        else e.key = $(this).val();
        saveSettingsDebounced();
    });
    $('#kimi_api_list').on('click', '.kimi-api-switch', function () {
        const e = settings.pool[Number($(this).attr('data-i'))];
        if (e) doSwitch(e);
    });
    $('#kimi_api_list').on('click', '.kimi-api-del', function () {
        const i = Number($(this).attr('data-i'));
        settings.pool.splice(i, 1);
        saveSettingsDebounced();
        updateApiMenuItem();
        mountApiPoolCard(slotSel); // 整卡重挂保持简单可靠
    });
}

// 调试出口（CDP 测试用）
window.__apiPoolDebug = { updateApiMenuItem,
  doSwitch, findNext, handleLimitHit, matchKeywords, settings, ageText, renderList,
  setGenerating: (v) => { generating = !!v; },
  simulateLimit: (reason) => { generating = true; handleLimitHit(reason || 'limit reached'); generating = false; },
  currentIndex, isCustomSource,
};