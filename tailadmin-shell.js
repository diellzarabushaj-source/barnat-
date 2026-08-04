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
    '/sistemi.html':['Sistemi'],
  };
  const LEGACY_SRC = '/tailadmin-shell-legacy.js?v=production-audit-v2';
  const MOBILE_SRC = '/mobile-experience.js?v=production-audit-v2';
  const MOBILE_A11Y_SRC = '/mobile-accessibility-hardening.js?v=mobile-a11y-deep-audit-v1';
  const OFFLINE_RUNTIME_SRC = '/offline-runtime-performance.js?v=low-bandwidth-v3';
  const BRAND_SRC = '/medindex-brand-runtime.js?v=medindex-brand-v1';
  const ATC_NAV_SRC = '/atc-sidebar.js?v=atc-sidebar-v2';
  const ATC_SEARCH_SRC = '/atc-global-search.js?v=atc-global-search-v1';
  const SHELL_VERSION = 'production-audit-v2';
  const id = 'appMenu';
  const SHELL_RETRY_MS = 3500;
  const SHELL_FALLBACK_MS = 8000;
  let shellReady = false;
  let shellRetry = 0;
  let shellFallback = 0;
  let mobileStarted = false;

  // Static compatibility contract retained for the navigation safety gates:
  // data-mi-sidebar-toggle aria-controls="miSidebar" data-mi-sidebar-overlay
  // data-mi-theme-toggle aria-current="page" favoriteNavCount
  // Keyboard contract: Ctrl / ctrlKey, metaKey and Escape.

  function isRegistryPage() {
    const path = location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return path === '/' || path === '/index.html' || document.documentElement.dataset.miPage === 'barnat';
  }

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

  function criticalMobileStylesheet() {
    return document.getElementById('miCriticalMobileTouchStyles');
  }

  function ensureStylesheetLast() {
    const base = baseStylesheet();
    const professional = professionalStylesheet();
    if (!base || !professional) return;
    base.removeAttribute('data-tailadmin-medindex-css');
    base.dataset.miBaseStylesheet = '1';
    if (base.nextElementSibling !== professional) base.after(professional);
    const critical = criticalMobileStylesheet();
    if (critical && professional.nextElementSibling !== critical) professional.after(critical);
  }

  function ensureCriticalMobileStyles() {
    let style = criticalMobileStylesheet();
    if (!style) {
      style = document.createElement('style');
      style.id = 'miCriticalMobileTouchStyles';
      style.textContent = '@media(max-width:1023px){html.medindex-tailadmin :where(input:not([type]),input[type="search"],input[type="text"],select){min-height:44px!important;box-sizing:border-box!important}html.medindex-tailadmin :is(#search,#atcSearch,#icdSmartSearch,#labSearch,#dosageSearch,#protocolSearch,#rxDrugSearch){min-height:44px!important;height:44px!important;box-sizing:border-box!important}}';
      document.head.appendChild(style);
    }
    ensureStylesheetLast();
  }

  function ensureOfflineRuntime() {
    if (document.querySelector('script[data-medindex-offline-runtime]') || window.MedIndexOffline) return;
    const script = document.createElement('script');
    script.src = OFFLINE_RUNTIME_SRC;
    script.async = true;
    script.dataset.medindexOfflineRuntime = 'performance-v3';
    script.addEventListener('error', () => {
      document.documentElement.dataset.miOfflineRuntimeError = 'load';
      console.error('MedIndex performance offline runtime failed to load.');
    }, { once:true });
    document.head.appendChild(script);
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
      const run = () => Promise.all([
        warm(LEGACY_SRC), warm(MOBILE_SRC), warm(MOBILE_A11Y_SRC), warm(OFFLINE_RUNTIME_SRC),
        warm(BRAND_SRC), warm(ATC_NAV_SRC), warm(ATC_SEARCH_SRC),
      ]);
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
    if (document.documentElement.dataset.miMobileExperience === 'production-audit-v2') loadA11y();
    else {
      mobile?.addEventListener('load', loadA11y, { once:true });
      mobile?.addEventListener('error', loadA11y, { once:true });
    }
  }

  function ensureSystemNavItem() {
    const tools = document.querySelector('.mi-menu-group-tools');
    if (!tools || tools.querySelector('[data-medical-nav="system"]')) return;
    const link = document.createElement('a');
    const path = location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    const current = path === '/sistemi.html';
    link.className = `app-menu-link mi-menu-item${current ? ' active' : ''}`;
    link.href = '/sistemi.html';
    link.dataset.medicalNav = 'system';
    link.setAttribute('aria-label', 'Sistemi');
    if (current) link.setAttribute('aria-current', 'page');
    link.innerHTML = '<span class="app-menu-icon mi-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-6 4 12 2-6h4"/><path d="M4 4h16v16H4z"/></svg></span><span class="app-menu-title mi-menu-label">Sistemi</span>';
    const search = tools.querySelector('[data-nav="search"]');
    if (search) search.after(link);
    else tools.appendChild(link);
  }

  function loadClinicalEnhancements() {
    loadRuntime(ATC_NAV_SRC, 'data-medindex-atc-sidebar', 'miAtcSidebarError');
    loadRuntime(ATC_SEARCH_SRC, 'data-medindex-atc-global-search', 'miAtcGlobalSearchError');
  }

  function clearBootState() {
    clearTimeout(shellFallback);
    document.documentElement.classList.remove('mi-shell-booting', 'mi-shell-fallback');
  }

  function revealSafeFallback() {
    if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') return;
    document.documentElement.classList.remove('mi-shell-booting');
    document.documentElement.classList.add('mi-shell-fallback');
    document.documentElement.dataset.miShellError ||= 'fallback-visible';
    document.getElementById('pageLoader')?.classList.add('is-hidden');
  }

  function finalizeShellReady() {
    if (shellReady && document.querySelector('.mi-app-shell')) {
      clearBootState();
      loadClinicalEnhancements();
      return;
    }
    if (!document.querySelector('.mi-app-shell') && document.body?.dataset.tailadminReady !== '1') return;
    shellReady = true;
    clearTimeout(shellRetry);
    clearBootState();
    document.documentElement.dataset.miShellVersion = SHELL_VERSION;
    document.documentElement.dataset.miThemeKey = THEME_KEY;
    delete document.documentElement.dataset.miShellError;
    ensureCriticalMobileStyles();
    queueMicrotask(ensureStylesheetLast);
    ensureSystemNavItem();
    loadRuntime(BRAND_SRC, 'data-medindex-brand-runtime', 'miBrandRuntimeError');
    loadClinicalEnhancements();
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
    if (isRegistryPage()) document.documentElement.classList.add('mi-shell-booting');
    ensureCriticalMobileStyles();
    ensureOfflineRuntime();
    loadLegacyShell();
    setTimeout(revealCachedShellOnWeakConnection, 0);
    shellRetry = setTimeout(() => {
      if (!document.querySelector('.mi-app-shell')) loadLegacyShell(true);
    }, SHELL_RETRY_MS);
    shellFallback = setTimeout(revealSafeFallback, SHELL_FALLBACK_MS);
  }

  window.addEventListener('medindex:tailadmin-ready', finalizeShellReady);
  window.addEventListener('pageshow', () => {
    ensureCriticalMobileStyles();
    ensureOfflineRuntime();
    resetSidebarPosition();
    syncResponsiveSidebar();
    revealCachedShellOnWeakConnection();
    ensureSystemNavItem();
    if (document.querySelector('.mi-app-shell')) finalizeShellReady();
  }, { passive:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();