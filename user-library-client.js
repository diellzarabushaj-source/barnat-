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
  const NOTE_SYNC_VERSION = 'user-library-note-cas-v1';
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
  let prescriptionChapters = [];
  let syncPromise = null;
  let resyncAfterFlight = false;
  let dirty = false;
  let online = navigator.onLine;
  let retryUntil = 0;
  let retryTimer = 0;
  let localRevision = 0;
  let syncedRevision = 0;
  let resolveReady;
  let noteSnapshotLoaded = false;
  let ownerEpoch = 0;
  let metadataStoragePending = false;
  let metadataRecovery = null;

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
        const noteText = String(raw.text ?? '');
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
    if (metadataRecovery) return JSON.parse(JSON.stringify(metadataRecovery));
    try {
      const value = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return value && typeof value === 'object' ? {
        prescriptions:value.prescriptions && typeof value.prescriptions === 'object' ? value.prescriptions : {},
        favorites:value.favorites && typeof value.favorites === 'object' ? value.favorites : {},
        drugs:value.drugs && typeof value.drugs === 'object' ? value.drugs : {},
        deletedDrugs:value.deletedDrugs && typeof value.deletedDrugs === 'object' ? value.deletedDrugs : {},
        deletedPrescriptions:value.deletedPrescriptions && typeof value.deletedPrescriptions === 'object' ? value.deletedPrescriptions : {},
        deletedFavorites:value.deletedFavorites && typeof value.deletedFavorites === 'object' ? value.deletedFavorites : {},
        noteStates:value.noteStates && typeof value.noteStates === 'object' && !Array.isArray(value.noteStates) ? value.noteStates : {},
        prescriptionStates:value.prescriptionStates && typeof value.prescriptionStates === 'object' && !Array.isArray(value.prescriptionStates) ? value.prescriptionStates : {},
        libraryEnvelope:value.libraryEnvelope && typeof value.libraryEnvelope === 'object' ? value.libraryEnvelope : null,
        lastSyncedAt:text(value.lastSyncedAt),
        owner:text(value.owner),
      } : emptyMeta();
    } catch {
      return emptyMeta();
    }
  }

  function emptyMeta() {
    return { prescriptions:{}, favorites:{}, drugs:{}, deletedPrescriptions:{}, deletedFavorites:{}, deletedDrugs:{}, noteStates:{}, prescriptionStates:{}, libraryEnvelope:null, lastSyncedAt:'', owner:'' };
  }

  function writeMeta(meta) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(pruneMeta(meta)));
      metadataStoragePending=false;
      metadataRecovery=null;
      return true;
    } catch {
      metadataStoragePending=true;
      metadataRecovery=JSON.parse(JSON.stringify(meta));
      return false;
    }
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

  const noteVersion = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0
    && value !== null && value !== undefined && value !== '' ? Number(value) : null;
  const noteContent = entry => entry && String(entry.text ?? '').trim() ? String(entry.text) : null;
  const sameNoteTarget = (left, right) => !left || !right
    || (left.storage === right.storage && left.entityType === right.entityType && left.entityKey === right.entityKey);

  function operationId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    // Operation identifiers only deduplicate a write; they never authorize it.
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  function newNoteOperation(rowVersion, content, stamp = nowIso(), noteTarget = null) {
    return { expectedVersion:rowVersion, operationId:operationId(), content, clientUpdatedAt:stamp,
      ...(noteTarget ? { noteTarget } : {}),
      ...(content === null ? { deletedAt:stamp } : {}) };
  }

  function queueNoteChange(meta, localKey, entry, stamp = nowIso()) {
    const state = meta.noteStates[localKey] || (noteSnapshotLoaded
      ? (meta.noteStates[localKey] = { rowVersion:0, content:null, pending:null, queued:null, conflict:null }) : null);
    if (!state) return; // The initial GET must establish the version first.
    const content = noteContent(entry);
    if (state.conflict) return; // A draft stays local until its author resolves it.
    // An oversized draft cannot have committed through this protocol. Once its
    // author edits it, capture a new operation against the unchanged base.
    if (typeof state.pending?.content==='string' && state.pending.content.length>NOTE_MAX) {
      state.pending=null;state.queued=null;
    }
    if (state.pending) {
      state.queued = state.pending.content === content ? null : { content, clientUpdatedAt:stamp };
    } else if (state.content !== content && noteVersion(state.rowVersion) !== null) {
      state.pending = newNoteOperation(state.rowVersion, content, stamp, state.noteTarget);
    }
  }

  function remoteNotes(snapshot) {
    const rows = new Map();
    (snapshot.noteVersions || []).forEach(row => {
      if (row.entityType !== NOTE_ENTITY_TYPE || !String(row.entityKey || '').startsWith(NOTE_ENTITY_PREFIX)) return;
      const key = noteLocalKey(row.entityKey.slice(NOTE_ENTITY_PREFIX.length));
      if (key) rows.set(key, { rowVersion:noteVersion(row.rowVersion), content:null, deleted:Boolean(row.deleted), noteTarget:row.noteTarget, updatedAt:nowIso() });
    });
    (snapshot.favorites || []).forEach(row => {
      if (!isNoteEntity(row.entityType, row.entityKey, row.payload)) return;
      const key = noteLocalKey(row.entityKey.slice(NOTE_ENTITY_PREFIX.length));
      if (key) rows.set(key, { rowVersion:noteVersion(row.rowVersion), content:noteContent(row.payload), deleted:false, noteTarget:row.noteTarget,
        updatedAt:row.clientUpdatedAt || row.serverUpdatedAt || nowIso() });
    });
    (snapshot.tombstones?.favorites || []).forEach(row => {
      if (row.entityType !== NOTE_ENTITY_TYPE || !String(row.entityKey || '').startsWith(NOTE_ENTITY_PREFIX)) return;
      const key = noteLocalKey(row.entityKey.slice(NOTE_ENTITY_PREFIX.length));
      if (key) rows.set(key, { rowVersion:noteVersion(row.rowVersion), content:null, deleted:true, noteTarget:row.noteTarget, updatedAt:row.deletedAt || nowIso() });
    });
    return rows;
  }

  function submittedNoteOperations(body) {
    return [...(body.favorites || []), ...(body.tombstones?.favorites || [])]
      .filter(row => row.entityType === NOTE_ENTITY_TYPE && String(row.entityKey || '').startsWith(NOTE_ENTITY_PREFIX) && row.operationId);
  }

  function oversizedNoteOperations(body) {
    return submittedNoteOperations(body).filter(row => typeof row.payload?.text==='string' && row.payload.text.length>NOTE_MAX);
  }

  function announceOversizedNotes(rows) {
    dirty=true;
    dispatch('medindex:library-pending',{code:'NOTE_TOO_LONG',noteTooLong:true,noteKeys:rows.map(row => row.entityKey),
      message:`Shënimi lejon maksimum ${NOTE_MAX} karaktere. Drafti i plotë mbetet në këtë pajisje; shkurtoje para ruajtjes.`});
  }

  function acknowledgeNoteOperations(meta, snapshot, submitted = []) {
    const receipts = new Map((snapshot.noteOperations || []).map(row => [row.operationId, row]));
    submitted.forEach(row => {
      const key = noteLocalKey(row.entityKey.slice(NOTE_ENTITY_PREFIX.length));
      const state = meta.noteStates[key];
      const receipt = receipts.get(row.operationId);
      const version = noteVersion(receipt?.rowVersion);
      if (!state?.pending || state.pending.operationId !== row.operationId || version === null
        || version <= state.pending.expectedVersion || receipt.entityType !== row.entityType || receipt.entityKey !== row.entityKey
        || receipt.deleted !== (state.pending.content === null)) return;
      const completed = state.pending;
      state.rowVersion = version;
      state.noteTarget = receipt.noteTarget || completed.noteTarget || state.noteTarget;
      state.content = completed.content;
      state.pending = null;
      state.conflict = null;
      if (state.queued && state.queued.content !== completed.content) {
        state.pending = newNoteOperation(version, state.queued.content, state.queued.clientUpdatedAt, state.noteTarget);
      }
      state.queued = null;
    });
  }

  function reconcileNotes(local, meta, snapshot, submitted = []) {
    acknowledgeNoteOperations(meta, snapshot, submitted);
    const remote = remoteNotes(snapshot);
    const notes = { ...(local.notes || {}) };
    const keys = new Set([...Object.keys(notes), ...Object.keys(meta.noteStates), ...remote.keys()]);
    keys.forEach(key => {
      const row = remote.get(key);
      let state = meta.noteStates[key];
      const localText = noteContent(notes[key]);
      if (!state) {
        const baseline = row || { rowVersion:0, content:null, updatedAt:nowIso() };
        state = meta.noteStates[key] = { rowVersion:baseline.rowVersion, content:baseline.content, noteTarget:baseline.noteTarget, pending:null, queued:null, conflict:null };
        if (meta.deletedFavorites[noteMetaId(key)] && row && !row.deleted) state.conflict = baseline;
        else if (localText !== null && localText !== baseline.content) {
          if ((!row || (row.content === null && !row.deleted)) && baseline.rowVersion !== null) {
            state.pending = newNoteOperation(baseline.rowVersion, localText, notes[key]?.updatedAt || nowIso(), state.noteTarget);
          }
          else state.conflict = baseline;
        }
      } else if (!state.pending && !state.conflict) {
        // A closed/offline tab may have changed the stored draft without a
        // running event listener. Compare exact text against its saved base.
        queueNoteChange(meta, key, notes[key], notes[key]?.updatedAt || nowIso());
      }
      // Version counters belong to their storage identity. A native alias can
      // replace a legacy fallback with a numerically lower or higher counter;
      // neither permits silently adopting the other note or ignoring it forever.
      if (row && !sameNoteTarget(state.noteTarget, row.noteTarget)) {
        if (!state.conflict || !sameNoteTarget(state.conflict.noteTarget, row.noteTarget)
          || row.rowVersion === null || state.conflict.rowVersion === null || row.rowVersion >= state.conflict.rowVersion) state.conflict = row;
        return;
      }
      if (row && state.conflict) {
        if (row.rowVersion === null || state.conflict.rowVersion === null || row.rowVersion >= state.conflict.rowVersion) state.conflict = row;
      }
      if (state.pending || state.conflict) return;
      if (!row) return;
      if (state.rowVersion !== null && row.rowVersion !== null && row.rowVersion < state.rowVersion) return;
      state.rowVersion = row.rowVersion;
      if (row.noteTarget) state.noteTarget = row.noteTarget;
      state.content = row.content;
      const id = noteMetaId(key);
      if (row.content === null) {
        delete notes[key];
        delete meta.favorites[id];
        meta.deletedFavorites[id] = row.updatedAt;
      } else {
        notes[key] = { text:row.content, updatedAt:row.updatedAt };
        meta.favorites[id] = row.updatedAt;
        delete meta.deletedFavorites[id];
      }
    });
    return notes;
  }

  function noteConflicts() {
    const meta = readMeta();
    const notes = parseNotes();
    return Object.entries(meta.noteStates).flatMap(([localKey, state]) => state?.conflict ? [{
      localKey, entityType:NOTE_ENTITY_TYPE, entityKey:noteEntityKey(localKey),
      localText:noteContent(notes[localKey]), remoteText:state.conflict.content,
      remoteDeleted:state.conflict.content === null, rowVersion:state.conflict.rowVersion,
    }] : []);
  }

  function announceNoteConflicts() {
    const conflicts = noteConflicts();
    if (!conflicts.length) return;
    const detail = { conflict:true, noteKeys:conflicts.map(row => row.localKey), localRevision, syncedRevision };
    dispatch('medindex:library-note-conflict', detail);
    dispatch('medindex:library-pending', detail);
  }

  function captureNoteConflicts(payload, submitted) {
    const meta = readMeta();
    const remote = remoteNotes(payload.snapshot || payload);
    const named = new Set((payload.conflicts || []).map(row => `${row.entityType}|${row.entityKey}`));
    submitted.forEach(row => {
      if (named.size && !named.has(`${row.entityType}|${row.entityKey}`)) return;
      const key = noteLocalKey(row.entityKey.slice(NOTE_ENTITY_PREFIX.length));
      const state = meta.noteStates[key];
      if (!state?.pending || state.pending.operationId !== row.operationId) return;
      const conflict = (payload.conflicts || []).find(item => item.entityType === row.entityType && item.entityKey === row.entityKey);
      const contentKnown = conflict?.deleted === true || typeof conflict?.content === 'string';
      state.conflict = remote.get(key) || { rowVersion:contentKnown ? noteVersion(conflict?.rowVersion) : null,
        noteTarget:conflict?.noteTarget,
        content:conflict?.deleted ? null : typeof conflict?.content === 'string' ? conflict.content : null,
        updatedAt:conflict?.deletedAt || conflict?.serverUpdatedAt || nowIso() };
    });
    writeMeta(meta);
    announceNoteConflicts();
  }

  function hasPendingNotes() {
    return Object.values(readMeta().noteStates).some(state => state?.pending || state?.conflict);
  }

  function resolveNoteConflict(localKey, keepLocal) {
    const key = noteLocalKey(localKey);
    const meta = readMeta();
    const state = meta.noteStates[key];
    const remote = state?.conflict;
    if (!remote || noteVersion(remote.rowVersion) === null) return false;
    state.rowVersion = remote.rowVersion;
    state.noteTarget = remote.noteTarget;
    state.content = remote.content;
    state.pending = null;
    state.queued = null;
    state.conflict = null;
    if (keepLocal) queueNoteChange(meta, key, parseNotes()[key]);
    else {
      const notes = parseNotes();
      if (remote.content === null) delete notes[key];
      else notes[key] = { text:remote.content, updatedAt:remote.updatedAt || nowIso() };
      try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch { return false; }
    }
    writeMeta(meta);
    lastState = readState();
    localRevision += 1;
    dispatch('medindex:library-reconciled', { noteConflictResolved:true, localKey:key });
    scheduleSync(EVENT_SYNC_DELAY_MS);
    return true;
  }

  // Preserve prescription objects exactly. Version metadata never enters the
  // clinical payload; a pending operation captures an immutable source copy.
  const copyPrescription = value => value === null ? null : JSON.parse(JSON.stringify(value));
  const samePrescription = (left,right) => JSON.stringify(left) === JSON.stringify(right);

  function newPrescriptionOperation(rowVersion,payload,stamp=nowIso(),restore=false) {
    return {expectedVersion:rowVersion,operationId:operationId(),payload:copyPrescription(payload),clientUpdatedAt:stamp,
      restore:payload !== null && restore,...(payload === null ? {deletedAt:stamp} : {})};
  }

  function queuePrescriptionChange(meta,id,payload,stamp=nowIso()) {
    const state=meta.prescriptionStates[id] || (noteSnapshotLoaded
      ? (meta.prescriptionStates[id]={rowVersion:0,payload:null,deleted:false,available:true,pending:null,queued:null,conflict:null}) : null);
    if (!state || state.conflict) return;
    if (state.pending) state.queued=samePrescription(state.pending.payload,payload) ? null : {payload:copyPrescription(payload),clientUpdatedAt:stamp};
    else if (!samePrescription(state.payload,payload)) {
      if (state.available!==false && noteVersion(state.rowVersion)!==null) state.pending=newPrescriptionOperation(state.rowVersion,payload,stamp,state.deleted);
      else state.conflict={rowVersion:state.rowVersion,payload:state.payload,deleted:state.deleted,available:false};
    }
  }

  function remotePrescriptions(snapshot) {
    const rows=new Map();
    (snapshot.prescriptionVersions || []).forEach(row => {
      const id=text(row.clientId);
      if (id) rows.set(id,{rowVersion:noteVersion(row.rowVersion),payload:null,deleted:Boolean(row.deleted),available:Boolean(row.deleted),updatedAt:nowIso()});
    });
    (snapshot.prescriptions || []).forEach(row => {
      const id=text(row.clientId || row.payload?.id);
      if (id && row.payload && typeof row.payload==='object' && !Array.isArray(row.payload)) rows.set(id,
        {rowVersion:noteVersion(row.rowVersion),payload:copyPrescription(row.payload),deleted:false,
          available:typeof row.payload.id==='string' && row.payload.id===id,updatedAt:row.clientUpdatedAt || row.serverUpdatedAt || nowIso()});
    });
    (snapshot.tombstones?.prescriptions || []).forEach(row => {
      const id=text(row.clientId);
      if (id) rows.set(id,{rowVersion:noteVersion(row.rowVersion),payload:null,deleted:true,available:true,updatedAt:row.deletedAt || nowIso()});
    });
    return rows;
  }

  function submittedPrescriptionOperations(body) {
    return [...(body.prescriptions || []),...(body.tombstones?.prescriptions || [])].filter(row => row.operationId);
  }

  function acknowledgePrescriptionOperations(meta,snapshot,submitted=[]) {
    const receipts=new Map((snapshot.prescriptionOperations || []).map(row => [row.operationId,row]));
    submitted.forEach(row => {
      const state=meta.prescriptionStates[row.clientId],receipt=receipts.get(row.operationId),version=noteVersion(receipt?.rowVersion);
      if (!state?.pending || state.pending.operationId!==row.operationId || receipt?.clientId!==row.clientId
        || version===null || version<=state.pending.expectedVersion || receipt.deleted!==(state.pending.payload===null)) return;
      const completed=state.pending;
      state.rowVersion=version;state.payload=copyPrescription(completed.payload);state.deleted=completed.payload===null;state.available=true;
      state.lastAcknowledgedId=completed.operationId;state.lastAcknowledgedVersion=version;state.pending=null;
      // An editor can discover a stale base while this earlier operation is in
      // flight. Its conflict stays visible; acknowledging it must not rebase it.
      if (!state.conflict && state.queued && !samePrescription(state.queued.payload,completed.payload)) {
        state.pending=newPrescriptionOperation(version,state.queued.payload,state.queued.clientUpdatedAt,state.deleted);
      }
      state.queued=null;
    });
  }

  function reconcilePrescriptions(local,meta,snapshot,submitted=[]) {
    acknowledgePrescriptionOperations(meta,snapshot,submitted);
    const remote=remotePrescriptions(snapshot);
    const prescriptions=new Map((local.prescriptions || []).map(item => [protocolId(item),item]).filter(([id]) => id));
    const keys=new Set([...prescriptions.keys(),...Object.keys(meta.prescriptionStates),...remote.keys()]);
    keys.forEach(id => {
      const row=remote.get(id),localPayload=prescriptions.get(id) || null;
      let state=meta.prescriptionStates[id];
      if (!state) {
        const baseline=row || {rowVersion:0,payload:null,deleted:false,available:true,updatedAt:nowIso()};
        state=meta.prescriptionStates[id]={...baseline,pending:null,queued:null,conflict:null};
        if (row && !row.available) state.conflict=baseline;
        else if (meta.deletedPrescriptions[id] && row && !row.deleted) state.conflict=baseline;
        else if (localPayload!==null && !samePrescription(localPayload,baseline.payload)) {
          if (!row && baseline.rowVersion!==null) state.pending=newPrescriptionOperation(0,localPayload,meta.prescriptions[id] || nowIso());
          else state.conflict=baseline;
        }
      } else if (!state.pending && !state.conflict) queuePrescriptionChange(meta,id,localPayload,meta.prescriptions[id] || meta.deletedPrescriptions[id] || nowIso());
      if (row && state.conflict && (row.rowVersion===null || state.conflict.rowVersion===null || row.rowVersion>=state.conflict.rowVersion)) state.conflict=row;
      if (state.pending || state.conflict || !row) return;
      if (state.rowVersion!==null && row.rowVersion!==null && row.rowVersion<state.rowVersion) return;
      state.rowVersion=row.rowVersion;state.payload=row.payload;state.deleted=row.deleted;state.available=row.available;
      if (!row.available) return; // An unreadable encrypted row is never a blank recipe.
      if (row.payload===null) {
        prescriptions.delete(id);delete meta.prescriptions[id];meta.deletedPrescriptions[id]=row.updatedAt;
      } else {
        prescriptions.set(id,row.payload);meta.prescriptions[id]=row.updatedAt;delete meta.deletedPrescriptions[id];
      }
    });
    return prescriptions;
  }

  function prescriptionConflicts() {
    const local=new Map(parseArray(PRESCRIPTIONS_KEY).map(item => [protocolId(item),item]));
    return Object.entries(readMeta().prescriptionStates).flatMap(([clientId,state]) => state?.conflict ? [{clientId,
      localPayload:copyPrescription(local.get(clientId) || null),remotePayload:copyPrescription(state.conflict.payload || null),
      remoteDeleted:Boolean(state.conflict.deleted),remoteAvailable:state.conflict.available!==false,rowVersion:state.conflict.rowVersion}] : []);
  }

  function announcePrescriptionConflicts() {
    const conflicts=prescriptionConflicts();
    if (!conflicts.length) return;
    const detail={conflict:true,prescriptionIds:conflicts.map(row => row.clientId),localRevision,syncedRevision};
    dispatch('medindex:library-prescription-conflict',detail);dispatch('medindex:library-pending',detail);
  }

  function capturePrescriptionConflicts(payload,submitted) {
    const meta=readMeta(),remote=remotePrescriptions(payload.snapshot || payload);
    const named=new Set((payload.conflicts || []).map(row => row.clientId).filter(Boolean));
    submitted.forEach(row => {
      if (named.size && !named.has(row.clientId)) return;
      const state=meta.prescriptionStates[row.clientId];
      if (!state?.pending || state.pending.operationId!==row.operationId) return;
      const conflict=(payload.conflicts || []).find(item => item.clientId===row.clientId);
      state.conflict=remote.get(row.clientId) || {rowVersion:conflict?.deleted===true ? noteVersion(conflict.rowVersion) : null,
        payload:null,deleted:conflict?.deleted===true,available:conflict?.deleted===true};
    });
    writeMeta(meta);announcePrescriptionConflicts();
  }

  function hasPendingPrescriptions() {
    return Object.values(readMeta().prescriptionStates).some(state => state?.pending || state?.conflict);
  }

  function capturePrescriptionBase(clientId) {
    const meta=readMeta(),id=text(clientId),state=meta.prescriptionStates[id];
    const payload=parseArray(PRESCRIPTIONS_KEY).find(item => protocolId(item)===id) || null;
    return {owner:meta.owner,clientId:id,rowVersion:state ? noteVersion(state.rowVersion) : noteSnapshotLoaded ? 0 : null,
      payload:copyPrescription(payload),...(state?.pending ? {pendingOperationId:state.pending.operationId} : {})};
  }

  function writePrescriptionDraft(payload,base) {
    const id=payload ? protocolId(payload) : text(base?.clientId),meta=readMeta();
    if (!id || (base?.owner && base.owner!==meta.owner) || (base?.clientId && base.clientId!==id)) return {ok:false,ownerChanged:true};
    if (payload!==null) {
      try {
        const serialized=JSON.stringify(payload);
        const bytes=typeof TextEncoder==='function' ? new TextEncoder().encode(serialized).length : encodeURIComponent(serialized).replace(/%[0-9A-F]{2}|./g,'x').length;
        if (bytes>160*1024) return {ok:false,tooLarge:true};
      } catch {return {ok:false,invalidPayload:true};}
    }
    const all=parseArray(PRESCRIPTIONS_KEY),index=all.findIndex(item => protocolId(item)===id),state=meta.prescriptionStates[id];
    const matchesOwnAcknowledgement=base?.pendingOperationId && state?.lastAcknowledgedId===base.pendingOperationId
      && state.lastAcknowledgedVersion===state.rowVersion && samePrescription(base.payload,state.payload);
    const stale=base && state && ((noteVersion(base.rowVersion)===null && state.rowVersion>0)
      || (noteVersion(base.rowVersion)!==null && base.rowVersion!==state.rowVersion && !matchesOwnAcknowledgement));
    if (payload===null) { if (index>=0) all.splice(index,1); }
    else if (index>=0) all[index]=copyPrescription(payload);
    else all.unshift(copyPrescription(payload));
    try {localStorage.setItem(PRESCRIPTIONS_KEY,JSON.stringify(all));} catch {return {ok:false,storageError:true};}
    const stamp=payload?.updatedAt || nowIso();
    if (payload===null) {meta.deletedPrescriptions[id]=stamp;delete meta.prescriptions[id];}
    else {meta.prescriptions[id]=stamp;delete meta.deletedPrescriptions[id];}
    if (stale) state.conflict={rowVersion:state.rowVersion,payload:state.payload,deleted:state.deleted,available:state.available};
    else queuePrescriptionChange(meta,id,payload,stamp);
    if (!writeMeta(meta)) {
      dirty=true;dispatch('medindex:library-pending',{storage:true,localRevision,syncedRevision});
      return {ok:false,storageError:true,draftStored:true};
    }
    lastState=readState();localRevision+=1;
    dispatch('medindex:prescriptions-changed',{count:all.length});
    announcePrescriptionConflicts();scheduleSync(EVENT_SYNC_DELAY_MS);
    return {ok:true,conflict:Boolean(meta.prescriptionStates[id]?.conflict),base:capturePrescriptionBase(id)};
  }

  async function resolvePrescriptionConflict(clientId,keepLocal) {
    // Refresh before presenting a rebase. The owner's current version may have
    // moved again since the conflict arrived; never resolve against an old view.
    const epoch=ownerEpoch,owner=readMeta().owner;
    try {
      if (readMeta().libraryEnvelope) {
        await flush();
        if (epoch!==ownerEpoch || owner!==readMeta().owner || readMeta().libraryEnvelope) return false;
      }
      const snapshot=await api(API_URL);
      if (epoch!==ownerEpoch || owner!==readMeta().owner || ownerKey(snapshot.user)!==owner) return false;
      const meta=readMeta(),id=text(clientId),state=meta.prescriptionStates[id],remote=remotePrescriptions(snapshot).get(id);
      if (!state?.conflict || !remote || remote.available===false || noteVersion(remote.rowVersion)===null) return false;
      // If it changed after comparison, update the comparison and require a new
      // explicit choice. A click cannot silently approve an unseen recipe.
      if (state.conflict.rowVersion!==remote.rowVersion || !samePrescription(state.conflict.payload,remote.payload)) {
        state.conflict=remote;writeMeta(meta);announcePrescriptionConflicts();return false;
      }
      state.rowVersion=remote.rowVersion;state.payload=remote.payload;state.deleted=remote.deleted;state.available=true;
      state.pending=null;state.queued=null;state.conflict=null;
      if (keepLocal) queuePrescriptionChange(meta,id,parseArray(PRESCRIPTIONS_KEY).find(item => protocolId(item)===id) || null);
      else {
        const all=parseArray(PRESCRIPTIONS_KEY).filter(item => protocolId(item)!==id);
        if (remote.payload!==null) all.unshift(copyPrescription(remote.payload));
        localStorage.setItem(PRESCRIPTIONS_KEY,JSON.stringify(all));
      }
      writeMeta(meta);lastState=readState();localRevision+=1;
      dispatch('medindex:library-reconciled',{prescriptionConflictResolved:true,clientId:id,acceptedRemote:!keepLocal});
      scheduleSync(EVENT_SYNC_DELAY_MS);return true;
    } catch {return false;}
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
      queuePrescriptionChange(meta,id,null,stamp);
    });
    currentPrescriptions.forEach((item, id) => {
      if (!id) return;
      const before = previousPrescriptions.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        meta.prescriptions[id] = item.updatedAt || stamp;
        delete meta.deletedPrescriptions[id];
        queuePrescriptionChange(meta,id,item,item.updatedAt || stamp);
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
      queueNoteChange(meta, key, null, stamp);
    });
    Object.entries(currentNotes).forEach(([key, entry]) => {
      const before = previousNotes[key];
      if (!before || before.text !== entry.text || before.updatedAt !== entry.updatedAt) {
        const id = noteMetaId(key);
        meta.favorites[id] = entry.updatedAt || stamp;
        delete meta.deletedFavorites[id];
        queueNoteChange(meta, key, entry, entry.updatedAt || stamp);
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
    return writeMeta(meta);
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
    const noteRows = Object.entries(meta.noteStates).flatMap(([localKey, noteState]) => {
      const operation = noteState?.pending;
      if (!operation || noteState.conflict || operation.content === null) return [];
      const entityKey = noteEntityKey(localKey);
      return [{
        entityType:NOTE_ENTITY_TYPE,
        entityKey,
        payload:{ kind:'drug-note', text:operation.content },
        clientUpdatedAt:operation.clientUpdatedAt,
        expectedVersion:operation.expectedVersion,
        operationId:operation.operationId,
        ...(operation.noteTarget ? { noteTarget:operation.noteTarget } : {}),
      }];
    });
    const noteTombstones = Object.entries(meta.noteStates).flatMap(([localKey, noteState]) => {
      const operation = noteState?.pending;
      return operation && !noteState.conflict && operation.content === null ? [{
        entityType:NOTE_ENTITY_TYPE, entityKey:noteEntityKey(localKey), deletedAt:operation.deletedAt,
        expectedVersion:operation.expectedVersion, operationId:operation.operationId,
        ...(operation.noteTarget ? { noteTarget:operation.noteTarget } : {}),
      }] : [];
    });
    const prescriptionRows=Object.entries(meta.prescriptionStates).flatMap(([clientId,entry]) => {
      const operation=entry?.pending;
      return operation && !entry.conflict && operation.payload!==null ? [{clientId,payload:copyPrescription(operation.payload),
        clientUpdatedAt:operation.clientUpdatedAt,expectedVersion:operation.expectedVersion,operationId:operation.operationId,restore:operation.restore}] : [];
    });
    const prescriptionTombstones=Object.entries(meta.prescriptionStates).flatMap(([clientId,entry]) => {
      const operation=entry?.pending;
      return operation && !entry.conflict && operation.payload===null ? [{clientId,deletedAt:operation.deletedAt,
        expectedVersion:operation.expectedVersion,operationId:operation.operationId}] : [];
    });
    return {
      version:1,
      libraryOwner:meta.owner,
      noteOwner:meta.owner,
      prescriptionOwner:meta.owner,
      prescriptions:prescriptionRows,
      favorites:[...favoriteRows, ...noteRows],
      drugs:state.drugs.map(item => ({
        clientId:item.clientId,
        name:item.name,
        fields:item.fields,
        clientUpdatedAt:meta.drugs[item.clientId] || item.updatedAt || nowIso(),
      })),
      tombstones:{
        drugs:Object.entries(meta.deletedDrugs).map(([clientId, deletedAt]) => ({ clientId, deletedAt })),
        prescriptions:prescriptionTombstones,
        favorites:[...Object.entries(meta.deletedFavorites).map(([id, deletedAt]) => {
          const separator = id.indexOf('|');
          return { entityType:id.slice(0, separator) || 'drug', entityKey:id.slice(separator + 1), deletedAt };
        }).filter(item => item.entityKey && !(item.entityType === NOTE_ENTITY_TYPE && item.entityKey.startsWith(NOTE_ENTITY_PREFIX))), ...noteTombstones],
      },
    };
  }

  function mergeRemote(snapshot, submitted = [],submittedPrescriptions=[]) {
    const local = readState();
    const meta = ensureMetaForState(local, readMeta());
    const prescriptions = reconcilePrescriptions(local,meta,snapshot,submittedPrescriptions);

    const favorites = new Set(local.favorites);
    const notes = reconcileNotes(local, meta, snapshot, submitted);
    noteSnapshotLoaded = true;
    (snapshot.favorites || []).forEach(row => {
      const type = text(row.entityType) || 'drug';
      const key = text(row.entityKey);
      if (!key) return;
      if (isNoteEntity(type, key, row.payload)) return;
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
    });

    (snapshot.tombstones?.favorites || []).forEach(row => {
      const type = text(row.entityType) || 'drug';
      const key = text(row.entityKey);
      const id = favoriteId(type, key);
      if (type === NOTE_ENTITY_TYPE && key.startsWith(NOTE_ENTITY_PREFIX)) return;
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
          payload,
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
    syncPromise = Promise.resolve().then(async () => {
      let success = false;
      let submitted = [];
      let submittedPrescriptions = [];
      let requestOwner = '';
      let revisionAtStart = localRevision;
      const epoch = ownerEpoch;
      try {
        if (!noteSnapshotLoaded) {
          const snapshot = await api(API_URL);
          if (epoch !== ownerEpoch) return false;
          if (adoptOwner(snapshot.user)) {
            mergeRemote(snapshot);
            dispatch('medindex:library-reconciled', { ownerChanged:true });
            return false;
          }
          mergeRemote(snapshot);
        }
        // Retain the exact failed metadata, including operation IDs or received
        // receipts, until storage recovers. A reload still retries the durable
        // earlier envelope; this tab can safely finish persisting its receipt.
        if (metadataStoragePending && !writeMeta(readMeta())) {dirty=true;dispatch('medindex:library-pending',{storage:true});return false;}
        captureLocalChanges({ schedule:false });
        if (metadataStoragePending) {dirty=true;dispatch('medindex:library-pending',{storage:true});return false;}
        revisionAtStart = localRevision;
        requestOwner = text(readMeta().owner);
        let envelope=readMeta().libraryEnvelope;
        if (!envelope || envelope.owner!==requestOwner) {
          const body=buildBody(),oversized=oversizedNoteOperations(body);
          if (oversized.length) {announceOversizedNotes(oversized);return false;}
          envelope={owner:requestOwner,body,revision:revisionAtStart};
          const meta=readMeta();meta.libraryEnvelope=envelope;
          if (!writeMeta(meta)) {dirty=true;dispatch('medindex:library-pending',{storage:true});return false;}
        }
        // Upgrade only the owner metadata of an older durable envelope. Its
        // original captured owner remains authoritative, never a new session.
        if (envelope.body.libraryOwner===undefined) {
          envelope.body.libraryOwner=envelope.owner;
          const meta=readMeta();meta.libraryEnvelope=envelope;
          if (!writeMeta(meta)) {dirty=true;dispatch('medindex:library-pending',{storage:true});return false;}
        }
        const body=envelope.body;
        const oversized=oversizedNoteOperations(body);
        if (oversized.length) {announceOversizedNotes(oversized);return false;}
        revisionAtStart=Number(envelope.revision || 0);
        submitted = submittedNoteOperations(body);
        submittedPrescriptions=submittedPrescriptionOperations(body);
        const payload = await api(API_URL, {
          method:'PUT',
          body:JSON.stringify(body),
          keepalive,
        });
        if (epoch !== ownerEpoch || requestOwner !== text(readMeta().owner)
          || (ownerKey(payload.user) && requestOwner && ownerKey(payload.user) !== requestOwner)) return false;
        captureLocalChanges({ schedule:false });
        if (Array.isArray(payload.prescriptionChapters)) prescriptionChapters = payload.prescriptionChapters;
        const reconciled = mergeRemote(payload, submitted,submittedPrescriptions);
        const meta = readMeta();
        meta.lastSyncedAt = payload.generatedAt || nowIso();
        const allReceipts=[...(payload.noteOperations || []),...(payload.prescriptionOperations || [])];
        const envelopeConfirmed=[...submitted,...submittedPrescriptions].every(row => allReceipts.some(ack =>
          ack.operationId===row.operationId && noteVersion(ack.rowVersion)!==null && ack.rowVersion>row.expectedVersion
          && (row.clientId ? ack.clientId===row.clientId && ack.deleted===!row.payload : ack.entityType===row.entityType && ack.entityKey===row.entityKey && ack.deleted===!row.payload)));
        if (envelopeConfirmed) meta.libraryEnvelope=null;
        if (!writeMeta(meta)) {dirty=true;dispatch('medindex:library-pending',{storage:true});return false;}
        success = envelopeConfirmed;
        if (envelopeConfirmed) syncedRevision = Math.max(syncedRevision, revisionAtStart);
        const mutationsPending = hasPendingNotes() || hasPendingPrescriptions() || !envelopeConfirmed;
        dirty = mutationsPending || resyncAfterFlight || syncedRevision < localRevision;
        if (!mutationsPending) dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt, reconciled, syncedRevision, localRevision });
        else dispatch('medindex:library-pending', { offline:false, conflict:noteConflicts().length > 0 || prescriptionConflicts().length > 0, localRevision, syncedRevision });
        announceNoteConflicts();
        announcePrescriptionConflicts();
        if (reconciled) dispatch('medindex:library-reconciled', { generatedAt:meta.lastSyncedAt });
        return !mutationsPending;
      } catch (error) {
        if (epoch !== ownerEpoch) return false;
        if (error.status === 401 || error.status === 403) return false;
        if (requestOwner && requestOwner!==readMeta().owner) return false;
        if (error.status===409 && error.payload?.code==='LIBRARY_OWNER_CHANGED') {
          dirty=true;
          dispatch('medindex:library-pending',{ownerChanged:true,localRevision,syncedRevision});
          return false;
        }
        if (error.status===409 && ownerKey(error.payload?.snapshot?.user) && ownerKey(error.payload.snapshot.user)!==requestOwner) return false;
        if (error.status === 409) {
          captureLocalChanges({schedule:false});
          const meta=readMeta();meta.libraryEnvelope=null;writeMeta(meta);
          if (String(error.payload?.code || '').startsWith('PRESCRIPTION_') && submittedPrescriptions.length) capturePrescriptionConflicts(error.payload || {},submittedPrescriptions);
          else if (submitted.length) captureNoteConflicts(error.payload || {}, submitted);
        }
        if ([408, 429, 503].includes(Number(error.status))) {
          retryUntil = Date.now() + Math.max(NETWORK_RETRY_MS, Number(error.retryAfterMs || 0));
          scheduleRecoveryRetry(retryUntil);
        }
        dirty = true;
        dispatch('medindex:library-pending', { offline:!navigator.onLine, retryAt:retryUntil || 0, localRevision, syncedRevision });
        return false;
      } finally {
        syncPromise = null;
        if ((success || epoch !== ownerEpoch) && resyncAfterFlight && online && navigator.onLine) {
          resyncAfterFlight = false;
          scheduleSync(EVENT_SYNC_DELAY_MS);
        }
      }
    });
    return syncPromise;
  }

  async function flushThroughRevision(targetRevision) {
    const target = Math.max(0, Number(targetRevision || 0));
    let rounds = 0;
    do {
      rounds += 1;
      const synced = await flush();
      if (!synced) return false;
      if (syncedRevision >= target && !hasPendingNotes() && !hasPendingPrescriptions()) return true;
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
    resyncAfterFlight = false;
    retryUntil = 0;
    clearTimeout(syncTimer);
    clearTimeout(retryTimer);
    syncTimer = 0;
    retryTimer = 0;
    noteSnapshotLoaded = false;
    metadataStoragePending=false;
    metadataRecovery=null;
    ownerEpoch += 1;
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
    const epoch = ownerEpoch;
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
      if (epoch !== ownerEpoch) {
        resolveReady?.({ local:true, pending:true, ownerChanged:true });
        return;
      }
      if (Array.isArray(snapshot.prescriptionChapters)) prescriptionChapters = snapshot.prescriptionChapters;
      // Before a single item is merged or pushed: does this device copy belong
      // to the account that just answered?
      if (adoptOwner(snapshot.user)) lastState = readState();
      const changed = mergeRemote(snapshot);
      await flush();
      announceNoteConflicts();
      announcePrescriptionConflicts();
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
    if (recordLocalChanges(lastState, current)===false) {
      dirty=true;dispatch('medindex:library-pending',{storage:true,localRevision,syncedRevision});return false;
    }
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
      // Invalidate reads that began before logout as well as clearing storage;
      // otherwise a late initial GET can repopulate the signed-out device.
      wipeLocalLibrary();
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
    prescriptionChapters:() => prescriptionChapters.map(item => ({ ...item })),
    savePersonalDrug,
    deletePersonalDrug,
    personalDrugFields:DRUG_FIELDS,
    version:EVENT_SYNC_VERSION,
    recoveryVersion:RECOVERY_VERSION,
    longSessionVersion:LONG_SESSION_VERSION,
    noteSyncVersion:NOTE_SYNC_VERSION,
    noteConflicts,
    acceptRemoteNote:localKey => resolveNoteConflict(localKey, false),
    retryLocalNote:localKey => resolveNoteConflict(localKey, true),
    prescriptionSyncVersion:'prescription-cas-v1',
    prescriptionConflicts,
    capturePrescriptionBase,
    savePrescriptionDraft:writePrescriptionDraft,
    deletePrescription:(id,base=capturePrescriptionBase(id)) => writePrescriptionDraft(null,base),
    restorePrescription:(payload,base=capturePrescriptionBase(protocolId(payload))) => writePrescriptionDraft(payload,base),
    acceptRemotePrescription:id => resolvePrescriptionConflict(id,false),
    retryLocalPrescription:id => resolvePrescriptionConflict(id,true),
    diagnostics:() => ({
      localRevision,
      syncedRevision,
      dirty,
      syncInFlight:Boolean(syncPromise),
      retryUntil,
      legacyPrescriptionPollActive:Boolean(legacyPrescriptionPollTimer),
      noteConflicts:noteConflicts().length,
      pendingNotes:Object.values(readMeta().noteStates).filter(state => state?.pending || state?.conflict).length,
      oversizedNotes:Object.values(readMeta().noteStates).filter(state => typeof state?.pending?.content==='string' && state.pending.content.length>NOTE_MAX).length,
      prescriptionConflicts:prescriptionConflicts().length,
      pendingPrescriptions:Object.values(readMeta().prescriptionStates).filter(state => state?.pending || state?.conflict).length,
      metadataStoragePending,
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
  ['medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved', 'medindex:personal-drugs-changed', 'medindex:prescriptions-changed']
    .forEach(name => window.addEventListener(name, onPersonalLibraryMutation));

  window.addEventListener('storage', event => {
    if (![PRESCRIPTIONS_KEY, FAVORITES_KEY, NOTES_KEY, DRUGS_KEY].includes(event.key)) return;
    onPersonalLibraryMutation();
  });

  startLegacyPrescriptionPoll();
  void initialize();
})();