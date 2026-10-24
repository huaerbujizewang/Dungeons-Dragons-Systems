(function(root){
    'use strict';
    const cache=new Map();
    let client,actor,getTarget,loaded='',generation=0,busy=false,ready=false,defaults=[];
    const byId=id=>document.getElementById(id);
    const shopId=()=>byId('adm-shop-merchant').value;
    const key=id=>actor+':'+id;
    function status(text){byId('supply-status').textContent=text;}
    function setBusy(value){
        busy=value;byId('supply-fields').disabled=value||!ready;
        byId('adm-shop-merchant').disabled=value;byId('supply-reload').disabled=value;
        byId('supply-presets').disabled=value;
    }
    function snapshot(){
        return {categories:[...document.querySelectorAll('#supply-categories input:checked')].map(input=>input.value),
            source_book:byId('adm-restock-source').value,scope:byId('adm-restock-target').value,plan:root.getRestockPlan()};
    }
    function read(){
        if(!ready||busy||loaded!==shopId())throw new Error('请先读取当前商铺的供货设置');
        const rule=snapshot();
        if(!rule.categories.length)throw new Error('请至少选择一种商品类型；清空选择不会表示全部商品');
        if(rule.plan.some(row=>row.count>1000||row.stock>2147483647))throw new Error('每种稀有度最多进货1000种商品，单项库存不能超过2147483647');
        return rule;
    }
    function filterPool(items,rule){
        return items.filter(item=>rule.categories.includes(root.ShopShelf.classify(item))&&(!rule.source_book||item.source_book===rule.source_book));
    }
    function describe(rule){return rule.categories.map(id=>root.ShopShelf.label(id)).join('、')+(rule.source_book?'；书籍：'+root.ShopSources.label(rule.source_book):'；全部已启用书籍');}
    function apply(rule,books){
        document.querySelectorAll('#supply-categories input').forEach(input=>{input.checked=rule.categories.includes(input.value);});
        byId('adm-restock-target').value=rule.scope;
        const select=byId('adm-restock-source');select.replaceChildren(new Option('全部已启用书籍',''));
        books.filter(book=>book.enabled||book.code===rule.source_book).forEach(book=>select.append(new Option(book.name+(book.enabled?'':'（当前未启用）'),book.code)));
        select.value=rule.source_book;
        for(const [rarity,suffix] of [['传说','legendary'],['极珍稀','veryrare'],['珍稀','rare'],['非普通','uncommon'],['普通','common']]){
            const row=rule.plan.find(entry=>entry.rarity===rarity);
            byId('restock-count-'+suffix).value=row?.count||0;
            byId('restock-stock-'+suffix).value=row?.stock||1;
        }
    }
    async function load(force=false){
        if(!client||busy)return;
        const id=shopId(),cacheKey=key(id),token=++generation;ready=false;loaded='';byId('supply-fields').disabled=true;status('读取中...');
        byId('supply-preview-result').textContent='';
        try{
            const books=await root.ShopSources.settings(client,actor,force);
            let saved=cache.get(cacheKey);
            if(!saved||force){
                const {data,error}=await client.rpc('get_shop_supply_settings',{p_shop_id:id});if(error)throw error;
                saved={rule:data.rule||{categories:id==='lemonia'?['enspelled','scrolls']:root.ShopShelf.categories.filter(c=>c.id!=='all').map(c=>c.id),source_book:'',scope:'public',plan:defaults},dirty:false};
                cache.set(cacheKey,saved);
            }
            if(token!==generation||id!==shopId())return;
            apply(saved.rule,books.books);loaded=id;ready=true;status(saved.dirty?'有未保存的修改':'本店配方已读取');
            byId('supply-fields').disabled=false;
        }catch(error){if(token===generation)status('读取失败：'+(['PGRST202','42883'].includes(error.code)?'请执行 shop_merchants.sql':error.message));}
    }
    async function save(){
        let rule;try{rule=read();}catch(error){status(error.message);return;}
        const id=shopId();setBusy(true);status('保存中...');
        try{
            const {data,error}=await client.rpc('save_shop_supply_settings',{p_shop_id:id,p_rule:rule});if(error)throw error;
            cache.set(key(id),{rule:data.rule,dirty:false});status('本店配方已保存');
        }catch(error){status('保存失败：'+error.message);}finally{setBusy(false);}
    }
    async function preview(){
        let rule,target;
        try{rule=read();target=rule.scope==='private'?getTarget():null;if(rule.scope==='private'&&!target)throw new Error('请先选择特供玩家');}
        catch(error){status(error.message);return;}
        setBusy(true);status('统计候选商品...');
        try{
            const all=await root.ShopSources.catalog(client,{source:rule.source_book});
            const pool=filterPool(await root.ShopSources.filterCatalog(client,all,target||actor),rule);
            byId('supply-preview-result').textContent='候选商品 '+pool.length+' 种\n'+rule.plan.map(row=>{
                const count=pool.filter(item=>item.rarity===row.rarity).length;
                return row.rarity+'：可选 '+count+' 种 / 本次 '+row.count+' 种'+(count<row.count?'（不足）':'');
            }).join('\n');status('候选池统计完成');
        }catch(error){status('预览失败：'+error.message);}finally{setBusy(false);}
    }
    async function replenish(){
        if(busy||!client)return;
        const id=shopId(),name=root.ShopMerchants.merchants.find(shop=>shop.id===id).name;
        if(!confirm('将'+name+'的公共预制货物补齐至预设库存？不会降低现有库存，也不会修改价格、折扣或玩家特供。'))return;
        setBusy(true);status('正在补齐预制货物...');
        try{
            const {data,error}=await client.rpc('replenish_shop_presets',{p_shop_id:id});if(error)throw error;
            root.ShopLoading?.invalidate(client,'stock:');
            document.dispatchEvent(new CustomEvent('shop:presets-replenished',{detail:{shopId:id}}));
            status('已恢复 '+data.created+' 种货物，补货 '+data.restocked+' 种，共补入 '+data.units+' 份。');
        }catch(error){status('补货失败：'+(['PGRST202','42883'].includes(error.code)?'请运行 shop_addiction_update.sql':error.message));}
        finally{setBusy(false);}
    }
    function mount(){
        if(!byId('supply-categories'))return;
        for(const category of root.ShopShelf.categories.filter(item=>item.id!=='all')){
            const label=document.createElement('label'),input=document.createElement('input');
            input.type='checkbox';input.value=category.id;input.checked=true;label.append(input,document.createTextNode(category.label));byId('supply-categories').append(label);
        }
        const changed=()=>{
            if(!ready||busy||loaded!==shopId())return;
            cache.set(key(shopId()),{rule:snapshot(),dirty:true});status('有未保存的修改');byId('supply-preview-result').textContent='';
        };
        byId('supply-fields').addEventListener('input',changed);byId('supply-fields').addEventListener('change',changed);
        for(const [id,checked] of [['supply-select-all',true],['supply-select-none',false]])byId(id).onclick=()=>{document.querySelectorAll('#supply-categories input').forEach(input=>{input.checked=checked;});changed();};
        byId('adm-shop-merchant').addEventListener('change',()=>load());
        byId('supply-reload').onclick=()=>{if(!cache.get(key(shopId()))?.dirty||confirm('重新读取会放弃本店未保存的配方，继续吗？'))load(true);};
        byId('supply-save').onclick=save;byId('supply-preview').onclick=preview;
        byId('supply-presets').onclick=replenish;
    }
    root.ShopSupply={read,filterPool,describe,setBusy,open(api,id,target){
        if(!defaults.length)defaults=root.getRestockPlan();
        const changed=actor!==id;client=api;actor=id;getTarget=target;
        if(changed||!ready||loaded!==shopId())return load();
    }};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(globalThis);
