(function(root){
    'use strict';
    function template(item){
        const id=Number(item?.compendium_item_id);
        if(id>=431&&id<=433)return {kind:'weapon',bonus:id-430};
        if(id>=437&&id<=439)return {kind:'armor',bonus:id-436};
        if(id>=1109&&id<=1111)return {kind:'armor',bonus:id-1108};
        return null;
    }
    const money=value=>Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2})+' GP';
    function choose(client,accountId,item,merchant,profile){
        return new Promise((resolve,reject)=>{
            const info=template(item),dialog=document.createElement('dialog');
            dialog.className='shop-purchase-dialog shop-custom-equipment-dialog';
            dialog.dataset.merchant=merchant.id;
            dialog.setAttribute('aria-label','定制'+(info.kind==='armor'?'护甲':'武器'));
            dialog.innerHTML='<header><h2></h2><button type="button" data-close aria-label="关闭">×</button></header><p class="shop-confirm-merchant"></p><label class="shop-custom-search">基础装备<input type="search" placeholder="搜索装备名称" disabled></label><div class="shop-custom-options" role="radiogroup" aria-label="基础装备"></div><p class="shop-custom-message" role="status">正在读取可定制装备…</p><section class="shop-custom-quote" hidden><h3></h3><dl><div><dt>附魔费</dt><dd data-fee></dd></div><div><dt>基础装备补价</dt><dd data-base></dd></div><div class="shop-custom-total"><dt>合计</dt><dd data-total></dd></div></dl><p data-offer></p></section><footer><button type="button" data-cancel>取消</button><button type="button" data-confirm disabled>确认购买</button></footer>';
            dialog.querySelector('h2').textContent='定制'+(info.kind==='armor'?'护甲':'武器')+'+'+info.bonus;
            dialog.querySelector('.shop-confirm-merchant').textContent=merchant.name;
            const input=dialog.querySelector('input'),options=dialog.querySelector('.shop-custom-options'),message=dialog.querySelector('[role=status]'),confirm=dialog.querySelector('[data-confirm]');
            let selected=null,accepted=false,closed=false,rows=[];
            function select(row){
                selected=row;
                options.querySelectorAll('button').forEach(node=>node.setAttribute('aria-checked',String(Number(node.dataset.baseId)===Number(row.base_item_id))));
                dialog.querySelector('.shop-custom-quote').hidden=false;
                dialog.querySelector('h3').textContent=row.item_name;
                dialog.querySelector('[data-fee]').textContent=money(row.enchantment_price);
                dialog.querySelector('[data-base]').textContent=money(row.base_price);
                dialog.querySelector('[data-total]').textContent=money(row.total);
                dialog.querySelector('[data-offer]').textContent=row.crafter_discount?'巧匠八折：仅基础装备补价，不叠加特惠':row.promotion_discount_applied?'特惠：仅附魔费，不叠加巧匠':'';
                confirm.disabled=false;
            }
            function render(){
                const filtered=rows.filter(row=>row.base_name.toLocaleLowerCase().includes(input.value.trim().toLocaleLowerCase()));
                options.replaceChildren();
                for(const row of filtered){
                    const button=document.createElement('button');button.type='button';button.dataset.baseId=row.base_item_id;
                    button.setAttribute('role','radio');button.setAttribute('aria-checked',String(selected===row));
                    const name=document.createElement('span'),price=document.createElement('small');
                    name.textContent=row.base_name;price.textContent=money(row.base_list_price);
                    button.append(name,price);button.onclick=()=>select(row);options.append(button);
                }
                message.textContent=filtered.length?'':rows.length?'没有符合条件的装备。':'没有已启用来源的可定制装备。';
            }
            input.oninput=render;
            dialog.querySelector('[data-close]').onclick=dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
            confirm.onclick=()=>{if(selected){accepted=true;dialog.close();}};
            dialog.addEventListener('close',()=>{closed=true;dialog.remove();resolve(accepted?selected:null);},{once:true});
            document.getElementById('shop-section').append(dialog);dialog.showModal();
            const key=['equipment',accountId,merchant.id,item.id,item.price,item.discount_percent,profile?.has_crafter,item.stock].join(':');
            ShopLoading.get(client,key,async()=>{
                const {data,error}=await client.rpc('get_custom_equipment_options',{p_user_id:accountId,p_item_id:Number(item.id),p_shop_id:merchant.id});
                if(error)throw error;return data;
            },30000).then(data=>{
                if(closed)return;rows=Array.isArray(data)?data:[];input.disabled=false;render();
            }).catch(error=>{
                if(closed)return;
                message.textContent=['PGRST202','42883'].includes(error.code)?'请先安装 shop_custom_equipment.sql。':error.message||'读取失败，请稍后重试。';
            });
        });
    }
    root.ShopCustomEquipment={template,choose};
})(globalThis);
