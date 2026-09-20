'use strict';
const assert = require('node:assert/strict');
const snapshot = require('../data/dozologjia-master-v27-production.json');
const sq = require('./dozologjia-sq');
const shelf = require('./dozologjia-products');
const mass = {g:1000, mg:1, mcg:0.001};
const numeric = v => typeof v === 'number' && Number.isFinite(v);
const positive = v => numeric(v) && v > 0;
const missing = v => v === null || v === undefined || v === '' || v === 'None';
const ids = text => String(text || '').split(';').map(x=>x.trim()).filter(Boolean);

function compile(s) {
  const index=(name,key)=>{
    assert.ok(Array.isArray(s[name]), `Missing ${name}`);
    const m=new Map(s[name].map(r=>[r[key],r]));
    assert.equal(m.size,s[name].length,`Duplicate ${name}.${key}`);return m;
  };
  const regs=index('REGIMENS','Atomic_Regimen_ID'), releases=index('AUTO_RELEASE_MATRIX','Atomic_Regimen_ID');
  const drugs=index('DRUGS','Drug_ID'), indications=index('INDICATIONS','Indication_ID'), products=index('FORMULATIONS','Formulation_ID'), sources=index('SOURCES','Source_ID');
  index('PRODUCTION_EXPORT','Atomic_Regimen_ID');
  const provenance=value=>{assert.ok(ids(value).length);ids(value).forEach(id=>assert.ok(sources.has(id),`Missing source ${id}`));};
  const statuses=['ACTIVE_FULL','ACTIVE_GATED','ACTIVE_DOSE_ONLY','ACTIVE_PROTOCOL_GATED'];
  const rows=s.PRODUCTION_EXPORT.map(e=>{
    const r=regs.get(e.Atomic_Regimen_ID), release=releases.get(e.Atomic_Regimen_ID);
    assert.ok(r && release);assert.equal(r.Publish,'YES');
    assert.ok(['READY','READY_SEQUENCE','READY_CONDITIONAL','READY_NONCALC','READY_DAILY_TOTAL'].includes(r.Atomic_Status));
    assert.ok(statuses.includes(e.Release_Status));assert.equal(e.Release_Status,release.Auto_Release_Status);
    for(const k of ['Dose_Output_Mode','Product_Output_Mode','Prep_Output_Mode'])assert.equal(e[k],release[k]);
    for(const k of ['Drug_ID','Indication_ID','Route_Code','Dose_Basis','Dose_Min','Dose_Max','Dose_Unit','Frequency_Type','Interval_Min','Interval_Max','Interval_Unit'])assert.equal(missing(e[k])?null:e[k],missing(r[k])?null:r[k],`${e.Atomic_Regimen_ID}.${k}`);
    assert.ok(drugs.has(r.Drug_ID)&&drugs.get(r.Drug_ID).Clinical_Status!=='BLOCKED');assert.equal(indications.get(r.Indication_ID)?.Status,'ACTIVE');provenance(r.Source_IDs);
    const related=t=>s[t].filter(x=>x.Atomic_Regimen_ID===r.Atomic_Regimen_ID);
    const bindings=related('REGIMEN_FORMULATION_BINDINGS').filter(b=>b.Status==='ACTIVE').map(b=>{const f=products.get(b.Formulation_ID);assert.ok(f&&f.Drug_ID===r.Drug_ID&&b.Drug_ID===r.Drug_ID);provenance(f.Source_ID);return {...b,product:f};});
    const steps=related('REGIMEN_STEPS').sort((a,b)=>a.Step_Order-b.Step_Order), maxima=related('MAX_RULES');
    if(r.Atomic_Status==='READY_SEQUENCE')assert.ok(steps.length);
    const gates=s.SAFETY_GATES.filter(g=>g.Status==='ACTIVE'&&((g.Scope_Type==='REGIMEN'&&g.Scope_ID===r.Atomic_Regimen_ID)||(g.Scope_Type==='DRUG'&&g.Scope_ID===r.Drug_ID)));
    const preps=s.PARENTERAL_PREP.filter(p=>p.Drug_ID===r.Drug_ID&&p.Route_Code===r.Route_Code&&p.Status==='VERIFIED'&&p.Auto_Calc==='YES');
    [...steps,...maxima,...gates].forEach(x=>provenance(x.Source_IDs));preps.forEach(p=>provenance(p.Source_ID));
    return {...r,...e,drug:drugs.get(r.Drug_ID),indication:indications.get(r.Indication_ID),bindings,steps,maxima,gates,preps};
  });
  assert.equal(rows.length,43);assert.equal(rows.length,s.REGIMENS.filter(r=>r.Publish==='YES').length);
  return {metadata:s.metadata,regimens:rows,sources:[...sources.values()]};
}
const data=compile(snapshot);

/* Albanian is not decoration here: the page has no English fallback, so a
   published string with no rendering must stop the module rather than reach a
   clinician untranslated. */
function say(map,key,what){
  const value=map[key];
  assert.ok(value,`Missing Albanian ${what}: ${JSON.stringify(key)}`);
  return value;
}
const maxKey = m => m.Display_Max || `${m.Max_Min} ${m.Max_Unit}`;
for(const r of data.regimens){
  say(sq.INDICATIONS,r.Indication_ID,'indication');
  say(sq.ROUTES,r.Route_Code,'route');
  say(sq.POPULATIONS,r.Population_Display,'population');
  if(r.Display_Frequency)say(sq.FREQUENCIES,r.Display_Frequency,'frequency');
  if(r.Display_Duration)say(sq.DURATIONS,r.Display_Duration,'duration');
  if(r.Safety_Text)say(sq.SAFETY,r.Safety_Text,'safety note');
  r.maxima.forEach(m=>say(sq.MAXIMA,maxKey(m),'dose ceiling'));
  r.steps.forEach(x=>{say(sq.STEPS,x.Trigger,'step');if(x.Notes)say(sq.STEP_NOTES,x.Notes,'step note');});
  r.preps.forEach(p=>{say(sq.PREPARATIONS,p.Display_Preparation,'preparation');if(p.Notes)say(sq.PREPARATION_NOTES,p.Notes,'preparation note');});
  r.gates.filter(g=>g.Gate_Level==='REQUIRED').forEach(g=>say(sq.GATES,g.Rule_Text,`gate ${g.Gate_ID}`));
  if(!missing(r.Dose_Unit))say(sq.UNITS,r.Dose_Unit,'dose unit');
  r.steps.forEach(x=>{if(!missing(x.Dose_Unit))say(sq.UNITS,x.Dose_Unit,'step unit');});
  if(r.Dose_Basis==='LOCAL_APPLICATION')say(sq.LOCAL_DOSES,r.Display_Dose,'local application');
  if(r.Product_Output_Mode!=='DOSE_ONLY_NO_PRODUCT_CONVERSION')r.bindings.forEach(b=>say(sq.FORMS,b.product.Form_Type,'dosage form'));
}
const drugName = r => sq.DRUGS[r.Drug_ID] || r.drug.Canonical_Name;
function limits(r) {
  const rows=r.maxima.map(m=>({...m,sq:sq.MAXIMA[m.Display_Max||`${m.Max_Min} ${m.Max_Unit}`]}));
  if(r.Daily_Dose_Unit==='mg/kg/day'&&!['WEIGHT_DAILY','FIXED_DAILY'].includes(r.Dose_Basis))rows.push({Max_Type:'DAILY_WEIGHT',Max_Min:r.Daily_Dose_Min,Max_Unit:'mg/kg/day',Parse_Status:'PARSED',Display_Max:`${r.Daily_Dose_Min} mg/kg/ditë — kufiri më i ulët i intervalit të burimit`,sq:`${r.Daily_Dose_Min} mg/kg në ditë — kufiri më i ulët i intervalit të burimit`});
  else if(r.Daily_Dose_Unit==='mg/day'&&positive(r.Daily_Dose_Max))rows.push({Max_Type:'DAILY',Max_Min:r.Daily_Dose_Max,Max_Unit:'mg/day',Parse_Status:'PARSED',Display_Max:`${r.Daily_Dose_Max} mg/ditë`,sq:`${r.Daily_Dose_Max} mg në ditë`});
  return rows;
}
const required = r => r.gates.filter(g=>g.Gate_Level==='REQUIRED');
function requirements(r) {
  return {age:!missing(r.Age_Min_Value)||!missing(r.Age_Max_Value),
    weight:r.Dose_Basis.startsWith('WEIGHT_')||!missing(r.Weight_Min_Kg)||!missing(r.Weight_Max_Kg)||r.Daily_Dose_Unit==='mg/kg/day'||r.preps.some(p=>p.Administration_Rate_Unit==='g/kg/h'),
    daily:limits(r).some(m=>['DAILY','DAILY_WEIGHT'].includes(m.Max_Type))&&!['FIXED_DAILY','WEIGHT_DAILY'].includes(r.Dose_Basis),
    total:r.maxima.some(m=>m.Max_Type==='TOTAL'),
    product:['FIXED_COMBINATION_PRODUCT','LOCAL_APPLICATION','LOCAL_LENGTH'].includes(r.Dose_Basis)||required(r).some(g=>g.Gate_Type==='PRODUCT_MATCH')};
}
function catalog() {
  return {metadata:data.metadata,regimens:data.regimens.map(r=>({id:r.Atomic_Regimen_ID,drugId:r.Drug_ID,indicationId:r.Indication_ID,
    drug:drugName(r),indication:sq.INDICATIONS[r.Indication_ID],route:r.Route_Code,routeLabel:sq.ROUTES[r.Route_Code].short,routeText:sq.ROUTES[r.Route_Code].long,
    population:sq.POPULATIONS[r.Population_Display],frequency:r.Display_Frequency?sq.FREQUENCIES[r.Display_Frequency]:'',duration:r.Display_Duration?sq.DURATIONS[r.Display_Duration]:'',
    safety:r.Safety_Text?sq.SAFETY[r.Safety_Text]:'',unit:r.Dose_Unit,unitLabel:sq.UNITS[r.Dose_Unit]||r.Dose_Unit,status:r.Release_Status,needs:requirements(r),
    doseRule:r.steps.length?null:{basis:r.Dose_Basis,min:r.Dose_Min,max:r.Dose_Max,unitLabel:sq.UNITS[r.Dose_Unit]||r.Dose_Unit},
    age:{minValue:r.Age_Min_Value,minUnit:r.Age_Min_Unit,minOp:r.Age_Min_Op,maxValue:r.Age_Max_Value,maxUnit:r.Age_Max_Unit,maxOp:r.Age_Max_Op},
    gates:required(r).filter(g=>g.Gate_Type!=='PRODUCT_MATCH').map(g=>({id:g.Gate_ID,text:sq.GATES[g.Rule_Text]})),
    products:r.Product_Output_Mode==='DOSE_ONLY_NO_PRODUCT_CONVERSION'?[]:r.bindings.map(b=>({id:b.Formulation_ID,name:b.product.Product_Name,strength:b.product.Strength_Display,form:sq.FORMS[b.product.Form_Type]})),
    manualMeasurementAllowed:['PO','RECTAL'].includes(r.Route_Code),
    templates:['PO','RECTAL'].includes(r.Route_Code)?(shelf.TEMPLATES[r.Drug_ID]||[]):[],caution:shelf.CAUTIONS[r.Drug_ID]||'',
    steps:r.steps.map(s=>({id:s.Step_ID,order:s.Step_Order,label:sq.STEPS[s.Trigger]}))}))};
}
function compare(v,bound,op) {
  if(missing(bound))return true;if(!numeric(v)||!numeric(bound))return false;
  return ({'>':v>bound,'>=':v>=bound,'<':v<bound,'<=':v<=bound})[op]===true;
}
const AGE_UNITS = {year:'vjeç', month:'muajsh'};
const bound = op => ({'>':'mbi','>=':'së paku','<':'nën','<=':'deri në'})[op] || op;
const blocked = errors => ({outcome:'BLOCKED',errors:Array.isArray(errors)?errors:[errors],dose:null,conversion:null,preparation:null});
function calculate(input) {
  const allowed=['regimenId','drugId','indicationId','age','ageUnit','weight','scope','gates','productId','stepId','given24h','givenTotal'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))return blocked('Parametra të palejuar. Doza vjen vetëm nga Master-i.');
  const r=data.regimens.find(x=>x.Atomic_Regimen_ID===input.regimenId);
  if(!r||r.Drug_ID!==input.drugId||r.Indication_ID!==input.indicationId)return blocked('Zgjidh barin, indikacionin dhe skemën aktive.');
  const n=requirements(r),errors=[];
  if(input.scope!==true)errors.push(`Konfirmo grupin e pacientit: ${r.Population_Display}.`);
  if(n.age)for(const side of ['Min','Max'])if(!missing(r[`Age_${side}_Value`])){
    const units={year:12,month:1}, actual=positive(input.age)&&units[input.ageUnit]&&units[r[`Age_${side}_Unit`]]?input.age*units[input.ageUnit]/units[r[`Age_${side}_Unit`]]:NaN;
    if(!compare(actual,r[`Age_${side}_Value`],r[`Age_${side}_Op`]))errors.push(`Mosha duhet të jetë ${bound(r[`Age_${side}_Op`])} ${r[`Age_${side}_Value`]} ${AGE_UNITS[r[`Age_${side}_Unit`]]||r[`Age_${side}_Unit`]}.`);
  }
  if(n.weight&&!positive(input.weight))errors.push('Shëno peshën reale në kg.');
  for(const side of ['Min','Max'])if(!compare(input.weight,r[`Weight_${side}_Kg`],r[`Weight_${side}_Op`]))errors.push(`Pesha duhet të jetë ${bound(r[`Weight_${side}_Op`])} ${r[`Weight_${side}_Kg`]} kg.`);
  const binding=r.bindings.find(b=>b.Formulation_ID===input.productId),step=r.steps.find(s=>s.Step_ID===input.stepId);
  if(input.productId&&(!binding||r.Product_Output_Mode==='DOSE_ONLY_NO_PRODUCT_CONVERSION'))errors.push('Formulimi nuk lejohet për këtë skemë.');
  if(n.product&&!binding)errors.push('Zgjidh formulimin e saktë.');
  for(const g of required(r))if(g.Gate_Type!=='PRODUCT_MATCH'&&input.gates?.[g.Gate_ID]!=='PASS')errors.push(sq.GATES[g.Rule_Text]);
  for(const [needed,key,label] of [[n.daily,'given24h','24 orëve të fundit'],[n.total,'givenTotal','këtij episodi']])if(needed&&(!numeric(input[key])||input[key]<0))errors.push(`Shëno sasinë e dhënë gjatë ${label} (${r.Dose_Unit}); 0 nëse nuk është dhënë.`);
  if(r.steps.length&&!step)errors.push('Zgjidh hapin e skemës.');if(!r.steps.length&&input.stepId)errors.push('Kjo skemë nuk ka hapa.');
  if(errors.length)return blocked(errors);
  const basis=step?.Dose_Basis||r.Dose_Basis,lo=step?step.Dose_Min:r.Dose_Min,hi=step?step.Dose_Max:r.Dose_Max,unit=step?.Dose_Unit||r.Dose_Unit;
  let dose=null,conversion=null,preparation=null;const notices=[];
  if(basis==='LOCAL_APPLICATION')notices.push('Aplikim lokal: nuk llogariten mg, gramë ose mL për aplikim.');
  else if(basis==='RESPONSE_BASED')notices.push('Hap sipas përgjigjes klinike; burimi nuk përcakton dozë numerike për këtë hap.');
  else if(basis==='FIXED_COMBINATION_PRODUCT'){
    if(binding?.Conversion_Mode!=='WHOLE_UNIT_ONLY'||!positive(binding.Unit_Count))return blocked('Mungon lidhja e produktit të kombinuar.');
    dose={min:binding.Unit_Count,max:binding.Unit_Count,unit:'tabletë',period:'dose'};
  } else {
    if(!['FIXED_PER_DOSE','FIXED_VOLUME','WEIGHT_PER_DOSE','WEIGHT_DAILY','FIXED_DAILY','LOCAL_LENGTH'].includes(basis)||!positive(lo)||!positive(hi)||lo>hi)return blocked('Formulë numerike e paplotë.');
    const factor=basis.startsWith('WEIGHT_')?input.weight:1;
    dose={min:lo*factor,max:hi*factor,unit,period:['FIXED_DAILY','WEIGHT_DAILY'].includes(basis)?'day':'dose'};
    if(!positive(dose.min)||!positive(dose.max))return blocked('Rezultat numerik jashtë kufijve.');
    const raw={...dose};
    for(const m of limits(r)){
      const mu=m.Max_Unit.split('/')[0];
      if(m.Parse_Status!=='PARSED'||!positive(m.Max_Min)||!mass[unit]||!mass[mu])return blocked('Kufi doze i pambështetur.');
      let cap=m.Max_Min*mass[mu]/mass[unit];
      if(m.Max_Type==='DAILY_WEIGHT')cap*=input.weight;
      if(['DAILY','DAILY_WEIGHT'].includes(m.Max_Type)&&dose.period!=='day')cap-=input.given24h;
      else if(m.Max_Type==='TOTAL')cap-=input.givenTotal;
      else if(!['SINGLE','DAILY','DAILY_WEIGHT'].includes(m.Max_Type))return blocked('Lloji i kufirit nuk mbështetet.');
      if(!numeric(cap)||cap<=0)return blocked('Kufiri i dozës është arritur.');
      if(m.Max_Type!=='SINGLE'&&cap<dose.min)return blocked('Doza e skemës tejkalon kufirin e mbetur.');
      dose.min=Math.min(dose.min,cap);dose.max=Math.min(dose.max,cap);
    }
    dose.raw=raw;if(raw.max!==dose.max)notices.push('Doza u kufizua nga kufiri i ruajtur përpara konvertimit.');
    if(dose.period==='day')notices.push('Dozë totale ditore. Nuk është ndarë automatikisht në doza për marrje.');
  }
  if(binding&&dose&&dose.period!=='day'&&r.Product_Output_Mode==='EXACT_PRODUCT_ALLOWED'&&!['LOCAL_APPLICATION','WHOLE_UNIT_ONLY','DISPLAY_AVAILABLE_STRENGTH','FIXED_VOLUME'].includes(binding.Conversion_Mode)){
    const f=binding.product,parenteral=['IV','IM','IV_IO','SC'].includes(r.Route_Code),prep=r.preps.find(p=>p.Formulation_ID===f.Formulation_ID);
    if(parenteral&&(r.Prep_Output_Mode!=='AUTO_PREP_ALLOWED'||!prep))notices.push('Mungon përgatitja e lidhur për këtë produkt dhe rrugë; mL nuk llogariten.');
    else if(f.Conversion_Allowed==='YES'){
      const conc=parenteral?prep.Final_Concentration_Min:f.Concentration_Value,cu=parenteral?prep.Final_Concentration_Unit:f.Concentration_Unit;
      if(positive(conc)&&mass[dose.unit]&&['g/mL','mg/mL','mcg/mL'].includes(cu)&&(!parenteral||(['READY','READY_INFUSION'].includes(prep.Prep_Type)&&prep.Final_Concentration_Min===prep.Final_Concentration_Max))){
        const factor=mass[dose.unit]/mass[cu.split('/')[0]]/conc;
        conversion={min:dose.min*factor,max:dose.max*factor,unit:'mL',product:f.Product_Name,strength:f.Strength_Display};
        if(parenteral){
          preparation={id:prep.Prep_ID,instruction:sq.PREPARATIONS[prep.Display_Preparation],notes:prep.Notes?sq.PREPARATION_NOTES[prep.Notes]:'',timeMin:prep.Administration_Time_Min,timeMax:prep.Administration_Time_Max,timeUnit:prep.Administration_Time_Unit,source:prep.Source_ID};
          if(positive(prep.Administration_Rate_Value)){
            let rate=null;if(prep.Administration_Rate_Unit==='mg/min')rate=prep.Administration_Rate_Value;if(prep.Administration_Rate_Unit==='g/kg/h')rate=prep.Administration_Rate_Value*1000*input.weight/60;
            if(!positive(rate))return blocked('Kufi shpejtësie i pambështetur.');preparation.minimumMinutesAtMaxDose=dose.max*mass[dose.unit]/rate;
          }
        }
      }
    }
  }
  if(dose)dose.unitLabel=sq.UNITS[dose.unit]||dose.unit;
  if(conversion)conversion.unitLabel='mL';
  if(r.Prep_Output_Mode==='PROTOCOL_ONLY')notices.push('Doza lejohet; mL, hollimi dhe përgatitja kërkojnë protokoll specifik.');
  if(r.Product_Output_Mode==='DOSE_ONLY_NO_PRODUCT_CONVERSION'||(!binding&&dose?.unit!=='mL'))notices.push(['PO','RECTAL'].includes(r.Route_Code)?'Master-i nuk lidh produkt me këtë skemë: sasia për të matur llogaritet nga produkti që zgjedh ti.':'Për këtë rrugë kërkohet produkt dhe përgatitje e verifikuar; nuk përdoren fuqi tipike për konvertim.');
  const refs=new Set([r.Source_IDs,step?.Source_IDs,binding?.product.Source_ID,preparation?.source,...r.gates.map(g=>g.Source_IDs),...r.maxima.map(m=>m.Source_IDs)].flatMap(ids));
  return {outcome:dose?'CALCULATED':'INSTRUCTION',errors:[],id:r.Atomic_Regimen_ID,drug:drugName(r),indication:sq.INDICATIONS[r.Indication_ID],route:r.Route_Code,routeLabel:sq.ROUTES[r.Route_Code].short,routeText:sq.ROUTES[r.Route_Code].long,population:sq.POPULATIONS[r.Population_Display],certification:data.metadata.certification,dose,conversion,preparation,
    step:step?{id:step.Step_ID,label:sq.STEPS[step.Trigger],startDay:step.Start_Day,endDay:step.End_Day,delayMin:step.Delay_Min,delayMax:step.Delay_Max,delayUnit:step.Delay_Unit,note:step.Notes?sq.STEP_NOTES[step.Notes]:''}:null,
    calculation:dose?.raw?{basis,min:lo,max:hi,weight:basis.startsWith('WEIGHT_')?input.weight:null}:null,
    instruction:basis==='LOCAL_APPLICATION'?sq.LOCAL_DOSES[r.Display_Dose]:null,frequency:{type:r.Frequency_Type,min:r.Interval_Min,max:r.Interval_Max,unit:r.Interval_Unit,timesMin:r.Doses_Per_Day_Min,timesMax:r.Doses_Per_Day_Max},
    duration:{type:r.Duration_Type,min:r.Duration_Min,max:r.Duration_Max,unit:r.Duration_Unit},frequencyNote:r.Display_Frequency?sq.FREQUENCIES[r.Display_Frequency]:'',durationNote:r.Display_Duration?sq.DURATIONS[r.Display_Duration]:'',safety:r.Safety_Text?sq.SAFETY[r.Safety_Text]:'',maxima:limits(r),notices,sources:data.sources.filter(s=>refs.has(s.Source_ID)),product:binding?{name:binding.product.Product_Name,strength:binding.product.Strength_Display,form:sq.FORMS[binding.product.Form_Type]}:null};
}
module.exports={compile,data,requirements,catalog,calculate};
