'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {configuration}=require('../scripts/native-recovery-api.js');
const jwt=role=>'eyJ'+Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.abc';
assert.deepEqual(configuration({API_URL:'http://127.0.0.1:54321',ANON_KEY:jwt('anon'),SERVICE_ROLE_KEY:jwt('service_role')}),{anon:jwt('anon'),service:jwt('service_role')});
for(const API_URL of ['https://ftuchtmolddhhsdcwnqe.supabase.co','http://localhost:54321','http://127.0.0.1:54322','http://127.0.0.1:54321/','http://user:pass@127.0.0.1:54321']){
 assert.throws(()=>configuration({API_URL,ANON_KEY:jwt('anon'),SERVICE_ROLE_KEY:jwt('service_role')}),error=>error.code==='local_endpoint_required');
}
assert.throws(()=>configuration({API_URL:'http://127.0.0.1:54321',ANON_KEY:jwt('anon'),SERVICE_ROLE_KEY:jwt('anon')}));
const python=process.platform==='win32'?'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':'python3';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'drx-native-guards-'));
try{
 const toc=['cleanup_atomic_note_receipts_auth_owner','cleanup_atomic_prescription_receipts_auth_owner','medindex_auth_user_profile_created'].map((name,i)=>`${i+1}; 0 123 TRIGGER auth users ${name} supabase_auth_admin`);
 const native='4; 0 124 TRIGGER storage buckets protect_bucket_control_columns supabase_storage_admin';
 const source=path.join(folder,'source.toc'),target=path.join(folder,'target.toc');fs.writeFileSync(source,[...toc,native].join('\n'));
 const invoke=()=>spawnSync(python,['scripts/native-recovery-toc.py',source,target],{encoding:'utf8'});
 assert.equal(invoke().status,0);const lines=fs.readFileSync(target,'utf8').split(/\r?\n/);for(const entry of toc)assert.ok(lines.includes(';'+entry));assert.ok(lines.includes(native));
 for(const entries of [[toc[0],toc[1],native],[...toc,toc[0],native]]){fs.writeFileSync(source,entries.join('\n'));assert.notEqual(invoke().status,0);}
}finally{fs.rmSync(folder,{recursive:true,force:true});}
console.log('Native recovery guards: production/ambiguous endpoints rejected, local role keys validated, exactly three app triggers deferred and native triggers preserved.');
