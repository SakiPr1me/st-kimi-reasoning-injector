/* ==========================================================================
   余小温主控 · 预设控件桥（console-plugin）
   --------------------------------------------------------------------------
   职责：
   - 把 V1028 首批条目画成一组紧凑控件（class 前缀 ywpc-）；
   - 所有状态以当前 oai_settings.prompt_order 里 character_id === 100001 的
     那一组为唯一权威；本文件不内置任何默认开/关样例。
   - 保存：inlineInsertSavePreset === false 时只 saveSettings()；
     === true 时再 debounce 调主 saveCurrentPreset({name, expectedIdentity, reason})。
     每次操作带 token（name + oai 引用 + 100001 顺序组引用），切预设立即取消。
   - 字数：只改 oai_settings.prompts 里「🔢字数要求」这一条的两处句子，
     解析/校验/写入统一走 preset-length.js（以上=min，以内=range），失败不写内存。
   - 坏数据只做局部禁用 + 人话，不抛、不白屏、不改读路径。
   ========================================================================== */

import {
  PRESET_CONTROLS_VERSION,
  CHARACTER_ID,
  LENGTH_PROMPT_ID,
  STORE_PROMPT_ALIASES,
  ID,
  SECTIONS,
  SECTION_ORDER,
  FIXED_SHORTCUT_IDS,
  DEFAULT_COMMON_IDS,
  THEATER_CHILDREN,
  ALL_KNOWN_IDS,
  PROMPT_NAMES,
  isV1028Name,
  shortLabelFor,
  emojiPrefix,
  withEmoji,
  sectionsForOrder,
  PARAGRAPH_RADIO_KEY,
  PARAGRAPH_PROMPT_IDS,
  NARRATION_RADIO_KEY,
  NARRATION_PROMPT_IDS,
  TOOLBOX_FLAG_RAND_HEAD,
  TOOLBOX_FLAG_KEYS,
} from './preset-control-defs.js?b=v1.4.28';
import { readEditableLengthRule, replaceLengthRule } from './preset-length.js?b=v1.0.1';
import {
  LAYOUT_SETTINGS_KEY,
  LAYOUT_VERSION,
  presetLayoutKey,
  layoutStoreOf,
  readSavedLayout,
  writeSavedLayout,
  clearSavedLayout,
  hasSavedLayout,
  createBaseLayout,
  resolveLayout,
  serializeLayout,
  layoutSignature,
  controlUid,
  controlRef,
  refKey,
  normalizeLayoutWidth,
  normalizeOptionLayout,
  resolveOptionLayout,
} from './preset-layout.js?b=v1.4.0';

export const PRESET_CONTROLS_VERSION_VALUE = PRESET_CONTROLS_VERSION;
export const SAVE_DEBOUNCE_MS = 180;
export const STYLE_ID = 'ywpc-style';
/* 首页常用钉选的设置键：对象，键 = presetLayoutKey(预设名, 100001)，值 = 有序 pin 数组。
   与主 index 的 defaultSettings.presetControlHomePins 同名；这里只读写，不创建默认值。 */
export const HOME_PINS_SETTINGS_KEY = 'presetControlHomePins';
/* 首页常用默认升级标记（每 presetLayoutKey 一项；由主 index 的 defaultSettings 同源补 {}）。
   也用于“常用里默认两项被用户移除后不再复活”。 */
export const HOME_DEFAULTS_VERSION_KEY = 'presetControlHomeDefaultsVersion';
export const COMMON_HIDDEN_SETTINGS_KEY = 'presetControlCommonHidden';
const HOME_DEFAULTS_VERSION = 8;
const HOME_THINKING_PIN = Object.freeze({ type: 'combo', key: 'think.model' });
/* 默认首页的一枚半行空白块：放在 NSFW 状态快照之后、主线之前，让四项剧情开关
   从下一行开始。新装派生与 v7 一次性升级共用这一份定义；用户移走/删除后不复活。 */
const HOME_MAINLINE_SPACER_PIN = Object.freeze({
  type: 'spacer',
  key: 'spacer:mainline',
  uid: 'spacer:mainline',
  width: 6,
});
/* 可吸附的四档宽度（十二等分网格）。 */
const WIDTH_STEPS = Object.freeze([3, 4, 6, 12]);
const WIDTH_STEP_LABELS = Object.freeze({ 3: '1/4', 4: '1/3', 6: '1/2', 12: '全行' });
/* 分组横向分页：一页最多放这么多分组，超出用 ‹ › 翻页；不换行、不把顶栏撑高。 */
const EDIT_GROUPS_PER_PAGE = 5;
/* 添加内容菜单里「已有条目」最多列这么多行；超过提示输入关键词缩小范围，
   避免 351 那样一次铺 129 行把菜单拉到几千像素。 */
const EDIT_ADD_PROMPT_LIMIT = 8;
/* 2026-11-14：首页默认补齐破限 Part 1 / 破限 Part 2 / 插小说防道歉。
   随机头部改为独立 home pin：可单独添加、调序、移除；不再只做 niah 的伴生。
   旧版只有 niah 伴生、没有随机头 pin 的已存首页，v6 一次性补一枚紧接 niah，
   兼容旧的自动显示；之后用户删掉就不再复活。 */
const HOME_EXTRA_PIN_IDS = Object.freeze([ID.break1, ID.break2, ID.niah]);
const HOME_RAND_HEAD_PIN = Object.freeze({ type: 'toolboxFlag', key: TOOLBOX_FLAG_RAND_HEAD });
/* 2026-11-14 追加：NSFW 指南整组、轻G向、呻吟爱心、NSFW 状态快照、
   主线/感情线/防秒车/结尾钩子、剧情基本档整组、加减速叠加整组。
   新装派生与 v6 升级补齐共用这一份顺序；缺项照旧显示禁用，不按名字猜。 */
const HOME_DEFAULT_EXTRA_PINS = Object.freeze([
  Object.freeze({ type: 'radio', key: 'nsfw.orientation' }),
  Object.freeze({ type: 'prompt', id: ID.wLightG }),
  Object.freeze({ type: 'prompt', id: ID.moanHeart }),
  Object.freeze({ type: 'prompt', id: ID.nsfwSnapshot }),
  Object.freeze({ type: 'prompt', id: ID.mainline }),
  Object.freeze({ type: 'prompt', id: ID.romance }),
  Object.freeze({ type: 'prompt', id: ID.antiRush }),
  Object.freeze({ type: 'prompt', id: ID.hook }),
  Object.freeze({ type: 'radio', key: 'plot.pace_base' }),
  Object.freeze({ type: 'radio', key: 'plot.pace_boost' }),
]);
/* 完整预设页 plot 段：这四项用既有 shortcut 两列格，不新造视觉。 */
const PLOT_LINE_TOGGLE_IDS = new Set([ID.mainline, ID.romance, ID.antiRush, ID.hook]);
const PIN_TYPES = new Set(['prompt', 'radio', 'combo', 'comboToggle', 'word', 'toolboxFlag', 'spacer']);
/* 选条目查找面板：默认收起，分组保持在前面、点卡直接编辑。
   展开后先只列 8 条，超过给「显示全部」；全量结果放进限高小面板，不把分组推到很后。 */
const CONTENT_PICK_RESULT_LIMIT = 8;
/* 正文编辑的会话草稿：模块级，只存在内存；页面切走/dispose 后同一浏览器会话里
   重新打开同一条时仍能接着改。保存成功、明确放弃才删除。 */
const PROMPT_CONTENT_DRAFTS = new Map();
const PROMPT_CONTENT_DRAFT_LIMIT = 24;

const THEATER_CHILD_SET = new Set(THEATER_CHILDREN);
const FIXED_SET = new Set(FIXED_SHORTCUT_IDS);
const KNOWN_ID_SET = new Set(ALL_KNOWN_IDS);
const NON_TOGGLE_ID_SET = new Set(['main','nsfw','jailbreak','chatHistory','worldInfoBefore','worldInfoAfter','personaDescription','charDescription','charPersonality','scenario','dialogueExamples','enhanceDefinitions']);
/* 工具箱 flag 控件：只认显式白名单；它们不是预设条目，不进入 prompt_order。 */
const TOOLBOX_FLAG_SET = new Set(TOOLBOX_FLAG_KEYS);
const TOOLBOX_FLAG_BY_KEY = (() => {
  const map = new Map();
  for (const section of SECTIONS) {
    for (const control of section.controls) {
      if (control && control.kind === 'toolboxFlag' && control.flag) map.set(control.flag, control);
    }
  }
  return map;
})();
const RAND_HEAD_DEF = TOOLBOX_FLAG_BY_KEY.get(TOOLBOX_FLAG_RAND_HEAD) || null;

/* 1.3.0 退役的 info 控件（旧 defs 的准确 ref key = builtin:info:7caqe4）。
   旧保存布局仍可能引用它；只在 materialize/渲染时过滤，不改存储的 layout。
   其它真正缺项（prompt/自定义/内置）一律保留，照旧显示禁用。 */
const RETIRED_LAYOUT_REF_KEYS = new Set(['builtin:info:7caqe4']);

function isRetiredLayoutControl(control) {
  if (!control) return false;
  const ref = controlRef(control);
  return !!ref && ref.type === 'builtin' && RETIRED_LAYOUT_REF_KEYS.has(refKey(ref));
}

function filterRetiredLayoutControls(sections) {
  const list = Array.isArray(sections) ? sections : [];
  const out = [];
  for (const section of list) {
    if (!section) continue;
    const controls = (section.controls || []).filter(control => !isRetiredLayoutControl(control));
    out.push(controls.length === (section.controls || []).length
      ? section
      : Object.assign({}, section, { controls }));
  }
  return out;
}

const TOGGLE_DEF_BY_ID = (() => {
  const map = new Map();
  for (const section of SECTIONS) {
    for (const control of section.controls) {
      if (control && (control.kind === 'toggle' || control.kind === 'action')) {
        map.set(control.id, control);
      }
    }
  }
  return map;
})();

const RADIO_BY_KEY = (() => {
  const map = new Map();
  for (const section of SECTIONS) {
    for (const control of section.controls) {
      if (control && control.kind === 'radio') map.set(control.key, control);
      if (control && control.kind === 'combo') map.set(control.key, control);
    }
  }
  return map;
})();

const COMBO_TOGGLE_BY_KEY = (() => {
  const map = new Map();
  for (const section of SECTIONS) {
    for (const control of section.controls) {
      if (control && control.kind === 'comboToggle') map.set(control.key, control);
    }
  }
  return map;
})();

/* --------------------------------------------------------------------------
   样式：只此一份字符串，挂 <style id="ywpc-style">；不另出 CSS 镜像。
   全部选择器收在 .ywpc-root 下，不定义全局变量/元素规则。
   -------------------------------------------------------------------------- */
export const PRESET_CONTROLS_CSS = `
.ywpc-root{
  --ywpc-accent:var(--SmartThemeQuoteColor,#7f9b84);
  --ywpc-line:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 18%,transparent);
  --ywpc-line-strong:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 30%,transparent);
  --ywpc-surface:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 5%,transparent);
  --ywpc-surface-2:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 9%,transparent);
  --ywpc-muted:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 66%,transparent);
  --ywpc-warn:var(--SmartThemeEmColor,#b5651d);
  box-sizing:border-box;color:var(--SmartThemeBodyColor,#222);font-size:13px;line-height:1.45;
  display:flex;flex-direction:column;gap:10px;min-width:0;
}
.ywpc-root *{box-sizing:border-box}
.ywpc-root button,.ywpc-root input{font:inherit;color:inherit}
.ywpc-root button{
  margin:0;padding:0;border:0;background:none;text-align:left;cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}
.ywpc-root button:disabled{cursor:not-allowed}
.ywpc-root :focus-visible{outline:2px solid var(--ywpc-accent);outline-offset:2px}
.ywpc-head{display:flex;flex-direction:column;gap:4px;min-width:0}
.ywpc-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.ywpc-title{font-size:14px;font-weight:650;letter-spacing:.01em}
.ywpc-badge{
  flex:none;padding:1px 7px;border-radius:999px;font-size:11px;line-height:1.6;font-weight:600;
  color:var(--SmartThemeBodyColor,#222);
  border:1px solid color-mix(in srgb,var(--ywpc-accent) 42%,transparent);
  background:color-mix(in srgb,var(--ywpc-accent) 10%,transparent);white-space:nowrap;
}
.ywpc-badge[data-ywpc-badge="compat"]{color:var(--ywpc-muted);border-color:var(--ywpc-line);background:var(--ywpc-surface)}
.ywpc-status{margin:0;color:var(--ywpc-muted);font-size:12px;min-height:1.4em;overflow-wrap:anywhere}
.ywpc-body{display:flex;flex-direction:column;gap:12px;min-width:0}
.ywpc-sec{display:block;border-top:1px solid var(--ywpc-line);padding-top:10px;min-width:0}
.ywpc-sec:first-child{border-top:0;padding-top:0}
.ywpc-sec-head{
  display:flex;align-items:center;gap:8px;min-width:0;min-height:34px;
  list-style:none;cursor:pointer;user-select:none;
}
.ywpc-sec-head::-webkit-details-marker{display:none}
.ywpc-sec-head::marker{content:""}
.ywpc-sec-head::after{
  content:"▸";flex:none;margin-left:auto;color:var(--ywpc-muted);font-size:11px;line-height:1;
  transition:transform .14s ease;
}
.ywpc-sec[open]>.ywpc-sec-head::after{transform:rotate(90deg)}
.ywpc-sec-head:hover .ywpc-sec-title{
  color:var(--SmartThemeBodyColor,#222);
  text-decoration:underline;
  text-underline-offset:3px;
  text-decoration-color:var(--ywpc-accent);
}
.ywpc-sec-title{margin:0;font-size:13px;font-weight:650;letter-spacing:.02em}
.ywpc-sec-count{margin-left:auto;color:var(--ywpc-muted);font-size:11px;white-space:nowrap}
.ywpc-sec-note{margin:3px 0 0;color:var(--ywpc-muted);font-size:11.5px;line-height:1.45}
.ywpc-sec-body{display:flex;flex-direction:column;gap:7px;margin-top:7px;min-width:0}
.ywpc-row{display:flex;flex-direction:column;gap:5px;min-width:0}
.ywpc-note:empty,.ywpc-toggle-sub:empty,.ywpc-seg-sub:empty{display:none}
.ywpc-control-label{color:var(--ywpc-muted);font-size:11.5px;letter-spacing:.02em}
/* 写作页「其它要求」小标题：只是分组文字，不是控件/输入，不参与布局存储。 */
.ywpc-rest-head{margin:1px 0 0;color:var(--ywpc-muted);font-size:11.5px;font-weight:600;letter-spacing:.02em;line-height:1.3}
.ywpc-toggle{
  display:flex;align-items:center;gap:10px;width:100%;min-height:38px;
  padding:7px 9px;border:1px solid var(--ywpc-line);border-radius:9px;
  background:var(--ywpc-surface);transition:border-color .14s ease,background .14s ease;
}
.ywpc-toggle:hover:not(:disabled){border-color:var(--ywpc-line-strong);background:var(--ywpc-surface-2)}
.ywpc-toggle[aria-checked="true"]{
  border-color:color-mix(in srgb,var(--ywpc-accent) 48%,var(--ywpc-line));
  background:color-mix(in srgb,var(--ywpc-accent) 9%,var(--ywpc-surface));
}
.ywpc-toggle-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.ywpc-toggle-label{font-size:12.5px;font-weight:560;overflow-wrap:anywhere}
.ywpc-toggle-sub{color:var(--ywpc-muted);font-size:11px;line-height:1.35;overflow-wrap:anywhere}
.ywpc-switch{
  flex:none;position:relative;width:32px;height:18px;border-radius:999px;
  border:1px solid var(--ywpc-line-strong);background:var(--ywpc-surface-2);
  transition:background .14s ease,border-color .14s ease;
}
.ywpc-knob{
  position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;
  background:var(--ywpc-muted);transition:transform .14s ease,background .14s ease;
}
.ywpc-toggle[aria-checked="true"] .ywpc-switch{
  border-color:color-mix(in srgb,var(--ywpc-accent) 62%,var(--ywpc-line));
  background:color-mix(in srgb,var(--ywpc-accent) 30%,transparent);
}
.ywpc-toggle[aria-checked="true"] .ywpc-knob{transform:translateX(14px);background:var(--ywpc-accent)}
.ywpc-toggle[aria-checked="mixed"] .ywpc-switch{background:color-mix(in srgb,var(--ywpc-accent) 18%,transparent)}
.ywpc-toggle[aria-checked="mixed"] .ywpc-knob{transform:translateX(7px);background:var(--ywpc-accent)}
.ywpc-missing{opacity:.62;border-style:dashed}
.ywpc-missing .ywpc-toggle-sub{color:var(--ywpc-warn)}
.ywpc-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:6px;min-width:0}
.ywpc-seg-btn{
  display:flex;flex-direction:column;gap:1px;justify-content:center;min-height:34px;
  padding:6px 8px;border:1px solid var(--ywpc-line);border-radius:8px;
  background:var(--ywpc-surface);transition:border-color .14s ease,background .14s ease;
}
.ywpc-seg-btn:hover:not(:disabled){border-color:var(--ywpc-line-strong);background:var(--ywpc-surface-2)}
.ywpc-seg-btn[aria-checked="true"]{
  border-color:color-mix(in srgb,var(--ywpc-accent) 58%,var(--ywpc-line));
  background:color-mix(in srgb,var(--ywpc-accent) 12%,var(--ywpc-surface));
}
.ywpc-seg-label{font-size:12px;font-weight:560;overflow-wrap:anywhere}
.ywpc-seg-sub{color:var(--ywpc-muted);font-size:10.5px;line-height:1.3}
.ywpc-seg-btn[aria-checked="true"] .ywpc-seg-label{
  color:var(--SmartThemeBodyColor,#222);font-weight:650;
}
.ywpc-combo{display:grid;grid-template-columns:1fr;gap:6px;min-width:0}
.ywpc-combo .ywpc-seg-btn{min-height:38px;padding:6px 9px}
.ywpc-combo .ywpc-seg-label{font-weight:600}
.ywpc-note{margin:0;color:var(--ywpc-muted);font-size:11px;line-height:1.4}
.ywpc-warn{color:var(--ywpc-warn)}
.ywpc-multi{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;min-width:0}
.ywpc-chip{
  display:flex;align-items:center;gap:7px;min-height:32px;padding:5px 8px;
  border:1px solid var(--ywpc-line);border-radius:8px;background:var(--ywpc-surface);
  font-size:11.5px;overflow-wrap:anywhere;
}
.ywpc-chip:hover:not(:disabled){border-color:var(--ywpc-line-strong);background:var(--ywpc-surface-2)}
.ywpc-chip[aria-checked="true"]{
  border-color:color-mix(in srgb,var(--ywpc-accent) 52%,var(--ywpc-line));
  background:color-mix(in srgb,var(--ywpc-accent) 11%,var(--ywpc-surface));
}
.ywpc-chip-check{
  flex:none;width:14px;height:14px;border-radius:3px;
  border:1px solid var(--ywpc-line-strong);background:transparent;
  display:inline-flex;align-items:center;justify-content:center;
  color:transparent;font-size:10px;line-height:1;font-weight:700;
}
.ywpc-chip[aria-checked="true"] .ywpc-chip-check{
  border-color:var(--ywpc-accent);
  background:var(--ywpc-accent);
  color:#fff;
}
.ywpc-chip[aria-checked="true"] .ywpc-chip-check::after{content:"✓"}
.ywpc-chip[data-ywpc-conflict="1"]{border-color:color-mix(in srgb,var(--ywpc-warn) 52%,var(--ywpc-line))}
.ywpc-word{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ywpc-word-input{
  width:104px;min-height:34px;padding:5px 8px;border:1px solid var(--ywpc-line);
  border-radius:8px;background:var(--ywpc-surface);font-variant-numeric:tabular-nums;
}
.ywpc-word-input:disabled{opacity:.6}
.ywpc-word-unit{color:var(--ywpc-muted);font-size:11.5px;margin-left:-2px}
.ywpc-word-step{
  flex:none;width:32px;height:32px;border:1px solid var(--ywpc-line);border-radius:8px;
  background:var(--ywpc-surface);display:inline-flex;align-items:center;justify-content:center;
  font-size:15px;line-height:1;
}
.ywpc-word-step:hover:not(:disabled){border-color:var(--ywpc-line-strong);background:var(--ywpc-surface-2)}
/* 字数二选一：复用 seg 视觉，两列固定，手机也不横溢。 */
.ywpc-word-mode{grid-template-columns:repeat(2,minmax(0,1fr))}
.ywpc-word-mode .ywpc-seg-label{font-weight:600}
.ywpc-word-mode .ywpc-seg-btn{align-items:center;text-align:center}
.ywpc-word-num{display:inline-flex;align-items:center;gap:4px;min-width:0}
.ywpc-word-sep{color:var(--ywpc-muted);font-size:12px;flex:none}
.ywpc-word-sep-msg{margin:0;color:var(--ywpc-muted);font-size:11px;line-height:1.4}
.ywpc-word .ywpc-word-input{width:88px}
.ywpc-word-hint{margin:0;color:var(--ywpc-muted);font-size:11px;line-height:1.4;min-height:1.4em}
.ywpc-shortcuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;min-width:0}
.ywpc-shortcut{display:flex;align-items:stretch;gap:4px;min-width:0}
.ywpc-shortcut .ywpc-toggle{min-height:36px;padding:6px 8px}
/* niah 与随机头部固定同一行：首页跨两列、完整页半行，两卡等宽。 */
.ywpc-inline-pair{
  grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  gap:6px;min-width:0;
}
.ywpc-inline-pair>.ywpc-shortcut{min-width:0}
.ywpc-shortcut-tag{
  flex:none;align-self:center;color:var(--SmartThemeBodyColor,#222);font-size:10px;
  padding:1px 5px;border:1px solid var(--ywpc-line);border-radius:999px;
}
.ywpc-shortcut-remove{
  flex:none;width:32px;min-height:36px;border:1px solid var(--ywpc-line);border-radius:8px;
  background:var(--ywpc-surface);display:inline-flex;align-items:center;justify-content:center;
  color:var(--ywpc-muted);font-size:15px;
}
.ywpc-shortcut-remove:hover{color:var(--ywpc-warn);border-color:color-mix(in srgb,var(--ywpc-warn) 45%,var(--ywpc-line))}
.ywpc-empty{margin:0;color:var(--ywpc-muted);font-size:11.5px;line-height:1.45}
.ywpc-add{
  display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:32px;
  padding:5px 10px;border:1px dashed var(--ywpc-line-strong);border-radius:8px;
  color:var(--ywpc-muted);font-size:11.5px;background:transparent;
}
.ywpc-add:hover{color:var(--SmartThemeBodyColor,#222);border-color:color-mix(in srgb,var(--ywpc-accent) 55%,var(--ywpc-line))}
.ywpc-add[data-ywpc-action="add-shortcut"]{
  display:flex;width:100%;justify-content:flex-start;min-height:34px;padding:6px 10px;
  border-style:solid;border-color:var(--ywpc-line-strong);border-radius:9px;
  background:var(--ywpc-surface);color:color-mix(in srgb,var(--SmartThemeBodyColor,#222) 86%,transparent);
  font-size:12px;font-weight:560;
}
.ywpc-picker{
  display:flex;flex-direction:column;gap:7px;padding:8px;border:1px solid var(--ywpc-line);
  border-radius:10px;background:var(--ywpc-surface);min-width:0;
}
.ywpc-picker-head{display:flex;align-items:center;gap:6px;min-width:0}
.ywpc-picker-search{
  flex:1;min-width:0;min-height:32px;padding:5px 8px;border:1px solid var(--ywpc-line);
  border-radius:8px;background:var(--ywpc-surface-2);
}
.ywpc-picker-list{display:flex;flex-direction:column;gap:5px;min-width:0}
.ywpc-pick-row{
  display:flex;align-items:center;gap:8px;padding:5px 6px;border:1px solid var(--ywpc-line);
  border-radius:8px;background:var(--ywpc-surface);
}
.ywpc-pick-main{display:flex;flex-direction:column;gap:0;min-width:0;flex:1}
.ywpc-pick-label{font-size:11.5px;font-weight:540;overflow-wrap:anywhere}
.ywpc-pick-sub{color:var(--ywpc-muted);font-size:10.5px;line-height:1.3}
.ywpc-pick-add{
  flex:none;min-height:32px;padding:3px 9px;border:1px solid var(--ywpc-line-strong);
  border-radius:7px;background:var(--ywpc-surface-2);font-size:11px;
}
.ywpc-pick-add:hover:not(:disabled){border-color:var(--ywpc-accent);color:var(--SmartThemeBodyColor,#222)}
.ywpc-pick-add:disabled{opacity:.5}
.ywpc-toast{
  margin:0;min-height:1.4em;color:var(--ywpc-muted);font-size:11.5px;line-height:1.4;
  overflow-wrap:anywhere;
}
.ywpc-toast[data-tone="ok"]{color:var(--SmartThemeBodyColor,#222)}
.ywpc-toast[data-tone="warn"]{color:var(--ywpc-warn)}
.ywpc-toast[data-tone="error"]{color:var(--ywpc-warn);font-weight:600}
.ywpc-compact .ywpc-sec-note,.ywpc-compact .ywpc-toggle-sub,.ywpc-compact .ywpc-seg-sub{display:none}
.ywpc-compact .ywpc-body{gap:9px}
.ywpc-compact .ywpc-sec{padding-top:8px}
.ywpc-compact .ywpc-toggle{min-height:34px;padding:5px 8px}
.ywpc-compact .ywpc-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}
.ywpc-status-compact{margin:0;font-size:11.5px;line-height:1.4}
.ywpc-sec-icon{flex:none;width:1.15em;text-align:center;font-size:13px;line-height:1}
.ywpc-layout-entry{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0;border:0;background:transparent;min-width:0}
.ywpc-layout-entry .ywpc-edit-btn{color:var(--SmartThemeBodyColor,#222);border-color:var(--ywpc-line-strong);background:var(--ywpc-surface);min-height:32px;padding:4px 10px;font-weight:560}
.ywpc-layout-entry-text{margin:0;color:var(--ywpc-muted);font-size:11.5px;line-height:1.4;flex:1;min-width:140px}
.ywpc-edit-bar{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--ywpc-line-strong);border-radius:10px;background:var(--ywpc-surface);min-width:0}
.ywpc-edit-head{display:flex;flex-direction:column;gap:2px;min-width:0}
.ywpc-edit-title{font-size:12.5px;font-weight:650}
.ywpc-edit-hint{color:var(--ywpc-muted);font-size:11px;line-height:1.4}
.ywpc-edit-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ywpc-edit-btn{min-height:32px;padding:4px 10px;border:1px solid var(--ywpc-line-strong);border-radius:8px;background:var(--ywpc-surface-2);font-size:11.5px;line-height:1.3}
.ywpc-edit-btn:hover:not(:disabled){border-color:var(--ywpc-accent)}
.ywpc-edit-btn:disabled{opacity:.5}
.ywpc-edit-primary{border-color:color-mix(in srgb,var(--ywpc-accent) 55%,var(--ywpc-line));background:color-mix(in srgb,var(--ywpc-accent) 14%,var(--ywpc-surface))}
.ywpc-edit-warn{color:var(--ywpc-warn);border-color:color-mix(in srgb,var(--ywpc-warn) 45%,var(--ywpc-line))}
.ywpc-edit-small{min-height:30px;padding:3px 8px;font-size:11px}
.ywpc-edit-iconbtn{flex:none;width:30px;min-height:30px;border:1px solid var(--ywpc-line);border-radius:7px;background:var(--ywpc-surface-2);display:inline-flex;align-items:center;justify-content:center;font-size:13px;line-height:1}
.ywpc-edit-iconbtn:hover:not(:disabled){border-color:var(--ywpc-line-strong)}
.ywpc-edit-iconbtn:disabled{opacity:.35}
.ywpc-edit-danger{color:var(--ywpc-warn)}
.ywpc-edit-danger:hover:not(:disabled){border-color:color-mix(in srgb,var(--ywpc-warn) 55%,var(--ywpc-line))}
.ywpc-edit-add-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ywpc-edit-input{min-height:32px;padding:4px 8px;border:1px solid var(--ywpc-line);border-radius:7px;background:var(--ywpc-surface-2);font-size:12px;min-width:0;flex:1}
.ywpc-edit-select{min-height:30px;max-width:190px;padding:3px 6px;border:1px solid var(--ywpc-line);border-radius:7px;background:var(--ywpc-surface-2);font-size:11px;min-width:0}
.ywpc-edit-error{margin:0;color:var(--ywpc-warn);font-size:11.5px;line-height:1.45;font-weight:600;overflow-wrap:anywhere}
.ywpc-edit-note{margin:0;color:var(--ywpc-muted);font-size:11px;line-height:1.4}
/* 正文编辑：选条目面板复用 picker 视觉，编辑页复用 edit-bar；正文框保持大而清楚。 */
.ywpc-content-picker{gap:8px}
.ywpc-content-picker .ywpc-edit-small{width:auto;align-self:flex-start}
.ywpc-content-picker .ywpc-content-head{flex-wrap:wrap}
.ywpc-content-hint{flex:1;min-width:120px;margin:0;color:var(--SmartThemeBodyColor,#222);font-size:11.5px;line-height:1.4;overflow-wrap:anywhere}
.ywpc-content-find{display:flex;flex-direction:column;gap:6px;min-width:0}
.ywpc-content-list{max-height:420px;overflow-y:auto;overscroll-behavior:contain;min-width:0}
.ywpc-content-list{max-height:min(60vh,420px)}
.ywpc-content-show-all{align-self:flex-start}
.ywpc-content-textarea{
  width:100%;min-height:220px;padding:8px 9px;border:1px solid var(--ywpc-line-strong);
  border-radius:8px;background:var(--ywpc-surface-2);color:var(--SmartThemeBodyColor,#222);
  font-family:inherit;font-size:12.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;
  resize:vertical;
}
.ywpc-content-textarea:focus{outline:2px solid var(--ywpc-accent);outline-offset:1px}
.ywpc-content-status{margin:0;color:var(--SmartThemeBodyColor,#222);font-size:11px;line-height:1.4}
/* 图审收口：新增 content 小字一律用正文色（≥4.5）；只限这几处，不动普通布局 muted 族。 */
.ywpc-content-editor .ywpc-edit-note{color:var(--SmartThemeBodyColor,#222)}
.ywpc-content-editor .ywpc-edit-hint{color:var(--SmartThemeBodyColor,#222)}
.ywpc-picker-search[data-ywpc-content-search]::placeholder{color:var(--SmartThemeBodyColor,#222);opacity:1}
.ywpc-content-status[data-dirty="1"]{color:var(--ywpc-warn);font-weight:600}
.ywpc-content-confirm{
  display:flex;flex-direction:column;gap:6px;padding:8px;min-width:0;
  border:1px solid color-mix(in srgb,var(--ywpc-warn) 45%,var(--ywpc-line));border-radius:8px;
  background:color-mix(in srgb,var(--ywpc-warn) 8%,var(--ywpc-surface));
}
.ywpc-content-confirm-text{margin:0;color:var(--ywpc-warn);font-size:11.5px;line-height:1.45;font-weight:600}
.ywpc-edit-actions[hidden],.ywpc-content-confirm[hidden]{display:none!important}
.ywpc-sec-editbar{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0;margin-bottom:2px}
.ywpc-edit-section-title{flex:1;min-width:120px;font-weight:600}
.ywpc-dragging{opacity:.45}
.ywpc-edit-card{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--ywpc-line);border-radius:9px;background:var(--ywpc-surface);min-width:0}
.ywpc-shortcut-wrap{min-width:0}
.ywpc-edit-groups{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0;padding:2px 0}
.ywpc-edit-groups-label{flex:none;color:var(--ywpc-muted);font-size:11px;line-height:1.4}
.ywpc-edit-group{
  min-height:32px;padding:3px 9px;border:1px solid var(--ywpc-line);border-radius:999px;
  background:var(--ywpc-surface-2);font-size:11px;line-height:1.3;color:var(--ywpc-muted);
}
.ywpc-edit-group.ywpc-current{border-color:var(--ywpc-accent);color:var(--SmartThemeBodyColor,#222);font-weight:600;background:color-mix(in srgb,var(--ywpc-accent) 12%,var(--ywpc-surface))}
.ywpc-edit-pane{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--ywpc-line-strong);border-radius:10px;background:var(--ywpc-surface);min-width:0}
.ywpc-edit-list{display:flex;flex-direction:column;gap:5px;min-width:0}
.ywpc-edit-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:5px 6px;border:1px solid var(--ywpc-line);border-radius:8px;background:var(--ywpc-surface-2);min-width:0}
.ywpc-edit-row-main{display:flex;align-items:center;gap:5px;flex-wrap:wrap;flex:1;min-width:0}
.ywpc-edit-row-name{font-size:12px;font-weight:560;line-height:1.35;overflow-wrap:anywhere;min-width:0}
.ywpc-edit-row-bind{color:var(--ywpc-muted);font-size:10.5px;line-height:1.35;overflow-wrap:anywhere;min-width:0}
.ywpc-edit-row .ywpc-edit-card{flex:1 1 100%;margin-top:4px}
.ywpc-kind{flex:none;padding:1px 6px;border:1px solid var(--ywpc-line);border-radius:999px;color:var(--ywpc-muted);font-size:10px;line-height:1.5;white-space:nowrap}
.ywpc-edit-control-title{flex:1;min-width:110px}
.ywpc-member-details{border-top:1px solid var(--ywpc-line);padding-top:6px;min-width:0}
.ywpc-member-summary{min-height:30px;display:flex;align-items:center;color:var(--ywpc-muted);font-size:11px;cursor:pointer;list-style:none}
.ywpc-member-summary::-webkit-details-marker{display:none}
.ywpc-member-summary::after{content:"▸";margin-left:auto;font-size:10px;transition:transform .14s ease}
.ywpc-member-details[open]>.ywpc-member-summary::after{transform:rotate(90deg)}
.ywpc-member-editor{display:flex;flex-direction:column;gap:6px;min-width:0}
.ywpc-option-editor{display:flex;flex-direction:column;gap:5px;padding:6px;border:1px solid var(--ywpc-line);border-radius:8px;min-width:0}
.ywpc-edit-option-label{width:100%;font-weight:600}
.ywpc-edit-option-head{display:flex;align-items:center;gap:4px;min-width:0}
.ywpc-edit-option-head .ywpc-edit-option-label{width:auto;flex:1;min-width:0}
.ywpc-member-chips{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
.ywpc-member-chip{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:1px 3px 1px 7px;border:1px solid var(--ywpc-line);border-radius:999px;background:var(--ywpc-surface-2);font-size:10.5px;line-height:1.5;overflow-wrap:anywhere}
.ywpc-member-chip.ywpc-missing{border-style:dashed}
.ywpc-member-name{min-width:0;overflow-wrap:anywhere}
.ywpc-member-remove{flex:none;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--ywpc-muted);font-size:13px;line-height:1}
.ywpc-member-remove:hover{color:var(--ywpc-warn);background:var(--ywpc-surface)}
.ywpc-member-empty{color:var(--ywpc-muted);font-size:10.5px}
.ywpc-member-add{max-width:100%;width:100%}
.ywpc-layout-picker{display:flex;flex-direction:column;gap:7px;padding:8px;border:1px solid var(--ywpc-line-strong);border-radius:10px;background:var(--ywpc-surface-2);min-width:0}
/* ST 旧版 button/select/input 兼容：在 #ywcc-root 命名空间下提高特异性，抗 legacy 覆盖；不用 !important。 */
#ywcc-root .ywpc-root .ywpc-edit-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}
#ywcc-root .ywpc-root .ywpc-edit-actions[hidden],
#ywcc-root .ywpc-root .ywpc-content-confirm[hidden]{display:none!important}
#ywcc-root .ywpc-root .ywpc-edit-btn{
  display:inline-flex;align-items:center;justify-content:center;text-align:center;
  min-height:36px;padding:5px 11px;border:1px solid var(--ywpc-line-strong);border-radius:8px;
  background:var(--ywpc-surface-2);color:var(--SmartThemeBodyColor,#222);
  font-size:12px;line-height:1.3;font-weight:560;white-space:normal;
}
#ywcc-root .ywpc-root .ywpc-edit-btn:disabled{opacity:.5}
#ywcc-root .ywpc-root .ywpc-edit-primary{
  border-color:color-mix(in srgb,var(--ywpc-accent) 62%,var(--ywpc-line));
  background:color-mix(in srgb,var(--ywpc-accent) 13%,var(--ywpc-surface));
  color:var(--SmartThemeBodyColor,#222);font-weight:650;
}
#ywcc-root .ywpc-root .ywpc-edit-warn{
  flex:1 1 100%;justify-content:flex-start;text-align:left;
  color:var(--ywpc-warn);border-color:color-mix(in srgb,var(--ywpc-warn) 55%,var(--ywpc-line));
  background:transparent;font-weight:600;
}
#ywcc-root .ywpc-root .ywpc-layout-entry .ywpc-edit-btn{
  color:var(--SmartThemeBodyColor,#222);border:1px solid var(--ywpc-line-strong);
  background:var(--ywpc-surface);min-height:32px;padding:4px 10px;font-weight:560;
}
#ywcc-root .ywpc-root .ywpc-edit-title{color:var(--SmartThemeBodyColor,#222);font-weight:650}
#ywcc-root .ywpc-root .ywpc-edit-iconbtn{
  flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:44px;min-width:44px;height:44px;min-height:44px;padding:0;
  border:1px solid var(--ywpc-line-strong);border-radius:8px;
  background:var(--ywpc-surface);color:var(--SmartThemeBodyColor,#222);font-size:15px;line-height:1;
}
#ywcc-root .ywpc-root .ywpc-edit-iconbtn:disabled{opacity:.45}
#ywcc-root .ywpc-root .ywpc-edit-input,
#ywcc-root .ywpc-root .ywpc-edit-select{
  min-height:36px;padding:4px 8px;border:1px solid var(--ywpc-line-strong);border-radius:7px;
  background:var(--ywpc-surface-2);color:var(--SmartThemeBodyColor,#222);font-size:12px;
}
#ywcc-root .ywpc-root .ywpc-edit-select option{color:var(--SmartThemeBodyColor,#222);background:var(--SmartThemeBlurTintColor,#fff)}
#ywcc-root .ywpc-root .ywpc-edit-option-label{font-weight:650;color:var(--SmartThemeBodyColor,#222)}
/* 最终优先：真实宿主根同时有 #ywcc-root.ywcc-root；用双 ID + 元素.类压过 legacy button 规则。 */
#ywcc-root.ywcc-root .ywpc-root button.ywpc-edit-btn{
  display:inline-flex;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;
  min-height:36px;min-width:0;padding:5px 11px;border:1px solid var(--ywpc-line-strong);border-radius:8px;
  background-color:var(--ywpc-surface-2);color:var(--SmartThemeBodyColor,#222);
  font-family:inherit;font-size:12px;line-height:1.3;font-weight:560;text-shadow:none;box-shadow:none;white-space:normal;
}
#ywcc-root.ywcc-root .ywpc-root button.ywpc-edit-btn:disabled{opacity:.5}
#ywcc-root.ywcc-root .ywpc-root button.ywpc-edit-primary{
  border-color:color-mix(in srgb,var(--ywpc-accent) 62%,var(--ywpc-line));
  background-color:color-mix(in srgb,var(--ywpc-accent) 13%,var(--ywpc-surface));
  color:var(--SmartThemeBodyColor,#222);font-weight:650;
}
#ywcc-root.ywcc-root .ywpc-root button.ywpc-edit-warn{
  flex:1 1 100%;justify-content:flex-start;text-align:left;
  border-color:color-mix(in srgb,var(--ywpc-warn) 55%,var(--ywpc-line));
  background-color:transparent;color:var(--ywpc-warn);font-weight:600;white-space:normal;
}
#ywcc-root.ywcc-root .ywpc-root .ywpc-layout-entry button.ywpc-edit-btn{
  min-height:32px;padding:4px 10px;color:var(--SmartThemeBodyColor,#222);
  border:1px solid var(--ywpc-line-strong);background-color:var(--ywpc-surface);font-weight:560;
}
#ywcc-root.ywcc-root .ywpc-root .ywpc-edit-title{color:var(--SmartThemeBodyColor,#222);font-weight:650}
#ywcc-root.ywcc-root .ywpc-root button.ywpc-edit-iconbtn{
  flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
  width:44px;min-width:44px;height:44px;min-height:44px;padding:0;margin:0;
  border:1px solid var(--ywpc-line-strong);border-radius:8px;
  background-color:var(--ywpc-surface);color:var(--SmartThemeBodyColor,#222);
  font-family:inherit;font-size:15px;line-height:1;text-shadow:none;box-shadow:none;
}
#ywcc-root.ywcc-root .ywpc-root button.ywpc-edit-iconbtn:disabled{opacity:.45}
#ywcc-root.ywcc-root .ywpc-root input.ywpc-edit-input,
#ywcc-root.ywcc-root .ywpc-root select.ywpc-edit-select{
  box-sizing:border-box;min-height:36px;padding:4px 8px;border:1px solid var(--ywpc-line-strong);border-radius:7px;
  background-color:var(--ywpc-surface-2);color:var(--SmartThemeBodyColor,#222);
  font-family:inherit;font-size:12px;text-shadow:none;box-shadow:none;
}
#ywcc-root.ywcc-root .ywpc-root select.ywpc-edit-select option{color:var(--SmartThemeBodyColor,#222);background-color:var(--SmartThemeBlurTintColor,#fff)}
#ywcc-root.ywcc-root .ywpc-root input.ywpc-edit-input.ywpc-edit-option-label{font-weight:650;color:var(--SmartThemeBodyColor,#222)}
#ywcc-root .ywpc-root textarea.ywpc-content-textarea,
#ywcc-root.ywcc-root .ywpc-root textarea.ywpc-content-textarea{
  width:100%;min-height:220px;padding:8px 9px;border:1px solid var(--ywpc-line-strong);border-radius:8px;
  background-color:var(--ywpc-surface-2);color:var(--SmartThemeBodyColor,#222);
  font-family:inherit;font-size:12.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;
  text-shadow:none;box-shadow:none;resize:vertical;
}
@media (max-width:520px){
#ywcc-root.ywcc-root .ywpc-root button.ywpc-edit-btn,
#ywcc-root.ywcc-root .ywpc-root input.ywpc-edit-input,
#ywcc-root.ywcc-root .ywpc-root select.ywpc-edit-select{min-height:44px}
}
@media (max-width:520px){
#ywcc-root .ywpc-root .ywpc-edit-btn,#ywcc-root .ywpc-root .ywpc-edit-input,#ywcc-root .ywpc-root .ywpc-edit-select{min-height:44px}
  .ywpc-root .ywpc-edit-iconbtn,#ywcc-root .ywpc-root .ywpc-edit-iconbtn{width:44px;min-width:44px;height:44px;min-height:44px}
}
@media (max-width:520px){
  .ywpc-multi{grid-template-columns:1fr}
  .ywpc-shortcuts{grid-template-columns:1fr}
  .ywpc-sec[data-ywpc-section="common"] .ywpc-shortcuts,
  .ywpc-sec[data-ywpc-section="writing"] .ywpc-shortcuts,
  .ywpc-sec[data-ywpc-section="plot"] .ywpc-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ywpc-combo{grid-template-columns:1fr}
  .ywpc-seg{grid-template-columns:repeat(auto-fit,minmax(78px,1fr))}
  .ywpc-root .ywpc-sec-head,.ywpc-root .ywpc-toggle,.ywpc-root .ywpc-chip,.ywpc-root .ywpc-seg-btn,
  .ywpc-root .ywpc-add,.ywpc-root .ywpc-pick-add,.ywpc-root .ywpc-shortcut-remove,
  .ywpc-root .ywpc-picker-search,.ywpc-root .ywpc-word-input,
  .ywpc-root .ywpc-edit-btn,.ywpc-root .ywpc-edit-iconbtn,.ywpc-root .ywpc-edit-input,
  .ywpc-root .ywpc-edit-select,.ywpc-root .ywpc-member-remove,.ywpc-root .ywpc-member-summary{min-height:44px}
  .ywpc-root .ywpc-word-input,.ywpc-root .ywpc-picker-search,
  .ywpc-root .ywpc-edit-input,.ywpc-root .ywpc-edit-select{font-size:16px}
  .ywpc-root .ywpc-content-textarea{min-height:260px}
  .ywpc-root .ywpc-word-step{width:44px;height:44px}
  .ywpc-root .ywpc-shortcut-remove{width:24px;min-width:24px;padding:0;border:0;background:transparent}
  .ywpc-sec[data-ywpc-section="common"] .ywpc-shortcut{gap:2px}
  .ywpc-root .ywpc-sec[data-ywpc-section="common"] .ywpc-shortcut .ywpc-toggle{gap:4px;padding-inline:4px}
  .ywpc-sec[data-ywpc-section="common"] .ywpc-switch{width:26px;height:16px;margin-left:auto}
  .ywpc-sec[data-ywpc-section="common"] .ywpc-knob{width:10px;height:10px}
  .ywpc-sec[data-ywpc-section="common"] .ywpc-toggle[aria-checked="true"] .ywpc-knob{transform:translateX(10px)}
  .ywpc-sec[data-ywpc-section="common"] .ywpc-toggle[aria-checked="mixed"] .ywpc-knob{transform:translateX(5px)}
  @media(max-width:359px){.ywpc-sec[data-ywpc-section="common"] .ywpc-shortcuts{grid-template-columns:1fr}}
  .ywpc-root .ywpc-edit-iconbtn,.ywpc-root .ywpc-member-remove{min-width:44px}
}
/* 思维链 5 项：DS1/DS2 同一行，KIMI 整行，Gemini 两项同一行（在手机档也保持）。 */
.ywpc-root .ywpc-combo[data-ywpc-combo-group="think.model"]:not(.ywpc-opt-grid){grid-template-columns:repeat(2,minmax(0,1fr))}
.ywpc-root .ywpc-combo[data-ywpc-combo-group="think.model"]:not(.ywpc-opt-grid)>[data-ywpc-value="kimi"]{grid-column:1/-1}
/* 首页常用钉选：cc 标题右侧宿主（不在 .ywpc-root 内，显式补齐变量与按钮样式）。 */
.ywpc-header-actions{
  display:flex;align-items:center;gap:6px;min-width:0;
  --ywpc-accent:var(--SmartThemeQuoteColor,#7f9b84);
  --ywpc-line:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 18%,transparent);
  --ywpc-line-strong:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 30%,transparent);
  --ywpc-surface:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 5%,transparent);
  --ywpc-surface-2:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 9%,transparent);
  --ywpc-muted:color-mix(in srgb,var(--SmartThemeBodyColor,#7a7a7a) 66%,transparent);
}
.ywpc-header-actions .ywpc-edit-btn{
  display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
  margin:0;min-height:32px;padding:4px 10px;border:1px solid var(--ywpc-line-strong);border-radius:8px;
  background:var(--ywpc-surface);color:var(--SmartThemeBodyColor,#222);
  font:inherit;font-size:11.5px;line-height:1.3;font-weight:560;text-align:center;cursor:pointer;
  text-shadow:none;box-shadow:none;white-space:nowrap;
}
.ywpc-header-actions .ywpc-edit-btn:hover{border-color:var(--ywpc-accent)}
.ywpc-header-actions .ywpc-header-state{color:var(--ywpc-muted);font-size:11.5px;line-height:1.3;white-space:nowrap}
/* 正文编辑/选条目的 header 状态是新加小字：同提正文色；钉选/布局编辑旧状态不动。 */
.ywpc-header-actions .ywpc-header-state[data-ywpc-content-state]{color:var(--SmartThemeBodyColor,#222)}
.ywpc-pin-editor{display:flex;flex-direction:column;gap:7px;min-width:0}
.ywpc-pin-editor-head{display:flex;flex-direction:column;gap:2px;min-width:0}
.ywpc-pin-editor-title{font-size:12.5px;font-weight:650}
.ywpc-pin-editor-hint{color:var(--ywpc-muted);font-size:11px;line-height:1.4}
.ywpc-pin-list{display:flex;flex-direction:column;gap:5px;min-width:0}
.ywpc-pin-row{
  display:flex;align-items:center;gap:6px;min-width:0;min-height:40px;padding:6px 8px;
  border:1px solid var(--ywpc-line);border-radius:9px;background:var(--ywpc-surface);
}
.ywpc-pin-row.ywpc-missing{border-style:dashed;opacity:.7}
.ywpc-pin-drag{
  flex:none;width:26px;min-height:32px;padding:0 3px;margin:0 -3px;box-sizing:content-box;
  display:inline-flex;align-items:center;justify-content:center;
  color:var(--ywpc-muted);cursor:grab;font-size:15px;line-height:1;user-select:none;touch-action:none;
}
.ywpc-pin-drag:active{cursor:grabbing}
.ywpc-pin-main{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.ywpc-pin-label{font-size:12.5px;font-weight:560;overflow-wrap:anywhere}
.ywpc-pin-sub{color:var(--ywpc-muted);font-size:11px;line-height:1.35;overflow-wrap:anywhere}
.ywpc-pin-ops{display:flex;align-items:center;gap:4px;flex:none}
.ywpc-pin-btn{
  width:32px;min-height:32px;border:1px solid var(--ywpc-line);border-radius:8px;
  background:var(--ywpc-surface-2);display:inline-flex;align-items:center;justify-content:center;
  color:var(--ywpc-muted);font-size:14px;line-height:1;
}
.ywpc-pin-btn:hover:not(:disabled){border-color:var(--ywpc-line-strong);color:var(--SmartThemeBodyColor,#222)}
.ywpc-pin-btn:disabled{opacity:.35}
.ywpc-pin-btn[data-ywpc-action="pin-remove"]:hover:not(:disabled){
  color:var(--ywpc-warn);border-color:color-mix(in srgb,var(--ywpc-warn) 45%,var(--ywpc-line));
}
.ywpc-pin-add{
  width:100%;justify-content:flex-start;min-height:34px;border-style:solid;
  border-color:var(--ywpc-line-strong);background:var(--ywpc-surface);
}
.ywpc-pin-word{grid-column:1/-1;min-width:0}
.ywpc-pin-group{grid-column:1/-1;min-width:0}
.ywpc-pin-group>.ywpc-row{min-width:0}
/* 段落/叙述风格整组：占满首页 grid 一行，两个选项必须同一行。 */
.ywpc-seg[data-ywpc-radio-group="writing.paragraph"],
.ywpc-seg[data-ywpc-radio-group="writing.narration"]{grid-template-columns:repeat(2,minmax(0,1fr))}
/* 只把明确表示「不开/不开（默认）」的选项自身居中并留白；其余标题、说明保持左对齐。 */
.ywpc-seg-btn.ywpc-seg-none{justify-content:center;align-items:center;text-align:center;padding-left:14px;padding-right:14px}
/* 组内展示序：十二等分网格，按 optionLayout 顺序排，不 dense 回填。 */
.ywpc-seg.ywpc-opt-grid,.ywpc-combo.ywpc-opt-grid{grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-flow:row}
.ywpc-opt-grid>[data-ywpc-w="3"]{grid-column:span 3}
.ywpc-opt-grid>[data-ywpc-w="4"]{grid-column:span 4}
.ywpc-opt-grid>[data-ywpc-w="6"]{grid-column:span 6}
.ywpc-opt-grid>[data-ywpc-w="12"]{grid-column:span 12}
.ywpc-opt-grid>.ywpc-space{min-height:0}
/* 整组钉到首页时，组小标题必须可见；compact 只隐藏选项副标题，不隐藏标题。 */
.ywpc-compact .ywpc-pin-group .ywpc-control-label{display:block}
.ywpc-pin-word .ywpc-row{gap:5px}
.ywpc-pin-word-btn{align-self:flex-start;margin-top:2px}
.ywpc-pin-mode-hint{
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;
  margin:0;padding:7px 9px;font-size:11.5px;line-height:1.45;
  border:1px solid color-mix(in srgb,var(--ywpc-accent) 45%,var(--ywpc-line));border-radius:9px;
  background:color-mix(in srgb,var(--ywpc-accent) 10%,var(--ywpc-surface));
}
.ywpc-pin-mode-text{flex:1;min-width:150px}
@media (max-width:520px){
  .ywpc-root .ywpc-pin-row{min-height:46px}
  .ywpc-root .ywpc-pin-drag{min-height:44px}
  .ywpc-root .ywpc-pin-btn{width:44px;min-height:44px}
  .ywpc-root .ywpc-pin-mode-hint{font-size:12px}
  .ywpc-header-actions .ywpc-edit-btn{min-height:44px;font-size:12px}
}
/* 十二格有序网格：按顺序排，不 dense 回填；空块只占宽度，不制造额外整行空隙。 */
.ywpc-grid12{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;min-width:0;grid-auto-flow:row}
.ywpc-grid12>.ywpc-cell{min-width:0;grid-column:span 12}
.ywpc-grid12>.ywpc-cell[data-ywpc-w="3"]{grid-column:span 3}
.ywpc-grid12>.ywpc-cell[data-ywpc-w="4"]{grid-column:span 4}
.ywpc-grid12>.ywpc-cell[data-ywpc-w="6"]{grid-column:span 6}
.ywpc-grid12>.ywpc-cell[data-ywpc-w="12"]{grid-column:span 12}
.ywpc-space{min-width:0;min-height:0;border-radius:8px;background:transparent;pointer-events:none}
.ywpc-space-edit{display:flex;align-items:center;justify-content:center;min-height:34px;border:1px dashed var(--ywpc-line);background:var(--ywpc-surface);color:var(--ywpc-muted);font-size:10.5px;line-height:1.3;pointer-events:auto}
.ywpc-wbtns{display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap;flex:none}
.ywpc-wbtn{
  min-height:26px;padding:2px 6px;border:1px solid var(--ywpc-line);border-radius:6px;
  background:var(--ywpc-surface);color:var(--ywpc-muted);font:inherit;font-size:10.5px;line-height:1.2;
  cursor:pointer;white-space:nowrap;
}
.ywpc-wbtn:hover{border-color:var(--ywpc-line-strong);color:var(--SmartThemeBodyColor,#222)}
.ywpc-wbtn.ywpc-current{border-color:color-mix(in srgb,var(--ywpc-accent) 58%,var(--ywpc-line));background:color-mix(in srgb,var(--ywpc-accent) 12%,var(--ywpc-surface));color:var(--SmartThemeBodyColor,#222)}
.ywpc-whandle{
  flex:none;width:14px;min-height:12px;padding:10px 9px;margin:-10px -9px;
  display:inline-flex;align-items:center;justify-content:center;
  color:var(--ywpc-muted);cursor:ew-resize;font-size:12px;line-height:1;user-select:none;touch-action:none;
  box-sizing:content-box;
}
.ywpc-whandle::before{content:"⇔"}
.ywpc-whandle:hover,.ywpc-whandle.ywpc-wdragging{color:var(--ywpc-accent)}
.ywpc-edit-preview .ywpc-cell{position:relative;min-width:0}
.ywpc-edit-preview .ywpc-whandle-preview,.ywpc-edit-preview .ywpc-whandle{
  position:absolute;right:-8px;top:50%;transform:translateY(-50%);z-index:2;
}
.ywpc-preview-block.ywpc-preview-current{border-color:color-mix(in srgb,var(--ywpc-accent) 62%,var(--ywpc-line));box-shadow:0 0 0 1px color-mix(in srgb,var(--ywpc-accent) 30%,transparent)}
.ywpc-root.ywpc-sorting,.ywpc-root.ywpc-sorting *{user-select:none!important;cursor:grabbing!important}
.ywpc-sort-source{opacity:.35!important;border-style:dashed!important}
.ywpc-sort-ghost{position:fixed!important;left:0;top:0;z-index:2147483000;pointer-events:none!important;margin:0!important;opacity:1;box-sizing:border-box!important;background-color:var(--SmartThemeBlurTintColor,#fff)!important;box-shadow:0 10px 26px rgba(0,0,0,.28);transform-origin:0 0;will-change:transform;overflow:hidden;border-radius:8px;transition:none!important}
.ywpc-sort-dropline{position:fixed;z-index:2147483001;height:3px;border-radius:2px;pointer-events:none;background:var(--ywpc-accent,#7f9b84);box-shadow:0 0 0 1px color-mix(in srgb,var(--SmartThemeBlurTintColor,#fff) 68%,transparent)}
.ywpc-sort-ghost *{pointer-events:none!important}
.ywpc-drop-before{box-shadow:inset 0 3px 0 0 var(--ywpc-accent)!important}
.ywpc-drop-after{box-shadow:inset 0 -3px 0 0 var(--ywpc-accent)!important}
.ywpc-width-now{flex:none;color:var(--ywpc-muted);font-size:10.5px;line-height:1.3;white-space:nowrap}
.ywpc-root.ywpc-wdragging,.ywpc-root.ywpc-wdragging *{cursor:ew-resize!important;user-select:none!important}
.ywpc-option-space{border-style:dashed;background:var(--ywpc-surface)}
.ywpc-edit-space-row{border-style:dashed}
.ywpc-pin-space-row{flex-wrap:wrap}
.ywpc-pin-space-row .ywpc-pin-ops{flex-wrap:wrap}
.ywpc-edit-preview{display:flex;flex-direction:column;gap:5px;min-width:0;padding:7px 8px;border:1px solid var(--ywpc-line);border-radius:9px;background:var(--ywpc-surface)}
.ywpc-edit-preview-head{color:var(--ywpc-muted);font-size:10.5px;line-height:1.3}
.ywpc-edit-preview-grid{gap:4px}
.ywpc-preview-block{
  display:flex;flex-direction:column;gap:2px;min-width:0;min-height:34px;padding:5px 7px;
  border:1px solid var(--ywpc-line);border-radius:7px;background:var(--ywpc-surface-2);
}
.ywpc-preview-label{font-size:11px;font-weight:560;line-height:1.3;overflow-wrap:anywhere}
.ywpc-preview-meta{color:var(--ywpc-muted);font-size:9.5px;line-height:1.3;white-space:nowrap}
.ywpc-preview-options{display:flex;flex-wrap:wrap;gap:2px;min-width:0}
.ywpc-preview-option{
  min-width:0;padding:1px 5px;border:1px solid var(--ywpc-line);border-radius:5px;
  color:var(--ywpc-muted);font-size:9.5px;line-height:1.4;overflow-wrap:anywhere;
}
.ywpc-preview-options>[data-ywpc-w="3"]{flex:0 0 calc(25% - 2px)}
.ywpc-preview-options>[data-ywpc-w="4"]{flex:0 0 calc(33.333% - 2px)}
.ywpc-preview-options>[data-ywpc-w="6"]{flex:0 0 calc(50% - 2px)}
.ywpc-preview-options>[data-ywpc-w="12"]{flex:1 1 100%}
.ywpc-preview-options>.ywpc-space{min-height:18px}
/* 首页选项稍收紧；保留完整预设页和布局编辑器的既有热区。 */
.ywpc-compact .ywpc-home-grid{gap:4px}
.ywpc-compact .ywpc-shortcuts{gap:4px}
.ywpc-compact .ywpc-seg,.ywpc-compact .ywpc-combo{gap:4px}
.ywpc-compact .ywpc-row{gap:3px}
.ywpc-compact .ywpc-sec-body{gap:5px;margin-top:5px}
.ywpc-compact .ywpc-toggle,.ywpc-compact .ywpc-seg-btn{min-height:32px;padding:4px 7px}
@media (max-width:520px){
  .ywpc-root.ywpc-compact .ywpc-toggle,.ywpc-root.ywpc-compact .ywpc-seg-btn{min-height:36px;padding:4px 7px}
}
@media (max-width:359px){
  /* 超窄屏保留旧首页单列可读性；普通 390/360 仍按十二格宽度排。 */
  .ywpc-root .ywpc-home-grid>.ywpc-cell{grid-column:span 12}
}
/* 可视化布局画布（2026-11-14）：保存/取消常驻、分组横向分页、每块真实内容 +
   左上排序柄 / 右上齿轮 / 右侧宽度柄；宽度按钮只在选中块出现。 */
.ywpc-canvas-head{position:sticky;top:0;z-index:6;display:flex;flex-direction:column;gap:4px;padding:5px 7px;border:1px solid var(--ywpc-line-strong);border-radius:9px;background:var(--ywpc-surface);min-width:0}
.ywpc-canvas-head-row{display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:nowrap}
.ywpc-canvas-title{flex:none;font-size:12px;font-weight:650;line-height:1.2}
.ywpc-canvas-state{flex:1;min-width:0;color:var(--ywpc-muted);font-size:10.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ywpc-canvas-save,.ywpc-canvas-cancel{flex:none;min-height:30px;padding:3px 9px;font-size:11.5px}
/* 只调画布保存按钮：深色主题下把文字再向白靠一点，跨过 4.5；不动全局主按钮族。 */
.ywpc-canvas-save{color:color-mix(in srgb,var(--SmartThemeBodyColor,#222) 80%,#fff 20%)}
#ywcc-root.ywcc-root .ywpc-root button.ywpc-canvas-save{color:color-mix(in srgb,var(--SmartThemeBodyColor,#222) 80%,#fff 20%)}
.ywpc-canvas-morebtn{flex:none;width:30px;min-width:30px;min-height:30px;padding:0;font-size:14px;line-height:1}
.ywpc-canvas-more{display:flex;flex-direction:column;gap:5px;padding-top:4px;border-top:1px solid var(--ywpc-line);min-width:0}
.ywpc-canvas-more-row{display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:wrap}
.ywpc-canvas-morelabel{flex:none;color:var(--ywpc-muted);font-size:10.5px}
.ywpc-canvas-newgroup{flex:1;min-width:90px}
.ywpc-canvas-grouptitle{flex:1;min-width:90px}
.ywpc-gnav{display:flex;align-items:center;gap:4px;min-width:0;padding:2px 0}
.ywpc-gnav-arrow{flex:none;width:30px;min-width:30px;min-height:30px;padding:0;border:1px solid var(--ywpc-line);border-radius:7px;background:var(--ywpc-surface-2);color:var(--ywpc-muted);font-size:14px;line-height:1;cursor:pointer}
.ywpc-gnav-arrow:disabled{opacity:.35;cursor:default}
.ywpc-gnav-strip{flex:1;min-width:0;display:flex;align-items:center;gap:4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;white-space:nowrap}
.ywpc-gnav-strip::-webkit-scrollbar{display:none}
.ywpc-gnav-chip{flex:none;min-height:30px;max-width:9em;padding:3px 9px;border:1px solid var(--ywpc-line);border-radius:999px;background:var(--ywpc-surface-2);color:var(--ywpc-muted);font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.ywpc-gnav-chip.ywpc-current{border-color:var(--ywpc-accent);color:var(--SmartThemeBodyColor,#222);font-weight:600;background:color-mix(in srgb,var(--ywpc-accent) 12%,var(--ywpc-surface))}
.ywpc-gnav-count{flex:none;color:var(--ywpc-muted);font-size:10px;line-height:1;white-space:nowrap}
.ywpc-canvas{display:flex;flex-direction:column;gap:6px;padding:7px;border:1px solid var(--ywpc-line-strong);border-radius:9px;background:var(--ywpc-surface);min-width:0}
.ywpc-canvas-bar{display:flex;align-items:center;gap:6px;min-width:0}
.ywpc-canvas-section{flex:none;font-size:12px;font-weight:650;line-height:1.2;white-space:nowrap;max-width:10em;overflow:hidden;text-overflow:ellipsis}
.ywpc-canvas-tip{flex:1;min-width:0;color:var(--ywpc-muted);font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ywpc-canvas-count{flex:none;color:var(--ywpc-muted);font-size:10px;line-height:1;white-space:nowrap}
.ywpc-canvas-grid{gap:5px}
.ywpc-canvas-settings-cell{grid-column:1/-1;min-width:0}
.ywpc-cblock{position:relative;display:flex;flex-direction:column;gap:4px;min-width:0;min-height:40px;padding:6px 34px 6px 32px;border:1px solid var(--ywpc-line);border-radius:8px;background:var(--ywpc-surface-2);cursor:pointer}
.ywpc-cblock[data-ywpc-w="3"],.ywpc-cblock[data-ywpc-w="4"]{padding-left:6px;padding-right:6px}
.ywpc-cblock[data-ywpc-w="3"] .ywpc-cblock-head,.ywpc-cblock[data-ywpc-w="4"] .ywpc-cblock-head{padding-right:0}
.ywpc-cblock[data-ywpc-w="3"] .ywpc-cblock-sort,.ywpc-cblock[data-ywpc-w="4"] .ywpc-cblock-sort,
.ywpc-cblock[data-ywpc-w="3"] .ywpc-cblock-gear,.ywpc-cblock[data-ywpc-w="4"] .ywpc-cblock-gear,
.ywpc-cblock[data-ywpc-w="3"] .ywpc-cblock-whandle,.ywpc-cblock[data-ywpc-w="4"] .ywpc-cblock-whandle{opacity:0;pointer-events:none}
.ywpc-cblock[data-ywpc-w="3"].ywpc-selected .ywpc-cblock-sort,.ywpc-cblock[data-ywpc-w="4"].ywpc-selected .ywpc-cblock-sort,
.ywpc-cblock[data-ywpc-w="3"].ywpc-open .ywpc-cblock-sort,.ywpc-cblock[data-ywpc-w="4"].ywpc-open .ywpc-cblock-sort,
.ywpc-cblock[data-ywpc-w="3"].ywpc-selected .ywpc-cblock-gear,.ywpc-cblock[data-ywpc-w="4"].ywpc-selected .ywpc-cblock-gear,
.ywpc-cblock[data-ywpc-w="3"].ywpc-open .ywpc-cblock-gear,.ywpc-cblock[data-ywpc-w="4"].ywpc-open .ywpc-cblock-gear,
.ywpc-cblock[data-ywpc-w="3"].ywpc-selected .ywpc-cblock-whandle,.ywpc-cblock[data-ywpc-w="4"].ywpc-selected .ywpc-cblock-whandle,
.ywpc-cblock[data-ywpc-w="3"].ywpc-open .ywpc-cblock-whandle,.ywpc-cblock[data-ywpc-w="4"].ywpc-open .ywpc-cblock-whandle{opacity:1;pointer-events:auto}
.ywpc-cblock:hover{border-color:var(--ywpc-line-strong)}
.ywpc-cblock.ywpc-selected{border-color:color-mix(in srgb,var(--ywpc-accent) 62%,var(--ywpc-line));box-shadow:0 0 0 1px color-mix(in srgb,var(--ywpc-accent) 26%,transparent)}
.ywpc-cblock.ywpc-open{border-color:color-mix(in srgb,var(--ywpc-accent) 78%,var(--ywpc-line))}
.ywpc-cblock.ywpc-cblock-space{border-style:dashed}
.ywpc-cblock-sort{position:absolute;left:0;top:0;bottom:0;width:32px;display:inline-flex;align-items:center;justify-content:center;color:var(--ywpc-muted);font-size:11px;line-height:1;cursor:grab;user-select:none;touch-action:none}
.ywpc-cblock-sort:active{cursor:grabbing}
.ywpc-cblock-main{display:flex;flex-direction:column;gap:3px;min-width:0}
.ywpc-cblock-head{display:flex;align-items:center;gap:5px;min-width:0;padding-right:70px}
.ywpc-cblock-title{flex:1;font-size:11.5px;font-weight:600;line-height:1.3;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ywpc-cblock-bind{color:var(--ywpc-muted);font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ywpc-cblock-preview{display:flex;flex-direction:column;gap:3px;min-width:0}
.ywpc-cblock-gear{position:absolute;right:34px;top:2px;width:32px;height:32px;padding:0;border:1px solid var(--ywpc-line);border-radius:6px;background:var(--ywpc-surface);color:var(--ywpc-muted);font-size:13px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.ywpc-cblock-gear:hover{border-color:var(--ywpc-line-strong);color:var(--SmartThemeBodyColor,#222)}
.ywpc-cblock-gear[aria-expanded="true"]{border-color:color-mix(in srgb,var(--ywpc-accent) 62%,var(--ywpc-line));color:var(--SmartThemeBodyColor,#222)}
.ywpc-cblock-whandle{position:absolute;right:0;top:0;bottom:0;width:32px;min-height:0;margin:0;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:0 7px 7px 0;font-size:10px}
.ywpc-cblock-options{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
.ywpc-cblock-options>[data-ywpc-w="3"]{flex:0 0 calc(25% - 4px)}
.ywpc-cblock-options>[data-ywpc-w="4"]{flex:0 0 calc(33.333% - 4px)}
.ywpc-cblock-options>[data-ywpc-w="6"]{flex:0 0 calc(50% - 4px)}
.ywpc-cblock-options>[data-ywpc-w="12"]{flex:1 1 100%}
/* 选项在画布上只显示标签：固定 32 高、两行可读；排序/调宽收进选中块设置，避免窄列被微柄挤字。 */
.ywpc-cblock-opt{position:relative;display:flex;align-items:center;min-width:0;min-height:32px;padding:3px 5px;border:1px solid var(--ywpc-line);border-radius:6px;background:var(--ywpc-surface);color:var(--ywpc-muted);font-size:10px;line-height:1.3;cursor:grab;user-select:none;-webkit-user-select:none;transition:border-color .14s ease,background .14s ease}
.ywpc-cblock-opt:hover{border-color:var(--ywpc-line-strong)}
.ywpc-cblock-opt.is-on{border-color:color-mix(in srgb,var(--ywpc-accent) 58%,var(--ywpc-line));background:color-mix(in srgb,var(--ywpc-accent) 12%,var(--ywpc-surface));color:var(--SmartThemeBodyColor,#222);font-weight:600}
.ywpc-cblock-opt.ywpc-missing{border-style:dashed;opacity:.6}
.ywpc-cblock-ospace{border-style:dashed;background:transparent}
.ywpc-cblock-optlabel{flex:1;min-width:0;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;overflow-wrap:anywhere;word-break:break-word;line-height:1.3}
.ywpc-cblock-opt:active{cursor:grabbing}
.ywpc-cblock-opt.ywpc-opt-selected{outline:2px solid color-mix(in srgb,var(--ywpc-accent) 72%,var(--ywpc-line));outline-offset:1px}
.ywpc-cblock-optctx{display:flex;align-items:center;gap:6px;min-width:0;min-height:34px;padding:3px 5px;border:1px dashed var(--ywpc-line-strong);border-radius:6px;background:var(--ywpc-surface)}
.ywpc-cblock-optctx-label{flex:1;min-width:0;color:var(--ywpc-muted);font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ywpc-cblock-optctx-handle{flex:none;box-sizing:border-box;position:relative;width:32px;min-width:32px;height:32px;min-height:32px;margin:0;padding:0;border:1px solid var(--ywpc-line);border-radius:6px;background:var(--ywpc-surface-2);display:inline-flex;align-items:center;justify-content:center}
.ywpc-cblock-members{gap:3px}
.ywpc-cblock-member{font-size:9.5px;line-height:1.45}
.ywpc-cblock-member.is-on{border-color:color-mix(in srgb,var(--ywpc-accent) 52%,var(--ywpc-line));color:var(--SmartThemeBodyColor,#222)}
.ywpc-cblock-pin{font-size:9.5px}
.ywpc-cblock-static{color:var(--ywpc-muted);font-size:10.5px;line-height:1.35;overflow-wrap:anywhere}
.ywpc-cblock-settings{display:flex;flex-direction:column;gap:6px;padding:7px;border:1px solid color-mix(in srgb,var(--ywpc-accent) 45%,var(--ywpc-line));border-radius:9px;background:var(--ywpc-surface);min-width:0}
.ywpc-cblock-settings-head{display:flex;align-items:center;gap:6px;min-width:0}
.ywpc-cblock-settings-title{font-size:11.5px;font-weight:650;line-height:1.2}
.ywpc-cblock-settings-close{margin-left:auto}
/* 设置里用清楚字段名成组，不再堆一串图标。 */
.ywpc-field{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 8px;align-items:center;min-width:0}
.ywpc-field-label{color:var(--ywpc-muted);font-size:10.5px;line-height:1.3;white-space:nowrap}
.ywpc-field-static{color:var(--SmartThemeBodyColor,#222);font-size:11px;line-height:1.35;overflow-wrap:anywhere;min-width:0}
.ywpc-field-block{display:flex;flex-direction:column;gap:4px;min-width:0}
.ywpc-field-caption{color:var(--ywpc-muted);font-size:10.5px;line-height:1.3}
.ywpc-settings-danger-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--ywpc-line);min-width:0}
.ywpc-option-del{flex:none;min-height:30px;padding:3px 8px}
.ywpc-option-add-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}
.ywpc-canvas-add-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ywpc-canvas-add{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:4px 11px;border:1px dashed var(--ywpc-line-strong);border-radius:8px;background:var(--ywpc-surface-2);color:var(--SmartThemeBodyColor,#222);font-size:11.5px;line-height:1.3;font-weight:560;cursor:pointer}
.ywpc-canvas-add:hover{border-color:color-mix(in srgb,var(--ywpc-accent) 55%,var(--ywpc-line))}
.ywpc-canvas-add-hint{color:var(--ywpc-muted);font-size:10px;line-height:1.3;min-width:0}
.ywpc-addmenu{display:flex;flex-direction:column;gap:5px;padding:7px;border:1px solid var(--ywpc-line-strong);border-radius:9px;background:var(--ywpc-surface-2);min-width:0}
.ywpc-addmenu-head{display:flex;align-items:center;gap:6px;min-width:0}
.ywpc-addmenu-title{font-size:11.5px;font-weight:650;line-height:1.2}
.ywpc-addmenu-tip{flex:1;min-width:0;color:var(--ywpc-muted);font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ywpc-addmenu-kinds{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
.ywpc-addmenu-kind{min-height:30px;padding:3px 8px;border:1px solid var(--ywpc-line);border-radius:999px;background:var(--ywpc-surface);color:var(--ywpc-muted);font-size:11px;line-height:1.2;cursor:pointer}
.ywpc-addmenu-kind.ywpc-current{border-color:color-mix(in srgb,var(--ywpc-accent) 58%,var(--ywpc-line));color:var(--SmartThemeBodyColor,#222);font-weight:600;background:color-mix(in srgb,var(--ywpc-accent) 10%,var(--ywpc-surface))}
.ywpc-addmenu-searchrow{display:flex;min-width:0}
.ywpc-addmenu-list{display:flex;flex-direction:column;gap:3px;min-width:0}
.ywpc-addmenu-row{padding:3px 5px}
.ywpc-addmenu-row .ywpc-pick-label{font-size:11px}
.ywpc-addmenu-note{margin:0;color:var(--ywpc-muted);font-size:10px;line-height:1.3}
#ywcc-root.ywcc-root .ywpc-root button.ywpc-cblock-gear,
#ywcc-root.ywcc-root .ywpc-root button.ywpc-gnav-chip,
#ywcc-root.ywcc-root .ywpc-root button.ywpc-gnav-arrow,
#ywcc-root.ywcc-root .ywpc-root button.ywpc-canvas-add,
#ywcc-root.ywcc-root .ywpc-root button.ywpc-addmenu-kind{
  box-sizing:border-box;font-family:inherit;text-shadow:none;box-shadow:none;
}
@media (max-width:520px){
  .ywpc-canvas-head{padding:4px 6px}
  .ywpc-canvas-head-row{gap:4px}
  .ywpc-canvas-title{font-size:11.5px}
  .ywpc-canvas-save,.ywpc-canvas-cancel{min-height:38px;padding:4px 8px;font-size:11px}
  .ywpc-canvas-morebtn{width:38px;min-width:38px;min-height:38px}
  .ywpc-gnav-arrow{width:34px;min-width:34px;min-height:34px}
  .ywpc-gnav-chip{min-height:34px;padding:4px 9px;font-size:11.5px}
  .ywpc-canvas-tip{display:none}
  .ywpc-cblock-sort{width:32px;font-size:13px}
  .ywpc-cblock{padding-left:32px;padding-right:36px}
  .ywpc-cblock-whandle{width:32px}
  .ywpc-cblock-gear{right:36px;width:34px;height:34px}
  .ywpc-cblock-head{padding-right:76px}

  .ywpc-addmenu-kind{min-height:34px}
  .ywpc-canvas-add{min-height:38px}
}
@media (prefers-reduced-motion:reduce){
  .ywpc-root *{transition:none!important;animation:none!important}
}
/* 2026-11-15 导航+拨钮并列卡（scope：.ywpc-split，只有插小说防道歉 / 随机头部用）。
   外层 wrapper（.ywpc-shortcut / .ywpc-inline-pair）原样，里面两颗并列 button：
   前面 .ywpc-nav-btn 只导航，后面 .ywpc-split-toggle 只切换；其余控件不沾这些类。 */
.ywpc-toggle-aside{font-size:.78em;font-weight:400;color:var(--ywpc-muted);margin-left:3px}
.ywpc-split{gap:0;align-items:stretch;border-radius:9px;transition:background .14s ease}
.ywpc-split:has(.ywpc-nav-btn:hover:not(:disabled)),
.ywpc-split:has(.ywpc-split-toggle:hover:not(:disabled)){background:var(--ywpc-surface-2)}
.ywpc-split .ywpc-nav-btn{
  display:flex;align-items:center;gap:5px;min-width:0;flex:1 1 auto;
  min-height:36px;padding:6px 8px;border:0;border-radius:0;
  background:transparent;text-align:left;
}
.ywpc-split .ywpc-nav-btn:hover:not(:disabled){color:var(--ywpc-ink);text-decoration:none}
.ywpc-split .ywpc-nav-btn:hover:not(:disabled) .ywpc-toggle-label{text-decoration:none}
.ywpc-split .ywpc-nav-btn:disabled{opacity:.62;cursor:not-allowed}
.ywpc-split .ywpc-nav-go{flex:none;color:var(--ywpc-muted);font-size:14px;line-height:1}
.ywpc-root .ywpc-split .ywpc-split-toggle{
  width:44px;min-width:44px;flex:none;justify-content:flex-end;gap:0;
  min-height:36px;padding:6px 8px 6px 0;border:0;border-radius:0;background:transparent;
}
.ywpc-root .ywpc-split .ywpc-split-toggle:hover:not(:disabled),
.ywpc-root .ywpc-split .ywpc-split-toggle[aria-checked="true"]{border:0;background:transparent}
.ywpc-compact .ywpc-split .ywpc-nav-btn{min-height:32px;padding:4px 7px}
.ywpc-root.ywpc-compact .ywpc-split .ywpc-split-toggle{min-height:32px;padding:4px 7px 4px 0}
@media (max-width:520px){
  .ywpc-root.ywpc-compact .ywpc-split .ywpc-nav-btn,
  .ywpc-root.ywpc-compact .ywpc-split .ywpc-split-toggle{min-height:36px}
  .ywpc-root .ywpc-sec[data-ywpc-section="common"] .ywpc-split .ywpc-nav-btn{padding-left:4px}
  .ywpc-root .ywpc-sec[data-ywpc-section="common"] .ywpc-split .ywpc-split-toggle{padding-right:4px}
}
`;

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */
function safeCall(fn, fallback) {
  try {
    if (typeof fn !== 'function') return fallback;
    const value = fn();
    return value === undefined ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function nowTime() {
  try {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    return '';
  }
}

function normalizeSearch(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function text(value) {
  return String(value == null ? '' : value);
}

function contentDraftKey(presetName, promptId) {
  return text(presetName) + '\u0000' + text(promptId);
}

function rememberContentDraft(key, content) {
  const id = text(key);
  if (!id) return;
  if (!PROMPT_CONTENT_DRAFTS.has(id) && PROMPT_CONTENT_DRAFTS.size >= PROMPT_CONTENT_DRAFT_LIMIT) {
    const oldest = PROMPT_CONTENT_DRAFTS.keys().next();
    if (!oldest.done) PROMPT_CONTENT_DRAFTS.delete(oldest.value);
  }
  PROMPT_CONTENT_DRAFTS.set(id, { content: text(content), at: Date.now() });
}

function forgetContentDraft(key) {
  const id = text(key);
  if (id) PROMPT_CONTENT_DRAFTS.delete(id);
}

function savedContentDraft(key) {
  const hit = PROMPT_CONTENT_DRAFTS.get(text(key));
  return hit && typeof hit.content === 'string' ? hit.content : null;
}

function createEl(doc, tag, className) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  return el;
}

function append(parent, child) {
  if (child) parent.appendChild(child);
  return child;
}

function clearNode(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function findScenario(oai) {
  try {
    const po = oai && Array.isArray(oai.prompt_order) ? oai.prompt_order : null;
    if (!po) return null;
    return po.find(group => group && String(group.character_id) === String(CHARACTER_ID)) || null;
  } catch (e) {
    return null;
  }
}

function scenarioOrderMap(scenario) {
  const map = Object.create(null);
  try {
    if (!scenario || !Array.isArray(scenario.order)) return map;
    for (const row of scenario.order) {
      if (!row || typeof row.identifier !== 'string') continue;
      if (typeof row.enabled === 'boolean') map[row.identifier] = row.enabled;
    }
  } catch (e) { /* 坏顺序表只当作空 */ }
  return map;
}

function controlIcon(m, control) {
  if (!control) return '';
  if (control.icon) return String(control.icon);
  const known = PROMPT_NAMES[control.id] || (m && m.promptById && m.promptById.get(control.id)
    ? String((m.promptById.get(control.id) || {}).name || '')
    : '');
  return emojiPrefix(known);
}

function displayLabel(m, control) {
  if (!control) return '';
  return String(control.label || control.title || '');
}

function optionIcon(m, control, option) {
  if (option && option.icon) return option.icon;
  const ids = (option && option.ids) || [];
  for (const id of ids) {
    const known = PROMPT_NAMES[id] || (m && m.promptById && m.promptById.get(id)
      ? String((m.promptById.get(id) || {}).name || '')
      : '');
    const icon = emojiPrefix(known);
    if (icon) return icon;
  }
  return (control && control.icon) || '';
}

function optionDisplayLabel(m, control, option) {
  const label = option && option.label != null ? String(option.label) : '';
  if (!label) return '';
  if (emojiPrefix(label)) return label;
  return withEmoji(optionIcon(m, control, option), label);
}

/* 只有明确表示“不开/不开（默认）”的选项才走居中留白。
   value:'none' 也可能是“不限”等其它含义，不能只凭空 ids 或 value 判断。 */
function isNoneOption(option) {
  const label = option && option.label != null ? String(option.label) : '';
  const normalized = label.replace(/\s+/g, '').trim();
  return normalized === '不开' || normalized === '不开（默认）' || normalized === '不开(默认)';
}

function sectionTitle(section) {
  if (!section) return '';
  return withEmoji(section.icon || '', section.label || section.title || '');
}

/* --------------------------------------------------------------------------
   主工厂
   -------------------------------------------------------------------------- */
export function createPresetControls(deps = {}) {
  const doc = deps.document || (typeof document !== 'undefined' ? document : null);
  const win = deps.window || (typeof window !== 'undefined' ? window : null);

  let root = null;
  let bodyEl = null;
  let statusEl = null;
  let badgeEl = null;
  let toastEl = null;
  let containerEl = null;
  let compact = false;
  let disposed = false;
  let mounted = false;
  let unsubscribe = null;
  let model = null;
  let lastKey = '';
  let lastPresetName = '';
  let lastScenarioRef = null;
  let pendingRebuild = false;
  let pickerOpen = false;
  let pickerQuery = '';
  /* wordDraft = { min: string, max: string } | null；只存在内存，提交才写 content。 */
  let wordDraft = null;
  let wordToken = null;
  let wordError = '';
  let wordField = 'min';
  let wordLastRange = null;
  let wordCommitTimer = 0;
  let saveTimer = 0;
  let pendingSaveToken = null;
  let pendingSaveReason = '';
  let saveInFlight = false;
  let toastTimer = 0;
  /* 布局编辑（只在 full 预设页）：draft 只存在内存，保存才写设置。 */
  let editing = false;
  let editSections = null;
  let editRemovedControls = [];
  let editRemovedSections = [];
  let layoutError = '';
  let layoutQuery = '';
  let layoutAddTarget = '';
  let editSectionId = '';
  let editOpenUid = '';
  let editSelectedUid = '';
  let editSelectedOption = null;
  let editMoreOpen = false;
  let editGroupPage = 0;
  let newSectionName = '';
  let restoreConfirm = false;
  /* 最近活跃分组：只由用户点 summary / 在组内操作 / 编辑态选组时更新；
     程序性开合不写，避免被 restoreOpenSections 覆盖成最后一组。 */
  let lastActiveSectionId = '';
  let lastActiveSectionName = '';
  /* 进入/退出编辑时的一次性滚动锚点目标，重建后消费。 */
  let pendingEntrySection = '';
  let pendingExitSection = '';
  let pendingOpenSection = '';
  let dragState = null;
  let widthDrag = null;
  let sortDrag = null;
  let sortGhostEl = null;
  let sortClickGuardUntil = 0;
  let sortClickGuardEl = null;
  let sortDropLineEl = null;
  /* 拖动边缘自动滚动 / 滚轮重算落点 的两个 rAF 句柄（清理统一走 removeWidthWindowListeners）。 */
  let dragScrollRaf = 0;
  let dragRecalcRaf = 0;
  let editToken = null;
  let editSaving = false;
  /* 首页常用钉选（PC 自己的契约）：
     - compact + homeEdit：整理模式，只画无开关的排序行；
     - compact + 普通：按钉选顺序画可操作卡片；
     - full + pinMode：点任何条目/选项先钉首页，不调用 apply*；
     - headerHost：cc 标题右侧的宿主节点，只放本模块自己的按钮，dispose 时移除。 */
  let homeEdit = false;
  let homeEditNeedsOpen = false;
  let pinMode = false;
  let pinOnDone = null;
  let pinModeRequest = null;
  let headerHostEl = null;
  let headerEl = null;
  let pinSaving = false;
  let pinDrag = null;
  let pinDragGuardUntil = 0;
  /* 正文编辑（只在 full 预设页）：
     - contentPick：选条目模式，只打开编辑器/列关联条目，绝不切开关、不钉首页、不写布局；
     - contentPickGroup：点组选项/组标题后，用紧凑列表选其中的具体一条；
     - contentEdit：编辑页草稿（draft 只在内存，保存成功才由主 index 写真实 prompt）。 */
  let contentPick = false;
  let contentPickQuery = '';
  let contentPickGroup = null;
  /* 查找面板默认收起；展开后是否显示全部结果（超过 8 条时）。 */
  let contentPickOpen = false;
  let contentPickShowAll = false;
  let contentEdit = null;
  const api = {
    version: PRESET_CONTROLS_VERSION,
    mount,
    refresh,
    dispose,
    getSnapshot,
    captureIdentity,
    resolvePromptId,
    requestPresetSave,
    beginContentEdit,
  };

  /* ------------------------------------------------------------------------
     读取 / 模型
     ------------------------------------------------------------------------ */
  function readSettings() {
    const settings = safeCall(deps.getSettings, null);
    return isPlainObject(settings) ? settings : null;
  }

  /* ------------------------------------------------------------------------
     工具箱 flag（显式 deps 接口；只认白名单，不冒充预设条目）
     ------------------------------------------------------------------------ */
  function toolboxFlagAllowed(key) {
    return TOOLBOX_FLAG_SET.has(text(key)) && TOOLBOX_FLAG_BY_KEY.has(text(key));
  }

  function readToolboxFlag(key) {
    const flag = text(key);
    if (!toolboxFlagAllowed(flag)) return false;
    if (typeof deps.readToolboxFlag !== 'function') return false;
    try {
      return !!deps.readToolboxFlag(flag);
    } catch (e) {
      return false;
    }
  }

  function canUseToolboxFlag(key) {
    return toolboxFlagAllowed(key)
      && typeof deps.readToolboxFlag === 'function'
      && typeof deps.writeToolboxFlag === 'function';
  }

  function writeToolboxFlag(key, want) {
    const flag = text(key);
    if (!toolboxFlagAllowed(flag)) {
      showToast('这个工具箱开关不在支持列表里，已忽略。', 'warn');
      return false;
    }
    if (typeof deps.writeToolboxFlag !== 'function') {
      showToast('工具箱开关接口未就绪，这次没有改任何开关。', 'error');
      return false;
    }
    try {
      const result = deps.writeToolboxFlag(flag, !!want);
      if (result === false) {
        showToast('工具箱开关没有写入。', 'error');
        return false;
      }
    } catch (e) {
      showToast('工具箱开关写入失败：' + humanError(e), 'error');
      return false;
    }
    /* 保存/原 checkbox/通知由主 index 的 writeToolboxFlag 统一负责；
       PC 只刷新本视图，不另写 settings，也不触发预设保存。 */
    refresh({ reason: 'toolbox-flag' });
    return true;
  }

  function readShortcutIds(settings) {
    try {
      const raw = settings && Array.isArray(settings.presetControlShortcuts)
        ? settings.presetControlShortcuts
        : [];
      const hidden = commonHiddenSet(settings);
      const out = [];
      const seen = new Set();
      for (const id of raw) {
        if (typeof id !== 'string' || seen.has(id)) continue;
        if (FIXED_SET.has(id) || hidden.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  function commonHiddenSet(settings) {
    const set = new Set();
    try {
      const raw = settings && Array.isArray(settings[COMMON_HIDDEN_SETTINGS_KEY])
        ? settings[COMMON_HIDDEN_SETTINGS_KEY] : [];
      for (const id of raw) if (typeof id === 'string') set.add(id);
    } catch (e) { /* 坏数据当未隐藏 */ }
    return set;
  }

  function readTheaterMemory(settings) {
    const out = Object.create(null);
    try {
      const raw = settings && isPlainObject(settings.ywpcTheaterMemory) ? settings.ywpcTheaterMemory : null;
      if (!raw) return out;
      for (const id of THEATER_CHILDREN) {
        if (typeof raw[id] === 'boolean') out[id] = raw[id];
      }
    } catch (e) { /* 坏设置只当作没有记忆 */ }
    return out;
  }

  /* ------------------------------------------------------------------------
     首页常用钉选：设置对象 / 默认派生 / 稳定 pin 描述
     ------------------------------------------------------------------------
     pin 只存稳定绑定，不存临时展开的条目 ID 组合：
       { type:'prompt', id }                 单条开关（含 action）
       { type:'radio', key }                 整个单选组（带组小标题）
       { type:'combo', key }                 整个组合组（带组小标题）
       { type:'radio', key, value }          316 旧单选项 pin：读取时整组归一，兼容不删
       { type:'combo', key, value }          316 旧单选项 pin：读取时整组归一，兼容不删
       { type:'comboToggle', key }           组合开关（成员实时从当前模型解析）
       { type:'word', id }                   字数控件
     没有设置键时只派生「默认四常用 + 旧 presetControlShortcuts + common 新增项」；
     查看不写设置；键存在但为空数组时保持为空。旧 option pin 只在视图里归一成
     整组并按组去重，绝不静默改写已存数组、不碰 prompt_order。 */
  function homePinStoreOf(settings) {
    try {
      const raw = settings && settings[HOME_PINS_SETTINGS_KEY];
      return isPlainObject(raw) ? raw : null;
    } catch (e) {
      return null;
    }
  }

  function sanitizeHomePin(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const type = text(raw.type);
    if (!PIN_TYPES.has(type)) return null;
    const uid = text(raw.uid);
    /* sourceUid 只用于“这个首页项继承哪一份布局控件”的展示绑定，
       与 pin 自己的实例 uid 严格分开：uid 表示首页这一份，sourceUid 表示来源控件。 */
    const sourceUid = text(raw.sourceUid);
    const withUid = pin => {
      let clean = uid ? { ...pin, uid } : pin;
      if (sourceUid) clean = { ...clean, sourceUid };
      return raw.source === 'common' ? { ...clean, source: 'common' } : clean;
    };
    if (type === 'spacer') {
      const key = text(raw.key) || uid;
      if (!key) return null;
      const width = explicitLayoutWidth(raw.width) || 6;
      return { type, key, width, uid: uid || key };
    }
    if (type === 'prompt') {
      const id = text(raw.id);
      if (!id) return null;
      return withUid({ type, id });
    }
    if (type === 'comboToggle') {
      const key = text(raw.key);
      return key ? withUid({ type, key }) : null;
    }
    if (type === 'word') {
      const id = text(raw.id);
      return id ? withUid({ type, id }) : null;
    }
    if (type === 'toolboxFlag') {
      const key = text(raw.key) || text(raw.flag);
      /* 只认显式白名单；坏 pin 不静默冒充别的条目。 */
      if (!key || !TOOLBOX_FLAG_SET.has(key) || !TOOLBOX_FLAG_BY_KEY.has(key)) return null;
      return withUid({ type, key });
    }
    const key = text(raw.key);
    if (!key) return null;
    const value = text(raw.value);
    /* radio/combo 不带 value = 整组；带 value = 316 旧单选项 pin，读取兼容。 */
    return withUid(value ? { type, key, value } : { type, key });
  }

  function pinInstanceBase(pin) {
    if (!pin) return '';
    if (pin.type === 'prompt') return 'prompt:' + pin.id;
    if (pin.type === 'word') return 'word:' + pin.id;
    if (pin.type === 'comboToggle') return 'comboToggle:' + pin.key;
    if (pin.type === 'spacer') return 'spacer:' + pin.key;
    return pin.type + ':' + pin.key;
  }

  function nextPinInstanceUid(pins, pin) {
    const base = text(pin && pin.uid) || pinInstanceBase(pin);
    const root = base.replace(/#\d+$/, '');
    const used = new Set((Array.isArray(pins) ? pins : []).map(item => text(item && item.uid)).filter(Boolean));
    let seq = 2;
    while (used.has(root + '#' + seq)) seq += 1;
    return root + '#' + seq;
  }

  function homePinBaseKey(pin) {
    const clean = sanitizeHomePin(pin);
    if (!clean) return '';
    const base = { ...clean };
    delete base.uid;
    return homePinKey(base);
  }

  /* 默认补齐判重用：radio/combo 忽略旧 option 的 value，prompt 兼容已核实际 ID。
     只用于“这个默认项是否已经存在”，不拿它改写用户原 pin。 */
  function homePinMatchesDefault(item, wanted) {
    const a = sanitizeHomePin(item);
    const b = sanitizeHomePin(wanted);
    if (!a || !b || a.type !== b.type) return false;
    if (a.type === 'prompt') {
      if (a.id === b.id) return true;
      return STORE_PROMPT_ALIASES.some(alias => alias.canonical === b.id && alias.actual === a.id);
    }
    if (a.type === 'radio' || a.type === 'combo') return a.key === b.key;
    if (a.type === 'comboToggle') return a.key === b.key;
    if (a.type === 'word') return a.id === b.id;
    if (a.type === 'toolboxFlag') return a.key === b.key;
    if (a.type === 'spacer') return a.key === b.key;
    return false;
  }

  /* 显式 pins 已存在时，common 追加提交路径同步追加一个首页 pin。
     只在设置里追加，不做渲染期强补；重复项允许，已有 uid/顺序原样保留。 */
  function storedHomePinContext(settings) {
    const store = homePinStoreOf(settings);
    if (!store) return null;
    const name = text(safeCall(deps.getCurrentPresetName, '') || '').trim();
    if (!name) return null;
    const key = presetLayoutKey(name, CHARACTER_ID);
    if (!Object.prototype.hasOwnProperty.call(store, key)) return null;
    if (!Array.isArray(store[key])) return null;
    return { store, key };
  }

  function appendHomePinForCommon(settings, pin, shortcut = false) {
    const ctx = storedHomePinContext(settings);
    if (!ctx) return null;
    let clean = sanitizeHomePin(pin);
    if (!clean) return null;
    const current = normalizeHomePins(ctx.store[ctx.key]);
    if (current.some(item => homePinBaseKey(item) === homePinBaseKey(clean))) {
      clean = { ...clean, uid: nextPinInstanceUid(current, clean) };
    }
    if (shortcut) clean = { ...clean, source: 'common' };
    let at = current.length;
    if (shortcut) {
      const lastCommon = current.reduce((last, item, index) => item.source === 'common'
        || (item.type === 'prompt' && DEFAULT_COMMON_IDS.includes(item.id)) ? index : last, -1);
      at = lastCommon + 1;
    }
    current.splice(at, 0, clean);
    /* 已保存 pin 的用户顺序是唯一权威：追加后不再按 niah/常用默认做硬归位。 */
    ctx.store[ctx.key] = current;
    return current;
  }

  function removeCommonHomePin(settings, id) {
    const ctx = storedHomePinContext(settings);
    if (!ctx) return;
    const pins = normalizeHomePins(ctx.store[ctx.key]);
    const tagged = pins.some(pin => pin.type === 'prompt' && pin.id === id && pin.source === 'common');
    const legacyIndex = tagged ? -1 : pins.reduce((last, pin, index) =>
      pin.type === 'prompt' && pin.id === id ? index : last, -1);
    ctx.store[ctx.key] = pins.filter((pin, index) => {
      if (pin.type !== 'prompt' || pin.id !== id) return true;
      // 旧版常用追加在末尾；只撤一份，保留更早手动钉选的副本。
      return tagged ? pin.source !== 'common' : index !== legacyIndex;
    });
  }

  /* 布局里新加到 common 的控件 → 首页 pin 描述；toolboxFlag 不在这里自动落 pin
     （随机头部改由独立 pin/迁移维护），说明/缺项同样不落。 */
  function homePinForLayoutControl(control) {
    if (!control) return null;
    if (control.kind === 'toggle' || control.kind === 'action') {
      return control.id ? { type: 'prompt', id: control.id } : null;
    }
    if (control.kind === 'comboToggle') return control.key ? { type: 'comboToggle', key: control.key } : null;
    if (control.kind === 'radio') return control.key ? { type: 'radio', key: control.key } : null;
    if (control.kind === 'combo') return control.key ? { type: 'combo', key: control.key } : null;
    if (control.kind === 'word') return control.id ? { type: 'word', id: control.id } : null;
    return null;
  }

  function newCommonHomePins(previousSections, editedSections) {
    const previous = (Array.isArray(previousSections) ? previousSections : [])
      .find(section => section && section.id === 'common');
    const next = (Array.isArray(editedSections) ? editedSections : [])
      .find(section => section && section.id === 'common');
    /* 没有旧 common 基准就不猜“哪些是新增”，避免把整组控件一次塞进首页。 */
    if (!previous || !next) return [];
    const previousUids = new Set((previous.controls || []).map(controlUid));
    const out = [];
    for (const control of next.controls || []) {
      if (previousUids.has(controlUid(control))) continue;
      const pin = homePinForLayoutControl(control);
      if (pin) out.push(pin);
    }
    return out;
  }

  function normalizeHomePins(list) {
    const out = [];
    const seenKeys = new Set();
    const mergedGroups = new Set();
    for (const item of (Array.isArray(list) ? list : [])) {
      const pin = sanitizeHomePin(item);
      if (!pin) continue;
      if (pin.type === 'radio' || pin.type === 'combo') {
        if (pin.value) {
          /* 316 旧 option pin：同组多个选项仍合并成一个整组，保持旧去重行为。 */
          const groupKey = pin.type + ':' + pin.key;
          if (mergedGroups.has(groupKey) || seenKeys.has(groupKey)) continue;
          mergedGroups.add(groupKey);
          out.push({ type: pin.type, key: pin.key });
          seenKeys.add(groupKey);
          continue;
        }
      }
      /* 所有 pin 类型都按实例 uid 区分；缺 uid 的重复项确定性补 #n，
         旧的无 uid 单项（不重复）保持原 key 不变。 */
      let clean = pin;
      let key = homePinKey(clean);
      if (!key) continue;
      if (seenKeys.has(key)) {
        const uid = nextPinInstanceUid(out, clean);
        clean = { ...clean, uid };
        key = homePinKey(clean);
      }
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      out.push(clean);
    }
    return out;
  }

  function homePinKey(pin) {
    const clean = sanitizeHomePin(pin);
    if (!clean) return '';
    let key;
    if (clean.type === 'prompt') key = 'prompt:' + clean.id;
    else if (clean.type === 'comboToggle') key = 'comboToggle:' + clean.key;
    else if (clean.type === 'word') key = 'word:' + clean.id;
    else if (clean.type === 'spacer') key = 'spacer:' + clean.key;
    else if (!clean.value) key = clean.type + ':' + clean.key;
    else key = clean.type + ':' + clean.key + '=' + clean.value;
    return clean.uid ? key + '@' + clean.uid : key;
  }

  function encodeHomePin(pin) {
    try {
      return encodeURIComponent(JSON.stringify(sanitizeHomePin(pin)));
    } catch (e) {
      return '';
    }
  }

  function decodeHomePin(raw) {
    try {
      return sanitizeHomePin(JSON.parse(decodeURIComponent(String(raw == null ? '' : raw))));
    } catch (e) {
      return null;
    }
  }

  function storedHomePinsFor(settings, name, available, derivedPins) {
    const store = homePinStoreOf(settings);
    if (!store) return null;
    const key = presetLayoutKey(name, CHARACTER_ID);
    if (!Object.prototype.hasOwnProperty.call(store, key)) return null;
    const raw = store[key];
    if (!Array.isArray(raw)) return null;
    migrateHomePinsOnce(settings, key, raw, available, derivedPins);
    /* 只做视图归一：旧 option pin ⇒ 整组；显式重复实例保留。原数组留在设置里。 */
    return normalizeHomePins(raw);
  }

  /* 默认升级（一次迁移）：
     - 321 新增的两条段落 prompt pin ⇒ 合成一个完整的 writing.paragraph 单选组，
       放在首个段落 pin 原来的位置；其它 pin（含重复实例 uid）原样保留。
     - 更早版本从未迁移过的非空 pins：补一个段落组默认项（只补当前预设真实存在的）。
     - 已有明确段落组副本不去重、不清洗；用户删掉后标记已升级，不再复活。
     - v4 给尚未补齐的非空首页增加思维链整组，和新装同一个默认来源；不切换组内选项。
     - v6 把旧版 niah 的自动伴生随机头补成显式 pin（紧接 niah 一次），
       兼容旧首页外观；之后用户在首页删掉它，版本已是 6，不会复活。
     空数组 = 用户明确清空，尊重不动（只标已升级）。 */
  function migrateHomePinsOnce(settings, key, raw, available, derivedPins) {
    try {
      let marks = settings[HOME_DEFAULTS_VERSION_KEY];
      if (!isPlainObject(marks)) { marks = {}; settings[HOME_DEFAULTS_VERSION_KEY] = marks; }
      const previous = Number(marks[key]) || 0;
      if (previous >= HOME_DEFAULTS_VERSION) return false;
      marks[key] = HOME_DEFAULTS_VERSION;
      let changed = false;
      const usable = id => !available || Object.prototype.hasOwnProperty.call(available, id);
      const paragraphIdSet = new Set(PARAGRAPH_PROMPT_IDS);
      const isParagraphPrompt = pin => !!pin && pin.type === 'prompt' && paragraphIdSet.has(String(pin.id || ''));
      const hasGroup = () => raw.some(pin => pin && (pin.type === 'radio' || pin.type === 'combo')
        && String(pin.key || '') === PARAGRAPH_RADIO_KEY);
      if (raw.length) {
        const firstIndex = raw.findIndex(isParagraphPrompt);
        if (firstIndex >= 0) {
          const groupExists = hasGroup();
          const next = [];
          raw.forEach((pin, index) => {
            if (isParagraphPrompt(pin)) {
              /* 已有明确段落组副本：只移除旧的自动 prompt，不新添第二个组。 */
              if (!groupExists && index === firstIndex) next.push({ type: 'radio', key: PARAGRAPH_RADIO_KEY });
              return;
            }
            next.push(pin);
          });
          raw.splice(0, raw.length, ...next);
          changed = true;
        } else if (previous < 2 && !hasGroup()
          && (usable(ID.paragraphAlt) || usable(ID.paragraphLong))) {
          raw.push({ type: 'radio', key: PARAGRAPH_RADIO_KEY });
          changed = true;
        }
        /* v5：叙述风格整组一次性进首页。
           - 旧 fresh/酸涩独立 prompt pin：在第一条原位置合成整组，其它 pin 与重复 uid 不动。
           - 没有旧独立 pin：整组插在段落组正下方；没有段落组时放末尾。
           - 已有整组：尊重用户位置与重复实例，不塞第二组；只清掉旧独立 prompt pin。
           显式空数组不进入本分支，保持空。 */
        if (previous < 5) {
          const narrationIds = new Set(NARRATION_PROMPT_IDS);
          const isNarrationPrompt = pin => !!pin && pin.type === 'prompt'
            && narrationIds.has(String(pin.id || ''));
          const hasNarrationGroup = () => raw.some(pin => pin
            && (pin.type === 'radio' || pin.type === 'combo')
            && String(pin.key || '') === NARRATION_RADIO_KEY);
          const groupExists = hasNarrationGroup();
          const firstNarration = raw.findIndex(isNarrationPrompt);
          if (firstNarration >= 0) {
            const next = [];
            raw.forEach((pin, index) => {
              if (isNarrationPrompt(pin)) {
                if (!groupExists && index === firstNarration) {
                  next.push({ type: 'radio', key: NARRATION_RADIO_KEY });
                }
                return;
              }
              next.push(pin);
            });
            raw.splice(0, raw.length, ...next);
            changed = true;
          } else if (!groupExists) {
            const paragraphIndex = raw.findIndex(pin => pin
              && (pin.type === 'radio' || pin.type === 'combo')
              && String(pin.key || '') === PARAGRAPH_RADIO_KEY);
            raw.splice(paragraphIndex >= 0 ? paragraphIndex + 1 : raw.length, 0,
              { type: 'radio', key: NARRATION_RADIO_KEY });
            changed = true;
          }
        }
        if (previous < 4 && !raw.some(pin => pin && pin.type === HOME_THINKING_PIN.type
          && pin.key === HOME_THINKING_PIN.key)) {
          raw.push({ ...HOME_THINKING_PIN });
          changed = true;
        }
        /* v6：旧版随机头部只作为 niah 的伴生渲染，没有落 pin。
           已有 niah 的旧首页补一枚独立的随机头 pin，位置紧接第一条 niah（旧伴生位置）；
           没有 niah 的首页不强塞；已有随机头 pin 的首页不动。 */
        if (previous < 6 && !raw.some(pin => pin && pin.type === HOME_RAND_HEAD_PIN.type
          && (pin.key === HOME_RAND_HEAD_PIN.key || pin.flag === HOME_RAND_HEAD_PIN.key))) {
          const niahIndex = raw.findIndex(pin => pin && pin.type === 'prompt' && pin.id === ID.niah);
          if (niahIndex >= 0) {
            raw.splice(niahIndex + 1, 0, { ...HOME_RAND_HEAD_PIN });
            changed = true;
          }
        }
        /* v6 同一轮补齐 NSFW/剧情默认入口：只向非空首页追加缺失项（固定顺序），
           已有项不动、不重复；显式空数组不进入本分支，保留用户清空。 */
        if (previous < 6) {
          for (const pin of HOME_DEFAULT_EXTRA_PINS) {
            if (raw.some(item => homePinMatchesDefault(item, pin))) continue;
            raw.push({ ...pin });
            changed = true;
          }
        }
        /* v7：只给“可证明仍是未自改的默认快照”的首页补一枚半行空白块
           （NSFW 状态快照之后、主线之前）。比较按条目语义，不按字面 ID 猜；
           自定义顺序、已有空块、显式空数组一律不动；无论是否插入都标记 7，
           用户之后移走/删除不会再复活。 */
        if (previous < 7 && !raw.some(pin => pin && pin.type === 'spacer')) {
          const plainRaw = raw.filter(pin => pin && pin.type !== 'spacer');
          const plainDerived = (Array.isArray(derivedPins) ? derivedPins : [])
            .filter(pin => pin && pin.type !== 'spacer');
          const sameDefault = plainDerived.length > 0
            && plainRaw.length === plainDerived.length
            && plainRaw.every((pin, index) => homePinMatchesDefault(pin, plainDerived[index]));
          if (sameDefault) {
            const snapshotAt = raw.findIndex(pin => pin && pin.type === 'prompt'
              && pin.id === ID.nsfwSnapshot);
            const mainlineAt = raw.findIndex(pin => pin && pin.type === 'prompt'
              && pin.id === ID.mainline);
            const at = snapshotAt >= 0 ? snapshotAt + 1 : mainlineAt;
            if (at >= 0) {
              raw.splice(at, 0, { ...HOME_MAINLINE_SPACER_PIN });
              changed = true;
            }
          }
        }
      }
      /* v8：作者定稿首页顺序。未改动的旧默认整体升级；自定义序只在最前补两项，
         显式清空仍保留；标记后不复活删除项。只改显示，不改预设开关。 */
      if (previous < 8 && raw.length) {
        const lead = [ID.loveUser, ID.antiSunshine];
        const olderDefault = (Array.isArray(derivedPins) ? derivedPins : []).filter(pin => !lead.includes(pin.id));
        const unmodified = raw.length === olderDefault.length && raw.every((pin, i) => homePinMatchesDefault(pin, olderDefault[i]));
        if (unmodified) raw.splice(0, raw.length, ...derivedPins.map(pin => ({ ...pin })));
        else for (let i = lead.length - 1; i >= 0; i--) {
          const pin = { type: 'prompt', id: lead[i] };
          if (!raw.some(item => homePinMatchesDefault(item, pin))) raw.unshift(pin);
        }
        changed = true;
      }
      persistSettings();
      return changed;
    } catch (e) {
      return false;
    }
  }

  function derivedHomePinsFor(settings, shortcuts, sections) {
    const out = [];
    const seen = new Set();
    const push = (pin) => {
      const clean = sanitizeHomePin(pin);
      if (!clean) return;
      const key = homePinKey(clean);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    };
    /* 默认四常用、思维链整组和段落风格；只放入口，不替用户切换预设开关。 */
    const hidden = commonHiddenSet(settings);
    for (const id of DEFAULT_COMMON_IDS) if (!hidden.has(id)) push({ type: 'prompt', id });
    for (const id of (Array.isArray(shortcuts) ? shortcuts : [])) push({ type: 'prompt', id, source: 'common' });
    const common = (Array.isArray(sections) ? sections : []).find(section => section && section.id === 'common');
    for (const control of (common && common.controls) || []) {
      if (!control) continue;
      if (control.kind === 'toggle' || control.kind === 'action') {
        push({ type: 'prompt', id: control.id });
      } else if (control.kind === 'comboToggle') {
        push({ type: 'comboToggle', key: control.key });
      } else if (control.kind === 'missing') {
        const ref = control._ref || null;
        if (ref && ref.type === 'prompt' && ref.id) push({ type: 'prompt', id: ref.id });
      }
    }
    /* 新增默认三项：放在常用区之后、思维链组之前；缺项照旧渲染为禁用卡片。
       随机头部独立成 pin，并插在真正的第一条 niah 后面（旧伴生位置）；
       niah 若已被常用/快捷项提前加入，也不会跑到三项之后。 */
    for (const id of HOME_EXTRA_PIN_IDS) push({ type: 'prompt', id });
    const randKey = homePinKey(HOME_RAND_HEAD_PIN);
    if (!seen.has(randKey)) {
      const niahAt = out.findIndex(pin => pin && pin.type === 'prompt' && pin.id === ID.niah);
      out.splice(niahAt >= 0 ? niahAt + 1 : out.length, 0, { ...HOME_RAND_HEAD_PIN });
      seen.add(randKey);
    }
    push({ ...HOME_THINKING_PIN });
    push({ type: 'radio', key: PARAGRAPH_RADIO_KEY });
    push({ type: 'radio', key: NARRATION_RADIO_KEY });
    /* 与 v6 升级补齐同一份顺序：追加在现有默认末尾，已有默认相对序不变。 */
    for (const pin of HOME_DEFAULT_EXTRA_PINS) push({ ...pin });
    /* 默认首页在「NSFW 状态快照」之后、「主线」之前放一枚半行空白块，
       让四项剧情开关从下一行开始；它只是默认项，用户可移走/删除，之后不复活。 */
    const snapshotAt = out.findIndex(pin => pin.type === 'prompt' && pin.id === ID.nsfwSnapshot);
    const mainlineAt = out.findIndex(pin => pin.type === 'prompt' && pin.id === ID.mainline);
    const spacerAt = snapshotAt >= 0 ? snapshotAt + 1 : (mainlineAt >= 0 ? mainlineAt : out.length);
    out.splice(spacerAt, 0, { ...HOME_MAINLINE_SPACER_PIN });
    return out;
  }

  function effectiveHomePinsFor(settings, name, shortcuts, sections, available) {
    const derived = derivedHomePinsFor(settings, shortcuts, sections);
    const stored = storedHomePinsFor(settings, name, available, derived);
    /* 已保存 pin 的用户顺序是唯一权威：不再按 niah/默认常用归位，也不补回已删项。
       派生默认仍按新装顺序，随机头是 niah 之后的独立 pin。 */
    if (stored) return { pins: stored, stored: true };
    return { pins: derived, stored: false };
  }

  /* 完整预设页 think_meta：Part2 → niah → 随机头部；其它控件相对序不变。
     旧保存布局若把随机头追加到组尾，这里把它接回 niah 后面。 */
  function orderSpecialThinkControls(controls) {
    if (!Array.isArray(controls)) return controls;
    const list = controls.slice();
    const isPart2 = control => !!control && control.kind === 'toggle' && control.id === ID.break2;
    const isNiah = control => !!control && control.kind === 'toggle' && control.id === ID.niah;
    const isRand = control => !!control
      && control.kind === 'toolboxFlag' && control.flag === TOOLBOX_FLAG_RAND_HEAD;
    let changed = false;
    let niahIndex = list.findIndex(isNiah);
    const part2Index = list.findIndex(isPart2);
    if (part2Index >= 0 && niahIndex >= 0 && niahIndex !== part2Index + 1) {
      const moved = list.splice(niahIndex, 1)[0];
      const anchor = list.findIndex(isPart2);
      list.splice((anchor >= 0 ? anchor : part2Index) + 1, 0, moved);
      changed = true;
      niahIndex = list.findIndex(isNiah);
    }
    const randIndex = list.findIndex(isRand);
    if (niahIndex >= 0 && randIndex >= 0 && randIndex !== niahIndex + 1) {
      const moved = list.splice(randIndex, 1)[0];
      const anchor = list.findIndex(isNiah);
      list.splice((anchor >= 0 ? anchor : niahIndex) + 1, 0, moved);
      changed = true;
    }
    return changed ? list : controls;
  }

  function orderSpecialThinkSections(sections) {
    const list = Array.isArray(sections) ? sections : [];
    let changed = false;
    const out = list.map(section => {
      if (!section || section.id !== 'think_meta') return section;
      const before = Array.isArray(section.controls) ? section.controls : [];
      /* 用户显式放了空白块 = 明确排过版；不再用旧伴侣顺序强行搬动，避免把空块挤走。 */
      if (before.some(control => control && control.kind === 'spacer')) return section;
      const next = orderSpecialThinkControls(before);
      if (next === before) return section;
      changed = true;
      return Object.assign({}, section, { controls: next });
    });
    return changed ? out : list;
  }

  function homePinSignatureOf(state) {
    const list = (state && state.pins) || [];
    return (state && state.stored ? 'S' : 'D') + list.map(pin => homePinKey(pin)
      + (pin.type === 'spacer' ? '=' + (pin.width || 6) : '')
      + (pin.sourceUid ? '^' + pin.sourceUid : '')).join(',');
  }

  /* ------------------------------------------------------------------------
     已保存布局的最小兼容迁移（只处理旧内置默认；用户自建内容一律不动）
     - 组归属变了（闲适/XP/轻G 去 NSFW、四写作项与段落组进 writing、
       防道歉移到 Part2 后、思想与功能收尾）：只有“分组标题仍是旧默认名
       且控件逐项等于旧内置顺序、全部是 builtin 默认 ref”的整组才重建。
     - 其它情况只把“已换组的 builtin 默认 ref”从旧组移除，由新默认组补回；
       prompt 自建副本、改名、用户排序、uid 重复项全部原样保留。
     - 分组顺序只在整份保存布局仍是旧默认顺序时更新；用户排过序就不动。
     返回浅拷贝，不写设置、不改保存对象本身。 */
  const LEGACY_DEFAULT_SECTION_ORDER = Object.freeze([
    'think_meta', 'common', 'writing', 'nsfw', 'pov', 'psych_input', 'output', 'length', 'theater', 'plot',
  ]);
  const LEGACY_SECTION_TITLES = Object.freeze({
    think_meta: ['思考与功能'],
    writing: ['写作要求'],
    nsfw: ['取向'],
  });
  const LEGACY_WRITING_IDS = Object.freeze([
    ID.wStyleAuto, ID.wStyleAutoOld, ID.wStyleSeam, ID.wFresh, ID.wCinematic, ID.wSoft,
    ID.wNoCopySet, ID.wEnsemble, ID.wParallel, ID.wShowTell, ID.wEmotion, ID.wMouth,
    ID.wDaily, ID.wFavor, ID.wIntimate, ID.wSlow, ID.wNp, ID.wFocusUser, ID.wJinjiang,
    ID.wOutfit, ID.wMaleVisual, ID.wMaterial, ID.wFood, ID.wAntiHomo, ID.wThunder,
    ID.wBanList, ID.wElbow, ID.wAntiStereo, ID.wEdge, ID.wXp, ID.wLightG,
  ]);
  const LEGACY_WRITING_KEYS = Object.freeze(LEGACY_WRITING_IDS.map(id => 'builtin:toggle:' + id));
  const LEGACY_NSFW_KEYS = Object.freeze([
    'builtin:group:nsfw.orientation',
    'builtin:toggle:' + ID.nsfwCarnal,
    'builtin:toggle:' + ID.nsfwMoanGuide,
    'builtin:toggle:' + ID.moanHeart,
    'builtin:toggle:' + ID.nsfwDirtyTalk,
  ]);
  const LEGACY_THINK_META_KEYS = Object.freeze([
    'builtin:group:think.length',
    'builtin:group:think.model',
    'builtin:toggle:' + ID.niah,
    'builtin:toggle:' + ID.break1,
    'builtin:toggle:' + ID.break2,
    'builtin:toggle:' + ID.mutter,
    'builtin:toggle:' + ID.summon,
    'builtin:group:meta.summary',
    'builtin:group:meta.outline',
  ]);
  const LEGACY_SECTION_KEYS = Object.freeze({
    writing: LEGACY_WRITING_KEYS,
    nsfw: LEGACY_NSFW_KEYS,
    think_meta: LEGACY_THINK_META_KEYS,
  });

  function savedControlKey(control) {
    return control && control.ref ? refKey(control.ref) : '';
  }

  function migrateSavedLayoutForDefs(saved, sections) {
    if (!saved || !Array.isArray(saved.sections)) return saved;
    const baseList = Array.isArray(sections) ? sections : [];
    const baseSectionById = new Map(baseList.map(section => [text(section.id), section]));
    const homeOfRef = new Map();
    for (const section of baseList) {
      for (const control of section.controls || []) {
        const ref = controlRef(control);
        if (!ref || ref.type !== 'builtin') continue;
        const key = refKey(ref);
        if (!homeOfRef.has(key)) homeOfRef.set(key, text(section.id));
      }
    }
    let changed = false;
    /* 旧布局里 builtin 鲜活/酸涩独立 toggle ⇒ 收窄成一个叙述组：
       - 已有整组（或同份布局里已出现组）就只去掉旧 builtin，不再塞第二组；
       - 用户自定义 prompt 副本（ref.type === 'prompt'）一律不碰。
       只影响读取时的兼容视图，不回写 presetControlLayouts。 */
    let narrationGroupPresent = false;
    for (const section of saved.sections) {
      for (const control of (section && Array.isArray(section.controls) ? section.controls : [])) {
        if (control && control.ref && control.ref.type === 'builtin'
          && refKey(control.ref) === 'builtin:group:' + NARRATION_RADIO_KEY) {
          narrationGroupPresent = true;
        }
      }
    }
    const isLegacyNarrationBuiltin = control => !!control && control.ref && control.ref.type === 'builtin'
      && (control.ref.key === 'toggle:' + ID.wFresh || control.ref.key === 'toggle:' + ID.wBitter);
    /* 作者 2026-11-13：内置「自适应文风(旧)」不再显示。只收窄 builtin ref；
       用户自建 prompt 副本（ref.type === 'prompt'）原样保留，不删 prompt 本体。 */
    const isRetiredBuiltinWritingOld = control => !!control && control.ref
      && control.ref.type === 'builtin' && control.ref.key === 'toggle:' + ID.wStyleAutoOld;
    /* 反刻板内置 ref 已从写作移到 NSFW：旧组（含用户自建分组）里的 builtin
       由新 NSFW 默认组补回；用户自建 prompt 副本不动。 */
    const isMovedBuiltinAntiStereo = control => !!control && control.ref
      && control.ref.type === 'builtin' && control.ref.key === 'toggle:' + ID.wAntiStereo;
    const narrationGroupSavedControl = () => ({
      uid: 'builtin:group:' + NARRATION_RADIO_KEY,
      ref: { type: 'builtin', key: 'group:' + NARRATION_RADIO_KEY },
      title: '叙述风格',
      sub: '',
      icon: '',
    });
    const outSections = [];
    for (const section of saved.sections) {
      if (!isPlainObject(section)) { outSections.push(section); continue; }
      const sid = text(section.id);
      const baseSection = baseSectionById.get(sid);
      if (!baseSection || section.custom === true) {
        /* 用户自建分组原样保留；只有旧内置 fresh/酸涩 toggle 本身收窄成组，
           prompt 自定义副本和其它控件一律不动。 */
        const sourceControls = Array.isArray(section.controls) ? section.controls : [];
        let localChanged = false;
        const kept = [];
        for (const control of sourceControls) {
          if (isRetiredBuiltinWritingOld(control) || isMovedBuiltinAntiStereo(control)) {
            localChanged = true;
            continue;
          }
          if (isLegacyNarrationBuiltin(control)) {
            localChanged = true;
            if (!narrationGroupPresent) {
              narrationGroupPresent = true;
              kept.push(narrationGroupSavedControl());
            }
            continue;
          }
          kept.push(control);
        }
        if (localChanged) {
          changed = true;
          outSections.push({ ...section, controls: kept });
        } else {
          outSections.push(section);
        }
        continue;
      }
      const controls = Array.isArray(section.controls) ? section.controls : [];
      const legacyKeys = LEGACY_SECTION_KEYS[sid];
      const savedTitle = text(section.title);
      const titleIsLegacy = !savedTitle || savedTitle === text(baseSection.label)
        || (LEGACY_SECTION_TITLES[sid] || []).includes(savedTitle);
      const keys = controls.map(savedControlKey);
      const defaultShape = !!legacyKeys && titleIsLegacy
        && keys.length === legacyKeys.length
        && keys.every((key, index) => key === legacyKeys[index])
        && controls.every(control => control && control.ref && control.ref.type === 'builtin');
      if (defaultShape) {
        outSections.push({
          ...section,
          title: text(baseSection.label),
          icon: text(baseSection.icon || section.icon),
          controls: (baseSection.controls || []).map(control => {
            const ref = controlRef(control);
            return {
              uid: controlUid(control),
              ref,
              title: text(control.label || ''),
              sub: text(control.sub || ''),
              icon: text(control.icon || ''),
            };
          }),
        });
        if ((baseSection.controls || []).some(control => control
          && control.kind === 'radio' && control.key === NARRATION_RADIO_KEY)) {
          narrationGroupPresent = true;
        }
        changed = true;
        continue;
      }
      const kept = [];
      for (const control of controls) {
        if (!control || !control.ref || control.ref.type !== 'builtin') { kept.push(control); continue; }
        if (isRetiredBuiltinWritingOld(control)) {
          changed = true;
          continue;
        }
        if (isLegacyNarrationBuiltin(control)) {
          changed = true;
          if (!narrationGroupPresent) {
            narrationGroupPresent = true;
            kept.push(narrationGroupSavedControl());
          }
          continue;
        }
        const target = homeOfRef.get(refKey(control.ref));
        if (target && target !== sid) { changed = true; continue; }
        kept.push(control);
      }
      outSections.push(kept.length === controls.length ? section : { ...section, controls: kept });
    }
    const ids = outSections.map(section => (section ? text(section.id) : ''));
    let orderChanged = false;
    if (ids.length === LEGACY_DEFAULT_SECTION_ORDER.length
      && ids.every((id, index) => id === LEGACY_DEFAULT_SECTION_ORDER[index])) {
      const byId = new Map(outSections.map(section => [text(section && section.id), section]));
      const next = [];
      for (const id of SECTION_ORDER) {
        if (byId.has(id)) { next.push(byId.get(id)); byId.delete(id); }
      }
      for (const section of outSections) {
        const id = text(section && section.id);
        if (byId.has(id)) { next.push(byId.get(id)); byId.delete(id); }
      }
      if (next.length === outSections.length) {
        outSections.splice(0, outSections.length, ...next);
        orderChanged = true;
      }
    }
    return changed || orderChanged ? { ...saved, sections: outSections } : saved;
  }

  function buildModel() {
    const oai = safeCall(deps.getOaiSettings, null);
    const scenario = findScenario(oai);
    const orderMap = scenarioOrderMap(scenario);
    const rawToggles = safeCall(deps.readToggles, null);
    const settings = readSettings();
    const name = text(safeCall(deps.getCurrentPresetName, '') || '').trim();
    const toggles = Object.create(null);

    if (isPlainObject(rawToggles)) {
      for (const id of Object.keys(rawToggles)) {
        if (!hasOwn(orderMap, id)) continue;          // 只认 100001 这一组里的条目
        if (typeof rawToggles[id] === 'boolean') toggles[id] = rawToggles[id];
      }
    }
    for (const id of Object.keys(orderMap)) {
      if (!hasOwn(toggles, id)) toggles[id] = orderMap[id];
    }

    let prompts = null;
    try {
      prompts = oai && Array.isArray(oai.prompts) ? oai.prompts : null;
    } catch (e) { prompts = null; }
    const promptById = new Map();
    if (prompts) {
      for (const prompt of prompts) {
        if (prompt && typeof prompt.identifier === 'string') promptById.set(prompt.identifier, prompt);
      }
    }

    const actualIds = Object.create(null);
    const promptIdCounts = new Map(), orderIdCounts = new Map(), promptsByName = new Map();
    for (const prompt of prompts || []) {
      if (!prompt || typeof prompt.identifier !== 'string') continue;
      promptIdCounts.set(prompt.identifier, (promptIdCounts.get(prompt.identifier) || 0) + 1);
      const exactName = typeof prompt.name === 'string' ? prompt.name.trim() : '';
      if (exactName) {
        if (!promptsByName.has(exactName)) promptsByName.set(exactName, []);
        promptsByName.get(exactName).push(prompt);
      }
    }
    for (const row of Array.isArray(scenario?.order) ? scenario.order : []) {
      if (row && typeof row.identifier === 'string') orderIdCounts.set(row.identifier, (orderIdCounts.get(row.identifier) || 0) + 1);
    }
    const definitionsByName = new Map();
    for (const canonical of ALL_KNOWN_IDS) {
      const exactName = String(PROMPT_NAMES[canonical] || '').trim();
      if (!exactName) continue;
      if (!definitionsByName.has(exactName)) definitionsByName.set(exactName, []);
      definitionsByName.get(exactName).push(canonical);
    }
    const claimed = new Set();
    function bindFallback(canonical, prompt) {
      if (promptById.has(canonical) || orderIdCounts.has(canonical)) return false;
      if (!prompt || !isOrdinaryPrompt(prompt)) return false;
      const actual = prompt.identifier;
      if (KNOWN_ID_SET.has(actual) || claimed.has(actual) || promptIdCounts.get(actual) !== 1
        || orderIdCounts.get(actual) !== 1 || !hasOwn(orderMap, actual)) return false;
      actualIds[canonical] = actual;
      claimed.add(actual);
      promptById.set(canonical, prompt);
      orderMap[canonical] = orderMap[actual];
      toggles[canonical] = toggles[actual];
      return true;
    }
    // 已核别名仍按编号优先；同名副本不遮住这条已经确认的身份。
    for (const alias of STORE_PROMPT_ALIASES) {
      const prompt = promptById.get(alias.actual);
      if (prompt && String(prompt.name || '').trim() === alias.name.trim()) bindFallback(alias.canonical, prompt);
    }
    // 仅内置定义可按完整准确名字兜底；不去emoji、不去副本/旧版/数字后缀，不改真实预设。
    for (const [exactName, definitions] of definitionsByName) {
      if (definitions.length !== 1) continue;
      const matches = promptsByName.get(exactName) || [];
      if (matches.length === 1) bindFallback(definitions[0], matches[0]);
    }
    const wordPrompt = promptById.get(LENGTH_PROMPT_ID) || null;
    let wordState = 'missing';
    let wordValue = null;
    let wordRule = null;
    let wordProblem = '';
    if (wordPrompt) {
      try {
        wordRule = readEditableLengthRule(wordPrompt.content);
        wordValue = wordRule.min;
        wordState = 'ok';
      } catch (e) {
        wordState = 'bad';
        wordProblem = e && e.message ? String(e.message) : '内容格式不对';
      }
    }

    const savedLayout = readSavedLayout(settings, name, CHARACTER_ID);
    const canonicalByActual = new Map(Object.entries(actualIds).map(([canonical, actual]) => [actual, canonical]));
    const definitionOrder = (Array.isArray(scenario?.order) ? scenario.order : []).map(row => row && ({ ...row, identifier: canonicalByActual.get(row.identifier) || row.identifier }));
    const baseSections = sectionsForOrder(orderMap, definitionOrder);
    const effectiveSavedLayout = migrateSavedLayoutForDefs(savedLayout, baseSections);
    const resolved = resolveLayout({
      saved: effectiveSavedLayout,
      sections: baseSections,
      promptById,
      orderMap,
      isOrdinaryPrompt,
      presetName: name,
      characterId: CHARACTER_ID,
    });
    const shortcuts = readShortcutIds(settings);
    /* 旧布局里退役 info 的 missing 替身只在这里过滤；存储的 presetControlLayouts 原样不动。 */
    const layoutSections = orderSpecialThinkSections(filterRetiredLayoutControls(resolved.sections));
    let layoutMissing = 0;
    for (const section of layoutSections) {
      for (const control of section.controls || []) {
        if (control && control.kind === 'missing') layoutMissing += 1;
      }
    }
    const homePins = effectiveHomePinsFor(settings, name, shortcuts, layoutSections, orderMap);

    return {
      oai,
      scenario,
      scenarioFound: !!scenario,
      orderMap,
      actualIds,
      name,
      isV1028: isV1028Name(name),
      toggles,
      availableIds: Object.keys(toggles).filter(id => KNOWN_ID_SET.has(id)),
      promptById,
      wordPrompt,
      wordState,
      wordValue,
      wordRule,
      wordProblem,
      shortcuts,
      shortcutPool: shortcutPoolOf(scenario, promptById),
      theaterMemory: readTheaterMemory(settings),
      settings,
      readOk: isPlainObject(rawToggles) || !!scenario,
      pickerOpen,
      pickerQuery,
      compact,
      homeEdit,
      pinMode,
      homePins: homePins.pins,
      homePinsStored: homePins.stored,
      homePinSignature: homePinSignatureOf(homePins),
      layoutSections,
      layoutSource: resolved.source,
      layoutErrors: resolved.errors,
      layoutMissing,
      hasSavedLayout: !!savedLayout,
      layoutKey: presetLayoutKey(name, CHARACTER_ID),
      layoutSignature: layoutSignature(layoutSections),
    };
  }

  function modelKey(m) {
    if (!m) return '';
    return [
      m.name,
      m.isV1028 ? '1' : '0',
      m.scenarioFound ? '1' : '0',
      m.compact ? '1' : '0',
      m.pickerOpen ? '1' : '0',
      m.homeEdit ? 'HE1' : 'HE0',
      m.pinMode ? 'PM1' : 'PM0',
      contentPick ? 'CP1' : 'CP0',
      contentPickQuery,
      contentPickGroup ? contentPickGroup.ids.join(',') : '',
      contentEdit ? ('CE:' + contentEdit.promptId) : 'CE0',
      m.homePinSignature || '',
      m.shortcuts.join(','),
      (m.shortcutPool || []).map(item => item.id + '=' + item.label).join('|'),
      m.wordState,
      m.availableIds.slice().sort().join(','),
      Object.entries(m.actualIds || {}).map(([id, actual]) => id + '=' + actual).sort().join(','),
      m.layoutSignature || '',
      editing ? 'E1' : 'E0',
      editSectionId,
      editOpenUid,
      editRemovedControls.slice().sort().join(','),
      editRemovedSections.slice().sort().join(','),
    ].join('|');
  }

  function resolvePromptId(id) {
    const current = buildModel();
    return hasOwn(current.orderMap, id) ? (current.actualIds[id] || id) : null;
  }

  function isAvailable(m, id) {
    return !!m && hasOwn(m.toggles, id);
  }

  function isOrdinaryPrompt(prompt) {
    if (!prompt || prompt.marker === true) return false;
    const id = String(prompt.identifier || '');
    if (!id || NON_TOGGLE_ID_SET.has(id)) return false;
    const content = String(prompt.content == null ? '' : prompt.content).trim();
    if (!content) return false;
    const name = String(prompt.name == null ? '' : prompt.name).trim();
    if (name && /^[\s\-—_=~·.…─━┄┈┉┊┋]+$/u.test(name)) return false;
    return true;
  }

  function shortcutPoolOf(scenario, promptById) {
    const out = [];
    const seen = new Set();
    const rows = scenario && Array.isArray(scenario.order) ? scenario.order : [];
    for (const row of rows) {
      if (!row || typeof row.identifier !== 'string' || seen.has(row.identifier)) continue;
      const prompt = promptById.get(row.identifier);
      if (!isOrdinaryPrompt(prompt)) continue;
      seen.add(row.identifier);
      const name = String(prompt.name == null ? '' : prompt.name).trim();
      out.push({ id: row.identifier, label: name || PROMPT_NAMES[row.identifier] || '未命名条目' });
    }
    return out;
  }

  function realNameFor(m, id) {
    /* 2026-11-13：固定剧场头部改用展示名；真实条目名只在缺项提示里保留 id 语义，
       不再让 PROMPT_NAMES/真实条目名里的「需开此头部」盖回新 label。 */
    if (id === ID.theaterParent) return '🍿固定剧场';
    /* 2026-11-15：破限 Part 2 首页/钉选走展示名（与 defs 默认 label/PROMPT_NAMES
       同一来源）；真实 prompt.name/body 一字不动。用户在布局/钉选里自定义的标题
       走 control.label，不经过这里，仍优先保留。 */
    if (id === ID.break2) return '🔓破限 Part 2(1不行再关)';
    const prompt = m && m.promptById ? m.promptById.get(id) : null;
    if (prompt && prompt.name) return String(prompt.name);
    return PROMPT_NAMES[id] || '未命名条目';
  }

  function isShortcutToggleable(m, id) {
    return !!m && isAvailable(m, id) && isOrdinaryPrompt(m.promptById.get(id));
  }

  function isOn(m, id) {
    return !!(m && hasOwn(m.toggles, id) && m.toggles[id]);
  }

  function findLayoutControl(m, key, kinds) {
    const allowed = kinds ? new Set(kinds) : null;
    for (const section of (m && m.layoutSections) || []) {
      for (const control of section.controls || []) {
        if (!control || control.key !== key) continue;
        if (allowed && !allowed.has(control.kind)) continue;
        return control;
      }
    }
    return null;
  }

  function definitionForKey(m, key, kinds) {
    return findLayoutControl(m, key, kinds) || RADIO_BY_KEY.get(key) || null;
  }

  function controlIds(control) {
    if (!control) return [];
    if (control.kind === 'toggle' || control.kind === 'action') return [control.id];
    if (control.kind === 'radio' || control.kind === 'combo') return control.allIds.slice();
    if (control.kind === 'multi') return control.ids.slice();
    if (control.kind === 'comboToggle') return control.members.slice();
    if (control.kind === 'word') return [control.id];
    return [];
  }

  function anyAvailable(m, ids) {
    return ids.some(id => isAvailable(m, id));
  }

  function layoutHasPromptControl(m, id) {
    for (const section of (m && m.layoutSections) || []) {
      for (const control of section.controls || []) {
        if (!control) continue;
        if ((control.kind === 'toggle' || control.kind === 'action') && control.id === id) return true;
        if (control.kind === 'missing' && control._ref
          && control._ref.type === 'prompt' && control._ref.id === id) return true;
      }
    }
    return false;
  }

  function controlVisible(m, control) {
    if (!m || !m.scenarioFound) return false;
    if (!control) return false;
    /* 空白块永远保留在网格里：它只占宽度，不显示内容、不参与开关。 */
    if (control.kind === 'spacer') return true;
    if (editing) return true;
    if (control.kind === 'missing') return true;
    if (control.kind === 'shortcuts' || control.kind === 'info') return true;
    /* 完整预设页保留原样式：随机头只在 niah 存在时同排显示；
       首页 pin 已独立，不受这条显示条件限制。 */
    if (control.kind === 'toolboxFlag') {
      return isAvailable(m, ID.niah) && layoutHasPromptControl(m, ID.niah);
    }
    if (m.layoutSource === 'saved') return true;
    const ids = controlIds(control);
    if (!ids.length) return true;
    if (m.isV1028) return true;
    return anyAvailable(m, ids);
  }

  function visibleControls(m, section) {
    const visible = (section.controls || []).filter(control => controlVisible(m, control));
    /* 非 V1028：只显示确切命中的子项；如果这一节只剩“说明文字”，整节不出现。 */
    if (!editing && !m.hasSavedLayout && !m.isV1028 && visible.length
      && visible.every(control => control && control.kind === 'info')) return [];
    return visible;
  }

  function selectedRadioValue(m, def) {
    if (!def) return null;
    const order = m.orderMap;
    const available = def.allIds.filter(id => hasOwn(order, id));
    if (!available.length) return null;
    for (const option of def.options) {
      const ids = option.ids || [];
      if (!ids.length) {
        if (available.every(id => !order[id])) return option.value;
        continue;
      }
      if (!ids.every(id => hasOwn(order, id) && order[id] === true)) continue;
      if (available.every(id => ids.includes(id) || order[id] !== true)) return option.value;
    }
    return null;
  }

  function selectedComboValue(m, def) {
    if (!def) return null;
    const available = def.allIds.filter(id => hasOwn(m.orderMap, id));
    if (!available.length) return null;
    for (const option of def.options) {
      const ids = option.ids || [];
      if (!ids.every(id => hasOwn(m.orderMap, id) && m.orderMap[id] === true)) continue;
      if (available.every(id => ids.includes(id) || m.orderMap[id] !== true)) return option.value;
    }
    return null;
  }

  function comboConflict(m, def) {
    if (!def) return false;
    if (def.kind === 'combo') {
      return selectedComboValue(m, def) === null && def.allIds.some(id => isOn(m, id));
    }
    const available = def.allIds.filter(id => isAvailable(m, id));
    const on = available.filter(id => isOn(m, id));
    return on.length > 1;
  }

  function comboStatus(m, members) {
    const available = members.filter(id => isAvailable(m, id));
    if (!available.length) return { allOn: false, someOn: false, available, status: '不可用' };
    const on = available.filter(id => isOn(m, id));
    const allOn = on.length === available.length;
    const someOn = on.length > 0 && !allOn;
    return {
      allOn,
      someOn,
      available,
      status: allOn ? '全部开启' : (someOn ? '部分开启' : '全部关闭'),
    };
  }

  function wordControlFor(m, id) {
    const wanted = text(id);
    for (const section of (m && m.layoutSections) || []) {
      for (const control of section.controls || []) {
        if (!control || control.kind !== 'word') continue;
        if (control.id === wanted || ('word:' + control.id) === wanted) return control;
      }
    }
    return null;
  }

  /* 把 pin 解析回当前模型：可用性、显示名、开关/选中状态都实时算；
     缺项只显示禁用，不删除、不改顺序、不碰 prompt_order。 */
  function resolveHomePin(m, pin) {
    const clean = sanitizeHomePin(pin);
    const fallback = { pin: clean, ok: false, available: false, on: false, label: '', sub: '这项已不可用', kind: '' };
    if (!m || !clean) return fallback;
    if (clean.type === 'spacer') {
      /* 空白块只占位：不显示标题、不进入焦点、不触发任何开关。 */
      return {
        pin: clean, kind: 'spacer', ok: true, available: true, on: false,
        label: '空白占位', sub: '',
      };
    }
    if (clean.type === 'prompt') {
      const prompt = m.promptById.get(clean.id);
      const present = isAvailable(m, clean.id);
      const ordinary = isOrdinaryPrompt(prompt);
      const available = present && ordinary;
      const realName = realNameFor(m, clean.id);
      const short = FIXED_SET.has(clean.id) ? shortLabelFor(clean.id) : realName;
      const icon = emojiPrefix(realName) || emojiPrefix(PROMPT_NAMES[clean.id] || '');
      const label = emojiPrefix(short) ? short : withEmoji(icon, short);
      return {
        pin: clean,
        kind: 'prompt',
        ok: true,
        available,
        on: available && isOn(m, clean.id),
        label,
        realName,
        sub: available ? (isOn(m, clean.id) ? '已开启' : '已关闭')
          : (!present ? '当前预设没有这项' : '系统条目，不可切换'),
      };
    }
    if (clean.type === 'word') {
      const control = wordControlFor(m, clean.id);
      const stateOk = m.wordState === 'ok';
      const available = !!control && stateOk;
      let sub = '当前预设没有字数条目';
      if (control && m.wordState === 'bad') sub = '字数条目格式不对，已禁用';
      else if (!control) sub = '布局里没有字数控件';
      else if (available) sub = '当前 ' + (m.wordValue !== null ? m.wordValue : '?') + ' 字';
      return {
        pin: clean,
        kind: 'word',
        ok: true,
        available,
        on: false,
        label: '🔢 正文字数',
        control,
        sub,
      };
    }
    if (clean.type === 'toolboxFlag') {
      const def = TOOLBOX_FLAG_BY_KEY.get(clean.key) || RAND_HEAD_DEF;
      const usable = canUseToolboxFlag(clean.key);
      const on = usable && readToolboxFlag(clean.key);
      return {
        pin: clean,
        kind: 'toolboxFlag',
        ok: true,
        available: usable,
        on,
        label: (def && def.label) || '🎲随机头部',
        def,
        sub: usable ? (on ? '已开启' : '已关闭') : '工具箱开关接口未就绪',
      };
    }
    if (clean.type === 'radio' || clean.type === 'combo') {
      if (!clean.value) {
        /* 整组 pin：标题 = 当前布局里这个组的小标题；当前值只作副标题提示，点组里任意
           选项仍走原 applyRadio/applyCombo，不在这里另造切换业务。 */
        const def = definitionForKey(m, clean.key, [clean.type]);
        const options = (def && Array.isArray(def.options)) ? def.options : [];
        const available = !!def && def.allIds.some(id => isAvailable(m, id));
        const selected = def
          ? (clean.type === 'radio' ? selectedRadioValue(m, def) : selectedComboValue(m, def))
          : null;
        const selectedOption = selected
          ? options.find(item => item.value === selected)
          : null;
        const conflict = def ? comboConflict(m, def) : false;
        let sub = '当前：未选';
        if (!def) sub = '这个选择组已不在当前布局';
        else if (!available) sub = '当前预设缺整组条目';
        else if (conflict) sub = '当前：外部混搭';
        else if (selected) {
          sub = '当前：' + (optionDisplayLabel(m, def, selectedOption) || selected);
        }
        return {
          pin: clean,
          kind: clean.type,
          ok: true,
          available,
          on: false,
          label: def ? displayLabel(m, def) : '选择组',
          def,
          selected,
          sub,
        };
      }
      const def = definitionForKey(m, clean.key, [clean.type]);
      const option = def ? (def.options || []).find(item => item.value === clean.value) : null;
      const ids = (option && option.ids) || [];
      let available = !!def && !!option;
      if (available) {
        available = ids.length
          ? ids.every(id => isAvailable(m, id))
          : (clean.type === 'radio' && anyAvailable(m, def.allIds));
      }
      const selected = def
        ? (clean.type === 'radio' ? selectedRadioValue(m, def) : selectedComboValue(m, def))
        : null;
      const label = option ? optionDisplayLabel(m, def, option) : (clean.value || clean.key);
      return {
        pin: clean,
        kind: clean.type,
        ok: true,
        available,
        on: available && selected === clean.value,
        label,
        def,
        option,
        sub: !def ? '这个选项已不在当前布局' : (!available ? '当前预设缺这一项' : (selected === clean.value ? '已选中' : '未选中')),
      };
    }
    const def = definitionForKey(m, clean.key, ['comboToggle']);
    const members = (def && def.members) || [];
    const status = comboStatus(m, members);
    const available = !!def && members.length > 0 && status.available.length === members.length;
    return {
      pin: clean,
      kind: 'comboToggle',
      ok: true,
      available,
      on: available && status.allOn,
      label: (def && def.label) || clean.key,
      def,
      sub: !def ? '这个组合已不在当前布局' : (!available ? '组合里有缺项，已禁用' : status.status),
    };
  }

  /* ------------------------------------------------------------------------
     十二格宽度 / 展示布局（只影响显示，不改 options 执行顺序和 prompt_order）
     ------------------------------------------------------------------------ */
  function explicitLayoutWidth(value) {
    try {
      /* 按钮/属性读回来是字符串；schema 只认 number，这里只做类型收口，不放宽白名单。 */
      const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      const width = normalizeLayoutWidth(numeric);
      return WIDTH_STEPS.includes(width) ? width : 0;
    } catch (e) {
      return 0;
    }
  }

  function defaultHomePinWidth(pin) {
    if (!pin) return 6;
    if (pin.type === 'spacer') return 6;
    if (pin.type === 'radio' || pin.type === 'combo' || pin.type === 'word') return 12;
    return 6;
  }

  function defaultControlWidth(sectionId, control) {
    if (!control) return 12;
    const kind = control.kind;
    if (kind === 'spacer') return 6;
    if (kind === 'toggle' || kind === 'action') {
      if (sectionId === 'writing' || sectionId === 'plot') return 6;
      if (sectionId === 'think_meta' && control.id === ID.niah) return 6;
      return 12;
    }
    if (kind === 'toolboxFlag' && sectionId === 'think_meta') return 6;
    return 12;
  }

  function controlCellWidth(sectionId, control) {
    return explicitLayoutWidth(control && control.width) || defaultControlWidth(sectionId, control);
  }

  function sectionHasCustomGrid(section) {
    return (section && section.controls || []).some(control => !!control
      && (control.kind === 'spacer' || explicitLayoutWidth(control.width) > 0));
  }

  function layoutControlsOf(m) {
    const out = [];
    for (const section of (m && m.layoutSections) || []) {
      for (const control of section.controls || []) {
        if (control) out.push({ section, control });
      }
    }
    return out;
  }

  function layoutControlByUid(m, uid) {
    const wanted = text(uid);
    if (!wanted) return null;
    for (const item of layoutControlsOf(m)) {
      if (controlUid(item.control) === wanted) return item;
    }
    return null;
  }

  /* 首页 pin 只认“来源控件”自身的 uid；旧 pin 没有 sourceUid 时，
     只有按 ref/类型恰好唯一命中一个布局控件才回退绑定，多个/零个都不猜。 */
  function layoutControlsForPin(m, pin) {
    const out = [];
    if (!pin) return out;
    for (const item of layoutControlsOf(m)) {
      const control = item.control;
      if (pin.type === 'prompt') {
        if (control.kind === 'toggle' || control.kind === 'action') {
          if (control.id === pin.id) out.push(item);
          continue;
        }
        const ref = controlRef(control);
        if (control.kind === 'missing' && ref && ref.type === 'prompt' && ref.id === pin.id) out.push(item);
        continue;
      }
      if (pin.type === 'radio' || pin.type === 'combo') {
        if (control.kind === pin.type && control.key === pin.key) out.push(item);
        continue;
      }
      if (pin.type === 'comboToggle') {
        if (control.kind === 'comboToggle' && control.key === pin.key) out.push(item);
        continue;
      }
      if (pin.type === 'word') {
        if (control.kind === 'word' && (control.id === pin.id || 'word:' + control.id === pin.id)) out.push(item);
        continue;
      }
      if (pin.type === 'toolboxFlag') {
        if (control.kind === 'toolboxFlag' && control.flag === pin.key) out.push(item);
      }
    }
    return out;
  }

  function sourceControlForPin(m, pin) {
    if (!pin || pin.type === 'spacer') return null;
    const explicitUid = text(pin.sourceUid);
    if (explicitUid) {
      const hit = layoutControlByUid(m, explicitUid);
      /* 显式来源优先：找不到就保持旧显示，不拿别的同 ref 控件冒充。 */
      return hit ? hit.control : null;
    }
    const matches = layoutControlsForPin(m, pin);
    return matches.length === 1 ? matches[0].control : null;
  }

  function homePinCellWidth(m, pin) {
    if (!pin) return 6;
    if (pin.type === 'spacer') {
      return explicitLayoutWidth(pin.width) || 6;
    }
    const source = sourceControlForPin(m, pin);
    /* 源控件没有显式 width 时，绝不覆盖首页旧默认（单条半行/整组整行）。 */
    return explicitLayoutWidth(source && source.width) || defaultHomePinWidth(pin);
  }

  function defaultOptionWidth(control, option) {
    if (!control) return 12;
    if (control.kind === 'combo') return 12;
    if (control.key === PARAGRAPH_RADIO_KEY || control.key === NARRATION_RADIO_KEY) return 6;
    if (control.key === 'think.model') return option && option.value === 'kimi' ? 12 : 6;
    /* 普通单选沿用旧的 auto-fit 观感：2 项半行、3 项 1/3、4 项以上 1/4。 */
    const count = Array.isArray(control.options) ? control.options.length : 0;
    if (count >= 4) return 3;
    if (count === 3) return 4;
    return 6;
  }

  function optionWidthOf(control, option, entry) {
    return explicitLayoutWidth(entry && entry.width) || defaultOptionWidth(control, option);
  }

  /* optionLayout 只决定“选项显示顺序/宽度/组内空块”，不改 control.options 的执行顺序。
     resolveOptionLayout 由 schema 支统一给出展示序；坏数据回退到原始 options 顺序。 */
  function optionDisplayList(control) {
    if (!control || !Array.isArray(control.options)) return null;
    if (!Array.isArray(control.optionLayout) || !control.optionLayout.length) return null;
    let list = null;
    try {
      list = resolveOptionLayout(control);
    } catch (e) {
      list = null;
    }
    if (!Array.isArray(list)) list = control.optionLayout;
    const byValue = new Map((control.options || []).map(option => [String(option.value), option]));
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'spacer') {
        out.push({
          type: 'spacer',
          uid: text(item.uid) || text(item.key),
          width: explicitLayoutWidth(item.width) || 6,
        });
        continue;
      }
      const value = text(item.value !== undefined
        ? item.value
        : (item.option && item.option.value !== undefined ? item.option.value : item));
      const option = item.option || byValue.get(value);
      if (!option || seen.has(String(option.value))) continue;
      seen.add(String(option.value));
      out.push({
        type: 'option',
        option,
        width: explicitLayoutWidth(item.width),
      });
    }
    /* 展示序里漏掉的选项仍按原 options 顺序补在末尾，不丢可点项。 */
    for (const option of control.options) {
      if (seen.has(String(option.value))) continue;
      seen.add(String(option.value));
      out.push({ type: 'option', option, width: 0 });
    }
    return out;
  }

  function pinAddButton() {
    /* 唯一添加入口：cc 传 onPinModeRequest 时由本模块画这一颗按钮。 */
    const add = createEl(doc, 'button', 'ywpc-add ywpc-pin-add');
    add.type = 'button';
    add.textContent = '＋ 添加首页常用';
    add.setAttribute('data-ywpc-action', 'pin-mode-open');
    add.setAttribute('data-ywpc-focus-key', 'pin:mode-open');
    add.title = '去预设页点条目钉到首页；不会切换开关';
    return add;
  }

  function pinEditButton(label, action, pin, disabled) {
    const btn = createEl(doc, 'button', 'ywpc-pin-btn');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('data-ywpc-action', action);
    if (pin) btn.setAttribute('data-ywpc-pin', encodeHomePin(pin));
    if (disabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
    }
    return btn;
  }

  /* ------------------------------------------------------------------------
     保存 token / 设置
     ------------------------------------------------------------------------ */
  function settingField(labelText, input) {
    const field = createEl(doc, 'label', 'ywpc-field');
    const label = createEl(doc, 'span', 'ywpc-field-label');
    label.textContent = labelText;
    append(field, label);
    append(field, input);
    return field;
  }

  function renderRelationField(control) {
    const relation = createEl(doc, 'select', 'ywpc-edit-select');
    relation.setAttribute('data-ywpc-layout-relation', controlUid(control));
    relation.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':relation');
    relation.setAttribute('aria-label', '选择关系');
    for (const [value, label] of [
      ['exactlyOne', '必须选一个'],
      ['atMostOne', '最多选一个（可全关）'],
    ]) {
      const opt = createEl(doc, 'option');
      opt.value = value;
      opt.textContent = label;
      if ((value === 'exactlyOne' && control.exactlyOne) || (value === 'atMostOne' && control.atMostOne)) opt.selected = true;
      append(relation, opt);
    }
    return settingField('选择规则', relation);
  }

  function appendDeleteRow(pane, control, uid) {
    const row = createEl(doc, 'div', 'ywpc-settings-danger-row');
    const del = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small ywpc-edit-danger');
    del.type = 'button';
    del.textContent = control.kind === 'spacer' ? '删除空白块' : '从布局移除';
    del.title = control.kind === 'spacer'
      ? '只删这个空白块，不改预设'
      : '只从布局移除，不删条目、不改开关';
    del.setAttribute('data-ywpc-action', 'layout-delete-control');
    del.setAttribute('data-ywpc-uid', uid);
    del.setAttribute('data-ywpc-focus-key', 'layout:block:' + uid + ':delete');
    append(row, del);
    append(pane, row);
  }

  function controlBindingFieldText(m, control) {
    if (!control || control.kind === 'missing') return '';
    const ref = controlRef(control);
    if (!ref) return '未绑定';
    if (ref.type === 'prompt') {
      const prompt = m.promptById.get(ref.id);
      return '条目 · ' + String((prompt && prompt.name) || control.label || ref.id);
    }
    if (ref.type === 'custom') return '自定义 · ' + String(ref.key || '');
    if (ref.type === 'spacer') return '空白块';
    return '内置' + layoutKindLabel(control) + '（不可换绑）';
  }

  function captureToken() {
    const oai = safeCall(deps.getOaiSettings, null);
    const scenario = findScenario(oai);
    const name = text(safeCall(deps.getCurrentPresetName, '') || '').trim();
    return { name, oai, scenario, at: Date.now() };
  }

  function tokenCurrent(token) {
    if (!token || !token.scenario) return false;
    const oai = safeCall(deps.getOaiSettings, null);
    const scenario = findScenario(oai);
    const name = text(safeCall(deps.getCurrentPresetName, '') || '').trim();
    return token.oai === oai && token.scenario === scenario && token.name === name;
  }

  function captureIdentity() {
    const token = captureToken();
    return token && token.scenario
      ? { name: token.name, characterId: CHARACTER_ID, presetName: token.name }
      : { name: token ? token.name : '', characterId: CHARACTER_ID, presetName: token ? token.name : '', missing: true };
  }

  function persistSettings() {
    try {
      if (typeof deps.saveSettings !== 'function') {
        showToast('设置保存接口未就绪；这次改动可能不会留在设置里。', 'warn');
        return false;
      }
      deps.saveSettings();
      return true;
    } catch (e) {
      showToast('设置保存失败：' + humanError(e), 'error');
      return false;
    }
  }

  function humanError(error) {
    const raw = error && error.message ? String(error.message) : String(error || '');
    return raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
  }

  function isInlineSaveOn() {
    try {
      const settings = readSettings();
      return !!(settings && settings.inlineInsertSavePreset === true);
    } catch (e) {
      return false;
    }
  }

  function updateTheaterMemory(patch) {
    try {
      const settings = readSettings();
      if (!settings) return;
      if (!isPlainObject(settings.ywpcTheaterMemory)) settings.ywpcTheaterMemory = {};
      for (const id of Object.keys(patch || {})) {
        if (!THEATER_CHILD_SET.has(id)) continue;
        if (typeof patch[id] === 'boolean') settings.ywpcTheaterMemory[id] = patch[id];
      }
    } catch (e) { /* 坏设置只影响记忆，不影响开关写入 */ }
  }

  function writeToggleMap(map, reason, token) {
    if (!map || !Object.keys(map).length) return false;
    if (!tokenCurrent(token)) {
      showToast('预设刚被切换，这次改动没有保存到旧预设。', 'warn');
      return false;
    }
    if (typeof deps.writeToggles !== 'function') {
      showToast('写入接口未就绪，这次没有改任何条目。', 'error');
      return false;
    }
    try {
      const current = buildModel();
      const actualMap = {};
      for (const [id, value] of Object.entries(map)) {
        const previous = model?.actualIds[id] || id;
        const actual = current.actualIds[id] || id;
        if (previous !== actual || !hasOwn(current.orderMap, actual)) {
          showToast('条目绑定刚有变化，这次没有写入，请重新操作。', 'warn');
          refresh({ force: true, reason: 'binding-changed' });
          return false;
        }
        if (hasOwn(actualMap, actual) && actualMap[actual] !== value) {
          showToast('同一条目有冲突选择，这次没有写入。', 'warn');
          return false;
        }
        actualMap[actual] = value;
      }
      deps.writeToggles(actualMap);
    } catch (e) {
      showToast('写入失败，没有保存：' + humanError(e), 'error');
      return false;
    }
    persistSettings();
    queuePresetSave(reason, token);
    refresh({ reason: reason || 'write' });
    return true;
  }

  function queuePresetSave(reason, token) {
    if (!isInlineSaveOn()) return;
    if (!token || !tokenCurrent(token)) {
      showToast('预设已切换，没有调用保存。', 'warn');
      return;
    }
    pendingSaveToken = token;
    pendingSaveReason = reason || 'ywpc-change';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = 0; flushPresetSave(); }, SAVE_DEBOUNCE_MS);
    setStatus((model ? statusText(model) : '') + ' · 准备保存预设…');
  }

  /* 主 index 反向联动（工具箱 wrap4a 勾选 → 写 niah）后调用：
     只在 inline 保存开启且当前预设身份有效时，复用既有 queuePresetSave；
     不在渲染阶段保存，也不新造保存器。 */
  function requestPresetSave(reason) {
    if (!isInlineSaveOn()) return false;
    const token = captureToken();
    if (!token || !token.name || !token.scenario || !tokenCurrent(token)) return false;
    queuePresetSave(reason || 'ywpc-request', token);
    return true;
  }

  async function flushPresetSave() {
    if (disposed) return;
    if (saveInFlight) {
      if (pendingSaveToken && !saveTimer) saveTimer = setTimeout(() => { saveTimer = 0; flushPresetSave(); }, 120);
      return;
    }
    const token = pendingSaveToken;
    const reason = pendingSaveReason;
    pendingSaveToken = null;
    pendingSaveReason = '';
    if (!token) return;
    if (!tokenCurrent(token)) {
      showToast('预设已切换，这次没有保存旧预设。', 'warn');
      setStatus('预设已切换 · 未保存');
      return;
    }
    if (!token.name) {
      showToast('读不到当前预设名；这次只保存在酒馆设置里，没有写预设文件。', 'warn');
      setStatus('读不到预设名 · 改动只在酒馆设置里');
      return;
    }
    if (typeof deps.saveCurrentPreset !== 'function') {
      showToast('保存接口未就绪；改动只在酒馆设置里，没有写进预设文件。', 'warn');
      setStatus('改动只在酒馆设置里');
      return;
    }
    saveInFlight = true;
    setStatus('正在保存预设「' + token.name + '」…');
    let result;
    try {
      result = await deps.saveCurrentPreset({
        name: token.name,
        expectedIdentity: token.name,
        reason: reason || 'ywpc-change',
      });
    } catch (e) {
    saveInFlight = false;
      showToast('保存预设失败：' + humanError(e) + '（改动仍在酒馆设置里）', 'error');
      setStatus('保存失败 · 改动仍在酒馆设置里');
      if (pendingSaveToken && !saveTimer) {
        saveTimer = setTimeout(() => { saveTimer = 0; flushPresetSave(); }, 120);
      }
      return;
    }
    saveInFlight = false;
    if (!tokenCurrent(token)) {
      showToast('保存过程中预设被切换，结果未确认；请回到「' + token.name + '」再确认。', 'warn');
      setStatus('保存过程中预设被切换 · 结果未确认');
    } else if (result === false || (result && result.ok === false)) {
      showToast('保存预设失败；改动只在酒馆设置里，没有写进预设文件。', 'error');
      setStatus('保存失败 · 改动仍在酒馆设置里');
    } else if (result && result.ok === true && result.unverified === true) {
      /* 宿主已执行写入，但保存后核对没完成（例如预设列表里已找不到目标）。
         既不是完整成功，也不是失败：明确告诉作者已写入、核对未完成。 */
      showToast('已写入预设「' + token.name + '」，但后续核对未完成；请到预设列表确认一次。', 'warn');
      setStatus('已写入 · 后续核对未完成 ' + nowTime());
    } else if (result === true || (result && result.ok === true)) {
      showToast('已保存到预设「' + token.name + '」。', 'ok');
      setStatus('已保存 ' + nowTime());
    } else {
      setStatus('保存请求已发出 · 结果未确认');
    }
    if (pendingSaveToken && !saveTimer) {
      saveTimer = setTimeout(() => { saveTimer = 0; flushPresetSave(); }, 120);
    }
  }

  /* ------------------------------------------------------------------------
     DOM 构建
     ------------------------------------------------------------------------ */
  function injectStyle() {
    if (!doc) return;
    try {
      if (doc.getElementById(STYLE_ID)) return;
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = PRESET_CONTROLS_CSS;
      (doc.head || doc.documentElement || doc.body).appendChild(style);
    } catch (e) { /* 样式挂不上不影响功能 */ }
  }

  function buildRoot() {
    root = createEl(doc, 'div', 'ywpc-root');
    root.setAttribute('data-ywpc-root', '1');
    if (compact) root.classList.add('ywpc-compact');

    /* 首页 compact 不再显示标题/V1028 badge/技术计数；预设名由首页 hero 展示。
       错误仍用一行人话说明，不把技术数字带到首页。 */
    if (!compact) {
      const head = createEl(doc, 'div', 'ywpc-head');
      const titleRow = createEl(doc, 'div', 'ywpc-title-row');
      const title = createEl(doc, 'strong', 'ywpc-title');
      title.textContent = '预设条目';
      badgeEl = createEl(doc, 'span', 'ywpc-badge');
      badgeEl.setAttribute('data-ywpc-badge', 'compat');
      badgeEl.textContent = '未连接';
      append(titleRow, title);
      append(titleRow, badgeEl);
      append(head, titleRow);
      statusEl = createEl(doc, 'p', 'ywpc-status');
      statusEl.setAttribute('data-ywpc-status', '1');
      statusEl.setAttribute('role', 'status');
      append(head, statusEl);
      append(root, head);
    } else {
      statusEl = createEl(doc, 'p', 'ywpc-status ywpc-status-compact');
      statusEl.setAttribute('data-ywpc-status', '1');
      statusEl.setAttribute('role', 'status');
      statusEl.hidden = true;
    }

    bodyEl = createEl(doc, 'div', 'ywpc-body');
    bodyEl.setAttribute('data-ywpc-body', '1');
    toastEl = createEl(doc, 'p', 'ywpc-toast');
    toastEl.setAttribute('data-ywpc-toast', '1');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');

    append(root, bodyEl);
    append(root, statusEl);
    append(root, toastEl);
  }

  /* ------------------------------------------------------------------------
     cc 标题右侧宿主（headerHost）：只放本模块自己的按钮；
     full 页「编辑布局」从这里进，pinMode 时这里显示「取消钉选」。
     dispose / teardown 只移除自己创建的节点，不动宿主本身。
     ------------------------------------------------------------------------ */
  function ensureHeader() {
    if (!doc || compact || !headerHostEl) return;
    if (!headerEl || headerEl.parentNode !== headerHostEl) {
      headerEl = createEl(doc, 'div', 'ywpc-header-actions');
      headerEl.setAttribute('data-ywpc-header', '1');
      try { headerEl.addEventListener('click', onHeaderClick); } catch (e) { /* 老 WebView 只能看 */ }
      append(headerHostEl, headerEl);
    }
    renderHeaderActions();
  }

  function renderHeaderActions() {
    if (!headerEl) return;
    clearNode(headerEl);
    if (contentEdit) {
      const state = createEl(doc, 'span', 'ywpc-header-state');
      state.setAttribute('data-ywpc-content-state', 'editor');
      state.textContent = '正在编辑条目正文';
      append(headerEl, state);
      return;
    }
    if (contentPick) {
      const state = createEl(doc, 'span', 'ywpc-header-state');
      state.setAttribute('data-ywpc-content-state', 'pick');
      state.textContent = '正在选择条目';
      append(headerEl, state);
      const cancel = createEl(doc, 'button', 'ywpc-edit-btn');
      cancel.type = 'button';
      cancel.textContent = '取消选择';
      cancel.setAttribute('data-ywpc-action', 'content-pick-cancel');
      cancel.setAttribute('data-ywpc-focus-key', 'content:pick-cancel');
      append(headerEl, cancel);
      return;
    }
    if (pinMode) {
      const state = createEl(doc, 'span', 'ywpc-header-state');
      state.setAttribute('data-ywpc-pin-state', '1');
      state.textContent = '正在钉选首页常用';
      append(headerEl, state);
      const cancel = createEl(doc, 'button', 'ywpc-edit-btn');
      cancel.type = 'button';
      cancel.textContent = '取消钉选';
      cancel.setAttribute('data-ywpc-action', 'pin-cancel');
      cancel.setAttribute('data-ywpc-focus-key', 'pin:cancel');
      append(headerEl, cancel);
      return;
    }
    if (editing) {
      const state = createEl(doc, 'span', 'ywpc-header-state');
      state.setAttribute('data-ywpc-pin-state', '1');
      state.textContent = '正在编辑布局';
      append(headerEl, state);
      return;
    }
    const contentBtn = createEl(doc, 'button', 'ywpc-edit-btn');
    contentBtn.type = 'button';
    contentBtn.textContent = '条目编辑';
    contentBtn.setAttribute('data-ywpc-action', 'content-edit-open');
    contentBtn.setAttribute('data-ywpc-focus-key', 'content:open');
    append(headerEl, contentBtn);

    const btn = createEl(doc, 'button', 'ywpc-edit-btn');
    btn.type = 'button';
    btn.textContent = '编辑布局';
    btn.setAttribute('data-ywpc-action', 'layout-open');
    btn.setAttribute('data-ywpc-focus-key', 'layout:open');
    append(headerEl, btn);
  }

  function onHeaderClick(event) {
    const btn = closest(event.target, '[data-ywpc-action]');
    if (!btn || btn.disabled) return;
    const action = btn.getAttribute('data-ywpc-action');
    if (action === 'content-edit-open') { beginContentEdit(); return; }
    if (action === 'content-pick-cancel') { exitContentPick(); return; }
    if (action === 'layout-open') { beginEdit(); return; }
    if (action === 'pin-cancel') { cancelPinMode(); return; }
  }

  function removeHeader() {
    try {
      if (headerEl) {
        headerEl.removeEventListener('click', onHeaderClick);
        if (headerEl.parentNode) headerEl.parentNode.removeChild(headerEl);
      }
    } catch (e) { /* 宿主已拆掉也不报错 */ }
    headerEl = null;
  }

  function focusKeyForToggle(id) {
    return 'toggle:' + id;
  }

  /* 2026-11-15：插小说防道歉 / 随机头部改成「前面导航 + 后面拨钮」两颗并列按钮
     （外层 wrapper 原样，里面两颗 button 并列，避免 nested button）：
     - 前面只导航到工具箱注入段（deps.openInjectionSection），零开关、零保存；
     - 后面拨钮保持原有写入路径（applyToggle / writeToolboxFlag）；
     - 布局编辑/钉选/正文选条目时点击仍走各自原操作，绝不导航（见 onRootClick /
       pinCandidateFromTarget）。普通控件不经过这里，仍是整卡单按钮。 */
  const INJECTION_SECTION_NIAH = 'wrap4a';
  const INJECTION_SECTION_RAND_HEAD = 'rand_head';

  function canOpenInjectionSection() {
    return typeof deps.openInjectionSection === 'function';
  }

  /* 与 makeToggle 同一条标签规则：label 带 emoji 用原样，否则借 realName 的 emoji。 */
  function toggleLabelText(label, realName) {
    return emojiPrefix(label) ? label : withEmoji(emojiPrefix(realName), label);
  }

  function makeInjectionNavButton(section, opts) {
    const o = opts || {};
    const nav = createEl(doc, 'button', 'ywpc-nav-btn');
    nav.type = 'button';
    nav.setAttribute('data-ywpc-nav-section', section);
    nav.setAttribute('data-ywpc-nav-kind', o.kind || 'prompt');
    nav.setAttribute('data-ywpc-nav-id', o.id || '');
    nav.setAttribute('data-ywpc-focus-key', o.focusKey || ('nav:' + section));
    if (o.missing) nav.classList.add('ywpc-missing');
    const ready = canOpenInjectionSection();
    if (!ready) {
      nav.disabled = true;
      nav.setAttribute('aria-disabled', 'true');
    }
    const hint = o.navTitle || '打开工具箱注入设置';
    nav.title = ready ? hint + '（不改开关）' : '工具箱导航接口未就绪';
    nav.setAttribute('aria-label', ready ? hint + '（不改开关）' : '工具箱导航接口未就绪');
    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const labelEl = createEl(doc, 'span', 'ywpc-toggle-label');
    labelEl.textContent = toggleLabelText(o.label || '', o.realName || o.label || '');
    append(main, labelEl);
    if (o.sub) {
      const subEl = createEl(doc, 'span', 'ywpc-toggle-sub');
      subEl.setAttribute('data-ywpc-sub', '1');
      subEl.setAttribute('data-ywpc-sub-default', o.sub);
      subEl.textContent = o.sub;
      append(main, subEl);
    }
    const go = createEl(doc, 'span', 'ywpc-nav-go');
    go.setAttribute('aria-hidden', 'true');
    go.textContent = '›';
    append(nav, main);
    append(nav, go);
    return nav;
  }

  function makeSplitSwitchButton(attrs, opts) {
    const o = opts || {};
    const btn = createEl(doc, 'button', 'ywpc-toggle ywpc-split-toggle');
    btn.type = 'button';
    Object.keys(attrs || {}).forEach(key => { btn.setAttribute(key, String(attrs[key])); });
    btn.setAttribute('data-ywpc-focus-key', o.focusKey || '');
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', o.on ? 'true' : 'false');
    if (!o.available) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
    }
    btn.title = o.switchTitle || '';
    btn.setAttribute('aria-label', o.switchTitle || '切换');
    const sw = createEl(doc, 'span', 'ywpc-switch');
    sw.setAttribute('aria-hidden', 'true');
    append(sw, createEl(doc, 'span', 'ywpc-knob'));
    append(btn, sw);
    return btn;
  }

  function part2DisplayLabel(id, label) {
    if (id !== ID.break2) return label;
    return ['破限 Part 2', '🔓破限 Part 2', '🔓 破限 Part 2'].includes(String(label || ''))
      ? '破限 Part 2(1不行再关)' : label;
  }

  function appendToggleLabel(node, id, label) {
    const match = [ID.break1, ID.break2].includes(id) ? /^(.*?)([（(][^（）()]*[）)])$/.exec(label) : null;
    if (!match) { node.textContent = label; return; }
    const name = createEl(doc, 'span', 'ywpc-toggle-name');
    name.textContent = match[1];
    const aside = createEl(doc, 'span', 'ywpc-toggle-aside');
    aside.textContent = match[2];
    append(node, name);
    append(node, aside);
  }

  function makeToggle(m, id, label, options) {
    const opts = options || {};
    label = part2DisplayLabel(id, label);
    const available = opts.availableOverride === undefined ? isAvailable(m, id) : !!opts.availableOverride;
    const on = available && isOn(m, id);
    const btn = createEl(doc, 'button', 'ywpc-toggle');
    btn.type = 'button';
    btn.setAttribute('data-ywpc-toggle', id);
    btn.setAttribute('data-ywpc-focus-key', opts.focusKey || focusKeyForToggle(id));
    if (opts.shortcut) btn.setAttribute('data-ywpc-shortcut-toggle', '1');
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    if (!available) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
    }
    const realName = opts.realName || PROMPT_NAMES[id] || label;
    btn.title = available ? realName : realName + ' · ' + (opts.missingText || '当前预设没有这项');

    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const labelEl = createEl(doc, 'span', 'ywpc-toggle-label');
    appendToggleLabel(labelEl, id, toggleLabelText(label, realName));
    const subEl = createEl(doc, 'span', 'ywpc-toggle-sub');
    subEl.setAttribute('data-ywpc-sub', '1');
    subEl.setAttribute('data-ywpc-sub-default', opts.sub || '');
    subEl.textContent = !available
      ? (opts.missingText || '当前预设没有这项')
      : (opts.sub || '');
    append(main, labelEl);
    if (subEl.textContent) append(main, subEl);

    const sw = createEl(doc, 'span', 'ywpc-switch');
    sw.setAttribute('aria-hidden', 'true');
    append(sw, createEl(doc, 'span', 'ywpc-knob'));
    append(btn, main);
    append(btn, sw);
    return btn;
  }

  function makeSectionHead(section, m, visible) {
    const head = createEl(doc, 'summary', 'ywpc-sec-head');
    const iconEl = createEl(doc, 'span', 'ywpc-sec-icon');
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = section.icon || '';
    const h = createEl(doc, 'h3', 'ywpc-sec-title');
    h.textContent = section.label || '';
    /* 2026-11-13：分组右侧不再生成 XX/XX 统计节点。 */
    append(head, iconEl);
    append(head, h);
    head.title = (section.label || '分组') + '（点一下展开/收起；同层只开一个）';
    return head;
  }

  /* 2026-11-13：分组 XX/XX 统计函数已移除（不再生成任何数字）。 */

  function makeOptionSpacer(width) {
    const node = makeSpaceBlock(false);
    node.setAttribute('data-ywpc-w', String(explicitLayoutWidth(width) || 6));
    return node;
  }

  function makeRadioOptionButton(m, control, option) {
    const ids = option.ids || [];
    const available = control.allIds.filter(id => isAvailable(m, id));
    const optionAvailable = ids.length === 0
      ? available.length > 0
      : ids.every(id => isAvailable(m, id));
    const btn = createEl(doc, 'button', 'ywpc-seg-btn');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('data-ywpc-radio', control.key);
    btn.setAttribute('data-ywpc-value', option.value);
    btn.setAttribute('data-ywpc-focus-key', 'radio:' + control.key + ':' + option.value);
    if (isNoneOption(option)) btn.classList.add('ywpc-seg-none');
    if (!optionAvailable) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
      btn.title = ids.length
        ? '当前预设缺少：' + ids.map(id => PROMPT_NAMES[id] || id).join('、')
        : '当前预设没有这一组';
    } else {
      btn.title = ids.length ? ids.map(id => PROMPT_NAMES[id] || id).join(' / ') : option.label;
    }
    const labelEl = createEl(doc, 'span', 'ywpc-seg-label');
    labelEl.textContent = optionDisplayLabel(m, control, option);
    append(btn, labelEl);
    if (option.sub) {
      const subEl = createEl(doc, 'span', 'ywpc-seg-sub');
      subEl.textContent = option.sub;
      append(btn, subEl);
    }
    return btn;
  }

  function renderRadio(m, control) {
    const wrap = createEl(doc, 'div', 'ywpc-row');
    wrap.setAttribute('data-ywpc-pin-group', 'radio:' + control.key);
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = displayLabel(m, control);
    append(wrap, label);

    const selected = selectedRadioValue(m, control);
    const seg = createEl(doc, 'div', 'ywpc-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', control.label);
    seg.setAttribute('data-ywpc-radio-group', control.key);

    const display = optionDisplayList(control);
    if (display) {
      /* 组内展示序由 optionLayout 决定；不改 control.options 的执行/判断顺序。 */
      seg.classList.add('ywpc-opt-grid');
      seg.setAttribute('data-ywpc-option-grid', '1');
      for (const entry of display) {
        if (entry.type === 'spacer') {
          append(seg, makeOptionSpacer(entry.width));
          continue;
        }
        const btn = makeRadioOptionButton(m, control, entry.option);
        btn.setAttribute('aria-checked', selected === entry.option.value ? 'true' : 'false');
        btn.setAttribute('data-ywpc-w', String(optionWidthOf(control, entry.option, entry)));
        append(seg, btn);
      }
    } else {
      for (const option of control.options) {
        const btn = makeRadioOptionButton(m, control, option);
        btn.setAttribute('aria-checked', selected === option.value ? 'true' : 'false');
        append(seg, btn);
      }
    }
    append(wrap, seg);

    const conflict = comboConflict(m, control);
    const available = control.allIds.filter(id => isAvailable(m, id));
    const note = createEl(doc, 'p', 'ywpc-note' + (conflict ? ' ywpc-warn' : ''));
    note.setAttribute('data-ywpc-conflict-note', control.key);
    if (!available.length) {
      note.textContent = '当前预设没有这一组条目，已局部禁用。';
      note.classList.add('ywpc-warn');
    } else if (conflict) {
      note.textContent = '外部同时开了多项，只提示，不自动改；点一个选项会改成单选。';
    } else if (control.masterId && !isAvailable(m, control.masterId)) {
      note.textContent = '选项/备忘录的隐藏总开关不在当前预设里，可能不会渲染。';
      note.classList.add('ywpc-warn');
    } else {
      note.textContent = '';
    }
    append(wrap, note);
    return wrap;
  }

  function makeComboOptionButton(m, control, option) {
    const ids = option.ids || [];
    const optionAvailable = ids.length > 0 && ids.every(id => isAvailable(m, id));
    const btn = createEl(doc, 'button', 'ywpc-seg-btn');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('data-ywpc-combo', control.key);
    btn.setAttribute('data-ywpc-value', option.value);
    btn.setAttribute('data-ywpc-focus-key', 'combo:' + control.key + ':' + option.value);
    if (isNoneOption(option)) btn.classList.add('ywpc-seg-none');
    if (!optionAvailable) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
      btn.title = '当前预设缺少：' + ids.map(id => PROMPT_NAMES[id] || id).join('、');
    } else {
      btn.title = ids.map(id => PROMPT_NAMES[id] || id).join(' + ');
    }
    const labelEl = createEl(doc, 'span', 'ywpc-seg-label');
    labelEl.textContent = optionDisplayLabel(m, control, option);
    append(btn, labelEl);
    if (option.sub) {
      const subEl = createEl(doc, 'span', 'ywpc-seg-sub');
      subEl.textContent = option.sub;
      append(btn, subEl);
    }
    return btn;
  }

  function renderCombo(m, control) {
    const wrap = createEl(doc, 'div', 'ywpc-row');
    wrap.setAttribute('data-ywpc-pin-group', 'combo:' + control.key);
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = displayLabel(m, control);
    append(wrap, label);

    const selected = selectedComboValue(m, control);
    const grid = createEl(doc, 'div', 'ywpc-combo');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', control.label);
    grid.setAttribute('data-ywpc-combo-group', control.key);
    /* 2026-11-13：思考与功能组合不再追加说明后缀。 */
    const display = optionDisplayList(control);
    if (display) {
      grid.classList.add('ywpc-opt-grid');
      grid.setAttribute('data-ywpc-option-grid', '1');
      for (const entry of display) {
        if (entry.type === 'spacer') {
          append(grid, makeOptionSpacer(entry.width));
          continue;
        }
        const btn = makeComboOptionButton(m, control, entry.option);
        btn.setAttribute('aria-checked', selected === entry.option.value ? 'true' : 'false');
        btn.setAttribute('data-ywpc-w', String(optionWidthOf(control, entry.option, entry)));
        append(grid, btn);
      }
    } else {
      for (const option of control.options) {
        const btn = makeComboOptionButton(m, control, option);
        btn.setAttribute('aria-checked', selected === option.value ? 'true' : 'false');
        append(grid, btn);
      }
    }
    append(wrap, grid);

    const conflict = comboConflict(m, control);
    const note = createEl(doc, 'p', 'ywpc-note' + (conflict ? ' ywpc-warn' : ''));
    note.setAttribute('data-ywpc-combo-note', control.key);
    if (conflict) {
      note.textContent = '当前是外部混搭，只提示；点一个组合会改成标准组合（不碰破限/防道歉/思考长度）。';
    } else {
      note.textContent = '';
    }
    append(wrap, note);
    return wrap;
  }

  function renderComboToggle(m, control) {
    const status = comboStatus(m, control.members);
    const allAvailable = status.available.length === control.members.length && status.available.length > 0;
    const btn = createEl(doc, 'button', 'ywpc-toggle');
    btn.type = 'button';
    btn.setAttribute('data-ywpc-combo-toggle', control.key);
    btn.setAttribute('data-ywpc-focus-key', 'combo-toggle:' + control.key);
    btn.setAttribute('role', 'checkbox');
    btn.setAttribute('aria-checked', status.allOn ? 'true' : (status.someOn ? 'mixed' : 'false'));
    if (!allAvailable) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
    }
    btn.title = control.members.map(id => PROMPT_NAMES[id] || id).join(' + ');

    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const labelEl = createEl(doc, 'span', 'ywpc-toggle-label');
    labelEl.textContent = displayLabel(m, control);
    const subEl = createEl(doc, 'span', 'ywpc-toggle-sub');
    subEl.setAttribute('data-ywpc-sub', '1');
    subEl.textContent = !allAvailable
      ? '部分条目不可用 · 已局部停用'
      : (control.sub ? control.sub + ' · ' : '') + status.status;
    append(main, labelEl);
    append(main, subEl);
    const sw = createEl(doc, 'span', 'ywpc-switch');
    sw.setAttribute('aria-hidden', 'true');
    append(sw, createEl(doc, 'span', 'ywpc-knob'));
    append(btn, main);
    append(btn, sw);
    return btn;
  }

  function renderMulti(m, control) {
    const wrap = createEl(doc, 'div', 'ywpc-row');
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = displayLabel(m, control);
    append(wrap, label);

    const parentOn = isOn(m, control.parentId);
    const parentAvailable = isAvailable(m, control.parentId);
    const grid = createEl(doc, 'div', 'ywpc-multi');
    grid.setAttribute('data-ywpc-multi', control.key);
    let conflicts = 0;
    control.ids.forEach((id, index) => {
      const available = isAvailable(m, id);
      const on = available && isOn(m, id);
      const gated = !parentOn;
      if (gated && on) conflicts += 1;
      const chip = createEl(doc, 'button', 'ywpc-chip');
      chip.type = 'button';
      chip.setAttribute('role', 'switch');
      chip.setAttribute('data-ywpc-toggle', id);
      chip.setAttribute('data-ywpc-focus-key', 'toggle:' + id);
      chip.setAttribute('aria-checked', on ? 'true' : 'false');
      if (gated && on) chip.setAttribute('data-ywpc-conflict', '1');
      if (!available) {
        chip.disabled = true;
        chip.setAttribute('aria-disabled', 'true');
        chip.classList.add('ywpc-missing');
        chip.title = '当前预设没有这项';
      } else if (gated) {
        chip.disabled = true;
        chip.setAttribute('aria-disabled', 'true');
        chip.title = parentAvailable
          ? '父项关闭'
          : '固定剧场父项不在当前预设里';
      } else {
        chip.title = PROMPT_NAMES[id] || control.labels[index] || id;
      }
      const check = createEl(doc, 'span', 'ywpc-chip-check');
      check.setAttribute('aria-hidden', 'true');
      const name = createEl(doc, 'span', 'ywpc-chip-name');
      const chipLabel = (control.labels && control.labels[index]) || shortLabelFor(id);
      name.textContent = emojiPrefix(chipLabel) ? chipLabel : withEmoji(emojiPrefix(PROMPT_NAMES[id]), chipLabel);
      append(chip, check);
      append(chip, name);
      append(grid, chip);
    });
    append(wrap, grid);

    const note = createEl(doc, 'p', 'ywpc-note' + (conflicts || !parentAvailable ? ' ywpc-warn' : ''));
    note.setAttribute('data-ywpc-theater-note', '1');
    if (!parentAvailable) {
      note.textContent = '固定剧场父项不在当前预设里；子项全部局部禁用。';
    } else if (conflicts) {
      note.textContent = '父项关闭，但外部仍有 ' + conflicts + ' 个子项为开；只提示，不自动改。';
    } else {
      /* 2026-11-13：固定剧场父项关闭不再解释（渲染）。 */
      note.textContent = '';
    }
    if (note.textContent) append(wrap, note);
    return wrap;
  }

  function wordModeOf(m) {
    return m && m.wordRule && m.wordRule.mode === 'range' ? 'range' : 'min';
  }

  function parseWordRaw(raw) {
    const trimmed = text(raw).trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num <= 0) return null;
    return num;
  }

  function wordDraftValueOf(m, field) {
    const key = field === 'max' ? 'max' : 'min';
    if (wordDraft && typeof wordDraft[key] === 'string') return wordDraft[key];
    if (!m || !m.wordRule) return '';
    const value = key === 'max' ? m.wordRule.max : m.wordRule.min;
    return value === null || value === undefined ? '' : String(value);
  }

  /* 同时读两个输入（range 才读上限）；没有 DOM 时回落到模型/草稿。 */
  function readWordInputValues(m) {
    const out = { min: wordDraftValueOf(m, 'min'), max: wordDraftValueOf(m, 'max') };
    try {
      const inputs = root ? root.querySelectorAll('[data-ywpc-word-input]') : [];
      for (const input of inputs) {
        const field = input.getAttribute('data-ywpc-word-field') === 'max' ? 'max' : 'min';
        out[field] = text(input.value);
      }
    } catch (e) { /* 读不到就用草稿 */ }
    return out;
  }

  function createWordInput(m, field, usable, ariaLabel) {
    const input = createEl(doc, 'input', 'ywpc-word-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('data-ywpc-word-input', '1');
    input.setAttribute('data-ywpc-word-field', field);
    input.setAttribute('data-ywpc-focus-key', field === 'max' ? 'word:max' : 'word');
    input.setAttribute('aria-label', ariaLabel || (field === 'max' ? '字数上限' : '正文字数'));
    const shown = wordDraftValueOf(m, field);
    input.value = shown;
    if (!usable) {
      input.disabled = true;
      input.setAttribute('aria-disabled', 'true');
    }
    return input;
  }

  function renderWord(m) {
    const wrap = createEl(doc, 'div', 'ywpc-row');
    wrap.setAttribute('data-ywpc-word-box', '1');
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = '正文字数';
    append(wrap, label);
    const usable = m.wordState === 'ok' && !pinMode;
    const mode = wordModeOf(m);

    /* 真二选一：以上 = 至少 N 字；以内 = N~M 字。复用 seg 视觉。 */
    const seg = createEl(doc, 'div', 'ywpc-seg ywpc-word-mode');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', '字数规则');
    for (const option of [{ value: 'min', label: '以上' }, { value: 'range', label: '以内' }]) {
      const btn = createEl(doc, 'button', 'ywpc-seg-btn');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-ywpc-action', 'word-mode');
      btn.setAttribute('data-ywpc-mode', option.value);
      btn.setAttribute('data-ywpc-focus-key', 'word-mode:' + option.value);
      btn.setAttribute('aria-checked', mode === option.value ? 'true' : 'false');
      btn.title = option.value === 'min' ? '至少写到 N 字' : '写到 N~M 字以内';
      if (!usable) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
      const segLabel = createEl(doc, 'span', 'ywpc-seg-label');
      segLabel.textContent = option.label;
      append(btn, segLabel);
      append(seg, btn);
    }
    append(wrap, seg);

    const line = createEl(doc, 'div', 'ywpc-word');
    append(line, createWordInput(m, 'min', usable, mode === 'range' ? '字数下限' : '正文字数'));
    if (mode === 'range') {
      const sep = createEl(doc, 'span', 'ywpc-word-sep');
      sep.textContent = '~';
      append(line, sep);
      append(line, createWordInput(m, 'max', usable, '字数上限'));
      const rangeUnit = createEl(doc, 'span', 'ywpc-word-unit');
      rangeUnit.textContent = '字以内';
      append(line, rangeUnit);
    } else {
      const unit = createEl(doc, 'span', 'ywpc-word-unit');
      unit.textContent = '字';
      append(line, unit);
    }

    const minus = createEl(doc, 'button', 'ywpc-word-step');
    minus.type = 'button';
    minus.textContent = '−';
    minus.setAttribute('data-ywpc-action', 'word-step');
    minus.setAttribute('data-ywpc-step', '-100');
    minus.setAttribute('data-ywpc-focus-key', 'word-step:-100');
    minus.setAttribute('aria-label', '减少一百字');
    if (!usable) minus.disabled = true;
    append(line, minus);

    const plus = createEl(doc, 'button', 'ywpc-word-step');
    plus.type = 'button';
    plus.textContent = '＋';
    plus.setAttribute('data-ywpc-action', 'word-step');
    plus.setAttribute('data-ywpc-step', '100');
    plus.setAttribute('data-ywpc-focus-key', 'word-step:100');
    plus.setAttribute('aria-label', '增加一百字');
    if (!usable) plus.disabled = true;
    append(line, plus);
    append(wrap, line);

    const hint = createEl(doc, 'p', 'ywpc-word-hint');
    hint.setAttribute('data-ywpc-word-hint', '1');
    hint.textContent = wordHintText(m);
    append(wrap, hint);
    if (pinMode) {
      /* 字数控件本身不靠点击输入来钉；给一颗明确的专属按钮，不误改输入。 */
      const pinBtn = createEl(doc, 'button', 'ywpc-edit-btn ywpc-pin-word-btn');
      pinBtn.type = 'button';
      pinBtn.textContent = '钉到首页';
      pinBtn.setAttribute('data-ywpc-action', 'pin-word');
      pinBtn.setAttribute('data-ywpc-pin-id', m.wordPrompt ? String(m.wordPrompt.identifier || '') : '');
      pinBtn.setAttribute('data-ywpc-focus-key', 'pin:word');
      if (m.wordState !== 'ok') {
        pinBtn.disabled = true;
        pinBtn.setAttribute('aria-disabled', 'true');
        pinBtn.title = '字数条目缺项或格式不对，不能钉';
      }
      append(wrap, pinBtn);
    }
    return wrap;
  }

  function wordHintText(m) {
    if (wordError) return wordError;
    if (!m || m.wordState === 'missing') return '当前预设没有「🔢字数要求」这一条，不能改。';
    if (m.wordState === 'bad') return '这条字数要求的格式不对（两处应一致）；为避免改坏，已禁用。';
    if (pinMode) return '钉选模式：不改字数；要钉请点「钉到首页」。';
    const mode = wordModeOf(m);
    const min = parseWordRaw(wordDraftValueOf(m, 'min'));
    const max = parseWordRaw(wordDraftValueOf(m, 'max'));
    if (min === null) return '请输入正整数' + (mode === 'range' ? '（下限）' : '');
    if (mode === 'range') {
      if (max === null) return '请输入正整数（上限）';
      if (min > max) return '上限不能小于下限；这次没有写入。';
      return min + '~' + max + '字以内';
    }
    return min + '字以上';
  }

  function renderShortcuts(m, section) {
    const wrap = createEl(doc, 'div', 'ywpc-row ywpc-shortcut-wrap');
    if (!compact) {
      const label = createEl(doc, 'span', 'ywpc-control-label');
      label.textContent = '常用';
      append(wrap, label);
    }
    /* 固定四项 + 添加常用 + 布局里加到 common 的自增开关/组合开关，共用同一个网格。
       即使当前布局没有 shortcuts 控件，compact 也会独立渲染这一块。 */
    const grid = createEl(doc, 'div', 'ywpc-shortcuts');
    grid.setAttribute('data-ywpc-shortcut-grid', '1');
    const seenIds = new Set();
    /* 默认四项也当“手加默认”而不是固定项：full common 里可见、可 × 移出；
       compact 首页不加 ×，要删走整理模式。 */
    const hidden = commonHiddenSet(readSettings());
    for (const id of DEFAULT_COMMON_IDS) {
      if (hidden.has(id)) continue;
      seenIds.add(id);
      append(grid, renderShortcutCard(m, id, true, true));
    }
    for (const id of m.shortcuts) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      append(grid, renderShortcutCard(m, id, false, true));
    }
    const extras = [];
    if (compact) {
      for (const control of (section && section.controls) || []) {
        if (!control || control.kind === 'shortcuts') continue;
        if (control.kind === 'toggle' || control.kind === 'action') {
          if (!control.id || seenIds.has(control.id)) continue;
          seenIds.add(control.id);
          append(grid, renderShortcutCard(m, control.id, false, false, control.label));
        } else if (control.kind === 'comboToggle') {
          if (seenIds.has('combo:' + control.key)) continue;
          seenIds.add('combo:' + control.key);
          append(grid, renderShortcutComboCard(m, control));
        } else if (control.kind === 'missing') {
          const refId = control._ref && control._ref.type === 'prompt' ? String(control._ref.id || '') : '';
          if (refId && seenIds.has(refId)) continue;
          if (refId) seenIds.add(refId);
          else if (seenIds.has('missing:' + controlUid(control))) continue;
          else seenIds.add('missing:' + controlUid(control));
          if (refId) append(grid, renderShortcutCard(m, refId, false, false, control.label));
          else append(grid, renderMissingShortcutCard(control));
        } else if (control.kind !== 'info') {
          extras.push(control);
        }
      }
    }
    append(wrap, grid);
    /* compact 只保留能点的东西；radio/combo/word 等留到完整预设页。 */
    if (!compact) {
      const add = createEl(doc, 'button', 'ywpc-add');
      add.type = 'button';
      add.textContent = '＋ 添加常用';
      add.setAttribute('data-ywpc-action', 'add-shortcut');
      add.setAttribute('data-ywpc-focus-key', 'add-shortcut');
      append(wrap, add);

      if (pickerOpen) append(wrap, renderPicker(m));
    }
    for (const control of extras) {
      const node = renderControl(m, control);
      if (node) append(wrap, node);
    }
    return wrap;
  }

  function renderShortcutComboCard(m, control) {
    const status = comboStatus(m, control.members || []);
    const allAvailable = status.available.length === (control.members || []).length && status.available.length > 0;
    const card = createEl(doc, 'div', 'ywpc-shortcut');
    card.setAttribute('data-ywpc-shortcut', 'combo:' + control.key);
    const btn = createEl(doc, 'button', 'ywpc-toggle');
    btn.type = 'button';
    btn.setAttribute('data-ywpc-combo-toggle', control.key);
    btn.setAttribute('data-ywpc-focus-key', 'combo-toggle:' + control.key);
    btn.setAttribute('role', 'checkbox');
    btn.setAttribute('aria-checked', status.allOn ? 'true' : (status.someOn ? 'mixed' : 'false'));
    if (!allAvailable) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
    }
    btn.title = (control.members || []).map(id => PROMPT_NAMES[id] || id).join(' + ');
    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const labelEl = createEl(doc, 'span', 'ywpc-toggle-label');
    labelEl.textContent = control.label || '组合开关';
    const subEl = createEl(doc, 'span', 'ywpc-toggle-sub');
    subEl.setAttribute('data-ywpc-sub', '1');
    subEl.setAttribute('data-ywpc-sub-default', status.status);
    subEl.setAttribute('data-ywpc-shortcut-combo', '1');
    subEl.textContent = !allAvailable ? '部分条目不可用 · 已局部停用' : status.status;
    append(main, labelEl);
    append(main, subEl);
    const sw = createEl(doc, 'span', 'ywpc-switch');
    sw.setAttribute('aria-hidden', 'true');
    append(sw, createEl(doc, 'span', 'ywpc-knob'));
    append(btn, main);
    append(btn, sw);
    append(card, btn);
    return card;
  }

  function renderMissingShortcutCard(control) {
    const card = createEl(doc, 'div', 'ywpc-shortcut ywpc-missing');
    card.setAttribute('data-ywpc-shortcut', 'missing:' + controlUid(control));
    const btn = createEl(doc, 'button', 'ywpc-toggle ywpc-missing');
    btn.type = 'button';
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const labelEl = createEl(doc, 'span', 'ywpc-toggle-label');
    labelEl.textContent = control.label || '缺项';
    const subEl = createEl(doc, 'span', 'ywpc-toggle-sub');
    subEl.textContent = control._missingReason || '当前预设没有这项';
    append(main, labelEl);
    append(main, subEl);
    append(btn, main);
    append(card, btn);
    return card;
  }

  function renderShortcutCard(m, id, fixed, removable, customLabel, sourceUid) {
    const card = createEl(doc, 'div', 'ywpc-shortcut');
    card.setAttribute('data-ywpc-shortcut', id);
    const prompt = m.promptById.get(id);
    const present = isAvailable(m, id);
    const ordinary = isOrdinaryPrompt(prompt);
    const usable = present && ordinary;
    const realName = realNameFor(m, id);
    const reason = !present ? '当前预设没有这项' : (!ordinary ? '系统条目，不可切换' : '');
    const label = customLabel || (fixed ? shortLabelFor(id) : realName);
    if (id === ID.niah) {
      /* 2026-11-15：插小说防道歉 = 前面导航 + 后面拨钮两颗并列按钮；
         前面只导航到工具箱注入段（deps.openInjectionSection('wrap4a')），
         后面拨钮保持 applyToggle 原写入路径。 */
      card.classList.add('ywpc-split');
      const nav = makeInjectionNavButton(INJECTION_SECTION_NIAH, {
        kind: 'prompt',
        id,
        label,
        realName,
        sub: usable ? '' : reason,
        missing: !usable,
        navTitle: '打开工具箱「塞小说防道歉」设置',
        focusKey: 'nav:' + INJECTION_SECTION_NIAH,
      });
      const swBtn = makeSplitSwitchButton({
        'data-ywpc-toggle': id,
        'data-ywpc-shortcut-toggle': '1',
      }, {
        focusKey: 'toggle:' + id,
        available: usable,
        on: usable && isOn(m, id),
        switchTitle: usable
          ? '切换：' + realName + '（只这个拨钮改开关）'
          : realName + ' · ' + (reason || '当前预设没有这项'),
      });
      /* 布局实例 uid：只表示“这个控件来自哪一份布局”，不是首页 pin 的实例 uid。
       钉首页时另生成 pin.uid，两者不混用。并列卡挂在外层 wrapper 上，
       导航/拨钮两颗按钮都能被钉选识别。 */
      if (sourceUid) card.setAttribute('data-ywpc-source-uid', String(sourceUid));
      append(card, nav);
      append(card, swBtn);
    } else {
      const toggle = makeToggle(m, id, label, {
        sub: '',
        missingText: reason,
        focusKey: 'toggle:' + id,
        availableOverride: usable,
        realName: realName,
        shortcut: true,
      });
      /* 布局实例 uid：只表示“这个控件来自哪一份布局”，不是首页 pin 的实例 uid。
         钉首页时另生成 pin.uid，两者不混用。 */
      if (sourceUid) toggle.setAttribute('data-ywpc-source-uid', String(sourceUid));
      append(card, toggle);
    }
    if (removable && !compact) {
      const remove = createEl(doc, 'button', 'ywpc-shortcut-remove');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('data-ywpc-action', 'remove-shortcut');
      remove.setAttribute('data-ywpc-id', id);
      remove.setAttribute('data-ywpc-focus-key', 'remove:' + id);
      remove.setAttribute('aria-label', '移出常用：' + realName + '（不改开关值）');
      remove.title = '只移出常用，不改开关值';
      append(card, remove);
    }
    return card;
  }

  function renderToolboxFlagCard(m, control) {
    const flag = text(control && control.flag);
    const definition = control || TOOLBOX_FLAG_BY_KEY.get(flag) || {};
    const usable = canUseToolboxFlag(flag);
    const on = usable && readToolboxFlag(flag);
    const card = createEl(doc, 'div', 'ywpc-shortcut');
    card.setAttribute('data-ywpc-shortcut', 'toolbox:' + flag);
    const stateText = usable ? (on ? '已开启' : '已关闭') : '工具箱开关接口未就绪';
    if (flag === TOOLBOX_FLAG_RAND_HEAD) {
      /* 2026-11-15：随机头部 = 前面导航 + 后面拨钮两颗并列按钮；
         前面只导航（deps.openInjectionSection('rand_head')），
         后面拨钮保持 writeToolboxFlag 原写入路径。 */
      card.classList.add('ywpc-split');
      const nav = makeInjectionNavButton(INJECTION_SECTION_RAND_HEAD, {
        kind: 'toolboxFlag',
        id: flag,
        label: definition.label || '🎲随机头部',
        realName: definition.label || '随机头部',
        sub: stateText,
        navTitle: '打开工具箱「随机头部」设置',
        focusKey: 'nav:' + INJECTION_SECTION_RAND_HEAD,
      });
      const btn = makeSplitSwitchButton({ 'data-ywpc-toolbox-flag': flag }, {
        focusKey: 'toolbox:' + flag,
        available: usable,
        on,
        switchTitle: (definition.label || '随机头部') + ' · 只这个拨钮改工具箱开关',
      });
      append(card, nav);
      append(card, btn);
      return card;
    }
    const btn = createEl(doc, 'button', 'ywpc-toggle');
    btn.type = 'button';
    btn.setAttribute('data-ywpc-toolbox-flag', flag);
    btn.setAttribute('data-ywpc-focus-key', 'toolbox:' + flag);
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    if (!usable) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
    }
    btn.title = (definition.label || '随机头部') + ' · 只改工具箱这一项开关';
    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const labelEl = createEl(doc, 'span', 'ywpc-toggle-label');
    labelEl.textContent = definition.label || '随机头部';
    const subEl = createEl(doc, 'span', 'ywpc-toggle-sub');
    subEl.setAttribute('data-ywpc-sub', '1');
    subEl.setAttribute('data-ywpc-sub-default', stateText);
    subEl.textContent = stateText;
    append(main, labelEl);
    append(main, subEl);
    const sw = createEl(doc, 'span', 'ywpc-switch');
    sw.setAttribute('aria-hidden', 'true');
    append(sw, createEl(doc, 'span', 'ywpc-knob'));
    append(btn, main);
    append(btn, sw);
    append(card, btn);
    return card;
  }

  function renderInlinePair(first, second) {
    const row = createEl(doc, 'div', 'ywpc-inline-pair');
    row.setAttribute('data-ywpc-inline-pair', '1');
    append(row, first);
    append(row, second);
    return row;
  }

  function pinPromptLabel(m, id) {
    /* 固定四常用保持短标签；其它条目沿用真实名（含用户自定义 emoji）。 */
    return FIXED_SET.has(id) ? shortLabelFor(id) : realNameFor(m, id);
  }

  function renderPinOptionCard(m, pin) {
    const resolved = resolveHomePin(m, pin);
    const card = createEl(doc, 'div', 'ywpc-shortcut ywpc-pin-option-card');
    card.setAttribute('data-ywpc-shortcut', homePinKey(pin));
    const btn = createEl(doc, 'button', 'ywpc-toggle');
    btn.type = 'button';
    btn.setAttribute('data-ywpc-pin-card', encodeHomePin(pin));
    btn.setAttribute('data-ywpc-focus-key', 'pin-card:' + homePinKey(pin));
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', resolved.on ? 'true' : 'false');
    if (!resolved.available) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('ywpc-missing');
    }
    btn.title = resolved.label + (resolved.sub ? ' · ' + resolved.sub : '');
    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const labelEl = createEl(doc, 'span', 'ywpc-toggle-label');
    labelEl.textContent = resolved.label || homePinKey(pin);
    const subEl = createEl(doc, 'span', 'ywpc-toggle-sub');
    subEl.setAttribute('data-ywpc-sub', '1');
    subEl.setAttribute('data-ywpc-sub-default', resolved.sub || '');
    subEl.textContent = resolved.sub || '';
    append(main, labelEl);
    if (subEl.textContent) append(main, subEl);
    const sw = createEl(doc, 'span', 'ywpc-switch ywpc-pin-option-switch');
    sw.setAttribute('aria-hidden', 'true');
    append(sw, createEl(doc, 'span', 'ywpc-knob'));
    append(btn, main);
    append(btn, sw);
    append(card, btn);
    return card;
  }

  /* 十二格有序网格：按数组顺序排，不用 dense 回填。
     普通浏览的空块完全空白、不可点、不可聚焦；编辑态才显示淡轮廓。 */
  function makeSpaceBlock(edit, label) {
    const node = createEl(doc, 'div', 'ywpc-space' + (edit ? ' ywpc-space-edit' : ''));
    node.setAttribute('data-ywpc-space', '1');
    if (!edit) {
      node.setAttribute('aria-hidden', 'true');
      return node;
    }
    node.textContent = label || '空白占位';
    return node;
  }

  function appendGridCell(grid, node, width) {
    const cell = createEl(doc, 'div', 'ywpc-cell');
    cell.setAttribute('data-ywpc-w', String(explicitLayoutWidth(width) || 12));
    if (node) append(cell, node);
    append(grid, cell);
    return cell;
  }

  /* compact 有显式钉选键时：只按保存顺序画卡片；单条/组合开关沿用原有真实卡片，
     单选/组合整组复用预设页的 renderRadio/renderCombo（组小标题 + 全部选项）。
     随机头部现在也是普通 pin：按它在数组里的位置单独占一格，不再跟 niah 绑成一行。
     每格宽度优先继承来源控件的显式 width；来源未显式设宽时保持首页旧默认。 */
  function renderPinBoard(m, section) {
    const wrap = createEl(doc, 'div', 'ywpc-row ywpc-shortcut-wrap');
    wrap.setAttribute('data-ywpc-pin-board', '1');
    const grid = createEl(doc, 'div', 'ywpc-grid12 ywpc-home-grid');
    grid.setAttribute('data-ywpc-shortcut-grid', '1');
    for (const pin of m.homePins) {
      const width = homePinCellWidth(m, pin);
      if (pin.type === 'spacer') {
        appendGridCell(grid, makeSpaceBlock(false), width);
        continue;
      }
      let node = null;
      if (pin.type === 'prompt') {
        node = renderShortcutCard(m, pin.id, false, false, pinPromptLabel(m, pin.id), '');
      } else if (pin.type === 'toolboxFlag') {
        const def = TOOLBOX_FLAG_BY_KEY.get(pin.key) || null;
        node = def ? renderToolboxFlagCard(m, def) : renderMissingShortcutCard({
          key: pin.key,
          label: '工具箱开关',
          _ref: { type: 'builtin', key: 'toolbox:' + pin.key },
          _missingReason: '这个工具箱开关已不在当前布局',
        });
      } else if (pin.type === 'comboToggle') {
        const def = definitionForKey(m, pin.key, ['comboToggle']);
        node = def ? renderShortcutComboCard(m, def) : renderMissingShortcutCard({
          key: pin.key,
          label: '组合开关',
          _ref: { type: 'builtin', key: 'group:' + pin.key },
          _missingReason: '这个组合已不在当前布局',
        });
      } else if (pin.type === 'word') {
        node = createEl(doc, 'div', 'ywpc-pin-word');
        const resolved = resolveHomePin(m, pin);
        if (resolved.available) {
          /* compact 首页复用原字数控件：改动仍走 commitWordRule 原保存链。 */
          append(node, renderWord(m));
        } else {
          append(node, renderMissingShortcutCard({
            _ref: { type: 'builtin', key: 'word:' + pin.id },
            label: '🔢 正文字数',
            _missingReason: resolved.sub || '字数控件当前不可用',
          }));
        }
      } else if (pin.type === 'radio' || pin.type === 'combo') {
        /* 整组 pin：复用完整预设页的 renderRadio/renderCombo，组小标题一起搬到首页；
           316 旧 option pin 已在模型归一成这种整组 pin，不再画单选项卡。 */
        const def = definitionForKey(m, pin.key, [pin.type]);
        node = createEl(doc, 'div', 'ywpc-pin-group');
        node.setAttribute('data-ywpc-pin-group-holder', pin.type + ':' + pin.key);
        if (def && def.kind === pin.type) {
          append(node, pin.type === 'radio' ? renderRadio(m, def) : renderCombo(m, def));
        } else {
          append(node, renderMissingShortcutCard({
            key: pin.key,
            label: '选择组',
            _ref: { type: 'builtin', key: 'group:' + pin.type + ':' + pin.key },
            _missingReason: '这个选择组已不在当前布局',
          }));
        }
      } else {
        node = renderPinOptionCard(m, pin);
      }
      if (node) appendGridCell(grid, node, width);
    }
    append(wrap, grid);
    if (!m.homePins.length) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = '首页还没有常用；用主控的「添加」去钉选。';
      append(wrap, empty);
    }
    /* 显式钉选数组只画 pin：空数组就是空，不默默追加 common 里没钉的控件。 */
    if (typeof pinModeRequest === 'function') append(wrap, pinAddButton());
    return wrap;
  }

  function attachDataAttrs(node, attrs) {
    for (const key of Object.keys(attrs || {})) {
      const value = attrs[key];
      if (value === undefined || value === null || value === '') continue;
      node.setAttribute('data-ywpc-' + key, String(value));
    }
    return node;
  }

  /* 四档宽度按钮：1/4、1/3、1/2、全行（12 格）。按钮是拖动手柄之外的精确保底。 */
  function makeWidthButtons(activeWidth, action, attrs) {
    const wrap = createEl(doc, 'div', 'ywpc-wbtns');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', '宽度');
    for (const width of WIDTH_STEPS) {
      const btn = createEl(doc, 'button', 'ywpc-wbtn');
      btn.type = 'button';
      btn.textContent = WIDTH_STEP_LABELS[width];
      btn.title = '宽度：' + WIDTH_STEP_LABELS[width];
      btn.setAttribute('data-ywpc-action', action);
      btn.setAttribute('data-ywpc-width', String(width));
      btn.setAttribute('aria-pressed', activeWidth === width ? 'true' : 'false');
      btn.setAttribute('data-ywpc-focus-key', [
        'layout:width', action,
        (attrs && [attrs.uid || '', attrs.value || '', attrs['space-uid'] || '', attrs.pin || ''].join('~')) || '',
        String(width),
      ].join(':'));
      if (activeWidth === width) btn.classList.add('ywpc-current');
      attachDataAttrs(btn, attrs);
      append(wrap, btn);
    }
    return wrap;
  }

  function makeWidthHandle(action, attrs, label) {
    const handle = createEl(doc, 'span', 'ywpc-whandle');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', label || '拖动调整宽度');
    handle.title = label || '拖动调整宽度（吸附 1/4、1/3、1/2、全行）';
    handle.setAttribute('data-ywpc-width-handle', action);
    attachDataAttrs(handle, attrs);
    return handle;
  }

  function renderPinEditRow(m, pin, index, total) {
    if (pin.type === 'spacer') return renderPinSpacerRow(pin, index, total);
    const resolved = resolveHomePin(m, pin);
    const row = createEl(doc, 'div', 'ywpc-pin-row');
    row.setAttribute('data-ywpc-pin-row', encodeHomePin(pin));
    row.setAttribute('data-ywpc-pin-index', String(index));
    row.title = '拖动排序；不会切换任何开关';
    if (!resolved.available) row.classList.add('ywpc-missing');
    const handle = createEl(doc, 'span', 'ywpc-pin-drag');
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    handle.setAttribute('data-ywpc-pin-drag', encodeHomePin(pin));
    append(row, handle);
    const main = createEl(doc, 'div', 'ywpc-pin-main');
    const label = createEl(doc, 'span', 'ywpc-pin-label');
    label.textContent = resolved.label || homePinKey(pin);
    const sub = createEl(doc, 'span', 'ywpc-pin-sub');
    sub.textContent = resolved.sub || '';
    append(main, label);
    append(main, sub);
    append(row, main);
    const ops = createEl(doc, 'div', 'ywpc-pin-ops');
    append(ops, pinEditButton('↑', 'pin-up', pin, index === 0));
    append(ops, pinEditButton('↓', 'pin-down', pin, index >= total - 1));
    append(ops, pinEditButton('×', 'pin-remove', pin, false));
    append(row, ops);
    return row;
  }

  /* 首页整理里的空白块：可拖动排序、四档改宽、上下移兜底、移除。
     普通浏览由 renderPinBoard 画成完全空白的占位格。 */
  function renderPinSpacerRow(pin, index, total) {
    const encoded = encodeHomePin(pin);
    const row = createEl(doc, 'div', 'ywpc-pin-row ywpc-pin-space-row');
    row.setAttribute('data-ywpc-pin-row', encoded);
    row.setAttribute('data-ywpc-pin-index', String(index));
    row.setAttribute('data-ywpc-pin-space', '1');
    row.title = '空白块：只占首页宽度，平时不显示、不可点击；拖动排序';
    const handle = createEl(doc, 'span', 'ywpc-pin-drag');
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    handle.setAttribute('data-ywpc-pin-drag', encoded);
    append(row, handle);
    const main = createEl(doc, 'div', 'ywpc-pin-main');
    const label = createEl(doc, 'span', 'ywpc-pin-label');
    label.textContent = '空白块';
    const sub = createEl(doc, 'span', 'ywpc-pin-sub');
    sub.textContent = '宽度 ' + (WIDTH_STEP_LABELS[pin.width] || '半行') + ' · 平时不显示、不可点、不切开关';
    append(main, label);
    append(main, sub);
    append(row, main);
    const ops = createEl(doc, 'div', 'ywpc-pin-ops');
    append(ops, makeWidthButtons(pin.width, 'home-space-width', { pin: encoded }));
    append(ops, makeWidthHandle('home-space', { pin: encoded }, '拖动调整空白块宽度'));
    append(ops, pinEditButton('↑', 'pin-up', pin, index === 0));
    append(ops, pinEditButton('↓', 'pin-down', pin, index >= total - 1));
    append(ops, pinEditButton('×', 'pin-remove', pin, false));
    append(row, ops);
    return row;
  }

  function renderPinEditor(m) {
    const wrap = createEl(doc, 'div', 'ywpc-pin-editor');
    wrap.setAttribute('data-ywpc-pin-editor', '1');
    const head = createEl(doc, 'div', 'ywpc-pin-editor-head');
    const title = createEl(doc, 'strong', 'ywpc-pin-editor-title');
    title.textContent = '首页常用 · 整理';
    const hint = createEl(doc, 'span', 'ywpc-pin-editor-hint');
    hint.textContent = '拖动或用箭头排序；只改首页显示，不会切换任何开关。';
    append(head, title);
    append(head, hint);
    append(wrap, head);
    const list = createEl(doc, 'div', 'ywpc-pin-list');
    list.setAttribute('data-ywpc-pin-list', '1');
    m.homePins.forEach((pin, index) => append(list, renderPinEditRow(m, pin, index, m.homePins.length)));
    append(wrap, list);
    if (!m.homePins.length) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = '首页还没有常用；用主控的「添加」去钉选。';
      append(wrap, empty);
    }
    const addSpace = createEl(doc, 'button', 'ywpc-add ywpc-pin-add-space');
    addSpace.type = 'button';
    addSpace.textContent = '＋ 添加空白块';
    addSpace.setAttribute('data-ywpc-action', 'home-add-space');
    addSpace.setAttribute('data-ywpc-focus-key', 'pin:add-space');
    addSpace.title = '只占首页宽度，不显示内容、不进入焦点、不切换任何开关';
    append(wrap, addSpace);
    if (typeof pinModeRequest === 'function') append(wrap, pinAddButton());
    return wrap;
  }

  function renderPicker(m) {
    const picker = createEl(doc, 'div', 'ywpc-picker');
    picker.setAttribute('data-ywpc-picker', '1');
    const head = createEl(doc, 'div', 'ywpc-picker-head');
    const search = createEl(doc, 'input', 'ywpc-picker-search');
    search.type = 'search';
    search.placeholder = '搜索条目名…';
    search.autocomplete = 'off';
    search.setAttribute('data-ywpc-picker-search', '1');
    search.setAttribute('data-ywpc-focus-key', 'picker-search');
    search.value = pickerQuery;
    append(head, search);
    const close = createEl(doc, 'button', 'ywpc-add');
    close.type = 'button';
    close.textContent = '收起';
    close.setAttribute('data-ywpc-action', 'close-picker');
    close.setAttribute('data-ywpc-focus-key', 'close-picker');
    append(head, close);
    append(picker, head);
    const list = createEl(doc, 'div', 'ywpc-picker-list');
    list.setAttribute('data-ywpc-picker-list', '1');
    append(picker, list);
    renderPickerList(list, m);
    return picker;
  }

  function renderPickerList(list, m) {
    clearNode(list);
    const query = normalizeSearch(pickerQuery);
    let shown = 0;
    const pool = m.shortcutPool || [];
    for (const item of pool) {
      const realName = realNameFor(m, item.id);
      const haystack = normalizeSearch(item.label + ' ' + realName + ' ' + item.id);
      if (query && haystack.indexOf(query) < 0) continue;
      shown += 1;
      const row = createEl(doc, 'div', 'ywpc-pick-row');
      const main = createEl(doc, 'div', 'ywpc-pick-main');
      const label = createEl(doc, 'span', 'ywpc-pick-label');
      label.textContent = item.label;
      const sub = createEl(doc, 'span', 'ywpc-pick-sub');
      const available = isShortcutToggleable(m, item.id);
      const fixed = FIXED_SET.has(item.id);
      const added = m.shortcuts.includes(item.id);
      sub.textContent = !available
        ? '当前预设没有这项'
        : (fixed ? '已在固定常用' : (added ? '已在常用里 · 可去钉首页再加副本' : '可加入常用'));
      append(main, label);
      append(main, sub);
      append(row, main);

      const add = createEl(doc, 'button', 'ywpc-pick-add');
      add.type = 'button';
      add.textContent = fixed ? '已添加' : (added ? '钉首页' : '加入');
      if (added && !fixed) {
        /* 常用是字符串列表，放不下同一条的多个实例；追加副本统一走首页钉选（实例 uid）。 */
        add.setAttribute('data-ywpc-action', 'pin-mode-open');
        add.setAttribute('data-ywpc-focus-key', 'pick-pin:' + item.id);
      } else {
        add.setAttribute('data-ywpc-action', 'pick-add');
        add.setAttribute('data-ywpc-id', item.id);
        add.setAttribute('data-ywpc-focus-key', 'pick-add:' + item.id);
      }
      if (!available || fixed) add.disabled = true;
      append(row, add);
      append(list, row);
    }
    if (!shown) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = '没搜到条目。';
      append(list, empty);
    }
  }

  /* ------------------------------------------------------------------------
     布局编辑（full 页）：draft 只在内存；保存才写 presetControlLayouts。
     不碰 prompt_order、不写 prompt 正文、不改原 prompt 名。
     ------------------------------------------------------------------------ */
  function activeSections(m) {
    return editing && Array.isArray(editSections) ? editSections : (m ? m.layoutSections : []);
  }

  function layoutKindLabel(control) {
    const kind = control && control.kind;
    if (kind === 'radio') return '单选';
    if (kind === 'combo') return '组合';
    if (kind === 'comboToggle') return '开关组';
    if (kind === 'multi') return '多选';
    if (kind === 'word') return '字数';
    if (kind === 'shortcuts') return '快捷';
    if (kind === 'info') return '说明';
    if (kind === 'spacer') return '空白';
    if (kind === 'missing') return '缺项';
    return '开关';
  }

  function cloneOptionLayout(control) {
    if (!control || !Array.isArray(control.optionLayout)) return undefined;
    let list = null;
    try {
      list = normalizeOptionLayout(control.optionLayout, control.options);
    } catch (e) {
      list = null;
    }
    if (!Array.isArray(list)) list = control.optionLayout;
    const out = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.type === 'spacer') {
        out.push({
          type: 'spacer',
          uid: String(entry.uid || entry.key || ''),
          width: explicitLayoutWidth(entry.width) || 6,
        });
      } else {
        out.push({
          type: 'option',
          value: String(entry.value == null ? '' : entry.value),
          ...(explicitLayoutWidth(entry.width) ? { width: explicitLayoutWidth(entry.width) } : {}),
        });
      }
    }
    return out;
  }

  function cloneEditSections(m) {
    const source = (m && m.layoutSections) || [];
    return source.map(section => ({
      id: String(section.id || ''),
      label: String(section.label || ''),
      note: String(section.note || ''),
      icon: String(section.icon || ''),
      builtin: !!section.builtin,
      custom: !!section.custom,
      controls: (section.controls || []).map(control => ({
        kind: control.kind,
        id: control.id,
        key: control.key,
        label: String(control.label || ''),
        sub: String(control.sub || ''),
        icon: String(control.icon || ''),
        width: explicitLayoutWidth(control.width) || undefined,
        optionLayout: cloneOptionLayout(control),
        options: Array.isArray(control.options)
          ? control.options.map(option => ({
            value: String(option.value || ''),
            label: String(option.label || ''),
            ids: Array.isArray(option.ids) ? option.ids.slice() : [],
            ...(option.sub ? { sub: String(option.sub) } : {}),
          }))
          : undefined,
        allIds: Array.isArray(control.allIds) ? control.allIds.slice() : undefined,
        members: Array.isArray(control.members) ? control.members.slice() : undefined,
        ids: Array.isArray(control.ids) ? control.ids.slice() : undefined,
        labels: Array.isArray(control.labels) ? control.labels.slice() : undefined,
        exactlyOne: !!control.exactlyOne,
        atMostOne: !!control.atMostOne,
        allowNone: !!control.allowNone,
        masterId: control.masterId,
        parentId: control.parentId,
        flag: control.flag,
        text: control.text,
        _ref: controlRef(control),
        _uid: controlUid(control),
        _custom: !!control._custom,
        _missingReason: control._missingReason || '',
        _savedOverride: control._savedOverride ? JSON.parse(JSON.stringify(control._savedOverride)) : undefined,
        _hasOverride: !!control._hasOverride,
        _overrideDirty: false,
      })),
    }));
  }

  function editSectionsOfModel() {
    if (Array.isArray(editSections)) return editSections;
    return [];
  }

  function findEditSection(id) {
    return editSectionsOfModel().find(section => section.id === id) || null;
  }

  function findEditControl(uid) {
    for (const section of editSectionsOfModel()) {
      const index = (section.controls || []).findIndex(control => controlUid(control) === uid);
      if (index >= 0) return { section, control: section.controls[index], index };
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     当前分组 / 分组分页 / 插入位置
     ------------------------------------------------------------------------ */

  function groupPageOfSection(id) {
    const sections = editSectionsOfModel();
    const index = sections.findIndex(section => section.id === id);
    if (index < 0) return 0;
    return Math.floor(index / EDIT_GROUPS_PER_PAGE);
  }

  function clampEditGroupPage() {
    const sections = editSectionsOfModel();
    const pages = Math.max(1, Math.ceil(sections.length / EDIT_GROUPS_PER_PAGE));
    if (!Number.isFinite(editGroupPage)) editGroupPage = 0;
    editGroupPage = Math.max(0, Math.min(Math.floor(editGroupPage), pages - 1));
    return pages;
  }

  /* 普通态没有编辑态分组 id 时：优先用户点开过的组；同时开多组时取离视口顶部最近的那组，
     没有展开组就取可见区里最近的一组。程序性开合不经过这里。 */
  function visibleSectionIdFromDom() {
    if (!root) return '';
    let nodes = [];
    try { nodes = Array.from(root.querySelectorAll('details[data-ywpc-section]')); } catch (e) { nodes = []; }
    if (!nodes.length) return '';
    let top = 0;
    let bottom = 0;
    let scroller = findScrollParent(root);
    try {
      if (scroller && typeof scroller.getBoundingClientRect === 'function') {
        const box = scroller.getBoundingClientRect();
        top = Number(box.top) || 0;
        bottom = Number(box.bottom) || 0;
      } else if (win) {
        top = 0;
        bottom = Number(win.innerHeight) || 0;
      }
    } catch (e) { top = 0; bottom = 0; }
    const open = nodes.filter(node => sectionOpen(node));
    const pool = open.length ? open : nodes;
    let bestId = '';
    let bestDistance = Infinity;
    for (const node of pool) {
      const id = text(node.getAttribute('data-ywpc-section'));
      if (!id) continue;
      const head = node.querySelector('summary') || node;
      let distance = 0;
      try {
        const rect = head.getBoundingClientRect();
        const visible = rect.bottom >= top && rect.top <= bottom;
        if (visible) distance = Math.abs((Number(rect.top) || 0) - top);
        else if ((Number(rect.top) || 0) > bottom) distance = (Number(rect.top) || 0) - bottom;
        else distance = top - (Number(rect.bottom) || 0);
      } catch (e) { distance = 0; }
      if (distance < bestDistance) { bestDistance = distance; bestId = id; }
    }
    return bestId || text(pool[0] && pool[0].getAttribute('data-ywpc-section'));
  }

  /* 用户在普通页点组头或组内任何控件时记录最近分组；只认用户点击。 */
  function noteActiveSection(target) {
    if (!target || editing || compact) return;
    const section = closest(target, 'details[data-ywpc-section]');
    if (!section) return;
    const id = text(section.getAttribute('data-ywpc-section'));
    if (!id) return;
    lastActiveSectionId = id;
    lastActiveSectionName = (model && model.name) || lastPresetName || '';
  }

  /* 新控件插在当前选中块之后；没有选中（或选中在别的组）就放到末尾。 */
  function insertIndexFor(section) {
    if (!section) return 0;
    if (editSelectedUid) {
      const hit = findEditControl(editSelectedUid);
      if (hit && hit.section.id === section.id) return hit.index + 1;
    }
    return (section.controls || []).length;
  }

  function focusBlockSettingsTitle(uid) {
    if (!root || !uid) return;
    try {
      const input = root.querySelector('[data-ywpc-focus-key="layout:control:'
        + uid.replace(/"/g, '\\"') + ':title"]');
      if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
    } catch (e) { /* 焦点失败不影响布局 */ }
  }

  function focusSettingsClose(uid) {
    if (!root || !uid) return;
    try {
      const btn = root.querySelector('[data-ywpc-focus-key="layout:block:'
        + uid.replace(/"/g, '\\"') + ':close"]');
      if (btn && typeof btn.focus === 'function') btn.focus({ preventScroll: true });
    } catch (e) { /* 焦点失败不影响布局 */ }
  }

  /* 打开设置后只做最小滚动：保证设置面板顶部进入滚动区；不把块滚到顶上。 */
  function revealBlockSettings(uid) {
    if (!root || !uid) return;
    try {
      const pane = root.querySelector('[data-ywpc-canvas-settings="' + uid.replace(/"/g, '\\"') + '"]');
      if (!pane) return;
      const scroller = findScrollParent(pane);
      if (!scroller) return;
      const box = scroller.getBoundingClientRect();
      const rect = pane.getBoundingClientRect();
      const bottomPad = 24;
      if (rect.top < box.top + 8) {
        scroller.scrollTop = Math.max(0, (Number(scroller.scrollTop) || 0) + rect.top - box.top - 8);
      } else if (rect.top > box.bottom - bottomPad) {
        scroller.scrollTop = Math.max(0, (Number(scroller.scrollTop) || 0) + rect.top - box.top - 8);
      }
    } catch (e) { /* 滚动失败不影响设置 */ }
  }

  function manageUsedPromptIds(m, sections) {
    const used = new Set();
    for (const section of sections || []) {
      for (const control of section.controls || []) {
        if (control.kind === 'toggle' && control.id) used.add(String(control.id));
        if (control.kind === 'action' && control.id) used.add(String(control.id));
        for (const id of control.members || []) used.add(String(id));
        for (const id of control.ids || []) used.add(String(id));
        for (const option of control.options || []) {
          for (const id of option.ids || []) used.add(String(id));
        }
        if (control._ref && control._ref.type === 'prompt') used.add(String(control._ref.id));
      }
    }
    return used;
  }

  function beginEdit() {
    if (compact || pinMode) return false;
    if (contentEdit || contentPick) {
      showToast('先退出条目正文编辑，再编辑布局。', 'warn');
      return false;
    }
    const m = model || buildModel();
    if (!m.scenarioFound) {
      showToast('没读到当前预设的条目列表，不能编辑布局。', 'warn');
      return false;
    }
    const token = captureToken();
    if (!token.scenario || !tokenCurrent(token)) {
      showToast('当前预设身份没核稳，暂不能编辑布局。', 'warn');
      return false;
    }
    editToken = token;
    editing = true;
    editSections = cloneEditSections(m);
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    layoutQuery = '';
    layoutAddTarget = '';
    /* 进入用户正在看的那一组：优先本次会话里点过/操作过的组，再退到页面上可见的组；
       两者都不可用时才用第一组（不改用户已有的展开/滚动位置）。 */
    const sections = editSectionsOfModel();
    const remembered = lastActiveSectionName === m.name ? lastActiveSectionId : '';
    const fromDom = visibleSectionIdFromDom();
    let preferred = remembered && sections.some(section => section.id === remembered)
      ? remembered
      : (fromDom && sections.some(section => section.id === fromDom) ? fromDom : '');
    if (!preferred) preferred = sections[0] ? sections[0].id : '';
    editSectionId = preferred;
    editGroupPage = groupPageOfSection(preferred);
    editOpenUid = '';
    editSelectedUid = '';
    editSelectedOption = null;
    editMoreOpen = false;
    newSectionName = '';
    restoreConfirm = false;
    pendingEntrySection = preferred;
    pendingExitSection = '';
    pendingOpenSection = '';
    if (preferred) lastActiveSectionId = preferred;
    lastActiveSectionName = m.name;
    refresh({ force: true, reason: 'layout-edit-open' });
    return true;
  }

  function cancelEdit() {
    if (!editing) return;
    const exitSection = editSectionId;
    pendingExitSection = exitSection;
    pendingOpenSection = exitSection;
    editing = false;
    editSections = null;
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    layoutQuery = '';
    layoutAddTarget = '';
    editSectionId = '';
    editOpenUid = '';
    editSelectedUid = '';
    editSelectedOption = null;
    editMoreOpen = false;
    newSectionName = '';
    restoreConfirm = false;
    editToken = null;
    refresh({ force: true, reason: 'layout-edit-cancel' });
    showToast('已取消布局编辑；没有保存任何布局改动。', 'info');
  }

  /* ------------------------------------------------------------------------
     正文编辑（完整预设页）
     ------------------------------------------------------------------------
     - 入口：full 页 header 的「条目编辑」按钮，或 api.beginContentEdit()
       （主 CC 首页按钮会先 center.open('preset') 同步挂载，再调这里）；
     - 选条目模式只负责定位真实 prompt：精确走 model.actualIds 映射，
       不切开关、不钉首页、不写布局、不凭名字模糊猜；
     - 编辑页只维护内存草稿；点保存才调 deps.savePromptContent，
       失败/被外部改过/切了预设都保留草稿并明确说不成功，不假报已保存。
     ------------------------------------------------------------------------ */

  function isContentEditablePrompt(prompt) {
    if (!prompt || prompt.marker === true) return false;
    const id = text(prompt.identifier);
    if (!id || NON_TOGGLE_ID_SET.has(id)) return false;
    if (typeof prompt.content !== 'string') return false;
    const name = text(prompt.name).trim();
    if (name && /^[\s\-—_=~·.…─━┄┈┉┊┋]+$/u.test(name)) return false;
    return true;
  }

  function actualContentTarget(m, canonicalOrActual) {
    if (!m) return null;
    const id = text(canonicalOrActual);
    if (!id || !hasOwn(m.orderMap, id)) return null;
    const actual = m.actualIds[id] || id;
    const prompt = m.promptById.get(id) || m.promptById.get(actual) || null;
    if (!prompt || !isContentEditablePrompt(prompt)) return null;
    /* actualIds 与 prompt.identifier 必须对上；对不上就不猜，宁可提示不可编辑。 */
    if (text(prompt.identifier) !== actual) return null;
    return { canonical: id, actual, prompt };
  }

  function contentEntryName(target) {
    if (!target || !target.prompt) return '未命名条目';
    const name = text(target.prompt.name).trim();
    if (name) return name;
    return PROMPT_NAMES[target.canonical] || '未命名条目';
  }

  function contentRowsForModel(m) {
    if (!m || !m.scenarioFound) return [];
    const canonicalByActual = new Map();
    for (const [canonical, actual] of Object.entries(m.actualIds || {})) canonicalByActual.set(actual, canonical);
    const rows = [];
    const seen = new Set();
    const push = (rawId) => {
      const id = text(rawId);
      if (!id) return;
      const canonical = canonicalByActual.get(id) || id;
      const actual = m.actualIds[canonical] || id;
      if (!actual || seen.has(actual)) return;
      if (!hasOwn(m.orderMap, canonical) && !hasOwn(m.orderMap, actual)) return;
      seen.add(actual);
      const prompt = m.promptById.get(canonical) || m.promptById.get(actual) || null;
      const target = actualContentTarget(m, canonical);
      const enabled = hasOwn(m.toggles, canonical)
        ? !!m.toggles[canonical]
        : (hasOwn(m.toggles, actual) ? !!m.toggles[actual] : m.orderMap[canonical] === true);
      const fallbackName = text(prompt && prompt.name).trim() || PROMPT_NAMES[canonical] || '未命名条目';
      if (target) {
        rows.push({
          kind: 'prompt',
          canonical,
          actual,
          name: fallbackName,
          note: enabled ? '' : '未启用 · 可编辑正文',
          enabled,
        });
      } else if (prompt) {
        rows.push({
          kind: 'marker',
          canonical,
          actual,
          name: fallbackName,
          note: '系统标记，没有正文',
          enabled,
        });
      } else {
        rows.push({
          kind: 'missing',
          canonical,
          actual,
          name: fallbackName,
          note: '没有可读正文',
          enabled,
        });
      }
    };
    const orderRows = Array.isArray(m.scenario?.order) ? m.scenario.order : [];
    for (const row of orderRows) if (row && typeof row.identifier === 'string') push(row.identifier);
    for (const key of Object.keys(m.orderMap)) push(key);
    return rows;
  }

  function contentFilteredRows(m) {
    let rows = contentRowsForModel(m);
    if (contentPickGroup) {
      const allowed = new Set(contentPickGroup.ids.map(id => text(id)));
      rows = rows.filter(row => allowed.has(row.canonical));
    }
    const query = normalizeSearch(contentPickQuery);
    if (query) {
      rows = rows.filter(row => {
        const hay = row.name + ' ' + (PROMPT_NAMES[row.canonical] || '');
        return normalizeSearch(hay).indexOf(query) >= 0;
      });
    }
    return rows;
  }

  function focusContentSearch() {
    setTimeout(() => {
      try {
        const input = root && root.querySelector('[data-ywpc-content-search]');
        if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
      } catch (e) { /* 焦点失败不影响 */ }
    }, 0);
  }

  function focusContentTextarea() {
    setTimeout(() => {
      try {
        const box = root && root.querySelector('[data-ywpc-content-text]');
        if (box && typeof box.focus === 'function') box.focus({ preventScroll: true });
      } catch (e) { /* 焦点失败不影响 */ }
    }, 0);
  }

  function revealContentEditorTop() {
    setTimeout(() => {
      try {
        const bar = root && root.querySelector('[data-ywpc-content-editor]');
        if (!bar) return;
        const scroller = nearestScrollParentOf(bar);
        if (!scroller) return;
        const box = scroller.getBoundingClientRect();
        const rect = bar.getBoundingClientRect();
        const delta = (rect.top - box.top) - 4;
        if (Math.abs(delta) >= 1) scroller.scrollTop = Math.max(0, (Number(scroller.scrollTop) || 0) + delta);
      } catch (e) { /* 滚动失败不影响编辑 */ }
    }, 0);
  }

  function beginContentEdit() {
    if (compact || disposed || !root) return false;
    if (pinMode) {
      showToast('先结束钉选，再编辑条目正文。', 'warn');
      return false;
    }
    if (editing) {
      showToast('先保存或取消布局编辑，再编辑条目正文。', 'warn');
      return false;
    }
    if (contentEdit) {
      focusContentTextarea();
      return true;
    }
    const m = model || buildModel();
    if (!m.scenarioFound) {
      showToast('没读到当前预设的条目列表，不能编辑正文。', 'warn');
      return false;
    }
    const token = captureToken();
    if (!token.scenario || !tokenCurrent(token)) {
      showToast('当前预设身份没核稳，暂不能编辑正文。', 'warn');
      return false;
    }
    /* 如果上一次 refresh 之后预设已经换过，先把页面同步到当前预设，
       免得随后的「切预设」保护把刚打开的选条目模式又关掉。 */
    if ((lastPresetName && lastPresetName !== token.name)
      || (lastScenarioRef && lastScenarioRef !== token.scenario)) {
      refresh({ force: true, reason: 'content-pick-sync' });
    }
    contentEdit = null;
    contentPick = true;
    contentPickQuery = '';
    contentPickGroup = null;
    contentPickOpen = false;
    contentPickShowAll = false;
    /* 默认收起查找面板：分组保持在前，用户直接点卡进入编辑；
       要按名称找时再点「按名称查找」，不在进入时抢焦点/弹键盘。 */
    refresh({ force: true, reason: 'content-pick-open' });
    return true;
  }

  function exitContentPick() {
    if (contentEdit) return requestContentCancel();
    if (!contentPick) return false;
    contentPick = false;
    contentPickQuery = '';
    contentPickGroup = null;
    contentPickOpen = false;
    contentPickShowAll = false;
    refresh({ force: true, reason: 'content-pick-close' });
    return true;
  }

  function contentGroupIds(section) {
    const out = [];
    const seen = new Set();
    const push = (value) => {
      const id = text(value);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    };
    if (section && section.id === 'common') {
      for (const id of FIXED_SHORTCUT_IDS) push(id);
      for (const id of (model && model.shortcuts) || []) push(id);
    }
    for (const control of (section && section.controls) || []) {
      if (!control || control.kind === 'word' || control.kind === 'toolboxFlag'
        || control.kind === 'spacer' || control.kind === 'info') continue;
      if (control.kind === 'toggle' || control.kind === 'action') push(control.id);
      for (const id of control.allIds || []) push(id);
      for (const id of control.ids || []) push(id);
      for (const id of control.members || []) push(id);
      for (const option of control.options || []) for (const id of option.ids || []) push(id);
      if (control._ref && control._ref.type === 'prompt') push(control._ref.id);
    }
    return out;
  }

  function enterContentTargets(title, canonicalIds) {
    const m = model || buildModel();
    const targets = [];
    const seen = new Set();
    for (const id of canonicalIds || []) {
      const target = actualContentTarget(m, id);
      if (!target || seen.has(target.actual)) continue;
      seen.add(target.actual);
      targets.push(target);
    }
    if (targets.length === 1) return openContentEditorByCanonical(targets[0].canonical);
    if (targets.length > 1) {
      contentPick = true;
      contentPickQuery = '';
      contentPickOpen = true;
      contentPickShowAll = false;
      contentPickGroup = {
        title: text(title) || '关联条目',
        ids: targets.map(target => target.canonical),
      };
      refresh({ force: true, reason: 'content-pick-group' });
      focusContentSearch();
      return true;
    }
    const lead = text(title) ? '「' + title + '」没有可直接编辑的预设正文（这是工具箱设置或空选项）。' : '这项是工具箱设置，没有预设正文。';
    showToast(lead, 'info');
    return false;
  }

  function openContentEditorByCanonical(canonical) {
    const m = buildModel();
    const target = actualContentTarget(m, canonical);
    if (!target) {
      showToast('这条现在不能编辑（可能预设已切换、条目缺失或没有正文）。', 'warn');
      refresh({ force: true, reason: 'content-target-missing' });
      return false;
    }
    return openContentEditor(target);
  }

  function openContentEditor(target) {
    if (!target || !target.prompt) return false;
    if (contentEdit && contentEdit.saving) {
      showToast('正在保存，请稍等。', 'info');
      return false;
    }
    if (typeof target.prompt.content !== 'string') {
      showToast('这条没有可编辑的正文（可能是系统标记）。', 'warn');
      return false;
    }
    const token = captureToken();
    if (!token.scenario || !tokenCurrent(token)) {
      showToast('当前预设身份没核稳，暂不能编辑正文。', 'warn');
      return false;
    }
    /* 同 beginContentEdit：先把页面同步到当前预设，避免打开编辑页的
       同一次 refresh 又被「预设已切换」保护当成切走。 */
    if ((lastPresetName && lastPresetName !== token.name)
      || (lastScenarioRef && lastScenarioRef !== token.scenario)) {
      refresh({ force: true, reason: 'content-open-sync' });
    }
    const key = contentDraftKey(token.name, target.actual);
    const saved = savedContentDraft(key);
    const restore = captureScroll();
    contentEdit = {
      presetName: token.name,
      canonicalId: target.canonical,
      promptId: target.actual,
      promptRef: target.prompt,
      entryName: contentEntryName(target),
      originalContent: target.prompt.content,
      draft: saved !== null ? saved : target.prompt.content,
      dirty: false,
      saving: false,
      blocked: false,
      error: '',
      stale: '',
      confirmAbandon: false,
      token,
      restoreScroll: restore,
    };
    contentEdit.dirty = contentEdit.draft !== contentEdit.originalContent;
    contentPick = false;
    contentPickQuery = '';
    contentPickGroup = null;
    contentPickOpen = false;
    contentPickShowAll = false;
    refresh({ force: true, reason: 'content-edit-open' });
    focusContentTextarea();
    revealContentEditorTop();
    return true;
  }

  function livePromptById(m, promptId) {
    const id = text(promptId);
    if (!id || !m) return null;
    try {
      const list = m.oai && Array.isArray(m.oai.prompts) ? m.oai.prompts : [];
      return list.find(prompt => prompt && prompt.identifier === id) || null;
    } catch (e) {
      return null;
    }
  }

  function contentSavePrecheck(ed) {
    if (!tokenCurrent(ed.token)) {
      return { ok: false, message: '当前预设已经切换，这次没有保存；草稿还在。' };
    }
    const live = livePromptById(model || buildModel(), ed.promptId);
    if (!live) {
      return { ok: false, message: '这条条目已经不在当前预设里，这次没有保存；草稿还在。' };
    }
    if (typeof live.content !== 'string' || live.content !== ed.originalContent) {
      return { ok: false, message: '这条正文在别处被改过（可能有还没保存的原生改动）。请先把原生预设保存一次，再取消重新打开这条；草稿还在。' };
    }
    return { ok: true };
  }

  function contentDraftKeyOf(ed) {
    return ed ? contentDraftKey(ed.presetName, ed.promptId) : '';
  }

  function closeContentEditor(options) {
    const ed = contentEdit;
    if (!ed) return;
    const opts = options || {};
    if (opts.discardDraft) forgetContentDraft(contentDraftKeyOf(ed));
    contentEdit = null;
    contentPick = false;
    contentPickQuery = '';
    contentPickGroup = null;
    contentPickOpen = false;
    contentPickShowAll = false;
    refresh({ force: true, reason: opts.reason || 'content-edit-close' });
    if (ed.restoreScroll) restoreScroll(ed.restoreScroll);
  }

  function requestContentCancel() {
    const ed = contentEdit;
    if (!ed) return false;
    if (ed.saving) {
      showToast('正在保存，请稍等。', 'info');
      return false;
    }
    if (ed.dirty) {
      if (ed.confirmAbandon) {
        const key = contentDraftKeyOf(ed);
        forgetContentDraft(key);
        closeContentEditor({ reason: 'content-discard' });
        showToast('已放弃这次修改；预设正文没有变。', 'info');
        return true;
      }
      ed.confirmAbandon = true;
      refresh({ force: true, reason: 'content-confirm-abandon' });
      return false;
    }
    const key = contentDraftKeyOf(ed);
    forgetContentDraft(key);
    closeContentEditor({ reason: 'content-cancel' });
    return true;
  }

  function discardContentEdit() {
    const ed = contentEdit;
    if (!ed || ed.saving) return false;
    forgetContentDraft(contentDraftKeyOf(ed));
    closeContentEditor({ reason: 'content-discard' });
    showToast('已放弃这次修改；预设正文没有变。', 'info');
    return true;
  }

  async function saveContentEdit() {
    const ed = contentEdit;
    if (!ed || ed.saving) return false;
    if (ed.blocked) {
      showToast('当前对象在保存期间变过，为避免覆盖新改动，这次不再重试；请取消后重新打开确认。', 'warn');
      return false;
    }
    if (typeof deps.savePromptContent !== 'function') {
      ed.error = '保存接口还没接好，这次没有保存；草稿还在。';
      updateContentEditorState();
      return false;
    }
    const precheck = contentSavePrecheck(ed);
    if (!precheck.ok) {
      ed.error = precheck.message;
      updateContentEditorState();
      showToast(precheck.message, 'warn');
      return false;
    }
    ed.error = '';
    ed.confirmAbandon = false;
    ed.saving = true;
    updateContentEditorState();
    let result;
    try {
      result = await deps.savePromptContent({
        name: ed.token.name,
        oai: ed.token.oai,
        scenario: ed.token.scenario,
        prompt: ed.promptRef,
        promptId: ed.promptId,
        expectedContent: ed.originalContent,
        content: ed.draft,
      });
    } catch (error) {
      ed.saving = false;
      ed.error = '保存失败：' + humanError(error) + '（草稿还在）';
      updateContentEditorState();
      showToast(ed.error, 'error');
      return false;
    }
    if (contentEdit !== ed) {
      /* 保存过程中页面已经切走/重建：不碰新预设的界面与内存，只按结果说人话。
         conflict / unverified / switched 都不能当成“当前页已安全保存”。 */
      const conflicts = !!(result && result.conflict === true);
      const unverified = !!(result && result.unverified === true);
      const switched = !!(result && result.switched === true);
      if (conflicts) {
        rememberContentDraft(contentDraftKeyOf(ed), ed.draft);
        showToast('旧预设文件已经写成功，但当前对象里的这条正文在保存期间被别处改了；没有覆盖当前对象。草稿保留，回到旧预设可查看，不会自动重试。', 'warn');
        return false;
      }
      if (unverified && !switched) {
        rememberContentDraft(contentDraftKeyOf(ed), ed.draft);
        showToast('文件已经写入，但当前对象暂时无法核对；草稿保留，刷新后重新打开确认。', 'warn');
        return false;
      }
      if (switched) {
        rememberContentDraft(contentDraftKeyOf(ed), ed.draft);
        showToast('旧预设文件已经写入；当前已经切到别的预设，没有改新预设。草稿保留，回到旧预设可查看。', 'warn');
        return true;
      }
      if (result && result.ok === true) {
        forgetContentDraft(contentDraftKeyOf(ed));
        showToast('正文已经保存；页面已经切到别的预设，没有改新预设。', 'info');
        return true;
      }
      showToast('保存没有成功；草稿还在（回到原预设再打开可继续）。', 'error');
      return false;
    }
    if (result && result.conflict === true) {
      ed.saving = false;
      ed.blocked = true;
      rememberContentDraft(contentDraftKeyOf(ed), ed.draft);
      ed.error = '旧预设文件已经写成功，但保存期间当前对象里的这条正文被别处改了；为避免覆盖新改动，这次不再重试。草稿还留着，可以取消后重新打开确认。';
      ed.stale = '当前对象已经变化；请先取消，再重新打开这条条目。';
      updateContentEditorState();
      showToast('旧文件已写入，但当前对象已变化；没有覆盖新改动，草稿保留。', 'warn');
      return false;
    }
    if (result && result.unverified === true && result.switched !== true) {
      ed.saving = false;
      ed.blocked = true;
      rememberContentDraft(contentDraftKeyOf(ed), ed.draft);
      ed.error = '文件已经写入，但当前对象暂时无法核对；草稿保留，建议刷新后重新打开确认。';
      updateContentEditorState();
      showToast('文件可能已写入，但当前对象无法核对；没有当作成功，草稿保留。', 'warn');
      return false;
    }
    if (!result || result.ok !== true) {
      const reason = result && result.message ? text(result.message) : '保存没有成功';
      ed.saving = false;
      ed.error = reason + '（草稿还在）';
      updateContentEditorState();
      showToast(ed.error, 'error');
      return false;
    }
    if (result.promptId && text(result.promptId) !== ed.promptId) {
      ed.saving = false;
      ed.error = '保存返回的条目和这次编辑的对不上，已按失败处理；草稿还在。';
      updateContentEditorState();
      showToast(ed.error, 'error');
      return false;
    }
    const savedContent = typeof result.content === 'string' ? result.content : ed.draft;
    ed.saving = false;
    if (result.switched) {
      /* 旧预设文件写了，但当前页已经换预设：不当成当前页成功，草稿也保留。 */
      const name = ed.entryName;
      rememberContentDraft(contentDraftKeyOf(ed), ed.draft);
      contentEdit = null;
      contentPick = false;
      contentPickQuery = '';
      contentPickGroup = null;
      contentPickOpen = false;
      contentPickShowAll = false;
      refresh({ force: true, reason: 'content-saved-switched' });
      showToast('旧预设里「' + name + '」的正文已经写入；当前已经切到别的预设，没有改新预设。草稿保留，回到旧预设可查看。', 'warn');
      return true;
    }
    forgetContentDraft(contentDraftKeyOf(ed));
    ed.originalContent = savedContent;
    ed.draft = savedContent;
    ed.dirty = false;
    ed.blocked = false;
    const name = ed.entryName;
    closeContentEditor({ reason: 'content-saved', discardDraft: true });
    showToast('已保存「' + name + '」的正文。', 'ok');
    return true;
  }

  function updateContentEditorState() {
    const ed = contentEdit;
    if (!ed || !root) return;
    const save = root.querySelector('[data-ywpc-content-save]');
    if (save) {
      save.disabled = !!ed.saving || !!ed.blocked || typeof deps.savePromptContent !== 'function';
      save.textContent = ed.saving ? '保存中…' : '保存';
    }
    const cancel = root.querySelector('[data-ywpc-content-cancel]');
    if (cancel) cancel.disabled = !!ed.saving;
    const status = root.querySelector('[data-ywpc-content-status]');
    if (status) {
      const tone = ed.error ? 'error' : (ed.dirty ? 'dirty' : 'clean');
      status.textContent = ed.saving
        ? '正在保存…'
        : (ed.error
          ? (ed.blocked ? '旧文件已写入，但当前对象变了；草稿还在。' : '没有保存成功，草稿还在。')
          : (ed.dirty ? '有未保存修改' : '没有改动'));
      status.setAttribute('data-dirty', ed.dirty && !ed.error ? '1' : '0');
      status.setAttribute('data-tone', tone);
    }
    const error = root.querySelector('[data-ywpc-content-error]');
    if (error) {
      error.textContent = ed.error || '';
      error.hidden = !ed.error;
    }
    const stale = root.querySelector('[data-ywpc-content-stale]');
    if (stale) {
      stale.textContent = ed.stale || '';
      stale.hidden = !ed.stale;
    }
    const actions = root.querySelector('[data-ywpc-content-actions]');
    if (actions) actions.hidden = !!ed.confirmAbandon;
    const confirm = root.querySelector('[data-ywpc-content-confirm]');
    if (confirm) confirm.hidden = !ed.confirmAbandon;
  }

  function handleContentAction(el) {
    if (!el) return false;
    const action = el.getAttribute('data-ywpc-content-action');
    if (action === 'content-save') { saveContentEdit(); return true; }
    if (action === 'content-cancel') { requestContentCancel(); return true; }
    if (action === 'content-discard') { discardContentEdit(); return true; }
    if (action === 'content-keep') {
      if (contentEdit) {
        contentEdit.confirmAbandon = false;
        refresh({ force: true, reason: 'content-keep-editing' });
        focusContentTextarea();
      }
      return true;
    }
    if (action === 'pick-find-open') {
      contentPickOpen = true;
      contentPickShowAll = false;
      refresh({ force: true, reason: 'content-find-open' });
      focusContentSearch();
      return true;
    }
    if (action === 'pick-find-close') {
      contentPickOpen = false;
      contentPickShowAll = false;
      contentPickQuery = '';
      refresh({ force: true, reason: 'content-find-close' });
      return true;
    }
    if (action === 'pick-show-all') {
      contentPickShowAll = true;
      try {
        const list = root && root.querySelector('[data-ywpc-content-list]');
        if (list) {
          renderContentPickList(list, model || buildModel());
          return true;
        }
      } catch (e) { /* 就地展开失败就走整页刷新 */ }
      refresh({ force: true, reason: 'content-show-all' });
      return true;
    }
    if (action === 'pick-close') { exitContentPick(); return true; }
    if (action === 'pick-root') {
      contentPickGroup = null;
      contentPickQuery = '';
      contentPickShowAll = false;
      refresh({ force: true, reason: 'content-pick-root' });
      focusContentSearch();
      return true;
    }
    return false;
  }

  function renderContentPickRow(row) {
    const wrap = createEl(doc, 'div', 'ywpc-pick-row');
    const main = createEl(doc, 'div', 'ywpc-pick-main');
    const label = createEl(doc, 'span', 'ywpc-pick-label');
    label.textContent = row.name;
    append(main, label);
    /* 说明行只在有话要说时出现（未启用/系统标记），已启用条目不再每行重复。 */
    if (row.note) {
      const sub = createEl(doc, 'span', 'ywpc-pick-sub');
      sub.textContent = row.note;
      append(main, sub);
    }
    append(wrap, main);
    if (row.kind === 'prompt') {
      wrap.setAttribute('data-ywpc-content-pick', '1');
      wrap.setAttribute('data-ywpc-canonical', row.canonical);
      const edit = createEl(doc, 'button', 'ywpc-pick-add');
      edit.type = 'button';
      edit.textContent = '编辑';
      edit.setAttribute('data-ywpc-content-pick-btn', '1');
      edit.setAttribute('data-ywpc-focus-key', 'content-pick:' + row.canonical);
      append(wrap, edit);
    } else {
      wrap.classList.add('ywpc-missing');
      wrap.setAttribute('data-ywpc-content-blocked', row.kind);
    }
    return wrap;
  }

  function renderContentPickList(list, m) {
    if (!list) return;
    clearNode(list);
    const rows = contentFilteredRows(m);
    const total = rows.length;
    /* 默认最多列 8 条；「显示全部」是显式动作，且全量结果在限高小面板里滚动，
       不把分组推到很后。 */
    const capped = !contentPickShowAll && total > CONTENT_PICK_RESULT_LIMIT;
    const shown = capped ? rows.slice(0, CONTENT_PICK_RESULT_LIMIT) : rows;
    let editable = 0;
    for (const row of shown) {
      if (row.kind === 'prompt') editable += 1;
      append(list, renderContentPickRow(row));
    }
    list.setAttribute('data-ywpc-content-editable', String(editable));
    list.setAttribute('data-ywpc-content-total', String(total));
    if (!shown.length) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = contentPickQuery
        ? '没搜到条目；换个关键词试试。'
        : '当前预设没有可显示的条目。';
      append(list, empty);
      return;
    }
    if (capped) {
      const more = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small ywpc-content-show-all');
      more.type = 'button';
      more.textContent = '显示全部 ' + total + ' 条';
      more.setAttribute('data-ywpc-content-action', 'pick-show-all');
      more.setAttribute('data-ywpc-focus-key', 'content-show-all');
      append(list, more);
      const tip = createEl(doc, 'p', 'ywpc-empty');
      tip.textContent = '只显示前 ' + CONTENT_PICK_RESULT_LIMIT + ' 条；输入关键词可缩小范围。';
      append(list, tip);
    }
  }

  function renderContentPicker(m) {
    const picker = createEl(doc, 'section', 'ywpc-picker ywpc-content-picker');
    picker.setAttribute('data-ywpc-content-picker', '1');
    /* 紧凑一条：一句说明 + 按名称查找 + 取消；分组照常画在下面，点卡直接编辑。 */
    const head = createEl(doc, 'div', 'ywpc-picker-head ywpc-content-head');
    const hint = createEl(doc, 'p', 'ywpc-content-hint');
    hint.setAttribute('data-ywpc-content-hint', '1');
    hint.textContent = contentPickGroup
      ? '「' + contentPickGroup.title + '」选一条编辑正文。'
      : '点条目编辑正文，不改变开关。';
    append(head, hint);
    const find = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
    find.type = 'button';
    find.textContent = contentPickOpen ? '收起查找' : '按名称查找';
    find.setAttribute('data-ywpc-content-action', contentPickOpen ? 'pick-find-close' : 'pick-find-open');
    find.setAttribute('data-ywpc-focus-key', 'content-find');
    find.setAttribute('aria-expanded', contentPickOpen ? 'true' : 'false');
    append(head, find);
    const close = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
    close.type = 'button';
    close.textContent = '取消';
    close.setAttribute('data-ywpc-content-action', 'pick-close');
    close.setAttribute('data-ywpc-focus-key', 'content-pick-cancel');
    append(head, close);
    append(picker, head);

    /* 查找面板默认收起；展开才有搜索框和结果列表。 */
    if (!contentPickOpen) return picker;

    const panel = createEl(doc, 'div', 'ywpc-content-find');
    panel.setAttribute('data-ywpc-content-find', '1');
    if (contentPickGroup) {
      const back = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
      back.type = 'button';
      back.textContent = '← 返回全部条目';
      back.setAttribute('data-ywpc-content-action', 'pick-root');
      back.setAttribute('data-ywpc-focus-key', 'content-pick-root');
      append(panel, back);
    }
    const search = createEl(doc, 'input', 'ywpc-picker-search');
    search.type = 'search';
    search.placeholder = '搜索条目名…';
    search.autocomplete = 'off';
    search.setAttribute('data-ywpc-content-search', '1');
    search.setAttribute('data-ywpc-focus-key', 'content-search');
    search.value = contentPickQuery;
    append(panel, search);
    const list = createEl(doc, 'div', 'ywpc-picker-list ywpc-content-list');
    list.setAttribute('data-ywpc-content-list', '1');
    append(panel, list);
    renderContentPickList(list, m);
    append(picker, panel);
    return picker;
  }

  function renderContentEditor() {
    const ed = contentEdit;
    const bar = createEl(doc, 'section', 'ywpc-edit-bar ywpc-content-editor');
    bar.setAttribute('data-ywpc-content-editor', '1');
    const head = createEl(doc, 'div', 'ywpc-edit-head');
    const title = createEl(doc, 'span', 'ywpc-edit-title');
    title.textContent = ed ? ('编辑正文 · ' + ed.entryName) : '编辑正文';
    const sub = createEl(doc, 'span', 'ywpc-edit-hint');
    sub.textContent = ed ? ('当前预设：' + ed.presetName) : '';
    append(head, title);
    append(head, sub);
    append(bar, head);

    const note = createEl(doc, 'p', 'ywpc-edit-note');
    note.textContent = '只改这条正文；条目名、角色、注入方式、顺序和开关都不会变。';
    append(bar, note);

    const textarea = createEl(doc, 'textarea', 'ywpc-edit-input ywpc-content-textarea');
    textarea.setAttribute('data-ywpc-content-text', '1');
    textarea.setAttribute('data-ywpc-focus-key', 'content:text');
    textarea.setAttribute('aria-label', '条目正文');
    textarea.setAttribute('spellcheck', 'false');
    textarea.setAttribute('rows', '12');
    textarea.value = ed ? ed.draft : '';
    append(bar, textarea);

    const status = createEl(doc, 'p', 'ywpc-content-status');
    status.setAttribute('data-ywpc-content-status', '1');
    status.setAttribute('data-dirty', ed && ed.dirty && !ed.error ? '1' : '0');
    status.setAttribute('data-tone', ed && ed.error ? 'error' : (ed && ed.dirty ? 'dirty' : 'clean'));
    status.textContent = ed && ed.error ? '没有保存成功，草稿还在。' : (ed && ed.dirty ? '有未保存修改' : '没有改动');
    append(bar, status);

    const stale = createEl(doc, 'p', 'ywpc-edit-note ywpc-warn');
    stale.setAttribute('data-ywpc-content-stale', '1');
    stale.textContent = ed && ed.stale ? ed.stale : '';
    stale.hidden = !(ed && ed.stale);
    append(bar, stale);

    const error = createEl(doc, 'p', 'ywpc-edit-error');
    error.setAttribute('data-ywpc-content-error', '1');
    error.textContent = ed && ed.error ? ed.error : '';
    error.hidden = !(ed && ed.error);
    append(bar, error);

    const actions = createEl(doc, 'div', 'ywpc-edit-actions');
    actions.setAttribute('data-ywpc-content-actions', '1');
    actions.hidden = !!(ed && ed.confirmAbandon);
    const save = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-primary');
    save.type = 'button';
    save.textContent = ed && ed.saving ? '保存中…' : '保存';
    save.setAttribute('data-ywpc-content-save', '1');
    save.setAttribute('data-ywpc-content-action', 'content-save');
    save.setAttribute('data-ywpc-focus-key', 'content:save');
    save.disabled = !!(ed && ed.saving) || !!(ed && ed.blocked) || typeof deps.savePromptContent !== 'function';
    append(actions, save);
    const cancel = createEl(doc, 'button', 'ywpc-edit-btn');
    cancel.type = 'button';
    cancel.textContent = '取消返回';
    cancel.setAttribute('data-ywpc-content-cancel', '1');
    cancel.setAttribute('data-ywpc-content-action', 'content-cancel');
    cancel.setAttribute('data-ywpc-focus-key', 'content:cancel');
    cancel.disabled = !!(ed && ed.saving);
    append(actions, cancel);
    append(bar, actions);

    const confirm = createEl(doc, 'div', 'ywpc-content-confirm');
    confirm.setAttribute('data-ywpc-content-confirm', '1');
    confirm.hidden = !(ed && ed.confirmAbandon);
    const confirmText = createEl(doc, 'p', 'ywpc-content-confirm-text');
    confirmText.textContent = '有未保存的修改。要放弃这次修改吗？';
    append(confirm, confirmText);
    const confirmActions = createEl(doc, 'div', 'ywpc-edit-actions');
    const keep = createEl(doc, 'button', 'ywpc-edit-btn');
    keep.type = 'button';
    keep.textContent = '继续编辑';
    keep.setAttribute('data-ywpc-content-action', 'content-keep');
    keep.setAttribute('data-ywpc-focus-key', 'content:keep');
    append(confirmActions, keep);
    const discard = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-warn');
    discard.type = 'button';
    discard.textContent = '放弃修改';
    discard.setAttribute('data-ywpc-content-action', 'content-discard');
    discard.setAttribute('data-ywpc-focus-key', 'content:discard');
    append(confirmActions, discard);
    append(confirm, confirmActions);
    append(bar, confirm);
    return bar;
  }

  function handleContentPickTarget(target, event) {
    if (!target) return false;
    const prevent = () => {
      if (typeof event.preventDefault === 'function') event.preventDefault();
    };
    const picked = closest(target, '[data-ywpc-content-pick]');
    if (picked) {
      prevent();
      const canonical = picked.getAttribute('data-ywpc-canonical');
      if (canonical) openContentEditorByCanonical(canonical);
      return true;
    }
    const m = model || buildModel();
    const radioEl = closest(target, '[data-ywpc-radio]');
    if (radioEl) {
      prevent();
      if (radioEl.disabled) { showToast('这个选项当前不可用，不能打开正文。', 'warn'); return true; }
      const key = radioEl.getAttribute('data-ywpc-radio');
      const value = radioEl.getAttribute('data-ywpc-value');
      const def = definitionForKey(m, key, ['radio']);
      const option = def && def.options.find(item => item.value === value);
      const optionTitle = option && def ? optionDisplayLabel(m, def, option) : '';
      enterContentTargets(option && def ? (displayLabel(m, def) + (optionTitle ? ' · ' + optionTitle : '')) : '这个选项', option ? option.ids : []);
      return true;
    }
    const comboEl = closest(target, '[data-ywpc-combo]');
    if (comboEl) {
      prevent();
      if (comboEl.disabled) { showToast('这个组合当前不可用，不能打开正文。', 'warn'); return true; }
      const key = comboEl.getAttribute('data-ywpc-combo');
      const value = comboEl.getAttribute('data-ywpc-value');
      const def = definitionForKey(m, key, ['combo']);
      const option = def && def.options.find(item => item.value === value);
      const optionTitle = option && def ? optionDisplayLabel(m, def, option) : '';
      enterContentTargets(option && def ? (displayLabel(m, def) + (optionTitle ? ' · ' + optionTitle : '')) : '这个组合', option ? option.ids : []);
      return true;
    }
    const comboToggleEl = closest(target, '[data-ywpc-combo-toggle]');
    if (comboToggleEl) {
      prevent();
      const key = comboToggleEl.getAttribute('data-ywpc-combo-toggle');
      const def = definitionForKey(m, key, ['comboToggle']);
      enterContentTargets(def ? displayLabel(m, def) : '组合开关', def ? def.members : []);
      return true;
    }
    const toolboxEl = closest(target, '[data-ywpc-toolbox-flag]');
    if (toolboxEl) {
      prevent();
      showToast('这项是工具箱设置，没有预设正文。', 'info');
      return true;
    }
    const wordBox = closest(target, '[data-ywpc-word-box]');
    if (wordBox || closest(target, '[data-ywpc-action="word-step"]') || closest(target, '[data-ywpc-action="word-mode"]')) {
      prevent();
      showToast('这项是工具箱设置，没有预设正文；字数请回原来的字数控件改。', 'info');
      return true;
    }
    const toggleEl = closest(target, '[data-ywpc-toggle]');
    if (toggleEl) {
      prevent();
      const id = toggleEl.getAttribute('data-ywpc-toggle');
      if (!id) return true;
      enterContentTargets(realNameFor(m, id), [id]);
      return true;
    }
    const summaryEl = closest(target, 'summary.ywpc-sec-head');
    if (summaryEl && summaryEl.parentElement) {
      prevent();
      const sectionId = summaryEl.parentElement.getAttribute('data-ywpc-section');
      const section = (m.layoutSections || []).find(item => item.id === sectionId) || null;
      enterContentTargets(section ? section.label : '这一组', section ? contentGroupIds(section) : []);
      return true;
    }
    const groupEl = closest(target, '[data-ywpc-pin-group]');
    if (groupEl) {
      prevent();
      const raw = text(groupEl.getAttribute('data-ywpc-pin-group'));
      const split = raw.indexOf(':');
      if (split > 0) {
        const kind = raw.slice(0, split);
        const key = raw.slice(split + 1);
        const def = definitionForKey(m, key, [kind === 'radio' ? 'radio' : 'combo']);
        enterContentTargets(def ? displayLabel(m, def) : '这一组', def ? def.allIds : []);
      }
      return true;
    }
    const spacer = closest(target, '.ywpc-space');
    if (spacer) {
      prevent();
      showToast('空白块没有正文，不能编辑。', 'info');
      return true;
    }
    const actionEl = closest(target, '[data-ywpc-action]');
    if (actionEl) {
      prevent();
      showToast('选条目时这个操作不可用；请从上面的条目列表选择要编辑的正文。', 'info');
      return true;
    }
    return false;
  }

  function validateEditLayout(sections) {
    const errors = [];
    const sectionIds = new Set();
    const uids = new Set();
    for (const section of sections || []) {
      if (!section.id) errors.push('有分组没有 id。');
      if (sectionIds.has(section.id)) errors.push('分组 id 重复：' + section.id);
      sectionIds.add(section.id);
      if (!String(section.label || '').trim()) errors.push('有分组没有显示名。');
      for (const control of section.controls || []) {
        const ref = controlRef(control);
        if (!ref) { errors.push('有控件没有绑定条目：' + (control.label || control.kind)); continue; }
        /* 同一条 prompt 允许重复；唯一性看实例 uid（内置控件 uid 仍是 refKey）。 */
        const uid = controlUid(control);
        if (!uid) errors.push('有控件没有实例 uid：' + (control.label || refKey(ref)));
        if (uids.has(uid)) errors.push('控件实例 uid 重复：' + (control.label || uid));
        uids.add(uid);
        if (control.kind === 'radio' || control.kind === 'combo') {
          const values = new Set();
          const radioIds = new Set();
          for (const option of control.options || []) {
            if (!option.value) errors.push('有选项没有值：' + (control.label || ''));
            if (values.has(option.value)) errors.push('选项值重复：' + option.value);
            values.add(option.value);
            if (control.kind === 'radio') {
              for (const id of option.ids || []) {
                if (radioIds.has(id)) errors.push('单选「' + (control.label || '') + '」的同一个条目出现在两个选项里。');
                radioIds.add(id);
              }
            }
          }
          if (control._custom && !(control.options || []).some(option => (option.ids || []).length)) {
            errors.push('新建的「' + (control.label || '') + '」至少给一个选项加一个成员。');
          }
        }
        if (control.kind === 'comboToggle' || control.kind === 'multi') {
          if (!(control.members || control.ids || []).length) {
            errors.push('「' + (control.label || '') + '」至少要有一个成员。');
          }
        }
      }
    }
    return errors;
  }

  function rollbackLayoutSetting(settings, key, before, ours) {
    const store = layoutStoreOf(settings);
    if (!store) return false;
    const current = store[key];
    /* 只撤回“这次自己写进去的那份”；如果中间已有更新的值，不覆盖。 */
    if (ours !== undefined && current !== ours) return false;
    if (before === undefined) delete store[key];
    else store[key] = before;
    return true;
  }

  function layoutSaveRequest() {
    const hasNow = typeof deps.saveSettingsNow === 'function';
    if (!hasNow && typeof deps.saveSettings !== 'function') return null;
    const result = hasNow ? deps.saveSettingsNow() : deps.saveSettings();
    return { result, confirmed: hasNow };
  }

  async function awaitLayoutSave(request) {
    if (!request) throw new Error('设置保存接口没就绪');
    if (request.result === false) throw new Error('保存接口返回失败');
    if (request.result && typeof request.result.then === 'function') {
      const value = await request.result;
      if (value === false) throw new Error('保存接口返回失败');
      request.confirmed = true;
    }
    return request;
  }

  async function saveLayoutEdits() {
    if (editSaving) return false;
    const m = model || buildModel();
    if (!m.scenarioFound) { layoutError = '没读到当前预设的条目列表，不能保存布局。'; refresh({ force: true, reason: 'layout-save' }); return false; }
    if (!editToken || !tokenCurrent(editToken) || editToken.name !== m.name) {
      layoutError = '预设身份已经变化（切换或条目列表更新），这次布局没有保存；草稿还在，确认回到原预设后再试。';
      refresh({ force: true, reason: 'layout-save' });
      return false;
    }
    if (typeof deps.saveSettings !== 'function' && typeof deps.saveSettingsNow !== 'function') {
      layoutError = '设置保存接口没就绪，布局没有保存；编辑内容还在，可以稍后再试。';
      refresh({ force: true, reason: 'layout-save' });
      return false;
    }
    const settings = readSettings();
    if (!settings) {
      layoutError = '设置对象没读到，布局没有保存；编辑内容还在。';
      refresh({ force: true, reason: 'layout-save' });
      return false;
    }
    const errors = validateEditLayout(editSectionsOfModel());
    if (errors.length) {
      layoutError = '还不能保存：' + errors.join('；');
      refresh({ force: true, reason: 'layout-save' });
      return false;
    }
    const token = editToken;
    /* 显式排序例外只在保存时落一次：think_meta 的 Part2→niah→随机头，
       其它控件相对序不变；common 新增控件同时追加首页 pin。 */
    const editedSections = orderSpecialThinkSections(editSectionsOfModel());
    const layout = serializeLayout(editedSections, {
      name: token.name,
      characterId: CHARACTER_ID,
      removedControls: editRemovedControls,
      removedSections: editRemovedSections,
    });
    const store = layoutStoreOf(settings);
    const key = presetLayoutKey(token.name, CHARACTER_ID);
    const before = store && Object.prototype.hasOwnProperty.call(store, key)
      ? JSON.parse(JSON.stringify(store[key]))
      : undefined;
    if (!store) settings[LAYOUT_SETTINGS_KEY] = {};
    settings[LAYOUT_SETTINGS_KEY][key] = layout;

    const addedCommonPins = newCommonHomePins(m.layoutSections, editedSections);
    let pinsBefore;
    let pinsOurs;
    if (addedCommonPins.length) {
      const pinStore = homePinStoreOf(settings);
      pinsBefore = pinStore && Object.prototype.hasOwnProperty.call(pinStore, key)
        ? JSON.parse(JSON.stringify(pinStore[key]))
        : undefined;
      for (const pin of addedCommonPins) appendHomePinForCommon(settings, pin);
      pinsOurs = pinStore && Object.prototype.hasOwnProperty.call(pinStore, key)
        ? pinStore[key] : undefined;
    }

    editSaving = true;
    let request = null;
    try {
      request = layoutSaveRequest();
      if (!request) throw new Error('设置保存接口没就绪');
      await awaitLayoutSave(request);
    } catch (error) {
      if (pinsOurs !== undefined) rollbackHomePinSetting(settings, key, pinsBefore, pinsOurs);
      rollbackLayoutSetting(settings, key, before, layout);
      editSaving = false;
      layoutError = '保存设置失败：' + humanError(error) + '；布局没有保存，编辑内容还在。';
      refresh({ force: true, reason: 'layout-save' });
      return false;
    }
    editSaving = false;
    if (!editing || !tokenCurrent(token)) {
      /* 保存等待期间切走了：撤回这次写入，避免把旧预设布局错存到当前视图。 */
      if (pinsOurs !== undefined) rollbackHomePinSetting(settings, key, pinsBefore, pinsOurs);
      rollbackLayoutSetting(settings, key, before, layout);
      try {
        if (typeof deps.saveSettingsNow === 'function') {
          const result = deps.saveSettingsNow();
          if (result && typeof result.then === 'function') result.catch(() => {});
        } else if (typeof deps.saveSettings === 'function') deps.saveSettings();
      } catch (e) { /* 回滚尽力而为；内存已恢复，错误已在下面说明 */ }
      layoutError = '保存过程中预设被切换，这次布局已撤回；没有写到新预设。';
      showToast('保存过程中预设被切换，这次布局已撤回。', 'warn');
      refresh({ force: true, reason: 'layout-save-switched' });
      return false;
    }
    editing = false;
    editSections = null;
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    layoutQuery = '';
    layoutAddTarget = '';
    pendingExitSection = editSectionId;
    pendingOpenSection = editSectionId;
    editSectionId = '';
    editOpenUid = '';
    editSelectedUid = '';
    editSelectedOption = null;
    editMoreOpen = false;
    newSectionName = '';
    restoreConfirm = false;
    editToken = null;
    if (request && request.confirmed) {
      showToast('布局已保存：只影响当前预设，不改原预设。', 'ok');
    } else {
      /* 没有 saveSettingsNow 也没有可等待的 Promise：只能说明“已记住”，
         不能假装已经落盘。 */
      showToast('布局已记住，正在保存设置；如果酒馆稍后提示保存失败，请再点一次保存。', 'warn');
    }
    refresh({ force: true, reason: 'layout-saved' });
    return true;
  }

  async function restoreCurrentLayout() {
    if (!restoreConfirm) {
      restoreConfirm = true;
      layoutError = '';
      showToast('确认只恢复「当前预设」的内置默认布局；别的预设不动。', 'warn');
      refresh({ force: true, reason: 'layout-restore-confirm' });
      return false;
    }
    const m = model || buildModel();
    if (!m.scenarioFound) { layoutError = '没读到当前预设，不能恢复。'; refresh({ force: true, reason: 'layout-restore' }); return false; }
    if (!editToken || !tokenCurrent(editToken) || editToken.name !== m.name) {
      layoutError = '预设身份已经变化，这次没有恢复。';
      refresh({ force: true, reason: 'layout-restore' });
      return false;
    }
    if (typeof deps.saveSettings !== 'function' && typeof deps.saveSettingsNow !== 'function') {
      layoutError = '设置保存接口没就绪，没有恢复。';
      refresh({ force: true, reason: 'layout-restore' });
      return false;
    }
    const settings = readSettings();
    if (!settings) { layoutError = '设置对象没读到，没有恢复。'; refresh({ force: true, reason: 'layout-restore' }); return false; }
    const store = layoutStoreOf(settings);
    const key = presetLayoutKey(m.name, CHARACTER_ID);
    const before = store && Object.prototype.hasOwnProperty.call(store, key)
      ? JSON.parse(JSON.stringify(store[key]))
      : undefined;
    if (!before) {
      layoutError = '当前预设本来就是内置默认布局，没有可恢复的保存布局。';
      restoreConfirm = false;
      refresh({ force: true, reason: 'layout-restore' });
      return false;
    }
    clearSavedLayout(settings, m.name, CHARACTER_ID);
    editSaving = true;
    let request = null;
    try {
      request = layoutSaveRequest();
      if (!request) throw new Error('设置保存接口没就绪');
      await awaitLayoutSave(request);
    } catch (error) {
      if (store) store[key] = before;
      editSaving = false;
      layoutError = '保存设置失败：' + humanError(error) + '；布局没有恢复。';
      refresh({ force: true, reason: 'layout-restore' });
      return false;
    }
    editSaving = false;
    editing = false;
    editSections = null;
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    restoreConfirm = false;
    pendingExitSection = editSectionId;
    pendingOpenSection = editSectionId;
    layoutQuery = '';
    layoutAddTarget = '';
    editSectionId = '';
    editOpenUid = '';
    editSelectedUid = '';
    editSelectedOption = null;
    editMoreOpen = false;
    editToken = null;
    if (request && request.confirmed) {
      showToast('已恢复当前预设的内置默认布局；别的预设没有动。', 'ok');
    } else {
      showToast('已恢复当前预设默认布局，正在保存设置；别的预设没有动。', 'warn');
    }
    refresh({ force: true, reason: 'layout-restored' });
    return true;
  }

  function nextSectionSpacerKey(section) {
    let seq = 1;
    const used = new Set((section.controls || []).map(control => String(control.key || '')));
    while (used.has('space:' + seq)) seq += 1;
    return 'space:' + seq;
  }

  function addEditSpace(sectionId) {
    const section = findEditSection(sectionId || editSectionId);
    if (!section) return false;
    const key = nextSectionSpacerKey(section);
    const control = {
      kind: 'spacer',
      key,
      width: 6,
      _ref: { type: 'spacer', key },
      _uid: 'spacer:' + key,
      _custom: true,
    };
    const index = insertIndexFor(section);
    section.controls.splice(index, 0, control);
    layoutError = '';
    layoutAddTarget = '';
    layoutQuery = '';
    editSectionId = section.id;
    editSelectedUid = 'spacer:' + key;
    editOpenUid = 'spacer:' + key;
    refresh({ force: true, reason: 'layout-add-space' });
    revealBlockSettings('spacer:' + key);
    focusSettingsClose('spacer:' + key);
    return true;
  }

  function setEditControlWidth(uid, width) {
    const hit = findEditControl(uid);
    const next = explicitLayoutWidth(width);
    if (!hit || !next) return false;
    hit.control.width = next;
    layoutError = '';
    refresh({ force: true, reason: 'layout-control-width' });
    return true;
  }

  function ensureEditOptionLayout(control) {
    if (!control || !Array.isArray(control.options)) return null;
    let list = cloneOptionLayout(control);
    if (!list) {
      list = control.options.map(option => ({ type: 'option', value: String(option.value) }));
    }
    const seen = new Set();
    const out = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.type === 'spacer') {
        out.push({ ...entry, uid: entry.uid || nextOptionSpacerUid({ optionLayout: out }) });
        continue;
      }
      const value = String(entry.value == null ? '' : entry.value);
      if (!control.options.some(option => String(option.value) === value) || seen.has(value)) continue;
      seen.add(value);
      out.push({ type: 'option', value, ...(explicitLayoutWidth(entry.width) ? { width: explicitLayoutWidth(entry.width) } : {}) });
    }
    for (const option of control.options) {
      const value = String(option.value);
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ type: 'option', value });
    }
    control.optionLayout = out;
    control._optionLayoutDirty = true;
    return control.optionLayout;
  }

  function nextOptionSpacerUid(control) {
    let seq = 1;
    const used = new Set((control && Array.isArray(control.optionLayout) ? control.optionLayout : [])
      .filter(entry => entry && entry.type === 'spacer')
      .map(entry => String(entry.uid || entry.key || '')));
    while (used.has('opt-space:' + seq)) seq += 1;
    return 'opt-space:' + seq;
  }

  function setEditOptionWidth(uid, value, width) {
    const hit = findEditControl(uid);
    const next = explicitLayoutWidth(width);
    if (!hit || !next) return false;
    const layout = ensureEditOptionLayout(hit.control);
    if (!layout) return false;
    const entry = layout.find(item => item && item.type === 'option' && String(item.value) === String(value));
    if (!entry) return false;
    entry.width = next;
    layoutError = '';
    refresh({ force: true, reason: 'layout-option-width' });
    return true;
  }

  function entryMatchesToken(entry, token) {
    if (!entry || !token) return false;
    if (token.kind === 'option') {
      return entry.type === 'option' && String(entry.value) === String(token.value);
    }
    return entry.type === 'spacer' && String(entry.uid || '') === String(token.spaceUid);
  }

  /* 组选项/组内空块的拖动排序：只重排 optionLayout 展示序，绝不改 control.options。
     targetIndex 是“在目标条目前/后”的原始插入位；内部再按移除源项后的下标修正。 */
  function moveEditOptionEntryToIndex(uid, token, targetIndex) {
    const hit = findEditControl(uid);
    if (!hit || !token || !Number.isFinite(Number(targetIndex))) return false;
    const layout = ensureEditOptionLayout(hit.control);
    if (!layout) return false;
    const from = layout.findIndex(entry => entryMatchesToken(entry, token));
    if (from < 0) return false;
    let to = Math.max(0, Math.min(Number(targetIndex), layout.length));
    if (from < to) to -= 1;
    if (from === to) return false;
    const item = layout.splice(from, 1)[0];
    layout.splice(to, 0, item);
    layoutError = '';
    refresh({ force: true, reason: 'layout-option-entry-drag' });
    return true;
  }
  function addEditOptionSpace(uid) {
    const hit = findEditControl(uid);
    if (!hit) return false;
    const layout = ensureEditOptionLayout(hit.control);
    if (!layout) return false;
    layout.push({ type: 'spacer', uid: nextOptionSpacerUid(hit.control), width: 6 });
    hit.control.optionLayout = layout;
    layoutError = '';
    refresh({ force: true, reason: 'layout-option-space-add' });
    return true;
  }

  function removeEditOptionSpace(uid, spacerUid) {
    const hit = findEditControl(uid);
    if (!hit || !Array.isArray(hit.control.optionLayout)) return false;
    const before = hit.control.optionLayout.length;
    hit.control.optionLayout = hit.control.optionLayout.filter(entry => !(entry
      && entry.type === 'spacer' && String(entry.uid || '') === String(spacerUid)));
    if (hit.control.optionLayout.length === before) return false;
    if (editSelectedOption && editSelectedOption.uid === uid && editSelectedOption.spaceUid === spacerUid) editSelectedOption = null;
    refresh({ force: true, reason: 'layout-option-space-remove' });
    return true;
  }

  function setEditOptionSpaceWidth(uid, spacerUid, width) {
    const hit = findEditControl(uid);
    const next = explicitLayoutWidth(width);
    if (!hit || !next || !Array.isArray(hit.control.optionLayout)) return false;
    let changed = false;
    for (const entry of hit.control.optionLayout) {
      if (entry && entry.type === 'spacer' && String(entry.uid || '') === String(spacerUid)) {
        entry.width = next;
        changed = true;
      }
    }
    if (!changed) return false;
    refresh({ force: true, reason: 'layout-option-space-width' });
    return true;
  }

  function moveSectionBy(sectionId, delta) {
    const sections = editSectionsOfModel();
    const index = sections.findIndex(section => section.id === sectionId);
    const target = index + Number(delta);
    if (index < 0 || target < 0 || target >= sections.length) return false;
    const item = sections.splice(index, 1)[0];
    sections.splice(target, 0, item);
    editGroupPage = groupPageOfSection(sectionId);
    refresh({ force: true, reason: 'layout-section-move' });
    return true;
  }

  function markOverride(control) {
    if (!control) return;
    control._hasOverride = true;
    control._overrideDirty = true;
  }

  function dedupeIds(list) {
    const out = [];
    const seen = new Set();
    for (const id of list || []) {
      const value = String(id);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  function removeEditMember(uid, optionIndex, memberIndex) {
    const hit = findEditControl(uid);
    if (!hit) return false;
    const control = hit.control;
    const index = Number(memberIndex);
    if (Number(optionIndex) >= 0) {
      const option = (control.options || [])[Number(optionIndex)];
      if (!option || !Array.isArray(option.ids) || index < 0 || index >= option.ids.length) return false;
      option.ids.splice(index, 1);
      control.allIds = dedupeIds((control.options || []).flatMap(item => item.ids || []));
    } else {
      const key = Array.isArray(control.members) ? 'members' : 'ids';
      const list = control[key];
      if (!Array.isArray(list) || index < 0 || index >= list.length) return false;
      list.splice(index, 1);
      if (key === 'ids' && Array.isArray(control.labels)) control.labels.splice(index, 1);
    }
    markOverride(control);
    refresh({ force: true, reason: 'layout-remove-member' });
    return true;
  }

  function addEditMember(uid, optionIndex, memberId) {
    const m = model || buildModel();
    const hit = findEditControl(uid);
    const id = text(memberId);
    if (!hit || !id) return false;
    if (!hasOwn(m.orderMap, id)) {
      layoutError = '这条不在有效条目列表里，不能加成员。';
      refresh({ force: true, reason: 'layout-add-member' });
      return false;
    }
    if (!isOrdinaryPrompt(m.promptById.get(id))) {
      layoutError = '这条不是可切换的普通条目，不能加成员。';
      refresh({ force: true, reason: 'layout-add-member' });
      return false;
    }
    const control = hit.control;
    if (Number(optionIndex) >= 0) {
      const option = (control.options || [])[Number(optionIndex)];
      if (!option) return false;
      if (!Array.isArray(option.ids)) option.ids = [];
      if (option.ids.includes(id)) return false;
      option.ids.push(id);
      control.allIds = dedupeIds((control.options || []).flatMap(item => item.ids || []));
    } else {
      const key = Array.isArray(control.members) ? 'members' : 'ids';
      if (!Array.isArray(control[key])) control[key] = [];
      if (control[key].includes(id)) return false;
      control[key].push(id);
      if (key === 'ids' && Array.isArray(control.labels)) {
        const prompt = m.promptById.get(id);
        control.labels.push(String((prompt && prompt.name) || PROMPT_NAMES[id] || id));
      }
    }
    markOverride(control);
    layoutError = '';
    refresh({ force: true, reason: 'layout-add-member' });
    return true;
  }

  function addEditOption(uid) {
    const hit = findEditControl(uid);
    if (!hit || !Array.isArray(hit.control.options)) return false;
    let seq = 1;
    while (hit.control.options.some(option => option.value === 'option-' + seq)) seq += 1;
    hit.control.options.push({ value: 'option-' + seq, label: '新选项', ids: [] });
    markOverride(hit.control);
    refresh({ force: true, reason: 'layout-add-option' });
    return true;
  }

  function removeEditOption(uid, value) {
    const hit = findEditControl(uid);
    if (!hit || !Array.isArray(hit.control.options)) return false;
    if (hit.control.options.length <= 1) {
      layoutError = '至少保留一个选项；要整套换掉可以用「恢复默认布局」。';
      refresh({ force: true, reason: 'layout-remove-option' });
      return false;
    }
    const key = String(value);
    const before = hit.control.options.length;
    hit.control.options = hit.control.options.filter(option => String(option.value) !== key);
    if (hit.control.options.length === before) return false;
    if (Array.isArray(hit.control.optionLayout)) {
      hit.control.optionLayout = hit.control.optionLayout.filter(entry => !(entry
        && entry.type === 'option' && String(entry.value) === key));
    }
    hit.control.allIds = dedupeIds((hit.control.options || []).flatMap(option => option.ids || []));
    if (editSelectedOption && editSelectedOption.uid === uid && String(editSelectedOption.value) === key) editSelectedOption = null;
    markOverride(hit.control);
    layoutError = '';
    refresh({ force: true, reason: 'layout-remove-option' });
    return true;
  }

  function setEditRelation(uid, value) {
    const hit = findEditControl(uid);
    if (!hit) return false;
    hit.control.exactlyOne = value === 'exactlyOne';
    hit.control.atMostOne = value === 'atMostOne';
    markOverride(hit.control);
    refresh({ force: true, reason: 'layout-relation' });
    return true;
  }

  function moveControlToIndex(uid, targetSectionId, targetIndex) {
    const hit = findEditControl(uid);
    const targetSection = findEditSection(targetSectionId);
    if (!hit || !targetSection) return false;
    hit.section.controls.splice(hit.index, 1);
    const index = Math.max(0, Math.min(Number(targetIndex), targetSection.controls.length));
    targetSection.controls.splice(index, 0, hit.control);
    refresh({ force: true, reason: 'layout-drag-move' });
    return true;
  }

  function deleteEditControl(uid) {
    const hit = findEditControl(uid);
    if (!hit) return false;
    const ref = controlRef(hit.control);
    hit.section.controls.splice(hit.index, 1);
    if (controlUid(hit.control) === editOpenUid) editOpenUid = '';
    if (controlUid(hit.control) === editSelectedUid) editSelectedUid = '';
    if (editSelectedOption && editSelectedOption.uid === controlUid(hit.control)) editSelectedOption = null;
    if (ref && ref.type === 'builtin') {
      const key = refKey(ref);
      if (!editRemovedControls.includes(key)) editRemovedControls.push(key);
    }
    showToast('已从布局移除这个控件；条目本身和开关值都没有动。', 'info');
    refresh({ force: true, reason: 'layout-control-delete' });
    return true;
  }

  function addEditSection() {
    const name = text(newSectionName).trim();
    if (!name) { layoutError = '先给新分组起一个显示名。'; refresh({ force: true, reason: 'layout-add-section' }); return false; }
    const sections = editSectionsOfModel();
    let seq = 1;
    while (sections.some(section => section.id === 'custom-' + seq)) seq += 1;
    sections.push({
      id: 'custom-' + seq,
      label: name,
      note: '',
      icon: '',
      builtin: false,
      custom: true,
      controls: [],
    });
    newSectionName = '';
    layoutError = '';
    layoutAddTarget = '';
    layoutQuery = '';
    editMoreOpen = false;
    editSelectedUid = '';
    editSelectedOption = null;
    editOpenUid = '';
    editSectionId = 'custom-' + seq;
    editGroupPage = groupPageOfSection(editSectionId);
    lastActiveSectionId = editSectionId;
    lastActiveSectionName = (model && model.name) || lastPresetName || '';
    refresh({ force: true, reason: 'layout-add-section' });
    return true;
  }

  function nextPromptInstanceUid(sections, promptId) {
    const base = 'prompt:' + promptId;
    const uids = new Set();
    for (const section of sections || []) {
      for (const control of section.controls || []) uids.add(controlUid(control));
    }
    if (!uids.has(base)) return base;
    let seq = 2;
    while (uids.has(base + '#' + seq)) seq += 1;
    return base + '#' + seq;
  }

  function addPromptControl(sectionId, promptId) {
    const m = model || buildModel();
    const section = findEditSection(sectionId);
    if (!section) return false;
    const id = text(promptId);
    if (!hasOwn(m.orderMap, id)) {
      layoutError = '这条不在有效条目列表里，不能添加。';
      refresh({ force: true, reason: 'layout-add-prompt' });
      return false;
    }
    const prompt = m.promptById.get(id);
    if (!isOrdinaryPrompt(prompt)) {
      layoutError = '这条不是可切换的普通条目，不能添加。';
      refresh({ force: true, reason: 'layout-add-prompt' });
      return false;
    }
    /* 同一条可以再加一份；每个实例有自己的 uid，删除/移动只影响这一份。 */
    const uid = nextPromptInstanceUid(editSectionsOfModel(), id);
    const control = {
      kind: 'toggle',
      id,
      label: String(prompt.name || PROMPT_NAMES[id] || id),
      sub: '自定义控件（只改显示，不新增条目）',
      icon: '',
      _ref: { type: 'prompt', id },
      _uid: uid,
      _custom: true,
      _hasOverride: false,
      _overrideDirty: false,
    };
    const index = insertIndexFor(section);
    section.controls.splice(index, 0, control);
    layoutAddTarget = '';
    layoutQuery = '';
    layoutError = '';
    editSectionId = section.id;
    editSelectedUid = uid;
    editOpenUid = uid;
    showToast('已加入布局；没有往有效条目列表新增任何条目。', 'ok');
    refresh({ force: true, reason: 'layout-add-prompt' });
    revealBlockSettings(uid);
    focusBlockSettingsTitle(uid);
    return true;
  }

  function rebindEditControl(uid, promptId) {
    const m = model || buildModel();
    const hit = findEditControl(uid);
    const id = text(promptId);
    if (!hit || !id) return false;
    if (!hasOwn(m.orderMap, id) || !isOrdinaryPrompt(m.promptById.get(id))) {
      layoutError = '只能重新绑定到有效条目列表里的普通条目。';
      refresh({ force: true, reason: 'layout-rebind' });
      return false;
    }
    const used = manageUsedPromptIds(m, editSectionsOfModel());
    const ownRefKey = refKey(hit.control._ref || controlRef(hit.control));
    void used; void ownRefKey;
    const prompt = m.promptById.get(id);
    const keepUid = uid;
    hit.control.kind = 'toggle';
    hit.control.id = id;
    hit.control.label = String(prompt.name || PROMPT_NAMES[id] || id);
    hit.control.sub = '重新绑定后的自定义控件';
    hit.control._ref = { type: 'prompt', id };
    hit.control._uid = keepUid;
    hit.control._custom = true;
    hit.control._missingReason = '';
    hit.control._hasOverride = false;
    hit.control._overrideDirty = false;
    editOpenUid = keepUid;
    layoutError = '';
    showToast('已把缺项控件重新绑定到当前条目；没有改条目本身。', 'ok');
    refresh({ force: true, reason: 'layout-rebind' });
    return true;
  }

  function addEditGroupControl(sectionId, kind) {
    const section = findEditSection(sectionId);
    if (!section) return false;
    if (!['radio', 'combo', 'comboToggle', 'multi'].includes(kind)) return false;
    let seq = 1;
    while (editSectionsOfModel().some(item => (item.controls || []).some(control =>
      control.key === 'custom.' + kind + '.' + seq))) seq += 1;
    const key = 'custom.' + kind + '.' + seq;
    const label = kind === 'radio' ? '新建单选组'
      : (kind === 'combo' ? '新建组合选择'
        : (kind === 'comboToggle' ? '新建组合开关' : '新建多选组'));
    const control = {
      kind,
      key,
      label,
      sub: '自定义控件（成员与关系可编辑）',
      icon: '',
      _ref: { type: 'custom', key, kind },
      _uid: 'custom:' + key,
      _custom: true,
      _hasOverride: true,
      _overrideDirty: true,
    };
    if (kind === 'radio' || kind === 'combo') {
      control.options = [
        { value: 'option-1', label: '选项 1', ids: [] },
        { value: 'option-2', label: '选项 2', ids: [] },
      ];
      control.allIds = [];
      control.exactlyOne = kind === 'radio';
      control.atMostOne = false;
      control.allowNone = kind === 'radio';
    } else if (kind === 'multi') {
      control.ids = [];
      control.labels = [];
    } else {
      control.members = [];
    }
    const index = insertIndexFor(section);
    section.controls.splice(index, 0, control);
    layoutError = '';
    layoutAddTarget = '';
    layoutQuery = '';
    editSectionId = section.id;
    editSelectedUid = 'custom:' + key;
    editOpenUid = 'custom:' + key;
    showToast('已新建' + label + '；在块设置里加成员后保存。', 'ok');
    refresh({ force: true, reason: 'layout-add-group' });
    revealBlockSettings('custom:' + key);
    focusBlockSettingsTitle('custom:' + key);
    return true;
  }

  function promptRowsForLayout(m) {
    const rows = [];
    const seen = new Set();
    const prompts = m && m.oai && Array.isArray(m.oai.prompts) ? m.oai.prompts : [];
    let promptIndex = 0;
    for (const prompt of prompts) {
      if (!prompt || typeof prompt.identifier !== 'string' || seen.has(prompt.identifier)) continue;
      seen.add(prompt.identifier);
      const id = prompt.identifier;
      const inOrder = hasOwn(m.orderMap, id);
      rows.push({
        id,
        name: String(prompt.name || '').trim() || PROMPT_NAMES[id] || '未命名条目',
        inOrder,
        ordinary: isOrdinaryPrompt(prompt),
        enabled: inOrder ? !!m.orderMap[id] : false,
        promptIndex: promptIndex += 1,
      });
    }
    for (const id of Object.keys(m.orderMap || {})) {
      if (seen.has(id) || m.actualIds?.[id]) continue;
      seen.add(id);
      rows.push({
        id,
        name: PROMPT_NAMES[id] || '未命名条目',
        inOrder: true,
        ordinary: false,
        enabled: !!m.orderMap[id],
        promptIndex: promptIndex += 1,
      });
    }
    /* 作者要求：添加条目按 100001 有效 prompt_order 的原顺序，不按名称。
       不在有效顺序里的条目排在后面，保持它们在 prompts 里的原顺序。 */
    const orderIndex = new Map();
    Object.keys(m.orderMap || {}).forEach((id, index) => orderIndex.set(id, index));
    rows.sort((a, b) => {
      if (a.inOrder !== b.inOrder) return a.inOrder ? -1 : 1;
      if (a.inOrder) return (orderIndex.get(a.id) || 0) - (orderIndex.get(b.id) || 0);
      return a.promptIndex - b.promptIndex;
    });
    return rows;
  }

  function layoutSearchText(row) {
    return normalizeSearch(row.name + ' ' + row.id);
  }

  function memberCandidates(m, control, optionIndex) {
    const used = new Set();
    for (const option of control.options || []) {
      for (const id of option.ids || []) used.add(String(id));
    }
    if (control.kind !== 'radio') {
      /* 组合允许不同选项共享主链，只排除当前选项里已有的。 */
      for (const id of (control.options || [])[optionIndex]?.ids || []) used.delete(String(id));
    }
    const rows = [];
    for (const row of promptRowsForLayout(m)) {
      if (!row.inOrder || !row.ordinary) continue;
      if (used.has(row.id)) continue;
      rows.push(row);
    }
    return rows;
  }

  function renderLayoutEntry(m) {
    const bar = createEl(doc, 'section', 'ywpc-layout-entry');
    const contentBtn = createEl(doc, 'button', 'ywpc-edit-btn');
    contentBtn.type = 'button';
    contentBtn.textContent = '条目编辑';
    contentBtn.setAttribute('data-ywpc-action', 'content-edit-open');
    contentBtn.setAttribute('data-ywpc-focus-key', 'content:open');
    append(bar, contentBtn);
    const btn = createEl(doc, 'button', 'ywpc-edit-btn');
    btn.type = 'button';
    btn.textContent = '编辑布局';
    btn.setAttribute('data-ywpc-action', 'layout-open');
    btn.setAttribute('data-ywpc-focus-key', 'layout:open');
    append(bar, btn);
    return bar;
  }

  /* 紧凑顶栏：标题 + 常驻保存/取消 + 更多（恢复默认、新分组、分组管理）。
     旧版 262px 高的多行工具栏不再出现；错误行只在真有错时加一行。 */
  function renderLayoutToolbar(m) {
    const bar = createEl(doc, 'section', 'ywpc-canvas-head');
    bar.setAttribute('data-ywpc-layout-editor', '1');
    const row = createEl(doc, 'div', 'ywpc-canvas-head-row');
    const title = createEl(doc, 'span', 'ywpc-canvas-title');
    title.textContent = '布局';
    title.title = '只改主控显示，不改原预设和开关状态';
    append(row, title);
    const state = createEl(doc, 'span', 'ywpc-canvas-state');
    state.textContent = (m.name || '当前预设') + (editSaving ? ' · 保存中' : ' · 草稿');
    append(row, state);

    const save = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-primary ywpc-canvas-save');
    save.type = 'button';
    save.textContent = '保存';
    save.setAttribute('data-ywpc-action', 'layout-save');
    save.setAttribute('data-ywpc-focus-key', 'layout:save');
    if (typeof deps.saveSettings !== 'function' && typeof deps.saveSettingsNow !== 'function') save.disabled = true;
    if (editSaving) save.disabled = true;
    append(row, save);

    const cancel = createEl(doc, 'button', 'ywpc-edit-btn ywpc-canvas-cancel');
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.setAttribute('data-ywpc-action', 'layout-cancel');
    cancel.setAttribute('data-ywpc-focus-key', 'layout:cancel');
    append(row, cancel);

    const more = createEl(doc, 'button', 'ywpc-edit-btn ywpc-canvas-morebtn');
    more.type = 'button';
    more.textContent = '⋯';
    more.title = '更多：恢复默认布局、新建分组、分组管理';
    more.setAttribute('aria-label', '更多布局设置');
    more.setAttribute('aria-expanded', editMoreOpen ? 'true' : 'false');
    more.setAttribute('data-ywpc-action', 'layout-more-toggle');
    more.setAttribute('data-ywpc-focus-key', 'layout:more');
    append(row, more);
    append(bar, row);

    if (layoutError) {
      const error = createEl(doc, 'p', 'ywpc-edit-error');
      error.setAttribute('data-ywpc-layout-error', '1');
      error.textContent = layoutError;
      append(bar, error);
    }
    if (editMoreOpen) append(bar, renderEditMorePanel(m));
    return bar;
  }

  function renderEditMorePanel(m) {
    const panel = createEl(doc, 'div', 'ywpc-canvas-more');
    panel.setAttribute('data-ywpc-edit-more', '1');

    const restoreRow = createEl(doc, 'div', 'ywpc-canvas-more-row');
    const restore = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-warn ywpc-edit-small');
    restore.type = 'button';
    restore.textContent = restoreConfirm ? '确认恢复默认' : '恢复默认布局';
    restore.title = '只恢复「当前预设」的内置默认布局，别的预设不动';
    restore.setAttribute('data-ywpc-action', 'layout-restore');
    restore.setAttribute('data-ywpc-focus-key', 'layout:restore');
    if (!m.hasSavedLayout) {
      restore.disabled = true;
      restore.title = '当前预设本来就是内置默认布局';
    }
    append(restoreRow, restore);
    if (restoreConfirm) {
      const back = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
      back.type = 'button';
      back.textContent = '先不恢复';
      back.setAttribute('data-ywpc-action', 'layout-restore-cancel');
      back.setAttribute('data-ywpc-focus-key', 'layout:restore-cancel');
      append(restoreRow, back);
    }
    append(panel, restoreRow);

    const newRow = createEl(doc, 'div', 'ywpc-canvas-more-row');
    const input = createEl(doc, 'input', 'ywpc-edit-input ywpc-canvas-newgroup');
    input.type = 'text';
    input.placeholder = '新分组显示名';
    input.value = newSectionName;
    input.setAttribute('data-ywpc-layout-input', 'new-section');
    input.setAttribute('data-ywpc-focus-key', 'layout:new-section');
    input.setAttribute('aria-label', '新分组显示名');
    append(newRow, input);
    const add = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
    add.type = 'button';
    add.textContent = '＋ 新分组';
    add.setAttribute('data-ywpc-action', 'layout-add-section');
    add.setAttribute('data-ywpc-focus-key', 'layout:add-section');
    append(newRow, add);
    append(panel, newRow);

    const current = findEditSection(editSectionId);
    if (current) {
      const groupRow = createEl(doc, 'div', 'ywpc-canvas-more-row');
      const label = createEl(doc, 'span', 'ywpc-canvas-morelabel');
      label.textContent = '当前分组';
      append(groupRow, label);
      const nameInput = createEl(doc, 'input', 'ywpc-edit-input ywpc-canvas-grouptitle');
      nameInput.type = 'text';
      nameInput.value = current.label || '';
      nameInput.setAttribute('data-ywpc-layout-input', 'section-title');
      nameInput.setAttribute('data-ywpc-section-id', current.id);
      nameInput.setAttribute('data-ywpc-focus-key', 'layout:section:' + current.id + ':title');
      nameInput.setAttribute('aria-label', '分组显示名');
      append(groupRow, nameInput);
      const index = editSectionsOfModel().findIndex(section => section.id === current.id);
      const total = editSectionsOfModel().length;
      const up = createEl(doc, 'button', 'ywpc-edit-iconbtn ywpc-edit-small');
      up.type = 'button';
      up.textContent = '↑';
      up.title = '分组上移';
      up.setAttribute('data-ywpc-action', 'layout-section-up');
      up.setAttribute('data-ywpc-section-id', current.id);
      up.setAttribute('data-ywpc-focus-key', 'layout:section:' + current.id + ':up');
      if (index <= 0) up.disabled = true;
      append(groupRow, up);
      const down = createEl(doc, 'button', 'ywpc-edit-iconbtn ywpc-edit-small');
      down.type = 'button';
      down.textContent = '↓';
      down.title = '分组下移';
      down.setAttribute('data-ywpc-action', 'layout-section-down');
      down.setAttribute('data-ywpc-section-id', current.id);
      down.setAttribute('data-ywpc-focus-key', 'layout:section:' + current.id + ':down');
      if (index >= total - 1) down.disabled = true;
      append(groupRow, down);
      append(panel, groupRow);
    }

    return panel;
  }

  /* 分组紧凑横向分页：只显示一页，超出用 ‹ ›；不换行、不把顶栏撑高。 */
  function renderEditGroupNav(m) {
    const sections = editSectionsOfModel();
    const pages = clampEditGroupPage();
    const start = editGroupPage * EDIT_GROUPS_PER_PAGE;
    const items = sections.slice(start, start + EDIT_GROUPS_PER_PAGE);
    const wrap = createEl(doc, 'div', 'ywpc-gnav');
    wrap.setAttribute('data-ywpc-edit-groups', '1');

    const prev = createEl(doc, 'button', 'ywpc-gnav-arrow');
    prev.type = 'button';
    prev.textContent = '‹';
    prev.title = '上一页分组';
    prev.setAttribute('aria-label', '上一页分组');
    prev.setAttribute('data-ywpc-action', 'layout-group-page');
    prev.setAttribute('data-ywpc-dir', '-1');
    prev.setAttribute('data-ywpc-focus-key', 'layout:groups:prev');
    if (editGroupPage <= 0) prev.disabled = true;
    append(wrap, prev);

    const strip = createEl(doc, 'div', 'ywpc-gnav-strip');
    for (const section of items) {
      const btn = createEl(doc, 'button', 'ywpc-gnav-chip');
      btn.type = 'button';
      btn.textContent = section.label || section.id;
      btn.title = section.label || section.id;
      btn.setAttribute('data-ywpc-action', 'layout-select-section');
      btn.setAttribute('data-ywpc-section-id', section.id);
      btn.setAttribute('data-ywpc-focus-key', 'layout:select-section:' + section.id);
      if (section.id === editSectionId) btn.classList.add('ywpc-current');
      append(strip, btn);
    }
    append(wrap, strip);

    const next = createEl(doc, 'button', 'ywpc-gnav-arrow');
    next.type = 'button';
    next.textContent = '›';
    next.title = '下一页分组';
    next.setAttribute('aria-label', '下一页分组');
    next.setAttribute('data-ywpc-action', 'layout-group-page');
    next.setAttribute('data-ywpc-dir', '1');
    next.setAttribute('data-ywpc-focus-key', 'layout:groups:next');
    if (editGroupPage >= pages - 1) next.disabled = true;
    append(wrap, next);

    if (pages > 1) {
      const count = createEl(doc, 'span', 'ywpc-gnav-count');
      count.textContent = (editGroupPage + 1) + '/' + pages;
      append(wrap, count);
    }
    return wrap;
  }

  function ensureEditSelection() {
    const sections = editSectionsOfModel();
    if (!sections.some(section => section.id === editSectionId)) {
      editSectionId = sections[0] ? sections[0].id : '';
      if (editSectionId) editGroupPage = groupPageOfSection(editSectionId);
    }
    if (editOpenUid && !findEditControl(editOpenUid)) editOpenUid = '';
    if (editSelectedUid && !findEditControl(editSelectedUid)) editSelectedUid = '';
    clampEditGroupPage();
  }

  function selectEditSection(sectionId) {
    if (!findEditSection(sectionId)) return false;
    editSectionId = sectionId;
    editOpenUid = '';
    editSelectedUid = '';
    editSelectedOption = null;
    layoutAddTarget = '';
    layoutQuery = '';
    layoutError = '';
    editMoreOpen = false;
    editGroupPage = groupPageOfSection(sectionId);
    lastActiveSectionId = sectionId;
    lastActiveSectionName = (model && model.name) || lastPresetName || '';
    refresh({ force: true, reason: 'layout-section-select' });
    return true;
  }

  function toggleEditControl(uid) {
    if (!findEditControl(uid)) return false;
    const open = editOpenUid !== uid;
    editOpenUid = open ? uid : '';
    if (open) editSelectedUid = uid;
    editSelectedOption = null;
    layoutAddTarget = '';
    layoutError = '';
    refresh({ force: true, reason: 'layout-control-focus' });
    if (open) revealBlockSettings(uid);
    return true;
  }

  function decodeOptionAttr(value) {
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  function selectEditOptionChip(chip) {
    const uid = text(chip && (chip.getAttribute('data-ywpc-preview-option-uid')
      || chip.getAttribute('data-ywpc-drag-uid')));
    if (!uid || !findEditControl(uid)) return false;
    const spaceUid = text(chip.getAttribute('data-ywpc-option-space'));
    const value = spaceUid ? '' : decodeOptionAttr(text(chip.getAttribute('data-ywpc-option-value')));
    if (editSelectedOption && editSelectedOption.uid === uid
      && (spaceUid ? editSelectedOption.spaceUid === spaceUid
        : String(editSelectedOption.value) === String(value))) {
      editSelectedOption = null;
      refresh({ force: true, reason: 'layout-option-deselect' });
      return true;
    }
    editSelectedUid = uid;
    editSelectedOption = spaceUid ? { uid, spaceUid } : { uid, value };
    if (editOpenUid && editOpenUid !== uid) editOpenUid = '';
    refresh({ force: true, reason: 'layout-option-select' });
    return true;
  }

  function selectEditBlock(uid) {
    if (!findEditControl(uid)) return false;
    if (editSelectedUid === uid && !editOpenUid && !editSelectedOption) return false;
    editSelectedUid = uid;
    editSelectedOption = null;
    if (editOpenUid && editOpenUid !== uid) editOpenUid = '';
    refresh({ force: true, reason: 'layout-block-select' });
    return true;
  }

  function closeEditControlSettings() {
    if (!editOpenUid) return false;
    const uid = editOpenUid;
    editOpenUid = '';
    refresh({ force: true, reason: 'layout-control-close' });
    /* 关闭后回到原块：焦点落在该块的齿轮上，不滚回顶部。 */
    try {
      const gear = root && root.querySelector('[data-ywpc-edit-block="' + uid.replace(/"/g, '\\"')
        + '"] [data-ywpc-action="layout-edit-control"]');
      if (gear && typeof gear.focus === 'function') gear.focus({ preventScroll: true });
    } catch (e) { /* 焦点失败不影响布局 */ }
    return true;
  }

  function controlBindingText(m, control) {
    if (!control) return '';
    if (control.kind === 'missing') return control._missingReason || '缺项，可在编辑里修复';
    const ref = controlRef(control);
    if (!ref) return '未绑定';
    if (ref.type === 'prompt') {
      const prompt = m.promptById.get(ref.id);
      return '绑定：' + String((prompt && prompt.name) || control.label || ref.id);
    }
    return '类型：' + layoutKindLabel(control);
  }

  /* ------------------------------------------------------------------------
     可视化画布：每块展示真实标题 / 选项 / 成员 / 开关态；
     画布内点击一律只选中或开设置，绝不调用 apply*、不写任何开关。
     ------------------------------------------------------------------------ */

  function renderCanvasWord(m) {
    const wrap = createEl(doc, 'div', 'ywpc-row ywpc-cblock-word');
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = '正文字数';
    append(wrap, label);
    const value = createEl(doc, 'span', 'ywpc-cblock-static');
    value.textContent = wordHintText(m);
    append(wrap, value);
    return wrap;
  }

  function canvasPinLabel(m, pin) {
    if (!pin) return '';
    if (pin.type === 'prompt') return pinPromptLabel(m, pin.id);
    if (pin.type === 'word') return '正文字数';
    if (pin.type === 'spacer') return '空白';
    if (pin.type === 'toolboxFlag') {
      const def = TOOLBOX_FLAG_BY_KEY.get(pin.key) || null;
      return def ? def.label : '工具箱开关';
    }
    if (pin.type === 'radio' || pin.type === 'combo' || pin.type === 'comboToggle') {
      const def = definitionForKey(m, pin.key, [pin.type]);
      return def ? def.label : layoutKindLabel({ kind: pin.type });
    }
    return '';
  }

  function renderCanvasShortcuts(m) {
    const wrap = createEl(doc, 'div', 'ywpc-row ywpc-cblock-shortcuts');
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = '常用快捷';
    append(wrap, label);
    const chips = createEl(doc, 'div', 'ywpc-member-chips');
    const pins = Array.isArray(m.homePins) ? m.homePins : [];
    if (!pins.length) {
      const empty = createEl(doc, 'span', 'ywpc-member-empty');
      empty.textContent = '首页常用还是空的';
      append(chips, empty);
    }
    for (const pin of pins) {
      const name = canvasPinLabel(m, pin);
      if (!name) continue;
      const chip = createEl(doc, 'span', 'ywpc-member-chip ywpc-cblock-pin');
      const textNode = createEl(doc, 'span', 'ywpc-member-name');
      textNode.textContent = name;
      append(chip, textNode);
      append(chips, chip);
    }
    append(wrap, chips);
    return wrap;
  }

  function renderCanvasInfo(control) {
    const wrap = createEl(doc, 'div', 'ywpc-row ywpc-cblock-info');
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = control.label || '说明文字';
    append(wrap, label);
    const textNode = createEl(doc, 'span', 'ywpc-cblock-static');
    textNode.textContent = control.text || '不会写进预设';
    append(wrap, textNode);
    return wrap;
  }

  function renderCanvasMembers(m, control) {
    const ids = control.kind === 'multi'
      ? (Array.isArray(control.ids) ? control.ids : [])
      : (Array.isArray(control.members) ? control.members : []);
    const wrap = createEl(doc, 'div', 'ywpc-member-chips ywpc-cblock-members');
    if (!ids.length) {
      const empty = createEl(doc, 'span', 'ywpc-member-empty');
      empty.textContent = '还没有成员；点齿轮添加';
      append(wrap, empty);
      return wrap;
    }
    for (const id of ids) {
      const chip = createEl(doc, 'span', 'ywpc-member-chip ywpc-cblock-member');
      if (!hasOwn(m.orderMap, id)) chip.classList.add('ywpc-missing');
      if (isAvailable(m, id) && isOn(m, id)) chip.classList.add('is-on');
      const name = createEl(doc, 'span', 'ywpc-member-name');
      name.textContent = memberName(m, id);
      append(chip, name);
      append(wrap, chip);
    }
    return wrap;
  }

  function canvasOptionValue(control, entry) {
    return String(entry.option.value == null ? '' : entry.option.value);
  }

  function canvasOptionSelected(m, control, value) {
    if (control.kind === 'radio') return String(selectedRadioValue(m, control)) === String(value);
    if (control.kind === 'combo') return String(selectedComboValue(m, control)) === String(value);
    return false;
  }

  /* 单选/组合的选项与组内空白块：画布整块拖动排序；选中后下方固定调宽热区。 */
  function renderCanvasOptions(m, control) {
    const uid = controlUid(control);
    const box = createEl(doc, 'div', 'ywpc-cblock-options');
    const display = optionDisplayList(control)
      || (control.options || []).map(option => ({ type: 'option', option, width: 0 }));
    for (const entry of display) {
      if (entry.type === 'spacer') {
        const spaceUid = String(entry.uid || '');
        const space = createEl(doc, 'div', 'ywpc-cblock-opt ywpc-cblock-ospace');
        space.setAttribute('data-ywpc-option-space', spaceUid);
        space.setAttribute('data-ywpc-w', String(explicitLayoutWidth(entry.width) || 6));
        space.setAttribute('data-ywpc-edit-option', '1');
        space.setAttribute('data-ywpc-drag', 'option-space');
        space.setAttribute('data-ywpc-drag-whole', '1');
        space.setAttribute('data-ywpc-drag-uid', uid);
        space.setAttribute('data-ywpc-space-uid', spaceUid);
        space.title = '拖动排序；点一下选中调宽';
        const label = createEl(doc, 'span', 'ywpc-cblock-optlabel');
        label.textContent = '空白';
        append(space, label);
        append(box, space);
        continue;
      }
      const option = entry.option;
      const value = canvasOptionValue(control, entry);
      const width = optionWidthOf(control, option, entry);
      const chip = createEl(doc, 'div', 'ywpc-cblock-opt');
      chip.setAttribute('data-ywpc-option-value', encodeURIComponent(value));
      chip.setAttribute('data-ywpc-preview-option-uid', controlUid(control));
      chip.setAttribute('data-ywpc-preview-option-value', encodeURIComponent(value));
      chip.setAttribute('data-ywpc-w', String(width));
      chip.setAttribute('data-ywpc-edit-option', '1');
      chip.setAttribute('data-ywpc-drag', 'option');
      chip.setAttribute('data-ywpc-drag-whole', '1');
      chip.setAttribute('data-ywpc-drag-uid', uid);
      chip.setAttribute('data-ywpc-value', value);
      chip.title = '拖动排序；点一下选中调宽';
      const available = (option.ids || []).length
        ? option.ids.every(id => isAvailable(m, id))
        : anyAvailable(m, control.allIds || []);
      if (!available) chip.classList.add('ywpc-missing');
      const selected = canvasOptionSelected(m, control, value);
      if (selected) chip.classList.add('is-on');
      chip.setAttribute('aria-checked', selected ? 'true' : 'false');
      const label = createEl(doc, 'span', 'ywpc-cblock-optlabel');
      label.textContent = option.label || value;
      label.title = option.label || value;
      append(chip, label);
      append(box, chip);
    }
    const picked = editSelectedOption && editSelectedOption.uid === uid ? editSelectedOption : null;
    if (picked) {
      let pickedEntry = null;
      let pickedLabel = '';
      if (picked.spaceUid) {
        pickedEntry = display.find(entry => entry && entry.type === 'spacer'
          && String(entry.uid || '') === String(picked.spaceUid));
        pickedLabel = '空白块';
      } else {
        pickedEntry = display.find(entry => entry && entry.type === 'option'
          && String(entry.option.value) === String(picked.value));
        pickedLabel = pickedEntry ? String(pickedEntry.option.label || pickedEntry.option.value) : '';
      }
      if (pickedEntry) {
        const ctx = createEl(doc, 'div', 'ywpc-cblock-optctx');
        ctx.setAttribute('data-ywpc-option-context', uid);
        const ctxLabel = createEl(doc, 'span', 'ywpc-cblock-optctx-label');
        ctxLabel.textContent = '已选：' + pickedLabel;
        append(ctx, ctxLabel);
        const widthLabel = createEl(doc, 'span', 'ywpc-field-label');
        widthLabel.textContent = '宽度';
        append(ctx, widthLabel);
        const handle = picked.spaceUid
          ? makeWidthHandle('layout-option-space-width', { uid, 'space-uid': picked.spaceUid }, '拖动调整组内空白块宽度')
          : makeWidthHandle('layout-option-width', { uid, value: picked.value }, '拖动调整选项宽度');
        handle.classList.add('ywpc-cblock-optctx-handle');
        append(ctx, handle);
        append(box, ctx);
      }
    }
    return box;
  }
  function renderCanvasControl(m, section, control) {
    if (control.kind === 'spacer') return makeSpaceBlock(true, '空白');
    if (control.kind === 'missing') return renderMissingControl(control);
    if (control.kind === 'word') return renderCanvasWord(m);
    if (control.kind === 'shortcuts') return renderCanvasShortcuts(m);
    if (control.kind === 'info') return renderCanvasInfo(control);
    return renderControl(m, control, section);
  }

  function renderCanvasBlock(m, section, control, index, total) {
    const uid = controlUid(control);
    const width = controlCellWidth(section.id, control);
    const block = createEl(doc, 'div', 'ywpc-cblock');
    block.setAttribute('data-ywpc-edit-block', uid);
    block.setAttribute('data-ywpc-edit-row', uid);
    block.setAttribute('data-ywpc-edit-control', uid);
    block.setAttribute('data-ywpc-w', String(width));
    if (control.kind === 'spacer') block.classList.add('ywpc-cblock-space');
    if (uid === editSelectedUid) block.classList.add('ywpc-selected');
    if (uid === editOpenUid) block.classList.add('ywpc-open');

    const sort = createEl(doc, 'span', 'ywpc-cblock-sort');
    sort.textContent = '⠿';
    sort.title = '拖动排序（拖动整块）';
    sort.setAttribute('role', 'button');
    sort.setAttribute('aria-label', '拖动排序');
    sort.setAttribute('data-ywpc-drag', 'control');
    sort.setAttribute('data-ywpc-drag-uid', uid);
    sort.setAttribute('data-ywpc-section-id', section.id);
    sort.setAttribute('data-ywpc-focus-key', 'layout:block:' + uid + ':sort');
    append(block, sort);

    const main = createEl(doc, 'div', 'ywpc-cblock-main');
    const head = createEl(doc, 'div', 'ywpc-cblock-head');
    const kind = createEl(doc, 'span', 'ywpc-kind');
    kind.textContent = control.kind === 'combo'
      ? '组合选择'
      : (layoutKindLabel(control)
        + (control.kind === 'radio' ? (control.atMostOne ? ' · 可全关' : ' · 必选') : ''));
    append(head, kind);
    const name = createEl(doc, 'span', 'ywpc-cblock-title');
    name.textContent = control.label || (control.kind === 'spacer' ? '空白块' : '未命名控件');
    name.title = name.textContent;
    /* 开关/动作/工具箱块的完整名字在下面卡片里；顶部不再重复一个会被挤成单字的标题。 */
    if (control.kind !== 'toggle' && control.kind !== 'action' && control.kind !== 'toolboxFlag') {
      append(head, name);
    }
    append(main, head);

    const bindText = control.kind === 'spacer'
      ? '只占位置，不显示内容、不进入焦点、不切开关'
      : controlBindingText(m, control);
    /* 块头已有类型徽标；「类型：单选/开关」这类重复行不再画。 */
    if (bindText && bindText.indexOf('类型：') !== 0) {
      const bind = createEl(doc, 'span', 'ywpc-cblock-bind');
      bind.textContent = bindText;
      append(main, bind);
    }

    const preview = createEl(doc, 'div', 'ywpc-cblock-preview');
    if (control.kind === 'radio' || control.kind === 'combo') {
      append(preview, renderCanvasOptions(m, control));
    } else if (control.kind === 'comboToggle' || control.kind === 'multi') {
      append(preview, renderCanvasMembers(m, control));
    } else {
      append(preview, renderCanvasControl(m, section, control));
    }
    append(main, preview);
    append(block, main);

    const gear = createEl(doc, 'button', 'ywpc-cblock-gear');
    gear.type = 'button';
    gear.textContent = '⚙';
    gear.title = '设置这个块';
    gear.setAttribute('aria-label', '设置 ' + (control.label || layoutKindLabel(control)));
    gear.setAttribute('aria-expanded', uid === editOpenUid ? 'true' : 'false');
    gear.setAttribute('data-ywpc-action', 'layout-edit-control');
    gear.setAttribute('data-ywpc-uid', uid);
    gear.setAttribute('data-ywpc-focus-key', 'layout:block:' + uid + ':gear');
    append(block, gear);

    const handle = makeWidthHandle('layout-control-width', { uid }, '拖动调整这个块的宽度');
    handle.classList.add('ywpc-cblock-whandle');
    append(block, handle);
    return block;
  }
  function renderBlockSettings(m, section, control, index) {
    const uid = controlUid(control);
    const pane = createEl(doc, 'div', 'ywpc-cblock-settings');
    pane.setAttribute('data-ywpc-canvas-settings', uid);
    const head = createEl(doc, 'div', 'ywpc-cblock-settings-head');
    const title = createEl(doc, 'strong', 'ywpc-cblock-settings-title');
    title.textContent = '块设置';
    append(head, title);
    const close = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small ywpc-cblock-settings-close');
    close.type = 'button';
    close.textContent = '完成';
    close.title = '关闭设置，回到这个块';
    close.setAttribute('data-ywpc-action', 'layout-close-settings');
    close.setAttribute('data-ywpc-uid', uid);
    close.setAttribute('data-ywpc-focus-key', 'layout:block:' + uid + ':close');
    append(head, close);
    append(pane, head);

    if (control.kind === 'spacer') {
      appendDeleteRow(pane, control, uid);
      return pane;
    }
    append(pane, renderControlEditor(m, section, control, index));
    return pane;
  }
  function renderEditCanvas(m, section, index, total) {
    const wrap = createEl(doc, 'div', 'ywpc-canvas');
    wrap.setAttribute('data-ywpc-canvas', section.id);
    wrap.setAttribute('data-ywpc-edit-pane', '1');
    wrap.setAttribute('data-ywpc-edit-section', section.id);

    const bar = createEl(doc, 'div', 'ywpc-canvas-bar');
    const title = createEl(doc, 'span', 'ywpc-canvas-section');
    title.textContent = section.label || section.id;
    append(bar, title);
    const tip = createEl(doc, 'span', 'ywpc-canvas-tip');
    tip.textContent = '拖左侧 ⠿ 排序 · 拖右缘 ⇔ 调宽 · 点 ⚙ 设置';
    append(bar, tip);
    const count = createEl(doc, 'span', 'ywpc-canvas-count');
    count.textContent = (index + 1) + '/' + total;
    append(bar, count);
    append(wrap, bar);

    const grid = createEl(doc, 'div', 'ywpc-grid12 ywpc-canvas-grid');
    const controls = section.controls || [];
    controls.forEach((control, controlIndex) => {
      const uid = controlUid(control);
      const cell = appendGridCell(grid, null, controlCellWidth(section.id, control));
      cell.setAttribute('data-ywpc-canvas-cell', uid);
      append(cell, renderCanvasBlock(m, section, control, controlIndex, controls.length));
      if (uid === editOpenUid) {
        const settingsCell = createEl(doc, 'div', 'ywpc-cell ywpc-canvas-settings-cell');
        settingsCell.setAttribute('data-ywpc-w', '12');
        append(settingsCell, renderBlockSettings(m, section, control, controlIndex));
        append(grid, settingsCell);
      }
    });
    append(wrap, grid);
    if (!controls.length) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = '这一组还没有内容；点下面「＋ 添加内容」开始。';
      append(wrap, empty);
    }

    const addRow = createEl(doc, 'div', 'ywpc-canvas-add-row');
    const add = createEl(doc, 'button', 'ywpc-canvas-add');
    add.type = 'button';
    add.textContent = layoutAddTarget === section.id ? '收起添加菜单' : '＋ 添加内容';
    add.setAttribute('aria-expanded', layoutAddTarget === section.id ? 'true' : 'false');
    add.setAttribute('data-ywpc-action', layoutAddTarget === section.id ? 'layout-add-close' : 'layout-add-open');
    add.setAttribute('data-ywpc-section-id', section.id);
    add.setAttribute('data-ywpc-focus-key', 'layout:add-open');
    append(addRow, add);
    const hint = createEl(doc, 'span', 'ywpc-canvas-add-hint');
    hint.textContent = editSelectedUid ? '新内容插在选中块之后' : '没有选中块时放到末尾';
    append(addRow, hint);
    append(wrap, addRow);
    if (layoutAddTarget === section.id) append(wrap, renderAddMenu(m, section));
    return wrap;
  }

  function renderAddMenu(m, section) {
    const panel = createEl(doc, 'div', 'ywpc-addmenu');
    panel.setAttribute('data-ywpc-edit-menu', '1');
    const head = createEl(doc, 'div', 'ywpc-addmenu-head');
    const title = createEl(doc, 'strong', 'ywpc-addmenu-title');
    title.textContent = '添加内容';
    append(head, title);
    const tip = createEl(doc, 'span', 'ywpc-addmenu-tip');
    tip.textContent = editSelectedUid ? '插在选中块之后' : '放在这一组末尾';
    append(head, tip);
    const close = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
    close.type = 'button';
    close.textContent = '收起';
    close.setAttribute('data-ywpc-action', 'layout-add-close');
    close.setAttribute('data-ywpc-focus-key', 'layout:add-close');
    append(head, close);
    append(panel, head);

    const kinds = createEl(doc, 'div', 'ywpc-addmenu-kinds');
    const promptChip = createEl(doc, 'button', 'ywpc-addmenu-kind ywpc-current');
    promptChip.type = 'button';
    promptChip.textContent = '已有条目';
    promptChip.title = '把当前预设已有的普通条目加到布局';
    promptChip.setAttribute('data-ywpc-action', 'layout-add-focus-search');
    promptChip.setAttribute('data-ywpc-focus-key', 'layout:add-focus-search');
    append(kinds, promptChip);
    for (const item of [
      ['radio', '单选组'],
      ['multi', '多选组'],
      ['comboToggle', '组合开关'],
      ['combo', '组合选择'],
      ['spacer', '空白块'],
    ]) {
      const btn = createEl(doc, 'button', 'ywpc-addmenu-kind');
      btn.type = 'button';
      btn.textContent = item[1];
      btn.setAttribute('data-ywpc-action', item[0] === 'spacer' ? 'layout-add-space' : 'layout-add-group');
      if (item[0] !== 'spacer') btn.setAttribute('data-ywpc-kind', item[0]);
      btn.setAttribute('data-ywpc-section-id', section.id);
      btn.setAttribute('data-ywpc-focus-key', 'layout:add-kind:' + item[0]);
      append(kinds, btn);
    }
    append(panel, kinds);

    const searchRow = createEl(doc, 'div', 'ywpc-addmenu-searchrow');
    const search = createEl(doc, 'input', 'ywpc-picker-search');
    search.type = 'search';
    search.placeholder = '搜当前预设的条目名…';
    search.value = layoutQuery;
    search.setAttribute('data-ywpc-layout-search', '1');
    search.setAttribute('data-ywpc-focus-key', 'layout:search');
    search.setAttribute('aria-label', '搜索当前预设的条目');
    append(searchRow, search);
    append(panel, searchRow);

    const list = createEl(doc, 'div', 'ywpc-addmenu-list');
    list.setAttribute('data-ywpc-layout-list', '1');
    append(panel, list);
    renderAddPromptList(list, m, section);
    return panel;
  }

  function renderAddPromptList(list, m, section) {
    clearNode(list);
    const query = normalizeSearch(layoutQuery);
    const used = manageUsedPromptIds(m, editSectionsOfModel());
    let shown = 0;
    let total = 0;
    for (const row of promptRowsForLayout(m)) {
      if (query && layoutSearchText(row).indexOf(query) < 0) continue;
      total += 1;
      if (shown >= EDIT_ADD_PROMPT_LIMIT) continue;
      shown += 1;
      const item = createEl(doc, 'div', 'ywpc-pick-row ywpc-addmenu-row');
      const main = createEl(doc, 'div', 'ywpc-pick-main');
      const label = createEl(doc, 'span', 'ywpc-pick-label');
      label.textContent = row.name;
      append(main, label);
      if (!row.inOrder || !row.ordinary) {
        const sub = createEl(doc, 'span', 'ywpc-pick-sub');
        sub.textContent = row.inOrder ? '系统条目 · 不能当开关' : '不在有效条目列表 · 不能添加';
        append(main, sub);
      } else if (used.has(row.id)) {
        const sub = createEl(doc, 'span', 'ywpc-pick-sub');
        sub.textContent = '已在布局里 · 可再加一份';
        append(main, sub);
      }
      append(item, main);
      const add = createEl(doc, 'button', 'ywpc-pick-add');
      add.type = 'button';
      add.textContent = !row.inOrder ? '不可用' : (!row.ordinary ? '不可用' : (used.has(row.id) ? '再加一份' : '添加'));
      add.setAttribute('data-ywpc-action', 'layout-add-prompt');
      add.setAttribute('data-ywpc-prompt-id', row.id);
      add.setAttribute('data-ywpc-section-id', section.id);
      add.setAttribute('data-ywpc-focus-key', 'layout:add-prompt:' + row.id);
      if (!row.inOrder || !row.ordinary) add.disabled = true;
      append(item, add);
      append(list, item);
    }
    if (!total) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = layoutQuery ? '没搜到条目，换个关键词。' : '当前预设里没有可添加的普通条目。';
      append(list, empty);
      return;
    }
    if (total > shown) {
      const more = createEl(doc, 'p', 'ywpc-addmenu-note');
      more.textContent = '还有 ' + (total - shown) + ' 条没列出；输入关键词缩小范围。';
      append(list, more);
    }
  }
  function memberName(m, id) {
    const prompt = m.promptById.get(id);
    if (prompt && prompt.name) return String(prompt.name);
    return PROMPT_NAMES[id] || '未命名条目';
  }

  function renderMemberChips(m, control, option, optionIndex) {
    const wrap = createEl(doc, 'div', 'ywpc-member-chips');
    const ids = (option ? option.ids : control.members) || [];
    if (!ids.length) {
      const empty = createEl(doc, 'span', 'ywpc-member-empty');
      empty.textContent = '还没有成员';
      append(wrap, empty);
    }
    ids.forEach((id, memberIndex) => {
      const chip = createEl(doc, 'span', 'ywpc-member-chip');
      const name = createEl(doc, 'span', 'ywpc-member-name');
      name.textContent = memberName(m, id);
      const inOrder = hasOwn(m.orderMap, id);
      if (!inOrder) {
        chip.classList.add('ywpc-missing');
        chip.title = '这个成员不在有效条目列表里';
      }
      const remove = createEl(doc, 'button', 'ywpc-member-remove');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = '从这里移除成员（不改条目本身）';
      remove.setAttribute('data-ywpc-action', 'layout-remove-member');
      remove.setAttribute('data-ywpc-uid', controlUid(control));
      remove.setAttribute('data-ywpc-option-index', option ? String(optionIndex) : '');
      remove.setAttribute('data-ywpc-member-index', String(memberIndex));
      remove.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':member-remove:' + (option ? optionIndex : 'x') + ':' + memberIndex);
      append(chip, name);
      append(chip, remove);
      append(wrap, chip);
    });
    return wrap;
  }

  function renderOptionSpaceRow(control, entry) {
    const box = createEl(doc, 'div', 'ywpc-option-editor ywpc-option-space');
    box.setAttribute('data-ywpc-option-space', entry.uid || '');
    const head = createEl(doc, 'div', 'ywpc-edit-option-head');
    const label = createEl(doc, 'span', 'ywpc-edit-option-label ywpc-field-static');
    label.textContent = '组内空白块';
    append(head, label);
    const del = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small ywpc-edit-danger ywpc-option-del');
    del.type = 'button';
    del.textContent = '删除';
    del.title = '移除这个组内空白块（不改选项本身）';
    del.setAttribute('data-ywpc-action', 'layout-option-space-remove');
    del.setAttribute('data-ywpc-uid', controlUid(control));
    del.setAttribute('data-ywpc-space-uid', entry.uid || '');
    append(head, del);
    append(box, head);
    return box;
  }
  function renderMemberEditor(m, control) {
    const box = createEl(doc, 'div', 'ywpc-member-editor');
    const isOptions = control.kind === 'radio' || control.kind === 'combo';
    if (isOptions) {
      const optionsCaption = createEl(doc, 'span', 'ywpc-field-caption');
      optionsCaption.textContent = '选项';
      append(box, optionsCaption);
      const display = optionDisplayList(control)
        || (control.options || []).map(option => ({ type: 'option', option, width: 0 }));
      for (const entry of display) {
        if (entry.type === 'spacer') {
          append(box, renderOptionSpaceRow(control, entry));
          continue;
        }
        const option = entry.option;
        const optionIndex = (control.options || []).indexOf(option);
        const optionBox = createEl(doc, 'div', 'ywpc-option-editor');
        optionBox.setAttribute('data-ywpc-option-value', encodeURIComponent(option.value));
        const optionHead = createEl(doc, 'div', 'ywpc-edit-option-head');
        const label = createEl(doc, 'input', 'ywpc-edit-input ywpc-edit-option-label');
        label.type = 'text';
        label.value = option.label || '';
        label.placeholder = '选项名称';
        label.setAttribute('data-ywpc-layout-input', 'option-label');
        label.setAttribute('data-ywpc-uid', controlUid(control));
        label.setAttribute('data-ywpc-option-index', String(optionIndex));
        label.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':option:' + optionIndex + ':label');
        label.setAttribute('aria-label', '选项显示名');
        append(optionHead, label);
        const del = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small ywpc-edit-danger ywpc-option-del');
        del.type = 'button';
        del.textContent = '删除';
        del.title = '删除这个选项（只改布局，不改预设）';
        del.setAttribute('data-ywpc-action', 'layout-remove-option');
        del.setAttribute('data-ywpc-uid', controlUid(control));
        del.setAttribute('data-ywpc-value', option.value);
        del.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':option:' + optionIndex + ':remove');
        if ((control.options || []).length <= 1) {
          del.disabled = true;
          del.title = '至少保留一个选项';
        }
        append(optionHead, del);
        append(optionBox, optionHead);
        const memberField = createEl(doc, 'div', 'ywpc-field-block');
        const memberCaption = createEl(doc, 'span', 'ywpc-field-caption');
        memberCaption.textContent = '成员';
        append(memberField, memberCaption);
        append(memberField, renderMemberChips(m, control, option, optionIndex));
        const add = createEl(doc, 'select', 'ywpc-edit-select ywpc-member-add');
        add.setAttribute('data-ywpc-layout-member-add', controlUid(control));
        add.setAttribute('data-ywpc-option-index', String(optionIndex));
        add.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':option:' + optionIndex + ':add');
        add.setAttribute('aria-label', '给这个选项添加成员');
        const placeholder = createEl(doc, 'option');
        placeholder.value = '';
        placeholder.textContent = '＋ 添加成员…';
        append(add, placeholder);
        for (const row of memberCandidates(m, control, optionIndex)) {
          const opt = createEl(doc, 'option');
          opt.value = row.id;
          opt.textContent = row.enabled ? row.name : row.name + '（当前关）';
          append(add, opt);
        }
        append(memberField, add);
        append(optionBox, memberField);
        append(box, optionBox);
      }
      const addRow = createEl(doc, 'div', 'ywpc-option-add-row');
      const addOption = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
      addOption.type = 'button';
      addOption.textContent = '＋ 选项';
      addOption.setAttribute('data-ywpc-action', 'layout-add-option');
      addOption.setAttribute('data-ywpc-uid', controlUid(control));
      addOption.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':add-option');
      append(addRow, addOption);
      const addSpace = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
      addSpace.type = 'button';
      addSpace.textContent = '＋ 组内空白块';
      addSpace.title = '只影响组内选项的显示排布，不改变选项执行顺序';
      addSpace.setAttribute('data-ywpc-action', 'layout-add-option-space');
      addSpace.setAttribute('data-ywpc-uid', controlUid(control));
      addSpace.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':add-option-space');
      append(addRow, addSpace);
      append(box, addRow);
    } else if (control.kind === 'comboToggle' || control.kind === 'multi') {
      const memberField = createEl(doc, 'div', 'ywpc-field-block');
      const memberCaption = createEl(doc, 'span', 'ywpc-field-caption');
      memberCaption.textContent = '成员';
      append(memberField, memberCaption);
      append(memberField, renderMemberChips(m, control, null, -1));
      const add = createEl(doc, 'select', 'ywpc-edit-select ywpc-member-add');
      add.setAttribute('data-ywpc-layout-member-add', controlUid(control));
      add.setAttribute('data-ywpc-option-index', '-1');
      add.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':add-member');
      add.setAttribute('aria-label', '添加成员');
      const placeholder = createEl(doc, 'option');
      placeholder.value = '';
      placeholder.textContent = '＋ 添加成员…';
      append(add, placeholder);
      const used = new Set(control.members || control.ids || []);
      for (const row of promptRowsForLayout(m)) {
        if (!row.inOrder || !row.ordinary || used.has(row.id)) continue;
        const opt = createEl(doc, 'option');
        opt.value = row.id;
        opt.textContent = row.enabled ? row.name : row.name + '（当前关）';
        append(add, opt);
      }
      append(memberField, add);
      append(box, memberField);
    }
    return box;
  }
  function renderControlEditor(m, section, control, controlIndex) {
    const uid = controlUid(control);
    const card = createEl(doc, 'div', 'ywpc-edit-card');
    card.setAttribute('data-ywpc-edit-control', uid);

    const title = createEl(doc, 'input', 'ywpc-edit-input ywpc-edit-control-title');
    title.type = 'text';
    title.value = control.label || '';
    title.placeholder = '显示名称';
    title.setAttribute('data-ywpc-layout-input', 'control-title');
    title.setAttribute('data-ywpc-uid', uid);
    title.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':title');
    title.setAttribute('aria-label', '控件显示名');
    append(card, settingField('名称', title));

    const sub = createEl(doc, 'input', 'ywpc-edit-input ywpc-edit-control-sub');
    sub.type = 'text';
    sub.value = control.sub || '';
    sub.placeholder = '可选，显示在名称下方';
    sub.setAttribute('data-ywpc-layout-input', 'control-sub');
    sub.setAttribute('data-ywpc-uid', uid);
    sub.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':sub');
    sub.setAttribute('aria-label', '控件副标题');
    append(card, settingField('副标题', sub));

    const binding = controlBindingFieldText(m, control);
    if (binding) {
      const bindField = createEl(doc, 'div', 'ywpc-field');
      const bindLabel = createEl(doc, 'span', 'ywpc-field-label');
      bindLabel.textContent = '绑定';
      const bindValue = createEl(doc, 'span', 'ywpc-field-static');
      bindValue.textContent = binding;
      append(bindField, bindLabel);
      append(bindField, bindValue);
      append(card, bindField);
    }

    if (control.kind === 'missing') {
      const missing = createEl(doc, 'p', 'ywpc-edit-error');
      missing.textContent = control._missingReason || '这个控件在当前预设里缺项；可以删除，或恢复当前预设默认布局。';
      append(card, missing);
      const rebind = createEl(doc, 'select', 'ywpc-edit-select ywpc-member-add');
      rebind.setAttribute('data-ywpc-layout-rebind', uid);
      rebind.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':rebind');
      rebind.setAttribute('aria-label', '重新绑定到当前预设的条目');
      const placeholder = createEl(doc, 'option');
      placeholder.value = '';
      placeholder.textContent = '重新绑定到当前条目…';
      append(rebind, placeholder);
      const used = manageUsedPromptIds(m, editSectionsOfModel());
      for (const row of promptRowsForLayout(m)) {
        if (!row.inOrder || !row.ordinary || used.has(row.id)) continue;
        const opt = createEl(doc, 'option');
        opt.value = row.id;
        opt.textContent = row.name;
        append(rebind, opt);
      }
      append(card, settingField('重新绑定', rebind));
      appendDeleteRow(card, control, uid);
      return card;
    }

    if (control.kind === 'radio' || control.kind === 'combo') append(card, renderRelationField(control));

    if (control.kind === 'radio' || control.kind === 'combo' || control.kind === 'comboToggle' || control.kind === 'multi') {
      const details = createEl(doc, 'details', 'ywpc-member-details');
      details.setAttribute('data-ywpc-member-details', uid);
      const summary = createEl(doc, 'summary', 'ywpc-member-summary');
      summary.textContent = (control.kind === 'radio' || control.kind === 'combo') ? '选项与成员' : '成员';
      append(details, summary);
      append(details, renderMemberEditor(m, control));
      append(card, details);
    }
    appendDeleteRow(card, control, uid);
    return card;
  }
  function renderMissingControl(control) {
    const card = createEl(doc, 'div', 'ywpc-toggle ywpc-missing');
    card.setAttribute('data-ywpc-missing-control', controlUid(control));
    const main = createEl(doc, 'span', 'ywpc-toggle-main');
    const label = createEl(doc, 'span', 'ywpc-toggle-label');
    label.textContent = control.label || '缺项控件';
    const sub = createEl(doc, 'span', 'ywpc-toggle-sub');
    sub.textContent = control._missingReason || '当前预设里缺项；可删除或恢复默认布局。';
    append(main, label);
    append(main, sub);
    append(card, main);
    return card;
  }

  function renderControl(m, control, section) {
    if (!control) return null;
    if (control.kind === 'spacer') return makeSpaceBlock(false);
    if (control.kind === 'missing') return renderMissingControl(control);
    let node = null;
    switch (control.kind) {
      case 'toggle':
      case 'action':
        /* 2026-11-15：插小说防道歉无论落在哪个分组都保持「前面导航 + 后面拨钮」，
           不走整卡单按钮，防止点标题误切换。 */
        if (control.kind === 'toggle' && control.id === ID.niah) {
          node = renderShortcutCard(m, ID.niah, false, false, control.label, controlUid(control));
          break;
        }
        node = makeToggle(m, control.id, control.label, {
          sub: control.sub || '',
          missingText: '当前预设没有这项',
          realName: realNameFor(m, control.id),
        });
        break;
      case 'radio': node = renderRadio(m, control); break;
      case 'combo': node = renderCombo(m, control); break;
      case 'comboToggle': node = renderComboToggle(m, control); break;
      case 'multi': node = renderMulti(m, control); break;
      case 'word': node = renderWord(m); break;
      case 'toolboxFlag':
        node = (isAvailable(m, ID.niah) && layoutHasPromptControl(m, ID.niah))
          ? renderToolboxFlagCard(m, control) : null;
        break;
      case 'shortcuts': node = renderShortcuts(m, section); break;
      /* 说明控件不占位：空 info 也不画任何占位块。 */
      case 'info': node = null; break;
      default: node = null;
    }
    /* 钉首页时用来继承宽度：只在真正渲染出的控件根节点上带来源 uid。 */
    if (node) node.setAttribute('data-ywpc-source-uid', controlUid(control));
    return node;
  }

  /* 「其它要求」只是写作页的小标题：紧跟叙述风格组、只在后面确实还有控件时
     出现；不进布局、不算 toggle/radio、不可编辑，重复 rebuild 也只画一个。 */
  function renderWritingRestHeading() {
    const head = createEl(doc, 'p', 'ywpc-rest-head');
    head.setAttribute('data-ywpc-subhead', 'writing-rest');
    head.textContent = '其它要求';
    return head;
  }

  function renderCompactCommon(m, commonSection) {
    /* compact 首页不依赖布局里 common 是否还保留 shortcuts 控件：
       - 无显式钉选键：按派生 pins 画（四常用 + 段落整组 + 旧追加 + common 新增）；
       - 有显式钉选键：严格按保存顺序画（空数组就是空）；
       - 整理模式：只画无开关的排序行，绝不调用 apply*。 */
    const sec = createEl(doc, 'details', 'ywpc-sec');
    sec.setAttribute('data-ywpc-section', 'common');
    setSectionOpen(sec, false);
    append(sec, makeSectionHead(commonSection, m, []));
    const body = createEl(doc, 'div', 'ywpc-sec-body');
    if (homeEdit) append(body, renderPinEditor(m));
    else append(body, renderPinBoard(m, commonSection));
    append(sec, body);
    return sec;
  }

  function controlRendersInGrid(m, section, control) {
    if (!control) return false;
    if (control.kind === 'info') return false;
    if (control.kind === 'toolboxFlag') {
      return isAvailable(m, ID.niah) && layoutHasPromptControl(m, ID.niah);
    }
    return true;
  }

  function renderGridControlNode(m, section, control) {
    if (!control) return null;
    if (control.kind === 'spacer') return makeSpaceBlock(false);
    if (control.kind === 'info') return null;
    if ((section.id === 'writing' || section.id === 'plot')
      && (control.kind === 'toggle' || control.kind === 'action') && control.id) {
      return renderShortcutCard(m, control.id, false, false, control.label, controlUid(control));
    }
    if (section.id === 'think_meta' && control.kind === 'toggle' && control.id === ID.niah) {
      return renderShortcutCard(m, ID.niah, false, false, pinPromptLabel(m, ID.niah), controlUid(control));
    }
    const node = renderControl(m, control, section);
    if (node && control.kind === 'toolboxFlag') node.setAttribute('data-ywpc-source-uid', controlUid(control));
    return node;
  }

  /* 有显式宽度或空块的分组：统一十二格有序网格。没调整过的控件沿用各分区旧默认：
     写作/剧情的连续开关半行，think_meta 的 niah+随机头半行，其余整行。 */
  function renderOrderedGrid(m, section, visible) {
    const grid = createEl(doc, 'div', 'ywpc-grid12');
    grid.setAttribute('data-ywpc-section-grid', section.id);
    const narrationAt = section.id === 'writing'
      ? visible.findIndex(control => control && control.kind === 'radio' && control.key === NARRATION_RADIO_KEY)
      : -1;
    const showRestHeading = narrationAt >= 0
      && visible.slice(narrationAt + 1).some(control => controlRendersInGrid(m, section, control));
    visible.forEach((control, index) => {
      const node = renderGridControlNode(m, section, control);
      if (!node) return;
      appendGridCell(grid, node, controlCellWidth(section.id, control));
      if (index === narrationAt && showRestHeading) {
        const heading = renderWritingRestHeading();
        appendGridCell(grid, heading, 12);
      }
    });
    return grid;
  }

  function renderSection(m, section, index, total) {
    /* 编辑态统一由 buildBody 的可视化画布渲染；这里只画普通浏览态。 */
    if (editing) return null;
    const visible = visibleControls(m, section);
    if (!visible.length) return null;
    const customGrid = sectionHasCustomGrid(section);
    const sec = createEl(doc, 'details', 'ywpc-sec');
    sec.setAttribute('data-ywpc-section', section.id);
    setSectionOpen(sec, false);
    append(sec, makeSectionHead(section, m, visible));
    const body = createEl(doc, 'div', 'ywpc-sec-body');
    if (customGrid) {
      append(body, renderOrderedGrid(m, section, visible));
    } else if (section.id === 'writing') {
      /* 写作要求按 sectionsForOrder 的实际序列画：
         连续 toggle 组成一个两列小卡 grid；遇到 radio/其它控件就先 flush 再画。
         这样叙述风格组会留在鲜活条目的真实 order 位置，而不是被挪到整段末尾。 */
      let grid = null;
      const flushGrid = () => {
        if (!grid) return;
        append(body, grid);
        grid = null;
      };
      const restRenders = control => {
        if (!control) return false;
        if (control.kind === 'info') return false;
        if (control.kind === 'toolboxFlag') {
          return isAvailable(m, ID.niah) && layoutHasPromptControl(m, ID.niah);
        }
        return true;
      };
      const narrationAt = visible.findIndex(control => control
        && control.kind === 'radio' && control.key === NARRATION_RADIO_KEY);
      const showRestHeading = narrationAt >= 0
        && visible.slice(narrationAt + 1).some(restRenders);
      for (let index = 0; index < visible.length; index += 1) {
        const control = visible[index];
        if (control && (control.kind === 'toggle' || control.kind === 'action') && control.id) {
          if (!grid) {
            grid = createEl(doc, 'div', 'ywpc-shortcuts');
            grid.setAttribute('data-ywpc-shortcut-grid', '1');
          }
          append(grid, renderShortcutCard(m, control.id, false, false, control.label, controlUid(control)));
          continue;
        }
        flushGrid();
        const node = renderControl(m, control, section);
        if (node) append(body, node);
        if (index === narrationAt && showRestHeading) append(body, renderWritingRestHeading());
      }
      flushGrid();
    } else if (section.id === 'plot') {
      /* 四主线控件在完整预设页保持真实顺序，但连续的这几项复用写作段同款
         .ywpc-shortcuts 两列格；其它剧情控件照旧单独一行，不新造视觉。 */
      let grid = null;
      const flushGrid = () => {
        if (!grid) return;
        append(body, grid);
        grid = null;
      };
      for (const control of visible) {
        if (control && control.kind === 'toggle' && control.id
          && PLOT_LINE_TOGGLE_IDS.has(control.id)) {
          if (!grid) {
            grid = createEl(doc, 'div', 'ywpc-shortcuts');
            grid.setAttribute('data-ywpc-shortcut-grid', '1');
          }
          append(grid, renderShortcutCard(m, control.id, false, false, control.label, controlUid(control)));
          continue;
        }
        flushGrid();
        const node = renderControl(m, control, section);
        if (node) append(body, node);
      }
      flushGrid();
    } else if (section.id === 'think_meta') {
      /* 完整预设页保留原同行样式：niah 与随机头部固定同一行；
         随机头仍只走 deps，不冒充预设条目。首页 pin 的排列另走 renderPinBoard。 */
      const niahControl = visible.find(control => control
        && control.kind === 'toggle' && control.id === ID.niah) || null;
      const randControl = visible.find(control => control
        && control.kind === 'toolboxFlag' && control.flag === TOOLBOX_FLAG_RAND_HEAD) || null;
      let paired = false;
      for (const control of visible) {
        if (randControl && control === randControl && niahControl && !paired) continue;
        if (niahControl && control === niahControl && randControl) {
          append(body, renderInlinePair(
            renderShortcutCard(m, ID.niah, false, false, pinPromptLabel(m, ID.niah)),
            renderToolboxFlagCard(m, randControl),
          ));
          paired = true;
          continue;
        }
        const node = renderControl(m, control, section);
        if (node) append(body, node);
      }
    } else {
      for (const control of visible) {
        const node = renderControl(m, control, section);
        if (node) append(body, node);
      }
    }
    append(sec, body);
    return sec;
  }

  function buildBody(m) {
    clearNode(bodyEl);
    const sourceSections = activeSections(m) || [];
    let sections = 0;
    if (compact) {
      const commonSection = sourceSections.find(section => section.id === 'common') || {
        id: 'common',
        label: '常用',
        icon: '⭐',
        controls: [{ kind: 'shortcuts' }],
      };
      append(bodyEl, renderCompactCommon(m, commonSection));
      sections += 1;
    } else {
      if (contentEdit) {
        append(bodyEl, renderContentEditor());
        return;
      }
      if (contentPick) append(bodyEl, renderContentPicker(m));
      if (editing) {
        append(bodyEl, renderLayoutToolbar(m));
        ensureEditSelection();
        append(bodyEl, renderEditGroupNav(m));
        const editList = editSectionsOfModel();
        const editIndex = editList.findIndex(section => section.id === editSectionId);
        if (editIndex >= 0) {
          append(bodyEl, renderEditCanvas(m, editList[editIndex], editIndex, editList.length));
          sections = 1;
        } else {
          const empty = createEl(doc, 'p', 'ywpc-empty');
          empty.textContent = '还没有分组；先点右上「⋯」新建一个分组。';
          append(bodyEl, empty);
        }
      } else {
        if (pinMode && !editing) {
          const hint = createEl(doc, 'div', 'ywpc-pin-mode-hint');
          hint.setAttribute('data-ywpc-pin-hint', '1');
          const hintText = createEl(doc, 'span', 'ywpc-pin-mode-text');
          hintText.textContent = '钉选模式：点条目、选择组或组合开关钉到首页常用；选择组会整组带小标题放上去。这一步不会切换开关。';
          append(hint, hintText);
          if (!headerEl) {
            const cancel = createEl(doc, 'button', 'ywpc-edit-btn');
            cancel.type = 'button';
            cancel.textContent = '取消钉选';
            cancel.setAttribute('data-ywpc-action', 'pin-cancel');
            cancel.setAttribute('data-ywpc-focus-key', 'pin:cancel');
            append(hint, cancel);
          }
          append(bodyEl, hint);
        }
        if (m.scenarioFound && !headerEl) append(bodyEl, renderLayoutEntry(m));
        for (let index = 0; index < sourceSections.length; index += 1) {
          const section = sourceSections[index];
          const node = renderSection(m, section, index, sourceSections.length);
          if (node) {
            append(bodyEl, node);
            sections += 1;
          }
        }
      }
    }
    if (!sections) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = m.scenarioFound
        ? '当前预设里没有本模块支持的条目；可以换回 V1028，或从常用里添加你能用的快捷。'
        : '没读到当前预设的条目列表（可能还没选预设）；先选一份预设再看。';
      append(bodyEl, empty);
    }
  }

  function captureFocus() {
    try {
      const active = doc.activeElement;
      if (!active || !root || !root.contains(active)) return null;
      const key = active.getAttribute && active.getAttribute('data-ywpc-focus-key');
      if (!key) return null;
      const out = { key, start: null, end: null, value: null };
      if (typeof active.selectionStart === 'number') {
        out.start = active.selectionStart;
        out.end = active.selectionEnd;
      }
      if (typeof active.value === 'string') out.value = active.value;
      return out;
    } catch (e) {
      return null;
    }
  }

  function restoreFocus(saved) {
    if (!saved || !root) return;
    try {
      const nodes = root.querySelectorAll('[data-ywpc-focus-key]');
      let target = null;
      for (const node of nodes) {
        if (node.getAttribute('data-ywpc-focus-key') === saved.key) { target = node; break; }
      }
      if (!target) return;
      if (typeof target.focus === 'function') target.focus({ preventScroll: true });
      if (saved.value !== null && typeof target.value === 'string' && target.value !== saved.value && saved.key === 'picker-search') {
        target.value = saved.value;
      }
      if (saved.start !== null && typeof target.setSelectionRange === 'function') {
        target.setSelectionRange(saved.start, saved.end);
      }
    } catch (e) { /* 焦点恢复失败不影响功能 */ }
  }

  function isScrollableNode(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      const max = (Number(node.scrollHeight) || 0) - (Number(node.clientHeight) || 0);
      if (max > 1) return true;
      if (win && typeof win.getComputedStyle === 'function') {
        const style = win.getComputedStyle(node);
        const overflowY = style && style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && max > 0) return true;
      }
    } catch (e) { /* 读不到就按不可滚处理 */ }
    return false;
  }

  /* 真正会滚的祖先链（含 CC 的 .ywcc-scroll）；只恢复 container/root 会漏掉外层滚动区。 */
  function scrollChainOf(node) {
    const out = [];
    let cur = node ? node.parentElement : null;
    while (cur && cur.nodeType === 1) {
      if (isScrollableNode(cur)) out.push({ el: cur, top: Number(cur.scrollTop) || 0 });
      cur = cur.parentElement;
    }
    return out;
  }

  function nearestScrollParentOf(node) {
    let cur = node ? node.parentElement : null;
    while (cur && cur.nodeType === 1) {
      if (isScrollableNode(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function anchorSelectorForSection(sectionId) {
    return 'details[data-ywpc-section="' + String(sectionId).replace(/"/g, '\\"') + '"] > summary.ywpc-sec-head';
  }

  /* 一次性锚点：进入编辑 → 当前组 summary 保持在原位置，换成新画布工具栏；
     退出编辑 → 画布工具栏换成该组 summary；设置开关 → 原块保持原位置。 */
  function captureScrollAnchor() {
    if (!root) return null;
    let node = null;
    let targetSelector = '';
    if (pendingEntrySection) {
      node = root.querySelector(anchorSelectorForSection(pendingEntrySection));
      targetSelector = '[data-ywpc-layout-editor]';
    } else if (pendingExitSection) {
      node = root.querySelector('[data-ywpc-layout-editor]');
      targetSelector = anchorSelectorForSection(pendingExitSection);
    } else if (editing) {
      const uid = editOpenUid || editSelectedUid;
      if (uid) {
        const selector = '[data-ywpc-edit-block="' + uid.replace(/"/g, '\\"') + '"]';
        node = root.querySelector(selector);
        targetSelector = selector;
      }
    }
    if (!node) return null;
    const scroller = nearestScrollParentOf(node);
    if (!scroller) return null;
    let offset = 0;
    try {
      offset = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    } catch (e) { offset = 0; }
    return { scroller, offset, targetSelector };
  }

  function captureScroll() {
    try {
      return {
        container: containerEl ? Number(containerEl.scrollTop) || 0 : 0,
        root: root ? Number(root.scrollTop) || 0 : 0,
        chain: scrollChainOf(root),
        anchor: captureScrollAnchor(),
      };
    } catch (e) {
      return { container: 0, root: 0, chain: [], anchor: null };
    }
  }

  function restoreScroll(saved) {
    try {
      if (containerEl && saved) containerEl.scrollTop = saved.container;
      if (root && saved) root.scrollTop = saved.root;
      if (saved && Array.isArray(saved.chain)) {
        for (const entry of saved.chain) {
          if (!entry || !entry.el) continue;
          try { entry.el.scrollTop = entry.top; } catch (e) { /* 单个滚动区失败不影响其它 */ }
        }
      }
    } catch (e) { /* 滚动恢复失败不影响功能 */ }
    if (!saved || !saved.anchor) return;
    const anchor = saved.anchor;
    const apply = () => {
      try {
        const scroller = anchor.scroller;
        if (!scroller || !root) return;
        const target = root.querySelector(anchor.targetSelector);
        if (!target) return;
        const box = scroller.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        const delta = (rect.top - box.top) - anchor.offset;
        if (Math.abs(delta) < 1) return;
        scroller.scrollTop = Math.max(0, (Number(scroller.scrollTop) || 0) + delta);
      } catch (e) { /* 锚点校正失败不回顶 */ }
    };
    apply();
    /* 浏览器 scroll anchoring 可能晚一帧再挪；只补一次，避免来回抖。 */
    try {
      const raf = win && typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame : null;
      if (raf) raf(() => { if (!disposed) apply(); });
    } catch (e) { /* 没有 rAF 就算了 */ }
  }

  function sectionOpen(node) {
    return !!(node && (node.open === true || (typeof node.hasAttribute === 'function' && node.hasAttribute('open'))));
  }

  function setSectionOpen(node, open) {
    if (!node) return;
    try {
      node.open = !!open;
      if (open) node.setAttribute('open', '');
      else node.removeAttribute('open');
    } catch (e) { /* 老浏览器只有属性也能用 */ }
  }

  function captureOpenSections() {
    const out = {};
    if (!root) return out;
    for (const node of root.querySelectorAll('details[data-ywpc-section]')) {
      out[node.getAttribute('data-ywpc-section')] = sectionOpen(node);
    }
    return out;
  }

  /* 组内「成员与选择关系」展开态按控件 uid 记住；宽度/选项空块重画后不收起，
     连续编辑不用重新展开。 */
  function captureOpenMemberDetails() {
    const out = {};
    if (!root) return out;
    for (const node of root.querySelectorAll('details[data-ywpc-member-details]')) {
      out[node.getAttribute('data-ywpc-member-details')] = sectionOpen(node);
    }
    return out;
  }

  function restoreOpenMemberDetails(map) {
    if (!root || !map) return;
    for (const node of root.querySelectorAll('details[data-ywpc-member-details]')) {
      const uid = node.getAttribute('data-ywpc-member-details');
      if (Object.prototype.hasOwnProperty.call(map, uid)) setSectionOpen(node, !!map[uid]);
    }
  }

  function restoreOpenSections(map, samePreset) {
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll('details[data-ywpc-section]'));
    if (homeEdit && homeEditNeedsOpen) {
      /* 整理模式首次绘制必须看见 common 里的排序行；只影响这次展开，不保存 fold 偏好。 */
      homeEditNeedsOpen = false;
      for (const node of nodes) {
        setSectionOpen(node, node.getAttribute('data-ywpc-section') === 'common');
      }
      return;
    }
    if (samePreset) {
      /* 同级手风琴：重建后最多保留一个展开；原本全收着就保持全收。 */
      const openId = Object.keys(map || {}).reverse().find(id => map[id]) || '';
      for (const node of nodes) {
        setSectionOpen(node, !!openId && node.getAttribute('data-ywpc-section') === openId);
      }
      return;
    }
    /* 换预设时默认只展开第一组（compact 只有常用，也展开）。 */
    const defaultId = compact ? 'common' : (nodes[0] ? nodes[0].getAttribute('data-ywpc-section') : '');
    for (const node of nodes) {
      setSectionOpen(node, node.getAttribute('data-ywpc-section') === defaultId);
    }
  }

  function findScrollParent(start) {
    let node = start;
    while (node && node.nodeType === 1) {
      try {
        if ((Number(node.scrollHeight) || 0) > (Number(node.clientHeight) || 0) + 1) return node;
      } catch (e) { /* 忽略 */ }
      node = node.parentElement;
    }
    return null;
  }

  /* 只在作者明确点开某个分组时把新组 summary 滚到 panel 顶部；
     刷新 / 恢复展开 / 切开关都不会调用这里。 */
  function scrollSummaryToTop(details) {
    if (!details) return;
    try {
      const head = details.querySelector('summary.ywpc-sec-head');
      if (!head) return;
      const scroller = findScrollParent(containerEl || details);
      if (scroller) {
        const top = (Number(scroller.scrollTop) || 0)
          + head.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop = Math.max(0, top);
        return;
      }
      if (typeof head.scrollIntoView === 'function') head.scrollIntoView({ block: 'start', behavior: 'auto' });
    } catch (e) { /* 定位失败不影响展开/开关 */ }
  }

  function toggleAccordion(details) {
    if (!details) return;
    const open = !sectionOpen(details);
    for (const node of root ? root.querySelectorAll('details[data-ywpc-section]') : []) {
      setSectionOpen(node, false);
    }
    if (open) {
      setSectionOpen(details, true);
      scrollSummaryToTop(details);
    }
  }

  function rebuild(m) {
    if (!root || !bodyEl) return;
    const samePreset = !!lastPresetName && !!m && m.name === lastPresetName;
    const openSections = captureOpenSections();
    const openMembers = captureOpenMemberDetails();
    if (m && m.name !== lastPresetName) {
      lastPresetName = m.name;
      wordDraft = null;
      wordToken = null;
      wordError = '';
      wordField = 'min';
      wordLastRange = null;
    }
    if (m) lastScenarioRef = m.scenario || null;
    const focus = captureFocus();
    const scroll = captureScroll();
    const openAfterBuild = pendingOpenSection;
    pendingEntrySection = '';
    pendingExitSection = '';
    pendingOpenSection = '';
    buildBody(m);
    lastKey = modelKey(m);
    restoreOpenSections(openSections, samePreset);
    if (openAfterBuild && !editing && root) {
      /* 退出编辑后回到原来那一组；不把所有组都收起。 */
      for (const node of root.querySelectorAll('details[data-ywpc-section]')) {
        setSectionOpen(node, node.getAttribute('data-ywpc-section') === openAfterBuild);
      }
    }
    restoreOpenMemberDetails(openMembers);
    syncUI(m);
    restoreScroll(scroll);
    restoreFocus(focus);
    renderHeaderActions();
  }

  /* ------------------------------------------------------------------------
     同步（不重建 DOM）
     ------------------------------------------------------------------------ */
  function syncUI(m) {
    if (!root || !m) return;
    if (!bodyEl) return;

    const toggleNodes = root.querySelectorAll('[data-ywpc-toggle]');
    for (const node of toggleNodes) {
      const id = node.getAttribute('data-ywpc-toggle');
      const available = isAvailable(m, id);
      const shortcutNode = typeof node.hasAttribute === 'function' && node.hasAttribute('data-ywpc-shortcut-toggle');
      const ordinary = !shortcutNode || isOrdinaryPrompt(m.promptById.get(id));
      const usable = available && ordinary;
      const on = usable && isOn(m, id);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
      if (!usable) {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.classList.add('ywpc-missing');
      } else if (THEATER_CHILD_SET.has(id) && !isOn(m, ID.theaterParent)) {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.classList.remove('ywpc-missing');
        if (on) node.setAttribute('data-ywpc-conflict', '1');
        else node.removeAttribute('data-ywpc-conflict');
      } else {
        node.disabled = false;
        node.removeAttribute('aria-disabled');
        node.classList.remove('ywpc-missing');
        node.removeAttribute('data-ywpc-conflict');
      }
      const sub = node.querySelector('[data-ywpc-sub]');
      if (sub) {
        const fallback = sub.getAttribute('data-ywpc-sub-default') || '';
        if (!available) sub.textContent = '当前预设没有这项';
        else if (!ordinary) sub.textContent = '系统条目，不可切换';
        else sub.textContent = fallback;
      }
      /* 2026-11-15：并列卡（插小说防道歉）的状态字在外层 wrapper 的导航按钮里，
         拨钮本体没有 [data-ywpc-sub]，这里一并同步，避免不重建刷新时状态字过期。 */
      const splitCard = typeof node.closest === 'function' ? node.closest('.ywpc-split') : null;
      const nav = splitCard ? splitCard.querySelector('.ywpc-nav-btn') : null;
      if (nav) nav.classList.toggle('ywpc-missing', !usable);
      const navSub = nav ? nav.querySelector('[data-ywpc-sub]') : null;
      if (navSub) {
        const navFallback = navSub.getAttribute('data-ywpc-sub-default') || '';
        if (!available) navSub.textContent = '当前预设没有这项';
        else if (!ordinary) navSub.textContent = '系统条目，不可切换';
        else navSub.textContent = navFallback;
      }
    }

    const toolboxNodes = root.querySelectorAll('[data-ywpc-toolbox-flag]');
    for (const node of toolboxNodes) {
      const flag = node.getAttribute('data-ywpc-toolbox-flag');
      const usable = canUseToolboxFlag(flag);
      const on = usable && readToolboxFlag(flag);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
      if (!usable) {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.classList.add('ywpc-missing');
      } else {
        node.disabled = false;
        node.removeAttribute('aria-disabled');
        node.classList.remove('ywpc-missing');
      }
      const sub = node.querySelector('[data-ywpc-sub]');
      if (sub) {
        const textValue = usable ? (on ? '已开启' : '已关闭') : '工具箱开关接口未就绪';
        sub.textContent = textValue;
        sub.setAttribute('data-ywpc-sub-default', textValue);
      }
      /* 2026-11-15：随机头部并列卡的状态字在导航按钮里，这里一并同步。 */
      const splitFlagCard = typeof node.closest === 'function' ? node.closest('.ywpc-split') : null;
      const navFlagSub = splitFlagCard ? splitFlagCard.querySelector('.ywpc-nav-btn [data-ywpc-sub]') : null;
      if (navFlagSub) {
        const navTextValue = usable ? (on ? '已开启' : '已关闭') : '工具箱开关接口未就绪';
        navFlagSub.textContent = navTextValue;
        navFlagSub.setAttribute('data-ywpc-sub-default', navTextValue);
      }
    }

    const radioNodes = root.querySelectorAll('[data-ywpc-radio]');
    for (const node of radioNodes) {
      const key = node.getAttribute('data-ywpc-radio');
      const value = node.getAttribute('data-ywpc-value');
      const def = definitionForKey(m, key, ['radio', 'combo']);
      if (!def) continue;
      const option = def.options.find(x => x.value === value);
      const available = option ? option.ids.every(id => isAvailable(m, id)) : false;
      const selected = selectedRadioValue(m, def);
      node.setAttribute('aria-checked', selected === value ? 'true' : 'false');
      if (option && option.ids.length === 0) {
        const usable = anyAvailable(m, def.allIds);
        node.disabled = !usable;
        if (!usable) node.setAttribute('aria-disabled', 'true');
        else node.removeAttribute('aria-disabled');
      } else if (!available) {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.classList.add('ywpc-missing');
      } else {
        node.disabled = false;
        node.removeAttribute('aria-disabled');
        node.classList.remove('ywpc-missing');
      }
    }

    const comboNodes = root.querySelectorAll('[data-ywpc-combo]');
    for (const node of comboNodes) {
      const key = node.getAttribute('data-ywpc-combo');
      const value = node.getAttribute('data-ywpc-value');
      const def = definitionForKey(m, key, ['radio', 'combo']);
      if (!def) continue;
      const option = def.options.find(x => x.value === value);
      const selected = selectedComboValue(m, def);
      node.setAttribute('aria-checked', selected === value ? 'true' : 'false');
      if (!option || !option.ids.length || !option.ids.every(id => isAvailable(m, id))) {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.classList.add('ywpc-missing');
      } else {
        node.disabled = false;
        node.removeAttribute('aria-disabled');
        node.classList.remove('ywpc-missing');
      }
    }

    const comboToggleNodes = root.querySelectorAll('[data-ywpc-combo-toggle]');
    for (const node of comboToggleNodes) {
      const key = node.getAttribute('data-ywpc-combo-toggle');
      const def = definitionForKey(m, key, ['comboToggle']);
      if (!def) continue;
      const status = comboStatus(m, def.members);
      const allAvailable = status.available.length === def.members.length && status.available.length > 0;
      node.setAttribute('aria-checked', status.allOn ? 'true' : (status.someOn ? 'mixed' : 'false'));
      if (!allAvailable) {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.classList.add('ywpc-missing');
      } else {
        node.disabled = false;
        node.removeAttribute('aria-disabled');
        node.classList.remove('ywpc-missing');
      }
      const sub = node.querySelector('[data-ywpc-sub]');
      if (sub) {
        sub.textContent = !allAvailable
          ? '部分条目不可用 · 已局部停用'
          : (sub.hasAttribute('data-ywpc-shortcut-combo')
            ? status.status
            : (def.sub ? def.sub + ' · ' : '') + status.status);
      }
    }

    for (const node of root.querySelectorAll('[data-ywpc-pin-card]')) {
      const pin = decodeHomePin(node.getAttribute('data-ywpc-pin-card'));
      if (!pin) continue;
      const resolved = resolveHomePin(m, pin);
      node.setAttribute('aria-checked', resolved.on ? 'true' : 'false');
      if (!resolved.available) {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.classList.add('ywpc-missing');
      } else {
        node.disabled = false;
        node.removeAttribute('aria-disabled');
        node.classList.remove('ywpc-missing');
      }
      const sub = node.querySelector('[data-ywpc-sub]');
      if (sub) {
        sub.textContent = resolved.sub || sub.getAttribute('data-ywpc-sub-default') || '';
      }
    }

    for (const row of root.querySelectorAll('[data-ywpc-pin-row]')) {
      const pin = decodeHomePin(row.getAttribute('data-ywpc-pin-row'));
      if (!pin) continue;
      const resolved = resolveHomePin(m, pin);
      if (resolved.available) row.classList.remove('ywpc-missing');
      else row.classList.add('ywpc-missing');
      const label = row.querySelector('.ywpc-pin-label');
      if (label) label.textContent = resolved.label || homePinKey(pin);
      const sub = row.querySelector('.ywpc-pin-sub');
      if (sub) sub.textContent = resolved.sub || '';
    }

    for (const note of root.querySelectorAll('[data-ywpc-conflict-note]')) {
      const key = note.getAttribute('data-ywpc-conflict-note');
      const def = definitionForKey(m, key, ['radio', 'combo']);
      if (!def) continue;
      const available = def.allIds.filter(id => isAvailable(m, id));
      const conflict = comboConflict(m, def);
      const masterMissing = def.masterId && !isAvailable(m, def.masterId);
      if (!available.length) {
        note.textContent = '当前预设没有这一组条目，已局部禁用。';
        note.classList.add('ywpc-warn');
      } else if (conflict) {
        note.textContent = '外部同时开了多项，只提示，不自动改；点一个选项会改成单选。';
        note.classList.add('ywpc-warn');
      } else if (masterMissing) {
        note.textContent = '选项/备忘录的隐藏总开关不在当前预设里，可能不会渲染。';
        note.classList.add('ywpc-warn');
      } else {
        note.textContent = '';
        note.classList.remove('ywpc-warn');
      }
    }

    for (const note of root.querySelectorAll('[data-ywpc-combo-note]')) {
      const key = note.getAttribute('data-ywpc-combo-note');
      const def = definitionForKey(m, key, ['radio', 'combo']);
      if (!def) continue;
      if (comboConflict(m, def)) {
        note.textContent = '当前是外部混搭，只提示；点一个组合会改成标准组合（不碰破限/防道歉/思考长度）。';
        note.classList.add('ywpc-warn');
      } else {
        note.textContent = '';
        note.classList.remove('ywpc-warn');
      }
    }

    const theaterNote = root.querySelector('[data-ywpc-theater-note]');
    if (theaterNote) {
      const parentAvailable = isAvailable(m, ID.theaterParent);
      const parentOn = isOn(m, ID.theaterParent);
      const conflicts = THEATER_CHILDREN.filter(id => isAvailable(m, id) && isOn(m, id)).length;
      if (!parentAvailable) {
        theaterNote.textContent = '固定剧场父项不在当前预设里；子项全部局部禁用。';
        theaterNote.classList.add('ywpc-warn');
      } else if (!parentOn && conflicts) {
        theaterNote.textContent = '父项关闭，但外部仍有 ' + conflicts + ' 个子项为开；只提示，不自动改。';
        theaterNote.classList.add('ywpc-warn');
      } else {
        /* 2026-11-13：固定剧场父项关闭不再解释（刷新）。 */
        theaterNote.textContent = '';
        theaterNote.classList.remove('ywpc-warn');
      }
    }

    syncWordUI(m);

    /* 2026-11-13：分组 XX/XX 统计节点已移除，刷新时不再写。 */
    updateStatus(m);
  }

  function statusText(m) {
    if (!m) return '';
    if (!m.scenarioFound) return '没读到当前预设的条目列表（可能还没选预设）；先选一份预设再看。';
    if (compact) return '';
    const name = m.name || '未命名预设';
    const edit = editing ? ' · 正在编辑布局（未保存）' : '';
    return '当前预设：' + name + edit;
  }

  function setStatus(value) {
    if (!statusEl) return;
    statusEl.textContent = text(value);
    if (compact) statusEl.hidden = !statusEl.textContent;
  }

  function updateStatus(m) {
    if (!m) return;
    setStatus(statusText(m));
    if (badgeEl) {
      if (!m.scenarioFound) {
        badgeEl.textContent = '未连接';
        badgeEl.setAttribute('data-ywpc-badge', 'compat');
      } else if (m.isV1028) {
        badgeEl.textContent = 'V1028';
        badgeEl.setAttribute('data-ywpc-badge', 'v1028');
      } else {
        badgeEl.textContent = '兼容';
        badgeEl.setAttribute('data-ywpc-badge', 'compat');
      }
      /* 正常页不再把 V1028/兼容 当技术 badge 展示；缺项/未连接仍保留。 */
      badgeEl.hidden = !!m.scenarioFound;
    }
    if (root) root.setAttribute('data-ywpc-state', m.scenarioFound ? 'ready' : 'no-scenario');
  }

  function showToast(message, tone) {
    if (!toastEl) return;
    toastEl.textContent = text(message);
    toastEl.setAttribute('data-tone', tone || 'info');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastTimer = 0;
      if (toastEl) {
        toastEl.textContent = '';
        toastEl.removeAttribute('data-tone');
      }
    }, 4200);
  }

  /* ------------------------------------------------------------------------
     操作：开关 / 单选 / 组合 / 快捷 / 字数
     ------------------------------------------------------------------------ */
  function ensureWritable() {
    const m = model || buildModel();
    if (!m.scenarioFound) {
      showToast('没读到当前预设的条目列表，这次没有改任何条目。', 'warn');
      return null;
    }
    const token = captureToken();
    if (!tokenCurrent(token)) {
      showToast('预设刚被切换，这次没有改任何条目。', 'warn');
      return null;
    }
    return token;
  }

  function applyToggle(id, want) {
    const m = model || buildModel();
    const def = TOGGLE_DEF_BY_ID.get(id);
    if (!def && !isOrdinaryPrompt(m.promptById.get(id))) {
      showToast('这项不是可切换条目，已忽略。', 'warn');
      return false;
    }
    if (!isAvailable(m, id)) {
      showToast('当前预设没有这项，已局部停用。', 'warn');
      return false;
    }
    const token = ensureWritable();
    if (!token) return false;
    const map = {};

    if (id === ID.theaterParent) {
      const children = THEATER_CHILDREN.filter(cid => isAvailable(m, cid));
      if (isOn(m, id)) {
        const memory = {};
        for (const cid of children) memory[cid] = isOn(m, cid);
        updateTheaterMemory(memory);
        map[id] = false;
        for (const cid of children) map[cid] = false;
      } else {
        map[id] = true;
        const memory = m.theaterMemory || {};
        for (const cid of children) map[cid] = memory[cid] === true;
      }
    } else if (THEATER_CHILD_SET.has(id)) {
      if (!isOn(m, ID.theaterParent)) {
        showToast('先开固定剧场 2 的头部，子项才生效。', 'warn');
        return false;
      }
      map[id] = !!want;
      updateTheaterMemory({ [id]: !!want });
    } else {
      map[id] = !!want;
      if (want && def && def.masterId && isAvailable(m, def.masterId)) {
        map[def.masterId] = true;
      }
    }

    let changed = false;
    for (const key of Object.keys(map)) {
      if (isAvailable(m, key) && m.toggles[key] !== map[key]) changed = true;
    }
    if (!changed) return true;
    return writeToggleMap(map, 'ywpc-toggle', token);
  }

  function applyRadio(key, value) {
    const m = model || buildModel();
    const def = definitionForKey(m, key, ['radio']);
    if (!def || def.kind !== 'radio') return false;
    const option = def.options.find(x => x.value === value);
    if (!option) return false;
    if (option.ids.length && !option.ids.every(id => isAvailable(m, id))) {
      showToast('这个选项在当前预设里缺条目，已局部停用。', 'warn');
      return false;
    }
    const token = ensureWritable();
    if (!token) return false;
    const clearing = option.ids.length > 0 && selectedRadioValue(m, def) === value;
    const selected = new Set(clearing ? [] : option.ids);
    const map = {};
    for (const id of def.allIds) {
      if (isAvailable(m, id)) map[id] = selected.has(id);
    }
    if (!clearing && def.masterId && value !== 'none' && isAvailable(m, def.masterId)) map[def.masterId] = true;
    let changed = false;
    for (const id of Object.keys(map)) {
      if (m.toggles[id] !== map[id]) changed = true;
    }
    if (!changed) return true;
    return writeToggleMap(map, 'ywpc-radio', token);
  }

  /* 支持取消的单选组：点当前已选项 = 全部关，不另加“不开”选项。 */
  function applyRadioClear(key) {
    const m = model || buildModel();
    const def = definitionForKey(m, key, ['radio']);
    if (!def || def.kind !== 'radio') return false;
    const token = ensureWritable();
    if (!token) return false;
    const map = {};
    for (const id of def.allIds) {
      if (isAvailable(m, id)) map[id] = false;
    }
    let changed = false;
    for (const id of Object.keys(map)) {
      if (m.toggles[id] !== false) changed = true;
    }
    if (!changed) return true;
    return writeToggleMap(map, 'ywpc-radio-clear', token);
  }

  function applyCombo(key, value) {
    const m = model || buildModel();
    const def = definitionForKey(m, key, ['combo']);
    if (!def || def.kind !== 'combo') return false;
    const option = def.options.find(x => x.value === value);
    if (!option) return false;
    if (!option.ids.length || !option.ids.every(id => isAvailable(m, id))) {
      showToast('这个组合在当前预设里缺条目，已局部停用。', 'warn');
      return false;
    }
    const token = ensureWritable();
    if (!token) return false;
    const selected = new Set(selectedComboValue(m, def) === value ? [] : option.ids);
    const map = {};
    for (const id of def.allIds) {
      if (isAvailable(m, id)) map[id] = selected.has(id);
    }
    let changed = false;
    for (const id of Object.keys(map)) {
      if (m.toggles[id] !== map[id]) changed = true;
    }
    if (!changed) return true;
    return writeToggleMap(map, 'ywpc-combo', token);
  }

  function applyComboToggle(key) {
    const m = model || buildModel();
    const def = definitionForKey(m, key, ['comboToggle']);
    if (!def) return false;
    if (!def.members.every(id => isAvailable(m, id))) {
      showToast('这个组合有缺项，已局部停用；先换回 V1028 或补齐条目。', 'warn');
      return false;
    }
    const token = ensureWritable();
    if (!token) return false;
    const allOn = def.members.every(id => isOn(m, id));
    const map = {};
    for (const id of def.members) map[id] = !allOn;
    return writeToggleMap(map, 'ywpc-combo-toggle', token);
  }

  function addShortcut(id) {
    const m = model || buildModel();
    if (!isShortcutToggleable(m, id)) {
      showToast('当前预设没有可切换的这项，不能加入常用。', 'warn');
      return false;
    }
    const settings = readSettings();
    if (!settings) {
      showToast('设置还没准备好，暂时不能加快捷。', 'warn');
      return false;
    }
    const hidden = commonHiddenSet(settings);
    if (hidden.has(id)) {
      settings[COMMON_HIDDEN_SETTINGS_KEY] = Array.isArray(settings[COMMON_HIDDEN_SETTINGS_KEY])
        ? settings[COMMON_HIDDEN_SETTINGS_KEY].filter(x => x !== id) : [];
      appendHomePinForCommon(settings, { type: 'prompt', id }, true);
      persistSettings();
      showToast('已恢复到常用；条目开关值没有改动。', 'ok');
      refresh({ force: true, reason: 'shortcut-unhide' });
      return true;
    }
    if (DEFAULT_COMMON_IDS.includes(id)) {
      showToast('已经在常用里了。', 'info');
      return false;
    }
    const list = Array.isArray(settings.presetControlShortcuts)
      ? settings.presetControlShortcuts.slice()
      : [];
    if (list.includes(id)) {
      showToast('已经在常用里了。', 'info');
      return false;
    }
    list.push(id);
    settings.presetControlShortcuts = list;
    /* common 追加提交路径：显式 pins 存在时同步追加首页 pin；没有显式 pins 时
       仍走派生，不创建设置键。重复追加允许，已有实例 uid/顺序不动。 */
    appendHomePinForCommon(settings, { type: 'prompt', id }, true);
    persistSettings();
    showToast('已加入常用；条目开关值没有改动。', 'ok');
    refresh({ force: true, reason: 'shortcut-add' });
    return true;
  }

  function removeShortcut(id) {
    const settings = readSettings();
    if (!settings) return false;
    if (DEFAULT_COMMON_IDS.includes(id)) {
      const hidden = commonHiddenSet(settings);
      hidden.add(id);
      settings[COMMON_HIDDEN_SETTINGS_KEY] = Array.from(hidden);
      removeCommonHomePin(settings, id);
      persistSettings();
      showToast('已移出常用；条目开关值没有改动。', 'ok');
      refresh({ force: true, reason: 'shortcut-hide' });
      return true;
    }
    const list = Array.isArray(settings.presetControlShortcuts)
      ? settings.presetControlShortcuts
      : [];
    const next = list.filter(x => x !== id);
    if (next.length === list.length) return false;
    settings.presetControlShortcuts = next;
    removeCommonHomePin(settings, id);
    persistSettings();
    showToast('已移出常用；条目开关值没有改动。', 'ok');
    refresh({ force: true, reason: 'shortcut-remove' });
    return true;
  }

  /* ------------------------------------------------------------------------
     首页常用钉选：写入 / 排序 / 移除 / compact 卡片执行
     ------------------------------------------------------------------------ */
  function effectivePinsOfModel(m) {
    const pins = (m && Array.isArray(m.homePins) ? m.homePins : []).slice();
    return { pins, stored: !!(m && m.homePinsStored) };
  }

  function rollbackHomePinSetting(settings, key, before, ours) {
    const store = homePinStoreOf(settings);
    if (!store) return false;
    const current = store[key];
    /* 只撤回“这次自己写进去的那份”；中间已有更新的值就不覆盖。 */
    if (ours !== undefined && current !== ours) return false;
    if (before === undefined) delete store[key];
    else store[key] = before;
    return true;
  }

  async function persistHomePins(nextPins, message) {
    const settings = readSettings();
    if (!settings) {
      showToast('设置还没准备好，首页常用没有保存。', 'warn');
      return false;
    }
    const token = captureToken();
    if (!token || !token.scenario || !tokenCurrent(token) || !token.name) {
      showToast('当前预设身份没核稳，首页常用没有保存；请回到当前预设再试。', 'warn');
      return false;
    }
    /* 用户手动排列的顺序原样落盘；不再按 niah/常用默认做二次归位。 */
    const clean = normalizeHomePins(nextPins);
    const key = presetLayoutKey(token.name, CHARACTER_ID);
    const store = homePinStoreOf(settings);
    const before = store && Object.prototype.hasOwnProperty.call(store, key)
      ? JSON.parse(JSON.stringify(store[key]))
      : undefined;
    if (!homePinStoreOf(settings)) settings[HOME_PINS_SETTINGS_KEY] = {};
    const ours = clean.map(pin => Object.assign({}, pin));
    settings[HOME_PINS_SETTINGS_KEY][key] = ours;
    try {
      if (typeof deps.saveSettingsNow === 'function') {
        /* 真实宿主：saveSettings 是异步落盘；await 到它完成再回报成功。 */
        const result = await deps.saveSettingsNow();
        if (result === false) throw new Error('保存接口返回失败');
      } else if (typeof deps.saveSettings === 'function') {
        deps.saveSettings();
      } else {
        throw new Error('设置保存接口未就绪');
      }
    } catch (error) {
      rollbackHomePinSetting(settings, key, before, ours);
      showToast('首页常用保存失败：' + humanError(error) + '；这次改动已撤回，页面状态还在。', 'error');
      return false;
    }
    if (!tokenCurrent(token)) {
      /* 保存等待期间预设被切换：只撤回本次这个键，避免错存到别的预设视图。 */
      rollbackHomePinSetting(settings, key, before, ours);
      try {
        if (typeof deps.saveSettingsNow === 'function') {
          const result = deps.saveSettingsNow();
          if (result && typeof result.then === 'function') result.catch(() => {});
        } else if (typeof deps.saveSettings === 'function') deps.saveSettings();
      } catch (e) { /* 回滚尽力而为 */ }
      showToast('保存过程中预设被切换，这次首页常用已撤回。', 'warn');
      return false;
    }
    if (message) showToast(message, 'ok');
    return true;
  }

  function finishPinMode() {
    const done = pinOnDone;
    pinMode = false;
    if (typeof done === 'function') {
      /* 保存成功后才回首页；用微任务，避免打断这次点击 / 保存回调。 */
      Promise.resolve().then(() => {
        try { done(); } catch (e) { /* 回调失败不影响已保存的数据 */ }
      });
      return;
    }
    refresh({ force: true, reason: 'pin-mode-done' });
  }

  function cancelPinMode() {
    if (!pinMode) return false;
    finishPinMode();
    return true;
  }

  async function pinHomePin(pin) {
    if (pinSaving) {
      showToast('正在保存首页常用，请稍候。', 'info');
      return false;
    }
    let clean = sanitizeHomePin(pin);
    if (!clean) return false;
    const m = model || buildModel();
    const resolved = resolveHomePin(m, clean);
    if (!resolved.available) {
      showToast('这项当前不可用，不能钉到首页。', 'warn');
      return false;
    }
    const state = effectivePinsOfModel(m);
    let key = homePinKey(clean);
    if (state.pins.some(item => homePinKey(item) === key)) {
      /* 已有只提示，不早退：明确再点一次就是再加一份副本（所有 pin 类型）；
         新副本拿新的实例 uid，旧的无 uid pin 保持原 key 不动。 */
      clean = { ...clean, uid: nextPinInstanceUid(state.pins, clean) };
      key = homePinKey(clean);
      showToast('这项已在首页常用里；已再放一份。', 'info');
    }
    pinSaving = true;
    const ok = await persistHomePins(state.pins.concat([clean]), '已钉到首页常用；没有改动任何开关。');
    pinSaving = false;
    if (!ok) return false;
    refresh({ force: true, reason: 'home-pin-add' });
    finishPinMode();
    return true;
  }

  async function removeHomePin(pin) {
    if (pinSaving) return false;
    const clean = sanitizeHomePin(pin);
    if (!clean) return false;
    const m = model || buildModel();
    const state = effectivePinsOfModel(m);
    const key = homePinKey(clean);
    const next = state.pins.filter(item => homePinKey(item) !== key);
    if (next.length === state.pins.length) return false;
    pinSaving = true;
    const ok = await persistHomePins(next, '已从首页常用移除；开关没有改动。');
    pinSaving = false;
    if (ok) refresh({ force: true, reason: 'home-pin-remove' });
    return ok;
  }

  async function moveHomePin(pin, delta) {
    if (pinSaving) return false;
    const clean = sanitizeHomePin(pin);
    if (!clean) return false;
    const m = model || buildModel();
    const state = effectivePinsOfModel(m);
    const key = homePinKey(clean);
    const from = state.pins.findIndex(item => homePinKey(item) === key);
    const to = from + Number(delta || 0);
    if (from < 0 || to < 0 || to >= state.pins.length || to === from) return false;
    const next = state.pins.slice();
    const item = next.splice(from, 1)[0];
    next.splice(to, 0, item);
    pinSaving = true;
    const ok = await persistHomePins(next, '首页常用顺序已保存；开关没有改动。');
    pinSaving = false;
    if (ok) refresh({ force: true, reason: 'home-pin-move' });
    return ok;
  }

  async function placeHomePin(pin, targetKey) {
    if (pinSaving) return false;
    const clean = sanitizeHomePin(pin);
    if (!clean || !targetKey) return false;
    const m = model || buildModel();
    const state = effectivePinsOfModel(m);
    const key = homePinKey(clean);
    if (!targetKey || targetKey === key) return false;
    const from = state.pins.findIndex(item => homePinKey(item) === key);
    if (from < 0) return false;
    const rest = state.pins.filter((item, index) => index !== from);
    let to = rest.findIndex(item => homePinKey(item) === targetKey);
    if (to < 0) to = rest.length;
    if (to === from) return false;
    rest.splice(to, 0, state.pins[from]);
    pinSaving = true;
    const ok = await persistHomePins(rest, '首页常用顺序已保存；开关没有改动。');
    pinSaving = false;
    if (ok) refresh({ force: true, reason: 'home-pin-drag' });
    return ok;
  }

  function nextHomeSpacerKey(pins) {
    let seq = 1;
    while ((pins || []).some(pin => pin && pin.type === 'spacer'
      && (pin.key === 'spacer:' + seq || pin.uid === 'spacer:' + seq))) seq += 1;
    return 'spacer:' + seq;
  }

  async function addHomeSpace() {
    if (pinSaving) return false;
    const m = model || buildModel();
    const state = effectivePinsOfModel(m);
    const key = nextHomeSpacerKey(state.pins);
    const pin = { type: 'spacer', key, uid: key, width: 6 };
    pinSaving = true;
    const ok = await persistHomePins(state.pins.concat([pin]),
      '已添加空白块；平时不显示、不可点，也不会切换任何开关。');
    pinSaving = false;
    if (ok) refresh({ force: true, reason: 'home-space-add' });
    else refresh({ force: true, reason: 'home-space-add-failed' });
    return ok;
  }

  async function setHomeSpaceWidth(pin, width) {
    if (pinSaving) return false;
    const clean = sanitizeHomePin(pin);
    const nextWidth = explicitLayoutWidth(width);
    if (!clean || clean.type !== 'spacer' || !nextWidth || clean.width === nextWidth) return false;
    const m = model || buildModel();
    const state = effectivePinsOfModel(m);
    const key = homePinKey(clean);
    let changed = false;
    const next = state.pins.map(item => {
      if (homePinKey(item) !== key) return item;
      changed = true;
      return { ...sanitizeHomePin(item), width: nextWidth };
    });
    if (!changed) return false;
    pinSaving = true;
    const ok = await persistHomePins(next, '空白块宽度已保存；开关没有改动。');
    pinSaving = false;
    if (ok) refresh({ force: true, reason: 'home-space-width' });
    else refresh({ force: true, reason: 'home-space-width-failed' });
    return ok;
  }

  function runHomePin(pin) {
    const clean = sanitizeHomePin(pin);
    if (!clean) return;
    const m = model || buildModel();
    const resolved = resolveHomePin(m, clean);
    if (!resolved.available) {
      showToast(resolved.sub || '这项当前不可用。', 'warn');
      return;
    }
    if (clean.type === 'prompt') {
      applyToggle(clean.id, !isOn(m, clean.id));
    } else if (clean.type === 'radio') {
      /* 整组 pin 不在这里执行：首页用原 renderRadio/applyRadio 选项按钮；
         这里只兜住 316 旧单选项 pin 的兼容路径。 */
      if (clean.value) applyRadio(clean.key, clean.value);
    } else if (clean.type === 'combo') {
      if (clean.value) applyCombo(clean.key, clean.value);
    } else if (clean.type === 'comboToggle') {
      applyComboToggle(clean.key);
    }
  }

  function sourceUidNear(target) {
    const hit = closest(target, '[data-ywpc-source-uid]');
    return hit ? text(hit.getAttribute('data-ywpc-source-uid')) : '';
  }

  function pinCandidateFromTarget(target) {
    if (!target) return null;
    /* 2026-11-15：钉选模式下点「导航+拨钮」并列卡的任意一颗按钮（含前面的
       导航按钮）都按它所属的控件钉首页——保持“点卡=钉”的原操作，绝不导航。 */
    const navPin = closest(target, '[data-ywpc-nav-section]');
    if (navPin) {
      const kind = text(navPin.getAttribute('data-ywpc-nav-kind'));
      const key = text(navPin.getAttribute('data-ywpc-nav-id'));
      const sourceUid = sourceUidNear(navPin);
      if (kind === 'toolboxFlag' && key && TOOLBOX_FLAG_SET.has(key)) {
        return { type: 'toolboxFlag', key, ...(sourceUid ? { sourceUid } : {}) };
      }
      if (kind === 'prompt' && key) {
        return { type: 'prompt', id: key, ...(sourceUid ? { sourceUid } : {}) };
      }
      return null;
    }
    const comboToggle = closest(target, '[data-ywpc-combo-toggle]');
    if (comboToggle) {
      const key = comboToggle.getAttribute('data-ywpc-combo-toggle');
      const sourceUid = sourceUidNear(comboToggle);
      return key ? { type: 'comboToggle', key, ...(sourceUid ? { sourceUid } : {}) } : null;
    }
    const radio = closest(target, '[data-ywpc-radio]');
    if (radio) {
      if (radio.disabled) return null;
      const key = radio.getAttribute('data-ywpc-radio');
      const sourceUid = sourceUidNear(radio);
      /* 点二选一里的任意选项 = 钉整个选择组（带组小标题），不钉单选项。 */
      return key ? { type: 'radio', key, ...(sourceUid ? { sourceUid } : {}) } : null;
    }
    const combo = closest(target, '[data-ywpc-combo]');
    if (combo) {
      if (combo.disabled) return null;
      const key = combo.getAttribute('data-ywpc-combo');
      const sourceUid = sourceUidNear(combo);
      /* 点组合里的任意选项 = 钉整个组合组。 */
      return key ? { type: 'combo', key, ...(sourceUid ? { sourceUid } : {}) } : null;
    }
    /* 点组标题/组说明也按整组钉；选项按钮已在上面先处理。 */
    const group = closest(target, '[data-ywpc-pin-group]');
    if (group) {
      const raw = String(group.getAttribute('data-ywpc-pin-group') || '');
      const at = raw.indexOf(':');
      const type = at > 0 ? raw.slice(0, at) : '';
      const key = at > 0 ? raw.slice(at + 1) : '';
      const sourceUid = sourceUidNear(group);
      if ((type === 'radio' || type === 'combo') && key) {
        return { type, key, ...(sourceUid ? { sourceUid } : {}) };
      }
    }
    const toolbox = closest(target, '[data-ywpc-toolbox-flag]');
    if (toolbox) {
      if (toolbox.disabled) return null;
      const flag = toolbox.getAttribute('data-ywpc-toolbox-flag');
      const sourceUid = sourceUidNear(toolbox);
      /* 随机头部是工具箱开关，不是预设条目；现在允许单独钉到首页。 */
      return flag && TOOLBOX_FLAG_SET.has(flag)
        ? { type: 'toolboxFlag', key: flag, ...(sourceUid ? { sourceUid } : {}) }
        : null;
    }
    const toggle = closest(target, '[data-ywpc-toggle]');
    if (toggle) {
      const id = toggle.getAttribute('data-ywpc-toggle');
      const sourceUid = sourceUidNear(toggle);
      return id ? { type: 'prompt', id, ...(sourceUid ? { sourceUid } : {}) } : null;
    }
    return null;
  }

  function setPickerOpen(open) {
    pickerOpen = !!open;
    if (!pickerOpen) pickerQuery = '';
    refresh({ force: true, reason: 'picker' });
    if (pickerOpen) {
      setTimeout(() => {
        try {
          const input = root && root.querySelector('[data-ywpc-picker-search]');
          if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
        } catch (e) { /* 焦点失败不影响 */ }
      }, 0);
    }
  }

  function commitWordRule(nextRule, token, options) {
    const m = model || buildModel();
    if (m.wordState !== 'ok' || !m.wordPrompt) {
      wordError = m.wordState === 'bad'
        ? '这条字数要求的格式不对（两处应一致）；为避免改坏，已禁用。'
        : '当前预设没有「🔢字数要求」这一条，不能改。';
      updateWordHintOnly();
      return false;
    }
    const wantMode = nextRule && nextRule.mode === 'range' ? 'range' : 'min';
    const wantMin = nextRule ? nextRule.min : null;
    const wantMax = wantMode === 'range' ? nextRule.max : null;
    if (!Number.isSafeInteger(wantMin) || wantMin <= 0
      || (wantMode === 'range' && (!Number.isSafeInteger(wantMax) || wantMax <= 0 || wantMin > wantMax))) {
      wordError = '字数必须是正整数' + (wantMode === 'range' ? '，且上限不能小于下限' : '') + '；这次没有写入。';
      updateWordHintOnly();
      return false;
    }
    if (!token || !tokenCurrent(token)) {
      wordError = '预设已切换；这次字数没有提交（离开输入框后会刷新）。';
      updateWordHintOnly();
      showToast('预设已切换，这次字数没有提交。', 'warn');
      return false;
    }
    const currentWordModel = buildModel();
    if (currentWordModel.wordPrompt !== m.wordPrompt || currentWordModel.wordState !== 'ok') {
      wordError = '字数条目绑定刚有变化，这次没有写入，请重新操作。';
      updateWordHintOnly();
      refresh({ force: true, reason: 'word-binding-changed' });
      return false;
    }
    let result;
    try {
      result = replaceLengthRule(m.wordPrompt.content || '', {
        mode: wantMode,
        min: wantMin,
        max: wantMax,
      });
    } catch (e) {
      wordError = '这条字数要求的内容格式不对，没改：' + humanError(e);
      updateWordHintOnly();
      showToast(wordError, 'error');
      return false;
    }
    const sameRule = !!(m.wordRule
      && m.wordRule.mode === result.after.mode
      && m.wordRule.min === result.after.min
      && m.wordRule.max === result.after.max);
    if (sameRule && String(m.wordPrompt.content || '') === result.content) {
      wordDraft = null;
      wordToken = null;
      wordError = '';
      updateWordInputs(result.after);
      updateWordHintOnly();
      return true;
    }
    try {
      m.wordPrompt.content = result.content;
    } catch (e) {
      wordError = '写入字数失败：' + humanError(e);
      updateWordHintOnly();
      showToast(wordError, 'error');
      return false;
    }
    m.wordRule = result.after;
    m.wordValue = result.after.min;
    if (result.after.mode === 'range') {
      wordLastRange = { min: result.after.min, max: result.after.max };
    }
    wordDraft = null;
    wordToken = null;
    wordError = '';
    updateWordInputs(result.after);
    persistSettings();
    showToast(result.after.mode === 'range'
      ? '字数已改成 ' + result.after.min + '~' + result.after.max + ' 字以内。'
      : '字数已改成 ' + result.after.min + ' 字以上。', 'ok');
    queuePresetSave('ywpc-word', token);
    refresh({ reason: (options && options.reason) || 'word-commit', force: !!(options && options.force) });
    return true;
  }

  /* 从界面当前两个输入提交；负值/倒置/非整数/空值一律不写。 */
  function commitWordDraft(token, options) {
    const m = model || buildModel();
    if (m.wordState !== 'ok' || !m.wordPrompt) {
      wordError = m.wordState === 'bad'
        ? '这条字数要求的格式不对（两处应一致）；为避免改坏，已禁用。'
        : '当前预设没有「🔢字数要求」这一条，不能改。';
      updateWordHintOnly();
      return false;
    }
    const mode = wordModeOf(m);
    const values = readWordInputValues(m);
    const min = parseWordRaw(values.min);
    if (min === null) {
      wordError = '字数必须是正整数' + (mode === 'range' ? '（下限）' : '') + '；这次没有写入。';
      updateWordHintOnly();
      return false;
    }
    let max = null;
    if (mode === 'range') {
      max = parseWordRaw(values.max);
      if (max === null) {
        wordError = '字数必须是正整数（上限）；这次没有写入。';
        updateWordHintOnly();
        return false;
      }
      if (min > max) {
        wordError = '上限不能小于下限；这次没有写入。';
        updateWordHintOnly();
        return false;
      }
    }
    return commitWordRule({ mode, min, max }, token, options);
  }

  /* 切模式立刻写真实 content：优先用当前输入；range 首次 = N-500 ~ N，
     之后在有合法草稿时按草稿派生，否则保留本会话上次范围。 */
  function switchWordMode(mode) {
    const m = model || buildModel();
    if (m.wordState !== 'ok' || !m.wordPrompt || !m.wordRule) {
      wordError = m.wordState === 'bad'
        ? '这条字数要求的格式不对（两处应一致）；为避免改坏，已禁用。'
        : '当前预设没有「🔢字数要求」这一条，不能改。';
      updateWordHintOnly();
      return false;
    }
    const nextMode = mode === 'range' ? 'range' : 'min';
    /* 点当前已选中的模式 = 不做事，不丢正在输入的草稿、不动已排队的提交。 */
    if (m.wordRule.mode === nextMode) return true;
    if (wordCommitTimer) { clearTimeout(wordCommitTimer); wordCommitTimer = 0; }
    const values = readWordInputValues(m);
    const draftMin = parseWordRaw(values.min);
    const oldMode = wordModeOf(m);
    const draftMax = oldMode === 'range' ? parseWordRaw(values.max) : null;
    if (draftMin === null) {
      wordError = '请输入正整数' + (nextMode === 'range' ? '（下限）' : '') + '；这次没有切换。';
      updateWordHintOnly();
      return false;
    }
    if (oldMode === 'range' && draftMax === null) {
      wordError = '请输入正整数（上限）；这次没有切换。';
      updateWordHintOnly();
      return false;
    }
    if (oldMode === 'range' && draftMax !== null && draftMin > draftMax) {
      wordError = '上限不能小于下限；这次没有切换。';
      updateWordHintOnly();
      return false;
    }
    let next;
    if (nextMode === 'range') {
      const base = draftMin;
      const last = wordLastRange;
      const hasDraft = wordDraft !== null;
      if (!hasDraft && last && last.min <= last.max && last.min <= base && last.max >= base) {
        next = { mode: 'range', min: last.min, max: last.max };
      } else {
        next = { mode: 'range', min: Math.max(1, base - 500), max: base };
      }
    } else {
      next = { mode: 'min', min: draftMin };
    }
    wordDraft = null;
    wordToken = captureToken();
    wordError = '';
    return commitWordRule(next, wordToken, { force: true, reason: 'word-mode' });
  }

  function updateWordInputs(rule) {
    if (!rule) return;
    try {
      const inputs = root ? root.querySelectorAll('[data-ywpc-word-input]') : [];
      for (const input of inputs) {
        const field = input.getAttribute('data-ywpc-word-field') === 'max' ? 'max' : 'min';
        const raw = wordDraft && typeof wordDraft[field] === 'string'
          ? wordDraft[field]
          : (field === 'max'
            ? (rule.max === null || rule.max === undefined ? '' : String(rule.max))
            : String(rule.min));
        input.value = raw;
      }
    } catch (e) { /* 忽略 */ }
  }

  function updateWordHintOnly() {
    try {
      const hint = root && root.querySelector('[data-ywpc-word-hint]');
      if (hint) hint.textContent = wordHintText(model || buildModel());
    } catch (e) { /* 忽略 */ }
  }

  /* 不重建 DOM 的同步：只改值/禁用态/aria 和提示。 */
  function syncWordUI(m) {
    if (!root) return;
    const rule = m && m.wordRule ? m.wordRule : null;
    const usable = !!m && m.wordState === 'ok' && !pinMode;
    try {
      for (const input of root.querySelectorAll('[data-ywpc-word-input]')) {
        const field = input.getAttribute('data-ywpc-word-field') === 'max' ? 'max' : 'min';
        const focused = doc.activeElement === input;
        if (!focused && wordDraft === null) {
          input.value = rule
            ? (field === 'max'
              ? (rule.max === null || rule.max === undefined ? '' : String(rule.max))
              : String(rule.min))
            : '';
        }
        input.disabled = !usable;
        if (!usable) input.setAttribute('aria-disabled', 'true');
        else input.removeAttribute('aria-disabled');
      }
      for (const btn of root.querySelectorAll('[data-ywpc-word-mode]')) {
        const value = btn.getAttribute('data-ywpc-mode');
        btn.setAttribute('aria-checked', rule && value === rule.mode ? 'true' : 'false');
        btn.disabled = !usable;
        if (!usable) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
      }
    } catch (e) { /* 忽略 */ }
    updateWordHintOnly();
  }

  function scheduleWordCommit() {
    if (wordCommitTimer) clearTimeout(wordCommitTimer);
    if (!wordToken) wordToken = captureToken();
    const token = wordToken;
    wordCommitTimer = setTimeout(() => {
      wordCommitTimer = 0;
      commitWordDraft(token);
    }, SAVE_DEBOUNCE_MS);
  }

  function stepWord(delta) {
    const m = model || buildModel();
    if (m.wordState !== 'ok') {
      wordError = m.wordState === 'bad'
        ? '这条字数要求的格式不对（两处应一致）；为避免改坏，已禁用。'
        : '当前预设没有「🔢字数要求」这一条，不能改。';
      updateWordHintOnly();
      return;
    }
    const mode = wordModeOf(m);
    const field = mode === 'range' && wordField === 'max' ? 'max' : 'min';
    const values = readWordInputValues(m);
    let raw = values[field];
    if (text(raw).trim() === '') raw = wordDraftValueOf(m, field);
    const num = parseWordRaw(raw);
    if (num === null) {
      wordError = '先填一个正整数，再按加减。';
      updateWordHintOnly();
      return;
    }
    const next = Math.max(1, num + Number(delta));
    wordDraft = { min: values.min, max: values.max };
    wordDraft[field] = String(next);
    wordToken = captureToken();
    wordError = '';
    try {
      const inputs = root ? root.querySelectorAll('[data-ywpc-word-input]') : [];
      for (const input of inputs) {
        const current = input.getAttribute('data-ywpc-word-field') === 'max' ? 'max' : 'min';
        if (current === field) input.value = String(next);
      }
    } catch (e) { /* 忽略 */ }
    commitWordDraft(wordToken);
  }

  /* ------------------------------------------------------------------------
     事件
     ------------------------------------------------------------------------ */
  function closest(target, selector) {
    try {
      return target && typeof target.closest === 'function' ? target.closest(selector) : null;
    } catch (e) {
      return null;
    }
  }

  function closestAny(target, selectors) {
    for (const selector of selectors || []) {
      const hit = closest(target, selector);
      if (hit) return hit;
    }
    return null;
  }

  function widthDragTarget(target) {
    const handle = closest(target, '[data-ywpc-width-handle]');
    if (!handle) return null;
    const action = handle.getAttribute('data-ywpc-width-handle');
    const uid = handle.getAttribute('data-ywpc-uid') || '';
    const value = handle.getAttribute('data-ywpc-value') || '';
    const spaceUid = handle.getAttribute('data-ywpc-space-uid') || '';
    if (action === 'layout-control-width') {
      const hit = findEditControl(uid);
      if (!hit) return null;
      return {
        kind: 'control', action, uid, value, spaceUid,
        width: controlCellWidth(hit.section.id, hit.control),
      };
    }
    if (action === 'layout-option-width') {
      const hit = findEditControl(uid);
      if (!hit) return null;
      const option = (hit.control.options || []).find(item => String(item.value) === String(value));
      if (!option) return null;
      const entry = (optionDisplayList(hit.control) || []).find(item => item.type === 'option'
        && String(item.option.value) === String(value));
      return {
        kind: 'option', action, uid, value, spaceUid,
        width: optionWidthOf(hit.control, option, entry || null),
      };
    }
    if (action === 'layout-option-space-width') {
      const hit = findEditControl(uid);
      const entry = hit && (hit.control.optionLayout || []).find(item => item
        && item.type === 'spacer' && String(item.uid || '') === String(spaceUid));
      if (!entry) return null;
      return {
        kind: 'option-space', action, uid, value, spaceUid,
        width: explicitLayoutWidth(entry.width) || 6,
      };
    }
    if (action === 'home-space') {
      const pin = decodeHomePin(handle.getAttribute('data-ywpc-pin'));
      if (!pin || pin.type !== 'spacer') return null;
      return { kind: 'home-space', action, pin, width: explicitLayoutWidth(pin.width) || 6 };
    }
    return null;
  }

  function gridColumnWidthOf(node) {
    let width = 0;
    try {
      const grid = closest(node, '.ywpc-grid12');
      if (grid && typeof grid.getBoundingClientRect === 'function') {
        width = Number(grid.getBoundingClientRect().width) || 0;
      }
      if (!width && containerEl && typeof containerEl.getBoundingClientRect === 'function') {
        width = Number(containerEl.getBoundingClientRect().width) || 0;
      }
    } catch (e) { width = 0; }
    if (!width) width = 360;
    return width / 12;
  }

  function snapLayoutWidth(raw) {
    if (!Number.isFinite(raw)) return 6;
    let best = WIDTH_STEPS[0];
    let bestDistance = Infinity;
    for (const width of WIDTH_STEPS) {
      const distance = Math.abs(raw - width);
      if (distance < bestDistance) { best = width; bestDistance = distance; }
    }
    return best;
  }

  function widthLabelNode(scope) {
    return scope && scope.querySelector ? scope.querySelector('[data-ywpc-width-label]') : null;
  }

  function applyWidthPreview(drag, width) {
    if (!drag) return;
    const label = WIDTH_STEP_LABELS[width] || '全行';
    try {
      if (drag.kind === 'home-space') {
        const row = root && root.querySelector('[data-ywpc-pin-row="' + encodeHomePin(drag.pin) + '"]');
        if (row) {
          row.setAttribute('data-ywpc-w', String(width));
          const sub = row.querySelector('.ywpc-pin-sub');
          if (sub) sub.textContent = '宽度 ' + label + ' · 平时不显示、不可点、不切开关';
          for (const btn of row.querySelectorAll('[data-ywpc-action="home-space-width"]')) {
            btn.setAttribute('aria-pressed', Number(btn.getAttribute('data-ywpc-width')) === width ? 'true' : 'false');
            if (Number(btn.getAttribute('data-ywpc-width')) === width) btn.classList.add('ywpc-current');
            else btn.classList.remove('ywpc-current');
          }
        }
        return;
      }
      if (drag.kind === 'control') {
        const row = root && root.querySelector('[data-ywpc-edit-row="' + drag.uid + '"]');
        if (row) {
          row.setAttribute('data-ywpc-w', String(width));
          /* 新画布：实际栅格跨度在块的父级 .ywpc-cell 上，拖动中也要即时跟着变。 */
          const cell = closest(row, '.ywpc-cell');
          if (cell) cell.setAttribute('data-ywpc-w', String(width));
          const text = widthLabelNode(row);
          if (text) text.textContent = label;
          for (const btn of row.querySelectorAll('[data-ywpc-action="layout-control-width"]')) {
            btn.setAttribute('aria-pressed', Number(btn.getAttribute('data-ywpc-width')) === width ? 'true' : 'false');
            if (Number(btn.getAttribute('data-ywpc-width')) === width) btn.classList.add('ywpc-current');
            else btn.classList.remove('ywpc-current');
          }
        }
        const cell = root && root.querySelector('[data-ywpc-preview-uid="' + drag.uid + '"]');
        if (cell) {
          cell.setAttribute('data-ywpc-w', String(width));
          const kind = cell.querySelector('.ywpc-preview-meta');
          if (kind && kind.textContent) {
            const parts = kind.textContent.split(' · ');
            kind.textContent = (parts[0] || '') + ' · ' + label;
          }
        }
      }
      if (drag.kind === 'option') {
        const chip = root && root.querySelector('[data-ywpc-preview-option-uid="' + drag.uid
          + '"][data-ywpc-preview-option-value="' + encodeURIComponent(drag.value) + '"]');
        if (chip) chip.setAttribute('data-ywpc-w', String(width));
        if (root) {
          for (const optRow of root.querySelectorAll('[data-ywpc-option-value="'
            + encodeURIComponent(drag.value) + '"]')) {
            if (!closest(optRow, '[data-ywpc-edit-control="' + drag.uid + '"]')) continue;
            const text = widthLabelNode(optRow);
            if (text) text.textContent = label;
            for (const btn of optRow.querySelectorAll('[data-ywpc-action="layout-option-width"]')) {
              btn.setAttribute('aria-pressed', Number(btn.getAttribute('data-ywpc-width')) === width ? 'true' : 'false');
              if (Number(btn.getAttribute('data-ywpc-width')) === width) btn.classList.add('ywpc-current');
              else btn.classList.remove('ywpc-current');
            }
          }
        }
      }
      if (drag.kind === 'option-space') {
        const space = root && root.querySelector('[data-ywpc-option-space="' + drag.spaceUid + '"]');
        if (space) {
          space.setAttribute('data-ywpc-w', String(width));
          const text = widthLabelNode(space);
          if (text) text.textContent = label;
          for (const btn of space.querySelectorAll('[data-ywpc-action="layout-option-space-width"]')) {
            btn.setAttribute('aria-pressed', Number(btn.getAttribute('data-ywpc-width')) === width ? 'true' : 'false');
            if (Number(btn.getAttribute('data-ywpc-width')) === width) btn.classList.add('ywpc-current');
            else btn.classList.remove('ywpc-current');
          }
        }
      }
    } catch (e) { /* 预览更新失败不影响提交 */ }
  }

  function removeWidthWindowListeners() {
    /* 拖动结束/取消/中断/teardown 都会走到这里：顺手把自动滚动与重算的 rAF 一并清掉。 */
    stopDragScrollTimers();
    try {
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('pointermove', boundHandlers.pointermove);
        win.removeEventListener('pointerup', boundHandlers.pointerup);
        win.removeEventListener('pointercancel', boundHandlers.pointercancel);
        win.removeEventListener('wheel', boundHandlers.wheel);
      }
    } catch (e) { /* 忽略 */ }
  }

  function endWidthDrag(commit) {
    const drag = widthDrag;
    if (!drag) return;
    widthDrag = null;
    removeWidthWindowListeners();
    try {
      if (root) root.classList.remove('ywpc-wdragging');
      if (drag.handle && drag.handle.classList) drag.handle.classList.remove('ywpc-wdragging');
    } catch (e) { /* 忽略 */ }
    if (!commit || drag.lastWidth === drag.width) {
      applyWidthPreview(drag, drag.width);
      return;
    }
    if (drag.kind === 'home-space') setHomeSpaceWidth(drag.pin, drag.lastWidth);
    else if (drag.kind === 'control') setEditControlWidth(drag.uid, drag.lastWidth);
    else if (drag.kind === 'option') setEditOptionWidth(drag.uid, drag.value, drag.lastWidth);
    else if (drag.kind === 'option-space') setEditOptionSpaceWidth(drag.uid, drag.spaceUid, drag.lastWidth);
  }

  function cancelWidthDrag() {
    if (!widthDrag) return;
    const drag = widthDrag;
    widthDrag = null;
    removeWidthWindowListeners();
    try {
      if (root) root.classList.remove('ywpc-wdragging');
      if (drag.handle && drag.handle.classList) drag.handle.classList.remove('ywpc-wdragging');
    } catch (e) { /* 忽略 */ }
    applyWidthPreview(drag, drag.width);
  }

  function cancelSortDrag() {
    if (!sortDrag) return;
    clearSortHighlight();
    sortDrag = null;
    removeWidthWindowListeners();
  }

  function onPointerDown(event) {
    /* 第二根手指不许抢已经开始的宽度拖动/排序；只认最开始那个 pointerId。 */
    if (widthDrag || sortDrag) return;
    const target = widthDragTarget(event.target);
    if (target) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const handle = closest(event.target, '[data-ywpc-width-handle]');
      const startX = Number(event.clientX);
      target.handle = handle;
      target.pointerId = event.pointerId;
      target.startX = Number.isFinite(startX) ? startX : 0;
      target.column = gridColumnWidthOf(handle);
      target.lastWidth = target.width;
      widthDrag = target;
      target.px = target.startX;
      target.py = Number.isFinite(Number(event.clientY)) ? Number(event.clientY) : target.startY;
      try {
        if (handle && typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) {
          handle.setPointerCapture(event.pointerId);
        }
      } catch (e) { /* 没有 pointer capture 也能用按钮 */ }
      try {
        if (root) root.classList.add('ywpc-wdragging');
        if (handle && handle.classList) handle.classList.add('ywpc-wdragging');
      } catch (e) { /* 忽略 */ }
      try {
        if (win && typeof win.addEventListener === 'function') {
          win.addEventListener('pointermove', boundHandlers.pointermove);
          win.addEventListener('pointerup', boundHandlers.pointerup);
          win.addEventListener('pointercancel', boundHandlers.pointercancel);
          win.addEventListener('wheel', boundHandlers.wheel);
        }
      } catch (e) { /* 忽略 */ }
      return;
    }
    beginSortDrag(event);
  }

  function onPointerMove(event) {
    if (widthDrag) {
      if (widthDrag.pointerId !== undefined && event.pointerId !== undefined
        && widthDrag.pointerId !== event.pointerId) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const x = Number(event.clientX);
      if (!Number.isFinite(x)) return;
      widthDrag.px = x;
      const yNow = Number(event.clientY);
      if (Number.isFinite(yNow)) widthDrag.py = yNow;
      const raw = widthDrag.width + (x - widthDrag.startX) / (widthDrag.column || 30);
      const next = snapLayoutWidth(raw);
      if (next !== widthDrag.lastWidth) {
        widthDrag.lastWidth = next;
        /* move 只改预览，不写设置、不保存。 */
        applyWidthPreview(widthDrag, next);
      }
      /* 靠近可滚容器上下边缘时轻量自动滚动（宽度预览与落点无关，只滚不算）。 */
      ensureDragAutoScroll();
      return;
    }
    moveSortDrag(event);
  }

  function onPointerUp(event) {
    if (widthDrag) {
      if (widthDrag.pointerId !== undefined && event.pointerId !== undefined
        && widthDrag.pointerId !== event.pointerId) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      /* 松手只提交一次；提交走原有 saveSettings 链。 */
      endWidthDrag(true);
      return;
    }
    endSortDrag(event, true);
  }

  function onPointerCancel(event) {
    if (widthDrag) {
      if (widthDrag.pointerId !== undefined && event.pointerId !== undefined
        && widthDrag.pointerId !== event.pointerId) return;
      endWidthDrag(false);
      return;
    }
    endSortDrag(event, false);
  }

  function onPointerLost(event) {
    if (widthDrag) {
      if (sameSortPointer(widthDrag, event)) endWidthDrag(false);
      return;
    }
    if (sortDrag && sameSortPointer(sortDrag, event)) endSortDrag(event, false);
  }

  /* ---- 拖动中的边缘自动滚动 + 滚轮重算落点 --------------------------------
     - 只在 widthDrag / sortDrag 真正拖起来（moved）时工作；不锁页面滚动；
     - 鼠标滚轮照常滚（绝不 preventDefault），滚完按同一指针坐标重算落点；
     - 近可滚容器上下边缘用 rAF 轻量滚：越贴边越快、到头自动停；
     - 触摸长按拖动同样有效（句柄是 touch-action:none，原生滚不动，只有这条路）；
     - 清理统一走 removeWidthWindowListeners（end/cancel/abort/切预设/teardown 都调）。 */
  const DRAG_SCROLL_EDGE = 44;       /* 上下边缘感应区（px） */
  const DRAG_SCROLL_MAX_SPEED = 11;  /* 贴边时的最大速度（px/帧，60fps 基准，按实际帧时长折算） */

  function dragScrollRafOf() {
    return win && typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame : null;
  }

  function dragScrollCancelOf() {
    return win && typeof win.cancelAnimationFrame === 'function' ? win.cancelAnimationFrame : null;
  }

  function stopDragScrollTimers() {
    try {
      const cancel = dragScrollCancelOf();
      if (dragScrollRaf && cancel) cancel(dragScrollRaf);
      if (dragRecalcRaf && cancel) cancel(dragRecalcRaf);
    } catch (e) { /* 忽略 */ }
    dragScrollRaf = 0;
    dragRecalcRaf = 0;
  }

  /* 单个滚动区在指针 y 下能不能滚、往哪滚、多快；不在边区/滚到头/不可滚都返回 null。 */
  function dragScrollPlanAt(el, y) {
    let rect = null;
    try { rect = el.getBoundingClientRect(); } catch (e) { return null; }
    if (!rect || !(rect.height > 0)) return null;
    let dir = 0;
    let dist = 0;
    if (y <= rect.top) { dir = -1; dist = 0; }
    else if (y <= rect.top + DRAG_SCROLL_EDGE) { dir = -1; dist = y - rect.top; }
    else if (y >= rect.bottom) { dir = 1; dist = 0; }
    else if (y >= rect.bottom - DRAG_SCROLL_EDGE) { dir = 1; dist = rect.bottom - y; }
    else { return null; }
    const max = (Number(el.scrollHeight) || 0) - (Number(el.clientHeight) || 0);
    if (max <= 1) return null;
    const at = Number(el.scrollTop) || 0;
    if (dir < 0 && at <= 0.5) return null;
    if (dir > 0 && at >= max - 0.5) return null;
    return { el, dir, speed: DRAG_SCROLL_MAX_SPEED * (1 - Math.min(1, dist / DRAG_SCROLL_EDGE)) };
  }

  /* 从拖动源向上找第一个“往这个方向还能滚”的滚动祖先（近的优先，滚到头自然换外层）。 */
  function dragScrollPlan(py, anchor) {
    let cur = anchor && anchor.parentElement ? anchor.parentElement : null;
    while (cur && cur.nodeType === 1) {
      if (isScrollableNode(cur)) {
        const plan = dragScrollPlanAt(cur, py);
        if (plan) return plan;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  let dragScrollLastTick = 0;

  function tickDragAutoScroll() {
    dragScrollRaf = 0;
    const token = (sortDrag && sortDrag.moved) ? sortDrag : widthDrag;
    if (!token) return;
    const py = Number(token.py);
    if (!Number.isFinite(py)) return;
    const plan = dragScrollPlan(py, token.sourceEl || token.handle || null);
    if (!plan) return;
    const now = Date.now();
    const dt = dragScrollLastTick ? Math.min(64, Math.max(8, now - dragScrollLastTick)) : 16;
    dragScrollLastTick = now;
    try {
      const max = (Number(plan.el.scrollHeight) || 0) - (Number(plan.el.clientHeight) || 0);
      const at = Number(plan.el.scrollTop) || 0;
      const next = Math.max(0, Math.min(max, at + plan.dir * plan.speed * (dt / 16.7)));
      if (next !== at) plan.el.scrollTop = next;
      else { dragScrollLastTick = 0; return; } /* 到头：停表并结束本轮，等下一次指针移动再武装 */
    } catch (e) { return; }
    /* 滚了内容但指针没动：必须按同一坐标重算落点，否则只滚了视觉、松手会放错。 */
    if (sortDrag && sortDrag.moved) {
      applySortDropAt(Number(sortDrag.px) || 0, Number(sortDrag.py) || 0);
    }
    ensureDragAutoScroll();
  }

  function ensureDragAutoScroll() {
    if (dragScrollRaf) return;
    const raf = dragScrollRafOf();
    if (!raf) return;
    dragScrollLastTick = 0;
    dragScrollRaf = raf(tickDragAutoScroll);
  }

  function recalcDragDropNow() {
    dragRecalcRaf = 0;
    const token = sortDrag;
    if (!token || !token.moved) return;
    applySortDropAt(Number(token.px) || 0, Number(token.py) || 0);
  }

  function scheduleDragDropRecalc() {
    if (dragRecalcRaf) return;
    const raf = dragScrollRafOf();
    if (!raf) { recalcDragDropNow(); return; }
    dragRecalcRaf = raf(recalcDragDropNow);
  }

  /* 拖动中滚轮/触摸板滚动：不拦、页面该滚照滚；滚完按最后指针坐标重算一次落点。 */
  function onDragWheel(event) {
    if (widthDrag) return; /* 宽度预览只看横向，滚动不需要重算 */
    const token = sortDrag;
    if (!token || !token.moved) return;
    const x = Number(event && event.clientX);
    const y = Number(event && event.clientY);
    if (Number.isFinite(x) && Number.isFinite(y)) { token.px = x; token.py = y; }
    scheduleDragDropRecalc();
  }

  /* 左手柄手机排序：小阈值区分点击/拖动；只动按下时那个 token；松手才提交。
     移动中只高亮目标行，不重排数据，避免滚动/焦点跳。 */
  function sortTokenFrom(target) {
    if (!target) return null;
    if (homeEdit && !editing) {
      const pinHandle = closest(target, '[data-ywpc-pin-drag]');
      if (!pinHandle) return null;
      const pin = decodeHomePin(pinHandle.getAttribute('data-ywpc-pin-drag'));
      if (!pin) return null;
      return { kind: 'pin', pin, handle: pinHandle };
    }
    if (!editing) return null;
    const handle = closest(target, '[data-ywpc-drag]');
    if (!handle) return null;
    const kind = handle.getAttribute('data-ywpc-drag');
    if (kind === 'section') {
      const id = text(handle.getAttribute('data-ywpc-drag-id'));
      return id ? { kind: 'section', id, handle } : null;
    }
    if (kind === 'option' || kind === 'option-space') {
      const uid = text(handle.getAttribute('data-ywpc-drag-uid'));
      if (!uid) return null;
      return {
        kind, uid,
        value: text(handle.getAttribute('data-ywpc-value')),
        spaceUid: text(handle.getAttribute('data-ywpc-space-uid')),
        whole: handle.hasAttribute('data-ywpc-drag-whole'),
        handle,
      };
    }
    if (kind !== 'control') return null;
    const uid = text(handle.getAttribute('data-ywpc-drag-uid'));
    if (!uid) return null;
    return { kind: 'control', uid, handle };
  }

  function beginSortDrag(event) {
    const token = sortTokenFrom(event.target);
    if (!token) return;
    const whole = !!token.whole;
    token.pointerId = event.pointerId;
    token.pointerType = event.pointerType || '';
    token.startTime = Date.now();
    token.touchArmed = false;
    token.touchHold = whole && token.pointerType === 'touch';
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    token.startX = Number.isFinite(x) ? x : 0;
    token.startY = Number.isFinite(y) ? y : 0;
    token.moved = false;
    token.px = token.startX;
    token.py = token.startY;
    token.targetRow = null;
    sortDrag = token;
    /* 整块 chip 不拦 pointerdown，普通点击仍能选中；触摸也不拦，先让滚动走。 */
    if (!whole && typeof event.preventDefault === 'function') event.preventDefault();
    try {
      if (!token.touchHold && token.handle && typeof token.handle.setPointerCapture === 'function'
        && event.pointerId !== undefined) {
        token.handle.setPointerCapture(event.pointerId);
      }
    } catch (e) { /* 老 WebView 没 capture，靠 window 监听 */ }
    try {
      if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('pointermove', boundHandlers.pointermove);
        win.addEventListener('pointerup', boundHandlers.pointerup);
        win.addEventListener('pointercancel', boundHandlers.pointercancel);
        win.addEventListener('wheel', boundHandlers.wheel);
      }
    } catch (e) { /* 忽略 */ }
  }
  function sortPointTargetAt(x, y) {
    let node = null;
    try {
      if (doc && typeof doc.elementFromPoint === 'function') {
        node = doc.elementFromPoint(Number(x) || 0, Number(y) || 0);
      }
    } catch (e) { node = null; }
    return node;
  }
  function sortPointTarget(event) {
    if (!event) return null;
    const node = sortPointTargetAt(Number(event.clientX) || 0, Number(event.clientY) || 0);
    return node || event.target;
  }

  function sameSortPointer(token, event) {
    return !token || token.pointerId === undefined || !event || event.pointerId === undefined
      || token.pointerId === event.pointerId;
  }

  function sortSourceElement(token) {
    if (!token || !token.handle) return null;
    if (token.kind === 'pin') return closest(token.handle, '[data-ywpc-pin-row]');
    if (token.kind === 'section') return closest(token.handle, '[data-ywpc-action="layout-select-section"]');
    if (token.kind === 'option') return closest(token.handle, '[data-ywpc-option-value]');
    if (token.kind === 'option-space') return closest(token.handle, '[data-ywpc-option-space]');
    if (token.kind === 'control') return closest(token.handle, '[data-ywpc-edit-block]');
    return null;
  }

  function clearSortGhost() {
    if (!sortGhostEl) return;
    try {
      if (sortGhostEl.parentNode) sortGhostEl.parentNode.removeChild(sortGhostEl);
    } catch (e) { /* 忽略 */ }
    sortGhostEl = null;
  }

  function clearSortDropLine() {
    if (!sortDropLineEl) return;
    try {
      if (sortDropLineEl.parentNode) sortDropLineEl.parentNode.removeChild(sortDropLineEl);
    } catch (e) { /* 忽略 */ }
    sortDropLineEl = null;
  }

  function positionSortDropLine(row, after) {
    if (!row || !doc || !doc.body) { clearSortDropLine(); return; }
    let rect = null;
    try { rect = row.getBoundingClientRect(); } catch (e) { rect = null; }
    if (!rect || !rect.width) { clearSortDropLine(); return; }
    try {
      if (!sortDropLineEl) {
        sortDropLineEl = createEl(doc, 'div', 'ywpc-sort-dropline');
        sortDropLineEl.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(sortDropLineEl);
      }
      const cs = root && win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle(root) : null;
      const accent = cs ? String(cs.getPropertyValue('--ywpc-accent') || '').trim() : '';
      if (accent) sortDropLineEl.style.background = accent;
      sortDropLineEl.style.left = rect.left + 'px';
      sortDropLineEl.style.width = rect.width + 'px';
      sortDropLineEl.style.top = (after ? rect.bottom - 1 : rect.top - 1) + 'px';
      sortDropLineEl.style.display = 'block';
    } catch (e) { clearSortDropLine(); }
  }

  function createSortGhost(token, event) {
    clearSortGhost();
    const source = token && token.sourceEl;
    if (!source || !doc || !doc.body) return;
    let rect = null;
    try { rect = source.getBoundingClientRect(); } catch (e) { rect = null; }
    if (!rect || !Number(rect.width)) return;
    token.ghostOffsetX = Math.max(0, (Number(event.clientX) || 0) - rect.left);
    token.ghostOffsetY = Math.max(0, (Number(event.clientY) || 0) - rect.top);
    let ghost = null;
    try {
      ghost = source.cloneNode(true);
      ghost.classList.remove('ywpc-sort-source', 'ywpc-dragging');
      for (const node of ghost.querySelectorAll('.ywpc-sort-source,.ywpc-dragging')) {
        node.classList.remove('ywpc-sort-source', 'ywpc-dragging');
      }
      ghost.classList.add('ywpc-sort-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.removeAttribute('id');
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.left = '0';
      ghost.style.top = '0';
      ghost.style.boxSizing = 'border-box';
      ghost.style.setProperty('opacity', '1', 'important');
      ghost.style.backgroundImage = 'none';
      try {
        const all = ghost.querySelectorAll('*');
        for (const node of all) node.style.boxSizing = 'border-box';
      } catch (e) { /* 忽略 */ }
      try {
        const fromFields = source.querySelectorAll('input,select,textarea');
        const toFields = ghost.querySelectorAll('input,select,textarea');
        for (let i = 0; i < fromFields.length && i < toFields.length; i += 1) {
          toFields[i].value = fromFields[i].value;
        }
      } catch (e) { /* 取值失败仍显示文字内容 */ }
      try {
        const cs = win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle(source) : null;
        if (cs) {
          for (const name of ['--ywpc-accent', '--ywpc-line', '--ywpc-line-strong',
            '--ywpc-surface', '--ywpc-surface-2', '--ywpc-muted', '--ywpc-warn',
            '--SmartThemeBodyColor', '--SmartThemeQuoteColor', '--SmartThemeEmColor',
            '--SmartThemeBlurTintColor']) {
            const value = cs.getPropertyValue(name);
            if (value) ghost.style.setProperty(name, value);
          }
          ghost.style.color = cs.color;
          const solid = String(cs.getPropertyValue('--SmartThemeBlurTintColor') || '').trim();
          if (solid) ghost.style.setProperty('background-color', solid, 'important');
        }
      } catch (e) { /* 变量复制失败仍可显示 */ }
      ghost.style.transform = 'translate(' + rect.left + 'px,' + rect.top + 'px)';
      doc.body.appendChild(ghost);
      sortGhostEl = ghost;
    } catch (e) {
      sortGhostEl = null;
    }
  }

  function positionSortGhost(event) {
    if (!sortGhostEl || !sortDrag) return;
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const left = x - (sortDrag.ghostOffsetX || 0);
    const top = y - (sortDrag.ghostOffsetY || 0);
    sortGhostEl.style.transform = 'translate(' + left + 'px,' + top + 'px)';
  }

  /* 设置里的选项行是整行纵向排列：统一按指针落在上半/下半判断插入前后。 */
  function sortDropAfter(row, token, x, y) {
    let rect = null;
    try { rect = row.getBoundingClientRect(); } catch (e) { rect = null; }
    if (!rect) return false;
    return y >= rect.top + rect.height / 2;
  }

  /* 前后半区 -> 真实插入下标。control 同组内按移除源项修正；选项按展示序算。 */
  function sortDropIndex(row, token, after) {
    if (!row || !token) return null;
    if (token.kind === 'control') {
      const pane = closest(row, '[data-ywpc-edit-pane]');
      const sectionId = pane ? text(pane.getAttribute('data-ywpc-edit-section')) : '';
      const section = findEditSection(sectionId);
      if (!section) return null;
      const targetUid = text(row.getAttribute('data-ywpc-edit-row'));
      const base = section.controls.findIndex(control => controlUid(control) === targetUid);
      if (base < 0) return null;
      let index = base + (after ? 1 : 0);
      const hit = findEditControl(token.uid);
      if (hit && hit.section === section && hit.index < index) index -= 1;
      return { sectionId: section.id, index: Math.max(0, Math.min(index, section.controls.length)) };
    }
    if (token.kind === 'option' || token.kind === 'option-space') {
      const hit = findEditControl(token.uid);
      if (!hit) return null;
      const display = optionDisplayList(hit.control)
        || (hit.control.options || []).map(option => ({ type: 'option', option, width: 0 }));
      const value = row.getAttribute('data-ywpc-option-value');
      const spaceUid = row.getAttribute('data-ywpc-option-space');
      let targetIndex = -1;
      if (value !== null) {
        let decoded = value;
        try { decoded = decodeURIComponent(value); } catch (e) { decoded = value; }
        targetIndex = display.findIndex(entry => entry && entry.type === 'option'
          && String(entry.option.value) === decoded);
      } else if (spaceUid !== null) {
        targetIndex = display.findIndex(entry => entry && entry.type === 'spacer'
          && String(entry.uid || '') === spaceUid);
      }
      if (targetIndex < 0) return null;
      /* 返回原始插入位（目标前/后）；移除源项后的下标修正在提交函数里只做一次。 */
      const index = targetIndex + (after ? 1 : 0);
      return { sectionId: hit.section.id, index: Math.max(0, Math.min(index, display.length)) };
    }
    return null;
  }

  function sortRowAt(node, token) {
    if (!token) return null;
    if (token.kind === 'pin') return closest(node, '[data-ywpc-pin-row]');
    if (token.kind === 'section') {
      const row = closest(node, '[data-ywpc-action="layout-select-section"]');
      return row && row.getAttribute('data-ywpc-section-id') !== token.id ? row : null;
    }
    if (token.kind === 'option' || token.kind === 'option-space') {
      return optionSortRow(node, token);
    }
    const row = closest(node, '[data-ywpc-edit-row]');
    if (!row) return null;
    const pane = closest(row, '[data-ywpc-edit-pane]');
    const ownPane = closest(token.handle, '[data-ywpc-edit-pane]');
    if (pane !== ownPane) return null;
    return row.getAttribute('data-ywpc-edit-row') === token.uid ? null : row;
  }

  function clearSortHighlight(token) {
    const t = token || sortDrag;
    try {
      if (root) {
        for (const node of root.querySelectorAll('.ywpc-drop-before,.ywpc-drop-after')) {
          node.classList.remove('ywpc-drop-before', 'ywpc-drop-after');
          node.removeAttribute('data-ywpc-drop-side');
        }
        root.classList.remove('ywpc-sorting');
      }
      if (t && t.sourceEl && t.sourceEl.classList) t.sourceEl.classList.remove('ywpc-sort-source');
      if (t && t.handle && t.handle.classList) t.handle.classList.remove('ywpc-dragging');
    } catch (e) { /* 忽略 */ }
    clearSortGhost();
    clearSortDropLine();
  }
  function optionSortRow(node, token) {
    if (!node || !token) return null;
    let row = closest(node, '[data-ywpc-option-value]');
    if (!row) row = closest(node, '[data-ywpc-option-space]');
    if (!row) return null;
    const card = closest(row, '[data-ywpc-edit-control]');
    if (!card || card.getAttribute('data-ywpc-edit-control') !== token.uid) return null;
    const value = row.getAttribute('data-ywpc-option-value');
    if (value !== null && token.kind === 'option') {
      let decoded = value;
      try { decoded = decodeURIComponent(value); } catch (e) { decoded = value; }
      if (decoded === token.value) return null;
    }
    const spaceUid = row.getAttribute('data-ywpc-option-space');
    if (spaceUid !== null && token.kind === 'option-space' && spaceUid === token.spaceUid) return null;
    return row;
  }

  function abortSortPending() {
    const token = sortDrag;
    if (!token) return;
    sortDrag = null;
    removeWidthWindowListeners();
    try { if (token.handle && token.handle.classList) token.handle.classList.remove('ywpc-dragging'); } catch (e) { /* 忽略 */ }
  }

  function moveSortDrag(event) {
    if (!sortDrag) return;
    if (!sameSortPointer(sortDrag, event)) return;
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (!sortDrag.moved) {
      const dx = (Number.isFinite(x) ? x : 0) - sortDrag.startX;
      const dy = (Number.isFinite(y) ? y : 0) - sortDrag.startY;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (sortDrag.touchHold && !sortDrag.touchArmed) {
        if (Date.now() - sortDrag.startTime >= 320) sortDrag.touchArmed = true;
        else if (dist >= 6) { abortSortPending(); return; }
        else return;
      }
      if (dist < 6) return;
      sortDrag.moved = true;
      if (sortDrag.touchHold && sortDrag.handle && typeof sortDrag.handle.setPointerCapture === 'function'
        && sortDrag.pointerId !== undefined) {
        try { sortDrag.handle.setPointerCapture(sortDrag.pointerId); } catch (e) { /* 忽略 */ }
      }
      try {
        if (root) root.classList.add('ywpc-sorting');
        if (sortDrag.handle && sortDrag.handle.classList) sortDrag.handle.classList.add('ywpc-dragging');
        sortDrag.sourceEl = sortSourceElement(sortDrag);
        if (sortDrag.sourceEl) {
          sortDrag.sourceEl.classList.add('ywpc-sort-source');
          if (sortDrag.kind === 'control' || sortDrag.kind === 'option' || sortDrag.kind === 'option-space') {
            createSortGhost(sortDrag, event);
          }
        }
      } catch (e) { /* 忽略 */ }
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
    sortDrag.px = Number.isFinite(x) ? x : sortDrag.px;
    sortDrag.py = Number.isFinite(y) ? y : sortDrag.py;
    positionSortGhost(event);
    applySortDropAt(sortDrag.px, sortDrag.py);
    /* 指针停在可滚容器上下边缘时开始轻量自动滚动；滚了之后落点在 tick 里重算。 */
    ensureDragAutoScroll();
  }

  /* 拖动中的落点重算：滚动/滚轮之后指针坐标没变，也必须按新内容重算，
     不能只滚视觉、松手放错位置。x/y 一定是数字（可能是滚动前记录的旧坐标）。 */
  function applySortDropAt(x, y) {
    if (!sortDrag || !sortDrag.moved) return;
    const node = sortPointTargetAt(x, y);
    const row = sortRowAt(node, sortDrag);
    if (sortDrag.dropEl && sortDrag.dropEl !== row) {
      try {
        sortDrag.dropEl.classList.remove('ywpc-drop-before', 'ywpc-drop-after');
        sortDrag.dropEl.removeAttribute('data-ywpc-drop-side');
      } catch (e) { /* 忽略 */ }
    }
    sortDrag.dropEl = row;
    if (!row) {
      sortDrag.dropIndex = null;
      sortDrag.dropSectionId = '';
      clearSortDropLine();
      return;
    }
    const after = sortDropAfter(row, sortDrag, x, y);
    positionSortDropLine(row, after);
    try {
      row.classList.remove('ywpc-drop-before', 'ywpc-drop-after');
      row.classList.add(after ? 'ywpc-drop-after' : 'ywpc-drop-before');
      row.setAttribute('data-ywpc-drop-side', after ? 'after' : 'before');
    } catch (e) { /* 忽略 */ }
    const drop = sortDropIndex(row, sortDrag, after);
    sortDrag.dropIndex = drop ? drop.index : null;
    sortDrag.dropSectionId = drop ? drop.sectionId : '';
  }
  function endSortDrag(event, commit) {
    const token = sortDrag;
    if (!token) return;
    if (!sameSortPointer(token, event)) return;
    const moved = !!token.moved;
    const dropEl = token.dropEl;
    const dropIndex = token.dropIndex;
    const dropSectionId = token.dropSectionId;
    sortDrag = null;
    clearSortHighlight(token);
    removeWidthWindowListeners();
    if (moved) {
      sortClickGuardUntil = Date.now() + 320;
      sortClickGuardEl = token.sourceEl || token.handle || null;
    }
    if (!commit || !moved) return;
    if (token.kind === 'pin') {
      const node = event ? sortPointTarget(event) : null;
      const row = closest(node, '[data-ywpc-pin-row]');
      const targetPin = row ? decodeHomePin(row.getAttribute('data-ywpc-pin-row')) : null;
      if (!targetPin) return;
      if (homePinKey(targetPin) === homePinKey(token.pin)) return;
      placeHomePin(token.pin, homePinKey(targetPin));
      return;
    }
    if (token.kind === 'section') {
      const node = event ? sortPointTarget(event) : null;
      const button = closest(node, '[data-ywpc-action="layout-select-section"]');
      const targetId = button ? text(button.getAttribute('data-ywpc-section-id')) : '';
      const sections = editSectionsOfModel();
      const from = sections.findIndex(section => section.id === token.id);
      const to = sections.findIndex(section => section.id === targetId);
      if (from < 0 || to < 0 || from === to) return;
      const item = sections.splice(from, 1)[0];
      sections.splice(to, 0, item);
      refresh({ force: true, reason: 'layout-drag-section' });
      return;
    }
    if (token.kind === 'option' || token.kind === 'option-space') {
      if (dropIndex === null || dropIndex === undefined) return;
      moveEditOptionEntryToIndex(token.uid, token, dropIndex);
      return;
    }
    if (!dropEl || dropIndex === null || dropIndex === undefined || !dropSectionId) return;
    const hit = findEditControl(token.uid);
    if (!hit || hit.section.id !== dropSectionId) return;
    if (hit.index === dropIndex) return;
    moveControlToIndex(token.uid, dropSectionId, dropIndex);
  }
  function onDragStart(event) {
    if (homeEdit && !editing) {
      const handle = closest(event.target, '[data-ywpc-pin-drag]');
      if (!handle) return;
      const pin = decodeHomePin(handle.getAttribute('data-ywpc-pin-drag'));
      if (!pin) return;
      pinDrag = { pin };
      try {
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', homePinKey(pin));
        }
      } catch (e) { /* 老浏览器没有 dataTransfer 也能用上下按钮 */ }
      try { handle.classList.add('ywpc-dragging'); } catch (e) { /* 忽略 */ }
      return;
    }
    if (!editing) return;
    const handle = closest(event.target, '[data-ywpc-drag]');
    if (!handle) return;
    dragState = {
      kind: handle.getAttribute('data-ywpc-drag'),
      id: handle.getAttribute('data-ywpc-drag-id') || '',
      uid: handle.getAttribute('data-ywpc-drag-uid') || '',
      sectionId: handle.getAttribute('data-ywpc-section-id') || '',
    };
    try {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragState.uid || dragState.id || 'layout');
      }
    } catch (e) { /* 老浏览器没有 dataTransfer 也能用上下按钮 */ }
    try { handle.classList.add('ywpc-dragging'); } catch (e) { /* 忽略 */ }
  }

  function onDragOver(event) {
    if (pinDrag) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    if (!editing || !dragState) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  function onDrop(event) {
    if (pinDrag) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const moving = pinDrag.pin;
      pinDrag = null;
      pinDragGuardUntil = Date.now() + 500;
      const row = closest(event.target, '[data-ywpc-pin-row]');
      const target = row ? decodeHomePin(row.getAttribute('data-ywpc-pin-row')) : null;
      if (!moving || !target) return;
      placeHomePin(moving, homePinKey(target));
      return;
    }
    if (!editing || !dragState) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    const state = dragState;
    dragState = null;
    if (state.kind === 'section') {
      const targetSection = closest(event.target, '[data-ywpc-section]');
      if (!targetSection) return;
      const targetId = targetSection.getAttribute('data-ywpc-section');
      if (!targetId || targetId === state.id) return;
      const sections = editSectionsOfModel();
      const from = sections.findIndex(section => section.id === state.id);
      const to = sections.findIndex(section => section.id === targetId);
      if (from < 0 || to < 0) return;
      const item = sections.splice(from, 1)[0];
      sections.splice(to, 0, item);
      refresh({ force: true, reason: 'layout-drag-section' });
      return;
    }
    if (state.kind === 'control') {
      const targetCard = closest(event.target, '[data-ywpc-edit-control]');
      const targetSection = closest(event.target, '[data-ywpc-section]');
      if (!targetSection) return;
      const targetSectionId = targetSection.getAttribute('data-ywpc-section');
      const targetSectionDef = findEditSection(targetSectionId);
      if (!targetSectionDef) return;
      let index = targetSectionDef.controls.length;
      if (targetCard) {
        const targetUid = targetCard.getAttribute('data-ywpc-edit-control');
        const found = targetSectionDef.controls.findIndex(control => controlUid(control) === targetUid);
        if (found >= 0) index = found;
      }
      moveControlToIndex(state.uid, targetSectionId, index);
    }
  }

  function onDragEnd() {
    if (pinDrag) {
      pinDrag = null;
      pinDragGuardUntil = Date.now() + 400;
    }
    dragState = null;
    try {
      if (root) {
        for (const node of root.querySelectorAll('.ywpc-dragging')) node.classList.remove('ywpc-dragging');
      }
    } catch (e) { /* 忽略 */ }
  }

  /* 编辑态动作：只处理布局草稿自身；其它任何按钮/卡片点击一律吞掉，
     绝不落到 applyToggle / applyRadio / 删除快捷等会写开关的路径。 */
  function handleLayoutAction(actionEl) {
    if (!actionEl) return false;
    const action = actionEl.getAttribute('data-ywpc-action');
    const uid = actionEl.getAttribute('data-ywpc-uid') || '';
    const sectionId = actionEl.getAttribute('data-ywpc-section-id') || '';
    if (action === 'layout-save') { saveLayoutEdits(); return true; }
    if (action === 'layout-cancel') { cancelEdit(); return true; }
    if (action === 'layout-restore') { restoreCurrentLayout(); return true; }
    if (action === 'layout-restore-cancel') {
      restoreConfirm = false;
      refresh({ force: true, reason: 'layout-restore-cancel' });
      return true;
    }
    if (action === 'layout-more-toggle') {
      editMoreOpen = !editMoreOpen;
      layoutError = '';
      refresh({ force: true, reason: 'layout-more-toggle' });
      return true;
    }
    if (action === 'layout-add-section') { addEditSection(); return true; }
    if (action === 'layout-add-group') {
      addEditGroupControl(sectionId || editSectionId, actionEl.getAttribute('data-ywpc-kind') || '');
      return true;
    }
    if (action === 'layout-section-up') { moveSectionBy(sectionId, -1); return true; }
    if (action === 'layout-section-down') { moveSectionBy(sectionId, 1); return true; }
    if (action === 'layout-select-section') { selectEditSection(sectionId); return true; }
    if (action === 'layout-group-page') {
      const dir = Number(actionEl.getAttribute('data-ywpc-dir')) || 1;
      editGroupPage += dir;
      clampEditGroupPage();
      refresh({ force: true, reason: 'layout-group-page' });
      return true;
    }
    if (action === 'layout-edit-control') { toggleEditControl(uid); return true; }
    if (action === 'layout-close-settings') { closeEditControlSettings(); return true; }
    if (action === 'layout-control-width') {
      setEditControlWidth(uid, actionEl.getAttribute('data-ywpc-width'));
      return true;
    }
    if (action === 'layout-delete-control') { deleteEditControl(uid); return true; }
    if (action === 'layout-add-space') { addEditSpace(sectionId || editSectionId); return true; }
    if (action === 'layout-add-option-space') { addEditOptionSpace(uid); return true; }
    if (action === 'layout-option-width') {
      setEditOptionWidth(uid, actionEl.getAttribute('data-ywpc-value'), actionEl.getAttribute('data-ywpc-width'));
      return true;
    }
    if (action === 'layout-option-space-width') {
      setEditOptionSpaceWidth(uid, actionEl.getAttribute('data-ywpc-space-uid'),
        actionEl.getAttribute('data-ywpc-width'));
      return true;
    }
    if (action === 'layout-option-space-remove') {
      removeEditOptionSpace(uid, actionEl.getAttribute('data-ywpc-space-uid'));
      return true;
    }
    if (action === 'layout-add-open') {
      layoutAddTarget = sectionId || editSectionId;
      layoutQuery = '';
      layoutError = '';
      refresh({ force: true, reason: 'layout-add-open' });
      return true;
    }
    if (action === 'layout-add-close') {
      layoutAddTarget = '';
      layoutQuery = '';
      refresh({ force: true, reason: 'layout-add-close' });
      return true;
    }
    if (action === 'layout-add-focus-search') {
      try {
        const search = root && root.querySelector('[data-ywpc-layout-search]');
        if (search && typeof search.focus === 'function') search.focus({ preventScroll: true });
      } catch (e) { /* 聚焦失败不影响 */ }
      return true;
    }
    if (action === 'layout-add-prompt') {
      addPromptControl(sectionId || layoutAddTarget || editSectionId, actionEl.getAttribute('data-ywpc-prompt-id'));
      return true;
    }
    if (action === 'layout-remove-member') {
      removeEditMember(uid, Number(actionEl.getAttribute('data-ywpc-option-index')),
        Number(actionEl.getAttribute('data-ywpc-member-index')));
      return true;
    }
    if (action === 'layout-add-option') { addEditOption(uid); return true; }
    if (action === 'layout-remove-option') { removeEditOption(uid, actionEl.getAttribute('data-ywpc-value')); return true; }
    return false;
  }

  function onClick(event) {
    const target = event.target;
    if (!target) return;
    /* 拖动结束后，浏览器还会补一次 click；整理模式里先吞掉这次，避免误触。 */
    /* 拖动进行中或刚结束：第二指补出的 click 一律吞掉，不能中途选中/触发动作。 */
    if (widthDrag || sortDrag) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    if (sortClickGuardUntil && Date.now() < sortClickGuardUntil) {
      const guardEl = sortClickGuardEl;
      sortClickGuardUntil = 0;
      sortClickGuardEl = null;
      const sameSource = !guardEl || !target || guardEl === target
        || (typeof guardEl.contains === 'function' && guardEl.contains(target))
        || (typeof target.contains === 'function' && target.contains(guardEl));
      if (sameSource) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
    }
    if (pinDragGuardUntil && Date.now() < pinDragGuardUntil) {
      pinDragGuardUntil = 0;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    /* 正文编辑页：只跑编辑器自己的动作，背景里的开关/布局动作一律不执行。 */
    if (contentEdit) {
      const contentAction = closest(target, '[data-ywpc-content-action]');
      if (contentAction) {
        if (contentAction.disabled) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        handleContentAction(contentAction);
        return;
      }
      const blocked = closestAny(target, ['[data-ywpc-action]', '[data-ywpc-toggle]', '[data-ywpc-radio]', '[data-ywpc-combo]', '[data-ywpc-combo-toggle]', '[data-ywpc-toolbox-flag]']);
      if (blocked && typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    /* 选条目模式：点真实条目只打开正文编辑；开关、单选、组合选项都不执行原动作。 */
    if (contentPick) {
      const contentAction = closest(target, '[data-ywpc-content-action]');
      if (contentAction) {
        if (contentAction.disabled) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        handleContentAction(contentAction);
        return;
      }
      if (handleContentPickTarget(target, event)) return;
      const blocked = closestAny(target, ['[data-ywpc-action]', '[data-ywpc-toggle]', '[data-ywpc-radio]', '[data-ywpc-combo]', '[data-ywpc-combo-toggle]', '[data-ywpc-toolbox-flag]']);
      if (blocked) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
    }
    /* 同级手风琴：点组头只开这一组；再点已开的那组就全收。手动处理，避免重建 DOM。 */
    const summaryEl = closest(target, 'summary.ywpc-sec-head');
    if (summaryEl && summaryEl.parentElement) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      noteActiveSection(summaryEl);
      toggleAccordion(summaryEl.parentElement);
      return;
    }
    /* 普通态：只记录用户点过的分组，供「编辑布局」进入当前组。 */
    noteActiveSection(target);
    /* 编辑态：只跑布局草稿动作；块/选项点击只选中，绝不写开关。 */
    if (editing) {
      const editAction = closest(target, '[data-ywpc-action]');
      if (editAction) {
        if (editAction.disabled) return;
        if (handleLayoutAction(editAction)) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
      const optionCtx = closest(target, '[data-ywpc-option-context]');
      if (optionCtx) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
      const optionChip = closest(target, '[data-ywpc-edit-option]');
      if (optionChip) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        selectEditOptionChip(optionChip);
        return;
      }
      const block = closest(target, '[data-ywpc-edit-block]');
      if (block) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        selectEditBlock(block.getAttribute('data-ywpc-edit-block'));
        return;
      }
      return;
    }
    /* pinMode 里带副作用的入口一律拦下：字数控件不参与钉选，也绝不误改；
       其它 action（增删常用、布局、字数步进…）同样只提示、不执行。 */
    if (pinMode && !editing) {
      const wordPinBtn = closest(target, '[data-ywpc-action="pin-word"]');
      if (wordPinBtn) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (wordPinBtn.disabled) return;
        const id = wordPinBtn.getAttribute('data-ywpc-pin-id');
        if (id) pinHomePin({ type: 'word', id });
        return;
      }
      const wordBox = closest(target, '[data-ywpc-word-box]');
      if (wordBox) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        showToast('钉选模式不会改字数；要钉首页请点「钉到首页」。', 'info');
        return;
      }
      const blocked = closest(target, '[data-ywpc-action]');
      if (blocked && blocked.getAttribute('data-ywpc-action') !== 'pin-cancel') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        showToast('钉选模式只用来选首页常用；这个操作已忽略。', 'info');
        return;
      }
    }
    const actionEl = closest(target, '[data-ywpc-action]');
    if (actionEl) {
      if (actionEl.disabled) return;
      const action = actionEl.getAttribute('data-ywpc-action');
      const uid = actionEl.getAttribute('data-ywpc-uid') || '';
      const sectionId = actionEl.getAttribute('data-ywpc-section-id') || '';
      if (action === 'content-edit-open') { beginContentEdit(); return; }
      if (action === 'content-pick-cancel') { exitContentPick(); return; }
      if (action === 'layout-open') { beginEdit(); return; }
      if (action === 'pin-mode-open') {
        if (typeof pinModeRequest === 'function') {
          try { pinModeRequest(); } catch (error) { showToast('打开钉选失败：' + humanError(error), 'error'); }
        } else {
          showToast('请从预设页右上角进入钉选。', 'info');
        }
        return;
      }
      if (action === 'pin-cancel') { cancelPinMode(); return; }
      if (action === 'pin-remove') {
        removeHomePin(decodeHomePin(actionEl.getAttribute('data-ywpc-pin')));
        return;
      }
      if (action === 'pin-up') {
        moveHomePin(decodeHomePin(actionEl.getAttribute('data-ywpc-pin')), -1);
        return;
      }
      if (action === 'pin-down') {
        moveHomePin(decodeHomePin(actionEl.getAttribute('data-ywpc-pin')), 1);
        return;
      }
      if (action === 'home-add-space') { addHomeSpace(); return; }
      if (action === 'home-space-width') {
        setHomeSpaceWidth(decodeHomePin(actionEl.getAttribute('data-ywpc-pin')),
          actionEl.getAttribute('data-ywpc-width'));
        return;
      }
      if (action === 'add-shortcut') { setPickerOpen(true); return; }
      if (action === 'close-picker') { setPickerOpen(false); return; }
      if (action === 'remove-shortcut') { removeShortcut(actionEl.getAttribute('data-ywpc-id')); return; }
      if (action === 'pick-add') { addShortcut(actionEl.getAttribute('data-ywpc-id')); return; }
      if (action === 'word-mode') {
        const mode = actionEl.getAttribute('data-ywpc-mode');
        if (mode === 'min' || mode === 'range') switchWordMode(mode);
        return;
      }
      if (action === 'word-step') {
        const delta = Number(actionEl.getAttribute('data-ywpc-step')) || 0;
        stepWord(delta);
        return;
      }
      return;
    }

    /* compact 首页卡片：单条/组合开关沿用原 apply*；单选/组合选项卡走 applyRadio/applyCombo。 */
    const pinCardEl = closest(target, '[data-ywpc-pin-card]');
    if (pinCardEl && !pinMode) {
      if (pinCardEl.disabled) return;
      const pin = decodeHomePin(pinCardEl.getAttribute('data-ywpc-pin-card'));
      if (pin) runHomePin(pin);
      return;
    }

    /* full 钉选模式：点击先钉首页，绝不调用 apply*、绝不顺手切换开关。 */
    if (pinMode && !editing) {
      const candidate = pinCandidateFromTarget(target);
      if (candidate) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        pinHomePin(candidate);
        return;
      }
    }

    /* 2026-11-15：工具箱注入段导航（插小说防道歉 / 随机头部的前面标题按钮）。
       只导航，零开关、零保存；布局编辑/钉选/正文选条目在上面各自分支已先处理，
       这里再兜一层：这几种模式下绝不导航。 */
    const navEl = closest(target, '[data-ywpc-nav-section]');
    if (navEl) {
      if (navEl.disabled) return;
      if (pinMode || editing || contentPick || contentEdit) return;
      const section = text(navEl.getAttribute('data-ywpc-nav-section'));
      if (!section) return;
      if (typeof deps.openInjectionSection !== 'function') {
        showToast('工具箱导航接口未就绪，没有打开任何设置。', 'warn');
        return;
      }
      try {
        deps.openInjectionSection(section);
      } catch (e) {
        showToast('打开工具箱设置失败：' + humanError(e), 'error');
      }
      return;
    }

    const radioEl = closest(target, '[data-ywpc-radio]');
    if (radioEl) {
      if (radioEl.disabled) return;
      const key = radioEl.getAttribute('data-ywpc-radio');
      const value = radioEl.getAttribute('data-ywpc-value');
      const m = model || buildModel();
      const def = definitionForKey(m, key, ['radio']);
      if ((key === PARAGRAPH_RADIO_KEY || key === NARRATION_RADIO_KEY || key === 'nsfw.orientation')
        && def && selectedRadioValue(m, def) === value) {
        applyRadioClear(key);
      } else {
        applyRadio(key, value);
      }
      return;
    }
    const comboEl = closest(target, '[data-ywpc-combo]');
    if (comboEl) {
      if (comboEl.disabled) return;
      applyCombo(comboEl.getAttribute('data-ywpc-combo'), comboEl.getAttribute('data-ywpc-value'));
      return;
    }
    const comboToggleEl = closest(target, '[data-ywpc-combo-toggle]');
    if (comboToggleEl) {
      if (comboToggleEl.disabled) return;
      applyComboToggle(comboToggleEl.getAttribute('data-ywpc-combo-toggle'));
      return;
    }
    const toolboxEl = closest(target, '[data-ywpc-toolbox-flag]');
    if (toolboxEl) {
      if (toolboxEl.disabled) return;
      /* 钉选模式不借机写工具箱开关；可钉的正常路径已在上面 pinCandidateFromTarget 处理。 */
      if (pinMode) {
        showToast('这个工具箱开关当前不可用，不能钉到首页。', 'warn');
        return;
      }
      const flag = toolboxEl.getAttribute('data-ywpc-toolbox-flag');
      writeToolboxFlag(flag, !readToolboxFlag(flag));
      return;
    }
    const toggleEl = closest(target, '[data-ywpc-toggle]');
    if (toggleEl) {
      if (toggleEl.disabled) return;
      const id = toggleEl.getAttribute('data-ywpc-toggle');
      const m = model || buildModel();
      if (!isAvailable(m, id)) {
        showToast('当前预设没有这项，已局部停用。', 'warn');
        return;
      }
      applyToggle(id, !isOn(m, id));
    }
  }

  function onInput(event) {
    const target = event.target;
    if (!target) return;
    if (target.hasAttribute && target.hasAttribute('data-ywpc-content-search')) {
      contentPickQuery = text(target.value);
      /* 换关键词就回到 8 条上限；「显示全部」只对当前一次查询生效。 */
      contentPickShowAll = false;
      try {
        const list = root && root.querySelector('[data-ywpc-content-list]');
        if (list) renderContentPickList(list, model || buildModel());
      } catch (e) { /* 搜索失败不影响 */ }
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-content-text')) {
      if (!contentEdit) return;
      contentEdit.draft = text(target.value);
      contentEdit.dirty = contentEdit.draft !== contentEdit.originalContent;
      if (contentEdit.dirty) rememberContentDraft(contentDraftKeyOf(contentEdit), contentEdit.draft);
      else forgetContentDraft(contentDraftKeyOf(contentEdit));
      updateContentEditorState();
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-input')) {
      if (!editing) return;
      const field = target.getAttribute('data-ywpc-layout-input');
      const value = text(target.value);
      if (field === 'new-section') {
        newSectionName = value;
        return;
      }
      if (field === 'section-title') {
        const section = findEditSection(target.getAttribute('data-ywpc-section-id'));
        if (section) {
          section.label = value;
          /* 不重建：只把当前分组标题与分页小标签就地改字，避免输入时丢焦点。 */
          try {
            const canvasTitle = root && root.querySelector('.ywpc-canvas-section');
            if (canvasTitle) canvasTitle.textContent = value || section.id;
            const chip = root && root.querySelector('.ywpc-gnav-chip.ywpc-current');
            if (chip) chip.textContent = value || section.id;
          } catch (e) { /* 就地更新失败等下轮刷新 */ }
        }
        return;
      }
      if (field === 'control-title' || field === 'control-sub') {
        const hit = findEditControl(target.getAttribute('data-ywpc-uid'));
        if (hit) {
          if (field === 'control-title') {
            hit.control.label = value;
            try {
              const uid = target.getAttribute('data-ywpc-uid');
              const title = root && root.querySelector('[data-ywpc-edit-block="' + uid.replace(/"/g, '\\"')
                + '"] .ywpc-cblock-title');
              if (title) title.textContent = value || '未命名控件';
            } catch (e) { /* 就地更新失败等下轮刷新 */ }
          } else {
            hit.control.sub = value;
          }
        }
        return;
      }
      if (field === 'option-label') {
        const hit = findEditControl(target.getAttribute('data-ywpc-uid'));
        const index = Number(target.getAttribute('data-ywpc-option-index'));
        const option = hit && hit.control.options ? hit.control.options[index] : null;
        if (option) {
          option.label = value;
          markOverride(hit.control);
        }
        return;
      }
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-search')) {
      layoutQuery = text(target.value);
      try {
        const list = root && root.querySelector('[data-ywpc-layout-list]');
        const section = root && root.querySelector('[data-ywpc-canvas]');
        if (list) renderAddPromptList(list, model || buildModel(),
          findEditSection(section ? section.getAttribute('data-ywpc-canvas') : editSectionId));
      } catch (e) { /* 搜索失败不影响 */ }
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-word-input')) {
      /* 画布里的字数块只是展示；编辑态绝不借输入框改正文。 */
      if (pinMode || editing || contentPick) return;
      if (!wordToken) wordToken = captureToken();
      wordField = target.getAttribute('data-ywpc-word-field') === 'max' ? 'max' : 'min';
      wordDraft = readWordInputValues(model || buildModel());
      wordError = '';
      updateWordHintOnly();
      scheduleWordCommit();
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-picker-search')) {
      pickerQuery = text(target.value);
      try {
        const list = root && root.querySelector('[data-ywpc-picker-list]');
        if (list) renderPickerList(list, model || buildModel());
      } catch (e) { /* 搜索失败不影响 */ }
    }
  }

  function onChange(event) {
    const target = event.target;
    if (!target) return;
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-rebind')) {
      if (editing && target.value) rebindEditControl(target.getAttribute('data-ywpc-layout-rebind'), target.value);
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-relation')) {
      if (editing) setEditRelation(target.getAttribute('data-ywpc-layout-relation'), target.value);
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-member-add')) {
      if (editing && target.value) {
        addEditMember(target.getAttribute('data-ywpc-layout-member-add'),
          Number(target.getAttribute('data-ywpc-option-index')), target.value);
      }
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-word-input')) {
      if (pinMode || editing || contentPick || wordDraft === null) return;
      if (wordCommitTimer) { clearTimeout(wordCommitTimer); wordCommitTimer = 0; }
      if (!wordToken) wordToken = captureToken();
      commitWordDraft(wordToken);
    }
  }

  function onKeyDown(event) {
    const target = event.target;
    if (!target) return;
    if (contentEdit && target.hasAttribute && target.hasAttribute('data-ywpc-content-text')
      && event.key === 'Escape') {
      event.preventDefault();
      requestContentCancel();
      return;
    }
    if (contentPick && target.hasAttribute && target.hasAttribute('data-ywpc-content-search')
      && event.key === 'Escape') {
      event.preventDefault();
      exitContentPick();
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-input')
      && target.getAttribute('data-ywpc-layout-input') === 'new-section' && event.key === 'Enter') {
      event.preventDefault();
      addEditSection();
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-search') && event.key === 'Escape') {
      event.preventDefault();
      layoutAddTarget = '';
      layoutQuery = '';
      refresh({ force: true, reason: 'layout-search-close' });
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-word-input')) {
      if (editing || contentPick) { if (event.key === 'Enter') event.preventDefault(); return; }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (wordCommitTimer) { clearTimeout(wordCommitTimer); wordCommitTimer = 0; }
        if (!wordToken) wordToken = captureToken();
        wordDraft = readWordInputValues(model || buildModel());
        commitWordDraft(wordToken);
        try { target.blur(); } catch (e) { /* 忽略 */ }
      }
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-picker-search') && event.key === 'Escape') {
      event.preventDefault();
      setPickerOpen(false);
    }
  }

  function onFocusOut(event) {
    const target = event.target;
    if (!target) return;
    if (target.hasAttribute && target.hasAttribute('data-ywpc-word-input')) {
      if (editing || contentPick) return;
      if (wordCommitTimer) { clearTimeout(wordCommitTimer); wordCommitTimer = 0; }
      if (wordDraft !== null) {
        wordDraft = readWordInputValues(model || buildModel());
        if (!wordToken) wordToken = captureToken();
        commitWordDraft(wordToken);
      }
      if (pendingRebuild) {
        pendingRebuild = false;
        setTimeout(() => refresh({ force: true, reason: 'blur-rebuild' }), 0);
      }
    }
  }

  /* ------------------------------------------------------------------------
     生命周期
     ------------------------------------------------------------------------ */
  const guardHandler = (fn) => (event) => {
    try {
      fn(event);
    } catch (error) {
      showToast('操作失败：' + humanError(error), 'error');
    }
  };
  const boundHandlers = {
    click: guardHandler(onClick),
    input: guardHandler(onInput),
    change: guardHandler(onChange),
    keydown: guardHandler(onKeyDown),
    focusout: guardHandler(onFocusOut),
    dragstart: guardHandler(onDragStart),
    dragover: guardHandler(onDragOver),
    drop: guardHandler(onDrop),
    dragend: guardHandler(onDragEnd),
    pointerdown: guardHandler(onPointerDown),
    pointermove: guardHandler(onPointerMove),
    pointerup: guardHandler(onPointerUp),
    pointercancel: guardHandler(onPointerCancel),
    lostpointercapture: guardHandler(onPointerLost),
    wheel: guardHandler(onDragWheel),
  };

  function mount(container, options) {
    if (!doc || !container || typeof container.appendChild !== 'function') {
      return function cleanup() {};
    }
    teardown();
    disposed = false;
    mounted = true;
    containerEl = container;
    compact = !!(options && options.compact);
    homeEdit = compact && !!(options && options.homeEdit);
    homeEditNeedsOpen = homeEdit;
    pinMode = !compact && !!(options && options.pinMode);
    pinOnDone = options && typeof options.onPin === 'function' ? options.onPin : null;
    pinModeRequest = options && typeof options.onPinModeRequest === 'function' ? options.onPinModeRequest : null;
    headerHostEl = options && options.headerHost && options.headerHost.nodeType === 1
      ? options.headerHost
      : null;
    pinSaving = false;
    pinDrag = null;
    pinDragGuardUntil = 0;
    pickerOpen = false;
    pickerQuery = '';
    contentPick = false;
    contentPickQuery = '';
    contentPickGroup = null;
    contentPickOpen = false;
    contentPickShowAll = false;
    contentEdit = null;
    wordDraft = null;
    wordToken = null;
    wordError = '';
    wordField = 'min';
    wordLastRange = null;
    pendingRebuild = false;
    lastKey = '';
    lastPresetName = '';
    lastScenarioRef = null;
    editing = false;
    editSections = null;
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    layoutQuery = '';
    layoutAddTarget = '';
    newSectionName = '';
    restoreConfirm = false;
    editOpenUid = '';
    editSelectedUid = '';
    editSelectedOption = null;
    editMoreOpen = false;
    editSectionId = '';
    editGroupPage = 0;
    pendingEntrySection = '';
    pendingExitSection = '';
    pendingOpenSection = '';
    dragState = null;
    widthDrag = null;
    sortDrag = null;
    editToken = null;
    editSaving = false;
    injectStyle();
    buildRoot();
    try {
      root.addEventListener('click', boundHandlers.click);
      root.addEventListener('input', boundHandlers.input);
      root.addEventListener('change', boundHandlers.change);
      root.addEventListener('keydown', boundHandlers.keydown);
      root.addEventListener('focusout', boundHandlers.focusout);
      root.addEventListener('dragstart', boundHandlers.dragstart);
      root.addEventListener('dragover', boundHandlers.dragover);
      root.addEventListener('drop', boundHandlers.drop);
      root.addEventListener('dragend', boundHandlers.dragend);
      root.addEventListener('pointerdown', boundHandlers.pointerdown);
      root.addEventListener('pointermove', boundHandlers.pointermove);
      root.addEventListener('pointerup', boundHandlers.pointerup);
      root.addEventListener('pointercancel', boundHandlers.pointercancel);
      root.addEventListener('lostpointercapture', boundHandlers.lostpointercapture);
    } catch (e) { /* 老 WebView 没有事件 API ⇒ 控件只读，不崩 */ }
    append(container, root);
    ensureHeader();
    try {
      if (typeof deps.subscribeChanges === 'function') {
        const un = deps.subscribeChanges((reason) => {
          refresh({ reason: reason || 'external' });
        });
        if (typeof un === 'function') unsubscribe = un;
      }
    } catch (e) { /* 订阅失败不影响手动刷新 */ }
    refresh({ force: true, reason: 'mount' });
    return function cleanup() {
      dispose();
    };
  }

  function refresh(options) {
    const opts = options || {};
    if (disposed || !root || !bodyEl) return;
    const next = buildModel();
    const switched = !!(model && (next.name !== lastPresetName || (lastScenarioRef && next.scenario !== lastScenarioRef)));
    model = next;
    if (switched) {
      if (widthDrag) cancelWidthDrag();
      if (sortDrag) cancelSortDrag();
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      if (pendingSaveToken) {
        pendingSaveToken = null;
        pendingSaveReason = '';
        showToast('预设已切换，待保存的那次已经取消。', 'warn');
      }
      if (pinMode || pinOnDone) {
        /* 外部切走预设：旧的钉选回调不能再执行，避免把作者带回错误页面。 */
        pinMode = false;
        pinOnDone = null;
        showToast('预设已切换，钉选已取消。', 'warn');
      }
    }
    if (editing && (switched || !next.scenarioFound)) {
      if (widthDrag) cancelWidthDrag();
      if (sortDrag) cancelSortDrag();
      editing = false;
      editSections = null;
      editRemovedControls = [];
      editRemovedSections = [];
      layoutError = '';
      layoutQuery = '';
      layoutAddTarget = '';
      newSectionName = '';
      restoreConfirm = false;
      editOpenUid = '';
      editSelectedUid = '';
    editSelectedOption = null;
      editMoreOpen = false;
      editSectionId = '';
      pendingEntrySection = '';
      pendingExitSection = '';
      pendingOpenSection = '';
      editToken = null;
      showToast('预设已切换或条目列表不可读，布局编辑草稿已取消（没有保存到任何预设）。', 'warn');
    }
    if ((contentEdit || contentPick) && (switched || !next.scenarioFound)) {
      const closedEditor = contentEdit;
      if (closedEditor && closedEditor.dirty) rememberContentDraft(contentDraftKeyOf(closedEditor), closedEditor.draft);
      contentEdit = null;
      contentPick = false;
      contentPickQuery = '';
      contentPickGroup = null;
      contentPickOpen = false;
      contentPickShowAll = false;
      showToast(closedEditor
        ? '预设已切换或条目列表不可读，正文编辑已退出；未保存的草稿已保留，回到原预设再打开可继续。'
        : '预设已切换或条目列表不可读，选条目已结束。', 'warn');
    } else if (contentEdit && !contentEdit.saving) {
      const live = livePromptById(next, contentEdit.promptId);
      if (!live) {
        contentEdit.stale = '这条条目已经不在当前预设里；保存会被拒绝，草稿还留着。';
      } else if (typeof live.content === 'string' && live.content !== contentEdit.originalContent) {
        contentEdit.stale = '这条正文在别处有变化；保存会先核对，失败时草稿不会丢。';
      } else {
        contentEdit.stale = '';
      }
    }
    const key = modelKey(next);
    const active = (() => { try { return doc.activeElement; } catch (e) { return null; } })();
    const wordFocused = !!(active && active.hasAttribute && active.hasAttribute('data-ywpc-word-input')
      && root.contains(active));
    if (opts.force || key !== lastKey) {
      if (wordFocused && !opts.force) {
        pendingRebuild = true;
        if (next.name !== lastPresetName) wordError = '预设已切换；这次字数没有提交（离开输入框后会刷新）。';
        updateStatus(next);
        syncUI(next);
        return;
      }
      rebuild(next);
    } else {
      syncUI(next);
    }
    if (contentEdit) updateContentEditorState();
  }

  /* 关闭/换模块时，视图可以立刻拆，但已经提交给 inline 保存的那一次不能吞：
     先把 pending token 抓住，在视图消失后仍按 token 校验调用 saveCurrentPreset。
     切了预设 ⇒ token 不匹配 ⇒ 取消；inline=false ⇒ 不调；结果不写回 UI，不假报。 */
  function flushPendingSaveOnTeardown() {
    const token = pendingSaveToken;
    const reason = pendingSaveReason;
    if (!token) return;
    pendingSaveToken = null;
    pendingSaveReason = '';
    if (!isInlineSaveOn() || !token.name || !tokenCurrent(token)) return;
    if (typeof deps.saveCurrentPreset !== 'function') return;
    const invoke = () => {
      try {
        const result = deps.saveCurrentPreset({
          name: token.name,
          expectedIdentity: token.name,
          reason: reason || 'ywpc-close',
        });
        if (result && typeof result.then === 'function') {
          result.catch(error => {
            try { console.warn('[余小温主控] 关闭时保存预设失败:', error); } catch (e2) { /* 忽略 */ }
          });
        }
      } catch (error) {
        try { console.warn('[余小温主控] 关闭时保存预设失败:', error); } catch (e2) { /* 忽略 */ }
      }
    };
    if (!saveInFlight) { invoke(); return; }
    let tries = 0;
    const tick = () => {
      if (!saveInFlight) {
        if (tokenCurrent(token)) invoke();
        return;
      }
      tries += 1;
      if (tries > 100) return;
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  }

  function teardown() {
    flushPendingSaveOnTeardown();
    disposed = true;
    mounted = false;
    if (widthDrag) {
      widthDrag = null;
      removeWidthWindowListeners();
    }
    if (sortDrag) {
      sortDrag = null;
      removeWidthWindowListeners();
    }
    clearSortGhost();
    clearSortDropLine();
    sortClickGuardUntil = 0;
    sortClickGuardEl = null;
    if (wordCommitTimer) { clearTimeout(wordCommitTimer); wordCommitTimer = 0; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    pendingSaveToken = null;
    pendingSaveReason = '';
    pendingRebuild = false;
    wordDraft = null;
    wordToken = null;
    wordError = '';
    wordField = 'min';
    wordLastRange = null;
    try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (e) { /* 忽略 */ }
    unsubscribe = null;
    removeHeader();
    try {
      if (root) {
        root.removeEventListener('click', boundHandlers.click);
        root.removeEventListener('input', boundHandlers.input);
        root.removeEventListener('change', boundHandlers.change);
        root.removeEventListener('keydown', boundHandlers.keydown);
        root.removeEventListener('focusout', boundHandlers.focusout);
        root.removeEventListener('dragstart', boundHandlers.dragstart);
        root.removeEventListener('dragover', boundHandlers.dragover);
        root.removeEventListener('drop', boundHandlers.drop);
        root.removeEventListener('dragend', boundHandlers.dragend);
        root.removeEventListener('pointerdown', boundHandlers.pointerdown);
        root.removeEventListener('pointermove', boundHandlers.pointermove);
        root.removeEventListener('pointerup', boundHandlers.pointerup);
        root.removeEventListener('pointercancel', boundHandlers.pointercancel);
        root.removeEventListener('lostpointercapture', boundHandlers.lostpointercapture);
      }
    } catch (e) { /* 忽略 */ }
    try { if (root && root.parentNode) root.parentNode.removeChild(root); } catch (e) { /* 忽略 */ }
    root = null;
    bodyEl = null;
    statusEl = null;
    badgeEl = null;
    toastEl = null;
    containerEl = null;
    model = null;
    lastKey = '';
    lastPresetName = '';
    lastScenarioRef = null;
    pickerOpen = false;
    pickerQuery = '';
    if (contentEdit && contentEdit.dirty) rememberContentDraft(contentDraftKeyOf(contentEdit), contentEdit.draft);
    contentPick = false;
    contentPickQuery = '';
    contentPickGroup = null;
    contentPickOpen = false;
    contentPickShowAll = false;
    contentEdit = null;
    editing = false;
    editSections = null;
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    layoutQuery = '';
    layoutAddTarget = '';
    newSectionName = '';
    restoreConfirm = false;
    editOpenUid = '';
    editSelectedUid = '';
    editSelectedOption = null;
    editMoreOpen = false;
    editSectionId = '';
    editGroupPage = 0;
    pendingEntrySection = '';
    pendingExitSection = '';
    pendingOpenSection = '';
    dragState = null;
    editToken = null;
    editSaving = false;
    homeEdit = false;
    homeEditNeedsOpen = false;
    pinMode = false;
    pinOnDone = null;
    pinModeRequest = null;
    headerHostEl = null;
    pinSaving = false;
    pinDrag = null;
    pinDragGuardUntil = 0;
  }

  function dispose() {
    teardown();
  }

  function getSnapshot() {
    const m = model || (root ? buildModel() : null);
    return {
      version: PRESET_CONTROLS_VERSION,
      mounted,
      disposed,
      presetName: m ? m.name : '',
      isV1028: !!(m && m.isV1028),
      scenarioFound: !!(m && m.scenarioFound),
      availableCount: m ? m.availableIds.length : 0,
      shortcuts: m ? m.shortcuts.slice() : [],
      theaterMemory: m ? Object.assign({}, m.theaterMemory) : {},
      wordState: m ? m.wordState : 'missing',
      wordValue: m ? m.wordValue : null,
      wordRule: m && m.wordRule ? { mode: m.wordRule.mode, min: m.wordRule.min, max: m.wordRule.max } : null,
      layoutMissing: m ? m.layoutMissing : 0,
      layoutSource: m ? m.layoutSource : 'default',
      inlineInsertSavePreset: isInlineSaveOn(),
      pendingSave: !!pendingSaveToken,
      saveInFlight,
      pickerOpen,
      compact,
      homeEdit,
      pinMode,
      contentPick,
      contentEditing: !!contentEdit,
      contentEditPromptId: contentEdit ? contentEdit.promptId : '',
      contentEditDirty: contentEdit ? !!contentEdit.dirty : false,
      contentEditSaving: contentEdit ? !!contentEdit.saving : false,
      layoutEditing: !!editing,
      homePins: m && Array.isArray(m.homePins) ? m.homePins.map(pin => Object.assign({}, pin)) : [],
      homePinsStored: !!(m && m.homePinsStored),
    };
  }

  return api;
}
