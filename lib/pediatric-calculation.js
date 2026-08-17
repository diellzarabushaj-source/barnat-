'use strict';

/* Server-only schedule overlay. PRN ceilings and schedule ranges never become fake exact schedules. */
const core = require('./pediatric-calculation-core.js');
const readiness = require('./pediatric-readiness.js');
const { scheduleOf } = require('./pediatric-schedule.js');

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function prnSteps(schedule) {
  const steps = [];
  if (schedule.maxDosesPerDay !== null) {
    steps.push({ label:'Maks. administrime / 24h', value:schedule.maxDosesPerDay, unit:'' });
  }
  if (schedule.minIntervalHours !== null) {
    steps.push({ label:'Intervali minimal', value:schedule.minIntervalHours, unit:'orë' });
  }
  return steps;
}

function rangeSteps(schedule) {
  const steps = [{
    label:'Administrime / 24h',
    value:`${schedule.minDosesPerDay}–${schedule.effectiveMaxDosesPerDay}`,
    unit:'',
  }];
  if (schedule.minIntervalHours !== null) {
    steps.push({ label:'Intervali minimal', value:schedule.minIntervalHours, unit:'orë' });
  }
  return steps;
}

function publicSchedule(schedule) {
  return {
    mode:schedule.mode,
    minDosesPerDay:schedule.minDosesPerDay ?? null,
    maxDosesPerDay:schedule.maxDosesPerDay,
    minIntervalHours:schedule.minIntervalHours,
    effectiveMaxDosesPerDay:schedule.effectiveMaxDosesPerDay,
  };
}

function mergeNumericRange(...ranges) {
  const values = [];
  for (const range of ranges) {
    if (!range) continue;
    if (Number.isFinite(range.min)) values.push(range.min);
    if (Number.isFinite(range.max)) values.push(range.max);
  }
  if (!values.length) return null;
  return { min:Math.min(...values), max:Math.max(...values) };
}

function mergeMeasureRange(...measures) {
  const values = [];
  for (const measure of measures) {
    if (!measure) continue;
    for (const endpoint of [measure.min, measure.max]) {
      if (endpoint && Number.isFinite(endpoint.amount)) values.push(endpoint);
    }
  }
  if (!values.length) return null;
  const first = values[0];
  if (values.some(item => item.unit !== first.unit || item.kind !== first.kind)) return null;
  const amounts = values.map(item => item.amount);
  return {
    min:{ ...first, amount:Math.min(...amounts) },
    max:{ ...first, amount:Math.max(...amounts) },
  };
}

function exactVariant(row, dosesPerDay) {
  return {
    ...row,
    pediatric_doses_per_day:dosesPerDay,
    pediatric_interval_hours:null,
    pediatric_max_doses_per_day:null,
  };
}

function calculateScheduleRange(row, patient, schedule) {
  const verdict = readiness.classify(row);
  const publicRange = publicSchedule(schedule);
  if (verdict.readiness !== readiness.STATUS.CALCULATOR_READY) {
    return {
      outcome:core.OUTCOME.NOT_CALCULABLE,
      readiness:verdict.readiness,
      reasons:verdict.reasons,
      missing:verdict.missing,
      warnings:verdict.warnings,
      schedule:publicRange,
    };
  }

  const minDoses = schedule.minDosesPerDay;
  const maxDoses = schedule.effectiveMaxDosesPerDay;
  if (!(minDoses > 0) || !(maxDoses >= minDoses)) {
    return {
      outcome:core.OUTCOME.NOT_CALCULABLE,
      readiness:verdict.readiness,
      reasons:['Intervali i administrimeve nuk është i plotë ose është kontradiktor.'],
      warnings:verdict.warnings,
      schedule:publicRange,
    };
  }

  const atMin = core.calculate(exactVariant(row, minDoses), patient);
  if (atMin.outcome !== core.OUTCOME.CALCULATED) return { ...atMin, schedule:publicRange };
  const atMax = core.calculate(exactVariant(row, maxDoses), patient);
  if (atMax.outcome !== core.OUTCOME.CALCULATED) return { ...atMax, schedule:publicRange };

  const perDose = mergeNumericRange(atMin.perDose, atMax.perDose);
  const daily = mergeNumericRange(atMin.daily, atMax.daily);
  const ratePerHour = mergeNumericRange(atMin.ratePerHour, atMax.ratePerHour);
  const measure = mergeMeasureRange(atMin.measure, atMax.measure);
  const warnings = unique([
    ...(atMin.warnings || []),
    ...(atMax.warnings || []),
    `Skema e verifikuar lejon ${minDoses}–${maxDoses} administrime në 24h; kalkulatori nuk zgjedh automatikisht një frekuencë brenda intervalit.`,
    (atMin.measure || atMax.measure) && !measure
      ? 'Masa e administrimit nuk u bashkua sepse njësitë e rezultateve nuk përputhen.'
      : null,
  ]);
  const steps = (atMin.steps || []).filter(step => step?.label !== 'Doza në ditë');
  steps.push(...rangeSteps(schedule));

  return {
    ...atMin,
    isRange:true,
    perDose,
    daily,
    ratePerHour,
    dosesPerDay:null,
    measure,
    cappedBy:unique([...(atMin.cappedBy || []), ...(atMax.cappedBy || [])]),
    warnings,
    steps,
    schedule:publicRange,
  };
}

function calculate(row = {}, patient = {}) {
  const schedule = scheduleOf(row);
  if (schedule.mode === 'range') return calculateScheduleRange(row, patient, schedule);

  const adapted = readiness._test.adaptRowForPrn(row);
  const result = core.calculate(adapted.row, patient);
  const resolvedSchedule = adapted.schedule || schedule;

  if (result.outcome !== core.OUTCOME.CALCULATED) {
    return { ...result, schedule:publicSchedule(resolvedSchedule) };
  }

  let steps = Array.isArray(result.steps) ? [...result.steps] : [];
  let warnings = Array.isArray(result.warnings) ? [...result.warnings] : [];

  if (adapted.syntheticKind === 'prn') {
    /* Core-i e përdor envelope-in si frekuencë vetëm për të provuar maxDaily.
       Para se përgjigjja të dalë nga serveri, e heqim çdo paraqitje si orar fiks. */
    steps = steps.filter(step => !(
      step?.label === 'Doza në ditë' && step?.from === 'pediatric_doses_per_day'
    ));
    warnings.push(
      'Kufijtë PRN përdoren vetëm si kufij sigurie; nuk përfaqësojnë orar fiks të administrimit.',
    );
  }

  if (resolvedSchedule.maxDosesPerDay !== null || resolvedSchedule.minIntervalHours !== null) {
    steps.push(...prnSteps(resolvedSchedule));
    if (adapted.syntheticKind !== 'prn' && resolvedSchedule.mode === 'prn-limit') {
      warnings.push(
        'Kufijtë PRN përdoren vetëm si kufij sigurie; nuk përfaqësojnë orar fiks të administrimit.',
      );
    }
  }

  return {
    ...result,
    dosesPerDay:adapted.syntheticKind === 'prn' ? null : result.dosesPerDay,
    daily:adapted.syntheticKind === 'prn' ? null : result.daily,
    warnings:unique(warnings),
    steps,
    schedule:publicSchedule(resolvedSchedule),
  };
}

module.exports = {
  ...core,
  calculate,
  _test:{
    ...core._test,
    scheduleOf,
    adaptRowForPrn:readiness._test.adaptRowForPrn,
    mergeNumericRange,
    mergeMeasureRange,
    exactVariant,
    calculateScheduleRange,
  },
};
