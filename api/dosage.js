'use strict';

const dosageHandler = require('../lib/dosage-handler.js');
const doseCalculatorHandler = require('../lib/dose-calculator-handler.js');

function isCalculatorRequest(req) {
  try {
    const url = new URL(req?.url || '/api/dosage', 'http://medindex.local');
    return url.searchParams.get('view') === 'calculator';
  } catch {
    return false;
  }
}

async function handler(req, res) {
  if (isCalculatorRequest(req)) return doseCalculatorHandler(req, res);
  return dosageHandler(req, res);
}

Object.assign(handler, dosageHandler);
handler.getDoseCalculatorCatalog = doseCalculatorHandler.getCatalog;
handler.buildDoseCalculatorCatalog = doseCalculatorHandler.buildCatalog;
handler._doseCalculatorTest = doseCalculatorHandler._test;
handler.isCalculatorRequest = isCalculatorRequest;

module.exports = handler;
