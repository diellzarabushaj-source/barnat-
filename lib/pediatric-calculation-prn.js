'use strict';

/* Server-only PRN overlay. PRN limits are safety envelopes, never routine schedules. */
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

function publicSchedule(schedule) {
  return {
    mode:schedule.mode,
    maxDosesPerDay:schedule.maxDosesPerDay,
    minIntervalHours:schedule.minIntervalHours,
    effectiveMaxDosesPerDay:schedule.effectiveMaxDosesPerDay,
  };
}

function calculate(row = {}, patient = {}) {
  const adapted = readiness._test.adaptRowForPrn(row);
  const result = core.calculate(adapted.row, patient);
  const schedule = adapted.schedule || scheduleOf(row);

  if (result.outcome !== core.OUTCOME.CALCULATED) {
    return { ...result, schedule:publicSchedule(schedule) };
  }

  let steps = Array.isArray(result.steps) ? [...result.steps] : [];
  let warnings = Array.isArray(result.warnings) ? [...result.warnings] : [];

  if (adapted.synthetic) {
    /* Core-i e përdor envelope-in si frekuencë vetëm për të provuar maxDaily.
       Para se përgjigjja të dalë nga serveri, e heqim çdo paraqitje si orar fiks. */
    steps = steps.filter(step => !(
      step?.label === 'Doza në ditë' && step?.from === 'pediatric_doses_per_day'
    ));
    warnings.push(
      'Kufijtë PRN përdoren vetëm si kufij sigurie; nuk përfaqësojnë orar fiks të administrimit.',
    );
  }

  if (schedule.maxDosesPerDay !== null || schedule.minIntervalHours !== null) {
    steps.push(...prnSteps(schedule));
    if (!adapted.synthetic && schedule.mode === 'prn-limit') {
      warnings.push(
        'Kufijtë PRN përdoren vetëm si kufij sigurie; nuk përfaqësojnë orar fiks të administrimit.',
      );
    }
  }

  return {
    ...result,
    dosesPerDay:adapted.synthetic ? null : result.dosesPerDay,
    daily:adapted.synthetic ? null : result.daily,
    warnings:unique(warnings),
    steps,
    schedule:publicSchedule(schedule),
  };
}

module.exports = {
  ...core,
  calculate,
  _test:{ ...core._test, scheduleOf, adaptRowForPrn:readiness._test.adaptRowForPrn },
};
