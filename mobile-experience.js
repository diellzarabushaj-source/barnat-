(() => {
  'use strict';

  const ROOT = document.documentElement;
  const MOBILE_BREAKPOINT = 1024;
  const VERSION = 'production-audit-v1';
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>';
  let trigger = null;
  let backdrop = null;
  let bodyObserver = null;
  let viewportFrame = 0;
  let installed = false;

  const isMobileLayout = () => window.innerWidth < MOBILE_BREAKPOINT;

  function injectStyles() {
    if (document.getElementById('miMobileExperienceStyles')) return;
    const style = document.createElement('style');
    style.id = 'miMobileExperienceStyles';
    style.textContent = `
      :root{
        --mi-touch-target:44px;
        --mi-safe-top:env(safe-area-inset-top,0px);
        --mi-safe-right:env(safe-area-inset-right,0px);
        --mi-safe-bottom:env(safe-area-inset-bottom,0px);
        --mi-safe-left:env(safe-area-inset-left,0px);
        --mi-visual-height:100dvh;
      }
      .mi-mobile-search-trigger{display:none!important}
      .mi-mobile-search-backdrop[hidden]{display:none!important}
      @media(max-width:1023px){
        html.medindex-tailadmin,html.medindex-tailadmin body,html.medindex-tailadmin .mi-app-shell,html.medindex-tailadmin .mi-workspace,html.medindex-tailadmin .mi-main{max-width:100vw!important;overflow-x:hidden!important}
        html.medindex-tailadmin body{touch-action:manipulation;-webkit-text-size-adjust:100%}
        html.medindex-tailadmin .mi-topbar{
          min-height:calc(var(--mi-topbar-height) + var(--mi-safe-top))!important;
          height:calc(var(--mi-topbar-height) + var(--mi-safe-top))!important;
          flex-basis:calc(var(--mi-topbar-height) + var(--mi-safe-top))!important;
          padding-top:calc(10px + var(--mi-safe-top))!important;
          padding-right:calc(12px + var(--mi-safe-right))!important;
          padding-left:calc(12px + var(--mi-safe-left))!important;
        }
        html.medindex-tailadmin .mi-sidebar{
          width:min(var(--mi-sidebar-width),calc(100vw - 44px))!important;
          min-width:min(var(--mi-sidebar-width),calc(100vw - 44px))!important;
          max-width:min(var(--mi-sidebar-width),calc(100vw - 44px))!important;
          padding-top:var(--mi-safe-top)!important;
          padding-bottom:var(--mi-safe-bottom)!important;
        }
        html.medindex-tailadmin .mi-main{
          -webkit-overflow-scrolling:touch;
          scroll-padding-top:calc(var(--mi-topbar-height) + 16px);
          scroll-padding-bottom:calc(24px + var(--mi-safe-bottom));
        }
        html.medindex-tailadmin .mi-content-container{padding-bottom:calc(34px + var(--mi-safe-bottom))!important}
        html.medindex-tailadmin .mi-topbar-actions .mi-icon-button{display:grid!important}
        html.medindex-tailadmin .mi-mobile-search-trigger{display:grid!important;width:var(--mi-touch-target)!important;height:var(--mi-touch-target)!important;min-width:var(--mi-touch-target)!important;min-height:var(--mi-touch-target)!important}
        html.medindex-tailadmin .mi-primary-action{min-width:var(--mi-touch-target)!important;min-height:var(--mi-touch-target)!important}
        html.medindex-tailadmin :where(
          .mi-topbar button,.mi-topbar a,#appMenu button,#appMenu a,
          .toolbar button,.toolbar select,.atc-toolbar button,.atc-toolbar select,
          .icd-toolbar button,.icd-toolbar select,.lab-quickbar button,.lab-quickbar select,
          .clinical-toolbar button,.clinical-toolbar select,.rx-command-bar button,
          .rx-compose-actions button,.rx-preview-actions button,.mi-command-item,
          .rx-drug-result,.mi-use-diagnosis,.mi-data-tool,.pagination button,
          .med-panel button,.rx-dialog button,[data-open-code]
        ){min-height:var(--mi-touch-target)!important}
        html.medindex-tailadmin :where(input[type="search"],input[type="text"],select){min-height:var(--mi-touch-target)}
        html.medindex-tailadmin :where(.table-wrap,.atc-table-wrap,.med-table-wrap){-webkit-overflow-scrolling:touch;scrollbar-gutter:auto!important}
        html.medindex-tailadmin :where(.med-panel,.rx-dialog){max-width:calc(100vw - 16px)!important;max-height:calc(var(--mi-visual-height) - 16px)!important}
        html.medindex-tailadmin :where(.med-panel-body,.rx-dialog-body){min-height:0;overflow:auto;-webkit-overflow-scrolling:touch}
        html.medindex-tailadmin .rx-toast{bottom:calc(18px + var(--mi-safe-bottom))!important}
        .mi-mobile-search-backdrop{position:fixed;inset:0;z-index:2140;background:rgba(16,24,40,.5);backdrop-filter:blur(3px)}
        body.mi-mobile-search-open .mi-main{overflow:hidden!important}
        body.mi-mobile-search-open .mi-global-search{
          display:block!important;
          position:fixed!important;
          z-index:2200!important;
          top:calc(10px + var(--mi-safe-top))!important;
          left:calc(12px + var(--mi-safe-left))!important;
          right:calc(12px + var(--mi-safe-right))!important;
          width:auto!important;
          max-width:none!important;
        }
        body.mi-mobile-search-open .mi-global-search input{
          width:100%!important;
          height:48px!important;
          padding-right:46px!important;
          border-color:var(--mi-brand-300)!important;
          background:var(--mi-surface)!important;
          box-shadow:0 20px 60px rgba(16,24,40,.24),var(--mi-focus)!important;
        }
        body.mi-mobile-search-open .mi-global-search kbd{display:none!important}
        body.mi-mobile-search-open .mi-command-palette{
          z-index:2210!important;
          top:calc(68px + var(--mi-safe-top))!important;
          left:calc(12px + var(--mi-safe-left))!important;
          right:calc(12px + var(--mi-safe-right))!important;
          width:auto!important;
          max-width:none!important;
          max-height:calc(var(--mi-visual-height) - 86px - var(--mi-safe-top) - var(--mi-safe-bottom))!important;
        }
      }
      @media(max-width:479px){
        html.medindex-tailadmin .mi-topbar{gap:8px!important}
        html.medindex-tailadmin .mi-topbar-leading,html.medindex-tailadmin .mi-topbar-actions{gap:6px!important}
        html.medindex-tailadmin .mi-page-heading{display:block!important}
        html.medindex-tailadmin .mi-page-heading h1{overflow-wrap:anywhere}
        html.medindex-tailadmin :where(.toolbar,.atc-toolbar,.icd-toolbar,.lab-quickbar,.clinical-toolbar){padding:10px!important}
        html.medindex-tailadmin .rx-command-bar{display:grid!important;grid-template-columns:1fr 1fr!important}
        html.medindex-tailadmin .rx-command-bar button{width:100%!important}
      }
      @media(max-height:500px) and (max-width:1023px){
        html.medindex-tailadmin .mi-mobile-brand{display:none!important}
        html.medindex-tailadmin .mi-topbar{min-height:56px!important;height:56px!important;flex-basis:56px!important;padding-top:6px!important;padding-bottom:6px!important}
        html.medindex-tailadmin .mi-content-container{padding-top:12px!important;padding-bottom:calc(18px + var(--mi-safe-bottom))!important}
        body.mi-mobile-search-open .mi-global-search{top:6px!important}
        body.mi-mobile-search-open .mi-command-palette{top:62px!important;max-height:calc(var(--mi-visual-height) - 70px)!important}
        #rxDrugPopover[data-mi-viewport-picker="1"]{top:6px!important;max-height:calc(var(--mi-visual-height) - 12px)!important;transform:translateX(-50%)!important}
      }
    `;
    document.head.appendChild(style);
  }

  function updateVisualViewport() {
    viewportFrame = 0;
    const viewport = window.visualViewport;
    const height = Math.max(240, Math.round(viewport?.height || window.innerHeight));
    ROOT.style.setProperty('--mi-visual-height', `${height}px`);
    ROOT.dataset.miMobileLayout = String(isMobileLayout());
  }

  function scheduleViewportUpdate() {
    if (viewportFrame) return;
    viewportFrame = requestAnimationFrame(updateVisualViewport);
  }

  function setBackgroundState() {
    const body = document.body;
    if (!body) return;
    const sidebarOpen = isMobileLayout() && body.classList.contains('mi-sidebar-open');
    const searchOpen = isMobileLayout() && body.classList.contains('mi-mobile-search-open');
    const workspace = document.querySelector('.mi-workspace');
    const sidebar = document.querySelector('.mi-sidebar');
    const main = document.querySelector('.mi-main');

    if (workspace) {
      workspace.inert = sidebarOpen;
      if (sidebarOpen) workspace.setAttribute('aria-hidden', 'true');
      else workspace.removeAttribute('aria-hidden');
    }
    if (sidebar) sidebar.inert = searchOpen;
    if (main) main.inert = searchOpen;
  }

  function closeMobileSearch({ restoreFocus = false } = {}) {
    const body = document.body;
    const input = document.getElementById('miGlobalSearch');
    const palette = document.getElementById('miCommandPalette');
    if (!body?.classList.contains('mi-mobile-search-open')) return;
    body.classList.remove('mi-mobile-search-open');
    if (backdrop) backdrop.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (palette) palette.hidden = true;
    input?.setAttribute('aria-expanded', 'false');
    input?.blur();
    setBackgroundState();
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  function openMobileSearch() {
    const input = document.getElementById('miGlobalSearch');
    if (!input) return;
    if (!isMobileLayout()) {
      input.focus({ preventScroll: true });
      input.select();
      return;
    }
    document.body.classList.add('mi-mobile-search-open');
    if (backdrop) backdrop.hidden = false;
    trigger?.setAttribute('aria-expanded', 'true');
    setBackgroundState();
    scheduleViewportUpdate();
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.select();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function ensureMobileSearch() {
    const actions = document.querySelector('.mi-topbar-actions');
    const input = document.getElementById('miGlobalSearch');
    if (!actions || !input || !document.body) return false;

    document.querySelector('.mi-primary-action')?.setAttribute('aria-label', 'Recetë e re');
    input.setAttribute('enterkeyhint', 'search');

    trigger = document.querySelector('[data-mi-mobile-search]');
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'mi-icon-button mi-mobile-search-trigger';
      trigger.dataset.miMobileSearch = '1';
      trigger.setAttribute('aria-label', 'Kërko në MedIndex');
      trigger.setAttribute('aria-controls', 'miGlobalSearch');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.innerHTML = SEARCH_ICON;
      actions.insertBefore(trigger, actions.firstChild);
      trigger.addEventListener('click', openMobileSearch);
    }

    backdrop = document.querySelector('.mi-mobile-search-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'mi-mobile-search-backdrop';
      backdrop.hidden = true;
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', () => closeMobileSearch({ restoreFocus: true }));
    }

    return true;
  }

  function installObservers() {
    if (!bodyObserver && document.body) {
      bodyObserver = new MutationObserver(() => {
        ensureMobileSearch();
        setBackgroundState();
      });
      bodyObserver.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
    }

    window.addEventListener('resize', () => {
      scheduleViewportUpdate();
      if (!isMobileLayout()) closeMobileSearch();
      setBackgroundState();
    }, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(() => {
      scheduleViewportUpdate();
      closeMobileSearch();
      setBackgroundState();
    }, 80), { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleViewportUpdate, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate, { passive: true });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (document.body?.classList.contains('mi-mobile-search-open')) closeMobileSearch({ restoreFocus: true });
    }, true);
  }

  function stabilize() {
    if (!document.body) return;
    injectStyles();
    ensureMobileSearch();
    updateVisualViewport();
    setBackgroundState();
    if (!installed) {
      installed = true;
      installObservers();
    }
    ROOT.dataset.miMobileExperience = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:mobile-experience-ready', { detail: { version: VERSION } }));
  }

  window.addEventListener('medindex:tailadmin-ready', stabilize);
  window.addEventListener('medindex:professional-ui-ready', stabilize);
  window.addEventListener('medindex:clinical-workflow-ready', stabilize);
  window.addEventListener('pageshow', stabilize, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stabilize, { once: true });
  else stabilize();
})();