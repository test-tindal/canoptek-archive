import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2]||'upstream',output=process.argv[3]||'public/data';
fs.mkdirSync(output,{recursive:true});
const docs=[];
for(const file of fs.readdirSync(input).filter(x=>x.endsWith('.json'))){
  try{const obj=JSON.parse(fs.readFileSync(path.join(input,file),'utf8'));const root=obj.catalogue||obj.gameSystem;if(root)docs.push({file,root,system:!!obj.gameSystem});}catch(e){console.warn('Skipping',file,e.message)}
}
const ids=new Map(),names=new Map();
function index(node){
 if(!node||typeof node!=='object')return;
 if(Array.isArray(node)){node.forEach(index);return;}
 if(node.id&&node.name){names.set(node.id,node.name);if(!node.targetId)ids.set(node.id,node);}
 for(const [k,v] of Object.entries(node))if(!['modifiers','constraints','conditions','conditionGroups','characteristics'].includes(k)&&typeof v==='object')index(v);
}
docs.forEach(d=>index(d.root));
const list=x=>Array.isArray(x)?x:[];
function resolve(node){
 if(!node?.targetId)return node;
 const original=ids.get(node.targetId);
 if(!original)return node;
 const merged={...original,...node,type:original.type||node.type};
 for(const key of ['profiles','rules','selectionEntries','selectionEntryGroups','entryLinks','infoLinks','categoryLinks','costs','modifiers'])
  if(original[key]&&node[key])merged[key]=[...list(original[key]),...list(node[key])];
 return merged;
}
const CHILDREN=['selectionEntries','selectionEntryGroups','entryLinks','infoLinks','rules','profiles'];
function walk(node,visit,depth=0,seen=new Set()){
 if(!node||depth>11)return;
 const n=resolve(node),id=n.targetId||n.id;
 if(id&&seen.has(id))return;
 const next=new Set(seen);if(id)next.add(id);
 visit(n,depth);
 for(const key of CHILDREN)for(const child of list(n[key]))walk(child,visit,depth+1,next);
}
function uniq(items,key=x=>x.id||x.name){const seen=new Set();return items.filter(x=>{const id=key(x);if(seen.has(id))return false;seen.add(id);return true;});}
function fields(p){return Object.fromEntries(list(p.characteristics).map(c=>[c.name,c['$text']??c.value??'']));}
function profiles(n){const found=[];walk(n,item=>{if(item.typeName&&item.characteristics)found.push({id:item.id,name:item.name,type:item.typeName,fields:fields(item)});});return uniq(found);}
function rules(n){const found=[];walk(n,item=>{if(item.type==='rule'&&item.description)found.push({id:item.id,name:item.name,description:item.description});});return uniq(found);}
function conditions(n){const found=[];function inspect(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(inspect);return;}if(x.childId&&x.field&&x.type)found.push({name:names.get(x.childId)||x.childId,operator:x.type,value:x.value,scope:x.scope||''});for(const key of ['conditions','conditionGroups'])inspect(x[key]);}walk(n,item=>inspect(item.modifiers));return uniq(found,x=>JSON.stringify(x));}
function categories(n){return [...new Set(list(n.categoryLinks).map(x=>x.name||names.get(x.targetId)).filter(Boolean))];}
function entry(n){const item=resolve(n);return {id:item.id,name:item.name,profiles:profiles(item),rules:rules(item),conditions:conditions(item),categories:categories(item),points:list(item.costs).find(x=>x.name==='pts')?.value??null};}
function enhancements(n){
 const found=[];
 walk(n,(item,depth)=>{
  if(!/enhancements?/i.test(item.name||''))return;
  walk(item,(x,d)=>{if(d>0&&x.type==='upgrade'&&!/^(enhancements?|none)$/i.test(x.name||''))found.push(entry(x));});
 });
 return uniq(found);
}
function detachments(root){
 const found=[];
 walk({id:'root',entryLinks:list(root.entryLinks),selectionEntries:list(root.selectionEntries)},(item,depth)=>{
  if(depth>3||!/^(detachment|detachments)$/i.test(item.name||''))return;
  for(const child of [...list(item.entryLinks),...list(item.selectionEntries),...list(item.selectionEntryGroups)]){
   const x=resolve(child);
   if(x.name&&!/^(none|detachment)$/i.test(x.name))found.push({...entry(x),enhancements:enhancements(x),stratagems:[]});
  }
 });
 return uniq(found,x=>x.name);
}
const factions=[];
for(const doc of docs){
 if(doc.system||doc.root.library)continue;
 const root=doc.root;
 const candidates=[...list(root.entryLinks),...list(root.selectionEntries)];
 for(const link of list(root.catalogueLinks)){
  if(!link.importRootEntries)continue;
  const linked=docs.find(x=>x.root.id===link.targetId);
  if(linked)candidates.push(...list(linked.root.entryLinks),...list(linked.root.selectionEntries),...list(linked.root.sharedSelectionEntries));
 }
 const units=uniq(candidates.map(resolve).filter(x=>['unit','model'].includes(x.type)&&!/^(show|detachment|order of battle)/i.test(x.name||'')).map(x=>({...entry(x),enhancements:enhancements(x)})),x=>x.name.toLowerCase()).sort((a,b)=>a.name.localeCompare(b.name));
 const det=detachments(root);
 const ruleNodes=[...list(root.rules),...list(root.sharedRules),...list(root.sharedProfiles)];
 const armyRules=uniq(ruleNodes.map(x=>x.characteristics?{id:x.id,name:x.name,description:Object.values(fields(x)).join('\n')}: {id:x.id,name:x.name,description:x.description||''}).filter(x=>x.description));
 const slug=doc.file.replace(/\.json$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const result={name:root.name,sourceFile:doc.file,revision:root.revision,units,detachments:det,rules:armyRules};
 fs.writeFileSync(path.join(output,slug+'.json'),JSON.stringify(result));
 factions.push({slug,name:root.name,units:units.length,detachments:det.length});
 console.log(root.name,units.length,'units',det.length,'detachments');
}
const system=docs.find(x=>x.system)?.root;
const coreRules=[...list(system?.sharedRules).map(x=>({id:x.id,name:x.name,description:x.description||''})),...list(system?.sharedProfiles).map(x=>({id:x.id,name:x.name,description:Object.values(fields(x)).join('\n')}))].filter(x=>x.description);
fs.writeFileSync(path.join(output,'core.json'),JSON.stringify({name:system?.name||'11th Edition',rules:coreRules,complete:false}));
fs.writeFileSync(path.join(output,'index.json'),JSON.stringify({edition:11,updated:new Date().toISOString(),source:'BSData/wh40k-11e',factions:factions.sort((a,b)=>a.name.localeCompare(b.name))}));
console.log('Imported',factions.length,'factions');