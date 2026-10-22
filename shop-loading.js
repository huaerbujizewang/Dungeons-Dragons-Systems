(function (root) {
    'use strict';
    const clients = new WeakMap();
    let displayKey, ticket = 0, refreshTimer;
    const refreshCallbacks = new Map();
    function cache(client) {
        if (!clients.has(client)) clients.set(client, new Map());
        return clients.get(client);
    }
    root.ShopLoading = {
        get(client, key, loader, ttl = 120000) {
            const entries = cache(client), previous = entries.get(key);
            if (previous && (previous.pending || previous.until > Date.now())) return previous.promise;
            const entry = { pending:true, until:0 };
            entry.promise = Promise.resolve().then(loader).then(value => {
                entry.pending = false;
                entry.until = Date.now() + ttl;
                return value;
            }).catch(error => {
                if (entries.get(key) === entry) entries.delete(key);
                throw error;
            });
            entries.set(key, entry);
            return entry.promise;
        },
        invalidate(client, prefix = '') {
            for (const key of cache(client).keys()) if (key.startsWith(prefix)) cache(client).delete(key);
        },
        begin(key) {
            const id = ++ticket, grid = document.getElementById('shop-grid');
            let status = document.getElementById('shop-loading-status');
            if (!status) {
                status = document.createElement('div');
                status.id = 'shop-loading-status';
                status.setAttribute('role', 'status');
                status.setAttribute('aria-live', 'polite');
                grid.before(status);
            }
            status.hidden = false;
            status.textContent = displayKey === key ? '正在更新货架…' : '正在整理货架…';
            grid.setAttribute('aria-busy', 'true');
            if (displayKey !== key) {
                grid.innerHTML = '<div class="shop-loading-placeholder">正在加载商品，请稍候…</div>';
                displayKey = key;
            }
            return id;
        },
        end(id) {
            if (id !== ticket) return;
            document.getElementById('shop-grid')?.setAttribute('aria-busy', 'false');
            const status = document.getElementById('shop-loading-status');
            if (status) status.hidden = true;
        },
        schedule(callback) {
            refreshCallbacks.set('view', callback);
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                const callbacks = [...refreshCallbacks.values()];
                refreshCallbacks.clear();
                if (document.getElementById('shop-section')?.classList.contains('active')) {
                    for (const run of callbacks) run();
                }
            }, 250);
        }
    };
})(window);
