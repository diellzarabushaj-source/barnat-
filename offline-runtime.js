(() => {
  'use strict';

  const VERSION = 'production-audit-v2';
  const RESILIENCE_VERSION = 'low-bandwidth-v2';
  const MANIFEST_URL = `/manifest.webmanifest?v=${VERSION}`;
  const SERVICE_WORKER_URL = `/sw-resilient.js?v=${RESILIENCE_VERSION}`;
  const CLINICAL_WORKFLOW_URL = `/clinical-workflow.js?v=${VERSION}`;
  const STATUS_ID = 'miOfflineStatus';
  const LAST_WARM_KEY = 'medindex_private_cache_warmed_at_v1';
  const WARM_TTL_MS = 6 * 60 * 60 * 1000;
  const WARM_IDLE_DELAY_MS = 8000;
  const REGISTER_IDLE_DELAY_MS = 1200;
  const NETWORK_PROBE_TIMEOUT_MS = 6000;
  const NETWORK_FAILURE_REASONS = new Set(['network', 'timeout', 'offline', 'offline-no-lease', 'server-unavailable']);
  let registration = null;
  let deferredInstallPrompt = null;
  let warmRequested = false;
  let warmDeadline = 0;
  let warmSchedule = 0;
  let registerSchedule = 0;
  let updateActivated = false;
  let networkReachable = navigator.onLine;
  let reachabilityPromise = null;

  function connectionInfo() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || '');
    return {
      online:networkReachable && navigator.onLine,
      slow:/^(slow-2g|2g)$/i.test(effectiveType) || Number(connection?.downlink || 10) < 0.8 || Number(connection?.rtt || 0) > 900,
      saveData:Boolean(connection?.saveData),
      effectiveType,
    };
  }

  function connectionAllowsBackgroundWarm() {
    const profile = connectionInfo();
    if (profile.saveData) return false;
    return !/^(slow-2g|2g)$/i.test(profile.effectiveType) && !profile.slow;
  }

  function ensureHeadMetadata() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = MANIFEST_URL;
      document.head.appendChild(manifest);
    }
    const metadata = [
      ['theme-color', '#155f63'],
      ['mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'default'],
      ['apple-mobile-web-app-title', 'DRx'],
    ];
    metadata.forEach(([name, content]) => {
      if (document.querySelector(`meta[name="${name}"]`)) return;
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    });
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
      .mi-offline-status{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 10px;border:1px solid var(--mi-gray-200,#e4e7ec);border-radius:10px;background:var(--mi-white,#fff);color:var(--mi-gray-600,#475467);font:700 12px/1 var(--mi-font,system-ui,sans-serif);white-space:nowrap;box-shadow:0 1px 2px rgba(16,24,40,.03);cursor:pointer}
      .mi-offline-status[data-state="ready"]{border-color:#abefc6;background:#ecfdf3;color:#067647}.mi-offline-status[data-state="offline"]{border-color:#fedf89;background:#fffaeb;color:#b54708}.mi-offline-status[data-state="syncing"]{border-color:#b2ccff;background:#eff4ff;color:#3538cd}.mi-offline-status[data-state="limited"]{border-color:#fecdc9;background:#fef3f2;color:#b42318}.mi-offline-status[data-state="update"]{border-color:#b2ccff;background:#eff4ff;color:#3538cd}
      .mi-offline-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}.mi-offline-status[data-state="syncing"] .mi-offline-dot{animation:miOfflinePulse 1s ease-in-out infinite}
      @keyframes miOfflinePulse{50%{opacity:.35;transform:scale(.72)}}
      @media(max-width:1180px){.mi-offline-status span:last-child{display:none}.mi-offline-status{width:44px;min-width:44px;min-height:44px;padding:0;justify-content:center}}
      @media(max-width:760px){.mi-offline-status{display:inline-flex;width:44px;min-width:44px;min-height:44px;padding:0;justify-content:center}.mi-offline-status span:last-child{display:none}}
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
        return;
      }
      if (registration?.waiting) {
        registration.waiting.postMessage({ type:'SKIP_WAITING' });
        setStatus('update', 'Përditësimi po aktivizohet');
        return;
      }
      if (updateActivated) return location.reload();
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

  function postToWorker(message) {
    const worker = navigator.serviceWorker.controller || registration?.active || registration?.waiting;
    worker?.postMessage(message);
  }

  function sendNetworkProfile() {
    postToWorker({ type:'SET_NETWORK_PROFILE', profile:connectionInfo() });
  }

  function reachabilityFromAuth(detail) {
    if (!detail || typeof detail !== 'object') return null;
    if (detail.offline === true || NETWORK_FAILURE_REASONS.has(String(detail.reason || ''))) return false;
    if (detail.authenticated === true) return true;
    if (['unauthenticated', 'auth-not-configured', 'unhardened-session'].includes(String(detail.reason || ''))) return true;
    return null;
  }

  function applyNetworkReachability(reachable) {
    networkReachable = Boolean(reachable && navigator.onLine);
    sendNetworkProfile();
    if (!networkReachable) setStatus('offline', 'Pa internet · po përdoret kopja lokale');
    return networkReachable;
  }

  async function authConnectivitySignal() {
    const authReady = window.MEDINDEX_AUTH_READY;
    if (!authReady || typeof authReady.then !== 'function') return null;
    try { return reachabilityFromAuth(await authReady); }
    catch { return null; }
  }

  async function fallbackNetworkProbe() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_PROBE_TIMEOUT_MS);
    try {
      await fetch('/api/auth?offline_probe=1', {
        cache:'no-store',
        credentials:'same-origin',
        signal:controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function verifyNetworkReachability() {
    if (reachabilityPromise) return reachabilityPromise;
    reachabilityPromise = (async () => {
      const authReachable = await authConnectivitySignal();
      const reachable = authReachable === null ? await fallbackNetworkProbe() : authReachable;
      return applyNetworkReachability(reachable);
    })().finally(() => { reachabilityPromise = null; });
    return reachabilityPromise;
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return false;
    try {
      if (await navigator.storage.persisted?.()) return true;
      return Boolean(await navigator.storage.persist());
    } catch { return false; }
  }

  async function warmPrivateData({ force = false } = {}) {
    if (warmRequested || !navigator.onLine) return;
    if (!force && cacheIsFresh()) {
      postToWorker({ type:'GET_CACHE_STATUS' });
      return;
    }
    if (!force && !connectionAllowsBackgroundWarm()) {
      postToWorker({ type:'GET_CACHE_STATUS' });
      setStatus('limited', 'Lidhje e dobët · përdoret cache-i lokal');
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
    }, 20000);
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
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setStatus('update', 'Përditësim gati · kliko për ta aktivizuar');
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
      sendNetworkProfile();
      postToWorker({ type:'GET_CACHE_STATUS' });
      if (connectionAllowsBackgroundWarm()) scheduleBackgroundWarm();
      if (!navigator.onLine) setStatus('offline', 'Pa internet · po përdoret kopja lokale');
      if ('requestIdleCallback' in window) requestIdleCallback(() => requestPersistentStorage(), { timeout:6000 });
      else setTimeout(requestPersistentStorage, 3000);
      return registration;
    } catch (error) {
      console.warn('Offline runtime nuk u aktivizua:', error);
      setStatus('limited', 'Offline mode nuk u aktivizua');
      return null;
    }
  }

  function scheduleRegistration() {
    if (registerSchedule) return;
    const run = () => {
      registerSchedule = 0;
      registerServiceWorker();
    };
    if (navigator.serviceWorker?.controller) return run();
    const afterLoad = () => {
      if ('requestIdleCallback' in window) registerSchedule = requestIdleCallback(run, { timeout:REGISTER_IDLE_DELAY_MS });
      else registerSchedule = setTimeout(run, REGISTER_IDLE_DELAY_MS);
    };
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once:true });
  }

  function installListeners() {
    window.addEventListener('online', () => {
      networkReachable = true;
      warmRequested = false;
      sendNetworkProfile();
      setStatus('syncing', 'Lidhja u rikthye · po kontrollohet cache-i');
      if (connectionAllowsBackgroundWarm()) registration?.update().catch(() => null);
      scheduleBackgroundWarm();
    });
    window.addEventListener('offline', () => {
      networkReachable = false;
      sendNetworkProfile();
      setStatus('offline', 'Pa internet · po përdoret kopja lokale');
    });
    const applyAuthSignal = event => {
      const reachable = reachabilityFromAuth(event.detail);
      if (reachable === null) return;
      applyNetworkReachability(reachable);
      if (reachable && document.getElementById(STATUS_ID)?.dataset.state === 'offline') {
        setStatus('syncing', 'Lidhja u konfirmua · po kontrollohet cache-i');
      }
    };
    window.addEventListener('medindex:auth-ready', applyAuthSignal);
    window.addEventListener('medindex:auth-failed', applyAuthSignal);
    window.addEventListener('medindex:auth-revalidated', () => {
      applyNetworkReachability(true);
      scheduleBackgroundWarm();
    });
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    connection?.addEventListener?.('change', () => {
      sendNetworkProfile();
      if (connectionAllowsBackgroundWarm()) scheduleBackgroundWarm();
      else setStatus('limited', 'Lidhje e dobët · përdoret cache-i lokal');
    });
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      const node = ensureStatus();
      node.title = 'Instalo DRx në pajisje';
      node.setAttribute('aria-label', node.title);
    });
    navigator.serviceWorker?.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type === 'MEDINDEX_NETWORK_STATUS') {
        networkReachable = message.online !== false;
        if (!networkReachable) setStatus('offline', 'Pa internet · po përdoret kopja lokale');
        return;
      }
      if (message.type === 'MEDINDEX_AUTH_INVALID') {
        window.dispatchEvent(new CustomEvent('medindex:offline-auth-invalid'));
        return;
      }
      if (message.type !== 'MEDINDEX_CACHE_STATUS') return;
      if (message.online === false || !networkReachable || !navigator.onLine) {
        networkReachable = false;
        setStatus('offline', 'Pa internet · po përdoret kopja lokale');
        return;
      }
      if (message.state === 'syncing') setStatus('syncing', 'Po sinkronizohet databaza lokale');
      if (message.state === 'ready' || message.state === 'shell-ready') {
        clearTimeout(warmDeadline);
        warmRequested = true;
        if (message.state === 'ready') rememberWarm(message.syncedAt || Date.now());
        setStatus('ready', 'Gati për përdorim offline', message);
      }
      if (message.state === 'shell-limited') setStatus('limited', 'Disa skedarë ruhen gjatë përdorimit', message);
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

  function start() {
    ensureHeadMetadata();
    injectStyles();
    ensureClinicalWorkflow();
    const profile = connectionInfo();
    setStatus(!profile.online ? 'offline' : profile.slow || profile.saveData ? 'limited' : cacheIsFresh() ? 'ready' : 'syncing',
      !profile.online ? 'Pa internet · po përdoret kopja lokale' : profile.slow || profile.saveData ? 'Lidhje e dobët · përdoret cache-i lokal' : cacheIsFresh() ? 'Gati për përdorim offline' : 'Online · po kontrollohet kopja lokale');
    installListeners();
    void verifyNetworkReachability();
    window.MedIndexOffline = {
      version:RESILIENCE_VERSION,
      warm:() => { warmRequested = false; return warmPrivateData({ force:true }); },
      clearPrivateData:() => postToWorker({ type:'CLEAR_PRIVATE_DATA' }),
      registration:() => registration,
      status:() => document.getElementById(STATUS_ID)?.dataset.state || 'unknown',
    };
    window.dispatchEvent(new CustomEvent('medindex:offline-runtime-ready', { detail:{ version:RESILIENCE_VERSION } }));
    scheduleRegistration();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
