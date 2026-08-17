'use strict';

const { neonRequest } = require('../lib/neon-data-api');

const MIN_REGISTRY = 501;
const MAX_REGISTRY = 4012;
const MAX_ROWS = 250;

const FIELDS = [
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
];

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const start = integer(req.query?.start);
  const end = integer(req.query?.end);
  if (start === null || end === null || start < MIN_REGISTRY || end > MAX_REGISTRY || end < start || (end - start + 1) > MAX_ROWS) {
    return res.status(400).send(`Use start/end inside ${MIN_REGISTRY}-${MAX_REGISTRY}, maximum ${MAX_ROWS} rows.`);
  }

  try {
    const select = ['registry_number', ...FIELDS].join(',');
    const path = `drugs?select=${encodeURIComponent(select)}&registry_number=gte.${start}&registry_number=lte.${end}&order=registry_number.asc&limit=${MAX_ROWS}`;
    const { data } = await neonRequest(path, { timeoutMs:12000, label:'Pediatric master export' });
    const rows = Array.isArray(data) ? data : [];
    const expected = end - start + 1;
    if (rows.length !== expected) {
      return res.status(409).send(`Expected ${expected} rows, received ${rows.length}.`);
    }
    for (let i = 0; i < rows.length; i += 1) {
      if (Number(rows[i].registry_number) !== start + i) {
        return res.status(409).send(`Registry sequence mismatch at ${start + i}.`);
      }
    }

    const tsv = rows.map(row => FIELDS.map(field => clean(row[field])).join('\t')).join('\n');
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-MedIndex-Migration', 'pediatric-master-20260817');
    return res.status(200).send(tsv);
  } catch (error) {
    console.error('[pediatric-master-export]', error);
    return res.status(503).send('Pediatric master export unavailable.');
  }
};
