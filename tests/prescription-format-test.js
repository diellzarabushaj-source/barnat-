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
