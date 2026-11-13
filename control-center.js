/* ==========================================================================
   余小温主控 · 统一总控台
   - 只负责外壳与页面切换；模块状态、预设、角色设置全部由主模块提供。
   - 根节点 id 固定为 ywcc-root；业务卡片的样式由主模块注入到 #ywcc-root。
   - 不写业务数据；只通过 getSettings/saveSettings 保存 controlCenter.favorites/recent。
   ========================================================================== */

export const CONTROL_CENTER_VERSION = '1.3.6';
export const PANEL_SELECTOR = '#ywcc-root .ywcc-panel';

const ROOT_ID = 'ywcc-root';
const STYLE_ID = 'ywcc-style';
const MOBILE_QUERY = '(max-width: 720px), (pointer: coarse) and (max-width: 1024px)';
const PAGE_IDS = ['home', 'preset', 'modules', 'settings'];
const RECENT_LIMIT = 6;
/* 同一动作的防连点窗口：一次点击只执行一次，避免手抖双击造成有后果的操作跑两遍。 */
const ACTION_REENTRY_MS = 350;
/* 首页 hero 的商店入口文案：pending 只由主模块的只读桥决定（未就绪/失败一律 false）。 */
const STORE_ENTRY_TEXT = '条目商店';
const STORE_ENTRY_UPDATE_TEXT = '预设有更新！点我去一键缝合';

const ICONS = {
    flame: '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 1h2v2h1v2h1v2h1v3h-1v2h-1v1H6v-1H5v-2H4V8h1V6h1V4h1z"/><path fill="var(--ywcc-flame-core,#fff3db)" d="M7 6h2v2h1v3H6V9h1z"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z"/><path d="M9.5 21v-6h5v6"/></svg>',
    preset: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h14M5 9h9M5 14h14M5 19h9"/><path d="M17.5 7.5v5M15 10h5"/></svg>',
    modules: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="4" width="6" height="6" rx="1.6"/><rect x="14" y="4" width="6" height="6" rx="1.6"/><rect x="4" y="14" width="6" height="6" rx="1.6"/><rect x="14" y="14" width="6" height="6" rx="1.6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8z"/></svg>',
    starFilled: '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19.6 10.5A8 8 0 1 0 18 17"/><path d="M20 4.5v6h-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>'
};

const NAV_ITEMS = [
    { page: 'home', label: '首页', icon: 'home' },
    { page: 'preset', label: '预设', icon: 'preset' },
    { page: 'modules', label: '模块', icon: 'modules' },
    { page: 'settings', label: '设置', icon: 'settings' }
];

export function createControlCenter(options) {
    const deps = options && typeof options === 'object' ? options : {};
    const doc = deps.document || (typeof document !== 'undefined' ? document : null);
    const win = deps.window || (typeof window !== 'undefined' ? window : null);
    if (!doc || !win) throw new Error('createControlCenter 需要 document 和 window');

    const state = {
        built: false,
        open: false,
        disposed: false,
        page: 'home',
        moduleId: null,
        /* 模块详情是从哪一页进来的：只记 'home' / 'modules' 两种来源，
           返回按钮回到来源页，不写死模块列表。 */
        moduleOrigin: null,
        search: '',
        scroll: new Map(),
        pageCleanup: null,
        lastFocus: null,
        refs: {},
        root: null,
        panel: null,
        head: null,
        markEl: null,
        titleEl: null,
        subEl: null,
        backBtn: null,
        closeBtn: null,
        scrollEl: null,
        pageEl: null,
        navEl: null,
        toastEl: null,
        toastTimer: 0,
        drag: null,
        panelPos: null,
        lastPanelRect: null,
        theme: 'light',
        observer: null,
        themeTimer: 0,
        focusTimer: 0,
        vv: null,
        settingsMounts: new Map(),
        registrySig: '',
        actionRuns: new Map(),
        /* 首页整理 / 预设钉选（1.3.0）：
           - homeEdit：首页「整理首页」模式，compact 预设控件重挂时带 homeEdit；
           - pinMode：full 预设页的钉选模式，由 PC 负责选条目，完成后回调 onPin 回首页；
           - headerHost：cc 标题右侧独立宿主，PC 自己往里挂/拆按钮。 */
        homeEdit: false,
        pinMode: false,
        headerHost: null,
        schemeBusy: '',
        schemeSig: '',
        markSig: ''
    };

    function H(tag, cls, text) {
        const el = doc.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined && text !== null) el.textContent = String(text);
        return el;
    }

    function icon(name, cls) {
        const span = H('span', 'ywcc-ico' + (cls ? ' ' + cls : ''));
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = ICONS[name] || '';
        return span;
    }

    function iconButton(name, label, cls) {
        const btn = H('button', 'ywcc-icon-btn' + (cls ? ' ' + cls : ''));
        btn.type = 'button';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.appendChild(icon(name));
        return btn;
    }

    function messageOf(err) {
        const raw = err && (err.message || err.error || err);
        const text = String(raw === undefined || raw === null ? '' : raw).replace(/\s+/g, ' ').trim();
        return text ? text.slice(0, 180) : '未知原因';
    }

    function ensureStyle() {
        let link = doc.getElementById(STYLE_ID);
        if (link) return link;
        link = doc.createElement('link');
        link.id = STYLE_ID;
        link.rel = 'stylesheet';
        link.href = new URL('./control-center.css?v=' + encodeURIComponent(CONTROL_CENTER_VERSION), import.meta.url).href;
        (doc.head || doc.documentElement).appendChild(link);
        return link;
    }

    function releaseStyleIfIdle() {
        const link = doc.getElementById(STYLE_ID);
        if (!link) return;
        if (doc.querySelector('.ywcc-root, .ywcc-setting-card')) return;
        link.remove();
    }

    function getModulesSafe() {
        try {
            const fn = deps.getModules;
            if (typeof fn !== 'function') return { modules: [], error: '没有提供模块清单接口' };
            const raw = fn();
            if (!Array.isArray(raw)) return { modules: [], error: '模块清单格式不对' };
            const seen = new Set();
            const modules = [];
            for (const item of raw) {
                if (!item || typeof item !== 'object') continue;
                const id = typeof item.id === 'string' ? item.id.trim() : '';
                if (!id || seen.has(id)) continue;
                const open = typeof item.open === 'function' ? item.open : null;
                const run = typeof item.run === 'function' ? item.run : null;
                /* 显式契约：kind:'action' + run；兼容“没写 kind 但只有 run、没有 open”的旧入口。
                   两者都没有的条目直接不显示 —— 不给空入口。 */
                let kind = item.kind === 'action' ? 'action' : 'module';
                if (item.kind !== 'action' && !open && run) kind = 'action';
                if (kind === 'action' ? !run : !open) continue;
                seen.add(id);
                modules.push({
                    id,
                    label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : id,
                    category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : '其他',
                    description: typeof item.description === 'string' ? item.description.trim() : '',
                    emoji: typeof item.emoji === 'string' ? item.emoji.trim().slice(0, 8) : '',
                    kind,
                    open: kind === 'module' ? open : null,
                    run: kind === 'action' ? run : null
                });
            }
            return { modules, error: '' };
        } catch (err) {
            console.error('[余小温主控] 读取模块清单失败', err);
            return { modules: [], error: messageOf(err) };
        }
    }

    function registrySigOf(result) {
        if (result.error) return 'error:' + result.error;
        return result.modules.map(function (m) {
            return [m.id, m.label, m.category, m.description, m.emoji, m.kind, m.open ? '1' : '0', m.run ? '1' : '0'].join('\u0001');
        }).join('\u0002');
    }

    function moduleById(id) {
        if (typeof id !== 'string' || !id.trim()) return null;
        const result = getModulesSafe();
        return result.modules.find(function (m) { return m.id === id.trim(); }) || null;
    }

    function currentPresetName() {
        try {
            const fn = deps.getCurrentPreset;
            if (typeof fn !== 'function') return '';
            const value = fn();
            if (value && typeof value === 'object') {
                const name = value.name || value.label || value.title || '';
                return typeof name === 'string' ? name.trim() : '';
            }
            return typeof value === 'string' ? value.trim() : '';
        } catch (err) {
            console.error('[余小温主控] 读取当前预设失败', err);
            return '';
        }
    }

    function settingsObject() {
        try {
            const fn = deps.getSettings;
            if (typeof fn !== 'function') return null;
            const settings = fn();
            return settings && typeof settings === 'object' ? settings : null;
        } catch (err) {
            console.error('[余小温主控] 读取设置失败', err);
            return null;
        }
    }

    function listFrom(settings, key) {
        if (!settings) return [];
        const cc = settings.controlCenter;
        if (cc && typeof cc === 'object' && !Array.isArray(cc) && Array.isArray(cc[key])) {
            return cc[key].filter(function (x) { return typeof x === 'string'; });
        }
        const flat = settings['controlCenter.' + key];
        if (Array.isArray(flat)) return flat.filter(function (x) { return typeof x === 'string'; });
        return [];
    }

    function setListOn(settings, key, list) {
        if (!settings) return false;
        try {
            let cc = settings.controlCenter;
            if (!cc || typeof cc !== 'object' || Array.isArray(cc)) {
                cc = {};
                settings.controlCenter = cc;
            }
            cc[key] = list;
            return true;
        } catch (err) {
            console.error('[余小温主控] 写入设置键失败', key, err);
            return false;
        }
    }

    function sameList(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }

    /* 宿主两种保存语义：
       - saveSettingsNow：立即保存（index.js 传 ST 真实 saveSettings），刷新前不丢；
       - saveSettings：ST 的 saveSettingsDebounced（1000ms 自定义 debounce，无 flush），作为兜底。
       只调用一个，且都不带参数（宿主签名是 loopCounter）。 */
    function persist(onFailure) {
        const save = typeof deps.saveSettingsNow === 'function'
            ? deps.saveSettingsNow
            : (typeof deps.saveSettings === 'function' ? deps.saveSettings : null);
        if (!save) {
            if (typeof onFailure === 'function') onFailure(new Error('没有可用的保存接口'));
            return false;
        }
        let ret;
        try {
            ret = save();
        } catch (err) {
            console.error('[余小温主控] 保存设置失败', err);
            if (typeof onFailure === 'function') onFailure(err);
            return false;
        }
        if (ret && typeof ret.then === 'function') {
            ret.catch(function (err) {
                console.error('[余小温主控] 保存设置失败', err);
                if (typeof onFailure === 'function') onFailure(err);
            });
        }
        return true;
    }

    function flash(text) {
        if (!state.toastEl || !text) return;
        state.toastEl.textContent = text;
        state.toastEl.classList.add('is-show');
        clearTimeout(state.toastTimer);
        state.toastTimer = win.setTimeout(function () {
            if (state.toastEl) state.toastEl.classList.remove('is-show');
        }, 2600);
    }

    function noteCard(title, detail, opts) {
        opts = opts || {};
        const box = H('div', 'ywcc-note' + (opts.error ? ' is-error' : ''));
        if (title) box.appendChild(H('strong', '', title));
        if (detail) box.appendChild(H('p', 'ywcc-note-text', detail));
        if (opts.actionLabel && typeof opts.onAction === 'function') {
            const btn = H('button', 'ywcc-btn ywcc-btn-ghost', opts.actionLabel);
            btn.type = 'button';
            btn.addEventListener('click', opts.onAction);
            box.appendChild(btn);
        }
        return box;
    }

    function normalizeCleanup(ret) {
        if (typeof ret === 'function') return ret;
        if (Array.isArray(ret)) {
            const list = ret.map(normalizeCleanup).filter(Boolean);
            if (!list.length) return null;
            return function () {
                list.forEach(function (fn) {
                    try { fn(); } catch (err) { /* 单个清理失败不影响其它 */ }
                });
            };
        }
        if (ret && typeof ret === 'object') {
            /* companion.mountSettings 返回 { section, controls, sync, destroy }；
               destroy 必须优先，否则对象被当成“没有清理” ⇒ settings 面板残留。 */
            if (typeof ret.destroy === 'function') {
                return function () { ret.destroy(); };
            }
            if (typeof ret.cleanup === 'function') {
                return function () { ret.cleanup(); };
            }
        }
        return null;
    }

    function parseColor(raw) {
        const text = String(raw || '').trim();
        let match = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
        if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
        match = text.match(/^#([0-9a-f]{3,8})$/i);
        if (match) {
            let hex = match[1];
            if (hex.length === 3 || hex.length === 4) {
                hex = hex.slice(0, 3).split('').map(function (c) { return c + c; }).join('');
            }
            if (hex.length >= 6) {
                return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
            }
        }
        return null;
    }

    function luminance(rgb) {
        if (!rgb) return 0.5;
        return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    }

    function detectTheme() {
        const body = doc.body;
        const html = doc.documentElement;
        function attrDark(el) {
            if (!el || !el.getAttribute) return false;
            return el.getAttribute('data-theme') === 'dark' ||
                el.getAttribute('data-theme-mode') === 'dark' ||
                (el.classList && el.classList.contains('dark'));
        }
        if (attrDark(body) || attrDark(html)) return 'dark';
        const probe = body || html;
        let bodyColor = null;
        let tint = null;
        try {
            const cs = win.getComputedStyle(probe);
            bodyColor = parseColor(cs.getPropertyValue('--SmartThemeBodyColor'));
            tint = parseColor(cs.getPropertyValue('--SmartThemeBlurTintColor'));
        } catch (err) { /* 读不到主题变量时按浅色 */ }
        if (bodyColor && luminance(bodyColor) > 0.58) return 'dark';
        if (bodyColor && luminance(bodyColor) <= 0.58) return 'light';
        if (tint && luminance(tint) < 0.42) return 'dark';
        if (tint && luminance(tint) >= 0.42) return 'light';
        try {
            if (typeof win.matchMedia === 'function' && win.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        } catch (err) { /* 忽略 */ }
        return 'light';
    }

    function syncTheme() {
        state.theme = detectTheme();
        if (state.root) state.root.dataset.ywccTheme = state.theme;
        state.settingsMounts.forEach(function (entry) {
            if (entry.card) entry.card.dataset.ywccTheme = state.theme;
        });
    }

    function startThemeWatch() {
        if (state.observer || typeof win.MutationObserver !== 'function') return;
        const schedule = function () {
            clearTimeout(state.themeTimer);
            state.themeTimer = win.setTimeout(syncTheme, 120);
        };
        const observer = new win.MutationObserver(schedule);
        if (doc.documentElement) {
            observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme', 'data-theme-mode'] });
        }
        if (doc.body) {
            observer.observe(doc.body, { attributes: true, attributeFilter: ['style', 'class', 'data-theme', 'data-theme-mode'] });
        }
        if (doc.head) {
            observer.observe(doc.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'media', 'disabled'] });
        }
        state.observer = observer;
    }

    function isMobile() {
        try {
            if (typeof win.matchMedia === 'function') return win.matchMedia(MOBILE_QUERY).matches;
        } catch (err) { /* 忽略 */ }
        return (win.innerWidth || 0) <= 720;
    }

    function syncViewport() {
        if (!state.root) return;
        const vv = win.visualViewport;
        if (!isMobile() || !vv) {
            state.root.style.removeProperty('--ywcc-vvh');
            state.root.style.removeProperty('--ywcc-vvtop');
            return;
        }
        state.root.style.setProperty('--ywcc-vvh', Math.max(240, Math.round(vv.height)) + 'px');
        state.root.style.setProperty('--ywcc-vvtop', Math.max(0, Math.round(vv.offsetTop)) + 'px');
    }

    function buildShell() {
        if (state.built || state.disposed) return;
        ensureStyle();
        syncTheme();
        const old = doc.getElementById(ROOT_ID);
        if (old && old !== state.root) old.remove();

        const root = H('div', 'ywcc-root');
        root.id = ROOT_ID;
        root.tabIndex = -1;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'false');
        root.setAttribute('aria-label', '余温总控台');
        root.setAttribute('aria-labelledby', 'ywcc-title');
        root.setAttribute('aria-hidden', 'true');
        root.dataset.ywccTheme = state.theme;
        try { root.inert = true; } catch (err) { /* 老浏览器忽略 */ }

        const panel = H('div', 'ywcc-panel');

        const head = H('header', 'ywcc-head');
        head.dataset.ywccDrag = '1';
        const backBtn = iconButton('back', '返回首页', 'ywcc-back');
        backBtn.hidden = true;
        const mark = H('span', 'ywcc-mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.innerHTML = ICONS.flame;
        const headText = H('div', 'ywcc-head-text');
        const title = H('h2', 'ywcc-title', '余温总控台');
        title.id = 'ywcc-title';
        const sub = H('p', 'ywcc-sub', '');
        headText.append(title, sub);
        /* 标题右侧独立宿主：只给 PC 放「编辑布局/取消钉选」，cc 不碰里面的节点。 */
        const headTools = H('div', 'ywcc-head-tools');
        headTools.setAttribute('data-ywcc-head-tools', '');
        headTools.setAttribute('data-ywcc-nodrag', '');
        const closeBtn = iconButton('close', '关闭统一总控台', 'ywcc-close');
        head.append(backBtn, mark, headText, headTools, closeBtn);

        const body = H('div', 'ywcc-body');
        const scroll = H('div', 'ywcc-scroll');
        scroll.tabIndex = -1;
        const pageEl = H('div', 'ywcc-page-root');
        scroll.appendChild(pageEl);
        body.appendChild(scroll);

        const nav = H('nav', 'ywcc-nav');
        nav.setAttribute('aria-label', '总控台分页');
        const navButtons = [];
        NAV_ITEMS.forEach(function (item) {
            const btn = H('button', 'ywcc-nav-item');
            btn.type = 'button';
            btn.dataset.ywccNav = item.page;
            btn.appendChild(icon(item.icon));
            btn.appendChild(H('span', '', item.label));
            btn.addEventListener('click', function () {
                if (item.page === 'modules' && state.page === 'modules' && state.moduleId) open('modules');
                else open(item.page);
            });
            nav.appendChild(btn);
            navButtons.push(btn);
        });

        const toast = H('div', 'ywcc-toast');
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        panel.append(head, body, nav, toast);
        root.appendChild(panel);
        (doc.body || doc.documentElement).appendChild(root);

        state.root = root;
        state.panel = panel;
        state.head = head;
        state.markEl = mark;
        state.titleEl = title;
        state.subEl = sub;
        state.backBtn = backBtn;
        state.closeBtn = closeBtn;
        state.headerHost = headTools;
        state.scrollEl = scroll;
        state.pageEl = pageEl;
        state.navEl = nav;
        state.toastEl = toast;
        state.navButtons = navButtons;

        backBtn.addEventListener('click', goBack);
        closeBtn.addEventListener('click', function () { closeInternal(false); });
        /* ST 的抽屉自动收起是 document 冒泡阶段的 click（script.js:12181）。
           在根节点截住冒泡：模块卡片自己的 click 仍先跑完，只是不再传给 document。
           不 capture、不 preventDefault，输入/滚动完全不受影响。 */
        root.addEventListener('click', function (ev) { ev.stopPropagation(); });
        root.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
        root.addEventListener('touchstart', function (ev) { ev.stopPropagation(); }, { passive: true });
        /* 原卡/菜单手风琴：只在用户明确点 summary 把卡片打开后，把这张卡的标题滚到滚动区顶部。
           刷新、程序改 open、收起都不滚。预设页的手风琴由 PC 自己处理，这里只认 details.kimi-card。 */
        root.addEventListener('click', onAccordionClick);
        scroll.addEventListener('scroll', onScroll, { passive: true });
        scroll.addEventListener('focusin', scheduleActiveVisible);
        head.addEventListener('pointerdown', onDragStart);
        win.addEventListener('resize', onViewportChange);
        win.addEventListener('orientationchange', onViewportChange);

        const vv = win.visualViewport;
        if (vv && typeof vv.addEventListener === 'function') {
            vv.addEventListener('resize', onViewportChange);
            vv.addEventListener('scroll', onViewportChange);
            state.vv = vv;
        }
        startThemeWatch();
        state.built = true;
    }

    function onScroll() {
        if (!state.scrollEl) return;
        state.scroll.set(pageKey(), state.scrollEl.scrollTop);
    }

    function onAccordionClick(ev) {
        const target = ev.target;
        const summary = target && target.closest ? target.closest('details.kimi-card > summary') : null;
        if (!summary || !state.root) return;
        /* summary 里的按钮/输入有自己的动作，点了不当作“切组”。 */
        if (target.closest('button, a, input, select, textarea')) return;
        const details = summary.parentElement;
        if (!details || details.tagName !== 'DETAILS') return;
        const wasOpen = !!details.open;
        /* 浏览器默认开合在 click 之后执行，这里等一帧再看是不是真的被用户打开了。 */
        win.setTimeout(function () {
            if (!state.open || !details.isConnected || !details.open || wasOpen) return;
            scrollDetailsToTop(details);
        }, 0);
    }

    function scrollDetailsToTop(details) {
        if (!state.scrollEl || !details) return;
        const head = details.querySelector(':scope > summary') || details;
        const box = state.scrollEl.getBoundingClientRect();
        const rect = head.getBoundingClientRect();
        const delta = rect.top - box.top;
        if (Math.abs(delta) < 2) return;
        state.scrollEl.scrollTop = Math.max(0, state.scrollEl.scrollTop + delta);
    }

    function pageKey() {
        return state.page === 'modules' && state.moduleId ? 'modules#' + state.moduleId : state.page;
    }

    function saveScroll() {
        if (!state.scrollEl) return;
        state.scroll.set(pageKey(), state.scrollEl.scrollTop);
    }

    function restoreScroll(key) {
        if (!state.scrollEl) return;
        const top = state.scroll.get(key) || 0;
        state.scrollEl.scrollTop = top;
        const raf = typeof win.requestAnimationFrame === 'function'
            ? win.requestAnimationFrame
            : function (cb) { return win.setTimeout(cb, 0); };
        raf(function () {
            if (!state.scrollEl || pageKey() !== key) return;
            if (state.scrollEl.scrollTop !== top) state.scrollEl.scrollTop = top;
        });
    }

    function releasePage() {
        const cleanup = state.pageCleanup;
        state.pageCleanup = null;
        if (cleanup) {
            try { cleanup(); } catch (err) {
                console.error('[余小温主控] 页面清理失败', err);
            }
        }
        if (state.pageEl) state.pageEl.replaceChildren();
    }

    function normalizeTarget(page, moduleId) {
        let targetPage = typeof page === 'string' ? page : 'home';
        let targetModule = typeof moduleId === 'string' && moduleId.trim() ? moduleId.trim() : null;
        if (PAGE_IDS.indexOf(targetPage) < 0) targetPage = 'home';
        if (targetModule) targetPage = 'modules';
        return { page: targetPage, moduleId: targetPage === 'modules' ? targetModule : null };
    }

    function navigate(page, moduleId) {
        const same = page === state.page && moduleId === state.moduleId;
        if (same && state.pageEl && state.pageEl.firstChild) {
            updateChrome();
            return;
        }
        saveScroll();
        releasePage();
        /* 离开预设页就退出钉选；headerHost 只属于 full 预设挂载，切页时清掉 PC 残留节点。 */
        if (page !== 'preset') state.pinMode = false;
        if (state.headerHost) state.headerHost.replaceChildren();
        state.page = page;
        state.moduleId = moduleId || null;
        renderPage();
        updateChrome();
    }

    function markOpen() {
        if (state.open) return false;
        state.open = true;
        state.lastFocus = doc.activeElement;
        state.root.classList.add('ywcc-is-open');
        state.root.setAttribute('aria-hidden', 'false');
        try { state.root.inert = false; } catch (err) { /* 忽略 */ }
        syncViewport();
        syncTheme();
        return true;
    }

    /* 模块详情的来源：首页收藏/最近进入 ⇒ 返回首页；工具箱列表进入 ⇒ 返回列表。
       面板未打开时的外部 open(moduleId) 按首页来源处理，避免沿用上次残留。 */
    function moduleOriginFor(wasOpen, previousPage, previousModule) {
        if (!wasOpen) return 'home';
        if (previousPage === 'modules') {
            if (!previousModule) return 'modules';
            return state.moduleOrigin === 'home' ? 'home' : 'modules';
        }
        return 'home';
    }

    function open(page, moduleId) {
        if (state.disposed) return;
        buildShell();
        /* 动作不是页面：open('modules','action:x') 只执行一次，不画中间同名按钮、不建详情页。 */
        const action = moduleById(moduleId);
        if (action && action.kind === 'action') {
            const openedNow = markOpen();
            const previousPage = state.page;
            const previousModule = state.moduleId;
            navigate('modules', null);
            if (openedNow || previousPage !== 'modules' || previousModule !== null) focusRoot();
            if (openedNow) emit(true, 'modules', null);
            runAction(action);
            return;
        }
        const target = normalizeTarget(page, moduleId);
        const wasOpen = state.open;
        const previousPage = state.page;
        const previousModule = state.moduleId;
        const origin = target.page === 'modules' && target.moduleId
            ? moduleOriginFor(wasOpen, previousPage, previousModule)
            : null;
        const openedNow = markOpen();
        /* 先记来源再渲染：updateChrome 在 navigate 内读取 moduleOrigin 决定返回文案。 */
        if (origin) state.moduleOrigin = origin;
        navigate(target.page, target.moduleId);
        const pageChanged = target.page !== previousPage || target.moduleId !== previousModule;
        if (openedNow || pageChanged) focusRoot();
        if (openedNow) emit(true, target.page, target.moduleId);
    }

    function closeInternal(silent) {
        if (!state.open) return;
        saveScroll();
        releasePage();
        state.open = false;
        state.pinMode = false;
        if (state.headerHost) state.headerHost.replaceChildren();
        if (state.root) {
            state.root.classList.remove('ywcc-is-open');
            state.root.setAttribute('aria-hidden', 'true');
            try { state.root.inert = true; } catch (err) { /* 忽略 */ }
        }
        const focus = state.lastFocus;
        state.lastFocus = null;
        if (focus && focus.isConnected && typeof focus.focus === 'function') {
            try { focus.focus({ preventScroll: true }); } catch (err) { /* 忽略 */ }
        }
        if (!silent) emit(false, state.page, state.moduleId);
    }

    function emit(open, page, moduleId) {
        const rect = getPanelRect();
        state.lastPanelRect = open && rect ? rect : null;
        if (typeof deps.onOpenChange !== 'function') return;
        try {
            deps.onOpenChange(open, { page: page, moduleId: moduleId || null, rect: rect });
        } catch (err) {
            console.error('[余小温主控] onOpenChange 回调失败', err);
        }
    }

    function getPanelRect() {
        if (!state.panel) return null;
        const rect = state.panel.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };
    }

    function samePanelRect(a, b) {
        return !!a && !!b
            && a.left === b.left && a.top === b.top
            && a.right === b.right && a.bottom === b.bottom
            && a.width === b.width && a.height === b.height;
    }

    /* 面板拖动/视口变化后几何会变，但 cc 只在开/关时 emit；
       这里补一次“几何已变”的 open 上报，让伴侣重算 avoid，不碰动作/位置。 */
    function emitPanelGeometry() {
        if (!state.open || !state.panel) return;
        const rect = getPanelRect();
        if (!rect || samePanelRect(rect, state.lastPanelRect)) return;
        emit(true, state.page, state.moduleId);
    }

    function focusRoot() {
        if (!state.root) return;
        try { state.root.focus({ preventScroll: true }); } catch (err) {
            try { state.root.focus(); } catch (ignore) { /* 忽略 */ }
        }
    }

    function goBack() {
        if (state.page === 'modules' && state.moduleId) {
            open(state.moduleOrigin === 'modules' ? 'modules' : 'home');
        } else open('home');
    }

    function updateChrome() {
        if (!state.built) return;
        let title = '余温总控台';
        /* 首页 hero 已经显示当前预设名，这里不再重复；副标题留空并收起。 */
        let sub = '';
        let backLabel = '';

        if (state.page === 'preset') {
            title = '预设条目';
            if (state.pinMode) sub = '点条目钉到首页';
            backLabel = '返回首页';
        } else if (state.page === 'settings') {
            title = '设置';
            backLabel = '返回首页';
        } else if (state.page === 'modules') {
            if (state.moduleId) {
                const result = getModulesSafe();
                const mod = result.modules.find(function (m) { return m.id === state.moduleId; });
                title = mod ? mod.label : '模块';
                sub = mod ? mod.category : '这次没有加载';
                backLabel = state.moduleOrigin === 'modules' ? '返回工具箱' : '返回首页';
            } else {
                const result = getModulesSafe();
                title = '工具箱';
                sub = result.error ? '模块清单暂时读不到' : '';
                backLabel = '返回首页';
            }
        }

        state.titleEl.textContent = title;
        state.subEl.textContent = sub;
        state.subEl.hidden = !sub;
        state.backBtn.hidden = !backLabel;
        if (backLabel) {
            state.backBtn.setAttribute('aria-label', backLabel);
            state.backBtn.title = backLabel;
        }
        const active = state.page === 'modules' ? 'modules' : state.page;
        if (state.navButtons) {
            state.navButtons.forEach(function (btn) {
                if (btn.dataset.ywccNav === active) btn.setAttribute('aria-current', 'page');
                else btn.removeAttribute('aria-current');
            });
        }
        renderTitleMark();
    }

    function renderPage() {
        if (!state.pageEl) return;
        state.pageEl.replaceChildren();
        state.refs = {};
        try {
            if (state.page === 'home') renderHome();
            else if (state.page === 'preset') renderPreset();
            else if (state.page === 'modules') {
                if (state.moduleId) renderModuleDetail(state.moduleId);
                else renderModules();
            } else {
                renderSettings();
            }
        } catch (err) {
            console.error('[余小温主控] 页面渲染失败', err);
            state.pageEl.appendChild(noteCard('这一页没打开', messageOf(err), {
                error: true,
                actionLabel: '回到首页',
                onAction: function () { open('home'); }
            }));
        }
        restoreScroll(pageKey());
    }

    function makeSection(title) {
        const el = H('section', 'ywcc-section');
        const head = H('div', 'ywcc-section-head');
        head.appendChild(H('h3', '', title));
        el.appendChild(head);
        return { el: el };
    }

    /* 首页三个入口：图标在左、文字在旁边横排，卡片只占一行高；
       副说明只在确有异常（如清单读不到）时出现，正常态留空由 CSS 收起。 */
    function quickCard(name, label, sub, onClick) {
        const btn = H('button', 'ywcc-quick-card');
        btn.type = 'button';
        const ico = H('span', 'ywcc-quick-ico');
        ico.appendChild(icon(name));
        const text = H('span', 'ywcc-quick-text');
        text.appendChild(H('span', 'ywcc-quick-label', label));
        text.appendChild(H('span', 'ywcc-quick-sub', sub || ''));
        btn.append(ico, text);
        btn.addEventListener('click', onClick);
        return btn;
    }

    function mountPresetInto(host, opts, label) {
        if (typeof deps.mountPresetControls !== 'function') {
            host.appendChild(noteCard(label + '这次没有加载', '主控没有拿到预设条目接口；其它功能不受影响。'));
            return null;
        }
        try {
            const ret = deps.mountPresetControls(host, opts);
            return normalizeCleanup(ret);
        } catch (err) {
            console.error('[余小温主控] 预设条目挂载失败', err);
            host.appendChild(noteCard(label + '这次没打开', messageOf(err), { error: true }));
            return null;
        }
    }

    function starButton(item, favSet) {
        const on = favSet.has(item.id);
        const btn = iconButton(on ? 'starFilled' : 'star', (on ? '取消收藏 ' : '收藏 ') + item.label, 'ywcc-star');
        btn.dataset.ywccFav = item.id;
        btn.dataset.ywccLabel = item.label;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            toggleFavorite(item.id, false);
        });
        return btn;
    }

    function syncFavoriteButtons(id, on) {
        if (!state.root) return;
        state.root.querySelectorAll('[data-ywcc-fav]').forEach(function (btn) {
            if (btn.getAttribute('data-ywcc-fav') !== id) return;
            const label = btn.getAttribute('data-ywcc-label') || id;
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.title = (on ? '取消收藏 ' : '收藏 ') + label;
            btn.setAttribute('aria-label', btn.title);
            const ico = btn.querySelector('.ywcc-ico');
            if (ico) ico.innerHTML = on ? ICONS.starFilled : ICONS.star;
        });
    }

    function toggleFavorite(id, removeOnly) {
        const settings = settingsObject();
        if (!settings) {
            flash('设置还没准备好，收藏没有保存。');
            return;
        }
        const before = listFrom(settings, 'favorites');
        const has = before.indexOf(id) >= 0;
        const next = removeOnly
            ? before.filter(function (x) { return x !== id; })
            : (has ? before.filter(function (x) { return x !== id; }) : before.concat([id]));
        if (next.length === before.length && has === (next.indexOf(id) >= 0)) return;
        if (!setListOn(settings, 'favorites', next)) {
            flash('收藏没有保存：设置里没有可写的位置。');
            return;
        }
        const onFailure = function (err) {
            const current = listFrom(settings, 'favorites');
            /* 只有“当前收藏仍是这次写下的那一份”才回滚；用户若已快速改成别的新收藏，
               不能拿旧快照把它盖掉。 */
            const untouched = sameList(current, next);
            if (untouched) {
                setListOn(settings, 'favorites', before);
                syncFavoriteButtons(id, before.indexOf(id) >= 0);
                if (state.page === 'home') {
                    renderHomeFavorites();
                    renderHomeRecent();
                }
            }
            flash('收藏没有保存：' + messageOf(err) + (untouched ? '。已恢复原来的收藏。' : '。刚才的改动可能没保存。'));
        };
        if (!persist(onFailure)) return;
        const now = listFrom(settings, 'favorites');
        syncFavoriteButtons(id, now.indexOf(id) >= 0);
        if (state.page === 'home') {
            renderHomeFavorites();
            renderHomeRecent();
        }
    }

    function rememberRecent(id) {
        const settings = settingsObject();
        if (!settings) return;
        const before = listFrom(settings, 'recent');
        const next = [id].concat(before.filter(function (x) { return x !== id; })).slice(0, RECENT_LIMIT);
        if (sameList(next, before)) return;
        if (!setListOn(settings, 'recent', next)) return;
        const onFailure = function (err) {
            if (sameList(listFrom(settings, 'recent'), next)) setListOn(settings, 'recent', before);
            flash('最近使用没保存：' + messageOf(err) + '。不影响继续使用。');
        };
        if (!persist(onFailure)) return;
        if (state.page === 'home') renderHomeRecent();
    }

    function forgetRecent(id) {
        const settings = settingsObject();
        if (!settings) return;
        const before = listFrom(settings, 'recent');
        const next = before.filter(function (x) { return x !== id; });
        if (next.length === before.length) return;
        if (!setListOn(settings, 'recent', next)) return;
        const onFailure = function (err) {
            if (sameList(listFrom(settings, 'recent'), next)) setListOn(settings, 'recent', before);
            flash('最近使用没保存：' + messageOf(err) + '。不影响继续使用。');
        };
        if (!persist(onFailure)) return;
        if (state.page === 'home' && state.refs.homeRecentHost && state.refs.homeRecentHost.isConnected) {
            renderHomeRecent();
        }
    }

    function runAction(item) {
        if (!item || item.kind !== 'action' || typeof item.run !== 'function') return false;
        const now = Date.now();
        const last = state.actionRuns.get(item.id) || 0;
        if (now - last < ACTION_REENTRY_MS) return false;
        state.actionRuns.set(item.id, now);
        let ret;
        try {
            ret = item.run();
        } catch (err) {
            console.error('[余小温主控] 动作执行失败: ' + item.id, err);
            flash('这个动作没有执行成功：' + messageOf(err));
            return false;
        }
        rememberRecent(item.id);
        if (ret && typeof ret.then === 'function') {
            ret.catch(function (err) {
                console.error('[余小温主控] 动作执行到一半出错: ' + item.id, err);
                flash('这个动作执行到一半出错了：' + messageOf(err));
            });
        }
        return true;
    }

    /* 重新画当前页（切整理模式用）：先记滚动，再拆挂载重画，位置不跳。 */
    function rerenderPage() {
        if (!state.pageEl) return;
        saveScroll();
        releasePage();
        if (state.headerHost) state.headerHost.replaceChildren();
        renderPage();
        updateChrome();
    }

    function setHomeEdit(on) {
        const next = !!on;
        if (state.homeEdit === next) return;
        state.homeEdit = next;
        if (!next) state.pinMode = false;
        rerenderPage();
    }

    /* 首页「整理首页」里的唯一入口：交给 PC 画「添加首页常用」，
       CC 只把 full 预设页切成 pinMode。 */
    function enterPinMode() {
        if (!state.open || state.page === 'preset') return;
        state.pinMode = true;
        open('preset');
    }

    /* PC 钉完/取消后回调：退出 pinMode 回首页（homeEdit 保持，用户接着整理）。 */
    function handlePinFinished() {
        state.pinMode = false;
        if (state.page === 'preset') open('home');
        else if (state.page === 'home') rerenderPage();
    }

    function safeSchemeIconSrc(raw) {
        const text = String(raw || '').trim();
        if (!text) return '';
        /* 出厂方案图标是 LobeHub 的 data:image/svg+xml;base64，必须放行；
           只作为 <img src> 使用（不 innerHTML），SVG 里的脚本不会执行。 */
        if (/^data:image\/svg\+xml(?:[;][^,]*)?,/i.test(text)) return text;
        if (/^data:image\/(?:png|jpe?g|webp|gif|avif|bmp|x-icon);base64,[a-z0-9+/=\s]+$/i.test(text)) return text;
        if (/^blob:/i.test(text)) return text;
        if (/^https?:\/\//i.test(text)) return text;
        if (/^(?:\.\/|\/|assets\/)/i.test(text)) return text;
        return '';
    }

    /* 当前生效方案：主 index 直接返回 {id,name,icon,iconData} 或 null。
       它是独立桥，不受 showHome 过滤影响；旧宿主没给这个桥时才回退首页列表。 */
    function getActiveSchemeSafe() {
        let raw = null;
        let hasBridge = false;
        try {
            const fn = deps.getActiveScheme;
            if (typeof fn === 'function') {
                hasBridge = true;
                raw = fn();
            }
        } catch (err) {
            console.error('[余小温主控] 读取当前方案失败', err);
            return null;
        }
        if (hasBridge) {
            if (!raw || typeof raw !== 'object') return null;
        } else {
            const item = getHomeSchemesSafe().find(function (entry) { return entry.active; });
            if (!item) return null;
            raw = item;
        }
        const id = typeof raw.id === 'string' ? raw.id.trim() : '';
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        if (!id && !name) return null;
        return {
            id: id || name,
            name: name || id,
            icon: typeof raw.icon === 'string' ? raw.icon.trim().slice(0, 8) : '',
            iconData: typeof raw.iconData === 'string' ? raw.iconData.trim() : ''
        };
    }

    /* 标题左图标：有生效方案就显示方案图标（img 优先、emoji 兜底），
       没有生效方案恢复火苗。用户数据只走 textContent / img src，不拼 HTML。 */
    function renderTitleMark() {
        const mark = state.markEl;
        if (!mark) return;
        const active = getActiveSchemeSafe();
        const sig = active ? [active.id, active.name, active.icon, active.iconData].join('\u0001') : '';
        /* 同一方案不反复拆挂 img（刷新时避免闪一下）；方案换人或改名才重画。 */
        if (sig === state.markSig && mark.firstChild) return;
        state.markSig = sig;
        mark.classList.toggle('is-scheme', !!active);
        mark.replaceChildren();
        if (!active) {
            mark.removeAttribute('title');
            mark.innerHTML = ICONS.flame;
            return;
        }
        mark.title = active.name;
        const src = safeSchemeIconSrc(active.iconData);
        if (src) {
            const img = doc.createElement('img');
            img.className = 'ywcc-mark-img';
            img.alt = '';
            img.decoding = 'async';
            img.draggable = false;
            img.addEventListener('error', function () {
                img.remove();
                mark.textContent = active.icon || (active.name ? active.name.slice(0, 1) : '◆');
            });
            img.src = src;
            mark.appendChild(img);
            return;
        }
        mark.textContent = active.icon || (active.name ? active.name.slice(0, 1) : '◆');
    }

    function getHomeSchemesSafe() {
        try {
            const fn = deps.getHomeSchemes;
            if (typeof fn !== 'function') return [];
            const raw = fn();
            if (!Array.isArray(raw)) return [];
            const seen = new Set();
            const list = [];
            for (const item of raw) {
                if (!item || typeof item !== 'object') continue;
                const id = typeof item.id === 'string' ? item.id.trim() : '';
                if (!id || seen.has(id)) continue;
                const run = typeof item.run === 'function' ? item.run : null;
                if (!run) continue;
                seen.add(id);
                list.push({
                    id,
                    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id,
                    icon: typeof item.icon === 'string' ? item.icon.trim().slice(0, 8) : '',
                    iconData: typeof item.iconData === 'string' ? item.iconData.trim() : '',
                    active: item.active === true,
                    run,
                    configure: typeof item.configure === 'function' ? item.configure : null,
                    overwrite: typeof item.overwrite === 'function' ? item.overwrite : null
                });
            }
            return list;
        } catch (err) {
            console.error('[余小温主控] 读取首页方案失败', err);
            return [];
        }
    }

    function schemesSignatureOf(list) {
        return list.map(function (item) {
            return [item.id, item.name, item.icon, item.iconData, item.active ? '1' : '0',
                item.configure ? '1' : '0', item.overwrite ? '1' : '0'].join('\u0001');
        }).join('\u0002') + '\u0003' + (state.homeEdit ? 'E' : 'N') + state.schemeBusy;
    }

    function schemeIconEl(item) {
        const box = H('span', 'ywcc-scheme-icon');
        const src = safeSchemeIconSrc(item.iconData);
        if (src) {
            const img = doc.createElement('img');
            img.className = 'ywcc-scheme-img';
            img.alt = '';
            img.decoding = 'async';
            img.loading = 'lazy';
            img.draggable = false;
            img.addEventListener('error', function () {
                img.remove();
                box.textContent = item.icon || (item.name ? item.name.slice(0, 1) : '◆');
            });
            img.src = src;
            box.appendChild(img);
            return box;
        }
        box.textContent = item.icon || (item.name ? item.name.slice(0, 1) : '◆');
        return box;
    }

    function callSchemeAction(item, act) {
        const fn = item[act];
        if (typeof fn !== 'function') return;
        let ret;
        try {
            ret = fn();
        } catch (err) {
            console.error('[余小温主控] 方案操作失败: ' + item.id + ' / ' + act, err);
            flash('方案操作没有完成：' + messageOf(err));
            return;
        }
        if (ret && typeof ret.then === 'function') {
            ret.catch(function (err) {
                console.error('[余小温主控] 方案操作中途失败: ' + item.id + ' / ' + act, err);
                flash('方案操作中途出错：' + messageOf(err));
            });
        }
    }

    function schemeActionButton(item, act, label, enabled) {
        const btn = H('button', 'ywcc-scheme-act');
        btn.type = 'button';
        btn.dataset.ywccSchemeAct = act;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.appendChild(icon(act === 'configure' ? 'gear' : 'refresh'));
        if (!enabled) {
            btn.disabled = true;
        } else {
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                if (state.schemeBusy) return;
                callSchemeAction(item, act);
            });
        }
        ['pointerdown', 'mousedown', 'touchstart'].forEach(function (type) {
            btn.addEventListener(type, function (ev) { ev.stopPropagation(); }, { passive: true });
        });
        return btn;
    }

    function runScheme(item, card) {
        if (state.schemeBusy || state.homeEdit) return;
        state.schemeBusy = item.id;
        /* busy 变化不进签名时，finish 会因签名相同跳过重画、按钮一直灰着。 */
        state.schemeSig = '';
        const host = state.refs.homeSchemesHost;
        if (host) {
            host.querySelectorAll('.ywcc-scheme-main, .ywcc-scheme-act').forEach(function (btn) { btn.disabled = true; });
        }
        if (card) card.classList.add('is-busy');
        let ret;
        const finish = function () {
            if (state.schemeBusy !== item.id) return;
            state.schemeBusy = '';
            state.schemeSig = '';
            renderHomeSchemes();
            refresh();
        };
        try {
            ret = item.run();
        } catch (err) {
            console.error('[余小温主控] 切换方案失败: ' + item.id, err);
            flash('方案没有切换成功：' + messageOf(err));
            finish();
            return;
        }
        if (ret && typeof ret.then === 'function') {
            ret.then(finish, function (err) {
                console.error('[余小温主控] 切换方案中途失败: ' + item.id, err);
                flash('方案切换中途出错：' + messageOf(err));
                finish();
            });
        } else {
            finish();
        }
    }

    function schemeCard(item) {
        const card = H('div', 'ywcc-scheme-card'
            + (item.active ? ' is-active' : '')
            + (state.homeEdit ? ' is-locked' : '')
            + (state.schemeBusy === item.id ? ' is-busy' : ''));
        card.dataset.ywccScheme = item.id;
        const main = H('button', 'ywcc-scheme-main');
        main.type = 'button';
        main.appendChild(schemeIconEl(item));
        main.appendChild(H('span', 'ywcc-scheme-name', item.name));
        if (item.active) main.setAttribute('aria-current', 'true');
        if (state.homeEdit) {
            main.disabled = true;
            main.title = '整理中，先点完成';
        } else {
            main.title = '切换到 ' + item.name;
            main.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (state.schemeBusy) return;
                runScheme(item, card);
            });
        }
        card.appendChild(main);
        const actions = H('div', 'ywcc-scheme-actions');
        actions.appendChild(schemeActionButton(item, 'configure', '设置方案 ' + item.name, !state.schemeBusy));
        actions.appendChild(schemeActionButton(item, 'overwrite', '用当前状态更新 ' + item.name, !state.homeEdit && !state.schemeBusy));
        card.appendChild(actions);
        return card;
    }

    function renderHomeSchemes() {
        const host = state.refs.homeSchemesHost;
        if (!host || !host.isConnected) return;
        const list = getHomeSchemesSafe();
        const sig = schemesSignatureOf(list);
        const section = state.refs.homeSchemesSection;
        if (section) section.hidden = !list.length;
        /* 换了页面容器（重新 renderHome）时 host 是空的，签名相同也必须重画。 */
        if (!host.firstChild) state.schemeSig = '';
        if (sig === state.schemeSig) return;
        state.schemeSig = sig;
        host.replaceChildren();
        if (!list.length) return;
        const grid = H('div', 'ywcc-scheme-list');
        list.forEach(function (item) { grid.appendChild(schemeCard(item)); });
        host.appendChild(grid);
    }

    /* 首页 hero 的商店/更新广播入口：只读桥，任何异常都按“没有更新”处理，
       不让主模块一次读失败把首页打崩（与铁律 27 的坏数据防御同一口径）。 */
    function getStoreUpdateNoticeSafe() {
        try {
            const fn = deps.getStoreUpdateNotice;
            if (typeof fn !== 'function') return { pending: false };
            const raw = fn();
            /* 只认严格的 true：bridge 未就绪/失败可能给 null、{}、'true'，一律当没有更新。 */
            return { pending: !!(raw && typeof raw === 'object' && raw.pending === true) };
        } catch (err) {
            console.error('[余小温主控] 读取商店更新提醒失败', err);
            return { pending: false };
        }
    }

    function storeEntryLabel(pending) {
        return pending
            ? '预设有更新！点我去一键缝合（打开条目商店）'
            : '打开条目商店';
    }

    /* 只改文案/class/data，不 replaceChildren、不重挂：PC 的滚动与焦点都留在原位。 */
    function applyStoreEntryState(btn, textEl, pending) {
        if (!btn) return;
        const on = !!pending;
        const text = on ? STORE_ENTRY_UPDATE_TEXT : STORE_ENTRY_TEXT;
        if (btn.classList.contains('is-update') !== on) btn.classList.toggle('is-update', on);
        if (btn.dataset.ywccStorePending !== (on ? '1' : '0')) btn.dataset.ywccStorePending = on ? '1' : '0';
        if (btn.dataset.ywccStoreState !== (on ? 'update' : 'store')) btn.dataset.ywccStoreState = on ? 'update' : 'store';
        if (textEl && textEl.textContent !== text) textEl.textContent = text;
        const label = storeEntryLabel(on);
        if (btn.getAttribute('aria-label') !== label) {
            btn.setAttribute('aria-label', label);
            btn.title = label;
        }
    }

    function updateStoreEntry() {
        const btn = state.refs.homeStoreEntry;
        if (!btn || !btn.isConnected) return;
        applyStoreEntryState(btn, state.refs.homeStoreEntryText, getStoreUpdateNoticeSafe().pending);
    }

    function openOfficialStoreFromHome() {
        const fn = deps.openOfficialStore;
        if (typeof fn !== 'function') {
            console.error('[余小温主控] 主模块没有提供条目商店入口');
            flash('条目商店这次没有加载');
            return;
        }
        let ret;
        try {
            ret = fn();
        } catch (err) {
            console.error('[余小温主控] 打开条目商店失败', err);
            flash('条目商店没打开：' + messageOf(err));
            return;
        }
        /* 主模块自己会给“商店没加载”的人话；这里只兜“中途失败”的 Promise。 */
        if (ret && typeof ret.then === 'function') {
            ret.catch(function (err) {
                console.error('[余小温主控] 打开条目商店中途失败', err);
                flash('条目商店没打开：' + messageOf(err));
            });
        }
    }

    function renderHomeTools() {
        const bar = H('div', 'ywcc-home-tools' + (state.homeEdit ? ' is-editing' : ' is-stacked'));
        bar.setAttribute('data-ywcc-home-tools', '');
        if (state.homeEdit) {
            const stateEl = H('span', 'ywcc-home-edit-state');
            stateEl.appendChild(H('span', 'ywcc-home-edit-dot'));
            stateEl.appendChild(H('span', '', '整理中'));
            bar.appendChild(stateEl);
            const done = H('button', 'ywcc-home-tool ywcc-home-done');
            done.type = 'button';
            done.appendChild(icon('check'));
            done.appendChild(H('span', '', '完成'));
            done.addEventListener('click', function () { setHomeEdit(false); });
            bar.appendChild(done);
            return bar;
        }
        const edit = H('button', 'ywcc-home-tool ywcc-home-edit-btn');
        edit.type = 'button';
        edit.appendChild(icon('edit'));
        edit.appendChild(H('span', '', '首页修改'));
        edit.addEventListener('click', function () { setHomeEdit(true); });
        bar.appendChild(edit);

        /* 作者要求：首页修改下面再一颗“条目商店 / 预设有更新”广播入口。
           pending 只读主模块的 getStoreUpdateNotice()；点击只走 openOfficialStore()。 */
        const notice = getStoreUpdateNoticeSafe();
        const store = H('button', 'ywcc-home-tool ywcc-home-store-btn');
        store.type = 'button';
        store.dataset.ywccStoreEntry = 'official';
        const dot = H('span', 'ywcc-home-store-dot');
        dot.setAttribute('aria-hidden', 'true');
        const storeText = H('span', 'ywcc-home-store-text', notice.pending ? STORE_ENTRY_UPDATE_TEXT : STORE_ENTRY_TEXT);
        const cart = H('span', 'ywcc-home-store-icon', '🛒');
        cart.setAttribute('aria-hidden', 'true');
        store.append(dot, cart, storeText);
        applyStoreEntryState(store, storeText, notice.pending);
        store.addEventListener('click', openOfficialStoreFromHome);
        bar.appendChild(store);
        return bar;
    }

    function renderHome() {
        const preset = currentPresetName();
        const result = getModulesSafe();
        const page = H('div', 'ywcc-page ywcc-home' + (state.homeEdit ? ' is-editing' : ''));

        const hero = H('section', 'ywcc-hero');
        const heroText = H('div', 'ywcc-hero-text');
        heroText.appendChild(H('p', 'ywcc-eyebrow', '当前预设'));
        const name = H('p', 'ywcc-preset-name' + (preset ? '' : ' is-muted'), preset || '未读取到当前预设');
        heroText.appendChild(name);
        /* 生效方案只做一行小字；图标已经放在总控标题左侧，这里不重复放图。 */
        const active = getActiveSchemeSafe();
        const activeName = H('p', 'ywcc-active-scheme', active ? '当前方案 · ' + active.name : '');
        activeName.hidden = !active;
        heroText.appendChild(activeName);
        hero.appendChild(heroText);
        /* 「首页修改 / 完成」固定在当前预设卡右上角，不再在页面底部占一行。 */
        const tools = renderHomeTools();
        hero.appendChild(tools);
        page.appendChild(hero);

        const quick = H('div', 'ywcc-quick');
        quick.appendChild(quickCard('preset', '预设条目', '', function () { open('preset'); }));
        const moduleSub = result.error ? '清单暂时读不到' : '';
        const moduleCard = quickCard('modules', '工具箱', moduleSub, function () { open('modules'); });
        quick.appendChild(moduleCard);
        quick.appendChild(quickCard('settings', '设置', '', function () { open('settings'); }));
        page.appendChild(quick);

        /* 预设方案：只做桥渲染，数据/回调全部来自 index 的 getHomeSchemes。 */
        const schemeSec = makeSection('预设方案');
        const schemeHost = H('div', 'ywcc-schemes');
        schemeSec.el.appendChild(schemeHost);
        page.appendChild(schemeSec.el);

        /* 紧凑预设控件自带可折叠的「常用」分区头，外层不再加重复标题。
           整理模式重新 mount 并带 homeEdit；唯一的「添加首页常用」由 PC 画，
           CC 只在 PC 点它时把 full 页切成 pinMode。 */
        const commonHost = H('div', 'ywcc-host ywcc-home-common');
        page.appendChild(commonHost);
        const presetOpts = { compact: true, homeEdit: state.homeEdit };
        if (state.homeEdit) presetOpts.onPinModeRequest = enterPinMode;
        const cleanup = mountPresetInto(commonHost, presetOpts, '常用项');
        state.pageCleanup = cleanup;

        const favSec = makeSection('模块收藏');
        const favHost = H('div', 'ywcc-host');
        favSec.el.appendChild(favHost);
        page.appendChild(favSec.el);

        const recentSec = makeSection('最近使用');
        const recentHost = H('div', 'ywcc-host');
        recentSec.el.appendChild(recentHost);
        page.appendChild(recentSec.el);

        /* 先挂进文档再画收藏/最近：renderHomeFavorites 用 isConnected 防误画，
           顺序反了会让首绘静默跳过（作者看到的“收藏后首页漏显 / 刷新像丢了”）。 */
        state.pageEl.appendChild(page);
        state.refs = {
            homeName: name,
            homeActiveName: activeName,
            homeTools: tools,
            homeStoreEntry: tools.querySelector('[data-ywcc-store-entry]'),
            homeStoreEntryText: tools.querySelector('.ywcc-home-store-text'),
            homePage: page,
            homeQuickModulesSub: moduleCard.querySelector('.ywcc-quick-sub'),
            homeSchemesHost: schemeHost,
            homeSchemesSection: schemeSec.el,
            homeCommonHost: commonHost,
            homeFavHost: favHost,
            homeFavSection: favSec.el,
            homeRecentHost: recentHost,
            homeRecentSection: recentSec.el
        };
        renderHomeSchemes();
        renderHomeFavorites();
        renderHomeRecent();
        state.registrySig = registrySigOf(result);
    }

    function moduleGlyph(mod) {
        if (mod && mod.emoji) {
            const emoji = H('span', 'ywcc-emoji');
            emoji.textContent = mod.emoji;
            return emoji;
        }
        if (mod && mod.kind === 'action') {
            const fallback = H('span', 'ywcc-emoji ywcc-emoji-fallback');
            fallback.textContent = '⚡';
            return fallback;
        }
        return H('span', 'ywcc-row-dot');
    }

    function miniRow(mod, id, kind, favSet) {
        const row = H('div', 'ywcc-mini' + (mod ? '' : ' is-missing'));
        row.dataset.ywccId = id;
        if (!mod) {
            const missing = H('div', 'ywcc-mini-main ywcc-mini-missing');
            const glyph = H('span', 'ywcc-emoji ywcc-emoji-fallback');
            glyph.textContent = '⚠';
            const text = H('span', 'ywcc-mini-text');
            text.appendChild(H('span', 'ywcc-mini-title', '暂时没加载'));
            text.appendChild(H('span', 'ywcc-mini-meta', '这次没有加载'));
            missing.append(glyph, text);
            row.appendChild(missing);
            const del = iconButton('close', '移除 ' + id, 'ywcc-mini-del');
            del.addEventListener('click', function () {
                if (kind === 'fav') toggleFavorite(id, true);
                else forgetRecent(id);
            });
            row.appendChild(del);
            return row;
        }
        const isAction = mod.kind === 'action';
        const main = H('button', 'ywcc-mini-main' + (isAction ? ' is-action' : ''));
        main.type = 'button';
        main.appendChild(moduleGlyph(mod));
        const text = H('span', 'ywcc-mini-text');
        text.appendChild(H('span', 'ywcc-mini-title', mod.label));
        text.appendChild(H('span', 'ywcc-mini-meta', isAction ? '执行' : mod.category));
        main.appendChild(text);
        if (!isAction) main.appendChild(icon('chev', 'ywcc-mini-chev'));
        main.addEventListener('click', function () {
            if (isAction) runAction(mod);
            else open('modules', mod.id);
        });
        row.appendChild(main);
        row.appendChild(starButton(mod, favSet));
        return row;
    }

    function favoriteChip(id, mod, favSet, kind = 'fav') {
        const chip = H('div', 'ywcc-fav-chip' + (mod ? '' : ' is-missing'));
        chip.dataset.ywccId = id;
        if (!mod) {
            const missing = H('span', 'ywcc-fav-main is-missing');
            const glyph = H('span', 'ywcc-emoji ywcc-emoji-fallback');
            glyph.textContent = '⚠';
            missing.append(glyph, H('span', 'ywcc-fav-name', '暂时没加载'));
            chip.appendChild(missing);
        } else {
            const isAction = mod.kind === 'action';
            const main = H('button', 'ywcc-fav-main' + (isAction ? ' is-action' : ''));
            main.type = 'button';
            main.appendChild(moduleGlyph(mod));
            main.appendChild(H('span', 'ywcc-fav-name', mod.label));
            main.addEventListener('click', function () {
                if (isAction) runAction(mod);
                else open('modules', mod.id);
            });
            chip.appendChild(main);
        }
        const remove = !mod && kind === 'recent'
            ? iconButton('close', '移除 ' + id, 'ywcc-fav-remove')
            : starButton({ id: id, label: mod ? mod.label : '这个收藏' }, favSet);
        if (!mod && kind === 'recent') remove.addEventListener('click', function () { forgetRecent(id); });
        remove.classList.add('ywcc-fav-remove');
        chip.appendChild(remove);
        return chip;
    }

    function renderHomeFavorites() {
        const host = state.refs.homeFavHost;
        if (!host || !host.isConnected) return;
        const settings = settingsObject();
        const favs = listFrom(settings, 'favorites');
        const favSet = new Set(favs);
        const result = getModulesSafe();
        const map = new Map(result.modules.map(function (m) { return [m.id, m]; }));
        const section = state.refs.homeFavSection;
        if (section) section.hidden = !favs.length;
        host.replaceChildren();
        if (!favs.length) return;
        const grid = H('div', 'ywcc-fav-grid');
        favs.forEach(function (id) { grid.appendChild(favoriteChip(id, map.get(id), favSet)); });
        host.appendChild(grid);
    }

    function renderHomeRecent() {
        const host = state.refs.homeRecentHost;
        if (!host || !host.isConnected) return;
        const settings = settingsObject();
        const recent = listFrom(settings, 'recent');
        const favSet = new Set(listFrom(settings, 'favorites'));
        const result = getModulesSafe();
        const map = new Map(result.modules.map(function (m) { return [m.id, m]; }));
        const section = state.refs.homeRecentSection;
        if (section) section.hidden = !recent.length;
        host.replaceChildren();
        if (!recent.length) return;
        const list = H('div', 'ywcc-fav-grid ywcc-recent-grid');
        recent.forEach(function (id) { list.appendChild(favoriteChip(id, map.get(id), favSet, 'recent')); });
        host.appendChild(list);
    }

    function renderPreset() {
        const page = H('div', 'ywcc-page ywcc-preset-page' + (state.pinMode ? ' is-pin-mode' : ''));
        const host = H('div', 'ywcc-host');
        page.appendChild(host);
        state.pageEl.appendChild(page);
        state.pageCleanup = mountPresetInto(host, {
            compact: false,
            pinMode: state.pinMode,
            onPin: handlePinFinished,
            headerHost: state.headerHost
        }, '预设条目');
    }

    function renderModules() {
        const page = H('div', 'ywcc-page ywcc-modules-page');
        const search = H('div', 'ywcc-search');
        search.appendChild(icon('search', 'ywcc-search-ico'));
        const input = H('input', 'ywcc-search-input');
        input.type = 'search';
        input.value = state.search;
        input.placeholder = '搜模块、功能或分类';
        input.setAttribute('aria-label', '搜索模块');
        input.addEventListener('input', function () {
            state.search = input.value;
            renderModuleList();
        });
        search.appendChild(input);
        const listHost = H('div', 'ywcc-module-groups');
        page.append(search, listHost);
        state.refs = { searchInput: input, listHost: listHost };
        state.pageEl.appendChild(page);
        renderModuleList();
    }

    function renderModuleList() {
        const host = state.refs.listHost;
        if (!host || !host.isConnected) return;
        const result = getModulesSafe();
        state.registrySig = registrySigOf(result);
        host.replaceChildren();
        if (result.error) {
            host.appendChild(noteCard('模块清单暂时读不到', result.error, {
                error: true,
                actionLabel: '重试',
                onAction: function () { refresh(); }
            }));
            updateChrome();
            return;
        }
        const query = state.search.trim();
        const lower = query.toLowerCase();
        let list = result.modules;
        if (lower) {
            list = list.filter(function (m) {
                return (m.label + ' ' + m.description + ' ' + m.category + ' ' + m.id).toLowerCase().indexOf(lower) >= 0;
            });
        }
        if (!list.length) {
            host.appendChild(H('p', 'ywcc-empty', query ? '没有找到「' + query + '」。' : '还没有可用的模块。'));
            if (query) {
                const clear = H('button', 'ywcc-btn ywcc-btn-ghost', '清空搜索');
                clear.type = 'button';
                clear.addEventListener('click', function () {
                    state.search = '';
                    if (state.refs.searchInput) {
                        state.refs.searchInput.value = '';
                        state.refs.searchInput.focus();
                    }
                    renderModuleList();
                });
                host.appendChild(clear);
            }
            updateChrome();
            return;
        }
        const favSet = new Set(listFrom(settingsObject(), 'favorites'));
        const groups = new Map();
        list.forEach(function (m) {
            if (!groups.has(m.category)) groups.set(m.category, []);
            groups.get(m.category).push(m);
        });
        groups.forEach(function (items, category) {
            const sec = makeSection(category);
            const box = H('div', 'ywcc-list');
            items.forEach(function (item) { box.appendChild(moduleRow(item, favSet)); });
            sec.el.appendChild(box);
            host.appendChild(sec.el);
        });
        updateChrome();
    }

    function moduleRow(item, favSet) {
        const isAction = item.kind === 'action';
        const row = H('div', 'ywcc-row' + (isAction ? ' ywcc-row-action' : ''));
        row.dataset.ywccId = item.id;
        const main = H('button', 'ywcc-row-main');
        main.type = 'button';
        main.appendChild(moduleGlyph(item));
        const text = H('span', 'ywcc-row-text');
        text.appendChild(H('span', 'ywcc-row-title', item.label));
        if (item.description) text.appendChild(H('span', 'ywcc-row-desc', item.description));
        main.appendChild(text);
        if (!isAction) main.appendChild(icon('chev', 'ywcc-chev'));
        main.addEventListener('click', function () {
            if (isAction) runAction(item);
            else open('modules', item.id);
        });
        row.appendChild(main);
        row.appendChild(starButton(item, favSet));
        return row;
    }

    function decorateNameFieldLabels(host) {
        const added = [];
        let released = false;
        function apply() {
            if (released || !host || typeof host.querySelector !== 'function') return;
            const fields = [
                { selector: '[id$="_rand_ai_panel"] > input[id$="_rand_name_src"]', label: 'AI 名字' },
                { selector: '[id$="_rand_user_panel"] > input[id$="_rand_user_src"]', label: '用户名字' }
            ];
            fields.forEach(function (field) {
                const input = host.querySelector(field.selector);
                if (!input || !input.parentNode) return;
                const prev = input.previousElementSibling;
                if (prev && prev.hasAttribute('data-ywcc-field-label')) return;
                const label = doc.createElement('label');
                label.className = 'ywcc-field-label';
                label.setAttribute('data-ywcc-field-label', '1');
                label.textContent = field.label;
                if (input.id) label.setAttribute('for', input.id);
                input.parentNode.insertBefore(label, input);
                added.push(label);
            });
        }
        apply();
        return {
            apply: apply,
            cleanup: function () {
                released = true;
                while (added.length) {
                    const label = added.pop();
                    if (label && label.parentNode) label.parentNode.removeChild(label);
                }
            }
        };
    }

    function renderModuleDetail(id) {
        const result = getModulesSafe();
        const mod = result.modules.find(function (m) { return m.id === id; });
        const page = H('div', 'ywcc-page ywcc-module-page');
        const host = H('div', 'ywcc-module-host');
        if (!mod) {
            page.appendChild(noteCard('这个模块这次没有加载',
                result.error ? '模块清单读不到：' + result.error : '它可能被移除，或者还没准备好。', {
                error: true,
                actionLabel: state.moduleOrigin === 'modules' ? '返回工具箱' : '返回首页',
                onAction: function () { open(state.moduleOrigin === 'modules' ? 'modules' : 'home'); }
            }));
            state.pageEl.appendChild(page);
            state.registrySig = registrySigOf(result);
            return;
        }
        const meta = H('div', 'ywcc-detail-meta');
        if (mod.description) meta.appendChild(H('p', 'ywcc-detail-desc', mod.description));
        page.appendChild(host);
        if (mod.description) page.insertBefore(meta, host);
        state.pageEl.appendChild(page);
        state.registrySig = registrySigOf(result);

        if (!mod.open) {
            host.appendChild(noteCard('这个模块这次没有提供打开方式',
                '主控拿到了它的名字，但没有可用的打开函数；其它模块不受影响。'));
            return;
        }
        let ret;
        try {
            ret = mod.open(host);
        } catch (err) {
            console.error('[余小温主控] 模块打开失败: ' + id, err);
            host.appendChild(noteCard('这个模块打开时出错了', messageOf(err), {
                error: true,
                actionLabel: state.moduleOrigin === 'modules' ? '返回工具箱' : '返回首页',
                onAction: function () { open(state.moduleOrigin === 'modules' ? 'modules' : 'home'); }
            }));
            return;
        }
        state.pageCleanup = normalizeCleanup(ret);
        const labels = decorateNameFieldLabels(host);
        const moduleCleanup = state.pageCleanup;
        state.pageCleanup = function () {
            labels.cleanup();
            if (moduleCleanup) moduleCleanup();
        };
        if (ret && typeof ret.then === 'function') {
            ret.then(function () { labels.apply(); }).catch(function (err) {
                console.error('[余小温主控] 模块异步打开失败: ' + id, err);
                flash('这个模块打开时出错了');
            });
        }
        rememberRecent(id);
    }

    function renderSettings() {
        const page = H('div', 'ywcc-page ywcc-settings-page');
        const host = H('div', 'ywcc-host');
        page.appendChild(host);
        state.pageEl.appendChild(page);
        if (typeof deps.mountActorSettings !== 'function') {
            host.appendChild(noteCard('角色与全局设置这次没有加载', '主控没有拿到角色设置接口。'));
            return;
        }
        try {
            const ret = deps.mountActorSettings(host);
            state.pageCleanup = normalizeCleanup(ret);
        } catch (err) {
            console.error('[余小温主控] 角色设置挂载失败', err);
            host.appendChild(noteCard('角色与全局设置没打开', messageOf(err), { error: true }));
        }
    }

    function updateHomeStatic(result) {
        const preset = currentPresetName();
        const name = state.refs.homeName;
        if (name && name.isConnected) {
            name.textContent = preset || '未读取到当前预设';
            name.classList.toggle('is-muted', !preset);
        }
        /* 商店广播只做文案/class 的最小更新；绝不能重画首页（PC 的滚动/焦点会丢）。 */
        updateStoreEntry();
        const active = getActiveSchemeSafe();
        const activeName = state.refs.homeActiveName;
        if (activeName && activeName.isConnected) {
            activeName.textContent = active ? '当前方案 · ' + active.name : '';
            activeName.hidden = !active;
        }
        const moduleSub = state.refs.homeQuickModulesSub;
        if (moduleSub && moduleSub.isConnected) {
            moduleSub.textContent = result.error ? '清单暂时读不到' : '';
        }
        if (state.refs.homeSchemesHost && state.refs.homeSchemesHost.isConnected) renderHomeSchemes();
        if (state.refs.homeFavHost && state.refs.homeFavHost.isConnected) renderHomeFavorites();
        if (state.refs.homeRecentHost && state.refs.homeRecentHost.isConnected) renderHomeRecent();
    }

    function updateSettingsCards() {
        if (!state.settingsMounts.size) return;
        const result = getModulesSafe();
        state.settingsMounts.forEach(function (entry) {
            if (!entry.card) return;
            entry.card.dataset.ywccTheme = state.theme;
            if (!entry.note) return;
            /* 当前预设行已按作者反馈删除；这里只留模块清单异常这一种必要提示。 */
            const text = result.error ? '模块清单暂时读不到' : '';
            entry.note.textContent = text;
            entry.note.hidden = !text;
        });
    }

    function refresh() {
        if (state.disposed) return;
        syncTheme();
        syncViewport();
        updateSettingsCards();
        if (!state.open || !state.built) return;
        const result = getModulesSafe();
        const signature = registrySigOf(result);
        const changed = signature !== state.registrySig;
        state.registrySig = signature;
        if (state.page === 'modules' && !state.moduleId) {
            if (changed) renderModuleList();
            else updateChrome();
        } else if (state.page === 'modules' && state.moduleId) {
            const exists = result.modules.some(function (m) { return m.id === state.moduleId; });
            if (changed && !exists) {
                releasePage();
                renderPage();
                updateChrome();
            } else {
                updateChrome();
            }
        } else if (state.page === 'home') {
            updateHomeStatic(result);
            updateChrome();
        } else {
            updateChrome();
        }
    }

    function mountSettings(container) {
        if (state.disposed) return function () { };
        if (typeof container === 'string') container = doc.querySelector(container);
        if (container && container.jquery && container[0]) container = container[0];
        if (!container || typeof container.appendChild !== 'function') {
            console.warn('[余小温主控] mountSettings 需要一个容器元素');
            return function () { };
        }
        ensureStyle();
        buildShell();
        startThemeWatch();
        const previous = state.settingsMounts.get(container);
        if (previous) {
            try { previous.cleanup(); } catch (err) { /* 忽略 */ }
        }

        const card = H('section', 'ywcc-setting-card');
        card.dataset.ywccTheme = detectTheme();
        card.setAttribute('data-ywcc-settings-card', '');
        const head = H('div', 'ywcc-setting-head');
        const mark = H('span', 'ywcc-setting-mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.innerHTML = ICONS.flame;
        const text = H('div', 'ywcc-setting-text');
        text.appendChild(H('h4', 'ywcc-setting-title', '余温总控台'));
        head.append(mark, text);

        const actions = H('div', 'ywcc-setting-actions');
        actions.setAttribute('data-ywcc-settings-actions', '');
        const openBtn = H('button', 'ywcc-btn ywcc-btn-primary', '打开总控台');
        openBtn.type = 'button';
        openBtn.dataset.ywccAct = 'open';
        openBtn.setAttribute('aria-haspopup', 'dialog');
        openBtn.setAttribute('aria-controls', ROOT_ID);
        const settingsBtn = H('button', 'ywcc-btn', '设置');
        settingsBtn.type = 'button';
        settingsBtn.dataset.ywccAct = 'settings';
        settingsBtn.setAttribute('aria-haspopup', 'dialog');
        settingsBtn.setAttribute('aria-controls', ROOT_ID);
        actions.append(openBtn, settingsBtn);
        head.appendChild(actions);

        /* 两个给主模块用的真实节点槽：
           - versionSlot：主把原 kimi-ver-card（版本/检查更新/更新徽标）整节点移进来；
           - content：主把原 11 张 details 与动态商店/更新器按原节点移进来。
           cc 只创建空壳，不清空、不复制、不接管子节点。 */
        const versionSlot = H('div', 'ywcc-setting-version');
        versionSlot.setAttribute('data-ywcc-version-slot', '');
        const content = H('div', 'ywcc-setting-content');
        content.setAttribute('data-ywcc-settings-content', '');
        const note = H('p', 'ywcc-setting-note', '');
        note.setAttribute('data-ywcc-settings-note', '');
        note.hidden = true;
        card.append(head, versionSlot, content, note);

        function onClick(ev) {
            const btn = ev.target && ev.target.closest ? ev.target.closest('button[data-ywcc-act]') : null;
            if (!btn || !card.contains(btn)) return;
            open(btn.dataset.ywccAct === 'settings' ? 'settings' : 'home');
        }
        card.addEventListener('click', onClick);
        container.appendChild(card);

        const refs = {
            card: card,
            head: head,
            actions: actions,
            content: content,
            versionSlot: versionSlot,
            note: note,
            container: container
        };
        const entry = { card: card, note: note, refs: refs, cleanup: null };
        entry.cleanup = function () {
            card.removeEventListener('click', onClick);
            card.remove();
            if (state.settingsMounts.get(container) === entry) state.settingsMounts.delete(container);
            releaseStyleIfIdle();
        };
        /* 返回契约仍是 cleanup 函数；refs 挂在同一函数上，主可 cleanup.refs.content 直接 append。
           主负责在调用 cleanup 前把移入的原节点还原。 */
        entry.cleanup.refs = refs;
        state.settingsMounts.set(container, entry);
        updateSettingsCards();
        return entry.cleanup;
    }

    function getSettingsRefs(container) {
        if (state.disposed) return null;
        if (container !== undefined && container !== null) {
            if (typeof container === 'string') container = doc.querySelector(container);
            if (container && container.jquery && container[0]) container = container[0];
            const entry = state.settingsMounts.get(container);
            return entry ? entry.refs : null;
        }
        const first = state.settingsMounts.values().next();
        return first && !first.done ? first.value.refs : null;
    }

    function applyPanelPosition() {
        if (!state.panel) return;
        const panel = state.panel;
        if (isMobile()) {
            panel.style.removeProperty('left');
            panel.style.removeProperty('top');
            panel.style.removeProperty('right');
            panel.style.removeProperty('width');
            panel.style.removeProperty('height');
            return;
        }
        if (state.panelPos) {
            panel.style.left = Math.round(state.panelPos.left) + 'px';
            panel.style.top = Math.round(state.panelPos.top) + 'px';
            panel.style.right = 'auto';
            clampPanel();
        } else {
            panel.style.removeProperty('left');
            panel.style.removeProperty('top');
            panel.style.removeProperty('right');
        }
    }

    function clampPanel() {
        if (!state.panel || isMobile()) return;
        const rect = state.panel.getBoundingClientRect();
        const vw = win.innerWidth || 0;
        const vh = win.innerHeight || 0;
        const margin = 8;
        let left = parseFloat(state.panel.style.left);
        let top = parseFloat(state.panel.style.top);
        if (isNaN(left)) left = rect.left;
        if (isNaN(top)) top = rect.top;
        left = Math.min(Math.max(left, margin), Math.max(margin, vw - rect.width - margin));
        top = Math.min(Math.max(top, margin), Math.max(margin, vh - rect.height - margin));
        state.panel.style.left = Math.round(left) + 'px';
        state.panel.style.top = Math.round(top) + 'px';
        state.panel.style.right = 'auto';
        state.panelPos = { left: left, top: top };
    }

    function onViewportChange() {
        if (state.drag) return;
        syncViewport();
        applyPanelPosition();
        emitPanelGeometry();
        scheduleActiveVisible();
    }

    function scheduleActiveVisible() {
        clearTimeout(state.focusTimer);
        state.focusTimer = win.setTimeout(function () {
            if (!state.open || !isMobile() || !state.root || !state.scrollEl) return;
            const active = doc.activeElement;
            if (!active || !state.root.contains(active) || !state.scrollEl.contains(active)) return;
            const tag = (active.tagName || '').toUpperCase();
            const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
            if (!editable) return;
            try {
                active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            } catch (err) {
                try { active.scrollIntoView(false); } catch (ignore) { /* 忽略 */ }
            }
        }, 80);
    }

    function onDragStart(ev) {
        if (!state.panel || isMobile()) return;
        if (ev.button !== undefined && ev.button !== 0) return;
        if (ev.pointerType === 'touch') return;
        const target = ev.target;
        if (target && target.closest && target.closest('button, a, input, select, textarea, [data-ywcc-nodrag]')) return;
        const rect = state.panel.getBoundingClientRect();
        state.drag = {
            id: ev.pointerId,
            startX: ev.clientX,
            startY: ev.clientY,
            left: rect.left,
            top: rect.top,
            moved: false
        };
        state.panel.style.left = rect.left + 'px';
        state.panel.style.top = rect.top + 'px';
        state.panel.style.right = 'auto';
        state.root.classList.add('ywcc-dragging');
        try { state.head.setPointerCapture(ev.pointerId); } catch (err) { /* 忽略 */ }
        win.addEventListener('pointermove', onDragMove, true);
        win.addEventListener('pointerup', onDragEnd, true);
        win.addEventListener('pointercancel', onDragEnd, true);
        ev.preventDefault();
    }

    function onDragMove(ev) {
        const drag = state.drag;
        if (!drag || ev.pointerId !== drag.id) return;
        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;
        if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        drag.moved = true;
        const rect = state.panel.getBoundingClientRect();
        const vw = win.innerWidth || 0;
        const vh = win.innerHeight || 0;
        const margin = 8;
        let left = drag.left + dx;
        let top = drag.top + dy;
        left = Math.min(Math.max(left, margin), Math.max(margin, vw - rect.width - margin));
        top = Math.min(Math.max(top, margin), Math.max(margin, vh - rect.height - margin));
        state.panel.style.left = Math.round(left) + 'px';
        state.panel.style.top = Math.round(top) + 'px';
        state.panelPos = { left: left, top: top };
        ev.preventDefault();
    }

    function onDragEnd(ev) {
        const drag = state.drag;
        if (!drag || (ev && ev.pointerId !== undefined && ev.pointerId !== drag.id)) return;
        state.drag = null;
        if (state.root) state.root.classList.remove('ywcc-dragging');
        try { state.head.releasePointerCapture(drag.id); } catch (err) { /* 忽略 */ }
        win.removeEventListener('pointermove', onDragMove, true);
        win.removeEventListener('pointerup', onDragEnd, true);
        win.removeEventListener('pointercancel', onDragEnd, true);
        if (drag.moved) {
            clampPanel();
            emitPanelGeometry();
        }
    }

    function dispose() {
        if (state.disposed) return;
        closeInternal(true);
        state.settingsMounts.forEach(function (entry) {
            try { entry.cleanup(); } catch (err) { /* 忽略 */ }
        });
        state.settingsMounts.clear();
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
        clearTimeout(state.themeTimer);
        clearTimeout(state.toastTimer);
        clearTimeout(state.focusTimer);
        if (state.vv) {
            try {
                state.vv.removeEventListener('resize', onViewportChange);
                state.vv.removeEventListener('scroll', onViewportChange);
            } catch (err) { /* 忽略 */ }
            state.vv = null;
        }
        if (state.built) {
            win.removeEventListener('resize', onViewportChange);
            win.removeEventListener('orientationchange', onViewportChange);
            win.removeEventListener('pointermove', onDragMove, true);
            win.removeEventListener('pointerup', onDragEnd, true);
            win.removeEventListener('pointercancel', onDragEnd, true);
        }
        if (state.root) state.root.remove();
        state.root = null;
        state.panel = null;
        state.head = null;
        state.scrollEl = null;
        state.pageEl = null;
        state.navEl = null;
        state.toastEl = null;
        state.built = false;
        state.disposed = true;
        state.actionRuns.clear();
        releaseStyleIfIdle();
    }

    return {
        mountSettings: mountSettings,
        getSettingsRefs: getSettingsRefs,
        open: open,
        close: function () { closeInternal(false); },
        refresh: refresh,
        dispose: dispose,
        isOpen: function () { return state.open; },
        getPanelRect: getPanelRect
    };
}

export default createControlCenter;
