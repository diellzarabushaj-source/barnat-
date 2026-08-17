'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { neonRequest } = require('../lib/neon-data-api.js');

const MIN_REGISTRY = 501;
const MAX_REGISTRY = 4012;
const CHUNK_SIZE = 250;
const EXPECTED_VERIFIED = 3389;
const EXPECTED_IN_REVIEW = 123;
const MASTER_FILE = path.resolve(__dirname, '..', 'ped-sync-master.tsv');

const FIELDS = Object.freeze([
  'pediatric_dose_summary',
  'pediatric_indication',
  'pediatric_use_status',
  'pediatric_min_age_value',
  'pediatric_min_age_unit',
  'pediatric_max_age_value',
  'pediatric_max_age_unit',
  'pediatric_min_weight_kg',
  'pediatric_max_weight_kg',
  'pediatric_dose_min',
  'pediatric_dose_max',
  'pediatric_dose_unit',
  'pediatric_dose_basis',
  'pediatric_doses_per_day',
  'pediatric_interval_hours',
  'pediatric_max_single_value',
  'pediatric_max_single_unit',
  'pediatric_max_daily_value',
  'pediatric_max_daily_unit',
  'pediatric_route',
  'pediatric_restriction',
  'pediatric_concentration_value',
  'pediatric_concentration_unit',
  'pediatric_concentration_per_value',
  'pediatric_concentration_per_unit',
  'pediatric_source_url',
  'pediatric_source_section',
  'pediatric_verification_status',
  'pediatric_verified_at',
  'pediatric_primary_regimen_id',
]);

function cleanTsv(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

async function loadChunk(start, end) {
  const select = ['registry_number', ...FIELDS].join(',');
  const query = `drugs?select=${encodeURIComponent(select)}`
    + `&registry_number=gte.${start}`
    + `&registry_number=lte.${end}`
    + '&order=registry_number.asc'
    + `&limit=${end - start + 1}`;
  const { data } = await neonRequest(query, {
    timeoutMs:15000,
    label:`Pediatric static export ${start}-${end}`,
  });
  const rows = Array.isArray(data) ? data : [];
  const expected = end - start + 1;
  if (rows.length !== expected) throw new Error(`Expected ${expected} rows for ${start}-${end}; received ${rows.length}.`);
  rows.forEach((row, index) => {
    const registry = start + index;
    if (Number(row.registry_number) !== registry) throw new Error(`Registry sequence mismatch: expected ${registry}.`);
    const expectedRegimen = `card:${registry}:pediatric`;
    if (cleanTsv(row.pediatric_primary_regimen_id) !== expectedRegimen) {
      throw new Error(`Regimen mismatch for registry ${registry}.`);
    }
  });
  return rows;
}

(async () => {
  if (!process.env.VERCEL) {
    console.log('Temporary pediatric static export skipped outside Vercel.');
    return;
  }

  if (!fs.existsSync(MASTER_FILE)) throw new Error('Tracked ped-sync-master.tsv placeholder is missing.');

  let total = 0;
  let verified = 0;
  let inReview = 0;
  const lines = [];

  for (let start = MIN_REGISTRY; start <= MAX_REGISTRY; start += CHUNK_SIZE) {
    const end = Math.min(MAX_REGISTRY, start + CHUNK_SIZE - 1);
    const rows = await loadChunk(start, end);
    for (const row of rows) {
      lines.push(FIELDS.map(field => cleanTsv(row[field])).join('\t'));
      total += 1;
      const status = cleanTsv(row.pediatric_verification_status).toLowerCase();
      if (status === 'verified') verified += 1;
      else if (status === 'in_review') inReview += 1;
      else throw new Error(`Unexpected verification status '${status}' at registry ${row.registry_number}.`);
    }
  }

  const expectedTotal = MAX_REGISTRY - MIN_REGISTRY + 1;
  if (total !== expectedTotal || lines.length !== expectedTotal) {
    throw new Error(`Pediatric export row count mismatch: ${total}/${expectedTotal}.`);
  }
  if (verified !== EXPECTED_VERIFIED || inReview !== EXPECTED_IN_REVIEW) {
    throw new Error(`Pediatric export verification counts mismatch: verified=${verified}, in_review=${inReview}.`);
  }

  fs.writeFileSync(MASTER_FILE, lines.join('\n'), 'utf8');
  console.log(`Temporary tracked pediatric static export ready: ${total} rows, ${verified} verified, ${inReview} in_review, ${FIELDS.length} columns.`);
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
