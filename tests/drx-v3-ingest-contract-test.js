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
const BLANK = {
  MEDINDEX_SUPABASE_URL: '', SUPABASE_URL: '',
  MEDINDEX_SUPABASE_SECRET_KEY: '', SUPABASE_SECRET_KEY: '',
  MEDINDEX_SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
};

const skipped = run(BLANK);
assert.equal(skipped.code, 0, 'a missing service key must not fail the archive run.');
const skipReport = JSON.parse(skipped.out);
assert.equal(skipReport.skipped, true);
assert.ok(skipReport.effect && skipReport.toEnable,
  'a skip must state its consequence and how to enable it, or the gap goes invisible again.');
assert.match(skipReport.toEnable, /Vercel environment variables are not enough/,
  'the skip must warn that a value set only in Vercel is invisible to Actions.');
assert.ok(Array.isArray(skipReport.checked) && skipReport.checked.length >= 4,
  'the skip must list the names it looked for, so a naming mismatch is diagnosable.');

// Either naming must work. The project uses MEDINDEX_SUPABASE_* in CI and bare
// SUPABASE_* elsewhere, and a value spelled the other way must not read as
// missing. Reaching the https check proves the credentials were found.
for (const [label, env] of [
  ['MEDINDEX naming', { ...BLANK, MEDINDEX_SUPABASE_URL: 'http://insecure.example', MEDINDEX_SUPABASE_SECRET_KEY: 'present' }],
  ['bare naming', { ...BLANK, SUPABASE_URL: 'http://insecure.example', SUPABASE_SECRET_KEY: 'present' }],
  ['service role naming', { ...BLANK, SUPABASE_URL: 'http://insecure.example', SUPABASE_SERVICE_ROLE_KEY: 'present' }],
]) {
  const rejected = run(env);
  assert.equal(rejected.code, 1, `${label}: a configured but invalid endpoint must fail, not skip.`);
  assert.match(rejected.out, /must be https/, `${label}: credentials must have been found.`);
}

// The base URL is pasted by hand into a secret, and both the bare origin and
// the full REST base are natural things to paste. Appending /rest/v1 to a value
// that already ends in it yields /rest/v1/rest/v1/..., which PostgREST rejects
// with PGRST125 - an error that names neither the URL nor the setting. That is
// exactly how the first credentialed run failed, so pin the normalisation.
function normalized(input) {
  return execFileSync(process.execPath, [SCRIPT, `--normalize-check=${input}`], {
    encoding: 'utf8',
  }).trim();
}

const ORIGIN = 'https://example.supabase.co';
for (const variant of [
  ORIGIN,
  `${ORIGIN}/`,
  `${ORIGIN}//`,
  `${ORIGIN}/rest`,
  `${ORIGIN}/rest/v1`,
  `${ORIGIN}/rest/v1/`,
  `${ORIGIN}/REST/V1`,
  `  ${ORIGIN}/rest/v1  `,
]) {
  assert.equal(normalized(variant), ORIGIN,
    `"${variant}" must normalise to the bare origin, or the request path doubles up.`);
}

// Normalisation must not eat a path that merely contains the segment.
assert.equal(normalized(`${ORIGIN}/rest/v1/dose_source_sections_v3`),
  `${ORIGIN}/rest/v1/dose_source_sections_v3`,
  'only a trailing /rest/v1 is redundant; anything after it is a real path.');

// A stray path that normalisation cannot safely strip must be named, not
// silently prepended to /rest/v1/... where it becomes another bare PGRST125.
const strayPath = run({
  ...BLANK, SUPABASE_URL: 'https://example.supabase.co/api/v2', SUPABASE_SECRET_KEY: 'present',
});
assert.equal(strayPath.code, 1, 'a URL with a leftover path must fail rather than build a bad request path.');
assert.match(strayPath.out, /leftover path \\"\/api\/v2\\"/,
  'the failure must quote the leftover path, since that is the part to delete from the secret.');

// A failing request must name the path it asked for. The host is the masked
// secret and is useless in a log; the path is the half that was wrong.
assert.match(source, /for path \$\{requestPath\}/,
  'an ingest failure must report the request path so PGRST125 is diagnosable.');

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
