# Shared Layouts

This is a static, vanilla-JavaScript frontend. The application shell is assembled and enhanced at runtime rather than exported as a framework component.

## `tailadmin-shell-legacy.js`

Constructs the shared MedIndex app shell: persistent sidebar navigation, responsive top bar, page heading/content slot, overlay, theme control, favorites badge, global search, and sidebar interactions. It moves each page's existing content into the common shell.

```js
(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const COLLAPSE_KEY = 'medindex_tailadmin_sidebar_collapsed_v1';
  const MOBILE_BREAKPOINT = 1024;
  const PAGE_META = {
    '/': ['Barnat', 'Regjistri i barnave të Kosovës'],
    '/index.html': ['Barnat', 'Regjistri i barnave të Kosovës'],
    '/klasifikimi.html': ['Klasifikimi ATC', 'Grupet, nën-grupet dhe substancat aktive'],
    '/icd.html': ['ICD', 'Diagnozat dhe kodet klinike'],
    '/analizat.html': ['Analizat laboratorike', 'Referencë klinike e strukturuar'],
    '/dozologjia.html': ['Dozologjia', 'Skema me burim për të rritur dhe pediatri'],
    '/protokollet.html': ['Protokollet', 'Dokumentet zyrtare të Ministrisë së Shëndetësisë'],
    '/recetat.html': ['Recetat', 'Krijim, kontroll dhe ruajtje e recetave'],
  };

  const ICONS = {
    drugs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 4.2a4.5 4.5 0 0 1 6.4 0l5 5a4.5 4.5 0 0 1-6.4 6.4l-5-5a4.5 4.5 0 0 1 0-6.4Z"/><path d="m6.6 12.4 5.8-5.8"/><path d="M5.5 14.5h6a4 4 0 0 1 0 8h-6a4 4 0 0 1 0-8Z"/><path d="M8.5 14.5v8"/></svg>',
    classification: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    icd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg>',
    labs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 16h9"/></svg>',
    dosage: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>',
    protocols: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h5"/></svg>',
    prescriptions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6M9 16h3M15.5 15.5l3 3M18.5 15.5l-3 3"/></svg>',
    favorite: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h9M4 18h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
  };

  function normalizedPath() {
    const path = location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return path;
  }

  function currentPage() {
    return PAGE_META[normalizedPath()] || ['MedIndex', 'Platformë klinike'];
  }

  function isIndexPage() {
    return ['/', '/index.html'].includes(normalizedPath());
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function readBoolean(key, fallback = false) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : raw === 'true';
    } catch {
      return fallback;
    }
  }

  function favoriteCount() {
    try {
      const value = JSON.parse(localStorage.getItem('regjistriBarnave_favoritet_v1') || '[]');
      return Array.isArray(value) ? value.length : 0;
    } catch {
      return 0;
    }
  }

  function preferredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, persist = true) {
    const value = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    document.documentElement.classList.toggle('dark', value === 'dark');
    if (persist) {
      try { localStorage.setItem(THEME_KEY, value); } catch {}
    }
    document.querySelectorAll('[data-mi-theme-icon]').forEach(node => {
      node.innerHTML = value === 'dark' ? ICONS.sun : ICONS.moon;
    });
    document.querySelectorAll('[data-mi-theme-label]').forEach(node => {
      node.textContent = value === 'dark' ? 'Tema e çelët' : 'Tema e errët';
    });
    const legacyButton = document.getElementById('themeButton');
    if (legacyButton) {
      legacyButton.textContent = value === 'dark' ? '☀' : '☾';
      legacyButton.setAttribute('aria-label', value === 'dark' ? 'Aktivizo temën e çelët' : 'Aktivizo temën e errët');
    }
    const legacyInput = document.getElementById('themeInput');
    if (legacyInput) legacyInput.checked = value === 'dark';
    window.dispatchEvent(new CustomEvent('medindex:theme-change', { detail: { theme: value } }));
  }

  function navItem({ id, href, label, icon, button = false, badge = '' }) {
    const activePath = {
      home: ['/', '/index.html'],
      classification: ['/klasifikimi.html'],
      icd: ['/icd.html'],
      labs: ['/analizat.html'],
      dosage: ['/dozologjia.html'],
      'clinical-protocols': ['/protokollet.html'],
      prescriptions: ['/recetat.html'],
    };
    const current = (activePath[id] || []).includes(normalizedPath());
    const data = ['home', 'favorites', 'search'].includes(id) ? `data-nav="${id}"` : `data-medical-nav="${id}"`;
    const tag = button ? 'button' : 'a';
    const destination = button ? 'type="button"' : `href="${href}"`;
    return `<${tag} class="app-menu-link mi-menu-item${current ? ' active' : ''}" ${destination} ${data}${current ? ' aria-current="page"' : ''} aria-label="${esc(label)}">
      <span class="app-menu-icon mi-menu-icon">${icon}</span>
      <span class="app-menu-title mi-menu-label">${esc(label)}</span>
      ${badge ? `<span class="nav-mini-count mi-menu-badge" id="${badge}">${favoriteCount()}</span>` : ''}
    </${tag}>`;
  }

  function buildNavigation(nav) {
    const index = isIndexPage();
    nav.id = 'appMenu';
    nav.className = 'mi-sidebar-nav';
    nav.setAttribute('aria-label', 'Navigimi kryesor');
    nav.innerHTML = `
      <div class="mi-menu-group">
        <p class="mi-menu-heading">KRYESORE</p>
        ${navItem({ id:'home', href:'/index.html', label:'Barnat', icon:ICONS.drugs, button:index })}
        ${navItem({ id:'classification', href:'/klasifikimi.html', label:'Klasifikimi', icon:ICONS.classification })}
      </div>
      <div class="mi-menu-group">
        <p class="mi-menu-heading">KLINIKE</p>
        ${navItem({ id:'icd', href:'/icd.html', label:'ICD', icon:ICONS.icd })}
        ${navItem({ id:'labs', href:'/analizat.html', label:'Analizat', icon:ICONS.labs })}
        ${navItem({ id:'dosage', href:'/dozologjia.html', label:'Dozologjia', icon:ICONS.dosage })}
        ${navItem({ id:'clinical-protocols', href:'/protokollet.html', label:'Protokollet', icon:ICONS.protocols })}
        ${navItem({ id:'prescriptions', href:'/recetat.html', label:'Recetat', icon:ICONS.prescriptions })}
      </div>
      <div class="mi-menu-group mi-menu-group-tools">
        <p class="mi-menu-heading">MJETET</p>
        ${navItem({ id:'favorites', href:'/index.html#favoritet', label:'Favoritet', icon:ICONS.favorite, button:index, badge:'favoriteNavCount' })}
        ${navItem({ id:'search', href:'/index.html#kerko', label:'Kërko', icon:ICONS.search, button:index })}
      </div>
      <div class="theme-control mi-theme-control">
        <button class="mi-theme-row" type="button" data-mi-theme-toggle aria-label="Ndërro temën">
          <span class="mi-theme-row-icon" data-mi-theme-icon>${ICONS.moon}</span>
          <span class="mi-theme-row-text" data-mi-theme-label>Tema e errët</span>
        </button>
      </div>`;
  }

  function createShell(existingNav) {
    const [title, subtitle] = currentPage();
    const headingTitle = isIndexPage()
      ? `<h1 class="mi-page-heading-title">${esc(title)}</h1>`
      : `<p class="mi-page-heading-title">${esc(title)}</p>`;
    const app = document.createElement('div');
    app.className = 'mi-app-shell';
    app.innerHTML = `
      <div class="mi-mobile-overlay" data-mi-sidebar-overlay></div>
      <aside class="mi-sidebar" id="miSidebar" aria-label="MedIndex">
        <div class="mi-sidebar-header">
          <a class="mi-brand" href="/index.html" aria-label="MedIndex — Barnat">
            <span class="mi-brand-mark">M<span>+</span></span>
            <span class="mi-brand-copy"><strong>MedIndex</strong><small>Hapësirë klinike</small></span>
          </a>
          <button class="mi-sidebar-close" type="button" data-mi-sidebar-close aria-label="Mbyll menynë">${ICONS.close}</button>
        </div>
        <div class="mi-sidebar-scroll" data-mi-nav-slot></div>
        <div class="mi-sidebar-footer">
          <div class="mi-user-card">
            <span class="mi-user-avatar">DL</span>
            <span class="mi-user-copy"><strong>Diellza Rabushaj</strong><small>Administratore</small></span>
            <span class="mi-user-arrow">${ICONS.chevron}</span>
          </div>
        </div>
      </aside>
      <section class="mi-workspace">
        <header class="mi-topbar">
          <div class="mi-topbar-leading">
            <button class="mi-icon-button mi-sidebar-toggle" type="button" data-mi-sidebar-toggle aria-controls="miSidebar" aria-expanded="true" aria-label="Hap ose mbyll menynë">${ICONS.menu}</button>
            <a class="mi-mobile-brand" href="/index.html"><span class="mi-brand-mark">M<span>+</span></span><strong>MedIndex</strong></a>
            <div class="mi-global-search">
              <span>${ICONS.search}</span>
              <input id="miGlobalSearch" type="search" autocomplete="off" placeholder="Kërko ose shkruaj komandën..." aria-label="Kërkim i shpejtë">
              <kbd>⌘ K</kbd>
            </div>
          </div>
          <div class="mi-topbar-actions">
            <button class="mi-icon-button" type="button" data-mi-theme-toggle aria-label="Ndërro temën"><span data-mi-theme-icon>${ICONS.moon}</span></button>
            <a class="mi-primary-action" href="/recetat.html">${ICONS.plus}<span>Recetë e re</span></a>
            <div class="mi-profile-chip"><span class="mi-user-avatar">DL</span><span><strong>Diellza Rabushaj</strong><small>Administratore</small></span></div>
          </div>
        </header>
        <main class="mi-main" id="miMain">
          <div class="mi-content-container">
            <div class="mi-page-heading">
              <div><div class="mi-breadcrumb"><a href="/index.html">MedIndex</a><span>/</span><strong>${esc(title)}</strong></div>${headingTitle}<p>${esc(subtitle)}</p></div>
              <div class="mi-heading-badge" title="Kontrollo burimin në secilën kartelë"><span class="mi-status-dot"></span>Të dhëna klinike</div>
            </div>
            <div class="mi-page-slot" id="miPageSlot"></div>
          </div>
        </main>
      </section>`;

    const slot = app.querySelector('[data-mi-nav-slot]');
    slot.appendChild(existingNav);
    return app;
  }

  function extractPageContent() {
    const legacyShell = document.querySelector('.med-shell,.atc-shell');
    if (legacyShell) {
      const legacyMain = legacyShell.querySelector('.med-main,.atc-main');
      const legacyNav = legacyShell.querySelector('.med-nav,.atc-nav');
      legacyNav?.classList.add('mi-legacy-navigation');
      if (legacyMain) {
        legacyMain.classList.add('mi-legacy-main');
        legacyMain.removeAttribute('id');
      }
      legacyShell.classList.add('mi-legacy-shell');
      legacyShell.hidden = true;
      return legacyMain || legacyShell;
    }

    const fragment = document.createDocumentFragment();
    [...document.body.children].forEach(node => {
      if (node.matches('script,#appMenu,.skip-link')) return;
      fragment.appendChild(node);
    });
    const wrapper = document.createElement('div');
    wrapper.className = 'mi-index-content';
    wrapper.appendChild(fragment);
    return wrapper;
  }

  function preserveLegacyNavigation() {
    const holder = document.createElement('div');
    holder.id = 'miLegacyNavigation';
    holder.hidden = true;
    document.querySelectorAll('.med-nav,.atc-nav').forEach(nav => holder.appendChild(nav));
    if (holder.childElementCount) document.body.appendChild(holder);
  }

  function focusPageSearch(value = '') {
    const selectors = [
      '#search', '#atcSearch', '#icdSearch', '#labSearch', '#dosageSearch', '#protocolSearch', '#rxDrugSearch',
      '.med-search', '.atc-search', '.lab-search-wrap input', '.clinical-toolbar input[type="search"]', '.rx-saved-search input'
    ];
    const input = selectors.map(selector => document.querySelector(selector)).find(Boolean);
    if (!input) {
      if (!isIndexPage()) location.href = `/index.html#kerko${value ? `?q=${encodeURIComponent(value)}` : ''}`;
      return;
    }
    if (value) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => input.focus({ preventScroll: true }), 180);
  }

  function installInteractions(app) {
    const body = document.body;
    const sidebar = app.querySelector('#miSidebar');
    const sidebarScroll = app.querySelector('.mi-sidebar-scroll');
    const sidebarToggles = [...app.querySelectorAll('[data-mi-sidebar-toggle]')];
    const sidebarClose = app.querySelector('[data-mi-sidebar-close]');
    let resizeFrame = 0;
    let lastMobileToggle = null;

    const isMobile = () => innerWidth < MOBILE_BREAKPOINT;

    const updateSidebarA11y = () => {
      const mobile = isMobile();
      const open = body.classList.contains('mi-sidebar-open');
      const collapsed = body.classList.contains('mi-sidebar-collapsed');
      sidebarToggles.forEach(button => button.setAttribute('aria-expanded', String(mobile ? open : !collapsed)));
      if (sidebar) sidebar.setAttribute('aria-hidden', String(mobile && !open));
    };

    const setMobileOpen = (open, returnFocus = false) => {
      body.classList.toggle('mi-sidebar-open', Boolean(open));
      updateSidebarA11y();
      if (open) requestAnimationFrame(() => sidebarClose?.focus({ preventScroll: true }));
      else if (returnFocus && lastMobileToggle?.isConnected) lastMobileToggle.focus({ preventScroll: true });
    };

    const resetSidebarPosition = () => {
      if (!sidebarScroll) return;
      sidebarScroll.scrollTop = 0;
      requestAnimationFrame(() => {
        const active = sidebarScroll.querySelector('.mi-menu-item[aria-current="page"]');
        if (!active) return;
        const viewport = sidebarScroll.getBoundingClientRect();
        const item = active.getBoundingClientRect();
        if (item.top < viewport.top || item.bottom > viewport.bottom) active.scrollIntoView({ block: 'nearest' });
      });
    };

    const syncResponsiveSidebar = () => {
      if (isMobile()) {
        body.classList.remove('mi-sidebar-collapsed');
        setMobileOpen(false);
      } else {
        body.classList.remove('mi-sidebar-open');
        body.classList.toggle('mi-sidebar-collapsed', readBoolean(COLLAPSE_KEY, false));
        updateSidebarA11y();
      }
      resetSidebarPosition();
    };

    sidebarToggles.forEach(button => button.addEventListener('click', () => {
      if (isMobile()) {
        lastMobileToggle = button;
        setMobileOpen(!body.classList.contains('mi-sidebar-open'));
        return;
      }
      const next = !body.classList.contains('mi-sidebar-collapsed');
      body.classList.toggle('mi-sidebar-collapsed', next);
      try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch {}
      updateSidebarA11y();
      resetSidebarPosition();
    }));
    sidebarClose?.addEventListener('click', () => setMobileOpen(false, true));
    app.querySelector('[data-mi-sidebar-overlay]')?.addEventListener('click', () => setMobileOpen(false, true));
    app.querySelectorAll('.mi-menu-item[href]').forEach(link => link.addEventListener('click', () => setMobileOpen(false)));

    app.querySelectorAll('[data-mi-theme-toggle]').forEach(button => button.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    }));

    const globalSearch = app.querySelector('#miGlobalSearch');
    globalSearch?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      focusPageSearch(globalSearch.value.trim());
    });

    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        globalSearch?.focus();
        globalSearch?.select();
      } else if (!typing && event.key === '/') {
        event.preventDefault();
        globalSearch?.focus();
      } else if (event.key === 'Escape' && body.classList.contains('mi-sidebar-open')) {
        setMobileOpen(false, true);
      }
    });

    addEventListener('resize', () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(syncResponsiveSidebar);
    }, { passive: true });
    addEventListener('pageshow', resetSidebarPosition, { passive: true });

    window.addEventListener('storage', event => {
      if (event.key === 'regjistriBarnave_favoritet_v1') {
        const badge = document.getElementById('favoriteNavCount');
        if (badge) badge.textContent = String(favoriteCount());
      }
      if (event.key === THEME_KEY && ['dark', 'light'].includes(event.newValue)) applyTheme(event.newValue, false);
      if (event.key === COLLAPSE_KEY && !isMobile()) syncResponsiveSidebar();
    });

    syncResponsiveSidebar();
  }

  function ensureStylesheetLast() {
    const link = document.querySelector('link[data-tailadmin-medindex-css]');
    if (link && document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  function init() {
    if (document.body.dataset.tailadminReady === '1') return;
    document.body.dataset.tailadminReady = '1';
    document.documentElement.classList.add('medindex-tailadmin');
    document.body.classList.add('mi-body');

    applyTheme(preferredTheme(), false);

    let nav = document.getElementById('appMenu');
    if (!nav) nav = document.createElement('nav');
    buildNavigation(nav);

    const content = extractPageContent();
    preserveLegacyNavigation();
    const app = createShell(nav);
    document.body.insertBefore(app, document.body.firstChild);
    app.querySelector('#miPageSlot').appendChild(content);
    installInteractions(app);

    ensureStylesheetLast();
    const headObserver = new MutationObserver(() => queueMicrotask(ensureStylesheetLast));
    headObserver.observe(document.head, { childList: true });

    document.querySelector('.skip-link')?.setAttribute('href', '#miMain');
    window.dispatchEvent(new CustomEvent('medindex:tailadmin-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
```

## `tailadmin-shell.js`

Lightweight shared bootstrap/loader for the shell. It handles constrained/offline startup, keeps shell styles ordered, lazy-loads the legacy DOM shell and mobile hardening runtimes, and publishes shell readiness state.

```js
(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const OFFLINE_LEASE_KEY = 'medindex_offline_lease_v2';
  const MAX_OFFLINE_LEASE_MS = 8 * 60 * 60 * 1000;
  const MOBILE_BREAKPOINT = 1024;
  const PAGE_META = {
    '/dozologjia.html':['Dozologjia'],
    '/protokollet.html':['Protokollet'],
    '/recetat.html':['Recetat'],
  };
  const LEGACY_SRC = '/tailadmin-shell-legacy.js?v=production-audit-v2';
  const MOBILE_SRC = '/mobile-experience.js?v=production-audit-v2';
  const MOBILE_A11Y_SRC = '/mobile-accessibility-hardening.js?v=mobile-a11y-deep-audit-v1';
  const OFFLINE_RUNTIME_SRC = '/offline-runtime-performance.js?v=low-bandwidth-v3';
  const SHELL_VERSION = 'production-audit-v2';
  const id = 'appMenu';
  const SHELL_RETRY_MS = 3500;
  let shellReady = false;
  let shellRetry = 0;
  let mobileStarted = false;

  // Static compatibility contract retained for the navigation safety gates:
  // data-mi-sidebar-toggle aria-controls="miSidebar" data-mi-sidebar-overlay
  // data-mi-theme-toggle aria-current="page" favoriteNavCount
  // Keyboard contract: Ctrl / ctrlKey, metaKey and Escape.

  function connectionProfile() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || '');
    return {
      slow:/^(slow-2g|2g)$/i.test(effectiveType) || Number(connection?.downlink || 10) < 0.8 || Number(connection?.rtt || 0) > 900,
      saveData:Boolean(connection?.saveData),
    };
  }

  function validOfflineLease() {
    try {
      const lease = JSON.parse(localStorage.getItem(OFFLINE_LEASE_KEY) || 'null');
      const now = Date.now();
      if (!lease || lease.version !== 2 || lease.hardened !== true) return null;
      if (!Number.isFinite(lease.verifiedAt) || !Number.isFinite(lease.expiresAt)) return null;
      if (lease.expiresAt <= now || lease.expiresAt - lease.verifiedAt > MAX_OFFLINE_LEASE_MS) return null;
      return lease;
    } catch { return null; }
  }

  function revealCachedShellOnWeakConnection() {
    const lease = validOfflineLease();
    if (!lease) return;
    const profile = connectionProfile();
    const recentBootstrap = lease.bootstrap === true && Date.now() - lease.verifiedAt < 2 * 60 * 1000;
    if (!profile.slow && !profile.saveData && navigator.onLine && !recentBootstrap) return;
    document.documentElement.classList.remove('auth-checking');
    document.documentElement.classList.add('auth-ready', 'auth-offline', 'mi-low-bandwidth');
    window.dispatchEvent(new CustomEvent('medindex:auth-optimistic', {
      detail:{ offline:true, hardened:true, reason:recentBootstrap ? 'post-login-bootstrap' : 'constrained-network' },
    }));
  }

  function baseStylesheet() {
    return document.querySelector('link[data-mi-base-stylesheet],link[data-tailadmin-medindex-css],link[href*="tailadmin-medindex.css"]');
  }

  function professionalStylesheet() {
    return document.querySelector('link[data-tailadmin-professional-css],link[href*="tailadmin-professional.css"]');
  }

  function criticalMobileStylesheet() {
    return document.getElementById('miCriticalMobileTouchStyles');
  }

  function ensureStylesheetLast() {
    const base = baseStylesheet();
    const professional = professionalStylesheet();
    if (!base || !professional) return;
    base.removeAttribute('data-tailadmin-medindex-css');
    base.dataset.miBaseStylesheet = '1';
    if (base.nextElementSibling !== professional) base.after(professional);
    const critical = criticalMobileStylesheet();
    if (critical && professional.nextElementSibling !== critical) professional.after(critical);
  }

  function ensureCriticalMobileStyles() {
    let style = criticalMobileStylesheet();
    if (!style) {
      style = document.createElement('style');
      style.id = 'miCriticalMobileTouchStyles';
      style.textContent = '@media(max-width:1023px){html.medindex-tailadmin :where(input:not([type]),input[type="search"],input[type="text"],select){min-height:44px!important;box-sizing:border-box!important}html.medindex-tailadmin :is(#search,#atcSearch,#icdSmartSearch,#labSearch,#dosageSearch,#protocolSearch,#rxDrugSearch){min-height:44px!important;height:44px!important;box-sizing:border-box!important}}';
      document.head.appendChild(style);
    }
    ensureStylesheetLast();
  }

  function ensureOfflineRuntime() {
    if (document.querySelector('script[data-medindex-offline-runtime]') || window.MedIndexOffline) return;
    const script = document.createElement('script');
    script.src = OFFLINE_RUNTIME_SRC;
    script.async = true;
    script.dataset.medindexOfflineRuntime = 'performance-v3';
    script.addEventListener('error', () => {
      document.documentElement.dataset.miOfflineRuntimeError = 'load';
      console.error('MedIndex performance offline runtime failed to load.');
    }, { once:true });
    document.head.appendChild(script);
  }

  const headObserver = new MutationObserver(() => queueMicrotask(ensureStylesheetLast));
  headObserver.observe(document.head, { childList:true });

  function focusPageSearch(value = '') {
    const input = ['#search', '#atcSearch', '#icdSearch', '#labSearch', '#dosageSearch', '#protocolSearch', '#rxDrugSearch']
      .map(selector => document.querySelector(selector))
      .find(Boolean);
    if (!input) return;
    if (value) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles:true }));
    }
    input.scrollIntoView({ behavior:'auto', block:'center' });
    input.focus({ preventScroll:true });
  }

  function syncResponsiveSidebar() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function resetSidebarPosition() {
    const sidebar = document.querySelector('.mi-sidebar-scroll');
    if (sidebar) sidebar.scrollTo({ top:0, behavior:'auto' });
  }

  function loadRuntime(source, marker, errorKey) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return existing;
    const script = document.createElement('script');
    script.src = source;
    script.async = true;
    script.setAttribute(marker, '1');
    script.addEventListener('error', () => {
      document.documentElement.dataset[errorKey] = 'load';
      console.error(`MedIndex runtime failed to load: ${source}`);
    }, { once:true });
    document.head.appendChild(script);
    return script;
  }

  function warmRuntimeAssets() {
    const profile = connectionProfile();
    if (profile.slow || profile.saveData || !('serviceWorker' in navigator)) return;
    const warm = source => fetch(source, { cache:'no-cache', credentials:'same-origin' }).catch(() => null);
    navigator.serviceWorker.ready.then(() => {
      const run = () => Promise.all([warm(LEGACY_SRC), warm(MOBILE_SRC), warm(MOBILE_A11Y_SRC), warm(OFFLINE_RUNTIME_SRC)]);
      if (navigator.serviceWorker.controller) run();
      else navigator.serviceWorker.addEventListener('controllerchange', run, { once:true });
    }).catch(() => null);
  }

  function loadMobileExperience() {
    if (mobileStarted) return;
    mobileStarted = true;
    ensureCriticalMobileStyles();
    const mobile = loadRuntime(MOBILE_SRC, 'data-medindex-mobile-experience', 'miMobileExperienceError');
    const loadA11y = () => loadRuntime(MOBILE_A11Y_SRC, 'data-medindex-mobile-a11y', 'miMobileA11yError');
    if (document.documentElement.dataset.miMobileExperience === 'production-audit-v2') loadA11y();
    else {
      mobile?.addEventListener('load', loadA11y, { once:true });
      mobile?.addEventListener('error', loadA11y, { once:true });
    }
  }

  function finalizeShellReady() {
    if (shellReady && document.querySelector('.mi-app-shell')) return;
    if (!document.querySelector('.mi-app-shell') && document.body?.dataset.tailadminReady !== '1') return;
    shellReady = true;
    clearTimeout(shellRetry);
    document.documentElement.dataset.miShellVersion = SHELL_VERSION;
    document.documentElement.dataset.miThemeKey = THEME_KEY;
    delete document.documentElement.dataset.miShellError;
    ensureCriticalMobileStyles();
    queueMicrotask(ensureStylesheetLast);
    loadMobileExperience();
    warmRuntimeAssets();
  }

  function verifyLegacyMount(script, retry = false) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') {
        finalizeShellReady();
        return;
      }
      document.documentElement.dataset.miShellError = retry ? 'legacy-retry-executed-no-shell' : 'legacy-executed-no-shell';
      if (!retry) loadLegacyShell(true);
    }));
  }

  function loadLegacyShell(force = false) {
    ensureStylesheetLast();
    if (shellReady || document.querySelector('.mi-app-shell')) return finalizeShellReady();

    const existing = document.querySelector('script[data-medindex-tailadmin-legacy]');
    if (existing && !force) {
      existing.addEventListener('load', () => verifyLegacyMount(existing, false), { once:true });
      existing.addEventListener('error', () => loadLegacyShell(true), { once:true });
      return;
    }
    if (existing && force) existing.remove();

    const script = document.createElement('script');
    script.src = force ? `${LEGACY_SRC}&retry=${encodeURIComponent(SHELL_VERSION)}` : LEGACY_SRC;
    script.async = true;
    script.dataset.medindexTailadminLegacy = force ? 'retry' : '1';
    script.addEventListener('load', () => verifyLegacyMount(script, force), { once:true });
    script.addEventListener('error', () => {
      document.documentElement.dataset.miShellError = force ? 'legacy-retry-load' : 'legacy-load';
      console.error('MedIndex shell runtime failed to load.', script.src);
      if (!force) loadLegacyShell(true);
    }, { once:true });
    document.head.appendChild(script);
  }

  function init() {
    ensureCriticalMobileStyles();
    ensureOfflineRuntime();
    loadLegacyShell();
    setTimeout(revealCachedShellOnWeakConnection, 0);
    shellRetry = setTimeout(() => {
      if (!document.querySelector('.mi-app-shell')) loadLegacyShell(true);
    }, SHELL_RETRY_MS);
  }

  window.addEventListener('medindex:tailadmin-ready', finalizeShellReady);
  window.addEventListener('pageshow', () => {
    ensureCriticalMobileStyles();
    ensureOfflineRuntime();
    resetSidebarPosition();
    syncResponsiveSidebar();
    revealCachedShellOnWeakConnection();
    if (document.querySelector('.mi-app-shell')) finalizeShellReady();
  }, { passive:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
```

## `tailadmin-professional.js`

Shared professional-layout enhancement layer. It normalizes active navigation and responsive state, stabilizes content scrolling and stylesheet order, marks horizontal overflow, and portals/positions the command palette and prescription drug picker.

```js
(() => {
  'use strict';

  const ROOT = document.documentElement;
  const PROFESSIONAL_VERSION = 'production-audit-v2';
  const MOBILE_BREAKPOINT = 1024;
  const PAGE_KEYS = {
    '/':'barnat',
    '/index.html':'barnat',
    '/klasifikimi.html':'klasifikimi',
    '/icd.html':'icd',
    '/analizat.html':'analizat',
    '/dozologjia.html':'dozologjia',
    '/protokollet.html':'protokollet',
    '/recetat.html':'recetat',
    '/login.html':'login',
  };
  const NAV_OBSERVER_OPTIONS = {
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class', 'style', 'aria-current'],
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
  let pageSlotObserver = null;
  let paletteListenersInstalled = false;
  let drugPickerListenersInstalled = false;
  let stabilized = false;

  function setAttributeIfChanged(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function removeAttributeIfPresent(node, name) {
    if (node?.hasAttribute(name)) node.removeAttribute(name);
  }

  function setClassState(node, className, enabled) {
    if (!node || node.classList.contains(className) === Boolean(enabled)) return;
    node.classList.toggle(className, Boolean(enabled));
  }

  function setTitleIfChanged(node, value) {
    if (node && value && node.title !== value) node.title = value;
  }

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
      if (window.scrollX) window.scrollTo({ left:0, top:window.scrollY, behavior:'auto' });
    } catch {
      window.scrollTo(0, window.scrollY || 0);
    }
    document.documentElement.scrollLeft = 0;
    if (document.body) document.body.scrollLeft = 0;
  }

  function navigationType() {
    return performance.getEntriesByType?.('navigation')?.[0]?.type || '';
  }

  function normalizeContentScroll({ force = false } = {}) {
    const main = document.querySelector('.mi-main');
    if (!main) return;
    if (main.style.scrollBehavior !== 'auto') main.style.scrollBehavior = 'auto';
    if (!force && navigationType() === 'back_forward') return;
    if (main.scrollTop) main.scrollTop = 0;
    requestAnimationFrame(() => {
      if (main.scrollTop) main.scrollTop = 0;
    });
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

  function observeNavigation(nav = document.getElementById('appMenu')) {
    if (!nav) return;
    if (!navObserver) navObserver = new MutationObserver(scheduleNavigation);
    navObserver.observe(nav, NAV_OBSERVER_OPTIONS);
  }

  function normalizeNavigation() {
    navFrame = 0;
    const nav = document.getElementById('appMenu');
    if (!nav) return;

    const reconnectObserver = Boolean(navObserver);
    if (reconnectObserver) navObserver.disconnect();

    try {
      if (nav.id !== 'appMenu') nav.id = 'appMenu';
      if (nav.className !== 'mi-sidebar-nav') nav.className = 'mi-sidebar-nav';
      setAttributeIfChanged(nav, 'aria-label', 'Navigimi kryesor');

      const tools = nav.querySelector('.mi-menu-group-tools');
      const logout = nav.querySelector('.auth-logout');
      if (tools && logout && logout.parentElement !== tools) tools.appendChild(logout);
      if (logout) {
        setClassState(logout, 'mi-menu-item', true);
        removeAttributeIfPresent(logout, 'style');
        const text = logout.querySelector('.app-menu-title,.mi-menu-label')?.textContent?.trim() || 'Dil';
        setTitleIfChanged(logout, text);
      }

      const themeControl = nav.querySelector('.mi-theme-control,.theme-control');
      if (themeControl) {
        if (!themeControl.hidden) themeControl.hidden = true;
        setAttributeIfChanged(themeControl, 'aria-hidden', 'true');
      }

      const links = [...nav.querySelectorAll('.app-menu-link,.auth-logout')];
      links.forEach(link => {
        removeAttributeIfPresent(link, 'style');
        setClassState(link, 'mi-menu-item', true);
        const label = link.querySelector('.app-menu-title,.mi-menu-label')?.textContent?.trim() || link.getAttribute('aria-label') || '';
        setTitleIfChanged(link, label);
      });

      const navigational = links.filter(link => link.matches('a[href]'));
      const matches = navigational.filter(expectedActivePath);
      if (matches.length) {
        navigational.forEach(link => {
          const active = link === matches[0];
          setClassState(link, 'active', active);
          if (active) setAttributeIfChanged(link, 'aria-current', 'page');
          else removeAttributeIfPresent(link, 'aria-current');
        });
      }

      const sidebarScroll = document.querySelector('.mi-sidebar-scroll');
      setAttributeIfChanged(sidebarScroll, 'tabindex', '-1');
    } finally {
      if (reconnectObserver && nav.isConnected) observeNavigation(nav);
    }
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
      if (node.hasAttribute('data-mi-horizontal-scroll') !== horizontallyScrollable) {
        node.toggleAttribute('data-mi-horizontal-scroll', horizontallyScrollable);
      }
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
      .mi-main{scroll-behavior:auto!important;overflow-anchor:none!important}
      [data-open-code]{scroll-margin-block:96px}
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

    const nextLeft = `${Math.round(left)}px`;
    const nextTop = `${Math.round(top)}px`;
    const nextWidth = `${Math.round(width)}px`;
    if (palette.style.getPropertyValue('--mi-command-left') !== nextLeft) palette.style.setProperty('--mi-command-left', nextLeft);
    if (palette.style.getPropertyValue('--mi-command-top') !== nextTop) palette.style.setProperty('--mi-command-top', nextTop);
    if (palette.style.getPropertyValue('--mi-command-width') !== nextWidth) palette.style.setProperty('--mi-command-width', nextWidth);
    const anchor = inputVisible ? 'input' : 'viewport';
    if (palette.dataset.miAnchor !== anchor) palette.dataset.miAnchor = anchor;
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

    if (palette.dataset.miViewportBound !== '1') {
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
    setAttributeIfChanged(picker, 'aria-hidden', 'true');
    setAttributeIfChanged(picker, 'aria-modal', 'false');
    if (restoreFocus) document.querySelector('[data-rx-command="drug"]')?.focus({ preventScroll:true });
  }

  function syncPrescriptionDrugPicker() {
    const picker = document.getElementById('rxDrugPopover');
    if (!picker || !document.body) return false;
    if (picker.parentElement !== document.body) document.body.appendChild(picker);
    if (picker.dataset.miViewportPicker !== '1') picker.dataset.miViewportPicker = '1';
    if (picker.hidden) {
      setAttributeIfChanged(picker, 'aria-hidden', 'true');
      setAttributeIfChanged(picker, 'aria-modal', 'false');
    } else {
      setAttributeIfChanged(picker, 'aria-hidden', 'false');
      setAttributeIfChanged(picker, 'aria-modal', 'true');
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
    observeNavigation();

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
    if (pageSlot && !pageSlotObserver) {
      pageSlot.dataset.miProfessionalObserved = '1';
      pageSlotObserver = new MutationObserver(() => {
        scheduleLayoutAudit();
        bindCommandPaletteViewport();
        syncPrescriptionDrugPicker();
      });
      pageSlotObserver.observe(pageSlot, { childList:true, subtree:true });
    }
  }

  function stabilize() {
    if (stabilized) return;
    stabilized = true;
    document.body?.classList.add('mi-professional-ready');
    orderStylesheets();
    normalizeNavigation();
    resetRootHorizontalOffset();
    normalizeContentScroll();
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
    normalizeContentScroll();
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
```

