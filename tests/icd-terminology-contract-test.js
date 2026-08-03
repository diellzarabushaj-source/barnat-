'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('icd.html');
const ui = read('icd-tree.js');
const css = read('icd-tree.css');
const terminologyBase = read('lib/icd-sq-terminology.js');
const terminology = read('lib/icd-sq-terminology-v2.js');
const hierarchy = read('lib/icd-full-hierarchy.js');
const packages = {
  IV:JSON.parse(read('lib/icd-sq-terms-iv.json')),
  X:JSON.parse(read('lib/icd-sq-terms-x.json')),
  XI:JSON.parse(read('lib/icd-sq-terms-xi.json')),
  XIII:JSON.parse(read('lib/icd-sq-terms-xiii.json')),
  XIV:JSON.parse(read('lib/icd-sq-terms-xiv.json')),
  XVIII:JSON.parse(read('lib/icd-sq-terms-xviii.json')),
};

for (const asset of ['icd-tree.css?v=icd-tree-v1','icd-tree.js?v=icd-tree-v2']) {
  assert.ok(html.includes(asset), `ICD terminology tree missing ${asset}`);
}
for (const marker of ['translationStatus','is-standardized','is-verified','I standardizuar','I verifikuar','Vetëm anglisht','Draft']) {
  assert.ok(ui.includes(marker), `ICD tree terminology UI missing ${marker}`);
}
for (const marker of ['.icd-tree-translation.is-standardized','.icd-tree-translation.is-verified','.icd-tree-translation.is-draft','.icd-tree-translation.is-missing','html[data-theme="dark"]']) {
  assert.ok(css.includes(marker), `ICD tree terminology CSS missing ${marker}`);
}

for (const marker of [
  "TERMINOLOGY_VERSION = 'sq-terminology-2026.3'",
  "PILOT_CHAPTERS = Object.freeze(['IV', 'IX', 'X', 'XI', 'XIII', 'XIV', 'XVIII'])",
  "require('./icd-sq-terms-iv.json')", "require('./icd-sq-terms-xi.json')",
  "require('./icd-sq-terms-xiii.json')", "require('./icd-sq-terms-xiv.json')",
  'medindex-editorial-pilot-iv','medindex-editorial-pilot-xi','medindex-editorial-pilot-xiii','medindex-editorial-pilot-xiv',
  'standardizedByChapter','publicationReady','terminologyAliases',
]) assert.ok(terminology.includes(marker), `Expanded terminology module missing ${marker}`);

assert.ok(terminologyBase.includes("TERMINOLOGY_VERSION = 'sq-terminology-2026.1'"));
assert.ok(Object.keys(packages.IV).length >= 90);
assert.ok(Object.keys(packages.X).length >= 110);
assert.ok(Object.keys(packages.XI).length >= 100);
assert.ok(Object.keys(packages.XIII).length >= 115);
assert.ok(Object.keys(packages.XIV).length >= 115);
assert.ok(Object.keys(packages.XVIII).length >= 200);
assert.equal(packages.IV.E11.aliases.includes('diabet tip 2'), true);
assert.equal(packages.XI['K76.0'].title, 'Steatoza hepatike, e paklasifikuar diku tjetër');
assert.equal(packages.XIII['M54.5'].title, 'Dhimbja e mesit');
assert.equal(packages.XIV['N39.0'].aliases.includes('infeksion urinar'), true);
assert.equal(packages.XIV.N63.title, 'Masë e paspecifikuar në gji');
assert.equal(packages.XVIII['R30.0'].aliases.includes('djegie gjatë urinimit'), true);

for (const marker of ["require('./icd-sq-terminology-v2.js')",'.map(Terminology.applyNode)','quality:Terminology.quality(nodes)','pilotChapters:Terminology.PILOT_CHAPTERS']) {
  assert.ok(hierarchy.includes(marker), `Full ICD hierarchy missing ${marker}`);
}
assert.doesNotMatch(terminology, /translationStatus\s*:\s*['"]verified['"]/, 'Phase 7 must not claim professional verification.');
assert.doesNotMatch(ui, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(css, /https?:\/\//);
new Function(ui); new Function(terminologyBase); new Function(terminology); new Function(hierarchy);
console.log('ICD terminology 2026.3 packages, tree badges and non-verification contract passed.');
