'use strict';

const ClinicalEditor = require('../lib/clinical-editor.js');
const PopulationVerification = require('../lib/population-verification.js');

function populationVerificationRequest(req) {
  if (req.query?.populationVerification !== undefined) return true;
  try {
    return new URL(String(req.url || ''), 'https://medindex.local').searchParams.has('populationVerification');
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (populationVerificationRequest(req)) return PopulationVerification.handle(req, res);
  return ClinicalEditor.handle(req, res);
};
