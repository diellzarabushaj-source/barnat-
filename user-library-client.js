(() => {
  'use strict';

  const API_URL = '/api/user-library';
  const PRESCRIPTIONS_KEY = 'regjistriBarnave_protokollet_v1';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const META_KEY = 'medindex_user_library_meta_v1';
  const RELOAD_KEY = 'medindex_user_library_reload_v1';
  const POLL_MS = 1200;
  const SYNC_DELAY_MS = 700;
  const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);

  let lastState = null;
  let syncTimer = 0;
  let pollTimer = 0;
  let syncPromise = null;
  let dirty = false;
  let online = navigator.onLine;
  let resolveReady;

  window.MEDINDEX_LIBRARY_READY = new Promise(resolve => { resolveReady = resolve; });

  const text = value => String(value ?? '').trim();
  const nowIso = () => new Date().toISOString();
  const time = value => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  function parseArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function readMeta() {
    try {
      const value = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return value && typeof value === 'object' ? {
        prescriptions:value.prescriptions && typeof value.prescriptions === 'object' ? value.prescriptions : {},
        favorites:value.favorites && typeof value.favorites === 'object' ? value.favorites : {},
        deletedPrescriptions:value.deletedPrescriptions && typeof value.deletedPrescriptions === 'object' ? value.deletedPrescriptions : {},
        deletedFavorites:value.deletedFavorites && typeof value.deletedFavorites === 'object' ? value.deletedFavorites : {},
        lastSyncedAt:text(value.lastSyncedAt),
      } : emptyMeta();
    } catch {
      return emptyMeta();
    }
  }

  function emptyMeta() {
    return { prescriptions:{}, favorites:{}, deletedPrescriptions:{}, deletedFavorites:{}, lastSyncedAt:'' };
  }

  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(pruneMeta(meta))); } catch {}
  }

  function pruneMeta(meta) {
    const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
    Object.keys(meta.deletedPrescriptions || {}).forEach(key => {
      if (time(meta.deletedPrescriptions[key]) < cutoff) delete meta.deletedPrescriptions[key];
    });
    Object.keys(meta.deletedFavorites || {}).forEach(key => {
      if (time(meta.deletedFavorites[key]) < cutoff) delete meta.deletedFavorites[key];
    });
    return meta;
  }

  function readState() {
    return {
      prescriptions:parseArray(PRESCRIPTIONS_KEY),
      favorites:parseArray(FAVORITES_KEY).map(String).filter(Boolean),
    };
  }

  function stableState(state) {
    return JSON.stringify({
      prescriptions:[...(state.prescriptions || [])].sort((a, b) => text(a?.id).localeCompare(text(b?.id))),
      favorites:[...(state.favorites || [])].map(String).sort(),
    });
  }

  function protocolId(item) {
    return text(item?.id);
  }

  function favoriteId(type, key) {
    return `${type || 'drug'}|${key}`;
  }

  function ensureMetaForState(state, meta, stamp = nowIso()) {
    state.prescriptions.forEach(item => {
      const id = protocolId(item);
      if (!id) return;
      meta.prescriptions[id] = meta.prescriptions[id] || item.updatedAt || item.createdAt || stamp;
      delete meta.deletedPrescriptions[id];
    });
    state.favorites.forEach(key => {
      const id = favoriteId('drug', key);
      meta.favorites[id] = meta.favorites[id] || stamp;
      delete meta.deletedFavorites[id];
    });
    return meta;
  }

  function recordLocalChanges(previous, current) {
    const meta = ensureMetaForState(current, readMeta());
    const stamp = nowIso();
    const previousPrescriptions = new Map((previous?.prescriptions || []).map(item => [protocolId(item), item]));
    const currentPrescriptions = new Map((current.prescriptions || []).map(item => [protocolId(item), item]));

    previousPrescriptions.forEach((item, id) => {
      if (!id || currentPrescriptions.has(id)) return;
      meta.deletedPrescriptions[id] = stamp;
      delete meta.prescriptions[id];
    });
    currentPrescriptions.forEach((item, id) => {
      if (!id) return;
      const before = previousPrescriptions.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        meta.prescriptions[id] = item.updatedAt || stamp;
        delete meta.deletedPrescriptions[id];
      }
    });

    const previousFavorites = new Set((previous?.favorites || []).map(String));
    const currentFavorites = new Set((current.favorites || []).map(String));
    previousFavorites.forEach(key => {
      if (currentFavorites.has(key)) return;
      const id = favoriteId('drug', key);
      meta.deletedFavorites[id] = stamp;
      delete meta.favorites[id];
    });
    currentFavorites.forEach(key => {
      if (previousFavorites.has(key)) return;
      const id = favoriteId('drug', key);
      meta.favorites[id] = stamp;
      delete meta.deletedFavorites[id];
    });
    writeMeta(meta);
  }

  function buildBody() {
    const state = readState();
    const meta = ensureMetaForState(state, readMeta());
    writeMeta(meta);
    return {
      version:1,
      prescriptions:state.prescriptions.flatMap(payload => {
        const clientId = protocolId(payload);
        return clientId ? [{ clientId, payload, clientUpdatedAt:meta.prescriptions[clientId] || payload.updatedAt || nowIso() }] : [];
      }),
      favorites:state.favorites.map(entityKey => ({
        entityType:'drug',
        entityKey,
        payload:{},
        clientUpdatedAt:meta.favorites[favoriteId('drug', entityKey)] || nowIso(),
      })),
      tombstones:{
        prescriptions:Object.entries(meta.deletedPrescriptions).map(([clientId, deletedAt]) => ({ clientId, deletedAt })),
        favorites:Object.entries(meta.deletedFavorites).map(([id, deletedAt]) => {
          const separator = id.indexOf('|');
          return { entityType:id.slice(0, separator) || 'drug', entityKey:id.slice(separator + 1), deletedAt };
        }).filter(item => item.entityKey),
      },
    };
  }

  function mergeRemote(snapshot) {
    const local = readState();
    const meta = ensureMetaForState(local, readMeta());
    const prescriptions = new Map(local.prescriptions.map(item => [protocolId(item), item]).filter(([id]) => id));

    (snapshot.prescriptions || []).forEach(row => {
      const id = text(row.clientId || row.payload?.id);
      if (!id || !row.payload || typeof row.payload !== 'object') return;
      const localItem = prescriptions.get(id);
      const localUpdated = time(meta.prescriptions[id] || localItem?.updatedAt || localItem?.createdAt);
      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);
      if (!localItem || remoteUpdated > localUpdated) {
        prescriptions.set(id, row.payload);
        meta.prescriptions[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();
      }
      delete meta.deletedPrescriptions[id];
    });

    (snapshot.tombstones?.prescriptions || []).forEach(row => {
      const id = text(row.clientId);
      if (!id) return;
      const localItem = prescriptions.get(id);
      const localUpdated = time(meta.prescriptions[id] || localItem?.updatedAt || localItem?.createdAt);
      if (time(row.deletedAt) >= localUpdated) {
        prescriptions.delete(id);
        delete meta.prescriptions[id];
        meta.deletedPrescriptions[id] = row.deletedAt;
      }
    });

    const favorites = new Set(local.favorites);
    (snapshot.favorites || []).forEach(row => {
      const type = text(row.entityType) || 'drug';
      const key = text(row.entityKey);
      if (!key || type !== 'drug') return;
      const id = favoriteId(type, key);
      if (!favorites.has(key) || time(row.clientUpdatedAt || row.serverUpdatedAt) > time(meta.favorites[id])) {
        favorites.add(key);
        meta.favorites[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();
      }
      delete meta.deletedFavorites[id];
    });

    (snapshot.tombstones?.favorites || []).forEach(row => {
      const type = text(row.entityType) || 'drug';
      const key = text(row.entityKey);
      const id = favoriteId(type, key);
      if (!key || type !== 'drug') return;
      if (time(row.deletedAt) >= time(meta.favorites[id])) {
        favorites.delete(key);
        delete meta.favorites[id];
        meta.deletedFavorites[id] = row.deletedAt;
      }
    });

    const merged = { prescriptions:[...prescriptions.values()], favorites:[...favorites] };
    const changed = stableState(local) !== stableState(merged);
    try {
      localStorage.setItem(PRESCRIPTIONS_KEY, JSON.stringify(merged.prescriptions));
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(merged.favorites));
    } catch {}
    writeMeta(meta);
    lastState = merged;
    return changed;
  }

  async function api(url, options = {}) {
    const response = await nativeFetch(url, {
      cache:'no-store',
      credentials:'same-origin',
      headers:{ Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || `Library API ${response.status}`), { status:response.status });
    return payload;
  }

  function dispatch(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function scheduleSync(delay = SYNC_DELAY_MS) {
    dirty = true;
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => { void flush(); }, delay);
  }

  async function flush({ keepalive = false } = {}) {
    if (!online || !navigator.onLine) return false;
    if (syncPromise) return syncPromise;
    clearTimeout(syncTimer);
    syncPromise = (async () => {
      try {
        const payload = await api(API_URL, {
          method:'PUT',
          body:JSON.stringify(buildBody()),
          keepalive,
        });
        const meta = readMeta();
        meta.lastSyncedAt = payload.generatedAt || nowIso();
        writeMeta(meta);
        dirty = false;
        dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt });
        return true;
      } catch (error) {
        if (error.status === 401 || error.status === 403) return false;
        dirty = true;
        dispatch('medindex:library-pending', { offline:!navigator.onLine });
        return false;
      } finally {
        syncPromise = null;
      }
    })();
    return syncPromise;
  }

  function reloadForRemoteChange() {
    const signature = stableState(readState());
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === signature) return;
      sessionStorage.setItem(RELOAD_KEY, signature);
    } catch {}
    location.reload();
  }

  async function initialize() {
    const local = readState();
    const meta = ensureMetaForState(local, readMeta());
    writeMeta(meta);
    lastState = local;
    if (!navigator.onLine) {
      dispatch('medindex:library-ready', { offline:true, local:true });
      resolveReady?.({ offline:true, local:true });
      return;
    }
    try {
      const snapshot = await api(API_URL);
      const changed = mergeRemote(snapshot);
      await flush();
      dispatch('medindex:library-ready', { offline:false, local:false, user:snapshot.user });
      resolveReady?.({ offline:false, local:false, user:snapshot.user });
      if (changed) window.setTimeout(reloadForRemoteChange, 40);
    } catch {
      dispatch('medindex:library-ready', { offline:false, local:true, pending:true });
      resolveReady?.({ offline:false, local:true, pending:true });
    }
  }

  function poll() {
    const current = readState();
    if (!lastState) {
      lastState = current;
      return;
    }
    if (stableState(lastState) === stableState(current)) return;
    recordLocalChanges(lastState, current);
    lastState = current;
    scheduleSync();
  }

  window.fetch = async (...args) => {
    const request = args[0];
    const options = args[1] || {};
    const target = typeof request === 'string' ? request : request?.url || '';
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    if (method === 'DELETE' && /\/api\/auth(?:\?|$)/.test(String(target))) {
      poll();
      await Promise.race([flush(), new Promise(resolve => setTimeout(resolve, 1500))]);
      const response = await nativeFetch(...args);
      try {
        localStorage.removeItem(PRESCRIPTIONS_KEY);
        localStorage.removeItem(FAVORITES_KEY);
        localStorage.removeItem(META_KEY);
      } catch {}
      return response;
    }
    return nativeFetch(...args);
  };

  window.MedIndexUserLibrary = {
    flush,
    syncNow:() => { poll(); return flush(); },
    state:readState,
    meta:readMeta,
  };

  window.addEventListener('online', () => {
    online = true;
    scheduleSync(100);
  });
  window.addEventListener('offline', () => {
    online = false;
    dispatch('medindex:library-pending', { offline:true });
  });
  window.addEventListener('pagehide', () => {
    poll();
    if (dirty) void flush({ keepalive:true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      poll();
      if (dirty) void flush({ keepalive:true });
    }
  });

  pollTimer = window.setInterval(poll, POLL_MS);
  void initialize();
})();
