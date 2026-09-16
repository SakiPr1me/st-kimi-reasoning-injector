// 余温工具箱 · 自动重roll 守卫（v1.37.52）
// 纯逻辑、无 ST 依赖 → 可独立单测。
// 语义：截断后进入「待新分支」状态；
//   ① 只要确认「已进入新分支」（收到新的真实生成开始）→ confirm，之后一直等（服务器慢也无需干预）；
//   ② 只有当「连新分支都没进去」（期限内没有任何新生成开始）→ 才允许兜底触发一次 swipe；
//   ③ 换了聊天 / 已确认 → 立即作废，绝不误伤。
export function createRerollGuard() {
    let st = null; // { msgId, chatKey, deadline, done }
    return {
        arm(msgId, chatKey, now, ms) {
            st = { msgId: msgId, chatKey: String(chatKey || ''), deadline: now + (ms || 2500), done: false };
        },
        confirmBranch() { if (st) st.done = true; },
        shouldFallback(now, chatKey) {
            if (!st || st.done) return -1;
            if (String(chatKey || '') !== st.chatKey) { st = null; return -1; }
            if (now < st.deadline) return -1;
            const id = st.msgId;
            st = null;
            return id;
        },
        isPending() { return !!(st && !st.done); },
        clear() { st = null; }
    };
}
