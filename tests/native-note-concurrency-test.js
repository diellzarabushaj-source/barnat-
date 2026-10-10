'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('phase9-personal-entities-client.js','utf8');
const product='11111111-1111-4111-8111-111111111111';
const initial='  Shënim me ë\nDhe hapësira.  ';

function database(){
  let account={id:'owner-a',email:'a@example.test'},version=1,content=initial,deleted=false,favorites=[];
  const requests=[],receipts=new Map();
  let failAfterCommit=false;
  const snapshot=()=>({user:{...account},favorites:[...favorites],entityNotes:deleted ? [] : [{entityType:'product',entityKey:product,content,rowVersion:version}],tombstones:{entityNotes:deleted ? [{entityType:'product',entityKey:product,rowVersion:version,deletedAt:'2026-10-10T00:00:00Z'}] : []},noteVersions:[{entityType:'product',entityKey:product,rowVersion:version,deleted}]});
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
  async function fetch(_url,options){
    if(options.method==='GET') return response(snapshot());
    const body=JSON.parse(options.body); requests.push(body);
    if(body.libraryOwner!==account.id) return response({code:'LIBRARY_OWNER_CHANGED',error:'Llogaria ndryshoi.'},409);
    if(body.favorites || body.tombstones?.favorites){
      const favorite=body.favorites?.[0] || body.tombstones.favorites[0];
      favorites=favorites.filter(row=>row.entityType!==favorite.entityType || row.entityKey!==favorite.entityKey);
      if(body.favorites) favorites.push(favorite);
      return response(snapshot());
    }
    const item=body.entityNotes?.[0] || body.tombstones?.entityNotes?.[0];
    if(body.noteOwner!==account.id) return response({code:'NOTE_OWNER_CHANGED',error:'Llogaria ndryshoi.'},409);
    const existing=receipts.get(item.operationId);
    if(existing){
      assert.equal(existing.body,options.body,'uncertain retries must preserve the entire operation');
      return response({...snapshot(),noteOperations:[existing.ack]});
    }
    if(item.expectedVersion!==version || (item.restore && !deleted)) return response({code:'NOTE_VERSION_CONFLICT',error:'Versioni ndryshoi.',conflicts:[{entityType:'product',entityKey:product,rowVersion:version,deleted}]},409);
    content=body.entityNotes ? item.content : '';
    deleted=!body.entityNotes;
    version++;
    const ack={operationId:item.operationId,entityType:'product',entityKey:product,rowVersion:version,deleted};
    receipts.set(item.operationId,{body:options.body,ack});
    if(failAfterCommit){failAfterCommit=false;throw new Error('Connection lost after commit');}
    return response({...snapshot(),noteOperations:[ack]});
  }
  return {fetch,snapshot,requests,loseReply:()=>{failAfterCommit=true;},switchOwner:()=>{account={id:'owner-b',email:'b@example.test'};version=0;content='';deleted=true;favorites=[];}};
}

function client(fetch){
  const events=new EventTarget();
  class CustomEvent extends Event {constructor(type,options={}){super(type);this.detail=options.detail;}}
  const window={crypto:webcrypto,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
  const context={window,document:{documentElement:{dataset:{},classList:{contains:()=>false}}},fetch,CustomEvent,AbortController};
  vm.runInNewContext(source,context);
  return {api:window.DRxPhase9Personal,auth:detail=>events.dispatchEvent(new CustomEvent('medindex:auth-ready',{detail}))};
}

const watchdog=setTimeout(()=>{console.error('Native note concurrency test did not settle.');process.exitCode=1;},5000);
(async()=>{
  const db=database(),a=client(db.fetch),b=client(db.fetch);
  await Promise.all([a.api.load(),b.api.load()]);
  const opened=a.api.noteBase('product',product);
  assert.equal(opened.content,initial);
  const tooLong='🙂'.repeat(1001);
  await assert.rejects(a.api.saveNote('product',product,tooLong),error=>error.code==='NOTE_TOO_LONG' && error.status===413);
  await assert.rejects(a.api.saveNote('product',product,' '.repeat(2001)),error=>error.code==='NOTE_TOO_LONG');
  assert.equal(db.requests.length,0,'oversized text must be rejected instead of truncated or submitted');
  await b.api.saveNote('product',product,'Changed remotely');
  await assert.rejects(a.api.saveNote('product',product,initial+'draft',{owner:opened.owner,expectedVersion:opened.rowVersion}),error=>error.status===409 && error.code==='NOTE_VERSION_CONFLICT' && error.data.conflicts[0].rowVersion===2);
  assert.equal(a.api.note('product',product),initial,'a conflict must not adopt a new base behind the editor');
  await a.api.load({force:true});
  const deletion=await a.api.deleteNote('product',product);
  assert.equal(deletion.rowVersion,3);
  assert.equal(deletion.deleted,true);
  assert.equal(a.api.noteBase('product',product).rowVersion,3,'tombstone keeps its exact acknowledged version');
  await b.api.load({force:true});
  await b.api.saveNote('product',product,'Second device edit');
  await b.api.deleteNote('product',product);
  await a.api.load({force:true});
  assert.equal(a.api.note('product',product),'');
  await assert.rejects(a.api.saveNote('product',product,initial,{owner:deletion.owner,expectedVersion:deletion.rowVersion,restore:true}),error=>error.code==='NOTE_VERSION_CONFLICT');
  assert.equal(db.snapshot().noteVersions[0].rowVersion,5,'ABA must not restore an obsolete deletion');
  const currentDelete=await a.api.deleteNote('product',product);
  await a.api.saveNote('product',product,initial,{owner:currentDelete.owner,expectedVersion:currentDelete.rowVersion,restore:true});
  assert.equal(db.snapshot().entityNotes[0].content,initial,'restore preserves all whitespace and line breaks');

  db.loseReply();
  await assert.rejects(a.api.saveNote('product',product,'  Retry exact\ntext.  '),/Connection lost/);
  await a.api.saveNote('product',product,'  Retry exact\ntext.  ');
  const retries=db.requests.slice(-2);
  assert.deepEqual(retries[0],retries[1]);
  assert.match(retries[0].entityNotes[0].operationId,/^[a-f0-9-]{36}$/);
  assert.equal(db.snapshot().noteVersions[0].rowVersion,8,'retry commits only once');

  // Ignore cancellation to model a network response that has already arrived.
  // The account epoch must still discard it and prevent the pending edit PUT.
  const scopeDb=database();
  let release,hold=true;
  const delayedSnapshot=scopeDb.snapshot();
  const deferred=new Promise(resolve=>{release=resolve;});
  const c=client(async(url,options)=>{
    if(options.method==='GET' && hold){await deferred;return {ok:true,status:200,json:async()=>delayedSnapshot};}
    return scopeDb.fetch(url,options);
  });
  const pending=c.api.saveNote('product',product,'Draft from A');
  scopeDb.switchOwner(); hold=false;
  c.auth({user:{id:'owner-b',email:'b@example.test'},authUser:{id:'owner-b'}});
  await c.api.load();
  release();
  await assert.rejects(pending,error=>error.code==='NOTE_OWNER_CHANGED');
  assert.equal(c.api.state().user.id,'owner-b');
  assert.equal(c.api.note('product',product),'');
  assert.equal(scopeDb.requests.length,0,'no draft from A may be submitted under B');

  // Ordinary favorite writes also carry the snapshot owner. A response that
  // crossed an account switch cannot populate the new account's collection.
  const favoriteDb=database(),favoriteClient=client(favoriteDb.fetch);
  await favoriteClient.api.load();
  assert.equal(await favoriteClient.api.setFavorite('product',product,true),true);
  assert.equal(favoriteDb.requests.at(-1).libraryOwner,'owner-a');
  assert.equal(await favoriteClient.api.setFavorite('product',product,false),false);
  assert.equal(favoriteDb.requests.at(-1).libraryOwner,'owner-a','Deletion-only favorites retain the captured owner');
  let releaseFavorite;
  const favoriteReply=new Promise(resolve=>{releaseFavorite=resolve;});
  const crossing=client(async(url,options)=>{
    const response=await favoriteDb.fetch(url,options);
    if(options.method==='PUT') await favoriteReply;
    return response;
  });
  await crossing.api.load();
  const pendingFavorite=crossing.api.setFavorite('product',product,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(favoriteDb.requests.at(-1).libraryOwner,'owner-a');
  favoriteDb.switchOwner();
  crossing.auth({user:{id:'owner-b',email:'b@example.test'},authUser:{id:'owner-b'}});
  await crossing.api.load();
  releaseFavorite();
  await assert.rejects(pendingFavorite,error=>error.code==='NOTE_OWNER_CHANGED');
  assert.equal(crossing.api.state().user.id,'owner-b');
  assert.equal(crossing.api.isFavorite('product',product),false,'An old-account favorite reply never repopulates the new account');
  assert.equal(favoriteDb.snapshot().favorites.length,0);

  // Missing version on an existing note never masquerades as known absence.
  const unknown=client(async()=>({ok:true,status:200,json:async()=>({user:{id:'owner-a'},favorites:[],entityNotes:[{entityType:'product',entityKey:product,content:initial}]})}));
  await unknown.api.load();
  await assert.rejects(unknown.api.saveNote('product',product,'Edited'),error=>error.code==='NOTE_VERSION_REQUIRED');
  console.log('PASS: native note CAS, immutable editor base, exact tombstone/ABA restore, idempotent retries, missing-version rejection and account epoch isolation for notes and ordinary favorites.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
