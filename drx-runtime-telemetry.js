import { onCLS, onINP, onLCP } from './vendor/web-vitals.js?v=6.2.3';

// Only numeric measurements and fixed enums leave this document. Never forward
// the web-vitals object: entries and attribution can contain clinical text/URLs.
(() => {
  if (window.DRxRuntimeTelemetry || navigator.globalPrivacyControl === true || ['1','yes'].includes(String(navigator.doNotTrack || window.doNotTrack || '').toLowerCase())) return;
  const paths = Object.freeze({
    '/':'registry','/index.html':'registry','/klasifikimi.html':'atc','/icd.html':'icd','/dozologjia.html':'dosage',
    '/antibiotiket.html':'antibiotics','/protokollet.html':'protocols','/urgjencat.html':'emergencies',
    '/favoritet.html':'favorites','/shenimet.html':'notes','/recetat.html':'prescriptions','/analizat.html':'labs',
    '/medical-hub.html':'medical-hub','/sistemi.html':'system',
  });
  const module = paths[location.pathname];
  if (!module || !window.crypto?.randomUUID || !window.crypto?.getRandomValues) return;
  const draw = new Uint32Array(1); window.crypto.getRandomValues(draw);
  if (draw[0] / 4294967296 >= .1) return;
  const release = '20261009-rum-v1';
  const device = window.innerWidth <= 767 ? 'mobile' : window.innerWidth <= 1023 ? 'tablet' : 'desktop';
  const queue = new Map(); const metricIds = new Map(); const revisions = new Map(); const reportedErrors = new Set();
  let navigationId = window.crypto.randomUUID();
  let authenticated = false; let csrfToken = ''; let stopped = false; let sending = false;
  let lastSentAt = -Infinity; let timer = null; let deliveries = 0;
  const endpoint = '/api/auth?scope=telemetry';

  function clear() { queue.clear(); metricIds.clear(); revisions.clear(); clearTimeout(timer); timer = null; }
  function stop() { stopped = true; authenticated = false; csrfToken = ''; clear(); }
  function schedule() {
    if (stopped || timer || !authenticated) return;
    timer = setTimeout(() => { timer = null; void flush(); }, Math.max(1000,20000 - (Date.now() - lastSentAt)));
  }
  function enqueue(id,name,value,revision = 1) {
    if (stopped || queue.size >= 12 && !queue.has(`${id}:${name}`)) return;
    queue.set(`${id}:${name}`,{ id,name,value,revision }); schedule();
  }
  function captureMetric(metric) {
    if (stopped || !['LCP','INP','CLS'].includes(metric?.name) || typeof metric.id !== 'string'
      || !Number.isFinite(metric.value) || metric.value < 0) return;
    // The official library reuses its ID for later updates and creates new IDs
    // after BFCache restoration. The browser ID itself stays in memory only.
    const key = `${metric.name}:${metric.id}`;
    if (!metricIds.has(key)) {
      if (metricIds.size >= 24) return;
      metricIds.set(key,window.crypto.randomUUID());
    }
    const maximum = metric.name === 'CLS' ? 10 : 60000;
    if (metric.value > maximum) return;
    const value = metric.name === 'CLS' ? Math.round(metric.value * 10000) / 10000 : Math.round(metric.value);
    const revision = (revisions.get(key) || 0) + 1;
    if (revision > 1000) return;
    revisions.set(key,revision);
    enqueue(metricIds.get(key),metric.name,value,revision);
  }
  function captureError(kind) {
    const names = { runtime:'RUNTIME_ERROR',network:'NETWORK_ERROR',server:'SERVER_ERROR' };
    const name = names[kind];
    if (stopped || !name || reportedErrors.has(name)) return;
    reportedErrors.add(name); enqueue(navigationId,name,1);
  }
  async function flush(final = false) {
    if (stopped || !authenticated || !csrfToken || sending || !queue.size || navigator.onLine === false || deliveries >= 40) return;
    if (!final && Date.now() - lastSentAt < 20000) { schedule(); return; }
    clearTimeout(timer); timer = null;
    sending = true; lastSentAt = Date.now(); deliveries += 1;
    const events = [...queue.values()];
    // Delete only the exact sent revision; a later callback may have replaced it.
    const body = { version:1,module,device,release,events };
    let accepted = false;
    try {
      const response = await fetch(endpoint,{
        method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,
        headers:{ 'Content-Type':'application/json','X-CSRF-Token':csrfToken },body:JSON.stringify(body),
      });
      if (response.status === 204) {
        accepted = true;
        for (const event of events) {
          const key = `${event.id}:${event.name}`;
          if (queue.get(key) === event) queue.delete(key);
        }
      } else if ([401,403].includes(response.status)) {
        // Do not renew/rotate auth cookies for analytics. A later confirmed auth
        // event may supply a fresh CSRF token; the clinical flow remains owner.
        authenticated = false; csrfToken = '';
      }
    } catch { /* Telemetry never changes a clinical action or offline behavior. */ }
    finally {
      sending = false;
      if (queue.size && document.visibilityState !== 'hidden') schedule();
      else if (accepted && queue.size) void flush(true);
    }
  }
  function acceptAuth(payload) {
    if (stopped || payload?.authenticated !== true || payload.offline === true || payload.supabaseAuthenticated !== true
      || payload.authUser?.status !== 'active' || typeof payload.csrfToken !== 'string' || payload.csrfToken.length > 100) return;
    authenticated = true; csrfToken = payload.csrfToken; schedule();
  }
  // No persistent IDs, queues, auth data or telemetry are put in browser storage.
  window.DRxRuntimeTelemetry = Object.freeze({ captureError });
  window.addEventListener('medindex:auth-ready',event => acceptAuth(event.detail));
  window.addEventListener('medindex:auth-failed',stop);
  Promise.resolve(window.MEDINDEX_AUTH_READY).then(acceptAuth).catch(() => {});
  window.addEventListener('error',event => {
    if (event.target !== window && ['SCRIPT','LINK'].includes(event.target?.tagName)) captureError('network');
    else if (event.target === window) captureError('runtime');
  },true);
  window.addEventListener('unhandledrejection',() => captureError('runtime'));
  window.addEventListener('drx:telemetry-error',event => {
    const detail = event.detail;
    if (detail && Object.keys(detail).length === 1 && ['runtime','network','server'].includes(detail.kind)) captureError(detail.kind);
  });
  try {
    if (window.PerformanceObserver?.supportedEntryTypes?.includes('resource')) {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.initiatorType === 'fetch' && Number.isFinite(entry.responseStatus) && entry.responseStatus >= 500) captureError('server');
        }
      });
      observer.observe({ type:'resource',buffered:true });
    }
  } catch { /* Missing resource status support is unavailable, never guessed. */ }
  document.addEventListener('visibilitychange',() => {
    // web-vitals registers its own hidden handlers. Defer to let them enqueue the
    // final values before this transport runs; pagehide is a bounded fallback.
    if (document.visibilityState === 'hidden') queueMicrotask(() => { void flush(true); });
  });
  window.addEventListener('pagehide',() => { void flush(true); });
  window.addEventListener('pageshow',event => {
    if (!event.persisted || stopped) return;
    navigationId = window.crypto.randomUUID(); reportedErrors.clear();
    enqueue(navigationId,'NAV',1);
  });
  enqueue(navigationId,'NAV',1);
  // Call each official observer once per document. Unsupported APIs or an INP
  // without an interaction simply produce no sample; they are never sent as 0.
  // Keep the latest official measurements queued before pagehide, including
  // browsers that navigate without firing a final hidden visibility event.
  // Revisions replace an earlier sample rather than counting another visit.
  onLCP(captureMetric,{reportAllChanges:true});
  onINP(captureMetric,{reportAllChanges:true});
  onCLS(captureMetric,{reportAllChanges:true});
}) ();
