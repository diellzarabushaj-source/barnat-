(() => {
  'use strict';

  const API = '/api/icd';
  const STYLE_SRC = '/icd-sidebar.css?v=icd-sidebar-v1';
  const ROOT_STORAGE_KEY = 'medindex_icd_root_open_v1';
  const CHAPTER_STORAGE_KEY = 'medindex_icd_chapter_open_v1';
  const NAV_CACHE_KEY = 'medindex_icd_nav_cache_v1';
  const NAV_CACHE_TTL = 10 * 60 * 1000;
  const MOBILE_BREAKPOINT = 1024;
  const PANEL_ID = 'miIcdRootMenu';
  let initialized = false;
  let rootTrigger = null;
  let rootPanel = null;
  let navData = null;
  const categoryCache = new Map();

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const isIcdPage = () => location.pathname.replace(/\/+$/, '') === '/icd.html';

  function readStorage(key, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback; }
    catch { return fallback; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, String(value)); }
    catch {}
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-mi-icd-sidebar-css],link[href*="icd-sidebar.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_SRC;
    link.dataset.miIcdSidebarCss = '1';
    const professional = document.querySelector('link[data-tailadmin-professional-css],link[href*="tailadmin-professional.css"]');
    if (professional?.parentNode) professional.parentNode.insertBefore(link, professional);
    else document.head.appendChild(link);
  }

  function chevron(className = '') {
    return `<span class="mi-icd-chevron ${className}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>`;
  }

  function formatCount(value) {
    try { return new Intl.NumberFormat('sq-AL').format(Number(value) || 0); }
    catch { return String(Number(value) || 0); }
  }

  async function fetchData(url) {
    const response = await fetch(url, { credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`ICD navigation ${response.status}`);
    const payload = await response.json();
    if (!payload?.ok || !payload?.data) throw new Error('ICD navigation payload');
    return payload.data;
  }

  function readNavCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(NAV_CACHE_KEY) || 'null');
      if (!cached?.data || Date.now() - Number(cached.savedAt || 0) > NAV_CACHE_TTL) return null;
      return cached.data;
    } catch { return null; }
  }

  function writeNavCache(data) {
    try { sessionStorage.setItem(NAV_CACHE_KEY, JSON.stringify({ savedAt:Date.now(), data })); }
    catch {}
  }

  async function loadNavigation() {
    const cached = readNavCache();
    if (cached) return cached;
    const data = await fetchData(`${API}?view=nav`);
    writeNavCache(data);
    return data;
  }

  function currentState(detail = {}) {
    const params = new URLSearchParams(location.search);
    return {
      parent:clean(detail.parent ?? params.get('parent')),
      chapter:clean(detail.chapter ?? params.get('chapter')),
    };
  }

  function blocksForChapter(chapterCode) {
    return (navData?.blocks || []).filter(block => block.chapter === chapterCode);
  }

  function allLink() {
    const total = navData?.meta?.counts?.category + navData?.meta?.counts?.subcategory || navData?.meta?.counts?.total || 0;
    return `<a class="mi-icd-all-link" href="/icd.html" data-mi-icd-all-link>
      <span class="mi-icd-all-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span>Të gjitha diagnozat</span>
      <span class="mi-icd-count">${formatCount(total)}</span>
    </a>`;
  }

  function blockMarkup(block) {
    return `<div class="mi-icd-block" data-mi-icd-block="${esc(block.code)}">
      <button class="mi-icd-block-trigger" type="button" data-mi-icd-block-trigger="${esc(block.code)}" aria-expanded="false" aria-controls="miIcdBlock${esc(block.code.replace(/[^A-Za-z0-9]/g, ''))}">
        <span class="mi-icd-block-code">${esc(block.code)}</span>
        <span class="mi-icd-block-name">${esc(block.displayTitle)}</span>
        <span class="mi-icd-count">${formatCount(block.childCount)}</span>
        ${chevron()}
      </button>
      <div class="mi-icd-categories" id="miIcdBlock${esc(block.code.replace(/[^A-Za-z0-9]/g, ''))}" data-mi-icd-categories="${esc(block.code)}" hidden></div>
    </div>`;
  }

  function chapterMarkup(chapter) {
    const blocks = blocksForChapter(chapter.code);
    return `<div class="mi-icd-chapter" data-mi-icd-chapter="${esc(chapter.code)}">
      <button class="mi-icd-chapter-trigger" type="button" data-mi-icd-chapter-trigger="${esc(chapter.code)}" aria-expanded="false" aria-controls="miIcdChapter${esc(chapter.code)}">
        <span class="mi-icd-chapter-code">${esc(chapter.code)}</span>
        <span class="mi-icd-chapter-name">${esc(chapter.displayTitle)}</span>
        <span class="mi-icd-count">${formatCount(blocks.length)}</span>
        ${chevron()}
      </button>
      <div class="mi-icd-blocks" id="miIcdChapter${esc(chapter.code)}" data-mi-icd-blocks="${esc(chapter.code)}" hidden>
        ${blocks.map(blockMarkup).join('')}
      </div>
    </div>`;
  }

  function buildPanel() {
    rootPanel.innerHTML = `${allLink()}<div class="mi-icd-chapters">${(navData?.chapters || []).map(chapterMarkup).join('')}</div>`;
  }

  function setRootOpen(open, persist = true) {
    const value = Boolean(open);
    rootTrigger?.setAttribute('aria-expanded', String(value));
    if (rootPanel) rootPanel.hidden = !value;
    rootTrigger?.closest('[data-mi-icd-menu]')?.classList.toggle('is-open', value);
    if (persist) writeStorage(ROOT_STORAGE_KEY, value);
  }

  function setChapterOpen(code, open, persist = true) {
    const target = clean(code);
    rootPanel?.querySelectorAll('[data-mi-icd-chapter]').forEach(chapter => {
      const shouldOpen = Boolean(open && chapter.dataset.miIcdChapter === target);
      chapter.classList.toggle('is-open', shouldOpen);
      chapter.querySelector('[data-mi-icd-chapter-trigger]')?.setAttribute('aria-expanded', String(shouldOpen));
      const blocks = chapter.querySelector('[data-mi-icd-blocks]');
      if (blocks) blocks.hidden = !shouldOpen;
    });
    if (persist) writeStorage(CHAPTER_STORAGE_KEY, open ? target : '');
  }

  function setBlockOpen(code, open) {
    const target = clean(code);
    rootPanel?.querySelectorAll('[data-mi-icd-block]').forEach(block => {
      const shouldOpen = Boolean(open && block.dataset.miIcdBlock === target);
      block.classList.toggle('is-open', shouldOpen);
      block.querySelector('[data-mi-icd-block-trigger]')?.setAttribute('aria-expanded', String(shouldOpen));
      const categories = block.querySelector('[data-mi-icd-categories]');
      if (categories) categories.hidden = !shouldOpen;
    });
  }

  function categoryMarkup(block, rows, activeParent) {
    const allActive = activeParent === block.code;
    return `<a class="mi-icd-block-all${allActive ? ' is-active' : ''}" href="/icd.html?parent=${encodeURIComponent(block.code)}" data-mi-icd-filter-parent="${esc(block.code)}"${allActive ? ' aria-current="page"' : ''}>
      <span>Të gjitha kategoritë në ${esc(block.code)}</span><span class="mi-icd-count">${formatCount(rows.length)}</span>
    </a>${rows.map(category => {
      const active = activeParent === category.code;
      return `<a class="mi-icd-category-link${active ? ' is-active' : ''}" href="/icd.html?parent=${encodeURIComponent(category.code)}" data-mi-icd-filter-parent="${esc(category.code)}"${active ? ' aria-current="page"' : ''}>
        <span class="mi-icd-category-code">${esc(category.code)}</span>
        <span class="mi-icd-category-name">${esc(category.displayTitle)}</span>
        <span class="mi-icd-count">${formatCount(category.childCount)}</span>
      </a>`;
    }).join('')}`;
  }

  async function loadCategories(blockCode, activeParent = '') {
    const container = rootPanel?.querySelector(`[data-mi-icd-categories="${CSS.escape(blockCode)}"]`);
    const block = (navData?.blocks || []).find(item => item.code === blockCode);
    if (!container || !block) return;
    if (!categoryCache.has(blockCode)) {
      container.hidden = false;
      container.innerHTML = '<div class="mi-icd-loading">Po ngarkohen kategoritë…</div>';
      try {
        const data = await fetchData(`${API}?view=children&parent=${encodeURIComponent(blockCode)}`);
        categoryCache.set(blockCode, data.rows || []);
      } catch (error) {
        console.error('ICD category navigation failed:', error);
        container.innerHTML = '<div class="mi-icd-error">Kategoritë nuk u ngarkuan.</div>';
        return;
      }
    }
    container.innerHTML = categoryMarkup(block, categoryCache.get(blockCode), activeParent);
  }

  function chapterForBlock(blockCode) {
    return (navData?.blocks || []).find(block => block.code === blockCode)?.chapter || '';
  }

  async function resolveActive(state = currentState()) {
    if (state.chapter) return { chapter:state.chapter, block:'', parent:'' };
    if (!state.parent) return { chapter:'', block:'', parent:'' };
    const directBlock = (navData?.blocks || []).find(block => block.code === state.parent);
    if (directBlock) return { chapter:directBlock.chapter, block:directBlock.code, parent:state.parent };
    try {
      const data = await fetchData(`${API}?view=resolve&code=${encodeURIComponent(state.parent)}`);
      const block = [...(data.ancestors || []), data.node].find(node => node?.level === 'block');
      const chapter = [...(data.ancestors || []), data.node].find(node => node?.level === 'chapter');
      return { chapter:chapter?.code || block?.chapter || '', block:block?.code || '', parent:state.parent };
    } catch {
      return { chapter:'', block:'', parent:state.parent };
    }
  }

  async function syncActive(detail = {}) {
    if (!navData || !rootPanel) return;
    const active = await resolveActive(currentState(detail));
    rootTrigger.classList.toggle('active', isIcdPage());
    rootPanel.querySelector('[data-mi-icd-all-link]')?.classList.toggle('is-active', isIcdPage() && !active.parent && !active.chapter);
    rootPanel.querySelectorAll('[data-mi-icd-chapter]').forEach(chapter => chapter.classList.toggle('is-active', chapter.dataset.miIcdChapter === active.chapter));
    rootPanel.querySelectorAll('[data-mi-icd-block]').forEach(block => block.classList.toggle('is-active', block.dataset.miIcdBlock === active.block));
    if (isIcdPage() || active.chapter || active.parent) setRootOpen(true, false);
    if (active.chapter) setChapterOpen(active.chapter, true, false);
    if (active.block) {
      await loadCategories(active.block, active.parent);
      setBlockOpen(active.block, true);
      rootPanel.querySelector(`[data-mi-icd-filter-parent="${CSS.escape(active.parent)}"]`)?.scrollIntoView({ block:'nearest', behavior:'auto' });
    }
  }

  function closeMobileSidebar() {
    if (innerWidth >= MOBILE_BREAKPOINT) return;
    document.body.classList.remove('mi-sidebar-open');
    document.querySelector('[data-mi-sidebar-toggle]')?.setAttribute('aria-expanded', 'false');
  }

  function openShellSidebar() {
    document.body.classList.add('mi-sidebar-open');
    document.querySelector('[data-mi-sidebar-toggle]')?.setAttribute('aria-expanded', 'true');
  }

  function installInteractions(menu) {
    rootTrigger.addEventListener('click', () => setRootOpen(rootTrigger.getAttribute('aria-expanded') !== 'true'));
    rootPanel.addEventListener('click', async event => {
      const chapterButton = event.target.closest('[data-mi-icd-chapter-trigger]');
      if (chapterButton) {
        const code = chapterButton.dataset.miIcdChapterTrigger;
        const open = chapterButton.getAttribute('aria-expanded') !== 'true';
        setChapterOpen(code, open);
        if (!open) setBlockOpen('', false);
        return;
      }
      const blockButton = event.target.closest('[data-mi-icd-block-trigger]');
      if (blockButton) {
        const code = blockButton.dataset.miIcdBlockTrigger;
        const open = blockButton.getAttribute('aria-expanded') !== 'true';
        if (open) await loadCategories(code, currentState().parent);
        setBlockOpen(code, open);
        return;
      }
      const filter = event.target.closest('[data-mi-icd-filter-parent]');
      if (filter && isIcdPage() && window.MedIndexIcdTable) {
        event.preventDefault();
        window.MedIndexIcdTable.openFilter({ parent:filter.dataset.miIcdFilterParent, chapter:'' });
        closeMobileSidebar();
        return;
      }
      const all = event.target.closest('[data-mi-icd-all-link]');
      if (all && isIcdPage() && window.MedIndexIcdTable) {
        event.preventDefault();
        window.MedIndexIcdTable.openFilter({ parent:'', chapter:'', q:'', level:'' });
        closeMobileSidebar();
      }
    });
    menu.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const openBlock = rootPanel.querySelector('.mi-icd-block.is-open');
      if (openBlock) return setBlockOpen('', false);
      const openChapter = rootPanel.querySelector('.mi-icd-chapter.is-open');
      if (openChapter) return setChapterOpen('', false);
      setRootOpen(false);
      rootTrigger.focus();
    });
    window.addEventListener('medindex:icd-state', event => syncActive(event.detail || {}));
    window.addEventListener('medindex:open-icd-sidebar', async event => {
      openShellSidebar();
      setRootOpen(true);
      await syncActive(event.detail || {});
      rootTrigger.scrollIntoView({ block:'nearest', behavior:'auto' });
      rootTrigger.focus({ preventScroll:true });
    });
    window.addEventListener('popstate', () => syncActive());
  }

  function enhanceLink(link) {
    const menu = document.createElement('div');
    menu.className = 'mi-icd-menu';
    menu.dataset.miIcdMenu = '1';
    const icon = link.querySelector('.mi-menu-icon,.app-menu-icon')?.outerHTML || '';
    const label = link.querySelector('.mi-menu-label,.app-menu-title')?.outerHTML || '<span class="mi-menu-label">ICD</span>';
    menu.innerHTML = `<button class="${esc(link.className)} mi-icd-root-trigger" type="button" data-medical-nav="icd" aria-expanded="false" aria-controls="${PANEL_ID}" aria-label="ICD — hierarkia e plotë">
      ${icon}${label}${chevron('mi-icd-root-chevron')}
    </button><div class="mi-icd-root-panel" id="${PANEL_ID}" hidden><div class="mi-icd-loading">Po ngarkohet hierarkia ICD-10…</div></div>`;
    link.replaceWith(menu);
    rootTrigger = menu.querySelector('.mi-icd-root-trigger');
    rootPanel = menu.querySelector('.mi-icd-root-panel');
    return menu;
  }

  async function init() {
    if (initialized) return;
    const link = document.querySelector('[data-medical-nav="icd"]');
    if (!link || link.closest('[data-mi-icd-menu]')) return;
    initialized = true;
    ensureStylesheet();
    const menu = enhanceLink(link);
    installInteractions(menu);
    try {
      navData = await loadNavigation();
      buildPanel();
      const shouldOpen = isIcdPage() || readStorage(ROOT_STORAGE_KEY, 'false') === 'true';
      setRootOpen(shouldOpen, false);
      const savedChapter = readStorage(CHAPTER_STORAGE_KEY, '');
      if (!isIcdPage() && savedChapter) setChapterOpen(savedChapter, true, false);
      await syncActive();
      document.documentElement.dataset.miIcdSidebar = 'ready';
    } catch (error) {
      console.error('ICD sidebar failed:', error);
      rootPanel.innerHTML = '<div class="mi-icd-error">Hierarkia ICD-10 nuk u ngarkua.</div>';
      document.documentElement.dataset.miIcdSidebar = 'error';
    }
  }

  function scheduleInit() {
    if (document.querySelector('.mi-app-shell,[data-medical-nav="icd"]')) init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleInit, { once:true });
  else scheduleInit();
  window.addEventListener('medindex:tailadmin-ready', scheduleInit);
  const observer = new MutationObserver(scheduleInit);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  setTimeout(() => observer.disconnect(), 12000);
})();
