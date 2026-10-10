'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const server=require('../lib/user-library.js');

const source=fs.readFileSync('lib/user-library.js','utf8');
const client=fs.readFileSync('phase9-personal-entities-client.js','utf8');

for(const type of ['substance','variant','product']){
  const entityKey=type==='product'?'11111111-1111-4111-8111-111111111111':'entity-1';
  const favorite=server._test.normalizedFavorite({
    entityType:type,entityKey,payload:{label:'x'},clientUpdatedAt:new Date().toISOString()
  });
  assert.equal(favorite.entityType,type);
  const note=server._test.normalizedEntityNote({
    entityType:type,entityKey,content:'shënim',clientUpdatedAt:new Date().toISOString()
  });
  assert.equal(note.entityType,type);
  assert.equal(note.content,'shënim');
  assert.equal(favorite.entityKey,entityKey);
  assert.equal(note.entityKey,entityKey);
}
for(const normalize of [server._test.normalizedFavorite,server._test.normalizedEntityNote]){
  assert.throws(()=>normalize({entityType:'product',entityKey:'entity-1',content:'x',payload:{}}),error=>error.code==='INVALID_PRODUCT_ID','A product must keep canonical UUID identity');
}
assert.throws(()=>server._test.normalizedEntityNote({
  entityType:'lab',entityKey:'x',content:'x'
}),/pavlefshëm/);

assert.match(source,/user_id,entity_type,entity_key/);
assert.match(source,/entityNotes/);
assert.match(source,/PHASE9_NOTE_ENTITY_TYPES/);
assert.match(source,/rpc\/write_user_notes_cas/);
assert.doesNotMatch(source,/upsert\('user_notes'/);

assert.match(client,/const TYPES=new Set\(\['drug','substance','variant','product'\]\)/);
assert.match(client,/tombstones:\{entityNotes:/);
assert.match(client,/credentials:'same-origin'/);
assert.doesNotMatch(client,/localStorage/);

cp.execFileSync(process.execPath,['--check','phase9-personal-entities-client.js'],{stdio:'pipe'});
console.log('DRx Phase 9B personal entity sync contract: PASS');
