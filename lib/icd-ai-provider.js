'use strict';

// ICD description search only. Prescription generation retains its existing provider.
const Gemini=require('./gemini-prescription');
const GROQ_ENDPOINT='https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL='openai/gpt-oss-120b';
let geminiUntil=0,groqUntil=0;
const configured=()=>process.env.ICD_GROQ_FALLBACK_ENABLED==='true'&&Boolean(process.env.GROQ_API_KEY);
const retrySeconds=(value,fallback=30)=>{
 const numeric=Number(value),seconds=Number.isFinite(numeric)&&numeric>0?numeric:(Date.parse(value)-Date.now())/1000;
 return Math.max(1,Math.min(300,Math.ceil(Number.isFinite(seconds)&&seconds>0?seconds:fallback)));
};
const capacity=error=>[429,500,502,503,504].includes(Number(error.status))||error.code==='GEMINI_TIMEOUT'||['TimeoutError','TypeError'].includes(error.name);

function strictSchema(schema){
 if(!schema||typeof schema!=='object')return schema;
 const result={...schema};
 if(result.type==='object'){
  result.additionalProperties=false;
  result.properties=Object.fromEntries(Object.entries(result.properties||{}).map(([key,value])=>[key,strictSchema(value)]));
  result.required=Object.keys(result.properties);
 }
 if(result.type==='array')result.items=strictSchema(result.items);
 return result;
}

async function groqJson(options,request=fetch){
 const deadline=AbortSignal.timeout(15000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
 signal.throwIfAborted();
 const response=await request(GROQ_ENDPOINT,{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.GROQ_API_KEY},body:JSON.stringify({model:GROQ_MODEL,messages:[{role:'system',content:options.systemInstruction},{role:'user',content:options.prompt}],max_completion_tokens:1800,reasoning_effort:'low',stream:false,response_format:{type:'json_schema',json_schema:{name:'icd_description',strict:true,schema:strictSchema(options.schema)}}})});
 if(!response.ok){
  const status=Number(response.status)||502,retryAfter=retrySeconds(response.headers?.get?.('retry-after'));
  if(status===429)groqUntil=Date.now()+retryAfter*1000;
  throw Object.assign(new Error(status===429?`Groq ka arritur kufirin e përkohshëm. Provo pas ${retryAfter} sekondash.`:'Shërbimi rezervë nuk është i disponueshëm tani.'),{status,code:status===429?'GROQ_RATE_LIMIT':'GROQ_ERROR',retryAfter});
 }
 let payload;try{payload=await response.json();}catch(error){if(signal.aborted)throw signal.reason||error;throw Object.assign(new Error('Përgjigjja AI nuk ishte e vlefshme.'),{status:502,code:'AI_OUTPUT_INVALID'});}
 const choice=payload.choices?.[0],raw=choice?.message?.content;
 if(choice?.finish_reason!=='stop'||typeof raw!=='string'||raw.length>16000)throw Object.assign(new Error('Përgjigjja AI nuk ishte e plotë. Provo përsëri.'),{status:502,code:'AI_OUTPUT_INVALID'});
 let data;try{data=JSON.parse(raw);}catch{throw Object.assign(new Error('Përgjigjja AI nuk ishte e vlefshme.'),{status:502,code:'AI_OUTPUT_INVALID'});}
 return {data,provider:'groq',model:GROQ_MODEL};
}

async function structuredJson(options,{allowGroq=false,gemini=Gemini.structuredJson,groq=groqJson}={}){
 const reserve=allowGroq&&configured();
 let firstError;
 if(!reserve||Date.now()>=geminiUntil){
  try{
   const deadline=reserve?AbortSignal.timeout(18000):null;
   const signal=deadline?(options.signal?AbortSignal.any([options.signal,deadline]):deadline):options.signal;
   const result=await gemini({...options,signal,stopOnCapacity:reserve});
   return {...result,provider:'gemini'};
  }catch(error){
   if(options.signal?.aborted||!reserve||!capacity(error))throw error;
   firstError=error;
   geminiUntil=Date.now()+retrySeconds(error.retryAfter,error.status===429?60:15)*1000;
  }
 }
 options.signal?.throwIfAborted();
 if(Date.now()<groqUntil)throw Object.assign(new Error('Shërbimet AI kanë arritur kufirin e përkohshëm. Provo pas pak.'),{status:429,code:'AI_RATE_LIMIT',retryAfter:Math.ceil((groqUntil-Date.now())/1000)});
 try{return {...await groq(options),provider:'groq'};}
 catch(error){
  if(options.signal?.aborted)throw options.signal.reason||error;
  // Do not repeat, rotate credentials, or fall through to a paid service.
  if(error.status===429&&firstError?.status===429)error.message='Të dy shërbimet AI janë përkohësisht të kufizuara. Provo pas pak.';
  throw error;
 }
}
module.exports={structuredJson,configured,groqJson,strictSchema,GROQ_MODEL,_test:{retrySeconds,capacity,reset:()=>{geminiUntil=0;groqUntil=0;}}};
