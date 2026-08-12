'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('index.html');
const runtime = read('registry-desktop-prescription-lite.js');
const desktop = read('registry-desktop-lite.js');
const wiring = read('scripts/patch-phase12-targeted-detail-wiring.js');
const handoffPatch = read('scripts/patch-phase13-prescription-lite.js');
const recetat = read('recetat.js');
const targetedDosageTest = read('tests/prescription-targeted-dosage-test.js');

for (const file of [
  'registry-desktop-prescription-lite.js',
  'scripts/patch-phase13-prescription-lite.js',
]) execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

assert.match(index, /registry-desktop-prescription-lite\.js\?v=20260812-1/);
assert.match(runtime, /registry-desktop-prescription-lite-v1/);
assert.match(runtime, /const SELECTION_KEY = 'medindexPrescriptionSelection'/);
assert.match(runtime, /drugId:row\.__neonDrugId/, 'Stable Neon drugId must cross the registry→Recetat bridge.');
assert.match(runtime, /sessionStorage\.setItem\(SELECTION_KEY/);
assert.match(runtime, /#tbody input\.drug-select/);
assert.match(runtime, /data-desktop-lite-select-all/);
assert.match(runtime, /selectedCount/);
assert.match(runtime, /#protocolsBtn,\[data-nav="protocols"\]/);
assert.match(runtime, /window\.location\.href = 'recetat\.html'/);
assert.match(runtime, /document\.addEventListener\('change', onChange, true\)/, 'Selection interception must happen before legacy target listeners.');
assert.match(runtime, /document\.addEventListener\('click', openPrescription, true\)/, 'Prescription navigation interception must happen before legacy target listeners.');
assert.doesNotMatch(runtime, /fetch\s*\(/, 'Selecting medicines must not add any Neon or API request.');
assert.doesNotMatch(runtime, /\/api\/registry|DRUG_DATA_PARTS|indexedDB|localStorage/, 'Selection bridge must not load or persist the full registry.');

assert.doesNotMatch(desktop, /prescription-selection|select-page-for-prescription/, 'Legacy checkbox handoffs must be removed during the build.');
assert.doesNotMatch(desktop, /\['protocolsBtn', 'prescription-builder'\]/, 'Krijo recetën must stay lightweight in normal desktop mode.');
assert.match(handoffPatch, /prescription-selection\|select-page-for-prescription/);
assert.match(wiring, /require\('\.\/patch-phase13-prescription-lite\.js'\)/);

assert.match(recetat, /const SELECTION_KEY = 'medindexPrescriptionSelection'/);
assert.match(recetat, /sessionStorage\.getItem\(SELECTION_KEY\)/);
assert.match(recetat, /sessionStorage\.removeItem\(SELECTION_KEY\)/, 'Recetat must consume the transfer once.');
assert.match(targetedDosageTest, /\/api\\\/dosage\\\?view=prescription&id=/, 'Phase 7 targeted prescription dosage must remain the downstream dosage path.');
assert.match(targetedDosageTest, /drugId bridge/);

console.log('Phase 13 desktop selection and Recetat navigation stay zero-network and preserve drugId for targeted prescription dosage.');
