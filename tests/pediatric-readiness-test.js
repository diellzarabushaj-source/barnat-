'use strict';

/* Porta e Fazës 1: rregulli që vendos cili regjim pediatrik bëhet kalkulator.
 *
 * Ky test nuk prek Neon-in. Auditi i barnave 1–300 xhirohet me kredencialet e
 * prodhimit; ajo që mbrohet këtu është *rregulli* me të cilin ai audit numëron,
 * që rezultati i tij të mos ndryshojë pa u parë. Çdo degë e klasifikuesit ka
 * këtu një rresht shembull, i shkruar me emrat e vërtetë të fushave nga
 * `data/pediatric-master-contract.json`.
 *
 * Rregulli klinik i kontratës — "Never infer pediatric dose from product
 * strength or concentration" — mbrohet nga dy raste: një rresht me përqendrim
 * po pa dozë mbetet TEXT_ONLY, dhe një rresht me dozë po pa përqendrim mbetet
 * CALCULATOR_READY. Përqendrimi shndërron njësinë; kurrë nuk e krijon dozën.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { STATUS, classify, summarize, _test } = require('../lib/pediatric-readiness.js');
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pediatric-master-contract.json'), 'utf8'));

/* Një regjim i plotë dhe i verifikuar: paracetamol oral sipas peshës. Të gjitha
   rastet e tjera janë ky rresht me një fushë të prishur, që dallimi të jetë
   gjithmonë vetëm ai që po testohet. */
const READY_ROW = Object.freeze({
  pediatric_indication:'Ethe dhe dhimbje',
  pediatric_use_status:'LEJOHET',
  pediatric_min_age_value:3,
  pediatric_min_age_unit:'muaj',
  pediatric_dose_min:10,
  pediatric_dose_max:15,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/dozë',
  pediatric_doses_per_day:4,
  pediatric_interval_hours:6,
  pediatric_max_single_value:1000,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:4000,
  pediatric_max_daily_unit:'mg',
  pediatric_route:'oral',
  pediatric_concentration_value:120,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:5,
  pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://www.bnf.org/',
  pediatric_verified_at:'2026-08-01',
});

const withRow = patch => ({ ...READY_ROW, ...patch });

// ---------------------------------------------------------------- gatishmëria

const ready = classify(READY_ROW);
assert.equal(ready.readiness, STATUS.CALCULATOR_READY);
assert.deepEqual(ready.reasons, [], 'Një regjim i plotë nuk duhet të ketë asnjë arsye bllokuese.');
assert.deepEqual(ready.missing, []);
assert.deepEqual(ready.requires, { weight:true, height:false, age:true, indication:true });
assert.equal(ready.volume.canConvertToVolume, true);
assert.equal(ready.volume.perUnitValue, 24, '120 mg / 5 mL duhet të japë 24 mg për mL.');
assert.deepEqual(ready.caps, {
  maxSingle:1000, maxSingleUnit:'mg', maxDaily:4000, maxDailyUnit:'mg',
});

// Doza pa përqendrim mbetet e llogaritshme — thjesht nuk kthehet në mL.
const noConcentration = classify(withRow({
  pediatric_concentration_value:null,
  pediatric_concentration_unit:'',
  pediatric_concentration_per_value:null,
  pediatric_concentration_per_unit:'',
}));
assert.equal(noConcentration.readiness, STATUS.CALCULATOR_READY,
  'Përqendrimi shndërron njësinë, nuk e vendos gatishmërinë.');
assert.equal(noConcentration.volume.canConvertToVolume, false);

// Përqendrim pa dozë: pikërisht rasti që kontrata e ndalon të hamendësohet.
const strengthOnly = classify(withRow({ pediatric_dose_min:null, pediatric_dose_max:null }));
assert.equal(strengthOnly.readiness, STATUS.TEXT_ONLY);
assert.ok(strengthOnly.missing.includes('pediatric_dose_min'));
assert.equal(strengthOnly.volume.canConvertToVolume, true,
  'Përqendrimi lexohet, po nuk e prodhon dozën.');

// ------------------------------------------------------------ statuse bllokues

assert.equal(classify(withRow({ pediatric_use_status:'KUNDËRINDIKUAR' })).readiness, STATUS.CONTRAINDICATED);
assert.equal(classify(withRow({ pediatric_use_status:'NUK REKOMANDOHET' })).readiness, STATUS.NOT_RECOMMENDED);
assert.equal(classify(withRow({ pediatric_use_status:'PA TË DHËNA' })).readiness, STATUS.INSUFFICIENT_DATA);
assert.equal(classify(withRow({ pediatric_use_status:'NUK APLIKOHET' })).readiness, STATUS.INSUFFICIENT_DATA);
assert.equal(classify(withRow({ pediatric_use_status:'' })).readiness, STATUS.INSUFFICIENT_DATA);
assert.equal(classify({}).readiness, STATUS.INSUFFICIENT_DATA, 'Rreshti bosh nuk guxon të japë kalkulator.');

/* Statusi bllokues fiton mbi çdo numër: edhe një rresht me dozim të përsosur
   mbetet i ndaluar nëse përdorimi pediatrik është kundërindikuar. */
const contra = classify(withRow({
  pediatric_use_status:'KUNDËRINDIKUAR',
  pediatric_restriction:'Sindromi Reye te fëmijët nën 16 vjeç.',
}));
assert.equal(contra.readiness, STATUS.CONTRAINDICATED);
assert.ok(contra.reasons.some(reason => /KUNDËRINDIKUAR/.test(reason)));
assert.ok(contra.reasons.includes('Sindromi Reye te fëmijët nën 16 vjeç.'),
  'Kufizimi klinik duhet të mbërrijë te mjeku, jo të humbet me statusin.');
assert.deepEqual(contra.requires, { weight:false, age:false, height:false, indication:false },
  'Një bar i ndaluar nuk kërkon të dhëna pacienti.');

// Statuset e lejuara nuk bllokojnë.
for (const status of ['LEJOHET', 'KUFIZUAR']) {
  assert.equal(_test.blockingStatus(status), null, `${status} nuk duhet të bllokojë.`);
}

/* "KUFIZUAR" llogaritet, po kurrë pa kufizimin e vet në ekran. Kjo është arsyeja
   pse `warnings` është i ndarë nga `reasons`. */
const restricted = classify(withRow({
  pediatric_use_status:'KUFIZUAR',
  pediatric_restriction:'Vetëm në mjedis spitalor, nën monitorim.',
}));
assert.equal(restricted.readiness, STATUS.CALCULATOR_READY);
assert.deepEqual(restricted.reasons, []);
assert.ok(restricted.warnings.includes('Vetëm në mjedis spitalor, nën monitorim.'));

// ------------------------------------------------------------------ bazat e dozës

// Bandat e peshës nuk reduktohen dot në formulë me projeksionin prej 30 fushash.
const bands = classify(withRow({ pediatric_dose_basis:'bandë peshe' }));
assert.equal(bands.readiness, STATUS.TEXT_ONLY);
assert.ok(bands.reasons.some(reason => /banda peshe/i.test(reason)));
assert.equal(bands.requires.weight, true);

// Doza ditore pa numrin e dozave dhe pa interval nuk jep dozë të vetme.
const dailyBlind = classify(withRow({
  pediatric_dose_basis:'kg/ditë',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
}));
assert.equal(dailyBlind.readiness, STATUS.TEXT_ONLY);
assert.ok(dailyBlind.missing.includes('pediatric_doses_per_day|pediatric_interval_hours'));

// Njëri prej të dyve mjafton për ta ndarë dozën ditore.
assert.equal(
  classify(withRow({ pediatric_dose_basis:'kg/ditë', pediatric_interval_hours:null })).readiness,
  STATUS.CALCULATOR_READY,
  'Numri i dozave në ditë e ndan dozën ditore edhe pa interval.',
);
assert.equal(
  classify(withRow({ pediatric_dose_basis:'kg/ditë', pediatric_doses_per_day:null })).readiness,
  STATUS.CALCULATOR_READY,
  'Intervali e ndan dozën ditore edhe pa numrin e dozave.',
);

// Doza fikse nuk kërkon as peshë as gjatësi.
const fixed = classify(withRow({ pediatric_dose_basis:'dozë fikse' }));
assert.equal(fixed.readiness, STATUS.CALCULATOR_READY);
assert.equal(fixed.requires.weight, false);
assert.equal(fixed.requires.height, false);

/* Sipërfaqja trupore kërkon të dyja, sepse Mosteller-i është
   √(gjatësi × peshë / 3600). Kjo është arsyeja pse `requires` ekziston fare:
   forma e pacientit te Faza 4 ndërtohet prej saj, dhe një `weight:false` këtu
   do të prodhonte një formular që nuk e mbledh dot atë që i duhet formulës. */
const bsa = classify(withRow({ pediatric_dose_basis:'m²/dozë' }));
assert.equal(bsa.readiness, STATUS.CALCULATOR_READY);
assert.equal(bsa.requires.height, true);
assert.equal(bsa.requires.weight, true, 'BSA-ja llogaritet nga gjatësia dhe pesha bashkë.');

// Një bazë jashtë listës së kontratës nuk llogaritet kurrë.
const unknownBasis = classify(withRow({ pediatric_dose_basis:'për vezikë' }));
assert.equal(unknownBasis.readiness, STATUS.TEXT_ONLY);
assert.ok(unknownBasis.reasons.some(reason => /nuk është në listën e lejuar/.test(reason)));

/* Kontrata dhe klasifikuesi duhet të mbeten të lidhur: çdo bazë e lejuar në
   `pediatric-master-contract.json` duhet të ketë një trajtim këtu, ndryshe një
   bazë e re e shtuar nesër do të binte heshtazi te "jo e lejuar". */
for (const basis of contract.allowed.doseBasis) {
  const verdict = classify(withRow({
    pediatric_dose_basis:basis,
    pediatric_doses_per_day:4,
    pediatric_interval_hours:6,
  }));
  assert.ok(
    !verdict.reasons.some(reason => /nuk është në listën e lejuar/.test(reason)),
    `Baza e kontratës "${basis}" duhet të ketë trajtim të njohur te klasifikuesi.`,
  );
}

// -------------------------------------------------------------- fusha që mungojnë

const noBasis = classify(withRow({ pediatric_dose_basis:'' }));
assert.equal(noBasis.readiness, STATUS.TEXT_ONLY);
assert.ok(noBasis.missing.includes('pediatric_dose_basis'));

const noUnit = classify(withRow({ pediatric_dose_unit:'' }));
assert.equal(noUnit.readiness, STATUS.TEXT_ONLY);
assert.ok(noUnit.missing.includes('pediatric_dose_unit'));

// Vetëm minimumi mjafton: shumë regjime kanë një dozë të vetme, jo interval.
const singleDose = classify(withRow({ pediatric_dose_max:null }));
assert.equal(singleDose.readiness, STATUS.CALCULATOR_READY);
assert.deepEqual(singleDose.missing, [], 'Doza maksimale nuk është e detyrueshme.');

// Intervali i përmbysur është gabim të dhënash, jo regjim.
const inverted = classify(withRow({ pediatric_dose_min:15, pediatric_dose_max:10 }));
assert.equal(inverted.readiness, STATUS.TEXT_ONLY);
assert.ok(inverted.reasons.some(reason => /më e vogël se minimalja/.test(reason)));

// ------------------------------------------------------------------ verifikimi

for (const status of ['needs_source', 'in_review', 'not_applicable', '']) {
  const verdict = classify(withRow({ pediatric_verification_status:status }));
  assert.equal(verdict.readiness, STATUS.TEXT_ONLY,
    `Statusi i verifikimit "${status}" nuk guxon të prodhojë kalkulator.`);
  assert.ok(verdict.reasons.some(reason => /verifikimit/.test(reason)));
}
assert.ok(
  contract.allowed.verificationStatus.includes('verified'),
  'Kontrata duhet ta mbajë "verified" si statusin që e hap kalkulatorin.',
);

// ------------------------------------------------------- paralajmërimi i tavanit

const uncapped = classify(withRow({
  pediatric_max_single_value:null,
  pediatric_max_single_unit:'',
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:'',
}));
assert.equal(uncapped.readiness, STATUS.CALCULATOR_READY, 'Mungesa e tavanit nuk bllokon.');
assert.ok(uncapped.warnings.some(warning => /kufi maksimal/.test(warning)));
assert.deepEqual(ready.warnings, [], 'Një regjim me tavan nuk duhet të paralajmërojë.');

// --------------------------------------------------------------------- numrat

assert.equal(_test.numeric('12,5'), 12.5, 'Presja dhjetore e Master Sheet-it duhet lexuar.');
assert.equal(_test.numeric(''), null);
assert.equal(_test.numeric(null), null);
assert.equal(_test.numeric('rreth 10'), null, 'Teksti i lirë nuk kthehet në numër me hamendje.');
assert.equal(_test.numeric(0), 0);

assert.equal(
  _test.volumeCapability({
    pediatric_concentration_value:0,
    pediatric_concentration_unit:'mg',
    pediatric_concentration_per_value:5,
    pediatric_concentration_per_unit:'mL',
  }).canConvertToVolume,
  false,
  'Një përqendrim zero do të pjesëtonte me zero më vonë.',
);

// ------------------------------------------------------------- forma e auditit

const audit = summarize([
  READY_ROW,
  withRow({ pediatric_use_status:'KUNDËRINDIKUAR' }),
  withRow({ pediatric_use_status:'NUK REKOMANDOHET' }),
  withRow({ pediatric_dose_basis:'' }),
  withRow({ pediatric_dose_unit:'', pediatric_dose_basis:'' }),
  {},
  withRow({ pediatric_use_status:'KUFIZUAR', pediatric_restriction:'Vetëm në spital.' }),
]);
assert.equal(audit.total, 7);
assert.equal(audit.counts[STATUS.CALCULATOR_READY], 2);
assert.equal(audit.counts[STATUS.CONTRAINDICATED], 1);
assert.equal(audit.counts[STATUS.NOT_RECOMMENDED], 1);
assert.equal(audit.counts[STATUS.INSUFFICIENT_DATA], 1);
assert.equal(audit.counts[STATUS.TEXT_ONLY], 2);
assert.equal(audit.missingCounts.pediatric_dose_basis, 2);
assert.equal(audit.missingCounts.pediatric_dose_unit, 1);
assert.equal(audit.withWarnings, 1);
assert.equal(audit.results.length, 7);

/* I njëjti rresht duhet të japë gjithmonë të njëjtin verdikt: auditi i 1–300
   nuk ka kuptim nëse numërimi i sotëm nuk përsëritet nesër. */
assert.deepEqual(classify(READY_ROW), classify({ ...READY_ROW }));

/* Dhe klasifikuesi nuk guxon ta prekë rreshtin që i jepet — Faza 2 ia kalon
   drejtpërdrejt rreshtin e Neon-it. */
const snapshot = JSON.stringify(READY_ROW);
classify(READY_ROW);
assert.equal(JSON.stringify(READY_ROW), snapshot, 'Klasifikuesi nuk duhet ta modifikojë rreshtin.');

// Rregulli klinik nuk lejohet të lexohet prej fortësisë së produktit.
const source = fs.readFileSync(path.join(ROOT, 'lib/pediatric-readiness.js'), 'utf8');
assert.ok(
  !/\bstrength\b|fortes[ië]/i.test(source.replace(/Never infer pediatric dose[^\n]*/g, '').replace(/^\s*\*.*$/gm, '')),
  'Klasifikuesi nuk guxon të lexojë fortësinë e produktit për të nxjerrë dozën.',
);

console.log(
  'Pediatric readiness passed: 5 statuse, 8 baza doze sipas kontratës, verifikim i detyrueshëm, '
  + 'kufizimet ndahen nga bllokuesit, dhe përqendrimi kurrë nuk e prodhon dozën.',
);
