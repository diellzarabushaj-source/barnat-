'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
process.env.SESSION_SECRET='prescription-cas-test-secret-at-least-32-characters';
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',AUTH='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let user={id:OWNER,storageUid:OWNER,authUid:AUTH,email:'synthetic@example.test',name:'Fixture',role:'editor'};
let calls=[],rows=[],receipts=new Map(),omitAck=false;
const transport=require.resolve('../lib/medindex-data-api.js');
require.cache[transport]={id:transport,filename:transport,loaded:true,exports:{exactCount:()=>null,neonRequest:async(path,options={})=>{
  calls.push({path,options});
  if(path==='rpc/write_user_library_cas') {
    const body=options.body,writes=body.p_prescription_writes;
    assert.equal(body.p_storage_uid,user.storageUid);assert.equal(body.p_auth_uid,user.authUid);
    const fingerprint=write=>JSON.stringify({...write,payload:undefined});
    for(const write of writes) {
      const old=receipts.get(write.operationId);
      if(old){if(old.fingerprint!==fingerprint(write))return {data:{ok:false,source:'prescriptions',code:'PRESCRIPTION_OPERATION_REUSED',conflicts:[]}};continue;}
      const row=rows.find(row=>row.client_id===write.clientId);
      if((row?.row_version || 0)!==write.expectedVersion || (!write.deleted && row?.deleted_at && !write.restore)
        || (write.restore && !row?.deleted_at))return {data:{ok:false,source:'prescriptions',code:'PRESCRIPTION_VERSION_CONFLICT',conflicts:[{clientId:write.clientId,rowVersion:row?.row_version || 0,deleted:Boolean(row?.deleted_at)}]}};
    }
    const operations=writes.map(write=>{
      const old=receipts.get(write.operationId);if(old)return old.result;
      let row=rows.find(row=>row.client_id===write.clientId);
      if(!row){row={id:randomUUID(),user_id:OWNER,client_id:write.clientId,row_version:0};rows.push(row);}
      Object.assign(row,{payload:write.payload,chapter_key:write.chapterKey,row_version:row.row_version+1,
        client_updated_at:write.clientUpdatedAt,updated_at:'2026-10-10T00:00:00.000Z',deleted_at:write.deleted ? '2026-10-10T00:00:00.000Z' : null});
      const result={operationId:write.operationId,clientId:write.clientId,rowVersion:row.row_version,deleted:write.deleted};
      receipts.set(write.operationId,{fingerprint:fingerprint(write),result});return result;
    });
    if(omitAck){omitAck=false;operations.splice(0);}
    return {data:{ok:true,notes:{ok:true,operations:[]},prescriptions:{ok:true,operations},favorites:body.p_favorite_records.length,drugs:body.p_drug_records.length}};
  }
  assert.notEqual(options.method,'POST','Every write must use the single outer transaction');
  if(path.startsWith('user_prescriptions?'))return {data:rows};
  if(path.startsWith('prescription_chapters?'))return {data:[{slug:'te-tjera',title_sq:'Të tjera',sort_order:100,is_active:true}]};
  return {data:[]};
}}};
require('../lib/user-store.js').userFromSession=async()=>user;
const library=require('../lib/user-library.js');
const {encryptJson,decryptJson}=require('../lib/user-data-crypto.js');
const stamp='2026-10-10T11:00:00.000Z';
const source={id:'rx-exact',name:'  Recetë e saktë  ',sourceText:'  Rp.\nA OSE B\nC PLUS D\n  ë 🧪  ',patientName:'  Pacient sintetik  ',
  arbitraryMetadata:{z:1,a:{preserve:'  exact\n '}},sections:[{type:'alternative',medications:[{name:'A',dose:' 1 mg '},{name:'B',dose:'2 mg'}]},{type:'plus',medications:[{name:'C'},{name:'D'}]}]};
const mutation=(payload=source,expectedVersion=0)=>({version:1,libraryOwner:OWNER,prescriptionOwner:OWNER,prescriptions:[{clientId:payload.id,payload,expectedVersion,operationId:randomUUID(),clientUpdatedAt:stamp}]});
async function request(body,method='PUT') {
  const res={statusCode:0,setHeader(){},status(value){this.statusCode=value;return this;},json(body){this.body=body;return this;}};
  await library.handle({method,url:'/api/user-library',headers:{host:'fixture.local',origin:'https://fixture.local','content-type':'application/json'},body},res);return res;
}
const writes=()=>calls.filter(call=>call.options.method==='POST');
(async()=>{
  const ordinary={version:1,noteOwner:OWNER,prescriptionOwner:OWNER,prescriptions:[],
    favorites:[{entityType:'drug',entityKey:'registry:1',payload:{},clientUpdatedAt:stamp}],
    drugs:[{clientId:'synthetic-custom-drug',name:'Synthetic entry',fields:{notes:'Synthetic exact note'},clientUpdatedAt:stamp}]};
  const ordinaryKinds=[{favorites:ordinary.favorites},{drugs:ordinary.drugs},
    {tombstones:{favorites:[{entityType:'drug',entityKey:'registry:1',deletedAt:stamp}]}},
    {tombstones:{drugs:[{clientId:'synthetic-custom-drug',deletedAt:stamp}]}}];
  for (const shape of [...ordinaryKinds,ordinary]) {
    for (const libraryOwner of [undefined,AUTH]) {
      calls=[];const result=await request({version:1,...shape,...(libraryOwner ? {libraryOwner} : {})});
      assert.equal(result.statusCode,409);assert.equal(result.body.code,'LIBRARY_OWNER_CHANGED');assert.equal(result.body.snapshot,undefined);
      assert.equal(calls.length,0,'Missing/wrong whole-library owner must reject every write/delete before private reads or writes');
    }
    calls=[];assert.equal((await request({version:1,...shape,libraryOwner:OWNER})).statusCode,200,'The matching owner can save/delete each ordinary collection');
  }
  user={...user,id:AUTH,storageUid:AUTH};calls=[];
  assert.equal((await request({...ordinary,libraryOwner:OWNER})).body.code,'LIBRARY_OWNER_CHANGED');assert.equal(calls.length,0,'An old-account favorite/drug-only envelope cannot commit into a new session');
  user={...user,id:OWNER,storageUid:OWNER};
  const accepted=await request({...ordinary,libraryOwner:OWNER});assert.equal(accepted.statusCode,200);
  assert.equal(writes().at(-1).options.body.p_favorite_records.length,1);assert.equal(writes().at(-1).options.body.p_drug_records.length,1);
  for (const payload of [{sourceText:'Exact without identity',sections:[]},{...source,id:'other-client-id'}]) {
    calls=[];const body=mutation();body.prescriptions[0].payload=payload;
    const rejected=await request(body);assert.equal(rejected.statusCode,400);assert.equal(rejected.body.code,'PRESCRIPTION_IDENTITY_INVALID');assert.equal(calls.length,0);
  }
  const body=mutation(),original=JSON.stringify(source);
  const saved=await request(body);assert.equal(saved.statusCode,200);assert.equal(JSON.stringify(source),original,'No chapter or version metadata may mutate source structure');
  assert.deepEqual(saved.body.prescriptions[0].payload,source);assert.equal(saved.body.prescriptions[0].rowVersion,1);assert.equal(saved.body.prescriptionVersions[0].rowVersion,1);
  const rpc=writes().at(-1),write=rpc.options.body.p_prescription_writes[0];assert.equal(rpc.path,'rpc/write_user_library_cas');
  assert.doesNotMatch(JSON.stringify(write.payload),/Pacient sintetik|Recetë e saktë|arbitraryMetadata/);
  assert.deepEqual(decryptJson(write.payload,`${OWNER}:prescription:rx-exact`),source);
  assert.throws(()=>decryptJson(write.payload,`${AUTH}:prescription:rx-exact`));
  assert.match(write.payloadDigest,/^[0-9a-f]{64}$/);
  const replay=await request(body);assert.equal(replay.statusCode,200);assert.equal(replay.body.prescriptionOperations[0].rowVersion,1);assert.equal(rows[0].row_version,1);
  assert.notDeepEqual(writes().at(-1).options.body.p_prescription_writes[0].payload,write.payload,'Retry encryption has a new IV while receipt identity remains stable');
  assert.equal(writes().at(-1).options.body.p_prescription_writes[0].payloadDigest,write.payloadDigest);
  calls=[];const stale=mutation({...source,sourceText:'Another device stale draft'},0);stale.prescriptions[0].clientUpdatedAt='2999-01-01T00:00:00.000Z';
  const conflict=await request(stale);assert.equal(conflict.statusCode,409);assert.equal(conflict.body.code,'PRESCRIPTION_VERSION_CONFLICT');assert.equal(conflict.body.snapshot.prescriptions[0].rowVersion,1);assert.deepEqual(conflict.body.snapshot.prescriptions[0].payload,source);assert.equal(writes().length,1);
  const reused=JSON.parse(JSON.stringify(body));reused.prescriptions[0].payload.sourceText+='changed';assert.equal((await request(reused)).body.code,'PRESCRIPTION_OPERATION_REUSED');assert.equal(rows[0].row_version,1);
  const sorted={...source,arbitraryMetadata:{a:{preserve:'  exact\n '},z:1}};assert.equal(library._test.atomicPrescriptionWrite(library._test.normalizedPrescription({...body.prescriptions[0],payload:sorted}),OWNER).payloadDigest,write.payloadDigest,'Canonical digest ignores object key insertion order but preserves arrays and exact strings');
  calls=[];const wrongOwner=mutation();wrongOwner.prescriptionOwner=AUTH;const mismatch=await request(wrongOwner);assert.equal(mismatch.statusCode,409);assert.equal(mismatch.body.code,'PRESCRIPTION_OWNER_CHANGED');assert.equal(mismatch.body.snapshot,undefined);assert.equal(writes().length,0);
  calls=[];const versionless=mutation();delete versionless.prescriptions[0].expectedVersion;assert.equal((await request(versionless)).body.code,'PRESCRIPTION_VERSION_REQUIRED');assert.equal(writes().length,0);
  const tooLarge=mutation({...source,sourceText:'x'.repeat(160*1024)});assert.equal((await request(tooLarge)).statusCode,413);assert.equal(writes().length,0);
  assert.equal((await request(mutation({...source,id:'x'.repeat(161)}))).statusCode,400);
  const deletion={version:1,libraryOwner:OWNER,prescriptionOwner:OWNER,tombstones:{prescriptions:[{clientId:source.id,expectedVersion:1,operationId:randomUUID(),deletedAt:stamp}]}};
  const deleted=await request(deletion);assert.equal(deleted.statusCode,200);assert.equal(deleted.body.tombstones.prescriptions[0].rowVersion,2);assert.deepEqual(decryptJson(rows[0].payload,`${OWNER}:prescription:rx-exact`),{});
  assert.equal((await request(mutation(source,2))).statusCode,409,'A deleted recipe requires an explicit restore');
  const restored=mutation(source,2);restored.prescriptions[0].restore=true;assert.equal((await request(restored)).statusCode,200);assert.deepEqual(decryptJson(rows[0].payload,`${OWNER}:prescription:rx-exact`),source);
  assert.equal((await request(deletion)).statusCode,200);assert.equal(rows[0].row_version,3,'Retrying an old delete receipt cannot delete a restored recipe');
  const next=mutation({...source,sourceText:'Final exact text'},3);omitAck=true;assert.equal((await request(next)).statusCode,503);assert.equal(rows[0].row_version,4);assert.equal((await request(next)).statusCode,200);assert.equal(rows[0].row_version,4);
  const migration=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_user_prescriptions_atomic_cas.sql'));
  assert.ok(migration,'Prescription CAS migration must exist');
  const envelopeSql=fs.readFileSync(`supabase/migrations/${migration}`,'utf8');
  process.env.MEDINDEX_USER_DATA_KEY_ID='K'.repeat(64);process.env.MEDINDEX_USER_DATA_KEY='dedicated-prescription-synthetic-secret-32-characters';
  let envelope;for(let tries=0;tries<100;tries++){envelope=encryptJson(source,`${OWNER}:prescription:rx-exact`);if(JSON.stringify(envelope).includes('_') && JSON.stringify(envelope).includes('-'))break;}
  assert.equal(envelope.kid.length,64);assert.match(JSON.stringify(envelope),/_/);assert.match(JSON.stringify(envelope),/-/);
  const matches=(field,value)=>{const escaped=field==='kid' ? 'kid' : field;const found=envelopeSql.match(new RegExp("payload'->>'"+escaped+"'\\) !~ '([^']+)'"));assert.ok(found,field);return new RegExp(found[1]).test(value);};
  assert.ok(matches('iv',envelope.iv));assert.ok(matches('tag',envelope.tag));assert.ok(matches('ciphertext',envelope.ciphertext));assert.ok(matches('kid',envelope.kid));
  for(const field of ['iv','tag','ciphertext','kid'])assert.ok(envelopeSql.includes(`jsonb_typeof(v_write->'payload'->'${field}') is distinct from 'string'`),'Required encrypted fields must reject SQL NULL');
  assert.match(envelopeSql,/fence_enabled boolean not null default false/);assert.match(envelopeSql,/security invoker set search_path = ''/);assert.doesNotMatch(envelopeSql,/\bdecrypt\w*\s*\(|patientName/i,'SQL must not decrypt user payloads');
  console.log('✓ Prescription CAS API preserves exact encrypted source, canonical retry digests, owner epochs, versions/tombstones, explicit restore, receipt validation, and generated base64url envelopes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
