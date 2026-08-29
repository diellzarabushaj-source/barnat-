'use strict';
const assert=require('node:assert/strict');
const Gate=require('../lib/dose-v3-runtime-gate.js');

assert.equal(Gate.v3ReadsEnabled({DRX_DOSE_V3_READS:'1'}),true);
assert.equal(Gate.v3ReadsEnabled({DRX_DOSE_V3_READS:'off'}),false);
assert.deepEqual(
  Gate.chooseRuntime({v3Enabled:true,v3Available:true,v2Available:true,strictV3:false}),
  {runtime:'v3',failClosed:false}
);
assert.deepEqual(
  Gate.chooseRuntime({v3Enabled:true,v3Available:false,v2Available:true,strictV3:false}),
  {runtime:'v2',failClosed:false,fallback:true}
);
assert.equal(
  Gate.chooseRuntime({v3Enabled:true,v3Available:false,v2Available:true,strictV3:true}).failClosed,
  true
);
assert.equal(Gate.validateV3Payload({
  schemaVersion:'dose-product-fast-path-v3',
  meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true},
  product:{productKey:'p1',rules:[{source:{snapshotId:'a'.repeat(64),evidenceHash:'a'.repeat(64),section:'4.2',documentDate:'2026-08-27'}}]}
}),true);
assert.equal(Gate.validateV3Payload({
  schemaVersion:'dose-product-fast-path-v3',
  meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true},
  product:{productKey:'p1',rules:[{source:{snapshotId:'',evidenceHash:'bad',section:'4.2'}}]}
}),false);
assert.equal(Gate.validateV3Payload({
  schemaVersion:'dose-product-fast-path-v3',
  meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true},
  product:{productKey:'p1',rules:[{source:{snapshotId:'a'.repeat(64),evidenceHash:'b'.repeat(64),section:'4.2',documentDate:'2026-08-27'}}]}
}),false);
assert.equal(Gate.validateV3Payload({
  schemaVersion:'dose-product-fast-path-v3',
  meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true},
  product:{productKey:'p1',rules:[{source:{snapshotId:'a'.repeat(64),evidenceHash:'a'.repeat(64),section:'4.2'}}]}
}),false);
console.log('DRx V3 runtime gate contract passed.');
