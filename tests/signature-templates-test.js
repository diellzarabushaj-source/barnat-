const assert = require('node:assert/strict');
const SignatureTemplates = require('../signature-templates.js');

const keys = SignatureTemplates.TEMPLATES.map(item => item.key);
assert.deepEqual(keys, ['tablet', 'capsule', 'ointment', 'injection', 'infusion', 'manual']);

assert.equal(SignatureTemplates.detectForm('Amoxicillin 1000 mg (Tableta)'), 'tablet');
assert.equal(SignatureTemplates.detectForm('Omeprazole 20 mg (Kapsula)'), 'capsule');
assert.equal(SignatureTemplates.detectForm('Ung. Hydrocortisone 1%'), 'ointment');
assert.equal(SignatureTemplates.detectForm('Amp. Ketoprofen 100 mg/2 ml'), 'injection');
assert.equal(SignatureTemplates.detectForm('Inf. Sodium Chloride 0.9% a 250 ml'), 'infusion');

const tablet = SignatureTemplates.renderTemplate('Nga {{1}} tabletë çdo 8 orë, për 5 ditë.');
assert.equal(tablet.text, 'Nga 1 tabletë çdo 8 orë, për 5 ditë.');
assert.equal(tablet.text.slice(tablet.selectionStart, tablet.selectionEnd), '1');
const multiple = SignatureTemplates.renderTemplate('Nga {{1}} tabletë çdo {{8}} orë për {{5}} ditë.');
assert.deepEqual(multiple.placeholders.map(range => multiple.text.slice(range.start, range.end)), ['1', '8', '5']);
assert.equal(SignatureTemplates.nextPlaceholderIndex(0, 3, false), 1);
assert.equal(SignatureTemplates.nextPlaceholderIndex(0, 3, true), 2);

const medication = 'Amoxicillin 1000 mg (Tableta)';
const inserted = SignatureTemplates.insertionFor(
  medication,
  medication.length,
  medication.length,
  tablet.text,
);
assert.equal(inserted.value, `${medication}\nS (Signatura): Nga 1 tabletë çdo 8 orë, për 5 ditë.`);
assert.equal(inserted.insertionStart, medication.length + 1);

const existing = 'Paracetamol 500 mg (Tableta)\nS (Signatura): tekst i vjetër';
const replaced = SignatureTemplates.insertionFor(
  existing,
  existing.length,
  existing.length,
  'Nga 1 tabletë çdo 8 orë sipas nevojës.',
);
assert.equal(replaced.value, 'Paracetamol 500 mg (Tableta)\nS (Signatura): Nga 1 tabletë çdo 8 orë sipas nevojës.');
assert.equal((replaced.value.match(/S \(Signatura\):/g) || []).length, 1, 'replacing a signature must not create duplicate lines');

const manual = SignatureTemplates.renderTemplate('');
assert.equal(manual.text, '');
assert.equal(manual.selectionStart, 0);
assert.equal(manual.selectionEnd, 0);

console.log('Signature template tests passed.');
