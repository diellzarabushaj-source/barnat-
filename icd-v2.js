(() => {
  'use strict';

  /* ICD-10 — një shtresë e vetme mbi `/api/icd`.
     Faqja e vjetër ndante gjendjen mes dhjetë skedarëve runtime dhe
     nëntëmbëdhjetë fletëve stili. Këtu ka një gjendje, një kërkesë për hap, dhe
     të njëjtën guaskë si Barnat e Klasifikimi. */

  const API = '/api/icd';
  const LEVELS = Object.freeze({ chapter:'Kapitull', block:'Bllok', category:'Kategori', subcategory:'Nënkategori' });
  const ICON = body => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const CHEVRON_RIGHT = ICON('<path d="M9.5 5.5 16 12l-6.5 6.5"/>');
  const SEARCH_GLYPH = ICON('<circle cx="11" cy="11" r="6.6"/><path d="m16 16 4.4 4.4"/>');

  const clean = value => String(value ?? '').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const formatNumber = value => Number(value || 0).toLocaleString('sq-XK');
  const levelLabel = level => LEVELS[clean(level)] || clean(level) || '—';

  const el = {};
  const state = {
    chapters: [],
    blocks: [],
    meta: null,
    chapter: '',
    path: [],          // nyjet e hapura nën kapitull
    rows: [],
    query: '',
    searching: false,
    requestId: 0,
    loading: false,
    reveal: false,     // sill panelin e nyjeve në pamje pasi të mbërrijnë fëmijët (vetëm në celular)
  };

  function loadProfileChrome() {
    if (window.MedIndexProfile) return Promise.resolve(window.MedIndexProfile);
    const existing = document.querySelector('script[data-drx-profile-runtime]');
    if (existing) {
      return new Promise(resolve => {
        if (window.MedIndexProfile) return resolve(window.MedIndexProfile);
        existing.addEventListener('load', () => resolve(window.MedIndexProfile || null), { once:true });
        setTimeout(() => resolve(window.MedIndexProfile || null), 1800);
      });
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = '/medindex-brand-runtime.js?v=profile-unified-v1';
      script.defer = true;
      script.dataset.drxProfileRuntime = '1';
      script.addEventListener('load', () => resolve(window.MedIndexProfile || null), { once:true });
      script.addEventListener('error', () => resolve(null), { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfileChrome(payload) {
    await loadProfileChrome();
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    if (document.querySelector('script[data-drx-sidebar-taxonomy]')) return;
    const script = document.createElement('script');
    script.src = '/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3';
    script.defer = true;
    script.dataset.drxSidebarTaxonomy = '1';
    document.head.appendChild(script);
  }

  function bindElements() {
    [
      'appShell','sidebar','sidebarBackdrop','menuButton','sidebarClose','logoutButton','avatarInitials','sourceStatus','syncText',
      'metricNodes','metricChapters','metricCategories','metricCoverage','metricCoverageNote',
      'icdPath','icdPathItems','icdPathReset','icdSearch','icdStatusText',
      'chapterList','chapterCount','nodeHero','nodeList','nodeSectionTitle','nodeCount','nodeKicker','toast',
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  // --- rrjeti ---------------------------------------------------------------

  async function fetchJson(url, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin', cache:'no-store', signal:controller.signal,
        headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { redirectToLogin(); throw new Error('Sesioni nuk është aktiv.'); }
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || payload?.detail || `Gabim ${response.status}`);
      return { payload, response };
    } finally { clearTimeout(timer); }
  }

  function endpoint(view, values = {}) {
    const params = new URLSearchParams({ view });
    Object.entries(values).forEach(([key, value]) => { if (clean(value)) params.set(key, clean(value)); });
    return `${API}?${params}`;
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { payload } = await fetchJson('/api/auth', 4200);
    if (!payload.authenticated) return redirectToLogin();
    const name = clean(payload.user?.fullName || payload.user?.name || payload.user?.email || 'DR');
    el.avatarInitials.textContent = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2)
      .map(part => part[0]?.toUpperCase()).join('') || 'DR';
  }

  // --- paraqitja ------------------------------------------------------------

  function nodeTitle(node) {
    return clean(node?.displayTitle) || clean(node?.albanianDraft) || clean(node?.englishTitle) || clean(node?.code) || '—';
  }

  /* Titujt e kapitujve vijnë si «Neoplazitë (C00-D48)». Intervali është e vetmja
     gjë që i dallon te lista e ngushtë; kur titulli pritej me elips, pikërisht ai
     humbte, dhe poshtë të tetë rreshtave rrinte e njëjta fjalë «Kapitull». */
  const CODE_RANGE = /\s*[(\[]\s*([A-Z]\d{2}(?:\.\d+)?\s*[–—-]\s*[A-Z]?\d{2}(?:\.\d+)?)\s*[)\]]\s*$/;

  function splitRange(node) {
    const title = nodeTitle(node);
    const match = title.match(CODE_RANGE);
    if (!match) return { title, range:'' };
    const stripped = title.slice(0, match.index).trim();
    return stripped ? { title:stripped, range:match[1].replace(/\s+/g, '') } : { title, range:'' };
  }

  function nodeSubtitle(node) {
    const english = clean(node?.englishTitle);
    const shown = nodeTitle(node);
    return english && english !== shown ? english : '';
  }

  function renderMetrics() {
    const meta = state.meta || {};
    el.metricNodes.textContent = meta.total ? formatNumber(meta.total) : formatNumber(state.chapters.length + state.blocks.length);
    el.metricChapters.textContent = formatNumber(state.chapters.length);
    el.metricCategories.textContent = meta.categories ? formatNumber(meta.categories) : '—';
    const translated = Number(meta.translated || 0);
    const total = Number(meta.total || 0);
    if (total > 0) {
      el.metricCoverage.textContent = `${Math.round((translated / total) * 100)}%`;
      el.metricCoverageNote.textContent = `${formatNumber(translated)} nyje në shqip`;
    } else {
      el.metricCoverage.textContent = '—';
      el.metricCoverageNote.textContent = 'Mbulimi i përkthimit';
    }
  }

  function renderChapters() {
    el.chapterCount.textContent = formatNumber(state.chapters.length);
    if (!state.chapters.length) {
      el.chapterList.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';
      return;
    }
    el.chapterList.innerHTML = state.chapters.map(node => {
      const code = clean(node.code);
      const active = code === state.chapter;
      const { title, range } = splitRange(node);
      return `<button class="chapter-row ${active ? 'is-active' : ''}" type="button" role="option" aria-selected="${active}" data-chapter="${escapeHtml(code)}">
        <span class="chapter-code">${escapeHtml(code)}</span>
        <span class="chapter-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(range || levelLabel('chapter'))}</small></span>
      </button>`;
    }).join('');
  }

  function currentNode() {
    return state.path.length ? state.path[state.path.length - 1] : (state.chapters.find(c => clean(c.code) === state.chapter) || null);
  }

  function renderHero() {
    const node = currentNode();
    if (!node) { el.nodeHero.hidden = true; return; }
    el.nodeHero.hidden = false;
    const code = clean(node.code);
    const { title, range } = splitRange(node);
    el.nodeHero.innerHTML = `
      <span class="hero-code">${escapeHtml(code)}</span>
      <span class="hero-copy">
        <span class="hero-kicker">${escapeHtml(levelLabel(node.level))}${range ? ` · <b>${escapeHtml(range)}</b>` : ''}</span>
        <h2>${escapeHtml(title)}</h2>
        ${nodeSubtitle(node) ? `<p>${escapeHtml(nodeSubtitle(node))}</p>` : ''}
      </span>
      <span class="hero-actions">
        <a class="button button-secondary" href="/index.html?q=${encodeURIComponent(code)}">Kërko në barna</a>
      </span>`;
  }

  function renderPath() {
    const trail = [];
    const chapter = state.chapters.find(c => clean(c.code) === state.chapter);
    if (chapter) trail.push(chapter);
    trail.push(...state.path);
    el.icdPath.hidden = !trail.length;
    el.icdPathItems.innerHTML = trail.map((node, index) => {
      const current = index === trail.length - 1;
      const sep = index ? `<span class="icd-path-sep" aria-hidden="true">${CHEVRON_RIGHT}</span>` : '';
      return `${sep}<button class="icd-path-node ${current ? 'is-current' : ''}" type="button" data-path-index="${index}" title="${escapeHtml(nodeTitle(node))}"><strong>${escapeHtml(clean(node.code))}</strong><span>${escapeHtml(nodeTitle(node))}</span></button>`;
    }).join('');
  }

  function renderRows() {
    el.nodeCount.textContent = formatNumber(state.rows.length);
    if (state.loading) {
      el.nodeList.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';
      return;
    }
    if (!state.rows.length) {
      el.nodeList.innerHTML = `<div class="icd-empty">
        <div class="icd-empty-icon">${SEARCH_GLYPH}</div>
        <h3>${state.searching ? 'Asnjë kod nuk përputhet' : 'Nuk ka nënndarje'}</h3>
        <p>${state.searching ? 'Provo një kod tjetër, p.sh. I10, ose një term si «hipertension».' : 'Ky është niveli i fundit i kësaj dege.'}</p>
      </div>`;
      return;
    }
    el.nodeList.innerHTML = state.rows.map(node => {
      const code = clean(node.code);
      const hasChildren = Number(node.childCount || 0) > 0;
      return `<button class="node-row" type="button" data-code="${escapeHtml(code)}" ${hasChildren ? '' : 'data-leaf="true"'}>
        <span class="node-code">${escapeHtml(code)}</span>
        <span class="node-copy"><strong>${escapeHtml(nodeTitle(node))}</strong>${nodeSubtitle(node) ? `<small>${escapeHtml(nodeSubtitle(node))}</small>` : ''}</span>
        <span class="node-meta">
          <span class="node-level">${escapeHtml(levelLabel(node.level))}${hasChildren ? ` · ${formatNumber(node.childCount)}` : ''}</span>
          ${hasChildren ? `<span class="node-open" aria-hidden="true">${CHEVRON_RIGHT}</span>` : ''}
        </span>
      </button>`;
    }).join('');
  }

  function renderSection() {
    if (state.searching) {
      el.nodeKicker.textContent = 'Rezultatet';
      el.nodeSectionTitle.textContent = `Kërkimi «${state.query}»`;
      return;
    }
    const node = currentNode();
    if (!node) {
      el.nodeKicker.textContent = 'Fillo';
      el.nodeSectionTitle.textContent = 'Zgjidh një kapitull';
      return;
    }
    /* Koka e listës thoshte fjalë për fjalë titullin e hero-s dy dhjetëra pikselë
       më lart. Tani thotë çfarë përmban lista, jo se ku ndodhemi. */
    el.nodeKicker.textContent = 'Nënndarjet';
    el.nodeSectionTitle.textContent = childLevelLabel() || nodeTitle(node);
  }

  const LEVEL_PLURALS = Object.freeze({ chapter:'Kapitujt', block:'Blloqet', category:'Kategoritë', subcategory:'Nënkategoritë' });

  function childLevelLabel() {
    if (state.loading || !state.rows.length) return '';
    const levels = [...new Set(state.rows.map(row => clean(row.level)).filter(Boolean))];
    if (levels.length !== 1) return 'Nyjet e nivelit tjetër';
    return LEVEL_PLURALS[levels[0]] || levelLabel(levels[0]);
  }

  function render() {
    renderMetrics();
    renderChapters();
    renderHero();
    renderPath();
    renderSection();
    renderRows();
  }

  /* Statusi rri në rreshtin e komandës, jo në një brez të vetin, dhe nuk tregon
     më milisekondat e kërkesës: sa zgjati fetch-i është telemetri zhvilluesi,
     jo informacion klinik. Toni thotë vetëm nëse po pritet apo dështoi. */
  function setStatus(text, tone = '') {
    el.icdStatusText.textContent = text;
    el.icdStatusText.classList.toggle('is-busy', tone === 'busy');
    el.icdStatusText.classList.toggle('is-error', tone === 'error');
  }

  // --- të dhënat ------------------------------------------------------------

  async function loadNav() {
    setStatus('Duke ngarkuar hierarkinë ICD-10…', 'busy');
    const { payload, response } = await fetchJson(endpoint('nav'));
    const data = payload.data || {};
    state.chapters = Array.isArray(data.chapters) ? data.chapters : [];
    state.blocks = Array.isArray(data.blocks) ? data.blocks : [];
    state.meta = data.meta || null;
    const source = response.headers.get('X-MedIndex-Data-Source') || 'Supabase';
    el.sourceStatus.textContent = `${source} · aktiv`;
    el.syncText.textContent = source;
    setStatus(`${formatNumber(state.chapters.length)} kapituj të ngarkuar`);
  }

  async function loadChildren(code) {
    const requestId = ++state.requestId;
    state.loading = true;
    setStatus(`Duke hapur ${code}…`, 'busy');
    renderRows();
    try {
      const { payload } = await fetchJson(endpoint('children', { parent:code }));
      if (requestId !== state.requestId) return;
      const data = payload.data || {};
      state.rows = Array.isArray(data.rows) ? data.rows : [];
      setStatus(`${formatNumber(state.rows.length)} nyje nën ${code}`);
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.rows = [];
      setStatus(error?.message || 'Hierarkia nuk u ngarkua.', 'error');
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        render();
        // Pas rirenderimit, që lartësia e panelit të jetë ajo përfundimtare.
        if (state.reveal) { state.reveal = false; revealNodePanel(); }
      }
    }
  }

  async function runSearch(query) {
    const requestId = ++state.requestId;
    state.searching = true;
    state.query = query;
    state.loading = true;
    renderSection();
    setStatus(`Duke kërkuar «${query}»…`, 'busy');
    renderRows();
    try {
      const { payload } = await fetchJson(endpoint('suggest', { q:query }));
      if (requestId !== state.requestId) return;
      const data = payload.data || {};
      state.rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data.suggestions) ? data.suggestions : []);
      setStatus(`${formatNumber(state.rows.length)} përputhje për «${query}»`);
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.rows = [];
      setStatus(error?.message || 'Kërkimi dështoi.', 'error');
    } finally {
      if (requestId === state.requestId) { state.loading = false; render(); }
    }
  }

  function clearSearch() {
    state.searching = false;
    state.query = '';
    if (el.icdSearch.value) el.icdSearch.value = '';
  }

  // --- lëvizja --------------------------------------------------------------

  /* Nën 940px të dy panelet bien njëri poshtë tjetrit, kështu që pas zgjedhjes
     së kapitullit përmbajtja mbetej një ekran e gjysmë më poshtë, pas tetë
     rreshtave të listës. Zgjedhja e sjell atë vetë në pamje. */
  function revealNodePanel() {
    if (!window.matchMedia('(max-width:940px)').matches) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    requestAnimationFrame(() => el.nodeHero?.scrollIntoView({ block:'start', behavior }));
  }

  function selectChapter(code, options = {}) {
    clearSearch();
    state.chapter = clean(code);
    state.path = [];
    writeHash(state.chapter);
    render();
    state.reveal = Boolean(options.reveal);
    if (state.chapter) void loadChildren(state.chapter);
    else state.reveal = false;
  }

  async function openNode(code) {
    const node = state.rows.find(row => clean(row.code) === clean(code));
    if (!node) return;
    if (!Number(node.childCount || 0)) { showToast(`${clean(node.code)} është niveli i fundit.`); return; }
    if (state.searching) {
      // Nga kërkimi hyjmë te dega e vërtetë, jo te një listë e sheshtë.
      clearSearch();
      const chapter = clean(node.chapter) || clean(node.code).charAt(0);
      const known = state.chapters.find(c => clean(c.code) === chapter);
      state.chapter = known ? chapter : state.chapter;
      state.path = [node];
    } else {
      state.path.push(node);
    }
    writeHash(clean(node.code));
    render();
    await loadChildren(clean(node.code));
  }

  function goToPathIndex(index) {
    const chapterOffset = state.chapters.some(c => clean(c.code) === state.chapter) ? 1 : 0;
    if (index < chapterOffset) { selectChapter(state.chapter); return; }
    state.path = state.path.slice(0, index - chapterOffset + 1);
    const node = state.path[state.path.length - 1];
    writeHash(clean(node?.code) || state.chapter);
    render();
    void loadChildren(clean(node?.code) || state.chapter);
  }

  function writeHash(code) {
    const url = new URL(location.href);
    url.hash = code ? encodeURIComponent(code) : '';
    history.replaceState(code ? { icd:code } : {}, '', url.pathname + url.search + url.hash);
  }

  function readHash() {
    return clean(decodeURIComponent(location.hash.slice(1) || '')).toUpperCase();
  }

  let toastTimer = 0;
  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  // --- lidhjet --------------------------------------------------------------

  let searchTimer = 0;
  function bindEvents() {
    el.chapterList.addEventListener('click', event => {
      const button = event.target.closest('[data-chapter]');
      if (button) selectChapter(button.dataset.chapter, { reveal:true });
    });

    el.nodeList.addEventListener('click', event => {
      const button = event.target.closest('[data-code]');
      if (button) void openNode(button.dataset.code);
    });

    el.icdPathItems.addEventListener('click', event => {
      const button = event.target.closest('[data-path-index]');
      if (button) goToPathIndex(Number(button.dataset.pathIndex));
    });

    el.icdPathReset?.addEventListener('click', () => {
      clearSearch();
      state.chapter = '';
      state.path = [];
      state.rows = [];
      writeHash('');
      setStatus(`${formatNumber(state.chapters.length)} kapituj`);
      render();
    });

    el.icdSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const value = clean(el.icdSearch.value);
      if (value.length < 2) {
        if (state.searching) { clearSearch(); render(); if (state.chapter) void loadChildren(clean(currentNode()?.code) || state.chapter); }
        return;
      }
      searchTimer = setTimeout(() => void runSearch(value), 220);
    });

    /* Vendmbajtësi i gjatë pritej në mes të fjalës në 390px. */
    if (window.matchMedia('(max-width:760px)').matches) el.icdSearch.placeholder = 'Kërko kodin ose diagnozën…';

    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); el.icdSearch.focus(); el.icdSearch.select(); }
      if (event.key === 'Escape' && document.activeElement === el.icdSearch) { el.icdSearch.blur(); }
    });

    el.menuButton?.addEventListener('click', () => { el.sidebar.classList.add('is-open'); el.sidebarBackdrop.hidden = false; });
    const closeSidebar = () => { el.sidebar.classList.remove('is-open'); el.sidebarBackdrop.hidden = true; };
    el.sidebarClose?.addEventListener('click', closeSidebar);
    el.sidebarBackdrop?.addEventListener('click', closeSidebar);

    el.logoutButton?.addEventListener('click', async () => {
      try { await fetch('/api/auth', { method:'DELETE', credentials:'same-origin', headers:{ Accept:'application/json' } }); } catch {}
      location.replace('/landing.html');
    });

    window.addEventListener('hashchange', () => {
      const code = readHash();
      if (!code) return;
      const chapter = state.chapters.find(c => clean(c.code) === code);
      if (chapter) selectChapter(code);
    });
  }

  async function boot() {
    loadSharedSidebarTaxonomy();
    bindElements();
    bindEvents();
    render();
    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);
      await loadNav();
      render();
      const hash = readHash();
      const chapter = state.chapters.find(c => clean(c.code) === hash);
      if (chapter) selectChapter(clean(chapter.code));
      else if (state.chapters.length) selectChapter(clean(state.chapters[0].code));
    } catch (error) {
      setStatus(error?.message || 'ICD-10 nuk u ngarkua.', 'error');
      el.sourceStatus.textContent = 'I palidhur';
    } finally {
      el.appShell.setAttribute('aria-busy', 'false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
