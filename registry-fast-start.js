(() => {
  'use strict';

  const MAX_BLOCKING_MS = 2200;
  const PREFETCH_TTL_MS = 10000;
  const DEDUP_PATHS = new Set(['/api/auth', '/api/icd', '/api/user-library']);
  const loader = document.getElementById('pageLoader');
  const badge = document.getElementById('countBadge');
  const tbody = document.getElementById('tbody');
  const nativeFetch = window.fetch.bind(window);
  const html = document.documentElement;
  const perf = window.MEDINDEX_PERFORMANCE = window.MEDINDEX_PERFORMANCE || {
    version:'registry-startup-v2',
    marks:{},
    metrics:{ longTaskCount:0, longTaskTotalMs:0, longTaskMaxMs:0, cls:0, lcp:0, maxInteractionMs:0 },
  };
  perf.metrics.requestDedupStarted = Number(perf.metrics.requestDedupStarted || 0);
  perf.metrics.requestDedupHits = Number(perf.metrics.requestDedupHits || 0);
  let released = false;
  let observer = null;
  let authObserver = null;
  let prefetchPromise = null;
  let prefetchStartedAt = 0;
  let prefetchReused = false;
  const inflightGets = new Map();

  function mark(name, detail = {}) {
    const at = performance.now();
    if (!Number.isFinite(perf.marks[name])) perf.marks[name] = at;
    try { performance.mark(`medindex:${name}`); } catch {}
    window.dispatchEvent(new CustomEvent('medindex:performance-mark', { detail:{ name, at, ...detail } }));
    return at;
  }

  function observePerformance() {
    if (typeof PerformanceObserver !== 'function') return;
    const observe = (type, callback, options = {}) => {
      try {
        const supported = PerformanceObserver.supportedEntryTypes || [];
        if (!supported.includes(type)) return;
        const po = new PerformanceObserver(list => callback(list.getEntries()));
        po.observe({ type, buffered:true, ...options });
      } catch {}
    };

    observe('longtask', entries => {
      for (const entry of entries) {
        const duration = Number(entry.duration || 0);
        perf.metrics.longTaskCount += 1;
        perf.metrics.longTaskTotalMs += duration;
        perf.metrics.longTaskMaxMs = Math.max(perf.metrics.longTaskMaxMs, duration);
      }
    });
    observe('largest-contentful-paint', entries => {
      const latest = entries.at?.(-1) || entries[entries.length - 1];
      if (latest) perf.metrics.lcp = Number(latest.startTime || 0);
    });
    observe('layout-shift', entries => {
      for (const entry of entries) {
        if (!entry.hadRecentInput) perf.metrics.cls += Number(entry.value || 0);
      }
    });
    observe('event', entries => {
      for (const entry of entries) {
        if (entry.interactionId) perf.metrics.maxInteractionMs = Math.max(perf.metrics.maxInteractionMs, Number(entry.duration || 0));
      }
    }, { durationThreshold:40 });
  }

  function loadingText() {
    return `${tbody?.textContent || ''} ${badge?.textContent || ''}`.toLowerCase();
  }

  function registryHasRendered() {
    if (!tbody) return false;
    const rows = tbody.querySelectorAll('tr');
    if (!rows.length) return false;
    const text = loadingText();
    return !text.includes('duke i ngarkuar') && !text.includes('po përgatitet në sfond');
  }

  function initialRegistryPageUrl() {
    const mobile = window.matchMedia?.('(max-width: 767px)')?.matches;
    const params = new URLSearchParams({
      view:'registry-page',
      page:'1',
      pageSize:mobile ? '25' : '50',
      sort:'registry',
      direction:'asc',
      includeTotal:'1',
    });
    return `/api/drug-search?${params.toString()}`;
  }

  function isInitialRegistryPageRequest(input, init = {}) {
    const method = String(init.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    if (method !== 'GET') return false;
    let url;
    try {
      url = new URL(typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input), location.href);
    } catch {
      return false;
    }
    if (url.origin !== location.origin || url.pathname !== '/api/drug-search') return false;
    const mobile = window.matchMedia?.('(max-width: 767px)')?.matches;
    return url.searchParams.get('view') === 'registry-page'
      && url.searchParams.get('page') === '1'
      && url.searchParams.get('pageSize') === (mobile ? '25' : '50')
      && (url.searchParams.get('sort') || 'registry') === 'registry'
      && (url.searchParams.get('direction') || 'asc') === 'asc'
      && url.searchParams.get('includeTotal') === '1'
      && !url.searchParams.get('q')
      && !url.searchParams.get('status');
  }

  function abortableClone(promise, signal) {
    if (!signal) return promise.then(response => response?.clone?.() || null);
    if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once:true });
      promise.then(response => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(response?.clone?.() || null);
      }, error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
    });
  }

  function dedupDescriptor(input, init = {}) {
    if (typeof Request !== 'undefined' && input instanceof Request) return null;
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET' || init.body != null) return null;
    let url;
    try {
      url = new URL(String(input), location.href);
    } catch {
      return null;
    }
    if (url.origin !== location.origin || !DEDUP_PATHS.has(url.pathname)) return null;
    const headers = new Headers(init.headers || {});
    if (headers.has('Authorization') || headers.has('Range')) return null;
    url.hash = '';
    url.searchParams.sort();
    const credentials = String(init.credentials || 'same-origin');
    const cache = String(init.cache || 'default');
    const accept = String(headers.get('Accept') || '');
    return {
      key:`${url.pathname}${url.search}|${credentials}|${cache}|${accept}`,
      signal:init.signal || null,
      networkInit:{ ...init, signal:undefined },
      path:url.pathname,
    };
  }

  function deduplicatedFetch(input, init = {}) {
    const descriptor = dedupDescriptor(input, init);
    if (!descriptor) return nativeFetch(input, init);
    let pending = inflightGets.get(descriptor.key);
    if (!pending) {
      perf.metrics.requestDedupStarted += 1;
      pending = nativeFetch(input, descriptor.networkInit);
      inflightGets.set(descriptor.key, pending);
      const cleanup = () => {
        if (inflightGets.get(descriptor.key) === pending) inflightGets.delete(descriptor.key);
      };
      pending.then(cleanup, cleanup);
    } else {
      perf.metrics.requestDedupHits += 1;
      mark('request-dedup-hit', { path:descriptor.path });
    }
    return abortableClone(pending, descriptor.signal).then(response => response || nativeFetch(input, init));
  }

  function startRegistryPrefetch() {
    if (prefetchPromise || navigator.onLine === false) return;
    prefetchStartedAt = performance.now();
    mark('registry-prefetch-start');
    prefetchPromise = nativeFetch(initialRegistryPageUrl(), {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json' },
    }).then(response => {
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const reusable = response.ok && contentType.includes('application/json');
      perf.metrics.registryPrefetchMs = performance.now() - prefetchStartedAt;
      perf.metrics.registryPrefetchStatus = response.status;
      mark('registry-prefetch-end', { status:response.status, reusable });
      return reusable ? response : null;
    }).catch(error => {
      perf.metrics.registryPrefetchError = String(error?.name || 'error');
      mark('registry-prefetch-end', { status:0, reusable:false });
      return null;
    });
  }

  function installPrefetchReuse() {
    window.fetch = function medindexStartupFetch(input, init = {}) {
      const age = performance.now() - prefetchStartedAt;
      if (prefetchPromise && age <= PREFETCH_TTL_MS && isInitialRegistryPageRequest(input, init)) {
        const signal = init.signal || (typeof Request !== 'undefined' && input instanceof Request ? input.signal : null);
        return abortableClone(prefetchPromise, signal).then(response => {
          if (!response) return deduplicatedFetch(input, init);
          prefetchReused = true;
          perf.metrics.registryPrefetchReused = true;
          mark('registry-prefetch-reused');
          return response;
        });
      }
      return deduplicatedFetch(input, init);
    };
    window.MedIndexRequestCoordinator = Object.freeze({
      version:'browser-inflight-v1',
      paths:[...DEDUP_PATHS],
      stats:() => ({
        inFlight:inflightGets.size,
        started:perf.metrics.requestDedupStarted,
        hits:perf.metrics.requestDedupHits,
      }),
    });
  }

  function releaseLoader(reason = 'background') {
    if (released) return;
    released = true;
    document.documentElement.dataset.medindexRegistryStartup = reason;
    perf.metrics.loaderReleasedAtMs = performance.now();
    perf.metrics.loaderReleaseReason = reason;
    perf.metrics.registryPrefetchReused = prefetchReused;
    mark('loader-released', { reason });

    if (loader) {
      loader.style.pointerEvents = 'none';
      loader.classList.add('is-hidden');
      loader.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => loader.remove(), 180);
    }

    if (!registryHasRendered()) {
      if (badge && /duke i ngarkuar/i.test(badge.textContent || '')) {
        badge.textContent = 'Po ngarkohet në sfond…';
        badge.title = 'Faqja është hapur. Regjistri po përgatitet në sfond.';
      }
      if (tbody && /duke i ngarkuar/i.test(tbody.textContent || '')) {
        tbody.innerHTML = '<tr><td colspan="30" class="empty-state">Regjistri po përgatitet në sfond. Faqja nuk është e bllokuar.</td></tr>';
      }
    }

    observer?.disconnect();
    authObserver?.disconnect();
  }

  function releaseInteractiveShell() {
    const root = document.documentElement;
    if (!root.classList.contains('auth-ready')) return;
    if (!document.querySelector('.mi-app-shell')) return;
    mark('interactive-shell');
    releaseLoader('interactive-shell');
  }

  mark('fast-start');
  observePerformance();
  installPrefetchReuse();
  startRegistryPrefetch();

  const timer = window.setTimeout(() => releaseLoader('background'), MAX_BLOCKING_MS);

  observer = new MutationObserver(() => {
    if (!registryHasRendered()) return;
    mark('first-registry-row');
    window.clearTimeout(timer);
    releaseLoader('ready');
  });

  authObserver = new MutationObserver(releaseInteractiveShell);
  authObserver.observe(document.documentElement, {
    attributes:true,
    attributeFilter:['class'],
  });

  // The lightweight renderers replace direct tbody children. Watching nested
  // cell/text mutations adds startup observer work without improving readiness
  // detection, so keep this observer scoped to row replacement only.
  if (tbody) observer.observe(tbody, { childList:true });

  window.addEventListener('medindex:auth-ready', () => mark('auth-ready'), { once:true });
  window.addEventListener('medindex:tailadmin-ready', () => {
    mark('tailadmin-ready');
    releaseInteractiveShell();
  });
  window.addEventListener('medindex:desktop-lite-ready', () => mark('desktop-lite-ready'), { once:true });
  window.addEventListener('medindex:mobile-lite-ready', () => mark('mobile-lite-ready'), { once:true });
  window.addEventListener('medindex:registry-ready', () => {
    mark('registry-ready');
    window.clearTimeout(timer);
    releaseLoader('ready');
  }, { once:true });

  window.addEventListener('error', event => {
    if (!/app-runtime|registry|barnave/i.test(String(event?.message || event?.filename || ''))) return;
    window.clearTimeout(timer);
    releaseLoader('runtime-error');
  }, { once:true });

  window.addEventListener('pagehide', () => {
    perf.metrics.pageLifetimeMs = performance.now();
  }, { once:true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mark('dom-content-loaded');
      releaseInteractiveShell();
    }, { once:true });
  } else {
    mark('dom-content-loaded');
    releaseInteractiveShell();
  }
})();
