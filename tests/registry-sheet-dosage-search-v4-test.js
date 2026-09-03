'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const dosageCard = require('../lib/dosage-card-handler.js');
const drugSearch = require('../api/drug-search.js');
const registryJs = read('registry-v2.js');
const registryCss = read('registry-v2.css');
const recetatJs = read('recetat-v2.js');
const recetatCss = read('recetat-v2.css');
const searchMigration = read('supabase/migrations/20260901232000_harden_ranked_drug_search_v4.sql');
const history = JSON.parse(read('supabase/migration-history.json'));

const BISOLVON_ID = '38c3a5f2-bb4f-46c1-913d-71d6fd256e8e';
const bisolvonProduct = {
  id:BISOLVON_ID,
  registry_number:6,
  pdid:'3674',
  trade_name:'BISOLVON',
  active_substance:'Bromhexine-HCL',
  strength:'2 mg/1 ml',
  pharmaceutical_form:'Oral solution',
  pediatric_dose_summary:'2–6 vjeç: 2 mL PO 3 herë/ditë; 6–14 vjeç ose <50 kg: 4 mL PO 3 herë/ditë.',
  pediatric_route:'PO',
  pediatric_source_url:'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/51401',
  pediatric_verification_status:'verified',
  source_payload:{
    'Doza e plotë — Të rritur':'Të rritur dhe >14 vjeç: 4–8 mL nga goja 3 herë në ditë.',
    'Rruga — Të rritur':'PO',
    'Baza e dozës':'dozë fikse',
    'Maks. në 24h — vlerë':'',
  },
};

const adultFallback = dosageCard._test.productFallback(bisolvonProduct, 'adult');
assert.equal(adultFallback.dose, 'Të rritur dhe >14 vjeç: 4–8 mL nga goja 3 herë në ditë.');
assert.equal(adultFallback.route, 'PO');

const pediatricFallback = dosageCard._test.productFallback(bisolvonProduct, 'pediatric');
assert.match(pediatricFallback.dose, /2–6 vjeç: 2 mL PO 3 herë\/ditë/);
assert.equal(pediatricFallback.route, 'PO');
assert.equal(pediatricFallback.verification, 'verified');

const verified = {
  population:'adult',
  dose:'Të rritur dhe >14 vjeç: 4–8 mL nga goja 3 herë në ditë. Për inhalim: të rritur 4 mL 2 herë në ditë.',
  route:'PO; INHAL',
  verification:'text_verified',
};
const merged = dosageCard._test.mergeRegimen(verified, adultFallback);
assert.equal(merged.dose, verified.dose, 'verified dosage_regimens text must outrank sheet fallback');
assert.equal(merged.route, 'PO; INHAL');
assert.equal(merged.provenance, 'dosage_regimens');

const detail = drugSearch.detailRow({
  id:BISOLVON_ID,
  registry_number:6,
  pdid:'3674',
  trade_name:'BISOLVON',
  active_substance:'Bromhexine-HCL',
  strength:'2 mg/1 ml',
  pharmaceutical_form:'Oral solution',
  pediatric_dose_summary:bisolvonProduct.pediatric_dose_summary,
  pediatric_route:'PO',
  pediatric_source_url:bisolvonProduct.pediatric_source_url,
  pediatric_verification_status:'verified',
  source_payload:bisolvonProduct.source_payload,
});
assert.equal(detail.pediatricDoseSummary, bisolvonProduct.pediatric_dose_summary);
assert.equal(detail.pediatricRoute, 'PO');
assert.ok(detail.sourceFields.some(row => row.label === 'Doza e plotë — Të rritur'));
assert.ok(detail.sourceFields.some(row => row.label === 'Baza e dozës'));

assert.match(registryJs, /card\.adultRegimens/);
assert.match(registryJs, /card\.pediatricRegimens/);
assert.match(registryJs, /detail\?\.pediatricDoseSummary|detail\.pediatricDoseSummary/);
assert.match(registryCss, /Registry V2 — dosage detail fidelity v5/);
assert.match(registryCss, /\.dose-regimen-list/);

assert.match(searchMigration, /drugs_trade_name_trgm_idx/);
assert.match(searchMigration, /drugs_active_substance_trgm_idx/);
assert.match(searchMigration, /'trade_fuzzy'/);
assert.match(searchMigration, /'substance_fuzzy'/);
assert.match(searchMigration, /'registry_exact'/);
assert.match(searchMigration, /'pdid_exact'/);
assert.match(searchMigration, /'atc_exact'/);
assert.match(searchMigration, /least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
assert.match(searchMigration, /security invoker/i);
assert.ok(history.migrations.some(item =>
  item.version === '20260901232000' && item.name === 'harden_ranked_drug_search_v4'
));

assert.match(recetatJs, /searchSequence/);
assert.match(recetatJs, /searchCache: new Map\(\)/);
assert.match(recetatJs, /limit=50/);
assert.match(recetatJs, /singleNumeric/);
assert.match(recetatJs, /trade_fuzzy/);
assert.match(recetatJs, /Nr\. \$\{drug\.registryNumber\}/);
assert.match(recetatJs, /PDID \$\{drug\.pdid\}/);
assert.match(recetatCss, /Recetat V2 — clinical drug search v5/);
assert.match(recetatCss, /\.rx-drug-result\.is-fuzzy/);

console.log('Registry sheet dosage + ranked search v4 regression contract passed.');
