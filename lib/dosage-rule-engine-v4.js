'use strict';

/*
 * DRX Dosage Rule Engine v4
 *
 * Rule-resolution flow adapted from the MIT-licensed DOSAGE antibiotic dose
 * validator by Ferdous Wahid Anik. The upstream clinical dataset is NOT copied.
 * DRX remains authoritative for clinical values, source provenance and review.
 * See third_party/DOSAGE-antibiotic-dose-validator-LICENSE.txt.
 *
 * This module deliberately contains no drug-specific dose numbers and never
 * evaluates formulas supplied by the browser. It validates a server-resolved
 * rule and delegates arithmetic to a server-owned calculator callback.
 */

const OUTCOME = Object.freeze({
  CALCULATED:'CALCULATED',
  NEEDS_PATIENT_DATA:'NEEDS_PATIENT_DATA',
  OUT_OF_RANGE:'OUT_OF_RANGE',
  NOT_CALCULABLE:'NOT_CALCULABLE',
  CONTRAINDICATED:'CONTRAINDICATED',
  REQUIRES_CLINICAL_REVIEW:'REQUIRES_CLINICAL_REVIEW',
  SOURCE_NOT_VERIFIED:'SOURCE_NOT_VERIFIED',
});

const VERIFIED_SOURCE_STATES = new Set([
  'verified', 'clinically_verified', 'published', 'calculable_verified', 'text_verified',
]);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLocaleLowerCase('sq');

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeRoute(value) {
  const route = lower(value).replace(/[.]/g, '');
  const aliases = new Map([
    ['po','oral'], ['per os','oral'], ['nga goja','oral'],
    ['iv','iv'], ['intravenoz','iv'], ['intravenous','iv'],
    ['im','im'], ['intramuskular','im'], ['intramuscular','im'],
    ['sc','sc'], ['subkutan','sc'], ['subcutaneous','sc'],
    ['pr','rectal'], ['rektal','rectal'], ['rectal','rectal'],
    ['inh','inhalation'], ['inhalim','inhalation'], ['inhalation','inhalation'],
  ]);
  return aliases.get(route) || route;
}

function normalizeAgeDays(value, unit) {
  const amount = numberOrNull(value);
  if (amount === null || amount < 0) return null;
  const key = lower(unit).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const factors = new Map([
    ['d',1], ['day',1], ['days',1], ['dite',1],
    ['w',7], ['week',7], ['weeks',7], ['jave',7],
    ['m',30.4375], ['month',30.4375], ['months',30.4375], ['muaj',30.4375],
    ['y',365.25], ['year',365.25], ['years',365.25], ['vjet',365.25], ['vjec',365.25],
  ]);
  const factor = factors.get(key);
  return factor ? amount * factor : null;
}

function requiredInputs(rule = {}) {
  const requires = rule.requires && typeof rule.requires === 'object' ? rule.requires : {};
  return {
    weight:requires.weight === true,
    age:requires.age === true,
    height:requires.height === true,
    renal:requires.renal === true,
    route:requires.route === true,
    indication:requires.indication === true,
    pregnancy:requires.pregnancy === true,
  };
}

function validateRequired(rule = {}, patient = {}, context = {}) {
  const requires = requiredInputs(rule);
  const missing = [];
  if (requires.weight && positiveOrNull(patient.weightKg) === null) missing.push('weightKg');
  if (requires.height && positiveOrNull(patient.heightCm) === null) missing.push('heightCm');
  if (requires.age && normalizeAgeDays(patient.ageValue, patient.ageUnit) === null) missing.push('age');
  if (requires.renal && numberOrNull(patient.crclMlMin ?? patient.egfrMlMin) === null) missing.push('renalFunction');
  if (requires.route && !clean(context.route ?? patient.route)) missing.push('route');
  if (requires.indication && !clean(context.indicationId ?? context.indication)) missing.push('indication');
  if (requires.pregnancy && patient.pregnant === undefined && patient.pregnant === null) missing.push('pregnancy');
  return { requires, missing };
}

function checkSource(rule = {}) {
  const status = lower(rule.verificationStatus ?? rule.sourceVerificationStatus ?? rule.calculationStatus);
  const hasSource = Boolean(clean(rule.sourceUrl ?? rule.sourceKey ?? rule.sourceSection));
  if (!hasSource) return { ok:false, reason:'Regjimi nuk ka burim të lidhur.' };
  if (!VERIFIED_SOURCE_STATES.has(status)) {
    return { ok:false, reason:`Regjimi nuk është i verifikuar për kalkulim (${status || 'pa status'}).` };
  }
  return { ok:true };
}

function checkIdentity(rule = {}, context = {}) {
  const expected = clean(rule.regimenId ?? rule.sourceKey);
  const received = clean(context.regimenId);
  if (expected && received && expected !== received) {
    return { ok:false, reason:'Regjimi i kërkuar nuk përputhet me regjimin e lidhur në server.' };
  }
  const expectedDrug = clean(rule.drugId);
  const receivedDrug = clean(context.drugId);
  if (expectedDrug && receivedDrug && expectedDrug !== receivedDrug) {
    return { ok:false, reason:'Bari i kërkuar nuk përputhet me rregullin e dozimit.' };
  }
  return { ok:true };
}

function checkRoute(rule = {}, context = {}, patient = {}) {
  const allowed = (Array.isArray(rule.routes) ? rule.routes : [rule.route])
    .flatMap(item => clean(item).split(/[;,/]/))
    .map(normalizeRoute)
    .filter(Boolean);
  const requested = normalizeRoute(context.route ?? patient.route);
  if (!allowed.length || !requested) return { ok:true };
  if (!allowed.includes(requested)) {
    return { ok:false, reason:`Rruga ${clean(context.route ?? patient.route)} nuk lejohet për këtë regjim.`, allowedRoutes:unique(allowed) };
  }
  return { ok:true, allowedRoutes:unique(allowed) };
}

function checkAgeWeight(rule = {}, patient = {}) {
  const reasons = [];
  const ageDays = normalizeAgeDays(patient.ageValue, patient.ageUnit);
  const weightKg = positiveOrNull(patient.weightKg);
  const minAgeDays = normalizeAgeDays(rule.minAgeValue, rule.minAgeUnit);
  const maxAgeDays = normalizeAgeDays(rule.maxAgeValue, rule.maxAgeUnit);
  const minWeightKg = positiveOrNull(rule.minWeightKg);
  const maxWeightKg = positiveOrNull(rule.maxWeightKg);

  if (ageDays !== null && minAgeDays !== null && ageDays < minAgeDays) reasons.push('Mosha është nën minimumin e regjimit.');
  if (ageDays !== null && maxAgeDays !== null && ageDays > maxAgeDays) reasons.push('Mosha kalon maksimumin e regjimit.');
  if (weightKg !== null && minWeightKg !== null && weightKg < minWeightKg) reasons.push(`Pesha është nën minimumin ${minWeightKg} kg.`);
  if (weightKg !== null && maxWeightKg !== null && weightKg > maxWeightKg) reasons.push(`Pesha kalon maksimumin ${maxWeightKg} kg.`);
  return { ok:reasons.length === 0, reasons, ageDays, weightKg };
}

function checkRenal(rule = {}, patient = {}) {
  const renal = rule.renal && typeof rule.renal === 'object' ? rule.renal : null;
  if (!renal) return { ok:true, adjustment:null };
  const value = numberOrNull(patient.crclMlMin ?? patient.egfrMlMin);
  if (value === null) return { ok:false, missing:true, reason:'Kërkohet funksioni renal për këtë regjim.' };

  const rows = Array.isArray(renal.ranges) ? renal.ranges : [];
  const match = rows.find(item => {
    const min = numberOrNull(item.min);
    const max = numberOrNull(item.max);
    return (min === null || value >= min) && (max === null || value <= max);
  });
  if (!match) return { ok:false, reason:'Funksioni renal është jashtë intervaleve e verifikuara të regjimit.' };
  if (match.contraindicated === true || lower(match.action) === 'contraindicated') {
    return { ok:false, contraindicated:true, reason:clean(match.reason) || 'Regjimi është i kundërindikuar për këtë funksion renal.' };
  }
  return { ok:true, adjustment:match };
}

function checkPregnancy(rule = {}, patient = {}) {
  if (patient.pregnant !== true) return { ok:true };
  const pregnancy = rule.pregnancy && typeof rule.pregnancy === 'object' ? rule.pregnancy : null;
  if (!pregnancy) return { ok:true };
  if (pregnancy.contraindicated === true) {
    return { ok:false, contraindicated:true, reason:clean(pregnancy.reason) || 'Regjimi është i kundërindikuar në shtatzëni.' };
  }
  if (pregnancy.requiresReview === true) {
    return { ok:false, review:true, reason:clean(pregnancy.reason) || 'Kërkohet rishikim klinik për përdorim në shtatzëni.' };
  }
  return { ok:true };
}

async function evaluate({ rule = {}, patient = {}, context = {}, calculate } = {}) {
  const source = checkSource(rule);
  if (!source.ok) return { outcome:OUTCOME.SOURCE_NOT_VERIFIED, reasons:[source.reason] };

  const identity = checkIdentity(rule, context);
  if (!identity.ok) return { outcome:OUTCOME.NOT_CALCULABLE, reasons:[identity.reason] };

  const required = validateRequired(rule, patient, context);
  if (required.missing.length) {
    return { outcome:OUTCOME.NEEDS_PATIENT_DATA, missing:required.missing, requires:required.requires };
  }

  const route = checkRoute(rule, context, patient);
  if (!route.ok) return { outcome:OUTCOME.OUT_OF_RANGE, reasons:[route.reason], allowedRoutes:route.allowedRoutes };

  const range = checkAgeWeight(rule, patient);
  if (!range.ok) return { outcome:OUTCOME.OUT_OF_RANGE, reasons:range.reasons };

  const renal = checkRenal(rule, patient);
  if (!renal.ok) {
    if (renal.missing) return { outcome:OUTCOME.NEEDS_PATIENT_DATA, missing:['renalFunction'], reasons:[renal.reason] };
    if (renal.contraindicated) return { outcome:OUTCOME.CONTRAINDICATED, reasons:[renal.reason] };
    return { outcome:OUTCOME.OUT_OF_RANGE, reasons:[renal.reason] };
  }

  const pregnancy = checkPregnancy(rule, patient);
  if (!pregnancy.ok) {
    return {
      outcome:pregnancy.contraindicated ? OUTCOME.CONTRAINDICATED : OUTCOME.REQUIRES_CLINICAL_REVIEW,
      reasons:[pregnancy.reason],
    };
  }

  if (typeof calculate !== 'function') {
    return { outcome:OUTCOME.NOT_CALCULABLE, reasons:['Nuk është lidhur kalkulatori server-side për këtë regjim.'] };
  }

  const calculation = await calculate({ rule, patient, context, renalAdjustment:renal.adjustment });
  if (!calculation || typeof calculation !== 'object') {
    return { outcome:OUTCOME.NOT_CALCULABLE, reasons:['Kalkulatori server-side nuk ktheu rezultat të vlefshëm.'] };
  }

  return {
    ...calculation,
    outcome:calculation.outcome || OUTCOME.CALCULATED,
    engine:'drx-dosage-rule-engine-v4',
    regimenId:clean(rule.regimenId ?? rule.sourceKey) || null,
    sourceKey:clean(rule.sourceKey) || null,
    renalAdjustment:renal.adjustment || null,
  };
}

module.exports = {
  OUTCOME,
  evaluate,
  _test:Object.freeze({
    clean, lower, numberOrNull, positiveOrNull, normalizeRoute, normalizeAgeDays,
    requiredInputs, validateRequired, checkSource, checkIdentity, checkRoute,
    checkAgeWeight, checkRenal, checkPregnancy,
  }),
};
