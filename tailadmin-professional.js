(() => {
  'use strict';

  const ROOT = document.documentElement;
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
  ROOT.classList.add('medindex-professional');

  let headFrame = 0;
  let navFrame = 0;
  let layoutFrame = 0;
  let paletteFrame = 0;
  let navObserver = null;
  let headObserver = null;
  let resizeObserver = null;
  let paletteObserver = null;
  let paletteListenersInstalled = false;

  function orderStylesheets() {
    headFrame = 0;
    const base = document.querySelector('link[data-tailadmin-medindex-css]');
    const professional = document.querySelector('link[data-tailadmin-professional-css]');
    if (!base || !professional) return;

    if (base.nextElementSibling !== professional || document.head.lastElementChild !== professional) {
      document.head.append(base, professional);
    }
  }

  function scheduleStylesheetOrder() {
    if (headFrame) return;
    headFrame = requestAnimationFrame(orderStylesheets);
  }

  function resetRootHorizontalOffset() {
    try {
      if (window.scrollX) window.scrollTo({ left: 0, top: window.scrollY, behavior: 'auto' });
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
      const label = link.querySelector('.app-menu-title,.mi-menu-label')?.textContent?.trim()
        || link.getAttribute('aria-label')
        || '';
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
    const selectors = [
      '.table-wrap',
      '.atc-table-wrap',
      '.med-table-wrap',
      '.lab-category-nav',
      '.atc-audit',
      '.rx-command-bar',
    ];

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

  function ensurePaletteViewportStyles() {
    if (document.getElementById('miCommandPaletteViewportStyles')) return;
    const style = document.createElement('style');
    style.id = 'miCommandPaletteViewportStyles';
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
    const availableWidth = Math.max(280, window.innerWidth - gutter * 2);
    const width = Math.min(Math.max(280, rect.width), availableWidth);
    const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter));
    const estimatedHeight = Math.min(430, Math.max(180, window.innerHeight * 0.7));
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const top = roomBelow >= 180
      ? rect.bottom + 8
      : Math.max(gutter, rect.top - estimatedHeight - 8);

    palette.style.setProperty('--mi-command-left', `${Math.round(left)}px`);
    palette.style.setProperty('--mi-command-top', `${Math.round(top)}px`);
    palette.style.setProperty('--mi-command-width', `${Math.round(width)}px`);
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
    ensurePaletteViewportStyles();
    const input = document.getElementById('miGlobalSearch');
    const palette = document.getElementById('miCommandPalette');
    if (!input || !palette) return false;

    portalCommandPalette(palette);

    if (!palette.dataset.miViewportBound) {
      palette.dataset.miViewportBound = '1';
      paletteObserver?.disconnect();
      paletteObserver = new MutationObserver(schedulePalettePosition);
      paletteObserver.observe(palette, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
      input.addEventListener('focus', schedulePalettePosition, { passive: true });
      input.addEventListener('input', schedulePalettePosition, { passive: true });
    }

    if (!paletteListenersInstalled) {
      paletteListenersInstalled = true;
      window.addEventListener('resize', schedulePalettePosition, { passive: true });
      document.addEventListener('scroll', schedulePalettePosition, { passive: true, capture: true });
    }

    schedulePalettePosition();
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
  }

  function installObservers() {
    const nav = document.getElementById('appMenu');
    if (nav && !navObserver) {
      navObserver = new MutationObserver(scheduleNavigation);
      navObserver.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-current'] });
    }

    if (!headObserver) {
      headObserver = new MutationObserver(scheduleStylesheetOrder);
      headObserver.observe(document.head, { childList: true });
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
      });
      observer.observe(pageSlot, { childList: true, subtree: true });
    }
  }

  function stabilize() {
    document.body?.classList.add('mi-professional-ready');
    orderStylesheets();
    normalizeNavigation();
    resetRootHorizontalOffset();
    markScrollableContainers();
    installObservers();
    bindCommandPaletteViewport();
    syncResponsiveState();
    window.dispatchEvent(new CustomEvent('medindex:professional-ui-ready', { detail: { page: pageKey } }));
  }

  window.addEventListener('medindex:tailadmin-ready', stabilize, { once: true });
  window.addEventListener('medindex:auth-ready', scheduleNavigation);
  window.addEventListener('medindex:clinical-workflow-ready', bindCommandPaletteViewport);
  window.addEventListener('pageshow', () => {
    resetRootHorizontalOffset();
    scheduleNavigation();
    scheduleLayoutAudit();
    bindCommandPaletteViewport();
  }, { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(syncResponsiveState), { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(syncResponsiveState, 80), { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body?.dataset.tailadminReady === '1') stabilize();
    }, { once: true });
  } else if (document.body?.dataset.tailadminReady === '1') {
    stabilize();
  }
})();
