import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2]||'public/data';
const get=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const index=get('index.json'),necrons=get('necrons.json'),core=get('core.json');
assert(index.factions.length>=20,'Too few factions');
const warrior=necrons.units.find(u=>u.name==='Necron Warriors');
const immortal=necrons.units.find(u=>u.name==='Immortals');
const overlord=necrons.units.find(u=>u.name==='Overlord');
assert(warrior&&immortal&&overlord,'Necron reference units missing');
assert(immortal.leaders?.some(u=>u.name==='Overlord'),'Immortals missing Overlord leader association');
assert(immortal.supporters?.length>0,'Immortals missing Support associations');
assert(necrons.detachments.length>=10,'Nested detachments were not extracted: '+necrons.detachments.length);
const court=necrons.detachments.find(d=>d.name==='Canoptek Court');
assert(court,'Canoptek Court missing');
assert(court.rules.some(r=>r.name==='Power Matrix'),'Detachment rule was not imported');
assert(court.enhancements.some(e=>e.name==='Dimensional Sanctum'),'Detachment-specific enhancement missing');
const av=necrons.detachments.find(d=>d.name==='Awakened Dynasty');
assert(av?.enhancements.some(e=>e.name==='Veil of Darkness'),'Awakened Dynasty enhancements missing');
assert(av.enhancements.find(e=>e.name==='Veil of Darkness').detachment.id===av.id,'Enhancement detachment attribution missing');
assert(immortal.weapons.some(w=>w.name==='Gauss blaster'),'Immortals Gauss blaster missing');
assert(immortal.weapons.some(w=>w.name==='Tesla carbine'),'Immortals Tesla carbine missing');
assert(immortal.rules.some(r=>r.name==='Reanimation Protocols'),'Immortals Reanimation Protocols missing');
assert(overlord.profiles.some(p=>p.name==='My Will Be Done'),'Overlord linked ability profile missing');
assert(necrons.units.find(u=>u.name==="C'tan Shard of the Deceiver")?.profiles.some(p=>p.name==='Necrodermis'),
  'Ctan linked Necrodermis ability profile missing');
assert(!immortal.rules.some(r=>/^(precise|precision|assault|power matrix)$/i.test(r.name)),'Unrelated rule leaked into Immortals');
const fnp=immortal.conditionalRules.find(r=>r.name==='Feel No Pain 5+');
assert(fnp?.requirements?.some(r=>/Technomancer/.test(r.description)),'Technomancer requirement missing for Feel No Pain');
assert(!immortal.categories.some(c=>c==='Immortals'),'Unit-specific category leaked into public keywords');
assert(warrior.loadouts.some(x=>x.variants.some(v=>/gauss reaper/i.test(v.name))&&x.variants.some(v=>/gauss flayer/i.test(v.name))),'Warrior model loadouts missing');
assert(overlord.weaponChoices.some(g=>g.max===1&&g.options.length>=2),'Overlord exclusive weapon loadouts missing');
assert(overlord.optionalGear.some(g=>g.name==='Resurrection orb'&&g.notes.some(note=>/Tachyon arrow/.test(note))),
  'Overlord optional Resurrection orb / Tachyon arrow restriction missing');
assert(warrior.conditionalRules.some(r=>r.name==='Assault'&&r.requirements.some(req=>/Hand of the Dynasty/.test(req.description))),
  'Hand of the Dynasty conditional Assault grant missing');
assert(warrior.enhancements.some(e=>e.name==='Enlivened Sentinels'&&e.detachment?.name==='Hand of the Dynasty'),
  'Unit-specific enhancement detachment attribution missing');
assert(necrons.references['Power Matrix']?.some(ref=>ref.kind==='detachment'&&ref.id===court.id),'Reverse references to detachment missing');
assert(necrons.units.some(u=>/\[Legends\]/i.test(u.name)),'Legends catalogue entries missing');
const marines=get('imperium-space-marines.json');
const templars=get('imperium-black-templars.json');
const darkAngels=get('imperium-dark-angels.json');
const templarDet=templars.detachments.find(d=>d.name==='Vow-Sworn Crusaders');
assert(templarDet,'Vow-Sworn Crusaders missing from Black Templars');
assert(templarDet.rules.some(r=>r.name==='Templar Vows'),'Templar Vows missing from its detachment');
assert(templarDet.detachmentCost===2,'Vow-Sworn Crusaders detachment cost missing');
assert(!marines.detachments.some(d=>d.name==='Vow-Sworn Crusaders'),'Black Templars detachment leaked into generic Space Marines');
assert(!marines.detachments.some(d=>d.name==='Inner Circle Task Force'),'Dark Angels detachment leaked into generic Space Marines');
assert(darkAngels.detachments.some(d=>d.name==='Inner Circle Task Force'),'Dark Angels chapter detachment missing');
assert(!marines.rules.some(r=>r.name==='Templar Vows'||r.name==='Death to the Alien'),'Chapter/unit abilities leaked into faction rules');
assert(!necrons.rules.some(r=>r.name==='Power Matrix'),'Canoptek Court rule leaked into faction-wide rules');
assert(necrons.rules.some(r=>r.name==='Reanimation Protocols'),'Necrons faction rule missing');
assert(necrons.detachments.find(d=>d.name==='Canoptek Court').detachmentCost===2,'Necron detachment cost missing');
const intercessors=marines.units.find(u=>u.name==='Intercessor Squad');
assert(intercessors&&!intercessors.rules.some(r=>r.name==='Templar Vows'),'Black Templar vow leaked into generic Intercessors');
const templarIntercessors=templars.units.find(u=>u.name==='Intercessor Squad');
assert(templarIntercessors?.conditionalRules.some(r=>r.name==='Templar Vows'&&
 r.requirements.some(req=>req.kind==='detachment'&&req.name==='Vow-Sworn Crusaders')),
 'Black Templars Intercessors must label their detachment-specific Vow');
for(const rules of [core.rules,necrons.rules,marines.rules,templars.rules]){
 const sorted=[...rules].sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base',numeric:true}));
 assert.deepEqual(rules.map(x=>x.name),sorted.map(x=>x.name),'Faction and core rules must be alphabetic');
}
const redemptor=marines.units.find(u=>u.name==='Redemptor Dreadnought');
assert(redemptor,'Redemptor Dreadnought missing');
const plasma=redemptor.weapons.find(w=>/macro plasma incinerator/i.test(w.name));
assert(plasma?.modes.some(m=>/standard/i.test(m.name))&&plasma.modes.some(m=>/supercharge/i.test(m.name)),
  'Macro Plasma Incinerator Standard/Supercharge modes were not grouped');
assert(redemptor.weaponChoices.some(g=>g.options.some(o=>/Macro Plasma Incinerator/i.test(o.name))),'Redemptor weapon XOR option missing');
assert(core.rules.some(r=>r.name==='Assault'&&r.description.includes('**[ASSAULT]**')),'Assault definition missing');
assert(core.rules.some(r=>r.name==='Lance'&&r.description.includes('**[LANCE]**')),'Lance Markdown definition missing');
for(const faction of index.factions){
 const data=get(faction.slug+'.json');
 assert(Array.isArray(data.units)&&Array.isArray(data.detachments)&&data.references && typeof data.references==='object','Malformed '+faction.slug);
 for(const u of data.units){
  assert(!(u.profiles||[]).some(p=>/Weapons?$/.test(p.type)),'Weapon incorrectly classified as ability: '+faction.slug+' '+u.name);
  assert(!(u.weapons||[]).some(w=>/weapon modifications/i.test(w.name)),'Crusade modifications leaked into weapons');
 }
}
console.log('PASS: '+index.factions.length+' factions; detachments, enhancements, conditional requirements, reverse references, legends, weapon modes, loadouts');
