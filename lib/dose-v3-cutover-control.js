'use strict';

const crypto=require('node:crypto');
const { supabaseRequest }=require('./medindex-data-api.js');

const CACHE_MS=15000;
const ERROR_CACHE_MS=3000;
const TRAFFIC_BUCKET_VERSION=2;
let cached=null;
let cachedAt=0;
let pending=null;

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

function safeState(reason='unavailable'){
  return Object.freeze({
    stateVersion:'drx-phase10-cutover-state-v2',
    mode:'SHADOW',
    controlledPercent:0,
    strictArmed:false,
    controlVersion:1,
    trafficBucketVersion:TRAFFIC_BUCKET_VERSION,
    rollbackTarget:'V2',
    strictActivationSupported:false,
    stateAvailable:false,
    fallbackReason:clean(reason).slice(0,120),
  });
}

function normalizeState(value){
  if(!value) return safeState('invalid_version');
  const stateVersion=clean(value.stateVersion);
  const mode=clean(value.mode).toUpperCase();
  const percent=Number(value.controlledPercent);
  const version=Number(value.controlVersion);
  const bucketVersion=Number(value.trafficBucketVersion);
  const strictArmed=value.strictArmed===true;
  if(!Number.isInteger(version) || version<1) return safeState('invalid_control_version');

  // Legacy v1 is accepted only while safely parked in SHADOW. Controlled
  // serving requires v2 so the canary cohort cannot reshuffle with controlVersion.
  if(stateVersion==='drx-phase10-cutover-state-v1'){
    if(mode==='SHADOW' && percent===0 && !strictArmed && value.strictActivationSupported!==true){
      return Object.freeze({
        ...value,
        stateVersion:'drx-phase10-cutover-state-v2',
        mode,
        controlledPercent:0,
        controlVersion:version,
        trafficBucketVersion:TRAFFIC_BUCKET_VERSION,
        strictArmed:false,
        stateAvailable:true,
        compatibilityStateVersion:'drx-phase10-cutover-state-v1',
      });
    }
    return safeState('legacy_state_not_allowed_for_controlled');
  }
  if(stateVersion!=='drx-phase10-cutover-state-v2') return safeState('invalid_version');
  if(bucketVersion!==TRAFFIC_BUCKET_VERSION) return safeState('invalid_traffic_bucket_version');
  if(mode==='SHADOW' && percent===0 && !strictArmed){
    return Object.freeze({...value,mode,controlledPercent:0,controlVersion:version,trafficBucketVersion:bucketVersion,strictArmed:false,stateAvailable:true});
  }
  if(mode==='CONTROLLED' && [1,5,10].includes(percent) && !strictArmed){
    return Object.freeze({...value,mode,controlledPercent:percent,controlVersion:version,trafficBucketVersion:bucketVersion,strictArmed:false,stateAvailable:true});
  }
  // STRICT is accepted only from the signed control row shape: armed, zero
  // controlled percentage, stable bucket version. Activation itself remains
  // DB-gated by Phase 10M and cannot occur before the full pre-strict evidence set.
  if(mode==='STRICT' && percent===0 && strictArmed){
    return Object.freeze({...value,mode,controlledPercent:0,controlVersion:version,trafficBucketVersion:bucketVersion,strictArmed:true,stateAvailable:true});
  }
  return safeState('invalid_state');
}

async function fetchState(){
  const {data}=await supabaseRequest(
    'rpc/drx_phase10_cutover_state_v1',
    {method:'POST',body:{},timeoutMs:2500,label:'DRx Phase 10 cutover state'},
    {privileged:true}
  );
  return normalizeState(data);
}

async function getState({force=false}={}){
  const now=Date.now();
  const ttl=cached?.stateAvailable===false ? ERROR_CACHE_MS : CACHE_MS;
  if(!force && cached && now-cachedAt<ttl) return cached;
  if(!pending){
    pending=fetchState()
      .catch(error=>safeState(error?.message||'state_read_failed'))
      .then(state=>{cached=state;cachedAt=Date.now();return state;})
      .finally(()=>{pending=null;});
  }
  return pending;
}

function selectorHash(selector={}){
  return crypto.createHash('sha256')
    .update(clean(selector.column)+':'+clean(selector.value))
    .digest('hex');
}

function trafficBucket(state,selector={}){
  const seed=[
    Number(state?.trafficBucketVersion)||TRAFFIC_BUCKET_VERSION,
    clean(selector.column),
    clean(selector.value),
  ].join('|');
  const hex=crypto.createHash('sha256').update(seed).digest('hex').slice(0,8);
  return Number.parseInt(hex,16)%100;
}

function decision(state,selector={}){
  const normalized=normalizeState(state);
  const bucket=trafficBucket(normalized,selector);
  const strict=normalized.stateAvailable===true
    && normalized.mode==='STRICT'
    && normalized.strictArmed===true;
  const controlled=normalized.stateAvailable===true
    && normalized.mode==='CONTROLLED'
    && normalized.controlledPercent>0
    && bucket<normalized.controlledPercent;
  const selected=strict || controlled;
  return Object.freeze({
    mode:normalized.mode,
    controlVersion:normalized.controlVersion,
    trafficBucketVersion:normalized.trafficBucketVersion,
    controlledPercent:normalized.controlledPercent,
    trafficBucket:bucket,
    selectedForV3:selected,
    serveV3:selected,
    strict,
    stateAvailable:normalized.stateAvailable===true,
  });
}

async function recordEvent(event){
  if(event?.stateAvailable!==true) return {stored:false,reason:'control_state_unavailable'};
  try{
    await supabaseRequest(
      'rpc/drx_phase10_record_runtime_event_v1',
      {
        method:'POST',
        body:{
          p_event:{
            eventVersion:'drx-phase10-runtime-event-v1',
            selectorKind:clean(event.selector?.column),
            selectorSha256:selectorHash(event.selector),
            controlVersion:event.controlVersion,
            trafficBucketVersion:event.trafficBucketVersion,
            mode:event.mode,
            trafficBucket:event.trafficBucket,
            selectedForV3:event.selectedForV3===true,
            runtimeServed:clean(event.runtimeServed),
            ...(typeof event.v3Available==='boolean'?{v3Available:event.v3Available}:{}),
            fallbackUsed:event.fallbackUsed===true,
            outcome:clean(event.outcome).toUpperCase(),
            durationMs:Math.max(0,Math.min(60000,Math.round(Number(event.durationMs)||0))),
          }
        },
        timeoutMs:1800,
        label:'DRx Phase 10 runtime telemetry',
      },
      {privileged:true}
    );
    return {stored:true};
  }catch(error){
    return {stored:false,reason:clean(error?.message||'telemetry_failed').slice(0,120)};
  }
}

function clearCache(){
  cached=null;cachedAt=0;pending=null;
}

module.exports={
  getState,decision,recordEvent,selectorHash,
  _test:{clean,safeState,normalizeState,trafficBucket,clearCache,CACHE_MS,ERROR_CACHE_MS,TRAFFIC_BUCKET_VERSION},
};
