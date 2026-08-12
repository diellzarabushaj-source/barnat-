'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const desktop = read('registry-desktop-lite.js');
const api = read('api/drug-search.js');
const clinical = read('form-picker-clinical.js');
const patch = read('scripts/patch-phase11-form-picker-lite.js');
const phase11Build = read('scripts/patch-phase11-desktop-advanced-lite.js');
const phase11Gate = read('tests/registry-desktop-large-page-lite-test.js');
const packageJson = JSON.parse(read('package.json'));

execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-desktop-lite.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'api/drug-search.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'scripts/patch-phase11-form-picker-lite.js')], { stdio:'pipe' });

assert.match(desktop, /DESKTOP_FORM_FILTER_RUNTIME = 'phase11-form-picker-lite-v1'/);
assert.match(desktop, /DESKTOP_FORM_CATEGORIES/);
assert.match(desktop, /DESKTOP_FORM_ALIASES/);
assert.match(desktop, /function initDesktopFormPicker\(/);
assert.match(desktop, /function buildDesktopFormPanel\(/);
assert.match(desktop, /function selectDesktopForm\(/);
assert.match(desktop, /params\.set\('formExact', state\.formValue\)/, 'Exact form selection must stay server-side.');
assert.match(desktop, /params\.set\('formCategory', state\.formValue\)/, 'Category selection must stay server-side.');
assert.doesNotMatch(desktop, /\['formPickerBtn', 'form-picker'\]/, 'The form picker must not hand off to the full registry.');
assert.doesNotMatch(desktop, /\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS/, 'Form filtering must remain on the lightweight gateway.');

assert.match(api, /REGISTRY_FORM_FILTER_RUNTIME = 'phase11-form-picker-lite-v1'/);
assert.match(api, /const REGISTRY_FORM_CATEGORIES/);
assert.match(api, /const formExact = registryPageTextFilter\(query\.formExact, 120\)/);
assert.match(api, /const formCategory = clean\(query\.formCategory\)\.slice\(0, 80\)/);
assert.match(api, /params\.set\('pharmaceutical_form', 'eq\.' \+ formExact\)/, 'Individual form filtering must be exact.');
assert.match(api, /categoryForms\.map\(registryPostgrestQuotedValue\)/, 'Category filtering must be bounded to the canonical category forms.');
assert.match(api, /REGISTRY_MAX_PAGE_SIZE = 50/, 'Each Neon request must remain capped at 50 rows.');
assert.doesNotMatch(api, /params\.set\('select', '\*'\)/);

assert.doesNotMatch(clinical, /fetch\s*\(/, 'Opening/decorating the form picker must remain zero-network.');
assert.doesNotMatch(clinical, /\/api\//, 'The clinical form decorator must remain presentation-only.');
assert.match(patch, /extractObjectLiteral\('FORM_CATEGORIES'\)/, 'Phase 11 must reuse the canonical legacy taxonomy rather than duplicate it manually.');
assert.match(patch, /extractObjectLiteral\('FORM_ALIASES'\)/);
assert.match(phase11Build, /require\('\.\/patch-phase11-form-picker-lite\.js'\)/, 'The existing Phase 11 build patch must compose the form-lite patch.');
assert.match(phase11Gate, /require\('\.\/registry-desktop-form-lite-test\.js'\)/, 'The existing Phase 11 regression gate must compose the form-lite test.');
assert.match(packageJson.scripts['build:runtime'], /patch-phase11-desktop-advanced-lite\.js/, 'Phase 11 must remain in the deterministic build chain.');
assert.match(packageJson.scripts.test, /registry-desktop-large-page-lite-test\.js/, 'Phase 11 must remain in the main test suite.');

console.log('Phase 11 desktop pharmaceutical-form picker is zero-network until selection and filters bounded Neon pages without full-registry handoff.');
