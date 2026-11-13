/* 预设开关为联动状态来源；只移动指定条目，保留其它条目相对顺序。
 *
 * ★NSFW 状态栏模块联动（2026-11-13）：
 *   模块 4 键 nsfwEnabled / nsfwCaptureHide / nsfwSenderEnabled / nsfwAutoSend
 *   ↔ 当前预设 character_id === 100001 里「🍑NSFW状态快照」条目的 enabled。
 *   · canonical：9c36b49e-b1e1-4a52-a6e4-54517fccbf68
 *   · 已核 alias：ywp-4c10fb25（历史条目包缺原生 ID 时由内核按准确名生成）
 *   · 准确名兜底：不在本文件重写，一律交给 preset-controls 的 resolvePromptId（341 起）。
 *   本文件只做纯逻辑：不碰 DOM / 不碰真实设置 / 不碰聊天 / 不猜缺项。
 */
export const CONSOLE_LINKED_CONTROLS_VERSION = '1.0.1';
export const NSFW_PROMPT_ID = '9c36b49e-b1e1-4a52-a6e4-54517fccbf68';
export const NSFW_PROMPT_ALIAS_ID = 'ywp-4c10fb25';
export const NSFW_PROMPT_NAME = '🍑NSFW状态快照';
export const NSFW_LINK_CHARACTER_ID = 100001;
export const NSFW_LINK_KEYS = Object.freeze(['nsfwEnabled', 'nsfwCaptureHide', 'nsfwSenderEnabled', 'nsfwAutoSend']);

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
 * 老键 nsfwSendMode 保留不删（回退旧版本还能读）；它不属于本轮 4 键联动。 */
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

/* 预设权威 → 模块 4 键。只认 enabled === true 为开；非布尔状态由解析层挡掉。 */
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

/* 工具箱模块主开关：用户直接动作，4 项无条件按 want；不碰 nsfwShowAllFields / 角色发送勾选。 */
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
