/* ==========================================================================
   余小温主控 · 预设布局绑定（纯数据；不碰 DOM / 不碰 prompt_order / 不碰正文）
   --------------------------------------------------------------------------
   目标：
   - 内置 SECTIONS 是免配置默认布局；用户只在设置里存“当前预设”的增量覆盖。
   - 绑定一律用稳定 ID（内置 ref / prompt identifier）；同名预设换了条目 ID
     时，绑定失效显示“缺项”，不冒充可用。
   - 布局只决定显示名、显示分组、显示顺序、显示宽度和组内选项的展示顺序；
     不写 oai_settings.prompts 正文，不写 prompt_order，不偷偷把条目加进
     100001 顺序，也不改 control.options 的原序和互斥关系。
   - 用户撤销布局或恢复默认只删本预设自己的键，不碰其它预设。

   2026-11-14 布局定制（纯数据层）：
   - 控件可选 width，只认数字 3/4/6/12（十二格：1/4、1/3、1/2、整行）；
     缺字段或坏值一律不写 width，由渲染层沿用旧默认。空块默认宽 6。
   - 控件可选 optionLayout，只影响组内选项怎么摆，不动 control.options：
       { type:'option', value, width? }
       { type:'spacer', uid, width }
     组内 option value 唯一；只保留 control.options 里真实存在的 value，
     没被 optionLayout 列到的有效选项由 resolveOptionLayout 按原序补在末尾。
   - 顶层空白块是独立控件实例：
       { kind:'spacer', key:<唯一>, width:6, _uid:<唯一>,
         _ref:{ type:'spacer', key } }
     保存结构里 ref.type === 'spacer'；多个空块按不同 key/uid 保留。
   - 实例身份是 _uid；首页 pin 的 sourceUid 必须引用它，pin.uid 仍是 pin
     自己的实例号，同一个来源多份收藏不会互相串身份。
   ========================================================================== */

export const LAYOUT_SETTINGS_KEY = 'presetControlLayouts';
export const LAYOUT_VERSION = 1;

/* 十二格宽度白名单。3=1/4，4=1/3，6=1/2，12=整行。 */
export const LAYOUT_WIDTHS = Object.freeze([3, 4, 6, 12]);
export const DEFAULT_SPACER_WIDTH = 6;

export function stableHash(value) {
  const raw = String(value == null ? '' : value);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/* 只认数字白名单；坏值返回 undefined = 沿用旧默认，不把字符串/小数当宽度。 */
export function normalizeLayoutWidth(value) {
  return typeof value === 'number' && LAYOUT_WIDTHS.includes(value) ? value : undefined;
}

/* 只清洗显式 optionLayout：
   - raw 不是数组 => undefined（整段按旧默认展示）。
   - option 只保留 options 里存在的 value；同组重复 value 只留第一个。
   - spacer 必须有非空 uid；重复 uid 只留第一个；width 坏值回落 6。
   - 未知 type / 非对象元素丢弃；空数组表示“显式空布局”，原样保留。
   注意：这里不改 control.options 的原序和互斥关系，也不把漏掉的选项补进来；
   渲染展示用 resolveOptionLayout。 */
export function normalizeOptionLayout(raw, options) {
  if (!Array.isArray(raw)) return undefined;
  let validValues = null;
  if (Array.isArray(options)) {
    validValues = new Set();
    for (const option of options) {
      if (!isPlainObject(option)) continue;
      validValues.add(text(option.value));
    }
  }
  const out = [];
  const seenValues = new Set();
  const seenSpacerUids = new Set();
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const type = text(item.type);
    if (type === 'option') {
      const value = text(item.value);
      if (validValues ? !validValues.has(value) : !value) continue;
      if (seenValues.has(value)) continue;
      seenValues.add(value);
      const width = normalizeLayoutWidth(item.width);
      out.push(width === undefined ? { type: 'option', value } : { type: 'option', value, width });
    } else if (type === 'spacer') {
      const uid = text(item.uid);
      if (!uid || seenSpacerUids.has(uid)) continue;
      seenSpacerUids.add(uid);
      const width = normalizeLayoutWidth(item.width);
      out.push({ type: 'spacer', uid, width: width === undefined ? DEFAULT_SPACER_WIDTH : width });
    }
  }
  return out;
}

/* 渲染用展示序列：显式 optionLayout 在前，未列出的有效 option 按 control.options
   原序补在末尾。option value 按组唯一（重复值只展示第一个），spacer 原样保留。
   optionLayout 坏值 => 全部按 control.options 原序展示。 */
export function resolveOptionLayout(control) {
  const options = control && Array.isArray(control.options) ? control.options : [];
  const explicit = control && Array.isArray(control.optionLayout)
    ? (normalizeOptionLayout(control.optionLayout, options) || [])
    : [];
  const usedValues = new Set();
  const out = [];
  for (const item of explicit) {
    if (item.type === 'option') {
      if (usedValues.has(item.value)) continue;
      usedValues.add(item.value);
    }
    out.push(item);
  }
  for (const option of options) {
    if (!isPlainObject(option)) continue;
    const value = text(option.value);
    if (usedValues.has(value)) continue;
    usedValues.add(value);
    out.push({ type: 'option', value });
  }
  return out;
}

export function presetLayoutKey(name, characterId) {
  const id = characterId == null ? 100001 : characterId;
  return 'preset.' + String(id) + '.' + stableHash(String(name == null ? '' : name).trim());
}

export function layoutStoreOf(settings) {
  try {
    const raw = settings && settings[LAYOUT_SETTINGS_KEY];
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  } catch (e) {
    return null;
  }
}

export function readSavedLayout(settings, name, characterId) {
  const store = layoutStoreOf(settings);
  if (!store) return null;
  const key = presetLayoutKey(name, characterId);
  const layout = store[key];
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return null;
  /* 键本身由名称+角色编码；这里再核一次，防止手工拷贝/碰撞把别的预设布局套过来。 */
  if (layout.name !== undefined && String(layout.name) !== String(name == null ? '' : name)) return null;
  if (layout.characterId !== undefined && String(layout.characterId) !== String(characterId == null ? 100001 : characterId)) return null;
  return layout;
}

export function writeSavedLayout(settings, name, characterId, layout) {
  if (!settings || typeof settings !== 'object') return false;
  const store = layoutStoreOf(settings);
  if (!store) settings[LAYOUT_SETTINGS_KEY] = {};
  settings[LAYOUT_SETTINGS_KEY][presetLayoutKey(name, characterId)] = layout;
  return true;
}

export function clearSavedLayout(settings, name, characterId) {
  const store = layoutStoreOf(settings);
  if (!store) return false;
  const key = presetLayoutKey(name, characterId);
  if (!Object.prototype.hasOwnProperty.call(store, key)) return false;
  delete store[key];
  return true;
}

export function hasSavedLayout(settings, name, characterId) {
  return !!readSavedLayout(settings, name, characterId);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }
  return value;
}

function unique(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function text(value) {
  return String(value == null ? '' : value);
}

export function controlRef(control) {
  if (!control) return null;
  if (control._ref && control._ref.type) {
    if (control._ref.type === 'spacer') {
      const key = text(control._ref.key) || text(control.key) || text(control._uid);
      return key ? { type: 'spacer', key } : null;
    }
    return control._ref;
  }
  const kind = control.kind;
  if (kind === 'spacer') {
    const key = text(control.key) || text(control._uid);
    return key ? { type: 'spacer', key } : null;
  }
  if (kind === 'toggle' || kind === 'action') return { type: 'builtin', key: 'toggle:' + control.id };
  if (kind === 'radio' || kind === 'combo' || kind === 'comboToggle') return { type: 'builtin', key: 'group:' + control.key };
  if (kind === 'multi') return { type: 'builtin', key: 'multi:' + control.key };
  if (kind === 'word') return { type: 'builtin', key: 'word:' + control.id };
  if (kind === 'shortcuts') return { type: 'builtin', key: 'shortcuts' };
  if (kind === 'info') return { type: 'builtin', key: 'info:' + stableHash(control.text || control.label || '') };
  if (control.promptId) return { type: 'prompt', id: String(control.promptId) };
  return null;
}

export function controlUid(control) {
  if (!control) return '';
  if (control._uid) return String(control._uid);
  const ref = controlRef(control);
  return ref ? refKey(ref) : '';
}

export function refKey(ref) {
  if (!ref || !ref.type) return '';
  if (ref.type === 'prompt') return 'prompt:' + String(ref.id || '');
  if (ref.type === 'custom') return 'custom:' + String(ref.key || '');
  if (ref.type === 'spacer') return 'spacer:' + String(ref.key || '');
  return 'builtin:' + String(ref.key || '');
}

export function sameRef(a, b) {
  return !!a && !!b && refKey(a) === refKey(b);
}

export function createBaseLayout(sections) {
  const list = Array.isArray(sections) ? sections : [];
  return {
    version: LAYOUT_VERSION,
    sections: list.map((section, sectionIndex) => ({
      id: text(section.id || ('section-' + sectionIndex)),
      title: text(section.label || section.title || ''),
      note: text(section.note || ''),
      icon: text(section.icon || ''),
      order: sectionIndex,
      builtin: true,
      controls: (section.controls || []).map((control, controlIndex) => {
        const width = normalizeLayoutWidth(control.width);
        const optionLayout = Array.isArray(control.optionLayout)
          ? normalizeOptionLayout(control.optionLayout, control.options) : undefined;
        return {
          uid: controlUid(control),
          ref: controlRef(control),
          title: text(control.label || ''),
          sub: text(control.sub || ''),
          icon: text(control.icon || ''),
          order: controlIndex,
          ...(width !== undefined ? { width } : {}),
          ...(optionLayout !== undefined ? { optionLayout } : {}),
        };
      }),
    })),
    removedSections: [],
    removedControls: [],
  };
}

function indexBuiltins(sections) {
  const sectionById = new Map();
  const controlByKey = new Map();
  for (const section of sections || []) {
    sectionById.set(text(section.id), section);
    for (const control of section.controls || []) {
      const ref = controlRef(control);
      if (ref) controlByKey.set(refKey(ref), control);
    }
  }
  return { sectionById, controlByKey };
}

function sanitizeOptions(raw) {
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isPlainObject(item)) continue;
    const value = text(item.value);
    const ids = unique((Array.isArray(item.ids) ? item.ids : []).map(text));
    out.push({
      value,
      label: text(item.label || value),
      ids,
      ...(item.sub ? { sub: text(item.sub) } : {}),
    });
  }
  return out;
}

function applyOverride(control, override) {
  if (!isPlainObject(override)) return;
  if (control.kind === 'radio' || control.kind === 'combo') {
    /* 空数组是用户“明确移除全部选项”的结果，必须保留为空并显示修复态；
       不能用 .length 判断后回落内置默认。 */
    if (Array.isArray(override.options)) {
      control.options = sanitizeOptions(override.options);
      control.allIds = unique(control.options.flatMap(option => option.ids));
    }
    if (typeof override.exactlyOne === 'boolean') control.exactlyOne = override.exactlyOne;
    if (typeof override.atMostOne === 'boolean') control.atMostOne = override.atMostOne;
    if (typeof override.allowNone === 'boolean') control.allowNone = override.allowNone;
    if (override.masterId !== undefined) control.masterId = text(override.masterId) || undefined;
  } else if (control.kind === 'comboToggle') {
    if (Array.isArray(override.members)) control.members = unique(override.members.map(text));
  } else if (control.kind === 'multi') {
    if (Array.isArray(override.ids)) control.ids = unique(override.ids.map(text));
    if (Array.isArray(override.labels)) control.labels = override.labels.map(text);
  }
}

/* 把保存里的 width/optionLayout 合到物化后的控件上；坏值不写字段，
   留给渲染层沿用旧默认。fallbackControl 只在默认/内置定义上使用。 */
function applyControlLayoutMeta(control, savedControl, fallbackControl) {
  const saved = isPlainObject(savedControl) ? savedControl : null;
  const fallback = isPlainObject(fallbackControl) ? fallbackControl : null;
  let width = saved && Object.prototype.hasOwnProperty.call(saved, 'width')
    ? normalizeLayoutWidth(saved.width) : undefined;
  if (width === undefined && fallback) width = normalizeLayoutWidth(fallback.width);
  if (width !== undefined) control.width = width;
  else delete control.width;

  let rawOptionLayout;
  if (saved && Object.prototype.hasOwnProperty.call(saved, 'optionLayout')) {
    rawOptionLayout = saved.optionLayout;
  } else if (fallback && Array.isArray(fallback.optionLayout)) {
    rawOptionLayout = fallback.optionLayout;
  }
  if (Array.isArray(rawOptionLayout)) {
    const normalized = normalizeOptionLayout(rawOptionLayout, control.options);
    if (normalized !== undefined) control.optionLayout = normalized;
  }
  return control;
}

function materializeBuiltin(savedControl, builtinControl) {
  if (!builtinControl) {
    const missing = {
      kind: 'missing',
      label: text(savedControl && savedControl.title) || '缺项控件',
      sub: text(savedControl && savedControl.sub),
      icon: text(savedControl && savedControl.icon),
      _ref: savedControl && savedControl.ref ? clone(savedControl.ref) : null,
      _uid: text(savedControl && savedControl.uid),
      _missingReason: '内置控件定义已不存在；可删除这个控件，或恢复当前预设的默认布局。',
    };
    applyControlLayoutMeta(missing, savedControl, null);
    return missing;
  }
  const control = clone(builtinControl);
  control._ref = savedControl && savedControl.ref ? clone(savedControl.ref) : controlRef(builtinControl);
  control._uid = text(savedControl && savedControl.uid) || controlUid(builtinControl);
  if (savedControl) {
    if (savedControl.title !== undefined) control.label = text(savedControl.title);
    if (savedControl.sub !== undefined) control.sub = text(savedControl.sub);
    if (savedControl.icon !== undefined) control.icon = text(savedControl.icon);
    if (isPlainObject(savedControl.override)) {
      applyOverride(control, savedControl.override);
      control._savedOverride = clone(savedControl.override);
      control._hasOverride = true;
    }
  }
  applyControlLayoutMeta(control, savedControl, builtinControl);
  return control;
}

function materializePrompt(savedControl, ctx) {
  const ref = savedControl && savedControl.ref;
  const id = text(ref && ref.id);
  const prompt = ctx.promptById && typeof ctx.promptById.get === 'function' ? ctx.promptById.get(id) : null;
  const inOrder = !!(ctx.orderMap && Object.prototype.hasOwnProperty.call(ctx.orderMap, id));
  const ordinary = !ctx.isOrdinaryPrompt || ctx.isOrdinaryPrompt(prompt);
  const title = text(savedControl && savedControl.title) || (prompt && prompt.name) || '未命名条目';
  const control = {
    kind: 'toggle',
    id,
    label: title,
    sub: text(savedControl && savedControl.sub),
    icon: text(savedControl && savedControl.icon),
    _ref: clone(ref),
    _uid: text(savedControl && savedControl.uid) || refKey(ref),
    _custom: true,
    _prompt: prompt || null,
  };
  applyControlLayoutMeta(control, savedControl, null);
  if (!prompt) {
    control.kind = 'missing';
    control._missingReason = '当前预设里找不到这个条目；可删除这个控件，或恢复当前预设的默认布局。';
  } else if (!inOrder) {
    control.kind = 'missing';
    control._missingReason = '这个条目不在有效条目列表里；不能操作，也不会被偷偷加进列表。';
  } else if (!ordinary) {
    control.kind = 'missing';
    control._missingReason = '这个条目是系统/分隔条目，不能当作开关；可删除这个控件。';
  }
  return control;
}

function materializeCustomGroup(savedControl) {
  const ref = savedControl && savedControl.ref;
  const kind = savedControl && (savedControl.kind || (savedControl.override && savedControl.override.kind));
  if (!ref || !kind) return null;
  const control = {
    kind,
    key: text(ref.key),
    label: text(savedControl.title) || '自定义控件',
    sub: text(savedControl.sub),
    icon: text(savedControl.icon),
    _ref: clone(ref),
    _uid: text(savedControl.uid) || refKey(ref),
    _custom: true,
    _hasOverride: true,
    _savedOverride: {},
  };
  if (kind === 'radio' || kind === 'combo') {
    control.options = [];
    control.allIds = [];
    control.exactlyOne = kind === 'radio';
    control.atMostOne = false;
    control.allowNone = kind === 'radio';
  } else if (kind === 'comboToggle') {
    control.members = [];
  } else if (kind === 'multi') {
    control.ids = [];
    control.labels = [];
  } else {
    return null;
  }
  if (isPlainObject(savedControl.override)) {
    applyOverride(control, savedControl.override);
    control._savedOverride = clone(savedControl.override);
  }
  applyControlLayoutMeta(control, savedControl, null);
  return control;
}

/* 空白占位是独立控件实例，不绑定任何条目、不读写正文、不进入 prompt_order。
   key/uid 都必须唯一；这里只做物化，重复处理在 resolveLayout 里统一兜底。 */
function materializeSpacer(savedControl) {
  const saved = isPlainObject(savedControl) ? savedControl : {};
  const ref = isPlainObject(saved.ref) ? saved.ref : null;
  const key = text(ref && ref.key) || text(saved.key)
    || ('spacer-' + stableHash(JSON.stringify(saved)));
  const width = normalizeLayoutWidth(saved.width);
  return {
    kind: 'spacer',
    key,
    label: '',
    sub: '',
    icon: '',
    width: width === undefined ? DEFAULT_SPACER_WIDTH : width,
    _ref: { type: 'spacer', key },
    _uid: text(saved.uid) || refKey({ type: 'spacer', key }),
    _custom: false,
    _spacer: true,
    _hasOverride: false,
    _overrideDirty: false,
  };
}

function materializeSavedControl(savedControl, builtins) {
  if (!savedControl || !savedControl.ref || !savedControl.ref.type) return null;
  if (savedControl.ref.type === 'spacer') return materializeSpacer(savedControl);
  if (savedControl.ref.type === 'prompt') return materializePrompt(savedControl, builtins.ctx);
  if (savedControl.ref.type === 'custom') return materializeCustomGroup(savedControl);
  const key = refKey(savedControl.ref);
  return materializeBuiltin(savedControl, builtins.controlByKey.get(key));
}

export function resolveLayout(options) {
  const opts = options || {};
  const sections = Array.isArray(opts.sections) ? opts.sections : [];
  const base = createBaseLayout(sections);
  const saved = opts.saved;
  const baseIndex = indexBuiltins(sections);
  const ctx = {
    promptById: opts.promptById || new Map(),
    orderMap: opts.orderMap || Object.create(null),
    isOrdinaryPrompt: opts.isOrdinaryPrompt,
  };
  const builtins = { sectionById: baseIndex.sectionById, controlByKey: baseIndex.controlByKey, ctx };
  const errors = [];
  const savedSections = saved && Array.isArray(saved.sections) ? saved.sections : null;
  if (!savedSections) {
    return {
      source: 'default',
      sections: base.sections.map(section => {
        const out = {
          id: section.id,
          label: section.title,
          note: section.note,
          icon: section.icon,
          builtin: true,
          controls: [],
        };
        for (const savedControl of section.controls) {
          const control = materializeBuiltin(savedControl, builtins.controlByKey.get(refKey(savedControl.ref)));
          if (control) out.controls.push(control);
        }
        return out;
      }),
      errors,
      missingCount: 0,
      layout: base,
    };
  }

  const effective = [];
  const effectiveById = new Map();
  const presentRefs = new Set();
  const presentUids = new Set();
  const usedSectionIds = new Set();
  const removedControls = new Set((Array.isArray(saved.removedControls) ? saved.removedControls : []).map(text));
  const uniqueInstanceUid = base => {
    if (!presentUids.has(base)) return base;
    let seq = 2;
    while (presentUids.has(base + '#' + seq)) seq += 1;
    return base + '#' + seq;
  };

  for (const savedSection of savedSections) {
    if (!isPlainObject(savedSection)) continue;
    let id = text(savedSection.id);
    if (!id) id = 'custom-' + stableHash(JSON.stringify(savedSection.title || '') + effective.length);
    if (usedSectionIds.has(id)) {
      errors.push('重复的分组已跳过：' + id);
      continue;
    }
    usedSectionIds.add(id);
    const baseSection = baseIndex.sectionById.get(id);
    const section = {
      id,
      label: text(savedSection.title) || (baseSection && baseSection.label) || '未命名分组',
      note: savedSection.note !== undefined ? text(savedSection.note) : text((baseSection && baseSection.note) || ''),
      icon: savedSection.icon !== undefined ? text(savedSection.icon) : text((baseSection && baseSection.icon) || ''),
      builtin: !!baseSection,
      custom: !baseSection,
      controls: [],
    };
    for (const savedControl of Array.isArray(savedSection.controls) ? savedSection.controls : []) {
      if (!isPlainObject(savedControl)) continue;
      let ref = savedControl.ref;
      if (!ref || !ref.type) {
        /* 容错：只认明确 kind:'spacer' 的手写/旧空块；其它无 ref 控件照旧跳过。 */
        if (savedControl.kind === 'spacer') {
          const key = text(savedControl.key) || text(savedControl.uid);
          if (key) ref = { type: 'spacer', key };
        }
      }
      if (!ref || !ref.type) continue;

      if (ref.type === 'spacer') {
        /* 空块不参与“同 ref 只能一份”的旧去重：多个空块按不同 key/uid 全部保留。
           key/uid 缺失或撞车时给确定性兜底，不静默丢块。 */
        const control = materializeSavedControl({ ...savedControl, ref }, builtins);
        if (!control) continue;
        const baseKey = text(control.key) || ('spacer-' + stableHash(JSON.stringify(savedControl)));
        let key = baseKey;
        let keySeq = 2;
        while (presentRefs.has(refKey({ type: 'spacer', key }))) {
          key = baseKey + '#' + keySeq;
          keySeq += 1;
        }
        if (key !== baseKey) errors.push('重复的空块已自动区分：' + baseKey);
        control.key = key;
        control._ref = { type: 'spacer', key };
        const baseUid = text(savedControl.uid) || refKey(control._ref);
        const uid = uniqueInstanceUid(baseUid);
        if (uid !== baseUid) errors.push('重复的空块实例已自动区分：' + baseUid);
        control._uid = uid;
        presentRefs.add(refKey(control._ref));
        presentUids.add(uid);
        section.controls.push(control);
        continue;
      }

      const key = refKey(ref);
      const isPrompt = ref.type === 'prompt';
      /* 同一条 prompt 允许跨组/同组重复：唯一性看实例 uid，不再按 ref 硬拒。
         旧布局/手写布局缺 uid 或 uid 撞车时补一个稳定的 #n 实例号。
         其它控件仍按 ref 去重，但它们的 _uid 也要进唯一集，避免和 prompt/空块串身份。 */
      const baseUid = text(savedControl.uid) || key;
      let uid = isPrompt ? uniqueInstanceUid(baseUid) : baseUid;
      if (!isPrompt && presentRefs.has(key)) {
        errors.push('重复的控件已跳过：' + key);
        continue;
      }
      const control = materializeSavedControl(savedControl, builtins);
      if (!control) continue;
      if (isPrompt) {
        control._uid = uid;
      } else {
        const actualUid = controlUid(control);
        const finalUid = uniqueInstanceUid(actualUid);
        if (finalUid !== actualUid) {
          control._uid = finalUid;
          errors.push('重复的控件实例已自动区分：' + actualUid);
        }
        uid = finalUid;
      }
      presentRefs.add(key);
      presentUids.add(uid);
      section.controls.push(control);
    }
    effective.push(section);
    effectiveById.set(id, section);
  }

  const removedSections = new Set((Array.isArray(saved.removedSections) ? saved.removedSections : []).map(text));
  for (const baseSection of base.sections) {
    if (removedSections.has(baseSection.id)) continue;
    let section = effectiveById.get(baseSection.id);
    if (!section) {
      section = {
        id: baseSection.id,
        label: baseSection.title,
        note: baseSection.note,
        icon: baseSection.icon,
        builtin: true,
        controls: [],
      };
      effective.push(section);
      effectiveById.set(section.id, section);
    }
    if (!section.note && baseSection.note) section.note = baseSection.note;
    if (!section.icon && baseSection.icon) section.icon = baseSection.icon;
    for (const savedControl of baseSection.controls) {
      const key = refKey(savedControl.ref);
      if (!key || presentRefs.has(key) || removedControls.has(key)) continue;
      const control = materializeBuiltin(savedControl, builtins.controlByKey.get(key));
      if (!control) continue;
      const baseUid = controlUid(control);
      const finalUid = uniqueInstanceUid(baseUid);
      if (finalUid !== baseUid) {
        control._uid = finalUid;
        errors.push('重复的控件实例已自动区分：' + baseUid);
      }
      presentRefs.add(key);
      presentUids.add(finalUid);
      section.controls.push(control);
    }
  }

  let missingCount = 0;
  for (const section of effective) {
    for (const control of section.controls) {
      if (control.kind === 'missing') missingCount += 1;
    }
  }
  return { source: 'saved', sections: effective, errors, missingCount, layout: saved, base };
}

function overrideFor(control) {
  if (control.kind === 'radio' || control.kind === 'combo') {
    return {
      options: (control.options || []).map(option => ({
        value: option.value,
        label: option.label,
        ids: unique(option.ids || []),
        ...(option.sub ? { sub: option.sub } : {}),
      })),
      exactlyOne: !!control.exactlyOne,
      atMostOne: !!control.atMostOne,
      allowNone: !!control.allowNone,
      ...(control.masterId ? { masterId: control.masterId } : {}),
    };
  }
  if (control.kind === 'comboToggle') return { members: unique(control.members || []) };
  if (control.kind === 'multi') {
    return { ids: unique(control.ids || []), labels: (control.labels || []).map(text) };
  }
  return null;
}

function spacerWidthOf(control) {
  const width = normalizeLayoutWidth(control && control.width);
  return width === undefined ? DEFAULT_SPACER_WIDTH : width;
}

function optionLayoutSignatureOf(layout, options) {
  const normalized = normalizeOptionLayout(layout, options);
  if (normalized === undefined) return '';
  return normalized.map(item => item.type === 'option'
    ? 'o:' + item.value + '@' + (item.width === undefined ? '' : item.width)
    : 's:' + item.uid + '@' + item.width).join(',');
}

export function serializeLayout(sections, meta) {
  const options = meta || {};
  const removedControls = Array.isArray(options.removedControls) ? options.removedControls.map(text) : [];
  const removedSections = Array.isArray(options.removedSections) ? options.removedSections.map(text) : [];
  const serializedSections = (Array.isArray(sections) ? sections : []).map((section, sectionIndex) => ({
    id: text(section.id),
    title: text(section.label || section.title),
    note: text(section.note || ''),
    icon: text(section.icon || ''),
    order: sectionIndex,
    ...(section.custom ? { custom: true } : { builtin: true }),
    controls: (section.controls || []).map((control, controlIndex) => {
      const ref = controlRef(control);
      if (!ref) return null;
      const isSpacer = ref.type === 'spacer';
      const width = isSpacer ? spacerWidthOf(control) : normalizeLayoutWidth(control.width);
      const optionLayout = !isSpacer && Array.isArray(control.optionLayout)
        ? normalizeOptionLayout(control.optionLayout, control.options) : undefined;
      const out = {
        uid: controlUid(control),
        ref: clone(ref),
        ...(ref.type === 'custom' ? { kind: control.kind } : (isSpacer ? { kind: 'spacer' } : {})),
        title: text(control.label || ''),
        sub: text(control.sub || ''),
        icon: text(control.icon || ''),
        order: controlIndex,
        ...(width !== undefined ? { width } : {}),
        ...(optionLayout !== undefined ? { optionLayout } : {}),
      };
      /* 空块没有组成员关系，不写 override；其它控件保持旧保存行为。 */
      if (!isSpacer && (control._hasOverride || control._overrideDirty || ref.type === 'custom')) {
        out.override = overrideFor(control);
      } else if (!isSpacer && control._savedOverride) {
        out.override = clone(control._savedOverride);
      }
      return out;
    }).filter(Boolean),
  }));
  return {
    version: LAYOUT_VERSION,
    name: text(options.name),
    characterId: options.characterId == null ? 100001 : options.characterId,
    updatedAt: Number(options.updatedAt) || Date.now(),
    sections: serializedSections,
    removedControls: unique(removedControls),
    removedSections: unique(removedSections),
  };
}

export function layoutSignature(sections) {
  const parts = [];
  for (const section of sections || []) {
    parts.push('S' + text(section.id) + ':' + text(section.label || section.title) + ':' + text(section.icon));
    for (const control of section.controls || []) {
      const ids = (control.options || []).map(option => option.value + '=' + unique(option.ids || []).join('+')).join(';');
      let part = 'C' + controlUid(control) + ':' + control.kind + ':' + text(control.label) + ':' + text(control.sub)
        + ':' + text(control.icon) + ':' + ids + ':' + unique(control.members || []).join('+')
        + ':' + unique(control.ids || []).join('+') + ':' + text(control._missingReason);
      /* 只有真有新字段才追加，旧布局签名保持逐字不变，避免无意义重画。 */
      const ref = controlRef(control);
      const isSpacer = !!ref && ref.type === 'spacer';
      const width = isSpacer ? spacerWidthOf(control) : normalizeLayoutWidth(control.width);
      if (width !== undefined) part += ':w=' + width;
      if (Array.isArray(control.optionLayout)) {
        const layoutSig = optionLayoutSignatureOf(control.optionLayout, control.options);
        part += ':l=' + layoutSig;
      }
      if (isSpacer) part += ':k=' + text(control.key || (ref && ref.key));
      parts.push(part);
    }
  }
  return stableHash(parts.join('|'));
}

export function layoutControlIndex(sections) {
  const byUid = new Map();
  for (const section of sections || []) {
    for (const control of section.controls || []) {
      byUid.set(controlUid(control), { section, control });
    }
  }
  return byUid;
}

export function allLayoutRefs(sections) {
  const out = new Map();
  for (const section of sections || []) {
    for (const control of section.controls || []) {
      const ref = controlRef(control);
      if (ref) out.set(refKey(ref), control);
    }
  }
  return out;
}
