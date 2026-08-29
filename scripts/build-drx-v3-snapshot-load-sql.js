'use strict';

// Emits SQL that loads Batch 2 source provenance into dose_source_snapshots_v3.
//
// The rows come from the CI attestation, so every snapshot_id is a real
// sha256 of a document GitHub Actions actually fetched. Nothing here is
// invented: the only field not carried by the attestation is the originally
// requested URL, which is read from the Batch 2 source map that drove the
// fetch in the first place.
//
// This loads provenance only. It cannot load dose_source_sections_v3, because
// that table requires section_text and the attestation deliberately carries no
// document text - see the note printed at the end.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ATTESTATION = path.join(ROOT, 'data', 'drx-batch2-archive-attestation-v1.json');
const BATCH = path.join(ROOT, 'data', 'drx-dose-batch2-v1.json');
const SHA256_RE = /^[0-9a-f]{64}$/;
const PUBLICATION_ELIGIBLE_TIERS = new Set(['EMA', 'EMC', 'AEMPS_CIMA', 'EU_NATIONAL', 'KOSOVO_AKPPM']);

function quote(value) {
  if (value === null || value === undefined || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function number(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'null';
  return String(Number(value));
}

const attestation = JSON.parse(fs.readFileSync(ATTESTATION, 'utf8'));
if (attestation.ci?.authoritative !== true) {
  throw new Error('refusing to load from a non-authoritative attestation.');
}

const batch = JSON.parse(fs.readFileSync(BATCH, 'utf8'));
const requestedUrlByKey = new Map(batch.substances.map(s => [s.sourceKey, s.url]));

const values = [];
for (const row of attestation.rows) {
  const requestedUrl = requestedUrlByKey.get(row.sourceKey);
  if (!requestedUrl) throw new Error(`${row.sourceKey}: no requested URL in the Batch 2 source map.`);
  if (!SHA256_RE.test(row.rawSha256)) throw new Error(`${row.sourceKey}: rawSha256 is not a digest.`);
  if (row.snapshotId !== row.rawSha256) throw new Error(`${row.sourceKey}: snapshotId must equal rawSha256.`);
  if (!requestedUrl.startsWith('https://') || !row.finalUrl.startsWith('https://')) {
    throw new Error(`${row.sourceKey}: both URLs must be https.`);
  }
  if (!row.documentDate) throw new Error(`${row.sourceKey}: needs a document date or version.`);

  values.push('  (' + [
    quote(row.snapshotId),
    quote(row.sourceKey),
    quote(requestedUrl),
    quote(row.finalUrl),
    quote(row.sourceTier),
    quote(row.authority),
    quote(row.jurisdiction),
    quote('smpc'),
    quote(row.documentDate),
    quote(row.fetchedAt) + '::timestamptz',
    number(row.contentLength),
    quote(row.rawSha256),
    quote(row.parserSchemaVersion),
    // Points a reviewer back at the CI run whose artifact holds the raw bytes.
    quote(attestation.ci.runUrl),
  ].join(', ') + ')');
}

const sql = `-- Batch 2 source provenance for dose_source_snapshots_v3.
-- Generated from data/drx-batch2-archive-attestation-v1.json
-- CI run: ${attestation.ci.runUrl}
-- Rows: ${values.length}
insert into public.dose_source_snapshots_v3 (
  snapshot_id, source_key, source_url, final_url, source_tier, authority,
  jurisdiction, document_type, document_date, fetched_at, content_length,
  raw_sha256, parser_version, archive_locator
)
values
${values.join(',\n')}
on conflict (snapshot_id) do nothing;
`;

const outArg = process.argv.find(a => a.startsWith('--output='));
if (outArg) {
  const outPath = path.resolve(outArg.slice('--output='.length));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sql, 'utf8');
}

if (process.argv.includes('--print')) {
  process.stdout.write(sql);
} else {
  const ineligible = attestation.rows.filter(r => !PUBLICATION_ELIGIBLE_TIERS.has(r.sourceTier));
  console.log(JSON.stringify({
    ok: true,
    rows: values.length,
    runUrl: attestation.ci.runUrl,
    tiers: [...new Set(attestation.rows.map(r => r.sourceTier))],
    publicationIneligibleRows: ineligible.length,
    sectionsLoadable: false,
    sectionsBlockedBy: 'dose_source_sections_v3.section_text is NOT NULL and the attestation carries no document text by design. Sections must be loaded straight from CI into Supabase, never through the repository.',
  }, null, 2));
}
