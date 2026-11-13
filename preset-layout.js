/* ==========================================================================
   余小温主控 · 预设布局绑定（纯数据；不碰 DOM / 不碰 prompt_order / 不碰正文）
   --------------------------------------------------------------------------
   目标：
   - 内置 SECTIONS 是免配置默认布局；用户只在设置里存“当前预设”的增量覆盖。
   - 绑定一律用稳定 ID（内置 ref / prompt identifier）；同名预设换了条目 ID
     时，绑定失效显示“缺项”，不冒充可用。
   - 布局只决定显示名、显示分组、显示顺序；不写 oai_settings.prompts 正文，
     不写 prompt_order，不偷偷把条目加进 100001 顺序。
   - 用户撤销布局或恢复默认只删本预设自己的键，不碰其它预设。
   ========================================================================== */

export const LAYOUT_SETTINGS_KEY = 'presetControlLayouts';
export const LAYOUT_VERSION = 1;

export function stableHash(value) {
  const raw = String(value == null ? '' : value);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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
  if (control._ref && control._ref.type) return control._ref;
  const kind = control.kind;
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
      controls: (section.controls || []).map((control, controlIndex) => ({
        uid: controlUid(control),
        ref: controlRef(control),
        title: text(control.label || ''),
        sub: text(control.sub || ''),
        icon: text(control.icon || ''),
        order: controlIndex,
      })),
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

function materializeBuiltin(savedControl, builtinControl) {
  if (!builtinControl) {
    return {
      kind: 'missing',
      label: text(savedControl && savedControl.title) || '缺项控件',
      sub: text(savedControl && savedControl.sub),
      icon: text(savedControl && savedControl.icon),
      _ref: savedControl && savedControl.ref ? clone(savedControl.ref) : null,
      _uid: text(savedControl && savedControl.uid),
      _missingReason: '内置控件定义已不存在；可删除这个控件，或恢复当前预设的默认布局。',
    };
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
  return control;
}

function materializeSavedControl(savedControl, builtins) {
  if (!savedControl || !savedControl.ref || !savedControl.ref.type) return null;
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
  const nextPromptUid = base => {
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
      const ref = savedControl.ref;
      if (!ref || !ref.type) continue;
      const key = refKey(ref);
      const isPrompt = ref.type === 'prompt';
      /* 同一条 prompt 允许跨组/同组重复：唯一性看实例 uid，不再按 ref 硬拒。
         旧布局/手写布局缺 uid 或 uid 撞车时补一个稳定的 #n 实例号。 */
      let uid = text(savedControl.uid) || key;
      if (isPrompt) {
        if (presentUids.has(uid)) uid = nextPromptUid(key);
      } else if (presentRefs.has(key)) {
        errors.push('重复的控件已跳过：' + key);
        continue;
      }
      const control = materializeSavedControl(savedControl, builtins);
      if (!control) continue;
      if (isPrompt) control._uid = uid;
      presentRefs.add(key);
      presentUids.add(isPrompt ? uid : key);
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
      presentRefs.add(key);
      presentUids.add(controlUid(control));
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

export function serializeLayout(sections, meta) {
  const options = meta || {};
  const removedControls = Array.isArray(options.removedControls) ? options.removedControls.map(text) : [];
  const removedSections = Array.isArray(options.removedSections) ? options.removedSections.map(text) : [];
  return {
    version: LAYOUT_VERSION,
    name: text(options.name),
    characterId: options.characterId == null ? 100001 : options.characterId,
    updatedAt: Number(options.updatedAt) || Date.now(),
    sections: (Array.isArray(sections) ? sections : []).map((section, sectionIndex) => ({
      id: text(section.id),
      title: text(section.label || section.title),
      note: text(section.note || ''),
      icon: text(section.icon || ''),
      order: sectionIndex,
      ...(section.custom ? { custom: true } : { builtin: true }),
      controls: (section.controls || []).filter(control => !!controlRef(control)).map((control, controlIndex) => ({
        uid: controlUid(control),
        ref: clone(controlRef(control)),
        ...(controlRef(control).type === 'custom' ? { kind: control.kind } : {}),
        title: text(control.label || ''),
        sub: text(control.sub || ''),
        icon: text(control.icon || ''),
        order: controlIndex,
        ...((control._hasOverride || control._overrideDirty || controlRef(control).type === 'custom')
          ? { override: overrideFor(control) }
          : (control._savedOverride ? { override: clone(control._savedOverride) } : {})),
      })),
    })),
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
      parts.push('C' + controlUid(control) + ':' + control.kind + ':' + text(control.label) + ':' + text(control.sub)
        + ':' + text(control.icon) + ':' + ids + ':' + unique(control.members || []).join('+')
        + ':' + unique(control.ids || []).join('+') + ':' + text(control._missingReason));
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
