'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { supabaseRequest } = require('../lib/medindex-data-api.js');

const SEARCH_P95_MAX_MS = 300;
const PRODUCT_DETAIL_P95_MAX_MS = 400;
const SEARCH_PAGE_LIMIT = 50;
const SAMPLE_COUNT = 20;
const WARM_COUNT = 5;

async function rpc(name,body={}) {
  const { data } = await supabaseRequest('rpc/' + name,{
    method:'POST',body,timeoutMs:20000,label:'DRx Phase 8 exit audit ' + name
  },{ privileged:true });
  return data;
}

async function timed(fn) {
  const started = performance.now();
  const value = await fn();
  return { value, ms:performance.now()-started };
}

function p95(samples) {
  const sorted=[...samples].sort((a,b)=>a-b);
  if(!sorted.length) return null;
  return sorted[Math.max(0,Math.ceil(sorted.length*0.95)-1)];
}

async function main() {
  const status=await rpc('drx_phase8_status_v1');
  const preflight=await rpc('drx_phase8_pilot_build_preflight_v1');

  for(let i=0;i<WARM_COUNT;i++) {
    await rpc('drx_dose_search_v3_shadow_v1',{p_query:'pa',p_limit:SEARCH_PAGE_LIMIT});
  }

  const searchSamples=[];
  let maxSearchResults=0;
  for(let i=0;i<SAMPLE_COUNT;i++) {
    const sample=await timed(()=>rpc('drx_dose_search_v3_shadow_v1',{
      p_query:i%2===0?'pa':'am',
      p_limit:SEARCH_PAGE_LIMIT
    }));
    assert.ok(Array.isArray(sample.value));
    assert.ok(sample.value.length<=SEARCH_PAGE_LIMIT);
    maxSearchResults=Math.max(maxSearchResults,sample.value.length);
    searchSamples.push(sample.ms);
  }

  const detailSamples=[];
  let detailPayloads=0;
  if(preflight.preflightPass) {
    const pilots=Array.isArray(preflight.pilots)?preflight.pilots:[];
    assert.equal(pilots.length,2);
    for(const pilot of pilots) {
      for(let i=0;i<WARM_COUNT;i++) {
        await rpc('medindex_dose_product_fast_path_v3',{
          p_product_key:null,p_drug_id:pilot.drugId
        });
      }
      for(let i=0;i<SAMPLE_COUNT;i++) {
        const sample=await timed(()=>rpc('medindex_dose_product_fast_path_v3',{
          p_product_key:null,p_drug_id:pilot.drugId
        }));
        if(sample.value) detailPayloads+=1;
        detailSamples.push(sample.ms);
      }
    }
  }

  const searchP95=p95(searchSamples);
  const productDetailP95=p95(detailSamples);
  const performanceGatePass=preflight.preflightPass
    ? searchP95!==null
      && productDetailP95!==null
      && searchP95<=SEARCH_P95_MAX_MS
      && productDetailP95<=PRODUCT_DETAIL_P95_MAX_MS
      && detailPayloads===2*SAMPLE_COUNT
    : false;

  if(status.exit_gate_pass) {
    assert.equal(preflight.preflightPass,true);
    assert.ok(searchP95<=SEARCH_P95_MAX_MS);
    assert.ok(productDetailP95<=PRODUCT_DETAIL_P95_MAX_MS);
    assert.equal(detailPayloads,2*SAMPLE_COUNT);
    assert.equal(performanceGatePass,true);
  }

  const evidence={
    evidenceVersion:'drx-phase8-exit-audit-v1',
    generatedAt:new Date().toISOString(),
    thresholds:{
      searchP95MaxMs:SEARCH_P95_MAX_MS,
      productDetailP95MaxMs:PRODUCT_DETAIL_P95_MAX_MS,
      searchPageLimit:SEARCH_PAGE_LIMIT
    },
    stage:{
      preflightPass:preflight.preflightPass,
      clinicalReviewsVerified:preflight.clinicalReviewsVerified,
      pilotsPublishedInV3:preflight.pilotsPublishedInV3,
      exitGatePass:status.exit_gate_pass
    },
    performance:{
      searchP95Ms:searchP95,
      productDetailP95Ms:productDetailP95,
      maxSearchResults,
      detailPayloads,
      performanceGatePass,
      finalPerformanceMeasured:preflight.preflightPass
    }
  };
  fs.writeFileSync('drx-phase8-exit-audit-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
