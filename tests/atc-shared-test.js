const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'classification-data.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'atc-shared.js'))];
require(path.join(ROOT, 'classification-data.js'));
const ATC = require(path.join(ROOT, 'atc-shared.js'));

assert.equal(ATC.normalizeCode('n02'), 'N02');
assert.equal(ATC.normalizeCode(' N02 '), 'N02');
assert.equal(ATC.normalizeCode('n 02'), 'N02');
assert.equal(ATC.normalizeCode('N02BE01'), 'N02BE01');
assert.equal(ATC.normalizeCode('N02-!'), '');
assert.equal(ATC.normalizeCode(''), '');

assert.equal(ATC.resolveGroupCode('N02BE01'), 'N');
assert.equal(ATC.resolveGroupCode('C09AA05'), 'C');
assert.equal(ATC.resolveGroupCode('Z01AA01'), '');

assert.equal(ATC.resolveCategoryCode('N02BE01'), 'N02');
assert.equal(ATC.resolveCategoryCode('N02'), 'N02');
assert.equal(ATC.resolveCategoryCode('N'), 'N');
assert.equal(ATC.resolveCategoryCode('N99AA01'), 'N');
assert.equal(ATC.resolveCategoryCode('Z01AA01'), '');

assert.equal(ATC.getGroupName('N02BE01'), 'Sistemi nervor');
assert.equal(ATC.getCategoryName('N02BE01'), 'Analgjetikë – barna kundër dhimbjes');
assert.equal(ATC.getCategoryLabel('N02'), 'N02 — Analgjetikë – barna kundër dhimbjes');
assert.equal(ATC.getCategoryLabel('N99AA01'), 'N — Sistemi nervor');
assert.equal(ATC.getCategoryLabel('Z01AA01'), 'Kategoria ATC Z01AA01');

assert.equal(ATC.matchesCategory('N02BE01', 'N02'), true);
assert.equal(ATC.matchesCategory('N02BE01', 'N02BE01'), true);
assert.equal(ATC.matchesCategory('N03AX14', 'N02'), false);
assert.equal(ATC.matchesCategory('M01AE01', 'N02'), false);
assert.equal(ATC.matchesCategory('invalid', 'N02'), false);

const nervousSystemChildren = ATC.getChildren('N');
assert.ok(nervousSystemChildren.length >= 7);
assert.deepEqual(nervousSystemChildren[0], {
  code:'N01',
  name:'Anestetikë',
  label:'N01 — Anestetikë',
});
assert.ok(nervousSystemChildren.some(item => item.code === 'N02'));
assert.deepEqual(ATC.getChildren('Z'), []);

assert.deepEqual(
  ATC.readRegistryUrlState('https://medindex.local/index.html?atc=n%2002&q=paracetamol&page=2&pageSize=100'),
  { atc:'N02', query:'paracetamol', q:'paracetamol', page:2, pageSize:100 }
);
assert.deepEqual(
  ATC.readRegistryUrlState('/index.html?atc=Z01AA01&page=invalid&pageSize=invalid'),
  { atc:'', query:'', q:'', page:1, pageSize:50 }
);
assert.equal(
  ATC.registryUrlFromState('/index.html?status=active&atc=N02&page=9#registry', {
    atc:'J01CA04', query:'amoxicillin', page:1, pageSize:100,
  }),
  '/index.html?status=active&atc=J01&q=amoxicillin&pageSize=100#registry'
);
assert.equal(
  ATC.registryUrlFromState('/index.html?atc=N02&q=paracetamol&page=2&pageSize=100', {
    atc:'', query:'paracetamol', page:1, pageSize:50,
  }),
  '/index.html?q=paracetamol'
);

assert.equal(
  ATC.registryUrl({ atc:'N02BE01', query:'paracetamol', page:2, pageSize:50 }),
  '/index.html?atc=N02&q=paracetamol&page=2&pageSize=50'
);
assert.equal(
  ATC.registryUrl({ atc:'N02', q:'', page:0, pageSize:'invalid' }),
  '/index.html?atc=N02'
);
assert.equal(
  ATC.registryUrl({ query:'diklofenak', path:'/barnat.html' }),
  '/barnat.html?q=diklofenak'
);
assert.equal(ATC.classificationUrl('N02BE01'), '/klasifikimi.html#N02');
assert.equal(ATC.classificationUrl('N'), '/klasifikimi.html#N');
assert.equal(ATC.classificationUrl('Z01AA01'), '/klasifikimi.html');

assert.equal(global.window.MedIndexATC, ATC);
assert.equal(Object.isFrozen(ATC), true);

console.log('Shared ATC utilities tests passed.');