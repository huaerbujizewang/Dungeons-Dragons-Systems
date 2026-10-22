(function (root) {
    'use strict';
    const merchants = [
        { id:'moon', name:'满月杂货铺', keeper:'露娜·赫丝', subtitle:'FULL MOON GENERAL STORE', catalogSubtitle:'THE MOONLIT COLLECTION', catalog:'今夜的货架', sellCatalog:'旅途的收获',
            normal:'商城系统素材/一般立绘睁眼.png', blink:'商城系统素材/一般立绘闭眼.png',
            smile:'商城系统素材/微笑立绘睁眼.png', smileBlink:'商城系统素材/微笑立绘闭眼.png' },
        { id:'lemonia', name:'莱蒙尼亚商社', keeper:'艾诺·维斯塔', subtitle:'LEMONIA TRADING COMPANY', catalogSubtitle:'THE LEMONIA CATALOGUE', catalog:'商社商品目录', sellCatalog:'商社收购目录',
            normal:'商城系统素材/莱蒙尼亚商社立绘睁眼.png', blink:'商城系统素材/莱蒙尼亚商社立绘闭眼.png' }
    ];
    let selected='moon', busy=false, dialogues, dialoguePromise;
    try { const saved=localStorage.getItem('helios-shop-merchant'); if(merchants.some(shop=>shop.id===saved))selected=saved; } catch { /* Optional local preference. */ }
    function current(){return merchants.find(shop=>shop.id===selected);}
    function purchaseOffer(item,profile){
        const cents=Math.round(Number(item.price)*100);
        const promotionPercent=Number(item.discount_percent??100);
        const crafterApplied=profile?.has_crafter===true && item.is_nonmagical===true && promotionPercent>80;
        const effectivePercent=crafterApplied?80:promotionPercent;
        const price=Number((BigInt(cents)*BigInt(Math.round(effectivePercent*100))+5000n)/10000n)/100;
        return {price,promotionPercent,effectivePercent,crafterApplied};
    }
    function purchasePrice(item,profile){return purchaseOffer(item,profile).price;}
    function refreshControls(){
        const section=document.getElementById('shop-section');
        if(section)section.dataset.merchant=selected;
        section?.querySelectorAll('[data-shop-merchant]').forEach(button=>{
            button.setAttribute('aria-pressed',String(button.dataset.shopMerchant===selected));
            button.disabled=busy;
        });
    }
    function select(id){
        if(busy||!merchants.some(shop=>shop.id===id)||id===selected)return false;
        selected=id;
        try{localStorage.setItem('helios-shop-merchant',id);}catch{/* Optional local preference. */}
        refreshControls();
        status('');
        document.dispatchEvent(new CustomEvent('shop:merchant-changed',{detail:{shopId:id}}));
        return true;
    }
    function setBusy(value){
        if(value&&busy)return false;
        busy=!!value;refreshControls();return true;
    }
    function status(text){
        const node=document.getElementById('shop-transaction-status');
        if(node)node.textContent=text;
    }
    function signal(type,detail={}){
        document.dispatchEvent(new CustomEvent('shop:interaction',{detail:{shopId:selected,...detail,type}}));
    }
    function confirmPurchase(itemName,price,merchant){
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');dialog.className='shop-purchase-dialog';dialog.dataset.merchant=merchant.id;
            dialog.setAttribute('aria-label','确认购买');
            dialog.innerHTML='<h2>确认购买</h2><p class="shop-confirm-merchant"></p><strong class="shop-confirm-item"></strong><p class="shop-confirm-price"></p><div><button type="button" data-cancel>取消</button><button type="button" data-confirm>确认购买</button></div>';
            dialog.querySelector('.shop-confirm-merchant').textContent=merchant.name;
            dialog.querySelector('.shop-confirm-item').textContent=itemName+' ×1';
            dialog.querySelector('.shop-confirm-price').textContent=price;
            let accepted=false;
            dialog.querySelector('[data-confirm]').onclick=()=>{accepted=true;dialog.close();};
            dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
            dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
            dialog.addEventListener('close',()=>{dialog.remove();resolve(accepted);},{once:true});
            document.getElementById('shop-section').append(dialog);dialog.showModal();
        });
    }
    function dialoguesReady(){
        if(!dialoguePromise)dialoguePromise=fetch('data/shop-dialogue.json',{cache:'no-cache'}).then(response=>{
            if(!response.ok)throw new Error('Dialogue unavailable');return response.json();
        }).then(value=>{dialogues=value;}).catch(()=>{});
        return dialoguePromise;
    }
    function line(event,index=0,item='',shopId=selected){
        const options=dialogues?.[shopId]?.[event];
        const fallback={welcome:'欢迎光临。',return:'欢迎回来。',idle:'请慢慢挑选。',click:'有什么事吗？',details:'请查看商品资料。',purchased:'交易完成，感谢惠顾。',cancelled:'已取消交易。',sold:'出售已完成。',sold_out:'商品已售罄。',insufficient:'余额不足。',empty:'没有找到符合条件的商品。',leave:'感谢光临。'};
        return String(Array.isArray(options)&&options.length?options[index%options.length]:fallback[event]||fallback.welcome).replaceAll('{item}',String(item));
    }
    function mount(){
        document.querySelectorAll('[data-shop-merchant]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.shopMerchant)));
        refreshControls();dialoguesReady();
    }
    root.ShopMerchants={merchants,current,select,setBusy,isBusy:()=>busy,status,line,dialoguesReady,refreshControls,purchaseOffer,purchasePrice,signal,confirmPurchase};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(globalThis);
