/* 预设开关为联动状态来源；只移动指定条目，保留其它条目相对顺序。
 *
 * ★链族→step1 自动联动（2026-11-15，368）：resolveChainFamily / planChainInjectionLink（实现见文件末尾）。
 *   判当前预设 100001 场景四链头（KIMI/KIMI2/DS/GMN）族别并给注入写入计划；apply 由 index 接线层执行。

 * ★NSFW 状态栏模块联动（2026-11-13）：
 *   模块 3 键 nsfwEnabled / nsfwCaptureHide / nsfwSenderEnabled（AUTO 独立记忆）
 *   ↔ 当前预设 character_id === 100001 里「🍑NSFW状态快照」条目的 enabled。
 *   · canonical：9c36b49e-b1e1-4a52-a6e4-54517fccbf68
 *   · 已核 alias：ywp-4c10fb25（历史条目包缺原生 ID 时由内核按准确名生成）
 *   · 准确名兜底：不在本文件重写，一律交给 preset-controls 的 resolvePromptId（341 起）。
 *   本文件只做纯逻辑：不碰 DOM / 不碰真实设置 / 不碰聊天 / 不猜缺项。
 */
export const CONSOLE_LINKED_CONTROLS_VERSION = '1.0.3';
export const NSFW_PROMPT_ID = '9c36b49e-b1e1-4a52-a6e4-54517fccbf68';
export const NSFW_PROMPT_ALIAS_ID = 'ywp-4c10fb25';
export const NSFW_PROMPT_NAME = '🍑NSFW状态快照';
export const NSFW_LINK_CHARACTER_ID = 100001;
// AUTO 是独立发送偏好；刷新、切预设和模块总开关均保留用户的选择。
export const NSFW_LINK_KEYS = Object.freeze(['nsfwEnabled', 'nsfwCaptureHide', 'nsfwSenderEnabled']);

export function placeAfter(rows, id, anchor) {
    if (!Array.isArray(rows)) return false;
    const from = rows.findIndex(row => row?.identifier === id);
    const after = rows.findIndex(row => row?.identifier === anchor);
    if (from < 0 || after < 0 || from === after + 1) return false;
    const [row] = rows.splice(from, 1);
    rows.splice(rows.findIndex(item => item?.identifier === anchor) + 1, 0, row);
    return true;
}
export function syncLinkedSetting(settings, rows, id) {
    const row = Array.isArray(rows) ? rows.find(item => item?.identifier === id) : null;
    if (!row || typeof row.enabled !== 'boolean') return false;
    if (settings.wrap4aEnabled === row.enabled) return false;
    settings.wrap4aEnabled = row.enabled;
    return true;
}

/* 严格只认 character_id 100001 的唯一场景；prompt_order 不是数组 / 找不到 / 多个 100001 都不猜。 */
export function selectStrictPromptScenario(promptOrder, characterId = NSFW_LINK_CHARACTER_ID) {
    if (!Array.isArray(promptOrder)) return { ok: false, reason: 'bad-prompt-order' };
    const want = String(characterId);
    const matches = [];
    for (const group of promptOrder) {
        if (!group || typeof group !== 'object') continue;
        if (String(group.character_id) === want) matches.push(group);
    }
    if (matches.length === 0) return { ok: false, reason: 'missing-100001' };
    if (matches.length > 1) return { ok: false, reason: 'ambiguous-100001' };
    return { ok: true, scenario: matches[0] };
}

/* 解析 NSFW 条目并读 enabled。
 * resolvePromptId 由调用方注入（index 里是 ywUnifiedConsole.presets.resolvePromptId），
 * 因此 canonical / alias / 准确名兜底的优先级完全沿用主控台的真实解析器，不在这里另造一套。
 * 只有「唯一解析 id + 唯一行 + 布尔 enabled」才 ok；其余一律不猜、不写。
 * ★canonical / alias 谁优先由真实 resolver 决定；本函数只认 resolver 返回的那个 id，
 *   不把「canonical 与 alias 双存」另造成歧义（否则既有 canonical 优先的合法预设会被误判不联动）。 */
export function resolveNsfwPresetLink(scenario, resolvePromptId, options = {}) {
    const characterId = options.characterId === undefined ? NSFW_LINK_CHARACTER_ID : options.characterId;
    const canonicalId = options.canonicalId === undefined ? NSFW_PROMPT_ID : String(options.canonicalId || '');
    if (!scenario || typeof scenario !== 'object') return { ok: false, reason: 'no-scenario' };
    if (String(scenario.character_id) !== String(characterId)) return { ok: false, reason: 'not-100001' };
    if (!Array.isArray(scenario.order)) return { ok: false, reason: 'bad-order' };
    let resolved = null;
    try {
        resolved = typeof resolvePromptId === 'function' ? resolvePromptId(canonicalId) : null;
    } catch (e) {
        resolved = null;
    }
    if (typeof resolved !== 'string' || !resolved) return { ok: false, reason: 'unresolved' };
    const hits = [];
    for (const item of scenario.order) {
        if (!item || item.identifier !== resolved) continue;
        hits.push(item);
    }
    if (hits.length === 0) return { ok: false, reason: 'missing-row' };
    if (hits.length > 1) return { ok: false, reason: 'ambiguous-rows' };
    const row = hits[0];
    if (typeof row.enabled !== 'boolean') return { ok: false, reason: 'bad-enabled', id: row.identifier };
    return { ok: true, id: row.identifier, enabled: row.enabled, canonicalId };
}

/* 收敛签名 = 预设名 + 实际条目 id + 开关值。
 * 只在「预设切换 / 该开关真实翻转 / 条目从缺到有」时变化；同一预设同一开关不反复套用，
 * 因此不会把用户当次手调的子勾（捕捉 / 发送 / AUTO）按 SETTINGS_UPDATED 一路改回去。 */
export function nsfwLinkSignature(link, presetName) {
    if (!link || link.ok !== true) return 'unresolved';
    return [String(presetName == null ? '' : presetName), String(link.id || ''), link.enabled === true ? '1' : '0'].join('|');
}
export function shouldApplyNsfwLink(lastSignature, link, presetName, force = false) {
    if (!link || link.ok !== true) return false;
    if (force === true) return true;
    return nsfwLinkSignature(link, presetName) !== String(lastSignature == null ? '' : lastSignature);
}
/* 缺项/坏/歧义：收敛签名一起清掉。
 * 否则同一预设里同 ID、同 enabled 的条目「消失后又被缝回来」时签名看起来没变 ⇒ 不会重新应用。
 * 清掉之后下次解析成功必然重新套用 4 键。 */
export function clearNsfwLinkState(state) {
    if (!state || typeof state !== 'object') return state;
    state.signature = '';
    state.presetName = '';
    state.id = '';
    state.enabled = null;
    return state;
}

/* 缺键补默认：与 defaultSettings 同一个来源（铁律 32），不在这里写第二套字面量。
 * nsfwAutoSend 的历史口径只有 nsfwSendMode（'auto' = AUTO / 其它 = 手选）——
 * 仅在 nsfwAutoSend 缺键时按值迁移一次；用户已经显式写过的 true/false 永不覆盖。
 * 老键 nsfwSendMode 保留不删（回退旧版本还能读）；AUTO 不参与模块联动。 */
export function applyNsfwDefaults(settings, defaults) {
    const changed = [];
    if (!settings || typeof settings !== 'object') return changed;
    const source = defaults && typeof defaults === 'object' ? defaults : {};
    const fill = (key) => {
        if (settings[key] !== undefined) return;
        settings[key] = source[key] === true;
        changed.push(key);
    };
    fill('nsfwEnabled');
    fill('nsfwCaptureHide');
    fill('nsfwSenderEnabled');
    if (settings.nsfwAutoSend === undefined) {
        settings.nsfwAutoSend = settings.nsfwSendMode
            ? settings.nsfwSendMode === 'auto'
            : source.nsfwAutoSend === true;
        changed.push('nsfwAutoSend');
    }
    return changed;
}

/* 预设权威 → 模块 3 键。只认 enabled === true 为开；非布尔状态由解析层挡掉。 */
export function applyNsfwLink(settings, link) {
    const changed = [];
    if (!settings || typeof settings !== 'object') return changed;
    if (!link || link.ok !== true) return changed;
    const want = link.enabled === true;
    for (const key of NSFW_LINK_KEYS) {
        if (settings[key] !== want) {
            settings[key] = want;
            changed.push(key);
        }
    }
    return changed;
}

/* 工具箱模块主开关：用户直接动作，3 项按 want；AUTO 保留手动偏好；不碰 nsfwShowAllFields / 角色发送勾选。 */
export function applyNsfwMaster(settings, want) {
    const changed = [];
    if (!settings || typeof settings !== 'object') return changed;
    const next = want === true;
    for (const key of NSFW_LINK_KEYS) {
        if (settings[key] !== next) {
            settings[key] = next;
            changed.push(key);
        }
    }
    return changed;
}

/* 主开关反向写预设只走「唯一解析行」；缺项 / 坏 / 歧义 ⇒ toggle=null，绝不猜 po[0]。 */
export function planNsfwMasterAction(link, want) {
    const next = want === true;
    const id = link && link.ok === true && typeof link.id === 'string' ? link.id : '';
    return { want: next, toggle: id ? { [id]: next } : null };
}

/* ★链族（KIMI/KIMI2/DS/GMN 链头）→ step1 自动联动（2026-11-15，368）：
 *   resolveChainFamily：判当前预设 100001 场景里四条链头行的 enabled 组合属于哪个族；
 *   planChainInjectionLink：只在「首次有效 / 切预设 / 族变化」时给写入计划，apply 由 index 接线层执行
 *   （主层写 settings.injectTarget / 内置模板 / step1，并同步原 UI / refreshSeed）。
 *   · canonical 链头（与 preset-control-defs 的 CHAIN_PROMPT_IDS 同源）：kimi = mscxwkta7e2ycqrq07x、
 *     kimi2 = ms4rztexqnqltpdttq（与 kimi 同族，不能漏）、ds = 85698c23-7a1b-4ef2-b2d4-1dbe5aad9fab、
 *     gmn = mqpxwfsgtpqjyb7lthh。
 *   · 改名保 id 照常按 id 识别；自改后只剩准确名的兜底一律交给调用方注入的 resolvePromptId
 *     （同 NSFW 口径），本文件不新造任何模糊 / 名称匹配。
 *   · 尾部及其它条目不参与判族（尾部仅不驱动 family、不强开）；重复行 / 不同族 head 解析到同一行 /
 *     enabled 非布尔 / 无任何可识别 head 一律不猜。纯 helper：不读 DOM / settings，不写真实变量。 */
export const CHAIN_LINK_CHARACTER_ID = 100001;
export const CHAIN_HEADS = Object.freeze([
    { key: 'chainKimi', id: 'mscxwkta7e2ycqrq07x', family: 'kimi' },
    { key: 'chainKimi2', id: 'ms4rztexqnqltpdttq', family: 'kimi' },
    { key: 'chainDs', id: '85698c23-7a1b-4ef2-b2d4-1dbe5aad9fab', family: 'ds' },
    { key: 'chainGmn', id: 'mqpxwfsgtpqjyb7lthh', family: 'gmn' },
].map(head => Object.freeze(head)));

/* 判族。输入 { prompts, scenario, resolvePromptId, characterId? }：
 * scenario 必须就是严格 100001 场景（selectStrictPromptScenario 的产物），order 行须唯一、enabled 须布尔。
 * resolver 注入主控台真实 resolvePromptId（canonical / alias / 准确名兜底都在它里面）；resolver 缺席或
 * 对某 head 返回空 ⇒ 退回精确 id 本身（改名保 id 照常识别）。
 * 返回 { ok, family, signatureParts?, reason?, id?, head?, heads? }：
 *   ok:true  family:'kimi'|'ds'|'gmn'|'off'（决定性，可据此联动）；
 *   ok:false family:'mixed'|'unknown' + reason（混族不猜 / 缺项坏项不猜）；
 *   signatureParts = 每个「恰一行」head 的 'key:actualId:enabled01'（固定 canonical 顺序，审计用）。 */
export function resolveChainFamily({ prompts, scenario, resolvePromptId, characterId = CHAIN_LINK_CHARACTER_ID } = {}) {
    void prompts; /* 仅随契约带入：识别只认 scenario 行 + resolver，不用 prompts 做名称匹配 */
    const fail = (family, reason, extra) => Object.assign({ ok: false, family, reason }, extra || {});
    if (!scenario || typeof scenario !== 'object') return fail('unknown', 'no-scenario');
    if (String(scenario.character_id) !== String(characterId)) return fail('unknown', 'not-100001');
    if (!Array.isArray(scenario.order)) return fail('unknown', 'bad-order');
    const scanned = [];
    const claimedBy = new Map();
    for (const head of CHAIN_HEADS) {
        let actual = null;
        if (typeof resolvePromptId === 'function') {
            try { actual = resolvePromptId(head.id); } catch (e) { actual = null; }
        }
        if (typeof actual !== 'string' || !actual) actual = head.id;
        const hits = [];
        for (const row of scenario.order) {
            if (!row || row.identifier !== actual) continue;
            hits.push(row);
        }
        if (hits.length > 1) return fail('unknown', 'duplicate-order', { id: actual, head: head.key });
        if (hits.length === 1) {
            const seen = claimedBy.get(actual);
            if (seen && seen.family !== head.family) {
                return fail('unknown', 'resolver-collision', { id: actual, heads: seen.key + '+' + head.key });
            }
            if (!seen) claimedBy.set(actual, head);
        }
        scanned.push({ head, id: actual, row: hits.length === 1 ? hits[0] : null });
    }
    const recognized = [];
    for (const item of scanned) {
        if (!item.row) continue;
        if (typeof item.row.enabled !== 'boolean') return fail('unknown', 'bad-enabled', { id: item.id, head: item.head.key });
        recognized.push(item);
    }
    if (recognized.length === 0) return fail('unknown', 'no-recognizable-heads');
    const signatureParts = scanned
        .filter(item => item.row)
        .map(item => item.head.key + ':' + item.id + ':' + (item.row.enabled === true ? '1' : '0'));
    const onFamilies = [];
    for (const family of ['kimi', 'ds', 'gmn']) {
        if (recognized.some(item => item.head.family === family && item.row.enabled === true)) onFamilies.push(family);
    }
    if (onFamilies.length === 0) return { ok: true, family: 'off', signatureParts };
    if (onFamilies.length > 1) return fail('mixed', 'mixed:' + onFamilies.join('+'), { signatureParts });
    return { ok: true, family: onFamilies[0], signatureParts };
}

/* 链族联动计划（纯函数，不读不写任何真实状态）。
 * previous = 上次返回的 action.state（主接线原样保存；null / 坏形状一律按未初始化处理）。
 * input = { presetKey, family, manual? }：presetKey 由接线层给（预设键），family 必须是
 * resolveChainFamily 判出的六值之一。返回 { apply, target, step1, warning?, reason, cause?, state }，
 * state = { signature, family, warned } 每次都返回、由接线层原样保存。
 *   · signature = presetKey + '|' + family，只认 kimi/ds/gmn/off/mixed；与上次不同才 apply
 *     （首次有效 / 切预设 / 族变化，cause 区分 first / preset-switch / family-change）；相同 ⇒ 'same'
 *     不重写（同族尾部变化、普通 settings 事件、用户手调的 step1/模板都不被覆回去）。
 *   · 动作映射：kimi → { target:'kimi', step1:true }；ds → { target:'ds', step1:true }；
 *     gmn/off → { target:null, step1:false }（只关 step1；target=null=不动注入目标、不清模板）。
 *   · mixed：签名照常占位，warning 只在该签名首次发一次，永不写。
 *   · unknown / 坏输入：不占签名（state 原样返回），下一个有效签名照常触发。
 *   · manual:true（本次来自用户直接手调）：永不 apply、只记账（签名照常占位）。 */
const CHAIN_PLAN_FAMILIES = Object.freeze(['kimi', 'ds', 'gmn', 'off', 'mixed']);
export function planChainInjectionLink(previous, input) {
    const prev = previous && typeof previous === 'object'
        ? {
            signature: typeof previous.signature === 'string' ? previous.signature : '',
            family: typeof previous.family === 'string' ? previous.family : '',
            warned: previous.warned === true,
        }
        : { signature: '', family: '', warned: false };
    const noWrite = (reason, state) => ({ apply: false, target: null, step1: false, reason, state });
    const presetKey = input && typeof input.presetKey === 'string' ? input.presetKey : '';
    const family = input && typeof input.family === 'string' ? input.family : '';
    const manual = input != null && input.manual === true;
    if (family === 'unknown') return noWrite('unknown', prev);
    if (!presetKey || CHAIN_PLAN_FAMILIES.indexOf(family) < 0) return noWrite('bad-input', prev);
    const signature = presetKey + '|' + family;
    const changed = signature !== prev.signature;
    const state = { signature, family, warned: changed ? false : prev.warned };
    if (family === 'mixed') {
        if (state.warned) return noWrite('mixed', state);
        state.warned = true;
        return Object.assign(noWrite('mixed', state), { warning: 'mixed-chain-family' });
    }
    if (manual) return noWrite('manual', state);
    if (!changed) return noWrite('same', state);
    const cause = prev.signature === '' ? 'first' : (prev.family === family ? 'preset-switch' : 'family-change');
    if (family === 'kimi') return { apply: true, target: 'kimi', step1: true, reason: 'chain-link', cause, state };
    if (family === 'ds') return { apply: true, target: 'ds', step1: true, reason: 'chain-link', cause, state };
    return { apply: true, target: null, step1: false, reason: 'chain-link', cause, state };
}
