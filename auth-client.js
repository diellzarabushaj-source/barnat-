(() => {
  'use strict';

  const RETURN_KEY = 'medindex_return_after_login';
  const OFFLINE_LEASE_KEY = 'medindex_offline_lease_v2';
  const LEGACY_OFFLINE_LEASE_KEYS = ['medindex_offline_lease_v1'];
  const OFFLINE_RUNTIME_SRC = '/offline-runtime-performance.js?v=low-bandwidth-v3';
  const PROFESSIONAL_RUNTIME_SRC = '/tailadmin-professional.js?v=production-audit-v2';
  const PROFESSIONAL_VERSION = 'production-audit-v2';
  const MAX_OFFLINE_LEASE_MS = 8 * 60 * 60 * 1000;
  const AUTH_TIMEOUT_MS = 3200;
  const originalFetch = window.fetch.bind(window);
  let logoutObserver = null;
  let logoutObserverTimer = 0;
  let authSettled = false;
  let resolveAuthReady;
  let onlineRevalidationInstalled = false;
  let authBootstrap = null;

  document.documentElement.classList.add('auth-checking');
  window.MEDINDEX_AUTH_READY = new Promise(resolve => { resolveAuthReady = resolve; });

  function ensureAuthBootstrap() {
    if (authBootstrap?.isConnected) return authBootstrap;
    authBootstrap = document.getElementById('miAuthBootstrap') || document.createElement('div');
    authBootstrap.id = 'miAuthBootstrap';
    authBootstrap.setAttribute('role', 'status');
    authBootstrap.setAttribute('aria-live', 'polite');
    authBootstrap.innerHTML = '<strong>MedIndex</strong><span>Po verifikohet sesioni…</span>';
    if (!authBootstrap.isConnected) (document.body || document.documentElement).appendChild(authBootstrap);
    return authBootstrap;
  }

  function setAuthBootstrapMessage(message) {
    ensureAuthBootstrap().querySelector('span').textContent = message;
  }

  function removeAuthBootstrap() {
    authBootstrap?.remove();
    authBootstrap = null;
  }

  function settleAuth(authenticated, payload = {}) {
    if (authSettled) return;
    authSettled = true;
    if (authenticated) removeAuthBootstrap();
    resolveAuthReady?.({ authenticated, ...payload });
    window.dispatchEvent(new CustomEvent(authenticated ? 'medindex:auth-ready' : 'medindex:auth-failed', {
      detail:{ authenticated, ...payload },
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
      #miAuthBootstrap{position:fixed;inset:0;z-index:3999;display:grid;place-content:center;gap:6px;padding:24px;background:#f6f9f8;color:#566a6d;text-align:center;font:500 14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif;visibility:visible!important;opacity:1!important}
      #miAuthBootstrap strong{color:#155f63;font-size:20px;letter-spacing:-.02em}
      html[data-theme="dark"] #miAuthBootstrap{background:#101d20;color:#aebfbc}
      html[data-theme="dark"] #miAuthBootstrap strong{color:#d9ece8}
    `;
    document.head.appendChild(style);
  }
  installStyles();
  ensureAuthBootstrap();

  function safeReturnPath() {
    const path = location.pathname + location.search + location.hash;
    return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/') && !path.startsWith('/login')
      ? path
      : '/index.html';
  }

  function removeLegacyOfflineLeases() {
    try { LEGACY_OFFLINE_LEASE_KEYS.forEach(key => localStorage.removeItem(key)); } catch {}
  }

  function readOfflineLease() {
    removeLegacyOfflineLeases();
    try {
      const lease = JSON.parse(localStorage.getItem(OFFLINE_LEASE_KEY) || 'null');
      const now = Date.now();
      if (!lease || lease.version !== 2 || lease.hardened !== true) return null;
      if (!Number.isFinite(lease.verifiedAt) || !Number.isFinite(lease.expiresAt)) return null;
      if (lease.verifiedAt > now + 5 * 60 * 1000) return null;
      if (lease.expiresAt <= now || lease.expiresAt - lease.verifiedAt > MAX_OFFLINE_LEASE_MS) return null;
      return lease;
    } catch { return null; }
  }

  function saveOfflineLease(payload = {}) {
    if (payload.authenticated !== true || payload.hardened !== true) return null;
    const sessionHours = Math.min(8, Math.max(1, Number(payload.sessionHours || 8)));
    const verifiedAt = Date.now();
    const lease = {
      version:2,
      hardened:true,
      verifiedAt,
      expiresAt:verifiedAt + sessionHours * 60 * 60 * 1000,
    };
    try {
      localStorage.setItem(OFFLINE_LEASE_KEY, JSON.stringify(lease));
      removeLegacyOfflineLeases();
    } catch {}
    return lease;
  }

  function clearOfflineLease() {
    try {
      localStorage.removeItem(OFFLINE_LEASE_KEY);
      LEGACY_OFFLINE_LEASE_KEYS.forEach(key => localStorage.removeItem(key));
    } catch {}
  }

  function ensureProfessionalRuntime() {
    if (document.documentElement.dataset.miProfessionalVersion === PROFESSIONAL_VERSION) return;
    if (document.querySelector('script[data-medindex-professional-runtime]')) return;
    const script = document.createElement('script');
    script.src = PROFESSIONAL_RUNTIME_SRC;
    script.defer = true;
    script.dataset.medindexProfessionalRuntime = '1';
    document.head.appendChild(script);
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
    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      return await originalFetch('/api/auth', {
        cache:'no-store',
        credentials:'same-origin',
        headers:{ Accept:'application/json', ...(options.headers || {}) },
        ...options,
        signal:controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function goToLogin(reason = 'unauthenticated') {
    clearOfflineLease();
    setAuthBootstrapMessage('Po hapet faqja e hyrjes…');
    settleAuth(false, { reason });
    const returnPath = safeReturnPath();
    try { sessionStorage.setItem(RETURN_KEY, returnPath); } catch {}
    const loginUrl = new URL('/login.html', location.origin);
    loginUrl.searchParams.set('return', returnPath);
    location.replace(loginUrl.pathname + loginUrl.search);
  }

  function deleteDatabase(name) {
    return new Promise(resolve => {
      try {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      } catch { resolve(); }
    });
  }

  function clearSensitiveWebStorage() {
    const localKeys = [
      OFFLINE_LEASE_KEY,
      ...LEGACY_OFFLINE_LEASE_KEYS,
      'barnat-registry-parts-v2', 'barnat-registry-cached-at-v2',
      'barnat-registry-parts-v3', 'barnat-registry-cached-at-v3',
      'barnat-registry-parts-v4', 'barnat-registry-cached-at-v4',
      'barnat-registry-cached-at-v5',
      'regjistriBarnave_protokollet_v1',
      'medindex_rx_autodraft_v1',
    ];
    const sessionKeys = [
      RETURN_KEY,
      'medindex_labs_cache_v3',
      'medindexPrescriptionSelection',
      'medindex_rx_diagnosis_v1',
    ];
    try { localKeys.forEach(key => localStorage.removeItem(key)); } catch {}
    try { sessionKeys.forEach(key => sessionStorage.removeItem(key)); } catch {}
    window.MEDINDEX_RUNTIME?.clearPrivateClientCaches?.();
  }

  async function clearPrivateBrowserData() {
    clearSensitiveWebStorage();
    await Promise.all([
      deleteDatabase('medindex-registry-v1'),
      deleteDatabase('medindex-prescriptions-v1'),
    ]);
    window.MedIndexLocalRegistry?.resetMemory?.();
    try {
      navigator.serviceWorker?.controller?.postMessage({ type:'CLEAR_PRIVATE_DATA' });
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
    try { await authRequest({ method:'DELETE' }); } catch {}
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
      ['.med-nav', 'med-nav-link', '.med-theme'],
    ];
    targets.forEach(([selector, className, beforeSelector]) => {
      const navigation = document.querySelector(selector);
      if (!navigation) return;
      navigationFound = true;
      if (!navigation.querySelector('.auth-logout')) navigation.insertBefore(buttonMarkup(className), navigation.querySelector(beforeSelector) || null);
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
    logoutObserver.observe(document.documentElement, { childList:true, subtree:true });
    logoutObserverTimer = setTimeout(stopLogoutObserver, 12000);
  }

  function showExpiredBanner() {
    if (document.getElementById('sessionExpiredBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'sessionExpiredBanner';
    banner.className = 'session-expired-banner';
    banner.textContent = 'Sesioni ka skaduar. Po ktheheni te hyrja…';
    document.body.appendChild(banner);
  }

  function interceptFetch() {
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const request = args[0];
      const url = typeof request === 'string' ? request : request?.url || '';
      if (response.status === 401 && /\/api\//.test(url) && !/\/api\/auth/.test(url)) {
        showExpiredBanner();
        clearOfflineLease();
        setTimeout(() => goToLogin('session-expired'), 700);
      }
      return response;
    };
  }

  function applyAuthenticated(payload = {}) {
    saveOfflineLease(payload);
    ensureProfessionalRuntime();
    startOfflineRuntime();
    document.documentElement.classList.remove('auth-checking', 'auth-offline');
    document.documentElement.classList.add('auth-ready');
    document.documentElement.dataset.authMode = payload.offline ? 'offline' : 'online';
    installLogoutWhenReady();
    settleAuth(true, payload);
  }

  function applyOfflineLease(lease) {
    ensureProfessionalRuntime();
    startOfflineRuntime();
    document.documentElement.classList.remove('auth-checking');
    document.documentElement.classList.add('auth-ready', 'auth-offline');
    document.documentElement.dataset.authMode = 'offline';
    installLogoutWhenReady();
    settleAuth(true, { offline:true, lease });
  }

  async function verifySession({ allowOffline = true } = {}) {
    try {
      const response = await authRequest();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.authenticated !== true || payload.hardened !== true) {
        if (payload.code === 'AUTH_NOT_CONFIGURED') clearOfflineLease();
        return false;
      }
      applyAuthenticated(payload);
      return true;
    } catch (error) {
      if (!allowOffline) return false;
      const lease = readOfflineLease();
      if (!lease) return false;
      applyOfflineLease(lease);
      return true;
    }
  }

  function installOnlineRevalidation() {
    if (onlineRevalidationInstalled) return;
    onlineRevalidationInstalled = true;
    window.addEventListener('online', async () => {
      const authenticated = await verifySession({ allowOffline:false });
      if (!authenticated) goToLogin('online-revalidation-failed');
    });
  }

  async function boot() {
    interceptFetch();
    installOnlineRevalidation();
    const authenticated = await verifySession();
    if (!authenticated) goToLogin('unauthenticated');
  }

  boot();
})();
