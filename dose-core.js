(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DRxDoseCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 'drx-dose-core-v1';

  const OUTCOME = Object.freeze({
    CALCULATED:'calculated',
    RANGE:'range',
    DAILY_ONLY:'daily-only',
    NEEDS_INPUT:'needs-input',
    OUT_OF_RANGE:'out-of-range',
    MANUAL_REVIEW:'manual-review',
    INVALID_RULE:'invalid-rule',
  });

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function positive(value) {
    const n = finite(value);
    return n !== null && n > 0 ? n : null;
  }

  function bool(value) {
    return value === true || String(value).toLowerCase() === 'true';
  }

  function decimal(value, digits = 4) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  }

  function valueOf(rule, camel, snake) {
    return rule?.[camel] ?? rule?.[snake];
  }

  function methodOf(rule) {
    return clean(valueOf(rule, 'calculationMethod', 'calculation_method'));
  }

  function requiredInputs(rule = {}) {
    const method = methodOf(rule);
    const inputs = new Set(Array.isArray(rule.requiredInputs)
      ? rule.requiredInputs
      : (Array.isArray(rule.required_inputs) ? rule.required_inputs : []));

    if (['dose_per_kg_per_dose','dose_per_kg_per_day'].includes(method)) inputs.add('weight_kg');
    if (['dose_per_m2_per_dose','dose_per_m2_per_day'].includes(method)) {
      inputs.add('weight_kg');
      inputs.add('height_cm');
    }

    const minAge = finite(valueOf(rule, 'minAgeMonths', 'min_age_months'));
    const maxAge = finite(valueOf(rule, 'maxAgeMonths', 'max_age_months'));
    const minAgeDays = finite(valueOf(rule, 'minAgeDays', 'min_age_days'));
    const maxAgeDays = finite(valueOf(rule, 'maxAgeDays', 'max_age_days'));
    const patientGroup = clean(valueOf(rule, 'patientGroup', 'patient_group'));
    const hasAgeDays = minAgeDays !== null || maxAgeDays !== null;
    if (method === 'age_band_fixed'
        || minAge !== null || maxAge !== null
        || (['adult_only','pediatric_only'].includes(patientGroup) && !hasAgeDays)) inputs.add('age_months');
    if (hasAgeDays) inputs.add('age_days');

    const startDay = finite(valueOf(rule, 'startDay', 'start_day'));
    const endDay = finite(valueOf(rule, 'endDay', 'end_day'));
    if (startDay !== null || endDay !== null) inputs.add('treatment_day');

    if (bool(valueOf(rule, 'conditionReviewRequired', 'condition_review_required'))) inputs.add('clinical_variant');

    const minWeight = finite(valueOf(rule, 'minWeightKg', 'min_weight_kg'));
    const maxWeight = finite(valueOf(rule, 'maxWeightKg', 'max_weight_kg'));
    if (minWeight !== null || maxWeight !== null) inputs.add('weight_kg');

    if (bool(valueOf(rule, 'renalAdjustmentRequired', 'renal_adjustment_required'))) inputs.add('renal_function');
    if (bool(valueOf(rule, 'hepaticAdjustmentRequired', 'hepatic_adjustment_required'))) inputs.add('hepatic_function');
    if (bool(valueOf(rule, 'cardiacAdjustmentRequired', 'cardiac_adjustment_required'))) inputs.add('cardiac_status');
    if (bool(valueOf(rule, 'specialistOnly', 'specialist_only')) || method === 'manual_only') inputs.add('manual_clinical_review');

    return [...inputs];
  }

  function bsaMosteller(weightKg, heightCm) {
    const w = positive(weightKg);
    const h = positive(heightCm);
    if (w === null || h === null) return null;
    return Math.sqrt((w * h) / 3600);
  }

  function patientValue(patient, key) {
    if (key === 'weight_kg') return positive(patient?.weightKg ?? patient?.weight_kg);
    if (key === 'height_cm') return positive(patient?.heightCm ?? patient?.height_cm);
    if (key === 'age_months') {
      const n = finite(patient?.ageMonths ?? patient?.age_months);
      return n !== null && n >= 0 ? n : null;
    }
    if (key === 'age_days') {
      const n = finite(patient?.ageDays ?? patient?.age_days);
      return n !== null && n >= 0 ? n : null;
    }
    if (key === 'treatment_day') {
      const n = finite(patient?.treatmentDay ?? patient?.treatment_day);
      return n !== null && n >= 1 ? n : null;
    }
    if (key === 'clinical_variant') return clean(patient?.clinicalVariant ?? patient?.clinical_variant) || null;
    if (key === 'renal_function') return clean(patient?.renalFunction ?? patient?.renal_function);
    if (key === 'hepatic_function') return clean(patient?.hepaticFunction ?? patient?.hepatic_function);
    if (key === 'cardiac_status') return clean(patient?.cardiacStatus ?? patient?.cardiac_status);
    if (key === 'manual_clinical_review') return patient?.manualClinicalReview === true ? true : null;
    return patient?.[key] ?? null;
  }

  function inputState(rule, patient = {}) {
    const required = requiredInputs(rule);
    const missing = required.filter(key => patientValue(patient, key) === null || patientValue(patient, key) === '');
    return { required, missing };
  }

  function inRange(value, min, max) {
    if (value === null) return true;
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
    return true;
  }

  function eligibility(rule, patient = {}) {
    const state = inputState(rule, patient);
    if (state.missing.length) return { eligible:false, outcome:OUTCOME.NEEDS_INPUT, ...state };

    const age = patientValue(patient, 'age_months');
    const ageDays = patientValue(patient, 'age_days');
    const treatmentDay = patientValue(patient, 'treatment_day');
    const clinicalVariant = patientValue(patient, 'clinical_variant');
    const weight = patientValue(patient, 'weight_kg');
    const minAge = finite(valueOf(rule, 'minAgeMonths', 'min_age_months'));
    const maxAge = finite(valueOf(rule, 'maxAgeMonths', 'max_age_months'));
    const minAgeDays = finite(valueOf(rule, 'minAgeDays', 'min_age_days'));
    const maxAgeDays = finite(valueOf(rule, 'maxAgeDays', 'max_age_days'));
    const minTreatmentDay = finite(valueOf(rule, 'startDay', 'start_day'));
    const maxTreatmentDay = finite(valueOf(rule, 'endDay', 'end_day'));
    const minWeight = finite(valueOf(rule, 'minWeightKg', 'min_weight_kg'));
    const maxWeight = finite(valueOf(rule, 'maxWeightKg', 'max_weight_kg'));
    const conditionReviewRequired = bool(valueOf(rule, 'conditionReviewRequired', 'condition_review_required'));
    const regimenOptionKey = clean(valueOf(rule, 'regimenOptionKey', 'regimen_option_key'));

    const variantMismatch = conditionReviewRequired
      && regimenOptionKey
      && clinicalVariant !== regimenOptionKey;

    if (!inRange(age, minAge, maxAge)
        || !inRange(ageDays, minAgeDays, maxAgeDays)
        || !inRange(treatmentDay, minTreatmentDay, maxTreatmentDay)
        || !inRange(weight, minWeight, maxWeight)
        || variantMismatch) {
      return {
        eligible:false,
        outcome:OUTCOME.OUT_OF_RANGE,
        required:state.required,
        missing:[],
        ageMonths:age,
        ageDays,
        treatmentDay,
        clinicalVariant,
        weightKg:weight,
      };
    }
    return { eligible:true, outcome:null, required:state.required, missing:[] };
  }

  function mgUnit(value) {
    return /^mg(?:\/kg|\/m2|\/m²)?(?:\/day)?$/i.test(clean(value).replace(/\s+/g, ''));
  }

  function range(min, max) {
    const a = finite(min);
    const b = finite(max);
    if (a === null && b === null) return null;
    const low = a ?? b;
    const high = b ?? a;
    if (low > high) return null;
    return { min:low, max:high };
  }

  function applyMgCaps(perDose, daily, rule) {
    const maxSingle = positive(valueOf(rule, 'maxSingleDoseMg', 'max_single_dose_mg'));
    const maxDaily = positive(valueOf(rule, 'maxDailyDoseMg', 'max_daily_dose_mg'));
    const cappedBy = [];

    function capRange(input, cap, code) {
      if (!input || cap === null) return input;
      const next = { min:Math.min(input.min, cap), max:Math.min(input.max, cap) };
      if (input.max > cap) cappedBy.push(code);
      return next;
    }

    return {
      perDose:capRange(perDose, maxSingle, 'max_single_dose_mg'),
      daily:capRange(daily, maxDaily, 'max_daily_dose_mg'),
      cappedBy:[...new Set(cappedBy)],
    };
  }

  function schedule(rule) {
    return {
      frequencyMode:clean(valueOf(rule, 'frequencyMode', 'frequency_mode')),
      intervalMinHours:positive(valueOf(rule, 'intervalMinHours', 'interval_min_hours')),
      intervalMaxHours:positive(valueOf(rule, 'intervalMaxHours', 'interval_max_hours')),
      timesPerDay:positive(valueOf(rule, 'timesPerDay', 'times_per_day')),
      timesPerDayMin:positive(valueOf(rule, 'timesPerDayMin', 'times_per_day_min')),
      timesPerDayMax:positive(valueOf(rule, 'timesPerDayMax', 'times_per_day_max')),
      maxDoses24h:positive(valueOf(rule, 'maxDoses24h', 'max_doses_24h')),
      prn:bool(rule?.prn),
    };
  }

  function productConversion(product = {}, perDoseMg) {
    if (!perDoseMg) return null;
    const numerator = positive(product.numeratorValue ?? product.numerator_value);
    const denominator = positive(product.denominatorValue ?? product.denominator_value);
    const numeratorUnit = clean(product.numeratorUnit ?? product.numerator_unit).toLowerCase();
    const denominatorUnit = clean(product.denominatorUnit ?? product.denominator_unit).toLowerCase();

    if (numerator === null || denominator === null || numeratorUnit !== 'mg') return null;
    if (!['ml','tablet','tablets','capsule','capsules','unit','units'].includes(denominatorUnit)) return null;

    const mgPerMeasure = numerator / denominator;
    if (!Number.isFinite(mgPerMeasure) || mgPerMeasure <= 0) return null;
    return {
      unit:denominatorUnit,
      min:decimal(perDoseMg.min / mgPerMeasure),
      max:decimal(perDoseMg.max / mgPerMeasure),
      exact:true,
    };
  }

  function baseResult(rule, patient, eligibilityResult) {
    return {
      schemaVersion:VERSION,
      ruleKey:clean(valueOf(rule, 'ruleKey', 'rule_key')),
      method:methodOf(rule),
      requiredInputs:eligibilityResult.required || requiredInputs(rule),
      schedule:schedule(rule),
      patient:{
        weightKg:patientValue(patient, 'weight_kg'),
        heightCm:patientValue(patient, 'height_cm'),
        ageMonths:patientValue(patient, 'age_months'),
        ageDays:patientValue(patient, 'age_days'),
        treatmentDay:patientValue(patient, 'treatment_day'),
        clinicalVariant:patientValue(patient, 'clinical_variant'),
      },
    };
  }

  function manualGate(rule, patient, eligible) {
    const required = eligible.required || requiredInputs(rule);
    const manualReasons = [];
    if (required.includes('manual_clinical_review')) manualReasons.push('specialist_or_manual_rule');
    if (required.includes('renal_function')) manualReasons.push('renal_adjustment_requires_explicit_rule');
    if (required.includes('hepatic_function')) manualReasons.push('hepatic_adjustment_requires_explicit_rule');
    if (required.includes('cardiac_status')) manualReasons.push('cardiac_adjustment_requires_explicit_rule');
    if (!manualReasons.length) return null;
    return {
      ...baseResult(rule, patient, eligible),
      outcome:OUTCOME.MANUAL_REVIEW,
      reasons:manualReasons,
    };
  }

  function calculate(rule = {}, patient = {}, product = null) {
    const method = methodOf(rule);
    const allowed = new Set([
      'fixed_dose','fixed_volume',
      'dose_per_kg_per_dose','dose_per_kg_per_day',
      'dose_per_m2_per_dose','dose_per_m2_per_day',
      'age_band_fixed','manual_only',
    ]);
    if (!allowed.has(method)) {
      return {
        schemaVersion:VERSION,
        outcome:OUTCOME.INVALID_RULE,
        ruleKey:clean(valueOf(rule, 'ruleKey', 'rule_key')),
        reason:'calculation_method_unsupported',
      };
    }

    const eligible = eligibility(rule, patient);
    if (!eligible.eligible) {
      return {
        ...baseResult(rule, patient, eligible),
        outcome:eligible.outcome,
        missing:eligible.missing || [],
      };
    }

    const manual = manualGate(rule, patient, eligible);
    if (manual) return manual;

    const values = range(
      valueOf(rule, 'doseMinValue', 'dose_min_value'),
      valueOf(rule, 'doseMaxValue', 'dose_max_value')
    );
    if (!values && method !== 'manual_only') {
      return { ...baseResult(rule, patient, eligible), outcome:OUTCOME.INVALID_RULE, reason:'dose_value_missing' };
    }

    const doseUnit = clean(valueOf(rule, 'doseUnit', 'dose_unit'));
    const sched = schedule(rule);
    let perDose = null;
    let daily = null;
    let calculatedUnit = doseUnit;

    if (method === 'fixed_dose' || method === 'age_band_fixed' || method === 'fixed_volume') {
      const doseBasis = clean(valueOf(rule, 'doseBasis', 'dose_basis')).toLowerCase();
      if (doseBasis === 'per_day') {
        daily = values;
        if (sched.timesPerDay) {
          perDose = { min:daily.min / sched.timesPerDay, max:daily.max / sched.timesPerDay };
        }
      } else {
        perDose = values;
        if (sched.timesPerDay) daily = { min:values.min * sched.timesPerDay, max:values.max * sched.timesPerDay };
      }
    } else if (method === 'dose_per_kg_per_dose') {
      const weight = patientValue(patient, 'weight_kg');
      perDose = { min:values.min * weight, max:values.max * weight };
      daily = sched.timesPerDay
        ? { min:perDose.min * sched.timesPerDay, max:perDose.max * sched.timesPerDay }
        : null;
      calculatedUnit = 'mg';
    } else if (method === 'dose_per_kg_per_day') {
      const weight = patientValue(patient, 'weight_kg');
      daily = { min:values.min * weight, max:values.max * weight };
      if (sched.timesPerDay) perDose = { min:daily.min / sched.timesPerDay, max:daily.max / sched.timesPerDay };
      calculatedUnit = 'mg';
    } else if (method === 'dose_per_m2_per_dose') {
      const bsa = bsaMosteller(patientValue(patient, 'weight_kg'), patientValue(patient, 'height_cm'));
      perDose = { min:values.min * bsa, max:values.max * bsa };
      daily = sched.timesPerDay
        ? { min:perDose.min * sched.timesPerDay, max:perDose.max * sched.timesPerDay }
        : null;
      calculatedUnit = 'mg';
    } else if (method === 'dose_per_m2_per_day') {
      const bsa = bsaMosteller(patientValue(patient, 'weight_kg'), patientValue(patient, 'height_cm'));
      daily = { min:values.min * bsa, max:values.max * bsa };
      if (sched.timesPerDay) perDose = { min:daily.min / sched.timesPerDay, max:daily.max / sched.timesPerDay };
      calculatedUnit = 'mg';
    }

    let capped = { perDose, daily, cappedBy:[] };
    if (calculatedUnit === 'mg' || mgUnit(doseUnit)) {
      capped = applyMgCaps(perDose, daily, rule);
      const maxDaily = positive(valueOf(rule, 'maxDailyDoseMg', 'max_daily_dose_mg'));
      const maxDoses = sched.maxDoses24h;
      if (capped.perDose && maxDaily !== null && maxDoses !== null && maxDoses > 0) {
        const safePerDoseCap = maxDaily / maxDoses;
        if (capped.perDose.max > safePerDoseCap) {
          capped.perDose = {
            min:Math.min(capped.perDose.min, safePerDoseCap),
            max:Math.min(capped.perDose.max, safePerDoseCap),
          };
          capped.cappedBy = [...new Set([...capped.cappedBy, 'max_daily_dose_mg_via_max_doses_24h'])];
        }
      }
    }

    const resultRange = capped.perDose && Math.abs(capped.perDose.max - capped.perDose.min) > 1e-12;
    const outcome = capped.perDose
      ? (resultRange ? OUTCOME.RANGE : OUTCOME.CALCULATED)
      : (capped.daily ? OUTCOME.DAILY_ONLY : OUTCOME.INVALID_RULE);

    return {
      ...baseResult(rule, patient, eligible),
      outcome,
      doseUnit:calculatedUnit,
      perDose:capped.perDose ? { min:decimal(capped.perDose.min), max:decimal(capped.perDose.max) } : null,
      daily:capped.daily ? { min:decimal(capped.daily.min), max:decimal(capped.daily.max) } : null,
      bsaM2:method.includes('per_m2')
        ? decimal(bsaMosteller(patientValue(patient, 'weight_kg'), patientValue(patient, 'height_cm')))
        : null,
      practicalMeasure:calculatedUnit === 'mg' && capped.perDose && product
        ? productConversion(product, capped.perDose)
        : null,
      cappedBy:capped.cappedBy,
    };
  }

  return {
    VERSION,
    OUTCOME,
    requiredInputs,
    bsaMosteller,
    eligibility,
    productConversion,
    calculate,
    _test:{ clean, finite, positive, decimal, schedule, range, applyMgCaps, mgUnit },
  };
});
