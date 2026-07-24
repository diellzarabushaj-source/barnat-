(() => {
  'use strict';

  const ROOT = document.documentElement;
  const PROFESSIONAL_VERSION = 'clinical-audit-v2';
  const MOBILE_BREAKPOINT = 1024;
  const PAGE_KEYS = {
    '/': 'barnat',
    '/index.html': 'barnat',
    '/klasifikimi.html': 'klasifikimi',
    '/icd.html': 'icd',
    '/analizat.html': 'analizat',
    '/dozologjia.html': 'dozologjia',
    '/protokollet.html': 'protokollet',
    '/recetat.html': 'recetat',
    '/login.html': 'login',
  };

  const normalizedPath = () => location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  const pageKey = PAGE_KEYS[normalizedPath()] || 'medindex';

  ROOT.dataset.miPage = pageKey;
  ROOT.dataset.miProfessionalVersion = PROFESSIONAL_VERSION;
  ROOT.classList.add('medindex-professional');

  let headFrame = 0;
  let navFrame = 0;
  let layoutFrame = 0;
  let paletteFrame = 0;
  let navObserver = null;
  let headObserver = null;
  let resizeObserver = null;
  let paletteObserver = null;
  let drugPickerObserver = null;
  let paletteListenersInstalled = false;
  let drugPickerListenersInstalled = false;

  function orderStylesheets() {
    headFrame = 0;
    const base = document.querySelector('link[data-tailadmin-medindex-css]');
    const professional = document.querySelector('link[data-tailadmin-professional-css]');
    if (!base || !professional) return;
    if (base.nextElementSibling !== professional || document.head.lastElementChild !== professional) document.head.append(base, professional);
  }

  function scheduleStylesheetOrder() {
    if (headFrame) return;
    headFrame = requestAnimationFrame(orderStylesheets);
  }

  function resetRootHorizontalOffset() {
    try {
      if (window.scrollX) window.scrollTo({ left:0, top:window.scrollY, behavior:'auto' });
    } catch {
      window.scrollTo(0, window.scrollY || 0);
    }
    document.documentElement.scrollLeft = 0;
    if (document.body) document.body.scrollLeft = 0;
  }

  function expectedActivePath(link) {
    const href = link.getAttribute('href');
    if (!href) return false;
    try {
      const target = new URL(href, location.href);
      const targetPath = target.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
      const current = normalizedPath();
      if (pageKey === 'barnat' && (targetPath === '/' || targetPath === '/index.html')) return true;
      return targetPath === current;
    } catch {
      return false;
    }
  }

  function normalizeNavigation() {
    navFrame = 0;
    const nav = document.getElementById('appMenu');
    if (!nav) return;
    nav.id = 'appMenu';
    nav.className = 'mi-sidebar-nav';
    nav.setAttribute('aria-label', 'Navigimi kryesor');

    const tools = nav.querySelector('.mi-menu-group-tools');
    const logout = nav.querySelector('.auth-logout');
    if (tools && logout && logout.parentElement !== tools) tools.appendChild(logout);
    if (logout) {
      logout.classList.add('mi-menu-item');
      logout.removeAttribute('style');
      const text = logout.querySelector('.app-menu-title,.mi-menu-label')?.textContent?.trim() || 'Dil';
      logout.title = text;
    }

    const themeControl = nav.querySelector('.mi-theme-control,.theme-control');
    if (themeControl) {
      themeControl.hidden = true;
      themeControl.setAttribute('aria-hidden', 'true');
    }

    const links = [...nav.querySelectorAll('.app-menu-link,.auth-logout')];
    links.forEach(link => {
      link.removeAttribute('style');
      link.classList.add('mi-menu-item');
      const label = link.querySelector('.app-menu-title,.mi-menu-label')?.textContent?.trim() || link.getAttribute('aria-label') || '';
      if (label) link.title = label;
    });

    const navigational = links.filter(link => link.matches('a[href]'));
    const matches = navigational.filter(expectedActivePath);
    if (matches.length) {
      navigational.forEach(link => {
        const active = link === matches[0];
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }

    const sidebarScroll = document.querySelector('.mi-sidebar-scroll');
    if (sidebarScroll) sidebarScroll.setAttribute('tabindex', '-1');
  }

  function scheduleNavigation() {
    if (navFrame) return;
    navFrame = requestAnimationFrame(normalizeNavigation);
  }

  function markScrollableContainers() {
    layoutFrame = 0;
    const selectors = ['.table-wrap', '.atc-table-wrap', '.med-table-wrap', '.lab-category-nav', '.atc-audit', '.rx-command-bar'];
    document.querySelectorAll(selectors.join(',')).forEach(node => {
      const horizontallyScrollable = node.scrollWidth > node.clientWidth + 2;
      node.toggleAttribute('data-mi-horizontal-scroll', horizontallyScrollable);
      if (horizontallyScrollable && !node.hasAttribute('tabindex')) node.tabIndex = 0;
    });
  }

  function scheduleLayoutAudit() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(markScrollableContainers);
  }

  function ensureViewportStyles() {
    if (document.getElementById('miClinicalViewportStyles')) return;
    const style = document.createElement('style');
    style.id = 'miClinicalViewportStyles';
    style.textContent = `
      .mi-command-palette{
        position:fixed!important;
        top:var(--mi-command-top,74px)!important;
        left:var(--mi-command-left,12px)!important;
        right:auto!important;
        width:var(--mi-command-width,min(430px,calc(100vw - 24px)))!important;
        max-width:calc(100vw - 24px)!important;
        max-height:min(430px,calc(100dvh - 24px))!important;
        contain:layout paint;
      }
      #rxDrugPopover[data-mi-viewport-picker="1"]{
        position:fixed!important;
        z-index:2200!important;
        top:50%!important;
        left:50%!important;
        right:auto!important;
        bottom:auto!important;
        width:min(640px,calc(100vw - 24px))!important;
        max-width:calc(100vw - 24px)!important;
        max-height:calc(100dvh - 24px)!important;
        margin:0!important;
        padding:16px!important;
        transform:translate(-50%,-50%)!important;
        display:flex;
        flex-direction:column;
        overflow:hidden!important;
        border-radius:16px!important;
        box-shadow:0 26px 80px rgba(16,24,40,.28)!important;
      }
      #rxDrugPopover[data-mi-viewport-picker="1"][hidden]{display:none!important}
      #rxDrugPopover[data-mi-viewport-picker="1"] .rx-drug-results{
        min-height:0;
        max-height:min(480px,calc(100dvh - 150px))!important;
        overflow:auto!important;
        overscroll-behavior:contain;
      }
      @media(max-width:760px){
        #rxDrugPopover[data-mi-viewport-picker="1"]{top:12px!important;transform:translateX(-50%)!important;max-height:calc(100dvh - 24px)!important}
      }
    `;
    document.head.appendChild(style);
  }

  function positionCommandPalette() {
    paletteFrame = 0;
    const input = document.getElementById('miGlobalSearch');
    const palette = document.getElementById('miCommandPalette');
    if (!input || !palette || palette.hidden) return;

    const rect = input.getBoundingClientRect();
    const gutter = 12;
    const inputVisible = rect.bottom > gutter && rect.top < window.innerHeight - gutter && rect.right > gutter && rect.left < window.innerWidth - gutter;
    const availableWidth = Math.max(280, window.innerWidth - gutter * 2);
    const width = inputVisible ? Math.min(Math.max(280, rect.width), availableWidth) : Math.min(520, availableWidth);
    const left = inputVisible
      ? Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter))
      : Math.max(gutter, Math.round((window.innerWidth - width) / 2));
    const estimatedHeight = Math.min(430, Math.max(180, window.innerHeight * 0.7));
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const anchoredTop = roomBelow >= 180 ? rect.bottom + 8 : rect.top - estimatedHeight - 8;
    const top = inputVisible
      ? Math.min(Math.max(gutter, anchoredTop), Math.max(gutter, window.innerHeight - 180))
      : Math.min(84, Math.max(gutter, window.innerHeight - 180));

    palette.style.setProperty('--mi-command-left', `${Math.round(left)}px`);
    palette.style.setProperty('--mi-command-top', `${Math.round(top)}px`);
    palette.style.setProperty('--mi-command-width', `${Math.round(width)}px`);
    palette.dataset.miAnchor = inputVisible ? 'input' : 'viewport';
  }

  function schedulePalettePosition() {
    if (paletteFrame) return;
    paletteFrame = requestAnimationFrame(positionCommandPalette);
  }

  function portalCommandPalette(palette) {
    if (!document.body || !palette) return;
    if (palette.parentElement !== document.body) document.body.appendChild(palette);
    if (palette.dataset.miPortalBound === '1') return;
    palette.dataset.miPortalBound = '1';
    palette.addEventListener('mousedown', event => event.stopPropagation());
    palette.addEventListener('click', event => event.stopPropagation());
  }

  function bindCommandPaletteViewport() {
    ensureViewportStyles();
    const input = document.getElementById('miGlobalSearch');
    const palette = document.getElementById('miCommandPalette');
    if (!input || !palette) return false;
    portalCommandPalette(palette);

    if (!palette.dataset.miViewportBound) {
      palette.dataset.miViewportBound = '1';
      paletteObserver?.disconnect();
      paletteObserver = new MutationObserver(schedulePalettePosition);
      paletteObserver.observe(palette, { attributes:true, attributeFilter:['hidden'], childList:true, subtree:true });
      input.addEventListener('focus', schedulePalettePosition, { passive:true });
      input.addEventListener('input', schedulePalettePosition, { passive:true });
    }

    if (!paletteListenersInstalled) {
      paletteListenersInstalled = true;
      window.addEventListener('resize', schedulePalettePosition, { passive:true });
      document.addEventListener('scroll', schedulePalettePosition, { passive:true, capture:true });
    }

    schedulePalettePosition();
    return true;
  }

  function closePrescriptionDrugPicker({ restoreFocus = false } = {}) {
    const picker = document.getElementById('rxDrugPopover');
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    picker.setAttribute('aria-hidden', 'true');
    picker.setAttribute('aria-modal', 'false');
    if (restoreFocus) document.querySelector('[data-rx-command="drug"]')?.focus({ preventScroll:true });
  }

  function syncPrescriptionDrugPicker() {
    const picker = document.getElementById('rxDrugPopover');
    if (!picker || !document.body) return false;
    if (picker.parentElement !== document.body) document.body.appendChild(picker);
    picker.dataset.miViewportPicker = '1';
    if (picker.hidden) {
      picker.setAttribute('aria-hidden', 'true');
      picker.setAttribute('aria-modal', 'false');
    } else {
      picker.setAttribute('aria-hidden', 'false');
      picker.setAttribute('aria-modal', 'true');
      requestAnimationFrame(() => document.getElementById('rxDrugSearch')?.focus({ preventScroll:true }));
    }

    if (picker.dataset.miPickerBound !== '1') {
      picker.dataset.miPickerBound = '1';
      drugPickerObserver?.disconnect();
      drugPickerObserver = new MutationObserver(syncPrescriptionDrugPicker);
      drugPickerObserver.observe(picker, { attributes:true, attributeFilter:['hidden'] });
    }

    if (!drugPickerListenersInstalled) {
      drugPickerListenersInstalled = true;
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const openPicker = document.getElementById('rxDrugPopover');
        if (!openPicker || openPicker.hidden) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closePrescriptionDrugPicker({ restoreFocus:true });
      }, true);
    }
    return true;
  }

  function syncResponsiveState() {
    const body = document.body;
    if (!body) return;
    if (innerWidth < MOBILE_BREAKPOINT) body.classList.remove('mi-sidebar-collapsed');
    else body.classList.remove('mi-sidebar-open');
    resetRootHorizontalOffset();
    scheduleLayoutAudit();
    scheduleNavigation();
    schedulePalettePosition();
    syncPrescriptionDrugPicker();
  }

  function installObservers() {
    const nav = document.getElementById('appMenu');
    if (nav && !navObserver) {
      navObserver = new MutationObserver(scheduleNavigation);
      navObserver.observe(nav, { childList:true, subtree:true, attributes:true, attributeFilter:['class', 'style', 'aria-current'] });
    }
    if (!headObserver) {
      headObserver = new MutationObserver(scheduleStylesheetOrder);
      headObserver.observe(document.head, { childList:true });
    }
    if ('ResizeObserver' in window && !resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        scheduleLayoutAudit();
        schedulePalettePosition();
      });
      const main = document.querySelector('.mi-main');
      const slot = document.querySelector('.mi-page-slot');
      if (main) resizeObserver.observe(main);
      if (slot) resizeObserver.observe(slot);
    }
    const pageSlot = document.querySelector('.mi-page-slot');
    if (pageSlot && !pageSlot.dataset.miProfessionalObserved) {
      pageSlot.dataset.miProfessionalObserved = '1';
      const observer = new MutationObserver(() => {
        scheduleLayoutAudit();
        bindCommandPaletteViewport();
        syncPrescriptionDrugPicker();
      });
      observer.observe(pageSlot, { childList:true, subtree:true });
    }
  }

  function stabilize() {
    document.body?.classList.add('mi-professional-ready');
    orderStylesheets();
    normalizeNavigation();
    resetRootHorizontalOffset();
    markScrollableContainers();
    ensureViewportStyles();
    installObservers();
    bindCommandPaletteViewport();
    syncPrescriptionDrugPicker();
    syncResponsiveState();
    window.dispatchEvent(new CustomEvent('medindex:professional-ui-ready', { detail:{ page:pageKey, version:PROFESSIONAL_VERSION } }));
  }

  window.addEventListener('medindex:tailadmin-ready', stabilize, { once:true });
  window.addEventListener('medindex:auth-ready', scheduleNavigation);
  window.addEventListener('medindex:clinical-workflow-ready', () => {
    bindCommandPaletteViewport();
    syncPrescriptionDrugPicker();
  });
  window.addEventListener('pageshow', () => {
    resetRootHorizontalOffset();
    scheduleNavigation();
    scheduleLayoutAudit();
    bindCommandPaletteViewport();
    syncPrescriptionDrugPicker();
  }, { passive:true });
  window.addEventListener('resize', () => requestAnimationFrame(syncResponsiveState), { passive:true });
  window.addEventListener('orientationchange', () => setTimeout(syncResponsiveState, 80), { passive:true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body?.dataset.tailadminReady === '1') stabilize();
    }, { once:true });
  } else if (document.body?.dataset.tailadminReady === '1') {
    stabilize();
  }
})();
