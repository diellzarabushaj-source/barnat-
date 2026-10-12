'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../sidebar-taxonomy-core-v3.js'),'utf8');
const start=source.indexOf('  function ensureCanonicalWorker() {');
const end=source.indexOf('  // Keep the same mobile navigation behavior',start);
assert.ok(start>0 && end>start);
const implementation=source.slice(start,end);
async function scenario({registerFails=false,updateFails=false}={}){
  let scheduled,completeUpdate,updateStarted=false;
  const dataset={};
  const update=new Promise((resolve,reject)=>{completeUpdate=()=>updateFails?reject(new Error('synthetic offline update')):resolve();});
  const scope={navigator:{serviceWorker:{register:async(url,options)=>{
    assert.equal(url,'/synthetic-canonical-worker.js');assert.equal(options.scope,'/');
    if(registerFails)throw new Error('synthetic unavailable');
    return{update:()=>{updateStarted=true;return update;}};
  }}},window:{requestIdleCallback:callback=>{scheduled=callback;}},document:{documentElement:{dataset}},requestIdleCallback:callback=>{scheduled=callback;},CANONICAL_WORKER_URL:'/synthetic-canonical-worker.js'};
  vm.runInNewContext(implementation+'\nensureCanonicalWorker();',scope);
  assert.equal(typeof scheduled,'function');scheduled();
  await new Promise(setImmediate);
  if(registerFails){assert.equal(dataset.drxWorker,'unavailable');assert.equal(updateStarted,false);return;}
  assert.equal(updateStarted,true);assert.equal(dataset.drxWorker,undefined,'Readiness must await the background update');
  completeUpdate();await new Promise(setImmediate);
  assert.equal(dataset.drxWorker,'canonical','A caught failed update retains the existing canonical registration');
}
(async()=>{await scenario();await scenario({updateFails:true});await scenario({registerFails:true});console.log('Canonical worker readiness waits for the update check, preserves a registered offline worker and reports unavailable registration without an uncaught rejection.');})().catch(error=>{console.error(error);process.exitCode=1;});
