'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('./medindex-data-api.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const enabledFlag = value => ['1','TRUE','YES','ON'].includes(clean(value).toUpperCase());

function shadowEnabled(env = process.env) {
  return enabledFlag(env.DRX_DOSE_V3_SHADOW);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function selectorHash(selector = {}) {
  return crypto.createHash('sha256')
    .update(clean(selector.column) + ':' + clean(selector.value))
    .digest('hex');
}

function canonicalRule(rule = {}) {
  return {
    ruleKey:clean(rule.ruleKey),
    indicationKey:clean(rule.indicationKey),
    patientGroup:clean(rule.patientGroup),
    calculationMethod:clean(rule.calculationMethod),
    doseMinValue:numberOrNull(rule.doseMinValue),
    doseMaxValue:numberOrNull(rule.doseMaxValue),
    doseUnit:clean(rule.doseUnit).toLowerCase(),
    doseBasis:clean(rule.doseBasis),
    weightBasis:clean(rule.weightBasis),
    frequencyMode:clean(rule.frequencyMode),
    intervalMinHours:numberOrNull(rule.intervalMinHours),
    intervalMaxHours:numberOrNull(rule.intervalMaxHours),
    timesPerDay:numberOrNull(rule.timesPerDay),
    maxSingleDoseMg:numberOrNull(rule.maxSingleDoseMg),
    maxDailyDoseMg:numberOrNull(rule.maxDailyDoseMg),
    maxDoses24h:numberOrNull(rule.maxDoses24h),
    durationMode:clean(rule.durationMode),
    durationMinDays:numberOrNull(rule.durationMinDays),
    durationMaxDays:numberOrNull(rule.durationMaxDays),
    reviewAfterDays:numberOrNull(rule.reviewAfterDays),
    minAgeMonths:numberOrNull(rule.minAgeMonths),
    maxAgeMonths:numberOrNull(rule.maxAgeMonths),
    minWeightKg:numberOrNull(rule.minWeightKg),
    maxWeightKg:numberOrNull(rule.maxWeightKg),
    route:clean(rule.route).toUpperCase(),
    prn:bool(rule.prn),
    specialistOnly:bool(rule.specialistOnly),
    outOfRangeAction:clean(rule.outOfRangeAction),
  };
}

function canonicalPayload(payload) {
  const product = payload?.product;
  if (!product) return null;
  const rules = Array.isArray(product.rules) ? product.rules.map(canonicalRule) : [];
  rules.sort((a,b) => a.ruleKey.localeCompare(b.ruleKey,'en'));
  return {
    product:{
      productKey:clean(product.productKey),
      drugId:clean(product.drugId).toLowerCase(),
      registryNumber:clean(product.registryNumber),
      pdid:clean(product.pdid),
      patientGroup:clean(product.patientGroup),
      pharmaceuticalForm:clean(product.pharmaceuticalForm).toLowerCase(),
      route:clean(product.route).toUpperCase(),
      numeratorValue:numberOrNull(product.numeratorValue),
      numeratorUnit:clean(product.numeratorUnit).toLowerCase(),
      denominatorValue:numberOrNull(product.denominatorValue),
      denominatorUnit:clean(product.denominatorUnit).toLowerCase(),
    },
    rules,
  };
}

function payloadHash(payload) {
  const canonical = canonicalPayload(payload);
  return canonical
    ? crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
    : null;
}

const stableJson = value => JSON.stringify(value);

function comparePayloads(v2Payload, v3Payload, v3Error = null) {
  const v2 = canonicalPayload(v2Payload);
  const v3 = canonicalPayload(v3Payload);

  if (v3Error) return {
    status:'V3_ERROR', diffCodes:['V3_ERROR'],
    v2Hash:v2 ? payloadHash(v2Payload) : null, v3Hash:null,
    v2RuleCount:v2?.rules.length ?? null, v3RuleCount:null,
  };
  if (!v2 && !v3) return {
    status:'BOTH_MISSING',diffCodes:['BOTH_MISSING'],
    v2Hash:null,v3Hash:null,v2RuleCount:null,v3RuleCount:null
  };
  if (v2 && !v3) return {
    status:'V2_ONLY',diffCodes:['V3_MISSING'],
    v2Hash:payloadHash(v2Payload),v3Hash:null,
    v2RuleCount:v2.rules.length,v3RuleCount:null
  };
  if (!v2 && v3) return {
    status:'V3_ONLY',diffCodes:['V2_MISSING'],
    v2Hash:null,v3Hash:payloadHash(v3Payload),
    v2RuleCount:null,v3RuleCount:v3.rules.length
  };

  const diffCodes = [];
  const identity = p => ({
    productKey:p.productKey,drugId:p.drugId,registryNumber:p.registryNumber,pdid:p.pdid
  });
  if (stableJson(identity(v2.product)) !== stableJson(identity(v3.product))) {
    diffCodes.push('PRODUCT_IDENTITY');
  }

  const presentation = p => ({
    patientGroup:p.patientGroup,
    pharmaceuticalForm:p.pharmaceuticalForm,
    route:p.route,
    numeratorValue:p.numeratorValue,
    numeratorUnit:p.numeratorUnit,
    denominatorValue:p.denominatorValue,
    denominatorUnit:p.denominatorUnit,
  });
  if (stableJson(presentation(v2.product)) !== stableJson(presentation(v3.product))) {
    diffCodes.push('PRODUCT_PRESENTATION');
  }

  if (v2.rules.length !== v3.rules.length) diffCodes.push('RULE_COUNT');

  const v2Keys = v2.rules.map(rule => rule.ruleKey);
  const v3Keys = v3.rules.map(rule => rule.ruleKey);
  if (stableJson(v2Keys) !== stableJson(v3Keys)) diffCodes.push('RULE_KEY_SET');

  const v3ByKey = new Map(v3.rules.map(rule => [rule.ruleKey,rule]));
  if (v2.rules.some(rule => v3ByKey.has(rule.ruleKey)
      && stableJson(rule) !== stableJson(v3ByKey.get(rule.ruleKey)))) {
    diffCodes.push('RULE_SEMANTICS');
  }

  return {
    status:diffCodes.length ? 'DIFF' : 'MATCH',
    diffCodes,
    v2Hash:payloadHash(v2Payload),
    v3Hash:payloadHash(v3Payload),
    v2RuleCount:v2.rules.length,
    v3RuleCount:v3.rules.length,
  };
}

function v3Selector(selector, v2Payload) {
  if (selector?.column === 'product_key' || selector?.column === 'drug_id') return selector;
  if (selector?.column === 'registry_number' && clean(v2Payload?.product?.drugId)) {
    const drugId = clean(v2Payload.product.drugId);
    return { column:'drug_id',value:drugId,publicKey:drugId };
  }
  return null;
}

async function record({ selector,runtimeServed,comparison,durationMs }) {
  await neonRequest('rpc/drx_record_dose_shadow_comparison_v1', {
    method:'POST',
    body:{
      p_selector_kind:clean(selector?.column),
      p_selector_sha256:selectorHash(selector),
      p_runtime_served:clean(runtimeServed) || 'none',
      p_comparison_status:comparison.status,
      p_diff_codes:comparison.diffCodes,
      p_v2_payload_sha256:comparison.v2Hash,
      p_v3_payload_sha256:comparison.v3Hash,
      p_v2_rule_count:comparison.v2RuleCount,
      p_v3_rule_count:comparison.v3RuleCount,
      p_duration_ms:Number.isFinite(durationMs) ? Math.max(0,Math.round(durationMs)) : null,
    },
    timeoutMs:2500,
    label:'DRx V3 shadow telemetry',
  });
  return comparison;
}

module.exports = {
  shadowEnabled,selectorHash,canonicalPayload,payloadHash,comparePayloads,v3Selector,record,
  _test:{ clean,enabledFlag,numberOrNull,bool,canonicalRule,stableJson },
};
