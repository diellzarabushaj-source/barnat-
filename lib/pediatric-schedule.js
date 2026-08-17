'use strict';

/*
 * Semantika e orarit pediatrik.
 *
 * - `pediatric_doses_per_day` vetëm = orar i përcaktuar.
 * - `pediatric_doses_per_day` + një `pediatric_max_doses_per_day` më i madh =
 *   interval i verifikuar administrimesh (p.sh. 2–3 doza/24h).
 * - `pediatric_max_doses_per_day` vetëm = ceiling PRN, jo rekomandim rutinë.
 * - `pediatric_min_interval_hours` = interval minimal sigurie.
 *
 * Kjo ruan backward compatibility: rreshtat e vjetër me vetëm doses_per_day
 * mbeten fixed; kufiri PRN nuk kthehet në schedule rutinë.
 */

const HOURS_PER_DAY = 24;
const EPSILON = 1e-9;

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function exactDosesPerDayOf(row = {}) {
  const declared = positive(row.pediatric_doses_per_day);
  if (declared !== null) return { value:declared, from:'pediatric_doses_per_day' };

  const interval = positive(row.pediatric_interval_hours);
  if (interval !== null) return { value:HOURS_PER_DAY / interval, from:'pediatric_interval_hours' };
  return null;
}

function maxAdministrationsFromMinInterval(hours) {
  const interval = positive(hours);
  if (interval === null) return null;
  return Math.max(1, Math.ceil((HOURS_PER_DAY / interval) - EPSILON));
}

function scheduleOf(row = {}) {
  const issues = [];
  const rawDeclaredDoses = numeric(row.pediatric_doses_per_day);
  const rawDeclaredInterval = numeric(row.pediatric_interval_hours);
  const rawMaxDoses = numeric(row.pediatric_max_doses_per_day);
  const rawMinInterval = numeric(row.pediatric_min_interval_hours);

  if (rawDeclaredDoses !== null && !(rawDeclaredDoses > 0)) {
    issues.push('Numri i administrimeve në 24h duhet të jetë pozitiv.');
  }
  if (rawDeclaredInterval !== null && !(rawDeclaredInterval > 0)) {
    issues.push('Intervali i orarit të përcaktuar duhet të jetë pozitiv.');
  }
  if (rawMaxDoses !== null && !(rawMaxDoses > 0)) {
    issues.push('Maksimumi i administrimeve në 24h duhet të jetë pozitiv.');
  }
  if (rawMinInterval !== null && !(rawMinInterval > 0)) {
    issues.push('Intervali minimal mes administrimeve duhet të jetë pozitiv.');
  }

  const declaredDosesPerDay = positive(row.pediatric_doses_per_day);
  const declaredIntervalHours = positive(row.pediatric_interval_hours);
  const maxDosesPerDay = positive(row.pediatric_max_doses_per_day);
  const minIntervalHours = positive(row.pediatric_min_interval_hours);
  const intervalDerivedMaxDosesPerDay = maxAdministrationsFromMinInterval(minIntervalHours);

  let effectiveMaxDosesPerDay = null;
  if (maxDosesPerDay !== null && intervalDerivedMaxDosesPerDay !== null) {
    effectiveMaxDosesPerDay = Math.min(maxDosesPerDay, intervalDerivedMaxDosesPerDay);
  } else {
    effectiveMaxDosesPerDay = maxDosesPerDay ?? intervalDerivedMaxDosesPerDay;
  }

  const isRange = declaredDosesPerDay !== null
    && maxDosesPerDay !== null
    && maxDosesPerDay > declaredDosesPerDay + EPSILON;

  if (isRange && declaredIntervalHours !== null) {
    issues.push('Një interval administrimesh nuk mund të ketë njëkohësisht interval fiks në orë.');
  }

  if (declaredDosesPerDay !== null && maxDosesPerDay !== null
    && declaredDosesPerDay > maxDosesPerDay + EPSILON) {
    issues.push('Orari i përcaktuar tejkalon maksimumin e administrimeve të lejuara në 24h.');
  }

  if (isRange) {
    if (effectiveMaxDosesPerDay !== null
      && effectiveMaxDosesPerDay + EPSILON < declaredDosesPerDay) {
      issues.push('Intervali i administrimeve bie ndesh me kufirin minimal të sigurisë.');
    }
    return {
      mode:'range',
      exactDosesPerDay:null,
      exactSource:null,
      minDosesPerDay:declaredDosesPerDay,
      maxDosesPerDay,
      minIntervalHours,
      intervalDerivedMaxDosesPerDay,
      effectiveMaxDosesPerDay,
      issues,
    };
  }

  const exact = exactDosesPerDayOf(row);

  if (exact && effectiveMaxDosesPerDay !== null && exact.value > effectiveMaxDosesPerDay + EPSILON) {
    issues.push('Orari i përcaktuar tejkalon maksimumin e administrimeve të lejuara në 24h.');
  }
  if (declaredIntervalHours !== null && minIntervalHours !== null
    && declaredIntervalHours + EPSILON < minIntervalHours) {
    issues.push('Intervali i orarit të përcaktuar është më i shkurtër se intervali minimal i sigurisë.');
  }

  return {
    mode:exact ? 'fixed' : (effectiveMaxDosesPerDay !== null ? 'prn-limit' : 'unspecified'),
    exactDosesPerDay:exact?.value ?? null,
    exactSource:exact?.from ?? null,
    minDosesPerDay:null,
    maxDosesPerDay,
    minIntervalHours,
    intervalDerivedMaxDosesPerDay,
    effectiveMaxDosesPerDay,
    issues,
  };
}

module.exports = {
  HOURS_PER_DAY,
  exactDosesPerDayOf,
  maxAdministrationsFromMinInterval,
  scheduleOf,
  _test:{ numeric, positive },
};
