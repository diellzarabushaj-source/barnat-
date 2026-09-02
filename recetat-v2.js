/* Recetat V2 — consolidated runtime with chapter folders. */

(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin', cache:'no-store', ...options, signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally { clearTimeout(timer); }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { response, payload } = await authJson();
    if (response.status === 401 || response.status === 403 || (response.ok && payload.authenticated === false)) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok || payload.authenticated !== true) throw new Error('Sesioni nuk mund të verifikohet.');
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.defer = true; script.setAttribute(marker, '1');
      script.addEventListener('load', resolve, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfile(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v6', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    if (window.DRxSidebarTaxonomy || window.DRxSidebarCollapse) return Promise.resolve();
    const existing = document.querySelector('script[src^="/sidebar-taxonomy-v3.js"], script[data-drx-sidebar-taxonomy]');
    if (existing) return Promise.resolve();
    return loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v5', 'data-drx-sidebar-taxonomy');
  }

  const SIDEBAR_COLLAPSE_KEY = 'drx_sidebar_collapsed_v2';
  const desktopSidebarQuery = window.matchMedia('(min-width:1024px)');

  function storedSidebarCollapsed() {
    try { return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'; }
    catch { return false; }
  }

  function persistSidebarCollapsed(collapsed) {
    try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0'); }
    catch {}
  }

  function sidebarCollapsed() {
    return document.documentElement.classList.contains('drx-sidebar-collapsed');
  }

  function sidebarItemLabel(item) {
    if (!item) return '';
    const explicit = item.getAttribute('aria-label');
    if (explicit && !/^(hap|mbyll|minimizo|zgjero)/i.test(explicit)) return explicit;
    const children = Array.from(item.children || []);
    const textNode = children.find(node =>
      node.tagName === 'SPAN'
      && !node.classList.contains('nav-icon')
      && !node.classList.contains('nav-summary-chevron')
      && !node.classList.contains('nav-count')
    );
    return String(textNode?.textContent || item.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function syncCollapsedTooltips(collapsed) {
    document.querySelectorAll('#sidebar .nav-item, #sidebar .drx-user-card').forEach(item => {
      if (!item.dataset.sidebarLabel) item.dataset.sidebarLabel = sidebarItemLabel(item);
      const label = item.dataset.sidebarLabel;
      if (!label) return;
      if (collapsed) {
        if (!item.hasAttribute('aria-label')) item.setAttribute('aria-label', label);
        item.title = label;
        item.dataset.sidebarManagedTitle = '1';
      } else if (item.dataset.sidebarManagedTitle === '1') {
        item.removeAttribute('title');
        delete item.dataset.sidebarManagedTitle;
      }
    });
  }

  function rememberOpenSidebarGroups() {
    document.querySelectorAll('#sidebar details.nav-group[open]').forEach(group => {
      group.dataset.sidebarWasOpen = '1';
      group.open = false;
    });
  }

  function restoreOpenSidebarGroups() {
    document.querySelectorAll('#sidebar details.nav-group[data-sidebar-was-open="1"]').forEach(group => {
      group.open = true;
      delete group.dataset.sidebarWasOpen;
    });
  }

  function setSidebarCollapsed(collapsed, { persist = true } = {}) {
    const next = Boolean(collapsed && desktopSidebarQuery.matches);
    const root = document.documentElement;
    const sidebar = $('#sidebar');
    const toggle = $('#sidebarCollapse');
    const changed = sidebarCollapsed() !== next;

    root.classList.toggle('drx-sidebar-collapsed', next);
    sidebar?.classList.toggle('is-collapsed', next);
    sidebar?.setAttribute('data-collapsed', String(next));

    if (toggle) {
      toggle.setAttribute('aria-pressed', String(next));
      toggle.setAttribute('aria-expanded', String(!next));
      toggle.setAttribute('aria-label', next ? 'Zgjero menynë' : 'Minimizo menynë');
      toggle.title = next ? 'Zgjero menynë' : 'Minimizo menynë';
    }

    if (changed) {
      if (next) rememberOpenSidebarGroups();
      else restoreOpenSidebarGroups();
    }
    syncCollapsedTooltips(next);
    if (persist && desktopSidebarQuery.matches) persistSidebarCollapsed(next);

    if (changed) {
      window.dispatchEvent(new CustomEvent('drx:sidebar-collapse', { detail:{ collapsed:next } }));
    }
    return next;
  }

  function toggleSidebarCollapsed() {
    if (!desktopSidebarQuery.matches) return false;
    return setSidebarCollapsed(!sidebarCollapsed());
  }

  function syncSidebarViewport() {
    setSidebarCollapsed(desktopSidebarQuery.matches && storedSidebarCollapsed(), { persist:false });
  }

  function bindCollapsedGroupExpansion() {
    document.querySelectorAll('#sidebar .nav-group > .nav-summary').forEach(summary => {
      if (summary.dataset.sidebarCollapseBound === '1') return;
      summary.dataset.sidebarCollapseBound = '1';
      summary.addEventListener('click', event => {
        if (!desktopSidebarQuery.matches || !sidebarCollapsed()) return;
        event.preventDefault();
        const group = summary.closest('details');
        setSidebarCollapsed(false);
        requestAnimationFrame(() => {
          if (group) group.open = true;
          summary.focus({ preventScroll:true });
        });
      });
    });
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop=$('#sidebarBackdrop'); if(backdrop) backdrop.hidden=false;
  }
  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop=$('#sidebarBackdrop'); if(backdrop) backdrop.hidden=true;
  }
  async function logout() {
    const button=$('#logoutButton'); if(button) button.disabled=true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if(!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch { if(button) button.disabled=false; }
  }
  let bound=false;
  function init() {
    if(bound) return; bound=true;
    void loadSharedSidebarTaxonomy().then(() => {
      window.DRxSidebarCollapse?.sync?.();
      window.DRxSidebarCollapse?.refreshLabels?.();
    }).catch(() => {
      // Fail-safe only: the shared sidebar runtime is the canonical owner.
      syncSidebarViewport();
      bindCollapsedGroupExpansion();
      const toggle = $('#sidebarCollapse');
      if (toggle && toggle.dataset.sidebarCollapseOwner !== 'local-fallback') {
        toggle.dataset.sidebarCollapseOwner = 'local-fallback';
        toggle.addEventListener('click',toggleSidebarCollapsed);
      }
      const onViewportChange = () => syncSidebarViewport();
      if (desktopSidebarQuery.addEventListener) desktopSidebarQuery.addEventListener('change', onViewportChange);
      else desktopSidebarQuery.addListener?.(onViewportChange);
    });
    $('#menuButton')?.addEventListener('click',openSidebar);
    $('#sidebarClose')?.addEventListener('click',closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click',closeSidebar);
    $('#logoutButton')?.addEventListener('click',logout);

    window.addEventListener('keydown', event => {
      if(event.key==='Escape') closeSidebar();
      if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='k' && !event.target.closest('textarea,input,select')){
        event.preventDefault(); $('#rxSavedSearch')?.focus();
      }
    });
  }
  window.DRxRxShell=Object.freeze({
    init,ensureAuth,syncProfile,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
  });
})();

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
        if (Array.isArray(payload.prescriptionChapters)) prescriptionChapters = payload.prescriptionChapters;
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
      if (Array.isArray(snapshot.prescriptionChapters)) prescriptionChapters = snapshot.prescriptionChapters;
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
    prescriptionChapters:() => prescriptionChapters.map(item => ({ ...item })),
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
  ['medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved', 'medindex:personal-drugs-changed', 'medindex:prescriptions-changed']
    .forEach(name => window.addEventListener(name, onPersonalLibraryMutation));

  window.addEventListener('storage', event => {
    if (![PRESCRIPTIONS_KEY, FAVORITES_KEY, NOTES_KEY, DRUGS_KEY].includes(event.key)) return;
    onPersonalLibraryMutation();
  });

  startLegacyPrescriptionPoll();
  void initialize();
})();

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexAdministrationRoutes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATEGORIES = Object.freeze({
    ENTERAL:Object.freeze({ key:'ENTERAL', label:'Enterale', description:'Përmes traktit gastrointestinal ose mukozës orale', routes:Object.freeze(['PO', 'SL', 'BUCCAL', 'PR']), defaultRoute:'PO' }),
    PARENTERAL:Object.freeze({ key:'PARENTERAL', label:'Parenterale', description:'Injeksion ose infuzion', routes:Object.freeze(['IV', 'IM', 'SC', 'ID']), defaultRoute:'' }),
    TOPICAL_LOCAL:Object.freeze({ key:'TOPICAL_LOCAL', label:'Topike / lokale', description:'Lëkurë, sy, vesh, hundë, vaginale ose transdermale', routes:Object.freeze(['TOP', 'OPH', 'OTIC', 'NASAL', 'VAG', 'TD']), defaultRoute:'' }),
    INHALATION:Object.freeze({ key:'INHALATION', label:'Inhalatore', description:'Përmes rrugëve të frymëmarrjes', routes:Object.freeze(['INH', 'MDI', 'DPI', 'NEB']), defaultRoute:'' }),
  });
  const CATEGORY_ORDER = Object.freeze(['ENTERAL', 'PARENTERAL', 'TOPICAL_LOCAL', 'INHALATION']);
  const ROUTE_LABELS = Object.freeze({
    PO:'orale', SL:'sublinguale', BUCCAL:'bukale', PR:'rektale',
    IV:'intravenoze', IM:'intramuskulare', SC:'subkutane', ID:'intradermale',
    TOP:'dermatologjike', OPH:'oftalmike', OTIC:'otike', NASAL:'nazale', VAG:'vaginale', TD:'transdermale',
    INH:'inhalatore', MDI:'MDI', DPI:'DPI', NEB:'nebulizator',
  });
  const ROUTE_CODES = Object.freeze(Object.keys(ROUTE_LABELS));
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');

  function normalizeCategory(value) {
    const source = fold(value).replace(/[^a-z0-9]+/g, '');
    if (!source) return '';
    if (/^(enteral|oral|gastrointestinal)$/.test(source)) return 'ENTERAL';
    if (/^(parenteral|injective|injektive)$/.test(source)) return 'PARENTERAL';
    if (/^(topicallocal|topical|topike|lokale|local)$/.test(source)) return 'TOPICAL_LOCAL';
    if (/^(inhalation|inhalatore|inhaled|respiratory)$/.test(source)) return 'INHALATION';
    return CATEGORY_ORDER.includes(text(value).toUpperCase()) ? text(value).toUpperCase() : '';
  }

  function routeTokens(value) {
    const raw = text(value);
    const source = fold(raw);
    const routes = [];
    const add = route => { if (!routes.includes(route)) routes.push(route); };
    raw.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).forEach(token => {
      if (ROUTE_CODES.includes(token)) add(token);
    });

    if (/\bi\.?v\.?\b|intraven|venoz|perfuzion/.test(source)) add('IV');
    if (/\bi\.?m\.?\b|intramusk/.test(source)) add('IM');
    if (/\bs\.?c\.?\b|subkutan|subcutan|nenlekure/.test(source)) add('SC');
    if (/\bi\.?d\.?\b|intraderm/.test(source)) add('ID');
    if (/\bp\.?o\.?\b|per\s*os|oral|nga goja/.test(source)) add('PO');
    if (/subling/.test(source)) add('SL');
    if (/bukal|buccal/.test(source)) add('BUCCAL');
    if (/rektal|rectal|suppositor|supozitor|klizm|enema/.test(source)) add('PR');
    if (/oftalm|ophthalm|okular|ocular|eye\s*drops?|pika\s*(per|për)?\s*sy/.test(source)) add('OPH');
    if (/otik|otic|ear\s*drops?|pika\s*(per|për)?\s*vesh/.test(source)) add('OTIC');
    if (/nazal|nasal|intranas/.test(source)) add('NASAL');
    if (/vaginal|intravag|ovul|pessar/.test(source)) add('VAG');
    if (/transderm|patch|flaster|ngjites/.test(source)) add('TD');
    const isSpecialDermalRoute = /intraderm|transderm/.test(source);
    if (!isSpecialDermalRoute && /topik|topical|kutan|cutaneous|dermal|lekure/.test(source)) add('TOP');
    if (/metered\s*dose/.test(source)) add('MDI');
    if (/dry\s*powder/.test(source)) add('DPI');
    if (/nebul|mjergull/.test(source)) add('NEB');
    if (/inhal|aerosol|respirator/.test(source)) add('INH');

    if (routes.some(route => ['MDI', 'DPI', 'NEB'].includes(route))) {
      const genericIndex = routes.indexOf('INH');
      if (genericIndex >= 0) routes.splice(genericIndex, 1);
    }
    return routes;
  }

  function normalizeRoute(value) {
    const tokens = routeTokens(value);
    return tokens.length === 1 ? tokens[0] : '';
  }
  function categoryForRoute(route) {
    const normalized = text(route).toUpperCase();
    return CATEGORY_ORDER.find(key => CATEGORIES[key].routes.includes(normalized)) || '';
  }
  function routesForCategory(category) { return CATEGORIES[normalizeCategory(category)]?.routes || []; }
  function routeBelongsToCategory(route, category) { return routesForCategory(category).includes(text(route).toUpperCase()); }

  function explicitSource(value = {}) {
    return [value.route, value.routes, value.allowedRoutes, value.administrationRoute, value.administrationRoutes,
      value['Rruga'], value['Rrugët e lejuara'], value['Rruga — Të rritur'], value['Rruga — Fëmijë'],
      value.prescriptionLine, value.prescriptionNotation, value.sheetPrescriptionNotation].filter(Boolean).join(' ');
  }

  function formInference(formValue) {
    const form = fold(formValue);
    if (!form) return { category:'', routes:[], confidence:'unknown' };
    if (/inhal|nebul|aerosol|respir|dry\s*powder|metered\s*dose/.test(form)) {
      const routes = routeTokens(form);
      return { category:'INHALATION', routes:routes.length ? routes : [], confidence:'form' };
    }
    if (/subling/.test(form)) return { category:'ENTERAL', routes:['SL'], confidence:'form' };
    if (/bukal|buccal|oromuk/.test(form)) return { category:'ENTERAL', routes:['BUCCAL'], confidence:'form' };
    if (/rektal|rectal|suppositor|supozitor|klizm|enema/.test(form)) return { category:'ENTERAL', routes:['PR'], confidence:'form' };
    if (/ophthalm|oftalm|ocular|okular|eye\s*(drop|ointment|gel)/.test(form)) return { category:'TOPICAL_LOCAL', routes:['OPH'], confidence:'form' };
    if (/otic|ear\s*drops?/.test(form)) return { category:'TOPICAL_LOCAL', routes:['OTIC'], confidence:'form' };
    if (/nasal|intranas/.test(form)) return { category:'TOPICAL_LOCAL', routes:['NASAL'], confidence:'form' };
    if (/vaginal|intravag|ovul|pessar/.test(form)) return { category:'TOPICAL_LOCAL', routes:['VAG'], confidence:'form' };
    if (/transderm|patch|flaster/.test(form)) return { category:'TOPICAL_LOCAL', routes:['TD'], confidence:'form' };
    if (/cream|krem|ointment|pomad|unguent|gel|lotion|locion|cutaneous|kutan|dermal|skin/.test(form)) return { category:'TOPICAL_LOCAL', routes:['TOP'], confidence:'form' };
    if (/injection|injeks|infusion|infuz|parenter|vial|flakon|ampou|ampul|lyophilis/.test(form)) {
      const routes = routeTokens(form).filter(route => categoryForRoute(route) === 'PARENTERAL');
      return { category:'PARENTERAL', routes, confidence:'form' };
    }
    if (/tablet|capsul|kapsul|syrup|sirup|oral|suspension|pezullim|granul|lozenge|pastil|solution\s*for\s*oral/.test(form)) return { category:'ENTERAL', routes:['PO'], confidence:'form' };
    return { category:'', routes:[], confidence:'unknown' };
  }

  function inferAdministration(value = {}) {
    const explicitCategory = normalizeCategory(value.administrationCategory || value.category || value['Kategoria e administrimit'] || value['Kategoria']);
    const explicitRoutes = routeTokens(explicitSource(value));
    const routeCategories = [...new Set(explicitRoutes.map(categoryForRoute).filter(Boolean))];
    const form = value.form || value.pharmaceuticalForm || value.pharmaceutical_form || value['Forma farmaceutike'] || value['Forma'];
    const byForm = formInference(form);

    let category = explicitCategory;
    let confidence = explicitCategory ? 'explicit-category' : 'unknown';
    if (!category && routeCategories.length === 1) {
      category = routeCategories[0];
      confidence = 'explicit-route';
    }
    if (!category && byForm.category) {
      category = byForm.category;
      confidence = byForm.confidence;
    }

    // Rrugët e deklaruara në databazë / SmPC janë autoritative.
    // Forma farmaceutike përdoret vetëm si fallback kur rruga nuk është deklaruar.
    const explicitForCategory = explicitRoutes.filter(route => !category || categoryForRoute(route) === category);
    const inferredForCategory = byForm.routes.filter(route => !category || categoryForRoute(route) === category);
    const routes = [...new Set(explicitForCategory.length ? explicitForCategory : inferredForCategory)];
    if (explicitForCategory.length) confidence = 'explicit-route';

    const route = routes.length === 1 ? routes[0] : '';
    return {
      category,
      routes,
      route,
      ambiguous:routes.length !== 1 || !category,
      confidence,
      categoryLabel:CATEGORIES[category]?.label || 'E papërcaktuar',
      routeLabel:ROUTE_LABELS[route] || '',
    };
  }

  function categoryLabel(value) { return CATEGORIES[normalizeCategory(value)]?.label || ''; }
  function routeLabel(value) { return ROUTE_LABELS[text(value).toUpperCase()] || text(value); }
  function routePhrase(value) {
    const route = text(value).toUpperCase();
    const phrases = {
      PO:'nga goja', SL:'nën gjuhë', BUCCAL:'në mukozën bukale', PR:'rektalisht',
      IV:'intravenoz', IM:'intramuskularisht', SC:'nënlëkurë', ID:'intradermalisht',
      TOP:'në lëkurë', OPH:'në sy', OTIC:'në vesh', NASAL:'në hundë', VAG:'vaginalisht', TD:'transdermalisht',
      INH:'me inhalim', MDI:'me inhalator MDI', DPI:'me inhalator DPI', NEB:'me nebulizator',
    };
    return phrases[route] || text(value);
  }

  return { CATEGORIES, CATEGORY_ORDER, ROUTE_LABELS, normalizeCategory, normalizeRoute, routeTokens,
    categoryForRoute, routesForCategory, routeBelongsToCategory, inferAdministration, formInference,
    categoryLabel, routeLabel, routePhrase };
});

(function (root, factory) {
  const api = factory(root?.MedIndexAdministrationRoutes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexDosageEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Administration) {
  'use strict';

  if (!Administration && typeof require === 'function') {
    try { Administration = require('./administration-routes.js'); } catch {}
  }

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq');

  const FORM_ALIASES = [
    ['tablet', /^(tab\.?|tableta?|tablet(?:s)?)$/],
    ['capsule', /^(caps?\.?|kapsula?|capsules?)$/],
    ['ampoule', /^(amp\.?|ampula?|ampoules?|inj(?:eksion|ection)?\.?)$/],
    ['infusion', /^(inf\.?|infuzion|infusion)$/],
    ['ointment', /^(ung\.?|unguentum|ointment|pomade)$/],
    ['cream', /^(krem|cream)$/],
    ['solution', /^(sol\.?|solucion|solution)$/],
    ['syrup', /^(sir\.?|sirup|syrup)$/],
    ['suppository', /^(sup\.?|supozitor|suppository)$/],
    ['drops', /^(gtt\.?|pika|drops)$/],
    ['inhalation', /^(inh\.?|inhalacion|inhalation|spray)$/],
    ['vial', /^(fl\.?|flakon|vial)$/],
  ];

  function normalizedToken(value) {
    return fold(value).replace(/[^a-z0-9]+/g, '');
  }

  function normalizeAtc(value) {
    return text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizeForm(value) {
    const source = fold(value).replace(/[()]/g, '').trim();
    return FORM_ALIASES.find(([, pattern]) => pattern.test(source))?.[0] || normalizedToken(source);
  }

  function normalizeSubstance(value) {
    return fold(value)
      .split(/\s*(?:\/|\+|;|\band\b|\bdhe\b)\s*/i)
      .map(part => part.replace(/[^a-z0-9]+/g, ' ').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .join('+');
  }

  function normalizeStrength(value) {
    return fold(value)
      .replace(/,/g, '.')
      .replace(/\bµg\b/g, 'mcg')
      .replace(/\bug\b/g, 'mcg')
      .replace(/\bui\b/g, 'iu')
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9.%/+]/g, '');
  }

  function buildMatchKey(value) {
    const strength = value?.strength ?? value?.referenceStrength ?? value?.concentration;
    return [
      normalizeAtc(value?.atc),
      normalizeSubstance(value?.substance),
      normalizeForm(value?.form),
      normalizeStrength(strength),
    ].join('|');
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positive(value) {
    const number = finite(value);
    return number != null && number > 0 ? number : null;
  }

  function pediatricDoseFactors(regimen = {}) {
    const legacy = positive(regimen.mgPerKg);
    const minimum = positive(regimen.mgPerKgMin) ?? legacy;
    const maximum = positive(regimen.mgPerKgMax) ?? minimum;
    return {
      minimum,
      maximum:maximum != null && minimum != null ? Math.max(minimum, maximum) : maximum,
    };
  }

  function needsPediatricInputs(regimen) {
    const factors = pediatricDoseFactors(regimen);
    return Boolean(
      factors.minimum != null
      || factors.maximum != null
      || text(regimen?.formula)
      || Number.isFinite(regimen?.minAgeMonths)
      || Number.isFinite(regimen?.maxAgeMonths)
      || Number.isFinite(regimen?.minWeightKg)
      || Number.isFinite(regimen?.maxWeightKg)
    );
  }

  function pediatricEligibility(regimen, patient = {}) {
    if (!needsPediatricInputs(regimen)) return { eligible:true, missing:[] };
    const ageMonths = Number(patient.ageMonths);
    const weightKg = Number(patient.weightKg);
    const missing = [];
    const factors = pediatricDoseFactors(regimen);
    const ageRequired = Number.isFinite(regimen?.minAgeMonths) || Number.isFinite(regimen?.maxAgeMonths);
    const weightRequired = factors.minimum != null
      || factors.maximum != null
      || Number.isFinite(regimen?.minWeightKg)
      || Number.isFinite(regimen?.maxWeightKg);
    if (ageRequired && (!Number.isFinite(ageMonths) || ageMonths < 0)) missing.push('ageMonths');
    if (weightRequired && (!Number.isFinite(weightKg) || weightKg <= 0)) missing.push('weightKg');
    if (missing.length) return { eligible:false, missing };
    const withinAge = (!Number.isFinite(regimen.minAgeMonths) || ageMonths >= regimen.minAgeMonths)
      && (!Number.isFinite(regimen.maxAgeMonths) || ageMonths <= regimen.maxAgeMonths);
    const withinWeight = (!Number.isFinite(regimen.minWeightKg) || weightKg >= regimen.minWeightKg)
      && (!Number.isFinite(regimen.maxWeightKg) || weightKg <= regimen.maxWeightKg);
    return { eligible:withinAge && withinWeight, missing:[], outOfRange:!(withinAge && withinWeight) };
  }

  function exactMatches(drug, regimens) {
    const key = buildMatchKey(drug);
    if (key.split('|').some(part => !part)) return [];
    return (Array.isArray(regimens) ? regimens : []).filter(regimen => (regimen.matchKey || buildMatchKey(regimen)) === key);
  }

  function decideMatch(drug, regimens, options = {}) {
    const matches = exactMatches(drug, regimens);
    if (!matches.length) return { status:'manual', matchKey:buildMatchKey(drug), matches:[] };
    if (options.population === 'pediatric') {
      const evaluated = matches.map(regimen => ({ regimen, eligibility:pediatricEligibility(regimen, options.patient) }));
      const missing = [...new Set(evaluated.flatMap(item => item.eligibility.missing))];
      if (missing.length) return { status:'needs-patient-data', matchKey:buildMatchKey(drug), matches, missing };
      const eligible = evaluated.filter(item => item.eligibility.eligible).map(item => item.regimen);
      if (!eligible.length) return { status:'review', matchKey:buildMatchKey(drug), matches, reason:'patient-out-of-range' };
      if (eligible.length === 1) return { status:'auto', matchKey:buildMatchKey(drug), regimen:eligible[0], matches:eligible };
      return { status:'choose-indication', matchKey:buildMatchKey(drug), matches:eligible };
    }
    if (matches.length === 1) return { status:'auto', matchKey:buildMatchKey(drug), regimen:matches[0], matches };
    return { status:'choose-indication', matchKey:buildMatchKey(drug), matches };
  }

  function decimal(value, digits = 2) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  }

  function concentrationMgPerMl(regimen = {}) {
    const structuredMg = positive(regimen.concentrationMg);
    const structuredMl = positive(regimen.concentrationMl);
    if (structuredMg != null && structuredMl != null) return structuredMg / structuredMl;
    const match = text(regimen.concentration).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*mg\s*\/\s*(\d+(?:\.\d+)?)\s*m[lL]\b/);
    if (!match) return null;
    const mg = Number(match[1]);
    const ml = Number(match[2]);
    return Number.isFinite(mg) && Number.isFinite(ml) && mg > 0 && ml > 0 ? mg / ml : null;
  }

  function applyCaps(perDoseMg, dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, caps) {
    let dose = perDoseMg;
    let daily = dailyTotalMg;
    if (Number.isFinite(dose) && maxSingleMg != null && dose > maxSingleMg) {
      dose = maxSingleMg;
      caps.push('maxSingle');
    }
    if (Number.isFinite(dose) && !Number.isFinite(daily) && dosesPerDay != null) daily = dose * dosesPerDay;
    if (Number.isFinite(daily) && max24hMg != null && daily > max24hMg) {
      daily = max24hMg;
      caps.push('max24h');
      if (dosesPerDay != null) dose = Math.min(dose, max24hMg / dosesPerDay);
    }
    return { perDoseMg:dose, dailyTotalMg:daily };
  }

  function calculateFactor(factor, basis, weightKg, dosesPerDay) {
    if (factor == null || weightKg == null) return { perDoseMg:null, dailyTotalMg:null };
    if (/dit/.test(basis)) {
      const dailyTotalMg = weightKg * factor;
      return {
        dailyTotalMg,
        perDoseMg:dosesPerDay != null ? dailyTotalMg / dosesPerDay : null,
      };
    }
    if (/doz|marr/.test(basis)) {
      const perDoseMg = weightKg * factor;
      return {
        perDoseMg,
        dailyTotalMg:dosesPerDay != null ? perDoseMg * dosesPerDay : null,
      };
    }
    return { perDoseMg:null, dailyTotalMg:null, ambiguous:true };
  }

  function calculatePediatricDose(regimen, patient = {}) {
    const eligibility = pediatricEligibility(regimen, patient);
    if (eligibility.missing?.length) return { status:'needs-patient-data', missing:eligibility.missing };
    if (!eligibility.eligible) return { status:'out-of-range' };

    const weightKg = positive(patient.weightKg);
    const fixedDoseMg = positive(regimen?.fixedDoseMg);
    const fixedVolumeMl = positive(regimen?.fixedVolumeMl);
    const dosesPerDay = positive(regimen?.dosesPerDay);
    const maxSingleMg = positive(regimen?.maxSingleMg);
    const max24hMg = positive(regimen?.max24hMg);
    const basis = fold(regimen?.basis);
    const factors = pediatricDoseFactors(regimen);
    const concentration = concentrationMgPerMl(regimen);
    const caps = [];

    if (fixedDoseMg != null || fixedVolumeMl != null) {
      let perDoseMg = fixedDoseMg;
      let dailyTotalMg = fixedDoseMg != null && dosesPerDay != null ? fixedDoseMg * dosesPerDay : null;
      const capped = applyCaps(perDoseMg, dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, caps);
      perDoseMg = capped.perDoseMg;
      dailyTotalMg = capped.dailyTotalMg;
      const perDoseMl = fixedVolumeMl ?? (perDoseMg != null && concentration != null ? perDoseMg / concentration : null);
      return {
        status:'calculated',
        perDoseMg:decimal(perDoseMg),
        dailyTotalMg:decimal(dailyTotalMg),
        perDoseMl:decimal(perDoseMl),
        dosesPerDay,
        cappedBy:[...new Set(caps)],
      };
    }

    if (factors.minimum == null || weightKg == null) return { status:'manual', reason:'no-structured-rule' };
    if (!/dit|doz|marr/.test(basis)) return { status:'manual', reason:'ambiguous-basis' };

    const minimumRaw = calculateFactor(factors.minimum, basis, weightKg, dosesPerDay);
    const maximumRaw = calculateFactor(factors.maximum ?? factors.minimum, basis, weightKg, dosesPerDay);
    const minimumCaps = [];
    const maximumCaps = [];
    const minimum = applyCaps(minimumRaw.perDoseMg, minimumRaw.dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, minimumCaps);
    const maximum = applyCaps(maximumRaw.perDoseMg, maximumRaw.dailyTotalMg, dosesPerDay, maxSingleMg, max24hMg, maximumCaps);
    caps.push(...minimumCaps, ...maximumCaps);

    const isRange = factors.maximum != null && Math.abs(factors.maximum - factors.minimum) > 1e-9;
    if (isRange) {
      return {
        status:'range-calculated',
        requiresDoseSelection:true,
        factorMinMgPerKg:decimal(factors.minimum),
        factorMaxMgPerKg:decimal(factors.maximum),
        perDoseMgMin:decimal(minimum.perDoseMg),
        perDoseMgMax:decimal(maximum.perDoseMg),
        dailyTotalMgMin:decimal(minimum.dailyTotalMg),
        dailyTotalMgMax:decimal(maximum.dailyTotalMg),
        perDoseMlMin:concentration != null ? decimal(minimum.perDoseMg / concentration) : null,
        perDoseMlMax:concentration != null ? decimal(maximum.perDoseMg / concentration) : null,
        dosesPerDay,
        cappedBy:[...new Set(caps)],
      };
    }

    return {
      status:'calculated',
      perDoseMg:decimal(minimum.perDoseMg),
      dailyTotalMg:decimal(minimum.dailyTotalMg),
      perDoseMl:concentration != null ? decimal(minimum.perDoseMg / concentration) : null,
      dosesPerDay,
      cappedBy:[...new Set(caps)],
    };
  }

  function formatNumber(value) {
    return Number.isFinite(Number(value))
      ? new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(Number(value))
      : '';
  }

  function calculatedRangeText(calculation) {
    if (calculation?.status !== 'range-calculated') return '';
    const mg = Number.isFinite(calculation.perDoseMgMin) && Number.isFinite(calculation.perDoseMgMax)
      ? `${formatNumber(calculation.perDoseMgMin)}–${formatNumber(calculation.perDoseMgMax)} mg`
      : '';
    const ml = Number.isFinite(calculation.perDoseMlMin) && Number.isFinite(calculation.perDoseMlMax)
      ? `${formatNumber(calculation.perDoseMlMin)}–${formatNumber(calculation.perDoseMlMax)} mL`
      : '';
    return [mg, ml].filter(Boolean).join(' · ');
  }

  function routePhrase(value) {
    if (Administration?.routePhrase) return Administration.routePhrase(value);
    const raw = text(value);
    const route = fold(raw);
    if (!raw) return '';
    if (/oral|orale|nga goja|\bp\.?o\.?\b/.test(route)) return 'nga goja';
    if (/okular|ocular|ne sy|në sy/.test(route)) return 'në sy';
    if (/otik|otic|ne vesh|në vesh/.test(route)) return 'në vesh';
    if (/nazal|nasal|ne hund|në hund/.test(route)) return 'në hundë';
    if (/topik|topical|kutan|cutaneous|lekure|lëkurë/.test(route)) return 'në lëkurë';
    if (/inhal/.test(route)) return 'me inhalim';
    if (/rektal|rectal/.test(route)) return 'rektalisht';
    if (/intramusk|\bi\.?m\.?\b/.test(route)) return 'intramuskularisht';
    if (/intraven|\bi\.?v\.?\b/.test(route)) return 'intravenoz';
    if (/subkutan|subcutaneous|nenlekure|nënlëkurë|\bs\.?c\.?\b/.test(route)) return 'nënlëkurë';
    return raw;
  }

  function durationPhrase(value) {
    const raw = text(value);
    if (!raw) return '';
    const normalized = fold(raw);
    return /^(per|për|deri|gjate|gjatë|sipas)\b/.test(normalized) ? raw : `për ${raw}`;
  }

  function signatureAmount(regimen, population, calculation) {
    if (population === 'pediatric' && calculation?.status === 'calculated') {
      if (Number.isFinite(calculation.perDoseMl)) return `${formatNumber(calculation.perDoseMl)} mL`;
      if (Number.isFinite(calculation.perDoseMg)) return `${formatNumber(calculation.perDoseMg)} mg`;
    }
    const unitCount = text(regimen?.unitCount);
    const practicalUnit = text(regimen?.practicalUnit);
    if (unitCount && practicalUnit) return `${unitCount} ${practicalUnit}`;
    if (practicalUnit) return practicalUnit;
    if (positive(regimen?.fixedVolumeMl) != null) return `${formatNumber(regimen.fixedVolumeMl)} mL`;
    if (positive(regimen?.fixedDoseMg) != null) return `${formatNumber(regimen.fixedDoseMg)} mg`;
    const doseMg = text(regimen?.doseMg);
    if (doseMg) return /mg\b/i.test(doseMg) ? doseMg : `${doseMg} mg`;
    return '';
  }

  function buildSignature(regimen, population = 'adult', calculation = null) {
    if (calculation?.status === 'range-calculated') return '';
    const existing = text(regimen?.signatura);
    const calculatedPediatric = population === 'pediatric' && calculation?.status === 'calculated';
    if (!calculatedPediatric && existing) return existing;
    const amount = signatureAmount(regimen, population, calculation);
    if (!amount) return existing;
    const verb = population === 'pediatric' ? 'Jepen' : 'Merret';
    const route = routePhrase(regimen?.route);
    const frequency = text(regimen?.frequency)
      || (positive(regimen?.intervalHours) != null ? `çdo ${formatNumber(regimen.intervalHours)} orë` : '');
    const duration = durationPhrase(regimen?.duration);
    const sentence = [`${verb} ${amount}`, route, frequency, duration].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return sentence ? `${sentence.replace(/[.]+$/, '')}.` : existing;
  }

  function prescriptionTransfer(drug, regimen = null, population = 'adult', calculation = null) {
    const administration = Administration?.inferAdministration ? Administration.inferAdministration(drug) : {};
    const base = {
      key:text(drug?.key || drug?.drugKey),
      tradeName:text(drug?.tradeName), substance:text(drug?.substance), strength:text(drug?.strength),
      form:text(drug?.form), packaging:text(drug?.packaging), packagingSummary:text(drug?.packagingSummary),
      prescriptionLine:text(drug?.prescriptionLine), prescriptionNotation:text(drug?.prescriptionNotation),
      sheetPrescriptionNotation:text(drug?.sheetPrescriptionNotation), dispense:text(drug?.dispense),
      route:text(drug?.route), atc:text(drug?.atc), pdid:text(drug?.pdid),
      administrationCategory:text(drug?.administrationCategory || administration.category),
      allowedRoutes:Array.isArray(drug?.allowedRoutes) ? drug.allowedRoutes : administration.routes,
    };
    if (!regimen) return { ...base, dosageStatus:'manual', dosagePopulation:population };
    const range = calculatedRangeText(calculation);
    const requiresReview = calculation?.status === 'range-calculated';
    return {
      ...base,
      regimenId:text(regimen.regimenId),
      dosageStatus:requiresReview ? 'requires-review' : 'auto-filled',
      dosagePopulation:population,
      indication:text(regimen.indication),
      doseInstruction:signatureAmount(regimen, population, calculation),
      route:text(regimen.route || base.route),
      administrationCategory:text(regimen.administrationCategory || base.administrationCategory),
      frequency:text(regimen.frequency),
      duration:text(regimen.duration),
      dispense:text(regimen.dispense || base.dispense),
      signatura:buildSignature(regimen, population, calculation),
      warnings:[
        text(regimen.warnings),
        requiresReview ? 'Kalkulatori dha diapazon; doza përfundimtare duhet zgjedhur sipas indikacionit dhe protokollit.' : '',
      ].filter(Boolean).join(' · '),
      calculatedDoseRange:range,
      pediatricCalculation:calculation || null,
      sourceUrl:text(regimen.sourceUrl),
      matchKey:text(regimen.matchKey || buildMatchKey(regimen)),
      verificationStatus:text(regimen.status || 'VERIFIKUAR'),
    };
  }

  return {
    normalizeAtc, normalizeForm, normalizeSubstance, normalizeStrength, buildMatchKey,
    pediatricDoseFactors, needsPediatricInputs, pediatricEligibility, exactMatches, decideMatch,
    concentrationMgPerMl, calculatePediatricDose, calculatedRangeText, buildSignature, prescriptionTransfer,
  };
});

(() => {
  'use strict';

  const DB_NAME = 'medindex-registry-v1';
  const DB_STORE = 'datasets';
  const DB_KEY = 'registry-parts';
  const REGISTRY_URL = '/api/registry';
  const MAX_QUERY_LENGTH = 90;
  const REGISTRY_SCHEMA_VERSION = 'registry-prescription-master-v3-no-dynamic-code';
  let rowsPromise = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq')
    .replace(/[^a-z0-9%+./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB nuk mbështetet.'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB nuk u hap.'));
      request.onblocked = () => reject(new Error('IndexedDB është bllokuar.'));
    });
  }

  async function databaseGet(key) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Cache-i lokal nuk u lexua.'));
      });
    } finally {
      database.close();
    }
  }

  async function databasePut(key, value) {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(DB_STORE, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Cache-i lokal nuk u ruajt.'));
        transaction.onabort = () => reject(transaction.error || new Error('Ruajtja lokale u anulua.'));
        transaction.objectStore(DB_STORE).put(value, key);
      });
    } finally {
      database.close();
    }
  }

  async function decodeParts(parts) {
    if (!Array.isArray(parts) || !parts.length) return [];
    if (parts.every(item => item && typeof item === 'object')) return parts;
    if (typeof DecompressionStream !== 'function') throw new Error('Shfletuesi nuk mbështet dekompresimin lokal.');
    const encoded = parts.join('');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const parsed = JSON.parse(await new Response(stream).text());
    if (Array.isArray(parsed)) return parsed;
    for (const key of ['rows', 'data', 'records', 'items', 'drugs', 'barnat']) {
      if (Array.isArray(parsed?.[key])) return parsed[key];
    }
    return [];
  }

  function parseAssignment(source, name, fallback = null) {
    const prefix = `window.${name}`;
    const line = String(source || '').split(/\r?\n/).find(item => item.trim().startsWith(prefix));
    if (!line) return fallback;
    const equals = line.indexOf('=');
    if (equals < 0) return fallback;
    const serialized = line.slice(equals + 1).trim().replace(/;+\s*$/, '');
    try { return JSON.parse(serialized); }
    catch { throw new Error(`Payload-i i regjistrit ka fushë të pavlefshme: ${name}.`); }
  }

  function parsePayload(source) {
    const parts = parseAssignment(source, 'DRUG_DATA_PARTS', []);
    if (!Array.isArray(parts) || !parts.length) {
      throw new Error(parseAssignment(source, 'REGISTRY_LOAD_ERROR', 'Regjistri nuk ktheu të dhëna.'));
    }
    return {
      parts,
      quality:parseAssignment(source, 'REGISTRY_QUALITY_META', null),
    };
  }

  async function fetchAndStoreParts() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(REGISTRY_URL, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/javascript' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Regjistri ${response.status}`);
      const payload = parsePayload(await response.text());
      const record = {
        version: REGISTRY_SCHEMA_VERSION,
        savedAt: Date.now(),
        parts: payload.parts,
        quality: payload.quality,
      };
      await databasePut(DB_KEY, record).catch(() => null);
      return record;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadRows() {
    let record = null;
    try { record = await databaseGet(DB_KEY); } catch {}
    if (!record?.parts?.length || record.version !== REGISTRY_SCHEMA_VERSION) record = await fetchAndStoreParts();
    const rows = await decodeParts(record.parts);
    return rows.filter(row => String(row?.__qualityStatus || '').trim() !== 'blocked');
  }

  function resultFromRow(row) {
    const tradeName = clean(row['Emri tregtar']);
    const substance = clean(row['Substanca aktive']);
    const strength = clean(row['Fortësia']);
    const form = clean(row['Forma farmaceutike']);
    const packaging = clean(row['Madhësia e paketimit']);
    const pdid = clean(row.PDID);
    const protocolNo = clean(row.ProtocolNo);
    const prescriptionLine = clean(row.__prescriptionLine);
    const packagingSummary = clean(row.__packagingSummary);
    return {
      key: `${pdid}|${protocolNo}|${tradeName}|${strength}`,
      tradeName,
      substance,
      strength,
      form,
      packaging,
      prescriptionLine,
      prescriptionNotation:[prescriptionLine, packagingSummary].filter(Boolean).join(' — '),
      packagingSummary,
      dispense:clean(row.__dispense),
      route:clean(row.__prescriptionRoute),
      sheetPrescriptionNotation:clean(row.__sheetPrescriptionNotation),
      atc:clean(row['ATC Code']),
      pdid,
      protocolNo,
      qualityStatus:clean(row.__qualityStatus || 'verified'),
    };
  }

  function rank(row, query, tokens) {
    const trade = normalize(row['Emri tregtar']);
    const substance = normalize(row['Substanca aktive']);
    const strength = normalize(row['Fortësia']);
    const form = normalize(row['Forma farmaceutike']);
    const atc = normalize(row['ATC Code']);
    const prescription = normalize(row['Si të shënohet në recetë']);
    const packaging = normalize(row['Madhësia e paketimit']);
    const haystack = `${substance} ${trade} ${strength} ${form} ${atc} ${prescription} ${packaging}`;
    if (!tokens.every(token => haystack.includes(token))) return -1;
    let score = 0;
    if (substance === query) score += 120;
    else if (substance.startsWith(query)) score += 90;
    else if (substance.includes(query)) score += 65;
    if (trade === query) score += 100;
    else if (trade.startsWith(query)) score += 75;
    else if (trade.includes(query)) score += 50;
    if (prescription.startsWith(query)) score += 40;
    if (atc.startsWith(query)) score += 35;
    if (strength.includes(query)) score += 12;
    return score;
  }

  async function rows() {
    if (!rowsPromise) rowsPromise = loadRows().catch(error => {
      rowsPromise = null;
      throw error;
    });
    return rowsPromise;
  }

  async function search(rawQuery, options = {}) {
    const query = normalize(clean(rawQuery).slice(0, MAX_QUERY_LENGTH));
    const limit = Math.min(50, Math.max(1, Number(options.limit || 12)));
    if (query.length < 2) return [];
    const tokens = query.split(/\s+/).filter(Boolean);
    const registryRows = await rows();
    return registryRows
      .map(row => ({ row, score: rank(row, query, tokens) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || clean(a.row['Substanca aktive']).localeCompare(clean(b.row['Substanca aktive']), 'sq'))
      .slice(0, limit)
      .map(item => resultFromRow(item.row));
  }

  window.MedIndexLocalRegistry = {
    search,
    ready: rows,
    resetMemory() { rowsPromise = null; },
  };
  window.dispatchEvent(new CustomEvent('medindex:local-registry-ready'));
})();


(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexPrescriptionFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORM_LABELS = {
    tab: 'Tableta', tablet: 'Tableta', tableta: 'Tableta',
    caps: 'Kapsula', capsule: 'Kapsula', kapsula: 'Kapsula',
    amp: 'Ampulë', ampoule: 'Ampulë', ampula: 'Ampulë', inj: 'Ampulë', injection: 'Ampulë',
    inf: 'Infuzion', infusion: 'Infuzion', infuzion: 'Infuzion',
    ung: 'Unguentum', ointment: 'Unguentum', unguentum: 'Unguentum', cream: 'Krem', krem: 'Krem',
    sol: 'Solucion', solution: 'Solucion', solucion: 'Solucion',
    sir: 'Sirup', syrup: 'Sirup', sirup: 'Sirup',
    sup: 'Supozitor', suppository: 'Supozitor', supozitor: 'Supozitor',
    gtt: 'Pika', drops: 'Pika', pika: 'Pika',
    inh: 'Inhalacion', inhalation: 'Inhalacion', inhalacion: 'Inhalacion', spray: 'Spray',
    fl: 'Flakon', vial: 'Flakon', flakon: 'Flakon'
  };
  const FORM_PREFIXES = {
    Tableta: 'Tab.', Kapsula: 'Caps.', Ampulë: 'Amp.', Infuzion: 'Inf.',
    Unguentum: 'Ung.', Krem: 'Ung.', Solucion: 'Sol.', Sirup: 'Sir.',
    Supozitor: 'Sup.', Pika: 'Gtt.', Inhalacion: 'Inh.', Spray: 'Inh.', Flakon: 'Fl.',
  };
  const EXACT_FORM_PREFIXES = Object.freeze({
    'capsule, soft': 'Caps. soft.',
    'chewable tablet': 'Tab. përtyp.',
  });
  const RX_PREFIX_PATTERN = /^(?:Tab\.\s*përtyp\.|Caps\.\s*soft\.|Tab\.|Caps\.|Amp\.|Inf\.|Ung\.|Cr\.|Sol\.|Sir\.|Susp\.|Sup\.|Supp\.|Ov\.|Gtt\.|Spr\.|Inh\.|Inj\.|Pulv\.|Gran\.|Past\.|Gel\.|Fl\.|Vial\.|Garz\.|Gas\s+med\.|Prep\.)\s*/i;

  const text = value => String(value ?? '').trim();
  const formKey = value => text(value)
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('sq');

  function formLabel(value) {
    const raw = text(value).replace(/[().]/g, '').toLocaleLowerCase('sq');
    if (!raw) return '';
    const direct = FORM_LABELS[raw];
    if (direct) return direct;
    const match = Object.entries(FORM_LABELS).find(([key]) => raw.includes(key));
    return match?.[1] || text(value).replace(/[().]/g, '');
  }

  function normalizeDrug(item) {
    const tradeName = text(item?.tradeName || item?.trade_name || item?.['Emri tregtar']);
    const substance = text(item?.substance || item?.activeSubstance || item?.active_substance || item?.['Substanca aktive']);
    const strength = text(item?.strength || item?.dose || item?.['Fortësia']);
    const form = text(item?.form || item?.pharmaceuticalForm || item?.pharmaceutical_form || item?.['Forma farmaceutike'] || item?.['Forma']);
    return {
      key: text(item?.key || item?.drugKey || `${item?.pdid || item?.PDID || ''}|${tradeName}|${strength}`),
      id: text(item?.id || item?.drugId),
      drugId: text(item?.drugId || item?.id),
      tradeName,
      substance,
      strength,
      form,
      atc: text(item?.atc || item?.atcCode || item?.atc_code || item?.['ATC Code']),
      pdid: text(item?.pdid),
      regimenId: text(item?.regimenId),
      dosageStatus: text(item?.dosageStatus),
      dosagePopulation: text(item?.dosagePopulation),
      indication: text(item?.indication),
      route: text(item?.route),
      frequency: text(item?.frequency),
      duration: text(item?.duration),
      dispense: text(item?.dispense),
      signatura: text(item?.signatura),
      warnings: text(item?.warnings),
      sourceUrl: text(item?.sourceUrl),
      matchKey: text(item?.matchKey),
      verificationStatus: text(item?.verificationStatus),
    };
  }

  function prefixForForm(value) {
    const exact = EXACT_FORM_PREFIXES[formKey(value)];
    if (exact) return exact;
    return FORM_PREFIXES[formLabel(value)] || '';
  }

  function ensurePrescriptionPrefix(rawLine, form) {
    let line = text(rawLine).replace(/^Rp\s*:\s*/i, '');
    if (!line) return '';
    const prefix = prefixForForm(form);
    if (!prefix) return line;
    line = text(line.replace(RX_PREFIX_PATTERN, ''));
    return `${prefix} ${line}`.trim();
  }

  function selectedDrugLine(item) {
    const drug = normalizeDrug(item);
    const name = drug.substance;
    if (!name) return '';
    const main = [name, drug.strength].filter(Boolean).join(' ');
    const form = formLabel(drug.form);
    const prefix = prefixForForm(form);
    return `${prefix ? `${prefix} ` : ''}${main}${form ? ` (${form})` : ''}`.trim();
  }

  function parseMedicationLine(rawLine) {
    let line = text(rawLine).replace(/^Rp\s*:\s*/i, '');
    if (!line || /^(?:Sasia|Doza|Tjetër|S(?:\s*\(Signatura\))?\.?|Signatura)\s*:/i.test(line)) return null;

    let prefixForm = '';
    const prefixMatch = line.match(/^(Tab\.?|Caps\.?|Amp\.?|Inf\.?|Ung\.?|Sol\.?|Sir\.?|Sup\.?|Gtt\.?|Inh\.?|Inj\.?|Fl\.?|Vial\.?)\s+(.+)$/i);
    if (prefixMatch) {
      prefixForm = formLabel(prefixMatch[1]);
      line = text(prefixMatch[2]);
    }

    let parentheticalForm = '';
    const formMatch = line.match(/\s*\(([^()]*(?:tablet|kapsul|ampul|infuz|unguent|krem|solucion|sirup|supoz|pika|inhal|spray|flakon)[^()]*)\)\s*$/i);
    if (formMatch) {
      parentheticalForm = formLabel(formMatch[1]);
      line = text(line.slice(0, formMatch.index));
    }

    let inlineQuantity = '';
    const inlineMatch = line.match(/\s+a\s+([\d.,]+\s*(?:ml|mL|l|L|g|tableta?|kapsula?|ampula?))\s*$/i);
    if (inlineMatch) {
      inlineQuantity = `a ${inlineMatch[1].replace(/([\d.,])([a-zA-Z])/g, '$1 $2')}`;
      line = text(line.slice(0, inlineMatch.index));
    }

    const doseMatch = line.match(/\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|mL|IU|UI|NJ|%)/i);
    const dose = doseMatch ? text(line.slice(doseMatch.index)) : '';
    const name = doseMatch ? text(line.slice(0, doseMatch.index)) : line;
    if (!name) return null;

    return {
      form: parentheticalForm || prefixForm,
      name,
      dose,
      quantity: inlineQuantity,
      dispenseQuantity: '',
      other: '',
      individualSignature: '',
      signatureGenerated: false,
    };
  }

  function inferType(medications, signature) {
    const forms = medications.map(item => text(item.form).toLocaleLowerCase('sq'));
    const sign = text(signature).toLocaleLowerCase('sq');
    if (forms.some(form => form.includes('infuz')) || /infuzion|përzi|perzi|tretës|tretes/.test(sign)) return 'infusion';
    if (forms.length && forms.every(form => /ampul|flakon|inj/.test(form))) return 'injection';
    if (forms.length && forms.every(form => /tablet|kapsul|sirup|solucion|pika/.test(form))) return 'oral';
    if (forms.some(form => /unguent|krem/.test(form))) return 'topical';
    if (forms.some(form => /inhal|spray/.test(form))) return 'inhalation';
    return 'other';
  }

  function inferRoute(type, signature, lines) {
    const value = `${signature} ${lines.join(' ')}`.toUpperCase();
    for (const route of ['IV', 'IM', 'SC', 'PO', 'PR', 'INH']) {
      if (new RegExp(`\\b${route}\\b`).test(value)) return route;
    }
    if (type === 'infusion') return 'IV';
    if (type === 'oral') return 'PO';
    return '';
  }

  function parseBlock(lines, index, missing) {
    const medications = [];
    const signatureEvents = [];
    let activeSignature = null;

    lines.forEach(raw => {
      const line = text(raw).replace(/^Rp\s*:\s*/i, '');
      if (!line) return;

      const doseMatch = line.match(/^Doza\s*:\s*(.*)$/i);
      if (doseMatch) {
        if (medications.length) medications.at(-1).dose = text(doseMatch[1]);
        else missing.push(`Grupi ${index + 1}: Doza nuk është lidhur me asnjë bar.`);
        activeSignature = null;
        return;
      }

      const quantityMatch = line.match(/^Sasia\s*:\s*(.*)$/i);
      if (quantityMatch) {
        if (medications.length) medications.at(-1).dispenseQuantity = text(quantityMatch[1]);
        else missing.push(`Grupi ${index + 1}: Sasia nuk është lidhur me asnjë bar.`);
        activeSignature = null;
        return;
      }

      const signatureMatch = line.match(/^(?:S(?:\s*\(Signatura\))?\.?|Signatura)\s*:\s*(.*)$/i);
      if (signatureMatch) {
        activeSignature = { afterMedicationCount: medications.length, value: text(signatureMatch[1]) };
        signatureEvents.push(activeSignature);
        return;
      }

      const otherMatch = line.match(/^Tjetër\s*:\s*(.*)$/i);
      if (otherMatch) {
        if (medications.length) medications.at(-1).other = text(otherMatch[1]);
        activeSignature = null;
        return;
      }

      const medication = parseMedicationLine(line);
      if (medication) {
        medications.push(medication);
        activeSignature = null;
        return;
      }

      if (activeSignature) activeSignature.value = text(`${activeSignature.value} ${line}`);
      else if (medications.length) medications.at(-1).other = text([medications.at(-1).other, line].filter(Boolean).join(' · '));
    });

    if (!medications.length) return null;

    const allSignatureText = signatureEvents.map(event => event.value).filter(Boolean).join(' ');
    const preliminaryType = inferType(medications, allSignatureText);
    const onlySignature = signatureEvents[0];
    const explicitlyShared = /përzi|perzi|së bashku|se bashku|bashkë|bashke|njëjt(?:in|ën) infuzion|njejt(?:in|en) infuzion/i.test(onlySignature?.value || '');
    const canUseSharedSignature = signatureEvents.length === 1
      && medications.length > 1
      && onlySignature.afterMedicationCount === medications.length
      && (preliminaryType === 'infusion' || preliminaryType === 'injection' || explicitlyShared);

    let sharedSignature = '';
    if (canUseSharedSignature) {
      sharedSignature = onlySignature.value;
    } else {
      signatureEvents.forEach(event => {
        const target = medications[Math.max(0, event.afterMedicationCount - 1)];
        if (target) target.individualSignature = event.value;
      });
    }

    const signatureForInference = sharedSignature || medications.map(item => item.individualSignature).filter(Boolean).join(' ');
    const type = inferType(medications, signatureForInference);
    const route = inferRoute(type, signatureForInference, lines);

    medications.forEach((item, medicationIndex) => {
      if (!item.dose) missing.push(`${item.name || `Bari ${medicationIndex + 1}`}: mungon doza/fortësia.`);
    });
    if (!sharedSignature && medications.every(item => !item.individualSignature)) {
      missing.push(`Grupi ${index + 1}: mungon Signatura; mund ta shkruash vetë ose ta propozosh me Gemini.`);
    }

    const titles = {
      infusion: 'Infuzion', injection: 'Injeksione', oral: 'Barna orale',
      topical: 'Përdorim lokal', inhalation: 'Inhalim', other: 'Administrim'
    };

    return {
      title: `${titles[type]}${route ? ` ${route}` : ''}`,
      type,
      route,
      sharedSignature,
      sharedSignatureGenerated: false,
      medications,
    };
  }

  function parse(input, diagnosis = '') {
    const raw = String(input || '').replace(/\r/g, '').trim();
    if (!raw) return null;
    const missing = [];
    const blocks = raw
      .split(/\n\s*\n+|(?=^\s*Rp\s*:)/gim)
      .map(block => block.split('\n'))
      .filter(block => block.some(line => text(line).replace(/^Rp\s*:\s*/i, '')));

    const sections = blocks.map((block, index) => parseBlock(block, index, missing)).filter(Boolean);
    if (!sections.length) {
      const fallback = parseBlock(raw.split('\n'), 0, missing);
      if (fallback) sections.push(fallback);
    }
    if (!sections.length) return null;

    return {
      title: text(diagnosis) ? `Recetë – ${text(diagnosis)}` : `Recetë – ${new Date().toLocaleDateString('sq-AL')}`,
      diagnosis: text(diagnosis),
      sections,
      notes: [],
      missing: [...new Set(missing)],
    };
  }

  function normalizeResult(value) {
    if (!value || typeof value !== 'object') return null;
    const sections = Array.isArray(value.sections) ? value.sections.map(section => ({
      title: text(section?.title) || 'Administrim',
      type: ['oral', 'injection', 'infusion', 'topical', 'inhalation', 'other'].includes(section?.type) ? section.type : 'other',
      route: text(section?.route),
      sharedSignature: text(section?.sharedSignature),
      sharedSignatureGenerated: Boolean(section?.sharedSignatureGenerated),
      medications: Array.isArray(section?.medications) ? section.medications.map(item => ({
        form: formLabel(item?.form),
        name: text(item?.name),
        dose: text(item?.dose),
        quantity: text(item?.quantity),
        dispenseQuantity: text(item?.dispenseQuantity),
        other: text(item?.other),
        individualSignature: text(item?.individualSignature),
        signatureGenerated: Boolean(item?.signatureGenerated),
      })).filter(item => item.name) : [],
    })).filter(section => section.medications.length) : [];
    if (!sections.length) return null;
    return {
      title: text(value.title) || 'Recetë',
      diagnosis: text(value.diagnosis),
      sections,
      notes: Array.isArray(value.notes) ? value.notes.map(text).filter(Boolean) : [],
      missing: Array.isArray(value.missing) ? value.missing.map(text).filter(Boolean) : [],
    };
  }

  function medicationLine(item) {
    const main = [text(item?.name), text(item?.dose)].filter(Boolean).join(' ');
    const inline = text(item?.quantity) ? ` ${text(item.quantity)}` : '';
    const form = formLabel(item?.form);
    const prefix = prefixForForm(form);
    return `${prefix ? `${prefix} ` : ''}${main}${inline}${form ? ` (${form})` : ''}`.trim();
  }

  function formatText(result) {
    const normalized = normalizeResult(result);
    if (!normalized) return '';
    const lines = ['Rp:'];
    normalized.sections.forEach((section, sectionIndex) => {
      if (sectionIndex) lines.push('');
      section.medications.forEach((item, itemIndex) => {
        if (itemIndex && !section.sharedSignature) lines.push('');
        lines.push(medicationLine(item));
        if (item.dispenseQuantity) lines.push(`Sasia: ${item.dispenseQuantity}`);
        if (item.other) lines.push(`Tjetër: ${item.other}`);
        if (item.individualSignature) lines.push(`S (Signatura): ${item.individualSignature}`);
      });
      if (section.sharedSignature) lines.push(`S (Signatura): ${section.sharedSignature}`);
    });
    if (normalized.notes.length) {
      lines.push('');
      normalized.notes.forEach(note => lines.push(`Shënim: ${note}`));
    }
    return lines.join('\n');
  }

  function hasGeneratedSignature(result) {
    const normalized = normalizeResult(result);
    return Boolean(normalized?.sections.some(section => section.sharedSignatureGenerated || section.medications.some(item => item.signatureGenerated)));
  }

  return {
    formLabel,
    prefixForForm,
    ensurePrescriptionPrefix,
    normalizeDrug,
    selectedDrugLine,
    parseMedicationLine,
    parse,
    normalizeResult,
    medicationLine,
    formatText,
    hasGeneratedSignature,
  };
});


(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) api.init(root.document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEMPLATES = [
    {
      key: 'tablet',
      label: 'Tableta',
      icon: 'Tab.',
      aliases: /tablet|tableta|tab\.?/i,
      template: 'Nga {{1}} tabletë çdo 8 orë, për 5 ditë.',
      preview: 'Nga 1 tabletë çdo 8 orë, për 5 ditë.',
    },
    {
      key: 'capsule',
      label: 'Kapsula',
      icon: 'Caps.',
      aliases: /kapsul|capsul|caps\.?/i,
      template: 'Nga {{1}} kapsulë çdo 8 orë, për 5 ditë.',
      preview: 'Nga 1 kapsulë çdo 8 orë, për 5 ditë.',
    },
    {
      key: 'ointment',
      label: 'Unguentum / krem',
      icon: 'Ung.',
      aliases: /unguent|ointment|krem|cream|ung\.?/i,
      template: 'Aplikohet një shtresë e hollë në zonën e prekur {{2}} herë në ditë, për 7 ditë.',
      preview: 'Aplikohet një shtresë e hollë 2 herë në ditë.',
    },
    {
      key: 'injection',
      label: 'Injeksion',
      icon: 'Amp.',
      aliases: /ampul|amp\.?|injeks|injection|flakon|vial/i,
      template: 'Administrohet {{1}} ampulë IM/IV/SC, 1 herë në ditë, për 1 ditë.',
      preview: '1 ampulë IM/IV/SC, sipas skemës së zgjedhur.',
    },
    {
      key: 'infusion',
      label: 'Infuzion',
      icon: 'Inf.',
      aliases: /infuz|infusion|inf\.?/i,
      template: 'Administrohet IV si infuzion për {{30}} minuta, 1 herë në ditë.',
      preview: 'IV si infuzion për 30 minuta.',
    },
    {
      key: 'manual',
      label: 'Shkruaje vetë',
      icon: 'S.',
      aliases: null,
      template: '',
      preview: 'Vendoset vetëm fusha bosh e Signaturës.',
    },
  ];
  const placeholderSessions = new WeakMap();

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  function detectForm(value) {
    const source = String(value || '');
    const ordered = ['infusion', 'injection', 'ointment', 'capsule', 'tablet'];
    return ordered.find(key => TEMPLATES.find(item => item.key === key)?.aliases?.test(source)) || '';
  }

  function contextAtCursor(value, cursor) {
    const source = String(value || '');
    const position = Math.max(0, Math.min(Number.isFinite(cursor) ? cursor : source.length, source.length));
    const before = source.slice(0, position);
    const blockStart = Math.max(before.lastIndexOf('\n\n'), before.lastIndexOf('\r\n\r\n'));
    return before.slice(blockStart >= 0 ? blockStart + 2 : 0).trim();
  }

  function renderTemplate(template) {
    const source = String(template || '');
    const placeholders = [];
    let output = '';
    let cursor = 0;
    for (const match of source.matchAll(/\{\{([^{}]+)\}\}/g)) {
      output += source.slice(cursor, match.index);
      const start = output.length;
      output += match[1];
      placeholders.push({ start, end:output.length });
      cursor = match.index + match[0].length;
    }
    output += source.slice(cursor);
    if (!placeholders.length) return { text:source, selectionStart:source.length, selectionEnd:source.length, placeholders:[] };
    return {
      text:output,
      selectionStart:placeholders[0].start,
      selectionEnd:placeholders[0].end,
      placeholders,
    };
  }

  function nextPlaceholderIndex(current, count, reverse = false) {
    if (!count) return -1;
    return (current + (reverse ? -1 : 1) + count) % count;
  }

  function insertionFor(value, selectionStart, selectionEnd, signatureText) {
    const source = String(value || '');
    const start = Math.max(0, Math.min(selectionStart ?? source.length, source.length));
    const end = Math.max(start, Math.min(selectionEnd ?? start, source.length));
    const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = source.indexOf('\n', end);
    const lineEnd = nextBreak < 0 ? source.length : nextBreak;
    const currentLine = source.slice(lineStart, lineEnd);
    const replacement = `S (Signatura): ${signatureText}`;

    if (/^\s*(?:S(?:\s*\(Signatura\))?\.?|Signatura)\s*:/i.test(currentLine)) {
      return {
        value: `${source.slice(0, lineStart)}${replacement}${source.slice(lineEnd)}`,
        insertionStart: lineStart,
      };
    }

    const before = source.slice(0, start);
    const after = source.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    return {
      value: `${before}${prefix}${replacement}${suffix}${after}`,
      insertionStart: before.length + prefix.length,
    };
  }

  function selectedContext(documentRef) {
    const composer = documentRef.getElementById('rxComposer');
    if (!composer) return '';
    const local = contextAtCursor(composer.value, composer.selectionStart ?? composer.value.length);
    if (detectForm(local)) return local;
    const lastDrug = documentRef.querySelector('#rxSelectedDrugs .rx-drug-chip:last-of-type span');
    return `${local} ${lastDrug?.textContent || ''}`.trim();
  }

  function setStatus(documentRef, message) {
    const status = documentRef.getElementById('rxStatus');
    if (!status) return;
    status.textContent = message;
    status.className = 'rx-status is-success';
  }

  function createPopover(documentRef) {
    let popover = documentRef.getElementById('rxSignaturePopover');
    if (popover) return popover;

    popover = documentRef.createElement('div');
    popover.id = 'rxSignaturePopover';
    popover.className = 'rx-popover rx-signature-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Modelet e Signaturës');

    const anchor = documentRef.getElementById('rxDrugPopover') || documentRef.getElementById('rxSelectedDrugs');
    anchor?.insertAdjacentElement('afterend', popover);
    return popover;
  }

  function renderPopover(documentRef, recommendedKey = '') {
    const popover = createPopover(documentRef);
    const ordered = [...TEMPLATES].sort((a, b) => {
      if (a.key === recommendedKey) return -1;
      if (b.key === recommendedKey) return 1;
      return 0;
    });

    popover.innerHTML = `<div class="rx-signature-head"><div><strong>Zgjidh modelin e Signaturës</strong><small>Numrat janë shembull. Pasi vendoset modeli, mund t’i ndryshosh lirshëm.</small></div><button type="button" data-close-signature aria-label="Mbyll">×</button></div><div class="rx-signature-grid">${ordered.map(item => `<button class="rx-signature-option${item.key === recommendedKey ? ' is-recommended' : ''}" type="button" data-signature-template="${escapeHtml(item.key)}"><span class="rx-signature-icon">${escapeHtml(item.icon)}</span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.preview)}</small></span>${item.key === recommendedKey ? '<em>E sugjeruar</em>' : ''}</button>`).join('')}</div>`;
    return popover;
  }

  function close(documentRef) {
    const popover = documentRef.getElementById('rxSignaturePopover');
    if (popover) popover.hidden = true;
    const trigger = documentRef.querySelector('[data-rx-command="signature"]');
    trigger?.setAttribute('aria-expanded', 'false');
  }

  function open(documentRef) {
    ['rxFormPopover', 'rxDrugPopover'].forEach(id => {
      const node = documentRef.getElementById(id);
      if (node) node.hidden = true;
    });
    const recommendedKey = detectForm(selectedContext(documentRef));
    const popover = renderPopover(documentRef, recommendedKey);
    popover.hidden = false;
    const trigger = documentRef.querySelector('[data-rx-command="signature"]');
    trigger?.setAttribute('aria-expanded', 'true');
    popover.querySelector('.is-recommended, .rx-signature-option')?.focus({ preventScroll:true });
  }

  function insertTemplate(documentRef, key) {
    const item = TEMPLATES.find(template => template.key === key) || TEMPLATES.at(-1);
    const composer = documentRef.getElementById('rxComposer');
    if (!composer) return;

    const rendered = renderTemplate(item.template);
    const insertion = insertionFor(
      composer.value,
      composer.selectionStart ?? composer.value.length,
      composer.selectionEnd ?? composer.selectionStart ?? composer.value.length,
      rendered.text,
    );

    composer.value = insertion.value;
    const contentStart = insertion.insertionStart + 'S (Signatura): '.length;
    const selectionStart = contentStart + rendered.selectionStart;
    const selectionEnd = contentStart + rendered.selectionEnd;
    const placeholders = (rendered.placeholders || []).map(range => ({
      start:contentStart + range.start,
      end:contentStart + range.end,
    }));
    if (placeholders.length) {
      placeholderSessions.set(composer, {
        ranges:placeholders,
        active:0,
        lastLength:insertion.value.length,
      });
    } else {
      placeholderSessions.delete(composer);
    }
    composer.focus();
    composer.setSelectionRange(selectionStart, selectionEnd);
    composer.dispatchEvent(new Event('input', { bubbles:true }));
    close(documentRef);
    setStatus(documentRef, item.key === 'manual'
      ? 'Signatura bosh u vendos. Shkruaje udhëzimin vetë.'
      : `Modeli për ${item.label.toLocaleLowerCase('sq')} u vendos. Ndrysho numrat, rrugën ose kohëzgjatjen sipas nevojës.`);
  }

  function init(documentRef = document) {
    if (!documentRef.querySelector('[data-rx-command="signature"]')) return;
    createPopover(documentRef);
    const composer = documentRef.getElementById('rxComposer');
    composer?.addEventListener('input', () => {
      const session = placeholderSessions.get(composer);
      if (!session) return;
      const delta = composer.value.length - session.lastLength;
      const cursor = composer.selectionStart ?? session.ranges[session.active].end;
      session.ranges[session.active].end = cursor;
      if (delta) {
        session.ranges.forEach((range, index) => {
          if (index > session.active) {
            range.start += delta;
            range.end += delta;
          }
        });
      }
      session.lastLength = composer.value.length;
    });
    composer?.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const session = placeholderSessions.get(composer);
      if (!session?.ranges?.length) return;
      event.preventDefault();
      session.active = nextPlaceholderIndex(session.active, session.ranges.length, event.shiftKey);
      const range = session.ranges[session.active];
      composer.setSelectionRange(range.start, range.end);
    });

    documentRef.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-rx-command="signature"]');
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const popover = createPopover(documentRef);
        if (popover.hidden) open(documentRef);
        else close(documentRef);
        return;
      }

      const templateButton = event.target.closest?.('[data-signature-template]');
      if (templateButton) {
        event.preventDefault();
        insertTemplate(documentRef, templateButton.dataset.signatureTemplate);
        return;
      }

      if (event.target.closest?.('[data-close-signature]')) {
        event.preventDefault();
        close(documentRef);
        return;
      }

      if (!event.target.closest?.('#rxSignaturePopover')) close(documentRef);
    }, true);

    documentRef.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !documentRef.getElementById('rxSignaturePopover')?.hidden) {
        close(documentRef);
        documentRef.querySelector('[data-rx-command="signature"]')?.focus();
      }
    });
  }

  return {
    TEMPLATES,
    detectForm,
    contextAtCursor,
    renderTemplate,
    nextPlaceholderIndex,
    insertionFor,
    init,
  };
});


(function (root, factory) {
  const api = factory(root?.MedIndexAdministrationRoutes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexPrescriptionContext = api;
  if (root?.document) {
    const run = () => api.init(root.document, root);
    root.document.readyState === 'loading'
      ? root.document.addEventListener('DOMContentLoaded', run, { once:true })
      : run();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Administration) {
  'use strict';

  if (!Administration && typeof require === 'function') {
    try { Administration = require('./administration-routes.js'); } catch {}
  }
  if (!Administration) throw new Error('MedIndexAdministrationRoutes mungon.');

  const KEY = 'medindex_rx_clinical_context_v4';
  const LEGACY_KEYS = ['medindex_rx_clinical_context_v3', 'medindex_rx_clinical_context_v2', 'medindex_rx_clinical_context_v1'];
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const { CATEGORIES, CATEGORY_ORDER, ROUTE_LABELS } = Administration;
  const SVG = Object.freeze({
    enteral:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4a4 4 0 0 1-4 4H9v4a4 4 0 0 0 4 4h3"/><path d="M8 7h8M7 3h10"/></svg>',
    parenteral:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5 5 5M13 6l5 5M4 20l5.5-5.5m0 0 5-5 2 2-5 5m-2-2 2 2M3 21l3-1-2-2-1 3Z"/><path d="m16.5 2.5 5 5"/></svg>',
    topical:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c4-2 6-6 8-12 3 2 6 5 8 9-2 4-5 6-9 6-3 0-5-1-7-3Z"/><path d="M7 16c3 0 6-2 8-6"/></svg>',
    inhalation:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v7c0 3-2 5-5 5M16 4v7c0 3 2 5 5 5"/><path d="M8 9c2-2 3-3 4-3s2 1 4 3M12 6v14"/></svg>',
    child:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M8 8H6a3 3 0 0 0-3 3v1m13-4h2a3 3 0 0 1 3 3v1M7 14c.8 4 2.5 6 5 6s4.2-2 5-6M9 12h6"/></svg>',
    shield:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>',
  });
  const CATEGORY_ICONS = Object.freeze({ ENTERAL:SVG.enteral, PARENTERAL:SVG.parenteral, TOPICAL_LOCAL:SVG.topical, INHALATION:SVG.inhalation });

  const state = {
    document:null, root:null, context:null, ready:false, nativeFetch:null,
    payloadView:null, payloadContextKey:'', refreshPromise:null, refreshTimer:0, previewObserver:null,
    productConstraint:null, drugPayloadCache:new Map(), drugPayloadPromises:new Map(),
  };
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const numberValue = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  function baseContext() {
    return { administrationCategory:'', route:'', pediatric:false, ageValue:'', ageUnit:'years', weightKg:'' };
  }

  function normalizeContext(value = {}) {
    const legacyCategory = value.parenteral === true ? 'PARENTERAL' : '';
    const category = Administration.normalizeCategory(value.administrationCategory || value.category || legacyCategory);
    let route = Administration.normalizeRoute(value.route);
    if (!category || !Administration.routeBelongsToCategory(route, category)) route = '';
    return {
      administrationCategory:category,
      route,
      pediatric:Boolean(value.pediatric),
      ageValue:text(value.ageValue),
      ageUnit:value.ageUnit === 'months' ? 'months' : 'years',
      weightKg:text(value.weightKg),
    };
  }

  function patientFromContext(value) {
    const context = normalizeContext(value);
    const age = numberValue(context.ageValue);
    return {
      ageMonths:age == null || age < 0 ? null : Math.round(context.ageUnit === 'months' ? age : age * 12),
      weightKg:numberValue(context.weightKg),
    };
  }

  function validateContext(value) {
    const context = normalizeContext(value);
    const missing = [];
    const invalid = [];
    if (!context.administrationCategory) missing.push('category');
    if (!context.route) missing.push('route');
    else if (!Administration.routeBelongsToCategory(context.route, context.administrationCategory)) invalid.push('route');
    if (context.pediatric) {
      const patient = patientFromContext(context);
      if (!context.ageValue) missing.push('age');
      else if (!Number.isFinite(patient.ageMonths) || patient.ageMonths < 0 || patient.ageMonths > 216) invalid.push('age');
      if (!context.weightKg) missing.push('weight');
      else if (!Number.isFinite(patient.weightKg) || patient.weightKg < 0.5 || patient.weightKg > 200) invalid.push('weight');
    }
    return { valid:!missing.length && !invalid.length, missing, invalid, context };
  }

  function population(regimen = {}) {
    const source = text(regimen._medindexPopulation || regimen.population).toLowerCase();
    if (/pediatr|femij|fëmij|child/.test(source)) return 'pediatric';
    if (/adult|rritur/.test(source)) return 'adult';
    return regimen.mgPerKg != null || regimen.mgPerKgMin != null || regimen.minAgeMonths != null || text(regimen.formula)
      ? 'pediatric' : 'adult';
  }

  function regimenAdministration(regimen = {}) {
    return Administration.inferAdministration({
      administrationCategory:regimen.administrationCategory,
      allowedRoutes:regimen.allowedRoutes,
      form:regimen.form,
      route:regimen.route,
    });
  }

  function isParenteral(regimen = {}) {
    return regimenAdministration(regimen).category === 'PARENTERAL';
  }

  function filterRegimens(rows, value) {
    const context = normalizeContext(value);
    const wantedPopulation = context.pediatric ? 'pediatric' : 'adult';
    return (Array.isArray(rows) ? rows : []).filter(regimen => {
      if (population(regimen) !== wantedPopulation) return false;
      const administration = regimenAdministration(regimen);
      if (administration.category !== context.administrationCategory) return false;
      const routes = Administration.routeTokens(regimen.route || administration.routes.join(' '));
      return routes.length === 1 && routes[0] === context.route;
    });
  }

  function decorateDosagePayload(payload = {}) {
    const adult = (payload.adult || []).map(item => ({ ...item, _medindexPopulation:'adult' }));
    const pediatric = (payload.pediatric || []).map(item => ({ ...item, _medindexPopulation:'pediatric' }));
    return { ...payload, adult:[...adult, ...pediatric], pediatric };
  }

  function decideForContext(engine, drug, rows, value) {
    const context = normalizeContext(value);
    const validation = validateContext(context);
    if (!validation.valid) return { status:'needs-clinical-context', matches:[], missing:validation.missing, invalid:validation.invalid };
    return engine.decideMatch(drug, filterRegimens(rows, context), {
      population:context.pediatric ? 'pediatric' : 'adult',
      patient:context.pediatric ? patientFromContext(context) : {},
    });
  }

  function transferForContext(engine, drug, regimen, value) {
    const context = normalizeContext(value);
    const wantedPopulation = context.pediatric ? 'pediatric' : 'adult';
    const validation = validateContext(context);
    if (!regimen) return engine.prescriptionTransfer(drug, null, wantedPopulation);
    if (!validation.valid) {
      return {
        ...engine.prescriptionTransfer(drug, null, wantedPopulation),
        dosageStatus:'requires-review',
        warnings:'Plotëso kategorinë, rrugën, grupmoshën dhe peshën para dozimit.',
      };
    }

    const contextualRegimen = { ...regimen, administrationCategory:context.administrationCategory, route:context.route };
    let calculation = context.pediatric && regimen.serverContextVerified ? regimen.serverCalculation : null;
    if (context.pediatric) {
      if (!calculation || !['calculated', 'range-calculated'].includes(calculation.status)) {
        calculation = engine.calculatePediatricDose(contextualRegimen, patientFromContext(context));
      }
      if (!['calculated', 'range-calculated'].includes(calculation.status)) {
        return {
          ...engine.prescriptionTransfer(drug, contextualRegimen, wantedPopulation, null),
          dosageStatus:'requires-review', signatura:'',
          warnings:[text(contextualRegimen.warnings), 'Skema pediatrike nuk u llogarit; kërkohet verifikim manual.'].filter(Boolean).join(' · '),
        };
      }
    }

    const output = engine.prescriptionTransfer(drug, contextualRegimen, wantedPopulation, calculation);
    output.administrationCategory = context.administrationCategory;
    output.route = context.route;
    if (regimen.serverContextVerified && text(regimen.serverSignature) && calculation?.status !== 'range-calculated') {
      output.signatura = text(regimen.serverSignature);
    }
    if (context.administrationCategory === 'PARENTERAL' && output.signatura) {
      output.signatura = output.signatura.replace(/^(Merret|Jepen)\b/i, 'Administrohet');
    }
    if (calculation?.status === 'range-calculated') {
      output.dosageStatus = 'requires-review';
      output.signatura = '';
      output.calculatedDoseRange = engine.calculatedRangeText(calculation);
      output.warnings = [
        text(output.warnings),
        `Kalkulatori llogariti ${output.calculatedDoseRange || 'një diapazon doze'}; zgjidhja e dozës përfundimtare varet nga indikacioni dhe protokolli.`,
      ].filter(Boolean).join(' · ');
    }
    if (calculation?.cappedBy?.length) {
      output.dosageStatus = 'requires-review';
      output.warnings = [text(output.warnings), `Doza u kufizua nga: ${calculation.cappedBy.join(', ')}.`].filter(Boolean).join(' · ');
    }
    return output;
  }

  const getContext = () => normalizeContext(state.context || baseContext());
  function contextKey(value = getContext()) {
    const context = normalizeContext(value);
    const patient = patientFromContext(context);
    return [context.pediatric ? 'pediatric' : 'adult', context.administrationCategory, context.route,
      context.pediatric ? patient.ageMonths : '', context.pediatric ? patient.weightKg : ''].join('|');
  }
  function contextEndpoint(value = getContext(), drugId = '') {
    const context = normalizeContext(value);
    const patient = patientFromContext(context);
    const query = new URLSearchParams({
      population:context.pediatric ? 'pediatric' : 'adult',
      category:context.administrationCategory,
      route:context.route,
      parenteral:String(context.administrationCategory === 'PARENTERAL'),
    });
    if (text(drugId)) query.set('id', text(drugId));
    if (context.pediatric) {
      query.set('ageMonths', String(patient.ageMonths));
      query.set('weightKg', String(patient.weightKg));
    }
    return `/api/prescription-dosage-context?${query.toString()}`;
  }

  function setStatus(message, type = '') {
    const node = state.document?.getElementById('rxStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `rx-status${type ? ` is-${type}` : ''}`;
  }
  function validationMessage(validation) {
    if (validation.missing.includes('category')) return 'Zgjidh kategorinë e administrimit.';
    if (validation.missing.includes('route') || validation.invalid.includes('route')) return 'Zgjidh rrugën e saktë të administrimit.';
    if (validation.missing.includes('age') || validation.missing.includes('weight')) return 'Për fëmijë shëno moshën dhe peshën.';
    if (validation.invalid.includes('age')) return 'Mosha duhet të jetë ndërmjet 0 dhe 18 vjeç.';
    if (validation.invalid.includes('weight')) return 'Pesha duhet të jetë ndërmjet 0.5 dhe 200 kg.';
    return '';
  }
  function ageLabel(context) {
    if (!context.ageValue) return '';
    return context.ageUnit === 'months' ? `${context.ageValue} muaj` : `${context.ageValue} vjeç`;
  }
  function contextSummary(value = getContext()) {
    const context = normalizeContext(value);
    const parts = [];
    if (context.administrationCategory) parts.push(Administration.categoryLabel(context.administrationCategory) || context.administrationCategory);
    if (context.route) parts.push(`${context.route} · ${Administration.routeLabel(context.route)}`);
    if (!context.administrationCategory && !context.route) parts.push('Rruga zgjidhet nga bari');
    parts.push(context.pediatric ? 'Fëmijë' : 'Të rritur');
    if (context.pediatric && context.ageValue) parts.push(ageLabel(context));
    if (context.pediatric && context.weightKg) parts.push(`${context.weightKg} kg`);
    return parts.join(' · ');
  }

  function patchNotation() {
    const core = state.root?.MedIndexPrescriptionFormat;
    if (!core || core.__registryNotationReady) return;
    const originalNormalizeDrug = core.normalizeDrug.bind(core);
    const originalSelectedDrugLine = core.selectedDrugLine.bind(core);
    core.normalizeDrug = item => {
      const normalized = originalNormalizeDrug(item);
      const administration = Administration.inferAdministration(item);
      return {
        ...normalized,
        id:text(item?.id || item?.drugId),
        drugId:text(item?.drugId || item?.id),
        registryNumber:text(item?.registryNumber || item?.registry_number),
        approvedPopulation:text(item?.approvedPopulation || item?.approved_population),
        productStatus:text(item?.productStatus || item?.product_status),
        packaging:text(item?.packaging || item?.packageSize),
        packagingSummary:text(item?.packagingSummary),
        prescriptionLine:text(item?.prescriptionLine),
        prescriptionNotation:text(item?.prescriptionNotation),
        sheetPrescriptionNotation:text(item?.sheetPrescriptionNotation),
        dispense:text(item?.dispense || normalized.dispense),
        administrationCategory:text(item?.administrationCategory || item?.__administrationCategory || item?.['Kategoria e administrimit'] || administration.category),
        allowedRoutes:Array.isArray(item?.allowedRoutes) ? item.allowedRoutes
          : Array.isArray(item?.__allowedRoutes) ? item.__allowedRoutes
            : Administration.routeTokens(item?.['Rrugët e lejuara'] || administration.routes.join(' ')),
      };
    };
    core.selectedDrugLine = item => {
      const drug = core.normalizeDrug(item);
      if (drug.prescriptionLine) {
        return typeof core.ensurePrescriptionPrefix === 'function'
          ? core.ensurePrescriptionPrefix(drug.prescriptionLine, drug.form)
          : drug.prescriptionLine;
      }
      return originalSelectedDrugLine(drug);
    };
    core.__registryNotationReady = true;
  }

  function createUi() {
    if (state.document.getElementById('rxClinicalContext')) return;
    const anchor = state.document.getElementById('rxOrderBuilder') || state.document.querySelector('.rx-command-bar');
    if (!anchor) return;
    anchor.insertAdjacentHTML(anchor.id === 'rxOrderBuilder' ? 'beforebegin' : 'afterend', `
      <section class="rx-clinical-context" id="rxClinicalContext" aria-labelledby="rxClinicalContextTitle">
        <div class="rx-context-heading">
          <div><span class="rx-context-kicker">Konteksti klinik</span><strong id="rxClinicalContextTitle">Rruga e administrimit</strong><small class="rx-context-source" id="rxContextSource">Zgjidhet automatikisht pasi zgjedh barin</small></div>
          <span class="rx-context-readiness is-neutral" id="rxContextReadiness">Auto nga bari</span>
        </div>
        <div class="rx-category-grid" role="radiogroup" aria-label="Kategoria e administrimit">
          ${CATEGORY_ORDER.map(category => `
            <button type="button" class="rx-category-button" data-context-category="${category}" role="radio" aria-checked="false">
              <span class="rx-context-icon">${CATEGORY_ICONS[category]}</span>
              <span><strong>${CATEGORIES[category].label}</strong><small>${CATEGORIES[category].description}</small></span>
              <span class="rx-context-state" aria-hidden="true"></span>
            </button>
          `).join('')}
        </div>
        <div class="rx-context-lower">
          <div class="rx-context-panel" id="rxContextDetails">
            <fieldset class="rx-context-field rx-route-field" id="rxRouteField">
              <legend>Rruga specifike</legend>
              <div class="rx-route-segments" id="rxRouteSegments" role="radiogroup" aria-label="Rruga specifike"></div>
            </fieldset>
            <div class="rx-context-guidance">
              <span class="rx-context-guidance-icon">${SVG.info}</span>
              <span>DRx lexon kategorinë dhe rrugët e lejuara nga kartela e produktit. Ti zgjedh rrugën vetëm kur preparati ka më shumë se një rrugë të vlefshme; doza nuk aplikohet pa konfirmimin tënd.</span>
            </div>
          </div>
          <button type="button" class="rx-pediatric-toggle" id="rxPediatricToggle" aria-pressed="false">
            <span class="rx-context-icon">${SVG.child}</span>
            <span><strong>Pediatrike</strong><small>Aktivizo moshën dhe peshën për dozimin pediatrik</small></span>
            <span class="rx-context-state" aria-hidden="true"></span>
          </button>
        </div>
        <div class="rx-pediatric-fields" id="rxPediatricFields" hidden>
          <div class="rx-context-field rx-age-field" id="rxAgeField">
            <label for="rxPatientAge">Mosha</label>
            <div class="rx-input-combo"><input id="rxPatientAge" type="number" min="0" max="18" step="0.1" inputmode="decimal" placeholder="p.sh. 4"><select id="rxPatientAgeUnit" aria-label="Njësia e moshës"><option value="years">vjeç</option><option value="months">muaj</option></select></div>
          </div>
          <div class="rx-context-field rx-weight-field" id="rxWeightField">
            <label for="rxPatientWeight">Pesha</label>
            <div class="rx-input-combo"><input id="rxPatientWeight" type="number" min="0.5" max="200" step="0.1" inputmode="decimal" placeholder="p.sh. 18"><span class="rx-input-suffix">kg</span></div>
          </div>
          <div class="rx-context-summary" id="rxContextSummary" role="status" aria-live="polite"><span class="rx-context-summary-icon">${SVG.shield}</span><span><strong>Konteksti aktiv:</strong> <span data-context-summary></span></span></div>
        </div>
      </section>
    `);
  }

  function renderRoutes(context, validation) {
    const holder = state.document.getElementById('rxRouteSegments');
    if (!holder) return;
    const constraint = state.productConstraint;
    const baseRoutes = context.administrationCategory ? Administration.routesForCategory(context.administrationCategory) : [];
    const constrainedRoutes = constraint?.category === context.administrationCategory && Array.isArray(constraint.routes)
      ? constraint.routes.filter(route => Administration.routeBelongsToCategory(route, context.administrationCategory))
      : [];
    const routes = constrainedRoutes.length ? constrainedRoutes : baseRoutes;
    const signature = `${context.administrationCategory || 'none'}:${constraint?.key || ''}:${routes.join(',')}`;
    if (holder.dataset.signature !== signature) {
      holder.dataset.signature = signature;
      holder.innerHTML = routes.length
        ? routes.map(route => `<button type="button" role="radio" aria-checked="false" data-context-route="${route}"><strong>${route}</strong><small>${ROUTE_LABELS[route] || route}</small></button>`).join('')
        : '<span class="rx-route-placeholder">Zgjidhet automatikisht pasi të zgjedhësh barin.</span>';
      bindRouteButtons(holder);
    }
    const showRouteError = Boolean(context.administrationCategory)
      && (validation.missing.includes('route') || validation.invalid.includes('route'));
    holder.classList.toggle('has-error', showRouteError);
    holder.querySelectorAll('[data-context-route]').forEach((button, index) => {
      const selected = button.dataset.contextRoute === context.route;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected || (!context.route && index === 0) ? 0 : -1;
    });
  }

  function renderPreviewContext() {
    const preview = state.document?.getElementById('rxPreview');
    if (!preview) return;
    const paper = preview.querySelector('.rx-paper');
    const existing = preview.querySelector('.rx-preview-context');
    const context = getContext();
    const show = Boolean(paper);
    if (!show) { existing?.remove(); return; }
    const validation = validateContext(context);
    const rows = [
      ['Kategoria', Administration.categoryLabel(context.administrationCategory) || 'Zgjidhet nga bari'],
      ['Rruga', context.route ? `${context.route} · ${Administration.routeLabel(context.route)}` : 'Zgjidhet nga bari'],
      state.productConstraint?.label ? ['Produkti', state.productConstraint.label] : null,
      ['Popullata', context.pediatric ? 'Fëmijë' : 'Të rritur'],
      context.pediatric ? ['Mosha', ageLabel(context) || 'E paplotësuar'] : null,
      context.pediatric ? ['Pesha', context.weightKg ? `${context.weightKg} kg` : 'E paplotësuar'] : null,
    ].filter(Boolean);
    const key = contextKey(context);
    if (existing?.dataset.contextKey === key && existing.classList.contains(validation.valid ? 'is-verified' : 'is-incomplete')) return;
    existing?.remove();
    paper.insertAdjacentHTML('beforebegin', `
      <aside class="rx-preview-context ${validation.valid ? 'is-verified' : 'is-incomplete'}" data-context-key="${key}">
        <header><span>${SVG.shield}</span><div><strong>Konteksti i dozimit</strong><small>${validation.valid ? 'Skemat janë filtruar sipas kategorisë, rrugës dhe popullatës.' : validationMessage(validation)}</small></div></header>
        <dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
      </aside>
    `);
  }

  function render() {
    if (!state.document) return;
    const context = getContext();
    const validation = validateContext(context);
    state.document.querySelectorAll('[data-context-category]').forEach(button => {
      const selected = button.dataset.contextCategory === context.administrationCategory;
      const locked = Boolean(state.productConstraint?.category);
      button.classList.toggle('is-active', selected);
      button.classList.toggle('is-locked', locked);
      button.disabled = locked;
      button.setAttribute('aria-checked', String(selected));
      button.setAttribute('aria-disabled', String(locked));
      button.title = locked ? 'Kategoria u mor automatikisht nga produkti i zgjedhur.' : '';
      button.querySelector('.rx-context-state').textContent = selected ? '✓' : '';
    });
    renderRoutes(context, validation);
    const pediatricButton = state.document.getElementById('rxPediatricToggle');
    if (pediatricButton) {
      pediatricButton.classList.toggle('is-active', context.pediatric);
      pediatricButton.setAttribute('aria-pressed', String(context.pediatric));
      pediatricButton.querySelector('small').textContent = context.pediatric
        ? (context.ageValue && context.weightKg ? `${ageLabel(context)} · ${context.weightKg} kg` : 'Plotëso moshën dhe peshën')
        : 'Aktivizo moshën dhe peshën për dozimin pediatrik';
      pediatricButton.querySelector('.rx-context-state').textContent = context.pediatric ? '✓' : '';
    }
    const pediatricFields = state.document.getElementById('rxPediatricFields');
    if (pediatricFields) pediatricFields.hidden = !context.pediatric;
    const ageField = state.document.getElementById('rxAgeField');
    const weightField = state.document.getElementById('rxWeightField');
    ageField?.classList.toggle('has-error', validation.missing.includes('age') || validation.invalid.includes('age'));
    weightField?.classList.toggle('has-error', validation.missing.includes('weight') || validation.invalid.includes('weight'));
    const ageInput = state.document.getElementById('rxPatientAge');
    const ageUnit = state.document.getElementById('rxPatientAgeUnit');
    const weightInput = state.document.getElementById('rxPatientWeight');
    if (ageInput && ageInput.value !== context.ageValue) ageInput.value = context.ageValue;
    if (ageUnit) {
      ageUnit.value = context.ageUnit;
      ageInput?.setAttribute('max', context.ageUnit === 'months' ? '216' : '18');
      ageInput?.setAttribute('step', context.ageUnit === 'months' ? '1' : '0.1');
    }
    if (weightInput && weightInput.value !== context.weightKg) weightInput.value = context.weightKg;
    const readiness = state.document.getElementById('rxContextReadiness');
    const neutral = !context.administrationCategory && !context.route;
    if (readiness) {
      readiness.textContent = neutral ? 'Auto nga bari' : validation.valid ? 'Gati' : 'Kërkon zgjedhje';
      readiness.className = `rx-context-readiness ${neutral ? 'is-neutral' : validation.valid ? 'is-ready' : 'is-incomplete'}`;
    }
    const source = state.document.getElementById('rxContextSource');
    if (source) {
      source.textContent = state.productConstraint?.label
        ? `Nga produkti: ${state.productConstraint.label}`
        : 'Zgjidhet automatikisht pasi zgjedh barin';
    }
    const summary = state.document.querySelector('[data-context-summary]');
    if (summary) summary.textContent = contextSummary(context);
    state.document.getElementById('rxContextSummary')?.classList.toggle('is-incomplete', !validation.valid);
    renderPreviewContext();
  }

  function load() {
    try {
      const current = state.root?.sessionStorage?.getItem(KEY);
      const legacy = LEGACY_KEYS.map(key => state.root?.sessionStorage?.getItem(key)).find(Boolean);
      return normalizeContext(JSON.parse(current || legacy || '{}'));
    } catch { return baseContext(); }
  }
  function persist() {
    try {
      state.root?.sessionStorage?.setItem(KEY, JSON.stringify(getContext()));
      LEGACY_KEYS.forEach(key => state.root?.sessionStorage?.removeItem(key));
    } catch {}
  }
  function applyPayload(payload, appliedContextKey = contextKey()) {
    const next = decorateDosagePayload(payload);
    if (!state.payloadView) state.payloadView = {};
    Object.keys(state.payloadView).forEach(key => { if (!Object.hasOwn(next, key)) delete state.payloadView[key]; });
    Object.assign(state.payloadView, next);
    state.payloadContextKey = appliedContextKey;
    return state.payloadView;
  }
  async function refreshPayloadForContext({ announce = false } = {}) {
    if (!state.payloadView || !state.nativeFetch) return null;
    const requestedContext = getContext();
    if (!validateContext(requestedContext).valid) return null;
    const requestedKey = contextKey(requestedContext);
    if (state.payloadContextKey === requestedKey && !state.refreshPromise) return state.payloadView;
    if (state.refreshPromise) {
      await state.refreshPromise.catch(() => null);
      return state.payloadContextKey === contextKey() ? state.payloadView : refreshPayloadForContext({ announce });
    }
    if (announce) setStatus('Po filtrohen skemat sipas kategorisë dhe rrugës…');
    state.refreshPromise = state.nativeFetch(contextEndpoint(requestedContext), {
      credentials:'same-origin', headers:{ Accept:'application/json' },
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Dozologjia ${response.status}`);
      applyPayload(payload, requestedKey);
      return state.payloadView;
    }).catch(error => {
      setStatus(`${error.message}. Doza nuk u aplikua automatikisht.`, 'error');
      throw error;
    }).finally(() => { state.refreshPromise = null; });
    await state.refreshPromise;
    if (contextKey() !== requestedKey) return refreshPayloadForContext({ announce });
    if (announce) setStatus('Skemat u përshtatën me kategorinë, rrugën dhe popullatën.', 'success');
    return state.payloadView;
  }
  async function loadForDrug(drugId, { announce = false } = {}) {
    const id = text(drugId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('ID e barit është e pavlefshme.');
    }
    const context = getContext();
    const validation = validateContext(context);
    if (!validation.valid) throw new Error(validationMessage(validation) || 'Konteksti klinik nuk është i plotë.');
    const key = `${id}|${contextKey(context)}`;
    if (state.drugPayloadCache.has(key)) return state.drugPayloadCache.get(key);
    if (state.drugPayloadPromises.has(key)) return state.drugPayloadPromises.get(key);
    const fetcher = state.nativeFetch || state.root?.fetch?.bind(state.root);
    if (!fetcher) throw new Error('Lidhja me dozologjinë nuk është gati.');
    const request = fetcher(contextEndpoint(context, id), {
      credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Dozologjia ${response.status}`);
      const view = decorateDosagePayload(payload);
      state.drugPayloadCache.set(key, view);
      if (state.drugPayloadCache.size > 80) state.drugPayloadCache.delete(state.drugPayloadCache.keys().next().value);
      return view;
    }).finally(() => state.drugPayloadPromises.delete(key));
    state.drugPayloadPromises.set(key, request);
    if (announce) setStatus('Po ngarkohet dozologjia e verifikuar për këtë produkt…');
    const result = await request;
    if (announce) setStatus('Dozologjia e produktit u filtrua sipas rrugës dhe grupmoshës.', 'success');
    return result;
  }

  function schedulePayloadRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => { if (validateContext(getContext()).valid) refreshPayloadForContext().catch(() => {}); }, 280);
  }
  function save(value, { refresh = true } = {}) {
    state.context = normalizeContext(value);
    persist(); render();
    state.root?.dispatchEvent?.(new CustomEvent('medindex:prescription-context-change', {
      detail:{ context:getContext(), valid:validateContext(getContext()).valid },
    }));
    if (refresh) refreshPayloadForContext().catch(() => {});
    return getContext();
  }
  const setContext = (value, options = {}) => save(value, options);
  function resetContext({ refresh = true } = {}) {
    state.context = baseContext();
    state.productConstraint = null;
    persist(); render();
    if (refresh) refreshPayloadForContext().catch(() => {});
    return getContext();
  }
  function hasDraft() {
    return Boolean(text(state.document.getElementById('rxComposer')?.value) || state.document.querySelector('#rxSelectedDrugs .rx-order-card'));
  }
  function hasStructuredOrders() {
    return Boolean(state.document.querySelector('#rxSelectedDrugs .rx-order-card'));
  }
  function changeContext(next, focusId = '', { allowWithOrders = false } = {}) {
    if (hasStructuredOrders() && !allowWithOrders) {
      setStatus('Për siguri, grupmosha nuk ndryshohet pasi janë shtuar barna. Hap “Recetë e re” për një kontekst tjetër pacienti.', 'error');
      return false;
    }
    save(next);
    if (focusId) state.document.getElementById(focusId)?.focus({ preventScroll:true });
    return true;
  }

  function drugAdministration(drug = {}) {
    return Administration.inferAdministration({
      administrationCategory:drug.administrationCategory || drug.__administrationCategory || drug['Kategoria e administrimit'],
      allowedRoutes:drug.allowedRoutes || drug.__allowedRoutes || drug['Rrugët e lejuara'],
      form:drug.form || drug['Forma farmaceutike'],
      route:[drug.route, drug.prescriptionLine, drug.prescriptionNotation].filter(Boolean).join(' '),
    });
  }
  function setProductConstraint(drug = null) {
    if (!drug) {
      state.productConstraint = null;
      render();
      return null;
    }
    const administration = drugAdministration(drug);
    if (!administration.category) {
      state.productConstraint = null;
      render();
      return null;
    }
    const label = [text(drug.tradeName || drug.substance || drug.activeSubstance), text(drug.strength)].filter(Boolean).join(' ');
    const key = [text(drug.id || drug.drugId || drug.pdid), administration.category, ...(administration.routes || [])].join('|');
    state.productConstraint = {
      key, label:label || 'Produkti i zgjedhur', category:administration.category,
      routes:Array.isArray(administration.routes) ? [...administration.routes] : [],
      confidence:administration.confidence || '',
    };
    render();
    return { ...state.productConstraint };
  }

  function explicitParenteralRoutes(drug = {}) {
    const administration = drugAdministration(drug);
    return administration.category === 'PARENTERAL' ? administration.routes : [];
  }
  function compatibleDrug(drug, context = getContext()) {
    const administration = drugAdministration(drug);
    if (!administration.category) return { valid:false, message:'Kategoria e këtij prezantimi nuk është përcaktuar; kërkohet verifikim në databazë.' };
    if (administration.category !== context.administrationCategory) {
      return { valid:false, message:`Ky prezantim është ${Administration.categoryLabel(administration.category)}, ndërsa konteksti është ${Administration.categoryLabel(context.administrationCategory)}.` };
    }
    if (administration.routes.length === 1 && administration.routes[0] !== context.route) {
      return { valid:false, message:`Ky prezantim përdor rrugën ${administration.routes[0]}, ndërsa është zgjedhur ${context.route}.` };
    }
    if (administration.routes.length > 1 && !administration.routes.includes(context.route)) {
      return { valid:false, message:`Zgjidh njërën nga rrugët e lejuara: ${administration.routes.join(', ')}.` };
    }
    return { valid:true, message:'' };
  }
  function focusFirstProblem(validation) {
    const id = validation.missing.includes('route') || validation.invalid.includes('route')
      ? 'rxRouteSegments'
      : validation.missing.includes('age') || validation.invalid.includes('age') ? 'rxPatientAge' : 'rxPatientWeight';
    state.document.getElementById(id)?.querySelector?.('button')?.focus?.({ preventScroll:true });
    state.document.getElementById(id)?.focus?.({ preventScroll:true });
  }

  function persistContextOnSavedPrescription() {
    setTimeout(() => {
      try {
        const items = JSON.parse(state.root.localStorage.getItem(SAVED_KEY) || '[]');
        if (!Array.isArray(items) || !items.length) return;
        const sourceText = state.document.getElementById('rxComposer')?.value || '';
        const diagnosis = state.document.getElementById('rxDiagnosis')?.value || '';
        const candidate = items.filter(item => item.sourceText === sourceText || (!sourceText && item.indication === diagnosis))
          .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || items[0];
        if (!candidate) return;
        candidate.clinicalContext = getContext();
        candidate.patientType = getContext().pediatric ? 'pediatric' : 'adult';
        candidate.population = getContext().pediatric ? 'pediatric' : 'adult';
        candidate.administrationCategory = getContext().administrationCategory;
        state.root.localStorage.setItem(SAVED_KEY, JSON.stringify(items));
      } catch {}
    }, 0);
  }
  function inferContextFromProtocol(protocol = {}) {
    if (protocol.clinicalContext) return normalizeContext(protocol.clinicalContext);
    const routeSource = [
      ...(Array.isArray(protocol.sections) ? protocol.sections.map(section => section.route) : []),
      ...(Array.isArray(protocol.items) ? protocol.items.map(item => item.route || item.administrationRoute) : []),
    ].filter(Boolean).join(' ');
    const routes = Administration.routeTokens(routeSource);
    const route = routes.length === 1 ? routes[0] : '';
    const category = Administration.normalizeCategory(protocol.administrationCategory) || Administration.categoryForRoute(route) || 'ENTERAL';
    const populationValue = text(protocol.patientType || protocol.population).toLowerCase();
    return normalizeContext({ administrationCategory:category, route, pediatric:/pediatr|femij|fëmij|child/.test(populationValue) });
  }
  function restoreContextForSavedPrescription(id) {
    try {
      const items = JSON.parse(state.root.localStorage.getItem(SAVED_KEY) || '[]');
      const protocol = Array.isArray(items) ? items.find(item => String(item.id) === String(id)) : null;
      setContext(inferContextFromProtocol(protocol || {}));
    } catch { setContext(baseContext()); }
  }

  function fetchBridge() {
    if (state.root.__rxContextFetch) return;
    state.nativeFetch = state.root.fetch.bind(state.root);
    state.root.fetch = async (...args) => {
      const input = args[0];
      const originalUrl = typeof input === 'string' ? input : input?.url || '';
      if (!/\/api\/dosage(?:[?#]|$)/.test(originalUrl)) return state.nativeFetch(...args);
      const requestedContext = getContext();
      const requestedKey = contextKey(requestedContext);
      const response = await state.nativeFetch(contextEndpoint(requestedContext), args[1]);
      if (!response.ok) return response;
      const payload = await response.clone().json();
      let view = applyPayload(payload, requestedKey);
      if (contextKey() !== requestedKey) view = await refreshPayloadForContext().catch(() => view);
      return new Proxy(response, {
        get(target, property) {
          if (property === 'json') return async () => view;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    state.root.__rxContextFetch = true;
  }
  function engineBridge() {
    const engine = state.root.MedIndexDosageEngine;
    if (!engine || engine.__rxContext) return;
    const original = {
      decideMatch:engine.decideMatch.bind(engine),
      prescriptionTransfer:engine.prescriptionTransfer.bind(engine),
      calculatePediatricDose:engine.calculatePediatricDose.bind(engine),
      calculatedRangeText:engine.calculatedRangeText.bind(engine),
    };
    engine.decideMatch = (drug, rows) => decideForContext(original, drug, rows, getContext());
    engine.prescriptionTransfer = (drug, regimen) => transferForContext(original, drug, regimen, getContext());
    engine.__rxContext = true;
  }

  function bindRouteButtons(holder = state.document.getElementById('rxRouteSegments')) {
    holder?.querySelectorAll('[data-context-route]').forEach(button => {
      button.addEventListener('click', () => {
        save({ ...getContext(), route:button.dataset.contextRoute });
      });
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...holder.querySelectorAll('[data-context-route]')];
        const current = buttons.indexOf(button);
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        const next = buttons[(current + direction + buttons.length) % buttons.length];
        next?.focus(); next?.click();
      });
    });
  }

  function bind() {
    state.document.querySelectorAll('[data-context-category]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const category = button.dataset.contextCategory;
        const defaultRoute = CATEGORIES[category]?.defaultRoute || '';
        changeContext({ ...getContext(), administrationCategory:category, route:defaultRoute }, 'rxRouteSegments', { allowWithOrders:true });
      });
    });
    state.document.getElementById('rxPediatricToggle')?.addEventListener('click', () => {
      const context = getContext();
      changeContext({ ...context, pediatric:!context.pediatric }, !context.pediatric ? 'rxPatientAge' : '');
    });
    state.document.getElementById('rxPatientAge')?.addEventListener('input', event => {
      save({ ...getContext(), ageValue:event.target.value }, { refresh:false }); schedulePayloadRefresh();
    });
    state.document.getElementById('rxPatientAgeUnit')?.addEventListener('change', event => {
      save({ ...getContext(), ageUnit:event.target.value }, { refresh:false }); schedulePayloadRefresh();
    });
    state.document.getElementById('rxPatientWeight')?.addEventListener('input', event => {
      save({ ...getContext(), weightKg:event.target.value }, { refresh:false }); schedulePayloadRefresh();
    });

    state.document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-drug-result]');
      if (!button) return;
      let drug = null;
      try { drug = JSON.parse(decodeURIComponent(button.dataset.drugResult || '')); } catch {}
      const inferred = drugAdministration(drug || {});
      if (!inferred.category) return;
      const active = getContext();
      const nextRoute = inferred.routes.length === 1
        ? inferred.routes[0]
        : (active.administrationCategory === inferred.category && inferred.routes.includes(active.route) ? active.route : '');
      if (active.administrationCategory !== inferred.category || active.route !== nextRoute) {
        save({ ...active, administrationCategory:inferred.category, route:nextRoute }, { refresh:false });
      }
    }, true);

    ['rxNew', 'rxClear'].forEach(id => state.document.getElementById(id)?.addEventListener('click', () => setTimeout(() => resetContext(), 0)));
    state.document.getElementById('rxSave')?.addEventListener('click', persistContextOnSavedPrescription);
    state.document.getElementById('rxSavedList')?.addEventListener('click', event => {
      const button = event.target.closest?.('[data-open-saved]');
      if (button) restoreContextForSavedPrescription(button.dataset.openSaved);
    }, true);
    const preview = state.document.getElementById('rxPreview');
    if (preview && typeof MutationObserver !== 'undefined') {
      state.previewObserver = new MutationObserver(renderPreviewContext);
      state.previewObserver.observe(preview, { childList:true, subtree:false });
    }
  }

  function init(documentRef, rootRef) {
    if (state.ready || !documentRef) return;
    state.ready = true; state.document = documentRef; state.root = rootRef; state.context = load();
    patchNotation(); createUi(); render(); fetchBridge(); engineBridge(); bind();
  }

  return {
    CATEGORIES, CATEGORY_ORDER, ROUTE_LABELS,
    normalizeRoute:Administration.normalizeRoute,
    routeTokens:Administration.routeTokens,
    normalizeContext, patientFromContext, validateContext, population, regimenAdministration, isParenteral,
    filterRegimens, decorateDosagePayload, decideForContext, transferForContext, drugAdministration,
    compatibleDrug, explicitParenteralRoutes, inferContextFromProtocol, contextSummary, contextKey,
    getContext, setContext, resetContext, refreshForContext:refreshPayloadForContext,
    contextEndpoint, loadForDrug, setProductConstraint, clearProductConstraint:() => setProductConstraint(null), init,
  };
});

(function (root, factory) {
  const api = factory(root?.MedIndexAdministrationRoutes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexPrescriptionInteractionFix = api;
  if (root?.document) {
    const run = () => api.init(root.document, root);
    root.document.readyState === 'loading'
      ? root.document.addEventListener('DOMContentLoaded', run, { once:true })
      : run();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Administration) {
  'use strict';

  if (!Administration && typeof require === 'function') {
    try { Administration = require('./administration-routes.js'); } catch {}
  }

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const CONTEXT_CONTROL = '[data-context-category],[data-context-route],#rxPediatricToggle';

  function hasSelectedDrug(documentRef) {
    return Boolean(documentRef?.querySelector?.('#rxSelectedDrugs .rx-order-card'));
  }

  function shouldTemporarilyReleaseComposer(documentRef, target) {
    if (!documentRef || !target?.closest?.(CONTEXT_CONTROL)) return false;
    if (hasSelectedDrug(documentRef)) return false;
    return Boolean(text(documentRef.getElementById('rxComposer')?.value));
  }

  function normalizeRegimensForContext(rows, context = {}) {
    if (!Administration || !Array.isArray(rows)) return Array.isArray(rows) ? rows : [];
    const category = Administration.normalizeCategory(context.administrationCategory || context.category);
    const route = Administration.normalizeRoute(context.route);
    if (!category || !route) return rows;

    return rows.map(regimen => {
      const inferred = Administration.inferAdministration({
        administrationCategory:regimen?.administrationCategory,
        allowedRoutes:regimen?.allowedRoutes,
        form:regimen?.form,
        route:regimen?.route,
      });
      const routes = Administration.routeTokens([
        regimen?.route,
        regimen?.allowedRoutes,
        inferred.routes,
      ].flat().filter(Boolean).join(' '));
      if (inferred.category !== category || !routes.includes(route)) return regimen;
      if (routes.length === 1 && routes[0] === route) return regimen;
      return {
        ...regimen,
        administrationCategory:category,
        allowedRoutes:[route],
        route,
      };
    });
  }

  function installComposerGuard(documentRef, rootRef) {
    if (!rootRef?.addEventListener || rootRef.__rxComposerContextGuard) return;
    rootRef.__rxComposerContextGuard = true;
    rootRef.addEventListener('click', event => {
      if (!shouldTemporarilyReleaseComposer(documentRef, event.target)) return;
      const composer = documentRef.getElementById('rxComposer');
      if (!composer) return;
      const snapshot = {
        value:composer.value,
        start:composer.selectionStart,
        end:composer.selectionEnd,
        scrollTop:composer.scrollTop,
      };
      composer.value = '';
      const restore = () => {
        if (composer.value !== '') return;
        composer.value = snapshot.value;
        composer.scrollTop = snapshot.scrollTop;
        try { composer.setSelectionRange(snapshot.start, snapshot.end); } catch {}
        try { composer.dispatchEvent(new Event('input', { bubbles:true })); } catch {}
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(restore);
      else Promise.resolve().then(restore);
    }, true);
  }

  function installContextCompatibility(rootRef) {
    const Context = rootRef?.MedIndexPrescriptionContext;
    const Engine = rootRef?.MedIndexDosageEngine;
    if (!Context || !Engine || Engine.__rxMultiRouteCompatibility) return;

    const previousDecideMatch = Engine.decideMatch.bind(Engine);
    Engine.decideMatch = (drug, rows) => previousDecideMatch(
      drug,
      normalizeRegimensForContext(rows, Context.getContext()),
    );
    Engine.__rxMultiRouteCompatibility = true;

    Context.filterRegimens = (rows, value) => {
      const context = Context.normalizeContext(value);
      const wantedPopulation = context.pediatric ? 'pediatric' : 'adult';
      return (Array.isArray(rows) ? rows : []).filter(regimen => {
        if (Context.population(regimen) !== wantedPopulation) return false;
        const administration = Context.regimenAdministration(regimen);
        if (administration.category !== context.administrationCategory) return false;
        const routes = Administration.routeTokens(regimen.route || administration.routes.join(' '));
        return routes.includes(context.route);
      });
    };
  }

  function init(documentRef, rootRef) {
    installComposerGuard(documentRef, rootRef);
    installContextCompatibility(rootRef);
  }

  return {
    hasSelectedDrug,
    shouldTemporarilyReleaseComposer,
    normalizeRegimensForContext,
    installComposerGuard,
    installContextCompatibility,
    init,
  };
});


(function bootstrapPrescriptionDiagnosisDocument(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexPrescriptionDocument = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createPrescriptionDiagnosisDocument() {
  'use strict';

  const VERSION = 'prescription-diagnosis-document-v1';
  const SECONDARY_DRAFT_KEY = 'medindex_rx_problem_list_draft_v1';
  const MAX_SECONDARY = 5;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const VALID_LEVELS = new Set(['category', 'subcategory']);
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let rootRef = null;
  let previewObserver = null;
  let printButtonObserver = null;
  let initialized = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 1000) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function normalizeContext(value, { allowManual = false, now = Date.now() } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = safeText(value.code, 24).toUpperCase();
    const level = safeText(value.level, 24).toLowerCase();
    const titleSq = safeText(value.titleSq || value.albanianDraft || value.title, 500);
    const titleEn = safeText(value.titleEn || value.englishTitle, 500);
    const selectedAt = Number(value.selectedAt || value.linkedAt || now);

    if (!code && allowManual && titleSq) {
      return { code:'', level:'text', titleSq, titleEn:'', display:titleSq, selectedAt:now, manual:true };
    }
    if (!CODE_PATTERN.test(code) || !VALID_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!Number.isFinite(selectedAt) || selectedAt <= 0 || selectedAt > now + 5 * 60 * 1000) return null;
    return {
      code,
      level,
      titleSq,
      titleEn,
      display:`${code} — ${titleSq || titleEn}`.slice(0, 1000),
      selectedAt,
      manual:false,
    };
  }

  function normalizeItems(values, { primaryCode = '', now = Date.now() } = {}) {
    const seen = new Set();
    const primary = safeText(primaryCode, 24).toUpperCase();
    const result = [];
    for (const raw of Array.isArray(values) ? values : []) {
      const item = normalizeContext(raw, { now });
      if (!item || item.code === primary || seen.has(item.code)) continue;
      seen.add(item.code);
      result.push(item);
      if (result.length >= MAX_SECONDARY) break;
    }
    return result;
  }

  function parseSecondaryDraft(raw, { primaryCode = '', now = Date.now(), maxAge = MAX_AGE_MS } = {}) {
    let payload = raw;
    if (typeof raw === 'string') {
      try { payload = JSON.parse(raw); }
      catch { return []; }
    }
    if (!payload || Number(payload.version) !== 1) return [];
    const savedAt = Number(payload.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now + 5 * 60 * 1000 || now - savedAt > maxAge) return [];
    return normalizeItems(payload.items, { primaryCode, now });
  }

  function buildModel({ primary = null, secondary = [], diagnosisText = '', now = Date.now() } = {}) {
    const structuredPrimary = normalizeContext(primary, { now });
    const manualPrimary = structuredPrimary ? null : normalizeContext({ title:diagnosisText }, { allowManual:true, now });
    const activePrimary = structuredPrimary || manualPrimary;
    return {
      version:1,
      primary:activePrimary,
      secondary:normalizeItems(secondary, { primaryCode:activePrimary?.code || '', now }),
    };
  }

  function diagnosisText(model) {
    const normalized = model && typeof model === 'object' ? model : { primary:null, secondary:[] };
    const lines = [];
    if (normalized.primary) {
      lines.push('Diagnoza kryesore:');
      lines.push(normalized.primary.display || normalized.primary.titleSq || normalized.primary.titleEn);
    }
    if (Array.isArray(normalized.secondary) && normalized.secondary.length) {
      if (lines.length) lines.push('');
      lines.push('Diagnozat shoqëruese:');
      normalized.secondary.forEach(item => lines.push(`- ${item.display || `${item.code} — ${item.titleSq || item.titleEn}`}`));
    }
    return lines.join('\n').trim();
  }

  function composeText(prescriptionText, model) {
    const prescription = String(prescriptionText || '').trim();
    const diagnoses = diagnosisText(model);
    return [diagnoses, prescription].filter(Boolean).join('\n\n').trim();
  }

  function currentPrimary(root) {
    const contextApi = root?.MedIndexPrescriptionIcdContext;
    return normalizeContext(contextApi?.current?.() || contextApi?.pending?.());
  }

  function currentSecondary(root, primaryCode = '') {
    const live = root?.MedIndexIcdProblemList?.current?.();
    if (Array.isArray(live)) return normalizeItems(live, { primaryCode });
    try {
      return parseSecondaryDraft(root.localStorage.getItem(SECONDARY_DRAFT_KEY), { primaryCode });
    } catch {
      return [];
    }
  }

  function currentModel(root = rootRef) {
    if (!root?.document) return buildModel();
    const primary = currentPrimary(root);
    const diagnosisInput = clean(root.document.getElementById('rxDiagnosis')?.value);
    const secondary = currentSecondary(root, primary?.code || '');
    return buildModel({ primary, secondary, diagnosisText:diagnosisInput });
  }

  function renderMarkup(model) {
    if (!model?.primary && !model?.secondary?.length) return '';
    const primary = model.primary ? `<div class="rx-document-diagnosis-primary">
      <span>Diagnoza kryesore</span>
      <strong>${esc(model.primary.display || model.primary.titleSq || model.primary.titleEn)}</strong>
    </div>` : '';
    const secondary = model.secondary?.length ? `<div class="rx-document-diagnosis-secondary">
      <span>Diagnozat shoqëruese</span>
      <ul>${model.secondary.map(item => `<li><strong>${esc(item.code)}</strong><span>${esc(item.titleSq || item.titleEn)}</span></li>`).join('')}</ul>
    </div>` : '';
    return `<section class="rx-document-diagnoses" aria-label="Diagnozat e recetës">${primary}${secondary}</section>`;
  }

  function decoratePreview() {
    const preview = rootRef?.document?.getElementById('rxPreview');
    const paper = preview?.querySelector('.rx-paper');
    const canonical = paper?.querySelector('.rx-canonical-preview');
    let host = rootRef?.document?.getElementById('rxDiagnosisDocument');
    if (!paper || !canonical) {
      host?.remove();
      return false;
    }
    const markup = renderMarkup(currentModel());
    if (!markup) {
      host?.remove();
      return false;
    }
    if (!host) {
      host = rootRef.document.createElement('div');
      host.id = 'rxDiagnosisDocument';
      host.className = 'rx-diagnosis-document-host';
      paper.insertBefore(host, canonical);
    }
    if (host.innerHTML !== markup) host.innerHTML = markup;
    return true;
  }

  function showToast(message) {
    const toast = rootRef?.document?.getElementById('rxToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    rootRef.setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function setStatus(message) {
    const status = rootRef?.document?.getElementById('rxStatus');
    if (status) status.textContent = message;
  }

  function canonicalText() {
    return String(rootRef?.document?.querySelector('#rxPreview .rx-canonical-preview')?.textContent || '').trim();
  }

  function currentText(prescriptionText = canonicalText()) {
    return composeText(prescriptionText, currentModel());
  }

  function fallbackCopy(value) {
    const area = rootRef.document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    rootRef.document.body.appendChild(area);
    area.select();
    rootRef.document.execCommand('copy');
    area.remove();
  }

  async function copyDocument(event) {
    const button = event.target.closest('#rxCopy');
    if (!button || button.disabled) return;
    const value = currentText();
    if (!value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { await rootRef.navigator.clipboard.writeText(value); }
    catch { fallbackCopy(value); }
    showToast('Receta me diagnozat u kopjua.');
  }

  function safeFilePart(value) {
    return clean(value).toLocaleLowerCase('sq')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  }

  function exportFileName(model = currentModel(), now = new Date()) {
    const primary = model?.primary;
    const suffix = safeFilePart(primary?.code || primary?.titleSq || 'pa-diagnoze') || 'pa-diagnoze';
    const date = now.toISOString().slice(0, 10);
    return `recete-${date}-${suffix}.txt`;
  }

  function exportDocument(event) {
    const button = event.target.closest('#rxExport');
    if (!button || button.disabled) return;
    const value = currentText();
    if (!value) return;
    event.preventDefault();
    const blob = new Blob([`\uFEFF${value}\n`], { type:'text/plain;charset=utf-8' });
    const url = rootRef.URL.createObjectURL(blob);
    const link = rootRef.document.createElement('a');
    link.href = url;
    link.download = exportFileName();
    link.hidden = true;
    rootRef.document.body.appendChild(link);
    link.click();
    link.remove();
    rootRef.setTimeout(() => rootRef.URL.revokeObjectURL(url), 0);
    showToast('Receta me diagnozat u eksportua.');
    setStatus('Dokumenti TXT përmban vetëm diagnozat dhe përmbajtjen klinike të recetës.');
  }

  function ensureExportButton() {
    const actions = rootRef?.document?.querySelector('.rx-preview-actions');
    const print = rootRef?.document?.getElementById('rxPrint');
    if (!actions || !print) return null;
    let button = rootRef.document.getElementById('rxExport');
    if (!button) {
      button = rootRef.document.createElement('button');
      button.id = 'rxExport';
      button.type = 'button';
      button.className = 'rx-secondary';
      button.textContent = 'Eksporto TXT';
      button.disabled = print.disabled;
      actions.insertBefore(button, print);
    }
    return button;
  }

  function syncExportState() {
    const print = rootRef?.document?.getElementById('rxPrint');
    const exportButton = ensureExportButton();
    if (print && exportButton) exportButton.disabled = print.disabled;
  }

  function installObservers() {
    const preview = rootRef.document.getElementById('rxPreview');
    if (preview && !previewObserver) {
      previewObserver = new rootRef.MutationObserver(() => rootRef.requestAnimationFrame(decoratePreview));
      previewObserver.observe(preview, { childList:true, subtree:true });
    }
    const print = rootRef.document.getElementById('rxPrint');
    if (print && !printButtonObserver) {
      printButtonObserver = new rootRef.MutationObserver(syncExportState);
      printButtonObserver.observe(print, { attributes:true, attributeFilter:['disabled'] });
    }
  }

  function refresh() {
    decoratePreview();
    syncExportState();
    rootRef?.dispatchEvent(new rootRef.CustomEvent('medindex:prescription-document-updated', {
      detail:{ version:VERSION, model:currentModel() },
    }));
  }

  function init(root) {
    if (initialized || !root?.document) return false;
    const page = clean(root.document.documentElement.dataset.miPage).toLowerCase();
    const path = clean(root.location?.pathname).toLowerCase();
    if (page !== 'recetat' && !path.endsWith('/recetat.html') && !root.document.getElementById('rxPreview')) return false;
    initialized = true;
    rootRef = root;
    ensureExportButton();
    installObservers();
    refresh();

    root.document.addEventListener('click', event => {
      if (event.target.closest('#rxCopy')) void copyDocument(event);
      if (event.target.closest('#rxExport')) exportDocument(event);
    }, true);
    root.document.getElementById('rxDiagnosis')?.addEventListener('input', () => root.requestAnimationFrame(refresh));
    ['medindex:prescription-icd-context', 'medindex:prescription-context-ready', 'medindex:icd-problem-list'].forEach(name => {
      root.addEventListener(name, () => root.requestAnimationFrame(refresh));
    });

    root.document.documentElement.dataset.miPrescriptionDiagnosisDocument = VERSION;
    root.dispatchEvent(new root.CustomEvent('medindex:prescription-diagnosis-document-ready', {
      detail:{ version:VERSION, model:currentModel() },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    SECONDARY_DRAFT_KEY,
    MAX_SECONDARY,
    MAX_AGE_MS,
    normalizeContext,
    normalizeItems,
    parseSecondaryDraft,
    buildModel,
    diagnosisText,
    composeText,
    renderMarkup,
    exportFileName,
    currentModel,
    currentText,
    refresh,
    init,
  });
});


(function bootstrapIcdProblemList(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexIcdProblemList = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createIcdProblemList() {
  'use strict';

  const VERSION = 'icd-problem-list-v1';
  const HANDOFF_KEY = 'medindex_rx_secondary_diagnosis_context_v1';
  const DRAFT_KEY = 'medindex_rx_problem_list_draft_v1';
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const RECENT_KEY = 'medindex_icd_recent_diagnoses_v1';
  const MAX_ITEMS = 5;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const VALID_LEVELS = new Set(['category', 'subcategory']);
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let rootRef = null;
  let items = [];
  let detailObserver = null;
  let recentObserver = null;
  let savedObserver = null;
  let initialized = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function normalizeContext(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = safeText(value.code, 24).toUpperCase();
    const level = safeText(value.level, 24).toLowerCase();
    const titleSq = safeText(value.titleSq || value.albanianDraft, 500);
    const titleEn = safeText(value.titleEn || value.englishTitle, 500);
    const selectedAt = Number(value.selectedAt || value.linkedAt || now);
    if (!CODE_PATTERN.test(code) || !VALID_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!Number.isFinite(selectedAt) || selectedAt <= 0 || selectedAt > now + 5 * 60 * 1000) return null;
    return {
      version:2,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code,
      level,
      titleSq,
      titleEn,
      display:`${code} — ${titleSq || titleEn}`.slice(0, 1000),
      translationStatus:safeText(value.translationStatus, 40),
      childCount:Math.max(0, Math.min(9999, Number(value.childCount || 0))),
      selectedAt,
    };
  }

  function normalizeItems(values, { primaryCode = '', now = Date.now() } = {}) {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    const primary = safeText(primaryCode, 24).toUpperCase();
    const normalized = [];
    for (const raw of source) {
      const item = normalizeContext(raw, now);
      if (!item || item.code === primary || seen.has(item.code)) continue;
      seen.add(item.code);
      normalized.push(item);
      if (normalized.length >= MAX_ITEMS) break;
    }
    return normalized;
  }

  function addItem(values, value, options = {}) {
    const item = normalizeContext(value, options.now || Date.now());
    if (!item) return normalizeItems(values, options);
    return normalizeItems([item, ...(Array.isArray(values) ? values : [])], options);
  }

  function removeItem(values, code, options = {}) {
    const target = safeText(code, 24).toUpperCase();
    return normalizeItems((Array.isArray(values) ? values : []).filter(item => safeText(item?.code, 24).toUpperCase() !== target), options);
  }

  function serialize(values, now = Date.now()) {
    return JSON.stringify({
      version:1,
      savedAt:now,
      items:normalizeItems(values, { now }),
    });
  }

  function parse(raw, { primaryCode = '', now = Date.now(), maxAge = MAX_AGE_MS } = {}) {
    let payload = raw;
    if (typeof raw === 'string') {
      try { payload = JSON.parse(raw); }
      catch { return []; }
    }
    if (!payload || Number(payload.version) !== 1) return [];
    const savedAt = Number(payload.savedAt);
    if (!Number.isFinite(savedAt) || savedAt > now + 5 * 60 * 1000 || now - savedAt > maxAge) return [];
    return normalizeItems(payload.items, { primaryCode, now });
  }

  function primaryContext() {
    return normalizeContext(rootRef?.MedIndexPrescriptionIcdContext?.current?.());
  }

  function primaryCode() {
    return primaryContext()?.code || '';
  }

  function readDraft() {
    try {
      return parse(rootRef.localStorage.getItem(DRAFT_KEY), { primaryCode:primaryCode() });
    } catch {
      return [];
    }
  }

  function writeDraft() {
    try {
      if (items.length) rootRef.localStorage.setItem(DRAFT_KEY, serialize(items));
      else rootRef.localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  function readHandoff() {
    try {
      const raw = rootRef.sessionStorage.getItem(HANDOFF_KEY);
      rootRef.sessionStorage.removeItem(HANDOFF_KEY);
      return normalizeContext(raw ? JSON.parse(raw) : null);
    } catch {
      try { rootRef.sessionStorage.removeItem(HANDOFF_KEY); } catch {}
      return null;
    }
  }

  function saveHandoff(context) {
    try {
      rootRef.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(normalizeContext(context)));
      return true;
    } catch {
      return false;
    }
  }

  function readSaved() {
    try {
      const value = JSON.parse(rootRef.localStorage.getItem(SAVED_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeSaved(values) {
    try { rootRef.localStorage.setItem(SAVED_KEY, JSON.stringify(values)); } catch {}
  }

  function currentSavedCandidate(values) {
    const diagnosis = clean(rootRef.document.getElementById('rxDiagnosis')?.value);
    const composer = String(rootRef.document.getElementById('rxComposer')?.value || '');
    return values
      .filter(item => clean(item?.indication) === diagnosis && String(item?.sourceText || '') === composer)
      .sort((left, right) => Date.parse(right?.updatedAt || 0) - Date.parse(left?.updatedAt || 0))[0] || null;
  }

  function serializableList(values = items) {
    return {
      version:1,
      updatedAt:Date.now(),
      items:normalizeItems(values, { primaryCode:primaryCode() }),
    };
  }

  function persistSaved() {
    const saved = readSaved();
    const candidate = currentSavedCandidate(saved);
    if (!candidate) return false;
    const normalized = normalizeItems(items, { primaryCode:primaryCode() });
    if (normalized.length) candidate.secondaryDiagnosisCoding = serializableList(normalized);
    else delete candidate.secondaryDiagnosisCoding;
    writeSaved(saved);
    decorateSavedCards();
    return true;
  }

  function restoreSaved(id) {
    const protocol = readSaved().find(item => String(item?.id) === String(id));
    const payload = protocol?.secondaryDiagnosisCoding;
    items = payload && Number(payload.version) === 1
      ? normalizeItems(payload.items, { primaryCode:primaryCode() })
      : [];
    writeDraft();
    render();
  }

  function levelLabel(level) {
    return level === 'subcategory' ? 'Nënkategori' : 'Kategori';
  }

  function icdHref(code) {
    const url = new URL('/icd.html', rootRef.location.origin);
    url.searchParams.set('code', code);
    url.searchParams.set('return', 'recetat');
    return `${url.pathname}${url.search}`;
  }

  function ensureHost() {
    let host = rootRef.document.getElementById('rxIcdProblemList');
    if (host) return host;
    const anchor = rootRef.document.getElementById('rxIcdContext')
      || rootRef.document.getElementById('rxDiagnosis')?.closest('.rx-diagnosis');
    if (!anchor) return null;
    host = rootRef.document.createElement('section');
    host.id = 'rxIcdProblemList';
    host.className = 'rx-icd-problem-list';
    host.hidden = true;
    host.setAttribute('aria-labelledby', 'rxIcdProblemListTitle');
    anchor.insertAdjacentElement('afterend', host);
    return host;
  }

  function announce(message) {
    const status = rootRef.document.getElementById('rxStatus');
    if (status) status.textContent = message;
  }

  function emit(reason) {
    rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-problem-list', {
      detail:{ version:VERSION, reason, items:[...items], count:items.length },
    }));
  }

  function setItems(next, reason = 'updated') {
    items = normalizeItems(next, { primaryCode:primaryCode() });
    writeDraft();
    render();
    emit(reason);
    return items;
  }

  function render() {
    const host = ensureHost();
    if (!host) return;
    items = normalizeItems(items, { primaryCode:primaryCode() });
    host.hidden = !items.length;
    host.innerHTML = items.length ? `<header class="rx-icd-problem-head">
      <div><strong id="rxIcdProblemListTitle">Diagnozat shoqëruese</strong><span>Maksimum ${MAX_ITEMS}; aplikohen vetëm me zgjedhjen e mjekut.</span></div>
      <button type="button" data-mi-problem-clear>Pastro</button>
    </header>
    <div class="rx-icd-problem-items" role="list">${items.map(item => `<article class="rx-icd-problem-item" role="listitem" data-problem-code="${esc(item.code)}">
      <span class="rx-icd-problem-code">${esc(item.code)}</span>
      <span class="rx-icd-problem-copy"><strong>${esc(item.titleSq || item.titleEn)}</strong><small>${esc(levelLabel(item.level))} · diagnozë shoqëruese</small></span>
      <span class="rx-icd-problem-actions">
        <button type="button" data-mi-problem-promote="${esc(item.code)}">Bëje kryesore</button>
        <a href="${esc(icdHref(item.code))}" data-mi-open-icd="${esc(item.code)}">Hape</a>
        <button type="button" data-mi-problem-remove="${esc(item.code)}" aria-label="Hiqe ${esc(item.code)}">Hiqe</button>
      </span>
    </article>`).join('')}</div>` : '';
  }

  function addSecondary(context, reason = 'added') {
    const normalized = normalizeContext(context);
    if (!normalized) return false;
    if (normalized.code === primaryCode()) {
      announce(`${normalized.code} është tashmë diagnoza kryesore.`);
      return false;
    }
    const existed = items.some(item => item.code === normalized.code);
    const before = items.length;
    setItems(addItem(items, normalized, { primaryCode:primaryCode() }), reason);
    if (existed) announce(`${normalized.code} ishte tashmë në diagnozat shoqëruese.`);
    else if (before >= MAX_ITEMS && items.length === MAX_ITEMS) announce(`U ruajtën maksimum ${MAX_ITEMS} diagnoza shoqëruese; kodi më i vjetër u largua.`);
    else announce(`${normalized.code} u shtua si diagnozë shoqëruese.`);
    return true;
  }

  function promote(code) {
    const context = items.find(item => item.code === code);
    const api = rootRef.MedIndexPrescriptionIcdContext;
    if (!context || typeof api?.apply !== 'function') return false;
    const oldPrimary = primaryContext();
    if (!api.apply(context)) return false;
    let next = removeItem(items, context.code);
    if (oldPrimary && oldPrimary.code !== context.code) next = addItem(next, oldPrimary, { primaryCode:context.code });
    setItems(next, 'promoted');
    announce(`${context.code} u bë diagnoza kryesore.`);
    return true;
  }

  function readRecent() {
    try {
      const raw = JSON.parse(rootRef.localStorage.getItem(RECENT_KEY) || '[]');
      const now = Date.now();
      return normalizeItems(
        (Array.isArray(raw) ? raw : []).filter(item => now - Number(item?.selectedAt || item?.linkedAt || 0) <= 180 * 24 * 60 * 60 * 1000),
        { primaryCode:primaryCode(), now },
      );
    } catch {
      return [];
    }
  }

  function decorateRecent() {
    const host = rootRef.document.getElementById('rxIcdRecent');
    if (!host) return;
    const recent = readRecent();
    host.querySelectorAll('[data-mi-icd-recent-apply]').forEach(button => {
      const index = Number(button.dataset.miIcdRecentApply);
      const item = recent[index];
      const article = button.closest('.rx-icd-recent-item');
      if (!item || !article || article.querySelector('[data-mi-recent-secondary]')) return;
      const add = rootRef.document.createElement('button');
      add.type = 'button';
      add.className = 'rx-icd-recent-secondary';
      add.dataset.miRecentSecondary = item.code;
      add.textContent = 'Shoqëruese';
      add.setAttribute('aria-label', `Shto ${item.code} si diagnozë shoqëruese`);
      article.appendChild(add);
    });
  }

  function decorateSavedCards() {
    const list = rootRef.document.getElementById('rxSavedList');
    if (!list) return;
    const byId = new Map(readSaved().map(item => [String(item?.id), item]));
    list.querySelectorAll('[data-open-saved]').forEach(button => {
      const card = button.closest('.rx-saved-card');
      const tags = card?.querySelector('.rx-saved-tags');
      const protocol = byId.get(String(button.dataset.openSaved));
      const count = normalizeItems(protocol?.secondaryDiagnosisCoding?.items).length;
      let badge = tags?.querySelector('.rx-icd-problem-saved-badge');
      if (!count) {
        badge?.remove();
        return;
      }
      if (!badge && tags) {
        badge = rootRef.document.createElement('span');
        badge.className = 'rx-icd-problem-saved-badge';
        tags.appendChild(badge);
      }
      if (badge) {
        badge.textContent = `+${count} ICD`;
        badge.title = `${count} diagnoza shoqëruese ICD-10`;
      }
    });
  }

  function bindPrescription() {
    rootRef.addEventListener('medindex:prescription-icd-context', () => setItems(items, 'primary-changed'));
    rootRef.addEventListener('medindex:prescription-context-ready', () => {
      setItems(items, 'primary-ready');
      decorateRecent();
      decorateSavedCards();
    });

    rootRef.document.addEventListener('click', event => {
      const remove = event.target.closest('[data-mi-problem-remove]');
      const promoteButton = event.target.closest('[data-mi-problem-promote]');
      const clear = event.target.closest('[data-mi-problem-clear]');
      const recent = event.target.closest('[data-mi-recent-secondary]');
      const openSaved = event.target.closest('[data-open-saved]');
      if (remove) {
        setItems(removeItem(items, remove.dataset.miProblemRemove), 'removed');
        announce(`${remove.dataset.miProblemRemove} u hoq nga diagnozat shoqëruese.`);
      }
      if (promoteButton) promote(promoteButton.dataset.miProblemPromote);
      if (clear) {
        setItems([], 'cleared');
        announce('Diagnozat shoqëruese u pastruan.');
      }
      if (recent) {
        const context = readRecent().find(item => item.code === recent.dataset.miRecentSecondary);
        if (context) addSecondary(context, 'recent-added');
      }
      if (event.target.closest('#rxSave')) rootRef.setTimeout(persistSaved, 0);
      if (openSaved) rootRef.setTimeout(() => restoreSaved(openSaved.dataset.openSaved), 0);
      if (event.target.closest('#rxClear,#rxNew')) rootRef.setTimeout(() => setItems([], 'new-prescription'), 0);
    });

    const recentHost = rootRef.document.getElementById('rxIcdRecent');
    if (recentHost && !recentObserver) {
      recentObserver = new rootRef.MutationObserver(() => rootRef.requestAnimationFrame(decorateRecent));
      recentObserver.observe(recentHost, { childList:true, subtree:true });
    }
    const savedList = rootRef.document.getElementById('rxSavedList');
    if (savedList && !savedObserver) {
      savedObserver = new rootRef.MutationObserver(() => rootRef.requestAnimationFrame(decorateSavedCards));
      savedObserver.observe(savedList, { childList:true, subtree:true });
    }
  }

  async function resolveContext(code) {
    const response = await rootRef.fetch(`/api/icd?view=resolve&code=${encodeURIComponent(code)}`, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) throw new Error(`ICD API ${response.status}`);
    const payload = await response.json();
    return normalizeContext(payload?.data?.node);
  }

  function activeDetailCode() {
    const match = clean(rootRef.document.getElementById('detailKicker')?.textContent).match(/·\s*([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?)$/);
    return match?.[1] || '';
  }

  function decorateDetail() {
    const actions = rootRef.document.querySelector('#detailOverlay .icd-detail-actions');
    const primaryButton = rootRef.document.getElementById('icdUseDiagnosis');
    if (!actions || !primaryButton) return;
    let button = rootRef.document.getElementById('icdAddSecondaryDiagnosis');
    const usable = !primaryButton.hidden && Boolean(activeDetailCode());
    if (!button) {
      button = rootRef.document.createElement('button');
      button.id = 'icdAddSecondaryDiagnosis';
      button.type = 'button';
      button.className = 'icd-add-secondary-diagnosis';
      button.textContent = 'Shto si shoqëruese';
      actions.insertBefore(button, primaryButton);
      button.addEventListener('click', async () => {
        const code = activeDetailCode();
        if (!code) return;
        button.disabled = true;
        try {
          const context = await resolveContext(code);
          if (!context || !saveHandoff(context)) throw new Error('Kodi nuk u përgatit.');
          const status = rootRef.document.getElementById('detailActionStatus');
          if (status) status.textContent = `${context.code} u përgatit si diagnozë shoqëruese.`;
          rootRef.location.assign('/recetat.html?from=icd-secondary');
        } catch (error) {
          const status = rootRef.document.getElementById('detailActionStatus');
          if (status) status.textContent = error?.message || 'Kodi nuk u shtua.';
          button.disabled = false;
        }
      });
    }
    const nextHidden = !usable;
    if (button.hidden !== nextHidden) button.hidden = nextHidden;
  }

  function bindIcd() {
    const overlay = rootRef.document.getElementById('detailOverlay');
    if (overlay && !detailObserver) {
      detailObserver = new rootRef.MutationObserver(decorateDetail);
      detailObserver.observe(overlay, {
        attributes:true,
        attributeFilter:['hidden', 'aria-hidden'],
        childList:true,
        subtree:true,
      });
    }
    rootRef.addEventListener('medindex:icd-detail-ready', decorateDetail);
    decorateDetail();
  }

  function initPrescription() {
    items = readDraft();
    const handoff = readHandoff();
    if (handoff) items = addItem(items, handoff, { primaryCode:primaryCode() });
    bindPrescription();
    render();
    decorateRecent();
    decorateSavedCards();
    writeDraft();
    if (handoff) announce(`${handoff.code} u shtua si diagnozë shoqëruese.`);
  }

  function init(root) {
    if (initialized || !root?.document) return false;
    rootRef = root;
    const pageName = clean(root.document.documentElement.dataset.miPage).toLowerCase();
    const pathname = String(root.location?.pathname || '').toLowerCase();
    const prescription = pageName === 'recetat'
      || /\/recetat(?:\.html)?$/.test(pathname)
      || Boolean(root.document.getElementById('rxDiagnosis') || root.document.getElementById('rxComposer'));
    const icd = pageName === 'icd'
      || /\/icd(?:\.html)?$/.test(pathname)
      || Boolean(root.document.getElementById('icdContent'));
    if (!prescription && !icd) return false;
    initialized = true;
    if (prescription) initPrescription();
    if (icd) bindIcd();
    root.document.documentElement.dataset.miIcdProblemList = VERSION;
    root.dispatchEvent(new root.CustomEvent('medindex:icd-problem-list-ready', {
      detail:{ version:VERSION, page:prescription ? 'prescription' : 'icd', maxItems:MAX_ITEMS },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    HANDOFF_KEY,
    DRAFT_KEY,
    MAX_ITEMS,
    MAX_AGE_MS,
    normalizeContext,
    normalizeItems,
    addItem,
    removeItem,
    serialize,
    parse,
    init,
  });
});


(() => {
  'use strict';

  const DRAFT_KEY = 'medindex_rx_autodraft_v1';
  const DIAGNOSIS_CONTEXT_KEY = 'medindex_rx_diagnosis_context_v2';
  const LEGACY_DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1';
  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const BRIDGE_VERSION = 'icd-context-v2';
  const CONTEXT_VERSION = 2;
  const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const CONTEXT_MAX_AGE = 30 * 60 * 1000;
  const MAX_DRAFT_CHARS = 20000;
  const MAX_SELECTION_ITEMS = 50;
  const PRESCRIBABLE_LEVELS = new Set(['category', 'subcategory']);
  const ICD_CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let reconciled = false;
  let activeContext = null;
  let pendingContext = null;
  let savedObserver = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function ensureStyles() { return true; }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(clean(value));
      return url.protocol === 'https:' && url.hostname === 'icd.who.int' ? url.href : '';
    } catch {
      return '';
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  function readDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || draft.version !== 1) return null;
      const savedAt = Number(draft.savedAt);
      const composer = String(draft.composer ?? '');
      const diagnosis = String(draft.diagnosis ?? '');
      if (!Number.isFinite(savedAt) || savedAt > Date.now() + 5 * 60 * 1000 || Date.now() - savedAt > DRAFT_MAX_AGE) {
        clearDraft();
        return null;
      }
      if (composer.length > MAX_DRAFT_CHARS || diagnosis.length > 1000) {
        clearDraft();
        return null;
      }
      return { ...draft, composer, diagnosis };
    } catch {
      clearDraft();
      return null;
    }
  }

  function normalizeDiagnosisContext(value, { allowHistorical = false } = {}) {
    let raw = value;
    if (typeof raw === 'string') {
      const text = safeText(raw, 5000);
      if (!text) return null;
      try { raw = JSON.parse(text); }
      catch { return { version:1, legacy:true, display:safeText(text, 1000) }; }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (Number(raw.version) !== CONTEXT_VERSION) return null;
    const code = safeText(raw.code, 24).toUpperCase();
    const level = safeText(raw.level, 24).toLowerCase();
    const titleSq = safeText(raw.titleSq, 500);
    const titleEn = safeText(raw.titleEn, 500);
    const selectedAt = Number(raw.selectedAt);
    if (!ICD_CODE_PATTERN.test(code) || !PRESCRIBABLE_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!allowHistorical) {
      if (!Number.isFinite(selectedAt) || selectedAt > Date.now() + 5 * 60 * 1000 || Date.now() - selectedAt > CONTEXT_MAX_AGE) return null;
    }
    const display = `${code} — ${titleSq || titleEn}`.slice(0, 1000);
    return Object.freeze({
      version:CONTEXT_VERSION,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code,
      level,
      titleSq,
      titleEn,
      display,
      translationStatus:safeText(raw.translationStatus, 40),
      sourceUrl:safeHttpsUrl(raw.sourceUrl),
      childCount:Math.max(0, Math.min(9999, Number(raw.childCount || 0))),
      selectedAt:Number.isFinite(selectedAt) ? selectedAt : Date.now(),
    });
  }

  function readPendingDiagnosis() {
    try {
      const structured = sessionStorage.getItem(DIAGNOSIS_CONTEXT_KEY);
      const legacy = structured ? '' : sessionStorage.getItem(LEGACY_DIAGNOSIS_KEY);
      sessionStorage.removeItem(DIAGNOSIS_CONTEXT_KEY);
      sessionStorage.removeItem(LEGACY_DIAGNOSIS_KEY);
      return normalizeDiagnosisContext(structured || legacy);
    } catch {
      return null;
    }
  }

  function normalizeTransferredDrug(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const substance = safeText(item.substance || item['Substanca aktive'], 240);
    if (!substance) return null;
    const tradeName = safeText(item.tradeName || item['Emri tregtar'], 240);
    const strength = safeText(item.strength || item['Fortësia'], 120);
    const form = safeText(item.form || item['Forma farmaceutike'], 120);
    const key = safeText(item.key, 500) || [substance, tradeName, strength, form].join('|');
    return {
      ...item,
      key,
      substance,
      tradeName,
      strength,
      form,
      dosageStatus:item.regimenId ? safeText(item.dosageStatus, 40) || 'requires-review' : 'requires-review',
      verificationStatus:safeText(item.verificationStatus, 80) || 'transferred-for-clinical-review',
      transferredAt:new Date().toISOString(),
    };
  }

  function prepareTransferredSelection() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]');
      if (!Array.isArray(raw)) {
        sessionStorage.removeItem(SELECTION_KEY);
        return;
      }
      const seen = new Set();
      const normalized = raw.slice(0, MAX_SELECTION_ITEMS).map(normalizeTransferredDrug).filter(item => {
        if (!item || seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
      if (normalized.length) sessionStorage.setItem(SELECTION_KEY, JSON.stringify(normalized));
      else sessionStorage.removeItem(SELECTION_KEY);
    } catch {
      try { sessionStorage.removeItem(SELECTION_KEY); } catch {}
    }
  }

  function dispatchInput(node) {
    node?.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function ensureContextHost() {
    let host = document.getElementById('rxIcdContext');
    if (host) return host;
    const diagnosis = document.getElementById('rxDiagnosis');
    const label = diagnosis?.closest('.rx-diagnosis') || diagnosis?.parentElement;
    if (!diagnosis || !label) return null;
    host = document.createElement('div');
    host.id = 'rxIcdContext';
    host.className = 'rx-icd-context';
    host.hidden = true;
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    label.insertAdjacentElement('afterend', host);
    return host;
  }

  function levelLabel(level) {
    return level === 'subcategory' ? 'Nënkategori' : level === 'category' ? 'Kategori' : level;
  }

  function renderContext(context, { pending = false } = {}) {
    const host = ensureContextHost();
    const diagnosisLabel = document.getElementById('rxDiagnosis')?.closest('.rx-diagnosis');
    if (!host || !context || context.legacy) {
      if (host) { host.hidden = true; host.innerHTML = ''; host.className = 'rx-icd-context'; }
      diagnosisLabel?.classList.remove('has-icd-context');
      return;
    }
    const specificity = context.childCount > 0 ? ` · ${context.childCount} nënkode direkte` : ' · pa nënkode direkte';
    const translation = context.translationStatus === 'standardized' ? 'term i standardizuar'
      : context.translationStatus === 'verified' ? 'term i verifikuar'
        : context.translationStatus === 'missing' ? 'pa përkthim shqip' : 'draft terminologjik';
    host.className = `rx-icd-context${pending ? ' is-pending' : ''}`;
    host.hidden = false;
    host.innerHTML = `<span class="rx-icd-code">${esc(context.code)}</span>
      <span class="rx-icd-copy"><strong>${esc(context.titleSq || context.titleEn)}</strong><small>${pending ? 'Kodi pret konfirmim; diagnoza ekzistuese nuk u mbishkrua.' : `${esc(levelLabel(context.level))} · ${esc(translation)}${esc(specificity)}`}</small></span>
      <span class="rx-icd-actions">
        ${context.sourceUrl ? `<a href="${esc(context.sourceUrl)}" target="_blank" rel="noopener noreferrer">WHO</a>` : ''}
        ${pending ? '<button class="is-primary" type="button" data-icd-context-apply>Apliko kodin</button>' : ''}
        <button type="button" data-icd-context-clear>${pending ? 'Mos e apliko' : 'Hiqe lidhjen'}</button>
      </span>`;
    diagnosisLabel?.classList.toggle('has-icd-context', !pending);
  }

  function emitContext(reason = '') {
    window.dispatchEvent(new CustomEvent('medindex:prescription-icd-context', {
      detail:{ context:activeContext, pending:pendingContext, reason },
    }));
  }

  function clearContext(reason = 'cleared') {
    activeContext = null;
    pendingContext = null;
    renderContext(null);
    emitContext(reason);
  }

  function applyContext(context, { force = false, announce = true } = {}) {
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!diagnosis || !context) return false;
    if (context.legacy) {
      if (!clean(diagnosis.value) || force) {
        diagnosis.value = context.display;
        dispatchInput(diagnosis);
        return true;
      }
      return false;
    }
    const existing = clean(diagnosis.value);
    if (existing && existing !== context.display && !force) {
      pendingContext = context;
      activeContext = null;
      renderContext(context, { pending:true });
      emitContext('conflict');
      return false;
    }
    activeContext = context;
    pendingContext = null;
    diagnosis.value = context.display;
    renderContext(context);
    dispatchInput(diagnosis);
    if (announce) {
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = 'Kodi ICD-10 u aplikua me metadata dhe burim. Kontrolloje para ruajtjes.';
    }
    emitContext('applied');
    return true;
  }

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeSaved(items) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(items)); } catch {}
  }

  function currentSavedCandidate(items) {
    const diagnosis = clean(document.getElementById('rxDiagnosis')?.value);
    const composer = String(document.getElementById('rxComposer')?.value || '');
    return items
      .filter(item => clean(item?.indication) === diagnosis && String(item?.sourceText || '') === composer)
      .sort((a, b) => Date.parse(b?.updatedAt || 0) - Date.parse(a?.updatedAt || 0))[0] || null;
  }

  function serializableContext(context) {
    if (!context || context.legacy) return null;
    return {
      version:CONTEXT_VERSION,
      system:context.system,
      source:context.source,
      code:context.code,
      level:context.level,
      titleSq:context.titleSq,
      titleEn:context.titleEn,
      display:context.display,
      translationStatus:context.translationStatus,
      sourceUrl:context.sourceUrl,
      childCount:context.childCount,
      selectedAt:context.selectedAt,
      linkedAt:Date.now(),
    };
  }

  function persistContextAfterSave() {
    const items = readSaved();
    const candidate = currentSavedCandidate(items);
    if (!candidate) return false;
    const diagnosis = clean(document.getElementById('rxDiagnosis')?.value);
    if (activeContext && diagnosis === activeContext.display) candidate.diagnosisCoding = serializableContext(activeContext);
    else delete candidate.diagnosisCoding;
    writeSaved(items);
    decorateSavedCards();
    return true;
  }

  function restoreSavedContext(id) {
    const protocol = readSaved().find(item => String(item?.id) === String(id));
    const context = normalizeDiagnosisContext(protocol?.diagnosisCoding, { allowHistorical:true });
    const diagnosis = clean(document.getElementById('rxDiagnosis')?.value);
    if (context && diagnosis === context.display) applyContext(context, { force:true, announce:false });
    else clearContext('saved-without-context');
  }

  function decorateSavedCards() {
    const list = document.getElementById('rxSavedList');
    if (!list) return;
    const byId = new Map(readSaved().map(item => [String(item?.id), item]));
    list.querySelectorAll('[data-open-saved]').forEach(button => {
      const card = button.closest('.rx-saved-card');
      const tags = card?.querySelector('.rx-saved-tags');
      const protocol = byId.get(String(button.dataset.openSaved));
      const context = normalizeDiagnosisContext(protocol?.diagnosisCoding, { allowHistorical:true });
      let badge = tags?.querySelector('.rx-icd-saved-badge');
      if (!context) { badge?.remove(); return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'rx-icd-saved-badge';
        tags?.appendChild(badge);
      }
      badge.textContent = context.code;
      badge.title = `${context.code} — ${context.titleSq || context.titleEn}`;
    });
  }

  function installSavedObserver() {
    const list = document.getElementById('rxSavedList');
    if (!list || savedObserver) return;
    savedObserver = new MutationObserver(() => requestAnimationFrame(decorateSavedCards));
    savedObserver.observe(list, { childList:true, subtree:true });
    decorateSavedCards();
  }

  function reconcilePrescriptionContext() {
    if (reconciled || !/\/recetat\.html$/.test(location.pathname)) return false;
    const composer = document.getElementById('rxComposer');
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!composer || !diagnosis) return false;

    ensureStyles();
    ensureContextHost();
    installSavedObserver();
    const draft = readDraft();
    const pendingDiagnosis = readPendingDiagnosis();
    let restored = false;

    if (!clean(composer.value) && clean(draft?.composer)) {
      composer.value = draft.composer;
      dispatchInput(composer);
      restored = true;
    }

    if (!clean(diagnosis.value) && clean(draft?.diagnosis)) {
      diagnosis.value = draft.diagnosis;
      dispatchInput(diagnosis);
      restored = true;
    }

    if (pendingDiagnosis) {
      const applied = applyContext(pendingDiagnosis, { force:false, announce:false });
      restored ||= applied;
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = applied
        ? 'Drafti u rikthye dhe kodi ICD-10 u aplikua. Kontrolloje para ruajtjes.'
        : 'Diagnoza ekzistuese u ruajt. Kodi ICD-10 pret konfirmimin tënd.';
    } else if (restored) {
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = 'Drafti i fundit u rikthye automatikisht. Kontrolloje para ruajtjes.';
    }

    diagnosis.addEventListener('input', () => {
      if (activeContext && clean(diagnosis.value) !== activeContext.display) clearContext('manual-edit');
    });

    document.addEventListener('click', event => {
      const apply = event.target.closest('[data-icd-context-apply]');
      const clear = event.target.closest('[data-icd-context-clear]');
      const openSaved = event.target.closest('[data-open-saved]');
      if (apply && pendingContext) applyContext(pendingContext, { force:true });
      if (clear) clearContext('user-cleared');
      if (event.target.closest('#rxSave')) setTimeout(persistContextAfterSave, 0);
      if (openSaved) setTimeout(() => restoreSavedContext(openSaved.dataset.openSaved), 0);
      if (event.target.closest('#rxClear,#rxNew')) setTimeout(() => {
        if (!clean(diagnosis.value)) clearContext('new-prescription');
      }, 0);
    });

    reconciled = true;
    window.MedIndexPrescriptionIcdContext = Object.freeze({
      version:BRIDGE_VERSION,
      current:() => activeContext,
      pending:() => pendingContext,
      normalize:normalizeDiagnosisContext,
      apply:context => applyContext(normalizeDiagnosisContext(context, { allowHistorical:true }), { force:true }),
      clear:clearContext,
      persist:persistContextAfterSave,
    });
    document.documentElement.dataset.miPrescriptionIcd = BRIDGE_VERSION;
    window.dispatchEvent(new CustomEvent('medindex:prescription-context-ready', {
      detail:{ restored, diagnosisTransferred:Boolean(pendingDiagnosis), context:activeContext, pending:pendingContext },
    }));
    return restored;
  }

  function resetDuplicatedReview(event) {
    const button = event.target?.closest?.('[data-duplicate-saved]');
    if (!button) return;
    setTimeout(() => {
      const saved = readSaved();
      if (!saved.length) return;
      const newest = saved[0];
      if (!newest || !String(newest.name || '').endsWith('— kopje')) return;
      newest.generatedSignatureReviewed = false;
      newest.dosageReviewed = false;
      newest.clinicalReview = false;
      newest.reviewedAt = '';
      newest.updatedAt = new Date().toISOString();
      writeSaved(saved);
      decorateSavedCards();
    }, 0);
  }

  prepareTransferredSelection();
  document.addEventListener('click', resetDuplicatedReview, true);
  window.addEventListener('medindex:clinical-workflow-ready', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  window.addEventListener('pageshow', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(reconcilePrescriptionContext, 120), { once:true });
  else setTimeout(reconcilePrescriptionContext, 120);
})();


(() => {
  'use strict';

  const VERSION = 'icd-rx-roundtrip-v1';
  const DRAFT_KEY = 'medindex_rx_autodraft_v1';
  const RECENT_KEY = 'medindex_icd_recent_diagnoses_v1';
  const MAX_RECENT = 6;
  const RECENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  const PRESCRIBABLE_LEVELS = new Set(['category', 'subcategory']);
  const ICD_CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let contextObserver = null;
  let savedObserver = null;
  let detailObserver = null;
  let icdReturnMode = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function ensureStyles() { return true; }

  function loadProblemListAssets() { return true; }

  function normalizeContext(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = safeText(value.code, 24).toUpperCase();
    const level = safeText(value.level, 24).toLowerCase();
    const titleSq = safeText(value.titleSq || value.albanianDraft, 500);
    const titleEn = safeText(value.titleEn || value.englishTitle, 500);
    const selectedAt = Number(value.selectedAt || value.linkedAt || Date.now());
    if (!ICD_CODE_PATTERN.test(code) || !PRESCRIBABLE_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!Number.isFinite(selectedAt) || selectedAt > Date.now() + 5 * 60 * 1000) return null;
    return {
      version:2,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code,
      level,
      titleSq,
      titleEn,
      display:`${code} — ${titleSq || titleEn}`.slice(0, 1000),
      translationStatus:safeText(value.translationStatus, 40),
      childCount:Math.max(0, Math.min(9999, Number(value.childCount || 0))),
      selectedAt,
    };
  }

  function readRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      const seen = new Set();
      return raw.map(normalizeContext).filter(context => {
        if (!context || Date.now() - context.selectedAt > RECENT_MAX_AGE || seen.has(context.code)) return false;
        seen.add(context.code);
        return true;
      }).slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  }

  function writeRecent(items) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT))); } catch {}
  }

  function rememberContext(value) {
    const context = normalizeContext(value);
    if (!context) return null;
    context.selectedAt = Date.now();
    const next = [context, ...readRecent().filter(item => item.code !== context.code)].slice(0, MAX_RECENT);
    writeRecent(next);
    return context;
  }

  function savePrescriptionDraft() {
    const composer = document.getElementById('rxComposer');
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!composer || !diagnosis) return false;
    const payload = {
      version:1,
      savedAt:Date.now(),
      composer:String(composer.value || '').slice(0, 20000),
      diagnosis:String(diagnosis.value || '').slice(0, 1000),
    };
    try {
      if (!payload.composer && !payload.diagnosis) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function icdHref(code, { returnToPrescription = true } = {}) {
    const url = new URL('/icd.html', location.origin);
    url.searchParams.set('code', clean(code));
    if (returnToPrescription) url.searchParams.set('return', 'recetat');
    return `${url.pathname}${url.search}`;
  }

  function contextApi() {
    return window.MedIndexPrescriptionIcdContext || null;
  }

  function currentContext() {
    return normalizeContext(contextApi()?.current?.() || contextApi()?.pending?.());
  }

  function ensureRecentHost() {
    let host = document.getElementById('rxIcdRecent');
    if (host) return host;
    const anchor = document.getElementById('rxIcdContext') || document.getElementById('rxDiagnosis')?.closest('.rx-diagnosis');
    if (!anchor) return null;
    host = document.createElement('section');
    host.id = 'rxIcdRecent';
    host.className = 'rx-icd-recent';
    host.hidden = true;
    host.setAttribute('aria-labelledby', 'rxIcdRecentTitle');
    anchor.insertAdjacentElement('afterend', host);
    return host;
  }

  function renderRecent() {
    const host = ensureRecentHost();
    if (!host) return;
    const items = readRecent();
    host.hidden = !items.length;
    host.innerHTML = items.length ? `<header><div><strong id="rxIcdRecentTitle">Diagnozat ICD të fundit</strong><span>Përdori sërish ose hape kodin në hierarki.</span></div><button type="button" data-mi-icd-recent-clear>Pastro</button></header>
      <div class="rx-icd-recent-list">${items.map((item, index) => `<article class="rx-icd-recent-item">
        <button type="button" data-mi-icd-recent-apply="${index}" aria-label="Apliko ${esc(item.code)}">
          <span class="rx-icd-recent-code">${esc(item.code)}</span>
          <span><strong>${esc(item.titleSq || item.titleEn)}</strong><small>${item.level === 'subcategory' ? 'Nënkategori' : 'Kategori'}</small></span>
        </button>
        <a href="${esc(icdHref(item.code))}" data-mi-open-icd="${esc(item.code)}" aria-label="Hape ${esc(item.code)} në ICD">Hape</a>
      </article>`).join('')}</div>` : '';
  }

  function decorateActiveContext() {
    const host = document.getElementById('rxIcdContext');
    const actions = host?.querySelector('.rx-icd-actions');
    const context = currentContext();
    if (!host || host.hidden || !actions || !context) return;
    let link = actions.querySelector('.rx-icd-medindex-link');
    if (!link) {
      link = document.createElement('a');
      link.className = 'rx-icd-medindex-link';
      link.dataset.miOpenIcd = context.code;
      link.textContent = 'Hape në ICD';
      actions.prepend(link);
    }
    link.href = icdHref(context.code);
    link.dataset.miOpenIcd = context.code;
  }

  function readSavedPrescriptions() {
    try {
      const value = JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1') || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function decorateSavedCards() {
    const list = document.getElementById('rxSavedList');
    if (!list) return;
    const byId = new Map(readSavedPrescriptions().map(item => [String(item?.id), item]));
    list.querySelectorAll('[data-open-saved]').forEach(openButton => {
      const card = openButton.closest('.rx-saved-card');
      const actions = card?.querySelector('.rx-saved-actions');
      const protocol = byId.get(String(openButton.dataset.openSaved));
      const context = normalizeContext(protocol?.diagnosisCoding);
      let link = actions?.querySelector('.rx-icd-saved-open');
      if (!context) {
        link?.remove();
        return;
      }
      if (!actions) return;
      if (!link) {
        link = document.createElement('a');
        link.className = 'rx-icd-saved-open';
        link.textContent = 'Hape ICD';
        actions.insertBefore(link, actions.lastElementChild || null);
      }
      link.href = icdHref(context.code);
      link.dataset.miOpenIcd = context.code;
      link.setAttribute('aria-label', `Hape ${context.code} në ICD`);
    });
  }

  function installPrescriptionObservers() {
    const contextHost = document.getElementById('rxIcdContext');
    if (contextHost && !contextObserver) {
      contextObserver = new MutationObserver(() => {
        decorateActiveContext();
        renderRecent();
      });
      contextObserver.observe(contextHost, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden', 'class'] });
    }
    const savedList = document.getElementById('rxSavedList');
    if (savedList && !savedObserver) {
      savedObserver = new MutationObserver(() => requestAnimationFrame(decorateSavedCards));
      savedObserver.observe(savedList, { childList:true, subtree:true });
    }
  }

  function initPrescription() {
    ensureStyles();
    ensureRecentHost();
    installPrescriptionObservers();
    decorateActiveContext();
    decorateSavedCards();
    renderRecent();

    window.addEventListener('medindex:prescription-icd-context', event => {
      if (event.detail?.context) rememberContext(event.detail.context);
      decorateActiveContext();
      renderRecent();
    });

    window.addEventListener('medindex:prescription-context-ready', event => {
      if (event.detail?.context) rememberContext(event.detail.context);
      installPrescriptionObservers();
      decorateActiveContext();
      decorateSavedCards();
      renderRecent();
    });

    document.addEventListener('click', event => {
      const internalLink = event.target.closest('[data-mi-open-icd]');
      const apply = event.target.closest('[data-mi-icd-recent-apply]');
      const clear = event.target.closest('[data-mi-icd-recent-clear]');
      if (internalLink) savePrescriptionDraft();
      if (apply) {
        const context = readRecent()[Number(apply.dataset.miIcdRecentApply)];
        if (context && contextApi()?.apply?.(context)) {
          rememberContext(context);
          decorateActiveContext();
          renderRecent();
        }
      }
      if (clear) {
        writeRecent([]);
        renderRecent();
      }
    });

    document.documentElement.dataset.miIcdPrescriptionRoundtrip = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-prescription-roundtrip-ready', {
      detail:{ version:VERSION, page:'prescription', recent:readRecent().length },
    }));
  }

  function returningToPrescription() {
    return new URLSearchParams(location.search).get('return') === 'recetat';
  }

  function preserveReturnParameter() {
    if (!icdReturnMode) return;
    const url = new URL(location.href);
    if (url.searchParams.get('return') === 'recetat') return;
    url.searchParams.set('return', 'recetat');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function prescriptionReturnHref() {
    return '/recetat.html?from=icd-return';
  }

  function ensureIcdReturnControl() {
    if (!icdReturnMode) return;
    const toolbar = document.querySelector('.icd-tree-toolbar');
    const collapse = document.getElementById('icdCollapseAll');
    if (!toolbar || document.getElementById('icdReturnPrescription')) return;
    const link = document.createElement('a');
    link.id = 'icdReturnPrescription';
    link.className = 'icd-return-prescription';
    link.href = prescriptionReturnHref();
    link.textContent = 'Kthehu te receta';
    link.setAttribute('aria-label', 'Kthehu te drafti i recetës');
    collapse?.insertAdjacentElement('afterend', link);
  }

  function decorateDetailReturn() {
    if (!icdReturnMode) return;
    const actions = document.querySelector('#detailOverlay .icd-detail-actions');
    if (!actions || actions.querySelector('.icd-detail-return-prescription')) return;
    const link = document.createElement('a');
    link.className = 'icd-detail-return-prescription';
    link.href = prescriptionReturnHref();
    link.textContent = 'Kthehu te receta';
    actions.prepend(link);
  }

  function installDetailObserver() {
    const overlay = document.getElementById('detailOverlay');
    if (!overlay || detailObserver) return;
    detailObserver = new MutationObserver(decorateDetailReturn);
    detailObserver.observe(overlay, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    decorateDetailReturn();
  }

  function initIcd() {
    ensureStyles();
    icdReturnMode = returningToPrescription();
    if (icdReturnMode) {
      ensureIcdReturnControl();
      installDetailObserver();
      window.addEventListener('medindex:icd-state', preserveReturnParameter);
      window.addEventListener('medindex:icd-detail-ready', installDetailObserver, { once:true });
      window.addEventListener('popstate', () => setTimeout(() => {
        preserveReturnParameter();
        ensureIcdReturnControl();
      }, 0));
    }
    document.documentElement.dataset.miIcdPrescriptionRoundtrip = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-prescription-roundtrip-ready', {
      detail:{ version:VERSION, page:'icd', returning:icdReturnMode },
    }));
  }

  function init() {
    loadProblemListAssets();
    if (document.getElementById('rxContent')) initPrescription();
    if (document.getElementById('icdContent')) initIcd();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();


(() => {
  'use strict';

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function showRange(result) {
    const range = text(result?.calculatedDoseRange);
    if (!range) return;
    setTimeout(() => {
      const status = document.getElementById('rxStatus');
      if (status) {
        status.textContent = `Kalkulatori pediatrik: ${range}. Ky është diapazon i verifikuar; zgjidh dozën përfundimtare sipas indikacionit dhe protokollit.`;
        status.className = 'rx-status is-error';
      }
      const chip = document.querySelector('#rxSelectedDrugs .rx-drug-chip:last-child > span');
      if (chip && !chip.querySelector('.rx-calculated-range')) {
        const marker = document.createElement('small');
        marker.className = 'rx-calculated-range';
        marker.textContent = `Kalkulator: ${range} · kërkon zgjedhje klinike`;
        chip.appendChild(marker);
      }
    }, 0);
  }

  function install() {
    const engine = window.MedIndexDosageEngine;
    if (!engine || engine.__rangeFeedback) return;
    const original = engine.prescriptionTransfer.bind(engine);
    engine.prescriptionTransfer = (...args) => {
      const result = original(...args);
      showRange(result);
      return result;
    };
    engine.__rangeFeedback = true;

    const style = document.createElement('style');
    style.textContent = '.rx-drug-chip>span{display:grid;gap:2px}.rx-calculated-range{display:block;color:#9a4b08;font-size:10px;font-weight:750;line-height:1.35}';
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();

(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const FALLBACK_CHAPTERS = Object.freeze([{"slug":"gastro-metabolizem","title":"Gastroenterologji & metabolizëm","description":"Trakti gastrointestinal dhe metabolizmi","atcGroups":["A"],"diagnosisKeywords":["gastrit","refluks","ulcer","diabet","metabol","obezitet"],"sortOrder":10},{"slug":"hematologji","title":"Hematologji","description":"Gjaku dhe koagulimi","atcGroups":["B"],"diagnosisKeywords":["anemi","antikoagul","tromboz","hemorragji"],"sortOrder":20},{"slug":"kardiovaskulare","title":"Kardiovaskulare","description":"Zemra dhe enët e gjakut","atcGroups":["C"],"diagnosisKeywords":["hipertension","zemer","zemër","kardiak","aritmi","insuficienc"],"sortOrder":30},{"slug":"dermatologji","title":"Dermatologji","description":"Trajtime dermatologjike","atcGroups":["D"],"diagnosisKeywords":["dermatit","ekzem","psoriaz","myk","fungal","lekure","lëkur"],"sortOrder":40},{"slug":"urogjenitale","title":"Urologji & gjinekologji","description":"Sistemi urogjenital","atcGroups":["G"],"diagnosisKeywords":["cistit","uti","prostat","vaginit","gjinekolog","urolog"],"sortOrder":50},{"slug":"endokrinologji","title":"Endokrinologji","description":"Hormonet sistemike","atcGroups":["H"],"diagnosisKeywords":["tiroid","hashimoto","hipotiroid","hipertiroid","adrenal","kortizol"],"sortOrder":60},{"slug":"antiinfektive","title":"Antiinfektive","description":"Infeksione dhe terapi antiinfektive","atcGroups":["J","P"],"diagnosisKeywords":["infeksion","antibiotik","pneumoni","sinusit","tonsilit","parazit"],"sortOrder":70},{"slug":"onkologji-imunologji","title":"Onkologji & imunologji","description":"Antineoplastikë dhe imunomodulues","atcGroups":["L"],"diagnosisKeywords":["kancer","onkolog","autoimun","imunosupres"],"sortOrder":80},{"slug":"muskuloskeletal","title":"Muskuloskeletal","description":"Muskuloskeletal dhe reumatologji","atcGroups":["M"],"diagnosisKeywords":["artrit","dhimbje shpine","muskul","reumat","osteoporoz"],"sortOrder":90},{"slug":"neurologji-psikiatri","title":"Neurologji & psikiatri","description":"Sistemi nervor dhe shëndeti mendor","atcGroups":["N"],"diagnosisKeywords":["migren","epilep","depres","ankth","psikiatr","neurolog","dhimbje"],"sortOrder":100},{"slug":"respiratore","title":"Respiratore","description":"Astma, SPOK dhe respiratori","atcGroups":["R"],"diagnosisKeywords":["astm","spok","copd","koll","bronkit","respirator"],"sortOrder":110},{"slug":"oftalmologji-orl","title":"Oftalmologji & ORL","description":"Syri, veshi dhe organet shqisore","atcGroups":["S"],"diagnosisKeywords":["sy","okular","konjuktivit","vesh","otit","orl"],"sortOrder":120},{"slug":"pediatri","title":"Pediatri","description":"Receta pediatrike","atcGroups":[],"diagnosisKeywords":["pediatri","femij","fëmij","foshnj"],"sortOrder":130},{"slug":"urgjenca","title":"Urgjenca","description":"Situata akute dhe emergjente","atcGroups":[],"diagnosisKeywords":["urgjenc","anafilaksi","arrest","shok","status epileptik","akut"],"sortOrder":140},{"slug":"te-tjera","title":"Të tjera","description":"Pa kapitull specifik","atcGroups":["V"],"diagnosisKeywords":[],"sortOrder":999}]);
  const Core = window.MedIndexPrescriptionFormat;
  const Dosage = window.MedIndexDosageEngine;

  const state = {
    selectedDrugs: [],
    result: null,
    editingId: '',
    source: '',
    searchTimer: 0,
    searchController: null,
    searchSequence: 0,
    searchCache: new Map(),
    registryDetailCache: new Map(),
    pendingRouteDrug: null,
    renderTimer: 0,
    generatedReviewConfirmed: false,
    dosageReviewConfirmed: false,
    clinicalReviewConfirmed: false,
    dosageEdited: false,
    composerOrigin: 'structured',
    pendingDosageChoice: null,
    chooserReturnFocus: null,
    activeChapter: 'all',
    chapters: [],
    chapterManuallySelected: false,
  };

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
  const uid = () => `rx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  function toast(message) {
    const node = $('#rxToast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function setStatus(message = '', type = '') {
    const node = $('#rxStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `rx-status${type ? ` is-${type}` : ''}`;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', theme === 'dark' ? 'Aktivizo temën e çelët' : 'Aktivizo temën e errët');
    }
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    const theme = ['dark', 'light'].includes(saved)
      ? saved
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function getSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function setSaved(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
    window.dispatchEvent(new CustomEvent('medindex:prescriptions-changed', { detail:{ count:items.length } }));
    renderSaved();
  }

  function chapterCatalog() {
    const remote = window.MedIndexUserLibrary?.prescriptionChapters?.() || [];
    const source = remote.length ? remote : (state.chapters.length ? state.chapters : FALLBACK_CHAPTERS);
    return source
      .map(item => ({
        slug:text(item.slug),
        title:text(item.title || item.title_sq),
        description:text(item.description || item.description_sq),
        atcGroups:Array.isArray(item.atcGroups || item.atc_groups) ? [...(item.atcGroups || item.atc_groups)] : [],
        diagnosisKeywords:Array.isArray(item.diagnosisKeywords || item.diagnosis_keywords) ? [...(item.diagnosisKeywords || item.diagnosis_keywords)] : [],
        sortOrder:Number(item.sortOrder || item.sort_order) || 100,
      }))
      .filter(item => item.slug && item.title)
      .sort((a,b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'sq'));
  }

  function chapterByKey(key) {
    return chapterCatalog().find(item => item.slug === text(key))
      || chapterCatalog().find(item => item.slug === 'te-tjera')
      || { slug:'te-tjera', title:'Të tjera', description:'Pa kapitull specifik' };
  }

  function classifyChapter({ diagnosis = '', selectedDrugs = state.selectedDrugs } = {}) {
    const chapters = chapterCatalog();
    const diagnosisText = fold(diagnosis);
    const atcRoots = selectedDrugs.map(item => text(item?.atc).toUpperCase().slice(0,1)).filter(Boolean);
    let best = null;
    for (const chapter of chapters) {
      if (chapter.slug === 'te-tjera') continue;
      let score = 0;
      for (const root of atcRoots) if (chapter.atcGroups.map(String).includes(root)) score += 10;
      for (const keyword of chapter.diagnosisKeywords) {
        const needle = fold(keyword);
        if (needle && diagnosisText.includes(needle)) score += 4;
      }
      if (!best || score > best.score || (score === best.score && chapter.sortOrder < best.chapter.sortOrder)) {
        best = { chapter, score };
      }
    }
    return best && best.score > 0 ? best.chapter.slug : 'te-tjera';
  }

  function populateChapterSelect() {
    state.chapters = chapterCatalog();
    const select = $('#rxChapterSelect');
    if (!select) return;
    const current = text(select.value) || 'te-tjera';
    select.innerHTML = state.chapters.map(item => `<option value="${esc(item.slug)}">${esc(item.title)}</option>`).join('');
    select.value = state.chapters.some(item => item.slug === current) ? current : 'te-tjera';
    $('#rxFolderCount').textContent = String(state.chapters.length);
  }

  function syncChapterSuggestion({ force = false } = {}) {
    const select = $('#rxChapterSelect');
    if (!select) return;
    if (state.chapterManuallySelected && !force) return;
    const diagnosis = text($('#rxDiagnosis')?.value);
    const suggested = classifyChapter({ diagnosis });
    if ([...select.options].some(option => option.value === suggested)) select.value = suggested;
    const meta = $('#rxChapterSuggestion');
    if (meta) meta.textContent = suggested === 'te-tjera' ? 'pa përputhje të sigurt' : 'sugjeruar nga ATC/diagnoza';
  }

  function migrateLegacyChapterAssignments() {
    const saved = getSaved();
    let changed = false;
    const next = saved.map(protocol => {
      const existing = text(protocol?.chapterKey);
      if (existing && chapterCatalog().some(chapter => chapter.slug === existing)) return protocol;
      const chapterKey = classifyChapter({
        diagnosis:protocol?.indication || protocol?.diagnosis || '',
        selectedDrugs:Array.isArray(protocol?.selectedDrugs) ? protocol.selectedDrugs : [],
      });
      changed = true;
      return { ...protocol, chapterKey, updatedAt:protocol?.updatedAt || new Date().toISOString() };
    });
    if (changed) setSaved(next);
    return changed;
  }

  function chapterCounts(items) {
    const counts = new Map(chapterCatalog().map(item => [item.slug, 0]));
    items.forEach(item => {
      const key = chapterByKey(item?.chapterKey).slug;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function renderChapterNav(items = getSaved()) {
    const root = $('#rxChapterNav');
    if (!root) return;
    const counts = chapterCounts(items);
    $('#rxChapterAllCount').textContent = String(items.length);
    root.innerHTML = chapterCatalog().map(chapter => {
      const active = state.activeChapter === chapter.slug;
      return `<button class="rx-folder-item${active ? ' is-active' : ''}" type="button" data-rx-chapter="${esc(chapter.slug)}" aria-pressed="${active}">
        <span class="rx-folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.5 7.5h6l1.8 2h9.2v9.5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19Z"/><path d="M3.5 7.5V5A1.5 1.5 0 0 1 5 3.5h4l1.7 2H19a1.5 1.5 0 0 1 1.5 1.5v2.5"/></svg></span>
        <span><strong>${esc(chapter.title)}</strong><small>${esc(chapter.description)}</small></span>
        <b>${counts.get(chapter.slug) || 0}</b>
      </button>`;
    }).join('');
    document.querySelector('[data-rx-chapter="all"]')?.classList.toggle('is-active', state.activeChapter === 'all');
  }

  function normalizeDrug(item) {
    const base = Core.normalizeDrug(item);
    const Administration = window.MedIndexAdministrationRoutes;
    const inferred = Administration?.inferAdministration?.(item) || {};
    const allowedRoutes = Array.isArray(item?.allowedRoutes)
      ? item.allowedRoutes.map(value => text(value).toUpperCase()).filter(Boolean)
      : Array.isArray(item?.__allowedRoutes)
        ? item.__allowedRoutes.map(value => text(value).toUpperCase()).filter(Boolean)
        : Administration?.routeTokens?.(item?.route || inferred.routes?.join(' ') || '') || [];
    const route = text(item?.route || base.route || inferred.route).toUpperCase();
    return {
      ...base,
      id:text(item?.id || item?.drugId),
      drugId:text(item?.drugId || item?.id),
      registryNumber:text(item?.registryNumber || item?.registry_number),
      approvedPopulation:text(item?.approvedPopulation || item?.approved_population),
      productStatus:text(item?.productStatus || item?.product_status),
      packaging:text(item?.packaging || item?.packageSize),
      packagingSummary:text(item?.packagingSummary),
      prescriptionLine:text(item?.prescriptionLine),
      prescriptionNotation:text(item?.prescriptionNotation),
      sheetPrescriptionNotation:text(item?.sheetPrescriptionNotation),
      administrationCategory:text(item?.administrationCategory || inferred.category),
      allowedRoutes:[...new Set([...allowedRoutes, route].filter(Boolean))],
      route,
      doseInstruction:text(item?.doseInstruction || item?.dose_instruction),
      frequency:text(item?.frequency || base.frequency),
      duration:text(item?.duration || base.duration),
      dispense:text(item?.dispense || base.dispense),
      signatura:text(item?.signatura || base.signatura),
      additionalInstructions:text(item?.additionalInstructions || item?.additional_instructions),
      signaturaManual:Boolean(item?.signaturaManual),
    };
  }

  function routeOptionsForDrug(drug) {
    const Administration = window.MedIndexAdministrationRoutes;
    const allowed = Array.isArray(drug.allowedRoutes) ? drug.allowedRoutes : [];
    const routes = [...new Set([...allowed, text(drug.route).toUpperCase()].filter(Boolean))];
    const source = routes.length ? routes : Object.keys(Administration?.ROUTE_LABELS || {
      PO:'orale', SL:'sublinguale', BUCCAL:'bukale', PR:'rektale', IV:'intravenoze', IM:'intramuskulare',
      SC:'subkutane', ID:'intradermale', TOP:'dermatologjike', OPH:'oftalmike', OTIC:'otike',
      NASAL:'nazale', VAG:'vaginale', TD:'transdermale', INH:'inhalatore', MDI:'MDI', DPI:'DPI', NEB:'nebulizator',
    });
    return source.map(route => ({ route, label:Administration?.routeLabel?.(route) || route }));
  }

  function registrySourceValue(detail, ...labels) {
    const wanted = new Set(labels.map(label => fold(label)));
    const fields = Array.isArray(detail?.sourceFields) ? detail.sourceFields : [];
    const match = fields.find(item => wanted.has(fold(item?.label)));
    return text(match?.value);
  }

  async function hydrateRegistryDrug(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const id = text(source.id);
    if (!id) return source;
    if (state.registryDetailCache.has(id)) {
      return { ...source, ...state.registryDetailCache.get(id) };
    }
    try {
      const response = await fetch(`/api/drug-search?view=registry-detail&id=${encodeURIComponent(id)}`, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.row) return source;
      const detail = payload.row;
      const Administration = window.MedIndexAdministrationRoutes;
      const sourceCategory = registrySourceValue(detail, 'Kategoria e administrimit', 'Kategoria');
      const sourceRoutes = registrySourceValue(detail, 'Rrugët e lejuara', 'Rruget e lejuara', 'Rruga e lejuar');
      const allowedRoutes = Administration?.routeTokens?.(sourceRoutes) || [];
      const inferred = Administration?.inferAdministration?.({
        administrationCategory:sourceCategory,
        allowedRoutes,
        form:detail.form || source.form,
      }) || {};
      const hydrated = {
        ...detail,
        ...source,
        packaging:text(source.packaging || detail.packaging),
        approvedPopulation:text(source.approvedPopulation || detail.approvedPopulation),
        prescriptionNotation:text(source.prescriptionNotation || detail.prescriptionNotation),
        administrationCategory:text(source.administrationCategory || sourceCategory || inferred.category),
        allowedRoutes:Array.isArray(source.allowedRoutes) && source.allowedRoutes.length
          ? source.allowedRoutes
          : (allowedRoutes.length ? allowedRoutes : inferred.routes || []),
        route:text(source.route || (allowedRoutes.length === 1 ? allowedRoutes[0] : inferred.route)).toUpperCase(),
        sourceFields:Array.isArray(detail.sourceFields) ? detail.sourceFields : [],
      };
      state.registryDetailCache.set(id, hydrated);
      if (state.registryDetailCache.size > 80) state.registryDetailCache.delete(state.registryDetailCache.keys().next().value);
      return hydrated;
    } catch {
      return source;
    }
  }

  function approvedPopulationKind(drug) {
    const value = fold(drug?.approvedPopulation);
    if (!value) return 'unknown';
    if (/adult\s*only|vetem\s+(?:per\s+)?te\s+rritur|vetëm\s+(?:për\s+)?të\s+rritur/.test(value)) return 'adult-only';
    if (/pediatr(?:ic|ik)?\s*only|vetem\s+(?:per\s+)?femij|vetëm\s+(?:për\s+)?fëmij/.test(value)) return 'pediatric-only';
    return 'mixed-or-unspecified';
  }

  function populationCompatibilityForDrug(drug, context) {
    const kind = approvedPopulationKind(drug);
    if (kind === 'adult-only' && context?.pediatric) {
      return { valid:false, kind, message:'Ky preparat është i aprovuar vetëm për të rritur. Zgjidh një preparat pediatrik ose hap recetë për të rritur.' };
    }
    if (kind === 'pediatric-only' && !context?.pediatric) {
      return { valid:false, kind, message:'Ky preparat është vetëm pediatrik. Aktivizo “Pediatrike” dhe plotëso moshën e peshën para se ta shtosh.' };
    }
    return { valid:true, kind, message:'' };
  }

  function syncClinicalContextForDrug(drug) {
    const contextApi = window.MedIndexPrescriptionContext;
    const Administration = window.MedIndexAdministrationRoutes;
    const current = contextApi?.getContext?.();
    const administration = contextApi?.drugAdministration?.(drug)
      || Administration?.inferAdministration?.(drug)
      || { category:'', routes:[], route:'' };
    contextApi?.setProductConstraint?.(drug);
    if (!current || !administration.category) {
      return { administration, context:current || null, routeResolved:Boolean(administration.route) };
    }
    const allowed = Array.isArray(administration.routes) ? administration.routes : [];
    const currentRouteAllowed = current.administrationCategory === administration.category
      && current.route && (!allowed.length || allowed.includes(current.route));
    const route = allowed.length === 1
      ? allowed[0]
      : (currentRouteAllowed ? current.route : text(administration.route).toUpperCase());
    const next = { ...current, administrationCategory:administration.category, route };
    const changed = next.administrationCategory !== current.administrationCategory || next.route !== current.route;
    if (changed) contextApi?.setContext?.(next, { refresh:false });
    return { administration, context:contextApi?.getContext?.() || next, routeResolved:Boolean(route), changed };
  }

  function structuredSignature(drug) {
    if (drug.signaturaManual && text(drug.signatura)) return text(drug.signatura);
    const dose = text(drug.doseInstruction);
    const frequency = text(drug.frequency);
    if (!dose || !frequency) return text(drug.signatura);
    const Administration = window.MedIndexAdministrationRoutes;
    const route = text(drug.route).toUpperCase();
    const category = Administration?.categoryForRoute?.(route) || text(drug.administrationCategory);
    const verb = category === 'PARENTERAL'
      ? 'Administrohet'
      : category === 'TOPICAL_LOCAL'
        ? 'Aplikohet'
        : category === 'INHALATION'
          ? 'Inhalohet'
          : 'Merret';
    const routePhrase = route ? Administration?.routePhrase?.(route) || route : '';
    const durationRaw = text(drug.duration);
    const duration = durationRaw
      ? (/^(?:për|per|deri|gjatë|gjate|sipas)\b/i.test(durationRaw) ? durationRaw : `për ${durationRaw}`)
      : '';
    const extra = text(drug.additionalInstructions);
    const sentence = [`${verb} ${dose}`, routePhrase, frequency, duration].filter(Boolean).join(' ');
    return [sentence, extra].filter(Boolean).join(', ').replace(/\s+/g, ' ').replace(/[.]+$/, '') + '.';
  }

  function orderIssues(drug) {
    const issues = [];
    if (!text(drug.route)) issues.push('rruga');
    if (!text(drug.doseInstruction)) issues.push('doza');
    if (!text(drug.frequency)) issues.push('shpeshtësia');
    if (!text(drug.dispense)) issues.push('sasia');
    if (!text(drug.signatura)) issues.push('Signatura');
    return issues;
  }

  function structuredOrderIssues() {
    return state.selectedDrugs.flatMap((drug, index) => {
      const issues = orderIssues(drug);
      return issues.length ? [{ key:drug.key, index, drug, issues }] : [];
    });
  }

  function structuredOrdersReady() {
    return !state.selectedDrugs.length || structuredOrderIssues().length === 0;
  }

  function transferText(drug) {
    const normalized = normalizeDrug(drug);
    const signature = structuredSignature(normalized);
    const lines = [Core.selectedDrugLine(normalized)].filter(Boolean);
    if (normalized.dispense) lines.push(`Sasia: ${normalized.dispense}`);
    if (signature) lines.push(`S (Signatura): ${signature}`);
    return lines.join('\n');
  }

  function syncComposerFromOrders({ force = false } = {}) {
    const composer = $('#rxComposer');
    if (!composer || !state.selectedDrugs.length) return false;
    if (!force && state.composerOrigin === 'manual') return false;
    composer.value = state.selectedDrugs.map(drug => transferText(drug)).filter(Boolean).join('\n\n');
    state.composerOrigin = 'structured';
    scheduleLocalPreview();
    return true;
  }

  function addSelectedDrug(raw, { insert = true } = {}) {
    const drug = normalizeDrug(raw);
    if (!drug.substance) {
      setStatus('Ky regjistrim nuk ka substancë aktive dhe nuk mund të futet në recetën përfundimtare.', 'error');
      return;
    }
    const key = drug.key || `${drug.substance}|${drug.tradeName}|${drug.strength}`;
    const prepared = {
      ...drug,
      key,
      signatura:structuredSignature(drug),
    };
    const existingIndex = state.selectedDrugs.findIndex(item => item.key === key);
    if (existingIndex >= 0) state.selectedDrugs[existingIndex] = { ...state.selectedDrugs[existingIndex], ...prepared };
    else state.selectedDrugs.push(prepared);
    state.clinicalReviewConfirmed = false;
    renderSelectedDrugs();
    syncChapterSuggestion();
    if (insert) {
      const composer = $('#rxComposer');
      if (!text(composer?.value) || state.composerOrigin === 'structured') {
        syncComposerFromOrders({ force:true });
      } else {
        setStatus('Bari u shtua te fushat e strukturuara. Teksti manual nuk u mbishkrua; përdor “Përditëso tekstin” kur të jesh gati.');
      }
    }
  }

  async function addDrugWithDosage(raw, options = {}) {
    const hydrated = options.skipRegistryHydration ? raw : await hydrateRegistryDrug(raw);
    const drug = normalizeDrug(hydrated);
    const contextApi = window.MedIndexPrescriptionContext;
    const synced = syncClinicalContextForDrug(drug);
    const activeContext = contextApi?.getContext?.() || synced.context || {};
    const populationCheck = populationCompatibilityForDrug(drug, activeContext);
    if (!populationCheck.valid) {
      state.pendingRouteDrug = null;
      setStatus(populationCheck.message, 'error');
      return { status:'population-mismatch' };
    }
    if (!synced.administration?.category) {
      contextApi?.clearProductConstraint?.();
      state.pendingRouteDrug = { raw:hydrated, options:{ ...options, skipRegistryHydration:true }, manualAdministration:true };
      setStatus('Rruga nuk u identifikua në mënyrë të sigurt nga kartela e produktit. Zgjidh kategorinë dhe rrugën; pastaj DRx vazhdon me dozologjinë.', 'error');
      setTimeout(() => {
        document.getElementById('rxClinicalContext')?.scrollIntoView?.({ block:'center', behavior:'smooth' });
        document.querySelector('[data-context-category]')?.focus?.({ preventScroll:true });
      }, 0);
      return { status:'needs-administration' };
    }
    if (!synced.routeResolved) {
      state.pendingRouteDrug = { raw:hydrated, options:{ ...options, skipRegistryHydration:true } };
      const routes = Array.isArray(synced.administration.routes) ? synced.administration.routes : [];
      setStatus(routes.length
        ? `Ky preparat lejon ${routes.join(' / ')}. Zgjidh rrugën e saktë; vazhdimi bëhet automatikisht.`
        : `${window.MedIndexAdministrationRoutes?.categoryLabel?.(synced.administration.category) || synced.administration.category} u identifikua. Zgjidh rrugën e saktë për këtë preparat.`, 'error');
      setTimeout(() => {
        const holder = document.getElementById('rxRouteSegments');
        holder?.scrollIntoView?.({ block:'center', behavior:'smooth' });
        holder?.querySelector?.('button')?.focus?.({ preventScroll:true });
      }, 0);
      return { status:'needs-route' };
    }
    state.pendingRouteDrug = null;
    const route = synced.context?.route || contextApi?.getContext?.()?.route || synced.administration.route;
    setStatus(`Rruga u zgjodh automatikisht nga produkti: ${window.MedIndexAdministrationRoutes?.categoryLabel?.(synced.administration.category) || synced.administration.category} · ${route}.`, 'success');
    if (drug.regimenId || !Dosage) return addSelectedDrug(drug, options);
    const drugId = text(drug.id || drug.drugId);
    if (!drugId || !contextApi?.loadForDrug) {
      addSelectedDrug({ ...drug, dosageStatus:'manual' }, options);
      setStatus('Produkti u shtua me rrugën e saktë, por nuk ka identifikues për dozologji të targetuar. Doza mbetet manuale.', 'error');
      return { status:'manual' };
    }
    let payload;
    try {
      payload = await contextApi.loadForDrug(drugId);
    } catch (error) {
      addSelectedDrug({ ...drug, dosageStatus:'manual' }, options);
      setStatus(`${error?.message || 'Dozologjia nuk u ngarkua.'} Identiteti dhe rruga u ruajtën; doza mbetet manuale.`, 'error');
      return { status:'manual-unavailable' };
    }
    const context = contextApi.getContext?.() || null;
    const decision = contextApi?.decideForContext
      ? contextApi.decideForContext(Dosage, drug, payload.adult || [], context)
      : Dosage.decideMatch(drug, payload.adult || [], { population:context?.pediatric ? 'pediatric' : 'adult' });
    if (decision.status === 'auto') {
      openDosageChooser(drug, [decision.regimen], options);
      setStatus('U gjet 1 skemë e verifikuar për këtë produkt dhe rrugë. Kontrolloje dhe konfirmoje.');
      return { status:'confirm-regimen' };
    }
    if (decision.status === 'choose-indication') {
      openDosageChooser(drug, decision.matches, options);
      return { status:'choose-indication' };
    }
    addSelectedDrug({ ...drug, dosageStatus:'manual' }, options);
    if (options.insert !== false) {
      setStatus('Nuk u gjet skemë e verifikuar për kombinimin produkt + popullatë + rrugë. Identiteti dhe rruga u plotësuan; doza mbetet manuale.');
    }
    return { status:'manual' };
  }

  function openDosageChooser(drug, matches, options) {
    const rows = Array.isArray(matches) ? matches.filter(Boolean) : [];
    if (!rows.length) return addSelectedDrug({ ...drug, dosageStatus:'manual' }, options);
    state.pendingDosageChoice = { drug, matches:rows, options };
    state.chooserReturnFocus = document.activeElement;
    const select = $('#rxDosageChoice');
    const optionsHtml = rows.map(item => `<option value="${esc(item.regimenId)}">${esc(item.indication || 'Pa indikacion të shënuar')} · ${esc(item.frequency || 'shpeshtësia e pashënuar')} · ${esc(item.duration || 'kohëzgjatja e pashënuar')}</option>`).join('');
    select.innerHTML = rows.length > 1
      ? `<option value="">Zgjidh indikacionin / skemën…</option>${optionsHtml}`
      : optionsHtml;
    const applyButton = $('#rxDosageApply');
    if (applyButton) applyButton.disabled = rows.length > 1;
    const copy = $('#rxDosageChooserCopy');
    if (copy) copy.textContent = rows.length === 1
      ? 'U gjet një skemë e verifikuar. Nuk aplikohet automatikisht; kontrolloje dhe konfirmoje vetëm nëse i përshtatet pacientit dhe indikacionit.'
      : `U gjetën ${rows.length} skema të verifikuara. Zgjidh indikacionin e saktë; asnjë dozë nuk aplikohet pa konfirmimin tënd.`;
    const overlay = $('#rxDosageChooser');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    select.focus();
  }

  function closeDosageChooser({ mode = 'cancel' } = {}) {
    const pending = state.pendingDosageChoice;
    if (pending && mode !== 'cancel') {
      const selected = pending.matches.find(item => item.regimenId === $('#rxDosageChoice')?.value);
      if (mode === 'apply' && !selected) {
        setStatus('Zgjidh indikacionin / skemën para aplikimit.', 'error');
        $('#rxDosageChoice')?.focus();
        return;
      }
      const contextApi = window.MedIndexPrescriptionContext;
      const transferred = mode === 'apply' && selected
        ? (contextApi?.transferForContext
          ? contextApi.transferForContext(Dosage, pending.drug, selected, contextApi.getContext?.())
          : Dosage.prescriptionTransfer(pending.drug, selected, 'adult'))
        : { ...pending.drug, dosageStatus:'manual' };
      addSelectedDrug(transferred, pending.options);
      setStatus(mode === 'apply'
        ? 'Skema e zgjedhur u aplikua pas konfirmimit. Verifikoje klinikisht para ruajtjes.'
        : 'Bari u shtua pa skemë dozimi. Plotëso dozën, rrugën, shpeshtësinë dhe sasinë manualisht.',
      mode === 'apply' ? 'success' : '');
    }
    state.pendingDosageChoice = null;
    const overlay = $('#rxDosageChooser');
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.chooserReturnFocus?.focus?.({ preventScroll:true });
    state.chooserReturnFocus = null;
  }

  function removeSelectedDrug(key) {
    state.selectedDrugs = state.selectedDrugs.filter(item => item.key !== key);
    state.clinicalReviewConfirmed = false;
    renderSelectedDrugs();
    syncChapterSuggestion();
    if (state.composerOrigin === 'structured') {
      const composer = $('#rxComposer');
      if (composer) composer.value = state.selectedDrugs.map(drug => transferText(drug)).filter(Boolean).join('\n\n');
      scheduleLocalPreview();
    }
  }

  function updateOrderField(key, field, value) {
    const index = state.selectedDrugs.findIndex(item => item.key === key);
    if (index < 0) return;
    const current = { ...state.selectedDrugs[index] };
    current[field] = value;
    if (field === 'signatura') current.signaturaManual = true;
    if (['doseInstruction','route','frequency','duration','dispense','additionalInstructions'].includes(field)) {
      if (current.regimenId && ['auto-filled','requires-review'].includes(current.dosageStatus)) current.dosageStatus = 'edited';
      if (!current.signaturaManual) current.signatura = structuredSignature(current);
      state.dosageReviewConfirmed = false;
    }
    state.clinicalReviewConfirmed = false;
    state.selectedDrugs[index] = current;

    const card = document.querySelector(`[data-order-key="${CSS.escape(key)}"]`);
    if (card) {
      const issues = orderIssues(current);
      const badge = card.querySelector('[data-order-status]');
      if (badge) {
        badge.textContent = issues.length ? `Plotëso: ${issues.join(', ')}` : 'Gati për kontroll';
        badge.className = `rx-order-status ${issues.length ? 'is-incomplete' : 'is-ready'}`;
      }
      if (!current.signaturaManual && field !== 'signatura') {
        const signature = card.querySelector('[data-order-field="signatura"]');
        if (signature) signature.value = current.signatura || '';
      }
    }
    syncComposerFromOrders();
    updateActionState();
  }

  function renderSelectedDrugs() {
    const holder = $('#rxSelectedDrugs');
    if (!holder) return;
    if (!state.selectedDrugs.length) {
      holder.innerHTML = '<div class="rx-order-empty"><strong>Ende nuk ka barna</strong><span>Shto barin e parë nga regjistri i verifikuar.</span></div>';
      updateActionState();
      return;
    }

    const orderCards = state.selectedDrugs.map((drug, index) => {
      const issues = orderIssues(drug);
      const routes = routeOptionsForDrug(drug);
      const routeOptions = ['<option value="">Zgjidh rrugën</option>', ...routes.map(item => `<option value="${esc(item.route)}"${item.route === drug.route ? ' selected' : ''}>${esc(item.route)} · ${esc(item.label)}</option>`)].join('');
      const doseBadge = drug.regimenId
        ? '<span class="rx-order-source">Skemë e verifikuar</span>'
        : '<span class="rx-order-source is-manual">Dozë manuale</span>';
      return `<article class="rx-order-card" data-order-key="${esc(drug.key)}">
        <header>
          <div class="rx-order-index">${index + 1}</div>
          <div class="rx-order-identity">
            <strong>${esc([Core.prefixForForm(drug.form), drug.substance, drug.strength].filter(Boolean).join(' '))}</strong>
            <span>${esc([drug.tradeName, drug.form ? Core.formLabel(drug.form) : '', drug.atc ? `ATC ${drug.atc}` : ''].filter(Boolean).join(' · '))}</span>
          </div>
          ${doseBadge}
          <button type="button" class="rx-order-remove" data-remove-drug="${esc(drug.key)}" aria-label="Hiqe ${esc(drug.substance)}">Hiq</button>
        </header>
        <div class="rx-order-grid">
          <label><span>Rruga <b aria-hidden="true">*</b></span><select data-order-field="route" required aria-required="true">${routeOptions}</select></label>
          <label><span>Doza për marrje <b aria-hidden="true">*</b></span><input data-order-field="doseInstruction" required aria-required="true" value="${esc(drug.doseInstruction)}" placeholder="p.sh. 1 tabletë"></label>
          <label><span>Shpeshtësia <b aria-hidden="true">*</b></span><input data-order-field="frequency" required aria-required="true" value="${esc(drug.frequency)}" placeholder="p.sh. çdo 12 orë"></label>
          <label><span>Kohëzgjatja</span><input data-order-field="duration" value="${esc(drug.duration)}" placeholder="p.sh. 7 ditë"></label>
          <label><span>Sasia për dispensim <b aria-hidden="true">*</b></span><input data-order-field="dispense" required aria-required="true" value="${esc(drug.dispense)}" placeholder="p.sh. Scat. No I"></label>
          <label><span>Udhëzim shtesë</span><input data-order-field="additionalInstructions" value="${esc(drug.additionalInstructions)}" placeholder="p.sh. pas ushqimit"></label>
          <label class="rx-order-signature"><span>Signatura <b aria-hidden="true">*</b></span><textarea rows="2" data-order-field="signatura" placeholder="Udhëzimi për pacientin">${esc(drug.signatura || structuredSignature(drug))}</textarea></label>
        </div>
        <footer>
          <span class="rx-order-status ${issues.length ? 'is-incomplete' : 'is-ready'}" data-order-status>${issues.length ? `Plotëso: ${esc(issues.join(', '))}` : 'Gati për kontroll'}</span>
          ${drug.sourceUrl ? `<a href="${esc(drug.sourceUrl)}" target="_blank" rel="noopener noreferrer">Burimi i dozologjisë</a>` : ''}
        </footer>
      </article>`;
    }).join('');

    holder.innerHTML = `<div class="rx-order-toolbar">
      <span><strong>${state.selectedDrugs.length}</strong> ${state.selectedDrugs.length === 1 ? 'bar' : 'barna'} në recetë</span>
      <button type="button" class="rx-text-button" data-sync-orders-to-text>Përditëso tekstin</button>
    </div>${orderCards}`;
    updateActionState();
  }

  function loadSelection() {
    try {
      const items = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]');
      sessionStorage.removeItem(SELECTION_KEY);
      if (!Array.isArray(items) || !items.length) return;
      items.forEach(item => addSelectedDrug(item, { insert:false }));
      const composer = $('#rxComposer');
      if (composer && !text(composer.value)) {
        composer.value = items.map(item => transferText(normalizeDrug(item))).filter(Boolean).join('\n\n');
        scheduleLocalPreview();
      }
      setStatus(`${items.length} barna të zgjedhura u bartën nga regjistri.`, 'success');
    } catch {}
  }

  function insertAtCursor(value) {
    const input = $('#rxComposer');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const prefix = before && !before.endsWith('\n') && !/^\s/.test(value) ? ' ' : '';
    input.value = `${before}${prefix}${value}${after}`;
    const cursor = start + prefix.length + value.length;
    input.focus();
    input.setSelectionRange(cursor, cursor);
    input.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function closePopovers(except = '') {
    ['rxFormPopover', 'rxDrugPopover'].forEach(id => {
      const node = document.getElementById(id);
      if (node && id !== except) node.hidden = true;
    });
  }

  function command(commandName) {
    if (commandName === 'form') {
      const node = $('#rxFormPopover');
      closePopovers('rxFormPopover');
      if (node) node.hidden = !node.hidden;
      return;
    }
    if (commandName === 'drug') {
      const node = $('#rxDrugPopover');
      closePopovers('rxDrugPopover');
      if (node) {
        node.hidden = !node.hidden;
        if (!node.hidden) setTimeout(() => $('#rxDrugSearch')?.focus(), 0);
      }
      return;
    }
    closePopovers();
    if (commandName === 'dose') insertAtCursor('Doza: ');
    if (commandName === 'quantity') insertAtCursor('Sasia: Scat. No I (Një kuti)\n');
    if (commandName === 'other') insertAtCursor('Tjetër: ');
    if (commandName === 'signature') insertAtCursor('S (Signatura): ');
  }

  function localParse(input = $('#rxComposer')?.value || '') {
    return Core.parse(input, $('#rxDiagnosis')?.value || '');
  }

  function resultToText(result) {
    return Core.formatText(result);
  }

  function medicationLine(item) {
    return Core.medicationLine(item);
  }

  function hasGeneratedSignature(result) {
    return Core.hasGeneratedSignature(result);
  }

  function reviewRequired() {
    return hasGeneratedSignature(state.result);
  }

  function dosageReviewRequired() {
    return state.selectedDrugs.some(drug => ['auto-filled', 'requires-review', 'edited'].includes(drug.dosageStatus));
  }

  function updateActionState() {
    const hasResult = Boolean(state.result);
    const ordersReady = structuredOrdersReady();
    const allowed = hasResult
      && ordersReady
      && (!reviewRequired() || state.generatedReviewConfirmed)
      && (!dosageReviewRequired() || state.dosageReviewConfirmed)
      && state.clinicalReviewConfirmed;

    ['rxSave', 'rxCopy', 'rxPrint'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = !allowed;
    });

    const review = $('#rxGeneratedReview');
    if (review) {
      review.hidden = !hasResult || !reviewRequired();
      const checkbox = review.querySelector('input');
      if (checkbox) checkbox.checked = state.generatedReviewConfirmed;
    }

    const dosageReview = $('#rxDosageReview');
    if (dosageReview) {
      dosageReview.hidden = !hasResult || !dosageReviewRequired();
      const checkbox = dosageReview.querySelector('input');
      if (checkbox) checkbox.checked = state.dosageReviewConfirmed;
    }

    const clinicalReview = $('#rxClinicalReview');
    if (clinicalReview) {
      clinicalReview.hidden = !hasResult;
      const checkbox = clinicalReview.querySelector('input');
      if (checkbox) {
        checkbox.checked = state.clinicalReviewConfirmed;
        checkbox.disabled = !ordersReady;
      }
      clinicalReview.classList.toggle('is-blocked', !ordersReady);
    }

    const status = $('#rxState');
    if (status && hasResult) {
      status.className = `rx-state ${allowed ? 'is-ready' : 'is-review'}`;
      status.textContent = allowed ? 'Gati' : 'Për kontroll';
    }
  }

  function resultMarkup(result) {
    const normalized = Core.normalizeResult(result);
    const issues = structuredOrderIssues();
    const reviewSummary = state.selectedDrugs.length
      ? `<div class="rx-review-summary ${issues.length ? 'is-incomplete' : 'is-ready'}">
          <strong>${issues.length ? 'Receta kërkon plotësim' : 'Fushat e barnave janë të plota'}</strong>
          <span>${issues.length
            ? esc(issues.map(item => `${item.drug.substance}: ${item.issues.join(', ')}`).join(' · '))
            : 'Kontrollo përmbajtjen përfundimtare para ruajtjes, kopjimit ose printimit.'}</span>
        </div>`
      : '';
    return `${reviewSummary}<article class="rx-paper"><pre class="rx-canonical-preview">${esc(resultToText(normalized))}</pre></article>`;
  }

  function showResult(rawResult, source = 'local') {
    const result = Core.normalizeResult(rawResult);
    if (!result) {
      clearResult();
      return;
    }
    state.result = result;
    state.source = source;
    state.generatedReviewConfirmed = false;
    state.dosageReviewConfirmed = false;
    state.clinicalReviewConfirmed = false;
    $('#rxPreview').innerHTML = resultMarkup(result);
    updateActionState();
  }

  function clearResult() {
    state.result = null;
    state.source = '';
    state.generatedReviewConfirmed = false;
    state.dosageReviewConfirmed = false;
    state.clinicalReviewConfirmed = false;
    $('#rxPreview').innerHTML = '<div class="rx-preview-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 5h6M9 3h6v4H9V3ZM6 5H4v16h16V5h-2M8 12h8M8 16h6"/></svg><strong>Parapamja shfaqet këtu</strong><span>Shto barin dhe plotëso udhëzimin. Gemini mund të ndihmojë vetëm me formulimin e Signaturës nga të dhënat që ke vendosur.</span></div>';
    const status = $('#rxState');
    status.className = 'rx-state is-draft';
    status.textContent = 'Draft';
    updateActionState();
  }

  function scheduleLocalPreview() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => {
      const result = localParse();
      if (result) showResult(result, 'local');
      else clearResult();
    }, 220);
  }

  function applyGeminiSignaturesToOrders(result) {
    if (!result || !state.selectedDrugs.length) return;
    const generated = [];
    result.sections.forEach(section => {
      section.medications.forEach(item => {
        if (!item.signatureGenerated || !text(item.individualSignature)) return;
        generated.push(item);
      });
    });
    if (!generated.length) return;

    state.selectedDrugs = state.selectedDrugs.map(drug => {
      if (drug.signaturaManual) return drug;
      const match = generated.find(item =>
        fold(item.name) === fold(drug.substance)
        && (!drug.strength || !item.dose || fold(item.dose) === fold(drug.strength))
      );
      return match ? { ...drug, signatura:text(match.individualSignature), aiSignatureGenerated:true } : drug;
    });

    const composer = $('#rxComposer');
    if (composer) {
      composer.value = state.selectedDrugs.map(drug => transferText(drug)).filter(Boolean).join('\n\n');
      state.composerOrigin = 'structured';
    }
    renderSelectedDrugs();
  }

  async function generateWithGemini() {
    if (!navigator.onLine) {
      formatLocally();
      setStatus('Je offline. Receta u formatua lokalisht; formulimi me Gemini kërkon internet.', 'success');
      return;
    }
    if (!text($('#rxComposer')?.value) && state.selectedDrugs.length) syncComposerFromOrders({ force:true });
    const input = text($('#rxComposer')?.value);
    const diagnosis = text($('#rxDiagnosis')?.value);
    if (!input && !state.selectedDrugs.length) {
      setStatus('Shto së paku një bar ose hape tekstin manual.', 'error');
      $('#rxAddDrugButton')?.focus();
      return;
    }

    const button = $('#rxGenerate');
    button.dataset.busy = 'true';
    button.disabled = true;
    button.querySelector('span:last-child').textContent = 'Duke formuluar…';
    setStatus('Gemini po formulon vetëm Signaturat nga doza, rruga, shpeshtësia dhe kohëzgjatja që ke plotësuar. Nuk vendos dozë ose rrugë të re.');

    try {
      const response = await fetch('/api/gemini-prescription', {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify({
          input,
          diagnosis,
          selectedDrugs:state.selectedDrugs,
          generateMissingSignatures:true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || 'Gemini nuk e përpunoi recetën.'), { code:payload.code });
      const normalized = Core.normalizeResult(payload.data);
      if (!normalized) throw new Error('Gemini ktheu një strukturë të pavlefshme.');
      showResult(normalized, payload.aiUsed ? 'gemini' : 'local');
      if (payload.generatedCount > 0) applyGeminiSignaturesToOrders(normalized);
      if (payload.generatedCount > 0) {
        setStatus(`Gemini formuloi ${payload.generatedCount} Signaturë${payload.generatedCount === 1 ? '' : 'a'} pa ndryshuar fushat klinike. Kontrolloji para përdorimit.`, 'success');
      } else if (payload.unresolvedCount > 0) {
        setStatus('Gemini nuk plotësoi Signaturën sepse mungojnë të dhëna klinike të strukturuara. Plotëso dozën, rrugën dhe shpeshtësinë manualisht.', 'error');
      } else {
        setStatus('Receta u strukturua pa ndryshuar udhëzimet klinike.', 'success');
      }
    } catch (error) {
      const fallback = localParse(input);
      if (fallback) showResult(fallback, 'local');
      const messages = {
        GEMINI_NOT_CONFIGURED:'Gemini nuk është konfiguruar në server. U përdor formatimi lokal.',
        GEMINI_RATE_LIMIT:'Gemini ka arritur limitin e përkohshëm. U përdor formatimi lokal.',
        GEMINI_AUTH:'Autentikimi i Gemini dështoi. U përdor formatimi lokal.',
        GEMINI_MODEL:'Modeli Gemini i konfiguruar nuk është i disponueshëm. U përdor formatimi lokal.',
        GEMINI_TIMEOUT:'Gemini zgjati më shumë se kufiri. U përdor formatimi lokal.',
      };
      setStatus(messages[error.code] || `${error.message} U përdor formatimi lokal.`, 'error');
    } finally {
      delete button.dataset.busy;
      syncAiAvailability();
    }
  }

  function formatLocally() {
    if (!text($('#rxComposer')?.value) && state.selectedDrugs.length) syncComposerFromOrders({ force:true });
    const result = localParse();
    if (!result) {
      setStatus('Nuk u identifikua asnjë bar. Shto barin nga regjistri ose hape tekstin manual.', 'error');
      $('#rxAddDrugButton')?.focus();
      return;
    }
    showResult(result, 'local');
    setStatus('Receta u formatua nga të dhënat aktuale. Asnjë fushë klinike që mungon nuk u plotësua automatikisht.', 'success');
  }

  function syncAiAvailability() {
    const button = $('#rxGenerate');
    if (!button || button.dataset.busy === 'true') return;
    const offline = !navigator.onLine;
    button.disabled = offline;
    button.setAttribute('aria-disabled', String(offline));
    button.title = offline
      ? 'Formulimi me Gemini kërkon lidhje me internet'
      : 'Gemini formulon vetëm Signaturën nga fushat klinike që ke plotësuar';
    button.querySelector('span:last-child').textContent = offline
      ? 'Gemini nuk është në dispozicion offline'
      : 'Formulo Signaturën me Gemini · online';
  }

  function resultFromProtocol(protocol) {
    if (Array.isArray(protocol?.sections) && protocol.sections.length) {
      return Core.normalizeResult({
        title:text(protocol.name || protocol.title) || 'Recetë',
        diagnosis:text(protocol.indication || protocol.diagnosis),
        sections:protocol.sections,
        notes:Array.isArray(protocol.notes) ? protocol.notes : text(protocol.notes) ? [text(protocol.notes)] : [],
        missing:Array.isArray(protocol.missing) ? protocol.missing : [],
      });
    }

    const items = Array.isArray(protocol?.items) ? protocol.items : [];
    const groupMeta = new Map((protocol?.administrationGroups || []).map(group => [String(group.id), group]));
    const grouped = new Map();
    const sections = [];

    items.forEach(item => {
      const groupId = text(item.administrationGroupId || item.mixtureGroupId || item.mixtureGroup);
      if (!groupId) {
        sections.push({
          title:text(item.route) ? `Administrim ${text(item.route)}` : 'Bar veçmas',
          type:'other',
          route:text(item.route),
          sharedSignature:'',
          sharedSignatureGenerated:false,
          medications:[{
            form:Core.formLabel(item.form || item.prefix),
            name:text(item.substance || item.tradeName),
            dose:text(item.dose || item.strength),
            quantity:'',
            dispenseQuantity:text(item.quantity),
            other:text(item.clinicalNotes),
            individualSignature:text(item.instructions),
            signatureGenerated:false,
          }],
        });
        return;
      }

      if (!grouped.has(groupId)) {
        const meta = groupMeta.get(groupId) || {};
        const section = {
          title:text(meta.title || item.administrationGroupTitle || item.mixtureGroup) || 'Grup administrimi',
          type:text(meta.type || item.administrationGroupType || item.mixtureType) || 'other',
          route:text(meta.route || item.administrationRoute || item.route),
          sharedSignature:text(meta.signature || item.sharedSignature || item.instructions),
          sharedSignatureGenerated:false,
          medications:[],
        };
        grouped.set(groupId, section);
        sections.push(section);
      }

      grouped.get(groupId).medications.push({
        form:Core.formLabel(item.form || item.prefix),
        name:text(item.substance || item.tradeName),
        dose:text(item.dose || item.strength),
        quantity:text(item.mixtureRole === 'base' ? item.quantity : ''),
        dispenseQuantity:text(item.mixtureRole === 'base' ? '' : item.quantity),
        other:text(item.clinicalNotes),
        individualSignature:'',
        signatureGenerated:false,
      });
    });

    return Core.normalizeResult({
      title:text(protocol?.name) || 'Recetë',
      diagnosis:text(protocol?.indication),
      sections,
      notes:text(protocol?.notes) ? [text(protocol.notes)] : [],
      missing:[],
    });
  }

  function protocolFromResult(result) {
    const now = new Date().toISOString();
    const existing = state.editingId ? getSaved().find(item => String(item.id) === String(state.editingId)) : null;
    const normalized = Core.normalizeResult(result);
    const items = normalized.sections.flatMap((section, sectionIndex) => section.medications.map((item, itemIndex) => {
      const selectedDrug = state.selectedDrugs.find(drug =>
        fold(drug.substance) === fold(item.name)
        && (!drug.strength || !item.dose || fold(drug.strength) === fold(item.dose))
      );
      const structuredClinical = state.composerOrigin === 'structured' ? selectedDrug : null;
      return {
        drugKey:selectedDrug?.key || `manual_${sectionIndex}_${itemIndex}_${item.name}`,
        tradeName:selectedDrug?.tradeName || '',
        substance:item.name,
        strength:selectedDrug?.strength || item.dose,
        form:selectedDrug?.form || item.form,
        prefix:selectedDrug?.form || item.form,
        dose:structuredClinical?.doseInstruction || item.dose,
        doseInstruction:structuredClinical?.doseInstruction || '',
        quantity:structuredClinical?.dispense || item.dispenseQuantity || item.quantity,
        route:structuredClinical?.route || section.route,
        frequency:structuredClinical?.frequency || '',
        duration:structuredClinical?.duration || '',
        instructions:structuredClinical?.signatura || item.individualSignature || section.sharedSignature,
        additionalInstructions:structuredClinical?.additionalInstructions || '',
        clinicalNotes:item.other,
        administrationGroupId:section.medications.length > 1 ? `section_${sectionIndex}` : '',
        administrationGroupType:section.type,
        administrationGroupTitle:section.title,
        administrationRoute:selectedDrug?.route || section.route,
        sharedSignature:section.sharedSignature,
        mixtureRole:section.type === 'infusion' && itemIndex === 0 ? 'base' : 'additive',
        qualityStatus:'verified',
        dosageProvenance:selectedDrug ? {
          regimenId:selectedDrug.regimenId,
          sourceUrl:selectedDrug.sourceUrl,
          matchKey:selectedDrug.matchKey,
          population:selectedDrug.dosagePopulation,
          verificationStatus:selectedDrug.verificationStatus,
          status:selectedDrug.dosageStatus,
        } : null,
      };
    }));

    const context = window.MedIndexPrescriptionContext?.getContext?.() || {};
    return {
      id:state.editingId || uid(),
      chapterKey:text($('#rxChapterSelect')?.value) || classifyChapter({ diagnosis:normalized.diagnosis }),
      name:normalized.title || `Recetë – ${new Date().toLocaleDateString('sq-AL')}`,
      indication:normalized.diagnosis || text($('#rxDiagnosis')?.value),
      allergies:existing?.allergies || '',
      population:context.pediatric ? 'pediatric' : 'adult',
      patientName:existing?.patientName || '',
      birthDate:existing?.birthDate || '',
      patientId:existing?.patientId || '',
      patientType:context.pediatric ? 'pediatric' : 'adult',
      notes:normalized.notes,
      missing:normalized.missing,
      sections:normalized.sections,
      sourceText:$('#rxComposer')?.value || resultToText(normalized),
      selectedDrugs:state.selectedDrugs.map(drug => ({ ...drug })),
      clinicalContext:context,
      formatVersion:4,
      aiStructured:state.source === 'gemini',
      generatedSignatureReviewed:state.generatedReviewConfirmed,
      dosageReviewed:state.dosageReviewConfirmed,
      clinicalReview:state.clinicalReviewConfirmed,
      reviewedAt:state.clinicalReviewConfirmed ? now : '',
      createdAt:existing?.createdAt || now,
      updatedAt:now,
      items,
    };
  }

  function ensureActionAllowed() {
    if (!state.result) return false;
    const issues = structuredOrderIssues();
    if (issues.length) {
      setStatus(`Plotëso fushat e detyrueshme para vazhdimit: ${issues.map(item => `${item.drug.substance} (${item.issues.join(', ')})`).join(' · ')}.`, 'error');
      document.querySelector(`[data-order-key="${CSS.escape(issues[0].key)}"] [data-order-field]`)?.focus();
      return false;
    }
    if (reviewRequired() && !state.generatedReviewConfirmed) {
      setStatus('Konfirmo kontrollin e Signaturave të formuluara nga Gemini.', 'error');
      $('#rxGeneratedReview input')?.focus();
      return false;
    }
    if (dosageReviewRequired() && !state.dosageReviewConfirmed) {
      setStatus('Konfirmo kontrollin klinik të skemës së dozologjisë para këtij veprimi.', 'error');
      $('#rxDosageReview input')?.focus();
      return false;
    }
    if (!state.clinicalReviewConfirmed) {
      setStatus('Konfirmo kontrollin e recetës përfundimtare para ruajtjes, kopjimit ose printimit.', 'error');
      $('#rxClinicalReview input')?.focus();
      return false;
    }
    return true;
  }

  function saveCurrent() {
    if (!ensureActionAllowed()) return;
    const protocol = protocolFromResult(state.result);
    const all = getSaved();
    const index = all.findIndex(item => String(item.id) === String(protocol.id));
    if (index >= 0) all[index] = protocol;
    else all.unshift(protocol);
    state.editingId = protocol.id;
    setSaved(all);
    toast('Receta u ruajt në dosje.');
    const chapter = chapterByKey(protocol.chapterKey);
    setStatus(`Receta u ruajt te dosja “${chapter.title}” dhe do të sinkronizohet me bibliotekën personale.`, 'success');
  }

  async function copyCurrent() {
    if (!ensureActionAllowed()) return;
    const value = resultToText(state.result);
    try { await navigator.clipboard.writeText(value); }
    catch {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast('Receta u kopjua.');
  }

  function printCurrent() {
    if (!ensureActionAllowed()) return;
    const value = resultToText(state.result);
    const popup = window.open('', '_blank', 'width=920,height=780');
    if (!popup) { toast('Shfletuesi e bllokoi dritaren e printimit.'); return; }
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recetë</title><style>body{max-width:820px;margin:32px auto;padding:0 24px;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.55 Arial,sans-serif}@media print{body{margin:0;padding:0}}</style></head><body><pre>${esc(value)}</pre><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  function resetComposer() {
    state.editingId = '';
    state.selectedDrugs = [];
    state.generatedReviewConfirmed = false;
    state.dosageReviewConfirmed = false;
    state.clinicalReviewConfirmed = false;
    state.dosageEdited = false;
    state.composerOrigin = 'structured';
    $('#rxComposer').value = '';
    $('#rxDiagnosis').value = '';
    if ($('#rxFreeTextPanel')) $('#rxFreeTextPanel').open = false;
    state.chapterManuallySelected = false;
    if ($('#rxChapterSelect')) $('#rxChapterSelect').value = 'te-tjera';
    if ($('#rxDraftLabel')) $('#rxDraftLabel').textContent = 'Draft i ri';
    renderSelectedDrugs();
    syncChapterSuggestion({ force:true });
    clearResult();
    closePopovers();
    setStatus('');
    $('#rxAddDrugButton')?.focus();
  }

  function openSaved(id) {
    const protocol = getSaved().find(item => String(item.id) === String(id));
    if (!protocol) return;
    state.editingId = protocol.id;
    state.selectedDrugs = Array.isArray(protocol.selectedDrugs) ? protocol.selectedDrugs.map(normalizeDrug) : [];
    state.composerOrigin = 'manual';
    renderSelectedDrugs();
    const result = resultFromProtocol(protocol);
    $('#rxDiagnosis').value = result?.diagnosis || '';
    $('#rxComposer').value = text(protocol.sourceText) || resultToText(result);
    const storedChapter = chapterByKey(protocol.chapterKey || classifyChapter({ diagnosis:result?.diagnosis || '', selectedDrugs:state.selectedDrugs })).slug;
    if ($('#rxChapterSelect')) $('#rxChapterSelect').value = storedChapter;
    state.chapterManuallySelected = true;
    if ($('#rxChapterSuggestion')) $('#rxChapterSuggestion').textContent = 'dosja e ruajtur';
    if ($('#rxDraftLabel')) $('#rxDraftLabel').textContent = 'Duke redaktuar';
    showResult(result, protocol.aiStructured ? 'gemini' : 'local');
    state.generatedReviewConfirmed = Boolean(protocol.generatedSignatureReviewed && hasGeneratedSignature(result));
    state.dosageReviewConfirmed = Boolean(protocol.dosageReviewed && dosageReviewRequired());
    state.clinicalReviewConfirmed = false;
    updateActionState();
    window.scrollTo({ top:0, behavior:'smooth' });
    setStatus('Receta e ruajtur u hap për editim. Kërkohet kontroll i ri para ruajtjes së ndryshimeve.', 'success');
  }

  function duplicateSaved(id) {
    const protocol = getSaved().find(item => String(item.id) === String(id));
    if (!protocol) return;
    const now = new Date().toISOString();
    const copy = {
      ...protocol,
      id:uid(),
      name:`${text(protocol.name) || 'Recetë'} — kopje`,
      createdAt:now,
      updatedAt:now,
      clinicalReview:false,
      reviewedAt:'',
      generatedSignatureReviewed:false,
    };
    setSaved([copy, ...getSaved()]);
    toast('U krijua një kopje.');
  }

  function deleteSaved(id) {
    setSaved(getSaved().filter(item => String(item.id) !== String(id)));
    if (state.editingId === id) state.editingId = '';
    toast('Receta u fshi.');
  }

  function moveSavedToChapter(id, chapterKey) {
    const chapter = chapterByKey(chapterKey);
    const all = getSaved();
    const item = all.find(protocol => String(protocol.id) === String(id));
    if (!item) return;
    item.chapterKey = chapter.slug;
    item.updatedAt = new Date().toISOString();
    setSaved(all);
    toast(`Receta u zhvendos te “${chapter.title}”.`);
  }

  function renderSaved() {
    const list = $('#rxSavedList');
    if (!list) return;
    const query = fold($('#rxSavedSearch')?.value);
    const all = getSaved().map(protocol => ({
      ...protocol,
      chapterKey:chapterByKey(protocol.chapterKey || classifyChapter({
        diagnosis:protocol.indication || protocol.diagnosis || '',
        selectedDrugs:Array.isArray(protocol.selectedDrugs) ? protocol.selectedDrugs : [],
      })).slug,
    }));
    $('#rxSavedCount').textContent = all.length;
    renderChapterNav(all);

    const active = state.activeChapter === 'all' ? null : chapterByKey(state.activeChapter);
    if ($('#rxActiveChapterTitle')) $('#rxActiveChapterTitle').textContent = active?.title || 'Të gjitha recetat';
    if ($('#rxActiveChapterDescription')) $('#rxActiveChapterDescription').textContent = active?.description || 'Biblioteka e plotë';
    if ($('#rxActiveChapterMetric')) $('#rxActiveChapterMetric').textContent = active?.title || 'Të gjitha recetat';

    const filtered = all.filter(protocol => {
      if (active && protocol.chapterKey !== active.slug) return false;
      const result = resultFromProtocol(protocol);
      const meds = (result?.sections || []).flatMap(section => section.medications || []).map(item => item.name).join(' ');
      return !query || fold(`${protocol.name || ''} ${protocol.indication || ''} ${meds}`).includes(query);
    });
    $('#rxVisibleSavedCount').textContent = String(filtered.length);
    $('#rxActiveChapterCount').textContent = String(filtered.length);

    if (!filtered.length) {
      list.innerHTML = `<div class="rx-saved-empty">${all.length ? 'Nuk u gjet asnjë recetë në këtë dosje për kërkimin aktual.' : 'Ende nuk ka receta të ruajtura.'}</div>`;
      return;
    }

    const chapterOptions = chapterCatalog().map(chapter => `<option value="${esc(chapter.slug)}">${esc(chapter.title)}</option>`).join('');
    list.innerHTML = filtered.map(protocol => {
      const result = resultFromProtocol(protocol);
      const medicationCount = result?.sections.reduce((sum, section) => sum + section.medications.length, 0) || 0;
      const chapter = chapterByKey(protocol.chapterKey);
      const options = chapterOptions.replace(`value="${esc(chapter.slug)}"`, `value="${esc(chapter.slug)}" selected`);
      return `<article class="rx-saved-card" data-saved-id="${esc(protocol.id)}">
        <div class="rx-saved-card-head"><h3>${esc(result?.title || 'Recetë')}</h3><time>${new Date(protocol.updatedAt || Date.now()).toLocaleDateString('sq-AL')}</time></div>
        <p>${esc(result?.diagnosis || 'Pa diagnozë të shënuar')}</p>
        <div class="rx-saved-tags"><span class="rx-saved-chapter">${esc(chapter.title)}</span><span>${result?.sections.length || 0} grupe</span><span>${medicationCount} barna</span>${protocol.aiStructured ? '<span>AI</span>' : ''}</div>
        <div class="rx-saved-actions">
          <button type="button" data-open-saved="${esc(protocol.id)}">Hape</button>
          <button type="button" data-duplicate-saved="${esc(protocol.id)}">Dupliko</button>
          <select data-move-saved="${esc(protocol.id)}" aria-label="Zhvendose recetën në dosje">${options}</select>
          <button class="danger" type="button" data-delete-saved="${esc(protocol.id)}" aria-label="Fshije recetën">×</button>
        </div>
      </article>`;
    }).join('');
  }

  function searchReasonLabel(reason) {
    const labels = {
      registry_pdid_exact:'Nr. regjistri + PDID',
      registry_exact:'Nr. regjistri',
      pdid_exact:'PDID',
      atc_exact:'ATC',
      trade_exact:'Emër tregtar',
      substance_exact:'Substancë aktive',
      trade_prefix:'Emër tregtar',
      substance_prefix:'Substancë aktive',
      atc_prefix:'ATC',
      identity_token_all:'Përputhje e kombinuar',
      phrase_contains:'Përputhje në të dhëna',
      token_all:'Përputhje në të dhëna',
      trade_fuzzy:'Emër i ngjashëm',
      substance_fuzzy:'Substancë e ngjashme',
    };
    return labels[text(reason)] || '';
  }

  function renderDrugSearchResults(results, query) {
    const holder = $('#rxDrugResults');
    const rows = Array.isArray(results) ? results : [];
    if (!rows.length) {
      holder.innerHTML = `<div class="rx-drug-search-empty"><strong>Nuk u gjet asnjë bar</strong><span>Provo emrin tregtar, substancën, ATC, PDID, nr. e regjistrit ose kombino emrin me fortësinë/formën.</span></div>`;
      return;
    }
    holder.innerHTML = `<div class="rx-drug-search-summary"><span><strong>${rows.length}</strong> rezultate për “${esc(query)}”</span><small>Rezultatet renditen sipas përputhjes klinike të identitetit.</small></div>` + rows.map((drug, index) => {
      const rank = Number(drug.matchRank);
      const exact = Number.isFinite(rank) && rank <= 13;
      const reason = searchReasonLabel(drug.matchReason);
      const substance = drug.substance || drug.activeSubstance || '';
      const identity = [substance || drug.tradeName, drug.strength].filter(Boolean).join(' ');
      const identifiers = [
        drug.registryNumber != null && drug.registryNumber !== '' ? `Nr. ${drug.registryNumber}` : '',
        drug.pdid ? `PDID ${drug.pdid}` : '',
      ].filter(Boolean).join(' · ');
      const metadata = [
        drug.tradeName && fold(drug.tradeName) !== fold(substance) ? drug.tradeName : '',
        Core.formLabel(drug.form),
        drug.packaging,
        drug.atc ? `ATC ${drug.atc}` : '',
      ].filter(Boolean).join(' · ');
      return `<button class="rx-drug-result${exact ? ' is-exact' : ''}${/fuzzy/.test(drug.matchReason || '') ? ' is-fuzzy' : ''}" type="button" data-drug-result="${esc(encodeURIComponent(JSON.stringify(drug)))}" data-search-index="${index}">
        <span class="rx-drug-result-main">
          <strong>${esc([Core.prefixForForm(drug.form), identity].filter(Boolean).join(' '))}</strong>
          ${metadata ? `<small>${esc(metadata)}</small>` : ''}
          ${identifiers ? `<small class="rx-drug-identifiers">${esc(identifiers)}</small>` : ''}
        </span>
        <span class="rx-drug-result-action">${reason ? `<small>${esc(reason)}</small>` : ''}<b aria-hidden="true">+</b></span>
      </button>`;
    }).join('');
  }

  async function searchDrugs(query) {
    const holder = $('#rxDrugResults');
    const value = text(query).replace(/\s+/g, ' ');
    const singleNumeric = /^\d$/.test(value);
    if (value.length < 2 && !singleNumeric) {
      holder.innerHTML = '<p>Shkruaj së paku 2 shkronja, ose numrin e regjistrit.</p>';
      return;
    }

    const cacheKey = fold(value);
    const cached = state.searchCache.get(cacheKey);
    if (cached) {
      renderDrugSearchResults(cached, value);
      return;
    }

    const sequence = ++state.searchSequence;
    state.searchController?.abort();
    state.searchController = new AbortController();
    holder.innerHTML = '<div class="rx-drug-search-loading"><span></span><p>Duke kërkuar në regjistrin e barnave…</p></div>';

    try {
      const response = await fetch(`/api/drug-search?q=${encodeURIComponent(value)}&limit=50`, {
        credentials:'same-origin',
        cache:'no-store',
        signal:state.searchController.signal,
        headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (sequence !== state.searchSequence) return;
      if (!response.ok) throw new Error(payload.error || 'Kërkimi dështoi.');
      const results = Array.isArray(payload.results) ? payload.results : [];
      state.searchCache.set(cacheKey, results);
      if (state.searchCache.size > 40) state.searchCache.delete(state.searchCache.keys().next().value);
      renderDrugSearchResults(results, value);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (sequence !== state.searchSequence) return;
      holder.innerHTML = `<div class="rx-drug-search-empty is-error"><strong>Kërkimi nuk u krye</strong><span>${esc(error.message)}</span><button type="button" data-search-retry>Provo përsëri</button></div>`;
    }
  }

  function bindEvents() {
    window.addEventListener('medindex:prescription-context-change', event => {
      const pending = state.pendingRouteDrug;
      if (!pending || !event.detail?.valid) return;
      const context = event.detail.context || window.MedIndexPrescriptionContext?.getContext?.();
      const administration = window.MedIndexPrescriptionContext?.drugAdministration?.(pending.raw)
        || window.MedIndexAdministrationRoutes?.inferAdministration?.(pending.raw)
        || {};
      if (administration.category && context?.administrationCategory !== administration.category) return;
      if (Array.isArray(administration.routes) && administration.routes.length && !administration.routes.includes(context?.route)) return;
      const raw = !administration.category && pending.manualAdministration
        ? { ...pending.raw, administrationCategory:context.administrationCategory, allowedRoutes:[context.route], route:context.route }
        : pending.raw;
      state.pendingRouteDrug = null;
      void addDrugWithDosage(raw, { ...pending.options, skipRegistryHydration:true })
        .catch(() => setStatus('Bari nuk u shtua. Provo përsëri.', 'error'));
    });

    document.querySelectorAll('[data-rx-command]').forEach(button => button.addEventListener('click', () => command(button.dataset.rxCommand)));

    const openDrugPicker = () => {
      const node = $('#rxDrugPopover');
      closePopovers('rxDrugPopover');
      if (!node) return;
      node.hidden = !node.hidden;
      $('#rxAddDrugButton')?.setAttribute('aria-expanded', String(!node.hidden));
      if (!node.hidden) setTimeout(() => $('#rxDrugSearch')?.focus(), 0);
    };
    $('#rxAddDrugButton')?.addEventListener('click', openDrugPicker);

    $('#rxFormPopover')?.addEventListener('click', event => {
      const button = event.target.closest('[data-form-value]');
      if (!button) return;
      insertAtCursor(`(${Core.formLabel(button.dataset.formValue)}) `);
      closePopovers();
    });

    $('#rxDrugSearch')?.addEventListener('input', event => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => searchDrugs(event.target.value), 170);
    });
    $('#rxDrugSearch')?.addEventListener('keydown', event => {
      const first = $('#rxDrugResults')?.querySelector('[data-drug-result]');
      if (event.key === 'Enter' && first) {
        event.preventDefault();
        first.click();
        return;
      }
      if (event.key !== 'ArrowDown' || !first) return;
      event.preventDefault();
      first.focus();
    });
    $('#rxDrugResults')?.addEventListener('keydown', event => {
      const current = event.target.closest('[data-drug-result]');
      if (!current || !['ArrowDown','ArrowUp'].includes(event.key)) return;
      const buttons = [...$('#rxDrugResults').querySelectorAll('[data-drug-result]')];
      const index = buttons.indexOf(current);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown'
        ? buttons[Math.min(buttons.length - 1, index + 1)]
        : (index === 0 ? $('#rxDrugSearch') : buttons[index - 1]);
      next?.focus();
    });

    $('#rxDrugResults')?.addEventListener('click', event => {
      const retry = event.target.closest('[data-search-retry]');
      if (retry) {
        state.searchCache.delete(fold($('#rxDrugSearch')?.value));
        void searchDrugs($('#rxDrugSearch')?.value);
        return;
      }
      const button = event.target.closest('[data-drug-result]');
      if (!button) return;
      try {
        const drug = JSON.parse(decodeURIComponent(button.dataset.drugResult));
        void addDrugWithDosage(drug).catch(() => setStatus('Bari nuk u shtua. Provo përsëri.', 'error'));
      } catch {
        setStatus('Të dhënat e barit nuk u lexuan.', 'error');
      }
      closePopovers();
      $('#rxAddDrugButton')?.setAttribute('aria-expanded', 'false');
    });

    $('#rxSelectedDrugs')?.addEventListener('click', event => {
      const remove = event.target.closest('[data-remove-drug]');
      if (remove) {
        removeSelectedDrug(remove.dataset.removeDrug);
        return;
      }
      const sync = event.target.closest('[data-sync-orders-to-text]');
      if (sync) {
        syncComposerFromOrders({ force:true });
        if ($('#rxFreeTextPanel')) $('#rxFreeTextPanel').open = true;
        setStatus('Teksti u përditësua nga fushat e strukturuara.', 'success');
        $('#rxComposer')?.focus();
      }
    });

    $('#rxSelectedDrugs')?.addEventListener('input', event => {
      const field = event.target.closest('[data-order-field]');
      const card = event.target.closest('[data-order-key]');
      if (!field || !card || field.tagName === 'SELECT') return;
      updateOrderField(card.dataset.orderKey, field.dataset.orderField, field.value);
    });
    $('#rxSelectedDrugs')?.addEventListener('change', event => {
      const field = event.target.closest('[data-order-field]');
      const card = event.target.closest('[data-order-key]');
      if (!field || !card) return;
      updateOrderField(card.dataset.orderKey, field.dataset.orderField, field.value);
    });

    $('#rxComposer')?.addEventListener('input', event => {
      if (event.isTrusted) {
        state.composerOrigin = 'manual';
        state.clinicalReviewConfirmed = false;
        if (dosageReviewRequired()) {
          state.dosageEdited = true;
          state.dosageReviewConfirmed = false;
          state.selectedDrugs = state.selectedDrugs.map(drug =>
            ['auto-filled', 'requires-review'].includes(drug.dosageStatus)
              ? { ...drug, dosageStatus:'edited' }
              : drug
          );
        }
      }
      scheduleLocalPreview();
    }, { passive:true });

    $('#rxComposer')?.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        formatLocally();
      }
    });

    $('#rxDiagnosis')?.addEventListener('input', () => {
      state.clinicalReviewConfirmed = false;
      scheduleLocalPreview();
      syncChapterSuggestion();
    }, { passive:true });

    $('#rxChapterSelect')?.addEventListener('change', event => {
      state.chapterManuallySelected = true;
      state.clinicalReviewConfirmed = false;
      const chapter = chapterByKey(event.target.value);
      if ($('#rxChapterSuggestion')) $('#rxChapterSuggestion').textContent = `zgjedhur manualisht · ${chapter.title}`;
      updateActionState();
    });

    $('#rxGenerate')?.addEventListener('click', generateWithGemini);
    $('#rxFormatLocal')?.addEventListener('click', formatLocally);
    window.addEventListener('online', syncAiAvailability);
    window.addEventListener('offline', syncAiAvailability);
    $('#rxClear')?.addEventListener('click', resetComposer);
    $('#rxNew')?.addEventListener('click', resetComposer);
    $('#rxSave')?.addEventListener('click', saveCurrent);
    $('#rxCopy')?.addEventListener('click', copyCurrent);
    $('#rxPrint')?.addEventListener('click', printCurrent);

    $('#rxGeneratedReview input')?.addEventListener('change', event => {
      state.generatedReviewConfirmed = Boolean(event.target.checked);
      state.clinicalReviewConfirmed = false;
      updateActionState();
      setStatus(state.generatedReviewConfirmed ? 'Formulimi i Gemini u kontrollua.' : 'Konfirmimi i formulimit u hoq.', state.generatedReviewConfirmed ? 'success' : '');
    });

    $('#rxDosageReview input')?.addEventListener('change', event => {
      state.dosageReviewConfirmed = Boolean(event.target.checked);
      state.clinicalReviewConfirmed = false;
      updateActionState();
      setStatus(state.dosageReviewConfirmed ? 'Skema e dozologjisë u kontrollua.' : 'Konfirmimi i dozologjisë u hoq.', state.dosageReviewConfirmed ? 'success' : '');
    });

    $('#rxClinicalReview input')?.addEventListener('change', event => {
      if (!structuredOrdersReady()) {
        event.target.checked = false;
        state.clinicalReviewConfirmed = false;
        updateActionState();
        setStatus('Plotëso fushat e detyrueshme të barnave para kontrollit përfundimtar.', 'error');
        return;
      }
      state.clinicalReviewConfirmed = Boolean(event.target.checked);
      updateActionState();
      setStatus(state.clinicalReviewConfirmed ? 'Receta përfundimtare u konfirmua për këtë version.' : 'Kontrolli përfundimtar u hoq.', state.clinicalReviewConfirmed ? 'success' : '');
    });

    syncAiAvailability();
    $('#rxDosageChoice')?.addEventListener('change', event => {
      const apply = $('#rxDosageApply');
      if (apply) apply.disabled = !event.target.value;
    });
    $('#rxDosageApply')?.addEventListener('click', () => closeDosageChooser({ mode:'apply' }));
    $('#rxDosageManual')?.addEventListener('click', () => closeDosageChooser({ mode:'manual' }));
    $('#rxDosageCancel')?.addEventListener('click', () => closeDosageChooser({ mode:'cancel' }));
    $('#rxDosageChooser')?.addEventListener('click', event => { if (event.target.id === 'rxDosageChooser') closeDosageChooser({ mode:'cancel' }); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#rxDosageChooser')?.hidden) closeDosageChooser({ mode:'cancel' });
    });

    $('#rxSavedSearch')?.addEventListener('input', renderSaved, { passive:true });
    $('#rxSavedList')?.addEventListener('click', event => {
      const open = event.target.closest('[data-open-saved]');
      const duplicate = event.target.closest('[data-duplicate-saved]');
      const remove = event.target.closest('[data-delete-saved]');
      if (open) openSaved(open.dataset.openSaved);
      if (duplicate) duplicateSaved(duplicate.dataset.duplicateSaved);
      if (remove) deleteSaved(remove.dataset.deleteSaved);
    });
    $('#rxSavedList')?.addEventListener('change', event => {
      const select = event.target.closest('[data-move-saved]');
      if (select) moveSavedToChapter(select.dataset.moveSaved, select.value);
    });
    document.querySelector('.rx-folder-panel')?.addEventListener('click', event => {
      const button = event.target.closest('[data-rx-chapter]');
      if (!button) return;
      state.activeChapter = button.dataset.rxChapter || 'all';
      renderSaved();
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.rx-command-bar,.rx-popover,#rxAddDrugButton')) {
        closePopovers();
        $('#rxAddDrugButton')?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async function init() {
    window.DRxRxShell?.init();
    try {
      const authPayload = await window.DRxRxShell?.ensureAuth();
      await window.DRxRxShell?.syncProfile(authPayload);
    } catch {
      return;
    }
    if (!Core) {
      setStatus('Moduli i formatimit të recetës nuk u ngarkua. Rifresko faqen.', 'error');
      $('#appShell')?.setAttribute('aria-busy', 'false');
      return;
    }
    document.documentElement.dataset.theme = 'light';
    try { await Promise.race([window.MEDINDEX_LIBRARY_READY || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 2200))]); } catch {}
    populateChapterSelect();
    bindEvents();
    migrateLegacyChapterAssignments();
    renderSaved();
    loadSelection();
    syncChapterSuggestion({ force:true });
    updateActionState();
    const synced = window.MedIndexUserLibrary?.diagnostics?.();
    if ($('#rxLibraryState')) $('#rxLibraryState').textContent = synced && !synced.dirty ? 'Sinkronizuar' : 'Lokale';
    if ($('#syncText')) $('#syncText').textContent = 'Supabase';
    if ($('#sourceStatus')) $('#sourceStatus').textContent = 'Recetat personale · Supabase';
    $('#appShell')?.setAttribute('aria-busy', 'false');
    $('#rxAddDrugButton')?.focus({ preventScroll:true });
    window.addEventListener('medindex:library-ready', () => { populateChapterSelect(); renderSaved(); });
    window.addEventListener('medindex:library-synced', () => {
      if ($('#rxLibraryState')) $('#rxLibraryState').textContent = 'Sinkronizuar';
      populateChapterSelect();
      renderSaved();
    });
    window.addEventListener('medindex:library-pending', () => {
      if ($('#rxLibraryState')) $('#rxLibraryState').textContent = 'Lokale';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();


(() => {
  'use strict';

  const DOCUMENT_VERSION = 'prescription-diagnosis-document-v1';

  function ensureDocumentAssets() {
    window.MedIndexPrescriptionDocument?.init?.(window);
  }

  function showBlockedMessage() {
    const toast = document.getElementById('rxToast');
    if (!toast) return;
    toast.textContent = 'Shfletuesi e bllokoi dritaren e printimit.';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function appendDiagnosisSection(targetDocument, model) {
    if (!model?.primary && !model?.secondary?.length) return;
    const section = targetDocument.createElement('section');
    section.className = 'diagnoses';

    if (model.primary) {
      const group = targetDocument.createElement('div');
      group.className = 'diagnosis-group primary';
      const label = targetDocument.createElement('span');
      label.textContent = 'Diagnoza kryesore';
      const value = targetDocument.createElement('strong');
      value.textContent = model.primary.display || model.primary.titleSq || model.primary.titleEn || '';
      group.append(label, value);
      section.appendChild(group);
    }

    if (Array.isArray(model.secondary) && model.secondary.length) {
      const group = targetDocument.createElement('div');
      group.className = 'diagnosis-group secondary';
      const label = targetDocument.createElement('span');
      label.textContent = 'Diagnozat shoqëruese';
      const list = targetDocument.createElement('ul');
      model.secondary.forEach(item => {
        const row = targetDocument.createElement('li');
        const code = targetDocument.createElement('strong');
        code.textContent = item.code || '';
        const title = targetDocument.createElement('span');
        title.textContent = item.titleSq || item.titleEn || '';
        row.append(code, title);
        list.appendChild(row);
      });
      group.append(label, list);
      section.appendChild(group);
    }
    targetDocument.body.appendChild(section);
  }

  function buildPrintDocument(popup, prescriptionText, model) {
    const targetDocument = popup.document;
    targetDocument.open();
    targetDocument.write('<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recetë</title></head><body></body></html>');
    targetDocument.close();

    const style = targetDocument.createElement('style');
    style.textContent = '@page{size:A4;margin:18mm}*{box-sizing:border-box}body{max-width:820px;margin:0 auto;color:#111;font-family:Arial,sans-serif}.document-head{display:flex;justify-content:space-between;align-items:end;padding-bottom:14px;border-bottom:2px solid #173f42}.document-head h1{margin:0;font-size:25px}.document-head span{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b6264}.diagnoses{display:grid;gap:12px;margin:18px 0;padding:15px 17px;border:1px solid #cbd8d9;border-radius:10px;background:#f7faf9}.diagnosis-group{display:grid;gap:5px}.diagnosis-group+.diagnosis-group{padding-top:12px;border-top:1px solid #d7e1e2}.diagnosis-group>span{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#536b6d}.diagnosis-group>strong{font-size:15px;line-height:1.45}.diagnosis-group ul{display:grid;gap:6px;margin:0;padding:0;list-style:none}.diagnosis-group li{display:grid;grid-template-columns:58px 1fr;gap:8px;font-size:14px;line-height:1.4}.diagnosis-group li>strong{color:#174f53}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.55 Arial,sans-serif}@media print{body{margin:0}.diagnoses{break-inside:avoid;background:#fff}}';
    targetDocument.head.appendChild(style);

    const header = targetDocument.createElement('header');
    header.className = 'document-head';
    const title = targetDocument.createElement('h1');
    title.textContent = 'Recetë';
    const brand = targetDocument.createElement('span');
    brand.textContent = 'MedIndex';
    header.append(title, brand);
    targetDocument.body.appendChild(header);

    appendDiagnosisSection(targetDocument, model);

    const preview = targetDocument.createElement('pre');
    preview.textContent = prescriptionText;
    targetDocument.body.appendChild(preview);
  }

  function printPreview(event) {
    const button = event.currentTarget;
    if (button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const preview = document.querySelector('#rxPreview .rx-canonical-preview');
    const prescriptionText = String(preview?.textContent || '').trim();
    if (!prescriptionText) return;
    const model = window.MedIndexPrescriptionDocument?.currentModel?.() || null;

    const popup = window.open('', '_blank', 'width=920,height=780');
    if (!popup) return showBlockedMessage();
    try { popup.opener = null; } catch {}

    try {
      buildPrintDocument(popup, prescriptionText, model);
      const runPrint = () => {
        try { popup.focus(); popup.print(); } catch {}
      };
      if (popup.document.readyState === 'complete') window.setTimeout(runPrint, 80);
      else popup.addEventListener('load', runPrint, { once:true });
    } catch {
      try { popup.close(); } catch {}
      showBlockedMessage();
    }
  }

  function install() {
    ensureDocumentAssets();
    const original = document.getElementById('rxPrint');
    if (!original || original.dataset.safePrint === '1') return;
    const button = original.cloneNode(true);
    button.dataset.safePrint = '1';
    original.replaceWith(button);
    button.addEventListener('click', printPreview, { capture:true });
  }

  ensureDocumentAssets();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();


(() => {
  'use strict';

  const TRANSFER_KEY = 'medindexPrescriptionProtocolDraft';
  const PROTOCOL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
  const HASH_PATTERN = /^[a-f0-9]{64}$/i;

  const clean = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const boundedMultiline = (value, max = 6000) => String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

  function readTransfer() {
    try {
      const raw = sessionStorage.getItem(TRANSFER_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(TRANSFER_KEY);
      const value = JSON.parse(raw);
      if (Number(value?.version) !== 1) return null;
      const protocolId = clean(value.protocolId, 64);
      const sourceHash = clean(value.sourceHash, 64).toLowerCase();
      if (!PROTOCOL_ID_PATTERN.test(protocolId) || !HASH_PATTERN.test(sourceHash)) return null;
      return {
        protocolId,
        sourceHash,
        protocolTitle:clean(value.protocolTitle, 200),
        diagnosis:clean(value.diagnosis, 200),
        composer:boundedMultiline(value.composer),
        createdAt:clean(value.createdAt, 40),
      };
    } catch {
      try { sessionStorage.removeItem(TRANSFER_KEY); } catch {}
      return null;
    }
  }

  async function sourceStillMatches(transfer) {
    try {
      const response = await fetch('/data/protocols.json', {
        credentials:'same-origin',
        cache:'no-cache',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) return false;
      const manifest = await response.json();
      const record = Array.isArray(manifest?.documents)
        ? manifest.documents.find(item => clean(item?.id, 64) === transfer.protocolId)
        : null;
      return Boolean(record && clean(record.contentSha256, 64).toLowerCase() === transfer.sourceHash);
    } catch {
      return false;
    }
  }

  function setStatus(message, type = '') {
    const node = document.getElementById('rxStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `rx-status${type ? ` is-${type}` : ''}`;
  }

  function insertBanner(transfer) {
    const card = document.querySelector('.rx-compose-card');
    const head = card?.querySelector('.rx-card-head');
    if (!card || !head || card.querySelector('[data-rx-protocol-import]')) return;
    const banner = document.createElement('div');
    banner.className = 'rx-protocol-import';
    banner.dataset.rxProtocolImport = '1';
    banner.innerHTML = `<div><span>Nga protokolli</span><strong>${escapeHtml(transfer.protocolTitle || 'Protokoll klinik')}</strong><p>Drafti është bartur vetëm si pikënisje. Zgjidh preparatin konkret dhe verifiko dozën, rrugën, shpeshtësinë, kohëzgjatjen dhe kundërindikacionet para përdorimit.</p></div><a href="protokollet.html?protocol=${encodeURIComponent(transfer.protocolId)}">Kthehu te protokolli</a>`;
    head.insertAdjacentElement('afterend', banner);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    }[character]));
  }

  function applyTransfer(transfer) {
    const diagnosis = document.getElementById('rxDiagnosis');
    const composer = document.getElementById('rxComposer');
    if (!diagnosis || !composer) return false;

    if (!clean(diagnosis.value) && transfer.diagnosis) diagnosis.value = transfer.diagnosis;
    if (!boundedMultiline(composer.value) && transfer.composer) composer.value = transfer.composer;
    insertBanner(transfer);

    diagnosis.dispatchEvent(new Event('input', { bubbles:true }));
    composer.dispatchEvent(new Event('input', { bubbles:true }));
    setStatus(
      transfer.composer
        ? 'Drafti nga protokolli u bart. Kontrolloje klinikisht dhe zgjidh preparatin konkret para ruajtjes.'
        : 'Indikacioni nga protokolli u bart. Zgjidh barin me @bari dhe plotëso recetën.',
      'success',
    );
    composer.focus({ preventScroll:true });
    return true;
  }

  async function init() {
    const transfer = readTransfer();
    if (!transfer) return;
    const valid = await sourceStillMatches(transfer);
    if (!valid) {
      setStatus('Burimi i protokollit nuk përputhet më me versionin aktual. Drafti nuk u importua.', 'error');
      return;
    }
    applyTransfer(transfer);
  }

  if (document.readyState === 'complete') void init();
  else window.addEventListener('load', () => { void init(); }, { once:true });
})();


(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const SEED_KEY = 'medindex_prescription_starter_seed_v1';
  const TEMPLATE_ID = 'starter_rx_herpes_zoster_adult_v1';
  const STAMP = '2026-08-18T07:20:00.000Z';

  const herpesZosterTemplate = Object.freeze({
    id:TEMPLATE_ID,
    name:'Herpes zoster (Shingles) — i rritur',
    indication:'Herpes zoster akut — i rritur, rast i pakomplikuar',
    chapterKey:'antiinfektive',
    allergies:'',
    population:'adult',
    patientName:'',
    birthDate:'',
    patientId:'',
    patientType:'adult',
    notes:[
      'Draft klinik për mjek: verifiko kohën nga fillimi i rash-it, funksionin renal, shtatzëninë, imunokomprometimin dhe përfshirjen okulare/otike para përshkrimit.',
      'Calamine lotion nuk u gjet në regjistrin MedIndex më 18.08.2026. Cetirizina është përfshirë vetëm si alternativë simptomatike për pruritus; nuk është ekuivalent topik i calamine lotion.',
      'Aciclovir 800 mg: skema e këtij drafti është 5 herë/ditë për 7 ditë. Në insuficiencë renale kërkohet përshtatje e intervalit.',
    ],
    missing:[],
    sections:[{
      title:'Barna orale PO',
      type:'oral',
      route:'PO',
      sharedSignature:'',
      sharedSignatureGenerated:false,
      medications:[
        {
          form:'Tableta',
          name:'Aciclovir',
          dose:'800 mg',
          quantity:'',
          dispenseQuantity:'35 tableta',
          other:'Cicloviral 800 mg në regjistrin MedIndex është paketë me 25 tableta; verifiko mënyrën lokale të dispensimit për sasinë totale.',
          individualSignature:'Merr 1 tabletë 800 mg nga goja 5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit, për 7 ditë.',
          signatureGenerated:false,
        },
        {
          form:'Tableta',
          name:'Paracetamol',
          dose:'500 mg',
          quantity:'',
          dispenseQuantity:'20 tableta',
          other:'Për dhimbje ose temperaturë; llogarit totalin ditor të paracetamolit nga të gjitha produktet.',
          individualSignature:'Merr 1 tabletë 500 mg çdo 8 orë sipas nevojës për dhimbje ose temperaturë.',
          signatureGenerated:false,
        },
        {
          form:'Tableta',
          name:'Cetirizine hydrochloride',
          dose:'10 mg',
          quantity:'',
          dispenseQuantity:'7 tableta',
          other:'Opsionale vetëm nëse ka pruritus; mund të shkaktojë përgjumje dhe kërkon vlerësim të dozës në sëmundje renale/hepatike.',
          individualSignature:'Nëse ka pruritus: merr 1 tabletë 10 mg një herë në ditë sipas nevojës; maksimumi 10 mg/24 orë.',
          signatureGenerated:false,
        },
      ],
    }],
    sourceText:[
      'Rp:',
      'Tab. Aciclovir 800 mg',
      'Sasia: 35 tableta',
      'S (Signatura): Merr 1 tabletë 800 mg nga goja 5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit, për 7 ditë.',
      '',
      'Tab. Paracetamol 500 mg',
      'Sasia: 20 tableta',
      'S (Signatura): Merr 1 tabletë 500 mg çdo 8 orë sipas nevojës për dhimbje ose temperaturë.',
      '',
      'Tab. Cetirizine hydrochloride 10 mg',
      'Sasia: 7 tableta',
      'S (Signatura): Nëse ka pruritus: merr 1 tabletë 10 mg një herë në ditë sipas nevojës; maksimumi 10 mg/24 orë.',
    ].join('\n'),
    selectedDrugs:[
      {
        key:'3990|PD3243/111225|Cicloviral|800 mg',
        tradeName:'Cicloviral',
        substance:'Aciclovir',
        strength:'800 mg',
        form:'Tablet',
        atc:'J05AB01',
        pdid:'3990',
        regimenId:'ACY-TAB-ZOSTER-AD-001',
        dosageStatus:'requires-review',
        dosagePopulation:'adult',
        indication:'Herpes zoster akut te të rriturit',
        route:'PO',
        frequency:'5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit',
        duration:'7 ditë',
        dispense:'35 tableta',
        signatura:'Merr 1 tabletë 800 mg nga goja 5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit, për 7 ditë.',
        warnings:'Kërkon përshtatje të intervalit në insuficiencë renale; kontrollo hidratimin dhe komplikimet e zosterit.',
        sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=eb863c4f-4e39-4d97-8b7e-30a76fe2119d',
        verificationStatus:'source-verified',
      },
      {
        key:'131|PD0045/271125|BEN-U-RON|500 mg',
        tradeName:'BEN-U-RON',
        substance:'Paracetamol',
        strength:'500 mg',
        form:'Tablet',
        atc:'N02BE01',
        pdid:'131',
        dosageStatus:'requires-review',
        dosagePopulation:'adult',
        indication:'Dhimbje ose temperaturë',
        route:'PO',
        frequency:'çdo 8 orë sipas nevojës',
        duration:'sipas nevojës',
        dispense:'20 tableta',
        signatura:'Merr 1 tabletë 500 mg çdo 8 orë sipas nevojës për dhimbje ose temperaturë.',
        warnings:'Llogarit dozën totale ditore të paracetamolit nga të gjitha produktet dhe vlerëso faktorët hepatikë.',
        sourceUrl:'https://www.nhs.uk/medicines/paracetamol-for-adults/',
        verificationStatus:'source-verified',
      },
      {
        key:'3707|PD2173/061225|ALCET|10 mg',
        tradeName:'ALCET',
        substance:'cetirizine hydrochloride',
        strength:'10 mg',
        form:'Film coated tablet',
        atc:'R06AE07',
        pdid:'3707',
        dosageStatus:'requires-review',
        dosagePopulation:'adult',
        indication:'Pruritus simptomatik',
        route:'PO',
        frequency:'1 herë në ditë sipas nevojës',
        duration:'sipas simptomave',
        dispense:'7 tableta',
        signatura:'Nëse ka pruritus: merr 1 tabletë 10 mg një herë në ditë sipas nevojës; maksimumi 10 mg/24 orë.',
        warnings:'Mund të shkaktojë përgjumje; vlerëso sëmundjen renale/hepatike dhe barnat sedative.',
        sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5481ccb3-b311-4b25-b923-4fe8522ea92b',
        verificationStatus:'source-verified',
      },
    ],
    formatVersion:3,
    aiStructured:false,
    generatedSignatureReviewed:false,
    dosageReviewed:false,
    clinicalReview:false,
    reviewedAt:'',
    starterTemplate:true,
    templateVersion:1,
    createdAt:STAMP,
    updatedAt:STAMP,
    items:[],
  });

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function refreshUi() {
    const search = document.getElementById('rxSavedSearch');
    if (search) search.dispatchEvent(new Event('input', { bubbles:true }));
    window.dispatchEvent(new CustomEvent('medindex:starter-prescriptions-seeded', {
      detail:{ ids:[TEMPLATE_ID], version:1 },
    }));
  }

  function seed() {
    try {
      if (localStorage.getItem(SEED_KEY) === '1') return;
      const saved = readSaved();
      if (!saved.some(item => String(item?.id) === TEMPLATE_ID)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([herpesZosterTemplate, ...saved]));
      }
      localStorage.setItem(SEED_KEY, '1');
      refreshUi();
    } catch {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(seed, 0), { once:true });
  else setTimeout(seed, 0);
})();
