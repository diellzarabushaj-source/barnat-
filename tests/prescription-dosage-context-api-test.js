const assert = require('node:assert/strict');
const Api = require('../api/prescription-dosage-context.js');

const T = Api._test;

assert.deepEqual(T.routeTokens('IM/IV'), ['IV', 'IM']);
assert.equal(T.isParenteral({ form:'Ampulë', route:'' }), true);
assert.equal(T.isParenteral({ form:'Tableta', route:'PO' }), false);

const adult = T.parseContext({ population:'adult', parenteral:'false' });
assert.equal(adult.valid, true);
assert.equal(adult.population, 'adult');

const missingRoute = T.parseContext({ population:'adult', parenteral:'true' });
assert.equal(missingRoute.valid, false);
assert.match(missingRoute.errors[0], /IV, IM ose SC/);

const child = T.parseContext({ population:'pediatric', parenteral:'true', route:'IV', ageMonths:'48', weightKg:'18' });
assert.equal(child.valid, true);
assert.deepEqual(child.patient, { ageMonths:48, weightKg:18 });

const invalidChild = T.parseContext({ population:'pediatric', parenteral:'false', ageMonths:'300', weightKg:'0.2' });
assert.equal(invalidChild.valid, false);
assert.equal(invalidChild.errors.length, 2);

const rows = {
  adult:[
    { regimenId:'adult-po', form:'Tableta', route:'PO', practicalUnit:'tabletë', unitCount:'1', frequency:'çdo 8 orë', duration:'3 ditë' },
    { regimenId:'adult-im', form:'Ampulë', route:'IM', practicalUnit:'ampulë', unitCount:'1', frequency:'1 herë në ditë', duration:'3 ditë' },
    { regimenId:'adult-ambiguous', form:'Ampulë', route:'IM/IV', practicalUnit:'ampulë', unitCount:'1', frequency:'1 herë në ditë', duration:'3 ditë' },
  ],
  pediatric:[
    { regimenId:'ped-iv', form:'Flakon', route:'IV', concentration:'100 mg/1 mL', mgPerKg:10, basis:'dozë', dosesPerDay:2, minAgeMonths:3, maxAgeMonths:144, frequency:'çdo 12 orë', duration:'5 ditë' },
  ],
  forms:[], cards:[], meta:{ dataSource:'neon' },
};

const adultIm = T.contextualize(rows, T.parseContext({ population:'adult', parenteral:'true', route:'IM' }));
assert.deepEqual(adultIm.adult.map(item => item.regimenId), ['adult-im']);
assert.equal(adultIm.adult[0].serverContextVerified, true);
assert.match(adultIm.adult[0].serverSignature, /1 ampulë/);
assert.equal(adultIm.pediatric.length, 0);

const pediatricIv = T.contextualize(rows, child);
assert.equal(pediatricIv.adult.length, 0);
assert.deepEqual(pediatricIv.pediatric.map(item => item.regimenId), ['ped-iv']);
assert.equal(pediatricIv.pediatric[0].serverCalculation.status, 'calculated');
assert.equal(pediatricIv.pediatric[0].serverCalculation.perDoseMg, 180);
assert.match(pediatricIv.pediatric[0].serverSignature, /180 mg/);
assert.equal(pediatricIv.meta.clinicalContextApplied, true);
assert.equal(pediatricIv.meta.route, 'IV');

console.log('Prescription dosage context API tests passed.');
