// 方案切换编排内核（纯逻辑，不 import 酒馆模块；index.js 注入副作用）。
// 目标：
//  - preset → profile → toggles → API fallback → 显式 ttProxy(url/key/model) 最终覆盖；
//  - profile 必须等到宿主真正应用完成（CONNECTION_PROFILE_LOADED）才继续；等不到就整次中止、
//    不写后续、不标记 active —— 防止后台 profile 晚到反把显式反代/模型盖掉；
//  - 同一时刻只跑一个切换（串行队列 + latest-wins），快速连点 A/B 时 B 排到 A 完成后执行，
//    不允许 A 的后台任务越过后来的 B。
export const VERSION = '1.0.0';

const asString = (v) => (v === undefined || v === null ? '' : String(v));

export function createSchemeSwitcher(hooks = {}) {
    const t = typeof hooks.t === 'function' ? hooks.t : (key) => String(key);
    const notice = typeof hooks.notice === 'function' ? hooks.notice : () => { };
    const bindProfile = () => t('schemeBindProfile');
    const bindPreset = () => t('schemeBindPreset');
    const bindToggles = () => t('schemeBindToggles');

    let running = false;
    let pending = null;
    let runToken = 0;
    /* profile 等不到完成事件时，后台可能还在应用；在迟到事件回来之前禁止新切换（明确 busy 拒），
       否则新方案会先写、旧 profile 晚到再把它盖掉。 */
    let blockedProfile = null;

    function captureLeavingScheme(target) {
        try {
            const activeId = hooks.getActiveSchemeId ? asString(hooks.getActiveSchemeId()) : '';
            const active = activeId && hooks.schemeById ? hooks.schemeById(activeId) : null;
            const claimed = hooks.getLiveClaimedBy ? asString(hooks.getLiveClaimedBy()) : '';
            if (active && asString(active.id) !== asString(target.id)
                && active.presetName && active.presetName === hooks.getCurrentPresetName()
                && (!claimed || claimed === asString(active.id))) {
                const current = hooks.readPromptToggles ? hooks.readPromptToggles() : null;
                if (current && typeof current === 'object') active.toggles = current;
            }
            if (hooks.setLiveClaimedBy) hooks.setLiveClaimedBy(null);
        } catch (e) { /* 抓快照失败绝不能挡住切换 */ }
    }

    async function runSwitch(scheme, token) {
        const steps = [];
        let profileMissing = false;

        captureLeavingScheme(scheme);

        // ① 预设
        if (scheme.presetName) {
            const current = hooks.getCurrentPresetName ? hooks.getCurrentPresetName() : null;
            if (current === scheme.presetName) {
                steps.push(bindPreset() + ' ✓');
            } else {
                let result = false;
                try { result = await hooks.selectPreset(scheme.presetName); } catch (e) { result = false; }
                if (token !== runToken) return false;
                if (result === 'missing') {
                    notice(String(t('schemePresetMissing')).replace('{n}', scheme.presetName));
                    steps.push(bindPreset() + ' ✗');
                } else {
                    steps.push(bindPreset() + (result === true ? ' ✓' : ' ✗'));
                }
            }
        }

        // ② 连接配置：必须确认宿主把它应用完；超时/失败 = 整次中止，不写后续
        if (scheme.profileName) {
            let result = null;
            try { result = await hooks.applyProfile(scheme.profileName); } catch (e) { result = null; }
            if (token !== runToken) return false;
            if (result && result.needExtension) {
                notice(t('schemeNeedConnExt'));
                return false;
            }
            if (result && result.missing) {
                notice(String(t('schemeProfileMissing')).replace('{n}', scheme.profileName));
                profileMissing = true;
                steps.push(bindProfile() + ' ✗');
                const hasFallback = !!scheme.api
                    || !!(scheme.ttProxy && (scheme.ttProxy.url || scheme.ttProxy.key || scheme.ttProxy.model));
                if (!hasFallback) return false;
            } else if (!result || result.ok !== true) {
                // 派发失败 / 宿主没接住：不假装成功，也不继续写后面的东西
                notice(t('schemeSwitchIncomplete'));
                return false;
            } else if (result.completed !== true) {
                // 有界等待到点仍未收到 CONNECTION_PROFILE_LOADED：后台可能还在跑，
                // 此时写显式反代/模型只会被它晚到覆盖 ⇒ 整次中止；在迟到事件回来前禁止新切换。
                if (result.late && typeof result.late.then === 'function') {
                    const blockedName = String(scheme.profileName);
                    blockedProfile = { name: blockedName, late: result.late };
                    result.late.then(() => {
                        if (blockedProfile && blockedProfile.name === blockedName) blockedProfile = null;
                    });
                }
                notice(t('schemeSwitchIncomplete'));
                return false;
            } else {
                steps.push(bindProfile() + ' ✓');
            }
        }

        // ③ 条目开关
        if (scheme.presetName && scheme.toggles && Object.keys(scheme.toggles).length > 0) {
            try {
                hooks.writePromptToggles(scheme.toggles);
                steps.push(bindToggles() + ' ✓');
            } catch (e) {
                steps.push(bindToggles() + ' ✗');
            }
        }

        // ④ 直连设置兜底（只在没绑连接配置或绑的配置不存在时用）。
        // 若后面还有「只写模型」的显式 ttProxy，兜底不许把当前反代清掉。
        if (scheme.api && (!scheme.profileName || profileMissing)) {
            const keepProxy = !!(scheme.ttProxy && scheme.ttProxy.model && !scheme.ttProxy.url);
            let fallbackOk = true;
            try { fallbackOk = await hooks.applyApiFallback(scheme.api, { preserveProxy: keepProxy }); } catch (e) { fallbackOk = false; }
            if (token !== runToken) return false;
            steps.push(fallbackOk === false ? 'API ✗' : 'API ✓');
        }

        // ⑤ 显式反代 / Key / 模型：最后一步覆盖，且只在前面的 profile 确认完成后才允许
        const tt = scheme.ttProxy && typeof scheme.ttProxy === 'object' ? scheme.ttProxy : null;
        if (tt && (tt.url || tt.key || tt.model)) {
            let result = null;
            try { result = await hooks.applyExplicitProxy(tt); } catch (e) { result = null; }
            if (token !== runToken) return false;
            if (tt.url) steps.push(result && result.proxyApplied
                ? (result.proxyUiApplied === true ? '反代 ✓' : '反代 ✓（内存）')
                : '反代 ✗');
            if (tt.model) steps.push(result && result.modelApplied ? '模型 ✓' : '模型 ✗');
        }

        if (token !== runToken) return false;
        const failed = steps.some(s => String(s).indexOf('✗') >= 0);
        // 已有更新的切换在排队：成功时仍标记 active（后台设置确实已写），但不 toast（避免过期提示），
        // 让最后一条决定；失败的排队项不标记 active。
        if (pending) {
            if (!failed) {
                try { if (hooks.setActiveSchemeId) hooks.setActiveSchemeId(scheme.id); } catch (e) { }
                try { if (hooks.finalize) hooks.finalize(scheme, steps); } catch (e) { }
            }
            return failed ? false : true;
        }
        if (failed) {
            // 有任何一步 ✗：不更新 active、不 finalize、不报“已切换”；已写宿主的设置如实保留（非事务）。
            try { if (hooks.toast) hooks.toast(t('schemePartialIncomplete'), true); } catch (e) { }
            return false;
        }
        try { if (hooks.setActiveSchemeId) hooks.setActiveSchemeId(scheme.id); } catch (e) { }
        try { if (hooks.finalize) hooks.finalize(scheme, steps); } catch (e) { }
        try {
            if (hooks.toast) {
                const msg = String(t('schemeSwitchedTo')).replace('{n}', scheme.name)
                    + (steps.length ? ' ' + steps.join(' · ') : '');
                hooks.toast(msg, false);
            }
        } catch (e) { }
        return true;
    }

    async function pump() {
        if (running) return;
        running = true;
        try {
            while (pending) {
                if (hooks.isGenerating && hooks.isGenerating()) {
                    const busyJob = pending;
                    pending = null;
                    notice(t('schemeGenerating'));
                    try { busyJob.resolve(false); } catch (e) { }
                    continue;
                }
                if (blockedProfile) {
                    const blockedJob = pending;
                    pending = null;
                    notice(t('schemeProfileBusy'));
                    try { blockedJob.resolve(false); } catch (e) { }
                    continue;
                }
                const job = pending;
                pending = null;
                let result = false;
                const token = ++runToken;
                try { result = await runSwitch(job.scheme, token); } catch (e) { result = false; }
                try { job.resolve(result); } catch (e) { }
            }
        } finally {
            running = false;
        }
    }

    /** 请求切换。返回 Promise<boolean>；快速连点时只有最后一条会被执行，之前的排队项解析为 false。 */
    function switchScheme(scheme) {
        if (!scheme || typeof scheme !== 'object') return Promise.resolve(false);
        if (hooks.isGenerating && hooks.isGenerating()) {
            notice(t('schemeGenerating'));
            return Promise.resolve(false);
        }
        if (blockedProfile) {
            // 上一个 profile 等超时、迟到事件还没回来：明确拒绝，不能放新任务去被旧后台覆盖
            notice(t('schemeProfileBusy'));
            return Promise.resolve(false);
        }
        return new Promise((resolve) => {
            if (pending) {
                const superseded = pending;
                pending = null;
                superseded.resolve(false);
            }
            pending = { scheme, resolve };
            pump();
        });
    }

    return {
        switchScheme,
        get state() { return { running, queued: !!pending, token: runToken, blocked: blockedProfile ? blockedProfile.name : null }; },
    };
}
