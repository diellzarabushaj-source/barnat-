'use strict';

const baseHandler = require('../lib/icd-api-base.js');
const advancedHandler = require('../lib/icd-advanced-handler.js');

module.exports = async function handler(req, res) {
  const advanced = String(req.query?.advanced || '') === '1';
  return advanced ? advancedHandler(req, res) : baseHandler(req, res);
};
