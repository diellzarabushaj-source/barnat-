(() => {
  'use strict';

  const MOBILE_BREAKPOINT = 1024;
  const VERSION = 'mobile-sidebar-deep-audit-v4';
  const ROOT = document.documentElement;
  let bodyObserver = null;
  let sidebarObserver = null;
  let resizeFrame = 0;
  let lastSidebarOpener = null;
  let previousMobileOpen = false;

  const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;
  const sidebar = () => document.getElementById('miSidebar') || document.querySelector('.mi-sidebar');
  const sidebarOpen = () => Boolean(document.body?.classList.contains('mi-sidebar-open'));

  function injectStyles() {
    if (document.getElementById('miMobileSidebarHardeningStyles')) return;
    const style = document.createElement('style');
    style.id = 'miMobileSidebarHardeningStyles';
    style.textContent = `
      @media(max-width:1023px){
        html.medindex-tailadmin .mi-mobile-overlay{
          z-index:1000!important;
          background:rgba(15,23,42,.34)!important;
          backdrop-filter:blur(1px)!important;
          -webkit-backdrop-filter:blur(1px)!important;
        }
        html.medindex-tailadmin .mi-sidebar{
          z-index:1001!important;
          width:min(340px,calc(100vw - 48px))!important;
          min-width:min(340px,calc(100vw - 48px))!important;
          max-width:min(340px,calc(100vw - 48px))!important;
          pointer-events:auto!important;
          isolation:isolate!important;
          border-right:1px solid rgba(15,23,42,.08)!important;
          background:#fff!important;
          box-shadow:18px 0 50px rgba(15,23,42,.16)!important;
          -webkit-backdrop-filter:none!important;
          backdrop-filter:none!important;
        }
        html.medindex-tailadmin .mi-sidebar-header{
          position:relative!important;
          z-index:2!important;
          min-height:68px!important;
          flex-basis:68px!important;
          padding:8px 10px!important;
          border-bottom:1px solid #eef2f6!important;
          background:#fff!important;
        }
        html.medindex-tailadmin .mi-sidebar-brand{min-width:0!important}
        html.medindex-tailadmin .mi-sidebar-close{
          position:relative!important;
          z-index:3!important;
          width:44px!important;
          height:44px!important;
          min-width:44px!important;
          min-height:44px!important;
          flex:0 0 44px!important;
          border-radius:12px!important;
          background:#f6f8fb!important;
          pointer-events:auto!important;
          touch-action:manipulation;
        }
        html.medindex-tailadmin #appMenu{padding:8px 8px 10px!important}
        html.medindex-tailadmin #appMenu .app-menu-link,
        html.medindex-tailadmin #appMenu .auth-logout,
        html.medindex-tailadmin #appMenu .mi-menu-item{
          min-height:44px!important;
          border-radius:11px!important;
        }
        html.medindex-tailadmin #appMenu .app-menu-link.active,
        html.medindex-tailadmin #appMenu .mi-menu-item.active{box-shadow:none!important}
        html.medindex-tailadmin .mi-sidebar-scroll{
          min-height:0!important;
          padding-top:2px!important;
          padding-bottom:2px!important;
          -webkit-overflow-scrolling:touch;
          overscroll-behavior:contain;
          scroll-padding-top:8px;
          scroll-padding-bottom:8px;
        }
        html.medindex-tailadmin .mi-sidebar-footer{
          min-height:70px!important;
          flex-basis:auto!important;
          padding:9px 10px calc(9px + env(safe-area-inset-bottom))!important;
          border-top:1px solid #eef2f6!important;
          background:#fff!important;
        }
        html.medindex-tailadmin[data-theme="dark"] .mi-sidebar,
        html.medindex-tailadmin[data-theme="dark"] .mi-sidebar-header,
        html.medindex-tailadmin[data-theme="dark"] .mi-sidebar-footer{
          border-color:#263244!important;
          background:#101828!important;
        }
        html.medindex-tailadmin[data-theme="dark"] .mi-sidebar-close{background:#182230!important}
      }
      @media(max-width:359px){
        html.medindex-tailadmin .mi-sidebar{
          width:min(304px,calc(100vw - 48px))!important;
          min-width:min(304px,calc(100vw - 48px))!important;
          max-width:min(304px,calc(100vw - 48px))!important;
        }
      }
      @media(max-width:1023px) and (max-height:500px){
        html.medindex-tailadmin .mi-sidebar-header{
          min-height:58px!important;
          flex-basis:58px!important;
          padding-top:6px!important;
          padding-bottom:6px!important;
        }
        html.medindex-tailadmin .mi-sidebar-footer{
          min-height:56px!important;
          flex-basis:auto!important;
          padding-top:6px!important;
          padding-bottom:calc(6px + env(safe-area-inset-bottom))!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function visibleFocusableItems() {
    const panel = sidebar();
    if (!panel) return [];
    return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => {
        if (node.hidden || node.closest('[hidden]') || node.inert) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return node.getClientRects().length > 0;
      });
  }

  function openerIsUsable() {
    if (!(lastSidebarOpener instanceof HTMLElement) || !lastSidebarOpener.isConnected) return false;
    const style = getComputedStyle(lastSidebarOpener);
    return style.display !== 'none' && style.visibility !== 'hidden' && lastSidebarOpener.getClientRects().length > 0;
  }

  function restoreOpenerFocus() {
    if (!openerIsUsable()) return;
    requestAnimationFrame(() => {
      if (!isMobile() || sidebarOpen() || !openerIsUsable()) return;
      lastSidebarOpener.focus({ preventScroll:true });
    });
  }

  function canonicalClose() {
    if (!sidebarOpen()) return;
    const closeButton = document.querySelector('[data-mi-sidebar-close]');
    if (closeButton instanceof HTMLElement) {
      closeButton.click();
      restoreOpenerFocus();
      return;
    }

    document.body?.classList.remove('mi-sidebar-open');
    document.querySelectorAll('[data-mi-sidebar-toggle]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    sidebar()?.setAttribute('aria-hidden', String(isMobile()));
    const workspace = document.querySelector('.mi-workspace');
    if (workspace) {
      workspace.inert = false;
      workspace.removeAttribute('aria-hidden');
    }
    restoreOpenerFocus();
  }

  function syncState() {
    const mobile = isMobile();
    const mobileOpen = mobile && sidebarOpen();
    const panel = sidebar();

    ROOT.classList.toggle('mi-mobile-sidebar-open', mobileOpen);
    ROOT.dataset.miMobileSidebar = mobileOpen ? 'open' : 'closed';

    if (panel) {
      const shouldBeInert = mobile && !mobileOpen;
      if (panel.inert !== shouldBeInert) panel.inert = shouldBeInert;

      if (mobileOpen) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-hidden', 'false');
      } else {
        panel.removeAttribute('role');
        panel.removeAttribute('aria-modal');
        panel.setAttribute('aria-hidden', mobile ? 'true' : 'false');
      }
    }

    if (!mobile) {
      ROOT.classList.remove('mi-mobile-sidebar-open');
      const workspace = document.querySelector('.mi-workspace');
      if (workspace) {
        workspace.inert = false;
        workspace.removeAttribute('aria-hidden');
      }
    }

    if (previousMobileOpen && !mobileOpen && mobile) restoreOpenerFocus();
    previousMobileOpen = mobileOpen;
    window.MedIndexRegistryMobilePhase3?.syncNavigation?.();
  }

  function trapSidebarFocus(event) {
    if (event.key !== 'Tab' || !isMobile() || !sidebarOpen()) return;
    const panel = sidebar();
    if (!panel) return;
    const items = visibleFocusableItems();
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const activeInside = active instanceof Node && panel.contains(active);

    if (event.shiftKey && (!activeInside || active === first)) {
      event.preventDefault();
      last.focus({ preventScroll:true });
      return;
    }

    if (!event.shiftKey && (!activeInside || active === last)) {
      event.preventDefault();
      first.focus({ preventScroll:true });
    }
  }

  function containSidebarFocus(event) {
    if (!isMobile() || !sidebarOpen()) return;
    const panel = sidebar();
    if (!panel || panel.contains(event.target)) return;
    visibleFocusableItems()[0]?.focus({ preventScroll:true });
  }

  function rememberSidebarOpener(event) {
    const toggle = event.target?.closest?.('[data-mi-sidebar-toggle]');
    if (!(toggle instanceof HTMLElement) || !isMobile()) return;
    lastSidebarOpener = toggle;
  }

  function closeAtcThroughCanonicalShell(event) {
    if (!isMobile() || !sidebarOpen()) return;
    if (!event.target?.closest?.('[data-mi-atc-code],[data-mi-atc-all-link]')) return;
    canonicalClose();
  }

  function scheduleResizeSync() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!isMobile() && sidebarOpen()) canonicalClose();
      syncState();
    });
  }

  function install() {
    if (ROOT.dataset.miMobileSidebarHardening === VERSION) return;
    ROOT.dataset.miMobileSidebarHardening = VERSION;
    injectStyles();

    document.addEventListener('pointerdown', rememberSidebarOpener, true);
    document.addEventListener('click', rememberSidebarOpener, true);
    document.addEventListener('keydown', trapSidebarFocus, true);
    document.addEventListener('focusin', containSidebarFocus, true);
    document.addEventListener('click', closeAtcThroughCanonicalShell, true);
    window.addEventListener('resize', scheduleResizeSync, { passive:true });
    window.visualViewport?.addEventListener('resize', scheduleResizeSync, { passive:true });
    window.addEventListener('pageshow', syncState, { passive:true });

    if (document.body) {
      bodyObserver = new MutationObserver(syncState);
      bodyObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });
    }

    const panel = sidebar();
    if (panel) {
      sidebarObserver = new MutationObserver(() => {
        const shouldBeInert = isMobile() && !sidebarOpen();
        if (panel.inert !== shouldBeInert) syncState();
      });
      sidebarObserver.observe(panel, { attributes:true, attributeFilter:['inert'] });
    }

    syncState();
    window.dispatchEvent(new CustomEvent('medindex:mobile-sidebar-hardening-ready', {
      detail:{ version:VERSION },
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
