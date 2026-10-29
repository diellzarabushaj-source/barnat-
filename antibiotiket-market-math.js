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
  function convert({doseText,drug,combo,form,concentration,allowHalf=false}){
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
      const step=unitStep(form,allowHalf);
      const choices=practicalChoices({min:r.min,max:r.max,strength:c.value,step});
      const rounded=exact===null?null:Math.round(exact/step)*step;
      const fits=exact!==null&&Math.abs(exact-rounded)<1e-9&&rounded>=step&&rounded<=100;
      return {...r,mgMin:r.min,mgMax:r.max,unit:form.unit,choices,units:fits?rounded:null};
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
  function unitStep(form,confirmed=false){
    return confirmed===true&&form?.route==='oral'&&form.measure==='whole'&&form.unit==='tabletë'&&!form.modified?0.5:1;
  }
  function practicalChoices({min,max,strength,step=1}){
    if(![min,max,strength,step].every(Number.isFinite)||min<=0||max<min||strength<=0||![0.5,1].includes(step))return [];
    const out=[];
    for(let i=1;i<=100/step;i++){
      const units=i*step,mg=units*strength;
      if(mg>=min&&mg<=max)out.push({units,mg});
    }
    return out;
  }
  function nearestChoice({target,min,max,strength,step=1}){
    if(!Number.isFinite(target)||target<min||target>max)return null;
    const options=practicalChoices({min,max,strength,step});
    return options.sort((a,b)=>Math.abs(a.mg-target)-Math.abs(b.mg-target)||a.mg-b.mg)[0]||null;
  }
  function formatUnits(n){
    if(!Number.isFinite(n))return '—';
    return n%1===0.5?`${Math.floor(n)||''}½`:String(n).replace('.',',');
  }
  return {parseDose,convert,cadence,dailyTotals,unitStep,practicalChoices,nearestChoice,formatUnits};
});
