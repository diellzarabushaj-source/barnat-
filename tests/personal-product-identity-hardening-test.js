'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const library = require('../lib/user-library.js');

const server = read('lib/user-library.js');
const ui = read('registry-v2.js');
const migration = read('supabase/migrations/20260901215000_harden_personal_product_identity.sql');

const PRODUCT_ID = 'a29ce6e1-7581-4e9e-bc6e-db29e0ac451d';

assert.throws(
  () => library._test.normalizedFavorite({ entityType:'product', entityKey:'40', payload:{} }),
  /bar kanonik/i
);
assert.equal(
  library._test.normalizedFavorite({ entityType:'product', entityKey:PRODUCT_ID, payload:{} }).entityKey,
  PRODUCT_ID
);
assert.throws(
  () => library._test.normalizedEntityNote({ entityType:'product', entityKey:'not-a-uuid', content:'test' }),
  /bar kanonik/i
);

const metadata = new Map([[PRODUCT_ID, {
  drugId:PRODUCT_ID,
  tradeName:'BISOLVON',
  label:'BISOLVON',
  registryNumber:7,
  pdid:'3673',
  activeSubstance:'Bromhexine-HCL',
  strength:'4 mg/5 ml',
  form:'Syrup',
  atc:'R05CB02',
}]]);
const legacy = library._test.mergeLegacyFavoriteMetadataByDrugId({
  entityType:'drug',
  entityKey:'3673|BISOLVON|4 mg/5 ml',
  payload:{ drugId:PRODUCT_ID },
}, metadata);
assert.equal(legacy.payload.tradeName, 'BISOLVON');

assert.doesNotThrow(() => library._test.assertPersonalDrugIdentity([
  { entityType:'product', entityKey:PRODUCT_ID, payload:{ drugId:PRODUCT_ID, tradeName:'BISOLVON' } },
], [
  { entityType:'product', entityKey:PRODUCT_ID, drugId:PRODUCT_ID, payload:{ drugId:PRODUCT_ID, tradeName:'BISOLVON' } },
]));
assert.throws(() => library._test.assertPersonalDrugIdentity([
  { entityType:'product', entityKey:PRODUCT_ID, payload:{} },
], []), /nuk u verifikua/i);

assert.match(server, /drug_id:item\.entityType === 'product'/);
assert.match(server, /PERSONAL_PRODUCT_NOT_ACTIVE/);
assert.match(server, /PERSONAL_PRODUCT_IDENTITY_UNAVAILABLE/);
assert.match(server, /activeOnly:false/);
assert.match(server, /activeOnly:true/);
assert.match(server, /fetchRows\('user_favorites', 'id,user_id,drug_id/);

assert.match(ui, /Identiteti i barit nuk u verifikua/);
assert.doesNotMatch(ui, /Bar i regjistrit nr\./);
assert.doesNotMatch(ui, /Duke ngarkuar të dhënat e barit/);

assert.match(migration, /add column if not exists drug_id uuid/);
assert.match(migration, /user_favorites_drug_id_fkey/);
assert.match(migration, /user_favorites_product_identity_check/);
assert.match(migration, /user_favorites_live_drug_identity_check/);
assert.match(migration, /user_notes_entity_coherence_check/);
assert.match(migration, /trg_harden_user_favorite_drug_identity/);
assert.match(migration, /trg_harden_user_note_drug_identity/);
assert.match(migration, /user_favorites_user_live_drug_unique_idx/);
assert.match(migration, /Active drug favorites remain unresolved after hardening/);
assert.match(migration, /Product notes remain unresolved after hardening/);

console.log('Personal product identity hardening contract passed.');
