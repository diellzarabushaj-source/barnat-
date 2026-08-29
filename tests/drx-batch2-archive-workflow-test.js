'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const yml=fs.readFileSync(path.join(__dirname,'..','.github','workflows','drx-batch2-source-archive.yml'),'utf8');
const builder=fs.readFileSync(path.join(__dirname,'..','scripts','build-drx-batch2-extraction-index.js'),'utf8');
assert.match(yml,/workflow_dispatch:/);
assert.match(yml,/permissions:\s*\n\s*contents: read/);
assert.match(yml,/DRX_ARCHIVE_DIR: artifacts\/drx-batch2-raw/);
assert.match(yml,/build-drx-batch2-extraction-index\.js/);
assert.match(yml,/tests\/drx-batch2-archive-verifier-test\.js/);
assert.match(yml,/verify-drx-batch2-archive\.js/);
assert.match(yml,/--expected=25/);
assert.match(yml,/actions\/upload-artifact@v4/);
assert.match(yml,/retention-days: 90/);

// The archive job fetches and parses untrusted external documents, so it must
// never hold a writable token: a parser exploited by a malicious document would
// otherwise be able to push code. Write access belongs only to the attest job,
// which makes no network requests and parses no fetched documents.
//
// This used to be enforced as "the file contains no `contents: write` and no
// `git push` anywhere". That was replaced by a per-job check when attestation
// was added, so the same guarantee is now asserted where it actually matters
// rather than by forbidding the strings outright.
const jobs = yml.split(/\n  (?=[a-z][a-z0-9_-]*:\n)/);
const archiveJob = jobs.find(block => block.startsWith('archive:'));
const attestJob = jobs.find(block => block.startsWith('attest:'));
assert.ok(archiveJob, 'workflow must define an archive job.');
assert.ok(attestJob, 'workflow must define a separate attest job.');

assert.doesNotMatch(archiveJob, /contents: write/,
  'the archive job must never hold write access.');
assert.doesNotMatch(archiveJob, /git push/,
  'the archive job must never push.');
assert.match(archiveJob, /permissions:\s*\n\s*contents: read/,
  'the archive job must pin read-only permissions.');

// The Supabase service key must never be held by the job that fetches and
// parses untrusted external documents, for the same reason a writable token
// must not be: an exploited parser would gain write access to production data.
const ingestJob = jobs.find(block => block.startsWith('ingest:'));
assert.ok(ingestJob, 'workflow must define a separate ingest job.');
assert.doesNotMatch(archiveJob, /MEDINDEX_SUPABASE/,
  'the archive job must never hold Supabase credentials.');
assert.doesNotMatch(attestJob, /MEDINDEX_SUPABASE/,
  'the attest job does not write to Supabase and must not hold its credentials.');
assert.match(ingestJob, /MEDINDEX_SUPABASE_SECRET_KEY/,
  'the ingest job is the only job that may hold the service key.');
assert.match(ingestJob, /permissions:\s*\n\s*contents: read/,
  'ingest writes to Supabase, not the repository, so it stays read-only on git.');
assert.match(ingestJob, /needs: archive/);
assert.doesNotMatch(ingestJob, /build-drx-batch2-extraction-index\.js/,
  'the credentialed job must not run the fetching/parsing script.');

assert.match(attestJob, /needs: archive/,
  'attestation must run only after a successful archive.');
assert.match(attestJob, /permissions:\s*\n\s*contents: write/,
  'the attest job is the only job allowed to write.');
assert.doesNotMatch(attestJob, /build-drx-batch2-extraction-index\.js/,
  'the writable job must not run the fetching/parsing script.');
assert.match(attestJob, /build-drx-batch2-archive-attestation\.js/);
assert.match(builder,/process\.env\.DRX_ARCHIVE_DIR|env\?\.DRX_ARCHIVE_DIR/);
assert.match(builder,/archiveDirectory:archiveDirectory \|\| undefined/);
console.log('DRx Batch 2 archive workflow contract passed.');
