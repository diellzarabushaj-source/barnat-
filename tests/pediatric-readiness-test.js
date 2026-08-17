'use strict';

/* Porta e Fazës 1: rregulli që vendos cili regjim pediatrik bëhet kalkulator.
 *
 * Ky test nuk prek Neon-in. Auditi i barnave xhirohet me kredencialet e
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
const { STATUS, CAP_STATUS, classify, summarize, _test } = require('../lib/pediatric-readiness.js');
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
  maxSingle:1000,
  maxSingleUnit:'mg',
  maxDaily:4000,
  maxDailyUnit:'mg',
  status:{ maxSingle:CAP_STATUS.SPECIFIED, maxDaily:CAP_STATUS.SPECIFIED },
  issues:[],
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

// Bandat e peshës nuk reduktohen dot në formulë me projeksionin typed.
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

// Doza fikse nuk kërkon as peshë as gjatësi, dhe mund të jetë pa cap.
const fixed = classify(withRow({ pediatric_dose_basis:'dozë fikse' }));
assert.equal(fixed.readiness, STATUS.CALCULATOR_READY);
assert.equal(fixed.requires.weight, false);
assert.equal(fixed.requires.height, false);
const fixedUncapped = classify(withRow({
  pediatric_dose_basis:'dozë fikse',
  pediatric_max_single_value:null,
  pediatric_max_single_unit:'',
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:'',
}));
assert.equal(fixedUncapped.readiness, STATUS.CALCULATOR_READY,
  'Doza fikse nuk rritet me pacientin, prandaj mungesa e cap-it nuk bllokon vetvetiu.');

/* Sipërfaqja trupore kërkon të dyja, sepse Mosteller-i është
   √(gjatësi × peshë / 3600). */
const bsa = classify(withRow({ pediatric_dose_basis:'m²/dozë' }));
assert.equal(bsa.readiness, STATUS.CALCULATOR_READY);
assert.equal(bsa.requires.height, true);
assert.equal(bsa.requires.weight, true, 'BSA-ja llogaritet nga gjatësia dhe pesha bashkë.');

// Një bazë jashtë listës së kontratës nuk llogaritet kurrë.
const unknownBasis = classify(withRow({ pediatric_dose_basis:'për vezikë' }));
assert.equal(unknownBasis.readiness, STATUS.TEXT_ONLY);
assert.ok(unknownBasis.reasons.some(reason => /nuk është në listën e lejuar/.test(reason)));

/* Kontrata dhe klasifikuesi duhet të mbeten të lidhur: çdo bazë e lejuar në
   `pediatric-master-contract.json` duhet të ketë një trajtim këtu. */
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
assert.deepEqual(singleDose.missing, [], 'Doza maksimale e intervalit nuk është e detyrueshme.');

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

// ------------------------------------------------------- semantika e tavaneve

/* `NULL` nuk do të thotë më "s'ka maksimum". Për një dozë që rritet me kg/m²,
   dy cap-e bosh janë mungesë e paverifikuar dhe llogaritja mbyllet. */
const uncapped = classify(withRow({
  pediatric_max_single_value:null,
  pediatric_max_single_unit:'',
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:'',
}));
assert.equal(uncapped.readiness, STATUS.TEXT_ONLY, 'Mungesa e të dy tavaneve duhet të bllokojë dozimin sipas kg.');
assert.deepEqual(uncapped.caps.status, {
  maxSingle:CAP_STATUS.ABSENT,
  maxDaily:CAP_STATUS.ABSENT,
});
assert.ok(uncapped.reasons.some(reason => /nuk ka asnjë kufi maksimal të dokumentuar/.test(reason)));

// Një tavan i dokumentuar mjafton që mungesa e tjetrit të mos interpretohet si gabim.
const oneCap = classify(withRow({
  pediatric_max_single_value:null,
  pediatric_max_single_unit:'',
}));
assert.equal(oneCap.readiness, STATUS.CALCULATOR_READY);
assert.equal(oneCap.caps.status.maxSingle, CAP_STATUS.ABSENT);
assert.equal(oneCap.caps.status.maxDaily, CAP_STATUS.SPECIFIED);

// Gjysmë-cap nuk lejohet: vlera pa njësi ose njësia pa vlerë janë të paplota.
const incompleteCap = classify(withRow({ pediatric_max_single_unit:'' }));
assert.equal(incompleteCap.readiness, STATUS.TEXT_ONLY);
assert.equal(incompleteCap.caps.status.maxSingle, CAP_STATUS.INCOMPLETE);
assert.ok(incompleteCap.reasons.some(reason => /është i paplotë/.test(reason)));

// Periudha e cap-it duhet të përputhet me kolonën.
const wrongPeriod = classify(withRow({ pediatric_max_single_unit:'mg/ditë' }));
assert.equal(wrongPeriod.readiness, STATUS.TEXT_ONLY);
assert.equal(wrongPeriod.caps.status.maxSingle, CAP_STATUS.INVALID);
assert.ok(wrongPeriod.reasons.some(reason => /periudhë/.test(reason)));

// Dimensioni i cap-it duhet të jetë i njëjtë me njësinë e dozës.
const wrongDimension = classify(withRow({ pediatric_max_single_unit:'mL' }));
assert.equal(wrongDimension.readiness, STATUS.TEXT_ONLY);
assert.equal(wrongDimension.caps.status.maxSingle, CAP_STATUS.INVALID);
assert.ok(wrongDimension.reasons.some(reason => /nuk është kompatibil/.test(reason)));

// Zero nuk është një cap i vlefshëm dhe nuk duhet të injorohet në heshtje.
const zeroCap = classify(withRow({ pediatric_max_single_value:0 }));
assert.equal(zeroCap.readiness, STATUS.TEXT_ONLY);
assert.equal(zeroCap.caps.status.maxSingle, CAP_STATUS.INVALID);
assert.ok(zeroCap.reasons.some(reason => /vlerë pozitive/.test(reason)));
assert.deepEqual(ready.warnings, [], 'Një regjim me tavane të plota nuk duhet të paralajmërojë.');

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

/* I njëjti rresht duhet të japë gjithmonë të njëjtin verdikt. */
assert.deepEqual(classify(READY_ROW), classify({ ...READY_ROW }));

/* Dhe klasifikuesi nuk guxon ta prekë rreshtin që i jepet. */
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
  'Pediatric readiness passed: statuse klinike, baza doze, verifikim i detyrueshëm, '
  + 'cap completeness fail-closed, dhe përqendrimi kurrë nuk e prodhon dozën.',
);
