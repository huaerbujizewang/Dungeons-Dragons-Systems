(function(root){
    'use strict';
    const money=value=>Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' GP';
    function node(tag,text,className){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;}
    async function open({client,account,shop=null,onRefund}){
        if(document.querySelector('.shop-orders-dialog[open]'))return;
        const previous=document.activeElement,dialog=node('dialog',null,'shop-orders-dialog');dialog.setAttribute('aria-labelledby','shop-orders-title');
        const header=node('header'),title=node('h2','交易记录与退货');title.id='shop-orders-title';
        const close=node('button','×');close.type='button';close.ariaLabel='关闭交易记录';close.onclick=()=>dialog.close();header.append(title,close);
        const controls=node('div',null,'shop-orders-controls'),filter=node('select');filter.ariaLabel='交易所属商店';
        for(const [value,label] of [['','全部商店'],['moon','满月杂货铺'],['lemonia','莱蒙尼亚商社']]){const opt=node('option',label);opt.value=value;filter.append(opt);}
        filter.value=shop||'';
        const refresh=node('button','刷新记录');refresh.type='button';controls.append(filter,refresh);
        const status=node('p');status.setAttribute('role','status');
        const list=node('div',null,'shop-orders-list'),more=node('button','加载更早记录');more.type='button';more.hidden=true;
        const policy=node('p','30分钟内支持整笔退货，需退回订单全部数量，按原成交价退款。缺少可信快照的旧订单请联系DM。','shop-orders-policy');
        dialog.append(header,controls,policy,status,list,more);document.body.append(dialog);
        let cursor=null,generation=0,closed=false,busy=false,selectedShop=filter.value;
        dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
        dialog.addEventListener('close',()=>{closed=true;generation++;dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});},{once:true});
        function locked(value){busy=value;dialog.querySelectorAll('button,select').forEach(el=>el.disabled=value);}
        async function refund(order){
            if(busy)return;
            if(!confirm('撤回订单 #'+order.id+'？\n退回 '+order.item_name+' ×'+order.inventory_quantity+'，退还 '+money(order.price_paid)+'。'))return;
            const key='helios-shop-refund:'+account+':'+order.id;let requestKey;
            try{requestKey=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,requestKey);}catch{requestKey=crypto.randomUUID();}
            locked(true);status.textContent='正在提交退货…';
            try{
                const {data,error}=await client.rpc('refund_shop_order',{p_account_id:account,p_order_id:order.id,p_request_key:requestKey});
                if(error)throw error;
                try{localStorage.removeItem(key);}catch{/* The order is also idempotent on the server. */}
                status.textContent='订单 #'+order.id+' 已退货，退还 '+money(data.amount)+'。';
                try{await onRefund?.(data);}catch{status.textContent+=' 交易已完成，界面刷新失败，可手动刷新。';}
                locked(false);await load(false,true);
            }catch(error){status.textContent=(error.message||'未收到退货结果')+'；可用同一订单重试确认，服务器不会重复退款。';locked(false);}
        }
        function render(order){
            const row=node('article',null,'shop-order-row'),name=node('h3',order.item_name),meta=node('p');
            const label=order.order_snapshot?.inventory_unit_label||'件';
            meta.textContent='#'+order.id+' · '+({moon:'满月杂货铺',lemonia:'莱蒙尼亚商社'}[order.shop_id]||'旧订单')+' · '+new Date(order.created_at).toLocaleString();
            const amount=node('p',money(order.price_paid),'shop-order-amount');
            const count=node('p',order.inventory_quantity!=null?'实际数量 '+order.inventory_quantity+' '+label+' · 购买 '+order.quantity+(order.inventory_quantity>order.quantity?' 份':' 件'):'旧订单 · 数量快照不完整');
            const state=node('p',order.status==='refunded'?'已退货':order.refundable?'可退货至 '+new Date(order.refund_deadline).toLocaleTimeString():order.order_snapshot?'已超过期限或不可退货':'旧订单，请联系DM');
            row.append(name,meta,count,amount,state);
            if(order.refundable){const button=node('button','整笔退货');button.type='button';button.onclick=()=>refund(order);row.append(button);}
            list.append(row);
        }
        async function load(append=false,keepStatus=false){
            if(busy)return;const token=++generation;locked(true);if(!keepStatus)status.textContent='正在读取交易记录…';more.hidden=true;
            if(!append){cursor=null;list.replaceChildren();}
            try{
                const {data,error}=await client.rpc('get_shop_orders',{p_account_id:account,p_shop_id:selectedShop||null,p_before_id:append?cursor:null});
                if(closed||token!==generation)return;if(error)throw error;
                data.items.forEach(render);cursor=data.next_cursor;more.hidden=!data.has_more;
                if(!keepStatus)status.textContent=list.children.length?'已显示 '+list.children.length+' 条交易记录。':'暂无交易记录';
            }catch(error){if(!closed&&token===generation)status.textContent='读取失败：'+(error.message||'请检查网络')+'，可点击刷新记录重试。';}
            finally{if(!closed&&token===generation)locked(false);}
        }
        filter.onchange=()=>{selectedShop=filter.value;load();};refresh.onclick=()=>load();more.onclick=()=>load(true);
        dialog.showModal();await load();
    }
    root.ShopOrders={open};
})(globalThis);
