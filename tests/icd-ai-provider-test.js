'use strict';
const assert=require('node:assert/strict');
const P=require('../lib/icd-ai-provider'),D=require('../lib/icd-description-search');
const dataset=require('../lib/icd-hierarchy-snapshot').load().data;
const options={apiKey:'synthetic-gemini',prompt:'PRIVATE_SENTINEL',systemInstruction:'Synthetic instructions',schema:D.schema,thinkingLevel:'low',endpointTimeoutMs:1000};
async function main(){
 const env={key:process.env.GROQ_API_KEY,flag:process.env.ICD_GROQ_FALLBACK_ENABLED,gemini:process.env.GEMINI_API_KEY,key1:process.env.GEMINI_API_KEY1,key2:process.env.GEMINI_API_KEY2},originalFetch=global.fetch,originalError=console.error;
 delete process.env.GEMINI_API_KEY1;delete process.env.GEMINI_API_KEY2;
 process.env.GROQ_API_KEY='synthetic-groq';process.env.ICD_GROQ_FALLBACK_ENABLED='true';
 let g=0,r=0;const quota=()=>Object.assign(new Error('quota'),{status:429,code:'GEMINI_RATE_LIMIT',retryAfter:60});
 const gemini=async input=>{g++;assert.equal(input.stopOnCapacity,true);throw quota();},groq=async()=>{r++;return {data:{clarification:'synthetic',candidates:[]}};};
 try{
  P._test.reset();const a=await P.structuredJson(options,{allowGroq:true,gemini,groq});assert.equal(a.provider,'groq');
  await P.structuredJson(options,{allowGroq:true,gemini,groq});assert.equal(g,1,'Cooldown avoids repeated quota calls');assert.equal(r,2);
  P._test.reset();r=0;await assert.rejects(()=>P.structuredJson(options,{allowGroq:false,gemini:async()=>{throw quota();},groq}),error=>error.status===429);assert.equal(r,0,'Old clients cannot transmit to Groq without the new consent');
  await assert.rejects(()=>P.structuredJson(options,{allowGroq:false,gemini:async()=>{throw Object.assign(new Error('auth'),{status:403});},groq}),error=>error.status===403);assert.equal(r,0,'Without recipient consent, credential errors never transmit to Groq');
  const parent=new AbortController();parent.abort();await assert.rejects(()=>P.structuredJson({...options,signal:parent.signal},{allowGroq:true,gemini:async()=>{throw parent.signal.reason;},groq}));assert.equal(r,0);
  const strict=P.strictSchema(D.schema);assert.equal(strict.additionalProperties,false);assert.equal(strict.properties.candidates.items.additionalProperties,false);
  let requests=[];console.error=()=>{};P._test.reset();
  global.fetch=async(url,input)=>{
   requests.push(url);
   if(url.includes('googleapis.com'))return {ok:false,status:503,json:async()=>({error:{message:'Synthetic capacity error'}}),headers:{get:()=>null}};
   assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(input.headers.Authorization,'Bearer synthetic-groq');
   const body=JSON.parse(input.body);assert.equal(body.model,P.GROQ_MODEL);assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.max_completion_tokens,1800);assert.ok(!('tools' in body));
   return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({clarification:'Ku lokalizohet?',candidates:[{code:'R10.4',titleEn:'Other and unspecified abdominal pain',evidence:'dhimbje ne regjionin retroperitoneal',kind:'symptom',reason:'Kodi i simptomës'}]})}}]})};
  };
  const response=await P.structuredJson(options,{allowGroq:true});assert.equal(response.provider,'groq');assert.equal(requests.length,2,'One capacity error goes directly to the reserve, not another endpoint');assert.equal(D.validate(response.data,dataset).rows[0].code,'R10.4');
  await assert.rejects(()=>P.groqJson(options,async()=>({ok:false,status:429,headers:{get:()=> '17'},json:async()=>({error:{message:'PRIVATE_SENTINEL'}})})),error=>error.status===429&&error.retryAfter===17&&!error.message.includes('PRIVATE_SENTINEL'));
  await assert.rejects(()=>P.groqJson(options,async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{"partial":'}}]})})),error=>error.code==='AI_OUTPUT_INVALID');
  assert.equal(P._test.capacity(Object.assign(new Error(),{name:'TimeoutError',code:23})),true);
  process.env.GEMINI_API_KEY='synthetic-gemini';D.cache.clear();let generated=0;
  const input={dataset,query:'dhimbje ne regjionin retroperitoneal',actor:'synthetic-owner',generate:async()=>{generated++;return {provider:'groq',data:{clarification:'Ku lokalizohet?',candidates:[{code:'R10.4',titleEn:'Other and unspecified abdominal pain',evidence:'dhimbje ne regjionin retroperitoneal',kind:'symptom',reason:'Kodi i simptomës'}]}};}};
  const fresh=await D.interpret({...input,allowGroq:true});assert.equal(fresh.provider,'groq');
  const cached=await D.interpret({...input,allowGroq:true});assert.equal(cached.cached,true);assert.equal(cached.provider,'groq');assert.equal(generated,1);
  await D.interpret({...input,allowGroq:false,generate:async()=>{generated++;return {provider:'gemini',data:{clarification:'Ku lokalizohet?',candidates:[]}};}});
  assert.equal(generated,2,'Clients without Groq consent never reuse a Groq-capable cache entry');
  process.env.GEMINI_API_KEY1='synthetic-key1';process.env.GEMINI_API_KEY2='synthetic-key2';P._test.reset();let order=[];r=0;
  const available=async input=>{order.push(input.apiKey);if(input.apiKey==='synthetic-key2')return {data:{candidates:[]}};throw quota();};
  assert.equal((await P.structuredJson(options,{allowGroq:true,gemini:available,groq})).provider,'gemini');assert.deepEqual(order,['synthetic-gemini','synthetic-key1','synthetic-key2']);assert.equal(r,0,'A working Gemini credential is preferred to Groq');
  order=[];await P.structuredJson(options,{allowGroq:true,gemini:available,groq});assert.deepEqual(order,['synthetic-key2'],'Cooling-down credentials are skipped');
  P._test.reset();order=[];
  const denied=async input=>{order.push(input.apiKey);throw input.apiKey==='synthetic-gemini'?quota():Object.assign(new Error('upstream credential unavailable'),{status:input.apiKey==='synthetic-key1'?402:403});};
  assert.equal((await P.structuredJson(options,{allowGroq:true,gemini:denied,groq})).provider,'groq');assert.deepEqual(order,['synthetic-gemini','synthetic-key1','synthetic-key2'],'Quota, payment-required and denied credentials are skipped without upgrading or changing access');
  P._test.reset();r=0;
  P._test.reset();order=[];const exhausted=async input=>{order.push(input.apiKey);throw quota();};
  assert.equal((await P.structuredJson(options,{allowGroq:true,gemini:exhausted,groq})).provider,'groq');assert.deepEqual(order,['synthetic-gemini','synthetic-key1','synthetic-key2']);assert.equal(r,1);
  P._test.reset();process.env.GEMINI_API_KEY1=options.apiKey;process.env.GEMINI_API_KEY2=options.apiKey;order=[];
  await P.structuredJson(options,{allowGroq:true,gemini:exhausted,groq});assert.equal(order.length,1,'Duplicate credentials are never retried');
  delete process.env.GEMINI_API_KEY1;delete process.env.GEMINI_API_KEY2;P._test.reset();
  process.env.ICD_GROQ_FALLBACK_ENABLED='false';r=0;await assert.rejects(()=>P.structuredJson(options,{allowGroq:true,gemini:async()=>{throw quota();},groq}),error=>error.status===429);assert.equal(r,0,'Disabled configuration never calls Groq');
 }finally{global.fetch=originalFetch;console.error=originalError;P._test.reset();D.cache.clear();for(const [name,value] of Object.entries({GROQ_API_KEY:env.key,ICD_GROQ_FALLBACK_ENABLED:env.flag,GEMINI_API_KEY:env.gemini,GEMINI_API_KEY1:env.key1,GEMINI_API_KEY2:env.key2})){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
 console.log('ICD AI routing: explicit recipient consent, bounded quota/capacity fallback, cooldown, strict JSON, canonical validation, secret-safe errors and cancellation passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
