'use strict';
const assert=require('node:assert/strict');
const E=require('../lib/icd-description-evidence'),D=require('../lib/icd-description-search'),M=require('../lib/icd-query-memory');
const dataset=require('../lib/icd-hierarchy-snapshot').load().data;
function candidate(code,evidence,extra={}){const node=M.codeNode(dataset,code);assert.ok(node,code);return {code,titleEn:node.englishTitle,evidence,kind:E.isSymptom(node)?'symptom':'differential',reason:'Synthetic unsafe narrative: fever, proven infection, 100%.',...extra};}
const rejected=[
 ['kollë pa temperaturë','R50.9','temperaturë'],
 ['pa kollë, temperaturë 39','R05','kollë'],
 ['marramendje pa dhimbje koke','R51','dhimbje koke'],
 ['dhimbje barku, pa vjellje','R11','vjellje'],
 ['dhimbje koke, ethet mungojnë','R50.9','ethet'],
 ['denies fever, cough for two days','R50.9','fever'],
 ['no vomiting; abdominal pain','R11','vomiting'],
 ["s’ka temperaturë, kollë prej dje",'R50.9','temperaturë'],
 ['babai ka diabet tip 2','E11','diabet tip 2'],
 ['mother has asthma, cough today','J45.9','asthma'],
 ['kishte kollë, tani dhimbje barku','R05','kollë'],
 ['previous pneumonia, cough today','J18.9','pneumonia'],
 ['dhimbje veshi','R07.0','dhimbje veshi'],
 ['dhimbje gjoksi','R10.4','dhimbje gjoksi'],
 ['dhimbje koke','M54.5','dhimbje koke'],
 ['dhimbje qafe','H92.0','dhimbje qafe'],
 ['dhimbje barku','R51','dhimbje barku'],
 ['kruarje','R00.2','kruarje'],
 ['lodhje','R11','lodhje'],
 ['kollë','R42','kollë'],
 ['temperaturë','R05','temperaturë'],
 ['nauze','R60','nauze'],
 ['skuqje','R50.9','skuqje'],
 ['temperature normale, kolle','R50.9','temperature'],
 ['normal temperature, cough','R50.9','temperature'],
 ['temperature is normal; cough','R50.9','temperature is normal'],
 ['kollë prej dy ditësh','J18.9','kollë'],
 ['dhimbje gjoksi','I21.9','dhimbje gjoksi'],
 ['dhimbje fyti','J02.9','dhimbje fyti'],
 ['dhimbje veshi','H66.9','dhimbje veshi'],
 ['djegie gjate urinimit','N39.0','djegie gjate urinimit'],
 ['lodhje','E11','lodhje'],
 ['dhimbje ne regjionin retroperitoneal','N23','dhimbje ne regjionin retroperitoneal'],
 ['kolika barku','N23','kolika barku'],
 ['infeksion','N39.0','infeksion'],
 ['diabet','E11','diabet'],
 ['diabet tip 1','E11','diabet tip 1'],
 ['diabet tip 2','E10','diabet tip 2'],
 ['diabet tip 2','E11.0','diabet tip 2'],
 ['diabet tip 2','E11.2','diabet tip 2'],
 ['diabet tip 2','E11.9','diabet tip 2'],
 ['kollë dhe temperaturë','J15.9','kollë dhe temperaturë'],
 ['rash dhe kruarje','L23.9','rash dhe kruarje'],
 ['chronic gastritis','K29.1','gastritis'],
 ['acute gastritis','K29.5','gastritis'],
 ['pa diabet, urinim i shpeshte dhe lodhje','E11','urinim i shpeshte dhe lodhje'],
 ['dhimbje koke dhe marramendje','K29','dhimbje koke dhe marramendje'],
 ['kollë dhe temperaturë','N39.0','kollë dhe temperaturë'],
 ['kollë dhe temperaturë','J18.9','kollë'],
 ['dhimbje koke','R51','kollë'],
 ['dhimbje koke','R51',''],
];
const accepted=[
 ['kollë pa temperaturë','R05','kollë'],
 ['temperature normale, kolle','R05','kolle'],
 ['pa kollë, temperaturë 39','R50.9','temperaturë'],
 ['nuk ka vjellje, por dhimbje barku','R10.4','dhimbje barku'],
 ['kishte kollë, tani dhimbje barku','R10.4','dhimbje barku'],
 ['pa ethe, tani ethe','R50.9','ethe'],
 ['dhimbje koke prej dje','R51','dhimbje koke'],
 ['dhimbje veshi prej dje','H92.0','dhimbje veshi'],
 ['dhimbje fyti','R07.0','dhimbje fyti'],
 ['dhimbje qafe','M54.2','dhimbje qafe'],
 ['dhimbje shpine','M54','dhimbje shpine'],
 ['dhimbje gjoksi','R07.4','dhimbje gjoksi'],
 ['djegie gjate urinimit','R30','djegie gjate urinimit'],
 ['urinim i shpeshte','R35','urinim i shpeshte'],
 ['dhimbje nyjesh','M25.5','dhimbje nyjesh'],
 ['dhimbje muskulore','M79.1','dhimbje muskulore'],
 ['nuk mbushem me fryme','R06.0','nuk mbushem me fryme'],
 ['nuk dal jashte','K59.0','nuk dal jashte'],
 ['jo vetem kolle, por edhe lodhje','R05','kolle'],
 ['dhimbje ne regjionin retroperitoneal','R10.4','dhimbje ne regjionin retroperitoneal'],
 ['diabet tip 2','E11','diabet tip 2'],
 ['asthma','J45.9','asthma'],
 ['kollë dhe temperaturë prej dy ditësh','J18.9','kollë dhe temperaturë'],
 ['djegie gjate urinimit dhe urinim i shpeshte','N39.0','djegie gjate urinimit dhe urinim i shpeshte'],
];
for(const [query,code,evidence] of rejected){const result=E.check(E.analyze(query),candidate(code,evidence),M.codeNode(dataset,code));assert.equal(result.ok,false,query+' must not support '+code);}
for(const [query,code,evidence] of accepted){const result=E.check(E.analyze(query),candidate(code,evidence),M.codeNode(dataset,code));assert.equal(result.ok,true,query+' should support '+code+': '+result.why);assert.ok(!result.reason.includes('100%'));}
for(const [query,codes] of [
 ['kollë pa temperaturë',['R05']],['pa kollë, temperaturë 39',['R50']],
 ['kishte kollë, tani dhimbje barku',['R10.4']],['dhimbje fyti',['R07.0']],
 ['nuk mbushem me fryme',['R06.0']],['nuk dal jashte',['K59.0']],
 ['babai ka kollë me gjak',[]],['kishte vjellje me gjak',[]],
 ['kollë me gjak pa temperaturë',['R04.2']],['pa vjellje, dhimbje barku',['R10.4']],
 ['pa ethe, tani ethe',['R50']],['mother has asthma',[]]
])assert.deepEqual(D.validate({candidates:[]},dataset,query).rows.map(r=>r.code),codes,query);
const protectedResult=D.validate({candidates:[candidate('R50.9','temperaturë')]},dataset,'kollë pa temperaturë');
assert.deepEqual(protectedResult.rows.map(r=>r.code),['R05']);assert.match(protectedResult.descriptionAnalysis.clarification,/pranishme tani/);
const useful=D.validate({candidates:[candidate('J18.9','kollë dhe temperaturë'),candidate('R05','kollë')]},dataset,'kollë dhe temperaturë prej dy ditësh');
assert.equal(useful.rows.at(-1).code,'J18.9');assert.ok(useful.rows.slice(0,-1).every(r=>r.descriptionContext||r.aiDescription.kind==='symptom'));
assert.ok(useful.rows.every(r=>!r.memoryVerification&&!r.latinProposal));assert.ok(useful.rows.every(r=>!JSON.stringify(r.aiDescription||{}).includes('100%')));
assert.equal(D.schema.properties.candidates.items.required.includes('evidence'),true);
console.log(`ICD general evidence gate: ${rejected.length} unsupported suggestions rejected, ${accepted.length} supported suggestions retained, 12 context/fallback cases, symptom-first rendering contract passed.`);
