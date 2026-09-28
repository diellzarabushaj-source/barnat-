'use strict';

const { neonRequest } = require('./medindex-data-api.js');

const VIEW = 'pediatric-common-reference';
const DATASET_KEY = 'pediatric_common_drugs_20260928';

async function loadReference() {
  const params = new URLSearchParams();
  params.set('select', 'dataset_key,version,source_kind,source_date,source_title,git_commit_sha,payload,payload_sha256,updated_at');
  params.set('dataset_key', `eq.${DATASET_KEY}`);
  params.set('limit', '1');
  const { data } = await neonRequest(`pediatric_common_reference_snapshots_v1?${params.toString()}`, {
    label:'Pediatric common reference',
    timeoutMs:8000,
  });
  if (!Array.isArray(data) || !data.length || !data[0]?.payload || !Array.isArray(data[0].payload.sections)) {
    const error = new Error('Referenca pediatrike nuk u gjet në databazë.');
    error.code = 'PEDIATRIC_COMMON_REFERENCE_MISSING';
    throw error;
  }
  return {
    ...data[0].payload,
    database:{
      datasetKey:data[0].dataset_key,
      version:data[0].version,
      sourceKind:data[0].source_kind,
      sourceDate:data[0].source_date,
      sourceTitle:data[0].source_title,
      gitCommitSha:data[0].git_commit_sha,
      payloadSha256:data[0].payload_sha256,
      updatedAt:data[0].updated_at,
    },
  };
}

module.exports = async function pediatricCommonReferenceHandler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  const auth = await import('./auth.mjs');
  if (!(await auth.verifySessionToken(auth.sessionFromRequest(req)))) {
    return res.status(401).json({ error:'Sesioni nuk është aktiv.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Metodë e palejuar.' });
  }
  try {
    return res.status(200).json(await loadReference());
  } catch {
    return res.status(503).json({ error:'Referenca pediatrike nuk u ngarkua nga databaza.' });
  }
};

module.exports.VIEW = VIEW;
module.exports.DATASET_KEY = DATASET_KEY;
module.exports.loadReference = loadReference;
