'use strict';

const assert = require('node:assert/strict');
const Indication = require('../lib/indication-normalizer.js');

const catalog = Indication.loadCatalog();

assert.equal(
  Indication.resolveIndication('Primary dysmenorrhea', catalog).indication.indicationKey,
  'primary-dysmenorrhoea'
);
assert.equal(
  Indication.resolveIndication('FIEBRE', catalog).indication.indicationKey,
  'fever'
);
assert.equal(
  Indication.resolveIndication('some unrelated indication', catalog).matched,
  false
);

const fever = Indication.publicationDecision('fever', catalog);
assert.equal(fever.allowed, false);
assert.equal(fever.reason, 'verified_icd_required');

const verifiedCatalog = JSON.parse(JSON.stringify(catalog));
const item = verifiedCatalog.indications.find(x => x.indicationKey === 'fever');
item.icd10 = [{ code:'R50.9', status:'verified' }];
assert.equal(
  Indication.publicationDecision('fever', verifiedCatalog).allowed,
  true
);

const collisionCatalog = JSON.parse(JSON.stringify(catalog));
collisionCatalog.indications.push({
  indicationKey:'collision',
  canonicalName:'Pain',
  synonyms:[],
  icd10:[],
});
assert.throws(
  () => Indication.buildAliasIndex(collisionCatalog),
  /Indication alias collision/
);

console.log('DRx indication normalization contract passed.');
