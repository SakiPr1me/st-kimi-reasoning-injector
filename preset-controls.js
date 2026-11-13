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
} from './preset-control-defs.js?b=v1.4.13';
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
} from './preset-layout.js?b=v1.3.0';

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
const HOME_DEFAULTS_VERSION = 5;
const HOME_THINKING_PIN = Object.freeze({ type: 'combo', key: 'think.model' });
const PIN_TYPES = new Set(['prompt', 'radio', 'combo', 'comboToggle', 'word']);

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
.ywpc-sec-editbar{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0;margin-bottom:2px}
.ywpc-edit-section-title{flex:1;min-width:120px;font-weight:600}
.ywpc-drag{flex:none;width:24px;min-height:30px;display:inline-flex;align-items:center;justify-content:center;color:var(--ywpc-muted);cursor:grab;font-size:14px;line-height:1;user-select:none}
.ywpc-drag:active{cursor:grabbing}
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
.ywpc-edit-card-head{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}
.ywpc-kind{flex:none;padding:1px 6px;border:1px solid var(--ywpc-line);border-radius:999px;color:var(--ywpc-muted);font-size:10px;line-height:1.5;white-space:nowrap}
.ywpc-edit-control-title{flex:1;min-width:110px}
.ywpc-edit-move{max-width:130px}
.ywpc-member-details{border-top:1px solid var(--ywpc-line);padding-top:6px;min-width:0}
.ywpc-member-summary{min-height:30px;display:flex;align-items:center;color:var(--ywpc-muted);font-size:11px;cursor:pointer;list-style:none}
.ywpc-member-summary::-webkit-details-marker{display:none}
.ywpc-member-summary::after{content:"▸";margin-left:auto;font-size:10px;transition:transform .14s ease}
.ywpc-member-details[open]>.ywpc-member-summary::after{transform:rotate(90deg)}
.ywpc-member-editor{display:flex;flex-direction:column;gap:6px;min-width:0}
.ywpc-edit-line{display:flex;align-items:center;gap:6px;min-width:0}
.ywpc-option-editor{display:flex;flex-direction:column;gap:5px;padding:6px;border:1px solid var(--ywpc-line);border-radius:8px;min-width:0}
.ywpc-edit-option-label{width:100%;font-weight:600}
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
  .ywpc-sec[data-ywpc-section="writing"] .ywpc-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ywpc-combo{grid-template-columns:1fr}
  .ywpc-seg{grid-template-columns:repeat(auto-fit,minmax(78px,1fr))}
  .ywpc-root .ywpc-sec-head,.ywpc-root .ywpc-toggle,.ywpc-root .ywpc-chip,.ywpc-root .ywpc-seg-btn,
  .ywpc-root .ywpc-add,.ywpc-root .ywpc-pick-add,.ywpc-root .ywpc-shortcut-remove,
  .ywpc-root .ywpc-picker-search,.ywpc-root .ywpc-word-input,
  .ywpc-root .ywpc-edit-btn,.ywpc-root .ywpc-edit-iconbtn,.ywpc-root .ywpc-edit-input,
  .ywpc-root .ywpc-edit-select,.ywpc-root .ywpc-member-remove,.ywpc-root .ywpc-member-summary{min-height:44px}
  .ywpc-root .ywpc-word-input,.ywpc-root .ywpc-picker-search,
  .ywpc-root .ywpc-edit-input,.ywpc-root .ywpc-edit-select{font-size:16px}
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
.ywpc-root .ywpc-combo[data-ywpc-combo-group="think.model"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.ywpc-root .ywpc-combo[data-ywpc-combo-group="think.model"]>[data-ywpc-value="kimi"]{grid-column:1/-1}
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
  flex:none;width:26px;min-height:32px;display:inline-flex;align-items:center;justify-content:center;
  color:var(--ywpc-muted);cursor:grab;font-size:15px;line-height:1;user-select:none;
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
/* 2026-11-13：思考与功能整组 seg 文字居中；最后的「不开（默认）」不再贴左。 */
.ywpc-sec[data-ywpc-section="think_meta"] .ywpc-seg-btn{align-items:center;text-align:center}
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
/* 首页选项稍收紧；保留完整预设页和布局编辑器的既有热区。 */
.ywpc-compact .ywpc-shortcuts{gap:4px}
.ywpc-compact .ywpc-seg,.ywpc-compact .ywpc-combo{gap:4px}
.ywpc-compact .ywpc-row{gap:3px}
.ywpc-compact .ywpc-sec-body{gap:5px;margin-top:5px}
.ywpc-compact .ywpc-toggle,.ywpc-compact .ywpc-seg-btn{min-height:32px;padding:4px 7px}
@media (max-width:520px){
  .ywpc-root.ywpc-compact .ywpc-toggle,.ywpc-root.ywpc-compact .ywpc-seg-btn{min-height:36px;padding:4px 7px}
}
@media (prefers-reduced-motion:reduce){
  .ywpc-root *{transition:none!important;animation:none!important}
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
  let newSectionName = '';
  let restoreConfirm = false;
  let dragState = null;
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
  const api = {
    version: PRESET_CONTROLS_VERSION,
    mount,
    refresh,
    dispose,
    getSnapshot,
    captureIdentity,
    requestPresetSave,
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
    const withUid = pin => {
      const clean = uid ? { ...pin, uid } : pin;
      return raw.source === 'common' ? { ...clean, source: 'common' } : clean;
    };
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
    const next = orderSpecialHomePins(current);
    ctx.store[ctx.key] = next;
    return next;
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

  /* 布局里新加到 common 的控件 → 首页 pin 描述；toolboxFlag/说明/缺项不落 pin。 */
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

  function storedHomePinsFor(settings, name, available) {
    const store = homePinStoreOf(settings);
    if (!store) return null;
    const key = presetLayoutKey(name, CHARACTER_ID);
    if (!Object.prototype.hasOwnProperty.call(store, key)) return null;
    const raw = store[key];
    if (!Array.isArray(raw)) return null;
    migrateHomePinsOnce(settings, key, raw, available);
    /* 只做视图归一：旧 option pin ⇒ 整组；显式重复实例保留。原数组留在设置里。 */
    return normalizeHomePins(raw);
  }

  /* 默认升级（一次迁移）：
     - 321 新增的两条段落 prompt pin ⇒ 合成一个完整的 writing.paragraph 单选组，
       放在首个段落 pin 原来的位置；其它 pin（含重复实例 uid）原样保留。
     - 更早版本从未迁移过的非空 pins：补一个段落组默认项（只补当前预设真实存在的）。
     - 已有明确段落组副本不去重、不清洗；用户删掉后标记已升级，不再复活。
     - v4 给尚未补齐的非空首页增加思维链整组，和新装同一个默认来源；不切换组内选项。
     空数组 = 用户明确清空，尊重不动（只标已升级）。 */
  function migrateHomePinsOnce(settings, key, raw, available) {
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
    push({ ...HOME_THINKING_PIN });
    push({ type: 'radio', key: PARAGRAPH_RADIO_KEY });
    push({ type: 'radio', key: NARRATION_RADIO_KEY });
    return out;
  }

  function effectiveHomePinsFor(settings, name, shortcuts, sections, available) {
    const stored = storedHomePinsFor(settings, name, available);
    if (stored) {
      // 旧版从常用追加的副本曾落在首页尾部；按仍在常用中的绑定归位，不补回已删项。
      const pins = stored.slice();
      const linked = [];
      for (const id of shortcuts || []) {
        let at = pins.findIndex(pin => pin.type === 'prompt' && pin.id === id && pin.source === 'common');
        if (at < 0) at = pins.reduce((last, pin, index) => pin.type === 'prompt' && pin.id === id ? index : last, -1);
        if (at >= 0) linked.push(pins.splice(at, 1)[0]);
      }
      const lastCommon = pins.reduce((last, pin, index) => pin.type === 'prompt'
        && DEFAULT_COMMON_IDS.includes(pin.id) ? index : last, -1);
      pins.splice(lastCommon + 1, 0, ...linked);
      return { pins: orderSpecialHomePins(pins), stored: true };
    }
    return { pins: orderSpecialHomePins(derivedHomePinsFor(settings, shortcuts, sections)), stored: false };
  }

  /* 作者本次唯一的显式排序例外：Part2 存在时 niah 紧随其后；其余 pin 相对序不变。
     随机头部是 niah 的伴生控件（渲染时跟出，不落 pin），所以这里只动 niah。 */
  function orderSpecialHomePins(list) {
    const pins = Array.isArray(list) ? list.slice() : [];
    const part2 = pins.findIndex(pin => pin && pin.type === 'prompt' && pin.id === ID.break2);
    const niah = pins.findIndex(pin => pin && pin.type === 'prompt' && pin.id === ID.niah);
    if (part2 < 0 || niah < 0 || niah === part2 + 1) return pins;
    const moved = pins.splice(niah, 1)[0];
    const anchor = pins.findIndex(pin => pin && pin.type === 'prompt' && pin.id === ID.break2);
    pins.splice((anchor >= 0 ? anchor : part2) + 1, 0, moved);
    return pins;
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
      const next = orderSpecialThinkControls(before);
      if (next === before) return section;
      changed = true;
      return Object.assign({}, section, { controls: next });
    });
    return changed ? out : list;
  }

  function homePinSignatureOf(state) {
    const list = (state && state.pins) || [];
    return (state && state.stored ? 'S' : 'D') + list.map(homePinKey).join(',');
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
    const baseSections = sectionsForOrder(orderMap, scenario && scenario.order);
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
      m.homePinSignature || '',
      m.shortcuts.join(','),
      (m.shortcutPool || []).map(item => item.id + '=' + item.label).join('|'),
      m.wordState,
      m.availableIds.slice().sort().join(','),
      m.layoutSignature || '',
      editing ? 'E1' : 'E0',
      editSectionId,
      editOpenUid,
      editRemovedControls.slice().sort().join(','),
      editRemovedSections.slice().sort().join(','),
    ].join('|');
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
    if (editing) return true;
    if (control.kind === 'missing') return true;
    if (control.kind === 'shortcuts' || control.kind === 'info') return true;
    /* 随机头部是 niah 的伴生控件：当前预设或当前布局没有 niah 都不强塞。 */
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
      deps.writeToggles(map);
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

  function makeToggle(m, id, label, options) {
    const opts = options || {};
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
    labelEl.textContent = emojiPrefix(label) ? label : withEmoji(emojiPrefix(realName), label);
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

  function renderRadio(m, control) {
    const wrap = createEl(doc, 'div', 'ywpc-row');
    wrap.setAttribute('data-ywpc-pin-group', 'radio:' + control.key);
    const label = createEl(doc, 'span', 'ywpc-control-label');
    label.textContent = displayLabel(m, control);
    append(wrap, label);

    const selected = selectedRadioValue(m, control);
    const available = control.allIds.filter(id => isAvailable(m, id));
    const seg = createEl(doc, 'div', 'ywpc-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', control.label);
    seg.setAttribute('data-ywpc-radio-group', control.key);

    for (const option of control.options) {
      const ids = option.ids || [];
      const optionAvailable = ids.length === 0
        ? available.length > 0
        : ids.every(id => isAvailable(m, id));
      const btn = createEl(doc, 'button', 'ywpc-seg-btn');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-ywpc-radio', control.key);
      btn.setAttribute('data-ywpc-value', option.value);
      btn.setAttribute('data-ywpc-focus-key', 'radio:' + control.key + ':' + option.value);
      btn.setAttribute('aria-checked', selected === option.value ? 'true' : 'false');
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
      append(seg, btn);
    }
    append(wrap, seg);

    const conflict = comboConflict(m, control);
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
    for (const option of control.options) {
      const ids = option.ids || [];
      const optionAvailable = ids.length > 0 && ids.every(id => isAvailable(m, id));
      const btn = createEl(doc, 'button', 'ywpc-seg-btn');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-ywpc-combo', control.key);
      btn.setAttribute('data-ywpc-value', option.value);
      btn.setAttribute('data-ywpc-focus-key', 'combo:' + control.key + ':' + option.value);
      btn.setAttribute('aria-checked', selected === option.value ? 'true' : 'false');
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
      append(grid, btn);
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

  function renderShortcutCard(m, id, fixed, removable, customLabel, pinUid) {
    const card = createEl(doc, 'div', 'ywpc-shortcut');
    card.setAttribute('data-ywpc-shortcut', id);
    const prompt = m.promptById.get(id);
    const present = isAvailable(m, id);
    const ordinary = isOrdinaryPrompt(prompt);
    const usable = present && ordinary;
    const realName = realNameFor(m, id);
    const reason = !present ? '当前预设没有这项' : (!ordinary ? '系统条目，不可切换' : '');
    const toggle = makeToggle(m, id, customLabel || (fixed ? shortLabelFor(id) : realName), {
      sub: '',
      missingText: reason,
      focusKey: 'toggle:' + id,
      availableOverride: usable,
      realName: realName,
      shortcut: true,
    });
    /* 布局实例 uid：同一条 entry 有多份时，首页钉选/排序按实例区分。 */
    if (pinUid) toggle.setAttribute('data-ywpc-pin-uid', String(pinUid));
    append(card, toggle);
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
    subEl.setAttribute('data-ywpc-sub-default', usable ? (on ? '已开启' : '已关闭') : '工具箱开关接口未就绪');
    subEl.textContent = usable ? (on ? '已开启' : '已关闭') : '工具箱开关接口未就绪';
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

  /* compact 有显式钉选键时：只按保存顺序画卡片；单条/组合开关沿用原有真实卡片，
     单选/组合整组复用预设页的 renderRadio/renderCombo（组小标题 + 全部选项）。 */
  function renderPinBoard(m, section) {
    const wrap = createEl(doc, 'div', 'ywpc-row ywpc-shortcut-wrap');
    wrap.setAttribute('data-ywpc-pin-board', '1');
    const grid = createEl(doc, 'div', 'ywpc-shortcuts');
    grid.setAttribute('data-ywpc-shortcut-grid', '1');
    let randHeadDone = false;
    for (const pin of m.homePins) {
      if (pin.type === 'prompt') {
        const card = renderShortcutCard(m, pin.id, false, false, pinPromptLabel(m, pin.id), pin.uid || '');
        /* 随机头部不是 pin，也没有 preset id：只作为 niah 的伴生控件，
           与 niah 固定同一行；缺 niah / 当前预设没有 niah 时都不强塞。 */
        if (!randHeadDone && pin.id === ID.niah && RAND_HEAD_DEF && isAvailable(m, ID.niah)) {
          append(grid, renderInlinePair(card, renderToolboxFlagCard(m, RAND_HEAD_DEF)));
          randHeadDone = true;
        } else {
          append(grid, card);
        }
      } else if (pin.type === 'comboToggle') {
        const def = definitionForKey(m, pin.key, ['comboToggle']);
        if (def) append(grid, renderShortcutComboCard(m, def));
        else append(grid, renderMissingShortcutCard({
          key: pin.key,
          label: '组合开关',
          _ref: { type: 'builtin', key: 'group:' + pin.key },
          _missingReason: '这个组合已不在当前布局',
        }));
      } else if (pin.type === 'word') {
        const holder = createEl(doc, 'div', 'ywpc-pin-word');
        const resolved = resolveHomePin(m, pin);
        if (resolved.available) {
          /* compact 首页复用原字数控件：改动仍走 commitWordRule 原保存链。 */
          append(holder, renderWord(m));
        } else {
          append(holder, renderMissingShortcutCard({
            _ref: { type: 'builtin', key: 'word:' + pin.id },
            label: '🔢 正文字数',
            _missingReason: resolved.sub || '字数控件当前不可用',
          }));
        }
        append(grid, holder);
      } else if (pin.type === 'radio' || pin.type === 'combo') {
        /* 整组 pin：复用完整预设页的 renderRadio/renderCombo，组小标题一起搬到首页；
           316 旧 option pin 已在模型归一成这种整组 pin，不再画单选项卡。 */
        const def = definitionForKey(m, pin.key, [pin.type]);
        const holder = createEl(doc, 'div', 'ywpc-pin-group');
        holder.setAttribute('data-ywpc-pin-group-holder', pin.type + ':' + pin.key);
        if (def && def.kind === pin.type) {
          append(holder, pin.type === 'radio' ? renderRadio(m, def) : renderCombo(m, def));
        } else {
          append(holder, renderMissingShortcutCard({
            key: pin.key,
            label: '选择组',
            _ref: { type: 'builtin', key: 'group:' + pin.type + ':' + pin.key },
            _missingReason: '这个选择组已不在当前布局',
          }));
        }
        append(grid, holder);
      } else {
        append(grid, renderPinOptionCard(m, pin));
      }
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

  function renderPinEditRow(m, pin, index, total) {
    const resolved = resolveHomePin(m, pin);
    const row = createEl(doc, 'div', 'ywpc-pin-row');
    row.setAttribute('data-ywpc-pin-row', encodeHomePin(pin));
    row.setAttribute('data-ywpc-pin-index', String(index));
    row.setAttribute('draggable', 'true');
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
    if (kind === 'missing') return '缺项';
    return '开关';
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
    editSectionId = editSections[0] ? editSections[0].id : '';
    editOpenUid = '';
    newSectionName = '';
    restoreConfirm = false;
    refresh({ force: true, reason: 'layout-edit-open' });
    return true;
  }

  function cancelEdit() {
    if (!editing) return;
    editing = false;
    editSections = null;
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    layoutQuery = '';
    layoutAddTarget = '';
    editSectionId = '';
    editOpenUid = '';
    newSectionName = '';
    restoreConfirm = false;
    editToken = null;
    refresh({ force: true, reason: 'layout-edit-cancel' });
    showToast('已取消布局编辑；没有保存任何布局改动。', 'info');
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
    if (request && request.result && typeof request.result.then === 'function') {
      await request.result;
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
    editSectionId = '';
    editOpenUid = '';
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
    editSectionId = '';
    editOpenUid = '';
    editToken = null;
    if (request && request.confirmed) {
      showToast('已恢复当前预设的内置默认布局；别的预设没有动。', 'ok');
    } else {
      showToast('已恢复当前预设默认布局，正在保存设置；别的预设没有动。', 'warn');
    }
    refresh({ force: true, reason: 'layout-restored' });
    return true;
  }

  function moveSectionBy(sectionId, delta) {
    const sections = editSectionsOfModel();
    const index = sections.findIndex(section => section.id === sectionId);
    const target = index + Number(delta);
    if (index < 0 || target < 0 || target >= sections.length) return false;
    const item = sections.splice(index, 1)[0];
    sections.splice(target, 0, item);
    refresh({ force: true, reason: 'layout-section-move' });
    return true;
  }

  function moveControlBy(uid, delta) {
    const hit = findEditControl(uid);
    if (!hit) return false;
    const target = hit.index + Number(delta);
    if (target < 0 || target >= hit.section.controls.length) return false;
    const item = hit.section.controls.splice(hit.index, 1)[0];
    hit.section.controls.splice(target, 0, item);
    refresh({ force: true, reason: 'layout-control-move' });
    return true;
  }

  function moveControlToSection(uid, sectionId) {
    const hit = findEditControl(uid);
    const target = findEditSection(sectionId);
    if (!hit || !target || hit.section === target) return false;
    hit.section.controls.splice(hit.index, 1);
    target.controls.push(hit.control);
    editSectionId = target.id;
    refresh({ force: true, reason: 'layout-control-move-group' });
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
    editSectionId = 'custom-' + seq;
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
    section.controls.push({
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
    });
    layoutAddTarget = '';
    layoutQuery = '';
    layoutError = '';
    showToast('已加入布局；没有往有效条目列表新增任何条目。', 'ok');
    refresh({ force: true, reason: 'layout-add-prompt' });
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
    if (!['radio', 'combo', 'comboToggle'].includes(kind)) return false;
    let seq = 1;
    while (editSectionsOfModel().some(item => (item.controls || []).some(control =>
      control.key === 'custom.' + kind + '.' + seq))) seq += 1;
    const key = 'custom.' + kind + '.' + seq;
    const label = kind === 'radio' ? '新建单选' : (kind === 'combo' ? '新建组合' : '新建开关组');
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
      control.allowNone = true;
    } else {
      control.members = [];
    }
    section.controls.push(control);
    layoutError = '';
    showToast('已新建' + label + '；在「成员与选择关系」加成员后保存。', 'ok');
    refresh({ force: true, reason: 'layout-add-group' });
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
      if (seen.has(id)) continue;
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
    const btn = createEl(doc, 'button', 'ywpc-edit-btn');
    btn.type = 'button';
    btn.textContent = '编辑布局';
    btn.setAttribute('data-ywpc-action', 'layout-open');
    btn.setAttribute('data-ywpc-focus-key', 'layout:open');
    append(bar, btn);
    return bar;
  }

  function renderLayoutToolbar(m) {
    const bar = createEl(doc, 'section', 'ywpc-edit-bar');
    bar.setAttribute('data-ywpc-layout-editor', '1');
    const head = createEl(doc, 'div', 'ywpc-edit-head');
    const title = createEl(doc, 'strong', 'ywpc-edit-title');
    title.textContent = '布局编辑 · ' + (m.name || '当前预设');
    append(head, title);
    const hint = createEl(doc, 'span', 'ywpc-edit-hint');
    hint.textContent = '只改主控显示，不改原预设和开关状态。';
    append(head, hint);
    append(bar, head);

    const actions = createEl(doc, 'div', 'ywpc-edit-actions');
    const save = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-primary');
    save.type = 'button';
    save.textContent = '保存布局';
    save.setAttribute('data-ywpc-action', 'layout-save');
    save.setAttribute('data-ywpc-focus-key', 'layout:save');
    if (typeof deps.saveSettings !== 'function' && typeof deps.saveSettingsNow !== 'function') save.disabled = true;
    if (editSaving) save.disabled = true;
    append(actions, save);

    const cancel = createEl(doc, 'button', 'ywpc-edit-btn');
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.setAttribute('data-ywpc-action', 'layout-cancel');
    cancel.setAttribute('data-ywpc-focus-key', 'layout:cancel');
    append(actions, cancel);

    const restore = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-warn');
    restore.type = 'button';
    restore.textContent = restoreConfirm ? '确认恢复当前预设默认' : '仅恢复当前预设默认布局';
    restore.setAttribute('data-ywpc-action', 'layout-restore');
    restore.setAttribute('data-ywpc-focus-key', 'layout:restore');
    if (!m.hasSavedLayout) {
      restore.disabled = true;
      restore.title = '当前预设本来就是内置默认布局';
    }
    append(actions, restore);
    if (restoreConfirm) {
      const back = createEl(doc, 'button', 'ywpc-edit-btn');
      back.type = 'button';
      back.textContent = '先不恢复';
      back.setAttribute('data-ywpc-action', 'layout-restore-cancel');
      back.setAttribute('data-ywpc-focus-key', 'layout:restore-cancel');
      append(actions, back);
    }
    append(bar, actions);

    if (layoutError) {
      const error = createEl(doc, 'p', 'ywpc-edit-error');
      error.setAttribute('data-ywpc-layout-error', '1');
      error.textContent = layoutError;
      append(bar, error);
    }

    const addRow = createEl(doc, 'div', 'ywpc-edit-add-row');
    const input = createEl(doc, 'input', 'ywpc-edit-input');
    input.type = 'text';
    input.placeholder = '新分组显示名';
    input.value = newSectionName;
    input.setAttribute('data-ywpc-layout-input', 'new-section');
    input.setAttribute('data-ywpc-focus-key', 'layout:new-section');
    input.setAttribute('aria-label', '新分组显示名');
    append(addRow, input);
    const add = createEl(doc, 'button', 'ywpc-edit-btn');
    add.type = 'button';
    add.textContent = '＋ 新增分组';
    add.setAttribute('data-ywpc-action', 'layout-add-section');
    add.setAttribute('data-ywpc-focus-key', 'layout:add-section');
    append(addRow, add);
    append(bar, addRow);

    const groupRow = createEl(doc, 'div', 'ywpc-edit-add-row');
    const kindSelect = createEl(doc, 'select', 'ywpc-edit-select');
    kindSelect.setAttribute('data-ywpc-layout-new-kind', '1');
    kindSelect.setAttribute('data-ywpc-focus-key', 'layout:new-kind');
    kindSelect.setAttribute('aria-label', '新建控件类型');
    for (const [value, label] of [['radio', '新建单选'], ['combo', '新建组合'], ['comboToggle', '新建开关组']]) {
      const opt = createEl(doc, 'option');
      opt.value = value;
      opt.textContent = label;
      append(kindSelect, opt);
    }
    append(groupRow, kindSelect);
    const sectionSelect = createEl(doc, 'select', 'ywpc-edit-select');
    sectionSelect.setAttribute('data-ywpc-layout-new-section', '1');
    sectionSelect.setAttribute('data-ywpc-focus-key', 'layout:new-group-section');
    sectionSelect.setAttribute('aria-label', '新建控件放到哪个分组');
    for (const section of editSectionsOfModel()) {
      const opt = createEl(doc, 'option');
      opt.value = section.id;
      opt.textContent = section.label || section.id;
      append(sectionSelect, opt);
    }
    append(groupRow, sectionSelect);
    const addGroup = createEl(doc, 'button', 'ywpc-edit-btn');
    addGroup.type = 'button';
    addGroup.textContent = '＋ 空组合';
    addGroup.setAttribute('data-ywpc-action', 'layout-add-group');
    addGroup.setAttribute('data-ywpc-focus-key', 'layout:add-group');
    append(groupRow, addGroup);
    append(bar, groupRow);
    return bar;
  }

  function renderSectionEditBar(section, index, total, m) {
    const bar = createEl(doc, 'div', 'ywpc-sec-editbar');
    const drag = createEl(doc, 'span', 'ywpc-drag');
    drag.textContent = '⠿';
    drag.title = '拖动排序';
    drag.setAttribute('draggable', 'true');
    drag.setAttribute('data-ywpc-drag', 'section');
    drag.setAttribute('data-ywpc-drag-id', section.id);
    append(bar, drag);
    const input = createEl(doc, 'input', 'ywpc-edit-input ywpc-edit-section-title');
    input.type = 'text';
    input.value = section.label || '';
    input.setAttribute('data-ywpc-layout-input', 'section-title');
    input.setAttribute('data-ywpc-section-id', section.id);
    input.setAttribute('data-ywpc-focus-key', 'layout:section:' + section.id + ':title');
    input.setAttribute('aria-label', '分组显示名');
    append(bar, input);
    const up = createEl(doc, 'button', 'ywpc-edit-iconbtn');
    up.type = 'button';
    up.textContent = '↑';
    up.title = '分组上移';
    up.setAttribute('data-ywpc-action', 'layout-section-up');
    up.setAttribute('data-ywpc-section-id', section.id);
    up.setAttribute('data-ywpc-focus-key', 'layout:section:' + section.id + ':up');
    if (index <= 0) up.disabled = true;
    append(bar, up);
    const down = createEl(doc, 'button', 'ywpc-edit-iconbtn');
    down.type = 'button';
    down.textContent = '↓';
    down.title = '分组下移';
    down.setAttribute('data-ywpc-action', 'layout-section-down');
    down.setAttribute('data-ywpc-section-id', section.id);
    down.setAttribute('data-ywpc-focus-key', 'layout:section:' + section.id + ':down');
    if (index >= total - 1) down.disabled = true;
    append(bar, down);
    const add = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
    add.type = 'button';
    add.textContent = '＋ 添加条目';
    add.setAttribute('data-ywpc-action', 'layout-add-open');
    add.setAttribute('data-ywpc-section-id', section.id);
    add.setAttribute('data-ywpc-focus-key', 'layout:section:' + section.id + ':add');
    append(bar, add);
    return bar;
  }

  function ensureEditSelection() {
    const sections = editSectionsOfModel();
    if (!sections.some(section => section.id === editSectionId)) {
      editSectionId = sections[0] ? sections[0].id : '';
    }
    if (editOpenUid && !findEditControl(editOpenUid)) editOpenUid = '';
  }

  function selectEditSection(sectionId) {
    if (!findEditSection(sectionId)) return false;
    editSectionId = sectionId;
    editOpenUid = '';
    layoutAddTarget = '';
    layoutQuery = '';
    layoutError = '';
    refresh({ force: true, reason: 'layout-section-select' });
    return true;
  }

  function toggleEditControl(uid) {
    if (!findEditControl(uid)) return false;
    editOpenUid = editOpenUid === uid ? '' : uid;
    refresh({ force: true, reason: 'layout-control-focus' });
    return true;
  }

  function renderEditGroupList(m) {
    const wrap = createEl(doc, 'div', 'ywpc-edit-groups');
    wrap.setAttribute('data-ywpc-edit-groups', '1');
    const label = createEl(doc, 'span', 'ywpc-edit-groups-label');
    label.textContent = '分组';
    append(wrap, label);
    for (const section of editSectionsOfModel()) {
      const btn = createEl(doc, 'button', 'ywpc-edit-group');
      btn.type = 'button';
      btn.textContent = section.label || section.id;
      btn.setAttribute('data-ywpc-action', 'layout-select-section');
      btn.setAttribute('data-ywpc-section-id', section.id);
      btn.setAttribute('data-ywpc-focus-key', 'layout:select-section:' + section.id);
      if (section.id === editSectionId) btn.classList.add('ywpc-current');
      append(wrap, btn);
    }
    return wrap;
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

  function renderEditRow(m, section, control, index) {
    const uid = controlUid(control);
    const row = createEl(doc, 'div', 'ywpc-edit-row');
    row.setAttribute('data-ywpc-edit-row', uid);
    const main = createEl(doc, 'div', 'ywpc-edit-row-main');
    const kind = createEl(doc, 'span', 'ywpc-kind');
    kind.textContent = layoutKindLabel(control);
    const name = createEl(doc, 'span', 'ywpc-edit-row-name');
    name.textContent = control.label || '未命名控件';
    const bind = createEl(doc, 'span', 'ywpc-edit-row-bind');
    bind.textContent = controlBindingText(m, control);
    append(main, kind);
    append(main, name);
    append(main, bind);
    append(row, main);

    const up = createEl(doc, 'button', 'ywpc-edit-iconbtn');
    up.type = 'button';
    up.textContent = '↑';
    up.title = '上移';
    up.setAttribute('data-ywpc-action', 'layout-control-up');
    up.setAttribute('data-ywpc-uid', uid);
    up.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':row-up');
    if (index <= 0) up.disabled = true;
    append(row, up);
    const down = createEl(doc, 'button', 'ywpc-edit-iconbtn');
    down.type = 'button';
    down.textContent = '↓';
    down.title = '下移';
    down.setAttribute('data-ywpc-action', 'layout-control-down');
    down.setAttribute('data-ywpc-uid', uid);
    down.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':row-down');
    if (index >= section.controls.length - 1) down.disabled = true;
    append(row, down);
    const edit = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
    edit.type = 'button';
    edit.textContent = control.kind === 'missing' ? '修复' : (editOpenUid === uid ? '收起' : '编辑');
    edit.setAttribute('data-ywpc-action', 'layout-edit-control');
    edit.setAttribute('data-ywpc-uid', uid);
    edit.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':row-edit');
    append(row, edit);
    const del = createEl(doc, 'button', 'ywpc-edit-iconbtn ywpc-edit-danger');
    del.type = 'button';
    del.textContent = '×';
    del.title = '从布局移除（不删条目、不改开关）';
    del.setAttribute('data-ywpc-action', 'layout-delete-control');
    del.setAttribute('data-ywpc-uid', uid);
    del.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':row-delete');
    append(row, del);
    if (editOpenUid === uid) append(row, renderControlEditor(m, section, control, index));
    return row;
  }

  function renderEditSectionPane(m, section, index, total) {
    const pane = createEl(doc, 'div', 'ywpc-edit-pane');
    pane.setAttribute('data-ywpc-edit-pane', '1');
    pane.setAttribute('data-ywpc-edit-section', section.id);
    append(pane, renderSectionEditBar(section, index, total, m));
    if (layoutAddTarget === section.id) append(pane, renderLayoutPicker(m));
    const list = createEl(doc, 'div', 'ywpc-edit-list');
    list.setAttribute('data-ywpc-edit-list', section.id);
    const controls = section.controls || [];
    if (!controls.length) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = '这个分组还没有控件；点「＋ 添加条目」或新建组合控件。';
      append(list, empty);
    } else {
      controls.forEach((control, controlIndex) => {
        append(list, renderEditRow(m, section, control, controlIndex));
      });
    }
    append(pane, list);
    return pane;
  }

  function renderLayoutPicker(m) {
    const panel = createEl(doc, 'div', 'ywpc-layout-picker');
    panel.setAttribute('data-ywpc-layout-picker', '1');
    const head = createEl(doc, 'div', 'ywpc-picker-head');
    const search = createEl(doc, 'input', 'ywpc-picker-search');
    search.type = 'search';
    search.placeholder = '搜当前预设的条目名…';
    search.value = layoutQuery;
    search.setAttribute('data-ywpc-layout-search', '1');
    search.setAttribute('data-ywpc-focus-key', 'layout:search');
    search.setAttribute('aria-label', '搜索当前预设的条目');
    append(head, search);
    const close = createEl(doc, 'button', 'ywpc-add');
    close.type = 'button';
    close.textContent = '收起';
    close.setAttribute('data-ywpc-action', 'layout-add-close');
    close.setAttribute('data-ywpc-focus-key', 'layout:add-close');
    append(head, close);
    append(panel, head);
    const list = createEl(doc, 'div', 'ywpc-picker-list');
    list.setAttribute('data-ywpc-layout-list', '1');
    append(panel, list);
    renderLayoutPickerList(list, m);
    return panel;
  }

  function renderLayoutPickerList(list, m) {
    clearNode(list);
    const query = normalizeSearch(layoutQuery);
    const used = manageUsedPromptIds(m, editSectionsOfModel());
    let shown = 0;
    for (const row of promptRowsForLayout(m)) {
      if (query && layoutSearchText(row).indexOf(query) < 0) continue;
      shown += 1;
      const item = createEl(doc, 'div', 'ywpc-pick-row');
      const main = createEl(doc, 'div', 'ywpc-pick-main');
      const label = createEl(doc, 'span', 'ywpc-pick-label');
      label.textContent = row.name;
      const sub = createEl(doc, 'span', 'ywpc-pick-sub');
      const isUsed = used.has(row.id);
      sub.textContent = !row.inOrder
        ? '不在有效条目列表 · 不能添加'
        : (!row.ordinary ? '系统条目 · 不能当开关' : (isUsed ? '已在布局里 · 可再加一份独立实例' : '在有效条目列表 · 可添加'));
      append(main, label);
      append(main, sub);
      append(item, main);
      const add = createEl(doc, 'button', 'ywpc-pick-add');
      add.type = 'button';
      add.textContent = !row.inOrder ? '不在列表' : (!row.ordinary ? '不可用' : (isUsed ? '再加一份' : '添加'));
      add.setAttribute('data-ywpc-action', 'layout-add-prompt');
      add.setAttribute('data-ywpc-prompt-id', row.id);
      add.setAttribute('data-ywpc-section-id', layoutAddTarget);
      add.setAttribute('data-ywpc-focus-key', 'layout:add-prompt:' + row.id + (isUsed ? ':dup' : ''));
      if (!row.inOrder || !row.ordinary) add.disabled = true;
      append(item, add);
      append(list, item);
    }
    if (!shown) {
      const empty = createEl(doc, 'p', 'ywpc-empty');
      empty.textContent = '没搜到条目。';
      append(list, empty);
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

  function renderMemberEditor(m, control) {
    const box = createEl(doc, 'div', 'ywpc-member-editor');
    const isOptions = control.kind === 'radio' || control.kind === 'combo';
    if (isOptions) {
      const relation = createEl(doc, 'select', 'ywpc-edit-select');
      relation.setAttribute('data-ywpc-layout-relation', controlUid(control));
      relation.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':relation');
      relation.setAttribute('aria-label', '选择关系');
      const options = [
        ['exactlyOne', '单选：必须选一个'],
        ['atMostOne', '最多选一个（可全关）'],
      ];
      for (const [value, label] of options) {
        const opt = createEl(doc, 'option');
        opt.value = value;
        opt.textContent = label;
        if ((value === 'exactlyOne' && control.exactlyOne) || (value === 'atMostOne' && control.atMostOne)) opt.selected = true;
        append(relation, opt);
      }
      const line = createEl(doc, 'label', 'ywpc-edit-line');
      line.appendChild(relation);
      append(box, line);
    }
    if (control.kind === 'radio' || control.kind === 'combo') {
      (control.options || []).forEach((option, optionIndex) => {
        const optionBox = createEl(doc, 'div', 'ywpc-option-editor');
        const label = createEl(doc, 'input', 'ywpc-edit-input ywpc-edit-option-label');
        label.type = 'text';
        label.value = option.label || '';
        label.setAttribute('data-ywpc-layout-input', 'option-label');
        label.setAttribute('data-ywpc-uid', controlUid(control));
        label.setAttribute('data-ywpc-option-index', String(optionIndex));
        label.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':option:' + optionIndex + ':label');
        label.setAttribute('aria-label', '选项显示名');
        append(optionBox, label);
        append(optionBox, renderMemberChips(m, control, option, optionIndex));
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
        append(optionBox, add);
        append(box, optionBox);
      });
      const addOption = createEl(doc, 'button', 'ywpc-edit-btn ywpc-edit-small');
      addOption.type = 'button';
      addOption.textContent = '＋ 选项';
      addOption.setAttribute('data-ywpc-action', 'layout-add-option');
      addOption.setAttribute('data-ywpc-uid', controlUid(control));
      addOption.setAttribute('data-ywpc-focus-key', 'layout:' + controlUid(control) + ':add-option');
      append(box, addOption);
    } else if (control.kind === 'comboToggle' || control.kind === 'multi') {
      append(box, renderMemberChips(m, control, null, -1));
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
      append(box, add);
    }
    return box;
  }

  function renderControlEditor(m, section, control, controlIndex) {
    const uid = controlUid(control);
    const card = createEl(doc, 'div', 'ywpc-edit-card');
    card.setAttribute('data-ywpc-edit-control', uid);
    const head = createEl(doc, 'div', 'ywpc-edit-card-head');
    const drag = createEl(doc, 'span', 'ywpc-drag');
    drag.textContent = '⠿';
    drag.title = '拖动排序';
    drag.setAttribute('draggable', 'true');
    drag.setAttribute('data-ywpc-drag', 'control');
    drag.setAttribute('data-ywpc-drag-uid', uid);
    drag.setAttribute('data-ywpc-section-id', section.id);
    append(head, drag);
    const kind = createEl(doc, 'span', 'ywpc-kind');
    kind.textContent = layoutKindLabel(control);
    append(head, kind);
    const title = createEl(doc, 'input', 'ywpc-edit-input ywpc-edit-control-title');
    title.type = 'text';
    title.value = control.label || '';
    title.placeholder = '显示名（可带 emoji；不改原条目名）';
    title.setAttribute('data-ywpc-layout-input', 'control-title');
    title.setAttribute('data-ywpc-uid', uid);
    title.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':title');
    title.setAttribute('aria-label', '控件显示名');
    append(head, title);
    const up = createEl(doc, 'button', 'ywpc-edit-iconbtn');
    up.type = 'button';
    up.textContent = '↑';
    up.title = '上移';
    up.setAttribute('data-ywpc-action', 'layout-control-up');
    up.setAttribute('data-ywpc-uid', uid);
    up.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':up');
    if (controlIndex <= 0) up.disabled = true;
    append(head, up);
    const down = createEl(doc, 'button', 'ywpc-edit-iconbtn');
    down.type = 'button';
    down.textContent = '↓';
    down.title = '下移';
    down.setAttribute('data-ywpc-action', 'layout-control-down');
    down.setAttribute('data-ywpc-uid', uid);
    down.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':down');
    if (controlIndex >= section.controls.length - 1) down.disabled = true;
    append(head, down);
    const move = createEl(doc, 'select', 'ywpc-edit-select ywpc-edit-move');
    move.setAttribute('data-ywpc-layout-move', uid);
    move.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':group');
    move.setAttribute('aria-label', '移到分组');
    for (const target of editSectionsOfModel()) {
      const opt = createEl(doc, 'option');
      opt.value = target.id;
      opt.textContent = target.label || target.id;
      if (target.id === section.id) opt.selected = true;
      append(move, opt);
    }
    append(head, move);
    const del = createEl(doc, 'button', 'ywpc-edit-iconbtn ywpc-edit-danger');
    del.type = 'button';
    del.textContent = '×';
    del.title = '从布局移除（不删条目、不改开关）';
    del.setAttribute('data-ywpc-action', 'layout-delete-control');
    del.setAttribute('data-ywpc-uid', uid);
    del.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':delete');
    append(head, del);
    append(card, head);

    const bound = createEl(doc, 'p', 'ywpc-edit-note');
    bound.setAttribute('data-ywpc-edit-binding', uid);
    bound.textContent = controlBindingText(m, control);
    append(card, bound);

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
      append(card, rebind);
      return card;
    }

    const sub = createEl(doc, 'input', 'ywpc-edit-input ywpc-edit-control-sub');
    sub.type = 'text';
    sub.value = control.sub || '';
    sub.placeholder = '副标题 / 说明（可选）';
    sub.setAttribute('data-ywpc-layout-input', 'control-sub');
    sub.setAttribute('data-ywpc-uid', uid);
    sub.setAttribute('data-ywpc-focus-key', 'layout:control:' + uid + ':sub');
    sub.setAttribute('aria-label', '控件副标题');
    append(card, sub);

    if (control.kind === 'radio' || control.kind === 'combo' || control.kind === 'comboToggle' || control.kind === 'multi') {
      const details = createEl(doc, 'details', 'ywpc-member-details');
      const summary = createEl(doc, 'summary', 'ywpc-member-summary');
      summary.textContent = '成员与选择关系';
      append(details, summary);
      append(details, renderMemberEditor(m, control));
      append(card, details);
    } else if (control.kind === 'word') {
      const note = createEl(doc, 'p', 'ywpc-edit-note');
      note.textContent = '只改显示，不改字数正文。';
      append(card, note);
    } else if (control.kind === 'shortcuts' || control.kind === 'info') {
      const note = createEl(doc, 'p', 'ywpc-edit-note');
      note.textContent = control.kind === 'shortcuts'
        ? '布局只改它显示在哪一组。'
        : '说明文字，不会写进预设。';
      append(card, note);
    }
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
    if (control.kind === 'missing') return renderMissingControl(control);
    switch (control.kind) {
      case 'toggle':
      case 'action':
        return makeToggle(m, control.id, control.label, {
          sub: control.sub || '',
          missingText: '当前预设没有这项',
          realName: realNameFor(m, control.id),
        });
      case 'radio': return renderRadio(m, control);
      case 'combo': return renderCombo(m, control);
      case 'comboToggle': return renderComboToggle(m, control);
      case 'multi': return renderMulti(m, control);
      case 'word': return renderWord(m);
      case 'toolboxFlag': return (isAvailable(m, ID.niah) && layoutHasPromptControl(m, ID.niah))
        ? renderToolboxFlagCard(m, control) : null;
      case 'shortcuts': return renderShortcuts(m, section);
      /* 说明控件不占位：空 info 也不画任何占位块。 */
      case 'info': return null;
      default: return null;
    }
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

  function renderSection(m, section, index, total) {
    const visible = editing ? (section.controls || []) : visibleControls(m, section);
    if (!visible.length && !editing) return null;
    const sec = createEl(doc, 'details', 'ywpc-sec');
    sec.setAttribute('data-ywpc-section', section.id);
    setSectionOpen(sec, false);
    append(sec, makeSectionHead(section, m, visible));
    const body = createEl(doc, 'div', 'ywpc-sec-body');
    if (editing) {
      append(body, renderSectionEditBar(section, index, total, m));
      visible.forEach((control, controlIndex) => {
        append(body, renderControlEditor(m, section, control, controlIndex));
      });
      if (!visible.length) {
        const empty = createEl(doc, 'p', 'ywpc-empty');
        empty.textContent = '这个分组还没有控件；点「＋ 控件」添加条目。';
        append(body, empty);
      }
      if (layoutAddTarget === section.id) append(body, renderLayoutPicker(m));
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
    } else if (section.id === 'think_meta') {
      /* niah 与随机头部固定同一行；随机头仍只走 deps，不落 pin、不冒充条目。 */
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
      if (editing) {
        append(bodyEl, renderLayoutToolbar(m));
        ensureEditSelection();
        append(bodyEl, renderEditGroupList(m));
        const editList = editSectionsOfModel();
        const editIndex = editList.findIndex(section => section.id === editSectionId);
        if (editIndex >= 0) {
          append(bodyEl, renderEditSectionPane(m, editList[editIndex], editIndex, editList.length));
          sections = 1;
        } else {
          const empty = createEl(doc, 'p', 'ywpc-empty');
          empty.textContent = '还没有分组；先在上方输入显示名并点「＋ 新增分组」。';
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

  function captureScroll() {
    try {
      return {
        container: containerEl ? Number(containerEl.scrollTop) || 0 : 0,
        root: root ? Number(root.scrollTop) || 0 : 0,
      };
    } catch (e) {
      return { container: 0, root: 0 };
    }
  }

  function restoreScroll(saved) {
    try {
      if (containerEl && saved) containerEl.scrollTop = saved.container;
      if (root && saved) root.scrollTop = saved.root;
    } catch (e) { /* 滚动恢复失败不影响功能 */ }
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
    buildBody(m);
    lastKey = modelKey(m);
    restoreOpenSections(openSections, samePreset);
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
    const selected = new Set(option.ids);
    const map = {};
    for (const id of def.allIds) {
      if (isAvailable(m, id)) map[id] = selected.has(id);
    }
    if (def.masterId && value !== 'none' && isAvailable(m, def.masterId)) map[def.masterId] = true;
    let changed = false;
    for (const id of Object.keys(map)) {
      if (m.toggles[id] !== map[id]) changed = true;
    }
    if (!changed) return true;
    return writeToggleMap(map, 'ywpc-radio', token);
  }

  /* 段落风格：点当前已选项 = 全部关（原两条可同时关），不另加“不开”第三张主卡。 */
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
    const selected = new Set(option.ids);
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
    const clean = orderSpecialHomePins(normalizeHomePins(nextPins));
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

  function pinCandidateFromTarget(target) {
    if (!target) return null;
    const comboToggle = closest(target, '[data-ywpc-combo-toggle]');
    if (comboToggle) {
      const key = comboToggle.getAttribute('data-ywpc-combo-toggle');
      return key ? { type: 'comboToggle', key } : null;
    }
    const radio = closest(target, '[data-ywpc-radio]');
    if (radio) {
      if (radio.disabled) return null;
      const key = radio.getAttribute('data-ywpc-radio');
      /* 点二选一里的任意选项 = 钉整个选择组（带组小标题），不钉单选项。 */
      return key ? { type: 'radio', key } : null;
    }
    const combo = closest(target, '[data-ywpc-combo]');
    if (combo) {
      if (combo.disabled) return null;
      const key = combo.getAttribute('data-ywpc-combo');
      /* 点组合里的任意选项 = 钉整个组合组，不钉单选项。 */
      return key ? { type: 'combo', key } : null;
    }
    /* 点组标题/组说明也按整组钉；选项按钮已在上面先处理。 */
    const group = closest(target, '[data-ywpc-pin-group]');
    if (group) {
      const raw = String(group.getAttribute('data-ywpc-pin-group') || '');
      const at = raw.indexOf(':');
      const type = at > 0 ? raw.slice(0, at) : '';
      const key = at > 0 ? raw.slice(at + 1) : '';
      if ((type === 'radio' || type === 'combo') && key) return { type, key };
    }
    const toggle = closest(target, '[data-ywpc-toggle]');
    if (toggle) {
      const id = toggle.getAttribute('data-ywpc-toggle');
      const uid = toggle.getAttribute('data-ywpc-pin-uid') || '';
      return id ? { type: 'prompt', id, ...(uid ? { uid } : {}) } : null;
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

  function onClick(event) {
    const target = event.target;
    if (!target) return;
    /* 拖动结束后，浏览器还会补一次 click；整理模式里先吞掉这次，避免误触。 */
    if (pinDragGuardUntil && Date.now() < pinDragGuardUntil) {
      pinDragGuardUntil = 0;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    /* 同级手风琴：点组头只开这一组；再点已开的那组就全收。手动处理，避免重建 DOM。 */
    const summaryEl = closest(target, 'summary.ywpc-sec-head');
    if (summaryEl && summaryEl.parentElement) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      toggleAccordion(summaryEl.parentElement);
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
      if (action === 'layout-open') { beginEdit(); return; }
      if (action === 'layout-cancel') { cancelEdit(); return; }
      if (action === 'layout-save') { saveLayoutEdits(); return; }
      if (action === 'layout-restore') { restoreCurrentLayout(); return; }
      if (action === 'layout-restore-cancel') {
        restoreConfirm = false;
        refresh({ force: true, reason: 'layout-restore-cancel' });
        return;
      }
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
      if (action === 'layout-add-section') { addEditSection(); return; }
      if (action === 'layout-add-group') {
        const kindEl = root && root.querySelector('[data-ywpc-layout-new-kind]');
        const sectionEl = root && root.querySelector('[data-ywpc-layout-new-section]');
        if (kindEl && sectionEl) addEditGroupControl(sectionEl.value, kindEl.value);
        return;
      }
      if (action === 'layout-section-up') { moveSectionBy(sectionId, -1); return; }
      if (action === 'layout-section-down') { moveSectionBy(sectionId, 1); return; }
      if (action === 'layout-select-section') { selectEditSection(sectionId); return; }
      if (action === 'layout-edit-control') { toggleEditControl(uid); return; }
      if (action === 'layout-control-up') { moveControlBy(uid, -1); return; }
      if (action === 'layout-control-down') { moveControlBy(uid, 1); return; }
      if (action === 'layout-delete-control') { deleteEditControl(uid); return; }
      if (action === 'layout-add-open') {
        layoutAddTarget = sectionId;
        layoutQuery = '';
        layoutError = '';
        refresh({ force: true, reason: 'layout-add-open' });
        return;
      }
      if (action === 'layout-add-close') {
        layoutAddTarget = '';
        layoutQuery = '';
        refresh({ force: true, reason: 'layout-add-close' });
        return;
      }
      if (action === 'layout-add-prompt') {
        addPromptControl(sectionId, actionEl.getAttribute('data-ywpc-prompt-id'));
        return;
      }
      if (action === 'layout-remove-member') {
        removeEditMember(uid, Number(actionEl.getAttribute('data-ywpc-option-index')), Number(actionEl.getAttribute('data-ywpc-member-index')));
        return;
      }
      if (action === 'layout-add-option') { addEditOption(uid); return; }
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

    const radioEl = closest(target, '[data-ywpc-radio]');
    if (radioEl) {
      if (radioEl.disabled) return;
      const key = radioEl.getAttribute('data-ywpc-radio');
      const value = radioEl.getAttribute('data-ywpc-value');
      const m = model || buildModel();
      const def = definitionForKey(m, key, ['radio']);
      if ((key === PARAGRAPH_RADIO_KEY || key === NARRATION_RADIO_KEY)
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
      /* 随机头部不是预设条目：钉选模式不把它当 pin，也不借机写开关。 */
      if (pinMode) {
        showToast('随机头部跟随插小说防道歉显示，不是预设条目，不能单独钉选。', 'info');
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
        if (section) section.label = value;
        return;
      }
      if (field === 'control-title' || field === 'control-sub') {
        const hit = findEditControl(target.getAttribute('data-ywpc-uid'));
        if (hit) {
          if (field === 'control-title') hit.control.label = value;
          else hit.control.sub = value;
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
        if (list) renderLayoutPickerList(list, model || buildModel());
      } catch (e) { /* 搜索失败不影响 */ }
      return;
    }
    if (target.hasAttribute && target.hasAttribute('data-ywpc-word-input')) {
      if (pinMode) return;
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
    if (target.hasAttribute && target.hasAttribute('data-ywpc-layout-move')) {
      if (editing) moveControlToSection(target.getAttribute('data-ywpc-layout-move'), target.value);
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
      if (pinMode || wordDraft === null) return;
      if (wordCommitTimer) { clearTimeout(wordCommitTimer); wordCommitTimer = 0; }
      if (!wordToken) wordToken = captureToken();
      commitWordDraft(wordToken);
    }
  }

  function onKeyDown(event) {
    const target = event.target;
    if (!target) return;
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
    dragState = null;
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
      editing = false;
      editSections = null;
      editRemovedControls = [];
      editRemovedSections = [];
      layoutError = '';
      layoutQuery = '';
      layoutAddTarget = '';
      newSectionName = '';
      restoreConfirm = false;
      editToken = null;
      showToast('预设已切换或条目列表不可读，布局编辑草稿已取消（没有保存到任何预设）。', 'warn');
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
    editing = false;
    editSections = null;
    editRemovedControls = [];
    editRemovedSections = [];
    layoutError = '';
    layoutQuery = '';
    layoutAddTarget = '';
    newSectionName = '';
    restoreConfirm = false;
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
      homePins: m && Array.isArray(m.homePins) ? m.homePins.map(pin => Object.assign({}, pin)) : [],
      homePinsStored: !!(m && m.homePinsStored),
    };
  }

  return api;
}
