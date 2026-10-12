'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const recovery=require('../lib/library-key-recovery.js'),dataCrypto=require('../lib/user-data-crypto.js');
const tracked=['SESSION_SECRET','MEDINDEX_SESSION_SECRET','MEDINDEX_USER_DATA_KEY','MEDINDEX_USER_DATA_KEY_ID','MEDINDEX_USER_DATA_PREVIOUS_KEYS','MEDINDEX_USER_DATA_REQUIRE_DEDICATED'];
const saved=Object.fromEntries(tracked.map(k=>[k,process.env[k]]));
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const config={schemaVersion:'drx-library-key-recovery-config-v1',projectRef:'ftuchtmolddhhsdcwnqe',keyId:'synthetic_recovery',publicKey:pair.publicKey,publicKeySha256:crypto.createHash('sha256').update(pair.publicKey).digest('hex')};
const clear=()=>{for(const key of tracked)delete process.env[key];};
try{
 clear();const secret='synthetic-session-key-that-must-never-be-exported';process.env.SESSION_SECRET=secret;
 const value={text:'SYNTHETIC_ONLY\n ë dhe ç ',items:[{id:'synthetic'}]},context='synthetic-owner:prescription:synthetic-client';
 const legacy=dataCrypto.encryptJson(value,context),bundle=recovery.keyBundle();
 assert.ok(!JSON.stringify(bundle).includes(secret));assert.ok(!JSON.stringify(bundle).includes('SESSION_SECRET'));
 const packet=recovery.seal(bundle,config);assert.ok(!JSON.stringify(packet).includes(secret));
 const restored=recovery.unseal(packet,pair.privateKey,config);
 clear();assert.deepEqual(recovery.decryptRecovered(legacy,context,restored),value,'Recovery must work without original session credentials');
 assert.throws(()=>recovery.decryptRecovered(legacy,'another-owner:prescription:synthetic-client',restored));
 for(const field of ['ciphertext','iv','tag','wrappedKey']){const changed=structuredClone(packet),b=Buffer.from(changed[field],'base64');b[0]^=1;changed[field]=b.toString('base64');assert.throws(()=>recovery.unseal(changed,pair.privateKey,config));}
 assert.throws(()=>recovery.unseal({...packet,keyId:'another'},pair.privateKey,config));
 const wrong=crypto.generateKeyPairSync('rsa',{modulusLength:3072});assert.throws(()=>recovery.unseal(packet,wrong.privateKey,config));
 process.env.MEDINDEX_USER_DATA_KEY='synthetic-dedicated-library-key-at-least-32';process.env.MEDINDEX_USER_DATA_KEY_ID='__proto__';process.env.SESSION_SECRET=secret;
 const keyedEnvelope=dataCrypto.encryptJson(value,context),keyedBundle=recovery.keyBundle();assert.ok(Object.hasOwn(keyedBundle.keyed,'__proto__'));
 const keyedRecovered=recovery.unseal(recovery.seal(keyedBundle,config),pair.privateKey,config);clear();
 assert.deepEqual(recovery.decryptRecovered(keyedEnvelope,context,keyedRecovered),value);assert.deepEqual(recovery.decryptRecovered(legacy,context,keyedRecovered),value);
 assert.throws(()=>recovery.decryptRecovered({...keyedEnvelope,kid:'constructor'},context,keyedRecovered));
 process.env.SESSION_SECRET=secret;
 const rows=[{user_id:'synthetic-owner',client_id:'synthetic-client',payload:legacy}];
 assert.equal(recovery.auditRows(rows).prescriptionRows,1);assert.equal(recovery.auditRows([]).allStoredEnvelopesDecrypted,false);
 assert.throws(()=>recovery.auditRows([...rows,...rows]));assert.throws(()=>recovery.auditRows([{...rows[0],user_id:'wrong-owner'}]));
 assert.throws(()=>recovery.seal({...bundle,SESSION_SECRET:secret},config));
 assert.throws(()=>recovery.seal(bundle,{...config,publicKey:pair.privateKey,publicKeySha256:crypto.createHash('sha256').update(pair.privateKey).digest('hex')}));
 console.log('Library recovery: derived cipher keys only, independent v1/v2 recovery, owner binding, malformed/unknown key IDs, tamper/wrong-key rejection and private aggregate evidence passed.');
}finally{clear();for(const [key,value] of Object.entries(saved))if(value!==undefined)process.env[key]=value;}
