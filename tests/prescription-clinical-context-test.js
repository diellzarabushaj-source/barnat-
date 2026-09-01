const assert = require('node:assert/strict');
const Administration = require('../administration-routes.js');
const Context = require('../prescription-registry-bridge.js');
const InteractionFix = require('../prescription-interaction-fix.js');
const ContextApi = require('../lib/prescription-dosage-context-handler.js');
const Engine = require('../dosage-engine.js');

assert.equal(Administration.inferAdministration({ form:'Film-coated tablet' }).category, 'ENTERAL');
assert.deepEqual(Administration.inferAdministration({ form:'Film-coated tablet' }).routes, ['PO']);
assert.equal(Administration.inferAdministration({ form:'Powder for solution for injection' }).category, 'PARENTERAL');
assert.equal(Administration.inferAdministration({ form:'Cream for cutaneous use' }).route, 'TOP');
assert.equal(Administration.inferAdministration({ form:'Eye drops, solution' }).route, 'OPH');
assert.equal(Administration.inferAdministration({ form:'Metered dose inhaler' }).route, 'MDI');
assert.equal(Administration.normalizeRoute('intradermal'), 'ID');
assert.deepEqual(Administration.routeTokens('IV ose IM'), ['IV', 'IM']);

const defaultContext = Context.normalizeContext({});
assert.equal(defaultContext.administrationCategory, 'ENTERAL');
assert.equal(defaultContext.route, 'PO');
assert.equal(Context.validateContext(defaultContext).valid, true);

const incompleteParenteral = Context.validateContext({ administrationCategory:'PARENTERAL', route:'' });
assert.equal(incompleteParenteral.valid, false);
assert.deepEqual(incompleteParenteral.missing, ['route']);

const validChild = Context.validateContext({
  administrationCategory:'PARENTERAL', route:'IV', pediatric:true,
  ageValue:'4', ageUnit:'years', weightKg:'18',
});
assert.equal(validChild.valid, true);
assert.deepEqual(Context.patientFromContext(validChild.context), { ageMonths:48, weightKg:18 });

const regimens = [
  { regimenId:'adult-po', population:'adult', form:'Tableta', route:'PO' },
  { regimenId:'adult-top', population:'adult', form:'Cream', route:'TOP' },
  { regimenId:'adult-inh', population:'adult', form:'Inhaler', route:'MDI' },
  { regimenId:'adult-iv', population:'adult', form:'Ampulë', route:'IV' },
  { regimenId:'adult-ambiguous', population:'adult', form:'Ampulë', route:'IV/IM' },
  { regimenId:'ped-iv', _medindexPopulation:'pediatric', form:'Flakon', route:'IV', mgPerKg:10, basis:'dozë' },
];
assert.deepEqual(Context.filterRegimens(regimens, { administrationCategory:'ENTERAL', route:'PO' }).map(item => item.regimenId), ['adult-po']);
assert.deepEqual(Context.filterRegimens(regimens, { administrationCategory:'TOPICAL_LOCAL', route:'TOP' }).map(item => item.regimenId), ['adult-top']);
assert.deepEqual(Context.filterRegimens(regimens, { administrationCategory:'INHALATION', route:'MDI' }).map(item => item.regimenId), ['adult-inh']);
assert.deepEqual(Context.filterRegimens(regimens, { administrationCategory:'PARENTERAL', route:'IV' }).map(item => item.regimenId), ['adult-iv']);

const multiRouteForIv = InteractionFix.normalizeRegimensForContext(regimens, { administrationCategory:'PARENTERAL', route:'IV' });
assert.equal(multiRouteForIv.find(item => item.regimenId === 'adult-ambiguous').route, 'IV');
const multiRouteForIm = InteractionFix.normalizeRegimensForContext(regimens, { administrationCategory:'PARENTERAL', route:'IM' });
assert.equal(multiRouteForIm.find(item => item.regimenId === 'adult-ambiguous').route, 'IM');

const fakeControl = { closest:selector => selector ? fakeControl : null };
const composerOnlyDocument = {
  querySelector:() => null,
  getElementById:id => id === 'rxComposer' ? { value:'Rp: tekst manual' } : null,
};
const selectedDrugDocument = {
  querySelector:() => ({ className:'rx-drug-chip' }),
  getElementById:id => id === 'rxComposer' ? { value:'Rp: tekst manual' } : null,
};
assert.equal(InteractionFix.shouldTemporarilyReleaseComposer(composerOnlyDocument, fakeControl), true);
assert.equal(InteractionFix.shouldTemporarilyReleaseComposer(selectedDrugDocument, fakeControl), false);

const ivContext = ContextApi._test.parseContext({ category:'PARENTERAL', route:'IV' });
const imContext = ContextApi._test.parseContext({ category:'PARENTERAL', route:'IM' });
const scContext = ContextApi._test.parseContext({ category:'PARENTERAL', route:'SC' });
const ivImRegimen = { population:'adult', form:'Powder for solution for injection', route:'IV; IM' };
assert.equal(ContextApi._test.routeMatches(ivImRegimen, ivContext), true);
assert.equal(ContextApi._test.routeMatches(ivImRegimen, imContext), true);
assert.equal(ContextApi._test.routeMatches(ivImRegimen, scContext), false);

assert.equal(Context.compatibleDrug({ form:'Cream' }, { administrationCategory:'TOPICAL_LOCAL', route:'TOP' }).valid, true);
assert.equal(Context.compatibleDrug({ form:'Tablet' }, { administrationCategory:'PARENTERAL', route:'IV' }).valid, false);
assert.equal(Context.compatibleDrug({ form:'Injection', allowedRoutes:['IV', 'IM'] }, { administrationCategory:'PARENTERAL', route:'IM' }).valid, true);

const exactRegimen = {
  population:'pediatric', form:'Flakon', route:'IV', concentration:'100 mg/1 mL',
  mgPerKg:10, basis:'dozë', dosesPerDay:2, frequency:'çdo 12 orë', duration:'5 ditë',
};
const exactTransfer = Context.transferForContext(Engine, { substance:'Ceftriaxone', form:'Flakon' }, exactRegimen, {
  pediatric:true, administrationCategory:'PARENTERAL', route:'IV', ageValue:'4', ageUnit:'years', weightKg:'18',
});
assert.equal(exactTransfer.dosagePopulation, 'pediatric');
assert.equal(exactTransfer.route, 'IV');
assert.equal(exactTransfer.dosageStatus, 'auto-filled');
assert.match(exactTransfer.signatura, /^Administrohet/);
assert.match(exactTransfer.signatura, /1,8 mL/);

const rangeRegimen = {
  population:'pediatric', form:'Flakon', route:'IV', concentration:'40 mg/1 mL',
  mgPerKgMin:4, mgPerKgMax:20, basis:'dozë', dosesPerDay:1,
  indication:'Gjendje me rrezik për jetën', warnings:'Vetëm sipas protokollit specialistik.',
};
const rangeTransfer = Context.transferForContext(Engine, { substance:'Methylprednisolone', form:'Flakon' }, rangeRegimen, {
  pediatric:true, administrationCategory:'PARENTERAL', route:'IV', ageValue:'4', ageUnit:'years', weightKg:'18',
});
assert.equal(rangeTransfer.dosageStatus, 'requires-review');
assert.equal(rangeTransfer.signatura, '');
assert.equal(rangeTransfer.calculatedDoseRange, '72–360 mg · 1,8–9 mL');
assert.match(rangeTransfer.warnings, /indikacionit dhe protokollit/);

console.log('Prescription administration, interaction and pediatric calculator tests passed.');
