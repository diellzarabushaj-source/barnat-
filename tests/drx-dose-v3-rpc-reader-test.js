'use strict';

const assert = require('node:assert/strict');

const apiPath = require.resolve('../lib/medindex-data-api.js');
const original = require(apiPath);
const calls = [];
const hash = 'd'.repeat(64);

require.cache[apiPath].exports = {
  ...original,
  neonRequest:async (path, options) => {
    calls.push({path,options});
    return {
      data:{
        schemaVersion:'dose-product-fast-path-v3',
        product:{
          productKey:'p1',
          drugId:'11111111-1111-4111-8111-111111111111',
          rules:[{
            ruleKey:'r1',
            source:{snapshotId:hash,evidenceHash:hash,section:'4.2',documentDate:'2026-08-27'}
          }]
        },
        meta:{failClosed:true,publishedOnly:true,officialVerifiedOnly:true}
      }
    };
  },
};
delete require.cache[require.resolve('../lib/dose-v3-product-rpc-reader.js')];
const Rpc = require('../lib/dose-v3-product-rpc-reader.js');

(async () => {
  const payload = await Rpc.build({column:'product_key',value:'p1'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'rpc/medindex_dose_product_fast_path_v3');
  assert.equal(calls[0].options.method,'POST');
  assert.deepEqual(calls[0].options.body,{p_product_key:'p1',p_drug_id:null});
  assert.equal(payload.meta.dbReads,1);
  assert.equal(payload.meta.runtimeModel,'v3-rpc');

  assert.deepEqual(
    Rpc._test.bodyFor({column:'drug_id',value:'11111111-1111-4111-8111-111111111111'}),
    {p_product_key:null,p_drug_id:'11111111-1111-4111-8111-111111111111'}
  );
  assert.equal(Rpc._test.bodyFor({column:'registry_number',value:'1'}),null);

  const missing = new Error('PGRST202 Could not find the function');
  missing.status=404;
  assert.equal(Rpc.isRpcMissing(missing),true);
  assert.equal(Rpc.rpcStrict({DRX_DOSE_V3_RPC_STRICT:'true'}),true);

  console.log('DRx V3 one-RPC dose reader contract passed.');
})().finally(() => {
  require.cache[apiPath].exports = original;
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
