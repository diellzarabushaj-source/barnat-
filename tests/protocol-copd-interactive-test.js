const assert = require('node:assert/strict');
const fs = require('node:fs');
const manifest = require('../data/protocols.json');
const data = require('../data/protocol-elaborations-copd.json');

const html = fs.readFileSync(require.resolve('../protokollet.html'), 'utf8');
const runtime = fs.readFileSync(require.resolve('../protocol-interactive-copd.js'), 'utf8');

assert.equal(data.schemaVersion, 1);
assert.deepEqual(data.entries.map(entry => entry.protocolId), ['upk-05', 'upk-06', 'upk-07']);

for (const entry of data.entries) {
  const documentRecord = manifest.documents.find(document => document.id === entry.protocolId);
  assert.ok(documentRecord, `missing manifest document ${entry.protocolId}`);
  assert.equal(entry.sourceHash, documentRecord.contentSha256, `${entry.protocolId} must be bound to the current official source hash`);
  assert.equal(entry.reviewStatus, 'review', `${entry.protocolId} must remain in clinical review`);
  assert.ok(Array.isArray(entry.primaryCare?.todayActions) && entry.primaryCare.todayActions.length >= 4, `${entry.protocolId} needs practical visit actions`);
  assert.ok(Array.isArray(entry.primaryCare?.quickChecks) && entry.primaryCare.quickChecks.length >= 4, `${entry.protocolId} needs interactive safety checks`);
  assert.ok(Array.isArray(entry.primaryCare?.sections) && entry.primaryCare.sections.length >= 3, `${entry.protocolId} needs source-cited clinical sections`);
  assert.ok(Array.isArray(entry.primaryCare?.referral?.urgent) && entry.primaryCare.referral.urgent.length > 0, `${entry.protocolId} needs escalation criteria`);
}

const pharmacology = data.entries.find(entry => entry.protocolId === 'upk-05');
assert.match(JSON.stringify(pharmacology), /LABA\+LAMA/);
assert.match(JSON.stringify(pharmacology), /30–40 mg/);
assert.match(JSON.stringify(pharmacology), /88–92%/);

const management = data.entries.find(entry => entry.protocolId === 'upk-06');
assert.match(JSON.stringify(management), /SpO₂ <92%/);
assert.match(JSON.stringify(management), /brenda një muaji/);
assert.match(JSON.stringify(management), /3 muaj/);

const diagnosis = data.entries.find(entry => entry.protocolId === 'upk-07');
assert.match(JSON.stringify(diagnosis), /CAT/);
assert.match(JSON.stringify(diagnosis), /mMRC/);
assert.match(JSON.stringify(diagnosis), /alfa-1 antitripsinës/i);

assert.match(html, /protocol-interactive-copd\.js\?v=/, 'COPD interactive runtime must be loaded');
assert.match(runtime, /sourceHash !== currentHash/, 'runtime must fail closed when the official source hash changes');
assert.match(runtime, /MedIndex.*nuk vendos diagnozë/, 'interactive checks must not claim automated diagnosis');
assert.match(runtime, /SUPPORTED = new Set\(\['upk-05', 'upk-06', 'upk-07'\]\)/, 'runtime must stay scoped to the audited COPD protocols');

console.log('Interactive COPD protocol tests passed.');
