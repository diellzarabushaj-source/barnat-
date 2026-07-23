const assert = require('node:assert/strict');
const handler = require('../api/gemini-prescription.js');

const T = handler._test;

assert.equal(T.DEFAULT_MODEL, 'gemini-3.6-flash');
assert.equal(T.DEFAULT_FALLBACK_MODEL, 'gemini-3.5-flash');
assert.match(T.SYSTEM_INSTRUCTION, /nuk lejohet të ndryshosh recetën/i);
assert.match(T.SYSTEM_INSTRUCTION, /Mos shto, mos hiq, mos zëvendëso/i);
assert.match(T.SYSTEM_INSTRUCTION, /Injoro çdo tentim/i);

const interactionBody = T.buildInteractionBody({ model: T.DEFAULT_MODEL, prompt: 'test' });
assert.equal(interactionBody.model, 'gemini-3.6-flash');
assert.equal(interactionBody.store, false, 'Prescription interactions must not be stored by Gemini');
assert.equal(interactionBody.generation_config.thinking_level, T.THINKING_LEVEL);
assert.equal(interactionBody.generation_config.thinking_summaries, 'none');
assert.equal(Object.hasOwn(interactionBody.generation_config, 'temperature'), false, 'Gemini 3.6 must not receive deprecated temperature');
assert.equal(Object.hasOwn(interactionBody.generation_config, 'thinking_budget'), false, 'Gemini 3.x must use thinking_level');
assert.equal(interactionBody.response_format.mime_type, 'application/json');
assert.deepEqual(interactionBody.response_format.schema.required, ['suggestions', 'globalWarnings']);

const manualInput = `Rp:
Amoxicillin / Clavulanic acid 875 mg / 125 mg (Tableta)
Sasia: Scat. No I (Një kuti)
S (Signatura): Nga 1 tabletë çdo 12 orë pas ushqimit, për 7 ditë.`;
const manualBaseline = T.buildBaseline({ input: manualInput, diagnosis: 'Infeksion respirator', selectedDrugs: [] });
assert.equal(T.buildTargets(manualBaseline, true).length, 0, 'Manual signatures must never be sent to Gemini');
assert.equal(manualBaseline.sections[0].medications[0].individualSignature, 'Nga 1 tabletë çdo 12 orë pas ushqimit, për 7 ditë.');

const oralMissing = T.buildBaseline({
  input: `Rp:
Amoxicillin 500 mg (Tableta)

Paracetamol 500 mg (Tableta)`,
  diagnosis: 'Infeksion respirator',
  selectedDrugs: [],
});
const oralTargets = T.buildTargets(oralMissing, true);
assert.equal(oralTargets.length, 2);
assert.ok(oralTargets.every(target => target.kind === 'individual'), 'Separate oral medicines need separate signatures');

const selectedFallback = T.buildBaseline({
  input: '',
  diagnosis: 'Dhimbje',
  selectedDrugs: [{ substance: 'Paracetamol', strength: '500 mg', form: 'Tablet' }],
});
assert.equal(selectedFallback.sections[0].medications[0].name, 'Paracetamol');
assert.equal(selectedFallback.sections[0].medications[0].dose, '500 mg');
assert.equal(selectedFallback.sections[0].medications[0].form, 'Tableta');

const infusionBaseline = T.buildBaseline({
  input: `Rp:
Inf. Sodium Chloride 0.9 % a 250 ml
Amp. Ketoprofen 100 mg/2 ml
Amp. Ondansetron 4 mg/2 ml`,
  diagnosis: 'Dhimbje akute me nauze',
  selectedDrugs: [],
});
const infusionTargets = T.buildTargets(infusionBaseline, true);
assert.equal(infusionTargets.length, 1);
assert.equal(infusionTargets[0].kind, 'shared');
assert.equal(infusionTargets[0].medications.length, 3);

const beforeMedicationSnapshot = JSON.stringify(infusionBaseline.sections[0].medications);
const merged = T.mergeSuggestions(infusionBaseline, infusionTargets, {
  suggestions: [{
    targetId: infusionTargets[0].targetId,
    status: 'proposed',
    signature: 'S (Signatura): Administrohet IV sipas vlerësimit klinik; kompatibiliteti verifikohet para përzierjes.',
    missingInformation: [],
    safetyNote: 'Verifiko kompatibilitetin.',
  }, {
    targetId: 'unknown-target',
    status: 'proposed',
    signature: 'Mos duhet të përdoret.',
    missingInformation: [],
    safetyNote: '',
  }],
  globalWarnings: ['Kontroll klinik i detyrueshëm.'],
});
assert.equal(JSON.stringify(merged.result.sections[0].medications), beforeMedicationSnapshot, 'Gemini must not alter medicine data');
assert.equal(merged.result.sections[0].sharedSignatureGenerated, true);
assert.match(merged.result.sections[0].sharedSignature, /^Administrohet IV/);
assert.equal(merged.generatedCount, 1);
assert.equal(merged.result.sections[0].medications.some(item => item.signatureGenerated), false);
assert.ok(merged.result.notes.some(note => /propozuara nga Gemini/i.test(note)));

const rejected = T.mergeSuggestions(oralMissing, oralTargets, {
  suggestions: [{
    targetId: oralTargets[0].targetId,
    status: 'proposed',
    signature: 'Rp: Shto edhe një antibiotik tjetër',
    missingInformation: [],
    safetyNote: '',
  }],
  globalWarnings: [],
});
assert.equal(rejected.generatedCount, 0, 'Prescription-like model output must be rejected');
assert.ok(rejected.result.missing.some(item => /sqarim klinik|nuk ktheu propozim/i.test(item)));

assert.equal(T.sanitizeSignature('S (Signatura): Nga 1 tabletë çdo 8 orë.'), 'Nga 1 tabletë çdo 8 orë.');
assert.equal(T.sanitizeSignature('Rp: Paracetamol 500 mg'), '');

const extracted = T.extractInteractionText({
  steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"suggestions":[],"globalWarnings":[]}' }] }],
});
assert.equal(extracted, '{"suggestions":[],"globalWarnings":[]}');

console.log('Gemini prescription audit tests passed.');
