'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SHELL_VERSION = 'drx-dashboard-stripe-v8';
const BRAND_RUNTIME_VERSION = 'drx-brand-v6';

const workspaces = [
  ['index.html', 'registry-v2.js', 'sidebar-taxonomy-v4'],
  ['klasifikimi.html', 'classification-v2.js', 'sidebar-taxonomy-v4'],
  ['icd.html', 'icd-v2.js', 'sidebar-taxonomy-v4'],
  ['dozologjia.html', 'dozologjia-v2.js', 'sidebar-taxonomy-v4'],
  ['protokollet.html', 'protokollet-v2.js', 'sidebar-taxonomy-v4'],
  ['urgjencat.html', 'urgjencat-v2.js', 'sidebar-taxonomy-v4'],
  ['recetat.html', 'recetat-v2.js', 'sidebar-taxonomy-v5'],
  ['analizat.html', 'analizat-v2.js', 'sidebar-taxonomy-v4'],
  ['medical-hub.html', 'medical-hub-v2.js', 'sidebar-taxonomy-v4'],
  ['sistemi.html', 'sistemi-v2.js', 'sidebar-taxonomy-v4'],
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
    .replace(/<button class="sidebar-collapse"[\s\S]*?<\/button>/g, '')
    .replace(/<img class="brand-mark"[^>]*>/g, '')
    .replace(/ class="brand-full"/g, '')
    .replace(/ class="nav-item is-active"/g, ' class="nav-item"')
    .replace(/ aria-current="page"/g, '')
    .replace(/(<details class="nav-group" id="atcNavGroup") open/g, '$1')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

const canonicalSidebar = normalizedSidebar(read('index.html'));

for (const [htmlFile, jsFile, sidebarRuntimeVersion] of workspaces) {
  const html = read(htmlFile);
  const js = read(jsFile);
  const styles = stylesOf(html);
  const shellStyles = styles.filter(href => href.includes('drx-dashboard-stripe.css'));

  assert.match(html, /class="drx-unified-sidebar"/, `${htmlFile}: unified shell marker missing`);
  assert.equal(shellStyles.length, 1, `${htmlFile}: exactly one canonical shell stylesheet is required`);
  assert.equal(styles.at(-1), `/drx-dashboard-stripe.css?v=${SHELL_VERSION}`, `${htmlFile}: shared shell must load last`);
  assert.equal(normalizedSidebar(html), canonicalSidebar, `${htmlFile}: sidebar drifted from the canonical Registry sidebar`);
  assert.match(js, new RegExp(`sidebar-taxonomy-v3\\.js\\?v=${sidebarRuntimeVersion}`), `${jsFile}: shared sidebar runtime version drift`);
  assert.match(js, new RegExp(`medindex-brand-runtime\\.js\\?v=${BRAND_RUNTIME_VERSION}`), `${jsFile}: shared brand runtime version drift`);
  assert.doesNotThrow(() => new Function(js), `${jsFile}: syntax error`);
}

const shared = read('sidebar-taxonomy-v3.js');
assert.match(shared, /CANONICAL_WORKER_URL = '\/sw\.js\?v=drx-workspace-v7'/);
assert.match(shared, /navigator\.serviceWorker\.register\(CANONICAL_WORKER_URL/);
assert.match(shared, /updateViaCache:'none'/);
assert.match(shared, /dataset\.drxSidebarStructure = 'taxonomy-v4'/);

const stripe = read('drx-dashboard-stripe.css');
assert.match(stripe, /DRx canonical sidebar shell v5/);
assert.match(stripe, /DRx clinical workspace system v6 — Urgjencat reference/);
assert.match(stripe, /--drx-type-page-title:32px/);
assert.match(stripe, /--drx-type-subtitle:14px/);

const canonicalWorkspaceAssets = [
  '/registry-v2.css','/registry-v2-dose-calculator.css','/classification-v2.css','/icd-v2.css',
  '/dozologjia-v2.css','/protokollet-v2.css','/urgjencat-v2.css','/recetat-v2.css',
  '/analizat-v2.css','/medical-hub-v2.css','/sistemi-v2.css','/drx-dashboard-stripe.css',
  '/dose-core.js','/dose-runtime-browser.js','/registry-v2.js','/registry-v2-dose-calculator.js',
  '/classification-data.js','/classification-v2.js','/icd-v2.js','/phase9-personal-entities-client.js',
  '/dozologjia-v2.js','/protokollet-v2.js','/urgjencat-v2.js','/recetat-v2.js',
  '/analizat-v2.js','/medical-hub-v2.js','/sistemi-v2.js','/sidebar-taxonomy-v3.js',
  '/medindex-brand-runtime.js','/sanity-clinical-client.js',
];

const worker = read('sw.js');
assert.match(worker, /workspace-cache-cutover-v7/);
assert.match(worker, /VERSION = 'workspace-coherence-v7'/);
assert.match(worker, /CACHE_EPOCH = '20260901-shell-v6-sidebar-v4'/);
for (const [htmlFile] of workspaces) {
  assert.ok(worker.includes(`'/${htmlFile}'`), `sw.js: ${htmlFile} is missing from the clinical shell`);
}
for (const asset of canonicalWorkspaceAssets) {
  assert.ok(worker.includes(`'${asset}'`) || worker.includes(`"${asset}"`), `sw.js: ${asset} is missing from the canonical workspace shell`);
}

const builder = read('scripts/build-static-runtime.js');
for (const [htmlFile] of workspaces) {
  assert.ok(builder.includes(`'/${htmlFile}'`), `build-static-runtime: ${htmlFile} is missing from clinicalPages`);
}

const design = read('.superdesign/design-system.md');
assert.match(design, /Urgjencat is the canonical content-density reference/);

const pkg = JSON.parse(read('package.json'));
assert.match(pkg.scripts.test, /workspace-coherence-v7-test\.js/);

console.log('Workspace coherence v7: 10/10 pages share one shell, strict sidebar runtime versions, one typography contract and one canonical worker cutover.');
