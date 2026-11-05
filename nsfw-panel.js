/**
 * ============================================================================
 *  状态栏模块（NSFW）· v2
 * ----------------------------------------------------------------------------
 *  闭环：注入（规则 + 在场全量 + 其余摘要 + 协议）→ AI 吐两段（机器段 + 官能段）
 *        → 解析 / 剥块 / 画卡 / 落盘 → 下一轮注入更新后的状态
 *
 *  v2 相对 v1：
 *    · 羞耻心（原耻辱）· 器官充血（原肤色充血）
 *    · 前/后通道拆成「当前深度 / 外口 + 白话 / 最深肉口 + 白话 / 装载液体」
 *    · 生理周期改四期 + 插件即时演算怀孕几率（避孕套 / 前穴中出 参与计算）
 *    · 经验改成永久性统计（8 项）；本次性爱单独一组（避孕套个数 / 高潮次数）
 *    · 美化改成黄油式分页（tabs），每行评述显示在右侧
 *    · 他人视线去掉「精神」
 * ============================================================================
 */

const NL = String.fromCharCode(10);

/* ────────────────────────── 字段定义 ────────────────────────── */

export const NSFW_FIELDS = [
    /* ── 第一组：状态 ── */
    { id: 'snapTime', group: '状态', label: '快照时间', type: 'text', core: true, ord: 1 },
    { id: 'temp', group: '状态', label: '体温', type: 'text', core: true, ord: 5 },
    { id: 'sweat', group: '状态', label: '出汗量', type: 'text', core: true, ord: 10 },
    { id: 'stamina', group: '状态', label: '体力', type: 'num', min: 0, max: 100, core: true, ord: 15 },
    { id: 'bladder', group: '状态', label: '尿意', type: 'num', min: 0, max: 100, core: true, ord: 20 },
    { id: 'pain', group: '状态', label: '疼痛度', type: 'num', min: 0, max: 100, core: true, ord: 25 },
    { id: 'sanity', group: '状态', label: '理智', type: 'num', min: 0, max: 100, core: true, ord: 30 },
    { id: 'libido', group: '状态', label: '欲望', type: 'num', min: 0, max: 100, core: true, ord: 35 },
    { id: 'compliance', group: '状态', label: '配合度', type: 'num', min: 0, max: 100, core: true, ord: 40 },
    { id: 'shame', group: '状态', label: '羞耻心', type: 'num', min: 0, max: 100, core: true, ord: 45 },
    { id: 'menstrual', group: '状态', label: '生理周期', type: 'text', options: ['月经期', '卵泡期', '排卵期', '黄体期'], core: true, ord: 50 },
    { id: 'menstrualNextDays', group: '状态', label: '距下阶段天数', type: 'num', min: 0, max: 30, unit: '天', noBar: true, core: true, ord: 55 },
    { id: 'pregnancy', group: '状态', label: '怀孕状态', type: 'text', core: true, ord: 60 },
    { id: 'expLastPartner', group: '状态', label: '最近性经验对象', type: 'text', core: true, ord: 65 },
    { id: 'partnerPenisSize', group: '状态', label: '其阴茎尺寸', type: 'num', min: 0, max: 40, unit: 'cm', noBar: true, core: true, ord: 66 },
    { id: 'condom', group: '状态', label: '使用避孕套', type: 'text', options: ['是', '否'], core: true, ord: 70 },
    { id: 'condomCount', group: '状态', label: '避孕套携带数', type: 'num', min: 0, max: 99, core: true, ord: 75 },
    { id: 'cumV', group: '状态', label: '前穴中出', type: 'text', options: ['是', '否'], core: true, ord: 80 },

    /* ── 第二组：身体 ── */
    { id: 'orgasmCount', group: '身体', label: '当天高潮次数', type: 'num', min: 0, max: 99, core: true, ord: 5 },
    { id: 'voice', group: '身体', label: '发声状态', type: 'text', core: true, ord: 10 },
    { id: 'organFlush', group: '身体', label: '器官充血', type: 'text', core: true, ord: 15 },
    { id: 'bodyMarks', group: '身体', label: '体表痕迹', type: 'list', core: true, ord: 20 },
    { id: 'selfJuice', group: '身体', label: '自身体液', type: 'text', core: true, ord: 25 },
    { id: 'extJuice', group: '身体', label: '外部液体', type: 'text', core: true, ord: 30 },
    { id: 'belly', group: '身体', label: '腹部外观', type: 'text', core: true, ord: 35 },

    /* ── 第三组：穿搭 ── */
    { id: 'exposure', group: '穿搭', label: '暴露度', type: 'num', min: 0, max: 100, core: true, ord: 5 },
    { id: 'outer', group: '穿搭', label: '外衣', type: 'text', core: true, ord: 10 },
    { id: 'inner', group: '穿搭', label: '内衣', type: 'text', core: true, ord: 15 },
    { id: 'accessories', group: '穿搭', label: '配饰', type: 'list', core: true, ord: 20 },
    { id: 'clothState', group: '穿搭', label: '衣物状态', type: 'text', core: true, ord: 25 },
    { id: 'insertItem', group: '穿搭', label: '插入物', type: 'text', core: true, ord: 30 },

    /* ── 第四组：胸 ── */
    { id: 'milkMl', group: '胸', label: '积乳量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 5 },
    { id: 'stChestSize', group: '胸', label: '罩杯/胸肌', type: 'text', core: true, ord: 10 },
    { id: 'stChestShape', group: '胸', label: '胸型', type: 'text', core: true, ord: 15 },
    { id: 'stNippleLen', group: '胸', label: '乳头长', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 20 },
    { id: 'stNippleWid', group: '胸', label: '乳头宽', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 25 },
    { id: 'stAreolaDia', group: '胸', label: '乳晕直径', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 30 },

    /* ── 第五组：前穴 ── */
    { id: 'stClitLen', group: '前穴', label: '阴蒂长度', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 5 },
    { id: 'stClitSize', group: '前穴', label: '阴蒂宽', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 10 },
    { id: 'clitState', group: '前穴', label: '阴蒂状态', type: 'text', core: true, ord: 15 },
    { id: 'vulvaState', group: '前穴', label: '外阴状态', type: 'text', core: true, ord: 20 },
    { id: 'vLoose', group: '前穴', label: '松弛度', type: 'num', min: 0, max: 100, core: true, ord: 25 },
    { id: 'stGDepth', group: '前穴', label: 'G点深度', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 30 },
    { id: 'stCervixDepth', group: '前穴', label: '子宫口深度', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 35 },
    { id: 'cervixState', group: '前穴', label: '子宫口状态', type: 'text', options: ['紧闭', '红肿', '受迫挤压宫壁', '微开', '全开'], core: true, ord: 40 },
    { id: 'vFluidKind', group: '前穴', label: '阴道液体种类', type: 'text', core: true, ord: 45 },
    { id: 'vFluidMl', group: '前穴', label: '阴道液体量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 50 },
    { id: 'uterusFluidMl', group: '前穴', label: '子宫液体量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 55 },

    /* ── 第六组：后穴 ── */
    { id: 'stPenisLen', group: '后穴', label: '阴茎长度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 5 },
    { id: 'stPenisGirth', group: '后穴', label: '阴茎粗度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 10 },
    { id: 'stPenisLook', group: '后穴', label: '阴茎外观', type: 'text', core: true, ord: 15 },
    { id: 'aAnusState', group: '后穴', label: '肛门状态', type: 'text', core: true, ord: 20 },
    { id: 'keyPointState', group: '后穴', label: '后穴G点状态', type: 'text', core: true, ord: 25 },
    { id: 'aLoose', group: '后穴', label: '松弛度', type: 'num', min: 0, max: 100, core: true, ord: 30 },
    { id: 'stKeyDepth', group: '后穴', label: '前列腺深度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 35 },
    { id: 'stColonDepth', group: '后穴', label: '结肠口深度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 40 },
    { id: 'colonState', group: '后穴', label: '结肠口状态', type: 'text', options: ['紧闭', '受迫变形', '微开', '全开'], core: true, ord: 45 },
    { id: 'aFluidKind', group: '后穴', label: '后穴液体种类', type: 'text', core: true, ord: 50 },
    { id: 'aFluidMl', group: '后穴', label: '后穴液体量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 55 },

    /* ── 第八组：开发（永久统计，评述写身体变化） ── */
    { id: 'expMasturbation', group: '开发', label: '自慰次数', type: 'num', min: 0, max: 99999, core: true, ord: 5 },
    { id: 'expPartners', group: '开发', label: '经验人数', type: 'num', min: 0, max: 999, core: true, ord: 10 },
    { id: 'expOralCount', group: '开发', label: '口交次数', type: 'num', min: 0, max: 99999, core: true, ord: 15 },
    { id: 'expBlowjobCount', group: '开发', label: '被口交次数', type: 'num', min: 0, max: 99999, core: true, ord: 20 },
    { id: 'expChestCount', group: '开发', label: '胸部行为次数', type: 'num', min: 0, max: 99999, core: true, ord: 25 },
    { id: 'expVCount', group: '开发', label: '前穴次数', type: 'num', min: 0, max: 99999, core: true, ord: 30 },
    { id: 'expVCumCount', group: '开发', label: '前穴中出次数', type: 'num', min: 0, max: 99999, core: true, ord: 35 },
    { id: 'expACount', group: '开发', label: '后穴次数', type: 'num', min: 0, max: 99999, core: true, ord: 40 },
    { id: 'expACumCount', group: '开发', label: '后穴中出次数', type: 'num', min: 0, max: 99999, core: true, ord: 45 },
];

/** 他人视线（只展示，不进数值）—— v2 去掉「精神」 */

/* ★W316：量纲类字段的单位（字段名后面直接标，AI 只写数字；卡片也按这个补单位） */
const NSFW_UNITS = {
    temp: '℃', sweat: 'ml',
    milkMl: 'ml', vFluidMl: 'ml', uterusFluidMl: 'ml', aFluidMl: 'ml',
    stNippleLen: 'cm', stNippleWid: 'cm', stAreolaDia: 'cm', stClitLen: 'cm',
    stGDepth: 'cm', stCervixDepth: 'cm', stKeyDepth: 'cm', stColonDepth: 'cm',
    stPenisLen: 'cm', stPenisGirth: 'cm'
};
NSFW_FIELDS.forEach((f) => { if (!f.unit && NSFW_UNITS[f.id]) f.unit = NSFW_UNITS[f.id]; });
export const NSFW_DESC_FIELDS = [
    { id: 'viewBody', label: '体态·他人视线' },
    { id: 'viewOutfit', label: '穿搭·他人视线' },
    { id: 'viewChannel', label: '通道·他人视线' }
];

/** 内置更新规则（v2：含周期/避孕/经验永久统计） */
export const NSFW_DEFAULT_RULES = [
    { id: 'r1', text: '怀孕几率由插件按「周期 + 是否避孕 + 前穴是否中出」算，你不要自己写；只要把「生理周期 / 卵子状态 / 避孕套 / 前穴中出」写准。', enabled: true, builtin: true },
    { id: 'r2', text: '经验类是永久统计，只增不减；「经验人数」在新对象第一次时 +1，「最近性经验对象」写最近一次的对象名。', enabled: true, builtin: true },
    { id: 'r3', text: '缺字段沿用上一轮的值，不要重置成 0 或「未知」以外的东西；所有数值不出字段范围。', enabled: true, builtin: true },
    { id: 'r4', text: '「避孕套 / 避孕套个数 / 前穴中出 / 高潮次数 / 互动情境」按本轮实际重写；换场景清零。', enabled: true, builtin: true },
    { id: 'r5', text: '生理周期只按时间推进（月经→卵泡→排卵→黄体），不要随意跳期；卵子状态跟着周期走。', enabled: true, builtin: true },
    { id: 'r6', text: '静态档案（罩杯、乳头/阴蒂/阴茎尺寸、通道常态与极限深度、子宫口/前列腺/结肠口深度）由用户建档，你只读不改。', enabled: true, builtin: true },
    { id: 'r7', text: '只有本轮【被插入 / 承受方】的角色才写；纯插入方不写（除非他同时被插入）。', enabled: true, builtin: true },
    { id: 'r8', text: '每轮把所有字段写全（不知道的写「未知」），不要只写变化的字段。', enabled: true, builtin: true }
];

/* ────────────────────────── 存储 ────────────────────────── */

const LS_KEY = 'kimi_nsfw_profiles';
let _t = (k) => k;
let _getSettings = () => ({});
let _save = () => { };

export function nsfwInit(opts) {
    try {
        if (opts && typeof opts.t === 'function') _t = opts.t;
        if (opts && typeof opts.getSettings === 'function') _getSettings = opts.getSettings;
        if (opts && typeof opts.save === 'function') _save = opts.save;
        /* ★W315：样式随模块一起装（不必等第一张卡挂上才隐藏楼层里的块） */
        const st0 = _getSettings && _getSettings();
        if (st0) nsfwEnsureStyle();
    } catch (e) { }
}

function readAll() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
}
function writeAll(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj || {})); } catch (e) { }
}
export function nsfwMsgIndex() {
    try {
        const c = window.SillyTavern && window.SillyTavern.getContext ? window.SillyTavern.getContext() : null;
        return c && Array.isArray(c.chat) ? c.chat.length : 0;
    } catch (e) { return 0; }
}
export function nsfwChatId(ctx) {
    try {
        const c = ctx || (window.SillyTavern && window.SillyTavern.getContext ? window.SillyTavern.getContext() : null);
        return String((c && c.chatId) || 'default');
    } catch (e) { return 'default'; }
}
export function nsfwBucket(chatId) {
    const all = readAll();
    const k = String(chatId || 'default');
    if (!all[k] || typeof all[k] !== 'object') all[k] = { order: [], pin: null, chars: {} };
    const b = all[k];
    if (!Array.isArray(b.order)) b.order = [];
    if (!b.chars || typeof b.chars !== 'object') b.chars = {};
    return { all, bucket: b, key: k };
}
export function nsfwList(chatId) {
    const { bucket } = nsfwBucket(chatId);
    return (bucket.order || []).filter((n) => bucket.chars[n]).map((n) => Object.assign({ name: n }, bucket.chars[n]));
}
export function nsfwEnsure(chatId, name, sex, role) {
    const { all, bucket, key } = nsfwBucket(chatId);
    const n = String(name || '').trim();
    if (!n) return null;
    if (!bucket.chars[n]) bucket.chars[n] = { sex: sex || 'female', role: role || 'bottom', stats: {}, desc: {}, static: {}, updatedAt: 0 };
    if (sex) bucket.chars[n].sex = sex;
    if (role) bucket.chars[n].role = role;
    bucket.chars[n].manual = true;   /* ★W315：面板手工建的 ⇒ 楼层重建时保留 */
    if (bucket.order.indexOf(n) < 0) bucket.order.push(n);
    all[key] = bucket;
    writeAll(all);
    return bucket.chars[n];
}
/** 该角色适用的静态字段（按性别过滤） */
export function nsfwStaticFields(profile) {
    const sex = (profile && profile.sex) || 'female';
    return nsfwAllFields().filter((f) => f.static).filter((f) => !f.sex || f.sex === sex);
}

/** 读某角色的静态档案为文本（一行一个 字段: 值） */
export function nsfwStaticText(chatId, name) {
    const { bucket } = nsfwBucket(chatId);
    const rec = bucket.chars[name];
    if (!rec) return '';
    return nsfwStaticFields(rec).map((f) => f.label + ': ' + ((rec.static || {})[f.id] || '')).join(NL);
}

/** 把文本写回静态档案（未知/静态以外字段忽略；空值删除） */
export function nsfwApplyStatic(chatId, name, text) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const rec = bucket.chars[name];
        if (!rec) return false;
        const map = {};
        String(text || '').split(/\r?\n/).forEach((line) => {
            const s2 = line.trim();
            if (!s2) return;
            const cut = s2.indexOf(':') >= 0 ? s2.indexOf(':') : s2.indexOf('：');
            if (cut <= 0) return;
            const label = s2.slice(0, cut).trim();
            const val = s2.slice(cut + 1).trim();
            const f = NSFW_FIELDS.find((x) => x.static && x.label === label);
            if (!f) return;
            if (val) map[f.id] = val;
        });
        rec.static = map;
        all[key] = bucket;
        writeAll(all);
        return true;
    } catch (e) { return false; }
}
export function nsfwRemove(chatId, name) {
    const { all, bucket, key } = nsfwBucket(chatId);
    bucket.order = (bucket.order || []).filter((n) => n !== name);
    delete bucket.chars[name];
    all[key] = bucket;
    writeAll(all);
}

/* ────────────────────────── 字段工具 ────────────────────────── */

const GROUP_ORDER = ['状态', '身体', '穿搭', '胸', '前穴', '后穴', '开发'];

/** 全部字段 = 内置 + 用户自定义（settings.nsfwCustomFields） */
export function nsfwAllFields() {
    let custom = [];
    let overrides = {};
    try {
        const st = _getSettings() || {};
        custom = Array.isArray(st.nsfwCustomFields) ? st.nsfwCustomFields : [];
        overrides = (st.nsfwFieldOverrides && typeof st.nsfwFieldOverrides === 'object') ? st.nsfwFieldOverrides : {};
    } catch (e) { custom = []; overrides = {}; }
    const base = NSFW_FIELDS.map((f) => {
        const ov = overrides[f.id];
        return ov ? Object.assign({}, f, ov) : f;
    });
    return base.concat(custom.map((f) => Object.assign({ custom: true, core: true }, f)));
}

/** 字段管理：改内置字段（label/group/type/sex） */
export function nsfwSetFieldOverride(id, patch) {
    try {
        const st = _getSettings() || {};
        const ov = Object.assign({}, st.nsfwFieldOverrides || {});
        ov[id] = Object.assign({}, ov[id] || {}, patch || {});
        st.nsfwFieldOverrides = ov;
        if (typeof _save === 'function') _save();
        return true;
    } catch (e) { return false; }
}
export function nsfwClearFieldOverride(id) {
    try {
        const st = _getSettings() || {};
        const ov = Object.assign({}, st.nsfwFieldOverrides || {});
        delete ov[id];
        st.nsfwFieldOverrides = ov;
        if (typeof _save === 'function') _save();
        return true;
    } catch (e) { return false; }
}
/** 字段管理：改自定义字段 */
export function nsfwUpdateCustomField(id, patch) {
    try {
        const st = _getSettings() || {};
        const arr = (Array.isArray(st.nsfwCustomFields) ? st.nsfwCustomFields : []).map((f) => (f.id === id ? Object.assign({}, f, patch || {}) : f));
        st.nsfwCustomFields = arr;
        if (typeof _save === 'function') _save();
        return true;
    } catch (e) { return false; }
}
/** 面板编辑：拿某角色档案 */
export function nsfwGetChar(chatId, name) {
    try { const { bucket } = nsfwBucket(chatId); return bucket.chars[name] || null; } catch (e) { return null; }
}
function fieldById(id) { return nsfwAllFields().find((f) => f.id === id) || null; }
function fieldByLabel(label) {
    const s = String(label || '').trim();
    const all = nsfwAllFields();
    return all.find((f) => !f.static && f.label === s)
        || all.find((f) => !f.static && f.id === s)
        || null;
}
function activeFields(profile) {
    const sex = (profile && profile.sex) || 'female';
    return nsfwAllFields().filter((f) => !f.sex || f.sex === sex);
}
function clampNum(f, v) {
    let n = Number(v);
    if (!Number.isFinite(n)) {
        /* ★W318：模型爱写 92/100、36/100、1.2cm —— 取第一个数字 */
        const mm = /-?\d+(?:\.\d+)?/.exec(String(v == null ? '' : v));
        if (!mm) return null;
        n = Number(mm[0]);
    }
    if (!Number.isFinite(n)) return null;
    if (typeof f.min === 'number' && n < f.min) n = f.min;
    if (typeof f.max === 'number' && n > f.max) n = f.max;
    return n;
}

/* ────────────────────────── 怀孕几率（插件演算） ────────────────────────── */

/** 按「周期 + 避孕 + 前穴中出」即时演算怀孕几率（0-100） */
export function calcPregRisk(profile) {
    try {
        const st = (profile && profile.stats) || {};
        const val = (id) => String(((st[id] || {}).value) == null ? '' : (st[id].value));
        const phase = val('menstrual');
        let base = 2;
        if (phase.indexOf('月经') >= 0) base = 1;
        else if (phase.indexOf('卵泡') >= 0) base = 2;
        else if (phase.indexOf('排卵') >= 0) base = 10;
        else if (phase.indexOf('黄体') >= 0) base = 4;
        const condom = val('condom');
        const cumV = val('cumV');
        let risk = base;
        if (cumV.indexOf('是') >= 0 || cumV.indexOf('有') >= 0) risk += 6;
        if (condom.indexOf('是') >= 0 || condom.indexOf('有') >= 0) risk = risk * 0.05;
        risk = Math.max(0, Math.min(100, Math.round(risk)));
        let why = phase || '周期未知';
        why += ' · ' + (condom ? ('避孕：' + condom) : '避孕未填');
        if (cumV) why += ' · 前穴中出：' + cumV;
        return { risk: risk, why: why };
    } catch (e) { return { risk: 0, why: '' }; }
}

/** 编辑：写单个动态字段 */
export function nsfwSetStat(chatId, name, id, value, comment) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const rec = bucket.chars[name];
        if (!rec) return false;
        const f = fieldById(id);
        if (!f) return false;
        rec.stats[id] = { value: value, comment: comment || '', at: Date.now() };
        rec.updatedAt = Date.now();
        all[key] = bucket;
        writeAll(all);
        return true;
    } catch (e) { return false; }
}
/** 编辑：写单个静态字段 */
export function nsfwSetStatic(chatId, name, id, value) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const rec = bucket.chars[name];
        if (!rec) return false;
        if (!rec.static) rec.static = {};
        rec.static[id] = String(value == null ? '' : value);
        all[key] = bucket;
        writeAll(all);
        return true;
    } catch (e) { return false; }
}
/** 字段管理：新增自定义字段 */
export function nsfwAddCustomField(def) {
    try {
        const st = _getSettings() || {};
        const arr = Array.isArray(st.nsfwCustomFields) ? st.nsfwCustomFields.slice() : [];
        const label = String((def && def.label) || '').trim();
        if (!label) return false;
        const id = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        arr.push({
            id: id,
            group: String(def.group || '状态'),
            label: label,
            type: ['num', 'text', 'list'].indexOf(def.type) >= 0 ? def.type : 'text',
            sex: (def.sex === 'female' || def.sex === 'male') ? def.sex : undefined,
            min: def.type === 'num' ? 0 : undefined,
            max: def.type === 'num' ? (Number(def.max) || 100) : undefined
        });
        st.nsfwCustomFields = arr;
        if (typeof _save === 'function') _save();
        return true;
    } catch (e) { return false; }
}
/** 字段管理：删除自定义字段 */
export function nsfwDeleteCustomField(id) {
    try {
        const st = _getSettings() || {};
        const arr = (Array.isArray(st.nsfwCustomFields) ? st.nsfwCustomFields : []).filter((f) => f.id !== id);
        st.nsfwCustomFields = arr;
        if (typeof _save === 'function') _save();
        return true;
    } catch (e) { return false; }
}
/* ────────────────────────── 解析 ────────────────────────── */

export function splitValueComment(raw) {
    const s = String(raw || '').trim();
    const bar = s.indexOf('|');
    if (bar >= 0) return { value: s.slice(0, bar).trim(), comment: s.slice(bar + 1).trim() };
    const m = s.match(/^(.*?)[（(]([^（）()]*)[）)]\s*$/);
    if (m) return { value: m[1].trim(), comment: m[2].trim() };
    return { value: s, comment: '' };
}

/** 把一个键解析成字段：先整键、再逐词（去掉行首角色名）、再别名 */
function resolveFieldKey(rawKey, all) {
    const key = String(rawKey || '').trim();
    if (!key) return null;
    const hit = (k) => all.find((x) => x.id === k) || fieldByLabel(k) || null;
    let f = hit(key);
    if (f) return f;
    const alias = NSFW_ALIAS[key];
    if (alias) { f = all.find((x) => x.id === alias); if (f) return f; }
    /* 行首可能是角色名：按空格拆开后，从每一个词起截一段再试（"夏茵 开发度·穴" → "开发度·穴"） */
    const words = key.split(/\s+/).filter(Boolean);
    for (let i = 1; i < words.length; i++) {
        const rest = words.slice(i).join(' ');
        f = hit(rest);
        if (f) return f;
        if (NSFW_ALIAS[rest]) { f = all.find((x) => x.id === NSFW_ALIAS[rest]); if (f) return f; }
    }
    /* 行首可能是角色名：按空格/· 拆词逐个试 */
    const toks = key.split(/[\s·]+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
        f = hit(toks[i]);
        if (f) return f;
        if (NSFW_ALIAS[toks[i]]) { f = all.find((x) => x.id === NSFW_ALIAS[toks[i]]); if (f) return f; }
    }
    /* 整键里有「开发度·X」这类带分隔的，去掉前缀再试 */
    const noPrefix = key.replace(/^(开发度|状态|当前)[·:：\s]*/, '');
    if (noPrefix !== key) { f = hit(noPrefix); if (f) return f; }
    return null;
}
export function parseMachineBody(body) {
    const out = {};
    const all = nsfwAllFields();
    String(body || '').split(/\r?\n/).forEach((line) => {
        const s = line.trim();
        if (!s) return;
        /* 新格式：id=值|评述（id 唯一，最稳） */
        const eq = s.indexOf('=');
        if (eq > 0) {
            const rawKey = s.slice(0, eq).trim();
            const rest = s.slice(eq + 1).trim();
            const f = resolveFieldKey(rawKey, all);
            if (!f) return;
            const sv = splitValueComment(rest);
            out[f.id] = { value: sv.value, comment: sv.comment };
            return;
        }
        /* 旧格式兜底：标签: 值（评述） */
        const cut = s.indexOf(':') >= 0 ? s.indexOf(':') : s.indexOf('：');
        if (cut <= 0) return;
        const f2 = fieldByLabel(s.slice(0, cut).trim());
        if (!f2) return;
        const sv2 = splitValueComment(s.slice(cut + 1).trim());
        out[f2.id] = { value: sv2.value, comment: sv2.comment };
    });
    return out;
}

/** ★W318：模型常自己起名（兴奋度/心理/体液…）或把角色名写在行首 —— 这里兜一层别名 */
const NSFW_ALIAS = {
    '兴奋度': 'libido', '欲望度': 'libido', '快感': 'libido',
    '心理': 'sanity', '精神': 'sanity', '理智值': 'sanity',
    '体力值': 'stamina', '羞耻': 'shame', '配合': 'compliance',
    '体液': 'selfJuice', '爱液': 'selfJuice',
    '阴道状态': 'vulvaState', '外阴': 'vulvaState',
    '子宫口': 'cervixState', '结肠口': 'colonState',
    '开发度·穴': 'expVCount', '开发度·前': 'expVCount',
    '开发度·胸': 'expChestCount', '开发度·口': 'expOralCount',
    '开发度·后': 'expACount', '开发度·最深': 'expVCumCount',
    '怀孕': 'pregnancy', '怀孕几率': 'pregnancy',
    '疼痛': 'pain', '尿意': 'bladder', '出汗': 'sweat', '体温': 'temp'
};
/** 取一个属性值（双引号 / 单引号 / 无引号都吃） */
function attrVal(raw, key) {
    const re = new RegExp(key + '\\s*=\\s*(?:"([^"]*)"|([^\\s>]+))', 'i');
    const m = re.exec(String(raw || ''));
    if (!m) return '';
    return (m[1] != null ? m[1] : (m[2] || ''));
}
/** ★W315：把 AI 写的 <nsfw> 外壳换成酒馆净化器会保留的 <div>（内容一字不动）
 *  原因：酒馆显示层用 DOMPurify，未知标签 <nsfw> 会被剥掉 ⇒ 原始行露在正文里。
 *  div + data-nsfw 能活下来，用 CSS 隐藏 ⇒ 楼层里有值（小铅笔可看可改），正文里看不见。 */
export function nsfwWrapBlocks(text) {
    let s = String(text || '');
    if (s.indexOf('<nsfw') < 0) return s;
    /* ★W318：模型常写 <nsfw> 不带属性、甚至不闭合 —— 先补闭合再换外壳 */
    const openN = (s.match(/<nsfw(\s|>)/gi) || []).length;
    const closeN = (s.match(/<\/nsfw>/gi) || []).length;
    if (openN > closeN) s = s.replace(/\s+$/, '') + String.fromCharCode(10) + '</nsfw>';
    s = s.replace(/<nsfwdesc(?:\s+([^>]*))?>/gi, (m0, attrs) => {
        const name = attrVal(attrs || '', 'name');
        return '<div class="yw-nsfw-block" data-nsfw="d"' + (name ? ' data-name="' + name + '"' : '') + '>';
    });
    s = s.replace(/<nsfw(?:\s+([^>]*))?>/gi, (m0, attrs) => {
        const name = attrVal(attrs || '', 'name');
        const sex = attrVal(attrs || '', 'sex');
        const role = attrVal(attrs || '', 'role');
        let out = '<div class="yw-nsfw-block" data-nsfw="m"';
        if (name) out += ' data-name="' + name + '"';
        if (sex) out += ' data-sex="' + sex + '"';
        if (role) out += ' data-role="' + role + '"';
        return out + '>';
    });
    s = s.split('</nsfwdesc>').join('</div>');
    s = s.split('</nsfw>').join('</div>');
    return s;
}
export function nsfwParse(text) {
    const src = nsfwWrapBlocks(String(text || ''));
    const chars = {};
    const ensure = (name) => {
        const n = String(name || '').trim();
        if (!chars[n]) chars[n] = { machine: {}, desc: {} };
        return chars[n];
    };
    const reM = /<div\s+([^>]*\bdata-nsfw\s*=\s*"m"[^>]*)>([\s\S]*?)<\/div>/gi;
    const attrOf = (raw, key) => attrVal(raw, key);
    let m;
    while ((m = reM.exec(src))) {
        const attrs = m[1] || '';
        let name = (attrOf(attrs, 'data-name') || attrOf(attrs, 'name')).trim();
        /* ★W318：<nsfw> 没写 name ⇒ 从第一行「角色名 字段 = 值」里认 */
        if (!name) {
            const nm = /^[ \t]*([^\s=:：]{1,12})[ \t]+\S+[ \t]*=/m.exec(m[2] || '');
            if (nm) name = nm[1];
        }
        if (!name) continue;
        const c = ensure(name);
        c.meta = {
            sex: attrOf(attrs, 'data-sex') || attrOf(attrs, 'sex'),
            role: attrOf(attrs, 'data-role') || attrOf(attrs, 'role')
        };
        /* ★W316：他人视线三行写在同一个块里（viewBody/viewOutfit/viewChannel），整段当值、不拆 | */
        let body = String(m[2] || '');
        NSFW_DESC_FIELDS.forEach((d) => {
            const reV = new RegExp('^[ \\t]*(?:[^=:：\\n]{1,12}[ \\t]+)?' + d.id + '[^=:：\\n]*[=:：]\\s*(.+)$', 'mi');
            const mv = reV.exec(body);
            if (mv) { c.desc[d.id] = String(mv[1] || '').trim(); body = body.replace(mv[0], ''); }
        });
        const parsed = parseMachineBody(body);
        Object.keys(parsed).forEach((k) => { c.machine[k] = parsed[k]; });
    }
    const reD = /<div\s+([^>]*\bdata-nsfw\s*=\s*"d"[^>]*)>([\s\S]*?)<\/div>/gi;
    while ((m = reD.exec(src))) {
        const dn = attrVal(m[1] || '', 'data-name') || attrVal(m[1] || '', 'name');
        if (!dn) continue;
        const c = ensure(dn);
        String(m[2] || '').split(/\r?\n/).forEach((line) => {
            const s = line.trim();
            if (!s) return;
            const cut = s.indexOf(':') >= 0 ? s.indexOf(':') : s.indexOf('：');
            if (cut <= 0) return;
            const label = s.slice(0, cut).trim();
            const val = s.slice(cut + 1).trim();
            const f = NSFW_DESC_FIELDS.find((d) => d.label === label)
                || NSFW_DESC_FIELDS.find((d) => d.label.indexOf(label) === 0)
                || null;
            if (f) c.desc[f.id] = val;
        });
    }
    const stripped = src.replace(reM, '').replace(reD, '').replace(/\n{3,}/g, '\n\n').trim();
    return { chars, stripped, hasAny: Object.keys(chars).length > 0 };
}

/** ★W315：发请求前把消息里的数据块剥掉（状态改由【CURRENT STATE】注入段承载，避免重复/旧值） */
export function nsfwStripBlocks(text) {
    const s = String(text || '');
    if (s.indexOf('data-nsfw') < 0 && s.indexOf('<nsfw') < 0) return s;
    try { return nsfwParse(s).stripped; } catch (e) { return s; }
}
function applyParsedTo(bucket, parsed) {
    const names = Object.keys((parsed && parsed.chars) || {});
    names.forEach((name) => {
        if (!bucket.chars[name]) {
            const meta = (parsed.chars[name] && parsed.chars[name].meta) || {};
            const sex = (meta.sex === 'm' || meta.sex === 'male') ? 'male' : (meta.sex === 'o' || meta.sex === 'other' ? 'other' : 'female');
            const role = (meta.role === 'top') ? 'top' : (meta.role === 'switch' ? 'switch' : 'bottom');
            bucket.chars[name] = { sex: sex, role: role, stats: {}, desc: {}, static: {}, updatedAt: 0 };
            if (bucket.order.indexOf(name) < 0) bucket.order.push(name);
        }
        const rec = bucket.chars[name];
        const mm = parsed.chars[name].machine || {};
        const allow = {};
        activeFields(rec).forEach((f) => { allow[f.id] = 1; });
        Object.keys(mm).forEach((id) => {
            const f = fieldById(id);
            if (!f) return;
            if (!allow[id]) return;   /* ★只收当前启用字段 */
            const item = mm[id] || {};
            let value = item.value;
            if (f.type === 'num') {
                const n = clampNum(f, value);
                if (n === null) return;
                value = n;
            }
            if (f.type === 'list') {
                value = String(value || '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
            }
            rec.stats[id] = { value: value, comment: item.comment || '', at: Date.now() };
        });
        const dd = parsed.chars[name].desc || {};
        Object.keys(dd).forEach((id) => { rec.desc[id] = { text: dd[id], at: Date.now() }; });
        rec.updatedAt = Date.now();
        bucket.order = bucket.order.filter((n) => n !== name);
        bucket.order.push(name);
    });
    return names;
}
export function nsfwApply(chatId, parsed) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const names = applyParsedTo(bucket, parsed);
        all[key] = bucket;
        writeAll(all);
        return names;
    } catch (e) { return []; }
}
/** ★W315：从楼层块重建"当前状态"（删楼 / 改楼 / 切分支 / 切聊天都调它）
 *  状态就长在楼层里：以最后一条含块的楼为准；删楼 ⇒ 它那一段贡献自动消失。
 *  面板手填的固定档案（rec.static）与手工建档但还没出过块的角色保留。 */
export function nsfwRebuildFromChat(chatId, chat) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const prev = bucket.chars || {};
        const next = { order: [], pin: bucket.pin || null, chars: {} };
        const msgs = Array.isArray(chat) ? chat : [];
        msgs.forEach((m, i) => {
            if (!m || m.is_system) return;   /* ★W328：用户楼层里手填的块也算（作者会自己补表格） */
            const text = String(m.mes || '');
            if (text.indexOf('<nsfw') < 0) return;
            const parsed = nsfwParse(text);
            if (!parsed || !parsed.hasAny) return;
            applyParsedTo(next, parsed);
            Object.keys(next.chars).forEach((n) => {
                if (n && text.indexOf(n) >= 0) next.chars[n].lastMentionAt = i;
            });
        });
        Object.keys(prev).forEach((n) => {
            const old = prev[n];
            if (!next.chars[n]) {
                if (old && (old.manual || (old.static && Object.keys(old.static).length))) {
                    next.chars[n] = JSON.parse(JSON.stringify(old));
                    next.order.push(n);
                }
                return;
            }
            next.chars[n].static = JSON.parse(JSON.stringify(old.static || {}));
        });
        all[key] = next;
        writeAll(all);
        return next.order.slice();
    } catch (e) { return []; }
}

/* ────────────────────────── 注入 ────────────────────────── */

function fmtVal(f, cell) {
    if (!cell) return '';
    const v = cell.value;
    if (f.type === 'list') return Array.isArray(v) ? v.join('、') : String(v || '');
    return String(v == null ? '' : v);
}
/** 数值 + 单位（避免 "1.2cm cm"；★W316 量纲字段只存数字，单位在这里补） */
function withUnit(f, val) {
    const t = String(val == null ? '' : val).trim();
    if (!t || !f || !f.unit) return t;
    const u = String(f.unit);
    if (t.indexOf(u) >= 0) return t;
    return t + ' ' + u;
}

export function buildCharBlock(name, profile) {
    const fields = activeFields(profile);
    const lines = [];
    fields.forEach((f) => {
        const cell = (profile.stats || {})[f.id]
            || ((profile.static || {})[f.id] ? { value: profile.static[f.id], comment: '' } : null);
        const val = cell ? fmtVal(f, cell) : '';
        if (!val) return;
        lines.push(f.id + '=' + val + (cell.comment ? '|' + cell.comment : ''));
    });
    if (!lines.length) return '';
    const preg = calcPregRisk(profile);
    if (preg.why) lines.push('怀孕几率: ' + preg.risk + '%（插件计算，不要改写）');
    return '<nsfw name="' + name + '">' + NL + lines.join(NL) + NL + '</nsfw>';
}

export function buildProtocolDoc(profile) {
    const fields = activeFields(profile);
    const spec = fields.map((f) => {
        let t = '';
        if (f.id === 'devMouthExp' || /Exp$/.test(f.id)) t = '（当前/上限，如 180/300）';
        else if (Array.isArray(f.options)) t = '[' + f.options.join('/') + ']';
        else if (f.type === 'num') t = (typeof f.min === 'number' ? f.min : 0) + '-' + (typeof f.max === 'number' ? f.max : 100) + (f.unit ? '(' + f.unit + ')' : '');
        else if (f.type === 'list') t = '（列表，用、分隔）';
        else if (f.unit) t = '(' + f.unit + ')';
        return f.id + ' ' + f.label + (t ? ' ' + t : '');
    });
    const out = [
        '【输出格式 · 必须照做】',
        '触发：本轮正文出现「被插入 / 承受方」的 NSFW 行为才写；只写承受方，多个受方各写一段；纯插入方不写。',
        '位置：写在正文最后，正文本身一个字都不要改。',
        '⚠️ 标签必须写全 —— 第一行必须是 <nsfw name="角色名" sex="f|m" role="bottom">，最后一行必须是 </nsfw>；少任何一个，整段都读不到。',
        '⚠️ 不要用代码块包起来，不要加 ``` ，不要写成 JSON。',
        '每行固定写法：ID = 值|一句评述（ID 照抄下面清单的第一个词，= 和 | 都是英文半角）',
        '· 值里不出现 = 或 |；列表用「、」分隔',
        '· 字段名后面括号里是单位 ⇒ 只写数字（例：乳头长(cm) = 1.2|…）',
        '· 标 0-100 的写整数；标 当前/上限 的写成 45/100；不知道的写 未知',
        '· 每轮把所有行写全（顺序不限），三行「他人视线」写在同一个块的最后',
        '',
        '<nsfw name="角色名" sex="f|m" role="bottom">',
        'sanity 理智 0-100 = 42|喘得厉害，话都说不完整',
        'stNippleLen 乳头长 (cm) = 1.2|比平时更挺',
        'devMouthExp 口·经验 当前/上限 = 180/300|已经很熟练',
        'viewBody 体态·他人视线 = 眼神散得像被抽走主心骨',
        'viewOutfit 穿搭·他人视线 = 像被拆过包装的礼物',
        'viewChannel 通道·他人视线 = 一片狼藉，还没合拢',
        '</nsfw>',
        '',
        '字段清单（ID + 中文 + 范围/单位）：',
        spec.join(NL),
        '',
        '他人视线三行：' + NSFW_DESC_FIELDS.map((d) => d.id + ' ' + d.label).join('；') + '（写在同一个 <nsfw> 块里，整段文字，不用 |）'
    ];
    return out.join(NL);
}

export function buildSummaryLine(name, profile) {
    const g = (id) => {
        const c = (profile.stats || {})[id];
        return c ? String(c.value) : '-';
    };
    return '- ' + name + '：理智' + g('sanity') + ' / 配合' + g('compliance') + ' / 欲望' + g('libido');
}

/** 扫描一段文本，把出现过的角色名记上「最近被提到在第几楼」 */
export function nsfwMarkMentions(chatId, text, msgIndex) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const t = String(text || '');
        Object.keys(bucket.chars || {}).forEach((n) => {
            if (n && t.indexOf(n) >= 0) {
                bucket.chars[n].lastMentionAt = Number(msgIndex) || 0;
                bucket.order = (bucket.order || []).filter((x) => x !== n);
                bucket.order.push(n);
            }
        });
        all[key] = bucket;
        writeAll(all);
    } catch (e) { }
}

export function buildInjection(chatId, opts) {
    const s = _getSettings() || {};
    if (!s.nsfwEnabled) return '';
    const { bucket } = nsfwBucket(chatId);
    const names = (bucket.order || []).filter((n) => bucket.chars[n]);
    if (!names.length) return '';
    const fullCount = Math.max(1, Math.min(3, Number((opts && opts.fullCount) || s.nsfwFullCount || 2)));
    const msgIndex = Number((opts && opts.msgIndex) || nsfwMsgIndex() || 0);
    /* ★v10：按"最近两楼提到过谁"取全量（作者口径：上一楼出现的名字就发一轮）；没提到过任何人再退回最近更新 */
    let picked = names.filter((n) => {
        const at = Number(bucket.chars[n].lastMentionAt || 0);
        return at > 0 && (msgIndex - at) <= 2;
    });
    if (!picked.length) picked = names.slice();
    let full = picked.slice(-fullCount);
    if (bucket.pin && bucket.chars[bucket.pin]) {
        full = [bucket.pin].concat(full.filter((n) => n !== bucket.pin)).slice(0, fullCount);
    }
    const others = names.filter((n) => full.indexOf(n) < 0);

    /* ★W317：注入三档 —— full = 规则+状态+协议 / state = 只发当前状态（默认，规则与格式在预设里）/ off = 完全不注入 */
    const mode = String((opts && opts.mode) || s.nsfwInjectMode || 'state');
    if (mode === 'off') return '';
    const rules = (Array.isArray(s.nsfwRules) && s.nsfwRules.length ? s.nsfwRules : NSFW_DEFAULT_RULES)
        .filter((r) => r && r.enabled !== false && r.text)
        .map((r) => '- ' + r.text);

    const parts = [];
    if (mode === 'full') {
        parts.push('【状态栏 · 更新规则】');
        parts.push(rules.join(NL));
        parts.push('');
    }
    parts.push('【CURRENT STATE】');
    full.forEach((n) => {
        const b = buildCharBlock(n, bucket.chars[n]);
        if (b) parts.push(b);
    });
    if (others.length) {
        parts.push('【其余角色（只需在剧情涉及他们时才更新）】');
        others.forEach((n) => parts.push(buildSummaryLine(n, bucket.chars[n])));
    }
    if (mode === 'full') {
        parts.push('');
        parts.push(buildProtocolDoc(bucket.chars[full[0]] || { sex: 'female' }));
    }
    return parts.join(NL);
}


/* ────────────────────────── 发送给 AI（悬浮窗选人） ────────────────────────── */

const SEND_KEY = 'kimi_nsfw_send';
function readSend() {
    try {
        const raw = localStorage.getItem(SEND_KEY);
        const obj = raw ? (JSON.parse(raw) || {}) : {};
        return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
}
/** 这个聊天手动勾选要发送的角色 */
export function nsfwSendPicks(chatId) {
    try {
        const all = readSend();
        const k = String(chatId || 'default');
        return Array.isArray(all[k]) ? all[k].slice() : [];
    } catch (e) { return []; }
}
export function nsfwSetSendPick(chatId, name, on) {
    try {
        const all = readSend();
        const k = String(chatId || 'default');
        const list = Array.isArray(all[k]) ? all[k].slice() : [];
        const i = list.indexOf(name);
        if (on && i < 0) list.push(name);
        if (!on && i >= 0) list.splice(i, 1);
        all[k] = list;
        localStorage.setItem(SEND_KEY, JSON.stringify(all));
    } catch (e) { }
}
/** 本轮该发送谁：off=不发送；manual=勾选的；auto=上一楼 AI 正文或用户楼层里出现过的名字 */
export function nsfwPickForRequest(chatId, msgs) {
    try {
        const st = _getSettings() || {};
        /* ★W327：AUTO 勾上=按正文提到谁发谁；不勾=只发手动勾选的人；都不选=不发送 */
        const auto = (st.nsfwAutoSend !== undefined) ? !!st.nsfwAutoSend : (String(st.nsfwSendMode || 'auto') === 'auto');
        const { bucket } = nsfwBucket(chatId);
        const names = (bucket.order || []).filter((n) => bucket.chars[n]);
        if (!names.length) return [];
        if (!auto) {
            const picks = nsfwSendPicks(chatId);
            return names.filter((n) => picks.indexOf(n) >= 0);
        }
        const lastA = (() => { for (let i = (msgs || []).length - 1; i >= 0; i--) { if (msgs[i] && msgs[i].role === 'assistant') return String(msgs[i].content || ''); } return ''; })();
        const lastU = (() => { for (let i = (msgs || []).length - 1; i >= 0; i--) { if (msgs[i] && msgs[i].role === 'user') return String(msgs[i].content || ''); } return ''; })();
        const text = lastA + String.fromCharCode(10) + lastU;
        return names.filter((n) => n && text.indexOf(n) >= 0);
    } catch (e) { return []; }
}
/** 组装发送文本（取的是楼层里最新读出的档案） */
export function nsfwBuildSend(chatId, names) {
    try {
        const { bucket } = nsfwBucket(chatId);
        const parts = ['【状态栏 · 当前状态】'];
        (names || []).forEach((n) => {
            const b = buildCharBlock(n, bucket.chars[n]);
            if (b) parts.push(b);
        });
        return parts.length > 1 ? parts.join(NL) : '';
    } catch (e) { return ''; }
}

/** ★W327 悬浮发送条：一条横条（可拖）+ AUTO 勾 + 名字列表；点名字看最新快照 */
function nsfwBindSenderDrag(host, grip) {
    if (!host || !grip || host.dataset.dragBound === '1') return;
    host.dataset.dragBound = '1';
    let on = false, sx = 0, sy = 0, ox = 0, oy = 0;
    grip.addEventListener('mousedown', (e) => {
        const r = host.getBoundingClientRect();
        on = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        host.style.right = 'auto'; host.style.bottom = 'auto';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!on) return;
        const x = Math.max(0, Math.min(window.innerWidth - 80, ox + e.clientX - sx));
        const y = Math.max(0, Math.min(window.innerHeight - 32, oy + e.clientY - sy));
        host.style.left = x + 'px'; host.style.top = y + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (!on) return; on = false;
        const r = host.getBoundingClientRect();
        try { localStorage.setItem('kimi_nsfw_sender_pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (e) { }
    });
}
/** 点名字 → 用同一套美化卡看最新快照 */
export function nsfwShowSnapshot(name) {
    try {
        const chatId = nsfwChatId();
        const { bucket } = nsfwBucket(chatId);
        const rec = bucket.chars[name];
        if (!rec) return;
        let box = document.getElementById('yw-nsfw-preview');
        if (!box) {
            box = document.createElement('div');
            box.id = 'yw-nsfw-preview';
            document.body.appendChild(box);
        }
        box.innerHTML = '<div class="yw-nsfw-pv-hd"><span>最新快照 · ' + esc(name) + '</span><button type="button" class="yw-nsfw-pv-x">✕</button></div>';
        const body = document.createElement('div');
        body.className = 'yw-nsfw-pv-body';
        body.appendChild(nsfwRenderCard(name, rec));
        box.appendChild(body);
        box.style.display = 'block';
        box.addEventListener('mousedown', (e) => e.stopPropagation());
        box.addEventListener('click', (e) => e.stopPropagation());
        box.querySelector('.yw-nsfw-pv-x').addEventListener('click', () => { box.style.display = 'none'; });
    } catch (e) { }
}
/** 悬浮发送条：一条横条（可拖）+ AUTO 勾 + 名字列表；点名字看最新快照 */
export function nsfwMountSender() {
    try {
        if (typeof document === 'undefined') return;
        const st = _getSettings() || {};
        if (!st.nsfwEnabled) {
            const old0 = document.getElementById('yw-nsfw-sender'); if (old0) old0.remove();
            const pv0 = document.getElementById('yw-nsfw-preview'); if (pv0) pv0.remove();
            return;
        }
        nsfwEnsureStyle();
        let host = document.getElementById('yw-nsfw-sender');
        if (!host) {
            host = document.createElement('div');
            host.id = 'yw-nsfw-sender';
            host.className = 'yw-nsfw-sd';
            document.body.appendChild(host);
        }
        const chatId = nsfwChatId();
        const { bucket } = nsfwBucket(chatId);
        const names = (bucket.order || []).filter((n) => bucket.chars[n]);
        const picks = nsfwSendPicks(chatId);
        const auto = (st.nsfwAutoSend !== undefined) ? !!st.nsfwAutoSend : (String(st.nsfwSendMode || 'auto') === 'auto');
        try {
            const pos = JSON.parse(localStorage.getItem('kimi_nsfw_sender_pos') || 'null');
            if (pos && Number.isFinite(pos.x)) { host.style.left = pos.x + 'px'; host.style.top = pos.y + 'px'; host.style.right = 'auto'; host.style.bottom = 'auto'; }
        } catch (e) { }
        const items = names.map((n) => '<span class="yw-nsfw-sd-item">'
            + '<input type="checkbox" data-send="' + esc(n) + '"' + (picks.indexOf(n) >= 0 ? ' checked' : '') + (auto ? ' disabled' : '') + '/>'
            + '<b class="yw-nsfw-sd-name" data-name="' + esc(n) + '" title="点名字看最新快照">' + esc(n) + '</b></span>').join('');
        host.innerHTML = '<span class="yw-nsfw-sd-grip" title="按住拖动">⠿</span>'
            + '<label class="yw-nsfw-sd-auto" title="自动：上一楼正文或你的消息里出现谁就发谁"><input type="checkbox"' + (auto ? ' checked' : '') + '/><span>AUTO</span></label>'
            + '<span class="yw-nsfw-sd-sep"></span>'
            + (items || '<span class="yw-nsfw-sd-empty">无档案</span>');
        host.addEventListener('mousedown', (e) => e.stopPropagation());
        host.addEventListener('click', (e) => e.stopPropagation());
        const autoCb = host.querySelector('.yw-nsfw-sd-auto input');
        autoCb.addEventListener('change', (e) => {
            st.nsfwAutoSend = !!e.target.checked;
            try { if (_save) _save(); } catch (e2) { }
            nsfwMountSender();
        });
        host.querySelectorAll('input[data-send]').forEach((cb) => {
            cb.addEventListener('change', () => nsfwSetSendPick(chatId, cb.getAttribute('data-send'), cb.checked));
        });
        host.querySelectorAll('.yw-nsfw-sd-name').forEach((el) => {
            el.addEventListener('click', () => nsfwShowSnapshot(el.getAttribute('data-name')));
        });
        nsfwBindSenderDrag(host, host.querySelector('.yw-nsfw-sd-grip'));
    } catch (e) { }
}
/* ────────────────────────── 展示 ────────────────────────── */

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 一页的行：按 tab 归属取字段（静态参数也进对应分页），顺序 = ord */
function tabRowsHtml(profile, grp, byGroup) {
    const rows = [];
    activeFields(profile).forEach((f) => {
        if ((f.tab || f.group) !== grp) return;
        const cell = (profile.stats || {})[f.id];
        if (!cell || !fmtVal(f, cell)) return;
        rows.push({ ord: (typeof f.ord === 'number' ? f.ord : 9999), html: rowHtml(f, cell) });
    });
    rows.sort((a, b) => a.ord - b.ord);
    if (!rows.length) return '';
    return '<table class="yw-nsfw-tbl"><tbody>'
        + rows.map((r) => r.html).join('') + '</tbody></table>';
}
/** 开发度表格：部位 × 等级/经验/变化 */
function devTableHtml(profile) {
    const parts = [ ['口', 'Mouth'], ['胸', 'Chest'], ['前', 'Front'], ['后', 'Back'], ['最深', 'Deep'] ];
    const cell = (id) => {
        const c = (profile.stats || {})[id];
        if (!c) return '';
        return fmtVal(fieldById(id), c);
    };
    const rows = parts.map((pp) => {
        const lv = cell('dev' + pp[1] + 'Lv');
        const exp = cell('dev' + pp[1] + 'Exp');
        const sense = cell('dev' + pp[1] + 'Sense');
        if (!lv && !exp && !sense) return '';
        return '<tr><th>' + esc(pp[0]) + '</th><td class="lv">' + esc(lv) + '</td><td>' + esc(exp) + '</td><td>' + esc(sense) + '</td></tr>';
    }).join('');
    if (!rows) return '';
    return '<table class="yw-nsfw-dev"><thead><tr><th>部位</th><th>等级</th><th>经验</th><th>变化</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function rowHtml(f, cell) {
    if (!cell) return '';
    const val = fmtVal(f, cell);
    if (!val && !(f && f.static)) return '';
    const optAttr = Array.isArray(f.options) ? ' data-options="' + esc(f.options.join('|')) + '"' : '';
    const idAttr = ' data-id="' + esc(f.id) + '" data-type="' + esc(f.type) + '"' + optAttr + (f.static ? ' data-static="1"' : '');
    const c = '<td class="yw-nsfw-c">' + (cell.comment ? esc(cell.comment) : '') + '</td>';
    if (f.type === 'num') {
        const n = Number(cell.value);
        const max = typeof f.max === 'number' ? f.max : 100;
        const pct = Math.max(0, Math.min(100, (n / max) * 100));
        const barHtml = f.noBar ? '' : '<span class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></span>';
        return '<tr class="yw-nsfw-row"' + idAttr + '><th class="k">' + esc(f.label) + '</th>'
            + '<td class="v"><span class="num">' + esc(withUnit(f, val)) + '</span>' + barHtml + '</td>'
            + c + '</tr>';
    }
    return '<tr class="yw-nsfw-row"' + idAttr + '><th class="k">' + esc(f.label) + '</th>'
        + '<td class="t">' + esc(withUnit(f, val)) + '</td>' + c + '</tr>';
}

/** 状态卡（v2：分页 tabs，评述在右） */
export function nsfwRenderCard(name, profile) {
    const wrap = document.createElement('div');
    const dens = String((_getSettings() || {}).nsfwDensity || 'normal');
    wrap.className = 'yw-nsfw yw-nsfw--' + (dens === 'compact' || dens === 'loose' ? dens : 'normal');
    wrap.setAttribute('data-char', name);
    const sexTxt = profile.sex === 'male' ? '男' : (profile.sex === 'other' ? '其他' : '女');
    const roleTxt = profile.role === 'top' ? '攻' : (profile.role === 'switch' ? '双' : '受');
    const g = (id) => ((profile.stats || {})[id] || {}).value;
    const preg = calcPregRisk(profile);

    wrap.dataset.char = name;
    const head = document.createElement('div');
    head.className = 'yw-nsfw-head';
    head.innerHTML = '<button type="button" class="yw-nsfw-copy-btn" title="复制全部内容">⧉</button>'
        + '<button type="button" class="yw-nsfw-edit-btn" title="编辑这张卡">✎</button>'
        + '<span class="nm">' + esc(name) + '</span>'
        + '<span class="tag">' + roleTxt + '</span><span class="tag">' + sexTxt + '</span>'
        + '<span class="kv">理智 ' + esc(g('sanity') == null ? '-' : g('sanity')) + '</span>'
        + '<span class="kv">欲望 ' + esc(g('libido') == null ? '-' : g('libido')) + '</span>'
        + '<span class="kv yw-nsfw-preg">怀孕 ' + preg.risk + '%</span>';
    wrap.appendChild(head);

    const statsView = Object.assign({}, profile.stats || {});
    Object.keys(profile.static || {}).forEach((id) => {
        if (!statsView[id] && profile.static[id]) statsView[id] = { value: profile.static[id], comment: '' };
    });
    const byGroup = {};
    activeFields(profile).forEach((f) => {
        if (f.hideInCard) return;
        const cell = statsView[f.id];
        if (!cell || !fmtVal(f, cell)) return;
        (byGroup[f.group] = byGroup[f.group] || []).push(rowHtml(f, cell));
    });

    const tabBar = document.createElement('div');
    tabBar.className = 'yw-nsfw-tabs';
    const panels = document.createElement('div');
    panels.className = 'yw-nsfw-panels';

    const tabs = [];
    GROUP_ORDER.forEach((grp) => {
        /* ★W325：「开发」组改成普通计数行（旧的 部位×等级/经验/变化 表已随字段删除） */
        const html = tabRowsHtml(profile, grp, byGroup);
        if (html) tabs.push({ id: grp, label: grp, html: html });
    });
    const viewRows = NSFW_DESC_FIELDS.map((d) => (profile.desc && profile.desc[d.id] ? { label: d.label, text: profile.desc[d.id].text } : null)).filter(Boolean);
    if (viewRows.length) {
        tabs.push({
            id: '视线', label: '视线',
            html: viewRows.map((v) => '<div class="yw-nsfw-viewrow"><span class="lbl">' + esc(v.label) + '</span>' + esc(v.text) + '</div>').join('')
        });
    }
    if (!tabs.length) {
        const empty = document.createElement('div');
        empty.className = 'yw-nsfw-empty';
        empty.textContent = '（还没有状态，等 AI 回一轮）';
        wrap.appendChild(empty);
        return wrap;
    }

    tabs.forEach((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'yw-nsfw-tab' + (i === 0 ? ' on' : '');
        b.textContent = t.label;
        b.addEventListener('click', () => {
            tabBar.querySelectorAll('.yw-nsfw-tab').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            panels.querySelectorAll('.yw-nsfw-panel').forEach((x) => x.classList.remove('on'));
            const p = panels.querySelector('[data-panel="' + t.id + '"]');
            if (p) p.classList.add('on');
        });
        tabBar.appendChild(b);

        const p = document.createElement('div');
        p.className = 'yw-nsfw-panel' + (i === 0 ? ' on' : '');
        p.setAttribute('data-panel', t.id);
        p.innerHTML = t.html;
        panels.appendChild(p);
    });

    wrap.appendChild(tabBar);
    wrap.appendChild(panels);
    try { bindCardEdit(wrap, name, profile); } catch (e) { }
    return wrap;
}

/** 卡片就地编辑：✎ 进入，✓ 保存 */
function bindCardEdit(wrap, name, profile) {
    const copyBtn = wrap.querySelector('.yw-nsfw-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            const text = nsfwDumpChar(nsfwChatId(), name);
            const done = () => { copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200); };
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done).catch(function () { });
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    done();
                }
            } catch (e) { }
        });
    }
    const btn = wrap.querySelector('.yw-nsfw-edit-btn');
    if (!btn) return;
    let editing = false;
    btn.addEventListener('click', function () {
        const chatId = nsfwChatId();
        if (!editing) {
            editing = true;
            btn.textContent = '✓';
            btn.title = '保存';
            wrap.classList.add('yw-nsfw-editing');
            wrap.querySelectorAll('.yw-nsfw-row[data-id]').forEach((row) => {
                const id = row.getAttribute('data-id');
                const isStatic = row.getAttribute('data-static') === '1';
                const type = row.getAttribute('data-type') || 'text';
                const optsAttr = row.getAttribute('data-options') || '';
                const cell = isStatic ? { value: (profile.static || {})[id], comment: '' } : ((profile.stats || {})[id] || {});
                const vEl = row.querySelector('.v') || row.querySelector('.t');
                if (vEl) {
                    vEl.textContent = '';
                    if (optsAttr) {
                        const sel = document.createElement('select');
                        sel.className = 'yw-nsfw-in yw-nsfw-in-v';
                        optsAttr.split('|').forEach((op) => {
                            const o = document.createElement('option');
                            o.value = op; o.textContent = op;
                            if (String(cell.value) === op) o.selected = true;
                            sel.appendChild(o);
                        });
                        vEl.appendChild(sel);
                    } else {
                        const inp = document.createElement('input');
                        inp.className = 'yw-nsfw-in yw-nsfw-in-v';
                        inp.value = cell.value == null ? '' : String(cell.value);
                        if (type === 'num') inp.type = 'number';
                        vEl.appendChild(inp);
                    }
                }
                const cEl = row.querySelector('.yw-nsfw-c');
                if (cEl && !isStatic) {
                    const inp2 = document.createElement('input');
                    inp2.className = 'yw-nsfw-in yw-nsfw-in-c';
                    inp2.placeholder = '评述';
                    inp2.value = cell.comment == null ? '' : String(cell.comment);
                    cEl.textContent = '';
                    cEl.appendChild(inp2);
                }
            });
            return;
        }
        /* 保存 */
        wrap.querySelectorAll('.yw-nsfw-row[data-id]').forEach((row) => {
            const id = row.getAttribute('data-id');
            const isStatic = row.getAttribute('data-static') === '1';
            const v = row.querySelector('.yw-nsfw-in-v');
            const c = row.querySelector('.yw-nsfw-in-c');
            if (!v) return;
            if (isStatic) nsfwSetStatic(chatId, name, id, v.value);
            else nsfwSetStat(chatId, name, id, v.value, c ? c.value : '');
        });
        editing = false;
        btn.textContent = '✎';
        btn.title = '编辑这张卡';
        wrap.classList.remove('yw-nsfw-editing');
        const mesid = wrap.dataset.mesid;
        if (mesid != null) setTimeout(() => { try { nsfwMountToMessage(Number(mesid)); } catch (e) { } }, 30);
    });
}
/** 示例填充：给当前聊天塞一个全字段角色，方便先看效果 */
export function nsfwFillDemo(chatId, name) {
    try {
        const n = String(name || '夏海');
        nsfwEnsure(chatId, n, 'female', 'bottom');
        nsfwApplyStatic(chatId, n, [
            '罩杯/胸肌: C 罩杯', '胸型: 水滴形', '乳头长: 1.2cm', '乳头宽: 0.8cm', '乳晕直径: 3.5cm',
            'G点深度: 5cm', '子宫口深度: 12cm', '阴蒂长度: 1.5cm', '阴蒂大小: 小指末节',
            '前列腺深度: 5cm', '结肠口深度: 14cm'
        ].join(String.fromCharCode(10)));
        const m = {};
        const set = (id, v, c) => { m[id] = { value: v, comment: c || '' }; };
        set('stamina', '42', '腿在抖'); set('sanity', '35', '眼前发白'); set('libido', '85', '烧得人发昏');
        set('compliance', '82', '让做什么就做什么'); set('shame', '20', '不太会脸红了');
        set('menstrual', '排卵期', '这几天最危险'); set('menstrualNextDays', '3', '就等这一下');
        set('voice', '说不出完整句子', '只剩气音');
        set('expLastPartner', '陆沉', '今晚');
        set('temp', '38.2℃', '烫得吓人');
        set('sweat', '薄汗', '背上一层水光'); set('organFlush', '阴道壁、子宫口、后穴 · 充血红肿', '一碰就抽');
        set('bodyMarks', '腰侧指印、后颈咬痕', '还没消');
        set('selfJuice', '泉涌', '大腿内侧一片湿滑'); set('extJuice', '淋漓沾黏', '混着白浊往下淌');
        set('belly', '微微鼓起', '摸上去沉甸甸');
        set('outer', '开档薄纱情趣睡衣', '贴在汗湿的皮肤上'); set('inner', '无', '早就没穿了');
        set('accessories', '猫尾肛塞', '还在震');
        set('milkMl', '38', '积了快一天');
        set('vLoose', '85', '肌肉失去弹性，从外面能看到内壁'); set('clitState', '充血挺立', '一碰就缩');
        set('cervixState', '未开 · 充血红肿', '每一下都撞在那'); set('vFluidMl', '58', '顺着大腿往下'); set('vFluidKind', '爱液', '');
        set('uterusFluidMl', '0', '还没灌进去'); set('vulvaState', '小阴唇微张外翻 · 暗红充血', '被磨得发亮');
        set('aLoose', '35', '拔出来会合不拢');
        set('colonState', '紧闭', '顶到就发酸'); set('aFluidMl', '32', '被堵在里面'); set('aFluidKind', '润滑油', '');
        set('keyPointState', '前列腺 · 充血', '一顶就腿软'); set('aAnusState', '紧致 · 边缘泛红', '');
        set('expOralCount', '2', '含被动'); set('expBlowjobCount', '5', '他很喜欢');
        set('expChestCount', '40', '每次必被照顾');
        set('expVCount', '14', '两日累计，穴口已含得住他');
        set('expACount', '3', '刚开始开发');
        set('expVCumCount', '13', '内壁学会了含住临界点');
        set('expMasturbation', '24', '最近很频繁'); set('expPartners', '3', ''); set('expOralCount', '31', '很熟练');
        set('expVCount', '17', ''); set('expVCumCount', '9', ''); set('expACount', '6', ''); set('expACumCount', '2', '');
        set('condom', '否', '没用'); set('condomCount', '0', ''); set('cumV', '是', '全灌进去了');
        set('orgasmCount', '3', '这次已经三次');
        const desc = {
            viewBody: '跪趴的腰塌成一道弧，臀肉上还留着指印，膝盖在打颤',
            viewOutfit: '穿得少，却像一件被仔细拆过包装、又不打算收回去的礼物',
            viewChannel: '外口合不拢，光看就知道刚被用过，还挂着没擦干净的痕迹'
        };
        const chars = {};
        chars[n] = { machine: m, desc: desc };
        nsfwApply(chatId, { chars: chars });
        return true;
    } catch (e) { return false; }
}
/** 导出某角色全部状态为纯文本 */
export function nsfwDumpChar(chatId, name) {
    try {
        const { bucket } = nsfwBucket(chatId);
        const rec = bucket.chars[name];
        if (!rec) return '';
        const lines = ['== ' + name + ' (' + (rec.sex || 'female') + ' / ' + (rec.role || 'bottom') + ') =='];
        nsfwAllFields().filter((f) => !f.static && (!f.sex || f.sex === (rec.sex || 'female'))).forEach((f) => {
            const c = (rec.stats || {})[f.id];
            if (!c) return;
            const v = fmtVal(f, c);
            if (!v) return;
            lines.push(f.id + ' ' + f.label + ' = ' + v + (c.comment ? '|' + c.comment : ''));
        });
        const stIds = Object.keys(rec.static || {});
        stIds.forEach((id) => {
            const f = nsfwAllFields().find((x) => x.id === id);
            if (f && rec.static[id]) lines.push('[档案] ' + f.label + ' = ' + rec.static[id]);
        });
        NSFW_DESC_FIELDS.forEach((d) => {
            if (rec.desc && rec.desc[d.id]) lines.push(d.label + ': ' + (rec.desc[d.id].text || ''));
        });
        return lines.join(String.fromCharCode(10));
    } catch (e) { return ''; }
}
/** 导出当前聊天全部角色 */
export function nsfwDumpText(chatId) {
    try {
        const { bucket } = nsfwBucket(chatId);
        const names = (bucket.order || []).filter((n) => bucket.chars[n]);
        return names.map((n) => nsfwDumpChar(chatId, n)).filter(Boolean).join(String.fromCharCode(10, 10));
    } catch (e) { return ''; }
}
/* ────────────────────────── 样式 ────────────────────────── */

const CSS = [
    '.mes_text [data-nsfw]{display:none !important}',
    '.mes_text nsfw,.mes_text nsfwdesc{display:none !important}',
    '.yw-nsfw{margin:6px 0 8px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 16%,transparent);border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 3%,transparent);font-size:0.86em}',
    '.yw-nsfw-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:6px 9px;border-bottom:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent);background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 5%,transparent)}',
    '.yw-nsfw-head .nm{font-weight:700;letter-spacing:.5px}',
    '.yw-nsfw-head .tag{font-size:.78em;opacity:.75;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);border-radius:999px;padding:0 6px}',
    '.yw-nsfw-head .kv{margin-left:auto;font-size:.8em;opacity:.8}',
    '.yw-nsfw-head .kv+.kv{margin-left:8px}',
    '.yw-nsfw-head .yw-nsfw-preg{opacity:.95;font-weight:600}',
    '.yw-nsfw-tabs{display:flex;flex-wrap:wrap;gap:3px;padding:5px 7px 0;position:sticky;top:0;z-index:1;background:inherit}',
    '.yw-nsfw-tab{font:inherit;font-size:.78em;padding:1px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 22%,transparent);background:transparent;color:inherit;opacity:.62;cursor:pointer}',
    '.yw-nsfw-tab.on{opacity:1;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent);border-color:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 45%,transparent)}',
    '.yw-nsfw-panels{padding:2px 7px 6px}',
    '.yw-nsfw-panel{display:none}',
    '.yw-nsfw-panel.on{display:block}',
    '.yw-nsfw-row{display:flex;align-items:baseline;gap:6px;padding:2px 2px;line-height:1.45;flex-wrap:wrap}',
    '.yw-nsfw-row .k{flex:0 0 9.6em;opacity:.7;font-size:.84em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.yw-nsfw-row .bar{flex:0 0 4.6em;height:5px;border-radius:999px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 14%,transparent);overflow:hidden;align-self:center}',
    '.yw-nsfw-row .bar>i{display:block;height:100%;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 60%,transparent)}',
    '.yw-nsfw-row .v{flex:0 0 2.2em;text-align:right;font-variant-numeric:tabular-nums;font-size:.86em}',
    '.yw-nsfw-row .t{flex:0 1 auto;min-width:0;overflow-wrap:anywhere}',
    '.yw-nsfw-row .yw-nsfw-c{flex:1 1 6em;min-width:0;text-align:right;opacity:.6;font-size:.82em;font-style:italic;overflow-wrap:anywhere}',
    '.yw-nsfw-viewrow{padding:3px 2px;font-size:.86em;line-height:1.55;font-style:italic;opacity:.9}',
    '.yw-nsfw-viewrow .lbl{opacity:.55;font-style:normal;margin-right:6px}',
    '.yw-nsfw-empty{padding:10px;opacity:.6;font-size:.86em}',
    '.yw-nsfw-tbl{width:100%;border-collapse:collapse;font-size:.86em;margin:2px 0}',
    '.yw-nsfw-tbl thead th{opacity:.45;font-weight:500;font-size:.9em;padding:2px 4px;text-align:left;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent)}',
    '.yw-nsfw-tbl tbody th{width:8.2em;font-weight:500;opacity:.72;padding:2px 4px;text-align:left;white-space:nowrap;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 8%,transparent)}',
    '.yw-nsfw-tbl td{padding:2px 4px;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 8%,transparent);vertical-align:middle}',
    '.yw-nsfw-tbl td.v{width:7.2em;white-space:nowrap}',
    '.yw-nsfw-tbl td.v .num{font-variant-numeric:tabular-nums;margin-right:6px}',
    '.yw-nsfw-tbl td.v .bar{display:inline-block;width:3.6em;height:5px;border-radius:999px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 14%,transparent);overflow:hidden;vertical-align:middle}',
    '.yw-nsfw-tbl td.v .bar>i{display:block;height:100%;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 60%,transparent)}',
    /* ★W327 悬浮发送条：一条横条，可拖；AUTO 在左，名字在右；点名字看快照 */
    '#yw-nsfw-sender{position:fixed;right:12px;bottom:86px;z-index:30040;display:flex;align-items:center;gap:6px;max-width:min(72vw,560px);padding:4px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 26%,transparent);background:color-mix(in srgb,var(--SmartThemeBlurTintColor,transparent) 88%,transparent);backdrop-filter:blur(10px);color:var(--SmartThemeBodyColor,currentColor);font-size:12px;line-height:1.2;box-shadow:0 4px 16px rgba(0,0,0,.22);user-select:none}',
    '#yw-nsfw-sender .yw-nsfw-sd-grip{cursor:grab;opacity:.45;padding:0 2px;letter-spacing:-2px}',
    '#yw-nsfw-sender .yw-nsfw-sd-grip:active{cursor:grabbing}',
    '#yw-nsfw-sender .yw-nsfw-sd-auto{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-weight:600;white-space:nowrap}',
    '#yw-nsfw-sender .yw-nsfw-sd-auto input{accent-color:var(--SmartThemeBodyColor,currentColor);margin:0}',
    '#yw-nsfw-sender .yw-nsfw-sd-sep{width:1px;height:14px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 22%,transparent)}',
    '#yw-nsfw-sender .yw-nsfw-sd-item{display:inline-flex;align-items:center;gap:3px;padding:1px 2px;border-radius:999px}',
    '#yw-nsfw-sender .yw-nsfw-sd-item:hover{background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent)}',
    '#yw-nsfw-sender .yw-nsfw-sd-item input{accent-color:var(--SmartThemeBodyColor,currentColor);margin:0}',
    '#yw-nsfw-sender .yw-nsfw-sd-name{cursor:pointer;font-weight:500;white-space:nowrap;padding:0 2px}',
    '#yw-nsfw-sender .yw-nsfw-sd-name:hover{text-decoration:underline}',
    '#yw-nsfw-sender .yw-nsfw-sd-empty{opacity:.6}',
    '#yw-nsfw-preview{position:fixed;right:12px;bottom:130px;z-index:30050;display:none;width:min(92vw,420px);max-height:70vh;overflow:auto;border-radius:14px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);background:var(--SmartThemeBlurTintColor,transparent);backdrop-filter:blur(12px);box-shadow:0 10px 34px rgba(0,0,0,.3);padding:8px;color:var(--SmartThemeBodyColor,currentColor);font-size:12px}',
    '#yw-nsfw-preview .yw-nsfw-pv-hd{display:flex;align-items:center;justify-content:space-between;font-weight:600;margin-bottom:6px;padding:0 2px}',
    '#yw-nsfw-preview .yw-nsfw-pv-x{cursor:pointer;border:0;background:transparent;color:inherit;opacity:.6;font-size:14px}',
    '#yw-nsfw-preview .yw-nsfw{margin:0}',
    '.yw-nsfw-tbl td.t{width:38%;overflow-wrap:anywhere}',    '.yw-nsfw-tbl td.t{width:38%;overflow-wrap:anywhere}',
    '.yw-nsfw-tbl td.yw-nsfw-c{opacity:.6;font-size:.9em;font-style:italic;text-align:right;overflow-wrap:anywhere}',
    '.yw-nsfw-dev{width:100%;border-collapse:collapse;font-size:.84em;margin:2px 0}',
    '.yw-nsfw-dev th,.yw-nsfw-dev td{padding:3px 4px;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent);text-align:left}',
    '.yw-nsfw-dev thead th{opacity:.55;font-weight:500;font-size:.95em}',
    '.yw-nsfw-dev tbody th{width:2.6em;opacity:.8;font-weight:600}',
    '.yw-nsfw-dev td.lv{width:2.2em;text-align:right;font-variant-numeric:tabular-nums}',
    '.yw-nsfw-dev td.sk{opacity:.85}',
    '.yw-nsfw-copy-btn{font:inherit;font-size:.8em;padding:0 6px;border-radius:6px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);background:transparent;color:inherit;cursor:pointer;opacity:.7}',
    '.yw-nsfw-copy-btn:hover{opacity:1}',
    '.yw-nsfw-edit-btn{font:inherit;font-size:.8em;padding:0 6px;border-radius:6px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);background:transparent;color:inherit;cursor:pointer;opacity:.7}',
    '.yw-nsfw-edit-btn:hover{opacity:1}',
    '.yw-nsfw-editing .yw-nsfw-in{font:inherit;font-size:.9em;padding:0 4px;border-radius:4px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 30%,transparent);background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 6%,transparent);color:inherit;min-width:3em;max-width:100%}',
    '.yw-nsfw-editing .yw-nsfw-in-v{width:6.5em}',
    '.yw-nsfw-editing .yw-nsfw-in-c{width:100%}',
    '.yw-nsfw-sub{margin:6px 2px 2px;font-size:.76em;opacity:.5;letter-spacing:.5px}',
    '.yw-nsfw--compact .yw-nsfw-row{padding:0 2px;line-height:1.3}',
    '.yw-nsfw--compact .yw-nsfw-row .k{font-size:.78em}',
    '.yw-nsfw--loose .yw-nsfw-row{padding:5px 2px;line-height:1.6}',
    '@media (max-width:600px){.yw-nsfw-row .k{flex-basis:5.4em}.yw-nsfw-row .yw-nsfw-c{flex-basis:100%;text-align:left;padding-left:5.4em}}'
].join('');

export function nsfwEnsureStyle() {
    try {
        const old = document.getElementById('yw-nsfw-style');
        if (old) old.remove();
        const st = document.createElement('style');
        st.id = 'yw-nsfw-style';
        st.textContent = CSS;
        document.head.appendChild(st);
    } catch (e) { }
}

/** 从一段正文里的 <nsfw> 块构造 profile 映射（卡片用，不读缓存） */
export function nsfwProfilesFromText(text) {
    const out = {};
    try {
        const parsed = nsfwParse(text);
        Object.keys(parsed.chars || {}).forEach((name) => {
            const c = parsed.chars[name];
            const meta = c.meta || {};
            const sex = (meta.sex === 'm' || meta.sex === 'male') ? 'male' : (meta.sex === 'o' || meta.sex === 'other' ? 'other' : 'female');
            const role = (meta.role === 'top') ? 'top' : (meta.role === 'switch' ? 'switch' : 'bottom');
            const stats = {};
            Object.keys(c.machine || {}).forEach((id) => { stats[id] = c.machine[id]; });
            const desc = {};
            Object.keys(c.desc || {}).forEach((id) => { desc[id] = { text: c.desc[id] }; });
            out[name] = { sex: sex, role: role, stats: stats, desc: desc };
        });
    } catch (e) { }
    return out;
}
/** 隐藏正文里的原始块（显示层不改 mes；块本身留在楼层里，小铅笔能看到） */
export function nsfwHideRaw(root) {
    try {
        const host = root || document;
        if (!host) return;
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            const v = node.nodeValue || '';
            const a1 = v.indexOf('<nsfw');
            const a2 = v.indexOf('&lt;nsfw');
            let a = a1 < 0 ? a2 : (a2 < 0 ? a1 : Math.min(a1, a2));
            if (a < 0) return;
            const parent = node.parentNode;
            if (!parent) return;
            if (parent.classList && parent.classList.contains('yw-nsfw-raw')) return;
            /* 块尾：取最后一个闭合标记；找不到就吃到本节点末尾 */
            let end = -1;
            ['</nsfwdesc>', '</nsfw>', '&lt;/nsfwdesc&gt;', '&lt;/nsfw&gt;'].forEach((c) => {
                const k = v.lastIndexOf(c);
                if (k >= 0) end = Math.max(end, k + c.length);
            });
            if (end < a) end = v.length;
            const frag = document.createDocumentFragment();
            if (a > 0) frag.appendChild(document.createTextNode(v.slice(0, a)));
            const span = document.createElement('span');
            span.className = 'yw-nsfw-raw';
            span.style.display = 'none';
            span.textContent = v.slice(a, end);
            frag.appendChild(span);
            if (end < v.length) frag.appendChild(document.createTextNode(v.slice(end)));
            parent.replaceChild(frag, node);
        });
    } catch (e) { }
}
/* ────────────────────────── 每楼快照 ────────────────────────── */
const SNAP_KEY = 'kimi_nsfw_snaps';
export function nsfwSaveSnap(chatId, msgId) {
    try {
        const { bucket } = nsfwBucket(chatId);
        const raw = localStorage.getItem(SNAP_KEY);
        const all = raw ? (JSON.parse(raw) || {}) : {};
        const cid = String(chatId || 'default');
        if (!all[cid] || typeof all[cid] !== 'object') all[cid] = {};
        const snap = {};
        Object.keys(bucket.chars || {}).forEach((n) => {
            const rec = bucket.chars[n];
            if (!rec || !rec.updatedAt) return;
            snap[n] = { sex: rec.sex, role: rec.role, stats: JSON.parse(JSON.stringify(rec.stats || {})), desc: JSON.parse(JSON.stringify(rec.desc || {})) };
        });
        all[cid][String(msgId)] = snap;
        const keys = Object.keys(all[cid]);
        if (keys.length > 300) { keys.sort((a, b) => Number(a) - Number(b)); keys.slice(0, keys.length - 300).forEach((k) => { delete all[cid][k]; }); }
        localStorage.setItem(SNAP_KEY, JSON.stringify(all));
        return true;
    } catch (e) { return false; }
}
export function nsfwSnapOf(chatId, msgId) {
    try {
        const raw = localStorage.getItem(SNAP_KEY);
        const all = raw ? (JSON.parse(raw) || {}) : {};
        const cid = String(chatId || 'default');
        return (all[cid] && all[cid][String(msgId)]) || null;
    } catch (e) { return null; }
}
/* ────────────────────────── 消息挂载 ────────────────────────── */

export function nsfwMountToMessage(messageId) {
    try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext ? window.SillyTavern.getContext() : null;
        const msg = ctx && ctx.chat ? ctx.chat[messageId] : null;
        if (!msg || msg.is_user || msg.is_system) return false;
        const chatId = nsfwChatId(ctx);
        const { bucket } = nsfwBucket(chatId);
        const bucketNames = (bucket.order || []).filter((n) => bucket.chars[n] && bucket.chars[n].updatedAt);

        const mesEl = document.querySelector('.mes[mesid="' + messageId + '"]');
        if (!mesEl) return false;

        /* ★W315：卡片只认这一楼自己的块（块就在 mes 里，像 todo/remind 一样跟着楼层走） */
        const text = String(msg.mes || '');
        const own = nsfwProfilesFromText(text);
        const ownNames = Object.keys(own);
        const snap = ownNames.length ? null : nsfwSnapOf(chatId, messageId);
        const pick = (n) => own[n] || (snap && snap[n]) || bucket.chars[n] || { sex: 'female', role: 'bottom', stats: {}, desc: {} };
        let show = ownNames.length ? ownNames : [];
        if (!show.length && snap) show = Object.keys(snap);
        if (!show.length) show = bucketNames.filter((n) => text.indexOf(n) >= 0);
        if (!show.length) return false;

        nsfwEnsureStyle();
        mesEl.querySelectorAll('.yw-nsfw').forEach((n) => n.remove());
        nsfwHideRaw(mesEl);
        show.slice(0, 3).forEach((n) => {
            const card = nsfwRenderCard(n, pick(n));
            card.dataset.mesid = String(messageId);
            const anchor = mesEl.querySelector('.mes_text') || mesEl;
            if (anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
            else mesEl.appendChild(card);
        });
        return true;
    } catch (e) { return false; }
}

export function nsfwReattachAll() {
    try {
        document.querySelectorAll('#chat .mes[mesid]').forEach((el) => {
            const id = Number(el.getAttribute('mesid'));
            if (Number.isFinite(id)) nsfwMountToMessage(id);
        });
    } catch (e) { }
}
