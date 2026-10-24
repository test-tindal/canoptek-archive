// Repair BattleScribe/BSData rule prose without interpreting rule semantics.
// A blank line is required after a list when a new, unindented paragraph
// follows, otherwise Markdown treats that paragraph as part of the last item.
export function formatRuleMarkdown(value){
  const lines=String(value??'').replace(/\r\n?/g,'\n').replace(/\^\^([^^\n]+)\^\^/g,'$1').split('\n');
  const result=[];
  let priorWasList=false;
  for(let line of lines){
    const isList=/^\s{0,3}(?:[-+*]\s+|\d+[.)]\s+|[▪•]\s+)/.test(line);
    if(priorWasList && line.trim() && !isList && !/^\s/.test(line))result.push('');
    if(/^\s{0,3}[▪•]\s+/.test(line))line=line.replace(/^(\s{0,3})[▪•]\s+/,'$1- ');
    result.push(line);
    priorWasList=isList;
  }
  return result.join('\n');
}
export const ruleNameSort=(a,b)=>String(a.name||'').localeCompare(String(b.name||''),'en',{sensitivity:'base',numeric:true});
