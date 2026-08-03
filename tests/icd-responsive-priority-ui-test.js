const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('icd.html');
const tree = read('icd-tree.js');
const advanced = read('icd-advanced-search.js');
const detail = read('icd-detail-panel.js');
const polish = read('icd-tree-polish.css');
const comparison = read('icd-code-comparison.css');

for (const marker of ['icd-search-shortcut', 'icd-clinical-legend', 'data-urgency-level="direct"', 'data-urgency-level="urgent"', 'data-urgency-level="family-medicine"']) {
  assert.ok(html.includes(marker), `ICD page is missing ${marker}`);
}

for (const marker of ['primaryCareRole', 'managementSummary', 'urgencyLevel', 'isDirectUrgency', 'isUrgent', 'icd-clinical-badge', "setTimeout(() => loadSuggestions(q), 120)", "suggestionRequest?.abort()", 'icd-search-feedback is-loading', 'icd-search-feedback is-empty', 'icd-search-feedback is-error']) {
  assert.ok(tree.includes(marker), `ICD tree presentation/search contract is missing ${marker}`);
}

for (const marker of ['primaryCareRole', 'managementSummary', 'urgencyLevel', 'icd-clinical-badge', 'data-urgency-level']) {
  assert.ok(advanced.includes(marker), `Advanced suggestions are missing ${marker}`);
}

for (const marker of ['detailClinicalBadge', 'Roli në mjekësinë familjare', 'Menaxhimi i rekomanduar', 'primaryCareRole', 'managementSummary', 'urgencyLevel']) {
  assert.ok(detail.includes(marker), `ICD detail panel is missing ${marker}`);
}

assert.match(polish, /\.icd-suggestions\{[^}]*width:min\(720px,calc\(100vw - 32px\)\)/, 'Desktop suggestions need a useful responsive width.');
assert.match(polish, /\.icd-suggestion-advanced\{[^}]*grid-template-columns:minmax\(64px,auto\) minmax\(220px,1fr\) minmax\(118px,auto\)/, 'Desktop result titles need a stable copy column.');
assert.match(polish, /word-break:normal;overflow-wrap:break-word;white-space:normal/, 'Suggestion titles must not wrap one character per line.');
assert.match(polish, /@media\(max-width:390px\)/, 'ICD needs a narrow-phone layout.');
assert.match(polish, /@media\(max-width:620px\)[\s\S]*\.icd-suggestions\{position:fixed;left:10px;right:10px;/, 'Phone suggestions must remain inside the viewport.');
assert.match(polish, /\.icd-tree\[data-state="error"\][\s\S]*min-height:150px/, 'The main error state must remain compact.');
assert.doesNotMatch(`${polish}\n${comparison}`, /(?:linear|radial)-gradient/i, 'Active ICD polish must use solid surfaces.');
assert.equal((polish.match(/{/g) || []).length, (polish.match(/}/g) || []).length, 'ICD polish CSS braces are unbalanced.');

for (const file of ['icd-tree.js', 'icd-advanced-search.js', 'icd-detail-panel.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

console.log('ICD responsive search, compact states, clinical priority shading and detail presentation passed.');
