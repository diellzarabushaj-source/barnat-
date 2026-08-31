'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { execFileSync }=require('node:child_process');
const { supabaseRequest }=require('../lib/medindex-data-api.js');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'drx-phase10-legacy-retirement-preflight.json');
const CONSUMER_EVIDENCE=path.join(ROOT,'drx-phase10-consumer-audit.json');
const EXPECTED_CONSUMERS=[
  'lib/dose-calculator-handler.js',
  'lib/dose-product-fast-path-handler.js',
  'lib/dose-safety-handler.js',
];

async function rpc(name,body={}){
  const {data}=await supabaseRequest(
    'rpc/'+name,
    {method:'POST',body,timeoutMs:12000,label:'Phase 10L '+name},
    {privileged:true}
  );
  return data;
}

async function main(){
  if(!fs.existsSync(CONSUMER_EVIDENCE)){
    execFileSync(process.execPath,[path.join(ROOT,'scripts/drx-phase10-consumer-audit.js')],{
      cwd:ROOT,stdio:'ignore',env:process.env
    });
  }

  const consumerEvidence=JSON.parse(fs.readFileSync(CONSUMER_EVIDENCE,'utf8'));
  const consumerPaths=(consumerEvidence.consumers||[]).map(item=>item.path).sort();
  const exactKnownConsumerSet=
    JSON.stringify(consumerPaths)===JSON.stringify([...EXPECTED_CONSUMERS].sort());

  const db=await rpc('drx_phase10_legacy_retirement_preflight_v1');
  assert.equal(db?.schemaVersion,'drx-phase10-legacy-retirement-preflight-db-v1');

  const status=db.phase10||{};
  const coverage=db.coverage||{};

  assert.equal(coverage.exactBoundProductParity,true,
    'Published rule-bound V2/V3 products must match exactly before retirement.');
  assert.equal(coverage.ruleCountParity,true,
    'Published V2/V3 rule counts must match before retirement.');
  assert.equal(coverage.bindingCountParity,true,
    'Published/verified V2/V3 binding counts must match before retirement.');
  assert.equal(coverage.v2PublishedSafetyRows,0,
    'Published V2 safety rows would be lost by retirement.');
  assert.equal(coverage.safetyContentLossRisk,false);
  assert.equal(exactKnownConsumerSet,true,
    'Legacy runtime consumer set changed; retirement plan requires re-audit.');
  assert.equal(status.restoreTestEvidencePass,true);
  assert.equal(status.effectiveParityCurrent,true);
  assert.equal(status.legacyWritesZeroEvidencePass,true);

  const retirementPrepared=
    coverage.exactBoundProductParity===true
    && coverage.ruleCountParity===true
    && coverage.bindingCountParity===true
    && coverage.safetyContentLossRisk===false
    && exactKnownConsumerSet
    && status.restoreTestEvidencePass===true
    && status.effectiveParityCurrent===true
    && status.legacyWritesZeroEvidencePass===true;

  // Retirement happens only after strict activation. It must NOT depend on
  // finalGatePass because finalGatePass itself requires LEGACY_CONSUMERS_ZERO;
  // that dependency would make the cutover mathematically impossible.
  const retirementAllowedNow=
    retirementPrepared
    && status.soak14DaysPass===true
    && status.mode==='STRICT'
    && status.strictArmed===true;

  const evidence={
    evidenceVersion:'drx-phase10-legacy-retirement-preflight-v1',
    generatedAt:new Date().toISOString(),
    retirementPrepared,
    retirementAllowedNow,
    reason:retirementAllowedNow
      ? 'Strict V3 runtime is armed after the required soak; audited V2 consumer retirement may proceed.'
      : 'Retirement is prepared but remains locked until the 14-day soak passes and strict V3 runtime is armed.',
    currentPhase10:status,
    coverage:{
      ...coverage,
      boundProducts:coverage.v3BoundProducts||[],
    },
    consumers:{
      count:consumerPaths.length,
      exactKnownConsumerSet,
      paths:consumerPaths,
    },
  };

  fs.writeFileSync(OUT,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
