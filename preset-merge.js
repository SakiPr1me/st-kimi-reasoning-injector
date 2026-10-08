/**
 * 预设更新器 · 合并内核（纯逻辑，不依赖 SillyTavern，可单测）
 *
 * 设计要点（依据真实预设实测，见 D:\酒馆开发\余温预设-更新合并器-设计方案.md）：
 *  - 预设 JSON = 顶层 ~45 个参数 + prompts[] + prompt_order[]（分组的顺序表）
 *  - 对话补全（openai）用的顺序表是 prompt_order 里 character_id === 100001 的那组
 *    （ST 1.19 PromptManager：promptOrder.strategy='global'、dummyId=100001；100000 是文本补全那份）
 *  - 条目跨版本匹配【必须按名字】：作者改过的条目保留 UUID，但重做/复制的条目会换新 UUID
 *  - 同一份预设里存在重名条目（分隔符如 '---'、'┌──设定──┐'）→ 同名按出现次序 1↔1 配对
 */

export const CHAT_ORDER_DUMMY_ID = 100001;   // 对话补全在用的顺序表
export const OTHER_ORDER_DUMMY_ID = 100000;  // 文本补全那份（原样搬运，不参与合并）

export const STATUS = {
    SAME: 'same',                   // 两边一样（无需处理）
    ONLY_MINE: 'onlyMine',          // 只有我的预设里有 → 默认保留
    ONLY_NEXT: 'onlyNext',          // 只有新版里有 → 默认加进来
    MINE_ONLY_CHANGED: 'mineOnly',  // 相对基准：只有我改了 → 默认保留我的
    AUTHOR_ONLY_CHANGED: 'authorOnly', // 相对基准：只有作者改了 → 默认用新版
    BOTH_CHANGED: 'both',           // 双方都改了 → 需要用户选
    MINE_ONLY_CHANGED_2WAY: 'mineOnly2way', // 两方对比（没有基准）：内容不同，无法归因 → 需要用户选
    RENAMED: 'renamed',             // 同一条目改了名字（内容一字未动）→ 默认用新版的（含新名字）
};

/** 列表上给用户看的一句话（说清"这条到底发生了什么"） */
export const STATUS_LABEL = {
    [STATUS.SAME]: '和我的完全一样',
    [STATUS.ONLY_MINE]: '只有我有，新版没有',
    [STATUS.ONLY_NEXT]: '新版新增',
    [STATUS.MINE_ONLY_CHANGED]: '只有你改过（作者没动它）',
    [STATUS.AUTHOR_ONLY_CHANGED]: '作者改过（你没动它）',
    [STATUS.BOTH_CHANGED]: '你和作者都改过',
    [STATUS.MINE_ONLY_CHANGED_2WAY]: '内容不一样（没填官方旧版，判断不了谁改的）',
    [STATUS.RENAMED]: '作者改了名字（内容没动）',
};

/** 简短徽标（列表右侧那枚小标签） */
export const STATUS_BADGE = {
    [STATUS.SAME]: '一样',
    [STATUS.ONLY_MINE]: '只有我有',
    [STATUS.ONLY_NEXT]: '新版新增',
    [STATUS.MINE_ONLY_CHANGED]: '你改过',
    [STATUS.AUTHOR_ONLY_CHANGED]: '作者改过',
    [STATUS.BOTH_CHANGED]: '双方都改',
    [STATUS.MINE_ONLY_CHANGED_2WAY]: '两边不同',
    [STATUS.RENAMED]: '改了名字',
};

/** 需要用户拍板的（其余按推荐自动处理） */
export function needsDecision(status) {
    return status === STATUS.BOTH_CHANGED || status === STATUS.MINE_ONLY_CHANGED_2WAY;
}

/** 值不值得让用户看一眼（"只看要处理的"过滤用） */
export function isNotable(status) {
    return status !== STATUS.SAME;
}

// ---------------------------------------------------------------- 基础工具

/** 名字规范化：去首尾空白 + 去零宽字符 + 统一连续空白（用于跨版本匹配） */
export function normalizeName(s) {
    return String(s ?? '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 取条目正文（兼容 content / system_prompt 两种写法） */
export function entryText(p) {
    if (!p || typeof p !== 'object') return '';
    if (typeof p.content === 'string' && p.content.length) return p.content;
    if (typeof p.system_prompt === 'string') return p.system_prompt;
    return typeof p.content === 'string' ? p.content : '';
}

/** 条目"内容指纹"：正文 + 角色 + 注入位置/深度（决定"算不算改了"）。
 *  入参必须是**原始 prompt 对象**（prompts[] 里的那一项）；条目对象请用 entryFp()。 */
export function entryFingerprint(p) {
    if (!p) return '';
    return JSON.stringify([
        entryText(p),
        p.role ?? null,
        p.injection_position ?? null,
        p.injection_depth ?? null,
    ]);
}

/** 同上，但入参是 indexPreset 产出的**条目对象**（字段名不同，别再传错） */
export function entryFp(e) {
    if (!e) return '';
    return JSON.stringify([e.text ?? '', e.role ?? null, e.pos ?? null, e.depth ?? null]);
}

/** 正文规范化（配对/空条目判断用）：去零宽、行尾空白、首尾空白 */
export function normalizeText(s) {
    return String(s ?? '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\s+$/, '')
        .replace(/^\s+/, '');
}

/** 是不是"空条目/纯分隔符"：空、只有空白、或只有横线/等号/竖线之类的分隔符
 *  （预设里常拿 '---'、'════' 这种条目当视觉分隔，它们不承载内容，
 *    对比时不该被当成"内容变了"来打扰用户） */
export function isEmptyEntry(text) {
    const t = normalizeText(text);
    if (!t) return true;
    if (t.length > 60) return false;                 // 长文当然不是分隔符
    // 只由分隔类字符 + 空白组成（允许夹杂少量字母数字？不允许，宁可保守）
    return /^[-_=*~—–·•<>#|/\\\s.·]+$/.test(t);
}

/** 字符二元组 Dice 相似度（短文本更稳：改几个字/加一句不该掉到 0.5 以下） */
function diceBigram(a, b) {
    const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
    const A = grams(a), B = grams(b);
    let ta = 0, tb = 0, inter = 0;
    for (const v of A.values()) ta += v;
    for (const v of B.values()) tb += v;
    for (const [k, v] of A) if (B.has(k)) inter += Math.min(v, B.get(k));
    return (ta + tb) ? (2 * inter) / (ta + tb) : 0;
}

/**
 * 锚点定位（★P0 新增，见《云端商店-定稿方案》§5.2）
 * 把"一个要插进去的条目"挂到目标预设里正确的位置上 —— 六级兜底，**永远能返回一个可用结果**。
 *
 * @param {object} place   { afterId, after, before, afterText, afterHash, indexInAuthor }
 *                         · afterId   = 作者那份里的 identifier（同一谱系最可靠）
 *                         · after     = 锚点条目的名字（跨用户/自己新建的条目）
 *                         · before    = **锚点自己的前一条**的名字（= 落点另一侧的邻居，和 after 组成"邻居对"）；
 *                                       after 找不到时退回它：**插在它后面** —— 也就是"补上锚点那一格"，
 *                                       所以锚点被删/改名时它比 after 的下一格更准（conf 55，仍 <85 会提示）
 *                                       （★P1 定稿语义，与 patchPack() 写包、商店 placeFor() 写包三者一致）
 *                         · afterText = 锚点正文样本 200~400 字（给 similarity 用；32 字的 hash 算不出相似度 ✗）
 * @param {Array}  entries 目标预设的条目（indexPreset().entries：{identifier,name,text,...}）
 * @param {Array}  orderIds 目标预设的顺序表 identifier 数组（字符串）
 * @returns {{ afterId: string|null, how: string, conf: number, sim?: number }}
 *          afterId = 插到"这条"后面（null = 放末尾）；conf = 置信度（<85 时 UI 必须显式提示）
 */
export function resolveAnchor(place = {}, entries = [], orderIds = []) {
    // ★修 B3（2026-09-19 实测复现）：默认值只对 undefined 生效 —— 调用方传 null 进来，
    //   下面第一句读 place.afterId 就直接抛 TypeError（"Cannot read properties of null"）✗
    //   这个函数的承诺是"永远能返回一个可用结果"，那就不能在最开头炸掉 → 统一兜底成 {}。
    if (!place || typeof place !== 'object') place = {};
    // ★顺手兜底 entries：里面混进 null / 非对象时（外部数据不可信），下面 e.name / e.text 会炸
    const list = (Array.isArray(entries) ? entries : []).filter(e => e && typeof e === 'object');
    const ids = Array.isArray(orderIds) ? orderIds.map(String) : [];
    const idOf = (e) => String((e && e.identifier) || '');
    const byId = new Map(list.filter(e => idOf(e)).map(e => [idOf(e), e]));
    const posInOrder = new Map(ids.map((id, i) => [id, i]));
    const posOfEntry = (e) => (posInOrder.has(idOf(e)) ? posInOrder.get(idOf(e)) : -1);
    // ★修 B6（2026-09-19 实测复现）：候选必须"在顺序表里"才真的能用 —— 调用方拿到 afterId
    //   是去 order.findIndex() 定位的，表外条目必然 -1 → **静默落到末尾**；而这里却报 conf 100，
    //   等于骗调用方。所以名字级/正文级的候选都**优先只从表内挑**，实在挑不到才退回表外候选，
    //   并且置信度压到 <85、在 how 里写明，让 UI 必须显式提示。
    const canAnchor = (e) => posInOrder.has(idOf(e));
    const outsideTag = '（这条不在顺序表里，得先补进顺序表才定位得到）';
    const tsim = (a, b) => (a && b) ? similarity(String(a), String(b)) : 0;
    const nameKey = (s) => normalizeName(s);

    // ① afterId 命中 + 内容吻合（同一谱系里最可靠）
    if (place.afterId && byId.has(String(place.afterId))) {
        const e = byId.get(String(place.afterId));
        // ★修 B6：id 确实命中了，但这条**不在顺序表里** → 调用方 findIndex = -1，照样静默落末尾 ✗
        //   还返回它（这条信息本身是对的，UI 可以据此提示用户"先把这条加进顺序表"），但置信度必须 <85。
        if (!canAnchor(e)) return { afterId: idOf(e), how: 'id 命中，但' + outsideTag, conf: 60 };
        if (place.afterText) {
            const s = tsim(place.afterText, e.text);
            return s > 0.9
                ? { afterId: idOf(e), how: 'id+内容吻合', conf: 100, sim: s }
                : { afterId: idOf(e), how: 'id（这条内容被改过 ' + Math.round((1 - s) * 100) + '%）', conf: 80, sim: s };
        }
        return { afterId: idOf(e), how: 'id', conf: 90 };
    }
    // ②③④ 名字：唯一命中 → 直接用；同名多条 → **优先用"邻居对"消歧**（前后的另一侧邻居名能对上），
    //       对不上再用正文样本挑最像的（★P0 修正：以前把"邻居对"单列一级，但名字一命中就返回了 →
    //       那一级永远走不到，是死代码 ✗；现在折进来当消歧条件，真正的兜底顺序才成立）
    const posByName = (n) => {
        if (!n) return -1;
        const k = nameKey(n);
        // ★修 B4（2026-09-19 实测复现）：归一化后是空的（全空白/零宽字符）→ 名字级一律不算命中。
        //   以前 k = '' 会去匹配"空名字条目"（实测误配到 e2 并报 conf 90 = 假的高置信度）✗
        if (!k) return -1;
        // ★修 B6：只认"在顺序表里"的同名条目（表外条目调用方定位不到）
        const hit = list.filter(e => nameKey(e.name) === k && canAnchor(e));
        return hit.length ? posOfEntry(hit[0]) : -1;
    };
    if (place.after) {
        const k = nameKey(place.after);
        // ★修 B4：名字归一化后为空 → 整段（②③④）跳过，别拿空名字去认"空名字条目"
        // ★修 B6：候选**先只在顺序表内的条目里挑**；表内一条都没有时才退回表外候选，
        //   并把置信度从 90/75/70 压到 <85 + how 里写明（调用方据此必须提示用户）
        const hitAll = k ? list.filter(e => nameKey(e.name) === k) : [];
        const hitIn = hitAll.filter(canAnchor);
        const hit = hitIn.length ? hitIn : hitAll;
        const outside = !hitIn.length && hitAll.length > 0;
        // ★修 R1-①（2026-09-19 复查）：B6 的"表内优先"**短路了正文样本** —— 同名条目"表内 1 条 + 表外 1 条"
        //   时，上面直接把表内那条认下来报 conf 90（等于"锚点可能错却报高置信度"），而 afterText 明明指向
        //   表外那条（旧内核会按样本挑出表外那条，虽然它也定位不到）。所以名字级命中之后**必须再用 afterText
        //   在全部同名候选（含表外）里复核一次**：表外那条明显更像（sim 差 >0.15 或它本身 >0.9）→
        //   置信度压到 <85 + how 写明，让 UI 必须提示用户确认。
        //   注意：**表内正常场景（样本指向表内那条 / 压根没有表外同名）一个字都不改**，见下面 note 返回 null 的分支。
        const reviewOut = (pickedIn, conf) => {
            if (!place.afterText || !pickedIn) return null;
            const outs = hitAll.filter(e => !canAnchor(e));
            if (!outs.length) return null;                       // 表外没有同名条目 → 没有"选错"的余地，不打扰
            const sIn = tsim(place.afterText, pickedIn.text);
            let sOut = -1, bestOut = null;
            for (const e of outs) { const s = tsim(place.afterText, e.text); if (s > sOut) { sOut = s; bestOut = e; } }
            // ★修 R1-①b（2026-09-20 复查）：判据里的 `sOut > 0.9` 以前**不看 sIn** → "表内 sim=1.00、表外 0.93"
            //   也会报 conf 80 且 how 写"表外更像"，自相矛盾（表内明明更像/一样像；真实数据 0 例，但口径错 ✗）。
            //   正确口径 = 表外明显更高（差 >0.15）**或** 表外自己也 >0.9 且确实高过表内；措辞同步 "更像" → "也很像"。
            if (!bestOut || !(sOut - sIn > 0.15 || (sOut > 0.9 && sOut > sIn))) return null;   // 没明显偏向表外 → 保持原样
            return {
                conf: Math.min(conf, 80),
                note: '（表外那条也很像（' + sOut.toFixed(2) + ' vs 表内 ' + sIn.toFixed(2) + '）—— 锚点可能选错，请确认）',
            };
        };
        if (hit.length === 1) {
            if (outside) return { afterId: idOf(hit[0]), how: '名字："' + place.after + '"' + outsideTag, conf: 60 };
            const w = reviewOut(hit[0], 90);
            return w
                ? { afterId: idOf(hit[0]), how: '名字："' + place.after + '"' + w.note, conf: w.conf }
                : { afterId: idOf(hit[0]), how: '名字："' + place.after + '"', conf: 90 };
        }
        if (hit.length > 1) {
            // 先用 before 消歧：候选里谁的前一条正好是 before 说的那条
            if (place.before) {
                const bPos = posByName(place.before);
                if (bPos >= 0) {
                    const exact = hit.find(e => posOfEntry(e) === bPos + 1);
                    if (exact) return { afterId: idOf(exact), how: '同名 ' + hit.length + ' 条 → 用"前一条"定位' + (outside ? outsideTag : ''), conf: 75 };
                }
            }
            // 再用正文样本挑最像的
            let best = null, bs = -1;
            for (const e of hit) { const s = tsim(place.afterText, e.text); if (s > bs) { bs = s; best = e; } }
            if (best) {
                const w = reviewOut(best, 70);                    // ★修 R1-①：多重命中同样复核（conf 本就 <85，只补 how）
                return { afterId: idOf(best), how: '同名 ' + hit.length + ' 条里挑最像的' + (outside ? outsideTag : '') + (w ? w.note : ''), conf: w ? w.conf : 70, sim: bs };
            }
        }
    }
    // ④b/⑥ 内容指纹：拿邻居正文样本，在目标里找最像且有明显优势的一条
    //   ★修 B6：同样**优先只从顺序表内的条目里**找；表内一条都没有（比如顺序表是空的）才退回全部
    //     候选 —— 那时置信度本来就是 50（<85，UI 会显式提示），不会骗调用方。
    const bodyScan = () => {
        const cand = list.filter(canAnchor);
        const pool = cand.length ? cand : list;
        const outside = !cand.length && list.length > 0;
        const scored = pool.map(e => ({ e, s: tsim(place.afterText, e.text) })).sort((a, b) => b.s - a.s);
        return { scored, outside };
    };
    // ★P3 修（2026-09-20 实测）：**"几乎一字不差"的正文样本（≥0.98）必须抢在"另一侧邻居"（55）前面**。
    //   实测组 5b：锚点在 B 那边被改了名、正文一字没动 —— 正文样本本来能 100% 认出它（sim=1），
    //   却因为商店包天然带 before、而第⑤级排在正文级前面，被"另一侧邻居"接走 → **落点差一格**。
    //   口径：只有 ≥0.98（且明显领先第二名）才抢跑；普通样本（0.75~0.98）仍然排在邻居兜底后面。
    const bodyReady = place.afterText ? bodyScan() : null;
    const bodyIsExact = !!bodyReady && bodyReady.scored.length > 0 && bodyReady.scored[0].s >= 0.98
        && (bodyReady.scored.length === 1 || bodyReady.scored[0].s - bodyReady.scored[1].s > 0.05);
    if (bodyReady && bodyIsExact) {
        return {
            afterId: idOf(bodyReady.scored[0].e),
            how: '按正文找最像的（' + bodyReady.scored[0].s.toFixed(2) + '，几乎一字不差）' + (bodyReady.outside ? outsideTag : ''),
            conf: 50, sim: bodyReady.scored[0].s,
        };
    }
    // ⑤ after 完全不中 → 只剩 before 可用（插在它后面）
    const pb2 = posByName(place.before);
    if (pb2 >= 0) return { afterId: ids[pb2], how: '只找到"前面那条"', conf: 55 };
    // ⑥ 样本没那么像（0.75~0.98）→ 仍然排在邻居兜底后面（口径不变）
    if (bodyReady && bodyReady.scored.length && bodyReady.scored[0].s > 0.75
        && (bodyReady.scored.length === 1 || bodyReady.scored[0].s - bodyReady.scored[1].s > 0.05)) {
        return {
            afterId: idOf(bodyReady.scored[0].e),
            how: '按正文找最像的（' + bodyReady.scored[0].s.toFixed(2) + '）' + (bodyReady.outside ? outsideTag : ''),
            conf: 50, sim: bodyReady.scored[0].s,
        };
    }
    return { afterId: null, how: '没找到邻居 → 放末尾', conf: 0 };
}

/** 前缀判定的最短长度：太短的样本（`---` 这类分隔符、一两个字）恰好开头没有信息量，
 *  不许靠"是前缀"白拿 1 分（会把同名分隔符/短条目认成同一条） */
const PREFIX_MIN = 24;

/** x 是不是 y 的前缀（约定 x 是短的那条）。
 *  ★P2 修（2026-09-20 实测）：末尾只剩半个代理对（emoji 被 slice(0,400) 切成一半）时，
 *  去掉那半个再比一次 —— 否则"样本对全文"会因为这半个字符判不出前缀。 */
function prefixHit(x, y) {
    if (x.length < PREFIX_MIN) return false;
    if (y.startsWith(x)) return true;
    const half = x.replace(/[\uD800-\uDBFF]$/, '');
    return half !== x && half.length >= PREFIX_MIN && y.startsWith(half);
}

/** 两份正文的相似度 0~1
 *  短文本走字符二元组（对"改几个字/补一句话"宽容），长文本走行级 LCS（能反映整段改写）
 *  ★P2 修（2026-09-20 实测）：一边是另一边的**前缀**（≥24 字）→ 直接判 1。
 *    为什么必须有：`place.afterText` 只存锚点正文前 360/400 字，而 >400 字的正文走**行级 LCS**
 *    → "前缀 vs 全文"会算出 0.0000（实测 `🤲初始化变量` 1417 字 = 0.0000；193 字的 = 1.0000）
 *    → ① id 级报假警报"这条内容被改过 100%"、⑥ 按正文找对**长条目彻底失效**。
 *    前缀 = "同一段文字被截断了"，不是"内容被改过" —— 该判 1。 */
export function similarity(a, b) {
    const A = normalizeText(a), B = normalizeText(b);
    if (!A && !B) return 1;
    if (!A || !B) return 0;
    if (A === B) return 1;
    if (prefixHit(A.length <= B.length ? A : B, A.length <= B.length ? B : A)) return 1;
    if (A.length <= 400 && B.length <= 400) return diceBigram(A, B);
    const la = A.split('\n'), lb = B.split('\n');
    if (la.length * lb.length > 400000) {
        const head = A.slice(0, 200) === B.slice(0, 200) ? 0.9 : 0;
        return head * (Math.min(A.length, B.length) / Math.max(A.length, B.length));
    }
    let same = 0;
    const d = diffLines(A, B);
    for (const x of d) if (x.type === 'same') same++;
    return (2 * same) / (la.length + lb.length);
}

/** 结构校验：是不是一份对话补全预设 */
export function isValidPreset(obj) {
    return !!obj && typeof obj === 'object'
        && Array.isArray(obj.prompts)
        && Array.isArray(obj.prompt_order);
}

/** JSON 深拷贝（预设里只有纯数据）。用来切断"展开带过来"的**共享引用** ——
 *  不切断的话，之后往结果里写东西会**同时改到** mine / next（甚至用户手上那份预设对象）。 */
export function deepCloneJson(v) {
    if (v === null || typeof v !== 'object') return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }   // 环/怪东西：退回共享，绝不抛
}

/** 浅拷贝一份预设（只到 prompts/prompt_order 元素层，避免结构化克隆大对象）
 *  ★R8：`extensions` 例外 —— 它专门深拷贝一次。理由：ST 的**预设级正则**就住在
 *    `extensions.regex_scripts`（见 REGEX_PATH），而 `{...preset}` 会把这一层**共享**出去，
 *    谁往里写一条正则就等于改了 mine/next/用户手上那份（真 BUG，不是洁癖）。 */
export function clonePreset(preset) {
    const out = {
        ...preset,
        prompts: (preset.prompts || []).map(p => ({ ...p })),
        prompt_order: (preset.prompt_order || []).map(g => ({
            ...g,
            order: Array.isArray(g.order) ? g.order.map(o => ({ ...o })) : [],
        })),
    };
    if (out.extensions && typeof out.extensions === 'object' && !Array.isArray(out.extensions)) {
        out.extensions = deepCloneJson(out.extensions);
    }
    return out;
}

/** 把 preset.extensions 换成"自己的副本"（改它不会动到传进来的那些预设对象） */
export function ownExtensions(preset) {
    if (preset && preset.extensions && typeof preset.extensions === 'object' && !Array.isArray(preset.extensions)) {
        preset.extensions = deepCloneJson(preset.extensions);
    }
    return preset;
}

/** 按"容器"合并的顶层键：extensions 是**别的扩展各自的数据袋**
 *  （实测作者预设：`extensions.regex_scripts` 50 条 / `extensions.depth_prompt.prompts` /
 *   `extensions.puppybot` / `extensions.baibaiToolkit.regexGroups` / `extensions.talkativeness`）。
 *  整袋照抄骨架 = 把"我这袋里别的扩展的数据"整袋丢掉 ⇒ 这一层要按**子键**取并集。 */
export const CONTAINER_TOP_KEYS = ['extensions'];

/**
 * ★R8 任务 A（台账 P1-3 的保真修复）：把"对方独有"的顶层字段补进结果。
 *
 * 规则（作者口径："以骨架那份为主，但把对方独有的键补上"）：
 *   ① 对方有、骨架没有的键 → **补上**（值做 JSON 深拷贝，切断共享引用）
 *   ② 两边都有、值不同 → **以骨架方为准**（一个字节都不动），只把键名记进 report.topFields.conflicts
 *   ③ **两边都是纯对象 → 递归进去**（安全评审 ②：`extensions` 那种袋子要一路钻到底，
 *      `extensions.baibaiToolkit.regexGroups` 这种深两层的才不会整块二选一）；
 *      **数组整块取骨架方**（数组的"合并"没有公认语义，硬合会造假数据）
 *   ④ `prompts` / `prompt_order` 不走这里（由条目合并逻辑负责）
 *   ⑤ 补进来的东西**一定进 report**（+ 一句 warnings），不许静默
 *
 * @param {object} skeleton 目标（**会被就地改**；调用方自己先克隆过）
 * @param {object} other    对方那份（预设对象，或包里带的"作者新版独有字段"）
 * @param {object} [report] 会被写 `report.topFields`；同时往 report.warnings 加一句人话
 * @param {{from?:string, containerKeys?:string[], maxDepth?:number}} [opts]
 * @returns {{skeleton:string, from:string, carried:string[], conflicts:string[], containerCarried:string[]}}
 */
export function carryTopFields(skeleton, other, report, opts = {}) {
    const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : 6;
    const rawFrom = opts.from || 'other';
    const fromLabel = rawFrom === 'mine' ? '我的' : (rawFrom === 'next' ? '新版的' : (rawFrom === 'pack' ? '作者新版的' : rawFrom));
    const res = { skeleton: 'skeleton', from: rawFrom, carried: [], conflicts: [], containerCarried: [] };
    if (!skeleton || typeof skeleton !== 'object' || !other || typeof other !== 'object') return res;

    const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    /** 递归一层：把 other 里 skeleton 缺的键补上；两边都有且都是纯对象 → 继续往下钻 */
    const mergeInto = (sk, ot, path, depth) => {
        for (const k of Object.keys(ot)) {
            if (k === '__proto__') continue;
            if (depth === 0 && SKIP_PARAM_KEYS.has(k)) continue;          // 只在顶层跳过 prompts/prompt_order
            const here = path ? (path + '.' + k) : k;
            if (!(k in sk)) {                                            // ① 对方独有 → 补上
                sk[k] = deepCloneJson(ot[k]);
                (depth === 0 ? res.carried : res.containerCarried).push(here);
                continue;
            }
            if (depth < maxDepth && isPlain(ot[k]) && isPlain(sk[k])) {   // ③ 递归进去（保真优先）
                if (sk[k] === ot[k] || depth === 0) sk[k] = deepCloneJson(sk[k]);
                mergeInto(sk[k], ot[k], here, depth + 1);
                continue;
            }
            if (JSON.stringify(ot[k]) !== JSON.stringify(sk[k])) res.conflicts.push(here);   // ② 同键不同值（含数组整块）
        }
    };
    mergeInto(skeleton, other, '', 0);

    if (report && typeof report === 'object') {
        report.topFields = res;
        const all = [...res.carried, ...res.containerCarried];
        if (all.length) {
            if (!Array.isArray(report.warnings)) report.warnings = [];
            report.warnings.push('★已保留' + fromLabel + '独有的顶层字段 ' + all.length + ' 个：'
                + all.slice(0, 8).join('、') + (all.length > 8 ? '…' : '') + '（并进结果，没丢）');
        }
    }
    return res;
}

/** 取某个顺序组（默认对话补全那份）；没有就返回 null */
export function getOrderGroup(preset, dummyId = CHAT_ORDER_DUMMY_ID) {
    const groups = Array.isArray(preset?.prompt_order) ? preset.prompt_order : [];
    return groups.find(g => Number(g.character_id) === Number(dummyId)) || null;
}

/**
 * 把预设整理成便于比对/合并的视图。
 * @returns {{notice:string[], entries:Array, byKey:Map, orderList:Array, enabledById:Map, positionById:Map, unknownInOrder:string[]}}
 *  entries: [{identifier, name, key, text, role, pos, depth, enabled, index}]
 */
export function indexPreset(preset, { dummyId = CHAT_ORDER_DUMMY_ID } = {}) {
    const notice = [];
    const prompts = Array.isArray(preset?.prompts) ? preset.prompts : [];
    const group = getOrderGroup(preset, dummyId);
    const orderList = group && Array.isArray(group.order) ? group.order : [];
    if (!group) notice.push('这份预设里没有对话补全的顺序表（character_id=' + dummyId + '），顺序相关操作会被跳过');

    const enabledById = new Map();
    const positionById = new Map();
    orderList.forEach((o, i) => {
        if (!o || typeof o.identifier !== 'string') return;
        enabledById.set(o.identifier, o.enabled !== false);
        if (!positionById.has(o.identifier)) positionById.set(o.identifier, i);
    });

    // 重名计数（用于按次序配对）
    const nameCount = new Map();
    for (const p of prompts) {
        const k = normalizeName(p?.name) || ('#' + String(p?.identifier || ''));
        nameCount.set(k, (nameCount.get(k) || 0) + 1);
    }
    const nameSeen = new Map();

    const entries = prompts.map((p, i) => {
        const name = String(p?.name ?? '');
        const nk = normalizeName(name) || ('#' + String(p?.identifier || ''));
        const seq = nameSeen.get(nk) || 0;
        nameSeen.set(nk, seq + 1);
        const identifier = String(p?.identifier ?? '');
        return {
            identifier,
            name,
            nameKey: nk,
            /** 跨版本配对键：名字 + 该名字下的第几次出现 */
            key: nk + '#' + seq,
            dupIndex: seq,
            text: entryText(p),
            role: p?.role ?? null,
            pos: p?.injection_position ?? null,
            depth: p?.injection_depth ?? null,
            enabled: enabledById.has(identifier) ? enabledById.get(identifier) : null,
            orderIndex: positionById.has(identifier) ? positionById.get(identifier) : -1,
            index: i,
            prompt: p,
        };
    });

    const byKey = new Map();
    for (const e of entries) if (!byKey.has(e.key)) byKey.set(e.key, e);

    const unknownInOrder = orderList
        .filter(o => o && typeof o.identifier === 'string')
        .map(o => o.identifier)
        .filter(id => !prompts.some(p => String(p?.identifier) === id));
    if (unknownInOrder.length) notice.push('顺序表里有 ' + unknownInOrder.length + ' 条在条目列表里找不到（属于旧残留，合并时原样保留）');

    const dupNames = [...nameCount.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    if (dupNames.length) notice.push('有 ' + dupNames.length + ' 组重名条目（如分隔符），已按出现次序配对，可在界面里手动改配');

    return { notice, entries, byKey, orderList, enabledById, positionById, unknownInOrder };
}

// ---------------------------------------------------------------- 行级 diff（LCS）

/**
 * 行级差异（用于"看差异"高亮）。为性能设上限：行数过多时只做首尾裁剪 + 粗略标记。
 * @returns {Array<{type:'same'|'add'|'del', text:string}>}
 */
export function diffLines(a, b, { maxCells = 400000 } = {}) {
    const la = String(a ?? '').split('\n');
    const lb = String(b ?? '').split('\n');
    if (la.length * lb.length > maxCells) {
        // 太大：退化为整体替换（避免卡界面）
        return [...la.map(t => ({ type: 'del', text: t })), ...lb.map(t => ({ type: 'add', text: t }))];
    }
    // LCS 长度表
    const n = la.length, m = lb.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (la[i] === lb[j]) { out.push({ type: 'same', text: la[i] }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: la[i] }); i++; }
        else { out.push({ type: 'add', text: lb[j] }); j++; }
    }
    while (i < n) out.push({ type: 'del', text: la[i++] });
    while (j < m) out.push({ type: 'add', text: lb[j++] });
    return out;
}

/**
 * 把行级 diff 归并成"块"：
 *   { kind:'same', lines:[...] }                    —— 两边一样，原样保留
 *   { kind:'change', mine:[...], next:[...] }        —— 不同的一段，让用户选 用我的/用新版/都要
 * 这样界面呈现的就是"差异本身"，用户把每一处不同点完，这一条就拼好了（顺序天然就是 diff 的顺序）。
 */
export function diffBlocks(a, b, opts) {
    const lines = diffLines(a, b, opts);
    const blocks = [];
    let cur = null;
    for (const l of lines) {
        const kind = l.type === 'same' ? 'same' : 'change';
        if (kind === 'change') {
            if (!cur || cur.kind !== 'change') { cur = { kind: 'change', mine: [], next: [] }; blocks.push(cur); }
            if (l.type === 'add') cur.next.push(l.text); else cur.mine.push(l.text);
        } else {
            if (!cur || cur.kind !== 'same') { cur = { kind: 'same', lines: [] }; blocks.push(cur); }
            cur.lines.push(l.text);
        }
    }
    blocks.forEach((bl, i) => { bl.i = i; bl.changed = bl.kind === 'change'; });
    return blocks;
}

/** 按"块选择"拼出最终正文：choices 形如 { 块下标: 'mine'|'next'|'both' } */
/** 按块拼正文。
 *  choices: { [块号]: 'mine' | 'next' | 'both' | null }（null = 用户点掉了这一处的勾 = 还没定）
 *  defaultSide: 没点过的块用哪一边拼（★v3.9：'mine' = 用户整条选了"用我的" → 预览必须跟着变，
 *               以前固定用新版，导致"选了用我的，下面预览还是新版"（用户实测 BUG）） */
export function assembleFromBlocks(blocks, choices = {}, defaultSide = 'next') {
    const dflt = defaultSide === 'mine' ? 'mine' : 'next';
    const out = [];
    for (const bl of blocks) {
        if (bl.kind === 'same') { out.push(...bl.lines); continue; }
        const c = choices[bl.i];
        if (c === 'mine') out.push(...bl.mine);
        else if (c === 'next') out.push(...bl.next);
        else if (c === 'both') out.push(...bl.mine, ...bl.next);
        else out.push(...(dflt === 'mine' ? bl.mine : bl.next));   // 没选的地方按整条的方向，界面会拦住不让生成
    }
    return out.join('\n');
}

/** 进度：还有几处不同没选 */
export function pickProgress(blocks, choices = {}) {
    const changes = blocks.filter(b => b.changed);
    const decided = changes.filter(b => !!choices[b.i]).length;
    return { total: changes.length, decided, left: changes.length - decided };
}

/** 差异行数统计（用一句话说明"改了多大"） */
export function diffStat(a, b) {
    const d = diffLines(a, b);
    let add = 0, del = 0;
    for (const x of d) { if (x.type === 'add') add++; else if (x.type === 'del') del++; }
    return { add, del, same: d.length - add - del };
}

/**
 * 字级（行内）差异：给"两行都有、只是改了几个字"的情况用。
 * 背景：条目正文常常是"一整段没有换行"的长文本 —— 行级 diff 会把整段变成"整块替换"，
 *       用户看到的就是"旧的一大坨 vs 新的一大坨"，看不出到底改了哪几个字（用户实测的痛点）。
 * 这里对单行做字符级 LCS，返回 [[same|del|add, 片段], …]，界面把不同的片段高亮出来。
 * 性能：只在两行都不太长时用（默认 ≤ 900 字符），否则退回"整行替换"。
 */
/** 中间段的字符级 DP（就是原来那套；只在掐掉公共前后缀之后调用） */
function inlineCore(A, B) {
    const n = A.length, m = B.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out = [];
    const push = (type, ch) => {
        const last = out[out.length - 1];
        if (last && last.type === type) last.text += ch; else out.push({ type, text: ch });
    };
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', A[i]); i++; }
        else { push('add', B[j]); j++; }
    }
    while (i < n) push('del', A[i++]);
    while (j < m) push('add', B[j++]);
    return out;
}

/**
 * 字级（行内）差异。
 * ★先把公共前后缀掐掉，只对"中间真正不同的那一段"做 DP —— 这样"在一大段里插几句 / 末尾追加一大段"
 *   都能算出精确的字级差异，不再受总长度限制（用户实测：长段落里追加的内容以前完全看不出）。
 *   只有"中间那段"本身就超过 maxChars 时才退化成 del+add（这种情况整块的底色已经说明了）。
 */
export function inlineDiff(a, b, { maxChars = 2000 } = {}) {
    const A = String(a ?? ''), B = String(b ?? '');
    if (A === B) return [{ type: 'same', text: A }];
    let p = 0;
    while (p < A.length && p < B.length && A.charCodeAt(p) === B.charCodeAt(p)) p++;
    let sa = A.length, sb = B.length;
    while (sa > p && sb > p && A.charCodeAt(sa - 1) === B.charCodeAt(sb - 1)) { sa--; sb--; }
    const pre = A.slice(0, p), suf = A.slice(sa);
    const midA = A.slice(p, sa), midB = B.slice(p, sb);
    const out = [];
    if (pre) out.push({ type: 'same', text: pre });
    if (midA.length > maxChars || midB.length > maxChars) {
        if (midA) out.push({ type: 'del', text: midA });
        if (midB) out.push({ type: 'add', text: midB });
    } else {
        out.push(...inlineCore(midA, midB));
    }
    if (suf) out.push({ type: 'same', text: suf });
    return out;
}

/** 字级差异里"改了多大"：返回被改动的片段数量（给界面写一句话用） */
export function inlineStat(a, b, opts) {
    const segs = inlineDiff(a, b, opts);
    let del = 0, add = 0;
    for (const s of segs) { if (s.type === 'del') del += s.text.length; else if (s.type === 'add') add += s.text.length; }
    return { del, add, segs };
}

// ---------------------------------------------------------------- 顺序差异（v2）

/** 最长上升子序列（返回下标），用于判断"哪些条目其实没动" */
function lisIndices(seq) {
    const tails = [], tailIdx = [], prev = new Array(seq.length).fill(-1);
    for (let i = 0; i < seq.length; i++) {
        let lo = 0, hi = tails.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < seq[i]) lo = mid + 1; else hi = mid; }
        if (lo > 0) prev[i] = tailIdx[lo - 1];
        tails[lo] = seq[i]; tailIdx[lo] = i;
    }
    const out = [];
    let k = tailIdx.length ? tailIdx[tails.length - 1] : -1;
    while (k >= 0) { out.push(k); k = prev[k]; }
    return out.reverse();
}

/**
 * 顺序差异（比"第 i 位不一样就算一处"有意义得多）：
 *   把两边都有的条目排成序列，用 LIS 找出"相对次序没变的那些"，
 *   剩下的就是**真正被挪动**的条目 → 用户只需要关心这一小撮。
 * @returns {{mineList:Array, nextList:Array, moved:Array, counts:object, changed:boolean}}
 */
export function orderDiff(mineIdx, nextIdx, pairs = []) {
    // 只有"名字 / 内部 id / 内容一字不差"这种**确定**的配对才参与顺序比较；
    // 靠相似度猜出来的"疑似改名"不参与 —— 否则它会以"位置被挪动"的形式误导用户
    // （用户实测：新版新增的条目因为和新版里另一条 78% 相似，被判成"被挪动"而不是"新版新增"）
    const solidPairs = pairs.filter(p => !p.renamed || p.renamedKind === 'exact');
    const guessNextIds = new Set(pairs.filter(p => p.renamed && p.renamedKind !== 'exact').map(p => String(p.next.identifier)));
    const nextIdOfMine = new Map(solidPairs.map(p => [String(p.mine.identifier), String(p.next.identifier)]));
    const nextIdSet = new Set(nextIdx.entries.map(e => String(e.identifier)));
    const mineNameById = new Map(mineIdx.entries.map(e => [String(e.identifier), e.name]));
    const nextNameById = new Map(nextIdx.entries.map(e => [String(e.identifier), e.name]));

    const mineIds = mineIdx.orderList.map(o => String(o.identifier));
    const nextIds = nextIdx.orderList.map(o => String(o.identifier));
    const posInNext = new Map(nextIds.map((id, i) => [id, i]));

    // 两边都有、且都在顺序表里的条目 → 比较相对顺序
    const commonMineIds = mineIds.filter(id => nextIdOfMine.has(id) && posInNext.has(nextIdOfMine.get(id)));
    const seq = commonMineIds.map(id => posInNext.get(nextIdOfMine.get(id)));
    const keep = new Set(lisIndices(seq));

    const moved = [];
    commonMineIds.forEach((mid, i) => {
        if (keep.has(i)) return;
        const nid = nextIdOfMine.get(mid);
        moved.push({
            mineId: mid, nextId: nid,
            name: nextNameById.get(nid) || mineNameById.get(mid) || '(未命名)',
            from: mineIds.indexOf(mid) + 1, to: posInNext.get(nid) + 1,
        });
    });

    const mineList = mineIds.map((id, i) => ({
        index: i + 1, identifier: id, name: mineNameById.get(id) || ('(未命名 ' + id + ')'),
        inNext: nextIdOfMine.has(id) && posInNext.has(nextIdOfMine.get(id)),
        moved: moved.some(m => m.mineId === id),
        onlyMine: !nextIdSet.has(nextIdOfMine.get(id) || ''),
        pairGuess: guessNextIds.has(id),
    }));
    const nextList = nextIds.map((id, i) => ({
        index: i + 1, identifier: id, name: nextNameById.get(id) || ('(未命名 ' + id + ')'),
        isNew: ![...nextIdOfMine.values()].includes(id) && !guessNextIds.has(id),
        moved: moved.some(m => m.nextId === id),
        pairGuess: guessNextIds.has(id),
    }));

    const counts = {
        mineTotal: mineIds.length,
        nextTotal: nextIds.length,
        common: commonMineIds.length,
        moved: moved.length,
        stable: keep.size,
        added: nextList.filter(x => x.isNew).length,
        removed: mineList.filter(x => x.onlyMine).length,
        pairGuess: nextList.filter(x => x.pairGuess).length,   // 疑似改名（不参与顺序比较，单独提示）
    };
    return { mineList, nextList, moved, counts, changed: counts.moved > 0 };
}

// ---------------------------------------------------------------- 匹配 / 分类

/**
 * 跨版本配对：按 key（名字+第几次出现）配对；剩余用 identifier 兜底。
 * @returns {{matched:Array<{mine,next,key}>, onlyMine:Array, onlyNext:Array, notice:string[]}}
 */
export function matchPresets(mineIdx, nextIdx, { unpairKeys = [] } = {}) {
    const notice = [];
    const matched = [];
    const usedNext = new Set();
    const unpair = new Set(unpairKeys);

    for (const me of mineIdx.entries) {
        let ne = nextIdx.byKey.get(me.key);
        if (ne && usedNext.has(ne.key)) ne = null;
        if (!ne && me.identifier) {
            // 兜底：identifier 相同也算同一条（作者原地改过、名字被微调的情况）
            ne = nextIdx.entries.find(x => x.identifier && x.identifier === me.identifier && !usedNext.has(x.key)) || null;
            if (ne) notice.push('「' + (me.name || me.identifier) + '」是按内部 id 配上的（名字有改动）');
        }
        if (ne && unpair.has(me.key)) { ne = null; }   // 用户手动拆开过
        if (ne) { usedNext.add(ne.key); matched.push({ mine: me, next: ne, key: me.key, renamed: false }); }
    }

    // ② 内容配对：作者重做预设会连内部 id 一起换掉，只剩正文能对上
    //    —— 完全一致 → 认定为"改了名字的同一"；高度相似 → 疑似（用户可一键拆开）
    const leftMine = mineIdx.entries.filter(me => !matched.some(p => p.mine === me));
    const leftNext = nextIdx.entries.filter(x => !usedNext.has(x.key));
    const byText = new Map();
    for (const x of leftNext) {
        const t = normalizeText(x.text);
        if (!t || isEmptyEntry(t)) continue;
        if (!byText.has(t)) byText.set(t, []);
        byText.get(t).push(x);
    }
    for (const me of leftMine) {
        if (unpair.has(me.key)) continue;   // 用户手动拆开过 → 不许再自动配上
        const t = normalizeText(me.text);
        if (!t || isEmptyEntry(t)) continue;
        const cands = byText.get(t);
        if (!cands || !cands.length) continue;
        const ne = cands.shift();
        usedNext.add(ne.key);
        matched.push({ mine: me, next: ne, key: me.key, renamed: true, renamedKind: 'exact', similarity: 1 });
        notice.push('「' + me.name + '」新版改名成「' + ne.name + '」（内容一模一样）');
    }

    // ③ 剩下的做相似度扫描：≥90% 认为"同一条被改名+微调"，照样配成一条（用户可一键拆开）；
    //    60%~90% 只在提示里点一句，不自动配（避免把两条本来无关的条目错配）。
    const stillMine = mineIdx.entries.filter(me => !matched.some(p => p.mine === me) && !unpair.has(me.key) && !isEmptyEntry(me.text));
    const stillNext = nextIdx.entries.filter(x => !usedNext.has(x.key) && !isEmptyEntry(x.text));
    const likely = [];
    const hints = [];
    if (stillMine.length && stillNext.length && stillMine.length * stillNext.length <= 4000) {
        for (const me of stillMine) {
            let best = null, bestSim = 0, secondSim = 0;
            for (const ne of stillNext) {
                if (usedNext.has(ne.key)) continue;
                const sim = similarity(me.text, ne.text);
                if (sim > bestSim) { secondSim = bestSim; bestSim = sim; best = ne; }
                else if (sim > secondSim) secondSim = sim;
            }
            // 唯一且足够像 → 认作"同一条改了名字（可能还改了内容）"。
            // 阈值 0.75：覆盖"改名 + 顺手改点内容"的常见幅度；有并列候选就不自动配（宁可不配也别配错）
            const clear = bestSim >= 0.75 && (secondSim < 0.05 || bestSim - secondSim >= 0.15);
            if (best && clear) {
                usedNext.add(best.key);
                matched.push({ mine: me, next: best, key: me.key, renamed: true, renamedKind: 'likely', similarity: bestSim });
                likely.push({ mine: me.name, next: best.name, similarity: bestSim });
                notice.push('「' + me.name + '」和「' + best.name + '」内容 ' + Math.round(bestSim * 100) + '% 相同但名字不同，可能是同一条（改了名字又改了内容）→ 已合成一条让你选，可点「不是同一条」拆开');
            } else if (best && bestSim >= 0.6) {
                hints.push({ mine: me.name, next: best.name, similarity: bestSim, ambiguous: !clear && secondSim >= 0.05 });
            }
        }
    }

    const onlyMine = mineIdx.entries.filter(me => !matched.some(p => p.mine === me));
    const onlyNext = nextIdx.entries.filter(x => !usedNext.has(x.key));
    return { matched, onlyMine, onlyNext, renamedPairs: matched.filter(m => m.renamed), likelyRenamed: likely, similarHints: hints, notice };
}

/**
 * 给一条配对定级。给了 base（官方旧版）就是三方对比 → 能精确归因；没有 base 就是两方对比。
 */
export function classifyPair(mine, next, base) {
    if (!next) return { status: STATUS.ONLY_MINE };
    if (!mine) return { status: STATUS.ONLY_NEXT };
    const fpMine = entryFingerprint(mine.prompt || mine);
    const fpNext = entryFingerprint(next.prompt || next);
    if (fpMine === fpNext) return { status: STATUS.SAME };
    if (base) {
        const fpBase = entryFingerprint(base.prompt || base);
        const mineChanged = fpMine !== fpBase;
        const authorChanged = fpNext !== fpBase;
        if (mineChanged && authorChanged) return { status: STATUS.BOTH_CHANGED };
        if (mineChanged) return { status: STATUS.MINE_ONLY_CHANGED };
        if (authorChanged) return { status: STATUS.AUTHOR_ONLY_CHANGED };
        return { status: STATUS.SAME }; // 两边都和基准一样（理论上前面已判 SAME）
    }
    return { status: STATUS.MINE_ONLY_CHANGED_2WAY };
}

// ================================================================ 「隐藏条目」—— ★判据只写这一处（D2 / 作者台账）
/** ★★D2：一条条目**在 ST 里是不是隐藏的** —— 判据 = **不在对话补全顺序表里**（`indexPreset().entries[].orderIndex < 0`）。
 *
 *  作者原话（v4.0，本判据第一次落地就在 `analyze()` 的 `hiddenSkipped` 那一段，见那里的注释）：
 *  *"两份预设的顺序表里都没有的那些条目，为什么要加进来？它本身在预设里就是隐藏的、不让用户看到的，你就别管它"*。
 *  机理（D1 支实测，见 `e2e/d1-status.md`）：ST 的条目列表**按顺序表渲染**（`PromptManager.getPromptsForCharacter`），
 *  他点行尾那颗 ⛓️（`handleDetach → detachPrompt`）只 `promptOrder.splice` —— **只摘顺序表、`prompts[]` 一个字不动**
 *  ⇒ 行从界面上消失（他记成"我删掉了"），条目对象**永远留在文件里**。他真实预设里这种有 **22 条**。
 *
 *  ★判据**只写这一处**：商店（`preset-store.js` 的 `loadWizardPreset` / `buildPayload` 兜底）与
 *    更新器（`analyze()` 的 `hiddenSkipped`）**一律调它**，别再各自写一遍 `orderIndex < 0`
 *    （本项目踩过"两处各写一份就分叉"，见 `preset-store.js` 的 `shownEntries` 注释）。
 *  ★★红线：**绝不许拿这个函数去改 `liveEntries()` / `presetFingerprint()`**
 *    （本文件 `2435 / 2457 / 2514 / 2709` 那一族）—— 它喂**云端商店卡片的指纹**
 *    （`presetFingerprint().entries` = "参与注入的条目数"），口径一改**已发布卡片全部失配**。
 *  ★只读：不改条目、不写盘、不联网、不读时钟。
 *  @param {object|null|undefined} e `indexPreset().entries[]` 里的一条（传 null/undefined = 这一侧没有这条）
 */
export function isHiddenEntry(e) {
    if (!e) return true;            // 这一侧根本没有这条 → 对"两边都没有"的判定算隐藏（与老判据一字同义）
    const i = e.orderIndex;
    return !(typeof i === 'number' && i >= 0);
}

/** ★★D2：「这条该出现在界面/包里吗」= 幽灵（`isHiddenEntry`）+ **★R2 预备开关**。
 *  `hideDisabled` = 把"关着的"（`enabled === false`）也隐掉 —— ★★**默认 false**，两条硬理由：
 *    ① **更新器侧只能隐"两边都关"、必须保留 `enabledDiff`（开关不同）** —— 台账 §571 的硬规则是
 *       "开关不同走'开关不同'那一条让你选边"；隐掉它 = **无声把用户的"关"翻成"开"**。
 *       本函数作用在**单份预设**上，看不出"两边都关" ⇒ 更新器**不许**传 `hideDisabled:true`，
 *       那一档只能落在 `analyze()` 的 `hiddenSkipped` 那一段（判据同处、复用 `stats.hiddenSkipped`）。
 *    ② 与 **§W10**（作者原话"外层关掉某条 → 这里对应的条目**变半透明**（仍显示、只是不显眼）"，
 *       逐字抄在 `preset-store.js` 的 `offSetOf` / `pickListHtml` / 卡片行三处）**直接冲突**
 *       ⇒ **等作者拍板**；在那之前**默认必须是 false**（商店设置项 `hideDisabledInPicker` 默认 false）。
 */
export function isListedEntry(e, opts) {
    if (isHiddenEntry(e)) return false;
    return !(opts && opts.hideDisabled === true && e.enabled === false);
}

/** ★★D2：一份预设里**界面上该列**的条目（`indexPreset()` 的结果直接丢进来；只读、不排序、不改条目）。
 *  商店「部分上传」的条目列表 = `orderEntries(idx, visibleEntries(idx, {hideDisabled: R2 开关}))`；
 *  更新器的对比页/总览走 `analyze().items`（幽灵在那里的 `hiddenSkipped` 一段已经剔掉，两处同一判据）。
 *  @param {object} idx `indexPreset()` 的返回值
 *  @param {{hideDisabled?:boolean}} [opts] 见 `isListedEntry`（★默认 false）
 */
export function visibleEntries(idx, opts) {
    const all = (idx && Array.isArray(idx.entries)) ? idx.entries : [];
    return all.filter(e => isListedEntry(e, opts));
}

// ---------------------------------------------------------------- 对比总入口

const SKIP_PARAM_KEYS = new Set(['prompts', 'prompt_order']);

/**
 * 完整对比：条目 + 顺序 + 开关 + 全局参数。
 * @param {{mine:object, next:object, base?:object}} presets
 */
export function analyze({ mine, next, base, unpairKeys = [] }) {
    if (!isValidPreset(mine)) throw new Error('"我的预设"不是有效的对话补全预设（缺 prompts / prompt_order）');
    if (!isValidPreset(next)) throw new Error('"新版预设"不是有效的对话补全预设（缺 prompts / prompt_order）');
    const baseOk = isValidPreset(base);

    const mineIdx = indexPreset(mine);
    const nextIdx = indexPreset(next);
    const baseIdx = baseOk ? indexPreset(base) : null;

    // 两边的提示都要带上！只收 next 侧会漏掉"我这边顺序表有已删条目残留"这类提醒（真 BUG）
    const notice = [...mineIdx.notice, ...nextIdx.notice, ...(baseIdx ? baseIdx.notice : [])]
        .filter((v, i, arr) => arr.indexOf(v) === i);
    const mp = matchPresets(mineIdx, nextIdx, { unpairKeys });
    const { matched, onlyMine, onlyNext } = mp;
    for (const t of (mp.similarHints || [])) notice.push('「' + t.mine + '」和「' + t.next + '」内容 ' + Math.round(t.similarity * 100) + '% 相同但名字不同，可能是同一条；相似度不够没敢自动配，你可以在条目里用「不是同一条」/ 手动取舍');

    const items = [];
    for (const p of matched) {
        const baseEntry = baseIdx
            ? (baseIdx.byKey.get(p.next.key) || baseIdx.entries.find(x => x.identifier && x.identifier === p.next.identifier) || null)
            : null;
        let { status } = classifyPair(p.mine, p.next, baseEntry);
        /* ★W99-甲（2026-10-06 · 作者实测）：**"名字不一样"这件事必须**独立成一条正交信息，
           而且**跟"这一对是怎么配上的"无关** —— 改前 `renamed` / `nameChanged` 都写成
           `!!p.renamed`，而 `matchPresets()` 里 `renamed:true` **只在按正文配上时才给**
           （① 按 key / identifier 配上的那一支写死 `renamed:false`）⇒ 作者最常见的现场
           （他保留了内部 id、只把条目改了个名字）**在界面上既看不到改名、也没得选**
           （W99 夹具实测：`nameChanged` 判据两头都取不到 → 徽标落在"两边一样"、"待我处理"里也不出现）。
           ⇒ 现在判据 = "两边都有 + 规范化名字不同"（`normalizeName`，与 `nameChanged` 同一个尺子），
              **与配对方式无关**；`p.renamed/renamedKind/similarity` 照旧保留（"怎么配上的"那套口径一个字没动）。 */
        const nameChanged = normalizeName(p.mine.name) !== normalizeName(p.next.name);
        const renamed = !!p.renamed || nameChanged;
        // 改名是"正交"信息：内容一字未动 → status=renamed；内容也变了 → 保留内容状态，
        // 由 UI 用 it.renamed / it.nameChanged 另外标一枚"名字变了：旧→新"的提示
        if (renamed && status === STATUS.SAME) status = STATUS.RENAMED;
        // 注意：入参必须是 indexPreset 产出的**条目对象**（带 text/role/pos/depth），
        // 不能直接把条目对象喂给 entryFingerprint——那个函数认的是原始 prompt 的 content，
        // 喂错会两边都取到空串 → mineChanged 永远 false → 差异行数/「看差异」全部消失。
        const mineChanged = entryFp(p.mine) !== entryFp(p.next);
        const enabledDiff = !!(p.mine.enabled !== null && p.next.enabled !== null && p.mine.enabled !== p.next.enabled);
        const mineEmpty = isEmptyEntry(p.mine.text);
        const nextEmpty = isEmptyEntry(p.next.text);
        items.push({
            key: p.key,
            status,
            mine: p.mine,
            next: p.next,
            base: baseEntry,
            mineChanged,
            enabledDiff,
            orderDiff: false,          // 由 orderDiff() 统一填充（见下）
            orderMoved: false,
            renamed,
            renamedKind: p.renamedKind || null,
            similarity: p.similarity ?? null,
            nameChanged,
            mineEmpty, nextEmpty,
            emptyRelated: mineEmpty !== nextEmpty,   // 一边是空的/分隔符，另一边有内容
            diff: mineChanged ? diffStat(p.mine.text, p.next.text) : null,
        });
    }
    // 只有我有 / 只有新版有 —— 必须都进 items（UI 要展示、要能选择）
    for (const me of onlyMine) {
        items.push({
            key: 'mine:' + me.key, status: STATUS.ONLY_MINE, mine: me, next: null, base: null,
            mineChanged: false, enabledDiff: false, orderDiff: false, orderMoved: false,
            renamed: false, renamedKind: null, similarity: null, nameChanged: false,
            mineEmpty: isEmptyEntry(me.text), nextEmpty: false, emptyRelated: false, diff: null,
        });
    }
    for (const ne of onlyNext) {
        items.push({
            key: 'next:' + ne.key, status: STATUS.ONLY_NEXT, mine: null, next: ne, base: null,
            mineChanged: false, enabledDiff: false, orderDiff: false, orderMoved: false,
            renamed: false, renamedKind: null, similarity: null, nameChanged: false,
            mineEmpty: false, nextEmpty: isEmptyEntry(ne.text), emptyRelated: false, diff: null,
        });
    }

    // 全局参数差异
    const params = [];
    const keys = new Set([...Object.keys(mine), ...Object.keys(next)]);
    for (const k of keys) {
        if (SKIP_PARAM_KEYS.has(k)) continue;
        const a = mine[k], b = next[k];
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        params.push({ key: k, mine: a, next: b });
    }
    // ★v4.0 用户："两份预设的顺序表里都没有的那些条目，为什么要加进来？它本身在预设里就是隐藏的、不让用户看到的，你就别管它"
    //   → 直接从清单里剔除（否则它们永远是"待处理"，"还剩 N 条"清不掉）。（ST 里不在 prompt_order 的条目=不参与注入）
    // ★★D2（2026-09-22）：判据**收敛到 `isHiddenEntry()` 一处**（本文件上面那个导出函数，商店也调它）——
    //   逐字等价：`it.mine` 为 null 时老写法给 true、`isHiddenEntry(null)` 也是 true。行为一个字没改。
    const hiddenSkipped = items.filter(it => isHiddenEntry(it.mine) && isHiddenEntry(it.next));
    if (hiddenSkipped.length) {
        for (let i = items.length - 1; i >= 0; i--) if (hiddenSkipped.indexOf(items[i]) >= 0) items.splice(i, 1);
        notice.push('有 ' + hiddenSkipped.length + ' 条在两份预设的顺序表里都没有（ST 里不参与注入的隐藏条目）→ 没列进来');
    }
    // 顺序差异：相对次序有没有真的变（LIS 算法，见 orderDiff）
    const od = orderDiff(mineIdx, nextIdx, matched);
    const movedNextIds = new Set(od.moved.map(m => m.nextId));
    const movedMineIds = new Set(od.moved.map(m => m.mineId));
    for (const it of items) {
        if (it.mine && movedMineIds.has(String(it.mine.identifier))) it.orderMoved = true;
        if (it.next && movedNextIds.has(String(it.next.identifier))) it.orderMoved = true;
        it.orderDiff = it.orderMoved;
    }

    const stats = {
        total: items.length,
        hiddenSkipped: hiddenSkipped.length,      // 两份顺序表里都没有 → 没列进来的条数（v4.0）
        same: items.filter(i => i.status === STATUS.SAME).length,
        needDecide: items.filter(i => needsDecision(i.status)).length,
        onlyMine: items.filter(i => i.status === STATUS.ONLY_MINE).length,
        onlyNext: items.filter(i => i.status === STATUS.ONLY_NEXT).length,
        authorOnly: items.filter(i => i.status === STATUS.AUTHOR_ONLY_CHANGED).length,
        mineOnly: items.filter(i => i.status === STATUS.MINE_ONLY_CHANGED).length,
        paramDiffs: params.length,
        orderChanged: od.changed ? 1 : 0,   // 兼容旧字段：1=相对顺序有变
        orderMoved: od.counts.moved,        // 真正被挪动的条目数（LIS）
        orderStable: od.counts.stable,      // 相对次序没动的条目数
        orderAdded: od.counts.added,
        orderRemoved: od.counts.removed,
        order: od,
        renamed: items.filter(i => i.status === STATUS.RENAMED).length,
        renamedTotal: items.filter(i => i.renamed).length,
        emptySame: items.filter(i => i.mineEmpty && i.nextEmpty).length,
        threeWay: baseOk,
    };
    return { items, params, stats, notice, mineIdx, nextIdx, baseIdx, order: od, matchInfo: { renamedPairs: mp.renamedPairs, likelyRenamed: mp.likelyRenamed, similarHints: mp.similarHints || [] } };
}

// ---------------------------------------------------------------- 决策：不替用户选

/** 这条需要用户明确选一下吗？（选完才能生成）
 *  · 只有一方有的、两边不一样的、改了名字的 → 要选
 *  · 两边一模一样、两边都是空条目 → 不用选（自动沿用新版骨架）
 *  用户 2026-09-17 定：**不要有任何默认选择**，列表里显示"还剩几条要处理"。 */
export function needsChoice(item) {
    if (!item) return false;
    if (item.mineEmpty && item.nextEmpty) return false;      // 两边都是分隔符/空 → 无关紧要
    if (!item.mine || !item.next) return true;               // 只有一方有 → 要选（保留 / 不要）
    if (item.status === STATUS.SAME) return !!(item.enabledDiff || item.renamed); // 内容一样但开关不同 / 名字不同 → 要选
    return true;                                             // 其余都要选
}

/** 未经用户选择的条目在合成时的兜底：跟新版（骨架就是新版，等于不动）
 *  UI 会在没选完时拦住生成，所以这里只是"万一"的安全值。 */
export function fallbackDecision(item) {
    if (item && item.mine && !item.next) return { source: 'mine', enabled: 'mine' };
    return { source: 'next', enabled: 'next' };
}

/** 「全部按推荐」用：这一步是用户主动点的，所以可以给推荐值 */
export function recommendDecision(item) {
    switch (item.status) {
        case STATUS.ONLY_MINE: return { source: 'mine', enabled: 'mine' };
        case STATUS.MINE_ONLY_CHANGED: return { source: 'mine', enabled: 'next' };
        case STATUS.SAME: return { source: 'next', enabled: 'next' };
        default: return { source: 'next', enabled: 'next' };
    }
}

/** 还剩几条没选（界面上那个"待处理"计数） */
/** 这一条算"处理完了"吗？（★UI 和内核共用同一套判定，别再各写一份）
 *  · 不用选的条目 → 天然算完
 *  · 只有"开关不同"要选的条目（正文一字未动）→ 用户点过 保持新状态/还原旧状态（enabled 有值）才算完
 *    （v3.9 用户："开关不同这里也要能处理完毕，不能一直挂着红圈"）
 *  · **逐处挑（`source:'custom'`）→ 每一处"变了的地方"都挑过才算完**（★W19A-3，2026-09-25 主 Agent 授权补）
 *  · 其余（内容有差异/只有一方有/改了名字）→ 有 source 才算完 */
export function itemDecided(item, d) {
    if (!item || !needsChoice(item)) return true;
    if (!d) return false;
    const switchOnly = item.mine && item.next && item.status === STATUS.SAME && !!item.enabledDiff;
    if (switchOnly) return d.enabled !== undefined && d.enabled !== null;
    /* ★W99-甲（自测抓到的真缺口）：**只有"这一条真有内容可挑"时才要求 `source`** ——
       名字 / 开关是**与内容并列的两维**（下面两道闸），而"只改了名字"那种条目（正文一字未动、
       指纹 `entryFp` 也只差名字）界面上**只给名字那两颗**（`itemHtml` 的 nameBtns 分支）
       ⇒ 再拿 `source` 卡它，这一条**永远处理不完**（W99 首跑 e2e 实测："点不动的: [📃创作契约📃]"）。
       判据与界面同源：两边都有 + 正文有差异或指纹有差异（正文/角色/注入位置/注入深度）→ 要内容这一维。 */
    const textDiff = !!(item.diff && (item.diff.add || item.diff.del));
    const contentDim = (!item.mine || !item.next) ? true : (item.renamed ? (textDiff || !!item.mineChanged) : true);
    if (contentDim && !d.source) return false;
    /* ★★W99-甲（2026-10-06 · 作者原话）："那这个两边不同 **除了内容，前面还可以插入**：就是两边不同
       到底是**选择旧版开关、新版开关**，以及**选择旧版名字还是新版名字**…**要选完所有的**，
       它才能在这一个"两边不同"的地方变成"两边一样"……反正就是**得让用户通通选择才行**"。
       ⇒ 名字 / 开关是**与内容并列的两个独立维度**，各自都要"亲手选过一次"才算这条处理完：
         · 名字不同（`renamed`）→ 必须有 `d.name ∈ {'mine','next'}`（条目侧 UI 的两组选择 / 行的
           「用旧名字 / 用新名字」写的就是它）；
         · 开关不同（`enabledDiff`，两边都有）→ 必须有 `d.enabled ∈ {'mine','next'}`（或顺序页拨钮那种
           布尔覆盖值 —— 那是更明确的一次操作，照收）。
       ⇒ 只选了内容 ⇒ 仍然 `待处理`（「还剩 N 条」不清零、生成前照旧会拦一道），
         与作者"那个数字本来是有多少项，选完了就加上这两项"逐字对应。 */
    if (item.renamed && d.name !== 'mine' && d.name !== 'next') return false;
    if (item.mine && item.next && item.enabledDiff
        && d.enabled !== 'mine' && d.enabled !== 'next' && typeof d.enabled !== 'boolean') return false;
    /* ★W19A-3（2026-09-25 · 主 Agent 书面授权，只改这一处）：**逐处挑的中间态不算完**。
       改前这里是 `return !!d.source;` —— 而"逐处挑"的中间态 `source` 已经是 `'custom'` ⇒ 恒真
       ⇒ UI 里那句「挑到一半（还差 N 处）」**永远显示不出来**（作者实测："只有在里边修改字样的话
       它才会更新状态"那一族的另一面；W21-C 定位、作者拍板要"显示"）。
       判据 = **内核自己那套块进度**（`diffBlocks` + `pickProgress`），不新造第二套：
       UI 的 `decideProgress()` 与 `pickProgress()` 对同一份 blocks/决策**逐字段同值**
       （W19A-3 实测三档全等：`{2,0,2}` / `{2,1,1}` / `{2,2,0}`）⇒ 这一处改完，UI 那边一行都不用动。
       · `item.mine && item.next` 这道闸必须有：custom 只可能出现在"双方正文都有差异"的条目上，
         单边条目硬算会永远 `left > 0`（那是坑，不是需求）；
       · **代价（有意为之）**：中间态从此算"没处理完" ⇒ `pendingCount()` /「待我处理」筛选 /
         生成·缝入的门禁都认它 —— 不让半成品被静默生成（作者 2026-09-25 拍板）；
       · 开销：只对 `source === 'custom'` 的条目算一次 diff，这类条目最多几条，跑在 154 条的循环里可忽略。 */
    if (d.source === 'custom' && item.mine && item.next) {
        const blocks = diffBlocks(item.mine.text || '', item.next.text || '');
        return pickProgress(blocks, d.blockDecision || {}).left === 0;
    }
    return true;
}

export function pendingCount(items, decisions = {}) {
    let n = 0;
    for (const it of items) {
        if (!needsChoice(it)) continue;
        if (itemDecided(it, decisions[it.key])) continue;
        n++;
    }
    return n;
}

/**
 * 生成前的"覆盖风险"清单：哪些条目的当前决策会让**你改过的内容**被新版覆盖。
 * （仅用于生成确认框里的一句话提醒；界面上不再常驻横幅——用户明确要求去掉）
 */
export function overwriteRisk(items, decisions = {}) {
    const risky = [];
    for (const it of items) {
        const dec = decisions[it.key] || fallbackDecision(it);
        if (dec.source === 'next' && it.mine && it.next && it.mineChanged) risky.push(it);
    }
    return risky;
}

/** 默认拼接：我的在上、新版在下，中间空行。
 *  ★v3.9 起界面上的「两版都保留」不再用它（改成"新版照旧 + 旧版另存一条"，见 makeOldCopyPrompt）；
 *  这个函数只留给"逐处挑里某一处要两行都要"（`choices[i]='both'`）用。 */
export function defaultSplice(mineText, nextText, order = 'mineFirst', sep = '\n\n') {
    const a = String(mineText ?? '').replace(/\s+$/, '');
    const b = String(nextText ?? '').replace(/^\s+/, '');
    if (!a) return b;
    if (!b) return a;
    return order === 'nextFirst' ? (b + sep + a) : (a + sep + b);
}

/** 「两版都保留」用的那条**旧版副本**：按 ST 真字段把"我的这一条"整条复制一份，名字加（旧版）。
 *  · 返回 null = 我这边本来就没内容（空的另存出来没意义，就别缝进去了）
 *  · identifier 用"原 id + __ywpu_old"，同一份预设里再撞就补数字（taken 传 merged 现有的 id 集合） */
export function makeOldCopyPrompt(item, taken) {
    const p = (item && item.mine && item.mine.prompt) ? item.mine.prompt : null;
    if (!p) return null;
    const text = String(item.mine.text ?? p.content ?? '');
    if (!text.trim()) return null;
    const base = String(p.identifier || item.mine.identifier || 'entry');
    let id = base + '__ywpu_old';
    if (taken && typeof taken.add === 'function') {
        let n = 2;
        while (taken.has(id)) { id = base + '__ywpu_old' + n; n++; }
        taken.add(id);
    }
    const rawName = String(p.name || item.mine.name || '条目').trim() || '条目';
    return { ...p, identifier: id, name: rawName + '（旧版）', ...textFieldFor(p, text) };
}

// ================================================================ 预设级「正则」（ST 正则扩展的 PRESET 类）
//
// ★R8 任务 B 已查证（行号 = D:\ST酒馆 那份，2026-09-21 查）：
//   · **正则住在预设文件里**：路径 = `extensions.regex_scripts`（一个数组，**顺序即执行顺序**）。
//     写：引擎 `scripts/extensions/regex/engine.js:150-154`（saveScriptsByType → PRESET）
//         → `scripts/preset-manager.js:883 writePresetExtensionField({path:'regex_scripts'})`
//         → `lodash.set(preset.extensions, 'regex_scripts', ...)` + savePreset（**整份写回文件**）
//     读：`engine.js:121-128`（getScriptsByType → PRESET）→ `preset-manager.js:853 readPresetExtensionField`
//   · **一条正则的字段**（`scripts/char-data.js:88-102` 的 RegexScriptData，共 13 个，一个都不许少）：
//     id / scriptName / findRegex / replaceString / trimStrings[] / placement[] / disabled /
//     markdownOnly / promptOnly / runOnEdit / substituteRegex / minDepth / maxDepth
//     （实测作者 V0811：50 条全部 13 键齐全；`trimStrings` 真的出现过非空 `["> 阿七吐槽："]`）
//   · **哪一类算"跟着预设走"**：`SCRIPT_TYPES.PRESET` = 存文件里这一档 ✔（缝合范畴）；
//     `SCRIPT_TYPES.GLOBAL` 住 `extension_settings.regex`、`SCOPED` 住角色卡的
//     `data.extensions.regex_scripts` ✘（跟人/跟角色走，**不进缝合**）。
//   · **开关在设置里**：`extension_settings.preset_allowed_regex[apiId] = [预设名, …]`
//     （engine.js:122/215-259）。它是**按预设名**记的"我允许用这份预设里的正则"，属于用户设置、
//     不属于文件 ⇒ 我们另存新名的那一份，用户第一次切过去时 ST 会**再问一次**允许（不是静默生效）。
//     改名时 ST 自己会迁移（`regex/index.js:1696 onPresetRenamed`）——**我们不用管，也不该替用户开**。

/** 一条正则脚本的**真实字段**（顺序固定，写包/比对/展示都按这个来） */
export const REGEX_FIELDS = ['id', 'scriptName', 'findRegex', 'replaceString', 'trimStrings', 'placement',
    'disabled', 'markdownOnly', 'promptOnly', 'runOnEdit', 'substituteRegex', 'minDepth', 'maxDepth'];

/** 预设里正则所在的路径（只有这一处；包格式与界面都引用它，别再各写一份字面量） */
export const REGEX_PATH = 'extensions.regex_scripts';

/** "内容"字段：判断**改没改**（决定跑出来的文本）用这一组。
 *  · id 不算（复制一条会换 id，不代表改了）
 *  · scriptName 单独判（只改名字 = renamed，不算内容变化）
 *  · disabled 单独判（"开关不同"要给用户选边，跟条目那套 enabledDiff 同口径） */
export const REGEX_BODY_FIELDS = ['findRegex', 'replaceString', 'trimStrings', 'placement', 'markdownOnly',
    'promptOnly', 'runOnEdit', 'substituteRegex', 'minDepth', 'maxDepth'];

/** `placement` 在 ST 里的取值（engine.js:281-292 regex_placement） */
export const REGEX_PLACEMENT = { MD_DISPLAY: 0, USER_INPUT: 1, AI_OUTPUT: 2, SLASH_COMMAND: 3, WORLD_INFO: 5, REASONING: 6 };
export const REGEX_PLACEMENT_LABEL = {
    0: '旧版 MD 显示（ST 已废弃）', 1: '用户输入', 2: 'AI 输出', 3: '斜杠命令', 5: '世界书', 6: '思维链',
};
/** `substituteRegex` 的取值（engine.js:298-302 substitute_find_regex） */
export const REGEX_SUBSTITUTE = { NONE: 0, RAW: 1, ESCAPED: 2 };
export const REGEX_SUBSTITUTE_LABEL = { 0: '不替换宏', 1: '先替换宏（原样）', 2: '先替换宏（转义）' };

/** ST 新脚本的默认值（regex/index.js:825-835 保存时就是这些）——缺字段时按这份补齐 */
export const REGEX_DEFAULTS = {
    id: '', scriptName: '', findRegex: '', replaceString: '', trimStrings: [], placement: [2],
    disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false,
    substituteRegex: 0, minDepth: null, maxDepth: null,
};

/** 取预设里的正则清单（**只认预设级**；没有/类型不对 → 空数组，绝不猜） */
export function getRegexList(preset) {
    const arr = preset && preset.extensions && preset.extensions.regex_scripts;
    return Array.isArray(arr) ? arr : [];
}

/** 把正则清单写回预设（**调用方先把预设克隆过**；这里只管写）。
 *  返回 preset，方便链式用。 */
export function setRegexList(preset, list) {
    if (!preset || typeof preset !== 'object') return preset;
    if (!preset.extensions || typeof preset.extensions !== 'object' || Array.isArray(preset.extensions)) preset.extensions = {};
    preset.extensions.regex_scripts = Array.isArray(list) ? list : [];
    return preset;
}

/** 把一条正则**整条**补齐成 ST 的 13 个字段（台账 P2-2："字段一个不许少"）。
 *  · **不认识的键原样留着**（保真：ST 以后加字段、别的工具塞了私有字段，都不许因为我们搬一趟就丢）
 *  · 类型按 ST 的读法纠正（trimStrings/placement 必须是数组；minDepth/maxDepth 空 = null） */
export function normalizeRegexScript(src) {
    const r = (src && typeof src === 'object' && !Array.isArray(src)) ? src : {};
    const out = {};
    for (const k of Object.keys(r)) out[k] = r[k];                      // 先原样带上（含私有字段）
    const num = (v, d) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? d : Number(v);
    out.id = String(r.id ?? '');
    out.scriptName = String(r.scriptName ?? r.name ?? '');
    out.findRegex = String(r.findRegex ?? '');
    out.replaceString = String(r.replaceString ?? '');
    out.trimStrings = Array.isArray(r.trimStrings) ? r.trimStrings.map(v => String(v)) : [];
    out.placement = Array.isArray(r.placement) ? r.placement.map(Number).filter(n => Number.isFinite(n)) : [REGEX_PLACEMENT.AI_OUTPUT];
    out.disabled = r.disabled === true;
    out.markdownOnly = r.markdownOnly === true;
    out.promptOnly = r.promptOnly === true;
    out.runOnEdit = r.runOnEdit === true;
    out.substituteRegex = num(r.substituteRegex, REGEX_SUBSTITUTE.NONE);
    out.minDepth = num(r.minDepth, null);
    out.maxDepth = num(r.maxDepth, null);
    return out;
}

/** 一条正则的"内容指纹"（REGEX_BODY_FIELDS，按固定顺序；用来判"改没改"） */
export function regexBodySig(script) {
    const r = normalizeRegexScript(script);
    return JSON.stringify(REGEX_BODY_FIELDS.map(k => r[k]));
}

/** 一条正则的"整条指纹"（13 个字段全比；id 不同但其余相同 = 同一条的复制品） */
export function regexFullSig(script, { withId = true } = {}) {
    const r = normalizeRegexScript(script);
    return JSON.stringify(REGEX_FIELDS.filter(k => withId || k !== 'id').map(k => r[k]));
}

/** 这条正则**是不是已经在清单里了**（判据 = 除 `id` 外 12 个字段一字不差）。
 *  ★为什么必须忽略 id：ST 的「导入正则」给每条**新发 uuid**（`regex/index.js:1505 uuidv4()`），
 *    而我们的包**保留包里那份 id** ⇒ "同一条正则"在两次搬运里可能长得只差一个 id。
 *  ⚠ 只差 `disabled`（开/关）的**不算**同一条 —— 那是"开着的那份 / 关着的那份"，该照旧加。
 *  @returns 撞上的那一条（原对象）或 null
 */
export function findSameRegex(list, reg) {
    const want = regexFullSig(reg, { withId: false });
    for (const r of (Array.isArray(list) ? list : [])) {
        if (regexFullSig(r, { withId: false }) === want) return r;
    }
    return null;
}

/** 界面上给这条正则一个短标签（列表行头用） */
export function regexLabel(script) {
    const r = normalizeRegexScript(script);
    const n = normalizeName(r.scriptName);
    if (n) return n;
    const f = normalizeText(r.findRegex);
    return f ? ('（没名字的正则）' + f.slice(0, 40)) : '（空正则）';
}

/**
 * 把正则清单整理成便于配对/合并的视图（跟 `indexPreset` 同一套思路）。
 * 跨版本配对键：`名字#出现次序`（名字空的退到 `#id`，再退到 `~正文前 60 字`）——
 * 跟条目一样，**同名按出现次序 1↔1 配对**（作者预设里确实有 3 条 findRegex 一样的"弹幕美化"）。
 * @returns {{entries:Array, byKey:Map, byId:Map, byName:Map, byFind:Map, list:Array}}
 *  entries: [{key, seq, nk, idKey, findKey, name, script(已补齐), index}]
 */
export function indexRegexScripts(list) {
    const src = Array.isArray(list) ? list : [];
    const seen = new Map();
    const entries = src.map((raw, i) => {
        const script = normalizeRegexScript(raw);
        const nk = normalizeName(script.scriptName);
        const idKey = String(script.id || '');
        const findKey = normalizeText(script.findRegex);
        const stem = nk || (idKey ? ('#' + idKey) : ('~' + findKey.slice(0, 60)));
        const seq = seen.get(stem) || 0;
        seen.set(stem, seq + 1);
        return { key: stem + '#' + seq, seq, nk, idKey, findKey, name: script.scriptName, script, index: i };
    });
    const put = (m, k, e) => { if (!m.has(k)) m.set(k, []); m.get(k).push(e); };
    const byId = new Map();
    const byName = new Map();
    const byFind = new Map();
    for (const e of entries) {
        if (e.idKey && !byId.has(e.idKey)) byId.set(e.idKey, e);
        if (e.nk) put(byName, e.nk, e);
        if (e.findKey) put(byFind, e.findKey, e);
    }
    return { entries, byKey: new Map(entries.map(e => [e.key, e])), byId, byName, byFind, list: src };
}

/**
 * 两条正则的配对阶梯（**和条目那套同思路**，台账 P2-4："id → 名字 → findRegex 正文"三级）：
 *   ① id 一样                       → conf 100
 *   ② 名字归一化后一样（各自唯一）    → conf 90
 *   ③ findRegex 一模一样（各自唯一）  → conf 70
 *   ④ 名字一样但有多条 → 用 findRegex 相似度挑最像的 → conf 60
 *   ⑤ findRegex 很像（≥0.9，各自唯一）→ conf 50
 * 配对是 1↔1（贪心，按 conf 从高到低吃），配不上的进 onlyMine / onlyNext。
 * @returns {{matched:Array<{key,mine,next,how,conf}>, onlyMine:Array, onlyNext:Array}}
 */
export function matchRegexScripts(mineIdx, nextIdx) {
    const cands = [];
    const push = (mine, next, conf, how) => { if (mine && next) cands.push({ mine, next, conf, how }); };
    for (const n of nextIdx.entries) {
        const m = n.idKey ? mineIdx.byId.get(n.idKey) : null;
        if (m) push(m, n, 100, 'id 一样（同一条）');
    }
    for (const n of nextIdx.entries) {
        if (!n.nk) continue;
        const ms = mineIdx.byName.get(n.nk) || [];
        const ns = nextIdx.byName.get(n.nk) || [];
        if (ms.length === 1 && ns.length === 1) push(ms[0], n, 90, '名字一样（"' + n.name + '"）');
    }
    for (const n of nextIdx.entries) {
        if (!n.findKey) continue;
        const ms = mineIdx.byFind.get(n.findKey) || [];
        const ns = nextIdx.byFind.get(n.findKey) || [];
        if (ms.length === 1 && ns.length === 1) push(ms[0], n, 70, 'findRegex 一模一样');
    }
    for (const n of nextIdx.entries) {
        const ms = n.nk ? (mineIdx.byName.get(n.nk) || []) : [];
        if (ms.length <= 1) continue;
        let best = null, bs = -1;
        for (const m of ms) {
            const s = similarity(String(m.findKey) + ' ' + String(m.script.replaceString), String(n.findKey) + ' ' + String(n.script.replaceString));
            if (s > bs) { bs = s; best = m; }
        }
        if (best) push(best, n, 60, '同名 ' + ms.length + ' 条里挑最像的（' + bs.toFixed(2) + '）');
    }
    // ★到此为止**不再往下模糊配对**（故意）："findRegex 很像但不完全相同"硬配起来，
    //   会把"作者换了一条新正则 / 你把旧的那条改坏了"这类**真差异**藏进一对配对里；
    //   配不上 → 各自进 onlyMine / onlyNext，界面上两条都看得见（宁可多列一行，不许悄悄配错）。
    cands.sort((a, b) => (b.conf - a.conf) || (a.next.index - b.next.index));
    const usedMine = new Set(), usedNext = new Set();
    const matched = [];
    for (const c of cands) {
        if (usedMine.has(c.mine.key) || usedNext.has(c.next.key)) continue;
        usedMine.add(c.mine.key); usedNext.add(c.next.key);
        matched.push({ key: c.next.key, mine: c.mine, next: c.next, how: c.how, conf: c.conf });
    }
    matched.sort((a, b) => a.next.index - b.next.index);      // 结果按**新版顺序**排（就是将来的顺序骨架）
    const onlyMine = mineIdx.entries.filter(e => !usedMine.has(e.key));
    const onlyNext = nextIdx.entries.filter(e => !usedNext.has(e.key));
    return { matched, onlyMine, onlyNext };
}

/**
 * 正则的"位置"锚点（台账 P2-3：**正则有序**，有锚点就插锚点后，找不到就放最后 + 标位置待定）。
 * 锚点语义跟条目那套一致：`after*` = **插在它后面**（= 这条在前面的那条）。
 * 六级（越靠前越可信）：
 *   ① afterId（同一条的 id，同一谱系最可靠）        → conf 100
 *   ② afterName（名字唯一）                          → conf 85
 *   ③ afterName 同名多条 → 用 afterFind 挑最像的      → conf 75
 *   ④ afterFind（findRegex 一样）                     → conf 70
 *   ⑤ afterIndex（按作者那份里的位次，夹到范围里）     → conf 55
 *   ⑥ 全落空 → 放最后，**pending = true**（界面必须标"位置待定"）
 * @param {{afterId?:string, afterName?:string, afterFind?:string, afterIndex?:number}} place
 * @param {Array} entries 目标清单的 entries（indexRegexScripts().entries）
 * @returns {{afterKey:string|null, how:string, conf:number, pending:boolean}}
 */
export function resolveRegexAnchor(place = {}, entries = []) {
    const p = place || {};
    const list = Array.isArray(entries) ? entries : [];
    const id = String(p.afterId || '');
    if (id) {
        const e = list.find(x => x.idKey && x.idKey === id);
        if (e) return { afterKey: e.key, how: '按内部 id 定位（' + regexLabel(e.script) + '）', conf: 100, pending: false };
    }
    const nm = normalizeName(p.afterName || '');
    if (nm) {
        const same = list.filter(x => x.nk === nm);
        if (same.length === 1) return { afterKey: same[0].key, how: '按名字定位（"' + nm + '"）', conf: 85, pending: false };
        if (same.length > 1) {
            const f = normalizeText(p.afterFind || '');
            let best = same[0], bs = -1;
            for (const e of same) { const s = f ? similarity(e.findKey, f) : 0; if (s > bs) { bs = s; best = e; } }
            return { afterKey: best.key, how: '同名 ' + same.length + ' 条里挑最像的（' + bs.toFixed(2) + '）', conf: 75, pending: false };
        }
    }
    const fk = normalizeText(p.afterFind || '');
    if (fk) {
        const same = list.filter(x => x.findKey === fk);
        if (same.length) return { afterKey: same[0].key, how: '按 findRegex 定位', conf: 70, pending: false };
    }
    // ★位次兜底：**必须显式给了数字**才算（null/''/undefined 一律当"没给"）——
    //   踩过的坑：`Number(null) === 0` 是有限数 → 把"根本没有锚点"误判成"锚点在第 1 条"，
    //   结果"位置待定"该放最后的那几条被静默插到了第 2 位（e2e ③ 抓到的）。
    const rawIdx = p.afterIndex;
    const idx = (rawIdx === null || rawIdx === undefined || rawIdx === '') ? NaN : Number(rawIdx);
    if (Number.isFinite(idx) && idx >= 0 && list.length) {
        const at = Math.max(0, Math.min(list.length - 1, Math.round(idx)));
        return { afterKey: list[at].key, how: '按位次（第 ' + (at + 1) + ' 条）兜底', conf: 55, pending: false };
    }
    return { afterKey: null, how: '找不到它原来前面的那条 → 先放最后', conf: 0, pending: true };
}

/** 给一条正则算"包里该写什么 place"（写包侧用；锚点 = 它在**作者清单**里前面的那条）
 *  ★第一条没有"前面那条" → 不给 afterIndex（不给 = 没有锚点 → 读方按"位置待定/放最后"处理），
 *    免得被位次兜底误当成"插在第 1 条后面"。 */
function regexPlaceOf(entry, listEntries, indexInAuthor) {
    const prev = (indexInAuthor > 0) ? listEntries[indexInAuthor - 1] : null;
    const out = { afterId: '', afterName: '', afterFind: '', afterIndex: null };
    if (!prev) return out;
    out.afterId = String(prev.script.id || '');
    out.afterName = normalizeName(prev.name);
    out.afterFind = normalizeText(prev.findRegex).slice(0, 200);
    out.afterIndex = indexInAuthor - 1;
    return out;
}

/**
 * 正则清单的对比（**不替用户选**，跟条目 `analyze()` 同一套 status/口径）。
 * @param {{mine?:object, next?:object, base?:object|Array}} p
 *   base = 可选的"共同祖先"：传整份预设（取它的 regex_scripts）或直接传数组。
 *          有 base 才能区分"作者改的"与"你改的"；没有一律算"两边不同，判断不了谁改的"。
 * @returns {{items:Array, stats:object, notice:string[], mineIdx:object, nextIdx:object, baseIdx:object|null}}
 */
export function analyzeRegexes({ mine, next, base = null, safety = null } = {}) {
    const safetyOpts = safety || {};
    const mineIdx = indexRegexScripts(getRegexList(mine));
    const nextIdx = indexRegexScripts(getRegexList(next));
    const baseList = Array.isArray(base) ? base : getRegexList(base);
    const baseIdx = baseList.length ? indexRegexScripts(baseList) : null;
    const notice = [];
    const { matched, onlyMine, onlyNext } = matchRegexScripts(mineIdx, nextIdx);
    const mineByKey = new Map(mineIdx.entries.map(e => [e.key, e]));
    const baseOf = (m) => {
        if (!baseIdx) return null;
        return (m.idKey && baseIdx.byId.get(m.idKey))
            || (m.nk && (baseIdx.byName.get(m.nk) || [])[0])
            || (m.findKey && (baseIdx.byFind.get(m.findKey) || [])[0])
            || null;
    };
    const items = [];
    const safetyCache = new Map();          // 正则指纹 → 安全检查结果（同一个表达式不重复量）
    const safetyOf = (script) => {
        const k = regexFullSig(script);
        if (!safetyCache.has(k)) safetyCache.set(k, regexSafetyCheck(script, safetyOpts || {}));
        return safetyCache.get(k);
    };
    for (const p of matched) {
        const m = p.mine, n = p.next;
        const bodySame = regexBodySig(m.script) === regexBodySig(n.script);
        const nameSame = normalizeName(m.script.scriptName) === normalizeName(n.script.scriptName);
        const disabledDiff = (m.script.disabled === true) !== (n.script.disabled === true);
        const be = bodySame && nameSame ? null : baseOf(m);
        let status;
        if (bodySame && nameSame) status = STATUS.SAME;                     // 内容一样（id 不同不算）
        else if (bodySame && !nameSame) status = STATUS.RENAMED;            // 只改了名字
        else if (be) status = classifyRegexPair(m.script, n.script, be.script);
        else status = STATUS.MINE_ONLY_CHANGED_2WAY;
        items.push({
            key: p.key, kind: 'pair', status,
            mine: m, next: n, base: be,
            how: p.how, conf: p.conf,
            nameChanged: !nameSame,
            disabledDiff,
            bodyChanged: !bodySame,
            renamed: bodySame && !nameSame,
            label: regexLabel(n.script),
            safety: safetyOf(n.script),                    // ★安全预检（以"新版那一条"为准：要缝进去的是它）
            mineSafety: safetyOf(m.script),                // 你手上那条也量一下（你那条如果有问题，界面上也看得见）
        });
    }
    for (const m of onlyMine) {
        // 锚点 = **我的清单里**它前面最近的一条、且那条在新版里也有（这样翻译到结果里才找得到）
        let anchor = null;
        for (let i = m.index - 1; i >= 0; i--) {
            const cand = mineIdx.entries[i];
            const hit = matched.find(x => x.mine.key === cand.key);
            if (hit) { anchor = hit; break; }
        }
        const place = anchor
            ? { afterId: String(anchor.next.script.id || ''), afterName: normalizeName(anchor.next.name), afterFind: normalizeText(anchor.next.findRegex).slice(0, 200), afterIndex: anchor.next.index }
            : { afterId: '', afterName: '', afterFind: '', afterIndex: null };
        const hasOwnPlace = !!anchor;
        items.push({
            key: 'mine:' + m.key, kind: 'mineOnly', status: STATUS.ONLY_MINE,
            mine: m, next: null, base: baseIdx ? baseOf(m) : null,
            how: hasOwnPlace ? ('位置跟着「' + regexLabel(anchor.next.script) + '」后面') : '你这份里它前面那条作者新版里没有',
            conf: hasOwnPlace ? 90 : 0,
            place, placePending: !hasOwnPlace,
            nameChanged: false, disabledDiff: false, bodyChanged: false, renamed: false,
            label: regexLabel(m.script),
            safety: null, mineSafety: safetyOf(m.script),
        });
    }
    for (const n of onlyNext) {
        items.push({
            key: 'next:' + n.key, kind: 'nextOnly', status: STATUS.ONLY_NEXT,
            mine: null, next: n, base: null,
            how: '新版新增', conf: 100,
            place: regexPlaceOf(n, nextIdx.entries, n.index), placePending: false,
            nameChanged: false, disabledDiff: false, bodyChanged: false, renamed: false,
            label: regexLabel(n.script),
            safety: safetyOf(n.script), mineSafety: null,
        });
    }
    if (onlyMine.length) notice.push('有 ' + onlyMine.length + ' 条正则只有我有（新版没有）——**默认一条都不删**，要删得你自己点');
    if (onlyNext.length) notice.push('有 ' + onlyNext.length + ' 条正则是新版新增的');
    const pend = items.filter(i => i.placePending).length;
    if (pend) notice.push('有 ' + pend + ' 条正则在你这份里找不到该插在哪 → 先放在最后，标了「位置待定」');
    // ★安全（评审 ③）：危险/可疑的正则必须**在界面上先说出来**（正则能改模型读到的和发出的文本）
    const unsafe = items.filter(i => ((i.safety && i.safety.risk !== 'ok') || (i.mineSafety && i.mineSafety.risk !== 'ok')));
    if (unsafe.length) {
        notice.push('⚠ 有 ' + unsafe.length + ' 条正则的安全性要看一下（' + unsafe.slice(0, 3).map(i => i.label).join('、')
            + (unsafe.length > 3 ? '…' : '') + '）：标红的默认**不会缝进去**');
    }
    const stats = {
        total: items.length,
        same: items.filter(i => i.status === STATUS.SAME && !i.disabledDiff).length,
        onlyMine: onlyMine.length,
        onlyNext: onlyNext.length,
        changed: items.filter(i => i.bodyChanged).length,
        renamed: items.filter(i => i.renamed).length,
        disabledDiff: items.filter(i => i.disabledDiff).length,
        needDecide: items.filter(i => regexNeedsChoice(i)).length,
        placePending: pend,
        unsafe: items.filter(i => i.safety && i.safety.risk === 'danger').length,
        unsafeWarn: items.filter(i => (i.safety && i.safety.risk === 'warn') || (i.mineSafety && i.mineSafety.risk !== 'ok')).length,
    };
    return { items, stats, notice, mineIdx, nextIdx, baseIdx };
}

/** 三方归类（只有正则用；跟 `classifyPair` 同一口径：谁改了 → 该听谁） */
function classifyRegexPair(mineScript, nextScript, baseScript) {
    const b = regexBodySig(baseScript);
    const m = regexBodySig(mineScript);
    const n = regexBodySig(nextScript);
    if (m === n) return STATUS.SAME;
    if (m === b && n !== b) return STATUS.AUTHOR_ONLY_CHANGED;   // 你没动、作者动了 → 跟新版
    if (n === b && m !== b) return STATUS.MINE_ONLY_CHANGED;     // 作者没动、你动了 → 保你的
    return STATUS.BOTH_CHANGED;                                  // 都动了 → 要选
}

/** 这条正则要用户拍板吗？（口径跟条目 `needsChoice` 一致：只有"完全一样"才不用看）
 *  "位置待定"的那几条也一并算"要你看"——不然用户根本不知道它被挪到最后了。 */
export function regexNeedsChoice(item) {
    if (!item) return false;
    if (item.status === STATUS.SAME) return !!item.disabledDiff;   // 内容一样但开关不同 → 要选开关
    return true;
}

/** 未经用户选择时的兜底（★作者口径 P2-4："默认**不覆盖**用户已有的"）
 *  · 两边不一样、又说不清谁改的 → **保你的**（mine），绝不默认拿新版盖掉你的
 *  · 只有新版有 → 加进来（不覆盖任何东西）
 *  · 作者改过、你没动它（三方能确认）→ 跟新版（这才是"更新"该有的样子）
 *  · 只有我有 → 保你的（要删得用户自己点） */
export function fallbackRegexDecision(item) {
    if (!item) return { use: 'next', enabled: 'next' };
    // ★危险正则（ReDoS 形状 / 试跑超时）→ **默认不选它**（安全评审 ③）
    if (item.safety && item.safety.risk === 'danger') return { use: 'mine', enabled: 'mine' };
    switch (item.status) {
        case STATUS.ONLY_NEXT: return { use: 'next', enabled: 'next' };
        case STATUS.AUTHOR_ONLY_CHANGED: return { use: 'next', enabled: 'next' };
        case STATUS.RENAMED: return { use: 'next', enabled: 'next' };
        // ★跟条目那边**有意不同**的一处：条目"只有开关不同"的兜底是"跟新版"，
        //   正则这里给"跟你的" —— 正则开关会直接改变模型读到/发出的文本（高权限），
        //   作者把它打开而你把它是关的，静默跟新版 = 悄悄改了你的输入输出（台账 P2-6 的安全口径）。
        case STATUS.SAME: return { use: 'next', enabled: item.disabledDiff ? 'mine' : 'next' };
        default: return { use: 'mine', enabled: 'mine' };
    }
}

/** 「全部按推荐」用（用户主动点的，才给推荐值；推荐里"你改过/说不清"的一律先保你的） */
export function recommendRegexDecision(item) {
    return fallbackRegexDecision(item);
}

/** 这条正则算处理完了吗？（跟条目 `itemDecided` 同一套判定，界面直接复用）
 *  ★★W99-甲（作者原话："正则也是改了名字/改了开关/改了具体内容，在里边都要显示体现出来" + "要选完所有的"）：
 *   名字 / 开关 / 内容三个维度与条目侧**逐条同源**（`itemDecided` 那三段注释是主版本）：
 *    · 只改了名字（`renamed`，正文一字未动）→ **选过名字就算完**（内容两边一样，没有第二个维度；
 *      内核合成时 `use` 缺省 = 兜底值，正文本来就一样 ⇒ 只由 `d.name` 决定最终名字）；
 *    · 名字 + 内容都改了 → `use` 和 `name` **都要有**；
 *    · 开关两边不同（`disabledDiff`）→ 还要 `enabled`（'mine'/'next'；顺序页那类布尔覆盖值也照收）。 */
export function regexItemDecided(item, d) {
    if (!item || !regexNeedsChoice(item)) return true;
    if (!d) return false;
    const switchOnly = item.status === STATUS.SAME && !!item.disabledDiff;
    if (switchOnly) return d.enabled !== undefined && d.enabled !== null;
    const nameChosen = (d.name === 'mine' || d.name === 'next');
    if (item.renamed) return nameChosen;
    if (!d.use) return false;
    if (item.nameChanged && !nameChosen) return false;
    if (item.disabledDiff && item.mine && item.next
        && d.enabled !== 'mine' && d.enabled !== 'next' && typeof d.enabled !== 'boolean') return false;
    return true;
}

/** 还剩几条正则没选 */
export function pendingRegexCount(items, decisions = {}) {
    let n = 0;
    for (const it of (Array.isArray(items) ? items : [])) {
        if (!regexNeedsChoice(it)) continue;
        if (regexItemDecided(it, decisions[it.key])) continue;
        n++;
    }
    return n;
}

/** 给「全部按推荐」按钮：一次算出所有决策 */
export function allRegexDecisions(items) {
    const out = {};
    for (const it of (Array.isArray(items) ? items : [])) out[it.key] = recommendRegexDecision(it);
    return out;
}

/** 「两条都留」时那条**旧版副本**（新 id + 名字加（旧版），免得 ST 里两条同 id 打架） */
export function regexOldCopy(script, taken) {
    const s = normalizeRegexScript(script);
    const name = regexLabel(s).trim() || '正则';
    const base = String(s.id || 'regex');
    let id = base + '__ywpu_old';
    if (taken && typeof taken.add === 'function') {
        let n = 2;
        while (taken.has(id)) { id = base + '__ywpu_old' + n; n++; }
        taken.add(id);
    } else {
        id = base + '__ywpu_old';
    }
    return { ...s, id, scriptName: name + '（旧版）' };
}

/**
 * 正则清单的合成（台账 P2 全部要点的落点）。
 * @param {{mine?:object, next?:object, base?:object|Array, items?:Array, decisions?:object}} p
 *   decisions[item.key] = { use:'next'|'mine'|'both', enabled:'next'|'mine' }
 *     · use='mine'  = 保你的那一条（**默认就是不覆盖你**）
 *     · use='next'  = 用作者的（你选过了才会发生）
 *     · use='both'  = 两条都留（新版一条 + 你的另存成「…（旧版）」紧跟其后）
 *     · enabled     = 只对"内容一样、开关不同"用：'mine' 跟着你 / 'next' 跟着作者
 * @returns {{list:Array, report:object}}
 *   list  = **顺序即执行顺序**：新版顺序当骨架 → 只有我有的按锚点插 → 锚点找不到的放最后（位置待定）
 */
export function mergeRegexes({ mine, next, base = null, items = null, decisions = {} } = {}) {
    const an = Array.isArray(items) ? { items, stats: null, notice: [] } : analyzeRegexes({ mine, next, base });
    const list = Array.isArray(an.items) ? an.items : [];
    const report = {
        added: [], replaced: [], keptMine: [], bothKept: [], removed: [], pendingRemove: [],
        disabledTaken: [], disabledKept: [], conflicts: [], placePending: [], safety: [], safetySkipped: [], warnings: [],
        summary: { same: 0, add: 0, update: 0, keep: 0, both: 0, remove: 0, switch: 0, pending: 0, skippedUnsafe: 0 },
    };
    const decOf = (it) => {
        const d = decisions ? decisions[it.key] : null;
        if (d && (d.use || d.enabled !== undefined)) return d;
        return fallbackRegexDecision(it);
    };
    const taken = new Set();
    for (const r of getRegexList(mine)) taken.add(String(normalizeRegexScript(r).id || ''));
    for (const r of getRegexList(next)) taken.add(String(normalizeRegexScript(r).id || ''));
    const out = [];
    /* ① 走新版顺序：这一趟定下结果骨架
       ★2026-09-25 修（台账 §GJ 场景 A/B 实测复现）：「按新版顺序」必须**真的按 `next.index` 排** ——
         `analyzeRegexes` 的 items 是「匹配对…」+「只有我有…」+「**新版新增**…」三段拼起来的，
         直接遍历会把**作者在中间新增的正则整批排到末尾**（实测：我的 r1/r2/r5 + 作者中间新增两条
         → 那两条落到了 r5 后面，正则在 ST 里**顺序即执行顺序**，这不是小事）。
         条目那套没这个毛病（骨架就是新版那份的 prompt_order 原样）；这里排完序即"骨架=新版顺序"。 */
    const ordered = list.slice().sort((a, b) =>
        (a.next ? a.next.index : Number.MAX_SAFE_INTEGER) - (b.next ? b.next.index : Number.MAX_SAFE_INTEGER));
    for (const it of ordered) {
        if (!it.next) continue;
        const n = normalizeRegexScript(it.next.script);
        const m = it.mine ? normalizeRegexScript(it.mine.script) : null;
        const d = decOf(it);
        const danger = !!(it.safety && it.safety.risk === 'danger');
        const userSaidNext = !!(decisions && decisions[it.key] && decisions[it.key].use === 'next');
        const userSaidBoth = !!(decisions && decisions[it.key] && decisions[it.key].use === 'both');
        if (danger) report.safety.push({ key: it.key, name: it.label, risk: it.safety.risk, reasons: it.safety.reasons, ms: it.safety.ms });
        if (!m) {                                                        // 新版新增
            if (danger && !userSaidNext && !userSaidBoth) {              // ★安全（评审 ③）：危险的**默认不缝**
                report.safetySkipped.push(it.label);
                report.summary.skippedUnsafe++;
                continue;
            }
            out.push({ ...n });
            report.added.push(it.label);
            report.summary.add++;
            continue;
        }
        if (it.status === STATUS.SAME && !it.disabledDiff) { out.push({ ...n }); report.summary.same++; continue; }
        const useMine = (d.use === 'mine');
        let mainIdx = -1;                                               // ★W99-甲：刚推进去的那条"主结果"（名字那一维改它）
        if (useMine) {
            out.push({ ...m });                                          // ★默认不覆盖你已有的
            mainIdx = out.length - 1;
            report.keptMine.push(it.label);
            report.summary.keep++;
        } else {
            const copy = { ...n };
            if (it.disabledDiff && d.enabled === 'mine') copy.disabled = m.disabled;   // 开关选边（跟着你）
            out.push(copy);
            mainIdx = out.length - 1;
            if (it.disabledDiff && d.enabled === 'mine') report.disabledKept.push(it.label);
            else if (it.disabledDiff) report.disabledTaken.push(it.label);
            if (it.bodyChanged) report.replaced.push(it.label);
            report.summary.update++;
            if (it.bodyChanged && it.base && regexBodySig(it.base.script) !== regexBodySig(m)) {
                report.conflicts.push({ key: it.key, name: it.label, how: it.how, conf: it.conf, kind: 'regex', 你的: m, 官方旧文: it.base.script, 官方新文: n });
            }
        }
        /* ★★W99-甲：**正则的名字那一维**（与内容/开关并列，作者要的"统一"）——
           `d.name === 'mine'|'next'` 时覆盖主结果的 `scriptName`（只动名字，id / 正文 / 开关全不动）。
           没选 ⇒ 一个字不动（老行为：名字跟着 `use` 那一版走）。 */
        if (mainIdx >= 0 && it.nameChanged && (d.name === 'mine' || d.name === 'next')) {
            const nm = String((d.name === 'mine' ? (m && m.scriptName) : (n && n.scriptName)) ?? '');
            if (nm) out[mainIdx] = { ...out[mainIdx], scriptName: nm };
        }
        if (d.use === 'both') {                                           // 两条都留
            const cp = regexOldCopy(m, taken);
            /* ★2026-09-24 复核（作者第二十四批："两条都留…应该在中间的相对应位置"）：
               这一处**本来就是"相对位置"** —— ① 是按新版顺序走的，轮到这一条时 `out` 末尾就是它自己那份，
               紧跟其后 push 的副本自然落在"新版那条的后面"（复现脚本 `e2e/regex-order-scenes.js` 场景 L 实测：
               r1 / 新版 / 我的（旧版）/ r3）。条目侧（`buildMerged` ①.7）与这里等价。
               ⇒ **若真界面里看到它掉到末尾，问题不在这条路**（要按"先复现再改"查 UI/写盘那一段）。 */
            out.push(cp);
            report.bothKept.push(it.label + '（你的版本另存为「' + cp.scriptName + '」）');
            report.summary.both++;
        }
    }
    // ② 只有我有的：按锚点插进去；找不到锚点 → 放最后 + 标"位置待定"（**默认一条都不删**）
    const tailObj = new Map();      // 锚点 key → 同一锚点上最后插入的那个对象（同一锚点多条时挂它后面，不逆序）
    for (const it of list) {
        if (it.next || !it.mine) continue;
        const d = decOf(it);
        if (d.use !== 'mine') {                                          // 只有你明确说"不要"才删
            report.removed.push(it.label);
            report.summary.remove++;
            continue;
        }
        const ent = { ...normalizeRegexScript(it.mine.script) };
        const cur = indexRegexScripts(out);
        const r = resolveRegexAnchor(it.place || {}, cur.entries);
        let at = -1;
        if (r.afterKey != null) {
            const prevObj = tailObj.get(r.afterKey);
            if (prevObj) at = out.indexOf(prevObj);
            if (at < 0) at = cur.entries.findIndex(e => e.key === r.afterKey);
        }
        if (at >= 0) {
            out.splice(at + 1, 0, ent);
            if (r.afterKey != null) tailObj.set(r.afterKey, ent);
        } else {
            out.push(ent);                                               // 锚点找不到 → 放最后
            report.placePending.push(it.label);
        }
        report.pendingRemove.push(it.label);      // 界面上仍标"要不要删"（台账 P3-3：删除要待处理、默认不动）
        report.summary.pending++;
    }
    if (report.placePending.length) {
        report.warnings.push('有 ' + report.placePending.length + ' 条正则找不到该插在哪 → 已放在最后并标「位置待定」：' + report.placePending.slice(0, 6).join('、') + (report.placePending.length > 6 ? '…' : ''));
    }
    if (report.pendingRemove.length) {
        report.warnings.push('有 ' + report.pendingRemove.length + ' 条正则只有我有 → **一条都没删**（要删得你自己点）');
    }
    if (report.keptMine.length) {
        report.warnings.push('有 ' + report.keptMine.length + ' 条正则两边不一样 → 默认保留了你的版本（要作者的自己去对比页逐条挑）');
    }
    if (report.removed.length) report.warnings.push('按你的选择删掉了 ' + report.removed.length + ' 条正则：' + report.removed.slice(0, 6).join('、'));
    if (report.safetySkipped.length) {
        report.warnings.push('⚠ 有 ' + report.safetySkipped.length + ' 条新版正则**安全性不过关**（试跑慢/形状危险）→ **默认没缝进去**：'
            + report.safetySkipped.slice(0, 5).join('、') + (report.safetySkipped.length > 5 ? '…' : '') + '（你要的话在界面上明确点它）');
    }
    if (report.safety.length) {
        report.warnings.push('⚠ 有 ' + report.safety.length + ' 条要缝的正则被标了安全提示：'
            + report.safety.slice(0, 3).map(x => x.name + '（' + (x.reasons[0] || '') + '）').join('；'));
    }
    return { list: out, report };
}

/**
 * 写包用：把"两份预设的正则差异"翻成 `ywp-patch` 的 op 列表（+ 一份顺序表）。
 * op 类型（写清楚，读方也认这几个）：
 *   · `regex-add`    { reg, place }                        —— 新版新增的整条
 *   · `regex-update` { name, wasName, base, next, place }   —— 改过 / 只是改名的
 *   · `regex-remove` { name, base }                         —— 新版删掉的（**默认不删用户的**，见 applyPatch）
 *   · `regex-switch` { name, base, enabled }                —— 只有开/关不同
 * ★`order`：作者那份**正则的完整顺序**（身份的 id，没有 id 时用名字）——
 *   顺序会影响执行结果，不带上就没法保证"缝完 = 作者那份的顺序"。
 * @returns {{ops:Array, order:Array<string>, counts:object}}
 */
export function regexPackOps({ mine, next } = {}) {
    const an = analyzeRegexes({ mine, next });
    const nextIdx = an.nextIdx;
    const ops = [];
    const counts = { add: 0, update: 0, remove: 0, switch: 0, rename: 0 };
    for (const it of an.items) {
        if (it.kind === 'nextOnly') {
            ops.push({ op: 'regex-add', name: it.next.name, reg: { ...it.next.script }, place: regexPlaceOf(it.next, nextIdx.entries, it.next.index) });
            counts.add++;
            continue;
        }
        if (it.kind === 'mineOnly') {
            ops.push({ op: 'regex-remove', name: it.mine.name, base: { ...it.mine.script } });
            counts.remove++;
            continue;
        }
        if (it.status === STATUS.SAME && !it.disabledDiff) continue;       // 一样的不进包
        const place = regexPlaceOf(it.next, nextIdx.entries, it.next.index);
        if (it.status === STATUS.SAME && it.disabledDiff) {
            ops.push({ op: 'regex-switch', name: it.next.name, wasName: it.mine.name, base: { ...it.mine.script }, enabled: it.next.script.disabled !== true, place });
            counts.switch++;
            continue;
        }
        ops.push({
            op: 'regex-update', name: it.next.name, wasName: it.mine.name,
            base: { ...it.mine.script }, next: { ...it.next.script },
            rename: it.renamed === true, place,
        });
        counts.update++;
        if (it.renamed) counts.rename++;
    }
    const order = nextIdx.entries.map(e => e.idKey || e.key);
    return { ops, order, counts };
}

/**
 * 应用正则 op（`applyPatch` 用它）。
 * 语义（★跟条目 op 完全一致）：
 *   · locate：id → 名字（同名多条用正文相似度挑）→ findRegex 正文
 *   · **默认 `use='next'`**：这一层的活儿是"把包应用成一份新版 B"（跟条目 op 一样），
 *     好让**对比页能看见**"作者把这条改了/删了"；真正会不会覆盖掉你的，由**生成那一步**
 *     `mergeRegexes()` 的"默认保你的"决定（两段式，跟条目一模一样）。
 *   · 撞上"你已经有一条很像的" → 记进 report.conflicts（**不静默**）
 *   · `regex-add` 撞上"你这份里**已经有一模一样的一条**"（除 id 外 12 个字段全同）
 *     → **跳过、不加第二份**（记 `summary.dupSkip` + warnings，不静默）；
 *     台账 §GH ⒟：没有这一道闸时"同一个正则包连缝两遍"会 34→68→102（`findSameRegex` 同一判据）。
 *   · `regex-remove` 也照应用（B 里没有它 → 对比页会把它列成"只有我有（新版没有）→ 待处理"），
 *     但**要不要真删你那份**由用户在对比页点（台账 P3-3）。
 * @returns {{list:Array, report:object}}
 */
export function applyRegexOps({ list, ops, decisions = {}, defaultUse = 'next' } = {}) {
    const out = (Array.isArray(list) ? list : []).map(r => ({ ...normalizeRegexScript(r) }));
    const report = { ops: [], lowConf: [], conflicts: [], unresolved: [], pendingRemove: [], removed: [], warnings: [], summary: { add: 0, update: 0, switch: 0, remove: 0, kept: 0, custom: 0, dupSkip: 0 } };
    /* ★"你已经有这一条了"的判据（台账 §GH ⒟ / 诊断报告 §4.2）：**开跑前**那份清单的内容指纹（除 id）。
       为什么是"开跑前"、而不是"边跑边记"：包**自己**列了两条一模一样的，那是包的事 —— 照搬（忠实）；
       我们只拦"把**你本来就有**的那条再加一份"——那正是"同一个正则包连缝两遍 = 34→68→102"的 BUG。 */
    const preSigs = new Set(out.map(r => regexFullSig(r, { withId: false })));
    /* ★同一锚点连插多条不许逆序（2026-09-25 · 台账 §GJ 场景 G/G2 实测复现）：
       条目侧一直有这道闸（`applyPatch` 里的 `tailAfter`："同一锚点再来一条 → 排它后面（包内顺序）"），
       正则侧漏了 ⇒ 两条 op 锚在同一条上时，第二条会插到第一条**前面**（实测 [gn2, gn1] 逆序，真身数据也可能撞上：
       锚点那条正则用户删过 / 商店只挑了子集 → 两条新增都落到位次兜底）。 */
    const tailAfter = new Map();          // 锚点 key → 这一锚点上"最后一条已插入"的对象
    const idxOf = () => indexRegexScripts(out);
    const useOf = (op, i) => {
        const d = (decisions && op && op.key !== undefined && decisions[op.key] !== undefined) ? decisions[op.key] : (decisions ? decisions[i] : undefined);
        if (typeof d === 'string') return { use: d === 'next' ? 'next' : 'mine' };
        if (d && typeof d === 'object') return { use: d.use === 'next' ? 'next' : (d.use === 'mine' ? 'mine' : (d.use === 'both' ? 'both' : defaultUse)) };
        return { use: defaultUse };
    };
    /** 定位那一条要改的正则：id → 名字（多条挑最像）→ findRegex */
    const locate = (op) => {
        const idx = idxOf();
        const wantNames = [op.name, op.wasName].map(normalizeName).filter(Boolean);
        for (const nm of wantNames) {
            const hits = idx.byName.get(nm) || [];
            if (hits.length === 1) return { entry: hits[0], how: '名字："' + hits[0].name + '"', conf: 90 };
            if (hits.length > 1) {
                const b = normalizeText(op.base && op.base.findRegex || '');
                let best = hits[0], bs = -1;
                for (const e of hits) { const s = b ? similarity(e.findKey, b) : 0; if (s > bs) { bs = s; best = e; } }
                return { entry: best, how: '同名 ' + hits.length + ' 条里挑最像的（' + bs.toFixed(2) + '）', conf: 70 };
            }
        }
        const bf = normalizeText(op.base && op.base.findRegex || '');
        if (bf) {
            const hits = idx.byFind.get(bf) || [];
            if (hits.length) return { entry: hits[0], how: '按 findRegex 正文定位', conf: 50 };
        }
        return null;
    };
    const opsList = Array.isArray(ops) ? ops : [];
    for (let i = 0; i < opsList.length; i++) {
        const op = (opsList[i] && typeof opsList[i] === 'object') ? opsList[i] : {};
        const key = String(op.key || (String(op.op || '?') + '@' + i));
        const d = useOf(op, i);
        const rec = { key, op: String(op.op || ''), name: String(op.name || ''), use: d.use, how: '', conf: null, action: 'applied' };
        try {
            if (op.op === 'regex-add') {
                const reg = normalizeRegexScript(op.reg || {});
                if (preSigs.has(regexFullSig(reg, { withId: false }))) {
                    /* 同一条已经在你的清单里（只差编号 / 编号相同都算）⇒ **不再加第二份**。
                       条目那条路是"同名 → 改成 update 让你挑"（`preset-updater.js:7386`）；
                       正则这边**一字不差**就没什么可挑的 ⇒ 跳过 + 在 report 里明说（不静默）。 */
                    rec.action = 'skipped';
                    rec.how = '你这份里已有一模一样的一条（只差编号）→ 跳过';
                    rec.conf = 100;
                    report.summary.dupSkip++;
                    report.warnings.push('「' + (rec.name || regexLabel(reg)) + '」你这份里已经有一模一样的一条（只差编号）→ **没有再缝一份**');
                } else {
                    const idx = idxOf();
                    const r = resolveRegexAnchor(op.place || {}, idx.entries);
                    rec.how = r.how; rec.conf = r.conf;
                    const tip = (r.afterKey == null) ? null : tailAfter.get(r.afterKey);
                    let at = tip ? out.indexOf(tip) : -1;
                    if (at < 0 && r.afterKey != null) at = idx.entries.findIndex(e => e.key === r.afterKey);
                    if (at >= 0) {
                        out.splice(at + 1, 0, reg);
                        if (r.afterKey != null) tailAfter.set(r.afterKey, reg);      // 同一锚点再来一条 → 排它后面（包内顺序）
                    } else { out.push(reg); report.warnings.push('「' + rec.name + '」没找到邻居 → 先放最后（你可以拖）'); }
                    report.summary.add++;
                }
            } else if (op.op === 'regex-update') {
                const loc = locate(op);
                if (!loc) { rec.action = 'unresolved'; report.unresolved.push({ key, op: 'regex-update', name: rec.name, why: '你这份正则里没找到这条（改过名字 / 删掉过？）' }); }
                else {
                    rec.how = loc.how; rec.conf = loc.conf;
                    const at = out.findIndex(x => String(x.id || '') === String(loc.entry.script.id || '') && regexFullSig(x) === regexFullSig(loc.entry.script));
                    const pos = at >= 0 ? at : out.findIndex(x => normalizeName(x.scriptName) === normalizeName(loc.entry.name) && regexBodySig(x) === regexBodySig(loc.entry.script));
                    const nextScript = normalizeRegexScript(op.next || op.reg || {});
                    const cur = pos >= 0 ? out[pos] : null;
                    if (cur && regexBodySig(cur) !== regexBodySig(loc.entry.script)) {
                        report.conflicts.push({ key, op: 'regex-update', name: rec.name, 你的: { ...cur }, 官方旧文: op.base || null, 官方新文: nextScript, kind: 'regex' });
                    }
                    if (d.use === 'mine' || d.use === 'both') {
                        report.summary.kept++;
                        rec.action = 'skipped';
                    } else if (pos >= 0) {
                        out[pos] = nextScript;
                        report.summary.update++;
                    } else { rec.action = 'unresolved'; report.unresolved.push({ key, op: 'regex-update', name: rec.name, why: '定位到了但读不到那一条 → 没改' }); }
                }
            } else if (op.op === 'regex-switch') {
                const loc = locate(op);
                if (!loc) { rec.action = 'unresolved'; report.unresolved.push({ key, op: 'regex-switch', name: rec.name, why: '你这份正则里没找到这条' }); }
                else {
                    rec.how = loc.how; rec.conf = loc.conf;
                    const pos = out.findIndex(x => String(x.id || '') === String(loc.entry.script.id || ''));
                    if (d.use === 'mine') { report.summary.kept++; rec.action = 'skipped'; }
                    else if (pos >= 0) { out[pos].disabled = op.enabled === false; report.summary.switch++; }
                    else { rec.action = 'unresolved'; report.unresolved.push({ key, op: 'regex-switch', name: rec.name, why: '定位到了但读不到那一条 → 开关没改' }); }
                }
            } else if (op.op === 'regex-remove') {
                const loc = locate(op);
                if (!loc) { rec.action = 'unresolved'; report.unresolved.push({ key, op: 'regex-remove', name: rec.name, why: '你这份正则里没找到这条（已经删过？）' }); }
                else if (d.use !== 'next') {
                    report.pendingRemove.push({ key, name: rec.name, why: '作者新版删掉了这条 → **默认不替你删**，要删得你自己点' });
                    report.summary.kept++;
                    rec.action = 'pending';
                } else {
                    const want = regexFullSig(loc.entry.script);
                    const pos = out.findIndex(x => regexFullSig(x) === want);
                    if (pos >= 0) out.splice(pos, 1);
                    report.removed.push({ key, name: rec.name });
                    report.summary.remove++;
                }
            } else {
                rec.action = 'unknown';
                report.warnings.push('不认识的正则 op：「' + String(op.op) + '」（只认 regex-add / regex-update / regex-remove / regex-switch）');
            }
        } catch (e) {
            rec.action = 'error';
            report.warnings.push('这条正则没能应用（' + key + '）：' + ((e && e.message) || e));
        }
        if (rec.conf !== null && rec.conf < 85) report.lowConf.push({ key, op: rec.op, name: rec.name, conf: rec.conf, how: rec.how });
        report.ops.push(rec);
    }
    return { list: out, report };
}

/**
 * 按作者那份的**顺序**排一遍（顺序影响执行结果，所以顺序也是"缝"的一部分）。
 * 语义：给出顺序的那些按它排；**没给出的（你自己加的）保持原来的相对位置接在后面**。
 * @param {Array} list 当前清单
 * @param {Array<string>} want 作者那份的顺序（身份：id，没有 id 时给 key/名字）
 */
export function applyRegexOrder(list, want) {
    const src = (Array.isArray(list) ? list : []).map(r => ({ ...normalizeRegexScript(r) }));
    const w = Array.isArray(want) ? want.map(String) : [];
    if (!w.length) return src;
    const idx = indexRegexScripts(src);
    const used = new Set();
    const picked = [];
    for (const ident of w) {
        const e = idx.entries.find(x => !used.has(x.key) && (x.idKey === ident || x.key === ident || normalizeName(x.name) === normalizeName(ident)));
        if (!e) continue;
        used.add(e.key);
        picked.push(src[e.index]);
    }
    const rest = idx.entries.filter(e => !used.has(e.key)).map(e => src[e.index]);
    return [...picked, ...rest];
}

/**
 * 用"用户手上的正则清单 + 包里的 op"拼出**作者的旧版清单**（= 三方对比的基准）。
 * 为什么要它：包里每条 regex op 都带 `base`（作者旧版那一条），把没被 op 碰到的按用户的清单照抄，
 * 就得到一份"作者以为你手上是什么样"的祖先清单 → `analyzeRegexes({mine,next,base})` 才能
 * 分清"作者改的"（→ 默认跟作者）和"你改的"（→ 默认保你的）。
 * @param {Array} mineList 用户手上的正则清单
 * @param {Array} ops       包里的 regexOps
 */
export function regexBaseFromOps(mineList, ops) {
    const mine = (Array.isArray(mineList) ? mineList : []).map(r => ({ ...normalizeRegexScript(r) }));
    const idx = indexRegexScripts(mine);
    const touched = new Set();
    const list = ops && Array.isArray(ops) ? ops : [];
    const pairs = [];
    for (const op of list) {
        if (!op || !op.base) continue;
        const b = normalizeRegexScript(op.base);
        let hit = (b.id && idx.byId.get(String(b.id))) || null;
        if (!hit && b.scriptName) hit = (idx.byName.get(normalizeName(b.scriptName)) || [])[0] || null;
        if (!hit && b.findRegex) hit = (idx.byFind.get(normalizeText(b.findRegex)) || [])[0] || null;
        if (hit) { touched.add(hit.key); pairs.push([hit.key, b]); }
    }
    const out = [];
    const done = new Set();
    for (const e of idx.entries) {
        const p = pairs.find(([k]) => k === e.key);
        if (p && !done.has(e.key)) { done.add(e.key); out.push(p[1]); continue; }
        if (touched.has(e.key)) { out.push(e.script); continue; }     // 定位不到的：退回用户那份
        out.push(e.script);
    }
    return out;
}

/**
 * ★安全预检（安全评审 ③ · 台账 P2-6）：**缝进来之前**先看这条正则会不会把酒馆卡死。
 *
 * 为什么必须做：ST 执行正则走 `scripts/extensions/regex/engine.js:411/419`
 * （`RegexProvider.get(findRegex)` → `rawString.replace(findRegex, …)`），
 * **全文没有 try/catch、没有超时、没有 Worker** ⇒ 一条 `(a+)+$` 之类会让用户**每条消息都卡死标签页**，
 * 而且用户根本不知道是哪条干的。所以缝入侧必须自己先量。
 *
 * 三层判据（纯内核、可在 Node 里跑）：
 *   ① 语法：`new RegExp(...)` 编不过 → broken（ST 那边会**静默不生效**，等于白缝了一条）
 *   ② 长度：findRegex 超过 `maxLen`（默认 2000 字符）→ warn（变态长的正则基本是误粘）
 *   ③ 形状：嵌套量词 / 量词里套量词 / 相邻的通配重复（回溯爆炸的经典形状）→ warn
 *   ④ 试跑计时：拿**短样本**（含"全是重复字符"的对抗样本）真跑一次，超 `budgetMs` → danger
 *      ★样本长度必须短（默认 ≤ 24 字符）：回溯是**指数级**的，样本够短时再坏的正则也在毫秒级跑完，
 *        这样"量一次"本身不会把调用方（或用户的标签页）挂住。这是**取舍**，不是精确判定。
 * @param {object} script 一条正则（原样，不用先 normalize）
 * @param {{budgetMs?:number, maxLen?:number, sampleLen?:number}} [opts]
 * @returns {{risk:'ok'|'warn'|'danger', reasons:string[], ms:number, len:number, broken:boolean}}
 */
export function regexSafetyCheck(script, opts = {}) {
    const budgetMs = Number.isFinite(opts.budgetMs) ? opts.budgetMs : 50;
    const maxLen = Number.isFinite(opts.maxLen) ? opts.maxLen : 2000;
    const sampleLen = Math.max(4, Math.min(64, Number.isFinite(opts.sampleLen) ? opts.sampleLen : 24));
    const s = normalizeRegexScript(script);
    // ★全局缓存：试跑是**要花 300ms 量坏正则**的，而 analyzeRegexes 在每次拖动里都会跑一遍
    //   （界面上的顺序预览）→ 不缓存就会把界面拖卡。同一条正则（整条指纹）只量一次。
    //  同一条正则（**只按"真正决定执行代价"的东西**做键：findRegex + substituteRegex，不含 id/名字）只量一次。
    const cacheKey = JSON.stringify([s.findRegex, s.substituteRegex, budgetMs, maxLen, sampleLen]);
    if (SAFETY_CACHE.has(cacheKey)) return SAFETY_CACHE.get(cacheKey);
    const reasons = [];
    let risk = 'ok';
    const up = (lv, why) => { if (lv === 'danger' || (lv === 'warn' && risk === 'ok')) risk = lv; reasons.push(why); };
    const src = s.findRegex;
    // ① 能不能编
    let re = null;
    try { re = src ? regexFromStringLoose(src) : null; } catch (e) { up('danger', '这条正则**编译不过**（ST 里会静默不生效）：' + ((e && e.message) || e)); }
    if (src && !re && !reasons.length) up('warn', '这条正则没能编译（形状太怪？）→ ST 里同样不会生效');
    // ② 长度
    if (src.length > maxLen) up('warn', 'findRegex 有 ' + src.length + ' 个字符（超过 ' + maxLen + '）—— 大概率是误粘，建议核对');
    // ③ 形状（只看"分隔符里的 pattern"，尽量不误伤）
    const body = regexPatternBody(src);
    const shapes = [
        [/\([^()]*[+*]\)[+*{]/, '量词套量词（(...)+ 外面又是 +/*/{n}）——回溯爆炸的经典形状'],
        [/\([^()]*\|[^()]*\)[+*]/, '分支组外面接量词（(a|b)+/(a|ab)*）——可能指数回溯'],
        [/(\.[+*]|\[\^?[^\]]*\][+*])\s*(\.[+*]|\[\^?[^\]]*\][+*])/, '两个"任意字符重复"挨着（.*.* / [\s\S]*[\s\S]*）'],
        [/\{[0-9]{3,}(,[0-9]*)?\}/, '超大重复次数（{1000,} 之类）'],
        [/\\[1-9]/, '用了反向引用（\\1）——回溯代价高'],
    ];
    for (const [rx, why] of shapes) {
        if (rx.test(body)) { up('warn', '形状可疑：' + why); break; }
    }
    // ④ 短样本试跑计时（对抗样本：全同字符 / 交替字符 / 空）
    let ms = 0;
    if (re && typeof re.test === 'function') {
        const alpha = 'a';
        const samples = [
            '', 'a', 'aa', alpha.repeat(sampleLen), alpha.repeat(sampleLen) + '!',
            ('ab').repeat(Math.ceil(sampleLen / 2)), ('a ').repeat(Math.ceil(sampleLen / 2)),
        ];
        const t0 = Date.now();
        try {
            for (const t of samples) {
                if (typeof re.test === 'function') re.test(t);
                if (typeof re.exec === 'function') { re.lastIndex = 0; re.exec(t); }
                String(t).replace(re, '');
            }
        } catch (e) { up('warn', '试跑时出错：' + ((e && e.message) || e)); }
        ms = Date.now() - t0;
        if (ms > budgetMs) up('danger', '拿 ' + sampleLen + ' 个字符的小样本试跑就花了 ' + ms + 'ms（阈值 ' + budgetMs + 'ms）→ 真跑起来会**每条消息都卡住**，默认不缝它');
        else if (ms > budgetMs / 4) up('warn', '小样本试跑 ' + ms + 'ms（阈值 ' + budgetMs + 'ms）—— 有点慢，注意');
    }
    const res = { risk, reasons, ms, len: src.length, broken: !!src && !re };
    SAFETY_CACHE.set(cacheKey, res);
    return res;
}

/** 安全检查的全局缓存（键 = 整条指纹 + 阈值）—— 见 regexSafetyCheck 里的说明 */
const SAFETY_CACHE = new Map();

/** 宽松解析 `/pattern/flags` 或裸 pattern（跟 ST 的 `regexFromString` 同一套口径，但不依赖 ST） */
function regexFromStringLoose(input) {
    const s = String(input ?? '');
    if (!s) return null;
    if (s.startsWith('/')) {
        const m = s.match(/^\/([\s\S]*)\/([a-z]*)$/i);
        if (m) return new RegExp(m[1], m[2]);
        // 形如 `/x/g 替换：xxx`（作者预设里真有一条长这样）→ 只取第一段
        const m2 = s.match(/^\/([\s\S]*?)\/([a-z]*)\b/);
        if (m2) { try { return new RegExp(m2[1], m2[2]); } catch (e) { return null; } }
        return null;
    }
    const m3 = s.match(/^(?:查找|find)\s*[:：]\s*([\s\S]*)$/);
    if (m3) return regexFromStringLoose(m3[1].trim());
    return new RegExp(s);
}

/** 取"分隔符之间的 pattern"（`/x/g` → `x`；裸 pattern → 原样），形状判定只看它 */
function regexPatternBody(src) {
    const s = String(src ?? '');
    const m = s.match(/^\/([\s\S]*)\/([a-z]*)$/i) || s.match(/^\/([\s\S]*?)\/([a-z]*)\b/);
    return m ? m[1] : s;
}

/** 正则清单的对比行渲染要用的"字段级差异"（界面红蓝 diff；纯数据，UI 只负责画） */
export function regexFieldDiff(mine, next) {
    const a = normalizeRegexScript(mine), b = normalizeRegexScript(next);
    const rows = [];
    const push = (field, label, va, vb) => {
        const sa = (va === null || va === undefined) ? '' : (typeof va === 'string' ? va : JSON.stringify(va));
        const sb = (vb === null || vb === undefined) ? '' : (typeof vb === 'string' ? vb : JSON.stringify(vb));
        if (sa === sb) return;
        rows.push({ field, label, mine: sa, next: sb, text: typeof va === 'string' || typeof vb === 'string' });
    };
    push('scriptName', '名字', a.scriptName, b.scriptName);
    push('findRegex', '查找（findRegex）', a.findRegex, b.findRegex);
    push('replaceString', '替换（replaceString）', a.replaceString, b.replaceString);
    push('trimStrings', '要去掉的（trimStrings）', a.trimStrings, b.trimStrings);
    push('placement', '作用位置（placement）', a.placement, b.placement);
    push('disabled', '开关（disabled）', a.disabled ? '关' : '开', b.disabled ? '关' : '开');
    push('markdownOnly', '只作用于显示（markdownOnly）', a.markdownOnly, b.markdownOnly);
    push('promptOnly', '只作用于提示词（promptOnly）', a.promptOnly, b.promptOnly);
    push('runOnEdit', '你改消息时也跑一遍', a.runOnEdit ? '跑' : '不跑', b.runOnEdit ? '跑' : '不跑');   // ★W95 ⑤：布尔直译（false/true）改成人话（不跑/跑）
    push('substituteRegex', '宏替换（substituteRegex）', a.substituteRegex, b.substituteRegex);
    push('minDepth', '最小深度（minDepth）', a.minDepth, b.minDepth);
    push('maxDepth', '最大深度（maxDepth）', a.maxDepth, b.maxDepth);
    return rows;
}


// ---------------------------------------------------------------- 合成

/**
 * 生成合并后的新预设。
 * @param {object} p
 * @param {object} p.mine 我的预设（用于取"我的内容"）
 * @param {object} p.next 新版预设（合并的骨架：结构/顺序/参数默认都跟它）
 * @param {Array}  p.items analyze() 的 items
 * @param {object} p.decisions { [key]: {source:'next'|'mine'|'both', enabled:'next'|'mine', spliceOrder?:'mineFirst'|'nextFirst', spliceText?:string} }
 * @param {object} p.params [ {key, use:'next'|'mine'} ] —— 省略时全部用新版
 * @param {'next'|'mine'} p.orderMode 顺序骨架跟谁
 * @param {{items?:Array, decisions?:object}} [p.regex] 正则（预设级）的对比结果与逐条决策；省略 = 内核自己按安全口径合
 *        （**默认绝不丢你的正则**：你独有的一条不删、两边不一样的默认保你的，全部记进 report.regex）
 * @param {string} [p.nextNameSuffix] ★W124-甲：`source:'both'`（保存为两版）时，**留在原位置那条**（= 新版内容）
 *        的名字要加的后缀（形如 `' by:daphnie'`；空串 = 一个字都不改名，老行为逐字不变）。
 *        口径（作者 2026-10-08 原话："如果选择 保存为两版 缝入之后**把条目名称改为"原条目名称+by作者"**
 *        比如 **肘击条目 by:daphnie** 这样好区分"）—— **只管"缝进来那一版"**；另存的那条照旧
 *        「原名（旧版）」（`makeOldCopyPrompt`），两条因此天然可区分。撞名追加 `（2）`（与（旧版）同一套消重）。
 *        作者名从哪来是**调用方**的事（更新器侧取 `S.store.author`；没有 ⇒ 传空串 = 不改名）。
 * @returns {{preset:object, report:object}}
 */
export function buildMerged({ mine, next, items, decisions = {}, params = [], orderMode = 'next', orderOverride = null, extraEntries = [], regex = null, nextNameSuffix = '' }) {
    const merged = clonePreset(next);
    const report = { replaced: [], spliced: [], keptMine: [], addedFromMine: [], dropped: [], warnings: [], renamedBoth: [] };

    const decOf = (key) => {
        const d = decisions[key];
        // ★v3.9：只有"开关不同"的条目，用户点完只写 enabled（没有 source）→ 这种也算"选过了"，
        //   不然会被当成没选而丢掉用户的开关选择（e2e ⑥ 抓到过）
        if (d && (d.source || (d.enabled !== undefined && d.enabled !== null))) return d;
        // 用户没选过的条目：合成时按"跟新版"兜底（UI 正常情况下会拦住，不让带着未选项生成）
        const it = items.find(x => x.key === key);
        return it ? fallbackDecision(it) : null;
    };
    const nextIdx = indexPreset(next);
    const mineIdx = indexPreset(mine);
    const byIdentifier = new Map(merged.prompts.map((p, i) => [String(p?.identifier ?? ''), i]));
    const bothCopies = [];        // 「两版都保留」要另存的旧版条目（①.7 里插进 prompts）

    // ① 逐条应用决策
    for (const it of items) {
        const dec = decOf(it.key) || fallbackDecision(it);
        if (!it.next) {
            // 只有我有：加进新预设（放在提示词表末尾；顺序表按"最近邻居之后"插入，见 ③）
            // ★W43：报告口径**不在这里**写 —— 用户可能点了「丢弃只有我有」，这条会被丢掉；
            //   在这里无条件 push 会把已丢弃的条目照样念成"加进来"（与同一屏「被你放弃的」自相矛盾）。
            //   ⇒ "加进来"这句话只在 ② 段写（真正决定加不加的那一处）。
            continue;
        }
        const targetIdx = byIdentifier.get(it.next.identifier);
        if (targetIdx === undefined) { report.warnings.push('新版条目定位失败：' + it.next.name); continue; }
        const src = dec.source || 'next';
        if (src === 'mine' && it.mine) {
            merged.prompts[targetIdx] = { ...merged.prompts[targetIdx], ...pickContentFields(it.mine.prompt) };
            report.keptMine.push(it.next.name);
        } else if (src === 'both' && it.mine) {
            // ★v3.9 用户改语义：「两版都保留」= 新版照旧留着 + **把你的版本另存成一条**（名字（旧版））紧跟其后，
            //   用户以后自己挑要哪个。（原来的"两版正文上下拼成一条"用户明确不要了）
            merged.prompts[targetIdx] = { ...merged.prompts[targetIdx], ...pickContentFields(it.next.prompt) };
            const oldPrompt = makeOldCopyPrompt(it, new Set(merged.prompts.map(p => String(p?.identifier ?? ''))));
            if (oldPrompt) {
                bothCopies.push({ anchorId: String(it.next.identifier), prompt: oldPrompt });
                report.spliced.push(it.next.name + '（你的版本另存为「' + oldPrompt.name + '」）');
            } else {
                report.replaced.push(it.next.name);   // 你这边本来是空的 → 没东西可另存
            }
        } else if (src === 'custom' && (it.mine || it.next)) {
            // 「逐行拼装」：正文用用户挑好的拼装结果（空的话退回新版正文，避免写出个空条目）
            const text = typeof dec.customText === 'string' && dec.customText.length
                ? dec.customText
                : (it.next ? it.next.text : it.mine.text);
            merged.prompts[targetIdx] = { ...merged.prompts[targetIdx], ...pickContentFields(it.next.prompt), ...textFieldFor(merged.prompts[targetIdx], text) };
            report.spliced.push(it.next.name);
        } else {
            report.replaced.push(it.next.name); // 用新版（骨架本来就是新版，无需改动）
        }
        /* ★★W99-甲：**名字那一维**（与内容分开选）—— 作者原话："选择旧版名字还是新版名字…要选完所有的"。
           口径：`d.name === 'mine'|'next'` 时才覆盖主条目（= 留在骨架位置的那一条）的 `name`；
           没选（或这条名字两边一样）⇒ 一个字都不动（老行为：名字跟着内容那一步走）。
           `identifier` 绝不换（身份 → 顺序表 / 后续 op 定位都认它）；"保存为两版"另存的那条照旧是
           「你的名字（旧版）」，不受这一维影响。 */
        if (it.mine && it.next && it.renamed && (dec.name === 'mine' || dec.name === 'next')) {
            const nm = String((dec.name === 'mine' ? it.mine.name : it.next.name) ?? '');
            if (nm) merged.prompts[targetIdx] = { ...merged.prompts[targetIdx], name: nm };
        }
        /* ★★W124-甲（2026-10-08 · 作者原话）："如果两个人都上传了同个条目…如果选择 保存为两版 缝入之后
           **把条目名称改为"原条目名称+by作者"** 比如 **肘击条目 by:daphnie** 这样好区分"。
           口径（最小改动 + 与作者例子逐字对齐）：
             · **只管"缝进来那一版"** = 留在原位置这条（`src==='both'`）⇒ 名字 = `原条目名称 + suffix`；
             · **我的版本一个字不改**（另存那条照旧「原名（旧版）」，见 `makeOldCopyPrompt`）⇒ 两条天然可区分；
             · `suffix` 由**调用方**给（更新器侧 = `' by:' + S.store.author`；没有作者名 ⇒ 传空串 ⇒ 这里一个字都不动）；
             · `identifier` 绝不换（身份 → 顺序表 / 后续 op 定位都认它，跟上面"名字那一维"同一个口径）；
             · **撞名**（预设里已经有一条同名）⇒ 追加 `（2）`（与（旧版）副本同一个消重口径）；
             · 位置放在**"名字那一维"之后**：用户若在名字维里亲手挑了"用旧名字/用新名字"，
               就在那个名字后面再加后缀（后缀是"这条是谁缝进来的"标记，不该被名字维吃掉）。
            ★顺带把这件事记进 report（`renamedBoth`）——纯新增字段，老读者一个都不受影响。 */
        if (src === 'both' && it.mine && String(nextNameSuffix || '')) {
            const suf = String(nextNameSuffix);
            const base = String(merged.prompts[targetIdx] && merged.prompts[targetIdx].name != null ? merged.prompts[targetIdx].name : '');
            if (base) {
                const taken = new Set(merged.prompts.map((p, i) => (i === targetIdx ? '' : String(p && p.name != null ? p.name : ''))));
                let nm = base + suf;
                if (taken.has(nm)) {                       // 撞名 ⇒ 追加（2）（3）…（与（旧版）副本同一个口径）
                    let n = 2;
                    while (taken.has(base + suf + '（' + n + '）')) n++;
                    nm = base + suf + '（' + n + '）';
                }
                merged.prompts[targetIdx] = { ...merged.prompts[targetIdx], name: nm };
                report.renamedBoth.push(base + ' → ' + nm);
            }
        }
    }

    // ①.5 只有新版有的条目被用户"这次不要" → 从新预设里删掉（以前这里是空操作，真 BUG）
    for (const it of items) {
        if (it.mine || !it.next) continue;
        const dec = decOf(it.key);
        if (dec && dec.source === 'mine') {
            const idx = merged.prompts.findIndex(x => String(x?.identifier) === String(it.next.identifier));
            if (idx >= 0) merged.prompts.splice(idx, 1);
            report.dropped.push(it.next.name);
        }
    }

    // ①.7 「两版都保留」的旧版副本：插到对应新版条目的**后面**
    //      （在主循环之后统一插，避免一边插一边让后面的 identifier→下标 定位全错位）
    const oldCopyOrder = [];
    for (const c of bothCopies) {
        const ai = merged.prompts.findIndex(p => String(p?.identifier) === c.anchorId);
        if (ai < 0) { report.warnings.push('旧版副本定位失败：' + c.prompt.name); continue; }
        merged.prompts.splice(ai + 1, 0, c.prompt);
        oldCopyOrder.push(c);
    }

    // ② 只有我有的条目 → 追加到 prompts（★W43：报告口径也**只在这一处**算 —— 真加进去了才记"加进来"）
    for (const it of items) {
        if (it.next) continue;
        const d = decOf(it.key);
        if (d && d.source === 'next') { report.dropped.push(it.mine.name); continue; }
        merged.prompts.push({ ...it.mine.prompt });
        report.addedFromMine.push(it.mine.name);
    }

    // ②.5 用户自己新建/复制的条目（"缝预设"）→ 写进 prompts（顺序在 ③ 里插）
    const extraIds = [];
    for (const ex of (Array.isArray(extraEntries) ? extraEntries : [])) {
        const nm = String(ex && ex.name || '').trim();
        if (!nm) continue;
        // ★界面存的是 ex.id（ex.identifier 也给，两个都认，否则每次重画都换随机 id → orderOverride 全对不上）
        const id = String((ex && (ex.identifier || ex.id)) || ('ywpu-new-' + Math.random().toString(36).slice(2, 10)));
        // ★按 ST 条目的真实字段来（作者预设里的条目就是这些字段）
        merged.prompts.push({
            identifier: id, name: nm, content: String(ex && ex.content != null ? ex.content : ''),
            system_prompt: !(ex && ex.system_prompt === false),
            role: (ex && ['system', 'user', 'assistant'].includes(ex.role)) ? ex.role : 'system',
            injection_position: Number.isFinite(ex && ex.injection_position) ? ex.injection_position : 0,
            injection_depth: Number.isFinite(ex && ex.injection_depth) ? ex.injection_depth : 4,
            injection_order: Number.isFinite(ex && ex.injection_order) ? ex.injection_order : 100,
            injection_trigger: Array.isArray(ex && ex.injection_trigger) ? ex.injection_trigger.slice() : [],
            forbid_overrides: !!(ex && ex.forbid_overrides),
        });
        extraIds.push({ id, afterIdent: ex.afterIdent ? String(ex.afterIdent) : null, enabled: ex.enabled !== false });
        report.addedFromMine.push(nm + '（你新建的）');
    }

    // ③ 顺序表：骨架（新版 100001）→ 应用开关决策 → 应用顺序模式 → 插入"只有我有"的条目
    //    注意：两边的 identifier 通常不同（作者重做/复制的条目不保留 UUID），
    //    所以"我的顺序"必须通过配对关系翻译成新版的 identifier 再套用。
    const chatGroup = getOrderGroup(merged, CHAT_ORDER_DUMMY_ID);
    if (chatGroup) {
        const itemByNextId = new Map();
        const itemByMineId = new Map();
        for (const it of items) {
            if (it.next) itemByNextId.set(String(it.next.identifier), it);
            if (it.mine) itemByMineId.set(String(it.mine.identifier), it);
        }
        const nextIdOfMine = (mineIdentifier) => {
            const it = itemByMineId.get(String(mineIdentifier));
            return it && it.next ? String(it.next.identifier) : null;
        };

        let order = chatGroup.order.map(o => ({ ...o }));

        // 「两版都保留」的旧版副本 → 顺序表里紧跟它上面那条（开/关状态也跟着那条，用户以后自己调）
        for (const c of oldCopyOrder) {
            const ai = order.findIndex(o => String(o.identifier) === c.anchorId);
            if (ai < 0) continue;
            order.splice(ai + 1, 0, { identifier: String(c.prompt.identifier), enabled: order[ai].enabled !== false });
        }


        // 开关：① 用户在新预设总览里明确开/关（true/false）优先
        //       ② 否则按"跟谁的开关"（'mine' = 跟我的；不写 = 跟新版）
        order = order.map(o => {
            const it = itemByNextId.get(String(o.identifier));
            if (!it) return o;
            const dec = decOf(it.key) || fallbackDecision(it);
            if (typeof dec.enabled === 'boolean') return { ...o, enabled: dec.enabled };
            if (dec.enabled === 'mine' && it.mine && it.mine.enabled !== null) {
                return { ...o, enabled: it.mine.enabled };
            }
            return o;
        });

        // 顺序模式：跟我的 → 把我的顺序翻译成新版 identifier 后当骨架，新版新增的排在后面
        if (orderMode === 'mine') {
            const kept = [];
            const seen = new Set();
            for (const o of mineIdx.orderList) {
                const nextId = nextIdOfMine(o.identifier);
                if (!nextId || seen.has(nextId)) continue;
                const src = order.find(x => String(x.identifier) === nextId);
                if (!src) continue;
                seen.add(nextId);
                kept.push({ ...src });
            }
            const rest = order.filter(x => !seen.has(String(x.identifier)));
            order = [...kept, ...rest];
        }

        // "只有我有"的条目：插在"我的顺序里它前面最近一条、且这条在新版里也有"的那条之后
        const inserted = [];
        // ★修 R1-②（2026-09-19 复查）：凡是**按锚点插进来的**条目（只有我有的 + 用户新建/复制的），
        //   都记下"它是插在谁后面"。下面的 orderOverride 只重排用户列到的那些 id，其余会被当成 rest
        //   接到末尾 —— 那会让"没列到的"新条目/独有条目脱离锚点跑到最后（一拖别的就全乱）✗
        //   记下来就能在 override 之后把它们按锚点原位插回去（见下面 ③.5）。
        const anchoredAdds = [];      // { id, anchorId, item }
        for (const it of items) {
            if (it.next) continue;
            if (decOf(it.key) && decOf(it.key).source === 'next') continue;
            const entry = { identifier: it.mine.identifier, enabled: it.mine.enabled !== null ? it.mine.enabled : true };
            let anchor = -1;
            for (const o of mineIdx.orderList) {
                if (String(o.identifier) === String(it.mine.identifier)) break;
                const peerNextId = nextIdOfMine(o.identifier);
                if (!peerNextId) continue;
                const idx = order.findIndex(x => String(x.identifier) === peerNextId);
                if (idx >= 0) anchor = idx;
            }
            if (anchor >= 0) {
                const anchorId = String(order[anchor].identifier);
                order.splice(anchor + 1, 0, entry);
                anchoredAdds.push({ id: String(it.mine.identifier), anchorId, item: entry });
                inserted.push(it.mine.name + '（插在 ' + order[anchor].identifier + ' 之后）');
            } else {
                order.push(entry);
                anchoredAdds.push({ id: String(it.mine.identifier), anchorId: null, item: entry });
                inserted.push(it.mine.name + '（插在末尾）');
            }
        }
        // 用户新建/复制的条目：插在锚点之后。
        // ★P0 修 BUG（评审抓到）：以前对每一条都 `splice(锚点+1)` → **同一个锚点上的多条会逆序** ✗
        //   （后插的排到前面）。现在按"包内顺序"一次性插入，并**从后往前处理锚点**，
        //   这样先插靠后的锚点不会影响靠前锚点的下标。
        // ★修 B2（2026-09-19 实测复现）：锚点可能是**同一批新建条目里的另一条**（d2 挂在 d1 后面）——
        //   原来 `at` 是一次性提前算好的，那时 d1 还没插进 order → findIndex 必然 -1 → d2 **静默掉到末尾** ✗
        //   现在改成**懒计算 + 按依赖顺序插**：每轮只处理"锚点此刻已经定位得到"的组，插完之后这些新 id
        //   就进 order 了，下一轮它们的子组自然能定位（父子链/多层链都顺着排）；实在定位不到（锚点 id
        //   不存在、或几条互相指成环）的组，最后兜底按包内顺序放末尾 —— **绝不丢条目**。
        {
            const groups = new Map();   // 锚点 identifier（'' = 末尾）→ [ex, ...]（保序）
            for (const ex of extraIds) {
                const key = ex.afterIdent ? String(ex.afterIdent) : '';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(ex);
            }
            // 锚点下标**每轮现算**（懒计算）：上一轮插进去的新 id 这一轮就找得到了
            const atOf = (anchor) => (anchor ? order.findIndex(x => String(x.identifier) === anchor) : -1);
            const jobs = [...groups.entries()].map(([anchor, list]) => ({ anchor, list, done: false }));
            // 轮数上限 = 组的条数（每轮至少处理一组；成环时 ready 为空直接 break，不会死循环）
            for (let round = 0; round <= jobs.length && jobs.some(j => !j.done); round++) {
                const ready = jobs.filter(j => !j.done && (j.anchor === '' || atOf(j.anchor) >= 0));
                if (!ready.length) break;      // 剩下的锚点互相指 / 指向不存在的 id → 交给下面的兜底
                // 从后往前插：先插靠后的锚点，不会让靠前锚点的下标失效（同一轮内也守这个规矩）
                const plan = ready.map(j => ({ j, at: atOf(j.anchor) })).sort((a, b) => b.at - a.at);
                for (const p of plan) {
                    const arr = p.j.list.map(ex => ({ identifier: ex.id, enabled: ex.enabled }));
                    if (p.at >= 0) order.splice(p.at + 1, 0, ...arr);
                    else order.push(...arr);
                    p.j.done = true;
                }
            }
            for (const j of jobs) {        // 兜底：锚点定位不到的组，按包内顺序放末尾
                if (j.done) continue;
                order.push(...j.list.map(ex => ({ identifier: ex.id, enabled: ex.enabled })));
            }
            // ★修 R1-②：新建/复制条目同样记下锚点（override 之后要按它复位）
            for (const ex of extraIds) {
                anchoredAdds.push({ id: String(ex.id), anchorId: ex.afterIdent ? String(ex.afterIdent) : null, item: { identifier: ex.id, enabled: ex.enabled } });
            }
        }
        // ★修 B1 / B1b（2026-09-19 实测复现）：这段以前在"只有我有 + 新建条目"插入**之前**就套用完了 ——
        //   这些条目当时还不在 order 里（pos 里没有它们）→ 被判成"不认识的 id"丢进 rest 接在末尾，
        //   结果**总览看到的顺序 ≠ 写盘顺序**（实测：想要 [n2,m9,n1] → 落盘 [n2,n1,m9]）✗
        //   现在挪到上面所有插入动作**之后**，让用户的手动拖动顺序**最后**覆盖锚点算出来的位置。
        //   语义不变（还是"只重排他给的这些，其余保持原样接在后面"）。
        if (Array.isArray(orderOverride) && orderOverride.length) {
            const want = orderOverride.map(String);
            const pos = new Map(want.map((id, i) => [id, i]));
            const inList = order.filter(o => pos.has(String(o.identifier)));
            const rest = order.filter(o => !pos.has(String(o.identifier)));
            inList.sort((a, b) => pos.get(String(a.identifier)) - pos.get(String(b.identifier)));
            order = [...inList, ...rest];
            report.warnings.push('顺序：按你手动调整的顺序生成（动了 ' + inList.length + ' 条）');

            // ★修 R1-②（2026-09-19 复查）：orderOverride 通常只列**一部分** id（拖动只动了一两条）——
            //   上面那步的语义是"你给的按你的来，其余保持原样接在后面"，但 rest 里混着"只有我有的 /
            //   你新建的"条目，它们本来是**按锚点插在邻居后面**的，被 rest 一接就全跑到末尾了 ✗
            //   （实测：orderOverride:['n2'] + x1 挂在 n2 上 → 想要 [n2,x1,n1]，落盘 [n2,n1,x1]）
            //   旧内核没这个毛病（那时 override 在插入之前套用，插入发生在后面），是 B1 把 override 挪到
            //   后面时新引入的 —— 所以这里只补"没被列到、但有锚点"的条目：**按锚点原位插回去**。
            //   被列到的条目一动都不动（用户拖动的结果仍然最高优先）。
            const float = anchoredAdds.filter(m => !pos.has(m.id));
            if (float.length) {
                const floatIds = new Set(float.map(m => m.id));
                order = order.filter(o => !floatIds.has(String(o.identifier)));     // 先把它们摘出来
                const groups = new Map();                                          // 锚点 → [条目]（保序）
                for (const m of float) {
                    const key = m.anchorId || '';
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(m);
                }
                // 懒计算 + 多轮：锚点本身可能也是"没被列到的"条目（x2 挂在 x1 后面），插完上一轮就定位得到了
                const atOf = (a) => (a ? order.findIndex(x => String(x.identifier) === a) : -1);
                const jobs = [...groups.entries()].map(([anchor, list]) => ({ anchor, list, done: false }));
                for (let round = 0; round <= jobs.length && jobs.some(j => !j.done); round++) {
                    const ready = jobs.filter(j => !j.done && (j.anchor === '' || atOf(j.anchor) >= 0));
                    if (!ready.length) break;                                      // 锚点还是找不到 → 兜底放末尾
                    const plan = ready.map(j => ({ j, at: atOf(j.anchor) })).sort((a, b) => b.at - a.at);
                    for (const p of plan) {
                        const arr = p.j.list.map(m => ({ ...m.item }));
                        if (p.at >= 0) order.splice(p.at + 1, 0, ...arr);
                        else order.push(...arr);
                        p.j.done = true;
                    }
                }
                for (const j of jobs) if (!j.done) order.push(...j.list.map(m => ({ ...m.item })));
            }
        }

        chatGroup.order = order;
        if (inserted.length) report.warnings.push('新加入的条目已按"最近邻居之后"插好顺序：' + inserted.join('、'));
        if (extraIds.length) report.warnings.push('你新建/复制的 ' + extraIds.length + ' 条已插进新预设');
    }

    // ④ 全局参数：逐项决策（默认新版）
    const useMap = new Map((params || []).map(p => [p.key, p.use || 'next']));
    for (const k of Object.keys(next)) {
        if (SKIP_PARAM_KEYS.has(k)) continue;
        if (JSON.stringify(mine[k]) === JSON.stringify(next[k])) continue;
        // ★安全评审 ②：这里以前是 `merged[k] = mine[k]`（**共享引用** —— 之后改结果会同时改到用户手上那份）
        if ((useMap.get(k) || 'next') === 'mine' && k in mine) merged[k] = deepCloneJson(mine[k]);
    }

    // ⑤ 我方独有的顺序表"孤儿项"（顺序表里有、条目列表里找不到的残留 id）
    //   口径（写死，别再靠注释猜）：**骨架 = 新版的顺序表**，我方孤儿**不并进结果**（新版里本来也没有它们），
    //   但必须**记进报告**（旧注释说"原样保留"是误导 —— 骨架取新版时它们本来就会消失）。
    {
        const orphanIds = (mineIdx.orderList || []).map(o => String(o && o.identifier)).filter(Boolean)
            .filter(id => !(mine.prompts || []).some(p => String(p && p.identifier) === id))
            .filter(id => !(merged.prompts || []).some(p => String(p && p.identifier) === id));
        report.order = { mineOrphans: orphanIds.length };
        if (orphanIds.length) {
            report.warnings.push('你这份的顺序表里有 ' + orphanIds.length + ' 条**残留 id**（条目列表里找不到它们）→ 没并进结果（新版顺序表里本来也没有它们）');
        }
    }

    // ★★★ R8 任务 A（台账 P1-3 · 保真修复）★★★
    //  这里**以前**是："只有用户把该参数显式选成 mine 才带上我独有的顶层键" ——
    //  而界面上所有参数默认都是 next（preset-updater.js 的 `S.params[p.key]='next'`）、参数区还是折叠的，
    //  ⇒ **默认操作（什么都不改、直接生成）依然会把我这份独有的顶层字段丢掉**（产品评审在 r9-b-product.md B1 抓到）。
    //  现在改成**无条件并集**：`mine` 有、`next` 没有的顶层键一律带过来；
    //  只有"键存在但值不同"才走上面的"取骨架方"，并把键名记进 report.topFields.conflicts。
    carryTopFields(merged, mine, report, { from: 'mine' });

    // ⑤ 预设级正则（ST 正则扩展的 PRESET 类，住 `extensions.regex_scripts`）
    //  ★口径（台账 P2-4 / P3-3）：**默认绝不覆盖/删掉你已有的** —— 你独有的一条不删、
    //    两边不一样的默认保留你的（全部记进 report.regex，界面照实显示）。
    //    UI 传了 `regex:{items,decisions}` 就按用户挑的来；没传就按上面的安全口径自己合。
    try {
        const rx = regex && Array.isArray(regex.items)
            ? mergeRegexes({ mine, next, items: regex.items, decisions: regex.decisions || {} })
            : mergeRegexes({ mine, next });
        if (rx.list.length || getRegexList(mine).length || getRegexList(next).length) {
            ownExtensions(merged);                       // 先切成自己的副本，别改到 next/mine
            setRegexList(merged, rx.list);
            report.regex = rx.report;
            if (rx.report.placePending.length) {
                report.warnings.push(rx.report.warnings.find(w => /位置待定/.test(w)) || '');
            }
        }
    } catch (e) {
        report.regex = { error: String((e && e.message) || e) };
        report.warnings.push('正则清单没能合上（' + ((e && e.message) || e) + '）→ 已原样保留新版那份，你的正则没被动');
    }

    return { preset: merged, report };
}

/** 取"内容相关字段"（决定用谁的正文时只搬这些，避免把 identifier 也覆盖掉）
 *  ★R8 修（安全评审 ①）：原来是**白名单**，只收 9 个键 → 漏了 `injection_order` 与 `forbid_overrides`，
 *    用户点「用我的」时这两个设置**静默跟着新版走**（界面完全看不出，比"字段丢"更难查）。
 *    现在改成**黑名单**：除"身份键"（identifier）外**全部保留** —— ST 以后加字段也不会再漏。
 *  ★同时全部 deepClone：免得动到用户的 prompt 对象（`injection_trigger` 这类数组以前是共享的）。 */
const PROMPT_IDENTITY_KEYS = new Set(['identifier']);
function pickContentFields(prompt) {
    const out = {};
    if (!prompt || typeof prompt !== 'object') return out;
    for (const k of Object.keys(prompt)) {
        if (PROMPT_IDENTITY_KEYS.has(k) || k === '__proto__') continue;
        out[k] = deepCloneJson(prompt[k]);
    }
    return out;
}

/** 按目标条目原本用哪个字段存正文，返回对应的 {content: text} 或 {system_prompt: text} */
function textFieldFor(target, text) {
    if (target && Object.prototype.hasOwnProperty.call(target, 'system_prompt') && !Object.prototype.hasOwnProperty.call(target, 'content')) {
        return { system_prompt: text };
    }
    return { content: text };
}

/** 生成预览摘要（写盘前的确认页用） */
export function summarizeMerge(merged, next, mine) {
    const mIdx = indexPreset(merged);
    const nIdx = indexPreset(next);
    const chat = getOrderGroup(merged, CHAT_ORDER_DUMMY_ID);
    const order = chat ? chat.order : [];
    const enabledCount = order.filter(o => o.enabled !== false).length;
    return {
        entryCount: merged.prompts.length,
        nextEntryCount: next.prompts.length,
        mineEntryCount: mine.prompts.length,
        orderCount: order.length,
        enabledCount,
        nextEnabledCount: nIdx.orderList.filter(o => o.enabled !== false).length,
        topOrder: order.slice(0, 10).map(o => {
            const p = merged.prompts.find(x => String(x?.identifier) === String(o.identifier));
            return (p ? p.name : String(o.identifier)) + (o.enabled === false ? '（关）' : '');
        }),
        promptCount: mIdx.entries.length,
        /* ★★D2：**界面口径**的计数（"要处理 N 条"这一类）—— 与商店/对比页**同一个判据** `visibleEntries()`。
           上面那五个原始计数（`entryCount` / `*EntryCount` / `promptCount`）**含 ST 里隐藏的幽灵**
           （他真实预设里 22 条、KIMI-3 那份也是同一批）⇒ 界面上直接印它们就比列表里多出几十条。
           老字段一个字不改（老读数/老断言还在读它们），新增这三个给界面用。 */
        visibleEntryCount: visibleEntries(mIdx).length,
        visibleNextEntryCount: visibleEntries(nIdx).length,
        visibleMineEntryCount: visibleEntries(indexPreset(mine)).length,
    };
}

// ================================================================ 官方推送（P1）：预设级指纹 + 条目级差量包 ywp-patch
//  依据《预设更新器-云端商店-定稿方案》：
//    §4.2 ywp-patch 数据格式（ops 只有 update / add / remove / switch 四类；op:"order" v1 不做）
//    §5.1 认预设（条目名集合重合率 + 抽样正文逐字比对）
//    §5.2 resolveAnchor 六级兜底（复用 P0 已验收的实现，这里一个字都不改它）
//    §5.3 门禁 = 调用方按"已应用官方版本号"决定；baseFingerprint 的 hash **只作提示**
//  ★这一节全部是**纯函数**：不碰 DOM / 不联网 / 不落盘 / 不读时钟（createdAt 由调用方传入 → 可复现、可假证）

/** 短哈希（FNV-1a 32 位 → 8 位十六进制）。
 *  ★内核不许依赖 crypto / DOM（浏览器、Node 单测、TT 三处都要能跑），所以自己实现一份；
 *  只用于"相等/不相等"（指纹比对、锚点消歧），不用于任何安全场景。 */
function hash32(s) {
    let h = 0x811c9dc5;
    const t = String(s ?? '');
    for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
}

/** 正文的短哈希（先规范化：去零宽、行尾空白、首尾空白 —— 跟 similarity 一个口径） */
function textHash(text) { return hash32(normalizeText(text)); }

/** 「真的参与注入的条目」：在对话补全顺序表里的那些。
 *  两份顺序表里都没有的条目在 ST 里是隐藏的（analyze 会剔除），用户删掉一条隐藏条目
 *  不该被判成"你这份不是原版" → 指纹/比对一律只认这些。顺序表为空时退回全量（别把整份判成空）。 */
function liveEntries(idx) {
    const live = (idx && idx.entries ? idx.entries : []).filter(e => e.orderIndex >= 0);
    return live.length ? live : ((idx && idx.entries) || []);
}

/**
 * ★B1 新增（2026-09-23）：把"活条目"整理成**全量比对用的有序元组** `[key, hash, len, orderIndex]`。
 *   · 口径与抽样完全一致：同一套 `isEmptyEntry()` 过滤（只收正文非空的活条目）、同一套 `normalizeText()`
 *     （先去零宽/行尾空白再算哈希）、同一套配对键（`indexPreset()` 的 `key` = 规范化名字 + 该名字下第几次出现）；
 *   · 顺序 = `indexPreset().entries`（即 prompts[] 原顺序）；
 *   · `orderIndex` **必须进元组** —— 它由 `prompt_order` 翻译而来，是"注入顺序"的唯一来源；
 *     不带上它，"只改了注入顺序"就会被判成"没动过"（查漏④ 的机器判据）。
 *   ★**一套实现**：`presetFingerprint({full:true})` 与 `matchPresetVersionFull()` 都走这里，
 *     不许各写一份（本项目踩过"两处各写一份就分叉"）。
 */
function fullEntryTuples(list) {
    const out = [];
    for (const e of (Array.isArray(list) ? list : [])) {
        if (!e || isEmptyEntry(e.text)) continue;
        const t = normalizeText(e.text);
        out.push([String(e.key), hash32(t), t.length, Number.isFinite(e.orderIndex) ? e.orderIndex : -1]);
    }
    return out;
}

/** ★B1 新增：全量元组的**有序整版摘要**（逐条比对的平手裁决 / "原样没动过"的严格判据）。
 *  ★带 orderIndex ⇒ 顺序差异一定反映到 digest 上；★不参与 `fp.hash`。 */
function digestOfTuples(tuples) {
    return hash32((Array.isArray(tuples) ? tuples : []).map(x => x.join('\u0001')).join('\u0002'));
}

/**
 * 预设级指纹（定稿方案 §5.1）—— 用来判断"你手上这份是不是余温 V0824"。
 * ★只读不写；同一份预设算两次一定完全一样（可假证：改一个字节 hash 就变）。
 *
 * @param {object} preset 完整预设（prompts + prompt_order）
 * @param {{sample?:number, maxNames?:number, full?:boolean}} [opts] sample = 抽样几条正文（默认 5，最多 20）；
 *   ★B1 新增 `full:true` = 追加两个字段（**不参与 `hash`**，见下）：
 *   `entryHashes: [[key, hash, len, orderIndex], …]`（全部"正文非空"的活条目）+ `digest`（有序整版摘要）。
 *   ★字段名**必须**叫 `entryHashes` —— `entries` 已被占用成**数字**且参与 `fp.hash`，
 *   同名数组会让**已发布卡片的指纹全部失配**（:860-863 那条红线）。
 * @returns {{
 *   v: number,               // 指纹结构版本（换算法要 +1，免得新旧指纹互认）
 *   entries: number,         // 参与注入的条目数（顺序表里的；没有顺序表时 = prompts 全量）
 *   names: string[],         // 归一化后的条目名集合（去重 + 排序）→ 算"名字重合率"的分母
 *   nameCount: number,       // 名字总数（maxNames 截断之前）
 *   nameHash: string,        // names 的短哈希（一眼看出名字集合有没有变）
 *   samples: Array<{name:string, hash:string, len:number}>,   // 抽样正文：归一化名字 / 正文哈希 / 字数
 *   hash: string             // 整份指纹的短哈希（entries + 名字集合 + 抽样正文）
 * }}
 */
export function presetFingerprint(preset, { sample = 5, maxNames = 1000, full = false } = {}) {
    const list = liveEntries(indexPreset(preset));
    const names = [...new Set(list.map(e => normalizeName(e.name)).filter(Boolean))].sort();
    // 抽样：按步长均匀撒点（首/中/尾都覆盖），跳过空条目/分隔符（'---' 到处都是，认不出哪一版）
    const cand = list.filter(e => !isEmptyEntry(e.text));
    const want = Math.max(1, Math.min(20, Number(sample) || 5));
    const picked = [];
    if (cand.length) {
        const step = Math.max(1, Math.floor(cand.length / want));
        for (let i = 0; i < cand.length && picked.length < want; i += step) picked.push(cand[i]);
    }
    const samples = picked.map(e => {
        const t = normalizeText(e.text);
        return { name: normalizeName(e.name), hash: hash32(t), len: t.length };
    });
    const fp = {
        v: 1,
        entries: list.length,
        names: names.slice(0, Math.max(1, maxNames)),
        nameCount: names.length,
        nameHash: hash32(names.join('\u0001')),
        samples,
    };
    fp.hash = hash32([fp.entries, fp.nameHash, samples.map(s => s.name + ':' + s.hash + ':' + s.len).join('|')].join('\u0002'));
    // ★B1（plan §3.3.1）：full:true 时**追加**两个字段。★它们**不参与上面那句 hash**（hash 是显式拼接、只拼老字段）
    //   ⇒ 已发布卡片/已发布更新包的指纹与对账（cardOf.fp、stitched[].fp）**逐字节不变**（红线 :860-863 不破）。
    //   ★"有没有 entryHashes 数组"就是档位标记（不升 v、不改 hash 算法 —— 老客户端多两个字段没人读）。
    if (full === true) {
        fp.entryHashes = fullEntryTuples(list);
        fp.digest = digestOfTuples(fp.entryHashes);
    }
    return fp;
}

/**
 * "这是不是我手上这份的上一版？"（§5.1：名字重合率 ≥90% + 抽样正文逐字相同）
 * ★只做判定、不做拒绝：判定结果给人话提示用；能不能应用由**版本号**门禁决定（§5.3）。
 *
 * @param {object} preset 用户手上那份预设
 * @param {object} fingerprint 包里的 baseFingerprint（presetFingerprint 的产物）
 * @param {{minNameScore?:number, minSampleScore?:number}} [opts]
 *   minNameScore 默认 0.9；minSampleScore 默认 1（§5.1 的严格口径）。UI 放宽到 0.6 时
 *   **必须把"抽样正文 N/M"如实显示出来**（用户改过自己那份是常态，不能因此判成"不是这一版"）。
 * @returns {{ok:boolean, score:number, nameScore:number, sampleScore:number,
 *            sameSamples:number, totalSamples:number, nameMissing:number, sampleMissing:number,
 *            entries:{pack:number|null, have:number}, reasons:string[]}}
 *   score = (nameScore + sampleScore) / 2（0~1，排序/提示用）
 */
export function matchPresetVersion(preset, fingerprint, { minNameScore = 0.9, minSampleScore = 1 } = {}) {
    const fp = (fingerprint && typeof fingerprint === 'object') ? fingerprint : null;
    // ★B1（plan §3.3.3）：包里带**全量条目哈希**（新指纹）⇒ 这一把尺子改用**全量比对**读数；
    //   签名/调用点**一个字都没改** ⇒ 文件路（`acceptPatchFile` 的 `matchPresetVersion(S.mine, pack.baseFingerprint, {minSampleScore:0.6})`）
    //   与 `applyPatch()` 的 baseCheck **零后端改动**就换上了新机制。
    //   ★老指纹（没有 entryHashes，= 已发布的老更新包）⇒ 下面这一段**一个字节都没动**。
    //   ★门槛口径：`minSampleScore` 现在量的是**全量命中率**（0.6 = 全量对上 60%），`minNameScore` 照旧量名字重合率。
    if (fp && Array.isArray(fp.entryHashes)) {
        const full = matchPresetVersionFull(preset, fp, { minHitScore: minSampleScore });
        full.ok = full.ok && full.nameScore >= minNameScore;
        full.minNameScore = minNameScore;
        full.minHitScore = minSampleScore;
        return full;
    }
    const have = presetFingerprint(preset, { sample: 20 });
    if (!fp || !Array.isArray(fp.names)) {
        return {
            ok: false, score: 0, nameScore: 0, sampleScore: 0, sameSamples: 0, totalSamples: 0,
            nameMissing: 0, sampleMissing: 0, entries: { pack: null, have: have.entries },
            reasons: ['包里没写"是哪一版"（没有 baseFingerprint）'],
        };
    }
    const want = fp.names.map(String);
    const haveNames = new Set(have.names);
    const inter = want.filter(n => haveNames.has(n)).length;
    const nameScore = want.length ? inter / want.length : 0;

    // 抽样正文：先按名字找（同一版没改名的正常情形）；名字对不上就按**正文哈希**在整份里找
    //   （作者/用户把条目改了名字但正文一字没动 → 仍算"逐字相同"）
    const list = liveEntries(indexPreset(preset));
    const byName = new Map();
    const allHashes = new Set();
    for (const e of list) {
        const h = textHash(e.text);
        allHashes.add(h);
        const k = normalizeName(e.name);
        if (!byName.has(k)) byName.set(k, new Set());
        byName.get(k).add(h);
    }
    const samples = Array.isArray(fp.samples) ? fp.samples : [];
    let same = 0;
    for (const s of samples) {
        const hs = byName.get(String(s.name || ''));
        if ((hs && hs.has(String(s.hash))) || allHashes.has(String(s.hash))) same++;
    }
    const totalSamples = samples.length;
    const sampleScore = totalSamples ? same / totalSamples : 1;
    const packEntries = Number.isFinite(fp.entries) ? fp.entries : null;
    const reasons = [
        '条目名对得上 ' + inter + '/' + want.length + '（' + Math.round(nameScore * 100) + '%）',
        totalSamples ? ('抽样正文逐字相同 ' + same + '/' + totalSamples + ' 条') : '包里没带抽样正文（只看名字）',
    ];
    if (packEntries !== null && packEntries !== have.entries) reasons.push('条目数 ' + packEntries + ' → 你这份 ' + have.entries);
    return {
        ok: nameScore >= minNameScore && sampleScore >= minSampleScore,
        score: (nameScore + sampleScore) / 2,
        nameScore, sampleScore,
        sameSamples: same, totalSamples,
        nameMissing: want.length - inter, sampleMissing: totalSamples - same,
        entries: { pack: packEntries, have: have.entries },
        reasons,
    };
}

/**
 * ★B1 新增（plan §3.3.1）：**全量比对**版的"这是不是我手上这份的上一版？"
 *   · 候选版的**每一条**（`fingerprint.entryHashes`）都到用户文件里找同名同序条目（配对键 = `indexPreset()` 的 `key`）
 *     比正文哈希 ⇒ `hitScore = hits / total`（**不再只抽查 20 条**，覆盖 100%）；
 *   · 保留老逻辑的兜底：名字/位置对不上就按**正文哈希**在整份里找（改名/位移不误伤，见 `matchPresetVersion` 原语义）；
 *   · `digestSame`：候选版的 `digest` 与"用户这份现场算出来的 digest"一致 ⇒ **逐条逐字（含注入顺序）都没动过**。
 *   · ★**纯本地、零网络**；只是读数，**不做任何"要不要点亮/要不要拦"的判定**（那是调用方的事）。
 *   ★【优雅降级】老指纹（`v:1`，没有 `entryHashes`）⇒ 内部直接转调老 `matchPresetVersion`：
 *     老字段**逐字相同**、**不抛异常**，另给 `degraded:true` 与 `hitScore/hits/total/digestSame = null`。
 *   ★【D1】`total === 0`（空预设/加密件/损坏 JSON）⇒ `hitScore = 0`，**绝不算成 1 或 NaN**。
 *
 * @param {object} preset 用户手上那份预设
 * @param {object} fingerprint 候选版的指纹（`presetFingerprint(候选, {full:true})` 的产物）
 * @param {{minHitScore?:number}} [opts] minHitScore 默认 0.6（与文件路 `minSampleScore:0.6` 同档）
 * @returns {{ok:boolean, score:number, nameScore:number, hitScore:number|null, hits:number|null, total:number|null,
 *            digestSame:boolean|null, full:boolean, degraded:boolean, sampleScore:number, sameSamples:number,
 *            totalSamples:number, nameMissing:number, sampleMissing:number, entries:object, reasons:string[]}}
 */
export function matchPresetVersionFull(preset, fingerprint, { minHitScore = 0.6 } = {}) {
    const fp = (fingerprint && typeof fingerprint === 'object') ? fingerprint : null;
    // ★【向后兼容】老指纹 ⇒ 转调老逻辑，读数逐字相同（`degraded` 是唯一的额外信息），绝不炸。
    if (!fp || !Array.isArray(fp.entryHashes)) {
        const old = matchPresetVersion(preset, fp, {});
        return {
            ok: old.ok, score: old.score, nameScore: old.nameScore, sampleScore: old.sampleScore,
            sameSamples: old.sameSamples, totalSamples: old.totalSamples,
            nameMissing: old.nameMissing, sampleMissing: old.sampleMissing, entries: old.entries,
            hitScore: null, hits: null, total: null, digestSame: null,
            full: false, degraded: true,
            degradeNote: '老指纹（没有 entryHashes）⇒ 这次退回"抽样 20 条"的老口径（读数与老逻辑逐字相同）',
            reasons: old.reasons,
        };
    }

    // —— 用户这份一侧：同一套配对键 + 同一套正文规范化 ——
    const list = liveEntries(indexPreset(preset));
    const byKey = new Map();            // key → 正文哈希
    const allHashes = new Set();        // 兜底：名字/位置对不上时按正文哈希在整份里找
    for (const e of list) {
        if (isEmptyEntry(e.text)) continue;               // 与 fullEntryTuples 同一口径
        const h = hash32(normalizeText(e.text));
        allHashes.add(h);
        const k = String(e.key);
        if (!byKey.has(k)) byKey.set(k, h);
    }

    const tuples = fp.entryHashes;
    let hits = 0;
    const missed = [];
    for (const t of tuples) {
        if (!Array.isArray(t) || t.length < 2) continue;  // 形状不对的条目算"没对上"（外部数据不可信）
        const k = String(t[0]), h = String(t[1]);
        let hit = (byKey.get(k) === h);
        if (!hit) hit = allHashes.has(h);                 // ★保留老口径的兜底：改名/位移不误伤
        if (hit) hits++;
        else if (missed.length < 8) missed.push(k);
    }
    const total = tuples.length;
    const hitScore = total ? hits / total : 0;            // ★【D1】total=0 ⇒ 0，绝不算成 1/NaN

    // —— 名字重合率（★降级为纯读数，不入门槛：查漏⑨）——
    const have = presetFingerprint(preset, { sample: 20 });
    const want = Array.isArray(fp.names) ? fp.names.map(String) : [];
    const haveNames = new Set(have.names);
    const inter = want.filter(n => haveNames.has(n)).length;
    const nameScore = want.length ? inter / want.length : 0;

    // —— 抽样读数照旧算一份（老字段的语义不许变：别的套件按 "5/5" 断言过）——
    const byName = new Map();
    for (const e of list) {
        if (isEmptyEntry(e.text)) continue;
        const k = normalizeName(e.name);
        if (!byName.has(k)) byName.set(k, new Set());
        byName.get(k).add(hash32(normalizeText(e.text)));
    }
    const samples = Array.isArray(fp.samples) ? fp.samples : [];
    let same = 0;
    for (const s of samples) {
        const hs = byName.get(String(s.name || ''));
        if ((hs && hs.has(String(s.hash))) || allHashes.has(String(s.hash))) same++;
    }
    const totalSamples = samples.length;
    const sampleScore = totalSamples ? same / totalSamples : 1;

    // —— 整版摘要：候选版 digest vs "用户这份现场算"的 digest ⇒ 逐条逐字（含顺序）都没动过的硬证据 ——
    const mineDigest = digestOfTuples(fullEntryTuples(list));
    const digestSame = (typeof fp.digest === 'string' && fp.digest.length > 0) ? (fp.digest === mineDigest) : false;

    const packEntries = Number.isFinite(fp.entries) ? fp.entries : null;
    const pct = (x) => Math.round(x * 100) + '%';
    const reasons = [
        '条目名对得上 ' + inter + '/' + want.length + '（' + pct(nameScore) + '）',
        '全量逐条比对 ' + hits + '/' + total + ' 条对得上（' + pct(hitScore) + '）（按"规范化名字 + 第几次出现"配对，含正文）',
        totalSamples ? ('抽样正文逐字相同 ' + same + '/' + totalSamples + ' 条') : '包里没带抽样正文（只看名字）',
        digestSame ? '整版摘要一致（逐条逐字、含注入顺序都没动过）' : '整版摘要不同（有正文或注入顺序动过）',
    ];
    if (!want.length) reasons.push('包里没带条目名集合（只看全量命中率）');
    if (packEntries !== null && packEntries !== have.entries) reasons.push('条目数 ' + packEntries + ' → 你这份 ' + have.entries);
    if (missed.length) reasons.push('没对上的（最多列 8 个）：' + missed.join('、'));

    return {
        ok: hitScore >= minHitScore,
        // ★score 口径与老函数保持一致（(名字 + 抽样)/2），免得按 score 排序的老调用点读数跳掉；
        //   新调用方请用 hitScore / hits（全量档的分辨力在这两个字段上）。
        score: (nameScore + sampleScore) / 2,
        nameScore, sampleScore,
        sameSamples: same, totalSamples,
        nameMissing: want.length - inter, sampleMissing: totalSamples - same,
        entries: { pack: packEntries, have: have.entries },
        hitScore, hits, total, digestSame,
        full: true, degraded: false,
        minHitScore,
        reasons,
    };
}

/**
 * ★B1 新增（plan §3.3.1 / §3.3.2 的"余量"那一半）：把"用户这份基于哪一版"**多个候选**排一次序，给出
 *   **冠军 / 亚军 / 余量**——"唯一最优"要的原始读数。
 *   · 每个候选算一次 `matchPresetVersionFull()`（全量档；老指纹自动退化）；
 *   · 排序键 = `(hits, nameScore)` 降序（★稳定：并列时保持传入顺序 ⇒ 调用方可以按"新的在前"传）；
 *   · `total === 0` 的候选**直接不入榜**（D1：空预设/加密件/损坏 JSON 不该拿 0/0 去比）；
 *   · `margin = 冠军.hits − 亚军.hits`（没有亚军 ⇒ 冠军.hits）；`marginMin = max(1, ceil(冠军.total * 1%))`。
 *   ★**只给读数**：不返回 `ok`/**verdict**、不判定"要不要点亮/要不要拦" —— 那是调用方（Wave B2 的 lockBase）的事。
 *   ★纯函数：不碰 DOM / 不联网 / 不读时钟。
 *
 * @param {object} preset 用户手上那份预设
 * @param {Array<{name?:string, ver?:string, fingerprint?:object, fp?:object}>} candidates 候选清单
 *        （`fingerprint`/`fp` 都是 `presetFingerprint(候选, {full:true})` 的产物；没有指纹的项被跳过）
 * @param {{minHitScore?:number}} [opts] 透传给 `matchPresetVersionFull()`
 * @returns {{rows:Array<object>, champion:object|null, runnerUp:object|null, margin:number,
 *            marginMin:number, exactNames:string[], total:number, note:string}}
 */
export function rankPresetCandidates(preset, candidates, { minHitScore = 0.6 } = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    const rows = [];
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c || typeof c !== 'object') continue;
        const fp = (c.fingerprint && typeof c.fingerprint === 'object') ? c.fingerprint
            : ((c.fp && typeof c.fp === 'object') ? c.fp : null);
        if (!fp) continue;
        const name = String(c.ver || c.name || ('#' + i));
        let m = null;
        try { m = matchPresetVersionFull(preset, fp, { minHitScore }); }
        catch (e) { rows.push({ name, ver: String(c.ver || c.name || ''), error: String((e && e.message) || e), hits: -1, total: 0, hitScore: 0 }); continue; }
        rows.push(Object.assign({ name, ver: String(c.ver || c.name || '') }, m));
    }
    // D1：total=0 的候选不入榜（不拿 0/0 当 100%）；其余按 (hits, nameScore) 降序、稳定
    const ranked = rows.filter(r => !r.error && r.total > 0)
        .map((r, i) => [r, i])
        .sort((a, b) => (b[0].hits - a[0].hits) || (b[0].nameScore - a[0].nameScore) || (a[1] - b[1]))
        .map(x => x[0]);
    const out = ranked.concat(rows.filter(r => r.error || !(r.total > 0)));
    const champion = ranked[0] || null;
    const runnerUp = ranked[1] || null;
    const margin = champion ? (runnerUp ? (champion.hits - runnerUp.hits) : champion.hits) : 0;
    const marginMin = champion ? Math.max(1, Math.ceil(champion.total * 0.01)) : 0;
    const exactNames = ranked.filter(r => r.digestSame === true).map(r => r.name);
    return {
        rows: out, champion, runnerUp, margin, marginMin, exactNames,
        total: champion ? champion.total : 0,
        note: '★只给读数（冠军/亚军/余量/摘要一致的那几版），不做门禁判定',
    };
}

/** 锚点正文样本：200~400 字（§4.1 ★v1.1：给 similarity 用 —— 32 字的 hash 算不出相似度） */
function anchorSample(text, max = 360) {
    const t = normalizeText(text);
    return t.length > max ? t.slice(0, max) : t;
}

/** 把"要插在它后面"的那条条目压成 §4.1 的 place（内核只出数据，不解释）。
 *  ★字段固定齐全（没有的东西给空串，不给 undefined）：afterId / after / before / afterText / afterHash / indexInAuthor
 *  · afterId/after/afterText/afterHash = **锚点那条**（resolveAnchor 的语义：插在它后面）
 *  · before = 锚点自己的前一条的名字（同名锚点的"邻居对"消歧用，见 resolveAnchor 第 ④ 级）
 *  · anchor 为 null（这条本来就在最前面，没有前一条）→ 字段全空串，只有 indexInAuthor 供人看 */
function entryPlace(anchor, extra = {}) {
    const extraW = { before: '', ...extra };
    if (!anchor) {
        return { afterId: '', after: '', afterText: '', afterHash: '', ...extraW };
    }
    const t = normalizeText(anchor.text);
    return {
        afterId: String(anchor.identifier || ''),
        after: String(anchor.name || ''),
        afterText: anchorSample(t),
        afterHash: hash32(t),
        ...extraW,
    };
}

/** update op 里要跟着正文一起搬的 ST 字段（role 参与注入、位置/深度决定插在哪）——只有真变了才带上 */
function diffFields(mine, next) {
    const out = {};
    for (const k of ['role', 'injection_position', 'injection_depth']) {
        if ((mine[k] ?? null) !== (next[k] ?? null)) out[k] = next[k];
    }
    return out;
}

/**
 * 生成条目级差量包 `ywp-patch`（定稿方案 §4.2）。
 * ★四类 op：update（改正文/改名/改角色深度）、add（新版新增）、remove（新版删掉）、switch（开关）；
 *   `op:"order"` v1 **不做**（§4.2 v1.1 决定）——条目级 `place` 已经能表达"某条插在某条之后"。
 * ★place 的取法（§5.2 的语义：afterId/after/afterText 都指**锚点那条**，即"插在它后面"）：
 *   · update / remove：锚点 = **原版那份**里这条的前一条（用户手上就是原版 → 定位得到）
 *   · add：锚点 = 它在新版里的前一条；那条若在旧版里也有 → 用**旧版**的 id/名字/正文
 *          （用户手上是旧版）；若前一条本身也是新增的 → 用新版那份（应用时它已经先插进去了）
 *
 * @param {{mine:object, next:object, from?:string, to?:string, note?:string, createdAt?:string}} p
 *        mine = 官方**上一版原版**（不是作者自己改过的那份），next = 官方新版
 * @returns {{pack:object, summary:{from,to,ops,counts,changed,entries}}}
 */
export function patchPack({ mine, next, from = '', to = '', note = '', createdAt = '' } = {}) {
    const an = analyze({ mine, next });     // 顺带做有效性校验（不是预设 → 抛人话错误）
    const mineIdx = an.mineIdx, nextIdx = an.nextIdx;
    const mineById = new Map(), nextById = new Map();
    for (const e of mineIdx.entries) if (e.identifier) mineById.set(String(e.identifier), e);
    for (const e of nextIdx.entries) if (e.identifier) nextById.set(String(e.identifier), e);
    const mineOrder = mineIdx.orderList.map(o => String(o.identifier));
    const nextOrder = nextIdx.orderList.map(o => String(o.identifier));
    const itemByNextId = new Map(), itemByMineId = new Map();
    for (const it of an.items) {
        if (it.next) itemByNextId.set(String(it.next.identifier), it);
        if (it.mine) itemByMineId.set(String(it.mine.identifier), it);
    }
    /** 同一份顺序表里"这条的前一条"（跳过顺序表里有、条目列表里没有的残留 id） */
    const prevIn = (order, byId, id) => {
        const i = order.indexOf(String(id));
        if (i < 0) return null;
        for (let k = i - 1; k >= 0; k--) { const e = byId.get(order[k]); if (e) return e; }
        return null;
    };
    const posOf = (order, id) => { const i = order.indexOf(String(id)); return i < 0 ? null : i + 1; };
    /** place：锚点 = "这条的前一条"（**从原版那份取**——用户手上就是原版，才定位得到）；
     *  before = 锚点自己的前一条（同名锚点消歧）；indexInAuthor = 这条在作者新版里的位次（仅参考） */
    const placeOf = (fromOrder, fromById, targetId, targetPos) => {
        const anchor = (targetId == null) ? null : prevIn(fromOrder, fromById, targetId);
        const ai = anchor ? fromOrder.indexOf(String(anchor.identifier)) : -1;
        const prev = ai > 0 ? fromById.get(fromOrder[ai - 1]) : null;
        return entryPlace(anchor, { before: prev ? String(prev.name || '') : '', indexInAuthor: targetPos });
    };

    const ops = [];
    const counts = { update: 0, add: 0, remove: 0, switch: 0, rename: 0 };
    // ① 按**新版顺序**走一遍：add / update / switch（新版里新加的条目位置天然就在这儿）
    for (const id of nextOrder) {
        const it = itemByNextId.get(id);
        if (!it) continue;                       // 隐藏条目（两份顺序表里都没有）已被 analyze 剔除
        const n = it.next;
        const ai = nextOrder.indexOf(id);
        if (!it.mine) {
            // 锚点 = 它在新版里的前一条；那条若在旧版里也有 → 用**旧版**那份（id/名字/正文，用户手上是旧版）；
            // 前一条本身也是新增的 → 用新版那份（按包内顺序应用时它已经先插进去了，见 applyPatch 的 tailAfter）
            let anchor = null, aOrder = nextOrder, aById = nextById;
            for (let k = ai - 1; k >= 0; k--) {
                const cand = nextById.get(nextOrder[k]);
                if (!cand) continue;
                const candItem = itemByNextId.get(String(cand.identifier));
                if (candItem && candItem.mine) { anchor = candItem.mine; aOrder = mineOrder; aById = mineById; }
                else anchor = cand;
                break;
            }
            const aIdx = anchor ? aOrder.indexOf(String(anchor.identifier)) : -1;
            const prevEntry = aIdx > 0 ? aById.get(aOrder[aIdx - 1]) : null;
            ops.push({
                op: 'add', name: n.name,
                entry: { ...(n.prompt || {}) },
                enabled: n.enabled !== false,
                place: entryPlace(anchor, { before: prevEntry ? String(prevEntry.name || '') : '', indexInAuthor: ai + 1 }),
            });
            counts.add++;
            continue;
        }
        // ★改名要按**名字本身**判，不能只看 it.nameChanged ——
        //   `analyze` 里 nameChanged 只在"靠内容/相似度配上的改名对"上为真；作者**原地改名字**
        //   （UUID 没变）时是走 identifier 兜底配上的（renamed=false）→ 用 it.nameChanged 会漏掉整条改名 ✗
        //   （实测：给 V0824 改一条名字，patch 里一条 op 都没有 → 用户那份永远叫旧名字）
        const rename = normalizeName(it.mine.name) !== normalizeName(it.next.name);
        if (it.mineChanged || rename) {
            const baseText = String(it.mine.text ?? '');
            const nextText = String(n.text ?? '');
            ops.push({
                op: 'update', name: n.name, wasName: it.mine.name,
                base: baseText, next: nextText,
                baseHash: textHash(baseText), nextHash: textHash(nextText),
                fields: diffFields(it.mine, n),
                rename: rename && baseText === nextText,     // 只改了名字（正文一字未动）
                place: placeOf(mineOrder, mineById, it.mine.identifier, posOf(nextOrder, id)),
            });
            counts.update++;
            if (rename) counts.rename++;
        }
        if (it.enabledDiff) {
            ops.push({
                op: 'switch', name: n.name, wasName: it.mine.name,
                enabled: n.enabled !== false,
                base: String(it.mine.text ?? ''), baseHash: textHash(it.mine.text),
                place: placeOf(mineOrder, mineById, it.mine.identifier, posOf(nextOrder, id)),
            });
            counts.switch++;
        }
    }
    // ② 只有旧版有的（新版删掉了）→ remove（按旧版顺序，读起来跟作者手上那份一致）
    for (const id of mineOrder) {
        const it = itemByMineId.get(id);
        if (!it || it.next) continue;
        const baseText = String(it.mine.text ?? '');
        ops.push({
            op: 'remove', name: it.mine.name, base: baseText, baseHash: textHash(baseText),
            place: placeOf(mineOrder, mineById, it.mine.identifier, posOf(mineOrder, id)),
        });
        counts.remove++;
    }
    // ③ 给每条 op 配一个稳定 key（界面逐条勾选、decisions 都用它）
    const occ = new Map();
    for (const op of ops) {
        const stem = op.op + ':' + normalizeName(op.wasName || op.name || '') + '#';
        const n = occ.get(stem) || 0;
        occ.set(stem, n + 1);
        op.key = stem + n;                       // 形如 update:📝大总结#0（稳定：同一份包每次生成都一样）
    }
    const summary = {
        from, to, ops: ops.length, counts,
        changed: counts.update + counts.remove,      // 用户能听懂的"改了 N 处"（新增单独说）
        entries: { from: liveEntries(mineIdx).length, to: liveEntries(nextIdx).length },
    };

    // ★R8 任务 A：作者新版**独有的顶层字段**（`prompts`/`prompt_order` 除外）随包下发。
    //   下载侧 applyPatch 把它们**只补到用户缺的键上**（用户已有的键一个字节都不动）——
    //   没有这一块的话，"官方整份更新"路走 applyPatch 就还是会把作者新增的顶层字段丢掉。
    const topFields = topFieldsOnlyIn(mine, next);
    // ★R8 任务 C：预设级正则（`extensions.regex_scripts`）独立一族 op + 作者那份的**顺序**。
    //   单独放在 regexOps / regexOrder，**不混进 ops**（ops 是条目 op，界面/单测都按它数数，
    //   混进去会让"op 数 = 条目改动数"这个口径失真）。
    const rx = regexPackOps({ mine, next });
    summary.regex = { ops: rx.ops.length, counts: rx.counts, lists: { from: getRegexList(mine).length, to: getRegexList(next).length } };

    const pack = {
        kind: 'ywp-patch', v: 1,
        from: String(from || ''), to: String(to || ''),
        createdAt: String(createdAt || ''),
        // ★baseFingerprint 是 presetFingerprint 的完整产物（§4.2 要的 entries/hash 都在里面）——
        //   下载侧才能算"名字重合率 + 抽样正文"，而不是只比一个 32 位 hash（§5.3：只作提示）
        // ★B1（plan §3.3.3）：升成**全量指纹**（多 entryHashes + digest，≈4.7KB）——
        //   收侧（acceptPatchFile / applyPatch 的 baseCheck）自动用上全量比对；
        //   ★零后端改动：`worker.js` / `fake-store.js` 的 PACK_KEYS 早就放行 `baseFingerprint` 且**不校验它的形状**
        //     （实测 `worker.js:728` / `fake-store.js:437` 都是 `pack.baseFingerprint = raw.baseFingerprint || null`）。
        //   ★同时保留 `sample:5`（老客户端 / 老套件读 `samples.length === 5`）⇒ 老包/老读法照旧。
        baseFingerprint: presetFingerprint(mine, { full: true }),
        ops,
        note: String(note || ''),
        ...(Object.keys(topFields).length ? { topFields } : {}),
        ...(rx.ops.length ? { regexOps: rx.ops, regexOrder: rx.order } : {}),
    };
    return { pack, summary };
}

/** 只挑"新版有、原版没有"的顶层字段（容器键按子键挑）——写进包，给下载侧补用户缺的键用 */
export function topFieldsOnlyIn(mine, next) {
    const a = (mine && typeof mine === 'object') ? mine : {};
    const b = (next && typeof next === 'object') ? next : {};
    const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const out = {};
    for (const k of Object.keys(b)) {
        if (SKIP_PARAM_KEYS.has(k) || k === '__proto__') continue;
        if (!(k in a)) { out[k] = deepCloneJson(b[k]); continue; }
        if (CONTAINER_TOP_KEYS.includes(k) && isPlain(b[k]) && isPlain(a[k])) {
            for (const sk of Object.keys(b[k])) {
                if (sk === '__proto__' || (sk in a[k])) continue;
                if (!out[k]) out[k] = {};
                out[k][sk] = deepCloneJson(b[k][sk]);
            }
        }
    }
    return out;
}

/**
 * 把 `ywp-patch` 应用到"用户手上那份预设"（★不落盘、不改入参：返回新 preset + report，写盘由界面决定）。
 *
 * 定位：update/remove/switch 按 名字（新版名 → 旧版名）→ 同名多条用正文样本挑 → 正文指纹 → 位置兜底；
 *       add 用 resolveAnchor（§5.2 六级兜底）。置信 <85 的**全部进 report.lowConf**，界面必须显式提示。
 * 冲突：你这份的正文和 op.base（原版）不一致 → 单列进 report.conflicts（你的 vs 官方新文），
 *       界面据此进"逐处挑"；**不静默覆盖**（默认 use='next'，但那条会带"你也改过"的标）。
 * 门禁：**不在这里判**（§5.3 门禁 = 调用方记的"已应用官方版本号"）；这里只给 baseFingerprint 的提示性比对。
 *
 * @param {{preset:object, patch:object, decisions?:object}} p
 *   decisions[op.key] = 'next' | 'mine' | {use:'next'|'mine'|'custom', customText?:string}（缺省='next'）
 * @returns {{preset:object, report:object}}
 *   report = { ops, lowConf, conflicts, sameName, unresolved, warnings, baseCheck, summary, stats }
 */
export function applyPatch({ preset, patch, decisions = {} } = {}) {
    if (!isValidPreset(preset)) throw new Error('这份预设不是有效的对话补全预设（缺 prompts / prompt_order）');
    if (!patch || typeof patch !== 'object' || patch.kind !== 'ywp-patch' || !Array.isArray(patch.ops)) {
        throw new Error('这个文件不是更新包（要 kind="ywp-patch"）');
    }
    const out = clonePreset(preset);
    ownExtensions(out);                        // ★R8：extensions 必须是自己的副本（要往里写正则会碰到共享引用）
    const entriesBefore = (out.prompts || []).length;
    const report = {
        ops: [], lowConf: [], conflicts: [], sameName: [], unresolved: [], warnings: [],
        baseCheck: null, summary: { update: 0, add: 0, remove: 0, switch: 0, kept: 0, custom: 0 }, stats: {},
    };
    const tailAfter = new Map();      // 锚点 id → 这一锚点上"最后一条已插入"的 id（同一锚点多条 = 包内顺序，不逆序）
    const deferredRegexOps = [];      // 被混进 ops 的 regex-* op（正常走 patch.regexOps，这里只兜错写法）

    const useOf = (op, i) => {
        const d = (decisions && op.key !== undefined && decisions[op.key] !== undefined) ? decisions[op.key] : (decisions ? decisions[i] : undefined);
        if (typeof d === 'string') return { use: d === 'mine' ? 'mine' : 'next', customText: null };
        if (d && typeof d === 'object') {
            const use = d.use === 'mine' ? 'mine' : (d.use === 'custom' ? 'custom' : 'next');
            return { use, customText: typeof d.customText === 'string' ? d.customText : null };
        }
        return { use: 'next', customText: null };
    };
    /** 当前这份的视图（每条 op 现算：前面的 op 可能已经改过它了） */
    const view = () => {
        const idx = indexPreset(out);
        return { idx, list: liveEntries(idx), orderIds: idx.orderList.map(o => String(o.identifier)) };
    };
    const promptOf = (ident) => (out.prompts || []).find(p => String(p && p.identifier) === String(ident)) || null;
    const chatGroup = () => getOrderGroup(out, CHAT_ORDER_DUMMY_ID);
    /** 按目标条目"原本用哪个字段存正文"写回去（跟 buildMerged 的 textFieldFor 同一规则） */
    const setText = (p, text) => {
        if (!p) return;
        if (Object.prototype.hasOwnProperty.call(p, 'system_prompt') && !Object.prototype.hasOwnProperty.call(p, 'content')) p.system_prompt = text;
        else p.content = text;
    };
    const allocId = (wantId, name) => {
        const taken = new Set((out.prompts || []).map(p => String(p && p.identifier)));
        let id = String(wantId || '').trim();
        if (id && !taken.has(id)) return id;
        const stem = 'ywp-' + hash32(String(name || ''));
        let cand = stem, n = 2;
        while (taken.has(cand)) { cand = stem + '-' + n; n++; }
        if (id) report.warnings.push('新增条目「' + name + '」的内部 id 和你这份里的撞了 → 换成 ' + cand);
        return cand;
    };
    /** 找"这条 op 要改的那一条"（§5.2 的定位阶梯；找不到返回 null，**绝不乱改**） */
    const locate = (op, v) => {
        const wantNames = [op.name, op.wasName].map(normalizeName).filter(Boolean);
        const base = typeof op.base === 'string' ? op.base : '';
        const baseHash = op.baseHash || (base ? textHash(base) : '');
        // ★候选先从**全部**条目里挑、再优先"在顺序表里的"（跟 resolveAnchor 的 B6 修法同一套）：
        //   官方这次把某条**挪进了**顺序表（旧版里它是隐藏的）时，只认表内候选会直接定位失败 ✗
        const candAll = wantNames.length ? v.idx.entries.filter(e => wantNames.includes(normalizeName(e.name))) : [];
        const candLive = candAll.filter(e => e.orderIndex >= 0);
        const cand = candLive.length ? candLive : candAll;
        const outsideTag = (pick) => ((pick && pick.orderIndex < 0) ? '（这条在你这份里不在顺序表内，ST 不注入它）' : '');
        if (cand.length === 1) {
            const exact = !!baseHash && textHash(cand[0].text) === baseHash;
            return { entry: cand[0], how: '名字："' + cand[0].name + '"' + (exact ? '（正文和原版一致）' : '') + outsideTag(cand[0]), conf: exact ? 100 : 90 };
        }
        if (cand.length > 1) {
            let best = cand[0], bs = -1;
            for (const e of cand) { const s = base ? similarity(e.text, base) : 0; if (s > bs) { bs = s; best = e; } }
            return { entry: best, how: '同名 ' + cand.length + ' 条里挑最像的（' + (bs >= 0 ? bs.toFixed(2) : '?') + '）' + outsideTag(best), conf: 70 };
        }
        // 名字全不中 → 按正文找最像的（跑不掉"你把它改了名字"这种）；同样先看表内，表内都不像再看表外
        if (base) {
            for (const pool of [v.idx.entries.filter(e => e.orderIndex >= 0), v.idx.entries]) {
                if (!pool.length) continue;
                const scored = pool.map(e => ({ e, s: similarity(e.text, base) })).sort((a, b) => b.s - a.s);
                if (scored.length && scored[0].s > 0.75 && (scored.length === 1 || scored[0].s - scored[1].s > 0.05)) {
                    return { entry: scored[0].e, how: '按正文找最像的（' + scored[0].s.toFixed(2) + '，这条改过名字？）' + outsideTag(scored[0].e), conf: 50 };
                }
            }
        }
        const r = resolveAnchor(op.place || {}, v.list, v.orderIds);       // 位置兜底（复用 P0 的六级）
        if (r.afterId) {
            const ai = v.orderIds.indexOf(String(r.afterId));
            const after = ai >= 0 ? v.idx.entries.find(e => String(e.identifier) === String(v.orderIds[ai + 1])) : null;
            if (after && (!base || similarity(after.text, base) >= 0.25)) {
                return { entry: after, how: '按位置兜底（' + r.how + '）', conf: Math.min(45, r.conf) };
            }
        }
        return null;
    };

    const ops = patch.ops;
    for (let i = 0; i < ops.length; i++) {
        const op = (ops[i] && typeof ops[i] === 'object') ? ops[i] : {};
        const key = String(op.key || (String(op.op || '?') + '@' + i));
        const dec = useOf(op, i);
        const rec = { key, op: String(op.op || ''), name: String(op.name || ''), use: dec.use, how: '', conf: null, action: 'applied' };
        if (dec.use === 'mine') { rec.action = 'skipped'; report.summary.kept++; report.ops.push(rec); continue; }
        try {
            if (op.op === 'update') {
                const v = view();
                const loc = locate(op, v);
                if (!loc) {
                    rec.action = 'unresolved';
                    report.unresolved.push({ key, op: 'update', name: rec.name, why: '你这份里没找到这条（改过名字 / 删掉过？）' });
                } else {
                    rec.how = loc.how; rec.conf = loc.conf;
                    const p = promptOf(loc.entry.identifier);
                    const baseText = typeof op.base === 'string' ? op.base : '';
                    if (baseText && textHash(loc.entry.text) !== (op.baseHash || textHash(baseText))) {
                        report.conflicts.push({ key, op: 'update', name: String(loc.entry.name), 你的: loc.entry.text, 官方旧文: baseText, 官方新文: String(op.next ?? ''), kind: 'update' });
                    }
                    const text = (dec.use === 'custom' && dec.customText !== null) ? dec.customText : String(op.next ?? '');
                    if (p) {
                        setText(p, text);
                        if (op.name && normalizeName(p.name) !== normalizeName(op.name)) p.name = String(op.name);
                        if (op.fields && typeof op.fields === 'object') {
                            for (const k of ['role', 'injection_position', 'injection_depth']) if (k in op.fields) p[k] = op.fields[k];
                        }
                    } else report.warnings.push('「' + rec.name + '」定位到了但读不到原文 → 没改');
                    report.summary.update++;
                    if (dec.use === 'custom') report.summary.custom++;
                }
            } else if (op.op === 'add') {
                const v = view();
                const nm = normalizeName(op.name);
                const same = nm ? v.list.filter(e => normalizeName(e.name) === nm) : [];
                if (same.length) report.sameName.push({ key, name: String(op.name || ''), 你已有的: same.map(e => e.name) });
                const r = resolveAnchor(op.place || {}, v.list, v.orderIds);
                rec.how = r.how; rec.conf = r.conf;
                const ident = allocId(op.entry && op.entry.identifier, op.name);
                const prompt = { ...(op.entry && typeof op.entry === 'object' ? op.entry : {}), identifier: ident };
                if (!prompt.name) prompt.name = String(op.name || '');
                out.prompts.push(prompt);
                const g = chatGroup();
                if (g) {
                    const order = Array.isArray(g.order) ? g.order : (g.order = []);
                    const anchorId = r.afterId == null ? '' : String(r.afterId);
                    let at = -1;
                    if (anchorId) {
                        const tip = tailAfter.get(anchorId);
                        at = order.findIndex(x => String(x.identifier) === String(tip || anchorId));
                        if (at < 0) at = order.findIndex(x => String(x.identifier) === anchorId);
                    }
                    if (at >= 0) {
                        order.splice(at + 1, 0, { identifier: ident, enabled: op.enabled !== false });
                        if (anchorId) tailAfter.set(anchorId, ident);      // 同一锚点再来一条 → 排它后面（包内顺序）
                    } else {
                        order.push({ identifier: ident, enabled: op.enabled !== false });
                        report.warnings.push('「' + rec.name + '」没找到邻居 → 先放进顺序表最后（你可以拖）');
                    }
                }
                report.summary.add++;
            } else if (op.op === 'remove') {
                const v = view();
                const loc = locate(op, v);
                if (!loc) {
                    rec.action = 'unresolved';
                    report.unresolved.push({ key, op: 'remove', name: rec.name, why: '你这份里没找到这条（已经删过 / 改过名字？）' });
                } else {
                    rec.how = loc.how; rec.conf = loc.conf;
                    const baseText = typeof op.base === 'string' ? op.base : '';
                    if (baseText && textHash(loc.entry.text) !== (op.baseHash || textHash(baseText))) {
                        report.conflicts.push({ key, op: 'remove', name: String(loc.entry.name), 你的: loc.entry.text, 官方旧文: baseText, 官方新文: '', kind: 'remove' });
                    }
                    const ident = String(loc.entry.identifier);
                    out.prompts = (out.prompts || []).filter(p => String(p && p.identifier) !== ident);
                    for (const grp of (out.prompt_order || [])) {         // 顺序表里的那条也要拿掉，别留"找不到"的残留
                        if (Array.isArray(grp && grp.order)) grp.order = grp.order.filter(o => String(o && o.identifier) !== ident);
                    }
                    report.summary.remove++;
                }
            } else if (op.op === 'switch') {
                const v = view();
                const loc = locate(op, v);
                const want = op.enabled !== false;
                if (!loc) {
                    rec.action = 'unresolved';
                    report.unresolved.push({ key, op: 'switch', name: rec.name, why: '你这份里没找到这条（改过名字 / 删掉过？）' });
                } else {
                    rec.how = loc.how; rec.conf = loc.conf;
                    const ident = String(loc.entry.identifier);
                    const g = chatGroup();
                    const o = g && Array.isArray(g.order) ? g.order.find(x => String(x.identifier) === ident) : null;
                    if (!o) {
                        rec.action = 'unresolved';
                        report.unresolved.push({ key, op: 'switch', name: rec.name, why: '这条不在顺序表里（ST 里不参与注入）→ 开关没处改' });
                    } else {
                        o.enabled = want;
                        report.summary.switch++;
                    }
                }
            } else if (op.op && String(op.op).startsWith('regex-')) {
                // ★R8：正则 op 正常走 patch.regexOps 那一条（见下面），这里只是**兜住**"被混进 ops"的写法
                //   ——不报"不认识的 op"，也不静默：交给下面统一处理。
                rec.action = 'regex-deferred';
            } else {
                rec.action = 'unknown';
                report.warnings.push('不认识的 op：「' + String(op.op) + '」（这一版内核只认 update / add / remove / switch）');
            }
        } catch (e) {
            rec.action = 'error';
            report.warnings.push('这条没能应用（' + key + '）：' + ((e && e.message) || e));
        }
        if (rec.action === 'regex-deferred') { deferredRegexOps.push(op); continue; }
        if (rec.conf !== null && rec.conf < 85) {
            report.lowConf.push({ key, op: rec.op, name: rec.name, conf: rec.conf, how: rec.how });
        }
        report.ops.push(rec);
    }

    // ★★★ R8 任务 A（第二路）：把包里"作者新版独有的顶层字段"补到用户缺的键上 ★★★
    //  口径与 buildMerged 一致：**用户已有的键一个字节都不动**（骨架 = 用户手上这份），只补缺的，并记进 report。
    if (patch.topFields && typeof patch.topFields === 'object') {
        carryTopFields(out, patch.topFields, report, { from: 'pack' });
    }

    // ★★★ R8 任务 C：预设级正则（`extensions.regex_scripts`）★★★
    //  · 默认 `use='mine'`：**不覆盖你已有的**（台账 P2-4）；`regex-remove` 默认**不删**（P3-3）
    //  · 包里的 `regexOrder` = 作者那份的顺序 → 顺序也照他的排（顺序影响执行结果）
    const rxOps = [...(Array.isArray(patch.regexOps) ? patch.regexOps : []), ...deferredRegexOps];
    if (rxOps.length || Array.isArray(patch.regexOrder)) {
        try {
            const r0 = applyRegexOps({ list: getRegexList(out), ops: rxOps, decisions: patch.regexDecisions || {} });
            const ordered = Array.isArray(patch.regexOrder) && patch.regexOrder.length
                ? applyRegexOrder(r0.list, patch.regexOrder) : r0.list;
            setRegexList(out, ordered);
            report.regex = r0.report;
            report.regexOrderApplied = Array.isArray(patch.regexOrder) ? patch.regexOrder.length : 0;
            for (const w of r0.report.warnings) report.warnings.push(w);
            if (report.regex.pendingRemove.length) {
                report.warnings.push('有 ' + report.regex.pendingRemove.length + ' 条正则作者新版删掉了 → **先留着**（要不要删你自己点）：' + report.regex.pendingRemove.map(x => x.name).slice(0, 6).join('、'));
            }
            if (report.regex.unresolved.length) {
                report.warnings.push('有 ' + report.regex.unresolved.length + ' 条正则没在你这份里找到（跳过，绝不乱改）');
            }
        } catch (e) {
            report.regex = { error: String((e && e.message) || e) };
            report.warnings.push('正则没能应用（' + ((e && e.message) || e) + '）→ 你的正则一个字节没动');
        }
    }

    // baseFingerprint：**只作提示**（§5.3 的门禁是"已应用官方版本号"，不由这里判；这里绝不当拒绝用）
    const m = matchPresetVersion(preset, patch.baseFingerprint);
    report.baseCheck = {
        match: m.ok, score: m.score, nameScore: m.nameScore, sampleScore: m.sampleScore,
        sameSamples: m.sameSamples, totalSamples: m.totalSamples,
        nameMissing: m.nameMissing, sampleMissing: m.sampleMissing, entries: m.entries,
        hint: m.ok ? '' : ('你手上这份和原版对不上（' + m.reasons.join('；') + '）——可能被改过，或根本不是同一版；建议逐条看一遍再应用'),
    };
    const afterView = indexPreset(out);
    report.stats = {
        entriesBefore,
        entriesAfter: (out.prompts || []).length,
        orderedAfter: afterView.orderList.length,
        appliedEntries: liveEntries(afterView).length,
        ops: ops.length,
        regexOps: rxOps.length,
        regexBefore: getRegexList(preset).length,
        regexAfter: getRegexList(out).length,
    };
    return { preset: out, report };
}
