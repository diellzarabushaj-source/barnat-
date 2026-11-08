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
const orl = original.categories.find(chapter => chapter.id === '19');
assert.equal(orl.terms.length, 14);
assert.equal(orl.groups.length, 4);
const earAndNose = original.categories.find(chapter => chapter.id === '20');
assert.equal(earAndNose.groups.length, 2);
assert.equal(earAndNose.terms.length, 7);
assert.deepEqual(earAndNose.groups.map(group => group.id), ['veshi', 'hunda']);
assert.ok(orl.terms.some(term => term.term === 'Orofaring normal' && term.status === 'available'));
assert.ok(earAndNose.terms.some(term => term.term === 'Timpan normal' && term.status === 'available'));
assert.ok(earAndNose.terms.some(term => term.term === 'Hunda normale' && term.status === 'available'));
const orlCms = mergeCatalog({
  chapters:[{externalId:'19', title:'ORL · Gojë dhe faring'}],
  subchapters:[{chapter:'19', groupId:'faringu', title:'Faringu, qiellza dhe uvula', order:1}],
  cards:[{externalId:'c19-002', term:'Faring eritematoz', definition:'Mukozë e skuqur gjatë inspektimit.',
    example:'Skuqja nuk dallon etiologjinë virale nga ajo bakteriale.',
    subchapter:{chapter:'19',groupId:'faringu'}, contentStatus:'available',clinicalStatus:'draft',order:1,
    imageUrl:'https://cdn.sanity.io/images/4wdtp8cz/production/abc123-1254x1254.webp'}]
});
assert.equal(orlCms.categories.length, 20);
assert.equal(orlCms.categories[18].terms.length, 14);
assert.equal(orlCms.categories[18].terms.find(term => term.id === 'c19-002').definition, 'Mukozë e skuqur gjatë inspektimit.');
assert.equal(orlCms.categories[18].terms.find(term => term.id === 'c19-002').clinicalStatus, 'draft');
assert.equal(orlCms.categories[18].terms.find(term => term.id === 'c19-003').definition, orl.terms[2].definition,
  'Unmodified Sanity ORL cards must retain illustrated local fallback.');
assert.equal(orlCms.categories[19].terms.length, 7, 'A partially synced Sanity dataset must retain the chapter 20 fallback.');
console.log('MedLex Sanity merge passed: hierarchy, published content, draft review status, image origin, planned cards, fallback and unchanged chapters 01–02.');
