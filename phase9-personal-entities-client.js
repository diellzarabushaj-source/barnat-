(() => {
  'use strict';

  const API='/api/user-library';
  const TYPES=new Set(['substance','variant','product']);
  const MAX_NOTE=2000;
  const state={
    loaded:false,
    user:null,
    favorites:new Map(),
    notes:new Map(),
    error:'',
  };
  let loadPromise=null;
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

  async function request(body=null) {
    const response=await fetch(API,{
      method:body ? 'PUT' : 'GET',
      credentials:'same-origin',
      cache:'no-store',
      headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error || 'Biblioteka personale nuk u lexua.');
    return payload;
  }

  function adopt(snapshot) {
    state.favorites.clear();
    state.notes.clear();
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
      const content=String(row?.content ?? '').slice(0,MAX_NOTE);
      if(!entityKey || !content.trim()) continue;
      state.notes.set(id(row.entityType,entityKey),{
        entityType:row.entityType,
        entityKey,
        content,
        clientUpdatedAt:text(row.clientUpdatedAt),
        serverUpdatedAt:text(row.serverUpdatedAt),
      });
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
      error:state.error,
    };
  }

  async function load({force=false}={}) {
    if(loadPromise && !force) return loadPromise;
    loadPromise=(async()=>{
      try{
        const snapshot=await request();
        adopt(snapshot);
        resolveReady?.(snapshotView());
        resolveReady=null;
        return snapshotView();
      }catch(error){
        state.error=error?.message || 'Biblioteka personale nuk u lexua.';
        if(!state.loaded) {
          resolveReady?.(snapshotView());
          resolveReady=null;
        }
        throw error;
      }finally{
        loadPromise=null;
      }
    })();
    return loadPromise;
  }

  function isFavorite(type,key) {
    const entity=validate(type,key);
    return state.favorites.has(id(entity.entityType,entity.entityKey));
  }

  function note(type,key) {
    const entity=validate(type,key);
    return state.notes.get(id(entity.entityType,entity.entityKey))?.content || '';
  }

  async function setFavorite(type,key,favorite=true,payload={}) {
    const entity=validate(type,key);
    const stamp=new Date().toISOString();
    const body=favorite
      ? {version:1,favorites:[{...entity,payload:payload && typeof payload==='object' ? payload : {},clientUpdatedAt:stamp}]}
      : {version:1,tombstones:{favorites:[{...entity,deletedAt:stamp}]}};
    const snapshot=await request(body);
    adopt(snapshot);
    window.dispatchEvent(new CustomEvent('drx:phase9-personal-changed',{
      detail:{kind:'favorite',...entity,favorite:Boolean(favorite)}
    }));
    return isFavorite(entity.entityType,entity.entityKey);
  }

  async function toggleFavorite(type,key,payload={}) {
    return setFavorite(type,key,!isFavorite(type,key),payload);
  }

  async function saveNote(type,key,content) {
    const entity=validate(type,key);
    const value=String(content ?? '').slice(0,MAX_NOTE);
    if(!value.trim()) return deleteNote(entity.entityType,entity.entityKey);
    const stamp=new Date().toISOString();
    const snapshot=await request({
      version:1,
      entityNotes:[{...entity,content:value,clientUpdatedAt:stamp}],
    });
    adopt(snapshot);
    window.dispatchEvent(new CustomEvent('drx:phase9-personal-changed',{
      detail:{kind:'note',...entity,deleted:false}
    }));
    return note(entity.entityType,entity.entityKey);
  }

  async function deleteNote(type,key) {
    const entity=validate(type,key);
    const snapshot=await request({
      version:1,
      tombstones:{entityNotes:[{...entity,deletedAt:new Date().toISOString()}]},
    });
    adopt(snapshot);
    window.dispatchEvent(new CustomEvent('drx:phase9-personal-changed',{
      detail:{kind:'note',...entity,deleted:true}
    }));
    return '';
  }

  window.DRxPhase9Personal=Object.freeze({
    ready,
    load,
    state:snapshotView,
    isFavorite,
    setFavorite,
    toggleFavorite,
    note,
    saveNote,
    deleteNote,
    entityTypes:Object.freeze([...TYPES]),
    version:'drx-phase9-personal-v1',
  });

  const start=()=>void load().catch(()=>{});
  window.addEventListener('medindex:auth-ready',start,{once:true});
  if(document.documentElement.classList.contains('auth-ready')) start();
})();
