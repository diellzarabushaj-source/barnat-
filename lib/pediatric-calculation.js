'use strict';

/* Fazat 5, 6 dhe 7 — motori i llogaritjes, shndërrimi në masë administrimi dhe siguria.
 *
 * Xhiron vetëm në server. Shfletuesi dërgon barin dhe matjet e pacientit;
 * numrat e dozimit, përqendrimet, kufijtë dhe njësitë vijnë nga Neon-i.
 *
 * Rregulli kryesor: mjeku nuk shkruan formulë dhe nuk bën konvertime manuale.
 * Motori e normalizon vetë mcg/mg/g, mL dhe aliaset e njësive të ngurta. Kur
 * dy dimensione nuk mund të pajtohen pa hamendësim (p.sh. mmol me mg), motori
 * nuk shpik faktor konvertimi. Një cap i pakonvertueshëm e ndal kalkulimin;
 * një përqendrim i pakonvertueshëm thjesht nuk prodhon mL/tableta, ndërsa doza
 * bazë e verifikuar mbetet e dukshme.
 */

const { STATUS, classify } = require('./pediatric-readiness.js');
const {
  concentrationOf,
  measureFromDose,
  resolveCaps,
  unitDescriptor,
  convertValue,
} = require('./pediatric-units.js');

const OUTCOME = Object.freeze({
  CALCULATED:'CALCULATED',
  NEEDS_PATIENT_DATA:'NEEDS_PATIENT_DATA',
  OUT_OF_RANGE:'OUT_OF_RANGE',
  NOT_CALCULABLE:'NOT_CALCULABLE',
});

const DAYS_PER_DAY_HOURS = 24;
const MIN_PLAUSIBLE_WEIGHT_KG = 0.4;
const MAX_PLAUSIBLE_WEIGHT_KG = 150;
const MIN_PLAUSIBLE_HEIGHT_CM = 20;
const MAX_PLAUSIBLE_HEIGHT_CM = 220;
const MAX_PEDIATRIC_AGE_DAYS = 18 * 365.25;

const AGE_UNIT_DAYS = new Map([
  ['ditë', 1], ['dite', 1], ['javë', 7], ['jave', 7],
  ['muaj', 30.4375], ['vjet', 365.25], ['vjeç', 365.25], ['vit', 365.25],
]);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  if (value !== 0 && Math.abs(value) < 1) return Number(value.toPrecision(3));
  return Number(value.toFixed(digits));
}

function ageInDays(value, unit) {
  const amount = numeric(value);
  if (amount === null || amount < 0) return null;
  const factor = AGE_UNIT_DAYS.get(clean(unit).toLowerCase());
  return factor ? amount * factor : null;
}

function bodySurfaceArea(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  return Math.sqrt((heightCm * weightKg) / 3600);
}

function dosesPerDayOf(row) {
  const declared = positive(row.pediatric_doses_per_day);
  if (declared !== null) return { value:declared, from:'pediatric_doses_per_day' };
  const interval = positive(row.pediatric_interval_hours);
  if (interval !== null) return { value:DAYS_PER_DAY_HOURS / interval, from:'pediatric_interval_hours' };
  return null;
}

function validatePatient(patient, requires) {
  const missing = [];
  const problems = [];

  const weightKg = positive(patient.weightKg);
  const heightCm = positive(patient.heightCm);
  const ageDays = ageInDays(patient.ageValue, patient.ageUnit);

  if (requires.weight && weightKg === null) missing.push('weightKg');
  if (requires.height && heightCm === null) missing.push('heightCm');
  if (requires.age && ageDays === null) missing.push('age');

  if (weightKg !== null && (weightKg < MIN_PLAUSIBLE_WEIGHT_KG || weightKg > MAX_PLAUSIBLE_WEIGHT_KG)) {
    problems.push(`Pesha ${weightKg} kg është jashtë kufijve të besueshëm (${MIN_PLAUSIBLE_WEIGHT_KG}–${MAX_PLAUSIBLE_WEIGHT_KG} kg).`);
  }
  if (heightCm !== null && (heightCm < MIN_PLAUSIBLE_HEIGHT_CM || heightCm > MAX_PLAUSIBLE_HEIGHT_CM)) {
    problems.push(`Gjatësia ${heightCm} cm është jashtë kufijve të besueshëm (${MIN_PLAUSIBLE_HEIGHT_CM}–${MAX_PLAUSIBLE_HEIGHT_CM} cm).`);
  }
  if (ageDays !== null && ageDays > MAX_PEDIATRIC_AGE_DAYS) {
    problems.push('Mosha kalon 18 vjet; skema pediatrike nuk vlen për këtë pacient.');
  }

  return { weightKg, heightCm, ageDays, missing, problems };
}

function checkClinicalRange(row, patient) {
  const blocks = [];

  const minAge = ageInDays(row.pediatric_min_age_value, row.pediatric_min_age_unit);
  const maxAge = ageInDays(row.pediatric_max_age_value, row.pediatric_max_age_unit);
  if (minAge !== null && patient.ageDays !== null && patient.ageDays < minAge) {
    blocks.push(`Mosha është nën minimumin e skemës (${clean(row.pediatric_min_age_value)} ${clean(row.pediatric_min_age_unit)}).`);
  }
  if (maxAge !== null && patient.ageDays !== null && patient.ageDays > maxAge) {
    blocks.push(`Mosha kalon maksimumin e skemës (${clean(row.pediatric_max_age_value)} ${clean(row.pediatric_max_age_unit)}).`);
  }

  const minWeight = positive(row.pediatric_min_weight_kg);
  const maxWeight = positive(row.pediatric_max_weight_kg);
  if (minWeight !== null && patient.weightKg !== null && patient.weightKg < minWeight) {
    blocks.push(`Pesha është nën minimumin e skemës (${minWeight} kg).`);
  }
  if (maxWeight !== null && patient.weightKg !== null && patient.weightKg > maxWeight) {
    blocks.push(`Pesha kalon maksimumin e skemës (${maxWeight} kg).`);
  }

  return { blocks };
}

function basisShape(basis) {
  switch (basis) {
    case 'kg/dozë': return { per:'dose', measure:'weight' };
    case 'kg/ditë': return { per:'day', measure:'weight' };
    case 'm²/dozë': return { per:'dose', measure:'bsa' };
    case 'm²/ditë': return { per:'day', measure:'bsa' };
    case 'dozë fikse': return { per:'dose', measure:'fixed' };
    case 'kg/orë': return { per:'hour', measure:'weight' };
    case 'kg/min': return { per:'minute', measure:'weight' };
    default: return null;
  }
}

function scaleDose(doseValue, shape, scale, perDay) {
  const total = shape.measure === 'fixed' ? doseValue : doseValue * scale;

  if (shape.per === 'dose') {
    return { perDose:total, daily:perDay !== null ? total * perDay : null };
  }
  if (shape.per === 'day') {
    return { perDose:perDay !== null ? total / perDay : null, daily:total };
  }

  const perHour = shape.per === 'minute' ? total * 60 : total;
  return { perDose:null, daily:perHour * DAYS_PER_DAY_HOURS, ratePerHour:perHour };
}

function applyCaps(values, caps, perDay) {
  const applied = [];
  let perDose = values.perDose;
  let daily = values.daily;
  let ratePerHour = values.ratePerHour ?? null;

  if (perDose !== null && caps.maxSingle !== null && perDose > caps.maxSingle) {
    perDose = caps.maxSingle;
    applied.push('maxSingle');
    if (perDay !== null) daily = perDose * perDay;
  }
  if (daily !== null && caps.maxDaily !== null && daily > caps.maxDaily) {
    daily = caps.maxDaily;
    applied.push('maxDaily');
    if (perDay !== null) perDose = perDose === null ? null : Math.min(perDose, caps.maxDaily / perDay);
    if (ratePerHour !== null) ratePerHour = daily / DAYS_PER_DAY_HOURS;
  }
  return { perDose, daily, ratePerHour, applied };
}

function roundedMeasure(result) {
  if (!result?.measure) return null;
  return {
    amount:round(result.measure.amount, result.measure.kind === 'solid' ? 2 : 1),
    unit:result.measure.unit,
    kind:result.measure.kind,
  };
}

/* Backward-compatible helper kept in _test. New callers should pass doseUnit. */
function toMeasure(perDoseValue, concentration, doseUnit) {
  const unit = doseUnit || concentration?.doseUnit || '';
  return roundedMeasure(measureFromDose(perDoseValue, unit, concentration));
}

function uniqueWarnings(items) {
  return [...new Set(items.filter(Boolean))];
}

/**
 * @param {object} row      rreshti i `public.drugs` me fushat `pediatric_*`
 * @param {object} patient  { weightKg, heightCm, ageValue, ageUnit }
 */
function calculate(row = {}, patient = {}) {
  const verdict = classify(row);

  if (verdict.readiness !== STATUS.CALCULATOR_READY) {
    return {
      outcome:OUTCOME.NOT_CALCULABLE,
      readiness:verdict.readiness,
      reasons:verdict.reasons,
      missing:verdict.missing,
      warnings:verdict.warnings,
    };
  }

  const checked = validatePatient(patient, verdict.requires);
  if (checked.missing.length) {
    return {
      outcome:OUTCOME.NEEDS_PATIENT_DATA,
      readiness:verdict.readiness,
      missing:checked.missing,
      requires:verdict.requires,
      warnings:verdict.warnings,
    };
  }
  if (checked.problems.length) {
    return {
      outcome:OUTCOME.OUT_OF_RANGE,
      readiness:verdict.readiness,
      reasons:checked.problems,
      warnings:verdict.warnings,
    };
  }

  const range = checkClinicalRange(row, checked);
  if (range.blocks.length) {
    return {
      outcome:OUTCOME.OUT_OF_RANGE,
      readiness:verdict.readiness,
      reasons:range.blocks,
      warnings:verdict.warnings,
    };
  }

  const basis = clean(row.pediatric_dose_basis);
  const shape = basisShape(basis);
  const doseUnit = clean(row.pediatric_dose_unit);
  const doseMin = numeric(row.pediatric_dose_min);
  const doseMax = numeric(row.pediatric_dose_max);
  const perDayInfo = dosesPerDayOf(row);
  const perDay = perDayInfo ? perDayInfo.value : null;

  const bsa = shape.measure === 'bsa' ? bodySurfaceArea(checked.weightKg, checked.heightCm) : null;
  const scale = shape.measure === 'weight' ? checked.weightKg : (shape.measure === 'bsa' ? bsa : 1);

  /* Caps are normalized automatically into the row's dose unit before any
     comparison. Example: a 4 g/day ceiling becomes 4000 mg/day for an mg row;
     0.5 mg/kg/day becomes weight × 0.5 mg/day. */
  const caps = resolveCaps(row, doseUnit, { weightKg:checked.weightKg });
  if (caps.errors.length) {
    return {
      outcome:OUTCOME.NOT_CALCULABLE,
      readiness:verdict.readiness,
      reasons:caps.errors,
      warnings:verdict.warnings,
    };
  }

  const concentration = concentrationOf(row);
  const lower = applyCaps(scaleDose(doseMin, shape, scale, perDay), caps, perDay);
  const hasRange = doseMax !== null && Math.abs(doseMax - doseMin) > 1e-9;
  const upper = hasRange ? applyCaps(scaleDose(doseMax, shape, scale, perDay), caps, perDay) : lower;

  const lowerMeasure = measureFromDose(lower.perDose, doseUnit, concentration);
  const upperMeasure = hasRange ? measureFromDose(upper.perDose, doseUnit, concentration) : lowerMeasure;
  const cappedBy = [...new Set([...lower.applied, ...upper.applied])];

  const warnings = [...verdict.warnings];
  if (cappedBy.includes('maxSingle')) warnings.push('Doza e vetme u kufizua te maksimumi i regjistruar.');
  if (cappedBy.includes('maxDaily')) warnings.push('Doza ditore u kufizua te maksimumi i regjistruar.');
  if (perDayInfo?.from === 'pediatric_interval_hours' && !Number.isInteger(perDay)) {
    warnings.push('Numri i dozave u nxor nga intervali dhe nuk është numër i plotë; kontrollo skemën e dhënies.');
  }
  if (shape.per === 'hour' || shape.per === 'minute') {
    warnings.push('Skema është infuzion i vazhdueshëm; rezultati është shpejtësi, jo dozë e vetme.');
  }
  if (lowerMeasure.issue) warnings.push(lowerMeasure.issue);
  if (upperMeasure.issue) warnings.push(upperMeasure.issue);

  const steps = [];
  if (shape.measure === 'weight') steps.push({ label:'Pesha', value:checked.weightKg, unit:'kg' });
  if (shape.measure === 'bsa') {
    steps.push({ label:'Pesha', value:checked.weightKg, unit:'kg' });
    steps.push({ label:'Gjatësia', value:checked.heightCm, unit:'cm' });
    steps.push({ label:'Sipërfaqja trupore (Mosteller)', value:round(bsa, 3), unit:'m²' });
  }
  steps.push({
    label:'Skema e regjistruar',
    value:hasRange ? `${doseMin}–${doseMax}` : String(doseMin),
    unit:`${doseUnit}/${basis}`,
  });
  if (perDay !== null) {
    steps.push({ label:'Doza në ditë', value:round(perDay, 2), unit:'', from:perDayInfo.from });
  }
  if (positive(row.pediatric_max_single_value) !== null) {
    steps.push({
      label:'Maks. për dozë',
      value:positive(row.pediatric_max_single_value),
      unit:clean(row.pediatric_max_single_unit),
      normalizedValue:round(caps.maxSingle),
      normalizedUnit:doseUnit,
    });
  }
  if (positive(row.pediatric_max_daily_value) !== null) {
    steps.push({
      label:'Maks. në 24h',
      value:positive(row.pediatric_max_daily_value),
      unit:clean(row.pediatric_max_daily_unit),
      normalizedValue:round(caps.maxDaily),
      normalizedUnit:doseUnit,
    });
  }
  if (concentration) {
    steps.push({
      label:'Përqendrimi',
      value:`${clean(row.pediatric_concentration_value)} ${concentration.doseUnit} / ${clean(row.pediatric_concentration_per_value)} ${concentration.measureUnit}`,
      unit:'',
    });
  }
  if (lowerMeasure.mode === 'direct-volume') {
    steps.push({ label:'Masa e administrimit', value:'Doza është tashmë vëllim; nuk u përdor përqendrimi.', unit:'' });
  } else if (lowerMeasure.mode === 'converted') {
    steps.push({ label:'Konvertimi i njësisë', value:`${doseUnit} → ${concentration.doseUnit} → ${concentration.measureUnit}`, unit:'' });
  }

  const measureMin = roundedMeasure(lowerMeasure);
  const measureMax = roundedMeasure(upperMeasure);

  return {
    outcome:OUTCOME.CALCULATED,
    readiness:verdict.readiness,
    basis,
    doseUnit,
    isRange:hasRange,
    isRate:shape.per === 'hour' || shape.per === 'minute',
    perDose:hasRange
      ? { min:round(lower.perDose), max:round(upper.perDose) }
      : { min:round(lower.perDose), max:round(lower.perDose) },
    daily:hasRange
      ? { min:round(lower.daily), max:round(upper.daily) }
      : { min:round(lower.daily), max:round(lower.daily) },
    ratePerHour:lower.ratePerHour !== null
      ? { min:round(lower.ratePerHour), max:round(upper.ratePerHour) }
      : null,
    dosesPerDay:perDay === null ? null : round(perDay, 2),
    measure:measureMin
      ? { min:measureMin, max:measureMax || measureMin }
      : null,
    bsa:bsa === null ? null : round(bsa, 3),
    cappedBy,
    warnings:uniqueWarnings(warnings),
    unitSafety:{
      capsNormalized:true,
      measureMode:lowerMeasure.mode,
      doseUnitDimension:unitDescriptor(doseUnit)?.dimension || null,
    },
    steps,
    source:{
      url:clean(row.pediatric_source_url),
      section:clean(row.pediatric_source_section),
      verificationStatus:clean(row.pediatric_verification_status),
      verifiedAt:clean(row.pediatric_verified_at),
    },
  };
}

module.exports = {
  OUTCOME,
  calculate,
  _test:{
    round, ageInDays, bodySurfaceArea, concentrationOf, dosesPerDayOf,
    validatePatient, checkClinicalRange, basisShape, scaleDose, applyCaps, toMeasure,
    resolveCaps, measureFromDose, unitDescriptor, convertValue,
    MIN_PLAUSIBLE_WEIGHT_KG, MAX_PLAUSIBLE_WEIGHT_KG,
  },
};
