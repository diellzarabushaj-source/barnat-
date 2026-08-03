'use strict';

const Source = require('./icd-public-source.js');
const Importer = require('../scripts/sync-icd-hierarchy-to-neon.js');
const { neonRequest, dataOf, exactCount } = require('./neon-data-api.js');

const EXPECTED_BRANCH = 'agent/icd-neon-live-verify-v2';
const REVISION = 're3nQDC_0rCcjpS5sQFH';
const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 750;

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function assertPreviewRequest(req) {
  if (process.env.VERCEL_ENV !== 'preview') throw new Error('Ky veprim lejohet vetëm në preview.');
  if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) throw new Error('Branch-i i preview-t nuk lejohet.');
  if (String(req.query?.guard || '') !== 'validated-sheet-revision-only') throw new Error('Mungon guard-i i aktivizimit.');
}

async function sourceRecords() {
  const loaded = await Source.load({ force:true, sheetOnly:true });
  const counts = Importer.validateLoaded(loaded);
  if (loaded.sourceRevision !== REVISION) throw new Error(`Revision i papritur: ${loaded.sourceRevision}.`);
  const records = loaded.data.nodes.map(node => Importer.nodeRecord(node, loaded.data, REVISION));
  if (records.length !== 12542) throw new Error(`Numër i papritur nyjesh: ${records.length}.`);
  return { loaded, counts, records };
}

async function status() {
  const revisionResult = await neonRequest(`/icd_hierarchy_revisions?revision=eq.${REVISION}&select=revision,status,counts,source_hash,source_bytes,header_row,activated_at&limit=1`, {
    timeoutMs:10000,
    label:'preview ICD revision status',
  });
  const revision = dataOf(revisionResult)?.[0] || null;
  const countResult = await neonRequest(`/icd_hierarchy_nodes?revision=eq.${REVISION}&select=code&limit=1`, {
    prefer:'count=exact',
    timeoutMs:10000,
    label:'preview ICD node count',
  });
  return { revision, nodeCount:exactCount(countResult.response) };
}

module.exports = async function previewHierarchySync(req, res) {
  try {
    assertPreviewRequest(req);
    const action = String(req.query?.action || 'status').toLowerCase();
    if (action === 'status') return res.status(200).json({ ok:true, action, ...(await status()) });

    const { loaded, counts, records } = await sourceRecords();
    if (action === 'prepare') {
      await Importer.upsertRevision(Importer.revisionRecord(loaded));
      await Importer.deleteRevisionNodes(REVISION);
      return res.status(200).json({ ok:true, action, revision:REVISION, counts, records:records.length });
    }
    if (action === 'batch') {
      const size = integer(req.query?.size, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
      const start = integer(req.query?.start, 0, 0, records.length);
      const selected = records.slice(start, start + size);
      if (!selected.length) throw new Error('Batch-i është bosh.');
      await Importer.insertNodeBatch(selected, Math.floor(start / size) + 1, Math.ceil(records.length / size));
      return res.status(200).json({ ok:true, action, revision:REVISION, start, written:selected.length, next:start + selected.length, total:records.length });
    }
    if (action === 'activate') {
      const activation = await Importer.activateRevision(REVISION);
      return res.status(200).json({ ok:true, action, revision:REVISION, activation, status:await status() });
    }
    return res.status(400).json({ ok:false, error:'Veprimi nuk njihet.' });
  } catch (error) {
    console.error('Preview ICD hierarchy activation failed:', error);
    return res.status(500).json({ ok:false, error:String(error?.message || error).slice(0, 800) });
  }
};
