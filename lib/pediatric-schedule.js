'use strict';

/*
 * Semantika e orarit pediatrik.
 *
 * `pediatric_doses_per_day` / `pediatric_interval_hours` përfaqësojnë një orar
 * të përcaktuar të administrimit. Fushat PRN të sigurisë janë të ndryshme:
 * - `pediatric_max_doses_per_day` = maksimum administrimesh në 24h;
 * - `pediatric_min_interval_hours` = intervali minimal mes administrimeve.
 *
 * Kufijtë PRN kurrë nuk kthehen në rekomandim rutinë. Ato përdoren vetëm për
 * të provuar që një maxDaily mund të zbatohet edhe kur nuk ka orar fiks.
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
  const rawMaxDoses = numeric(row.pediatric_max_doses_per_day);
  const rawMinInterval = numeric(row.pediatric_min_interval_hours);

  if (rawMaxDoses !== null && !(rawMaxDoses > 0)) {
    issues.push('Maksimumi i administrimeve në 24h duhet të jetë pozitiv.');
  }
  if (rawMinInterval !== null && !(rawMinInterval > 0)) {
    issues.push('Intervali minimal mes administrimeve duhet të jetë pozitiv.');
  }

  const maxDosesPerDay = positive(row.pediatric_max_doses_per_day);
  const minIntervalHours = positive(row.pediatric_min_interval_hours);
  const intervalDerivedMaxDosesPerDay = maxAdministrationsFromMinInterval(minIntervalHours);

  let effectiveMaxDosesPerDay = null;
  if (maxDosesPerDay !== null && intervalDerivedMaxDosesPerDay !== null) {
    effectiveMaxDosesPerDay = Math.min(maxDosesPerDay, intervalDerivedMaxDosesPerDay);
  } else {
    effectiveMaxDosesPerDay = maxDosesPerDay ?? intervalDerivedMaxDosesPerDay;
  }

  const exact = exactDosesPerDayOf(row);
  const exactInterval = positive(row.pediatric_interval_hours);

  if (exact && effectiveMaxDosesPerDay !== null && exact.value > effectiveMaxDosesPerDay + EPSILON) {
    issues.push('Orari i përcaktuar tejkalon maksimumin e administrimeve të lejuara në 24h.');
  }
  if (exactInterval !== null && minIntervalHours !== null && exactInterval + EPSILON < minIntervalHours) {
    issues.push('Intervali i orarit të përcaktuar është më i shkurtër se intervali minimal i sigurisë.');
  }

  return {
    mode:exact ? 'fixed' : (effectiveMaxDosesPerDay !== null ? 'prn-limit' : 'unspecified'),
    exactDosesPerDay:exact?.value ?? null,
    exactSource:exact?.from ?? null,
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
