'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const shared = read('sidebar-taxonomy-v3.js');
const icdSidebar = read('icd-sidebar-v3.js');
const shell = read('tailadmin-shell.js');
const shellCore = read('tailadmin-shell-core.js');
const stripe = read('drx-dashboard-stripe.css');

assert.doesNotThrow(() => new Function(shared));
assert.doesNotThrow(() => new Function(icdSidebar));
assert.doesNotThrow(() => new Function(shell));
assert.doesNotThrow(() => new Function(shellCore));

assert.match(shared, /\/api\/icd\?view=nav/);
assert.match(shared, /id = 'icdNavGroup'|id='icdNavGroup'|details\.id = 'icdNavGroup'/);
assert.match(shared, /class="atc-group-link"/);
assert.match(shared, /class="atc-group-code"/);
assert.match(shared, /class="atc-group-name"/);
assert.match(shared, /Të gjithë kapitujt/);
assert.match(shared, /22/);
assert.match(shared, /data-icd-chapter/);
assert.match(shared, /canonicalize\(nav\)/);
assert.match(shared, /classification-data\.js\?v=atc-catalog-v2/);
assert.match(shared, /function enhanceAtc\(nav\)/);
assert.match(shared, /function syncAtc\(/);
assert.match(shared, /data-atc-details/);
assert.match(shared, /data-atc-sub/);
assert.match(shared, /class="atc-sub-list"/);
assert.match(shared, /class="atc-sub-link"/);
assert.match(shared, /other\.open = false/);
assert.match(shared, /window\.DRxSidebarTaxonomy/);
assert.match(shared, /CANONICAL_WORKER_URL = '\/sw\.js\?v=drx-workspace-v7'/);
assert.match(shared, /navigator\.serviceWorker\.register\(CANONICAL_WORKER_URL/);
assert.match(shared, /updateViaCache:'none'/);
assert.match(shared, /dataset\.drxSidebarStructure = 'taxonomy-v4'/);

assert.match(icdSidebar, /\/api\/icd\?view=nav/);
assert.match(icdSidebar, /mi-atc-menu mi-icd-menu-shared/);
assert.match(icdSidebar, /mi-atc-subcategory-link/);
assert.match(icdSidebar, /Të gjithë kapitujt/);
assert.match(icdSidebar, /data-mi-icd-chapter/);

assert.match(shell, /ICD_NAV_SRC = '\/icd-sidebar-v3\.js\?v=icd-sidebar-v3'/);
assert.match(shell, /function loadIcdNavigation\(\)/);
assert.match(shell, /loadIcdNavigation\(\)/);

const order = [
  "label:'Barnat'",
  "label:'Klasifikimi ATC'",
  "label:'ICD‑10'",
  "label:'Dozologjia'",
  "label:'Protokollet'",
  "label:'Urgjencat'",
  "label:'Recetat'",
  "label:'Analizat'",
  "label:'Medical Hub'",
];
let cursor = -1;
for (const marker of order) {
  const next = shellCore.indexOf(marker, cursor + 1);
  assert.ok(next > cursor, `Sidebar order mismatch at ${marker}`);
  cursor = next;
}
assert.match(shellCore, />KLINIKE<\/p>/);
assert.match(shellCore, />PUNA IME<\/p>/);

for (const file of ['registry-v2.js','classification-v2.js','icd-v2.js','dozologjia-v2.js','urgjencat-v2.js','analizat-v2.js','protokollet-v2.js','recetat-v2.js','medical-hub-v2.js','sistemi-v2.js']) {
  const source = read(file);
  assert.match(source, /function loadSharedSidebarTaxonomy\(\)/, `${file}: shared sidebar loader missing`);
  assert.match(source, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v4/, `${file}: shared sidebar runtime missing`);
}

for (const [file, runtime] of [
  ['index.html','registry-v2.js'],
  ['klasifikimi.html','classification-v2.js'],
  ['icd.html','icd-v2.js'],
]) {
  const html = read(file);
  assert.match(html, new RegExp(runtime.replace('.', '\\.') + '\\?v=[^"\\s]+'), `${file}: V2 runtime cache-bust missing`);
}
for (const [htmlFile, runtime, version] of [
  ['dozologjia.html','dozologjia-v2.js','dynamic-v4+'],
  ['urgjencat.html','urgjencat-v2.js','10'],
  ['analizat.html','analizat-v2.js','1'],
  ['protokollet.html','protokollet-v2.js','1'],
  ['recetat.html','recetat-v2.js','1'],
  ['medical-hub.html','medical-hub-v2.js','dynamic'],
  ['sistemi.html','sistemi-v2.js','1'],
]) {
  const html = read(htmlFile);
  const js = read(runtime);
  const runtimeVersionPattern = version === 'dynamic' || version === 'dynamic-v4+'
    ? new RegExp(runtime.replace('.', '\\.') + '\\?v=\\d+')
    : new RegExp(runtime.replace('.', '\\.') + '\\?v=' + version);
  assert.match(html, runtimeVersionPattern, `${htmlFile}: standalone V2 runtime missing`);
  if (version === 'dynamic-v4+') {
    const match = html.match(new RegExp(runtime.replace('.', '\\.') + '\\?v=(\\d+)'));
    assert.ok(match && Number(match[1]) >= 4, `${htmlFile}: runtime version must not regress below v4`);
  }
  assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v4/, `${runtime}: shared taxonomy loader missing`);
}

for (const file of ['index.html','klasifikimi.html','icd.html','dozologjia.html','urgjencat.html','analizat.html','protokollet.html','recetat.html','medical-hub.html','sistemi.html']) {
  const html = read(file);
  assert.match(html, /drx-unified-sidebar/, `${file}: unified standalone sidebar marker missing`);
  assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v6/, `${file}: shared Stripe sidebar authority missing`);
}

assert.match(stripe, /Shared taxonomy sidebar — ATC and ICD use one identical navy language/);
assert.match(stripe, /#appMenu :is\(\.mi-atc-root-panel,\.mi-atc-submenu\)/);
assert.match(stripe, /Canonical sidebar taxonomy depth — ATC groups\/subgroups/);
assert.match(stripe, /\.drx-unified-sidebar \.atc-sub-link/);


const classificationHtml = read('klasifikimi.html');
const classificationJs = read('classification-v2.js');
const classificationCss = read('classification-v2.css');
assert.doesNotMatch(classificationHtml, /id="groupList"|class="group-panel"|id="groupCount"|id="atcStatusMeta"/);
assert.doesNotMatch(classificationJs, /el\.groupList|el\.groupCount|el\.atcStatusMeta|function renderGroups\(/);
assert.doesNotMatch(classificationCss, /\.group-panel|\.group-list|\.group-row/);
assert.match(classificationJs, /window\.DRxSidebarTaxonomy\?\.syncAtc\?\.\(\)/);
assert.match(classificationJs, /if \(!hadGroup\) writeHash/);

console.log('Shared sidebar taxonomy v3: ATC + ICD nesting and canonical page order passed.');
