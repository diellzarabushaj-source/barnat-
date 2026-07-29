const assert = require('node:assert/strict');
const Api = require('../api/prescription-dosage-context.js');

const T = Api._test;

const adult = T.parseContext({ population:'adult', category:'ENTERAL', route:'PO' });
assert.equal(adult.valid, true);
assert.equal(adult.population, 'adult');
assert.equal(adult.category, 'ENTERAL');

const legacyAdult = T.parseContext({ population:'adult', parenteral:'false' });
assert.equal(legacyAdult.valid, true);
assert.equal(legacyAdult.route, 'PO');

const missingParenteralRoute = T.parseContext({ population:'adult', category:'PARENTERAL' });
assert.equal(missingParenteralRoute.valid, false);
assert.match(missingParenteralRoute.errors[0], /rrugë të vlefshme/);

const child = T.parseContext({ population:'pediatric', category:'PARENTERAL', route:'IV', ageMonths:'48', weightKg:'18' });
assert.equal(child.valid, true);
assert.deepEqual(child.patient, { ageMonths:48, weightKg:18 });

const invalidCategoryRoute = T.parseContext({ population:'adult', category:'TOPICAL_LOCAL', route:'IV' });
assert.equal(invalidCategoryRoute.valid, false);

const rows = {
  adult:[
    { regimenId:'adult-po', form:'Tableta', route:'PO', practicalUnit:'tabletë', unitCount:'1', frequency:'çdo 8 orë', duration:'3 ditë' },
    { regimenId:'adult-top', form:'Cream', route:'TOP', practicalUnit:'shtresë e hollë', frequency:'2 herë në ditë', duration:'5 ditë' },
    { regimenId:'adult-im', form:'Ampulë', route:'IM', practicalUnit:'ampulë', unitCount:'1', frequency:'1 herë në ditë', duration:'3 ditë' },
    { regimenId:'adult-ambiguous', form:'Ampulë', route:'IM/IV', practicalUnit:'ampulë', unitCount:'1', frequency:'1 herë në ditë', duration:'3 ditë' },
  ],
  pediatric:[
    { regimenId:'ped-iv-exact', form:'Flakon', route:'IV', concentration:'100 mg/1 mL', mgPerKg:10, basis:'dozë', dosesPerDay:2, minAgeMonths:3, maxAgeMonths:144, frequency:'çdo 12 orë', duration:'5 ditë' },
    { regimenId:'ped-iv-range', form:'Flakon', route:'IV', concentration:'40 mg/1 mL', mgPerKgMin:4, mgPerKgMax:20, basis:'dozë', dosesPerDay:1, minAgeMonths:0, maxAgeMonths:216, indication:'Rrezik për jetën' },
  ],
  forms:[], cards:[], meta:{ dataSource:'neon' },
};

const topical = T.contextualize(rows, T.parseContext({ population:'adult', category:'TOPICAL_LOCAL', route:'TOP' }));
assert.deepEqual(topical.adult.map(item => item.regimenId), ['adult-top']);
assert.equal(topical.meta.administrationCategory, 'TOPICAL_LOCAL');

const adultIm = T.contextualize(rows, T.parseContext({ population:'adult', category:'PARENTERAL', route:'IM' }));
assert.deepEqual(adultIm.adult.map(item => item.regimenId), ['adult-im', 'adult-ambiguous']);
assert.equal(adultIm.adult.every(item => item.serverContextVerified === true), true);
assert.equal(adultIm.adult.every(item => item.route === 'IM'), true);
assert.match(adultIm.adult[0].serverSignature, /1 ampulë/);

const adultIv = T.contextualize(rows, T.parseContext({ population:'adult', category:'PARENTERAL', route:'IV' }));
assert.deepEqual(adultIv.adult.map(item => item.regimenId), ['adult-ambiguous']);
assert.equal(adultIv.adult[0].route, 'IV');

const pediatricIv = T.contextualize(rows, child);
assert.equal(pediatricIv.adult.length, 0);
assert.deepEqual(pediatricIv.pediatric.map(item => item.regimenId), ['ped-iv-exact', 'ped-iv-range']);
const exact = pediatricIv.pediatric.find(item => item.regimenId === 'ped-iv-exact');
assert.equal(exact.serverCalculation.status, 'calculated');
assert.equal(exact.serverCalculation.perDoseMg, 180);
assert.equal(exact.serverCalculation.perDoseMl, 1.8);
assert.match(exact.serverSignature, /1,8 mL/);
const range = pediatricIv.pediatric.find(item => item.regimenId === 'ped-iv-range');
assert.equal(range.serverCalculation.status, 'range-calculated');
assert.equal(range.serverDoseRange, '72–360 mg · 1,8–9 mL');
assert.equal(range.serverSignature, '');
assert.equal(range.serverRequiresDoseSelection, true);
assert.equal(pediatricIv.meta.rangePolicy, 'CALCULATE_RANGE_REQUIRE_CLINICIAN_SELECTION');

console.log('Prescription dosage context API tests passed.');
