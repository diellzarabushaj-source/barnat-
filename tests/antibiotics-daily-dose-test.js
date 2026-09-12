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

const js = read('antibiotiket.js');
const html = read('antibiotiket.html');

// --- Phase 1: the simple selector now contains exactly the agreed 12 diagnoses
const EXPECTED_PHASE1_INDICATIONS = [
  'pneumonia',
  'aom',
  'gas',
  'sinusitis',
  'uti-cystitis',
  'uti-pyelo',
  'impetigo',
  'cellulitis',
  'abscess',
  'preseptal',
  'bite',
  'lymphadenitis',
];
assert.deepEqual(
  guide.indications.map(item => item.id),
  EXPECTED_PHASE1_INDICATIONS,
  'Phase 1 must expose exactly the agreed 12 pediatric diagnoses in the planned order',
);

const stagedIds = new Set(['sinusitis', 'impetigo', 'cellulitis', 'abscess', 'preseptal', 'bite', 'lymphadenitis']);
for (const indication of guide.indications) {
  if (!stagedIds.has(indication.id)) continue;
  assert.equal(indication.phase, 'phase2', `${indication.id}: staged diagnosis must be explicitly marked phase2`);
  assert.equal(indication.source, 'phase1', `${indication.id}: staged diagnosis must not claim an active clinical dosing source`);
  assert.deepEqual(indication.options, [], `${indication.id}: Phase 1 must not publish unlinked antibiotic doses`);
}

// UTI used to be one indication with a febrile/afebrile switch. Phase 1 only
// splits that existing output into two visible choices; it must not silently
// alter the legacy dose formulas or their previous duration output.
const cystitis = guide.indications.find(item => item.id === 'uti-cystitis');
const pyelo = guide.indications.find(item => item.id === 'uti-pyelo');
assert.ok(cystitis && pyelo, 'Both UTI choices must exist');
assert.equal(cystitis.options.length, 5, 'Afebrile UTI must preserve the five existing empiric options');
assert.equal(pyelo.options.length, 5, 'Febrile UTI must preserve the five existing empiric options');
for (let index = 0; index < cystitis.options.length; index += 1) {
  const low = cystitis.options[index];
  const high = pyelo.options[index];
  assert.equal(low.drug, high.drug, `UTI option ${index + 1}: drug changed while splitting the selector`);
  assert.deepEqual(low.dose, high.dose, `UTI/${low.drug}: dose formula changed while splitting the selector`);
  assert.equal(low.frequency, high.frequency, `UTI/${low.drug}: frequency changed while splitting the selector`);
}
assert.equal(cystitis.options.find(item => item.drug === 'Cephalexin').duration.text, '7 ditë');
assert.equal(pyelo.options.find(item => item.drug === 'Cephalexin').duration.text, '7 ditë');
for (const option of cystitis.options.filter(item => item.drug !== 'Cephalexin')) {
  assert.equal(option.duration.text, '3 ditë', `Afebrile UTI/${option.drug}: legacy duration output changed`);
}
for (const option of pyelo.options.filter(item => item.drug !== 'Cephalexin')) {
  assert.equal(option.duration.text, '7–10 ditë', `Febrile UTI/${option.drug}: legacy duration output changed`);
}

// --- every published scheme must have a usable duration ---------------------
for (const indication of guide.indications) {
  for (const option of indication.options) {
    assert.ok(option.duration?.type, `${indication.id}/${option.drug}: treatment duration is missing`);
    assert.notEqual(
      option.duration.type,
      'source-unspecified',
      `${indication.id}/${option.drug}: a published scheme must not show an unspecified duration`,
    );
  }
}

// GAS duration is clinically material. Keep these exact values pinned to the
// current CPS/CDC recommendations so a later dataset edit cannot regress them.
const gas = guide.indications.find(item => item.id === 'gas');
assert.ok(gas, 'The GAS pharyngitis indication must exist');
const gasExpectedDurations = new Map([
  ['penicillin-gas', '10 ditë'],
  ['amoxicillin-gas', '10 ditë'],
  ['cephalexin-gas', '10 ditë'],
  ['clarithro-gas', '10 ditë'],
  ['azithro-gas', '5 ditë'],
]);
for (const option of gas.options) {
  assert.equal(option.duration?.type, 'fixed', `gas/${option.drug}: duration must be fixed`);
  assert.equal(
    option.duration?.text,
    gasExpectedDurations.get(option.id),
    `gas/${option.drug}: unexpected treatment duration`,
  );
}
assert.equal(gas.options.length, gasExpectedDurations.size, 'Every GAS option must be covered by the duration gate');

// --- the page must actually distinguish the two doses -----------------------
assert.match(js, /function dosesPerDay\(option\)/);
assert.match(js, /function perDoseMg\(option, weight\)/);
assert.match(js, /function dailyDose\(option, weight\)/);
assert.match(js, /'Doza e vetme'/, 'The single dose must be labelled');
assert.match(js, /'Doza ditore'/, 'The 24-hour total must be labelled');
assert.match(js, /function calculationSteps\(option, weight\)/, 'The arithmetic must be shown');
assert.match(js, /function calculatedValue\(option, weight\)/);
const dailyStart = js.indexOf('function dailyDose(option, weight)');
const dailyEnd = js.indexOf('function doseRow(', dailyStart);
assert.ok(dailyStart >= 0 && dailyEnd > dailyStart, 'dailyDose must be present');

// --- every frequency in the dataset must be readable ------------------------
const EXACT_COUNT = /^(\d+) herë\/ditë$/;
const RANGE_COUNT = /^(\d+) ose (\d+) herë\/ditë$/;
const SPLIT_ONCE = '1 herë/ditë (mund të ndahet në 2 doza)';
const PROSE_FREQUENCIES = new Map([['sipas peshës', 'amoxclav-uti']]);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const seen = new Set();

for (const indication of guide.indications) {
  for (const option of indication.options) {
    const frequency = clean(option.frequency);
    seen.add(frequency);
    const readable = EXACT_COUNT.test(frequency)
      || RANGE_COUNT.test(frequency)
      || frequency === SPLIT_ONCE;
    if (readable) continue;
    assert.ok(
      PROSE_FREQUENCIES.has(frequency),
      `${indication.id}/${option.drug}: frequency "${frequency}" is not one the page can turn into a daily dose`,
    );
    assert.equal(
      option.dose?.type,
      PROSE_FREQUENCIES.get(frequency),
      `${indication.id}/${option.drug}: "${frequency}" is only handled for the ${PROSE_FREQUENCIES.get(frequency)} dose shape`,
    );
  }
}
assert.ok(seen.size >= 5, 'The dataset should still cover several distinct frequencies');

// --- every dose shape must reach a branch that handles it -------------------
const HANDLED_SHAPES = new Set(['range', 'single', 'sequence', 'weight-threshold', 'amoxclav-uti']);
const PER_DOSE_TEXT = /^(\d+(?:[.,]\d+)?) mg\/dozë$/;

for (const indication of guide.indications) {
  for (const option of indication.options) {
    const dose = option.dose || {};
    assert.ok(HANDLED_SHAPES.has(dose.type), `${indication.id}/${option.drug}: unhandled dose shape "${dose.type}"`);
    assert.match(js, new RegExp(`dose\\.type === '${dose.type}'`), `${dose.type} must be handled in antibiotiket.js`);

    if (/\/ditë$/.test(clean(dose.unit || ''))) {
      assert.equal(
        dose.type,
        'sequence',
        `${indication.id}/${option.drug}: a mg/kg/ditë dose is only safe in the sequence branch, which does not multiply`,
      );
    }

    if (dose.type === 'weight-threshold') {
      for (const key of ['below', 'atOrAbove']) {
        assert.match(
          clean(dose[key]),
          PER_DOSE_TEXT,
          `${indication.id}/${option.drug}: "${dose[key]}" cannot be read back as a number for the daily total`,
        );
      }
    }
  }
}

// --- the page must not claim the reference weight is unused -----------------
assert.match(js, /function doseBasis\(\)/, 'The age band must be able to supply a weight');
assert.match(js, /referenceWeightKg/, 'The reference weight must feed the calculation');
assert.doesNotMatch(
  html,
  /Doza numerike llogaritet vetëm nga pesha reale/,
  'The safety copy must not contradict the age-derived dose the page now shows',
);
assert.match(html, /vetëm orientuese/, 'An age-derived dose must be marked orientational');
for (const band of guide.ageBands) {
  assert.ok(
    Number.isFinite(band.referenceWeightKg) && band.referenceWeightKg > 0,
    `Age band ${band.id} needs a numeric reference weight`,
  );
}

console.log(`Antibiotics Phase 1 gate passed: ${guide.indications.length} diagnoses, ${seen.size} frequencies readable, every published dose shape/duration handled.`);
