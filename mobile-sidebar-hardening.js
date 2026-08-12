(() => {
  'use strict';

  const MOBILE_BREAKPOINT = 1024;
  const VERSION = 'mobile-sidebar-deep-audit-v1';
  const ROOT = document.documentElement;
  let bodyObserver = null;
  let resizeFrame = 0;

  const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;
  const sidebar = () => document.getElementById('miSidebar') || document.querySelector('.mi-sidebar');
  const sidebarOpen = () => Boolean(document.body?.classList.contains('mi-sidebar-open'));

  function injectStyles() {
    if (document.getElementById('miMobileSidebarHardeningStyles')) return;
    const style = document.createElement('style');
    style.id = 'miMobileSidebarHardeningStyles';
    style.textContent = `
      @media(max-width:1023px){
        html.medindex-tailadmin .mi-sidebar-close{
          width:44px!important;
          height:44px!important;
          min-width:44px!important;
          min-height:44px!important;
          flex:0 0 44px!important;
          touch-action:manipulation;
        }
        html.medindex-tailadmin #appMenu .app-menu-link,
        html.medindex-tailadmin #appMenu .auth-logout,
        html.medindex-tailadmin #appMenu .mi-menu-item{
          min-height:44px!important;
        }
        html.medindex-tailadmin .mi-sidebar-scroll{
          -webkit-overflow-scrolling:touch;
          overscroll-behavior:contain;
          scroll-padding-top:8px;
          scroll-padding-bottom:8px;
        }
      }
      @media(max-width:1023px) and (max-height:500px){
        html.medindex-tailadmin .mi-sidebar-header{
          min-height:64px!important;
          flex-basis:64px!important;
          padding-top:8px!important;
          padding-bottom:8px!important;
        }
        html.medindex-tailadmin .mi-sidebar-footer{
          min-height:60px!important;
          flex-basis:60px!important;
          padding-top:8px!important;
          padding-bottom:8px!important;
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

  function canonicalClose() {
    if (!sidebarOpen()) return;
    const closeButton = document.querySelector('[data-mi-sidebar-close]');
    if (closeButton instanceof HTMLElement) {
      closeButton.click();
      return;
    }

    // Fail-safe only: the canonical shell close button should normally own this path.
    document.body?.classList.remove('mi-sidebar-open');
    document.querySelectorAll('[data-mi-sidebar-toggle]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    sidebar()?.setAttribute('aria-hidden', String(isMobile()));
    const workspace = document.querySelector('.mi-workspace');
    if (workspace) {
      workspace.inert = false;
      workspace.removeAttribute('aria-hidden');
    }
  }

  function syncState() {
    const mobileOpen = isMobile() && sidebarOpen();
    ROOT.classList.toggle('mi-mobile-sidebar-open', mobileOpen);
    ROOT.dataset.miMobileSidebar = mobileOpen ? 'open' : 'closed';

    if (!isMobile()) {
      ROOT.classList.remove('mi-mobile-sidebar-open');
      const workspace = document.querySelector('.mi-workspace');
      if (workspace) {
        workspace.inert = false;
        workspace.removeAttribute('aria-hidden');
      }
    }
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

    document.addEventListener('keydown', trapSidebarFocus, true);
    document.addEventListener('click', closeAtcThroughCanonicalShell, true);
    window.addEventListener('resize', scheduleResizeSync, { passive:true });
    window.visualViewport?.addEventListener('resize', scheduleResizeSync, { passive:true });

    if (document.body) {
      bodyObserver = new MutationObserver(syncState);
      bodyObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });
    }

    syncState();
    window.dispatchEvent(new CustomEvent('medindex:mobile-sidebar-hardening-ready', {
      detail:{ version:VERSION },
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
