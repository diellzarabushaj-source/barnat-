'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit, expect} = require('@playwright/test');
const ROOT=path.resolve(__dirname,'..');
async function offlineState(page) {
 return page.evaluate(async()=>{
  const worker=value=>value?{scriptURL:value.scriptURL,state:value.state}:null;
  return{
   url:location.href,online:navigator.onLine,readyState:document.readyState,workerMode:document.documentElement.dataset.drxWorker,
   controller:worker(navigator.serviceWorker.controller),
   registrations:(await navigator.serviceWorker.getRegistrations()).map(registration=>({scope:registration.scope,active:worker(registration.active),waiting:worker(registration.waiting),installing:worker(registration.installing)})),
   caches:await Promise.all((await caches.keys()).map(async name=>{
    const cache=await caches.open(name);
    return{name,entries:await Promise.all((await cache.keys()).map(async key=>{
     const response=await cache.match(key);
     return{url:key.url,status:response?.status,savedAt:response?.headers.get('X-DRx-Saved-At'),contentType:response?.headers.get('Content-Type')};
    }))};
   }))
  };
 });
}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.json':'application/json'};
const row={id:'11111111-1111-4111-8111-111111111111',registryNumber:'1',pdid:'1001',tradeName:'BAR TESTUES PËR RUAJTJEN LOKALE',activeSubstance:'Substancë testuese',atc:'N02BE01',strength:'500 mg',form:'Tabletë',drugClass:'Produkt testues',use:'Vetëm për verifikimin e ndërfaqes',productStatus:'Gjenerik',retailPrice:2.45};
const reads=new Map();let authStatus=200,owner='account-a',delay=0,networkAvailable=true;
const session=()=>({authenticated:true,hardened:true,sessionVersion:3,sessionHours:8,supabaseAuthenticated:true,authUser:{id:owner},user:{name:'Mjeku testues',email:`${owner}@example.test`}});
const server=http.createServer(async(req,res)=>{
 if (!networkAvailable) {req.socket.destroy();return;}
 const url=new URL(req.url,'http://localhost');
 reads.set(url.pathname+url.search,(reads.get(url.pathname+url.search)||0)+1);
 const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(url.pathname==='/api/auth') return json(req.method==='DELETE'?200:authStatus,req.method==='DELETE'?{ok:true}:authStatus===200?session():{authenticated:false});
 if(delay&&url.pathname==='/api/drug-search')await new Promise(resolve=>setTimeout(resolve,delay));
 if(url.pathname==='/api/drug-search'){
  if(url.searchParams.get('view')==='registry-detail')return json(200,{ok:true,row});
  return json(200,{ok:true,rows:[row],results:[],pagination:{page:1,pageSize:Number(url.searchParams.get('pageSize') || 50),total:1,totalPages:1}});
 }
 if(url.pathname==='/api/dosage')return json(200,{ok:true,cards:[],forms:[],adult:[],pediatric:[]});
 if(url.pathname==='/api/user-library')return json(200,{ok:true,items:[],favorites:[],notes:[],counts:{favorites:0,notes:0}});
 if(url.pathname==='/api/profile')return json(200,{ok:true,profile:{fullName:'Mjeku testues'}});
 if(url.pathname.startsWith('/api/'))return json(200,{ok:true,data:{meta:{},chapters:[],blocks:[],rows:[]}});
 let file=path.resolve(ROOT,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(ROOT+path.sep))return json(404,{});
 try{const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);}catch{return json(404,{});}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 // Playwright WebKit's setOffline kills SW responses before they run (#42775).
 const engine=process.env.OFFLINE_BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push({message:e.message,offline:!networkAvailable}));
  // Keep metadata outside the document so an offline reload cannot erase the
  // controller/cache evidence or the worker's cleanup/lifecycle messages.
  let phase='online';const workerEvents=[],failedRequests=[];
  page.on('requestfailed',request=>{if(failedRequests.length<100)failedRequests.push({phase,url:request.url(),method:request.method(),error:request.failure()?.errorText});});
  await page.exposeFunction('__recordOfflineWorkerEvent',event=>{if(workerEvents.length<100)workerEvents.push({phase,...event});});
  await page.addInitScript(()=>{
   const worker=value=>value?{scriptURL:value.scriptURL,state:value.state}:null;
   const emit=event=>{void window.__recordOfflineWorkerEvent(event).catch(()=>null);};
   emit({type:'document-start',url:location.href,controller:worker(navigator.serviceWorker.controller)});
   navigator.serviceWorker.addEventListener('controllerchange',()=>emit({type:'controllerchange',controller:worker(navigator.serviceWorker.controller)}));
   navigator.serviceWorker.addEventListener('message',event=>{
    if(!String(event.data?.type||'').startsWith('MEDINDEX_'))return;
    const message={};
    for(const key of ['type','state','cached','pages','savedAt','preparing','storageFull','path','cacheEpoch','version'])if(event.data[key]!==undefined)message[key]=event.data[key];
    emit({type:'worker-message',worker:worker(event.source),message});
   });
  });
  await page.goto(base+'/index.html');
  await expect(page.locator('#registryList')).toContainText(row.tradeName);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await expect.poll(()=>page.evaluate(async()=>{const c=await caches.open('medindex-private-device-v1');return(await c.keys()).some(k=>k.url.includes('view=registry-page'));}),{timeout:10000}).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>{const cache=await caches.open('medindex-static-device-v1');return !!await cache.match(location.origin+'/sidebar-taxonomy-core-v3.js?v=sidebar-taxonomy-v7-focus-20261009');}),{timeout:10000}).toBe(true).catch(async error=>{console.log(JSON.stringify(await page.evaluate(async()=>await Promise.all((await caches.keys()).map(async name=>({name,keys:(await(await caches.open(name)).keys()).map(k=>k.url)})))),null,2));throw error;});
  const query=await page.evaluate(async()=>{const c=await caches.open('medindex-private-device-v1');return(await c.keys()).find(k=>k.url.includes('view=registry-page')).url;});
  const registryReads=()=>[...reads].filter(([key])=>key.startsWith('/api/drug-search?')&&key.includes('view=registry-page')).reduce((sum,[,value])=>sum+value,0);
  const before=registryReads();
  delay=3000;
  const timing=await page.evaluate(async url=>{const start=performance.now();const response=await fetch(url);return{ms:performance.now()-start,cache:response.headers.get('X-MedIndex-Cache'),body:await response.json()};},query);
  assert.ok(timing.ms<500,`saved results should be instant on a slow link: ${timing.ms}`);
  assert.equal(timing.cache,'query-local-hit');assert.equal(timing.body.rows[0].id,row.id);
  assert.equal(registryReads(),before,'fresh local results must not re-download');delay=0;
  await page.screenshot({path:'/tmp/mobile-app-first-screen.png'});

  await page.locator('#refreshButton').click();
  await expect.poll(()=>registryReads()).toBeGreaterThan(before);
  await page.locator('#registryList [data-open-row]').first().click();
  await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
  await expect.poll(()=>page.evaluate(async()=>{const c=await caches.open('medindex-private-device-v1');return(await c.keys()).some(key=>key.url.includes('view=registry-detail'));})).toBe(true);
  await page.locator('#drawerClose').click();
  await expect(page.locator('#drxDeviceStatus')).toContainText('Ruajtur');
  const beforeOffline=await offlineState(page);phase='offline-reload';
  networkAvailable=false;if(engine===chromium)await context.setOffline(true);await page.reload();
  await expect(page.locator('#registryList')).toContainText(row.tradeName).catch(async error=>{
   console.log('Offline startup diagnostics',JSON.stringify({errors,reads:[...reads],beforeOffline,afterOffline:await offlineState(page),workerEvents,failedRequests,page:await page.evaluate(()=>({
    scripts:[...document.scripts].map(script=>script.src),body:document.body.innerText.slice(0,1600)
   }))},null,2));throw error;
  });
  await expect(page.locator('#drxDeviceStatus')).toContainText('Pa internet');
  await expect(page.locator('#syncText')).toContainText('Kopje lokale');
  const detail=await page.evaluate(async id=>{const r=await fetch('/api/drug-search?view=registry-detail&id='+id);return{status:r.status,cache:r.headers.get('X-MedIndex-Cache'),row:(await r.json()).row};},row.id);
  assert.equal(detail.status,200);assert.equal(detail.row.id,row.id);assert.equal(detail.cache,'query-local-hit');
  await page.locator('#registryList [data-open-row]').first().click();await expect(page.locator('#detailDrawer')).toContainText(row.tradeName);await page.locator('#drawerClose').click();
  await page.locator('#drxDeviceStatus').click();await expect(page.locator('#drxDevicePanel')).toBeVisible();await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const savedResponse=await page.evaluate(async url=>(await fetch(url)).status,query);assert.equal(savedResponse,200);
  const unknown=await page.evaluate(async()=>{const r=await fetch('/api/drug-search?view=registry-detail&id=never-downloaded');return{status:r.status,body:await r.json()};});
  assert.equal(unknown.status,503);assert.equal(unknown.body.offline,true);
  networkAvailable=true;if(engine===chromium)await context.setOffline(false);authStatus=403;
  assert.equal(await page.evaluate(async()=> (await fetch('/api/auth')).status),403);
  assert.equal(await page.evaluate(async()=> (await(await caches.open('medindex-private-device-v1')).keys()).length),0,'revocation clears saved clinical reads');
  authStatus=200;await page.reload();await expect(page.locator('#registryList')).toContainText(row.tradeName);
  // Explicit logout clears data and the offline session. Failed online auth is
  // never turned into an authenticated cached response.
  await page.evaluate(()=>fetch('/api/auth',{method:'DELETE'}));
  assert.equal(await page.evaluate(async()=> (await(await caches.open('medindex-auth-device-v1')).keys()).length),0);
  networkAvailable=false;if(engine===chromium)await context.setOffline(true);
  assert.equal(await page.evaluate(async()=>{try{await fetch('/api/auth');return'authenticated';}catch{return'offline-no-session';}}),'offline-no-session');
  // WebKit reports deliberately rejected network-only auth requests as
  // page errors even when fetch rejection is caught. Keep online/runtime and
  // asset errors strict; allow only these known errors during disconnection.
  const unexpected=errors.filter(error=>!(engine===webkit && error.offline && (
    /^(?:TypeError: Load failed|Response served by service worker is an error|Cannot load \.)$/.test(error.message) ||
    /(?:https?:\/\/|\/)?127\.0\.0\.1:\d+\/api\/auth(?:\?scope=ui-preferences)?\.?$/.test(error.message)
  )));
  assert.deepEqual(unexpected,[]);
  console.log(`PASS ${process.env.OFFLINE_BROWSER||'chromium'}: first-download persistence, <500ms slow-link cache, no duplicate downloads, explicit refresh, offline reload/detail, unknown-data state, revocation and logout.`);
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
