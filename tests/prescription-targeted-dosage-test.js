'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const gateway = read('api/dosage.js');
const targetedSource = read('lib/prescription-dosage-handler.js');
const contextSource = read('lib/prescription-dosage-context-handler.js');
const recetat = read('recetat-v2.js');
const administrationSource = read('administration-routes.js');
const targetedHandler = require('../lib/prescription-dosage-handler.js');
const Administration = require('../administration-routes.js');

for (const file of ['api/dosage.js','lib/prescription-dosage-handler.js','lib/prescription-dosage-context-handler.js','recetat-v2.js','administration-routes.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(gateway, /prescriptionDosageHandler/);
assert.match(gateway, /requestView\(req\) === 'prescription'/);
assert.match(gateway, /isPrescriptionContextRequest/);
assert.match(targetedSource, /async function loadDrugRegimens\(/);
assert.equal(typeof targetedHandler.loadDrugRegimens, 'function');
assert.equal(targetedHandler._test.MAX_REGIMENS, 64);

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const regimenPath = targetedHandler._test.regimenPath(uuid);
assert.match(regimenPath, /^dosage_regimens\?/);
assert.match(decodeURIComponent(regimenPath), /drug_id=eq\.123e4567-e89b-42d3-a456-426614174000/i);
assert.match(decodeURIComponent(regimenPath), /editorial_status=eq\.published/);
assert.match(decodeURIComponent(regimenPath), /calculation_status=in\.\(text_verified,calculable_verified\)/);

assert.match(contextSource, /PrescriptionDosage\.loadDrugRegimens\(drugId\)/);
assert.match(contextSource, /X-MedIndex-Drug-ID/);
assert.match(recetat, /function hydrateRegistryDrug\(/);
assert.match(recetat, /loadForDrug\(drugId/);
assert.match(recetat, /view=registry-detail&id=/);
assert.doesNotMatch(recetat, /fetch\('\/api\/dosage'\s*,/);
assert.match(recetat, /setProductConstraint/);
assert.match(recetat, /populationCompatibilityForDrug/);

assert.match(administrationSource, /explicitForCategory\.length \? explicitForCategory : inferredForCategory/);
assert.equal(Administration.inferAdministration({ form:'Tablet', allowedRoutes:['PR'] }).route, 'PR');
assert.equal(Administration.inferAdministration({ form:'Vaginal capsule' }).route, 'VAG');

console.log('Prescription V2 targeted product-context dosage contract passed.');
