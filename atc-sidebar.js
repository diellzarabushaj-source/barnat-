(() => {
  'use strict';

  const DATA_SRC = '/classification-data.js?v=atc-sidebar-v1';
  const SHARED_SRC = '/atc-shared.js?v=atc-sidebar-v1';
  const STYLE_SRC = '/atc-sidebar.css?v=atc-sidebar-v1';
  const ROOT_STORAGE_KEY = 'medindex_atc_root_open_v1';
  const GROUP_STORAGE_KEY = 'medindex_atc_group_open_v1';
  const MOBILE_BREAKPOINT = 1024;
  const ROOT_PANEL_ID = 'miAtcRootMenu';
  let initialized = false;
  let rootTrigger = null;
  let rootPanel = null;
  let openGroupCode = '';

  const clean = value => String(value ?? '').trim();
  const path = () => location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';

  function readStorage(key, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback; }
    catch { return fallback; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, String(value)); }
    catch {}
  }

  function loadScript(source, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[${marker}]`)
        || [...document.scripts].find(script => new URL(script.src || location.href, location.href).pathname === new URL(source, location.href).pathname);
      if (existing) {
        if (existing.dataset.loaded === 'true' || existing.readyState === 'complete') return resolve(existing);
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', reject, { once:true });
        setTimeout(() => resolve(existing), 0);
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.async = false;
      script.setAttribute(marker, '1');
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve(script);
      }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-mi-atc-sidebar-css],link[href*="atc-sidebar.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_SRC;
    link.dataset.miAtcSidebarCss = '1';
    const professional = document.querySelector('link[data-tailadmin-professional-css],link[href*="tailadmin-professional.css"]');
    if (professional?.parentNode) professional.parentNode.insertBefore(link, professional);
    else document.head.appendChild(link);
  }

  async function ensureAtcData() {
    if (!window.MEDINDEX_ATC_GROUPS || !window.MEDINDEX_ATC_SUBGROUPS) {
      await loadScript(DATA_SRC, 'data-mi-atc-classification-data');
    }
    if (!window.MedIndexATC) await loadScript(SHARED_SRC, 'data-mi-atc-shared');
    if (!window.MedIndexATC) throw new Error('Logjika e përbashkët ATC nuk u ngarkua.');
  }

  function currentAtcCode(detail) {
    const eventCode = clean(detail?.activeAtc);
    if (eventCode) return window.MedIndexATC.resolveCategoryCode(eventCode);
    const registryCode = window.MedIndexATC.readRegistryUrlState(location.href).atc;
    if (registryCode) return registryCode;
    if (path() === '/klasifikimi.html') return window.MedIndexATC.resolveCategoryCode(location.hash.slice(1));
    return '';
  }

  function chevronMarkup(className = '') {
    return `<span class="mi-atc-chevron ${className}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>`;
  }

  function groupMarkup(code, name, activeAtc) {
    const children = window.MedIndexATC.getChildren(code);
    const activeGroup = window.MedIndexATC.resolveGroupCode(activeAtc);
    const expanded = code === activeGroup || code === openGroupCode;
    const active = code === activeGroup;
    return `<div class="mi-atc-group${active ? ' is-active' : ''}" data-mi-atc-group="${code}">
      <button class="mi-atc-group-trigger" type="button" data-mi-atc-group-trigger="${code}" aria-expanded="${expanded}" aria-controls="miAtcGroup${code}">
        <span class="mi-atc-group-code">${code}</span>
        <span class="mi-atc-group-name">${escapeHtml(name)}</span>
        ${chevronMarkup()}
      </button>
      <div class="mi-atc-submenu" id="miAtcGroup${code}" data-mi-atc-submenu="${code}"${expanded ? '' : ' hidden'}>
        ${children.map(child => {
          const current = child.code === activeAtc;
          const href = window.MedIndexATC.registryUrl({ atc:child.code });
          return `<a class="mi-atc-subcategory-link${current ? ' is-active' : ''}" href="${href}" data-mi-atc-code="${child.code}"${current ? ' aria-current="page"' : ''}>
            <span class="mi-atc-subcategory-code">${child.code}</span>
            <span class="mi-atc-subcategory-name">${escapeHtml(child.name)}</span>
          </a>`;
        }).join('')}
      </div>
    </div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[character]);
  }

  function buildRootPanel(activeAtc) {
    const groups = Object.entries(window.MEDINDEX_ATC_GROUPS || {});
    return `<a class="mi-atc-all-link${path() === '/klasifikimi.html' && !activeAtc ? ' is-active' : ''}" href="/klasifikimi.html"${path() === '/klasifikimi.html' && !activeAtc ? ' aria-current="page"' : ''}>
      <span class="mi-atc-all-icon" aria-hidden="true">⌂</span>
      <span>Të gjitha kategoritë</span>
    </a>
    <div class="mi-atc-groups" role="list">
      ${groups.map(([code, name]) => groupMarkup(code, name, activeAtc)).join('')}
    </div>`;
  }

  function rootShouldOpen(activeAtc) {
    if (activeAtc || path() === '/klasifikimi.html') return true;
    return readStorage(ROOT_STORAGE_KEY, 'false') === 'true';
  }

  function setRootOpen(open, persist = true) {
    if (!rootTrigger || !rootPanel) return;
    const value = Boolean(open);
    rootTrigger.setAttribute('aria-expanded', String(value));
    rootPanel.hidden = !value;
    rootTrigger.closest('[data-mi-atc-menu]')?.classList.toggle('is-open', value);
    if (persist) writeStorage(ROOT_STORAGE_KEY, value);
  }

  function setGroupOpen(code, open, persist = true) {
    const target = clean(code);
    document.querySelectorAll('[data-mi-atc-group]').forEach(group => {
      const groupCode = group.dataset.miAtcGroup;
      const shouldOpen = Boolean(open && groupCode === target);
      group.classList.toggle('is-open', shouldOpen);
      group.querySelector('[data-mi-atc-group-trigger]')?.setAttribute('aria-expanded', String(shouldOpen));
      const submenu = group.querySelector('[data-mi-atc-submenu]');
      if (submenu) submenu.hidden = !shouldOpen;
    });
    openGroupCode = open ? target : '';
    if (persist) writeStorage(GROUP_STORAGE_KEY, openGroupCode);
  }

  function syncActiveState(detail) {
    if (!rootPanel) return;
    const activeAtc = currentAtcCode(detail);
    const activeGroup = window.MedIndexATC.resolveGroupCode(activeAtc);
    const menu = rootTrigger?.closest('[data-mi-atc-menu]');
    const classificationActive = path() === '/klasifikimi.html';

    rootTrigger?.classList.toggle('active', Boolean(activeAtc || classificationActive));
    if (activeAtc || classificationActive) setRootOpen(true, false);

    rootPanel.querySelectorAll('[data-mi-atc-code]').forEach(link => {
      const current = link.dataset.miAtcCode === activeAtc;
      link.classList.toggle('is-active', current);
      if (current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    rootPanel.querySelectorAll('[data-mi-atc-group]').forEach(group => {
      group.classList.toggle('is-active', group.dataset.miAtcGroup === activeGroup);
    });

    if (activeGroup) {
      setGroupOpen(activeGroup, true, false);
      requestAnimationFrame(() => {
        const activeLink = rootPanel.querySelector(`[data-mi-atc-code="${activeAtc}"]`);
        activeLink?.scrollIntoView?.({ block:'nearest', behavior:'auto' });
      });
    } else if (!openGroupCode) {
      const savedGroup = readStorage(GROUP_STORAGE_KEY, '');
      if (savedGroup && window.MEDINDEX_ATC_GROUPS?.[savedGroup]) setGroupOpen(savedGroup, true, false);
    }

    menu?.setAttribute('data-active-atc', activeAtc);
  }

  function installInteractions(menu) {
    rootTrigger.addEventListener('click', () => {
      if (document.body.classList.contains('mi-sidebar-collapsed') && innerWidth >= MOBILE_BREAKPOINT) {
        document.querySelector('[data-mi-sidebar-toggle]')?.click();
        setTimeout(() => setRootOpen(true), 180);
        return;
      }
      setRootOpen(rootTrigger.getAttribute('aria-expanded') !== 'true');
    });

    menu.addEventListener('click', event => {
      const groupTrigger = event.target.closest('[data-mi-atc-group-trigger]');
      if (groupTrigger) {
        const code = groupTrigger.dataset.miAtcGroupTrigger;
        const open = groupTrigger.getAttribute('aria-expanded') !== 'true';
        setGroupOpen(code, open);
        return;
      }

      const categoryLink = event.target.closest('[data-mi-atc-code]');
      if (categoryLink && innerWidth < MOBILE_BREAKPOINT) {
        document.body.classList.remove('mi-sidebar-open');
      }
    });

    menu.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const expandedGroup = menu.querySelector('[data-mi-atc-group-trigger][aria-expanded="true"]');
      if (expandedGroup) {
        event.preventDefault();
        setGroupOpen(expandedGroup.dataset.miAtcGroupTrigger, false);
        expandedGroup.focus();
        return;
      }
      if (rootTrigger.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        setRootOpen(false);
        rootTrigger.focus();
      }
    });
  }

  function enhanceNavigation() {
    const existing = document.querySelector('[data-medical-nav="classification"]');
    if (!existing) return false;
    if (document.querySelector('[data-mi-atc-menu]')) {
      syncActiveState();
      return true;
    }

    const activeAtc = currentAtcCode();
    openGroupCode = window.MedIndexATC.resolveGroupCode(activeAtc) || readStorage(GROUP_STORAGE_KEY, '');
    const icon = existing.querySelector('.mi-menu-icon')?.outerHTML || '<span class="app-menu-icon mi-menu-icon" aria-hidden="true">▦</span>';

    const menu = document.createElement('div');
    menu.className = 'mi-atc-menu';
    menu.dataset.miAtcMenu = '1';
    menu.innerHTML = `<button class="app-menu-link mi-menu-item mi-atc-root-trigger" type="button" data-medical-nav="classification" data-mi-atc-root-trigger aria-expanded="false" aria-controls="${ROOT_PANEL_ID}" aria-label="Klasifikimi">
      ${icon}
      <span class="app-menu-title mi-menu-label">Klasifikimi</span>
      ${chevronMarkup('mi-atc-root-chevron')}
    </button>
    <div class="mi-atc-root-panel" id="${ROOT_PANEL_ID}" data-mi-atc-root-panel hidden>
      ${buildRootPanel(activeAtc)}
    </div>`;

    existing.replaceWith(menu);
    rootTrigger = menu.querySelector('[data-mi-atc-root-trigger]');
    rootPanel = menu.querySelector('[data-mi-atc-root-panel]');
    installInteractions(menu);
    setRootOpen(rootShouldOpen(activeAtc), false);
    if (openGroupCode) setGroupOpen(openGroupCode, true, false);
    syncActiveState();
    document.documentElement.dataset.miAtcSidebar = 'nested-v1';
    return true;
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    try {
      ensureStylesheet();
      await ensureAtcData();
      if (!enhanceNavigation()) {
        const observer = new MutationObserver(() => {
          if (enhanceNavigation()) observer.disconnect();
        });
        observer.observe(document.body, { childList:true, subtree:true });
        setTimeout(() => observer.disconnect(), 12000);
      }
      window.addEventListener('medindex:registry-atc-state', event => syncActiveState(event.detail));
      window.addEventListener('popstate', () => syncActiveState());
      window.addEventListener('hashchange', () => syncActiveState());
      window.addEventListener('pageshow', () => syncActiveState());
    } catch (error) {
      initialized = false;
      document.documentElement.dataset.miAtcSidebarError = 'load';
      console.error('MedIndex ATC sidebar failed:', error);
    }
  }

  if (document.querySelector('.mi-app-shell')) init();
  else window.addEventListener('medindex:tailadmin-ready', init, { once:true });
})();