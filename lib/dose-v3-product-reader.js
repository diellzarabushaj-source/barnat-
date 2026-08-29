'use strict';

const { neonRequest }=require('./medindex-data-api.js');
const RpcReader=require('./dose-v3-product-rpc-reader.js');
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();

function pathFor(table,select,filters={},limit=100){
 const q=new URLSearchParams({select});
 for(const [k,v] of Object.entries(filters)) if(v) q.set(k,String(v));
 q.set('limit',String(limit));
 return table+'?'+q.toString();
}
function inIds(values){
 const ids=[...new Set((values||[]).map(clean).filter(Boolean))];
 return ids.length?'in.('+ids.map(v=>v).join(',')+')':'';
}
async function rows(path,label){
 const {data}=await neonRequest(path,{timeoutMs:5000,label});
 if(!Array.isArray(data)) throw new Error(label+': invalid list');
 return data;
}
async function buildMultiRead(selector){
 if(!selector||!['product_key','drug_id'].includes(selector.column)) return null;
 const bindings=await rows(pathFor('dose_rule_products_v3',
  'rule_id,drug_id,product_key,preferred,conversion_enabled,tablet_split_allowed,rounding_increment_value,rounding_increment_unit,binding_status',
  {[selector.column]:'eq.'+selector.value,binding_status:'eq.verified'}),'V3 dose bindings');
 if(!bindings.length) return null;

 const rules=await rows(pathFor('dose_rules_v3',
  'rule_id,rule_key,indication_id,patient_group,calculation_method,dose_min_value,dose_max_value,dose_unit,dose_basis,weight_basis,frequency_mode,interval_min_hours,interval_max_hours,times_per_day,times_per_day_min,times_per_day_max,max_single_dose_mg,max_daily_dose_mg,max_doses_24h,duration_mode,duration_min_days,duration_max_days,review_after_days,min_age_months,max_age_months,min_weight_kg,max_weight_kg,route,pharmaceutical_form,prn,renal_adjustment_required,hepatic_adjustment_required,cardiac_adjustment_required,specialist_only,out_of_range_action,required_inputs,source_key,source_snapshot_id,source_section,source_evidence_hash,version_no,editorial_status',
  {rule_id:inIds(bindings.map(x=>x.rule_id)),editorial_status:'eq.published'}),'V3 dose rules');

 const inds=await rows(pathFor('dose_indication_concepts_v3',
  'indication_id,indication_key,canonical_name,editorial_status',
  {indication_id:inIds(rules.map(x=>x.indication_id)),editorial_status:'eq.published'}),'V3 dose indications');
 const im=new Map(inds.map(x=>[clean(x.indication_id),x]));
 const bm=new Map(bindings.map(x=>[clean(x.rule_id),x]));

 const publicRules=rules.filter(r=>
   clean(r.source_section)==='4.2' &&
   /^[0-9a-f]{64}$/i.test(clean(r.source_evidence_hash)) &&
   /^[0-9a-f]{64}$/i.test(clean(r.source_snapshot_id)) &&
   im.has(clean(r.indication_id))
 ).map(r=>{
   const i=im.get(clean(r.indication_id)),b=bm.get(clean(r.rule_id));
   return {
    ruleId:r.rule_id,ruleKey:r.rule_key,indicationId:r.indication_id,
    indicationKey:i.indication_key,indicationName:i.canonical_name,
    patientGroup:r.patient_group,calculationMethod:r.calculation_method,
    doseMinValue:r.dose_min_value,doseMaxValue:r.dose_max_value,doseUnit:r.dose_unit,
    doseBasis:r.dose_basis,weightBasis:r.weight_basis,frequencyMode:r.frequency_mode,
    intervalMinHours:r.interval_min_hours,intervalMaxHours:r.interval_max_hours,
    timesPerDay:r.times_per_day,timesPerDayMin:r.times_per_day_min,timesPerDayMax:r.times_per_day_max,
    maxSingleDoseMg:r.max_single_dose_mg,maxDailyDoseMg:r.max_daily_dose_mg,maxDoses24h:r.max_doses_24h,
    durationMode:r.duration_mode,durationMinDays:r.duration_min_days,durationMaxDays:r.duration_max_days,
    reviewAfterDays:r.review_after_days,minAgeMonths:r.min_age_months,maxAgeMonths:r.max_age_months,
    minWeightKg:r.min_weight_kg,maxWeightKg:r.max_weight_kg,route:r.route,
    pharmaceuticalForm:r.pharmaceutical_form,prn:r.prn,renalAdjustmentRequired:r.renal_adjustment_required,
    hepaticAdjustmentRequired:r.hepatic_adjustment_required,cardiacAdjustmentRequired:r.cardiac_adjustment_required,
    specialistOnly:r.specialist_only,outOfRangeAction:r.out_of_range_action,requiredInputs:r.required_inputs||[],
    versionNo:r.version_no||1,preferred:b?.preferred===true,
    conversion:{enabled:b?.conversion_enabled===true,tabletSplitAllowed:b?.tablet_split_allowed===true,
      roundingIncrementValue:b?.rounding_increment_value??null,roundingIncrementUnit:b?.rounding_increment_unit||'',
      status:b?.binding_status||''},
    source:{sourceKey:r.source_key,snapshotId:r.source_snapshot_id,section:r.source_section,
      evidenceHash:r.source_evidence_hash,official:true}
   };
 }).sort((a,b)=>a.indicationName.localeCompare(b.indicationName,'sq')||a.ruleKey.localeCompare(b.ruleKey,'en'));

 if(!publicRules.length) return null;
 const shellRows=await rows(pathFor('dose_products_v2',
  'product_key,drug_id,registry_number,pdid,trade_name,active_substance,atc_code,pharmaceutical_form,route,patient_group,numerator_value,numerator_unit,denominator_value,denominator_unit,tablet_split_denominator,is_scored,measurable_increment_ml,rounding_mode,version_no',
  {product_key:'eq.'+clean(bindings[0].product_key),active:'eq.true',editorial_status:'eq.published'},1),'V3 product shell');
 const p=shellRows[0];
 if(!p) return null;
 const strength=(p.numerator_value!=null&&p.denominator_value!=null)
  ? [p.numerator_value,p.numerator_unit].join(' ')+'/'+[p.denominator_value,p.denominator_unit].join(' ')
  : '';
 return {schemaVersion:'dose-product-fast-path-v3',
  product:{productKey:clean(p.product_key),drugId:clean(p.drug_id),registryNumber:p.registry_number,pdid:clean(p.pdid),
   tradeName:clean(p.trade_name),activeSubstance:clean(p.active_substance),atcCode:clean(p.atc_code),
   pharmaceuticalForm:clean(p.pharmaceutical_form),route:clean(p.route),patientGroup:clean(p.patient_group),
   numeratorValue:p.numerator_value,numeratorUnit:clean(p.numerator_unit),denominatorValue:p.denominator_value,
   denominatorUnit:clean(p.denominator_unit),displayLabel:[clean(p.trade_name),strength].filter(Boolean).join(' — '),
   tabletSplitDenominator:p.tablet_split_denominator||1,isScored:p.is_scored===true,
   measurableIncrementMl:p.measurable_increment_ml??null,roundingMode:clean(p.rounding_mode)||'exact',
   versionNo:p.version_no||1,rules:publicRules},
  meta:{dataSource:'supabase-v3',productShell:'dose_products_v2_published_metadata_only',
   failClosed:true,publishedOnly:true,officialVerifiedOnly:true,rules:publicRules.length,dbReads:4,runtimeModel:'v3'}};
}
async function build(selector){
 try {
   const rpcPayload=await RpcReader.build(selector);
   if(rpcPayload) return rpcPayload;
 } catch(error) {
   if(RpcReader.rpcStrict() || !RpcReader.isRpcMissing(error)) throw error;
 }
 const payload=await buildMultiRead(selector);
 if(payload){
   payload.meta={...(payload.meta||{}),rpcFallback:true,runtimeModel:'v3-multi-read-fallback'};
 }
 return payload;
}
module.exports={build,buildMultiRead,_test:{pathFor,inIds,clean}};
