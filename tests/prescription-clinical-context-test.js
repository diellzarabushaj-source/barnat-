const assert = require('node:assert/strict');
const Context = require('../prescription-registry-bridge.js');

assert.equal(Context.normalizeRoute('intravenoz'), 'IV');
assert.deepEqual(Context.routeTokens('IM/IV'), ['IV', 'IM']);
assert.equal(Context.ageMonthsFrom('4.5', 'years'), 54);

const invalidChild = Context.validateContext({ pediatric:true });
assert.equal(invalidChild.valid, false);
assert.deepEqual(invalidChild.missing.sort(), ['age', 'weight']);
const validChild = Context.validateContext({ pediatric:true, ageValue:'4', ageUnit:'years', weightKg:'18' });
assert.equal(validChild.valid, true);
assert.deepEqual(Context.patientFromContext(validChild.context), { ageMonths:48, weightKg:18 });

const regimens = [
  { regimenId:'adult-po', population:'adult', form:'Tableta', route:'PO' },
  { regimenId:'adult-iv', population:'adult', form:'Ampulë', route:'IV' },
  { regimenId:'adult-im', population:'adult', form:'Ampulë', route:'IM' },
  { regimenId:'ped-po', _medindexPopulation:'pediatric', form:'Sirup', route:'PO', mgPerKg:10 },
  { regimenId:'ped-iv', _medindexPopulation:'pediatric', form:'Flakon', route:'IV', mgPerKg:10 },
];
assert.deepEqual(Context.filterRegimens(regimens, {}).map(item => item.regimenId), ['adult-po']);
assert.deepEqual(Context.filterRegimens(regimens, { parenteral:true, route:'IM' }).map(item => item.regimenId), ['adult-im']);
assert.deepEqual(Context.filterRegimens(regimens, { pediatric:true, parenteral:true, route:'IV', ageValue:'4', weightKg:'18' }).map(item => item.regimenId), ['ped-iv']);

const decorated = Context.decorateDosagePayload({ adult:[{ regimenId:'a' }], pediatric:[{ regimenId:'p' }] });
assert.deepEqual(decorated.adult.map(item => item._medindexPopulation), ['adult', 'pediatric']);

const engine = {
  decideMatch(drug, list, options) {
    return { status:list.length === 1 ? 'auto' : 'manual', regimen:list[0], population:options.population, patient:options.patient };
  },
  prescriptionTransfer(drug, regimen, population, calculation) {
    if (!regimen) return { substance:drug.substance, dosageStatus:'manual', dosagePopulation:population };
    const amount = calculation?.perDoseMl ? `${calculation.perDoseMl} mL` : regimen.unitCount ? `${regimen.unitCount} ${regimen.practicalUnit}` : '';
    return {
      substance:drug.substance,
      dosageStatus:'auto-filled',
      dosagePopulation:population,
      route:regimen.route,
      signatura:`${population === 'pediatric' ? 'Jepen' : 'Merret'} ${amount} ${regimen.route} ${regimen.frequency} për ${regimen.duration}.`,
      warnings:'',
    };
  },
  calculatePediatricDose(regimen, patient) {
    return { status:'calculated', perDoseMl:(regimen.mgPerKg * patient.weightKg / regimen.dosesPerDay) / regimen.mgPerMl, cappedBy:[] };
  },
};
const decision = Context.decideForContext(engine, {}, regimens, { parenteral:true, route:'IM' });
assert.equal(decision.status, 'auto');
assert.equal(decision.regimen.regimenId, 'adult-im');

const transfer = Context.transferForContext(engine, { substance:'Ceftriaxone' }, {
  population:'pediatric', form:'Flakon', route:'IV', mgPerKg:50, dosesPerDay:2, mgPerMl:100, frequency:'çdo 12 orë', duration:'5 ditë',
}, { pediatric:true, parenteral:true, route:'IV', ageValue:'4', ageUnit:'years', weightKg:'18' });
assert.equal(transfer.dosagePopulation, 'pediatric');
assert.equal(transfer.route, 'IV');
assert.match(transfer.signatura, /^Administrohet/);
assert.match(transfer.signatura, /4\.5 mL/);

console.log('Prescription clinical context tests passed.');
