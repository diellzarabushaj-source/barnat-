const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const columns = read('app-parts/part-01.txt');
const counters = read('app-parts/part-02.txt');
const render = read('app-parts/part-03.txt') + read('app-parts/part-04.txt');
const dosage = read('registry-dosage-columns-v2.js');
const mobileCss = read('first-page-clinical.css');
const readme = read('README.md');
const auth = read('auth-client.js');
const shell = read('tailadmin-shell-legacy.js');
const nameDisplay = read('name-display.js');
const dosagePage = read('dozologjia.js');
const prescriptionHtml = read('recetat.html');
const prescription = read('recetat.js');
const polish = read('app-polish.css');
const manifest = JSON.parse(read('manifest.webmanifest'));
const clinicalPages = [
  'index.html', 'klasifikimi.html', 'icd.html', 'analizat.html',
  'dozologjia.html', 'protokollet.html', 'recetat.html',
];

[
  /key:'Nr rendor'[\s\S]*?visible:false/,
  /key:'Emri tregtar'[\s\S]*?visible:true/,
  /key:'Substanca aktive'[\s\S]*?visible:true/,
  /key:'ATC Code'[\s\S]*?visible:true/,
  /key:'Fortësia'[\s\S]*?visible:true/,
  /key:'Forma farmaceutike'[\s\S]*?visible:true/,
  /key:'Statusi'[\s\S]*?visible:true/,
  /key:'Çmimi me pakicë'[\s\S]*?visible:false/,
].forEach(pattern => assert.match(columns, pattern, `Default registry columns missing ${pattern}`));

assert.match(counters, /if\(pc\) pc\.textContent = selected;/, 'The prescription CTA must show the current selection count');
assert.match(render, /data-label="Për recetë"/, 'Registry selection cells need a mobile label');
assert.match(render, /data-label="' \+ mobileLabel \+ '"/, 'Registry data cells need mobile labels');
assert.match(dosage, /return \{ adult:stored\.adult === true, pediatric:stored\.pediatric === true \};/, 'Dosage columns must be opt-in');
assert.match(dosage, /return \{ adult:false, pediatric:false \};/, 'Dosage columns must have a compact fallback');
assert.match(dosage, /cell\.dataset\.label = column\.label;/, 'Dosage cells need mobile labels');

[
  /#dataTable tbody tr\{[\s\S]*display:block!important/,
  /#dataTable tbody td::before\{[\s\S]*content:attr\(data-label\)/,
  /#dataTable tbody td\.select-col\{[\s\S]*min-height:44px!important/,
  /#dataTable\{[\s\S]*min-width:0!important/,
].forEach(pattern => assert.match(mobileCss, pattern, `Mobile registry card layout missing ${pattern}`));

[
  /## Nisja lokale/,
  /pnpm preview/,
  /## Si është organizuar/,
  /## API-të/,
  /## Offline dhe internet i dobët/,
  /pnpm test/,
].forEach(pattern => assert.match(readme, pattern, `README missing ${pattern}`));

clinicalPages.forEach(page => {
  assert.match(read(page), /<link rel="manifest" href="manifest\.webmanifest">/, `${page} needs a static PWA manifest link`);
});
assert.match(auth, /OFFLINE_RUNTIME_SRC = '\/offline-runtime-performance\.js\?v=low-bandwidth-v3'/, 'Every private page must start the same cache-isolated offline runtime');
assert.match(nameDisplay, /\[data-nav="classification"\],\[data-medical-nav="classification"\]/, 'Classification navigation must not be duplicated');
assert.match(shell, /class="mi-page-heading-title"/, 'The shell title must not create a second page H1');
assert.doesNotMatch(shell, /Burime të kontrolluara/, 'The shell must not claim every source is controlled');
assert.match(shell, /Të dhëna klinike/, 'The shell needs a neutral clinical-data label');
assert.match(dosagePage, /PA BURIM TË LIDHUR/, 'Dosage cards must expose missing provenance');
assert.match(dosagePage, /linkedSourceCount/, 'Dosage summary must be derived from linked sources');
assert.doesNotMatch(dosagePage, /E VERIFIKUAR|kartel(?:a|at) (?:e )?verifikuara|dataset-in e verifikuar/, 'Dosage UI must not show unconditional verification');
assert.doesNotMatch(read('tailadmin-shell-legacy.js'), /Skema të verifikuara/, 'Dosage page subtitle must stay source-neutral');
assert.ok(
  prescriptionHtml.indexOf('class="rx-primary" id="rxFormatLocal"') < prescriptionHtml.indexOf('id="rxGenerate"'),
  'Local prescription formatting must be the primary first action'
);
assert.match(prescription, /event\.preventDefault\(\);\s*formatLocally\(\);/, 'Ctrl/Cmd+Enter must remain local and offline-capable');
assert.match(prescription, /function syncAiAvailability\(\)/, 'AI action needs an explicit offline state');
assert.match(polish, /html:not\(\.auth-ready\) body\{[\s\S]*visibility:visible!important/, 'Authentication must not blank the entire body');
assert.match(auth, /id = 'miAuthBootstrap'|id='miAuthBootstrap'|authBootstrap\.id = 'miAuthBootstrap'/, 'Authentication needs an accessible visible bootstrap state');
assert.equal(manifest.theme_color, '#155f63');
assert.equal(manifest.background_color, '#f6f9f8');

['registry-dosage-columns-v2.js'].forEach(file => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
});

console.log('Compact, mobile-first and offline-readable UI audit passed.');
