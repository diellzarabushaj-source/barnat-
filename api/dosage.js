'use strict';

const dosageHandler = require('../lib/dosage-handler.js');
const doseCalculatorHandler = require('../lib/dose-calculator-handler.js');
const doseSafetyHandler = require('../lib/dose-safety-handler.js');
const dosageCardHandler = require('../lib/dosage-card-handler.js');
const approvedPopulationHandler = require('../lib/approved-population-handler.js');
const pediatricDosageHandler = require('../lib/pediatric-dosage-handler.js');

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

function isCardsRequest(req) {
  return requestView(req) === 'cards';
}

function isApprovedPopulationRequest(req) {
  return requestView(req) === 'approved-population';
}

/* `/api/dosage/search` dhe `/api/dosage/product/:drugId` janë rishkrime te
   `vercel.json` mbi këtë funksion — jo funksione të veta. Buxheti i Hobby-t
   është 12 dhe janë zënë 11. */
function isPediatricRequest(req) {
  const view = requestView(req);
  return view === pediatricDosageHandler.SEARCH_VIEW || view === pediatricDosageHandler.PRODUCT_VIEW;
}

async function handler(req, res) {
  if (isCalculatorRequest(req)) return doseCalculatorHandler(req, res);
  if (isSafetyRequest(req)) return doseSafetyHandler(req, res);
  if (isCardRequest(req) || isCardsRequest(req)) return dosageCardHandler(req, res);
  if (isApprovedPopulationRequest(req)) return approvedPopulationHandler(req, res);
  if (isPediatricRequest(req)) return pediatricDosageHandler(req, res);
  return dosageHandler(req, res);
}

Object.assign(handler, dosageHandler);
handler.getDoseCalculatorCatalog = doseCalculatorHandler.getCatalog;
handler.buildDoseCalculatorCatalog = doseCalculatorHandler.buildCatalog;
handler.getDoseSafetyCatalog = doseSafetyHandler.getCatalog;
handler.buildDoseSafetyCatalog = doseSafetyHandler.buildCatalog;
handler.getApprovedPopulationItems = approvedPopulationHandler.getApprovedPopulationItems;
handler.getPediatricOnlyRegistryNumbers = approvedPopulationHandler.getPediatricOnlyRegistryNumbers;
handler._doseCalculatorTest = doseCalculatorHandler._test;
handler._doseSafetyTest = doseSafetyHandler._test;
handler._dosageCardTest = dosageCardHandler._test;
handler.isCalculatorRequest = isCalculatorRequest;
handler.isSafetyRequest = isSafetyRequest;
handler.isCardRequest = isCardRequest;
handler.isCardsRequest = isCardsRequest;
handler.isApprovedPopulationRequest = isApprovedPopulationRequest;
handler.isPediatricRequest = isPediatricRequest;
handler.pediatricSearchDrugs = pediatricDosageHandler.searchDrugs;
handler.pediatricLoadProduct = pediatricDosageHandler.loadProduct;
handler._pediatricTest = pediatricDosageHandler._test;
handler.requestView = requestView;

module.exports = handler;
