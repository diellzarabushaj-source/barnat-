'use strict';
const crypto=require('node:crypto');
const {decryptJson,_test}=require('./user-data-crypto.js');
function fail(){throw new Error('Library recovery verification failed; private contents were not printed.');}
function keyBundle(env=process.env){
  const current=String(env.MEDINDEX_USER_DATA_KEY||'').trim(),id=String(env.MEDINDEX_USER_DATA_KEY_ID||'').trim();
  const previous=JSON.parse(env.MEDINDEX_USER_DATA_PREVIOUS_KEYS||'{}');
  if(!previous||Array.isArray(previous)||typeof previous!=='object'||Object.keys(previous).length>8)fail();
  const keyed=Object.create(null);
  if(id){if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||current.length<32)fail();keyed[id]=_test.encryptionKey(current).toString('base64');}
  for(const [name,secret] of Object.entries(previous)){
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(name)||name===id||typeof secret!=='string'||secret.trim().length<32)fail();
    keyed[name]=_test.encryptionKey(secret.trim()).toString('base64');
  }
  const candidates=[current,...Object.values(previous),env.SESSION_SECRET,env.MEDINDEX_SESSION_SECRET].filter(v=>typeof v==='string'&&v.trim().length>=32).map(v=>v.trim());
  const legacy=[...new Set(candidates.map(secret=>_test.encryptionKey(secret).toString('base64')))];
  if(!legacy.length)fail();
  return{schemaVersion:'drx-library-cipher-keys-v1',legacy,keyed};
}
function validateBundle(bundle){
  if(bundle?.schemaVersion!=='drx-library-cipher-keys-v1'||!Array.isArray(bundle.legacy)||!bundle.legacy.length||bundle.legacy.length>11||!bundle.keyed||Array.isArray(bundle.keyed)||typeof bundle.keyed!=='object'||Object.keys(bundle.keyed).length>9)fail();
  if(Object.keys(bundle).some(k=>!['schemaVersion','legacy','keyed'].includes(k)))fail();
  if(Object.keys(bundle.keyed).some(k=>!/^[A-Za-z0-9_-]{1,64}$/.test(k)))fail();
  for(const value of [...bundle.legacy,...Object.values(bundle.keyed)])if(typeof value!=='string'||Buffer.from(value,'base64').length!==32||Buffer.from(value,'base64').toString('base64')!==value)fail();
  return bundle;
}
function validateConfig(config){
  if(config?.schemaVersion!=='drx-library-key-recovery-config-v1'||config.projectRef!=='ftuchtmolddhhsdcwnqe'||!/^[A-Za-z0-9_-]{1,64}$/.test(config.keyId)||crypto.createHash('sha256').update(config.publicKey||'').digest('hex')!==config.publicKeySha256)fail();
  if(typeof config.publicKey!=='string'||!config.publicKey.startsWith('-----BEGIN PUBLIC KEY-----')||config.publicKey.length>4096)fail();
  const key=crypto.createPublicKey(config.publicKey);if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<3072)fail();return key;
}
function packetAad(packet){return Buffer.from(JSON.stringify([packet.schemaVersion,packet.keyId,packet.projectRef,packet.publicKeySha256]),'utf8');}
function seal(bundle,config){
  validateBundle(bundle);
  const publicKey=validateConfig(config),dataKey=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  const packet={schemaVersion:'drx-library-key-packet-v1',keyId:config.keyId,projectRef:config.projectRef,publicKeySha256:config.publicKeySha256};
  const cipher=crypto.createCipheriv('aes-256-gcm',dataKey,iv);cipher.setAAD(packetAad(packet));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(bundle),'utf8'),cipher.final()]);
  return{...packet,wrappedKey:crypto.publicEncrypt({key:publicKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},dataKey).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
function unseal(packet,privateKey,config){
  validateConfig(config);
  if(packet?.schemaVersion!=='drx-library-key-packet-v1'||packet.keyId!==config.keyId||packet.projectRef!==config.projectRef||packet.publicKeySha256!==config.publicKeySha256||JSON.stringify(packet).length>32768)fail();
  const key=crypto.privateDecrypt({key:privateKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(packet.wrappedKey,'base64'));
  const iv=Buffer.from(packet.iv,'base64'),tag=Buffer.from(packet.tag,'base64');if(key.length!==32||iv.length!==12||tag.length!==16)fail();
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(packetAad(packet));decipher.setAuthTag(tag);
  const bundle=JSON.parse(Buffer.concat([decipher.update(Buffer.from(packet.ciphertext,'base64')),decipher.final()]).toString('utf8'));
  return validateBundle(bundle);
}
function decryptRecovered(envelope,context,bundle){
  validateBundle(bundle);
  if(!envelope||![1,2].includes(envelope.v)||envelope.alg!=='A256GCM')fail();
  const values=envelope.v===2?(typeof envelope.kid==='string'&&Object.hasOwn(bundle.keyed,envelope.kid)?[bundle.keyed[envelope.kid]]:[]):bundle.legacy;
  const iv=Buffer.from(String(envelope.iv||''),'base64url'),tag=Buffer.from(String(envelope.tag||''),'base64url'),body=Buffer.from(String(envelope.ciphertext||''),'base64url');
  if(iv.length!==12||tag.length!==16||body.length>160*1024)fail();
  for(const value of values){try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(value,'base64'),iv);
    decipher.setAAD(Buffer.from((envelope.v===2?'medindex-user-library-v2:'+envelope.kid:'medindex-user-library-v1')+':'+context));
    decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
  }catch{}}
  fail();
}
function auditRows(rows,decrypt=decryptJson){
  if(!Array.isArray(rows)||rows.length>10000)fail();
  const owners=new Set(),identities=new Set();let count=0;
  for(const row of rows){
    if(typeof row.user_id!=='string'||typeof row.client_id!=='string'||!row.user_id||!row.client_id)fail();
    const identity=row.user_id+':prescription:'+row.client_id;if(identities.has(identity))fail();identities.add(identity);
    const value=decrypt(row.payload,identity);if(value===null||typeof value!=='object'||Array.isArray(value))fail();
    if(JSON.stringify(value).length>160*1024)fail();owners.add(row.user_id);count++;
  }
  return{status:count?'PASS':'EMPTY_NO_EXISTING_ENVELOPE',prescriptionRows:count,ownerCount:owners.size,allStoredEnvelopesDecrypted:count>0,plaintextPublished:false};
}
function auditRecoveredRows(rows,bundle){return auditRows(rows,(envelope,context)=>decryptRecovered(envelope,context,bundle));}
module.exports={keyBundle,seal,unseal,auditRows,auditRecoveredRows,decryptRecovered,validateBundle};
