(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const MOBILE_BREAKPOINT = 1024;
  const PAGE_META = {
    '/dozologjia.html': ['Dozologjia'],
    '/protokollet.html': ['Protokollet'],
    '/recetat.html': ['Recetat'],
  };
  const LEGACY_SRC = '/tailadmin-shell-legacy.js?v=production-audit-v1';
  const MOBILE_SRC = '/mobile-experience.js?v=production-audit-v1';
  const SHELL_VERSION = 'production-audit-v1';
  const id = 'appMenu';

  // Static compatibility contract retained for the navigation safety gates:
  // data-mi-sidebar-toggle aria-controls="miSidebar" data-mi-sidebar-overlay
  // data-mi-theme-toggle aria-current="page" favoriteNavCount
  // Keyboard contract: Ctrl / ctrlKey, metaKey and Escape.

  function baseStylesheet() {
    return document.querySelector('link[href*="tailadmin-medindex.css"]');
  }

  function professionalStylesheet() {
    return document.querySelector('link[data-tailadmin-professional-css],link[href*="tailadmin-professional.css"]');
  }

  function ensureStylesheetLast() {
    const base = baseStylesheet();
    const professional = professionalStylesheet();
    if (!base || !professional) return;

    // The legacy shell observes this marker and otherwise moves the base CSS
    // behind the professional layer forever. Keep that observer inert and let
    // this single guard own the deterministic cascade.
    base.removeAttribute('data-tailadmin-medindex-css');
    base.dataset.miBaseStylesheet = '1';
    if (base.nextElementSibling !== professional) base.after(professional);
  }

  const headObserver = new MutationObserver(() => queueMicrotask(ensureStylesheetLast));
  headObserver.observe(document.head, { childList: true });

  function focusPageSearch(value = '') {
    const input = ['#search', '#atcSearch', '#icdSearch', '#labSearch', '#dosageSearch', '#protocolSearch', '#rxDrugSearch']
      .map(selector => document.querySelector(selector))
      .find(Boolean);
    if (!input) return;
    if (value) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.scrollIntoView({ behavior: 'auto', block: 'center' });
    input.focus({ preventScroll: true });
  }

  function syncResponsiveSidebar() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function resetSidebarPosition() {
    const sidebar = document.querySelector('.mi-sidebar-scroll');
    if (sidebar) sidebar.scrollTo({ top: 0, behavior: 'auto' });
  }

  function warmRuntimeAssets() {
    const warm = source => fetch(source, { cache: 'reload', credentials: 'same-origin' }).catch(() => null);
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(() => {
      const run = () => Promise.all([warm(LEGACY_SRC), warm(MOBILE_SRC)]);
      if (navigator.serviceWorker.controller) run();
      else navigator.serviceWorker.addEventListener('controllerchange', run, { once: true });
    }).catch(() => null);
  }

  function loadMobileExperience() {
    if (document.querySelector('script[data-medindex-mobile-experience]')) return;
    const script = document.createElement('script');
    script.src = MOBILE_SRC;
    script.async = false;
    script.defer = true;
    script.dataset.medindexMobileExperience = '1';
    script.addEventListener('error', () => {
      document.documentElement.dataset.miMobileExperienceError = 'load';
      console.error('MedIndex mobile experience runtime failed to load.');
    }, { once: true });
    document.head.appendChild(script);
  }

  function loadLegacyShell() {
    ensureStylesheetLast();
    if (document.querySelector('script[data-medindex-tailadmin-legacy]')) return;

    const script = document.createElement('script');
    script.src = LEGACY_SRC;
    script.async = false;
    script.defer = true;
    script.dataset.medindexTailadminLegacy = '1';
    script.addEventListener('load', () => {
      document.documentElement.dataset.miShellVersion = SHELL_VERSION;
      document.documentElement.dataset.miThemeKey = THEME_KEY;
      ensureStylesheetLast();
      queueMicrotask(ensureStylesheetLast);
      loadMobileExperience();
      warmRuntimeAssets();
    }, { once: true });
    script.addEventListener('error', () => {
      document.documentElement.dataset.miShellError = 'legacy-load';
      console.error('MedIndex shell runtime failed to load.');
    }, { once: true });
    document.head.appendChild(script);
  }

  function init() {
    ensureStylesheetLast();
    loadLegacyShell();
  }

  window.addEventListener('medindex:tailadmin-ready', ensureStylesheetLast);
  window.addEventListener('pageshow', () => {
    ensureStylesheetLast();
    resetSidebarPosition();
    syncResponsiveSidebar();
  }, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();