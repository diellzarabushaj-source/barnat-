(() => {
  'use strict';

  const LONG_SESSION_VERSION = 'registry-personal-long-session-v1';
  const LIBRARY_INSTANCE_KEY = '__medindexUserLibraryClientLongSession';
  if (window[LIBRARY_INSTANCE_KEY]) return;
  window[LIBRARY_INSTANCE_KEY] = { version:LONG_SESSION_VERSION, startedAt:Date.now() };

  const API_URL = '/api/user-library';
  const PRESCRIPTIONS_KEY = 'regjistriBarnave_protokollet_v1';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const DRUGS_KEY = 'regjistriBarnave_barnat_personale_v1';
  const META_KEY = 'medindex_user_library_meta_v1';
  const RELOAD_KEY = 'medindex_user_library_reload_v1';
  const NOTE_ENTITY_TYPE = 'protocol';
  const NOTE_ENTITY_PREFIX = 'drug-note:';
  const NOTE_KEY_MAX = 290;
  const EVENT_SYNC_VERSION = 'user-library-event-sync-v1';
  const RECOVERY_VERSION = 'user-library-recovery-v1';
  const API_TIMEOUT_MS = 15_000;
  const NETWORK_RETRY_MS = 15_000;
  const MAX_SYNC_ROUNDS = 3;
  const LEGACY_PRESCRIPTION_POLL_MS = 5000;
  const EVENT_SYNC_DELAY_MS = 40;
  const SYNC_DELAY_MS = 700;
  const NOTE_MAX = 2000;
  const DRUG_NAME_MAX = 300;
  // Mirrors the closed field set the server accepts; anything else is dropped on
  // both sides so a personal entry can never smuggle extra structure through.
  const DRUG_FIELDS = Object.freeze({
    activeSubstance:400,
    strength:200,
    form:200,
    manufacturer:200,
    atcCode:20,
    classification:200,
    indications:2000,
    adultDose:2000,
    pediatricDose:2000,
    contraindications:2000,
    notes:4000,
  });
  const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);

  let lastState = null;
  let syncTimer = 0;
  let legacyPrescriptionPollTimer = 0;
  let syncPromise = null;
  let resyncAfterFlight = false;
  let dirty = false;
  let online = navigator.onLine;
  let retryUntil = 0;
  let retryTimer = 0;
  let localRevision = 0;
  let syncedRevision = 0;
  let resolveReady;

  window.MEDINDEX_LIBRARY_READY = new Promise(resolve => { resolveReady = resolve; });

  const text = value => String(value ?? '').trim();
  const nowIso = () => new Date().toISOString();
  const time = value => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };
  const noteLocalKey = value => text(value).slice(0, NOTE_KEY_MAX);
  const noteEntityKey = value => `${NOTE_ENTITY_PREFIX}${noteLocalKey(value)}`;
  const isNoteEntity = (type, key, payload) => type === NOTE_ENTITY_TYPE
    && String(key || '').startsWith(NOTE_ENTITY_PREFIX)
    && payload?.kind === 'drug-note';

  function parseArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function parseNotes() {
    try {
      const value = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      const output = {};
      Object.entries(value).forEach(([key, entry]) => {
        const entityKey = noteLocalKey(key);
        if (!entityKey) return;
        const raw = typeof entry === 'string' ? { text:entry, updatedAt:'' } : entry;
        if (!raw || typeof raw !== 'object') return;
        const noteText = String(raw.text ?? '').slice(0, NOTE_MAX);
        if (!noteText.trim()) return;
        output[entityKey] = { text:noteText, updatedAt:text(raw.updatedAt) };
      });
      return output;
    } catch {
      return {};
    }
  }

  function normalizeDrugFields(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const fields = {};
    Object.entries(DRUG_FIELDS).forEach(([name, max]) => {
      const entry = String(source[name] ?? '').trim().slice(0, max);
      if (entry) fields[name] = entry;
    });
    return fields;
  }

  function parsePersonalDrugs() {
    return parseArray(DRUGS_KEY).flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const clientId = text(entry.clientId);
      const name = text(entry.name).slice(0, DRUG_NAME_MAX);
      if (!clientId || !name) return [];
      return [{ clientId, name, fields:normalizeDrugFields(entry.fields), updatedAt:text(entry.updatedAt) }];
    });
  }

  function drugId(item) {
    return text(item?.clientId);
  }

  function readMeta() {
    try {
      const value = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return value && typeof value === 'object' ? {
        prescriptions:value.prescriptions && typeof value.prescriptions === 'object' ? value.prescriptions : {},
        favorites:value.favorites && typeof value.favorites === 'object' ? value.favorites : {},
        drugs:value.drugs && typeof value.drugs === 'object' ? value.drugs : {},
        deletedDrugs:value.deletedDrugs && typeof value.deletedDrugs === 'object' ? value.deletedDrugs : {},
        deletedPrescriptions:value.deletedPrescriptions && typeof value.deletedPrescriptions === 'object' ? value.deletedPrescriptions : {},
        deletedFavorites:value.deletedFavorites && typeof value.deletedFavorites === 'object' ? value.deletedFavorites : {},
        lastSyncedAt:text(value.lastSyncedAt),
        owner:text(value.owner),
      } : emptyMeta();
    } catch {
      return emptyMeta();
    }
  }

  function emptyMeta() {
    return { prescriptions:{}, favorites:{}, drugs:{}, deletedPrescriptions:{}, deletedFavorites:{}, deletedDrugs:{}, lastSyncedAt:'', owner:'' };
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
    Object.keys(meta.deletedDrugs || {}).forEach(key => {
      if (time(meta.deletedDrugs[key]) < cutoff) delete meta.deletedDrugs[key];
    });
    return meta;
  }

  function readState() {
    return {
      prescriptions:parseArray(PRESCRIPTIONS_KEY),
      favorites:parseArray(FAVORITES_KEY).map(String).filter(Boolean),
      notes:parseNotes(),
      drugs:parsePersonalDrugs(),
    };
  }

  function stableState(state) {
    return JSON.stringify({
      prescriptions:[...(state.prescriptions || [])].sort((a, b) => text(a?.id).localeCompare(text(b?.id))),
      favorites:[...(state.favorites || [])].map(String).sort(),
      notes:Object.entries(state.notes || {}).sort(([a], [b]) => a.localeCompare(b)),
      drugs:[...(state.drugs || [])].sort((a, b) => drugId(a).localeCompare(drugId(b))),
    });
  }

  function protocolId(item) {
    return text(item?.id);
  }

  function favoriteId(type, key) {
    return `${type || 'drug'}|${key}`;
  }

  function noteMetaId(key) {
    return favoriteId(NOTE_ENTITY_TYPE, noteEntityKey(key));
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
    Object.entries(state.notes || {}).forEach(([key, entry]) => {
      const id = noteMetaId(key);
      meta.favorites[id] = meta.favorites[id] || entry.updatedAt || stamp;
      delete meta.deletedFavorites[id];
    });
    (state.drugs || []).forEach(item => {
      const id = drugId(item);
      if (!id) return;
      meta.drugs[id] = meta.drugs[id] || item.updatedAt || stamp;
      delete meta.deletedDrugs[id];
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

    const previousNotes = previous?.notes || {};
    const currentNotes = current.notes || {};
    Object.keys(previousNotes).forEach(key => {
      if (currentNotes[key]) return;
      const id = noteMetaId(key);
      meta.deletedFavorites[id] = stamp;
      delete meta.favorites[id];
    });
    Object.entries(currentNotes).forEach(([key, entry]) => {
      const before = previousNotes[key];
      if (!before || before.text !== entry.text || before.updatedAt !== entry.updatedAt) {
        const id = noteMetaId(key);
        meta.favorites[id] = entry.updatedAt || stamp;
        delete meta.deletedFavorites[id];
      }
    });

    const previousDrugs = new Map((previous?.drugs || []).map(item => [drugId(item), item]).filter(([id]) => id));
    const currentDrugs = new Map((current.drugs || []).map(item => [drugId(item), item]).filter(([id]) => id));
    previousDrugs.forEach((item, id) => {
      if (currentDrugs.has(id)) return;
      meta.deletedDrugs[id] = stamp;
      delete meta.drugs[id];
    });
    currentDrugs.forEach((item, id) => {
      const before = previousDrugs.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        meta.drugs[id] = item.updatedAt || stamp;
        delete meta.deletedDrugs[id];
      }
    });
    writeMeta(meta);
  }

  function buildBody() {
    const state = readState();
    const meta = ensureMetaForState(state, readMeta());
    writeMeta(meta);
    const favoriteRows = state.favorites.map(entityKey => ({
      entityType:'drug',
      entityKey,
      payload:{},
      clientUpdatedAt:meta.favorites[favoriteId('drug', entityKey)] || nowIso(),
    }));
    const noteRows = Object.entries(state.notes || {}).map(([localKey, entry]) => {
      const entityKey = noteEntityKey(localKey);
      return {
        entityType:NOTE_ENTITY_TYPE,
        entityKey,
        payload:{ kind:'drug-note', text:String(entry.text || '').slice(0, NOTE_MAX) },
        clientUpdatedAt:meta.favorites[favoriteId(NOTE_ENTITY_TYPE, entityKey)] || entry.updatedAt || nowIso(),
      };
    });
    return {
      version:1,
      prescriptions:state.prescriptions.flatMap(payload => {
        const clientId = protocolId(payload);
        return clientId ? [{ clientId, payload, clientUpdatedAt:meta.prescriptions[clientId] || payload.updatedAt || nowIso() }] : [];
      }),
      favorites:[...favoriteRows, ...noteRows],
      drugs:state.drugs.map(item => ({
        clientId:item.clientId,
        name:item.name,
        fields:item.fields,
        clientUpdatedAt:meta.drugs[item.clientId] || item.updatedAt || nowIso(),
      })),
      tombstones:{
        drugs:Object.entries(meta.deletedDrugs).map(([clientId, deletedAt]) => ({ clientId, deletedAt })),
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
      const localDeleted = time(meta.deletedPrescriptions[id]);
      if (localDeleted && localDeleted >= remoteUpdated) return;
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
    const notes = { ...(local.notes || {}) };
    (snapshot.favorites || []).forEach(row => {
      const type = text(row.entityType) || 'drug';
      const key = text(row.entityKey);
      if (!key) return;
      const id = favoriteId(type, key);
      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);
      const localDeleted = time(meta.deletedFavorites[id]);
      if (localDeleted && localDeleted >= remoteUpdated) return;
      if (type === 'drug') {
        if (!favorites.has(key) || remoteUpdated > time(meta.favorites[id])) {
          favorites.add(key);
          meta.favorites[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();
        }
        delete meta.deletedFavorites[id];
        return;
      }
      if (isNoteEntity(type, key, row.payload)) {
        const localKey = noteLocalKey(key.slice(NOTE_ENTITY_PREFIX.length));
        if (!localKey) return;
        const remoteText = String(row.payload?.text ?? '').slice(0, NOTE_MAX);
        const localUpdated = time(meta.favorites[id] || notes[localKey]?.updatedAt);
        if (remoteText.trim() && (!notes[localKey] || remoteUpdated > localUpdated)) {
          notes[localKey] = { text:remoteText, updatedAt:row.clientUpdatedAt || row.serverUpdatedAt || nowIso() };
          meta.favorites[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();
        }
        delete meta.deletedFavorites[id];
      }
    });

    (snapshot.tombstones?.favorites || []).forEach(row => {
      const type = text(row.entityType) || 'drug';
      const key = text(row.entityKey);
      const id = favoriteId(type, key);
      if (!key || time(row.deletedAt) < time(meta.favorites[id])) return;
      if (type === 'drug') {
        favorites.delete(key);
      } else if (type === NOTE_ENTITY_TYPE && key.startsWith(NOTE_ENTITY_PREFIX)) {
        const localKey = noteLocalKey(key.slice(NOTE_ENTITY_PREFIX.length));
        if (localKey) delete notes[localKey];
      } else {
        return;
      }
      delete meta.favorites[id];
      meta.deletedFavorites[id] = row.deletedAt;
    });

    const drugs = new Map(local.drugs.map(item => [drugId(item), item]).filter(([id]) => id));
    (snapshot.drugs || []).forEach(row => {
      const id = text(row.clientId);
      const name = text(row.name).slice(0, DRUG_NAME_MAX);
      if (!id || !name) return;
      const localItem = drugs.get(id);
      const localUpdated = time(meta.drugs[id] || localItem?.updatedAt);
      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);
      const localDeleted = time(meta.deletedDrugs[id]);
      if (localDeleted && localDeleted >= remoteUpdated) return;
      if (!localItem || remoteUpdated > localUpdated) {
        const stamp = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();
        drugs.set(id, { clientId:id, name, fields:normalizeDrugFields(row.fields), updatedAt:stamp });
        meta.drugs[id] = stamp;
      }
      delete meta.deletedDrugs[id];
    });

    (snapshot.tombstones?.drugs || []).forEach(row => {
      const id = text(row.clientId);
      if (!id) return;
      const localItem = drugs.get(id);
      if (time(row.deletedAt) < time(meta.drugs[id] || localItem?.updatedAt)) return;
      drugs.delete(id);
      delete meta.drugs[id];
      meta.deletedDrugs[id] = row.deletedAt;
    });

    const merged = { prescriptions:[...prescriptions.values()], favorites:[...favorites], notes, drugs:[...drugs.values()] };
    const changed = stableState(local) !== stableState(merged);
    try {
      localStorage.setItem(PRESCRIPTIONS_KEY, JSON.stringify(merged.prescriptions));
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(merged.favorites));
      localStorage.setItem(NOTES_KEY, JSON.stringify(merged.notes));
      localStorage.setItem(DRUGS_KEY, JSON.stringify(merged.drugs));
    } catch {}
    writeMeta(meta);
    lastState = merged;
    return changed;
  }

  async function api(url, options = {}) {
    const canAbort = typeof AbortController === 'function' && !options.signal && !options.keepalive;
    const controller = canAbort ? new AbortController() : null;
    const requestOptions = { ...options };
    if (controller) requestOptions.signal = controller.signal;
    const timeout = controller ? window.setTimeout(() => controller.abort(), API_TIMEOUT_MS) : 0;
    try {
      const response = await nativeFetch(url, {
        cache:'no-store',
        credentials:'same-origin',
        headers:{ Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) },
        ...requestOptions,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const retryHeader = Number(response.headers.get('retry-after') || payload.retryAfter || 0);
        throw Object.assign(new Error(payload.error || `Library API ${response.status}`), {
          status:response.status,
          retryAfterMs:Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : 0,
        });
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('Library API timeout'), { status:408, code:'LIBRARY_SYNC_TIMEOUT', retryAfterMs:NETWORK_RETRY_MS });
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  function dispatch(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function scheduleRecoveryRetry(at) {
    clearTimeout(retryTimer);
    retryTimer = 0;
    const target = Number(at || 0);
    if (!target) return;
    const delay = Math.max(0, Math.min(2_147_483_000, target - Date.now() + 25));
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      retryUntil = 0;
      if (online && navigator.onLine) scheduleSync(EVENT_SYNC_DELAY_MS);
    }, delay);
  }

  function scheduleSync(delay = SYNC_DELAY_MS) {
    dirty = true;
    if (syncPromise) {
      resyncAfterFlight = true;
      return;
    }
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => { void flush(); }, delay);
  }

  async function flush({ keepalive = false } = {}) {
    if (!online || !navigator.onLine || Date.now() < retryUntil) return false;
    if (syncPromise) return syncPromise;
    clearTimeout(syncTimer);
    const revisionAtStart = localRevision;
    const payloadBody = JSON.stringify(buildBody());
    syncPromise = (async () => {
      let success = false;
      try {
        const payload = await api(API_URL, {
          method:'PUT',
          body:payloadBody,
          keepalive,
        });
        const reconciled = mergeRemote(payload);
        const meta = readMeta();
        meta.lastSyncedAt = payload.generatedAt || nowIso();
        writeMeta(meta);
        success = true;
        syncedRevision = Math.max(syncedRevision, revisionAtStart);
        if (!resyncAfterFlight && syncedRevision >= localRevision) dirty = false;
        dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt, reconciled, syncedRevision, localRevision });
        if (reconciled) dispatch('medindex:library-reconciled', { generatedAt:meta.lastSyncedAt });
        return true;
      } catch (error) {
        if (error.status === 401 || error.status === 403) return false;
        if ([408, 429, 503].includes(Number(error.status))) {
          retryUntil = Date.now() + Math.max(NETWORK_RETRY_MS, Number(error.retryAfterMs || 0));
          scheduleRecoveryRetry(retryUntil);
        }
        dirty = true;
        dispatch('medindex:library-pending', { offline:!navigator.onLine, retryAt:retryUntil || 0, localRevision, syncedRevision });
        return false;
      } finally {
        syncPromise = null;
        if (success && resyncAfterFlight && online && navigator.onLine) {
          resyncAfterFlight = false;
          scheduleSync(EVENT_SYNC_DELAY_MS);
        }
      }
    })();
    return syncPromise;
  }

  async function flushThroughRevision(targetRevision) {
    const target = Math.max(0, Number(targetRevision || 0));
    let rounds = 0;
    do {
      rounds += 1;
      const synced = await flush();
      if (!synced) return false;
      if (syncedRevision >= target) return true;
    } while (rounds < MAX_SYNC_ROUNDS);
    scheduleSync(EVENT_SYNC_DELAY_MS);
    return false;
  }
  function reloadForRemoteChange() {
    const signature = stableState(readState());
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === signature) return;
      sessionStorage.setItem(RELOAD_KEY, signature);
    } catch {}
    location.reload();
  }

  // --- account ownership -----------------------------------------------------
  //
  // The local library lives in this browser under fixed keys, so a second
  // account signing in on the same device inherits whatever the first one left
  // behind — and `flush()` then writes it into the second account. The snapshot
  // names the account it belongs to; that name is stamped locally, and a
  // mismatch wipes the device copy before anything is merged or pushed.

  function ownerKey(user) {
    const id = text(user?.id);
    if (id) return id;
    const email = text(user?.email).toLowerCase();
    return email;
  }

  function wipeLocalLibrary() {
    for (const key of [PRESCRIPTIONS_KEY, FAVORITES_KEY, NOTES_KEY, DRUGS_KEY, META_KEY]) {
      try { localStorage.removeItem(key); } catch {}
    }
    lastState = null;
    localRevision = 0;
    syncedRevision = 0;
    dirty = false;
  }

  // Returns true when the device copy belonged to a different account and was
  // discarded, so the caller re-reads a clean state before merging.
  function adoptOwner(user) {
    const owner = ownerKey(user);
    if (!owner) return false;
    const meta = readMeta();
    const stored = text(meta.owner);
    if (stored && stored !== owner) {
      wipeLocalLibrary();
      const fresh = emptyMeta();
      fresh.owner = owner;
      writeMeta(fresh);
      dispatch('medindex:library-owner-changed', { owner });
      return true;
    }
    if (stored !== owner) {
      meta.owner = owner;
      writeMeta(meta);
    }
    return false;
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
      // Before a single item is merged or pushed: does this device copy belong
      // to the account that just answered?
      if (adoptOwner(snapshot.user)) lastState = readState();
      const changed = mergeRemote(snapshot);
      await flush();
      dispatch('medindex:library-ready', { offline:false, local:false, user:snapshot.user });
      resolveReady?.({ offline:false, local:false, user:snapshot.user });
      if (changed) window.setTimeout(reloadForRemoteChange, 40);
    } catch (error) {
      if ([408, 429, 503].includes(Number(error?.status))) {
        retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));
        scheduleRecoveryRetry(retryUntil);
      }
      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });
      resolveReady?.({ offline:false, local:true, pending:true });
    }
  }

  function captureLocalChanges({ schedule = true, delay = SYNC_DELAY_MS } = {}) {
    const current = readState();
    if (!lastState) {
      lastState = current;
      return false;
    }
    if (stableState(lastState) === stableState(current)) return false;
    recordLocalChanges(lastState, current);
    lastState = current;
    localRevision += 1;
    if (syncPromise) resyncAfterFlight = true;
    if (schedule) scheduleSync(delay);
    return true;
  }
  function stablePrescriptions(state) {
    return JSON.stringify([...(state?.prescriptions || [])]
      .sort((a, b) => protocolId(a).localeCompare(protocolId(b))));
  }

  function pollLegacyPrescriptions() {
    if (document.visibilityState === 'hidden') return;
    const prescriptions = parseArray(PRESCRIPTIONS_KEY);
    if (!lastState) {
      lastState = { ...readState(), prescriptions };
      return;
    }
    if (stablePrescriptions(lastState) === stablePrescriptions({ prescriptions })) return;
    captureLocalChanges();
  }
  // Public mutation helpers. The UI goes through these instead of writing
  // localStorage itself, so the stored shape and the sync trigger stay in one place.
  function writePersonalDrugs(list) {
    try { localStorage.setItem(DRUGS_KEY, JSON.stringify(list)); } catch {}
    window.dispatchEvent(new CustomEvent('medindex:personal-drugs-changed'));
  }

  function savePersonalDrug(input) {
    const name = text(input?.name).slice(0, DRUG_NAME_MAX);
    if (!name) throw new Error('Bari personal duhet të ketë së paku emrin.');
    const clientId = text(input?.clientId)
      || `pd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = { clientId, name, fields:normalizeDrugFields(input?.fields), updatedAt:nowIso() };
    const list = parsePersonalDrugs().filter(item => item.clientId !== clientId);
    list.push(entry);
    writePersonalDrugs(list);
    return entry;
  }

  function deletePersonalDrug(clientId) {
    const id = text(clientId);
    if (!id) return false;
    const list = parsePersonalDrugs();
    const next = list.filter(item => item.clientId !== id);
    if (next.length === list.length) return false;
    writePersonalDrugs(next);
    return true;
  }

  function onPersonalLibraryMutation() {
    const changed = captureLocalChanges({ schedule:false });
    if (changed) scheduleSync(EVENT_SYNC_DELAY_MS);
  }

  function startLegacyPrescriptionPoll() {
    if (legacyPrescriptionPollTimer || document.visibilityState === 'hidden') return;
    legacyPrescriptionPollTimer = window.setInterval(pollLegacyPrescriptions, LEGACY_PRESCRIPTION_POLL_MS);
  }

  function stopLegacyPrescriptionPoll() {
    if (!legacyPrescriptionPollTimer) return;
    clearInterval(legacyPrescriptionPollTimer);
    legacyPrescriptionPollTimer = 0;
  }
  window.fetch = async (...args) => {
    const request = args[0];
    const options = args[1] || {};
    const target = typeof request === 'string' ? request : request?.url || '';
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    if (method === 'DELETE' && /\/api\/auth(?:\?|$)/.test(String(target))) {
      captureLocalChanges({ schedule:false });
      await Promise.race([flush(), new Promise(resolve => setTimeout(resolve, 1500))]);
      const response = await nativeFetch(...args);
      try {
        localStorage.removeItem(PRESCRIPTIONS_KEY);
        localStorage.removeItem(FAVORITES_KEY);
        localStorage.removeItem(NOTES_KEY);
        localStorage.removeItem(DRUGS_KEY);
        localStorage.removeItem(META_KEY);
      } catch {}
      return response;
    }
    return nativeFetch(...args);
  };

  window.MedIndexUserLibrary = {
    flush,
    syncNow:() => {
      captureLocalChanges({ schedule:false });
      const targetRevision = localRevision;
      return flushThroughRevision(targetRevision);
    },
    state:readState,
    meta:readMeta,
    ownerKey,
    adoptOwner,
    personalDrugs:parsePersonalDrugs,
    savePersonalDrug,
    deletePersonalDrug,
    personalDrugFields:DRUG_FIELDS,
    version:EVENT_SYNC_VERSION,
    recoveryVersion:RECOVERY_VERSION,
    longSessionVersion:LONG_SESSION_VERSION,
    diagnostics:() => ({
      localRevision,
      syncedRevision,
      dirty,
      syncInFlight:Boolean(syncPromise),
      retryUntil,
      legacyPrescriptionPollActive:Boolean(legacyPrescriptionPollTimer),
    }),
  };

  window.addEventListener('online', () => {
    online = true;
    retryUntil = 0;
    clearTimeout(retryTimer);
    retryTimer = 0;
    scheduleSync(100);
  });
  window.addEventListener('offline', () => {
    online = false;
    dispatch('medindex:library-pending', { offline:true });
  });
  window.addEventListener('pagehide', () => {
    captureLocalChanges({ schedule:false });
    if (dirty) void flush({ keepalive:true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopLegacyPrescriptionPoll();
      captureLocalChanges({ schedule:false });
      if (dirty) void flush({ keepalive:true });
    } else {
      startLegacyPrescriptionPoll();
      if (dirty && Date.now() >= retryUntil) scheduleSync(EVENT_SYNC_DELAY_MS);
    }
  });
  ['medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved', 'medindex:personal-drugs-changed']
    .forEach(name => window.addEventListener(name, onPersonalLibraryMutation));

  window.addEventListener('storage', event => {
    if (![PRESCRIPTIONS_KEY, FAVORITES_KEY, NOTES_KEY, DRUGS_KEY].includes(event.key)) return;
    onPersonalLibraryMutation();
  });

  startLegacyPrescriptionPoll();
  void initialize();
})();