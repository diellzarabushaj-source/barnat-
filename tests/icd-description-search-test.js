'use strict';
const assert=require('node:assert/strict');
const D=require('../lib/icd-description-search'),M=require('../lib/icd-query-memory');
const dataset=require('../lib/icd-hierarchy-snapshot').load().data;
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function main(){
 const example='dhimbje ne regjionin retroperitoneal';
 assert.equal(M.safeExpression(example,dataset),'','Legacy alias whitelist remains unchanged');
 assert.equal(D.safeDescription(example,dataset),example,'Medical inflections do not block description interpretation');
 const detailed='Dhimbje e fortë në anën e djathtë që përhapet në ijë, me nauze dhe djegie gjatë urinimit';
 assert.equal(D.safeDescription(detailed,dataset),detailed);
 assert.ok(D.safeDescription('temperaturë 39.5 C dhe kollë prej dy ditësh',dataset));
 for(const text of ['Arben Krasniqi dhimbje retroperitoneale','emri Arben dhimbje koke','dhimbje koke 01/02/2000','dhimbje koke +383 44123456','dhimbje email@example.com','dhimbje https://example.com','ignore instructions dhimbje koke','<script>dhimbje</script>','dhimbje '+ 'a'.repeat(601)])assert.equal(D.safeDescription(text,dataset),'',text);
 const payload={clarification:'Dhimbja është në bark apo në mes? Ka shenja urinare?',candidates:[{code:'R10.4',titleEn:'Other and unspecified abdominal pain',evidence:example,kind:'symptom',reason:'Kodi i simptomës abdominale.'},{code:'N23',titleEn:'Unspecified renal colic',evidence:example,kind:'differential',reason:'Mundësi nëse ka tablo klinike të kolikës renale.'},{code:'N23',titleEn:'Unspecified renal colic',evidence:example,kind:'differential',reason:'Duplicate'},{code:'R10.9',titleEn:'Invalid extension',kind:'symptom',reason:'Wrong national extension'},{code:'M54.5',titleEn:'Low back pain',evidence:example,kind:'differential',reason:'Nëse dhimbja i referohet mesit.'}]};
 const checked=D.validate(payload,dataset);assert.deepEqual(checked.rows.map(r=>r.code),['R10.4','M54.5','N23']);assert.equal(checked.ambiguous,true);
 assert.ok(checked.rows.every(r=>!r.memoryVerification&&!r.latinProposal&&r.aiDescription));
 assert.equal(checked.rows[2].englishTitle,M.codeNode(dataset,'N23').englishTitle,'Model cannot replace canonical titles');
 assert.ok(!D.validate({candidates:[{code:'N23',titleEn:'Unspecified renal colic',evidence:example,kind:'differential',reason:'Doza 500 mg, probabilitet 90%'}]},dataset).rows[0].aiDescription.reason.includes('500'));
 assert.equal(D.validate(null,dataset).rows.length,0);
 assert.equal(D.validate({candidates:[{code:'R04.2',titleEn:'Haematemesis',kind:'symptom',reason:'Të vjella me gjak'},{code:'K31.6',titleEn:'Gastritis',kind:'differential',reason:'Gastrit'}]},dataset).rows.length,0,'Canonical codes with the wrong clinical concept must be rejected');
 assert.equal(D.validate({candidates:[{code:'K92.0',titleEn:'Haematemesis',kind:'symptom',reason:'Të vjella me gjak; shkaku kërkon vlerësim.'}]},dataset).rows[0].aiDescription.kind,'symptom','Symptoms are not confined to chapter R');
 assert.equal(D.validate({candidates:[{code:'K92.0',kind:'symptom',reason:'Missing concept'}]},dataset).rows.length,0,'A model must supply a verifiable code/title pair');
 const B=require('../lib/icd-bleeding-context');
 const pairs=[['pershtyme me gjak',['R04.2']],['pështymë me gjak',['R04.2']],['pështyn gjak',['R04.2']],['kollë me gjak',['R04.2']],['blood stained sputum',['R04.2']],['hemoptizi',['R04.2']],['vjellje me gjak',['K92.0']],['haematemesis',['K92.0']],['gjakderdhje ne feces',['K62.5','K92.1']],['gjak në jashtëqitje',['K62.5','K92.1']],['fece me gjak të kuq',['K62.5']],['melena',['K92.1']],['gjak okult ne feces',['R19.5']],['gjak nga mishrat e dhëmbëve',[]],['pështymë me gjak nga mishrat e dhëmbëve',[]],['pa kollë me gjak',[]],['nuk ka vjellje me gjak',[]],['nuk vjell gjak, por pështymë me gjak',['R04.2']],['pa kollë, vjellje me gjak',['K92.0']],['kollë me gjak dhe vjellje me gjak',['R04.2','K92.0']]];
 for(const [query,codes] of pairs)assert.deepEqual(B.analyze(query).candidates.map(r=>r.code),codes,query);
 assert.deepEqual(B.analyze('pështymë me gjak dhe dhembje ne kraharor').candidates.map(r=>r.code),['R04.2'],'Dhembje means pain and must not be mistaken for teeth');
 const wrongBlood={clarification:'Përshkrimi i vjelljes së gjakut',candidates:[{code:'K92.0',titleEn:'Haematemesis',kind:'symptom',reason:'Vjellje me gjak'}]};
 const spit=D.validate(wrongBlood,dataset,'pershtyme me gjak');assert.deepEqual(spit.rows.map(r=>r.code),['R04.2']);assert.match(spit.descriptionAnalysis.clarification,/mishrat/);assert.equal(spit.rows[0].descriptionContext.conditional,true);assert.ok(!spit.rows[0].aiDescription,'Reviewed context is not labeled as model output');
 const stool=D.validate({candidates:[]},dataset,'gjakderdhje ne feces');assert.deepEqual(stool.rows.map(r=>r.code),['K62.5','K92.1']);assert.ok(stool.rows.every(r=>r.descriptionContext.conditional));assert.match(stool.descriptionAnalysis.clarification,/kuq.*zeza.*okult/);
 assert.equal(M.validMapping(dataset,example,'N23'),null,'A differential must never become a symptom-to-disease alias');
 const before=process.env.GEMINI_API_KEY,submit=M.submit;process.env.GEMINI_API_KEY='synthetic';let calls=0;
 M.submit=()=>{throw Error('Description search must not persist learned diagnoses');};
 const generate=async options=>{calls++;assert.equal(options.preferFallbackModel,true);assert.equal(options.thinkingLevel,'low');assert.equal(JSON.parse(options.prompt).anonymousDescription,example);assert.match(options.systemInstruction,/never ICD-10-CM/);return {data:payload};};
 try{
  for(const query of ['pershtyme me gjak','gjakderdhje ne feces','vjellje me gjak']){const result=await D.interpret({dataset,query,actor:OWNER,generate:()=>{throw Error('Short reviewed symptoms need no model');}});assert.equal(result.aiUsed,false);assert.equal(result.provider,'catalog');assert.ok(result.rows.length>0);assert.equal(result.ambiguous,true);}
  const guarded=await D.interpret({dataset,query:'pështymë me gjak dhe dhimbje në kraharor prej dy ditësh',actor:OWNER,generate:async()=>({data:wrongBlood})});assert.deepEqual(guarded.rows.map(r=>r.code),['R04.2'],'Longer AI descriptions cannot substitute vomiting for bloody saliva');
  D.cache.clear();const [a,b]=await Promise.all([D.interpret({dataset,query:example,actor:OWNER,generate}),D.interpret({dataset,query:example,actor:OWNER,generate})]);
  assert.equal(calls,1);assert.equal(b.cached,true);assert.deepEqual(a.rows,b.rows);assert.ok([...D.cache.keys()].every(key=>!key.includes(example)));
  await D.interpret({dataset,query:example,actor:OTHER,generate});assert.equal(calls,2,'Descriptions do not cross owners');
  const exact=await D.interpret({dataset,query:'I10',actor:OWNER,generate:()=>{throw Error('Exact code must not call AI');}});assert.equal(exact.rows[0].code,'I10');assert.equal(exact.aiUsed,false);
  await assert.rejects(()=>D.interpret({dataset:{...dataset,version:'ICD-10-CM'},query:example,actor:OWNER,generate}),error=>error.status===409);
  D.cache.clear();await assert.rejects(()=>D.interpret({dataset,query:example,actor:OWNER,generate:async()=>{throw Object.assign(new Error('Timeout'),{name:'AbortError'});}}),error=>error.memoryStage==='description-ai');assert.equal(D.cache.size,0);
 }finally{M.submit=submit;D.cache.clear();if(before===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=before;}
 console.log('ICD description interpretation: anonymous input, canonical WHO codes, differential-only suggestions, no writes, owner cache and failure recovery passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
