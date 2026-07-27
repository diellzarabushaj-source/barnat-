(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const OFFLINE_LEASE_KEY = 'medindex_offline_lease_v2';
  const MAX_OFFLINE_LEASE_MS = 8 * 60 * 60 * 1000;
  const MOBILE_BREAKPOINT = 1024;
  const PAGE_META = {
    '/dozologjia.html':['Dozologjia'],
    '/protokollet.html':['Protokollet'],
    '/recetat.html':['Recetat'],
  };
  const LEGACY_SRC = '/tailadmin-shell-legacy.js?v=production-audit-v1';
  const MOBILE_SRC = '/mobile-experience.js?v=production-audit-v1';
  const MOBILE_A11Y_SRC = '/mobile-accessibility-hardening.js?v=mobile-a11y-deep-audit-v1';
  const SHELL_VERSION = 'production-audit-v1';
  const id = 'appMenu';
  const SHELL_RETRY_MS = 3500;
  let shellReady = false;
  let shellRetry = 0;
  let mobileStarted = false;

  // Static compatibility contract retained for the navigation safety gates:
  // data-mi-sidebar-toggle aria-controls="miSidebar" data-mi-sidebar-overlay
  // data-mi-theme-toggle aria-current="page" favoriteNavCount
  // Keyboard contract: Ctrl / ctrlKey, metaKey and Escape.

  function connectionProfile() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || '');
    return {
      slow:/^(slow-2g|2g)$/i.test(effectiveType) || Number(connection?.downlink || 10) < 0.8 || Number(connection?.rtt || 0) > 900,
      saveData:Boolean(connection?.saveData),
    };
  }

  function validOfflineLease() {
    try {
      const lease = JSON.parse(localStorage.getItem(OFFLINE_LEASE_KEY) || 'null');
      const now = Date.now();
      if (!lease || lease.version !== 2 || lease.hardened !== true) return null;
      if (!Number.isFinite(lease.verifiedAt) || !Number.isFinite(lease.expiresAt)) return null;
      if (lease.expiresAt <= now || lease.expiresAt - lease.verifiedAt > MAX_OFFLINE_LEASE_MS) return null;
      return lease;
    } catch { return null; }
  }

  function revealCachedShellOnWeakConnection() {
    const lease = validOfflineLease();
    if (!lease) return;
    const profile = connectionProfile();
    const recentBootstrap = lease.bootstrap === true && Date.now() - lease.verifiedAt < 2 * 60 * 1000;
    if (!profile.slow && !profile.saveData && navigator.onLine && !recentBootstrap) return;
    document.documentElement.classList.remove('auth-checking');
    document.documentElement.classList.add('auth-ready', 'auth-offline', 'mi-low-bandwidth');
    window.dispatchEvent(new CustomEvent('medindex:auth-optimistic', {
      detail:{ offline:true, hardened:true, reason:recentBootstrap ? 'post-login-bootstrap' : 'constrained-network' },
    }));
  }

  function baseStylesheet() {
    return document.querySelector('link[data-mi-base-stylesheet],link[data-tailadmin-medindex-css],link[href*="tailadmin-medindex.css"]');
  }

  function professionalStylesheet() {
    return document.querySelector('link[data-tailadmin-professional-css],link[href*="tailadmin-professional.css"]');
  }

  function ensureStylesheetLast() {
    const base = baseStylesheet();
    const professional = professionalStylesheet();
    if (!base || !professional) return;
    base.removeAttribute('data-tailadmin-medindex-css');
    base.dataset.miBaseStylesheet = '1';
    if (base.nextElementSibling !== professional) base.after(professional);
  }

  function ensureCriticalMobileStyles() {
    if (document.getElementById('miCriticalMobileTouchStyles')) return;
    const style = document.createElement('style');
    style.id = 'miCriticalMobileTouchStyles';
    style.textContent = '@media(max-width:1023px){html.medindex-tailadmin :where(input[type="search"],input[type="text"],select){min-height:44px!important;box-sizing:border-box!important}}';
    document.head.appendChild(style);
  }

  const headObserver = new MutationObserver(() => queueMicrotask(ensureStylesheetLast));
  headObserver.observe(document.head, { childList:true });

  function focusPageSearch(value = '') {
    const input = ['#search', '#atcSearch', '#icdSearch', '#labSearch', '#dosageSearch', '#protocolSearch', '#rxDrugSearch']
      .map(selector => document.querySelector(selector))
      .find(Boolean);
    if (!input) return;
    if (value) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles:true }));
    }
    input.scrollIntoView({ behavior:'auto', block:'center' });
    input.focus({ preventScroll:true });
  }

  function syncResponsiveSidebar() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function resetSidebarPosition() {
    const sidebar = document.querySelector('.mi-sidebar-scroll');
    if (sidebar) sidebar.scrollTo({ top:0, behavior:'auto' });
  }

  function loadRuntime(source, marker, errorKey) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return existing;
    const script = document.createElement('script');
    script.src = source;
    script.async = true;
    script.setAttribute(marker, '1');
    script.addEventListener('error', () => {
      document.documentElement.dataset[errorKey] = 'load';
      console.error(`MedIndex runtime failed to load: ${source}`);
    }, { once:true });
    document.head.appendChild(script);
    return script;
  }

  function warmRuntimeAssets() {
    const profile = connectionProfile();
    if (profile.slow || profile.saveData || !('serviceWorker' in navigator)) return;
    const warm = source => fetch(source, { cache:'no-cache', credentials:'same-origin' }).catch(() => null);
    navigator.serviceWorker.ready.then(() => {
      const run = () => Promise.all([warm(LEGACY_SRC), warm(MOBILE_SRC), warm(MOBILE_A11Y_SRC)]);
      if (navigator.serviceWorker.controller) run();
      else navigator.serviceWorker.addEventListener('controllerchange', run, { once:true });
    }).catch(() => null);
  }

  function loadMobileExperience() {
    if (mobileStarted) return;
    mobileStarted = true;
    ensureCriticalMobileStyles();
    const mobile = loadRuntime(MOBILE_SRC, 'data-medindex-mobile-experience', 'miMobileExperienceError');
    const loadA11y = () => loadRuntime(MOBILE_A11Y_SRC, 'data-medindex-mobile-a11y', 'miMobileA11yError');
    if (document.documentElement.dataset.miMobileExperience === 'production-audit-v1') loadA11y();
    else {
      mobile?.addEventListener('load', loadA11y, { once:true });
      mobile?.addEventListener('error', loadA11y, { once:true });
    }
  }

  function finalizeShellReady() {
    if (shellReady && document.querySelector('.mi-app-shell')) return;
    if (!document.querySelector('.mi-app-shell') && document.body?.dataset.tailadminReady !== '1') return;
    shellReady = true;
    clearTimeout(shellRetry);
    document.documentElement.dataset.miShellVersion = SHELL_VERSION;
    document.documentElement.dataset.miThemeKey = THEME_KEY;
    delete document.documentElement.dataset.miShellError;
    ensureStylesheetLast();
    queueMicrotask(ensureStylesheetLast);
    loadMobileExperience();
    warmRuntimeAssets();
  }

  function verifyLegacyMount(script, retry = false) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') {
        finalizeShellReady();
        return;
      }
      document.documentElement.dataset.miShellError = retry ? 'legacy-retry-executed-no-shell' : 'legacy-executed-no-shell';
      if (!retry) loadLegacyShell(true);
    }));
  }

  function loadLegacyShell(force = false) {
    ensureStylesheetLast();
    if (shellReady || document.querySelector('.mi-app-shell')) return finalizeShellReady();

    const existing = document.querySelector('script[data-medindex-tailadmin-legacy]');
    if (existing && !force) {
      existing.addEventListener('load', () => verifyLegacyMount(existing, false), { once:true });
      existing.addEventListener('error', () => loadLegacyShell(true), { once:true });
      return;
    }
    if (existing && force) existing.remove();

    const script = document.createElement('script');
    script.src = force ? `${LEGACY_SRC}&retry=${encodeURIComponent(SHELL_VERSION)}` : LEGACY_SRC;
    script.async = true;
    script.dataset.medindexTailadminLegacy = force ? 'retry' : '1';
    script.addEventListener('load', () => verifyLegacyMount(script, force), { once:true });
    script.addEventListener('error', () => {
      document.documentElement.dataset.miShellError = force ? 'legacy-retry-load' : 'legacy-load';
      console.error('MedIndex shell runtime failed to load.', script.src);
      if (!force) loadLegacyShell(true);
    }, { once:true });
    document.head.appendChild(script);
  }

  function init() {
    ensureStylesheetLast();
    ensureCriticalMobileStyles();
    loadLegacyShell();
    setTimeout(revealCachedShellOnWeakConnection, 0);
    shellRetry = setTimeout(() => {
      if (!document.querySelector('.mi-app-shell')) loadLegacyShell(true);
    }, SHELL_RETRY_MS);
  }

  window.addEventListener('medindex:tailadmin-ready', finalizeShellReady);
  window.addEventListener('pageshow', () => {
    ensureStylesheetLast();
    ensureCriticalMobileStyles();
    resetSidebarPosition();
    syncResponsiveSidebar();
    revealCachedShellOnWeakConnection();
    if (document.querySelector('.mi-app-shell')) finalizeShellReady();
  }, { passive:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
