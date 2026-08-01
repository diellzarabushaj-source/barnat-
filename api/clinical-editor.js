'use strict';

const ClinicalEditor = require('../lib/clinical-editor.js');
const PopulationVerification = require('../lib/population-verification.js');
const MediaLibrary = require('../lib/media-library.js');

function queryFlag(req, name) {
  if (req.query?.[name] !== undefined) return true;
  try {
    return new URL(String(req.url || ''), 'https://medindex.local').searchParams.has(name);
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (queryFlag(req, 'populationVerification')) return PopulationVerification.handle(req, res);
  if (queryFlag(req, 'mediaLibrary')) return MediaLibrary.handle(req, res);
  return ClinicalEditor.handle(req, res);
};
