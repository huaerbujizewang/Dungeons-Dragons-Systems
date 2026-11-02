(function(root){
 'use strict';
 let options,workspace,dialog,form,documentData,dirty=false,busy=false,activeTab='basics';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const trainingScores=Object.freeze(Object.assign(Object.create(null),{'乌合之众':25,'动员民兵':40,'杂牌军':50,'整训中':60,'常备军':75,'老兵':88,'精锐':100}));
 const orderColors=Object.freeze(Object.assign(Object.create(null),{'':'#68776f','优秀':'#008000','良好':'#27ae60','稳定':'#287f6c','一般':'#8a742b','紧张':'#b36b20','混乱':'#c0392b','暴乱':'#9f2434','荒废':'#999999','自治':'#3498db'}));
 const unitTypes=['步兵','骑兵','弓弩兵','火器兵','炮兵','施法部队','工兵','侦察兵','卫队','民兵','后勤部队','混合部队'];
 const equipmentCategories=['武器','护甲','盾牌','弹药','攻城器械','载具','魔法装备','通信器材','医疗物资','补给','其他'];
 const lorePresets=[
  {id:'economy',label:'经济',title:'ECONOMY / 经济概况',icon:'💰'},
  {id:'law',label:'法律',title:'LAW / 法律与政策',icon:'⚖️'},
  {id:'military',label:'军事',title:'MILITARY / 军事概况',icon:'⚔️'},
  {id:'welfare',label:'福利',title:'WELFARE / 社会福利',icon:'❤️'},
  {id:'order',label:'治安',title:'ORDER / 治安',icon:'👮'},
  {id:'diplomacy',label:'外交',title:'DIPLOMACY / 外交关系',icon:'🤝'}
 ];
 const palette=['#367c68','#4585b4','#ae6b34','#8e64a3','#b94e65','#7e883b','#427f86','#a47d28','#74594a','#647784','#c47b8b','#6a78b0'];
 const compositionColors={
  '种族构成':{'人类':'#2c3e50','矮人':'#7f8c8d','半精灵':'#e67e22','龙裔':'#B22222','精灵':'#27ae60','地精':'#8e44ad','兽人':'#f1c40f','提夫林':'#800000','侏儒':'#c0392b','阿斯莫':'#FFD700','狐妖':'#ff9ff3','狗头人':'#8B4513','龙':'#E5E4E2','火蝾螈':'#e67e22'},
  '信仰构成':{'巴哈姆特':'#D7BE69','渥金':'#f1c40f','洛山达':'#f39c12','塞伦涅':'#bdc3c7','密丝瑞尔':'#9b59b6','欧格玛':'#3498db','淑妮':'#e84393','坦帕斯':'#7f8c8d','贡德':'#d35400','海姆':'#2980b9','其他':'#ecf0f1','卡署斯':'#c0392b','摩拉丁':'#7f8c8d','加尔·闪金':'#e67e22','库尔图马克':'#c0392b','太姬':'#2ecc71'}
 };
 async function rpc(name,args){const {data,error}=await options.client.rpc(name,args);if(error)throw error;return data;}
 function field(parent,label,value,type='text'){
  const wrap=node('label',label),input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;
  input.value=value??'';if(type==='number'){input.step='any';input.required=true;}wrap.append(input);parent.append(wrap);return input;
 }
 function button(parent,label,action){const b=node('button',label);b.type='button';b.onclick=action;parent.append(b);return b;}
 function selectField(parent,label,value,choices){const wrap=node('label',label),select=node('select');select.setAttribute('aria-label',label);for(const [key,name] of choices)select.append(new Option(name,key));select.value=value;wrap.append(select);parent.append(wrap);return select;}
 function presetField(parent,label,value,choices){
  const customKey='__tm_custom__',keys=new Set(choices.map(c=>c[0])),initial=String(value??'');
  const select=selectField(parent,label,keys.has(initial)?initial:customKey,[...choices,[customKey,'自定义…']]);
  const custom=field(parent,label+'（自定义）',keys.has(initial)?'':initial),listeners=[];
  function sync(){const enabled=select.value===customKey;custom.closest('label').hidden=!enabled;custom.disabled=!enabled;custom.required=enabled;}
  select.addEventListener('input',sync);select.addEventListener('change',()=>{sync();for(const fn of listeners)fn();});custom.addEventListener('input',()=>{for(const fn of listeners)fn();});sync();
  return {get value(){return select.value===customKey?custom.value.trim():select.value;},get isPreset(){return select.value!==customKey;},select,custom,onChange(fn){listeners.push(fn);}};
 }
 function validColor(value){return typeof value==='string'&&value.trim()!==''&&CSS.supports('color',value);}
 function hexColor(value){if(!validColor(value))return null;const ctx=node('canvas').getContext('2d');ctx.fillStyle=value;return ctx.fillStyle;}
 function colorControl(parent,label,original,mode,automatic){
  const host=node('div');host.className='tm-color-control';parent.append(host);
  const caption=node('span',label),preview=node('span');preview.className='tm-color-preview';const swatch=node('i');swatch.setAttribute('aria-hidden','true');preview.append(swatch,node('span','自动配色'));
  const toggleLabel=node('label'),toggle=node('input');toggle.type='checkbox';toggle.setAttribute('aria-label',label+'：自定义颜色');toggleLabel.append(toggle,document.createTextNode('自定义颜色'));host.append(caption,preview,toggleLabel);
  const picker=field(host,label+'（自定义颜色）',/^#[a-f\d]{6}$/i.test(hexColor(original)||'')?hexColor(original):automatic(),'color');let changed=false;
  toggle.checked=mode==='custom'||(mode!=='auto'&&validColor(original)&&hexColor(original)!==hexColor(automatic()));
  function value(){return toggle.checked?(changed?picker.value:validColor(original)?original:picker.value):automatic();}
  function sync(){picker.closest('label').hidden=!toggle.checked;picker.disabled=!toggle.checked;swatch.style.backgroundColor=value();preview.lastChild.textContent=toggle.checked?'自定义配色':'自动配色';}
  toggle.onchange=sync;picker.oninput=()=>{changed=true;sync();};sync();
  return {get value(){return value();},get mode(){return toggle.checked?'custom':'auto';},refresh:sync,useAuto(){toggle.checked=false;sync();}};
 }
 function compositionColor(kind,label){const name=label.trim();if(Object.hasOwn(compositionColors[kind]||{},name))return compositionColors[kind][name];let hash=0;for(const char of kind+':'+name)hash=(hash*31+char.codePointAt(0))>>>0;return palette[hash%palette.length];}
 function moves(parent,row){button(parent,'↑',()=>{if(row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);dirty=true;}).title='上移';button(parent,'↓',()=>{if(row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);dirty=true;}).title='下移';}
 function ordered(rows,key='row'){return rows.filter(c=>c[key].isConnected).sort((a,b)=>(a[key].compareDocumentPosition(b[key])&4)?-1:1);}
 function removable(parent,render){const row=node('div');row.className='tm-row';parent.append(row);const result=render(row);moves(row,row);button(row,'删除',()=>{row.remove();dirty=true;form?.dispatchEvent(new Event('input',{bubbles:true}));});return result;}
 function moneyEditor(parent,label,rows,income){
  const section=node('fieldset'),legend=node('legend',label),list=node('div');section.append(legend,list);parent.append(section);
  const priceKey=income?'unit_price':'unit_cost',controls=[];
  function add(data={}){removable(list,row=>{const name=field(row,'项目',data.name),category=selectField(row,'类别',data.category||(income?'trade':'building'),income?[['tax','专项税'],['state','国营收入'],['trade','贸易收入']]:[['staff','职员薪资'],['building','设施维护'],['trade_cost','贸易成本']]),count=field(row,'数量',data.count??1,'number'),price=field(row,'单价 GP',data[priceKey]??(income?data.amount:0)??0,'number');name.required=category.required=true;count.min=0;if(!income)price.min=0;controls.push({row,name,category,count,price});});}
  rows.forEach(add);button(section,'添加'+label,()=>{add();dirty=true;});return()=>ordered(controls).map(c=>({name:c.name.value.trim(),category:c.category.value,count:Number(c.count.value),[priceKey]:Number(c.price.value)}));
 }
 function compositionEditor(parent,label,rows){
  const section=node('fieldset'),list=node('div');section.append(node('legend',label),list);parent.append(section);const controls=[];
  function add(data={}){removable(list,row=>{const name=field(row,'名称',data.label),value=field(row,'占比／权重',data.value??0,'number'),color=colorControl(row,'构成颜色',data.color,data.color_mode,()=>compositionColor(label,name.value));name.required=true;value.min=0;name.addEventListener('input',color.refresh);controls.push({row,label:name,value,color,original:data});});}
  (rows||[]).forEach(add);button(section,'添加构成项',()=>{add();dirty=true;});return()=>ordered(controls).map(c=>({...c.original,label:c.label.value.trim(),value:Number(c.value.value),color:c.color.value,color_mode:c.color.mode}));
 }
 function loreEditor(parent,definition){
  const section=node('fieldset'),list=node('div');section.append(node('legend','说明分类与条目'),list);parent.append(section);const groups=[];
  function add(data={}){
   const group=node('fieldset');list.append(group);const id=data.id||'g_'+crypto.randomUUID().replaceAll('-','');
   const preset=selectField(group,'分类预设',data.preset|| (lorePresets.some(p=>p.id===id)?id:''),[['','自定义分类'],...lorePresets.map(p=>[p.id,p.label])]);
   const label=field(group,'分类名称',data.label||data.title),title=field(group,'报告标题',data.title||data.label),icon=presetField(group,'分类图标',data.icon||'',[['','无图标'],['💰','💰 经济'],['⚖️','⚖️ 法律'],['⚔️','⚔️ 军事'],['❤️','❤️ 福利'],['👮','👮 治安'],['🤝','🤝 外交'],['🏛️','🏛️ 行政'],['🏗️','🏗️ 建设'],['📜','📜 文书'],['◆','◆ 菱形'],['●','● 圆点']]),items=node('div'),controls=[];label.required=title.required=true;group.append(items);
   preset.onchange=()=>{const standard=lorePresets.find(p=>p.id===preset.value);if(standard){label.value=standard.label;title.value=standard.title;title.dataset.auto='false';icon.select.value=standard.icon;icon.select.dispatchEvent(new Event('change'));}dirty=true;};
   label.oninput=()=>{if(!title.value||title.dataset.auto==='true'){title.value=label.value;title.dataset.auto='true';}};title.oninput=()=>title.dataset.auto='false';
   function addItem(item={}){removable(items,row=>{const title=field(row,'条目名称',item.title),desc=field(row,'详细说明',item.desc,'textarea');title.required=true;controls.push({row,title,desc,original:item});});}
   (data.items||[]).forEach(addItem);button(group,'添加说明条目',()=>{addItem();dirty=true;});moves(group,group);button(group,'删除分类',()=>{group.remove();dirty=true;});groups.push({group,id,label,title,icon,preset,controls});
  }
  const known=new Set();for(const menu of definition.menus||[]){known.add(menu.id);add({id:menu.id,label:menu.label,icon:menu.icon,preset:menu.preset,title:definition.lore?.[menu.id]?.title||menu.label,items:definition.lore?.[menu.id]?.items});}
  for(const [id,value] of Object.entries(definition.lore||{}))if(!known.has(id))add({id,...value});
  button(section,'添加说明分类',()=>{add();dirty=true;});button(section,'补齐常用分类',()=>{for(const standard of lorePresets)if(!groups.some(g=>g.group.isConnected&&(g.id===standard.id||g.preset.value===standard.id||g.label.value.trim()===standard.label)))add({...standard,preset:standard.id,items:[]});dirty=true;});
  return()=>{const menus=[],lore={};for(const g of ordered(groups,'group')){if(!g.title.value.trim()||!g.label.value.trim())throw Error('请填写分类名称和报告标题');menus.push({id:g.id,label:g.label.value.trim(),icon:g.icon.value,preset:g.preset.value});lore[g.id]={title:g.title.value.trim(),items:ordered(g.controls).map(c=>({...c.original,title:c.title.value.trim(),desc:c.desc.value}))};}return{menus,lore};};
 }
 function militaryEditor(parent,units){
  const list=node('div'),controls=[];parent.append(list);
  function addUnit(data={}){const group=node('fieldset');list.append(group);group.append(node('legend','部队编制'));
   const name=field(group,'部队名称',data.unit_name),type=presetField(group,'部队类型',data.unit_type??'步兵',[['','未分类'],...unitTypes.map(v=>[v,v])]),personnel=field(group,'人员数量',data.personnel_count??0,'number'),training=presetField(group,'训练状态',data.training_status||data.training_level||'常备军',Object.entries(trainingScores).map(([name,score])=>[name,name+'（训练值 '+score+'）'])),doctrine=field(group,'作战理念／说明',data.doctrine,'textarea');name.required=true;personnel.min=0;personnel.step=1;
   const trainingValue=node('output');trainingValue.className='tm-training-value';group.append(trainingValue);const syncTraining=()=>trainingValue.textContent='训练值 '+(trainingScores[training.value]??60)+(trainingScores[training.value]===undefined?'（自定义状态）':'');training.onChange(syncTraining);syncTraining();
   const equipment=node('div'),rows=[];group.append(equipment);
   function addEquipment(item={}){removable(equipment,row=>{const name=field(row,'装备名称',item.equipment_name),category=presetField(row,'装备类别',item.category??'武器',[['','未分类'],...equipmentCategories.map(v=>[v,v])]),quantity=field(row,'现有数量',item.quantity??0,'number'),required=field(row,'编制需求',item.required_quantity??0,'number'),notes=field(row,'装备备注',item.notes,'textarea');name.required=true;quantity.min=required.min=0;quantity.step=required.step=1;rows.push({row,id:item.id,name,category,quantity,required,notes});});}
   (data.equipment||[]).forEach(addEquipment);button(group,'添加军备项目',()=>{addEquipment();dirty=true;});moves(group,group);button(group,'删除整支部队',()=>{if(confirm('保存后将删除这支部队及其装备登记，继续吗？')){group.remove();dirty=true;}});controls.push({group,id:data.id,name,type,personnel,training,doctrine,rows});
  }
  (units||[]).forEach(addUnit);button(parent,'添加部队',()=>{addUnit();dirty=true;});return()=>ordered(controls,'group').map(c=>({id:c.id??null,unit_name:c.name.value.trim(),unit_type:c.type.value,personnel_count:Number(c.personnel.value),training_status:c.training.value,doctrine:c.doctrine.value,equipment:ordered(c.rows).map(e=>({id:e.id??null,equipment_name:e.name.value.trim(),category:e.category.value,quantity:Number(e.quantity.value),required_quantity:Number(e.required.value),notes:e.notes.value}))}));
 }
 function personnelEditor(parent,data){
  const search=node('input');search.type='search';search.placeholder='查询该玩家的人员';search.setAttribute('aria-label','查询驻地人员');const list=node('div');list.className='tm-personnel';parent.append(search,list);const inputs=[];
  for(const employee of data.available_employees||[]){const label=node('label'),input=node('input');input.type='checkbox';input.checked=(data.stationed_employee_ids||[]).map(String).includes(String(employee.id));label.append(input,document.createTextNode(employee.name+' · '+(employee.role||'人员')+' · '+(employee.status||'')+' · 月薪 '+(Number(employee.salary)===-1?0:Number(employee.salary)||0)+' GP'+(employee.location?' · 驻地 '+employee.location:'')));list.append(label);inputs.push({employee,input,label});}
  if(!inputs.length)list.textContent='该玩家尚无可安排的人员。';search.oninput=()=>{for(const c of inputs)c.label.hidden=!c.employee.name.toLowerCase().includes(search.value.trim().toLowerCase());};return()=>inputs.filter(c=>c.input.checked).map(c=>c.employee.id);
 }
 async function reload(){workspace=await rpc('get_player_territories',{p_account_id:options.accountId});return workspace;}
 function draft(){return{location_key:'t_'+crypto.randomUUID().replaceAll('-',''),revision:0,name:'',subtitle:'',active:true,profit_share_percent:100,definition:{},stats:{population:0,tax_rate:1.2,subsidy:0},incomes:[],expenses:[],military:[],available_employees:workspace.available_employees||[],stationed_employee_ids:[]};}
 function renderEditor(data){
  if(data.revision===0)activeTab='basics';
  documentData=data;dirty=false;form.replaceChildren();
  if(workspace.finance_share_version!==1){form.textContent='领地分成接口尚未更新，请先完整运行最新版 player_territories.sql。为避免分成比例未保存，编辑已暂停。';return;}
  if(data.revision>0&&(!Array.isArray(data.military)||!Array.isArray(data.stationed_employee_ids))){form.textContent='领地后台接口仍是旧版本，请先完整运行最新版 player_territories.sql。为避免覆盖军队或驻地数据，编辑已暂停。';return;}
  const status=node('p');status.id='tm-status';status.setAttribute('role','status');
  const selector=node('select');selector.setAttribute('aria-label','编辑已有领地');selector.append(new Option('选择已有领地',''));
  for(const t of workspace.territories)selector.append(new Option(t.name+(t.active?'':'（已收回）'),t.location_key));selector.value=data.revision?data.location_key:'';
  selector.onchange=async()=>{if(dirty&&!confirm('放弃尚未保存的编辑？')){selector.value=documentData.revision?documentData.location_key:'';return;}try{renderEditor(selector.value?await rpc('get_territory_editor',{p_account_id:options.accountId,p_location:selector.value}):draft());}catch(e){status.textContent=e.message;}};
  const tools=node('div');tools.className='tm-actions';tools.append(selector);button(tools,'分派新领地',()=>{if(!dirty||confirm('放弃未保存的编辑，新建领地？'))renderEditor(draft());});
  button(tools,'重新读取',async()=>{if(dirty&&!confirm('放弃未保存的编辑？'))return;try{await reload();renderEditor(documentData.revision?await rpc('get_territory_editor',{p_account_id:options.accountId,p_location:documentData.location_key}):draft());}catch(e){status.textContent=e.message;}});form.append(tools,node('p','管理账号：'+(workspace.account_label||options.accountId)));
  const file=node('input');file.type='file';file.accept='.json,application/json';file.hidden=true;tools.append(file);
  button(tools,'导入旧说明或备份',()=>file.click());
  file.onchange=async()=>{try{const chosen=file.files[0];if(!chosen)return;if(chosen.size>2000000)throw Error('说明文件不能超过2MB');const parsed=JSON.parse(await chosen.text());
    if(typeof parsed.name==='string'&&parsed.definition&&parsed.stats&&Array.isArray(parsed.military)){
        if(dirty&&!confirm('放弃当前未保存的编辑并导入此备份？'))return;
        const same=parsed.account_id===options.accountId&&parsed.location_key===documentData.location_key;
        const copy=structuredClone(parsed);if(!same){copy.military=copy.military.map(u=>({...u,id:null,equipment:(u.equipment||[]).map(e=>({...e,id:null}))}));copy.stationed_employee_ids=[];delete copy.definition._legacy_import;}
        renderEditor({...documentData,...copy,account_id:options.accountId,location_key:documentData.location_key,revision:documentData.revision,available_employees:workspace.available_employees||[]});dirty=true;return;
    }
    const entries=Object.entries(parsed).filter(([key,value])=>key!=='overview'&&value&&typeof value==='object'&&!Array.isArray(value));if(!entries.length)throw Error('没有找到可导入的领地说明');
    const chooser=node('select');chooser.setAttribute('aria-label','旧文件中的领地');for(const [key,value] of entries)chooser.append(new Option(value.name||key,key));tools.append(chooser);
    button(tools,'应用选中的说明',()=>{if(dirty&&!confirm('这将放弃当前尚未保存的编辑，继续导入吗？'))return;const old=parsed[chooser.value],definition={};for(const key of ['order','raceData','faithData','menus','lore'])if(old[key]!==undefined)definition[key]=old[key];renderEditor({...documentData,name:documentData.name||old.name||'',subtitle:documentData.subtitle||old.subtitle||'',definition});dirty=true;});
   }catch(e){status.textContent='导入失败：'+e.message;}};
  const body=node('fieldset');body.className='tm-body';form.append(body);
  const tabs=node('nav');tabs.className='tm-tabs';tabs.setAttribute('aria-label','领地编辑分类');body.append(tabs);const panels={},tabButtons={};
  function showTab(key){activeTab=key;for(const [id,panel] of Object.entries(panels)){panel.hidden=id!==key;tabButtons[id].setAttribute('aria-pressed',String(id===key));}}
  for(const [id,title] of [['basics','基本与分派'],['finance','人口与财政'],['military','军队与装备'],['personnel','驻地人员'],['composition','种族与信仰'],['lore','说明条目']]){const panel=node('section');panel.dataset.tmSection=id;panel.className='tm-section';panels[id]=panel;body.append(panel);tabButtons[id]=button(tabs,title,()=>showTab(id));}
  showTab(activeTab);body.addEventListener('invalid',event=>{const panel=event.target.closest('[data-tm-section]');if(panel)showTab(panel.dataset.tmSection);},true);
  const name=field(panels.basics,'领地名称',data.name);name.required=true;name.maxLength=100;
  const subtitle=field(panels.basics,'副标题／行政说明',data.subtitle);subtitle.maxLength=300;
  const activeWrap=node('label'),active=node('input');active.type='checkbox';active.checked=data.active;activeWrap.append(active,document.createTextNode('分派给该玩家（取消勾选为收回，保留历史数据）'));panels.basics.append(activeWrap);
  const stats=node('div');stats.className='tm-row';panels.finance.append(stats);const population=field(stats,'人口',data.stats?.population??0,'number'),tax=field(stats,'人头税 GP／人',data.stats?.tax_rate??1.2,'number'),subsidy=field(stats,'每月补贴 GP',data.stats?.subsidy??0,'number');population.min=tax.min=0;population.step=1;
  const profitShare=field(stats,'玩家净收益分成 %',data.profit_share_percent??100,'number');profitShare.min=0;profitShare.max=100;profitShare.step='0.01';
  const definition=data.definition||{},order=definition.order||{},orderStatus=presetField(panels.basics,'治安状态',order.status||'',Object.keys(orderColors).map(v=>[v,v||'未设置'])),orderDesc=field(panels.basics,'治安说明',order.desc,'textarea'),orderColor=colorControl(panels.basics,'治安颜色',order.color,order.color_mode,()=>orderColors[orderStatus.value]||orderColors['']);
  orderStatus.onChange(()=>{if(orderStatus.isPreset)orderColor.useAuto();else orderColor.refresh();});
  const incomes=moneyEditor(panels.finance,'收入项目',data.incomes||[],true),expenses=moneyEditor(panels.finance,'支出项目',data.expenses||[],false);
  const military=militaryEditor(panels.military,data.military),personnel=personnelEditor(panels.personnel,data);
  const race=compositionEditor(panels.composition,'种族构成',definition.raceData),faith=compositionEditor(panels.composition,'信仰构成',definition.faithData),lore=loreEditor(panels.lore,definition);
  const preview=node('output');preview.id='tm-budget-preview';panels.finance.append(preview);
  function budgetPreview(){try{const ids=personnel().map(String),staff=(data.available_employees||[]).filter(e=>ids.includes(String(e.id))&&['在职','科研中','出差'].includes(e.status)),result=TerritoryFinance.calculate({population:population.value,tax_rate:tax.value,subsidy:subsidy.value},incomes(),expenses(),staff,profitShare.value);preview.textContent='每月预计：收入 '+result.total_income.toFixed(2)+' GP · 支出 '+result.total_expense.toFixed(2)+' GP（含驻地人员）· 领地净额 '+result.net_income.toFixed(2)+' GP · 玩家分成 '+result.profit_share_percent+'%：'+result.player_net_income.toFixed(2)+' GP';}catch(e){preview.textContent=e.message;}}
  budgetPreview();
  const save=node('button','保存并分派');save.type='submit';form.append(status,save);form.oninput=()=>{dirty=true;budgetPreview();};
  const collect=()=>({name:name.value.trim(),subtitle:subtitle.value,active:active.checked,profit_share_percent:TerritoryFinance.sharePercent(profitShare.value),stats:{population:Number(population.value),tax_rate:Number(tax.value),subsidy:Number(subsidy.value)},incomes:incomes(),expenses:expenses(),military:military(),stationed_employee_ids:personnel(),definition:{...definition,order:{...order,status:orderStatus.value,desc:orderDesc.value,color:orderColor.value,color_mode:orderColor.mode},raceData:race(),faithData:faith(),...lore()}});
  button(tools,'导出当前备份',()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify({...collect(),account_id:options.accountId,location_key:data.location_key},null,2)],{type:'application/json'})),link=node('a');link.href=url;link.download=(name.value.trim()||'领地')+'-备份.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status.textContent=e.message;}});
  button(tools,'复制为新领地',()=>{try{const copy=structuredClone(collect());copy.name=(copy.name||'领地')+'（副本）';copy.military=copy.military.map(u=>({...u,id:null,equipment:u.equipment.map(e=>({...e,id:null}))}));copy.stationed_employee_ids=[];delete copy.definition._legacy_import;renderEditor({...draft(),...copy});dirty=true;}catch(e){status.textContent=e.message;}});
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;let payload;
   try{payload=collect();}catch(e){status.textContent=e.message;return;}
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
 root.TerritoryManager={start,open,presets:{trainingScores,orderColors,unitTypes,equipmentCategories,lorePresets}};
})(globalThis);
