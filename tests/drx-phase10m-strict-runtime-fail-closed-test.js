'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const dataApiPath=require.resolve(path.join(ROOT,'lib/medindex-data-api.js'));
const cutoverPath=require.resolve(path.join(ROOT,'lib/dose-v3-cutover-control.js'));
const v3Path=require.resolve(path.join(ROOT,'lib/pediatric-v3-runtime.js'));
const corePath=require.resolve(path.join(ROOT,'lib/pediatric-dosage-handler-core.js'));

let legacyReads=0;
let telemetry=[];

require.cache[dataApiPath]={
  id:dataApiPath,filename:dataApiPath,loaded:true,
  exports:{
    neonRequest:async requestPath=>{
      legacyReads+=1;
      throw new Error('STRICT test forbids V2/legacy read: '+requestPath);
    },
    supabaseRequest:async()=>({data:null}),
  },
};

const strictState={
  stateVersion:'drx-phase10-cutover-state-v2',
  mode:'STRICT',
  controlledPercent:0,
  strictArmed:true,
  controlVersion:9,
  trafficBucketVersion:2,
  rollbackTarget:'V2',
  stateAvailable:true,
};

require.cache[cutoverPath]={
  id:cutoverPath,filename:cutoverPath,loaded:true,
  exports:{
    getState:async()=>strictState,
    decision:(state,selector)=>({
      mode:'STRICT',controlVersion:9,trafficBucketVersion:2,controlledPercent:0,
      trafficBucket:0,selectedForV3:true,serveV3:true,strict:true,stateAvailable:true,
      selector,
    }),
    recordEvent:async event=>{telemetry.push(event);return {stored:true};},
  },
};

require.cache[v3Path]={
  id:v3Path,filename:v3Path,loaded:true,
  exports:{
    buildProduct:async()=>null,
    calculate:async()=>({error:'V3 payload not found',status:404}),
  },
};

delete require.cache[corePath];
const handler=require(corePath);
const UUID='84a1cf4a-6568-41d7-8d13-0f2b7715acae';

(async()=>{
  const product=await handler.loadProduct(UUID);
  assert.equal(product.status,503);
  assert.equal(product.code,'V3_STRICT_UNAVAILABLE');
  assert.match(product.error,/V2 fallback është i ndaluar në STRICT/);
  assert.equal(legacyReads,0,'STRICT product lookup must not read V2');

  const calculation=await handler.calculateDose({drugId:UUID,age:{value:12,unit:'vjet'}});
  assert.equal(calculation.status,503);
  assert.equal(calculation.code,'V3_STRICT_UNAVAILABLE');
  assert.equal(legacyReads,0,'STRICT calculation must not read V2');

  const registryNumberProduct=await handler.loadProduct('42');
  assert.equal(registryNumberProduct.status,503,
    'registry-number selectors must not bypass STRICT into legacy runtime');
  assert.equal(registryNumberProduct.code,'V3_STRICT_UNAVAILABLE');
  assert.equal(legacyReads,0,'STRICT registry-number lookup must not read V2');

  // recordEvent is intentionally fire-and-forget in production; flush one tick.
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(telemetry.some(event=>
    event.mode==='STRICT'
    && event.runtimeServed==='v3'
    && event.fallbackUsed===false
    && event.v3Available===false
  ),'STRICT V3 failure must be observable as blocked without fallback');

  console.log('DRx Phase 10M strict runtime fail-closed: PASS (V2 reads=0)');
})().catch(error=>{console.error(error);process.exitCode=1;});
