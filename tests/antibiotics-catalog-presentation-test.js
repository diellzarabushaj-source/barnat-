'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

const html = read('antibiotiket.html');
const js = read('antibiotiket-catalog.js');
const core = read('antibiotiket-catalog-core.js');
const css = read('antibiotiket-catalog.css');
const layout = read('antibiotiket-layout.css');
const shell = read('antibiotiket-shell.js');

// Only the Mayo/AKPPM list is loaded on the clinical Antibiotikët page.
for (const asset of ['antibiotiket-layout.css', 'antibiotiket-catalog.css',
  'antibiotiket-catalog-core.js', 'antibiotiket-catalog-data.js', 'antibiotiket-catalog.js']) {
  assert.ok(html.includes('/' + asset + '?v='), `${asset}: missing from new page`);
}
for (const legacy of ['antibiotiket-nice.js', 'antibiotiket-guide.js', 'antibiotiket.js',
  'antibiotiket-infections.js', 'antibiotiket-manual.css', 'antibiotiket-infections.css',
  'data-nice-standard', 'indicationPicker', 'recommendationList', 'hospitalModule']) {
  assert.ok(!html.includes(legacy), `${legacy}: retired UI must not be included`);
}
assert.doesNotMatch(shell.slice(shell.indexOf('async function boot()')), /await loadAntibiotic/,
  'The shell must not launch hidden legacy clinical calculators');

// The filters sit above an accessible vertical list; neither screen uses a grid table.
assert.match(js, /class="abx-catalog-controls"/);
assert.match(js, /class="abx-catalog-list"[^>]*role="list"/);
assert.match(js, /<article class="abx-catalog-item" role="listitem"/);
assert.match(js, /<ul class="abx-catalog-regimens">/);
assert.doesNotMatch(js, /<table|<tr|<td|data-mode="guide"/);
assert.match(js, /abxCatalogOnlySelected/);
assert.match(js, /abxCatalogIndication/);
assert.match(js, /abxCatalogSubgroup/);
assert.match(js, /data-atc/);
assert.match(core, /filterAntibiotics/);
assert.match(css, /\.abx-catalog-list\{display:grid/);
assert.match(css, /@media\(max-width:540px\)/);
assert.match(layout, /\.abx-column\{width:100%/);

// Clinical qualifiers and approval status must stay attached to the Mayo dose.
assert.match(js, /r\.note/);
assert.match(js, /r\.maxDaily/);
assert.match(js, /r\.qaReason/);
assert.match(js, /r\.mayoUrl/);
assert.match(js, /mg\/kg → mL është e bllokuar/);
assert.doesNotMatch(js, /calculateDose|calculateMl|doseMgPerKg\s*\*/);

console.log('Antibiotics catalog-only presentation passed: old UI removed, filters above vertical list, mobile rules, clinical notes and blocked math.');
