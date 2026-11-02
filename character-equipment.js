(function(root){
 'use strict';
 let context,employeeId,state,stock=[],generation=0,busy=false;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const requires=item=>item?.source_metadata?.requires_attunement??(/(?:需|需要)[^。\n]{0,60}同调/.test(String(item?.description||'').slice(0,500))&&!/(?:无需|不需|不需要)同调/.test(String(item?.description||'').slice(0,500)));
 function summary(items,limit=3){
  return '<div class="team-equipment-summary"><div>装备 '+items.length+'/10 · 同调 '+items.filter(i=>i.attuned).length+'/'+limit+'</div>'+(items.length?'<ul>'+items.map(i=>'<li>'+escape(i.item_name)+(i.attuned?' <span>已同调</span>':'')+'</li>').join('')+'</ul>':'<p>未装备物品</p>')+'</div>';
 }
 async function rpc(name,args){const {data,error}=await context.client.rpc(name,args);if(error)throw error;return data;}
 async function mutate(name,args){if(busy)return;const target=employeeId,options=context;busy=true;render();try{const result=await rpc(name,args);if(target!==employeeId)return;state=result;const items=await inventory(options);if(target!==employeeId)return;stock=items;await options.refresh();}
  catch(error){alert(error.message||'装备操作失败');}finally{busy=false;render();}}
 async function inventory(options=context){
  const rows=[];for(let offset=0;;offset+=1000){const {data,error}=await options.client.from('user_inventory').select('*').eq('user_id',options.accountId).order('id').range(offset,offset+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)break;}
  const masters=await root.CompendiumIdentity.lookupMany(options.client,rows);
  return rows.filter(row=>row.quantity>0&&['装备','魔法物品','武器','护甲','盾牌','奇物','戒指','法杖','魔杖','权杖'].includes(row.category)).map(row=>({...row,requires_attunement:requires(masters.get(root.CompendiumIdentity.key(row)))}));
 }
 function available(){
  const target=document.getElementById('ce-inventory');if(!target)return;
  const query=document.getElementById('ce-search').value.trim().toLowerCase(),used=state.items.filter(i=>i.attuned).length;
  const rows=stock.filter(i=>i.item_name.toLowerCase().includes(query));
  target.replaceChildren();for(const item of rows){const row=document.createElement('div');row.className='ce-stock-row';
   const label=document.createElement('span');label.textContent=item.item_name+' ×'+item.quantity+(item.requires_attunement?' · 需要同调':' · 无需同调');row.append(label);
   let toggle;if(item.requires_attunement){const wrap=document.createElement('label');toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=used<state.attunement_limit;toggle.disabled=busy||used>=state.attunement_limit;wrap.append(toggle,document.createTextNode('同时同调'));row.append(wrap);}
   const button=document.createElement('button');button.type='button';button.textContent='装备';button.disabled=busy||state.items.length>=10;button.onclick=()=>mutate('equip_character_item',{p_employee_id:employeeId,p_inventory_id:item.id,p_attuned:!!toggle?.checked});row.append(button);target.append(row);
  }if(!rows.length)target.textContent='背包中没有符合条件的可用装备。';
 }
 function render(){
  if(!state)return;const box=document.getElementById('cb-slots'),query=document.getElementById('ce-search')?.value||'',used=state.items.filter(i=>i.attuned).length;
  box.classList.add('ce-editor');box.innerHTML='<div class="ce-counts"><strong>装备 '+state.items.length+'/10</strong><strong>同调 '+used+'/'+state.attunement_limit+'</strong></div>'+
   (state.items.length>10?'<p class="ce-warning">历史装备超过10件，已全部保留；请先卸下超额装备。</p>':'')+
   (context.admin?'<form id="ce-limit-form" class="ce-limit"><label>同调上限<input id="ce-limit" type="number" min="1" max="10" step="1" value="'+state.attunement_limit+'" required></label><button type="submit" '+(busy?'disabled':'')+'>保存上限</button></form>':'')+
   '<h4>已装备</h4><div class="ce-equipped">'+(state.items.length?state.items.map((item,n)=>'<div class="ce-equipped-row"><div><span class="ce-slot-number">'+(n+1)+'</span><strong>'+escape(item.item_name)+'</strong><small>'+(item.requires_attunement?(item.attuned?'已同调':'需要同调 · 尚未同调，相关特性未生效'):'无需同调')+'</small></div><div class="ce-actions">'+(item.requires_attunement?'<label><input type="checkbox" data-attune="'+item.id+'" '+(item.attuned?'checked ':'')+(busy||(!item.attuned&&used>=state.attunement_limit)?'disabled':'')+'>同调</label>':'')+'<button type="button" data-unequip="'+item.id+'" '+(busy?'disabled':'')+'>卸下</button></div></div>').join(''):'<p>尚未装备物品</p>')+'</div><h4>背包可用装备</h4><input id="ce-search" type="search" placeholder="搜索背包装备" aria-label="搜索背包装备"><div id="ce-inventory"></div><div id="ce-status" role="status">'+(busy?'正在保存…':'')+'</div>';
  document.getElementById('ce-search').value=query;document.getElementById('ce-search').oninput=available;
  box.querySelectorAll('[data-unequip]').forEach(button=>button.onclick=()=>{if(confirm('卸下后将返还到账号背包，并解除同调。继续吗？'))mutate('unequip_character_item',{p_equipment_id:Number(button.dataset.unequip)});});
  box.querySelectorAll('[data-attune]').forEach(input=>input.onchange=()=>mutate('set_character_attunement',{p_equipment_id:Number(input.dataset.attune),p_attuned:input.checked}));
  document.getElementById('ce-limit-form')?.addEventListener('submit',event=>{event.preventDefault();const value=Number(document.getElementById('ce-limit').value);if(Number.isInteger(value)&&value>=1&&value<=10)mutate('set_character_attunement_limit',{p_employee_id:employeeId,p_limit:value});});available();
 }
 async function open(id,name,options){
  const token=++generation;context=options;employeeId=id;state=null;document.getElementById('cb-emp-name').textContent=name;
  document.getElementById('character-bag-modal').style.display='flex';document.body.style.overflow='hidden';
  const box=document.getElementById('cb-slots');box.textContent='正在读取装备…';
  try{const data=await rpc('get_character_equipment',{p_employee_id:id}),items=await inventory(options);if(token!==generation)return;stock=items;state=data;render();}
  catch(error){if(token===generation)box.textContent='装备读取失败：'+(['42883','PGRST202'].includes(error.code)?'请运行 character_equipment.sql':error.message);}
 }
 root.CharacterEquipment={open,summary,requires,refresh:async()=>{if(employeeId&&context)state=await rpc('get_character_equipment',{p_employee_id:employeeId});render();}};
})(globalThis);
