'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const fullSuite = String(pkg.scripts?.test || '');
const testFiles = fullSuite.includes('scripts/run-test-suite.js')
  ? require('./test-suite.json')
  : [...fullSuite.matchAll(/node\s+(tests\/[^\s&]+\.js)/g)].map(match => match[1]);
assert.ok(testFiles.length > 100, 'The complete suite must include the active test inventory.');

const badCacheMocks = [];
const canonicalMocks = [];
for (const rel of testFiles) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');

  if (/require\.cache\s*\[[^\]]+\]\s*=/.test(source)) {
    if (/require\.resolve\([^\n]*neon-data-api\.js/.test(source)) badCacheMocks.push(rel);
    if (/require\.resolve\([^\n]*medindex-data-api\.js/.test(source)) canonicalMocks.push(rel);
  }
}

assert.deepEqual(
  badCacheMocks,
  [],
  'Tests that mock Data API must patch lib/medindex-data-api.js, never the legacy neon-data-api.js wrapper.'
);

for (const expected of [
  'tests/registry-cache-revision-test.js',
  'tests/pediatric-dosage-api-test.js',
]) {
  assert.ok(
    canonicalMocks.includes(expected),
    expected + ' must mock the canonical MedIndex Data API transport.'
  );
}

const legacyTransport = fs.readFileSync(path.join(ROOT, 'lib/neon-data-api.js'), 'utf8');
assert.match(
  legacyTransport,
  /module\.exports\s*=\s*require\('\.\/medindex-data-api\.js'\)/,
  'Legacy data transport must remain a compatibility wrapper.'
);

console.log('Unit-test Data API isolation contract passed.');
