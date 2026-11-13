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
    { id: 'sweat', group: '身体', label: '出汗量', type: 'text', core: true, ord: 22 },
    { id: 'stamina', group: '状态', label: '体力', type: 'num', min: 0, max: 100, core: true, ord: 15 },
    { id: 'bladder', group: '状态', label: '尿意', type: 'num', min: 0, max: 100, core: true, ord: 20 },
    { id: 'pain', group: '状态', label: '疼痛度', type: 'num', min: 0, max: 100, core: true, ord: 25 },
    { id: 'sanity', group: '状态', label: '理智', type: 'num', min: 0, max: 100, core: true, ord: 30 },
    { id: 'libido', group: '状态', label: '欲望', type: 'num', min: 0, max: 100, core: true, ord: 35 },
    { id: 'compliance', group: '状态', label: '配合度', type: 'num', min: 0, max: 100, core: true, ord: 40 },
    { id: 'shame', group: '状态', label: '羞耻心', type: 'num', min: 0, max: 100, core: true, ord: 45 },
    { id: 'menstrual', group: '状态', label: '生理周期', type: 'text', options: ['月经期', '卵泡期', '排卵期', '黄体期'], core: true, ord: 50 },
    { id: 'menstrualNextDays', group: '状态', label: '距下阶段天数', type: 'num', unit: '天', noBar: true, core: true, ord: 55 },
    { id: 'pregnancy', group: '状态', label: '怀孕状态', type: 'text', core: true, ord: 60 },
    { id: 'expLastPartner', group: '状态', label: '最近性经验对象', type: 'text', core: true, ord: 65 },
    { id: 'condom', group: '状态', label: '使用避孕套', type: 'text', options: ['是', '否'], core: true, ord: 70 },
    { id: 'condomCount', group: '状态', label: '避孕套携带数', type: 'num', min: 0, max: 99, core: true, ord: 75, noBar: true },
    { id: 'cumV', group: '状态', label: '前穴中出', type: 'text', options: ['是', '否'], core: true, ord: 80 },

    /* ── 第二组：身体 ── */
    { id: 'orgasmCount', group: '身体', label: '当天高潮次数', type: 'num', min: 0, max: 99, core: true, ord: 5, noBar: true },
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
    { id: 'milkMl', group: '胸', label: '积乳量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 5, noBar: true },
    { id: 'stChestSize', group: '胸', label: '罩杯/胸肌', type: 'text', core: true, ord: 10 },
    { id: 'stChestShape', group: '胸', label: '胸型', type: 'text', core: true, ord: 15 },
    { id: 'stNippleLen', group: '胸', label: '乳头长', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 20, noBar: true },
    { id: 'stNippleWid', group: '胸', label: '乳头宽', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 25, noBar: true },
    { id: 'stAreolaDia', group: '胸', label: '乳晕直径', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 30, noBar: true },

    /* ── 第五组：前穴 ── */
    { id: 'stClitLen', group: '前穴', label: '阴蒂长度', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 5, noBar: true },
    { id: 'stClitSize', group: '前穴', label: '阴蒂宽', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 10, noBar: true },
    { id: 'clitState', group: '前穴', label: '阴蒂状态', type: 'text', core: true, ord: 15 },
    { id: 'vulvaState', group: '前穴', label: '外阴状态', type: 'text', options: ['紧闭缝隙状', '微张含水状', '红肿充血状', '外翻花唇状', '高度肿胀肉丘', '洞开大张状', '常态半张开'], core: true, ord: 20 },
    { id: 'vLoose', group: '前穴', label: '松弛度', type: 'num', min: 0, max: 100, core: true, ord: 25 },
    { id: 'vLastIn', group: '前穴', label: '最近进入（人/物）', type: 'text', core: true, ord: 27 },
    { id: 'vLastLen', group: '前穴', label: '其长度', type: 'num', unit: 'cm', noBar: true, core: true, ord: 28 },
    { id: 'stGDepth', group: '前穴', label: 'G点深度', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 30, noBar: true },
    { id: 'stCervixDepth', group: '前穴', label: '子宫口深度', type: 'num', min: 0, max: 20, unit: 'cm', core: true, ord: 35, noBar: true },
    { id: 'cervixState', group: '前穴', label: '子宫口状态', type: 'text', options: ['下沉', '紧闭', '红肿', '受迫位移', '微开', '全开'], core: true, ord: 40 },
    { id: 'vFluidKind', group: '前穴', label: '阴道液体种类', type: 'text', core: true, ord: 45 },
    { id: 'vFluidMl', group: '前穴', label: '阴道液体量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 50, noBar: true },
    { id: 'uterusFluidMl', group: '前穴', label: '子宫液体量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 55, noBar: true },

    /* ── 第六组：后穴 ── */
    { id: 'stPenisLen', group: '后穴', label: '阴茎长度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 5, noBar: true },
    { id: 'stPenisGirth', group: '后穴', label: '阴茎粗度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 10, noBar: true },
    { id: 'stPenisLook', group: '后穴', label: '阴茎外观', type: 'text', core: true, ord: 15 },
    { id: 'aAnusState', group: '后穴', label: '肛门状态', type: 'text', options: ['竖状裂缝', '菊花状', '幼圆环状', '红肿肉环状', '高度肿胀肉丘', '洞开状', '常态半张开'], core: true, ord: 20 },
    { id: 'keyPointState', group: '后穴', label: '后穴G点状态', type: 'text', core: true, ord: 25 },
    { id: 'aLoose', group: '后穴', label: '松弛度', type: 'num', min: 0, max: 100, core: true, ord: 30 },
    { id: 'aLastIn', group: '后穴', label: '最近进入（人/物）', type: 'text', core: true, ord: 32 },
    { id: 'aLastLen', group: '后穴', label: '其长度', type: 'num', unit: 'cm', noBar: true, core: true, ord: 33 },
    { id: 'stKeyDepth', group: '后穴', label: '前列腺深度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 35, noBar: true },
    { id: 'stColonDepth', group: '后穴', label: '结肠口深度', type: 'num', min: 0, max: 40, unit: 'cm', core: true, ord: 40, noBar: true },
    { id: 'colonState', group: '后穴', label: '结肠口状态', type: 'text', options: ['紧闭', '受迫变形', '微开', '全开'], core: true, ord: 45 },
    { id: 'aFluidKind', group: '后穴', label: '后穴液体种类', type: 'text', core: true, ord: 50 },
    { id: 'aFluidMl', group: '后穴', label: '后穴液体量', type: 'num', min: 0, max: 2000, unit: 'ml', core: true, ord: 55, noBar: true },

    /* ── 第八组：开发（永久统计，评述写身体变化） ── */
    { id: 'expMasturbation', group: '开发', label: '自慰次数', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 5, noBar: true },
    { id: 'expPartners', group: '开发', label: '经验人数', type: 'num', min: 0, max: 99, core: true, unit: '人', ord: 10, noBar: true },
    { id: 'expOralCount', group: '开发', label: '口交', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 15, noBar: true },
    { id: 'expBlowjobCount', group: '开发', label: '被口交', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 20, noBar: true },
    { id: 'expChestCount', group: '开发', label: '胸部行为', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 25, noBar: true },
    { id: 'expVCount', group: '开发', label: '前穴', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 30, noBar: true },
    { id: 'expVCumCount', group: '开发', label: '前穴中出', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 35, noBar: true },
    { id: 'expACount', group: '开发', label: '后穴', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 40, noBar: true },
    { id: 'expACumCount', group: '开发', label: '后穴中出', type: 'num', min: 0, max: 999, core: true, unit: '次', ord: 45, noBar: true },
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
    { id: 'viewExpression', label: '表情·他人视线' },
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

/** ★W385：一次性清掉旧「示例填充」留下的假角色（名字是写死的那个），避免悬浮条/名册里继续看到 */
export function nsfwPurgeLegacyDemo() {
    try {
        if (localStorage.getItem('kimi_nsfw_purged_v2') === '1') return;
        const all = readAll();
        let changed = false;
        const BAD = ['夏海'];   /* 夏海 */
        Object.keys(all).forEach((k) => {
            const b = all[k];
            if (!b || !b.chars) return;
            BAD.forEach((n) => {
                if (b.chars[n]) { delete b.chars[n]; changed = true; }
                if (Array.isArray(b.order) && b.order.indexOf(n) >= 0) { b.order = b.order.filter((x) => x !== n); changed = true; }
            });
        });
        if (changed) writeAll(all);
        localStorage.setItem('kimi_nsfw_purged_v2', '1');
    } catch (e) { }
}
export function nsfwInit(opts) {
    try {
        if (opts && typeof opts.t === 'function') _t = opts.t;
        if (opts && typeof opts.getSettings === 'function') _getSettings = opts.getSettings;
        if (opts && typeof opts.save === 'function') _save = opts.save;
        /* ★W315：样式随模块一起装（不必等第一张卡挂上才隐藏楼层里的块） */
        const st0 = _getSettings && _getSettings();
        if (st0) nsfwEnsureStyle();
        nsfwPurgeLegacyDemo();
    } catch (e) { }
}

function readAll() {
    // An unreadable/corrupt store is not an empty database. Let write callers fail closed.
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw == null ? {} : JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('状态档案无法读取');
    return obj;
}
function writeAll(obj) {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
    return true;
}

let _stateWriteQueue = Promise.resolve();
function stateWrite(task) {
    const pending = _stateWriteQueue.then(task);
    _stateWriteQueue = pending.catch(() => {});
    return pending;
}
function stateContext() {
    return window.SillyTavern && window.SillyTavern.getContext ? window.SillyTavern.getContext() : null;
}
function stateError(error) { return String(error && error.message || error || '保存失败'); }
function stateNotice(error) {
    try { if (typeof toastr !== 'undefined') toastr.error(stateError(error), '状态保存失败，输入已保留'); } catch (e) {}
}
function chatIdentity(chatId) {
    const ctx = stateContext();
    if (!ctx || !Array.isArray(ctx.chat) || String(chatId || nsfwChatId(ctx)) !== nsfwChatId(ctx)) throw new Error('聊天已切换，请重新打开');
    return { ctx, chat: ctx.chat, chatId: nsfwChatId(ctx), groupId: ctx.groupId, characterId: ctx.characterId };
}
function sameChat(source) {
    const now = stateContext();
    return !!now && nsfwChatId(now) === source.chatId && now.chat === source.chat
        && now.groupId === source.groupId && now.characterId === source.characterId;
}
/** Immutable source token: chat + message object + slot + active branch + exact original text. */
export function nsfwFloorSource(chatId, mesid) {
    const source = chatIdentity(chatId);
    const msg = source.chat[mesid];
    if (!msg) throw new Error('楼层已不存在');
    return Object.assign(source, { mesid: Number(mesid), msg, text: String(msg.mes || ''),
        swipeId: msg.swipe_id, swipes: msg.swipes,
        swipeText: Array.isArray(msg.swipes) ? msg.swipes[msg.swipe_id] : undefined });
}
function sameFloor(source, text) {
    return sameChat(source) && source.chat[source.mesid] === source.msg
        && source.msg.swipe_id === source.swipeId && source.msg.swipes === source.swipes
        && String(source.msg.mes || '') === (text === undefined ? source.text : text)
        && (!Array.isArray(source.swipes) || source.swipes[source.swipeId] === (text === undefined || source.swipeText == null ? source.swipeText : text));
}
function patchValue(patches, obj, key, next) {
    if (obj[key] !== next) patches.push({ obj, key, old: obj[key], next });
}
function applyPatches(patches) { patches.forEach(p => { p.obj[p.key] = p.next; }); }
function undoPatches(patches) {
    patches.forEach(p => { if (p.obj[p.key] === p.next) p.obj[p.key] = p.old; });
}
function patchFloor(source, next) {
    const patches = [];
    patchValue(patches, source.msg, 'mes', next);
    if (Array.isArray(source.swipes) && typeof source.swipeId === 'number' && source.swipes[source.swipeId] != null) {
        patchValue(patches, source.swipes, source.swipeId, next);
    }
    return patches;
}
/** ctx.saveChat swallows HTTP errors on ST. Observe only the exact save request we staged.
 * No request is sent here; the original host saver still owns headers/compression/endpoint.
 * Missing ACK (including a swallowed error, timeout, unsupported compressed body) fails closed. */
async function saveChatAcknowledged(source, patches) {
    if (!sameChat(source) || typeof source.ctx.saveChat !== 'function') throw new Error('聊天已切换或宿主无法保存');
    // Match the fields this transaction owns, not unrelated message metadata or other floors.
    const targets = source.chat.map((msg, mesid) => ({ msg, mesid })).flatMap(({ msg, mesid }) => {
        const own = (patches || []).filter(p => p.obj === msg || p.obj === msg.swipes);
        if (!own.length) return [];
        return [{ mesid, swipeId: msg.swipe_id, mes: String(msg.mes || ''), fields: own.map(p => ({ swipe: p.obj !== msg, key: p.key, value: p.obj[p.key] })) }];
    });
    const hostFetch = window.fetch;
    if (typeof hostFetch !== 'function') throw new Error('无法确认宿主保存结果');
    const ctx = source.ctx;
    const isGroup = !!ctx.groupId;
    const fileName = isGroup ? source.chatId : (ctx.characters && ctx.characters[ctx.characterId] && ctx.characters[ctx.characterId].chat || source.chatId);
    const avatar = !isGroup && ctx.characters && ctx.characters[ctx.characterId] && ctx.characters[ctx.characterId].avatar;
    let ack = false, possiblySaved = false;
    const observations = [];
    const observer = async function (input, init) {
        try {
            const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
            if (url.origin !== window.location.origin || url.pathname !== (isGroup ? '/api/chats/group/save' : '/api/chats/save') || url.search) {
                return hostFetch.call(window, input, init);
            }
        } catch (error) { return hostFetch.call(window, input, init); }
        const observation = (async () => {
            try {
                const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
                if (url.origin !== window.location.origin || url.pathname !== (isGroup ? '/api/chats/group/save' : '/api/chats/save') || url.search) return false;
                const request = new Request(input instanceof Request ? input.clone() : url.href, init);
                if (request.method !== 'POST') return false;
                let bytes = await request.clone().arrayBuffer();
                if (request.headers.get('Content-Encoding') === 'gzip') {
                    bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
                }
                const body = JSON.parse(new TextDecoder().decode(bytes));
                if (isGroup ? String(body.id) !== source.chatId : body.file_name !== fileName || (avatar && body.avatar_url !== avatar)) return false;
                return Array.isArray(body.chat) && targets.length > 0 && targets.every(target => {
                    const msg = body.chat[target.mesid + 1];
                    return msg && msg.swipe_id === target.swipeId && String(msg.mes || '') === target.mes
                        && target.fields.every(field => (field.swipe ? msg.swipes && msg.swipes[field.key] : msg[field.key]) === field.value);
                });
            } catch (e) { return false; }
        })();
        const resultPromise = hostFetch.call(window, input, init);
        // Observe response errors immediately, but never await a foreign request to finish.
        resultPromise.catch(() => {});
        const checked = (async () => {
            try {
                if (!(await observation)) return;
                const response = await resultPromise;
                if (!response.ok) return;
                possiblySaved = true;
                let result;
                try { result = await response.clone().json(); } catch (e) { return; }
                if (!result || result.error || result.ok === false || (result.result !== undefined && result.result !== 'ok')) return;
                if (result.ok !== true && (isGroup || result.result !== 'ok')) return;
                ack = true;
            } catch (e) {}
        })();
        observations.push(checked);
        return resultPromise;
    };
    window.fetch = observer;
    try {
        const result = await ctx.saveChat();
        await Promise.all(observations);
        if (result === false || !ack) throw new Error('宿主没有确认聊天保存成功');
    } catch (error) {
        if (possiblySaved) error.statePossiblySaved = true;
        throw error;
    } finally {
        if (window.fetch === observer) window.fetch = hostFetch;
    }
}
async function commitState(source, patches, valid, persist) {
    if (!sameChat(source) || !valid(false)) throw new Error('来源已变化，请重新打开后保存');
    // Read before touching memory; a failed read must never become an empty-store overwrite.
    readAll();
    if (!patches.length) { if (persist) persist(); return; }
    applyPatches(patches);
    let saved = false;
    try {
        await saveChatAcknowledged(source, patches);
        saved = true;
        if (!sameChat(source) || !valid(true)) throw new Error('保存期间聊天或分支已变化，请重新打开');
        if (persist) persist();
    } catch (error) {
        undoPatches(patches);
        // A failed derived-cache write after an ACK needs a compensating host save.
        if (saved || error.statePossiblySaved) {
            if (!sameChat(source)) throw new Error(stateError(error) + '；原聊天可能已保存，请重新读取核对');
            try { await saveChatAcknowledged(source, patches); }
            catch (rollbackError) { throw new Error(stateError(error) + '；回滚保存未确认，请重新读取核对'); }
        }
        throw error;
    }
}
async function emitStateSaved(source, mesid) {
    if (!sameChat(source)) return;
    for (const type of ['MESSAGE_EDITED', 'MESSAGE_UPDATED']) {
        try { if (source.ctx.eventSource && source.ctx.eventTypes && source.ctx.eventTypes[type]) await source.ctx.eventSource.emit(source.ctx.eventTypes[type], mesid); }
        catch (e) { /* Persistence succeeded; a subscriber cannot undo the saved transaction. */ }
    }
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
    try {
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
    } catch (error) { stateNotice(error); return null; }
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
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        bucket.order = (bucket.order || []).filter((n) => n !== name);
        delete bucket.chars[name];
        all[key] = bucket;
        writeAll(all);
        return true;
    } catch (error) { stateNotice(error); return false; }
}
/** ★W470：一键删掉这个角色在当前聊天里的所有 NSFW 快照（所有楼层、所有 swipe 分支）。
    只删 `<nsfw>`/`data-nsfw` 块本身，楼层正文不动；删完重建 bucket 并移除名册记录。 */
export async function nsfwDeleteCharBlocks(chatId, name) {
    let source;
    try { source = chatIdentity(chatId); } catch (error) { return { ok: false, removed: 0, error: stateError(error) }; }
    return stateWrite(async () => {
        try {
            if (!sameChat(source)) throw new Error('聊天已切换，请重新打开');
            const target = String(name || '').trim();
            if (!target) throw new Error('角色名为空');
            const patches = [], snapshots = new Set(), identities = [];
            const scrub = (text, floor, slot) => {
                const original = String(text == null ? '' : text);
                let out = original;
                const blocks = nsfwTextBlocks(original).filter(b => b.name === target);
                // Machine + desc wrappers on the same branch represent one snapshot.
                if (blocks.length) snapshots.add(floor + ':' + slot);
                for (let i = blocks.length - 1; i >= 0; i--) out = out.slice(0, blocks[i].openStart) + out.slice(blocks[i].closeEnd);
                return out;
            };
            source.chat.forEach((msg, floor) => {
                if (!msg) return;
                identities.push({ msg, floor, swipeId: msg.swipe_id, swipes: msg.swipes });
                const active = Array.isArray(msg.swipes) && typeof msg.swipe_id === 'number' && msg.swipes[msg.swipe_id] === msg.mes ? msg.swipe_id : 'mes';
                if (typeof msg.mes === 'string') patchValue(patches, msg, 'mes', scrub(msg.mes, floor, active));
                if (Array.isArray(msg.swipes)) msg.swipes.forEach((text, slot) => {
                    if (typeof text === 'string') patchValue(patches, msg.swipes, slot, scrub(text, floor, slot));
                });
            });
            const valid = applied => identities.every(i => source.chat[i.floor] === i.msg && i.msg.swipe_id === i.swipeId && i.msg.swipes === i.swipes)
                && patches.every(p => p.obj[p.key] === (applied ? p.next : p.old));
            const { bucket } = nsfwBucket(source.chatId);
            const hasRoster = Object.prototype.hasOwnProperty.call(bucket.chars, target) || bucket.order.includes(target);
            if (!patches.length && !hasRoster) return { ok: true, removed: 0 };
            await commitState(source, patches, valid, () => persistChatBucket(source.chatId, source.chat, target));
            if (sameChat(source)) {
                try { document.querySelectorAll('.yw-nsfw').forEach(n => n.remove()); nsfwReattachAll(); nsfwMountSender(); } catch (e) {}
            }
            return { ok: true, removed: snapshots.size };
        } catch (error) { return { ok: false, removed: 0, error: stateError(error) }; }
    });
}

/* ────────────────────────── 字段工具 ────────────────────────── */

const GROUP_ORDER = ['状态', '身体', '穿搭', '胸', '前穴', '后穴', '开发'];

/** 全部字段 = 内置 + 用户自定义（settings.nsfwCustomFields） */
let _fieldsCache = { key: '', arr: null };
export function nsfwAllFields() {
    let custom = [];
    let overrides = {};
    try {
        const st = _getSettings() || {};
        custom = Array.isArray(st.nsfwCustomFields) ? st.nsfwCustomFields : [];
        overrides = (st.nsfwFieldOverrides && typeof st.nsfwFieldOverrides === 'object') ? st.nsfwFieldOverrides : {};
    } catch (e) { custom = []; overrides = {}; }
    /* ★W414：字段注册表缓存（key 含指南版本/自定义字段/覆盖） */
    const key0 = _guideRev + '|' + JSON.stringify(custom) + '|' + JSON.stringify(overrides);
    if (_fieldsCache.arr && _fieldsCache.key === key0) return _fieldsCache.arr;
    const base = NSFW_FIELDS.map((f) => {
        const ov = overrides[f.id];
        return ov ? Object.assign({}, f, ov) : f;
    });
    const out0 = base.concat(custom.map((f) => Object.assign({ custom: true, core: true }, f)));
    _fieldsCache = { key: key0, arr: out0 };
    return out0;
}

/* ───────── ★W390：字段字典（只从预设的 <nsfw_state_guide> 里抽，指南说了算） ───────── */
const GUIDE_STORE_KEY = 'kimi_nsfw_guide_v1';
let _guideCache = null;
let _guideRev = 0;

/** ★W432：标签清洗 —— 去掉范围/单位/说明，但保留「（男）/（女）」这种性别后缀 */
function labelClean(t) {
    let s0 = String(t == null ? '' : t);
    const keep = [];
    s0 = s0.replace(/[（(]\s*([男女])\s*[)）]/g, (m, g) => { keep.push(g); return '\u0001' + (keep.length - 1) + '\u0002'; });
    s0 = s0.replace(/[\[【][^\]】]*[\]】]/g, ' ')
        .replace(/[（(][^)）]*[)）]/g, ' ')
        .replace(/\s*列表.*$/, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    s0 = s0.replace(/\u0001(\d+)\u0002/g, (m, i) => '（' + keep[Number(i)] + '）');
    return s0;
}

/** 解析 guide 里的 `<nsfw>…</nsfw>` 字段表；`[多行]` 标记多行、`[a/b]` 记选项、行序记 ord */
export function nsfwParseGuide(text) {
    const map = {};
    try {
        const src = String(text || '');
        const bodyM = /<nsfw>([\s\S]*?)<\/nsfw>/i.exec(src);
        const body = bodyM ? bodyM[1] : src;
        let group = '';
        let ord = 0;
        body.split(/\r?\n/).forEach((line) => {
            const s0 = String(line || '').trim();
            if (!s0) return;
            const gm = /^【([^】]{1,40})】$/.exec(s0);   /* ★W437b：组名别卡 12 字 */
            if (gm) { group = gm[1]; return; }
            const eq = s0.indexOf('=');
            if (eq <= 0) return;
            const head = s0.slice(0, eq).trim();
            const m = /^([A-Za-z][A-Za-z0-9_]*)\s+(\S[\s\S]*)$/.exec(head);
            if (!m) return;
            const id = m[1];
            const rest = m[2];
            const brackets = [];
            let bm;
            const reB = /[\[【]([^\]】]*)[\]】]/g;
            while ((bm = reB.exec(rest))) brackets.push(bm[1]);
            const parens = [];
            let pm;
            const reP = /[（(]([^)）]*)[)）]/g;
            while ((pm = reP.exec(rest))) parens.push(pm[1]);
            const label = labelClean(rest);
            let min = null, max = null, multi = false, options = null;
            brackets.forEach((b) => {
                const bs = String(b);
                if (bs.indexOf('多行') >= 0) multi = true;
                const rm = /^\s*(-?\d+(?:\.\d+)?)\s*[-~～—]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(bs);
                if (rm) { min = Number(rm[1]); max = Number(rm[2]); return; }
                if (/[\/／]/.test(bs)) {
                    const ops = bs.split(/[\/／]/).map((x) => x.trim()).filter(Boolean);
                    if (ops.length >= 2) options = ops;
                }
            });
            if (/多行/.test(rest)) multi = true;
            let unit = '';
            const isUnit = (u) => /^[A-Za-z%‰℃]+$/.test(u)
                || /^(次|人|天|个|岁|分|秒|小时|毫升|厘米|克|公斤|升|倍|日|周|月|点|级|颗|片|滴)$/.test(u)
                || (u.length <= 3 && !/[男女列表多行说明可选分隔每行单位值]/.test(u));
            for (let i = parens.length - 1; i >= 0; i--) {
                const u = String(parens[i] || '').trim();
                if (u && isUnit(u)) { unit = u; break; }
            }
            ord++;
            map[id] = { id: id, label: label || id, group: group || '其它', min: min, max: max, unit: unit, multi: multi, options: options, ord: ord };
        });
    } catch (e) { }
    return map;
}

/** 更新字典；返回 true=真的变了（内容没变返回 false，方便防抖重画） */
export function nsfwSetGuide(text, opts) {
    try {
        const map = nsfwParseGuide(text);
        const ids = Object.keys(map);
        const usable = ids.filter((k) => k !== 'name' && k !== 'snapTime');
        if (!usable.length) {
            /* ★W413：预设里明确读到「有标签但没有字段」⇒ 清空。请求期没带指南（opts 不带 authoritative）⇒ 保持旧字典。 */
            if (opts && opts.authoritative) { nsfwClearGuide(); return true; }
            return false;
        }
        const sig = ids.map((k) => [k, map[k].label, map[k].min, map[k].max, map[k].unit, map[k].group, map[k].multi ? 1 : 0, (map[k].options || []).join('/'), map[k].ord].join('~')).join('|');
        if (_guideCache && _guideCache.sig === sig) return false;
        _guideCache = { sig: sig, map: map };
        _guideRev++;
        try { localStorage.setItem(GUIDE_STORE_KEY, JSON.stringify(_guideCache)); } catch (e1) { }
        return true;
    } catch (e) { return false; }
}
/** 清空字典（切到没有指南的预设 / 指南被删空） */
export function nsfwClearGuide() {
    try { _guideCache = { sig: '', map: {} }; _guideRev++; localStorage.removeItem(GUIDE_STORE_KEY); } catch (e) { }
}

function nsfwGuide() {
    if (_guideCache) return _guideCache.map;
    try {
        const j = JSON.parse(localStorage.getItem(GUIDE_STORE_KEY) || 'null');
        if (j && j.map && typeof j.map === 'object') { _guideCache = j; return j.map; }
    } catch (e) { }
    return {};
}
/** 指南里这个 ID 怎么写的（没有就 null） */
export function nsfwGuideMeta(id) {
    const m = nsfwGuide();
    return m[String(id || '')] || null;
}
export function nsfwGuideCount() {
    try { return Object.keys(nsfwGuide()).length; } catch (e) { return 0; }
}
export function nsfwGuideRev() { return _guideRev; }
/** 指南是否可用（至少 3 个展示字段；否则回退内置表，绝不清空卡） */
function guideUsable() {
    try {
        const m = nsfwGuide();
        let n = 0;
        Object.keys(m).forEach((k) => { if (k !== 'name' && k !== 'snapTime') n++; });
        return n >= 3;
    } catch (e) { return false; }
}
/** ★W413：字段取舍的唯一判据 —— 指南可用时，只放行指南里有的 ID；指南不可用则全放行（兼容） */
export function nsfwGuideAllows(id) {
    const s0 = String(id || '');
    if (s0 === 'name' || s0 === 'snapTime') return true;
    try {
        if (!guideUsable()) return true;
        return !!nsfwGuide()[s0];
    } catch (e) { return true; }
}
/** 指南里的分组顺序（分页按它排） */
export function nsfwGuideGroups() {
    const out = [];
    try {
        const m = nsfwGuide();
        Object.keys(m).forEach((k) => {
            const g = String(m[k].group || '').trim();
            if (g && out.indexOf(g) < 0) out.push(g);
        });
    } catch (e) { }
    return out;
}
/** ★W413：从当前预设直接读指南（不靠请求）；返回是否变化，调用方负责重画 */
export function nsfwGuideSyncFromPreset(opts) {
    const out = { found: false, changed: false, count: 0 };
    try {
        if (typeof window === 'undefined' || !window.SillyTavern || !window.SillyTavern.getContext) return out;
        const ctx = window.SillyTavern.getContext();
        const cs = ctx && ctx.chatCompletionSettings;
        if (!cs || !Array.isArray(cs.prompts)) return out;
        let enabled = null;
        try {
            const pm = (typeof window.promptManager !== 'undefined') ? window.promptManager : null;
            const gid = (pm && pm.activeCharacter && pm.activeCharacter.id != null) ? pm.activeCharacter.id : 100001;
            const grp = (cs.prompt_order || []).find((g) => String(g.character_id) === String(gid));
            if (grp && Array.isArray(grp.order)) {
                const set0 = new Set();
                grp.order.forEach((o) => { if (o && o.enabled !== false) set0.add(o.identifier); });
                if (set0.size) enabled = set0;
            }
        } catch (e) { }
        const hits = cs.prompts.filter((p) => p && typeof p.content === 'string' && p.content.indexOf('<nsfw_state_guide>') >= 0 && (!enabled || enabled.has(p.identifier)));
        if (!hits.length) {
            /* 只有「预设已水合」（enabled 足够多）+ 明确是预设切换事件，才敢清空；启动初期不动缓存 */
            if (opts && opts.allowClear && enabled) { nsfwClearGuide(); out.changed = true; }   /* ★W437：读不到启用组时宁可不清理，别把指南清丢 */
            return out;
        }
        out.found = true;
        out.changed = nsfwSetGuide(hits.map((p) => p.content).join(String.fromCharCode(10)), { authoritative: true });
        out.count = nsfwGuideCount();
    } catch (e) { }
    return out;
}
/** 画卡用的「视图字段」：指南里写了中文/范围/单位/选项/顺序，以指南为准 */
function viewField(f) {
    if (!f) return f;
    const g = nsfwGuideMeta(f.id);
    if (!g) return f;
    const o = Object.assign({}, f);
    if (g.label) o.label = g.label;
    if (g.group) o.group = g.group;   /* ★W411：分页归属也跟指南（把 stPenis* 挪到【身体】就真的去身体页） */
    if (g.unit) o.unit = g.unit;
    if (typeof g.min === 'number') o.min = g.min;
    if (typeof g.max === 'number') o.max = g.max;
    if (g.options && g.options.length) o.options = g.options.slice();   /* ★W413：选项列表也跟指南 */
    if (typeof g.ord === 'number') o.ord = g.ord;                    /* ★W413：行序跟指南 */
    return o;
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
/** ★W468：前穴那组字段只属于女性；男性不显示/不发送/不自动补。 */
const NSFW_FRONT_IDS = ['stClitLen', 'stClitSize', 'clitState', 'vulvaState', 'vLoose', 'vLastIn', 'vLastLen', 'stGDepth', 'stCervixDepth', 'cervixState', 'vFluidKind', 'vFluidMl', 'uterusFluidMl'];
/** ★W468：从数值判断——有阴茎、且没有前穴结构值 ⇒ 男性。
    只认结构值（阴蒂/深度/液体），不认 vulvaState/cervixState 这种「状态选项」，
    这样以前被下拉误写进去的「紧闭缝隙状/下沉」不会反过来把它判成女性。 */
function nsfwSexFromStats(stats, fallback) {
    try {
        const get = (id) => {
            const c = (stats || {})[id];
            return (c && typeof c === 'object') ? c.value : c;
        };
        const pl = get('stPenisLen');
        const pn = Number(String(pl == null ? '' : pl).replace(/[^0-9.\-]/g, ''));
        if (!(pn > 0)) return fallback;
        const marks = ['stClitLen', 'stClitSize', 'clitState', 'stGDepth', 'stCervixDepth', 'vFluidKind', 'vFluidMl', 'uterusFluidMl'];
        const femaleMark = marks.some((id) => { const v = get(id); return v != null && String(v).trim() && !isNaish(v); });
        return femaleMark ? fallback : 'male';
    } catch (e) { return fallback; }
}
function nsfwProfileSex(profile) {
    const sex = String((profile && profile.sex) || 'female');
    if (sex === 'other') return sex;   /* 其他/双性保留用户选择 */
    /* ★W468：有阴茎且没有前穴结构值 ⇒ 按男性处理（即使旧档案默认/手填成 female）。
       这样老聊天里「白辙」这种从来没手填过性别的男性，也不会再冒出前穴。 */
    const inferred = nsfwSexFromStats(profile && profile.stats, sex);
    if (inferred === 'male') return 'male';
    return sex;
}
/** ★W468c：撤销隐藏 —— 作者明确“我没叫你隐藏”。前穴页（含清单外 vOrgasmCount）照常显示，
    只保留「N/A/空值不被下拉/补全改写」的保护。 */
function nsfwMaleFrontHidden() { return false; }
function activeFields(profile) {
    const sex = (profile && profile.sex) || 'female';
    return nsfwAllFields().filter((f) => (!f.sex || f.sex === sex) && nsfwGuideAllows(f.id));   /* ★W413：指南删掉的字段不再上卡/发送/入库；★W468c 前穴不再按性别隐藏 */
}
/** ★W418：N/A 是「没有/不适用」——卡片上要显示 N/A，但不参与数值、不发送 */
function isNaish(v) {
    const t = String(v == null ? '' : v).trim();
    return /^(n\/a|n\.a\.?|na|—|-)$/i.test(t);
}
/** ★W391：模型偷懒写「未知」时，不拿它覆盖已有的值（相当于没更新） */
function isUnknownish(v) {
    const t = String(v == null ? '' : v).trim();
    return /^(未知|不详|未记录|无记录|未知。?|不清楚|不确定|n\/a|n\.a\.?|na)$/i.test(t);
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
        else if (phase.indexOf('排卵') >= 0) base = 20;   /* ★W358：排卵期基准 15→20 */
        else if (phase.indexOf('黄体') >= 0) base = 4;
        const condomOn = /是|有/.test(val('condom'));
        const cumFlag = /是|有/.test(val('cumV'));
        /* ★W357：作者删了「中出」条目 ⇒ 只看戴套 + 体内精液量；子宫里的精液权重远高于阴道 */
        let vMl = 0, uMl = 0;
        if (!condomOn) {
            if (String(val('vFluidKind')).indexOf('精液') >= 0) vMl = Number(val('vFluidMl')) || 0;
            uMl = Number(val('uterusFluidMl')) || 0;
        }
        let bonus = 0;
        if (!condomOn) {
            /* ★W359：作者定稿档位（子宫按 30/80/200 跳档，阴道每 20ml 加一档） */
            if (uMl > 200) bonus += 30;
            else if (uMl > 80) bonus += 14;
            else if (uMl > 30) bonus += 9;
            else if (uMl > 0) bonus += 4;
            if (vMl > 160) bonus += 10;
            else if (vMl > 140) bonus += 9;
            else if (vMl > 120) bonus += 8;
            else if (vMl > 100) bonus += 7;
            else if (vMl > 80) bonus += 6;
            else if (vMl > 60) bonus += 5;
            else if (vMl > 40) bonus += 4;
            else if (vMl > 20) bonus += 3;
            else if (vMl > 0) bonus += 2;
        }
        let risk = base + bonus;
        if (condomOn) risk = base * 0.05;
        risk = Math.max(0, Math.min(100, Math.round(risk)));
        let why = phase || '周期未知';
        why += condomOn ? ' · 戴套（风险极低）' : (' · 未戴 · 子宫内 ' + Math.round(uMl) + 'ml · 阴道内 ' + Math.round(vMl) + 'ml');
        if (!condomOn && cumFlag) why += ' · 前穴中出';
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
/** ★W446e：批量写卡片编辑 —— 只落盘一次（逐个字段写会把整份档案反复序列化，长聊天直接卡死） */
export function nsfwSetStats(chatId, name, edits) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const rec = bucket.chars[name];
        if (!rec) return false;
        let touched = false;
        (Array.isArray(edits) ? edits : []).forEach((e0) => {
            const id = String((e0 && e0.id) || '');
            if (!id) return;
            if (e0.static) {
                if (!rec.static) rec.static = {};
                const value = String(e0.value == null ? '' : e0.value);
                if (String(rec.static[id] == null ? '' : rec.static[id]) === value) return;
                rec.static[id] = value;
                touched = true;
                return;
            }
            const oldCell = (rec.stats || {})[id] || (rec.extra || {})[id] || {};
            const oldValue = Array.isArray(oldCell.list) ? oldCell.list.join('\n') : String(oldCell.value == null ? '' : oldCell.value);
            if (oldValue === String(e0.value == null ? '' : e0.value) && String(oldCell.comment || '') === String(e0.comment || '')) return;
            const f = fieldById(id);
            if (!f) {
                if (!rec.extra || !rec.extra[id]) return;
                const cell = rec.extra[id];
                cell.value = e0.value; cell.comment = e0.comment || '';
                if (Array.isArray(cell.list)) cell.list = String(e0.value).split(/\r?\n/).filter(Boolean);
                touched = true;
                return;
            }
            rec.stats[id] = { value: e0.value, comment: e0.comment || '', at: Date.now() };
            touched = true;
        });
        if (touched) { rec.updatedAt = Date.now(); all[key] = bucket; writeAll(all); }
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
    let bar = s.indexOf('|');
    const barF = s.indexOf('｜');
    if (bar < 0 || (barF >= 0 && barF < bar)) bar = barF;   /* ★W404：全角竖线也算 */
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
    /* ★W442：行首 token 先按 ID 认 —— 「松弛度」这类中文名前穴/后穴各有一条，
       不能被后面的 label 兜底先抢到第一条（作者实测：前穴/后穴的松弛度显示反了）。 */
    const headTok = key.split(/\s+/)[0];
    if (headTok && headTok !== key) {
        const fHead = all.find((x) => x.id === headTok);
        if (fHead) return fHead;
    }
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
    /* ★W344：AI 写错一点也尽量认 —— 标签归一化（去空格/符号）后相等或互相包含，唯一命中才采用 */
    const norm = (t) => String(t || '').replace(/[s·:：()（）[]【】,，、]/g, '');
    const kn = norm(key);
    if (kn.length >= 2) {
        let cands = all.filter((x) => norm(x.label) === kn);
        if (!cands.length) cands = all.filter((x) => norm(x.label).indexOf(kn) >= 0 || kn.indexOf(norm(x.label)) >= 0);
        if (cands.length === 1) return cands[0];
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
            /* ★W409：AI 抄回来的「怀孕几率」行是插件卡片专用显示行 —— 不接收（否则会污染 pregnancy 字段） */
            if (/怀孕(几率|概率)|几率/.test(rawKey)) return;
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
    const re = new RegExp('(?:^|[\\s<])' + key + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
    const m = re.exec(String(raw || ''));
    return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : (m[3] || '')) : '';
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
        /* ★W334：作者新格式 —— 名字是块内第一行 `name 角色名 = 夏茵`，先抽出来（不当字段、也不让行首推断误认成 "name"） */
        let body0 = String(m[2] || '');
        const nmLine = /^[ \t]*name(?:[ \t]*[一-龥]+)?[ \t]*[=:：][ \t]*(.+)$/mi.exec(body0);
        const nmInline = nmLine ? String(nmLine[1] || '').trim() : '';
        if (nmLine) body0 = body0.replace(nmLine[0], '');
        let name = (attrOf(attrs, 'data-name') || attrOf(attrs, 'name') || nmInline).trim();
        /* ★W318：<nsfw> 没写 name ⇒ 从第一行「角色名 字段 = 值」里认 */
        if (!name) {
            const nm = /^[ \t]*([^\s=:：]{1,12})[ \t]+\S+[ \t]*=/m.exec(body0);
            if (nm && nm[1] !== 'name') {
                name = nm[1];
                /* ★W405：把行首那个名字摘掉（否则 `夏茵 stamina = 42` 会把「夏茵」当成一个自定义字段） */
                const lineStart0 = nm.index;
                const line0 = body0.slice(lineStart0);
                body0 = body0.slice(0, lineStart0) + line0.replace(name, '');
            }
        }
        if (!name) continue;
        const c = ensure(name);
        c.meta = {
            sex: attrOf(attrs, 'data-sex') || attrOf(attrs, 'sex'),
            role: attrOf(attrs, 'data-role') || attrOf(attrs, 'role')
        };
        /* ★W431：他人视线不再写死三条 —— 所有 `view* 中文 = 值` 都收（加/删/改名/换序全跟指南） */
        let body = String(body0).split(/\r?\n/).map((line) => {
            const m0 = /^[ \t]*(?:[^=:：]{1,12}[ \t]+)?(view[A-Za-z0-9_]*)([^=:：]*)[=:：]\s*(.*)$/i.exec(line.trim());   /* ★W437：空值也吃掉 */
            if (!m0) return line;
            const id0 = m0[1];
            let lab0 = String(m0[2] || '').trim();
            if (!lab0) {
                const d0 = NSFW_DESC_FIELDS.find((x) => x.id === id0) || {};
                lab0 = d0.label || (nsfwGuideMeta(id0) || {}).label || id0;
            }
            c.desc[id0] = { text: String(m0[3] || '').trim(), label: lab0 };
            return '';
        }).join('\n');
        const parsed = parseMachineBody(body);
        Object.keys(parsed).forEach((k) => { c.machine[k] = parsed[k]; });
        /* ★W374：清单之外的自定义字段也吞进来（形如 `foo 中文 = 值|评述` 或 `foo=值`） */
        try {
            const known = {};
            const allF = nsfwAllFields();
            allF.forEach((f) => { known[f.id] = 1; });
            let curGroup = '';   /* ★W416：块里没写【组】就留空，渲染时回落到指南的组 */
            let lastMulti = '';   /* ★W427：上一个多行字段，续行挂到它下面 */
            body.split(/\r?\n/).forEach((ln) => {
                const s2 = ln.trim();
                const gm = /^【([^】]{1,40})】$/.exec(s2);   /* ★W437b：组名别卡 12 字 */
                if (gm) { curGroup = gm[1]; lastMulti = ''; return; }
                if (!s2) return;
                if (s2.indexOf('=') < 0) {
                    /* ★W427：多行字段的续行（AI 常只给第一行带 ID，后面直接 [时间] …） */
                    if (lastMulti && c.extra && c.extra[lastMulti]) {
                        const ent0 = c.extra[lastMulti];
                        if (!Array.isArray(ent0.list)) ent0.list = String(ent0.value || '').trim() ? [String(ent0.value)] : [];
                        ent0.list.push(s2);
                    }
                    return;
                }
                const key0 = s2.slice(0, s2.indexOf('=')).trim().split(/\s+/)[0];
                if (!/^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\-\u4e00-\u9fa5]*$/.test(key0)) return;
                if (known[key0] || /^(name|snapTime)$/.test(key0)) { lastMulti = ''; return; }
                const rest0 = s2.slice(s2.indexOf('=') + 1).trim();
                const sv = rest0 ? splitValueComment(rest0) : { value: '', comment: '' };   /* ★W425：空值也收（卡片显示占位） */
                const empty0 = !rest0;
                /* ★W387：用户自己加的字段也认 `[0-100](单位)` —— 有范围就画条，中文名照用 */
                const head0 = s2.slice(0, s2.indexOf('=')).trim();
                let tail0 = head0.slice(key0.length).trim();
                let min0 = null, max0 = null, unit0 = '';
                const rm0 = /[\[【]\s*(-?\d+(?:\.\d+)?)\s*[-~～—]\s*(-?\d+(?:\.\d+)?)\s*[\]】]/.exec(tail0);
                if (rm0) { min0 = Number(rm0[1]); max0 = Number(rm0[2]); tail0 = tail0.replace(rm0[0], ' '); }
                const um0 = /[（(]\s*([^)）]{0,10})\s*[)）]/.exec(tail0);
                if (um0) { unit0 = um0[1].trim(); tail0 = tail0.replace(um0[0], ' '); }
                const label0 = tail0.replace(/[\[【][^\]】]*[\]】]/g, ' ').replace(/[（(][^)）]*[)）]/g, ' ').replace(/\s+/g, ' ').trim();
                if (!c.extra) c.extra = {};
                /* ★W391：指南里标了 [多行]（或写在【近况】组里）的字段，同一 ID 出现多次 = 多条 */
                const gm0 = nsfwGuideMeta(key0) || {};
                const multi0 = !!gm0.multi || (!gm0.id && curGroup === '近况');   /* ★W437：指南声明过的字段只认 [多行] */
                lastMulti = multi0 ? key0 : '';   /* ★W427 */
                const prev0 = c.extra[key0];
                if (prev0 && multi0) {
                    const arr0 = Array.isArray(prev0.list) ? prev0.list.slice() : (String(prev0.value || '').trim() ? [String(prev0.value)] : []);
                    arr0.push(String(sv.value));
                    prev0.list = arr0;
                    if (!prev0.comment) prev0.comment = sv.comment;
                    return;
                }
                c.extra[key0] = { value: sv.value, comment: sv.comment, group: curGroup, label: (gm0.label || label0 || key0), min: (typeof min0 === 'number' ? min0 : (typeof gm0.min === 'number' ? gm0.min : null)), max: (typeof max0 === 'number' ? max0 : (typeof gm0.max === 'number' ? gm0.max : null)), unit: (gm0.unit || unit0 || ''), list: multi0 ? (String(sv.value || '').trim() ? [String(sv.value)] : []) : undefined, empty: empty0 ? true : undefined };   /* ★W441：只有续行时 list 从空开始 */
            });
        } catch (e0) { }
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
        const mm = parsed.chars[name].machine || {};
        if (!bucket.chars[name]) {
            const meta = (parsed.chars[name] && parsed.chars[name].meta) || {};
            const sexMeta = (meta.sex === 'm' || meta.sex === 'male') ? 'male' : (meta.sex === 'o' || meta.sex === 'other' ? 'other' : '');
            const sex = sexMeta || nsfwSexFromStats(mm, 'female');
            const role = (meta.role === 'top') ? 'top' : (meta.role === 'switch' ? 'switch' : 'bottom');
            bucket.chars[name] = { sex: sex, role: role, stats: {}, desc: {}, static: {}, updatedAt: 0 };
            if (bucket.order.indexOf(name) < 0) bucket.order.push(name);
        }
        const rec = bucket.chars[name];
        if (!rec.manual) {
            const merged = Object.assign({}, rec.stats || {});
            Object.keys(mm).forEach((id) => { merged[id] = { value: mm[id] && mm[id].value }; });
            const inferred = nsfwSexFromStats(merged, rec.sex || 'female');
            if (inferred === 'male' && rec.sex !== 'male') rec.sex = 'male';
        }
        const allow = {};
        activeFields(rec).forEach((f) => { allow[f.id] = 1; });
        Object.keys(mm).forEach((id) => {
            const f0 = fieldById(id);
            if (!f0) return;
            if (!allow[id]) return;   /* ★只收当前启用字段 */
            const f = viewField(f0);   /* ★W390：范围以指南为准 */
            const item = mm[id] || {};
            let value = item.value;
            /* ★W405：空值/纯空白 = 没更新（否则数值会被 Number('') 变成 0、文本被清空） */
            if (String(value == null ? '' : value).trim() === '') return;
            /* ★W420：是什么存什么 —— 未知/N/A/文本都按原文存（数值能解析就钳制，解析不了就存原文） */
            if (f.type === 'num') {
                const n = clampNum(f, value);
                if (n === null) { rec.stats[id] = { value: String(value), comment: item.comment || '', unknown: true, at: Date.now() }; return; }
                value = n;
            }
            if (f.type === 'list') {
                value = String(value || '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
            }
            rec.stats[id] = { value: value, comment: item.comment || '', at: Date.now() };
        });
        const dd = parsed.chars[name].desc || {};
        Object.keys(dd).forEach((id) => {
            if (!nsfwGuideAllows(id)) return;
            const dv = dd[id];
            const txt0 = (dv && typeof dv === 'object') ? String(dv.text || '') : String(dv || '');
            const lab0 = (dv && typeof dv === 'object') ? String(dv.label || '') : '';
            rec.desc[id] = { text: txt0, label: lab0, at: Date.now() };
        });
        /* ★W374：自定义字段一并落盘（原来的值沿用，新的覆盖） */
        const ex = parsed.chars[name].extra || {};
        Object.keys(ex).forEach((id) => {
            if (!nsfwGuideAllows(id)) return;   /* ★W413：指南里没有的自定义字段不再入库 */
            if (!rec.extra) rec.extra = {};
            const inc = ex[id] || {};
            const old = rec.extra[id] || {};
            if (Array.isArray(inc.list)) {
                /* ★W391：近况是累积的 —— 旧条目 + 本轮新条目，去重，只留最近 20 条 */
                const oldList = Array.isArray(old.list) ? old.list.slice() : (String(old.value || "").trim() ? [String(old.value)] : []);
                const merged = oldList.concat(inc.list.map(String)).filter((v) => String(v == null ? '' : v).trim()).filter((v, i, a) => a.indexOf(v) === i).slice(-20);   /* ★W441：空行不入列 */
                rec.extra[id] = { value: merged[0] || "", comment: inc.comment || old.comment || "", group: inc.group || old.group || "其它", label: inc.label || old.label || "", min: (typeof inc.min === "number" ? inc.min : (typeof old.min === "number" ? old.min : null)), max: (typeof inc.max === "number" ? inc.max : (typeof old.max === "number" ? old.max : null)), unit: inc.unit || old.unit || "", list: merged, at: Date.now() };
                return;
            }
            if (inc.empty) {
                if (old && String(old.value || '').trim()) return;   /* 旧值优先 */
                rec.extra[id] = { value: '', comment: '', group: inc.group || (nsfwGuideMeta(id) || {}).group || '其它', label: inc.label || old.label || '', min: (typeof inc.min === 'number' ? inc.min : null), max: (typeof inc.max === 'number' ? inc.max : null), unit: inc.unit || '', empty: true, at: Date.now() };
                return;
            }
            if (!isNaish(inc.value) && isUnknownish(inc.value) && old && String(old.value || "").trim() && !isUnknownish(old.value)) return;
            rec.extra[id] = { value: inc.value, comment: inc.comment || "", group: inc.group || (nsfwGuideMeta(id) || {}).group || "其它", label: inc.label || "", min: (typeof inc.min === "number" ? inc.min : null), max: (typeof inc.max === "number" ? inc.max : null), unit: inc.unit || "", at: Date.now() };
        });
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
function rebuildSemantic(bucket) {
    const copy = JSON.parse(JSON.stringify(bucket));
    Object.keys(copy.chars || {}).forEach(name => {
        const rec = copy.chars[name];
        delete rec.updatedAt;
        ['stats', 'desc', 'extra'].forEach(group => {
            Object.keys(rec[group] || {}).forEach(id => {
                const cell = rec[group][id];
                if (cell && typeof cell === 'object' && !Array.isArray(cell)) delete cell.at;
            });
        });
    });
    function stable(value) {
        if (Array.isArray(value)) return value.map(stable);
        if (!value || typeof value !== 'object') return value;
        const out = Object.create(null);
        Object.keys(value).sort().forEach(k => { out[k] = stable(value[k]); });
        return out;
    }
    return JSON.stringify(stable(copy));
}
export function nsfwRebuildFromChat(chatId, chat) {
    try {
        const { all, bucket, key } = nsfwBucket(chatId);
        const next = rebuildBucket(bucket, chat);
        if (rebuildSemantic(bucket) === rebuildSemantic(next)) return next.order.slice();
        all[key] = next;
        writeAll(all);
        return next.order.slice();
    } catch (e) { return []; }
}
function rebuildBucket(bucket, chat) {
        const prev = bucket.chars || {};
        const next = { order: [], pin: bucket.pin || null, chars: {} };
        const msgs = Array.isArray(chat) ? chat : [];
        msgs.forEach((m, i) => {
            if (!m || m.is_system) return;   /* ★W328：用户楼层里手填的块也算（作者会自己补表格） */
            const text = String(m.mes || '');
            /* ★W331：楼层里的块早被换成 <div data-nsfw> 外壳了 —— 两种都要认，否则刷新后重建为空（作者实测「无档案」） */
            if (text.indexOf('<nsfw') < 0 && text.indexOf('data-nsfw') < 0) return;
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
            /* ★W404：手填档案的三件套也保留（以前只拷 static ⇒ 出过块就变回 女/受、manual 丢失、删楼即消失） */
            if (old.manual) { next.chars[n].manual = true; if (old.sex) next.chars[n].sex = old.sex; }
            else if (old.sex && old.sex !== 'female') next.chars[n].sex = old.sex;
            if (old.role) next.chars[n].role = old.role;
        });
        return next;
}
function persistChatBucket(chatId, chat, removeName) {
    const { all, bucket, key } = nsfwBucket(chatId);
    const next = rebuildBucket(bucket, chat);
    if (removeName) {
        delete next.chars[removeName];
        next.order = next.order.filter(n => n !== removeName);
        if (next.pin === removeName) next.pin = null;
    }
    all[key] = next;
    writeAll(all);
}

/* ────────────────────────── 注入 ────────────────────────── */

function fmtVal(f, cell) {
    if (!cell) return '';
    const v = cell.value;
    if (f.type === 'list') return Array.isArray(v) ? v.join('、') : String(v || '');
    return String(v == null ? '' : v);
}
/** ★W443：把值末尾已经带的单位摘掉（7次 / 7 次 / 7（次）都认） */
function stripUnitText(val, unit) {
    const t = String(val == null ? '' : val).trim();
    if (!t || !unit) return t;
    const uEsc = String(unit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return t.replace(new RegExp('\\s*[（(]?\\s*' + uEsc + '\\s*[)）]?\\s*$'), '').trim();
}
/** 数值 + 单位（★W443：值自带单位就摘掉再补一次；N/A/未知 不补，显示与文本解耦） */
function withUnit(f, val) {
    const t = String(val == null ? '' : val).trim();
    if (!t || !f || !f.unit) return t;
    if (isNaish(t) || /^(未知|unknown)$/i.test(t)) return t;
    const core = stripUnitText(t, String(f.unit));
    if (!core) return t;
    return core + ' ' + String(f.unit);
}

export function buildCharBlock(name, profile) {
    const fields = activeFields(profile);
    const lines = [];
    /* ★W383：跟作者提示词的格式完全一致 —— <nsfw> 无属性，名字/时间写在块内头两行 */
    const snap0 = String((((profile || {}).stats || {}).snapTime || {}).value || '');
    lines.push('name 角色名 = ' + name);
    lines.push('snapTime 快照时间 = ' + (snap0 || '未知'));
    /* ★W394：按【组】归拢再输出 —— 组头只出现一次，顺序 状态/身体/穿搭/胸/前穴/后穴/开发，其余组排后面 */
    const groups = [];
    const gmap = {};
    const addTo = (g, line, ord) => {
        const gg = String(g || '其它').trim() || '其它';
        if (!gmap[gg]) { gmap[gg] = { g: gg, items: [] }; groups.push(gmap[gg]); }
        gmap[gg].items.push({ line: line, ord: (typeof ord === 'number' ? ord : 9999) });
    };
    const sent0 = {};   /* ★W421：这一轮已经写过的 ID */
    fields.forEach((f0) => {
        const f = viewField(f0);   /* ★W411：中文/范围/单位/分组都以指南为准 */
        if (f.id === 'snapTime') return;   /* 已在块头 */
        const cell = (profile.stats || {})[f.id]
            || ((profile.static || {})[f.id] ? { value: profile.static[f.id], comment: '' } : null);
        const val = cell ? fmtVal(f, cell) : '';
        sent0[f.id] = 1;
        /* ★W421：没有值的字段也发一个空位 `id = `，让 AI 下一轮自己补 */
        addTo(f.group, val ? (f.id + ' = ' + val) : (f.id + ' = '), f.ord);   /* ★W438：发送顺序跟指南行序 */
    });
    const allowed0 = {};
    fields.forEach((f0) => { allowed0[f0.id] = 1; });
    /* 自定义字段跟普通字段一起发 */
    try {
        const ex = profile.extra || {};
        Object.keys(ex).forEach((id) => {
            if (!nsfwGuideAllows(id)) return;   /* ★W413：指南删掉的字段不发送 */
            const e0 = ex[id] || {};
            /* ★W392：近况只给自己看 —— 不发给 AI（否则它会把上一份照抄/拿正文事件重写一遍） */
            const g0 = nsfwGuideMeta(id) || {};
            if (nsfwMaleFrontHidden(profile, id, g0.group || e0.group)) return;   /* ★W468b */
            if (id === 'gapLog' || String(g0.group || e0.group || '') === '近况') return;   /* ★W437：组以指南为准 */
            if (Array.isArray(e0.list) && e0.list.length) return;   /* 多行字段一律不发送 */
            const v = String(e0.value == null ? "" : e0.value).trim();
            if (!v) return;   /* ★W420：空值交给 W421 补空位 */
            sent0[id] = 1;
            addTo(g0.group || e0.group || '其它', id + ' = ' + v, g0.ord);   /* ★W435/W438：组和顺序都跟指南 */
        });
    } catch (e) { }
    /* ★W436：他人视线也「反向补充」—— 指南里的每条都发出；这轮没写就空位，写过把原文带上（指南要求「没变的照抄」） */
    try {
        const gmV = nsfwGuide();
        Object.keys(gmV).forEach((id) => {
            if (!/^view/i.test(id)) return;
            if (!nsfwGuideAllows(id)) return;
            const cellV = (profile.desc || {})[id];
            const txtV = String((cellV && cellV.text) || '').trim();
            sent0[id] = 1;
            addTo(gmV[id].group || '他人视线', id + ' = ' + txtV, gmV[id].ord);
        });
    } catch (eV) { }
    /* ★W421：指南里有、但这一轮没有任何值的字段 —— 也给 AI 一个空位（它下一轮会补） */
    try {
        const gm0 = nsfwGuide();
        Object.keys(gm0).forEach((id) => {
            if (id === 'name' || id === 'snapTime') return;   /* ★W436：gapLog 没值时也占一行 */
            if (sent0[id]) return;
            if (fieldById(id) && !allowed0[id]) return;   /* ★W468：男性不补前穴空位（否则 AI 下一轮会拿选项把它填上） */
            const gx0 = gm0[id] || {};
            if (nsfwMaleFrontHidden(profile, id, gx0.group)) return;   /* ★W468b：清单外字段同样不补 */
            if (!nsfwGuideAllows(id)) return;
            if (/^view/i.test(id)) return;   /* ★W431：他人视线是 desc，不发空位 */
            const g = gm0[id] || {};
            if (String(g.group || '') === '近况' || String(g.group || '') === '他人视线' || g.multi) return;
            addTo(g.group || '其它', id + ' = ', g.ord);
        });
    } catch (e0) { }
    /* ★W438：组顺序 = 指南组顺序（指南没有的组排后面）；组内 = 指南行序 */
    const gSeq0 = (() => { try { return nsfwGuideGroups(); } catch (e) { return []; } })();
    const ordOf = (g) => {
        const i = gSeq0.indexOf(g);
        if (i >= 0) return i;
        const j = GROUP_ORDER.indexOf(g);
        return j < 0 ? 2000 : 1000 + j;
    };
    groups.slice().sort((a, b) => ordOf(a.g) - ordOf(b.g)).forEach((grp) => {
        if (!grp.items.length) return;
        lines.push('【' + grp.g + '】');
        grp.items.slice().sort((a, b) => a.ord - b.ord).forEach((it) => lines.push(it.line));
    });
    return '<nsfw>' + NL + lines.join(NL) + NL + '</nsfw>';
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
        '他人视线：' + NSFW_DESC_FIELDS.map((d) => d.id + ' ' + d.label).join('；') + '（写在同一个 <nsfw> 块里，整段文字，不用 |）'
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
const SEND_ONCE_KEY = 'kimi_nsfw_send_once';
const SEND_OFF_KEY = 'kimi_nsfw_send_off';
function readSendSnapshot(key) {
    const raw = localStorage.getItem(key);
    const all = raw == null ? {} : JSON.parse(raw);
    if (!all || typeof all !== 'object' || Array.isArray(all)) throw new Error('发送偏好无法读取');
    Object.keys(all).forEach(k => {
        if (!Array.isArray(all[k]) || all[k].some(n => typeof n !== 'string')) throw new Error('发送偏好名单格式损坏');
    });
    return { raw, all };
}
function readSendStore(key) { return readSendSnapshot(key).all; }
function readSend() { return readSendStore(SEND_KEY); }
// Pre-read all keys; compensate completed writes if a later key fails. Failed
// compensation is explicit: localStorage provides no cross-key transaction.
function updateSendStores(chatId, edits) {
    const snapshots = new Map(), completed = [];
    try {
        const k = String(chatId || 'default');
        edits.forEach(edit => {
            if (!snapshots.has(edit.key)) snapshots.set(edit.key, readSendSnapshot(edit.key));
        });
        edits.forEach(edit => {
            const all = snapshots.get(edit.key).all;
            if (edit.clear) { delete all[k]; return; }
            const list = Object.prototype.hasOwnProperty.call(all, k) ? all[k].slice() : [];
            const i = list.indexOf(edit.name);
            if ((edit.on && i >= 0) || (!edit.on && i < 0)) return;
            if (edit.on) list.push(edit.name); else list.splice(i, 1);
            Object.defineProperty(all, k, { value: list, enumerable: true, configurable: true, writable: true });
        });
        for (const [key, snapshot] of snapshots) {
            const next = JSON.stringify(snapshot.all);
            // Structural no-op must preserve even whitespace in the original bytes.
            if (next === JSON.stringify(snapshot.raw == null ? {} : JSON.parse(snapshot.raw))) continue;
            localStorage.setItem(key, next);
            completed.push(key);
        }
        return { ok: true, changed: completed.length > 0 };
    } catch (error) {
        const rollbackFailed = [];
        completed.reverse().forEach(key => {
            try {
                const raw = snapshots.get(key).raw;
                if (raw == null) localStorage.removeItem(key); else localStorage.setItem(key, raw);
            } catch (rollbackError) { rollbackFailed.push(key); }
        });
        const partial = rollbackFailed.length > 0;
        return { ok: false, changed: partial, partial, error: stateError(error) + (partial ? '；发送偏好只完成部分修改，回滚未完成，请重新读取核对' : ''), rollbackFailed };
    }
}
function setSendMember(key, chatId, name, on) {
    return updateSendStores(chatId, [{ key, name, on }]);
}
function sendPreferenceNotice(result) {
    try { if (typeof toastr !== 'undefined') toastr.error(result.error, result.partial ? '发送偏好部分修改，请核对' : '发送偏好保存失败，未更改勾选'); } catch (e) {}
}
function changeSendCheckbox(cb, chatId, auto, autoPicks, previous) {
    const name = cb.getAttribute('data-send');
    const edits = !auto ? [{ key: SEND_KEY, name, on: cb.checked }]
        : cb.checked ? [{ key: SEND_OFF_KEY, name, on: false }].concat(autoPicks.indexOf(name) < 0 ? [{ key: SEND_ONCE_KEY, name, on: true }] : [])
        : [{ key: SEND_ONCE_KEY, name, on: false }, { key: SEND_OFF_KEY, name, on: true }];
    const result = updateSendStores(chatId, edits);
    if (!result.ok) { cb.checked = previous; sendPreferenceNotice(result); return false; }
    return true;
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
    return setSendMember(SEND_KEY, chatId, name, on);
}
/** ★W364：AUTO 下手动追加的一次性名单（发完即清） */
export function nsfwSendOnce(chatId) {
    try { const all = readSendStore(SEND_ONCE_KEY); return (all[String(chatId || 'default')] || []).slice(); }
    catch (e) { return []; }
}
export function nsfwSetSendOnce(chatId, name, on) {
    return setSendMember(SEND_ONCE_KEY, chatId, name, on);
}
/** ★W368：AUTO 下「本轮临时排除」名单（发完同样清） */
export function nsfwSendOff(chatId) {
    try { const all = readSendStore(SEND_OFF_KEY); return (all[String(chatId || 'default')] || []).slice(); }
    catch (e) { return []; }
}
export function nsfwSetSendOff(chatId, name, on) {
    return setSendMember(SEND_OFF_KEY, chatId, name, on);
}
export function nsfwClearSendOnce(chatId) {
    return updateSendStores(chatId, [{ key: SEND_ONCE_KEY, clear: true }, { key: SEND_OFF_KEY, clear: true }]);
}
/** ★W366：只看「真实用户输入」——作者用 4A 包裹/<user_input> 把用户楼层包了，小说前缀里的名字不该触发 AUTO */
function realUserInput(t) {
    let s = String(t || '');
    const m = /<user_input>([\s\S]*?)<\/user_input>/i.exec(s);
    if (m) return m[1];
    const k = s.indexOf('本轮真实输入：');
    if (k >= 0) {
        let rest = s.slice(k + '本轮真实输入：'.length);
        const end = rest.indexOf(String.fromCharCode(10) + '————');
        if (end >= 0) rest = rest.slice(0, end);
        return rest;
    }
    return s;
}
/** AI 楼层只看 <content> 正文（其它模块里提到的名字不算） */
function aiContent(t) {
    const s = String(t || '');
    const parts = [];
    const re = /<content>([\s\S]*?)<\/content>/gi;
    let m;
    while ((m = re.exec(s))) parts.push(m[1]);
    return parts.length ? parts.join(String.fromCharCode(10)) : s;
}
/** AUTO 这一轮会发谁（只看正文/用户消息里出现过的名字） */
export function nsfwAutoPicks(chatId, msgs) {
    try {
        const { bucket } = nsfwBucket(chatId);
        const live = nsfwStateFromMsgs(msgs);
        const names = (bucket.order || []).filter((n) => bucket.chars[n]);
        Object.keys(live.chars).forEach((n) => { if (names.indexOf(n) < 0) names.push(n); });
        /* ★W462：AUTO 不只认最后一条 assistant —— 往上找最近 4 条 assistant（含块里的 name 行），
           32 楼有 A、34 楼 B、36 楼只写 B 时，A 仍算在场；否则 UI 勾着 A、请求时却按最后一条文本把 A 丢了。 */
        const AUTO_RECENT_ASSISTANTS = 4;
        const texts = [];
        const blockNames = [];
        let aSeen = 0;
        for (let i = (msgs || []).length - 1; i >= 0 && aSeen < AUTO_RECENT_ASSISTANTS; i--) {
            const m = msgs[i];
            if (!m || m.role !== 'assistant') continue;
            aSeen++;
            const raw = String(m.content || '');
            texts.push(aiContent(raw));
            try {
                const p = nsfwParse(raw);
                Object.keys((p && p.chars) || {}).forEach((bn) => { if (blockNames.indexOf(bn) < 0) blockNames.push(bn); });
            } catch (eP) { }
        }
        const lastU = (() => { for (let i = (msgs || []).length - 1; i >= 0; i--) { if (msgs[i] && msgs[i].role === 'user') return realUserInput(String(msgs[i].content || '')); } return ''; })();
        const text = texts.join(String.fromCharCode(10)) + String.fromCharCode(10) + lastU;
        return names.filter((n) => n && (text.indexOf(n) >= 0 || blockNames.indexOf(n) >= 0));
    } catch (e) { return []; }
}
/** 本轮该发送谁：AUTO=正文提到的人 + 手动一次性追加；手动=勾选的 */
export function nsfwPickForRequest(chatId, msgs, fullMsgs, opts) {
    try {
        const st = _getSettings() || {};
        /* ★W327：AUTO 勾上=按正文提到谁发谁；不勾=只发手动勾选的人；都不选=不发送 */
        const auto = (st.nsfwAutoSend !== undefined) ? !!st.nsfwAutoSend : (String(st.nsfwSendMode || 'auto') === 'auto');
        const { bucket } = nsfwBucket(chatId);
        const bounded = !!(opts && opts.bounded);
        const live = nsfwStateFromMsgs(bounded && Array.isArray(fullMsgs) ? fullMsgs : msgs);
        /* ★W464：fullMsgs = 整段聊天到最后一条 user（悬浮条 AUTO 用的就是这份）。
           请求 msgs 被上游裁掉/改写时，不能只按它算 AUTO —— 否则 UI 勾着的名字会在请求时被悄悄丢掉。 */
        const full = (Array.isArray(fullMsgs) && (bounded || fullMsgs.length)) ? fullMsgs : null;
        const liveFull = full ? nsfwStateFromMsgs(full) : null;
        const names = (bucket.order || []).filter((n) => bucket.chars[n] && (!bounded || bucket.chars[n].manual || Object.keys(bucket.chars[n].static || {}).length));
        Object.keys(live.chars).forEach((n) => { if (names.indexOf(n) < 0) names.push(n); });
        if (bounded) nsfwSendPicks(chatId).concat(nsfwSendOnce(chatId)).forEach(n => { if (!names.includes(n)) names.push(n); });
        if (liveFull) Object.keys(liveFull.chars).forEach((n) => { if (names.indexOf(n) < 0) names.push(n); });
        if (!names.length) return [];
        if (!auto) {
            const picks = nsfwSendPicks(chatId);
            return names.filter((n) => picks.indexOf(n) >= 0);
        }
        /* AUTO：正文命中的 ∪ 手动追加（正文口径优先用整段聊天，和悬浮条一致） */
        const history = full || msgs;
        // AUTO candidates come from bounded history, never from a future bucket-only role.
        const base = nsfwAutoPicks(chatId, history).filter(n => !bounded || names.includes(n));
        const once = nsfwSendOnce(chatId);
        const off = nsfwSendOff(chatId);
        const union = base.filter((n) => off.indexOf(n) < 0);
        once.forEach((n) => { if (union.indexOf(n) < 0 && off.indexOf(n) < 0) union.push(n); });
        return union;
    } catch (e) { return []; }
}
/** 组装发送文本（取的是楼层里最新读出的档案） */
/** 从一批消息（= 这次请求实际带的历史）重建状态；正在生成的那一楼本来就不在 msgs 里 */
export function nsfwStateFromMsgs(msgs) {
    const tmp = { order: [], chars: {} };
    (msgs || []).forEach((m) => {
        if (!m || typeof m.content !== 'string') return;
        if (m.role !== 'assistant' && m.role !== 'user') return;
        if (m.content.indexOf('<nsfw') < 0 && m.content.indexOf('data-nsfw') < 0) return;
        const parsed = nsfwParse(m.content);
        if (parsed && parsed.hasAny) applyParsedTo(tmp, parsed);
    });
    return tmp;
}
/** ★W463：合并「请求历史里的状态」和「整段聊天缓存」——
 *  live 可能只是被裁剩的半截块/只有 name 的空块，不能让它把缓存里完整的状态遮住；
 *  同名状态下 live 的新值优先，live 缺的字段用缓存补齐（缓存是按整段聊天重建的）。 */
function mergeSendProfile(base, over) {
    try {
        if (!base) return over || null;
        if (!over) return base;
        const out = JSON.parse(JSON.stringify(base));
        out.stats = Object.assign({}, base.stats || {});
        Object.keys(over.stats || {}).forEach((id) => {
            const c = over.stats[id] || {};
            if (String(c.value == null ? '' : c.value).trim() !== '' || c.unknown) out.stats[id] = c;
        });
        out.desc = Object.assign({}, base.desc || {});
        Object.keys(over.desc || {}).forEach((id) => {
            const d = over.desc[id] || {};
            const tx = (d && typeof d === 'object') ? String(d.text || '') : String(d || '');
            if (tx.trim() || !out.desc[id]) out.desc[id] = d;
        });
        out.extra = Object.assign({}, base.extra || {});
        Object.keys(over.extra || {}).forEach((id) => {
            const e = over.extra[id] || {};
            const has = String(e.value == null ? '' : e.value).trim() || (Array.isArray(e.list) && e.list.length);
            if (has || !out.extra[id]) out.extra[id] = e;
        });
        out.static = Object.assign({}, base.static || {}, over.static || {});
        out.sex = base.sex || over.sex;
        out.role = base.role || over.role;
        return out;
    } catch (e) { return over || base || null; }
}
export function nsfwBuildSend(chatId, names, msgs, opts) {
    try {
        const { bucket } = nsfwBucket(chatId);
        /* ★W343：给了 msgs 就只认「这次请求带的历史」——正在重roll/新分支的那一楼不在里面，
           绝不能拿它（或缓存里的旧值）当状态；只有没给 msgs（预览等）才退回缓存档案 */
        const bounded = !!(opts && opts.bounded);
        const history = bounded && opts && Array.isArray(opts.fullMsgs) ? opts.fullMsgs : msgs;
        const live = Array.isArray(history) ? nsfwStateFromMsgs(history) : null;
        /* ★W464：请求 msgs 可能缺了旧块（上游裁历史/改内容），整段聊天里还有 ⇒ 用整段那份补齐。
           合并顺序：缓存 → 整段 → 请求（越靠后越新）。 */
        const fullMsgs = !bounded && (opts && Array.isArray(opts.fullMsgs) && opts.fullMsgs.length) ? opts.fullMsgs : null;
        const liveFull = fullMsgs ? nsfwStateFromMsgs(fullMsgs) : null;
        const parts = [];
        (names || []).forEach((n) => {
            /* ★W458：勾了谁就发谁 —— 请求 msgs 可能被酒馆预算裁掉/被处理后少了旧块；
               请求历史里没有这个人的块时，回「按整段聊天重建的缓存」找他的最近一份状态。
               这样 6 楼 A、8 楼 B、10 楼 A+B、14 楼只写了 A：勾 B 也能从 8/10 楼的状态补出来。 */
            const lRec = live ? (live.chars[n] || null) : null;
            const fRec = liveFull ? (liveFull.chars[n] || null) : null;
            const cached = bucket.chars[n] || null;
            const bRec = bounded ? {
                sex: cached && cached.manual ? cached.sex : undefined,
                role: cached && cached.manual ? cached.role : undefined,
                manual: !!(cached && cached.manual), static: cached && cached.static || {},
                stats: {}, extra: {}, desc: {}
            } : cached;
            const prof = mergeSendProfile(mergeSendProfile(bRec, fRec), lRec);
            try { console.log('[余温工具箱] NSFW发送·' + n + '：请求块=' + (lRec ? '有' : '无') + ' 全量块=' + (fRec ? '有' : '无') + ' 缓存块=' + (bRec ? '有' : '无') + ' 合并字段=' + Object.keys((prof && prof.stats) || {}).length + ' 扩展=' + Object.keys((prof && prof.extra) || {}).length); } catch (eM) { }
            if (!prof) return;
            const b = buildCharBlock(n, prof);
            if (!b) return;
            const t0 = String(((prof.stats || {}).snapTime || {}).value || '');
            parts.push('以下是' + n + (t0 ? '于' + t0 : '') + '的NSFW状态快照（这是前文已有的状态，不是示例；请当作续写底稿直接更新，不要当成新建。出于省token需求评述不作为提示词发送，不代表没有），如进入NSFW剧情则按照以上要求综合剧情与推理完整更新（不进入则不输出）：');
            parts.push(b);
        });
        try { console.log('[余温工具箱] NSFW发送名单：选择=' + (names || []).join('、') + ' 请求历史里有=' + (live ? Object.keys(live.chars || {}).join('、') : '(无 msgs)') + ' 缓存里有=' + Object.keys(bucket.chars || {}).join('、')); } catch (eL) { }
        return parts.length > 1 ? parts.join(NL) : '';
    } catch (e) { return ''; }
}

/** ★W401：请求侧一条龙 —— 先按**原始历史**拼状态，再剥旧块，最后插进 system。
 *  顺序是唯一正确的顺序（先剥后拼 ⇒ 状态永远为空，W400 实锤）。index.js 与验收探针共用这一份。 */
/** ★W403：只剥历史 assistant 楼层里的旧块（总开关关 / 发送悬浮窗关 时也要剥，
 *  否则 AI 照样能从历史里读到上一个快照 = 等于还在发）。 */
export function nsfwStripHistory(msgs) {
    let changed = false;
    try {
        if (!Array.isArray(msgs)) return false;
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (!m || typeof m.content !== 'string') continue;
            if (m.role !== 'assistant') continue;
            if (m.content.indexOf('data-nsfw') < 0 && m.content.indexOf('<nsfw') < 0) continue;
            if (m.content.indexOf('nsfw_state_guide') >= 0) continue;
            const st = nsfwStripBlocks(m.content);
            if (st !== m.content) { m.content = st; changed = true; }
        }
    } catch (e) { }
    return changed;
}

export function nsfwRewriteRequest(msgs, chatId, fullMsgs, opts) {
    const out = { changed: false, names: [], text: '' };
    try {
        if (!Array.isArray(msgs) || !msgs.length) return out;
        /* ① 拼状态：必须在剥块之前（历史里还留着块） */
        out.names = nsfwPickForRequest(chatId, msgs, fullMsgs, opts);
        out.text = out.names.length ? nsfwBuildSend(chatId, out.names, msgs, { fullMsgs: fullMsgs, bounded: !!(opts && opts.bounded) }) : '';
        try { console.log('[余温工具箱] NSFW请求：请求消息=' + msgs.length + ' 全量消息=' + (Array.isArray(fullMsgs) ? fullMsgs.length : '无') + ' 选中=' + out.names.join('、') + ' 发送字符=' + out.text.length); } catch (eD) { }
        /* ★W447b：只把真的写进注入段的人算作“这次发了”（历史里没块的人已被 nsfwBuildSend 跳过） */
        if (out.text) out.names = out.names.filter((n) => out.text.indexOf('以下是' + n) >= 0 || out.text.indexOf('name 角色名 = ' + n) >= 0);
        else out.names = [];
        /* ② 剥掉历史 assistant 楼层里的旧块（不重复发给 AI） */
        if (nsfwStripHistory(msgs)) out.changed = true;
        /* ③ 插到 </nsfw_state_guide> 前；找不到就第一条 system 最前；再没有就 unshift */
        if (out.text) {
            let sys0 = null, at = -1;
            for (let i = 0; i < msgs.length; i++) {
                if (!msgs[i] || msgs[i].role !== 'system' || typeof msgs[i].content !== 'string') continue;
                const k = msgs[i].content.indexOf('</nsfw_state_guide>');
                if (k >= 0) { sys0 = msgs[i]; at = k; break; }
            }
            if (sys0) {
                sys0.content = sys0.content.slice(0, at) + out.text + String.fromCharCode(10) + sys0.content.slice(at);
            } else {
                for (let i = 0; i < msgs.length; i++) {
                    if (msgs[i] && msgs[i].role === 'system' && typeof msgs[i].content === 'string') { sys0 = msgs[i]; break; }
                }
                if (sys0) sys0.content = out.text + String.fromCharCode(10, 10) + sys0.content;
                else msgs.unshift({ role: 'system', content: out.text });
            }
            out.changed = true;
            out.sendClear = nsfwClearSendOnce(chatId);
            if (!out.sendClear.ok) sendPreferenceNotice(out.sendClear);
        }
    } catch (e) { }
    return out;
}

/** Mobile: ST's transformed html can have height 0 and a scrolled origin.
 * Give these two floats their own explicit viewport, without changing host roots. */
let _nsfwViewport = null;
function nsfwViewportSize() {
    const v = window.visualViewport;
    return { x: v && Number.isFinite(v.offsetLeft) ? v.offsetLeft : 0,
        y: v && Number.isFinite(v.offsetTop) ? v.offsetTop : 0,
        w: v && v.width > 0 ? v.width : window.innerWidth,
        h: v && v.height > 0 ? v.height : window.innerHeight };
}
function nsfwFloatPlace(el, point) {
    if (!el || !el.isConnected || el.style.display === 'none') return;
    const v = nsfwViewportSize(), r = el.getBoundingClientRect();
    const layer = el.parentNode.getBoundingClientRect();
    const old = el._nsfwFloatPoint;
    const want = point || old || { x: v.w - r.width - 12, y: v.h - r.height - (el.id === 'yw-nsfw-preview' ? 130 : 86) };
    const x = Math.max(8, Math.min(Math.max(8, v.w - r.width - 8), Number.isFinite(want.x) ? want.x : 8));
    const y = Math.max(8, Math.min(Math.max(8, v.h - r.height - 8), Number.isFinite(want.y) ? want.y : 8));
    el.style.left = (v.x + x - layer.left) + 'px';
    el.style.top = (v.y + y - layer.top) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    // Only user/restored positions become sticky. Defaults stay bottom-anchored on resize.
    if (point || old) el._nsfwFloatPoint = { x: x, y: y };
}
function nsfwFloatFocus() {
    const el = document.activeElement;
    const box = document.getElementById('yw-nsfw-preview');
    if (!el || !box || !el.closest || el.closest('#yw-nsfw-preview') !== box) return;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    const hd = box.querySelector('.yw-nsfw-pv-hd');
    const top = b.top + (hd ? hd.getBoundingClientRect().height : 0) + 8;
    const bottom = b.top + b.height - 8;
    if (r.top < top) box.scrollTop -= top - r.top;
    else if (r.top + r.height > bottom) box.scrollTop += r.top + r.height - bottom;
}
function nsfwFloatRefresh() {
    const layer = _nsfwViewport;
    if (!layer) return;
    const v = nsfwViewportSize();
    layer.style.width = v.w + 'px'; layer.style.height = v.h + 'px';
    layer.style.left = '0px'; layer.style.top = '0px';
    const r = layer.getBoundingClientRect();
    layer.style.left = (v.x - r.left) + 'px'; layer.style.top = (v.y - r.top) + 'px';
    ['yw-nsfw-sender', 'yw-nsfw-preview'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.maxWidth = Math.max(0, v.w - 16) + 'px';
        el.style.maxHeight = Math.max(32, Math.min(v.h - 16, v.h * (id === 'yw-nsfw-preview' ? .7 : .4))) + 'px';
        nsfwFloatPlace(el);
    });
    nsfwFloatFocus();
}
function nsfwFloatMount(el) {
    if (!_nsfwViewport || !_nsfwViewport.isConnected) {
        const layer = document.createElement('div'); layer.id = 'yw-nsfw-viewport';
        document.documentElement.appendChild(layer); _nsfwViewport = layer;
        if (window.addEventListener) window.addEventListener('resize', nsfwFloatRefresh);
        const v = window.visualViewport;
        if (v && v.addEventListener) { v.addEventListener('resize', nsfwFloatRefresh); v.addEventListener('scroll', nsfwFloatRefresh); }
    }
    if (el.parentNode !== _nsfwViewport) _nsfwViewport.appendChild(el);
    nsfwFloatRefresh();
}
function nsfwFloatRelease() {
    if (!_nsfwViewport || _nsfwViewport.children.length) return;
    if (window.removeEventListener) window.removeEventListener('resize', nsfwFloatRefresh);
    const v = window.visualViewport;
    if (v && v.removeEventListener) { v.removeEventListener('resize', nsfwFloatRefresh); v.removeEventListener('scroll', nsfwFloatRefresh); }
    _nsfwViewport.remove(); _nsfwViewport = null;
}
function nsfwFloatRestore(el, key) {
    try {
        const p = JSON.parse(localStorage.getItem(key) || 'null');
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) nsfwFloatPlace(el, p);
        else nsfwFloatPlace(el);
    } catch (e) { nsfwFloatPlace(el); }
}
/** ★W327 悬浮发送条：一条横条（可拖）+ AUTO 勾 + 名字列表；点名字看最新快照 */
function nsfwBindSenderDrag(host, grip) {
    /* ★W410：绑定判据必须落在**把手**上 —— 悬浮条每次刷新都会重建 innerHTML，
       grip 是新节点；以前把 dragBound 记在 host 上 ⇒ 第二次起把手没有监听 ⇒ 拖不动。 */
    if (!host || !grip || grip.dataset.dragBound === '1') return;
    grip.dataset.dragBound = '1';
    try { grip.style.touchAction = 'none'; } catch (e0) { }
    let on = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const pt = (e) => (e && e.touches && e.touches[0]) ? e.touches[0] : e;
    const move = (e) => {
        if (!on) return;
        const p = pt(e);
        if (!p) return;
        const v = nsfwViewportSize();
        nsfwFloatPlace(host, { x: ox + p.clientX - sx - v.x, y: oy + p.clientY - sy - v.y });
        try { e.preventDefault(); } catch (e1) { }
    };
    const dispose = () => {
        on = false;
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('touchmove', move, true);
        document.removeEventListener('pointerup', up, true);
        document.removeEventListener('mouseup', up, true);
        document.removeEventListener('touchend', up, true);
        document.removeEventListener('pointercancel', dispose, true);
        document.removeEventListener('touchcancel', dispose, true);
    };
    host._nsfwDisposeDrag = dispose;
    const up = () => {
        if (!on) return;
        dispose();
        const r = host.getBoundingClientRect(), v = nsfwViewportSize();
        try { localStorage.setItem('kimi_nsfw_sender_pos', JSON.stringify({ x: Math.round(r.left - v.x), y: Math.round(r.top - v.y) })); } catch (e) { }
    };
    const down = (e) => {
        const r = host.getBoundingClientRect();
        const p = pt(e);
        if (!p) return;
        dispose();
        on = true; sx = p.clientX; sy = p.clientY; ox = r.left; oy = r.top;
        host.style.right = 'auto'; host.style.bottom = 'auto';
        document.addEventListener('pointermove', move, true);
        document.addEventListener('mousemove', move, true);
        document.addEventListener('touchmove', move, true);
        document.addEventListener('pointerup', up, true);
        document.addEventListener('mouseup', up, true);
        document.addEventListener('touchend', up, true);
        document.addEventListener('pointercancel', dispose, true);
        document.addEventListener('touchcancel', dispose, true);
        try { e.preventDefault(); } catch (e2) { }
        try { e.stopPropagation(); } catch (e3) { }
    };
    grip.addEventListener('pointerdown', down);
    grip.addEventListener('mousedown', down);
    grip.addEventListener('touchstart', down, { passive: false });
}
/* ★W412：卡片折叠 —— 状态存模块级 Map（卡会被反复销毁重建，只写 DOM 会丢）
   ★W424：默认态不再走设置项 —— 用户最后一次手动折叠/展开，就是以后所有新卡的默认态 */
const _foldMap = new Map();
const FOLD_LAST_KEY = 'kimi_nsfw_fold_last';
let _foldDefault = false;
try { _foldDefault = localStorage.getItem(FOLD_LAST_KEY) === '1'; } catch (e) { }
export function nsfwResetFold() { try { _foldMap.clear(); } catch (e) { } }
function _foldKey(chatId, mesid, name) { return String(chatId || '') + '|' + String(mesid == null ? '' : mesid) + '|' + String(name || ''); }
/* ★W423：记住每张卡停在哪个分页（编辑保存后卡会重建，回到原分页） */
const _tabMap = new Map();
/* ★W451：这一楼当前停在哪一页 —— 切人/重建都以它为准（不再只靠“上一个名字”的分页记忆） */
const _mesTabMap = new Map();
function _mesTabKey(chatId, mesid) { return String(chatId || '') + '|' + String(mesid == null ? '' : mesid); }
function _mesTabSet(chatId, mesid, id) {
    try {
        _mesTabMap.set(_mesTabKey(chatId, mesid), String(id || ''));
        if (_mesTabMap.size > 300) { const k0 = _mesTabMap.keys().next().value; _mesTabMap.delete(k0); }
    } catch (e) { }
}
/* ★W445：一楼多个角色只画一张卡 —— 记住这一楼当前选中的是谁（切换名字用） */
const _charSelMap = new Map();
function _charSelKey(chatId, mesid) { return String(chatId || '') + '|' + String(mesid == null ? '' : mesid); }
function _charSelGet(chatId, mesid) { try { return _charSelMap.get(_charSelKey(chatId, mesid)) || ''; } catch (e) { return ''; } }
function _charSelSet(chatId, mesid, name) {
    try {
        _charSelMap.set(_charSelKey(chatId, mesid), String(name || ''));
        if (_charSelMap.size > 300) { const k0 = _charSelMap.keys().next().value; _charSelMap.delete(k0); }
    } catch (e) { }
}
export function nsfwResetTabs() { try { _tabMap.clear(); _mesTabMap.clear(); } catch (e) { } }
export function nsfwApplyTab(card, chatId, mesid, name) {
    try {
        if (!card) return;
        const bar = card.querySelector('.yw-nsfw-tabs');
        if (!bar) return;
        const key = _foldKey(chatId, mesid, name);
        if (bar.dataset.tabBound !== '1') {
            bar.dataset.tabBound = '1';
            bar.addEventListener('click', (e) => {
                try {
                    const b = (e.target && e.target.closest) ? e.target.closest('.yw-nsfw-tab') : null;
                    if (!b) return;
                    const id = b.getAttribute('data-tab');
                    if (!id) return;
                    _tabMap.set(key, id);
                    if (_tabMap.size > 300) { const k0 = _tabMap.keys().next().value; _tabMap.delete(k0); }
                    _mesTabSet(chatId, mesid, id);   /* ★W451：这一楼当前页 */
                } catch (e2) { }
            }, true);
        }
        const want = _mesTabMap.get(_mesTabKey(chatId, mesid)) || _tabMap.get(key);
        if (!want) return;
        const btns = Array.prototype.slice.call(bar.querySelectorAll('.yw-nsfw-tab'));
        const hit = btns.filter((x) => x.getAttribute('data-tab') === want)[0];
        if (hit && !hit.classList.contains('on')) hit.click();
    } catch (e) { }
}

export function nsfwApplyFold(card, chatId, mesid, name) {
    try {
        if (!card) return;
        const def = !!_foldDefault;   /* ★W424：用「上次手动开合」当默认 */
        const key = _foldKey(chatId, mesid, name);
        const collapsed = _foldMap.has(key) ? !!_foldMap.get(key) : def;
        if (!_foldMap.has(key)) { _foldMap.set(key, collapsed); if (_foldMap.size > 300) { const k0 = _foldMap.keys().next().value; _foldMap.delete(k0); } }   /* ★W444c：卡一挂上就定住自己的折叠态，别的卡折叠/重渲染不再把它带跑 */
        card.classList.toggle('is-collapsed', collapsed);
        const head = card.querySelector('.yw-nsfw-head');
        if (!head) return;
        let car = head.querySelector('.yw-nsfw-fold');
        if (!car) {
            car = document.createElement('span');
            car.className = 'yw-nsfw-fold';
            head.appendChild(car);
        }
        car.textContent = collapsed ? '▸' : '▾';
        car.title = collapsed ? '展开' : '折叠';
        if (head.dataset.foldBound === '1') return;
        head.dataset.foldBound = '1';
        head.addEventListener('click', (e) => {
            try {
                if (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea')) return;
                const sel = (typeof window !== 'undefined' && window.getSelection) ? String(window.getSelection()) : '';
                if (sel) return;
                const now = !card.classList.contains('is-collapsed');
                card.classList.toggle('is-collapsed', now);
                _foldMap.set(key, now);
                _foldDefault = now;   /* ★W424：以后生成的新卡都按这个默认态 */
                try { localStorage.setItem(FOLD_LAST_KEY, now ? '1' : '0'); } catch (eD) { }
                if (_foldMap.size > 300) { const k0 = _foldMap.keys().next().value; _foldMap.delete(k0); }
                const c0 = card.querySelector('.yw-nsfw-fold');
                if (c0) { c0.textContent = now ? '▸' : '▾'; c0.title = now ? '展开' : '折叠'; }
                if (!now && typeof card._nsfwLock === 'function') {
                    card._nsfwLock();
                    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(card._nsfwLock);
                }
                e.stopPropagation();
            } catch (e2) { }
        });
    } catch (e) { }
}

/** ★W465：列出「带状态块 + 正文里出现这个名字」的楼号（只做字符串预筛，不解析、不建卡）。 */
export function nsfwSnapshotFloorIds(chat, name) {
    const out = [];
    try {
        for (let i = 0; i < (chat || []).length; i++) {
            const m = chat[i];
            if (!m || m.is_user || m.is_system) continue;
            const t = String(m.mes || '');
            if (t.indexOf('<nsfw') < 0 && t.indexOf('data-nsfw') < 0) continue;
            if (t.indexOf(name) < 0) continue;
            out.push(i);
        }
    } catch (e) { }
    return out;
}

/** 点名字 → 用同一套美化卡看快照；★W465 顶栏 ◀ ▶ 按楼层翻，点开才解析那一楼 */
export function nsfwShowSnapshot(name) {
    try {
        const chatId = nsfwChatId();
        const ctx = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
        const chat = (ctx && Array.isArray(ctx.chat)) ? ctx.chat : [];
        const previewIdentity = chatIdentity(chatId);
        /* ★W465：只挑「正文里出现过这个名字 + 带状态块」的楼号；不解析、不建卡。 */
        const ids = nsfwSnapshotFloorIds(chat, name);
        let box = document.getElementById('yw-nsfw-preview');
        if (!box) {
            box = document.createElement('div');
            box.id = 'yw-nsfw-preview';
            nsfwFloatMount(box);
        }
        nsfwFloatMount(box);
        if (box._nsfwDisposeDrag) box._nsfwDisposeDrag();
        const closePreview = () => {
            if (box._nsfwDisposeDrag) box._nsfwDisposeDrag();
            box.style.display = 'none';
        };
        box.innerHTML = '<div class="yw-nsfw-pv-hd">'
            + '<button type="button" class="yw-nsfw-pv-nav" data-nav="prev" title="上一楼">◀</button>'
            + '<span class="yw-nsfw-pv-title"></span>'
            + '<button type="button" class="yw-nsfw-pv-nav" data-nav="next" title="下一楼">▶</button>'
            + '<button type="button" class="yw-nsfw-pv-del" title="删除这个角色的所有快照">🗑</button>'
            + '<button type="button" class="yw-nsfw-pv-x" aria-label="关闭预览" title="关闭预览">✕</button>'
            + '</div>';
        const body = document.createElement('div');
        body.className = 'yw-nsfw-pv-body';
        box.appendChild(body);
        const titleEl = box.querySelector('.yw-nsfw-pv-title');
        const prevBtn = box.querySelector('[data-nav="prev"]');
        const nextBtn = box.querySelector('[data-nav="next"]');
        const delBtn = box.querySelector('.yw-nsfw-pv-del');
        if (delBtn) {
            delBtn.addEventListener('click', async (e) => {
                try { e.stopPropagation(); } catch (e0) { }
                const msg = '删除「' + name + '」在这段聊天里的所有 NSFW 快照（所有楼层和所有历史分支），并从名册移除？楼层本身不会删除。';
                let yes = false;
                try {
                    const c0 = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
                    if (c0 && c0.Popup && c0.Popup.show && typeof c0.Popup.show.confirm === 'function') {
                        yes = await c0.Popup.show.confirm('删除所有快照', msg, { okButton: '删除', cancelButton: '取消' });
                    } else {
                        yes = window.confirm(msg);
                    }
                } catch (e1) {
                    try { yes = window.confirm(msg); } catch (e2) { yes = false; }
                }
                if (!yes) return;
                if (!sameChat(previewIdentity)) { stateNotice('聊天已切换，请重新打开'); return; }
                delBtn.disabled = true;
                const result = await nsfwDeleteCharBlocks(chatId, name);
                delBtn.disabled = false;
                if (!result.ok) { stateNotice(result.error); return; }
                try { closePreview(); } catch (e3) { }
            });
        }
        const recOf = (id) => {
            // Parse the current source each time; a floor-number-only cache survives edits/swipes.
            if (!sameChat(previewIdentity)) return null;
            return nsfwProfilesFromText(String((chat[id] && chat[id].mes) || ''))[name] || null;
        };
        let pos = -1;
        const findValid = (start, step) => {
            for (let i = start; i >= 0 && i < ids.length; i += step) { if (recOf(ids[i])) return i; }
            return -1;
        };
        const paint = (idx) => {
            const id = ids[idx];
            const rec = recOf(id);
            if (!rec) return false;
            /* ★W466：翻楼前记下当前停在哪个分页 —— 新卡默认会回到「状态」，这里把它按回去 */
            const oldOn = body.querySelector('.yw-nsfw-tab.on');
            const oldTabs = Array.prototype.slice.call(body.querySelectorAll('.yw-nsfw-tab'));
            const keepTab = oldOn ? oldOn.getAttribute('data-tab') : '';
            const keepIdx = oldOn ? oldTabs.indexOf(oldOn) : -1;
            body.innerHTML = '';
            const pvCard = nsfwRenderCard(name, rec, { source: nsfwFloorSource(chatId, id) });
            pvCard.dataset.mesid = String(id);
            try { nsfwApplyFold(pvCard, 'pv', String(id), name); } catch (eF) { }
            try { nsfwApplyTab(pvCard, 'pv', String(id), name); } catch (eT) { }
            body.appendChild(pvCard);
            if (keepTab || keepIdx >= 0) {
                const tabs = Array.prototype.slice.call(pvCard.querySelectorAll('.yw-nsfw-tab'));
                let tb = keepTab ? tabs.filter((x) => x.getAttribute('data-tab') === keepTab)[0] : null;
                if (!tb && keepIdx >= 0 && keepIdx < tabs.length) tb = tabs[keepIdx];
                if (tb) {
                    try { tb.click(); } catch (eC) { }
                    try { _tabMap.set(_foldKey('pv', String(id), name), tb.getAttribute('data-tab')); } catch (eM) { }
                }
            }
            titleEl.textContent = '第 ' + id + ' 楼 · ' + name;
            prevBtn.style.display = ''; nextBtn.style.display = '';
            prevBtn.disabled = findValid(idx - 1, -1) < 0;
            nextBtn.disabled = findValid(idx + 1, 1) < 0;
            nsfwFloatRefresh();
            return true;
        };
        const go = (start, step) => {
            const n = findValid(start, step);
            if (n < 0) return false;
            pos = n;
            return paint(n);
        };
        const showBucket = () => {
            const { bucket } = nsfwBucket(chatId);
            const rec = bucket.chars[name];
            if (!rec) return false;
            titleEl.textContent = '最新快照 · ' + name;
            prevBtn.style.display = 'none'; nextBtn.style.display = 'none';
            body.innerHTML = '';
            const pvCard = nsfwRenderCard(name, rec, { rosterSource: { identity: chatIdentity(chatId), version: JSON.stringify(rec) } });
            try { nsfwApplyFold(pvCard, 'pv', 'bucket', name); } catch (eF) { }
            try { nsfwApplyTab(pvCard, 'pv', 'bucket', name); } catch (eT) { }
            body.appendChild(pvCard);
            return true;
        };
        let shown = ids.length ? go(ids.length - 1, -1) : false;
        if (!shown) { shown = showBucket(); if (!shown) { try { box.style.display = 'none'; } catch (e0) { } return; } }
        prevBtn.addEventListener('click', (e) => { try { e.stopPropagation(); } catch (e0) { } if (!prevBtn.disabled) go(pos - 1, -1); });
        nextBtn.addEventListener('click', (e) => { try { e.stopPropagation(); } catch (e0) { } if (!nextBtn.disabled) go(pos + 1, 1); });
        box.style.display = 'block';
        nsfwFloatRefresh();
        /* ★W362：预览浮层可拖动（按住标题栏），位置记住 */
        try {
            const hd = box.querySelector('.yw-nsfw-pv-hd');
            if (hd && hd.dataset.dragBound !== '1') {
                hd.dataset.dragBound = '1';
                hd.style.cursor = 'move';
                let on = false, sx = 0, sy = 0, ox = 0, oy = 0;
                const dispose = () => {
                    on = false;
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                };
                const move = (e) => {
                    if (!on) return;
                    if (!box.isConnected || box.style.display === 'none') { dispose(); return; }
                    const v = nsfwViewportSize();
                    nsfwFloatPlace(box, { x: ox + e.clientX - sx - v.x, y: oy + e.clientY - sy - v.y });
                };
                const up = () => {
                    if (!on) return;
                    dispose();
                    const r = box.getBoundingClientRect(), v = nsfwViewportSize();
                    try { localStorage.setItem('kimi_nsfw_preview_pos', JSON.stringify({ x: Math.round(r.left - v.x), y: Math.round(r.top - v.y) })); } catch (e) { }
                };
                box._nsfwDisposeDrag = dispose;
                hd.addEventListener('mousedown', (e) => {
                    if (e.target && e.target.closest && e.target.closest('button')) return;
                    const r = box.getBoundingClientRect();
                    on = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
                    box.style.right = 'auto'; box.style.bottom = 'auto';
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', up);
                    e.preventDefault();
                });
            }
            nsfwFloatRestore(box, 'kimi_nsfw_preview_pos');
        } catch (e) { }
        if (!box._nsfwRootBound) {
            box._nsfwRootBound = true;
            box.addEventListener('mousedown', (e) => e.stopPropagation());
            box.addEventListener('click', (e) => {
                e.stopPropagation();
                nsfwFloatRefresh();
            });
            box.addEventListener('focusin', nsfwFloatFocus);
        }
        box.querySelector('.yw-nsfw-pv-x').addEventListener('click', closePreview);
    } catch (error) { stateNotice(error); }
}
/** ★W381：角色芯片（设置卡「当前聊天」和悬浮条共用同一套外观与勾选逻辑） */
export function nsfwChipsRender(host, chatId) {
    try {
        const st = _getSettings() || {};
        const auto = (st.nsfwAutoSend !== undefined) ? !!st.nsfwAutoSend : (String(st.nsfwSendMode || 'auto') === 'auto');
        const { bucket } = nsfwBucket(chatId);
        const names = (bucket.order || []).filter((n) => bucket.chars[n]);
        const picks = nsfwSendPicks(chatId);
        const once = nsfwSendOnce(chatId);
        const offNow = nsfwSendOff(chatId);
        let autoPicks = [];
        if (auto) {
            try {
                const ctx0 = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
                const msgs0 = (ctx0 && Array.isArray(ctx0.chat)) ? ctx0.chat.map((m) => ({ role: m.is_user ? 'user' : 'assistant', content: String(m.mes || '') })) : [];
                autoPicks = nsfwAutoPicks(chatId, msgs0);
            } catch (e) { autoPicks = []; }
        }
        host.innerHTML = names.map((n) => '<span class="yw-nsfw-sd-item">'
            + '<input type="checkbox" data-send="' + esc(n) + '"' + ((auto ? (((autoPicks.indexOf(n) >= 0 && offNow.indexOf(n) < 0) || once.indexOf(n) >= 0)) : (picks.indexOf(n) >= 0)) ? ' checked' : '') + '/>'
            + '<b class="yw-nsfw-sd-name" data-name="' + esc(n) + '" title="点名字看最新快照">' + esc(n) + '</b></span>').join('') || '<span class="yw-nsfw-sd-empty">无档案</span>';
        host.querySelectorAll('input[data-send]').forEach((cb) => {
            const previous = cb.checked;
            cb.addEventListener('change', () => {
                if (!changeSendCheckbox(cb, chatId, auto, autoPicks, previous)) return;
                nsfwChipsRender(host, chatId);
                try { nsfwMountSender(); } catch (e) { }
            });
        });
        host.querySelectorAll('.yw-nsfw-sd-name').forEach((el) => {
            el.addEventListener('click', () => nsfwShowSnapshot(el.getAttribute('data-name')));
        });
    } catch (e) { }
}
/** 悬浮发送条：一条横条（可拖）+ AUTO 勾 + 名字列表；点名字看最新快照 */
let _senderRebuildSig = '';
let _senderRebuildAt = 0;   /* ★W414 */
export function nsfwMountSender() {
    try {
        if (typeof document === 'undefined') return;
        const st = _getSettings() || {};
        if (!st.nsfwEnabled || st.nsfwSenderEnabled === false) {
            const old0 = document.getElementById('yw-nsfw-sender');
            if (old0) { if (old0._nsfwDisposeDrag) old0._nsfwDisposeDrag(); old0.remove(); }
            const pv0 = document.getElementById('yw-nsfw-preview'); if (pv0) { if (pv0._nsfwDisposeDrag) pv0._nsfwDisposeDrag(); pv0.remove(); }
            nsfwFloatRelease();
            return;
        }
        nsfwEnsureStyle();
        let host = document.getElementById('yw-nsfw-sender');
        if (!host) {
            host = document.createElement('div');
            host.id = 'yw-nsfw-sender';
            host.className = 'yw-nsfw-sd';
            nsfwFloatMount(host);
        }
        nsfwFloatMount(host);
        const chatId = nsfwChatId();
        /* ★W385：先按楼层重建到「没有楼层支撑的旧名字消失」；
           ★W414：同一份聊天内容只重建一次（挂悬浮条的调用点有 10+ 处） */
        try {
            const ctxR = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
            if (ctxR && Array.isArray(ctxR.chat)) {
                const lastR = ctxR.chat[ctxR.chat.length - 1] || {};
                const mesR = String(lastR.mes || '');
                const sigR = chatId + '|' + ctxR.chat.length + '|' + mesR.length + '|' + (typeof lastR.swipe_id === 'number' ? lastR.swipe_id : -1) + '|' + mesR.slice(0, 12) + '|' + mesR.slice(-12);   /* ★W437b：换聊天也要重建 */
                if (sigR !== _senderRebuildSig || Date.now() - _senderRebuildAt > 1500) {
                    nsfwRebuildFromChat(chatId, ctxR.chat);
                    _senderRebuildSig = sigR;
                    _senderRebuildAt = Date.now();
                }
            }
        } catch (e) { }
        const { bucket } = nsfwBucket(chatId);
        const names = (bucket.order || []).filter((n) => bucket.chars[n]);
        const picks = nsfwSendPicks(chatId);
        const auto = (st.nsfwAutoSend !== undefined) ? !!st.nsfwAutoSend : (String(st.nsfwSendMode || 'auto') === 'auto');
        // Restore after rendering, so clamp uses the complete sender dimensions.
        /* ★W364：AUTO 下勾选框变成「本轮会发谁」的示意；手动勾一个 = 只加这一轮 */
        const once = nsfwSendOnce(chatId);
        const offNow = nsfwSendOff(chatId);
        let autoPicks = [];
        if (auto) {
            try {
                const ctx0 = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
                const msgs0 = (ctx0 && Array.isArray(ctx0.chat)) ? ctx0.chat.map((m) => ({ role: m.is_user ? 'user' : 'assistant', content: String(m.mes || '') })) : [];
                autoPicks = nsfwAutoPicks(chatId, msgs0);
            } catch (e) { autoPicks = []; }
        }
        const items = names.map((n) => '<span class="yw-nsfw-sd-item">'
            + '<input type="checkbox" data-send="' + esc(n) + '"' + ((auto ? (((autoPicks.indexOf(n) >= 0 && offNow.indexOf(n) < 0) || once.indexOf(n) >= 0)) : (picks.indexOf(n) >= 0)) ? ' checked' : '') + '/>'
            + '<b class="yw-nsfw-sd-name" data-name="' + esc(n) + '" title="点名字看最新快照">' + esc(n) + '</b></span>').join('');
        if (host._nsfwDisposeDrag) host._nsfwDisposeDrag();
        host.innerHTML = '<span class="yw-nsfw-sd-grip" title="按住拖动">⠿</span>'
            + '<label class="yw-nsfw-sd-auto" title="自动：上一楼正文或你的消息里出现谁就发谁"><input type="checkbox"' + (auto ? ' checked' : '') + '/><span>AUTO</span></label>'
            + '<span class="yw-nsfw-sd-sep"></span>'
            + (items || '<span class="yw-nsfw-sd-empty">无档案</span>')
            + '<span class="yw-nsfw-sd-tip">发送NSFW状态给AI</span>';
        if (!host._nsfwRootBound) {
            host._nsfwRootBound = true;
            host.addEventListener('mousedown', (e) => e.stopPropagation());
            host.addEventListener('click', (e) => e.stopPropagation());
        }
        const autoCb = host.querySelector('.yw-nsfw-sd-auto input');
        autoCb.addEventListener('change', (e) => {
            const nextAuto = !!e.target.checked;
            /* Opening AUTO clears one-round overrides only after both stores validate. */
            if (nextAuto) {
                const result = nsfwClearSendOnce(chatId);
                if (!result.ok) { autoCb.checked = auto; sendPreferenceNotice(result); return; }
            }
            st.nsfwAutoSend = nextAuto;
            try { if (_save) _save(); } catch (error) {
                st.nsfwAutoSend = auto; autoCb.checked = auto;
                sendPreferenceNotice({ error: stateError(error) }); return;
            }
            nsfwMountSender();
        });
        host.querySelectorAll('input[data-send]').forEach((cb) => {
            const previous = cb.checked;
            cb.addEventListener('change', () => {
                if (!changeSendCheckbox(cb, chatId, auto, autoPicks, previous)) return;
                nsfwMountSender();
            });
        });
        host.querySelectorAll('.yw-nsfw-sd-name').forEach((el) => {
            el.addEventListener('click', () => nsfwShowSnapshot(el.getAttribute('data-name')));
        });
        nsfwBindSenderDrag(host, host.querySelector('.yw-nsfw-sd-grip'));
        nsfwFloatRefresh();
        nsfwFloatRestore(host, 'kimi_nsfw_sender_pos');
    } catch (e) { }
}
/* ────────────────────────── 展示 ────────────────────────── */

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** ★W433：指南里有、但这一楼没有值的字段 —— 也铺一行「—」占位（新加的字段立刻可见） */
function guideEmptyRowsHtml(profile, grp) {
    try {
        if (!guideUsable()) return '';
        const gm = nsfwGuide();
        const allowed = {};
        activeFields(profile).forEach((f) => { allowed[f.id] = 1; });
        const has = {};
        Object.keys(profile.stats || {}).forEach((id) => {
            const f = fieldById(id);
            const v = f ? fmtVal(viewField(f), profile.stats[id]) : String((profile.stats[id] || {}).value || '');
            if (String(v || '').trim()) has[id] = 1;
        });
        Object.keys(profile.extra || {}).forEach((id) => {
            const e = profile.extra[id] || {};
            if (String(e.value || '').trim() || (Array.isArray(e.list) && e.list.length) || e.empty) has[id] = 1;
        });
        Object.keys(profile.desc || {}).forEach((id) => {
            if (String(((profile.desc || {})[id] || {}).text || '').trim()) has[id] = 1;
        });
        const out = [];
        Object.keys(gm).forEach((id) => {
            if (id === 'name' || id === 'snapTime') return;   /* ★W436：gapLog 没值时也占一行 */
            const g = gm[id] || {};
            if (String(g.group || '') !== grp) return;
            if (/^view/i.test(id)) return;   /* ★W436：多行字段也占位（视线单独画） */
            if (has[id]) return;
            if (fieldById(id) && !allowed[id]) return;   /* 性别筛掉的字段不占位 */
            if (nsfwMaleFrontHidden(profile, id, g.group)) return;   /* ★W468b：清单外的 vOrgasmCount 等也不占位 */
            const lab = g.label || id;
            out.push('<div class="yw-nsfw-row yw-nsfw-ph" data-id="' + esc(id) + '" data-type="text" data-ph="1" data-ord="' + esc(String(typeof g.ord === 'number' ? g.ord : 9999)) + '"><span class="k">' + esc(lab) + '</span><span class="v">—</span><span class="yw-nsfw-c"></span></div>');
        });
        return out.join('');
    } catch (e) { return ''; }
}

/** 一页的行：按 tab 归属取字段（静态参数也进对应分页），顺序 = ord */
function tabRowsHtml(profile, grp, byGroup) {
    const rows = [];
    activeFields(profile).forEach((f) => {
        if (f.id === 'snapTime') return;   /* ★W344：快照时间放标题栏，不在状态页重复一行 */
        const fv = viewField(f);   /* ★W390/W411：中文名/范围/单位/分组都以预设指南为准 */
        if ((fv.tab || fv.group) !== grp) return;
        const cell = (profile.stats || {})[f.id];
        if (!cell || !fmtVal(fv, cell)) return;
        rows.push({ ord: (typeof fv.ord === 'number' ? fv.ord : 9999), html: rowHtml(fv, cell) });   /* ★W415：行序也跟指南 */
    });
    rows.sort((a, b) => a.ord - b.ord);
    if (!rows.length) return '';
    return '<div class="yw-nsfw-rows">' + rows.map((r) => r.html).join('') + '</div>';
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
    const idAttr = ' data-id="' + esc(f.id) + '" data-type="' + esc(f.type) + '"' + optAttr + (f.static ? ' data-static="1"' : '') + ' data-ord="' + esc(String(typeof f.ord === 'number' ? f.ord : 9999)) + '"';   /* ★W416：按指南行序排 */
    const c = '<span class="yw-nsfw-c">' + (cell.comment ? esc(cell.comment) : '') + '</span>';
    if (cell.unknown || isNaish(val)) {
        /* ★W418：N/A 行：不画条、不补单位
           ★W461（作者：N/A 在卡上也显示成「—」，跟没值时一样更好看）——只改显示，值/发送仍是 N/A */
        if (isNaish(val)) {
            return '<div class="yw-nsfw-row yw-nsfw-na yw-nsfw-ph"' + idAttr + '><span class="k">' + esc(f.label) + '</span>' +
                '<span class="v">—</span>' + c + '</div>';
        }
        return '<div class="yw-nsfw-row yw-nsfw-na"' + idAttr + '><span class="k">' + esc(f.label) + '</span>' +
            '<span class="v">' + esc(val || 'N/A') + '</span>' + c + '</div>';
    }
    /* ★W345：四列固定 —— 字段 | 条 | 值 | 评述；条在左、值在右，值尽量不换行（放不下省略号，悬停看全文） */
    const valTxt = esc(withUnit(f, val));
    const wrapCls = (String(withUnit(f, val)).length > 22) ? ' wrap' : '';   /* ★W348：长值才折行，短值不换行 */
    /* ★W350：条紧贴数值（数值定宽 + 条紧跟其后），值紧贴标题；三列：字段|值(含条)|评述 */
    const barHtml = (f.type === 'num' && !f.noBar)
        ? (() => {
            const n = Number(cell.value);
            const max = typeof f.max === 'number' ? f.max : 100;
            const pct = Math.max(0, Math.min(100, (n / max) * 100));
            return '<span class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></span>';
        })()
        : '';
    const cmtTxt = cell.comment ? esc(cell.comment) : '';
    if (barHtml) {
        return '<div class="yw-nsfw-row"' + idAttr + '><span class="k">' + esc(f.label) + '</span>'
            + '<span class="v num" title="' + valTxt + '"><span class="n">' + valTxt + '</span>' + barHtml + '</span>'
            + c + '</div>';
    }
    /* ★W352：无条的行：值（可长）在左、评述浮右；窄屏时评述自动换到下一行 */
    return '<div class="yw-nsfw-row"' + idAttr + '><span class="k">' + esc(f.label) + '</span>'
        + '<span class="v' + wrapCls + '" title="' + valTxt + '">' + valTxt + '</span>'
        + c + '</div>';
}

/** 状态卡（v2：分页 tabs，评述在右）；★W445 opts.names = 这一楼所有角色（>1 时卡头出名字切换） */
export function nsfwRenderCard(name, profile, opts) {
    /* ★W468：楼层里的 profile 是重解析出来的，sex 可能只是默认值；用 bucket 里已推导/手填的性别兜底。
       手填性别优先；bucket 已推导成 male 的也盖过楼层的默认 female。 */
    try {
        const { bucket } = nsfwBucket(nsfwChatId());
        const b = bucket.chars[name] || null;
        if (b) {
            const merged = Object.assign({}, profile || {});
            if (b.manual && b.sex) merged.sex = b.sex;
            else if (b.sex === 'male') merged.sex = 'male';
            else if (!merged.sex) merged.sex = b.sex;
            if (!merged.role && b.role) merged.role = b.role;
            if (merged.manual === undefined) merged.manual = !!b.manual;
            if (!merged.static && b.static) merged.static = b.static;
            profile = merged;
        }
    } catch (eS) { }
    profile = profile || {};
    const wrap = document.createElement('div');
    wrap._nsfwSource = opts && opts.source || null;
    wrap._nsfwRosterSource = opts && opts.rosterSource || null;
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
    const allNames = (opts && Array.isArray(opts.names) && opts.names.length) ? opts.names : [name];   /* ★W445 */
    const nmHtml = allNames.length > 1
        ? '<span class="nm yw-nsfw-names">' + allNames.map((n) => '<button type="button" class="yw-nsfw-name' + (String(n) === String(name) ? ' on' : '') + '" data-name="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</span>'
        : '<span class="nm">' + esc(name) + '</span>';
    head.innerHTML = '<button type="button" class="yw-nsfw-copy-btn" title="复制全部内容">⧉</button>'
        + '<button type="button" class="yw-nsfw-edit-btn" title="编辑这张卡">✎</button>'
        + nmHtml

        + (g('snapTime') ? '<span class="kv yw-nsfw-snaptime">⏱ ' + esc(g('snapTime')) + '</span>' : '')
        + ((nsfwGuideAllows('pregnancy') || nsfwGuideAllows('menstrual')) ? '<span class="kv yw-nsfw-preg">怀孕 ' + preg.risk + '%</span>' : '');   /* ★W413：字段都被删了就不显示派生值 */
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
    /* ★W411：分页先走内置顺序，再把指南里新造的分组补上（否则把字段挪到新组会从卡上消失） */
    const tabGroups = [];
    try { nsfwGuideGroups().forEach((g0) => { if (g0 && tabGroups.indexOf(g0) < 0) tabGroups.push(g0); }); } catch (eG) { }   /* ★W413：指南顺序优先 */
    GROUP_ORDER.forEach((g0) => { if (tabGroups.indexOf(g0) < 0) tabGroups.push(g0); });
    try {
        activeFields(profile).forEach((f) => {
            const fv = viewField(f);
            const g0 = String(fv.tab || fv.group || '').trim();
            if (g0 && tabGroups.indexOf(g0) < 0) tabGroups.push(g0);
        });
    } catch (eT) { }
    tabGroups.forEach((grp) => {
        /* ★W325：「开发」组改成普通计数行（旧的 部位×等级/经验/变化 表已随字段删除） */
        const html = tabRowsHtml(profile, grp, byGroup) + guideEmptyRowsHtml(profile, grp);   /* ★W433 */
        if (html) tabs.push({ id: grp, label: grp, html: html });
    });
    /* ★W375：自定义字段并进它自己所属的【组】分页（作者口径：放哪页就哪页）；组名不在内置列表里就新建一页 */
    try {
        const ex = profile.extra || {};
        const exGroups = [];
        const exG = (id) => nsfwGuideMeta(id) || {};
        const exGroupOf = (id) => String(exG(id).group || (ex[id] && ex[id].group) || "其它");   /* ★W435：指南里有组的字段，分页跟指南走（补录行被追加到块尾时，块里的组不准） */
        const exHas = (id) => { const e = ex[id] || {}; return String(e.value || "").trim() || (Array.isArray(e.list) && e.list.length) || !!e.empty; };
        Object.keys(ex).forEach((id) => {
            if (!nsfwGuideAllows(id)) return;   /* ★W413 */
            if (!exHas(id)) return;
            const g = exGroupOf(id);
            if (nsfwMaleFrontHidden(profile, id, g)) return;   /* ★W468b */
            if (exGroups.indexOf(g) < 0) exGroups.push(g);
        });
        exGroups.forEach((g) => {
            const hitTab = tabs.filter((t) => t.label === g)[0];
            const h = Object.keys(ex)
                .filter((id) => exGroupOf(id) === g && exHas(id) && nsfwGuideAllows(id))
                .map((id) => {
                    const e0 = ex[id] || {};
                    const gm0 = exG(id);
                    const lab0 = String(e0.label || gm0.label || id);
                    /* ★W441：多行字段先看 list —— gapLog 的「值」本来就是空的（内容全在续行），
                       以前先判 empty 就直接画一行「—」，正文之外一条都收不进来。 */
                    const list0 = Array.isArray(e0.list) ? e0.list.filter((v) => String(v == null ? '' : v).trim()) : [];
                    if (list0.length) {
                        return list0.slice(-10).map((v, i) => '<div class="yw-nsfw-row yw-nsfw-log"><span class="k">' + (i === 0 ? esc(lab0) : '') + '</span><span class="v wrap">' + esc(String(v == null ? '' : v)) + '</span></div>').join('');
                    }
                    if (e0.empty && !String(e0.value || '').trim()) {
                        return '<div class="yw-nsfw-row yw-nsfw-ph" data-id="' + esc(id) + '" data-type="text" data-ord="' + esc(String(typeof gm0.ord === 'number' ? gm0.ord : 9999)) + '"><span class="k">' + esc(lab0) + '</span><span class="v">—</span><span class="yw-nsfw-c">' + esc(e0.comment || '') + '</span></div>';
                    }
                    const raw0 = String(e0.value == null ? "" : e0.value).trim();
                    const unit0 = String(e0.unit || gm0.unit || "");
                    /* ★W461：N/A 在卡上与“没值”同款「—」（值/发送仍是 N/A）；未知保留文字 */
                    if (isNaish(raw0)) {
                        return '<div class="yw-nsfw-row yw-nsfw-na yw-nsfw-ph" data-id="' + esc(id) + '" data-type="text" data-ord="' + esc(String(typeof gm0.ord === 'number' ? gm0.ord : 9999)) + '"><span class="k">' + esc(lab0) + '</span><span class="v">—</span><span class="yw-nsfw-c">' + esc(e0.comment || '') + '</span></div>';
                    }
                    /* ★W443：显示统一「值 + 一次单位」——值里有单位先摘掉，未知 不补单位 */
                    const naish0 = /^(未知|unknown)$/i.test(raw0);
                    const val0 = (unit0 && !naish0) ? stripUnitText(raw0, unit0) : raw0;
                    const valTxt0 = esc((!unit0 || naish0) ? raw0 : (val0 ? (val0 + " " + unit0) : raw0));
                    const minE = (typeof e0.min === "number") ? e0.min : (typeof gm0.min === "number" ? gm0.min : null);
                    const maxE = (typeof e0.max === "number") ? e0.max : (typeof gm0.max === "number" ? gm0.max : null);
                    const hasRange = (typeof minE === "number" && typeof maxE === "number");
                    let num0 = null;
                    if (val0 !== "") {
                        const n0 = Number(val0);
                        if (Number.isFinite(n0)) num0 = n0;
                        else { const m0 = /-?\d+(?:\.\d+)?/.exec(val0); if (m0) num0 = Number(m0[0]); }
                    }
                    const isNum = hasRange && num0 !== null;
                    let vHtml = '<span class="v' + (val0.length > 22 ? ' wrap' : '') + '" title="' + valTxt0 + '">' + valTxt0 + '</span>';
                    if (isNum) {
                        const span0 = (maxE - minE) || 1;
                        const pct0 = Math.max(0, Math.min(100, ((num0 - minE) / span0) * 100));
                        vHtml = '<span class="v num" title="' + valTxt0 + '"><span class="n">' + valTxt0 + '</span><span class="bar"><i style="width:' + pct0.toFixed(0) + '%"></i></span></span>';
                    }
                    return '<div class="yw-nsfw-row" data-id="' + esc(id) + '" data-type="' + (isNum ? 'num' : 'text') + '" data-ord="' + esc(String(typeof gm0.ord === 'number' ? gm0.ord : 9999)) + '"><span class="k">' + esc(lab0) + '</span>' + vHtml + '<span class="yw-nsfw-c">' + esc(e0.comment || "") + '</span></div>';
                }).join("");
            if (!h) return;
            if (hitTab) hitTab.html += h;
            else tabs.push({ id: "x-" + g, label: g, html: h });
        });
    } catch (e) { }
    /* ★W436：他人视线也「反向补充」—— 指南里有、这轮没写的，也留一行「—」（不再整页消失）
       ★W437：指南不可用时退回「楼里出现过的视线」；每条按自己的指南组进页（不再全挤第一组） */
    const viewRows = (() => {
        try {
            const gmV = nsfwGuide();
            const ids = Object.keys(gmV).filter((id) => /^view/i.test(id) && nsfwGuideAllows(id));
            Object.keys(profile.desc || {}).forEach((id) => { if (ids.indexOf(id) < 0 && nsfwGuideAllows(id)) ids.push(id); });
            return ids.map((id) => {
                const cell = (profile.desc || {})[id] || {};
                const d0 = NSFW_DESC_FIELDS.find((x) => x.id === id) || {};
                const g0 = gmV[id] || {};
                return { id: id, label: (cell.label || d0.label || g0.label || id), text: String(cell.text || '').trim(), group: String(g0.group || '') };
            });
        } catch (eV) { return []; }
    })();
    if (viewRows.length) {
        const vGroups = [];
        const vGmap = {};
        viewRows.forEach((v) => {
            const gg = String(v.group || '视线') || '视线';
            if (!vGmap[gg]) { vGmap[gg] = { grp: gg, html: '' }; vGroups.push(vGmap[gg]); }
            vGmap[gg].html += (v.text
                ? '<div class="yw-nsfw-viewrow"><span class="lbl">' + esc(v.label) + '</span>' + esc(v.text) + '</div>'
                : '<div class="yw-nsfw-row yw-nsfw-ph" data-id="' + esc(v.id) + '" data-type="text" data-ph="1"><span class="k">' + esc(v.label) + '</span><span class="v">—</span><span class="yw-nsfw-c"></span></div>');
        });
        vGroups.forEach((x) => {
            const hitV = tabs.filter((t) => t.label === x.grp)[0];
            if (hitV) hitV.html += x.html;
            else tabs.push({ id: 'view-' + x.grp, label: x.grp, html: x.html });
        });
    }
    /* ★W429：分页顺序 = 提示词里的组顺序（不再强制近况最后；指南怎么写就怎么排） */
    try {
        const order0 = nsfwGuideGroups();
        if (order0.length) {
            const gm0 = nsfwGuide();
            const groupOfTab = (t) => {
                const lab = String((t && t.label) || '');
                if (lab === '视线') {
                    const k = Object.keys(gm0).find((id) => /^view/.test(id) && gm0[id] && gm0[id].group);
                    if (k) return String(gm0[k].group);
                }
                return lab;
            };
            const keyOf = (t) => { const i0 = order0.indexOf(groupOfTab(t)); return i0 < 0 ? 999 : i0; };
            tabs.sort((a, b) => keyOf(a) - keyOf(b));
        }
    } catch (eOrder) { }
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
        b.setAttribute('data-tab', t.id);   /* ★W423：记住当前分页 */
        b.textContent = t.label;
        b.addEventListener('click', () => {
            /* ★W370：先量一遍目标页，必要时把容器抬高 —— 首次进入最高的「状态」页时整体不再变大 */
            try {
                const target0 = panels.querySelector('[data-panel="' + t.id + '"]');
                if (target0) {
                    const old0 = target0.style.display;
                    target0.style.display = 'block';
                    const h0 = target0.scrollHeight;
                    target0.style.display = old0;
                    const cur0 = parseFloat(panels.style.minHeight) || 0;
                    if (h0 > cur0) panels.style.minHeight = h0 + 'px';
                }
            } catch (e) { }
            tabBar.querySelectorAll('.yw-nsfw-tab').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            panels.querySelectorAll('.yw-nsfw-panel').forEach((x) => x.classList.remove('on'));
            const p = panels.querySelector('[data-panel="' + t.id + '"]');
            if (p) p.classList.add('on');
            /* ★W363：切页时再锁一次高度（首次量的时候可能还没排版） */
            try { if (wrap._nsfwLock) wrap._nsfwLock(); } catch (e) { }
        });
        tabBar.appendChild(b);

        const p = document.createElement('div');
        p.className = 'yw-nsfw-panel' + (i === 0 ? ' on' : '');
        p.setAttribute('data-panel', t.id);
        p.innerHTML = t.html;
        panels.appendChild(p);
    });

    /* ★W416：把每个分页里的行按 data-ord 重排（内置行 + 指南新增的自定义行混在一起也按指南顺序） */
    try {
        panels.querySelectorAll('.yw-nsfw-panel').forEach((p) => {
            const rows0 = Array.prototype.slice.call(p.querySelectorAll('.yw-nsfw-row[data-ord]'));
            if (rows0.length < 2) return;
            const host0 = p.querySelector('.yw-nsfw-rows') || p;
            rows0.sort((a, b) => (Number(a.getAttribute('data-ord')) || 9999) - (Number(b.getAttribute('data-ord')) || 9999));
            rows0.forEach((r) => host0.appendChild(r));
        });
    } catch (eOrd) { }

    wrap.appendChild(tabBar);
    wrap.appendChild(panels);
    /* ★W354/W362：按「最高一页」把面板高度钉死 —— 切分页时上面的分页条不跳位；
       渲染当下可能还没排版（宽度为 0），所以 rAF + 150ms 各再锁一次 */
    const lockPanels = () => {
        if (!wrap.isConnected) return;
        if (wrap.dataset && wrap.dataset.nolock === '1') return;   /* ★W450：一楼多角色时不锁高（只显示一张，避免布局卡死） */
        try {
            if (wrap.classList.contains('is-collapsed')) { panels.style.minHeight = ''; panels.style.height = ''; return; }   /* ★W412：折叠时不量高度 */
            const kids = Array.prototype.slice.call(panels.children);
            /* ★W388：先摘掉上次铺的横线，再量真实内容高度（否则越量越高） */
            kids.forEach((k) => { k.querySelectorAll('.yw-nsfw-fill').forEach((f) => f.remove()); });
            let maxH = 0;
            kids.forEach((k) => {
                const old = k.style.display;
                k.style.display = 'block';
                maxH = Math.max(maxH, Math.min(6000, k.scrollHeight || 0));   /* ★W445b：布局读疯时封顶，别把补空行循环撑爆 */
                k.style.display = old;
            });
            if (maxH > 0) {
                /* ★W404：把容器上下 padding 算进去（只给 maxH 会把最高页底部裁掉 8px / 出滚动条） */
                let padV0 = 8;
                try {
                    const cs0 = getComputedStyle(panels);
                    padV0 = (parseFloat(cs0.paddingTop) || 0) + (parseFloat(cs0.paddingBottom) || 0);
                } catch (e0) { }
                panels.style.minHeight = (maxH + padV0) + 'px';
                panels.style.height = (maxH + padV0) + 'px';
            }
            /* ★W394/W406：比最高页矮的分页，空白处补「空行」（和上面一样一条虚线）；
               分两三轮补 —— 每轮都重新量，直到和最高页齐（最后一块是矮空行，:last-child 去掉底线）。 */
            kids.forEach((k) => {
                for (let pass0 = 0; pass0 < 3; pass0++) {
                    const old = k.style.display;
                    k.style.display = 'block';
                    const used = k.scrollHeight;
                    /* 行高必须在「显示着」的时候量 —— 先 restore 再量会得到 0 */
                    const rows0 = k.querySelectorAll('.yw-nsfw-row');
                    const sample = rows0.length ? rows0[rows0.length - 1] : null;
                    const rowH = sample ? Math.min(80, Math.max(14, Math.round(sample.getBoundingClientRect().height) || 27)) : 27;   /* ★W445b：行高保护 */
                    k.style.display = old;
                    const left = maxH - used;
                    if (left <= 2) break;
                    if (left < rowH) {
                        /* 不足一行：直接补一块「矮空行」，这一页就齐了 */
                        const f2 = document.createElement('div');
                        f2.className = 'yw-nsfw-row yw-nsfw-fill';
                        f2.style.height = left + 'px';
                        k.appendChild(f2);
                        break;
                    }
                    const n = Math.min(120, Math.floor(left / rowH));   /* ★W445b：最多补 120 行，绝不让布局异常把主线程卡死 */
                    for (let i = 0; i < n; i++) {
                        const f = document.createElement('div');
                        f.className = 'yw-nsfw-row yw-nsfw-fill';
                        f.style.height = rowH + 'px';
                        k.appendChild(f);
                    }
                }
            });
        } catch (e) { }
    };
    wrap._nsfwLock = lockPanels;
    lockPanels();
    try { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(lockPanels); } catch (e) { }
    try { setTimeout(lockPanels, 200); } catch (e) { }   /* ★W414：只保留一次迟到锁（以前 5 次/卡） */
    try { bindCardEdit(wrap, name, profile); } catch (e) { }
    return wrap;
}

/** 卡片就地编辑：✎ 进入，✓ 保存 */
function bindCardEdit(wrap, name, profile) {
    const copyBtn = wrap.querySelector('.yw-nsfw-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            const text = nsfwDumpProfile(name, profile);
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
    let editing = false, saving = false;
    let source = wrap._nsfwSource || null;
    const rosterSource = wrap._nsfwRosterSource || null;
    btn.addEventListener('click', async function () {
        if (saving) return;
        const chatId = source ? source.chatId : rosterSource ? rosterSource.identity.chatId : nsfwChatId();
        if (!source && !rosterSource) {
            try {
                if (wrap.dataset.mesid == null || wrap.dataset.mesid === '') throw new Error('缺少楼层来源，请重新打开');
                source = nsfwFloorSource(chatId, Number(wrap.dataset.mesid));
            } catch (error) { stateNotice(error); return; }
        }
        if (source && !sameFloor(source)) { stateNotice('来源已变化，请重新打开后编辑'); return; }
        if (rosterSource && !sameChat(rosterSource.identity)) { stateNotice('聊天已切换，请重新打开'); return; }
        if (!editing) {
            editing = true;
            btn.textContent = '✓';
            btn.title = '保存';
            wrap.classList.add('yw-nsfw-editing');
            /* ★W446b：进编辑前先摘掉补空行/释放钉死高度 —— 输入框和固定高度一起容易把布局拖死 */
            try { wrap.querySelectorAll('.yw-nsfw-fill').forEach((f) => f.remove()); } catch (e0) { }
            try { const pn0 = wrap.querySelector('.yw-nsfw-panels'); if (pn0) { pn0.style.minHeight = ''; pn0.style.height = ''; } } catch (e1) { }
            /* ★W417：先把「指南里有、这一楼没有值」的字段补成空行（N/A 被丢掉后也能在这里补录） */
            try {
                if (guideUsable()) {
                    wrap.querySelectorAll('.yw-nsfw-panel').forEach((panel) => {
                        const grp = panel.getAttribute('data-panel');
                        const host0 = panel.querySelector('.yw-nsfw-rows') || panel;
                        activeFields(profile).forEach((f) => {
                            if (!f || f.id === 'snapTime') return;
                            const fv = viewField(f);
                            if ((fv.tab || fv.group) !== grp) return;
                            if (panel.querySelector('.yw-nsfw-row[data-id="' + f.id + '"]')) return;
                            const cur = (profile.stats || {})[f.id];
                            if (cur && fmtVal(fv, cur)) return;
                            const row = document.createElement('div');
                            row.className = 'yw-nsfw-row';
                            row.setAttribute('data-id', f.id);
                            row.setAttribute('data-type', fv.type || 'text');
                            row.setAttribute('data-new', '1');
                            row.setAttribute('data-ord', String(typeof fv.ord === 'number' ? fv.ord : 9999));   /* ★W438：编辑态也按指南顺序 */
                            if (Array.isArray(fv.options)) row.setAttribute('data-options', fv.options.join('|'));
                            const k = document.createElement('span'); k.className = 'k'; k.textContent = fv.label;
                            const v = document.createElement('span'); v.className = 'v';
                            if (Array.isArray(fv.options)) {
                                const sel = document.createElement('select'); sel.className = 'yw-nsfw-in yw-nsfw-in-v';
                                const ph = document.createElement('option'); ph.value = ''; ph.textContent = '—'; ph.selected = true; sel.appendChild(ph);   /* ★W468：不默认第一项 */
                                fv.options.forEach((op) => { const o = document.createElement('option'); o.value = op; o.textContent = op; sel.appendChild(o); });
                                v.appendChild(sel);
                            } else {
                                const inp = document.createElement('input'); inp.className = 'yw-nsfw-in yw-nsfw-in-v'; inp.type = 'text'; if (fv.type === 'num') inp.inputMode = 'decimal';
                                v.appendChild(inp);
                            }
                            const c = document.createElement('span'); c.className = 'yw-nsfw-c';
                            const inp2 = document.createElement('input'); inp2.className = 'yw-nsfw-in yw-nsfw-in-c'; inp2.placeholder = '评述';
                            c.appendChild(inp2);
                            row.appendChild(k); row.appendChild(v); row.appendChild(c);
                            host0.appendChild(row);
                        });
                    });
                }
            } catch (eNew) { }

            wrap.querySelectorAll('.yw-nsfw-row[data-id]').forEach((row) => {
                const id = row.getAttribute('data-id');
                const isStatic = row.getAttribute('data-static') === '1';
                const type = row.getAttribute('data-type') || 'text';
                const optsAttr = row.getAttribute('data-options') || '';
                if (row.getAttribute('data-new') === '1') return;   /* 补录行已经是输入框，不再转换 */
                /* ★W433：data-ph 占位行没有输入框，继续走下面的转换 */
                const cell = isStatic ? { value: (profile.static || {})[id], comment: '' } : ((profile.stats || {})[id] || (profile.extra || {})[id] || {});   /* ★W376：自定义字段从 extra 取原值 */
                const vEl = row.querySelector('.v') || row.querySelector('.t');
                if (vEl) {
                    vEl.textContent = '';
                    if (optsAttr) {
                        const sel = document.createElement('select');
                        sel.className = 'yw-nsfw-in yw-nsfw-in-v';
                        /* ★W468：N/A / 空 / 不在选项里的旧值 → 先放一个「保持原值」项并选中；
                           以前下拉没有 N/A 项，浏览器自动选第一项，保存就把 N/A 写成「紧闭缝隙状/下沉」。 */
                        const curVal = cell.value == null ? '' : String(cell.value).trim();
                        const opts = optsAttr.split('|').filter(Boolean);
                        if (!opts.includes(curVal)) {
                            const o = document.createElement('option');
                            o.value = isNaish(curVal) ? 'N/A' : curVal;
                            o.textContent = isNaish(curVal) ? 'N/A' : (curVal || '—');
                            o.selected = true;
                            sel.appendChild(o);
                        }
                        if (!curVal) row.setAttribute('data-keep-empty', '1');
                        opts.forEach((op) => {
                            const o = document.createElement('option');
                            o.value = op; o.textContent = op;
                            if (curVal === op) o.selected = true;
                            sel.appendChild(o);
                        });
                        vEl.appendChild(sel);
                    } else {
                        const multi = Array.isArray(cell.list) || !!(nsfwGuideMeta(id) || {}).multi;
                        const inp = document.createElement(multi ? 'textarea' : 'input');
                        inp.className = 'yw-nsfw-in yw-nsfw-in-v';
                        inp.value = Array.isArray(cell.list) ? cell.list.join('\n') : cell.value == null ? '' : String(cell.value);
                        /* ★W415：不再强制 number —— 允许输入 N/A / 18cm / 无（保存后能解析的按数字收，不能的按原文留在楼层） */
                        if (type === 'num') { inp.type = 'text'; inp.inputMode = 'decimal'; }
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
        /* 保存：先把所有行的值收齐，一次性写盘（★W446e：以前每行写一次 localStorage，档案一大就把主线程卡死） */
        const edits = [];
        wrap.querySelectorAll('.yw-nsfw-row[data-id]').forEach((row) => {
            const id = row.getAttribute('data-id');
            const isStatic = row.getAttribute('data-static') === '1';
            const v = row.querySelector('.yw-nsfw-in-v');
            const c = row.querySelector('.yw-nsfw-in-c');
            if (!v) return;
            if (row.getAttribute('data-keep-empty') === '1' && !String(v.value || '').trim()) return;   /* ★W468：原本空的下拉，没选就继续空着 */
            if ((row.getAttribute('data-new') === '1' || row.getAttribute('data-ph') === '1') && !String(v.value || '').trim() && !(c && String(c.value || '').trim())) return;   /* ★W417/W433：补录/占位行没填就不写 */
            edits.push({ id: id, value: v.value, comment: c ? c.value : '', static: isStatic });
        });
        // Unchanged rows do not rewrite formatting, cache timestamps or emit message events.
        const changed = edits.filter(edit => {
            const cell = edit.static ? { value: (profile.static || {})[edit.id] } : (profile.stats || {})[edit.id] || (profile.extra || {})[edit.id] || {};
            const oldValue = Array.isArray(cell.list) ? cell.list.join('\n') : String(cell.value == null ? '' : cell.value);
            return oldValue !== String(edit.value) || String(cell.comment || '') !== String(edit.comment || '');
        });
        saving = true; btn.disabled = true;
        let ok = false;
        try {
            if (source) ok = await nsfwEditFloor(chatId, source.mesid, name, changed, source);
            else if (rosterSource) {
                ok = await stateWrite(async () => {
                    if (!sameChat(rosterSource.identity)) return false;
                    const rec = nsfwGetChar(chatId, name);
                    if (!rec || JSON.stringify(rec) !== rosterSource.version) return false;
                    return !changed.length || nsfwSetStats(chatId, name, changed);
                });
            }
        } catch (error) { stateNotice(error); }
        finally { saving = false; btn.disabled = false; }
        if (!ok) { btn.title = '保存失败，输入已保留；请重试或重新打开'; return; }
        editing = false;
        btn.textContent = '✎'; btn.title = '编辑这张卡';
        try { wrap.classList.remove('yw-nsfw-editing'); } catch (e) {}
        try {
            // A main-floor card belongs to a lazy multi-role cache. Refresh that whole
            // source closure after a save; replacing only one card loses its roster and
            // leaves the other visited cards holding the pre-save source token.
            const preview = !!(wrap.closest && wrap.closest('#yw-nsfw-preview'));
            if (source && !preview && wrap.closest && wrap.closest('.mes')) {
                const active = wrap.querySelector('.yw-nsfw-tab.on');
                if (active) _mesTabSet(chatId, source.mesid, active.getAttribute('data-tab'));
                _charSelSet(chatId, source.mesid, name);
                _foldMap.set(_foldKey(chatId, source.mesid, name), wrap.classList.contains('is-collapsed'));
                if (nsfwMountToMessage(source.mesid, false)) return;
            }
            const rec = source ? nsfwProfilesFromText(String(source.msg.mes || ''))[name] : nsfwGetChar(chatId, name);
            if (rec && wrap.parentNode) {
                const fresh = nsfwRenderCard(name, rec, source
                    ? { source: nsfwFloorSource(chatId, source.mesid) }
                    : { rosterSource: { identity: chatIdentity(chatId), version: JSON.stringify(rec) } });
                if (source) fresh.dataset.mesid = String(source.mesid);
                const preview = !!(wrap.closest && wrap.closest('#yw-nsfw-preview'));
                nsfwApplyFold(fresh, preview ? 'pv' : chatId, source ? source.mesid : 'bucket', name);
                nsfwApplyTab(fresh, preview ? 'pv' : chatId, source ? source.mesid : 'bucket', name);
                wrap.parentNode.replaceChild(fresh, wrap);
            }
        } catch (error) { stateNotice('已保存，重新打开可查看最新状态'); }

    });
}
/** ★W438：找出文本里所有状态块（<div data-nsfw> / <nsfw>），带 body 边界 */
function nsfwTextBlocks(text) {
    const src = String(text || ''), out = [];
    const re = /<div\b[^>]*\bdata-nsfw\s*=\s*(?:"[md]"|'[md]'|[md](?=[\s>]))[^>]*>|<nsfw(?:desc)?\b[^>]*>/gi;
    let m;
    while ((m = re.exec(src))) {
        const isDiv = /^<div/i.test(m[0]);
        const desc = isDiv ? attrVal(m[0], 'data-nsfw').toLowerCase() === 'd' : /^<nsfwdesc/i.test(m[0]);
        const close = isDiv ? /<\/div\s*>/gi : desc ? /<\/nsfwdesc\s*>/gi : /<\/nsfw\s*>/gi;
        const openEnd = m.index + m[0].length;
        close.lastIndex = openEnd;
        const cm = close.exec(src);
        if (!cm) continue;
        const body = src.slice(openEnd, cm.index);
        const line = /^[ \t]*name(?:[ \t]*[\u4e00-\u9fa5]+)?[ \t]*[=:：][ \t]*(.+)$/mi.exec(body);
        const old = /^[ \t]*([^\s=:：]{1,12})[ \t]+\S+[ \t]*=/m.exec(body);
        const name = String(attrVal(m[0], 'data-name') || attrVal(m[0], 'name') || (line && line[1]) || (old && old[1] !== 'name' ? old[1] : '') || '').trim();
        out.push({ name, kind: desc ? 'd' : 'm', openStart: m.index, openEnd, closeIdx: cm.index, closeEnd: cm.index + cm[0].length, body });
        re.lastIndex = cm.index + cm[0].length;
    }
    return out;
}

/** 行首的字段 ID（用于补全/排序；续行 `[16:30] …` 不算） */
function nsfwGuideLineId(line) {
    const s0 = String(line || '').trim();
    if (!s0 || s0.indexOf('=') < 0) return '';
    const m = /^([A-Za-z][A-Za-z0-9_]*)(?![A-Za-z0-9_])[^=]*=/.exec(s0);
    return m ? m[1] : '';
}

/** ★W438：块体按指南补全（缺的字段补在正确组、正确位置）并排好序；返回新块体 */
function nsfwCanonicalBody(body, name, chatId) {
    try {
        if (!guideUsable()) return body;
        const gm = nsfwGuide();
        const NL0 = String(body).indexOf('\r\n') >= 0 ? '\r\n' : '\n';
        const src = String(body).split(/\r?\n/);
        /* name / snapTime 行永远放最上面 */
        const head = [];
        const rest = [];
        src.forEach((ln) => {
            const t0 = ln.trim();
            if (/^name(?:[ \t]+[^=]+)?[ \t]*=/.test(t0) || /^snapTime[ \t]*[^=]*=/.test(t0)) head.push(ln);
            else rest.push(ln);
        });
        /* 切段：每个【组】一段；第一个组头之前的内容单独一段（grp=''） */
        const secs = [];
        let cur = null;
        rest.forEach((ln) => {
            const m = /^【([^】]{1,40})】\s*$/.exec(ln.trim());
            if (m) { cur = { grp: m[1], lines: [] }; secs.push(cur); return; }
            if (!cur) { cur = { grp: '', lines: [] }; secs.push(cur); }
            cur.lines.push(ln);
        });
        const ordOfId = (id) => {
            const g0 = gm[String(id || '')] || {};
            if (typeof g0.ord === 'number') return g0.ord;
            const f = fieldById(id);
            return (f && typeof f.ord === 'number') ? f.ord : 9999;
        };
        /* 段内：字段行 + 它后面的续行 = 一块，按 ord 排 */
        const chunksOf = (sec) => {
            const pre = [];
            const chunks = [];
            let cc = null;
            sec.lines.forEach((ln) => {
                const id = nsfwGuideLineId(ln);
                if (id) { cc = { id: id, ord: ordOfId(id), lines: [ln] }; chunks.push(cc); }
                else if (cc) cc.lines.push(ln);
                else pre.push(ln);
            });
            return { pre: pre, chunks: chunks };
        };
        /* 这个角色可用的指南字段（性别筛掉的内置字段不补） */
        let sex = 'female', rec0 = null;
        try { const { bucket } = nsfwBucket(chatId); rec0 = bucket.chars[name]; if (rec0 && rec0.sex) sex = rec0.sex; } catch (e) { }
        const allow = {};
        activeFields(rec0 || { sex: sex }).forEach((f) => { allow[f.id] = 1; });
        const present = {};
        secs.forEach((sec) => { chunksOf(sec).chunks.forEach((c) => { present[c.id] = 1; }); });
        const want = [];
        const prevValOf = (id) => {
            try {
                const c = rec0 && rec0.stats && rec0.stats[id];
                const v = (c && typeof c === 'object') ? c.value : c;
                return String(v == null ? '' : v).trim();
            } catch (e) { return ''; }
        };
        Object.keys(gm).forEach((id) => {
            if (id === 'name' || id === 'snapTime') return;
            if (!nsfwGuideAllows(id)) return;
            if (present[id]) return;
            if (fieldById(id) && !allow[id]) return;
            const g0 = gm[id] || {};
            if (nsfwMaleFrontHidden(rec0 || { sex: sex }, id, g0.group)) return;   /* ★W468b */
            const pv0 = prevValOf(id);
            /* ★W468：上一轮已经明确是 N/A / 未知的字段，补回块里也必须还是 N/A，
               不能补成空位让 AI 下一轮自己拿选项填一个值出来。 */
            const keep = (isNaish(pv0) || /^(未知|unknown)$/i.test(pv0)) ? 'N/A' : '';
            want.push({ id: id, grp: String(g0.group || '其它'), ord: (typeof g0.ord === 'number' ? g0.ord : 9999), keep: keep });
        });
        /* 缺的字段先建好所属组 */
        const secOf = (grp) => {
            let s0 = secs.filter((x) => x.grp === grp)[0];
            if (!s0) { s0 = { grp: grp, lines: [] }; secs.push(s0); }
            return s0;
        };
        want.forEach((w) => { secOf(w.grp); });
        /* 每段：现有块 + 缺的块 → 按 ord 稳定排序 */
        secs.forEach((sec) => {
            const co = chunksOf(sec);
            want.filter((w) => w.grp === sec.grp).forEach((w) => {
                co.chunks.push({ id: w.id, ord: w.ord, lines: [w.id + ' = ' + (w.keep || '')] });
            });
            co.chunks.sort((a, b) => a.ord - b.ord);
            sec.lines = co.pre.concat.apply(co.pre, co.chunks.map((c) => c.lines));
        });
        /* 段顺序：指南组顺序；无组头那段在前；指南没有的组排后面 */
        const gSeq = (() => { try { return nsfwGuideGroups(); } catch (e) { return []; } })();
        const gKey = (g) => { if (!g) return -1; const i = gSeq.indexOf(g); return i >= 0 ? i : 9999; };
        secs.sort((a, b) => gKey(a.grp) - gKey(b.grp));
        const out = [];
        head.forEach((ln) => out.push(ln));
        secs.forEach((sec) => {
            if (!sec.grp) { sec.lines.forEach((ln) => out.push(ln)); return; }
            out.push('【' + sec.grp + '】');
            sec.lines.forEach((ln) => out.push(ln));
        });
        return out.join(NL0);
    } catch (e) { return body; }
}

/** ★W438：把「最新一条有状态块的楼」按指南补全（缺的字段补回块里，顺序排好） */
export async function nsfwCompleteLatest(chatId) {
    let identity;
    try { identity = chatIdentity(chatId); }
    catch (error) { return { ok: false, mesid: -1, changed: false, error: stateError(error) }; }
    return stateWrite(async () => {
    try {
        if (!sameChat(identity)) throw new Error('聊天已切换，请重新打开');
        const ctx = identity.ctx;
        const cid = identity.chatId;
        for (let i = ctx.chat.length - 1; i >= 0; i--) {
            const msg = ctx.chat[i];
            if (!msg || msg.is_user || msg.is_system) continue;
            const text = String(msg.mes || '');
            if (text.indexOf('<nsfw') < 0 && text.indexOf('data-nsfw') < 0) continue;
            const blocks = nsfwTextBlocks(text).filter(b => b.kind === 'm');
            if (!blocks.length) continue;
            let next = text;
            let changed = false;
            for (let b = blocks.length - 1; b >= 0; b--) {
                const blk = blocks[b];
                const body2 = nsfwCanonicalBody(blk.body, blk.name, cid);
                if (body2 !== blk.body) {
                    next = next.slice(0, blk.openEnd) + body2 + next.slice(blk.closeIdx);
                    changed = true;
                }
            }
            if (!changed) return { ok: true, mesid: i, changed: false };
            const source = nsfwFloorSource(cid, i);
            await commitState(source, patchFloor(source, next), applied => sameFloor(source, applied ? next : undefined),
                () => persistChatBucket(cid, source.chat));
            if (sameChat(source)) {
                let editing = false;
                try { editing = !!document.querySelector('.mes[mesid="' + i + '"] .yw-nsfw-editing'); } catch (e) {}
                if (!editing) { try { nsfwMountToMessage(i); } catch (e) {} }
            }
            return { ok: true, mesid: i, changed: true };
        }
        return { ok: true, mesid: -1, changed: false };
    } catch (error) { return { ok: false, mesid: -1, changed: false, error: stateError(error) }; }
    });
}

/** ★W362：编辑卡片后写回楼层块（值/评述），并同步 swipes + 存盘 + 重渲染 */
function editBlockBody(body, changes) {
    const NL0 = body.includes('\r\n') ? '\r\n' : '\n';
    let lines = body.split(/\r?\n/);
    for (const ch of changes || []) {
        const id = String(ch.id || '');
        if (!id || /[\r\n=]/.test(id)) continue;
        const multi = !!(nsfwGuideMeta(id) || {}).multi;
        const value = String(ch.value == null ? '' : ch.value);
        const comment = String(ch.comment || '');
        const valueLines = value.split(/\r?\n/);
        const encodedValue = (multi ? [valueLines[0] + (comment ? '|' + comment : ''), ...valueLines.slice(1)].join(NL0) : value + (comment ? '|' + comment : ''));
        // Field separators in values are still the protocol; closing shells cannot be injected.
        if (/<\/(?:nsfw|div)/i.test(value + comment)) throw new Error('字段值不能包含状态块结束标签');
        const hits = [];
        for (let i = 0; i < lines.length; i++) {
            const eq = lines[i].indexOf('=');
            if (eq < 0) continue;
            const rawKey = lines[i].slice(0, eq).trim();
            const f = resolveFieldKey(rawKey, nsfwAllFields());
            if ((f && f.id === id) || rawKey.split(/\s+/)[0] === id) {
                let end = i + 1;
                if (multi) while (end < lines.length && !/^[ \t]*【/.test(lines[end]) && lines[end].indexOf('=') < 0) end++;
                hits.push({ start: i, end, eq });
            }
        }
        if (hits.length) {
            const first = hits[0];
            const original = lines.slice(first.start, first.end);
            const firstValue = splitValueComment(lines[first.start].slice(first.eq + 1).trim());
            const originalValue = multi ? [String(firstValue.value), ...original.slice(1).map(s => s.trim()).filter(Boolean)].join('\n') : String(firstValue.value);
            if (hits.length === 1 && originalValue === value && String(firstValue.comment || '') === comment) continue;
            for (let h = hits.length - 1; h >= 0; h--) {
                const hit = hits[h];
                const replacement = h === 0 ? [lines[hit.start].slice(0, hit.eq + 1) + ' ' + encodedValue] : [];
                // Keep trailing blank spacing, remove only stale continuation content.
                const blanks = multi ? lines.slice(hit.start + 1, hit.end).filter(s => !s.trim()) : [];
                lines.splice(hit.start, hit.end - hit.start, ...replacement, ...blanks);
            }
        } else {
            if (!value && !comment) continue;
            const group = String((nsfwGuideMeta(id) || {}).group || '');
            let at = lines.length;
            if (group) {
                const header = lines.findIndex(s => s.trim() === '【' + group + '】');
                if (header >= 0) { at = header + 1; while (at < lines.length && !/^[ \t]*【/.test(lines[at])) at++; }
                else { if (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push('【' + group + '】'); at = lines.length; }
            }
            lines.splice(at, 0, id + '=' + encodedValue);
        }
    }
    return lines.join(NL0);
}
export async function nsfwEditFloor(chatId, mesid, name, changes, expectedSource) {
    let source;
    try { source = expectedSource || nsfwFloorSource(chatId, mesid); }
    catch (error) { return false; }
    return stateWrite(async () => {
        try {
            if (source.chatId !== String(chatId) || source.mesid !== Number(mesid) || !sameFloor(source)) throw new Error('来源已变化，请重新打开后保存');
            // Parsing merges repeated role blocks in source order; the last value wins.
            const matching = nsfwTextBlocks(source.text).filter(b => b.kind === 'm' && b.name === name);
            const block = matching[matching.length - 1];
            if (!block) return false;
            const body = editBlockBody(block.body, changes);
            const next = source.text.slice(0, block.openEnd) + body + source.text.slice(block.closeIdx);
            if (next === source.text) return true;
            await commitState(source, patchFloor(source, next), applied => sameFloor(source, applied ? next : undefined),
                () => persistChatBucket(source.chatId, source.chat));
            await emitStateSaved(source, source.mesid);
            return true;
        } catch (error) { stateNotice(error); return false; }
    });
}

/** 示例填充：给当前聊天塞一个全字段角色，方便先看效果 */
export function nsfwFillDemo(chatId, name) {
    try {
        const n = String(name || '');
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
export function nsfwDumpProfile(name, rec) {
    if (!rec) return '';
    const lines = ['== ' + name + ' (' + (rec.sex || 'female') + ' / ' + (rec.role || 'bottom') + ') =='];
    const all = nsfwAllFields();
    Object.keys(rec.stats || {}).forEach(id => {
        const cell = rec.stats[id] || {}, f = all.find(x => x.id === id) || { id, label: id };
        const value = Array.isArray(cell.value) ? cell.value.join('、') : String(cell.value == null ? '' : cell.value);
        lines.push(id + ' ' + f.label + ' = ' + value + (cell.comment ? '|' + cell.comment : ''));
    });
    Object.keys(rec.extra || {}).forEach(id => {
        const cell = rec.extra[id] || {};
        const value = Array.isArray(cell.list) ? cell.list.join('\n') : String(cell.value == null ? '' : cell.value);
        lines.push(id + ' ' + (cell.label || id) + ' = ' + value + (cell.comment ? '|' + cell.comment : ''));
    });
    Object.keys(rec.static || {}).forEach(id => {
        const f = all.find(x => x.id === id);
        lines.push('[档案] ' + (f && f.label || id) + ' = ' + rec.static[id]);
    });
    Object.keys(rec.desc || {}).forEach(id => {
        const cell = rec.desc[id], f = NSFW_DESC_FIELDS.find(x => x.id === id);
        lines.push((cell && cell.label || f && f.label || id) + ': ' + (typeof cell === 'object' ? cell.text || '' : cell || ''));
    });
    return lines.join('\n');
}
export function nsfwDumpChar(chatId, name) {
    try { return nsfwDumpProfile(name, nsfwGetChar(chatId, name)); } catch (e) { return ''; }
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
    '.mes.yw-nsfw-hide .yw-nsfw{display:none !important}',   /* ★W407：生成期间只藏正在生成那一楼的卡（前面楼层的照常看） */
    '.mes_text nsfw,.mes_text nsfwdesc{display:none !important}',
    '.yw-nsfw{margin:6px 0 8px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 16%,transparent);border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 3%,transparent);font-size:0.86em}',
    '.yw-nsfw-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:6px 9px;border-bottom:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent);background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 5%,transparent)}',
    '.yw-nsfw-head .nm{font-weight:700;letter-spacing:.5px}',
    '.yw-nsfw-head .nm.yw-nsfw-names{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;letter-spacing:0}',
    '.yw-nsfw-name{font:inherit;font-weight:400;color:inherit;background:transparent;border:1px solid transparent;border-radius:7px;padding:0 7px;line-height:1.5;cursor:pointer;opacity:.55;transition:opacity .12s,background .12s,border-color .12s}',
    '.yw-nsfw-name:hover{opacity:.9}',
    '.yw-nsfw-name.on{opacity:1;font-weight:700;border-color:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 30%,transparent);background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent)}',
    '.yw-nsfw-head .tag{font-size:.78em;opacity:.75;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);border-radius:999px;padding:0 6px}',
    '.yw-nsfw-head .kv{margin-left:auto;font-size:.8em;opacity:.8}',
    '.yw-nsfw-head .kv+.kv{margin-left:8px}',
    '.yw-nsfw-head .kv~.yw-nsfw-fold{margin-left:6px}',   /* ★W467：折叠箭头别再抢 auto —— 日期/怀孕先靠右，箭头跟在它们后面 */
    '.yw-nsfw-head .yw-nsfw-preg{opacity:.95;font-weight:600}',
    '.yw-nsfw-tabs{display:flex;flex-wrap:wrap;gap:3px;padding:5px 7px 0;position:sticky;top:0;z-index:1;background:inherit}',
    '.yw-nsfw-tab{font:inherit;font-size:.78em;padding:1px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 22%,transparent);background:transparent;color:inherit;opacity:.62;cursor:pointer}',
    '.yw-nsfw-tab.on{opacity:1;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent);border-color:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 45%,transparent)}',
    '.yw-nsfw-panels{padding:2px 7px 6px;box-sizing:border-box;overflow-x:hidden}',

    '.yw-nsfw-panel{display:none}',
    '.yw-nsfw-panel.on{display:block}',
    /* ★W346：这行原来是给 div 布局写的 flex —— 套在 <tr> 上会把 td 变成 block，列宽全失效（值被挤成一字一行）。tr 上只留行距。 */
    /* ★W352 统一行布局：字段(定宽)|值(+条)|评述(右)；字号全继承，只有透明度区分；条用 px 固定，窄屏不缩 */
    '.yw-nsfw-rows{display:block}',
    '.yw-nsfw-fill{pointer-events:none;box-sizing:border-box;padding-top:0;padding-bottom:0}',
    '.yw-nsfw-panel > .yw-nsfw-row:last-child,.yw-nsfw-panel > .yw-nsfw-rows:last-child > .yw-nsfw-row:last-child{border-bottom:0}',
    '.yw-nsfw-row{display:flex;align-items:baseline;gap:8px;padding:3px 2px;line-height:1.5;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 8%,transparent)}',
    '.yw-nsfw-row .k{flex:0 0 92px;opacity:.78;white-space:nowrap}',
    '.yw-nsfw-row .v{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.yw-nsfw-row .v .n{display:inline-block;min-width:26px;text-align:left}',
    '.yw-nsfw-row .v.wrap{white-space:normal;overflow-wrap:anywhere;display:inline-block}',
    '.yw-nsfw-row .bar{flex:0 0 52px;width:52px;height:6px;border-radius:999px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 14%,transparent);overflow:hidden;align-self:center}',
    '.yw-nsfw-row .bar>i{display:block;height:100%;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 60%,transparent)}',


    '.yw-nsfw-row .yw-nsfw-c{flex:1 1 auto;min-width:0;margin-left:auto;text-align:right;opacity:.6;font-size:.88em;font-style:italic;overflow-wrap:anywhere}',
    '.yw-nsfw-viewrow{padding:3px 2px;line-height:1.6;font-style:italic;opacity:.85}',   /* ★W362：与左侧字段同字号 */
    '.yw-nsfw-viewrow .lbl{opacity:.55;font-style:normal;margin-right:6px}',
    '.yw-nsfw-empty{padding:10px;opacity:.6;font-size:.86em}',
    '.yw-nsfw-tbl{width:100%;border-collapse:collapse;font-size:.86em;margin:2px 0;table-layout:auto}',
    '.yw-nsfw-tbl thead th{opacity:.45;font-weight:500;font-size:.9em;padding:2px 4px;text-align:left;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent)}',
    '.yw-nsfw-tbl tbody th{width:1%;font-weight:500;opacity:.72;padding:2px 8px 2px 4px;text-align:left;white-space:nowrap;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 8%,transparent)}',
    '.yw-nsfw-tbl td{padding:2px 4px;border-bottom:1px dashed color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 8%,transparent);vertical-align:middle}',
    '.yw-nsfw-tbl td.v{white-space:nowrap;line-height:1.35}',
    '.yw-nsfw-tbl td.v.num{width:1%;font-variant-numeric:tabular-nums}',
    '.yw-nsfw-tbl td.v.wrap{white-space:normal;overflow-wrap:anywhere}',
    '.yw-nsfw-tbl td.v:empty{min-height:1em}',
    '.yw-nsfw-tbl td.v .n{display:inline-block;min-width:3.2em;text-align:left;margin-right:4px}',
    '.yw-nsfw-tbl td.v .vcmt{float:right;max-width:56%;margin-left:12px;opacity:.6;font-size:.9em;font-style:italic;text-align:right;overflow-wrap:anywhere}',
    '.yw-nsfw-tbl td.v .bar{display:inline-block;width:4.6em;height:5px;border-radius:999px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 14%,transparent);overflow:hidden;vertical-align:middle}',
    '.yw-nsfw-tbl td.v .bar>i{display:block;height:100%;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 60%,transparent)}',
    /* ★W327 悬浮发送条：一条横条，可拖；AUTO 在左，名字在右；点名字看快照 */
    '#yw-nsfw-viewport{position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;pointer-events:none;z-index:30040;overflow:visible}',
    '#yw-nsfw-sender{position:absolute;pointer-events:auto;box-sizing:border-box;width:max-content;flex-wrap:wrap;overflow:auto;overscroll-behavior:contain;right:12px;bottom:86px;z-index:30040;display:flex;align-items:center;column-gap:6px;row-gap:1px;max-width:min(92vw,560px);padding:3px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 26%,transparent);background:color-mix(in srgb,var(--SmartThemeBlurTintColor,transparent) 88%,transparent);backdrop-filter:blur(10px);color:var(--SmartThemeBodyColor,currentColor);font-size:12px;line-height:1.2;box-shadow:0 4px 16px rgba(0,0,0,.22);user-select:none}',
    '#yw-nsfw-sender .yw-nsfw-sd-grip{cursor:grab;opacity:.45;padding:0 2px;letter-spacing:-2px}',
    '#yw-nsfw-sender .yw-nsfw-sd-grip:active{cursor:grabbing}',
    '#yw-nsfw-sender .yw-nsfw-sd-auto{min-height:20px;flex-shrink:0;display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-weight:600;white-space:nowrap}',
    '#yw-nsfw-sender .yw-nsfw-sd-auto input{accent-color:var(--SmartThemeBodyColor,currentColor);margin:0}',
    '#yw-nsfw-sender .yw-nsfw-sd-sep{width:1px;height:14px;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 22%,transparent)}',
    '#yw-nsfw-sender .yw-nsfw-sd-item{max-width:100%;min-width:0;flex-shrink:0;display:inline-flex;align-items:center;gap:3px;padding:1px 2px;border-radius:999px}',
    '#yw-nsfw-sender .yw-nsfw-sd-item:hover{background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent)}',
    '#yw-nsfw-sender .yw-nsfw-sd-item input{accent-color:var(--SmartThemeBodyColor,currentColor);margin:0;flex:0 0 auto;width:var(--mainFontSize,15px);height:var(--mainFontSize,15px)}',
    '#yw-nsfw-sender .yw-nsfw-sd-name{cursor:pointer;font-weight:500;white-space:normal;overflow-wrap:anywhere;min-width:0;min-height:20px;display:inline-flex;align-items:center;padding:0 2px}',
    '#yw-nsfw-sender .yw-nsfw-sd-name:hover{text-decoration:underline}',
    '#yw-nsfw-sender .yw-nsfw-sd-empty{opacity:.6}',
    '#yw-nsfw-sender .yw-nsfw-sd-tip{flex:0 0 100%;width:0;min-width:100%;box-sizing:border-box;text-align:center;font-size:8px;line-height:1.1;opacity:.65;padding:0;white-space:nowrap;pointer-events:none}',
    /* ★W386 设置卡名册：与悬浮条同款芯片，AUTO 右侧横向排开、放不下自动换行 */
    '.kimi-nsfw-autorow{display:flex;align-items:center;flex-wrap:wrap;gap:6px}',
    '.kimi-nsfw-roster{flex:1 1 auto;min-width:0}',
    '.kimi-nsfw-roster .yw-nsfw-sd-items{display:flex;flex-wrap:wrap;align-items:center;gap:6px}',
    '.kimi-nsfw-roster .yw-nsfw-sd-item{display:inline-flex;align-items:center;gap:4px;padding:1px 4px;border-radius:999px}',
    '.kimi-nsfw-roster .yw-nsfw-sd-item:hover{background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent)}',
    '.kimi-nsfw-roster .yw-nsfw-sd-item input{accent-color:var(--SmartThemeBodyColor,currentColor);margin:0}',
    '.kimi-nsfw-roster .yw-nsfw-sd-name{cursor:pointer;font-weight:500;white-space:nowrap;padding:0 2px}',
    '.kimi-nsfw-roster .yw-nsfw-sd-name:hover{text-decoration:underline}',
    '#yw-nsfw-preview{position:absolute;pointer-events:auto;box-sizing:border-box;overscroll-behavior:contain;right:12px;bottom:130px;z-index:30050;display:none;width:min(92vw,420px);max-height:70vh;overflow:auto;border-radius:14px;border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 24%,transparent);background:var(--SmartThemeBlurTintColor,transparent);backdrop-filter:blur(12px);box-shadow:0 10px 34px rgba(0,0,0,.3);padding:8px;color:var(--SmartThemeBodyColor,currentColor);font-size:12px}',
    '#yw-nsfw-preview .yw-nsfw-pv-hd{position:sticky;top:-8px;z-index:3;background:var(--SmartThemeBlurTintColor,Canvas);min-height:32px;display:flex;align-items:center;justify-content:space-between;gap:4px;font-weight:600;margin-bottom:6px;padding:0 2px}',
    '#yw-nsfw-preview .yw-nsfw-pv-title{flex:1 1 auto;min-width:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#yw-nsfw-preview .yw-nsfw-pv-nav{cursor:pointer;border:0;background:transparent;color:inherit;opacity:.65;font-size:14px;line-height:1;padding:2px 6px;border-radius:6px}',
    '#yw-nsfw-preview .yw-nsfw-pv-nav:hover{opacity:1;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 10%,transparent)}',
    '#yw-nsfw-preview .yw-nsfw-pv-nav:disabled{opacity:.2;cursor:default;background:transparent}',
    '#yw-nsfw-preview .yw-nsfw-pv-del{cursor:pointer;border:0;background:transparent;color:inherit;opacity:.55;font-size:14px;line-height:1;padding:2px 4px;border-radius:6px}',
    '#yw-nsfw-preview .yw-nsfw-pv-del:hover{opacity:1;background:color-mix(in srgb,var(--SmartThemeBodyColor,currentColor) 12%,transparent)}',
    '#yw-nsfw-preview .yw-nsfw-pv-x{cursor:pointer;border:0;background:transparent;color:inherit;opacity:.6;font-size:14px;padding:2px 4px}',
    '#yw-nsfw-preview .yw-nsfw{margin:0}',
    '#yw-nsfw-preview .yw-nsfw-pv-nav,#yw-nsfw-preview .yw-nsfw-pv-del,#yw-nsfw-preview .yw-nsfw-pv-x,#yw-nsfw-preview .yw-nsfw-copy-btn,#yw-nsfw-preview .yw-nsfw-edit-btn{box-sizing:border-box;min-width:32px;min-height:32px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}',
    '#yw-nsfw-preview .yw-nsfw-head{position:sticky;top:30px;z-index:2;background:var(--SmartThemeBlurTintColor,Canvas);min-height:32px}',
    '#yw-nsfw-preview .yw-nsfw-tabs{position:static}',
    '#yw-nsfw-preview .yw-nsfw-tab{box-sizing:border-box;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center}',
    '#yw-nsfw-preview .yw-nsfw-editing .yw-nsfw-in{box-sizing:border-box;min-width:0;max-width:100%;min-height:32px;scroll-margin-block:90px 12px}',
    '#yw-nsfw-preview .yw-nsfw-editing .v{max-width:100%;min-width:0}',
    '@media(max-width:600px){#yw-nsfw-preview .yw-nsfw-editing .yw-nsfw-row .v{flex:1 1 0}#yw-nsfw-preview .yw-nsfw-editing .yw-nsfw-in{font-size:16px}#yw-nsfw-preview .yw-nsfw-head .kv{overflow-wrap:anywhere;min-width:0}#yw-nsfw-preview .yw-nsfw-head .nm{overflow-wrap:anywhere;min-width:0}}',
    '@media (max-width:600px){.yw-nsfw-tbl{font-size:.8em}.yw-nsfw-tbl td.v{white-space:normal;overflow-wrap:anywhere}.yw-nsfw-tbl td.yw-nsfw-c{font-size:.86em}}',
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
    '.yw-nsfw--compact .yw-nsfw-row .k{opacity:.68}',
    '.yw-nsfw--loose .yw-nsfw-row{padding:5px 2px;line-height:1.6}',
    '.yw-nsfw.is-collapsed .yw-nsfw-tabs,.yw-nsfw.is-collapsed .yw-nsfw-panels{display:none !important}',   /* ★W412 折叠 */
    '.yw-nsfw-head{cursor:pointer}',
    '.yw-nsfw-fold{margin-left:auto;opacity:.55;font-size:.95em;padding:0 2px;flex:0 0 auto}',
    '.yw-nsfw-row.yw-nsfw-ph .v{opacity:.4}',
    '@media (max-width:600px){.yw-nsfw-row{flex-wrap:wrap}.yw-nsfw-row .k{flex-basis:76px}.yw-nsfw-row .v:not(.num){flex:1 1 0;display:block;white-space:normal;overflow-wrap:anywhere}.yw-nsfw-row .yw-nsfw-c{flex:1 1 100%;text-align:left;margin-left:84px}}'
].join('');

const NSFW_CSS_VER = 'rows-20261113-1';   /* ★W414：CSS 有改动就改这里；否则不再每挂一张卡就重注入整份样式 */
export function nsfwEnsureStyle() {
    try {
        const old = document.getElementById('yw-nsfw-style');
        if (old && old.getAttribute('data-ver') === NSFW_CSS_VER) return;
        if (old) old.remove();
        const st = document.createElement('style');
        st.id = 'yw-nsfw-style';
        st.setAttribute('data-ver', NSFW_CSS_VER);
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
            const sexMeta = (meta.sex === 'm' || meta.sex === 'male') ? 'male' : (meta.sex === 'o' || meta.sex === 'other' ? 'other' : '');
            let sex = sexMeta;
            const role = (meta.role === 'top') ? 'top' : (meta.role === 'switch' ? 'switch' : 'bottom');
            const stats = {};
            /* ★W404：楼里的卡也要过一遍「合并层同款」校验 —— 否则 N/A/未知 会照画、条的宽度变 NaN */
            Object.keys(c.machine || {}).forEach((id) => {
                if (!nsfwGuideAllows(id)) return;   /* ★W413：指南里没有的字段不画 */
                const cell = c.machine[id] || {};
                const val0 = String(cell.value == null ? '' : cell.value).trim();
                if (!val0) return;
                const f = viewField(fieldById(id));   /* ★W413：上限也按指南 */
                if (f && f.type === 'num') {
                    const n = clampNum(f, val0);
                    if (n === null) { stats[id] = { value: String(val0), comment: cell.comment || '', unknown: true }; return; }   /* ★W420：原文显示 */
                    stats[id] = { value: n, comment: cell.comment || '' };
                } else {
                    stats[id] = cell;
                }
            });
            const desc = {};
            Object.keys(c.desc || {}).forEach((id) => {
                if (!nsfwGuideAllows(id)) return;
                const dv = c.desc[id];
                if (dv && typeof dv === 'object') desc[id] = { text: String(dv.text || ''), label: String(dv.label || '') };
                else desc[id] = { text: String(dv || ''), label: '' };
            });
            /* ★W396：楼里的卡是从这段文本重拼的 —— 必须把自定义字段（近况/用户加的分组）一起带上，
               否则卡上永远没有「近况」分页（bucket 里有、但这里丢了） */
            const extra = {};
            Object.keys(c.extra || {}).forEach((id) => { if (nsfwGuideAllows(id)) extra[id] = Object.assign({}, c.extra[id]); });
            if (!sex) sex = nsfwSexFromStats(stats, 'female');
            out[name] = { sex: sex, role: role, stats: stats, desc: desc, extra: extra };
        });
    } catch (e) { }
    return out;
}
/** 隐藏正文里的原始块（显示层不改 mes；块本身留在楼层里，小铅笔能看到） */
/** ★W380：在「显示层」把 <nsfw> 换成带 data-nsfw 的 div（不碰 mes）——
 *  现代酒馆有 messageFormatter.addHook（在 DOMPurify 之前跑），用它就不必改写聊天记录。 */
/** ★W382：显示层直接把整块删掉（不用 div 外壳）——值和标签都留在 mes 里，只是不渲染 */
export function nsfwStripForDisplay(text) {
    let s = String(text || '');
    if (s.indexOf('<nsfw') < 0) return s;
    const NLc = String.fromCharCode(10);
    let guard = 0;
    while (guard++ < 50) {
        const i = s.indexOf('<nsfw');
        if (i < 0) break;
        const isDesc = s.slice(i, i + 9).toLowerCase() === '<nsfwdesc';
        const openEnd = s.indexOf('>', i);
        if (openEnd < 0) break;
        const closeTag = isDesc ? '</nsfwdesc>' : '</nsfw>';
        const j = s.toLowerCase().indexOf(closeTag, openEnd);
        if (j >= 0) { s = s.slice(0, i) + s.slice(j + closeTag.length); continue; }
        /* 没闭合：只有像块（含换行或 =）才删到结尾，单独一个标签提及保持原样 */
        const rest = s.slice(openEnd + 1);
        if (rest.indexOf(NLc) >= 0 || rest.indexOf('=') >= 0) { s = s.slice(0, i); break; }
        break;
    }
    return s;
}
export function nsfwInstallFormatterHook() {
    try {
        if (typeof window === 'undefined' || !window.SillyTavern || !window.SillyTavern.getContext) return false;
        const ctx = window.SillyTavern.getContext();
        const fmt = ctx && ctx.messageFormatter;
        if (!fmt || typeof fmt.addHook !== 'function') return false;
        if (window.__ywNsfwFmtHooked) return true;
        fmt.addHook((mes) => {
            try {
                /* ★W402：钩子只挂一次 —— 必须**每次格式化时**看当前开关，
                   否则用户把「捕捉并隐藏」关掉后原文仍然被藏（刷新也不回来）。 */
                const st = _getSettings() || {};
                if (st.nsfwCaptureHide === false) return mes;
                return nsfwStripForDisplay(mes);
            } catch (e) { return mes; }
        }, { order: 0 });
        window.__ywNsfwFmtHooked = true;
        return true;
    } catch (e) { return false; }
}
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

/** ★W465：只画最新一条「带状态块」的 assistant 的卡（再往后的 SFW 回复不画卡）。
    旧楼不再渲染整张卡 —— 看历史请点悬浮条名字，用预览里的 ◀ ▶ 按需读那一楼。 */
export function nsfwLatestCardFloor(ctx) {
    try {
        const c = ctx || ((typeof window !== 'undefined' && window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null);
        const chat = (c && Array.isArray(c.chat)) ? c.chat : [];
        for (let i = chat.length - 1; i >= 0; i--) {
            const m = chat[i];
            if (!m || m.is_user || m.is_system) continue;
            const t = String(m.mes || '');
            if (t.indexOf('<nsfw') >= 0 || t.indexOf('data-nsfw') >= 0) return i;
        }
    } catch (e) { }
    return -1;
}
/** ★W465：把非最新楼的卡摘掉（正在编辑的那张先留着，保存后再收）。 */
function nsfwPruneOldCards(keepId) {
    try {
        const keep = Number(keepId);
        document.querySelectorAll('#chat .mes[mesid]').forEach((el) => {
            const id = Number(el.getAttribute('mesid'));
            if (Number.isFinite(id) && id === keep) return;
            el.querySelectorAll('.yw-nsfw').forEach((card) => {
                try {
                    if (card.classList && card.classList.contains('yw-nsfw-editing')) return;
                    card.remove();
                } catch (e) { }
            });
        });
    } catch (e) { }
}

export function nsfwMountToMessage(messageId, onlyIfMissing) {
    try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext ? window.SillyTavern.getContext() : null;
        const msg = ctx && ctx.chat ? ctx.chat[messageId] : null;
        if (!msg || msg.is_user || msg.is_system) return false;
        const __st = _getSettings() || {};
        if (__st.nsfwCaptureHide === false) return false;   /* ★W377 */
        if (!__st.nsfwEnabled) return false;   /* ★W381：画卡属于「启用状态栏」，捕捉只负责隐藏 */
        const chatId = nsfwChatId(ctx);
        const { bucket } = nsfwBucket(chatId);
        const bucketNames = (bucket.order || []).filter((n) => bucket.chars[n] && bucket.chars[n].updatedAt);

        const mesEl = document.querySelector('.mes[mesid="' + messageId + '"]');
        if (!mesEl) return false;
        /* ★W465：只保留最新一楼的卡；旧楼调用到这里只做摘卡，不解析、不建卡。 */
        const latestId = nsfwLatestCardFloor(ctx);
        nsfwPruneOldCards(latestId);
        if (latestId !== Number(messageId)) {
            /* 旧楼/刚切到没块的 SFW 分支：把最新那张带块的卡补回来（只补缺，不重建） */
            if (latestId >= 0) { try { nsfwMountToMessage(latestId, true); } catch (eL) { } }
            return false;
        }
        /* ★W448：只在“卡丢了”时补挂 —— 卡还在就别再重建（编辑后 450ms 的兜底重建会把布局卡死） */
        if (onlyIfMissing) {
            const ex0 = mesEl.querySelector('.yw-nsfw');
            if (ex0 && ex0.dataset && String(ex0.dataset.mesid || '') === String(messageId)) return true;
        }
        /* ★W422：先判断有没有块，再决定要不要动卡（没块的楼保留原卡，别被全量重挂顺手清掉） */

        /* ★W315：卡片只认这一楼自己的块（块就在 mes 里，像 todo/remind 一样跟着楼层走）
           ★W332：没有块就不画 —— 以前会退回「档案里最新状态」，导致新楼/新分支正文里随口提到名字就挂出一张旧卡 */
        const text = String(msg.mes || '');
        const own = nsfwProfilesFromText(text);
        const ownNames = Object.keys(own);
        /* ★W397：只认这一楼自己的块 —— 不再退回「按楼存的快照」。
           新分支/重roll 后如果这楼还没有自己的块（比如生成中途停止），
           那张快照还是上一个分支的 ⇒ 绝不能把旧图表挂到新分支上。 */
        if (!ownNames.length) return false;
        const pick = (n) => own[n] || bucket.chars[n] || { sex: 'female', role: 'bottom', stats: {}, desc: {} };

        nsfwEnsureStyle();
        mesEl.querySelectorAll('.yw-nsfw').forEach((n) => n.remove());
        nsfwHideRaw(mesEl);
        /* ★W446：一楼多个块 —— 只把选中的那张插进 DOM，其它卡先留在内存里；名字按钮只换卡，不重建（编辑/折叠/分页都不丢） */
        let selName = _charSelGet(chatId, messageId);
        if (ownNames.indexOf(selName) < 0) selName = ownNames[0];
        _charSelSet(chatId, messageId, selName);
        const cards = [];
        const anchorNode = mesEl.querySelector('.mes_text') || mesEl;
        const mountSource = nsfwFloorSource(chatId, messageId);
        const ensureCard = (n) => {
            let hit = cards.filter((x) => x.name === n)[0];
            if (hit) return hit;
            if (ownNames.indexOf(n) < 0) return null;
            const card = nsfwRenderCard(n, pick(n), { names: ownNames, source: mountSource });
            card.dataset.mesid = String(messageId);
            try { nsfwApplyFold(card, chatId, messageId, n); } catch (eF) { }
            try { nsfwApplyTab(card, chatId, messageId, n); } catch (eT) { }
            hit = { name: n, card: card };
            cards.push(hit);
            card.querySelectorAll('.yw-nsfw-name[data-name]').forEach((b) => {
                b.addEventListener('click', (ev) => {
                    try { ev.stopPropagation(); } catch (e0) { }
                    const nn = b.getAttribute('data-name');
                    if (!nn || nn === selName || cards.some((y) => y.card.classList.contains('yw-nsfw-editing'))) return;
                    setTimeout(() => {
                        try {
                            if (!card.isConnected || !sameFloor(mountSource) || cards.some((y) => y.card.classList.contains('yw-nsfw-editing'))) return;
                            applySel(nn);
                        } catch (e1) { }
                    }, 0);
                });
            });
            return hit;
        };
        const applySel = (nn) => {
            const prev = cards.filter((x) => x.card.isConnected)[0];
            const wasCollapsed = !!(prev && prev.card.classList.contains('is-collapsed'));
            const prevTabBtn = prev ? prev.card.querySelector('.yw-nsfw-tab.on') : null;
            const prevTabId = prevTabBtn ? prevTabBtn.getAttribute('data-tab') : '';
            const prevTabIdx = prevTabBtn ? Array.prototype.indexOf.call(prev.card.querySelectorAll('.yw-nsfw-tab'), prevTabBtn) : -1;
            if (prevTabId) _mesTabSet(chatId, messageId, prevTabId);   /* ★W451：这一楼停在哪个页，跟人无关 */
            const hit = ensureCard(nn);
            if (!hit) return;
            selName = nn;
            _charSelSet(chatId, messageId, nn);
            cards.forEach((x) => {
                try { x.card.remove(); } catch (eR) { }
                x.card.querySelectorAll('.yw-nsfw-name').forEach((b) => {
                    b.classList.toggle('on', b.getAttribute('data-name') === nn);
                });
            });
            if (hit) {
                if (anchorNode.parentNode) anchorNode.parentNode.insertBefore(hit.card, anchorNode.nextSibling);
                else mesEl.appendChild(hit.card);
            }
            /* 折叠是「这张卡」的事：切名字时保持当前折叠态（别一切换就自动展开） */
            if (hit && prev && prev !== hit) {
                try { _foldMap.set(_foldKey(chatId, messageId, nn), wasCollapsed); nsfwApplyFold(hit.card, chatId, messageId, nn); } catch (eF) { }
                /* ★W447：切人时停在同一页（第二页切过去还是第二页），并把这一页记到新名字上 */
                try {
                    const tabs = Array.prototype.slice.call(hit.card.querySelectorAll('.yw-nsfw-tab'));
                    let tb = tabs.filter((t) => t.getAttribute('data-tab') === prevTabId)[0];
                    if (!tb && prevTabIdx >= 0) tb = tabs[prevTabIdx];
                    if (tb) { tb.click(); _tabMap.set(_foldKey(chatId, messageId, nn), tb.getAttribute('data-tab')); }
                } catch (eT2) { }
            }
            /* ★W446d：切换时不立刻量高（先在下一帧量，避免和输入/布局抢主线程） */
            if (hit && typeof hit.card._nsfwLock === 'function') { try { setTimeout(() => { try { hit.card._nsfwLock(); } catch (e2) { } }, 60); } catch (e0) { } }
        };
        /* 只建当前角色；访问过的卡留在本楼闭包内，切回保留输入、分页和折叠。 */
        const initial = ensureCard(selName);
        if (initial) {
            if (anchorNode.parentNode) anchorNode.parentNode.insertBefore(initial.card, anchorNode.nextSibling);
            else mesEl.appendChild(initial.card);
            try { if (initial.card._nsfwLock) setTimeout(initial.card._nsfwLock, 120); } catch (e) { }
        }
        return true;
    } catch (e) { return false; }
}

/* ★W337：自愈观察器 —— 酒馆/别的插件重渲染消息会把卡冲掉，这里发现「有块没卡」就补上（生成中不插手） */
let __nsfwObs = null;
let __nsfwObsTimer = 0;
export function nsfwStopObserver() {
    clearTimeout(__nsfwObsTimer);
    __nsfwObsTimer = 0;
    if (__nsfwObs) { try { __nsfwObs.disconnect(); } catch (e) { } }
    __nsfwObs = null;
}
function nsfwObserverEnabled() {
    const st = _getSettings() || {};
    return !!st.nsfwEnabled && st.nsfwCaptureHide !== false;
}
export function nsfwStartObserver() {
    try {
        if (!nsfwObserverEnabled()) { nsfwStopObserver(); return; }
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
        const chat = document.getElementById('chat');
        if (!chat) { nsfwStopObserver(); return; }
        if (__nsfwObs && __nsfwObs._target === chat) return;
        nsfwStopObserver();
        const observer = new MutationObserver(() => {
            if (__nsfwObs !== observer) return;
            if (!nsfwObserverEnabled() || document.getElementById('chat') !== chat) { nsfwStopObserver(); return; }
            clearTimeout(__nsfwObsTimer);
            __nsfwObsTimer = setTimeout(() => {
                __nsfwObsTimer = 0;
                try {
                    if (__nsfwObs !== observer) return;
                    if (!nsfwObserverEnabled() || document.getElementById('chat') !== chat) { nsfwStopObserver(); return; }
                    if (document.body && document.body.classList.contains('yw-nsfw-generating')) return;
                    const ctx = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
                    if (!ctx || !Array.isArray(ctx.chat)) return;
                    /* ★W465：旧楼被酒馆重渲染时不再补卡；只保证最新一楼有卡。 */
                    const latestId = nsfwLatestCardFloor(ctx);
                    nsfwPruneOldCards(latestId);
                    if (latestId < 0) return;
                    const el = document.querySelector('#chat .mes[mesid="' + latestId + '"]');
                    if (!el || el.querySelector('.yw-nsfw')) return;
                    nsfwMountToMessage(latestId);
                } catch (e) { }
            }, 220);
        });
        __nsfwObs = observer;
        observer._target = chat;
        observer.observe(chat, { childList: true, subtree: true });
    } catch (e) { }
}
export function nsfwReattachAll(onlyIds, onlyMissing) {
    try {
        /* ★W465：整聊只保留最新一楼的一张卡；onlyIds 保留参数兼容，不再逐楼建卡。 */
        const ctx = (typeof window !== 'undefined' && window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
        const latestId = nsfwLatestCardFloor(ctx);
        nsfwPruneOldCards(latestId);
        if (latestId < 0) return;
        nsfwMountToMessage(latestId, !!onlyMissing);
    } catch (e) { }
}
