const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const html = read('klasifikimi.html');
const classification = read('classification-v3.js');
const info = read('classification-info-v3.js');
const styles = read('classification-info-v3.css');

assert.doesNotMatch(html, /classification-info-v3\.(?:css|js)|classification-v3\.js|classification-data\.js/, 'The retired classification workspace must not load card or Info assets');
assert.match(html, /classification-redirect\.js\?v=table-only-v1/, 'The compatibility route must load only the table redirect runtime');

assert.match(classification, /class="atc-card-shell"/, 'Dormant legacy cards must retain a non-interactive shell until cleanup');
assert.match(classification, /class="atc-card-info"/, 'Dormant legacy cards must retain a dedicated Info button until cleanup');
assert.match(classification, /data-atc-info/, 'The legacy Info action marker is missing');
assert.match(classification, /window\.MedIndexClassification = Object\.freeze/, 'The retired module must keep an explicit navigation API until deletion');
assert.match(classification, /openGroup:code => openGroup/, 'The retired information dialog must not depend on simulated clicks');
assert.match(classification, /openSubgroup:\(code, query = ''\) => openSubgroup/, 'The retired information dialog must keep direct subgroup navigation');

assert.match(info, /event\.target\.closest\('\[data-atc-info\]'\)/, 'Only the explicit Info button may open the retired dialog');
assert.match(info, /event\.stopPropagation\(\)/, 'The Info button must not bubble into card navigation');
assert.doesNotMatch(info, /stopImmediatePropagation/, 'Info must not cancel unrelated application handlers');
assert.doesNotMatch(info, /infoBypassOnce/, 'The artificial click bypass state must stay removed');
assert.doesNotMatch(info, /card\.click\(\)/, 'The dialog must not simulate a card click');
assert.doesNotMatch(info, /installStyles|createElement\(['"]style['"]\)/, 'Dialog styles must remain in static CSS');
assert.match(info, /MedIndexClassification\?\.openGroup/, 'Continue must invoke the explicit group navigation API');
assert.match(info, /MedIndexClassification\?\.openSubgroup/, 'Continue must invoke the explicit subgroup navigation API');
assert.match(info, /activeTrigger/, 'Dialog close must restore focus to the Info button');
assert.match(info, /trapDialogFocus/, 'The modal must trap keyboard focus');
assert.match(info, /event\.key === 'Escape'/, 'Escape must close the dialog');

assert.match(styles, /\.atc-card-shell/, 'ATC card shell styles are missing');
assert.match(styles, /\.atc-card-info/, 'The explicit Info button is not styled');
assert.match(styles, /html\[data-theme="dark"\]/, 'Dark mode styles are missing');
assert.match(styles, /@media\(max-width:650px\)/, 'Mobile dialog styles are missing');
assert.match(styles, /min-width:44px/, 'The mobile Info action must satisfy touch-target sizing');
assert.match(styles, /prefers-reduced-motion:reduce/, 'Reduced-motion behavior is missing');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'classification-v3.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'classification-info-v3.js')], { stdio:'pipe' });

console.log('Legacy classification card and Info assets are no longer loaded by the table-only route.');
