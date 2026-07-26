const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dozologjia.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'dozologjia-clinical-readiness.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dozologjia-clinical-readiness.css'), 'utf8');

assert.match(html, /dozologjia-clinical-readiness\.js/);
assert.match(html, /dozologjia-clinical-readiness\.css/);
assert.match(js, /Vetëm me kalkulator/);
assert.match(js, /Gjurmueshmëria e skemës/);
assert.match(js, /E gatshme për rishikim/);
assert.match(js, /Nuk është publikuar në dataset/);
assert.match(js, /Kjo nuk do të thotë se bari është i kundërindikuar/);
assert.match(js, /sourceDate/);
assert.match(js, /sourceUrl/);
assert.match(js, /hasStructuredRule/);
assert.doesNotMatch(js, /fetch\([^)]*method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i, 'readiness enhancement must be read-only');
assert.match(css, /content-visibility:auto/);
assert.match(css, /dosage-readiness/);
assert.match(css, /dosage-regimen-provenance/);

console.log('Dosage clinical readiness audit passed.');
