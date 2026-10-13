'use strict';
// Destructive probes are permitted only on the explicitly disposable loopback stack.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const BASE='http://127.0.0.1:54321';
function fail(code){const error=new Error('Isolated recovery proof failed');error.code=code;throw error;}
function check(value,code){if(!value)fail(code);}
function configuration(status){
 check(status?.API_URL===BASE,'local_endpoint_required');
 for(const [key,role] of [[status.ANON_KEY,'anon'],[status.SERVICE_ROLE_KEY,'service_role']]){
  let payload;try{payload=JSON.parse(Buffer.from(String(key).split('.')[1],'base64url'));}catch{fail('local_credentials_required');}
  check(payload.role===role&&/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key),'local_credentials_required');
 }
 return {anon:status.ANON_KEY,service:status.SERVICE_ROLE_KEY};
}
async function run({statusFile,bodyDirectory,proofFile}){
 const keys=configuration(JSON.parse(await fs.readFile(statusFile,'utf8')));
 const nativeFetch=global.fetch;
 global.fetch=async(input,options={})=>{
  const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  check(target.origin===BASE&&!target.username&&!target.password,'network_pin_failed');
  return nativeFetch(input,{...options,redirect:'error',signal:options.signal||AbortSignal.timeout(15000)});
 };
 const proof={schemaVersion:'drx-native-api-recovery-v1',status:'RUNNING',isolatedTarget:true,productionMutations:false,privateValuesPublished:false};
 let stage='configuration';
 const request=async(endpoint,{method='GET',key=keys.service,token=key,json,body,headers={}}={})=>{
  const response=await fetch(BASE+endpoint,{method,headers:{apikey:key,Authorization:'Bearer '+token,...(json!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:json!==undefined?JSON.stringify(json):body});
  const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes);}catch{}
  return {status:response.status,ok:response.ok,bytes,data};
 };
 try{
  // All source credentials are replaced before importing the actual application.
  for(const name of ['MEDINDEX_SUPABASE_URL','SUPABASE_URL'])process.env[name]=BASE;
  for(const name of ['MEDINDEX_SUPABASE_SECRET_KEY','SUPABASE_SECRET_KEY','MEDINDEX_SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_ROLE_KEY'])process.env[name]=keys.service;
  for(const name of ['MEDINDEX_SUPABASE_PUBLISHABLE_KEY','SUPABASE_PUBLISHABLE_KEY'])process.env[name]=keys.anon;
  process.env.SESSION_SECRET=crypto.randomBytes(48).toString('hex');
  delete process.env.SESSION_SECRET_PREVIOUS;delete process.env.SESSION_SECRET_KEY_ID;
  // Library probes create and decrypt only synthetic prescriptions under a synthetic key.
  const users=[];
  stage='auth_create_and_profile_bootstrap';
  for(let i=0;i<2;i++){
   const email='recovery-'+crypto.randomUUID()+'@example.invalid',password=crypto.randomBytes(24).toString('base64url');
   const created=await request('/auth/v1/admin/users',{method:'POST',json:{email,password,email_confirm:true,user_metadata:{full_name:'Synthetic recovery',role:'admin'}}});
   const id=created.data?.id;check(created.ok&&/^[a-f0-9-]{36}$/i.test(id||''),'auth_create_failed');
   const profile=await request('/rest/v1/profiles?select=id,role,status&id=eq.'+id);
   check(profile.ok&&profile.data?.length===1&&profile.data[0].id===id&&profile.data[0].role!=='admin','profile_bootstrap_or_privilege_escalation');
   const approval=await request('/rest/v1/profiles?id=eq.'+id,{method:'PATCH',json:{role:'doctor',status:'active'}});
   check(approval.ok,'synthetic_profile_approval_failed');
   const signed=await request('/auth/v1/token?grant_type=password',{key:keys.anon,method:'POST',json:{email,password}});
   check(signed.ok&&signed.data?.user?.id===id&&signed.data.access_token&&signed.data.refresh_token,'password_signin_failed');
   users.push({id,email,...signed.data});
  }
  proof.profileBootstrapVerified=true;proof.userMetadataCannotGrantAdmin=true;proof.passwordSignInVerified=true;
  stage='auth_refresh_and_identity';
  const refreshed=await request('/auth/v1/token?grant_type=refresh_token',{key:keys.anon,method:'POST',json:{refresh_token:users[0].refresh_token}});
  check(refreshed.ok&&refreshed.data?.user?.id===users[0].id,'refresh_failed');Object.assign(users[0],refreshed.data);
  const identity=await request('/auth/v1/user',{key:keys.anon,token:users[0].access_token});
  check(identity.ok&&identity.data?.id===users[0].id,'session_identity_failed');proof.refreshAndIdentityVerified=true;
  stage='profile_owner_isolation';
  const otherProfile=await request('/rest/v1/profiles?select=id&id=eq.'+users[0].id,{key:keys.anon,token:users[1].access_token});
  check(!otherProfile.ok||Array.isArray(otherProfile.data)&&otherProfile.data.length===0,'profile_owner_isolation_failed');proof.profileOwnerIsolationVerified=true;
  stage='storage_body_api_replay';
  const records=JSON.parse(await fs.readFile(path.join(bodyDirectory,'storage-body-manifest.json'),'utf8'));
  check(Array.isArray(records)&&records.length<=256,'storage_inventory_invalid');let bytes=0;
  for(let i=0;i<records.length;i++){
   const record=records[i];check(record.file==='storage-objects/'+String(i).padStart(6,'0')+'.bin','storage_body_path_invalid');
   const source=record.source;check(/^[A-Za-z0-9_.-]{1,100}$/.test(source?.bucket_id||'')&&typeof source.name==='string'&&source.name.split('/').every(s=>s&&s!=='.'&&s!=='..')&&!/[\x00-\x1f\\]/.test(source.name),'storage_identity_invalid');
   const body=await fs.readFile(path.join(bodyDirectory,record.file));bytes+=body.length;
   check(body.length===record.bytes&&body.length<=16*1024*1024&&bytes<=32*1024*1024&&crypto.createHash('sha256').update(body).digest('hex')===record.sha256,'storage_body_integrity_failed');
   const endpoint='/storage/v1/object/'+encodeURIComponent(source.bucket_id)+'/'+source.name.split('/').map(encodeURIComponent).join('/');
   const bucket=await request('/storage/v1/bucket/'+encodeURIComponent(source.bucket_id));
   check(bucket.ok&&bucket.data?.public===false,'private_bucket_required');
   const uploaded=await request(endpoint,{method:'POST',body,headers:{'Content-Type':source.metadata?.mimetype||'application/octet-stream','x-upsert':'true'}});
   check(uploaded.ok,'storage_body_upload_failed');
   const recovered=await request(endpoint);check(recovered.ok&&recovered.bytes.equals(body),'storage_body_readback_failed');
   for(const token of [keys.anon,users[1].access_token]){
    const denied=await request(endpoint,{key:keys.anon,token});check(!denied.ok,'private_storage_access_leak');
   }
  }
  proof.storageApiReplayVerified=true;proof.storageObjectCount=records.length;proof.storageObjectBytes=bytes;proof.privateStorageAnonymousAndUnrelatedUserDenied=true;
  stage='actual_application_avatar_flow';
  const auth=await import('../lib/auth.mjs'),avatar=require('../lib/profile-avatar.js');
  const cookies=users.map(user=>auth.COOKIE_NAME+'='+auth.createSessionToken({uid:user.id,authUid:user.id,email:user.email,role:'user',authRole:'doctor',authStatus:'active',provider:'supabase-password'}));
  async function avatarRequest(index,method,body){
   const result={statusCode:0};const res={setHeader(){},status(code){result.statusCode=code;return this;},json(value){result.json=value;return this;},end(value){result.body=value;return this;}};
   await avatar.handle({method,headers:{cookie:cookies[index],host:'127.0.0.1:54321'},body,url:'/api/profile-photo'},res);return result;
  }
  const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,255,217]);
  check((await avatarRequest(0,'POST',{dataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')})).statusCode===200,'avatar_upload_failed');
  const ownAvatar=await avatarRequest(0,'GET');check(ownAvatar.statusCode===200&&Buffer.isBuffer(ownAvatar.body)&&ownAvatar.body.equals(jpeg),'avatar_own_read_failed');
  const forged=await request('/rest/v1/profiles?id=eq.'+users[1].id,{method:'PATCH',json:{avatar_url:users[0].id+'/avatar.jpg'}});check(forged.ok,'synthetic_forged_pointer_failed');
  check((await avatarRequest(1,'GET')).statusCode===404,'avatar_cross_owner_failed');
  check((await avatarRequest(0,'DELETE')).statusCode===200&&(await avatarRequest(0,'GET')).statusCode===404,'avatar_delete_failed');proof.actualAvatarUploadReadDeleteAndOwnerIsolationVerified=true;
  stage='actual_application_library_cas';
  const store=require('../lib/user-store.js'),library=require('../lib/user-library.js')._test;
  const owners=[];for(const user of users)owners.push(await store.ensureUser({id:user.id,email:user.email,name:'Synthetic recovery',authorizedRole:'doctor'}));
  const stamp=new Date().toISOString(),clientId='recovery-'+crypto.randomUUID();
  const recipe={clientId,chapterKey:'te-tjera',payload:{id:clientId,title:'Synthetic recovery'},clientUpdatedAt:stamp,expectedVersion:0,operationId:crypto.randomUUID()};
  const note={entityType:'substance',entityKey:'recovery-'+crypto.randomUUID(),content:'Synthetic recovery note',clientUpdatedAt:stamp,expectedVersion:0,operationId:crypto.randomUUID()};
  const envelope={libraryOwner:users[0].id,noteOwner:users[0].id,prescriptionOwner:users[0].id,prescriptions:[recipe],entityNotes:[note]};
  const saved=await library.syncSnapshot(owners[0],users[0].id,envelope);check(saved.prescriptionOperations?.[0]?.rowVersion===1&&saved.noteOperations?.[0]?.rowVersion===1,'library_cas_create_failed');
  const replay=await library.syncSnapshot(owners[0],users[0].id,envelope);check(replay.prescriptionOperations?.[0]?.rowVersion===1&&replay.noteOperations?.[0]?.rowVersion===1,'library_receipt_replay_failed');
  let conflict=false;try{await library.syncSnapshot(owners[0],users[0].id,{...envelope,prescriptions:[{...recipe,operationId:crypto.randomUUID()}],entityNotes:[]});}catch(error){conflict=error.code==='PRESCRIPTION_VERSION_CONFLICT';}check(conflict,'library_stale_write_failed');
  let ownerDenied=false;try{await library.syncSnapshot(owners[1],users[1].id,envelope);}catch(error){ownerDenied=error.code==='LIBRARY_OWNER_CHANGED';}check(ownerDenied,'library_owner_binding_failed');
  const own=await library.getSnapshot(owners[0],users[0].id),other=await library.getSnapshot(owners[1],users[1].id);
  check(own.prescriptions?.some(row=>row.clientId===clientId)&&!other.prescriptions?.some(row=>row.clientId===clientId),'library_decrypt_or_owner_read_failed');
  const direct=await request('/rest/v1/user_prescriptions?user_id=eq.'+users[0].id,{method:'DELETE'});check(!direct.ok,'library_direct_delete_not_fenced');
  proof.actualLibraryEncryptedSaveReadAndOwnerIsolationVerified=true;proof.libraryCasReceiptReplayAndConflictVerified=true;proof.libraryDirectDeleteFenceVerified=true;
  stage='auth_logout_revocation';
  const logout=await request('/auth/v1/logout?scope=global',{key:keys.anon,token:users[0].access_token,method:'POST'});check(logout.ok,'logout_failed');
  const revoked=await request('/auth/v1/token?grant_type=refresh_token',{key:keys.anon,method:'POST',json:{refresh_token:users[0].refresh_token}});check(!revoked.ok,'refresh_revocation_failed');proof.logoutRefreshRevocationVerified=true;
  // JWT access tokens expire naturally; no claim of immediate JWT invalidation.
  proof.syntheticAccounts=2;proof.status='PASS';
 }catch{proof.status='FAIL';proof.failedStage=stage;}
 finally{global.fetch=nativeFetch;await fs.writeFile(proofFile,JSON.stringify(proof,null,2)+'\n');}
 console.log(JSON.stringify(proof));if(proof.status!=='PASS')process.exitCode=1;return proof;
}
if(require.main===module){const [statusFile,bodyDirectory,proofFile]=process.argv.slice(2);run({statusFile,bodyDirectory,proofFile}).catch(()=>{console.error('Native API recovery configuration failed; private values were not printed.');process.exitCode=1;});}
module.exports={configuration,run};
