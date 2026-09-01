'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));

const pages = [
  'index.html','klasifikimi.html','icd.html','dozologjia.html','protokollet.html',
  'urgjencat.html','recetat.html','analizat.html','medical-hub.html','sistemi.html',
];

for (const page of pages) {
  const html = read(page);
  const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
    .map(match => match[1]);
  assert.equal(
    styles.at(-1),
    '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v6',
    `${page}: canonical shell v6 must remain the final stylesheet`
  );
}

const dosageHtml = read('dozologjia.html');
const dosageCssVersion = dosageHtml.match(/dozologjia-v2\.css\?v=(\d+)/)?.[1];
const dosageJsVersion = dosageHtml.match(/dozologjia-v2\.js\?v=(\d+)/)?.[1];
assert.ok(dosageCssVersion && dosageJsVersion, 'Dozologjia cache revisions are missing');
assert.equal(dosageCssVersion, dosageJsVersion, 'Dozologjia CSS/JS cache revisions must stay coherent');

const workflowDir = path.join(ROOT, '.github', 'workflows');
const workflows = fs.readdirSync(workflowDir)
  .filter(name => /\.ya?ml$/i.test(name))
  .map(name => [name, fs.readFileSync(path.join(workflowDir, name), 'utf8')]);
const retiredWorkflowMarkers = [
  'drx-dashboard-stripe-v4',
  'drx-dashboard-stripe-v5',
  'sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3',
  'urgjencat-doctor-v3-test.js',
  'emergency-shift-v18',
  'urgjencat-physician-v17-browser.spec.js',
];
for (const [name, source] of workflows) {
  for (const marker of retiredWorkflowMarkers) {
    assert.ok(!source.includes(marker), `${name}: retired workflow marker returned: ${marker}`);
  }
}

const apiFunctions = fs.readdirSync(path.join(ROOT, 'api'))
  .filter(name => name.endsWith('.js'))
  .sort();
const middlewareEntries = ['middleware.ts','middleware.js','middleware.mjs'].filter(exists);
const runtimeFunctionCount = apiFunctions.length + middlewareEntries.length;
assert.ok(runtimeFunctionCount <= 11, `Vercel function reserve lost: ${runtimeFunctionCount}/12 runtime functions`);
assert.ok(!apiFunctions.includes('medical-hub-image.js'), 'Medical Hub image proxy must share the medical-hub function');
assert.ok(!apiFunctions.includes('prescription-dosage-context.js'), 'Prescription context must share the dosage gateway');
assert.ok(exists('lib/prescription-dosage-context-handler.js'), 'Shared prescription context handler is missing');
assert.ok(exists('lib/medical-hub-image-handler.js'), 'Medical Hub shared image handler is missing');

const brandSeed = read('scripts/seed-horizontal-brand-assets.js');
assert.match(brandSeed, /MEDINDEX_BLOB_MIRROR_ENABLED/);
assert.match(brandSeed, /Blob mirror disabled; local \/brand assets are authoritative/);

const vercel = JSON.parse(read('vercel.json'));
assert.deepEqual(
  vercel.git?.deploymentEnabled,
  {'*':false,main:true},
  'Vercel previews must stay disabled on Hobby so CI commits do not exhaust the deployment quota'
);
const packageJson = JSON.parse(read('package.json'));
assert.match(packageJson.scripts?.build || '', /pnpm run test:deploy/, 'Vercel build must use the focused deploy gate');
assert.doesNotMatch(packageJson.scripts?.build || '', /\bpnpm\s+test\b/, 'Vercel build must not rerun the exhaustive CI suite');
assert.match(packageJson.scripts?.['test:deploy'] || '', /fullstack-audit-v8-test\.js/);
assert.match(packageJson.scripts?.['test:deploy'] || '', /drx-dose-core-test\.js/);
assert.match(packageJson.scripts?.['test:deploy'] || '', /vercel-runtime-resilience-test\.js/);
assert.match(packageJson.scripts?.['test:deploy'] || '', /drx-dose-runtime-engine-test\.js/);
assert.match(packageJson.scripts?.['test:deploy'] || '', /drx-dose-v3-rpc-reader-test\.js/);
const rewrites = new Map((vercel.rewrites || []).map(row => [row.source, row.destination]));
assert.equal(rewrites.get('/api/medical-hub-image'), '/api/medical-hub?_route=image');
assert.equal(rewrites.get('/api/prescription-dosage-context'), '/api/dosage?view=prescription-context');
assert.equal(rewrites.get('/api/icd'), '/api/clinical-editor?icdApi=1');

for (const file of ['lib/medindex-data-api.js','lib/supabase-data-api.js']) {
  const source = read(file);
  assert.match(source, /function isPrivilegedSupabaseKey/);
  assert.match(source, /SUPABASE_PRIVILEGED_KEY_INVALID/);
  assert.match(source, /never the publishable key/);
}

const migrations = JSON.parse(read('supabase/migration-history.json')).migrations || [];
assert.ok(migrations.some(row =>
  row.version === '20260831235911'
  && row.name === 'harden_function_search_paths_and_validate_profile_specialty'
));
assert.ok(migrations.some(row =>
  row.version === '20260901000156'
  && row.name === 'fail_closed_unverified_published_indications'
));
assert.ok(migrations.some(row =>
  row.version === '20260901000724'
  && row.name === 'rollback_phase10_to_shadow_after_indication_gate'
));
assert.ok(exists('supabase/migrations/20260831235911_harden_function_search_paths_and_validate_profile_specialty.sql'));
assert.ok(exists('supabase/migrations/20260901000156_fail_closed_unverified_published_indications.sql'));
assert.ok(exists('supabase/migrations/20260901000724_rollback_phase10_to_shadow_after_indication_gate.sql'));

const canary = read('scripts/drx-phase10-controlled-canary.js');
assert.match(canary, /CONTROLLED_NOT_ACTIVE/);
const pediatricLive = read('scripts/drx-phase10-pediatric-v3-live.js');
assert.match(pediatricLive, /V3_PUBLICATION_NOT_ACTIVE/);

const doseVisual = read('tests/dose-row-visual-rules-test.js');
assert.match(doseVisual, /td\\\[data-col="pediatricDose"\\\] \\.route-chip/);
assert.doesNotMatch(doseVisual, /td\.nth-child\\\(9\\\) \\.route-chip/);

console.log(`Full-stack audit v8 passed: ${pages.length} workspaces, ${runtimeFunctionCount}/12 Vercel runtime functions, current workflows, fail-closed Supabase guards and migration parity artifacts.`);
