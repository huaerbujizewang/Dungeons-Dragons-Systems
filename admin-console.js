(function(root){
    'use strict';
    const pages=[
        ['players','玩家与资金','backpack'],['approvals','待办审批','scroll-text'],
        ['shop','商城供货','layout-grid'],['economy','时间与经济','gem'],
        ['checkins','打卡与赛事','circle'],['personnel','人员档案','box'],
        ['monsters','怪物图鉴','swords'],['wanted','通缉令','shield'],
        ['research','科研工程','wand'],['images','图像素材','layout-grid']
    ];
    let active='players',mounted=false;
    try{const saved=localStorage.getItem('helios-admin-page');if(pages.some(page=>page[0]===saved))active=saved;}catch{/* Optional navigation preference. */}
    function select(id){
        if(!pages.some(page=>page[0]===id))return;
        active=id;
        const panel=document.getElementById('admin-panel');
        panel?.querySelectorAll('.admin-module').forEach(page=>{page.hidden=page.dataset.module!==id;});
        panel?.querySelectorAll('[data-admin-target]').forEach(button=>button.setAttribute('aria-current',button.dataset.adminTarget===id?'page':'false'));
        const mobile=document.getElementById('admin-page-mobile');if(mobile)mobile.value=id;
        try{localStorage.setItem('helios-admin-page',id);}catch{/* Optional navigation preference. */}
    }
    function mount(){
        const panel=document.getElementById('admin-panel');
        if(mounted||!panel)return;mounted=true;
        panel.classList.add('admin-modern');
        const host=document.getElementById('admin-page-host'),nav=document.getElementById('admin-navigation'),mobile=document.getElementById('admin-page-mobile');
        for(const [id,label,icon] of pages){
            const page=document.createElement('section');page.className='admin-module';page.dataset.module=id;page.id='admin-module-'+id;
            const title=document.createElement('h2');title.textContent=label;title.className='admin-module-title';page.append(title);
            panel.querySelectorAll('[data-admin-page="'+id+'"]').forEach(box=>page.append(box));
            host.append(page);
            const button=document.createElement('button');button.type='button';button.dataset.adminTarget=id;button.setAttribute('aria-controls',page.id);
            button.innerHTML=root.ShopShelf.icon(icon);const name=document.createElement('span');name.textContent=label;button.append(name);
            button.onclick=()=>select(id);nav.append(button);
            const option=document.createElement('option');option.value=id;option.textContent=label;mobile.append(option);
        }
        // Move, never clone: existing IDs, handlers, selections and form drafts survive.
        document.getElementById('admin-target-slot').append(document.getElementById('adm-user-list'));
        document.getElementById('admin-legacy-layout').hidden=true;
        mobile.addEventListener('change',()=>select(mobile.value));
        select(active);
    }
    root.AdminConsole={mount,select,open:mount,pages};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(globalThis);
