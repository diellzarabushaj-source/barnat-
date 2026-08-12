'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert');
const root=path.resolve(__dirname,'..');
const snapshot=require('../data/approved-population-snapshot.json');
const handler=require('../lib/approved-population-handler.js');
const specs=[
 ['1-500',require('../data/approved-population-overrides-1-500.json'),[44,45,46,109,127,140,146,179,192,196,197,200,222,248,282,290,292,293,302,305,307,328,434,447,448,449,453,455,458,464,466,467,469,472,475,476,477,478,479]],
 ['501-600',require('../data/approved-population-overrides-501-600.json'),[504]],
 ['601-700',require('../data/approved-population-overrides-601-700.json'),[604,608,609,613,642,678,681,682,699]],
 ['701-800',require('../data/approved-population-overrides-701-800.json'),[722,734,736,739,750,751,761,769,786]],
 ['801-900',require('../data/approved-population-overrides-801-900.json'),[832,834,841,853,861,869]],
 ['901-1000',require('../data/approved-population-overrides-901-1000.json'),[904,918,944]],
 ['1001-1100',require('../data/approved-population-overrides-1001-1100.json'),[1044,1045,1050,1055,1058,1065,1084]],
 ['1101-1200',require('../data/approved-population-overrides-1101-1200.json'),[1115,1123,1124,1128,1160,1165,1167]],
 ['1201-1300',require('../data/approved-population-overrides-1201-1300.json'),[1205,1228,1275,1276,1294]],
 ['1301-1400',require('../data/approved-population-overrides-1301-1400.json'),[1327,1342]],
];
const source=fs.readFileSync(path.join(root,'lib/approved-population-handler.js'),'utf8');
const sets=specs.map(([,set])=>set);
const items=handler.snapshotItems(snapshot,sets);
const byNumber=new Map(items.map(x=>[x.registryNumber,x.approvedPopulation]));
const allowed=new Set(['Adult only','Pediatric only','Pediatric and adult both']);
assert(!source.includes('neonRequest'),'Population fallback must stay Neon-free.');
for(const [range,set,pediatricOnly] of specs){
 assert(source.includes(`approved-population-overrides-${range}.json`),`Handler missing ${range}.`);
 assert.strictEqual(set?.source?.spreadsheetId,'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE');
 assert.strictEqual(set?.source?.sheet,'KARTELA_BARNAVE');
 assert.strictEqual(set?.source?.registryNumberColumn,'A');
 assert.strictEqual(set?.source?.approvedPopulationColumn,'S');
 assert.strictEqual(set?.source?.mapping,'explicit-A-to-S');
 assert.strictEqual(set?.source?.range,range);
 assert.deepStrictEqual(set.pediatricOnly,pediatricOnly,`Pediatric-only list mismatch in ${range}.`);
}
const entries=sets.flatMap(set=>[
 ['Adult only',set.adultOnly],['Pediatric only',set.pediatricOnly],['Pediatric and adult both',set.pediatricAndAdultBoth]
].flatMap(([population,numbers])=>numbers.map(n=>[n,population])));
assert.strictEqual(entries.length,1332,'Expected 1332 classified cards through 1400.');
assert.strictEqual(new Set(entries.map(([n])=>n)).size,entries.length,'Registry numbers must be unique.');
assert(entries.every(([,p])=>allowed.has(p)),'Only three population categories are allowed.');
entries.forEach(([n,p])=>assert.strictEqual(byNumber.get(n),p,`Card ${n} mismatch.`));
assert.strictEqual(entries.filter(([,p])=>p==='Pediatric only').length,88,'Expected 88 Pediatric only cards through 1400.');
for(const [n,p] of [
 [1200,'Pediatric and adult both'],[1201,undefined],[1205,'Pediatric only'],[1228,'Pediatric only'],[1275,'Pediatric only'],[1276,'Pediatric only'],[1294,'Pediatric only'],[1300,'Pediatric and adult both'],
 [1301,'Pediatric and adult both'],[1307,'Adult only'],[1324,undefined],[1325,'Pediatric and adult both'],[1326,'Adult only'],[1327,'Pediatric only'],[1328,'Pediatric and adult both'],
 [1341,'Pediatric and adult both'],[1342,'Pediatric only'],[1343,'Adult only'],[1367,'Pediatric and adult both'],[1368,undefined],[1374,'Pediatric and adult both'],[1375,'Adult only'],
 [1394,'Pediatric and adult both'],[1395,undefined],[1400,'Pediatric and adult both']
]){
 assert.strictEqual(byNumber.get(n),p,`Card ${n} sentinel detects population row shift.`);
}
console.log('Approved population A→S mapping passed: 1332 classified through 1400; 88 pediatric only.');
