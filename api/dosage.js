'use strict';

const dosageHandler = require('../lib/dosage-handler.js');
const doseCalculatorHandler = require('../lib/dose-calculator-handler.js');
const doseSafetyHandler = require('../lib/dose-safety-handler.js');
const doseProductFastPathHandler = require('../lib/dose-product-fast-path-handler.js');
const dosageCardHandler = require('../lib/dosage-card-handler.js');
const prescriptionDosageHandler = require('../lib/prescription-dosage-handler.js');
const prescriptionDosageContextHandler = require('../lib/prescription-dosage-context-handler.js');
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

function isProductFastPathRequest(req) {
  return requestView(req) === 'product-rules';
}

function isCardRequest(req) {
  return requestView(req) === 'card';
}

function isCardsRequest(req) {
  return requestView(req) === 'cards';
}

function isPrescriptionRequest(req) {
  return requestView(req) === 'prescription';
}

function isPrescriptionContextRequest(req) {
  return requestView(req) === 'prescription-context';
}

function isApprovedPopulationRequest(req) {
  return requestView(req) === 'approved-population';
}

/* Rrugët e dozologjisë, përfshirë prescription context, janë rishkrime te
   `vercel.json` mbi këtë gateway — jo funksione të veta. Kjo mban një
   slot real rezervë edhe pasi llogaritet middleware-i i Vercel. */
function isPediatricRequest(req) {
  const view = requestView(req);
  return view === pediatricDosageHandler.SEARCH_VIEW
    || view === pediatricDosageHandler.PRODUCT_VIEW
    || view === pediatricDosageHandler.CALCULATE_VIEW;
}

async function handler(req, res) {
  if (isCalculatorRequest(req)) return doseCalculatorHandler(req, res);
  if (isSafetyRequest(req)) return doseSafetyHandler(req, res);
  if (isProductFastPathRequest(req)) return doseProductFastPathHandler(req, res);
  if (isCardRequest(req) || isCardsRequest(req)) return dosageCardHandler(req, res);
  if (isPrescriptionRequest(req)) return prescriptionDosageHandler(req, res);
  if (isPrescriptionContextRequest(req)) return prescriptionDosageContextHandler(req, res);
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
handler.isProductFastPathRequest = isProductFastPathRequest;
handler.isCardRequest = isCardRequest;
handler.isCardsRequest = isCardsRequest;
handler.isPrescriptionRequest = isPrescriptionRequest;
handler.isPrescriptionContextRequest = isPrescriptionContextRequest;
handler.isApprovedPopulationRequest = isApprovedPopulationRequest;
handler.isPediatricRequest = isPediatricRequest;
handler.pediatricSearchDrugs = pediatricDosageHandler.searchDrugs;
handler.pediatricLoadProduct = pediatricDosageHandler.loadProduct;
handler._pediatricTest = pediatricDosageHandler._test;
handler.requestView = requestView;

module.exports = handler;
