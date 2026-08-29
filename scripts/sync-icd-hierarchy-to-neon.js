'use strict';

const crypto = require('node:crypto');
const IcdPublicSource = require('../lib/icd-public-source.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const HierarchyValidation = require('../lib/icd-hierarchy-validation.js');
const { neonRequest, dataOf } = require('../lib/medindex-data-api.js');

const REVISION_TABLE = 'icd_hierarchy_revisions';
const NODES_TABLE = 'icd_hierarchy_nodes';
const BATCH_SIZE = 100;
const BATCH_TIMEOUT_MS = 60000;

const clean = value => String(value ?? '').trim();
const hash = value => crypto.createHash('sha256').update(String(value ?? '')).digest('base64url');

function batch(values, size = BATCH_SIZE) {
  const source = Array.isArray(values) ? values : [];
  const width = Math.max(1, Number(size) || BATCH_SIZE);
  const chunks = [];
  for (let index = 0; index < source.length; index += width) chunks.push(source.slice(index, index + width));
  return chunks;
}

function nodeRecord(node, dataset, revision) {
  const breadcrumb = [
    ...FullIcd.ancestorsOf(dataset, node.code),
    node,
  ];
  const pathText = breadcrumb
    .map(item => `${clean(item.code)} ${clean(item.displayTitle || item.albanianDraft || item.englishTitle)}`.trim())
    .filter(Boolean)
    .join(' › ');
  const record = {
    revision,
    code:clean(node.code),
    level_name:clean(node.level),
    chapter_code:clean(node.chapter),
    block_code:clean(node.block) || null,
    parent_code:clean(node.parentCode) || null,
    title_en:clean(node.englishTitle),
    title_sq:clean(node.albanianDraft) || null,
    display_title:clean(node.displayTitle) || clean(node.albanianDraft) || clean(node.englishTitle),
    translation_status:clean(node.translationStatus) || 'missing',
    path_text:pathText || null,
    source_url:clean(node.sourceUrl) || null,
    source_row:Number(node.sourceRow || 0),
    search_text:clean(node.searchText),
    is_published:true,
    updated_at:new Date().toISOString(),
  };
  record.source_hash = hash(JSON.stringify([
    record.code,
    record.level_name,
    record.chapter_code,
    record.block_code,
    record.parent_code,
    record.title_en,
    record.title_sq,
    record.translation_status,
    record.path_text,
    record.source_url,
    record.source_row,
  ]));
  return record;
}

function revisionRecord(loaded) {
  const counts = loaded?.data?.counts || {};
  return {
    revision:clean(loaded?.sourceRevision),
    spreadsheet_id:IcdPublicSource.SPREADSHEET_ID,
    sheet_name:IcdPublicSource.SHEET_NAME,
    sheet_gid:IcdPublicSource.SHEET_GID,
    source_hash:clean(loaded?.sourceRevision),
    source_bytes:Number(loaded?.csvBytes || 0),
    header_row:Number(loaded?.headerRow || 0) || null,
    counts:{
      total:Number(counts.total || 0),
      chapter:Number(counts.chapter || 0),
      block:Number(counts.block || 0),
      category:Number(counts.category || 0),
      subcategory:Number(counts.subcategory || 0),
    },
    status:'staging',
    error_summary:null,
    imported_at:new Date().toISOString(),
    activated_at:null,
  };
}

function validateLoaded(loaded) {
  const nodes = loaded?.data?.nodes;
  const validation = HierarchyValidation.validate(Array.isArray(nodes) ? nodes : [], { strictCounts:true });
  if (!clean(loaded?.sourceRevision)) throw new Error('Revision-i i Google Sheet-it ICD mungon.');
  if (loaded?.sourceType !== 'google-sheet') throw new Error('Importi duhet të lexojë drejtpërdrejt Google Sheet-in editorial.');
  return validation;
}

async function existingRevision(revision) {
  const select = encodeURIComponent('revision,status,counts,activated_at');
  const result = await neonRequest(`/${REVISION_TABLE}?revision=eq.${encodeURIComponent(revision)}&select=${select}&limit=1`, {
    timeoutMs:8000,
    label:'ICD hierarchy existing revision',
  });
  const rows = dataOf(result);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertRevision(record) {
  return neonRequest(`/${REVISION_TABLE}?on_conflict=revision`, {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=representation',
    body:[record],
    timeoutMs:12000,
    label:'ICD hierarchy revision staging',
  });
}

async function deleteRevisionNodes(revision) {
  return neonRequest(`/${NODES_TABLE}?revision=eq.${encodeURIComponent(revision)}`, {
    method:'DELETE',
    prefer:'return=minimal',
    timeoutMs:20000,
    label:'ICD hierarchy staging cleanup',
  });
}

async function insertNodeBatch(records, index, total) {
  return neonRequest(`/${NODES_TABLE}?on_conflict=revision,code`, {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=minimal',
    body:records,
    timeoutMs:BATCH_TIMEOUT_MS,
    label:`ICD hierarchy batch ${index}/${total}`,
  });
}

async function activateRevision(revision) {
  const result = await neonRequest('/rpc/activate_icd_hierarchy_revision', {
    method:'POST',
    body:{ p_revision:revision },
    timeoutMs:30000,
    label:'ICD hierarchy revision activation',
  });
  return dataOf(result);
}

async function markFailed(revision, error) {
  const reason = clean(error?.message || error).slice(0, 1000);
  try {
    await neonRequest(`/${REVISION_TABLE}?revision=eq.${encodeURIComponent(revision)}`, {
      method:'PATCH',
      prefer:'return=minimal',
      body:{ status:'failed', error_summary:reason },
      timeoutMs:12000,
      label:'ICD hierarchy revision failure',
    });
  } catch (markError) {
    process.stderr.write(`ICD hierarchy failure marker was not persisted: ${clean(markError?.message || markError)}\n`);
  }
}

async function sync(options = {}) {
  const loaded = await IcdPublicSource.load({ force:true, sheetOnly:true });
  const validation = validateLoaded(loaded);
  const revision = clean(loaded.sourceRevision);
  const current = await existingRevision(revision);
  if (current?.status === 'active') {
    return {
      ok:true,
      skipped:true,
      revision,
      counts:validation,
      reason:'Revision-i i Google Sheet-it është tashmë aktiv në Neon.',
    };
  }

  const records = loaded.data.nodes.map(node => nodeRecord(node, loaded.data, revision));
  const chunks = batch(records);
  if (options.dryRun) {
    return {
      ok:true,
      dryRun:true,
      revision,
      counts:validation,
      records:records.length,
      batches:chunks.length,
      batchSize:BATCH_SIZE,
      headerRow:loaded.headerRow,
    };
  }

  process.stdout.write(`ICD hierarchy ${revision}: ${records.length} records, ${chunks.length} bounded batches.\n`);
  await upsertRevision(revisionRecord(loaded));
  try {
    await deleteRevisionNodes(revision);
    for (let index = 0; index < chunks.length; index += 1) {
      const currentBatch = chunks[index];
      process.stdout.write(`Starting ICD hierarchy batch ${index + 1}/${chunks.length} (${currentBatch.length} rows).\n`);
      await insertNodeBatch(currentBatch, index + 1, chunks.length);
      process.stdout.write(`ICD hierarchy batch ${index + 1}/${chunks.length} imported.\n`);
    }
    process.stdout.write(`Activating ICD hierarchy revision ${revision}.\n`);
    const activation = await activateRevision(revision);
    return {
      ok:true,
      skipped:false,
      revision,
      counts:validation,
      records:records.length,
      batches:chunks.length,
      activation,
    };
  } catch (error) {
    await markFailed(revision, error);
    throw error;
  }
}

async function main() {
  const result = await sync({ dryRun:process.argv.includes('--dry-run') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  REVISION_TABLE,
  NODES_TABLE,
  BATCH_SIZE,
  BATCH_TIMEOUT_MS,
  batch,
  nodeRecord,
  revisionRecord,
  validateLoaded,
  existingRevision,
  upsertRevision,
  deleteRevisionNodes,
  insertNodeBatch,
  activateRevision,
  markFailed,
  sync,
};
