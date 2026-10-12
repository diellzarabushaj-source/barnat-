'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto');
const {capture}=require('../scripts/export-storage-bodies.js');
const {spawnSync}=require('node:child_process');
const body=Buffer.from('SYNTHETIC_PRIVATE_FILE\n ë dhe ç'), salt='ab'.repeat(32);
const object={id:'synthetic',bucket_id:'private-files',name:'folder/provë.png',version:'synthetic-version',metadata:{size:body.length,eTag:crypto.createHash('md5').update(body).digest('hex')}};
async function main(){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'drx-storage-backup-'));
  assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));
  let sequence=0;
  try{
    async function run(overrides={}){
      const directory=path.join(folder,'case-'+sequence++); await fs.mkdir(directory);
      const request={inventory:[object],directory,url:'https://ftuchtmolddhhsdcwnqe.supabase.co',key:'sb_secret_synthetic',salt,fetcher:async(url,options)=>{
        assert.equal(new URL(url).hostname,'ftuchtmolddhhsdcwnqe.supabase.co');
        assert.ok(url.includes('/authenticated/private-files/folder/prov%C3%AB.png'));
        assert.equal(new URL(url).searchParams.get('versionId'),'synthetic-version');
        assert.equal(options.redirect,'error'); assert.equal(options.method,'GET');
        assert.equal(options.headers.apikey,'sb_secret_synthetic'); assert.ok(!options.headers.Authorization);
        return new Response(body,{headers:{'content-length':String(body.length)}});
      },...overrides};
      return {directory,promise:capture(request)};
    }
    const success=await run(), proof=await success.promise;
    assert.equal(proof.objectCount,1); assert.equal(proof.objectBytes,body.length);
    assert.deepEqual(await fs.readFile(path.join(success.directory,'storage-objects/000000.bin')),body);
    const encoded=await fs.readFile(path.join(success.directory,'storage-body-manifest.json'));
    assert.equal(proof.manifestFingerprint,crypto.createHash('sha256').update(salt).update(encoded).digest('hex'));
    assert.ok(!JSON.stringify(proof).includes('provë') && !JSON.stringify(proof).includes('private-files') && !JSON.stringify(proof).includes(salt));
    for(const overrides of [{url:'https://evil.example'}, {key:'sb_publishable_synthetic'}, {salt:'invalid'}, {inventory:[{...object,name:'../escape'}]}, {inventory:[object,object]}, {inventory:[{...object,metadata:{size:17*1024*1024}}]}, {fetcher:async()=>new Response('SYNTHETIC_PRIVATE_ERROR',{status:404})}, {fetcher:async()=>new Response(Buffer.from('wrong'),{headers:{'content-length':String(body.length)}})}, {fetcher:async()=>new Response(Buffer.alloc(body.length,0))}]){
      const failure=await run(overrides); await assert.rejects(failure.promise);
    }
    const empty=await run({inventory:[]}), emptyProof=await empty.promise; assert.equal(emptyProof.objectCount,0);
    await fs.writeFile(path.join(success.directory,'private-fingerprint-salt'),salt);
    const python=process.platform==='win32'?'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':'python3';
    const pack=spawnSync(python,['-c','import pathlib,sys,tarfile; p=pathlib.Path(sys.argv[1]); a=tarfile.open(p/"fixture.tar.xz","w:xz"); [a.add(p/n,arcname=n) for n in ["storage-body-manifest.json","private-fingerprint-salt","storage-objects"]]; a.close()',success.directory],{encoding:'utf8'});
    assert.equal(pack.status,0,'Synthetic archive must pack');
    const verify=spawnSync(python,[path.join(__dirname,'../scripts/verify-storage-archive.py'),path.join(success.directory,'fixture.tar.xz')],{encoding:'utf8'});
    assert.equal(verify.status,0); const recovered=JSON.parse(verify.stdout);
    assert.equal(recovered.manifestFingerprint,proof.manifestFingerprint); assert.equal(recovered.objectBytes,body.length);
    await fs.writeFile(path.join(success.directory,'storage-objects/000000.bin'),'corrupt');
    const corruptPack=spawnSync(python,['-c','import pathlib,sys,tarfile; p=pathlib.Path(sys.argv[1]); a=tarfile.open(p/"corrupt.tar.xz","w:xz"); [a.add(p/n,arcname=n) for n in ["storage-body-manifest.json","private-fingerprint-salt","storage-objects"]]; a.close()',success.directory],{encoding:'utf8'});
    assert.equal(corruptPack.status,0);
    const rejected=spawnSync(python,[path.join(__dirname,'../scripts/verify-storage-archive.py'),path.join(success.directory,'corrupt.tar.xz')],{encoding:'utf8'});
    assert.notEqual(rejected.status,0); assert.ok(!rejected.stderr.includes('SYNTHETIC_PRIVATE'));
    console.log('Physical Storage backup: pinned privileged source, encoded/versioned reads, bounds, changed/missing bodies, traversal/duplicates, private evidence, empty inventory and real XZ byte recovery/corruption rejection passed.');
  }finally{await fs.rm(folder,{recursive:true,force:true});}
}
main().catch(()=>{console.error('Storage body regression failed; private diagnostics were not printed.');process.exitCode=1;});
