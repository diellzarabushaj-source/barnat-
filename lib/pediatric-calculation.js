'use strict';

/* Fazat 5, 6 dhe 7 — motori i llogaritjes, shndërrimi në vëllim dhe siguria.
 *
 * Të tria janë në një skedar sepse janë një gjë e vetme. Një dozë e llogaritur
 * pa tavan nuk është rezultat i papërfunduar — është rezultat i gabuar. Po t'i
 * ndaja, do të ekzistonte një gjendje ku doza është nxjerrë dhe kufiri nuk
 * është vënë ende, dhe herët a vonë dikush do ta lexonte atë gjendje.
 *
 * Xhiron në server. Shfletuesi dërgon vetëm se cili bar dhe cili pacient;
 * numrat e dozimit vijnë nga baza dhe nuk kthehen kurrë si hyrje. Kjo është
 * arsyeja pse `calculate` merr `row`-in e Neon-it si argument dhe jo një objekt
 * dozimi: kush e thërret nuk ka nga t'ia kalojë një dozë të sajuar.
 *
 * Rregulli i kontratës mbetet: asnjë degë nuk e nxjerr dozën nga fortësia e
 * produktit. Përqendrimi shërben vetëm për të kthyer mg në mL, pasi mg-të janë
 * llogaritur nga skema.
 */

const { STATUS, classify } = require('./pediatric-readiness.js');

const OUTCOME = Object.freeze({
  CALCULATED:'CALCULATED',
  NEEDS_PATIENT_DATA:'NEEDS_PATIENT_DATA',
  OUT_OF_RANGE:'OUT_OF_RANGE',
  NOT_CALCULABLE:'NOT_CALCULABLE',
});

/* Njësitë e vëllimit që pranohen për shndërrim. Lista është e shkurtër me
   qëllim: çdo njësi e panjohur e ndal shndërrimin në vend që ta hamendësojë. */
const VOLUME_UNITS = new Set(['ml', 'mL', 'milil', 'mililitër', 'mililiter']);
/* Format e ngurta ku "për 1 njësi" do të thotë një tabletë a kapsulë. */
const SOLID_UNITS = new Set(['tabletë', 'tablete', 'tablet', 'kapsulë', 'kapsule', 'capsule', 'supozitor']);

const DAYS_PER_DAY_HOURS = 24;
/* Nën këtë peshë llogaritja ndalet: nën 0.4 kg nuk ka pacient real, ka gabim
   shtypi. Mbi 150 kg e njëjta gjë — dhe të dyja janë pikërisht rastet ku një
   formulë mg/kg jep numra që duken të arsyeshëm. */
const MIN_PLAUSIBLE_WEIGHT_KG = 0.4;
const MAX_PLAUSIBLE_WEIGHT_KG = 150;
const MIN_PLAUSIBLE_HEIGHT_CM = 20;
const MAX_PLAUSIBLE_HEIGHT_CM = 220;
/* Mosha pediatrike shkon deri në 18 vjet; mbi këtë skema pediatrike nuk vlen. */
const MAX_PEDIATRIC_AGE_DAYS = 18 * 365.25;

const AGE_UNIT_DAYS = new Map([
  ['ditë', 1], ['dite', 1], ['javë', 7], ['jave', 7],
  ['muaj', 30.4375], ['vjet', 365.25], ['vjeç', 365.25], ['vit', 365.25],
]);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/* Rrumbullakim me shifra domethënëse për numra të vegjël: një dozë 0.0625 mg
   nuk guxon të bëhet 0.06 kur kjo është 4% e sasisë. Doza të mëdha
   rrumbullakohen te dy shifra dhjetore, sepse aty precizioni s'ka kuptim. */
function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  if (value !== 0 && Math.abs(value) < 1) {
    return Number(value.toPrecision(3));
  }
  return Number(value.toFixed(digits));
}

function ageInDays(value, unit) {
  const amount = numeric(value);
  if (amount === null || amount < 0) return null;
  const factor = AGE_UNIT_DAYS.get(clean(unit).toLowerCase());
  return factor ? amount * factor : null;
}

/* Mosteller: BSA(m²) = √(gjatësi(cm) × peshë(kg) / 3600). Zgjedhur sepse është
   formula me një hap që përdoret më shpesh në pediatri dhe sepse gabimi i saj
   ndaj Du Bois është nën një përqindje te fëmijët. */
function bodySurfaceArea(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  return Math.sqrt((heightCm * weightKg) / 3600);
}

function normalizedUnit(value) {
  return clean(value).toLowerCase();
}

/* Sa mg (ose njësi doze) ka për një njësi vëllimi a një tabletë. Kthen null sa
   herë njësitë nuk njihen — kurrë një hamendje. */
function concentrationOf(row) {
  const value = positive(row.pediatric_concentration_value);
  const per = positive(row.pediatric_concentration_per_value);
  const unit = clean(row.pediatric_concentration_unit);
  const perUnit = clean(row.pediatric_concentration_per_unit);
  if (value === null || per === null || !unit || !perUnit) return null;

  const perUnitKey = normalizedUnit(perUnit);
  const kind = VOLUME_UNITS.has(perUnit) || VOLUME_UNITS.has(perUnitKey)
    ? 'volume'
    : (SOLID_UNITS.has(perUnitKey) ? 'solid' : null);
  if (!kind) return null;

  return { perUnitValue:value / per, doseUnit:unit, measureUnit:perUnit, kind };
}

/* Sa doza në ditë. Numri i deklaruar fiton; intervali përdoret vetëm kur ai
   mungon, sepse 24/interval jep numra jo të plotë për intervale si 8 orë te një
   regjim që në fakt jepet dy herë. */
function dosesPerDayOf(row) {
  const declared = positive(row.pediatric_doses_per_day);
  if (declared !== null) return { value:declared, from:'pediatric_doses_per_day' };
  const interval = positive(row.pediatric_interval_hours);
  if (interval !== null) return { value:DAYS_PER_DAY_HOURS / interval, from:'pediatric_interval_hours' };
  return null;
}

/* Kontrolli i hyrjeve të pacientit. Ndahet nga kontrolli i kufijve klinikë:
   këtu shihet nëse numri është numër fare, atje nëse bari e lejon atë pacient. */
function validatePatient(patient, requires) {
  const missing = [];
  const problems = [];

  const weightKg = positive(patient.weightKg);
  const heightCm = positive(patient.heightCm);
  const ageDays = ageInDays(patient.ageValue, patient.ageUnit);

  if (requires.weight && weightKg === null) missing.push('weightKg');
  if (requires.height && heightCm === null) missing.push('heightCm');
  /* Mosha nuk hyn në asnjë formulë — hyn te kufijtë. Prandaj kërkohet vetëm kur
     skema deklaron kufij moshe, çka është pikërisht ajo që `requires.age` do të
     thotë.
     Provova ta lija si paralajmërim, jo si kërkesë, që kalkulatori të mos
     kërkonte moshën për çdo bar me një kufi. E ndryshova: i vetmi arsyetim pse
     ky bar ka kufij moshe është se dozimi jashtë tyre është i gabuar, dhe pa
     moshën nuk kontrollohet dot. Një fushë më shumë që mjeku e di gjithsesi
     kushton shumë më pak se një dozë neonatale e dhënë në heshtje. */
  if (requires.age && ageDays === null) missing.push('age');

  if (weightKg !== null && (weightKg < MIN_PLAUSIBLE_WEIGHT_KG || weightKg > MAX_PLAUSIBLE_WEIGHT_KG)) {
    problems.push(`Pesha ${weightKg} kg është jashtë kufijve të besueshëm (${MIN_PLAUSIBLE_WEIGHT_KG}–${MAX_PLAUSIBLE_WEIGHT_KG} kg).`);
  }
  if (heightCm !== null && (heightCm < MIN_PLAUSIBLE_HEIGHT_CM || heightCm > MAX_PLAUSIBLE_HEIGHT_CM)) {
    problems.push(`Gjatësia ${heightCm} cm është jashtë kufijve të besueshëm (${MIN_PLAUSIBLE_HEIGHT_CM}–${MAX_PLAUSIBLE_HEIGHT_CM} cm).`);
  }
  if (ageDays !== null && ageDays > MAX_PEDIATRIC_AGE_DAYS) {
    problems.push('Mosha kalon 18 vjet; skema pediatrike nuk vlen për këtë pacient.');
  }

  return { weightKg, heightCm, ageDays, missing, problems };
}

/* Kufijtë e vetë barit: mosha dhe pesha e lejuar. Dalja jashtë tyre e ndal
   llogaritjen — një dozë e llogaritur për një foshnjë nën moshën e lejuar do të
   dukej po aq e sigurt sa çdo dozë tjetër, dhe pikërisht kjo është rreziku. */
function checkClinicalRange(row, patient) {
  const blocks = [];

  const minAge = ageInDays(row.pediatric_min_age_value, row.pediatric_min_age_unit);
  const maxAge = ageInDays(row.pediatric_max_age_value, row.pediatric_max_age_unit);
  if (minAge !== null && patient.ageDays !== null && patient.ageDays < minAge) {
    blocks.push(`Mosha është nën minimumin e skemës (${clean(row.pediatric_min_age_value)} ${clean(row.pediatric_min_age_unit)}).`);
  }
  if (maxAge !== null && patient.ageDays !== null && patient.ageDays > maxAge) {
    blocks.push(`Mosha kalon maksimumin e skemës (${clean(row.pediatric_max_age_value)} ${clean(row.pediatric_max_age_unit)}).`);
  }

  const minWeight = positive(row.pediatric_min_weight_kg);
  const maxWeight = positive(row.pediatric_max_weight_kg);
  if (minWeight !== null && patient.weightKg !== null && patient.weightKg < minWeight) {
    blocks.push(`Pesha është nën minimumin e skemës (${minWeight} kg).`);
  }
  if (maxWeight !== null && patient.weightKg !== null && patient.weightKg > maxWeight) {
    blocks.push(`Pesha kalon maksimumin e skemës (${maxWeight} kg).`);
  }

  return { blocks };
}

/* Njësia bazë: sa është doza për një njësi peshe/sipërfaqe, dhe a është ajo për
   dozë apo për ditë. Enum-i i kontratës e bën këtë të drejtpërdrejtë — nuk ka
   nevojë të lexohet tekst i lirë si te motori i vjetër në shfletues. */
function basisShape(basis) {
  switch (basis) {
    case 'kg/dozë': return { per:'dose', measure:'weight' };
    case 'kg/ditë': return { per:'day', measure:'weight' };
    case 'm²/dozë': return { per:'dose', measure:'bsa' };
    case 'm²/ditë': return { per:'day', measure:'bsa' };
    case 'dozë fikse': return { per:'dose', measure:'fixed' };
    case 'kg/orë': return { per:'hour', measure:'weight' };
    case 'kg/min': return { per:'minute', measure:'weight' };
    default: return null;
  }
}

/* Një vlerë doze (min ose max) shndërrohet në mg për dozë dhe mg për ditë. */
function scaleDose(doseValue, shape, scale, perDay) {
  const total = shape.measure === 'fixed' ? doseValue : doseValue * scale;

  if (shape.per === 'dose') {
    return { perDose:total, daily:perDay !== null ? total * perDay : null };
  }
  if (shape.per === 'day') {
    return { perDose:perDay !== null ? total / perDay : null, daily:total };
  }
  /* Infuzion i vazhdueshëm: nuk ka "dozë", ka shpejtësi. Konvertohet në për orë
     që njësia të jetë e njëjtë pavarësisht nëse skema është për orë a për
     minutë, dhe doza ditore del prej saj. */
  const perHour = shape.per === 'minute' ? total * 60 : total;
  return { perDose:null, daily:perHour * DAYS_PER_DAY_HOURS, ratePerHour:perHour };
}

/* Tavanet. Kthen vlerat e kufizuara bashkë me atë çka i kufizoi, sepse mjeku
   duhet ta dijë se numri që sheh nuk është më ai i formulës. */
function applyCaps(values, caps, perDay) {
  const applied = [];
  let perDose = values.perDose;
  let daily = values.daily;
  let ratePerHour = values.ratePerHour ?? null;

  if (perDose !== null && caps.maxSingle !== null && perDose > caps.maxSingle) {
    perDose = caps.maxSingle;
    applied.push('maxSingle');
    if (perDay !== null) daily = perDose * perDay;
  }
  if (daily !== null && caps.maxDaily !== null && daily > caps.maxDaily) {
    daily = caps.maxDaily;
    applied.push('maxDaily');
    /* Kur dita kufizohet, doza e vetme duhet të bjerë bashkë me të — ndryshe
       katër doza të pakufizuara do ta kalonin prapë kufirin ditor. */
    if (perDay !== null) perDose = perDose === null ? null : Math.min(perDose, caps.maxDaily / perDay);
    /* E njëjta gjë për infuzionin: po u kufizua sasia ditore, shpejtësia për orë
       duhet të bjerë me të. Ndryshe do të shfaqej një shpejtësi që, e mbajtur
       njëzet e katër orë, e kalon pikërisht tavanin që sapo u vu. */
    if (ratePerHour !== null) ratePerHour = daily / DAYS_PER_DAY_HOURS;
  }
  return { perDose, daily, ratePerHour, applied };
}

function toMeasure(perDoseValue, concentration) {
  if (perDoseValue === null || !concentration) return null;
  const amount = perDoseValue / concentration.perUnitValue;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount:round(amount, concentration.kind === 'solid' ? 2 : 1),
    unit:concentration.measureUnit,
    kind:concentration.kind,
  };
}

/**
 * @param {object} row      rreshti i `public.drugs` me fushat `pediatric_*`
 * @param {object} patient  { weightKg, heightCm, ageValue, ageUnit }
 */
function calculate(row = {}, patient = {}) {
  const verdict = classify(row);

  if (verdict.readiness !== STATUS.CALCULATOR_READY) {
    return {
      outcome:OUTCOME.NOT_CALCULABLE,
      readiness:verdict.readiness,
      reasons:verdict.reasons,
      missing:verdict.missing,
      warnings:verdict.warnings,
    };
  }

  const checked = validatePatient(patient, verdict.requires);
  if (checked.missing.length) {
    return {
      outcome:OUTCOME.NEEDS_PATIENT_DATA,
      readiness:verdict.readiness,
      missing:checked.missing,
      requires:verdict.requires,
      warnings:verdict.warnings,
    };
  }
  if (checked.problems.length) {
    return {
      outcome:OUTCOME.OUT_OF_RANGE,
      readiness:verdict.readiness,
      reasons:checked.problems,
      warnings:verdict.warnings,
    };
  }

  const range = checkClinicalRange(row, checked);
  if (range.blocks.length) {
    return {
      outcome:OUTCOME.OUT_OF_RANGE,
      readiness:verdict.readiness,
      reasons:range.blocks,
      warnings:verdict.warnings,
    };
  }

  const basis = clean(row.pediatric_dose_basis);
  const shape = basisShape(basis);
  const doseUnit = clean(row.pediatric_dose_unit);
  const doseMin = numeric(row.pediatric_dose_min);
  const doseMax = numeric(row.pediatric_dose_max);
  const perDayInfo = dosesPerDayOf(row);
  const perDay = perDayInfo ? perDayInfo.value : null;

  const bsa = shape.measure === 'bsa' ? bodySurfaceArea(checked.weightKg, checked.heightCm) : null;
  const scale = shape.measure === 'weight' ? checked.weightKg : (shape.measure === 'bsa' ? bsa : 1);

  const caps = { maxSingle:positive(row.pediatric_max_single_value), maxDaily:positive(row.pediatric_max_daily_value) };
  const concentration = concentrationOf(row);

  const lower = applyCaps(scaleDose(doseMin, shape, scale, perDay), caps, perDay);
  /* Kur nuk ka maksimum, skema është një vlerë e vetme dhe të dy skajet janë e
     njëjta gjë. Kjo e mban formën e daljes të njëjtë për të dy rastet. */
  const hasRange = doseMax !== null && Math.abs(doseMax - doseMin) > 1e-9;
  const upper = hasRange ? applyCaps(scaleDose(doseMax, shape, scale, perDay), caps, perDay) : lower;

  const cappedBy = [...new Set([...lower.applied, ...upper.applied])];
  const warnings = [...verdict.warnings];
  if (cappedBy.includes('maxSingle')) warnings.push('Doza e vetme u kufizua te maksimumi i regjistruar.');
  if (cappedBy.includes('maxDaily')) warnings.push('Doza ditore u kufizua te maksimumi i regjistruar.');
  if (perDayInfo?.from === 'pediatric_interval_hours' && !Number.isInteger(perDay)) {
    warnings.push('Numri i dozave u nxor nga intervali dhe nuk është numër i plotë; kontrollo skemën e dhënies.');
  }
  if (shape.per === 'hour' || shape.per === 'minute') {
    warnings.push('Skema është infuzion i vazhdueshëm; rezultati është shpejtësi, jo dozë e vetme.');
  }

  /* Gjurma për "Si u llogarit?" — Faza 8. Shkruhet këtu, ku numrat ekzistojnë
     vërtet, që teksti të mos rindërtohet më vonë nga rezultati dhe të rrezikojë
     të thotë diçka tjetër nga ajo që ndodhi. */
  const steps = [];
  if (shape.measure === 'weight') steps.push({ label:'Pesha', value:checked.weightKg, unit:'kg' });
  if (shape.measure === 'bsa') {
    steps.push({ label:'Pesha', value:checked.weightKg, unit:'kg' });
    steps.push({ label:'Gjatësia', value:checked.heightCm, unit:'cm' });
    steps.push({ label:'Sipërfaqja trupore (Mosteller)', value:round(bsa, 3), unit:'m²' });
  }
  steps.push({
    label:'Skema e regjistruar',
    value:hasRange ? `${doseMin}–${doseMax}` : String(doseMin),
    unit:`${doseUnit}/${basis}`,
  });
  if (perDay !== null) {
    steps.push({ label:'Doza në ditë', value:round(perDay, 2), unit:'', from:perDayInfo.from });
  }
  if (caps.maxSingle !== null) steps.push({ label:'Maks. për dozë', value:caps.maxSingle, unit:clean(row.pediatric_max_single_unit) });
  if (caps.maxDaily !== null) steps.push({ label:'Maks. në 24h', value:caps.maxDaily, unit:clean(row.pediatric_max_daily_unit) });
  if (concentration) {
    steps.push({
      label:'Përqendrimi',
      value:`${clean(row.pediatric_concentration_value)} ${concentration.doseUnit} / ${clean(row.pediatric_concentration_per_value)} ${concentration.measureUnit}`,
      unit:'',
    });
  }

  return {
    outcome:OUTCOME.CALCULATED,
    readiness:verdict.readiness,
    basis,
    doseUnit,
    isRange:hasRange,
    isRate:shape.per === 'hour' || shape.per === 'minute',
    perDose:hasRange
      ? { min:round(lower.perDose), max:round(upper.perDose) }
      : { min:round(lower.perDose), max:round(lower.perDose) },
    daily:hasRange
      ? { min:round(lower.daily), max:round(upper.daily) }
      : { min:round(lower.daily), max:round(lower.daily) },
    ratePerHour:lower.ratePerHour !== null
      ? { min:round(lower.ratePerHour), max:round(upper.ratePerHour) }
      : null,
    dosesPerDay:perDay === null ? null : round(perDay, 2),
    measure:concentration
      ? { min:toMeasure(lower.perDose, concentration), max:toMeasure(upper.perDose, concentration) }
      : null,
    bsa:bsa === null ? null : round(bsa, 3),
    cappedBy,
    warnings,
    steps,
    source:{
      url:clean(row.pediatric_source_url),
      section:clean(row.pediatric_source_section),
      verificationStatus:clean(row.pediatric_verification_status),
      verifiedAt:clean(row.pediatric_verified_at),
    },
  };
}

module.exports = {
  OUTCOME,
  calculate,
  _test:{
    round, ageInDays, bodySurfaceArea, concentrationOf, dosesPerDayOf,
    validatePatient, checkClinicalRange, basisShape, scaleDose, applyCaps, toMeasure,
    MIN_PLAUSIBLE_WEIGHT_KG, MAX_PLAUSIBLE_WEIGHT_KG,
  },
};
