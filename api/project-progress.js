'use strict';

const AdminAccess = require('../lib/admin-access.js');
const Progress = require('../lib/project-progress.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ok:false, error:'Method not allowed'});
  }

  try {
    await AdminAccess.requireAdminSession(req);
  } catch (error) {
    const code = Number(error?.status);
    const status = code === 401 ? 401 : code === 503 ? 503 : 403;
    return res.status(status).json({ok:false, error:status === 401 ? 'Kërkohet hyrja e administratorit.' : 'Qasja e administratorit nuk u verifikua.'});
  }

  try {
    const snapshot = await Progress.buildProjectSnapshot();
    return res.status(200).json({ok:true, ...snapshot});
  } catch (error) {
    console.error('Project progress snapshot failed:', error?.message || error);
    return res.status(502).json({ok:false, error:'Gjendja e projektit nuk mund të lexohet tani.'});
  }
};
