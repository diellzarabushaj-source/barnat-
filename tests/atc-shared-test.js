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

const nervousSystemChildren = ATC.getChildren('N');
assert.ok(nervousSystemChildren.length >= 7);
assert.deepEqual(nervousSystemChildren[0], {
  code:'N01',
  name:'Anestetikë',
  label:'N01 — Anestetikë',
});
assert.ok(nervousSystemChildren.some(item => item.code === 'N02'));
assert.deepEqual(ATC.getChildren('Z'), []);

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
