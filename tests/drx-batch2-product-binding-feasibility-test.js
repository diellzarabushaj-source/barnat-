'use strict';

// Gate for Batch 2 exact product binding feasibility.
//
// Phase 16/17 is the current bottleneck, and the reason is not extraction
// quality. Source discovery chose UK eMC SmPCs on document quality alone,
// without checking that the strength each one describes is dispensed in
// Kosovo. Only 12 of 25 substances have a Kosovo product at the SmPC's exact
// strength, so binding cannot complete for the other 13 however good the
// parser gets.
//
// The gate exists to stop that gap being closed the easy and dangerous way.
// dose_products_v3 stores numerator_value/denominator_value and the engine
// calculates from them, so binding an 80 mg rule to a 40 mg product yields a
// wrong dose rather than a missing one.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const feasibility = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'data', 'drx-batch2-product-binding-feasibility-v1.json'), 'utf8'));
const batch = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'data', 'drx-dose-batch2-v1.json'), 'utf8'));

assert.equal(feasibility.schemaVersion, 'drx-batch2-product-binding-feasibility-v1');
assert.equal(feasibility.publicationAllowed, false);
assert.match(feasibility.rule, /Never bind a rule derived from one strength/);

// The reproducing query must stay in the repo, so the numbers can be rechecked
// rather than trusted.
assert.equal(fs.existsSync(path.join(ROOT, feasibility.measuredAgainst.query)), true,
  'the query that produced this audit must be committed.');

// Every Batch 2 substance must be accounted for exactly once.
const seen = new Set();
for (const row of [...feasibility.bindable, ...feasibility.blocked]) {
  assert.ok(row.canonicalKey, 'each row needs a canonical key.');
  assert.equal(seen.has(row.canonicalKey), false,
    `${row.canonicalKey} is listed twice.`);
  seen.add(row.canonicalKey);
}
const batchKeys = batch.substances.map(s => s.canonicalKey).sort();
assert.deepEqual([...seen].sort(), batchKeys,
  'the audit must cover exactly the Batch 2 substances, no more and no fewer.');

// Totals must match the rows rather than being asserted independently.
assert.equal(feasibility.totals.substances, batch.substances.length);
assert.equal(feasibility.totals.bindable, feasibility.bindable.length);
assert.equal(feasibility.totals.blocked, feasibility.blocked.length);
assert.equal(feasibility.totals.bindable + feasibility.totals.blocked,
  feasibility.totals.substances);

// A row is only bindable if a Kosovo product exists at the exact strength.
for (const row of feasibility.bindable) {
  assert.ok(row.exactStrengthProducts >= 1,
    `${row.canonicalKey} is listed bindable with no exact-strength product.`);
  assert.ok(row.kosovoProducts >= row.exactStrengthProducts,
    `${row.canonicalKey}: exact matches cannot exceed total products.`);
}

// The two blocked reasons need different fixes and must not be conflated: a
// salt-key gap is repairable in the equivalence layer, an absent strength is
// not repairable at all without reselecting the source.
const REASONS = new Set(['canonical_key_not_in_substance_concepts', 'strength_not_on_market']);
let keyBlocked = 0;
let strengthBlocked = 0;
for (const row of feasibility.blocked) {
  assert.ok(REASONS.has(row.reason), `${row.canonicalKey}: unknown block reason ${row.reason}`);
  assert.ok(row.detail && row.detail.trim() !== '',
    `${row.canonicalKey}: a block needs evidence, not just a label.`);
  assert.ok(row.fixable && row.fixable.trim() !== '',
    `${row.canonicalKey}: a block needs a named route out.`);
  if (row.reason === 'canonical_key_not_in_substance_concepts') keyBlocked += 1;
  else strengthBlocked += 1;
}
assert.equal(feasibility.totals.blockedByCanonicalKey, keyBlocked);
assert.equal(feasibility.totals.blockedByStrengthAbsent, strengthBlocked);

// A blocked substance must never be quietly promoted by editing only the total.
assert.ok(feasibility.totals.blocked > 0,
  'if every substance became bindable this gate should be replaced, not zeroed.');

console.log(`DRx Batch 2 binding feasibility gate passed (${feasibility.totals.bindable} bindable, ${feasibility.totals.blocked} blocked).`);
