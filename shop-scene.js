(function () {
    'use strict';
    function mount() {
        const section=document.getElementById('shop-section');
        if(!section||section.dataset.sceneMounted)return;
        section.dataset.sceneMounted='true';section.dataset.sceneRunning='false';
        const portrait=section.querySelector('.shop-keeper-portrait');
        const breath=section.querySelector('.shop-keeper-breath');
        const firstImage=section.querySelector('#shop-keeper-image');
        const motion=section.querySelector('#shop-scene-motion');
        const view=section.querySelector('#shop-scene-view');
        const reduced=matchMedia('(prefers-reduced-motion: reduce)');
        const cache=new Map();
        let activeId,mode=section.dataset.mode,inView=false,running=false,blinking=false,smiling=false;
        let blinkTimer,reopenTimer,expressionTimer,pointerFrame,manualView=0;
        try{motion.checked=localStorage.getItem('helios-shop-motion')!=='off';}catch{/* Optional local preference. */}
        function entry(){
            const merchant=ShopMerchants.current();
            if(!cache.has(merchant.id)){
                const normal=merchant.id==='moon'?firstImage:newFrame('normal',merchant.id);
                cache.set(merchant.id,{merchant,frames:new Map([['normal',normal]]),ready:new Set(),loaded:false,preloading:false});
            }
            return cache.get(merchant.id);
        }
        function newFrame(expression,shopId){
            const image=new Image();image.alt='';image.width=1024;image.height=1536;
            image.decoding='async';image.draggable=false;image.hidden=true;
            image.dataset.expression=expression;image.dataset.merchant=shopId;
            breath.append(image);return image;
        }
        function visible(){return inView&&section.classList.contains('active')&&!document.hidden;}
        function caption(){window.ShopDialogue?.sync();}
        function showExpression(){
            const state=entry();
            const wanted=smiling?(blinking?'smileBlink':'smile'):(blinking?'blink':'normal');
            const selected=state.ready.has(wanted)?wanted:'normal';
            for(const [shopId,store]of cache)for(const [name,image]of store.frames)image.hidden=shopId!==activeId||name!==selected;
            section.dataset.sceneExpression=selected;section.dataset.sceneFrames=String(state.ready.size);
        }
        function setPan(x,y=0){
            section.style.setProperty('--shop-pan-x',`${Math.max(-1,Math.min(1,x))*15}px`);
            section.style.setProperty('--shop-pan-y',`${Math.max(-1,Math.min(1,y))*7}px`);
        }
        function stop(){
            running=false;section.dataset.sceneRunning='false';
            clearTimeout(blinkTimer);clearTimeout(reopenTimer);clearTimeout(expressionTimer);cancelAnimationFrame(pointerFrame);
            blinking=false;smiling=false;showExpression();setPan(0);
        }
        function scheduleBlink(){
            clearTimeout(blinkTimer);
            if(!running||!entry().ready.has('blink'))return;
            blinkTimer=setTimeout(()=>{
                if(!running)return;blinking=true;showExpression();
                reopenTimer=setTimeout(()=>{blinking=false;showExpression();scheduleBlink();},130);
            },3200+Math.random()*4000);
        }
        async function preload(state){
            if(state.preloading||!visible()||!motion.checked||reduced.matches||activeId!==state.merchant.id)return;
            state.preloading=true;
            await Promise.all(['blink','smile','smileBlink'].filter(key=>state.merchant[key]).map(async key=>{
                const image=newFrame(key,state.merchant.id);image.src=state.merchant[key];
                try{await image.decode();state.frames.set(key,image);state.ready.add(key);}catch{image.remove();}
            }));
            if(activeId===state.merchant.id){showExpression();if(running)scheduleBlink();}
        }
        function load(state){
            if(state.loaded)return;state.loaded=true;
            const image=state.frames.get('normal');image.src=state.merchant.normal;
            image.decode().then(()=>{
                state.ready.add('normal');if(activeId!==state.merchant.id)return;
                section.classList.add('scene-ready');portrait.hidden=false;showExpression();
                const idle=window.requestIdleCallback||(callback=>setTimeout(callback,800));
                idle(()=>preload(state),{timeout:2500});
            }).catch(()=>{if(activeId===state.merchant.id)portrait.hidden=true;});
        }
        function updateMerchant(){
            const merchant=ShopMerchants.current();if(activeId===merchant.id)return;
            if(activeId)stop();
            activeId=merchant.id;manualView=0;view.value='0';
            section.dataset.merchant=merchant.id;portrait.hidden=false;
            section.querySelector('.shop-brand h2').textContent=merchant.name;
            section.querySelector('.shop-brand p').textContent=merchant.subtitle;
            section.querySelector('.shop-catalog-title > span').textContent=merchant.catalogSubtitle;
            section.querySelector('.shop-keeper').setAttribute('aria-label',merchant.name+'店主 '+merchant.keeper);
            section.querySelector('.shop-keeper-message-label').textContent=merchant.keeper;
            section.querySelector('.shop-catalog-title h2').textContent=section.dataset.mode==='sell'?merchant.sellCatalog:merchant.catalog;
            section.classList.toggle('scene-ready',entry().ready.has('normal'));caption();showExpression();
        }
        function refresh(){
            updateMerchant();if(visible())load(entry());
            const next=visible()&&motion.checked&&!reduced.matches;
            view.disabled=!motion.checked||reduced.matches;
            if(next===running)return;
            if(!next)return stop();
            running=true;section.dataset.sceneRunning='true';setPan(manualView);scheduleBlink();
            if(entry().ready.has('normal'))preload(entry());
        }
        motion.addEventListener('change',()=>{
            try{localStorage.setItem('helios-shop-motion',motion.checked?'on':'off');}catch{/* Optional local preference. */}
            refresh();
        });
        view.addEventListener('input',()=>{manualView=Number(view.value)/100;if(running)setPan(manualView);});
        section.addEventListener('pointermove',event=>{
            if(!running||event.pointerType!=='mouse')return;cancelAnimationFrame(pointerFrame);
            pointerFrame=requestAnimationFrame(()=>{
                const box=section.getBoundingClientRect();
                setPan(manualView+((event.clientX-box.left)/box.width-.5)*.7,((event.clientY-box.top)/box.height-.5)*.7);
            });
        },{passive:true});
        section.addEventListener('pointerleave',()=>{cancelAnimationFrame(pointerFrame);if(running)setPan(manualView);});
        document.addEventListener('shop:purchase-completed',event=>{
            if(event.detail.shopId!==activeId||!visible())return;
            // Only a confirmed purchase starts the witch's smile, never hover/details/sales.
            if(activeId!=='moon'||!running)return;
            clearTimeout(expressionTimer);smiling=true;showExpression();
            expressionTimer=setTimeout(()=>{smiling=false;showExpression();},5000);
        });
        document.addEventListener('shop:merchant-changed',refresh);
        new MutationObserver(()=>{
            if(mode!==section.dataset.mode){
                mode=section.dataset.mode;
                const merchant=ShopMerchants.current();
                section.querySelector('.shop-catalog-title h2').textContent=mode==='sell'?merchant.sellCatalog:merchant.catalog;
            }
            refresh();
        }).observe(section,{attributes:true,attributeFilter:['class','data-mode']});
        if('IntersectionObserver'in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;refresh();},{threshold:0}).observe(section);
        else inView=true;
        document.addEventListener('visibilitychange',refresh);reduced.addEventListener('change',refresh);
        window.addEventListener('pagehide',stop);window.addEventListener('pageshow',refresh);
        ShopMerchants.dialoguesReady().then(caption);refresh();
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
