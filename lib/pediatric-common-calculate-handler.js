'use strict';

const { loadReference } = require('./pediatric-common-reference-handler.js');
const makeEngine = require('./pediatric-common-dose-engine.generated.js');
const liquid = require('../pediatric-common-liquid-core.js');
const {convertValue}=require('./pediatric-units.js');
const {neonRequest}=require('./medindex-data-api.js');
const market=require('./pediatric-market-catalog.js');
const VIEW = 'pediatric-common-calculate';

const revisionOf = reference => JSON.stringify([
  reference.database?.clinicalAudit?.version || reference.clinicalAudit?.schemaVersion || '',
  reference.database?.clinicalAudit?.updatedAt || reference.clinicalAudit?.auditedAt || '',
  reference.database?.payloadSha256 || '',
  ...(reference.marketCatalog ? [reference.marketCatalog.revision] : []),
]);

function decimal(value) {
  if (!['string','number'].includes(typeof value)) return NaN;
  const text = String(value ?? '').trim().replace(',', '.');
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}

function calculate(reference, input) {
  if (input.referenceRevision !== revisionOf(reference)) return { error:'Referenca ka ndryshuar ose nuk është aktive. Ringarko faqen para llogaritjes.' };
  const engine = makeEngine(reference);
  const drug = reference.sections.flatMap(section => section.drugs).find(item => item.name === input.drugName);
  if (!drug) return { error:'Bari nuk u gjet në referencën aktive.' };
  const audit = reference.clinicalAudit?.drugs?.[drug.name];
  if (!audit || audit.calculator?.disabled) return { error:audit?.calculator?.reasonSq || 'Llogaritja nuk është e lejuar për këtë bar.' };
  const index = typeof input.optionIndex === 'number' || (typeof input.optionIndex === 'string' && /^\d+$/.test(input.optionIndex)) ? Number(input.optionIndex) : NaN;
  const options = engine.effectiveOptions(drug);
  if (!Number.isInteger(index) || index < 0 || !options[index]) return { error:'Zgjidh një skemë të verifikuar.' };
  const option = options[index];
  const variant=reference.marketCatalog?.drugs.find(item=>item.name===drug.name)?.forms.flatMap(form=>form.variants).find(item=>item.id===input.variantId);
  if(reference.marketCatalog && (!variant || !variant.schemes.some(scheme=>scheme.index===index)))return {error:variant?.reason||'Zgjidh formën dhe fortësinë me skemë të verifikuar.'};
  const safetyConfirmation=option.safetyConfirmation||variant?.safetyConfirmation;
  if(safetyConfirmation && input.safetyConfirmed!==true)return {error:safetyConfirmation,needsSafetyConfirmation:true};
  const weight = decimal(input.weight);
  if (engine.needsPatientWeight(option) && (!Number.isFinite(weight) || weight < 0.4 || weight > 150)) {
    return { error:'Shëno peshën reale ndërmjet 0,4 dhe 150 kg.' };
  }
  const values = { weight:String(weight), age:'', ageUnit:'month', ageManual:false };
  if (input.ageConfirmed === true) {
    if (!['day','month','year'].includes(input.ageUnit)) return { error:'Zgjidh njësinë e moshës.' };
    const age = decimal(input.age);
    if (!Number.isFinite(age) || age < 0 || engine.ageDays(age,input.ageUnit) > 18 * 365.25) {
      return { error:'Mosha duhet të jetë nga 0 deri në 18 vjeç.' };
    }
    values.age = String(age); values.ageUnit = input.ageUnit; values.ageManual = true;
  }
  // Weight is sufficient for weight-only rules. It cannot establish actual age
  // for a rule whose eligibility/frequency/dose depends on chronological age.
  if (engine.needsAge(option) && !values.ageManual) {
    return { error:'Kjo skemë varet nga mosha. Konfirmo ose ndrysho moshën e sugjeruar.', needsAgeConfirmation:true, exactDaysRequired:engine.optionNeedsExactDays(option) };
  }
  if (engine.optionNeedsExactDays(option) && values.ageManual && engine.ageDays(values.age, values.ageUnit) < 60 && values.ageUnit !== 'day') {
    return { error:'Për foshnjat nën 60 ditë, shëno moshën e saktë në ditë.', needsAgeConfirmation:true, exactDaysRequired:true };
  }
  if(drug.name==='Montelukast'&&variant){
    const months=engine.ageMonths(values.age,values.ageUnit);const min=variant.form.key==='oral-granules'?12:variant.form.key==='tablet-chewable'?24:180;
    const strength=variant.concentration.value;const valid=variant.form.key==='oral-granules'?strength===4&&months>=12&&months<72:variant.form.key==='tablet-chewable'?(strength===4&&months>=24&&months<72||strength===5&&months>=72&&months<180):variant.form.key==='tablet'&&strength===10&&months>=180;
    if(!valid||months<min)return {error:'Kjo formë dhe fortësi e montelukastit nuk i përshtatet moshës reale. Nën 2 vjeç përdoren vetëm granulat e verifikuara 4 mg.'};
  }
  const result = engine.calculateOption(option, values);
  if (result.error) return result;
  if (![result.doseMin,result.doseMax].every(value => Number.isFinite(value) && value > 0)) {
    return { error:'Nuk ka rezultat numerik të sigurt për këtë skemë.' };
  }
  if(variant) {
    const band=option.containerWeightBands?.find(b=>b.mL===variant.concentration.containerML);
    if(option.containerWeightBands && (!band || band.minKg!=null&&(band.minInclusive===false?weight<=band.minKg:weight<band.minKg)||band.maxKg!=null&&weight>band.maxKg))return {error:'Madhësia e kësaj ampule / flakoni nuk lejohet për këtë peshë. Zgjidh paketimin e duhur.'};
    const selectedMeasure=measureFor(result,variant);
    return {...result,selectedMeasure,variantId:variant.id,selectedStrength:variant.label,selectedForm:variant.form.label,
      conversions:[],vialItems:[],ageInfo:engine.resolvedAgeInfo(values),drugName:drug.name,optionIndex:index,
      route:variant.form.route,administrationNote:variant.administrationNote,schemeLabel:option.displayLabel||option.label,
      resultWarnings:drug.name==='Cetirizine'?(audit.warningsSq||[]).slice(1):(option.marketRouteVersion?[]:(audit.warningsSq||[]).slice(0,1)),
      warnings:audit.warningsSq||[],referenceVersion:reference.marketCatalog.version};
  }
  const practical = engine.practicalDrug(drug);
  return { ...result, conversions:liquid.volumeConversions(result, liquid.presentationsFor(practical,option)),
    vialItems:liquid.vialConversions(result,practical,option), formulationAudit:liquid.formulationAudit(practical,option),
    ageInfo:engine.resolvedAgeInfo(values), drugName:drug.name, optionIndex:index,
    referenceVersion:reference.database?.clinicalAudit?.version || reference.clinicalAudit.schemaVersion,
    referenceUpdatedAt:reference.database?.clinicalAudit?.updatedAt || null };
}

function measureFor(result,variant) {
  const strength=variant.concentration;
  const from=result.doseUnit==='U'?'IU':result.doseUnit;
  const lo=convertValue(result.perDoseMin??result.doseMin,from,strength.unit);
  const hi=convertValue(result.perDoseMax??result.doseMax,from,strength.unit);
  const period=result.perDoseMin!=null?'dose':result.dosePeriod;
  if(!(lo>0)||!(hi>0)||!(strength.value>0))return {error:'Njësia e dozës nuk përputhet me fortësinë e produktit.'};
  if(variant.form.measure==='liquid'&&strength.perML>0) {
    const min=lo/strength.value*strength.perML,max=hi/strength.value*strength.perML;
    if(!(min>0)||!Number.isFinite(max))return {error:'Nuk ka përqendrim të sigurt për këtë produkt.'};
    return {min,max,unit:'mL',period,basis:strength.basis,preparation:variant.form.prepare?'Përqendrimi vlen pas përgatitjes sipas etiketës.':variant.form.route==='injectable'?'Vëllimi para hollimit; përgatit sipas SmPC.':''};
  }
  if(variant.form.measure==='whole') {
    if(period!=='dose')return {error:'Skema nuk përcakton dozë për marrje; njësitë e plota nuk ndahen automatikisht.'};
    const min=Math.ceil(lo/strength.value-1e-9),max=Math.floor(hi/strength.value+1e-9);
    if(min<1||max<min)return {error:'Kjo fortësi nuk jep njësi të plota brenda dozës së verifikuar. Zgjidh një fortësi më të vogël ose formë të lëngshme; mos e ndaj automatikisht.'};
    return {min,max,unit:variant.form.unit,period,actualMin:min*strength.value,actualMax:max*strength.value,actualUnit:strength.unit};
  }
  return {error:variant.form.measure==='powder'?'Doza është në masë. Vëllimi pas rikonstituimit kërkon udhëzimin e produktit; nuk hamendësohet.':'Kjo formë nuk ka konvertim të verifikuar.'};
}

async function verifySelectedProducts(reference,input) {
  const variant=reference.marketCatalog?.drugs.find(d=>d.name===input.drugName)?.forms.flatMap(f=>f.variants).find(v=>v.id===input.variantId);
  if(!variant || !variant.products.length || variant.products.length>250)return false;
  const ids=variant.products.map(p=>p.id);
  if(ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return false;
  const params=new URLSearchParams({select:'id,registry_number,trade_name,active_substance,atc_code,strength,pharmaceutical_form,packaging,approved_population,pediatric_concentration_value,pediatric_concentration_unit,pediatric_concentration_per_value,pediatric_concentration_per_unit,pediatric_verification_status',id:`in.(${ids.join(',')})`,is_published:'eq.true',editorial_status:'eq.published',order:'id.asc',limit:'250'});
  const response=await neonRequest('drugs?'+params,{label:'Verify selected AKKPM formulation',timeoutMs:8000});
  if(!Array.isArray(response.data))return false;
  const current=market.buildCatalog(reference,response.data).drugs.find(d=>d.name===input.drugName)?.forms.flatMap(f=>f.variants).find(v=>v.id===input.variantId);
  const sorted=products=>[...products].sort((a,b)=>a.id.localeCompare(b.id));
  return current && JSON.stringify(sorted(current.products))===JSON.stringify(sorted(variant.products));
}

module.exports = async function(req,res) {
  res.setHeader('Cache-Control','private, no-store'); res.setHeader('Vary','Cookie');
  const auth = await import('./auth.mjs');
  if (!(await auth.verifySessionToken(auth.sessionFromRequest(req)))) return res.status(401).json({error:'Sesioni nuk është aktiv.'});
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Metodë e palejuar.'}); }
  let input = req.body;
  try { if (typeof input === 'string') { if (input.length > 4096) throw Error(); input=JSON.parse(input); } } catch { return res.status(400).json({error:'Të dhënat nuk janë të vlefshme.'}); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 4096) return res.status(400).json({error:'Të dhënat nuk janë të vlefshme.'});
  try {
    const reference=await loadReference();
    const result = calculate(reference,input);
    if(!result.error && !(await verifySelectedProducts(reference,input)))return res.status(422).json({error:'Produkti ka ndryshuar ose nuk është më i publikuar. Ringarko listën para llogaritjes.'});
    return res.status(result.error ? 422 : 200).json(result);
  } catch { return res.status(503).json({error:'Referenca aktive nuk u ngarkua. Provo përsëri; rezultati i vjetër nuk përdoret.'}); }
};
module.exports.VIEW = VIEW;
module.exports.calculate = calculate;
module.exports.revisionOf = revisionOf;
module.exports.measureFor = measureFor;
module.exports.verifySelectedProducts = verifySelectedProducts;
