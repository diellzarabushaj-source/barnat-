(() => {
  'use strict';

  const API = '/api/icd?view=nav';
  const STYLE_SRC = '/atc-sidebar.css?v=atc-sidebar-v2';
  const STORAGE_KEY = 'medindex_icd_root_open_v2';
  const CACHE_KEY = 'medindex_icd_sidebar_nav_v2';
  const CACHE_TTL = 10 * 60 * 1000;
  const ROOT_PANEL_ID = 'miIcdRootMenu';
  let initialized = false;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const roman = number => {
    const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let value = Math.max(1, Number(number) || 1), out = '';
    for (const [n,g] of map) while (value >= n) { out += g; value -= n; }
    return out;
  };

  function path() {
    return location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  }

  function ensureStylesheet() {
    if (document.querySelector('link[href*="atc-sidebar.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_SRC;
    link.dataset.miAtcSidebarCss = '1';
    const professional = document.querySelector('link[data-tailadmin-professional-css],link[href*="tailadmin-professional.css"]');
    if (professional?.parentNode) professional.parentNode.insertBefore(link, professional);
    else document.head.appendChild(link);
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (!cached?.savedAt || !Array.isArray(cached.chapters)) return null;
      if (Date.now() - cached.savedAt > CACHE_TTL) return null;
      return cached.chapters;
    } catch { return null; }
  }

  function writeCache(chapters) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt:Date.now(), chapters })); }
    catch {}
  }

  function titleOf(node) {
    return clean(node?.displayTitle) || clean(node?.albanianDraft) || clean(node?.englishTitle) || clean(node?.code) || '—';
  }

  function chevron() {
    return '<span class="mi-atc-chevron mi-atc-root-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>';
  }

  function currentCode() {
    if (path() !== '/icd.html') return '';
    return decodeURIComponent(location.hash.slice(1) || '').trim();
  }

  function activeChapter(chapters) {
    const code = currentCode();
    if (!code) return '';
    const exact = chapters.find(node => clean(node.code) === code);
    if (exact) return clean(exact.code);
    return clean(chapters.find(node => clean(node.code) === code.charAt(0))?.code);
  }

  function buildPanel(chapters) {
    const active = activeChapter(chapters);
    return `<a class="mi-atc-all-link" href="/icd.html" aria-label="Të gjithë kapitujt ICD-10">
      <span class="mi-atc-all-icon" aria-hidden="true"></span>
      <span class="mi-atc-all-label">Të gjithë kapitujt</span>
      <span class="mi-atc-count">${chapters.length || 22}</span>
    </a>
    <div class="mi-atc-groups" role="list">
      ${chapters.map((node,index) => {
        const code = clean(node.code);
        const name = titleOf(node);
        const current = code === active;
        const childCount = Math.max(0, Number(node.childCount) || 0);
        return `<a class="mi-atc-subcategory-link${current ? ' is-active' : ''}" href="/icd.html#${encodeURIComponent(code)}" data-mi-icd-chapter="${esc(code)}"${current ? ' aria-current="page"' : ''} aria-label="${esc(name)}${childCount ? `, ${childCount} blloqe` : ''}">
          <span class="mi-atc-subcategory-code">${roman(index + 1)}</span>
          <span class="mi-atc-subcategory-name">${esc(name)}</span>
          ${childCount ? `<span class="mi-atc-count">${childCount}</span>` : ''}
        </a>`;
      }).join('')}
    </div>`;
  }

  function setOpen(menu, open, persist = true) {
    const trigger = menu.querySelector('[data-mi-icd-root-trigger]');
    const panel = menu.querySelector('[data-mi-icd-root-panel]');
    if (!trigger || !panel) return;
    trigger.setAttribute('aria-expanded', String(Boolean(open)));
    panel.hidden = !open;
    menu.classList.toggle('is-open', Boolean(open));
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, String(Boolean(open))); }
      catch {}
    }
  }

  function render(menu, chapters) {
    const panel = menu.querySelector('[data-mi-icd-root-panel]');
    if (!panel) return;
    panel.innerHTML = buildPanel(chapters);
    const active = path() === '/icd.html';
    menu.querySelector('[data-mi-icd-root-trigger]')?.classList.toggle('active', active);
    if (active) setOpen(menu, true, false);
  }

  async function load(menu) {
    const cached = readCache();
    if (cached) render(menu, cached);
    try {
      const response = await fetch(API, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) throw new Error(`ICD nav ${response.status}`);
      const payload = await response.json();
      const chapters = Array.isArray(payload?.data?.chapters) ? payload.data.chapters : [];
      if (!chapters.length) throw new Error('ICD nav empty');
      writeCache(chapters);
      render(menu, chapters);
      document.documentElement.dataset.miIcdSidebar = 'nested-v3';
    } catch (error) {
      if (!cached) {
        const panel = menu.querySelector('[data-mi-icd-root-panel]');
        if (panel) panel.innerHTML = '<a class="mi-atc-all-link" href="/icd.html"><span class="mi-atc-all-icon"></span><span class="mi-atc-all-label">Hap ICD‑10</span></a>';
      }
      document.documentElement.dataset.miIcdSidebar = 'unavailable';
      console.warn('MedIndex ICD sidebar unavailable:', error);
    }
  }

  function enhance() {
    const existing = document.querySelector('[data-medical-nav="icd"]');
    if (!existing) return false;
    if (document.querySelector('[data-mi-icd-menu]')) return true;

    ensureStylesheet();
    const icon = existing.querySelector('.mi-menu-icon')?.outerHTML || '<span class="app-menu-icon mi-menu-icon">10</span>';
    const menu = document.createElement('div');
    menu.className = 'mi-atc-menu mi-icd-menu-shared';
    menu.dataset.miIcdMenu = '1';
    menu.innerHTML = `<button class="app-menu-link mi-menu-item mi-atc-root-trigger" type="button" data-medical-nav="icd" data-mi-icd-root-trigger aria-expanded="false" aria-controls="${ROOT_PANEL_ID}" aria-label="ICD-10">
      ${icon}
      <span class="app-menu-title mi-menu-label">ICD‑10</span>
      ${chevron()}
    </button>
    <div class="mi-atc-root-panel" id="${ROOT_PANEL_ID}" data-mi-icd-root-panel hidden>
      <a class="mi-atc-all-link" href="/icd.html"><span class="mi-atc-all-icon"></span><span class="mi-atc-all-label">Duke ngarkuar ICD‑10…</span></a>
    </div>`;

    existing.replaceWith(menu);
    const trigger = menu.querySelector('[data-mi-icd-root-trigger]');
    let open = path() === '/icd.html';
    if (!open) {
      try { open = localStorage.getItem(STORAGE_KEY) === 'true'; }
      catch {}
    }
    setOpen(menu, open, false);

    trigger.addEventListener('click', () => setOpen(menu, trigger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        setOpen(menu, false);
        trigger.focus();
        return;
      }
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      const target = event.target.closest('button,a');
      if (!target) return;
      const items = [...menu.querySelectorAll('button,a')].filter(node => !node.closest('[hidden]') && node.getClientRects().length);
      const current = items.indexOf(target);
      if (current < 0) return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowDown') next = Math.min(items.length - 1, current + 1);
      if (event.key === 'ArrowUp') next = Math.max(0, current - 1);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      items[next]?.focus();
    });

    void load(menu);
    return true;
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (enhance()) return;
    const observer = new MutationObserver(() => {
      if (enhance()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();