(function(root){
    'use strict';
    const IDLE_DELAY=60000,CHAIN_DELAY=30000,CLICK_DELAY=8000;
    const visits=new Set();
    let context,idleTimer,searchTimer,leaveTimer,lastActivity=0;
    const section=()=>document.getElementById('shop-section');
    function account(){return typeof viewingUserId==='undefined'?null:viewingUserId;}
    function paint(){
        if(!context)return;
        const node=document.getElementById('shop-keeper-greeting');
        if(node)node.textContent=root.ShopMerchants.line(context.line,0,'',context.shopId);
        if(section())section().dataset.dialogueKey=context.line;
    }
    function say(line){if(context){context.line=line;paint();}}
    function activity(){
        clearTimeout(idleTimer);lastActivity=Date.now();
        if(!context||document.hidden||!section()?.classList.contains('active'))return;
        idleTimer=setTimeout(()=>{if(context&&!root.ShopMerchants.isBusy()&&!document.querySelector('.shop-item-dialog[open]'))say('idle');},IDLE_DELAY);
    }
    function leave(showNotice){
        clearTimeout(idleTimer);clearTimeout(searchTimer);
        if(!context)return;
        say('leave');
        if(showNotice&&!document.hidden){
            let notice=document.getElementById('shop-departure-notice');
            if(!notice){notice=document.createElement('div');notice.id='shop-departure-notice';notice.setAttribute('role','status');document.body.append(notice);}
            const merchant=root.ShopMerchants.merchants.find(item=>item.id===context.shopId);
            notice.textContent=merchant.keeper+'：'+root.ShopMerchants.line('leave',0,'',context.shopId);notice.hidden=false;
            clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{notice.hidden=true;},3000);
        }
        context=null;
    }
    function sync(){
        const active=section()?.classList.contains('active'),id=account(),shopId=root.ShopMerchants.current().id;
        if(!active||!id){leave(!active);return;}
        if(context?.accountId===id&&context.shopId===shopId)return;
        leave(false);
        const notice=document.getElementById('shop-departure-notice');if(notice)notice.hidden=true;
        const key='helios-shop-visited:'+id+':'+shopId;
        let returning=visits.has(key);
        try{returning=returning||localStorage.getItem(key)==='1';localStorage.setItem(key,'1');}catch{/* Per-browser visit memory is optional. */}
        visits.add(key);
        context={accountId:id,shopId,line:returning?'return':'welcome',clicks:0,views:0,purchases:0};paint();activity();
    }
    function record(type,detail={}){
        sync();
        if(!context||(detail.shopId&&detail.shopId!==context.shopId)||(detail.accountId&&detail.accountId!==context.accountId))return;
        const now=Date.now(),key=String(detail.itemKey??detail.itemName??'');
        if(type!=='search_empty'&&type!=='search_results'){
            activity();if(type!=='portrait')context.clicks=0;
        }
        if(type==='portrait'){
            context.clicks=now-(context.lastClick||0)<=CLICK_DELAY?context.clicks+1:1;context.lastClick=now;
            say(context.clicks>=7?'click_7':context.clicks>=4?'click_4':context.clicks>=2?'click_2':'click');
        }else if(type==='details'){
            context.views=context.viewKey===key?context.views+1:1;context.viewKey=key;
            if(context.bought?.key===key&&!context.bought.asked&&now-context.bought.at<60000){context.bought.asked=true;say('viewed_bought');}
            else say(context.views>=6?'details_6':context.views>=3?'details_3':'details');
        }else if(type==='purchased'){
            context.purchases=now-(context.lastPurchase||0)<=CHAIN_DELAY?context.purchases+1:1;context.lastPurchase=now;
            context.bought={key,at:now,asked:false};context.views=0;context.viewKey=null;context.outCount=0;context.fundsCount=0;
            say(context.purchases>=2?'purchased_many':'purchased');
        }else if(type==='sold_out'){
            context.outCount=context.outKey===key&&now-(context.lastOut||0)<=CHAIN_DELAY?context.outCount+1:1;
            context.outKey=key;context.lastOut=now;say(context.outCount>=2?'sold_out_repeat':'sold_out');
        }else if(type==='insufficient'){
            const balance=String(detail.balance??'unknown');
            context.fundsCount=context.balance===balance&&now-(context.lastFunds||0)<=CHAIN_DELAY?context.fundsCount+1:1;
            context.balance=balance;context.lastFunds=now;say(context.fundsCount>=2?'insufficient_repeat':'insufficient');
        }else if(type==='search_empty'){
            clearTimeout(searchTimer);const previous=context;
            searchTimer=setTimeout(()=>{if(context===previous&&context.emptyQuery!==detail.query){context.emptyQuery=detail.query;say('empty');}},350);
        }else if(type==='search_results'){
            clearTimeout(searchTimer);context.emptyQuery=null;
        }else if(type==='sold'||type==='cancelled'){
            if(type==='cancelled')context.purchases=0;
            say(type);
        }
    }
    function mount(){
        const node=section();if(!node)return;
        node.querySelector('.shop-keeper-portrait').addEventListener('click',()=>record('portrait'));
        for(const type of ['pointerdown','keydown','input','change'])node.addEventListener(type,event=>{
            if(context&&!event.target.closest('.shop-keeper-portrait'))context.clicks=0;activity();
        },{passive:true});
        node.addEventListener('pointermove',()=>{if(Date.now()-lastActivity>1000)activity();},{passive:true});
        for(const type of ['wheel','touchmove'])node.addEventListener(type,()=>{if(Date.now()-lastActivity>1000)activity();},{passive:true});
        document.addEventListener('shop:interaction',event=>record(event.detail.type,event.detail));
        document.addEventListener('shop:purchase-completed',event=>record('purchased',event.detail));
        document.addEventListener('shop:sale-completed',event=>record('sold',event.detail));
        document.addEventListener('shop:account-changed',sync);
        new MutationObserver(sync).observe(node,{attributes:true,attributeFilter:['class','data-merchant']});
        document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(idleTimer);clearTimeout(searchTimer);}else activity();});
        document.addEventListener('close',activity,true);
        window.addEventListener('pagehide',()=>leave(false));window.addEventListener('pageshow',sync);
        root.ShopMerchants.dialoguesReady().then(paint);sync();
    }
    root.ShopDialogue={sync,record,IDLE_DELAY};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(globalThis);
