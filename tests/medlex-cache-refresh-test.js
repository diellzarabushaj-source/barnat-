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
  let offline=false,status=200;
  const savedPages=new Map();
  const cache={
    match:async request=>savedPages.get(request.url)?.clone(),
    put:async (request, page)=>{savedPages.set(request.url,page.clone());},
  };
  const context=vm.createContext({URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,console,
    self:{location:{origin},addEventListener(){},clients:{matchAll:async()=>[]}},
    caches:{open:async()=>cache},
    fetch:async request=>{
      if(offline)throw Error('offline');
      const page=new Response(status===200?'current workspace':'session expired',{status,headers:{'Content-Type':'text/html'}});
      Object.defineProperty(page,'url',{value:request.url});
      return page;
    }});
  vm.runInContext(source,context);
  if(file==='sw.js') vm.runInContext('authSnapshot = async function(){return {owner:"test"};}',context);
  const navigate=vm.runInContext('navigationResponse',context);
  for(const pathname of ['/medlex.html','/index.html','/klasifikimi.html','/icd.html','/librat-mjekesore.html','/recetat.html']){
    const url=new URL(pathname,origin);
    savedPages.set(url.href,response('previous workspace',url.href));
    const event={request:new Request(url.href+'?filter=active'),waitUntil(p){p.catch(()=>{});}};
    const fresh=await navigate(event,new URL(event.request.url));
    assert.equal(await fresh.text(),'current workspace',file+pathname+': online navigation shows the current release.');

    status=403;
    assert.equal((await navigate(event,new URL(event.request.url))).status,403,file+pathname+': a live denial must take precedence over cached HTML.');
    status=200;

    offline=true;
    const saved=await navigate(event,new URL(event.request.url));
    assert.equal(await saved.text(),'current workspace',file+pathname+': offline navigation uses the last successfully saved release.');
    offline=false;
  }
}
(async()=>{await check('sw.js');await check('sw-resilient.js');console.log('Workspace navigation: first online load is fresh, live denial takes precedence and offline uses the last saved copy.');})().catch(error=>{console.error(error);process.exitCode=1;});
