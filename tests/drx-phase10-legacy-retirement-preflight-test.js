'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('scripts/drx-phase10-legacy-retirement-preflight.js','utf8');
const workflow=fs.readFileSync('.github/workflows/drx-phase10-cutover-gate.yml','utf8');

for(const relation of [
  'dose_products_v2','dose_rules_v2','dose_rule_products_v2','dose_safety_v2',
  'dose_products_v3','dose_rules_v3','dose_rule_products_v3'
]) assert.ok(source.includes(relation),relation+' missing from retirement preflight');

for(const consumer of [
  'lib/dose-calculator-handler.js',
  'lib/dose-product-fast-path-handler.js',
  'lib/dose-safety-handler.js'
]) assert.ok(source.includes(consumer),consumer+' missing from known consumer gate');

assert.match(source,/exactBoundProductParity/);
assert.match(source,/ruleCountParity/);
assert.match(source,/bindingCountParity/);
assert.match(source,/assert\.equal\(v2Safety\.length,0/);
assert.match(source,/status\.restoreTestEvidencePass===true/);
assert.match(source,/status\.effectiveParityCurrent===true/);
assert.match(source,/status\.legacyWritesZeroEvidencePass===true/);
assert.match(source,/status\.soak14DaysPass===true/);
assert.match(source,/status\.finalGatePass===true/);
assert.match(source,/status\.mode==='STRICT'/);
assert.match(source,/status\.strictArmed===true/);
assert.match(source,/retirementAllowedNow/);
assert.match(workflow,/Phase 10L legacy retirement preflight contract/);
assert.match(workflow,/Live Phase 10 legacy retirement preflight/);
assert.match(workflow,/drx-phase10-legacy-retirement-preflight\.json/);

console.log('DRx Phase 10L legacy retirement preflight contract: PASS');
