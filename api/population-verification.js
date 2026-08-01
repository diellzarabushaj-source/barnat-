'use strict';

const PopulationVerification = require('../lib/population-verification.js');

module.exports = async function handler(req, res) {
  return PopulationVerification.handle(req, res);
};
