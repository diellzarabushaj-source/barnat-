'use strict';

// Gate for base-to-salt equivalence proposals.
//
// Four Batch 2 substances could not bind because the registry keys the salt
// while the SmPC keys the base. Mapping one to the other is a dosing claim: it
// asserts the number on the label means the same quantity either way. So a
// mapping is only proposed here when the archived section names the salt
// itself, and nothing is written to substance_equivalence_reviewed_v1 until a
// person decides.
//
// Only diclofenac clears that bar. The other three fail for a structural
// reason worth keeping visible: the salt basis lives in SmPC section 2, and the
// pipeline cannot reach section 2 at either the parser or the schema layer.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const proposals = read('data/drx-batch2-salt-equivalence-proposals-v1.json');
const attestation = read('data/drx-batch2-archive-attestation-v1.json');

assert.equal(proposals.schemaVersion, 'drx-batch2-salt-equivalence-proposals-v1');
assert.equal(proposals.status, 'PROPOSED_AWAITING_CLINICAL_REVIEW',
  'these must stay proposals until a person reviews them.');
assert.equal(proposals.targetTable, 'public.substance_equivalence_reviewed_v1');
assert.match(proposals.rule, /proposals, not decisions/);

// A proposal is only admissible when the archived source names the salt, and
// the quote must be traceable to a snapshot the attestation actually covers.
const attestedSnapshots = new Set(attestation.rows.map(r => r.snapshotId));
assert.ok(proposals.proposals.length > 0, 'expected at least one proposal.');
for (const p of proposals.proposals) {
  assert.equal(p.confidence, 'source_proven',
    `${p.sourceKey}: only source-proven mappings may be proposed.`);
  assert.ok(p.quote && p.quote.trim() !== '', `${p.sourceKey}: needs the quote it relies on.`);
  assert.ok(p.canonicalKey && p.canonicalKey !== p.sourceKey,
    `${p.sourceKey}: a mapping must point at a different key.`);
  assert.ok(attestedSnapshots.has(p.snapshotId),
    `${p.sourceKey}: snapshot ${p.snapshotId} is not in the archive attestation.`);
  // The quote has to actually name the target salt, otherwise it proves nothing.
  const saltWords = p.canonicalKey.replace(p.sourceKey, '');
  assert.match(p.quote.toLowerCase().replace(/\s+/g, ''),
    new RegExp(p.sourceKey + '\\w*' + saltWords.slice(0, 4)),
    `${p.sourceKey}: the quote must name the salt it maps to.`);
  assert.ok(Array.isArray(p.evidenceUrls) && p.evidenceUrls.length > 0,
    `${p.sourceKey}: substance_equivalence_reviewed_v1 requires evidence URLs.`);
  assert.ok(p.registryMatch.products >= 1,
    `${p.sourceKey}: proposing a mapping to a key with no products is pointless.`);
}

// Blocked ones must stay blocked, and must not quietly acquire a quote.
assert.ok(proposals.blockedProposals.length > 0);
for (const b of proposals.blockedProposals) {
  assert.equal(b.confidence, 'unproven_by_archived_evidence',
    `${b.sourceKey}: an unproven mapping must say so.`);
  assert.equal(b.quote, undefined,
    `${b.sourceKey}: if a quote exists it belongs in proposals, not blockedProposals.`);
  assert.ok(b.why && b.why.trim() !== '', `${b.sourceKey}: needs a stated reason.`);
}

// Both layers that blocked section 2 are now open, and the gate re-derives
// that from the code rather than trusting the recorded text.
const gap = proposals.pipelineGap;
assert.match(gap.parserLayer, /^RESOLVED:/);
assert.match(gap.schemaLayer, /^RESOLVED:/);
assert.equal(gap.remaining, 'rerun_archive_to_capture_section_2');

const parser = fs.readFileSync(path.join(ROOT, 'lib', 'smpc-parser.js'), 'utf8');
assert.match(parser, /function extractCompositionSection/,
  'the parser must be able to read section 2.');

// Section 2 must stay out of the clinical set, or every recorded
// clinicalSectionCoverage figure silently changes meaning.
const SmPC = require('../lib/smpc-parser.js');
assert.equal(SmPC.SECTION_TITLES['2'], undefined);
assert.equal(Object.keys(SmPC.SECTION_TITLES).length, 9);

// The widening migration must exist and must widen storage only.
const migration = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations',
  '20260829213000_drx_v3_allow_composition_section.sql'), 'utf8');
assert.match(migration, /\^\(\?:2\|4\\\.\[1-9\]\)\$/,
  'the migration must admit section 2 alongside 4.1-4.9.');
assert.doesNotMatch(migration, /alter table public\.dose_rules_v3/i,
  'widening storage must not touch what a rule may cite as its dosing source.');

// Dosing stays pinned to 4.2 in the schema of record.
const candidate = fs.readFileSync(
  path.join(ROOT, 'supabase', 'drx-dose-v3-additive-candidate.sql'), 'utf8');
assert.match(candidate, /constraint dose_rules_v3_source_section_check check \(source_section = '4\.2'\)/,
  'dose_rules_v3 must keep citing section 4.2 only.');

// Evidence still does not exist in the database, so nothing may be promoted.
for (const b of proposals.blockedProposals) {
  assert.match(b.why, /not been fetched yet/,
    `${b.sourceKey}: must stay blocked until section 2 is actually archived.`);
}

console.log(`DRx Batch 2 salt equivalence gate passed (${proposals.proposals.length} proposed, ${proposals.blockedProposals.length} blocked on section 2).`);
