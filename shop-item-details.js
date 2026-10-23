(function (root) {
    'use strict';

    let dialog;
    let previousFocus;
    let generation = 0;
    let booksPromise;
    const items = new Map();
    const identityCaches = new WeakMap();
    function identityCache(client) {
        if (!identityCaches.has(client)) identityCaches.set(client, new Map());
        return identityCaches.get(client);
    }
    function remember(client, key, loader) {
        const cache = identityCache(client), found = cache.get(key);
        if (found && found.until > Date.now()) return found.promise;
        const entry = { until:Infinity };
        entry.promise = Promise.resolve().then(loader).then(value => {
            entry.until = Date.now() + 300000;
            return value;
        }).catch(error => {
            if (cache.get(key) === entry) cache.delete(key);
            throw error;
        });
        cache.set(key, entry);
        return entry.promise;
    }
    async function mastersFor(client, ids) {
        const cache = identityCache(client);
        const missing = ids.filter(id => !(cache.get('id:' + id)?.until > Date.now()));
        for (let start = 0; start < missing.length; start += 100) {
            const batch = missing.slice(start, start + 100);
            const request = Promise.resolve().then(async () => {
                const { data, error } = await client.from('compendium_items').select('*').in('id', batch);
                if (error) throw error;
                return new Map((data || []).map(item => [String(item.id), item]));
            });
            for (const id of batch) remember(client, 'id:' + id, async () => (await request).get(id) || null);
        }
        return new Map(await Promise.all(ids.map(async id => [id, await cache.get('id:' + id).promise])));
    }

    root.CompendiumIdentity = {
        invalidate(client) { identityCaches.delete(client); },
        key(item) {
            return item.compendium_item_id != null ? `id:${item.compendium_item_id}` : `name:${item.item_name ?? item.name}`;
        },
        async resolveName(client, name) {
            return remember(client, 'name:' + name, async () => {
                const { data, error } = await client.rpc('resolve_compendium_item_id', { p_name: name });
                if (error) throw error;
                return data;
            });
        },
        async lookup(client, item) {
            const id = item.compendium_item_id != null ? item.compendium_item_id :
                await this.resolveName(client, item.item_name ?? item.name);
            if (id == null) return null;
            return remember(client, 'id:' + id, async () => {
                const { data, error } = await client.from('compendium_items').select('*').eq('id', id).maybeSingle();
                if (error) throw error;
                return data;
            });
        },
        async lookupMany(client, rows) {
            const aliases = new Map();
            const names = [...new Set(rows.filter(row => row.compendium_item_id == null).map(row => row.item_name ?? row.name))];
            for (let start = 0; start < names.length; start += 20) {
                await Promise.all(names.slice(start, start + 20).map(async name => {
                    aliases.set(name, await this.resolveName(client, name));
                }));
            }
            const idFor = row => row.compendium_item_id ?? aliases.get(row.item_name ?? row.name);
            const ids = [...new Set(rows.map(idFor).filter(id => id != null).map(String))];
            const masters = await mastersFor(client, ids);
            return new Map(rows.map(row => [this.key(row), masters.get(String(idFor(row))) || null]));
        },
        description(item, master) {
            // Nonblank listing text can be a deliberate DM override.
            if (item.description_override === true) return item.description;
            if (item.description_override === false && master) return master.description;
            return String(item.description || '').trim() ? item.description : master?.description;
        }
    };

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function safeLink(value) {
        try {
            const url = new URL(value, location.href);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
        } catch { return null; }
    }

    function renderHtml(text, parent) {
        const template = document.createElement('template');
        template.innerHTML = text;
        const allowed = new Set(['p', 'br', 'em', 'strong', 'b', 'i', 'u', 's', 'ul', 'ol', 'li',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'table', 'thead',
            'tbody', 'tfoot', 'tr', 'th', 'td', 'hr', 'span', 'div', 'a']);
        const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'img', 'svg',
            'math', 'video', 'audio', 'form', 'input', 'button', 'meta', 'link', 'template']);
        function append(source, target) {
            if (source.nodeType === 3) return target.append(document.createTextNode(source.textContent));
            if (source.nodeType !== 1) return;
            const tag = source.tagName.toLowerCase();
            if (blocked.has(tag)) return;
            if (!allowed.has(tag)) {
                for (const child of source.childNodes) append(child, target);
                return;
            }
            const node = element(tag === 'h1' ? 'h2' : tag);
            if (tag === 'a') {
                const href = safeLink(source.getAttribute('href') || '');
                if (href) { node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
            }
            for (const attribute of ['colspan', 'rowspan']) {
                const value = Number(source.getAttribute(attribute));
                if (['td', 'th'].includes(tag) && Number.isInteger(value) && value > 0 && value <= 20) node.setAttribute(attribute, value);
            }
            for (const child of source.childNodes) append(child, node);
            if (tag === 'table') {
                const wrap = element('div', undefined, 'shop-item-table-scroll');
                wrap.append(node);
                target.append(wrap);
            } else target.append(node);
        }
        for (const child of template.content.childNodes) append(child, parent);
    }

    // Build DOM nodes from Markdown tokens instead of inserting untrusted HTML.
    function renderTokens(tokens, parent) {
        for (const token of tokens || []) {
            let node;
            switch (token.type) {
                case 'space': continue;
                case 'heading': node = element(`h${Math.min(4, token.depth + 1)}`); break;
                case 'paragraph': node = element('p'); break;
                case 'strong': node = element('strong'); break;
                case 'em': node = element('em'); break;
                case 'del': node = element('del'); break;
                case 'blockquote': node = element('blockquote'); break;
                case 'br': node = element('br'); break;
                case 'hr': node = element('hr'); break;
                case 'codespan': node = element('code', token.text); break;
                case 'code': {
                    node = element('pre');
                    node.append(element('code', token.text));
                    break;
                }
                case 'link': {
                    const href = safeLink(token.href);
                    node = element(href ? 'a' : 'span');
                    if (href) {
                        node.href = href;
                        node.target = '_blank';
                        node.rel = 'noopener noreferrer';
                    }
                    break;
                }
                case 'list': {
                    node = element(token.ordered ? 'ol' : 'ul');
                    if (token.ordered && token.start) node.start = token.start;
                    for (const item of token.items) {
                        const li = element('li');
                        if (item.task) li.append(element('span', item.checked ? '[x] ' : '[ ] '));
                        renderTokens(item.tokens, li);
                        node.append(li);
                    }
                    parent.append(node);
                    continue;
                }
                case 'table': {
                    node = element('div', undefined, 'shop-item-table-scroll');
                    const table = element('table');
                    const thead = element('thead');
                    const tr = element('tr');
                    for (const cell of token.header) {
                        const th = element('th');
                        renderTokens(cell.tokens, th);
                        tr.append(th);
                    }
                    thead.append(tr);
                    table.append(thead);
                    const tbody = element('tbody');
                    for (const row of token.rows) {
                        const line = element('tr');
                        for (const cell of row) {
                            const td = element('td');
                            renderTokens(cell.tokens, td);
                            line.append(td);
                        }
                        tbody.append(line);
                    }
                    table.append(tbody);
                    node.append(table);
                    parent.append(node);
                    continue;
                }
                case 'text': {
                    if (token.tokens) renderTokens(token.tokens, parent);
                    else parent.append(document.createTextNode(token.text || ''));
                    continue;
                }
                case 'html':
                    renderHtml(token.text || token.raw || '', parent);
                    continue;
                default:
                    // Images are not fetched from imported rule text.
                    parent.append(document.createTextNode(token.text || token.raw || ''));
                    continue;
            }
            if (token.tokens) renderTokens(token.tokens, node);
            parent.append(node);
        }
    }

    function ensureDialog() {
        if (dialog) return;
        dialog = element('dialog', undefined, 'shop-item-dialog');
        dialog.setAttribute('aria-labelledby', 'shop-item-dialog-title');
        const header = element('header', undefined, 'shop-item-dialog-header');
        const heading = element('h2');
        heading.id = 'shop-item-dialog-title';
        const close = element('button', '\u00d7', 'shop-item-dialog-close');
        close.type = 'button';
        close.title = '\u5173\u95ed\u7269\u54c1\u8be6\u60c5';
        close.setAttribute('aria-label', close.title);
        close.onclick = () => dialog.close();
        header.append(heading, close);
        const meta = element('div', undefined, 'shop-item-dialog-meta');
        const body = element('section', undefined, 'shop-item-dialog-body');
        body.setAttribute('aria-label', '\u7269\u54c1\u63cf\u8ff0');
        const status = element('div', undefined, 'shop-item-dialog-status');
        status.setAttribute('role', 'status');
        dialog.append(header, meta, status, body);
        document.body.append(dialog);
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const box = dialog.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
        });
        dialog.addEventListener('close', () => {
            generation++;
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        });
    }

    function render(item, bookNames = {}) {
        document.getElementById('shop-item-dialog-title').textContent = item.name;
        const meta = dialog.querySelector('.shop-item-dialog-meta');
        meta.replaceChildren();
        meta.append(element('span', [item.category, item.rarity].filter(Boolean).join(' / ')));
        if (item.source_book) meta.append(element('span', bookNames[item.source_book] || item.source_book));
        const source = safeLink(item.source_url);
        if (item.source_url && source) {
            const link = element('a', '\u89c4\u5219\u51fa\u5904', 'shop-item-source-link');
            link.href = source;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = '\u5728\u65b0\u6807\u7b7e\u9875\u6253\u5f00\u89c4\u5219\u51fa\u5904';
            meta.append(link);
        }
        const body = dialog.querySelector('.shop-item-dialog-body');
        body.replaceChildren();
        const description = String(item.description || '').trim();
        if (!description) body.append(element('p', '\u7269\u54c1\u63cf\u8ff0\u5c1a\u672a\u5f55\u5165\u3002', 'shop-item-empty'));
        else if (root.marked?.lexer) renderTokens(root.marked.lexer(description, { gfm: true, breaks: true }), body);
        else body.append(element('div', description, 'shop-item-plain-text'));
        body.scrollTop = 0;
    }

    async function bookNames() {
        if (!booksPromise) booksPromise = fetch('data/compendium/source-books.json?v=20261023-custom1').then(response => {
            if (!response.ok) throw new Error('Book catalog unavailable');
            return response.json();
        }).then(rows => Object.fromEntries(rows.map(row => [row.code, row.name]))).catch(() => ({}));
        return booksPromise;
    }

    async function open(id, lookup) {
        const item = items.get(String(id));
        if (!item) return;
        ensureDialog();
        const request = ++generation;
        previousFocus = document.activeElement;
        render(item);
        const status = dialog.querySelector('.shop-item-dialog-status');
        status.textContent = '\u6b63\u5728\u8bfb\u53d6\u56fe\u9274\u8d44\u6599...';
        dialog.classList.toggle('shop-scene-dialog', document.getElementById('shop-section')?.classList.contains('active') === true);
        dialog.dataset.merchant = document.getElementById('shop-section')?.dataset.merchant || 'moon';
        if (!dialog.open) dialog.showModal();
        try {
            const [master, names] = await Promise.all([lookup ? lookup(item.name, item) : null, bookNames()]);
            if (request !== generation || !dialog.open) return;
            render({ ...item,
                description: root.CompendiumIdentity.description(item, master),
                source_book: master?.source_book || item.source_book,
                source_url: master?.source_url || item.source_url
            }, names);
            status.textContent = '';
        } catch (error) {
            if (request === generation && dialog.open) status.textContent = '\u56fe\u9274\u8d44\u6599\u8bfb\u53d6\u5931\u8d25\uff0c\u5f53\u524d\u663e\u793a\u5546\u54c1\u5df2\u6709\u63cf\u8ff0\u3002';
            console.warn('Shop detail lookup failed:', error);
        }
    }

    root.ShopItemDetails = {
        setItems(rows) { items.clear(); for (const row of rows) items.set(String(row.id), row); },
        open,
        close() { if (dialog?.open) dialog.close(); }
    };
})(globalThis);
