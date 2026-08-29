'use strict';

const assert=require('node:assert/strict');
const Audit=require('../scripts/audit-drx-legacy-consumers.js');
const manifest=require('../data/drx-final-cleanup-manifest-v1.json');

const result=Audit.audit();
assert.equal(result.schemaVersion,'drx-legacy-consumer-audit-v1');
assert.equal(result.zeroKnownLegacyConsumers,false);
assert.equal(result.destructiveCleanupAllowed,false);
assert.ok(result.consumerCount>=manifest.knownConsumers.length);

const found=new Set(result.consumers.map(x=>x.file));
for(const item of manifest.knownConsumers){
  assert.ok(found.has(item.file),item.file+' must remain visible to the legacy-consumer audit until migrated');
}

for(const table of manifest.legacyRuntime){
  assert.ok(Object.hasOwn(result.byLegacy,table),table+' must be tracked');
}

assert.ok(result.byLegacy.dosage_regimens.includes('lib/dosage-card-handler.js'));
assert.ok(result.byLegacy.dosage_regimens.includes('lib/pediatric-dosage-handler-core.js'));
assert.ok(result.byLegacy.dosage_regimens.includes('lib/prescription-dosage-handler.js'));
assert.ok(result.byLegacy.dose_products_v2.includes('lib/dose-product-fast-path-handler.js'));
assert.ok(result.byLegacy.dose_products_v2.includes('lib/dose-calculator-handler.js'));

console.log('DRx legacy runtime consumer audit correctly blocks destructive cleanup.');
