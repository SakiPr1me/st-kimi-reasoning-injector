/* 自更新只走宿主已安装仓库；远端网页查询不再是启动更新的前提。 */
export const SELF_UPDATE_VERSION = '1.0.0';
const REQUEST_WAIT_MS = 60000;
const UNCERTAIN_HOLD_MS = 20 * 60 * 1000;
const START_GAP_MS = 60000;

export function createSelfUpdater(deps) {
    const request = deps.fetch;
    const now = deps.now || Date.now;
    const delay = deps.setTimeout || setTimeout;
    const cancel = deps.clearTimeout || clearTimeout;
    const controller = deps.AbortController || AbortController;
    const selfUrl = new URL(deps.entryUrl);
    const folder = decodeURIComponent(selfUrl.pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '');
    if (!folder || /[\\/\0]/.test(folder)) throw new Error('插件目录名称不正确');
    const manifestUrl = new URL('./manifest.json', selfUrl);
    const namespace = 'yw-self-update:' + selfUrl.pathname.slice(0, selfUrl.pathname.lastIndexOf('/'));
    const storage = deps.storage;
    const buttons = new Set();
    const listeners = new Set();
    let flight = null, started = false, sequence = 0, reloadTimer = null;
    let state = { stage: 'idle', label: '尚未检查', installed: deps.loadedVersion, elapsedMs: 0, startedAt: 0, updated: false };

    function read(key, fallback = null) {
        try { return JSON.parse(storage.getItem(namespace + ':' + key) || 'null') ?? fallback; } catch (e) { return fallback; }
    }
    function write(key, value) {
        try { storage.setItem(namespace + ':' + key, JSON.stringify(value)); } catch (e) { }
    }
    function remove(key) {
        try { storage.removeItem(namespace + ':' + key); } catch (e) { }
    }
    function validVersion(version) {
        return typeof version === 'string' && /^\d+(?:\.\d+){1,3}$/.test(version.trim())
            && version.trim().split('.').every(part => Number.isSafeInteger(Number(part)));
    }
    function snapshot() { return { ...state, pending: !!flight }; }
    function publish(stage, label, extra = {}) {
        state = { ...state, stage, label, ...extra };
        state.elapsedMs = state.startedAt ? Math.max(0, now() - state.startedAt) : 0;
        for (const button of buttons) {
            button.textContent = label;
            button.disabled = stage === 'locating' || stage === 'updating' || stage === 'verifying';
            delete button.dataset.busy;
        }
        write('last', { ...state });
        for (const listener of listeners) {
            try { listener(snapshot()); } catch (e) { }
        }
        return snapshot();
    }
    function notify(kind, text, automatic) {
        if (automatic && kind === 'success') return;
        try { deps.notify?.(kind, text); } catch (e) { }
    }
    async function timedJson(url, options = {}, timeout = 6000) {
        const aborter = new controller();
        const timer = delay(() => aborter.abort(), timeout);
        try {
            const response = await request(url, { ...options, signal: aborter.signal });
            if (!response.ok) throw Object.assign(new Error('HTTP ' + response.status), { status: response.status });
            return await response.json();
        } finally { cancel(timer); }
    }
    async function installedVersion() {
        const url = new URL(manifestUrl);
        url.searchParams.set('_yw_verify', now() + '-' + (++sequence));
        const manifest = await timedJson(url.href, { cache: 'no-store', credentials: 'same-origin' });
        if (!manifest || !validVersion(manifest.version)) throw new Error('版本文件无法读取');
        const version = manifest.version.trim();
        try { storage.setItem('kimi_updated_to', version); } catch (e) { }
        return version;
    }
    async function locate() {
        let found;
        try {
            const list = await timedJson('/api/extensions/discover', { cache: 'no-store', credentials: 'same-origin' });
            if (Array.isArray(list)) {
                found = list.filter(item => item && (item.name === 'third-party/' + folder || item.name === folder)
                    && (item.type === 'global' || item.type === 'local'));
            }
        } catch (e) { }
        if (found?.length) {
            // 宿主发现接口会优先本地同名安装；两种安装共享URL，不能靠URL猜global。
            found.sort((a, b) => Number(a.type !== 'local') - Number(b.type !== 'local'));
            return [...new Set(found.map(item => item.type === 'global'))];
        }
        // 发现失败时不使用可能属于另一用户/旧安装的记忆去更新同名目录。
        throw new Error('无法确认当前插件的安装位置，请稍后重试');
    }
    function scheduleReload() {
        if (reloadTimer !== null) cancel(reloadTimer);
        const tryReload = () => {
            if (flight || deps.isBusy?.()) {
                publish('ready', '已更新，等待聊天结束后刷新');
                reloadTimer = delay(tryReload, 1000);
                return;
            }
            // 仅自己的刷新回跳跳过一次启动拉取，不抑制之后正常重新打开。
            write('reload', { installed: state.installed, at: now() });
            try { deps.reload(); } catch (e) {
                remove('reload');
                publish('ready', '已更新，请手动刷新');
            }
            reloadTimer = null;
        };
        reloadTimer = delay(tryReload, 3000);
    }
    async function verifyResult(result, automatic) {
        publish('verifying', '正在核实安装版本…');
        const version = await installedVersion();
        const marker = read('pending');
        const before = marker?.before || deps.loadedVersion;
        const changed = result ? result.isUpToDate === false : version !== before;
        remove('pending');
        write('installation', { name: folder, global: marker?.global ?? false });
        publish(changed ? 'ready' : 'current', changed ? '已更新 v' + version : '已是最新 v' + version,
            { installed: version, updated: changed });
        if (changed) {
            notify('success', '余温工具箱文件已核实为 v' + version + '，将等待聊天结束后刷新。', false);
            scheduleReload();
        } else notify('success', '当前插件文件为 v' + version, automatic);
        return snapshot();
    }
    async function recover(automatic) {
        const pending = read('pending');
        if (!pending) return null;
        try {
            const version = await installedVersion();
            if (pending.before && version !== pending.before) return await verifyResult(null, automatic);
        } catch (e) { }
        if (now() - pending.at < UNCERTAIN_HOLD_MS) {
            return publish('uncertain', '上次更新结果未确认，暂不重复提交');
        }
        // 超过宿主数条git命令的最长等待窗，允许后续显式/新启动尝试；不删用户文件。
        remove('pending');
        return null;
    }
    async function run(automatic) {
        state.startedAt = now();
        const recovery = await recover(automatic);
        if (recovery) return recovery;
        publish('locating', '正在定位插件…', { updated: false });
        let before = deps.loadedVersion;
        try { before = await installedVersion(); } catch (e) {
            try { storage.removeItem('kimi_updated_to'); } catch (err) { }
        }
        let scopes;
        try { scopes = await locate(); } catch (error) {
            publish('failed', error.message);
            notify('warning', state.label, automatic);
            return snapshot();
        }
        for (const global of scopes) {
            publish('updating', '正在获取 Git 更新…');
            write('pending', { at: now(), before, global });
            let waitTimer, releaseTimer;
            // UI等待超时不取消服务器git任务，也不释放本页flight；晚到响应仍负责最终核验。
            const operation = (async () => {
                const response = await request('/api/extensions/update', {
                    method: 'POST', headers: deps.getRequestHeaders(), credentials: 'same-origin',
                    body: JSON.stringify({ extensionName: folder, global }),
                });
                if (response.status === 404) return { missing: true };
                if (!response.ok) throw Object.assign(new Error('HTTP ' + response.status), { status: response.status });
                const result = await response.json();
                if (!result || typeof result !== 'object' || typeof result.isUpToDate !== 'boolean'
                    || typeof result.shortCommitHash !== 'string' || !/^[a-f0-9]{7,40}$/i.test(result.shortCommitHash)) {
                    throw new Error('更新接口返回不完整');
                }
                return { result };
            })();
            waitTimer = delay(() => publish('uncertain', '服务器仍在处理，暂不重复提交'), REQUEST_WAIT_MS);
            let answer;
            const release = new Promise((_, reject) => {
                releaseTimer = delay(() => reject(new Error('更新等待已超过宿主任务上限')), UNCERTAIN_HOLD_MS);
            });
            try { answer = await Promise.race([operation, release]); } catch (error) {
                const status = error.status;
                if (status === 400 || status === 403 || status === 500) {
                    // 宿主已明确结束本次请求；下一次显式操作先核盘，不在本轮连发重试。
                    remove('pending');
                    const label = status === 403 ? '没有更新此安装的权限'
                        : status === 500 ? 'Git 更新失败，请检查网络或仓库后重试' : '插件安装信息不正确';
                    publish('failed', label);
                    notify('error', label, automatic);
                } else {
                    publish('uncertain', '更新结果未确认，稍后核对；暂不重复提交');
                    notify('warning', state.label, automatic);
                }
                return snapshot();
            } finally { cancel(waitTimer); cancel(releaseTimer); }
            if (answer.missing) { remove('pending'); continue; }
            try { return await verifyResult(answer.result, automatic); } catch (error) {
                publish('uncertain', '已收到更新结果，但版本未能核实');
                notify('warning', state.label, automatic);
                return snapshot();
            }
        }
        remove('pending');
        publish('failed', '找不到当前插件的 Git 安装');
        notify('error', state.label, automatic);
        return snapshot();
    }
    function update(button, automatic = false) {
        if (button) { buttons.add(button); button.textContent = '更新处理中…'; button.disabled = true; }
        if (flight) {
            if (state.stage === 'uncertain') publish('uncertain', state.label);
            return flight;
        }
        const execute = () => run(automatic);
        const locks = deps.locks;
        flight = Promise.resolve().then(() => locks?.request
            ? locks.request(namespace, { ifAvailable: true }, lock => lock ? execute() : publish('busy', '另一页面正在更新'))
            : execute()).catch(error => {
                publish('failed', '更新检查未完成，可稍后重试');
                notify('warning', state.label, automatic);
                return snapshot();
            }).finally(() => {
                flight = null;
                for (const btn of buttons) { btn.disabled = false; btn.textContent = state.label; delete btn.dataset.busy; }
                buttons.clear();
                for (const listener of listeners) { try { listener(snapshot()); } catch (e) { } }
            });
        return flight;
    }
    function start() {
        if (started) return flight || Promise.resolve(snapshot());
        started = true;
        if (!deps.getAutoUpdate()) return Promise.resolve(publish('disabled', '自动更新已关闭'));
        const reload = read('reload');
        remove('reload');
        if (reload && now() - reload.at < 2 * 60 * 1000 && reload.installed === deps.loadedVersion) {
            return Promise.resolve(publish('current', '已载入更新 v' + deps.loadedVersion));
        }
        const last = read('lastStart', 0);
        if (typeof last === 'number' && last > 0 && now() - last < START_GAP_MS) {
            return Promise.resolve(publish('cooldown', '刚检查过更新，可手动重试'));
        }
        write('lastStart', now());
        return update(null, true);
    }
    function subscribe(listener) {
        listeners.add(listener);
        listener(snapshot());
        return () => listeners.delete(listener);
    }
    return { start, update, snapshot, subscribe, installedVersion, folder };
}
