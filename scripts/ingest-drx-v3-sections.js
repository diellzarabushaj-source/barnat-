'use strict';

// Loads Batch 2 source provenance into V3 from CI.
//
// Section text cannot travel through the repository: dose_source_sections_v3
// requires section_text, and the archive attestation deliberately carries
// hashes only so no document text is ever committed. The text therefore has to
// go straight from the archive run into Supabase, which is what
// drx_v3_service_ingestion_grants exists for.
//
// Until now that load happened by hand and left no committed code, so the
// section rows in production could not be reproduced or audited. This script
// is that missing step.
//
// It writes provenance only. It cannot publish anything: it touches
// dose_source_snapshots_v3 and dose_source_sections_v3 and nothing else, and
// every dosing gate lives on tables it never opens.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SHA256_RE = /^[0-9a-f]{64}$/;
const PUBLICATION_ELIGIBLE_TIERS = new Set(['EMA', 'EMC', 'AEMPS_CIMA', 'EU_NATIONAL', 'KOSOVO_AKPPM']);
const ALLOWED_SECTION_CODES = new Set(['2', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9']);

function arg(name) {
  const hit = process.argv.find(v => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const indexPath = path.resolve(arg('index') || path.join(ROOT, 'data', 'drx-batch2-extraction-index-v1.json'));
const archiveDir = path.resolve(arg('archive') || process.env.DRX_ARCHIVE_DIR || path.join(ROOT, 'artifacts', 'drx-batch2-raw'));

// Accept either naming, matching the fallback chain the runtime already uses
// in lib/medindex-data-api.js. The project carries both MEDINDEX_SUPABASE_* and
// bare SUPABASE_* names in different places, and a job that only understood one
// of them would look like a missing credential when the value was simply
// spelled the other way.
//
// Normalise the base: the value is pasted by a human into a secret, and both
// the bare project origin and the full REST base are natural things to paste.
// Appending /rest/v1 to a value that already ends in it produces
// /rest/v1/rest/v1/... , which PostgREST rejects with PGRST125 rather than a
// recognisable "wrong URL" error - which is exactly how this first failed.
function normalizeSupabaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest(?:\/v1)?$/i, '')
    .replace(/\/+$/, '');
}

// Pure-function probe, so the normalisation above is testable without a
// network call or a real key.
const normalizeProbe = arg('normalize-check');
if (normalizeProbe !== null) {
  console.log(normalizeSupabaseUrl(normalizeProbe));
  process.exit(0);
}

const url = normalizeSupabaseUrl(
  process.env.MEDINDEX_SUPABASE_URL
  || process.env.SUPABASE_URL
);
const key = String(
  process.env.MEDINDEX_SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SECRET_KEY
  || process.env.MEDINDEX_SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || ''
).trim();

// Distinguish "not configured" from "configured and broken". A repository
// without the service key cannot ingest, and failing the archive run for that
// would paint every future run red over a missing setting - which trains people
// to ignore the colour. Skip loudly instead, and keep failing hard on anything
// that is a real error.
//
// Skipping is never silent: the reason is printed and the exit is reported as a
// skip, because an unrecorded load is exactly how the section rows already in
// production ended up unreproducible.
const credentialsConfigured = Boolean(url && key);
if (!dryRun && !credentialsConfigured) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'No Supabase URL and service key are visible to this job, so provenance cannot be ingested.',
    checked: ['MEDINDEX_SUPABASE_URL', 'SUPABASE_URL', 'MEDINDEX_SUPABASE_SECRET_KEY', 'SUPABASE_SECRET_KEY', 'MEDINDEX_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    effect: 'dose_source_sections_v3 will not receive section 2, and the blocked base-to-salt mappings stay unproven.',
    toEnable: 'Add the URL and the service role key as GitHub Actions repository secrets. Vercel environment variables are not enough: GitHub Actions cannot read them, so a value set only in Vercel leaves this job with nothing. drx_v3_service_ingestion_grants limits that key to insert and update on the two provenance tables.',
  }, null, 2));
  process.exit(0);
}
// Anything left in the path after normalisation would be prepended to
// /rest/v1/... and produce PGRST125 again, so say so here where the message can
// name the leftover rather than letting PostgREST answer with a code that
// mentions neither the URL nor the setting it came from.
if (!dryRun && credentialsConfigured) {
  let leftover = null;
  try {
    leftover = new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    fail(`The configured Supabase URL is not a valid URL. Check whichever of MEDINDEX_SUPABASE_URL or SUPABASE_URL is set.`);
  }
  if (leftover) {
    fail(`The configured Supabase URL has a leftover path "${leftover}". The value must be the project origin, e.g. https://<project-ref>.supabase.co, with no path after it. A trailing /rest or /rest/v1 is removed automatically; anything else is ambiguous and would be prepended to /rest/v1/...`);
  }
}
if (!dryRun && !url.startsWith('https://')) {
  // Do not name one variable here: the value may have arrived under any of the
  // accepted names, and naming the wrong one sends the reader to the wrong
  // setting.
  fail('The configured Supabase URL must be https. Check whichever of MEDINDEX_SUPABASE_URL or SUPABASE_URL is set.');
}

if (!fs.existsSync(indexPath)) fail(`extraction index not found: ${indexPath}`);
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
if (index.schemaVersion !== 'drx-batch2-extraction-index-v1') {
  fail(`unexpected index schemaVersion: ${index.schemaVersion}`);
}
if (index.complete !== true || index.failedCount !== 0) {
  fail('refusing to ingest an incomplete extraction index.');
}

const batch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drx-dose-batch2-v1.json'), 'utf8'));
const requestedUrlByKey = new Map(batch.substances.map(s => [s.sourceKey, s.url]));

function sha256(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

// Section text lives in the archive directory the fetch wrote, keyed by the
// metadata file each snapshot produced.
// Section text comes from the payload the archive job writes next to the raw
// document. Reading it rather than re-parsing the raw HTML keeps the parser out
// of the only job that holds the Supabase key.
//
// This used to read the metadata file, which does not carry section text at
// all: lib/dose-source-archive.js strips it before writing. The loop therefore
// iterated an empty object, contributed no clinical sections, and the run still
// reported ok - it wrote section 2 alone, because that one value was carried
// separately at the top level. Production ended up with the salt basis on one
// snapshot and the dosing basis on another.
function readSections(row) {
  const where = row.canonicalKey || row.sourceKey || '(unknown)';
  const sectionsPath = row.archiveFiles?.sectionsPath
    ? path.resolve(ROOT, row.archiveFiles.sectionsPath) : null;
  if (!sectionsPath || !fs.existsSync(sectionsPath)) {
    fail(`${where}: archive section payload missing; cannot ingest section text without it. Re-run the archive job so it writes one.`);
  }
  const payload = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
  if (payload.schemaVersion !== 'drx-dose-section-payload-v1') {
    fail(`${where}: unexpected section payload schemaVersion: ${payload.schemaVersion}`);
  }
  if (payload.snapshotId !== row.snapshotId) {
    fail(`${where}: section payload is for snapshot ${payload.snapshotId}, not ${row.snapshotId}.`);
  }

  const out = [];
  for (const [code, section] of Object.entries(payload.sections || {})) {
    if (!ALLOWED_SECTION_CODES.has(code)) continue;
    const text = String(section?.text || '');
    if (!text.trim()) continue;
    out.push({ code, key: section.key || code, heading: section.heading || null, text });
  }

  // A snapshot that yields no dosing section is not a partial success. 4.2 is
  // the section every dose rule must cite, so loading provenance without it
  // would leave rows that look complete and can never support a rule.
  if (!out.some(section => section.code === '4.2')) {
    fail(`${where}: section payload carries no 4.2, so this snapshot cannot support a dose rule. Refusing a partial load.`);
  }
  return out;
}

const snapshots = [];
const sections = [];
for (const row of index.rows) {
  const where = row.canonicalKey || row.sourceKey || '(unknown)';
  if (!SHA256_RE.test(String(row.rawSha256 || ''))) fail(`${where}: rawSha256 is not a digest.`);
  if (row.snapshotId !== row.rawSha256) fail(`${where}: snapshotId must equal rawSha256.`);
  if (!PUBLICATION_ELIGIBLE_TIERS.has(row.sourceTier)) {
    fail(`${where}: tier ${row.sourceTier} is not publication eligible; refusing to ingest.`);
  }
  const requestedUrl = requestedUrlByKey.get(row.sourceKey);
  if (!requestedUrl) fail(`${where}: no requested URL in the Batch 2 source map.`);
  if (!row.documentDate) fail(`${where}: needs a document date or version.`);

  snapshots.push({
    snapshot_id: row.snapshotId,
    source_key: row.sourceKey,
    source_url: requestedUrl,
    final_url: row.finalUrl,
    source_tier: row.sourceTier,
    authority: row.authority,
    jurisdiction: row.jurisdiction || null,
    document_type: 'smpc',
    document_date: row.documentDate,
    fetched_at: row.fetchedAt,
    content_length: row.contentLength,
    raw_sha256: row.rawSha256,
    parser_version: row.parserSchemaVersion,
    archive_locator: process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  });

  for (const section of readSections(row)) {
    // Rehash the text being written rather than trusting the index. A hash
    // that does not match the bytes it labels is worse than no hash.
    const digest = sha256(section.text);
    const claimed = row.sectionSha256?.[section.code];
    if (claimed && claimed !== digest) {
      fail(`${where} section ${section.code}: index hash ${claimed} does not match the archived text.`);
    }
    sections.push({
      snapshot_id: row.snapshotId,
      section_code: section.code,
      section_key: section.key,
      heading: section.heading,
      section_text: section.text,
      section_sha256: digest,
      parser_version: row.parserSchemaVersion,
      extraction_status: 'extracted',
    });
  }
}

const summary = {
  snapshots: snapshots.length,
  sections: sections.length,
  sectionsByCode: sections.reduce((acc, s) => {
    acc[s.section_code] = (acc[s.section_code] || 0) + 1;
    return acc;
  }, {}),
};

if (dryRun) {
  console.log(JSON.stringify({ ok: true, dryRun: true, ...summary }, null, 2));
  process.exit(0);
}

async function post(table, rows, conflictTarget) {
  const requestPath = `/rest/v1/${table}?on_conflict=${conflictTarget}`;
  const response = await fetch(`${url}${requestPath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const body = await response.text();
    // Name the path, never the host: the host is the masked secret, and the
    // path is the half that is actually wrong when PostgREST answers PGRST125.
    fail(`${table} ingest failed (${response.status}) for path ${requestPath}: ${body.slice(0, 500)}`);
  }
}

(async () => {
  await post('dose_source_snapshots_v3', snapshots, 'snapshot_id');
  await post('dose_source_sections_v3', sections, 'snapshot_id,section_code');

  console.log(JSON.stringify({
    ok: true,
    ...summary,
    // snapshot_id is derived from raw bytes, which change on every fetch even
    // when the document does not, so each run adds snapshot rows rather than
    // updating them. Reported so the churn stays visible.
    // See data/drx-snapshot-identity-instability-v1.json.
    note: 'Snapshot identity is fetch-derived; repeated runs accumulate snapshot rows for unchanged documents.',
  }, null, 2));
})();
