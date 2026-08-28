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

for (const file of ['registry-v2.js','classification-v2.js','icd-v2.js']) {
  const source = read(file);
  assert.match(source, /function loadSharedSidebarTaxonomy\(\)/, `${file}: shared sidebar loader missing`);
  assert.match(source, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v3/, `${file}: shared sidebar runtime missing`);
}

for (const file of ['index.html','klasifikimi.html','icd.html']) {
  const html = read(file);
  assert.match(html, /sidebar-taxonomy-v3/, `${file}: V2 runtime cache-bust missing`);
}

for (const file of ['analizat.html','dozologjia.html','medical-hub.html','protokollet.html','recetat.html','sistemi.html','urgjencat.html']) {
  const html = read(file);
  assert.match(html, /tailadmin-shell\.js\?v=sidebar-taxonomy-v3/, `${file}: shared TailAdmin sidebar cache-bust missing`);
}

assert.match(stripe, /Shared taxonomy sidebar — ATC and ICD use one identical navy language/);
assert.match(stripe, /#appMenu :is\(\.mi-atc-root-panel,\.mi-atc-submenu\)/);

console.log('Shared sidebar taxonomy v3: ATC + ICD nesting and canonical page order passed.');
