'use strict';
const assert = require('node:assert/strict');
const {mergeCatalog, imageUrl, QUERY} = require('../lib/medlex-sanity.js');
const original = require('../data/medlex-chapters.json');
const remote = {chapters:[{externalId:'03', title:'Simptomat e redaktuara'}],
  subchapters:[{chapter:'03', groupId:'frymemarrja', title:'Frymëmarrja'}],
  cards:[{externalId:'c03-001', term:'Dispne', definition:'Përkufizim i redaktuar.', example:'Shembull i redaktuar.',
    subchapter:{chapter:'03', groupId:'frymemarrja'}, contentStatus:'available', clinicalStatus:'draft',
    imageUrl:'https://cdn.sanity.io/images/4wdtp8cz/production/abc123-1254x1254.webp'}]};
const merged = mergeCatalog(remote);
assert.deepEqual(merged.categories.slice(0, 2), original.categories.slice(0, 2), 'CMS must preserve chapters 01–02');
assert.equal(merged.categories[2].title, 'Simptomat e redaktuara');
assert.equal(merged.categories[2].terms[0].definition, 'Përkufizim i redaktuar.');
assert.equal(merged.categories[2].terms[0].clinicalStatus, 'draft', 'publication must not imply clinical verification');
assert.equal(merged.categories[2].terms.length, original.categories[2].terms.length);
assert.equal(original.categories[2].terms[0].definition.includes('redaktuar'), false, 'fallback must not be mutated');
assert.deepEqual(mergeCatalog({}), original, 'empty CMS must preserve the complete fallback');
remote.cards[0].imageUrl = 'https://evil.test/card.webp';
assert.equal(mergeCatalog(remote).categories[2].terms[0].definition, original.categories[2].terms[0].definition);
assert.equal(imageUrl('javascript:alert(1)'), '');
assert.equal(imageUrl('https://cdn.sanity.io/images/another/production/a-1x1.png'), '');
remote.cards[0].contentStatus = 'planned';
assert.equal(mergeCatalog(remote).categories[2].terms[0].status, 'planned');
remote.cards[0].order = 999;
assert.equal(mergeCatalog(remote).categories[2].terms.at(-1).id, 'c03-001', 'CMS card ordering must be honored');
assert.ok(QUERY.includes('_type == "medlexCard"'));
console.log('MedLex Sanity merge passed: hierarchy, published content, draft review status, image origin, planned cards, fallback and unchanged chapters 01–02.');
