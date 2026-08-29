'use strict';

const ALLOWED_METHODS = new Set([
  'fixed_dose',
  'fixed_volume',
  'dose_per_kg_per_dose',
  'dose_per_kg_per_day',
  'dose_per_m2_per_dose',
  'dose_per_m2_per_day',
  'age_band_fixed',
  'manual_only',
]);

const FREQUENCY_MODES = new Set(['interval','times_per_day','prn','single','continuous','manual']);
const DURATION_MODES = new Set(['none','fixed_days','range_days','review_after','manual']);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function orderedRange(min, max) {
  return min === null || max === null || min <= max;
}

function requiredInputs(rule = {}) {
  const method = clean(rule.calculationMethod || rule.calculation_method);
  const inputs = new Set();

  if (['dose_per_kg_per_dose','dose_per_kg_per_day'].includes(method)) inputs.add('weight_kg');
  if (['dose_per_m2_per_dose','dose_per_m2_per_day'].includes(method)) {
    inputs.add('weight_kg');
    inputs.add('height_cm');
  }
  const patientGroup = clean(rule.patientGroup || rule.patient_group);
  if (method === 'age_band_fixed'
      || ['adult_only','pediatric_only'].includes(patientGroup)
      || numberOrNull(rule.minAgeMonths ?? rule.min_age_months) !== null
      || numberOrNull(rule.maxAgeMonths ?? rule.max_age_months) !== null) {
    inputs.add('age_months');
  }
  if (numberOrNull(rule.minWeightKg ?? rule.min_weight_kg) !== null
      || numberOrNull(rule.maxWeightKg ?? rule.max_weight_kg) !== null) {
    inputs.add('weight_kg');
  }
  if (booleanValue(rule.renalAdjustmentRequired ?? rule.renal_adjustment_required)) {
    inputs.add('renal_function');
  }
  if (booleanValue(rule.hepaticAdjustmentRequired ?? rule.hepatic_adjustment_required)) {
    inputs.add('hepatic_function');
  }
  if (booleanValue(rule.specialistOnly ?? rule.specialist_only) || method === 'manual_only') {
    inputs.add('manual_clinical_review');
  }

  return [...inputs];
}

function normalizeRule(input = {}) {
  const method = clean(input.calculationMethod || input.calculation_method);
  const frequencyMode = clean(input.frequencyMode || input.frequency_mode || 'manual');
  const durationMode = clean(input.durationMode || input.duration_mode || 'none');

  const rule = {
    ruleKey:clean(input.ruleKey || input.rule_key),
    indicationKey:clean(input.indicationKey || input.indication_key),
    patientGroup:clean(input.patientGroup || input.patient_group),
    calculationMethod:method,
    doseMinValue:numberOrNull(input.doseMinValue ?? input.dose_min_value),
    doseMaxValue:numberOrNull(input.doseMaxValue ?? input.dose_max_value),
    doseUnit:clean(input.doseUnit || input.dose_unit),
    doseBasis:clean(input.doseBasis || input.dose_basis),
    weightBasis:clean(input.weightBasis || input.weight_basis),
    frequencyMode,
    intervalMinHours:numberOrNull(input.intervalMinHours ?? input.interval_min_hours),
    intervalMaxHours:numberOrNull(input.intervalMaxHours ?? input.interval_max_hours),
    timesPerDay:numberOrNull(input.timesPerDay ?? input.times_per_day),
    maxSingleDoseMg:numberOrNull(input.maxSingleDoseMg ?? input.max_single_dose_mg),
    maxDailyDoseMg:numberOrNull(input.maxDailyDoseMg ?? input.max_daily_dose_mg),
    maxDoses24h:numberOrNull(input.maxDoses24h ?? input.max_doses_24h),
    durationMode,
    durationMinDays:numberOrNull(input.durationMinDays ?? input.duration_min_days),
    durationMaxDays:numberOrNull(input.durationMaxDays ?? input.duration_max_days),
    reviewAfterDays:numberOrNull(input.reviewAfterDays ?? input.review_after_days),
    minAgeMonths:numberOrNull(input.minAgeMonths ?? input.min_age_months),
    maxAgeMonths:numberOrNull(input.maxAgeMonths ?? input.max_age_months),
    minWeightKg:numberOrNull(input.minWeightKg ?? input.min_weight_kg),
    maxWeightKg:numberOrNull(input.maxWeightKg ?? input.max_weight_kg),
    route:clean(input.route),
    prn:booleanValue(input.prn),
    renalAdjustmentRequired:booleanValue(input.renalAdjustmentRequired ?? input.renal_adjustment_required),
    hepaticAdjustmentRequired:booleanValue(input.hepaticAdjustmentRequired ?? input.hepatic_adjustment_required),
    specialistOnly:booleanValue(input.specialistOnly ?? input.specialist_only),
    outOfRangeAction:clean(input.outOfRangeAction || input.out_of_range_action || 'block'),
    sourceKey:clean(input.sourceKey || input.source_key),
    sourceSection:clean(input.sourceSection || input.source_section || '4.2'),
    sourceSnapshotId:clean(input.sourceSnapshotId || input.source_snapshot_id),
    sourceEvidenceHash:clean(input.sourceEvidenceHash || input.source_evidence_hash),
    editorialStatus:clean(input.editorialStatus || input.editorial_status || 'draft').toLowerCase(),
  };
  rule.requiredInputs = requiredInputs(rule);
  return rule;
}

function validateRule(input = {}) {
  const rule = normalizeRule(input);
  const errors = [];

  if (!rule.ruleKey) errors.push('rule_key_missing');
  if (!rule.indicationKey) errors.push('indication_key_missing');
  if (!rule.patientGroup) errors.push('patient_group_missing');
  if (!ALLOWED_METHODS.has(rule.calculationMethod)) errors.push('calculation_method_invalid');
  if (!FREQUENCY_MODES.has(rule.frequencyMode)) errors.push('frequency_mode_invalid');
  if (!DURATION_MODES.has(rule.durationMode)) errors.push('duration_mode_invalid');
  if (!rule.sourceKey) errors.push('source_key_missing');
  if (rule.sourceSection !== '4.2') errors.push('dose_source_section_must_be_4_2');

  if (rule.calculationMethod !== 'manual_only') {
    if (rule.doseMinValue === null && rule.doseMaxValue === null) errors.push('dose_value_missing');
    if (!rule.doseUnit) errors.push('dose_unit_missing');
  }

  if (rule.frequencyMode === 'interval' && rule.intervalMinHours === null) errors.push('interval_min_hours_missing');
  if (rule.frequencyMode === 'times_per_day' && rule.timesPerDay === null) errors.push('times_per_day_missing');

  if (rule.durationMode === 'fixed_days' && rule.durationMinDays === null) errors.push('duration_min_days_missing');
  if (rule.durationMode === 'range_days' && (rule.durationMinDays === null || rule.durationMaxDays === null)) {
    errors.push('duration_range_missing');
  }
  if (rule.durationMode === 'review_after' && rule.reviewAfterDays === null) errors.push('review_after_days_missing');

  if ((rule.prn || rule.frequencyMode === 'prn')
      && rule.intervalMinHours === null
      && rule.maxDoses24h === null) {
    errors.push('prn_ceiling_missing');
  }

  if (!orderedRange(rule.doseMinValue, rule.doseMaxValue)) errors.push('dose_range_inverted');
  if (!orderedRange(rule.intervalMinHours, rule.intervalMaxHours)) errors.push('interval_range_inverted');
  if (!orderedRange(rule.durationMinDays, rule.durationMaxDays)) errors.push('duration_range_inverted');
  if (!orderedRange(rule.minAgeMonths, rule.maxAgeMonths)) errors.push('age_range_inverted');
  if (!orderedRange(rule.minWeightKg, rule.maxWeightKg)) errors.push('weight_range_inverted');

  if (rule.maxSingleDoseMg !== null
      && rule.maxDailyDoseMg !== null
      && rule.maxSingleDoseMg > rule.maxDailyDoseMg) {
    errors.push('single_dose_above_daily_max');
  }
  if (rule.timesPerDay !== null
      && rule.maxDoses24h !== null
      && rule.timesPerDay > rule.maxDoses24h) {
    errors.push('times_per_day_above_max_doses_24h');
  }

  if (['dose_per_kg_per_dose','dose_per_kg_per_day'].includes(rule.calculationMethod)
      && !rule.requiredInputs.includes('weight_kg')) {
    errors.push('weight_input_required');
  }
  if (['dose_per_m2_per_dose','dose_per_m2_per_day'].includes(rule.calculationMethod)
      && (!rule.requiredInputs.includes('weight_kg') || !rule.requiredInputs.includes('height_cm'))) {
    errors.push('bsa_inputs_required');
  }

  const publicationLike = ['verified','published'].includes(rule.editorialStatus);
  if (publicationLike) {
    if (!/^[0-9a-f]{64}$/i.test(rule.sourceSnapshotId)) errors.push('source_snapshot_missing_or_invalid');
    if (!/^[0-9a-f]{64}$/i.test(rule.sourceEvidenceHash)) errors.push('source_evidence_hash_missing_or_invalid');
    if (rule.calculationMethod === 'manual_only') errors.push('manual_only_cannot_auto_publish');
  }

  return {
    schemaVersion:'drx-dose-rule-validation-v1',
    valid:errors.length === 0,
    errors,
    rule,
  };
}

function publicationDecision(input = {}) {
  const result = validateRule(input);
  if (!result.valid) return { allowed:false, reason:'rule_validation_failed', errors:result.errors, rule:result.rule };
  if (!['verified','published'].includes(result.rule.editorialStatus)) {
    return { allowed:false, reason:'editorial_status_not_publishable', errors:[], rule:result.rule };
  }
  if (result.rule.requiredInputs.includes('manual_clinical_review')) {
    return { allowed:false, reason:'manual_review_required', errors:[], rule:result.rule };
  }
  return { allowed:true, reason:'normalized_rule_complete', errors:[], rule:result.rule };
}

module.exports = {
  ALLOWED_METHODS,
  FREQUENCY_MODES,
  DURATION_MODES,
  numberOrNull,
  requiredInputs,
  normalizeRule,
  validateRule,
  publicationDecision,
};
