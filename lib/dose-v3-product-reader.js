'use strict';

const { neonRequest } = require('./medindex-data-api.js');
const RpcReader = require('./dose-v3-product-rpc-reader.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function pathFor(table, select, filters = {}, limit = 100) {
  const query = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  query.set('limit', String(limit));
  return table + '?' + query.toString();
}

function inIds(values) {
  const ids = [...new Set((values || []).map(clean).filter(Boolean))];
  return ids.length ? 'in.(' + ids.join(',') + ')' : '';
}

async function rows(requestPath, label) {
  const { data } = await neonRequest(requestPath, { timeoutMs:5000, label });
  if (!Array.isArray(data)) throw new Error(label + ': invalid list');
  return data;
}

function sourceValid(row = {}) {
  const snapshot = clean(row.source_snapshot_id);
  const sectionHash = clean(row.source_section_sha256);
  const hash = clean(row.source_evidence_hash);
  return /^[0-9a-f]{64}$/i.test(snapshot)
    && /^[0-9a-f]{64}$/i.test(sectionHash)
    && /^[0-9a-f]{64}$/i.test(hash)
    && snapshot.toLowerCase() === hash.toLowerCase()
    && clean(row.source_section) === '4.2'
    && Boolean(row.source_document_version || row.source_document_date);
}

function productSourceValid(row = {}) {
  const snapshot = clean(row.source_snapshot_id);
  const hash = clean(row.source_evidence_hash);
  return /^[0-9a-f]{64}$/i.test(snapshot)
    && /^[0-9a-f]{64}$/i.test(hash)
    && snapshot === hash
    && Boolean(row.source_document_version || row.source_document_date);
}

async function buildMultiRead(selector) {
  if (!selector || !['product_key','drug_id'].includes(selector.column)) return null;
  const value = clean(selector.value);
  if (!value) return null;

  const products = await rows(pathFor(
    'dose_products_v3',
    [
      'product_id','drug_id','product_key','registry_number','pdid','trade_name','active_substance',
      'atc_code','pharmaceutical_form','route','patient_group','numerator_value','numerator_unit',
      'denominator_value','denominator_unit','tablet_split_denominator','is_scored',
      'measurable_increment_ml','rounding_mode','source_key','source_snapshot_id',
      'source_evidence_hash','source_document_version','source_document_date','version_no','editorial_status'
    ].join(','),
    { [selector.column]:'eq.' + value, editorial_status:'eq.published' },
    1
  ), 'V3 dose product');

  const product = products[0] || null;
  if (!product || !productSourceValid(product)) return null;

  const bindings = await rows(pathFor(
    'dose_rule_products_v3',
    [
      'rule_id','product_id','preferred','conversion_enabled','tablet_split_allowed',
      'rounding_increment_value','rounding_increment_unit','binding_status'
    ].join(','),
    { product_id:'eq.' + clean(product.product_id), binding_status:'eq.verified' },
    100
  ), 'V3 dose bindings');
  if (!bindings.length) return null;

  const rules = await rows(pathFor(
    'dose_rules_v3',
    [
      'rule_id','rule_key','indication_id','patient_group','calculation_method','dose_min_value',
      'dose_max_value','dose_unit','dose_basis','weight_basis','frequency_mode',
      'interval_min_hours','interval_max_hours','times_per_day','times_per_day_min','times_per_day_max',
      'max_single_dose_mg','max_daily_dose_mg','max_doses_24h','duration_mode','duration_min_days',
      'duration_max_days','review_after_days','min_age_months','max_age_months','min_weight_kg',
      'max_weight_kg','route','pharmaceutical_form','prn','renal_adjustment_required',
      'hepatic_adjustment_required','cardiac_adjustment_required','specialist_only','out_of_range_action',
      'required_inputs','source_key','source_snapshot_id','source_section','source_section_sha256','source_evidence_hash',
      'source_document_version','source_document_date','version_no','editorial_status'
    ].join(','),
    { rule_id:inIds(bindings.map(item => item.rule_id)), editorial_status:'eq.published' },
    100
  ), 'V3 dose rules');

  const indications = await rows(pathFor(
    'dose_indication_concepts_v3',
    'indication_id,indication_key,canonical_name,editorial_status',
    { indication_id:inIds(rules.map(item => item.indication_id)), editorial_status:'eq.published' },
    100
  ), 'V3 dose indications');

  const indicationMap = new Map(indications.map(item => [clean(item.indication_id), item]));
  const bindingMap = new Map(bindings.map(item => [clean(item.rule_id), item]));

  const publicRules = rules
    .filter(rule => sourceValid(rule) && indicationMap.has(clean(rule.indication_id)))
    .map(rule => {
      const indication = indicationMap.get(clean(rule.indication_id));
      const binding = bindingMap.get(clean(rule.rule_id));
      return {
        ruleId:rule.rule_id,
        ruleKey:rule.rule_key,
        indicationId:rule.indication_id,
        indicationKey:indication.indication_key,
        indicationName:indication.canonical_name,
        patientGroup:rule.patient_group,
        calculationMethod:rule.calculation_method,
        doseMinValue:rule.dose_min_value,
        doseMaxValue:rule.dose_max_value,
        doseUnit:rule.dose_unit,
        doseBasis:rule.dose_basis,
        weightBasis:rule.weight_basis,
        frequencyMode:rule.frequency_mode,
        intervalMinHours:rule.interval_min_hours,
        intervalMaxHours:rule.interval_max_hours,
        timesPerDay:rule.times_per_day,
        timesPerDayMin:rule.times_per_day_min,
        timesPerDayMax:rule.times_per_day_max,
        maxSingleDoseMg:rule.max_single_dose_mg,
        maxDailyDoseMg:rule.max_daily_dose_mg,
        maxDoses24h:rule.max_doses_24h,
        durationMode:rule.duration_mode,
        durationMinDays:rule.duration_min_days,
        durationMaxDays:rule.duration_max_days,
        reviewAfterDays:rule.review_after_days,
        minAgeMonths:rule.min_age_months,
        maxAgeMonths:rule.max_age_months,
        minWeightKg:rule.min_weight_kg,
        maxWeightKg:rule.max_weight_kg,
        route:rule.route,
        pharmaceuticalForm:rule.pharmaceutical_form,
        prn:rule.prn,
        renalAdjustmentRequired:rule.renal_adjustment_required,
        hepaticAdjustmentRequired:rule.hepatic_adjustment_required,
        cardiacAdjustmentRequired:rule.cardiac_adjustment_required,
        specialistOnly:rule.specialist_only,
        outOfRangeAction:rule.out_of_range_action,
        requiredInputs:rule.required_inputs || [],
        versionNo:rule.version_no || 1,
        preferred:binding?.preferred === true,
        conversion:{
          enabled:binding?.conversion_enabled === true,
          tabletSplitAllowed:binding?.tablet_split_allowed === true,
          roundingIncrementValue:binding?.rounding_increment_value ?? null,
          roundingIncrementUnit:clean(binding?.rounding_increment_unit),
          status:clean(binding?.binding_status),
        },
        source:{
          sourceKey:rule.source_key,
          snapshotId:rule.source_snapshot_id,
          section:rule.source_section,
          sectionSha256:rule.source_section_sha256,
          evidenceHash:rule.source_evidence_hash,
          documentVersion:rule.source_document_version || null,
          documentDate:rule.source_document_date || null,
          official:true,
        },
      };
    })
    .sort((a, b) => a.indicationName.localeCompare(b.indicationName, 'sq') || a.ruleKey.localeCompare(b.ruleKey, 'en'));

  if (!publicRules.length) return null;

  const strength = product.numerator_value !== null && product.denominator_value !== null
    ? [product.numerator_value, product.numerator_unit].join(' ') + '/' + [product.denominator_value, product.denominator_unit].join(' ')
    : '';

  return {
    schemaVersion:'dose-product-fast-path-v3',
    product:{
      productKey:clean(product.product_key),
      drugId:clean(product.drug_id),
      registryNumber:product.registry_number,
      pdid:clean(product.pdid),
      tradeName:clean(product.trade_name),
      activeSubstance:clean(product.active_substance),
      atcCode:clean(product.atc_code),
      pharmaceuticalForm:clean(product.pharmaceutical_form),
      route:clean(product.route),
      patientGroup:clean(product.patient_group),
      numeratorValue:product.numerator_value,
      numeratorUnit:clean(product.numerator_unit),
      denominatorValue:product.denominator_value,
      denominatorUnit:clean(product.denominator_unit),
      displayLabel:[clean(product.trade_name), strength].filter(Boolean).join(' — '),
      tabletSplitDenominator:product.tablet_split_denominator || 1,
      isScored:product.is_scored === true,
      measurableIncrementMl:product.measurable_increment_ml ?? null,
      roundingMode:clean(product.rounding_mode) || 'exact',
      versionNo:product.version_no || 1,
      rules:publicRules,
    },
    meta:{
      dataSource:'supabase-v3',
      productShell:'dose_products_v3',
      failClosed:true,
      publishedOnly:true,
      officialVerifiedOnly:true,
      rules:publicRules.length,
      dbReads:4,
      runtimeModel:'v3-multi-read-fallback',
    },
  };
}

async function build(selector) {
  try {
    const rpcPayload = await RpcReader.build(selector);
    if (rpcPayload) return rpcPayload;
  } catch (error) {
    if (RpcReader.rpcStrict() || !RpcReader.isRpcMissing(error)) throw error;
  }
  const payload = await buildMultiRead(selector);
  if (payload) payload.meta = { ...(payload.meta || {}), rpcFallback:true };
  return payload;
}

module.exports = {
  build,
  buildMultiRead,
  _test:{ pathFor, inIds, clean, sourceValid, productSourceValid },
};
