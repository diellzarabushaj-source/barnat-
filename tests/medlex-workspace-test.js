'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const dictionary = JSON.parse(read('data/medlex-terms.json'));
const anatomy = JSON.parse(read('data/medlex-anatomy.json'));
const { normalize, editDistance, rank, imagePath, TOPICS, ALIASES } = require('../medlex.js');

assert.equal(dictionary.category, '01 - Terminologji e përgjithshme klinike');
assert.equal(dictionary.status, 'draft_for_clinical_review');
assert.equal(dictionary.terms.length, 20);
assert.equal(new Set(dictionary.terms.map(term => term.id)).size, 20);
assert.equal(new Set(dictionary.terms.map(term => normalize(term.term))).size, 20);
for (const term of dictionary.terms) {
  assert.ok(term.definition.length > 20, `${term.term}: definition too short`);
  assert.ok(term.example.length > 5, `${term.term}: clinical example missing`);
  assert.ok(ALIASES[term.id]?.length, `${term.term}: synonym missing`);
  assert.match(term.image, /^\d{2}-[a-z-]+\.webp$/, `${term.term}: image reference must use optimized WebP`);
  const asset = path.join(ROOT, 'assets/medlex', term.image);
  assert.ok(fs.existsSync(asset), `${term.term}: image missing`);
  assert.ok(fs.statSync(asset).size > 15000, `${term.term}: image probably corrupt`);
}
const allIds = TOPICS.filter(topic => topic.id !== 'all').flatMap(topic => topic.ids);
assert.deepEqual(allIds.sort((a,b) => a-b), dictionary.terms.map(term => term.id));

const term = text => dictionary.terms.find(item => normalize(item.term) === normalize(text));
assert.equal(normalize('I FITUAR'), 'i fituar');
assert.equal(normalize('Përkufizimi: Çrregullim'), 'perkufizimi crregullim');
assert.ok(rank(term('Akut'), 'akut') > rank(term('Subakut'), 'akut'));
assert.ok(rank(term('Kronik'), 'chronic') > 0, 'English synonym search');
assert.ok(rank(term('I fituar'), 'acquired') > 0, 'English synonym with two-word Albanian term');
assert.ok(rank(term('I fituar'), 'imunodeficience') > 0, 'Albanian clinical example search');
assert.ok(rank(term('Iatrogjen'), 'iatrogjen') > 0);
assert.ok(rank(term('Idiopatik'), 'idiopatik') > 0);
assert.ok(rank(term('Difuz'), 'perhapur') > 0);
assert.ok(rank(term('Kronik'), 'kroniik') > 0, 'typo tolerance');
assert.equal(rank(term('Kronik'), 'hipertension'), 0);
assert.equal(editDistance('kronik','kroniik',1),1);

assert.equal(anatomy.category, '02 - Anatomi, orientim dhe regjionet e trupit');
assert.equal(anatomy.status, 'draft_for_clinical_review');
assert.equal(anatomy.terms.length, 157);
assert.equal(anatomy.groups.length, 9);
const anatomyTerms = anatomy.terms.map(values => Object.fromEntries(anatomy.schema.map((field,index) => [field,values[index]])));
assert.equal(new Set(anatomyTerms.map(term => term.id)).size, 157);
assert.equal(new Set(anatomyTerms.map(term => term.latin)).size, 157);
for (const term of anatomyTerms) {
  assert.ok(anatomy.groups.some(group => group.id === term.group), `${term.id}: unknown group`);
  for (const field of ['term','latin','english','definition','example','visual']) {
    assert.ok(typeof term[field] === 'string' && term[field].length >= 3, `${term.id}: missing ${field}`);
  }
  assert.ok(rank({...term,category:'02'}, normalize(term.latin)) > 0, `${term.id}: Latin search`);
  assert.ok(rank({...term,category:'02'}, normalize(term.english)) > 0, `${term.id}: English search`);
  const asset = path.join(ROOT,'assets/medlex-anatomy',term.id+'.webp');
  assert.ok(fs.existsSync(asset),`${term.id}: illustrated card missing`);
  assert.ok(fs.statSync(asset).size > 10000,`${term.id}: incomplete WebP`);
}
const abdomenRegions = anatomyTerms.filter(term => term.visual.startsWith('abdomen:') && /^ab0[1-9]$/.test(term.id));
assert.match(imagePath({category:'02',image:'ab01.webp'}), /^\/assets\/medlex-anatomy\/ab01\.webp\?v=.+/, 'replacement anatomy art must bypass immutable cached images');
assert.equal(imagePath({category:'01',image:dictionary.terms[0].image}), '/assets/medlex/' + dictionary.terms[0].image, 'chapter 01 asset URLs stay unchanged');
assert.equal(imagePath({category:'02',image:'../medlex/01-akut.webp'}), '', 'asset validation rejects traversal');
assert.ok(rank({...anatomyTerms.find(term => term.id === 'ab01'),category:'02'}, 'kolecistit') > 0, 'disease examples are searchable');
assert.ok(rank({...anatomyTerms.find(term => term.id === 'ab05'),category:'02'}, 'apendicit') > 0, 'early periumbilical appendicitis example is searchable');
assert.deepEqual(abdomenRegions.map(term => term.visual),Array.from({length:9},(_,index) => `abdomen:${index}`));
assert.deepEqual(anatomyTerms.filter(term => term.visual.startsWith('quadrant:')).map(term => term.visual),['quadrant:0','quadrant:1','quadrant:2','quadrant:3']);
assert.ok(anatomyTerms.some(term => normalize(term.latin).includes('epigastrica')));
assert.ok(anatomyTerms.some(term => normalize(term.latin) === 'palma'));
assert.ok(anatomyTerms.some(term => normalize(term.latin) === 'dorsum pedis'));
assert.ok(anatomyTerms.some(term => normalize(term.latin) === 'regio antebrachialis'));

const html = read('medlex.html');
assert.match(html, /data-drx-app="medlex-v1"/);
assert.match(html, /id="medlexSearch"/);
assert.match(html, /id="medlexCategories"/);
assert.match(html, /data-category="02"/);
assert.match(html, /id="medlexDialogLatin"/);
assert.match(html, /id="medlexGridItems"/);
assert.match(html, /id="medlexDialog"/);
assert.match(html, /id="medlexDownload" download/);
assert.match(html, /sidebar-taxonomy-v3\.js/);
assert.match(read('sidebar-taxonomy-core-v3.js'), /function ensureMedLexLink\(nav\)/);
assert.match(read('sidebar-taxonomy-core-v3.js'), /href = '\/medlex\.html'/);
for (const workspace of ['index.html','klasifikimi.html','icd.html','dozologjia.html','protokollet.html','urgjencat.html','recetat.html','analizat.html','medical-hub.html','sistemi.html']) {
  assert.match(read(workspace), /href="\/medlex\.html"/, `${workspace}: MedLex is missing from navigation`);
}
assert.match(read('sw.js'), /'\/data\/medlex-terms\.json'/);
assert.match(read('sw.js'), /'\/data\/medlex-anatomy\.json'/);
assert.match(read('scripts/build-static-runtime.js'), /'\/medlex\.html'/);
assert.match(read('medlex.js'), /credentials:'same-origin'/);
assert.match(read('medlex.js'), /response\.status === 401/);
assert.match(read('medlex.css'), /@media\(max-width:660px\)/);
assert.match(read('medlex.css'), /prefers-reduced-motion:reduce/);

require('../scripts/generate-medlex-anatomy-cards.js').verifyArtwork();
console.log('MedLex: 177 cards across categories 01 + 02; 9 anatomy groups, 9 abdominal regions + 4 quadrants, searchable Latin/English aliases and media assets verified.');
