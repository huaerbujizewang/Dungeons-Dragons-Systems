(function(root){
    'use strict';
    const carts=new Map();let context;
    const money=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2})+' GP';
    const key=(account,shop)=>'helios-shop-cart-v1:'+account+':'+shop;
    function state(account,shop){
        const id=key(account,shop);
        if(!carts.has(id)){
            let saved;try{saved=JSON.parse(localStorage.getItem(id)||sessionStorage.getItem(id));}catch{/* Optional draft. */}
            carts.set(id,{lines:Array.isArray(saved?.lines)?saved.lines:[],pending:saved?.pending||null});
        }
        return carts.get(id);
    }
    function save(account,shop){const value=JSON.stringify(state(account,shop));try{localStorage.setItem(key(account,shop),value);sessionStorage.removeItem(key(account,shop));}catch{try{sessionStorage.setItem(key(account,shop),value);}catch{/* In-memory draft remains available. */}}refresh();}
    function balancePanel(){
        const node=document.createElement('div');node.className='shop-balance-summary';node.setAttribute('aria-live','polite');
        function update(total,balance){
            node.replaceChildren();if(balance==null||!Number.isFinite(Number(balance)))return true;
            const after=Math.round((Number(balance)-total)*100)/100;
            for(const [label,value] of [['当前余额',balance],['实际支付',total],['交易后余额',after]]){
                const row=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('b');name.textContent=label;amount.textContent=money(value);row.append(name,amount);node.append(row);
            }
            if(after<0){const warning=document.createElement('p');warning.textContent='余额不足，还差 '+money(-after);node.append(warning);}return after>=0;
        }
        return {node,update};
    }
    function balance(){return context?.balance?.();}
    function quantityPicker(value=1,onChange=()=>{},max=1000000){
        const node=document.createElement('div');node.className='shop-quantity-picker';
        node.innerHTML='<button type="button" data-minus aria-label="减少数量" title="减少数量">−</button><input type="number" min="1" step="1" aria-label="购买数量"><button type="button" data-plus aria-label="增加数量" title="增加数量">+</button>';
        const input=node.querySelector('input');input.max=max;input.value=value;
        function valid(){return Number.isInteger(Number(input.value))&&Number(input.value)>=1&&Number(input.value)<=max;}
        function changed(){input.setCustomValidity(valid()?'':'请输入1至'+max+'的整数');onChange(valid()?Number(input.value):null);}
        node.querySelector('[data-minus]').onclick=()=>{input.value=Math.max(1,(Number(input.value)||1)-1);changed();};
        node.querySelector('[data-plus]').onclick=()=>{input.value=Math.min(max,(Number(input.value)||0)+1);changed();};input.oninput=changed;
        return {node,value:()=>valid()?Number(input.value):null,input};
    }
    function payload(lines){return lines.map(row=>({item_id:Number(row.item_id),base_item_id:row.base_item_id==null?null:Number(row.base_item_id),quantity:Number(row.quantity),expected_unit_price:Number(row.unit_price)}));}
    function add(account,shop,row){
        const draft=state(account,shop);
        if(draft.pending)throw Error('有待确认的交易，请先打开购物车重试确认。');
        const existing=draft.lines.find(line=>line.item_id===row.item_id&&line.base_item_id===row.base_item_id);
        if(existing){if(existing.quantity+row.quantity>1000000)throw Error('单项数量不能超过1000000');Object.assign(existing,row,{quantity:existing.quantity+row.quantity});}
        else {if(draft.lines.length>=100)throw Error('购物车最多100项');draft.lines.push(row);}
        save(account,shop);
    }
    function refresh(){
        const button=document.getElementById('shop-cart-button');if(!button||!context)return;
        const account=context.account();if(!account){button.disabled=true;return;}
        const shop=ShopMerchants.current().id,draft=state(account,shop);
        button.disabled=ShopMerchants.isBusy();
        button.querySelector('[data-cart-count]').textContent=draft.pending?'待确认':String(draft.lines.reduce((sum,row)=>sum+Number(row.quantity),0));
    }
    function choose(item,price,merchant){
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');dialog.className='shop-purchase-dialog shop-cart-quantity-dialog';dialog.dataset.merchant=merchant.id;
            dialog.setAttribute('aria-label','确认购买');
            dialog.innerHTML='<header><h2>确认购买</h2><button type="button" data-close aria-label="关闭">×</button></header><p class="shop-confirm-merchant"></p><h3></h3><p data-unit></p><label class="shop-cart-quantity-label">数量</label><p data-amount></p><p class="shop-cart-grand-total"></p><footer><button type="button" data-cancel>取消</button><button type="button" data-add>加入购物车</button><button type="button" data-confirm>立即购买</button></footer>';
            const pack=Number(item.inventory_units_per_sale||item.ammunition_pack_size)||1,label=item.inventory_unit_label||'件';let selection=null;
            const summary=balancePanel();dialog.querySelector('footer').before(summary.node);
            dialog.querySelector('.shop-confirm-merchant').textContent=merchant.name;
            dialog.querySelector('h3').textContent=item.name;dialog.querySelector('[data-unit]').textContent=money(price)+' / '+(pack>1?pack+label:'件');
            const picker=quantityPicker(1,qty=>{
                dialog.querySelectorAll('[data-add],[data-confirm]').forEach(button=>button.disabled=!qty);
                dialog.querySelector('[data-amount]').textContent=qty&&pack>1?'入包 '+qty*pack+' '+label:'';
                dialog.querySelector('.shop-cart-grand-total').textContent=qty?money(Math.round(price*100)*qty/100):'—';
                const affordable=summary.update(qty?Math.round(price*100)*qty/100:0,balance());dialog.querySelector('[data-confirm]').disabled=!qty||!affordable;
            },item.unlimited_stock?1000000:Math.min(1000000,Number(item.stock)));
            dialog.querySelector('.shop-cart-quantity-label').append(picker.node);
            dialog.querySelector('.shop-cart-grand-total').textContent=money(price);dialog.querySelector('[data-amount]').textContent=pack>1?'入包 '+pack+' '+label:'';
            dialog.querySelector('[data-confirm]').disabled=!summary.update(price,balance());
            function accept(action){const qty=picker.value();if(!qty)return;selection={action,quantity:qty,pack_size:pack,inventory_unit_label:label};dialog.close();}
            dialog.querySelector('[data-add]').onclick=()=>accept('cart');dialog.querySelector('[data-confirm]').onclick=()=>accept('buy');
            dialog.querySelector('[data-close]').onclick=dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
            dialog.addEventListener('close',()=>{dialog.remove();resolve(selection);},{once:true});
            document.getElementById('shop-section').append(dialog);dialog.showModal();
        });
    }
    async function pay(client,account,shop,lines,fromCart=false){
        const draft=state(account,shop),requestLines=payload(lines);
        if(draft.pending&&JSON.stringify(draft.pending.lines)!==JSON.stringify(requestLines))throw Error('有待确认的交易，请先在购物车重试确认。');
        if(!draft.pending){draft.pending={key:crypto.randomUUID(),lines:requestLines,fromCart,display:lines};save(account,shop);}
        let response;
        try{response=await client.rpc('checkout_shop_cart',{p_user_id:account,p_shop_id:shop,p_lines:draft.pending.lines,p_request_key:draft.pending.key});}
        catch(error){throw Error('网络中断，交易结果尚未确认。请打开购物车重试确认，不要重复购买。');}
        if(response?.error){
            const error=response.error;
            if(/^[0-9A-Z]{5}$|^PGRST\d{3}$/.test(error.code||'')){draft.pending=null;save(account,shop);}
            throw error;
        }
        if(!response?.data?.lines)throw Error('交易结果尚未确认，请打开购物车重试确认。');
        if(draft.pending.fromCart)draft.lines=[];draft.pending=null;save(account,shop);return response.data;
    }
    async function open(){
        if(!context||ShopMerchants.isBusy())return;
        const account=context.account(),merchant=ShopMerchants.current(),draft=state(account,merchant.id);if(!account)return;
        if(!ShopMerchants.setBusy(true))return;
        const dialog=document.createElement('dialog');dialog.className='shop-purchase-dialog shop-cart-dialog';dialog.dataset.merchant=merchant.id;
        dialog.setAttribute('aria-label','购物车');
        dialog.innerHTML='<header><h2>购物车</h2><button type="button" data-close aria-label="关闭">×</button></header><p class="shop-confirm-merchant"></p><div class="shop-cart-lines"></div><p role="status"></p><div class="shop-cart-grand-total"></div><footer><button type="button" data-cancel>继续选购</button><button type="button" data-confirm disabled>结算</button></footer>';
        dialog.querySelector('.shop-confirm-merchant').textContent=merchant.name;
        const list=dialog.querySelector('.shop-cart-lines'),status=dialog.querySelector('[role=status]'),confirm=dialog.querySelector('[data-confirm]');let closed=false,generation=0;
        const summary=balancePanel();dialog.querySelector('footer').before(summary.node);
        const recover=document.createElement('button');recover.type='button';recover.textContent='查询上次交易结果';recover.hidden=!draft.pending;confirm.before(recover);
        recover.onclick=async()=>{
            if(!draft.pending)return;recover.disabled=true;status.textContent='正在查询交易结果…';
            try{
                const {data,error}=await context.client().rpc('get_shop_transaction',{p_account_id:account,p_request_key:draft.pending.key});if(error)throw error;
                if(closed||account!==context.account())return;
                if(data.status!=='completed'){status.textContent='尚未找到已完成交易，可用原交易编号重试确认。';return;}
                if(draft.pending.fromCart)draft.lines=[];draft.pending=null;save(account,merchant.id);
                await context.completed(data.receipt,merchant,account);dialog.close();
            }catch(error){status.textContent=error.message||'查询失败，请稍后重试';}finally{recover.disabled=false;}
        };
        dialog.querySelector('[data-close]').onclick=dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
        dialog.addEventListener('cancel',event=>{if(dialog.dataset.sending==='true')event.preventDefault();});
        dialog.addEventListener('close',()=>{closed=true;dialog.remove();ShopMerchants.setBusy(false);refresh();},{once:true});
        document.getElementById('shop-section').append(dialog);dialog.showModal();
        async function updateQuote(){
            const token=++generation;confirm.disabled=true;
            recover.hidden=!draft.pending;
            if(draft.pending){status.textContent='上次交易结果待确认，请重试确认。';confirm.textContent='重试确认';confirm.disabled=false;return;}
            if(!draft.lines.length){status.textContent='购物车为空';dialog.querySelector('.shop-cart-grand-total').textContent='';return;}
            status.textContent='正在核验价格与库存…';
            const {data,error}=await context.client().rpc('get_shop_cart_quote',{p_user_id:account,p_shop_id:merchant.id,p_lines:payload(draft.lines)});
            if(closed||token!==generation)return;
            if(account!==context.account())return dialog.close();
            if(error){status.textContent=error.message;return;}
            for(const line of draft.lines){const fresh=data.lines.find(row=>row.item_id===line.item_id&&row.base_item_id===line.base_item_id);if(fresh)Object.assign(line,fresh);}
            save(account,merchant.id);status.textContent='';dialog.querySelector('.shop-cart-grand-total').textContent='合计 '+money(data.total);confirm.disabled=!summary.update(data.total,data.balance_before??balance());
            list.querySelectorAll('[data-line-description]').forEach((node,n)=>{const line=draft.lines[n];node.textContent=Number(line.pack_size)>1?'每份'+line.pack_size+(line.inventory_unit_label||'发')+'，入包 '+line.quantity*line.pack_size+' '+(line.inventory_unit_label||'发'):money(line.unit_price)+' / 件';});
            list.querySelectorAll('[data-line-price]').forEach((node,n)=>node.textContent=money(draft.lines[n].line_total));
        }
        function render(){
            list.replaceChildren();const rows=draft.pending?.display||draft.lines;
            rows.forEach((line,index)=>{
                const row=document.createElement('div');row.className='shop-cart-line';
                const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small'),price=document.createElement('b'),remove=document.createElement('button');
                const description=qty=>Number(line.pack_size)>1?'每份'+line.pack_size+(line.inventory_unit_label||'发')+'，入包 '+qty*line.pack_size+' '+(line.inventory_unit_label||'发'):money(line.unit_price)+' / 件';
                title.textContent=line.item_name;detail.textContent=description(line.quantity);
                detail.dataset.lineDescription='';
                info.append(title,detail);price.dataset.linePrice='';price.textContent=money(Number(line.unit_price)*line.quantity);
                const picker=quantityPicker(line.quantity,qty=>{confirm.disabled=!qty;if(!qty)return;line.quantity=qty;save(account,merchant.id);detail.textContent=description(qty);updateQuote().catch(error=>status.textContent=error.message);});
                remove.type='button';remove.className='shop-cart-remove';remove.title=remove.ariaLabel='移除商品';remove.textContent='×';
                remove.onclick=()=>{draft.lines.splice(index,1);save(account,merchant.id);render();updateQuote().catch(error=>status.textContent=error.message);};
                if(draft.pending){picker.node.querySelectorAll('button,input').forEach(node=>node.disabled=true);remove.disabled=true;}
                row.append(info,picker.node,price,remove);list.append(row);
            });
        }
        confirm.onclick=async()=>{
            if(account!==context.account())return dialog.close();
            confirm.disabled=true;dialog.dataset.sending='true';dialog.querySelectorAll('button,input').forEach(node=>node.disabled=true);status.textContent='正在结算…';
            try{
                const receipt=await pay(context.client(),account,merchant.id,draft.pending?.display||draft.lines,true);
                await context.completed(receipt,merchant,account);dialog.close();
            }catch(error){
                context.failed?.(error,merchant,account,draft.pending?.display||draft.lines);
                status.textContent=error.message||'结算失败';dialog.dataset.sending='false';
                dialog.querySelectorAll('[data-close],[data-cancel]').forEach(node=>node.disabled=false);render();
                recover.hidden=!draft.pending;
                if(draft.pending){confirm.textContent='重试确认';confirm.disabled=false;}
                else {try{await updateQuote();}catch{/* Keep the checkout error visible. */}status.textContent=error.message||'结算失败';}
            }
        };
        render();try{await updateQuote();}catch(error){status.textContent=error.message;}
    }
    function configure(value){context=value;refresh();}
    document.addEventListener('shop:merchant-changed',refresh);
    root.ShopCart={configure,quantityPicker,choose,add,pay,open,refresh,state,balancePanel,balance};
})(globalThis);
