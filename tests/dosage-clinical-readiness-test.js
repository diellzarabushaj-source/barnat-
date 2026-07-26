const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dozologjia.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'dozologjia-deep-audit.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dozologjia-clinical-readiness.css'), 'utf8');

assert.match(html, /dozologjia-deep-audit\.js/);
assert.doesNotMatch(html, /dozologjia-(?:safety-enhancements|clinical-readiness)\.js/, 'legacy observer layers must not run alongside the consolidated controller');
assert.match(html, /dozologjia-clinical-readiness\.css/);
assert.ok(html.indexOf('dozologjia-deep-audit.js') < html.indexOf('dozologjia.js'), 'deduper must load before the core dosage page');
assert.doesNotMatch(html, /<script>\s*\(\(\)=>/, 'dosage page must not rely on an inline style runtime');
assert.match(js, /Vetëm me kalkulator/);
assert.match(js, /Gjurmueshmëria e skemës/);
assert.match(js, /E gatshme për rishikim/);
assert.match(js, /Nuk është publikuar në dataset/);
assert.match(js, /Kjo nuk do të thotë se bari është i kundërindikuar/);
assert.match(js, /sourceDate/);
assert.match(js, /sourceUrl/);
assert.match(js, /hasStructuredRule/);
assert.match(js, /installDosageFetchDeduper/);
assert.match(js, /window\.__medindexDosageFetchDeduped/);
assert.match(js, /response\.clone\(\)/, 'shared dosage responses must be cloned for independent consumers');
assert.match(js, /population === 'pediatric' \? card\.pediatricRoute : card\.adultRoute/, 'matching must use the population-specific route');
assert.match(js, /observe\(list, \{ childList:true \}\)/, 'list observer must only watch direct render replacement');
assert.doesNotMatch(js, /subtree\s*:\s*true/, 'enhancement must not observe its own descendant mutations');
assert.equal((js.match(/fetch\('\/api\/dosage'/g) || []).length, 1, 'deep-audit controller must request dosage payload only once');
assert.doesNotMatch(js, /fetch\([^)]*method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i, 'deep-audit enhancement must be read-only');
assert.match(css, /content-visibility:auto/);
assert.match(css, /dosage-readiness/);
assert.match(css, /dosage-regimen-provenance/);

console.log('Dosage clinical readiness audit passed.');
