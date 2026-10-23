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
    const state = { category:'all', scope:'all', mode:'buy', onChange:null, mounted:false, limit:60 };
    function changed(){state.limit=60;const grid=document.getElementById('shop-grid');if(grid)grid.scrollTop=0;state.onChange?.();}
    function reset(){
        for(const id of ['shop-search-input','shop-source-filter','shop-rarity-filter','shop-price-min','shop-price-max','shop-spell-level','shop-attunement-filter']){const input=document.getElementById(id);if(input)input.value='';}
        for(const id of ['shop-instock-filter','shop-affordable-filter','shop-deals-filter']){const input=document.getElementById(id);if(input)input.checked=false;}
        state.category='all';state.scope='all';changed();
    }
    function visible(rows){
        const button=document.getElementById('shop-load-more');
        if(button){button.hidden=rows.length<=state.limit;button.textContent='加载更多（剩余 '+Math.max(0,rows.length-state.limit)+' 件）';}
        return rows.slice(0,state.limit);
    }
    function applied(){
        const container=document.getElementById('shop-applied-filters');if(!container)return;container.replaceChildren();
        function chip(label,clear){const button=document.createElement('button');button.type='button';button.textContent=label+' ×';button.ariaLabel='移除筛选：'+label;button.onclick=()=>{clear();changed();};container.append(button);}
        if(state.category!=='all')chip(labels.get(state.category),()=>state.category='all');
        if(state.mode==='buy'&&state.scope!=='all')chip(state.scope==='private'?'当前特供':'全服公共',()=>state.scope='all');
        for(const [id,label] of [['shop-search-input','搜索'],['shop-source-filter','书籍'],['shop-rarity-filter','稀有度'],['shop-price-min','最低价'],['shop-price-max','最高价'],['shop-spell-level','法术环阶'],['shop-attunement-filter','同调']]){
            const input=document.getElementById(id);if(!input?.value||(state.mode==='sell'&&id==='shop-source-filter'))continue;
            const value=input.tagName==='SELECT'?input.selectedOptions[0]?.textContent:input.value;
            chip(label+'：'+value,()=>input.value='');
        }
        if(state.mode==='buy')for(const [id,label] of [['shop-instock-filter','有货'],['shop-affordable-filter','标价不超过余额'],['shop-deals-filter','特惠']]){const input=document.getElementById(id);if(input?.checked)chip(label,()=>input.checked=false);}
        const clear=document.getElementById('shop-clear-filters');if(clear)clear.hidden=!container.children.length;
        const actions=container.closest('.shop-filter-actions');if(actions)actions.hidden=!container.children.length;
    }

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
                button.onclick = () => { state.category = category.id; changed(); };
                nav.append(button);
            }
            if (mobile) {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.label;
                mobile.append(option);
            }
        }
        if (mobile) mobile.onchange = () => { state.category = mobile.value; changed(); };
        section.querySelectorAll('[data-shop-scope]').forEach(button => {
            button.onclick = () => { state.scope = button.dataset.shopScope; changed(); };
        });
        let searchTimer;
        ['shop-search-input','shop-source-filter','shop-rarity-filter','shop-sort-filter','shop-price-min','shop-price-max','shop-spell-level','shop-attunement-filter','shop-instock-filter','shop-affordable-filter','shop-deals-filter'].forEach(id => {
            const input = section.querySelector('#'+id);
            input?.addEventListener(['shop-search-input','shop-price-min','shop-price-max'].includes(id)?'input':'change',()=>{clearTimeout(searchTimer);if(id==='shop-search-input')searchTimer=setTimeout(changed,120);else changed();});
        });
        const clear=section.querySelector('#shop-clear-filters');if(clear)clear.onclick=reset;
        const more=section.querySelector('#shop-load-more');if(more)more.onclick=()=>{state.limit+=60;state.onChange?.();};
        document.addEventListener('shop:merchant-changed',()=>{state.limit=60;});
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
        if(state.mode!==(sell?'sell':'buy'))state.limit=60;
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
        const low=value('shop-price-min'),high=value('shop-price-max'),level=value('shop-spell-level'),attunement=value('shop-attunement-filter');
        const checked=id=>document.getElementById(id)?.checked===true;
        const balance=root.ShopCart?.balance?.();
        const matches = rows.filter(item => {
            const group = item.shop_shelf_category || classify(item);
            const terms = [item.name,item.item_name,item.category,item.rarity,item.source_book,
                labels.get(group),item.shop_search_terms].join(' ').toLocaleLowerCase();
            const price=Number(item.shop_shelf_price??item.price),meta=metadata(item);
            const spellLevel=item.shop_spell_level??meta.spell_level;
            const requires=item.shop_requires_attunement??meta.requires_attunement??(/(?:需|需要)[^\n。]{0,30}同调/.test(String(item.description||'').slice(0,500))&&!/无需同调|不需要同调/.test(String(item.description||'').slice(0,500)));
            return (!query || terms.includes(query)) && (!source || item.source_book === source)
                && (!rarity || item.rarity === rarity)
                && (low===''||price>=Number(low)) && (high===''||price<=Number(high))
                && (level===''||(spellLevel!=null&&Number(spellLevel)===Number(level)))
                && (attunement===''||Boolean(requires)===(attunement==='yes'))
                && (state.mode==='sell'||(!checked('shop-instock-filter')||item.unlimited_stock||Number(item.stock)>0))
                && (state.mode==='sell'||(!checked('shop-affordable-filter')||(balance!=null&&price<=Number(balance))))
                && (state.mode==='sell'||(!checked('shop-deals-filter')||Number(item.discount_percent??100)<100))
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
            if (state.mode === 'buy') {
                if (!!a.unlimited_stock !== !!b.unlimited_stock) return a.unlimited_stock ? 1 : -1;
                const unavailableA = !a.unlimited_stock && Number(a.stock) <= 0;
                const unavailableB = !b.unlimited_stock && Number(b.stock) <= 0;
                if (unavailableA !== unavailableB) return unavailableA ? 1 : -1;
                const promotionA = Number(a.discount_percent ?? 100);
                const promotionB = Number(b.discount_percent ?? 100);
                if (promotionA !== promotionB) return promotionA-promotionB;
            }
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
        applied();
        visible(result);
        return result;
    }

    const api = { categories, classify, icon, mount, filter, visible, reset, setMode, label:id => labels.get(id) || '其他' };
    root.ShopShelf = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
