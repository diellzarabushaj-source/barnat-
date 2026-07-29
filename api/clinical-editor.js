'use strict';

const ClinicalEditor = require('../lib/clinical-editor.js');

module.exports = async function handler(req, res) {
  return ClinicalEditor.handle(req, res);
};
