(() => {
  'use strict';

  const DATA_SRC = '/classification-data.js?v=atc-sidebar-v2';
  const SHARED_SRC = '/atc-shared.js?v=atc-sidebar-v2';
  const STYLE_SRC = '/atc-sidebar.css?v=atc-sidebar-v2';
  const COUNTS_ENDPOINT = '/api/atc-counts';
  const ROOT_STORAGE_KEY = 'medindex_atc_root_open_v1';
  const GROUP_STORAGE_KEY = 'medindex_atc_group_open_v1';
  const COUNT_CACHE_KEY = 'medindex_atc_counts_v1';
  const SCROLL_STORAGE_KEY = 'medindex_atc_sidebar_scroll_v1';
  const COUNT_CACHE_TTL = 5 * 60 * 1000;
  const MOBILE_BREAKPOINT = 1024;
  const ROOT_PANEL_ID = 'miAtcRootMenu';
  let initialized = false;
  let rootTrigger = null;
  let rootPanel = null;
  let openGroupCode = '';
  let countPayload = null;
  let scrollFrame = 0;

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

  function readSession(key, fallback = '') {
    try { return sessionStorage.getItem(key) ?? fallback; }
    catch { return fallback; }
  }

  function writeSession(key, value) {
    try { sessionStorage.setItem(key, String(value)); }
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
    return window.MedIndexATC.readRegistryUrlState(location.href).atc;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[character]);
  }

  function chevronMarkup(className = '') {
    return `<span class="mi-atc-chevron ${className}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>`;
  }

  function countMarkup(attribute, code) {
    return `<span class="mi-atc-count" ${attribute}="${code}" aria-hidden="true" hidden></span>`;
  }

  function groupMarkup(code, name, activeAtc) {
    const children = window.MedIndexATC.getChildren(code);
    const activeGroup = window.MedIndexATC.resolveGroupCode(activeAtc);
    const expanded = code === activeGroup || code === openGroupCode;
    const active = code === activeGroup;
    const label = `${code} — ${name}`;
    return `<div class="mi-atc-group${active ? ' is-active' : ''}" data-mi-atc-group="${code}">
      <button class="mi-atc-group-trigger" type="button" data-mi-atc-group-trigger="${code}" aria-expanded="${expanded}" aria-controls="miAtcGroup${code}" aria-label="${escapeHtml(label)}" data-mi-atc-base-label="${escapeHtml(label)}">
        <span class="mi-atc-group-code">${code}</span>
        <span class="mi-atc-group-name">${escapeHtml(name)}</span>
        ${countMarkup('data-mi-atc-group-count', code)}
        ${chevronMarkup()}
      </button>
      <div class="mi-atc-submenu" id="miAtcGroup${code}" data-mi-atc-submenu="${code}"${expanded ? '' : ' hidden'}>
        ${children.map(child => {
          const current = child.code === activeAtc;
          const href = window.MedIndexATC.registryUrl({ atc:child.code });
          return `<a class="mi-atc-subcategory-link${current ? ' is-active' : ''}" href="${href}" data-mi-atc-code="${child.code}" aria-label="${escapeHtml(child.label)}" data-mi-atc-base-label="${escapeHtml(child.label)}"${current ? ' aria-current="page"' : ''}>
            <span class="mi-atc-subcategory-code">${child.code}</span>
            <span class="mi-atc-subcategory-name">${escapeHtml(child.name)}</span>
            ${countMarkup('data-mi-atc-category-count', child.code)}
          </a>`;
        }).join('')}
      </div>
    </div>`;
  }

  function buildRootPanel(activeAtc) {
    const groups = Object.entries(window.MEDINDEX_ATC_GROUPS || {});
    return `<a class="mi-atc-all-link" href="/index.html" data-mi-atc-all-link aria-label="Të gjitha kategoritë" data-mi-atc-base-label="Të gjitha kategoritë">
      <span class="mi-atc-all-icon" aria-hidden="true">⌂</span>
      <span class="mi-atc-all-label">Të gjitha kategoritë</span>
      ${countMarkup('data-mi-atc-total-count', 'all')}
    </a>
    <div class="mi-atc-groups" role="list">
      ${groups.map(([code, name]) => groupMarkup(code, name, activeAtc)).join('')}
    </div>`;
  }

  function rootShouldOpen(activeAtc) {
    if (activeAtc) return true;
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

  function sidebarScrollHost() {
    return rootTrigger?.closest('.mi-sidebar-scroll') || document.querySelector('.mi-sidebar-scroll');
  }

  function saveSidebarScroll() {
    const host = sidebarScrollHost();
    if (host) writeSession(SCROLL_STORAGE_KEY, Math.max(0, Math.round(host.scrollTop)));
  }

  function restoreSidebarScroll() {
    const host = sidebarScrollHost();
    const saved = Number(readSession(SCROLL_STORAGE_KEY, ''));
    if (!host || !Number.isFinite(saved) || saved < 0) return false;
    requestAnimationFrame(() => {
      host.scrollTop = saved;
      requestAnimationFrame(ensureActiveVisible);
    });
    return true;
  }

  function ensureActiveVisible() {
    const host = sidebarScrollHost();
    const active = rootPanel?.querySelector('[data-mi-atc-code].is-active');
    if (!host || !active) return;
    const hostRect = host.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const visible = activeRect.top >= hostRect.top + 8 && activeRect.bottom <= hostRect.bottom - 8;
    if (!visible) active.scrollIntoView?.({ block:'nearest', behavior:'auto' });
  }

  function installScrollPersistence(menu) {
    const host = sidebarScrollHost();
    if (host && host.dataset.miAtcScrollPersistence !== '1') {
      host.dataset.miAtcScrollPersistence = '1';
      host.addEventListener('scroll', () => {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = requestAnimationFrame(saveSidebarScroll);
      }, { passive:true });
    }
    menu.addEventListener('click', event => {
      if (event.target.closest('[data-mi-atc-code],[data-mi-atc-all-link]')) saveSidebarScroll();
    });
    window.addEventListener('pagehide', saveSidebarScroll, { passive:true });
  }

  function formatCount(value) {
    const number = Math.max(0, Number(value) || 0);
    try { return new Intl.NumberFormat('sq-AL').format(number); }
    catch { return String(number); }
  }

  function setCountNode(node, value, noun = 'barna') {
    if (!node) return;
    const number = Math.max(0, Number(value) || 0);
    node.textContent = formatCount(number);
    node.hidden = false;
    node.title = `${formatCount(number)} ${noun}`;
    const owner = node.closest('a,button');
    if (owner) {
      const base = owner.dataset.miAtcBaseLabel || clean(owner.getAttribute('aria-label'));
      if (base) owner.setAttribute('aria-label', `${base}, ${formatCount(number)} ${noun}`);
    }
  }

  function applyCounts(payload) {
    if (!payload || typeof payload !== 'object' || !payload.counts) return;
    countPayload = payload;
    let knownTotal = 0;

    rootPanel?.querySelectorAll('[data-mi-atc-category-count]').forEach(node => {
      const code = node.dataset.miAtcCategoryCount;
      const value = Number(payload.counts[code] || 0);
      knownTotal += value;
      setCountNode(node, value);
    });

    rootPanel?.querySelectorAll('[data-mi-atc-group-count]').forEach(node => {
      const code = node.dataset.miAtcGroupCount;
      const value = window.MedIndexATC.getChildren(code)
        .reduce((sum, child) => sum + Number(payload.counts[child.code] || 0), 0);
      setCountNode(node, value);
    });

    setCountNode(rootPanel?.querySelector('[data-mi-atc-total-count]'), knownTotal);
    document.documentElement.dataset.miAtcCounts = 'ready';
  }

  function updateActiveCount(detail) {
    const code = window.MedIndexATC.resolveCategoryCode(detail?.activeAtc);
    const total = Number(detail?.categoryTotal);
    if (!code || !Number.isFinite(total)) return;
    setCountNode(rootPanel?.querySelector(`[data-mi-atc-category-count="${code}"]`), total);
    if (countPayload?.counts) countPayload.counts[code] = total;
  }

  function readCountCache() {
    try {
      const cached = JSON.parse(readSession(COUNT_CACHE_KEY, 'null'));
      if (!cached?.payload || !Number.isFinite(cached.savedAt)) return null;
      if (Date.now() - cached.savedAt > COUNT_CACHE_TTL) return null;
      return cached.payload;
    } catch { return null; }
  }

  function writeCountCache(payload) {
    try { writeSession(COUNT_CACHE_KEY, JSON.stringify({ savedAt:Date.now(), payload })); }
    catch {}
  }

  async function loadCounts() {
    const cached = readCountCache();
    if (cached) {
      applyCounts(cached);
      return;
    }
    document.documentElement.dataset.miAtcCounts = 'loading';
    try {
      const response = await fetch(COUNTS_ENDPOINT, {
        credentials:'same-origin',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) throw new Error(`ATC counts ${response.status}`);
      const payload = await response.json();
      if (!payload?.ok || !payload.counts) throw new Error('ATC counts payload');
      applyCounts(payload);
      writeCountCache(payload);
    } catch (error) {
      document.documentElement.dataset.miAtcCounts = 'unavailable';
      console.warn('MedIndex ATC counts unavailable:', error);
    }
  }

  function syncActiveState(detail) {
    if (!rootPanel) return;
    const activeAtc = currentAtcCode(detail);
    const activeGroup = window.MedIndexATC.resolveGroupCode(activeAtc);
    const menu = rootTrigger?.closest('[data-mi-atc-menu]');

    rootTrigger?.classList.toggle('active', Boolean(activeAtc));
    if (activeAtc) setRootOpen(true, false);

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
      requestAnimationFrame(ensureActiveVisible);
    } else if (!openGroupCode) {
      const savedGroup = readStorage(GROUP_STORAGE_KEY, '');
      if (savedGroup && window.MEDINDEX_ATC_GROUPS?.[savedGroup]) setGroupOpen(savedGroup, true, false);
    }

    updateActiveCount(detail);
    menu?.setAttribute('data-active-atc', activeAtc);
  }

  function visibleMenuItems(menu) {
    return [...menu.querySelectorAll('button,a')].filter(item => {
      if (item.disabled || item.hidden) return false;
      if (item.closest('[hidden]')) return false;
      return item.getClientRects().length > 0;
    });
  }

  function closeMobileSidebar() {
    if (innerWidth >= MOBILE_BREAKPOINT) return;
    document.body.classList.remove('mi-sidebar-open');
    document.querySelector('[data-mi-sidebar-toggle]')?.setAttribute('aria-expanded', 'false');
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
        requestAnimationFrame(() => groupTrigger.scrollIntoView?.({ block:'nearest', behavior:'auto' }));
        return;
      }

      const destination = event.target.closest('[data-mi-atc-code],[data-mi-atc-all-link]');
      if (destination) closeMobileSidebar();
    });

    menu.addEventListener('keydown', event => {
      const target = event.target.closest('button,a');
      if (!target) return;

      if (event.key === 'Escape') {
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
        return;
      }

      if (event.key === 'ArrowRight' && target.matches('[data-mi-atc-group-trigger]')) {
        event.preventDefault();
        setGroupOpen(target.dataset.miAtcGroupTrigger, true);
        target.setAttribute('aria-expanded', 'true');
        menu.querySelector(`[data-mi-atc-submenu="${target.dataset.miAtcGroupTrigger}"] a`)?.focus();
        return;
      }

      if (event.key === 'ArrowLeft') {
        const group = target.closest('[data-mi-atc-group]');
        const trigger = group?.querySelector('[data-mi-atc-group-trigger]');
        if (group && trigger?.getAttribute('aria-expanded') === 'true') {
          event.preventDefault();
          setGroupOpen(group.dataset.miAtcGroup, false);
          trigger.focus();
          return;
        }
      }

      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = visibleMenuItems(menu);
      const current = items.indexOf(target);
      if (current < 0 || items.length === 0) return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowDown') next = Math.min(items.length - 1, current + 1);
      if (event.key === 'ArrowUp') next = Math.max(0, current - 1);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      items[next]?.focus();
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
    installScrollPersistence(menu);
    setRootOpen(rootShouldOpen(activeAtc), false);
    if (openGroupCode) setGroupOpen(openGroupCode, true, false);
    syncActiveState();
    restoreSidebarScroll();
    loadCounts();
    document.documentElement.dataset.miAtcSidebar = 'nested-v2';
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
      window.addEventListener('pageshow', () => {
        syncActiveState();
        restoreSidebarScroll();
      });
    } catch (error) {
      initialized = false;
      document.documentElement.dataset.miAtcSidebarError = 'load';
      console.error('MedIndex ATC sidebar failed:', error);
    }
  }

  if (document.querySelector('.mi-app-shell')) init();
  else window.addEventListener('medindex:tailadmin-ready', init, { once:true });
})();
