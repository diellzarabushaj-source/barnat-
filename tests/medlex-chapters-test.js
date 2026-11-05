'use strict';
const assert = require('node:assert/strict');
const catalog = require('../data/medlex-chapters.json');
const {rank,normalize,imagePath} = require('../medlex.js');
assert.deepEqual(catalog.categories.map(x=>x.id),Array.from({length:18},(_,i)=>String(i+1).padStart(2,'0')));
assert.deepEqual(catalog.artworkPolicy.preserveExistingChapters,['01','02']);
assert.equal(catalog.artworkPolicy.mascot,false);
const counts=[20,21,18,17,19,18,18,18,18,17,17,19,17,18,18,26];
const planned = catalog.categories.slice(2).flatMap(chapter=>{
  assert.equal(chapter.terms.length,counts[Number(chapter.id)-3],chapter.title);
  assert.equal(chapter.status,'planned');
  assert.equal(new Set(chapter.groups.map(x=>x.id)).size,chapter.groups.length);
  assert.equal(new Set(chapter.terms.map(x=>normalize(x.term))).size,chapter.terms.length);
  for(const term of chapter.terms){
    assert.equal(term.category,chapter.id);
    assert.ok(chapter.groups.some(group=>group.id===term.group));
    assert.match(term.id,new RegExp('^c'+chapter.id+'-\\d{3}$'));
    assert.equal(term.status,'planned');
    for(const field of ['definition','example','latin','english','aliases','illustrationBrief']) assert.equal(term[field],'');
    assert.equal(term.image,null);
    assert.equal(imagePath(term),'','An unfilled slot must never request an image.');
  }
  return chapter.terms;
});
assert.equal(planned.length,299);
assert.equal(new Set(planned.map(x=>x.id)).size,299);
assert.equal(planned.filter(x=>normalize(x.term)==='takipne').length,2,'A term shared by specialties keeps both chapter locations.');
assert.ok(planned.some(x=>x.category==='04' && rank(x,'agnozi')===120));
assert.ok(planned.some(x=>x.category==='03' && rank(x,'hemoptize')===120));
assert.ok(planned.some(x=>x.category==='18' && x.term==='-ostomi'));
console.log('MedLex chapter map: 18 chapters, 67 new subdivisions, 299 empty content slots; no invented clinical content or placeholder image requests.');
