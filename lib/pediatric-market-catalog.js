'use strict';

const crypto = require('node:crypto');
const policy = require('../data/pediatric-market-policy-v1.json');
const routeAudit = require('../data/pediatric-market-route-audit-v1.json');
const { neonRequest } = require('./medindex-data-api.js');
const { convertValue } = require('./pediatric-units.js');
const makeEngine = require('./pediatric-common-dose-engine.generated.js');

const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const number = value => Number(String(value).replace(',','.'));
const amount = value => String(Number(Number(value).toPrecision(8))).replace('.',',');
const SELECT = 'id,registry_number,trade_name,active_substance,atc_code,strength,pharmaceutical_form,packaging,approved_population,pediatric_concentration_value,pediatric_concentration_unit,pediatric_concentration_per_value,pediatric_concentration_per_unit,pediatric_verification_status';
const PAGE_SIZE = 250;

function classifyForm(value) {
  const text = clean(value).toLowerCase();
  if (/suppos|supoz/.test(text)) return {key:'suppository',label:'Supozitor',route:'rectal',measure:'whole',unit:'supozitor'};
  if (/powder.*(?:inject|infus)|lyophili|pluhur.*inj/.test(text)) return {key:'vial-powder',label:'Flakon · pluhur për injeksion',route:'injectable',measure:'powder',unit:'flakon'};
  if (/inject|infus|injeks/.test(text)) return {key:/infus/.test(text)?'infusion':'injection',label:/infus/.test(text)?'Infuzion / ampulë':'Ampulë / injeksion',route:'injectable',measure:'liquid',unit:'mL'};
  if (/nebul|respirator|inhalation solution/.test(text)) return {key:'nebulizer',label:'Solucion për nebulizim',route:'nebulized',measure:'liquid',unit:'mL'};
  if (/inhal|aerosol/.test(text)) return {key:'inhaler',label:'Inhalator',route:'inhaled',measure:'device',unit:'spërkatje'};
  if (/tablet|tableta|tabletë/.test(text)) {
    const modified=/extended|prolonged|modified|sustained|retard|gastro.resistant|enteric/.test(text);
    const key=modified?'tablet-modified':/chew/.test(text)?'tablet-chewable':/dispers|soluble/.test(text)?'tablet-dispersible':/efferves/.test(text)?'tablet-effervescent':'tablet';
    return {key:modified?key+'-'+text.replace(/[^a-z0-9]+/g,'-'):key,label:modified?'Tabletë · '+clean(value):key==='tablet-chewable'?'Tabletë përtypëse':key==='tablet-dispersible'?'Tabletë e tretshme':key==='tablet-effervescent'?'Tabletë eferveshente':'Tabletë',route:'oral',measure:'whole',unit:'tabletë',modified};
  }
  if (/capsul|kapsul/.test(text)) {const modified=/extended|prolonged|modified|sustained|retard|gastro.resistant|enteric/.test(text);return {key:modified?'capsule-modified':'capsule',label:modified?'Kapsulë · çlirim i modifikuar':'Kapsulë',route:'oral',measure:'whole',unit:'kapsulë',modified};}
  if (/oral drops|pika orale/.test(text)) return {key:'oral-drops',label:'Pika orale',route:'oral',measure:'liquid',unit:'mL'};
  if (/syrup|oral (?:solution|suspension)|(?:powder|granules) for oral (?:solution|suspension)|shurup/.test(text)) return {key:'oral-liquid',label:'Shurup / suspension oral',route:'oral',measure:'liquid',unit:'mL',prepare:/powder|granules/.test(text)};
  if (/granul|oral powder/.test(text)) return {key:'oral-granules',label:'Granula / pluhur oral',route:'oral',measure:'whole',unit:'qese'};
  return {key:'other-'+text.replace(/[^a-z0-9]+/g,'-'),label:clean(value)||'Formë e paspecifikuar',route:'unknown',measure:'unknown',unit:''};
}

function containerVolume(row) {
  const matches=[...clean(row.packaging).matchAll(/(\d+(?:[.,]\d+)?)\s*m[lL]\b/g)].map(m=>number(m[1]));
  const unique=[...new Set(matches.filter(v=>v>0))];
  return unique.length===1?unique[0]:null;
}

// A declared numerator/unit and an explicit mL denominator are required.
// Bare mg, percentages, mg per gram and ambiguous multi-component totals
// never become a liquid concentration.
function parseStrength(row, drugName, form) {
  const raw=clean(row.strength).replace(/μ|µ/g,'u');
  if(/(?:^|[+/(])\s*-\s*\d|\d\s*(?:-|–|to)\s*\d|%|\b(?:mmol|mEq)\b/i.test(raw))return {value:null,unit:'',perML:null,basis:'',raw,containerML:null,reason:'Fortësia nuk ka një përmbajtje të vetme të verifikuar.'};
  const unitPattern='(mcg|ug|mg|g|MIU|MU|IU|U)\\b';
  let nums=[...raw.matchAll(new RegExp('(?<![a-z0-9.,-])(\\d+(?:[.,]\\d+)?)\\s*'+unitPattern,'gi'))];
  const denominator=raw.match(/\/\s*(\d+(?:[.,]\d+)?)?\s*m[lL]\b/);
  const volume=denominator?number(denominator[1]||1):null;
  const massValue=(value,unit)=>/^(?:MU|MIU)$/i.test(unit)?value*1000000:/^(?:IU|U)$/i.test(unit)?value:convertValue(value,unit,'mg');
  const dimension=unit=>/^(?:MU|MIU|IU|U)$/i.test(unit)?'IU':'mg';
  let value=null,unit='',basis='';
  if(drugName==='Amoxicillin + Clavulanic' && nums.length===3 && /^1[.,]2\s*g\s*\(/i.test(raw) && number(nums[1][1])===1000 && number(nums[2][1])===200 && nums[1][2].toLowerCase()==='mg' && nums[2][2].toLowerCase()==='mg')nums=nums.slice(1);
  if(nums.length===1){value=massValue(number(nums[0][1]),nums[0][2]);unit=dimension(nums[0][2]);}
  if(drugName==='Amoxicillin + Clavulanic') {
    basis='amoxicillin';
    if(nums.length===2 && nums.every(m=>dimension(m[2])==='mg')) {
      const a=massValue(number(nums[0][1]),nums[0][2]),b=massValue(number(nums[1][1]),nums[1][2]);
      const ratio=a/b;
      if([4,7,8,14].some(r=>Math.abs(ratio-r)<0.05)||form.route==='injectable'&&Math.abs(ratio-5)<0.01){value=a;unit='mg';basis+='|ratio:'+amount(ratio);}
      else {value=null;unit='';}
    } else if(nums.length===1 && volume && form.route==='oral') {
      const known={156.25:125,228.5:200,312.5:250,457:400};
      value=known[massValue(number(nums[0][1]),nums[0][2])]??null;unit=value?'mg':'';if(value)basis+='|ratio:'+([228.5,457].includes(number(nums[0][1]))?'7':'4');
    } else {value=null;unit='';}
  }
  if(drugName==='Cotrimoxazole (TMP + SMZ)') {
    basis='trimethoprim';value=null;unit='';
    if(nums.length===2 && nums.every(m=>dimension(m[2])==='mg')) {
      const a=massValue(number(nums[0][1]),nums[0][2]),b=massValue(number(nums[1][1]),nums[1][2]);
      const reverse=/^trimethoprim/i.test(clean(row.active_substance));
      if(!reverse&&Math.abs(a/b-5)<0.01){value=b;unit='mg';}
      if(reverse&&Math.abs(b/a-5)<0.01){value=a;unit='mg';}
    }
  }
  if(drugName==='Piperacillin + Tazobactam') {
    basis='piperacillin';value=null;unit='';
    if(nums.length===2&&nums.every(m=>dimension(m[2])==='mg')){const a=massValue(number(nums[0][1]),nums[0][2]),b=massValue(number(nums[1][1]),nums[1][2]);if(Math.abs(a/b-8)<0.01){value=a;unit='mg';}}
  }
  if(drugName==='Iron') {
    // Iron salts cannot be equated with elemental iron by a text parser.
    const verified=row.pediatric_verification_status==='verified' && /elemental|elementar/i.test(raw);
    const concentration=number(row.pediatric_concentration_value),per=number(row.pediatric_concentration_per_value);
    if(verified && row.pediatric_concentration_unit==='mg' && row.pediatric_concentration_per_unit==='mL' && concentration>0 && per>0) {
      return {value:concentration,unit:'mg',perML:per,basis:'elemental-iron',raw,containerML:containerVolume(row)};
    }
    return {value:null,unit:'',perML:null,basis:'elemental-iron',raw,containerML:null,reason:'Përmbajtja e hekurit elementar nuk është e verifikuar për këtë produkt.'};
  }
  if(!(value>0) || (denominator && !(volume>0))) return {value:null,unit:'',perML:null,basis,raw,containerML:null,reason:'Përqendrimi ose komponenti aktiv kërkon verifikim.'};
  if(form.measure==='liquid' && !volume) return {value,unit,perML:null,basis,raw,containerML:containerVolume(row),reason:'Etiketa e regjistrit nuk jep përqendrim për mL.'};
  if(form.measure==='whole' && /\//.test(raw) && nums.length!==2) return {value:null,unit:'',perML:null,basis,raw,containerML:null,reason:'Kjo fortësi nuk përcakton përmbajtjen për njësi të plotë.'};
  return {value,unit,perML:volume,basis,raw,containerML:form.route==='injectable'?containerVolume(row):null};
}

function routeMatches(option,form) {
  return option?.route===form.route || option?.route==='oral_or_injectable'&&['oral','injectable'].includes(form.route);
}

function compatibleComponents(name,row,parsed,form) {
  const active=clean(row.active_substance).toLowerCase();
  const compact=active.replace(/[^a-z]/g,'');
  if(name==='Amoxicillin + Clavulanic')return /amox[yi]?c?il/.test(compact)&&/clav/.test(active)&&active.indexOf('amox')<active.indexOf('clav');
  if(name==='Cotrimoxazole (TMP + SMZ)')return /trimethoprim/.test(active)&&/sulfamethoxazole/.test(active);
  if(name==='Piperacillin + Tazobactam')return /piperacillin/.test(active)&&/tazobactam/.test(active)&&active.indexOf('piperacillin')<active.indexOf('tazobactam');
  if(name==='Iron'||name==='Calcium')return false; // Explicit elemental/component audit is required.
  const aliases={Amoxicillin:/amox[yi]?c?il/,Ampicillin:/ampicil/,Clarithromycin:/clar(?:y|i)th(?:r)?omycin|clarithomycin/,Azithromycin:/azithr?omycin|azitrhomycin/,Levofloxacin:/levoflox(?:ac|as)in/,Gentamicin:/gentam[yi]cin/,Cephalexin:/cef?alexin|cephalexin/,Cetirizine:/cet(?:i|e)ri?zin/,CPM:/chlorphenamine|chlorpheniramine/,Acyclovir:/ac[yi]clovir|aciklovir/,Diclofenac:/diclofenac|diclofenak|diklofenak/,Montelukast:/montelu[kc]ast/,Levocetirizine:/levocet(?:i|e)ri?zin/, 'Penicillin G':/benzylpenicillin|penicillin.?g/, Colistin:/colistimethate/};
  const match=aliases[name]||new RegExp(name.toLowerCase().replace(/[^a-z]/g,''));
  if(!match.test(compact))return false;
  if(name==='Penicillin G'&&/procaine|benzathine/.test(active))return false;
  if(name==='Ceftriaxone'&&/lidocain/i.test(active+' '+row.packaging))return false; // Diluent-specific IM handling is not inferred.
  if(/\b(?:and|plus)\b|&/.test(active))return false;
  if(form.route==='oral'&&/injection|infusion/.test(active))return false;
  // A second declared active component cannot borrow a monocomponent regimen.
  const components=active.split(/;|\+/).filter(Boolean);
  return components.every(component=>match.test(component.replace(/[^a-z]/g,''))||/^\s*equivalent to\b/.test(component));
}

function compatibleScheme(name,parsed,option) {
  if(option.marketStrengthMg && (parsed.unit!=='mg'||parsed.value!==option.marketStrengthMg||parsed.perML))return false;
  if(option.marketMgPerML && (parsed.unit!=='mg'||parsed.value/parsed.perML!==option.marketMgPerML))return false;
  if(name==='Amoxicillin + Clavulanic') {
    const ratio=Number((parsed.basis.split('|ratio:')[1]||'').replace(',','.'));
    // The oral twice-daily audit is for 7:1; IV is the audited 1000/200 preparation.
    return option.route==='oral'?Math.abs(ratio-7)<0.05:option.route==='injectable'&&Math.abs(ratio-5)<0.01&&parsed.value===1000;
  }
  return true;
}

function buildCatalog(reference,rows) {
  const engine=makeEngine(reference);
  const drugs=reference.sections.flatMap(section=>section.drugs);
  const catalog=[];
  for(const drug of drugs) {
    const audit=reference.clinicalAudit.drugs[drug.name];
    const options=engine.effectiveOptions(drug);
    const scopes=policy.drugScopes[drug.name]||[];
    const productRows=rows.filter(row=>scopes.includes(row.atc_code));
    const forms=new Map();
    for(const row of productRows) {
      const form=classifyForm(row.pharmaceutical_form);
      const parsed=parseStrength(row,drug.name,form);
      const eligible=compatibleComponents(drug.name,row,parsed,form)&&row.approved_population!=='Adult only';
      const productScope=drug.name==='Paracetamol'&&form.route==='injectable'?(/b.?braun/i.test(row.trade_name)?'b-braun':'other'):'';
      const strengthKey=(parsed.value&&parsed.unit?[parsed.unit,parsed.perML?parsed.value/parsed.perML:parsed.value,parsed.basis,parsed.containerML].join('|'):parsed.raw.toLowerCase())+'|'+eligible+'|'+productScope;
      const variantId=hash([drug.name,form.key,strengthKey]).slice(0,24);
      if(!forms.has(form.key))forms.set(form.key,{id:form.key,label:form.label,route:form.route,variants:[]});
      const group=forms.get(form.key);
      let variant=group.variants.find(item=>item.id===variantId);
      if(!variant) {
        const schemes=options.map((option,index)=>({index,option})).filter(({option})=>eligible&&routeMatches(option,form)&&!form.modified&&!parsed.reason&&parsed.value>0&&compatibleScheme(drug.name,parsed,option)&&(!option.marketProductPattern||new RegExp(option.marketProductPattern,'i').test(row.trade_name))).map(({index,option})=>({index,label:option.displayLabel||option.label,needsAge:engine.needsAge(option),exactDays:engine.optionNeedsExactDays(option),safetyConfirmation:option.safetyConfirmation||''}));
        let label=parsed.raw;
        if(parsed.value&&parsed.unit&&parsed.perML&&parsed.containerML)label=`${amount(parsed.value/parsed.perML*parsed.containerML)} ${parsed.unit} / ${amount(parsed.containerML)} mL`;
        if(!eligible)label+=' · kërkon verifikim';
        if(productScope==='b-braun')label+=' · B. Braun';
        variant={id:variantId,label,form,concentration:parsed,schemes: audit?.calculator?.disabled?[]:schemes,products:[],reason:audit?.calculator?.disabled?audit.calculator.reasonSq:!schemes.length?'Nuk ka skemë të verifikuar për këtë formë.':parsed.reason||''};
        group.variants.push(variant);
      }
      variant.products.push({id:row.id,registryNumber:row.registry_number,name:row.trade_name,strength:row.strength,form:row.pharmaceutical_form,packaging:row.packaging,approvedPopulation:row.approved_population||''});
    }
    for(const form of forms.values())form.variants.sort((a,b)=>b.products.length-a.products.length||(a.concentration.value||0)-(b.concentration.value||0)||a.label.localeCompare(b.label));
    const rankedForms=[...forms.values()].sort((a,b)=>b.variants.reduce((n,v)=>n+v.products.length,0)-a.variants.reduce((n,v)=>n+v.products.length,0));
    catalog.push({name:drug.name,forms:rankedForms,productCount:productRows.length,disabled:Boolean(audit?.calculator?.disabled),reason:audit?.calculator?.reasonSq||''});
  }
  return {version:policy.schemaVersion,routeAuditVersion:routeAudit.schemaVersion,source:'AKKPM · regjistri i publikuar i Barnave',ranking:'Numri i produkteve të publikuara, jo shitjet ose stoku',revision:hash([catalog,routeAudit]),drugs:catalog,productCount:rows.length};
}

function withMarket(reference,rows) {
  const drugs={...reference.clinicalAudit.drugs};
  for(const [name,options] of Object.entries(routeAudit.drugs)) {
    const audit=drugs[name];
    if(!audit || audit.calculator?.disabled)continue;
    drugs[name]={...audit,calculator:{...audit.calculator,options:[...audit.calculator.options.filter(o=>!o.marketRouteVersion),...options.map(o=>({...o,marketRouteVersion:routeAudit.schemaVersion}))]},sources:[...audit.sources.filter(s=>!s.marketRouteVersion),...options.map(option=>({authority:'SmPC',title:option.label,url:option.sourceUrl,marketRouteVersion:routeAudit.schemaVersion}))]};
  }
  const active={...reference,clinicalAudit:{...reference.clinicalAudit,drugs}};
  active.marketCatalog=buildCatalog(active,rows);
  return active;
}

async function loadProducts() {
  const codes=[...new Set(Object.values(policy.drugScopes).flat())];
  const rows=[];
  for(let offset=0;offset<2500;offset+=PAGE_SIZE) {
    const params=new URLSearchParams({select:SELECT,is_published:'eq.true',editorial_status:'eq.published',atc_code:`in.(${codes.join(',')})`,order:'id.asc',limit:String(PAGE_SIZE),offset:String(offset)});
    const response=await neonRequest('drugs?'+params,{label:'Pediatric published formulations',timeoutMs:8000});
    if(!Array.isArray(response.data))throw Error('Market data unavailable');
    rows.push(...response.data);
    if(response.data.length<PAGE_SIZE)return rows;
  }
  throw Error('Market data exceeded bounded catalog size');
}

module.exports={policy,buildCatalog,withMarket,loadProducts,classifyForm,parseStrength,routeMatches};
