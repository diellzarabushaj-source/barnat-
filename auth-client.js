(() => {
  'use strict';

  const RETURN_KEY = 'medindex_return_after_login';
  const OFFLINE_LEASE_KEY = 'medindex_offline_lease_v1';
  const OFFLINE_RUNTIME_SRC = '/offline-runtime.js?v=5a3e284e-offline-v1';
  const MAX_OFFLINE_LEASE_MS = 12 * 60 * 60 * 1000;
  const originalFetch = window.fetch.bind(window);
  let logoutObserver = null;
  let logoutObserverTimer = 0;
  let authSettled = false;
  let resolveAuthReady;
  let onlineRevalidationInstalled = false;

  document.documentElement.classList.add('auth-checking');
  window.MEDINDEX_AUTH_READY = new Promise(resolve => { resolveAuthReady = resolve; });

  function settleAuth(authenticated, payload = {}) {
    if (authSettled) return;
    authSettled = true;
    resolveAuthReady?.({ authenticated, ...payload });
    window.dispatchEvent(new CustomEvent(authenticated ? 'medindex:auth-ready' : 'medindex:auth-failed', {
      detail: { authenticated, ...payload }
    }));
  }

  function installStyles() {
    if (document.getElementById('authClientStyles')) return;
    const style = document.createElement('style');
    style.id = 'authClientStyles';
    style.textContent = `
      .auth-logout{flex:0 0 auto;min-width:0;border:0;background:transparent;color:inherit;cursor:pointer}
      .auth-logout:hover{background:rgba(255,255,255,.13)!important;color:#fff!important}
      .auth-logout svg{fill:none;stroke:currentColor;stroke-width:16;stroke-linecap:round;stroke-linejoin:round}
      .session-expired-banner{position:fixed;left:50%;bottom:22px;z-index:2000;max-width:min(520px,calc(100vw - 28px));padding:11px 15px;border-radius:11px;background:#8e2f32;color:#fff;box-shadow:0 16px 45px rgba(0,0,0,.32);font-size:.78rem;font-weight:750;transform:translateX(-50%)}
    `;
    document.head.appendChild(style);
  }
  installStyles();

  function safeReturnPath() {
    const path = location.pathname + location.search + location.hash;
    return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/') && !path.startsWith('/login')
      ? path
      : '/index.html';
  }

  function readOfflineLease() {
    try {
      const lease = JSON.parse(localStorage.getItem(OFFLINE_LEASE_KEY) || 'null');
      const now = Date.now();
      if (!lease || lease.version !== 1) return null;
      if (!Number.isFinite(lease.verifiedAt) || !Number.isFinite(lease.expiresAt)) return null;
      if (lease.verifiedAt > now + 5 * 60 * 1000) return null;
      if (lease.expiresAt <= now || lease.expiresAt - lease.verifiedAt > MAX_OFFLINE_LEASE_MS) return null;
      return lease;
    } catch {
      return null;
    }
  }

  function saveOfflineLease(payload = {}) {
    const sessionHours = Math.min(12, Math.max(1, Number(payload.sessionHours || 8)));
    const verifiedAt = Date.now();
    const lease = { version: 1, verifiedAt, expiresAt: verifiedAt + sessionHours * 60 * 60 * 1000 };
    try { localStorage.setItem(OFFLINE_LEASE_KEY, JSON.stringify(lease)); } catch {}
    return lease;
  }

  function clearOfflineLease() {
    try { localStorage.removeItem(OFFLINE_LEASE_KEY); } catch {}
  }

  function startOfflineRuntime() {
    if (document.querySelector('script[data-medindex-offline-runtime]') || window.MedIndexOffline) return;
    const script = document.createElement('script');
    script.src = OFFLINE_RUNTIME_SRC;
    script.defer = true;
    script.dataset.medindexOfflineRuntime = '1';
    document.head.appendChild(script);
  }

  async function authRequest(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      return await originalFetch('/api/auth', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function goToLogin(reason = 'unauthenticated') {
    clearOfflineLease();
    settleAuth(false, { reason });
    const returnPath = safeReturnPath();
    try { sessionStorage.setItem(RETURN_KEY, returnPath); } catch {}
    const loginUrl = new URL('/login.html', location.origin);
    loginUrl.searchParams.set('return', returnPath);
    location.replace(loginUrl.pathname + loginUrl.search);
  }

  async function clearPrivateBrowserData() {
    clearOfflineLease();
    try {
      sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.removeItem('medindex_labs_cache_v3');
      ['barnat-registry-parts-v2', 'barnat-registry-cached-at-v2', 'barnat-registry-parts-v3', 'barnat-registry-cached-at-v3']
        .forEach(key => localStorage.removeItem(key));
    } catch {}
    try { indexedDB.deleteDatabase('medindex-registry-v1'); } catch {}
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PRIVATE_DATA' });
      const names = await caches.keys();
      await Promise.all(names
        .filter(name => name.startsWith('medindex-private-') || name.startsWith('medindex-documents-'))
        .map(name => caches.delete(name)));
    } catch {}
  }

  async function logout() {
    const buttons = document.querySelectorAll('.auth-logout');
    buttons.forEach(button => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    try { await authRequest({ method: 'DELETE' }); } catch {}
    await clearPrivateBrowserData();
    location.replace('/login.html');
  }

  function buttonMarkup(className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${className} auth-logout`;
    button.setAttribute('aria-label', 'Dil nga MedIndex');
    button.title = 'Dil nga MedIndex';
    button.innerHTML = `<span class="${className.includes('med-') ? 'med-nav-icon' : className.includes('atc-') ? 'atc-nav-icon' : 'app-menu-icon'}"><svg viewBox="0 0 256 256" aria-hidden="true"><path d="M104 48H56a16 16 0 0 0-16 16v128a16 16 0 0 0 16 16h48M160 80l48 48-48 48M208 128H96"/></svg></span><span class="${className.includes('med-') ? 'med-nav-title' : className.includes('atc-') ? 'atc-nav-title' : 'app-menu-title'}">Dil</span>`;
    button.addEventListener('click', logout);
    return button;
  }

  function installLogout() {
    let navigationFound = false;
    const targets = [
      ['#appMenu', 'app-menu-link', '.theme-control'],
      ['.atc-nav', 'atc-nav-link', '.atc-theme'],
      ['.med-nav', 'med-nav-link', '.med-theme']
    ];
    targets.forEach(([selector, className, beforeSelector]) => {
      const navigation = document.querySelector(selector);
      if (!navigation) return;
      navigationFound = true;
      if (!navigation.querySelector('.auth-logout')) {
        navigation.insertBefore(buttonMarkup(className), navigation.querySelector(beforeSelector) || null);
      }
    });
    return navigationFound;
  }

  function stopLogoutObserver() {
    logoutObserver?.disconnect();
    logoutObserver = null;
    clearTimeout(logoutObserverTimer);
    logoutObserverTimer = 0;
  }

  function installLogoutWhenReady() {
    if (installLogout()) return;
    stopLogoutObserver();
    logoutObserver = new MutationObserver(() => {
      if (installLogout()) stopLogoutObserver();
    });
    logoutObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    logoutObserverTimer = window.setTimeout(stopLogoutObserver, 10000);
  }

  function showExpired() {
    if (document.querySelector('.session-expired-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'session-expired-banner';
    banner.setAttribute('role', 'alert');
    banner.textContent = 'Sesioni ka skaduar. Po kthehesh te hyrja…';
    document.body.appendChild(banner);
    clearOfflineLease();
    settleAuth(false, { reason: 'expired' });
    setTimeout(() => goToLogin('expired'), 700);
  }

  function activateOfflineLease(reason) {
    const lease = readOfflineLease();
    if (!lease) return false;
    document.documentElement.classList.add('auth-ready', 'auth-offline');
    document.documentElement.classList.remove('auth-checking');
    settleAuth(true, { offline: true, reason, expiresAt: lease.expiresAt });
    installLogoutWhenReady();
    startOfflineRuntime();
    installOnlineRevalidation();
    return true;
  }

  async function revalidateOnlineSession() {
    if (!document.documentElement.classList.contains('auth-offline') || !navigator.onLine) return;
    try {
      const response = await authRequest();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.authenticated) return showExpired();
      saveOfflineLease(payload);
      document.documentElement.classList.remove('auth-offline');
      window.dispatchEvent(new CustomEvent('medindex:auth-revalidated', { detail: { authenticated: true } }));
      window.MedIndexOffline?.warm?.();
    } catch {}
  }

  function installOnlineRevalidation() {
    if (onlineRevalidationInstalled) return;
    onlineRevalidationInstalled = true;
    window.addEventListener('online', revalidateOnlineSession);
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const target = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (response.status === 401 && !String(target).includes('/api/auth')) showExpired();
    return response;
  };

  async function init() {
    try {
      const response = await authRequest();
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) return goToLogin('unauthenticated');
      if (!response.ok || !payload.authenticated) {
        if (response.status >= 500 && activateOfflineLease('server-unavailable')) return;
        return goToLogin('unauthenticated');
      }
      const lease = saveOfflineLease(payload);
      document.documentElement.classList.add('auth-ready');
      document.documentElement.classList.remove('auth-checking', 'auth-offline');
      settleAuth(true, { ...payload, offline: false, expiresAt: lease.expiresAt });
      installLogoutWhenReady();
      startOfflineRuntime();
    } catch (error) {
      if (activateOfflineLease(error?.name === 'AbortError' ? 'timeout' : 'network')) return;
      goToLogin(error?.name === 'AbortError' ? 'timeout' : 'network');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
