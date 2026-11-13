/* 首页默认项只迁移一次；之后的取消收藏、方案显隐与入口开关尊重用户选择。 */
export const CONSOLE_HOME_DEFAULTS_VERSION = '1.0.2';
export const HOME_ACTION_FAVORITES = Object.freeze([
    'action:tag-now', 'action:stop', 'action:playlatest', 'action:playfav',
]);
export const HOME_SCHEME_IDS = Object.freeze(['deepseek', 'gemini', 'kimi', 'scheme4']);

function isStockHomeScheme(scheme) {
    if (HOME_SCHEME_IDS.includes(scheme.id)) return true;
    const legacy = { migrated_1: /^(?:kimi|kimi3|kimi-?k3)$/i, migrated_2: /^deepseek$/i, migrated_3: /^gemini$/i };
    return !!legacy[scheme.id]?.test(String(scheme.name || '').trim());
}

export function applyConsoleHomeDefaults(settings, defaults) {
    if (!settings || typeof settings !== 'object' || !defaults) return false;
    let changed = false;
    if (!settings.controlCenter || typeof settings.controlCenter !== 'object' || Array.isArray(settings.controlCenter)) {
        settings.controlCenter = structuredClone(defaults.controlCenter);
        changed = true;
    }
    if (settings.presetControlHomePins === undefined) {
        settings.presetControlHomePins = structuredClone(defaults.presetControlHomePins);
        changed = true;
    }
    if (settings.consoleHomeDefaultsV1 !== true) {
        const existing = Array.isArray(settings.controlCenter.favorites) ? settings.controlCenter.favorites
            : Array.isArray(settings['controlCenter.favorites']) ? settings['controlCenter.favorites'] : [];
        settings.controlCenter.favorites = [...new Set([...existing, ...defaults.controlCenter.favorites])];
        /* 作者指定本次升级把旧悬浮窗关、小人开；幂等旗保证后续手动选择不回弹。 */
        settings.floatBarEnabled = defaults.floatBarEnabled;
        if (!settings.companion || typeof settings.companion !== 'object' || Array.isArray(settings.companion)) {
            settings.companion = structuredClone(defaults.companion);
        } else {
            settings.companion.enabled = defaults.companion.enabled;
        }
        settings.consoleHomeDefaultsV1 = true;
        changed = true;
    }
    for (const scheme of Array.isArray(settings.schemes) ? settings.schemes : []) {
        if (!scheme || typeof scheme !== 'object') continue;
        if (scheme.showHome === undefined) {
            scheme.showHome = isStockHomeScheme(scheme);
            if (scheme.id === 'kimi' && scheme.name === 'Kimi') scheme.name = 'Kimi3';
            changed = true;
        }
    }
    if (settings.consoleHomeDefaultsV2 !== true) {
        const schemes = (Array.isArray(settings.schemes) ? settings.schemes : []).filter(s => s && typeof s === 'object');
        /* 316 漏认旧 migrated_* 出厂方案，把它们写成 false；只修全未显示且旧三项可确认的现场。 */
        const legacy = schemes.filter(s => /^migrated_[123]$/.test(s.id) && isStockHomeScheme(s));
        if (schemes.length && schemes.every(s => s.showHome === false) && legacy.length) {
            for (const scheme of legacy) scheme.showHome = true;
        }
        settings.consoleHomeDefaultsV2 = true;
        changed = true;
    }
    if (settings.consoleHomeDefaultsV3 !== true) {
        const fourth = (Array.isArray(settings.schemes) ? settings.schemes : []).find(s => s?.id === 'scheme4');
        if (fourth) { fourth.showHome = true; changed = true; }
        settings.consoleHomeDefaultsV3 = true;
        changed = true;
    }
    return changed;
}
