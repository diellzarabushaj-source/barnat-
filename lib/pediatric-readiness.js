'use strict';

/* Klasifikuesi i gatishmërisë së kalkulatorit pediatrik.
 *
 * Ky është seksioni 17 i planit: ndarja e çdo regjimi në CALCULATOR_READY,
 * TEXT_ONLY, NOT_RECOMMENDED, CONTRAINDICATED ose INSUFFICIENT_DATA. Është hapi
 * i parë sepse gjithçka tjetër varet prej tij — dhe sepse ai e ndalon gabimin
 * më të rrezikshëm që mund të bëjë një kalkulator klinik: ta detyrojë çdo tekst
 * dozimi të bëhet formulë.
 *
 * Funksion i pastër mbi fushat typed. Nuk lexon tekst të lirë, nuk merr me
 * mend, nuk prek rrjetin. E njëjta hyrje jep gjithmonë të njëjtën dalje, që
 * auditi i barnave të jetë i riprodhueshëm.
 *
 * Rregulli i kontratës (`data/pediatric-master-contract.json`):
 *   "Never infer pediatric dose from product strength or concentration."
 * Prandaj asnjë degë këtu nuk e nxjerr dozën nga fortësia e produktit. Nëse
 * fushat e dozimit mungojnë, përgjigjja është TEXT_ONLY — kurrë një hamendje.
 */

const { parseCapUnit, convertValue } = require('./pediatric-units.js');

const STATUS = Object.freeze({
  CALCULATOR_READY:'CALCULATOR_READY',
  TEXT_ONLY:'TEXT_ONLY',
  NOT_RECOMMENDED:'NOT_RECOMMENDED',
  CONTRAINDICATED:'CONTRAINDICATED',
  INSUFFICIENT_DATA:'INSUFFICIENT_DATA',
});

const CAP_STATUS = Object.freeze({
  SPECIFIED:'specified',
  ABSENT:'absent',
  INCOMPLETE:'incomplete',
  INVALID:'invalid',
});

/* Bazat e dozimit që kërkojnë peshën e fëmijës. */
const WEIGHT_BASIS = new Set(['kg/dozë', 'kg/ditë', 'kg/orë', 'kg/min']);
/* Bazat që kërkojnë sipërfaqen trupore, pra edhe gjatësinë. */
const BSA_BASIS = new Set(['m²/dozë', 'm²/ditë']);
/* Doza fikse nuk kërkon as peshë as gjatësi. */
const FIXED_BASIS = new Set(['dozë fikse']);
/* Bandat e peshës kërkojnë një strukturë me kufij dhe doza për bandë, të cilën
   projeksioni typed nuk e mban. Prandaj mbeten tekst derisa të modelohen si
   regjime të veçanta. */
const BAND_BASIS = new Set(['bandë peshe']);

/* Bazat ku doza është për ditë dhe duhet pjesëtuar për të nxjerrë dozën e
   vetme; pa numrin e dozave ose intervalin nuk pjesëtohet dot. */
const DAILY_BASIS = new Set(['kg/ditë', 'm²/ditë']);
const PER_DOSE_BASIS = new Set(['kg/dozë', 'm²/dozë', 'dozë fikse']);
const CONTINUOUS_RATE_BASIS = new Set(['kg/orë', 'kg/min']);

const clean = value => String(value ?? '').trim();

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function positive(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/* Statuset që e ndalojnë llogaritjen para se të shihet ndonjë numër. */
function blockingStatus(useStatus) {
  const status = clean(useStatus).toUpperCase();
  if (status === 'KUNDËRINDIKUAR') return STATUS.CONTRAINDICATED;
  if (status === 'NUK REKOMANDOHET') return STATUS.NOT_RECOMMENDED;
  if (!status || status === 'PA TË DHËNA' || status === 'NUK APLIKOHET') return STATUS.INSUFFICIENT_DATA;
  return null;
}

/* A mund të kthehet doza në mL. Kjo nuk e vendos gatishmërinë: një dozë në mg
   është e vlefshme edhe pa përqendrim; thjesht nuk shndërrohet në vëllim. */
function volumeCapability(row) {
  const value = numeric(row.pediatric_concentration_value);
  const per = numeric(row.pediatric_concentration_per_value);
  const unit = clean(row.pediatric_concentration_unit);
  const perUnit = clean(row.pediatric_concentration_per_unit);
  if (value === null || per === null || !unit || !perUnit) {
    return { canConvertToVolume:false, reason:'Përqendrimi nuk është i plotë.' };
  }
  if (value <= 0 || per <= 0) {
    return { canConvertToVolume:false, reason:'Përqendrimi ka vlerë jo pozitive.' };
  }
  return { canConvertToVolume:true, perUnitValue:value / per, unit, perUnit };
}

/*
 * Një kufi nuk është vetëm një numër. Vlera dhe njësia duhet të ekzistojnë
 * bashkë, njësia duhet të njihet, periudha duhet të përputhet me kolonën dhe
 * dimensioni duhet të jetë i njëjtë me njësinë e dozës. Kjo kontrollohet këtu,
 * para se lista e barnave ta etiketojë regjimin si të llogaritshëm.
 */
function capState(valueRaw, unitRaw, doseUnit, expectedPeriod) {
  const value = numeric(valueRaw);
  const unit = clean(unitRaw);
  const hasValue = value !== null;
  const hasUnit = Boolean(unit);
  const label = expectedPeriod === 'daily' ? 'Kufiri ditor' : 'Kufiri për dozë';

  if (!hasValue && !hasUnit) {
    return { status:CAP_STATUS.ABSENT, value:null, unit:null, issue:null };
  }
  if (hasValue !== hasUnit) {
    return {
      status:CAP_STATUS.INCOMPLETE,
      value,
      unit:unit || null,
      issue:`${label} është i paplotë: vlera dhe njësia duhet të jenë të dyja të regjistruara.`,
    };
  }
  if (!(value > 0)) {
    return {
      status:CAP_STATUS.INVALID,
      value,
      unit,
      issue:`${label} duhet të ketë vlerë pozitive.`,
    };
  }

  const parsed = parseCapUnit(unit);
  if (!parsed) {
    return {
      status:CAP_STATUS.INVALID,
      value,
      unit,
      issue:`${label} ka njësi të pambështetur: "${unit}".`,
    };
  }
  if (parsed.period && parsed.period !== expectedPeriod) {
    return {
      status:CAP_STATUS.INVALID,
      value,
      unit,
      issue:`${label} ka periudhë që nuk përputhet me kolonën: "${unit}".`,
    };
  }
  if (doseUnit && convertValue(1, parsed.scalarUnit, doseUnit) === null) {
    return {
      status:CAP_STATUS.INVALID,
      value,
      unit,
      issue:`${label} (${unit}) nuk është kompatibil me njësinë e dozës "${doseUnit}".`,
    };
  }

  return { status:CAP_STATUS.SPECIFIED, value, unit, issue:null };
}

/* Kufijtë e sigurisë mbajnë edhe gjendjen e plotësisë. `absent` nuk do të thotë
   "nuk ekziston maksimum"; do të thotë vetëm se ky dataset nuk e ka dokumentuar
   një të tillë. Për skemat që shkallëzohen me kg/m² kjo mungesë bllokon. */
function capsOf(row) {
  const doseUnit = clean(row.pediatric_dose_unit);
  const maxSingleState = capState(
    row.pediatric_max_single_value,
    row.pediatric_max_single_unit,
    doseUnit,
    'single',
  );
  const maxDailyState = capState(
    row.pediatric_max_daily_value,
    row.pediatric_max_daily_unit,
    doseUnit,
    'daily',
  );
  return {
    maxSingle:numeric(row.pediatric_max_single_value),
    maxSingleUnit:clean(row.pediatric_max_single_unit) || null,
    maxDaily:numeric(row.pediatric_max_daily_value),
    maxDailyUnit:clean(row.pediatric_max_daily_unit) || null,
    status:{ maxSingle:maxSingleState.status, maxDaily:maxDailyState.status },
    issues:[maxSingleState.issue, maxDailyState.issue].filter(Boolean),
  };
}

/*
 * Një cap mund të jetë sintaksisht i vlefshëm dhe prapë të mos ketë ku të
 * aplikohet. Motori llogarit `daily` për një dozë-per-administrim vetëm kur ka
 * frekuencë typed; pa të, një maxDaily do të mbetej i padukshëm. Në të njëjtën
 * mënyrë, infuzioni i vazhdueshëm nuk prodhon `perDose`, prandaj maxSingle nuk
 * mund të zbatohet. Një cap i deklaruar që engine-i do ta injoronte është
 * bllokues, jo warning.
 */
function capApplicabilityIssues(row, caps) {
  const basis = clean(row.pediatric_dose_basis);
  const hasSchedule = positive(row.pediatric_doses_per_day) !== null
    || positive(row.pediatric_interval_hours) !== null;
  const singleSpecified = caps.status.maxSingle === CAP_STATUS.SPECIFIED;
  const dailySpecified = caps.status.maxDaily === CAP_STATUS.SPECIFIED;
  const issues = [];

  if (PER_DOSE_BASIS.has(basis) && dailySpecified && !hasSchedule) {
    issues.push(
      'Kufiri ditor është i regjistruar, por frekuenca mungon; engine-i nuk mund ta nxjerrë dozën në 24 orë dhe nuk lejohet ta injorojë këtë kufi.',
    );
  }

  if (CONTINUOUS_RATE_BASIS.has(basis) && singleSpecified) {
    issues.push(
      'Kufiri për dozë është i regjistruar për një infuzion të vazhdueshëm; kjo skemë nuk prodhon dozë të vetme ku ai kufi mund të zbatohet.',
    );
  }

  return issues;
}

/**
 * @param {object} row  rreshti i `public.drugs` me fushat `pediatric_*`
 * @returns {{readiness:string, reasons:string[], warnings:string[], missing:string[],
 *   requires:object, caps:object, volume:object}}
 */
function classify(row = {}) {
  /* `reasons` bllokon: sa herë ka një arsye, regjimi nuk llogaritet.
     `warnings` nuk bllokon — janë ato që mjeku duhet t'i shohë patjetër te
     rezultati, po që nuk e ndalojnë llogaritjen. Ndarja është e qëllimshme:
     një bar "KUFIZUAR" llogaritet normalisht, thjesht kurrë pa kufizimin e vet
     në ekran. */
  const reasons = [];
  const warnings = [];
  const missing = [];
  const caps = capsOf(row);

  const blocked = blockingStatus(row.pediatric_use_status);
  if (blocked) {
    const status = clean(row.pediatric_use_status) || 'PA TË DHËNA';
    reasons.push(`Statusi pediatrik është "${status}".`);
    const restriction = clean(row.pediatric_restriction);
    if (restriction) reasons.push(restriction);
    return {
      readiness:blocked,
      reasons,
      warnings,
      missing,
      requires:{ weight:false, age:false, height:false, indication:false },
      caps,
      volume:volumeCapability(row),
    };
  }

  /* Kufizimi shoqëron barin edhe kur përdorimi lejohet — p.sh. "KUFIZUAR:
     vetëm në spital". Kalon si paralajmërim që të shfaqet me rezultatin. */
  const restriction = clean(row.pediatric_restriction);
  if (restriction) warnings.push(restriction);

  const basis = clean(row.pediatric_dose_basis);
  const doseMin = numeric(row.pediatric_dose_min);
  const doseMax = numeric(row.pediatric_dose_max);
  const doseUnit = clean(row.pediatric_dose_unit);
  const perDay = numeric(row.pediatric_doses_per_day);
  const intervalHours = numeric(row.pediatric_interval_hours);
  const verification = clean(row.pediatric_verification_status);

  if (!basis) missing.push('pediatric_dose_basis');
  if (doseMin === null) missing.push('pediatric_dose_min');
  if (!doseUnit) missing.push('pediatric_dose_unit');

  /* Bandat e peshës nuk reduktohen në formulë me këto fusha. */
  if (BAND_BASIS.has(basis)) {
    reasons.push('Dozimi është me banda peshe; struktura e bandave nuk mbahet nga projeksioni typed.');
    return {
      readiness:STATUS.TEXT_ONLY,
      reasons,
      warnings,
      missing,
      requires:{ weight:true, age:false, height:false, indication:false },
      caps,
      volume:volumeCapability(row),
    };
  }

  /* Doza ditore pa numrin e dozave ose intervalin nuk jep dozë të vetme. */
  if (DAILY_BASIS.has(basis) && perDay === null && intervalHours === null) {
    missing.push('pediatric_doses_per_day|pediatric_interval_hours');
    reasons.push('Doza është për ditë, po mungon numri i dozave dhe intervali, prandaj doza e vetme nuk nxirret.');
  }

  const knownBasis = WEIGHT_BASIS.has(basis) || BSA_BASIS.has(basis) || FIXED_BASIS.has(basis);
  if (basis && !knownBasis) {
    reasons.push(`Baza e dozës "${basis}" nuk është në listën e lejuar.`);
  }

  if (doseMin !== null && doseMax !== null && doseMax < doseMin) {
    reasons.push('Doza maksimale është më e vogël se minimalja.');
  }

  /* Çdo cap i konfiguruar pjesërisht, me semantikë të papajtueshme ose pa një
     shteg real në engine është bllokues. Asnjë kufi i deklaruar nuk lejohet të
     injorohet në heshtje. */
  reasons.push(...caps.issues);
  reasons.push(...capApplicabilityIssues(row, caps));

  /*
   * Dozat sipas kg ose m² rriten bashkë me pacientin. Pa asnjë tavan të
   * dokumentuar nuk mund ta dallojmë "burimi thotë se s'ka maksimum" nga
   * "maksimumi mungon në dataset". Derisa të kemi një status eksplicit nga
   * burimi, mungesa trajtohet konservativisht si e paverifikuar dhe formula
   * mbetet vetëm tekst. Doza fikse nuk ka këtë problem shkallëzimi.
   */
  const scalable = WEIGHT_BASIS.has(basis) || BSA_BASIS.has(basis);
  const hasVerifiedCap = caps.status.maxSingle === CAP_STATUS.SPECIFIED
    || caps.status.maxDaily === CAP_STATUS.SPECIFIED;
  if (scalable && !hasVerifiedCap && caps.issues.length === 0) {
    reasons.push(
      'Dozimi shkallëzohet sipas pacientit, por nuk ka asnjë kufi maksimal të dokumentuar. '
      + 'Derisa mungesa e tavanit të verifikohet në burim, llogaritja automatike mbetet e çaktivizuar.',
    );
  }

  /* Kontrata klinike kërkon regjim të verifikuar dhe me burim. Një regjim
     "in_review" ose "needs_source" mund të jetë i saktë, po nuk e ka ende atë
     garanci — prandaj mbetet tekst, jo formulë. */
  const verified = verification === 'verified';
  if (!verified) {
    reasons.push(`Statusi i verifikimit është "${verification || 'i papërcaktuar'}", jo "verified".`);
  }

  const requires = {
    /* Sipërfaqja trupore kërkon të dyja: formula e Mosteller-it është
       √(gjatësi × peshë / 3600). */
    weight:WEIGHT_BASIS.has(basis) || BSA_BASIS.has(basis),
    height:BSA_BASIS.has(basis),
    age:numeric(row.pediatric_min_age_value) !== null || numeric(row.pediatric_max_age_value) !== null,
    indication:Boolean(clean(row.pediatric_indication)),
  };

  const ready = knownBasis && missing.length === 0 && reasons.length === 0;
  return {
    readiness:ready ? STATUS.CALCULATOR_READY : STATUS.TEXT_ONLY,
    reasons,
    warnings,
    missing,
    requires,
    caps,
    volume:volumeCapability(row),
  };
}

/* Përmbledhje për auditin e barnave: numëron secilën kategori dhe i grupon
   arsyet, që të dihet çka duhet plotësuar në Master Sheet. */
function summarize(rows = []) {
  const counts = Object.fromEntries(Object.values(STATUS).map(key => [key, 0]));
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
  STATUS,
  CAP_STATUS,
  classify,
  summarize,
  _test:{ blockingStatus, volumeCapability, capsOf, capState, capApplicabilityIssues, numeric },
};
