const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'registry-dosage-columns.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'registry-dosage-columns.css'), 'utf8');

assert.match(index, /dosage-engine\.js/);
assert.match(index, /registry-dosage-columns\.js/);
assert.match(index, /registry-dosage-columns\.css/);
assert.match(script, /1\. Dozimi për të rritur/);
assert.match(script, /2\. Dozimi për fëmijë/);
assert.match(script, /Doza e plotë/);
assert.match(script, /Rruga/);
assert.match(script, /MedIndexDosageEngine/);
assert.match(script, /\/api\/dosage/);
assert.match(script, /Nuk ka dozë pediatrike të verifikuar/);
assert.doesNotMatch(script, /update|delete|patch/i, 'dosage columns must not mutate the official registry source');
assert.match(css, /hide-registry-dosage-adult/);
assert.match(css, /hide-registry-dosage-pediatric/);

console.log('Registry dosage columns test passed.');