'use strict';

const DriveNeonSync = require('../lib/drive-neon-sync.js');

module.exports = async function handler(req, res) {
  return DriveNeonSync.handle(req, res);
};
