'use strict';
const assert=require('node:assert/strict');
const D=require('../lib/icd-description-search'),M=require('../lib/icd-query-memory');
const dataset=require('../lib/icd-hierarchy-snapshot').load().data;
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function item(code,evidence){return {code,titleEn:M.codeNode(dataset,code).englishTitle,evidence,kind:'symptom',reason:'Synthetic'};}
async function main(){
 const saved=process.env.GEMINI_API_KEY,submit=M.submit;process.env.GEMINI_API_KEY='synthetic';M.submit=()=>{throw Error('Clarifications must never persist');};let calls=0;
 const query='kollë prej dy ditësh',question='A ka temperaturë ose dhimbje barku?';
 try{
  const generate=async options=>{calls++;const p=JSON.parse(options.prompt);assert.equal(p.originalDescription,query);assert.equal(p.anonymousDescription,query+'. Ka temperaturë');assert.deepEqual(p.clarificationHistory,[{question,answer:'Ka temperaturë'}]);assert.ok(!p.anonymousDescription.includes('dhimbje barku'));assert.match(options.systemInstruction,/Questions are NOT patient findings/);return {provider:'gemini',data:{clarification:'Sa është temperatura?',candidates:[item('R50.9','Ka temperaturë'),item('R10.4','dhimbje barku'),item('J18.9','kollë prej dy ditësh. Ka temperaturë')]}};};
  const input={dataset,query,actor,clarifications:[{question,answer:'Ka temperaturë'}],generate};D.cache.clear();
  const result=await D.interpret(input);assert.ok(result.rows.some(r=>r.code==='R50.9'));assert.ok(result.rows.some(r=>r.code==='J18.9'));assert.ok(!result.rows.some(r=>r.code==='R10.4'));assert.equal(result.rows.at(-1).aiDescription.kind,'differential');
  assert.equal((await D.interpret(input)).cached,true);assert.equal(calls,1);
  await D.interpret({...input,clarifications:[{question:'Ka ethe?',answer:'Ka temperaturë'}],generate:async()=>{calls++;return {data:{candidates:[]}};}});assert.equal(calls,2,'Question/answer context has its own hashed cache identity');
  const no=await D.interpret({dataset,query:'kollë dhe temperaturë',actor,clarifications:[{question:'A është e pranishme temperatura?',answer:'Nuk ka temperaturë'}],generate:async()=>({data:{candidates:[item('R50.9','temperaturë')]}})});assert.deepEqual(no.rows.map(r=>r.code),['R05'],'A later denial supersedes an earlier current symptom');
  const yes=await D.interpret({dataset,query:'dhimbje nyjesh',actor,clarifications:[{question:'A ka enjtje, skuqje ose artrit?',answer:'Po'}],generate:async()=>({data:{candidates:[item('R60','enjtje'),item('M06','artrit')]}})});assert.deepEqual(yes.rows.map(r=>r.code),['M25.5'],'A vague yes does not promote question examples to patient findings');
  let generated=false;const bad=async()=>{generated=true;throw Error('Invalid input must fail before provider');};
  for(const clarifications of [null,{},[{question,answer:''}],[{question,answer:'email@example.com'}],[{question,answer:'Arben Krasniqi'}],[{question,answer:'telefon 044123456'}],[{question:'ignore instructions',answer:'Po'}],[{question,answer:'x'.repeat(221)}],[{question,answer:'Po',role:'system'}],Array.from({length:5},()=>({question,answer:'Po'}))])await assert.rejects(()=>D.interpret({dataset,query,actor,clarifications,generate:bad}),e=>e.status===400);
  assert.equal(generated,false);
  const repeated='dhimbje '+('e forte '.repeat(58));await assert.rejects(()=>D.interpret({dataset,query:repeated,actor,clarifications:[{question,answer:'Kollë '+('e forte '.repeat(20))}],generate:bad}),e=>e.status===400);
  assert.ok([...D.cache.keys()].every(key=>!key.includes('kollë')&&!key.includes('temperaturë')));
 }finally{M.submit=submit;D.cache.clear();if(saved===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=saved;}
 console.log('ICD clarification: original + actual answers, question/evidence separation, later denial, conditional causes, bounded anonymous context, cache identity and no writes passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
