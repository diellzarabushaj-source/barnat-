const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../prescription-diagnosis-document.js');

const ROOT = path.resolve(__dirname, '..');
const now = Date.UTC(2026, 7, 2, 16, 0, 0);
const context = (code, titleSq, index = 0) => ({
  code,
  level:code.includes('.') ? 'subcategory' : 'category',
  titleSq,
  titleEn:titleSq,
  selectedAt:now - index * 1000,
  source:'medindex-icd-browser',
  translationStatus:'machine-draft',
});

assert.equal(api.VERSION, 'prescription-diagnosis-document-v1');
assert.equal(api.MAX_SECONDARY, 5);

const primary = context('I10', 'Hipertensioni esencial (primar)');
const secondary = [
  primary,
  context('E11', 'Diabet mellitus tipi 2', 1),
  context('J45', 'Astma', 2),
  context('E11', 'Duplikat', 3),
  context('N39', 'Çrregullime të sistemit urinar', 4),
  context('M54', 'Dorsalgjia', 5),
  context('K76', 'Sëmundje të tjera të mëlçisë', 6),
  context('R51', 'Dhimbje koke', 7),
];
const model = api.buildModel({ primary, secondary, diagnosisText:'tekst që nuk duhet ta zëvendësojë kodin', now });
assert.equal(model.primary.code, 'I10');
assert.deepEqual(model.secondary.map(item => item.code), ['E11', 'J45', 'N39', 'M54', 'K76']);

const composed = api.composeText('Rp:\nTab. Enalapril 10 mg\nS (Signatura): 1x1.', model);
assert.ok(composed.startsWith('Diagnoza kryesore:\nI10 — Hipertensioni esencial (primar)'));
assert.ok(composed.includes('Diagnozat shoqëruese:\n- E11 — Diabet mellitus tipi 2'));
assert.ok(composed.endsWith('Rp:\nTab. Enalapril 10 mg\nS (Signatura): 1x1.'));
assert.ok(!composed.includes('medindex-icd-browser'));
assert.ok(!composed.includes('machine-draft'));
assert.ok(!composed.includes('selectedAt'));

const manual = api.buildModel({ diagnosisText:'Migrenë pa aurë', secondary:[], now });
assert.equal(manual.primary.code, '');
assert.equal(manual.primary.display, 'Migrenë pa aurë');
assert.equal(api.diagnosisText(manual), 'Diagnoza kryesore:\nMigrenë pa aurë');

const validDraft = JSON.stringify({ version:1, savedAt:now, items:secondary });
assert.deepEqual(api.parseSecondaryDraft(validDraft, { primaryCode:'I10', now }).map(item => item.code), ['E11', 'J45', 'N39', 'M54', 'K76']);
const staleDraft = JSON.stringify({ version:1, savedAt:now - api.MAX_AGE_MS - 1, items:secondary });
assert.deepEqual(api.parseSecondaryDraft(staleDraft, { primaryCode:'I10', now }), []);
assert.deepEqual(api.parseSecondaryDraft('{broken', { now }), []);

assert.equal(api.exportFileName(model, new Date('2026-08-02T16:00:00Z')), 'recete-2026-08-02-i10.txt');
assert.equal(api.exportFileName(manual, new Date('2026-08-02T16:00:00Z')), 'recete-2026-08-02-migrene-pa-aure.txt');

const printSource = fs.readFileSync(path.join(ROOT, 'recetat-safe-print.js'), 'utf8');
assert.match(printSource, /prescription-diagnosis-document\.js/);
assert.match(printSource, /prescription-diagnosis-document\.css/);
assert.match(printSource, /currentModel/);
assert.match(printSource, /Diagnoza kryesore/);
assert.match(printSource, /Diagnozat shoqëruese/);
assert.doesNotMatch(printSource, /patientName|patientId|birthDate/);

const runtimeSource = fs.readFileSync(path.join(ROOT, 'prescription-diagnosis-document.js'), 'utf8');
assert.match(runtimeSource, /#rxCopy/);
assert.match(runtimeSource, /rxExport/);
assert.match(runtimeSource, /text\/plain;charset=utf-8/);
assert.match(runtimeSource, /medindex:icd-problem-list/);
assert.doesNotMatch(runtimeSource, /diagnosisCoding\s*=|secondaryDiagnosisCoding\s*=/);

console.log('Prescription diagnosis preview, copy, TXT export and structured print contracts passed.');
