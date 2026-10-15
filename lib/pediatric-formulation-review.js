'use strict';

const review = require('../data/pediatric-formulation-review-v1.json');

// Source review describes why automation is unavailable. It never authorizes
// a regimen or overrides a product's population, component or route gate.
function assess(name, row, form, parsed) {
  const entry = review.drugs[name];
  if (!entry) return null;
  let status = 'product-unconfirmed', labelSq = 'Pa skemë për produktin';
  let reasonSq = entry.noteSq;
  if (['A11AA03','A11BA','A11DB','A11EA','A11EX','A12AX'].includes(row.atc_code)) {
    status = 'combination-specific'; labelSq = 'Skemë për kombinimin';
  } else if (name === 'Calcitriol · vitamin D active' || name === 'Vitamin K1 · Phytomenadione') {
    status = 'specialist-context'; labelSq = 'Kërkon protokoll specifik';
  } else if (name === 'Diclofenac' && form.route === 'rectal' && parsed.unit === 'mg' && parsed.value > 100) {
    status = 'data-inconsistent'; labelSq = 'Fortësi e pasaktë';
    reasonSq = 'Regjistri deklaron '+parsed.raw+' për supozitorin. Kjo është jashtë fortësive të burimit; nuk korrigjohet automatikisht nga g në mg. Duhet konfirmuar dhe korrigjuar rekordi i produktit.';
  } else if (parsed.reason) {
    status = 'data-incomplete'; labelSq = 'Të dhëna të paplota';
    reasonSq = parsed.reason + ' ' + entry.noteSq;
  } else if (name === 'Calcium') {
    status = 'specialist-context'; labelSq = 'Kërkon monitorim';
  } else if (name === 'Penicillin G' || name === 'Ceftriaxone') {
    status = 'formulation-specific'; labelSq = 'Rrugë / përgatitje specifike';
  } else if (name === 'Levofloxacin' || name === 'Lansoprazole' || name === 'Azithromycin' && form.route === 'injectable' || name === 'Pantoprazole' && form.route === 'injectable') {
    status = 'pediatric-restriction'; labelSq = 'Përdorim pediatrik i kufizuar';
  }
  if (row.approved_population === 'Adult only') reasonSq += ' Regjistri e etiketon këtë produkt për të rritur; nuk është konfirmuar një përjashtim specifik për këtë produkt.';
  return { status, labelSq, reasonSq, reviewedAt:review.reviewedAt, scopeSq:review.scopeSq, sources:entry.sources };
}

module.exports = { assess, version:review.schemaVersion };
