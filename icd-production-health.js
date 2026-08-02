(() => {
  'use strict';

  const API = '/api/icd?view=meta';
  const CACHE_KEY = 'medindex_icd_source_health_v1';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
  const els = {};
  let controller = null;
  let currentSource = null;
  let currentState = 'loading';
  let pendingRefresh = null;

  const clean = value => String(value ?? '').trim();
  const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once:true });
  });

  function cacheElements() {
    Object.assign(els, {
      root:document.getElementById('icdSourceHealth'),
      label:document.getElementById('icdSourceHealthLabel'),
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
    return parts.join(' · ') || 'Google Sheet publik i hierarkisë ICD-10';
  }

  function emit(state, source, extra = {}) {
    window.dispatchEvent(new CustomEvent('medindex:icd-source-health', {
      detail:{ state, source:source || null, ...extra },
    }));
  }

  function setState(state, label, detail, source = null, extra = {}) {
    currentState = state;
    currentSource = source || currentSource;
    els.root.dataset.state = state;
    els.label.textContent = label;
    els.detail.textContent = detail;
    els.refresh.disabled = state === 'loading';
    document.documentElement.dataset.miIcdSource = state;
    emit(state, currentSource, extra);
  }

  function renderSource(source, options = {}) {
    const status = clean(source?.status).toLowerCase();
    if (status === 'stale') {
      setState(
        'stale',
        'Po përdoret kopja e fundit e vlefshme',
        sourceDetail(source, options),
        source,
        { cached:Boolean(options.cached) },
      );
      return;
    }
    if (status === 'live') {
      setState(
        options.cached ? 'cached' : 'live',
        options.cached ? 'Burimi i ruajtur lokalisht' : 'Burimi ICD-10 është live',
        sourceDetail(source, options),
        source,
        { cached:Boolean(options.cached) },
      );
      return;
    }
    setState(
      options.cached ? 'cached' : 'unknown',
      options.cached ? 'Burimi i ruajtur lokalisht' : 'Burimi ICD-10 është lidhur',
      sourceDetail(source, options),
      source,
      { cached:Boolean(options.cached) },
    );
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (!cached?.source || Date.now() - Number(cached.savedAt || 0) > CACHE_TTL) return null;
      return cached.source;
    } catch { return null; }
  }

  function saveCache(source) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt:Date.now(), source })); } catch {}
  }

  function retryDelay(response) {
    const seconds = Number(response?.headers?.get('retry-after') || 0);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(3000, seconds * 1000);
    return 800;
  }

  async function requestMeta(signal, attempt = 0) {
    try {
      const response = await fetch(API, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal,
      });
      if (!response.ok) {
        if (attempt < 1 && RETRYABLE_STATUS.has(response.status)) {
          emit('retrying', currentSource, { status:response.status, attempt:attempt + 1 });
          await delay(retryDelay(response), signal);
          return requestMeta(signal, attempt + 1);
        }
        throw new Error(`ICD API ${response.status}`);
      }
      const payload = await response.json();
      if (!payload?.ok || !payload?.data?.meta) throw new Error('Përgjigje e pavlefshme e statusit ICD-10.');
      return payload.data.meta.source || {
        type:'unknown', status:'unknown', loadedAt:new Date().toISOString(),
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (attempt < 1 && navigator.onLine !== false) {
        emit('retrying', currentSource, { status:0, attempt:attempt + 1 });
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
      performance.mark('medindex-icd-source-health-end');
      performance.measure('medindex-icd-source-health', 'medindex-icd-source-health-start', 'medindex-icd-source-health-end');
    } catch {}
  }

  async function refresh({ manual = false, reloadTree = false } = {}) {
    if (pendingRefresh) return pendingRefresh;
    if (navigator.onLine === false) {
      const detail = currentSource
        ? `${sourceDetail(currentSource, { cached:true })} · pa internet`
        : 'Lidhu me internet dhe provo përsëri.';
      setState('offline', currentSource ? 'Pa rrjet — po përdoret cache' : 'Pa rrjet', detail, currentSource);
      return null;
    }

    controller?.abort();
    controller = new AbortController();
    if (manual) {
      setState('loading', 'Po rifreskohet burimi ICD-10…', 'Po kontrollohet Google Sheet-i publik.', currentSource);
    }
    mark('medindex-icd-source-health-start');

    pendingRefresh = (async () => {
      const treeReload = reloadTree && typeof window.MedIndexIcdTable?.reload === 'function'
        ? Promise.resolve().then(() => window.MedIndexIcdTable.reload())
        : Promise.resolve();
      const [sourceResult] = await Promise.allSettled([
        requestMeta(controller.signal),
        treeReload,
      ]);

      if (sourceResult.status === 'fulfilled') {
        saveCache(sourceResult.value);
        renderSource(sourceResult.value);
        measure();
        return sourceResult.value;
      }
      const error = sourceResult.reason;
      if (error?.name === 'AbortError') return null;
      console.error('ICD source health check failed:', error);
      if (currentSource) {
        setState(
          'stale',
          'Po përdoret kopja e fundit e vlefshme',
          `${sourceDetail(currentSource, { cached:true })} · kontrolli i ri dështoi`,
          currentSource,
          { error:clean(error?.message) },
        );
      } else {
        setState(
          'error',
          'Burimi ICD-10 nuk u verifikua',
          'Përdor “Rifresko” për ta provuar përsëri.',
          null,
          { error:clean(error?.message) },
        );
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
    els.refresh.addEventListener('click', () => refresh({ manual:true, reloadTree:true }));
    window.addEventListener('online', () => refresh());
    window.addEventListener('offline', () => {
      const detail = currentSource
        ? `${sourceDetail(currentSource, { cached:true })} · pa internet`
        : 'Lidhu me internet dhe provo përsëri.';
      setState('offline', currentSource ? 'Pa rrjet — po përdoret cache' : 'Pa rrjet', detail, currentSource);
    });
    window.addEventListener('medindex:icd-tree-ready', () => {
      if (!currentSource && !pendingRefresh) refresh();
    });
  }

  function init() {
    if (!cacheElements()) return;
    bind();
    const cached = readCache();
    if (cached) renderSource(cached, { cached:true });
    else setState('loading', 'Po kontrollohet burimi ICD-10…', 'Google Sheet publik · hierarkia e plotë', null);
    refresh();
    window.MedIndexIcdSourceHealth = Object.freeze({
      reload:() => refresh({ manual:true, reloadTree:true }),
      state:() => ({ state:currentState, source:currentSource }),
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();