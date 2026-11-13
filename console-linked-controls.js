/* 预设开关为联动状态来源；只移动指定条目，保留其它条目相对顺序。 */
export const CONSOLE_LINKED_CONTROLS_VERSION = '1.0.0';
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
