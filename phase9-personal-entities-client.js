(() => {
  'use strict';

  const API='/api/user-library';
  const TYPES=new Set(['drug','substance','variant','product']);
  const MAX_NOTE=2000;
  const state={
    loaded:false,
    user:null,
    favorites:new Map(),
    notes:new Map(),
    noteVersions:new Map(),
    error:'',
  };
  let loadPromise=null;
  let scopeEpoch=0;
  let loadSequence=0;
  let authIdentity='';
  const requests=new Set();
  const pendingNotes=new Map();
  const noteInFlight=new Set();
  let resolveReady;
  const ready=new Promise(resolve=>{ resolveReady=resolve; });
  const text=value=>String(value ?? '').trim();
  const id=(type,key)=>`${type}|${key}`;

  function validate(type,key) {
    const entityType=text(type);
    const entityKey=text(key).slice(0,300);
    if(!TYPES.has(entityType) || !entityKey) throw new Error('Identitet personal Phase 9 i pavlefshëm.');
    return {entityType,entityKey};
  }

  const owner=()=>text(state.user?.id);
  const rowVersion=value=>Number.isSafeInteger(value) && value>=0 ? value : null;
  function ownerChanged() {
    const error=new Error('Llogaria ka ndryshuar. Hape shënimin përsëri në llogarinë aktive.');
    error.status=409; error.code='NOTE_OWNER_CHANGED';
    return error;
  }
  function resetOwner() {
    scopeEpoch+=1;
    loadSequence+=1;
    requests.forEach(controller=>controller.abort());
    state.favorites.clear(); state.notes.clear(); state.noteVersions.clear();
    pendingNotes.clear(); noteInFlight.clear();
    state.user=null; state.loaded=false; state.error=''; loadPromise=null;
    window.dispatchEvent(new CustomEvent('drx:phase9-personal-owner-changed'));
  }

  async function request(body=null,epoch=scopeEpoch) {
    if(epoch!==scopeEpoch) throw ownerChanged();
    if(body && (!body.libraryOwner || body.libraryOwner!==owner())) throw ownerChanged();
    const controller=new AbortController(); requests.add(controller);
    try {
    const response=await fetch(API,{
      method:body ? 'PUT' : 'GET',
      credentials:'same-origin',
      cache:'no-store',
      signal:controller.signal,
      headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const payload=await response.json().catch(()=>({}));
    if(epoch!==scopeEpoch) throw ownerChanged();
    if(!response.ok) {
      const error=new Error(payload.error || 'Biblioteka personale nuk u lexua.');
      error.status=response.status; error.code=payload.code || ''; error.data=payload;
      throw error;
    }
    if(body?.libraryOwner && text(payload.user?.id)!==body.libraryOwner) throw ownerChanged();
    return payload;
    } catch(error) {
      if(epoch!==scopeEpoch) throw ownerChanged();
      throw error;
    } finally { requests.delete(controller); }
  }

  function adopt(snapshot) {
    if(owner() && text(snapshot?.user?.id)!==owner()) resetOwner();
    const previousNotes=new Map(state.notes);
    const previousVersions=new Map(state.noteVersions);
    state.favorites.clear();
    state.notes.clear();
    state.noteVersions.clear();
    for(const row of snapshot?.noteVersions || []) {
      if(!TYPES.has(text(row?.entityType)) || !text(row?.entityKey)) continue;
      const version=rowVersion(row.rowVersion);
      if(version!==null) state.noteVersions.set(id(row.entityType,text(row.entityKey)),{rowVersion:version,deleted:Boolean(row.deleted)});
    }
    for(const row of snapshot?.tombstones?.entityNotes || []) {
      if(!TYPES.has(text(row?.entityType)) || !text(row?.entityKey)) continue;
      const version=rowVersion(row.rowVersion);
      state.noteVersions.set(id(row.entityType,text(row.entityKey)),{rowVersion:version,deleted:true});
    }
    for(const row of snapshot?.favorites || []) {
      if(!TYPES.has(text(row?.entityType))) continue;
      const entityKey=text(row?.entityKey);
      if(!entityKey) continue;
      state.favorites.set(id(row.entityType,entityKey),{
        entityType:row.entityType,
        entityKey,
        payload:row.payload || {},
        clientUpdatedAt:text(row.clientUpdatedAt),
        serverUpdatedAt:text(row.serverUpdatedAt),
      });
    }
    for(const row of snapshot?.entityNotes || []) {
      if(!TYPES.has(text(row?.entityType))) continue;
      const entityKey=text(row?.entityKey);
      const content=String(row?.content ?? '');
      if(!entityKey || !content.trim()) continue;
      const noteId=id(row.entityType,entityKey);
      const version=rowVersion(row.rowVersion);
      if(version!==null || !state.noteVersions.has(noteId)) state.noteVersions.set(noteId,{rowVersion:version,deleted:false});
      state.notes.set(noteId,{
        entityType:row.entityType,
        entityKey,
        content,
        payload:row.payload && typeof row.payload === 'object' ? row.payload : {},
        clientUpdatedAt:text(row.clientUpdatedAt),
        serverUpdatedAt:text(row.serverUpdatedAt),
        rowVersion:version,
      });
    }
    // A late full snapshot from another mutation must not roll back a newer
    // acknowledged note or forget a tombstone created while it was in flight.
    for(const [key,base] of previousVersions) {
      if(base.rowVersion===null || base.rowVersion<=(state.noteVersions.get(key)?.rowVersion ?? 0)) continue;
      state.noteVersions.set(key,base);
      if(previousNotes.has(key)) state.notes.set(key,previousNotes.get(key));
      else state.notes.delete(key);
    }
    state.user=snapshot?.user || null;
    state.loaded=true;
    state.error='';
    window.dispatchEvent(new CustomEvent('drx:phase9-personal-ready',{detail:snapshotView()}));
  }

  function snapshotView() {
    return {
      loaded:state.loaded,
      user:state.user,
      favorites:[...state.favorites.values()].map(item=>({...item})),
      notes:[...state.notes.values()].map(item=>({...item})),
      noteVersions:[...state.noteVersions].map(([key,base])=>({entityType:key.slice(0,key.indexOf('|')),entityKey:key.slice(key.indexOf('|')+1),...base})),
      error:state.error,
    };
  }

  async function load({force=false}={}) {
    if(loadPromise && !force) return loadPromise;
    const epoch=scopeEpoch,sequence=++loadSequence;
    const pending=(async()=>{
      try{
        const snapshot=await request(null,epoch);
        if(sequence!==loadSequence || epoch!==scopeEpoch) throw ownerChanged();
        adopt(snapshot);
        resolveReady?.(snapshotView());
        resolveReady=null;
        return snapshotView();
      }catch(error){
        if(epoch!==scopeEpoch || sequence!==loadSequence) throw error;
        state.error=error?.message || 'Biblioteka personale nuk u lexua.';
        if(!state.loaded) {
          resolveReady?.(snapshotView());
          resolveReady=null;
        }
        throw error;
      }finally{
        if(loadPromise===pending) loadPromise=null;
      }
    })();
    loadPromise=pending;
    return pending;
  }

  function isFavorite(type,key) {
    const entity=validate(type,key);
    return state.favorites.has(id(entity.entityType,entity.entityKey));
  }

  function note(type,key) {
    const entity=validate(type,key);
    return state.notes.get(id(entity.entityType,entity.entityKey))?.content || '';
  }

  function noteBase(type,key) {
    const entity=validate(type,key),keyId=id(entity.entityType,entity.entityKey);
    if(!state.loaded || !owner()) throw new Error('Shënimet nuk janë lexuar ende për këtë llogari.');
    const base=state.noteVersions.get(keyId);
    return Object.freeze({owner:owner(),rowVersion:base ? base.rowVersion : 0,deleted:base?.deleted ?? true,content:state.notes.get(keyId)?.content || ''});
  }

  async function setFavorite(type,key,favorite=true,payload={}) {
    const entity=validate(type,key);
    const epoch=scopeEpoch;
    if(!state.loaded) await load();
    if(epoch!==scopeEpoch || !owner()) throw ownerChanged();
    const libraryOwner=owner();
    const stamp=new Date().toISOString();
    const body=favorite
      ? {version:1,libraryOwner,favorites:[{...entity,payload:payload && typeof payload==='object' ? payload : {},clientUpdatedAt:stamp}]}
      : {version:1,libraryOwner,tombstones:{favorites:[{...entity,deletedAt:stamp}]}};
    const snapshot=await request(body,epoch);
    adopt(snapshot);
    window.dispatchEvent(new CustomEvent('drx:phase9-personal-changed',{
      detail:{kind:'favorite',...entity,favorite:Boolean(favorite)}
    }));
    return isFavorite(entity.entityType,entity.entityKey);
  }

  async function toggleFavorite(type,key,payload={}) {
    return setFavorite(type,key,!isFavorite(type,key),payload);
  }

  async function writeNote(type,key,content,options={},deleted=false) {
    const entity=validate(type,key);
    const value=String(content ?? '');
    if(value.length>MAX_NOTE) {
      const error=new Error('Shënimi lejon maksimum 2000 karaktere. Shkurtoje draftin para ruajtjes.');
      error.status=413; error.code='NOTE_TOO_LONG'; throw error;
    }
    const epoch=scopeEpoch;
    if(!state.loaded) await load();
    if(epoch!==scopeEpoch) throw ownerChanged();
    const base=noteBase(entity.entityType,entity.entityKey);
    const noteOwner=text(options.owner || base.owner);
    if(!noteOwner || noteOwner!==owner()) throw ownerChanged();
    const expectedVersion=Object.hasOwn(options,'expectedVersion') ? rowVersion(options.expectedVersion) : base.rowVersion;
    if(expectedVersion===null) {
      const error=new Error('Versioni i shënimit nuk u lexua. Lexo versionin e fundit para ruajtjes.');
      error.status=409; error.code='NOTE_VERSION_REQUIRED'; throw error;
    }
    const keyId=id(entity.entityType,entity.entityKey);
    if(noteInFlight.has(keyId)) throw new Error('Shënimi po ruhet. Prit përfundimin.');
    const retryKey=JSON.stringify([noteOwner,keyId,expectedVersion,deleted,value,Boolean(options.restore),options.operationId || '']);
    let operation=pendingNotes.get(retryKey);
    if(!operation) {
      const operationId=options.operationId || window.crypto.randomUUID();
      const stamp=new Date().toISOString();
      const row={...entity,expectedVersion,operationId,...(deleted ? {deletedAt:stamp} : {content:value,clientUpdatedAt:stamp,...(options.restore ? {restore:true} : {})})};
      operation={operationId,body:deleted ? {version:1,libraryOwner:noteOwner,noteOwner,tombstones:{entityNotes:[row]}} : {version:1,libraryOwner:noteOwner,noteOwner,entityNotes:[row]}};
      pendingNotes.set(retryKey,operation);
    }
    noteInFlight.add(keyId);
    try {
      if(epoch!==scopeEpoch || noteOwner!==owner()) throw ownerChanged();
      const snapshot=await request(operation.body,epoch);
      const acknowledged=(snapshot.noteOperations || []).find(row=>row.operationId===operation.operationId && row.entityType===entity.entityType && row.entityKey===entity.entityKey && Boolean(row.deleted)===deleted);
      if(!acknowledged || rowVersion(acknowledged.rowVersion)===null || acknowledged.rowVersion<1) throw new Error('Ruajtja nuk u konfirmua. Provo përsëri pa ndryshuar draftin.');
      adopt(snapshot);
      pendingNotes.delete(retryKey);
      window.dispatchEvent(new CustomEvent('drx:phase9-personal-changed',{detail:{kind:'note',...entity,deleted}}));
      return {owner:noteOwner,rowVersion:acknowledged.rowVersion,deleted,operationId:operation.operationId};
    } finally { if(epoch===scopeEpoch) noteInFlight.delete(keyId); }
  }

  async function saveNote(type,key,content,options={}) {
    const value=String(content ?? '');
    if(value.length>MAX_NOTE) {
      const error=new Error('Shënimi lejon maksimum 2000 karaktere. Shkurtoje draftin para ruajtjes.');
      error.status=413; error.code='NOTE_TOO_LONG'; throw error;
    }
    if(!value.trim()) return deleteNote(type,key,options);
    await writeNote(type,key,value,options);
    return note(type,key);
  }

  async function deleteNote(type,key,options={}) {
    return writeNote(type,key,'',options,true);
  }

  window.DRxPhase9Personal=Object.freeze({
    ready,
    load,
    state:snapshotView,
    isFavorite,
    setFavorite,
    toggleFavorite,
    note,
    noteBase,
    saveNote,
    deleteNote,
    entityTypes:Object.freeze([...TYPES]),
    version:'drx-phase9-personal-v4',
  });

  const start=event=>{
    const account=event?.detail;
    const identity=text(account?.authUser?.id || account?.user?.id || account?.user?.email);
    const email=text(account?.user?.email).toLowerCase();
    if(identity && ((authIdentity && identity!==authIdentity) || (!authIdentity && loadPromise && !state.loaded) || (!authIdentity && state.user && !email && identity!==owner()) || (state.user && email && email!==text(state.user.email).toLowerCase()))) resetOwner();
    if(identity) authIdentity=identity;
    void load().catch(()=>{});
  };
  window.addEventListener('medindex:auth-ready',start);
  window.addEventListener('medindex:auth-failed',resetOwner);
  window.addEventListener('medindex:offline-auth-invalid',resetOwner);
  if(document.documentElement.classList.contains('auth-ready')) start();
})();

(() => {
  'use strict';
  if(document.documentElement.dataset.drxApp !== 'dozologjia-v2') return;
  const script=document.createElement('script');
  script.src='/pediatric-core-reference.js?v=1';
  script.defer=true;
  document.head.append(script);
})();
