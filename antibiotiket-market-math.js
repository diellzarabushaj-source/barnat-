(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DRX_ANTIBIOTIC_MARKET_MATH=factory();})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const clean=x=>String(x??'').replace(/\s+/g,' ').trim();
  const escape=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function parseDose(text,drug,combo=false){
    let raw=clean(text).replace(/,/g,'.');
    if(combo){const match=new RegExp(escape(drug)+':\\s*([^+]+)','i').exec(raw);if(!match)return [];raw=match[1];}
    if(/Dita|Ditët/i.test(raw))return raw.split('·').map(part=>{const m=/^([^:]+):\s*(\d+(?:\.\d+)?)\s*mg/i.exec(clean(part));return m?{label:clean(m[1]),min:Number(m[2]),max:Number(m[2])}:null;}).filter(Boolean);
    const fixed=/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*mg/i.exec(raw);
    if(fixed)return [{label:'Për një marrje',min:Number(fixed[1]),max:Number(fixed[1])}];
    const match=/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*mg(?:\s+[\p{L}-]+)?\/dozë/iu.exec(raw);
    return match?[{label:'Për një marrje',min:Number(match[1]),max:Number(match[2]||match[1])}]:[];
  }
  function convert({doseText,drug,combo,form,concentration}){
    const c=concentration,rows=parseDose(doseText,drug,combo);
    if(form?.route!=='oral'||form.modified||c?.reason||c?.unit!=='mg'||!(c.value>0))return {error:'Forma ose përqendrimi nuk lejon konvertim oral automatik.',rows:[]};
    if(!rows.length||rows.some(r=>!Number.isFinite(r.min)||r.min<=0||r.max<r.min))return {error:'Nuk ka dozë të llogaritshme për këtë zgjedhje.',rows:[]};
    if(form.measure==='liquid'){
      if(!(c.perML>0))return {error:'Mungon përqendrimi i shprehur për mL.',rows:[]};
      return {rows:rows.map(r=>({...r,min:r.min*c.perML/c.value,max:r.max*c.perML/c.value,mgMin:r.min,mgMax:r.max,unit:'mL'}))};
    }
    if(form.measure!=='whole')return {error:'Kjo formë kërkon përgatitje sipas produktit.',rows:[]};
    return {rows:rows.map(r=>{
      const exact=r.min===r.max?r.min/c.value:null;
      const choices=[];for(let n=1;n<=Math.min(100,Math.floor(r.max/c.value+1e-9));n++)if(n*c.value>=r.min-1e-9&&n*c.value<=r.max+1e-9)choices.push({units:n,mg:n*c.value});
      const integer=exact!==null&&Math.abs(exact-Math.round(exact))<1e-9&&exact>=1&&exact<=100;
      return {...r,mgMin:r.min,mgMax:r.max,unit:form.unit,choices,units:integer?Math.round(exact):null};
    })};
  }
  function cadence(frequency){
    const value=clean(frequency);
    let match=/^(\d+) herë\/ditë$/.exec(value);
    if(match){const times=Number(match[1]);return [1,2,3,4,6].includes(times)?[{times,hours:24/times}]:[];}
    match=/^(\d+) ose (\d+) herë\/ditë$/.exec(value);
    if(match){const times=[...new Set([Number(match[1]),Number(match[2])])];return times.every(n=>[1,2,3,4,6].includes(n))?times.map(n=>({times:n,hours:24/n})):[];}
    return [];
  }
  function dailyTotals(conversion,frequency){
    if(conversion?.error||!conversion?.rows?.length)return [];
    return cadence(frequency).map(schedule=>({...schedule,rows:conversion.rows.map(row=>({
      ...row,min:row.min*schedule.times,max:row.max*schedule.times,
      mgMin:row.mgMin*schedule.times,mgMax:row.mgMax*schedule.times,
      units:row.units?row.units*schedule.times:null,
      choices:row.choices?.map(choice=>({units:choice.units*schedule.times,mg:choice.mg*schedule.times})),
    }))}));
  }
  return {parseDose,convert,cadence,dailyTotals};
});
