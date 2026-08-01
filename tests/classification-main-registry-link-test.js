const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const html = read('klasifikimi.html');
const classification = read('classification-v3.js');

assert.doesNotMatch(classification, /function drugTable\s*\(/, 'Classification must not own a second medicines table renderer');
assert.doesNotMatch(classification, /drugTableBody['"]\)\.innerHTML|<tr class="registry-quality-/, 'Classification must not render medicine table rows');
assert.doesNotMatch(html, /<table[^>]+class="atc-table"|id="drugTableBody"/, 'The obsolete classification medicines table must not remain in the DOM');
assert.match(html, /id="drugResults" hidden aria-hidden="true"><\/section>/, 'Only a harmless hidden compatibility anchor may remain during rollout');
assert.match(classification, /function openSubgroup\(code, query = ''\)/, 'Subgroup navigation entry point is missing');
assert.match(classification, /location\.href = registryUrl\(category, query\)/, 'Subgroups must open the main registry table');
assert.match(classification, /MedIndexATC\?\.registryUrl/, 'Classification must use the shared ATC URL contract');
assert.match(classification, /openSubgroup\(card\.dataset\.code, state\.query\)/, 'Search context must be preserved when opening a category');
assert.match(classification, /matchingRows\.map\(subgroupCode\)/, 'Drug search must derive matching ATC categories without rendering a local table');
assert.match(classification, /Hap te Barnat/, 'Subgroup cards must clearly state that they open the main registry');
assert.match(classification, /Kërko te Barnat/, 'Ambiguous searches need a safe route to the main registry');
assert.match(classification, /revealSubgroup\(hash\)/, 'Returning from the registry must reveal the category instead of redirecting immediately');
assert.match(classification, /openGroup\(group, \{ updateHistory:false, focusCode:category \}\)/, 'The return link must open the parent group and focus the active category');
assert.match(classification, /#drugResults['"]\)\.hidden = true/, 'The compatibility anchor must remain hidden');

const openSubgroupStart = classification.indexOf('function openSubgroup');
const renderSearchStart = classification.indexOf('function renderSearch');
const section = classification.slice(openSubgroupStart, renderSearchStart);
assert.doesNotMatch(section, /innerHTML|createElement\(['"]table['"]\)/, 'Opening a subgroup must only navigate, never render another table');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'classification-v3.js')], { stdio:'pipe' });

console.log('Classification cards now use only the main registry table.');