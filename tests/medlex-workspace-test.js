'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const dictionary = JSON.parse(read('data/medlex-terms.json'));
const { normalize, editDistance, rank, TOPICS, ALIASES } = require('../medlex.js');

assert.equal(dictionary.category, '01 - Terminologji e përgjithshme klinike');
assert.equal(dictionary.status, 'draft_for_clinical_review');
assert.equal(dictionary.terms.length, 20);
assert.equal(new Set(dictionary.terms.map(term => term.id)).size, 20);
assert.equal(new Set(dictionary.terms.map(term => normalize(term.term))).size, 20);
for (const term of dictionary.terms) {
  assert.ok(term.definition.length > 20, `${term.term}: definition too short`);
  assert.ok(term.example.length > 5, `${term.term}: clinical example missing`);
  assert.ok(ALIASES[term.id]?.length, `${term.term}: synonym missing`);
  const asset = path.join(ROOT, 'assets/medlex', term.image.replace(/\.png$/, '.webp'));
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

const html = read('medlex.html');
assert.match(html, /data-drx-app="medlex-v1"/);
assert.match(html, /id="medlexSearch"/);
assert.match(html, /id="medlexGridItems"/);
assert.match(html, /id="medlexDialog"/);
assert.match(html, /id="medlexDownload" download/);
assert.match(html, /sidebar-taxonomy-v3\.js/);
assert.match(read('sidebar-taxonomy-core-v3.js'), /function ensureMedLexLink\(nav\)/);
assert.match(read('sidebar-taxonomy-core-v3.js'), /href = '\/medlex\.html'/);
assert.match(read('medlex.js'), /credentials:'same-origin'/);
assert.match(read('medlex.js'), /response\.status === 401/);
assert.match(read('medlex.css'), /@media\(max-width:660px\)/);
assert.match(read('medlex.css'), /prefers-reduced-motion:reduce/);

console.log('MedLex: 20 cards, accessible navigation, search aliases, typo tolerance and media assets verified.');
