'use strict';

const assert = require('node:assert/strict');
const Gate = require('../scripts/vercel-ignore-build.js');

assert.equal(Gate.hasExplicitSkip('docs only [skip-deploy]'), true);
assert.equal(Gate.hasExplicitSkip('docs only [skip deploy]'), true);
assert.equal(Gate.hasExplicitSkip('normal runtime commit'), false);

// Metadata-only commits must NOT be skipped implicitly. A previous runtime
// commit in the same push may still be undeployed.
assert.equal(Gate.shouldIgnoreBuild(['supabase/migration-history.json']), false);
assert.equal(Gate.shouldIgnoreBuild(['.github/workflows/medindex-validation.yml','tests/fullstack-audit-v8-test.js']), false);
assert.equal(Gate.shouldIgnoreBuild(['tests/a.js','supabase/migration-history.json']), false);

// Explicit skip is allowed only when every changed path is non-runtime.
assert.equal(Gate.shouldIgnoreBuild(['supabase/migration-history.json'], { explicitSkip:true }), true);
assert.equal(Gate.shouldIgnoreBuild(['.github/workflows/a.yml','tests/a.js'], { explicitSkip:true }), true);
assert.equal(Gate.shouldIgnoreBuild(['tests/a.js','api/auth.js'], { explicitSkip:true }), false);

assert.equal(Gate.shouldIgnoreBuild([], { explicitSkip:true }), false, 'unknown diff must fail safe and continue the build');
assert.equal(Gate.shouldIgnoreBuild(['vercel.json'], { explicitSkip:true }), false);
assert.equal(Gate.shouldIgnoreBuild(['package.json'], { explicitSkip:true }), false);
assert.equal(Gate.shouldIgnoreBuild(['medical-hub-v2.css'], { explicitSkip:true }), false);
assert.equal(Gate.shouldIgnoreBuild(['api/dosage.js'], { explicitSkip:true }), false);
assert.equal(Gate.shouldIgnoreBuild(['supabase/migrations/20260901000724_rollback_phase10_to_shadow_after_indication_gate.sql'], { explicitSkip:true }), false);

console.log('Vercel ignored-build gate passed: skipping is explicit-only and runtime changes fail safe.');
