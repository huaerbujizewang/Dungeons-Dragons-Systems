(function(root){
 'use strict';
 let config,current=null,result=null,catalogPromise,error='',dirty=false,editing=null,busy=false;
 const pending=new Map(),byId=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const keys=['ascension','thieves','adventurers','watchers'];
 let selection={account:null,faction:'ascension',stage:'current'};
 const rulesUrl=new URL('data/player-factions.json',document.currentScript?.src||document.baseURI);rulesUrl.search='v=20261119-factions2';
 function configure(value){config=value;}
 function definitions(){return catalogPromise??=fetch(rulesUrl,{cache:'no-cache'}).then(async r=>{
  if(!r.ok)throw Error('规则文件加载失败（HTTP '+r.status+'）：'+rulesUrl.pathname);
  let data;try{data=await r.json();}catch{throw Error('规则文件不是有效JSON：'+rulesUrl.pathname);}
  if(!Array.isArray(data?.factions)||!keys.every(k=>data.factions.some(f=>f.id===k&&Array.isArray(f.tiers)))||data.genesis?.limit!==300||!Array.isArray(data.genesis.daily)||!Array.isArray(data.genesis.events))throw Error('规则文件格式不正确：'+rulesUrl.pathname);
  return data;
 }).catch(e=>{catalogPromise=null;throw e;});}
 function shopPercent(account){return account&&current===account&&result?.state.enabled&&result.state.ascension>=45?80:100;}
 function blocked(){return !!(result?.state.enabled&&result.state.ascension<=-35);}
 function paintShop(){
  const shop=byId('shop-section');if(!shop)return;
  let notice=byId('faction-shop-block');if(!notice){notice=node('div');notice.id='faction-shop-block';notice.setAttribute('role','status');shop.prepend(notice);}
  const waiting=current&&(!result||error),locked=blocked();shop.toggleAttribute('data-faction-blocked',!!waiting||locked);notice.hidden=!waiting&&!locked;
  notice.textContent=error?'势力状态读取失败：'+error:waiting?'正在读取商城通行状态…':locked?'登神会 · 封锁：当前无法使用商城。':'';
  if(waiting||locked)shop.querySelectorAll('dialog[open]').forEach(d=>d.close());
 }
 async function rpc(name,args){const r=await config.client.rpc(name,args);if(r.error)throw r.error;return r.data;}
 function announceAttack(before,after){if(before?.state.enabled&&before.state.genesis_progress<300&&after.state.enabled&&after.state.genesis_progress>=300)config.onAttack?.();}
 async function load(account,force=false){
  if(!account)return;
  if(current!==account){current=account;result=null;error='';dirty=false;editing=null;byId('player-factions-panel')?.replaceChildren();byId('admin-factions-panel')?.replaceChildren();paintShop();}
  if(result&&!force&&!error){await render();return result;}
  let request=pending.get(account);
  if(!request){request=rpc('get_player_factions',{p_account_id:account});pending.set(account,request);request.finally(()=>{if(pending.get(account)===request)pending.delete(account);}).catch(()=>{});}
  try{const value=await request;if(current!==account||config.account()!==account)return value;const previous=result,before=shopPercent(account);result=value;error='';await render();paintShop();if(before!==shopPercent(account)||blocked())config.onChange?.();announceAttack(previous,value);return result;}
  catch(e){if(current!==account)return;error=['PGRST202','42883','42P01'].includes(e.code)?'请DM先运行 player_factions.sql':e.message||String(e);const panel=byId('admin-factions-panel');if(panel){panel.replaceChildren(node('p',error));}paintShop();}
 }
 function renderGauges(host,data,state){
  if(selection.account!==current)selection={account:current,faction:'ascension',stage:'current'};
  const board=node('div');board.className='pf-board';board.setAttribute('aria-label','势力进度总览');host.append(node('h2','势力关系'),board);
  const inspector=node('section');inspector.className='pf-inspector';inspector.setAttribute('aria-label','势力阶段详情');host.append(inspector);
  const gauges=[],colors={ascension:'#6d557c',thieves:'#78613d',adventurers:'#377260',watchers:'#9c7c32'};
  const entries=data.factions;
  const active=(f,t)=>t.at>0?state[f.id]>=t.at:state[f.id]<=t.at;
  const position=(value,min,max)=>(max-value)/(max-min)*100;
  for(const f of entries){
   const score=state[f.id],min=-100,max=100;
   const reached=f.tiers.filter(t=>active(f,t)),tier=score<0?reached.at(-1):reached[0];
   const column=node('article');column.className='pf-gauge pf-faction';column.dataset.faction=f.id;column.dataset.sign=score<0?'negative':score>0?'positive':'neutral';column.style.setProperty('--pf-ink',colors[f.id]);board.append(column);
   const title=button(column,f.name,()=>inspect(f.id,'current'));title.className='pf-gauge-title';title.setAttribute('aria-label',f.name+'当前状态');
   const output=node('output',(score>0?'+':'')+score+'/'+max);output.className='pf-gauge-value';column.append(output);
   const plot=node('div');plot.className='pf-plot';column.append(plot);const track=node('div');track.className='pf-track';plot.append(track);
   const meter=node('meter');meter.className='pf-visually-hidden';meter.min=min;meter.max=max;meter.value=score;meter.setAttribute('aria-label',f.name+'好感度');column.append(meter);
   const axis=node('div');axis.className='pf-axis';axis.setAttribute('aria-hidden','true');track.append(axis);
   for(let value=min;value<=max;value+=10){const major=value%50===0,tick=node('i');tick.className='pf-tick'+(major?' pf-major':'');tick.style.top=position(value,min,max)+'%';tick.setAttribute('aria-hidden','true');track.append(tick);if(major){const label=node('span',value>0?'+'+value:String(value));label.className='pf-scale-label';label.style.top=position(value,min,max)+'%';label.setAttribute('aria-hidden','true');track.append(label);}}
   const zero=position(0,min,max),now=position(score,min,max),fill=node('div');fill.className='pf-fill';fill.style.top=Math.min(zero,now)+'%';fill.style.height=Math.abs(now-zero)+'%';fill.setAttribute('aria-hidden','true');track.append(fill);
   const needle=node('div');needle.className='pf-needle';needle.style.top=now+'%';needle.setAttribute('aria-hidden','true');track.append(needle);
   // A 12% gap keeps 24px targets separate on the smallest 200px track.
   const lanes=[],markers=[];
   for(const t of [...f.tiers].sort((a,b)=>b.at-a.at)){const top=position(t.at,min,max);let lane=lanes.findIndex(last=>top-last>=12);if(lane<0)lane=lanes.length;lanes[lane]=top;
    const label=f.name+' · '+t.name+' '+t.at+'/'+max+' · '+(active(f,t)?'已生效':'未生效');
    const marker=button(track,'',()=>inspect(f.id,String(t.at)));marker.className='pf-marker';marker.style.top=top+'%';marker.style.setProperty('--pf-lane',lane);marker.dataset.active=String(active(f,t));marker.dataset.negative=String(t.at<0);marker.dataset.threshold=t.at;marker.title=label;marker.setAttribute('aria-label',label);marker.onpointerenter=marker.onfocus=()=>inspect(f.id,String(t.at));markers.push({marker,at:String(t.at)});
   }
   const status=node('strong',tier?.name||'中立');status.className='pf-gauge-status';column.append(status,node('small',reached.length?'已生效 '+reached.length+' 项':'暂无阶段效果'));gauges.push({id:f.id,column,title,markers});
  }
  function inspect(id,stage){
   const f=entries.find(f=>f.id===id)||entries[0];if(!['current','all',...f.tiers.map(t=>String(t.at))].includes(stage))stage='current';selection={account:current,faction:f.id,stage};
   for(const g of gauges){g.column.dataset.selected=String(g.id===f.id);g.title.setAttribute('aria-pressed',String(g.id===f.id));for(const m of g.markers)m.marker.setAttribute('aria-pressed',String(g.id===f.id&&m.at===stage));}
   inspector.replaceChildren();const heading=node('div');heading.className='pf-inspector-heading';heading.append(node('h3',f.name));
   const label=node('label','阶段'),select=node('select');select.setAttribute('aria-label','阶段详情');select.append(new Option('当前状态','current'),new Option('全部阶段','all'));for(const t of f.tiers)select.append(new Option(t.name+' '+t.at+'/100',String(t.at)));select.value=stage;select.onchange=()=>inspect(f.id,select.value);label.append(select);heading.append(label);inspector.append(heading);
   const tiers=stage==='current'?f.tiers.filter(t=>active(f,t)):stage==='all'?f.tiers:f.tiers.filter(t=>String(t.at)===stage);
   if(!tiers.length)inspector.append(node('p','当前没有已生效的阶段效果。'));
   for(const t of tiers){const tier=node('article');tier.className='pf-tier';tier.dataset.active=String(active(f,t));tier.dataset.negative=String(t.at<0);const title=node('h4',t.name+' '+t.at+'/100');title.append(node('small',active(f,t)?'已生效':'未生效'));tier.append(title,node('p',t.effect),node('blockquote','“'+t.quote+'”'));inspector.append(tier);}
  }
  inspect(selection.faction,selection.stage);
  const g=data.genesis,attack=node('section');attack.className='pf-genesis';attack.setAttribute('aria-label','创世纪袭击进度');
  const heading=node('div');heading.className='pf-attack-heading';const amount=node('output',state.genesis_progress+'/'+g.limit);amount.className='pf-attack-state';amount.dataset.pending=String(state.genesis_progress>=g.limit);heading.append(node('h3',g.name+' · 袭击进度'),amount,node('span','每日 +'+state.daily_gain));attack.append(heading);
  const ruler=node('div');ruler.className='pf-attack-ruler';const rail=node('div');rail.className='pf-attack-rail';ruler.append(rail);const fill=node('div');fill.className='pf-attack-fill';fill.style.width=state.genesis_progress/g.limit*100+'%';rail.append(fill);
  for(let value=0;value<=g.limit;value+=25){const major=value%100===0,tick=node('i');tick.className='pf-attack-tick'+(major?' pf-major':'');tick.style.left=value/g.limit*100+'%';tick.setAttribute('aria-hidden','true');ruler.append(tick);if(major){const label=node('span',String(value));label.className='pf-attack-label';label.style.left=value/g.limit*100+'%';label.dataset.edge=value===0?'start':value===g.limit?'end':'middle';label.setAttribute('aria-hidden','true');ruler.append(label);}}
  const needle=node('i');needle.className='pf-attack-needle';needle.style.left=state.genesis_progress/g.limit*100+'%';needle.setAttribute('aria-hidden','true');ruler.append(needle);attack.append(ruler);
  const meter=node('meter');meter.className='pf-visually-hidden';meter.min=0;meter.max=g.limit;meter.value=state.genesis_progress;meter.setAttribute('aria-label','创世纪袭击进度');attack.append(meter);
  if(state.genesis_progress>=g.limit)attack.append(node('strong','待处理清洗袭击'));
  attack.append(node('p',g.intro),node('p',g.trigger));const rules=node('details');rules.append(node('summary','进度累积规则'),node('h4','每日累加'));for(const r of g.daily)rules.append(node('p',r.name+'：'+r.text));rules.append(node('h4','事件即时增加'));for(const e of g.events)rules.append(node('p',e.name+'：'+e.text));attack.append(rules);host.insertBefore(attack,inspector);
 }
 function showRulesError(message){
  function notice(host){host.replaceChildren(node('h3','势力规则暂不可用'),node('p',message));const link=node('a','查看规则文件');link.href=rulesUrl.href;link.target='_blank';link.rel='noopener';host.append(link);button(host,'重新读取规则',async()=>{await render();paintShop();});}
  const host=byId('player-factions-panel');if(host){host.hidden=!result.state.enabled;if(result.state.enabled)notice(host);}
  const admin=byId('admin-factions-panel');if(admin&&result.can_manage&&config.target()===current)notice(admin);
 }
 async function render(){
  try{await renderContent();}catch(e){if(result&&current===config.account())showRulesError('势力面板显示失败：'+(e.message||String(e)));}
 }
 async function renderContent(){
  let data;try{data=await definitions();}catch(e){if(result&&current===config.account())showRulesError(e.message||'请检查 '+rulesUrl.pathname);return;}if(!result||current!==config.account())return;
  const host=byId('player-factions-panel');if(!host)return;host.replaceChildren();host.hidden=!result.state.enabled;
  const state=result.state;
  if(state.enabled)renderGauges(host,data,state);
  if(result.can_manage&&config.target()===current){if(!dirty||editing?.account!==current)renderAdmin(data);else byId('pf-status').textContent='资料已更新。当前草稿保留，保存前请重新读取。';}
  else {const admin=byId('admin-factions-panel');if(admin)admin.replaceChildren(node('p','请选择由你负责的玩家。'));}
 }
 function field(parent,label,value,type='number'){const wrap=node('label',label),input=node('input');input.type=type;if(type==='checkbox'){wrap.textContent='';input.checked=!!value;wrap.append(input,document.createTextNode(label));}else{input.value=value;input.required=true;input.step='1';wrap.append(input);}parent.append(wrap);return input;}
 function button(parent,label,handler){const b=node('button',label);b.type='button';b.onclick=handler;parent.append(b);return b;}
 function renderAdmin(data){
  const host=byId('admin-factions-panel');if(!host)return;host.replaceChildren();editing={account:current,revision:result.state.revision};const state=result.state,form=node('form'),controls=node('fieldset'),grid=node('div');grid.className='pf-fields';form.append(controls);controls.append(grid);host.append(form);
  const enabled=field(grid,'启用此玩家的势力系统（页面与效果）',state.enabled,'checkbox'),scores={};
  for(const f of data.factions){const input=field(grid,f.name+'好感度',state[f.id]);input.min=-100;input.max=100;scores[f.id]=input;}
  const value=field(grid,'创世纪袭击进度',state.genesis_progress),daily=field(grid,'每日增长',state.daily_gain);value.min=daily.min=0;value.max=300;daily.max=1000000;
  const calculator=node('details');calculator.append(node('summary','每日增长计算器'));const calcGrid=node('div');calcGrid.className='pf-fields';calculator.append(calcGrid);
  const count=field(calcGrid,'邪魔血统与契约人数',0),relic=field(calcGrid,'携带污秽之物',false,'checkbox'),service=field(calcGrid,'为旧秩序效力',false,'checkbox');count.min=0;count.max=100000;
  button(calculator,'应用条件计算',()=>{if(!count.checkValidity())return count.reportValidity();daily.value=Number(count.value)*3+(relic.checked?2:0)+(service.checked?2:0);dirty=true;});controls.append(calculator);
  const actions=node('div');actions.className='pf-actions';const save=node('button','保存势力设置');save.type='submit';actions.append(save);button(actions,'重新读取',()=>{if(dirty&&!confirm('放弃当前势力草稿并重新读取？'))return;dirty=false;load(current,true);});controls.append(actions);
  const status=node('p');status.id='pf-status';status.setAttribute('role','status');form.append(status);form.oninput=()=>dirty=true;
  async function write(name,args){if(busy)return;const account=current;busy=true;controls.disabled=true;status.textContent='正在保存…';try{const saved=await rpc(name,args);if(account!==current)return;const previous=result;result=saved;dirty=false;await render();paintShop();config.onChange?.();const savedStatus=byId('pf-status');if(savedStatus)savedStatus.textContent='已保存。';announceAttack(previous,saved);}catch(e){if(account===current)status.textContent=e.message||String(e);}finally{busy=false;controls.disabled=false;}}
  form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;const document={enabled:enabled.checked,genesis_progress:Number(value.value),daily_gain:Number(daily.value)};for(const k of keys)document[k]=Number(scores[k].value);write('save_player_factions',{p_account_id:current,p_revision:editing.revision,p_document:document});};
  const events=node('div');events.className='pf-actions';controls.append(node('h3','创世纪事件'),events);
  function event(id,delta=0){if(dirty){status.textContent='请先保存草稿，再处理事件。';return;}const pendingKey=events.dataset.requestKey||crypto.randomUUID();events.dataset.requestKey=pendingKey;write('apply_player_faction_event',{p_account_id:current,p_event:id,p_delta:delta,p_request_key:pendingKey});}
  for(const e of data.genesis.events)button(events,e.name+' +'+e.delta,()=>event(e.id));
  const custom=field(controls,'自定义进度增减',1);custom.min=-1000000;custom.max=1000000;custom.required=false;custom.oninput=e=>e.stopPropagation();
  controls.insertBefore(custom.closest('label'),events);custom.disabled=!state.enabled;
  button(events,'应用自定义增减',()=>{if(custom.checkValidity()&&custom.value!=='')event('adjust',Number(custom.value));});
  const resolve=button(events,'袭击应对结束，清零',()=>{if(confirm('确认本次清洗袭击已应对结束，并将进度清零？'))event('resolved');});resolve.disabled=state.genesis_progress<300;
  if(!state.enabled)events.querySelectorAll('button').forEach(b=>b.disabled=true);
  const logs=node('p','当前：'+state.genesis_progress+'/300 · 每日 +'+state.daily_gain);controls.append(logs);
 }
 root.PlayerFactions={configure,load,reload:account=>load(account,true),shopPercent,blocked};
})(globalThis);
