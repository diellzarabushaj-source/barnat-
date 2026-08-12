'use strict';

const dosageHandler = require('../lib/dosage-handler.js');
const doseCalculatorHandler = require('../lib/dose-calculator-handler.js');
const doseSafetyHandler = require('../lib/dose-safety-handler.js');
const dosageCardHandler = require('../lib/dosage-card-handler.js');

function requestView(req) {
  try {
    const url = new URL(req?.url || '/api/dosage', 'http://medindex.local');
    return url.searchParams.get('view') || '';
  } catch {
    return '';
  }
}

function isCalculatorRequest(req) {
  return requestView(req) === 'calculator';
}

function isSafetyRequest(req) {
  return requestView(req) === 'safety';
}

function isCardRequest(req) {
  return requestView(req) === 'card';
}

async function handler(req, res) {
  if (isCalculatorRequest(req)) return doseCalculatorHandler(req, res);
  if (isSafetyRequest(req)) return doseSafetyHandler(req, res);
  if (isCardRequest(req)) return dosageCardHandler(req, res);
  return dosageHandler(req, res);
}

Object.assign(handler, dosageHandler);
handler.getDoseCalculatorCatalog = doseCalculatorHandler.getCatalog;
handler.buildDoseCalculatorCatalog = doseCalculatorHandler.buildCatalog;
handler.getDoseSafetyCatalog = doseSafetyHandler.getCatalog;
handler.buildDoseSafetyCatalog = doseSafetyHandler.buildCatalog;
handler._doseCalculatorTest = doseCalculatorHandler._test;
handler._doseSafetyTest = doseSafetyHandler._test;
handler._dosageCardTest = dosageCardHandler._test;
handler.isCalculatorRequest = isCalculatorRequest;
handler.isSafetyRequest = isSafetyRequest;
handler.isCardRequest = isCardRequest;
handler.requestView = requestView;

module.exports = handler;