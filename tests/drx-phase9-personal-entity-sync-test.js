'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const server=require('../lib/user-library.js');

const source=fs.readFileSync('lib/user-library.js','utf8');
const client=fs.readFileSync('phase9-personal-entities-client.js','utf8');

for(const type of ['substance','variant','product']){
  const favorite=server._test.normalizedFavorite({
    entityType:type,entityKey:'entity-1',payload:{label:'x'},clientUpdatedAt:new Date().toISOString()
  });
  assert.equal(favorite.entityType,type);
  const note=server._test.normalizedEntityNote({
    entityType:type,entityKey:'entity-1',content:'shënim',clientUpdatedAt:new Date().toISOString()
  });
  assert.equal(note.entityType,type);
  assert.equal(note.content,'shënim');
}
assert.throws(()=>server._test.normalizedEntityNote({
  entityType:'lab',entityKey:'x',content:'x'
}),/pavlefshëm/);

assert.match(source,/user_id,entity_type,entity_key/);
assert.match(source,/entityNotes/);
assert.match(source,/PHASE9_NOTE_ENTITY_TYPES/);
assert.match(source,/upsert\('user_notes', 'user_id,entity_type,entity_key'/);

assert.match(client,/const TYPES=new Set\(\['substance','variant','product'\]\)/);
assert.match(client,/tombstones:\{entityNotes:/);
assert.match(client,/credentials:'same-origin'/);
assert.doesNotMatch(client,/localStorage/);

cp.execFileSync(process.execPath,['--check','phase9-personal-entities-client.js'],{stdio:'pipe'});
console.log('DRx Phase 9B personal entity sync contract: PASS');
