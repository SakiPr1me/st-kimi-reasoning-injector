import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, messageFormatting, eventSource, event_types } from "../../../../script.js";
import { t } from "./index.js"; // 三语文案（index.js 导出；函数声明循环引用安全）

// ============================================
// ===== 合并模块：一键标签修复 (原 st-tag-auto-fixer) =====
// ============================================
(function () {

// [tag-auto-fixer] IIFE 加载开始
console.log('[TagAutoFixer-merged] IIFE executed, setting up');
// eventSource / event_types：script.js 已 re-export（SillyTavern/public/script.js 第 325-326 行）
// 供「每轮输出结束自动修」监听 MESSAGE_RECEIVED 事件


const extensionName = "tag_auto_fixer";
const defaultTagTree = `scene
content
Danmaku
choice
todo
  R
remind
Events
  I
zy
small_theater_1
small_theater_2
mutter`;

// 仅供"自动识别容器"内部排除用：这些是 HTML 标签本身，绝不能把它们当"小剧场容器"自动填入。
// ⚠️ 它不影响扫描——任何标签（包括 div/span/code）都能正常扫进树。
// summary 已特意移除——它是很多 RP 格式的正式标签，不受此名单约束。
const HTML_TAG_NAMES = [
	'html', 'head', 'body', 'div', 'span', 'p', 'b', 'i', 'em', 'strong', 'u', 's',
	'small', 'sub', 'sup', 'br', 'hr', 'a', 'img', 'ul', 'ol', 'li', 'table', 'tr',
	'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
	'section', 'article', 'nav', 'footer', 'header', 'aside', 'form', 'input',
	'button', 'label', 'select', 'option', 'style', 'script', 'meta', 'link',
	'title', 'font', 'center', 'marquee', 'abbr', 'cite', 'mark', 'ins', 'del',
	'kbd', 'samp', 'var', 'q', 'iframe', 'video', 'audio', 'caption', 'tbody',
	'thead', 'tfoot', 'col', 'colgroup', 'fieldset', 'legend', 'textarea', 'details',
	'dialog', 'main', 'figure', 'figcaption', 'picture', 'source', 'track',
];

const defaultSettings = {
	tagTree: defaultTagTree,
	showInlineBtn: true,
	showFloatingBtn: false,
	showMenuBtn: true,
	autoFixEnabled: false,   // 每轮输出结束自动修（默认关，谨慎勾选）
	autoScanEnabled: false,  // 每轮自动扫描（只标不改，与自动修复互斥；默认关）
	wrapMissingEnabled: false, // 智能补全：标签整块丢失时推断补回（默认关，谨慎勾选）
	htmlContainer: 'extra',   // 小剧场/HTML 容器标签：扫描时其内部一律跳过（可多个，一行一个）
	askOnDisputed: true,      // 扫描时发现"不在树里的疑似 HTML 块" → 弹窗让用户选：进树还是进容器
};
if (!extension_settings[extensionName]) extension_settings[extensionName] = defaultSettings;
const settings = extension_settings[extensionName];
if (!settings.tagTree) settings.tagTree = defaultTagTree;
if (settings.showInlineBtn === undefined) settings.showInlineBtn = true;
if (settings.showFloatingBtn === undefined) settings.showFloatingBtn = false;
if (settings.showMenuBtn === undefined) settings.showMenuBtn = true;
if (settings.autoFixEnabled === undefined) settings.autoFixEnabled = false;
if (settings.autoScanEnabled === undefined) settings.autoScanEnabled = false;
if (settings.wrapMissingEnabled === undefined) settings.wrapMissingEnabled = false;
if (settings.htmlContainer === undefined) settings.htmlContainer = 'extra';
if (settings.askOnDisputed === undefined) {
	// 迁移旧键 autoDetectContainer（旧版是"自动填入容器"，现在改成"弹窗询问"）
	settings.askOnDisputed = settings.autoDetectContainer !== undefined ? settings.autoDetectContainer : true;
	delete settings.autoDetectContainer;
}

// ========== 解析标签树（缩进 → 嵌套层级）==========

// 缩进 → 嵌套层级：1 个 Tab = 1 层，2 个空格 = 1 层。
// 修复：旧逻辑 Math.round(空白字符数 / 2) 对 Tab 缩进会把多级（如 \t\tR）拉平到同级，
//       导致 R 被误判为 todo 的同级而非子级。这里按"Tab 即一层、两空格即一层"精确换算。
function indentLevel(line) {
	const m = line.match(/^[ \t]*/);
	if (!m || m[0].length === 0) return 0;
	let level = 0;
	for (const ch of m[0]) level += (ch === '\t') ? 1 : 0.5;
	return Math.max(1, Math.round(level));
}

function parseTagTree() {
	const lines = settings.tagTree.split('\n').filter(l => l.trim());
	const allTags = new Set();
	const siblings = new Set();
	const children = {}; // { parentName: Set of childNames }

	const stack = [];
	for (const line of lines) {
		const rawIndent = line.search(/\S/);
		const name = line.trim();
		allTags.add(name);
		if (rawIndent === 0) siblings.add(name);

		const depth = indentLevel(line);
		while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
		if (stack.length > 0) {
			const parent = stack[stack.length - 1].name;
			if (!children[parent]) children[parent] = new Set();
			children[parent].add(name);
		}
		stack.push({ name, depth });
	}

	return { allTags: [...allTags], siblings, children };
}

// ========== 自动识别"小剧场/HTML 容器" ==========
// 护栏（全部满足才算候选）：
//   1. 顶层块（不嵌套在其它块里）
//   2. 名字不在当前标签树里（树里的是用户自己的结构标签，绝不猜）
//   3. 不在已配置的容器里、也不在 HTML 标签本身（excludeTags）
//   4. 块内部有明显 HTML 特征（div/span/table 等标签，或 class=/style= 等属性）
// 返回候选名字列表（按出现顺序，已去重）。
function detectHtmlContainer(mes, treeNames, containerNames, excludeTags) {
	const re = /<\/?([a-zA-Z_][a-zA-Z0-9_.-]*)\b[^>]*?>/g;
	const events = [];
	let m;
	while ((m = re.exec(mes)) !== null) {
		events.push({ name: m[1], isClose: m[0].startsWith('</'), pos: m.index, len: m[0].length });
	}

	// 栈式配对：记录每个完整块区间及其嵌套深度
	const stack = [];
	const ranges = [];
	for (const ev of events) {
		if (!ev.isClose) {
			stack.push({ name: ev.name, startEnd: ev.pos + ev.len });
		} else {
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].name.toLowerCase() === ev.name.toLowerCase()) {
					const op = stack.splice(i, 1)[0];
					ranges.push({ name: op.name, startEnd: op.startEnd, endPos: ev.pos, depth: stack.length });
					break;
				}
			}
		}
	}

	const HTML_SIG_TAGS = /<(?:div|span|table|tr|td|th|img|a|ul|ol|li|style|script|form|input|button|label|select|option|iframe|video|audio|marquee|nav|header|footer|section|article|br|hr)\b/i;
	const HTML_SIG_ATTRS = /\b(?:class|style|id|width|height|src|href|onclick|onload|background|color|font-family|font-size)\s*=/i;

	const cands = [];
	for (const r of ranges) {
		if (r.depth !== 0) continue;
		if (treeNames.has(r.name)) continue;
		if (containerNames.has(r.name)) continue;
		if (excludeTags.has(r.name.toLowerCase())) continue;
		const inner = mes.slice(r.startEnd, r.endPos);
		if (HTML_SIG_TAGS.test(inner) || HTML_SIG_ATTRS.test(inner)) cands.push(r.name);
	}
	return [...new Set(cands)];
}

// ========== 询问用户：争议块进树还是进容器 ==========
// 返回 Promise<'container' | 'tree' | 'ignore'>
function askContainerChoice(candidate) {
	return new Promise((resolve) => {
		const modalId = `${extensionName}_ask_modal`;
		$(`#${modalId}`).remove();
		const $overlay = $(`
			<div id="${modalId}" style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
			<div style="background:var(--secondary-surface,#fff);border-radius:8px;padding:18px 22px;max-width:440px;box-shadow:0 4px 20px rgba(0,0,0,.4)">
			<b style="font-size:0.95em">🔍 检测到疑似小剧场/HTML 块</b>
			<p style="font-size:0.8em;margin:8px 0;color:var(--grey_color);line-height:1.5">
			标签 <code>&lt;${candidate}&gt;</code> 不在你的标签树里，但内部有明显 HTML 特征。<br>
			你希望它作为？
			</p>
			<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
			<button class="menu_button" data-v="tree">🌳 进树（结构标签）</button>
			<button class="menu_button" data-v="container">📦 进容器（HTML/小剧场）</button>
			</div>
			</div>
			</div>`);
		$('body').append($overlay);
		const done = (v) => { $overlay.remove(); resolve(v); };
		$overlay.find('button').on('click', function() { done($(this).attr('data-v')); });
		$overlay.on('click', function(e) { if (e.target === this) done('ignore'); });
	});
}

// ========== 扫描消息、重建标签树 ==========

async function scanAndFill(replaceMode = false) {
	const ctx = getContext();
	if (!ctx?.chat?.length) { toastr?.warning?.('没有聊天消息'); return; }

	let lastMsg = null;
	for (let i = ctx.chat.length - 1; i >= 0; i--) {
		if (!ctx.chat[i].is_user) { lastMsg = ctx.chat[i]; break; }
	}
	if (!lastMsg) { toastr?.warning?.('未找到AI消息'); return; }

	// 清理干扰块
	let clean = lastMsg.mes.replace(/<!DOCTYPE[\s\S]*?<\/html>/gi, '');
	clean = clean.replace(/<xs:schema[\s\S]*?<\/xs:schema>/gi, '');
	clean = clean.replace(/<dream_plot[\s\S]*?<\/dream_plot>/gi, '');
	clean = clean.replace(/<story_plot[\s\S]*?<\/story_plot>/gi, '');
	clean = clean.replace(/<output_format>[\s\S]*?<\/output_format>/gi, '');

	// 树内声明的名字：权威依据（已在树里的任何名字都保留，扫描/跳过都不碰它）
	const treeNames = new Set(settings.tagTree.split('\n').map(l => l.trim()).filter(Boolean));

	// 小剧场/HTML 容器：用户可配置的标签名（默认 extra）。扫描时这些标签的内部一律跳过（保留标签本身）。
	let containerNames = new Set((settings.htmlContainer || '').split(/[\s,]+/).filter(Boolean));

	// 争议块询问（可选）：发现"树外未知顶层块 + 明显 HTML 特征" → 弹窗让用户决定：进树还是进容器。
	// HTML 标签本身（div/span 等）绝不会出现在候选里。
	if (settings.askOnDisputed) {
		try {
			const cands = detectHtmlContainer(lastMsg.mes, treeNames, containerNames, new Set(HTML_TAG_NAMES));
			if (cands.length === 1 && !containerNames.has(cands[0])) {
				const choice = await askContainerChoice(cands[0]);
				if (choice === 'container') {
					containerNames.add(cands[0]);
					settings.htmlContainer = [...containerNames].join('\n');
					saveSettingsDebounced();
					toastr?.info?.(`📦 <${cands[0]}> 已加入容器名单（以后扫描内部一律跳过）`);
				} else if (choice === 'tree') {
					toastr?.info?.(`🌳 <${cands[0]}> 将按结构标签扫描进树`);
				}
			} else if (cands.length > 1) {
				toastr?.info?.(`🔍 检测到多个疑似小剧场标签（${cands.join('、')}），请在设置里手动指定`);
			}
		} catch (e) {
			console.warn('[TagAutoFixer] 弹窗询问失败:', e);
		}
	}

	// 挖空容器内部（保留容器标签本身）：容器里的 HTML/杂物标签一律不进扫描
	for (const nm of containerNames) {
		const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		clean = clean.replace(new RegExp(`(<${esc}(?:\\s[^>]*)?>)[\\s\\S]*?(<\\/${esc}(?:\\s[^>]*)?>)`, 'gi'), '$1$2');
	}

	// 拆出所有标签事件——不做任何 HTML 名字过滤，任何标签都能扫进树。
	// 噪音交给"容器挖空"兜底；重复多次的内联标签会被下面的内联过滤自动丢弃。
	const tagRe = /<\/?([a-zA-Z_][a-zA-Z0-9_.-]*)\b[^>]*?(?<!\/)>/g;
	const allTags = [];
	const tagCount = {};

	let m;
	while ((m = tagRe.exec(clean)) !== null) {
		const name = m[1];
		allTags.push({ name, isClose: m[0].startsWith('</'), pos: m.index });
		tagCount[name] = (tagCount[name] || 0) + 1;
	}

	if (!allTags.length) { toastr?.info?.('未检测到任何标签'); return; }

	// 构建完整闭合区间
	const ranges = [];
	const openStack = [];
	for (const t of allTags) {
		if (!t.isClose) {
			openStack.push({ name: t.name, start: t.pos });
		} else {
			// 最近匹配：从后往前找同名开标签
			for (let i = openStack.length - 1; i >= 0; i--) {
				if (openStack[i].name === t.name) {
					ranges.push({ name: t.name, start: openStack[i].start, end: t.pos, children: new Set() });
					openStack.splice(i, 1);
					break;
				}
			}
		}
	}

	// ===== 关键修复：当 ranges 为空时的回退逻辑 =====
	if (!ranges.length) {
		// AI 可能掉了闭合标签。从 allTags 直接检测嵌套关系。
		const uniqueNames = [...new Set(allTags.map(t => t.name))];
		console.log('[TagAutoFixer] 未找到完整闭合对，从孤儿标签推断。检测到的标签:', uniqueNames);

		// 检测 enclosure：即使没有完整闭合对，也能通过栈匹配找到大多数区间
		const enclosureMap = {}; // { name: Set of enclosed tag names }
		for (const name of uniqueNames) enclosureMap[name] = new Set();

		const tempStack = []; // [{ name, startPos }]
		const tempPairs = []; // [{ name, start, end }]

		for (const t of allTags) {
			if (!t.isClose) {
				tempStack.push({ name: t.name, startPos: t.pos });
			} else {
				for (let i = tempStack.length - 1; i >= 0; i--) {
					if (tempStack[i].name === t.name) {
						tempPairs.push({ name: t.name, start: tempStack[i].startPos, end: t.pos });
						// 检查这个区间内包含的其他标签名
						for (const other of allTags) {
							if (other.name !== t.name && other.pos > tempStack[i].startPos && other.pos < t.pos) {
								enclosureMap[t.name].add(other.name);
							}
						}
						tempStack.splice(i, 1);
						break;
					}
				}
			}
		}

		// 孤儿标签（栈中剩余）：它们可能也包含其他标签
		for (const orphan of tempStack) {
			for (const other of allTags) {
				if (other.name !== orphan.name && other.pos > orphan.startPos) {
					enclosureMap[orphan.name].add(other.name);
				}
			}
		}

		// 内联标签判定：出现 >= 2 个闭合对 且 不包含任何其他标签 → 过滤
		const isStructural = {};
		for (const name of uniqueNames) {
			const pairCount = (tagCount[name] || 0) / 2;
			const hasEnclosure = enclosureMap[name] && enclosureMap[name].size > 0;
			isStructural[name] = hasEnclosure || pairCount <= 1;
		}

		// 去除内联标签后重建 enclosure（内联被过滤后，它们的父标签可能也失去 child）
		const structuralNames = uniqueNames.filter(n => isStructural[n]);
		const cleanEnclosure = {};
		for (const name of structuralNames) {
			cleanEnclosure[name] = new Set();
			if (enclosureMap[name]) {
				for (const c of enclosureMap[name]) {
					if (isStructural[c] && c !== name) cleanEnclosure[name].add(c);
				}
			}
		}

		// 找根级标签（不被任何其他结构标签包含的）
		const allChildren = new Set();
		for (const [name, children] of Object.entries(cleanEnclosure)) {
			for (const c of children) allChildren.add(c);
		}
		const roots = structuralNames.filter(n => !allChildren.has(n));
		// 如果所有都是子标签（嵌套极深），全部作为根级
		if (!roots.length) roots.push(...structuralNames);

		// 按首次出现位置排序
		const firstPosMap = {};
		for (const t of allTags) {
			if (!t.isClose && structuralNames.includes(t.name) && !(t.name in firstPosMap)) {
				firstPosMap[t.name] = t.pos;
			}
		}
		roots.sort((a, b) => (firstPosMap[a] ?? 1e9) - (firstPosMap[b] ?? 1e9));

		// 构建缩进树
		const fallbackTree = [];
		const vb = new Set(); // visited
		function walk(name, depth) {
			if (vb.has(name)) return;
			vb.add(name);
			const prefix = '  '.repeat(depth);
			fallbackTree.push(prefix + name);
			const kids = [...(cleanEnclosure[name] || [])].filter(c => !vb.has(c));
			kids.sort((a, b) => (firstPosMap[a] ?? 1e9) - (firstPosMap[b] ?? 1e9));
			for (const kid of kids) walk(kid, depth + 1);
		}
		for (const r of roots) walk(r, 0);

		if (!fallbackTree.length) {
			toastr?.info?.('扫描完成但未能推断标签层级。请手动调整缩进。');
			return;
		}

		const inlineCount = uniqueNames.length - structuralNames.length;
		settings.tagTree = fallbackTree.join('\n');
		$(`#${extensionName}_tree`).val(settings.tagTree);
		saveSettingsDebounced();
		toastr?.success?.(`✅ 标签树已重建（${structuralNames.length} 个结构标签，${inlineCount} 个内联标签已过滤）`);
		return;
	}

	// 有完整闭合对，正常推断父子关系
	for (const parent of ranges) {
		for (const child of ranges) {
			if (child.name !== parent.name && child.start > parent.start && child.end < parent.end) {
				parent.children.add(child.name);
			}
		}
	}

	// 过滤内联标签：多次出现且无子标签 → 视为内联
	const hasChildren = new Set();
	for (const r of ranges) { if (r.children.size > 0) hasChildren.add(r.name); }
	const kept = new Set();
	for (const r of ranges) {
		const count = tagCount[r.name] / 2; // 闭合对数量
		if (hasChildren.has(r.name) || count <= 1) kept.add(r.name);
	}

	// 找根级标签（不被任何结构标签包含）
	const allChildNames = new Set();
	for (const r of ranges) {
		if (kept.has(r.name)) {
			for (const c of r.children) { if (kept.has(c)) allChildNames.add(c); }
		}
	}
	let rootCandidates = ranges.filter(r => kept.has(r.name) && !allChildNames.has(r.name));

	// 回退：如果过滤后根级为空，保留所有标签
	if (!rootCandidates.length) {
		rootCandidates = ranges.filter(r => !allChildNames.has(r.name));
		for (const r of rootCandidates) kept.add(r.name);
	}

	// ===== 去重 + 合并：同名标签只保留一个，children 取并集 =====
	const tagMeta = {}; // { name: { firstPos, children: Set } }
	for (const r of ranges) {
		if (!kept.has(r.name)) continue;
		if (!tagMeta[r.name]) {
			tagMeta[r.name] = { firstPos: r.start, children: new Set() };
		} else if (r.start < tagMeta[r.name].firstPos) {
			tagMeta[r.name].firstPos = r.start;
		}
		for (const c of r.children) {
			if (kept.has(c) && c !== r.name) tagMeta[r.name].children.add(c);
		}
	}

	// 保留孤儿开标签（掉了闭合的标签）：它们可能是一级父标签
	for (const orphan of openStack) {
		if (!tagMeta[orphan.name]) {
			tagMeta[orphan.name] = { firstPos: orphan.start, children: new Set() };
		} else if (orphan.start < tagMeta[orphan.name].firstPos) {
			tagMeta[orphan.name].firstPos = orphan.start;
		}
		for (const r of ranges) {
			if (kept.has(r.name) && r.name !== orphan.name && r.start > orphan.start) {
				tagMeta[orphan.name].children.add(r.name);
			}
		}
	}

	// 补充模式：合并已有配置的标签树（全量替换模式则跳过此步）
	if (!replaceMode) {
		const existingLines = settings.tagTree.split('\n').filter(l => l.trim());
		const indentStack = [];
		for (const line of existingLines) {
			const rawIndent = line.search(/\S/);
			const name = line.trim();
			const depth = indentLevel(line);
			while (indentStack.length > 0 && indentStack[indentStack.length - 1].depth >= depth) {
				indentStack.pop();
			}
			if (!tagMeta[name]) {
				tagMeta[name] = { firstPos: Infinity, children: new Set() };
			}
			if (indentStack.length > 0 && tagMeta[name]?.firstPos === Infinity) {
				const parent = indentStack[indentStack.length - 1].name;
				if (!tagMeta[parent]) {
					tagMeta[parent] = { firstPos: Infinity, children: new Set() };
				}
				tagMeta[parent].children.add(name);
			}
			indentStack.push({ name, depth });
		}
	}

	// 找去重后的根级标签
	const allChildNamesDedup = new Set();
	for (const [name, meta] of Object.entries(tagMeta)) {
		for (const c of meta.children) allChildNamesDedup.add(c);
	}
	const rootNames = Object.keys(tagMeta).filter(n => !allChildNamesDedup.has(n));
	if (!rootNames.length) {
		rootNames.push(...Object.keys(tagMeta));
	}

	// 按最早出现位置排序（已有标签在 Infinity，排最后）
	rootNames.sort((a, b) => (tagMeta[a]?.firstPos ?? 1e9) - (tagMeta[b]?.firstPos ?? 1e9));

	// 构建缩进树（递归，visited 防止循环）
	const builtTree = [];
	const visited = new Set();
	function addBranch(name, depth) {
		if (visited.has(name)) return;
		visited.add(name);
		const meta = tagMeta[name];
		if (!meta) return;
		const prefix = '  '.repeat(depth);
		builtTree.push(prefix + name);
		const sortedChildren = [...meta.children]
			.filter(c => tagMeta[c] && c !== name)
			.sort((a, b) => (tagMeta[a]?.firstPos ?? 0) - (tagMeta[b]?.firstPos ?? 0));
		for (const childName of sortedChildren) {
			if (visited.has(childName)) continue;
			addBranch(childName, depth + 1);
		}
	}
	for (const rootName of rootNames) { addBranch(rootName, 0); }

	if (!builtTree.length) {
		toastr?.info?.('扫描完成但未能推断标签层级。请手动调整缩进。');
		return;
	}

	const newTree = builtTree.join('\n');
	settings.tagTree = newTree;
	$(`#${extensionName}_tree`).val(settings.tagTree);
	saveSettingsDebounced();

	const structureNames = Object.keys(tagMeta).length;
	const totalNames = new Set(ranges.map(r => r.name)).size;
	toastr?.success?.(`✅ 标签树已重建（${structureNames} 个结构标签，${totalNames - structureNames} 个内联标签已过滤）`);
}

// ========== 智能补全：补回「连开带闭整个丢失」的标签块 ==========
// 仅当 settings.wrapMissingEnabled 为 true 时由 fixTagsInText 调用。
// 触发条件（全部满足才补，缺一不可）：
//   1. 该标签在整条消息里完全没有出现（开标签和闭标签一起丢了）；
//   2. 且满足下面两者之一：
//      a. 祖先补全：它的某个子/孙标签出现了 → 把子标签连成的连续区域包进它；
//      b. 夹逼补全：它的前兄弟、后兄弟都完整闭合，中间恰好只缺它一个 → 把夹逼区间包进它。
// 安全保证：结构正确的消息（该标签还在文里）永远不会被本函数改动；
//           只有本来就缺了整块的坏消息才会被补。

function wrapMissingTags(body, tags, siblings, children) {
	const escaped = tags.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const tagRe = new RegExp(`<\\/?(${escaped.join('|')})\\b[^>]*?(?<!\\/)>`, 'gi');

	// 树的嵌套深度（用于"从内到外"处理，先补最里层，外层再包住里层）
	const depthMap = {};
	for (const root of siblings) {
		depthMap[root] = 0;
		(function walk(n, d) {
			for (const k of (children[n] || [])) { depthMap[k] = d + 1; walk(k, d + 1); }
		})(root, 0);
	}

	// 父映射：查某标签的兄弟组（顶层组 = siblings；非顶层组 = 其父的直接子集）
	const parentMap = {};
	for (const root of siblings) parentMap[root] = null;
	for (const [p, kids] of Object.entries(children)) {
		for (const k of kids) parentMap[k] = p;
	}
	function siblingGroup(name) {
		const p = parentMap[name];
		return p === null ? [...siblings] : [...(children[p] || [])];
	}

	// 某标签的全量子孙（不含自身）
	function descendantsOf(name) {
		const out = new Set();
		(function collect(n) {
			for (const k of (children[n] || [])) { out.add(k); collect(k); }
		})(name);
		return out;
	}

	// 扫描当前文本中的树内标签事件
	function scanEvents(str) {
		const evs = [];
		let m;
		const re = new RegExp(tagRe.source, tagRe.flags);
		while ((m = re.exec(str)) !== null) {
			evs.push({ name: m[1], pos: m.index, len: m[0].length, isClose: m[0].startsWith('</') });
		}
		return evs;
	}

	// 祖先补全：把"不被同级兄弟打断"的连续子标签区域，逐段包进缺失的父标签
	function wrapAncestor(text, miss, descSet, blockers) {
		const evs = scanEvents(text);
		const segs = [];
		let curStart = -1, curEnd = -1, curClosed = false;
		for (const e of evs) {
			if (descSet.has(e.name)) {
				if (curStart < 0) {
					// 段必须从一个"开标签"开始（孤立闭合不开启新段）
					if (!e.isClose) { curStart = e.pos; curEnd = e.pos + e.len; curClosed = false; }
				} else {
					curEnd = e.pos + e.len;
					if (e.isClose) curClosed = true;
				}
			} else if (curStart >= 0 && blockers.has(e.name)) {
				if (curClosed) segs.push({ sPos: curStart, ePos: curEnd });
				curStart = -1; curEnd = -1; curClosed = false;
			}
		}
		if (curStart >= 0 && curClosed) segs.push({ sPos: curStart, ePos: curEnd });
		if (!segs.length) return { text, added: 0 };

		// 从后往前插入，保证位置偏移不串
		segs.sort((a, b) => b.sPos - a.sPos);
		let added = 0;
		for (const seg of segs) {
			// 去掉段尾多余空白，避免拼出双换行
			const inner = text.slice(seg.sPos, seg.ePos).replace(/\s+$/, '');
			text = text.slice(0, seg.sPos) + `<${miss}>\n` + inner + `\n</${miss}>` + text.slice(seg.ePos);
			added += 2;
		}
		return { text, added };
	}

	// 判断某标签是否在文本中"恰好一对、完整闭合"
	function isFullPair(name, evs) {
		let open = 0, close = 0;
		for (const e of evs) {
			if (e.name === name) (e.isClose ? close++ : open++);
		}
		return open === 1 && close === 1;
	}
	function lastCloseEnd(name, evs) {
		let pos = -1;
		for (const e of evs) if (e.name === name && e.isClose) pos = e.pos + e.len;
		return pos;
	}
	function firstOpenPos(name, evs) {
		for (const e of evs) if (e.name === name && !e.isClose) return e.pos;
		return -1;
	}

	// 夹逼补全：前兄弟闭合、后兄弟闭合、中间恰好只缺这一个标签 → 包夹逼区间
	function wrapSandwich(text, miss, group) {
		const evs = scanEvents(text);
		const idx = group.indexOf(miss);
		if (idx < 0) return { text, added: 0 };

		// v1.4.1：修正首兄弟缺失补全的语义 —— 按用户期望，`<scene>` 等首兄弟缺失时，
		// 应「只把文本开头那段普通文字（场景描述/开场白）包进 miss 标签」，后面的兄弟标签保持同级不动。
		// 因此：文本开头是【普通文字】(非 < 开头) 才补（把这些文字包进 scene）；
		//       开头直接是标签则没有 scene 文字可包 → 不补（避免空/错误补全）。
		if (idx === 0) {
		    // 找第一个出现的兄弟标签作「截止点」：只包它之前的文字
		    const firstSibEvent = evs.find(e => group.includes(e.name) && !e.isClose);
		    const rightStart = firstSibEvent ? firstSibEvent.pos : text.length;
		    const leftEnd = text.search(/\S/); // 文本开头第一个非空白
		    if (leftEnd < 0 || rightStart < 0 || leftEnd > rightStart) return { text, added: 0 };
		    // ★ 关键守护：开头必须是【普通文字】（非标签）才补 —— 把这段文字包进 miss；
		    //   若开头就是标签，说明没有 scene 文字可包，直接不补
		    if (text[leftEnd] === '<') return { text, added: 0 };
		    const region = text.slice(leftEnd, rightStart);
		    const trimmed = region.replace(/^\s+|\s+$/g, '');
		    if (!trimmed) return { text, added: 0 }; // 空壳不包
		    // 这段文字区间内不能再夹任何树内标签（否则没法干净归属），跳过
		    const regionPresent = new Set(scanEvents(region).map(e => e.name));
		    if (regionPresent.size) return { text, added: 0 };
		    // 只包文字，后面的兄弟保持不动
		    text = text.slice(0, leftEnd) + `<${miss}>\n` + trimmed + `\n</${miss}>\n` + text.slice(rightStart);
		    return { text, added: 2 };
		}

		let li = -1, ri = -1;
		for (let i = idx - 1; i >= 0; i--) if (isFullPair(group[i], evs)) { li = i; break; }
		for (let i = idx + 1; i < group.length; i++) if (isFullPair(group[i], evs)) { ri = i; break; }
		if (li < 0 || ri < 0) return { text, added: 0 };

		// 左右之间的兄弟，除 miss 外若还有缺失 → 无法归属，跳过
		const present = new Set(evs.map(e => e.name));
		for (let i = li + 1; i < ri; i++) {
			if (i !== idx && !present.has(group[i])) return { text, added: 0 };
		}

		const leftEnd = lastCloseEnd(group[li], evs);
		const rightStart = firstOpenPos(group[ri], evs);
		if (leftEnd < 0 || rightStart < 0 || leftEnd > rightStart) return { text, added: 0 };

		const region = text.slice(leftEnd, rightStart);
		const trimmed = region.replace(/^\s+|\s+$/g, '');
		if (!trimmed) return { text, added: 0 }; // 空壳不包

		// 区间里若还夹着其它树内标签（非左右锚点）→ 可能吞并别的内容，跳过
		const regionPresent = new Set(scanEvents(region).map(e => e.name));
		for (const nm of regionPresent) {
			if (nm !== group[li] && nm !== group[ri]) return { text, added: 0 };
		}

		text = text.slice(0, leftEnd) + `\n<${miss}>\n` + trimmed + `\n</${miss}>\n` + text.slice(rightStart);
		return { text, added: 2 };
	}

	// ===== 主流程：处理所有缺失标签，从最深到最浅 =====
	let text = body;
	let added = 0;

	const initialEvents = scanEvents(text);
	const present = new Set(initialEvents.map(e => e.name));
	const missing = tags.filter(t => !present.has(t) && t in depthMap);
	missing.sort((a, b) => (depthMap[b] || 0) - (depthMap[a] || 0));

	for (const miss of missing) {
		const descSet = descendantsOf(miss);
		const group = siblingGroup(miss);
		const blockers = new Set(group.filter(n => n !== miss));
		const hasPresentDesc = scanEvents(text).some(e => descSet.has(e.name));

		let r;
		if (hasPresentDesc) {
			r = wrapAncestor(text, miss, descSet, blockers);
		} else {
			r = wrapSandwich(text, miss, group);
		}
		text = r.text;
		added += r.added;
	}

	return { text, added };
}

// ========== 栈式算法修复标签（同级互斥、补开补闭 + 残缺标签补全）==========

function fixTagsInText(text) {
	// 防御：非字符串输入(如 null/undefined/数字)直接原样返回，避免后续 wrapMissingTags 崩
	if (typeof text !== 'string' || text.length === 0) return { text, fixed: 0 };
	// 无任何 '<' 的纯文本楼：没有标签可修。必须在此返回——
	// 否则开启「补全整对丢失」时，wrapMissingTags 会把整段普通文字强包进 <scene>（真bug，自检抓出）
	if (!text.includes('<')) return { text, fixed: 0 };
	const { allTags: tags, siblings, children } = parseTagTree();
	if (!tags.length) return { text, fixed: 0 };

	const escaped = tags.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

	// ===== 预处理：残缺标签补全（如 </Ad → </Advance>）=====
	let body = text;
	let prepFix = 0;

	// 扫描所有 < 或 </ 后跟不完整标签名的情况
	const partialRe = /<(\/?)([a-zA-Z_][a-zA-Z0-9_.-]*)(?=[^a-zA-Z0-9_.->]|$)/g;
	const partialFixes = []; // [{ pos, oldLen, replacement }]
	let pm;
	while ((pm = partialRe.exec(body)) !== null) {
		const isClose = pm[1] === '/';
		const partialName = pm[2];
		const fullStr = pm[0]; // e.g., "</Adv" or "<Adva"

		// 检查后面是否跟着 >（如果是，则是完整标签，跳过）
		const after = body.slice(pm.index + fullStr.length);
		if (after.match(/^\s*>/)) continue;

		// 检查是否本身就是完整标签名（如 </Advance 后面可能有属性）
		const exactMatch = tags.some(t => t.toLowerCase() === partialName.toLowerCase());
		if (exactMatch) continue; // 名字完整，只是缺了 >，不算残缺

		// 前缀匹配已知标签
		const candidates = tags.filter(t => t.toLowerCase().startsWith(partialName.toLowerCase()));

		if (candidates.length === 1) {
			// 唯一匹配 → 补全
			const complete = isClose ? `</${candidates[0]}>` : `<${candidates[0]}>`;
			partialFixes.push({ pos: pm.index, oldLen: fullStr.length, replacement: complete });
		}
		// 多个匹配 → 不处理（歧义）
	}

	// 从后往前应用补全（保持位置偏移不变）
	partialFixes.sort((a, b) => b.pos - a.pos);
	for (const pf of partialFixes) {
		body = body.slice(0, pf.pos) + pf.replacement + body.slice(pf.pos + pf.oldLen);
		prepFix++;
	}
	// ===== 预处理结束 =====

	// 匹配所有完整标签
	const tagRe = new RegExp(`<\\/?(${escaped.join('|')})\\b[^>]*?(?<!\\/)>`, 'gi');

	const stack = [];         // [{ name }]
	const orphanCloses = [];   // [{ name, pos }] 孤立的闭合标签（需要补开标签）
	const fixPoints = [];      // [{ name, pos }] 需要补闭的位置
	const seenTags = [];       // [{ name, pos, isClose, len }] 所有已匹配的标签位置

	let m;
	while ((m = tagRe.exec(body)) !== null) {
		const full = m[0];
		const name = m[1];
		const pos = m.index;
		const isClose = full.startsWith('</');
		seenTags.push({ name, pos, isClose, len: full.length });

		if (isClose) {
			// 闭合标签：从栈中找匹配的开标签并弹出
			let found = -1;
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].name.toLowerCase() === name.toLowerCase()) { found = i; break; }
			}
			if (found >= 0) {
				// 弹出该标签及其以上的所有子标签（子标签没闭合 = AI 掉了）
				while (stack.length > found) {
					const popped = stack.pop();
					if (popped.name.toLowerCase() !== name.toLowerCase()) {
						fixPoints.push({ name: popped.name, pos });
					}
				}
			} else {
				orphanCloses.push({ name, pos });
			}
		} else {
			// 开标签：检查同级互斥
			if (siblings.has(name)) {
				for (let i = stack.length - 1; i >= 0; i--) {
					if (siblings.has(stack[i].name) && stack[i].name.toLowerCase() !== name.toLowerCase()) {
						// 从该同级位置到栈顶全部闭合（先子后父）
						while (stack.length > i) {
							const popped = stack.pop();
							fixPoints.push({ name: popped.name, pos });
						}
						break;
					}
				}
			}
			stack.push({ name });
		}
	}

	// ===== 应用补闭：同位置合并为一整块插入（保证内先外后）=====
	fixPoints.sort((a, b) => b.pos - a.pos);
	let fixed = prepFix;

	// 合并同位置的 fixPoints
	const grouped = [];
	for (let i = 0; i < fixPoints.length; i++) {
		if (i === 0 || fixPoints[i].pos !== fixPoints[i - 1].pos) {
			grouped.push({ pos: fixPoints[i].pos, names: [fixPoints[i].name] });
		} else {
			grouped[grouped.length - 1].names.push(fixPoints[i].name);
		}
	}

	// 补开标签（孤儿闭标签）
	const orphanFixPoints = []; // [{ pos, name }]
	const virtualPositions = {}; // { name: pos } 祖先的锚点传给子孙

	// 辅助：nameA 是否是 nameB 的父或祖先
	function isParentOrAncestor(a, b) {
		const kids = children[a];
		if (!kids) return false;
		if (kids.has(b)) return true;
		for (const k of kids) { if (isParentOrAncestor(k, b)) return true; }
		return false;
	}

	// 收集全量子孙
	function getDescendants(name) {
		const result = new Set();
		(function collect(n) {
			const kids = children[n];
			if (!kids) return;
			for (const k of kids) { result.add(k); collect(k); }
		})(name);
		return result;
	}

	// 是否任意层级的兄弟（共享同一父标签）
	function areSiblingsAnyLevel(a, b) {
		for (const kids of Object.values(children)) {
			if (kids.has(a) && kids.has(b)) return true;
		}
		return false;
	}

	// 子孙优先排序：子标签先确定位置，父标签汇总取最早锚点
	orphanCloses.sort((a, b) => {
		if (isParentOrAncestor(a.name, b.name)) return 1;   // a 是父 → a 后处理
		if (isParentOrAncestor(b.name, a.name)) return -1;  // b 是父 → b 后处理
		return 0;
	});

	for (const oc of orphanCloses) {
		const descendants = getDescendants(oc.name);

		// 策略 A：找最早出现的子孙开标签 + 子孙的虚拟锚点，取最小值
		const childHits = seenTags.filter(t => !t.isClose && descendants.has(t.name) && t.pos < oc.pos);
		let earliestPos = childHits.length > 0 ? Math.min(...childHits.map(t => t.pos)) : Infinity;

		// 子孙标签已经被处理过（子孙优先排序），用它们的虚拟锚点作为更早的上界
		for (const [cName, cPos] of Object.entries(virtualPositions)) {
			if (isParentOrAncestor(oc.name, cName) && cPos < earliestPos) {
				earliestPos = cPos;
			}
		}

		if (earliestPos < Infinity) {
			virtualPositions[oc.name] = earliestPos;
			orphanFixPoints.push({ pos: earliestPos, name: oc.name });
			continue;
		}

		// 策略 B：找父/同级开标签锚点
		// 父标签 → 插在它后面；同级标签 → 插在它前面
		let anchorPos = 0;
		for (let i = seenTags.length - 1; i >= 0; i--) {
			const st = seenTags[i];
			if (st.pos >= oc.pos || st.isClose) continue;
			if (isParentOrAncestor(st.name, oc.name)) {
				anchorPos = st.pos + st.len;  // 父标签：插在它开标签后面
				break;
			}
			if (areSiblingsAnyLevel(st.name, oc.name)) {
				anchorPos = st.pos;  // 同级标签：插在它前面
				break;
			}
		}

		// 策略 C：anchorPos 仍为 0 → 用祖先的虚拟锚点
		if (anchorPos === 0) {
			for (const [pName, pPos] of Object.entries(virtualPositions)) {
				if (isParentOrAncestor(pName, oc.name) && pPos > anchorPos) {
					anchorPos = pPos;
				}
			}
		}

		// 锚点钳制：开标签绝不能落在闭标签之后
		if (anchorPos === 0 || anchorPos > oc.pos) {
			anchorPos = 0;
			for (let j = seenTags.length - 1; j >= 0; j--) {
				if (seenTags[j].pos < oc.pos) {
					anchorPos = seenTags[j].pos + seenTags[j].len;
					break;
				}
			}
		}

		virtualPositions[oc.name] = anchorPos;
		orphanFixPoints.push({ pos: anchorPos, name: oc.name });
	}

	// 同位置合并：祖先在前（外先内后），拼成一块插入
	orphanFixPoints.sort((a, b) => {
		if (a.pos !== b.pos) return a.pos - b.pos;
		if (isParentOrAncestor(a.name, b.name)) return -1;
		if (isParentOrAncestor(b.name, a.name)) return 1;
		return 0;
	});
	const mergedOrphans = [];
	for (const o of orphanFixPoints) {
		const last = mergedOrphans[mergedOrphans.length - 1];
		if (last && last.pos === o.pos) { last.names.push(o.name); }
		else { mergedOrphans.push({ pos: o.pos, names: [o.name] }); }
	}

	// 从后往前一次性插入所有修复（闭标签 + 孤儿开标签）
	const allInserts = [...grouped.map(g => ({ pos: g.pos, text: g.names.map(n => `</${n}>\n`).join('') })),
		...mergedOrphans.map(o => ({ pos: o.pos, text: (o.pos > 0 ? '\n' : '') + o.names.map(n => `<${n}>\n`).join('') }))];
	allInserts.sort((a, b) => b.pos - a.pos);

	for (const ins of allInserts) {
		body = body.slice(0, ins.pos) + ins.text + body.slice(ins.pos);
	}
	fixed += grouped.reduce((s, g) => s + g.names.length, 0)
		+ mergedOrphans.reduce((s, o) => s + o.names.length, 0);

	// 尾部补闭合标签（栈中剩余）
	while (stack.length > 0) {
		body += `</${stack.pop().name}>\n`;
		fixed++;
	}

	// ===== 智能补全（谨慎勾选）：补回"连开带闭整个丢失"的标签块 =====
	// 只对"树里存在、但全文一次都没出现"的标签动手；结构正确的消息不受影响。
	if (settings.wrapMissingEnabled) {
		const wrapResult = wrapMissingTags(body, tags, siblings, children);
		body = wrapResult.text;
		fixed += wrapResult.added;
	}

	return { text: body, fixed };
}

// ========== 获取 ST 上下文 ==========

function getContext() {
	try {
		// 标准扩展：从 ST 主窗口获取
		if (window.SillyTavern?.getContext) return window.SillyTavern.getContext();
	} catch (_) {}
	try {
		// 回退：iframe 场景
		if (window.top?.SillyTavern?.getContext) return window.top.SillyTavern.getContext();
	} catch (_) {}
	return null;
}

// ========== 核心：修复最后一条 AI 消息 + 即时渲染 ==========

// 统一的"写入 + 渲染 + 记录撤销"入口。手动修复和自动修复都走这里。
// TavernHelper 是 Slash Runner 暴露到 window 的稳定 API；
// setChatMessages 同时负责数据更新 + 保存 + 触发渲染（含 Regex 美化）。
async function applyFixedMessage(ctx, messageId, text, recordUndo = true) {
	if (recordUndo) {
		// fixed 记录写入后的文本，供回退前校验消息是否已被再次改动（防覆盖新内容）
		undoSlot = { chatId: ctx.chatId ?? null, messageId, original: ctx.chat[messageId]?.mes ?? null, fixed: text };
		updateUndoBtn();
		// v1.13.3：眼睛+批量回退记录下沉到公共入口 —— 修复最后一条/每轮自动修复/修复全部 三条路径行为一致
		const iPrev = batchUndo.findIndex(r => r.messageId === messageId);
		if (iPrev >= 0) batchUndo.splice(iPrev, 1); // 重复修复同一楼只留最新记录（original 均为该楼当前原文）
		batchUndo.push({ chatId: ctx.chatId ?? null, messageId, original: ctx.chat[messageId]?.mes ?? null, fixed: text, applied: true });
	}

	let rendered = false;
	const TH = window.TavernHelper;

	if (TH?.setChatMessages) {
		try {
			await TH.setChatMessages([{ message_id: messageId, message: text }]);
			rendered = true;
		} catch (e) {
			console.warn('[TagAutoFixer] TavernHelper.setChatMessages 失败:', e);
		}
	}

	if (!rendered && TH?.refreshOneMessage) {
		// 回退：手动写数据 + 保存 + 单独触发渲染
		try {
			if (ctx.chat[messageId]) ctx.chat[messageId].mes = text;
			if (ctx.saveChat) await ctx.saveChat();
			await TH.refreshOneMessage(messageId);
			rendered = true;
		} catch (e) {
			console.warn('[TagAutoFixer] refreshOneMessage 失败:', e);
		}
	}

	if (!rendered) {
		// 最后回退：手动保存数据（可能无法即时刷新显示）
		if (ctx.chat[messageId]) ctx.chat[messageId].mes = text;
		if (ctx.saveChat) await ctx.saveChat();
	}

	if (recordUndo) {
		addEyeToMessage(messageId);
		updateUndoAllBtn();
	}
	return rendered;
}

// ========== 撤销：回退上一次修复 ==========

let undoSlot = null; // { chatId, messageId, original }（单槽，只记最近一次）

const undoBtnId = `${extensionName}_undo_btn`;      // 主页面右下角浮动按钮（修过之后才出现）
const undoPanelBtnId = `${extensionName}_undo_panel`; // 设置面板常驻按钮（有可回退内容才可点）
function updateUndoBtn() {
	$(`#${undoBtnId}`).remove();
	const ctx = getContext();
	// 用 chatId 隔离聊天：切到别的聊天就算作废
	let valid = false;
	if (undoSlot && ctx) {
		const sameChat = !undoSlot.chatId || !ctx.chatId || undoSlot.chatId === ctx.chatId;
		valid = sameChat && !!ctx.chat?.[undoSlot.messageId];
	}

	// 面板常驻按钮状态同步
	const $panelBtn = $(`#${undoPanelBtnId}`);
	if ($panelBtn.length) {
		$panelBtn.prop('disabled', !valid).css('opacity', valid ? 1 : 0.4);
	}

	// 主页面右下角浮动按钮：仅在有可回退项时显示
	if (!valid) return;
	$('body').append(`<div id="${undoBtnId}" title="回退上一次修复" style="
		position:fixed;bottom:130px;right:20px;z-index:9999;
		background:var(--golden-color, #e0a800);color:#fff;
		border-radius:16px;padding:6px 14px;font-size:13px;cursor:pointer;
		box-shadow:0 2px 8px rgba(0,0,0,0.35);user-select:none;opacity:0.95
	">↩️ 回退修复</div>`);
	$(`#${undoBtnId}`).on('click', async () => { await undoLastFix(); });
}

async function undoLastFix() {
	if (!undoSlot) { toastr?.info?.('没有可回退的修复'); return; }
	const ctx = getContext();
	if (!ctx) { toastr?.warning?.('无法获取聊天上下文'); return; }
	const slot = undoSlot;

	if (slot.chatId && ctx.chatId && slot.chatId !== ctx.chatId) {
		undoSlot = null; updateUndoBtn();
		toastr?.info?.('已切换聊天，上次修复无法回退');
		return;
	}
	if (!ctx.chat[slot.messageId]) {
		undoSlot = null; updateUndoBtn();
		toastr?.warning?.('消息不存在或已被删除');
		return;
	}
	// 防呆：消息已被重生成 / 滑动 / 手动编辑过 → 不再用旧文本覆盖
	if (slot.fixed !== undefined && ctx.chat[slot.messageId].mes !== slot.fixed) {
		undoSlot = null; updateUndoBtn();
		toastr?.info?.('该消息已被改动过，无法回退（自动作废）');
		return;
	}

	const rendered = await applyFixedMessage(ctx, slot.messageId, slot.original, false);
	undoSlot = null;
	updateUndoBtn();
	toastr?.success?.(rendered ? '✅ 已回退到修复前' : '✅ 已回退（可能需要切换聊天以刷新显示）');
}

// ========== 自动修复：每轮 AI 输出结束自动修 ==========
// 事件签名：MESSAGE_RECEIVED (message_id, type)，见 public/scripts/events.js。
// 触发时机：AI 消息完整落盘后（流式 script.js:3740 / 非流式 script.js:6632）。
// emit 会 await 本监听器，因此修复 + 重渲染先于 ST 自身渲染完成：无闪烁、无二次冲突。
// setChatMessages 只触发 MESSAGE_UPDATED、不会触发 MESSAGE_RECEIVED → 不会死循环。

// 每轮自动扫描（只标不改）：不写原文，挂眼睛看拟修复 diff；与自动修复互斥（修复优先）
function autoScanMessage(ctx, messageId, result) {
	const mes = ctx.chat[messageId];
	if (!mes || typeof mes.mes !== 'string') return 0;
	const r = result || fixTagsInText(mes.mes);
	if (r.fixed === 0) return 0;
	const idx = batchUndo.findIndex(x => x.messageId === messageId);
	if (idx >= 0) batchUndo.splice(idx, 1);
	batchUndo.push({ chatId: ctx.chatId ?? null, messageId, original: mes.mes, fixed: r.text, applied: false });
	addEyeToMessage(messageId);
	updateUndoAllBtn();
	toastr?.info?.(String(t('tagScanFound')).replace('{n}', r.fixed));
	console.log(`[TagAutoFixer] 扫描发现 ${r.fixed} 处标签问题（未修复） message ${messageId}`);
	return r.fixed;
}

function registerAutoFix() {
	eventSource.on(event_types.MESSAGE_RECEIVED, async (messageId) => {
		if (!settings.autoFixEnabled && !settings.autoScanEnabled) return;
		try {
			const ctx = getContext();
			if (!ctx?.chat?.length) return;
			if (!Number.isInteger(messageId) || messageId < 0 || messageId >= ctx.chat.length) return;
			const mes = ctx.chat[messageId];
			if (!mes || mes.is_user) return; // 不碰用户消息（含 impersonate 生成的用户消息）
			if (typeof mes.mes !== 'string' || !mes.mes.includes('<')) return; // 无标签快速跳过
			const result = fixTagsInText(mes.mes);
			if (result.fixed === 0) return;
			if (!settings.autoFixEnabled) { autoScanMessage(ctx, messageId, result); return; }
			const rendered = await applyFixedMessage(ctx, messageId, result.text);
			console.log(`[TagAutoFixer] 自动修复 ${result.fixed} 个标签 (message ${messageId})`);
			toastr?.success?.(rendered
				? `✅ 自动修复 ${result.fixed} 个标签`
				: `✅ 自动修复 ${result.fixed} 个标签（可能需要切换聊天以刷新显示）`);
		} catch (e) {
			console.error('[TagAutoFixer] 自动修复失败:', e);
		}
	});
}

async function fixLastMessage() {
	try {
		const ctx = getContext();
		if (!ctx?.chat?.length) { toastr?.warning?.('没有聊天消息'); return; }

		// 找最后一条 AI 消息
		let lastIdx = -1;
		for (let i = ctx.chat.length - 1; i >= 0; i--) {
			if (!ctx.chat[i].is_user) { lastIdx = i; break; }
		}
		if (lastIdx < 0) { toastr?.warning?.('未找到AI消息'); return; }

		const lastMsg = ctx.chat[lastIdx];
		const result = fixTagsInText(lastMsg.mes);

		if (result.fixed === 0) {
			toastr?.success?.('✅ 所有标签均已正确闭合');
			return;
		}

		console.log(`[TagAutoFixer] 修复了 ${result.fixed} 个标签`);
		const rendered = await applyFixedMessage(ctx, lastIdx, result.text);
		toastr?.success?.(rendered
			? `✅ 已修复 ${result.fixed} 个标签`
			: `✅ 已修复 ${result.fixed} 个标签（可能需要切换聊天以刷新显示）`);

	} catch (e) {
		console.error('[TagAutoFixer] 修复失败:', e);
		toastr?.error?.('修复失败，请查看控制台（F12 → Console）');
	}
}


// ========== 批量修复全部楼层 + 幻影 diff 预览（小眼睛） ==========
// 设计：修复全部 = 直接写入原文（不搞确认）；楼层内 👁 只读查看
// "改了哪里"（红 − = 修复前被改掉的行，绿 + = 修复后补入的行），
// 预览纯 DOM 幻影不碰数据，后悔用「回退这条 / 回退全部」。

const batchUndo = []; // [{chatId, messageId, original, fixed}]（内存态，刷新后失效）

function esc(s) {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 行级 LCS diff：返回 [{t:'-'|'+'|' ', s:行文本}]（楼层数百行内 DP 足够快）
function lineDiff(a, b) {
	const n = a.length, m = b.length;
	const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
		dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
	const out = []; let i = 0, j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) { out.push({ t: ' ', s: a[i] }); i++; j++; }
		else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', s: a[i] }); i++; }
		else { out.push({ t: '+', s: b[j] }); j++; }
	}
	while (i < n) out.push({ t: '-', s: a[i++] });
	while (j < m) out.push({ t: '+', s: b[j++] });
	return out;
}

// 渲染 diff HTML：collapse=false 全展开（显示所有行，默认，所有标签一目了然）；
// true 折叠长段未改动行（每侧留 2 行上下文），头部按钮切换
function buildDiffHtml(diffRows, collapseLabel, collapse = false) {
	const rowHtml = (r) => {
		if (r.t === '-') return `<div class="kimi-diff-chg" style="background:rgba(255,80,80,.13);border-radius:3px;padding:1px 6px;white-space:pre-wrap;word-break:break-word"><span style="color:#e57373;font-weight:700">\u2212 </span>${esc(r.s) || '&nbsp;'}</div>`;
		if (r.t === '+') return `<div class="kimi-diff-chg" style="background:rgba(80,220,120,.12);border-radius:3px;padding:1px 6px;white-space:pre-wrap;word-break:break-word"><span style="color:#7cd992;font-weight:700">+ </span>${esc(r.s) || '&nbsp;'}</div>`;
		return `<div style="opacity:.55;padding:1px 6px;white-space:pre-wrap;word-break:break-word">${esc(r.s) || '&nbsp;'}</div>`;
	};
	const out = [];
	let run = [];
	const flush = () => {
		if (!run.length) return;
		if (!collapse || run.length <= 6) { run.forEach(r => out.push(rowHtml(r))); }
		else {
			out.push(rowHtml(run[0])); out.push(rowHtml(run[1]));
			out.push(`<div style="opacity:.4;padding:1px 6px;font-size:.85em">\u22ef ${run.length - 4} ${collapseLabel}</div>`);
			out.push(rowHtml(run[run.length - 2])); out.push(rowHtml(run[run.length - 1]));
		}
		run = [];
	};
	for (const r of diffRows) {
		if (r.t === ' ') run.push(r); else { flush(); out.push(rowHtml(r)); }
	}
	flush();
	return out.join('');
}

// 楼层正文前挂 👁（已挂则跳过）
function addEyeToMessage(id) {
	// 挂在 .mes 容器（绝对定位右上角）：放 .mes_text 里会被折叠/预览的 innerHTML 重写抹掉
	const mesEl = document.querySelector(`.mes[mesid="${id}"]`);
	if (!mesEl || mesEl.querySelector('.kimi-tag-eye')) return;
	mesEl.style.position = 'relative';
	const eye = document.createElement('div');
	eye.className = 'kimi-tag-eye';
	eye.title = '查看标签修复改动';
	eye.style.cssText = 'position:absolute;top:6px;right:10px;z-index:5;cursor:pointer;opacity:.6;font-size:1em;user-select:none';
	eye.textContent = '👁';
	eye.addEventListener('click', (e) => { e.stopPropagation(); toggleTagDiff(id); });
	mesEl.appendChild(eye);
}

// 👁 开关幻影预览：开 = .mes_text 换 diff 视图（数据不动）；关 = messageFormatting 还原渲染
// （kimi 折叠 observer 会自动补折叠；index.js 侧已对 .kimi-tag-diff 跳过折叠/显示替换）
function toggleTagDiff(id) {
	const ctx = getContext();
	const msg = ctx?.chat?.[id];
	const el = document.querySelector(`.mes[mesid="${id}"] .mes_text`);
	if (!el || !msg) return;
	if (el.querySelector('.kimi-tag-diff')) {
		// 关闭预览：还原正常渲染
		el.innerHTML = messageFormatting(msg.mes, msg.name || '', msg.is_system, msg.is_user, id);
		return;
	}
	const rec = batchUndo.find(r => r.messageId === id);
	if (!rec) { el.querySelector('.kimi-tag-eye')?.remove(); return; }
	renderTagDiff(id, el, msg, rec, diffCollapsed.get(id) === true);
}

// diff 折叠状态（messageId -> 是否折叠未改动行；默认全展开，显示所有标签行更清晰）
const diffCollapsed = new Map();

function renderTagDiff(id, el, msg, rec, collapsed) {
	// 对比基准：已修复记录比 原文vs当前(已修好)；仅扫描记录比 原文vs拟修复文本（原文还没动）
	const after = rec.applied === false ? rec.fixed : msg.mes;
	const diffRows = lineDiff(String(rec.original).split('\n'), String(after).split('\n'));
	el.innerHTML = `
	<div class="kimi-tag-diff" style="border:1px dashed var(--SmartThemeBorderColor,grey);border-radius:8px;padding:8px 10px;font-size:.85em;line-height:1.6">
		<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
			<b>${t('tagDiffTitle')}</b>
			<span style="opacity:.6;font-size:.85em">${t('tagDiffHint')}</span>
			<button class="kimi-tag-diff-collapse menu_button" style="display:inline-block;width:auto;padding:2px 10px;font-size:.9em">${collapsed ? t('tagExpandAll') : t('tagCollapse')}</button>
			<span style="display:inline-flex;gap:4px;align-items:center">
				<button class="kimi-tag-diff-prev menu_button" style="display:inline-block;width:auto;padding:2px 8px;font-size:.9em">↑${t('tagPrevChange')}</button>
				<span class="kimi-diff-count" style="opacity:.7;font-size:.85em"></span>
				<button class="kimi-tag-diff-next menu_button" style="display:inline-block;width:auto;padding:2px 8px;font-size:.9em">↓${t('tagNextChange')}</button>
			</span>
			<button class="kimi-tag-diff-close menu_button" style="display:inline-block;width:auto;padding:2px 10px;font-size:.9em">✕</button>
			${rec.applied === false
				? `<span class="kimi-tag-scanonly" style="margin-left:auto;opacity:.75;font-size:.85em">${t('tagScanOnly')}</span>`
				: `<button class="kimi-tag-undo-one menu_button" style="margin-left:auto;display:inline-block;width:auto;padding:2px 10px;font-size:.9em">${t('tagUndoThis')}</button>`}
		</div>
		${buildDiffHtml(diffRows, t('tagUnchanged'), collapsed)}
	</div>`;
	el.querySelector('.kimi-tag-undo-one')?.addEventListener('click', async () => { await undoFloorFix(id); });
	el.querySelector('.kimi-tag-diff-close')?.addEventListener('click', () => { diffCollapsed.delete(id); toggleTagDiff(id); });
	el.querySelector('.kimi-tag-diff-collapse')?.addEventListener('click', () => {
		diffCollapsed.set(id, !collapsed);
		renderTagDiff(id, el, msg, rec, !collapsed);
	});
	// 上一处/下一处改动跳转：红/绿行循环定位 + 高亮闪一下 + 计数
	const chgEls = [...el.querySelectorAll('.kimi-diff-chg')];
	const countEl = el.querySelector('.kimi-diff-count');
	let navIdx = -1;
	const showCount = () => { if (countEl) countEl.textContent = chgEls.length ? `${navIdx + 1}/${chgEls.length}` : '0'; };
	showCount();
	const go = (delta) => {
		if (!chgEls.length) return;
		navIdx = (navIdx + delta + chgEls.length) % chgEls.length;
		const target = chgEls[navIdx];
		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		target.style.outline = '2px solid var(--golden-color,#e0a800)';
		target.style.outlineOffset = '1px';
		setTimeout(() => { target.style.outline = ''; }, 900);
		showCount();
	};
	el.querySelector('.kimi-tag-diff-prev')?.addEventListener('click', () => go(-1));
	el.querySelector('.kimi-tag-diff-next')?.addEventListener('click', () => go(1));
}

// 回退单条：恢复修复前原文（消息若已被再次改动则作废该记录）
async function undoFloorFix(id) {
	const ctx = getContext();
	if (!ctx) return;
	const idx = batchUndo.findIndex(r => r.messageId === id);
	if (idx < 0) { toastr?.info?.('\u6ca1\u6709\u53ef\u56de\u9000\u7684\u4fee\u590d'); return; }
	const rec = batchUndo[idx];
	if (!rec.applied) { // 仅扫描记录：本来就没写入，摘掉眼睛清掉记录即可
		batchUndo.splice(idx, 1);
		document.querySelector(`.mes[mesid="${id}"] > .kimi-tag-eye`)?.remove();
		updateUndoAllBtn();
		toastr?.info?.('已清除该楼的扫描标记（原文未被修改过）');
		return;
	}
	const msg = ctx.chat?.[id];
	if (!msg) { batchUndo.splice(idx, 1); updateUndoAllBtn(); return; }
	if (msg.mes !== rec.fixed) {
		batchUndo.splice(idx, 1); updateUndoAllBtn();
		toastr?.info?.('\u8be5\u6d88\u606f\u5df2\u88ab\u6539\u52a8\u8fc7\uff0c\u65e0\u6cd5\u56de\u9000\uff08\u81ea\u52a8\u4f5c\u5e9f\uff09');
		return;
	}
	await applyFixedMessage(ctx, id, rec.original, false);
	batchUndo.splice(idx, 1);
	updateUndoAllBtn();
	toastr?.success?.('\u2705 \u5df2\u56de\u9000\u8be5\u697c\u5c42\u5230\u4fee\u590d\u524d');
}

// 修复全部楼层：直接写入原文；有改动的楼层挂 \ud83d\udc41；记录可回退快照
async function fixAllMessages() {
	const ctx = getContext();
	if (!ctx?.chat?.length) { toastr?.warning?.('\u6ca1\u6709\u804a\u5929\u6d88\u606f'); return; }
	let fixedFloors = 0, fixedTags = 0;
	for (let i = 0; i < ctx.chat.length; i++) {
		const mes = ctx.chat[i];
		if (!mes || mes.is_user) continue;
		if (typeof mes.mes !== 'string' || !mes.mes.includes('<')) continue;
		const result = fixTagsInText(mes.mes);
		if (result.fixed === 0) continue;
		await applyFixedMessage(ctx, i, result.text); // recordUndo=true：统一记录 batchUndo + 挂眼睛
		fixedFloors++; fixedTags += result.fixed;
	}
	updateUndoAllBtn();
	if (fixedFloors === 0) toastr?.success?.('\u2705 \u5168\u90e8\u697c\u5c42\u6807\u7b7e\u5747\u6b63\u786e\uff0c\u65e0\u9700\u4fee\u590d');
	else toastr?.success?.(`\u2705 \u5df2\u4fee\u590d ${fixedFloors} \u4e2a\u697c\u5c42\uff08\u5171 ${fixedTags} \u5904\u6807\u7b7e\uff09\u3002\u70b9\u697c\u5c42\u5185 \ud83d\udc41 \u67e5\u770b\u6539\u52a8\uff0c\u53ef\u5355\u6761/\u5168\u90e8\u56de\u9000`);
}

// 回退全部：逐条恢复（跳过已被再次改动的）
async function undoAllFixes() {
	const ctx = getContext();
	if (!ctx) return;
	if (!batchUndo.length) { toastr?.info?.('\u6ca1\u6709\u53ef\u56de\u9000\u7684\u4fee\u590d'); return; }
	let n = 0, skip = 0;
	for (const rec of [...batchUndo]) {
		if (!rec.applied) { // 仅扫描记录：只清眼睛，无原文可回退
			document.querySelector(`.mes[mesid="${rec.messageId}"] > .kimi-tag-eye`)?.remove();
			batchUndo.splice(batchUndo.indexOf(rec), 1);
			continue;
		}
		const msg = ctx.chat?.[rec.messageId];
		if (!msg || msg.mes !== rec.fixed) { skip++; batchUndo.splice(batchUndo.indexOf(rec), 1); continue; }
		await applyFixedMessage(ctx, rec.messageId, rec.original, false);
		batchUndo.splice(batchUndo.indexOf(rec), 1);
		n++;
	}
	document.querySelectorAll('.kimi-tag-eye').forEach(e => e.remove());
	updateUndoAllBtn();
	toastr?.success?.(`\u2705 \u5df2\u56de\u9000 ${n} \u4e2a\u697c\u5c42${skip ? `\uff08${skip} \u6761\u5df2\u88ab\u6539\u52a8\u81ea\u52a8\u8df3\u8fc7\uff09` : ''}`);
}

// CDP/控制台调试出口（仿 st-chat-sync 的 __stChatSyncDebug 模式）
window.__stTagDebug = { fixAllMessages, undoAllFixes, undoFloorFix, toggleTagDiff, addEyeToMessage, lineDiff, buildDiffHtml, fixTagsInText, autoScanMessage, batchUndo, wrapMissingTags, parseTagTree, settings: () => settings };

function updateUndoAllBtn() {
	const btn = document.getElementById(`${extensionName}_undo_all`);
	if (btn) { btn.disabled = !batchUndo.length; btn.style.opacity = batchUndo.length ? 1 : 0.4; }
}

// ========== 初始化 ==========

jQuery(async () => {
	const ctx = getContext();

	// 注册斜杠命令 /fix-tags
	if (ctx?.SlashCommandParser) {
		try {
			ctx.SlashCommandParser.addCommand('fix-tags', fixLastMessage,
				['fix-tags', '修复标签'],
				'自动修复AI输出中缺失的标签闭合', true, true);
		} catch (e) {
			console.warn('[TagAutoFixer] 斜杠命令注册失败（可能非 JS-Slash-Runner 环境）:', e);
		}
	}

	// 内联按钮：发送按钮旁的小图标
	const inlineBtnId = `${extensionName}_send_btn`;
	function updateInlineBtn() {
		$(`#${inlineBtnId}`).remove();
		if (!settings.showInlineBtn) return;
		const btnHtml = `<div id="${inlineBtnId}" class="fa-solid fa-tag interactable" title="修复标签" style="cursor:pointer;padding:0 3px;font-size:0.7em;opacity:0.5;margin-right:1px"></div>`;
		const left = $('#leftSendForm'), right = $('#rightSendForm');
		const target = left.length ? left : (right.length ? right : null);
		if (target) {
			target.prepend(btnHtml);
			$(`#${inlineBtnId}`).on('click', async () => { await fixLastMessage(); });
		}
	}
	updateInlineBtn();

	// 悬浮按钮（可拖拽）
	const floatBtnId = `${extensionName}_float_btn`;
	function updateFloatingBtn() {
		$(`#${floatBtnId}`).remove();
		if (!settings.showFloatingBtn) return;
		$('body').append(`<div id="${floatBtnId}" title="修复标签（可拖拽）" style="
			position:fixed;bottom:80px;right:20px;z-index:9999;
			width:36px;height:36px;border-radius:50%;background:var(--accent-color, #888);
			color:#fff;display:flex;align-items:center;justify-content:center;
			cursor:grab;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;
			opacity:0.7;user-select:none;
		">🏷️</div>`);

		const $btn = $(`#${floatBtnId}`);
		let dragging = false, dx = 0, dy = 0, startX, startY;

		$btn.on('mousedown touchstart', function(e) {
			dragging = false;
			const ev = e.touches ? e.touches[0] : e;
			startX = ev.clientX;
			startY = ev.clientY;
			const pos = $btn.position();
			dx = startX - pos.left;
			dy = startY - pos.top;
			$btn.css({ cursor: 'grabbing', opacity: '1', transition: 'none' });
		});

		$(document).on('mousemove touchmove', function(e) {
			if (!$btn[0] || dx === undefined) return;
			const ev = e.touches ? e.touches[0] : e;
			if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) {
				dragging = true;
			}
			if (dragging) {
				e.preventDefault();
				$btn.css({ left: (ev.clientX - dx) + 'px', top: (ev.clientY - dy) + 'px', right: 'auto', bottom: 'auto' });
			}
		});

		$(document).on('mouseup touchend', function() {
			if ($btn[0]) {
				$btn.css({ cursor: 'grab', opacity: '0.7', transition: 'opacity 0.2s' });
			}
			dx = undefined;
		});

		$btn.on('click', async function() {
			if (!dragging) await fixLastMessage();
		});
	}
	updateFloatingBtn();

	// 扩展菜单项（#extensionsMenu 内）
	const menuItemId = `${extensionName}_menu_item`;
	function updateMenuItem() {
		$(`#${menuItemId}`).remove();
		if (!settings.showMenuBtn) return;
		const $menu = $('#extensionsMenu');
		if (!$menu.length) return;
		$menu.append(`<a id="${menuItemId}" class="list-group-item" href="#" title="修复标签">
			<i class="fa-solid fa-tag"></i> 修复标签
		</a>`);
		$(`#${menuItemId}`).on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			$('#extensionsMenu').fadeOut(200);
			await fixLastMessage();
		});
	}
	// 延迟注入等菜单就绪
	setTimeout(updateMenuItem, 1000);

	// 注入设置面板
	
	// 挂载标签修复设置卡(跟随余温面板重建)
	stTagMountSettings();

	// 事件绑定抽成函数：设置卡会随余温面板重渲染而重挂（如语言切换），
	// 旧元素销毁后监听随之丢失 → stTagMountSettings 每次挂载后重新调用本函数补绑定。
	function stTagBindEvents() {
	// 监听标签树编辑
	$(`#${extensionName}_tree`).on('input', function() {
		settings.tagTree = $(this).val();
		saveSettingsDebounced();
	});

	// 小剧场/HTML 容器：展开/收起 + 容器编辑 + 自动识别开关
	$(`#${extensionName}_container`).on('input', function() {
		settings.htmlContainer = $(this).val();
		saveSettingsDebounced();
	});
	$(`#${extensionName}_chk_detect`).on('change', function() {
		settings.askOnDisputed = this.checked;
		saveSettingsDebounced();
	});

	// 绑定按钮
	$(`#${extensionName}_scan_replace`).on('click', () => scanAndFill(true));
	$(`#${extensionName}_scan_append`).on('click', () => scanAndFill(false));
	$(`#${extensionName}_btn`).on('click', async () => { await fixLastMessage(); });
	$(`#${extensionName}_reset`).on('click', () => {
		settings.tagTree = defaultTagTree;
		$(`#${extensionName}_tree`).val(defaultTagTree);
		saveSettingsDebounced();
		toastr?.success?.('✅ 已重置为默认标签树');
	});

	// UI 模式切换
	$(`#${extensionName}_chk_inline`).on('change', function() {
		settings.showInlineBtn = this.checked;
		saveSettingsDebounced();
		updateInlineBtn();
	});
	$(`#${extensionName}_chk_float`).on('change', function() {
		settings.showFloatingBtn = this.checked;
		saveSettingsDebounced();
		updateFloatingBtn();
	});
	$(`#${extensionName}_chk_menu`).on('change', function() {
		settings.showMenuBtn = this.checked;
		saveSettingsDebounced();
		updateMenuItem();
	});

	// 新功能勾选框
	$(`#${extensionName}_chk_auto`).on('change', function() {
		settings.autoFixEnabled = this.checked;
		$(`#${extensionName}_warn_auto`).toggle(this.checked);
		if (this.checked && settings.autoScanEnabled) { // 与自动扫描互斥：修复包含扫描
			settings.autoScanEnabled = false;
			$(`#${extensionName}_chk_scan`).prop('checked', false);
		}
		saveSettingsDebounced();
	});
	$(`#${extensionName}_chk_scan`).on('change', function() {
		settings.autoScanEnabled = this.checked;
		if (this.checked && settings.autoFixEnabled) { // 与自动修复互斥
			settings.autoFixEnabled = false;
			$(`#${extensionName}_chk_auto`).prop('checked', false);
			$(`#${extensionName}_warn_auto`).hide();
		}
		saveSettingsDebounced();
	});
	$(`#${extensionName}_chk_wrap`).on('change', function() {
		settings.wrapMissingEnabled = this.checked;
		$(`#${extensionName}_warn_wrap`).toggle(this.checked);
		saveSettingsDebounced();
	});
	// 若之前已勾选，初始就展开对应说明
	if (settings.autoFixEnabled) $(`#${extensionName}_warn_auto`).show();
	if (settings.wrapMissingEnabled) $(`#${extensionName}_warn_wrap`).show();

	// 常驻"回退上一次修复"按钮
	$(`#${extensionName}_undo_panel`).on('click', async () => { await undoLastFix(); });
	// 批量修复全部楼层 + 幻影 diff 预览
	$(`#${extensionName}_fixall`).on('click', async () => { await fixAllMessages(); });
	$(`#${extensionName}_undo_all`).on('click', async () => { await undoAllFixes(); });
	updateUndoAllBtn();
	// 重挂后按当前 undoSlot 恢复面板按钮可用态（新挂的按钮默认 disabled）
	updateUndoBtn();
	}
	stTagBindEvents();
	// 暴露给外层 stTagMountSettings：重挂设置卡后重新绑定（外层拿不到 IIFE 内函数）
	window.stTagBindEvents = stTagBindEvents;

	// 自动修复监听（每轮 AI 输出结束自动修）
	registerAutoFix();
	// 切换聊天时，隐藏上一个聊天的"回退修复"按钮；批量修复回退记录跨聊天作废
	eventSource.on(event_types.CHAT_CHANGED, () => { updateUndoBtn(); batchUndo.length = 0; updateUndoAllBtn(); });
});

})();// 挂载「标签修复」设置卡到余温设置面板的 tag_slot（跟随余温 initSettingsPanel 重建，幂等）
export function stTagMountSettings() {
    try {
        const s = extension_settings['tag_auto_fixer'] || {};
        const ext = 'tag_auto_fixer';
        const h = `
<details class="kimi-card">
<summary><i class="fa-solid fa-tag kimi-card-ico" aria-hidden="true"></i>${t('tagTitle')}</summary>
<div class="kimi-card-body">
<p class="kimi-hint" style="margin-bottom:6px">${t('tagHint')}</p>

<label class="kimi-label" for="${ext}_tree">${t('tagTreeLabel')}</label>
<textarea id="${ext}_tree" class="text_pole" style="width:100%;height:200px;font-family:monospace">${s.tagTree}</textarea>

<div class="kimi-sep"></div>

<details class="kimi-inner-card">
<summary style="cursor:pointer;font-size:0.88em;color:var(--SmartThemeBodyColor, inherit)">${t('tagContainerTitle')}</summary>
<div id="${ext}_html_box" style="margin-top:6px">
<p class="kimi-hint">${t('tagContainerHint1')}</p>
<textarea id="${ext}_container" class="text_pole" style="width:100%;height:40px;font-family:monospace">${s.htmlContainer}</textarea>
<label class="checkbox_label" style="margin-top:6px"><input type="checkbox" id="${ext}_chk_detect" ${s.askOnDisputed ? 'checked' : ''}> ${t('tagAskOnDisputed')}</label>
</div>
</details>

<div style="display:flex;gap:6px;margin-top:8px">
<button id="${ext}_scan_replace" class="kimi-btn" style="flex:1">${t('tagScanReplace')}</button>
<button id="${ext}_scan_append" class="kimi-btn" style="flex:1">${t('tagScanAppend')}</button>
</div>
<div style="display:flex;gap:6px;margin-top:6px">
<button id="${ext}_btn" class="kimi-btn" style="flex:1">${t('tagFixLast')}</button>
<button id="${ext}_undo_panel" class="kimi-btn" style="flex:1" disabled>${t('tagUndo')}</button>
</div>
<div style="display:flex;gap:6px;margin-top:6px">
<button id="${ext}_fixall" class="kimi-btn" style="flex:1">${t('tagFixAll')}</button>
<button id="${ext}_undo_all" class="kimi-btn" style="flex:1" disabled>${t('tagUndoAll')}</button>
</div>
<button id="${ext}_reset" class="kimi-btn" style="width:100%;margin-top:6px">${t('tagReset')}</button>

<div class="kimi-sep"></div>

<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
<label class="checkbox_label"><input type="checkbox" id="${ext}_chk_auto" ${s.autoFixEnabled ? 'checked' : ''}> ${t('tagAutoFix')}</label>
<label class="checkbox_label"><input type="checkbox" id="${ext}_chk_scan" ${s.autoScanEnabled ? 'checked' : ''}> ${t('tagAutoScan')}</label>
<label class="checkbox_label"><input type="checkbox" id="${ext}_chk_wrap" ${s.wrapMissingEnabled ? 'checked' : ''}> ${t('tagWrapMissing')}</label>
</div>
<div id="${ext}_warn_auto" style="display:none;margin-top:5px;font-size:0.72em;color:var(--golden-color,#e0a800);line-height:1.5">${t('tagWarnAuto')}</div>
<div id="${ext}_warn_wrap" style="display:none;margin-top:5px;font-size:0.72em;color:var(--golden-color,#e0a800);line-height:1.5">${t('tagWarnWrap')}</div>

<div class="kimi-sep"></div>

<label class="kimi-label">${t('tagEntryTitle')}</label>
<div style="display:flex;gap:12px;align-items:center">
<label class="checkbox_label"><input type="checkbox" id="${ext}_chk_inline" ${s.showInlineBtn ? 'checked' : ''}> ${t('tagChkInline')}</label>
<label class="checkbox_label"><input type="checkbox" id="${ext}_chk_float" ${s.showFloatingBtn ? 'checked' : ''}> ${t('tagChkFloat')}</label>
<label class="checkbox_label"><input type="checkbox" id="${ext}_chk_menu" ${s.showMenuBtn ? 'checked' : ''}> ${t('tagChkMenu')}</label>
</div>

<p class="kimi-hint">${t('tagSlashHint')}</p>

</div>
</details>
`;
        // 幂等：先移除旧标签修复卡，再挂新的
        jQuery('#kimi_reasoning_injector_tag_slot').children().remove();
        jQuery('#kimi_reasoning_injector_tag_slot').replaceWith(h);
        // 重挂后补事件绑定 + 撤销按钮状态（IIFE 只在首载绑一次，重挂的新元素没监听）
        if (typeof window.stTagBindEvents === 'function') window.stTagBindEvents();
    } catch (e) { console.warn('[TagAutoFixer] 挂载设置卡失败:', e); }
}


