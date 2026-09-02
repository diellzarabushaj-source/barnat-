(() => {
  'use strict';

  const RUNTIME_VERSION = 'sidebar-taxonomy-v6';
  if (window.__DRX_SIDEBAR_TAXONOMY_RUNTIME__ === RUNTIME_VERSION) {
    window.DRxSidebarCollapse?.sync?.();
    return;
  }
  window.__DRX_SIDEBAR_TAXONOMY_RUNTIME__ = RUNTIME_VERSION;

  const ICD_STORAGE_KEY = 'drx_icd_sidebar_open_v1';
  const SCROLL_KEY = 'drx_sidebar_scroll_v2';
  const ICD_CACHE_KEY = 'drx_icd_sidebar_nav_v1';
  const ICD_CACHE_TTL = 10 * 60 * 1000;
  const ICD_API = '/api/icd?view=nav';
  const ATC_DATA_SRC = '/classification-data.js?v=atc-catalog-v2';
  const CANONICAL_WORKER_URL = '/sw.js?v=drx-workspace-v8';
  const PERSONAL_SUMMARY_API = '/api/user-library?view=summary';
  const PERSONAL_COUNT_CACHE_KEY = 'drx_personal_sidebar_counts_v1';
  const PERSONAL_COUNT_TTL = 30 * 1000;
  const SIDEBAR_COLLAPSE_KEY = 'drx_sidebar_collapsed_v2';
  const SIDEBAR_DESKTOP_QUERY = '(min-width:1024px)';
  const SIDEBAR_MARK_SRC = '/brand/drx-mark-on-dark.svg';
  const desktopSidebarQuery = window.matchMedia(SIDEBAR_DESKTOP_QUERY);

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const CHEVRON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';

  const roman = number => {
    const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let value = Math.max(1, Number(number) || 1);
    let out = '';
    for (const [n, glyph] of map) while (value >= n) { out += glyph; value -= n; }
    return out;
  };

  function currentPath() {
    return location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  }

  function currentIcdCode() {
    if (currentPath() !== '/icd.html') return '';
    return decodeURIComponent(location.hash.slice(1) || '').trim();
  }

  function currentAtc() {
    if (currentPath() !== '/klasifikimi.html') return { group:'', sub:'' };
    const raw = decodeURIComponent(location.hash.slice(1) || '')
      || new URLSearchParams(location.search).get('atc') || '';
    const code = clean(raw).toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z]\d{2}/.test(code)) return { group:code.charAt(0), sub:code.slice(0, 3) };
    if (/^[A-Z]$/.test(code)) return { group:code, sub:'' };
    return { group:'', sub:'' };
  }

  function readIcdCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(ICD_CACHE_KEY) || 'null');
      if (!cached?.savedAt || !Array.isArray(cached.chapters)) return null;
      if (Date.now() - cached.savedAt > ICD_CACHE_TTL) return null;
      return cached.chapters;
    } catch { return null; }
  }

  function writeIcdCache(chapters) {
    try { sessionStorage.setItem(ICD_CACHE_KEY, JSON.stringify({ savedAt:Date.now(), chapters })); }
    catch {}
  }

  function titleOf(node) {
    return clean(node?.displayTitle) || clean(node?.albanianDraft) || clean(node?.englishTitle) || clean(node?.code) || '—';
  }

  function activeIcdChapter(chapters) {
    const code = currentIcdCode();
    if (!code) return '';
    const exact = chapters.find(node => clean(node.code) === code);
    if (exact) return clean(exact.code);
    const byChapter = chapters.find(node => clean(node.code) === code.charAt(0));
    return clean(byChapter?.code);
  }

  function saveScroll(nav) {
    try { sessionStorage.setItem(SCROLL_KEY, String(Math.max(0, Math.round(nav.scrollTop || 0)))); }
    catch {}
  }

  function restoreScroll(nav) {
    try {
      const value = Number(sessionStorage.getItem(SCROLL_KEY));
      if (Number.isFinite(value) && value >= 0) requestAnimationFrame(() => { nav.scrollTop = value; });
    } catch {}
  }

  function canonicalize(nav) {
    const labelClinical = [...nav.querySelectorAll('.nav-label')].find(node => /klinike/i.test(node.textContent || ''));
    const labelWork = [...nav.querySelectorAll('.nav-label')].find(node => /puna ime/i.test(node.textContent || ''));
    const find = href => nav.querySelector(`a.nav-item[href="${href}"]`) || nav.querySelector(`a[href="${href}"]`);
    const atc = nav.querySelector('#atcNavGroup');
    const icd = nav.querySelector('#icdNavGroup') || find('/icd.html');
    const clinical = [find('/index.html'), atc, icd, find('/dozologjia.html'), find('/protokollet.html'), find('/urgjencat.html')].filter(Boolean);
    const work = [find('/index.html#favorites'), find('/index.html#notes'), find('/recetat.html'), find('/analizat.html'), find('/medical-hub.html')].filter(Boolean);

    if (labelClinical) {
      let cursor = labelClinical;
      for (const node of clinical) { cursor.after(node); cursor = node; }
    }
    if (labelWork) {
      let cursor = labelWork;
      for (const node of work) { cursor.after(node); cursor = node; }
    }
  }

  function readPersonalCountCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(PERSONAL_COUNT_CACHE_KEY) || 'null');
      if (!cached?.savedAt || !cached?.counts) return null;
      if (Date.now() - cached.savedAt > PERSONAL_COUNT_TTL) return null;
      return cached.counts;
    } catch { return null; }
  }

  function writePersonalCountCache(counts) {
    try { sessionStorage.setItem(PERSONAL_COUNT_CACHE_KEY, JSON.stringify({ savedAt:Date.now(), counts })); }
    catch {}
  }

  function applyPersonalCounts(nav, counts = {}) {
    const pairs = [
      ['favorites', Number(counts.favorites) || 0],
      ['notes', Number(counts.notes) || 0],
    ];
    pairs.forEach(([view, count]) => {
      const link = nav.querySelector(`[data-personal-nav="${view}"]`);
      const badge = link?.querySelector('.nav-count');
      if (!badge) return;
      badge.textContent = String(Math.max(0, count));
      badge.hidden = count <= 0;
      badge.setAttribute('aria-label', `${Math.max(0, count)} ${view === 'favorites' ? 'favoritë' : 'shënime'}`);
    });
  }

  function countsFromPersonalSnapshot(snapshot = {}) {
    const favorites = Array.isArray(snapshot.favorites)
      ? snapshot.favorites.filter(item => ['product','drug'].includes(clean(item?.entityType)) && clean(item?.entityKey)).length
      : 0;
    const notes = Array.isArray(snapshot.notes)
      ? snapshot.notes.filter(item => item?.entityType === 'product' && clean(item?.entityKey)).length
      : 0;
    return { favorites, notes };
  }

  function adoptPersonalSnapshotCounts(nav, snapshot) {
    const counts = countsFromPersonalSnapshot(snapshot);
    applyPersonalCounts(nav, counts);
    writePersonalCountCache(counts);
  }

  async function syncPersonalCounts(nav, { force = false } = {}) {
    if (!nav) return;
    const cached = readPersonalCountCache();
    if (cached && !force) {
      applyPersonalCounts(nav, cached);
      return;
    }
    try {
      const response = await fetch(PERSONAL_SUMMARY_API, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      });
      if (response.status === 401 || response.status === 403) return;
      if (!response.ok) throw new Error(`Personal summary ${response.status}`);
      const payload = await response.json();
      const counts = {
        favorites:Math.max(0, Number(payload?.counts?.favorites) || 0),
        notes:Math.max(0, Number(payload?.counts?.notes) || 0),
      };
      applyPersonalCounts(nav, counts);
      writePersonalCountCache(counts);
      window.dispatchEvent(new CustomEvent('drx:personal-summary',{ detail:counts }));
    } catch (error) {
      if (!cached) console.warn('Personal sidebar counts unavailable:', error);
    }
  }

  function loadAtcData() {
    if (window.MEDINDEX_ATC_GROUPS && window.MEDINDEX_ATC_SUBGROUPS) return Promise.resolve();
    const existing = document.querySelector('script[data-drx-atc-sidebar-data]');
    if (existing) {
      return new Promise(resolve => {
        if (window.MEDINDEX_ATC_GROUPS && window.MEDINDEX_ATC_SUBGROUPS) return resolve();
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', resolve, { once:true });
      });
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = ATC_DATA_SRC;
      script.defer = true;
      script.dataset.drxAtcSidebarData = '1';
      script.addEventListener('load', resolve, { once:true });
      script.addEventListener('error', resolve, { once:true });
      document.head.appendChild(script);
    });
  }

  function atcGroups() {
    return window.MEDINDEX_ATC_GROUPS && typeof window.MEDINDEX_ATC_GROUPS === 'object'
      ? window.MEDINDEX_ATC_GROUPS : {};
  }

  function atcSubgroups() {
    return window.MEDINDEX_ATC_SUBGROUPS && typeof window.MEDINDEX_ATC_SUBGROUPS === 'object'
      ? window.MEDINDEX_ATC_SUBGROUPS : {};
  }

  function subgroupsOf(groupCode) {
    return Object.entries(atcSubgroups())
      .filter(([code]) => code.charAt(0) === groupCode && code.length === 3)
      .sort(([left],[right]) => left.localeCompare(right, 'sq'));
  }

  function navigateAtc(code) {
    const target = `/klasifikimi.html#${encodeURIComponent(code)}`;
    if (currentPath() === '/klasifikimi.html') {
      location.hash = encodeURIComponent(code);
      return;
    }
    location.href = target;
  }

  function syncAtc(nav = document.querySelector('.sidebar .nav-stack')) {
    if (!nav) return;
    const { group, sub } = currentAtc();
    const outer = nav.querySelector('#atcNavGroup');
    if (outer && currentPath() === '/klasifikimi.html') outer.open = true;

    nav.querySelectorAll('[data-atc-group]').forEach(summary => {
      const current = summary.dataset.atcGroup === group && !sub;
      if (current) summary.setAttribute('aria-current', 'true');
      else summary.removeAttribute('aria-current');
    });
    nav.querySelectorAll('[data-atc-sub]').forEach(link => {
      if (link.dataset.atcSub === sub) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });

    const all = nav.querySelector('.atc-group-link.is-all');
    if (all) {
      if (currentPath() === '/klasifikimi.html' && !group) all.setAttribute('aria-current', 'true');
      else all.removeAttribute('aria-current');
    }

    if (currentPath() === '/klasifikimi.html' && group) {
      nav.querySelectorAll('[data-atc-details]').forEach(details => {
        details.open = details.dataset.atcDetails === group;
      });
    }
  }

  async function enhanceAtc(nav) {
    const outer = nav.querySelector('#atcNavGroup');
    const list = outer?.querySelector('.atc-group-list');
    if (!outer || !list) return;

    await loadAtcData();
    const entries = Object.entries(atcGroups());
    if (!entries.length) return;

    const { group, sub } = currentAtc();
    list.innerHTML = `
      <a class="atc-group-link is-all" href="/klasifikimi.html"${currentPath() === '/klasifikimi.html' && !group ? ' aria-current="true"' : ''}>
        <span class="atc-group-code">${entries.length}</span>
        <span class="atc-group-name">Të gjitha grupet</span>
      </a>
      ${entries.map(([code, name]) => {
        const children = subgroupsOf(code);
        const current = code === group;
        return `<details class="atc-group" data-atc-details="${esc(code)}"${current ? ' open' : ''}>
          <summary class="atc-group-link" data-atc-group="${esc(code)}"${current && !sub ? ' aria-current="true"' : ''}>
            <span class="atc-group-code">${esc(code)}</span>
            <span class="atc-group-name">${esc(name)}</span>
            <span class="atc-group-caret" aria-hidden="true">${CHEVRON}</span>
          </summary>
          <div class="atc-sub-list">
            ${children.map(([subCode, subName]) => `<a class="atc-sub-link" href="/klasifikimi.html#${encodeURIComponent(subCode)}" data-atc-sub="${esc(subCode)}"${subCode === sub ? ' aria-current="true"' : ''} title="${esc(subName)}"><span class="atc-sub-code">${esc(subCode)}</span><span class="atc-sub-name">${esc(subName)}</span></a>`).join('')}
          </div>
        </details>`;
      }).join('')}`;

    list.querySelectorAll('[data-atc-group]').forEach(summary => {
      summary.addEventListener('click', event => {
        const details = summary.closest('[data-atc-details]');
        const code = clean(summary.dataset.atcGroup);
        const active = currentAtc();
        if (!details || !code) return;

        if (details.open && active.group === code) return;

        event.preventDefault();
        list.querySelectorAll('[data-atc-details]').forEach(other => {
          if (other !== details) other.open = false;
        });
        details.open = true;
        navigateAtc(code);
      });
    });

    list.addEventListener('toggle', event => {
      const details = event.target.closest?.('[data-atc-details]');
      if (!details?.open) return;
      list.querySelectorAll('[data-atc-details]').forEach(other => {
        if (other !== details) other.open = false;
      });
    }, true);

    if (currentPath() === '/klasifikimi.html') outer.open = true;
    syncAtc(nav);
    document.documentElement.dataset.drxAtcSidebar = 'ready';
  }

  function replaceIcdLink(nav) {
    const existingGroup = nav.querySelector('#icdNavGroup');
    if (existingGroup) return existingGroup;

    const link = nav.querySelector('a.nav-item[href="/icd.html"]');
    if (!link) return null;

    const icon = link.querySelector('.nav-icon')?.outerHTML || '<span class="nav-icon" aria-hidden="true">10</span>';
    const details = document.createElement('details');
    details.className = 'nav-group';
    details.id = 'icdNavGroup';
    details.dataset.taxonomy = 'icd';
    details.innerHTML = `
      <summary class="nav-item nav-summary">
        ${icon}
        <span>ICD‑10</span>
        <span class="nav-summary-chevron" aria-hidden="true">${CHEVRON}</span>
      </summary>
      <div class="atc-group-list" data-icd-chapter-list>
        <a class="atc-group-link is-all" href="/icd.html">
          <span class="atc-group-code">22</span>
          <span class="atc-group-name">Të gjithë kapitujt</span>
        </a>
        <span class="atc-group-link" aria-hidden="true">
          <span class="atc-group-code">…</span>
          <span class="atc-group-name">Duke ngarkuar ICD‑10…</span>
        </span>
      </div>`;

    if (currentPath() === '/icd.html') details.open = true;
    else {
      try { details.open = localStorage.getItem(ICD_STORAGE_KEY) === 'true'; }
      catch {}
    }

    link.replaceWith(details);
    details.addEventListener('toggle', () => {
      try { localStorage.setItem(ICD_STORAGE_KEY, String(details.open)); }
      catch {}
    });
    return details;
  }

  function renderIcd(details, chapters) {
    const list = details?.querySelector('[data-icd-chapter-list]');
    if (!list) return;
    const active = activeIcdChapter(chapters);
    const rootActive = currentPath() === '/icd.html' && !currentIcdCode();

    details.querySelector('summary')?.classList.toggle('is-active', currentPath() === '/icd.html');
    list.innerHTML = `
      <a class="atc-group-link is-all" href="/icd.html"${rootActive ? ' aria-current="true"' : ''}>
        <span class="atc-group-code">${chapters.length || 22}</span>
        <span class="atc-group-name">Të gjithë kapitujt</span>
      </a>
      ${chapters.map((node, index) => {
        const code = clean(node.code);
        const current = code === active;
        const count = Math.max(0, Number(node.childCount) || 0);
        const label = titleOf(node);
        return `<a class="atc-group-link" href="/icd.html#${encodeURIComponent(code)}" data-icd-chapter="${esc(code)}"${current ? ' aria-current="true"' : ''} title="${esc(label)}${count ? ` · ${count} blloqe` : ''}">
          <span class="atc-group-code">${roman(index + 1)}</span>
          <span class="atc-group-name">${esc(label)}</span>
        </a>`;
      }).join('')}`;

    const activeLink = list.querySelector('[aria-current="true"]');
    if (activeLink) requestAnimationFrame(() => activeLink.scrollIntoView({ block:'nearest' }));
  }

  async function loadIcd(details) {
    const cached = readIcdCache();
    if (cached) renderIcd(details, cached);
    try {
      const response = await fetch(ICD_API, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) throw new Error(`ICD nav ${response.status}`);
      const payload = await response.json();
      const chapters = Array.isArray(payload?.data?.chapters) ? payload.data.chapters : [];
      if (!chapters.length) throw new Error('ICD nav empty');
      writeIcdCache(chapters);
      renderIcd(details, chapters);
      document.documentElement.dataset.drxIcdSidebar = 'ready';
    } catch (error) {
      if (!cached) {
        const list = details?.querySelector('[data-icd-chapter-list]');
        if (list) list.innerHTML = '<a class="atc-group-link is-all" href="/icd.html"><span class="atc-group-code">10</span><span class="atc-group-name">Hap ICD‑10</span></a>';
      }
      document.documentElement.dataset.drxIcdSidebar = 'unavailable';
      console.warn('ICD sidebar unavailable:', error);
    }
  }

  function sidebarCollapsed() {
    return document.documentElement.classList.contains('drx-sidebar-collapsed');
  }

  function readSidebarCollapsePreference() {
    try { return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'; }
    catch { return false; }
  }

  function writeSidebarCollapsePreference(collapsed) {
    try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0'); }
    catch {}
  }

  function sidebarLabel(item) {
    if (!item) return '';
    const explicit = clean(item.getAttribute?.('aria-label'));
    if (explicit && !/^(hap|mbyll|minimizo|zgjero)/i.test(explicit)) return explicit;
    const copy = [...(item.children || [])].find(node =>
      node.tagName === 'SPAN'
      && !node.classList.contains('nav-icon')
      && !node.classList.contains('nav-summary-chevron')
      && !node.classList.contains('nav-count')
    );
    return clean(copy?.textContent || item.textContent).replace(/\s+/g, ' ');
  }

  function syncSidebarLabels(collapsed = sidebarCollapsed()) {
    document.querySelectorAll('.sidebar .nav-item, .sidebar .nav-summary, .sidebar .drx-user-card, .sidebar .logout-button')
      .forEach(item => {
        if (!item.dataset.sidebarLabel) item.dataset.sidebarLabel = sidebarLabel(item);
        const label = clean(item.dataset.sidebarLabel);
        if (!label) return;
        if (collapsed) {
          if (!item.hasAttribute('aria-label')) {
            item.setAttribute('aria-label', label);
            item.dataset.sidebarManagedAria = '1';
          }
          item.title = label;
          item.dataset.sidebarManagedTitle = '1';
        } else {
          if (item.dataset.sidebarManagedTitle === '1') {
            item.removeAttribute('title');
            delete item.dataset.sidebarManagedTitle;
          }
          if (item.dataset.sidebarManagedAria === '1') {
            item.removeAttribute('aria-label');
            delete item.dataset.sidebarManagedAria;
          }
        }
      });
  }

  function rememberOpenSidebarGroups() {
    document.querySelectorAll('.sidebar details.nav-group[open]').forEach(group => {
      group.dataset.sidebarWasOpen = '1';
      group.open = false;
    });
  }

  function restoreOpenSidebarGroups() {
    document.querySelectorAll('.sidebar details.nav-group[data-sidebar-was-open="1"]').forEach(group => {
      group.open = true;
      delete group.dataset.sidebarWasOpen;
    });
  }

  function ensureSidebarCollapseControls() {
    const sidebar = document.querySelector('.sidebar');
    const head = sidebar?.querySelector('.sidebar-head');
    const brand = head?.querySelector('.brand');
    if (!sidebar || !head || !brand) return null;

    const fullLogo = brand.querySelector('img:not(.brand-mark)');
    if (fullLogo) fullLogo.classList.add('brand-full');

    let mark = brand.querySelector('.brand-mark');
    if (!mark) {
      mark = document.createElement('img');
      mark.className = 'brand-mark';
      mark.src = SIDEBAR_MARK_SRC;
      mark.alt = '';
      mark.width = 30;
      mark.height = 30;
      mark.decoding = 'async';
      mark.setAttribute('aria-hidden', 'true');
      brand.append(mark);
    }

    let button = head.querySelector('#sidebarCollapse, .sidebar-collapse');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'sidebarCollapse';
      button.className = 'sidebar-collapse';
      button.setAttribute('aria-controls', sidebar.id || 'sidebar');
      button.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>';
      head.append(button);
    }
    if (!sidebar.id) sidebar.id = 'sidebar';
    button.setAttribute('aria-controls', sidebar.id);
    return button;
  }

  function setSidebarCollapsed(collapsed, { persist = true } = {}) {
    const next = Boolean(collapsed && desktopSidebarQuery.matches);
    const root = document.documentElement;
    const sidebar = document.querySelector('.sidebar');
    const button = ensureSidebarCollapseControls();
    const changed = sidebarCollapsed() !== next;

    root.classList.toggle('drx-sidebar-collapsed', next);
    sidebar?.classList.toggle('is-collapsed', next);
    sidebar?.setAttribute('data-collapsed', String(next));

    if (button) {
      button.setAttribute('aria-pressed', String(next));
      button.setAttribute('aria-expanded', String(!next));
      button.setAttribute('aria-label', next ? 'Zgjero menynë' : 'Minimizo menynë');
      button.title = next ? 'Zgjero menynë' : 'Minimizo menynë';
    }

    if (changed) {
      if (next) rememberOpenSidebarGroups();
      else restoreOpenSidebarGroups();
    }

    syncSidebarLabels(next);
    if (persist && desktopSidebarQuery.matches) writeSidebarCollapsePreference(next);
    if (changed) {
      window.dispatchEvent(new CustomEvent('drx:sidebar-collapse', { detail:{ collapsed:next } }));
    }
    return next;
  }

  function toggleSidebarCollapsed() {
    if (!desktopSidebarQuery.matches) return false;
    return setSidebarCollapsed(!sidebarCollapsed());
  }

  function bindCollapsedGroupExpansion() {
    document.querySelectorAll('.sidebar .nav-group > .nav-summary').forEach(summary => {
      if (summary.dataset.sidebarCollapseBound === 'shared') return;
      summary.dataset.sidebarCollapseBound = 'shared';
      summary.addEventListener('click', event => {
        if (!desktopSidebarQuery.matches || !sidebarCollapsed()) return;
        event.preventDefault();
        const group = summary.closest('details.nav-group');
        setSidebarCollapsed(false);
        requestAnimationFrame(() => {
          if (group) group.open = true;
          summary.focus?.({ preventScroll:true });
        });
      });
    });
  }

  function initSidebarCollapse(nav) {
    const button = ensureSidebarCollapseControls();
    if (!button) return;

    if (button.dataset.sidebarCollapseOwner !== 'shared') {
      button.dataset.sidebarCollapseOwner = 'shared';
      button.addEventListener('click', toggleSidebarCollapsed);
    }

    bindCollapsedGroupExpansion();
    setSidebarCollapsed(desktopSidebarQuery.matches && readSidebarCollapsePreference(), { persist:false });

    if (document.documentElement.dataset.drxSidebarCollapseBound !== '1') {
      document.documentElement.dataset.drxSidebarCollapseBound = '1';
      const onViewportChange = () => {
        setSidebarCollapsed(desktopSidebarQuery.matches && readSidebarCollapsePreference(), { persist:false });
      };
      if (desktopSidebarQuery.addEventListener) desktopSidebarQuery.addEventListener('change', onViewportChange);
      else desktopSidebarQuery.addListener?.(onViewportChange);

      const observer = new MutationObserver(() => {
        bindCollapsedGroupExpansion();
        if (sidebarCollapsed()) syncSidebarLabels(true);
      });
      observer.observe(nav, { childList:true, subtree:true });
    }

    window.DRxSidebarCollapse = Object.freeze({
      isCollapsed:sidebarCollapsed,
      set:setSidebarCollapsed,
      toggle:toggleSidebarCollapsed,
      sync:() => setSidebarCollapsed(desktopSidebarQuery.matches && readSidebarCollapsePreference(), { persist:false }),
      refreshLabels:() => syncSidebarLabels(sidebarCollapsed()),
    });
  }

  function ensureCanonicalWorker() {
    if (!('serviceWorker' in navigator)) return;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(CANONICAL_WORKER_URL, {
          scope:'/',
          updateViaCache:'none',
        });
        registration.update?.().catch(() => null);
        document.documentElement.dataset.drxWorker = 'canonical';
      } catch {
        document.documentElement.dataset.drxWorker = 'unavailable';
      }
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => void register(), { timeout:1800 });
    } else {
      setTimeout(() => void register(), 700);
    }
  }

  function init() {
    ensureCanonicalWorker();
    const nav = document.querySelector('.sidebar .nav-stack');
    if (!nav || nav.dataset.sharedTaxonomy === '1') return;
    nav.dataset.sharedTaxonomy = '1';

    const icdDetails = replaceIcdLink(nav);
    canonicalize(nav);
    restoreScroll(nav);
    initSidebarCollapse(nav);
    void syncPersonalCounts(nav).finally?.(() => window.DRxSidebarCollapse?.refreshLabels?.());
    void enhanceAtc(nav).finally?.(() => {
      bindCollapsedGroupExpansion();
      window.DRxSidebarCollapse?.refreshLabels?.();
    });

    nav.addEventListener('scroll', () => saveScroll(nav), { passive:true });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) saveScroll(nav);
    });
    window.addEventListener('pagehide', () => saveScroll(nav), { passive:true });
    window.addEventListener('drx:phase9-personal-ready', event => adoptPersonalSnapshotCounts(nav, event.detail || {}));
    window.addEventListener('drx:phase9-personal-changed', () => void syncPersonalCounts(nav));
    window.addEventListener('hashchange', () => {
      syncAtc(nav);
      const cached = readIcdCache();
      if (cached && icdDetails) renderIcd(icdDetails, cached);
    });

    if (icdDetails) void loadIcd(icdDetails);
    window.DRxSidebarTaxonomy = Object.freeze({
      version:RUNTIME_VERSION,
      syncAtc:() => syncAtc(nav),
      enhanceAtc:() => enhanceAtc(nav),
      syncPersonalCounts:() => syncPersonalCounts(nav, { force:true }),
    });
    document.documentElement.dataset.drxSidebarStructure = 'taxonomy-v5';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();