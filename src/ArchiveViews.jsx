import React,{useId,useState} from 'react';
import{createPortal}from'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import{Info,ExternalLink,X}from'lucide-react';

const norm=s=>String(s||'').toLowerCase().replace(/[\[\]]/g,'').replace(/\s+/g,' ').trim();
const idOf=x=>'archive-rule-'+encodeURIComponent(String(x.id||x.name));
const normalizeMode=m=>!m||m==='Profile'?'Standard':m;
export const anchorId=idOf;
export function lookupKeyword(value,coreRules=[]){
 const word=norm(value);
 const entries=coreRules.flatMap(rule=>[rule.name,...(rule.aliases||[])].map(alias=>({rule,alias:norm(alias)}))).filter(x=>x.alias&&x.rule.description).sort((a,b)=>b.alias.length-a.alias.length);
 return entries.find(x=>word===x.alias||word.startsWith(x.alias+' ')||(x.alias==='anti'&&word.startsWith('anti-')))?.rule||null;
}
export function RuleText({text,coreRules=[]}){
 const value=String(text??'').replace(/\^\^([^^\n]+)\^\^/g,'$1');
 return <div className="rich-text"><ReactMarkdown remarkPlugins={[remarkGfm,remarkBreaks]} components={{
   a:({href,children})=><a href={href} target="_blank" rel="noreferrer">{children}</a>,
   strong:({children})=>{
    const label=React.Children.toArray(children).filter(x=>typeof x==='string').join('');
    const rule=/^\[.+\]$/.test(label)?lookupKeyword(label,coreRules):null;
    return <strong title={rule?.description||undefined} className={rule?'rule-keyword':''}>{children}</strong>;
   }
 }}>{value}</ReactMarkdown></div>;
}
export function WeaponKeyword({value,coreRules=[],open}){
 const rule=lookupKeyword(value,coreRules),tooltipId=useId();
 const[pos,setPos]=useState(null);
 if(!rule)return <span className="ability-keyword">{value}</span>;
 const onEnter=e=>{
  const box=e.currentTarget.getBoundingClientRect();
  const below=window.innerHeight-box.bottom>255;
  const width=Math.min(440,window.innerWidth-30);
  setPos({left:Math.max(12,Math.min(box.left,window.innerWidth-width-12)),width,
    top:below?box.bottom+7:undefined,bottom:below?undefined:Math.max(10,window.innerHeight-box.top+7)});
 };
 return <><button type="button" className="weapon-keyword-btn" onMouseEnter={onEnter} onMouseLeave={()=>setPos(null)}
   onFocus={onEnter} onBlur={()=>setPos(null)} onClick={()=>{setPos(null);open(rule);}} aria-describedby={pos?tooltipId:undefined}>{value}</button>
   {pos&&createPortal(<div role="tooltip" id={tooltipId} className="floating-keyword" style={pos}><strong>{rule.name}</strong><RuleText text={rule.description}/><div className="tooltip-foot">CLICK KEYWORD FOR SELECTABLE TEXT</div></div>,document.body)}
 </>;
}
function KeywordValue({value,coreRules,open}){
 if(!value)return '-';
 return <span className="weapon-keywords">{String(value).split(/,\s*/).filter(Boolean).map((s,i)=><React.Fragment key={i}>{i?', ':''}<WeaponKeyword value={s.trim()} coreRules={coreRules} open={open}/></React.Fragment>)}</span>;
}
export function Profiles({items,coreRules}){
 return <div className="stack">{(items||[]).map((p,i)=>{
  const cols=Object.entries(p.fields||{});
  const stat=/^(unit|model|statline|characteristics)$/i.test(p.type);
  return <article className={'profile '+(stat?'unit-profile':'ability-profile')} key={p.id||i}>
    <header><span>{p.name}</span><small>{p.type}</small></header>
    {stat||cols.length>2?<div className="table-wrap"><table><thead><tr>{cols.map(([k])=><th key={k}>{k}</th>)}</tr></thead><tbody><tr>{cols.map(([k,v])=><td key={k}><RuleText text={String(v)||'-'} coreRules={coreRules}/></td>)}</tr></tbody></table></div>:
     cols.map(([k,v])=><div className="ability" key={k}>{k!=='Description'&&<strong>{k}</strong>}<RuleText text={v} coreRules={coreRules}/></div>)}
  </article>;
 })}</div>;
}
export function WeaponSection({weapons,coreRules,open}){
 if(!weapons?.length)return null;
 const sorted=[...weapons].sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
 const types=[...new Set(sorted.map(w=>w.type))];
 return <section className="weapon-section"><h2 className="section-heading">Armaments <span>{weapons.length} weapons</span></h2>
 {types.map(type=><div key={type} className="weapon-type">
   <h3>{type}</h3>
   {sorted.filter(w=>w.type===type).map((w,i)=>{
    const multi=w.modes.length>1;
    const fieldNames=['Range','A','BS','WS','S','AP','D','Keywords'];
    const columns=fieldNames.filter(k=>w.modes.some(m=>Object.hasOwn(m.fields,k)));
    return <article key={w.id+'-'+i} className={'weapon-card '+(multi?'multi-mode':'')}>
     <div className="weapon-title"><span className="weapon-glyph">⌁</span><strong>{w.name}</strong>
       {multi&&<span className="mode-badge">SELECT ONE PROFILE</span>}</div>
     <div className="table-wrap"><table className="weapon-table"><thead><tr>{multi&&<th>MODE</th>}{columns.map(x=><th key={x}>{x}</th>)}</tr></thead>
       <tbody>{w.modes.map((m,j)=><tr key={m.id||j}>{multi&&<td className="mode-label">{normalizeMode(m.name)}</td>}{columns.map(col=><td key={col}>{col==='Keywords'?<KeywordValue value={m.fields[col]} coreRules={coreRules} open={open}/>:<RuleText text={String(m.fields[col]||'-')}/>}</td>)}</tr>)}</tbody>
     </table></div>
   </article>})}
 </div>)}</section>;
}
export function Requirements({items=[],navigate,prefix='Requires'}){
 if(!items.length)return null;
 return <div className="requirement-inline">
  <b>{prefix}:</b>
  <div>{items.map((r,i)=><p key={(r.id||i)+'-'+i}>
    {(r.kind==='detachment'||r.kind==='character'||r.kind==='unit'||r.kind==='enhancement')&&navigate?
      <button className="text-link" type="button" title={'Open '+r.name} onClick={()=>navigate(r.kind,r.id,r.name)}>{r.description}</button>:r.description}
  </p>)}</div>
 </div>;
}
export function RuleReferences({items=[],navigate,showLegends=true}){
 const filtered=items.filter(x=>showLegends||!/\[Legends\]/i.test(x.name));
 if(!filtered.length)return null;
 const kindOrder=['unit','detachment','enhancement'];
 return <details className="rule-refs"><summary>Appears in {filtered.length} {filtered.length===1?'entry':'entries'} <span className="minor">(datasheets / detachments / enhancements)</span></summary>
  {kindOrder.map(kind=>{
   const entries=filtered.filter(x=>x.kind===kind);
   if(!entries.length)return null;
   return <div key={kind} className="ref-group"><b>{kind==='unit'?'Datasheets':kind==='detachment'?'Detachments':'Enhancements'} ({entries.length})</b>
    <div className="ref-links">{entries.map((x,i)=><button key={x.id+'-'+i} title={x.detail||''} className="ref-link" onClick={()=>navigate(x.kind,x.id,x.detachmentId)}>
      {x.name}{x.detail&&<small> · {x.detail}</small>}</button>)}</div>
   </div>;
  })}
 </details>;
}
export function RuleCards({items=[],references={},coreRules=[],selected='',navigate,showLegends}){
 if(!items.length)return <p className="empty">No rule text was provided in the BSData catalogue for this section.</p>;
 return <div className="stack">{items.map((r,i)=><article className={'rule-card '+(String(selected)===String(r.id||r.name)?'focused-rule':'')}
   id={idOf(r)} key={r.id||i}><div className="rule-title">{r.name}</div><RuleText text={r.description} coreRules={coreRules}/>
    {r.requirements?.length>0&&<Requirements items={r.requirements} navigate={navigate} prefix="Available when"/>}
    <RuleReferences items={references[r.name]||[]} navigate={navigate} showLegends={showLegends}/>
   </article>)}</div>;
}
export function ConditionalRules({items=[],coreRules,navigate}){
 if(!items.length)return null;
 return <section className="panel"><h3>Conditional abilities</h3><p className="muted">These abilities apply only when the requirements shown with each rule are met.</p>
 {items.map((r,i)=><article className="rule-card conditional-card" key={r.id+'-'+i}>
   <div className="rule-title">{r.name}</div>
   <RuleText text={r.description} coreRules={coreRules}/>
   <Requirements items={r.requirements} navigate={navigate} prefix="Available when"/>
   {r.conditionText&&<details className="condition-expression"><summary>Source condition logic</summary><p>{r.conditionText}</p></details>}
 </article>)}</section>;
}
export function ConditionalEffects({items=[],coreRules,navigate}){
 if(!items.length)return null;
 return <section className="panel"><h3>Conditional modifications</h3><p className="muted">BSData modifier effects, shown separately from the datasheet's base characteristics.</p>
 {items.map((r,i)=><article className="rule-card conditional-card" key={(r.id||'e')+'-'+i}>
  <RuleText text={r.description} coreRules={coreRules}/>
  <Requirements items={r.requirements} navigate={navigate} prefix="Applies when"/>
 </article>)}</section>;
}
export function EnhancementSection({items=[],coreRules,navigate,open}){
 if(!items.length)return null;
 return <section className="panel"><h3>Enhancements <span className="count-indicator">{items.length}</span></h3>
 {items.map((e,i)=><article key={e.id+'-'+i} id={'enhancement-'+e.id} className="enhancement-row">
   <div className="enhancement-head"><strong>{e.name}</strong><span>{e.points!=null?e.points+' pts':''}</span>
    <button title="Open full enhancement" className="icon" onClick={()=>open(e)}><Info size={16}/></button>
   </div>
   {e.detachment&&<p className="enhancement-detachment">Detachment: <button className="text-link" onClick={()=>navigate('detachment',e.detachment.id)}>{e.detachment.name} <ExternalLink size={12}/></button></p>}
   {e.description&&<RuleText text={e.description} coreRules={coreRules}/>}
   {e.requirements?.length>0&&<Requirements items={e.requirements.filter(x=>!(e.detachment&&x.id===e.detachment.id))} navigate={navigate}/>}
  </article>)}</section>;
}
export function LoadoutSection({choices=[],loadouts=[],optionalGear=[],navigate}){
 if(!choices.length&&!loadouts.length&&!optionalGear.length)return null;
 return <section className="panel"><h3>Weapon options and model loadouts</h3><p className="muted">Source selection limits determine which equipment can be chosen together. This is a reference to permitted choices.</p>
 {loadouts.map((group,i)=><div className="loadout-block" key={group.id||i}>
   <div className="choice-heading"><strong>{group.name}</strong><small>{group.min?group.min+' minimum':''}{group.max?' · '+group.max+' maximum':''} models across these configurations</small></div>
   <div className="variant-grid">{group.variants.map((v,j)=><div className="variant" key={j}>
    <strong>{v.name}</strong><div className="variant-gear">{v.weapons.length?v.weapons.join(' · '):'See wargear options'}</div>
    <Requirements items={v.requirements} navigate={navigate}/>{v.conditions.map((x,k)=><p className="minor" key={k}>{x}</p>)}
   </div>)}</div>
 </div>)}
 {optionalGear.length>0&&<div className="loadout-block optional-gear">
  <div className="choice-heading"><strong>Optional wargear</strong><small>Individual upgrades and their restrictions</small></div>
  <div className="variant-grid">{optionalGear.map((o,i)=><div className="variant" key={o.id||i}>
   <strong>{o.name}</strong><div className="variant-gear">{o.model&&o.model+' · '}{o.weapons.length?o.weapons.join(' · '):'Wargear upgrade'}{o.max!=null?' · Up to '+o.max:''}</div>
   <Requirements items={o.requirements} navigate={navigate}/>{o.notes.map((x,j)=><p key={j} className="minor">{x}</p>)}
  </div>)}</div>
 </div>}
 {choices.map((group,i)=><div className="loadout-block" key={group.id||i}>
  <div className="choice-heading"><strong>{group.model?group.model+' / ':''}{group.name}</strong><small>{group.min===1?'Choose exactly one':'Choose up to one'} (mutually exclusive)</small></div>
  <div className="variant-grid">{group.options.map((v,j)=><div className="variant" key={j}>
    <strong>{v.name}{v.default&&<span className="default-pill">DEFAULT</span>}</strong>
    <div className="variant-gear">{v.weapons.length?v.weapons.join(' · '):'Wargear option'} {v.points?(' · +'+v.points+' pts'):''}</div>
    <Requirements items={v.requirements} navigate={navigate}/>{v.notes.map((x,k)=><p className="minor" key={k}>{x}</p>)}
   </div>)}</div>
 </div>)}
 </section>;
}
export function Tags({tags=[],points,units=[],current,showLegends,navigate}){
 return <div className="tagline">{tags.map((tag,i)=>{
  const related=units.filter(u=>u.id!==current&&(showLegends||!/\[Legends\]/i.test(u.name))&&u.categories?.some(c=>norm(c)===norm(tag)));
  return <span className="tag-wrap" key={i}><button className="tag tag-button" type="button" title={tag}>{tag}</button>
    <div className="tag-popover"><strong>{tag} · {related.length} other datasheets</strong>{related.length?<div className="tag-popover-list">{related.map(u=><button key={u.id} type="button" onClick={()=>navigate('unit',u.id)}>{u.name}</button>)}</div>:<p>No other datasheets with this keyword.</p>}</div>
   </span>;
 })}{points!=null&&<span className="tag points">{points} PTS</span>}</div>;
}
export function ConditionDetails({items=[]}){
 if(!items.length)return null;
 return <details className="conditions"><summary>Additional BSData conditions ({items.length})</summary>
 <p>Source conditions are roster-dependent. No roster is evaluated by this encyclopedia.</p>
 {items.map((x,i)=><p key={i}>{x.name} {x.operator} {x.value} ({x.scope})</p>)}</details>;
}
export function RuleModal({item,close,coreRules=[],navigate}){
 if(!item)return null;
 const body=item.description||item.rules?.map(r=>r.description).join('\n\n')||'No rules text supplied.';
 return <div className="modal-back" onMouseDown={close}><div className="modal" role="dialog" aria-modal="true" aria-label={item.name}
  onMouseDown={e=>e.stopPropagation()}>
   <button type="button" className="close" title="Close" onClick={close}><X size={20}/></button>
   <div className="eyebrow">ARCHIVE RECORD</div><h2>{item.name}</h2>
   {item.detachment&&<p className="enhancement-detachment">Detachment: <button className="text-link" onClick={()=>{close();navigate('detachment',item.detachment.id)}}>{item.detachment.name}</button></p>}
   <RuleText text={body} coreRules={coreRules}/><Requirements items={item.requirements} navigate={navigate}/>
   {item.profiles?.length>0&&<Profiles items={item.profiles} coreRules={coreRules}/>}
 </div></div>;
}
