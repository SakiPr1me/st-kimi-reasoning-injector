// Custom model lists and target-bound selection. No request or credential interception.
export const VERSION = '1.0.3';

const SOURCES = Object.freeze(Object.fromEntries([
    ['openai', 'openai'], ['claude', 'claude'], ['openrouter', 'openrouter'],
    ['ai21', 'ai21'], ['makersuite', 'google'], ['vertexai', 'vertexai'],
    ['mistralai', 'mistralai'], ['cohere', 'cohere'], ['perplexity', 'perplexity'],
    ['groq', 'groq'], ['electronhub', 'electronhub'], ['chutes', 'chutes'],
    ['nanogpt', 'nanogpt'], ['deepseek', 'deepseek'], ['aimlapi', 'aimlapi'],
    ['xai', 'xai'], ['pollinations', 'pollinations'], ['moonshot', 'moonshot'],
    ['fireworks', 'fireworks'], ['cometapi', 'cometapi'], ['zai', 'zai'],
    ['siliconflow', 'siliconflow'], ['workers_ai', 'workers_ai'], ['minimax', 'minimax'],
    ['01ai', '01ai'],
].map(([source, id]) => [source, { id: `model_${id}_select`, field: source === '01ai' ? 'zerooneai_model' : `${id}_model` }])));
const TARGET_IDS = new Set(['settings_preset_openai', 'connection_profiles', 'openai_proxy_preset', 'openai_reverse_proxy', 'custom_api_url_text']);
const TEXT = {
    zh: { placeholder: '模型 ID（原样发送）', add: '添加并选用', use: '选用', remove: '移除', empty: '此来源还没有自定义模型。', unsupported: '此来源不支持自定义模型列表。', missing: '当前酒馆没有此来源的模型选择器，暂不可用。', custom: '自定义来源可直接使用酒馆原有的模型 ID 输入框。', active: '正在使用，先切换模型再移除。', blank: '请先填写模型 ID。', selected: '已选用；请确认服务端支持此模型。', saved: '已添加到此来源的列表。', failed: '模型未能同步，请重试。', saveFailed: '保存回调失败，请重试。', current: '当前来源', list: '自定义模型列表' },
    en: { placeholder: 'Model ID (sent verbatim)', add: 'Add and select', use: 'Select', remove: 'Remove', empty: 'No custom models for this source yet.', unsupported: 'This source does not support a custom model list.', missing: 'This Tavern has no model selector for this source.', custom: 'Use Tavern’s existing model ID input for the Custom source.', active: 'In use. Select another model before removing it.', blank: 'Enter a model ID first.', selected: 'Selected; confirm that your server supports this model.', saved: 'Added to this source’s list.', failed: 'Could not synchronize the model. Try again.', saveFailed: 'The save callback failed. Try again.', current: 'Current source', list: 'Custom models' },
    ko: { placeholder: '모델 ID (그대로 전송)', add: '추가 후 선택', use: '선택', remove: '삭제', empty: '이 소스에 저장된 사용자 모델이 없습니다.', unsupported: '이 소스는 사용자 모델 목록을 지원하지 않습니다.', missing: '현재 타번에 이 소스의 모델 선택기가 없습니다.', custom: '사용자 지정 소스는 타번의 기존 모델 ID 입력란을 사용하세요.', active: '사용 중입니다. 다른 모델로 바꾼 뒤 삭제하세요.', blank: '모델 ID를 입력하세요.', selected: '선택했습니다. 서버가 이 모델을 지원하는지 확인하세요.', saved: '이 소스의 목록에 추가했습니다.', failed: '모델을 동기화하지 못했습니다. 다시 시도하세요.', saveFailed: '저장 콜백이 실패했습니다. 다시 시도하세요.', current: '현재 소스', list: '사용자 모델 목록' },
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const put = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });

export function createCustomModelManager({ getSettings, saveSettings, oaiSettings, eventSource, eventTypes = {}, document: doc = globalThis.document, window: win = globalThis.window, getLanguage = () => getSettings()?.language, getTarget } = {}) {
    if (typeof getSettings !== 'function' || !oaiSettings || !doc) throw new TypeError('Custom model manager requires settings and document');
    const mounts = new Set();
    const unsubs = [];
    const states = new Map();
    const jqueryBindings = new Map();
    let dead = false, applying = false, suspended = false, scheduled = false, lastError = '';
    let intent = null;
    let paintBatch = 0, paintPending = false, deferWrites = 0, writePending = false, dirty = false, saveEpoch = 0;
    const pending = new Set();
    const sourceNow = () => String(oaiSettings.chat_completion_source || '');
    const words = () => TEXT[getLanguage()] || TEXT.zh;
    const config = source => own(SOURCES, source) ? SOURCES[source] : null;
    const selectOf = source => { const c = config(source); const el = c && doc.getElementById(c.id); return el?.tagName === 'SELECT' ? el : null; };
    const valueOf = source => { const c = config(source); return c ? String(oaiSettings[c.field] ?? '') : ''; };
    function settings() {
        const s = getSettings();
        for (const key of ['customModels', 'customModelSelection']) if (!s[key] || typeof s[key] !== 'object' || Array.isArray(s[key])) s[key] = {};
        return s;
    }
    function list(source) {
        const bag = settings().customModels;
        const raw = own(bag, source) && Array.isArray(bag[source]) ? bag[source] : [];
        return [...new Set(raw.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean))];
    }
    // Only these non-secret identity fields are persisted. URLs discard userinfo/query/hash.
    function safeUrl(value) {
        if (!value) return '';
        try { const u = new URL(String(value)); return u.origin + u.pathname; } catch { return ''; }
    }
    function target(source) {
        const t = typeof getTarget === 'function' ? getTarget() : {
            preset: oaiSettings.preset_settings_openai, profile: '', proxy: oaiSettings.reverse_proxy, customUrl: oaiSettings.custom_url,
        };
        if (!t || typeof t !== 'object') return null;
        return JSON.stringify([source, String(t.preset ?? ''), String(t.profile ?? ''), safeUrl(t.proxy), safeUrl(t.customUrl)]);
    }
    function record(source) {
        const bag = settings().customModelSelection;
        const r = own(bag, source) ? bag[source] : null;
        return r && typeof r === 'object' && typeof r.model === 'string' && r.target === target(source) && list(source).includes(r.model) ? r : null;
    }
    function persist() {
        if (deferWrites) { writePending = true; return true; }
        if (dead) return true;
        const epoch = ++saveEpoch;
        try {
            const result = saveSettings?.();
            if (typeof result?.then === 'function') {
                // Only the latest save may change the retry state or the status.
                // A debounced callback returning undefined is only queued, not a
                // confirmed write, but it must stay retry-clean for normal no-ops.
                result.then(
                    () => { if (epoch === saveEpoch) dirty = false; },
                    () => { if (epoch === saveEpoch) { dirty = true; lastError = 'saveFailed'; if (!dead) notify('saveFailed'); } }
                );
            } else dirty = false;
            return true;
        } catch {
            if (epoch === saveEpoch) { dirty = true; lastError = 'saveFailed'; notify('saveFailed'); }
            return false;
        }
    }
    // One user action may touch both the saved list and the selection. Persist once,
    // after the whole action, instead of scheduling an identical debounced save per step.
    function batchWrites(fn) {
        deferWrites++;
        let result;
        try { result = fn(); }
        finally {
            deferWrites--;
            if (!deferWrites && writePending) { writePending = false; persist(); }
        }
        return result;
    }
    function remember(source, model) {
        const stamp = target(source);
        if (stamp === null) return false;
        const bag = settings().customModelSelection;
        if (bag[source]?.model !== model || bag[source]?.target !== stamp) { put(bag, source, { model, target: stamp }); return true; }
        return false;
    }
    function forget(source) {
        const bag = settings().customModelSelection;
        if (own(bag, source)) { delete bag[source]; persist(); }
    }
    function notify(key) { for (const panel of mounts) if (!panel.dead) panel.status.textContent = words()[key] || ''; }
    function addOptions(source, select) {
        const before = select.value;
        const models = list(source), saved = new Set(models);
        const groups = Array.from(select.children).filter(el => el.tagName === 'OPTGROUP' && el.dataset.kimiCustomModelGroup === source);
        let group = groups[0];
        const groupOf = () => {
            if (!group) {
                group = doc.createElement('optgroup');
                group.label = '工具箱自定义模型';
                group.dataset.kimiCustomModelGroup = source;
                select.appendChild(group);
            }
            return group;
        };
        for (const option of Array.from(select.options)) if (option.dataset.kimiCustomModel === source) {
            if (!saved.has(option.value)) option.remove();
            else if (option.parentNode !== groupOf()) group.appendChild(option);
        }
        const have = new Set(Array.from(select.options, op => op.value));
        for (const model of models) if (!have.has(model)) {
            const option = doc.createElement('option'); option.value = model; option.textContent = model; option.dataset.kimiCustomModel = source; groupOf().appendChild(option); have.add(model);
        }
        for (const el of groups) if (!el.children.length) el.remove();
        if (group && !group.children.length) group.remove();
        // Appending to an empty select must not select the first saved custom model.
        if (select.value !== before) select.value = before;
    }
    function apply(source, model, rememberChoice = true) {
        const c = config(source), select = selectOf(source), stamp = target(source);
        if (dead || suspended || !c || !select || sourceNow() !== source || !list(source).includes(model)) return false;
        addOptions(source, select);
        lastError = '';
        applying = true;
        try {
            const before = valueOf(source);
            select.value = model;
            // Native handlers update context limits/providers. Some ignore empty model_list;
            // the corresponding settings field remains the model authority in that case.
            const jq = win?.jQuery || win?.$;
            if (typeof jq === 'function') jq(select).trigger('change');
            else select.dispatchEvent(new (win?.Event || globalThis.Event)('change', { bubbles: true }));
            if (dead || sourceNow() !== source || target(source) !== stamp || suspended) return false;
            oaiSettings[c.field] = model;
            select.value = model;
            if (select.value !== model || valueOf(source) !== model) return false;
            states.set(source, { select, target: stamp, model, managed: true });
            const recorded = rememberChoice ? remember(source, model) : false;
            // Re-selecting the same managed model (or restoring it after a native redraw)
            // changes neither the field nor the record, but a previous failed save
            // still needs one real retry before the selection can be called persisted.
            if (before !== model || recorded || dirty) return persist() && !lastError;
            return true;
        } catch { return false; }
        finally { applying = false; render(); }
    }
    function reconcile(source, removed = false) {
        if (dead) return;
        const select = selectOf(source);
        bindJquery(source, select);
        if (!select) return;
        const previous = states.get(source);
        const hadOption = previous?.model && Array.from(select.options).some(op => op.value === previous.model);
        const current = valueOf(source), stamp = target(source);
        addOptions(source, select);
        if (source !== sourceNow() || suspended) return;
        const r = record(source);
        const userIntent = intent && intent.source === source && intent.until >= Date.now();
        const lostManaged = removed && previous?.managed && previous.target === stamp && !hadOption && !userIntent;
        // An unrelated nonempty setting (including a preset's ordinary model) always wins.
        const startRestore = !previous && r && (!current || current === r.model);
        if (r && !userIntent && (startRestore || lostManaged)) { apply(source, r.model, false); return; }
        const managed = list(source).includes(current) && select.value === current;
        states.set(source, { select, target: stamp, model: current, managed });
        render();
    }
    function sync() {
        if (dead) return;
        // A fixed, bounded ID lookup, never a document-wide selector scan.
        batchPaint(() => {
            for (const source of Object.keys(SOURCES)) reconcile(source);
            render();
        });
    }
    function queue(source, removed = false) {
        pending.add(source);
        if (removed) removedPending.add(source);
        if (scheduled) return;
        scheduled = true;
        (win?.queueMicrotask || globalThis.queueMicrotask)(() => {
            scheduled = false;
            if (dead) return;
            const work = [...pending]; pending.clear();
            batchPaint(() => { for (const s of work) { const lost = removedPending.delete(s); reconcile(s, lost); } });
        });
    }
    const removedPending = new Set();
    function sourceFor(element) { return Object.keys(SOURCES).find(s => SOURCES[s].id === element?.id); }
    function onIntent(event) {
        const source = sourceFor(event.target);
        if (source) intent = { source, until: Date.now() + 1500 };
        if (TARGET_IDS.has(event.target?.id)) {
            states.clear(); intent = null;
        }
    }
    function bindJquery(source, select) {
        const previous = jqueryBindings.get(source);
        if (previous?.select === select) return;
        if (previous) { previous.wrapper.off('change.kimiCustomModels', previous.handler); jqueryBindings.delete(source); }
        const jq = win?.jQuery || win?.$;
        if (!select || typeof jq !== 'function') return;
        const wrapper = jq(select);
        if (typeof wrapper?.on !== 'function' || typeof wrapper?.off !== 'function') return;
        const handler = event => {
            if (dead || applying || suspended || source !== sourceNow()) return;
            // jQuery.trigger('change') never reaches document's native capture listener.
            // If the old option still exists, this is an explicit choice, not fallback
            // caused by deleting/rebuilding the list. Preserve that ordinary choice.
            const previousState = states.get(source);
            const r = record(source);
            const oldModel = previousState?.managed ? previousState.model : r?.model;
            const model = String(select.value || '');
            const oldStillPresent = oldModel && Array.from(select.options).some(op => op.value === oldModel);
            if (oldStillPresent && model && model !== oldModel) {
                states.set(source, { select, target: target(source), model, managed: false });
                forget(source);
                intent = null;
            }
            // Native user changes also carry originalEvent. Synthetic changes to a
            // saved custom option are explicit only while the previous option exists.
            if (event?.originalEvent?.isTrusted || (oldStillPresent && model !== oldModel)) {
                onChange({ target: select, isTrusted: true });
            } else if (!oldModel || model === oldModel) queue(source);
            // Missing old option: leave the managed snapshot for the mutation observer
            // so an automatic first-item change cannot erase the restoration record.
        };
        wrapper.on('change.kimiCustomModels', handler);
        jqueryBindings.set(source, { select, wrapper, handler });
    }
    function onChange(event) {
        if (dead || applying) return;
        const el = event.target, source = sourceFor(el);
        if (source) {
            const user = event.isTrusted || (intent?.source === source && intent.until >= Date.now());
            if (user) {
                intent = null;
                const model = String(el.value || '');
                const managed = list(source).includes(model);
                states.set(source, { select: el, target: target(source), model, managed });
                if (managed && source === sourceNow()) {
                    const chosenTarget = target(source);
                    // Wait until native target/bubble handlers have finished before correcting
                    // settings on dynamic sources whose native handler refused an empty list.
                    (win?.queueMicrotask || globalThis.queueMicrotask)(() => {
                        if (!dead && !suspended && target(source) === chosenTarget && el.value === model) apply(source, model);
                    });
                } else forget(source);
            }
            queue(source);
        } else if (el?.id === 'chat_completion_source') { states.clear(); sync(); }
        else if (TARGET_IDS.has(el?.id)) { states.clear(); sync(); }
    }
    // Observe document additions only to discover known selectors or their option lists.
    // No global querySelectorAll per mutation; unrelated chat mutations are constant-time.
    const Observer = win?.MutationObserver || globalThis.MutationObserver;
    const observer = Observer ? new Observer(records => {
        for (const mutation of records) {
            const direct = mutation.target?.tagName === 'SELECT' ? mutation.target : mutation.target?.closest?.('select');
            const source = sourceFor(direct);
            if (source) { queue(source, mutation.removedNodes?.length > 0); continue; }
            if (!mutation.addedNodes?.length && !mutation.removedNodes?.length) continue;
            let touched = 0, overflow = false;
            const visit = node => {
                if (!node) return;
                if (++touched > 500) { overflow = true; return; }
                const s = sourceFor(node);
                if (s) { queue(s, !!states.get(s)); return; }
                // A bounded walk only through newly inserted subtrees, not existing DOM.
                for (const child of node.children || []) { visit(child); if (overflow) break; }
            };
            for (const node of mutation.addedNodes || []) { visit(node); if (overflow) break; }
            // A whole settings panel may exceed the traversal budget. Use fixed ID
            // lookups once for that batch rather than miss its newly inserted selectors.
            if (overflow) for (const s of Object.keys(SOURCES)) queue(s, !!states.get(s));
        }
    }) : null;
    function element(tag, text, cls) {
        const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el;
    }
    function button(text, action) { const b = element('button', text, 'kimi-btn'); b.type = 'button'; b.style.minHeight = 'var(--ywcc-control-height, 32px)'; b.addEventListener('click', action); return b; }
    function row() { const r = element('div'); Object.assign(r.style, { display: 'flex', gap: '6px', alignItems: 'center', minWidth: '0', flexWrap: 'wrap' }); return r; }
    function renderPanel(panel) {
        const source = sourceNow(), dict = words(), available = !!selectOf(source) && !!config(source);
        panel.label.textContent = `${dict.current}: ${source || '—'}`;
        panel.input.placeholder = dict.placeholder; panel.input.setAttribute('aria-label', dict.placeholder);
        panel.add.textContent = dict.add; panel.input.disabled = panel.add.disabled = !available;
        panel.note.textContent = source === 'custom' ? dict.custom : !config(source) ? dict.unsupported : !available ? dict.missing : '';
        const models = list(source);
        const key = JSON.stringify([source, models]);
        // Rebuild rows only when the source or the saved model set actually changes.
        // Routine syncs then keep the focused row button and draft input in place.
        if (panel.listKey !== key) {
            panel.listKey = key;
            panel.rows = new Map();
            panel.hint = null;
            panel.list.replaceChildren();
            if (!models.length) { panel.hint = element('div', dict.empty, 'kimi-hint'); panel.list.appendChild(panel.hint); }
            for (const model of models) {
                const line = row(), name = element('span', model);
                Object.assign(name.style, { flex: '1 1 140px', minWidth: '0', overflowWrap: 'anywhere' });
                const use = button(dict.use, () => { if (apply(source, model)) { panel.status.textContent = words().selected; } else panel.status.textContent = words()[lastError || 'failed']; });
                const remove = button(dict.remove, () => {
                    if (dead || panel.dead) return;
                    if (valueOf(source) === model) { panel.status.textContent = words().active; return; }
                    batchWrites(() => {
                        put(settings().customModels, source, list(source).filter(x => x !== model));
                        const select = selectOf(source);
                        for (const op of Array.from(select?.options || [])) if (op.value === model && op.dataset.kimiCustomModel === source) op.remove();
                        if (settings().customModelSelection[source]?.model === model) forget(source);
                        persist();
                    });
                    render();
                });
                panel.rows.set(model, { line, name, use, remove });
                line.append(name, use, remove); panel.list.appendChild(line);
            }
        }
        const current = valueOf(source);
        if (panel.hint) panel.hint.textContent = dict.empty;
        for (const model of models) {
            const entry = panel.rows.get(model);
            if (!entry) continue;
            entry.use.textContent = dict.use; entry.remove.textContent = dict.remove;
            entry.use.disabled = !available;
            const active = current === model;
            entry.remove.disabled = active;
            entry.remove.title = active ? dict.active : '';
        }
    }
    function render() {
        if (paintBatch) { paintPending = true; return; }
        for (const panel of mounts) if (!panel.dead) renderPanel(panel);
    }
    // Reconcile and apply paths can each request a paint; collapse a whole pass
    // into the last one so the panel is rebuilt at most once per sync/queue turn.
    function batchPaint(fn) {
        paintBatch++;
        let result;
        try { result = fn(); }
        finally {
            paintBatch--;
            if (!paintBatch && paintPending) { paintPending = false; render(); }
        }
        return result;
    }
    function mount(container, { scope } = {}) {
        if (dead || !container) return () => {};
        const root = element('div'), label = element('div', '', 'kimi-hint'), line = row();
        const input = element('input', undefined, 'text_pole'); input.type = 'text'; Object.assign(input.style, { flex: '1 1 140px', width: '0', minWidth: '0', minHeight: 'var(--ywcc-control-height, 32px)' });
        const note = element('div', '', 'kimi-hint'), status = element('div', '', 'kimi-hint'), entries = element('div');
        status.setAttribute('role', 'status');
        const panel = { root, label, input, note, status, list: entries, rows: new Map(), hint: null, listKey: '', dead: false };
        const add = button('', () => {
            if (dead || panel.dead) return;
            const source = sourceNow(), model = input.value.trim();
            if (!model) { status.textContent = words().blank; return; }
            if (!config(source) || !selectOf(source)) return;
            const ok = batchWrites(() => {
                const models = list(source); if (!models.includes(model)) { models.push(model); put(settings().customModels, source, models); persist(); }
                input.value = '';
                return apply(source, model);
            });
            if (ok && !lastError) status.textContent = words().selected;
            else { render(); status.textContent = words()[lastError || 'failed']; }
        });
        panel.add = add;
        input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add.click(); } });
        line.append(input, add); root.append(label, line, note, entries, status); container.appendChild(root); mounts.add(panel); renderPanel(panel);
        const cleanup = () => { if (!panel.dead) { panel.dead = true; mounts.delete(panel); root.remove(); } };
        if (typeof scope?.own === 'function') scope.own(cleanup);
        return cleanup;
    }
    const listen = (type, fn, capture = false) => { doc.addEventListener(type, fn, capture); unsubs.push(() => doc.removeEventListener(type, fn, capture)); };
    listen('pointerdown', onIntent, true); listen('keydown', onIntent, true); listen('change', onChange, true);
    function subscribe(key, fn) {
        const type = eventTypes[key]; if (!type || !eventSource?.on) return;
        eventSource.on(type, fn); unsubs.push(() => { if (eventSource.removeListener) eventSource.removeListener(type, fn); else eventSource.off?.(type, fn); });
    }
    subscribe('OAI_PRESET_CHANGED_BEFORE', () => { suspended = true; states.clear(); intent = null; });
    subscribe('OAI_PRESET_CHANGED_AFTER', () => { suspended = false; states.clear(); sync(); });
    subscribe('PRESET_CHANGED', () => { states.clear(); sync(); });
    subscribe('CONNECTION_PROFILE_LOADED', () => { states.clear(); sync(); });
    observer?.observe(doc.documentElement || doc, { childList: true, subtree: true });
    sync();
    return {
        mount, sync,
        // Explicit host actions (e.g. OC Apply) release saved ownership before selecting.
        clearSelection(source = sourceNow()) { if (dead) return; states.delete(source); forget(source); if (intent?.source === source) intent = null; render(); },
        isManaged(source = sourceNow()) { const st = states.get(source); return !!(st?.managed && st.target === target(source) && valueOf(source) === st.model && selectOf(source)?.value === st.model); },
        getSelected(source = sourceNow()) { const st = states.get(source); return st?.managed && st.target === target(source) && valueOf(source) === st.model && selectOf(source)?.value === st.model ? st.model : null; },
        dispose() { if (dead) return; dead = true; observer?.disconnect(); for (const binding of jqueryBindings.values()) binding.wrapper.off('change.kimiCustomModels', binding.handler); jqueryBindings.clear(); for (const off of unsubs.splice(0)) off(); for (const panel of mounts) { panel.dead = true; panel.root.remove(); } mounts.clear(); states.clear(); pending.clear(); removedPending.clear(); },
    };
}
