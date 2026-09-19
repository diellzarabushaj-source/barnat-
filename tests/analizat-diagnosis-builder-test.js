'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('analizat.html');
const css = read('analizat-v2.css');
const js = read('analizat-v2.js');
const reader = read('lib/neon-clinical-reader.js');
const dataApi = read('lib/medindex-data-api.js');
const api = read('lib/icd-api-base.js');
const baseMigration = read('supabase/migrations/20260828214754_add_lab_indication_order_builder.sql');
const serviceWorker = read('sw.js');

assert.match(html, /data-drx-app="analizat-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /<title>DRx \| Ekzaminet<\/title>/);
assert.match(html, /<h1>Ekzaminet<\/h1>/);
assert.match(html, /01 · Shenjat &amp; simptomat/);
assert.match(html, /Ndërto work-up-in klinik/);
assert.match(html, /Kërko p\.sh\. puls i rritur, vjellje, bark rigid/);
assert.match(html, /id="examModalityFilters"/);
for (const filter of ['all','laboratory','cardio','imaging','ultrasound','other','urgent']) {
  assert.match(html, new RegExp(`data-exam-filter="${filter}"`), `missing exam filter ${filter}`);
}
assert.match(html, /Prezantimet klinike/);
assert.match(html, /Red flags/);
assert.match(html, /analizat-v2\.css\?v=1/);
assert.match(html, /analizat-v2\.js\?v=3/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v8/);
assert.match(html, /id="labDiseaseTrigger"/);
assert.match(html, /id="labDiseasePopover"/);
assert.match(html, /id="labDiseaseSearch"/);
assert.match(html, /id="labDiseaseList"/);
assert.match(html, /aria-multiselectable="true"/);
assert.match(html, /id="labManualSearch"/);
assert.match(html, /id="labManualResults"/);
assert.match(html, /id="labSelectedDiseases"/);
assert.match(html, /id="labPlanSections"/);
assert.match(html, /id="labGapList"/);
assert.match(html, /id="labCopyPlan"/);
assert.doesNotMatch(html, />\s*Analizat\s*</, 'visible module title must be Ekzaminet');
assert.doesNotMatch(html, /Zgjidh një diagnozë|Zgjidh diagnoza|Diagnozat \/ sëmundjet/, 'visible builder must not be diagnosis-driven');

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);
const pageRuntimes = scripts.filter(src => !/sidebar-taxonomy-v3\.js/.test(src));
assert.equal(styles.length, 2, 'Ekzaminet must load only page CSS + canonical Stripe shell');
assert.ok(styles[0].includes('analizat-v2.css?v=1'));
assert.ok(styles[1].includes('drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8'));
assert.equal(pageRuntimes.length, 1, 'Ekzaminet must own one page runtime in addition to shared sidebar');
assert.ok(pageRuntimes[0].includes('analizat-v2.js?v=3'));

assert.match(js, /fetch\('\/api\/icd\?dataset=labs'/, 'granular laboratory catalog must remain available');
assert.match(js, /const TIER_ORDER = Object\.freeze\(\{ urgent:0, core:1, recommended:2, conditional:3, manual:4 \}\)/);
assert.match(js, /const EXAM_CATEGORIES = Object\.freeze/);
assert.match(js, /const EXAM_CATALOG = Object\.freeze/);
assert.match(js, /const CLINICAL_PRESENTATIONS = Object\.freeze/);
assert.match(js, /function buildClinicalDataset\(data\)/);
assert.match(js, /examFilter:'all'/);
assert.match(js, /url\.searchParams\.set\('sx'/);
assert.match(js, /url\.searchParams\.delete\('dx'\)/);
assert.match(js, /data-exam-filter/);
assert.match(js, /state\.examFilter === 'urgent'/);
assert.match(js, /reason\.presentation/);
assert.match(js, /Shenja \/ simptoma \/ gjetje klinike:/);
assert.match(js, /Ekzaminet:/);
assert.match(js, /Red flags:/);
assert.match(js, /Nuk u gjet shenjë ose simptomë/);
assert.match(js, /Lista e ekzaminimeve u kopjua/);

for (const presentation of [
  'puls-i-rritur','puls-i-ngadalesuar','palpitacione','dhimbje-gjoksi','dispne','kolle',
  'sinkope-marramendje','humbje-peshe','shtim-peshe','dhimbje-muskulare','dobesi-muskulare',
  'gushe-tiroide','bark-rigid','dhimbje-abdominale','vjellje','diarre','edeme',
  'poliuri-polidipsi','temperature',
]) {
  assert.ok(js.includes(`"id": "${presentation}"`), `missing clinical presentation ${presentation}`);
}
assert.equal((js.match(/"clinicalType":/g) || []).length, 19, 'expected exactly 19 clinical presentations');

for (const exam of [
  'EKG 12 derivacione','Holter EKG','Ehokardiografi','SpO₂','Spirometri',
  'RTG toraksi','CTPA','CT abdomen/pelvis','MRI truri',
  'Ultrazë tiroide','Ultrazë abdomeni','Doppler venoz','Gastroskopi','Kolonoskopi',
]) {
  assert.ok(js.includes(exam), `missing multimodal exam ${exam}`);
}
assert.ok((js.match(/"examGroup":/g) || []).length >= 40, 'multimodal exam catalog is unexpectedly small');

const catalogJson = js.match(/const EXAM_CATALOG = Object\.freeze\((\[[\s\S]*?\])\);\n\s*const CLINICAL_PRESENTATIONS/)?.[1];
const presentationsJson = js.match(/const CLINICAL_PRESENTATIONS = Object\.freeze\((\[[\s\S]*?\])\);\n\n\s*const state/)?.[1];
assert.ok(catalogJson, 'embedded multimodal exam catalog JSON is missing');
assert.ok(presentationsJson, 'embedded clinical presentation JSON is missing');
const parsedCatalog = JSON.parse(catalogJson);
const parsedPresentations = JSON.parse(presentationsJson);
assert.equal(parsedPresentations.length, 19);
assert.ok(parsedCatalog.length >= 40);
const catalogIds = new Set(parsedCatalog.map(item => item.id));
for (const presentation of parsedPresentations) {
  assert.ok(['Shenjë','Simptomë','Gjetje'].includes(presentation.clinicalType), `invalid clinical type for ${presentation.id}`);
  assert.ok(Array.isArray(presentation.tests) && presentation.tests.length > 0, `empty work-up for ${presentation.id}`);
  assert.ok(Array.isArray(presentation.redFlags), `red flags missing for ${presentation.id}`);
  for (const link of presentation.tests) {
    assert.ok(catalogIds.has(link.testId), `${presentation.id} links missing catalog exam ${link.testId}`);
    assert.ok(['urgent','core','recommended','conditional'].includes(link.tier), `invalid tier ${link.tier} in ${presentation.id}`);
    assert.ok(link.rationale, `rationale missing for ${presentation.id} / ${link.testId}`);
  }
}

assert.doesNotThrow(() => new Function(js));

assert.match(css, /Ekzaminet v3 — symptom\/sign driven multimodal work-up/);
assert.match(css, /\.exam-modality-rail/);
assert.match(css, /\.exam-modality-chip/);
assert.match(css, /data-tier="urgent"/);
assert.match(css, /\.lab-gap-item\.is-red-flag/);
assert.match(css, /data-exam-group="laboratory"/);
assert.match(css, /data-exam-group="cardio"/);
assert.match(css, /data-exam-group="imaging"/);
assert.match(css, /data-exam-group="ultrasound"/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /position:sticky;top:58px/);
assert.match(css, /prefers-reduced-motion:reduce/);

// The existing Supabase laboratory catalog remains the source for granular manual laboratory additions.
assert.match(reader, /fetchPaged\('lab_indications'/);
assert.match(reader, /fetchPaged\('lab_indication_tests'/);
assert.match(reader, /source:'Supabase'/);
assert.match(dataApi, /'lab_indications'/);
assert.match(dataApi, /'lab_indication_tests'/);
assert.match(api, /wrap\(data, 'supabase'/);
assert.match(baseMigration, /create table if not exists public\.lab_indications/);
assert.match(baseMigration, /create table if not exists public\.lab_indication_tests/);
assert.match(serviceWorker, /\/analizat-v2\.css/);
assert.match(serviceWorker, /\/analizat-v2\.js/);

console.log('Ekzaminet V3 symptom/sign-driven multimodal clinical work-up contract passed.');
