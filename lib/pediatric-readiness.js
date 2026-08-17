'use strict';

/* PRN + schedule-range safety overlay mbi klasifikuesin e ngrirë. */
const core = require('./pediatric-readiness-core.js');
const { scheduleOf } = require('./pediatric-schedule.js');
const PER_DOSE_BASIS = new Set(['kg/dozë', 'm²/dozë', 'dozë fikse']);
const CONTINUOUS_RATE_BASIS = new Set(['kg/orë', 'kg/min']);
const clean = value => String(value ?? '').trim();
const numeric = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
function hasWeightBoundary(row) {
  return numeric(row?.pediatric_min_weight_kg) !== null || numeric(row?.pediatric_max_weight_kg) !== null;
}
function adaptRowForPrn(row = {}) {
  const schedule = scheduleOf(row);
  const caps = core._test.capsOf(row);
  const basis = clean(row.pediatric_dose_basis);

  if (schedule.mode === 'range' && schedule.issues.length === 0
    && schedule.effectiveMaxDosesPerDay !== null) {
    return {
      row:{
        ...row,
        pediatric_doses_per_day:schedule.effectiveMaxDosesPerDay,
        pediatric_interval_hours:null,
      },
      schedule,
      synthetic:true,
      syntheticKind:'range',
    };
  }

  const canCreateDailyEnvelope = PER_DOSE_BASIS.has(basis)
    && schedule.issues.length === 0
    && schedule.exactDosesPerDay === null
    && schedule.effectiveMaxDosesPerDay !== null
    && caps.status.maxDaily === core.CAP_STATUS.SPECIFIED;
  if (!canCreateDailyEnvelope) {
    return { row, schedule, synthetic:false, syntheticKind:null };
  }
  return {
    row:{ ...row, pediatric_doses_per_day:schedule.effectiveMaxDosesPerDay },
    schedule,
    synthetic:true,
    syntheticKind:'prn',
  };
}
function classify(row = {}) {
  const adapted = adaptRowForPrn(row);
  const verdict = core.classify(adapted.row);
  const reasons = [...verdict.reasons];
  for (const issue of adapted.schedule.issues) if (!reasons.includes(issue)) reasons.push(issue);
  const basis = clean(row.pediatric_dose_basis);
  if (CONTINUOUS_RATE_BASIS.has(basis)
    && (adapted.schedule.maxDosesPerDay !== null || adapted.schedule.minIntervalHours !== null)) {
    reasons.push('Kufijtë e administrimeve nuk vlejnë për një infuzion të vazhdueshëm.');
  }
  const requires = { ...verdict.requires, weight:Boolean(verdict.requires?.weight || hasWeightBoundary(row)) };
  let readiness = verdict.readiness;
  if (readiness === core.STATUS.CALCULATOR_READY && reasons.length) readiness = core.STATUS.TEXT_ONLY;
  return { ...verdict, readiness, reasons, requires, schedule:adapted.schedule };
}
function summarize(rows = []) {
  const counts = Object.fromEntries(Object.values(core.STATUS).map(key => [key, 0]));
  const missingCounts = {};
  let withWarnings = 0;
  const results = rows.map(row => {
    const verdict = classify(row);
    counts[verdict.readiness] += 1;
    if (verdict.warnings.length) withWarnings += 1;
    verdict.missing.forEach(field => { missingCounts[field] = (missingCounts[field] || 0) + 1; });
    return { row, verdict };
  });
  return { total:rows.length, counts, missingCounts, withWarnings, results };
}
module.exports = {
  ...core,
  classify,
  summarize,
  _test:{ ...core._test, scheduleOf, adaptRowForPrn, hasWeightBoundary },
};
