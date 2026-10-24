import fs from 'node:fs';
import path from 'node:path';

const input=process.argv[2]||'upstream',output=process.argv[3]||'public/data';
const list=x=>Array.isArray(x)?x:[];
const unique=(xs,key=x=>x.id||x.name)=>{const set=new Set();return xs.filter(x=>{const k=key(x);if(set.has(k))return false;set.add(k);return true;});};
const norm=s=>String(s||'').toLowerCase().trim();
const slug=s=>s.replace(/\.json$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
if(!fs.existsSync(input))throw Error('Missing BSData directory: '+input);
fs.mkdirSync(output,{recursive:true});
const docs=[];
for(const file of fs.readdirSync(input).filter(x=>x.endsWith('.json'))){
 try{const obj=JSON.parse(fs.readFileSync(path.join(input,file),'utf8'));const root=obj.catalogue||obj.gameSystem;if(root)docs.push({file,root,system:!!obj.gameSystem});}
 catch(e){console.warn('Skipping '+file+': '+e.message);}
}
const system=docs.find(x=>x.system)?.root;
if(!system)throw Error('Warhammer 40,000 game system file missing');
const ids=new Map(),names=new Map(),types=new Map(),catIds=new Set();
function index(node,key=''){
 if(!node||typeof node!=='object')return;
 if(Array.isArray(node)){node.forEach(x=>index(x,key));return;}
 if(node.id&&node.name){
  names.set(node.id,node.name);
  if(!node.targetId){
   if(!ids.has(node.id))ids.set(node.id,node);
   const type=node.type||(/rule/i.test(key)?'rule':/category/i.test(key)?'category':/profiles?/i.test(key)?'profile':'');
   if(type)types.set(node.id,type);
   if(/categor/i.test(key))catIds.add(node.id);
  }
 }
 for(const [k,v] of Object.entries(node))
  if(v&&typeof v==='object'&&!['modifiers','modifierGroups','conditions','conditionGroups','constraints','characteristics'].includes(k))index(v,k);
}
docs.forEach(d=>index(d.root));
function resolve(link){
 if(!link?.targetId)return link;
 const orig=ids.get(link.targetId);
 if(!orig)return link;
 const out={...orig,...link,type:orig.type||link.type};
 for(const k of ['profiles','rules','selectionEntries','selectionEntryGroups','entryLinks','infoLinks','categoryLinks','modifiers','modifierGroups','constraints','costs'])
  if(orig[k]&&link[k])out[k]=[...list(orig[k]),...list(link[k])];
 return out;
}
const children=n=>['selectionEntries','selectionEntryGroups','entryLinks'].flatMap(k=>list(n[k]));
const excluded=/^(enhancements?|crusade|weapon modifications?|weapon upgrades?|battle honours?|battle honors?|experience points|legendary veterans|show\/hide options?|configuration|order of battle|stratagems?|detachments?)$/i;
function ownedWalk(source,visit,depth=0,visited=new Set()){
 if(!source||depth>14)return;
 const node=resolve(source);
 if(depth&&excluded.test(node.name||''))return;
 const id=node.targetId||node.id;
 if(id&&visited.has(id))return;
 const seen=new Set(visited);if(id)seen.add(id);
 visit(node,depth);
 for(const child of children(node))ownedWalk(child,visit,depth+1,seen);
}
const fields=p=>Object.fromEntries(list(p.characteristics).map(c=>[c.name,c['$text']??c.value??'']));
const profiles=source=>{
 const result=[];
 ownedWalk(source,n=>{for(const p of list(n.profiles))if(p.characteristics)result.push({id:p.id,name:p.name,type:p.typeName||'',fields:fields(p)});});
 return unique(result,p=>p.id||p.name+'|'+p.type);
};
const conditionName=x=>x.childName||names.get(x.childId)||x.childId||'unknown selection';
let detachmentMap=new Map(),enhancementMap=new Map();
const classify=x=>detachmentMap.has(x.childId)?'detachment':enhancementMap.has(x.childId)?'enhancement':
 /associations/i.test(x.field||'')?'character':types.get(x.childId)==='unit'||types.get(x.childId)==='model'?'unit':'selection';
function term(cond,negative=false){
 const name=conditionName(cond);
 const kind=classify(cond);
 const rel=cond.type||'';
 const val=Number(cond.value);
 // Hidden when a condition is true => show when that condition is false.
 const operator=negative?({lessThan:'atLeast',atMost:'greaterThan',atLeast:'lessThan',greaterThan:'atMost',equalTo:'notEqualTo',notEqualTo:'equalTo',instanceOf:'notInstanceOf',notInstanceOf:'instanceOf'}[rel]||('not '+rel)):rel;
 const positive=['atLeast','greaterThan','equalTo','instanceOf'].includes(operator);
 const negativeMatch=['lessThan','atMost','notEqualTo','notInstanceOf'].includes(operator);
 const present=positive&&(val===1||val===0&&operator==='greaterThan');
 const absent=negativeMatch&&(val===1&&operator==='lessThan'||val===0&&operator==='atMost');
 let description;
 if(kind==='character' && /associations/i.test(cond.field||'')){
   description=present?name+' must be attached to or associated with this unit (if a Leader, it is leading the unit)':
     absent?name+' must not be attached to or associated with this unit':name+' association: '+operator+' '+String(cond.value);
 }else if(kind==='detachment'){
   description=present?'Detachment: '+name:absent?'Detachment is not '+name:'Detachment '+name+' ('+operator+' '+cond.value+')';
 }else if(kind==='enhancement'){
   description=present?'Enhancement: '+name:absent?'Without enhancement '+name:'Enhancement '+name+' ('+operator+' '+cond.value+')';
 }else{
   description=present?'Requires '+name:absent?'Requires no '+name:name+' ('+operator+' '+String(cond.value)+', '+(cond.scope||'selection')+')';
 }
 return {kind,name,id:cond.childId,description,operator,value:cond.value,field:cond.field,scope:cond.scope};
}
function expression(node,invert=false){
 if(!node||typeof node!=='object')return {text:'',requirements:[]};
 if(Array.isArray(node)){
  const parts=node.map(x=>expression(x,invert)).filter(x=>x.text);
  return {text:parts.map(p=>p.text).join(invert?' OR ':' AND '),requirements:unique(parts.flatMap(p=>p.requirements),x=>x.id+'|'+x.description)};
 }
 const group=node.conditionGroups||node.conditions;
 if(group){
  const parts=[...list(node.conditions),...list(node.conditionGroups)].map(x=>expression(x,invert)).filter(x=>x.text);
  const op=norm(node.type)==='or'?'OR':'AND';
  return {text:parts.map(p=>p.text).join(invert?(op==='AND'?' OR ':' AND '):' '+op+' '),requirements:unique(parts.flatMap(p=>p.requirements),x=>x.id+'|'+x.description)};
 }
 if(node.childId&&node.type){
  // A generic roster force gate does not convey rules eligibility.
  if(node.field==='forces' && !detachmentMap.has(node.childId))return {text:'',requirements:[]};
  const t=term(node,invert);
  return {text:t.description,requirements:[t]};
 }
 return {text:'',requirements:[]};
}
function gate(source,hiddenOnly=false){
 const mods=[...list(source.modifiers),...list(source.modifierGroups).flatMap(g=>list(g.modifiers))];
 const matched=mods.filter(m=>!hiddenOnly||m.field==='hidden'&&m.type==='set'&&(m.value===true||String(m.value)==='true'));
 const expressions=[];
 for(const m of matched){
  if(!m.conditions&&!m.conditionGroups)continue;
  const base=m.conditionGroups?.length?expression({type:'and',conditionGroups:m.conditionGroups},hiddenOnly):expression({type:'and',conditions:m.conditions},hiddenOnly);
  if(base.text)expressions.push(base);
 }
 return {text:expressions.map(x=>x.text).join(' / '),requirements:unique(expressions.flatMap(x=>x.requirements),x=>x.id+'|'+x.description)};
}
function unconditionalHide(x){return x.hidden===true||list(x.modifiers).some(m=>m.field==='hidden'&&String(m.value)==='true'&&!list(m.conditions).length&&!list(m.conditionGroups).length);}
function collectRules(source,includeUpgrade=false){
 const rules=[],conditional=[];
 ownedWalk(source,n=>{
  if(!['unit','model'].includes(n.type)&&!(includeUpgrade&&n===resolve(source)))return;
  for(const raw of [...list(n.rules),...list(n.infoLinks).filter(x=>x.type==='rule')]){
   if(unconditionalHide(raw))continue;
   const r=resolve(raw);if(!r?.description)continue;
   const entry={id:r.targetId||r.id,name:r.name,description:r.description};
   const test=gate(raw,true);
   if(test.requirements.length)conditional.push({...entry,requirements:test.requirements,conditionText:test.text});
   else rules.push(entry);
  }
 });
 return {rules:unique(rules,x=>x.name),conditionalRules:unique(conditional,x=>x.name+'|'+x.conditionText)};
}
function unitCategories(n){
 const name=norm(n.name);
 return unique(list(n.categoryLinks).map(x=>x.name||names.get(x.targetId)).filter(x=>{
  if(!x)return false;
  if(/^(?:faction:|unit$|configuration$|imperium$|chaos$|xenos$)/i.test(x))return false;
  if(norm(x)===name)return false; // unit-name labels are not unit keywords
  // Named categories used solely to count specific datasheets aren't rules keywords.
  if(list(n.categoryLinks).some(c=>norm(c.name)===norm(n.name))&&norm(x)===name)return false;
  return true;
 }),x=>norm(x));
}
function statGroup(n){
 const costs=list(n.costs);return costs.find(x=>/^(pts|points)$/i.test(x.name||''))?.value??null;
}
function nonweaponProfiles(n){return profiles(n).filter(p=>!/weapons?/i.test(p.type));}
const WEAPON=/weapons?/i;
function parseMode(name,owner){
 let trimmed=String(name||'').replace(/^\s*[➤►→]\s*/,'').trim();
 const suffix=trimmed.match(/^(.*?)\s+-\s+(Standard|Supercharge|Overcharge|Focused|Dispersed|Strike|Sweep|High Power|Low Power|Heavy|Light|Maximal|Safe|Focused Fire|Spread Fire)$/i);
 if(suffix)return {base:suffix[1].trim(),mode:suffix[2]};
 if(/^\s*[➤►→]/.test(name)&&trimmed.toLowerCase().startsWith((owner.name||'').toLowerCase()))return {base:owner.name,mode:trimmed.substring(owner.name.length).replace(/^[\s\-:]+/,'').trim()||'Profile'};
 return {base:trimmed,mode:''};
}
function allWeapons(unit){
 const found=[];
 ownedWalk(unit,(owner)=>{
  for(const p of list(owner.profiles)){
   if(!WEAPON.test(p.typeName||''))continue;
   const parsed=parseMode(p.name,owner);
   found.push({id:p.id,ownerId:owner.id,name:parsed.base,mode:parsed.mode,type:p.typeName,fields:fields(p),owner:owner.name});
  }
 });
 const buckets=new Map();
 for(const p of unique(found,x=>x.id)){
  const key=norm(p.name)+'|'+p.type;
  if(!buckets.has(key))buckets.set(key,{id:p.ownerId||p.id,name:p.name,type:p.type,modes:[],sourceOwner:p.owner});
  buckets.get(key).modes.push({id:p.id,name:p.mode||'Profile',fields:p.fields});
 }
 return [...buckets.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
}
function enumerateOwnedWeaponNames(node){return unique(allWeapons(node).map(w=>w.name),x=>norm(x));}
function chooseGroups(unit){
 const groups=[],loadouts=[];
 // A group with min=max=1 represents XOR weapons, not a second attack profile.
 const visit=(raw,depth=0,seen=new Set(),model='')=>{
  if(!raw||depth>11)return;
  const n=resolve(raw),id=n.targetId||n.id;
  if(depth&&excluded.test(n.name||''))return;
  if(id&&seen.has(id))return;
  const next=new Set(seen);if(id)next.add(id);
  const currentModel=n.type==='model'?n.name:model;
  const variants=children(n).map(resolve);
  if(n.selectionEntries||n.entryLinks){
   // Sibling models inside the same unit can carry different weapons.
   const models=variants.filter(x=>x.type==='model');
   if(models.length>=2){
    const limits=list(n.constraints).filter(c=>c.field==='selections');
    loadouts.push({id:n.id,name:n.name,
      min:limits.find(c=>c.type==='min')?.value??0,
      max:limits.find(c=>c.type==='max')?.value??null,
      variants:models.map(m=>({name:m.name,weapons:enumerateOwnedWeaponNames(m),requirements:gate(m,true).requirements,conditions:modNotes(m)}))
    });
   }
  }
  if(n.selectionEntryGroups || n.entryLinks){
   const choices=[...list(n.selectionEntryGroups),...list(n.entryLinks).filter(x=>x.type==='selectionEntryGroup')].map(resolve);
   for(const grp of choices){
    if(excluded.test(grp.name||''))continue;
    const options=[...list(grp.selectionEntries),...list(grp.entryLinks)].map(resolve);
    if(options.length<2)continue;
    const constraints=list(grp.constraints).filter(c=>c.field==='selections');
    const max=constraints.find(c=>c.type==='max')?.value,min=constraints.find(c=>c.type==='min')?.value??0;
    if(max!==1)continue;
    groups.push({id:grp.id,name:grp.name,model:currentModel,min,max,defaultId:grp.defaultSelectionEntryId,
     options:options.map(o=>({
       id:o.id,name:o.name,default:o.id===grp.defaultSelectionEntryId,
       weapons:enumerateOwnedWeaponNames(o),points:statGroup(o),
       requirements:gate(o,true).requirements,notes:modNotes(o)
     }))});
   }
  }
  for(const c of children(n))visit(c,depth+1,next,currentModel);
 };
 visit(unit);
 return {choices:unique(groups),loadouts:unique(loadouts)};
}
function modNotes(item){
 const result=[];
 const constr=new Map(list(item.constraints).map(c=>[c.id,c]));
 for(const m of list(item.modifiers)){
  if(m.type==='set'&&Number(m.value)===0&&constr.has(m.field)){
   const cond=gate({modifiers:[m]}).requirements;
   if(cond.length)result.push('Unavailable when '+cond.map(x=>x.name).join(', ')+' is selected.');
  }
 }
 return unique(result,x=>x);
}

function optionalGear(source){
 const found=[];
 // Wargear additions have their own optional constraints, unlike
 // mutually exclusive weapon groups which are already represented elsewhere.
 const visit=(raw,depth=0,seen=new Set(),model='')=>{
  if(!raw||depth>10)return;
  const n=resolve(raw),id=n.targetId||n.id;
  if(depth&&excluded.test(n.name||''))return;
  if(id&&seen.has(id))return;
  const next=new Set(seen);if(id)next.add(id);
  const currentModel=n.type==='model'?n.name:model;
  if(/^wargear$/i.test(n.name||'')){
   for(const rawOption of [...list(n.selectionEntries),...list(n.entryLinks)]){
    const option=resolve(rawOption);
    if(option.type==='selectionEntryGroup')continue;
    const lim=list(option.constraints).filter(c=>c.field==='selections');
    const min=lim.find(c=>c.type==='min')?.value??0,max=lim.find(c=>c.type==='max')?.value??null;
    if(min>0||max===0)continue;
    const owned=enumerateOwnedWeaponNames(option);
    found.push({id:option.id,name:option.name,model:currentModel,weapons:owned,
      max,requirements:gate(option,true).requirements,notes:modNotes(option)});
   }
  }
  for(const child of children(n))visit(child,depth+1,next,currentModel);
 };
 visit(source);
 return unique(found,x=>x.id);
}
function extraConditionalRules(source){
 const result=[];
 ownedWalk(source,n=>{
  for(const g of list(n.modifierGroups)){
   const req=expression(g);
   if(!req.requirements.length)continue;
   for(const m of list(g.modifiers)){
    if(m.field!=='add-info')continue;
    const linked=ids.get(String(m.value));
    if(!linked?.description)continue;
    result.push({id:linked.id,name:linked.name,description:linked.description,
      requirements:req.requirements,conditionText:req.text});
   }
  }
  for(const m of list(n.modifiers)){
   if(m.field!=='add-info')continue;
   const req=expression(m);if(!req.requirements.length)continue;
   const linked=ids.get(String(m.value));if(!linked?.description)continue;
   result.push({id:linked.id,name:linked.name,description:linked.description,
     requirements:req.requirements,conditionText:req.text});
  }
 });
 return unique(result,x=>x.name+'|'+x.conditionText);
}
function interpretModifier(mod){
 const value=String(mod.value??'');
 const fieldName=names.get(mod.field)||mod.field;
 const path=String(mod.affects||'');
 if(mod.field==='add-info'&&ids.get(value)?.name)return 'Gains '+ids.get(value).name+' ability.';
 if(mod.field==='add-info'&&ids.get(value)?.description)return 'Gains '+ids.get(value).name+' ability.';
 if(mod.type==='append'&&/Keywords/i.test(fieldName))return (/Ranged Weapons/i.test(path)?'Ranged weapons':/Melee Weapons/i.test(path)?'Melee weapons':'Weapons')+' gain '+value+'.';
 if(['increment','decrement','set'].includes(mod.type)&&/^(A|S|AP|D|WS|BS|Range|Keywords)$/i.test(fieldName)){
  const what=path.includes('Ranged Weapons')?'ranged weapons':path.includes('Melee Weapons')?'melee weapons':'affected profiles';
  return what+' '+fieldName+' '+(mod.type==='increment'?'+':mod.type==='decrement'?'-':'=')+value+'.';
 }
 return '';
}
function conditionalEffects(source){
 const effects=[];
 ownedWalk(source,n=>{
  for(const group of list(n.modifierGroups)){
   const guard=expression(group);
   if(!guard.requirements.length)continue;
   const actions=unique(list(group.modifiers).map(interpretModifier).filter(Boolean),x=>x);
   if(!actions.length)continue;
   effects.push({id:group.id||n.id,name:actions.join(' '),description:actions.join(' '),requirements:guard.requirements,conditionText:guard.text});
  }
  for(const m of list(n.modifiers)){
   const guard=expression(m);
   if(!guard.requirements.length)continue;
   const action=interpretModifier(m);
   if(action)effects.push({id:m.id||n.id,name:action,description:action,requirements:guard.requirements,conditionText:guard.text});
  }
 });
 return unique(effects,x=>x.name+'|'+x.conditionText);
}
function readEntry(source,{enhance=false}={}){
 const node=resolve(source),associated=collectRules(node,true),cho=chooseGroups(node);
 return {
  id:node.id,name:node.name,profiles:nonweaponProfiles(node),weapons:enhance?[]:allWeapons(node),
  rules:associated.rules,conditionalRules:enhance?associated.conditionalRules:unique([...associated.conditionalRules,...extraConditionalRules(node)],x=>x.name+'|'+x.conditionText),
  conditions:[],requirements:gate(node,true).requirements,
  conditionText:gate(node,true).text,conditionalEffects:enhance?[]:conditionalEffects(node),
  categories:unitCategories(node),points:statGroup(node),
  weaponChoices:enhance?[]:cho.choices,loadouts:enhance?[]:cho.loadouts,optionalGear:enhance?[]:optionalGear(node),
  enhancements:[]
 };
}
function detachmentEntries(root){
 const found=[];
 const visited=new Set();
 const seek=(source,depth=0)=>{
  if(!source||depth>7)return;
  const n=resolve(source);
  const id=n.targetId||n.id;if(id&&visited.has(id))return;if(id)visited.add(id);
  if(/^(detachment|detachments)$/i.test(n.name||'')){
   // Nested "Detachment" selectionEntry -> "Detachment" selectionEntryGroup -> choices.
   const groups=[...list(n.selectionEntryGroups),...list(n.entryLinks).filter(x=>x.type==='selectionEntryGroup')].map(resolve);
   for(const g of groups.filter(x=>/detachment/i.test(x.name||''))){
    for(const option of [...list(g.selectionEntries),...list(g.entryLinks)]){
      const d=resolve(option);if(d.type==='upgrade'&&d.name&&!/^(none|detachment)$/i.test(d.name))found.push(d);
    }
   }
   // Also support files where detachment choices live directly under the first group.
   for(const child of [...list(n.selectionEntries),...list(n.entryLinks)]){
    const d=resolve(child);if(d.type==='upgrade' && /detachment/i.test(n.name||''))found.push(d);
   }
   return;
  }
  if(depth<4)for(const child of children(n))seek(child,depth+1);
 };
 for(const child of children(root))seek(child);
 return unique(found,x=>x.id);
}
const factionData=[];
for(const doc of docs){
 if(doc.system||doc.root.library)continue;
 const root=doc.root;
 const detNodes=detachmentEntries(root);
 detachmentMap=new Map(detNodes.map(x=>[x.id,x.name]));
 const enhancementNodes=[];
 for(const group of list(root.sharedSelectionEntryGroups).filter(g=>/^enhancements?$/i.test(g.name||'')))
  enhancementNodes.push(...list(group.selectionEntries),...list(group.entryLinks));
 enhancementMap=new Map(enhancementNodes.map(e=>[e.id,e.name]));
 const detachmentByName=new Map(detNodes.map(x=>[norm(x.name),x.id]));
 function enhancement(source,inherited=''){
  const n=resolve(source),base=readEntry(n,{enhance:true});
  const stated=n.comment?.trim()||inherited;
  let detachment=detachmentByName.get(norm(stated)) ? {id:detachmentByName.get(norm(stated)),name:detachmentMap.get(detachmentByName.get(norm(stated)))}:null;
  if(!detachment){
   const idsInGate=gate(n,true).requirements.filter(x=>x.kind==='detachment');
   if(idsInGate.length===1)detachment={id:idsInGate[0].id,name:idsInGate[0].name};
  }
  return {...base,description:base.profiles.map(p=>Object.values(p.fields).join('\n')).join('\n'),
    detachment,comment:n.comment||'',source:'enhancement'};
 }
 const allEnhancements=unique(enhancementNodes.map(x=>enhancement(x)),x=>norm(x.name));
 const candidate=[...list(root.entryLinks),...list(root.selectionEntries)];
 for(const link of list(root.catalogueLinks)){
  if(!link.importRootEntries)continue;
  const imported=docs.find(x=>x.root.id===link.targetId);
  if(imported)candidate.push(...list(imported.root.entryLinks),...list(imported.root.selectionEntries),...list(imported.root.sharedSelectionEntries));
 }
 function unitEnhancements(raw){
  const results=[];
  const visit=(src,depth=0,seen=new Set())=>{
   if(!src||depth>10)return;
   const n=resolve(src),id=n.targetId||n.id;
   if(id&&seen.has(id))return;
   const next=new Set(seen);if(id)next.add(id);
   if(/^(crusade|weapon modifications?|weapon upgrades?)$/i.test(n.name||''))return;
   if(/^enhancements?$/i.test(n.name||'')){
    const groupGate=gate(n,true);
    const dg=groupGate.requirements.find(r=>r.kind==='detachment');
    for(const c of [...list(n.selectionEntries),...list(n.entryLinks)]) {
      const e=enhancement(c,dg?.name||'');
      if(!e.detachment&&dg)e.detachment={id:dg.id,name:dg.name};
      e.requirements=unique([...e.requirements,...groupGate.requirements],x=>x.id+'|'+x.description);
      results.push(e);
    }
    return;
   }
   for(const c of children(n))visit(c,depth+1,next);
  };
  visit(raw);
  return unique(results,x=>norm(x.name));
 }
 const units=unique(candidate.map(resolve).filter(x=>['unit','model'].includes(x.type)&&!x.hidden&&!/^(show|detachment|order of battle)/i.test(x.name||'')).map(x=>{
  const data=readEntry(x);
  data.enhancements=unitEnhancements(x);
  return data;
 }),x=>norm(x.name)).sort((a,b)=>a.name.localeCompare(b.name));
 for(const u of units)for(const e of u.enhancements)if(!allEnhancements.some(x=>norm(x.name)===norm(e.name)))allEnhancements.push(e);
 const detachments=detNodes.map(node=>{
  const x=readEntry(node,{enhance:true});
  x.rules=collectRules(node,true).rules;
  x.enhancements=allEnhancements.filter(e=>e.detachment?.id===node.id);
  x.stratagems=[]; // BSData does not reliably supply WHEN / TARGET / EFFECT cards.
  return x;
 });
 const armyRules=unique([...list(root.sharedRules),...list(root.rules),...list(root.sharedProfiles)].map(r=>({
   id:r.id,name:r.name,description:r.characteristics?Object.values(fields(r)).join('\n'):r.description||''
 })).filter(r=>r.description),x=>norm(x.name));
 const allRules=[...list(system.sharedRules).map(r=>({name:r.name,alias:list(r.alias)})),...armyRules];
 const matches=name=>{
  const q=norm(name).replace(/[[\]]/g,'');
  return allRules.filter(r=>[r.name,...(r.alias||[])].some(a=>{
   const k=norm(a).replace(/[[\]]/g,'');
   return q===k||q.startsWith(k+' ')||(k==='anti'&&q.startsWith('anti-'));
  })).map(r=>r.name);
 };
 const refMap={};
 const add=(name,ref)=>{
  if(!name)return;
  for(const alias of matches(name)){
   (refMap[alias]??=[]).push(ref);
  }
 };
 for(const unit of units){
  const ref={kind:'unit',id:unit.id,name:unit.name};
  for(const rule of [...unit.rules,...unit.conditionalRules])add(rule.name,ref);
  for(const effect of unit.conditionalEffects)for(const word of effect.name.match(/\b(?:Assault|Rapid Fire|Sustained Hits|Lethal Hits|Deep Strike|Fights First|Stealth)\b/gi)||[])add(word,{...ref,detail:'Conditional modification'});
  for(const weapon of unit.weapons)for(const mode of weapon.modes)
    for(const keyword of String(mode.fields.Keywords||'').split(/,\s*/).filter(Boolean))add(keyword,{...ref,detail:weapon.name});
 }
 for(const det of detachments)for(const rule of [...det.rules,...det.conditionalRules])add(rule.name,{kind:'detachment',id:det.id,name:det.name});
 for(const enh of allEnhancements){
  for(const rule of [...enh.rules,...enh.conditionalRules])add(rule.name,{kind:'enhancement',id:enh.id,name:enh.name,detachmentId:enh.detachment?.id||null});
  const text=enh.description||'';
  for(const token of text.match(/\[[^\]]+\]/g)||[])add(token,{kind:'enhancement',id:enh.id,name:enh.name,detachmentId:enh.detachment?.id||null});
 }
 const references=Object.fromEntries(Object.entries(refMap).map(([name,refs])=>[name,unique(refs,x=>x.kind+'|'+x.id+'|'+(x.detail||''))]));
 const result={name:root.name,sourceFile:doc.file,revision:root.revision,units,detachments,enhancements:allEnhancements,rules:armyRules,references};
 fs.writeFileSync(path.join(output,slug(doc.file)+'.json'),JSON.stringify(result));
 factionData.push({slug:slug(doc.file),name:root.name,units:units.length,detachments:detachments.length});
 console.log(root.name+': '+units.length+' datasheets, '+detachments.length+' detachments, '+allEnhancements.length+' enhancements');
}
const core=unique([...list(system.sharedRules),...list(system.sharedProfiles)].map(x=>({id:x.id,name:x.name,description:x.characteristics?Object.values(fields(x)).join('\n'):x.description||'',aliases:list(x.alias)})).filter(x=>x.description),x=>norm(x.name));
fs.writeFileSync(path.join(output,'core.json'),JSON.stringify({name:system.name,rules:core,revision:system.revision,complete:false}));
fs.writeFileSync(path.join(output,'index.json'),JSON.stringify({edition:11,updated:new Date().toISOString(),source:'BSData/wh40k-11e',factions:factionData.sort((a,b)=>a.name.localeCompare(b.name))}));
console.log('Imported '+factionData.length+' factions');
