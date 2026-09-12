'use strict';

const catalog = require('../data/dozologjia/antibiotics.json');

const clean = value => String(value ?? '').trim();
const norm = value => clean(value).toLocaleLowerCase('en-US').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function substances(query = '') {
  const q = norm(query);
  return catalog.substances
    .filter(item => !q || [item.name, item.id, item.atc, ...(item.aliases || [])].some(value => norm(value).includes(q)))
    .map(item => ({ id:item.id, name:item.name, atc:item.atc, aliases:item.aliases || [], regimenCount:item.regimens.length }));
}

function substanceById(id) {
  const key = norm(id);
  return catalog.substances.find(item => norm(item.id) === key || norm(item.name) === key || (item.aliases || []).some(alias => norm(alias) === key)) || null;
}

function regimens(substanceId, filters = {}) {
  const substance = substanceById(substanceId);
  if (!substance) return [];
  const population = clean(filters.population);
  const route = clean(filters.route);
  return substance.regimens
    .filter(item => !population || item.population === population)
    .filter(item => !route || norm(item.route).includes(norm(route)))
    .map(item => ({ ...item, substanceId:substance.id, substanceName:substance.name }));
}

function regimenById(substanceId, regimenId) {
  return regimens(substanceId).find(item => item.id === regimenId) || null;
}

function requiredInputs(regimen) {
  return Array.isArray(regimen?.requires) ? regimen.requires : [];
}

function validateInputs(regimen, input = {}) {
  const missing = [];
  for (const field of requiredInputs(regimen)) {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value <= 0) missing.push(field);
  }
  return missing;
}

function doseResult(dose, weightKg) {
  if (!dose || !dose.kind) return { calculable:false, label:'Doza kërkon zgjedhje klinike.' };
  if (dose.kind === 'fixed') return { calculable:true, perDoseMg:dose.mg, label:`${dose.mg} mg për dozë` };
  if (dose.kind === 'fixed-range') return { calculable:true, perDoseMinMg:dose.minMg, perDoseMaxMg:dose.maxMg, label:`${dose.minMg}–${dose.maxMg} mg për dozë` };
  if (dose.kind === 'mg-kg-dose') {
    const mg = round(dose.mgKg * weightKg);
    return { calculable:true, mgKg:dose.mgKg, perDoseMg:mg, label:`${mg} mg për dozë (${dose.mgKg} mg/kg)` };
  }
  if (dose.kind === 'mg-kg-day-range') {
    const minDaily = round(dose.minMgKgDay * weightKg);
    const maxDaily = round(dose.maxMgKgDay * weightKg);
    const n = dose.dosesPerDay;
    return {
      calculable:true,
      dailyMinMg:minDaily,
      dailyMaxMg:maxDaily,
      perDoseMinMg:round(minDaily / n),
      perDoseMaxMg:round(maxDaily / n),
      label:`${round(minDaily / n)}–${round(maxDaily / n)} mg për dozë · ${n} doza/ditë`,
    };
  }
  if (dose.kind === 'combo-fixed') {
    const label = dose.components.map(item => `${item.mg} mg ${item.name}`).join(' + ');
    return { calculable:true, components:dose.components, label };
  }
  if (dose.kind === 'combo-mg-kg-day-range') {
    const n = dose.dosesPerDay;
    const components = dose.components.map(item => ({
      name:item.name,
      dailyMinMg:round(item.minMgKgDay * weightKg),
      dailyMaxMg:round(item.maxMgKgDay * weightKg),
      perDoseMinMg:round(item.minMgKgDay * weightKg / n),
      perDoseMaxMg:round(item.maxMgKgDay * weightKg / n),
    }));
    return { calculable:true, components, label:components.map(item => `${item.perDoseMinMg}–${item.perDoseMaxMg} mg ${item.name}/dozë`).join(' + ') };
  }
  if (dose.kind === 'combo-mg-kg-day') {
    const n = dose.dosesPerDay;
    const components = dose.components.map(item => ({
      name:item.name,
      dailyMg:round(item.mgKgDay * weightKg),
      perDoseMg:round(item.mgKgDay * weightKg / n),
    }));
    return { calculable:true, components, label:components.map(item => `${item.perDoseMg} mg ${item.name}/dozë`).join(' + ') };
  }
  return { calculable:false, label:dose.label || 'Doza kërkon zgjedhje klinike.' };
}

function calculate({ substanceId, regimenId, weightKg } = {}) {
  const regimen = regimenById(substanceId, regimenId);
  if (!regimen) return { outcome:'NOT_FOUND', error:'Regjimi nuk u gjet.' };
  const missing = validateInputs(regimen, { weightKg });
  if (missing.length) return { outcome:'NEEDS_PATIENT_DATA', required:missing };
  const dose = doseResult(regimen.dose, Number(weightKg));
  return {
    outcome:dose.calculable ? 'CALCULATED' : 'CLINICAL_SELECTION_REQUIRED',
    substanceId:regimen.substanceId,
    substanceName:regimen.substanceName,
    regimenId:regimen.id,
    indication:regimen.indication,
    population:regimen.population,
    populationLabel:regimen.populationLabel,
    route:regimen.route,
    dose,
    frequency:regimen.frequency,
    duration:regimen.duration,
    maximum:regimen.maximum,
    notes:regimen.notes || '',
    source:regimen.source,
    requiresReview:true,
  };
}

module.exports = { catalog, substances, substanceById, regimens, regimenById, requiredInputs, calculate, _test:{ doseResult, validateInputs, norm } };
