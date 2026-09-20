'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const sandbox = { window:{} };
// eslint-disable-next-line no-new-func
new Function('window', read('antibiotiket-data.js'))(sandbox.window);
const guide = sandbox.window.DRX_ANTIBIOTIC_GUIDE;
assert.ok(guide?.indications?.length, 'The antibiotic guide dataset must load');
assert.match(guide.version, /phase2-regimen-engine/, 'The Phase 2 dataset version must be explicit');

const js = read('antibiotiket.js');
const html = read('antibiotiket.html');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

// --- 12 outpatient diagnoses are now active --------------------------------
const EXPECTED = new Set([
  'aom',
  'gas',
  'pneumonia',
  'sinusitis',
  'uti-cystitis',
  'uti-pyelo',
  'impetigo',
  'cellulitis',
  'abscess',
  'preseptal',
  'bite',
  'lymphadenitis',
]);
assert.equal(guide.indications.length, 12, 'Phase 2 must expose exactly 12 pediatric outpatient diagnoses');
assert.deepEqual(new Set(guide.indications.map(item => item.id)), EXPECTED, 'Unexpected Phase 2 diagnosis set');
for (const indication of guide.indications) {
  assert.ok(indication.options.length > 0, `${indication.id}: Phase 2 diagnosis must be linked to at least one verified action/regimen`);
  assert.notEqual(indication.phase, 'phase2', `${indication.id}: no diagnosis may remain a Phase 1 placeholder`);
}

// --- provenance is per regimen, not silently mixed -------------------------
const sourceIds = new Set(guide.sources.map(source => source.id));
for (const indication of guide.indications) {
  assert.ok(sourceIds.has(indication.source), `${indication.id}: invalid primary source`);
  for (const option of indication.options) {
    assert.ok(sourceIds.has(option.source), `${indication.id}/${option.id}: regimen source is missing or invalid`);
    assert.ok(option.duration?.type, `${indication.id}/${option.id}: duration is missing`);
    assert.notEqual(option.duration.type, 'source-unspecified', `${indication.id}/${option.id}: unspecified duration is forbidden`);
  }
}
for (const source of guide.sources.filter(item => item.id !== 'carpa')) {
  assert.match(source.url || '', /^https:\/\//, `${source.id}: authoritative source URL must be preserved`);
}

// --- allergy model A0-A5 ----------------------------------------------------
assert.deepEqual(
  guide.allergyBuckets.map(item => item.id),
  ['none','a0','a1','a2','a3','a4','a5'],
  'Allergy model must distinguish none plus A0-A5',
);
assert.match(js, /guide\.allergyBuckets/, 'UI must build allergy choices from the canonical allergy buckets');
assert.match(js, /ctx\.allergy === 'a5'/, 'Multiple/alternative-class allergy must have an explicit no-auto-substitution branch');

const betaLactam = /(amoxicillin|penicillin|cephalexin|cefdinir|cefpodoxime|cefixime|cefuroxime|cefprozil)/i;
for (const indication of guide.indications) {
  for (const option of indication.options) {
    if (!(option.allergy || []).includes('a3')) continue;
    assert.doesNotMatch(option.drug, betaLactam, `${indication.id}/${option.id}: A3 severe delayed allergy must not expose a beta-lactam`);
  }
}

// GAS is deliberately stricter than generic cephalosporin cross-reactivity.
const gas = guide.indications.find(item => item.id === 'gas');
assert.ok(gas, 'GAS indication must exist');
const gasCephalexin = gas.options.find(item => item.id === 'cephalexin-gas');
assert.deepEqual(gasCephalexin.allergy, ['a1'], 'CDC: cephalexin must not be shown for immediate/high-risk penicillin allergy');
assert.ok(!gas.options.some(option => option.id === 'cephalexin-gas' && option.allergy.includes('a2')));

// Pin the CDC GAS values that are easy to regress.
const gasAmox = gas.options.find(item => item.id === 'amoxicillin-gas');
assert.equal(gasAmox.dose.value, 50);
assert.equal(gasAmox.dose.maxDose, 1000);
assert.equal(gasAmox.frequency, '1 herë/ditë');
assert.equal(gasAmox.duration.text, '10 ditë');
assert.equal(gasCephalexin.dose.value, 20);
assert.equal(gasCephalexin.dose.maxDose, 500);
assert.equal(gasCephalexin.duration.text, '10 ditë');
const gasAzithro = gas.options.find(item => item.id === 'azithro-gas');
assert.deepEqual(gasAzithro.dose.steps.map(step => step.value), [12, 6]);
assert.deepEqual(gasAzithro.dose.steps.map(step => step.maxDose), [500, 250]);
assert.equal(gasAzithro.duration.text, '5 ditë');
assert.match(
  js,
  /option\.id !== 'penicillin-gas' \|\| \(age && age\.months < 144\)/,
  'The child Penicillin V 250 mg BID/TID row must be withheld when age is unknown or the 12+ band is selected',
);

// --- key diagnosis-specific contracts --------------------------------------
const aom = guide.indications.find(item => item.id === 'aom');
const aomAmox = aom.options.find(item => item.id === 'amox-aom');
assert.deepEqual([aomAmox.dose.min, aomAmox.dose.max, aomAmox.dose.maxDose], [40, 50, 2000]);
assert.equal(aomAmox.frequency, '2 herë/ditë');
assert.equal(aomAmox.duration.type, 'age-bands');
assert.deepEqual(aomAmox.duration.bands.map(item => [item.maxMonths, item.text]), [[24,'10 ditë'],[72,'7 ditë']]);
assert.equal(aomAmox.duration.defaultText, '5–7 ditë');
assert.equal(aomAmox.duration.severeText, 'Sëmundje e rëndë: 10 ditë');

const pneumonia = guide.indications.find(item => item.id === 'pneumonia');
assert.ok(!pneumonia.options.some(option => /cefdinir/i.test(option.drug)), 'Cefdinir must not be an empiric pneumonia alternative in this source hierarchy');
assert.deepEqual(
  [pneumonia.options.find(item => item.id === 'amox-pna').dose.min, pneumonia.options.find(item => item.id === 'amox-pna').dose.max],
  [40, 50],
);
assert.ok(pneumonia.options.some(option => option.atypical && option.drug === 'Azithromycin'), 'Atypical CAP branch must remain explicit');

const cystitis = guide.indications.find(item => item.id === 'uti-cystitis');
const pyelo = guide.indications.find(item => item.id === 'uti-pyelo');
assert.equal(cystitis.source, 'cps-uti-2026');
assert.equal(pyelo.source, 'cps-uti-2026');
assert.match(cystitis.warning, /urinokultur/i, 'Cystitis must prompt culture/local resistance context');
assert.match(cystitis.warning, /rezistenc/i, 'Cystitis must not assume local susceptibility');
assert.equal(cystitis.options.find(item => item.id === 'cephalexin-cystitis').dose.value, 12.5);
assert.equal(cystitis.options.find(item => item.id === 'cephalexin-cystitis').frequency, '4 herë/ditë');
assert.equal(cystitis.options.find(item => item.id === 'cephalexin-cystitis').dose.maxDose, undefined, 'Do not invent a CPS maximum for cystitis cephalexin');
assert.equal(pyelo.options.find(item => item.id === 'cephalexin-pyelo').dose.value, 25);
assert.equal(pyelo.options.find(item => item.id === 'cephalexin-pyelo').frequency, '4 herë/ditë');
assert.equal(pyelo.options.find(item => item.id === 'cephalexin-pyelo').dose.maxDose, undefined, 'Do not invent a CPS maximum for pyelonephritis cephalexin');
assert.ok(pyelo.options.every(option => /7 ditë/.test(option.duration.text)), 'Uncomplicated pyelonephritis must not be published with <7 days in this dataset');

const abscess = guide.indications.find(item => item.id === 'abscess');
assert.equal(abscess.options[0].kind, 'procedure', 'Abscess must model source control before systemic antibiotics');
assert.match(abscess.warning, /drenazh/i);
assert.match(abscess.warning, /nuk kërkon antibiotik/i);

const preseptal = guide.indications.find(item => item.id === 'preseptal');
assert.match(preseptal.warning, /^HARD STOP:/, 'Orbital red flags must be a hard-stop warning');
assert.match(preseptal.warning, /proptoza/i);
assert.match(preseptal.warning, /lëvizjeve okulare/i);
assert.match(js, /orbitalRedFlags:false/, 'Preseptal red-flag state must be explicit');
assert.match(js, /if \(indication\.id === 'preseptal' && ctx\.orbitalRedFlags\)/, 'Orbital red flags must gate the outpatient result list');
assert.match(js, /STOP — mos përdor skemë ambulatore/, 'Hard-stop state must tell the clinician not to use the outpatient regimen');

const bite = guide.indications.find(item => item.id === 'bite');
assert.match(bite.warning, /tetanus/i);
assert.match(bite.warning, /rabies/i);
const biteCombo = bite.options.find(item => item.id === 'combo-bite-treat');
assert.equal(biteCombo.dose.type, 'combo', 'Penicillin-allergic bite regimen must preserve the two-drug combination');
assert.equal(biteCombo.dose.parts.length, 2);
assert.deepEqual(biteCombo.dose.parts.map(part => part.drug), ['Trimethoprim / sulfamethoxazole', 'Clindamycin']);
assert.match(biteCombo.conditional, /TË DYJA/, 'UI data must state that both bite-allergy drugs are given');

const lymph = guide.indications.find(item => item.id === 'lymphadenitis');
assert.match(lymph.warning, /Bartonella.*nuk trajtohet si alternativë alergjie/i);

// --- component basis is explicit -------------------------------------------
for (const indication of guide.indications) {
  for (const option of indication.options) {
    if (/amoxicillin \/ clavulanate/i.test(option.drug)) {
      assert.equal(option.dose.component, 'amoxicillin', `${indication.id}/${option.id}: amox-clav must calculate on amoxicillin component`);
    }
    if (/trimethoprim \/ sulfamethoxazole/i.test(option.drug)) {
      assert.equal(option.dose.component, 'trimethoprim', `${indication.id}/${option.id}: TMP-SMX must calculate on trimethoprim component`);
    }
    if (option.dose?.type === 'combo') {
      const tmpPart = option.dose.parts.find(part => /trimethoprim/i.test(part.drug));
      if (tmpPart) assert.equal(tmpPart.dose.component, 'trimethoprim');
    }
  }
}

// --- calculator handles every published dose shape -------------------------
const HANDLED_SHAPES = new Set(['range','single','sequence','fixed','combo']);
for (const indication of guide.indications) {
  for (const option of indication.options) {
    assert.ok(HANDLED_SHAPES.has(option.dose?.type), `${indication.id}/${option.id}: unhandled dose type ${option.dose?.type}`);
    assert.match(js, new RegExp(`dose\\.type === '${option.dose.type}'`), `${option.dose.type} must be handled in antibiotiket.js`);
  }
}
assert.match(js, /function calculateSimple\(dose, weight\)/);
assert.match(js, /function dosesPerDayFromFrequency\(frequency\)/);
assert.match(js, /function dailyDose\(option, weight\)/);
assert.match(js, /function calculationSteps\(option, weight\)/);
assert.match(js, /'Doza e vetme'/);
assert.match(js, /'Doza ditore'/);

// Every ordinary weight-based regimen should have a machine-readable frequency.
const COUNT = /^(\d+) herë\/ditë$/;
const COUNT_RANGE = /^(\d+) ose (\d+) herë\/ditë$/;
for (const indication of guide.indications) {
  for (const option of indication.options) {
    if (option.dose?.type === 'combo' || option.kind === 'procedure' || option.frequencyNotComputable) continue;
    if (option.dose?.type === 'sequence') {
      assert.equal(option.frequency, '1 herë/ditë', `${indication.id}/${option.id}: sequence dosing must remain once daily`);
      continue;
    }
    if (option.dose?.type === 'fixed' && option.route === 'topike') continue;
    assert.ok(COUNT.test(clean(option.frequency)) || COUNT_RANGE.test(clean(option.frequency)), `${indication.id}/${option.id}: frequency is not computable: ${option.frequency}`);
  }
}

// --- UI safety copy / reference weight -------------------------------------
assert.match(js, /function doseBasis\(\)/);
assert.match(js, /referenceWeightKg/);
assert.match(js, /Alergji ndaj alternativës \/ alergji të shumëfishta/);
assert.match(html, /vetëm orientuese/, 'Age-derived dose must remain marked orientational');
assert.match(html, /antibiotiket-data\.js\?v=antibiotiket-phase2-v7/, 'Phase 2 data must be cache-busted in the page');
assert.match(html, /Alergjia ndaj beta-laktameve/, 'The static allergy label must match the A0-A5 model');
for (const band of guide.ageBands) {
  assert.ok(Number.isFinite(band.referenceWeightKg) && band.referenceWeightKg > 0, `Age band ${band.id} needs a positive reference weight`);
}

console.log(`Antibiotics Phase 2 gate passed: ${guide.indications.length} active diagnoses, ${guide.allergyBuckets.length} allergy states, regimen provenance and safety rules pinned.`);