/**
 * 预设保存 · 名字清洗 / 防撞名 / 另存复核（纯逻辑，可在 Node / VM 里直接 import 测试）
 *
 * ★M02（2026-11-11 隔离质量批）：本文件只解决"**另存新名**"这一侧的宿主兼容问题 ——
 *   酒馆服务端 `src/endpoints/presets.js` 在写盘前会先跑 `sanitize-filename`（ST 1.19 用 **1.6.3**，无 replacement），
 *   而客户端原来只拿**原始字符串**跟预设列表比名字 ⇒ `Neutral:Name` 在客户端看来"不重名"，
 *   到服务端却变成 `NeutralName`，**直接覆盖同名的旧文件**；封装还可能把原始名当成成功名返回。
 *   这里做三件事（全部是**纯函数**，不读 DOM / 不发请求 / 不碰磁盘）：
 *     ① `sanitizePresetName()`：逐字符复刻 sanitize-filename@1.6.3（含 255 字节 UTF-8 截断）；
 *     ② `presetNameInfo()` / `uniquePresetName()`：按"清洗后 + 平台大小写"的键查重，撞了就加（2）（3）…；
 *     ③ `savePresetAsUnique()`：先**同步预留**目标名（同页并发保存不会抢同一个名字）→ 调注入的 save →
 *        再从注入的 listNames() 复核真的出现了这个名字。复核不到就**不报成功**。
 *
 * ★★保护范围（必须如实说，不能宣称"完全原子"）：
 *   · 宿主 `POST /api/presets/save` **只有覆盖语义**，没有 create-only / compare-and-swap 接口；
 *     服务端拿到名字后直接 `writeFileAtomicSync(name + '.json')`。
 *   · 本文件能保证的是：**本页面发起保存之前**，按与服务端相同的清洗规则查过重名、并在本页内预留了目标名；
 *     如果目标名已经被别的窗口 / 外部进程在"最后一次查重"与"服务端真正写盘"之间创建出来，
 *     本文件无法阻止那次覆盖（没有服务端拒绝覆盖的接口）。这个窗口只能由主 Agent 在隔离宿主上做
 *     并发写盘验收来量化；本文件不假装它是零。
 *   · 另存路径（savePresetAsUnique）永远选一个**保存前不存在**的名字；正常"保存当前"不走这里，
 *     仍由酒馆自己的「更新预设」按钮覆盖同一份文件（不是无限备份、不是无限另存）。
 */

/** 模块版本（只是本纯逻辑模块自己的标识；不参与工具箱/更新器/商店的发布版本号） */
export const VERSION = '1.0.0';
export const BUILD = 'v1.0.0';
/** 复刻的 sanitize-filename 版本（ST 1.19.0 的 node_modules 实测 1.6.3） */
export const SANITIZE_FILENAME_VERSION = '1.6.3';
/** 宿主 sanitize-filename 的硬上限（字节，不是字符） */
export const PRESET_FILENAME_MAX_BYTES = 255;
/** ★review2 文件级安全上限：宿主最终写的是 `sanitize(name) + '.json'`。
 *  · Windows 路径分量上限 = 255 个 UTF-16 单元（ASCII 251 名字 + 5 = 256 ⇒ ENOENT 实测）；
 *  · Linux 组件上限 = 255 字节（名字 252B + 5 = 257 > 255）。
 *  ⇒ 名字本身留 5 给 `.json`，限制 **≤250 UTF-8 字节 且 ≤250 UTF-16 单元**。
 *  ★`sanitizePresetName()` 仍然精确复刻宿主 255 字节截断，**不改**（它只回答"宿主怎么清洗"，不回答"能不能安全落盘"）。 */
export const PRESET_SAFE_NAME_MAX_BYTES = 250;
export const PRESET_SAFE_NAME_MAX_UTF16 = 250;
/** 宿主保存时追加的扩展名（5 个 ASCII 字节/UTF-16 单元） */
export const PRESET_EXTENSION_BYTES = 5;

const ILLEGAL_RE = /[\/\?<>\\:\*\|"]/g;
const CONTROL_RE = /[\x00-\x1f\x80-\x9f]/g;
const RESERVED_RE = /^\.+$/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const WINDOWS_TRAILING_RE = /[\. ]+$/;

/** 单个码点的 UTF-8 字节数（与 Node Buffer.byteLength 同口径） */
function utf8LenOfCodePoint(cp) {
    if (cp <= 0x7f) return 1;
    if (cp <= 0x7ff) return 2;
    if (cp <= 0xffff) return 3;
    return 4;
}

/** 按 UTF-8 字节数截断，且**不切断码点**（复刻 truncate-utf8-bytes@1.0.0 的边界行为） */
export function truncateUtf8Bytes(input, maxBytes) {
    const s = String(input == null ? '' : input);
    const limit = Number(maxBytes);
    if (!Number.isFinite(limit) || limit < 0) return '';
    let used = 0;
    let out = '';
    for (const ch of s) {
        const n = utf8LenOfCodePoint(ch.codePointAt(0));
        if (used + n > limit) break;
        used += n;
        out += ch;
    }
    return out;
}

/** 与宿主服务端 `sanitize(name)`（sanitize-filename@1.6.3，无 replacement）逐字符一致。
 *  顺序也必须一致：非法字符 → 控制字符 → 纯点号 → Windows 保留名 → 结尾点/空格 → 255 字节截断。
 *  ★注意 `CON `（尾空格）在 1.6.3 里会先过保留名正则（不匹配）、再被结尾空格清洗成 `CON` ——
 *    所以调用方还要用 `presetNameInfo()` 的**追加检查**（清洗后再判一次 Windows 保留名），
 *    不能只信 sanitize 的结果。 */
export function sanitizePresetName(raw) {
    const s = String(raw == null ? '' : raw);
    const once = s
        .replace(ILLEGAL_RE, '')
        .replace(CONTROL_RE, '')
        .replace(RESERVED_RE, '')
        .replace(WINDOWS_RESERVED_RE, '')
        .replace(WINDOWS_TRAILING_RE, '');
    return truncateUtf8Bytes(once, PRESET_FILENAME_MAX_BYTES);
}

/** 宿主所在平台的文件名大小写规则：Windows / macOS 默认大小写不敏感，Linux 敏感。
 *  ★review2：**默认一律按大小写不敏感**（最保守）—— 手机/Android 客户端连 Windows 宿主时，
 *    `navigator.platform` 会给出 Linux/Android，若拿它判"敏感"就会把 ABC 写成 abc 覆盖掉。
 *    本函数**不读 navigator**；只有调用方显式传入**宿主**平台字符串时才按平台判（测试/宿主探针可显式用）。
 *  @param {string} [platformHint] 显式宿主平台（'win32' / 'darwin' / 'linux' …）；不传 = 不敏感 */
export function isCaseInsensitiveHost(platformHint) {
    const p = String(platformHint == null ? '' : platformHint).trim();
    if (!p) return true;                       // 默认：保守按不敏感（绝不因客户端平台自动判敏感）
    if (/win|windows|mac|darwin|iphone|ipad/i.test(p)) return true;
    if (/linux|android/i.test(p)) return false;
    return true;
}

/** 查重键：清洗后的文件名；大小写不敏感时再折叠大小写。
 *  ★默认不敏感；只有 `opts.caseInsensitive` 显式给了布尔值，或 `opts.platform` 显式给了**宿主**平台，
 *    才改变这个默认（客户端 navigator 不参与）。
 *  ★不做 Unicode 归一化 —— 宿主也没有做；这里只解决"落到同一个文件路径"的问题。 */
export function presetNameKey(raw, opts) {
    const o = opts || {};
    const canonical = sanitizePresetName(raw);
    const insensitive = o.caseInsensitive !== undefined
        ? !!o.caseInsensitive
        : (o.platform !== undefined ? isCaseInsensitiveHost(o.platform) : true);
    return insensitive ? canonical.toLowerCase() : canonical;
}

/** 名字能不能用来另存 / 覆盖（只做本地可确定的那部分；服务端仍会再清洗一次）。
 *  @returns {{ok:boolean, canonical:string, key:string, sanitized:boolean, truncated:boolean, why:string}} */
export function presetNameInfo(raw, opts) {
    const o = opts || {};
    /* ★不要在这里 trim：宿主 sanitize-filename 也不 trim —— 它只清洗"结尾点/空格"。
       调用方（界面）想 trim 是调用方自己的事；这里必须逐字节按宿主规则算，才能和服务端落到同一个路径。 */
    const original = String(raw == null ? '' : raw);
    const canonical = sanitizePresetName(original);
    const sanitized = canonical !== original;
    const truncated = utf8LenOfCodePointTotal(original) > PRESET_FILENAME_MAX_BYTES;
    const bytes = utf8LenOfCodePointTotal(canonical);
    const units = utf16LenOfString(canonical);
    const tooLong = bytes > PRESET_SAFE_NAME_MAX_BYTES || units > PRESET_SAFE_NAME_MAX_UTF16;
    const key = presetNameKey(canonical, o);
    const base = { canonical, key, sanitized, truncated, bytes, units, tooLong };
    if (!canonical) {
        return {
            ...base,
            ok: false,
            why: '这个名字经过酒馆的文件名清洗后是空的（全是 : / \\ ? * " < > | 、控制字符、或 CON / PRN / NUL 这类保留名）。换一个名字。',
        };
    }
    /* sanitize-filename 1.6.3 的已知边角：`CON ` 会先保留原名（尾空格不匹配）再被结尾空格清洗成 `CON`。
       对 Windows 来说 `CON.json` 仍是保留设备名 ⇒ 这里追加一道，宁可拒绝也不写一个宿主可能拒写的文件。 */
    if (WINDOWS_RESERVED_RE.test(canonical)) {
        return {
            ...base,
            ok: false,
            why: '「' + canonical + '」是 Windows 的保留文件名（CON / PRN / AUX / NUL / COM1~9 / LPT1~9），酒馆会拒写或写不出来。换一个名字。',
        };
    }
    if (WINDOWS_TRAILING_RE.test(canonical)) {
        return {
            ...base,
            ok: false,
            why: '这个名字清洗后以点或空格结尾，Windows 上会落成另一个路径。换一个名字。',
        };
    }
    /* ★review2：宿主最终写的是 `名字 + '.json'`。名字超过 250 字节 / 250 个 UTF-16 单元时，
       ASCII 251 名字 + 5 = 256 在 Windows 会 ENOENT；Linux 组件 255 字节也会超。
       这里**拒**（人话告诉用户缩短），不静默截断；只有"撞名加序号"那条路会截短基名并保留完整序号。 */
    if (tooLong) {
        return {
            ...base,
            ok: false,
            why: '这个名字太长：酒馆会存成「名字.json」，文件名最多 255 字节 / 255 个 UTF-16 单元，'
                + '扣掉 .json 后名字最多 ' + PRESET_SAFE_NAME_MAX_BYTES + ' 字节 / ' + PRESET_SAFE_NAME_MAX_UTF16 + ' 个单元。'
                + '当前是 ' + bytes + ' 字节 / ' + units + ' 个单元，请缩短。',
        };
    }
    return { ...base, ok: true, why: '' };
}

function utf8LenOfCodePointTotal(s) {
    let n = 0;
    for (const ch of String(s == null ? '' : s)) n += utf8LenOfCodePoint(ch.codePointAt(0));
    return n;
}

/** UTF-16 单元数（JS 字符串长度口径；Windows 路径分量按这个算） */
function utf16LenOfString(s) {
    let n = 0;
    for (const ch of String(s == null ? '' : s)) n += ch.length;
    return n;
}

/** 同时按 UTF-8 字节和 UTF-16 单元截断（不切断码点/代理对）；用于给序号后缀留空间。 */
function truncateNameToLimits(input, maxBytes, maxUnits) {
    const s = String(input == null ? '' : input);
    const mb = Number(maxBytes);
    const mu = Number(maxUnits);
    if (!Number.isFinite(mb) || !Number.isFinite(mu) || mb <= 0 || mu <= 0) return '';
    let bytes = 0, units = 0, out = '';
    for (const ch of s) {
        const b = utf8LenOfCodePoint(ch.codePointAt(0));
        const u = ch.length;
        if (bytes + b > mb || units + u > mu) break;
        bytes += b; units += u; out += ch;
    }
    return out;
}

/** 本页内已预留、但还没确认写盘完成的名字（键 = presetNameKey）。
 *  作用：同页两个"另存"并发时，第二个不会选到第一个刚选中的新名字（单线程里 pick + reserve 是同步的，
 *  所以这里不需要锁；跨页/跨进程的竞态见文件头的保护范围）。 */
const activeReservations = new Map();

/** 同步预留一个名字；已被别的 token 预留 ⇒ false。 */
export function reservePresetName(raw, token, opts) {
    const key = presetNameKey(raw, opts);
    if (!key) return false;
    if (activeReservations.has(key) && activeReservations.get(key) !== token) return false;
    activeReservations.set(key, token);
    return true;
}

/** 释放预留（只有持有同一个 token 才能释放）。 */
export function releasePresetName(raw, token, opts) {
    const key = presetNameKey(raw, opts);
    if (key && activeReservations.get(key) === token) activeReservations.delete(key);
}

/** 生成一个"保存前不存在"的名字。
 *  @param {string} raw 用户想要的原始名字
 *  @param {string[]} existingNames 宿主列表里的现有名字（已经是文件名）
 *  @param {{platform?:string, caseInsensitive?:boolean, reservedKeys?:Iterable<string>}} [opts]
 *  @returns {{ok:boolean, name:string, key:string, renamed:boolean, sanitized:boolean, truncated:boolean, why:string}} */
export function uniquePresetName(raw, existingNames, opts) {
    const o = opts || {};
    const info = presetNameInfo(raw, o);
    if (!info.ok) return { ...info, name: '', renamed: false };
    const used = new Set();
    for (const n of (Array.isArray(existingNames) ? existingNames : [])) used.add(presetNameKey(n, o));
    try { for (const k of (o.reservedKeys || [])) used.add(String(k)); } catch (e) { /* 迭代器异常 ⇒ 当作没有预留 */ }
    for (const [k] of activeReservations) used.add(k);

    if (!used.has(info.key)) {
        return { ...info, name: info.canonical, renamed: false };
    }
    /* 撞名：在**清洗后的基名**后面加全角（2）（3）…。
       ★必须同时给后缀留出"字节"和"UTF-16 单元"空间，再截断基名 —— 否则长名字会把后缀一起截掉，
         下一轮算出同一个候选，变成死循环；也会撞 Windows 255 单元 / Linux 255 字节。 */
    for (let n = 2; n <= 1000; n++) {
        const suffix = '（' + n + '）';
        const roomBytes = PRESET_SAFE_NAME_MAX_BYTES - utf8LenOfCodePointTotal(suffix);
        const roomUnits = PRESET_SAFE_NAME_MAX_UTF16 - utf16LenOfString(suffix);
        const stem = truncateNameToLimits(info.canonical, Math.max(0, roomBytes), Math.max(0, roomUnits));
        const candidate = sanitizePresetName(stem + suffix);
        const key = presetNameKey(candidate, o);
        const cb = utf8LenOfCodePointTotal(candidate);
        const cu = utf16LenOfString(candidate);
        if (candidate && cb <= PRESET_SAFE_NAME_MAX_BYTES && cu <= PRESET_SAFE_NAME_MAX_UTF16 && !used.has(key)) {
            return { ...info, name: candidate, key, renamed: true };
        }
    }
    return {
        ...info,
        ok: false,
        name: '',
        renamed: true,
        why: '这个预设名已经撞到 1000 个同名文件了 —— 换一个更特别的名字再存。',
    };
}

/** 另存新名 + 复核。
 *  ★调用方必须注入**真正会写宿主**的 save（例如 `pm.savePreset(name, preset)`）与读列表的 listNames。
 *  ★复核口径：保存前抓一份列表，保存后列表里必须出现"选中的名字"（或唯一一个新名字 = 宿主清洗成了别的名字）。
 *    保存接口报成功但列表里一个新名字都没有 ⇒ `ok:false, wrote:true`，**绝不返回成功**。
 *  @param {{baseName:string, preferredName?:string, preset:object,
 *           listNames:()=>string[], save:(name:string, preset:object)=>Promise<any>,
 *           opts?:object}} o
 *  @returns {Promise<{ok:boolean, name:string, actualName:string, verified:boolean, hostRenamed:boolean,
 *                     sanitized:boolean, renamed:boolean, truncated:boolean, wrote:boolean, why:string,
 *                     verifyError?:string}>} */
export async function savePresetAsUnique(o) {
    const opts = (o && o.opts) || {};
    const listNames = (o && typeof o.listNames === 'function') ? o.listNames : (() => (Array.isArray(o && o.listNames) ? o.listNames : []));
    const save = (o && typeof o.save === 'function') ? o.save : null;
    if (!save) return { ok: false, name: '', actualName: '', verified: false, hostRenamed: false, sanitized: false, renamed: false, truncated: false, wrote: false, why: '没有注入 save 函数（内部错误）' };

    let before = null;
    /* ★B1（独立复查 2026-11-11）：保存前列表**读失败不能当空列表** —— 否则会选中一个"看起来空着"
       的名字，把同名旧预设覆盖掉，最后列表读成功还 verified:true。读不到就**一个字不写**。 */
    try { before = listNames(); }
    catch (e) {
        return { ok: false, name: '', actualName: '', verified: false, hostRenamed: false, sanitized: false, renamed: false, truncated: false, wrote: false, why: '保存前读不到预设列表，不能保证不覆盖同名 —— 这次一个字都没写（' + ((e && e.message) || e) + '）' };
    }
    if (!Array.isArray(before)) {
        return { ok: false, name: '', actualName: '', verified: false, hostRenamed: false, sanitized: false, renamed: false, truncated: false, wrote: false, why: '保存前预设列表不是数组，不能保证不覆盖同名 —— 这次一个字都没写' };
    }
    before = before.slice();

    /* 确认阶段已经给用户看过一个名字的话（preferredName），只要它还空着就优先用它 —— 不让
       "确认框里写 A、真正存成 B"的错位出现；它已经被别人占了才重新取一个（并在返回值里标 renamed）。 */
    let pick = null;
    if (o && o.preferredName) {
        const pInfo = presetNameInfo(o.preferredName, opts);
        const pKey = pInfo.key;
        const used = new Set(before.map(n => presetNameKey(n, opts)));
        for (const [k] of activeReservations) used.add(k);
        try { for (const k of (opts.reservedKeys || [])) used.add(String(k)); } catch (e) { /* ignore */ }
        if (pInfo.ok && !used.has(pKey)) pick = { ...pInfo, name: pInfo.canonical, renamed: false };
    }
    if (!pick) pick = uniquePresetName(o && o.baseName, before, opts);
    if (!pick.ok) {
        return { ok: false, name: '', actualName: '', verified: false, hostRenamed: false, sanitized: !!pick.sanitized, renamed: !!pick.renamed, truncated: !!pick.truncated, wrote: false, why: pick.why || '这个名字不能用' };
    }

    const token = {};
    if (!reservePresetName(pick.name, token, opts)) {
        return { ok: false, name: pick.name, actualName: '', verified: false, hostRenamed: false, sanitized: !!pick.sanitized, renamed: true, truncated: !!pick.truncated, wrote: false, why: '同一页里另一个保存刚占了这个名字，这次先不写。再点一次。' };
    }

    const outBase = { name: pick.name, actualName: '', verified: false, hostRenamed: false, sanitized: !!pick.sanitized, renamed: !!pick.renamed, truncated: !!pick.truncated, wrote: false, why: '' };
    try {
        await save(pick.name, o.preset);
    } catch (e) {
        releasePresetName(pick.name, token, opts);
        return { ...outBase, ok: false, wrote: false, why: (e && e.message) || String(e) };
    }
    releasePresetName(pick.name, token, opts);

    let after = null;
    try { after = (listNames() || []).slice(); }
    catch (e) {
        /* 保存调用本身已经 resolve（宿主 2xx），但**列表复核读失败** ⇒ 不能报成功（假成功比失败更糟）。
           wrote:true 如实告诉调用方"可能已经写进去了"，ok:false 让它不要切换到/清空输入。 */
        return { ...outBase, ok: false, actualName: pick.name, verified: false, wrote: true, verifyError: (e && e.message) || String(e), why: '保存调用已返回成功，但读不到预设列表来复核 —— 不当作成功；刷新预设列表确认一次' };
    }

    if (after.includes(pick.name)) {
        return { ...outBase, ok: true, actualName: pick.name, verified: true, wrote: true };
    }
    const beforeSet = new Set(before);
    const added = after.filter(n => !beforeSet.has(n));
    if (added.length === 1) {
        /* 宿主清洗规则跟我们的复刻有细微差别（例如未来升级了 sanitize-filename）⇒ 以宿主列表为准。 */
        return { ...outBase, ok: true, actualName: added[0], verified: true, hostRenamed: true, wrote: true, why: '酒馆把名字清洗成了「' + added[0] + '」' };
    }
    return {
        ...outBase,
        ok: false,
        verified: false,
        wrote: true,
        why: '保存接口返回了成功，但预设列表里没有出现新文件（可能被宿主清洗成了别的名字，或被别的东西覆盖了）。刷新预设列表确认一下；这次不当作成功。',
    };
}

/** 旧版酒馆的"当前设置 → 预设文件正文"投影（纯函数，供 updater 的完整 payload 预保存判据使用）。
 *  · file 的键就是**这份预设文件当前会保存的键集合**（旧版 ST 的 saveOpenAIPreset 是硬编码字段，
 *    `settingsToUpdate` 里有些键（例如 extensions）旧版根本不会写进文件 ⇒ 只按 file 的键投影，
 *    免得"永远追不上"导致每次点保存）。
 *  · settingsToUpdate 的结构（ST 1.13 / 1.19 同形）：`presetKey: [selector, settingsKey, isCheckbox, isConnection]`。
 *    取第 2 项做 live 键映射；没有映射就同名取值。
 *  · 结果过一遍 JSON（与真正 POST 的 JSON.stringify 同口径：undefined 键会被丢掉、NaN/Infinity 变 null）。
 *  @param {object} live 当前内存里的 chatCompletionSettings
 *  @param {object} file 盘上那份预设正文（只用来取键集合）
 *  @param {object} [settingsToUpdate]
 *  @returns {object} 会被旧版「更新预设」写进文件的正文 */
export function projectPresetPayload(live, file, settingsToUpdate) {
    const src = (live && typeof live === 'object') ? live : {};
    const map = (settingsToUpdate && typeof settingsToUpdate === 'object') ? settingsToUpdate : null;
    /* 没有文件（目标还不存在）时不能拿 live 的全部键 —— 那里面有一堆运行期字段，宿主不会写进预设文件。
       优先用 settingsToUpdate 的键集合（= 宿主真正会持久化的键）；连映射都没有才退回 live 键。 */
    const keys = (file && typeof file === 'object')
        ? Object.keys(file)
        : (map ? Object.keys(map) : Object.keys(src));
    const out = {};
    for (const k of keys) {
        const pair = map ? map[k] : null;
        let v;
        if (Array.isArray(pair)) {
            /* 映射表里的键 = 宿主真正会持久化的 UI/设置字段（含 extensions.regex_scripts 所在的 extensions）⇒ live 为准；
               live 没有这个值时退回文件现值（旧版没有这个设置时不要把文件里的值清掉）。 */
            v = src[pair[1]];
            if (v === undefined) v = src[k];
        } else if (file && typeof file === 'object' && Object.prototype.hasOwnProperty.call(file, k)) {
            /* 映射表外的顶层键 = 别的扩展写进文件的非 UI 字段 ⇒ **以文件现值为准**，
               不让 live 里同名的运行期杂项把它判脏/在保存时改掉。 */
            v = file[k];
        } else {
            v = src[k];
        }
        if (v === undefined && file && typeof file === 'object' && Object.prototype.hasOwnProperty.call(file, k)) v = file[k];
        out[k] = v;
    }
    try { return JSON.parse(JSON.stringify(out)); } catch (e) { return out; }
}
