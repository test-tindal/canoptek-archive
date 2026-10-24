import React,{useEffect,useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import{Search,Sun,Moon,BookOpen,Layers,ScrollText,ChevronDown,ChevronRight,ExternalLink,Image as ImageIcon,Copy}from'lucide-react';
import{anchorId,RuleCards,RuleText,Profiles,WeaponSection,ConditionalRules,ConditionalEffects,EnhancementSection,LoadoutSection,Tags,RuleModal}from'./ArchiveViews.jsx';
import{ruleNameSort}from'./ruleFormatting.mjs';
import './style.css';

const base=import.meta.env.BASE_URL+'data/';
const source='https://github.com/BSData/wh40k-11e/blob/main/';
const images=name=>'https://www.google.com/search?tbm=isch&q='+encodeURIComponent('Warhammer 40000 '+name+' miniature');
const unitGroups=['Epic Hero','Character','Battleline','Infantry','Mounted','Beast','Monster','Vehicle','Walker','Aircraft','Dedicated Transport','Fortification'];
const isLegend=x=>/\[Legends\]/i.test(x.name||'');
const norm=x=>String(x||'').toLowerCase().trim();

function App(){
 const[theme,setTheme]=useState(localStorage.getItem('archive-theme')||'dark');
 const[index,setIndex]=useState(null),[data,setData]=useState(null),[core,setCore]=useState(null);
 const[faction,setFaction]=useState(''),[section,setSection]=useState('units'),[selected,setSelected]=useState('');
 const[query,setQuery]=useState(''),[modal,setModal]=useState(null),[expanded,setExpanded]=useState({});
 const[showLegends,setShowLegends]=useState(false),[pendingAnchor,setPendingAnchor]=useState('');
 const[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('archive-theme',theme)},[theme]);
 useEffect(()=>{
  fetch(base+'index.json').then(r=>{if(!r.ok)throw Error('Data index unavailable');return r.json()})
   .then(d=>{setIndex(d);const hash=decodeURIComponent(location.hash.slice(1)).split('/');setFaction(d.factions.find(x=>x.slug===hash[0])?.slug||d.factions.find(x=>/necron/i.test(x.name))?.slug||d.factions[0]?.slug||'')})
   .catch(e=>setError(e.message));
  fetch(base+'core.json').then(r=>r.json()).then(setCore).catch(()=>{});
 },[]);
 useEffect(()=>{
  if(!faction)return;
  let disposed=false;
  setLoading(true);setError('');
  fetch(base+faction+'.json').then(r=>{if(!r.ok)throw Error('Faction catalogue unavailable');return r.json()})
   .then(d=>{
    if(disposed)return;
    setData(d);setQuery('');setExpanded({});
    const hash=decodeURIComponent(location.hash.slice(1)).split('/');
    setSection(hash[0]===faction&&['units','detachments','rules','core'].includes(hash[1])?hash[1]:'units');
    setSelected(hash[0]===faction?hash[2]||'':'');
   }).catch(e=>{if(!disposed)setError(e.message)}).finally(()=>{if(!disposed)setLoading(false)});
  return()=>{disposed=true};
 },[faction]);
 useEffect(()=>{if(faction)history.replaceState(null,'','#'+encodeURIComponent(faction+'/'+section+'/'+selected))},[faction,section,selected]);
 useEffect(()=>{
  if(!selected||!['rules','core'].includes(section))return;
  const t=setTimeout(()=>document.getElementById(anchorId({id:selected}))?.scrollIntoView({behavior:'smooth',block:'start'}),30);
  return()=>clearTimeout(t);
 },[section,selected,core,data,query]);
 useEffect(()=>{
  if(!pendingAnchor)return;
  const t=setTimeout(()=>{document.getElementById(pendingAnchor)?.scrollIntoView({behavior:'smooth',block:'center'});setPendingAnchor('')},90);
  return()=>clearTimeout(t);
 },[pendingAnchor,section,selected]);
 const coreRules=core?.rules||[];
 const visibleUnits=useMemo(()=>!data?[]:data.units.filter(u=>showLegends||!isLegend(u)),[data,showLegends]);
 const filtered=useMemo(()=>visibleUnits.filter(u=>(u.name+' '+(u.categories||[]).join(' ')+' '+(u.profiles||[]).map(x=>x.name).join(' ')+' '+(u.weapons||[]).map(x=>x.name).join(' ')).toLowerCase().includes(query.toLowerCase())),[visibleUnits,query]);
 const grouped=useMemo(()=>{
  const items={};
  for(const unit of filtered){
   const group=unitGroups.find(g=>unit.categories?.some(c=>norm(c)===norm(g)))||'Other units';
   (items[group]??=[]).push(unit);
  }
  return Object.entries(items).sort((a,b)=>{
   const ai=unitGroups.indexOf(a[0]),bi=unitGroups.indexOf(b[0]);
   return(ai<0?999:ai)-(bi<0?999:bi);
  });
 },[filtered]);
 const browse=section==='units'?filtered:section==='detachments'?[...(data?.detachments||[])].sort((a,b)=>{const ap=Number(a.detachmentCost),bp=Number(b.detachmentCost);const aValid=a.detachmentCost!=null&&Number.isFinite(ap),bValid=b.detachmentCost!=null&&Number.isFinite(bp);if(aValid!==bValid)return aValid?-1:1;if(aValid&&ap!==bp)return bp-ap;return a.name.localeCompare(b.name,'en',{sensitivity:'base',numeric:true});}):
  section==='rules'?[...(data?.rules||[])].sort(ruleNameSort):[...coreRules].sort(ruleNameSort);
 const activeBrowse=browse.filter(x=>x.name.toLowerCase().includes(query.toLowerCase()));
 const current=section==='units'?visibleUnits.find(x=>x.id===selected):section==='detachments'?data?.detachments.find(x=>x.id===selected):null;
 const choose=id=>{
  setSelected(id);
  if(['rules','core'].includes(section))requestAnimationFrame(()=>document.getElementById(anchorId({id}))?.scrollIntoView({behavior:'smooth',block:'start'}));
  else window.scrollTo({top:0,behavior:'smooth'});
 };
 const chooseSection=s=>{setSection(s);setSelected('');setQuery('');setPendingAnchor('');window.scrollTo({top:0,behavior:'smooth'})};
 const navigate=(kind,id,extra)=>{
  let s=kind==='detachment'?'detachments':kind==='unit'||kind==='character'?'units':'';
  let foundId=id;
  if(kind==='enhancement'){
   const det=data?.detachments.find(d=>d.enhancements?.some(e=>e.id===id));
   const detById=data?.detachments.find(d=>d.id===extra);
   const unit=data?.units.find(u=>u.enhancements?.some(e=>e.id===id));
   if(detById||det){s='detachments';foundId=(detById||det).id;}
   else if(unit){s='units';foundId=unit.id;}
   else{s='detachments';foundId=data?.detachments[0]?.id||'';}
   setPendingAnchor('enhancement-'+id);
  }
  if(kind==='character'||kind==='unit'){
   const unit=data?.units.find(u=>u.id===id)||data?.units.find(u=>norm(u.name)===norm(extra));
   if(unit){foundId=unit.id;if(isLegend(unit))setShowLegends(true);}
  }
  if(!s)return;
  setModal(null);setQuery('');
  setSection(s);setSelected(foundId);
  if(kind!=='enhancement')window.scrollTo({top:0,behavior:'smooth'});
 };
 const copy=()=>navigator.clipboard?.writeText(location.href.split('#')[0]+'#'+encodeURIComponent(faction+'/'+section+'/'+selected));
 const open=e=>setModal(e);
 const hideLegend=()=>{
  setShowLegends(false);
  if(current&&isLegend(current))setSelected('');
 };
 function UnitView({unit}){
  return <>
   <div className="heading">
    <div className="eyebrow">DATASHEET · 11TH EDITION</div><h1>{unit.name}</h1>
    <Tags tags={unit.categories||[]} points={unit.points} units={data.units} current={unit.id} showLegends={showLegends} navigate={navigate}/>
    <div className="actions">
     <a href={images(unit.name)} target="_blank" rel="noreferrer"><ImageIcon size={15}/> Find miniature images <ExternalLink size={12}/></a>
     <button onClick={copy}><Copy size={15}/> Copy reference</button>
    </div>
   </div>
   <Profiles items={unit.profiles} coreRules={coreRules}/>
   <WeaponSection weapons={unit.weapons||[]} coreRules={coreRules} open={open}/>
   <LoadoutSection choices={unit.weaponChoices||[]} loadouts={unit.loadouts||[]} optionalGear={unit.optionalGear||[]} navigate={navigate}/>
   {unit.rules?.length>0&&<section className="panel"><h3>Unit abilities and rules</h3>
     <RuleCards items={unit.rules} coreRules={coreRules} navigate={navigate} references={data.references||{}} showLegends={showLegends}/>
   </section>}
   <ConditionalRules items={unit.conditionalRules||[]} coreRules={coreRules} navigate={navigate}/>
   <ConditionalEffects items={unit.conditionalEffects||[]} coreRules={coreRules} navigate={navigate}/>
   <EnhancementSection items={unit.enhancements||[]} coreRules={coreRules} navigate={navigate} open={open}/>
   {(unit.leaders?.length>0||unit.supporters?.length>0)&&<section className="panel"><h3>Unit associations</h3>
    {unit.leaders?.length>0&&<div className="association-group"><h4>Can lead this unit</h4><div className="association-links">{unit.leaders.map(x=><button type="button" className="text-link" key={x.id} onClick={()=>navigate('unit',x.id)}>{x.name} <ExternalLink size={12}/></button>)}</div></div>}
    {unit.supporters?.length>0&&<div className="association-group"><h4>Can support this unit</h4><div className="association-links">{unit.supporters.map(x=><button type="button" className="text-link" key={x.id} onClick={()=>navigate('unit',x.id)}>{x.name} <ExternalLink size={12}/></button>)}</div></div>}
   </section>
  </>;
 }
 function DetachmentView({item}){
  return <>
   <div className="heading"><div className="eyebrow">DETACHMENT · 11TH EDITION</div><h1>{item.name}{item.detachmentCost!=null?' ['+item.detachmentCost+' DP]':''}</h1></div>
   <Profiles items={item.profiles||[]} coreRules={coreRules}/>
   <section className="panel"><h3>Detachment rules</h3>
    <RuleCards items={item.rules||[]} coreRules={coreRules} references={data.references||{}} navigate={navigate} showLegends={showLegends}/>
   </section>
   <EnhancementSection items={item.enhancements||[]} coreRules={coreRules} navigate={navigate} open={open}/>
   {item.stratagems?.length>0&&<section className="panel"><h3>Stratagems</h3>
    {item.stratagems.map((stratagem,i)=><article className="stratagem-card" key={stratagem.id||i}>
     <h3>{stratagem.name}</h3>
     <div><b>WHEN:</b> <RuleText text={stratagem.when} coreRules={coreRules}/></div>
     <div><b>TARGET:</b> <RuleText text={stratagem.target} coreRules={coreRules}/></div>
     <div><b>EFFECT:</b> <RuleText text={stratagem.effect} coreRules={coreRules}/></div>
     {stratagem.restrictions&&<div><b>RESTRICTIONS:</b> <RuleText text={stratagem.restrictions} coreRules={coreRules}/></div>}
    </article>)}
   </section>}
  </>;
 }
 return <div className="app">
  <aside className="sidebar">
   <button type="button" className="brand brand-home" onClick={()=>chooseSection('units')} title="Return to the current faction's archive home"><span className="sigil ankh" aria-hidden="true">☥</span><span className="brand-wordmark"><strong>CANOPTEK<br/>ARCHIVE</strong><small>DYNASTIC RECORDS · XI</small></span></button>
   <div className="side-title">ARCHIVE INDEX</div>
   <label className="select-label">FACTION<select value={faction} onChange={e=>setFaction(e.target.value)}>
    {index?.factions.map(x=><option key={x.slug} value={x.slug}>{x.name}</option>)}
   </select></label>
   <nav className="sections">
    <button className={section==='units'?'active':''} onClick={()=>chooseSection('units')}><Layers size={17}/> Datasheets <span>{visibleUnits.length}</span></button>
    <button className={section==='detachments'?'active':''} onClick={()=>chooseSection('detachments')}><ScrollText size={17}/> Detachments <span>{data?.detachments.length||0}</span></button>
    <button className={section==='rules'?'active':''} onClick={()=>chooseSection('rules')}><BookOpen size={17}/> Faction rules</button>
    <button className={section==='core'?'active':''} onClick={()=>chooseSection('core')}><BookOpen size={17}/> Core reference</button>
   </nav>
   <div className="side-footer">SOURCE: BSDATA / WH40K-11E<br/>UNOFFICIAL RULES INDEX</div>
  </aside>
  <main>
   <header className="topbar"><div className="breadcrumb"><button type="button" className="breadcrumb-home" onClick={()=>chooseSection('units')} title="Return to the current faction's archive home">ARCHIVE</button><span aria-hidden="true"> / </span>{data?.name||'LOADING'} / {section.toUpperCase()}</div>
    <div className="toolbar"><span className="edition">EDITION XI</span>
     <button className="theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} title="Toggle Necron and Tomb Kings themes">
      {theme==='dark'?<Sun size={17}/>:<Moon size={17}/>} {theme==='dark'?'Tomb Kings':'Necron'}
     </button>
    </div>
   </header>
   <div className="layout">
    <div className="browse">
     <div className="browse-header"><div className="eyebrow">RECORD DIRECTORY</div>
      <h2>{section==='units'?'Datasheets':section==='detachments'?'Detachments':section==='rules'?'Faction rules':'Core reference'}</h2>
      {section==='units'&&<label className="legends-check">
       <input type="checkbox" checked={showLegends} onChange={e=>e.target.checked?setShowLegends(true):hideLegend()}/>
       Show Legends <small>({data?.units.filter(isLegend).length||0})</small>
      </label>}
      <label className="search"><Search size={17}/><input placeholder="Search archive..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
     </div>
     <div className="browse-scroll">
      {section==='units'?grouped.map(([group,units])=><div className="group" key={group}>
       <button className="group-head" onClick={()=>setExpanded(p=>({...p,[group]:!p[group]}))}>
        {expanded[group]?<ChevronRight size={15}/>:<ChevronDown size={15}/>} {group}<small>{units.length}</small>
       </button>
       {!expanded[group]&&units.map(u=><button key={u.id} className={'item '+(selected===u.id?'chosen':'')} onClick={()=>choose(u.id)}>{u.name}</button>)}
      </div>):activeBrowse.map(x=><button key={x.id||x.name} className={'item '+(selected===(x.id||x.name)?'chosen':'')} onClick={()=>choose(x.id||x.name)}>{section==='detachments'&&x.detachmentCost!=null?x.name+' ['+x.detachmentCost+' DP]':x.name}</button>)}
      {!activeBrowse.length&&<p className="empty">No matching records.</p>}
     </div>
    </div>
    <div className="content">
     {error?<div className="notice error">{error}</div>:
      loading?<div className="notice">Decrypting catalogue...</div>:
      !data?<div className="notice">Loading dynastic records...</div>:
      section==='units'&&current?<UnitView unit={current}/>:
      section==='detachments'&&current?<DetachmentView item={current}/>:
      section==='rules'||section==='core'?<>
       <div className="heading"><div className="eyebrow">{section==='core'?'GENERAL REFERENCE':'FACTION ARCHIVE'}</div>
        <h1>{section==='core'?'Core rules reference':data.name+' rules'}</h1></div>
       <div className="notice">Rules from BSData. References below each rule are limited to the currently selected faction and expand on request.</div>
       <RuleCards items={activeBrowse} selected={selected} references={data.references||{}} coreRules={coreRules}
        navigate={navigate} showLegends={showLegends}/>
      </>:<div className="welcome"><div className="glyph">◇</div><div className="eyebrow">AWAITING RECORD SELECTION</div>
       <h1>{data.name}</h1><p>Select a record to inspect its weapons, profiles, loadouts, rules, detachments and enhancements.</p>
       <div className="metrics"><span><b>{visibleUnits.length}</b> DATASHEETS</span>
        <span><b>{data.detachments.length}</b> DETACHMENTS</span></div>
       <a className="source" href={source+encodeURIComponent(data.sourceFile)} target="_blank" rel="noreferrer">
        View original BSData catalogue <ExternalLink size={14}/>
       </a>
      </div>}
     <footer className="footer">BSData community data · Unofficial fan reference · Conditional effects are source-derived, not evaluated for a roster.</footer>
    </div>
   </div>
  </main>
  <RuleModal item={modal} close={()=>setModal(null)} coreRules={coreRules} navigate={navigate}/>
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
