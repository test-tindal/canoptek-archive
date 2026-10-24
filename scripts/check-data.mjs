import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir=process.argv[2]||'public/data';
const read=file=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
const index=read('index.json');
assert(index.factions.length>=20,'Expected faction catalogues');
const necrons=read('necrons.json');
const immortal=necrons.units.find(u=>u.name==='Immortals');
assert(immortal,'Immortals datasheet missing');
assert(immortal.profiles.some(p=>p.name==='Gauss blaster'),'Immortals Gauss blaster missing');
assert(immortal.profiles.some(p=>p.name==='Tesla carbine'),'Immortals Tesla carbine missing');
assert(immortal.rules.some(r=>r.name==='Reanimation Protocols'),'Faction ability link missing');
assert(!immortal.rules.some(r=>/^(precise|precision|lance|assault|power matrix)$/i.test(r.name)),
  'Shared/weapon/detachment rule leaked into base Immortals abilities: '+immortal.rules.map(x=>x.name).join(', '));
assert(!immortal.profiles.some(p=>/^(tools of dominion|weapon modifications)$/i.test(p.name)),
  'Optional enhancement/weapon upgrade leaked into the base datasheet');
assert((immortal.conditionalRules||[]).some(r=>r.name==='Feel No Pain'),
  'Conditional character-granted rule was lost');
const core=read('core.json');
assert(core.rules.some(r=>r.name==='Assault' && r.description.includes('**[ASSAULT]**')),
  'Core ability definitions and Markdown markup missing');
assert(core.rules.some(r=>r.name==='Lance' && r.description.includes('**[LANCE]**')),
  'Lance definition missing');
for(const faction of index.factions){
  const data=read(faction.slug+'.json');
  assert(Array.isArray(data.units) && Array.isArray(data.rules),'Malformed faction '+faction.slug);
  for(const unit of data.units){
    assert(!unit.profiles.some(p=>/^weapon modifications$/i.test(p.name)),
      'Generic upgrades leaked into '+faction.slug+' / '+unit.name);
  }
}
console.log('Data checks passed: '+index.factions.length+' factions; Immortals ownership, weapon profiles, conditional rules and keyword definitions verified.');
