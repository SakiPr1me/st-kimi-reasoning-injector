/* 余小温 · 主控伴侣（正式组件 · 图集运行时 1.3.4）
 *
 * 设计边界：
 *  - 只读/写根 settings.companion（由外壳传入 getSettings/saveSettings）；不碰预设、不碰聊天、不写文件。
 *  - 运行时只用 canvas + 一张（或极少量）图集；**绝不创建 video 元素**，不做逐帧网络加载。
 *  - 1.3.4（作者：只点头部，圆外要能原生点到底层）：root/stage/canvas 永远 pointer-events:none，
 *    唯一可点的是一个独立的透明 .ywc-hit 圆（border-radius:50% + clip-path:circle(50%)）。
 *    圆心/半径按当前显示帧 alpha 的顶部头区 bbox + canvas 实际缩放计算，只圈头（64 档直径 24~32 视觉 px），
 *    不再是整块 64x94 矩形，也不再按全身逐像素 alpha 拒绝头部有效点击；圆外不做事件转发，鼠标原生穿透。
 *  - 1.3.3 的真实 alpha 位图保留为“找头”的数据源（缓存按帧）；点击/拖动只认头部圆几何。
 *  - 角色永远停在自己的 home 位置：主控面板开/关只切 avoid/data 属性，不迁移 stage/pos，也不切换动作。
 *  - 1.3.2 起只有一种停放形态：扒边 cling（r4 48 帧本身含真实眨眼），
 *    即使旧设置 defaultDock=float 也播 cling，不播 idle/float；不额外加 CSS sway/press 位移。
 *  - hover 只更新 hovering 标记，不再选 exit/sway/return；面板开/关也不选动作、不移动。
 *  - click/tap 只调用 onActivate（总控开关由主 index 处理），不移动、不重置动作、不做按压位移。
 *  - 面板与角色重叠时角色保持清晰可见、pointer-events 始终 auto；面板打开后还能再点角色关闭。
 *  - 拖动暂停动画；7px 内算点击，超过算拖动；松手吸附最近侧或漂浮并 clamp。
 *  - 只有一个 requestAnimationFrame 循环；页面隐藏 / 减少动态 / static 时停止；dispose 全清。
 *
 * 图集清单（companion-manifest.json，放在 assets/ 下；媒体支按此 schema 交付）：
 *  {
 *    "version": 1,
 *    "atlas": "companion-atlas.png",       // 单页简写；多页用 atlases
 *    "columns": 12,                         // 图集列数
 *    "atlasCellWidth": 221, "atlasCellHeight": 326,  // 兼容媒体现有字段
 *    "cellWidth": 221, "cellHeight": 326,   // 二选一
 *    "frameWidth": 442, "frameHeight": 651, // 绘制到 canvas 的逻辑尺寸
 *    "facing": "left",                      // 原图人物面向；默认 left（左贴边自动镜像）
 *    "static": "companion-static.png",      // 可选：图集失败时的单帧兜底（最多再加 1 张图）
 *    "anchor": { "x": 0.5, "y": 0.92 },     // 可选：输出帧里的统一锚点（归一化）
 *    "blinkEvery": [22, 48],                // 可选：贴边待机眨眼间隔（秒，范围）；不按 loop 机械眨眼
 *    "dock": { "visible": 0.5 },            // 贴边可见比例：0.5 = 半张脸
 *    "atlases": [                            // 可选：多页（媒体当前计划 2 页 < 30MB）
 *      { "id": "a", "file": "atlas-a.png", "columns": 12, "cellWidth": 221, "cellHeight": 326 },
 *      { "id": "b", "file": "atlas-b.png", "columns": 12, "cellWidth": 221, "cellHeight": 326 }
 *    ],
 *    "actions": {
 *      "edge":   { "frames": [0,1,2], "fps": 8,  "loop": true },
 *      "float":  { "frames": [10,11], "fps": 8,  "loop": true },
 *      "open":   { "frames": [20,21], "fps": 8,  "loop": true },
 *      "exit":   { "frames": [30,31], "fps": 12, "loop": false },
 *      "sway":   { "frames": [40,41], "fps": 8,  "loop": true },
 *      "return": { "frames": [60,61], "fps": 12, "loop": false },
 *      "blink":  { "frames": [62,63,64], "fps": 12, "loop": false }
 *    }
 *  }
 *  frames 可写成数字数组、{index} 数组、{from,to} / {start,end} 区间，或逐帧对象：
 *    { "atlas": "b", "index": 12 }
 *    { "atlas": "b", "rect": { "x": 0, "y": 0, "w": 221, "h": 326 }, "anchor": { "x": 110, "y": 300 } }
 *  rect 用图集像素；anchor 用该帧源像素。输出画布取所有 rect 的最大宽（媒体 exit 240x256），
 *  每帧 1:1 绘制、按 anchor 对齐到画布 x 中心与 y=底上 15px，窄帧留边不横向拉伸。
 *  return 缺失时自动取 exit 倒放；1.3.2 起绝不跨姿势 crossfade：
 *  旧 160ms fadeFrom 先把上一姿势画满、再叠新姿势，跳/落时会出现双轮廓重影。
 *  manifest 里即使还有 spin 片段，运行时也不选中、不播放（作者 2026-11-12 明确取消）。
 *  旧版逐帧 PNG / WebM 素材不再由本运行时加载；清单缺失时只显示 CSS 火种占位，不混用旧人物。
 */

export const COMPANION_VERSION = '1.3.4';

export const COMPANION_DEFAULTS = Object.freeze({
    enabled: true,
    animation: true,
    reduced: false,
    size: 64,
    frequency: 'low',
    speed: 1,
    snap: true,
    defaultDock: 'right',
    hover: true,
    position: null,
});

/** 旧素材名保留给外壳/文档引用，新运行时不再加载这些 WebM。 */
export const COMPANION_ASSETS = Object.freeze({
    manifest: 'companion-manifest.json',
    atlas: 'companion-atlas.png',
    fullVideo: 'actor-alpha24.webm',
    exit: 'actor-exit.webm',
    cling: 'actor-cling-loop.webm',
    idle: 'actor-idle-loop.webm',
    sway: 'actor-sway-loop.webm',
    return: 'actor-return.webm',
    peek: 'actor-peek.png',
    full: 'actor-full.png',
    open: 'actor-open.png',
});

const DEFAULT_MANIFEST_FILE = 'companion-manifest.json';

// 2026-11-12 r3: 素材本身已经是天然扒边（墙后真实半脸 + 小手），运行时不再套
// head polygon / 手套平移那套旧硬 mask。贴边裁切线来自素材自己的墙边，
// 只用 edgeX + anchor 计算舞台位移；不拼手、不裁躯干。

const ACTION_GROUPS = Object.freeze({
    edge: ['edge', 'cling', 'peek'],
    float: ['float', 'idle'],
    open: ['open', 'float', 'idle'],
    exit: ['exit', 'emerge'],
    sway: ['sway', 'hover'],
    back: ['return', 'back'],
});

const FREQUENCY = Object.freeze({
    low: [24000, 36000],
    medium: [12000, 18000],
    high: [6000, 9000],
});

const DEFAULT_ASSET_BASE = (() => {
    try {
        return new URL('./assets/', import.meta.url).href;
    } catch (e) {
        return './assets/';
    }
})();

// 1.3.3 alpha 命中阈值：只看明显不透明的角色像素，避开半透明阴影/抠图毛边。
const ALPHA_HIT_MIN = 32;
// 按“当前显示帧”缓存 alpha 位图；最多留 128 帧，避免长循环无限长。
const ALPHA_MASK_LIMIT = 128;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const now = () => Date.now();

/** 与主 defaultSettings 同一个来源；主可直接 `defaultSettings.companion = COMPANION_DEFAULTS`。 */
export function normalizeCompanionSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = { ...COMPANION_DEFAULTS };
    for (const key of Object.keys(COMPANION_DEFAULTS)) {
        if (src[key] !== undefined) out[key] = src[key];
    }
    out.enabled = !!out.enabled;
    out.animation = !!out.animation;
    out.reduced = !!out.reduced;
    out.snap = !!out.snap;
    out.hover = !!out.hover;
    out.size = clamp(Math.round(num(out.size, COMPANION_DEFAULTS.size)), 40, 200);
    out.speed = clamp(num(out.speed, COMPANION_DEFAULTS.speed), 0.5, 2);
    out.frequency = Object.prototype.hasOwnProperty.call(FREQUENCY, out.frequency) ? out.frequency : 'low';
    out.defaultDock = out.defaultDock === 'left' || out.defaultDock === 'right' || out.defaultDock === 'float'
        ? out.defaultDock : 'right';
    const p = out.position;
    if (p && typeof p === 'object' && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
        out.position = {
            x: Math.round(Number(p.x)),
            y: Math.round(Number(p.y)),
            dock: p.dock === 'left' || p.dock === 'right' || p.dock === 'float' ? p.dock : null,
        };
    } else {
        out.position = null;
    }
    return out;
}

/** 读整份工具箱 settings 里的 companion 字段；字段缺失时返回同源默认，不写回。 */
export function readCompanionSettings(settings) {
    return normalizeCompanionSettings(settings && typeof settings === 'object' ? settings.companion : undefined);
}

/** 外壳需要显式补默认时用这个；返回写入后的 companion 对象。 */
export function writeCompanionSettings(settings, companion) {
    if (!settings || typeof settings !== 'object') return normalizeCompanionSettings(companion);
    settings.companion = normalizeCompanionSettings(companion);
    return settings.companion;
}

export function companionViewport(win) {
    const w = win || globalThis;
    const vv = w.visualViewport;
    return {
        left: num(vv && vv.offsetLeft, 0),
        top: num(vv && vv.offsetTop, 0),
        width: Math.max(0, num(vv && vv.width, num(w.innerWidth, 0))),
        height: Math.max(0, num(vv && vv.height, num(w.innerHeight, 0))),
    };
}

export function companionHeight(size) {
    return Math.round(num(size, COMPANION_DEFAULTS.size) * 336 / 228);
}

export function clampCompanionPosition(position, size, viewport) {
    const vp = viewport || companionViewport(globalThis);
    const w = num(size, COMPANION_DEFAULTS.size);
    const h = companionHeight(w);
    const x = clamp(num(position && position.x, vp.left), vp.left, vp.left + Math.max(0, vp.width - w));
    const y = clamp(num(position && position.y, vp.top), vp.top, vp.top + Math.max(0, vp.height - h));
    return { x: Math.round(x), y: Math.round(y) };
}

export function deriveCompanionDock(position, size, viewport, edgeThreshold) {
    if (!position) return null;
    const vp = viewport || companionViewport(globalThis);
    const w = num(size, COMPANION_DEFAULTS.size);
    const t = Math.max(4, num(edgeThreshold, 18));
    const x = num(position.x, vp.left);
    if (x <= vp.left + t) return 'left';
    if (x + w >= vp.left + vp.width - t) return 'right';
    return 'float';
}

export function snapCompanionDock(position, size, viewport, edgeThreshold) {
    const vp = viewport || companionViewport(globalThis);
    const w = num(size, COMPANION_DEFAULTS.size);
    const h = companionHeight(w);
    const p = clampCompanionPosition(position, w, vp);
    const t = Math.max(8, num(edgeThreshold, 26));
    let dock = 'float';
    if (p.x <= vp.left + t) dock = 'left';
    else if (p.x + w >= vp.left + vp.width - t) dock = 'right';
    if (dock === 'left') return { x: vp.left, y: p.y, dock };
    if (dock === 'right') return { x: vp.left + vp.width - w, y: p.y, dock };
    return { x: p.x, y: p.y, dock: 'float' };
}

/**
 * @deprecated 1.1 起角色不再跟随主控窗；保留导出只为旧外壳/旧测试不报错。
 * 新逻辑里 setPanelOpen 不会调用它，也不会写 state.stage。
 */
export function computeCompanionStage(panelRect, size, viewport, preferredDock) {
    const vp = viewport || companionViewport(globalThis);
    const w = num(size, COMPANION_DEFAULTS.size);
    const h = companionHeight(w);
    const gap = Math.max(8, Math.round(w * 0.18));
    if (!panelRect || !Number.isFinite(Number(panelRect.left)) || !Number.isFinite(Number(panelRect.width))) {
        const dock = preferredDock === 'left' || preferredDock === 'right' ? preferredDock : 'float';
        if (dock === 'left') return clampCompanionPosition({ x: vp.left + Math.round(w * 0.32), y: vp.top + vp.height - h - gap }, w, vp);
        if (dock === 'right') return clampCompanionPosition({ x: vp.left + vp.width - w - Math.round(w * 0.32), y: vp.top + vp.height - h - gap }, w, vp);
        return clampCompanionPosition({ x: vp.left + vp.width - w - gap, y: vp.top + vp.height - h - gap }, w, vp);
    }
    const leftFree = Math.max(0, Number(panelRect.left) - vp.left);
    const rightFree = Math.max(0, vp.left + vp.width - (Number(panelRect.left) + Number(panelRect.width)));
    let side = preferredDock === 'left' ? 'left' : preferredDock === 'right' ? 'right' : (leftFree >= rightFree ? 'left' : 'right');
    if (side === 'left' && leftFree < w + gap && rightFree >= w + gap) side = 'right';
    if (side === 'right' && rightFree < w + gap && leftFree >= w + gap) side = 'left';
    const panelBottom = Number(panelRect.top) + Number(panelRect.height);
    const y = clamp(panelBottom - h, vp.top + gap, vp.top + vp.height - h - gap);
    if (leftFree < w + gap && rightFree < w + gap) {
        return clampCompanionPosition({ x: vp.left + gap, y: vp.top + vp.height - h - gap }, w, vp);
    }
    const x = side === 'left' ? Number(panelRect.left) - w - gap : Number(panelRect.left) + Number(panelRect.width) + gap;
    return clampCompanionPosition({ x, y }, w, vp);
}

function resolveAsset(base, file) {
    const b = String(base || DEFAULT_ASSET_BASE);
    if (/^data:/i.test(b)) return b;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(b) || b.startsWith('//')) {
        try { return new URL(file, b.endsWith('/') ? b : b + '/').href; } catch (e) { return b + file; }
    }
    return (b.endsWith('/') ? b : b + '/') + file;
}

function isElement(value) {
    return !!value && typeof value === 'object' && typeof value.appendChild === 'function';
}

function normalizeFrame(item, defaultAtlasId, atlasById) {
    if (Number.isFinite(Number(item))) {
        return { atlas: defaultAtlasId, index: Math.max(0, Math.round(Number(item))), rect: null, anchor: null };
    }
    if (!item || typeof item !== 'object') return null;
    let atlas = typeof item.atlas === 'string' ? item.atlas : typeof item.page === 'string' ? item.page : defaultAtlasId;
    if (!atlasById[atlas]) atlas = defaultAtlasId;
    let rect = null;
    if (item.rect && typeof item.rect === 'object') {
        const w = num(item.rect.w !== undefined ? item.rect.w : item.rect.width, 0);
        const h = num(item.rect.h !== undefined ? item.rect.h : item.rect.height, 0);
        if (w > 0 && h > 0) {
            rect = {
                x: Math.round(num(item.rect.x, 0)),
                y: Math.round(num(item.rect.y, 0)),
                w: Math.round(w),
                h: Math.round(h),
            };
        }
    }
    const index = Number.isFinite(Number(item.index)) ? Math.max(0, Math.round(Number(item.index))) : null;
    if (!rect && index === null) return null;
    let anchor = null;
    if (item.anchor && typeof item.anchor === 'object'
        && Number.isFinite(Number(item.anchor.x)) && Number.isFinite(Number(item.anchor.y))) {
        anchor = { x: Number(item.anchor.x), y: Number(item.anchor.y) };
    }
    return { atlas, index, rect, anchor };
}

function normalizeAction(name, def, defaultAtlasId, atlasById) {
    if (!def || typeof def !== 'object') return null;
    const fps = clamp(num(def.fps, 12), 1, 30);
    const actionAtlas = typeof def.atlas === 'string' && atlasById[def.atlas] ? def.atlas : defaultAtlasId;
    const frames = [];
    const pushRange = (fromRaw, toRaw, atlasRaw) => {
        const from = Math.max(0, Math.round(num(fromRaw, 0)));
        const to = Math.max(from, Math.round(num(toRaw, from)));
        const atlas = typeof atlasRaw === 'string' && atlasById[atlasRaw] ? atlasRaw : actionAtlas;
        for (let i = from; i <= to; i++) frames.push({ atlas, index: i, rect: null, anchor: null });
    };
    const raw = def.frames !== undefined ? def.frames : def.indices;
    if (Array.isArray(raw)) {
        for (const item of raw) {
            const frame = normalizeFrame(item, actionAtlas, atlasById);
            if (frame) frames.push(frame);
        }
    } else if (raw && typeof raw === 'object') {
        pushRange(raw.from !== undefined ? raw.from : raw.start,
            raw.to !== undefined ? raw.to : raw.end, raw.atlas);
    } else if (Number.isFinite(Number(def.start)) && Number.isFinite(Number(def.end))) {
        pushRange(def.start, def.end, actionAtlas);
    }
    if (Array.isArray(def.ranges)) {
        for (const range of def.ranges) {
            if (Array.isArray(range)) pushRange(range[0], range[1], range[2]);
            else if (range && typeof range === 'object') {
                pushRange(range.from !== undefined ? range.from : range.start,
                    range.to !== undefined ? range.to : range.end, range.atlas);
            }
        }
    }
    if (Array.isArray(def.exclude)) {
        const excluded = new Set();
        for (const range of def.exclude) {
            if (Array.isArray(range)) {
                const from = Math.max(0, Math.round(num(range[0], 0)));
                const to = Math.max(from, Math.round(num(range[1], from)));
                for (let i = from; i <= to; i++) excluded.add(i);
            } else if (Number.isFinite(Number(range))) {
                excluded.add(Math.max(0, Math.round(Number(range))));
            }
        }
        if (excluded.size) {
            const filtered = frames.filter(frame => !(frame.rect === null && excluded.has(frame.index)));
            frames.splice(0, frames.length, ...filtered);
        }
    }
    if (!frames.length) return null;
    return {
        name,
        frames,
        fps,
        loop: !!def.loop,
        holdLast: !!def.holdLast,
        oneShot: def.oneShot !== false,
        edgeX: def.edgeX !== null && def.edgeX !== undefined
            && Number.isFinite(Number(def.edgeX)) ? Number(def.edgeX) : null,
        appliesTo: Array.isArray(def.appliesTo) ? def.appliesTo.slice() : null,
    };
}

function normalizeAtlasPages(raw, columns, cellWidth, cellHeight) {
    const pages = [];
    const push = (id, def) => {
        if (!def || typeof def !== 'object' || typeof def.file !== 'string') return;
        pages.push({
            id: String(id || ('page-' + pages.length)),
            file: def.file,
            columns: Math.max(1, Math.round(num(def.columns, columns))),
            cellWidth: Math.max(1, Math.round(num(
                def.atlasCellWidth !== undefined ? def.atlasCellWidth : def.cellWidth, cellWidth))),
            cellHeight: Math.max(1, Math.round(num(
                def.atlasCellHeight !== undefined ? def.atlasCellHeight : def.cellHeight, cellHeight))),
        });
    };
    if (Array.isArray(raw.atlases)) {
        raw.atlases.forEach((def, i) => push(def && def.id !== undefined ? def.id : 'page-' + i, def));
    } else if (raw.atlases && typeof raw.atlases === 'object') {
        for (const [id, def] of Object.entries(raw.atlases)) {
            if (typeof def === 'string') push(id, { file: def });
            else push(def && def.id !== undefined ? def.id : id, def);
        }
    }
    if (!pages.length && typeof raw.atlas === 'string') {
        push('main', { file: raw.atlas, columns, cellWidth, cellHeight });
    }
    return pages.slice(0, 4);
}

function mediaFrameTable(raw, pages) {
    const candidates = [
        raw.frames,
        raw.frameMap,
        raw.frameRects,
        raw.frameTable,
        raw.atlas && raw.atlas.frames,
        raw.atlas && raw.atlas.frameRects,
        raw.atlas && raw.atlas.frameTable,
    ];
    for (const page of pages) {
        if (page && Array.isArray(page.frames)) candidates.push(page.frames);
    }
    const table = new Map();
    const pageId = (value) => {
        if (typeof value === 'string') {
            const page = pages.find(item => item.id === value || item.file === value);
            return page ? page.id : null;
        }
        if (Number.isFinite(Number(value))) {
            const index = Math.max(0, Math.round(Number(value)));
            return pages[index] ? pages[index].id : pages[index - 1] ? pages[index - 1].id : null;
        }
        return null;
    };
    const put = (key, value, fallbackPage) => {
        const sourceFrame = Number.isFinite(Number(key)) ? Math.round(Number(key))
            : value && Number.isFinite(Number(value.sourceFrame)) ? Math.round(Number(value.sourceFrame)) : null;
        if (sourceFrame === null) return;
        if (Array.isArray(value)) {
            table.set(sourceFrame, {
                atlas: pageId(value[0]) || fallbackPage,
                rect: { x: Math.round(num(value[1], 0)), y: Math.round(num(value[2], 0)), w: Math.round(num(value[3], 0)), h: Math.round(num(value[4], 0)) },
                anchor: null,
            });
            return;
        }
        if (!value || typeof value !== 'object') return;
        let rect = value.rect && typeof value.rect === 'object' ? value.rect : value;
        if (Array.isArray(rect)) rect = { x: rect[0], y: rect[1], w: rect[2], h: rect[3] };
        const w = num(rect.w !== undefined ? rect.w : rect.width, 0);
        const h = num(rect.h !== undefined ? rect.h : rect.height, 0);
        if (!(w > 0 && h > 0)) return;
        const anchor = value.anchor && typeof value.anchor === 'object'
            && Number.isFinite(Number(value.anchor.x)) && Number.isFinite(Number(value.anchor.y))
            ? { x: Number(value.anchor.x), y: Number(value.anchor.y) } : null;
        table.set(sourceFrame, {
            atlas: pageId(value.page !== undefined ? value.page
                : value.pageIndex !== undefined ? value.pageIndex
                    : value.atlas !== undefined ? value.atlas : value.sheet) || fallbackPage,
            rect: {
                x: Math.round(num(rect.x !== undefined ? rect.x : rect.left, 0)),
                y: Math.round(num(rect.y !== undefined ? rect.y : rect.top, 0)),
                w: Math.round(w),
                h: Math.round(h),
            },
            anchor,
        });
    };
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            for (const value of candidate) put(value && value.sourceFrame, value, pages[0] && pages[0].id);
        } else if (candidate && typeof candidate === 'object') {
            for (const [key, value] of Object.entries(candidate)) put(key, value, pages[0] && pages[0].id);
        }
        if (table.size) break;
    }
    return table;
}

function outputFrameSize(frameWidth, frameHeight, actions) {
    const baseWidth = Math.max(1, Math.round(num(frameWidth, 1)));
    const baseHeight = Math.max(1, Math.round(num(frameHeight, 1)));
    let height = baseHeight;
    // Common anchor position: align every frame by its own anchor, but never
    // crop the frame against the canvas.  Width = max(anchor) + max(right side).
    let anchorX = 0;
    let right = 0;
    let sawFrame = false;
    for (const action of Object.values(actions || {})) {
        for (const frame of action.frames || []) {
            sawFrame = true;
            const w = frame.rect ? frame.rect.w : baseWidth;
            const h = frame.rect ? frame.rect.h : baseHeight;
            const a = frame.anchor && Number.isFinite(Number(frame.anchor.x))
                ? Number(frame.anchor.x) : w / 2;
            anchorX = Math.max(anchorX, a);
            right = Math.max(right, w - a);
            height = Math.max(height, h);
        }
    }
    if (!sawFrame) { anchorX = baseWidth / 2; right = baseWidth / 2; }
    if (!Number.isFinite(anchorX)) anchorX = baseWidth / 2;
    if (!Number.isFinite(right)) right = baseWidth / 2;
    return {
        width: Math.max(1, Math.round(anchorX + right)),
        height,
        anchorX: Math.round(anchorX),
    };
}

function normalizeMediaManifest(raw) {
    const pageDefs = raw.atlas && Array.isArray(raw.atlas.pages) ? raw.atlas.pages : [];
    const frameWidth = Math.max(1, Math.round(num(raw.frameWidth, 176)));
    const frameHeight = Math.max(1, Math.round(num(raw.frameHeight, 256)));
    const pages = pageDefs.map((page, index) => ({
        id: typeof page.id === 'string' ? page.id : 'p' + index,
        file: String(page.file || ''),
        columns: 1,
        cellWidth: frameWidth,
        cellHeight: frameHeight,
        width: Math.round(num(page.width, 0)),
        height: Math.round(num(page.height, 0)),
    })).filter(page => page.file);
    if (!pages.length) return null;
    const pageById = {};
    for (const page of pages) pageById[page.id] = page;
    const table = mediaFrameTable(raw, pages);
    const actions = {};
    for (const [name, def] of Object.entries(raw.actions || {})) {
        if (!def || typeof def !== 'object' || !Array.isArray(def.frames) || !def.frames.length) continue;
        const frames = [];
        for (const item of def.frames) {
            const sourceFrame = item && Number.isFinite(Number(item.sourceFrame))
                ? Math.round(Number(item.sourceFrame)) : Number.isFinite(Number(item)) ? Math.round(Number(item)) : null;
            if (sourceFrame === null) continue;
            const mapped = table.get(sourceFrame);
            let inlineRect = item && item.rect && typeof item.rect === 'object' ? item.rect : null;
            if (Array.isArray(inlineRect)) {
                inlineRect = { x: inlineRect[0], y: inlineRect[1], w: inlineRect[2], h: inlineRect[3] };
            }
            let inline = null;
            if (inlineRect) {
                inline = {
                    x: Math.round(num(inlineRect.x !== undefined ? inlineRect.x : inlineRect.left, 0)),
                    y: Math.round(num(inlineRect.y !== undefined ? inlineRect.y : inlineRect.top, 0)),
                    w: Math.round(num(inlineRect.w !== undefined ? inlineRect.w : inlineRect.width, 0)),
                    h: Math.round(num(inlineRect.h !== undefined ? inlineRect.h : inlineRect.height, 0)),
                };
                if (!(inline.w > 0 && inline.h > 0)) inline = null;
            }
            const rect = inline || (mapped ? mapped.rect : null);
            if (!rect) continue;
            let atlas = mapped ? mapped.atlas : (typeof item.atlas === 'string' ? item.atlas : pages[0].id);
            if (!pageById[atlas]) atlas = pages[0].id;
            const anchor = item && item.anchor && typeof item.anchor === 'object'
                && Number.isFinite(Number(item.anchor.x)) && Number.isFinite(Number(item.anchor.y))
                ? { x: Number(item.anchor.x), y: Number(item.anchor.y) }
                : mapped && mapped.anchor ? mapped.anchor
                    : def.anchor && typeof def.anchor === 'object'
                        ? { x: Number(def.anchor.x), y: Number(def.anchor.y) } : null;
            frames.push({ atlas, index: null, rect, anchor });
        }
        if (!frames.length) continue;
        const expanded = def.pingpong && def.loop && frames.length > 2
            ? frames.concat(frames.slice(1, -1).reverse())
            : frames;
        actions[name] = {
            name,
            frames: expanded,
            fps: clamp(num(def.fps, def.durationMs ? 1000 / Number(def.durationMs) : 12), 1, 30),
            loop: !!def.loop,
            holdLast: !!def.holdLast,
            oneShot: def.loop ? false : true,
            edgeX: def.edgeX !== null && def.edgeX !== undefined
                && Number.isFinite(Number(def.edgeX)) ? Number(def.edgeX) : null,
            appliesTo: Array.isArray(def.appliesTo) ? def.appliesTo.slice() : null,
            derived: def.reverseOf && def.reverse ? def.reverseOf + '-reverse' : undefined,
        };
    }
    // 媒体友方 schema 有时把 return 放入 actions；缺失时仍按 exit 倒放兜底。
    if (!actions.return && actions.exit) {
        actions.return = {
            ...actions.exit,
            name: 'return',
            frames: actions.exit.frames.slice().reverse().map(frame => ({ ...frame })),
            loop: false,
            holdLast: false,
            oneShot: true,
            derived: 'exit-reverse',
        };
    }
    if (!Object.keys(actions).length) return null;
    let blinkEvery = raw.blinkEvery;
    if (!Array.isArray(blinkEvery) && actions.blink) blinkEvery = [22, 48];
    if (Array.isArray(blinkEvery) && blinkEvery.length >= 2) {
        blinkEvery = [Math.max(0.2, num(blinkEvery[0], 22)), Math.max(0.2, num(blinkEvery[1], 48))];
    } else {
        blinkEvery = null;
    }
    const staticDef = raw.static && typeof raw.static === 'object'
        ? (raw.static.full || raw.static.cling) : null;
    const output = outputFrameSize(frameWidth, frameHeight, actions);
    return {
        version: Math.round(num(raw.version, 1)),
        atlases: pages,
        defaultAtlasId: pages[0].id,
        frameWidth,
        frameHeight,
        outputWidth: output.width,
        outputHeight: output.height,
        outputAnchorX: output.anchorX,
        facing: raw.facing === 'right' ? 'right' : 'left',
        staticImage: staticDef && typeof staticDef.file === 'string' ? staticDef.file : null,
        anchor: null,
        blinkEvery,
        dockVisible: clamp(num(raw.dock && raw.dock.visible, 0.5), 0.25, 1),
        actions,
        mediaSchema: raw.schema,
    };
}

function normalizeManifest(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.schema === 'yw-companion-atlas/1') {
        const media = normalizeMediaManifest(raw);
        if (media) return media;
    }
    const columns = Math.max(1, Math.round(num(raw.columns, 1)));
    const cellWidth = Math.max(1, Math.round(num(
        raw.atlasCellWidth !== undefined ? raw.atlasCellWidth : raw.cellWidth, 0)));
    const cellHeight = Math.max(1, Math.round(num(
        raw.atlasCellHeight !== undefined ? raw.atlasCellHeight : raw.cellHeight, 0)));
    const atlases = normalizeAtlasPages(raw, columns, cellWidth, cellHeight);
    if (!atlases.length) return null;
    const atlasById = {};
    for (const page of atlases) atlasById[page.id] = page;
    const defaultAtlasId = atlases[0].id;
    const actions = {};
    const source = raw.actions && typeof raw.actions === 'object' ? raw.actions : {};
    for (const [name, def] of Object.entries(source)) {
        const action = normalizeAction(name, def, defaultAtlasId, atlasById);
        if (action) actions[name] = action;
    }
    // return 缺失时用 exit 倒放（绝不用 spin 倒放）；1.3.1 起不做邻姿 crossfade。
    if (!actions.return && actions.exit) {
        actions.return = {
            ...actions.exit,
            name: 'return',
            frames: actions.exit.frames.slice().reverse().map(frame => ({ ...frame })),
            loop: false,
            holdLast: false,
            oneShot: true,
            derived: 'exit-reverse',
        };
    }
    if (!Object.keys(actions).length) return null;
    const dockDef = raw.dock && typeof raw.dock === 'object' ? raw.dock : {};
    let blinkEvery = raw.blinkEvery !== undefined ? raw.blinkEvery : dockDef.blinkEvery;
    if (Number.isFinite(Number(blinkEvery))) blinkEvery = [Number(blinkEvery), Number(blinkEvery)];
    if (!Array.isArray(blinkEvery) || blinkEvery.length < 2
        || !Number.isFinite(Number(blinkEvery[0])) || !Number.isFinite(Number(blinkEvery[1]))) {
        blinkEvery = null;
    } else {
        blinkEvery = [Math.max(0.2, Number(blinkEvery[0])), Math.max(0.2, Number(blinkEvery[1]))];
    }
    const anchor = raw.anchor && typeof raw.anchor === 'object'
        && Number.isFinite(Number(raw.anchor.x)) && Number.isFinite(Number(raw.anchor.y))
        ? { x: clamp(Number(raw.anchor.x), 0, 1), y: clamp(Number(raw.anchor.y), 0, 1) }
        : null;
    const genericFrameWidth = Math.max(1, Math.round(num(raw.frameWidth, atlases[0].cellWidth)));
    const genericFrameHeight = Math.max(1, Math.round(num(raw.frameHeight, atlases[0].cellHeight)));
    const output = outputFrameSize(genericFrameWidth, genericFrameHeight, actions);
    return {
        version: Math.round(num(raw.version, 1)),
        atlases,
        defaultAtlasId,
        frameWidth: genericFrameWidth,
        frameHeight: genericFrameHeight,
        outputWidth: output.width,
        outputHeight: output.height,
        outputAnchorX: output.anchorX,
        facing: raw.facing === 'right' ? 'right' : 'left',
        staticImage: typeof raw.static === 'string' ? raw.static : null,
        anchor,
        blinkEvery,
        dockVisible: clamp(num(dockDef.visible, 0.5), 0.25, 1),
        actions,
    };
}

/** 供媒体适配/转换脚本使用；直接接受 `yw-companion-atlas/1` 或本运行时清单。 */
export function normalizeCompanionManifest(raw) {
    return normalizeManifest(raw);
}

export function createCompanion(options = {}) {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const win = options.window || (typeof window !== 'undefined' ? window : globalThis);
    const getSettings = typeof options.getSettings === 'function' ? options.getSettings : () => undefined;
    const saveSettings = typeof options.saveSettings === 'function' ? options.saveSettings : null;
    const onActivate = typeof options.onActivate === 'function' ? options.onActivate : null;
    const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;
    const assetBase = resolveAsset(options.assetBase || DEFAULT_ASSET_BASE, '');
    const vp = () => companionViewport(win);

    const state = {
        started: false,
        disposed: false,
        enabled: true,
        settings: normalizeCompanionSettings(undefined),
        dock: 'right',
        pos: null,
        home: null,
        panelOpen: false,
        panelRect: null,
        pendingPanel: null,
        phase: 'static',
        actionName: null,
        restKind: 'edge',
        sequence: null,
        lastActivateAt: 0,
        framePos: 0,
        loops: 0,
        rafId: 0,
        lastTs: 0,
        acc: 0,
        frameAction: null,
        hovering: false,
        dragging: false,
        drag: null,
        pointerId: null,
        errors: [],
        lastNotifyKey: '',
        osReduced: false,
        mediaQuery: null,
        root: null,
        stage: null,
        mirror: null,
        hit: null,
        canvas: null,
        ctx: null,
        placeholder: null,
        manifest: null,
        manifestLoaded: false,
        manifestFailed: false,
        manifestUrl: '',
        atlasImgs: new Map(),
        atlasPages: [],
        atlasReady: false,
        atlasFailed: false,
        atlasUrls: [],
        staticImg: null,
        staticReady: false,
        imageRequests: 0,
        drawnFrameObj: null,
        drawnFrame: null,
        alphaMasks: new Map(),
        alphaMaskFailed: false,
        headCircle: null,
        lastHeadCircle: null,
        nextBlinkAt: 0,
        renderer: 'placeholder',
        avoid: false,
        settingsPanel: null,
        listeners: [],
        assetBase,
        api: null,
    };

    const listen = (target, type, fn, opts) => {
        if (!target || typeof target.addEventListener !== 'function') return;
        target.addEventListener(type, fn, opts);
        state.listeners.push(() => {
            try { target.removeEventListener(type, fn, opts); } catch (e) { /* noop */ }
        });
    };

    const make = (tag, cls, text) => {
        const el = doc.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined) el.textContent = text;
        return el;
    };

    const asset = (key) => resolveAsset(state.assetBase, COMPANION_ASSETS[key]);

    function styleHref() {
        try { return new URL('./companion.css?b=v' + COMPANION_VERSION, import.meta.url).href; } catch (e) { /* data-url/test */ }
        const base = String(state.assetBase || '').replace(/assets\/?$/, '');
        return base + 'companion.css?b=v' + COMPANION_VERSION;
    }

    function ensureStyle() {
        if (!doc) return null;
        try {
            const existing = (doc.getElementById && doc.getElementById('ywc-style')) ||
                (doc.querySelector && doc.querySelector('link[data-ywc-style]'));
            if (existing) return existing;
            const link = doc.createElement('link');
            link.id = 'ywc-style';
            link.rel = 'stylesheet';
            link.href = styleHref();
            link.setAttribute('data-ywc-style', '1');
            (doc.head || doc.documentElement || doc.body).appendChild(link);
            return link;
        } catch (e) {
            mediaError('样式加载失败（已用内联兜底）: ' + (e && e.message ? e.message : e));
            return null;
        }
    }

    function boxWidth() {
        return Math.max(44, Math.round(state.settings.size));
    }

    function boxHeight() {
        return Math.max(44, companionHeight(state.settings.size));
    }

    function isDocked() {
        return state.dock === 'left' || state.dock === 'right';
    }

    function restKind() {
        // 1.3.2：作者明确只要扒边姿态。dock=float 是旧设置/拖到中间的位置状态，
        // 停放渲染仍统一用 edge/cling（不播 idle/float），位置与 dock 本身不改。
        return 'edge';
    }

    function pickAction(group) {
        if (!state.manifest || !state.manifest.actions) return null;
        const names = ACTION_GROUPS[group] || [];
        for (const name of names) {
            if (state.manifest.actions[name]) return name;
        }
        return null;
    }

    function actionDef(name) {
        return state.manifest && state.manifest.actions ? state.manifest.actions[name] || null : null;
    }

    function restActionName(kind) {
        if (kind === 'open') {
            // 旧入口兼容：贴边优先 cling/edge，漂浮优先 float/idle。
            return (isDocked() ? pickAction('edge') : pickAction('float'))
                || pickAction('open') || pickAction('float') || pickAction('edge');
        }
        const group = kind === 'edge' ? 'edge' : 'float';
        return pickAction(group) || pickAction(kind === 'edge' ? 'float' : 'edge');
    }

    /**
     * 贴边可见比例：用 manifest 的 edgeX（裁切边）和 anchor（HOME）算一个
     * 固定的“视口裁切线”，不再用固定 50% 盲裁，也不把画布裁到角色身上。
     * 没有有效 edgeX 时退回旧的 50% 可靠入口，并把问题留在 status 里。
     */
    function edgeShiftRatio() {
        if (!state.manifest || !isDocked()) return 0;
        const edgeName = pickAction('edge');
        const def = edgeName ? actionDef(edgeName) : null;
        const first = def && def.frames && def.frames[0];
        const anchorX = first && first.anchor && Number.isFinite(Number(first.anchor.x))
            ? Number(first.anchor.x) : null;
        if (anchorX === null) return 0.5;
        const edgeX = def && def.edgeX !== null && def.edgeX !== undefined
            && Number.isFinite(Number(def.edgeX)) ? Number(def.edgeX) : null;
        const validEdge = edgeX !== null && edgeX >= 0 && edgeX < anchorX;
        if (!validEdge) return 0.5;
        // r3 素材把墙边裁切线已经做进画面（edgeX=0 就是裁切线），
        // 运行时不再加 EDGE_FACE_CUT_X 那类硬 mask 偏移。
        const cut = edgeX;
        const outputAnchorX = Number.isFinite(Number(state.manifest.outputAnchorX))
            ? Number(state.manifest.outputAnchorX)
            : (state.canvas ? state.canvas.width / 2 : anchorX);
        const canvasWidth = Number.isFinite(Number(state.manifest.outputWidth)) && state.manifest.outputWidth > 0
            ? state.manifest.outputWidth
            : (state.canvas ? state.canvas.width : 1);
        const cutCanvas = outputAnchorX - anchorX + cut;
        // 贴边位移 = 把裁切线推到视口边所需的舞台位移（不是它的补数）。
        // 旧版写成 1 - cut/width，导致左/右都多露约一倍，且和镜像侧绑死；
        // 现在两边统一用 cutLocal/width：左贴边裁切线落视口左缘，镜像后的右贴边落右缘。
        return clamp(cutCanvas / canvasWidth, 0, 0.9);
    }

    function edgeShiftPercent() {
        if (!state.manifest || !isDocked()) return 0;
        // cling/blink 是贴边待机；exit/sway/spin 是出边动作，先不额外平移。
        // return 要从出边位置回到贴边，所以现在就用贴边位移，让 CSS 长过渡
        // 和 return 片段一起回边；否则 return 结束回到 rest 时会再横向跳一次。
        if (state.actionName === 'return') return edgeShiftRatio();
        const edgeVisible = state.phase === 'rest' || state.phase === 'static' || state.actionName === 'blink';
        return edgeVisible ? edgeShiftRatio() : 0;
    }

    function snapshot() {
        const m = state.manifest;
        const clips = {};
        if (m) {
            for (const name of Object.keys(m.actions)) {
                clips[name] = {
                    ready: !!state.atlasReady,
                    failed: !!state.atlasFailed,
                    error: state.atlasFailed ? 'atlas load failed' : null,
                    frames: m.actions[name].frames.length,
                    loop: m.actions[name].loop,
                };
            }
        }
        return {
            version: COMPANION_VERSION,
            started: state.started,
            disposed: state.disposed,
            enabled: state.enabled,
            phase: state.phase,
            action: state.actionName,
            sequence: state.sequence,
            clip: state.actionName,
            frame: state.framePos,
            loops: state.loops,
            staticFrame: state.restKind,
            dock: state.dock,
            edge: isDocked() ? state.dock : null,
            mode: state.dock,
            panelOpen: state.panelOpen,
            hovering: state.hovering,
            dragging: state.dragging,
            position: state.pos ? { x: state.pos.x, y: state.pos.y } : null,
            home: state.home ? { x: state.home.x, y: state.home.y } : null,
            stage: null,
            hit: state.headCircle ? {
                shape: 'circle',
                x: state.headCircle.x,
                y: state.headCircle.y,
                diameter: state.headCircle.diameter,
                canvasX: state.headCircle.cx,
                canvasY: state.headCircle.cy,
                canvasRadius: state.headCircle.r,
            } : null,
            avoid: state.avoid,
            size: state.settings.size,
            height: companionHeight(state.settings.size),
            viewport: vp(),
            animation: animationOn(),
            currentPaused: !state.rafId,
            continuousCling: state.phase === 'rest' && state.restKind === 'edge',
            reduced: state.settings.reduced,
            osReduced: state.osReduced,
            speed: state.settings.speed,
            frequency: state.settings.frequency,
            renderer: state.renderer,
            outputWidth: m ? m.outputWidth : null,
            outputHeight: m ? m.outputHeight : null,
            outputAnchorX: m ? m.outputAnchorX : null,
            edgeShift: edgeShiftPercent(),
            edgeMask: false,
            edgeMaskRects: 0,
            frameWidth: m ? m.frameWidth : null,
            frameHeight: m ? m.frameHeight : null,
            manifest: m ? {
                loaded: state.manifestLoaded,
                failed: state.manifestFailed,
                url: state.manifestUrl,
                pages: m.atlases.map(page => ({ id: page.id, file: page.file, columns: page.columns })),
                actions: Object.keys(m.actions),
                derivedReturn: !!(m.actions.return && m.actions.return.derived),
            } : { loaded: false, failed: state.manifestFailed, url: state.manifestUrl, pages: [], actions: [] },
            atlas: {
                ready: !!state.atlasReady,
                failed: !!state.atlasFailed,
                pages: state.atlasUrls,
                loaded: state.atlasImgs.size,
            },
            imageRequests: state.imageRequests,
            videoElements: 0,
            clips,
            errors: state.errors.slice(-6),
            assetBase: state.assetBase,
        };
    }

    function notify(reason) {
        if (!onStateChange || state.disposed) return;
        const s = snapshot();
        const key = [s.phase, s.action, s.dock, s.panelOpen, s.dragging, s.enabled, s.animation, s.renderer, s.avoid].join('|');
        if (reason !== 'settings' && key === state.lastNotifyKey) return;
        state.lastNotifyKey = key;
        try { onStateChange(s, reason || 'state'); } catch (e) { /* noop */ }
    }

    function animationOn() {
        return !!state.enabled && !!state.settings.animation && !state.settings.reduced && !state.osReduced;
    }

    function canAnimate() {
        return state.started && !state.disposed && animationOn() && !state.dragging &&
            !(doc && doc.hidden) && !!state.atlasReady && !!state.manifest;
    }

    function mediaError(message) {
        const text = String(message || '');
        if (!state.errors.includes(text)) state.errors.push(text);
        try { console.warn('[余小温伴侣] ' + text); } catch (e) { /* noop */ }
        notify('error');
    }

    function setRenderer(kind) {
        state.renderer = kind;
        if (state.root) state.root.dataset.renderer = kind;
    }

    function setRootAttrs() {
        if (!state.root) return;
        state.root.dataset.dock = state.dock;
        state.root.dataset.edge = isDocked() ? state.dock : 'none';
        state.root.dataset.phase = state.phase;
        state.root.dataset.action = state.actionName || 'static';
        state.root.dataset.rest = state.phase === 'rest' || state.phase === 'static' ? state.restKind : 'none';
        state.root.dataset.panel = state.panelOpen ? 'open' : 'closed';
        state.root.dataset.dragging = state.dragging ? 'true' : 'false';
        state.root.dataset.enabled = state.enabled ? 'true' : 'false';
        state.root.dataset.avoid = state.avoid ? 'true' : 'false';
        state.root.dataset.renderer = state.renderer;
        // 媒体 manifest 的 facing 在本轮素材里实际表示“素材作者边”（原始片是左墙探头、
        // 向右出；像素质心 32 帧 +88.6 源px）。贴到另一侧才镜像，贴同侧不镜像。
        // 旧版按“人物面向”解释，结果左右正好反了（左贴边镜像、右贴边不镜像）。
        const authoredSide = state.manifest && state.manifest.facing === 'right' ? 'right' : 'left';
        const mirror = state.dock === 'left' ? authoredSide !== 'left'
            : state.dock === 'right' ? authoredSide !== 'right' : false;
        state.root.dataset.mirror = mirror ? 'true' : 'false';
        const shift = edgeShiftPercent();
        state.root.style.setProperty('--ywc-shift-base', Math.round(shift * 1000) / 10 + '%');
        state.root.dataset.edgeShift = String(Math.round(shift * 1000) / 1000);
        // exit/return 的舞台位移时长跟片段帧数/帧率/速度同源，避免速度档位下
        // CSS 位移先到/后到，和逐帧动作错开看起来像“跳”。
        const shiftDef = state.actionName === 'exit' ? actionDef('exit')
            : state.actionName === 'return' ? actionDef('return') : null;
        if (shiftDef && shiftDef.frames.length) {
            const seconds = shiftDef.frames.length / Math.max(0.1, shiftDef.fps * state.settings.speed);
            state.root.style.setProperty('--ywc-shift-dur', Math.max(0.2, seconds).toFixed(2) + 's');
        } else if (typeof state.root.style.removeProperty === 'function') {
            state.root.style.removeProperty('--ywc-shift-dur');
        }
        // 1.3.2：作者只要原姿势眨眼，取消额外 CSS sway/press 位移。
        // data-sway 永远 false；眨眼在 cling 图集 48 帧里（真实素材）。
        state.root.dataset.sway = 'false';
        state.root.setAttribute('aria-expanded', state.panelOpen ? 'true' : 'false');
        state.root.hidden = !state.enabled;
    }

    function applySize() {
        if (!state.root) return;
        const w = Math.round(state.settings.size);
        const h = companionHeight(w);
        const bw = boxWidth();
        const bh = boxHeight();
        state.root.style.setProperty('--ywc-w', bw + 'px');
        state.root.style.setProperty('--ywc-h', bh + 'px');
        state.root.style.setProperty('--ywc-visual-w', w + 'px');
        state.root.style.setProperty('--ywc-visual-h', h + 'px');
        state.root.style.width = bw + 'px';
        state.root.style.height = bh + 'px';
        state.root.style.minWidth = '44px';
        state.root.style.minHeight = '44px';
        if (state.stage) {
            state.stage.style.width = w + 'px';
            state.stage.style.height = h + 'px';
        }
        // 尺寸变了：canvas 显示缩放/垂直居中随之变，重算头部圆。
        syncHitCircle();
    }

    function clampHome(position) {
        const v = vp();
        const bw = boxWidth();
        const bh = boxHeight();
        return {
            x: Math.round(clamp(num(position && position.x, v.left), v.left, v.left + Math.max(0, v.width - bw))),
            y: Math.round(clamp(num(position && position.y, v.top), v.top, v.top + Math.max(0, v.height - bh))),
        };
    }

    function applyPosition(position, transition) {
        if (!state.root) return;
        const p = clampHome(position);
        state.pos = p;
        state.root.dataset.moving = transition && !state.settings.reduced ? 'true' : 'false';
        state.root.style.left = p.x + 'px';
        state.root.style.top = p.y + 'px';
        state.root.dataset.positioned = 'true';
        updateAvoid();
    }

    function syncHome() {
        state.home = state.pos ? { x: state.pos.x, y: state.pos.y } : null;
    }

    function defaultHome() {
        const v = vp();
        const bw = boxWidth();
        const bh = boxHeight();
        const gap = Math.min(24, Math.max(8, Math.round(state.settings.size * 0.25)));
        const saved = state.settings.position;
        const y = saved && Number.isFinite(Number(saved.y)) ? saved.y : v.top + v.height - bh - gap;
        if (state.dock === 'left') return clampHome({ x: v.left, y });
        if (state.dock === 'right') return clampHome({ x: v.left + v.width - bw, y });
        if (saved) return clampHome({ x: saved.x, y: saved.y });
        return clampHome({ x: v.left + v.width - bw - gap, y: v.top + v.height - bh - gap });
    }

    function dockFromSaved() {
        const saved = state.settings.position;
        if (saved && (saved.dock === 'left' || saved.dock === 'right' || saved.dock === 'float')) return saved.dock;
        if (saved) {
            const d = deriveCompanionDock(saved, boxWidth(), vp(), 22);
            if (d) return d;
        }
        return state.settings.defaultDock;
    }

    function updateAvoid() {
        if (!state.root || !state.pos) return;
        let avoid = false;
        const rect = state.panelRect;
        if (state.panelOpen && rect && Number.isFinite(Number(rect.left)) && Number.isFinite(Number(rect.top))) {
            const r = {
                left: Number(rect.left),
                top: Number(rect.top),
                right: Number(rect.left) + num(rect.width, 0),
                bottom: Number(rect.top) + num(rect.height, 0),
            };
            const box = {
                left: state.pos.x,
                top: state.pos.y,
                right: state.pos.x + boxWidth(),
                bottom: state.pos.y + boxHeight(),
            };
            avoid = box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top;
        }
        if (state.avoid !== avoid) {
            state.avoid = avoid;
            if (state.root) {
                state.root.dataset.avoid = avoid ? 'true' : 'false';
                // 1.3.4：重叠也不吃整块指针。root 永远 none，只有头部圆 .ywc-hit 可点；
                // 不允许这里再写回 style.pointerEvents='auto'。
                state.root.style.pointerEvents = 'none';
            }
        }
    }

    function clearCanvas() {
        if (!state.ctx || !state.canvas) return;
        try { state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height); } catch (e) { /* noop */ }
    }

    function drawPlaceholder() {
        clearCanvas();
        setRenderer('placeholder');
        if (state.root) state.root.dataset.media = 'placeholder';
        syncHitCircle();
    }

    function atlasPage(id) {
        if (!state.manifest) return null;
        return state.manifest.atlases.find(page => page.id === id) || null;
    }

    function paintFrame(frame, alpha) {
        if (!frame || !state.ctx || !state.canvas) return false;
        const page = atlasPage(frame.atlas);
        const img = state.atlasImgs.get(frame.atlas);
        if (!page || !img) return false;
        let sx;
        let sy;
        let sw;
        let sh;
        if (frame.rect) {
            sx = frame.rect.x;
            sy = frame.rect.y;
            sw = frame.rect.w;
            sh = frame.rect.h;
        } else {
            const index = Math.max(0, frame.index || 0);
            sx = (index % page.columns) * page.cellWidth;
            sy = Math.floor(index / page.columns) * page.cellHeight;
            sw = page.cellWidth;
            sh = page.cellHeight;
        }
        // 全部 1:1 画（exit 240 不能挤成 176）。画布宽度按所有帧的
        // 公共 anchor 扩展（outputAnchorX），不再把窄帧硬塞进最宽帧的中心：
        // 每帧按自身 anchor 对齐到同一个 canvas x，左右都不裁角色。
        const dw = frame.rect ? sw : page.cellWidth;
        const dh = frame.rect ? sh : page.cellHeight;
        let dx = Math.round((state.canvas.width - dw) / 2);
        let dy = state.canvas.height - dh;
        if (state.manifest.outputAnchorX !== null && state.manifest.outputAnchorX !== undefined) {
            const frameAnchorX = frame.anchor && Number.isFinite(Number(frame.anchor.x))
                ? Number(frame.anchor.x) : dw / 2;
            dx = Math.round(state.manifest.outputAnchorX - frameAnchorX);
            if (frame.anchor) dy = Math.round(state.canvas.height - 15 - frame.anchor.y);
        } else if (frame.anchor) {
            dx = Math.round(state.canvas.width / 2 - frame.anchor.x);
            dy = Math.round(state.canvas.height - 15 - frame.anchor.y);
        }
        if (state.manifest.anchor && frame.anchor) {
            dx = Math.round(state.manifest.anchor.x * state.canvas.width - frame.anchor.x);
            dy = Math.round(state.manifest.anchor.y * state.canvas.height - frame.anchor.y);
        }
        try {
            state.ctx.globalAlpha = clamp(num(alpha, 1), 0, 1);
            state.ctx.imageSmoothingEnabled = false;
            state.ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
            state.ctx.globalAlpha = 1;
            return true;
        } catch (e) {
            try { state.ctx.globalAlpha = 1; } catch (inner) { /* noop */ }
            mediaError('图集绘制失败: ' + (e && e.message ? e.message : e));
            return false;
        }
    }

    function drawFrameObj(frame) {
        if (!state.ctx || !state.canvas) return false;
        try { state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height); } catch (e) { /* noop */ }
        if (!paintFrame(frame, 1)) return false;
        state.drawnFrameObj = frame;
        state.drawnFrame = frame && frame.index !== null && frame.index !== undefined
            ? frame.index : (frame && frame.rect ? 'rect' : null);
        setRenderer('canvas');
        if (state.root) state.root.dataset.media = 'canvas';
        syncHitCircle();
        return true;
    }

    function drawActionPos(pos) {
        const def = state.frameAction;
        if (!def) return false;
        const len = def.frames.length;
        for (let offset = 0; offset < len; offset++) {
            const index = ((pos + offset) % len + len) % len;
            const frame = def.frames[index];
            if (drawFrameObj(frame)) {
                state.framePos = index;
                return true;
            }
        }
        return false;
    }

    function drawStaticFrame(kind) {
        const name = restActionName(kind || restKind());
        const def = name ? actionDef(name) : null;
        if (def && state.atlasReady && drawFrameObj(def.frames[0], name)) return true;
        if (state.staticImg && state.ctx && state.canvas) {
            try {
                state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
                state.ctx.imageSmoothingEnabled = false;
                const iw = state.staticImg.naturalWidth || state.staticImg.width || state.canvas.width;
                const ih = state.staticImg.naturalHeight || state.staticImg.height || state.canvas.height;
                const dx = Math.round((state.canvas.width - iw) / 2);
                const dy = state.canvas.height - ih;
                state.ctx.drawImage(state.staticImg, 0, 0, iw, ih, dx, dy, iw, ih);
                setRenderer('static');
                syncHitCircle();
                return true;
            } catch (e) { /* noop */ }
        }
        drawPlaceholder();
        return false;
    }

    function stopRaf() {
        if (!state.rafId) return;
        const cancel = win.cancelAnimationFrame || (typeof globalThis.cancelAnimationFrame === 'function'
            ? globalThis.cancelAnimationFrame.bind(globalThis) : null);
        if (cancel) {
            try { cancel(state.rafId); } catch (e) { /* noop */ }
        }
        state.rafId = 0;
        state.lastTs = 0;
        state.acc = 0;
    }

    function scheduleRaf() {
        if (state.rafId || !canAnimate()) return;
        if (!state.frameAction) return;
        const request = win.requestAnimationFrame || (typeof globalThis.requestAnimationFrame === 'function'
            ? globalThis.requestAnimationFrame.bind(globalThis) : null);
        if (!request) return;
        try { state.rafId = request(tick); } catch (e) { state.rafId = 0; }
    }

    function maybeBlink(stamp) {
        if (state.phase !== 'rest' || state.restKind !== 'edge') return false;
        if (!state.manifest || !state.manifest.actions.blink || !state.manifest.blinkEvery) return false;
        if (!state.nextBlinkAt || stamp < state.nextBlinkAt) return false;
        if (state.actionName !== restActionName('edge')) return false;
        state.nextBlinkAt = 0;
        return startAction('blink', { loop: false, sequence: 'blink', phase: 'blink', reason: 'blink' });
    }

    function tick(ts) {
        state.rafId = 0;
        if (!canAnimate()) return;
        const stamp = Number.isFinite(Number(ts)) ? Number(ts) : Date.now();
        const delta = state.lastTs ? Math.min(stamp - state.lastTs, 120) : 0;
        state.lastTs = stamp;
        if (!state.frameAction) {
            scheduleRaf();
            return;
        }
        state.acc += Math.max(0, delta);
        if (maybeBlink(Date.now())) return;
        const span = 1000 / Math.max(0.1, state.frameAction.fps * state.settings.speed);
        let guard = 0;
        while (state.acc >= span && guard++ < 8) {
            state.acc -= span;
            if (!advanceFrame()) return;
        }
        scheduleRaf();
    }

    function advanceFrame() {
        const def = state.frameAction;
        if (!def) return false;
        let next = state.framePos + 1;
        if (next >= def.frames.length) {
            if (state.loop) {
                state.loops += 1;
                state.framePos = 0;
                if (!drawActionPos(0)) { setStatic(restKind()); notify('draw-failed'); return false; }
                return true;
            }
            if (def.holdLast) {
                state.framePos = def.frames.length - 1;
                if (!drawActionPos(state.framePos)) { setStatic(restKind()); notify('draw-failed'); return false; }
                state.phase = 'held';
                setRootAttrs();
                stopRaf();
                notify('hold');
                return false;
            }
            state.framePos = def.frames.length - 1;
            if (!drawActionPos(state.framePos)) { setStatic(restKind()); notify('draw-failed'); return false; }
            const ended = state.actionName;
            stopRaf();
            handleActionEnd(ended);
            return false;
        }
        state.framePos = next;
        if (!drawActionPos(next)) { setStatic(restKind()); notify('draw-failed'); return false; }
        return true;
    }

    function startAction(name, opts = {}) {
        const def = actionDef(name);
        if (!def) return false;
        if (!state.atlasReady) {
            drawStaticFrame(restKind());
            return false;
        }
        stopRaf();
        state.actionName = name;
        state.frameAction = def;
        state.sequence = opts.sequence !== undefined ? opts.sequence : state.sequence;
        state.phase = opts.phase || state.sequence || 'action';
        state.framePos = 0;
        state.loops = 0;
        state.lastTs = 0;
        state.acc = 0;
        state.loop = opts.loop !== undefined ? !!opts.loop : !!def.loop;
        // 1.3.1：只画新动作第一帧，绝不把上一姿势再叠进来。cling/exit/return
        // 是不同裁切与姿势，crossfade 混帧就是用户看到的“跳出/落地重影”。
        if (!drawActionPos(0)) {
            setStatic(restKind());
            notify('draw-failed');
            return false;
        }
        setRootAttrs();
        notify(opts.reason || 'action');
        const needsRaf = def.frames.length > 1 || !state.loop;
        if (animationOn() && needsRaf) scheduleRaf();
        return true;
    }

    function handleActionEnd(name) {
        // 1.3.2：exit/sway/return 不再由 hover/click/panel 触发。
        // 若清单里仍带 blink 片段，播完立即回 cling；其它动作播完也回 cling。
        if (name === 'blink') {
            state.sequence = null;
            playRest();
            return;
        }
        playRest();
    }

    function setStatic(kind, announce = true) {
        stopRaf();
        state.actionName = null;
        state.frameAction = null;
        state.sequence = null;
        state.restKind = kind || restKind();
        state.phase = 'static';
        state.loop = false;
        drawStaticFrame(state.restKind);
        setRootAttrs();
        if (announce) notify('static');
    }

    function scheduleNextBlink() {
        if (!state.manifest || !state.manifest.blinkEvery || !state.manifest.actions.blink) {
            state.nextBlinkAt = 0;
            return;
        }
        const range = state.manifest.blinkEvery;
        const min = Math.max(0.2, range[0]);
        const max = Math.max(min, range[1]);
        state.nextBlinkAt = now() + (min + Math.random() * (max - min)) * 1000;
    }

    function playRest() {
        if (!state.started || state.disposed || !state.enabled) return;
        state.sequence = null;
        const kind = restKind();
        state.restKind = kind;
        if (!animationOn() || !state.atlasReady) {
            setStatic(kind);
            return;
        }
        const name = restActionName(kind);
        if (!name) {
            setStatic(kind);
            return;
        }
        const def = actionDef(name);
        state.phase = 'rest';
        startAction(name, {
            loop: !!def.loop,
            sequence: null,
            phase: 'rest',
            reason: 'rest-' + kind,
        });
        if (kind === 'edge') scheduleNextBlink();
        else state.nextBlinkAt = 0;
    }

    function activate() {
        if (!state.started || state.disposed || !state.enabled || state.dragging) return;
        // 240ms 内连点只算一次，避免刚打开的主控又被同一次手势切回去。
        if (now() - state.lastActivateAt < 240) return;
        state.lastActivateAt = now();
        if (onActivate) {
            try { onActivate(snapshot()); } catch (e) { mediaError('onActivate 回调失败: ' + (e && e.message ? e.message : e)); }
        }
        // 1.3.2：点击只回调主 index 开关总控，不移动、不重置动作、不做 press 位移。
        notify('activate');
    }

    function setHover(value) {
        // 1.3.2：hover 只更新标记给外壳/观测用，绝不选 exit/sway/return，也不打断 cling。
        state.hovering = !!value;
        if (!state.started || state.disposed) return;
        notify('hover');
    }

    /** 占位火种没有像素可读：只认舞台中心那颗可见小火苗的小圆，绝不给整块矩形。 */
    function placeholderHit(event) {
        const el = state.stage || state.root;
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        const w = Number(rect && rect.width);
        const h = Number(rect && rect.height);
        const cx = Number(event.clientX);
        const cy = Number(event.clientY);
        if (!(w > 0 && h > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) return false;
        const radius = clamp(state.settings.size * 0.2, 10, 16);
        const dx = cx - (Number(rect.left) + w / 2);
        const dy = cy - (Number(rect.top) + h / 2);
        return dx * dx + dy * dy <= radius * radius;
    }

    /**
     * 当前显示帧的 alpha 位图（1 = alpha>=32 的可见角色像素）。
     * 只在指针落点需要判定时建一次，按帧对象/静态图缓存；绝不逐帧或逐 move 读像素。
     * 读不到（canvas 被 taint、getImageData 抛错、数据长度异常）返回 failed 掩码，
     * 判定一律按“透明”处理——绝不回退整块矩形。
     */
    function currentAlphaMask() {
        const canvas = state.canvas;
        const ctx = state.ctx;
        if (!canvas || !ctx || typeof ctx.getImageData !== 'function') return null;
        if (state.renderer === 'placeholder') return null;
        const key = state.renderer === 'static' ? 'static' : state.drawnFrameObj;
        if (!key) return null;
        const width = Math.round(Number(canvas.width));
        const height = Math.round(Number(canvas.height));
        if (!(width > 0 && height > 0)) return null;
        const cached = state.alphaMasks.get(key);
        if (cached && cached.width === width && cached.height === height) return cached;
        let mask;
        try {
            const image = ctx.getImageData(0, 0, width, height);
            const data = image && image.data;
            if (!data || data.length < width * height * 4) throw new Error('alpha data unavailable');
            const bits = new Uint8Array(Math.ceil(width * height / 8));
            let opaque = 0;
            for (let i = 0, p = 0; p < width * height; i += 4, p++) {
                if (data[i + 3] >= ALPHA_HIT_MIN) {
                    bits[p >> 3] |= 1 << (p & 7);
                    opaque += 1;
                }
            }
            mask = { width, height, bits, opaque, failed: false };
        } catch (e) {
            // 读像素失败：标记失败掩码（后续同帧不再反复读），命中一律 false。
            state.alphaMaskFailed = true;
            mask = { width, height, bits: null, opaque: 0, failed: true };
        }
        state.alphaMasks.set(key, mask);
        if (state.alphaMasks.size > ALPHA_MASK_LIMIT) {
            state.alphaMasks.delete(state.alphaMasks.keys().next().value);
        }
        return mask;
    }

    // 1.3.4：找“头”的兜底几何。真实帧读不到 alpha 时不让头部点击失效；
    // r4 扒边素材的头中心约在画布 (0.18W, 0.36H)，半径约 0.25W。
    const HEAD_FALLBACK = Object.freeze({ u: 0.18, v: 0.36, rRatio: 0.25 });

    /**
     * 从当前显示帧 alpha 位图取“头部圆”：
     *  - 头 = 顶部连续块；先按行像素数的“脖子收窄”切分，找不到再退回顶部 62%；
     *  - 圆心 = 头区 bbox 中心（若中心恰好是透明发缝，取最近实心像素）；
     *  - 半径 = 头区最长边 / 2（后续再按 canvas 实际缩放钳到只圈头的视觉直径）。
     * 只做整数/位图运算，缓存挂在 mask.head 上，按帧对象复用，不逐 move 读像素。
     */
    function headGeometryFromMask(mask) {
        if (!mask || mask.failed || !mask.bits || !mask.opaque) return null;
        if (mask.head !== undefined) return mask.head;
        const width = Math.round(Number(mask.width));
        const height = Math.round(Number(mask.height));
        if (!(width > 0 && height > 0)) return null;
        const bit = (index) => (mask.bits[index >> 3] & (1 << (index & 7))) !== 0;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y++) {
            const row = y * width;
            let left = -1;
            let right = -1;
            for (let x = 0; x < width; x++) {
                if (!bit(row + x)) continue;
                if (left < 0) left = x;
                right = x;
            }
            if (left < 0) continue;
            if (left < minX) minX = left;
            if (right > maxX) maxX = right;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        if (maxX < 0 || maxY < 0) return null;
        const spanY = maxY - minY + 1;
        const rows = [];
        let peak = 0;
        let peakWidth = 1;
        for (let y = minY; y <= maxY; y++) {
            const row = y * width;
            let count = 0;
            let left = -1;
            let right = -1;
            for (let x = 0; x < width; x++) {
                if (!bit(row + x)) continue;
                count += 1;
                if (left < 0) left = x;
                right = x;
            }
            if (!count) continue;
            const rowWidth = right - left + 1;
            rows.push({ y, count, width: rowWidth });
            if (y <= minY + spanY * 0.55) {
                if (count > peak) peak = count;
                if (rowWidth > peakWidth) peakWidth = rowWidth;
            }
        }
        if (!rows.length) return null;
        // 脖子：头下方行像素数/行宽明显收窄，并连续 2 行保持；避免把下巴/肩膀算进头。
        let headBottom = null;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.y < minY + spanY * 0.25) continue;
            if (row.y > minY + spanY * 0.82) break;
            const next = rows.slice(i + 1, i + 4);
            if (next.length < 2) continue;
            const narrowed = row.count <= peak * 0.5 || row.width <= peakWidth * 0.55;
            const stays = next.every(item => item.count <= peak * 0.62);
            if (narrowed && stays) {
                headBottom = row.y - 1;
                break;
            }
        }
        if (headBottom === null || headBottom <= minY) {
            headBottom = minY + Math.max(1, Math.round(spanY * 0.62));
        }
        let headX0 = width;
        let headY0 = height;
        let headX1 = -1;
        let headY1 = -1;
        let sx = 0;
        let sy = 0;
        let count = 0;
        for (let y = minY; y <= headBottom; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
                if (!bit(row + x)) continue;
                count += 1;
                sx += x;
                sy += y;
                if (x < headX0) headX0 = x;
                if (x > headX1) headX1 = x;
                if (y < headY0) headY0 = y;
                if (y > headY1) headY1 = y;
            }
        }
        if (!count || headX1 < 0 || headY1 < 0) return null;
        const centerX = (headX0 + headX1) / 2;
        const centerY = (headY0 + headY1) / 2;
        let bestX = sx / count;
        let bestY = sy / count;
        let best = Infinity;
        for (let y = headY0; y <= headY1; y++) {
            const row = y * width;
            for (let x = headX0; x <= headX1; x++) {
                if (!bit(row + x)) continue;
                const dx = x - centerX;
                const dy = y - centerY;
                const d = dx * dx + dy * dy;
                if (d < best) {
                    best = d;
                    bestX = x;
                    bestY = y;
                }
            }
        }
        const head = {
            u: (bestX + 0.5) / width,
            v: (bestY + 0.5) / height,
            cx: bestX + 0.5,
            cy: bestY + 0.5,
            r: Math.max(headX1 - headX0 + 1, headY1 - headY0 + 1) / 2,
            canvasWidth: width,
            canvasHeight: height,
            headBottom,
        };
        mask.head = head;
        return head;
    }

    /**
     * 把头部圆写进 .ywc-hit：圆心/半径按当前帧 alpha + canvas 实际 CSS 缩放换算。
     * .ywc-hit 放在 .ywc-mirror 里，镜像 scaleX(-1) 和 stage 的贴边位移由 CSS 自己承接，
     * 这里只写 unmirrored 的局部坐标，所以过渡/拖动/换边时圆不会掉队。
     */
    function syncHitCircle() {
        if (!state.hit || !state.canvas || !state.mirror) return null;
        const canvas = state.canvas;
        const canvasW = Math.max(1, Math.round(Number(canvas.width) || 1));
        const canvasH = Math.max(1, Math.round(Number(canvas.height) || 1));
        const canvasRect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
        const mirrorRect = typeof state.mirror.getBoundingClientRect === 'function'
            ? state.mirror.getBoundingClientRect() : null;
        const displayW = canvasRect && Number(canvasRect.width) > 0
            ? Number(canvasRect.width) : Math.max(1, boxWidth());
        const displayH = canvasRect && Number(canvasRect.height) > 0
            ? Number(canvasRect.height) : displayW * canvasH / canvasW;
        const mirrorW = mirrorRect && Number(mirrorRect.width) > 0 ? Number(mirrorRect.width) : displayW;
        const mirrorH = mirrorRect && Number(mirrorRect.height) > 0 ? Number(mirrorRect.height) : boxHeight();
        let centerX;
        let centerY;
        let visualRadius;
        let radius = 0;
        let head = null;
        let fromMask = false;
        if (state.renderer === 'placeholder') {
            // 没图集时只圈中心小火苗（与 1.3.2 的 placeholderHit 同口径）。
            visualRadius = clamp(state.settings.size * 0.2, 10, 16);
            centerX = mirrorW / 2;
            centerY = mirrorH / 2;
        } else {
            const mask = currentAlphaMask();
            head = headGeometryFromMask(mask);
            fromMask = !!head;
            if (!head || head.canvasWidth !== canvasW || head.canvasHeight !== canvasH) {
                head = state.lastHeadCircle && state.lastHeadCircle.canvasWidth === canvasW
                    && state.lastHeadCircle.canvasHeight === canvasH ? state.lastHeadCircle : null;
                fromMask = false;
            }
            if (!head) {
                head = {
                    u: HEAD_FALLBACK.u,
                    v: HEAD_FALLBACK.v,
                    r: canvasW * HEAD_FALLBACK.rRatio,
                    canvasWidth: canvasW,
                    canvasHeight: canvasH,
                };
            }
            const scale = displayW / canvasW;
            radius = Number(head.r);
            if (!(radius > 0)) radius = canvasW / 4;
            // 只圈头：64 档直径 24~32 视觉 px；其它尺寸按同一比例缩放，不回到整块 64x94。
            const minR = Math.max(1, canvasW * 0.1875);
            const maxR = Math.max(minR, canvasW * 0.25);
            radius = clamp(radius, minR, maxR);
            visualRadius = radius * scale;
            centerX = Number(head.u) * displayW;
            centerY = (mirrorH - displayH) / 2 + Number(head.v) * displayH;
        }
        const hit = state.hit;
        hit.style.left = (centerX - visualRadius).toFixed(2) + 'px';
        hit.style.top = (centerY - visualRadius).toFixed(2) + 'px';
        hit.style.width = (visualRadius * 2).toFixed(2) + 'px';
        hit.style.height = (visualRadius * 2).toFixed(2) + 'px';
        const circle = {
            u: head ? Number(head.u) : 0.5,
            v: head ? Number(head.v) : 0.5,
            cx: head ? Number(head.cx !== undefined ? head.cx : head.u * canvasW) : canvasW / 2,
            cy: head ? Number(head.cy !== undefined ? head.cy : head.v * canvasH) : canvasH / 2,
            r: radius,
            canvasWidth: canvasW,
            canvasHeight: canvasH,
            x: centerX,
            y: centerY,
            visualRadius,
            diameter: visualRadius * 2,
        };
        state.headCircle = circle;
        if (fromMask) state.lastHeadCircle = circle;
        hit.dataset.head = '1';
        hit.dataset.diameter = String(Math.round(circle.diameter * 10) / 10);
        return circle;
    }

    /**
     * 1.3.4 命中门：只认头部圆几何，不再按全身逐像素 alpha 判。
     * 映射用 canvas.getBoundingClientRect()，自动包含 CSS 缩放/镜像；圆外 = 不吃指针。
     * 头部圆由 syncHitCircle() 用当前帧 alpha 头区 bbox 算出；读像素失败时用上一帧/兜底圆，
     * 绝不因为旧 alpha 在某个头部像素为 0 而拒绝有效点击。
     */
    function headHit(event) {
        if (state.renderer === 'placeholder') return placeholderHit(event);
        const canvas = state.canvas;
        const head = state.headCircle;
        if (!canvas || !head || !(head.r > 0)) return false;
        if (typeof canvas.getBoundingClientRect !== 'function') return false;
        const rect = canvas.getBoundingClientRect();
        const w = Number(rect && rect.width);
        const h = Number(rect && rect.height);
        const cx = Number(event.clientX);
        const cy = Number(event.clientY);
        if (!(w > 0 && h > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) return false;
        let u = (cx - Number(rect.left)) / w;
        const v = (cy - Number(rect.top)) / h;
        if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
        if (state.root && state.root.dataset && state.root.dataset.mirror === 'true') u = 1 - u;
        const x = u * head.canvasWidth;
        const y = v * head.canvasHeight;
        const dx = x - head.cx;
        const dy = y - head.cy;
        return dx * dx + dy * dy <= head.r * head.r;
    }

    function onPointerDown(event) {
        if (!state.started || state.disposed || !state.enabled) return;
        if (event.button !== undefined && event.button !== 0) return;
        if (state.pointerId !== null) return;
        // 1.3.4：只认头部圆。圆外的事件在浏览器里根本到不了 root（pointer-events:none）；
        // 这里再按几何挡一次，防止合成事件/旧夹具把整块矩形当命中。
        if (!headHit(event)) return;
        state.pointerId = event.pointerId;
        state.drag = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            start: state.pos ? { x: state.pos.x, y: state.pos.y } : defaultHome(),
            dock: state.dock,
            moved: false,
        };
        // 不在这里停 RAF：单纯点击不应该把正在播的 exit/sway 冻住；
        // 真正超过 7px 进入拖动时才 stopRaf（见 onPointerMove）。
        // 捕获必须落在真正可点的 .ywc-hit 上：root 是 pointer-events:none。
        const capture = state.hit || state.root;
        try { capture.setPointerCapture(event.pointerId); } catch (e) { /* noop */ }
        state.root.dataset.pressed = 'true';
    }

    function onPointerMove(event) {
        const drag = state.drag;
        if (!drag || drag.id !== event.pointerId || !state.started) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) <= 7) return;
        if (!drag.moved) {
            drag.moved = true;
            state.dragging = true;
            state.sequence = null;
            state.phase = 'drag';
            stopRaf();
            state.root.dataset.dragging = 'true';
            if (state.dock !== 'float') {
                state.dock = 'float';
                setRootAttrs();
            }
            notify('drag-start');
        }
        const p = clampHome({ x: drag.start.x + dx, y: drag.start.y + dy });
        state.pos = p;
        state.root.style.left = p.x + 'px';
        state.root.style.top = p.y + 'px';
        state.root.dataset.positioned = 'true';
    }

    function onPointerUp(event) {
        const drag = state.drag;
        if (!drag || drag.id !== event.pointerId) return;
        state.drag = null;
        state.pointerId = null;
        delete state.root.dataset.pressed;
        const capture = state.hit || state.root;
        try { capture.releasePointerCapture(event.pointerId); } catch (e) { /* noop */ }
        if (!drag.moved) {
            state.dragging = false;
            state.root.dataset.dragging = 'false';
            // 1.3.4：起点/终点都要在头部圆内才算点击；圆外本来就到不了这里。
            // 键盘路径不经过这里，保持独立。
            if (headHit(event)) activate();
            return;
        }
        state.dragging = false;
        const raw = state.pos || drag.start;
        const v = vp();
        const bw = boxWidth();
        const threshold = Math.max(26, Math.round(state.settings.size * 0.42));
        let dock = 'float';
        if (state.settings.snap) {
            const leftDist = Math.max(0, raw.x - v.left);
            const rightDist = Math.max(0, v.left + v.width - (raw.x + bw));
            if (leftDist <= threshold || rightDist <= threshold) dock = leftDist <= rightDist ? 'left' : 'right';
        }
        state.dock = dock;
        if (dock === 'left') state.pos = clampHome({ x: v.left, y: raw.y });
        else if (dock === 'right') state.pos = clampHome({ x: v.left + v.width - bw, y: raw.y });
        else state.pos = clampHome(raw);
        applyPosition(state.pos, true);
        syncHome();
        setRootAttrs();
        persistPosition();
        state.phase = 'rest';
        playRest();
        notify('drag-end');
    }

    function onPointerCancel() {
        const drag = state.drag;
        if (!drag) return;
        state.drag = null;
        state.pointerId = null;
        state.dragging = false;
        delete state.root.dataset.pressed;
        state.root.dataset.dragging = 'false';
        if (drag.dock && drag.dock !== state.dock) state.dock = drag.dock;
        state.pos = drag.start;
        applyPosition(state.pos, true);
        syncHome();
        setRootAttrs();
        state.phase = 'rest';
        playRest();
        notify('drag-cancel');
    }

    function onKeyDown(event) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            activate();
        }
    }

    function onVisibility() {
        if (!state.started || state.disposed) return;
        if (doc.hidden) {
            stopRaf();
            if (state.root) state.root.dataset.hidden = 'true';
        } else {
            if (state.root) delete state.root.dataset.hidden;
            if (state.phase === 'rest' || state.phase === 'static' || state.phase === 'rest-held') playRest();
            else scheduleRaf();
        }
        notify('visibility');
    }

    function onViewportChange() {
        if (!state.started || state.disposed) return;
        const current = state.pos || defaultHome();
        const v = vp();
        if (state.dock === 'left') state.pos = clampHome({ x: v.left, y: current.y });
        else if (state.dock === 'right') state.pos = clampHome({ x: v.left + v.width - boxWidth(), y: current.y });
        else state.pos = clampHome(current);
        applyPosition(state.pos, false);
        syncHome();
        notify('viewport');
    }

    function makeSettingsPanel(container) {
        if (!doc || !isElement(container)) return null;
        container.replaceChildren();
        const local = [];
        const localListen = (target, type, fn, opts) => {
            if (!target || typeof target.addEventListener !== 'function') return;
            target.addEventListener(type, fn, opts);
            local.push(() => { try { target.removeEventListener(type, fn, opts); } catch (e) { /* noop */ } });
        };
        const section = make('section', 'ywc-settings');
        section.setAttribute('data-ywc-settings', '1');
        const head = make('div', 'ywc-settings-head');
        head.appendChild(make('strong', 'ywc-settings-title', '余小温'));
        head.appendChild(make('span', 'ywc-settings-sub', '伴侣显示'));
        section.appendChild(head);

        const grid = make('div', 'ywc-settings-grid');
        const controls = {};
        const addRow = (labelText, control, key) => {
            const row = make('label', 'ywc-settings-row');
            row.appendChild(make('span', 'ywc-settings-label', labelText));
            control.dataset.ywcKey = key;
            row.appendChild(control);
            grid.appendChild(row);
            controls[key] = control;
            return row;
        };
        const checkbox = (key, label) => {
            const input = make('input', 'ywc-settings-check');
            input.type = 'checkbox';
            input.dataset.ywcKey = key;
            addRow(label, input, key);
            return input;
        };
        const select = (key, label, values) => {
            const el = doc.createElement('select');
            el.className = 'ywc-settings-select';
            for (const [value, text] of values) {
                const option = doc.createElement('option');
                option.value = value;
                option.textContent = text;
                el.appendChild(option);
            }
            addRow(label, el, key);
            return el;
        };

        checkbox('enabled', '开启悬浮小人');
        checkbox('animation', '动画');
        checkbox('reduced', '减少动态');
        select('size', '尺寸', [['64', '微小 64'], ['72', '小 72'], ['96', '中 96'], ['128', '大 128']]);
        const speed = make('input', 'ywc-settings-range');
        speed.type = 'range';
        speed.min = '0.5';
        speed.max = '2';
        speed.step = '0.1';
        addRow('速度', speed, 'speed');
        checkbox('snap', '拖到边缘吸附');
        select('defaultDock', '默认贴边', [['right', '右侧'], ['left', '左侧'], ['float', '内屏漂浮']]);
        // 1.3.2：悬停回应已取消（hover 不再触发出/入边），入口一并去掉，避免假开关。
        section.appendChild(grid);

        const foot = make('div', 'ywc-settings-foot');
        const reset = make('button', 'ywc-settings-reset', '恢复默认位置');
        reset.type = 'button';
        reset.dataset.ywcAction = 'reset';
        foot.appendChild(reset);
        const hint = make('span', 'ywc-settings-hint', '拖动换位置；点一下开关总控台');
        foot.appendChild(hint);
        section.appendChild(foot);
        container.appendChild(section);

        const sync = () => {
            const s = state.settings;
            if (!controls.enabled) return;
            controls.enabled.checked = !!s.enabled;
            controls.animation.checked = !!s.animation;
            controls.reduced.checked = !!s.reduced;
            controls.size.value = String(s.size);
            if (![...controls.size.options].some(o => o.value === controls.size.value)) {
                const opt = doc.createElement('option');
                opt.value = String(s.size);
                opt.textContent = String(s.size);
                controls.size.appendChild(opt);
                controls.size.value = String(s.size);
            }
            controls.speed.value = String(s.speed);
            controls.snap.checked = !!s.snap;
            controls.defaultDock.value = s.defaultDock;
        };

        const read = () => ({
            ...state.settings,
            enabled: !!controls.enabled.checked,
            animation: !!controls.animation.checked,
            reduced: !!controls.reduced.checked,
            size: Number(controls.size.value),
            speed: Number(controls.speed.value),
            snap: !!controls.snap.checked,
            defaultDock: controls.defaultDock.value,
        });

        const commit = () => {
            const prev = state.settings;
            const next = normalizeCompanionSettings(read());
            writeSettings(next);
            applySettingsChange(prev, next);
            sync();
        };
        const onChange = (event) => {
            if (!event || !event.target) return;
            if (event.target.dataset && event.target.dataset.ywcAction === 'reset') return;
            commit();
        };
        localListen(section, 'change', onChange);
        localListen(section, 'click', (event) => {
            const target = event && event.target;
            if (target && target.dataset && target.dataset.ywcAction === 'reset') {
                event.preventDefault();
                resetPosition();
                sync();
            }
        });
        state.settingsPanel = {
            section,
            controls,
            sync,
            destroy: () => {
                for (const off of local.splice(0)) { try { off(); } catch (e) { /* noop */ } }
                try { section.remove(); } catch (e) { /* noop */ }
            },
        };
        sync();
        return state.settingsPanel;
    }

    function destroySettingsPanel() {
        if (!state.settingsPanel) return;
        try { state.settingsPanel.destroy(); } catch (e) { /* noop */ }
        state.settingsPanel = null;
    }

    function companionSettingsEqual(a, b) {
        return JSON.stringify(normalizeCompanionSettings(a)) === JSON.stringify(normalizeCompanionSettings(b));
    }

    function applySettingsChange(prev, next) {
        const before = normalizeCompanionSettings(prev);
        const after = normalizeCompanionSettings(next);
        const changed = [];
        for (const key of Object.keys(COMPANION_DEFAULTS)) {
            if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
        }
        state.settings = after;
        state.enabled = after.enabled;
        if (!state.root) { notify('settings'); return changed; }
        applySize();
        if (!state.enabled) {
            stopRaf();
            state.phase = 'disabled';
            setRootAttrs();
            notify('settings');
            return changed;
        }
        const structural = changed.some(k => k === 'enabled' || k === 'animation' || k === 'reduced' || k === 'defaultDock' || k === 'position');
        if (structural) {
            if (!state.dragging) state.dock = dockFromSaved();
            setRootAttrs();
            state.pos = defaultHome();
            applyPosition(state.pos, true);
            syncHome();
            playRest();
        } else {
            if (changed.includes('size')) {
                applySize();
                state.pos = clampHome(state.pos || defaultHome());
                applyPosition(state.pos, false);
                syncHome();
            }
            if (changed.includes('frequency')) setRootAttrs();
            if (changed.includes('speed') && state.frameAction) {
                state.frameAction = { ...state.frameAction, fps: state.frameAction.fps };
            }
            setRootAttrs();
            notify('settings');
        }
        return changed;
    }

    function applyAllSettings(persist) {
        state.settings = normalizeCompanionSettings(state.settings);
        state.enabled = state.settings.enabled;
        if (state.started && !state.dragging) state.dock = dockFromSaved();
        if (!state.root) return;
        applySize();
        setRootAttrs();
        if (!state.enabled) {
            stopRaf();
            state.phase = 'disabled';
            setRootAttrs();
            notify('disabled');
            return;
        }
        state.pos = defaultHome();
        applyPosition(state.pos, false);
        syncHome();
        if (persist) writeSettings(state.settings);
        playRest();
        notify('settings');
    }

    function resetPosition() {
        if (!state.started || state.disposed) return;
        const next = normalizeCompanionSettings({ ...state.settings, position: null });
        state.settings = next;
        state.dock = next.defaultDock;
        writeSettings(next);
        setRootAttrs();
        state.pos = defaultHome();
        applyPosition(state.pos, true);
        syncHome();
        playRest();
        syncSettingsPanel();
        notify('reset');
    }

    function syncSettingsPanel() {
        if (state.settingsPanel && typeof state.settingsPanel.sync === 'function') state.settingsPanel.sync();
    }

    function writeSettings(next) {
        const normalized = normalizeCompanionSettings(next);
        let root = null;
        try { root = getSettings(); } catch (e) { root = null; }
        if (root && typeof root === 'object') {
            try { root.companion = { ...normalized }; } catch (e) { /* noop */ }
        }
        if (saveSettings) {
            try {
                if (saveSettings.length >= 1) saveSettings({ companion: { ...normalized } });
                else saveSettings();
            } catch (e) { mediaError('设置保存失败: ' + (e && e.message ? e.message : e)); }
        }
    }

    function persistPosition() {
        if (!state.pos) return;
        const next = {
            ...state.settings,
            position: { x: Math.round(state.pos.x), y: Math.round(state.pos.y), dock: state.dock },
        };
        state.settings = normalizeCompanionSettings(next);
        writeSettings(state.settings);
        syncSettingsPanel();
    }

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const Ctor = win.Image || (typeof Image !== 'undefined' ? Image : null);
            if (!Ctor) { reject(new Error('Image unavailable')); return; }
            let img;
            try { img = new Ctor(); } catch (e) { reject(e); return; }
            state.imageRequests += 1;
            let settled = false;
            const done = (fn, value) => {
                if (settled) return;
                settled = true;
                img.onload = null;
                img.onerror = null;
                fn(value);
            };
            img.onload = () => done(resolve, img);
            img.onerror = () => done(reject, new Error('image load failed: ' + url));
            try { img.src = url; } catch (e) { done(reject, e); }
        });
    }

    function fallbackToStatic(manifest, err) {
        state.atlasReady = false;
        state.atlasFailed = true;
        state.atlasImgs = new Map();
        state.alphaMasks.clear();
        state.lastHeadCircle = null;
        if (err) mediaError('图集加载失败: ' + (err && err.message ? err.message : err));
        if (manifest && manifest.staticImage) {
            state.atlasUrls = [resolveAsset(state.assetBase, manifest.staticImage)];
            loadImage(state.atlasUrls[0]).then((img) => {
                if (state.disposed) return;
                state.staticImg = img;
                state.staticReady = true;
                // 静态图换了：旧 'static' 掩码不能复用。
                state.alphaMasks.clear();
                setStatic(restKind());
                notify('static-image');
            }).catch(() => {
                if (state.disposed) return;
                setStatic(restKind());
            });
        } else {
            setStatic(restKind());
        }
    }

    function onManifestReady(manifest) {
        if (state.disposed) return;
        // 清单/图集可能整包换掉：alpha 位图/头圆只对旧帧有效，这里整批清掉。
        state.alphaMasks.clear();
        state.alphaMaskFailed = false;
        state.lastHeadCircle = null;
        state.manifest = manifest;
        state.manifestLoaded = !!manifest;
        state.manifestFailed = !manifest;
        if (!manifest) {
            setStatic(restKind());
            notify('manifest-missing');
            return;
        }
        setRootAttrs();
        if (state.canvas) {
            // 输出画布取所有 rect 的最大宽（媒体 exit 240），窄帧按 anchor 对齐，1:1 不拉伸。
            state.canvas.width = manifest.outputWidth || manifest.frameWidth;
            state.canvas.height = manifest.outputHeight || manifest.frameHeight;
        }
        if (!manifest.atlases.length) {
            setStatic(restKind());
            notify('manifest-no-atlas');
            return;
        }
        state.atlasPages = manifest.atlases;
        state.atlasUrls = manifest.atlases.map(page => resolveAsset(state.assetBase, page.file));
        Promise.all(state.atlasUrls.map((url) => loadImage(url).then(
            img => ({ ok: true, url, img }),
            err => ({ ok: false, url, err })
        ))).then((entries) => {
            if (state.disposed) return;
            const failed = entries.filter(entry => !entry.ok);
            // 任意一页失败都不能继续用“部分图集”硬播：失败页的帧会永远画不出来，
            // 动作会卡在第一个失败帧。直接回退静态图（没有静态图则火种占位），
            // 并把具体页写进 errors，保证可观测且 RAF 停止。
            if (failed.length) {
                fallbackToStatic(manifest, failed[0].err);
                return;
            }
            const byUrl = new Map(entries.map(entry => [entry.url, entry.img]));
            state.atlasImgs = new Map();
            state.atlasUrls.forEach((url, index) => {
                const page = manifest.atlases[index];
                if (page && byUrl.has(url)) state.atlasImgs.set(page.id, byUrl.get(url));
            });
            state.atlasReady = state.atlasImgs.size > 0;
            state.atlasFailed = false;
            const w = manifest.outputWidth || manifest.frameWidth;
            const h = manifest.outputHeight || manifest.frameHeight;
            if (state.canvas) {
                state.canvas.width = w;
                state.canvas.height = h;
            }
            setRootAttrs();
            playRest();
            notify('atlas');
        });
    }

    function loadManifest() {
        if (options.manifest && typeof options.manifest === 'object') {
            state.manifestUrl = 'inline';
            return Promise.resolve(normalizeManifest(options.manifest));
        }
        if (options.manifest === false) {
            state.manifestUrl = '';
            return Promise.resolve(null);
        }
        const file = options.manifestFile || DEFAULT_MANIFEST_FILE;
        state.manifestUrl = resolveAsset(state.assetBase, file);
        const fetchFn = win.fetch || (typeof fetch !== 'undefined' ? fetch : null);
        if (!fetchFn) return Promise.resolve(null);
        let response;
        try {
            response = fetchFn(state.manifestUrl, { cache: 'no-store' });
        } catch (e) {
            return Promise.resolve(null);
        }
        return Promise.resolve(response).then((res) => {
            if (!res || !res.ok) return null;
            return typeof res.json === 'function' ? res.json() : null;
        }).then((raw) => (raw ? normalizeManifest(raw) : null)).catch(() => null);
    }

    function start() {
        if (state.disposed) return state.api;
        if (state.started) return state.api;
        if (!doc) {
            mediaError('缺少 document，无法挂载伴侣');
            return state.api;
        }
        try {
            state.osReduced = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
            if (win.matchMedia) {
                try {
                    state.mediaQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
                    if (state.mediaQuery && typeof state.mediaQuery.addEventListener === 'function') {
                        listen(state.mediaQuery, 'change', (event) => {
                            state.osReduced = !!event.matches;
                            applyAllSettings(false);
                        });
                    }
                } catch (e) { /* noop */ }
            }
            let settingsRoot = null;
            try { settingsRoot = getSettings(); } catch (e) { settingsRoot = null; }
            state.settings = readCompanionSettings(settingsRoot);
            state.enabled = state.settings.enabled;

            ensureStyle();
            const root = make('div', 'ywc');
            root.style.position = 'fixed';
            root.style.left = '0px';
            root.style.top = '0px';
            root.style.zIndex = '30065';
            root.style.display = 'block';
            root.style.cursor = 'default';
            root.style.touchAction = 'none';
            root.style.userSelect = 'none';
            // 1.3.4：root 整块矩形永远不吃指针；只有下面的 .ywc-hit 头部圆可点。
            root.style.pointerEvents = 'none';
            root.style.boxSizing = 'border-box';
            root.style.overflow = 'visible';
            root.setAttribute('data-ywc', '1');
            root.setAttribute('role', 'button');
            root.setAttribute('tabindex', '0');
            root.setAttribute('aria-label', '余小温 · 点击开关总控台，拖动移动');
            root.setAttribute('title', '余小温 · 点击开关总控台，拖动移动');
            root.dataset.dock = 'right';
            root.dataset.phase = 'static';
            root.dataset.action = 'static';
            root.dataset.panel = 'closed';
            root.dataset.dragging = 'false';
            root.dataset.renderer = 'placeholder';

            const stage = make('div', 'ywc-stage');
            stage.setAttribute('aria-hidden', 'true');
            const mirror = make('div', 'ywc-mirror');
            const canvas = doc.createElement('canvas');
            canvas.className = 'ywc-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.width = 1;
            canvas.height = 1;
            const placeholder = make('span', 'ywc-placeholder');
            placeholder.setAttribute('aria-hidden', 'true');
            placeholder.appendChild(make('i', 'ywc-ember'));
            // 1.3.4：唯一可点的头部圆。透明、原生 circle 裁切；位置由 syncHitCircle 写。
            const hit = make('div', 'ywc-hit');
            hit.setAttribute('aria-hidden', 'true');
            hit.setAttribute('data-ywc-hit', '1');
            // 3 个纯 CSS 小光点：不建 canvas、不跑 RAF、不接网络；只做漂浮态的低频粒子。
            const particles = make('div', 'ywc-particles');
            particles.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < 3; i++) particles.appendChild(make('i', 'ywc-spark'));
            mirror.appendChild(canvas);
            mirror.appendChild(hit);
            stage.appendChild(mirror);
            stage.appendChild(particles);
            stage.appendChild(placeholder);
            root.appendChild(stage);
            (doc.body || doc.documentElement).appendChild(root);
            state.root = root;
            state.stage = stage;
            state.mirror = mirror;
            state.hit = hit;
            state.canvas = canvas;
            state.placeholder = placeholder;
            try { state.ctx = canvas.getContext ? canvas.getContext('2d') : null; } catch (e) { state.ctx = null; }

            state.dock = dockFromSaved();
            state.pos = defaultHome();
            setRootAttrs();
            applySize();
            applyPosition(state.pos, false);
            syncHome();
            drawPlaceholder();

            listen(root, 'pointerdown', onPointerDown);
            listen(root, 'pointermove', onPointerMove);
            listen(root, 'pointerup', onPointerUp);
            listen(root, 'pointercancel', onPointerCancel);
            listen(root, 'lostpointercapture', onPointerCancel);
            listen(root, 'keydown', onKeyDown);
            // hover 只认头部圆（root 是 none，不会收到 enter/leave）；只更新标记，不改动作/位置。
            listen(hit, 'pointerenter', (event) => {
                if (event && event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
                setHover(true);
            });
            listen(hit, 'pointerleave', (event) => {
                if (event && event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
                setHover(false);
            });
            listen(doc, 'visibilitychange', onVisibility);
            listen(win, 'resize', onViewportChange);
            if (win.visualViewport) {
                listen(win.visualViewport, 'resize', onViewportChange);
                listen(win.visualViewport, 'scroll', onViewportChange);
            }

            state.started = true;
            state.phase = 'static';
            if (state.pendingPanel) {
                const pending = state.pendingPanel;
                state.pendingPanel = null;
                state.panelOpen = !!pending.open;
                state.panelRect = pending.rect || null;
                setRootAttrs();
                updateAvoid();
            }
            if (state.enabled) playRest();
            else { stopRaf(); state.phase = 'disabled'; setRootAttrs(); }
            notify('start');
            loadManifest().then(onManifestReady).catch(() => onManifestReady(null));
        } catch (e) {
            mediaError('伴侣启动失败: ' + (e && e.message ? e.message : e));
        }
        return state.api;
    }

    /**
     * 主控面板开/关：只切 avoid/attrs。
     * 绝不在这里选 return/exit/rest/blink，也不迁移 home/stage/pos；
     * 角色出/入边只由 hover 指针状态决定。
     */
    function setPanelOpen(open, panelRect) {
        const next = !!open;
        if (!state.started) {
            state.pendingPanel = { open: next, rect: panelRect || null };
            return state.api;
        }
        if (state.disposed) return state.api;
        state.panelRect = panelRect && typeof panelRect === 'object' ? panelRect : null;
        const changed = state.panelOpen !== next;
        state.panelOpen = next;
        setRootAttrs();
        updateAvoid();
        if (changed) notify('panel');
        return state.api;
    }

    function refresh() {
        if (state.disposed) return state.api;
        let root = null;
        try { root = getSettings(); } catch (e) { root = null; }
        const next = readCompanionSettings(root);
        const prev = state.settings;
        if (companionSettingsEqual(prev, next)) {
            state.settings = next;
            state.enabled = next.enabled;
            syncSettingsPanel();
            return state.api;
        }
        applySettingsChange(prev, next);
        syncSettingsPanel();
        if (state.manifestFailed && state.enabled) {
            loadManifest().then(onManifestReady).catch(() => onManifestReady(null));
        }
        return state.api;
    }

    function mountSettings(container) {
        if (state.disposed) return null;
        let target = container;
        if (typeof target === 'string') target = doc ? doc.querySelector(target) : null;
        if (!isElement(target)) {
            mediaError('mountSettings 未收到有效容器');
            return null;
        }
        destroySettingsPanel();
        const panel = makeSettingsPanel(target);
        if (!panel) return null;
        const cleanup = () => {
            if (state.settingsPanel === panel) {
                destroySettingsPanel();
            } else {
                try { panel.destroy(); } catch (e) { /* noop */ }
            }
        };
        // 契约：返回可调用的 cleanup；同时挂 .cleanup 便于按对象解构调用。
        cleanup.cleanup = cleanup;
        cleanup.destroy = cleanup;
        return cleanup;
    }

    function dispose() {
        if (state.disposed) return;
        state.disposed = true;
        stopRaf();
        for (const off of state.listeners.splice(0)) {
            try { off(); } catch (e) { /* noop */ }
        }
        destroySettingsPanel();
        for (const img of state.atlasImgs.values()) {
            try { img.onload = null; img.onerror = null; } catch (e) { /* noop */ }
        }
        if (state.staticImg) {
            try { state.staticImg.onload = null; state.staticImg.onerror = null; } catch (e) { /* noop */ }
        }
        state.atlasImgs = new Map();
        state.staticImg = null;
        state.atlasReady = false;
        state.drawnFrameObj = null;
        state.alphaMasks.clear();
        state.alphaMaskFailed = false;
        if (state.root) {
            try { state.root.remove(); } catch (e) { /* noop */ }
        }
        state.root = null;
        state.stage = null;
        state.mirror = null;
        state.hit = null;
        state.headCircle = null;
        state.lastHeadCircle = null;
        state.canvas = null;
        state.ctx = null;
        state.placeholder = null;
        state.started = false;
        state.phase = 'disposed';
        notify('dispose');
    }

    state.api = {
        start,
        setPanelOpen,
        refresh,
        mountSettings,
        resetPosition,
        dispose,
        status: snapshot,
        // 便于外壳做“同源默认”与自检；不是额外设置层。
        defaults: COMPANION_DEFAULTS,
    };
    return state.api;
}

export default createCompanion;
