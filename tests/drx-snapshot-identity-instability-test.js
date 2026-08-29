'use strict';

// Snapshot identity instability.
//
// dose_source_snapshots_v3 enforces check (snapshot_id = raw_sha256), which
// makes snapshot identity a fetch identity rather than a document identity.
// Two archive runs of the same 25 eMC sources produced 25 different snapshot
// ids while every extracted section hash stayed byte-identical: the HTML
// carries per-request volatile bytes that the raw hash captures.
//
// This gate keeps the finding attached to live evidence and keeps binding shut
// while it stands, because binding pins clinical rules to identities the next
// archive run invalidates - and the provenance lock then makes them hard to
// clean up.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const finding = read('data/drx-snapshot-identity-instability-v1.json');
const attestation = read('data/drx-batch2-archive-attestation-v1.json');
const feasibility = read('data/drx-batch2-product-binding-feasibility-v1.json');

assert.equal(finding.schemaVersion, 'drx-snapshot-identity-instability-v1');
assert.equal(finding.severity, 'foundational');
assert.equal(finding.blocksBinding, true);
assert.equal(finding.publicationAllowed, false);

// The evidence must be internally coherent: this is only a real finding if the
// raw hash moved while the content did not.
const e = finding.evidence;
assert.equal(e.rawSha256Changed, e.comparedRows,
  'the finding only holds if every raw hash changed.');
assert.equal(e.section42HashStable, e.comparedRows,
  'the finding only holds if the dosing section stayed stable.');
assert.equal(e.section41HashStable, e.comparedRows);
assert.equal(e.contentLengthIdentical, e.comparedRows,
  'identical length with a different hash is what shows the change is volatile wrapper bytes.');
assert.notEqual(e.runA, e.runB);

// The worked example must demonstrate the claim rather than assert it: one
// document, several distinct identities, one unchanging content hash.
const x = e.example;
assert.ok(Array.isArray(x.snapshotIdsObserved) && x.snapshotIdsObserved.length >= 2,
  'the example must show identity changing across runs.');
assert.equal(new Set(x.snapshotIdsObserved).size, x.snapshotIdsObserved.length,
  'every observed identity must be distinct, or there is no instability.');
assert.ok(e.runsObserved.length >= x.snapshotIdsObserved.length,
  'each observed identity must come from its own run.');
assert.match(x.section42BothRuns, /^[0-9a-f]{64}$/);
assert.ok(x.contentLengthBothRuns > 0);

// Anchor the finding on the stable hash, never on a snapshot id. Pinning an id
// here would make this gate expire on the next archive run for no reason -
// which is the very failure the finding describes.
const attested = attestation.rows.find(r => r.canonicalKey === x.canonicalKey);
assert.ok(attested, `${x.canonicalKey} must be present in the attestation.`);
assert.equal(attested.section42Sha256, x.section42BothRuns,
  'the cited stable hash must still match the live attestation.');
assert.ok(!x.snapshotIdsObserved.includes(attested.snapshotId)
  || x.snapshotIdsObserved.indexOf(attested.snapshotId) === x.snapshotIdsObserved.length - 1,
  'if the current id is listed it must be the most recent one.');
assert.match(finding.selfDemonstrating, /kept expiring/);

// The database was loaded from the older run, so the divergence is real and
// must stay recorded until identity is fixed.
assert.match(finding.alreadyBroken, /different ids for the same 25 documents/);

// Binding must stay shut while this stands.
assert.equal(feasibility.publicationAllowed, false);

// The schema of record must still tie identity to the raw bytes. If that
// changes, this finding is stale and must be revisited rather than left to rot.
const candidate = fs.readFileSync(
  path.join(ROOT, 'supabase', 'drx-dose-v3-additive-candidate.sql'), 'utf8');
assert.match(candidate, /check \(snapshot_id = raw_sha256\)/,
  'snapshot identity is no longer raw-derived; revisit this finding.');

console.log(`DRx snapshot identity gate passed (${e.rawSha256Changed}/${e.comparedRows} identities unstable, ${e.section42HashStable}/${e.comparedRows} content stable).`);
