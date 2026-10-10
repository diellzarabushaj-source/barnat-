'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('user-library-client.js','utf8').replace(/\r\n?/g,'\n');
const embedded=fs.readFileSync('recetat-v2.js','utf8').replace(/\r\n?/g,'\n');
const start=embedded.indexOf("(() => {\n  'use strict';\n\n  const LONG_SESSION_VERSION");
assert.equal(embedded.slice(start,start+source.length),source,'Recetat must run the same tested client');
const RX='regjistriBarnave_protokollet_v1',META='medindex_user_library_meta_v1',FAV='regjistriBarnave_favoritet_v1';
const owner={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},other={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const stamp='2026-10-10T11:00:00.000Z';
const initial={id:'rx-1',name:'Recipe',sourceText:'  Rp. A OSE B\nC PLUS D\në 🧪  ',patientName:'synthetic',sections:[{type:'alternative',medications:[{name:'A'},{name:'B'}]},{type:'plus',medications:[{name:'C'},{name:'D'}]}],custom:{unknown:'  exact\n '},updatedAt:stamp};
const clone=value=>JSON.parse(JSON.stringify(value));
function storage(seed={}){const values=new Map(Object.entries(seed));return {getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),dump:()=>Object.fromEntries(values)};}
function server(payload=initial){
  const accounts=new Map([[owner.id,{rows:new Map(payload ? [[payload.id,{payload:clone(payload),rowVersion:1,deleted:false}]] : []),receipts:new Map(),favorites:new Map()}],[other.id,{rows:new Map(),receipts:new Map(),favorites:new Map()}]]);
  const account=who=>accounts.get(who.id);
  const snapshot=who=>{const db=account(who),rows=[...db.rows.entries()];return {ok:true,user:who,version:1,
    prescriptions:rows.flatMap(([clientId,row])=>!row.deleted ? [{clientId,payload:clone(row.payload),rowVersion:row.rowVersion,clientUpdatedAt:stamp}] : []),
    prescriptionVersions:rows.map(([clientId,row])=>({clientId,rowVersion:row.rowVersion,deleted:row.deleted})),
    favorites:[...db.favorites.entries()].map(([entityKey,row])=>({entityType:'drug',entityKey,payload:{},clientUpdatedAt:row})),drugs:[],noteVersions:[],
    tombstones:{prescriptions:rows.flatMap(([clientId,row])=>row.deleted ? [{clientId,rowVersion:row.rowVersion,deletedAt:stamp}] : []),favorites:[],drugs:[]},generatedAt:stamp};};
  async function apply(who,body){
    if(body.libraryOwner!==who.id)return {status:409,payload:{code:'LIBRARY_OWNER_CHANGED',error:'Synthetic account changed'}};
    const db=account(who),writes=[...(body.prescriptions || []),...(body.tombstones?.prescriptions || [])];
    assert.ok(!writes.length || body.prescriptionOwner===who.id);
    const conflicts=[];
    for(const write of writes){assert.match(write.operationId,/^[0-9a-f-]{36}$/i);assert.ok(Number.isSafeInteger(write.expectedVersion));
      const receipt=db.receipts.get(write.operationId);if(receipt){assert.equal(receipt.body,JSON.stringify(write),'Stable retry includes exact payload and client timestamp');continue;}
      const row=db.rows.get(write.clientId),deleted=!write.payload;
      if((row?.rowVersion || 0)!==write.expectedVersion || (!deleted && row?.deleted && !write.restore) || (write.restore && !row?.deleted))conflicts.push({clientId:write.clientId,rowVersion:row?.rowVersion || 0,deleted:Boolean(row?.deleted)});
    }
    if(conflicts.length)return {status:409,payload:{code:'PRESCRIPTION_VERSION_CONFLICT',conflicts,snapshot:snapshot(who)}};
    const operations=writes.map(write=>{const previous=db.receipts.get(write.operationId);if(previous)return previous.receipt;
      const receipt={operationId:write.operationId,clientId:write.clientId,rowVersion:write.expectedVersion+1,deleted:!write.payload};
      db.rows.set(write.clientId,{rowVersion:receipt.rowVersion,deleted:receipt.deleted,payload:write.payload ? clone(write.payload) : null});db.receipts.set(write.operationId,{body:JSON.stringify(write),receipt});return receipt;});
    for(const row of body.favorites || [])db.favorites.set(row.entityKey,row.clientUpdatedAt);
    for(const row of body.tombstones?.favorites || [])db.favorites.delete(row.entityKey);
    return {status:200,payload:{...snapshot(who),prescriptionOperations:operations,noteOperations:[]}};
  }
  return {account,snapshot,apply};
}
async function boot(db,{device=storage(),who=owner,offline=false,waitReady=true}={}){
  const listeners=new Map(),timers=new Map(),requests=[],events=[];let timer=0;
  const control={who,pauseNext:false,pending:null,failAfterCommit:false,omitReceipt:false};
  const window={crypto:webcrypto,addEventListener:(name,fn)=>listeners.set(name,[...(listeners.get(name) || []),fn]),dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type) || [])fn(event);return true;},setTimeout:(fn,delay)=>{timers.set(++timer,{fn,delay});return timer;},clearTimeout:key=>timers.delete(key),setInterval:()=>1,clearInterval(){}};
  window.fetch=async(url,options={})=>{const whoAtRequest=control.who,method=options.method || 'GET',body=options.body ? JSON.parse(options.body) : null;requests.push({method,body});
    if(method==='GET')return new Response(JSON.stringify(db.snapshot(whoAtRequest)),{status:200});
    if(control.pauseNext){control.pauseNext=false;await new Promise(resolve=>{control.pending=resolve;});control.pending=null;}
    const result=await db.apply(whoAtRequest,body);
    if(control.failAfterCommit){control.failAfterCommit=false;throw new TypeError('Lost response');}
    if(control.omitReceipt){control.omitReceipt=false;delete result.payload.prescriptionOperations;}
    return new Response(JSON.stringify(result.payload),{status:result.status});};
  class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail || {};}}
  const nav={onLine:!offline};vm.runInContext(source,vm.createContext({window,navigator:nav,document:{visibilityState:'visible',addEventListener(){}},localStorage:device,sessionStorage:storage(),location:{reload(){}},CustomEvent,AbortController,console,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,TextEncoder}),{filename:'user-library-client.js'});
  if(waitReady)await window.MEDINDEX_LIBRARY_READY;
  const fire=name=>window.dispatchEvent(new CustomEvent(name));
  const drain=async()=>{for(let i=0;i<8;i++){const due=[...timers].filter(([,row])=>row.delay<1000);if(!due.length)return;for(const [id,row]of due){timers.delete(id);row.fn();}for(let k=0;k<15;k++)await Promise.resolve();}};
  return {api:window.MedIndexUserLibrary,requests,events,control,device,nav,fire,drain};
}
const puts=client=>client.requests.filter(row=>row.method==='PUT');
const operations=row=>[...(row.body.prescriptions || []),...(row.body.tombstones?.prescriptions || [])];
const local=client=>JSON.parse(client.device.getItem(RX) || '[]');
const edited=(text='  Changed exact text\n ')=>({...clone(initial),sourceText:text,updatedAt:stamp});
(async()=>{
  {
    const db=server(),a=await boot(db);assert.deepEqual(local(a),initial ? [initial] : []);
    assert.ok(puts(a).every(row=>!operations(row).length),'No stale unchanged recipe echoes');
    a.device.setItem(FAV,'["favorite-only"]');a.fire('medindex:favorites-changed');await a.api.syncNow();assert.equal(operations(puts(a).at(-1)).length,0);assert.equal(db.account(owner).rows.get('rx-1').rowVersion,1);
  }
  {
    const db=server(),a=await boot(db),b=await boot(db),base=a.api.capturePrescriptionBase('rx-1');
    assert.equal(a.api.savePrescriptionDraft(edited('Device A'),base).ok,true);assert.equal(await a.api.syncNow(),true);
    const bDraft=edited('  Device B exact\në 🧪  ');bDraft.updatedAt='2999-01-01T00:00:00.000Z';b.api.savePrescriptionDraft(bDraft,b.api.capturePrescriptionBase('rx-1'));assert.equal(await b.api.syncNow(),false);
    assert.deepEqual(local(b),[bDraft]);assert.equal(db.account(owner).rows.get('rx-1').payload.sourceText,'Device A');assert.equal(b.api.prescriptionConflicts()[0].remotePayload.sourceText,'Device A');
    assert.equal(await b.api.retryLocalPrescription('rx-1'),true);assert.equal(await b.api.syncNow(),true);assert.deepEqual(db.account(owner).rows.get('rx-1').payload,bDraft);assert.equal(db.account(owner).rows.get('rx-1').rowVersion,3);
  }
  {
    const db=server(),a=await boot(db),base=a.api.capturePrescriptionBase('rx-1');db.account(owner).rows.set('rx-1',{rowVersion:2,deleted:false,payload:edited('New remote')});await a.api.syncNow();
    const before=puts(a).length;a.api.savePrescriptionDraft(edited('Old open editor'),base);assert.equal(a.api.prescriptionConflicts().length,1);await a.api.syncNow();assert.ok(puts(a).slice(before).every(row=>!operations(row).length));assert.equal(db.account(owner).rows.get('rx-1').payload.sourceText,'New remote');
    assert.equal(await a.api.acceptRemotePrescription('rx-1'),true);assert.equal(local(a)[0].sourceText,'New remote');
  }
  {
    const db=server(),a=await boot(db);a.api.savePrescriptionDraft(edited('Draft'),a.api.capturePrescriptionBase('rx-1'));db.account(owner).rows.set('rx-1',{rowVersion:2,deleted:false,payload:edited('Second')});await a.api.syncNow();
    db.account(owner).rows.set('rx-1',{rowVersion:3,deleted:false,payload:edited('Third')});assert.equal(await a.api.retryLocalPrescription('rx-1'),false,'A click may not approve an unseen newer version');assert.equal(a.api.prescriptionConflicts()[0].remotePayload.sourceText,'Third');assert.equal(local(a)[0].sourceText,'Draft');
    assert.equal(await a.api.retryLocalPrescription('rx-1'),true);await a.api.syncNow();assert.equal(db.account(owner).rows.get('rx-1').rowVersion,4);
  }
  {
    const db=server(),a=await boot(db);a.api.savePrescriptionDraft(edited('Lost response draft'),a.api.capturePrescriptionBase('rx-1'));a.device.setItem(FAV,'["old-favorite"]');a.fire('medindex:favorites-changed');a.control.failAfterCommit=true;assert.equal(await a.api.syncNow(),false);
    const first=clone(puts(a).at(-1).body);a.device.setItem(FAV,'["new-favorite"]');a.fire('medindex:favorites-changed');assert.equal(await a.api.syncNow(),true);
    const retry=puts(a).find((row,index)=>index>0 && row.body.prescriptions?.[0]?.operationId===first.prescriptions[0].operationId && row.body!==puts(a).at(-1).body);
    assert.ok(retry);const repeats=puts(a).filter(row=>row.body.prescriptions?.[0]?.operationId===first.prescriptions[0].operationId);assert.equal(repeats.length,2);assert.deepEqual(repeats[1].body,first,'The complete request envelope remains immutable');assert.equal(db.account(owner).rows.get('rx-1').rowVersion,2);
  }
  {
    const db=server(),a=await boot(db);a.api.savePrescriptionDraft(edited('First queued'),a.api.capturePrescriptionBase('rx-1'));a.control.pauseNext=true;const flushing=a.api.syncNow();
    for(let i=0;i<20 && !a.control.pending;i++)await Promise.resolve();assert.ok(a.control.pending);
    a.api.savePrescriptionDraft(edited('Successor queued'),a.api.capturePrescriptionBase('rx-1'));a.control.pending();await flushing;await a.drain();await a.api.syncNow();
    assert.equal(db.account(owner).rows.get('rx-1').rowVersion,3);assert.equal(db.account(owner).rows.get('rx-1').payload.sourceText,'Successor queued');
    const writes=puts(a).flatMap(operations);assert.equal(writes[0].expectedVersion,1);assert.equal(writes[1].expectedVersion,2);assert.notEqual(writes[0].operationId,writes[1].operationId);
  }
  {
    const db=server(),a=await boot(db),backup=clone(local(a)[0]);const deleted=a.api.deletePrescription('rx-1');assert.equal(await a.api.syncNow(),true);assert.equal(db.account(owner).rows.get('rx-1').deleted,true);
    assert.equal(a.api.restorePrescription(backup,deleted.base).ok,true);await a.api.syncNow();const write=puts(a).flatMap(operations).at(-1);assert.equal(write.expectedVersion,2);assert.equal(write.restore,true);assert.deepEqual(db.account(owner).rows.get('rx-1').payload,backup);
  }
  {
    const db=server(),a=await boot(db),backup=clone(local(a)[0]);a.control.pauseNext=true;const deleted=a.api.deletePrescription('rx-1'),flushing=a.api.syncNow();for(let i=0;i<20 && !a.control.pending;i++)await Promise.resolve();a.api.restorePrescription(backup,deleted.base);a.control.pending();await flushing;await a.drain();await a.api.syncNow();assert.equal(db.account(owner).rows.get('rx-1').rowVersion,3);assert.equal(db.account(owner).rows.get('rx-1').deleted,false);
  }
  {
    const db=server(),a=await boot(db);a.api.savePrescriptionDraft(edited('Restart exact'),a.api.capturePrescriptionBase('rx-1'));a.control.failAfterCommit=true;await a.api.syncNow();const first=clone(puts(a).at(-1).body);
    const resumed=await boot(db,{device:a.device});const retry=puts(resumed).find(row=>operations(row).length);assert.deepEqual(retry.body,first);assert.equal(db.account(owner).rows.get('rx-1').rowVersion,2);assert.equal(resumed.api.diagnostics().pendingPrescriptions,0);
  }
  {
    const db=server(),a=await boot(db);a.api.savePrescriptionDraft(edited('Missing receipt'),a.api.capturePrescriptionBase('rx-1'));a.control.omitReceipt=true;assert.equal(await a.api.syncNow(),false);assert.equal(a.api.diagnostics().pendingPrescriptions,1);const first=clone(puts(a).at(-1).body);assert.equal(await a.api.syncNow(),true);assert.deepEqual(puts(a).at(-1).body,first);assert.equal(db.account(owner).rows.get('rx-1').rowVersion,2);
  }
  {
    const db=server(),a=await boot(db);const base=a.api.capturePrescriptionBase('rx-1');a.api.savePrescriptionDraft(edited('Old owner'),base);a.control.pauseNext=true;const flushing=a.api.syncNow();for(let i=0;i<20 && !a.control.pending;i++)await Promise.resolve();a.api.adoptOwner(other);a.control.who=other;assert.equal(a.api.savePrescriptionDraft(edited('Wrong account'),base).ok,false);a.control.pending();await flushing;assert.equal(db.account(other).rows.size,0);assert.deepEqual(local(a),[]);assert.equal(a.api.prescriptionConflicts().length,0);assert.equal(a.api.meta().libraryEnvelope,null);
  }
  {
    const db=server(),a=await boot(db);a.api.savePrescriptionDraft(edited('Legacy unknown editor'),{owner:owner.id,clientId:'rx-1',rowVersion:null,payload:null});assert.equal(a.api.prescriptionConflicts().length,1);await a.api.syncNow();assert.equal(db.account(owner).rows.get('rx-1').rowVersion,1);
    const result=a.api.savePrescriptionDraft(edited('x'.repeat(160*1024)),a.api.capturePrescriptionBase('rx-1'));assert.equal(result.ok,false);assert.equal(result.tooLarge,true);assert.equal(local(a)[0].sourceText,'Legacy unknown editor');
  }
  {
    const db=server(),a=await boot(db),device=a.device,originalSet=device.setItem;
    const count=puts(a).length;let quota=true;
    device.setItem=(key,value)=>{if(key===META && quota)throw new Error('Synthetic storage quota');originalSet(key,value);};
    const result=a.api.savePrescriptionDraft(edited('Quota-protected exact draft'),a.api.capturePrescriptionBase('rx-1'));
    assert.equal(result.ok,false);assert.equal(result.draftStored,true);assert.equal(await a.api.syncNow(),false);
    assert.equal(puts(a).length,count,'A write with unpersisted UUID metadata must never be sent');assert.equal(a.api.diagnostics().dirty,true);
    quota=false;assert.equal(await a.api.syncNow(),true);assert.equal(db.account(owner).rows.get('rx-1').payload.sourceText,'Quota-protected exact draft');
    assert.equal(a.api.diagnostics().syncInFlight,false);assert.equal(await a.api.syncNow(),true);
  }
  {
    const db=server(),a=await boot(db),device=a.device,originalSet=device.setItem;
    a.api.savePrescriptionDraft(edited('Acknowledged while storage is full'),a.api.capturePrescriptionBase('rx-1'));
    a.control.pauseNext=true;const saving=a.api.syncNow();for(let i=0;i<30 && !a.control.pending;i++)await Promise.resolve();
    assert.ok(a.control.pending);let quota=true;device.setItem=(key,value)=>{if(key===META && quota)throw new Error('Ack quota');originalSet(key,value);};
    a.control.pending();assert.equal(await saving,false);assert.equal(db.account(owner).rows.get('rx-1').rowVersion,2);
    assert.equal(a.api.diagnostics().metadataStoragePending,true);assert.equal(a.api.diagnostics().syncInFlight,false);
    quota=false;assert.equal(await a.api.syncNow(),true);assert.equal(a.api.diagnostics().metadataStoragePending,false);
    assert.equal(a.api.diagnostics().pendingPrescriptions,0);assert.equal(a.api.meta().libraryEnvelope,null);assert.equal(await a.api.syncNow(),true);assert.equal(db.account(owner).rows.get('rx-1').rowVersion,2);
  }
  {
    const db=server(),a=await boot(db);a.device.setItem(FAV,'["account-A-only"]');a.fire('medindex:favorites-changed');
    a.control.failAfterCommit=true;assert.equal(await a.api.syncNow(),false);const frozen=clone(a.api.meta().libraryEnvelope.body);
    assert.equal(frozen.libraryOwner,owner.id);assert.equal(operations({body:frozen}).length,0);
    a.control.who=other;assert.equal(await a.api.syncNow(),false);
    assert.deepEqual(puts(a).at(-1).body,frozen);assert.equal(db.account(other).favorites.size,0);
    assert.deepEqual(clone(a.api.meta().libraryEnvelope.body),frozen,'Account rejection preserves the old owner envelope without rebinding it');
    a.control.who=owner;assert.equal(await a.api.syncNow(),true);
  }
  {
    for(const payload of [{sourceText:'  Rp exact source  ',sections:[]},{id:'wrong-key',sourceText:'Exact mismatched identity',sections:[]}]) {
      const db=server(null);db.account(owner).rows.set('rx-external',{payload:clone(payload),rowVersion:1,deleted:false});const a=await boot(db);await a.api.syncNow();
      assert.equal(db.account(owner).rows.get('rx-external').rowVersion,1);assert.equal(db.account(owner).rows.get('rx-external').deleted,false);
      assert.ok(puts(a).every(row=>operations(row).length===0),'A historical identity mismatch must never become an automatic delete/create');
      assert.equal(a.api.prescriptionConflicts()[0].remoteAvailable,false);assert.deepEqual(clone(a.api.prescriptionConflicts()[0].remotePayload),payload);
    }
  }
  {
    const db=server(),a=await boot(db),backup=clone(local(a)[0]);const deleted=a.api.deletePrescription('rx-1');await a.api.syncNow();
    db.account(owner).rows.set('rx-1',{rowVersion:3,deleted:false,payload:edited('Another device restored and edited')});await a.api.syncNow();
    db.account(owner).rows.set('rx-1',{rowVersion:4,deleted:true,payload:null});await a.api.syncNow();
    const before=puts(a).length;const restored=a.api.restorePrescription(backup,deleted.base);
    assert.equal(restored.ok,true);assert.equal(restored.conflict,true,'An earlier own delete acknowledgement cannot approve a later tombstone');await a.api.syncNow();
    assert.equal(db.account(owner).rows.get('rx-1').rowVersion,4);assert.equal(db.account(owner).rows.get('rx-1').deleted,true);
    assert.ok(puts(a).slice(before).every(row=>operations(row).length===0));assert.deepEqual(local(a),[backup]);
    assert.equal(await a.api.retryLocalPrescription('rx-1'),true);await a.api.syncNow();assert.equal(db.account(owner).rows.get('rx-1').rowVersion,5);assert.deepEqual(db.account(owner).rows.get('rx-1').payload,backup);
  }
  {
    const db=server(),a=await boot(db);a.api.savePrescriptionDraft(edited('Conflict draft'),a.api.capturePrescriptionBase('rx-1'));
    db.account(owner).rows.set('rx-1',{rowVersion:2,deleted:false,payload:edited('Remote conflict')});await a.api.syncNow();
    a.device.setItem(FAV,'["frozen-favorite"]');a.fire('medindex:favorites-changed');a.control.failAfterCommit=true;await a.api.syncNow();
    const envelope=clone(a.api.meta().libraryEnvelope.body),before=puts(a).length;
    assert.equal(await a.api.retryLocalPrescription('rx-1'),true);
    assert.deepEqual(puts(a)[before].body,envelope,'A conflict choice confirms the uncertain earlier envelope before rebasing');
    await a.api.syncNow();assert.equal(db.account(owner).rows.get('rx-1').payload.sourceText,'Conflict draft');
  }
  console.log('✓ Prescription client CAS covers exact drafts, two devices, editor-open versions, unseen latest/rebase choices, frozen complete envelopes, queued successors, delete/Undo, reload/lost receipts, and owner isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
