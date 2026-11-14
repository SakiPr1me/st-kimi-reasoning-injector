// ======================================================================
// scene-boundary-ui.js — 「替换／关闭开幕场记」独立 UI（仅界面层，v1.0.1）
// v1.0.1（362）：字段从五元组扩成七元组 —— 新增 config.closeScene（勾选「关闭开幕场记」，
//   默认 true 延续 361；只挂在替换模块模式，直接正文固定关闭、不露这项勾选）与 config.omitTag
//   （勾选「不发送此模块内容」，默认 false，挂在发送开关区底部；只影响本轮请求发给后端的
//   历史提示词：显示保留、正则原件不动，主插件在本轮请求副本尾部临时接一条置于所有正则
//   最后的处理，仅本轮请求生效，不写进正则原件）。
//   文案全部说「关闭／保留／不发送」，不再说删除原件；直接正文 = 本轮关闭开幕场记（原件保留），
//   format 的 scene_mod 变量行照常保留。
// ----------------------------------------------------------------------
// 职责边界（为什么这个文件只做 UI）：
//   · 命中判定 / 改动计算全部在 deps.preview（核心 buildScenePlan）里，这里一个字不猜；
//   · 落盘只有一条路 deps.saveConfig（主插件按预设保存的 sceneBoundaryByPreset），
//     预设原件 / 世界书 / 正则在本文件里只读不写 —— 「不写原件」由架构保证，不靠自觉；
//   · deps.saveConfig(raw, expectedPreset) 的第二参 = 捕获的预设名：异步保存回来时
//     核心（saveSceneBoundaryConfig）会拒掉晚到的跨预设写入，这里再叠一层晚到自保。
// 状态机（作者定的口径）：
//   · 开启勾选 = 先预览校验，成功才 saveConfig（开启用的就是应用配置）；失败勾选弹回 + 出人话原因；
//   · 关闭勾选 = 直接 disable，不需要有效 plan，且不把草稿其它字段写回（只送 {…生效配置, enabled:false}）；
//   · 改字段 = 保草稿，直到「预览」→「应用」；预览后草稿再动 ⇒ 预览过期，「应用」锁住；
//   · 错误绝不覆盖原配置；「取消」回实际配置；切预设 refresh 丢旧草稿不串写。
// 视觉（沿用现有语言，不新造色）：
//   · kimi-inner-card / kimi-fold-head（勾选与展开独立，W174 同款）/ kimi-btn / text_pole /
//     kimi-hint / kimi-label / kimi-sep / checkbox_label；色只用 --SmartTheme* / --kimi-ink-* /
//     --golden-color（本文件兜底复刻同一套 color-mix 配比，挂 .ywsb-root 自己那层，深浅自动跟随）；
//   · 触控 ≥32px；预览前后文自然页滚（无内部滚动容器 —— 重绘不许跳滚动/输入内容）。
// 导入期零 DOM 访问；一切构建都发生在 mountSceneBoundaryUI() 里。
// 导出：mountSceneBoundaryUI(host, deps) → { refresh(), destroy() }
//       __sceneBoundaryInternals（纯函数 + 无头状态机，供 node 测试；浏览器勿依赖）
// ======================================================================

const FIELDS = ['enabled', 'mode', 'source', 'tag', 'moduleText', 'closeScene', 'omitTag'];
const BOOL_FIELDS = new Set(['enabled', 'closeScene', 'omitTag']);
const MODES = new Set(['content', 'replace']);
const SOURCES = new Set(['existing', 'paste']);
const FIELD_SET = new Set(FIELDS);
/** 两个新字段的缺省值（唯一来源：新装与旧配置缺字段都从这里取，同源口径）。
 *  closeScene 默认 true = 延续 361（原场记本轮关闭）；omitTag 默认 false = 模块内容照常发送。 */
export const SCENE_FIELD_DEFAULTS = { closeScene: true, omitTag: false };
/** 本 UI 模块版本（362 波次升 1.0.1；主插件加载戳与 manifest 由主统一配对）。 */
export const SCENE_BOUNDARY_UI_VERSION = '1.0.3';
/** 布尔兜底：'true'/'false' 字符串也认（防手改 settings.json）；缺（undefined/null）给同源缺省值。 */
const asBool = (v, dflt) => (v === 'true' ? true : v === 'false' ? false : (v === undefined || v === null) ? dflt : v === true);

/** 任何来源的配置（可能是 {}、残缺、被写坏的形状）都归一成安全七元组；绝不抛出（铁律27：坏数据不许砸UI）。 */
export function normalizeRaw(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        enabled: r.enabled === true,
        mode: MODES.has(r.mode) ? r.mode : 'content',
        source: SOURCES.has(r.source) ? r.source : 'existing',
        tag: typeof r.tag === 'string' ? r.tag : String(r.tag ?? ''),
        moduleText: typeof r.moduleText === 'string' ? r.moduleText : String(r.moduleText ?? ''),
        closeScene: asBool(r.closeScene, SCENE_FIELD_DEFAULTS.closeScene),
        omitTag: asBool(r.omitTag, SCENE_FIELD_DEFAULTS.omitTag),
    };
}
const cloneRaw = raw => ({
    enabled: raw.enabled === true,
    mode: raw.mode,
    source: raw.source,
    tag: raw.tag,
    moduleText: raw.moduleText,
    closeScene: raw.closeScene === true,
    omitTag: raw.omitTag === true,
});
const isThenable = v => !!v && typeof v.then === 'function';
/**
 * 送审（preview/开启）前对 raw 的最后一道修正：
 * 1) 粘贴模式永远让核心从 moduleText 自动识别标签 ⇒ tag 强制空。
 *    否则「已缝入(status) → 切粘贴(<weather>)」时，草稿里隐藏的旧 tag=status 会跟粘贴模块对不上，
 *    核心拒绝而用户无处改（标签输入框在粘贴模式下是隐藏的）——真 UX 事故。
 * 2) 直接正文模式固定「关闭开幕场记」且不派生模块发送开关 ⇒ closeScene 强 true、omitTag 强 false
 *    （正文模式下没有模块可省，也绝不能动正文本身；界面在这档隐藏这两项勾选）。
 * 只影响送审/落盘推导；草稿里对应字段原样保留（切回替换模块时勾选还原成用户自己的选择）。
 */
const rawForCore = raw => {
    let r = raw;
    if (r.source === 'paste') r = { ...r, tag: '' };
    if (r.mode === 'content') r = { ...r, closeScene: true, omitTag: false };
    return r;
};

/** 七元组相等（两边都先归一，残缺形状也能比）。 */
export function sameRaw(a, b) {
    const x = normalizeRaw(a), y = normalizeRaw(b);
    for (const f of FIELDS) if (x[f] !== y[f]) return false;
    return true;
}

// 徽标文案：核心实际会发的 kind（guide-remove / format-remove / chain-content / world-neutral / regex-wrap 等）。
// 精确命中走全表；没收录的复合词按段翻（能翻的翻、翻不了的保留原文，如 guide-x → 引导词·x）；
// 宁显示原文不造错词；空 kind 兜底「改动」。
const KIND_PARTS = {
    guide: '场记要求', format: '输出格式', chain: '思维链', world: '世界支线', regex: '正则',
    prompt: '提示词', content: '正文', module: '模块', tag: '标签', order: '顺序',
    remove: '移除', neutral: '不动', wrap: '包裹',
    slate: '原场记', close: '关闭', keep: '保留', omit: '不发送', derive: '派生',
};
const KIND_LABELS = {
    prompt: '提示词', regex: '正则', content: '正文', module: '模块', tag: '标签', order: '顺序',
    disabled: '本轮关闭',
    'guide-remove': '场记要求', 'guide-paste': '新模块',
    'format-remove': '输出格式', 'format-replace': '输出格式', 'format-reuse': '输出格式',
    'format-in-place': '输出格式', 'format-move': '输出格式', 'format-insert': '输出格式',
    'chain-content': '思维链', 'chain-retag': '思维链',
    'world-neutral': '世界支线', 'regex-wrap': '分界正则',
};
const kindLabel = k => {
    const raw = String(k || '');
    const key = raw.toLowerCase();
    if (KIND_LABELS[key]) return KIND_LABELS[key];
    const parts = key.split(/[-_]+/).map(p => KIND_PARTS[p] || p);
    return raw ? parts.join('·') : '改动';
};
const shortText = (t, n = 48) => (t.length > n ? t.slice(0, n) + '…' : t);

/**
 * 前后文都可能是整段提示词（几百上千字）——直接全文铺会撑爆页面。
 * 这里按「最长公共前缀 + 最长公共后缀」削出真正改动的中段片段，摘要只铺片段，
 * 全文收进二级 details（默认收起）。纯字符级，不猜语义，core 的 before/after 原样保底。
 */
export function diffFragment(before, after) {
    const b = String(before ?? ''), a = String(after ?? '');
    if (b === a) return { same: b.length, before: '', after: '', beforeLen: b.length, afterLen: a.length, identical: true };
    const minL = Math.min(b.length, a.length);
    let p = 0;
    while (p < minL && b[p] === a[p]) p++;
    let s = 0;
    const sMax = minL - p;
    while (s < sMax && b[b.length - 1 - s] === a[a.length - 1 - s]) s++;
    return {
        same: p + s,
        before: b.slice(p, b.length - s),
        after: a.slice(p, a.length - s),
        beforeLen: b.length,
        afterLen: a.length,
        identical: false,
    };
}

/** 「现有效状态」一行人话摘要（另显示用，不与草稿混）。 */
export function effectiveSummary(raw, presetKey) {
    const r = normalizeRaw(raw);
    let text;
    if (!r.enabled) text = '未启用';
    else if (r.mode === 'content') text = '直接正文 · 本轮关闭开幕场记（原件保留）';
    else if (r.source === 'existing') text = '替换模块 · 已缝入／世界书已有' + (r.tag ? ' · 标签「' + shortText(r.tag) + '」' : ' · 标签未填');
    else text = '替换模块 · 粘贴完整模块（临场插到原场记前）';
    if (r.enabled && r.mode === 'replace') {
        text += r.closeScene ? ' · 关闭原场记' : ' · 原场记保留';
        if (r.omitTag) text += ' · 模块内容不发送';
    }
    const preset = String(presetKey ?? '').trim();
    return preset ? text + ' · 预设「' + preset + '」' : text;
}

/** 应用时真正送进 saveConfig 的配置：核心给的 plan.config（归一结果）优先（含 closeScene/omitTag 的强推结果），
 *  enabled 永远以预览时的意图为准；核心还没给的新字段沿用草稿值（旧核心桥接期不丢用户选择）。 */
export function mergePlanConfig(target, plan) {
    const merged = cloneRaw(target);
    const cfg = plan && typeof plan === 'object' && plan.config && typeof plan.config === 'object' && !Array.isArray(plan.config) ? plan.config : null;
    if (cfg) for (const f of FIELDS) if (f !== 'enabled' && cfg[f] !== undefined) merged[f] = cfg[f];
    return merged;
}

/** plan → 纯展示模型（坏形状/缺字段都兜住，绝不抛）。 */
export function planView(plan) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
    const errors = Array.isArray(plan.errors) ? plan.errors.map(e => (typeof e === 'string' ? e : String(e?.message ?? e))) : [];
    const changes = Array.isArray(plan.changes) ? plan.changes
        .filter(c => c && typeof c === 'object' && !Array.isArray(c))
        .map(c => ({
            kind: String(c.kind ?? ''),
            title: String(c.title ?? ''),
            before: typeof c.before === 'string' ? c.before : String(c.before ?? ''),
            after: typeof c.after === 'string' ? c.after : String(c.after ?? ''),
        })) : [];
    return { ok: plan.ok === true, errors, changes };
}

/**
 * 无头状态机：全部行为逻辑在这里，DOM 渲染只是它的一个订阅者（node 可直接测）。
 * deps = { getPresetKey, getConfig, preview, saveConfig, onError? }
 * hooks = { onChange?(state), console? } —— onChange 每次状态落定后回调（渲染层重画）。
 */
export function createSceneBoundaryCore(deps, hooks = {}) {
    for (const name of ['getPresetKey', 'getConfig', 'preview', 'saveConfig']) {
        if (typeof deps?.[name] !== 'function') throw new TypeError('mountSceneBoundaryUI: deps.' + name + ' 必须是函数');
    }
    // onError 是给人看的通道（主插接 toastr.warning）——只送人话字符串；通道本身坏了也不能反噬状态机。
    const report = message => { try { deps.onError?.(String(message)); } catch { /* 上报失败不追加处理 */ } };
    const note = error => { try { (hooks.console ?? console).warn('[余温工具箱] 场记UI', error); } catch { } };

    const state = {
        dead: false, busy: 0, key: '',
        effective: normalizeRaw(null),   // 当前生效配置（saveConfig 成功后重读）
        draft: null,                     // 用户改了字段才有；完整七元组，不是差量
        plan: null,                      // { raw:预览快照, view:planView, sourcePlan:核心原计划 } —— 「应用」只认它
        planExternal: false,             // refresh（同 key）过后预设数据可能已变（prompts/正则/顺序表）⇒ 旧预览必须重核
        planStale: false,                // 派生值：草稿动了 或 refresh 过 ⇒ 过期，锁「应用」
        status: '',                      // 瞬时人话反馈（role=status）
    };
    const visible = () => state.draft ?? state.effective;
    const syncDerived = () => { state.planStale = !!state.plan && (state.planExternal || !sameRaw(state.plan.raw, visible())); };
    const notify = () => { syncDerived(); try { hooks.onChange?.(state); } catch (e) { note(e); } };

    const readKeySafe = () => { try { return String(deps.getPresetKey() ?? ''); } catch { return ''; } };
    const readConfigSafe = () => {
        try { return normalizeRaw(deps.getConfig()); }
        catch (e) { report('读不到场记配置，先按「未启用」显示。'); note(e); return normalizeRaw(null); }
    };
    const save = async (raw, key) => {
        const r = deps.saveConfig(raw, key);            // ★第二参 = 捕获的预设名（主插据此拒跨预设晚到写入）
        return isThenable(r) ? await r : r !== false;   // 契约 bool：只有显式 false / 抛错算失败
    };
    const previewOnce = async raw => {
        const r = deps.preview(raw);
        return isThenable(r) ? await r : r;
    };
    // 统一的请求闸：busy 计数（请求期间按钮全禁）；回来先对预设名，晚到的一律只熄 busy、不碰新状态。
    async function runGuarded(key, fn) {
        state.busy++;
        notify();
        let late = false, out;
        try { out = await fn(); }
        catch (e) { note(e); out = undefined; }
        finally {
            state.busy = Math.max(0, state.busy - 1);
            late = state.dead || state.key !== key;
            notify();
        }
        return late ? undefined : out;
    }
    const canApply = () => !!state.draft && !!state.plan && state.plan.view.ok === true && !state.planStale;

    function init() {
        state.key = readKeySafe();
        state.effective = readConfigSafe();
        notify();
    }
    /** 主插在预设切换/设置事件上调用；key 变化 = 换预设 ⇒ 丢草稿丢预览，绝不串写。 */
    function refresh() {
        if (state.dead) return;
        const key = readKeySafe();
        if (key !== state.key) {
            const hadDraft = !!state.draft;
            state.key = key;
            state.draft = null;
            state.plan = null;
            state.planExternal = false;
            state.effective = readConfigSafe();
            state.status = hadDraft ? '已切换预设，未应用的修改没有带过去。' : '';
            notify();
            return;
        }
        // 同 key：预设内容（提示词/顺序表/正则）也可能在别处被改过 —— 主插刷新即视为「数据可能变了」，
        // 旧预览一律作废（保存时核心会再核一遍，这里保证界面上不留过期结论）。
        if (state.plan) state.planExternal = true;
        const eff = readConfigSafe();
        if (!sameRaw(eff, state.effective)) {
            state.effective = eff;
            if (state.draft && sameRaw(state.draft, eff)) state.draft = null;   // 外部已改成与草稿一致 ⇒ 草稿无事可做
            state.status = '';
        }
        notify();
    }
    function setField(field, value) {
        if (state.dead || !FIELD_SET.has(field)) return;
        if (!state.draft) state.draft = cloneRaw(state.effective);
        if (BOOL_FIELDS.has(field)) state.draft[field] = value === true;
        else state.draft[field] = String(value ?? '');
        notify();
    }
    async function preview() {
        if (state.dead || state.busy) return;
        const key = state.key;
        const raw = cloneRaw(visible());
        const got = await runGuarded(key, async () => {
            try { return { plan: await previewOnce(rawForCore(raw)), threw: false }; }
            catch (e) { report('预览出了问题，原配置没有被改动。'); note(e); return { plan: null, threw: true }; }
        });
        if (!got) return;                                       // 晚到/已销毁：什么都不改
        if (got.threw) return;                                  // 人话已上报，状态原样
        const view = planView(got.plan);
        if (!view) { report('预览没有返回有效结果，先保持原样。'); return; }
        state.plan = { raw, view, sourcePlan: got.plan };       // sourcePlan = 核心原计划（含自动识别出的 config.tag）
        state.planExternal = false;                             // 刚核过的新预览，覆盖任何「外部已过期」标记
        state.status = '';
        notify();
    }
    async function apply() {
        if (state.dead || state.busy || !canApply()) return;
        const key = state.key;
        const snapshot = cloneRaw(state.draft);                 // 真正送出去的那份（用户保存期间继续打字也不受影响）
        const sent = mergePlanConfig(snapshot, state.plan.sourcePlan);
        const got = await runGuarded(key, async () => {
            try { return { ok: (await save(sent, key)) !== false, threw: false }; }
            catch (e) { report('保存没有成功，草稿还留着。'); note(e); return { ok: false, threw: true }; }
        });
        if (!got) return;
        if (!got.ok) { state.status = '保存没有成功，草稿还留着。'; notify(); return; }
        state.effective = readConfigSafe();
        if (state.draft && sameRaw(state.draft, snapshot)) state.draft = null;   // 草稿已原样应用 ⇒ 消化掉
        state.plan = null;
        state.planExternal = false;
        state.status = '已应用。';
        notify();
    }
    function cancel() {
        if (state.dead || state.busy) return;
        state.draft = null;
        state.plan = null;
        state.planExternal = false;
        state.status = '已还原为当前生效配置。';
        notify();
    }
    /** 勾选框开关。开 = 先预览（草稿/生效 + enabled:true），成功才 saveConfig；关 = 直接关，不带草稿字段。 */
    async function toggleEnable(on) {
        if (state.dead || state.busy) { notify(); return; }     // busy 期间点不动：渲染层按可见态弹回
        const key = state.key;
        if (!on) {
            const sent = { ...cloneRaw(state.effective), enabled: false };   // ★只关开关：草稿其它字段一个都不写回
            const got = await runGuarded(key, async () => {
                try { return { ok: (await save(sent, key)) !== false, threw: false }; }
                catch (e) { report('关闭没有成功，可以再试一次。'); note(e); return { ok: false, threw: false }; }
            });
            if (!got) return;
            if (!got.ok) { state.status = '关闭没有成功，可以再试一次。'; notify(); return; }
            state.effective = readConfigSafe();
            if (state.draft) state.draft.enabled = false;       // 草稿跟着关（避免之后「应用」又把功能顶开）
            state.status = '已关闭替换功能，恢复开幕场记。';
            notify();
            return;
        }
        const base = cloneRaw(visible());
        const target = { ...base, enabled: true };
        const first = await runGuarded(key, async () => {
            try { return { plan: await previewOnce(rawForCore(target)), threw: false }; }
            catch (e) { report('开启前检查出了问题，先保持关闭。'); note(e); return { plan: null, threw: true }; }
        });
        if (!first) return;                                     // 晚到：渲染层按生效态弹回勾选框
        const view = planView(first.plan);
        if (first.threw) { notify(); return; }
        if (!view) { state.status = '预览没有返回有效结果，先保持关闭。'; notify(); return; }
        if (!view.ok) {
            // 开不了：原因展示成错误卡；生效配置原样不动，勾选框弹回
            state.plan = { raw: target, view, sourcePlan: first.plan };
            state.planExternal = false;
            state.status = '还开不了 —— 原因在下面，补好再勾。';
            notify();
            return;
        }
        const sent = mergePlanConfig(target, first.plan);
        const second = await runGuarded(key, async () => {
            try { return { ok: (await save(sent, key)) !== false, threw: false }; }
            catch (e) { report('开启没有成功，先保持关闭。'); note(e); return { ok: false, threw: false }; }
        });
        if (!second) return;
        if (!second.ok) { state.status = '开启没有成功，先保持关闭。'; notify(); return; }
        state.effective = readConfigSafe();
        if (state.draft && sameRaw(state.draft, base)) state.draft = null;      // 草稿随这次开启一并应用 ⇒ 消化掉
        else if (state.draft) state.draft.enabled = true;                        // 保存期间又打了字 ⇒ 留草稿，勾选态跟上
        state.plan = null;
        state.planExternal = false;
        state.status = '已开启。';
        notify();
    }
    function dispose() {
        if (state.dead) return;
        state.dead = true;
        state.busy = 0;
        state.draft = null;
        state.plan = null;
        state.planExternal = false;
    }
    return { state, canApply, init, refresh, setField, preview, apply, cancel, toggleEnable, dispose };
}

// ======================================================================
// 渲染层（下面全是 DOM；导入期不碰 document）
// ======================================================================

const STYLE_ID = 'kimi-scene-boundary-ui-style';
let styleUsers = 0;   // 同页可能先后重建面板：引用计数管理 <style>，最后一个 destroy 才摘

const CSS = `
.ywsb-root {
    /* 与主面板同一套色阶（#kimi_reasoning_injector_settings 已定义 --kimi-ink-*，这里只做兜底，
       配比逐字复刻主面板：88% / 78% / 40% —— 全是量过对比度的档，不新造色）。 */
    --ywsb-ink-1: var(--kimi-ink-1, var(--SmartThemeBodyColor, #dcdcdc));
    --ywsb-ink-2: var(--kimi-ink-2, color-mix(in srgb, var(--SmartThemeBodyColor, #dcdcdc) 88%, transparent));
    --ywsb-ink-3: var(--kimi-ink-3, color-mix(in srgb, var(--SmartThemeBodyColor, #dcdcdc) 78%, transparent));
    --ywsb-ink-name: var(--kimi-ink-name, color-mix(in srgb, var(--SmartThemeQuoteColor, #f0a35e) 40%, var(--SmartThemeBodyColor, #dcdcdc)));
    margin-top: 8px;
}
/* —— 既有视觉语言的兜底复刻（挂在本容器外时也有形；在主面板内由原规则接管，ID 权重更高） —— */
.ywsb-root .kimi-fold-head { min-height: 32px; }
.ywsb-root .kimi-fold-head .kimi-fold-caret { transition: transform 0.12s ease; }
.ywsb-root .kimi-fold-head.open .kimi-fold-caret { transform: rotate(90deg); }
.ywsb-root .kimi-btn {
    padding: 3px 10px;
    border-radius: 8px;
    border: 1px solid var(--SmartThemeBorderColor);
    background: color-mix(in srgb, var(--SmartThemeBodyColor, #dcdcdc) 5%, transparent);
    color: var(--SmartThemeBodyColor, inherit);
    cursor: pointer;
    font-size: 0.85em;
    transition: filter 0.15s ease;
    min-height: 32px;
}
.ywsb-root .kimi-btn:hover { filter: brightness(1.15); }
.ywsb-root .kimi-hint { font-size: 0.72em; color: var(--ywsb-ink-3); line-height: 1.5; margin: 3px 0 0; }
.ywsb-root .kimi-label { display: block; margin-bottom: 4px; font-size: 0.88em; color: var(--ywsb-ink-2); font-weight: 600; }
.ywsb-root .kimi-sep { border-top: 1px solid var(--SmartThemeBorderColor); margin: 8px 0; opacity: 0.6; }
.ywsb-root .kimi-section-label { font-size: 0.82em; font-weight: 700; color: var(--ywsb-ink-2); margin: 4px 0 2px; }
.ywsb-root .kimi-inner-card { border: 1px solid var(--SmartThemeBorderColor); border-radius: 10px; padding: 8px 10px; margin-top: 8px; background: color-mix(in srgb, var(--SmartThemeBodyColor, #dcdcdc) 3%, transparent); }
/* —— 本文件自有部件 —— */
/* 勾选框独立热区：≥32px 的外层 label（点它只切功能，展开由行头管）；checkbox 视觉沿用 ST 原生 */
.ywsb-root .ywsb-chk {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 32px;
    flex: none;
    cursor: pointer;
}
.ywsb-root .ywsb-chk input[type="checkbox"] { width: 16px; height: 16px; margin: 0; cursor: pointer; }
.ywsb-root .ywsb-caret { font-size: 13px; line-height: 1; color: var(--ywsb-ink-3); }
.ywsb-root .ywsb-title {
    font-size: 0.95em;
    font-weight: 700;
    color: var(--golden-color, #e0a800);
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ywsb-root .ywsb-body { margin-top: 4px; }
.ywsb-root .ywsb-lead { margin: 0 0 4px; }
.ywsb-root .ywsb-effective { margin: 2px 0 0; color: var(--ywsb-ink-2); overflow-wrap: anywhere; }
.ywsb-root .ywsb-radios { display: flex; flex-wrap: wrap; gap: 0 14px; align-items: center; }
.ywsb-root label.ywsb-radio { display: inline-flex; align-items: center; gap: 6px; margin: 0; min-height: 32px; font-size: 0.88em; color: var(--ywsb-ink-1); }
.ywsb-root label.ywsb-radio input[type="radio"] { width: 15px; height: 15px; margin: 0; flex: none; cursor: pointer; }
.ywsb-root .ywsb-field { margin-top: 6px; }
.ywsb-root .ywsb-field .text_pole { width: 100%; box-sizing: border-box; min-height: 32px; }
.ywsb-root textarea.text_pole { min-height: 96px; font: 12px/1.45 ui-monospace, Consolas, monospace; resize: vertical; }
.ywsb-root .ywsb-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.ywsb-root .ywsb-actions .kimi-btn { flex: none; }
.ywsb-root .ywsb-chip {
    font-size: 0.75em;
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid var(--SmartThemeBorderColor);
    color: var(--ywsb-ink-2);
    background: color-mix(in srgb, var(--SmartThemeQuoteColor, #f0a35e) 14%, transparent);
    white-space: nowrap;
}
.ywsb-root .ywsb-stale { color: var(--ywsb-ink-name); margin-top: 4px; }
.ywsb-root .ywsb-errors { border-left: 3px solid var(--SmartThemeQuoteColor); }
.ywsb-root .ywsb-block-title { font-size: 0.85em; font-weight: 700; color: var(--ywsb-ink-2); margin-bottom: 2px; }
.ywsb-root .ywsb-error-line { font-size: 0.82em; color: var(--ywsb-ink-1); line-height: 1.5; margin-top: 2px; overflow-wrap: anywhere; }
/* 每处改动 = 可折叠 details（长提示词默认收起，页面不被撑爆；改动小的自动展开） */
.ywsb-root details.ywsb-change { border: 1px solid var(--SmartThemeBorderColor); border-radius: 10px; padding: 6px 10px; margin-top: 8px; background: color-mix(in srgb, var(--SmartThemeBodyColor, #dcdcdc) 3%, transparent); }
.ywsb-root details.ywsb-change > summary {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
    min-height: 32px;
    cursor: pointer;
    user-select: none;
    list-style: none;
}
.ywsb-root details.ywsb-change > summary::-webkit-details-marker { display: none; }
.ywsb-root details.ywsb-change > summary::after {
    content: '▸';
    margin-left: auto;
    opacity: 0.7;
    font-size: 13px;
    line-height: 1;
    transition: transform 0.15s ease;
    flex: none;
}
.ywsb-root details.ywsb-change[open] > summary::after { transform: rotate(90deg); }
.ywsb-root details.ywsb-change > summary:hover { filter: brightness(1.08); }
.ywsb-root .ywsb-change-head { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; min-width: 0; }
.ywsb-root .ywsb-kind { font-size: 0.72em; border: 1px solid var(--SmartThemeBorderColor); border-radius: 6px; padding: 0 6px; color: var(--ywsb-ink-2); white-space: nowrap; flex: none; }
.ywsb-root .ywsb-change-title { font-size: 0.85em; font-weight: 600; color: var(--ywsb-ink-1); overflow-wrap: anywhere; min-width: 0; }
.ywsb-root .ywsb-change-meta { font-size: 0.75em; color: var(--ywsb-ink-3); white-space: nowrap; flex: none; }
.ywsb-root .ywsb-io-label { font-size: 0.75em; font-weight: 600; color: var(--ywsb-ink-3); margin-top: 6px; }
.ywsb-root .ywsb-omit-note { font-size: 0.72em; color: var(--ywsb-ink-3); margin: 2px 0 0; }
.ywsb-root details.ywsb-full > summary {
    cursor: pointer;
    user-select: none;
    list-style: none;
    min-height: 32px;
    display: flex;
    align-items: center;
    font-size: 0.78em;
    color: var(--ywsb-ink-2);
    margin-top: 6px;
}
.ywsb-root details.ywsb-full > summary::-webkit-details-marker { display: none; }
.ywsb-root details.ywsb-full > summary::before { content: '▸ '; opacity: 0.7; }
.ywsb-root details.ywsb-full[open] > summary::before { content: '▾ '; }
/* 预览长文：自然页滚 —— 无 max-height、无内部滚动（铁律：内容不进内滚容器） */
.ywsb-root .ywsb-pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font: 12px/1.5 ui-monospace, Consolas, monospace;
    color: var(--ywsb-ink-2);
    margin: 2px 0 0;
}
.ywsb-root .ywsb-empty { color: var(--ywsb-ink-3); font-style: italic; }
.ywsb-root .ywsb-apply-note { margin-top: 6px; }
.ywsb-root .ywsb-status { display: block; min-height: 1em; margin-top: 4px; color: var(--ywsb-ink-2); overflow-wrap: anywhere; }
.ywsb-root button:disabled, .ywsb-root input:disabled, .ywsb-root textarea:disabled { opacity: 0.55; cursor: default; }
`;

let mountSeq = 0;

/**
 * 挂载入口。
 * deps = { getPresetKey:()=>name, getConfig:()=>raw, preview:(raw)=>plan,
 *          saveConfig:(raw, expectedPreset)=>bool|Promise<bool>, onError?:(message)=>void }
 * plan = { ok, errors:string[], changes:[{kind,title,before,after}], config? }（config 可含 closeScene/omitTag，核心强推值优先）
 * 返回 { refresh(), destroy() }。
 */
export function mountSceneBoundaryUI(host, deps) {
    if (!host || typeof host.appendChild !== 'function' || typeof host.ownerDocument === 'undefined' && !globalThis.document) {
        throw new TypeError('mountSceneBoundaryUI: host 必须是 DOM 容器元素');
    }
    const doc = host.ownerDocument || globalThis.document;
    if (!doc || !doc.createElement) throw new TypeError('mountSceneBoundaryUI: 拿不到 document');

    const core = createSceneBoundaryCore(deps, { onChange: () => paint(), console });

    // —— 一次性 DOM 骨架（全部 textContent 注入用户数据；标签/HTML 一律当文本） ——
    const uid = 'ywsb' + (++mountSeq);
    const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    const root = el('div', 'ywsb-root kimi-inner-card');
    const head = el('div', 'kimi-fold-head');
    const chk = doc.createElement('input');
    chk.type = 'checkbox';
    chk.id = uid + '-enabled';
    chk.setAttribute('aria-label', '启用替换／关闭开幕场记');
    // 勾选框自己的 ≥32px 独立热区（外层 label）：点这里只切功能；stopPropagation 挡住行头的展开切换，
    // 「勾选管功能、行头管展开」的 W174 分工保持不变。
    const chkWrap = el('label', 'ywsb-chk');
    chkWrap.setAttribute('for', chk.id);
    chkWrap.addEventListener('click', ev => { ev.stopPropagation(); });
    chkWrap.appendChild(chk);
    const title = el('span', 'ywsb-title', '替换／关闭开幕场记');
    title.setAttribute('aria-hidden', 'false');
    // 行尾三角用文本 ▸（不依赖 FontAwesome；颜色随主题 ink 档），展开态由 .open 旋转
    const caret = el('span', 'kimi-fold-caret ywsb-caret', '▸');
    caret.setAttribute('aria-hidden', 'true');
    head.append(chkWrap, title, caret);
    head.setAttribute('role', 'button');
    head.setAttribute('aria-expanded', 'false');
    head.setAttribute('aria-controls', uid + '-body');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-label', '替换／关闭开幕场记（勾选开启，点行头展开／收起）');

    const body = el('div', 'ywsb-body');
    body.id = uid + '-body';
    const lead = el('p', 'kimi-hint ywsb-lead', '每轮临时生效，取消总勾选后自动打开开幕场记。');
    const effLine = el('div', 'kimi-hint ywsb-effective');
    effLine.setAttribute('role', 'status');
    const sep1 = el('div', 'kimi-sep');
    const modeLabel = el('div', 'kimi-section-label', '处理方式');
    const modeBox = el('div', 'ywsb-radios');
    const mkRadio = (group, value, text) => {
        const label = el('label', 'checkbox_label ywsb-radio');
        const input = doc.createElement('input');
        input.type = 'radio';
        input.name = group;
        input.value = value;
        label.append(input, el('span', undefined, text));
        return { label, input };
    };
    const modeContent = mkRadio(uid + '-mode', 'content', '直接正文');
    const modeReplace = mkRadio(uid + '-mode', 'replace', '替换模块');
    modeBox.append(modeContent.label, modeReplace.label);
    // 模式说明（随处理方式联动换行，就地更新；讲清「关闭＝本轮临时不发送，不是动原件」）
    const mkCheck = (text, aria) => {
        const label = el('label', 'checkbox_label ywsb-radio');
        const input = doc.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('aria-label', aria);
        label.append(input, el('span', undefined, text));
        return { label, input };
    };
    const modeHint = el('p', 'kimi-hint');
    const replaceBlock = el('div');
    const sep2 = el('div', 'kimi-sep');
    const srcLabel = el('div', 'kimi-section-label', '模块来源（二选一）');
    const srcBox = el('div', 'ywsb-radios');
    const srcExisting = mkRadio(uid + '-src', 'existing', '已缝入／世界书已有模块');
    const srcPaste = mkRadio(uid + '-src', 'paste', '尚未添加模块（粘贴完整模块）');
    srcBox.append(srcExisting.label, srcPaste.label);
    const tagRow = el('div', 'ywsb-field');
    const tagLabel = el('label', 'kimi-label', '模块标签');
    tagLabel.setAttribute('for', uid + '-tag');
    const tagInput = doc.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'text_pole';
    tagInput.id = uid + '-tag';
    tagInput.placeholder = '填已缝入模块的标签';
    tagInput.setAttribute('autocomplete', 'off');
    const tagHint = el('p', 'kimi-hint', '将原有<scene>的条目（包括格式条目）和正则都改成你的标签，你不需要额外修改');
    tagRow.append(tagLabel, tagInput, tagHint);
    const pasteRow = el('div', 'ywsb-field');
    const pasteLabel = el('label', 'kimi-label', '完整模块内容');
    pasteLabel.setAttribute('for', uid + '-module');
    const moduleText = doc.createElement('textarea');
    moduleText.className = 'text_pole';
    moduleText.id = uid + '-module';
    moduleText.rows = 6;
    moduleText.placeholder = '粘贴完整带标签的模块内容';
    const pasteHint = el('p', 'kimi-hint', '模块还没加进预设时用这个：它的提示词会临时插到原场记之前，输出位置在 critique_mod 下、content 前。');
    pasteRow.append(pasteLabel, moduleText, pasteHint);
    // —— 发送开关（只挂在替换模块模式，随 replaceBlock 整块隐藏；直接正文固定关闭原场记、不派生省略） ——
    const sepSlate = el('div', 'kimi-sep');
    const slateLabel = el('div', 'kimi-section-label', '发送开关（临时生效）');
    const closeRow = el('div', 'ywsb-field');
    const chkClose = mkCheck('关闭开幕场记', '关闭开幕场记（替换模块模式下可选；直接正文固定关闭）');
    const closeHint = el('p', 'kimi-hint', '勾上＝本轮不发送原场记（预设原件不动）；取消勾选＝原场记本轮照常发送。');
    closeRow.append(chkClose.label, closeHint);
    const omitRow = el('div', 'ywsb-field');
    const chkOmit = mkCheck('不发送此模块内容', '不发送此模块内容（替换模块模式下可选；直接正文固定发送）');
    const omitHint = el('p', 'kimi-hint', '仅影响本轮请求发给后端的历史提示词：显示保留、正则原件不动；等效于在所有正则最后临时加一条（只在本轮请求生效）。');
    omitRow.append(chkOmit.label, omitHint);
    replaceBlock.append(sep2, srcLabel, srcBox, tagRow, pasteRow, sepSlate, slateLabel, closeRow, omitRow);
    const sep3 = el('div', 'kimi-sep');
    const actions = el('div', 'ywsb-actions');
    const btnPreview = el('button', 'kimi-btn', '预览');
    btnPreview.type = 'button';
    const btnApply = el('button', 'kimi-btn', '应用');
    btnApply.type = 'button';
    const btnCancel = el('button', 'kimi-btn', '取消');
    btnCancel.type = 'button';
    const chip = el('span', 'ywsb-chip', '有未应用的修改');
    chip.hidden = true;
    actions.append(btnPreview, btnApply, btnCancel, chip);
    const staleNote = el('p', 'kimi-hint ywsb-stale', '下面的预览已过期（草稿或预设内容有变动）—— 请重新「预览」。');
    staleNote.hidden = true;
    const resultBox = el('div');
    const statusLine = el('span', 'kimi-hint ywsb-status');
    statusLine.setAttribute('role', 'status');
    body.append(lead, effLine, sep1, modeLabel, modeBox, modeHint, replaceBlock, sep3, actions, staleNote, resultBox, statusLine);
    root.append(head, body);

    // —— 样式：引用计数（同页先后重建面板时，最后一个 destroy 才摘） ——
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
        style = el('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (doc.head || doc.documentElement || host).appendChild(style);
    }
    styleUsers++;

    // —— 展开态是纯视图状态（不持久化；W174 同款：勾选与展开独立） ——
    let foldOpen = false;

    const setVal = (input, v) => { if (input.value !== v) input.value = v; };

    function paintResult(s) {
        const p = s.plan;
        const sig = p ? JSON.stringify([p.view.ok, p.view.errors, p.view.changes]) : '';
        if (sig === paintResult.sig) return;
        paintResult.sig = sig;
        resultBox.replaceChildren();
        if (!p) return;
        if (!p.view.ok) {
            resultBox.appendChild(el('div', 'ywsb-block-title', '还不能应用 ——'));
            const card = el('div', 'kimi-inner-card ywsb-errors');
            if (p.view.errors.length) for (const t of p.view.errors) card.appendChild(el('div', 'ywsb-error-line', '· ' + t));
            else card.appendChild(el('div', 'ywsb-error-line', '· 没有给出具体原因，请再试一次「预览」。'));
            resultBox.appendChild(card);
            return;
        }
        resultBox.appendChild(el('div', 'ywsb-block-title', '预览（还没真正改动）'));
        if (!p.view.changes.length) {
            resultBox.appendChild(el('div', 'kimi-hint', '预览通过，没有发现要改的地方。'));
            return;
        }
        for (const c of p.view.changes) {
            const frag = diffFragment(c.before, c.after);
            const card = doc.createElement('details');
            card.className = 'ywsb-change';
            // 预览条目统一收起，按需展开查看改动。
            card.open = false;
            const sum = doc.createElement('summary');
            const head = el('div', 'ywsb-change-head');
            head.appendChild(el('span', 'ywsb-kind', kindLabel(c.kind)));
            if (c.title) head.appendChild(el('span', 'ywsb-change-title', c.title));
            sum.appendChild(head);
            sum.appendChild(el('span', 'ywsb-change-meta',
                frag.identical ? '前后相同'
                    : '改动 ' + Math.max(frag.before.length, frag.after.length) + ' 字 · 其余 ' + frag.same + ' 字相同'));
            card.appendChild(sum);
            const inner = el('div', 'ywsb-change-body');
            inner.appendChild(el('div', 'ywsb-io-label', '改动片段 · 修改前'));
            if (frag.same > 0 && !frag.identical) inner.appendChild(el('div', 'ywsb-omit-note', '（前后与原文相同的 ' + frag.same + ' 字已省略，展开下方「完整内容」看全文）'));
            inner.appendChild(frag.before ? el('div', 'ywsb-pre', frag.before) : el('div', 'ywsb-pre ywsb-empty', frag.identical ? '（前后相同）' : '（空 —— 修改前没有这段）'));
            inner.appendChild(el('div', 'ywsb-io-label', '改动片段 · 修改后'));
            inner.appendChild(frag.after ? el('div', 'ywsb-pre', frag.after) : el('div', 'ywsb-pre ywsb-empty', frag.identical ? '（前后相同）' : '（空 —— 修改后没有这段）'));
            const full = doc.createElement('details');
            full.className = 'ywsb-full';
            const fullSum = doc.createElement('summary');
            fullSum.textContent = '完整内容（修改前 ' + frag.beforeLen + ' 字 / 修改后 ' + frag.afterLen + ' 字）';
            full.appendChild(fullSum);
            const fullBody = el('div', 'ywsb-full-body');
            fullBody.appendChild(el('div', 'ywsb-io-label', '修改前 · 全文'));
            fullBody.appendChild(c.before ? el('div', 'ywsb-pre', c.before) : el('div', 'ywsb-pre ywsb-empty', '（空）'));
            fullBody.appendChild(el('div', 'ywsb-io-label', '修改后 · 全文'));
            fullBody.appendChild(c.after ? el('div', 'ywsb-pre', c.after) : el('div', 'ywsb-pre ywsb-empty', '（空）'));
            full.appendChild(fullBody);
            inner.appendChild(full);
            card.appendChild(inner);
            resultBox.appendChild(card);
        }
        resultBox.appendChild(el('div', 'kimi-hint ywsb-apply-note', '确认没问题就点「应用」。'));
    }

    function paint() {
        const s = core.state;
        const vis = s.draft ?? s.effective;
        // 勾选框 = 可见态（草稿优先）；请求期间禁点，弹回按可见态
        if (chk.checked !== vis.enabled) chk.checked = vis.enabled;
        chk.disabled = s.busy > 0 || s.dead;
        head.classList.toggle('open', foldOpen);
        head.setAttribute('aria-expanded', foldOpen ? 'true' : 'false');
        body.style.display = foldOpen ? '' : 'none';
        if (modeContent.input.checked !== (vis.mode === 'content')) modeContent.input.checked = vis.mode === 'content';
        if (modeReplace.input.checked !== (vis.mode === 'replace')) modeReplace.input.checked = vis.mode === 'replace';
        if (srcExisting.input.checked !== (vis.source === 'existing')) srcExisting.input.checked = vis.source === 'existing';
        if (srcPaste.input.checked !== (vis.source === 'paste')) srcPaste.input.checked = vis.source === 'paste';
        const replaceOn = vis.mode === 'replace';
        replaceBlock.style.display = replaceOn ? '' : 'none';
        tagRow.style.display = replaceOn && vis.source === 'existing' ? '' : 'none';
        pasteRow.style.display = replaceOn && vis.source === 'paste' ? '' : 'none';
        // 模式说明就地换行（不动任何输入框）；发送开关随 replaceBlock 整块隐藏，勾选态照常同步
        modeHint.textContent = vis.mode === 'content'
            ? '直接正文：本轮关闭开幕场记（原件保留，不做改动），format 的 scene_mod 变量行照常保留。'
            : '替换模块：本轮换用新分界；原场记与模块内容的发送由下面的开关决定。';
        if (chkClose.input.checked !== vis.closeScene) chkClose.input.checked = vis.closeScene;
        if (chkOmit.input.checked !== vis.omitTag) chkOmit.input.checked = vis.omitTag;
        chkClose.input.disabled = s.busy > 0 || s.dead;
        chkOmit.input.disabled = s.busy > 0 || s.dead;
        setVal(tagInput, vis.tag);
        setVal(moduleText, vis.moduleText);
        effLine.textContent = '当前生效：' + effectiveSummary(s.effective, s.key);
        chip.hidden = !s.draft;
        btnPreview.disabled = s.busy > 0;
        btnApply.disabled = s.busy > 0 || !core.canApply();
        btnCancel.disabled = s.busy > 0 || (!s.draft && !s.plan);
        staleNote.hidden = !(s.plan && s.planStale);
        statusLine.textContent = s.status || '';
        paintResult(s);
    }

    // —— 事件（行头点击 = 只切展开；勾选框只管功能，绝不带动展开） ——
    head.addEventListener('click', ev => {
        if (ev.target && typeof ev.target.closest === 'function' && ev.target.closest('input[type="checkbox"]')) return;
        foldOpen = !foldOpen;
        paint();
    });
    head.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        if (ev.target === chk) return;
        ev.preventDefault();
        foldOpen = !foldOpen;
        paint();
    });
    chk.addEventListener('change', () => { core.toggleEnable(chk.checked); });
    modeContent.input.addEventListener('change', () => { if (modeContent.input.checked) core.setField('mode', 'content'); });
    modeReplace.input.addEventListener('change', () => { if (modeReplace.input.checked) core.setField('mode', 'replace'); });
    srcExisting.input.addEventListener('change', () => { if (srcExisting.input.checked) core.setField('source', 'existing'); });
    srcPaste.input.addEventListener('change', () => { if (srcPaste.input.checked) core.setField('source', 'paste'); });
    tagInput.addEventListener('input', () => { core.setField('tag', tagInput.value); });
    moduleText.addEventListener('input', () => { core.setField('moduleText', moduleText.value); });
    chkClose.input.addEventListener('change', () => { core.setField('closeScene', chkClose.input.checked); });
    chkOmit.input.addEventListener('change', () => { core.setField('omitTag', chkOmit.input.checked); });
    btnPreview.addEventListener('click', () => { core.preview(); });
    btnApply.addEventListener('click', () => { core.apply(); });
    btnCancel.addEventListener('click', () => { core.cancel(); });

    host.appendChild(root);
    core.init();
    // 默认展开态 = 功能开着就展开／关着收起（W174 口径）；此后用户手动开合以手动为准
    foldOpen = core.state.effective.enabled;
    paint();

    return {
        refresh() { if (!core.state.dead) core.refresh(); },
        destroy() {
            if (core.state.dead) return;
            core.dispose();
            root.remove();
            styleUsers--;
            if (styleUsers <= 0) {
                styleUsers = 0;
                const s = doc.getElementById(STYLE_ID);
                if (s) s.remove();
            }
        },
    };
}

// node 测试钩子（浏览器勿依赖）：纯函数 + 无头状态机
export const __sceneBoundaryInternals = {
    FIELDS, BOOL_FIELDS, MODES, SOURCES, SCENE_FIELD_DEFAULTS,
    normalizeRaw, sameRaw, cloneRaw, rawForCore, effectiveSummary, mergePlanConfig, planView, kindLabel, diffFragment,
    createSceneBoundaryCore,
};
