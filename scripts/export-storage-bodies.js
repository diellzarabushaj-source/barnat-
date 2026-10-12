'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const PROJECT = 'ftuchtmolddhhsdcwnqe';
const MAX_OBJECT = 16*1024*1024, MAX_TOTAL = 32*1024*1024;
function failure(code) { const error=new Error('Storage backup failed'); error.code=code; return error; }
async function capture({inventory, directory, url, key, salt, fetcher=fetch}) {
  const base = new URL(url);
  if(base.protocol!=='https:' || base.hostname!==PROJECT+'.supabase.co' || base.port || base.username || base.password || base.search || base.hash || base.pathname!=='/') throw failure('source_invalid');
  let privileged = /^sb_secret_[A-Za-z0-9_-]+$/.test(key||'');
  if(!privileged) { try { privileged=JSON.parse(Buffer.from(String(key).split('.')[1],'base64url')).role==='service_role' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key); } catch {} }
  if(!privileged || !/^[a-f0-9]{64}$/.test(salt||'')) throw failure('configuration_invalid');
  if(!Array.isArray(inventory) || inventory.length>256) throw failure('inventory_invalid');
  const identities=new Set(); let expectedTotal=0;
  for(const object of inventory) {
    if(!object || !/^[A-Za-z0-9_.-]{1,100}$/.test(object.bucket_id||'') || typeof object.name!=='string' || !object.name || /[\x00-\x1f\\]/.test(object.name) || object.name.split('/').some(segment=>!segment||segment==='.'||segment==='..')) throw failure('inventory_invalid');
    const size=Number(object.metadata?.size);
    if(!Number.isSafeInteger(size)||size<0||size>MAX_OBJECT) throw failure('object_bound');
    expectedTotal+=size;
    const identity=object.bucket_id+'/'+object.name;
    if(identities.has(identity)) throw failure('inventory_invalid'); identities.add(identity);
  }
  if(expectedTotal>MAX_TOTAL) throw failure('total_bound');
  const bodyDirectory=path.join(directory,'storage-objects'); await fs.mkdir(bodyDirectory,{recursive:false,mode:0o700});
  const records=[];
  for(let index=0;index<inventory.length;index++) {
    const object=inventory[index], expected=Number(object.metadata.size);
    const endpoint=new URL('storage/v1/object/authenticated/'+encodeURIComponent(object.bucket_id)+'/'+object.name.split('/').map(encodeURIComponent).join('/'),base);
    if(object.version) endpoint.searchParams.set('versionId',String(object.version));
    const response=await fetcher(endpoint.href,{method:'GET',headers:{apikey:key,...(key.startsWith('sb_')?{}:{Authorization:'Bearer '+key})},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(response.status!==200 || !response.body) throw failure('download_failed');
    const contentLength=response.headers.get('content-length');
    if(contentLength!==null && !response.headers.get('content-encoding') && Number(contentLength)!==expected) throw failure('content_changed');
    const chunks=[]; let received=0;
    for await(const chunk of response.body) { received+=chunk.length; if(received>expected||received>MAX_OBJECT) throw failure('object_bound'); chunks.push(Buffer.from(chunk)); }
    if(received!==expected) throw failure('content_changed');
    const body=Buffer.concat(chunks);
    const etag=String(object.metadata.eTag||object.metadata.etag||'').replace(/^"|"$/g,'');
    if(/^[a-f0-9]{32}$/i.test(etag) && crypto.createHash('md5').update(body).digest('hex')!==etag.toLowerCase()) throw failure('content_changed');
    const filename='storage-objects/'+String(index).padStart(6,'0')+'.bin';
    await fs.writeFile(path.join(directory,filename),body,{flag:'wx',mode:0o600});
    records.push({source:object,file:filename,bytes:received,sha256:crypto.createHash('sha256').update(body).digest('hex')});
  }
  const manifest=JSON.stringify(records,null,2)+'\n';
  await fs.writeFile(path.join(directory,'storage-body-manifest.json'),manifest,{flag:'wx',mode:0o600});
  const proof={objectCount:records.length,objectBytes:expectedTotal,completeInventoryCaptured:true,manifestFingerprint:crypto.createHash('sha256').update(salt).update(manifest).digest('hex')};
  await fs.writeFile(path.join(directory,'storage-bodies-proof.json'),JSON.stringify(proof)+'\n',{flag:'wx',mode:0o600});
  return proof;
}
if(require.main===module) {
  const [inventoryFile,directory]=process.argv.slice(2);
  fs.readFile(inventoryFile,'utf8').then(JSON.parse).then(inventory=>capture({inventory,directory,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,salt:process.env.DRX_BACKUP_FINGERPRINT_SALT}))
    .then(proof=>console.log(JSON.stringify(proof)))
    .catch(error=>{const allowed=['source_invalid','configuration_invalid','inventory_invalid','object_bound','total_bound','download_failed','content_changed']; console.error('Storage body capture failed: '+(allowed.includes(error.code)?error.code:'capture_failed')+'; private diagnostics are not published.');process.exitCode=1;});
}
module.exports={capture};
