const ORIGINAL_FIXED_TAGS = ['趣味叙述', '鲜活感', '细腻笔触', '电影感'];
// The V1028 defaults stay available while user-added tags, including older additions, can be removed.
const ORIGINAL_TAGS = new Set([...ORIGINAL_FIXED_TAGS, ...[
  '群像、友情、青春、幽默、唯美、热血、俏皮、有梗、纯情、搞笑、沙雕、轻喜剧、轻小说、漫画感、起点风、晋江风、海棠风、美剧感、大场面、快节奏',
  '慢烟火、绝美文笔、细腻笔触、写意白描、新古典、快意江湖、古香古色、轻松读感、鲜活感、透明感、宿命感、史诗感、综艺感、后宫NP、高智、反转、打脸、爽文',
  '美人、正太、乙女、美食、萌宠、旅游、港风、物哀、慵懒、贵气、病态、虐恋、悬疑、惊悚、恐怖、诡谲、民俗、鬼怪、反差、暧昧、团宠、吐槽、萌、公、嬷、凝、苏、野',
  '意难平、上头、刀、催泪、温情、治愈、温馨、发糖、黏糊糊、浪漫、酸涩、致郁、荒唐、偷感、越界、钓系、狐系、仙品、闷骚、傲娇、重力系、束缚、依存、执着、阴湿、骨科',
  '纯欲、淫荡、雌堕、雄堕、温柔色色、粗俗肉欲、粘腻色情、水尿巴汤、背德、禁忌、战损、初体验、破碎感、智性恋、人外感、养成系、年龄差、体型差、干柴烈火、细水长流',
  '黑色童话、细思极恐、科幻浪漫、法式浪漫、异国风情、纸醉金迷、烂人真心、圣人私心、老夫老妻、破镜难圆、恨海情天、趣味横生、唇枪舌战、极限拉扯、荤话戏谑、微酸微甜',
  '糖里藏刀、替身文学、玻璃渣、烟火气、预热铺垫、火葬场、反套路、小剧场、鹤塑、鹿塑、蛇塑',
].join('、').split('、')]);
const unique = values => [...new Set(values)];

export function normalizeStyleTag(value) {
  const tag = String(value ?? '').trim().replace(/^#/, '').trim();
  return tag && !/[\s#、，,<>\u0060{}…\u0000-\u001f]/u.test(tag) ? tag : '';
}

export function readStyleTags(content) {
  if (typeof content !== 'string') return null;
  if (content.match(/^[ \t]*<\/?inspiration_tags>[ \t]*\r?$/gm)?.length !== 2) return null;
  const blocks = [...content.matchAll(/^[ \t]*<inspiration_tags>[ \t]*\r?\n[\s\S]*?^[ \t]*<\/inspiration_tags>[ \t]*(?=\r?$)/gm)];
  if (blocks.length !== 1) return null;
  const block = blocks[0];
  const fixedRows = [...block[0].matchAll(/^([ \t]*-[ \t]+\*\*固定底色(?:[（(][^）)\r\n]*[）)])?\*\*[ \t]*[：:][ \t]*)([^\r\n]*)/gm)];
  const poolRows = [...block[0].matchAll(/^([ \t]*-[ \t]+包括但不限于[ \t]*[：:][ \t]*)([^\r\n]*)/gm)];
  if (fixedRows.length !== 1 || poolRows.length !== 1) return null;
  const fixedRow = fixedRows[0];
  const poolRow = poolRows[0];
  const fixed = fixedRow[2].trim() ? fixedRow[2].trim().split(/[ \t]+/) : [];
  if (fixed.some(tag => !tag.startsWith('#') || !normalizeStyleTag(tag))) return null;
  const poolEnd = poolRow[2].match(/[ \t]*(?:等?(?:[…]+|\.{3,})|[。])[ \t]*$/u)?.[0] ?? poolRow[2].match(/[ \t]*$/u)[0];
  const poolBody = poolRow[2].slice(0, poolRow[2].length - poolEnd.length);
  const pool = poolBody.split('、').map(normalizeStyleTag).filter(Boolean);
  return { content, block, fixedRow, poolRow, fixed: unique(fixed.map(normalizeStyleTag)), pool: unique(pool), poolBody, poolEnd };
}

export function replaceStyleTags(parsed, fixed, additions = [], removals = []) {
  const selected = unique(fixed.map(normalizeStyleTag).filter(Boolean));
  const added = unique(additions.map(normalizeStyleTag).filter(Boolean)).filter(tag => !parsed.pool.includes(tag));
  const removed = new Set(removals);
  const patches = [];
  const put = (row, value) => patches.push({ start: parsed.block.index + row.index + row[1].length, length: row[2].length, value });
  if (selected.join('\n') !== parsed.fixed.join('\n')) {
    const ending = /[ \t]*$/.exec(parsed.fixedRow[2])[0];
    put(parsed.fixedRow, selected.map(tag => '#' + tag).join(' ') + ending);
  }
  if (added.length || removed.size) {
    const body = removed.size
      ? parsed.poolBody.split('、').filter(part => !removed.has(normalizeStyleTag(part))).join('、')
      : parsed.poolBody;
    const separator = body && added.length && !body.endsWith('、') ? '、' : '';
    put(parsed.poolRow, body + separator + added.join('、') + parsed.poolEnd);
  }
  let content = parsed.content;
  for (const { start, length, value } of patches.sort((a, b) => b.start - a.start)) {
    content = content.slice(0, start) + value + content.slice(start + length);
  }
  return content;
}

export function openStyleTagsDialog(doc, parsed, { save, onClose, rememberedOrder, rememberOrder }) {
  const node = (tag, classes, label) => {
    const element = doc.createElement(tag);
    if (classes) element.className = classes;
    if (label) element.textContent = label;
    return element;
  };
  const button = (classes, label) => Object.assign(node('button', classes, label), { type: 'button' });
  const dialog = node('dialog', 'ywpc-root ywpc-style-tags');
  dialog.setAttribute('aria-label', '文风TAG');
  const header = node('div', 'ywpc-style-tags-head');
  const close = button('ywpc-edit-btn', '关闭');
  header.append(node('h2', '', '文风TAG'), close);
  const fixedList = node('div', 'ywpc-style-tags-chips ywpc-style-tags-fixed');
  const filter = node('input', 'ywpc-edit-input');
  filter.type = 'search';
  filter.placeholder = '查找 TAG';
  filter.setAttribute('aria-label', '查找 TAG');
  const poolList = node('div', 'ywpc-style-tags-chips ywpc-style-tags-pool');
  const form = node('form', 'ywpc-style-tags-form');
  const input = node('input', 'ywpc-edit-input');
  input.type = 'search';
  input.placeholder = '新增 TAG';
  input.setAttribute('aria-label', '新增 TAG');
  const add = node('button', 'ywpc-edit-btn ywpc-edit-primary', '添加');
  add.type = 'submit';
  form.append(input, add);
  const footer = node('div', 'ywpc-style-tags-foot');
  const status = node('span', '', '');
  status.setAttribute('role', 'status');
  const retry = button('ywpc-edit-btn', '重试保存');
  retry.hidden = true;
  footer.append(status, retry);
  dialog.append(header, node('h3', '', '固定底色'), fixedList, node('h3', '', '灵感 TAG 池'), filter, poolList, form, footer);

  const fixed = new Set(parsed.fixed);
  const pool = new Set(parsed.pool);
  let order = Array.isArray(rememberedOrder) ? unique(rememberedOrder.filter(tag => tag && normalizeStyleTag(tag) === tag)) : [];
  const selectedOrder = () => order.filter(tag => fixed.has(tag));
  if (selectedOrder().join('\n') !== parsed.fixed.join('\n')) order = [...parsed.fixed];
  const choices = new Map();
  let saved = parsed.content;
  let saving = false;
  let blocked = false;
  let closed = false;
  let drag = null;

  function setStatus(message, retryable = false) {
    status.textContent = message;
    retry.hidden = !retryable;
  }

  async function flush() {
    if (saving || closed || blocked) return;
    saving = true;
    close.disabled = true;
    try {
      while (!closed) {
        const nextOrder = [...order];
        const next = replaceStyleTags(parsed, selectedOrder(),
          [...pool].filter(tag => !parsed.pool.includes(tag)), parsed.pool.filter(tag => !pool.has(tag)));
        if (next === saved) break;
        setStatus('保存中…');
        const result = await save(saved, next);
        if (result?.switched || result?.conflict || result?.unverified) {
          blocked = true;
          setStatus('当前预设或条目已变化，请关闭后重新打开核对。');
          return;
        }
        if (result?.ok !== true) throw new Error('酒馆没有确认保存');
        saved = next;
        rememberOrder?.(nextOrder);
        setStatus('已保存');
      }
    } catch (error) {
      setStatus('保存失败：' + (error?.message || '请重试'), true);
    } finally {
      saving = false;
      close.disabled = false;
    }
  }

  function renderFixed() {
    fixedList.replaceChildren();
    for (const tag of selectedOrder()) {
      const item = node('div', 'ywpc-style-tag-item');
      item.dataset.styleFixed = tag;
      const handle = button('ywpc-style-tag-handle', '⠿');
      handle.title = '拖动排序，也可用方向键';
      handle.setAttribute('aria-label', '移动固定底色 ' + tag);
      handle.addEventListener('pointerdown', event => {
        if (blocked || drag || event.button !== 0) return;
        handle.setPointerCapture(event.pointerId);
        drag = { tag, id: event.pointerId, x: event.clientX, y: event.clientY, target: null };
      });
      handle.addEventListener('keydown', event => {
        const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
        if (!delta) return;
        event.preventDefault();
        const current = selectedOrder();
        moveFixed(tag, current[current.indexOf(tag) + delta], true);
      });
      const chip = button('ywpc-chip', '#' + tag + ' ×');
      chip.setAttribute('aria-label', '移除固定底色 ' + tag);
      chip.setAttribute('aria-pressed', 'true');
      chip.addEventListener('click', () => { toggle(tag); choices.get(tag)?.chip.focus(); });
      item.append(handle, chip);
      fixedList.append(item);
    }
    if (!fixed.size) fixedList.append(node('span', 'ywpc-style-tags-empty', '未选固定底色'));
  }

  function moveFixed(tag, target, focus = false) {
    if (blocked || tag === target || !fixed.has(tag) || !fixed.has(target)) return;
    const current = selectedOrder();
    const index = current.indexOf(target);
    current.splice(current.indexOf(tag), 1);
    current.splice(index, 0, tag);
    const reordered = current.values();
    order = order.map(entry => fixed.has(entry) ? reordered.next().value : entry);
    renderFixed();
    if (focus) fixedList.children[index].firstElementChild.focus();
    void flush();
  }

  fixedList.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5 && !drag.target) return;
    const hit = doc.elementFromPoint(event.clientX, event.clientY)?.closest('[data-style-fixed]');
    const target = fixedList.contains(hit) && hit.dataset.styleFixed !== drag.tag ? hit : null;
    if (target === drag.target) return;
    drag.target?.classList.remove('ywpc-style-tag-drop');
    target?.classList.add('ywpc-style-tag-drop');
    drag.target = target;
  });
  function endDrag(event) {
    if (drag?.id !== event.pointerId) return;
    const { tag, target } = drag;
    drag = null;
    target?.classList.remove('ywpc-style-tag-drop');
    if (event.type === 'pointerup') moveFixed(tag, target?.dataset.styleFixed, true);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) fixedList.addEventListener(type, endDrag);

  function toggle(tag) {
    if (blocked) return;
    if (fixed.has(tag)) fixed.delete(tag);
    else {
      fixed.add(tag);
      if (!order.includes(tag)) order.push(tag);
    }
    choices.get(tag)?.chip.setAttribute('aria-pressed', String(fixed.has(tag)));
    renderFixed();
    void flush();
  }

  function addChoice(tag) {
    const item = node('div', 'ywpc-style-tag-option');
    const chip = button('ywpc-chip', '#' + tag);
    chip.setAttribute('aria-pressed', String(fixed.has(tag)));
    chip.addEventListener('click', () => toggle(tag));
    item.append(chip);
    if (pool.has(tag) && !ORIGINAL_TAGS.has(tag)) {
      const remove = button('ywpc-style-tag-remove', '×');
      remove.title = '删除自定义 TAG';
      remove.setAttribute('aria-label', '删除自定义 TAG ' + tag);
      remove.addEventListener('click', () => {
        if (blocked) return;
        fixed.delete(tag);
        pool.delete(tag);
        order = order.filter(entry => entry !== tag);
        choices.delete(tag);
        item.remove();
        renderFixed();
        void flush();
      });
      item.append(remove);
    }
    choices.set(tag, { item, chip });
    poolList.append(item);
  }

  for (const tag of unique([...parsed.fixed, ...ORIGINAL_FIXED_TAGS, ...parsed.pool])) addChoice(tag);
  renderFixed();
  function applyFilter() {
    const query = filter.value.trim().replace(/^#/, '').toLocaleLowerCase();
    for (const [tag, { item }] of choices) item.hidden = !tag.toLocaleLowerCase().includes(query);
  }
  filter.addEventListener('input', applyFilter);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (blocked) return;
    const tag = normalizeStyleTag(input.value);
    if (!tag) { setStatus('请输入一个不带空格或分隔符的 TAG。', !retry.hidden); return; }
    if (pool.has(tag)) { setStatus('TAG 池里已有这一项。', !retry.hidden); return; }
    pool.add(tag);
    choices.get(tag)?.item.remove();
    addChoice(tag);
    input.value = '';
    filter.value = '';
    applyFilter();
    choices.get(tag)?.item.scrollIntoView?.({ block: 'nearest' });
    void flush();
  });
  retry.addEventListener('click', () => { void flush(); });
  const dispose = () => {
    if (closed) return;
    closed = true;
    dialog.remove();
    onClose();
  };
  function dismiss() {
    if (saving) return;
    dialog.close();
    dispose();
  }
  close.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', dispose);
  doc.body.append(dialog);
  try { dialog.showModal(); } catch (error) { dispose(); throw error; }
  return { dispose, focus: () => filter.focus() };
}
