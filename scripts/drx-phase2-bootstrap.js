'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
const { neonRequest } = require('../lib/medindex-data-api.js');

const REGISTRY_URL = 'https://drive.usercontent.google.com/download?id=1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd&export=download&confirm=t';
const REGISTRY_SOURCE_REF = 'gdrive:1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd';
const CORRECTIONS_URL = 'https://docs.google.com/spreadsheets/d/1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo/export?format=xlsx';
const CORRECTIONS_SOURCE_REF = 'gsheet:1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo#KORRIGJIMET_E_REGJISTRIT';
const EXPECTED_REGISTRY_ROWS = 4006;
const EXPECTED_CORRECTIONS = 107;
const EXPECTED_TOTAL_DRUGS = 4015;
const CHUNK = 250;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

async function download(url, label) {
  const response = await fetch(url, {
    redirect:'follow',
    cache:'no-store',
    headers:{ 'User-Agent':'DRx-Phase2-Bootstrap/1.0' },
  });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`${label}: empty download`);
  return {
    buffer,
    sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
    lastModified:response.headers.get('last-modified') || null,
  };
}

async function rpc(name, body = {}) {
  const { data } = await neonRequest(`rpc/${name}`, {
    method:'POST',
    body,
    prefer:'return=representation',
  });
  return data;
}

function registryRows(buffer) {
  const workbook = XLSX.read(buffer, { type:'buffer', cellDates:true });
  const sheet = workbook.Sheets.Sheet1;
  if (!sheet) throw new Error('Registry XLSX is missing Sheet1.');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false });
  const headers = (matrix[0] || []).map(clean);
  const rows = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const values = matrix[index] || [];
    const registryNumber = clean(values[0]);
    if (!/^\d+$/.test(registryNumber)) continue;
    const rawPayload = {};
    headers.forEach((header, column) => {
      if (!header) return;
      const value = clean(values[column]);
      rawPayload[header] = value || null;
    });
    rows.push({ source_row_number:index + 1, raw_payload:rawPayload });
  }
  if (rows.length !== EXPECTED_REGISTRY_ROWS) {
    throw new Error(`Registry source row count mismatch: expected ${EXPECTED_REGISTRY_ROWS}, got ${rows.length}`);
  }
  if (clean(rows[0]?.raw_payload?.['Nr rendor']) !== '1'
      || clean(rows.at(-1)?.raw_payload?.['Nr rendor']) !== String(EXPECTED_REGISTRY_ROWS)) {
    throw new Error('Registry first/last row guard failed.');
  }
  return rows;
}

function extractEvidenceUrls(sheet, rowNumber, displayedValue) {
  const cell = sheet[`J${rowNumber}`] || {};
  const values = [];
  if (cell.l?.Target) values.push(cell.l.Target);
  const formula = clean(cell.f);
  const match = formula.match(/^HYPERLINK\(\s*"([^"]+)"/i);
  if (match) values.push(match[1]);
  const displayed = clean(displayedValue);
  if (/^https:\/\//i.test(displayed)) {
    displayed.split(/\s*;\s*/).forEach(url => values.push(url));
  }
  return [...new Set(values.map(clean).filter(url => /^https:\/\//i.test(url)))];
}

function correctionRows(buffer) {
  const workbook = XLSX.read(buffer, { type:'buffer', cellDates:true });
  const sheet = workbook.Sheets.KORRIGJIMET_E_REGJISTRIT;
  if (!sheet) throw new Error('Corrections workbook is missing KORRIGJIMET_E_REGJISTRIT.');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false });
  const headers = (matrix[0] || []).map(clean);
  const rows = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const values = matrix[index] || [];
    const correctionId = clean(values[0]);
    if (!correctionId) continue;
    const rawPayload = {};
    headers.forEach((header, column) => {
      if (!header) return;
      const value = clean(values[column]);
      rawPayload[header] = value || null;
    });
    const sourceRowNumber = index + 1;
    const evidenceUrls = extractEvidenceUrls(sheet, sourceRowNumber, values[9]);
    rows.push({
      source_row_number:sourceRowNumber,
      raw_payload:rawPayload,
      evidence_urls:evidenceUrls,
    });
  }
  if (rows.length !== EXPECTED_CORRECTIONS) {
    throw new Error(`Correction row count mismatch: expected ${EXPECTED_CORRECTIONS}, got ${rows.length}`);
  }
  const withoutEvidence = rows.filter(row => row.evidence_urls.length === 0);
  if (withoutEvidence.length) {
    throw new Error(`Verified corrections without evidence URL: ${withoutEvidence.map(row => row.raw_payload.CorrectionID).join(', ')}`);
  }
  return rows;
}

async function main() {
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.MEDINDEX_SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY is required.');
  }

  const registry = await download(REGISTRY_URL, 'Official registry');
  const corrections = await download(CORRECTIONS_URL, 'Correction workbook');
  const rawRows = registryRows(registry.buffer);
  const correctionSourceRows = correctionRows(corrections.buffer);

  const registryBatchId = await rpc('drx_registry_begin_import_v1', {
    p_batch_kind:'REGISTRY_RAW',
    p_source_type:'google_drive_xlsx',
    p_source_ref:REGISTRY_SOURCE_REF,
    p_source_revision:registry.lastModified,
    p_source_sha256:registry.sha256,
    p_source_row_count:rawRows.length,
    p_metadata:{
      file_id:'1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd',
      file_name:'Regjistri-i-Barnave-me-Klase-dhe-Perdorime.xlsx',
      official_registry:true,
      bootstrap:'github-actions',
    },
  });
  if (!registryBatchId) throw new Error('Official registry batch id is missing.');

  let registryFinalize = null;
  try {
    registryFinalize = await rpc('drx_registry_finalize_import_v1', { p_batch_id:registryBatchId });
  } catch (error) {
    if (!/row count mismatch/i.test(String(error?.message || error))) throw error;
  }

  if (registryFinalize?.status !== 'FINALIZED'
      || Number(registryFinalize?.preserved_row_count) !== EXPECTED_REGISTRY_ROWS) {
    for (let index = 0; index < rawRows.length; index += CHUNK) {
      await rpc('drx_registry_append_rows_v1', {
        p_batch_id:registryBatchId,
        p_rows:rawRows.slice(index, index + CHUNK),
      });
    }
    registryFinalize = await rpc('drx_registry_finalize_import_v1', { p_batch_id:registryBatchId });
  }

  if (registryFinalize?.status !== 'FINALIZED'
      || Number(registryFinalize?.preserved_row_count) !== EXPECTED_REGISTRY_ROWS) {
    throw new Error(`Registry finalize gate failed: ${JSON.stringify(registryFinalize)}`);
  }

  const correctionDigest = crypto.createHash('sha256')
    .update(JSON.stringify(correctionSourceRows))
    .digest('hex');
  const correctionBatchId = await rpc('drx_registry_begin_correction_import_v1', {
    p_source_ref:CORRECTIONS_SOURCE_REF,
    p_source_revision:corrections.lastModified,
    p_source_sha256:correctionDigest,
    p_source_row_count:correctionSourceRows.length,
  });
  if (!correctionBatchId) throw new Error('Correction batch id is missing.');

  let correctionImport = null;
  try {
    correctionImport = await rpc('drx_registry_finalize_correction_import_v1', {
      p_batch_id:correctionBatchId,
    });
  } catch (error) {
    if (!/incomplete/i.test(String(error?.message || error))) throw error;
  }

  if (Number(correctionImport?.preserved_row_count) !== EXPECTED_CORRECTIONS
      || Number(correctionImport?.corrections) !== EXPECTED_CORRECTIONS
      || correctionImport?.status !== 'FINALIZED') {
    for (let index = 0; index < correctionSourceRows.length; index += 10) {
      await rpc('drx_registry_append_corrections_v1', {
        p_batch_id:correctionBatchId,
        p_rows:correctionSourceRows.slice(index, index + 10),
      });
    }
    correctionImport = await rpc('drx_registry_finalize_correction_import_v1', {
      p_batch_id:correctionBatchId,
    });
  }

  if (Number(correctionImport?.preserved_row_count) !== EXPECTED_CORRECTIONS
      || Number(correctionImport?.corrections) !== EXPECTED_CORRECTIONS
      || correctionImport?.status !== 'FINALIZED') {
    throw new Error(`Correction finalize gate failed: ${JSON.stringify(correctionImport)}`);
  }

  const applied = await rpc('drx_registry_apply_corrections_v1', {});
  const status = await rpc('drx_registry_phase2_status_v1', {});

  const official = (status?.batches || []).find(batch =>
    batch.batch_kind === 'REGISTRY_RAW' && batch.source_sha256 === registry.sha256
  );
  const legacy = (status?.batches || []).find(batch => batch.batch_kind === 'LEGACY_EDITORIAL');
  const correctionBatch = (status?.batches || []).find(batch =>
    batch.batch_kind === 'CORRECTION_SHEET' && batch.source_sha256 === correctionDigest
  );

  const assertions = {
    officialRegistryRows:official?.preserved_row_count === EXPECTED_REGISTRY_ROWS,
    officialRegistryFinalized:official?.status === 'FINALIZED',
    legacyEditorialRows:legacy?.preserved_row_count === 9,
    correctionRows:correctionBatch?.preserved_row_count === EXPECTED_CORRECTIONS,
    correctionBatchFinalized:correctionBatch?.status === 'FINALIZED',
    correctionsVerified:Number(status?.verified_corrections) === EXPECTED_CORRECTIONS,
    correctionsWithEvidence:Number(status?.corrections_with_evidence) === EXPECTED_CORRECTIONS,
    reconstructionRows:Number(status?.reconstruction_rows) === EXPECTED_TOTAL_DRUGS,
    reconstructionDiffsZero:Number(status?.reconstruction_diffs) === 0,
    anomaliesExpected:Number(status?.open_anomalies) === 7,
    publicationClosed:status?.publication_allowed === false,
  };
  const failed = Object.entries(assertions).filter(([,ok]) => !ok).map(([key]) => key);
  if (failed.length) {
    throw new Error(`DRx Phase 2 gate failed: ${failed.join(', ')}; status=${JSON.stringify(status)}`);
  }

  const evidence = {
    schemaVersion:'drx-phase2-bootstrap-evidence-v1',
    status:'PASS',
    generatedAt:new Date().toISOString(),
    source:{
      registry:{
        ref:REGISTRY_SOURCE_REF,
        sha256:registry.sha256,
        rows:rawRows.length,
        lastModified:registry.lastModified,
      },
      corrections:{
        ref:CORRECTIONS_SOURCE_REF,
        sha256:correctionDigest,
        rows:correctionSourceRows.length,
        lastModified:corrections.lastModified,
      },
    },
    registryFinalize,
    correctionImport,
    applied,
    statusSnapshot:status,
    assertions,
    publicationAllowed:false,
  };
  fs.writeFileSync('drx-phase2-bootstrap-evidence.json', JSON.stringify(evidence,null,2) + '\n');
  console.log(JSON.stringify({
    phase2:'PASS',
    registryRows:rawRows.length,
    corrections:correctionSourceRows.length,
    applied,
    openAnomalies:status.open_anomalies,
    reconstructionDiffs:status.reconstruction_diffs,
  }));
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
