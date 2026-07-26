'use strict';

const { neonRequest, exactCount } = require('../lib/neon-data-api');

async function tableCount(table) {
  const { response } = await neonRequest(`${table}?select=id&limit=1`, {
    headers: { Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  return exactCount(response);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Lejohet vetëm GET.' });
  }

  try {
    const [drugs, dosageRegimens, icdCodes, labTests] = await Promise.all([
      tableCount('drugs'),
      tableCount('dosage_regimens'),
      tableCount('icd_codes'),
      tableCount('lab_tests'),
    ]);
    return res.status(200).json({
      connected:true,
      provider:'neon',
      project:'MedIndex',
      counts:{ drugs, dosageRegimens, icdCodes, labTests },
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
