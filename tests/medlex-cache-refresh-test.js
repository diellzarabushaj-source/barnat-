'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const origin='https://medlex.test';
function response(body,url){const r=new Response(body,{headers:{'Content-Type':'text/html'}});Object.defineProperty(r,'url',{value:url});return r;}
async function check(file){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  if(!source.includes('async function navigationResponse')){
    assert.match(source,/importScripts\('\/sw\.js\?v=/,file+': a generated compatibility shim must delegate to the tested canonical worker.');
    return;
  }
  let offline=false;
  const cache={match:async()=>response('old chapter',origin+'/medlex.html'),put:async()=>{}};
  const context=vm.createContext({URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,console,
    self:{location:{origin},addEventListener(){},clients:{matchAll:async()=>[]}},
    caches:{open:async()=>cache,match:async()=>response('old chapter',origin+'/medlex.html')},
    fetch:async request=>{if(offline)throw Error('offline');return response('new chapter',request.url);}});
  vm.runInContext(source,context);
  vm.runInContext('putIfCacheable = async function(cacheName,request,response){return response;}',context);
  if(file==='sw.js') vm.runInContext('authSnapshot = async function(){return {owner:"test"};}',context);
  const navigate=vm.runInContext('navigationResponse',context);
  const event={request:new Request(origin+'/medlex.html?category=02'),waitUntil(p){p.catch(()=>{});}};
  const fresh=await navigate(event,new URL(event.request.url));
  assert.equal(await fresh.text(),'new chapter',file+': an online MedLex visit must not reuse stale HTML.');
  offline=true;
  vm.runInContext(file==='sw.js'?'deviceOnline=false':'networkProfile.online=false',context);
  const saved=await navigate(event,new URL(event.request.url));
  assert.equal(await saved.text(),'old chapter',file+': a saved chapter remains readable offline.');
}
(async()=>{await check('sw.js');await check('sw-resilient.js');console.log('MedLex navigation refresh: fresh online chapters and preserved offline fallback passed for both workers.');})().catch(error=>{console.error(error);process.exitCode=1;});
