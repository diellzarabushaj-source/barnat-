'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {unseal,auditRecoveredRows}=require('../lib/library-key-recovery.js');
const {owned,inventory,keyPrefix}=require('./private-backup-inventory.js');
const policy=require('../data/backup-retention.json');
const config=require('../data/library-key-recovery-config.json');
const MAX=65536,MAGIC=Buffer.from('DRXBAK01');
function fail(){throw Error('Private library recovery failed; keys and contents were not printed.');}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function archiveKey(value){if(!/^[a-f0-9]{64}$/.test(value||''))fail();return Buffer.from(value,'hex');}
function wrap(bytes,key){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX-36)fail();
 const header=Buffer.concat([MAGIC,crypto.randomBytes(12)]),cipher=crypto.createCipheriv('aes-256-gcm',archiveKey(key),header.subarray(8));cipher.setAAD(header);
 return Buffer.concat([header,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
}
function unwrap(bytes,key){
 if(!Buffer.isBuffer(bytes)||bytes.length<=36||bytes.length>MAX||!bytes.subarray(0,8).equals(MAGIC))fail();
 const decipher=crypto.createDecipheriv('aes-256-gcm',archiveKey(key),bytes.subarray(8,20));decipher.setAAD(bytes.subarray(0,20));decipher.setAuthTag(bytes.subarray(-16));
 return Buffer.concat([decipher.update(bytes.subarray(20,-16)),decipher.final()]);
}
function recover(candidate,key,expected=config){
 if(expected.wrappedPrivateKeyFormat!=='DRXBAK01-header-aad-v1')fail();
 if(candidate?.schemaVersion!=='drx-library-recovery-vault-v1'||candidate.projectRef!==expected.projectRef||candidate.keyId!==expected.keyId||typeof candidate.wrappedPrivateKey!=='string')fail();
 const wrapped=Buffer.from(candidate.wrappedPrivateKey,'base64');
 if(wrapped.toString('base64')!==candidate.wrappedPrivateKey||hash(wrapped)!==expected.wrappedPrivateKeySha256)fail();
 const pem=unwrap(wrapped,key);
 try{
  const privateKey=crypto.createPrivateKey(pem),publicPem=crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'});
  if(hash(publicPem)!==expected.publicKeySha256)fail();
  return unseal(candidate.packet,privateKey,expected);
 }finally{pem.fill(0);}
}
function decode(bytes,key,expected=config){const plain=unwrap(bytes,key);try{return recover(JSON.parse(plain.toString('utf8')),key,expected);}finally{plain.fill(0);}}
const pathname=keyPrefix+config.keyId+'.enc';
const url='https://'+policy.storeId.slice(6).toLowerCase()+'.private.blob.vercel-storage.com/'+pathname;
async function download(sdk,token,address=url){
 if(!owned({pathname:decodeURIComponent(new URL(address).pathname.slice(1)),url:address},'vault'))fail();
 const response=await sdk.get(address,{access:'private',token,useCache:false,abortSignal:AbortSignal.timeout(60000)});
 if(!response||response.statusCode!==200||!response.stream)fail();
 let size=0;const chunks=[];
 for await(const chunk of response.stream){const part=Buffer.from(chunk);size+=part.length;if(size>MAX)fail();chunks.push(part);}return Buffer.concat(chunks);
}
async function register({candidate,rows,key,token,sdk,fetcher=fetch,expected=config}){
 if(!token)fail();
 const pathname=keyPrefix+expected.keyId+'.enc';
 const proof=auditRecoveredRows(rows,recover(candidate,key,expected));if(proof.status!=='PASS')fail();
 const bytes=wrap(Buffer.from(JSON.stringify(candidate)),key),stored=await inventory(sdk,token,bytes.length);
 if(stored.some(item=>item.pathname===pathname||item.pathname===pathname.replace(/\.enc$/,'.verified.json')))fail();
 const blob=await sdk.put(pathname,bytes,{access:'private',token,addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream'});
 if(blob.pathname!==pathname||!owned(blob,'vault'))fail();
 const anonymous=await fetcher(blob.url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});if(![401,403,404].includes(anonymous.status))fail();
 const downloaded=await download(sdk,token,blob.url);if(hash(downloaded)!==hash(bytes))fail();
 const independent=auditRecoveredRows(rows,decode(downloaded,key,expected));if(JSON.stringify(independent)!==JSON.stringify(proof))fail();
 const result={schemaVersion:'drx-library-key-recovery-proof-v1',status:'PASS',scope:'public.user_prescriptions',keyId:expected.keyId,projectRef:expected.projectRef,prescriptionRows:proof.prescriptionRows,ownerCount:proof.ownerCount,derivedCipherKeysOnly:true,sessionSigningSecretExported:false,encryptedSha256:hash(bytes),bytes:bytes.length,anonymousReadRejected:true,downloadAndIndependentDecryptionVerified:true,plaintextPublished:false};
 const marker=await sdk.put(pathname.replace(/\.enc$/,'.verified.json'),JSON.stringify(result),{access:'private',token,addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
 if(marker.pathname!==pathname.replace(/\.enc$/,'.verified.json')||!owned(marker,'vault'))fail();return result;
}
async function run(){
 const mode=process.argv[2],key=process.env.DRX_BACKUP_ARCHIVE_KEY,token=process.env.DRX_BACKUP_BLOB_TOKEN,sdk=require('@vercel/blob');
 if(mode==='register'){
  if(process.env.GITHUB_REF!=='refs/heads/main')fail();
  const wrapped=process.env.DRX_RECOVERY_WRAPPED_PRIVATE_KEY,packet=JSON.parse(process.env.DRX_RECOVERY_SEALED_PACKET||'null');
  if(typeof wrapped!=='string'||wrapped.length>10000)fail();
  const {supabaseRequest,SUPABASE_URL}=require('../lib/supabase-data-api.js');if(SUPABASE_URL!=='https://ftuchtmolddhhsdcwnqe.supabase.co')fail();
  const rows=await require('./fetch-recovery-prescriptions.js').fetchRows(supabaseRequest);
  const candidate={schemaVersion:'drx-library-recovery-vault-v1',projectRef:config.projectRef,keyId:config.keyId,wrappedPrivateKey:wrapped,packet};
  const proof=await register({candidate,rows,key,token,sdk});await fs.writeFile('drx-library-key-recovery-evidence.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
 }else if(mode==='capture'){
  const [rowFile,vaultFile,evidenceFile]=process.argv.slice(3);if((await fs.stat(rowFile)).size>32*1024*1024)fail();
  const rows=JSON.parse(await fs.readFile(rowFile,'utf8')),bytes=await download(sdk,token),proof=auditRecoveredRows(rows,decode(bytes,key));if(proof.status!=='PASS')fail();
  await fs.writeFile(vaultFile,bytes,{flag:'wx',mode:0o600});
  const evidence=JSON.parse(await fs.readFile(evidenceFile,'utf8'));
  evidence.prescriptionKeyRecovery={...proof,scope:'public.user_prescriptions',independentCipherKeyRecoveryVerified:true,sessionSigningSecretExported:false,encryptedVaultSha256:hash(bytes),keyId:config.keyId};
  await fs.writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
  console.log('Stored prescription envelopes independently decrypted using the private recovery copy.');
 }else fail();
}
if(require.main===module)run().catch(()=>{console.error('Private library recovery failed; credentials and private diagnostics are not published.');process.exitCode=1;});
module.exports={wrap,unwrap,recover,decode,register,download,hash};
