(() => {
  'use strict';

  const VERSION = '5a3e284e-offline-v1';
  const MANIFEST_URL = `/manifest.webmanifest?v=${VERSION}`;
  const SERVICE_WORKER_URL = `/sw.js?v=${VERSION}`;
  const STATUS_ID = 'miOfflineStatus';
  let registration = null;
  let deferredInstallPrompt = null;
  let warmRequested = false;

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
      ['apple-mobile-web-app-title', 'MedIndex']
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

  function injectStyles() {
    if (document.getElementById('medindexOfflineStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexOfflineStyles';
    style.textContent = `
      .mi-offline-status{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 10px;border:1px solid var(--mi-gray-200,#e4e7ec);border-radius:10px;background:var(--mi-white,#fff);color:var(--mi-gray-600,#475467);font:700 12px/1 var(--mi-font,Outfit,system-ui,sans-serif);white-space:nowrap;box-shadow:0 1px 2px rgba(16,24,40,.03);cursor:default}
      .mi-offline-status[data-state="ready"]{border-color:#abefc6;background:#ecfdf3;color:#067647}.mi-offline-status[data-state="offline"]{border-color:#fedf89;background:#fffaeb;color:#b54708}.mi-offline-status[data-state="syncing"]{border-color:#b2ccff;background:#eff4ff;color:#3538cd}.mi-offline-status[data-state="limited"]{border-color:#fecdc9;background:#fef3f2;color:#b42318}.mi-offline-status[data-installable="true"]{cursor:pointer}
      .mi-offline-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}
      .mi-offline-status[data-state="syncing"] .mi-offline-dot{animation:miOfflinePulse 1s ease-in-out infinite}
      html[data-theme="dark"] .mi-offline-status{background:#182230;border-color:#344054;color:#d0d5dd}html[data-theme="dark"] .mi-offline-status[data-state="ready"]{background:#053321;border-color:#067647;color:#75e0a7}html[data-theme="dark"] .mi-offline-status[data-state="offline"]{background:#4e1d09;border-color:#b54708;color:#fec84b}
      @keyframes miOfflinePulse{50%{opacity:.35;transform:scale(.72)}}
      @media(max-width:1180px){.mi-offline-status span:last-child{display:none}.mi-offline-status{width:38px;padding:0;justify-content:center}}
      @media(max-width:760px){.mi-offline-status{display:none}}
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
    node.hidden = false;
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = '<span class="mi-offline-dot" aria-hidden="true"></span><span>Po përgatitet offline</span>';
    node.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      node.dataset.installable = 'false';
    });
    const host = statusHost();
    const primary = host.querySelector?.('.mi-primary-action');
    host.insertBefore(node, primary || host.firstChild || null);
    return node;
  }

  function setStatus(state, label) {
    const node = ensureStatus();
    node.dataset.state = state;
    node.querySelector('span:last-child').textContent = label;
    node.title = label;
    window.dispatchEvent(new CustomEvent('medindex:offline-status', { detail: { state, label } }));
  }

  function currentStatus() {
    if (!navigator.onLine) return ['offline', 'Pa internet · po përdoret kopja lokale'];
    return ['syncing', 'Online · po sinkronizohet'];
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return false;
    try {
      const persisted = await navigator.storage.persisted?.();
      if (persisted) return true;
      return Boolean(await navigator.storage.persist());
    } catch {
      return false;
    }
  }

  function postToWorker(message) {
    const worker = navigator.serviceWorker.controller || registration?.active || registration?.waiting;
    worker?.postMessage(message);
  }

  async function warmPrivateData() {
    if (warmRequested || !navigator.onLine) return;
    warmRequested = true;
    setStatus('syncing', 'Po ruhet databaza për punë offline');
    postToWorker({ type: 'WARM_PRIVATE_DATA' });
    window.setTimeout(() => {
      if (document.getElementById(STATUS_ID)?.dataset.state === 'syncing') {
        setStatus('ready', 'Gati për përdorim offline');
      }
    }, 12000);
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setStatus('limited', 'Shfletuesi nuk e mbështet offline mode');
      return null;
    }
    try {
      registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        scope: '/',
        updateViaCache: 'none'
      });
      await navigator.serviceWorker.ready;
      await requestPersistentStorage();
      await warmPrivateData();
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
      setStatus('syncing', 'Lidhja u rikthye · po sinkronizohet');
      registration?.update().catch(() => null);
      warmPrivateData();
    });
    window.addEventListener('offline', () => setStatus('offline', 'Pa internet · po përdoret kopja lokale'));
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      const node = ensureStatus();
      node.dataset.installable = 'true';
      node.title = 'Instalo MedIndex në pajisje';
    });
    navigator.serviceWorker?.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type !== 'MEDINDEX_CACHE_STATUS') return;
      if (message.state === 'syncing') setStatus('syncing', 'Po ruhet databaza për punë offline');
      if (message.state === 'ready' || message.state === 'shell-ready') setStatus('ready', 'Gati për përdorim offline');
      if (message.state === 'limited') setStatus('limited', 'Disa të dhëna kërkojnë internet');
      if (message.state === 'cleared') setStatus('limited', 'Të dhënat private lokale u pastruan');
    });
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      window.dispatchEvent(new CustomEvent('medindex:offline-controller-ready'));
    });
  }

  async function start() {
    ensureHeadMetadata();
    injectStyles();
    const [state, label] = currentStatus();
    setStatus(state, label);
    installListeners();
    await registerServiceWorker();
    window.MedIndexOffline = {
      version: VERSION,
      warm: () => { warmRequested = false; return warmPrivateData(); },
      clearPrivateData: () => postToWorker({ type: 'CLEAR_PRIVATE_DATA' }),
      registration: () => registration
    };
    window.dispatchEvent(new CustomEvent('medindex:offline-runtime-ready', { detail: { version: VERSION } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
