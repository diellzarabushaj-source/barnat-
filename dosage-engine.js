(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexDosageEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq');

  const FORM_ALIASES = [
    ['tablet', /^(tab\.?|tableta?|tablet(?:s)?)$/],
    ['capsule', /^(caps?\.?|kapsula?|capsules?)$/],
    ['ampoule', /^(amp\.?|ampula?|ampoules?|inj(?:eksion|ection)?\.?)$/],
    ['infusion', /^(inf\.?|infuzion|infusion)$/],
    ['ointment', /^(ung\.?|unguentum|ointment|krem|cream)$/],
    ['solution', /^(sol\.?|solucion|solution)$/],
    ['syrup', /^(sir\.?|sirup|syrup)$/],
    ['suppository', /^(sup\.?|supozitor|suppository)$/],
    ['drops', /^(gtt\.?|pika|drops)$/],
    ['inhalation', /^(inh\.?|inhalacion|inhalation|spray)$/],
    ['vial', /^(fl\.?|flakon|vial)$/],
  ];

  function normalizedToken(value) {
    return fold(value).replace(/[^a-z0-9]+/g, '');
  }

  function normalizeAtc(value) {
    return text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizeForm(value) {
    const source = fold(value).replace(/[()]/g, '').trim();
    return FORM_ALIASES.find(([, pattern]) => pattern.test(source))?.[0] || normalizedToken(source);
  }

  function normalizeSubstance(value) {
    return fold(value)
      .split(/\s*(?:\/|\+|;|\band\b|\bdhe\b)\s*/i)
      .map(part => part.replace(/[^a-z0-9]+/g, ' ').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .join('+');
  }

  function normalizeStrength(value) {
    return fold(value)
      .replace(/,/g, '.')
      .replace(/\bµg\b/g, 'mcg')
      .replace(/\bug\b/g, 'mcg')
      .replace(/\bui\b/g, 'iu')
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9.%/+]/g, '');
  }

  function buildMatchKey(value) {
    const strength = value?.strength ?? value?.referenceStrength ?? value?.concentration;
    return [
      normalizeAtc(value?.atc),
      normalizeSubstance(value?.substance),
      normalizeForm(value?.form),
      normalizeStrength(strength),
    ].join('|');
  }

  function needsPediatricInputs(regimen) {
    return Boolean(
      Number.isFinite(regimen?.mgPerKg)
      || text(regimen?.formula)
      || Number.isFinite(regimen?.minAgeMonths)
      || Number.isFinite(regimen?.maxAgeMonths)
      || Number.isFinite(regimen?.minWeightKg)
      || Number.isFinite(regimen?.maxWeightKg)
    );
  }

  function pediatricEligibility(regimen, patient = {}) {
    if (!needsPediatricInputs(regimen)) return { eligible:true, missing:[] };
    const ageMonths = Number(patient.ageMonths);
    const weightKg = Number(patient.weightKg);
    const missing = [];
    if (!Number.isFinite(ageMonths) || ageMonths < 0) missing.push('ageMonths');
    if ((Number.isFinite(regimen?.mgPerKg) || Number.isFinite(regimen?.minWeightKg) || Number.isFinite(regimen?.maxWeightKg))
      && (!Number.isFinite(weightKg) || weightKg <= 0)) missing.push('weightKg');
    if (missing.length) return { eligible:false, missing };
    const withinAge = (!Number.isFinite(regimen.minAgeMonths) || ageMonths >= regimen.minAgeMonths)
      && (!Number.isFinite(regimen.maxAgeMonths) || ageMonths <= regimen.maxAgeMonths);
    const withinWeight = (!Number.isFinite(regimen.minWeightKg) || weightKg >= regimen.minWeightKg)
      && (!Number.isFinite(regimen.maxWeightKg) || weightKg <= regimen.maxWeightKg);
    return { eligible:withinAge && withinWeight, missing:[], outOfRange:!(withinAge && withinWeight) };
  }

  function exactMatches(drug, regimens) {
    const key = buildMatchKey(drug);
    if (key.split('|').some(part => !part)) return [];
    return (Array.isArray(regimens) ? regimens : []).filter(regimen => (regimen.matchKey || buildMatchKey(regimen)) === key);
  }

  function decideMatch(drug, regimens, options = {}) {
    const matches = exactMatches(drug, regimens);
    if (!matches.length) return { status:'manual', matchKey:buildMatchKey(drug), matches:[] };
    if (options.population === 'pediatric') {
      const evaluated = matches.map(regimen => ({ regimen, eligibility:pediatricEligibility(regimen, options.patient) }));
      const missing = [...new Set(evaluated.flatMap(item => item.eligibility.missing))];
      if (missing.length) return { status:'needs-patient-data', matchKey:buildMatchKey(drug), matches, missing };
      const eligible = evaluated.filter(item => item.eligibility.eligible).map(item => item.regimen);
      if (!eligible.length) return { status:'review', matchKey:buildMatchKey(drug), matches, reason:'patient-out-of-range' };
      if (eligible.length === 1) return { status:'auto', matchKey:buildMatchKey(drug), regimen:eligible[0], matches:eligible };
      return { status:'choose-indication', matchKey:buildMatchKey(drug), matches:eligible };
    }
    if (matches.length === 1) return { status:'auto', matchKey:buildMatchKey(drug), regimen:matches[0], matches };
    return { status:'choose-indication', matchKey:buildMatchKey(drug), matches };
  }

  function prescriptionTransfer(drug, regimen = null, population = 'adult') {
    const base = {
      key:text(drug?.key || drug?.drugKey),
      tradeName:text(drug?.tradeName),
      substance:text(drug?.substance),
      strength:text(drug?.strength),
      form:text(drug?.form),
      packaging:text(drug?.packaging),
      packagingSummary:text(drug?.packagingSummary),
      prescriptionLine:text(drug?.prescriptionLine),
      prescriptionNotation:text(drug?.prescriptionNotation),
      sheetPrescriptionNotation:text(drug?.sheetPrescriptionNotation),
      dispense:text(drug?.dispense),
      route:text(drug?.route),
      atc:text(drug?.atc),
      pdid:text(drug?.pdid),
    };
    if (!regimen) return { ...base, dosageStatus:'manual', dosagePopulation:population };
    return {
      ...base,
      regimenId:text(regimen.regimenId),
      dosageStatus:'auto-filled',
      dosagePopulation:population,
      indication:text(regimen.indication),
      route:text(regimen.route || base.route),
      frequency:text(regimen.frequency),
      duration:text(regimen.duration),
      dispense:text(regimen.dispense || base.dispense),
      signatura:text(regimen.signatura),
      warnings:text(regimen.warnings),
      sourceUrl:text(regimen.sourceUrl),
      matchKey:text(regimen.matchKey || buildMatchKey(regimen)),
      verificationStatus:text(regimen.status || 'VERIFIKUAR'),
    };
  }

  return {
    normalizeAtc,
    normalizeForm,
    normalizeSubstance,
    normalizeStrength,
    buildMatchKey,
    needsPediatricInputs,
    pediatricEligibility,
    exactMatches,
    decideMatch,
    prescriptionTransfer,
  };
});
