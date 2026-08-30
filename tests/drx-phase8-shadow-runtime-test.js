'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Shadow = require('../lib/dose-v3-shadow.js');

assert.equal(Shadow.shadowEnabled({ DRX_DOSE_V3_SHADOW:'1' }),true);
assert.equal(Shadow.shadowEnabled({ DRX_DOSE_V3_SHADOW:'false' }),false);
assert.match(Shadow.selectorHash({ column:'drug_id',value:'abc' }),/^[0-9a-f]{64}$/);

const baseRule = {
  ruleKey:'r1',indicationKey:'i1',patientGroup:'adult_only',
  calculationMethod:'fixed_dose',doseMinValue:5,doseMaxValue:5,doseUnit:'mg',
  frequencyMode:'times_per_day',timesPerDay:2,route:'PO',prn:false,
  specialistOnly:false,outOfRangeAction:'block'
};
const v2 = {
  schemaVersion:'dose-product-fast-path-v1',
  product:{
    productKey:'p1',drugId:'00000000-0000-0000-0000-000000000001',
    registryNumber:123,pdid:'PD1',patientGroup:'adult_only',
    pharmaceuticalForm:'tablet',route:'PO',numeratorValue:5,numeratorUnit:'mg',
    denominatorValue:1,denominatorUnit:'tablet',rules:[baseRule]
  }
};
const v3Equivalent = {
  schemaVersion:'dose-product-fast-path-v3',
  product:{
    ...v2.product,
    registryNumber:'123',
    rules:[{ ...baseRule,doseMinValue:'5',doseMaxValue:'5',timesPerDay:'2' }]
  }
};

const match = Shadow.comparePayloads(v2,v3Equivalent);
assert.equal(match.status,'MATCH');
assert.deepEqual(match.diffCodes,[]);
assert.equal(match.v2Hash,match.v3Hash);

const changed = JSON.parse(JSON.stringify(v3Equivalent));
changed.product.rules[0].doseMaxValue=10;
const diff = Shadow.comparePayloads(v2,changed);
assert.equal(diff.status,'DIFF');
assert.ok(diff.diffCodes.includes('RULE_SEMANTICS'));

assert.equal(Shadow.comparePayloads(v2,null).status,'V2_ONLY');

assert.deepEqual(
  Shadow.v3Selector({ column:'registry_number',value:'123' },v2),
  { column:'drug_id',value:'00000000-0000-0000-0000-000000000001',publicKey:'00000000-0000-0000-0000-000000000001' }
);

const migration = fs.readFileSync(
  'supabase/migrations/20260830163000_drx_phase8_shadow_read_model_parity_core.sql','utf8'
);
const handler = fs.readFileSync('lib/dose-product-fast-path-handler.js','utf8');
const workflow = fs.readFileSync('.github/workflows/drx-phase8-shadow-gate.yml','utf8');
const rollback = fs.readFileSync('docs/DRX-PHASE8-ROLLBACK.md','utf8');

assert.match(migration,/published_product_read_model_v1/);
assert.match(migration,/drx_dose_search_v3_shadow_v1/);
assert.match(migration,/shadow_comparisons_v1/);
assert.match(migration,/drx_record_dose_shadow_comparison_v1/);
assert.match(migration,/clinical payload content is not persisted/i);
assert.match(migration,/v3_cutover_enabled',false/);
assert.match(migration,/publication_allowed',false/);
assert.doesNotMatch(migration,/grant execute on function public\.drx_phase8_status_v1\(\) to authenticated/i);

assert.match(handler,/runtime:'v2-shadow'/);
assert.match(handler,/X-DRx-Dose-Shadow/);
assert.match(handler,/Shadow\.comparePayloads/);
assert.match(handler,/Shadow\.record/);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/drx-phase8-status-evidence/);
assert.match(rollback,/V2/i);
assert.match(rollback,/do not drop/i);

console.log('DRx Phase 8 shadow runtime contract: PASS');
