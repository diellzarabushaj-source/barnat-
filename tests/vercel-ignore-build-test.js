'use strict';

const assert = require('node:assert/strict');
const Gate = require('../scripts/vercel-ignore-build.js');

assert.equal(Gate.shouldIgnoreBuild(['supabase/migration-history.json']), true);
assert.equal(Gate.shouldIgnoreBuild(['.github/workflows/medindex-validation.yml','tests/fullstack-audit-v8-test.js']), true);
assert.equal(Gate.shouldIgnoreBuild(['tests/a.js','supabase/migration-history.json']), true);

assert.equal(Gate.shouldIgnoreBuild([]), false, 'unknown diff must fail safe and continue the build');
assert.equal(Gate.shouldIgnoreBuild(['vercel.json']), false);
assert.equal(Gate.shouldIgnoreBuild(['package.json']), false);
assert.equal(Gate.shouldIgnoreBuild(['medical-hub-v2.css']), false);
assert.equal(Gate.shouldIgnoreBuild(['api/dosage.js']), false);
assert.equal(Gate.shouldIgnoreBuild(['supabase/migrations/20260901000724_rollback_phase10_to_shadow_after_indication_gate.sql']), false);
assert.equal(Gate.shouldIgnoreBuild(['tests/a.js','api/auth.js']), false);

console.log('Vercel ignored-build gate passed: CI-only changes skip, runtime-impacting changes deploy.');
