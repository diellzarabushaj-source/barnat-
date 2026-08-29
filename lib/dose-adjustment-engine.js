'use strict';

const ALLOWED_MEASURES = new Set([
  'CrCl_mL_min',
  'eGFR_mL_min_1_73m2',
  'dialysis_status',
  'Child_Pugh_class',
  'hepatic_impairment_textual',
]);

const ALLOWED_ACTIONS = new Set([
  'no_adjustment',
  'reduce_dose',
  'extend_interval',
  'avoid',
  'contraindicated',
  'specialist_review',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMeasure(value) {
  const raw = clean(value);
  const map = {
    crcl:'CrCl_mL_min',
    crcl_ml_min:'CrCl_mL_min',
    egfr:'eGFR_mL_min_1_73m2',
    egfr_ml_min_1_73m2:'eGFR_mL_min_1_73m2',
    dialysis:'dialysis_status',
    dialysis_status:'dialysis_status',
    child_pugh:'Child_Pugh_class',
    child_pugh_class:'Child_Pugh_class',
    hepatic_impairment_textual:'hepatic_impairment_textual',
  };
  return map[raw.toLowerCase()] || raw;
}

function patientMeasure(patient = {}, measureType) {
  const type = normalizeMeasure(measureType);
  if (type === 'CrCl_mL_min') return finite(patient.crClMlMin ?? patient.crcl_ml_min ?? patient.crcl);
  if (type === 'eGFR_mL_min_1_73m2') return finite(patient.eGfrMlMin173m2 ?? patient.egfr_ml_min_1_73m2 ?? patient.egfr);
  if (type === 'dialysis_status') return clean(patient.dialysisStatus ?? patient.dialysis_status).toLowerCase() || null;
  if (type === 'Child_Pugh_class') return clean(patient.childPughClass ?? patient.child_pugh_class).toUpperCase() || null;
  if (type === 'hepatic_impairment_textual') return clean(patient.hepaticImpairment ?? patient.hepatic_impairment_textual).toLowerCase() || null;
  return null;
}

function numericMatch(value, row = {}) {
  if (value === null) return false;
  const min = finite(row.minValue ?? row.min_value);
  const max = finite(row.maxValue ?? row.max_value);
  const minInclusive = row.minInclusive ?? row.min_inclusive ?? true;
  const maxInclusive = row.maxInclusive ?? row.max_inclusive ?? true;
  if (min !== null && (minInclusive ? value < min : value <= min)) return false;
  if (max !== null && (maxInclusive ? value > max : value >= max)) return false;
  return true;
}

function categoricalMatch(value, row = {}) {
  if (value === null) return false;
  const accepted = row.acceptedValues ?? row.accepted_values ?? row.severityOrClass ?? row.severity_or_class;
  const values = Array.isArray(accepted) ? accepted : [accepted].filter(x => x !== null && x !== undefined && x !== '');
  if (!values.length) return false;
  const normalized = String(value).toLowerCase();
  return values.some(x => String(x).trim().toLowerCase() === normalized);
}

function rowMatches(row = {}, patient = {}) {
  const measureType = normalizeMeasure(row.measureType ?? row.measure_type);
  if (!ALLOWED_MEASURES.has(measureType)) return false;
  const value = patientMeasure(patient, measureType);
  if (['CrCl_mL_min','eGFR_mL_min_1_73m2'].includes(measureType)) return numericMatch(value, row);
  return categoricalMatch(value, row);
}

function validateAdjustmentRow(row = {}) {
  const errors = [];
  const measureType = normalizeMeasure(row.measureType ?? row.measure_type);
  const doseAction = clean(row.doseAction ?? row.dose_action);
  const sourceKey = clean(row.sourceKey ?? row.source_key);
  const sourceSection = clean(row.sourceSection ?? row.source_section || '4.2');
  const sourceSnapshotId = clean(row.sourceSnapshotId ?? row.source_snapshot_id);
  const sourceEvidenceHash = clean(row.sourceEvidenceHash ?? row.source_evidence_hash);
  const reviewStatus = clean(row.reviewStatus ?? row.review_status).toLowerCase();

  if (!ALLOWED_MEASURES.has(measureType)) errors.push('measure_type_invalid');
  if (!ALLOWED_ACTIONS.has(doseAction)) errors.push('dose_action_invalid');
  if (!sourceKey) errors.push('source_key_missing');
  if (sourceSection !== '4.2') errors.push('source_section_must_be_4_2');
  if (!sourceSnapshotId) errors.push('source_snapshot_missing');
  if (!/^[0-9a-f]{64}$/i.test(sourceEvidenceHash)) errors.push('source_evidence_hash_missing_or_invalid');
  if (!['verified','approved'].includes(reviewStatus)) errors.push('review_status_not_verified');

  if (['CrCl_mL_min','eGFR_mL_min_1_73m2'].includes(measureType)) {
    const min = finite(row.minValue ?? row.min_value);
    const max = finite(row.maxValue ?? row.max_value);
    if (min === null && max === null) errors.push('numeric_threshold_missing');
    if (min !== null && max !== null && min > max) errors.push('numeric_threshold_inverted');
  } else {
    const accepted = row.acceptedValues ?? row.accepted_values ?? row.severityOrClass ?? row.severity_or_class;
    if ((Array.isArray(accepted) && accepted.length === 0) || (!Array.isArray(accepted) && clean(accepted) === '')) {
      errors.push('categorical_threshold_missing');
    }
  }

  if (doseAction === 'reduce_dose') {
    const factor = finite(row.doseFactor ?? row.dose_factor);
    const replacementMin = finite(row.replacementDoseMin ?? row.replacement_dose_min);
    const replacementMax = finite(row.replacementDoseMax ?? row.replacement_dose_max);
    if ((factor === null || factor <= 0 || factor >= 1) && replacementMin === null && replacementMax === null) {
      errors.push('dose_reduction_value_missing');
    }
  }

  if (doseAction === 'extend_interval') {
    const minHours = finite(row.intervalMinHours ?? row.interval_min_hours);
    const maxHours = finite(row.intervalMaxHours ?? row.interval_max_hours);
    if (minHours === null && maxHours === null) errors.push('extended_interval_missing');
  }

  return {
    valid:errors.length === 0,
    errors,
    normalized:{
      ...row,
      measureType,
      doseAction,
      sourceKey,
      sourceSection,
      sourceSnapshotId,
      sourceEvidenceHash,
      reviewStatus,
    },
  };
}

function selectAdjustment(rows, patient = {}, options = {}) {
  const validated = [];
  const invalid = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const result = validateAdjustmentRow(row);
    if (!result.valid) {
      invalid.push({ row, errors:result.errors });
      continue;
    }
    validated.push(result.normalized);
  }

  if (invalid.length && options.failOnInvalid !== false) {
    return { status:'blocked', reason:'invalid_adjustment_rows', invalid, matches:[] };
  }

  const matches = validated.filter(row => rowMatches(row, patient));
  if (matches.length === 0) return { status:'no_match', reason:'no_exact_adjustment_match', invalid, matches:[] };
  if (matches.length > 1) return { status:'blocked', reason:'multiple_adjustment_matches', invalid, matches };

  const adjustment = matches[0];
  if (['avoid','contraindicated','specialist_review'].includes(adjustment.doseAction)) {
    return { status:'blocked', reason:adjustment.doseAction, invalid, matches, adjustment };
  }
  return { status:'matched', reason:adjustment.doseAction, invalid, matches, adjustment };
}

function applyAdjustment(rule = {}, selection = {}) {
  if (selection.status !== 'matched' || !selection.adjustment) {
    return { status:'blocked', reason:selection.reason || 'adjustment_not_matched', rule:null };
  }

  const a = selection.adjustment;
  const next = { ...rule };
  if (a.doseAction === 'no_adjustment') return { status:'applied', reason:'no_adjustment', rule:next, adjustment:a };

  if (a.doseAction === 'reduce_dose') {
    const factor = finite(a.doseFactor ?? a.dose_factor);
    const replacementMin = finite(a.replacementDoseMin ?? a.replacement_dose_min);
    const replacementMax = finite(a.replacementDoseMax ?? a.replacement_dose_max);
    const currentMin = finite(next.doseMinValue ?? next.dose_min_value);
    const currentMax = finite(next.doseMaxValue ?? next.dose_max_value);

    const min = replacementMin ?? (factor !== null && currentMin !== null ? currentMin * factor : null);
    const max = replacementMax ?? (factor !== null && currentMax !== null ? currentMax * factor : null);
    if (min === null && max === null) return { status:'blocked', reason:'dose_reduction_not_computable', rule:null };

    next.doseMinValue = min ?? max;
    next.doseMaxValue = max ?? min;
  }

  if (a.doseAction === 'extend_interval') {
    const minHours = finite(a.intervalMinHours ?? a.interval_min_hours);
    const maxHours = finite(a.intervalMaxHours ?? a.interval_max_hours);
    next.frequencyMode = 'interval';
    next.intervalMinHours = minHours ?? maxHours;
    next.intervalMaxHours = maxHours ?? minHours;
    next.timesPerDay = null;
  }

  return {
    status:'applied',
    reason:a.doseAction,
    rule:next,
    adjustment:a,
  };
}

module.exports = {
  ALLOWED_MEASURES,
  ALLOWED_ACTIONS,
  normalizeMeasure,
  patientMeasure,
  rowMatches,
  validateAdjustmentRow,
  selectAdjustment,
  applyAdjustment,
  _test:{ clean, finite, numericMatch, categoricalMatch },
};
