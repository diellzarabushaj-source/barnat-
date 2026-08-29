'use strict';

const { neonRequest } = require('./medindex-data-api.js');
const HardenedReader = require('./dose-v3-product-reader.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const truthy = value => ['1','TRUE','YES','ON'].includes(String(value ?? '').trim().toUpperCase());

function enabled() {
  return truthy(process.env.DRX_DOSE_V3_READS);
}

function strictMode() {
  return truthy(process.env.DRX_DOSE_V3_STRICT);
}

function inFilter(values) {
  const unique=[...new Set((values||[]).map(clean).filter(Boolean))];
  if(!unique.length) return '';
  return 'in.(' + unique.map(v => '"' + v.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"').join(',') + ')';
}

function pathFor(table, select, filters={}, limit=100) {
  const params=new URLSearchParams();
  params.set('select',select);
  for(const [k,v] of Object.entries(filters)) if(v!==null&&v!==undefined&&v!=='') params.set(k,String(v));
  params.set('limit',String(limit));
  return table + '?' + params.toString();
}

async function rows(path,label) {
  const {data}=await neonRequest(path,{timeoutMs:5000,label});
  if(!Array.isArray(data)) throw new Error(label + ': invalid response');
  return data;
}

function selectorFilter(selector) {
  if (!selector) return null;
  if (selector.column === 'product_key') return { product_key:'eq.'+selector.value };
  if (selector.column === 'drug_id') return { drug_id:'eq.'+selector.value };
  return null;
}

function publicRule(rule, indication, binding) {
  return {
    ruleId:clean(rule.rule_id),
    ruleKey:clean(rule.rule_key),
    indicationId:clean(rule.indication_id),
    indicationKey:clean(indication?.indication_key),
    indicationName:clean(indication?.canonical_name),
    patientGroup:clean(rule.patient_group),
    calculationMethod:clean(rule.calculation_method),
    doseMinValue:rule.dose_min_value == null ? null : Number(rule.dose_min_value),
    doseMaxValue:rule.dose_max_value == null ? null : Number(rule.dose_max_value),
    doseUnit:clean(rule.dose_unit),
    doseBasis:clean(rule.dose_basis),
    weightBasis:clean(rule.weight_basis),
    frequencyMode:clean(rule.frequency_mode),
    intervalMinHours:rule.interval_min_hours == null ? null : Number(rule.interval_min_hours),
    intervalMaxHours:rule.interval_max_hours == null ? null : Number(rule.interval_max_hours),
    timesPerDay:rule.times_per_day == null ? null : Number(rule.times_per_day),
    timesPerDayMin:rule.times_per_day_min == null ? null : Number(rule.times_per_day_min),
    timesPerDayMax:rule.times_per_day_max == null ? null : Number(rule.times_per_day_max),
    maxSingleDoseMg:rule.max_single_dose_mg == null ? null : Number(rule.max_single_dose_mg),
    maxDailyDoseMg:rule.max_daily_dose_mg == null ? null : Number(rule.max_daily_dose_mg),
    maxDoses24h:rule.max_doses_24h == null ? null : Number(rule.max_doses_24h),
    durationMode:clean(rule.duration_mode),
    durationMinDays:rule.duration_min_days == null ? null : Number(rule.duration_min_days),
    durationMaxDays:rule.duration_max_days == null ? null : Number(rule.duration_max_days),
    reviewAfterDays:rule.review_after_days == null ? null : Number(rule.review_after_days),
    minAgeMonths:rule.min_age_months == null ? null : Number(rule.min_age_months),
    maxAgeMonths:rule.max_age_months == null ? null : Number(rule.max_age_months),
    minWeightKg:rule.min_weight_kg == null ? null : Number(rule.min_weight_kg),
    maxWeightKg:rule.max_weight_kg == null ? null : Number(rule.max_weight_kg),
    route:clean(rule.route),
    pharmaceuticalForm:clean(rule.pharmaceutical_form),
    prn:rule.prn===true,
    renalAdjustmentRequired:rule.renal_adjustment_required===true,
    hepaticAdjustmentRequired:rule.hepatic_adjustment_required===true,
    cardiacAdjustmentRequired:rule.cardiac_adjustment_required===true,
    specialistOnly:rule.specialist_only===true,
    outOfRangeAction:clean(rule.out_of_range_action)||'block',
    requiredInputs:Array.isArray(rule.required_inputs)?rule.required_inputs:[],
    versionNo:Number(rule.version_no)||1,
    preferred:binding?.preferred===true,
    conversion:{
      enabled:binding?.conversion_enabled===true,
      tabletSplitAllowed:binding?.tablet_split_allowed===true,
      roundingIncrementValue:binding?.rounding_increment_value == null ? null : Number(binding.rounding_increment_value),
      roundingIncrementUnit:clean(binding?.rounding_increment_unit),
      status:clean(binding?.binding_status),
    },
    source:{
      sourceKey:clean(rule.source_key),
      snapshotId:clean(rule.source_snapshot_id),
      section:clean(rule.source_section),
      evidenceHash:clean(rule.source_evidence_hash),
      official:true,
    }
  };
}

async function buildProductPayload(selector) {
  if(!enabled()) return null;
  const filter=selectorFilter(selector);
  if(!filter) return null;
  // Deprecated adapter is deliberately routed through the single hardened V3 reader.
  // The legacy implementation below is unreachable by design and retained temporarily
  // only to avoid breaking imports while consumers migrate.
  return HardenedReader.build(selector);

  /* c8 ignore start */

  const bindings=await rows(pathFor(
    'dose_rule_products_v3',
    'binding_id,rule_id,drug_id,product_key,match_method,preferred,conversion_enabled,tablet_split_allowed,rounding_increment_value,rounding_increment_unit,binding_status,verified_at',
    {...filter,binding_status:'eq.verified'},
    100
  ),'DRx V3 bindings');
  if(!bindings.length) return null;

  const ruleIds=bindings.map(x=>clean(x.rule_id));
  const rules=await rows(pathFor(
    'dose_rules_v3',
    'rule_id,rule_key,substance_concept_id,indication_id,patient_group,calculation_method,dose_min_value,dose_max_value,dose_unit,dose_basis,weight_basis,frequency_mode,interval_min_hours,interval_max_hours,times_per_day,times_per_day_min,times_per_day_max,max_single_dose_mg,max_daily_dose_mg,max_doses_24h,duration_mode,duration_min_days,duration_max_days,review_after_days,min_age_months,max_age_months,min_weight_kg,max_weight_kg,route,pharmaceutical_form,prn,renal_adjustment_required,hepatic_adjustment_required,cardiac_adjustment_required,specialist_only,out_of_range_action,required_inputs,source_key,source_snapshot_id,source_section,source_evidence_hash,confidence_score,review_class,editorial_status,verified_by,verified_at,version_no',
    {rule_id:inFilter(ruleIds),editorial_status:'eq.published'},
    100
  ),'DRx V3 rules');

  const indicationIds=rules.map(x=>clean(x.indication_id));
  const indications=await rows(pathFor(
    'dose_indication_concepts_v3',
    'indication_id,indication_key,canonical_name,icd10_codes,editorial_status',
    {indication_id:inFilter(indicationIds),editorial_status:'eq.published'},
    100
  ),'DRx V3 indications');

  const indicationMap=new Map(indications.map(x=>[clean(x.indication_id),x]));
  const bindingMap=new Map(bindings.map(x=>[clean(x.rule_id),x]));
  const publicRules=rules
    .filter(r => /^[0-9a-f]{64}$/i.test(clean(r.source_evidence_hash)) && clean(r.source_snapshot_id))
    .map(r=>publicRule(r,indicationMap.get(clean(r.indication_id)),bindingMap.get(clean(r.rule_id))))
    .filter(r=>r.indicationId && r.indicationKey)
    .sort((a,b)=>a.indicationName.localeCompare(b.indicationName,'sq')||a.ruleKey.localeCompare(b.ruleKey,'en'));

  if(!publicRules.length) return null;
  const first=bindings[0];

  return {
    schemaVersion:'dose-product-fast-path-v3',
    product:{
      productKey:clean(first.product_key),
      drugId:clean(first.drug_id),
      rules:publicRules
    },
    meta:{
      dataSource:'supabase-v3',
      failClosed:true,
      publishedOnly:true,
      officialVerifiedOnly:true,
      rules:publicRules.length,
      dbReads:3,
      runtimeModel:'v3'
    }
  };
  /* c8 ignore stop */
}

module.exports={enabled,strictMode,buildProductPayload,_test:{clean,truthy,inFilter,pathFor,selectorFilter,publicRule}};
