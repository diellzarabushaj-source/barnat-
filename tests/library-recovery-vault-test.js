'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{Readable}=require('node:stream'),{spawnSync}=require('node:child_process');
const vault=require('../scripts/library-recovery-vault.js'),recovery=require('../lib/library-key-recovery.js'),dataCrypto=require('../lib/user-data-crypto.js');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {fetchRows}=require('../scripts/fetch-recovery-prescriptions.js'),{inventory,keyPrefix}=require('../scripts/private-backup-inventory.js'),policy=require('../data/backup-retention.json');
async function main(){
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),key='ab'.repeat(32);
 const wrapped=vault.wrap(Buffer.from(pair.privateKey),key),config={schemaVersion:'drx-library-key-recovery-config-v1',projectRef:'ftuchtmolddhhsdcwnqe',keyId:'synthetic_recovery',publicKey:pair.publicKey,publicKeySha256:vault.hash(pair.publicKey),wrappedPrivateKeySha256:vault.hash(wrapped)};
 const sourceSecret='synthetic-source-session-key-that-must-not-leave-the-server';
 const saved=process.env.SESSION_SECRET;process.env.SESSION_SECRET=sourceSecret;
 let rows,bundle;try{bundle=recovery.keyBundle();rows=[{user_id:'synthetic-owner',client_id:'synthetic-item',payload:dataCrypto.encryptJson({text:'SYNTHETIC_ONLY ë\nç'},'synthetic-owner:prescription:synthetic-item')}];}finally{if(saved===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=saved;}
 const candidate={schemaVersion:'drx-library-recovery-vault-v1',projectRef:config.projectRef,keyId:config.keyId,wrappedPrivateKey:wrapped.toString('base64'),packet:recovery.seal(bundle,config)};
 assert.equal(recovery.auditRecoveredRows(rows,vault.recover(candidate,key,config)).prescriptionRows,1);
 assert.ok(!JSON.stringify(candidate).includes(sourceSecret));
 async function run({anonymous=404,corrupt=false,stored=[],failMarker=false,sourceRows=rows}={}){
  const memory=new Map(),calls=[],urlFor=name=>'https://'+policy.storeId.slice(6).toLowerCase()+'.private.blob.vercel-storage.com/'+name;
  const sdk={async list(options){assert.equal(options.prefix,undefined,'Capacity must count every private object');return{blobs:stored,hasMore:false};},async put(name,bytes,options){assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);calls.push(name);if(failMarker&&name.endsWith('.verified.json'))throw Error('Synthetic marker failure');memory.set(name,Buffer.from(bytes));return{pathname:name,url:urlFor(name)};},async get(url){let bytes=Buffer.from(memory.get(decodeURIComponent(new URL(url).pathname.slice(1))));if(corrupt)bytes[27]^=1;return{statusCode:200,stream:Readable.toWeb(Readable.from([bytes]))};}};
  return{promise:vault.register({candidate,rows:sourceRows,key,token:'synthetic-token',sdk,expected:config,fetcher:async()=>({status:anonymous})}),calls,memory};
 }
 const success=await run(),proof=await success.promise;assert.equal(proof.status,'PASS');assert.equal(proof.sessionSigningSecretExported,false);assert.equal(success.calls.length,2);assert.ok(!JSON.stringify(proof).includes('synthetic-owner'));
 const bytes=success.memory.get(keyPrefix+config.keyId+'.enc');assert.ok(!bytes.includes(Buffer.from(pair.privateKey)));assert.ok(!bytes.includes(Buffer.from(JSON.stringify(bundle))));
 assert.equal(recovery.auditRecoveredRows(rows,vault.decode(bytes,key,config)).prescriptionRows,1);
 assert.throws(()=>vault.decode(bytes,'cd'.repeat(32),config));assert.throws(()=>vault.recover({...candidate,wrappedPrivateKey:wrapped.subarray(1).toString('base64')},key,config));
 const url='https://'+policy.storeId.slice(6).toLowerCase()+'.private.blob.vercel-storage.com/';
 for(const scenario of [{anonymous:200},{corrupt:true},{sourceRows:[]},{sourceRows:[{...rows[0],user_id:'wrong-owner'}]},{failMarker:true},{stored:[{pathname:keyPrefix+config.keyId+'.enc',url:url+keyPrefix+config.keyId+'.enc',size:1}]},{stored:[{pathname:keyPrefix+'another.enc',url:url+keyPrefix+'another.enc',size:policy.maxStoredBytes}]}]){const rejected=await run(scenario);await assert.rejects(rejected.promise);if(scenario.anonymous||scenario.corrupt)assert.equal(rejected.calls.length,1,'No verification marker after failed recovery');}
 await assert.rejects(inventory({list:async()=>({blobs:[{pathname:'unexpected.enc',url:url+'unexpected.enc',size:1}],hasMore:false})},'synthetic',10));
 for(const [env,ref,flag] of [['preview','main','library_recovery_20261012'],['production','branch','library_recovery_20261012'],['production','main','0']]){
  const result=spawnSync(process.execPath,['scripts/audit-library-key-recovery.js'],{encoding:'utf8',env:{...process.env,VERCEL_ENV:env,VERCEL_GIT_COMMIT_REF:ref,DRX_LIBRARY_KEY_RECOVERY_ENABLED:flag}});assert.equal(result.status,0);assert.equal(result.stdout.trim(),'DRX_LIBRARY_RECOVERY_NOT_ENABLED');
 }
 const sourceResponse=range=>({headers:{get:()=>range}});
 assert.deepEqual(await fetchRows(async()=>({data:rows,response:sourceResponse('0-0/1')})),rows);
 for(const range of ['', '0-0/*', 'garbage', '0-0/10001'])await assert.rejects(fetchRows(async()=>({data:rows,response:sourceResponse(range)})));
 await assert.rejects(fetchRows(async()=>({data:[],response:sourceResponse('0-0/1')})));
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'drx-library-archive-'));
 assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));
 try{
  await fs.writeFile(path.join(folder,'library-recovery-vault.enc'),bytes);
  await fs.writeFile(path.join(folder,'library-recovery-config.json'),JSON.stringify(config));
  await fs.writeFile(path.join(folder,'library-recovery-prescriptions.json'),JSON.stringify(rows));
  const python=process.platform==='win32'?'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':'python3';
  const pack=()=>spawnSync(python,['-c','import pathlib,sys,tarfile; p=pathlib.Path(sys.argv[1]); a=tarfile.open(p/"fixture.tar.xz","w:xz"); [a.add(p/n,arcname=n) for n in ["library-recovery-vault.enc","library-recovery-config.json","library-recovery-prescriptions.json"]]; a.close()',folder],{encoding:'utf8'});
  assert.equal(pack().status,0);
  const verify=()=>spawnSync(python,['scripts/verify-library-archive.py',path.join(folder,'fixture.tar.xz')],{encoding:'utf8',env:{...process.env,DRX_BACKUP_ARCHIVE_KEY:key}});
  const verified=verify();assert.equal(verified.status,0,verified.stderr);assert.equal(JSON.parse(verified.stdout).prescriptionRows,1);
  await fs.writeFile(path.join(folder,'library-recovery-prescriptions.json'),JSON.stringify([{...rows[0],user_id:'wrong-owner'}]));assert.equal(pack().status,0);
  const rejected=verify();assert.notEqual(rejected.status,0);assert.ok(!rejected.stderr.includes('SYNTHETIC_ONLY'));assert.ok(!rejected.stdout.includes('wrong-owner'));
 }finally{await fs.rm(folder,{recursive:true,force:true});}
 console.log('Private recovery vault: independent real-envelope-shaped recovery, ciphertext-only storage, source credential exclusion, tamper/wrong owner, private boundary, immutable publication, total-store capacity and production-only audit gates passed.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
