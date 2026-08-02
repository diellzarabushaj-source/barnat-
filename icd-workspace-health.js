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
  let refreshSequence = 0;

  const clean = value => String(value ?? '').trim();
  const nativeFetch = (...args) => (window.MedIndexNativeFetch || window.fetch.bind(window))(...args);
  const delay = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
  const settleBrowserTurn = () => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
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
    const metadata = [];
    const loadedAt = dateLabel(source?.loadedAt);
    if (loadedAt) metadata.push(`përditësuar ${loadedAt}`);
    const size = byteLabel(source?.csvBytes);
    if (size) metadata.push(size);
    const revision = clean(source?.revision).slice(0, 8);
    if (revision) metadata.push(`rev ${revision}`);

    const parts = [];
    if (cached) parts.push('cache lokal');
    if (metadata.length) parts.push(...metadata);
    else {
      const fallback = clean(source?.displayDetail) || clean(els.badge.title);
      if (fallback) parts.push(fallback);
    }
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

  function validSource(source) {
    const status = clean(source?.status).toLowerCase();
    return Boolean(source && typeof source === 'object' && ['live', 'stale'].includes(status));
  }

  function saveCache(source) {
    if (!validSource(source)) return;
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt:Date.now(), source }));
    } catch {}
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (
        !validSource(cached?.source)
        || Date.now() - Number(cached.savedAt || 0) > CACHE_TTL
      ) return null;
      return cached.source;
    } catch { return null; }
  }

  function applySource(source, { cached = false } = {}) {
    if (!validSource(source)) return false;
    currentSource = source;
    const status = clean(source.status).toLowerCase();
    const displayStatus = cached ? 'cached' : status;
    const detail = sourceDetail(source, { cached });
    els.badge.dataset.sourceStatus = displayStatus;
    els.badge.textContent = badgeText(displayStatus);
    els.badge.title = sourceDetail(source);
    window.clearTimeout(fallbackTimer);
    setWrapperState(displayStatus, detail, { cached });
    if (!cached) saveCache(source);
    return true;
  }

  function syncFromBadge() {
    if (navigator.onLine === false) return;
    const status = clean(els.badge.dataset.sourceStatus).toLowerCase() || 'loading';
    const verifiedStatus = clean(currentSource?.status).toLowerCase();
    if (
      ['loading', 'unknown'].includes(status)
      && ['live', 'stale'].includes(verifiedStatus)
    ) {
      applySource(currentSource);
      return;
    }
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

  function abortError() {
    return new DOMException('Aborted', 'AbortError');
  }

  async function requestMeta(signal) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) throw abortError();

      const url = new URL(API, location.origin);
      url.searchParams.set('workspaceHealth', '1');
      url.searchParams.set('attempt', String(attempt + 1));

      let response;
      try {
        response = await nativeFetch(url.toString(), {
          credentials:'same-origin',
          cache:'no-store',
          headers:{
            Accept:'application/json',
            'X-MedIndex-ICD-Workspace':'health-v2',
          },
          signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw abortError();
        lastError = error;
        if (attempt === 0 && navigator.onLine !== false) {
          emit('retrying', { status:0, attempt:1 });
          await delay(800);
          continue;
        }
        throw error;
      }

      if (!response.ok) {
        lastError = new Error(`ICD meta ${response.status}`);
        if (attempt === 0 && RETRYABLE_STATUS.has(response.status)) {
          emit('retrying', { status:response.status, attempt:1 });
          await delay(retryDelay(response));
          continue;
        }
        throw lastError;
      }

      try {
        const payload = await response.json();
        const source = payload?.data?.meta?.source;
        if (!payload?.ok || !validSource(source)) {
          throw new Error('Përgjigjja ICD-10 nuk përmban burim live/stale të verifikuar.');
        }
        return source;
      } catch (error) {
        lastError = error;
        if (attempt === 0 && navigator.onLine !== false) {
          emit('retrying', { status:0, attempt:1 });
          await delay(800);
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error('Burimi ICD-10 nuk u verifikua.');
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
    refreshSequence += 1;
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

    const sequence = ++refreshSequence;
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
        const verifiedSource = sourceResult.value;
        applySource(verifiedSource);
        if (manual) {
          await settleBrowserTurn();
          if (sequence === refreshSequence && navigator.onLine !== false) applySource(verifiedSource);
        }
        measure();
        return verifiedSource;
      }

      const error = sourceResult.reason;
      if (error?.name === 'AbortError') return null;
      console.error('ICD workspace source check failed:', error);
      if (validSource(currentSource)) {
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