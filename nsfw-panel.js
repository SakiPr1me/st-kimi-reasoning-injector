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
    /* 状态 */
    { id: 'stamina', group: '状态', label: '体力', type: 'num', min: 0, max: 100, core: true },
    { id: 'sanity', group: '状态', label: '理智', type: 'num', min: 0, max: 100, core: true },
    { id: 'libido', group: '状态', label: '欲望', type: 'num', min: 0, max: 100, core: true },
    { id: 'compliance', group: '状态', label: '配合度', type: 'num', min: 0, max: 100, core: true },
    { id: 'shame', group: '状态', label: '羞耻心', type: 'num', min: 0, max: 100, core: true },
    { id: 'menstrual', group: '状态', label: '生理周期', type: 'text', options: ['月经期', '卵泡期', '排卵期', '黄体期'], core: true },
    { id: 'eggState', group: '状态', label: '卵子状态', type: 'text', options: ['未成熟', '成熟待排', '已排出', '新一轮'], core: true },
    { id: 'milkMl', group: '胸', label: '积乳量', type: 'num', min: 0, max: 2000, core: true, ord: 0 },
    { id: 'voice', group: '状态', label: '发声状态', type: 'text', core: true },
    { id: 'brands', group: '状态', label: '心理烙印', type: 'list', core: true },
    { id: 'bottomline', group: '状态', label: '崩塌底线', type: 'text', core: false },
    { id: 'bladder', group: '状态', label: '尿意', type: 'num', min: 0, max: 100, core: false, core: true },
    { id: 'pain', group: '状态', label: '疼痛度', type: 'num', min: 0, max: 100, core: false, core: true },
    { id: 'exposure', group: '状态', label: '暴露度', type: 'num', min: 0, max: 100, core: false, core: true },
    { id: 'pregnancy', group: '状态', label: '怀孕状态', type: 'text', core: false },

    /* 体态 */
    { id: 'pose', group: '体态', label: '当前体位', type: 'text', core: true },
    { id: 'temp', group: '体态', label: '体温', type: 'text', core: true },
    { id: 'sweat', group: '体态', label: '出汗量', type: 'text', core: false, core: true },
    { id: 'organFlush', group: '体态', label: '器官充血', type: 'text', core: true },
    { id: 'wearLevel', group: '体态', label: '损耗度', type: 'text', core: true },
    { id: 'bodyMarks', group: '体态', label: '体表痕迹', type: 'list', core: true },
    { id: 'selfJuice', group: '体态', label: '自身体液', type: 'text', core: true },
    { id: 'extJuice', group: '体态', label: '外部液体', type: 'text', core: true },
    { id: 'belly', group: '体态', label: '腹部外观', type: 'text', core: true },

    /* 胸 */
    { id: 'nippleState', group: '胸', label: '乳头状态', type: 'text', core: true, ord: 60 },
    { id: 'areolaNow', group: '胸', label: '乳晕状态', type: 'text', core: true, ord: 70 },

    /* 穿搭 */
    { id: 'outer', group: '穿搭', label: '外衣', type: 'text', core: true },
    { id: 'inner', group: '穿搭', label: '内衣', type: 'text', core: true },
    { id: 'accessories', group: '穿搭', label: '配饰', type: 'list', core: true },
    { id: 'clothState', group: '穿搭', label: '衣物状态', type: 'text', core: false, core: true },
    { id: 'insertItem', group: '穿搭', label: '插入物', type: 'text', core: false, core: true },

    /* 前穴（女） */
    { id: 'vLoose', group: '前穴', label: '松弛度', type: 'text', sex: 'female', core: true, ord: 40 },
    { id: 'vDepthNow', group: '前穴', label: '当前深度（受撑）', type: 'num', min: 0, max: 100, unit: 'cm', sex: 'female', core: true, ord: 30 },
    { id: 'vulvaState', group: '前穴', label: '外阴状态', type: 'text', sex: 'female', core: true, ord: 80 },
    { id: 'cervixState', group: '前穴', label: '子宫口状态', type: 'text', sex: 'female', core: true, ord: 50, options: ['紧闭', '受迫变形', '微开', '全开'] },
    { id: 'vFluidMl', group: '前穴', label: '阴道液体量', type: 'num', min: 0, max: 2000, unit: 'ml', sex: 'female', core: true, ord: 60 },
    { id: 'vFluidKind', group: '前穴', label: '阴道液体种类', type: 'text', sex: 'female', core: true, ord: 61 },
    { id: 'uterusFluidMl', group: '前穴', label: '子宫液体量', type: 'num', min: 0, max: 2000, unit: 'ml', sex: 'female', core: true, ord: 70 },

    /* 后穴（男女通用） */
    { id: 'aLoose', group: '后穴', label: '松弛度', type: 'text', core: true, ord: 40 },
    { id: 'aDepthNow', group: '后穴', label: '当前深度（受撑）', type: 'num', min: 0, max: 100, unit: 'cm', core: true, ord: 30 },
    { id: 'aAnusState', group: '后穴', label: '肛门状态', type: 'text', core: true, ord: 80 },
    { id: 'colonState', group: '后穴', label: '结肠口状态', type: 'text', core: true, ord: 50, options: ['紧闭', '受迫变形', '微开', '全开'] },
    { id: 'aFluidMl', group: '后穴', label: '后穴液体量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 60 },
    { id: 'aFluidKind', group: '后穴', label: '后穴液体种类', type: 'text', core: true, ord: 61 },
    { id: 'keyPointState', group: '后穴', label: '后穴G点状态', type: 'text', core: false, ord: 70 },

    /* 开发 */
    { id: 'devMouthLv', group: '开发', label: '口·等级', type: 'num', min: 0, max: 10, core: true },
    { id: 'devMouthExp', group: '开发', label: '口·经验', type: 'text', core: true },
    { id: 'devMouthSense', group: '开发', label: '口·敏感度', type: 'text', core: true },
    { id: 'devMouthSkill', group: '开发', label: '口·技能', type: 'list', core: true },
    { id: 'devChestLv', group: '开发', label: '胸·等级', type: 'num', min: 0, max: 10, core: true },
    { id: 'devChestExp', group: '开发', label: '胸·经验', type: 'text', core: true },
    { id: 'devChestSense', group: '开发', label: '胸·敏感度', type: 'text', core: true },
    { id: 'devChestSkill', group: '开发', label: '胸·技能', type: 'list', core: true },
    { id: 'devFrontLv', group: '开发', label: '前·等级', type: 'num', min: 0, max: 10, core: true },
    { id: 'devFrontExp', group: '开发', label: '前·经验', type: 'text', core: true },
    { id: 'devFrontSense', group: '开发', label: '前·敏感度', type: 'text', core: true },
    { id: 'devFrontSkill', group: '开发', label: '前·技能', type: 'list', core: true },
    { id: 'devBackLv', group: '开发', label: '后·等级', type: 'num', min: 0, max: 10, core: true },
    { id: 'devBackExp', group: '开发', label: '后·经验', type: 'text', core: true },
    { id: 'devBackSense', group: '开发', label: '后·敏感度', type: 'text', core: true },
    { id: 'devBackSkill', group: '开发', label: '后·技能', type: 'list', core: true },
    { id: 'devDeepLv', group: '开发', label: '最深·等级', type: 'num', min: 0, max: 10, core: true },
    { id: 'devDeepExp', group: '开发', label: '最深·经验', type: 'text', core: true },
    { id: 'devDeepSense', group: '开发', label: '最深·敏感度', type: 'text', core: true },
    { id: 'devDeepSkill', group: '开发', label: '最深·技能', type: 'list', core: true },

    /* 经验（永久统计） */
    { id: 'expMasturbation', group: '经验', label: '自慰次数', type: 'num', min: 0, max: 99999, core: true },
    { id: 'expPartners', group: '经验', label: '经验人数', type: 'num', min: 0, max: 999, core: true },
    { id: 'expLastPartner', group: '状态', label: '最近性经验对象', type: 'text', core: true },
    { id: 'expOralCount', group: '经验', label: '口交次数', type: 'num', min: 0, max: 99999, core: true },
    { id: 'expVCount', group: '经验', label: '前穴次数', type: 'num', min: 0, max: 99999, core: true },
    { id: 'expVCumCount', group: '经验', label: '前穴中出次数', type: 'num', min: 0, max: 99999, core: true },
    { id: 'expACount', group: '经验', label: '后穴次数', type: 'num', min: 0, max: 99999, core: true },
    { id: 'expACumCount', group: '经验', label: '后穴中出次数', type: 'num', min: 0, max: 99999, core: true },

    /* 本次性爱（并入状态页底部） */
    { id: 'condom', group: '状态', label: '避孕套', type: 'text', options: ['是', '否'], core: true , hideInCard: true},
    { id: 'condomCount', group: '状态', label: '避孕套个数', type: 'num', min: 0, max: 99, core: true , hideInCard: true},
    { id: 'cumV', group: '状态', label: '前穴中出', type: 'text', options: ['是', '否'], core: true , hideInCard: true},
    { id: 'orgasmCount', group: '状态', label: '高潮次数', type: 'num', min: 0, max: 999, core: true , hideInCard: true},
    { id: 'scene', group: '状态', label: '互动情境', type: 'text', core: true , hideInCard: true},

    /* ── 静态参数（建档填一次；不要求 AI 每轮输出） ── */
    { id: 'stChestSize', group: '静态-胸部', tab: '胸', label: '罩杯/胸肌', type: 'text', static: true, after: 'milkMl', ord: 10 },
    { id: 'stChestShape', group: '静态-胸部', tab: '胸', label: '胸型', type: 'text', static: true, after: 'milkMl', ord: 20 },
    { id: 'stNippleLen', group: '静态-胸部', tab: '胸', label: '乳头长', type: 'text', static: true, after: 'nippleState', ord: 30 },
    { id: 'stNippleWid', group: '静态-胸部', tab: '胸', label: '乳头宽', type: 'text', static: true, after: 'nippleState', ord: 40 },
    { id: 'stAreolaDia', group: '静态-胸部', tab: '胸', label: '乳晕直径', type: 'text', static: true, after: 'areolaNow', ord: 50 },
    { id: 'stClitLen', group: '静态-前穴', tab: '前穴', label: '阴蒂长度', type: 'text', sex: 'female', static: true, after: 'vulvaShape', ord: 90 },
    { id: 'stClitSize', group: '静态-前穴', tab: '前穴', label: '阴蒂大小', type: 'text', sex: 'female', static: true, after: 'vulvaShape', ord: 100 },
    { id: 'stPenisLen', group: '静态-后穴', tab: '后穴', label: '阴茎长度', type: 'text', sex: 'male', static: true },
    { id: 'stPenisGirth', group: '静态-后穴', tab: '后穴', label: '阴茎粗度', type: 'text', sex: 'male', static: true },
    { id: 'stPenisLook', group: '静态-后穴', tab: '后穴', label: '阴茎外观', type: 'text', sex: 'male', static: true },
    { id: 'stGDepth', group: '静态-前穴', tab: '前穴', label: 'G点深度', type: 'text', sex: 'female', static: true, after: 'gState', ord: 10 },
    { id: 'stCervixDepth', group: '静态-前穴', tab: '前穴', label: '子宫口深度', type: 'text', sex: 'female', static: true, after: 'cervixState', ord: 20 },
    { id: 'stKeyDepth', group: '静态-后穴', tab: '后穴', label: '前列腺深度', type: 'text', static: true, after: 'keyPointState', ord: 10 },
    { id: 'stColonDepth', group: '静态-后穴', tab: '后穴', label: '结肠口深度', type: 'text', static: true, after: 'colonState', ord: 20 },
    { id: 'stEroZones', group: '静态-其他', tab: '状态', label: '敏感带', type: 'list', static: true },
    { id: 'stMouthDepth', group: '静态-其他', tab: '状态', label: '口部耐受深度', type: 'text', static: true },
    { id: 'stFavPose', group: '静态-其他', tab: '状态', label: '惯用体位', type: 'text', static: true },
    { id: 'stMarks', group: '静态-其他', tab: '状态', label: '特殊标记', type: 'list', static: true }
];

/** 他人视线（只展示，不进数值）—— v2 去掉「精神」 */
export const NSFW_DESC_FIELDS = [
    { id: 'viewBody', label: '体态·他人视线' },
    { id: 'viewOutfit', label: '穿搭·他人视线' },
    { id: 'viewChannel', label: '通道·他人视线' }
];

/** 内置更新规则（v2：含周期/避孕/经验永久统计） */
export const NSFW_DEFAULT_RULES = [
    { id: 'r1', text: '数值只在剧情事件发生时变化；单轮单字段变化不超过 15（重大剧情除外），禁止跳变。', enabled: true, builtin: true },
    { id: 'r2', text: '理智：随快感/羞辱事件下降，休息安抚回升；降到 0 进入崩溃态（写进发声状态与心理烙印）。', enabled: true, builtin: true },
    { id: 'r3', text: '配合度：只能缓慢上升，单轮不超过 5，且必须与剧情一致。', enabled: true, builtin: true },
    { id: 'r4', text: '羞耻心：需要“适应类事件”才能下降；欲望随刺激上升、随冷却下降。', enabled: true, builtin: true },
    { id: 'r5', text: '生理周期按「月经期 → 卵泡期 → 排卵期 → 黄体期」循环推进，只在时间推进时换期，不要随意跳期。', enabled: true, builtin: true },
    { id: 'r6', text: '怀孕几率由插件按「周期 + 是否避孕 + 前穴是否中出」即时计算（基础很低：月经1/卵泡2/排卵10/黄体4，中出+6，避孕×0.05），你不要自己写这个值；但要把「生理周期 / 卵子状态 / 避孕套 / 前穴中出」三个输入写准。', enabled: true, builtin: true },
    { id: 'r7', text: '经验是永久统计：自慰/口交/前穴/前穴中出/后穴/后穴中出 只增不减；「经验人数」在首次与新的对象发生关系时 +1；「最近性经验对象」写最近一次的对象名。', enabled: true, builtin: true },
    { id: 'r8', text: '状态页底部的「本次」字段（避孕套、避孕套个数、前穴中出、高潮次数、互动情境）每轮按本轮实际发生重写；换场景时清零。', enabled: true, builtin: true },
    { id: 'r9', text: '液体分别记录：阴道内 / 子宫内 / 后穴内，各自写 ml 与液体种类（精液/爱液/肠液/润滑油）；单个通道不得超过静态的「极限容纳量」，超了改写为外溢。', enabled: true, builtin: true },
    { id: 'r10', text: '深度不得超过静态的「极限拉伸深度」；超了写“撕裂/极限”。', enabled: true, builtin: true },
    { id: 'r11', text: '所有数值钳制在字段范围内；缺字段沿用上一轮的值，不要重置。', enabled: true, builtin: true },
    { id: 'r12', text: '每个字段的值后面必须跟一句官能评述（括号内），评述要与数值一致；评述只描述身体与感官，不写剧情推进。', enabled: true, builtin: true },
    { id: 'r13', text: '积乳：泌乳体质每轮按时间与刺激累积「积乳量 ml」，被吸出/挤出后下降；未到量时写胀痛感。', enabled: true, builtin: true },
    { id: 'r14', text: '卵子状态随生理周期变化：卵泡期「未成熟」、排卵期「成熟待排/已排出」、黄体期「已排出·黄体期」、月经期「新一轮」。', enabled: true, builtin: true },
    { id: 'r15', text: '开发度按五个部位（口/胸/前/后/最深）各写四列：等级（1-10）、经验（当前/下一级）、敏感度、已解锁技能（逗号分隔）；没有的技能不要编。', enabled: true, builtin: true },
    { id: 'r16', text: '【档案·固定】里的静态参数（罩杯、乳头尺寸、乳晕、通道常态深度、极限拉伸深度、子宫口深度、前列腺深度、结肠口深度、阴蒂/阴茎尺寸）由用户建档填写，你只读不改，也不要每轮重复输出。', enabled: true, builtin: true },
    { id: 'r17', text: '「松弛度」「子宫口状态」「结肠口状态」这三个字段的括号评述里要写一句白话描写（原来单独的外口描写/子宫口描写已并入这里）。', enabled: true, builtin: true },
    { id: 'r18', text: '只有本场景里【被插入 / 承受方】的角色才输出 <nsfw> 状态块；纯插入方不要输出（除非他同时也被插入）。输出时在标签上写属性：<nsfw name="角色名" sex="f|m" role="bottom">。', enabled: true, builtin: true },
    { id: 'r19', text: '每轮都要完整输出状态块里的全部字段（缺的写“未知”），不要省略、不要只报变化。', enabled: true, builtin: true }
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

const GROUP_ORDER = ['状态', '体态', '穿搭', '胸', '前穴', '后穴', '开发', '经验'];

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

export function parseMachineBody(body) {
    const out = {};
    const all = nsfwAllFields();
    String(body || '').split(/\r?\n/).forEach((line) => {
        const s = line.trim();
        if (!s) return;
        /* 新格式：id=值|评述（id 唯一，最稳） */
        const eq = s.indexOf('=');
        if (eq > 0) {
            const key = s.slice(0, eq).trim().split(/\s+/)[0];
            const rest = s.slice(eq + 1).trim();
            const f = all.find((x) => x.id === key) || fieldByLabel(key);
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

export function nsfwParse(text) {
    const src = String(text || '');
    const chars = {};
    const ensure = (name) => {
        const n = String(name || '').trim();
        if (!chars[n]) chars[n] = { machine: {}, desc: {} };
        return chars[n];
    };
    const reM = /<nsfw\s+([^>]*)>([\s\S]*?)<\/nsfw>/gi;
    const attrOf = (raw, key) => {
        const mm = new RegExp(key + '\\s*=\\s*"([^"]*)"', 'i').exec(raw || '');
        return mm ? mm[1] : '';
    };
    let m;
    while ((m = reM.exec(src))) {
        const attrs = m[1] || '';
        const name = attrOf(attrs, 'name').trim();
        if (!name) continue;
        const c = ensure(name);
        c.meta = {
            sex: attrOf(attrs, 'sex'),
            role: attrOf(attrs, 'role')
        };
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

export function nsfwApply(chatId, parsed) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
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
                if (!allow[id]) return;   /* ★只收当前启用字段（非核心字段即使 AI 写了也不入库） */
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

export function buildCharBlock(name, profile) {
    const fields = activeFields(profile);
    const lines = [];
    fields.forEach((f) => {
        const cell = (profile.stats || {})[f.id]
            || ((profile.static || {})[f.id] ? { value: profile.static[f.id], comment: '' } : null);
        const val = cell ? fmtVal(f, cell) : '';
        if (!val) return;
        lines.push(f.id + '=' + val);
    });
    if (!lines.length) return '';
    const preg = calcPregRisk(profile);
    if (preg.why) lines.push('怀孕几率: ' + preg.risk + '%（插件计算，不要改写）');
    return '<nsfw name="' + name + '">' + NL + lines.join(NL) + NL + '</nsfw>';
}

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
        '体态·他人视线: ...',
        '</nsfwdesc>',
        '机器段字段清单：' + labels,
        '官能段字段清单：' + descLabels,
        '规则：每个字段都要写；值必须与评述一致；官能段写“外人眼里此刻的样子”，要色色的打量，不要写剧情推进。'
    ].join(NL);
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

/** 一页的行：动态行 + 静态档案按 after 内联（不再单列「档案·固定」） */
function tabRowsHtml(profile, grp, byGroup) {
    const rows = [];
    activeFields(profile).forEach((f) => {
        if (f.hideInCard) return;
        if (f.group !== grp) return;
        const cell = (profile.stats || {})[f.id];
        if (!cell || !fmtVal(f, cell)) return;
        rows.push({ ord: (typeof f.ord === 'number' ? f.ord : 9999), html: rowHtml(f, cell) });
    });
    rows.sort((a, b) => a.ord - b.ord);
    if (!rows.length) return '';
    return '<table class="yw-nsfw-tbl"><thead><tr><th>字段</th><th>值</th><th>评述</th></tr></thead><tbody>'
        + rows.map((r) => r.html).join('') + '</tbody></table>';
}
/** 开发度表格：部位 × 等级/经验/敏感度/技能 */
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
        const skill = cell('dev' + pp[1] + 'Skill');
        if (!lv && !exp && !sense && !skill) return '';
        return '<tr><th>' + esc(pp[0]) + '</th><td class="lv">' + esc(lv) + '</td><td>' + esc(exp) + '</td><td>' + esc(sense) + '</td><td class="sk">' + esc(skill) + '</td></tr>';
    }).join('');
    if (!rows) return '';
    return '<table class="yw-nsfw-dev"><thead><tr><th>部位</th><th>等级</th><th>经验</th><th>敏感度</th><th>技能</th></tr></thead><tbody>' + rows + '</tbody></table>';
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
        return '<tr class="yw-nsfw-row"' + idAttr + '><th class="k">' + esc(f.label) + '</th>'
            + '<td class="v"><span class="num">' + esc(val) + (f.unit ? ' ' + esc(f.unit) : '') + '</span><span class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></span></td>'
            + c + '</tr>';
    }
    return '<tr class="yw-nsfw-row"' + idAttr + '><th class="k">' + esc(f.label) + '</th>'
        + '<td class="t">' + esc(val) + '</td>' + c + '</tr>';
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
        const html = (grp === '开发') ? devTableHtml(profile) : tabRowsHtml(profile, grp, byGroup);
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
        set('menstrual', '排卵期', '这几天最危险'); set('eggState', '成熟待排', '就等这一下');
        set('voice', '说不出完整句子', '只剩气音'); set('brands', '已适应常态腹胀、把痛爱视为快感', '');
        set('expLastPartner', '陆沉', '今晚');
        set('pose', '后入式跪趴', '腰塌成一道弧'); set('temp', '38.2℃', '烫得吓人');
        set('sweat', '薄汗', '背上一层水光'); set('organFlush', '阴道壁、子宫口、后穴 · 充血红肿', '一碰就抽');
        set('wearLevel', '肌肉酸痛 / 下肢无力', ''); set('bodyMarks', '腰侧指印、后颈咬痕', '还没消');
        set('selfJuice', '泉涌', '大腿内侧一片湿滑'); set('extJuice', '淋漓沾黏', '混着白浊往下淌');
        set('belly', '微微鼓起', '摸上去沉甸甸');
        set('outer', '开档薄纱情趣睡衣', '贴在汗湿的皮肤上'); set('inner', '无', '早就没穿了');
        set('accessories', '猫尾肛塞', '还在震');
        set('milkMl', '38', '积了快一天'); set('nippleState', '硬挺凸起 · 极度敏感', '碰一下整个人就弹');
        set('areolaNow', '茶托状微扩 · 色沉加深', '');
        set('vDepthNow', '18', '被撑到极限'); set('vLoose', '松弛失守 · 合不拢', '肌肉失去弹性，从外面能看到内壁');
        set('cervixState', '未开 · 充血红肿', '每一下都撞在那'); set('vFluidMl', '58', '顺着大腿往下'); set('vFluidKind', '爱液', '');
        set('uterusFluidMl', '0', '还没灌进去'); set('vulvaState', '小阴唇微张外翻 · 暗红充血', '被磨得发亮');
        set('aDepthNow', '14', '被塞子撑开'); set('aLoose', '微张 · 边缘泛红', '拔出来会合不拢');
        set('colonState', '紧闭', '顶到就发酸'); set('aFluidMl', '32', '被堵在里面'); set('aFluidKind', '润滑油', '');
        set('keyPointState', '前列腺 · 充血', '一顶就腿软'); set('aAnusState', '紧致 · 边缘泛红', '');
        set('devMouthLv', '3', ''); set('devMouthExp', '180/300', ''); set('devMouthSense', '中等', ''); set('devMouthSkill', '深喉、抗呕吐', '');
        set('devChestLv', '4', ''); set('devChestExp', '420/500', ''); set('devChestSense', '极度敏感', ''); set('devChestSkill', '常态激凸、微量溢乳', '');
        set('devFrontLv', '4', ''); set('devFrontExp', '380/500', ''); set('devFrontSense', '高', ''); set('devFrontSkill', '主动收缩绞缠', '');
        set('devBackLv', '2', ''); set('devBackExp', '150/300', ''); set('devBackSense', '中', ''); set('devBackSkill', '—', '');
        set('devDeepLv', '2', ''); set('devDeepExp', '120/300', ''); set('devDeepSense', '内脏级酸胀', ''); set('devDeepSkill', '—', '');
        set('expMasturbation', '24', '最近很频繁'); set('expPartners', '3', ''); set('expOralCount', '31', '很熟练');
        set('expVCount', '17', ''); set('expVCumCount', '9', ''); set('expACount', '6', ''); set('expACumCount', '2', '');
        set('condom', '否', '没用'); set('condomCount', '0', ''); set('cumV', '是', '全灌进去了');
        set('orgasmCount', '3', '这次已经三次'); set('scene', '浴殿 · 后入持续顶弄', '');
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
    '.yw-nsfw{margin:8px 0 10px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 16%,transparent);border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 3%,transparent);font-size:0.9em}',
    '.yw-nsfw-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent);background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 5%,transparent)}',
    '.yw-nsfw-head .nm{font-weight:700;letter-spacing:.5px}',
    '.yw-nsfw-head .tag{font-size:.78em;opacity:.75;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);border-radius:999px;padding:0 6px}',
    '.yw-nsfw-head .kv{margin-left:auto;font-size:.8em;opacity:.8}',
    '.yw-nsfw-head .kv+.kv{margin-left:8px}',
    '.yw-nsfw-head .yw-nsfw-preg{opacity:.95;font-weight:600}',
    '.yw-nsfw-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px 0}',
    '.yw-nsfw-tab{font:inherit;font-size:.8em;padding:2px 9px;border-radius:999px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 22%,transparent);background:transparent;color:inherit;opacity:.62;cursor:pointer}',
    '.yw-nsfw-tab.on{opacity:1;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent);border-color:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 45%,transparent)}',
    '.yw-nsfw-panels{padding:4px 8px 8px}',
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
    '.yw-nsfw-tbl tbody th{width:8.6em;font-weight:500;opacity:.75;padding:3px 4px;text-align:left;white-space:nowrap;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 8%,transparent)}',
    '.yw-nsfw-tbl td{padding:3px 4px;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 8%,transparent);vertical-align:middle}',
    '.yw-nsfw-tbl td.v{width:7.2em;white-space:nowrap}',
    '.yw-nsfw-tbl td.v .num{font-variant-numeric:tabular-nums;margin-right:6px}',
    '.yw-nsfw-tbl td.v .bar{display:inline-block;width:3.6em;height:5px;border-radius:999px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 14%,transparent);overflow:hidden;vertical-align:middle}',
    '.yw-nsfw-tbl td.v .bar>i{display:block;height:100%;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 60%,transparent)}',
    '.yw-nsfw-tbl td.t{max-width:12em;overflow-wrap:anywhere}',
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

/* ────────────────────────── 消息挂载 ────────────────────────── */

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

        let show = names.filter((n) => String(msg.mes || '').includes(n));
        if (!show.length) show = [names[names.length - 1]];
        show.slice(0, 3).forEach((n) => {
            const card = nsfwRenderCard(n, bucket.chars[n]);
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
