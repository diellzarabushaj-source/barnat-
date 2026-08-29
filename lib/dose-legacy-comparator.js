'use strict';

const Dose = require('./dose-rule-normalizer.js');

const FIELDS = Object.freeze([
  'indicationKey',
  'patientGroup',
  'calculationMethod',
  'doseMinValue',
  'doseMaxValue',
  'doseUnit',
  'doseBasis',
  'weightBasis',
  'frequencyMode',
  'intervalMinHours',
  'intervalMaxHours',
  'timesPerDay',
  'maxSingleDoseMg',
  'maxDailyDoseMg',
  'maxDoses24h',
  'durationMode',
  'durationMinDays',
  'durationMaxDays',
  'reviewAfterDays',
  'minAgeMonths',
  'maxAgeMonths',
  'minWeightKg',
  'maxWeightKg',
  'route',
  'prn',
]);

function comparable(value) {
  return value !== null && value !== undefined && value !== '';
}

function same(left, right) {
  if (typeof left === 'number' || typeof right === 'number') return Number(left) === Number(right);
  if (typeof left === 'boolean' || typeof right === 'boolean') return Boolean(left) === Boolean(right);
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function compareRules(nextInput, legacyInput) {
  const next = Dose.normalizeRule(nextInput || {});
  if (!legacyInput) {
    return {
      schemaVersion:'drx-dose-legacy-comparison-v1',
      status:'missing',
      conflicts:[],
      missingFields:[...FIELDS],
      comparedFields:0,
      next,
      legacy:null,
    };
  }

  const legacy = Dose.normalizeRule(legacyInput || {});
  const conflicts = [];
  const missingFields = [];
  let comparedFields = 0;

  for (const field of FIELDS) {
    const a = next[field];
    const b = legacy[field];
    if (!comparable(a) && !comparable(b)) continue;
    if (!comparable(a) || !comparable(b)) {
      missingFields.push(field);
      continue;
    }
    comparedFields += 1;
    if (!same(a, b)) conflicts.push({ field, next:a, legacy:b });
  }

  const status = conflicts.length
    ? 'conflict'
    : (missingFields.length ? 'missing' : 'exact');

  return {
    schemaVersion:'drx-dose-legacy-comparison-v1',
    status,
    conflicts,
    missingFields,
    comparedFields,
    next,
    legacy,
  };
}

module.exports = { FIELDS, compareRules, _test:{ comparable, same } };
