'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');
const {encryptFile} = require('../scripts/backup-archive-crypto.js');
const {retain, ownedBlob} = require('../scripts/retain-private-backup.js');
const policy = require('../data/backup-retention.json');
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'drx-retention-test-'));
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  const file = name => path.join(directory, name), key='ab'.repeat(32), commit='a'.repeat(40);
  const urlFor = pathname => `https://${policy.storeId.slice(6).toLowerCase()}.private.blob.vercel-storage.com/${pathname}`;
  const original=file('source.tgz'), archive=file('encrypted.enc'), evidenceFile=file('evidence.json');
  const base={status:'PASS',restoreVerified:true,personalLibraryRowParityVerified:true,sourceManifest:{count:1},restoredManifest:{count:1},privateContentParityVerified:false,decryptionVerified:false,encryptionKeyRecoveryVerified:false};
  const old=[];
  for(let day=1;day<=14;day++) {
    const pathname=policy.prefix+`202609${String(day).padStart(2,'0')}T030000Z_${commit}_old.enc`;
    old.push({pathname,url:urlFor(pathname),size:64});
    const marker=pathname.replace(/\.enc$/,'.verified.json');
    old.push({pathname:marker,url:urlFor(marker),size:256});
  }
  const orphan=policy.prefix+`20300101T030000Z_${commit}_old.enc`;
  old.push({pathname:orphan,url:urlFor(orphan),size:64});
  try {
    await fs.writeFile(original,'SYNTHETIC_BACKUP_CONTENT\n ë dhe ç ');
    await encryptFile(original,archive,key);
    async function run({inventory=old,corrupt=false,anonymous=404,wrongKey=false,failProof=false}={}) {
      await fs.writeFile(evidenceFile,JSON.stringify(base));
      const memory=new Map(),calls=[];
      const sdk={
        async list(){return {blobs:inventory,hasMore:false};},
        async put(pathname,body,options){
          calls.push(['put',pathname]);
          assert.equal(options.access,'private'); assert.equal(options.allowOverwrite,false);
          if(failProof && pathname.endsWith('.verified.json')) throw new Error('Synthetic proof failure');
          const chunks=[];
          if(typeof body==='string')chunks.push(Buffer.from(body)); else for await(const chunk of body)chunks.push(chunk);
          memory.set(pathname,Buffer.concat(chunks));
          return {pathname,url:urlFor(pathname)};
        },
        async get(url,options){
          assert.equal(options.access,'private'); assert.equal(options.useCache,false);
          const name=decodeURIComponent(new URL(url).pathname.slice(1));
          const data=Buffer.from(memory.get(name)); if(corrupt)data[30]^=1;
          calls.push(['get',name]); return {statusCode:200,stream:Readable.toWeb(Readable.from([data]))};
        },
        async del(urls){calls.push(['del',urls]);}
      };
      const request={archive,original,evidenceFile,token:'synthetic-token',key:wrongKey?'cd'.repeat(32):key,keyId:'backup_test',commit,sdk,now:new Date('2026-10-12T03:00:00Z'),fetcher:async()=>({status:anonymous})};
      return {calls,memory,promise:retain(request)};
    }
    const success=await run(), result=await success.promise;
    assert.equal(result.retainedCount,14); assert.equal(result.prunedCount,1); assert.equal(result.unverifiedArchivesCount,1);
    assert.ok(result.downloadVerified && result.archiveDecryptionVerified && result.anonymousReadRejected);
    const deletes=success.calls.filter(call=>call[0]==='del');
    assert.equal(deletes.length,1); assert.equal(deletes[0][1].length,2);
    assert.ok(deletes[0][1].every(url=>!url.includes('20300101')));
    const published=JSON.parse(await fs.readFile(evidenceFile,'utf8'));
    assert.equal(published.decryptionVerified,false,'Archive decryption does not prove library decryption');
    assert.ok(!JSON.stringify(published).includes(key));
    for(const scenario of [{corrupt:true},{anonymous:200},{wrongKey:true},{failProof:true},{inventory:[{...old[0],size:policy.maxStoredBytes}]},{inventory:[{...old[0],url:old[0].url.replace('.private.','.public.')}]}]) {
      const rejected=await run(scenario); await assert.rejects(rejected.promise);
      assert.equal(rejected.calls.filter(call=>call[0]==='del').length,0,'No old backup is removed before private recovery and marker publication');
    }
    assert.ok(!(await fs.readdir(directory)).some(name=>name.startsWith('download-')));
    assert.equal(ownedBlob({...old[0],url:old[0].url+'?token=unexpected'}),false);
    console.log('Private backup retention: authenticated recovery, anonymous denial, marked-copy window, unverified orphan preservation, capacity, private destination, corrupted bytes/wrong key, failed-proof ordering and scratch cleanup passed.');
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}
main().catch(()=>{console.error('Backup retention regression failed.');process.exitCode=1;});
