'use strict';

/* Fazat 5–7 — motori i llogaritjes, vëllimi dhe siguria.
 *
 * Testi është shkruar rreth pyetjes: cili gabim do të dëmtonte një fëmijë?
 * Prandaj çdo rast ka numra të verifikueshëm me dorë, jo pritje të kopjuara nga
 * dalja e kodit. Nëse një pohim këtu duket i çuditshëm, llogarite vetë — kjo
 * është pika.
 */

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { OUTCOME, calculate, _test } = require(path.join(ROOT, 'lib/pediatric-calculation.js'));
const { STATUS } = require(path.join(ROOT, 'lib/pediatric-readiness.js'));

/* Paracetamol suspension, 15 mg/kg për dozë, çdo 6 orë, 120 mg/5 mL. */
const PER_DOSE_ROW = Object.freeze({
  pediatric_use_status:'LEJOHET',
  pediatric_indication:'Ethe',
  pediatric_dose_min:15, pediatric_dose_max:15, pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/dozë',
  pediatric_doses_per_day:4,
  pediatric_max_single_value:1000, pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:4000, pediatric_max_daily_unit:'mg',
  pediatric_concentration_value:120, pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:5, pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://www.bnf.org/', pediatric_verified_at:'2026-08-01',
});

/* Amoksicilinë, 25–50 mg/kg/ditë e ndarë në 3 doza. */
const PER_DAY_ROW = Object.freeze({
  ...PER_DOSE_ROW,
  pediatric_dose_min:25, pediatric_dose_max:50,
  pediatric_dose_basis:'kg/ditë',
  pediatric_doses_per_day:3,
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
  pediatric_concentration_value:250, pediatric_concentration_per_value:5,
});

const patient = (weightKg, extra = {}) => ({ weightKg, ...extra });

// ------------------------------------------------------------ doza për dozë

/* 20 kg × 15 mg/kg = 300 mg për dozë; 4 doza = 1200 mg në ditë.
   300 mg ÷ 24 mg/mL = 12.5 mL. */
const simple = calculate(PER_DOSE_ROW, patient(20));
assert.equal(simple.outcome, OUTCOME.CALCULATED);
assert.equal(simple.isRange, false);
assert.equal(simple.perDose.min, 300);
assert.equal(simple.daily.min, 1200);
assert.equal(simple.dosesPerDay, 4);
assert.equal(simple.measure.min.amount, 12.5);
assert.equal(simple.measure.min.unit, 'mL');
assert.equal(simple.measure.min.kind, 'volume');
assert.deepEqual(simple.cappedBy, []);
assert.equal(simple.source.url, 'https://www.bnf.org/');

// ------------------------------------------------------------ doza për ditë

/* 18 kg: 25 mg/kg/ditë = 450 mg/ditë ÷ 3 = 150 mg për dozë.
   50 mg/kg/ditë = 900 mg/ditë ÷ 3 = 300 mg për dozë.
   Përqendrimi 250 mg/5 mL = 50 mg/mL, pra 3 mL deri 6 mL. */
const daily = calculate(PER_DAY_ROW, patient(18));
assert.equal(daily.outcome, OUTCOME.CALCULATED);
assert.equal(daily.isRange, true);
assert.equal(daily.daily.min, 450);
assert.equal(daily.daily.max, 900);
assert.equal(daily.perDose.min, 150);
assert.equal(daily.perDose.max, 300);
assert.equal(daily.measure.min.amount, 3);
assert.equal(daily.measure.max.amount, 6);

// Intervali zëvendëson numrin e dozave kur ai mungon: çdo 6 orë = 4 doza.
const byInterval = calculate(
  { ...PER_DAY_ROW, pediatric_doses_per_day:null, pediatric_interval_hours:6 },
  patient(18),
);
assert.equal(byInterval.dosesPerDay, 4);
assert.equal(byInterval.daily.min, 450, 'Doza ditore nuk varet nga ndarja.');
assert.equal(byInterval.perDose.min, 112.5, '450 ÷ 4 = 112.5');

/* Një interval që nuk e ndan ditën në pjesë të plota paralajmërohet: 24/7 orë
   nuk është skemë reale dhe zakonisht do të thotë e dhënë e gabuar. */
const oddInterval = calculate(
  { ...PER_DAY_ROW, pediatric_doses_per_day:null, pediatric_interval_hours:7 },
  patient(18),
);
assert.ok(oddInterval.warnings.some(w => /nuk është numër i plotë/.test(w)));

// ------------------------------------------------------------------ tavanet

/* 80 kg × 15 mg/kg = 1200 mg, mbi tavanin 1000 mg për dozë. Doza duhet të bjerë
   te 1000, dhe dita të rillogaritet prej saj: 4 × 1000 = 4000. */
const capped = calculate(PER_DOSE_ROW, patient(80));
assert.equal(capped.perDose.min, 1000);
assert.equal(capped.daily.min, 4000);
assert.ok(capped.cappedBy.includes('maxSingle'));
assert.ok(capped.warnings.some(w => /Doza e vetme u kufizua/.test(w)));

/* Tavani ditor duhet ta ulë edhe dozën e vetme, ndryshe katër doza "brenda
   kufirit" do ta kalonin prapë kufirin ditor. 15 mg/kg × 60 kg = 900 mg/dozë,
   nën tavanin e vetëm 1000; po 4 × 900 = 3600, mbi tavanin ditor 3000.
   Prandaj doza duhet të bjerë te 3000 ÷ 4 = 750. */
const dailyCapped = calculate({ ...PER_DOSE_ROW, pediatric_max_daily_value:3000 }, patient(60));
assert.equal(dailyCapped.daily.min, 3000);
assert.equal(dailyCapped.perDose.min, 750,
  'Tavani ditor duhet ta ulë edhe dozën e vetme, jo vetëm shumën.');
assert.ok(dailyCapped.cappedBy.includes('maxDaily'));

// ------------------------------------------------------- sipërfaqja trupore

/* BSA(Mosteller) për 30 kg dhe 130 cm = √(130 × 30 / 3600) = √1.08333 ≈ 1.0408.
   Me 100 mg/m²/dozë kjo jep ≈ 104.08 mg. */
const BSA_ROW = {
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'m²/dozë',
  pediatric_dose_min:100, pediatric_dose_max:100,
  pediatric_max_single_value:null, pediatric_max_daily_value:null,
};
const bsa = calculate(BSA_ROW, patient(30, { heightCm:130 }));
assert.equal(bsa.outcome, OUTCOME.CALCULATED);
assert.equal(bsa.bsa, 1.041, 'BSA rrumbullakohet te tri shifra dhjetore.');
assert.ok(Math.abs(bsa.perDose.min - 104.08) < 0.05, `Prisja ≈104.08, mora ${bsa.perDose.min}`);

// Pa gjatësi, BSA nuk llogaritet — dhe kërkohet, jo hamendësohet.
const bsaNoHeight = calculate(BSA_ROW, patient(30));
assert.equal(bsaNoHeight.outcome, OUTCOME.NEEDS_PATIENT_DATA);
assert.ok(bsaNoHeight.missing.includes('heightCm'));

// --------------------------------------------------------------- doza fikse

const FIXED_ROW = {
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'dozë fikse',
  pediatric_dose_min:250, pediatric_dose_max:250,
  pediatric_max_single_value:null, pediatric_max_daily_value:null,
};
const fixed = calculate(FIXED_ROW, {});
assert.equal(fixed.outcome, OUTCOME.CALCULATED, 'Doza fikse nuk kërkon pacient të matur.');
assert.equal(fixed.perDose.min, 250);
assert.equal(fixed.daily.min, 1000);

// --------------------------------------------------------- infuzion i vazhdueshëm

/* 0.1 mg/kg/orë te 20 kg = 2 mg/orë = 48 mg/ditë. Nuk ka "dozë e vetme". */
const INFUSION_ROW = {
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'kg/orë',
  pediatric_dose_min:0.1, pediatric_dose_max:0.1,
  pediatric_doses_per_day:null, pediatric_interval_hours:null,
  pediatric_max_single_value:null, pediatric_max_daily_value:null,
};
const infusion = calculate(INFUSION_ROW, patient(20));
assert.equal(infusion.outcome, OUTCOME.CALCULATED);
assert.equal(infusion.isRate, true);
assert.equal(infusion.ratePerHour.min, 2);
assert.equal(infusion.daily.min, 48);
assert.equal(infusion.perDose.min, null, 'Infuzioni nuk ka dozë të vetme.');
assert.ok(infusion.warnings.some(w => /infuzion i vazhdueshëm/.test(w)));

// Për minutë: 0.05 mg/kg/min te 10 kg = 0.5 mg/min = 30 mg/orë.
const perMinute = calculate(
  { ...INFUSION_ROW, pediatric_dose_basis:'kg/min', pediatric_dose_min:0.05, pediatric_dose_max:0.05 },
  patient(10),
);
assert.equal(perMinute.ratePerHour.min, 30);

/* Kur tavani ditor e kufizon infuzionin, shpejtësia duhet të bjerë bashkë me
   të. 20 kg × 0.1 = 2 mg/orë = 48 mg/ditë, mbi tavanin 24 mg. Dita bie te 24,
   dhe shpejtësia duhet të bëhet 1 mg/orë — ndryshe do të shfaqej një shpejtësi
   që, e mbajtur njëzet e katër orë, e kalon pikërisht tavanin që sapo u vu. */
const cappedInfusion = calculate({ ...INFUSION_ROW, pediatric_max_daily_value:24 }, patient(20));
assert.equal(cappedInfusion.daily.min, 24);
assert.equal(cappedInfusion.ratePerHour.min, 1,
  'Tavani ditor duhet ta ulë edhe shpejtësinë e infuzionit.');
assert.ok(cappedInfusion.cappedBy.includes('maxDaily'));

// ------------------------------------------------------- kufijtë e pacientit

const tooLight = calculate(PER_DOSE_ROW, patient(0.2));
assert.equal(tooLight.outcome, OUTCOME.OUT_OF_RANGE);
assert.ok(tooLight.reasons.some(r => /jashtë kufijve të besueshëm/.test(r)));

const tooHeavy = calculate(PER_DOSE_ROW, patient(200));
assert.equal(tooHeavy.outcome, OUTCOME.OUT_OF_RANGE);

const tooOld = calculate(
  { ...PER_DOSE_ROW, pediatric_min_age_value:1, pediatric_min_age_unit:'muaj' },
  patient(60, { ageValue:25, ageUnit:'vjet' }),
);
assert.equal(tooOld.outcome, OUTCOME.OUT_OF_RANGE);
assert.ok(tooOld.reasons.some(r => /18 vjet/.test(r)));

// ---------------------------------------------------------- kufijtë e skemës

const AGE_LIMITED = {
  ...PER_DOSE_ROW,
  pediatric_min_age_value:3, pediatric_min_age_unit:'muaj',
  pediatric_max_age_value:12, pediatric_max_age_unit:'vjet',
};
const tooYoung = calculate(AGE_LIMITED, patient(5, { ageValue:2, ageUnit:'muaj' }));
assert.equal(tooYoung.outcome, OUTCOME.OUT_OF_RANGE);
assert.ok(tooYoung.reasons.some(r => /nën minimumin e skemës/.test(r)));

const inBand = calculate(AGE_LIMITED, patient(20, { ageValue:5, ageUnit:'vjet' }));
assert.equal(inBand.outcome, OUTCOME.CALCULATED);

/* Mbi maksimumin e skemës po ende nën 18 vjet: ky është rasti që kontrolli i
   përgjithshëm i moshës nuk e kap, prandaj kërkon kufirin e vetë barit. */
const aboveScheme = calculate(AGE_LIMITED, patient(50, { ageValue:15, ageUnit:'vjet' }));
assert.equal(aboveScheme.outcome, OUTCOME.OUT_OF_RANGE);
assert.ok(aboveScheme.reasons.some(r => /kalon maksimumin e skemës/.test(r)));

/* Kur skema deklaron kufij moshe, mosha bëhet e detyrueshme. Kjo ishte një
   zgjedhje mes dy rregullave të mbrojtshme, dhe testi më detyroi ta bëja: e
   kisha shkruar si paralajmërim, po dega e paralajmërimit ishte e paarritshme,
   sepse `requires.age` bllokonte para saj. Nga të dyja, kjo është e sigurta —
   pa moshën, kufiri i moshës nuk kontrollohet dot fare. */
const ageUnknown = calculate(AGE_LIMITED, patient(20));
assert.equal(ageUnknown.outcome, OUTCOME.NEEDS_PATIENT_DATA);
assert.deepEqual(ageUnknown.missing, ['age']);
assert.equal(ageUnknown.requires.age, true, 'Formulari duhet ta dijë se mosha kërkohet.');

/* Kurse një bar pa kufij moshe nuk e kërkon fare. */
assert.equal(calculate(PER_DOSE_ROW, patient(20)).outcome, OUTCOME.CALCULATED);

const WEIGHT_LIMITED = { ...PER_DOSE_ROW, pediatric_min_weight_kg:10, pediatric_max_weight_kg:40 };
assert.equal(calculate(WEIGHT_LIMITED, patient(8)).outcome, OUTCOME.OUT_OF_RANGE);
assert.equal(calculate(WEIGHT_LIMITED, patient(45)).outcome, OUTCOME.OUT_OF_RANGE);
assert.equal(calculate(WEIGHT_LIMITED, patient(25)).outcome, OUTCOME.CALCULATED);

// ------------------------------------------------- çka nuk llogaritet fare

const contraindicated = calculate({ ...PER_DOSE_ROW, pediatric_use_status:'KUNDËRINDIKUAR' }, patient(20));
assert.equal(contraindicated.outcome, OUTCOME.NOT_CALCULABLE);
assert.equal(contraindicated.readiness, STATUS.CONTRAINDICATED);

const unverified = calculate({ ...PER_DOSE_ROW, pediatric_verification_status:'in_review' }, patient(20));
assert.equal(unverified.outcome, OUTCOME.NOT_CALCULABLE);
assert.equal(unverified.readiness, STATUS.TEXT_ONLY);

const bands = calculate({ ...PER_DOSE_ROW, pediatric_dose_basis:'bandë peshe' }, patient(20));
assert.equal(bands.outcome, OUTCOME.NOT_CALCULABLE);

const noWeight = calculate(PER_DOSE_ROW, {});
assert.equal(noWeight.outcome, OUTCOME.NEEDS_PATIENT_DATA);
assert.deepEqual(noWeight.missing, ['weightKg']);

// -------------------------------------------------------------- përqendrimi

/* Njësi e panjohur nuk shndërrohet: më mirë pa mL sesa me një mL të gabuar. */
const strangeUnit = calculate(
  { ...PER_DOSE_ROW, pediatric_concentration_per_unit:'njësi e panjohur' },
  patient(20),
);
assert.equal(strangeUnit.measure, null);
assert.equal(strangeUnit.perDose.min, 300, 'Doza mbetet e vlefshme edhe pa shndërrim.');

/* Format e ngurta: 500 mg për 1 tabletë, dozë 250 mg = 0.5 tabletë. */
const tablets = calculate({
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'dozë fikse',
  pediatric_dose_min:250, pediatric_dose_max:250,
  pediatric_concentration_value:500, pediatric_concentration_per_value:1,
  pediatric_concentration_per_unit:'tabletë',
  pediatric_max_single_value:null, pediatric_max_daily_value:null,
}, {});
assert.equal(tablets.measure.min.amount, 0.5);
assert.equal(tablets.measure.min.kind, 'solid');

/* Fortësia e produktit nuk përdoret kurrë: një rresht pa fusha përqendrimi po
   me `strength` të plotë nuk guxon të prodhojë mL. */
const strengthOnly = calculate({
  ...PER_DOSE_ROW,
  strength:'120 mg/5 mL',
  pediatric_concentration_value:null, pediatric_concentration_per_value:null,
  pediatric_concentration_unit:'', pediatric_concentration_per_unit:'',
}, patient(20));
assert.equal(strengthOnly.measure, null, 'Fortësia e produktit nuk guxon të bëhet përqendrim.');
assert.equal(strengthOnly.perDose.min, 300);

// -------------------------------------------------------- "Si u llogarit?"

const explained = calculate(PER_DAY_ROW, patient(18));
const labels = explained.steps.map(step => step.label);
assert.ok(labels.includes('Pesha'));
assert.ok(labels.includes('Skema e regjistruar'));
assert.ok(labels.includes('Doza në ditë'));
assert.ok(labels.includes('Përqendrimi'));
assert.equal(explained.steps.find(step => step.label === 'Pesha').value, 18);
assert.equal(explained.steps.find(step => step.label === 'Skema e regjistruar').value, '25–50');

const bsaSteps = calculate(BSA_ROW, patient(30, { heightCm:130 })).steps.map(step => step.label);
assert.ok(bsaSteps.includes('Gjatësia'));
assert.ok(bsaSteps.includes('Sipërfaqja trupore (Mosteller)'));

// ------------------------------------------------------------------ njësitë

assert.equal(_test.ageInDays(2, 'vjet'), 730.5);
assert.equal(_test.ageInDays(1, 'javë'), 7);
assert.equal(_test.ageInDays(3, 'muaj'), 91.3125);
assert.equal(_test.ageInDays(3, 'njësi e panjohur'), null, 'Njësi e panjohur moshe nuk hamendësohet.');
assert.equal(_test.ageInDays(-1, 'vjet'), null);
assert.equal(_test.ageInDays('', 'vjet'), null);

assert.equal(_test.bodySurfaceArea(30, 130).toFixed(4), '1.0408');
assert.equal(_test.bodySurfaceArea(0, 130), null);
assert.equal(_test.bodySurfaceArea(30, 0), null);

/* Rrumbullakimi: numrat nën 1 mbajnë tri shifra domethënëse, që një dozë
   0.0625 mg të mos bëhet 0.06 — 4% humbje te një bar ku 4% ka rëndësi. */
assert.equal(_test.round(0.0625), 0.0625);
assert.equal(_test.round(0.123456), 0.123);
assert.equal(_test.round(123.456), 123.46);
assert.equal(_test.round(0), 0);
assert.equal(_test.round(Number.NaN), null);

// ----------------------------------------------------- qëndrueshmëria e daljes

/* I njëjti bar dhe i njëjti pacient japin gjithmonë të njëjtin rezultat, dhe
   rreshti nuk preket — serveri ia kalon drejtpërdrejt rreshtin e Neon-it. */
const snapshot = JSON.stringify(PER_DOSE_ROW);
assert.deepEqual(calculate(PER_DOSE_ROW, patient(20)), calculate(PER_DOSE_ROW, patient(20)));
assert.equal(JSON.stringify(PER_DOSE_ROW), snapshot);

/* Dhe nuk pranon dozë nga jashtë: një "pacient" që mbart fusha dozimi nuk guxon
   ta ndryshojë rezultatin. Kjo është e njëjta mbrojtje si te API-ja, po një
   shtresë më poshtë — aty ku do ta kapte edhe një thirrës të pakujdesshëm. */
const injected = calculate(PER_DOSE_ROW, {
  weightKg:20,
  pediatric_dose_min:9999, pediatric_dose_max:9999,
  doseMin:9999, perDose:9999, pediatric_max_single_value:99999,
});
assert.equal(injected.perDose.min, 300, 'Hyrjet e pacientit nuk guxojnë ta zhvendosin dozën.');

console.log(
  'Pediatric calculation passed: për dozë, për ditë, BSA, dozë fikse dhe infuzion; tavanet ulin '
  + 'edhe dozën e vetme; kufijtë e moshës e peshës bllokojnë; përqendrimi shndërron vetëm nga fusha '
  + 'të typed-uara; dhe asnjë numër doze nuk hyn nga jashtë.',
);
