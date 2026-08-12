'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const search = read('api/drug-search.js');
const gateway = read('api/dosage.js');
const handlerSource = read('lib/prescription-dosage-handler.js');
const recetat = read('recetat.js');
const coreSource = read('prescription-format-core.js');
const packageJson = JSON.parse(read('package.json'));
const handler = require('../lib/prescription-dosage-handler.js');
const core = require('../prescription-format-core.js');

for (const file of ['api/drug-search.js','api/dosage.js','lib/prescription-dosage-handler.js','recetat.js','prescription-format-core.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(search, /drugId:clean\(row\.__neonDrugId\)/, 'Drug search must expose the stable Neon drugId.');
assert.equal(core.normalizeDrug({ drugId:'abc', substance:'Test' }).drugId, 'abc', 'Prescription core must preserve drugId.');
assert.match(coreSource, /drugId: text\(item\?\.drugId \|\| item\?\.id\)/);

assert.match(gateway, /prescriptionDosageHandler/);
assert.match(gateway, /requestView\(req\) === 'prescription'/);
assert.match(gateway, /if \(isPrescriptionRequest\(req\)\) return prescriptionDosageHandler\(req, res\)/);

assert.equal(handler._test.MAX_REGIMENS, 64);
const uuid = '123e4567-e89b-42d3-a456-426614174000';
const regimenPath = handler._test.regimenPath(uuid);
assert.match(regimenPath, /^dosage_regimens\?/);
assert.match(regimenPath, /drug_id=eq(?:\.|%2E)123e4567-e89b-42d3-a456-426614174000/i);
assert.match(decodeURIComponent(regimenPath), /editorial_status=eq\.published/);
assert.match(decodeURIComponent(regimenPath), /calculation_status=in\.\(text_verified,calculable_verified\)/);
assert.match(decodeURIComponent(regimenPath), /limit=64/);
assert.doesNotMatch(handlerSource, /source_payload|select[^\n]*\*/, 'Targeted prescription dosage must not read source_payload or SELECT *.');
assert.match(handlerSource, /X-MedIndex-Data-Source', 'neon'/);
assert.match(handlerSource, /private, max-age=60, stale-while-revalidate=300/);
assert.match(handlerSource, /Lejohet vetëm GET\/HEAD/);

assert.match(recetat, /dosageByDrug: new Map\(\)/);
assert.match(recetat, /dosagePromises: new Map\(\)/);
assert.match(recetat, /dosagePayloadForDrug\(drug\)/);
assert.match(recetat, /\/api\/dosage\?view=prescription&id=/);
assert.doesNotMatch(recetat, /fetch\('\/api\/dosage'\s*,/, 'Recetat must never fetch the full dosage dataset on the normal path.');
assert.match(recetat, /decision\.status === 'choose-indication'/, 'Multiple indication chooser must remain intact.');
assert.match(recetat, /openDosageChooser\(drug, decision\.matches, options\)/);
assert.match(recetat, /dosageStatus:'manual'/, 'Manual fallback must remain available when targeted matching is unavailable.');

assert.match(packageJson.scripts['build:runtime'], /patch-prescription-targeted-dosage\.js/, 'Phase 7 patch must be part of the deterministic build chain.');
assert.equal(fs.existsSync(path.join(ROOT, 'api', 'prescription-dosage.js')), false, 'Phase 7 must reuse /api/dosage instead of consuming another Vercel function slot.');

console.log('Phase 7 targeted Recetat dosage, drugId bridge, indication chooser and no-full-dosage contract passed.');
