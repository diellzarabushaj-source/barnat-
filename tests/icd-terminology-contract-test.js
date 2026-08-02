'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('icd.html');
const ui = read('icd-terminology-ui.js');
const css = read('icd-terminology.css');
const terminology = read('lib/icd-sq-terminology.js');
const hierarchy = read('lib/icd-full-hierarchy.js');

for (const asset of [
  'icd-terminology.css?v=sq-terminology-v1',
  'icd-terminology-ui.js?v=sq-terminology-ui-v1',
]) assert.ok(html.includes(asset), `ICD terminology workspace missing ${asset}`);

assert.ok(
  html.indexOf('icd-terminology.css?v=sq-terminology-v1') < html.indexOf('tailadmin-professional.css'),
  'TailAdmin professional stylesheet must remain the final static stylesheet.',
);
assert.ok(
  html.indexOf('icd-full-table.js?v=icd-full-table-v1') < html.indexOf('icd-terminology-ui.js?v=sq-terminology-ui-v1'),
  'Terminology UI must enhance the rendered ICD table, not compete with its controller.',
);

for (const marker of [
  'machine-draft', 'standardized', 'verified', 'Term i standardizuar',
  'medindex:icd-state', 'medindex:icd-terminology-rendered', 'terminologyCoverage',
]) assert.ok(ui.includes(marker), `Terminology UI missing ${marker}`);

for (const marker of [
  '.is-standardized', '.is-verified', '[data-terminology-stat="standardized"]',
  'html[data-theme="dark"]',
]) assert.ok(css.includes(marker), `Terminology CSS missing ${marker}`);

for (const marker of [
  "TERMINOLOGY_VERSION = 'sq-terminology-2026.1'", "PILOT_CHAPTER = 'IX'",
  'CHAPTER_TERMS', 'CODE_TERMS', 'applyNode', 'lintTitle', 'quality',
  'machineDraftTitle', 'terminologyAliases', 'publicationReady',
]) assert.ok(terminology.includes(marker), `Terminology module missing ${marker}`);

for (const marker of [
  "require('./icd-sq-terminology.js')", '.map(Terminology.applyNode)',
  'quality:Terminology.quality(nodes)', 'pilotChapter:Terminology.PILOT_CHAPTER',
]) assert.ok(hierarchy.includes(marker), `Full ICD hierarchy missing terminology integration ${marker}`);

assert.doesNotMatch(ui, /eval\s*\(|new Function\s*\(/, 'Terminology UI must not use dynamic code.');
assert.doesNotMatch(css, /https?:\/\//, 'Terminology CSS must remain local-only.');
assert.doesNotMatch(terminology, /translationStatus:'verified'/, 'Phase 4 must not claim professional verification without an explicit verified source.');

new Function(ui);
new Function(terminology);
new Function(hierarchy);

console.log('ICD terminology layer, review states, UI wiring and non-verification contract passed.');
