'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const origin='https://device.example';let clock=Date.now(),owner='account-a',authStatus=200,reads=0,bodies=0,gate=null,fail=false;
const buckets=new Map(),listeners={};
const storage={async open(name){if(!buckets.has(name))buckets.set(name,new Map());const bucket=buckets.get(name);return{
 async match(key){return bucket.get(typeof key==='string'?new URL(key,origin).href:key.url)?.clone();},
 async put(key,response){bucket.set(typeof key==='string'?new URL(key,origin).href:key.url,response.clone());},
 async keys(){return [...bucket.keys()].map(url=>new Request(url));},
 async delete(key){return bucket.delete(typeof key==='string'?new URL(key,origin).href:key.url);}
 };},async keys(){return [...buckets.keys()];},async delete(name){return buckets.delete(name);}};
const sandbox={Request,Response,Headers,URL,AbortController,setTimeout,clearTimeout,caches:storage,
 Date:class extends Date{static now(){return clock;}},
 self:{location:{origin},addEventListener(type,fn){listeners[type]=fn;},clients:{async matchAll(){return[];}}},
 async fetch(request){const url=new URL(request.url);if(fail)throw new TypeError('Network unavailable');
  if(url.pathname==='/api/auth')return new Response(JSON.stringify(authStatus===200?{authenticated:true,hardened:true,sessionVersion:3,supabaseAuthenticated:true,sessionHours:8,authUser:{id:owner},user:{name:'Test',email:owner+'@example.test'},refreshToken:'must-not-persist',token:'must-not-persist'}:{authenticated:false}),{status:authStatus,headers:{'Content-Type':'application/json'}});
  reads++;if(gate)await gate;const etag=`"${owner}:${url.search}"`;if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304});
  bodies++;return new Response(JSON.stringify({ok:true,rows:[{id:owner}],request:url.search}),{headers:{'Content-Type':'application/json','ETag':etag}});
 }};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../sw.js'),'utf8'),sandbox);
const req=(path,headers={})=>new Request(origin+path,{headers});
const event=path=>({request:req(path),waitUntil(p){this.pending.push(p);},pending:[]});
(async()=>{
 await sandbox.authResponse(req('/api/auth'));
 const snapshot=await(await storage.open('medindex-auth-device-v1')).match(req('/api/auth'));
 const serialized=await snapshot.text();assert.ok(!serialized.includes('must-not-persist'));assert.ok(!serialized.includes('refreshToken'));
 const url='/api/drug-search?view=registry-page&page=1';
 let release;gate=new Promise(resolve=>release=resolve);
 const one=sandbox.queryDataResponse(event(url),new URL(origin+url));const two=sandbox.queryDataResponse(event(url),new URL(origin+url));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(reads,1,'identical misses share one read');release();await Promise.all([one,two]);gate=null;
 const first=reads;const hit=await sandbox.queryDataResponse(event(url),new URL(origin+url));assert.equal(hit.headers.get('X-MedIndex-Cache'),'query-local-hit');assert.equal(reads,first,'local hits do not repeatedly download');
 const a='/api/dosage?view=cards&nrs=1';const b='/api/dosage?view=cards&nrs=2';
 const doseA=await sandbox.privateDataResponse(event(a),new URL(origin+a));const doseB=await sandbox.privateDataResponse(event(b),new URL(origin+b));
 assert.notEqual((await doseA.json()).request,(await doseB.json()).request,'dose cards are isolated by the entire query');
 const force=event(url);force.request=req(url,{'Cache-Control':'no-cache'});const refreshed=await sandbox.queryDataResponse(force,new URL(origin+url));assert.equal(refreshed.headers.get('X-MedIndex-Cache'),'query-revalidated');assert.equal(bodies,3,'unchanged data is not downloaded again');assert.equal(reads,first+3,'explicit refresh makes a new read');
 clock+=7*3600000;const stale=event(url);await sandbox.queryDataResponse(stale,new URL(origin+url));await Promise.all(stale.pending);assert.equal(reads,first+4,'stale clinical reads revalidate once in the background');
 fail=true;assert.equal((await sandbox.authResponse(req('/api/auth'))).headers.get('X-MedIndex-Cache'),'auth-offline');
 const missing=await sandbox.queryDataResponse(event('/api/icd?view=unknown'),new URL(origin+'/api/icd?view=unknown'));assert.equal(missing.status,503);
 clock+=2*3600000;await assert.rejects(()=>sandbox.authResponse(req('/api/auth')),'offline lease never extends itself');fail=false;
 await sandbox.authResponse(req('/api/auth'));owner='account-b';await sandbox.authResponse(req('/api/auth'));
 assert.equal((await(await storage.open('medindex-private-device-v1')).keys()).length,0,'switching account clears previous data');
 // A response that completes after logout must not resurrect saved data.
 gate=new Promise(resolve=>release=resolve);const pending=sandbox.queryDataResponse(event(url),new URL(origin+url));await new Promise(resolve=>setTimeout(resolve,0));await sandbox.clearPrivateData();release();await pending;gate=null;
 assert.equal((await(await storage.open('medindex-private-device-v1')).keys()).length,0);
 await sandbox.authResponse(req('/api/auth'));authStatus=403;assert.equal((await sandbox.authResponse(req('/api/auth'))).status,403);assert.equal(await sandbox.authSnapshot(),null);
 console.log('PASS: concurrent reads, no repeat downloads, dose query isolation, explicit refresh, clinical freshness, offline lease expiry, account switch, revocation, logout race and token-free storage.');
})().catch(error=>{console.error(error);process.exitCode=1;});
