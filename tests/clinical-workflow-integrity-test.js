const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const bridge = read('prescription-bridge.js');
const detail = read('icd-detail-panel.js');
const protocols = read('protokollet.js');
const rxHtml = read('recetat.html');

execFileSync(process.execPath, ['--check', path.join(root, 'prescription-bridge.js')]);
execFileSync(process.execPath, ['--check', path.join(root, 'icd-detail-panel.js')]);
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

assert.match(detail, /CONTEXT_VERSION = 2/, 'ICD diagnosis transfer must use a versioned structured payload');
assert.match(detail, /translationStatus/, 'ICD detail transfer must preserve terminology status');
assert.match(detail, /sourceUrl:safeHttpsUrl/, 'ICD detail transfer must normalize WHO provenance');
assert.match(detail, /selectedAt:Date\.now\(\)/, 'ICD detail transfer must include selection time');
assert.match(bridge, /CONTEXT_MAX_AGE = 30 \* 60 \* 1000/, 'pending ICD context must expire');
assert.match(bridge, /PRESCRIBABLE_LEVELS = new Set\(\['category', 'subcategory'\]\)/, 'only diagnostic ICD levels may transfer');
assert.match(bridge, /url\.hostname === 'icd\.who\.int'/, 'ICD provenance must be restricted to the WHO host');
assert.match(bridge, /existing && existing !== context\.display && !force/, 'existing diagnosis must not be overwritten without confirmation');
assert.match(bridge, /candidate\.diagnosisCoding = serializableContext/, 'saved prescriptions must retain ICD coding provenance');
assert.match(bridge, /delete candidate\.diagnosisCoding/, 'stale ICD coding must be removed after manual changes');
assert.match(bridge, /restoreSavedContext/, 'saved ICD coding must restore when a prescription is opened');

assert.match(protocols, /safeHttpsUrl/, 'protocol source URLs must be HTTPS-only');
assert.match(protocols, /normalizeManifest/, 'protocol manifest must be normalized before render');
assert.match(protocols, /seenIds\.has\(id\)/, 'duplicate protocol document ids must be rejected');
assert.match(protocols, /\['pdf', 'docx', 'html', 'txt'\]/, 'protocol document types must be allowlisted');
assert.match(protocols, /contentSha256.*\{64\}/s, 'mirrored protocol documents must validate SHA-256');
assert.match(protocols, /protocolRetry/, 'protocol manifest failures must offer an explicit retry');
assert.match(protocols, /officialUrl:safeHttpsUrl\(document\?\.officialUrl\)/, 'official protocol URLs must be normalized through the HTTPS allowlist');
assert.match(protocols, /document\.officialUrl\s*\?\s*`<a href="\$\{esc\(document\.officialUrl\)\}"/, 'only the normalized protocol URL may be rendered');

console.log('Clinical cross-page workflow integrity and structured ICD provenance audit passed.');
