(function (root) {
    'use strict';
    const cache = new Map();
    const labels = new Map();
    let adminGeneration = 0;

    function node(tag, text, className) {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    }

    async function settings(client, accountId, force = false) {
        const key = accountId || 'own';
        if (force) cache.delete(key);
        if (!cache.has(key)) {
            const pending = client.rpc('get_shop_source_settings', { p_account_id: accountId || null }).then(({ data, error }) => {
                if (error) throw error;
                if (!data || !Array.isArray(data.books)) throw new Error('商城来源设置格式错误');
                data.books.forEach(book => labels.set(book.code, book.name));
                return data;
            }).catch(error => { cache.delete(key); throw error; });
            cache.set(key, pending);
        }
        return cache.get(key);
    }

    function required(item) {
        const books = item?.source_metadata?.required_source_books;
        return Array.isArray(books) && books.length ? books : [item?.source_book || 'HOMEBREW'];
    }

    function allowed(item, context) {
        const books = new Map(context.books.map(book => [book.code, book.enabled]));
        return required(item).every(code => books.get(code) === true);
    }

    function fillSelect(id, context, includeDisabled = false) {
        const select = document.getElementById(id);
        if (!select) return;
        const previous = select.value;
        select.replaceChildren(node('option', '全部书籍'));
        select.firstElementChild.value = '';
        context.books.filter(book => includeDisabled || book.enabled).forEach(book => {
            const option = node('option', book.name);
            option.value = book.code;
            select.append(option);
        });
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
    }

    async function filterListings(client, rows, accountId, { allBooks = false } = {}) {
        const context = await settings(client, accountId);
        fillSelect('shop-source-filter', context);
        const masters = await root.CompendiumIdentity.lookupMany(client, rows);
        const selected = document.getElementById('shop-source-filter')?.value || '';
        return rows.flatMap(item => {
            const master = masters.get(root.CompendiumIdentity.key(item));
            if (!allowed(master, context) || (!allBooks && selected && (master?.source_book || 'HOMEBREW') !== selected)) return [];
            return [{ ...item, source_book: master?.source_book || 'HOMEBREW',
                is_nonmagical: typeof master?.is_nonmagical === 'boolean' ? master.is_nonmagical : master?.source_metadata?.is_nonmagical === true,
                shop_shelf_category: root.ShopShelf?.classify(master || item),
                shop_search_terms: [master?.source_metadata?.canonical_name, master?.source_metadata?.english_name,
                    master?.source_metadata?.spell_name].filter(Boolean).join(' '),
                source_url: master?.source_url, description: root.CompendiumIdentity.description(item, master) }];
        });
    }

    async function filterCatalog(client, rows, accountId, selectId) {
        const context = await settings(client, accountId);
        if (selectId) fillSelect(selectId, context);
        const selected = selectId ? document.getElementById(selectId)?.value : '';
        return rows.filter(item => item.source_metadata?.custom_equipment_variant !== true && allowed(item, context) && (!selected || item.source_book === selected));
    }

    async function catalog(client, { query = '', rarity = '', source = '' } = {}) {
        const result = [];
        for (let start = 0; ; start += 1000) {
            let request = client.from('compendium_items').select('*').order('id').range(start, start + 999);
            if (query) request = request.ilike('name', `%${query}%`);
            if (rarity) request = request.eq('rarity', rarity);
            if (source) request = request.eq('source_book', source);
            const { data, error } = await request;
            if (error) throw error;
            result.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return result;
    }

    async function loadAdmin(client, onSaved) {
        const container = document.getElementById('shop-source-books-panel');
        if (!container) return;
        const generation = ++adminGeneration;
        container.replaceChildren(node('div', '正在加载书籍设置…', 'shop-source-status'));
        try {
            const context = await settings(client, null, true);
            if (generation !== adminGeneration) return;
            container.replaceChildren();
            const list = node('div', undefined, 'shop-source-book-list');
            for (const book of context.books) {
                const label = node('label', undefined, 'shop-source-book-option');
                const input = node('input');
                input.type = 'checkbox';
                input.checked = book.enabled;
                input.value = book.code;
                label.append(input, node('span', book.name), node('small', book.code));
                list.append(label);
            }
            const controls = node('div', undefined, 'shop-source-actions');
            const status = node('span', '', 'shop-source-status');
            status.setAttribute('role', 'status');
            const save = node('button', '保存书籍设置');
            save.type = 'button';
            save.onclick = async () => {
                save.disabled = true;
                list.querySelectorAll('input').forEach(input => { input.disabled = true; });
                status.textContent = '正在保存…';
                try {
                    const disabled = [...list.querySelectorAll('input')].filter(input => !input.checked).map(input => input.value);
                    const { error } = await client.rpc('save_shop_source_settings', { p_disabled_codes: disabled });
                    if (error) throw error;
                    cache.clear();
                    status.textContent = '已保存';
                    await onSaved?.();
                } catch (error) { status.textContent = '保存失败：' + error.message; }
                finally {
                    save.disabled = false;
                    list.querySelectorAll('input').forEach(input => { input.disabled = false; });
                }
            };
            controls.append(save, status);
            container.append(list, controls);
            fillSelect('compendium-source-filter', context);
        } catch (error) {
            if (generation === adminGeneration) container.replaceChildren(node('div',
                '书籍设置加载失败，请确认已执行 compendium_update.sql：' + error.message, 'shop-source-status'));
        }
    }

    root.ShopSources = { settings, required, allowed, filterListings, filterCatalog, catalog, loadAdmin,
        label: code => labels.get(code) || code, invalidate: () => cache.clear() };
})(globalThis);
