(() => {
  'use strict';

  const VERSION = 'registry-runtime-loader-v11';
  const RUNTIME_SRC = '/app-performance.js?v=20260801-2';
  const AUTH_WAIT_LIMIT_MS = 8000;
  const MOBILE_LITE_STALL_MS = 12000;
  const DESKTOP_LITE_GRACE_MS = 5000;
  const MOBILE_QUERY = '(max-width: 767px)';
  const DESKTOP_QUERY = '(min-width: 768px)';

  let loaded = false;
  let scheduled = false;
  let authObserver = null;
  let authTimer = 0;
  let mobileWatchTimer = 0;
  let desktopGraceTimer = 0;

  const html = document.documentElement;
  const mobileMedia = window.matchMedia?.(MOBILE_QUERY);
  const desktopMedia = window.matchMedia?.(DESKTOP_QUERY);
  html.dataset.registryRuntimeLoader = VERSION;

  function authReady() { return html.classList.contains('auth-ready'); }
  function mobileLiteCandidate() { return Boolean(mobileMedia?.matches && html.dataset.registryMobileLite); }
  function desktopLiteCandidate() { return Boolean(desktopMedia?.matches && html.dataset.registryDesktopLite); }

  function clearMobileWatch() {
    window.clearTimeout(mobileWatchTimer);
    mobileWatchTimer = 0;
  }

  function loadRuntime(reason = 'automatic') {
    if (loaded || document.querySelector('script[data-medindex-app-performance]')) return;
    loaded = true;
    authObserver?.disconnect();
    window.clearTimeout(authTimer);
    clearMobileWatch();
    window.clearTimeout(desktopGraceTimer);
    html.dataset.registryRuntimeMode = 'full';
    html.dataset.registryRuntimeReason = reason;
    /* Tell lightweight owners to relinquish their local personalization rails
       even when the full runtime was requested through the direct loader API. */
    window.dispatchEvent(new CustomEvent('medindex:request-full-registry', { detail:{ reason, ownerHandoff:true } }));
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
    html.dataset.registryRuntimeReason = 'mobile-lite-owner';
    clearMobileWatch();
    mobileWatchTimer = window.setTimeout(() => {
      if (html.dataset.registryMobileLiteReady === '1' || loaded) return;
      html.dataset.registryRuntimeMode = 'mobile-lite-stalled';
      html.dataset.registryRuntimeReason = 'mobile-lite-stalled';
      window.dispatchEvent(new CustomEvent('medindex:mobile-lite-stalled', {
        detail:{ waitedMs:MOBILE_LITE_STALL_MS, owner:'mobile-lite' },
      }));
    }, MOBILE_LITE_STALL_MS);
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
    if (mobileLiteCandidate()) { deferForMobileLite(); return; }
    if (desktopLiteCandidate()) { deferForDesktopLite(); return; }
    scheduleRuntime('legacy-no-lite');
  }

  function waitForAuthenticatedShell() {
    if (authReady()) { onAuthenticated(); return; }
    authObserver = new MutationObserver(() => {
      if (!authReady()) return;
      authObserver?.disconnect();
      onAuthenticated();
    });
    authObserver.observe(html, { attributes:true, attributeFilter:['class'] });
    authTimer = window.setTimeout(() => {
      if (authReady()) onAuthenticated();
      else html.dataset.registryRuntimeLoaderError = 'auth-timeout';
    }, AUTH_WAIT_LIMIT_MS);
  }

  function isExplicitMobileFullRequest(reason, detail = {}) {
    const value = String(reason || '');
    return detail.fatal === true
      || value === 'viewport-desktop'
      || value === 'personal-view-favorites'
      || value === 'personal-view-notes'
      || value.startsWith('fatal-');
  }

  function blockMobileFullRequest(reason) {
    html.dataset.registryRuntimeBlockedReason = String(reason || 'mobile-nonfatal');
    window.dispatchEvent(new CustomEvent('medindex:mobile-full-registry-blocked', {
      detail:{ reason:String(reason || 'mobile-nonfatal'), owner:'mobile-lite' },
    }));
  }

  function recoverInvalidMobileLiteContract(event) {
    if (loaded || !mobileLiteCandidate() || event.detail?.initial !== true) return;
    const message = String(event.detail?.message || '').toLocaleLowerCase('sq');
    const invalidContract = message.includes('përgjigjja e regjistrit') && message.includes('pavlefshme');
    if (!invalidContract) return;
    html.dataset.registryRuntimeReason = 'fatal-mobile-lite-contract-mismatch';
    const handedOff = window.MEDINDEX_MOBILE_LITE?.handoff?.('fatal-mobile-lite-contract-mismatch', { fatal:true });
    if (handedOff === false) scheduleRuntime('fatal-mobile-lite-contract-mismatch');
  }

  window.MEDINDEX_LOAD_FULL_REGISTRY = (reason, options = {}) => {
    const resolvedReason = String(reason || 'manual');
    if (mobileLiteCandidate() && !isExplicitMobileFullRequest(resolvedReason, options)) {
      blockMobileFullRequest(resolvedReason);
      return false;
    }
    scheduleRuntime(resolvedReason);
    return true;
  };

  window.addEventListener('medindex:request-full-registry', event => {
    const reason = String(event.detail?.reason || 'lite-handoff');
    if (mobileLiteCandidate() && !isExplicitMobileFullRequest(reason, event.detail || {})) {
      blockMobileFullRequest(reason);
      return;
    }
    scheduleRuntime(reason);
  });

  window.addEventListener('medindex:mobile-lite-load-error', recoverInvalidMobileLiteContract);
  window.addEventListener('medindex:mobile-lite-ready', () => {
    if (!mobileMedia?.matches || loaded) return;
    clearMobileWatch();
    html.dataset.registryRuntimeMode = 'mobile-lite';
    html.dataset.registryRuntimeReason = 'mobile-lite-ready';
  });

  mobileMedia?.addEventListener?.('change', event => {
    if (!event.matches && html.dataset.registryMobileLiteReady === '1') scheduleRuntime('viewport-desktop');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForAuthenticatedShell, { once:true });
  else waitForAuthenticatedShell();
})();