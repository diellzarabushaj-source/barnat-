const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const bridge = read('prescription-bridge.js');
const protocols = read('protokollet.js');
const rxHtml = read('recetat.html');

execFileSync(process.execPath, ['--check', path.join(root, 'prescription-bridge.js')]);
execFileSync(process.execPath, ['--check', path.join(root, 'protokollet.js')]);

assert.ok(rxHtml.indexOf('prescription-bridge.js') < rxHtml.indexOf('recetat.js'), 'prescription bridge must run before the prescription composer');
assert.match(bridge, /MAX_SELECTION_ITEMS = 50/, 'cross-page selection must be bounded');
assert.match(bridge, /MAX_DRAFT_CHARS = 20000/, 'local prescription draft must be bounded');
assert.match(bridge, /dosageStatus:.*requires-review/s, 'transferred drugs must require clinical review');
assert.match(bridge, /transferred-for-clinical-review/, 'transferred drugs must retain provenance status');
assert.match(bridge, /seen\.has\(item\.key\)/, 'transferred drug selection must be deduplicated');
assert.match(bridge, /newest\.dosageReviewed = false/, 'duplicated prescriptions must reset dosage review');
assert.match(bridge, /newest\.generatedSignatureReviewed = false/, 'duplicated prescriptions must reset AI review');
assert.match(bridge, /savedAt > Date\.now\(\) \+ 5 \* 60 \* 1000/, 'future-dated drafts must be rejected');

assert.match(protocols, /safeHttpsUrl/, 'protocol source URLs must be HTTPS-only');
assert.match(protocols, /normalizeManifest/, 'protocol manifest must be normalized before render');
assert.match(protocols, /seenIds\.has\(id\)/, 'duplicate protocol document ids must be rejected');
assert.match(protocols, /\['pdf', 'docx', 'html', 'txt'\]/, 'protocol document types must be allowlisted');
assert.match(protocols, /contentSha256.*\{64\}/s, 'mirrored protocol documents must validate SHA-256');
assert.match(protocols, /protocolRetry/, 'protocol manifest failures must offer an explicit retry');
assert.doesNotMatch(protocols, /href="\$\{esc\(document\.officialUrl\)\}"(?![\s\S]*safeHttpsUrl)/, 'unvalidated protocol URLs must not be rendered');

console.log('Clinical cross-page workflow integrity audit passed.');
