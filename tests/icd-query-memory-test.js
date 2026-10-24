'use strict';
const assert=require('node:assert/strict');
const Memory=require('../lib/icd-query-memory');
const Intelligence=require('../lib/icd-intelligence-handler')._test;
const Advanced=require('../lib/icd-advanced-handler')._test;
const dataset=require('../lib/icd-hierarchy-snapshot').load().data;
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function main(){
 assert.equal(Memory.normalize('  DHIMBJE GJOKSI  '),'dhimbje gjoksi');
 assert.equal(Memory.safeExpression('pom dhemb gjoksi',dataset),'pom dhemb gjoksi');
 for(const input of ['Arben Krasniqi dhimbje gjoksi','pacienti 12345','email@example.com','01/02/2000','<script>','R07.4'])assert.equal(Memory.safeExpression(input,dataset),'',input);
 assert.equal(Memory.validMapping(dataset,'dhimbje gjoksi','I21'),null);
 assert.equal(Memory.validMapping(dataset,'probleme me unaza','M54')?.code,'M54','Existing curated symptom codes outside chapter R stay valid');
 assert.equal(Memory.validMapping(dataset,'dhimbje gjoksi','R07.89'),null);
 assert.equal(Memory.codeNode({...dataset,version:'ICD-10-CM 2026'},'R07.4'),null);
 assert.equal(Memory.validMapping(dataset,'hypertensio essentialis','I10','latin'),null,'Existing verified Latin is preserved');
 for(const q of ['dhimbje kraherori','dhimbje kraharori','pom dhemb gjoksi','dhimbje gjoksi','dolor thoracis','R07.4']){
  const result=Advanced.suggestionPayload(dataset,{q});assert.equal(result.rows[0].code,'R07.4',q);assert.equal(new Set(result.rows.map(row=>row.code)).size,result.rows.length);
  if(!q.startsWith('R'))assert.ok(result.rows.some(row=>row.searchMatch?.type==='symptom-differential'),'Differential guidance is retained');
 }
 let calls=[];
 await Memory.submit({dataset,expression:'pom dhemb gjoksi',code:'R07.4',actor:OWNER,scope:'personal'},async(path,options)=>{calls.push({path,options});return {data:{id:'synthetic',duplicate:false}};});
 assert.equal(calls[0].path,'rpc/icd_submit_query_memory_v1');assert.equal(calls[0].options.body.p_actor,OWNER);assert.equal(calls[0].options.body.p_scope,'personal');assert.ok(!('status' in calls[0].options.body));
 await assert.rejects(()=>Memory.submit({dataset,expression:'pom dhemb gjoksi',code:'I21',actor:OWNER}),/shprehje mjekësore/);
 const row={expression:'pom ne majte',code:'R07.4',kind:'alias',scope:'global',status:'verified',classification:Memory.VERSION};
 Memory.clearCache();let reads=0;
 const request=async path=>{reads++;return {data:path.includes('offset=0')?[row]:[]};};
 const [first,second]=await Promise.all([Memory.readAliases(dataset,'',request),Memory.readAliases(dataset,'',request)]);
 assert.deepEqual(first,second);assert.equal(reads,2,'One shared paginated load including terminal empty page');
 const hits=Memory.matchAliases(first,'POM NE MAJTE',dataset);assert.equal(hits[0].code,'R07.4');assert.equal(hits[0].memoryVerification,'verified');
 assert.equal(Memory.matchAliases(first,'pom ne majte',dataset,new Set(['I10'])).length,0,'Active filters are preserved');
 await Memory.readAliases(dataset,'',request);assert.equal(reads,2,'Warm alias reads do not query DB');
 const sourceLatin=Memory.codeNode(dataset,'I10').latinTitle;
 assert.equal(Memory.applyLatin(Memory.codeNode(dataset,'I10'),[{kind:'latin',code:'I10',verification:'verified',expression:'must not replace'}]).latinTitle,sourceLatin);
 const malicious=Memory.validateAi({intent:'symptom',candidates:[{code:'I21'},{code:'R07.89'},{code:'R07.4',englishTitle:'fabricated'},{code:'R07.4'}]},dataset,'dhimbje gjoksi');
 assert.deepEqual(malicious.candidates.map(item=>item.node.code),['R07.4']);assert.notEqual(malicious.candidates[0].node.englishTitle,'fabricated');assert.equal(malicious.candidates[0].verified,false);
 let noRequests=0;
 const known=Advanced.suggestionPayload(dataset,{q:'R07.4'});
 assert.equal(await Intelligence.enhance(dataset,{q:'R07.4'},known,OWNER,async()=>{noRequests++;throw Error('must not request');}),known);assert.equal(noRequests,0);
 const knownWord=Advanced.suggestionPayload(dataset,{q:'hipertension'});
 await Intelligence.enhance(dataset,{q:'hipertension'},knownWord,OWNER,async()=>{noRequests++;throw Error('must not request');});assert.equal(noRequests,0,'Known terminology avoids DB');
 Memory.clearCache();
 const ownRequest=async path=>({data:path.includes('offset=0')&&path.includes(OWNER)?[{...row,scope:'personal',status:'personal'}]:[]});
 assert.equal((await Memory.readAliases(dataset,OWNER,ownRequest)).length,1);assert.equal((await Memory.readAliases(dataset,OTHER,ownRequest)).length,0,'Personal terminology does not cross accounts');
 const beforeKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='synthetic-test-key';let generated=0,submitted=0;
 try{
  Memory.clearCache();Intelligence.answers.clear();
  const request=async(path,options)=>{if(path.startsWith('rpc/')){submitted++;return {data:{id:'synthetic',duplicate:false}};}return {data:[]};};
  const generate=async()=>{generated++;return {data:{intent:'symptom',candidates:[{code:'R07.4'},{code:'I21'},{code:'R07.89'}]}};};
  const query='pom ne majte djathte';
  const a=await Intelligence.resolve({dataset,query,actor:OWNER,request,generate});
  const b=await Intelligence.resolve({dataset,query,actor:OWNER,request,generate});
  assert.equal(generated,1);assert.equal(submitted,1);assert.deepEqual(a,b);assert.equal(a.rows[0].memoryVerification,'pending');
  Intelligence.answers.clear();
  await assert.rejects(()=>Intelligence.resolve({dataset,query,actor:OWNER,request,generate:async()=>{throw Object.assign(new Error('synthetic timeout'),{name:'AbortError'});}}),error=>error.name==='AbortError'&&error.memoryStage==='gemini');
  assert.equal(Intelligence.answers.size,0,'A failed assistance request does not poison the retry cache');
 }finally{if(beforeKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=beforeKey;Memory.clearCache();Intelligence.answers.clear();}
 console.log('ICD semantic memory: canonical identity, privacy, owner isolation, cache, AI validation, review-only proposals and symptom-first retrieval passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
