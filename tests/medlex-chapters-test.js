'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('../data/medlex-chapters.json');
const artwork = require('../data/medlex-chapters-artwork.json');
const {rank,normalize,imagePath} = require('../medlex.js');
assert.deepEqual(catalog.categories.map(x=>x.id),Array.from({length:18},(_,i)=>String(i+1).padStart(2,'0')));
assert.deepEqual(catalog.artworkPolicy.preserveExistingChapters,['01','02']);
assert.equal(catalog.artworkPolicy.mascot,false);
const counts=[20,21,18,17,19,18,18,18,18,17,17,19,17,18,18,26];
const planned = catalog.categories.slice(2).flatMap(chapter=>{
  assert.equal(chapter.terms.length,counts[Number(chapter.id)-3],chapter.title);
  assert.ok(['planned','partial','available'].includes(chapter.status));
  const ready=chapter.terms.filter(term=>term.status==='available').length;
  assert.equal(chapter.status,ready===chapter.terms.length?'available':ready?'partial':'planned');
  assert.equal(new Set(chapter.groups.map(x=>x.id)).size,chapter.groups.length);
  assert.equal(new Set(chapter.terms.map(x=>normalize(x.term))).size,chapter.terms.length);
  for(const term of chapter.terms){
    assert.equal(term.category,chapter.id);
    assert.ok(chapter.groups.some(group=>group.id===term.group));
    assert.match(term.id,new RegExp('^c'+chapter.id+'-\\d{3}$'));
    assert.ok(['planned','available'].includes(term.status));
    if(term.status==='planned') {
      for(const field of ['definition','example','latin','english','illustrationBrief']) assert.equal(term[field],'');
      assert.equal(term.image,null);
      assert.equal(imagePath(term),'','An unfilled slot must never request an image.');
    } else {
      for(const field of ['definition','example','english','illustrationBrief']) assert.ok(term[field]?.length>3,term.id+':'+field);
      assert.equal(term.clinicalStatus,'draft_for_clinical_review');
      assert.ok(term.references.length && term.references.every(url=>url.startsWith('https://')));
      assert.match(imagePath(term),new RegExp('^/assets/medlex-chapters/'+term.id+'\\.webp\\?v='));
      const entry=artwork.cards.find(card=>card.id===term.id);
      assert.ok(entry,term.id+': artwork provenance');
      const bytes=fs.readFileSync(path.join(__dirname,'../assets/medlex-chapters',term.image));
      const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
      assert.equal(bytes.toString('ascii',0,4),'RIFF');
      assert.equal(bytes.toString('ascii',8,12),'WEBP');
      assert.equal(hash(bytes),entry.sha256,term.id+': image checksum');
      assert.equal(hash(term.definition),entry.definitionSha256,term.id+': definition matches artwork source');
      assert.equal(hash(term.example),entry.exampleSha256,term.id+': example matches artwork source');
    }
  }
  return chapter.terms;
});
assert.equal(planned.length,299);
assert.equal(new Set(planned.map(x=>x.id)).size,299);
assert.equal(planned.filter(x=>normalize(x.term)==='takipne').length,2,'A term shared by specialties keeps both chapter locations.');
assert.ok(planned.some(x=>x.category==='04' && rank(x,'agnozi')===120));
assert.ok(planned.some(x=>x.category==='03' && rank(x,'hemoptize')===120));
assert.ok(planned.some(x=>x.category==='18' && x.term==='-ostomi'));
const available=planned.filter(term=>term.status==='available');
assert.ok(available.length>=149);
assert.equal(available.length,artwork.cards.length);
assert.equal(artwork.mascot,false);
assert.equal(artwork.status,'draft_for_clinical_review');
console.log(`MedLex: 18 chapters, 299 new slots, ${available.length} illustrated cards with matching content and checksums.`);
