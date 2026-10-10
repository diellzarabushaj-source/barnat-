'use strict';
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
process.env.SESSION_SECRET='atomic-note-api-test-secret-32-characters';
const AUTH='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const user={id:OWNER,storageUid:OWNER,authUid:AUTH,email:'synthetic@example.test',name:'Fixture',role:'editor'};
let currentUser=user,calls=[],notes=[],favorites=[],prescriptions=[],rpcResult=null,rpcError=null,productActive=true;
const product={id:PRODUCT,registry_number:42,pdid:'FIXTURE',trade_name:'Fixture product',active_substance:'Fixture',strength:'1 mg',pharmaceutical_form:'Tablet',atc_code:'A01AA01'};
const transport=require.resolve('../lib/medindex-data-api.js');
require.cache[transport]={id:transport,filename:transport,loaded:true,exports:{neonRequest:async(path,options={})=>{
  calls.push({path,options});
  if(path==='rpc/write_user_library_cas') {
    if(rpcError) throw rpcError;
    if(rpcResult) return {data:rpcResult.ok ? {ok:true,notes:rpcResult,prescriptions:{ok:true,operations:[]}} : {...rpcResult,source:'notes'}};
    const operations=options.body.p_note_writes.map(write=>{
      const list=write.storage==='native' ? notes : favorites;
      const owner=write.storage==='native' ? options.body.p_auth_uid : options.body.p_storage_uid;
      let row=list.find(row=>row.user_id===owner && row.entity_type===write.entityType && row.entity_key===write.entityKey);
      assert.equal(row?.row_version || 0,write.expectedVersion,'API forwards the captured expected version');
      if(!row){row={user_id:owner,entity_type:write.entityType,entity_key:write.entityKey,row_version:0};list.push(row);}
      row.row_version++;
      row.deleted_at=write.deleted ? '2026-10-10T00:00:00.000Z' : null;
      row.client_updated_at=write.clientUpdatedAt;row.updated_at='2026-10-10T00:00:00.000Z';
      if(write.storage==='native'){row.content=write.content;row.drug_id=['product','drug'].includes(write.entityType) ? write.entityKey : null;}
      else row.payload={kind:'drug-note',text:write.content};
      return {operationId:write.operationId,storage:write.storage,entityType:write.entityType,entityKey:write.entityKey,rowVersion:row.row_version,deleted:write.deleted};
    });
    const prescriptionOperations=options.body.p_prescription_writes.map(write=>{
      assert.equal(write.expectedVersion,0);assert.equal(write.clientId,'rx-safe');
      prescriptions.push({id:randomUUID(),user_id:OWNER,client_id:write.clientId,payload:write.payload,chapter_key:write.chapterKey,row_version:1,client_updated_at:write.clientUpdatedAt,deleted_at:null});
      return {operationId:write.operationId,clientId:write.clientId,rowVersion:1,deleted:false};
    });
    assert.ok(options.body.p_favorite_records.every(row=>!row.entity_key.startsWith('drug-note:')),'Ordinary records cannot bypass note CAS');
    return {data:{ok:true,notes:{ok:true,operations},prescriptions:{ok:true,operations:prescriptionOperations}}};
  }
  const table=path.split('?')[0];
  if(options.method==='POST'){
    if(table==='user_prescriptions') prescriptions.push(...options.body);
    assert.notEqual(table,'user_notes','Native notes may only use the CAS RPC');
    if(table==='user_favorites') assert.ok(options.body.every(row=>!row.entity_key.startsWith('drug-note:')),'Legacy notes may only use the CAS RPC');
    return {data:null};
  }
  if(table==='user_notes'){
    const params=new URLSearchParams(path.split('?')[1]);
    const owned=notes.filter(row=>row.user_id===AUTH),offset=Number(params.get('offset')) || 0;
    return {data:owned.slice(offset,offset+1000),response:{headers:{get:()=>`${offset}-${Math.min(offset+999,owned.length-1)}/${owned.length}`}}};
  }
  if(table==='user_favorites')return {data:favorites.filter(row=>row.user_id===OWNER)};
  if(table==='user_prescriptions')return {data:prescriptions};
  if(table==='drugs')return {data:path.includes('is_published=eq.true') && !productActive ? [] : [product]};
  return {data:[]};
},exactCount:response=>Number(response.headers.get('content-range').split('/').pop())}};
const UserStore=require('../lib/user-store.js');
UserStore.userFromSession=async()=>currentUser;
const library=require('../lib/user-library.js');
const stamp='2026-10-09T00:00:00.000Z';
const mutation=(changes={})=>({version:1,libraryOwner:OWNER,noteOwner:OWNER,prescriptionOwner:OWNER,entityNotes:[{entityType:'product',entityKey:PRODUCT,content:'  tekst i saktë\në 🧪  ',expectedVersion:0,operationId:randomUUID(),clientUpdatedAt:stamp}],...changes});
async function request(body,method='PUT'){
  const res={statusCode:0,setHeader(){},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await library.handle({method,url:'/api/user-library',headers:{host:'fixture.local',origin:'https://fixture.local','content-type':'application/json'},body},res);
  return res;
}
function writes(){return calls.filter(call=>call.options.method==='POST');}
(async()=>{
  const firstMutation=mutation();
  const saved=await request(firstMutation);
  assert.equal(saved.statusCode,200);assert.equal(saved.body.entityNotes[0].content,'  tekst i saktë\në 🧪  ');
  assert.equal(saved.body.noteOperations[0].rowVersion,1);assert.equal(saved.body.noteVersions[0].rowVersion,1);
  assert.equal(saved.body.favorites.length,0,'A product note is not an ambiguous legacy drug alias');
  const rpc=writes()[0];assert.equal(rpc.path,'rpc/write_user_library_cas');assert.equal(rpc.options.body.p_auth_uid,AUTH);assert.equal(rpc.options.body.p_storage_uid,OWNER);
  productActive=false;calls=[];rpcResult={ok:true,operations:saved.body.noteOperations.map(ack=>({...ack,storage:'native'}))};
  const replay=await request(firstMutation);assert.equal(replay.statusCode,200,'A committed retry reaches its receipt after the product is unpublished');
  assert.equal(replay.body.noteOperations[0].rowVersion,1);assert.equal(writes().length,1);
  rpcResult=null;rpcError={status:400,payload:{code:'23514',message:'Canonical product note is not active'}};
  const unpublished=await request(mutation());assert.equal(unpublished.statusCode,409);assert.equal(unpublished.body.code,'PERSONAL_PRODUCT_NOT_ACTIVE');
  productActive=true;rpcError=null;
  calls=[];const conflict=await request(mutation({noteOwner:'different-owner',prescriptions:[{clientId:'rx',payload:{id:'rx'}}]}));
  assert.equal(conflict.statusCode,409);assert.equal(conflict.body.code,'NOTE_OWNER_CHANGED');assert.equal(writes().length,0);assert.equal(conflict.body.snapshot,undefined);
  calls=[];const old=mutation();delete old.entityNotes[0].expectedVersion;
  const missing=await request(old);assert.equal(missing.statusCode,409);assert.equal(missing.body.code,'NOTE_VERSION_REQUIRED');assert.equal(writes().length,0);assert.equal(missing.body.snapshot.user.id,OWNER);
  calls=[];rpcResult={ok:false,code:'NOTE_VERSION_CONFLICT',conflicts:[{storage:'native',entityType:'product',entityKey:PRODUCT,rowVersion:3,deleted:false}]};
  const stale=await request(mutation({prescriptions:[{clientId:'rx',payload:{id:'rx'},expectedVersion:0,operationId:randomUUID(),clientUpdatedAt:stamp}],favorites:[{entityType:'lab',entityKey:'fixture'}]}));
  assert.equal(stale.statusCode,409);assert.equal(stale.body.conflicts[0].rowVersion,3);assert.equal(stale.body.snapshot.user.id,OWNER);
  assert.deepEqual(writes().map(call=>call.path),['rpc/write_user_library_cas'],'Conflict rejects the note batch before unrelated library writes');
  rpcResult=null;calls=[];
  const duplicate=mutation();duplicate.entityNotes.push({...duplicate.entityNotes[0],operationId:randomUUID()});
  assert.equal((await request(duplicate)).statusCode,400);assert.equal(writes().length,0);
  const oversized=mutation();oversized.entityNotes[0].content='x'.repeat(2001);assert.equal((await request(oversized)).statusCode,413);assert.equal(writes().length,0);
  const badProduct=mutation();badProduct.entityNotes[0].entityKey='registry:42';assert.equal((await request(badProduct)).body.code,'INVALID_PRODUCT_ID');
  const deleteBody={version:1,libraryOwner:OWNER,noteOwner:OWNER,tombstones:{entityNotes:[{entityType:'product',entityKey:PRODUCT,expectedVersion:1,operationId:randomUUID(),deletedAt:stamp}]}};
  const deleted=await request(deleteBody);assert.equal(deleted.statusCode,200);assert.equal(deleted.body.tombstones.entityNotes[0].rowVersion,2);
  const restore=mutation();Object.assign(restore.entityNotes[0],{expectedVersion:2,restore:true});
  assert.equal((await request(restore)).statusCode,200);assert.equal(writes().at(-1).options.body.p_note_writes[0].restore,true);
  favorites=[{user_id:OWNER,entity_type:'protocol',entity_key:'drug-note:registry:42',payload:{kind:'drug-note',text:'legacy'},row_version:7,deleted_at:null}];
  const snapshot=(await request(undefined,'GET')).body;
  const alias=snapshot.favorites[0];assert.equal(alias.rowVersion,7);assert.equal(alias.noteTarget.storage,'legacy');
  calls=[];
  const legacy={entityType:'protocol',entityKey:alias.entityKey,noteTarget:alias.noteTarget,payload:{kind:'drug-note',text:'  legacy exact\n '},expectedVersion:7,operationId:randomUUID(),clientUpdatedAt:stamp};
  const legacySaved=await request({version:1,libraryOwner:OWNER,noteOwner:OWNER,favorites:[legacy]});
  assert.equal(legacySaved.statusCode,200);assert.equal(legacySaved.body.noteOperations[0].entityKey,alias.entityKey);assert.equal(legacySaved.body.noteOperations[0].noteTarget.storage,'legacy');
  assert.equal(writes()[0].options.body.p_note_writes[0].storage,'legacy','Existing fallback keeps its captured target even when registry maps a drug UUID');
  legacy.noteTarget={storage:'native',entityType:'drug',entityKey:PRODUCT};legacy.expectedVersion=0;legacy.operationId=randomUUID();
  const nativeLegacy=await request({version:1,libraryOwner:OWNER,noteOwner:OWNER,favorites:[legacy]});
  assert.equal(nativeLegacy.statusCode,200);assert.equal(nativeLegacy.body.favorites[0].noteTarget.storage,'native');assert.equal(nativeLegacy.body.noteOperations[0].entityKey,'drug-note:registry:42');
  calls=[];legacy.noteTarget.entityKey=AUTH;assert.equal((await request({version:1,libraryOwner:OWNER,noteOwner:OWNER,favorites:[legacy]})).statusCode,409);assert.equal(writes().length,0);
  calls=[];await request({version:1,libraryOwner:OWNER,prescriptionOwner:OWNER,prescriptions:[{clientId:'rx-safe',expectedVersion:0,operationId:randomUUID(),payload:{id:'rx-safe',patientName:'synthetic patient',diagnosis:'synthetic private text'},clientUpdatedAt:stamp}]});
  const ciphertext=writes().find(call=>call.path==='rpc/write_user_library_cas').options.body.p_prescription_writes[0].payload;
  assert.ok(!JSON.stringify(ciphertext).includes('synthetic patient'));
  const {decryptJson}=require('../lib/user-data-crypto.js');assert.equal(decryptJson(ciphertext,`${OWNER}:prescription:rx-safe`).patientName,'synthetic patient');
  notes=Array.from({length:1001},(_,index)=>({id:randomUUID(),user_id:AUTH,entity_type:'substance',entity_key:`blank-${index}`,content:'',row_version:index+1,deleted_at:null}));
  calls=[];
  const complete=await request(undefined,'GET');assert.equal(complete.statusCode,200);assert.equal(complete.body.noteVersions.filter(row=>row.entityType==='substance').length,1001);
  assert.equal(complete.body.noteVersions.find(row=>row.entityKey==='blank-1000').rowVersion,1001,'Blank notes beyond the provider row cap keep their existing CAS version');
  assert.equal(calls.filter(call=>call.path.startsWith('user_notes?')).length,2);
  currentUser=null;assert.equal((await request(mutation())).statusCode,401);
  console.log('Atomic personal-note API: ownership, exact text, legacy targets, conflicts, delete/Undo and unchanged prescription encryption passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
