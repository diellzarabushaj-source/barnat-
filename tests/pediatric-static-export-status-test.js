'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'scripts/export-pediatric-master-static.js'),
  'utf8',
);

assert.match(source, /const EXPORT_OPT_IN = 'MEDINDEX_PEDIATRIC_STATIC_EXPORT';/,
  'Temporary pediatric static export must require an explicit release opt-in.');
assert.match(source, /process\.env\[EXPORT_OPT_IN\] !== '1'/,
  'Normal preview/production builds must not implicitly execute an incomplete pediatric master export.');
assert.ok(
  source.indexOf("process.env[EXPORT_OPT_IN] !== '1'") < source.indexOf('for (let start = MIN_REGISTRY'),
  'The explicit opt-in gate must run before any pediatric master rows are exported.',
);

assert.match(source, /const EXPECTED_VERIFIED = 3393;/);
assert.match(source, /const EXPECTED_IN_REVIEW = 1;/);
assert.match(source, /const EXPECTED_NEEDS_SOURCE = 118;/);
assert.match(source, /pediatric_primary_regimen_id/,
  'Explicit pediatric export must keep the per-registry regimen identity gate.');
assert.match(source, /Regimen mismatch for registry/,
  'Explicit pediatric export must still fail closed on regimen identity mismatch.');
assert.match(source, /status === 'needs_source'/,
  'Static pediatric export must accept the official fail-closed needs_source state.');
assert.match(source, /needsSource !== EXPECTED_NEEDS_SOURCE/,
  'Static pediatric export must verify the needs_source count, not silently ignore it.');
assert.ok(
  source.indexOf("status === 'needs_source'") < source.indexOf('Unexpected verification status'),
  'needs_source must be handled before the unknown-status fail-closed branch.',
);
assert.match(source, /Unexpected verification status/,
  'Truly unknown verification states must still fail the export closed.');

console.log('Pediatric static export gate passed: normal builds skip the temporary bridge; explicit exports retain strict regimen and verification fail-closed checks.');
