/* 标准字数模块只换两句；自定义写法仅在用户编辑时按授权重建整条字数条目。 */
export const PRESET_LENGTH_VERSION = '1.0.1';
const SENTENCE = /- 字数要求:正文的字数控制在(\d+)(?:字以上。|~(\d+)字以内。)/g;
const PREFIX = /- 字数要求:正文的字数控制在/g;

function positive(value) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('字数必须是正整数');
    return value;
}

function validRule(rule) {
    if (!rule || !['min', 'range'].includes(rule.mode)) throw new Error('请选择以上或以内');
    const min = positive(rule.min);
    if (rule.mode === 'min') return { mode: 'min', min, max: null };
    const max = positive(rule.max);
    if (min > max) throw new Error('下限不能大于上限');
    return { mode: 'range', min, max };
}

function inspect(content) {
    const text = String(content);
    const matches = [...text.matchAll(SENTENCE)];
    if (matches.length !== 2 || [...text.matchAll(PREFIX)].length !== 2) {
        throw new Error('需要两处完整且一致的字数要求');
    }
    const rules = matches.map(m => validRule({ mode: m[2] === undefined ? 'min' : 'range', min: Number(m[1]), max: m[2] === undefined ? null : Number(m[2]) }));
    if (JSON.stringify(rules[0]) !== JSON.stringify(rules[1])) throw new Error('两处字数要求不一致');
    const tags = [...text.matchAll(/<length_rule>([\s\S]*?)<\/length_rule>/g)];
    const macros = [...text.matchAll(/\{\{setvar::length_rule_cot::([\s\S]*?)\}\}/g)];
    if (tags.length !== 1 || macros.length !== 1
        || (text.match(/<length_rule>/g) || []).length !== 1
        || (text.match(/<\/length_rule>/g) || []).length !== 1
        || (text.match(/\{\{setvar::length_rule_cot::/g) || []).length !== 1) {
        throw new Error('字数模块结构不完整或重复');
    }
    const belongs = (m, block) => m.index >= block.index && m.index + m[0].length <= block.index + block[0].length;
    if (matches.filter(m => belongs(m, tags[0])).length !== 1
        || matches.filter(m => belongs(m, macros[0])).length !== 1
        || tags[0].index + tags[0][0].length > macros[0].index) {
        throw new Error('两处字数要求必须分别位于正文模块和思考变量中');
    }
    return { text, rule: rules[0] };
}

export function readLengthRule(content) {
    return inspect(content).rule;
}

export function readEditableLengthRule(content) {
    try { return readLengthRule(content); } catch (e) { /* 自写内容在编辑前不覆盖。 */ }
    const text = String(content);
    const range = text.match(/(\d+)\s*[~～\-–至到]\s*(\d+)\s*字/);
    if (range) {
        try { return validRule({ mode: 'range', min: Number(range[1]), max: Number(range[2]) }); } catch (e) { /* 继续找单值 */ }
    }
    const single = text.match(/(\d+)\s*字/);
    if (single) {
        try { return validRule({ mode: 'min', min: Number(single[1]) }); } catch (e) { /* 无有效数值用建议值 */ }
    }
    return { mode: 'min', min: 1500, max: null };
}

export function replaceLengthRule(content, next) {
    const after = validRule(next);
    try {
        const result = applyLengthRule(content, after);
        return { ...result, replacedWholeEntry: false };
    } catch (e) { /* 自定义条目允许整条重建，范围只限已绑定的字数 prompt。 */ }
    const sentence = after.mode === 'min'
        ? `- 字数要求:正文的字数控制在${after.min}字以上。`
        : `- 字数要求:正文的字数控制在${after.min}~${after.max}字以内。`;
    const eol = String(content).includes('\r\n') ? '\r\n' : '\n';
    const out = ['<length_rule>', sentence, '</length_rule>', '{{setvar::length_rule_cot::', sentence + '}}'].join(eol);
    readLengthRule(out);
    return { content: out, before: readEditableLengthRule(content), after, replacements: 2, replacedWholeEntry: true };
}

export function applyLengthRule(content, next) {
    const { text, rule: before } = inspect(content);
    const after = validRule(next);
    const sentence = after.mode === 'min'
        ? `- 字数要求:正文的字数控制在${after.min}字以上。`
        : `- 字数要求:正文的字数控制在${after.min}~${after.max}字以内。`;
    let replacements = 0;
    const out = text.replace(SENTENCE, () => { replacements++; return sentence; });
    const verified = readLengthRule(out);
    if (replacements !== 2 || JSON.stringify(verified) !== JSON.stringify(after)
        || text.replace(SENTENCE, '{LENGTH}') !== out.replace(SENTENCE, '{LENGTH}')) {
        throw new Error('字数校验失败，未修改');
    }
    return { content: out, before, after, replacements };
}
