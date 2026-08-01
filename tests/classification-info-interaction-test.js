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

assert.equal((html.match(/classification-info-v3\.css/g) || []).length, 1, 'Static ATC info CSS must load exactly once');
assert.ok(html.indexOf('classification-info-v3.css') < html.indexOf('tailadmin-professional.css'), 'Professional TailAdmin CSS must remain the final static stylesheet');
assert.match(classification, /class="atc-card-shell"/, 'Each ATC card needs a non-interactive shell');
assert.match(classification, /class="atc-card-info"/, 'Each ATC card needs a dedicated Info button');
assert.match(classification, /data-atc-info/, 'The dedicated Info action marker is missing');
assert.match(classification, /window\.MedIndexClassification = Object\.freeze/, 'The classification page needs an explicit navigation API');
assert.match(classification, /openGroup:code => openGroup/, 'The information dialog must be able to open a group without simulating a click');
assert.match(classification, /openSubgroup:\(code, query = ''\) => openSubgroup/, 'The information dialog must be able to open a subgroup directly');

assert.match(info, /event\.target\.closest\('\[data-atc-info\]'\)/, 'Only the explicit Info button may open the dialog');
assert.match(info, /event\.stopPropagation\(\)/, 'The Info button must not bubble into the card navigation action');
assert.doesNotMatch(info, /stopImmediatePropagation/, 'Info must not cancel unrelated card or application handlers');
assert.doesNotMatch(info, /infoBypassOnce/, 'The artificial click bypass state must be removed');
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

console.log('ATC card navigation and Info actions are explicitly separated.');