'use strict';

const SOURCE_SCORE = Object.freeze({
  EMA:1.00,
  EMC:0.96,
  AEMPS_CIMA:0.96,
  EU_NATIONAL:0.92,
  KOSOVO_AKPPM:0.88,
  MEDIATELY:0.45,
  FALLBACK:0.25,
});

const MATCH_SCORE = Object.freeze({
  exact_concept:1.00,
  exact_key:0.96,
  exact_product:1.00,
  exact_alias:1.00,
  verified_manual:0.95,
  substance_route_form:0.92,
  compatible:0.80,
  substance_only:0.65,
  candidate:0.60,
  unspecified:0.50,
  fuzzy:0.35,
  none:0.00,
});

const EXTRACTION_SCORE = Object.freeze({
  structured_verified:1.00,
  section_4_2_parsed:0.92,
  manual_transcription:0.72,
  secondary_reference:0.45,
  none:0.00,
});

const WEIGHTS = Object.freeze({
  source:0.20,
  substance:0.20,
  formulation:0.15,
  indication:0.20,
  product:0.15,
  extraction:0.10,
});

function clamp(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function scoreOf(map, key) {
  return clamp(map[String(key || '')] ?? 0);
}

function confidence(input = {}) {
  const dimensions = {
    source:scoreOf(SOURCE_SCORE, input.sourceTier),
    substance:scoreOf(MATCH_SCORE, input.substanceMatch),
    formulation:scoreOf(MATCH_SCORE, input.formulationMatch),
    indication:scoreOf(MATCH_SCORE, input.indicationMatch),
    product:scoreOf(MATCH_SCORE, input.productMatch),
    extraction:scoreOf(EXTRACTION_SCORE, input.extractionMethod),
  };

  const hardBlockers = [];
  if (!['EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM'].includes(String(input.sourceTier || ''))) {
    hardBlockers.push('non_authoritative_source');
  }
  if (['none','fuzzy'].includes(String(input.substanceMatch || ''))) hardBlockers.push('substance_identity_not_exact');
  if (String(input.formulationMatch || '') === 'none') hardBlockers.push('formulation_mismatch');
  if (['none','fuzzy','candidate'].includes(String(input.indicationMatch || ''))) hardBlockers.push('indication_not_verified');
  if (String(input.productMatch || '') === 'none') hardBlockers.push('product_match_missing');
  if (input.combinationBasisAmbiguous === true) hardBlockers.push('combination_basis_ambiguous');
  if (input.sourceConflict === true) hardBlockers.push('source_conflict');
  if (input.highRisk === true) hardBlockers.push('high_risk_manual_review');
  if (input.offLabel === true) hardBlockers.push('off_label_manual_review');
  if (input.safetyConflict === true) hardBlockers.push('safety_conflict');

  const score = Object.entries(WEIGHTS)
    .reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0);

  let reviewClass = 'manual_review';
  if (!hardBlockers.length && score >= 0.93
      && dimensions.substance >= 0.96
      && dimensions.indication >= 0.95
      && dimensions.product >= 0.92) {
    reviewClass = 'auto_reviewable';
  } else if (!hardBlockers.length && score >= 0.78) {
    reviewClass = 'quick_review';
  }

  return {
    schemaVersion:'drx-dose-confidence-v1',
    score:Number(score.toFixed(4)),
    dimensions,
    hardBlockers,
    reviewClass,
  };
}

module.exports = {
  SOURCE_SCORE,
  MATCH_SCORE,
  EXTRACTION_SCORE,
  WEIGHTS,
  confidence,
  _test:{ clamp, scoreOf },
};
