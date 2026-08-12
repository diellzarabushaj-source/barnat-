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
 ['1401-1500',require('../data/approved-population-overrides-1401-1500.json'),[1406,1408,1409,1416,1424,1438,1461]],
 ['1501-1600',require('../data/approved-population-overrides-1501-1600.json'),[1587,1589,1590]],
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
assert.strictEqual(entries.length,1424,'Expected 1424 classified cards through 1600.');
assert.strictEqual(new Set(entries.map(([n])=>n)).size,entries.length,'Registry numbers must be unique.');
assert(entries.every(([,p])=>allowed.has(p)),'Only three population categories are allowed.');
entries.forEach(([n,p])=>assert.strictEqual(byNumber.get(n),p,`Card ${n} mismatch.`));
assert.strictEqual(entries.filter(([,p])=>p==='Pediatric only').length,98,'Expected 98 Pediatric only cards through 1600.');
for(const [n,p] of [
 [1497,'Adult only'],[1500,undefined],[1501,'Adult only'],[1507,'Pediatric and adult both'],[1508,'Adult only'],
 [1541,'Adult only'],[1542,undefined],[1547,'Pediatric and adult both'],[1548,'Pediatric and adult both'],[1549,undefined],
 [1571,'Adult only'],[1572,'Adult only'],[1573,undefined],[1580,'Pediatric and adult both'],[1581,undefined],[1582,'Pediatric and adult both'],[1583,'Pediatric and adult both'],
 [1586,undefined],[1587,'Pediatric only'],[1588,undefined],[1589,'Pediatric only'],[1590,'Pediatric only'],[1591,'Pediatric and adult both'],[1592,undefined],[1593,'Pediatric and adult both'],[1600,undefined]
]){
 assert.strictEqual(byNumber.get(n),p,`Card ${n} sentinel detects population row shift.`);
}
console.log('Approved population A→S mapping passed: 1424 classified through 1600; 98 pediatric only.');
