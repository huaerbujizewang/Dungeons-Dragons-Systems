(function (root) {
    'use strict';

    const categories = [
        { id:'all', label:'全部商品', icon:'layout-grid' },
        { id:'enspelled', label:'魔咒法杖', icon:'wand-sparkles' },
        { id:'scrolls', label:'卷轴', icon:'scroll-text' },
        { id:'potions', label:'药水与油剂', icon:'flask-conical' },
        { id:'weapons', label:'武器与弹药', icon:'swords' },
        { id:'armor', label:'护甲与盾牌', icon:'shield' },
        { id:'implements', label:'其他施法器具', icon:'wand' },
        { id:'rings', label:'戒指', icon:'circle' },
        { id:'wondrous', label:'奇物', icon:'box' },
        { id:'gear', label:'冒险装备', icon:'backpack' },
        { id:'materials', label:'材料与宝石', icon:'gem' },
        { id:'other', label:'其他', icon:'package' }
    ];
    const labels = new Map(categories.map(category => [category.id,category.label]));
    const rarityWeight = { '神器':6, '传说':5, '极珍稀':4, '珍稀':3, '非普通':2, '普通':1 };
    const state = { category:'all', scope:'all', mode:'buy', onChange:null, mounted:false };

    function metadata(item) {
        if (typeof item?.source_metadata === 'string') {
            try { return JSON.parse(item.source_metadata); } catch { return {}; }
        }
        return item?.source_metadata || {};
    }

    function classify(item) {
        const meta = metadata(item);
        if (labels.has(meta.shop_category) && meta.shop_category !== 'all') return meta.shop_category;
        const category = String(item?.category || '').trim();
        if (category === '材料') return 'materials';
        if (meta.classification_method === 'enspelled_staff' || meta.canonical_name === '魔咒法杖') return 'enspelled';
        if (category === '卷轴' || meta.classification_method === 'spell_scroll') return 'scrolls';
        if (category === '药水') return 'potions';
        const text = String(item?.description || '').replace(/<[^>]*>/g,' ').replace(/[*_`]/g,'');
        if (/铭刻法术[:：]/.test(text) && /法杖$/.test(item?.name || '')) return 'enspelled';
        if (/^\s*装备[（(]奥术法器[）)]/.test(text)) return 'implements';
        if (/^\s*装备[（(]奥术法器[）)]/.test(text)) return 'implements';
        const header = text.slice(0,1600).match(/(?:^|\n)\s*(奇物|药水|卷轴|武器|护甲|戒指|法杖|魔杖|权杖|轻甲|中甲|重甲|盾牌|宝石|(?:简易|军用)(?:近战|远程)武器)(?=[\s（(，,：:]|$)/)?.[1];
        if (header === '药水') return 'potions';
        if (header === '卷轴') return 'scrolls';
        if (header === '武器' || /武器$/.test(header || '')) return 'weapons';
        if (['护甲','轻甲','中甲','重甲','盾牌'].includes(header)) return 'armor';
        if (['法杖','魔杖','权杖'].includes(header)) return 'implements';
        if (header === '戒指') return 'rings';
        if (header === '奇物') return 'wondrous';
        if (header === '宝石') return 'materials';
        const canonical = String(meta.canonical_name || '').trim();
        const english = String(meta.english_name || '').trim();
        if (['护甲','盾牌'].includes(canonical) || /^(Armor|Shield)\b/i.test(english)
            || item?.name === '提亚马特盾牌') return 'armor';
        if (['武器','弹药'].includes(canonical) || /^(Weapon|Ammunition)\b/i.test(english)) return 'weapons';
        if (category === '装备') return 'gear';
        if (category === '魔法物品') return 'wondrous';
        if (['武器','弹药'].includes(category)) return 'weapons';
        if (['护甲','盾牌'].includes(category)) return 'armor';
        return 'other';
    }

    function icon(name) {
        return `<svg class="shop-shelf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="assets/vendor/lucide/shop-icons.svg#${name}"></use></svg>`;
    }

    function mount(onChange) {
        const section = document.getElementById('shop-section');
        if (!section) return;
        state.onChange = onChange;
        if (state.mounted) return;
        state.mounted = true;
        const nav = section.querySelector('#shop-category-nav');
        const mobile = section.querySelector('#shop-category-mobile');
        for (const category of categories) {
            if (nav) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'shop-category-button';
                button.dataset.category = category.id;
                button.setAttribute('aria-pressed',String(category.id === state.category));
                button.innerHTML = icon(category.icon);
                const name = document.createElement('span');
                name.textContent = category.label;
                const count = document.createElement('small');
                count.className = 'shop-category-count';
                button.append(name,count);
                if (category.id === 'implements') button.title = '普通法杖、魔杖和权杖；魔咒法杖单独分类';
                button.onclick = () => { state.category = category.id; state.onChange?.(); };
                nav.append(button);
            }
            if (mobile) {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.label;
                mobile.append(option);
            }
        }
        if (mobile) mobile.onchange = () => { state.category = mobile.value; state.onChange?.(); };
        section.querySelectorAll('[data-shop-scope]').forEach(button => {
            button.onclick = () => { state.scope = button.dataset.shopScope; state.onChange?.(); };
        });
        ['shop-search-input','shop-source-filter','shop-rarity-filter','shop-sort-filter'].forEach(id => {
            const input = section.querySelector('#'+id);
            input?.addEventListener(id === 'shop-search-input' ? 'input' : 'change',() => state.onChange?.());
        });
        section.addEventListener('click',event => {
            section.querySelectorAll('.shop-item-admin-menu[open]').forEach(menu => {
                if (!menu.contains(event.target)) menu.open = false;
            });
        });
        document.addEventListener('keydown',event => {
            if (event.key === 'Escape') section.querySelectorAll('.shop-item-admin-menu[open]').forEach(menu => { menu.open = false; });
        });
    }

    function setMode(sell) {
        state.mode = sell ? 'sell' : 'buy';
        const section = document.getElementById('shop-section');
        if (!section) return;
        section.dataset.mode = state.mode;
        section.querySelector('#shop-buy-mode-btn')?.setAttribute('aria-pressed',String(!sell));
        section.querySelector('#shop-mode-btn')?.setAttribute('aria-pressed',String(sell));
        const scope = section.querySelector('.shop-scope-tabs');
        if (scope) scope.hidden = sell;
        const source = section.querySelector('#shop-source-filter');
        if (source) source.hidden = sell;
    }

    function filter(rows) {
        const value = id => document.getElementById(id)?.value || '';
        const query = value('shop-search-input').trim().toLocaleLowerCase();
        const source = state.mode === 'buy' ? value('shop-source-filter') : '';
        const rarity = value('shop-rarity-filter');
        const matches = rows.filter(item => {
            const group = item.shop_shelf_category || classify(item);
            const terms = [item.name,item.item_name,item.category,item.rarity,item.source_book,
                labels.get(group),item.shop_search_terms].join(' ').toLocaleLowerCase();
            return (!query || terms.includes(query)) && (!source || item.source_book === source)
                && (!rarity || item.rarity === rarity)
                && (state.mode === 'sell' || state.scope === 'all' || (state.scope === 'private' ? !!item.user_id : !item.user_id));
        });
        const counts = new Map(categories.map(category => [category.id,0]));
        counts.set('all',matches.length);
        matches.forEach(item => {
            const category = item.shop_shelf_category || classify(item);
            counts.set(category,(counts.get(category) || 0)+1);
        });
        const section = document.getElementById('shop-section');
        section?.querySelectorAll('.shop-category-button').forEach(button => {
            button.setAttribute('aria-pressed',String(button.dataset.category === state.category));
            button.querySelector('small').textContent = counts.get(button.dataset.category) || 0;
        });
        section?.querySelectorAll('[data-shop-scope]').forEach(button => {
            button.setAttribute('aria-pressed',String(button.dataset.shopScope === state.scope));
        });
        const mobile = section?.querySelector('#shop-category-mobile');
        if (mobile) {
            for (const option of mobile.options) option.textContent = `${labels.get(option.value)} (${counts.get(option.value) || 0})`;
            mobile.value = state.category;
        }
        const result = matches.filter(item => state.category === 'all' || (item.shop_shelf_category || classify(item)) === state.category);
        const sort = value('shop-sort-filter') || 'rarity';
        result.sort((a,b) => {
            const priceA = Number(a.shop_shelf_price ?? a.price) || 0;
            const priceB = Number(b.shop_shelf_price ?? b.price) || 0;
            if (sort === 'price-asc' && priceA !== priceB) return priceA-priceB;
            if (sort === 'price-desc' && priceA !== priceB) return priceB-priceA;
            if (sort === 'name') return String(a.name || a.item_name).localeCompare(String(b.name || b.item_name),'zh-Hans-CN');
            if (sort === 'rarity') {
                const rank=(rarityWeight[b.rarity] || 0)-(rarityWeight[a.rarity] || 0);
                if (rank) return rank;
                if (priceA !== priceB) return priceB-priceA;
            }
            return String(a.name || a.item_name).localeCompare(String(b.name || b.item_name),'zh-Hans-CN');
        });
        const heading = section?.querySelector('#shop-shelf-heading');
        if (heading) heading.textContent = state.mode === 'sell' && state.category === 'all' ? '可出售物品' : labels.get(state.category);
        const counter = section?.querySelector('#shop-shelf-count');
        if (counter) counter.textContent = `${result.length} 件商品`;
        return result;
    }

    const api = { categories, classify, icon, mount, filter, setMode, label:id => labels.get(id) || '其他' };
    root.ShopShelf = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
