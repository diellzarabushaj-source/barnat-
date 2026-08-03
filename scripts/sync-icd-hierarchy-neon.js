'use strict';

const IcdPublicSource = require('../lib/icd-public-source.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const { neonRequest, dataOf, exactCount } = require('../lib/neon-data-api.js');

const REVISION_TABLE = 'icd_hierarchy_revisions';
const NODE_TABLE = 'icd_hierarchy_nodes';
const ACTIVATE_RPC = 'rpc/activate_icd_hierarchy_revision';
const UPSERT_CHUNK = 100;

const clean = value => String(value ?? '').trim();
const expectedCountsMatch = counts => Object.entries(FullIcd.EXPECTED_COUNTS)
  .every(([key, expected]) => Number(counts?.[key]) === expected);

function hierarchyPath(dataset, code) {
  return [...FullIcd.ancestorsOf(dataset, code), FullIcd.nodeMap(dataset).get(code)]
    .filter(Boolean)
    .map(item => item.code)
    .join(' > ');
}

function nodeRecord(dataset, node, revision, sourceHash) {
  return {
    revision,
    code:node.code,
    level_name:node.level,
    chapter_code:node.chapter,
    block_code:node.block || null,
    parent_code:node.parentCode || null,
    title_en:node.englishTitle,
    title_sq:node.albanianDraft || null,
    display_title:node.displayTitle || node.albanianDraft || node.englishTitle,
    translation_status:node.translationStatus || 'missing',
    path_text:hierarchyPath(dataset, node.code),
    source_url:node.sourceUrl || null,
    source_row:Number(node.sourceRow),
    search_text:node.searchText,
    source_hash:sourceHash,
    is_published:true,
  };
}

function revisionRecord(source) {
  const revision = clean(source?.sourceRevision);
  const sourceHash = clean(source?.sourceHash || revision);
  if (!revision || !sourceHash || !source?.data || !expectedCountsMatch(source.data.counts)) {
    throw new Error('Burimi ICD-10 nuk është i plotë për sinkronizim në Neon.');
  }
  return {
    revision,
    spreadsheet_id:IcdPublicSource.SPREADSHEET_ID,
    sheet_name:IcdPublicSource.SHEET_NAME,
    sheet_gid:IcdPublicSource.SHEET_GID,
    source_hash:sourceHash,
    source_bytes:Number(source.csvBytes || 0),
    header_row:Number(source.headerRow || 0) || null,
    counts:source.data.counts,
    status:'staging',
    error_summary:null,
    activated_at:null,
  };
}

async function fetchRevision(revision) {
  const select = 'revision,status,source_hash,source_bytes,header_row,counts,activated_at';
  const result = await neonRequest(
    `${REVISION_TABLE}?revision=eq.${encodeURIComponent(revision)}&select=${encodeURIComponent(select)}&limit=1`,
    { timeoutMs:8000, label:'ICD hierarchy revision lookup' },
  );
  const rows = dataOf(result);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function countNodes(revision, level = '') {
  const filter = level ? `&level_name=eq.${encodeURIComponent(level)}` : '';
  const { response } = await neonRequest(
    `${NODE_TABLE}?revision=eq.${encodeURIComponent(revision)}${filter}&select=code&limit=1`,
    {
      headers:{ Range:'0-0', 'Range-Unit':'items' },
      prefer:'count=exact',
      timeoutMs:8000,
      label:`ICD hierarchy count ${level || 'total'}`,
    },
  );
  return exactCount(response) || 0;
}

async function databaseCounts(revision) {
  const [total, chapter, block, category, subcategory] = await Promise.all([
    countNodes(revision),
    countNodes(revision, 'chapter'),
    countNodes(revision, 'block'),
    countNodes(revision, 'category'),
    countNodes(revision, 'subcategory'),
  ]);
  return { total, chapter, block, category, subcategory };
}

async function upsertRevision(record) {
  await neonRequest(`${REVISION_TABLE}?on_conflict=revision`, {
    method:'POST',
    body:[record],
    prefer:'resolution=merge-duplicates,return=minimal',
    timeoutMs:10000,
    label:'ICD hierarchy revision upsert',
  });
}

async function clearStagingNodes(revision) {
  const current = await fetchRevision(revision);
  if (!current || current.status !== 'staging') {
    throw new Error(`Revision-i ${revision} nuk është staging; nyjet nuk u prekën.`);
  }
  await neonRequest(`${NODE_TABLE}?revision=eq.${encodeURIComponent(revision)}`, {
    method:'DELETE',
    prefer:'return=minimal',
    timeoutMs:12000,
    label:'ICD hierarchy staging cleanup',
  });
}

async function uploadNodes(source, record) {
  const rows = source.data.nodes.map(node => nodeRecord(source.data, node, record.revision, record.source_hash));
  if (rows.length !== FullIcd.EXPECTED_COUNTS.total) {
    throw new Error(`Numri i nyjeve për upload është ${rows.length}, pritej ${FullIcd.EXPECTED_COUNTS.total}.`);
  }
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    await neonRequest(`${NODE_TABLE}?on_conflict=revision,code`, {
      method:'POST',
      body:rows.slice(index, index + UPSERT_CHUNK),
      prefer:'resolution=merge-duplicates,return=minimal',
      timeoutMs:20000,
      label:`ICD hierarchy nodes ${index}-${Math.min(index + UPSERT_CHUNK, rows.length)}`,
    });
  }
  return rows.length;
}

async function activateRevision(revision) {
  const result = await neonRequest(ACTIVATE_RPC, {
    method:'POST',
    body:{ p_revision:revision },
    prefer:'return=representation',
    timeoutMs:20000,
    label:'ICD hierarchy activation',
  });
  return dataOf(result);
}

async function markFailed(revision, error) {
  const current = await fetchRevision(revision).catch(() => null);
  if (!current || current.status === 'active') return;
  await neonRequest(`${REVISION_TABLE}?revision=eq.${encodeURIComponent(revision)}`, {
    method:'PATCH',
    body:{
      status:'failed',
      error_summary:clean(error?.message || error).slice(0, 2000),
      activated_at:null,
    },
    prefer:'return=minimal',
    timeoutMs:8000,
    label:'ICD hierarchy failure marker',
  }).catch(() => null);
}

async function verifyActive(revision, source) {
  const current = await fetchRevision(revision);
  const counts = await databaseCounts(revision);
  if (
    current?.status !== 'active'
    || clean(current.source_hash) !== clean(source.sourceHash || source.sourceRevision)
    || !expectedCountsMatch(counts)
  ) {
    throw new Error('Revision-i ICD-10 nuk u verifikua si mirror aktiv dhe identik në Neon.');
  }
  return { revision, status:current.status, counts, sourceHash:current.source_hash };
}

async function sync(options = {}) {
  const environment = clean(options.environment || process.env.VERCEL_ENV || 'local');
  const source = options.source || await IcdPublicSource.load({ sheetOnly:true, force:true });
  const record = revisionRecord(source);

  if (!expectedCountsMatch(source.data.counts)) {
    throw new Error('Google Sheet-i nuk ka numrat e plotë të hierarkisë ICD-10.');
  }

  if (environment !== 'production') {
    return {
      mode:'validate-only',
      environment,
      revision:record.revision,
      sourceHash:record.source_hash,
      sourceBytes:record.source_bytes,
      headerRow:record.header_row,
      counts:source.data.counts,
    };
  }

  try {
    const existing = await fetchRevision(record.revision);
    if (existing?.status === 'active') {
      const verified = await verifyActive(record.revision, source);
      return { mode:'already-active', ...verified };
    }

    await upsertRevision(record);
    await clearStagingNodes(record.revision);
    const uploaded = await uploadNodes(source, record);
    const stagedCounts = await databaseCounts(record.revision);
    if (!expectedCountsMatch(stagedCounts) || uploaded !== FullIcd.EXPECTED_COUNTS.total) {
      throw new Error(`Mirror-i staging ICD-10 nuk përputhet: ${JSON.stringify(stagedCounts)}.`);
    }

    const activation = await activateRevision(record.revision);
    const verified = await verifyActive(record.revision, source);
    return { mode:'activated', uploaded, activation, ...verified };
  } catch (error) {
    await markFailed(record.revision, error);
    throw error;
  }
}

async function main() {
  if (!process.env.VERCEL) {
    console.log('ICD hierarchy Neon sync skipped outside Vercel.');
    return;
  }
  const result = await sync();
  console.log(`ICD hierarchy Neon sync completed: ${JSON.stringify(result)}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`ICD hierarchy Neon sync failed: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  REVISION_TABLE,
  NODE_TABLE,
  ACTIVATE_RPC,
  UPSERT_CHUNK,
  expectedCountsMatch,
  hierarchyPath,
  nodeRecord,
  revisionRecord,
  databaseCounts,
  sync,
  _test:{ fetchRevision, countNodes, upsertRevision, clearStagingNodes, uploadNodes, activateRevision, verifyActive, markFailed },
};
