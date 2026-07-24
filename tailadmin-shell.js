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
    '/dozologjia.html': ['Dozologjia', 'Skema të verifikuara për të rritur dhe pediatri'],
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
    const app = document.createElement('div');
    app.className = 'mi-app-shell';
    app.innerHTML = `
      <div class="mi-mobile-overlay" data-mi-sidebar-overlay></div>
      <aside class="mi-sidebar" id="miSidebar" aria-label="MedIndex">
        <div class="mi-sidebar-header">
          <a class="mi-brand" href="/index.html" aria-label="MedIndex — Barnat">
            <span class="mi-brand-mark">M<span>+</span></span>
            <span class="mi-brand-copy"><strong>MedIndex</strong><small>Clinical workspace</small></span>
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
            <button class="mi-icon-button mi-sidebar-toggle" type="button" data-mi-sidebar-toggle aria-label="Hap ose mbyll menynë">${ICONS.menu}</button>
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
              <div><div class="mi-breadcrumb"><a href="/index.html">MedIndex</a><span>/</span><strong>${esc(title)}</strong></div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
              <div class="mi-heading-badge"><span class="mi-status-dot"></span>Burime të kontrolluara</div>
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
    const collapsed = readBoolean(COLLAPSE_KEY, false);
    body.classList.toggle('mi-sidebar-collapsed', collapsed && innerWidth >= MOBILE_BREAKPOINT);

    const closeMobile = () => body.classList.remove('mi-sidebar-open');
    app.querySelectorAll('[data-mi-sidebar-toggle]').forEach(button => button.addEventListener('click', () => {
      if (innerWidth < MOBILE_BREAKPOINT) body.classList.toggle('mi-sidebar-open');
      else {
        const next = !body.classList.contains('mi-sidebar-collapsed');
        body.classList.toggle('mi-sidebar-collapsed', next);
        try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch {}
      }
    }));
    app.querySelector('[data-mi-sidebar-close]')?.addEventListener('click', closeMobile);
    app.querySelector('[data-mi-sidebar-overlay]')?.addEventListener('click', closeMobile);
    app.querySelectorAll('.mi-menu-item[href]').forEach(link => link.addEventListener('click', closeMobile));

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
      } else if (event.key === 'Escape') {
        closeMobile();
      }
    });

    addEventListener('resize', () => {
      if (innerWidth >= MOBILE_BREAKPOINT) closeMobile();
    }, { passive: true });

    window.addEventListener('storage', event => {
      if (event.key === 'regjistriBarnave_favoritet_v1') {
        const badge = document.getElementById('favoriteNavCount');
        if (badge) badge.textContent = String(favoriteCount());
      }
      if (event.key === THEME_KEY && ['dark', 'light'].includes(event.newValue)) applyTheme(event.newValue, false);
    });
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
    const headObserver = new MutationObserver(ensureStylesheetLast);
    headObserver.observe(document.head, { childList: true });
    setTimeout(() => headObserver.disconnect(), 12000);

    document.querySelector('.skip-link')?.setAttribute('href', '#miMain');
    window.dispatchEvent(new CustomEvent('medindex:tailadmin-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
