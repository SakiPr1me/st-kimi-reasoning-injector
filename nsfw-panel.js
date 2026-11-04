/**
 * ============================================================================
 *  状态栏模块（NSFW）· v1
 * ----------------------------------------------------------------------------
 *  闭环：注入（规则 + 在场全量 + 其余摘要 + 协议）→ AI 吐两段（机器段 + 官能段）
 *        → 解析 / 剥块 / 画卡 / 落盘 → 下一轮注入更新后的状态
 *
 *  两段协议：
 *    <nsfw name="角色">字段: 值（官能评述）</nsfw>        ← 插件读数值，评述只展示
 *    <nsfwdesc name="角色">组·他人视线: 色色打量</nsfwdesc> ← 只展示，不进数值
 *
 *  设计纪律：
 *    · 所有对外函数 try/catch，绝不把异常抛回 index.js
 *    · 缺字段沿用旧值；未知字段忽略；数值按字段范围钳制
 *    · 档案存 localStorage，按 chatId 分桶（不动 settings.json）
 * ============================================================================
 */

const NL = String.fromCharCode(10);

/* ────────────────────────── 字段定义 ────────────────────────── */

/**
 * 字段类型：
 *   num   数值（min/max，可带单位）
 *   text  短文本
 *   list  逗号/顿号分隔列表
 *   exp   经验：Lv2·6次（可带评述）
 *   level 开发度：LV3|180/300|敏感度|技能1,技能2
 */
export const NSFW_FIELDS = [
    /* 精神 */
    { id: 'sanity', group: '精神', label: '理智', type: 'num', min: 0, max: 100, core: true, static: false },
    { id: 'compliance', group: '精神', label: '配合度', type: 'num', min: 0, max: 100, core: true, static: false },
    { id: 'shame', group: '精神', label: '耻辱', type: 'num', min: 0, max: 100, core: true, static: false },
    { id: 'libido', group: '精神', label: '欲望', type: 'num', min: 0, max: 100, core: true, static: false },
    { id: 'stamina', group: '精神', label: '体力', type: 'num', min: 0, max: 100, core: true, static: false },
    { id: 'fatigue', group: '精神', label: '疲劳', type: 'num', min: 0, max: 100, core: true, static: false },
    { id: 'cycle', group: '精神', label: '生理周期', type: 'text', core: true, static: false },
    { id: 'voice', group: '精神', label: '发声状态', type: 'text', core: true, static: false },
    { id: 'brands', group: '精神', label: '心理烙印', type: 'list', core: true, static: false },
    { id: 'bottomline', group: '精神', label: '崩塌底线', type: 'text', core: false, static: false },
    { id: 'bladder', group: '精神', label: '尿意', type: 'num', min: 0, max: 100, core: false, static: false },
    { id: 'pain', group: '精神', label: '疼痛度', type: 'num', min: 0, max: 100, core: false, static: false },
    { id: 'exposure', group: '精神', label: '暴露度', type: 'num', min: 0, max: 100, core: false, static: false },
    { id: 'pregnancy', group: '精神', label: '怀孕状态', type: 'text', core: false, static: false },

    /* 体态 */
    { id: 'pose', group: '体态', label: '当前体位', type: 'text', core: true, static: false },
    { id: 'temp', group: '体态', label: '体温', type: 'text', core: true, static: false },
    { id: 'skinFlush', group: '体态', label: '肤色充血', type: 'text', core: true, static: false },
    { id: 'wearLevel', group: '体态', label: '损耗度', type: 'text', core: true, static: false },
    { id: 'bodyMarks', group: '体态', label: '体表痕迹', type: 'list', core: true, static: false },
    { id: 'selfJuice', group: '体态', label: '自身体液', type: 'text', core: true, static: false },
    { id: 'extJuice', group: '体态', label: '外部液体', type: 'text', core: true, static: false },
    { id: 'sweat', group: '体态', label: '出汗量', type: 'text', core: false, static: false },
    { id: 'breath', group: '体态', label: '呼吸喘息', type: 'text', core: false, static: false },
    { id: 'scent', group: '体态', label: '体味气味', type: 'text', core: false, static: false },
    { id: 'belly', group: '体态', label: '腹部外观', type: 'text', core: true, static: false },

    /* 穿搭 */
    { id: 'outer', group: '穿搭', label: '外衣', type: 'text', core: true, static: false },
    { id: 'inner', group: '穿搭', label: '内衣', type: 'text', core: true, static: false },
    { id: 'accessories', group: '穿搭', label: '配饰', type: 'list', core: true, static: false },
    { id: 'clothState', group: '穿搭', label: '衣物状态', type: 'text', core: false, static: false },
    { id: 'insertItem', group: '穿搭', label: '插入物', type: 'text', core: false, static: false },

    /* 前通道（女） */
    { id: 'vDepthNow', group: '前通道', label: '前-当前深度', type: 'text', sex: 'female', core: true, static: false },
    { id: 'vOpening', group: '前通道', label: '前-外口', type: 'text', sex: 'female', core: true, static: false },
    { id: 'cervixState', group: '前通道', label: '子宫口', type: 'text', sex: 'female', core: true, static: false },
    { id: 'uterusInner', group: '前通道', label: '子宫内部', type: 'text', sex: 'female', core: true, static: false },
    { id: 'vulvaColorNow', group: '前通道', label: '外阴色泽', type: 'text', sex: 'female', core: false, static: false },

    /* 后通道 */
    { id: 'aDepthNow', group: '后通道', label: '后-当前深度', type: 'text', core: true, static: false },
    { id: 'aOpening', group: '后通道', label: '后-外口', type: 'text', core: true, static: false },
    { id: 'colonState', group: '后通道', label: '结肠口', type: 'text', core: true, static: false },
    { id: 'keyPointState', group: '后通道', label: '关键点', type: 'text', core: true, static: false },

    /* 液量 */
    { id: 'fluidNow', group: '液量', label: '当前存量', type: 'text', core: true, static: false },
    { id: 'fluidPressure', group: '液量', label: '积压反馈', type: 'text', core: true, static: false },
    { id: 'leakAlert', group: '液量', label: '漏液警报', type: 'text', core: true, static: false },
    { id: 'injected', group: '液量', label: '本次注入', type: 'text', core: true, static: false },

    /* 开发度 */
    { id: 'devMouth', group: '开发', label: '口(M)', type: 'level', core: true, static: false },
    { id: 'devChest', group: '开发', label: '胸(B)', type: 'level', core: true, static: false },
    { id: 'devFront', group: '开发', label: '前(G)', type: 'level', core: true, static: false },
    { id: 'devBack', group: '开发', label: '后(P)', type: 'level', core: true, static: false },
    { id: 'devDeep', group: '开发', label: '最深(S)', type: 'level', core: true, static: false },

    /* 经验（核心 6 项常开，其余默认关） */
    { id: 'expPaizuri', group: '经验', label: '乳交', type: 'exp', core: true, static: false },
    { id: 'expOral', group: '经验', label: '口交', type: 'exp', core: false, static: false },
    { id: 'expOralCum', group: '经验', label: '口内射', type: 'exp', core: true, static: false },
    { id: 'expHand', group: '经验', label: '手交', type: 'exp', core: false, static: false },
    { id: 'expV', group: '经验', label: '前穴', type: 'exp', core: true, static: false },
    { id: 'expA', group: '经验', label: '后穴', type: 'exp', core: false, static: false },
    { id: 'expCervix', group: '经验', label: '进入子宫', type: 'exp', core: true, static: false },
    { id: 'expVCum', group: '经验', label: '前穴内射', type: 'exp', core: true, static: false },
    { id: 'expACum', group: '经验', label: '后穴内射', type: 'exp', core: true, static: false },
    { id: 'expOutCum', group: '经验', label: '外射', type: 'exp', core: true, static: false },
    { id: 'expSquirt', group: '经验', label: '潮吹', type: 'exp', core: false, static: false },
    { id: 'expIncont', group: '经验', label: '失禁', type: 'exp', core: false, static: false },
    { id: 'expToy', group: '经验', label: '玩具', type: 'exp', core: false, static: false },
    { id: 'expGroup', group: '经验', label: '多人围观', type: 'exp', core: false, static: false },
    { id: 'expBondage', group: '经验', label: '束缚调教', type: 'exp', core: false, static: false },

    /* 统计 */
    { id: 'orgasmCount', group: '统计', label: '高潮次数', type: 'num', min: 0, max: 999, core: true, static: false },
    { id: 'scene', group: '统计', label: '互动情境', type: 'text', core: true, static: false },

    /* ── 静态参数（建档填一次；不要求 AI 每轮输出） ── */
    { id: 'stAge', group: '静态-基础', label: '年龄', type: 'text', core: false, static: true },
    { id: 'stHeight', group: '静态-基础', label: '身高', type: 'text', core: false, static: true },
    { id: 'stWeight', group: '静态-基础', label: '体重', type: 'text', core: false, static: true },
    { id: 'stBust', group: '静态-基础', label: '胸围', type: 'text', core: false, static: true },
    { id: 'stWaist', group: '静态-基础', label: '腰围', type: 'text', core: false, static: true },
    { id: 'stHip', group: '静态-基础', label: '臀围', type: 'text', core: false, static: true },
    { id: 'stThigh', group: '静态-基础', label: '大腿围', type: 'text', core: false, static: true },
    { id: 'stChestSize', group: '静态-胸部', label: '罩杯/胸肌', type: 'text', core: false, static: true },
    { id: 'stChestShape', group: '静态-胸部', label: '胸型', type: 'text', core: false, static: true },
    { id: 'stChestFeel', group: '静态-胸部', label: '胸部触感温度', type: 'text', core: false, static: true },
    { id: 'stNippleLen', group: '静态-胸部', label: '乳头长', type: 'text', core: false, static: true },
    { id: 'stNippleWid', group: '静态-胸部', label: '乳头宽', type: 'text', core: false, static: true },
    { id: 'stAreolaDia', group: '静态-胸部', label: '乳晕直径', type: 'text', core: false, static: true },
    { id: 'stAreolaShape', group: '静态-胸部', label: '乳晕形态', type: 'text', core: false, static: true },
    { id: 'stAreolaColor', group: '静态-胸部', label: '乳晕色泽', type: 'text', core: false, static: true },
    { id: 'stLactation', group: '静态-胸部', label: '泌乳', type: 'text', core: false, static: true },
    { id: 'stVulvaShape', group: '静态-前通道', label: '外阴形态', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stVulvaColor', group: '静态-前通道', label: '外阴色泽', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stVDepth', group: '静态-前通道', label: '前-常态深度', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stVMaxDepth', group: '静态-前通道', label: '前-极限深度', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stGDepth', group: '静态-前通道', label: 'G点深度', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stCervixDepth', group: '静态-前通道', label: '子宫口深度', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stUterusLining', group: '静态-前通道', label: '子宫内壁倾向', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stVSafeCap', group: '静态-前通道', label: '前-安全容量', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stVMaxCap', group: '静态-前通道', label: '前-极限容量', type: 'text', sex: 'female', core: false, static: true },
    { id: 'stAnusShape', group: '静态-后通道', label: '肛门形态', type: 'text', core: false, static: true },
    { id: 'stRectumLoose', group: '静态-后通道', label: '后庭松弛度', type: 'text', core: false, static: true },
    { id: 'stADepth', group: '静态-后通道', label: '后-常态深度', type: 'text', core: false, static: true },
    { id: 'stAMaxDepth', group: '静态-后通道', label: '后-极限深度', type: 'text', core: false, static: true },
    { id: 'stKeyDepth', group: '静态-后通道', label: '关键点深度', type: 'text', core: false, static: true },
    { id: 'stColonDepth', group: '静态-后通道', label: '结肠口深度', type: 'text', core: false, static: true },
    { id: 'stASafeCap', group: '静态-后通道', label: '后-安全容量', type: 'text', core: false, static: true },
    { id: 'stAMaxCap', group: '静态-后通道', label: '后-极限容量', type: 'text', core: false, static: true },
    { id: 'stEroZones', group: '静态-其他', label: '敏感带', type: 'list', core: false, static: true },
    { id: 'stMouthDepth', group: '静态-其他', label: '口部耐受深度', type: 'text', core: false, static: true },
    { id: 'stFavPose', group: '静态-其他', label: '惯用体位', type: 'text', core: false, static: true },
    { id: 'stMarks', group: '静态-其他', label: '特殊标记', type: 'list', core: false, static: true }
];

/** 他人视线（只展示，不进数值） */
export const NSFW_DESC_FIELDS = [
    { id: 'viewMental', label: '精神·他人视线' },
    { id: 'viewBody', label: '体态·他人视线' },
    { id: 'viewOutfit', label: '穿搭·他人视线' },
    { id: 'viewChannel', label: '通道·他人视线' }
];

/** 内置更新规则 */
export const NSFW_DEFAULT_RULES = [
    { id: 'r1', text: '数值只在剧情事件发生时变化；单轮单字段变化不超过 15（重大剧情除外），禁止跳变。', enabled: true, builtin: true },
    { id: 'r2', text: '理智：随快感/羞辱事件下降，休息安抚回升；降到 0 进入崩溃态（写进发声状态与心理烙印）。', enabled: true, builtin: true },
    { id: 'r3', text: '配合度：只能缓慢上升，单轮不超过 5，且必须与剧情一致；不会因为一次高潮就跳到 100。', enabled: true, builtin: true },
    { id: 'r4', text: '耻辱：需要“适应类事件”才能下降；欲望随刺激上升、随冷却下降。', enabled: true, builtin: true },
    { id: 'r5', text: '体力与疲劳消耗/恢复对称，不得无中生有。', enabled: true, builtin: true },
    { id: 'r6', text: '开发度：每次有效刺激累积 EXP，满则 LV+1；未解锁的技能不得凭空出现。', enabled: true, builtin: true },
    { id: 'r7', text: '经验：按实际发生的事件累加次数与等级，没有发生就不写。', enabled: true, builtin: true },
    { id: 'r8', text: '液体量不得超过静态的“极限容量”；超了改写为外溢/喷溅，并把“漏液警报”写清楚。', enabled: true, builtin: true },
    { id: 'r9', text: '深度不得超过静态的“极限拉伸深度”；超了写“撕裂/极限”。', enabled: true, builtin: true },
    { id: 'r10', text: '所有数值钳制在字段范围内（0-100 等）；缺字段沿用上一轮的值，不要重置。', enabled: true, builtin: true },
    { id: 'r11', text: '每个字段的值后面必须跟一句官能评述（括号内），评述要与数值一致；评述只描述身体与感官，不写剧情推进。', enabled: true, builtin: true }
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
export function nsfwSaveBucket(chatId, bucket) {
    const { all, key } = nsfwBucket(chatId);
    all[key] = bucket;
    writeAll(all);
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
    if (bucket.order.indexOf(n) < 0) bucket.order.push(n);
    all[key] = bucket;
    writeAll(all);
    return bucket.chars[n];
}
export function nsfwRemove(chatId, name) {
    const { all, bucket, key } = nsfwBucket(chatId);
    bucket.order = (bucket.order || []).filter((n) => n !== name);
    delete bucket.chars[name];
    all[key] = bucket;
    writeAll(all);
}
export function nsfwTouch(chatId, name) {
    const { all, bucket, key } = nsfwBucket(chatId);
    if (!bucket.chars[name]) return;
    bucket.order = (bucket.order || []).filter((n) => n !== name);
    bucket.order.push(name);
    bucket.chars[name].updatedAt = Date.now();
    all[key] = bucket;
    writeAll(all);
}

/* ────────────────────────── 字段工具 ────────────────────────── */

const GROUP_ORDER = ['精神', '体态', '穿搭', '前通道', '后通道', '液量', '开发', '经验', '统计'];

function fieldById(id) {
    return NSFW_FIELDS.find((f) => f.id === id) || null;
}
function fieldByLabel(label) {
    const s = String(label || '').trim();
    return NSFW_FIELDS.find((f) => f.label === s)
        || NSFW_FIELDS.find((f) => f.id === s)
        || NSFW_FIELDS.find((f) => f.label.replace(/\s/g, '') === s.replace(/\s/g, ''))
        || null;
}
function activeFields(profile) {
    const sex = (profile && profile.sex) || 'female';
    const s = _getSettings() || {};
    const showAll = !!s.nsfwShowAllFields;
    return NSFW_FIELDS.filter((f) => !f.static)
        .filter((f) => !f.sex || f.sex === sex)
        .filter((f) => showAll || f.core === true);
}
function clampNum(f, v) {
    let n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (typeof f.min === 'number' && n < f.min) n = f.min;
    if (typeof f.max === 'number' && n > f.max) n = f.max;
    return n;
}

/* ────────────────────────── 解析 ────────────────────────── */

/** 把 "值（评述）" 拆成 { value, comment } */
export function splitValueComment(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^(.*?)[（(]([^（）()]*)[）)]\s*$/);
    if (m) return { value: m[1].trim(), comment: m[2].trim() };
    return { value: s, comment: '' };
}

/** 解析一段机器文本为 { fieldId: {value, comment} } */
export function parseMachineBody(body) {
    const out = {};
    String(body || '').split(/\r?\n/).forEach((line) => {
        const s = line.trim();
        if (!s) return;
        const idx = s.indexOf(':');
        const idx2 = s.indexOf('：');
        const cut = idx >= 0 ? idx : idx2;
        if (cut <= 0) return;
        const label = s.slice(0, cut).trim();
        const rest = s.slice(cut + 1).trim();
        const f = fieldByLabel(label);
        if (!f) return;                       // 未知字段忽略
        const sv = splitValueComment(rest);
        out[f.id] = { value: sv.value, comment: sv.comment };
    });
    return out;
}

/**
 * 从正文里抽出两段。
 * @returns {{ chars: Object, stripped: string }}
 *   chars: { 角色名: { machine:{id:{value,comment}}, desc:{viewX:'...'} } }
 */
export function nsfwParse(text) {
    const src = String(text || '');
    const chars = {};
    const ensure = (name) => {
        const n = String(name || '').trim();
        if (!chars[n]) chars[n] = { machine: {}, desc: {} };
        return chars[n];
    };
    const reM = /<nsfw\s+name\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/nsfw>/gi;
    let m;
    while ((m = reM.exec(src))) {
        const c = ensure(m[1]);
        const parsed = parseMachineBody(m[2]);
        Object.keys(parsed).forEach((k) => { c.machine[k] = parsed[k]; });
    }
    const reD = /<nsfwdesc\s+name\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/nsfwdesc>/gi;
    while ((m = reD.exec(src))) {
        const c = ensure(m[1]);
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

/** 把解析结果合并进档案（数值钳制、缺项沿用、列表拆分） */
export function nsfwApply(chatId, parsed) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const names = Object.keys((parsed && parsed.chars) || {});
        names.forEach((name) => {
            if (!bucket.chars[name]) {
                bucket.chars[name] = { sex: 'female', role: 'bottom', stats: {}, desc: {}, static: {}, updatedAt: 0 };
                if (bucket.order.indexOf(name) < 0) bucket.order.push(name);
            }
            const rec = bucket.chars[name];
            const mm = parsed.chars[name].machine || {};
            Object.keys(mm).forEach((id) => {
                const f = fieldById(id);
                if (!f) return;
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
        all[key] = bucket;
        writeAll(all);
        return names;
    } catch (e) { return []; }
}

/* ────────────────────────── 注入 ────────────────────────── */

function fmtVal(f, cell) {
    if (!cell) return '';
    const v = cell.value;
    if (f.type === 'list') return Array.isArray(v) ? v.join('、') : String(v || '');
    return String(v == null ? '' : v);
}

/** 生成单个角色的机器段（当前值 + 评述） */
export function buildCharBlock(name, profile) {
    const fields = activeFields(profile);
    const lines = [];
    fields.forEach((f) => {
        const cell = (profile.stats || {})[f.id];
        const val = cell ? fmtVal(f, cell) : '';
        if (!val) return;                    // 没值就不写（避免教 AI 编造）
        const c = cell.comment ? '（' + cell.comment + '）' : '';
        lines.push(f.label + ': ' + val + c);
    });
    if (!lines.length) return '';
    return '<nsfw name="' + name + '">' + NL + lines.join(NL) + NL + '</nsfw>';
}

/** 生成"协议说明 + 字段清单"，让 AI 知道该怎么写 */
export function buildProtocolDoc(profile) {
    const fields = activeFields(profile);
    const labels = fields.map((f) => f.label).join(' · ');
    const descLabels = NSFW_DESC_FIELDS.map((d) => d.label).join(' · ');
    return [
        '【输出格式（必须照做）】',
        '在正文最后追加两段，不要改动正文本身：',
        '<nsfw name="角色名">',
        '字段: 值（一句官能评述）',
        '...</nsfw>',
        '<nsfwdesc name="角色名">',
        '精神·他人视线: ...',
        '</nsfwdesc>',
        '机器段字段清单：' + labels,
        '官能段字段清单：' + descLabels,
        '规则：每个字段都要写；值必须与评述一致；官能段写"外人眼里此刻的样子"，要色色的打量，不要写剧情推进。'
    ].join(NL);
}

/** 其余角色的一行摘要 */
export function buildSummaryLine(name, profile) {
    const g = (id) => {
        const c = (profile.stats || {})[id];
        return c ? String(c.value) : '-';
    };
    return '- ' + name + '：理智' + g('sanity') + ' / 配合' + g('compliance') + ' / 欲望' + g('libido') + '（最近登场）';
}

/**
 * 主注入：返回要插进提示词的整段文本。
 * @param {string} chatId
 * @param {{fullCount?:number}} opts
 */
export function buildInjection(chatId, opts) {
    const s = _getSettings() || {};
    if (!s.nsfwEnabled) return '';
    const { bucket } = nsfwBucket(chatId);
    const names = (bucket.order || []).filter((n) => bucket.chars[n]);
    if (!names.length) return '';
    const fullCount = Math.max(1, Math.min(3, Number((opts && opts.fullCount) || s.nsfwFullCount || 2)));
    let full = names.slice(-fullCount);
    if (bucket.pin && bucket.chars[bucket.pin]) {
        full = [bucket.pin].concat(full.filter((n) => n !== bucket.pin)).slice(0, fullCount);
    }
    const others = names.filter((n) => full.indexOf(n) < 0);

    const rules = (Array.isArray(s.nsfwRules) && s.nsfwRules.length ? s.nsfwRules : NSFW_DEFAULT_RULES)
        .filter((r) => r && r.enabled !== false && r.text)
        .map((r) => '- ' + r.text);

    const parts = [];
    parts.push('【状态栏 · 更新规则】');
    parts.push(rules.join(NL));
    parts.push('');
    parts.push('【CURRENT STATE】');
    full.forEach((n) => {
        const b = buildCharBlock(n, bucket.chars[n]);
        if (b) parts.push(b);
    });
    if (others.length) {
        parts.push('【其余角色（只需在剧情涉及他们时才更新）】');
        others.forEach((n) => parts.push(buildSummaryLine(n, bucket.chars[n])));
    }
    parts.push('');
    parts.push(buildProtocolDoc(bucket.chars[full[0]] || { sex: 'female' }));
    return parts.join(NL);
}

/* ────────────────────────── 展示 ────────────────────────── */

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rowHtml(f, cell) {
    if (!cell) return '';
    const val = fmtVal(f, cell);
    if (!val) return '';
    const c = cell.comment ? '<span class="yw-nsfw-c">' + esc(cell.comment) + '</span>' : '';
    if (f.type === 'num') {
        const n = Number(cell.value);
        const max = typeof f.max === 'number' ? f.max : 100;
        const pct = Math.max(0, Math.min(100, (n / max) * 100));
        return '<div class="yw-nsfw-row"><span class="k">' + esc(f.label) + '</span>'
            + '<span class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></span>'
            + '<span class="v">' + esc(val) + '</span>' + c + '</div>';
    }
    return '<div class="yw-nsfw-row"><span class="k">' + esc(f.label) + '</span>'
        + '<span class="t">' + esc(val) + '</span>' + c + '</div>';
}

/** 生成一条消息用的状态卡 DOM */
export function nsfwRenderCard(name, profile) {
    const wrap = document.createElement('div');
    wrap.className = 'yw-nsfw';
    wrap.setAttribute('data-char', name);
    const sexTxt = profile.sex === 'male' ? '男' : (profile.sex === 'other' ? '其他' : '女');
    const roleTxt = profile.role === 'top' ? '攻' : (profile.role === 'switch' ? '双' : '受');
    const g = (id) => ((profile.stats || {})[id] || {}).value;
    const head = document.createElement('div');
    head.className = 'yw-nsfw-head';
    head.innerHTML = '<span class="nm">' + esc(name) + '</span>'
        + '<span class="tag">' + roleTxt + '</span><span class="tag">' + sexTxt + '</span>'
        + '<span class="kv">理智 ' + esc(g('sanity') == null ? '-' : g('sanity')) + '</span>'
        + '<span class="kv">欲望 ' + esc(g('libido') == null ? '-' : g('libido')) + '</span>';
    wrap.appendChild(head);

    const body = document.createElement('div');
    body.className = 'yw-nsfw-body';
    const byGroup = {};
    activeFields(profile).forEach((f) => {
        const cell = (profile.stats || {})[f.id];
        if (!cell || !fmtVal(f, cell)) return;
        (byGroup[f.group] = byGroup[f.group] || []).push(rowHtml(f, cell));
    });
    GROUP_ORDER.forEach((grp) => {
        const rows = byGroup[grp];
        if (!rows || !rows.length) return;
        const d = document.createElement('details');
        d.className = 'yw-nsfw-grp';
        if (grp === '精神' || grp === '穿搭') d.open = true;
        d.innerHTML = '<summary>' + esc(grp) + ' <i>' + rows.length + '</i></summary>' + rows.join('');
        body.appendChild(d);
    });

    const view = NSFW_DESC_FIELDS.map((d) => (profile.desc && profile.desc[d.id] ? { label: d.label, text: profile.desc[d.id].text } : null)).filter(Boolean);
    if (view.length) {
        const box = document.createElement('div');
        box.className = 'yw-nsfw-view';
        box.innerHTML = '<div class="hd">他人视线</div>'
            + view.map((v) => '<div class="it"><span class="lbl">' + esc(v.label) + '</span>' + esc(v.text) + '</div>').join('');
        body.appendChild(box);
    }
    wrap.appendChild(body);
    return wrap;
}

/* ────────────────────────── 样式 ────────────────────────── */

const CSS = [
    '.yw-nsfw{margin:8px 0 10px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 16%,transparent);border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 3%,transparent);font-size:0.9em}',
    '.yw-nsfw-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent);background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 5%,transparent)}',
    '.yw-nsfw-head .nm{font-weight:700;letter-spacing:.5px}',
    '.yw-nsfw-head .tag{font-size:.78em;opacity:.75;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);border-radius:999px;padding:0 6px}',
    '.yw-nsfw-head .kv{margin-left:auto;font-size:.8em;opacity:.8}',
    '.yw-nsfw-head .kv+.kv{margin-left:8px}',
    '.yw-nsfw-body{padding:4px 8px 8px}',
    '.yw-nsfw-grp{margin:4px 0}',
    '.yw-nsfw-grp>summary{cursor:pointer;padding:4px 2px;font-size:.86em;opacity:.85;list-style:none}',
    '.yw-nsfw-grp>summary::-webkit-details-marker{display:none}',
    '.yw-nsfw-grp>summary>i{font-style:normal;opacity:.5;font-size:.85em}',
    '.yw-nsfw-row{display:flex;align-items:center;gap:6px;padding:2px 2px;line-height:1.45;flex-wrap:wrap}',
    '.yw-nsfw-row .k{flex:0 0 6.6em;opacity:.7;font-size:.86em}',
    '.yw-nsfw-row .bar{flex:0 0 5em;height:5px;border-radius:999px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 14%,transparent);overflow:hidden}',
    '.yw-nsfw-row .bar>i{display:block;height:100%;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 60%,transparent)}',
    '.yw-nsfw-row .v{flex:0 0 2.4em;text-align:right;font-variant-numeric:tabular-nums;font-size:.86em}',
    '.yw-nsfw-row .t{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}',
    '.yw-nsfw-row .yw-nsfw-c{flex:0 0 100%;padding-left:6.6em;opacity:.62;font-size:.84em;font-style:italic;overflow-wrap:anywhere}',
    '.yw-nsfw-row .yw-nsfw-c:only-child{padding-left:6.6em}',
    '.yw-nsfw-view{margin-top:6px;padding-top:6px;border-top:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 18%,transparent)}',
    '.yw-nsfw-view .hd{font-size:.8em;opacity:.6;margin-bottom:2px}',
    '.yw-nsfw-view .it{font-size:.86em;font-style:italic;opacity:.85;line-height:1.5;margin:2px 0}',
    '.yw-nsfw-view .it .lbl{font-style:normal;opacity:.6;margin-right:6px}',
    '@media (max-width:600px){.yw-nsfw-row .k{flex-basis:4.4em}.yw-nsfw-row .yw-nsfw-c{padding-left:4.4em}}'
].join('');

export function nsfwEnsureStyle() {
    try {
        if (document.getElementById('yw-nsfw-style')) return;
        const st = document.createElement('style');
        st.id = 'yw-nsfw-style';
        st.textContent = CSS;
        document.head.appendChild(st);
    } catch (e) { }
}

/* ────────────────────────── 消息挂载 ────────────────────────── */

/** 在消息下方画/更新状态卡（幂等：先删旧的） */
export function nsfwMountToMessage(messageId) {
    try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext ? window.SillyTavern.getContext() : null;
        const msg = ctx && ctx.chat ? ctx.chat[messageId] : null;
        if (!msg || msg.is_user || msg.is_system) return false;
        const chatId = nsfwChatId(ctx);
        const { bucket } = nsfwBucket(chatId);
        const names = (bucket.order || []).filter((n) => bucket.chars[n] && bucket.chars[n].updatedAt);
        if (!names.length) return false;

        const mesEl = document.querySelector('.mes[mesid="' + messageId + '"]');
        if (!mesEl) return false;
        nsfwEnsureStyle();
        mesEl.querySelectorAll('.yw-nsfw').forEach((n) => n.remove());

        // 只挂"本条消息里提到过"的角色；没有就挂最近更新的 1 个
        let show = names.filter((n) => String(msg.mes || '').includes(n));
        if (!show.length) show = [names[names.length - 1]];
        show.slice(0, 3).forEach((n) => {
            const card = nsfwRenderCard(n, bucket.chars[n]);
            const anchor = mesEl.querySelector('.mes_text') || mesEl;
            if (anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
            else mesEl.appendChild(card);
        });
        return true;
    } catch (e) { return false; }
}

/** 重渲染后补挂（swipe/编辑/切聊天时调用） */
export function nsfwReattachAll() {
    try {
        const nodes = document.querySelectorAll('#chat .mes[mesid]');
        nodes.forEach((el) => {
            const id = Number(el.getAttribute('mesid'));
            if (Number.isFinite(id)) nsfwMountToMessage(id);
        });
    } catch (e) { }
}
