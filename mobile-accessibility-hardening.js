(() => {
  'use strict';

  const VERSION = 'mobile-a11y-deep-audit-v1';
  const MOBILE_BREAKPOINT = 1024;
  let previousFocus = null;
  let bodyOverflow = '';
  let initialized = false;

  const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;
  const visible = node => Boolean(node && !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null);
  const focusable = root => [...root.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(node => visible(node));

  function setAttributeIfChanged(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function removeAttributeIfPresent(node, name) {
    if (node?.hasAttribute(name)) node.removeAttribute(name);
  }

  function installStyles() {
    if (document.getElementById('miMobileA11yStyles')) return;
    const style = document.createElement('style');
    style.id = 'miMobileA11yStyles';
    style.textContent = `
      @media(max-width:1023px){
        html.medindex-tailadmin body{overscroll-behavior-y:none}
        html.medindex-tailadmin :where(.table-wrap,.atc-table-wrap,.med-table-wrap,[data-mobile-scroll-region]){overscroll-behavior-inline:contain;scroll-snap-stop:normal}
        html.medindex-tailadmin :where(button,a,input,select,textarea):focus-visible{outline:3px solid currentColor!important;outline-offset:3px!important}
        html.medindex-tailadmin :where(input[type="search"],input[type="text"],select){min-height:44px!important;box-sizing:border-box!important}
        html.medindex-tailadmin :where(.rx-dialog,.med-panel,.mi-command-palette){scrollbar-gutter:stable}
      }
      @media(prefers-reduced-motion:reduce){
        html.medindex-tailadmin *,html.medindex-tailadmin *::before,html.medindex-tailadmin *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
      }
      @media(forced-colors:active){
        html.medindex-tailadmin :where(button,a,input,select,textarea):focus-visible{outline:2px solid CanvasText!important}
      }
    `;
    document.head.appendChild(style);
  }

  function hardenScrollableRegions(root = document) {
    root.querySelectorAll('.table-wrap,.atc-table-wrap,.med-table-wrap').forEach(region => {
      if (!region.hasAttribute('tabindex')) region.tabIndex = 0;
      setAttributeIfChanged(region, 'role', region.getAttribute('role') || 'region');
      setAttributeIfChanged(region, 'aria-label', region.getAttribute('aria-label') || 'Tabelë me lëvizje horizontale');
      if (region.dataset.mobileScrollRegion !== '1') region.dataset.mobileScrollRegion = '1';
    });
  }

  function hardenDialogs(root = document) {
    root.querySelectorAll('[role="dialog"]').forEach(dialog => {
      setAttributeIfChanged(dialog, 'aria-modal', 'true');
      if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
      if (!dialog.hasAttribute('aria-labelledby') && !dialog.hasAttribute('aria-label')) {
        const heading = dialog.querySelector('h1,h2,h3');
        if (heading) {
          if (!heading.id) heading.id = `miDialogTitle_${Math.random().toString(36).slice(2, 9)}`;
          setAttributeIfChanged(dialog, 'aria-labelledby', heading.id);
        } else setAttributeIfChanged(dialog, 'aria-label', 'Dritare dialogu');
      }
    });
  }

  function mobileSearchRoot() {
    return document.querySelector('.mi-global-search');
  }

  function syncMobileSearch() {
    const body = document.body;
    const root = mobileSearchRoot();
    const backdrop = document.querySelector('.mi-mobile-search-backdrop');
    const open = Boolean(body?.classList.contains('mi-mobile-search-open') && isMobile() && root);

    if (open) {
      if (!previousFocus) previousFocus = document.activeElement;
      if (!body.dataset.miA11yScrollLocked) {
        bodyOverflow = body.style.overflow;
        body.style.overflow = 'hidden';
        body.dataset.miA11yScrollLocked = '1';
      }
      setAttributeIfChanged(root, 'role', 'dialog');
      setAttributeIfChanged(root, 'aria-modal', 'true');
      setAttributeIfChanged(root, 'aria-label', 'Kërkimi në MedIndex');
      setAttributeIfChanged(backdrop, 'aria-hidden', 'false');
      return;
    }

    if (body?.dataset.miA11yScrollLocked) {
      body.style.overflow = bodyOverflow;
      delete body.dataset.miA11yScrollLocked;
    }
    removeAttributeIfPresent(root, 'role');
    removeAttributeIfPresent(root, 'aria-modal');
    removeAttributeIfPresent(root, 'aria-label');
    setAttributeIfChanged(backdrop, 'aria-hidden', 'true');
    if (previousFocus?.isConnected && document.activeElement === document.body) previousFocus.focus({ preventScroll:true });
    previousFocus = null;
  }

  function trapMobileSearch(event) {
    if (event.key !== 'Tab' || !document.body?.classList.contains('mi-mobile-search-open') || !isMobile()) return;
    const search = mobileSearchRoot();
    const palette = document.getElementById('miCommandPalette');
    const roots = [search, visible(palette) ? palette : null].filter(Boolean);
    const items = roots.flatMap(focusable);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function reconcile(root = document) {
    installStyles();
    hardenScrollableRegions(root);
    hardenDialogs(root);
    syncMobileSearch();
    document.documentElement.dataset.miMobileA11y = VERSION;
  }

  function init() {
    if (initialized) return;
    initialized = true;
    reconcile();
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type !== 'childList') return;
        record.addedNodes.forEach(node => {
          if (node.nodeType === 1) reconcile(node.matches?.('.table-wrap,.atc-table-wrap,.med-table-wrap,[role="dialog"]') ? node.parentElement || node : node);
        });
      });
      syncMobileSearch();
    });
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class', 'hidden'] });
    document.addEventListener('keydown', trapMobileSearch, true);
    window.addEventListener('resize', syncMobileSearch, { passive:true });
    window.addEventListener('pageshow', () => reconcile(), { passive:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
