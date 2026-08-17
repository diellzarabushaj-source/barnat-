'use strict';

/* Klasifikuesi i gatishmërisë së kalkulatorit pediatrik.
 *
 * Ky është seksioni 17 i planit: ndarja e çdo regjimi në CALCULATOR_READY,
 * TEXT_ONLY, NOT_RECOMMENDED, CONTRAINDICATED ose INSUFFICIENT_DATA. Është hapi
 * i parë sepse gjithçka tjetër varet prej tij — dhe sepse ai e ndalon gabimin
 * më të rrezikshëm që mund të bëjë një kalkulator klinik: ta detyrojë çdo tekst
 * dozimi të bëhet formulë.
 *
 * Funksion i pastër mbi 30 fushat typed. Nuk lexon tekst të lirë, nuk merr me
 * mend, nuk prek rrjetin. E njëjta hyrje jep gjithmonë të njëjtën dalje, që
 * auditi i barnave 1–300 të jetë i riprodhueshëm.
 *
 * Rregulli i kontratës (`data/pediatric-master-contract.json`):
 *   "Never infer pediatric dose from product strength or concentration."
 * Prandaj asnjë degë këtu nuk e nxjerr dozën nga fortësia e produktit. Nëse
 * fushat e dozimit mungojnë, përgjigjja është TEXT_ONLY — kurrë një hamendje.
 */

const STATUS = Object.freeze({
  CALCULATOR_READY:'CALCULATOR_READY',
  TEXT_ONLY:'TEXT_ONLY',
  NOT_RECOMMENDED:'NOT_RECOMMENDED',
  CONTRAINDICATED:'CONTRAINDICATED',
  INSUFFICIENT_DATA:'INSUFFICIENT_DATA',
});

/* Bazat e dozimit që kërkojnë peshën e fëmijës. */
const WEIGHT_BASIS = new Set(['kg/dozë', 'kg/ditë', 'kg/orë', 'kg/min']);
/* Bazat që kërkojnë sipërfaqen trupore, pra edhe gjatësinë. */
const BSA_BASIS = new Set(['m²/dozë', 'm²/ditë']);
/* Doza fikse nuk kërkon as peshë as gjatësi. */
const FIXED_BASIS = new Set(['dozë fikse']);
/* Bandat e peshës kërkojnë një strukturë me kufij dhe doza për bandë, të cilën
   projeksioni prej 30 fushash nuk e mban. Prandaj mbeten tekst derisa të
   modelohen si regjime të veçanta. */
const BAND_BASIS = new Set(['bandë peshe']);

/* Bazat ku doza është për ditë dhe duhet pjesëtuar për të nxjerrë dozën e
   vetme; pa numrin e dozave ose intervalin nuk pjesëtohet dot. */
const DAILY_BASIS = new Set(['kg/ditë', 'm²/ditë']);

const clean = value => String(value ?? '').trim();

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
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

/* Kufijtë e sigurisë. Nuk e vendosin gatishmërinë — mungesa e tyre është
   paralajmërim, jo bllokues — po Faza 7 i lexon prej këtu. */
function capsOf(row) {
  return {
    maxSingle:numeric(row.pediatric_max_single_value),
    maxSingleUnit:clean(row.pediatric_max_single_unit) || null,
    maxDaily:numeric(row.pediatric_max_daily_value),
    maxDailyUnit:clean(row.pediatric_max_daily_unit) || null,
  };
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
     në ekran. Po t'i fusnim bashkë, çdo kufizim do ta shndërronte barin në
     tekst dhe kalkulatori do të zbrazej pikërisht atje ku duhet më shumë. */
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
    reasons.push('Dozimi është me banda peshe; struktura e bandave nuk mbahet nga projeksioni prej 30 fushash.');
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

  /* Kontrata klinike kërkon regjim të verifikuar dhe me burim. Një regjim
     "in_review" ose "needs_source" mund të jetë i saktë, po nuk e ka ende atë
     garanci — prandaj mbetet tekst, jo formulë. Nëse dëshiron ta zbutësh këtë,
     ky është vendi i vetëm ku ndryshon. */
  const verified = verification === 'verified';
  if (!verified) {
    reasons.push(`Statusi i verifikimit është "${verification || 'i papërcaktuar'}", jo "verified".`);
  }

  /* Dozimi sipas peshës pa tavan është rreziku klasik: formula që është e saktë
     për një foshnjë 6 kg jep dozë mbi atë të të rriturit për një adoleshent 60
     kg. Nuk e bllokon llogaritjen — kufiri mund të mos ekzistojë vërtet — po
     mjeku duhet ta dijë se nuk ka tavan për ta kapur atë rast. */
  if (WEIGHT_BASIS.has(basis) && caps.maxSingle === null && caps.maxDaily === null) {
    warnings.push('Doza është sipas peshës po nuk ka kufi maksimal të regjistruar; kontrollo dozën e të rriturit te pacientët e rëndë.');
  }

  const requires = {
    /* Sipërfaqja trupore kërkon të dyja: formula e Mosteller-it është
       √(gjatësi × peshë / 3600). Prandaj `m²/dozë` e kërkon peshën po aq sa
       `kg/dozë` — po ta linim vetëm gjatësinë, forma e pacientit te Faza 4 nuk
       do të mblidhte dot atë që i duhet formulës. */
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

/* Përmbledhje për auditin e barnave 1–300: numëron secilën kategori dhe i
   grupon arsyet, që të dihet çka duhet plotësuar në Master Sheet. */
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
  classify,
  summarize,
  _test:{ blockingStatus, volumeCapability, capsOf, numeric },
};
