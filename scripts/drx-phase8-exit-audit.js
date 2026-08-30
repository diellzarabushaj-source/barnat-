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
  const started=performance.now();
  const value=await fn();
  return {value,ms:performance.now()-started};
}

function p95(samples) {
  const sorted=[...samples].sort((a,b)=>a-b);
  if(!sorted.length) return null;
  return sorted[Math.max(0,Math.ceil(sorted.length*0.95)-1)];
}

async function main() {
  const status=await rpc('drx_phase8_status_v1');
  const preflight=await rpc('drx_phase8_pilot_build_preflight_v1');
  const serverProbe=await rpc('drx_phase8_performance_probe_v1',{
    p_samples:SAMPLE_COUNT,p_warm_samples:WARM_COUNT
  });

  assert.equal(serverProbe.probeVersion,'drx-phase8-performance-probe-v1');
  assert.equal(serverProbe.measurementScope,'database-server-execution');
  assert.equal(serverProbe.networkLatencyExcluded,true);
  assert.equal(serverProbe.thresholds.searchP95MaxMs,SEARCH_P95_MAX_MS);
  assert.equal(serverProbe.thresholds.productDetailP95MaxMs,PRODUCT_DETAIL_P95_MAX_MS);
  assert.equal(serverProbe.thresholds.searchPageLimit,SEARCH_PAGE_LIMIT);
  assert.equal(serverProbe.searchPass,true);

  // Round-trip telemetry is intentionally observational. GitHub-runner region
  // and WAN transit must not be confused with database query execution p95.
  for(let i=0;i<WARM_COUNT;i++) {
    await rpc('drx_dose_search_v3_shadow_v1',{p_query:'pa',p_limit:SEARCH_PAGE_LIMIT});
  }

  const searchRoundTripSamples=[];
  let maxSearchResults=0;
  for(let i=0;i<SAMPLE_COUNT;i++) {
    const sample=await timed(()=>rpc('drx_dose_search_v3_shadow_v1',{
      p_query:i%2===0?'pa':'am',
      p_limit:SEARCH_PAGE_LIMIT
    }));
    assert.ok(Array.isArray(sample.value));
    assert.ok(sample.value.length<=SEARCH_PAGE_LIMIT);
    maxSearchResults=Math.max(maxSearchResults,sample.value.length);
    searchRoundTripSamples.push(sample.ms);
  }

  const detailRoundTripSamples=[];
  let detailRoundTripPayloads=0;
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
        if(sample.value) detailRoundTripPayloads+=1;
        detailRoundTripSamples.push(sample.ms);
      }
    }
  }

  if(status.exit_gate_pass) {
    assert.equal(preflight.preflightPass,true);
    assert.equal(serverProbe.stage.preflightPass,true);
    assert.ok(serverProbe.searchServerP95Ms<=SEARCH_P95_MAX_MS);
    assert.ok(serverProbe.productDetailServerP95Ms<=PRODUCT_DETAIL_P95_MAX_MS);
    assert.equal(serverProbe.detailPayloadCalls,2*SAMPLE_COUNT);
    assert.equal(serverProbe.finalPerformancePass,true);
  }

  const evidence={
    evidenceVersion:'drx-phase8-exit-audit-v2',
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
    serverPerformance:serverProbe,
    roundTripTelemetry:{
      measurementScope:'github-runner-to-supabase-round-trip',
      gateMetric:false,
      searchP95Ms:p95(searchRoundTripSamples),
      productDetailP95Ms:p95(detailRoundTripSamples),
      maxSearchResults,
      detailPayloads:detailRoundTripPayloads
    }
  };
  fs.writeFileSync('drx-phase8-exit-audit-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
