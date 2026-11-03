const assert = require('node:assert/strict');
const Core = require('../prescription-format-core.js');

const oralInput = `Rp:
Tab. Amoxicillin / Clavulanic acid 875 mg / 125 mg (Tableta)
Sasia: Scat. No I (Një kuti)
S (Signatura): Nga 1 tabletë çdo 12 orë (2 herë në ditë) pas ushqimit, për 7 ditë rresht.

Tab. Paracetamol 500 mg (Tableta)
Sasia: Scat. No I (Një kuti)
S (Signatura): Nga 1 tabletë çdo 8 orë sipas nevojës (nëse ka temperaturë mbi 38.5°C ose dhimbje).`;

const oral = Core.parse(oralInput, 'Infeksion respirator');
assert.ok(oral, 'Oral prescription should parse');
assert.equal(oral.sections.length, 2);
assert.equal(oral.sections[0].medications[0].name, 'Amoxicillin / Clavulanic acid');
assert.equal(oral.sections[0].medications[0].dose, '875 mg / 125 mg');
assert.equal(oral.sections[0].medications[0].form, 'Tableta');
assert.equal(oral.sections[0].medications[0].dispenseQuantity, 'Scat. No I (Një kuti)');
assert.equal(Core.formatText(oral), oralInput);
assert.equal((Core.formatText(oral).match(/^Rp:$/gm) || []).length, 1, 'canonical serializer must emit one Rp header');

const infusionInput = `Rp:
Inf. Sodium Chloride 0.9 % a 250ml
Amp. Ketoprofen 100 mg/2 ml
Amp. Ondansetron 4 mg/2 ml
Amp. Pantoprazol sodium 40 mg
S: Përzihen dhe administrohen së bashku në të njëjtin infuzion.`;

const infusion = Core.parse(infusionInput, 'Dhimbje akute me nauze');
assert.ok(infusion, 'Infusion should parse');
assert.equal(infusion.sections.length, 1);
assert.equal(infusion.sections[0].type, 'infusion');
assert.equal(infusion.sections[0].route, 'IV');
assert.equal(infusion.sections[0].medications.length, 4);
assert.equal(infusion.sections[0].sharedSignature, 'Përzihen dhe administrohen së bashku në të njëjtin infuzion.');
assert.equal(infusion.sections[0].medications.filter(item => item.individualSignature).length, 0);
const infusionText = Core.formatText(infusion);
assert.equal((infusionText.match(/S \(Signatura\):/g) || []).length, 1, 'Shared signature must appear once');
assert.match(infusionText, /Sodium Chloride 0\.9 % a 250 ml \(Infuzion\)/);
assert.doesNotMatch(infusionText, /Ketoprofen 100 mg\/2 ml\n\nAmpulë/, 'A shared infusion must remain one compact block');

const taggedDose = Core.parse(`Rp:
Paracetamol (Tableta)
Doza: 500 mg
Sasia: Scat. No I (Një kuti)
S (Signatura): Nga 1 tabletë sipas nevojës.`, 'Dhimbje');
assert.equal(taggedDose.sections[0].medications[0].dose, '500 mg', '@doza must attach to the previous medication');

const oneOralSignature = Core.parse(`Rp:
Amoxicillin 500 mg (Tableta)
Paracetamol 500 mg (Tableta)
S (Signatura): Nga 1 tabletë sipas nevojës.`, 'Test');
assert.equal(oneOralSignature.sections[0].sharedSignature, '', 'One oral signature must not silently apply to every oral drug');
assert.equal(oneOralSignature.sections[0].medications[0].individualSignature, '');
assert.equal(oneOralSignature.sections[0].medications[1].individualSignature, 'Nga 1 tabletë sipas nevojës.');

assert.equal(Core.selectedDrugLine({
  substance: 'Paracetamol',
  strength: '500 mg',
  form: 'Tablet',
}), 'Tab. Paracetamol 500 mg (Tableta)');
assert.equal(Core.selectedDrugLine({
  tradeName:'Panadol',
  strength:'500 mg',
  form:'Tablet',
}), '', 'the final prescription must never fall back to the trade name');
assert.equal(Core.prefixForForm('unknown form'), '', 'unknown forms must not be guessed');
assert.equal(Core.prefixForForm('Tabletë'), 'Tab.', 'normalized Albanian tablet label must resolve to Tab.');
assert.equal(Core.prefixForForm('Kapsulë'), 'Caps.', 'normalized Albanian capsule label must resolve to Caps.');
assert.equal(Core.prefixForForm('Ampulë'), 'Amp.', 'normalized Albanian ampoule label must resolve to Amp.');
assert.equal(Core.prefixForForm('Krem'), 'Cr.', 'cream must use Cr. consistently');
assert.equal(Core.prefixForForm('Spray'), 'Spr.', 'spray must use Spr. consistently');
assert.equal(Core.prefixForForm('Capsule, soft'), 'Caps. soft.', 'soft capsules must use the verified soft-capsule prefix');
assert.equal(Core.prefixForForm('Chewable tablet'), 'Tab. përtyp.', 'chewable tablets must use the verified chewable-tablet prefix');
assert.equal(Core.ensurePrescriptionPrefix('Paracetamol 500 mg', 'Tablet'), 'Tab. Paracetamol 500 mg', 'existing source lines without a prefix must be repaired from the pharmaceutical form');
assert.equal(Core.ensurePrescriptionPrefix('Caps. Paracetamol 500 mg', 'Tablet'), 'Tab. Paracetamol 500 mg', 'a conflicting known prefix must be normalized to the canonical form prefix');
assert.equal(Core.ensurePrescriptionPrefix('Unknown substance 1 mg', 'Unmapped special form'), 'Unknown substance 1 mg', 'unknown forms must remain fail-closed and must not be guessed');
assert.equal(Core.selectedDrugLine({
  'Substanca aktive':'Ibuprofen',
  'Fortësia':'400 mg',
  'Forma farmaceutike':'Film coated tablet',
}), 'Tab. Ibuprofen 400 mg (Tableta)', 'raw registry field names must preserve the dosage-form prefix');
assert.equal(Core.selectedDrugLine({
  active_substance:'Omeprazole',
  strength:'20 mg',
  pharmaceutical_form:'Capsule, hard',
}), 'Caps. Omeprazole 20 mg (Kapsula)', 'snake_case API fields must preserve capsule notation');
assert.equal(Core.selectedDrugLine({
  substance:'Omeprazole',
  strength:'20 mg',
  form:'Kapsulë',
}), 'Caps. Omeprazole 20 mg (Kapsula)', 'already-normalized Albanian capsule forms must never lose Caps.');
assert.equal(Core.selectedDrugLine({
  activeSubstance:'Diclofenac sodium',
  strength:'75 mg/3 mL',
  pharmaceuticalForm:'Solution for injection',
}), 'Amp. Diclofenac sodium 75 mg/3 mL (Ampulë)', 'camelCase API fields must preserve injection notation');

const canonicalExample = `Rp:
Tab. Amoxicillin / Clavulanic acid 875 mg / 125 mg (Tableta)
Sasia: Scat. No I (Një kuti)
S (Signatura): Nga 1 tabletë çdo 12 orë (2 herë në ditë) pas ushqimit, për 7 ditë rresht.

Tab. Paracetamol 500 mg (Tableta)
Sasia: Scat. No I (Një kuti)
S (Signatura): Nga 1 tabletë çdo 8 orë sipas nevojës (nëse ka temperaturë mbi 38.5°C ose dhimbje).`;
assert.equal(Core.formatText(Core.parse(canonicalExample)), canonicalExample, 'the exact canonical example must round-trip');

const generated = Core.normalizeResult({
  title: 'Recetë', diagnosis: 'Test', notes: [], missing: [],
  sections: [{
    title: 'Barna orale', type: 'oral', route: 'PO', sharedSignature: '', sharedSignatureGenerated: false,
    medications: [{ form: 'Tableta', name: 'Paracetamol', dose: '500 mg', quantity: '', dispenseQuantity: '', other: '', individualSignature: 'Nga 1 tabletë.', signatureGenerated: true }]
  }]
});
assert.equal(Core.hasGeneratedSignature(generated), true);

console.log('Prescription formatting tests passed.');

// Route headings are presentation metadata, never extra medicines or changed instructions.
const groupedDrugs=[
 {key:'oral-a',substance:'QA oral A',strength:'1 mg',form:'Tablet',route:'PO'},
 {key:'inject',substance:'QA injection',strength:'2 mg/ml',form:'Injection',route:'IM'},
 {key:'oral-b',substance:'QA oral B',strength:'3 mg',form:'Tablet',route:'PO'},
 {key:'rectal',substance:'QA rectal',strength:'4 mg',form:'Suppository',route:'PR'},
];
const routeGroups=Core.groupDrugsByAdministration(groupedDrugs);
assert.deepEqual(routeGroups.map(g=>g.key),['ORAL','PARENTERAL','ENTERAL_OTHER']);
assert.deepEqual(routeGroups[0].drugs.map(d=>d.key),['oral-a','oral-b']);
assert.equal(Core.administrationGroupForDrug({form:'Injection',allowedRoutes:['IV','IM']}).key,'PARENTERAL');
assert.equal(Core.administrationGroupForDrug({form:'Unknown'}).key,'UNRESOLVED');
const groupedInput=routeGroups.map(g=>g.title+':\n'+g.drugs.map(d=>Core.selectedDrugLine(d)+'\nSasia: QA quantity\nS (Signatura): Exact instruction '+d.key+'.').join('\n\n')).join('\n\n');
const groupedResult=Core.parse(groupedInput);
const groupedText=Core.formatText(groupedResult);
assert.deepEqual(groupedResult.sections.map(s=>s.administrationGroup),['ORAL','ORAL','PARENTERAL','ENTERAL_OTHER']);
assert.equal(groupedResult.sections.flatMap(s=>s.medications).length,4);
assert.equal(Core.formatText(Core.parse(groupedText)),groupedText,'Grouped canonical text must round-trip without a heading becoming a medicine');
assert.equal((groupedText.match(/Barna nga goja \(PO\):/g)||[]).length,1);
assert.equal((groupedText.match(/Barna parenterale:/g)||[]).length,1);
assert.deepEqual(groupedDrugs.map(d=>d.key),['oral-a','inject','oral-b','rectal'],'Grouping must not mutate stored product identities or order');
const sharedGrouped=Core.withAdministrationGroups(infusion,[]);
assert.equal(sharedGrouped.sections[0].medications.length,4);
assert.equal(sharedGrouped.sections[0].sharedSignature,infusion.sections[0].sharedSignature);
assert.equal((Core.formatText(sharedGrouped).match(/S \(Signatura\):/g)||[]).length,1,'Grouping must keep a shared infusion instruction intact');
assert.equal(Core.formatText(oral),oralInput,'Source/manual prescriptions without group headings must retain exact canonical text');

assert.equal(Core.parse('BARNA PARENTERALE:\nQA product (Unknown)\nS: Exact instruction.').sections[0].administrationGroup,'PARENTERAL');
const explicitUnknownGroup=Core.parse('Barna parenterale:\nQA product (Unknown)\nS: Exact instruction.');
assert.equal(Core.withAdministrationGroups(explicitUnknownGroup,[]).sections[0].administrationGroup,'PARENTERAL','Keep an explicit parsed group when pharmaceutical metadata cannot be matched');
