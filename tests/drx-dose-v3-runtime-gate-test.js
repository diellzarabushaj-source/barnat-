'use strict';
const assert=require('node:assert/strict');
const Gate=require('../lib/dose-v3-runtime-gate.js');

const HASH='a'.repeat(64);
const SECTION='b'.repeat(64);
const source={snapshotId:HASH,sectionSha256:SECTION,evidenceHash:HASH,section:'4.2',documentDate:'2026-08-27',official:true};

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

assert.equal(Gate._test.sourceValid(source),true);
assert.equal(Gate._test.sourceValid({...source,sectionSha256:''}),false);
assert.equal(Gate._test.sourceValid({...source,evidenceHash:'c'.repeat(64)}),false);

const goodRule={
  renalAdjustmentRequired:true,
  hepaticAdjustmentRequired:false,
  renalAdjustments:[{source:{...source,sectionSha256:'d'.repeat(64)}}],
  hepaticAdjustments:[],
  conversion:{
    bindingStatus:'verified',
    verifiedBy:'reviewer',
    verifiedAt:'2026-08-29T12:00:00Z',
    enabled:false,
    status:'not_allowed',
  },
  source
};
assert.equal(Gate._test.ruleValid(goodRule),true);
assert.equal(Gate._test.ruleValid({...goodRule,renalAdjustments:[]}),false);
assert.equal(Gate._test.ruleValid({...goodRule,renalAdjustments:[{source:{...source,sectionSha256:''}}]}),false);

assert.equal(Gate.validateV3Payload({
  schemaVersion:'dose-product-fast-path-v3',
  meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true},
  product:{productKey:'p1',rules:[goodRule]}
}),true);
assert.equal(Gate.validateV3Payload({
  schemaVersion:'dose-product-fast-path-v3',
  meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true},
  product:{productKey:'p1',rules:[]}
}),false);
assert.equal(Gate.validateV3Payload({
  schemaVersion:'dose-product-fast-path-v3',
  meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true},
  product:{productKey:'p1',rules:[{...goodRule,hepaticAdjustmentRequired:true,hepaticAdjustments:[]}]}
}),false);

console.log('DRx V3 runtime gate contract passed.');
