'use strict';

const baseHandler = require('../lib/icd-api-base.js');
const advancedHandler = require('../lib/icd-advanced-handler.js');

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  if (!(await authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error:'Kërkohet autentikim.', ok:false, data:null });
  }
  const advanced = String(req.query?.advanced || '') === '1';
  return advanced ? advancedHandler(req, res) : baseHandler(req, res);
};
