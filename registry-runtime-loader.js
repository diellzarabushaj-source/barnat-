(() => {
  'use strict';

  const VERSION = 'registry-runtime-loader-v8';
  const RUNTIME_SRC = '/app-performance.js?v=20260801-2';
  const AUTH_WAIT_LIMIT_MS = 8000;
  const MOBILE_LITE_GRACE_MS = 5000;
  const DESKTOP_LITE_GRACE_MS = 5000;
  const MOBILE_QUERY = '(max-width: 767px)';
  const DESKTOP_QUERY = '(min-width: 768px)';

  let loaded = false;
  let scheduled = false;
  let authObserver = null;
  let authTimer = 0;
  let mobileGraceTimer = 0;
  let desktopGraceTimer = 0;

  const html = document.documentElement;
  const mobileMedia = window.matchMedia?.(MOBILE_QUERY);
  const desktopMedia = window.matchMedia?.(DESKTOP_QUERY);
  html.dataset.registryRuntimeLoader = VERSION;

  function authReady() {
    return html.classList.contains('auth-ready');
  }

  function mobileLiteCandidate() {
    return Boolean(mobileMedia?.matches && html.dataset.registryMobileLite);
  }

  function desktopLiteCandidate() {
    return Boolean(desktopMedia?.matches && html.dataset.registryDesktopLite);
  }

  function loadRuntime(reason = 'automatic') {
    if (loaded || document.querySelector('script[data-medindex-app-performance]')) return;
    loaded = true;
    authObserver?.disconnect();
    window.clearTimeout(authTimer);
    window.clearTimeout(mobileGraceTimer);
    window.clearTimeout(desktopGraceTimer);
    html.dataset.registryRuntimeMode = 'full';
    html.dataset.registryRuntimeReason = reason;
    window.dispatchEvent(new CustomEvent('medindex:full-registry-started', { detail:{ reason } }));

    const script = document.createElement('script');
    script.src = RUNTIME_SRC;
    script.async = true;
    script.dataset.medindexAppPerformance = VERSION;
    script.addEventListener('error', () => {
      loaded = false;
      html.dataset.registryRuntimeLoaderError = 'load';
      console.error('Runtime-i i regjistrit nuk u ngarkua.');
    }, { once:true });
    document.head.appendChild(script);
  }

  function scheduleRuntime(reason = 'automatic') {
    if (scheduled || loaded) return;
    scheduled = true;
    authObserver?.disconnect();
    window.clearTimeout(authTimer);

    requestAnimationFrame(() => {
      scheduled = false;
      loadRuntime(reason);
    });
  }

  function deferForMobileLite() {
    html.dataset.registryRuntimeMode = 'mobile-lite-deferred';
    window.clearTimeout(mobileGraceTimer);
    mobileGraceTimer = window.setTimeout(() => {
      if (html.dataset.registryMobileLiteReady === '1') return;
      scheduleRuntime('mobile-lite-timeout');
    }, MOBILE_LITE_GRACE_MS);
  }

  function deferForDesktopLite() {
    html.dataset.registryRuntimeMode = 'desktop-lite-deferred';
    window.clearTimeout(desktopGraceTimer);
    desktopGraceTimer = window.setTimeout(() => {
      if (html.dataset.registryDesktopLiteReady === '1') return;
      scheduleRuntime('desktop-lite-timeout');
    }, DESKTOP_LITE_GRACE_MS);
  }

  function onAuthenticated() {
    if (mobileLiteCandidate()) {
      deferForMobileLite();
      return;
    }
    if (desktopLiteCandidate()) {
      deferForDesktopLite();
      return;
    }
    scheduleRuntime('legacy-no-lite');
  }

  function waitForAuthenticatedShell() {
    if (authReady()) {
      onAuthenticated();
      return;
    }

    authObserver = new MutationObserver(() => {
      if (!authReady()) return;
      authObserver?.disconnect();
      onAuthenticated();
    });
    authObserver.observe(html, {
      attributes:true,
      attributeFilter:['class'],
    });

    authTimer = window.setTimeout(() => {
      if (authReady()) onAuthenticated();
      else html.dataset.registryRuntimeLoaderError = 'auth-timeout';
    }, AUTH_WAIT_LIMIT_MS);
  }

  window.MEDINDEX_LOAD_FULL_REGISTRY = reason => scheduleRuntime(reason || 'manual');
  window.addEventListener('medindex:request-full-registry', event => {
    scheduleRuntime(event.detail?.reason || 'lite-handoff');
  });
  mobileMedia?.addEventListener?.('change', event => {
    if (!event.matches && html.dataset.registryMobileLiteReady === '1') scheduleRuntime('viewport-desktop');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForAuthenticatedShell, { once:true });
  } else {
    waitForAuthenticatedShell();
  }
})();