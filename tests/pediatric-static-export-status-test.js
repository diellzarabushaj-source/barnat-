'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'scripts/export-pediatric-master-static.js'),
  'utf8',
);

assert.match(source, /const EXPECTED_VERIFIED = 3386;/);
assert.match(source, /const EXPECTED_IN_REVIEW = 124;/);
assert.match(source, /const EXPECTED_NEEDS_SOURCE = 2;/);
assert.match(source, /status === 'needs_source'/,
  'Static pediatric export must accept the official fail-closed needs_source state.');
assert.match(source, /needsSource !== EXPECTED_NEEDS_SOURCE/,
  'Static pediatric export must verify the needs_source count, not silently ignore it.');
assert.doesNotMatch(source, /else throw new Error\(`Unexpected verification status '\$\{status\}'/,
  'This assertion only guards against the old two-state branch pattern.');

console.log('Pediatric static export status contract passed: verified, in_review and needs_source are all first-class gated states.');
