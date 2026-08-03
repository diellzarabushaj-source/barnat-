'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const guidance = require('../icd-clinical-guidance.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

assert.equal(guidance.VERSION, 'icd-clinical-guidance-v2');
assert.equal(typeof guidance.retry, 'function');
assert.equal(guidance.normalizeCode('a41.9'), 'A41.9');
assert.equal(guidance.normalizeCode('A41-A42'), '');
assert.equal(guidance.categoryCode('A41.9'), 'A41');

const entries = [
  {
    code:'A41',
    title:'Sepsa tjetër',
    primaryCare:'Themelor',
    emergency:'Kritik',
    priority:'1 – Thelbësor / urgjent',
    summary:'Dokumentim i sepsës.',
    warning:'Gjendje potencialisht kërcënuese për jetën.',
    keywords:['sepsë', 'shok septik'],
    codingNotes:['Kontrollo nënkodin më specifik.'],
    isCritical:true,
  },
  {
    code:'I10',
    title:'Hipertensioni esencial (primar)',
    primaryCare:'Themelor',
    emergency:'Shumë i rëndësishëm',
    priority:'1 – Thelbësor / urgjent',
  },
];

const index = guidance.buildIndex(entries);
assert.equal(index.size, 2);
assert.equal(index.get('A41').isCritical, true);
assert.equal(guidance.urgencyTone(index.get('A41')), 'critical');
assert.equal(guidance.urgencyTone(index.get('I10')), 'urgent');

const exact = guidance.resolveClinicalContext('A41', index);
assert.equal(exact.requestedCode, 'A41');
assert.equal(exact.sourceCode, 'A41');
assert.equal(exact.inherited, false);

const inherited = guidance.resolveClinicalContext('A41.9', index);
assert.equal(inherited.requestedCode, 'A41.9');
assert.equal(inherited.sourceCode, 'A41');
assert.equal(inherited.inherited, true);
assert.equal(guidance.resolveClinicalContext('B99.9', index), null);

const officialUnavailable = guidance.officialCodingSections(index.get('A41'));
assert.equal(officialUnavailable.available, false);
assert.deepEqual(officialUnavailable.sections.map(section => section.items.length), [0, 0, 0, 0]);

const officialAvailable = guidance.officialCodingSections({
  code:'A41',
  includes:['Sepsë e specifikuar'],
  excludes:['Sepsë neonatale'],
  codeFirst:['Kodifiko infeksionin bazë'],
  useAdditionalCode:['Përdor kod shtesë për shokun'],
});
assert.equal(officialAvailable.available, true);
assert.deepEqual(officialAvailable.sections.map(section => section.items.length), [1, 1, 1, 1]);

assert.equal(guidance.sourceLabel({ dataSource:'sheets' }), 'Google Sheet klinik · drejtpërdrejt');
assert.equal(guidance.sourceLabel({ dataSource:'neon' }), 'Google Sheet klinik · kopje e sinkronizuar');

const copied = guidance.copyText(inherited, { dataSource:'sheets' });
assert.match(copied, /KONTEKST KLINIK ICD-10-WHO 2019/);
assert.match(copied, /i trashëguar nga kategoria A41/);
assert.match(copied, /Mjekësi familjare: Themelor/);
assert.match(copied, /Urgjencë: Kritik/);
assert.match(copied, /nuk janë të disponueshme në burimin aktual/);
assert.doesNotMatch(copied, /sourceSpreadsheetId|dataSource|selectedAt|localStorage|sessionStorage|patient/i);

const html = read('icd.html');
const js = read('icd-clinical-guidance.js');
const recovery = read('icd-clinical-guidance-recovery.js');
const css = read('icd-clinical-guidance.css');
const apiBase = read('lib/icd-api-base.js');

assert.match(html, /icd-clinical-guidance\.css\?v=icd-clinical-guidance-v1/);
assert.match(html, /icd-clinical-guidance\.js\?v=icd-clinical-guidance-v2/);
assert.match(html, /icd-clinical-guidance-recovery\.js\?v=icd-clinical-guidance-recovery-v7/);
assert.match(apiBase, /19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw/);
assert.match(apiBase, /all:1504864603/);
assert.match(apiBase, /urgent:285385409/);
assert.match(apiBase, /critical:255407421/);
assert.match(js, /Google Sheet klinik/);
assert.match(js, /Mjekësi familjare/);
assert.match(js, /Shenja alarmi \/ kujdes/);
assert.match(js, /MedIndex nuk fabrikon shënime/);
assert.match(js, /credentials:'same-origin'/);
assert.match(js, /async function retry\(\)/);
assert.match(js, /loadDataset\(true\)/);
assert.match(js, /miIcdClinicalRecoveryResult = 'success'/);
assert.match(js, /retry,\s*init/);
assert.doesNotMatch(js, /localStorage\.setItem|sessionStorage\.setItem/);
assert.match(recovery, /icd-clinical-guidance-recovery-v7/);
assert.match(recovery, /Riprovo listën klinike/);
assert.match(recovery, /data-mi-icd-clinical-retry-visible/);
assert.match(recovery, /button\.addEventListener\('click'/);
assert.match(recovery, /miIcdClinicalRetryBound/);
assert.match(recovery, /typeof api\?\.retry !== 'function'/);
assert.match(recovery, /await api\.retry\(\)/);
assert.doesNotMatch(recovery, /root\.fetch|internalRetry|medindex:icd-state|stopImmediatePropagation|location\.reload|localStorage|sessionStorage/);
assert.match(css, /@media \(max-width: 520px\)/);
assert.match(css, /@media \(forced-colors: active\)/);
assert.match(css, /overflow-wrap: anywhere/);

console.log('ICD clinical guidance, curated Google Sheet provenance, public retry API and non-fabrication contract passed.');
