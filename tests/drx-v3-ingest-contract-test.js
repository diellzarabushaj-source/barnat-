'use strict';

// Contract for the V3 provenance ingester.
//
// Section text cannot travel through the repository, so it goes straight from
// the archive run into Supabase. That path had no committed code until now,
// which is why the section rows already in production cannot be reproduced.
//
// Two properties matter most here. The ingester must never be able to publish
// anything, and a missing service key must skip loudly rather than either
// failing the archive run or passing silently.

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'ingest-drx-v3-sections.js');
const source = fs.readFileSync(SCRIPT, 'utf8');

// It may only touch the two provenance tables. Everything that can publish a
// dose lives elsewhere, so naming any of it here would be a red flag.
assert.match(source, /dose_source_snapshots_v3/);
assert.match(source, /dose_source_sections_v3/);
for (const forbidden of [
  'dose_products_v3',
  'dose_rules_v3',
  'dose_rule_products_v3',
  'dose_renal_adjustments_v3',
  'dose_hepatic_adjustments_v3',
  'dose_publication_events_v3',
]) {
  assert.ok(!source.includes(forbidden),
    `the ingester must not touch ${forbidden}; it writes provenance, not clinical data.`);
}

// It must rehash what it writes rather than trusting the index it was handed.
assert.match(source, /does not match the archived text/,
  'the ingester must reject an index hash that disagrees with the text.');
assert.match(source, /refusing to ingest an incomplete extraction index/);

function run(env) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--index=/nonexistent-on-purpose.json'], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: error.status, out: String(error.stdout || '') + String(error.stderr || '') };
  }
}

// No credentials: skip, exit 0, and say why. Failing here would paint every
// archive run red over a missing setting.
const skipped = run({ MEDINDEX_SUPABASE_URL: '', MEDINDEX_SUPABASE_SECRET_KEY: '' });
assert.equal(skipped.code, 0, 'a missing service key must not fail the archive run.');
const skipReport = JSON.parse(skipped.out);
assert.equal(skipReport.skipped, true);
assert.match(skipReport.reason, /not configured/);
assert.ok(skipReport.effect && skipReport.toEnable,
  'a skip must state its consequence and how to enable it, or the gap goes invisible again.');

// Credentials present but wrong: fail. A configured-and-broken ingest is a real
// error and must not be swallowed by the same path as "not configured".
const rejected = run({
  MEDINDEX_SUPABASE_URL: 'http://insecure.example',
  MEDINDEX_SUPABASE_SECRET_KEY: 'present',
});
assert.equal(rejected.code, 1, 'a configured but invalid endpoint must fail.');
assert.match(rejected.out, /must be an https URL/);

// The workflow must keep the service key away from the job that parses
// untrusted documents.
const workflow = fs.readFileSync(
  path.join(ROOT, '.github', 'workflows', 'drx-batch2-source-archive.yml'), 'utf8');
const ingestJob = workflow.split(/\n  (?=[a-z][a-z0-9_-]*:\n)/).find(b => b.startsWith('ingest:'));
assert.ok(ingestJob, 'the workflow must define an ingest job.');
assert.match(ingestJob, /ingest-drx-v3-sections\.js/);
assert.match(ingestJob, /permissions:\s*\n\s*contents: read/,
  'ingest writes to Supabase, not git, so it must stay read-only on the repository.');

console.log('DRx V3 ingest contract passed (provenance only; missing key skips loudly, bad key fails).');
