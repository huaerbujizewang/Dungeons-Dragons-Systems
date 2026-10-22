(function(root){
    'use strict';
    let client,actor,getTarget,context='',rows=[],selected=new Set(),limit=60,busy=false,ready=false,generation=0,pending;
    const byId=id=>document.getElementById(id);
    const shopId=()=>byId('adm-shop-merchant').value;
    const scope=()=>byId('discount-scope').value;
    const target=()=>scope()==='public'?null:getTarget?.()||null;
    const contextKey=()=>[actor,shopId(),scope(),target()].join(':');
    const mode=()=>document.querySelector('input[name="discount-mode"]:checked').value;
    const money=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value)+' GP';
    function node(tag,text){const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;}
    function status(text){byId('discount-status').textContent=text;}
    function setBusy(value){
        busy=value;byId('discount-fields').disabled=value||!ready;byId('discount-reload').disabled=value;
        byId('adm-shop-merchant').disabled=value;byId('adm-user-list').disabled=value;
        byId('discount-scope').disabled=value;
    }
    function filtered(){
        const query=byId('discount-search').value.trim().toLocaleLowerCase();
        return rows.filter(item=>(!query||item.name.toLocaleLowerCase().includes(query))
            &&(!byId('discount-category').value||root.ShopShelf.classify(item)===byId('discount-category').value)
            &&(!byId('discount-rarity').value||item.rarity===byId('discount-rarity').value)
            &&(byId('discount-unlimited').checked||!item.unlimited_stock)
            &&(!byId('discount-available').checked||item.unlimited_stock||item.stock>0));
    }
    function selectionState(){
        const pool=filtered(),random=mode()==='random';
        byId('discount-counts').textContent=`筛选 ${pool.length} 件 · 已选 ${selected.size} 件`;
        const all=byId('discount-select-all');all.disabled=random||!pool.length;
        all.checked=!!pool.length&&pool.every(item=>selected.has(Number(item.id)));
        all.indeterminate=selected.size>0&&!all.checked;
        byId('discount-restore').disabled=!selected.size||busy;
        byId('discount-apply').disabled=busy||!pool.length||(!random&&!selected.size);
        byId('discount-apply').textContent=random?'随机抽取并打折':'应用折扣';
        byId('discount-count-label').hidden=!random;
    }
    function render(){
        const pool=filtered(),body=byId('discount-items');body.replaceChildren();
        for(const item of pool.slice(0,limit)){
            const row=node('tr'),cell=node('td'),input=node('input');input.type='checkbox';input.checked=selected.has(Number(item.id));
            input.disabled=mode()==='random';input.setAttribute('aria-label','选择 '+item.name);
            input.onchange=()=>{input.checked?selected.add(Number(item.id)):selected.delete(Number(item.id));selectionState();};cell.append(input);row.append(cell);
            const name=node('td'),title=node('strong',item.name),detail=node('small',(item.user_id?'特供':'公共')+' · '+root.ShopShelf.label(root.ShopShelf.classify(item)));
            name.append(title,detail);row.append(name,node('td',item.unlimited_stock?'不限量':String(item.stock||0)),node('td',money(item.price)),
                node('td',Number(item.discount_percent??100)/10+'折'),node('td',money(root.ShopMerchants.purchasePrice(item,null))));body.append(row);
        }
        if(!pool.length){const row=node('tr'),cell=node('td','没有符合条件的商品');cell.colSpan=6;row.append(cell);body.append(row);}
        byId('discount-more').hidden=pool.length<=limit;selectionState();
    }
    async function load(force=false){
        if(!client||busy)return;
        const key=contextKey();
        if(pending?.key===key&&pending.token===generation)return pending.promise;
        if(!force&&ready&&context===key)return;
        const token=++generation,id=shopId(),range=scope(),account=target();
        ready=false;byId('discount-fields').disabled=true;byId('discount-reload').disabled=true;selected.clear();rows=[];context='';
        byId('discount-items').replaceChildren();byId('discount-result').textContent='';status('读取商品中…');
        const promise=Promise.resolve().then(async()=>{
            try{
                if(range!=='public'&&!account)throw Error('请先选择特供玩家');
                const data=[];
                for(let start=0;;start+=1000){
                    let query=client.from('shop_items').select('*').eq('shop_id',id);
                    if(range==='public')query=query.is('user_id',null);
                    else if(range==='private')query=query.eq('user_id',account);
                    else query=query.or(`user_id.is.null,user_id.eq.${account}`);
                    const result=await query.order('id').range(start,start+999);if(result.error)throw result.error;
                    data.push(...(result.data||[]));if(!result.data||result.data.length<1000)break;
                }
                const masters=await root.CompendiumIdentity.lookupMany(client,data);
                if(token!==generation||key!==contextKey())return;
                rows=data.map(item=>({...masters.get(root.CompendiumIdentity.key(item)),...item}));
                rows.sort((a,b)=>a.name.localeCompare(b.name,'zh-Hans-CN-u-co-pinyin')||Number(a.id)-Number(b.id));
                context=key;ready=true;limit=60;render();status(`已读取 ${rows.length} 件商品`);
            }catch(error){if(token===generation)status('读取失败：'+error.message);}
            finally{if(token===generation){byId('discount-fields').disabled=!ready;byId('discount-reload').disabled=false;}if(pending?.promise===promise)pending=null;}
        });
        pending={key,promise,token};return promise;
    }
    async function apply(restore=false){
        if(busy||!ready||context!==contextKey())return;
        const rate=Number(byId('discount-rate').value),percent=restore?100:Math.round(rate*1000)/100;
        const random=!restore&&mode()==='random';
        const ids=random?filtered().map(item=>Number(item.id)):[...selected];
        const count=random?Number(byId('discount-count').value):ids.length;
        if(!restore&&(!Number.isFinite(rate)||rate<0.1||rate>10))return status('折数必须在0.1至10之间');
        if(!ids.length||ids.length>5000)return status('请选择1至5000件商品，可使用类型或名称缩小范围');
        if(!Number.isInteger(count)||count<1||count>ids.length)return status('随机数量必须为正整数，且不能超过候选商品数量');
        const id=shopId(),range=scope(),account=target(),key=context;
        const merchant=root.ShopMerchants.merchants.find(item=>item.id===id).name;
        if(!confirm(`${merchant} · ${range==='public'?'公共商品':range==='private'?'当前玩家特供':'当前玩家可见商品'}\n${random?'从 '+ids.length+' 件中随机抽取 ': '已选 '}${count} 件\n${restore?'恢复原价（取消促销）':'设置为 '+percent/10+' 折'}，确认吗？`))return;
        setBusy(true);status('正在设置折扣…');
        try{
            const {data,error}=await client.rpc('set_shop_discounts',{p_shop_id:id,p_item_ids:ids,p_discount_percent:percent,p_scope:range,p_target_user_id:account,p_random_count:random?count:null});
            if(error)throw error;if(!data||!Array.isArray(data.items))throw Error('未收到有效结果，请重新读取确认');
            if(key===contextKey()){
                selected=new Set(data.items.map(item=>Number(item.id)));
                const changed=new Map(data.items.map(item=>[Number(item.id),item.discount_percent]));
                rows=rows.map(item=>changed.has(Number(item.id))?{...item,discount_percent:changed.get(Number(item.id))}:item);
                render();byId('discount-result').textContent=`已${restore?'恢复原价':'设置折扣'} ${data.updated} 件：`+data.items.map(item=>item.name).join('、');
                status('设置完成');
            }
            root.ShopLoading.invalidate(client,'stock:');
            if(typeof root.refreshShopView==='function')root.refreshShopView();
        }catch(error){status('设置失败：'+(['PGRST202','42883'].includes(error.code)?'请先执行 shop_discounts.sql':error.message));}
        finally{setBusy(false);selectionState();}
    }
    function mount(){
        if(!byId('shop-discount-panel'))return;
        for(const category of root.ShopShelf.categories.filter(item=>item.id!=='all'))byId('discount-category').append(new Option(category.label,category.id));
        byId('shop-discount-panel').addEventListener('toggle',()=>{if(byId('shop-discount-panel').open)load();});
        byId('discount-reload').onclick=()=>load(true);
        for(const id of ['discount-category','discount-rarity','discount-search','discount-unlimited','discount-available']){
            byId(id).addEventListener(id==='discount-search'?'input':'change',()=>{selected.clear();limit=60;render();});
        }
        document.querySelectorAll('input[name="discount-mode"]').forEach(input=>input.onchange=()=>{selected.clear();render();});
        for(const id of ['adm-shop-merchant','adm-user-list','discount-scope'])byId(id).addEventListener('change',()=>{
            generation++;ready=false;selected.clear();rows=[];context='';byId('discount-fields').disabled=true;
            if(byId('shop-discount-panel').open)load();
        });
        byId('discount-select-all').onchange=()=>{selected=byId('discount-select-all').checked?new Set(filtered().map(item=>Number(item.id))):new Set();render();};
        byId('discount-more').onclick=()=>{limit+=60;render();};
        byId('discount-apply').onclick=()=>apply();byId('discount-restore').onclick=()=>apply(true);
    }
    root.ShopDiscounts={open(api,id,targetGetter){
        if(actor!==id||client!==api){generation++;ready=false;context='';}
        client=api;actor=id;getTarget=targetGetter;if(byId('shop-discount-panel')?.open)return load();
    }};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(globalThis);
