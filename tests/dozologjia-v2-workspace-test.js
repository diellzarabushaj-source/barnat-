'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('dozologjia.html');
const css = read('dozologjia.css');
const js = read('dozologjia.js');
const api = read('api/dosage.js');
const data = JSON.parse(read('data/dozologjia/antibiotics.json'));
const engine = require('../lib/dozologjia.js');

assert.match(html, /data-drx-app="dozologjia-v2"/);
assert.match(html, /data-dozologjia-architecture="clean-substance-first"/);
assert.match(html, /Doza sipas substancës aktive/);
assert.match(html, /id="substance"/);
assert.match(html, /id="population"/);
assert.match(html, /id="regimen"/);
assert.match(html, /id="weightKg"/);
assert.match(html, /id="durationPreview"/);
assert.match(html, /dozologjia\.css\?v=1/);
assert.match(html, /dozologjia\.js\?v=1/);
assert.doesNotMatch(html, /pediatric-calculator-client|dosageProductPanel|dosageFacetReady|patientTreatmentDay|patientClinicalVariant/);

assert.match(css, /\.result-fact/);
assert.match(css, /\.sr-only/);
assert.match(css, /@media\(max-width:820px\)/);
assert.doesNotThrow(() => new Function(js));
assert.doesNotMatch(js, /mgPerKg\s*\*|weightKg\s*\*|\/\s*concentration/i, 'Browseri nuk guxon të bëjë matematikë klinike.');
assert.match(js, /POST/);
assert.match(js, /\/api\/dosage/);

for (const legacyImport of [
  'dosage-handler', 'dose-calculator-handler', 'dose-safety-handler', 'dose-product-fast-path-handler',
  'dosage-card-handler', 'pediatric-dosage-handler', 'approved-population-handler'
]) assert.doesNotMatch(api, new RegExp(legacyImport));
assert.match(api, /require\('\.\.\/lib\/dozologjia\.js'\)/);

assert.equal(data.principles.clinicalIdentity, 'active-substance');
assert.equal(data.principles.productTableRequired, false);
assert.equal(data.principles.clientSideClinicalMath, false);
assert.equal(data.principles.durationRequired, true);
assert.equal(data.principles.inventDurationWhenMissing, false);
assert.deepEqual(data.substances.map(x => x.id), [
  'amoxicillin','amoxicillin-clavulanic-acid','ceftriaxone','trimethoprim-sulfamethoxazole'
]);
for (const substance of data.substances) {
  assert.ok(substance.regimens.length > 0);
  for (const regimen of substance.regimens) {
    assert.ok(regimen.duration?.kind, `${regimen.id}: duration mungon`);
    assert.ok(regimen.duration?.label, `${regimen.id}: duration label mungon`);
    assert.match(regimen.source?.url || '', /^https:\/\//, `${regimen.id}: source duhet HTTPS`);
    assert.equal(regimen.source?.section, '4.2');
  }
}

const amox = engine.substances('amoks');
assert.equal(amox[0].id, 'amoxicillin');
const childLyme = engine.calculate({ substanceId:'amoxicillin', regimenId:'amox-lyme-early-child', weightKg:18 });
assert.equal(childLyme.outcome, 'CALCULATED');
assert.equal(childLyme.dose.dailyMinMg, 450);
assert.equal(childLyme.dose.dailyMaxMg, 900);
assert.equal(childLyme.dose.perDoseMinMg, 150);
assert.equal(childLyme.dose.perDoseMaxMg, 300);
assert.equal(childLyme.duration.minDays, 10);
assert.equal(childLyme.duration.maxDays, 21);
assert.equal(childLyme.requiresReview, true);

const missingWeight = engine.calculate({ substanceId:'ceftriaxone', regimenId:'ctx-aom-child-single' });
assert.equal(missingWeight.outcome, 'NEEDS_PATIENT_DATA');
assert.deepEqual(missingWeight.required, ['weightKg']);

const cef = engine.calculate({ substanceId:'ceftriaxone', regimenId:'ctx-gonorrhoea-adult' });
assert.equal(cef.dose.perDoseMg, 500);
assert.equal(cef.duration.kind, 'single');

const coamox = engine.calculate({ substanceId:'amoxicillin-clavulanic-acid', regimenId:'coamox-standard-adult-875-125' });
assert.equal(coamox.duration.kind, 'clinical');
assert.equal(coamox.duration.reviewAfterDays, 14);

console.log('Dozologjia clean substance-first rebuild contract passed.');
