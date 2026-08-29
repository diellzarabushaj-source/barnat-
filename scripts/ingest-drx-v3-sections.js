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

const url = String(process.env.MEDINDEX_SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(process.env.MEDINDEX_SUPABASE_SECRET_KEY || '');

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
    reason: 'MEDINDEX_SUPABASE_URL and MEDINDEX_SUPABASE_SECRET_KEY are not configured for this repository, so provenance cannot be ingested.',
    effect: 'dose_source_sections_v3 will not receive section 2, and the blocked base-to-salt mappings stay unproven.',
    toEnable: 'Add both repository secrets. The key must be the Supabase service role key, which drx_v3_service_ingestion_grants grants insert and update on the two provenance tables only.',
  }, null, 2));
  process.exit(0);
}
if (!dryRun && (!url.startsWith('https://'))) {
  fail('MEDINDEX_SUPABASE_URL must be an https URL.');
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
function readSections(row) {
  const metaPath = row.archiveFiles?.metaPath ? path.resolve(ROOT, row.archiveFiles.metaPath) : null;
  if (!metaPath || !fs.existsSync(metaPath)) {
    fail(`${row.canonicalKey}: archive metadata missing; cannot ingest section text without it.`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const sections = meta.sections || meta.parsed?.sections || {};
  const composition = meta.composition || null;
  const out = [];
  for (const [code, section] of Object.entries(sections)) {
    if (!ALLOWED_SECTION_CODES.has(code)) continue;
    const text = String(section?.text || '');
    if (!text.trim()) continue;
    out.push({ code, key: section.key || code, heading: section.heading || null, text });
  }
  if (composition && String(composition.text || '').trim()) {
    out.push({
      code: composition.code,
      key: composition.key,
      heading: composition.heading || null,
      text: String(composition.text),
    });
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
  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflictTarget}`, {
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
    fail(`${table} ingest failed (${response.status}): ${body.slice(0, 500)}`);
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
