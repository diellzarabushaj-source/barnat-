(() => {
  'use strict';

  const API = '/api/icd?view=meta';
  const CACHE_KEY = 'medindex_icd_workspace_health_v2';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
  const els = {};
  let observer = null;
  let controller = null;
  let pendingRefresh = null;
  let fallbackTimer = 0;
  let currentSource = null;
  let currentState = 'loading';

  const clean = value => String(value ?? '').trim();
  const nativeFetch = (...args) => (window.MedIndexNativeFetch || window.fetch.bind(window))(...args);
  const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once:true });
  });

  function cacheElements() {
    Object.assign(els, {
      root:document.getElementById('icdSourceHealth'),
      badge:document.getElementById('icdSourceStatus'),
      detail:document.getElementById('icdSourceHealthDetail'),
      refresh:document.getElementById('icdSourceHealthRefresh'),
    });
    return Object.values(els).every(Boolean);
  }

  function dateLabel(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('sq-AL', {
      day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit',
    }).format(date);
  }

  function byteLabel(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    return `${(bytes / (1024 * 1024)).toLocaleString('sq-AL', { maximumFractionDigits:1 })} MB`;
  }

  function sourceDetail(source, { cached = false } = {}) {
    const parts = [];
    if (cached) parts.push('cache lokal');
    const loadedAt = dateLabel(source?.loadedAt);
    if (loadedAt) parts.push(`përditësuar ${loadedAt}`);
    const size = byteLabel(source?.csvBytes);
    if (size) parts.push(size);
    const revision = clean(source?.revision).slice(0, 8);
    if (revision) parts.push(`rev ${revision}`);
    const existing = clean(source?.displayDetail) || clean(els.badge.title);
    if (existing && !parts.includes(existing)) parts.push(existing);
    return parts.join(' · ') || 'Google Sheet publik · hierarkia e plotë';
  }

  function emit(state, extra = {}) {
    window.dispatchEvent(new CustomEvent('medindex:icd-workspace-source-health', {
      detail:{ state, source:currentSource, ...extra },
    }));
  }

  function setWrapperState(state, detail, extra = {}) {
    currentState = state;
    els.root.dataset.state = state;
    els.root.setAttribute('aria-busy', String(state === 'loading'));
    els.detail.textContent = detail;
    els.refresh.disabled = state === 'loading';
    document.documentElement.dataset.miIcdWorkspaceSource = state;
    emit(state, extra);
  }

  function badgeText(status) {
    if (status === 'live') return 'Burimi: live';
    if (status === 'stale') return 'Burimi: cache i fundit';
    if (status === 'cached') return 'Burimi: cache lokal';
    if (status === 'offline') return 'Burimi: pa rrjet';
    if (status === 'error') return 'Burimi: nuk u verifikua';
    return 'Burimi: status i panjohur';
  }

  function saveCache(source) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt:Date.now(), source }));
    } catch {}
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (!cached?.source || Date.now() - Number(cached.savedAt || 0) > CACHE_TTL) return null;
      return cached.source;
    } catch { return null; }
  }

  function applySource(source, { cached = false } = {}) {
    if (!source || typeof source !== 'object') return;
    currentSource = source;
    const rawStatus = clean(source.status).toLowerCase();
    const status = ['live', 'stale'].includes(rawStatus) ? rawStatus : 'unknown';
    const displayStatus = cached ? 'cached' : status;
    els.badge.dataset.sourceStatus = displayStatus;
    els.badge.textContent = badgeText(displayStatus);
    els.badge.title = sourceDetail(source);
    window.clearTimeout(fallbackTimer);
    setWrapperState(displayStatus, sourceDetail(source, { cached }), { cached });
    if (!cached) saveCache(source);
  }

  function syncFromBadge() {
    if (navigator.onLine === false) return;
    const status = clean(els.badge.dataset.sourceStatus).toLowerCase() || 'loading';
    if (status === 'loading' && ['cached', 'live', 'stale'].includes(currentState)) return;
    if (status === 'live' || status === 'stale') {
      const detail = clean(els.badge.title) || sourceDetail(currentSource);
      currentSource = {
        ...(currentSource || {}),
        status,
        displayDetail:detail,
      };
      saveCache(currentSource);
      window.clearTimeout(fallbackTimer);
      setWrapperState(status, detail, { fromBadge:true });
      return;
    }
    if (status === 'unknown') {
      setWrapperState('unknown', clean(els.badge.title) || 'Burimi nuk dha metadata të plota.', { fromBadge:true });
      return;
    }
    setWrapperState('loading', 'Po kontrollohet Google Sheet-i publik.', { fromBadge:true });
  }

  function retryDelay(response) {
    const seconds = Number(response?.headers?.get('retry-after') || 0);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(3000, seconds * 1000);
    return 800;
  }

  async function requestMeta(signal, attempt = 0) {
    try {
      const response = await nativeFetch(API, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{
          Accept:'application/json',
          'X-MedIndex-ICD-Workspace':'health-v2',
        },
        signal,
      });
      if (!response.ok) {
        if (attempt < 1 && RETRYABLE_STATUS.has(response.status)) {
          emit('retrying', { status:response.status, attempt:attempt + 1 });
          await delay(retryDelay(response), signal);
          return requestMeta(signal, attempt + 1);
        }
        throw new Error(`ICD meta ${response.status}`);
      }
      const payload = await response.json();
      if (!payload?.ok || !payload?.data?.meta) throw new Error('Përgjigje e pavlefshme e statusit ICD-10.');
      return payload.data.meta.source || { status:'unknown', loadedAt:new Date().toISOString() };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (attempt < 1 && navigator.onLine !== false) {
        emit('retrying', { status:0, attempt:attempt + 1 });
        await delay(800, signal);
        return requestMeta(signal, attempt + 1);
      }
      throw error;
    }
  }

  function mark(name) {
    try { performance.mark(name); } catch {}
  }

  function measure() {
    try {
      performance.mark('medindex-icd-workspace-health-end');
      performance.measure('medindex-icd-workspace-health', 'medindex-icd-workspace-health-start', 'medindex-icd-workspace-health-end');
    } catch {}
  }

  function offlineState() {
    els.badge.dataset.sourceStatus = 'offline';
    els.badge.textContent = badgeText('offline');
    const detail = currentSource
      ? `${sourceDetail(currentSource, { cached:true })} · pa internet`
      : 'Lidhu me internet dhe provo përsëri.';
    setWrapperState('offline', detail);
  }

  async function refresh({ manual = false, reloadTree = false } = {}) {
    if (pendingRefresh) return pendingRefresh;
    if (navigator.onLine === false) {
      offlineState();
      return null;
    }

    controller?.abort();
    controller = new AbortController();
    if (manual) {
      els.badge.dataset.sourceStatus = 'loading';
      els.badge.textContent = 'Burimi: duke u rifreskuar';
      setWrapperState('loading', 'Po kontrollohet Google Sheet-i publik.');
    }
    mark('medindex-icd-workspace-health-start');

    pendingRefresh = (async () => {
      const treeReload = reloadTree && typeof window.MedIndexIcdTable?.reload === 'function'
        ? Promise.resolve().then(() => window.MedIndexIcdTable.reload())
        : Promise.resolve();
      const [sourceResult] = await Promise.allSettled([requestMeta(controller.signal), treeReload]);
      if (sourceResult.status === 'fulfilled') {
        applySource(sourceResult.value);
        measure();
        return sourceResult.value;
      }

      const error = sourceResult.reason;
      if (error?.name === 'AbortError') return null;
      console.error('ICD workspace source check failed:', error);
      if (currentSource) {
        els.badge.dataset.sourceStatus = 'stale';
        els.badge.textContent = badgeText('stale');
        setWrapperState('stale', `${sourceDetail(currentSource, { cached:true })} · kontrolli i ri dështoi`, {
          error:clean(error?.message),
        });
      } else {
        els.badge.dataset.sourceStatus = 'error';
        els.badge.textContent = badgeText('error');
        setWrapperState('error', 'Përdor “Rifresko” për ta provuar përsëri.', { error:clean(error?.message) });
      }
      measure();
      return null;
    })().finally(() => {
      pendingRefresh = null;
      if (currentState === 'loading') els.refresh.disabled = false;
    });

    return pendingRefresh;
  }

  function bind() {
    observer = new MutationObserver(syncFromBadge);
    observer.observe(els.badge, {
      attributes:true,
      attributeFilter:['data-source-status', 'title'],
      childList:true,
      subtree:true,
    });
    els.refresh.addEventListener('click', () => refresh({ manual:true, reloadTree:true }));
    window.addEventListener('online', () => refresh());
    window.addEventListener('offline', offlineState);
    window.addEventListener('pageshow', event => {
      if (event.persisted) refresh();
    }, { passive:true });
  }

  function init() {
    if (!cacheElements()) return;
    bind();
    const cached = readCache();
    if (cached) applySource(cached, { cached:true });
    else syncFromBadge();
    fallbackTimer = window.setTimeout(() => {
      if (['loading', 'unknown'].includes(currentState) && navigator.onLine !== false) refresh();
    }, 1500);
    window.MedIndexIcdWorkspaceHealth = Object.freeze({
      reload:() => refresh({ manual:true, reloadTree:true }),
      refresh:() => refresh(),
      state:() => ({ state:currentState, source:currentSource }),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();