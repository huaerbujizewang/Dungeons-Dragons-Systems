(function(root){
 'use strict';
 let options,workspace,dialog,form,documentData,dirty=false,busy=false;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 async function rpc(name,args){const {data,error}=await options.client.rpc(name,args);if(error)throw error;return data;}
 function field(parent,label,value,type='text'){
  const wrap=node('label',label),input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;
  input.value=value??'';if(type==='number'){input.step='any';input.required=true;}wrap.append(input);parent.append(wrap);return input;
 }
 function button(parent,label,action){const b=node('button',label);b.type='button';b.onclick=action;parent.append(b);return b;}
 function selectField(parent,label,value,choices){const wrap=node('label',label),select=node('select');for(const [key,name] of choices)select.append(new Option(name,key));select.value=value;wrap.append(select);parent.append(wrap);return select;}
 function removable(parent,render){const row=node('div');row.className='tm-row';parent.append(row);const result=render(row);button(row,'删除',()=>{row.remove();dirty=true;});return result;}
 function moneyEditor(parent,label,rows,income){
  const section=node('fieldset'),legend=node('legend',label),list=node('div');section.append(legend,list);parent.append(section);
  const priceKey=income?'unit_price':'unit_cost',controls=[];
  function add(data={}){removable(list,row=>{const name=field(row,'项目',data.name),category=selectField(row,'类别',data.category||(income?'trade':'building'),income?[['tax','专项税'],['state','国营收入'],['trade','贸易收入']]:[['staff','职员薪资'],['building','设施维护'],['trade_cost','贸易成本']]),count=field(row,'数量',data.count??1,'number'),price=field(row,'单价 GP',data[priceKey]??(income?data.amount:0)??0,'number');name.required=true;count.min=0;if(!income)price.min=0;controls.push({row,name,category,count,price});});}
  rows.forEach(add);button(section,'添加'+label,()=>{add();dirty=true;});return()=>controls.filter(c=>c.row.isConnected).map(c=>({name:c.name.value.trim(),category:c.category.value,count:Number(c.count.value),[priceKey]:Number(c.price.value)}));
 }
 function compositionEditor(parent,label,rows){
  const section=node('fieldset'),list=node('div');section.append(node('legend',label),list);parent.append(section);const controls=[];
  function add(data={}){removable(list,row=>{controls.push({row,label:field(row,'名称',data.label),value:field(row,'占比／权重',data.value??0,'number'),color:field(row,'颜色',/^#[a-f\d]{6}$/i.test(data.color||'')?data.color:'#45937c','color')});});}
  (rows||[]).forEach(add);button(section,'添加构成项',()=>{add();dirty=true;});return()=>controls.filter(c=>c.row.isConnected).map(c=>({label:c.label.value.trim(),value:Number(c.value.value),color:c.color.value}));
 }
 function loreEditor(parent,definition){
  const section=node('fieldset'),list=node('div');section.append(node('legend','说明分类与条目'),list);parent.append(section);const groups=[];
  function add(data={}){
   const group=node('fieldset');list.append(group);const id=data.id||'g_'+crypto.randomUUID().replaceAll('-','');
   const title=field(group,'分类名称',data.title||data.label),items=node('div'),controls=[];group.append(items);
   function addItem(item={}){removable(items,row=>controls.push({row,title:field(row,'条目名称',item.title),desc:field(row,'详细说明',item.desc,'textarea')}));}
   (data.items||[]).forEach(addItem);button(group,'添加说明条目',()=>{addItem();dirty=true;});button(group,'删除分类',()=>{group.remove();dirty=true;});groups.push({group,id,title,controls});
  }
  const known=new Set();for(const menu of definition.menus||[]){known.add(menu.id);add({id:menu.id,title:definition.lore?.[menu.id]?.title||menu.label,items:definition.lore?.[menu.id]?.items});}
  for(const [id,value] of Object.entries(definition.lore||{}))if(!known.has(id))add({id,...value});
  button(section,'添加说明分类',()=>{add();dirty=true;});return()=>{const menus=[],lore={};for(const g of groups.filter(g=>g.group.isConnected)){if(!g.title.value.trim())throw Error('请填写说明分类名称');menus.push({id:g.id,label:g.title.value.trim(),icon:''});lore[g.id]={title:g.title.value.trim(),items:g.controls.filter(c=>c.row.isConnected).map(c=>({title:c.title.value.trim(),desc:c.desc.value}))};}return{menus,lore};};
 }
 async function reload(){workspace=await rpc('get_player_territories',{p_account_id:options.accountId});return workspace;}
 function draft(){return{location_key:'t_'+crypto.randomUUID().replaceAll('-',''),revision:0,name:'',subtitle:'',active:true,definition:{},stats:{population:0,tax_rate:1.2,subsidy:0},incomes:[],expenses:[]};}
 function renderEditor(data){
  documentData=data;dirty=false;form.replaceChildren();
  const status=node('p');status.id='tm-status';status.setAttribute('role','status');
  const selector=node('select');selector.setAttribute('aria-label','编辑已有领地');selector.append(new Option('选择已有领地',''));
  for(const t of workspace.territories)selector.append(new Option(t.name+(t.active?'':'（已收回）'),t.location_key));selector.value=data.revision?data.location_key:'';
  selector.onchange=async()=>{if(dirty&&!confirm('放弃尚未保存的编辑？')){selector.value=documentData.revision?documentData.location_key:'';return;}try{renderEditor(selector.value?await rpc('get_territory_editor',{p_account_id:options.accountId,p_location:selector.value}):draft());}catch(e){status.textContent=e.message;}};
  const tools=node('div');tools.className='tm-actions';tools.append(selector);button(tools,'分派新领地',()=>{if(!dirty||confirm('放弃未保存的编辑，新建领地？'))renderEditor(draft());});
  button(tools,'重新读取',async()=>{if(dirty&&!confirm('放弃未保存的编辑？'))return;try{await reload();renderEditor(documentData.revision?await rpc('get_territory_editor',{p_account_id:options.accountId,p_location:documentData.location_key}):draft());}catch(e){status.textContent=e.message;}});form.append(tools,node('p','管理账号：'+(workspace.account_label||options.accountId)));
  const file=node('input');file.type='file';file.accept='.json,application/json';file.hidden=true;tools.append(file);
  button(tools,'导入旧领地说明',()=>file.click());
  file.onchange=async()=>{try{const chosen=file.files[0];if(!chosen)return;if(chosen.size>2000000)throw Error('说明文件不能超过2MB');const parsed=JSON.parse(await chosen.text());
    const entries=Object.entries(parsed).filter(([key,value])=>key!=='overview'&&value&&typeof value==='object'&&!Array.isArray(value));if(!entries.length)throw Error('没有找到可导入的领地说明');
    const chooser=node('select');chooser.setAttribute('aria-label','旧文件中的领地');for(const [key,value] of entries)chooser.append(new Option(value.name||key,key));tools.append(chooser);
    button(tools,'应用选中的说明',()=>{if(dirty&&!confirm('这将放弃当前尚未保存的编辑，继续导入吗？'))return;const old=parsed[chooser.value],definition={};for(const key of ['order','raceData','faithData','menus','lore'])if(old[key]!==undefined)definition[key]=old[key];renderEditor({...documentData,name:documentData.name||old.name||'',subtitle:documentData.subtitle||old.subtitle||'',definition});dirty=true;});
   }catch(e){status.textContent='导入失败：'+e.message;}};
  const body=node('fieldset');body.className='tm-body';form.append(body);
  const name=field(body,'领地名称',data.name);name.required=true;name.maxLength=100;
  const subtitle=field(body,'副标题／行政说明',data.subtitle);subtitle.maxLength=300;
  const activeWrap=node('label'),active=node('input');active.type='checkbox';active.checked=data.active;activeWrap.append(active,document.createTextNode('分派给该玩家（取消勾选为收回，保留历史数据）'));body.append(activeWrap);
  const stats=node('div');stats.className='tm-row';body.append(stats);const population=field(stats,'人口',data.stats?.population??0,'number'),tax=field(stats,'人头税 GP／人',data.stats?.tax_rate??1.2,'number'),subsidy=field(stats,'每月补贴 GP',data.stats?.subsidy??0,'number');population.min=tax.min=0;population.step=1;
  const definition=data.definition||{},order=definition.order||{},orderStatus=field(body,'治安状态',order.status),orderDesc=field(body,'治安说明',order.desc,'textarea');
  const incomes=moneyEditor(body,'收入项目',data.incomes||[],true),expenses=moneyEditor(body,'支出项目',data.expenses||[],false);
  const race=compositionEditor(body,'种族构成',definition.raceData),faith=compositionEditor(body,'信仰构成',definition.faithData),lore=loreEditor(body,definition);
  const save=node('button','保存并分派');save.type='submit';form.append(status,save);form.oninput=()=>dirty=true;
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;let payload;
   try{payload={name:name.value.trim(),subtitle:subtitle.value,active:active.checked,stats:{population:Number(population.value),tax_rate:Number(tax.value),subsidy:Number(subsidy.value)},incomes:incomes(),expenses:expenses(),definition:{...definition,order:{...order,status:orderStatus.value,desc:orderDesc.value,color:'#287f6c'},raceData:race(),faithData:faith(),...lore()}};}catch(e){status.textContent=e.message;return;}
   if(!confirm('保存领地“'+payload.name+'”并'+(payload.active?'分派给该账号':'收回访问权限')+'？'))return;
   busy=true;body.disabled=save.disabled=selector.disabled=true;tools.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='正在保存…';
   let saved;
   try{saved=await rpc('save_player_territory',{p_account_id:options.accountId,p_location:data.location_key,p_revision:data.revision,p_document:payload});dirty=false;}
   catch(e){status.textContent='保存失败：'+e.message;}
   if(saved){try{await reload();await options.onSaved(workspace,saved.location_key);renderEditor(saved);document.getElementById('tm-status').textContent='已保存。';}catch(e){status.textContent='领地已保存，但界面刷新失败，请重新读取。';}}
   busy=false;body.disabled=save.disabled=selector.disabled=false;tools.querySelectorAll('button').forEach(b=>b.disabled=false);
  };
 }
 async function open(){
  if(!workspace?.can_manage)return;
  if(!dialog){dialog=node('dialog');dialog.id='territory-editor';dialog.setAttribute('aria-label','DM领地分派与编辑');const heading=node('header');heading.append(node('h2','领地分派与编辑'));button(heading,'关闭',()=>{if(!busy&&(!dirty||confirm('放弃未保存的编辑？')))dialog.close();});form=node('form');dialog.append(heading,form);document.body.append(dialog);dialog.addEventListener('cancel',e=>{if(busy||(dirty&&!confirm('放弃未保存的编辑？')))e.preventDefault();});}
  if(!dialog.open)dialog.showModal();form.textContent='正在读取…';
  try{await reload();const current=workspace.territories.find(t=>t.location_key===options.current());renderEditor(current?await rpc('get_territory_editor',{p_account_id:options.accountId,p_location:current.location_key}):draft());}catch(e){form.textContent='读取失败：'+e.message;}
 }
 async function start(config){options=config;await reload();if(workspace.can_manage){const buttonNode=node('button','DM领地分派与编辑');buttonNode.id='territory-edit-button';buttonNode.type='button';buttonNode.onclick=open;document.body.append(buttonNode);}return workspace;}
 root.TerritoryManager={start,open};
})(globalThis);
