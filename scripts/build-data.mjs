import fs from 'node:fs';
import path from 'node:path';

// BattleScribe catalogues are roster graphs, not flat datasheets.
// Ownership is deliberately kept separate from informational links:
// following an infoGroup or a generic upgrade group causes unrelated rules
// (e.g. Crusade weapon modifications) to leak into every unit.
const input = process.argv[2] || 'upstream';
const output = process.argv[3] || 'public/data';
const list = value => Array.isArray(value) ? value : [];
const unique = (items, key = x => x.id || x.name) => {
  const found = new Set();
  return items.filter(x => {
    const k = key(x);
    if (found.has(k)) return false;
    found.add(k);
    return true;
  });
};
if (!fs.existsSync(input)) throw new Error('Missing source directory: ' + input);
fs.mkdirSync(output, {recursive:true});

const docs = [];
for (const file of fs.readdirSync(input).filter(x => x.endsWith('.json'))) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(input,file),'utf8'));
    const root = doc.catalogue || doc.gameSystem;
    if (root) docs.push({file,root,system:!!doc.gameSystem});
  } catch (error) {
    console.warn('Skipped '+file+': '+error.message);
  }
}
if (!docs.some(d=>d.system)) throw new Error('Warhammer 40,000 game system not found');

const objects = new Map();
const names = new Map();
function index(node, parentKey='') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(x=>index(x,parentKey)); return; }
  if (node.id && node.name) {
    names.set(node.id,node.name);
    // References have a targetId. A linked instance must never replace
    // the actual target definition in the ID registry.
    if (!node.targetId && ['sharedRules','rules','sharedProfiles','profiles','sharedSelectionEntries','selectionEntries','entryLinks','sharedSelectionEntryGroups','selectionEntryGroups','sharedInfoGroups','infoGroups'].includes(parentKey)) {
      if (!objects.has(node.id)) objects.set(node.id,node);
    }
  }
  for (const [key,value] of Object.entries(node)) {
    if (['conditions','conditionGroups','constraints','modifiers','modifierGroups','characteristics'].includes(key)) continue;
    if (value && typeof value === 'object') index(value,key);
  }
}
docs.forEach(d=>index(d.root));

function resolve(node) {
  if (!node?.targetId) return node;
  const original = objects.get(node.targetId);
  if (!original) return node;
  const result = {...original,...node,type:original.type || node.type};
  for (const key of ['profiles','rules','selectionEntries','selectionEntryGroups','entryLinks','categoryLinks','costs','infoLinks','modifiers','constraints']) {
    if (original[key] && node[key]) result[key] = [...list(original[key]),...list(node[key])];
  }
  return result;
}
const OWNED_CHILDREN = ['selectionEntries','selectionEntryGroups','entryLinks'];
const excluded = /^(?:enhancements?|crusade|weapon modifications?|battle honours?|battle honors?|experience points|legendary veterans|show\/hide options?|configuration|order of battle|roster|stratagems?|detachments?)$/i;
function ownedWalk(node, visit, depth=0, visited=new Set()) {
  if (!node || depth > 15) return;
  // Only follow selection ownership; infoLinks are references to rules.
  // Never traverse infoGroups, root-shared rules, or excluded upgrade trees.
  if (depth > 0 && excluded.test(node.name || '')) return;
  const item = resolve(node);
  if (depth > 0 && excluded.test(item.name || '')) return;
  const key = item.targetId || item.id;
  if (key && visited.has(key)) return;
  const next = new Set(visited);
  if (key) next.add(key);
  visit(item,depth);
  for (const relation of OWNED_CHILDREN) {
    for (const child of list(item[relation])) ownedWalk(child,visit,depth+1,next);
  }
}
function fields(profile) {
  return Object.fromEntries(list(profile.characteristics).map(x=>[x.name,x['$text'] ?? x.value ?? '']));
}
function ownProfiles(node) {
  const profiles=[];
  ownedWalk(node,item=>{
    // Only profiles actually embedded under this datasheet and its
    // wargear/model choices are part of its profile.
    for (const p of list(item.profiles)) {
      if (p.characteristics) profiles.push({id:p.id,name:p.name,type:p.typeName || '',fields:fields(p)});
    }
  });
  return unique(profiles,p=>p.id||p.name+'|'+p.type);
}
function conditionEntries(value) {
  const result=[];
  function inspect(x,depth=0) {
    if (!x || depth>18 || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(y=>inspect(y,depth+1)); return; }
    if (x.childId && x.type && x.field) {
      result.push({target:x.childId,name:x.childName || names.get(x.childId) || x.childId,operator:x.type,field:x.field,value:x.value,scope:x.scope||''});
    }
    for (const key of ['conditions','conditionGroups']) inspect(x[key],depth+1);
  }
  inspect(value);
  return unique(result,x=>JSON.stringify(x));
}
function ownConditions(node) {
  const found=[];
  ownedWalk(node,item=>{
    found.push(...conditionEntries(item.modifiers));
    found.push(...conditionEntries(item.modifierGroups));
  });
  return unique(found,x=>JSON.stringify(x));
}
function isHiddenUnconditionally(link) {
  if (link.hidden === true) return true;
  return list(link.modifiers).some(m=>m.field==='hidden' && (m.value===true || String(m.value)==='true') && !list(m.conditions).length && !list(m.conditionGroups).length);
}
function isConditionalLink(link) {
  return list(link.modifiers).some(m=>m.field==='hidden' && (m.value===true || String(m.value)==='true') && (list(m.conditions).length>0 || list(m.conditionGroups).length>0));
}
function ownRules(node) {
  const always=[],conditional=[];
  ownedWalk(node,item=>{
    // Direct rules that belong to a unit/model, never an upgrade's
    // keywords or all rules within a linked infoGroup.
    if (['unit','model'].includes(item.type)) {
      for (const direct of list(item.rules)) {
        const r=resolve(direct);
        if(r.description && !isHiddenUnconditionally(direct)) always.push({id:r.id,name:r.name,description:r.description});
      }
      for (const link of list(item.infoLinks)) {
        if(link.type !== 'rule' || isHiddenUnconditionally(link)) continue;
        const r=resolve(link);
        if (!r.description) continue;
        const record={id:r.targetId||r.id,name:r.name,description:r.description};
        if (isConditionalLink(link)) conditional.push({...record,conditions:conditionEntries(link.modifiers)});
        else always.push(record);
      }
    }
  });
  return {rules:unique(always,x=>x.name+'|'+x.description),conditionalRules:unique(conditional,x=>x.name+'|'+x.description)};
}
function collectEnhancements(node) {
  const result=[];
  const seen=new Set();
  function find(current,depth=0) {
    if (!current || depth>11) return;
    const item=resolve(current);
    const id=item.targetId || item.id;
    if (id&&seen.has(id)) return;
    if (id) seen.add(id);
    if (/^enhancements?$/i.test(item.name||'')) {
      for (const child of [...list(item.selectionEntries),...list(item.entryLinks)]) {
        const enhancement=resolve(child);
        if (enhancement.type !== 'upgrade') continue;
        // The enhancement itself is the new ownership root.
        result.push(readEntry(enhancement,{allowEnhancements:false}));
      }
      return;
    }
    if (/^(crusade|weapon modifications?|order of battle)$/i.test(item.name||''))return;
    for(const key of OWNED_CHILDREN)for(const child of list(item[key]))find(child,depth+1);
  }
  find(node);
  return unique(result,x=>x.name);
}
function readEntry(node,{allowEnhancements=true}={}) {
  const item=resolve(node);
  const linked=ownRules(item);
  return {
    id:item.id,name:item.name,
    profiles:ownProfiles(item),
    rules:linked.rules,
    conditionalRules:linked.conditionalRules,
    conditions:ownConditions(item),
    categories:unique(list(item.categoryLinks).map(c=>c.name||names.get(c.targetId)).filter(Boolean),x=>x),
    points:list(item.costs).find(x=>/^(pts|points)$/i.test(x.name||''))?.value??null,
    enhancements:allowEnhancements?collectEnhancements(item):[]
  };
}
function findDetachments(root) {
  const result=[];
  const seen=new Set();
  function visit(node,depth=0) {
    if(!node || depth>8)return;
    const item=resolve(node);
    const key=item.targetId||item.id;
    if(key&&seen.has(key))return;
    if(key)seen.add(key);
    if(/^(detachment|detachments)$/i.test(item.name||'')) {
      for(const child of [...list(item.selectionEntries),...list(item.entryLinks),...list(item.selectionEntryGroups)]){
        const d=resolve(child);
        if(d.name && !/^(none|detachment|show\/hide)$/i.test(d.name))
          result.push({...readEntry(d),stratagems:[]});
      }
      return;
    }
    if(depth<3)for(const key of OWNED_CHILDREN)for(const child of list(item[key]))visit(child,depth+1);
  }
  for(const key of OWNED_CHILDREN)for(const child of list(root[key]))visit(child);
  return unique(result,x=>x.name);
}
const factions=[];
for(const doc of docs) {
  if(doc.system || doc.root.library)continue;
  const root=doc.root;
  const candidates=[...list(root.entryLinks),...list(root.selectionEntries)];
  for(const link of list(root.catalogueLinks)){
    if (!link.importRootEntries)continue;
    const referenced=docs.find(d=>d.root.id===link.targetId);
    if (referenced)candidates.push(...list(referenced.root.entryLinks),...list(referenced.root.selectionEntries),...list(referenced.root.sharedSelectionEntries));
  }
  const units=unique(candidates.map(resolve).filter(x=>['unit','model'].includes(x.type) && !x.hidden && !/^(show|detachment|order of battle)/i.test(x.name||'')).map(x=>readEntry(x)),x=>x.name.toLowerCase()).sort((a,b)=>a.name.localeCompare(b.name));
  const detachments=findDetachments(root);
  const armyRules=unique([...list(root.sharedRules),...list(root.rules),...list(root.sharedProfiles)].map(r=>({
    id:r.id,name:r.name,description:r.characteristics?Object.values(fields(r)).join('\n'):r.description||''
  })).filter(r=>r.description),x=>x.name);
  const slug=doc.file.replace(/\.json$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  fs.writeFileSync(path.join(output,slug+'.json'),JSON.stringify({name:root.name,sourceFile:doc.file,revision:root.revision,units,detachments,rules:armyRules}));
  factions.push({slug,name:root.name,units:units.length,detachments:detachments.length});
  console.log(root.name+': '+units.length+' datasheets, '+detachments.length+' detachments');
}
const system=docs.find(d=>d.system).root;
const coreRules=unique([...list(system.sharedRules),...list(system.sharedProfiles)].map(r=>({id:r.id,name:r.name,description:r.characteristics?Object.values(fields(r)).join('\n'):r.description||'',aliases:list(r.alias)})).filter(x=>x.description),x=>x.name);
fs.writeFileSync(path.join(output,'core.json'),JSON.stringify({name:system.name,rules:coreRules,revision:system.revision,complete:false}));
fs.writeFileSync(path.join(output,'index.json'),JSON.stringify({edition:11,updated:new Date().toISOString(),source:'BSData/wh40k-11e',factions:factions.sort((a,b)=>a.name.localeCompare(b.name))}));
console.log('Imported '+factions.length+' factions');
