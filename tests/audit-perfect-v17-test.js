'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const workspaces = [
  ['index.html','registry-v2.js'],
  ['klasifikimi.html','classification-v2.js'],
  ['icd.html','icd-v2.js'],
  ['dozologjia.html','dozologjia-v2.js'],
  ['protokollet.html','protokollet-v2.js'],
  ['urgjencat.html','urgjencat-v2.js'],
  ['recetat.html','recetat-v2.js'],
  ['analizat.html','analizat-v2.js'],
  ['medical-hub.html','medical-hub-v2.js'],
  ['sistemi.html','sistemi-v2.js'],
];

function stylesOf(html) {
  return [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
    .map(match => match[1]);
}

function normalizedSidebar(html) {
  const start = html.indexOf('<aside class="sidebar"');
  const end = html.indexOf('</aside>', start);
  assert.ok(start >= 0 && end > start, 'Canonical sidebar markup is missing');
  return html.slice(start, end + 8)
    .replace(/ class="nav-item is-active"/g, ' class="nav-item"')
    .replace(/ aria-current="page"/g, '')
    .replace(/(<details class="nav-group" id="atcNavGroup") open/g, '$1')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

const canonicalSidebar = normalizedSidebar(read('index.html'));

for (const [htmlFile, jsFile] of workspaces) {
  const html = read(htmlFile);
  const js = read(jsFile);
  const styles = stylesOf(html);

  assert.match(html, /\/sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v5/, `${htmlFile}: direct sidebar v5 runtime missing`);
  assert.equal(styles.at(-1), '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8', `${htmlFile}: shell v8 must load last`);
  assert.equal(normalizedSidebar(html), canonicalSidebar, `${htmlFile}: static sidebar markup drift`);

  assert.match(js, /function loadSharedSidebarTaxonomy\(\)/, `${jsFile}: sidebar loader missing`);
  assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v5/, `${jsFile}: loader version drift`);
  assert.match(js, /window\.DRxSidebarTaxonomy \|\| window\.DRxSidebarCollapse/, `${jsFile}: direct-script short circuit missing`);
  assert.doesNotMatch(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v4/, `${jsFile}: stale sidebar v4 loader returned`);
  assert.doesNotThrow(() => new Function(js), `${jsFile}: syntax error`);
}

const shared = read('sidebar-taxonomy-v3.js');
assert.match(shared, /RUNTIME_VERSION = 'sidebar-taxonomy-v5'/);
assert.match(shared, /__DRX_SIDEBAR_TAXONOMY_RUNTIME__/);
assert.match(shared, /SIDEBAR_DESKTOP_QUERY = '\(min-width:1024px\)'/);
assert.match(shared, /SIDEBAR_COLLAPSE_KEY = 'drx_sidebar_collapsed_v2'/);
assert.match(shared, /CANONICAL_WORKER_URL = '\/sw\.js\?v=drx-workspace-v8'/);
assert.match(shared, /window\.DRxSidebarCollapse = Object\.freeze/);

const stripe = read('drx-dashboard-stripe.css');
assert.match(stripe, /DRx canonical collapsible sidebar v8/);
assert.match(stripe, /--drx-shell-sidebar-collapsed-width:76px/);
assert.match(stripe, /drx-sidebar-collapsed \.main-shell/);

const prescriptions = read('recetat.html');
const prescriptionCss = read('recetat-v2.css');
assert.match(prescriptions, /data-ui-revision="recetat-v16"/);
assert.match(prescriptions, /recetat-v2\.css\?v=16/);
assert.match(prescriptions, /recetat-v2\.js\?v=16/);
assert.doesNotMatch(prescriptions, /id="sidebarCollapse"|class="brand-mark"/, 'Recetat must not own sidebar collapse markup');
assert.match(prescriptionCss, /Recetat V2 — final UI coherence pass v16/);
assert.doesNotMatch(prescriptionCss, /Recetat V2 — persistent desktop mini-sidebar v10/);

const worker = read('sw.js');
assert.match(worker, /VERSION = 'workspace-coherence-v8'/);
assert.match(worker, /CACHE_EPOCH = '20260902-shell-v8-sidebar-v5-recetat-v16'/);
assert.match(worker, /function isTargetedDosageRequest\(url\)/);
assert.match(worker, /const REQUIRED_PRIVATE_PATHS = \['\/api\/registry', '\/data\/protocols\.json'\]/);
const targeted = worker.indexOf('if (isTargetedDosageRequest(url))');
const full = worker.indexOf('if (PRIVATE_DATA_PATHS.has(url.pathname))');
assert.ok(targeted >= 0 && full > targeted, 'Targeted dosage cache must win before the full dosage compatibility cache');
const readiness = worker.slice(worker.indexOf('async function privateCacheStatus'), worker.indexOf('async function warmPrivateData'));
assert.doesNotMatch(readiness, /new URL\('\/api\/dosage'/, 'Offline readiness must not require a full dosage payload');

const ignoreGate = read('scripts/vercel-ignore-build.js');
assert.match(ignoreGate, /function hasExplicitSkip\(/);
assert.match(ignoreGate, /metadata-only HEAD is not implicitly safe to skip/);

const pkg = JSON.parse(read('package.json'));
assert.match(pkg.scripts?.['test:deploy'] || '', /audit-perfect-v17-test\.js/);
assert.match(pkg.scripts?.['test:recetat-ui-browser'] || '', /recetat-ui-playwright\.spec\.js/);

console.log('Audit Perfect v17 passed: shell, sidebar, Recetat V16, targeted dosage cache, service-worker epoch and deploy gate are coherent.');
