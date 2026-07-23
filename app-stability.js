(() => {
  'use strict';

  const CLINICAL_UI_VERSION = '20260723-1';
  const NAVIGATION_UI_VERSION = '20260723-1';
  const MIXTURE_UI_VERSION = '20260723-3';
  let lastFocused = null;
  let errorBannerTimer = 0;
  let dialogFrame = 0;

  function installClinicalUi() {
    if (document.querySelector('link[data-medindex-clinical-ui]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `clinical-ui.css?v=${CLINICAL_UI_VERSION}`;
    link.dataset.medindexClinicalUi = '1';
    document.head.appendChild(link);
  }

  function installNavigationUi() {
    if (document.querySelector('script[data-medindex-navigation-ui]')) return;
    const script = document.createElement('script');
    script.src = `navigation-consistency.js?v=${NAVIGATION_UI_VERSION}`;
    script.dataset.medindexNavigationUi = '1';
    document.head.appendChild(script);
  }

  function installMixtureUi() {
    if (document.querySelector('script[data-medindex-mixture-ui]')) return;
    const script = document.createElement('script');
    script.src = `prescription-mixtures.js?v=${MIXTURE_UI_VERSION}`;
    script.dataset.medindexMixtureUi = '1';
    document.head.appendChild(script);
  }

  function banner(className, message, persistent = false) {
    let node = document.querySelector(`.${className}`);
    if (!node) {
      node = document.createElement('div');
      node.className = className;
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    if (!persistent) {
      clearTimeout(errorBannerTimer);
      errorBannerTimer = window.setTimeout(() => { node.hidden = true; }, 5500);
    }
    return node;
  }

  function updateConnectivity() {
    const existing = document.querySelector('.offline-banner');
    if (navigator.onLine) {
      if (existing) {
        existing.textContent = 'Lidhja u rikthye.';
        setTimeout(() => { existing.hidden = true; }, 1800);
      }
      document.documentElement.classList.remove('is-offline');
    } else {
      document.documentElement.classList.add('is-offline');
      banner('offline-banner', 'Nuk ka internet. Të dhënat e ruajtura lokalisht vazhdojnë të punojnë.', true);
    }
  }

  function isIgnorableProblem(value) {
    const name = String(value?.name || value?.reason?.name || '');
    const message = String(value?.message || value?.reason?.message || value || '');
    return name === 'AbortError' || /ResizeObserver loop|Sesioni nuk është aktiv|Kërkohet autentikim/i.test(message);
  }

  function reportRuntimeProblem(event) {
    if (isIgnorableProblem(event)) return;
    banner('app-error-banner', 'Ndodhi një gabim i papritur. Të dhënat e ruajtura nuk janë fshirë; provo veprimin përsëri.');
  }

  function visibleDialog() {
    const selectors = [
      '.protocol-overlay.open [role="dialog"]',
      '.atc-info-overlay.open [role="dialog"]',
      '.med-panel-overlay:not([hidden]) [role="dialog"]',
      '#miOverlay:not([hidden]) [role="dialog"]',
    ];
    return selectors.map(selector => document.querySelector(selector)).find(Boolean) || null;
  }

  function focusable(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.hidden && node.offsetParent !== null);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = visibleDialog();
    if (!dialog) return;
    const items = focusable(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeTransientUi(event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.col-panel.open,.form-panel.open').forEach(node => node.classList.remove('open'));
  }

  function overlayIsOpen(overlay) {
    if (!overlay) return false;
    if (overlay.classList.contains('protocol-overlay') || overlay.classList.contains('atc-info-overlay')) {
      return overlay.classList.contains('open') && overlay.getAttribute('aria-hidden') !== 'true';
    }
    return !overlay.hidden && !overlay.hasAttribute('hidden');
  }

  function reconcileDialogs() {
    dialogFrame = 0;
    const dialog = visibleDialog();
    if (dialog && !dialog.dataset.stabilityFocus) {
      lastFocused = document.activeElement;
      dialog.dataset.stabilityFocus = '1';
      const target = focusable(dialog)[0];
      requestAnimationFrame(() => target?.focus());
    }

    document.querySelectorAll('[data-stability-focus="1"]').forEach(node => {
      const overlay = node.closest('.protocol-overlay,.atc-info-overlay,.med-panel-overlay,#miOverlay');
      if (overlayIsOpen(overlay)) return;
      delete node.dataset.stabilityFocus;
      if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
      lastFocused = null;
    });
  }

  function watchDialogs() {
    const observer = new MutationObserver(() => {
      if (dialogFrame) return;
      dialogFrame = requestAnimationFrame(reconcileDialogs);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-hidden'],
    });
  }

  function installPerformanceHints() {
    document.querySelectorAll('input[type="search"]').forEach(input => {
      input.setAttribute('enterkeyhint', 'search');
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('spellcheck', 'false');
    });
  }

  function init() {
    updateConnectivity();
    installPerformanceHints();
    watchDialogs();
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    window.addEventListener('error', event => {
      if (event?.target && event.target !== window) return;
      reportRuntimeProblem(event.error || event);
    });
    window.addEventListener('unhandledrejection', event => reportRuntimeProblem(event.reason || event));
    document.addEventListener('keydown', trapFocus, true);
    document.addEventListener('keydown', closeTransientUi, true);
    window.MEDINDEX_RUNTIME = { version: '2026-07-23.7', online: () => navigator.onLine };
  }

  installClinicalUi();
  installNavigationUi();
  installMixtureUi();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
