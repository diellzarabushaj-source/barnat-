'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const migration=fs.readFileSync('supabase/migrations/20260830220957_drx_phase9d_product_context.sql','utf8');
const rollback=fs.readFileSync('supabase/drx-phase9d-product-context-rollback.sql','utf8');
const handler=fs.readFileSync('lib/pediatric-dosage-handler-core.js','utf8');
const ui=fs.readFileSync('dozologjia-v2.js','utf8');
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/drx_phase9_product_context_v1/);
assert.match(migration,/security definer/i);
assert.match(migration,/revoke all on function public\.drx_phase9_product_context_v1\(uuid\)[\s\S]*from public,anon,authenticated/i);
assert.match(migration,/grant execute[\s\S]*to service_role/i);
assert.match(migration,/clinicalVariantId/);
assert.match(migration,/case when b\.binding_status='BOUND' then b\.clinical_variant_id else null end/);
assert.match(migration,/REVIEWED_PILOT_OVERRIDE_NO_CANONICAL_VARIANT_ID/);
assert.doesNotMatch(migration,/dose_min|dose_max|calculation_method/i);

assert.match(handler,/supabaseRequest/);
assert.match(handler,/rpc\/drx_phase9_product_context_v1/);
assert.match(handler,/\{ privileged:true \}/);
assert.match(handler,/Phase 9 product context read failed/);
assert.match(handler,/substanceConceptId/);
assert.match(handler,/clinicalVariantId/);
assert.match(handler,/phase9Context/);

assert.match(ui,/personalEntityKey/);
assert.match(ui,/product\?\.clinicalVariantId/);
assert.match(ui,/product\?\.substanceConceptId/);
assert.match(ui,/Produkte me të njëjtën përbërje/);
assert.match(ui,/Burimi i dozimit/);
assert.match(ui,/Burimi i produktit \/ identitetit/);
assert.match(ui,/override-i i pilotit nuk përdoret si ID/i);
assert.match(ui,/toggleFavorite\(type,key/);
assert.doesNotMatch(ui,/personalEntityKey\('variant'[^\n]*variantStatus/);

assert.ok(history.migrations.some(
  m=>m.version==='20260830220957' && m.name==='drx_phase9d_product_context'
));
assert.doesNotMatch(rollback,/\bcascade\b/i);

cp.execFileSync(process.execPath,['--check','lib/pediatric-dosage-handler-core.js'],{stdio:'pipe'});
cp.execFileSync(process.execPath,['--check','dozologjia-v2.js'],{stdio:'pipe'});
console.log('DRx Phase 9D product context integration: PASS');
