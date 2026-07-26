(() => {
  'use strict';

  const VERSION = 'production-audit-v1';
  const MANIFEST_URL = `/manifest.webmanifest?v=${VERSION}`;
  const SERVICE_WORKER_URL = `/sw.js?v=${VERSION}`;
  const CLINICAL_WORKFLOW_URL = `/clinical-workflow.js?v=${VERSION}`;
  const STATUS_ID = 'miOfflineStatus';
  const LAST_WARM_KEY = 'medindex_private_cache_warmed_at_v1';
  const WARM_TTL_MS = 6 * 60 * 60 * 1000;
  const WARM_IDLE_DELAY_MS = 8000;
  let registration = null;
  let deferredInstallPrompt = null;
  let warmRequested = false;
  let warmDeadline = 0;
  let warmSchedule = 0;
  let updateActivated = false;

  function ensureHeadMetadata() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = MANIFEST_URL;
      document.head.appendChild(manifest);
    }
    const metadata = [
      ['theme-color', '#465fff'],
      ['mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'default'],
      ['apple-mobile-web-app-title', 'MedIndex'],
    ];
    metadata.forEach(([name, content]) => {
      if (document.querySelector(`meta[name="${name}"]`)) return;
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    });
    if (!document.querySelector('link[rel="icon"][data-medindex-pwa]')) {
      const icon = document.createElement('link');
      icon.rel = 'icon';
      icon.href = '/medindex-icon.svg';
      icon.type = 'image/svg+xml';
      icon.dataset.medindexPwa = '1';
      document.head.appendChild(icon);
    }
  }

  function ensureClinicalWorkflow() {
    if (document.querySelector('script[data-medindex-clinical-workflow]')) return;
    const script = document.createElement('script');
    script.src = CLINICAL_WORKFLOW_URL;
    script.defer = true;
    script.dataset.medindexClinicalWorkflow = '1';
    script.onerror = () => console.warn('Shtresa e rrjedhës klinike nuk u ngarkua.');
    document.head.appendChild(script);
  }

  function injectStyles() {
    if (document.getElementById('medindexOfflineStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexOfflineStyles';
    style.textContent = `
      .mi-offline-status{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 10px;border:1px solid var(--mi-gray-200,#e4e7ec);border-radius:10px;background:var(--mi-white,#fff);color:var(--mi-gray-600,#475467);font:700 12px/1 var(--mi-font,Outfit,system-ui,sans-serif);white-space:nowrap;box-shadow:0 1px 2px rgba(16,24,40,.03);cursor:pointer}
      .mi-offline-status[data-state="ready"]{border-color:#abefc6;background:#ecfdf3;color:#067647}.mi-offline-status[data-state="offline"]{border-color:#fedf89;background:#fffaeb;color:#b54708}.mi-offline-status[data-state="syncing"]{border-color:#b2ccff;background:#eff4ff;color:#3538cd}.mi-offline-status[data-state="limited"]{border-color:#fecdc9;background:#fef3f2;color:#b42318}.mi-offline-status[data-state="update"]{border-color:#b2ccff;background:#eff4ff;color:#3538cd}
      .mi-offline-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}.mi-offline-status[data-state="syncing"] .mi-offline-dot{animation:miOfflinePulse 1s ease-in-out infinite}
      html[data-theme="dark"] .mi-offline-status{background:#182230;border-color:#344054;color:#d0d5dd}html[data-theme="dark"] .mi-offline-status[data-state="ready"]{background:#053321;border-color:#067647;color:#75e0a7}html[data-theme="dark"] .mi-offline-status[data-state="offline"]{background:#4e1d09;border-color:#b54708;color:#fec84b}
      @keyframes miOfflinePulse{50%{opacity:.35;transform:scale(.72)}}
      @media(max-width:1180px){.mi-offline-status span:last-child{display:none}.mi-offline-status{width:38px;padding:0;justify-content:center}}
      @media(max-width:760px){.mi-offline-status{display:inline-flex;width:36px;min-height:36px;padding:0;justify-content:center}.mi-offline-status span:last-child{display:none}}
      @media(prefers-reduced-motion:reduce){.mi-offline-dot{animation:none!important}}
    `;
    document.head.appendChild(style);
  }

  function statusHost() {
    return document.querySelector('.mi-topbar-actions') || document.querySelector('.mi-topbar') || document.body;
  }

  function ensureStatus() {
    let node = document.getElementById(STATUS_ID);
    if (node) return node;
    node = document.createElement('button');
    node.id = STATUS_ID;
    node.type = 'button';
    node.className = 'mi-offline-status';
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = '<span class="mi-offline-dot" aria-hidden="true"></span><span>Po përgatitet offline</span>';
    node.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice.catch(() => null);
        deferredInstallPrompt = null;
        node.dataset.installable = 'false';
        return;
      }
      if (registration?.waiting) {
        registration.waiting.postMessage({ type:'SKIP_WAITING' });
        setStatus('update', 'Përditësimi po aktivizohet');
        return;
      }
      if (updateActivated) {
        location.reload();
        return;
      }
      if (navigator.onLine) {
        warmRequested = false;
        await warmPrivateData({ force:true });
      }
    });
    const host = statusHost();
    const primary = host.querySelector?.('.mi-primary-action');
    host.insertBefore(node, primary || host.firstChild || null);
    return node;
  }

  function setStatus(state, label, detail = {}) {
    const node = ensureStatus();
    node.dataset.state = state;
    const labelNode = node.querySelector('span:last-child');
    if (labelNode) labelNode.textContent = label;
    const syncText = detail.syncedAt ? ` · Sinkronizuar ${new Date(detail.syncedAt).toLocaleTimeString('sq-AL', { hour:'2-digit', minute:'2-digit' })}` : '';
    node.title = `${label}${syncText}`;
    node.setAttribute('aria-label', node.title);
    window.dispatchEvent(new CustomEvent('medindex:offline-status', { detail:{ state, label, ...detail } }));
  }

  function currentStatus() {
    if (!navigator.onLine) return ['offline', 'Pa internet · po përdoret kopja lokale'];
    return cacheIsFresh() ? ['ready', 'Gati për përdorim offline'] : ['syncing', 'Online · po kontrollohet kopja lokale'];
  }

  function lastWarmAt() {
    try { return Number(localStorage.getItem(LAST_WARM_KEY) || 0); }
    catch { return 0; }
  }

  function cacheIsFresh(now = Date.now()) {
    const value = lastWarmAt();
    return Number.isFinite(value) && value > 0 && now - value < WARM_TTL_MS;
  }

  function rememberWarm(value = Date.now()) {
    try { localStorage.setItem(LAST_WARM_KEY, String(value)); } catch {}
  }

  function connectionAllowsBackgroundWarm() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return false;
    return !/^(slow-2g|2g)$/i.test(String(connection?.effectiveType || ''));
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return false;
    try {
      if (await navigator.storage.persisted?.()) return true;
      return Boolean(await navigator.storage.persist());
    } catch { return false; }
  }

  function postToWorker(message) {
    const worker = navigator.serviceWorker.controller || registration?.active || registration?.waiting;
    worker?.postMessage(message);
  }

  async function warmPrivateData({ force = false } = {}) {
    if (warmRequested || !navigator.onLine) return;
    if (!force && cacheIsFresh()) {
      postToWorker({ type:'GET_CACHE_STATUS' });
      return;
    }
    warmRequested = true;
    clearTimeout(warmDeadline);
    setStatus('syncing', 'Po sinkronizohet databaza lokale');
    postToWorker({ type:'WARM_PRIVATE_DATA' });
    warmDeadline = setTimeout(() => {
      if (document.getElementById(STATUS_ID)?.dataset.state === 'syncing') {
        setStatus('limited', 'Sinkronizimi nuk u konfirmua · kliko për ta provuar');
        warmRequested = false;
      }
    }, 15000);
  }

  function scheduleBackgroundWarm() {
    if (warmSchedule || cacheIsFresh() || !navigator.onLine || !connectionAllowsBackgroundWarm()) {
      postToWorker({ type:'GET_CACHE_STATUS' });
      return;
    }
    const run = () => {
      warmSchedule = 0;
      if (document.visibilityState === 'hidden') return;
      warmPrivateData();
    };
    if ('requestIdleCallback' in window) warmSchedule = requestIdleCallback(run, { timeout:WARM_IDLE_DELAY_MS });
    else warmSchedule = setTimeout(run, WARM_IDLE_DELAY_MS);
  }

  function observeWorkerUpdates() {
    if (!registration) return;
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          setStatus('update', 'Përditësim gati · kliko për ta aktivizuar');
        }
      });
    });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setStatus('limited', 'Shfletuesi nuk e mbështet offline mode');
      return null;
    }
    try {
      registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope:'/', updateViaCache:'none' });
      observeWorkerUpdates();
      await navigator.serviceWorker.ready;
      requestPersistentStorage();
      postToWorker({ type:'GET_CACHE_STATUS' });
      scheduleBackgroundWarm();
      if (!navigator.onLine) setStatus('offline', 'Pa internet · po përdoret kopja lokale');
      return registration;
    } catch (error) {
      console.warn('Offline runtime nuk u aktivizua:', error);
      setStatus('limited', 'Offline mode nuk u aktivizua');
      return null;
    }
  }

  function installListeners() {
    window.addEventListener('online', () => {
      warmRequested = false;
      setStatus('syncing', 'Lidhja u rikthye · po kontrollohet cache-i');
      registration?.update().catch(() => null);
      scheduleBackgroundWarm();
    });
    window.addEventListener('offline', () => setStatus('offline', 'Pa internet · po përdoret kopja lokale'));
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      const node = ensureStatus();
      node.dataset.installable = 'true';
      node.title = 'Instalo MedIndex në pajisje';
      node.setAttribute('aria-label', node.title);
    });
    navigator.serviceWorker?.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type === 'MEDINDEX_AUTH_INVALID') {
        window.dispatchEvent(new CustomEvent('medindex:offline-auth-invalid'));
        return;
      }
      if (message.type !== 'MEDINDEX_CACHE_STATUS') return;
      if (message.state === 'syncing') setStatus('syncing', 'Po sinkronizohet databaza lokale');
      if (message.state === 'ready' || message.state === 'shell-ready') {
        clearTimeout(warmDeadline);
        warmRequested = true;
        if (message.state === 'ready') rememberWarm(message.syncedAt || Date.now());
        setStatus('ready', 'Gati për përdorim offline', message);
      }
      if (message.state === 'shell-limited') setStatus('limited', 'Disa skedarë do të ruhen gjatë përdorimit', message);
      if (message.state === 'limited') {
        clearTimeout(warmDeadline);
        warmRequested = false;
        setStatus('limited', 'Disa të dhëna kërkojnë internet · kliko për sinkronizim', message);
      }
      if (message.state === 'cleared') {
        try { localStorage.removeItem(LAST_WARM_KEY); } catch {}
        setStatus('limited', 'Të dhënat private lokale u pastruan');
      }
    });
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      updateActivated = true;
      setStatus('update', 'Përditësimi është aktiv · kliko për rifreskim');
      window.dispatchEvent(new CustomEvent('medindex:offline-controller-ready'));
    });
  }

  async function start() {
    ensureHeadMetadata();
    injectStyles();
    ensureClinicalWorkflow();
    const [state, label] = currentStatus();
    setStatus(state, label);
    installListeners();
    await registerServiceWorker();
    window.MedIndexOffline = {
      version:VERSION,
      warm:() => { warmRequested = false; return warmPrivateData({ force:true }); },
      clearPrivateData:() => postToWorker({ type:'CLEAR_PRIVATE_DATA' }),
      registration:() => registration,
      status:() => document.getElementById(STATUS_ID)?.dataset.state || 'unknown',
    };
    window.dispatchEvent(new CustomEvent('medindex:offline-runtime-ready', { detail:{ version:VERSION } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
