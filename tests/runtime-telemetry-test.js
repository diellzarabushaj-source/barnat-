'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Telemetry = require('../lib/runtime-telemetry.js');
for (const page of ['index','klasifikimi','icd','dozologjia','protokollet','urgjencat','recetat','analizat','medical-hub','sistemi']) {
  const html=fs.readFileSync(path.resolve(__dirname,'..',page+'.html'),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
  assert.equal(scripts.filter(match=>match[1].includes('drx-runtime-telemetry.js')).length,1,`${page}: one shared observer`);
  assert.match(scripts[0][0],/type="module"[^>]*src="\/drx-runtime-telemetry\.js/,`${page}: observe before auth ready`);
}
const offlineShell=fs.readFileSync(path.resolve(__dirname,'../sw-resilient-v3.js'),'utf8');
assert.ok(offlineShell.includes('/drx-runtime-telemetry.js?v=20261009-rum-v1'));
assert.ok(offlineShell.includes('/vendor/web-vitals.js?v=6.2.3'),'the module import must also work offline');
const T = Telemetry._test;
const UUID = '12345678-1234-4123-8123-123456789abc';
const base = () => ({ version:1,module:'registry',device:'mobile',release:Telemetry.RELEASE,events:[{ id:UUID,name:'LCP',value:2500,revision:1 }] });
const response = () => ({ headers:{},setHeader(key,value){ this.headers[key] = value; },status(code){ this.statusCode = code; return this; },json(body){ this.body = body; return this; },end(){ return this; } });
const request = body => ({ method:'POST',headers:{ host:'barnat.example',origin:'https://barnat.example','content-type':'application/json','x-csrf-token':'synthetic-csrf' },body:body || base() });
const session = { provider:'supabase-password',authUid:UUID };
const auth = { sessionFromRequest:() => 'signed',sessionData:() => session,verifyCsrfToken:(_,token) => token === 'synthetic-csrf' };

function browser(options = {}) {
  const events = new Map(); const documentEvents = new Map(); const timers = new Map(); const callbacks = {}; const sent = [];
  let sequence = 0; let clock = 0;
  const window = { innerWidth:390,crypto:{ randomUUID:() => `12345678-1234-4123-8123-${String(++sequence).padStart(12,'0')}`,getRandomValues(array){ array[0] = options.sample || 0; return array; } },addEventListener(name,callback){ if (!events.has(name)) events.set(name,[]); events.get(name).push(callback); },MEDINDEX_AUTH_READY:Promise.resolve(options.auth === false ? {} : { authenticated:true,supabaseAuthenticated:true,offline:false,csrfToken:'synthetic-csrf',authUser:{ status:'active' } }) };
  const document = { visibilityState:'visible',addEventListener(name,callback){ documentEvents.set(name,callback); } };
  const navigator = { onLine:true,doNotTrack:options.dnt,globalPrivacyControl:options.gpc };
  const source = fs.readFileSync(path.resolve(__dirname,'../drx-runtime-telemetry.js'),'utf8').replace(/^import[^\n]+\n/,'');
  const context = { window,document,navigator,location:{ pathname:'/index.html',get search(){ throw new Error('Must not read clinical query.'); },get href(){ throw new Error('Must not read full URL.'); } },Uint32Array,Map,Set,Object,String,Number,Promise,Math,queueMicrotask,
    Date:class extends Date { static now(){ return clock; } },setTimeout(callback){ const id = ++sequence; timers.set(id,callback); return id; },clearTimeout(id){ timers.delete(id); },
    fetch:async (url,config) => { assert.equal(url,'/api/auth?scope=telemetry'); sent.push({ config,body:JSON.parse(config.body) }); return options.transport ? options.transport(sent.length) : { status:204 }; },
    onLCP(callback){ callbacks.LCP = callback; },onINP(callback){ callbacks.INP = callback; },onCLS(callback){ callbacks.CLS = callback; },
  };
  vm.runInNewContext(source,context);
  return { window,document,navigator,events,timers,callbacks,sent,setClock(value){ clock = value; },fire(name,event = {}){ for (const callback of events.get(name) || []) callback(event); },hide(){ document.visibilityState = 'hidden'; documentEvents.get('visibilitychange')?.(); },runTimer(){ const item = [...timers.entries()][0]; if (item) { timers.delete(item[0]); item[1](); } } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  process.env.SESSION_SECRET = 'synthetic-runtime-telemetry-secret-123456789';
  process.env.MEDINDEX_RUNTIME_TELEMETRY = '1';
  const validated = T.validatePayload(base());
  const privateBody = T.privatePayload(validated);
  assert.match(privateBody.events[0].id,/^[a-f\d]{64}$/);
  assert.equal(privateBody.events[0].revision,1);
  assert.ok(!JSON.stringify(privateBody).includes(UUID));
  assert.notEqual(T.privatePayload({ ...validated,events:[{ ...validated.events[0],name:'INP' }] }).events[0].id,privateBody.events[0].id);
  process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
  assert.equal(T.privatePayload(validated).release,'a'.repeat(40));
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  for (const change of [b => b.url = '?patient=secret',b => b.email = 'doctor@example.test',b => b.module = 'patient',b => b.release = 'b'.repeat(40),b => b.events[0].stack = 'private',b => b.events[0].value = Infinity,b => b.events[0].value = -1,b => b.events[0].revision = 0,b => b.events[0].revision = 1001,b => b.events[0].name = 'QUERY',b => b.events.push({ ...b.events[0] }),b => b.events = Array(13).fill(b.events[0])]) {
    const candidate = base(); change(candidate); assert.throws(() => T.validatePayload(candidate),/TELEMETRY_INVALID/);
  }
  assert.throws(() => T.validatePayload({ ...base(),events:[{ id:UUID,name:'NAV',value:0,revision:1 }] }),/TELEMETRY_INVALID/);
  assert.equal(T.validatePayload({ ...base(),events:[{ id:UUID,name:'CLS',value:.123456,revision:1 }] }).events[0].value,.1235);
  assert.equal(T.sameOrigin(request()),true);
  assert.equal(T.sameOrigin({ headers:{ host:'barnat.example' } }),false);
  assert.equal(T.sameOrigin({ headers:{ host:'barnat.example',origin:'https://evil.example' } }),false);
  assert.equal(T.sameOrigin({ headers:{ host:'barnat.example',origin:'http://barnat.example' } }),false);
  await assert.rejects(T.readBody({ headers:{},body:'a'.repeat(8193) }),/TELEMETRY_TOO_LARGE/);
  await assert.rejects(T.readBody({ headers:{},body:'{' }),/TELEMETRY_INVALID/);
  let stored = 0; let profiles = 0; let budgetCalls = 0; let active = true;
  const deps = { auth,consume:async (scope,subject,limit,seconds) => { budgetCalls += 1; assert.equal(scope,'runtime-telemetry'); assert.equal(subject,UUID); assert.equal(limit,12); assert.equal(seconds,60); return { allowed:true }; },request:async (route,config) => {
    assert.equal(config.privileged,true);
    if (route.startsWith('profiles?')) { profiles += 1; return { data:[{ id:UUID,role:'doctor',status:active ? 'active' : 'suspended' }] }; }
    assert.equal(route,'rpc/drx_record_runtime_telemetry_v1'); stored += 1;
    assert.deepEqual(Object.keys(config.body),['p_payload']);
    assert.ok(!JSON.stringify(config.body).includes(UUID));
    return { data:{ accepted:1 } };
  } };
  const good = response(); await Telemetry.ingest(request(),good,deps); assert.equal(good.statusCode,204); assert.equal(stored,1);
  delete process.env.MEDINDEX_RUNTIME_TELEMETRY;
  const disabledCapture = response(); await Telemetry.ingest(request(),disabledCapture,deps); assert.equal(disabledCapture.statusCode,503); assert.equal(disabledCapture.body.code,'TELEMETRY_DISABLED'); assert.equal(stored,1);
  process.env.MEDINDEX_RUNTIME_TELEMETRY = '1';
  active = false; const revoked = response(); await Telemetry.ingest(request(),revoked,deps); assert.equal(revoked.statusCode,403); assert.equal(stored,1);
  active = true;
  const badCsrf = request(); badCsrf.headers['x-csrf-token'] = 'forged'; const csrfResult = response(); await Telemetry.ingest(badCsrf,csrfResult,deps); assert.equal(csrfResult.statusCode,403); assert.equal(profiles,2);
  const unauthenticated = response(); await Telemetry.ingest(request(),unauthenticated,{ ...deps,auth:{ ...auth,sessionData:() => null } }); assert.equal(unauthenticated.statusCode,401);
  const rollback = response(); await Telemetry.ingest(request(),rollback,{ ...deps,auth:{ ...auth,sessionData:() => ({ ...session,provider:'legacy-password' }) } }); assert.equal(rollback.statusCode,403);
  const limited = response(); await Telemetry.ingest(request(),limited,{ ...deps,consume:async () => ({ allowed:false,resetSeconds:60 }) }); assert.equal(limited.statusCode,429); assert.equal(limited.headers['Retry-After'],'60');
  const unavailable = response(); await Telemetry.ingest(request(),unavailable,{ ...deps,consume:async () => { throw new Error('private credentials'); } }); assert.equal(unavailable.statusCode,503); assert.ok(!JSON.stringify(unavailable.body).includes('private credentials'));
  assert.equal(stored,1); assert.equal(budgetCalls,1);
  const aggregate = metric => ({ module:'registry',device:'mobile',release:Telemetry.RELEASE,metric,count:20,buckets:[{ upper:metric === 'LCP' ? 2500 : 1,count:20 }] });
  const summarized = T.summarize({ available:true,windowHours:24,groups:[aggregate('NAV'),aggregate('LCP')] });
  assert.equal(summarized.cohorts[0].metrics.LCP.p75Upper,2500);
  assert.equal(summarized.cohorts[0].metrics.INP.p75Upper,null);
  assert.equal(summarized.cohorts[0].metrics.INP.state,'unavailable');
  assert.equal(summarized.cohorts[0].state,'partial-data');
  const alarm = T.summarize({ available:true,windowHours:24,groups:[aggregate('NAV'),{ ...aggregate('RUNTIME_ERROR'),count:3,buckets:[{ upper:1,count:3 }] }] });
  assert.equal(alarm.cohorts[0].errors.RUNTIME_ERROR.alarm,true);
  assert.equal(alarm.cohorts[0].state,'warning');
  assert.equal(T.percentileUpper([{ upper:2500,count:19 }],19),null);
  assert.throws(() => T.summarize({ available:true,windowHours:24,groups:[{ ...aggregate('LCP'),count:19 }] }),/TELEMETRY_UNAVAILABLE/);
  const denied = response(); let summaryReads = 0;
  await Telemetry.readSummary({ method:'GET' },denied,{ requireAdmin:async () => { const error = new Error('private'); error.status = 403; throw error; },request:async () => { summaryReads += 1; } });
  assert.equal(denied.statusCode,403); assert.equal(summaryReads,0);

  for (const privacy of [{ dnt:'1' },{ gpc:true },{ sample:4294967295 }]) {
    const disabled = browser(privacy); await settle(); disabled.hide(); await settle(); assert.equal(disabled.sent.length,0); assert.deepEqual(disabled.callbacks,{});
  }
  const client = browser(); await settle();
  const metric = { name:'LCP',id:'library-ID-never-forwarded',value:1200,get entries(){ throw new Error('Must not read source element.'); },get attribution(){ throw new Error('Must not read clinical attribution.'); } };
  client.callbacks.LCP(metric); client.callbacks.LCP({ name:'LCP',id:metric.id,value:2200 });
  client.fire('error',{ target:client.window,get message(){ throw new Error('Must not read message.'); } });
  client.fire('unhandledrejection',{ get reason(){ throw new Error('Must not read rejection reason.'); } });
  client.hide(); await settle();
  assert.equal(client.sent.length,1);
  const payload = client.sent[0].body;
  assert.deepEqual(Object.keys(payload),['version','module','device','release','events']);
  assert.equal(payload.events.filter(event => event.name === 'LCP').length,1);
  assert.equal(payload.events.find(event => event.name === 'LCP').value,2200);
  assert.equal(payload.events.find(event => event.name === 'LCP').revision,2);
  assert.equal(payload.events.filter(event => event.name === 'RUNTIME_ERROR').length,1);
  assert.ok(!JSON.stringify(payload).includes('library-ID'));
  assert.equal(client.sent[0].config.keepalive,true);
  assert.equal(client.sent[0].config.headers['X-CSRF-Token'],'synthetic-csrf');
  assert.ok(!payload.events.some(event => event.name === 'INP' || event.name === 'CLS'));
  const firstId = payload.events.find(event => event.name === 'LCP').id;
  client.callbacks.LCP({ name:'LCP',id:metric.id,value:3100 }); client.hide(); await settle();
  assert.equal(client.sent[1].body.events.find(event => event.name === 'LCP').id,firstId);
  assert.equal(client.sent[1].body.events.find(event => event.name === 'LCP').revision,3);
  client.fire('pageshow',{ persisted:true }); client.callbacks.LCP({ name:'LCP',id:'new-BFCache-metric',value:500 }); client.hide(); await settle();
  assert.notEqual(client.sent[2].body.events.find(event => event.name === 'LCP').id,firstId);
  assert.equal(client.sent[2].body.events.find(event => event.name === 'LCP').revision,1);
  assert.equal(client.sent[2].body.events.filter(event => event.name === 'NAV').length,1);
  client.fire('medindex:auth-failed'); client.callbacks.INP({ name:'INP',id:'after-logout',value:50 }); client.hide(); await settle(); assert.equal(client.sent.length,3);
  let complete;
  const inflight = browser({ transport:count => count === 1 ? new Promise(resolve => { complete = resolve; }) : { status:204 } }); await settle();
  inflight.callbacks.INP({ name:'INP',id:'real-interaction',value:100 }); inflight.hide(); await settle();
  inflight.callbacks.INP({ name:'INP',id:'real-interaction',value:300 });
  complete({ status:204 }); await settle(); await settle();
  assert.equal(inflight.sent.length,2);
  assert.equal(inflight.sent[1].body.events[0].value,300);
  assert.equal(inflight.sent[1].body.events[0].revision,2);
  const unauth = browser({ auth:false }); await settle(); unauth.callbacks.LCP({ name:'LCP',id:'metric',value:1000 }); unauth.hide(); await settle(); assert.equal(unauth.sent.length,0);
  const offline = browser(); await settle(); offline.navigator.onLine = false; offline.hide(); await settle(); assert.equal(offline.sent.length,0);
  const provenance = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../vendor/web-vitals.provenance.json'),'utf8'));
  assert.equal(provenance.version,'6.2.3');
  console.log('Runtime telemetry privacy, live profile/CSRF authorization, bounded delivery, dedup revisions, missing metrics and histogram alarms passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
