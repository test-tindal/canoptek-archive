import React, {useEffect, useMemo, useState, useId} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {Search, Sun, Moon, BookOpen, Layers, ScrollText, ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, X, Info, Copy} from 'lucide-react';
import './style.css';

const base = import.meta.env.BASE_URL + 'data/';
const source = 'https://github.com/BSData/wh40k-11e/blob/main/';
const groups = ['Epic Hero','Character','Battleline','Infantry','Mounted','Beast','Monster','Vehicle','Walker','Aircraft','Dedicated Transport','Fortification'];
const imageSearch = name => 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent('Warhammer 40000 ' + name + ' miniature');
const ruleId = rule => 'archive-rule-' + encodeURIComponent(String(rule.id || rule.name));
const normalize = value => String(value || '').toLowerCase().replace(/[[\]]/g,'').replace(/\s+/g,' ').trim();

// Core abilities have variable suffixes: e.g. "Sustained Hits 2",
// "Rapid Fire D3", "Anti-Vehicle 4+", or "Scouts 6\"".
function keywordRule(value, coreRules=[]) {
  const name = normalize(value);
  if (!name) return null;
  const known = coreRules.flatMap(r => [r.name, ...(r.aliases || [])].map(alias=>({rule:r,alias:normalize(alias)})))
    .filter(x=>x.alias && x.rule.description)
    .sort((a,b)=>b.alias.length-a.alias.length);
  const found = known.find(({alias}) =>
    name === alias || name.startsWith(alias+' ') || (alias==='anti' && name.startsWith('anti-')) ||
    (alias==='feel no pain' && name.startsWith('feel no pain')) ||
    (alias==='scouts' && name.startsWith('scouts '))
  );
  return found?.rule || null;
}
function RuleText({text, coreRules=[]}) {
  const markdown = String(text ?? '').replace(/\^\^([^^\n]+)\^\^/g, '$1');
  return <div className="rich-text"><ReactMarkdown remarkPlugins={[remarkGfm,remarkBreaks]} components={{
    a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    strong:({children})=>{
      const value = React.Children.toArray(children).map(c=>typeof c==='string'?c:'').join('');
      const rule = /^\[.+\]$/.test(value) ? keywordRule(value,coreRules) : null;
      return <strong className={rule?'rule-keyword':''} title={rule?.description || undefined}>{children}</strong>;
    }
  }}>{markdown}</ReactMarkdown></div>;
}
function Keyword({text,coreRules=[]}) {
  const tooltipId=useId();
  const [position,setPosition]=useState(null);
  const definition=keywordRule(text,coreRules);
  if(!definition)return <span className="ability-keyword">{text}</span>;
  const show=e=>{
    const rect=e.currentTarget.getBoundingClientRect();
    const width=Math.min(390,window.innerWidth-24);
    const below=window.innerHeight-rect.bottom>250;
    setPosition({
      left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),
      top:below?rect.bottom+9:undefined,
      bottom:below?undefined:Math.max(12,window.innerHeight-rect.top+9),
      width
    });
  };
  return <><span tabIndex={0} className="ability-keyword defined-keyword" aria-describedby={position?tooltipId:undefined}
    onMouseEnter={show} onMouseLeave={()=>setPosition(null)} onFocus={show} onBlur={()=>setPosition(null)}
  >{text}</span>{position&&createPortal(<div id={tooltipId} role="tooltip" className="floating-keyword" style={position}>
    <strong>{definition.name}</strong><RuleText text={definition.description}/>
  </div>,document.body)}</>;
}
function WeaponKeywords({value,coreRules}) {
  if(!value)return <span>-</span>;
  return <span className="weapon-keywords">{String(value).split(/,\s*/).filter(Boolean).map((term,i)=>
    <React.Fragment key={i}>{i>0?', ':''}<Keyword text={term.trim()} coreRules={coreRules}/></React.Fragment>
  )}</span>;
}
function Profiles({items,coreRules}) {
  return <div className="stack">{items?.map((profile,i)=>{
    const values=Object.entries(profile.fields||{});
    const weapon=/weapon/i.test(profile.type||'');
    const stat=/^(unit|model|statline|characteristics)$/i.test(profile.type||'');
    const table=values.length>2||weapon||stat;
    return <section className="profile" key={profile.id||i}><header><span>{profile.name}</span><small>{profile.type}</small></header>{
      table?<div className="table-wrap"><table><thead><tr>{values.map(([key])=><th key={key}>{key}</th>)}</tr></thead><tbody><tr>{values.map(([key,value])=>
        <td key={key}>{weapon&&key==='Keywords'?<WeaponKeywords value={value} coreRules={coreRules}/>:<RuleText text={String(value)||'-'} coreRules={coreRules}/>}</td>
      )}</tr></tbody></table></div>:
      values.map(([key,value])=><div className="ability" key={key}>{key!=='Description'&&<strong>{key}</strong>}<RuleText text={value} coreRules={coreRules}/></div>)
    }</section>;
  })}</div>;
}
function RuleCards({items,selected='',coreRules}) {
  if(!items?.length)return <p className="empty">No rule text was provided in the BSData catalogue for this section.</p>;
  return <div className="stack">{items.map((r,i)=><article
    className={'rule-card'+(String(selected)===String(r.id||r.name)?' focused-rule':'')}
    id={ruleId(r)} key={r.id||r.name||i}
  ><div className="rule-title"><span>{r.name}</span></div><RuleText text={r.description} coreRules={coreRules}/></article>)}</div>;
}
function Conditions({items}) {
  if(!items?.length)return null;
  return <details className="conditions"><summary>BSData conditional references ({items.length})</summary>
    <p>These conditions depend on the selected force, options and associated models. This encyclopedia does not evaluate a roster.</p>
    {items.map((c,i)=><div className="condition" key={i}><b>{c.name}</b><span>{c.operator} {String(c.value)} · {c.scope}</span></div>)}
  </details>;
}
function Enhancements({items,open}) {
  if(!items?.length)return null;
  return <section className="panel"><h3>Enhancements</h3><p className="muted">These are optional entries. Eligibility may depend on detachment or other BSData conditions.</p>
    {items.map((e,i)=><button key={e.id||i} className="row" onClick={()=>open(e)}><span>{e.name}</span><span>{e.points!=null?e.points+' pts ':''}<Info size={15}/></span></button>)}
  </section>;
}
function ConditionalRules({items,coreRules}) {
  if(!items?.length)return null;
  return <details className="conditions conditional-rules"><summary>Conditional abilities ({items.length})</summary>
    <p>These are granted only under specific conditions, such as having an attached character. They are not intrinsic base abilities.</p>
    <RuleCards items={items} coreRules={coreRules}/>
    {items.map((r,i)=><Conditions key={r.id||i} items={r.conditions}/>)}
  </details>;
}
function App() {
  const [theme,setTheme]=useState(localStorage.getItem('archive-theme')||'dark');
  const [index,setIndex]=useState(null),[data,setData]=useState(null),[core,setCore]=useState(null);
  const [faction,setFaction]=useState(''),[section,setSection]=useState('units'),[selected,setSelected]=useState('');
  const [query,setQuery]=useState(''),[modal,setModal]=useState(null),[expanded,setExpanded]=useState({});
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('archive-theme',theme)},[theme]);
  useEffect(()=>{
    fetch(base+'index.json').then(r=>{if(!r.ok)throw Error('Data index unavailable');return r.json()})
      .then(d=>{setIndex(d);const hash=decodeURIComponent(location.hash.slice(1)).split('/');setFaction(d.factions.find(x=>x.slug===hash[0])?.slug||d.factions.find(x=>/necron/i.test(x.name))?.slug||d.factions[0]?.slug||'')})
      .catch(e=>setError(e.message));
    fetch(base+'core.json').then(r=>r.json()).then(setCore).catch(()=>{});
  },[]);
  useEffect(()=>{
    if(!faction)return;
    let cancelled=false;
    setLoading(true);setError('');
    fetch(base+faction+'.json').then(r=>{if(!r.ok)throw Error('Faction catalogue unavailable');return r.json()})
      .then(d=>{
        if(cancelled)return;
        setData(d);setExpanded({});setQuery('');
        const hash=decodeURIComponent(location.hash.slice(1)).split('/');
        setSection(hash[0]===faction&&['units','detachments','rules','core'].includes(hash[1])?hash[1]:'units');
        setSelected(hash[0]===faction?hash[2]||'':'');
      }).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)});
    return ()=>{cancelled=true};
  },[faction]);
  useEffect(()=>{if(faction)history.replaceState(null,'','#'+encodeURIComponent(faction+'/'+section+'/'+selected))},[faction,section,selected]);
  // Navigation targets must be in the right panel, not a duplicate modal.
  useEffect(()=>{
    if(!selected||!['rules','core'].includes(section))return;
    const frame=requestAnimationFrame(()=>document.getElementById(ruleId({id:selected}))?.scrollIntoView({behavior:'smooth',block:'start'}));
    return ()=>cancelAnimationFrame(frame);
  },[section,selected,data,core,query]);
  const coreRules=core?.rules||[];
  const filtered=useMemo(()=>!data?[]:data.units.filter(u=>(u.name+' '+(u.categories||[]).join(' ')+' '+(u.profiles||[]).map(x=>x.name).join(' ')).toLowerCase().includes(query.toLowerCase())),[data,query]);
  const grouped=useMemo(()=>{
    const found={};
    for(const unit of filtered){
      const group=groups.find(g=>(unit.categories||[]).some(x=>normalize(x)===normalize(g)))||'Other units';
      (found[group]??=[]).push(unit);
    }
    return Object.entries(found).sort((a,b)=>{
      const ai=groups.indexOf(a[0]),bi=groups.indexOf(b[0]);
      return (ai<0?999:ai)-(bi<0?999:bi);
    });
  },[filtered]);
  const current=section==='units'?data?.units.find(u=>u.id===selected):section==='detachments'?data?.detachments.find(d=>d.id===selected):null;
  const browse=section==='units'?filtered:section==='detachments'?data?.detachments||[]:section==='rules'?data?.rules||[]:coreRules;
  const activeBrowse=browse.filter(x=>x.name.toLowerCase().includes(query.toLowerCase()));
  const choose=id=>{
    setSelected(id);
    if(['rules','core'].includes(section))requestAnimationFrame(()=>document.getElementById(ruleId({id}))?.scrollIntoView({behavior:'smooth',block:'start'}));
    else window.scrollTo({top:0,behavior:'smooth'});
  };
  const chooseSection=s=>{setSection(s);setSelected('');setQuery('');window.scrollTo({top:0,behavior:'smooth'})};
  const copy=()=>navigator.clipboard?.writeText(location.href.split('#')[0]+'#'+encodeURIComponent(faction+'/'+section+'/'+selected));
  const openEnhancement=item=>setModal({...item,description:item.rules?.map(r=>r.description).join('\n\n')||item.profiles?.map(p=>Object.values(p.fields||{}).join(' ')).join('\n\n')||'No effect text available in source.'});
  const Unit=({unit})=><>
    <div className="heading"><div className="eyebrow">DATASHEET · 11TH EDITION</div><h1>{unit.name}</h1>
      <div className="tagline">{unit.categories.map((x,i)=><span className="tag" key={i}>{x}</span>)}{unit.points!=null&&<span className="tag points">{unit.points} PTS</span>}</div>
      <div className="actions"><a href={imageSearch(unit.name)} target="_blank" rel="noreferrer"><ImageIcon size={15}/> Find miniature images <ExternalLink size={12}/></a><button onClick={copy}><Copy size={15}/> Copy reference</button></div>
    </div>
    <Profiles items={unit.profiles} coreRules={coreRules}/>
    {unit.rules?.length>0&&<section className="panel"><h3>Unit abilities and rules</h3><RuleCards items={unit.rules} coreRules={coreRules}/></section>}
    <ConditionalRules items={unit.conditionalRules} coreRules={coreRules}/>
    <Enhancements items={unit.enhancements} open={openEnhancement}/>
    <Conditions items={unit.conditions}/>
  </>;
  const Detachment=({item})=><>
    <div className="heading"><div className="eyebrow">DETACHMENT · 11TH EDITION</div><h1>{item.name}</h1></div>
    <Profiles items={item.profiles} coreRules={coreRules}/>
    <RuleCards items={item.rules} coreRules={coreRules}/>
    <Enhancements items={item.enhancements} open={openEnhancement}/>
    <section className="panel"><h3>Stratagems</h3><p className="empty">BSData does not provide verified stratagem cards for this detachment. WHEN, TARGET, EFFECT and RESTRICTIONS will appear here when a verified source is available.</p></section>
    <Conditions items={item.conditions}/>
  </>;
  return <div className="app">
    <aside className="sidebar"><div className="brand"><div className="sigil">◇</div><div><strong>CANOPTEK<br/>ARCHIVE</strong><small>DYNASTIC RECORDS · XI</small></div></div>
      <div className="side-title">ARCHIVE INDEX</div><label className="select-label">FACTION<select value={faction} onChange={e=>setFaction(e.target.value)}>{index?.factions.map(x=><option key={x.slug} value={x.slug}>{x.name}</option>)}</select></label>
      <nav className="sections">
        <button className={section==='units'?'active':''} onClick={()=>chooseSection('units')}><Layers size={17}/> Datasheets <span>{data?.units.length||0}</span></button>
        <button className={section==='detachments'?'active':''} onClick={()=>chooseSection('detachments')}><ScrollText size={17}/> Detachments <span>{data?.detachments.length||0}</span></button>
        <button className={section==='rules'?'active':''} onClick={()=>chooseSection('rules')}><BookOpen size={17}/> Faction rules</button>
        <button className={section==='core'?'active':''} onClick={()=>chooseSection('core')}><BookOpen size={17}/> Core reference</button>
      </nav><div className="side-footer">SOURCE: BSDATA / WH40K-11E<br/>UNOFFICIAL RULES INDEX</div>
    </aside>
    <main><header className="topbar"><div className="breadcrumb">ARCHIVE / {data?.name||'LOADING'} / {section.toUpperCase()}</div><div className="toolbar"><span className="edition">EDITION XI</span><button className="theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>} {theme==='dark'?'Tomb Kings':'Necron'}</button></div></header>
      <div className="layout"><div className="browse"><div className="browse-header"><div className="eyebrow">RECORD DIRECTORY</div><h2>{section==='units'?'Datasheets':section==='detachments'?'Detachments':section==='rules'?'Faction rules':'Core reference'}</h2>
        <label className="search"><Search size={17}/><input placeholder="Search archive..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
      </div><div className="browse-scroll">{
        section==='units'?grouped.map(([group,units])=><div className="group" key={group}>
          <button className="group-head" onClick={()=>setExpanded(p=>({...p,[group]:!p[group]}))}>{expanded[group]?<ChevronRight size={15}/>:<ChevronDown size={15}/>} {group}<small>{units.length}</small></button>
          {!expanded[group]&&units.map(u=><button key={u.id} className={'item '+(selected===u.id?'chosen':'')} onClick={()=>choose(u.id)}>{u.name}</button>)}
        </div>):activeBrowse.map(x=><button key={x.id||x.name} className={'item '+(selected===(x.id||x.name)?'chosen':'')} onClick={()=>choose(x.id||x.name)}>{x.name}</button>)
      }{!activeBrowse.length&&section!=='units'&&<p className="empty">No records found.</p>}</div></div>
      <div className="content">
        {error?<div className="notice error">{error}</div>:loading?<div className="notice">Decrypting catalogue...</div>:!data?<div className="notice">Loading dynastic records...</div>:section==='units'&&current?<Unit unit={current}/>:section==='detachments'&&current?<Detachment item={current}/>:section==='rules'||section==='core'?<>
          <div className="heading"><div className="eyebrow">{section==='core'?'GENERAL REFERENCE':'FACTION ARCHIVE'}</div><h1>{section==='core'?'Core rules reference':data.name+' rules'}</h1></div>
          <div className="notice">These entries reproduce rule text supplied by BSData. This is not a complete rulebook.</div>
          <RuleCards items={activeBrowse} selected={selected} coreRules={coreRules}/>
        </>:<div className="welcome"><div className="glyph">◇</div><div className="eyebrow">AWAITING RECORD SELECTION</div><h1>{data.name}</h1>
          <p>Select a record from the left to inspect datasheets, abilities, weapons, detachment associations and source conditions.</p>
          <div className="metrics"><span><b>{data.units.length}</b> DATASHEETS</span><span><b>{data.detachments.length}</b> DETACHMENTS</span></div>
          <a className="source" href={source+encodeURIComponent(data.sourceFile)} target="_blank" rel="noreferrer">View original BSData catalogue <ExternalLink size={14}/></a>
        </div>}
        <footer className="footer">BSData community data · Unofficial fan reference · Missing stratagem timing and complete core rules are marked explicitly.</footer>
      </div></div>
    </main>
    {modal&&<div className="modal-back" onClick={()=>setModal(null)}><div className="modal" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}>
      <button className="close" onClick={()=>setModal(null)}><X size={20}/></button><div className="eyebrow">ARCHIVE RECORD</div><h2>{modal.name}</h2>
      <RuleText text={modal.description||'No full description provided in BSData.'} coreRules={coreRules}/>
      {modal.profiles?.length>0&&<Profiles items={modal.profiles} coreRules={coreRules}/>}<Conditions items={modal.conditions}/>
    </div></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
