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

const clean=value=>String(value??'').trim();

async function rows(table,select,filters={}){
  const q=new URLSearchParams({select,limit:'1000'});
  for(const [key,value] of Object.entries(filters)) q.set(key,String(value));
  const {data}=await supabaseRequest(
    table+'?'+q.toString(),
    {timeoutMs:12000,label:'Phase 10L '+table},
    {privileged:true}
  );
  if(!Array.isArray(data)) throw new Error(table+' did not return a row list.');
  return data;
}

async function rpc(name,body={}){
  const {data}=await supabaseRequest(
    'rpc/'+name,
    {method:'POST',body,timeoutMs:12000,label:'Phase 10L '+name},
    {privileged:true}
  );
  return data;
}

function productIdentity(product){
  return {
    productKey:clean(product.product_key),
    drugId:clean(product.drug_id),
  };
}

function identityKey(item){
  return item.productKey+'|'+item.drugId;
}

function uniqueSorted(items){
  const map=new Map();
  for(const item of items){
    if(!item.productKey || !item.drugId) continue;
    map.set(identityKey(item),item);
  }
  return [...map.values()].sort((a,b)=>identityKey(a).localeCompare(identityKey(b),'en'));
}

async function main(){
  if(!fs.existsSync(CONSUMER_EVIDENCE)){
    execFileSync(process.execPath,[path.join(ROOT,'scripts/drx-phase10-consumer-audit.js')],{
      cwd:ROOT,stdio:'ignore',env:process.env
    });
  }
  const consumerEvidence=JSON.parse(fs.readFileSync(CONSUMER_EVIDENCE,'utf8'));
  const consumerPaths=(consumerEvidence.consumers||[]).map(item=>item.path).sort();

  const [
    v2Products,v2Rules,v2Bindings,v2Safety,
    v3Products,v3Rules,v3Bindings,status
  ]=await Promise.all([
    rows('dose_products_v2','product_key,drug_id',{active:'eq.true',editorial_status:'eq.published'}),
    rows('dose_rules_v2','rule_key',{active:'eq.true',editorial_status:'eq.published'}),
    rows('dose_rule_products_v2','rule_key,product_key',{active:'eq.true',editorial_status:'eq.published'}),
    rows('dose_safety_v2','safety_key',{active:'eq.true',editorial_status:'eq.published'}),
    rows('dose_products_v3','product_id,product_key,drug_id',{editorial_status:'eq.published'}),
    rows('dose_rules_v3','rule_id',{editorial_status:'eq.published'}),
    rows('dose_rule_products_v3','rule_id,product_id',{binding_status:'eq.verified'}),
    rpc('drx_phase10_status_v1'),
  ]);

  const v2RuleKeys=new Set(v2Rules.map(row=>clean(row.rule_key)).filter(Boolean));
  const v2ProductMap=new Map(v2Products.map(row=>[clean(row.product_key),row]));
  const v2EffectiveBindings=v2Bindings.filter(row=>
    v2RuleKeys.has(clean(row.rule_key)) && v2ProductMap.has(clean(row.product_key))
  );
  const v2Bound=uniqueSorted(v2EffectiveBindings.map(row=>productIdentity(v2ProductMap.get(clean(row.product_key)))));

  const v3RuleIds=new Set(v3Rules.map(row=>clean(row.rule_id)).filter(Boolean));
  const v3ProductMap=new Map(v3Products.map(row=>[clean(row.product_id),row]));
  const v3EffectiveBindings=v3Bindings.filter(row=>
    v3RuleIds.has(clean(row.rule_id)) && v3ProductMap.has(clean(row.product_id))
  );
  const v3Bound=uniqueSorted(v3EffectiveBindings.map(row=>productIdentity(v3ProductMap.get(clean(row.product_id)))));

  const v2Keys=v2Bound.map(identityKey);
  const v3Keys=v3Bound.map(identityKey);
  const exactBoundProductParity=JSON.stringify(v2Keys)===JSON.stringify(v3Keys);
  const ruleCountParity=v2Rules.length===v3Rules.length;
  const bindingCountParity=v2EffectiveBindings.length===v3EffectiveBindings.length;
  const safetyContentLossRisk=v2Safety.length>0;
  const exactKnownConsumerSet=JSON.stringify(consumerPaths)===JSON.stringify([...EXPECTED_CONSUMERS].sort());

  assert.equal(exactBoundProductParity,true,'Published rule-bound V2/V3 products must match exactly before retirement.');
  assert.equal(ruleCountParity,true,'Published V2/V3 rule counts must match before retirement.');
  assert.equal(bindingCountParity,true,'Published/verified V2/V3 binding counts must match before retirement.');
  assert.equal(v2Safety.length,0,'Published V2 safety rows would be lost by retirement.');
  assert.equal(exactKnownConsumerSet,true,'Legacy runtime consumer set changed; retirement plan requires re-audit.');
  assert.equal(status.restoreTestEvidencePass,true);
  assert.equal(status.effectiveParityCurrent,true);
  assert.equal(status.legacyWritesZeroEvidencePass,true);

  const retirementPrepared=
    exactBoundProductParity
    && ruleCountParity
    && bindingCountParity
    && !safetyContentLossRisk
    && exactKnownConsumerSet
    && status.restoreTestEvidencePass===true
    && status.effectiveParityCurrent===true
    && status.legacyWritesZeroEvidencePass===true;

  const retirementAllowedNow=
    retirementPrepared
    && status.soak14DaysPass===true
    && status.finalGatePass===true
    && status.mode==='STRICT'
    && status.strictArmed===true;

  const evidence={
    evidenceVersion:'drx-phase10-legacy-retirement-preflight-v1',
    generatedAt:new Date().toISOString(),
    retirementPrepared,
    retirementAllowedNow,
    reason:retirementAllowedNow
      ? 'All final cutover gates allow V2 consumer retirement.'
      : 'Retirement is prepared but remains locked until the 14-day soak and final strict cutover gates pass.',
    currentPhase10:{
      mode:status.mode,
      controlledTrafficPercent:status.controlledTrafficPercent,
      soak14DaysPass:status.soak14DaysPass,
      finalGatePass:status.finalGatePass,
      strictArmed:status.strictArmed,
      restoreTestEvidencePass:status.restoreTestEvidencePass,
      effectiveParityCurrent:status.effectiveParityCurrent,
      legacyWritesZeroEvidencePass:status.legacyWritesZeroEvidencePass,
      legacyConsumersZeroEvidencePass:status.legacyConsumersZeroEvidencePass,
    },
    coverage:{
      v2PublishedProductShells:v2Products.length,
      v2PublishedRules:v2Rules.length,
      v2EffectiveBindings:v2EffectiveBindings.length,
      v2PublishedSafetyRows:v2Safety.length,
      v3PublishedProducts:v3Products.length,
      v3PublishedRules:v3Rules.length,
      v3VerifiedEffectiveBindings:v3EffectiveBindings.length,
      exactBoundProductParity,
      ruleCountParity,
      bindingCountParity,
      safetyContentLossRisk,
      boundProducts:v3Bound,
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
