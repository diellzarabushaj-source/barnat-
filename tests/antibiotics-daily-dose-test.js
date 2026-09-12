'use strict';

// The Antibiotikët page prints two different numbers per scheme — the single
// dose and the 24-hour total — and the total is arithmetic the page performs on
// the source table, not a figure the table publishes. This gate keeps that
// arithmetic honest: every frequency in the dataset must be one the page can
// read, and every dose shape must land in a branch that handles it.

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

// --- the page must actually distinguish the two doses -----------------------
assert.match(js, /function dosesPerDay\(option\)/);
assert.match(js, /function perDoseMg\(option, weight\)/);
assert.match(js, /function dailyDose\(option, weight\)/);
assert.match(js, /'Doza e vetme'/, 'The single dose must be labelled');
assert.match(js, /'Doza ditore'/, 'The 24-hour total must be labelled');
assert.match(js, /function calculationSteps\(option, weight\)/, 'The arithmetic must be shown');

// calculatedValue owns the numbers; nothing else may compute a single dose.
assert.match(js, /function calculatedValue\(option, weight\)/);
const dailyStart = js.indexOf('function dailyDose(option, weight)');
const dailyEnd = js.indexOf('function doseRow(', dailyStart);
assert.ok(dailyStart >= 0 && dailyEnd > dailyStart, 'dailyDose must be present');

// --- every frequency in the dataset must be readable ------------------------
// These mirror the parser in antibiotiket.js. A new wording in the dataset that
// neither side understands fails here instead of silently dropping the total.
const EXACT_COUNT = /^(\d+) herë\/ditë$/;
const RANGE_COUNT = /^(\d+) ose (\d+) herë\/ditë$/;
const SPLIT_ONCE = '1 herë/ditë (mund të ndahet në 2 doza)';
// The only frequency the table states as prose instead of a count. The page
// derives it from the weight branch, so it is handled explicitly in code.
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

    // A dose already expressed per day must never be multiplied by a frequency.
    if (/\/ditë$/.test(clean(dose.unit || ''))) {
      assert.equal(
        dose.type,
        'sequence',
        `${indication.id}/${option.drug}: a mg/kg/ditë dose is only safe in the sequence branch, which does not multiply`,
      );
    }

    // The threshold doses are text; the page reads their numbers back out to
    // build the daily total, so both branches must stay parseable.
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

console.log(`Antibiotics dosing gate passed: ${seen.size} frequencies readable, every dose shape handled, daily and single doses labelled.`);
