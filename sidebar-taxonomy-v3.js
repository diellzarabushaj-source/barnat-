(() => {
  'use strict';

  const STORAGE_KEY = 'drx_icd_sidebar_open_v1';
  const SCROLL_KEY = 'drx_sidebar_scroll_v2';
  const CACHE_KEY = 'drx_icd_sidebar_nav_v1';
  const CACHE_TTL = 10 * 60 * 1000;
  const API = '/api/icd?view=nav';

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const roman = number => {
    const map = [
      [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
      [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I'],
    ];
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

  function activeChapter(chapters) {
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
    const work = [find('/recetat.html'), find('/analizat.html'), find('/medical-hub.html')].filter(Boolean);

    if (labelClinical) {
      let cursor = labelClinical;
      for (const node of clinical) {
        cursor.after(node);
        cursor = node;
      }
    }
    if (labelWork) {
      let cursor = labelWork;
      for (const node of work) {
        cursor.after(node);
        cursor = node;
      }
    }
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
        <span class="nav-summary-chevron" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg>
        </span>
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
      try { details.open = localStorage.getItem(STORAGE_KEY) === 'true'; }
      catch {}
    }

    link.replaceWith(details);
    details.addEventListener('toggle', () => {
      try { localStorage.setItem(STORAGE_KEY, String(details.open)); }
      catch {}
    });
    return details;
  }

  function render(details, chapters) {
    const list = details?.querySelector('[data-icd-chapter-list]');
    if (!list) return;
    const active = activeChapter(chapters);
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

  async function load(details) {
    const cached = readCache();
    if (cached) render(details, cached);
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
      render(details, chapters);
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

  function init() {
    const nav = document.querySelector('.sidebar .nav-stack');
    if (!nav || nav.dataset.sharedTaxonomy === '1') return;
    nav.dataset.sharedTaxonomy = '1';
    const details = replaceIcdLink(nav);
    canonicalize(nav);
    restoreScroll(nav);
    nav.addEventListener('scroll', () => saveScroll(nav), { passive:true });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) saveScroll(nav);
    });
    window.addEventListener('pagehide', () => saveScroll(nav), { passive:true });
    window.addEventListener('hashchange', () => {
      const cached = readCache();
      if (cached && details) render(details, cached);
    });
    if (details) void load(details);
    document.documentElement.dataset.drxSidebarStructure = 'taxonomy-v3';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();