'use strict';

const { neonRequest, exactCount } = require('../lib/neon-data-api');

async function tableProbe(table) {
  const { data, response } = await neonRequest(`${table}?select=id&limit=1`, {
    headers: { Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  const rows = Array.isArray(data) ? data : [];
  return {
    count:exactCount(response),
    contentRange:response.headers.get('content-range') || '',
    rowsReturned:rows.length,
    hasSample:Boolean(rows[0] && Object.prototype.hasOwnProperty.call(rows[0], 'id')),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Lejohet vetëm GET.' });
  }

  try {
    const [drugs, dosageRegimens, icdCodes, labTests] = await Promise.all([
      tableProbe('drugs'),
      tableProbe('dosage_regimens'),
      tableProbe('icd_codes'),
      tableProbe('lab_tests'),
    ]);
    return res.status(200).json({
      connected:true,
      provider:'neon',
      project:'MedIndex',
      probes:{ drugs, dosageRegimens, icdCodes, labTests },
      checkedAt:new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      connected:false,
      provider:'neon',
      error:error.message,
      checkedAt:new Date().toISOString(),
    });
  }
};
