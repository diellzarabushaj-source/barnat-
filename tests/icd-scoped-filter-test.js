'use strict';
const assert=require('node:assert/strict');
const api=require('../lib/icd-advanced-handler.js')._test;
const nodes=[];
// Over 18 unfiltered hits must not hide matching rows in another chapter.
for(let i=0;i<30;i++)nodes.push({code:'A'+String(i).padStart(2,'0'),level:'category',chapter:'I',block:'A00-A99',parentCode:'A00-A99',displayTitle:'Test diagnosis',englishTitle:'Test diagnosis',translationStatus:'missing'});
nodes.push({code:'J10',level:'category',chapter:'X',block:'J00-J99',parentCode:'J00-J99',displayTitle:'Test diagnosis',englishTitle:'Test diagnosis',translationStatus:'missing'});
nodes.push({code:'J10.1',level:'subcategory',chapter:'X',block:'J00-J99',parentCode:'J10',displayTitle:'Test diagnosis',englishTitle:'Test diagnosis',translationStatus:'missing'});
const data={nodes};
assert.deepEqual(api.suggestionPayload(data,{q:'Test diagnosis',chapter:'X',levels:'subcategory'}).rows.map(r=>r.code),['J10.1']);
assert.deepEqual(api.suggestionPayload(data,{q:'Test diagnosis',block:'J00-J99',levels:'category'}).rows.map(r=>r.code),['J10']);
assert.equal(api.suggestionPayload(data,{q:'Test diagnosis',chapter:'I',block:'J00-J99'}).rows.length,0);
assert.notEqual(api.cacheKey('suggest',{q:'test',block:'A00-A99'},{}),api.cacheKey('suggest',{q:'test',block:'J00-J99'},{}));
console.log('PASS: ICD chapter/block/level filters apply before ranking/limit and have isolated caches');
