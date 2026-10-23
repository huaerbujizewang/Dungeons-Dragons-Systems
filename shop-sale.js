(function(root){
    'use strict';
    function choose({name,unitPrice,quantity,unitLabel='件',currency='GP',merchant}){
        unitPrice=Math.round(Number(unitPrice)*100)/100;
        if(!Number.isSafeInteger(quantity)||quantity<1||!(unitPrice>0))return Promise.resolve(null);
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');
            dialog.className='shop-purchase-dialog shop-sale-dialog';dialog.dataset.merchant=merchant.id;
            dialog.setAttribute('aria-label','批量出售');
            dialog.innerHTML='<header><h2>批量出售</h2><button type="button" data-close aria-label="关闭">×</button></header><p class="shop-confirm-merchant"></p><h3></h3><p data-unit></p><label class="shop-sale-quantity">出售数量<input type="number" min="1" step="1" inputmode="numeric" aria-label="出售数量"></label><input type="range" min="1" step="1" aria-label="拖动选择出售数量"><div class="shop-sale-range-labels"><span>1</span><button type="button" data-all>全部出售</button><span data-max></span></div><p data-remaining></p><p class="shop-sale-total" aria-live="polite"></p><p data-error role="status"></p><footer><button type="button" data-cancel>取消</button><button type="button" data-confirm>确认出售</button></footer>';
            const money=value=>Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+currency;
            const number=dialog.querySelector('[type=number]'),range=dialog.querySelector('[type=range]'),confirm=dialog.querySelector('[data-confirm]');
            number.max=range.max=quantity;number.value=range.value=1;let selected=null;
            dialog.querySelector('.shop-confirm-merchant').textContent=merchant.name;
            dialog.querySelector('h3').textContent=name;
            dialog.querySelector('[data-unit]').textContent='回收单价 '+money(unitPrice)+' / '+unitLabel;
            dialog.querySelector('[data-max]').textContent=quantity.toLocaleString('zh-CN')+' '+unitLabel;
            function update(value){
                const qty=Number(value),valid=String(value).trim()!==''&&Number.isSafeInteger(qty)&&qty>=1&&qty<=quantity;
                if(valid)range.value=qty;
                const total=valid?Math.round(unitPrice*qty*100)/100:0;
                confirm.disabled=!valid||total<=0;
                number.setCustomValidity(valid?'':'请输入1至'+quantity+'的整数');
                dialog.querySelector('[data-remaining]').textContent=valid?'持有 '+quantity+' '+unitLabel+' · 出售后剩余 '+(quantity-qty)+' '+unitLabel:'';
                dialog.querySelector('.shop-sale-total').textContent=valid?'预计收入 '+money(total):'—';
                dialog.querySelector('[data-error]').textContent=!valid?'请输入有效出售数量':total<=0?'合计不足最小货币单位，请增加数量。':'';
            }
            number.oninput=()=>update(number.value);
            range.oninput=()=>{number.value=range.value;update(range.value);};
            dialog.querySelector('[data-all]').onclick=()=>{number.value=quantity;update(quantity);};
            confirm.onclick=()=>{update(number.value);if(confirm.disabled)return;selected=Number(number.value);dialog.close();};
            dialog.querySelector('[data-close]').onclick=dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
            dialog.addEventListener('close',()=>{dialog.remove();resolve(selected);},{once:true});
            document.getElementById('shop-section').append(dialog);update(1);dialog.showModal();
        });
    }
    root.ShopSale={choose};
})(globalThis);
