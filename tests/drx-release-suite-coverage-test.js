'use strict';

const assert=require('node:assert/strict');
const pkg=require('../package.json');

const release=pkg.scripts['test:drx-release'] || '';
const required=[
  "tests/drx-v3-candidate-status-parity-test.js",
  "tests/drx-dose-golden-cases-test.js",
  "tests/drx-dose-coverage-v2-test.js",
  "tests/drx-batch2-archive-verifier-test.js",
  "tests/drx-dose-source-archive-test.js",
  "tests/drx-batch2-extraction-pipeline-test.js",
  "tests/drx-batch2-normalization-first100-test.js",
  "tests/drx-master-plan-status-test.js",
  "tests/drx-dose-v3-supabase-candidate-test.js",
  "tests/drx-v3-candidate-structure-audit-test.js",
  "tests/drx-dose-v3-db-publication-gate-test.js",
  "tests/drx-dose-v3-postapply-smoke-contract-test.js",
  "tests/drx-dose-v3-publication-gate-smoke-contract-test.js",
  "tests/drx-dose-v3-rollback-contract-test.js",
  "tests/drx-dose-v3-persistence-envelope-test.js",
  "tests/drx-dose-runtime-engine-test.js",
  "tests/drx-dose-adjustment-engine-test.js",
  "tests/drx-production-release-readiness-test.js"
];

for(const file of required){
  assert.ok(release.includes('node '+file), file+' must be wired into test:drx-release');
}

assert.equal(new Set(required).size, required.length);
console.log('DRx release suite critical-test coverage passed.');
