(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dose-core.js'));
  } else {
    root.DRxDoseRuntime = factory(root.DRxDoseCore);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  const VERSION = 'drx-dose-runtime-browser-v1';
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
    'max_daily_cap',
  ]);

  const clean = value => String(value ?? '').trim();
  const finite = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const bool = value => value === true || String(value ?? '').toLowerCase() === 'true';

  function normalizeMeasure(value) {
    const raw = clean(value);
    const aliases = {
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
    return aliases[raw.toLowerCase()] || raw;
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

  function categoricalValues(row = {}) {
    const accepted = row.acceptedValues ?? row.accepted_values ?? row.severityOrClass ?? row.severity_or_class;
    return (Array.isArray(accepted) ? accepted : [accepted])
      .map(clean)
      .filter(Boolean);
  }

  function categoricalMatch(value, row = {}) {
    if (value === null) return false;
    const normalized = clean(value).toLowerCase();
    return categoricalValues(row).some(item => item.toLowerCase() === normalized);
  }

  function sourceValid(source = {}) {
    const snapshot = clean(source.snapshotId ?? source.snapshot_id);
    const sectionHash = clean(source.sectionSha256 ?? source.section_sha256);
    const evidenceHash = clean(source.evidenceHash ?? source.evidence_hash);
    return /^[0-9a-f]{64}$/i.test(snapshot)
      && /^[0-9a-f]{64}$/i.test(sectionHash)
      && /^[0-9a-f]{64}$/i.test(evidenceHash)
      && snapshot.toLowerCase() === evidenceHash.toLowerCase()
      && clean(source.section) === '4.2'
      && Boolean(source.documentVersion || source.documentDate || source.document_version || source.document_date)
      && source.official === true;
  }

  function validateAdjustment(row = {}) {
    const errors = [];
    const measureType = normalizeMeasure(row.measureType ?? row.measure_type);
    const doseAction = clean(row.doseAction ?? row.dose_action);
    const reviewStatus = clean(row.reviewStatus ?? row.review_status).toLowerCase();
    const verifiedBy = clean(row.verifiedBy ?? row.verified_by);
    const verifiedAt = clean(row.verifiedAt ?? row.verified_at);
    if (!ALLOWED_MEASURES.has(measureType)) errors.push('measure_type_invalid');
    if (!ALLOWED_ACTIONS.has(doseAction)) errors.push('dose_action_invalid');
    if (!sourceValid(row.source || {})) errors.push('source_provenance_invalid');
    if (!['verified','approved'].includes(reviewStatus)) errors.push('review_status_not_verified');
    if (!verifiedBy) errors.push('verified_by_missing');
    if (!verifiedAt) errors.push('verified_at_missing');

    if (['CrCl_mL_min','eGFR_mL_min_1_73m2'].includes(measureType)) {
      const min = finite(row.minValue ?? row.min_value);
      const max = finite(row.maxValue ?? row.max_value);
      if (min === null && max === null) errors.push('numeric_threshold_missing');
      if (min !== null && max !== null && min > max) errors.push('numeric_threshold_inverted');
    } else if (!categoricalValues(row).length) {
      errors.push('categorical_threshold_missing');
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
    if (doseAction === 'max_daily_cap') {
      const cap = finite(row.maxDailyDoseMg ?? row.max_daily_dose_mg);
      if (cap === null || cap <= 0) errors.push('max_daily_cap_missing_or_invalid');
    }

    return {
      valid:errors.length === 0,
      errors,
      normalized:{ ...row, measureType, doseAction, reviewStatus, verifiedBy, verifiedAt },
    };
  }

  function rowMatches(row = {}, patient = {}) {
    const type = normalizeMeasure(row.measureType ?? row.measure_type);
    const value = patientMeasure(patient, type);
    if (['CrCl_mL_min','eGFR_mL_min_1_73m2'].includes(type)) return numericMatch(value, row);
    if (ALLOWED_MEASURES.has(type)) return categoricalMatch(value, row);
    return false;
  }

  function selectAdjustment(rows, patient = {}) {
    const valid = [];
    const invalid = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const checked = validateAdjustment(row);
      if (!checked.valid) invalid.push({ row, errors:checked.errors });
      else valid.push(checked.normalized);
    }
    if (invalid.length) return { status:'blocked', reason:'invalid_adjustment_rows', invalid, matches:[] };
    const matches = valid.filter(row => rowMatches(row, patient));
    if (!matches.length) return { status:'no_match', reason:'no_exact_adjustment_match', matches:[] };
    if (matches.length > 1) return { status:'blocked', reason:'multiple_adjustment_matches', matches };
    const adjustment = matches[0];
    if (['avoid','contraindicated','specialist_review'].includes(adjustment.doseAction)) {
      return { status:'blocked', reason:adjustment.doseAction, matches, adjustment };
    }
    return { status:'matched', reason:adjustment.doseAction, matches, adjustment };
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

    if (a.doseAction === 'max_daily_cap') {
      const cap = finite(a.maxDailyDoseMg ?? a.max_daily_dose_mg);
      if (cap === null || cap <= 0) return { status:'blocked', reason:'max_daily_cap_invalid', rule:null };
      const current = finite(next.maxDailyDoseMg ?? next.max_daily_dose_mg);
      next.maxDailyDoseMg = current !== null && current > 0 ? Math.min(current, cap) : cap;
    }

    return { status:'applied', reason:a.doseAction, rule:next, adjustment:a };
  }

  function adjustmentRows(rule, domain) {
    const rows = domain === 'renal'
      ? (rule.renalAdjustments ?? rule.renal_adjustments)
      : (rule.hepaticAdjustments ?? rule.hepatic_adjustments);
    return Array.isArray(rows) ? rows : [];
  }

  function adjustmentRequired(rule, domain) {
    return domain === 'renal'
      ? bool(rule.renalAdjustmentRequired ?? rule.renal_adjustment_required)
      : bool(rule.hepaticAdjustmentRequired ?? rule.hepatic_adjustment_required);
  }

  function selectDomain(rule, patient, domain) {
    const required = adjustmentRequired(rule, domain);
    const rows = adjustmentRows(rule, domain);
    if (!required) return { domain, required:false, status:'not-required', action:'none', rows:0 };
    if (!rows.length) return { domain, required:true, status:'blocked', reason:domain + '_adjustment_evidence_missing', action:'none', rows:0 };

    const measures = [...new Set(rows.map(row => normalizeMeasure(row.measureType ?? row.measure_type)).filter(Boolean))];
    const available = measures.filter(measure => {
      const value = patientMeasure(patient, measure);
      return value !== null && value !== '';
    });
    if (measures.length && !available.length) {
      return {
        domain, required:true, status:'needs-input',
        reason:domain + '_structured_input_missing',
        action:'none', rows:rows.length, requiredMeasures:measures,
      };
    }

    const selection = selectAdjustment(rows, patient);
    if (selection.status === 'matched') {
      return {
        domain, required:true, status:'matched', reason:selection.reason,
        action:selection.adjustment?.doseAction || 'none',
        rows:rows.length, requiredMeasures:measures, selection,
      };
    }
    return {
      domain, required:true,
      status:selection.status === 'no_match' ? 'blocked' : selection.status,
      reason:selection.reason || (domain + '_adjustment_not_resolved'),
      action:selection.adjustment?.doseAction || 'none',
      rows:rows.length, requiredMeasures:measures, selection,
    };
  }

  function clearAdjustmentFlag(rule, domain) {
    const next = { ...rule };
    const removeKey = domain === 'renal' ? 'renal_function' : 'hepatic_function';
    if (domain === 'renal') {
      next.renalAdjustmentRequired = false;
      next.renal_adjustment_required = false;
    } else {
      next.hepaticAdjustmentRequired = false;
      next.hepatic_adjustment_required = false;
    }
    for (const key of ['requiredInputs','required_inputs']) {
      if (Array.isArray(next[key])) next[key] = next[key].filter(item => clean(item) !== removeKey);
    }
    return next;
  }

  function changingAction(action) {
    return ['reduce_dose','extend_interval'].includes(clean(action));
  }

  function calculate(rule = {}, patient = {}, product = null) {
    if (!Core?.calculate || !Core?.OUTCOME) {
      return { schemaVersion:VERSION, outcome:'invalid-rule', reason:'dose_core_unavailable' };
    }

    const renal = selectDomain(rule, patient, 'renal');
    const hepatic = selectDomain(rule, patient, 'hepatic');
    const selections = [renal, hepatic];
    const needsInput = selections.filter(item => item.status === 'needs-input');
    if (needsInput.length) {
      return {
        schemaVersion:VERSION,
        outcome:Core.OUTCOME.NEEDS_INPUT,
        ruleKey:clean(rule.ruleKey ?? rule.rule_key),
        missing:[...new Set(needsInput.flatMap(item => item.requiredMeasures || []))],
        adjustmentSelections:selections,
        reason:'structured_adjustment_input_required',
      };
    }

    const blocked = selections.filter(item => item.status === 'blocked');
    if (blocked.length) {
      return {
        schemaVersion:VERSION,
        outcome:Core.OUTCOME.MANUAL_REVIEW,
        ruleKey:clean(rule.ruleKey ?? rule.rule_key),
        reasons:blocked.map(item => item.reason),
        adjustmentSelections:selections,
      };
    }

    const doseChanging = selections.filter(item => item.status === 'matched' && changingAction(item.action));
    if (doseChanging.length > 1) {
      return {
        schemaVersion:VERSION,
        outcome:Core.OUTCOME.MANUAL_REVIEW,
        ruleKey:clean(rule.ruleKey ?? rule.rule_key),
        reasons:['multiple_dose_changing_adjustments_require_manual_review'],
        adjustmentSelections:selections,
      };
    }

    let adjustedRule = { ...rule };
    const appliedAdjustments = [];
    for (const selected of selections) {
      if (selected.status !== 'matched') continue;
      const applied = applyAdjustment(adjustedRule, selected.selection);
      if (applied.status !== 'applied') {
        return {
          schemaVersion:VERSION,
          outcome:Core.OUTCOME.MANUAL_REVIEW,
          ruleKey:clean(rule.ruleKey ?? rule.rule_key),
          reasons:[applied.reason || 'adjustment_application_failed'],
          adjustmentSelections:selections,
        };
      }
      adjustedRule = clearAdjustmentFlag(applied.rule, selected.domain);
      appliedAdjustments.push({
        domain:selected.domain,
        action:selected.action,
        adjustment:selected.selection.adjustment,
      });
    }

    const result = Core.calculate(adjustedRule, patient, product);
    return {
      ...result,
      schemaVersion:VERSION,
      coreSchemaVersion:Core.VERSION,
      originalRuleKey:clean(rule.ruleKey ?? rule.rule_key),
      adjustedRule,
      adjustmentSelections:selections,
      appliedAdjustments,
    };
  }

  function requiredMeasureTypes(rule = {}) {
    return [...new Set([
      ...adjustmentRows(rule, 'renal'),
      ...adjustmentRows(rule, 'hepatic'),
    ].map(row => normalizeMeasure(row.measureType ?? row.measure_type)).filter(Boolean))];
  }

  return Object.freeze({
    VERSION,
    ALLOWED_MEASURES,
    ALLOWED_ACTIONS,
    normalizeMeasure,
    patientMeasure,
    validateAdjustment,
    selectAdjustment,
    applyAdjustment,
    requiredMeasureTypes,
    calculate,
    _test:Object.freeze({ clean, finite, bool, numericMatch, categoricalValues, categoricalMatch, sourceValid, rowMatches, selectDomain, changingAction }),
  });
});
