(function(root){
    'use strict';
    let context,type='',rows=[],selected=null,generation=0,busy=false,limit=40;
    const byId=id=>document.getElementById(id);
    const magic=item=>!!item&&!item.is_nonmagical&&!item.source_metadata?.is_nonmagical
        &&!(Number(item.id)>=431&&Number(item.id)<=442)
        &&(['魔法物品','卷轴','药水','奇物','戒指','法杖','魔杖','权杖'].includes(item.category)
            ||item.source_metadata?.custom_equipment_variant===true
            ||(['武器','护甲','盾牌','弹药'].includes(item.category)&&['非普通','珍稀','极珍稀','传说','神器'].includes(item.rarity)));
    function render(){
        const target=byId('inventory-request-results');target.replaceChildren();
        const query=byId('inventory-request-search').value.trim().toLowerCase();
        const matches=rows.filter(row=>context.search(row.master).includes(query));
        for(const row of matches.slice(0,limit)){
            const button=document.createElement('button');button.type='button';button.className='inventory-request-result';
            button.disabled=context.accountId!==context.ownerId||busy;button.setAttribute('aria-pressed',String(selected===row));
            button.textContent=row.master.name+' · '+row.master.rarity+(type==='item_remove'?' · 持有 '+row.quantity:'');
            button.onclick=()=>{selected=row;byId('inventory-request-selected').textContent='已选：'+row.master.name;
                byId('inventory-request-quantity').max=type==='item_remove'?Math.min(row.quantity,1000000):1000000;
                byId('inventory-request-quantity').value=1;render();};target.append(button);
        }
        if(!matches.length)target.textContent='没有找到符合条件的魔法物品。';
        if(matches.length>limit){const more=document.createElement('button');more.type='button';more.textContent='显示更多（剩余 '+(matches.length-limit)+' 项）';more.onclick=()=>{limit+=40;render();};target.append(more);}
    }
    async function sync(next,options){
        context=options;
        const active=['item_add','item_remove'].includes(next),panel=byId('inventory-request-fields');panel.hidden=!active;
        if(!active){type=next;generation++;return;}
        const key=options.accountId+':'+next;
        if(panel.dataset.loaded===key&&type===next){render();return;}
        panel.dataset.loaded='';type=next;selected=null;rows=[];limit=40;
        byId('inventory-request-selected').textContent='尚未选择物品';byId('inventory-request-results').textContent='正在读取物品查询库…';
        byId('inventory-request-quantity').disabled=options.accountId!==options.ownerId;
        const token=++generation;
        try{
            let loaded;
            if(next==='item_add')loaded=(await options.catalog()).filter(magic).map(master=>({master}));
            else{
                const inventory=[];
                for(let offset=0;;offset+=1000){
                    const {data,error}=await options.client.from('user_inventory').select('*').eq('user_id',options.accountId).order('id').range(offset,offset+999);
                    if(error)throw error;inventory.push(...(data||[]));if((data||[]).length<1000)break;
                }
                const masters=await root.CompendiumIdentity.lookupMany(options.client,inventory);
                loaded=inventory.map(row=>({...row,master:masters.get(root.CompendiumIdentity.key(row))})).filter(row=>row.quantity>0&&magic(row.master));
            }
            if(token!==generation)return;
            rows=loaded;panel.dataset.loaded=key;render();
        }catch(error){if(token===generation)byId('inventory-request-results').textContent='查询失败：'+error.message;}
    }
    async function submit(options){
        if(busy||options.accountId!==options.ownerId)return;
        if(!selected||!byId('inventory-request-fields').dataset.loaded)return alert('请先查询并选择具体的魔法物品。');
        const quantity=Number(byId('inventory-request-quantity').value),title=byId('finance-request-title').value.trim(),note=byId('finance-request-note').value.trim();
        if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||(type==='item_remove'&&quantity>selected.quantity))return alert('请输入有效数量，且不能超过当前持有数量。');
        if(!title)return alert('请填写申请事项。');
        const action=type==='item_add'?'add':'remove';
        const request={p_action:action,p_item_id:selected.master.id,p_inventory_id:action==='remove'?selected.id:null,
            p_quantity:quantity,p_title:title,p_note:note};
        const fingerprint=JSON.stringify([options.accountId,request]),storage='inventory-request-key';let pending;
        try{pending=JSON.parse(sessionStorage.getItem(storage)||'null');}catch{}
        if(pending&&pending.fingerprint!==fingerprint)return alert('上一笔物品申请尚未确认，请使用原内容重试确认，避免重复提交。');
        if(!pending)pending={fingerprint,key:crypto.randomUUID()};sessionStorage.setItem(storage,JSON.stringify(pending));
        busy=true;const button=document.querySelector('#finance-request-panel .finance-request-submit');button.disabled=true;
        try{
            const {error}=await options.client.rpc('submit_inventory_change_request',{...request,p_request_key:pending.key});
            if(error){if(/^[0-9A-Z]{5}$/.test(error.code||'')||/^PGRST/.test(error.code||''))sessionStorage.removeItem(storage);throw error;}
            sessionStorage.removeItem(storage);byId('finance-request-title').value='';byId('finance-request-note').value='';
            try{await options.reload(options.ownerId);}catch(error){console.warn('物品申请已提交，账本刷新失败',error);}
            alert('物品申请已提交，等待 DM 审批；背包尚未变更。');
        }catch(error){alert('提交失败：'+(['42883','PGRST202'].includes(error.code)?'请运行 inventory_change_requests.sql':error.message));}
        finally{busy=false;button.disabled=false;}
    }
    document.addEventListener('DOMContentLoaded',()=>byId('inventory-request-search')?.addEventListener('input',()=>{limit=40;render();}));
    root.InventoryRequests={sync,submit,magic};
})(globalThis);
