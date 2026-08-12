(() => {
  'use strict';

  const VERSION = 'registry-mobile-phone-hardening-v1';
  const media = window.matchMedia?.('(max-width: 767px)');
  if (!media?.matches) return;

  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  let activeOverlay = null;
  let returnFocus = null;
  let shellWasInert = false;
  let navWasInert = false;
  let keyboardFrame = 0;

  root.dataset.registryPhoneHardening = VERSION;

  const visible = node => {
    if (!node || node.hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const currentOverlay = () => {
    const detail = document.getElementById('mobileLiteDrugDetail');
    if (body.classList.contains('mobile-lite-detail-open') && visible(detail)) return detail;
    const filters = document.getElementById('miRegistryFilterSheet');
    if (body.classList.contains('mi-registry-filter-open') && visible(filters)) return filters;
    return null;
  };

  function overlayFocusables(overlay) {
    return [...overlay.querySelectorAll(FOCUSABLE)].filter(node => visible(node) && !node.closest('[inert]'));
  }

  function setBackgroundInert(enabled) {
    const shell = document.querySelector('.mi-app-shell');
    const nav = document.getElementById('miRegistryBottomNav');
    if (enabled) {
      shellWasInert = Boolean(shell?.inert);
      navWasInert = Boolean(nav?.inert);
      if (shell) shell.inert = true;
      if (nav) nav.inert = true;
      return;
    }
    if (shell) shell.inert = shellWasInert;
    if (nav) nav.inert = navWasInert;
  }

  function restoreTrigger() {
    const target = returnFocus;
    returnFocus = null;
    if (!target?.isConnected) return;
    if (target.matches?.('[data-mobile-lite-detail]')) target.setAttribute('aria-expanded', 'false');
    requestAnimationFrame(() => {
      try { target.focus({ preventScroll:true }); } catch { target.focus?.(); }
    });
  }

  function syncOverlay() {
    const next = currentOverlay();
    if (next === activeOverlay) return;

    if (activeOverlay && !next) {
      setBackgroundInert(false);
      delete root.dataset.registryPhoneOverlay;
      activeOverlay = null;
      restoreTrigger();
      return;
    }

    if (!next) return;
    if (!returnFocus || !returnFocus.isConnected) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    activeOverlay = next;
    root.dataset.registryPhoneOverlay = next.id || 'overlay';
    setBackgroundInert(true);
    if (returnFocus?.matches?.('[data-mobile-lite-detail]')) returnFocus.setAttribute('aria-expanded', 'true');

    requestAnimationFrame(() => {
      const focusables = overlayFocusables(next);
      const preferred = next.querySelector('[data-mobile-lite-close], [data-mi-phase3-filter-close]');
      const target = visible(preferred) ? preferred : focusables[0];
      try { target?.focus({ preventScroll:true }); } catch { target?.focus?.(); }
    });
  }

  function closeActiveOverlay() {
    if (!activeOverlay) return false;
    const close = activeOverlay.querySelector('[data-mobile-lite-close], [data-mi-phase3-filter-close]');
    if (!close) return false;
    close.click();
    return true;
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || !activeOverlay) return;
    const focusables = overlayFocusables(activeOverlay);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !activeOverlay.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !activeOverlay.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }

  function syncKeyboardState() {
    keyboardFrame = 0;
    const vv = window.visualViewport;
    const focused = document.activeElement;
    const editable = focused?.matches?.('input,textarea,select,[contenteditable="true"]');
    const lostHeight = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
    const keyboardOpen = Boolean(editable && vv && lostHeight > Math.max(140, window.innerHeight * 0.18));
    body.classList.toggle('mi-registry-keyboard-open', keyboardOpen);
    if (vv) root.style.setProperty('--mi-registry-visual-height', `${Math.round(vv.height)}px`);
  }

  function scheduleKeyboardSync() {
    if (keyboardFrame) return;
    keyboardFrame = requestAnimationFrame(syncKeyboardState);
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-mobile-lite-detail], [data-mi-phase3-filter-open]');
    if (trigger) returnFocus = trigger;
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeOverlay) {
      event.preventDefault();
      event.stopPropagation();
      closeActiveOverlay();
      return;
    }
    trapFocus(event);
  }, true);

  document.addEventListener('focusin', scheduleKeyboardSync, true);
  document.addEventListener('focusout', () => setTimeout(scheduleKeyboardSync, 0), true);
  window.visualViewport?.addEventListener('resize', scheduleKeyboardSync, { passive:true });
  window.visualViewport?.addEventListener('scroll', scheduleKeyboardSync, { passive:true });
  window.addEventListener('resize', scheduleKeyboardSync, { passive:true });

  const observer = new MutationObserver(syncOverlay);
  observer.observe(body, { attributes:true, attributeFilter:['class'], childList:true });

  media.addEventListener?.('change', event => {
    if (event.matches) return;
    setBackgroundInert(false);
    body.classList.remove('mi-registry-keyboard-open');
    delete root.dataset.registryPhoneOverlay;
  });

  syncOverlay();
  syncKeyboardState();
})();