(function (root, factory) {
  const api = factory(root?.MedIndexAdministrationRoutes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexDosageEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Administration) {
  'use strict';

  if (!Administration && typeof require === 'function') {
    try { Administration = require('./administration-routes.js'); } catch {}
  }

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
    ['ointment', /^(ung\.?|unguentum|ointment|pomade)$/],
    ['cream', /^(krem|cream)$/],
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

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positive(value) {
    const number = finite(value);
    return number != null && number > 0 ? number : null;
  }

  function pediatricDoseFactors(regimen = {}) {
    const legacy = positive(regimen.mgPerKg);
    const minimum = positive(regimen.mgPerKgMin) ?? legacy;
    const maximum = positive(regimen.mgPerKgMax) ?? minimum;
    return {
      minimum,
      maximum:maximum != null && minimum != null ? Math.max(minimum, maximum) : maximum,
    };
  }

  function needsPediatricInputs(regimen) {
    const factors = pediatricDoseFactors(regimen);
    return Boolean(
      factors.minimum != null
      || factors.maximum != null
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
    const factors = pediatricDoseFactors(regimen);
    const ageRequired = Number.isFinite(regimen?.minAgeMonths) || Number.isFinite(regimen?.maxAgeMonths);
    const weightRequired = factors.minimum != null
      || factors.maximum != null
      || Number.isFinite(regimen?.minWeightKg)
      || Number.isFinite(regimen?.maxWeightKg);
    if (ageRequired && (!Number.isFinite(ageMonths) || ageMonths < 0)) missing.push('ageMonths');
    if (weightRequired && (!Number.isFinite(weightKg) || weightKg <= 0)) missing.push('weightKg');
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

  function decimal(value, digits = 2) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  }

  function concentrationMgPerMl(regimen = {}) {
    const structuredMg = positive(regimen.concentrationMg);
    const structuredMl = positive(regimen.concentrationMl);
    if (structuredMg != null && structuredMl != null) return structuredMg / structuredMl;
    const match = text(regimen.concentration).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*mg\s*\/\s*(\d+(?:\.\d+)?)\s*m[lL]\b/);
    if (!match) return null;
    const mg = Number(match[1]);
    const ml = Number(match[2]);
    return Number.isFinite(mg) && Number.isFinite(ml) && mg > 0 && ml > 0 ? mg / ml : null;
  }

  function applyCaps(perDoseMg, dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, caps) {
    let dose = perDoseMg;
    let daily = dailyTotalMg;
    if (Number.isFinite(dose) && maxSingleMg != null && dose > maxSingleMg) {
      dose = maxSingleMg;
      caps.push('maxSingle');
    }
    if (Number.isFinite(dose) && !Number.isFinite(daily) && dosesPerDay != null) daily = dose * dosesPerDay;
    if (Number.isFinite(daily) && max24hMg != null && daily > max24hMg) {
      daily = max24hMg;
      caps.push('max24h');
      if (dosesPerDay != null) dose = Math.min(dose, max24hMg / dosesPerDay);
    }
    return { perDoseMg:dose, dailyTotalMg:daily };
  }

  function calculateFactor(factor, basis, weightKg, dosesPerDay) {
    if (factor == null || weightKg == null) return { perDoseMg:null, dailyTotalMg:null };
    if (/dit/.test(basis)) {
      const dailyTotalMg = weightKg * factor;
      return {
        dailyTotalMg,
        perDoseMg:dosesPerDay != null ? dailyTotalMg / dosesPerDay : null,
      };
    }
    if (/doz|marr/.test(basis)) {
      const perDoseMg = weightKg * factor;
      return {
        perDoseMg,
        dailyTotalMg:dosesPerDay != null ? perDoseMg * dosesPerDay : null,
      };
    }
    return { perDoseMg:null, dailyTotalMg:null, ambiguous:true };
  }

  function calculatePediatricDose(regimen, patient = {}) {
    const eligibility = pediatricEligibility(regimen, patient);
    if (eligibility.missing?.length) return { status:'needs-patient-data', missing:eligibility.missing };
    if (!eligibility.eligible) return { status:'out-of-range' };

    const weightKg = positive(patient.weightKg);
    const fixedDoseMg = positive(regimen?.fixedDoseMg);
    const fixedVolumeMl = positive(regimen?.fixedVolumeMl);
    const dosesPerDay = positive(regimen?.dosesPerDay);
    const maxSingleMg = positive(regimen?.maxSingleMg);
    const max24hMg = positive(regimen?.max24hMg);
    const basis = fold(regimen?.basis);
    const factors = pediatricDoseFactors(regimen);
    const concentration = concentrationMgPerMl(regimen);
    const caps = [];

    if (fixedDoseMg != null || fixedVolumeMl != null) {
      let perDoseMg = fixedDoseMg;
      let dailyTotalMg = fixedDoseMg != null && dosesPerDay != null ? fixedDoseMg * dosesPerDay : null;
      const capped = applyCaps(perDoseMg, dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, caps);
      perDoseMg = capped.perDoseMg;
      dailyTotalMg = capped.dailyTotalMg;
      const perDoseMl = fixedVolumeMl ?? (perDoseMg != null && concentration != null ? perDoseMg / concentration : null);
      return {
        status:'calculated',
        perDoseMg:decimal(perDoseMg),
        dailyTotalMg:decimal(dailyTotalMg),
        perDoseMl:decimal(perDoseMl),
        dosesPerDay,
        cappedBy:[...new Set(caps)],
      };
    }

    if (factors.minimum == null || weightKg == null) return { status:'manual', reason:'no-structured-rule' };
    if (!/dit|doz|marr/.test(basis)) return { status:'manual', reason:'ambiguous-basis' };

    const minimumRaw = calculateFactor(factors.minimum, basis, weightKg, dosesPerDay);
    const maximumRaw = calculateFactor(factors.maximum ?? factors.minimum, basis, weightKg, dosesPerDay);
    const minimumCaps = [];
    const maximumCaps = [];
    const minimum = applyCaps(minimumRaw.perDoseMg, minimumRaw.dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, minimumCaps);
    const maximum = applyCaps(maximumRaw.perDoseMg, maximumRaw.dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, maximumCaps);
    caps.push(...minimumCaps, ...maximumCaps);

    const isRange = factors.maximum != null && Math.abs(factors.maximum - factors.minimum) > 1e-9;
    if (isRange) {
      return {
        status:'range-calculated',
        requiresDoseSelection:true,
        factorMinMgPerKg:decimal(factors.minimum),
        factorMaxMgPerKg:decimal(factors.maximum),
        perDoseMgMin:decimal(minimum.perDoseMg),
        perDoseMgMax:decimal(maximum.perDoseMg),
        dailyTotalMgMin:decimal(minimum.dailyTotalMg),
        dailyTotalMgMax:decimal(maximum.dailyTotalMg),
        perDoseMlMin:concentration != null ? decimal(minimum.perDoseMg / concentration) : null,
        perDoseMlMax:concentration != null ? decimal(maximum.perDoseMg / concentration) : null,
        dosesPerDay,
        cappedBy:[...new Set(caps)],
      };
    }

    return {
      status:'calculated',
      perDoseMg:decimal(minimum.perDoseMg),
      dailyTotalMg:decimal(minimum.dailyTotalMg),
      perDoseMl:concentration != null ? decimal(minimum.perDoseMg / concentration) : null,
      dosesPerDay,
      cappedBy:[...new Set(caps)],
    };
  }

  function formatNumber(value) {
    return Number.isFinite(Number(value))
      ? new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(Number(value))
      : '';
  }

  function calculatedRangeText(calculation) {
    if (calculation?.status !== 'range-calculated') return '';
    const mg = Number.isFinite(calculation.perDoseMgMin) && Number.isFinite(calculation.perDoseMgMax)
      ? `${formatNumber(calculation.perDoseMgMin)}–${formatNumber(calculation.perDoseMgMax)} mg`
      : '';
    const ml = Number.isFinite(calculation.perDoseMlMin) && Number.isFinite(calculation.perDoseMlMax)
      ? `${formatNumber(calculation.perDoseMlMin)}–${formatNumber(calculation.perDoseMlMax)} mL`
      : '';
    return [mg, ml].filter(Boolean).join(' · ');
  }

  function routePhrase(value) {
    if (Administration?.routePhrase) return Administration.routePhrase(value);
    const raw = text(value);
    const route = fold(raw);
    if (!raw) return '';
    if (/oral|orale|nga goja|\bp\.?o\.?\b/.test(route)) return 'nga goja';
    if (/okular|ocular|ne sy|në sy/.test(route)) return 'në sy';
    if (/otik|otic|ne vesh|në vesh/.test(route)) return 'në vesh';
    if (/nazal|nasal|ne hund|në hund/.test(route)) return 'në hundë';
    if (/topik|topical|kutan|cutaneous|lekure|lëkurë/.test(route)) return 'në lëkurë';
    if (/inhal/.test(route)) return 'me inhalim';
    if (/rektal|rectal/.test(route)) return 'rektalisht';
    if (/intramusk|\bi\.?m\.?\b/.test(route)) return 'intramuskularisht';
    if (/intraven|\bi\.?v\.?\b/.test(route)) return 'intravenoz';
    if (/subkutan|subcutaneous|nenlekure|nënlëkurë|\bs\.?c\.?\b/.test(route)) return 'nënlëkurë';
    return raw;
  }

  function durationPhrase(value) {
    const raw = text(value);
    if (!raw) return '';
    const normalized = fold(raw);
    return /^(per|për|deri|gjate|gjatë|sipas)\b/.test(normalized) ? raw : `për ${raw}`;
  }

  function signatureAmount(regimen, population, calculation) {
    if (population === 'pediatric' && calculation?.status === 'calculated') {
      if (Number.isFinite(calculation.perDoseMl)) return `${formatNumber(calculation.perDoseMl)} mL`;
      if (Number.isFinite(calculation.perDoseMg)) return `${formatNumber(calculation.perDoseMg)} mg`;
    }
    const unitCount = text(regimen?.unitCount);
    const practicalUnit = text(regimen?.practicalUnit);
    if (unitCount && practicalUnit) return `${unitCount} ${practicalUnit}`;
    if (practicalUnit) return practicalUnit;
    if (positive(regimen?.fixedVolumeMl) != null) return `${formatNumber(regimen.fixedVolumeMl)} mL`;
    if (positive(regimen?.fixedDoseMg) != null) return `${formatNumber(regimen.fixedDoseMg)} mg`;
    const doseMg = text(regimen?.doseMg);
    if (doseMg) return /mg\b/i.test(doseMg) ? doseMg : `${doseMg} mg`;
    return '';
  }

  function buildSignature(regimen, population = 'adult', calculation = null) {
    if (calculation?.status === 'range-calculated') return '';
    const existing = text(regimen?.signatura);
    const calculatedPediatric = population === 'pediatric' && calculation?.status === 'calculated';
    if (!calculatedPediatric && existing) return existing;
    const amount = signatureAmount(regimen, population, calculation);
    if (!amount) return existing;
    const verb = population === 'pediatric' ? 'Jepen' : 'Merret';
    const route = routePhrase(regimen?.route);
    const frequency = text(regimen?.frequency)
      || (positive(regimen?.intervalHours) != null ? `çdo ${formatNumber(regimen.intervalHours)} orë` : '');
    const duration = durationPhrase(regimen?.duration);
    const sentence = [`${verb} ${amount}`, route, frequency, duration].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return sentence ? `${sentence.replace(/[.]+$/, '')}.` : existing;
  }

  function prescriptionTransfer(drug, regimen = null, population = 'adult', calculation = null) {
    const administration = Administration?.inferAdministration ? Administration.inferAdministration(drug) : {};
    const base = {
      key:text(drug?.key || drug?.drugKey),
      tradeName:text(drug?.tradeName), substance:text(drug?.substance), strength:text(drug?.strength),
      form:text(drug?.form), packaging:text(drug?.packaging), packagingSummary:text(drug?.packagingSummary),
      prescriptionLine:text(drug?.prescriptionLine), prescriptionNotation:text(drug?.prescriptionNotation),
      sheetPrescriptionNotation:text(drug?.sheetPrescriptionNotation), dispense:text(drug?.dispense),
      route:text(drug?.route), atc:text(drug?.atc), pdid:text(drug?.pdid),
      administrationCategory:text(drug?.administrationCategory || administration.category),
      allowedRoutes:Array.isArray(drug?.allowedRoutes) ? drug.allowedRoutes : administration.routes,
    };
    if (!regimen) return { ...base, dosageStatus:'manual', dosagePopulation:population };
    const range = calculatedRangeText(calculation);
    const requiresReview = calculation?.status === 'range-calculated';
    return {
      ...base,
      regimenId:text(regimen.regimenId),
      dosageStatus:requiresReview ? 'requires-review' : 'auto-filled',
      dosagePopulation:population,
      indication:text(regimen.indication),
      route:text(regimen.route || base.route),
      administrationCategory:text(regimen.administrationCategory || base.administrationCategory),
      frequency:text(regimen.frequency),
      duration:text(regimen.duration),
      dispense:text(regimen.dispense || base.dispense),
      signatura:buildSignature(regimen, population, calculation),
      warnings:[
        text(regimen.warnings),
        requiresReview ? 'Kalkulatori dha diapazon; doza përfundimtare duhet zgjedhur sipas indikacionit dhe protokollit.' : '',
      ].filter(Boolean).join(' · '),
      calculatedDoseRange:range,
      pediatricCalculation:calculation || null,
      sourceUrl:text(regimen.sourceUrl),
      matchKey:text(regimen.matchKey || buildMatchKey(regimen)),
      verificationStatus:text(regimen.status || 'VERIFIKUAR'),
    };
  }

  return {
    normalizeAtc, normalizeForm, normalizeSubstance, normalizeStrength, buildMatchKey,
    pediatricDoseFactors, needsPediatricInputs, pediatricEligibility, exactMatches, decideMatch,
    concentrationMgPerMl, calculatePediatricDose, calculatedRangeText, buildSignature, prescriptionTransfer,
  };
});