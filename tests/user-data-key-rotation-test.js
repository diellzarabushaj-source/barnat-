'use strict';
const assert=require('node:assert/strict');
const {encryptJson,decryptJson}=require('../lib/user-data-crypto.js');
const names=['MEDINDEX_USER_DATA_KEY','MEDINDEX_USER_DATA_KEY_ID','MEDINDEX_USER_DATA_PREVIOUS_KEYS','MEDINDEX_USER_DATA_REQUIRE_DEDICATED','SESSION_SECRET','MEDINDEX_SESSION_SECRET'];
const original=Object.fromEntries(names.map(key => [key,process.env[key]]));
try {
  names.forEach(key => delete process.env[key]);
  process.env.SESSION_SECRET='legacy-session-key-'.repeat(3);
  const data={diagnosis:'Test sintetik',note:'  Teksti\nme ë dhe rreshta.  '},context='synthetic-owner:note:123';
  const legacy=encryptJson(data,context); assert.equal(legacy.v,1);
  process.env.MEDINDEX_USER_DATA_KEY='dedicated-key-a-'.repeat(4);
  process.env.MEDINDEX_USER_DATA_KEY_ID='key_a';
  assert.deepEqual(decryptJson(legacy,context),data);
  const a=encryptJson(data,context); assert.equal(a.v,2); assert.equal(a.kid,'key_a');
  process.env.MEDINDEX_USER_DATA_PREVIOUS_KEYS=JSON.stringify({key_a:process.env.MEDINDEX_USER_DATA_KEY});
  process.env.MEDINDEX_USER_DATA_KEY='dedicated-key-b-'.repeat(4); process.env.MEDINDEX_USER_DATA_KEY_ID='key_b';
  const b=encryptJson(data,context); assert.equal(b.kid,'key_b');
  // Restore an isolated synthetic backup after rotation; no production data or keys.
  for (const envelope of [legacy,a,b]) assert.deepEqual(decryptJson(JSON.parse(JSON.stringify(envelope)),context),data);
  assert.throws(()=>decryptJson(a,'another-owner:note:123'));
  assert.throws(()=>decryptJson({...a,kid:'key_b'},context));
  assert.throws(()=>decryptJson({...b,kid:'unknown'},context),/disponueshëm/);
  assert.throws(()=>decryptJson({...b,ciphertext:b.ciphertext.slice(0,-2)+'aa'},context));
  process.env.MEDINDEX_USER_DATA_PREVIOUS_KEYS='{}'; assert.throws(()=>decryptJson(a,context));
  delete process.env.MEDINDEX_USER_DATA_KEY; assert.throws(()=>encryptJson(data,context),/dedikuar/);
  delete process.env.MEDINDEX_USER_DATA_KEY_ID; process.env.MEDINDEX_USER_DATA_REQUIRE_DEDICATED='1';
  assert.throws(()=>encryptJson(data,context),/dedikuar/);
} finally { for (const [key,value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key]=value; } }
console.log('Versioned library keys: synthetic backup restore, rotation, legacy read, owner isolation and tamper checks passed.');
