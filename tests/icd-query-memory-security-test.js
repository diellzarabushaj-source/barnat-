'use strict';
const assert=require('node:assert/strict');
process.env.SESSION_SECRET='icd-memory-test-session-secret-with-more-than-32-characters';
const handler=require('../lib/icd-intelligence-handler');
const Source=require('../lib/icd-public-source');
const Memory=require('../lib/icd-query-memory');
const Description=require('../lib/icd-description-search');
const Admin=require('../lib/admin-access');
const Budget=require('../lib/shared-request-budget');
const dataset=require('../lib/icd-hierarchy-snapshot').load().data;
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function main(){
 const auth=await import('../lib/auth.mjs');
 const originals={load:Source.load,submit:Memory.submit,admin:Admin.requireAdminSession,enforce:Budget.enforce,interpret:Description.interpret};
 let loads=0,submission,adminChecks=0;
 Source.load=async()=>{loads++;return {data:dataset};};
 Memory.submit=async input=>{submission=input;return {id:'synthetic',status:'personal'};};
 Admin.requireAdminSession=async()=>{adminChecks++;throw Object.assign(new Error('administrator required'),{status:403});};
 Budget.enforce=async()=>true;
 const token=provider=>auth.createSessionToken({uid:OWNER,authUid:OWNER,email:'doctor@example.test',provider,authRole:'doctor',authStatus:'active'});
 const csrf=auth.createCsrfToken();
 async function call(changes={}){
  const req={method:'POST',query:{icdMemory:'1'},headers:{cookie:`medindex_session=${token('supabase-google')}; medindex_csrf=${csrf}`,'x-csrf-token':csrf,host:'example.test',origin:'https://example.test'},body:{action:'remember',expression:'pom dhemb gjoksi',code:'R07.4',termOnly:true},...changes};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
  await handler(req,res);assert.equal(res.headers['Cache-Control'],'private, no-store, max-age=0');return res;
 }
 try{
  assert.equal((await call({headers:{}})).statusCode,401);
  assert.equal((await call({method:'DELETE'})).statusCode,405);
  const headers={cookie:`medindex_session=${token('supabase-google')}; medindex_csrf=${csrf}`,'x-csrf-token':csrf,host:'example.test',origin:'https://example.test'};
  const expired=await call({headers:{...headers,'x-csrf-token':'wrong'}});assert.equal(expired.statusCode,403);assert.equal(expired.body.code,'ICD_CSRF_EXPIRED');
  assert.equal((await call({headers:{...headers,origin:'https://attacker.example'}})).statusCode,403);
  assert.equal((await call({headers:{...headers,origin:'not a URL'}})).statusCode,403);
  assert.equal((await call({headers:{...headers,cookie:`medindex_session=${token('legacy-password')}; medindex_csrf=${csrf}`}})).statusCode,403);
  assert.equal((await call({body:{value:'x'.repeat(5000)}})).statusCode,413);
  assert.equal(loads,0,'Rejected mutations never load the catalog');
  const ownCache=OWNER+'|'+Memory.VERSION+'|pom dhemb gjoksi',otherCache='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb|'+Memory.VERSION+'|pom dhemb gjoksi';
  handler._test.answers.set(ownCache,{until:Date.now()+60000,promise:Promise.resolve({rows:[],ambiguous:true})});handler._test.answers.set(otherCache,{until:Date.now()+60000,promise:Promise.resolve({rows:[],ambiguous:true})});
  const saved=await call({body:{action:'remember',expression:'pom dhemb gjoksi',code:'R07.4',termOnly:true,actor:'forged',status:'verified'}});
  assert.equal(saved.statusCode,200);assert.equal(submission.actor,OWNER);assert.equal(submission.scope,'personal');assert.ok(!('status' in submission));
  assert.equal(handler._test.answers.has(ownCache),false,'Saving a meaning invalidates the earlier answer for this owner/expression');assert.equal(handler._test.answers.has(otherCache),true,'Saving personal terminology leaves other owners caches untouched');
  assert.equal((await call({body:{action:'remember',termOnly:false}})).statusCode,400);
  let interpreted;Description.interpret=async input=>{interpreted=input;return {rows:[],aiUsed:true,ambiguous:true,descriptionAnalysis:{clarification:'Ku lokalizohet dhimbja?'}};};
  const clarification=[{question:'Ku ndodhet dhimbja?',answer:'Në bark.'}];
  const analysis=await call({body:{action:'interpret',expression:'dhimbje ne regjionin retroperitoneal',termOnly:true,groqFallback:true,clarifications:clarification,actor:'forged',status:'verified'}});
  assert.equal(analysis.statusCode,200);assert.equal(interpreted.actor,OWNER);assert.equal(interpreted.allowGroq,true);assert.equal(analysis.body.aiUsed,true);assert.ok(!('status' in interpreted));
  assert.deepEqual(interpreted.clarifications,clarification,'Authenticated interpretation carries bounded Q/A context to its validator');
  interpreted=null;assert.equal((await call({body:{action:'interpret',termOnly:false}})).statusCode,400);assert.equal(interpreted,null,'Description analysis also requires explicit consent');
  assert.equal((await call({body:{action:'review',status:'verified'}})).statusCode,403);assert.equal(adminChecks,1,'Review rechecks live admin authority');
  assert.equal((await call({body:{action:'unknown',termOnly:true}})).statusCode,400);
  console.log('ICD memory endpoint: signed ownership, CSRF, origin, payload limits, legacy-write denial, explicit consent and fresh admin checks passed.');
 }finally{Source.load=originals.load;Memory.submit=originals.submit;Admin.requireAdminSession=originals.admin;Budget.enforce=originals.enforce;Description.interpret=originals.interpret;handler._test.answers.clear();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
