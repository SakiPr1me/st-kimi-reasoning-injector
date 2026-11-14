// scene-boundary.js — 场记替换核心（SCENE_BOUNDARY_VERSION 1.0.1，362 修订语义）
// 纯核心模块：无 DOM、无宿主依赖、不 import 其它插件文件；所有原件（预设 prompts / order / regex_scripts）
// 只读，零 mutation；运行时改动一律发生在"克隆后的副本 / 本轮临时集合条目"上，
// 绝不写 oai_settings、绝不 setLocalVariable、绝不写预设与正则原件。
//
// 接口（主 Agent 接线用）：
//   normalizeSceneConfig(raw)                        -> {ok, config, errors, warnings}
//                                                     config 新增 closeScene（默认 true）、omitTag（默认 false）
//   buildScenePlan({prompts, order, regexScripts, config}) -> {ok, errors, warnings, changes, config,
//                                                     promptEdits, boundaryTags, regexTargets,
//                                                     guideId, formatId, worldId, chainIds,
//                                                     closeGuide, collectionInsert, ...}
//   transformScenePrompt(prompt, plan)               -> prompt 的浅拷贝（输入永不改动；命中 promptEdits 则换 content）
//   createSceneRuntime({getPlan, getEnabled, regexProvider})
//                                                    -> {installPromptManager, installPromptCollection,
//                                                        installRegexProvider, boundaryMarkers, snapshot}
//     · installPromptManager(pm) 会顺带（幂等）调用 installPromptCollection(pm)——主 Agent 只装这一个即可。
//   makeOmitTagRegex(config)                         -> 规范临时正则规则对象 | null（omitTag!==true / 无可用 tag 时 null）
//   createBoundaryRegExp(findRegexString, {tags})    -> RegExp 子类实例 | null（导出仅为了可测可验）
//
// 语义速记（362 修订，与作者拍板一致）：
//   mode='content'：原场记提示词只是【本轮关闭】不是删除——原内容与顺序一字不动（plan changes 用显式 kind='disabled'，
//                   不是 remove）；format 的 {{getvar::scene_mod}} 行【保留】（初始化变量会清空值，关闭场记要求
//                   即可不发送其内容）；链尾 <scene> 引用换 <content>；世界支线改成"正文当前时间"。
//   mode='replace'：新模块在 scene 之前；format 新占位放 critique_mod 之后、scene_mod 之前，{{getvar::scene_mod}}
//                   【永远保留】；链尾所有相关 <scene> 引用换新标签——不受 closeScene 影响（新模块本来就在
//                   scene 前面，phase 承诺的第一个输出标签必须指向新标签，否则与 format 顺序自相矛盾）；
//                   config.closeScene=true（默认）本轮关闭原场记（kind='disabled'，原件不动）；
//                   closeScene=false 保场记生成：场记原要求与 scene_mod 都保留，世界支线的时间引用也保留。
//   source='paste'：贴入整段模块在【场记位置之前】作为独立提示词发送——无论场记本轮是否关闭；绝不占用原槽位
//                   （361 的"替换槽位"会丢原场记，362 废弃）。原场记 order 已关闭也能插入（按 order 位置锚）。
//                   模块宏在【场记位】执行：preparePrompt 包装在遇到场记条目（或场记停用时的 order 后继首个启用
//                   锚位）时先展开模块宏——初始化变量清空之后、format 既有 getvar 之前，所以 format 已有的
//                   {{getvar::xxx_mod}} 复用占位能读到模块 setvar 的值；场记与后继锚全停用时才退到集合构建后
//                   展开（其后置 getvar 当轮读不到）。format 用字面占位 `<tag> ... </tag>`，不依赖模块变量。
//   链识别（362 收紧）：已知 9 个链提示词 id（稳定 ID）→ 替换其全部 <scene> 引用；未知自定义 id → 只在
//                   明确的 首个/第一个/首标签 输出声明处局部换；【不再】按名字含"链/尾部/思维链"大范围匹配，
//                   没有可确认声明的提示词一律不动（warnings 列出）。用户自改文本：除 <scene> 引用与声明句外
//                   一字不动；必要锚失落给出具体预览并整体拒绝，不做半套。
//   omitTag（默认 false）：新标签整块不发后端提示词——core 只提供 makeOmitTagRegex(config) 规范规则对象
//                   （与现行"不发送<scene>"同款：placement [2] + promptOnly，只影响发给模型的历史副本，
//                   不在 display / 历史写侧运行）；是否临时追加、何时运行由主 Agent 接线，绝不写入原 regex 数据。
//
// 阻断原则：必要目标缺失/重复/锚点歧义 → plan.ok=false，一个字都不改；场记引导"未启用/缺失"不再是硬阻断
// （362：直接正文或已有模块不要求先开场记），只给 warning 与具体预览。

export const SCENE_BOUNDARY_VERSION = '1.0.1';

/* ========================================================================
 * 小工具
 * ===================================================================== */

const PLAN_VERSION = SCENE_BOUNDARY_VERSION;

// 贴入模块的独立提示词 identifier（本轮临时集合条目；每次生成集合新建，不存在跨轮残留）
const MODULE_PROMPT_ID = 'ywSceneModule';

// 危险/无意义标签黑名单：HTML 结构类 + 会与本预设现有体系撞车的名字。
// （'content' 不在这里：tag=content 会自动切换成 content 模式，见 normalizeSceneConfig。）
const TAG_DENY = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'html', 'head', 'body', 'title',
  'div', 'span', 'details', 'summary', 'pre', 'code', 'br', 'hr', 'img', 'a', 'p', 'svg', 'math',
  'textarea', 'input', 'button', 'form', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'center', 'font', 'b', 'i', 'u', 'em', 'strong',
  // 与原体系撞车：换了等于没换或直接打架
  'scene', 'cot', 'think', 'thinking', 'mutter', 'talk', 'scene_guide',
]);

// 合法标签名：字母开头，后接 字母/数字/下划线/冒号/连字符，总长 ≤64——
// 与 tag-fixer 和 360 伪标签口径一致（中文/数字开头的名字不兼容，直接拒绝）。
const TAG_NAME_RE = /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/;
const TAG_TOKEN_SRC = '[A-Za-z][A-Za-z0-9_:-]{0,63}';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function countOccurrences(hay, needle) {
  if (typeof hay !== 'string' || !needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; }
  return n;
}

function cloneShallow(obj) {
  const proto = obj !== null && typeof obj === 'object' ? Object.getPrototypeOf(obj) : null;
  const c = proto ? Object.create(proto) : {};
  if (obj !== null && typeof obj === 'object') Object.assign(c, obj);
  return c;
}

/* ========================================================================
 * 配置归一化 normalizeSceneConfig
 * ===================================================================== */

/**
 * 归一化用户配置。
 * 接受 xxx / <xxx> / <xxx>...</xxx> 三种标签输入；拒绝危险标签与 scene 同名；
 * paste 模式要求非空 moduleText。mode='content' 时 tag/moduleText 不使用（保留原值但忽略）。
 * 362 新增：closeScene（仅 replace 有意义，默认 true=本轮关闭原场记；false=保场记生成）、
 *           omitTag（默认 false；true=新标签整块不发后端提示词，规则对象由 makeOmitTagRegex 提供）。
 * @returns {{ok:boolean, config:object|null, errors:string[], warnings:string[]}}
 */
export function normalizeSceneConfig(raw) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(raw)) {
    return { ok: false, config: null, errors: ['没有提供场记替换配置'], warnings };
  }

  // enabled：布尔或 'true'/'false' 字符串；缺省 false。
  let enabled = raw.enabled;
  if (enabled === 'true') enabled = true;
  else if (enabled === 'false') enabled = false;
  else enabled = !!enabled;

  // mode：缺省 content（UI 默认与核心默认一致）
  let mode = raw.mode;
  if (mode === undefined || mode === null || mode === '') mode = 'content';
  if (mode !== 'replace' && mode !== 'content') {
    errors.push(`mode 只能是 'replace'（换标签）或 'content'（本轮关闭场记、正文直接开始），收到：${JSON.stringify(mode)}`);
    mode = 'content';
  }

  // source
  let source = raw.source;
  if (source === undefined || source === null || source === '') source = 'existing';
  if (source !== 'existing' && source !== 'paste') {
    errors.push(`source 只能是 'existing'（用现有模块/占位）或 'paste'（贴入整段模块），收到：${JSON.stringify(source)}`);
    source = 'existing';
  }

  // closeScene（362）：仅 replace 模式有意义；缺省 true。
  let closeScene = raw.closeScene;
  if (closeScene === 'true') closeScene = true;
  else if (closeScene === 'false') closeScene = false;
  else if (closeScene === undefined || closeScene === null) closeScene = true;
  else closeScene = !!closeScene;

  // omitTag（362）：缺省 false。
  let omitTag = raw.omitTag;
  if (omitTag === 'true') omitTag = true;
  else if (omitTag === 'false') omitTag = false;
  else if (omitTag === undefined || omitTag === null) omitTag = false;
  else omitTag = !!omitTag;

  // tag：接受 xxx / <xxx> / <xxx>...</xxx>；tag=content 自动按 content 模式处理（计划要求）
  let tag = raw.tag;
  let tagExplicit = false;
  if (typeof tag === 'string') {
    let t = tag.trim();
    const pair = t.match(new RegExp('^<(' + TAG_TOKEN_SRC + ')>[\\s\\S]*</\\1>$'));
    if (pair) t = pair[1];
    else {
      const single = t.match(new RegExp('^<(' + TAG_TOKEN_SRC + ')>$'));
      if (single) t = single[1];
    }
    t = t.trim();
    if (t !== '') {
      tagExplicit = true;
      if (!TAG_NAME_RE.test(t)) {
        errors.push(`标签名不合法：${JSON.stringify(tag)}（要字母开头，后接 字母/数字/下划线/冒号/连字符，总长≤64）`);
      } else if (t.toLowerCase() === 'content') {
        if (mode !== 'content') {
          warnings.push('tag 为 content：按"本轮关闭场记"（content）模式处理');
          mode = 'content';
        }
        tag = '';
      } else if (t.toLowerCase() === 'scene') {
        errors.push('新标签与原 scene 同名，替换没有意义，请换一个名字');
      } else if (TAG_DENY.has(t.toLowerCase())) {
        errors.push(`标签名 ${t} 是 HTML/系统保留标签，拒绝使用`);
      } else {
        tag = t;
      }
    } else {
      tag = '';
    }
  } else if (tag === undefined || tag === null) {
    tag = '';
  } else {
    errors.push(`tag 必须是字符串，收到：${typeof tag}`);
    tag = '';
  }

  // moduleText
  let moduleText = raw.moduleText;
  if (typeof moduleText !== 'string') {
    if (moduleText === undefined || moduleText === null) moduleText = '';
    else { errors.push('moduleText 必须是字符串'); moduleText = ''; }
  }
  if (source === 'paste' && mode === 'replace' && moduleText.trim() === '') {
    errors.push('贴入模式（paste）需要提供整段模块文本 moduleText');
  }
  if (mode === 'content') {
    if (source === 'paste' && moduleText.trim() !== '') {
      warnings.push('content 模式只关闭场记、不使用贴入的模块文本');
    }
    if (tagExplicit) warnings.push('content 模式下 tag 不会使用（正文直接以 <content> 开始）');
    if (closeScene === false) warnings.push('content 模式本轮必然关闭场记，closeScene=false 不生效');
  }
  if (source === 'existing' && moduleText.trim() !== '' && mode === 'replace') {
    warnings.push('source=existing 时贴入的模块文本不会使用（会用现有模块/占位）');
  }

  const config = { enabled, mode, source, tag, moduleText, closeScene, omitTag };
  return { ok: errors.length === 0, config, errors, warnings };
}

/* ========================================================================
 * 顺序表（order 100001 权威）
 * ===================================================================== */

/**
 * 把各种可能的 order 形状归一成 [{identifier, enabled}]：
 *  - [{identifier, enabled}, ...]（主 Agent 直接传 100001 那份）
 *  - [{character_id, order:[...]}, ...]（整份 prompt_order）
 *  - {order:[...]} / {identifier,enabled} 混合形状
 */
export function resolveOrderList(order) {
  let list = null;
  if (Array.isArray(order)) {
    if (order.length && isPlainObject(order[0]) && Array.isArray(order[0].order)) {
      const hit = order.find(e => String(e.character_id) === '100001') || order[0];
      list = hit.order;
    } else {
      list = order;
    }
  } else if (isPlainObject(order) && Array.isArray(order.order)) {
    list = order.order;
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter(e => e && typeof e.identifier === 'string')
    .map(e => ({ identifier: e.identifier, enabled: !!e.enabled }));
}

/* ========================================================================
 * moduleText 的标签识别（贴入模块）
 * ===================================================================== */

// 把围栏代码块/行内反引号/HTML 注释抹掉，避免把示例里的标签当真。
function maskCodeZones(text) {
  let s = String(text);
  // 行首围栏（``` 或 ~~~，含未闭合——未闭合就当整段都是代码）
  s = s.replace(/(^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*($|\n[\s\S]*$)/g, (m, pre, fence) => {
    // 保留换行结构，内容抹成空格
    return pre + fence + m.slice(pre.length + fence.length).replace(/[^\n]/g, ' ');
  });
  // 行内反引号段
  s = s.replace(/`[^`]*`/g, m => m.replace(/[^\n]/g, ' '));
  // HTML 注释
  s = s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  return s;
}

const PAIR_TOKEN_RE = new RegExp('</?(' + TAG_TOKEN_SRC + ')\\s*>', 'g');

/**
 * 从 moduleText 里认出模块的输出标签。
 * 规则（尽量贴近现实贴入物）：先在代码区外找成对标签；剔除 *_guide 这类说明壳；
 * 代码区内（场记格式的示例块）作为兜底。唯一 → 认定；不唯一/没有 → 报错。
 */
export function scanModuleTag(moduleText) {
  const text = String(moduleText || '');
  const masked = maskCodeZones(text);
  const collect = (src) => {
    const stack = [], roots = new Map();
    let m;
    PAIR_TOKEN_RE.lastIndex = 0;
    while ((m = PAIR_TOKEN_RE.exec(src)) !== null) {
      const name = m[1];
      if (m[0][1] === '/') {
        const top = stack[stack.length - 1];
        if (!top || top.name !== name) continue;
        stack.pop();
        if (top.root) roots.set(name, (roots.get(name) || 0) + 1);
      } else {
        const root = !/_guide$/i.test(name) && !stack.some(entry => !/_guide$/i.test(entry.name));
        stack.push({ name, root });
      }
    }
    return [...roots].map(([name, n]) => ({ name, n }));
  };

  let candidates = collect(masked).filter(p => !/_guide$/i.test(p.name));
  if (candidates.length === 1) return { ok: true, tag: candidates[0].name, candidates, errors: [], warnings: [] };
  if (candidates.length === 0) {
    // 兜底：看代码区里的成对标签（场记格式示例块就长这样）
    const examples = text.replace(/^[ \t]*(?:`{3,}|~{3,})[^\r\n]*$/gm, '')
      .replace(/`[^`\r\n]*`/g, part => ' '.repeat(part.length));
    const inCode = collect(examples).filter(p => !/_guide$/i.test(p.name));
    const distinct = [...new Set(inCode.map(p => p.name))];
    if (distinct.length === 1) return { ok: true, tag: distinct[0], candidates: inCode, errors: [], warnings: [] };
    if (distinct.length === 0) {
      return { ok: false, tag: '', candidates: [], errors: ['贴入的模块文本里认不出任何成对标签（形如 <标签> … </标签>）'], warnings: [] };
    }
    return { ok: false, tag: '', candidates: inCode, errors: [`贴入的模块文本里有多个候选标签（${distinct.map(x => '<' + x + '>').join('、')}），认不出唯一最外层，请显式填写 tag`], warnings: [] };
  }
  const names = candidates.map(p => p.name);
  return { ok: false, tag: '', candidates, errors: [`贴入的模块文本最外层有多个标签（${names.map(x => '<' + x + '>').join('、')}），认不出唯一输出标签，请显式填写 tag`], warnings: [] };
}

/* ========================================================================
 * buildScenePlan
 * ===================================================================== */

// V1028 已知锚点 id（识别的主判据永远是内容锚，id 只是链提示词的补充线索）
const KNOWN_IDS = {
  guide: 'aca1b545-adae-4638-a638-f6f481583e34',   // 🎬开幕场记
  format: '7f49c31f-87cf-4afb-a1d8-8c158f4c07c9',  // 💻格式(加模块这也要加)
  world: 'fc134310-8d48-4dc3-87f3-c080cad94488',   // 📢世界支线(推荐!!)
  chains: [
    '85698c23-7a1b-4ef2-b2d4-1dbe5aad9fab',        // 🐋思维链·DS
    'mskolkngax5zzw2v1gs',                          // 🐋尾部1·DS(择1)
    'mshivz1toreo156c28',                           // 🐋尾部2·DS(择1)
    'mscxwkta7e2ycqrq07x',                          // 🌙思维链1·KIMI
    'ms4rztexqnqltpdttq',                           // 🌙思维链2·KIMI(名字里的"别碰"不是本任务边界，链要联动)
    'mscydepkyosisewgyc',                           // 🌙尾部·KIMI(必开)
    'mqpxwfsgtpqjyb7lthh',                          // 😺思维链·Gmn
    'mour003wapke1xacky6',                          // 😺尾部1·Gmn3.1(择1)
    'c5729e6b-e731-4ebc-aec0-9087e6aa4d11',        // 😺尾部2·Gmn4/3.8(择1)
  ],
};

// 未知自定义链尾的"首输出声明"识别（362：只认明确声明，不按名字含"链"大范围改）：
//   形如「第一个要输出的标签是：`<scene>`」「首个标签：<scene>」——
//   声明词与 <scene> 必须同行且间隔 ≤40 字；只局部换声明里的 <scene>，其余文本一字不动。
const FIRST_DECL_RE = /(?:第一个|首个|首标签)[^\n]{0,40}?<scene>/g;

/** 未知 id 提示词的首输出声明局部替换：返回 {content, count}。输入字符串永不改动。 */
function replaceFirstDeclarations(content, target) {
  FIRST_DECL_RE.lastIndex = 0;
  let out = '';
  let last = 0;
  let count = 0;
  let m;
  while ((m = FIRST_DECL_RE.exec(content)) !== null) {
    count++;
    out += content.slice(last, m.index) + m[0].replace('<scene>', target);
    last = m.index + m[0].length;
  }
  out += content.slice(last);
  return { content: out, count };
}

// 两条思考剥离/折叠正则的精确 find 串（来自真实 V1028 extensions.regex_scripts，无 flags 原样）。
// 362：用户自改兼容——允许 /…/flags 包裹、空格轻改与"任意字符类"等义写法（[\s\S]/[\S\s]/[ \t\S]…），
// 用结构模板（@ANY@ = 含 \s 或 \S 的正字符类）识别；语义改动（取反类/前缀/前瞻/标签名变了）不识别，
// plan 硬阻断并给具体预览，绝不误用。
const FIND_STRIP = '^[\\s\\S]*(?=<scene>(?!`))';
const FIND_FOLD = '^([\\s\\S]*)(?=<scene>(?!`))';
const FIND_STRIP_STRUCT = '^@ANY@*(?=<scene>(?!`))';
const FIND_FOLD_STRUCT = '^(@ANY@*)(?=<scene>(?!`))';

/** find 串结构归一：剥 /…/flags 壳、去空白、任意字符类等义写法归一成 @ANY@。仅用于两条已知结构的识别。 */
function normalizeFindStructure(s) {
  let t = String(s || '');
  const wrapped = t.match(/^\/([\s\S]*)\/([gimsuy]*)$/);
  if (wrapped) t = wrapped[1];
  t = t.replace(/\s+/g, '');
  // 含 \s 或 \S 的"正"字符类 → @ANY@（[\s\S] / [\S\s] / [ \t\S] 等写法等义）；取反类 [^\s\S] 不归一（语义不同）
  t = t.replace(/\[(\^?)((?:\\.|[^\\\]])*)\]/g, (m, neg, inner) => {
    if (neg) return m;
    return /\\[sS]/.test(inner) ? '@ANY@' : m;
  });
  return t;
}

const GETVAR_SCENE = '{{getvar::scene_mod}}';
const GETVAR_CRITIQUE = '{{getvar::critique_mod}}';
const EMPTY_SETVAR_SCENE_RE = /\{\{setvar::scene_mod::\s*\}\}/;

function setvarValue(content, name) {
  // 返回第一个 {{setvar::<name>:: … }} 的值（到下一个 }} 为止），找不到返回 null。
  const re = new RegExp('\\{\\{setvar::' + escapeRegExp(name) + '::');
  const m = re.exec(content);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = content.indexOf('}}', start);
  if (end < 0) return content.slice(start);
  return content.slice(start, end);
}

function isNonEmptySetvarSceneMod(content) {
  const v = setvarValue(content, 'scene_mod');
  return v !== null && v.trim() !== '';
}

function enabledOf(enabledMap, id) {
  return enabledMap.get(id) === true;
}

/**
 * 把新占位作为独立一行插到锚 token 所在行之前。找不到锚返回 null。
 */
function insertOwnLineBefore(c, anchorTok, insertText) {
  const at = c.indexOf(anchorTok);
  if (at < 0) return null;
  const lineStart = at === 0 ? 0 : c.lastIndexOf('\n', at - 1) + 1;
  return c.slice(0, lineStart) + insertText + '\n' + c.slice(lineStart);
}

/**
 * 把已有占位 token 挪到锚 token（scene_mod）所在行之前：
 * 旧位行感知删除（独占一行时连行清理）→ 在锚行前独立一行插回。全程各恰一次才有效。
 * 返回新内容；找不到返回 null。
 */
function moveTokenBeforeAnchor(c, anchorTok, token) {
  const xp = c.indexOf(token);
  if (xp < 0 || c.indexOf(anchorTok) < 0) return null;
  let start = xp;
  while (start > 0 && (c[start - 1] === ' ' || c[start - 1] === '\t')) start--;
  const atLineStart = start === 0 || c[start - 1] === '\n';
  const end = xp + token.length;
  const endSpan = (atLineStart && c[end] === '\n') ? end + 1 : end;
  const c1 = c.slice(0, start) + c.slice(endSpan);
  return insertOwnLineBefore(c1, anchorTok, token);
}

/**
 * 构建场记替换计划（362 语义）。全部只读；改动的最终文案在这里生成，
 * 预览（changes）与运行时（promptEdits / collectionInsert）同源。
 * @param {{prompts?:array, order?:array|object, regexScripts?:array, config?:object}} input
 */
export function buildScenePlan(input) {
  const errors = [];
  const warnings = [];
  const changes = [];
  const inp = input || {};

  const norm = (isPlainObject(inp.config) && inp.config.ok && inp.config.config)
    ? inp.config
    : normalizeSceneConfig(inp.config);
  const planFail = () => ({
    ok: false,
    version: PLAN_VERSION,
    errors,
    warnings,
    changes,
    config: norm.ok ? norm.config : null,
    promptEdits: {},
    boundaryTags: [],
    regexTargets: [],
    guideId: null,
    formatId: null,
    worldId: null,
    chainIds: [],
    closeGuide: false,
    collectionInsert: null,
    enabled: norm.ok ? norm.config.enabled : false,
  });
  if (!norm.ok) {
    errors.push(...norm.errors);
    return planFail();
  }
  const cfg = norm.config;
  warnings.push(...norm.warnings);

  const prompts = Array.isArray(inp.prompts) ? inp.prompts.filter(p => p && typeof p === 'object') : [];
  const enabledMap = new Map(resolveOrderList(inp.order).map(o => [o.identifier, o.enabled]));
  const promptEdits = Object.create(null);
  const addEdit = (p, kind, title, newContent, note) => {
    promptEdits[p.identifier] = { kind, title, newContent, note: note || '' };
    changes.push({ kind, title, id: p.identifier, name: p.name || '', before: p.content || '', after: newContent });
  };

  const isContentMode = cfg.mode === 'content';

  // ---------- 1. 场记引导提示词（开幕场记）：内容锚定位；缺失/停用不再硬阻断（362） ----------
  let guide = null;
  {
    const guideCandidates = prompts.filter(p => typeof p.content === 'string' && isNonEmptySetvarSceneMod(p.content));
    if (guideCandidates.length > 1) {
      errors.push(`场记引导提示词出现 ${guideCandidates.length} 份（${guideCandidates.map(p => p.name || p.identifier).join('、')}），锚点重复，拒绝执行`);
    } else if (guideCandidates.length === 1) {
      guide = guideCandidates[0];
      if (guide.identifier !== KNOWN_IDS.guide) {
        warnings.push(`场记引导提示词 id 与已知 V1028 锚点不同（${guide.identifier}），按内容锚继续`);
      }
    }
  }
  const guideEnabled = guide ? enabledOf(enabledMap, guide.identifier) : false;
  const sceneActive = !!(guide && guideEnabled);
  // 本轮是否关闭场记（决定 guide 关闭与世界支线改写；链引用改写不受它影响——见 362 语义）：
  const effClose = isContentMode || cfg.closeScene !== false || !sceneActive;
  if (!guide) {
    if (cfg.source === 'paste' && !isContentMode) {
      errors.push('找不到场记引导提示词（应含非空的 {{setvar::scene_mod::…}}；已按内容锚搜过全部提示词），' +
        '贴入模块没有可锚定的「场记之前」位置，无法保证模块+原scene同在，拒绝执行（不做半套）');
    } else {
      warnings.push('找不到场记引导提示词（应含非空的 {{setvar::scene_mod::…}}）：没有可关闭的场记来源，' +
        'scene_mod 将保持为空（若初始化变量仍在清空）；其余目标照常');
    }
  } else if (!guideEnabled) {
    warnings.push('场记引导提示词在顺序表（100001）里未启用：本轮「关闭」为空操作（scene_mod 本来就不会被置值），' +
      '不要求先开启它（362 语义）；其余目标照常');
  }
  // 关闭依赖初始化变量清空 scene_mod：找不到清空行时给具体预览提示，绝不自动写变量（362）。
  if (guide && effClose && cfg.source !== 'paste') {
    const hasInitClear = prompts.some(p => typeof p.content === 'string' && EMPTY_SETVAR_SCENE_RE.test(p.content));
    if (!hasInitClear) {
      warnings.push('找不到清空 scene_mod 的初始化行（形如 {{setvar::scene_mod::}}）：关闭场记后 scene_mod 可能残留' +
        '上一轮的值，format 的变量行仍会显示旧占位；核心不自动写变量，请确认「初始化变量」提示词里保留了该行');
    }
  }

  // ---------- 2. format 提示词（仅 replace 模式需要；content 模式不动 format） ----------
  let format = null;
  if (!isContentMode) {
    let formatCount = 0;
    for (const p of prompts) {
      const c = typeof p.content === 'string' ? p.content : '';
      const n = countOccurrences(c, GETVAR_SCENE);
      if (n > 0) { formatCount += n; if (format === null) format = p; }
    }
    if (formatCount === 0) {
      errors.push('找不到 {{getvar::scene_mod}}（format 提示词缺失或已自改删除），新占位没有落点；' +
        '期望：恰好 1 处 {{getvar::scene_mod}}，且在 {{getvar::critique_mod}} 之后——拒绝执行（不做半套）');
      format = null;
    } else if (formatCount > 1) {
      errors.push(`{{getvar::scene_mod}} 出现 ${formatCount} 处（应恰好 1 处），锚点歧义，拒绝执行`);
      format = null;
    } else if (format) {
      const c = format.content;
      const atScene = c.indexOf(GETVAR_SCENE);
      const atCritique = c.indexOf(GETVAR_CRITIQUE);
      const atContent = c.indexOf('<content>', atScene + GETVAR_SCENE.length);
      if (atCritique < 0) {
        errors.push('format 提示词里找不到 {{getvar::critique_mod}}（scene_mod 应在其后），锚点不齐，拒绝执行');
      } else if (atCritique > atScene) {
        errors.push('format 里 {{getvar::scene_mod}} 不在 {{getvar::critique_mod}} 之后，锚点错位，拒绝执行');
      } else if (atContent < 0) {
        errors.push('format 里 {{getvar::scene_mod}} 之后找不到 <content>，锚点不齐，拒绝执行');
      }
      if (!enabledOf(enabledMap, format.identifier)) {
        errors.push('format 提示词在顺序表（100001）里未启用：运行时改写永远不会生效（半套），拒绝执行；请先启用它');
      }
    }
  }

  if (errors.length > 0) {
    return planFail();
  }

  // ---------- 3. 目标标签（仅 replace 模式） ----------
  let tag = cfg.tag || '';
  if (!isContentMode) {
    if (cfg.source === 'paste') {
      const scan = scanModuleTag(cfg.moduleText);
      if (tag) {
        // 显式 tag：要求贴入文本里确实有这对标签
        const open = '<' + tag + '>', close = '</' + tag + '>';
        if (countOccurrences(cfg.moduleText, open) === 0 || countOccurrences(cfg.moduleText, close) === 0) {
          errors.push(`贴入的模块文本里找不到 <${tag}> … </${tag}> 这对标签，请核对 tag 与模块文本是否一致`);
        }
      } else if (scan.ok) {
        tag = scan.tag;
      } else {
        errors.push(...scan.errors);
      }
    }
    if (tag && (!TAG_NAME_RE.test(tag) || TAG_DENY.has(tag.toLowerCase()))) {
      errors.push('识别出的标签不适合作为输出分界，请使用字母开头的独立模块标签');
    }
    if (tag) {
      // format 里同 tag 的"已有占位"（getvar 形 / 单一成对字面占位）：
      // · existing：恰一处 → 是用户已缝模块的占位，复用（在位则不动、不在位则挪到 scene_mod 前）；
      //   不唯一或两种形态并存 → 歧义拒。
      // · paste：已有同 tag 占位 → 注入必重复 → 拒，提示改用 existing。
      // · 其它未知形态的宏不猜（不新增拒绝）。
      const gvCount = countOccurrences(format.content, '{{getvar::' + tag + '_mod}}');
      const reLit = new RegExp('`?<' + escapeRegExp(tag) + '>[ \\t]*(?:\\.{2,}|…)[ \\t]*</' + escapeRegExp(tag) + '>`?', 'g');
      const litCount = (format.content.match(reLit) || []).length;
      if (cfg.source === 'paste') {
        if (gvCount > 0 || litCount > 0) {
          errors.push(`format 里已有 <${tag}> 的占位（${gvCount > 0 ? '{{getvar::' + tag + '_mod}}' : '成对字面占位'}），贴入模块会重复；请改用 existing 模式复用现有占位`);
        }
      } else if (gvCount > 1 || litCount > 1 || (gvCount === 1 && litCount === 1)) {
        errors.push(`format 里 <${tag}> 的占位不唯一（getvar 形 ${gvCount} 处、字面对 ${litCount} 处），锚点歧义，拒绝执行`);
      }
    }
  }
  const targetTag = isContentMode ? 'content' : tag;
  if (!isContentMode && !tag) {
    errors.push('没有可用的目标标签');
  }
  if (errors.length > 0) {
    return planFail();
  }

  // ---------- 4. 场记引导的关闭（362：kind='disabled' 显式，不是 remove；原内容与顺序一字不动） ----------
  if (guide && guideEnabled && effClose) {
    const closeTitle = isContentMode
      ? '场记本轮关闭：原提示词内容与顺序一字不动，仅本轮不发送；format 的 {{getvar::scene_mod}} 行保留（由初始化变量清空为空）'
      : `场记本轮关闭：原提示词内容与顺序一字不动，仅本轮不发送；format 的 {{getvar::scene_mod}} 行保留并清空为空，新模块占位见 format 条目`;
    addEdit(guide, 'disabled', closeTitle, '',
      '原件零改动；关闭=preparePrompt 层克隆置空（宏替换前生效，setvar 不会执行）+ 集合副本兜底');
  }

  // ---------- 5. format 的改写（仅 replace 模式；{{getvar::scene_mod}} 永远保留） ----------
  if (!isContentMode) {
    const c = format.content;
    const atCritique = c.indexOf(GETVAR_CRITIQUE);
    const atScene = c.indexOf(GETVAR_SCENE);
    const open = '<' + tag + '>', close = '</' + tag + '>';
    if (countOccurrences(c, GETVAR_SCENE) !== 1) {
      errors.push('format 的 {{getvar::scene_mod}} 数量异常，拒绝执行');
    } else {
      // 已有同 tag 单一占位（getvar 形 / 字面对）→ 复用：在 critique 与 scene_mod 之间则不动，否则挪到 scene_mod 行前；
      // 没有占位（existing 无缝模块 / paste）→ 在 scene_mod 行前插入字面对占位独立一行。
      const getvarTok = '{{getvar::' + tag + '_mod}}';
      const reLit = new RegExp('`?<' + escapeRegExp(tag) + '>[ \\t]*(?:\\.{2,}|…)[ \\t]*</' + escapeRegExp(tag) + '>`?', 'g');
      const gvCount = countOccurrences(c, getvarTok);
      const litAll = c.match(reLit) || [];
      let reuseToken = null;
      let reuseDesc = '';
      if (gvCount === 1 && litAll.length === 0) { reuseToken = getvarTok; reuseDesc = '{{getvar::' + tag + '_mod}}'; }
      else if (gvCount === 0 && litAll.length === 1) { reuseToken = litAll[0]; reuseDesc = '成对字面占位'; }
      const pairToken = '`' + open + ' ... ' + close + '`';
      if (reuseToken !== null) {
        const atTok = c.indexOf(reuseToken);
        if (atCritique >= 0 && atTok > atCritique && atTok < atScene) {
          changes.push({
            kind: 'format-in-place',
            title: `format：已有 <${tag}> 占位（${reuseDesc}）已在 critique_mod 之后、scene_mod 之前，原样保留（{{getvar::scene_mod}} 永远保留）`,
            id: format.identifier,
            name: format.name || '',
            before: c,
            after: c,
          });
        } else {
          const after = moveTokenBeforeAnchor(c, GETVAR_SCENE, reuseToken);
          if (after === null
            || countOccurrences(after, reuseToken) !== 1
            || countOccurrences(after, GETVAR_SCENE) !== 1) {
            errors.push('format 复用已有占位失败（移位后数量异常），拒绝执行');
          } else {
            const atCrit2 = after.indexOf(GETVAR_CRITIQUE);
            const atTok2 = after.indexOf(reuseToken);
            const atScene2 = after.indexOf(GETVAR_SCENE);
            if (!(atTok2 > atCrit2 && atTok2 < atScene2)) {
              errors.push('format 复用占位不在 critique 之后、scene_mod 之前，拒绝执行');
            } else {
              addEdit(format, 'format-move',
                `format：已有 <${tag}> 占位（${reuseDesc}）挪到 {{getvar::scene_mod}} 行前（critique 后、scene_mod 前，各恰一次）`, after);
            }
          }
        }
      } else {
        const after = insertOwnLineBefore(c, GETVAR_SCENE, pairToken);
        if (after === null || countOccurrences(after, pairToken) !== 1 || countOccurrences(after, GETVAR_SCENE) !== 1) {
          errors.push('format 插入新占位失败（插入后数量异常），拒绝执行');
        } else {
          const atCrit2 = after.indexOf(GETVAR_CRITIQUE);
          const atPair2 = after.indexOf(open, atCritique >= 0 ? atCritique : 0);
          const atScene2 = after.indexOf(GETVAR_SCENE);
          if (atPair2 < 0 || atScene2 < 0 || !(atPair2 > atCrit2 && atPair2 < atScene2)) {
            errors.push('format 新占位不在 critique 之后、scene_mod 之前，拒绝执行');
          } else {
            addEdit(format, 'format-insert',
              `format：在 {{getvar::scene_mod}} 行前插入新占位 ${pairToken}（critique 后、scene_mod 前，恰一次；scene_mod 行保留）`, after);
          }
        }
      }
    }
  }
  if (errors.length > 0) {
    return planFail();
  }

  // ---------- 6. 世界支线定位（Events）：优先已知 id，退而求其次"非空 setvar Events_mod" ----------
  let world = prompts.find(p => p && p.identifier === KNOWN_IDS.world && typeof p.content === 'string') || null;
  if (!world) {
    const cands = prompts.filter(p => {
      if (!p || typeof p.content !== 'string') return false;
      const v = setvarValue(p.content, 'Events_mod');
      return v !== null && v.trim() !== '';
    });
    if (cands.length === 1) world = cands[0];
    else if (cands.length > 1) warnings.push(`世界支线提示词候选 ${cands.length} 份，无法唯一定位，跳过其 <scene> 引用改写`);
  }

  // ---------- 7. 链联动（362：不受 closeScene 影响——新模块本来就在 scene 前，首输出声明必须指向新标签） ----------
  // 已知 9 个链 id（稳定 ID）→ 替换其全部 <scene> 引用；未知自定义 id → 只在 首个/第一个/首标签 声明处局部换；
  // 不再按名字含"链/尾部/思维链"匹配；未启用链跳过（切链后 getPlan 每轮重建，动态适配）。
  const changedChainIds = [];
  const open = isContentMode ? '<content>' : '<' + tag + '>';
  if (!isContentMode) {
    // replace 模式：链里改的是"输出声明"层面的引用（含思维链/尾部）；场记引导与世界支线另行处理。
  }
  const skipIds = new Set();
  if (guide) skipIds.add(guide.identifier);
  if (format) skipIds.add(format.identifier);
  if (world) skipIds.add(world.identifier);
  for (const p of prompts) {
    if (!p || typeof p.content !== 'string') continue;
    if (promptEdits[p.identifier]) continue;
    if (skipIds.has(p.identifier)) continue;
    if (!enabledOf(enabledMap, p.identifier)) continue; // 只处理当前启用链；切链后 getPlan 会重建
    const sceneCount = countOccurrences(p.content, '<scene>');
    if (sceneCount === 0) continue;            // 没提场记的链尾不用动
    const isKnownChain = KNOWN_IDS.chains.includes(p.identifier);
    if (isKnownChain) {
      // <scene> 字面替换不会误伤 <scene_guide>（scene 后面不是 >）；链 prompt 里没有 guide 壳
      const newContent = p.content.split('<scene>').join(open);
      if (newContent !== p.content) {
        addEdit(p, isContentMode ? 'chain-content' : 'chain-retag',
          `链联动（稳定ID）：${p.name} 的 ${sceneCount} 处 <scene> 引用 → ${open}（其余文本原样；不受 closeScene 影响）`, newContent);
        changedChainIds.push(p.identifier);
      }
    } else {
      const r = replaceFirstDeclarations(p.content, open);
      if (r.count > 0 && r.content !== p.content) {
        addEdit(p, isContentMode ? 'chain-content' : 'chain-decl',
          `链联动（首输出声明）：${p.name || p.identifier} 的 ${r.count} 处 首个/第一个/首标签 <scene> 声明 → ${open}（其余自改文本一字不动）`, r.content);
        changedChainIds.push(p.identifier);
      } else {
        warnings.push(`启用中的提示词「${p.name || p.identifier}」含 <scene> 但没有可确认的 首个/第一个/首标签 输出声明，按约定不动（不按名字猜）`);
      }
    }
  }
  if (errors.length > 0) {
    return planFail();
  }

  // ---------- 8. 世界支线改写（仅本轮关闭场记时：scene 仍在生成则时间引用保留原样） ----------
  if (world) {
    if (!enabledOf(enabledMap, world.identifier)) {
      warnings.push('世界支线提示词未启用，跳过其 <scene> 引用改写');
    } else if (!effClose) {
      warnings.push('closeScene=false 且场记本轮仍在生成：世界支线的 <scene> 时间引用保留原样');
    } else {
      // 世界支线：改成"正文当前时间"中性描述——新模块/新状态栏未必有时间字段，不写死任何标签或字段。
      const c = world.content;
      let after = c;
      let hit = 0;
      if (after.includes('对比`<scene>`的时间')) {
        after = after.replace('对比`<scene>`的时间', '对比正文当前时间');
        hit++;
      }
      if (after.includes('格式对应`<scene>`')) {
        after = after.replace('格式对应`<scene>`', '以正文当前时间为基准');
        hit++;
      }
      const rest = countOccurrences(after, '<scene>');
      if (hit > 0 && rest === 0) {
        addEdit(world, 'world-neutral', '世界支线：<scene> 引用改为"正文当前时间"中性描述（不动其它正文）', after);
      } else if (hit > 0) {
        warnings.push(`世界支线还有 ${rest} 处 <scene> 引用未能按已知句式改写，保持不动`);
      } else {
        warnings.push('世界支线的 <scene> 引用句式与已知不同，保持不动');
      }
    }
  } else {
    warnings.push('找不到世界支线提示词，其 <scene> 引用保持原样');
  }

  // ---------- 9. 其它"启用中"且含 <scene> 却不在识别范围内的提示词：列出但绝不动 ----------
  for (const p of prompts) {
    if (!p || typeof p.content !== 'string') continue;
    if (promptEdits[p.identifier]) continue;
    if (skipIds.has(p.identifier)) continue;
    if (!enabledOf(enabledMap, p.identifier)) continue;
    if (countOccurrences(p.content, '<scene>') > 0) {
      warnings.push(`启用中的提示词「${p.name || p.identifier}」也含 <scene> 且不在识别范围内，按约定保持不动`);
    }
  }

  // ---------- 10. 正则目标（两条思考剥离/折叠）——必要目标：缺失/停用/重复/模式不符 → 拒 plan ----------
  // 否则会出现"提示词换了但正则不换"的半套状态（误吞真场记/漏剥泄漏），已批准必须硬阻断。
  const regexScripts = Array.isArray(inp.regexScripts) ? inp.regexScripts : [];
  const regexTargets = [];
  const boundaryTags = isContentMode ? ['scene', 'content'] : ['scene', tag];
  const wantWraps = [
    { find: FIND_STRIP, struct: FIND_STRIP_STRUCT, expect: FIND_STRIP, name: '爆出的思维链不发送', promptOnly: true, markdownOnly: false },
    { find: FIND_FOLD, struct: FIND_FOLD_STRUCT, expect: FIND_FOLD, name: '爆出的思维链折叠', promptOnly: false, markdownOnly: true },
  ];
  for (const w of wantWraps) {
    // 362：结构模板匹配——/…/flags 包裹与空格轻改都认；语义改动不识别（硬阻断+具体预览）。
    const hits = regexScripts.filter(s => s && normalizeFindStructure(s.findRegex) === w.struct);
    if (hits.length === 0) {
      const sceneCandidates = regexScripts
        .filter(s => s && typeof s.findRegex === 'string' && s.findRegex.includes('<scene>'))
        .map(s => `「${s.scriptName || ''}」${JSON.stringify(String(s.findRegex).slice(0, 60))}`)
        .join('、');
      errors.push(`正则脚本「${w.name}」找不到同结构 find（期望形如 ${w.expect}，允许 /…/flags 包裹与空格轻改；` +
        `改了前缀/前瞻/标签名等语义不识别）${sceneCandidates ? '；现有含 <scene> 的规则：' + sceneCandidates : '；现有规则里没有含 <scene> 的 find'}，拒绝执行（不做半套）`);
      continue;
    }
    const active = hits.filter(s => !s.disabled);
    if (active.length === 0) {
      errors.push(`正则脚本「${w.name}」同结构 find 有 ${hits.length} 条但全部停用（必要目标未启用），拒绝执行`);
      continue;
    }
    if (active.length > 1) {
      errors.push(`正则脚本「${w.name}」启用中且同结构 find 的有 ${active.length} 条（锚点重复），拒绝执行`);
      continue;
    }
    const s = active[0];
    const placementOk = Array.isArray(s.placement) && s.placement.includes(2);
    const modeOk = (!!s.promptOnly === w.promptOnly) && (!!s.markdownOnly === w.markdownOnly);
    if (!placementOk || !modeOk) {
      errors.push(`正则脚本「${w.name}」的 placement/promptOnly/markdownOnly 与已知模式不符（placement=${JSON.stringify(s.placement)} promptOnly=${!!s.promptOnly} markdownOnly=${!!s.markdownOnly}），拒绝执行`);
      continue;
    }
    // 运行时按"启用中那条的原串"派生（自改变体原串也进 targets，派生正则按结构识别）。
    if (!regexTargets.includes(s.findRegex)) regexTargets.push(s.findRegex);
    const tagDesc = boundaryTags.map(t => '<' + t + '>').join(' 或 ');
    const sameAsOriginal = normalizeFindStructure(s.findRegex) === normalizeFindStructure(w.expect) && s.findRegex === w.expect;
    changes.push({
      kind: 'regex-wrap',
      title: `正则「${w.name}」：保存/导出的 find 原串一字不动，仅运行时改用派生边界` +
        (sameAsOriginal ? '' : `（识别为同结构自改变体：${JSON.stringify(String(s.findRegex).slice(0, 60))}）`) +
        (hits.length > 1 ? `（另有 ${hits.length - 1} 条停用同结构副本，派生不生效于停用条目）` : ''),
      id: s.id || '',
      name: s.scriptName || w.name,
      before: s.findRegex,
      after: `【运行时派生·不写回文件】匹配边界 = 第一个非代码/反引号真标签（${tagDesc}），而不是贪婪的最后一个；捕获组与折叠 HTML 原样`,
    });
  }
  if (errors.length > 0) {
    return planFail();
  }

  // ---------- 11. 贴入模块的独立插入计划（362：场记位置之前；原场记槽位/顺序/内容一字不动） ----------
  let collectionInsert = null;
  if (cfg.source === 'paste' && !isContentMode) {
    const orderList = resolveOrderList(inp.order);
    const gIdx = orderList.findIndex(o => o.identifier === guide.identifier);
    const afterIds = gIdx >= 0 ? orderList.slice(gIdx + 1).map(o => o.identifier) : orderList.map(o => o.identifier);
    collectionInsert = {
      moduleId: MODULE_PROMPT_ID,
      name: '场记模块(本轮临时)',
      role: (typeof guide.role === 'string' && guide.role) ? guide.role : 'system',
      content: cfg.moduleText,
      // 场记命中索引 → order 里场记之后的逐个 id（含停用）：运行时取第一个在集合里的作为插入锚；
      // 全都不在集合里 → 追加到集合末尾（场记 order 已关也照样插入）。
      beforeIds: [guide.identifier].concat(afterIds),
    };
    changes.push({
      kind: 'module-insert',
      title: `贴入模块：在开幕场记之前临时插入独立提示词（identifier=${MODULE_PROMPT_ID}）；` +
        `原场记槽位/顺序/内容一字不动${effClose ? '，本轮场记同时关闭（kind=disabled）' : '，本轮场记保持启用（closeScene=false）'}`,
      id: guide.identifier,
      name: guide.name || '',
      before: '',
      after: `【运行时插入·不写预设】提示词集合副本中插入 <${tag}> 模块（${cfg.moduleText.length} 字），位于场记之前；` +
        `模块宏在本轮「场记位」展开（初始化变量清空之后、format 之前，既有 {{getvar::xxx_mod}} 复用占位读得到）；` +
        `场记与后继锚全停用时改在集合构建后展开（其后置 getvar 当轮读不到）`,
    });
  }

  return {
    ok: true,
    version: PLAN_VERSION,
    errors,
    warnings,
    changes,
    config: { ...cfg, tag: targetTag }, // 回写解析后的目标标签：replace=新标签；content='content'（provider/UI 直接读 config.tag）
    promptEdits,
    boundaryTags,
    regexTargets,
    guideId: guide ? guide.identifier : null,
    formatId: format ? format.identifier : null,
    worldId: world ? world.identifier : null,
    chainIds: changedChainIds,
    closeGuide: !!(guide && effClose), // 运行时关闭开关（preparePrompt 主关闭 + 集合副本兜底）
    collectionInsert,
    enabled: cfg.enabled,
  };
}

/* ========================================================================
 * transformScenePrompt
 * ===================================================================== */

/**
 * 按 plan 转换单个提示词：返回浅拷贝（保原型），输入对象永不改动。
 * 未命中目标 → 返回与输入同内容的拷贝。guide 关闭（kind='disabled'）也走这里：content → ''。
 */
export function transformScenePrompt(prompt, plan) {
  const clone = cloneShallow(prompt);
  if (!prompt || !plan || plan.ok !== true) return clone;
  const edits = plan.promptEdits;
  if (!edits || typeof prompt.identifier !== 'string') return clone;
  if (!Object.prototype.hasOwnProperty.call(edits, prompt.identifier)) return clone;
  const edit = edits[prompt.identifier];
  if (!edit || typeof edit.newContent !== 'string') return clone;
  if (typeof prompt.content === 'string' && prompt.content === edit.newContent) return clone;
  clone.content = edit.newContent;
  return clone;
}

/* ========================================================================
 * makeOmitTagRegex（362 新增：omitTag 临时规则对象，纯函数）
 * ===================================================================== */

/**
 * 生成"新标签整块不发后端提示词"的规范正则规则对象（与现行「不发送<scene>」同款形态）。
 * 纯函数：不读全局、不写任何东西；主 Agent 决定是否临时追加与何时运行（CHAT_COMPLETION_PROMPT_READY 等
 * 只对 assistant 历史副本运行）；绝不写入原 regex 数据；display / 历史写侧不运行（promptOnly 保证）。
 *
 * @param {object} config 归一化后的 plan.config 优先（含解析后的 tag）；原始配置亦可（omitTag 支持 'true'）。
 * @returns {object|null} 规则对象；omitTag!==true / content 模式 / 无可用 tag 时返回 null（调用方跳过）。
 */
export function makeOmitTagRegex(config) {
  if (!isPlainObject(config)) return null;
  const omit = config.omitTag === true || config.omitTag === 'true';
  if (!omit) return null;
  if (config.mode === 'content') return null; // content 模式没有新标签（剥的是 <scene>，用现行规则即可）
  const tag = typeof config.tag === 'string' ? config.tag.trim() : '';
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower === 'content' || lower === 'scene') return null;
  if (!TAG_NAME_RE.test(tag) || TAG_DENY.has(lower)) return null;
  return {
    scriptName: '不发送<' + tag + '>',
    findRegex: '/<' + tag + '>[\\s\\S]*?<\\/' + tag + '>/gm',
    replaceString: '',
    placement: [2],
    promptOnly: true,
    markdownOnly: false,
    runOnEdit: true,
    disabled: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    trimStrings: [],
  };
}

/* ========================================================================
 * 派生边界正则（仅两条已知 find 串；导出仅为可测可验）
 * ===================================================================== */

/**
 * 在文本里找"第一个非代码/非反引号真标签"的下标。
 * 语义与工具箱 360 的口径一致：围栏代码块（含流式未闭合）、行内反引号段、紧邻反引号的标签都不算真标签。
 * @param {string} str
 * @param {string[]} tagNames 形如 ['scene','开场']
 * @param {number} from
 * @returns {number} 下标；找不到返回 -1
 */
export function findFirstRealTag(str, tagNames, from) {
  const openers = (tagNames || []).map(t => '<' + t + '>');
  const n = str.length;
  let i = Math.max(0, from | 0);
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let inlineRun = 0; // >0 表示正处于行内代码段，值为开段反引号串长度
  let lineStart = i === 0 || str[i - 1] === '\n';
  let lineLead = 0; // 本行行首连续空格数（围栏允许 ≤3）

  while (i < n) {
    const ch = str[i];
    if (ch === '\n') {
      lineStart = true; lineLead = 0; i++; continue;
    }
    if (inFence) {
      // 围栏内：只有"行首（≤3空格）+ 同字符 ≥fenceLen 长的串"能闭合
      if (lineStart && (ch === ' ' || ch === '\t')) {
        if (++lineLead > 3) { /* 仍然在围栏里，这行不可能闭合 */ }
        i++; continue;
      }
      if (lineStart && ch === fenceChar) {
        let j = i, run = 0;
        while (j < n && str[j] === fenceChar) { run++; j++; }
        if (run >= fenceLen) {
          inFence = false; fenceChar = ''; fenceLen = 0;
          i = j;
          // 吃掉闭合围栏行剩余部分
          while (i < n && str[i] !== '\n') i++;
          lineStart = true; lineLead = 0;
          continue;
        }
        // 不是闭合串：这行当普通围栏内容
        while (i < n && str[i] !== '\n') i++;
        lineStart = true; lineLead = 0;
        continue;
      }
      while (i < n && str[i] !== '\n') i++;
      lineStart = true; lineLead = 0;
      continue;
    }
    // 不在围栏里
    if (lineStart && (ch === ' ' || ch === '\t')) {
      lineLead++; i++; continue;
    }
    if (lineStart && (ch === '`' || ch === '~')) {
      let j = i, run = 0;
      while (j < n && str[j] === ch) { run++; j++; }
      if (run >= 3) {
        inFence = true; fenceChar = ch; fenceLen = run;
        i = j;
        while (i < n && str[i] !== '\n') i++; // 信息串整行吞掉
        lineStart = true; lineLead = 0;
        continue;
      }
      // 行首短反引号串：按行内代码处理（落到下面的反引号分支逻辑）
      if (ch === '`') {
        if (inlineRun === 0) inlineRun = run;
        else if (inlineRun === run) inlineRun = 0;
        else inlineRun = run;
        i = j; lineStart = false; continue;
      }
      // 行首短波浪号：当普通字符
      lineStart = false;
      // fallthrough 不需要特殊处理
    }
    if (ch === '`') {
      let j = i, run = 0;
      while (j < n && str[j] === '`') { run++; j++; }
      if (inlineRun === 0) inlineRun = run;
      else if (inlineRun === run) inlineRun = 0;
      else inlineRun = run;
      i = j; lineStart = false; continue;
    }
    lineStart = false;
    if (ch === '<' && inlineRun === 0) {
      for (const op of openers) {
        if (str.startsWith(op, i)) {
          const after = i + op.length;
          const prev = i > 0 ? str[i - 1] : '';
          const next = after < n ? str[after] : '';
          if (prev !== '`' && next !== '`') return i; // 真标签
          break; // 紧邻反引号 → 不是真标签；不再尝试其它同名 opener（同一处）
        }
      }
      i++;
      continue;
    }
    i++;
  }
  return -1; // 含未闭合围栏走到结尾的情况：后面全是代码，没有真标签
}

/**
 * 为两条已知 find 串构造"第一个真标签边界"的派生 RegExp（RegExp 子类）。
 * 只认这两条精确串（与 plan.regexTargets 一致）；其它串返回 null（调用方回退原 get）。
 * 捕获组结构保持：折叠串的第 1 组 = 整个被折叠前缀；replaceString 的 $1 与折叠 HTML 原样生效。
 * 每次调用都新建实例，不共享 lastIndex，不污染任何缓存。
 * @param {string} findRegexString
 * @param {{tags?:string[]}} opts
 * @returns {RegExp|null}
 */
export function createBoundaryRegExp(findRegexString, opts) {
  const tags = (opts && Array.isArray(opts.tags) && opts.tags.length) ? opts.tags.slice() : ['scene'];
  // 362：按结构识别（与 plan.regexTargets 同一套归一），自改变体原串也能派生；其它串返回 null（调用方回退原 get）。
  const norm = normalizeFindStructure(findRegexString);
  let hasGroup1 = false;
  let flags = '';
  if (norm === FIND_STRIP_STRUCT) {
    hasGroup1 = false; flags = '';
  } else if (norm === FIND_FOLD_STRUCT) {
    hasGroup1 = true; flags = '';
  } else {
    return null;
  }

  class BoundaryRegExp extends RegExp {
    constructor() { super(findRegexString, flags); }
    exec(str) {
      if (typeof str !== 'string') return null;
      const f = this.flags;
      const isGlobal = f.indexOf('g') >= 0;
      const isSticky = f.indexOf('y') >= 0;
      const isM = f.indexOf('m') >= 0;
      let from = (isGlobal || isSticky) ? (this.lastIndex || 0) : 0;
      const fail = () => { if (isGlobal || isSticky) this.lastIndex = 0; return null; };
      if (from > str.length) return fail();
      // ^ 锚（无 m）：只能从 0 匹配
      if (this.source.charCodeAt(0) === 0x5e /* ^ */ && !isM && from > 0) return fail();
      let matchStart = from;
      if (this.source.charCodeAt(0) === 0x5e && isM) {
        // ^（有 m）：必须从行首匹配
        const atBol = matchStart === 0 || str[matchStart - 1] === '\n';
        if (!atBol) {
          const nl = str.indexOf('\n', matchStart);
          if (nl < 0 || nl + 1 > str.length) return fail();
          matchStart = nl + 1;
        }
      }
      const b = findFirstRealTag(str, tags, matchStart);
      if (b < 0) return fail();
      const value = str.slice(matchStart, b);
      const result = [value];
      if (hasGroup1) result.push(value);
      result.index = matchStart;
      result.input = str;
      if (isGlobal || isSticky) this.lastIndex = b;
      return result;
    }
    [Symbol.replace](str, replacement) {
      // 走标准语义（内部用本类 exec），保持 $1/命名组/函数替换行为不变
      return RegExp.prototype[Symbol.replace].call(this, str, replacement);
    }
  }

  return new BoundaryRegExp();
}

/* ========================================================================
 * createSceneRuntime
 * ===================================================================== */

const PM_MARKER = '__ywSceneBoundary__';

/**
 * 用宿主 Prompt 类的真实构造路径造"改内容的克隆"（不 import、不触碰原件）：
 * 优先条目自身的 constructor（即真实 Prompt 类）；都失败时浅拷贝兜底。
 */
function cloneWithContent(entry, content) {
  const fields = {
    identifier: entry.identifier, role: entry.role, content,
    name: entry.name, system_prompt: entry.system_prompt, position: entry.position,
    injection_position: entry.injection_position, injection_depth: entry.injection_depth,
    injection_order: entry.injection_order, forbid_overrides: entry.forbid_overrides,
    extension: entry.extension, injection_trigger: entry.injection_trigger,
  };
  try {
    if (entry && entry.constructor && typeof entry.constructor === 'function') {
      return new entry.constructor(fields);
    }
  } catch (e) { /* 落到浅拷贝兜底 */ }
  const c = cloneShallow(entry);
  c.content = content;
  return c;
}

/**
 * 创建运行时。主 Agent 用 settings.sceneBoundaryByPreset 按 presetname 提供 getPlan，一次 install。
 * getPlan/getEnabled 每次钩子调用时实时读取（主 Agent 负责每生成清缓存）。
 * installPromptManager(pm) 会幂等地顺带安装 PromptManager 集合包装（362：主 Agent 只装这一个即可）。
 * @param {{getPlan:Function, getEnabled:Function, regexProvider?:object}} deps
 */
export function createSceneRuntime(deps) {
  const state = {
    pmInstalled: false,
    collectionInstalled: false,
    regexInstalled: false,
    warnedPlan: false,
    lastCollectionOp: null,
    pendingModule: null, // 362 贴入模块的"本轮已展开实例"——preparePrompt 包装写入、集合包装读取；两个包装共享同一 state（同一 session）
    getPlan: deps && typeof deps.getPlan === 'function' ? deps.getPlan : null,
    getEnabled: deps && typeof deps.getEnabled === 'function' ? deps.getEnabled : () => false,
    regexProvider: deps ? deps.regexProvider : null,
  };

  function currentPlan() {
    if (!state.getPlan) return null;
    try {
      const plan = state.getPlan();
      state.warnedPlan = false;
      return plan && plan.ok === true ? plan : null;
    } catch (e) {
      if (!state.warnedPlan) {
        state.warnedPlan = true;
        try { console.warn('[场记替换] getPlan 调用失败，本轮按未启用处理：', e && e.message); } catch (_) { /* 忽略 */ }
      }
      return null;
    }
  }

  function isEnabled() {
    try { return !!state.getEnabled(); } catch (e) { return false; }
  }

  /**
   * 362：把贴入模块构造成真实 Prompt 实例。宏时序关键——本函数在 orig getPromptCollection 之前调用，
   * pm.preparePrompt → substituteParams 会先执行模块里的宏（setvar 先于本轮全部提示词，format 既有
   * getvar 才能读到；与初始化变量重名会被其清空）。preparePrompt 缺失时用纯对象兜底（集合写入不校验）。
   */
  function buildModulePrompt(pm, ins) {
    const fields = {
      identifier: ins.moduleId,
      name: ins.name || '场记模块(本轮临时)',
      role: ins.role || 'system',
      content: ins.content,
      system_prompt: false,
      injection_position: 0,
    };
    try {
      if (pm && typeof pm.preparePrompt === 'function') {
        const p = pm.preparePrompt(Object.assign({}, fields));
        if (p && typeof p === 'object' && p.identifier === ins.moduleId) return p;
      }
    } catch (e) { /* 落到纯对象兜底 */ }
    return Object.assign({}, fields, {
      injection_depth: 0,
      injection_order: 0,
      forbid_overrides: false,
      extension: false,
      injection_trigger: [],
      marker: false,
    });
  }

  /**
   * 362：对 getPromptCollection 返回的集合副本做本轮收尾——
   * ① 兜底关闭场记（主关闭在 preparePrompt 层、宏替换前；这里保证副本里该条内容为空）；
   * ② 把已 prepared 的贴入模块插到场记之前（不 remove 任何条目：closeScene=false 时原场记原样在列）。
   * 只改集合副本与新建条目；原件零 mutation。绝不调 pm.getPromptOrderForCharacter（位置锚来自 plan）。
   */
  function applyCollectionPlan(collection, plan, preparedModule, marker) {
    const op = { closed: false, guideAlreadyEmpty: false, inserted: false, insertAt: -1, insertMode: '', macroPrepared: !!preparedModule };
    try {
      const arr = collection.collection;
      if (plan.closeGuide && plan.guideId && typeof collection.has === 'function' && collection.has(plan.guideId)) {
        const idx = collection.index(plan.guideId);
        const entry = arr[idx];
        if (entry && typeof entry.content === 'string' && entry.content !== '') {
          const clone = cloneWithContent(entry, '');
          if (clone) {
            if (typeof collection.set === 'function') collection.set(clone, idx);
            else arr[idx] = clone;
            op.closed = true;
          }
        } else if (entry) {
          op.guideAlreadyEmpty = true; // preparePrompt 主关闭已生效
        }
      }
      if (preparedModule && plan.collectionInsert) {
        const ins = plan.collectionInsert;
        const existIdx = (typeof collection.index === 'function') ? collection.index(ins.moduleId) : -1;
        if (existIdx >= 0) {
          arr[existIdx] = preparedModule; // 防御：同轮重复出现 → 原位覆盖，绝不双份
          op.inserted = true; op.insertAt = existIdx; op.insertMode = 'replace-dup';
        } else {
          let at = -1;
          const ids = Array.isArray(ins.beforeIds) ? ins.beforeIds : [];
          for (let i = 0; i < ids.length; i++) {
            const j = (typeof collection.index === 'function') ? collection.index(ids[i]) : -1;
            if (j >= 0) { at = j; break; }
          }
          if (at < 0) at = arr.length;
          arr.splice(at, 0, preparedModule);
          op.inserted = true; op.insertAt = at;
          op.insertMode = (at < arr.length - 1) ? 'before-anchor' : 'append-end';
        }
      }
    } catch (e) {
      op.error = e && e.message;
    }
    state.lastCollectionOp = op;
    marker.lastOp = op;
    return collection;
  }

  /** 包装酒馆 PromptManager.preparePrompt：宏替换之前，对命中目标（含 guide 关闭）换克隆内容。 */
  function installPromptManager(pm) {
    if (!pm || typeof pm.preparePrompt !== 'function') return false;
    let marker;
    if (pm.preparePrompt[PM_MARKER]) {
      marker = pm.preparePrompt[PM_MARKER]; // 幂等：已包过 → 复用同一包装，只更新引用，绝不双包
    } else {
      const orig = pm.preparePrompt;
      marker = { getPlan: null, getEnabled: null, orig, warned: false, pendingModule: null };
      // 包装体只读 marker（getPlan/getEnabled 可被后续 install 更新并即时生效）
      const wrapped = function (prompt) {
        // 全参数透传：先按第一参判断是否需要转换
        const args = Array.prototype.slice.call(arguments);
        if (!args[0] || typeof args[0] !== 'object' || typeof args[0].content !== 'string') {
          return orig.apply(this, args);
        }
        let on = false;
        try { on = typeof marker.getEnabled === 'function' ? !!marker.getEnabled() : false; }
        catch (e) { on = false; }
        if (!on) return orig.apply(this, args);
        let plan = null;
        try {
          const p = typeof marker.getPlan === 'function' ? marker.getPlan() : null;
          plan = p && p.ok === true ? p : null;
        } catch (e) {
          if (!marker.warned) {
            marker.warned = true;
            try { console.warn('[场记替换] getPlan 调用失败，本轮按未启用处理：', e && e.message); } catch (_) { /* 忽略 */ }
          }
          plan = null;
        }
        if (!plan) return orig.apply(this, args);
        // 362 宏时序：贴入模块的宏要在「场记位」执行——初始化变量清空之后、format 既有 getvar 之前。
        // 场记条目被 preparePrompt 时先展开模块宏（此处构建进共享 state，orig 后由集合包装 splice 插入）；
        // 场记停用/未触发 → 退到 order 场记之后的第一个启用锚位（beforeIds 命中即构建）。
        const ins = plan.collectionInsert;
        if (ins && !state.pendingModule && typeof ins.content === 'string' && ins.content !== '') {
          const anchorId = args[0].identifier;
          const ids = Array.isArray(ins.beforeIds) ? ins.beforeIds : [];
          if (anchorId === plan.guideId || ids.indexOf(anchorId) >= 0) {
            try { state.pendingModule = buildModulePrompt(pm, ins); }
            catch (e) { state.pendingModule = null; }
          }
        }
        args[0] = transformScenePrompt(args[0], plan);
        return orig.apply(this, args);
      };
      wrapped[PM_MARKER] = marker;
      pm.preparePrompt = wrapped;
    }
    marker.getPlan = state.getPlan;
    marker.getEnabled = state.getEnabled;
    state.pmInstalled = true;
    // 362：同一 pm 顺带（幂等）安装集合包装，主 Agent 只需要调 installPromptManager 一个入口
    installPromptCollection(pm);
    return true;
  }

  /**
   * 362：包装 pm.getPromptCollection。时序：
   * ① （启用且 plan 有贴入模块时）先经 pm.preparePrompt 展开【模块】宏——必须发生在 orig 之前，
   *    否则 orig 里 format 的既有 getvar 读不到模块 setvar 的值；
   * ② orig.apply 生成集合（内部逐条 preparePrompt → transformScenePrompt 已完成 guide 关闭/format/链改写）；
   * ③ 对返回的集合副本做兜底关闭 + 模块前插（applyCollectionPlan）。
   * 不改 pm.getPromptOrderForCharacter；位置锚全部来自 plan（beforeIds）。
   */
  function installPromptCollection(pm) {
    if (!pm || typeof pm.getPromptCollection !== 'function') return false;
    let marker;
    if (pm.getPromptCollection[PM_MARKER]) {
      marker = pm.getPromptCollection[PM_MARKER]; // 幂等：已包过 → 复用同一包装，只更新引用
    } else {
      const orig = pm.getPromptCollection;
      marker = { getPlan: null, getEnabled: null, orig, lastOp: null };
      const wrapped = function (generationType) {
        let plan = null;
        let on = false;
        try { on = typeof marker.getEnabled === 'function' ? !!marker.getEnabled() : false; }
        catch (e) { on = false; }
        if (on) {
          try {
            const p = typeof marker.getPlan === 'function' ? marker.getPlan() : null;
            plan = p && p.ok === true ? p : null;
          } catch (e) { plan = null; }
        }
        const ins = plan && plan.collectionInsert;
        const needClose = plan && plan.closeGuide;
        let preparedModule = null;
        try {
          // orig 前清掉上一轮/异常残留的 pending（不跨轮复用旧模块）；orig 期间 preparePrompt
          // 包装在「场记位/首个启用锚位」构建并写入共享 state.pendingModule。
          state.pendingModule = null;
          // orig：集合与全部既有宏按原时序生成；模块宏已由 preparePrompt 包装在「场记位/
          // 首个启用锚位」注入（初始化变量清空之后、format 之前）——绝不提前到本包装之前执行。
          const result = marker.orig.apply(this, arguments);
          if (!ins && !needClose) return result;
          if (!result || typeof result !== 'object' || !Array.isArray(result.collection)) return result;
          if (ins) {
            preparedModule = state.pendingModule || null;
            state.pendingModule = null;
            if (!preparedModule && typeof ins.content === 'string' && ins.content !== '') {
              // 兜底：本轮没有任何 beforeIds 成员被 prepare（如场记与后继锚全停用）→ 集合构建后展开插入
              //（其后置 getvar 当轮读不到模块变量；format 用字面占位不依赖变量，见 plan 变更说明）。
              try { preparedModule = buildModulePrompt(pm, ins); }
              catch (e) { preparedModule = null; }
            }
          } else {
            state.pendingModule = null;
          }
          return applyCollectionPlan(result, plan, preparedModule, marker);
        } finally {
          state.pendingModule = null; // 异常也不跨轮
        }
      };
      wrapped[PM_MARKER] = marker;
      pm.getPromptCollection = wrapped;
    }
    marker.getPlan = state.getPlan;
    marker.getEnabled = state.getEnabled;
    state.collectionInstalled = true;
    return true;
  }

  /** 包装 RegexProvider.instance.get：只对 plan 识别的两条精确 find 串返回派生边界正则。 */
  function installRegexProvider() {
    const rp = state.regexProvider;
    const inst = rp && rp.instance && typeof rp.instance.get === 'function' ? rp.instance
      : (rp && typeof rp.get === 'function' ? rp : null);
    if (!inst) return false;
    let marker;
    if (inst.get && inst.get[PM_MARKER]) {
      marker = inst.get[PM_MARKER]; // 幂等：已包过 → 复用同一包装，只更新引用
    } else {
      const origGet = inst.get;
      marker = { getPlan: null, getEnabled: null, origGet, warned: false };
      const wrappedGet = function (regexString) {
        const args = Array.prototype.slice.call(arguments);
        let on = false;
        try { on = typeof marker.getEnabled === 'function' ? !!marker.getEnabled() : false; }
        catch (e) { on = false; }
        if (!on) return origGet.apply(this, args); // 关闭 → 原 get 完全恢复
        let plan = null;
        try {
          const p = typeof marker.getPlan === 'function' ? marker.getPlan() : null;
          plan = p && p.ok === true ? p : null;
        } catch (e) { plan = null; }
        if (!plan) return origGet.apply(this, args);
        const targets = plan.regexTargets || [];
        if (typeof regexString === 'string' && targets.indexOf(regexString) >= 0) {
          const derived = createBoundaryRegExp(regexString, { tags: plan.boundaryTags });
          if (derived) return derived; // 每次 get 新实例：零 lastIndex/缓存污染
        }
        return origGet.apply(this, args);
      };
      wrappedGet[PM_MARKER] = marker;
      inst.get = wrappedGet;
    }
    marker.getPlan = state.getPlan;
    marker.getEnabled = state.getEnabled;
    state.regexInstalled = true;
    return true;
  }

  /** 边界标记（给 UI）：enabled 且 plan 有效 → '<scene>,<tag>' 字符串；否则原样返回 fallback。 */
  function boundaryMarkers(fallback) {
    if (!isEnabled()) return fallback;
    const plan = currentPlan();
    if (!plan) return fallback;
    const tags = Array.isArray(plan.boundaryTags) && plan.boundaryTags.length ? plan.boundaryTags : ['scene'];
    return tags.map(t => '<' + t + '>').join(',');
  }

  /** 轻量快照（调试/接线自检用，可选能力）。 */
  function snapshot() {
    const plan = isEnabled() ? currentPlan() : null;
    return {
      version: PLAN_VERSION,
      installed: {
        promptManager: state.pmInstalled,
        promptCollection: state.collectionInstalled,
        regexProvider: state.regexInstalled,
      },
      enabled: isEnabled(),
      planOk: !!(plan && plan.ok),
      changeCount: plan ? (plan.changes || []).length : 0,
      boundaryTags: plan ? plan.boundaryTags : [],
      regexTargetCount: plan ? (plan.regexTargets || []).length : 0,
      closeGuide: plan ? !!plan.closeGuide : false,
      hasInsert: !!(plan && plan.collectionInsert),
      lastCollectionOp: state.lastCollectionOp,
      config: plan ? plan.config : null,
    };
  }

  const api = { installPromptManager, installPromptCollection, installRegexProvider, boundaryMarkers, snapshot };
  return api;
}

/* 完结：本文件不写任何全局状态（除自身模块作用域），不碰 DOM / oai_settings / 预设 / 正则原件。 */
