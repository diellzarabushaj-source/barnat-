(() => {
  'use strict';

  const RETURN_KEY = 'medindex_return_after_login';
  const originalFetch = window.fetch.bind(window);
  let logoutObserver = null;
  let logoutObserverTimer = 0;
  let authSettled = false;
  let resolveAuthReady;

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
    settleAuth(false, { reason });
    const returnPath = safeReturnPath();
    try { sessionStorage.setItem(RETURN_KEY, returnPath); } catch {}
    const loginUrl = new URL('/login.html', location.origin);
    loginUrl.searchParams.set('return', returnPath);
    location.replace(loginUrl.pathname + loginUrl.search);
  }

  async function logout() {
    const buttons = document.querySelectorAll('.auth-logout');
    buttons.forEach(button => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    try { await authRequest({ method: 'DELETE' }); } catch {}
    try {
      sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.removeItem('medindex_labs_cache_v3');
      localStorage.removeItem('barnat-registry-parts-v2');
      localStorage.removeItem('barnat-registry-cached-at-v2');
    } catch {}
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
    settleAuth(false, { reason: 'expired' });
    setTimeout(() => goToLogin('expired'), 700);
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
      if (!response.ok || !payload.authenticated) return goToLogin('unauthenticated');
      document.documentElement.classList.add('auth-ready');
      document.documentElement.classList.remove('auth-checking');
      settleAuth(true, payload);
      installLogoutWhenReady();
    } catch (error) {
      goToLogin(error?.name === 'AbortError' ? 'timeout' : 'network');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
