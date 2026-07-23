(() => {
  'use strict';

  const RETURN_KEY = 'medindex_return_after_login';
  const originalFetch = window.fetch.bind(window);
  document.documentElement.classList.add('auth-checking');

  function installStyles() {
    if (document.getElementById('authClientStyles')) return;
    const style = document.createElement('style');
    style.id = 'authClientStyles';
    style.textContent = `
      html.auth-checking body{visibility:hidden!important;opacity:0!important}
      html:not(.auth-checking) body{opacity:1;transition:opacity .12s ease}
      .auth-logout{flex:0 0 auto;min-width:0;border:0;background:transparent;color:inherit;cursor:pointer}
      .auth-logout:hover{background:rgba(255,255,255,.13)!important;color:#fff!important}
      .auth-logout svg{fill:none;stroke:currentColor;stroke-width:16;stroke-linecap:round;stroke-linejoin:round}
      .session-expired-banner{position:fixed;left:50%;bottom:22px;z-index:2000;max-width:min(520px,calc(100vw - 28px));padding:11px 15px;border-radius:11px;background:#8e2f32;color:#fff;box-shadow:0 16px 45px rgba(0,0,0,.32);font-size:.78rem;font-weight:750;transform:translateX(-50%)}
      @media(prefers-reduced-motion:reduce){html:not(.auth-checking) body{transition:none}}
    `;
    document.head.appendChild(style);
  }
  installStyles();

  function safeReturnPath() {
    const path = location.pathname + location.search + location.hash;
    return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/') ? path : '/index.html';
  }

  async function authRequest(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      return await originalFetch('/api/auth', {
        cache: 'no-store', credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        ...options, signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
  }

  function goToLogin() {
    try { sessionStorage.setItem(RETURN_KEY, safeReturnPath()); } catch {}
    location.replace('/login.html');
  }

  async function logout() {
    const buttons = document.querySelectorAll('.auth-logout');
    buttons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
    try { await authRequest({ method: 'DELETE' }); } catch {}
    try {
      sessionStorage.removeItem(RETURN_KEY);
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
    const appMenu = document.getElementById('appMenu');
    if (appMenu && !appMenu.querySelector('.auth-logout')) appMenu.insertBefore(buttonMarkup('app-menu-link'), appMenu.querySelector('.theme-control') || null);
    const atcNav = document.querySelector('.atc-nav');
    if (atcNav && !atcNav.querySelector('.auth-logout')) atcNav.insertBefore(buttonMarkup('atc-nav-link'), atcNav.querySelector('.atc-theme') || null);
    const medNav = document.querySelector('.med-nav');
    if (medNav && !medNav.querySelector('.auth-logout')) medNav.insertBefore(buttonMarkup('med-nav-link'), medNav.querySelector('.med-theme') || null);
  }

  function showExpired() {
    if (document.querySelector('.session-expired-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'session-expired-banner';
    banner.setAttribute('role', 'alert');
    banner.textContent = 'Sesioni ka skaduar. Po kthehesh te hyrja…';
    document.body.appendChild(banner);
    setTimeout(goToLogin, 700);
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
      if (!response.ok || !payload.authenticated) return goToLogin();
      document.documentElement.classList.remove('auth-checking');
      installLogout();
      const observer = new MutationObserver(installLogout);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch { goToLogin(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
