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
    suggestions: [],
    suggestionMeta: null,
    suggestionLoading: false,
    suggestionOpen: false,
    activeSuggestion: -1,
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
      script.src = '/medindex-brand-runtime.js?v=drx-brand-v7';
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
    script.src = '/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v4';
    script.defer = true;
    script.dataset.drxSidebarTaxonomy = '1';
    document.head.appendChild(script);
  }

  function bindElements() {
    [
      'appShell','sidebar','sidebarBackdrop','menuButton','sidebarClose','logoutButton','avatarInitials','sourceStatus','syncText',
      'metricNodes','metricChapters','metricCategories','metricCoverage','metricCoverageNote',
      'icdPath','icdPathItems','icdPathReset','icdSearch','icdSearchBox','icdSuggestions','icdStatusText',
      'chapterList','chapterCount','nodeHero','nodeList','nodeSectionTitle','nodeCount','nodeKicker','toast',
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  // --- rrjeti ---------------------------------------------------------------

  async function fetchJson(url, timeoutMs = 9000, externalSignal = null, cacheMode = 'no-store') {
    const controller = new AbortController();
    const abortFromExternal = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', abortFromExternal, { once:true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin', cache:cacheMode, signal:controller.signal,
        headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { redirectToLogin(); throw new Error('Sesioni nuk është aktiv.'); }
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || payload?.detail || `Gabim ${response.status}`);
      return { payload, response };
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', abortFromExternal);
    }
  }

  function endpoint(view, values = {}) {
    const params = new URLSearchParams({ view, sv:'hierarchy-v5' });
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
    const shown = nodeTitle(node);
    const english = clean(node?.englishTitle);
    const latin = clean(node?.latinTitle);
    return [
      english && english !== shown ? `EN · ${english}` : '',
      latin && latin !== shown && latin !== english ? `LA · ${latin}` : '',
    ].filter(Boolean).join(' · ');
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
        <h3>Nuk ka nënndarje</h3>
        <p>Ky është niveli i fundit i kësaj dege.</p>
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

  function searchNormalize(value) {
    return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function suggestionHaystack(node) {
    return searchNormalize([
      node?.code, node?.displayTitle, node?.albanianDraft, node?.englishTitle, node?.latinTitle,
      node?.searchMatch?.matchedTerm, node?.searchMatch?.expandedTerm,
    ].filter(Boolean).join(' '));
  }

  const suggestionCache = new Map();
  const SUGGESTION_CACHE_LIMIT = 80;

  function cacheSuggestions(query, data) {
    const key = searchNormalize(query);
    if (!key) return;
    if (suggestionCache.has(key)) suggestionCache.delete(key);
    suggestionCache.set(key, data);
    while (suggestionCache.size > SUGGESTION_CACHE_LIMIT) suggestionCache.delete(suggestionCache.keys().next().value);
  }

  function cachedSuggestions(query) {
    const key = searchNormalize(query);
    if (!key || !suggestionCache.has(key)) return null;
    const value = suggestionCache.get(key);
    suggestionCache.delete(key);
    suggestionCache.set(key, value);
    return value;
  }

  function immediatePreview(query) {
    const normalized = searchNormalize(query);
    if (!normalized) return [];
    const direct = cachedSuggestions(query);
    if (direct?.rows?.length) return direct.rows;

    let best = null;
    for (const [key, value] of [...suggestionCache.entries()].reverse()) {
      if (!normalized.startsWith(key) || !value?.rows?.length) continue;
      best = value.rows;
      break;
    }
    const source = best || state.suggestions;
    if (!Array.isArray(source) || !source.length) return [];
    const tokens = normalized.split(' ').filter(Boolean);
    return source.filter(node => {
      const haystack = suggestionHaystack(node);
      return tokens.every(token => haystack.includes(token));
    }).slice(0, 18);
  }

  function suggestionTranslations(node) {
    const primary = nodeTitle(node);
    const items = [];
    const sq = clean(node?.albanianDraft);
    const en = clean(node?.englishTitle);
    const la = clean(node?.latinTitle);
    const latinParent = clean(node?.latinParentTitle);
    const latinParentCode = clean(node?.latinParentCode);
    if (sq && sq !== primary) items.push({ lang:'SQ', text:sq, kind:'exact' });
    if (en) items.push({ lang:'EN', text:en, kind:'exact' });
    if (la) {
      items.push({ lang:'LA', text:la, kind:'exact' });
    } else if (latinParent) {
      items.push({ lang:`LA (${latinParentCode})`, text:latinParent, kind:'parent' });
    } else {
      items.push({ lang:'LA', text:'—', kind:'missing' });
    }
    return items;
  }

  function suggestionTranslationHtml(node) {
    return suggestionTranslations(node).map(item => `
      <small class="icd-suggestion-translation is-${escapeHtml(item.kind)}"
        ${item.kind === 'parent' ? 'title="Latin i kategorisë prind — jo titull specifik i nënkodit"' : ''}>
        <b>${escapeHtml(item.lang)}</b><span>${escapeHtml(item.text)}</span>
      </small>`).join('');
  }

  function renderSuggestions() {
    if (!el.icdSuggestions || !el.icdSearchBox) return;
    const query = clean(el.icdSearch?.value);
    const shouldOpen = state.suggestionOpen && query.length >= 2 && (state.suggestionLoading || state.suggestions.length || state.searching);
    el.icdSearchBox.setAttribute('aria-expanded', String(Boolean(shouldOpen)));
    if (!shouldOpen) {
      el.icdSuggestions.hidden = true;
      el.icdSearch?.removeAttribute('aria-activedescendant');
      return;
    }

    el.icdSuggestions.hidden = false;
    const interpreted = clean(state.suggestionMeta?.interpretedAs);
    const interpretation = interpreted && searchNormalize(interpreted) !== searchNormalize(query)
      ? ` · kuptuar si <strong>${escapeHtml(interpreted)}</strong>`
      : '';
    const head = `<div class="icd-suggestion-head"><span>${state.suggestionLoading ? 'Duke rafinuar…' : `${formatNumber(state.suggestions.length)} sugjerime`}${interpretation}</span><strong>↑ ↓ Enter</strong></div>`;

    if (!state.suggestions.length) {
      el.icdSuggestions.innerHTML = head + `<div class="icd-suggestion-empty"><strong>${state.suggestionLoading ? 'Po kërkoj…' : 'Nuk gjeta përputhje të sigurt'}</strong><span>Provo kod, Shqip, English ose Latin — edhe me një typo tjetër.</span></div>`;
      return;
    }

    let previousSection = '';
    const rows = state.suggestions.map((node, index) => {
      const active = index === state.activeSuggestion;
      const match = clean(node?.searchMatch?.label) || 'Përputhje';
      const translations = suggestionTranslationHtml(node);
      const section = node.level === 'category'
        ? 'Kategoritë kryesore'
        : node.level === 'subcategory'
          ? 'Nënkategoritë'
          : 'Konteksti ICD';
      const sectionHead = section !== previousSection
        ? `<div class="icd-suggestion-section" role="presentation">${escapeHtml(section)}</div>`
        : '';
      previousSection = section;
      return `${sectionHead}<button class="icd-suggestion-row is-${escapeHtml(clean(node.level))} ${active ? 'is-active' : ''}" type="button" role="option"
        id="icd-suggestion-${index}" aria-selected="${active}" data-suggestion-index="${index}" data-code="${escapeHtml(clean(node.code))}">
        <span class="icd-suggestion-code">${escapeHtml(clean(node.code))}</span>
        <span class="icd-suggestion-copy"><strong>${escapeHtml(nodeTitle(node))}</strong>${translations}</span>
        <span class="icd-suggestion-meta"><span class="icd-match-chip">${escapeHtml(match)}</span><span class="icd-level-chip">${escapeHtml(levelLabel(node.level))}</span></span>
      </button>`;
    }).join('');
    el.icdSuggestions.innerHTML = head + rows;
    if (state.activeSuggestion >= 0) {
      el.icdSearch?.setAttribute('aria-activedescendant', `icd-suggestion-${state.activeSuggestion}`);
      el.icdSuggestions.querySelector('.icd-suggestion-row.is-active')?.scrollIntoView({ block:'nearest' });
    } else {
      el.icdSearch?.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    renderMetrics();
    renderChapters();
    renderHero();
    renderPath();
    renderSection();
    renderRows();
    renderSuggestions();
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

  let searchAbortController = null;

  function applySuggestionData(query, data, { fromCache = false } = {}) {
    state.searching = true;
    state.query = query;
    state.suggestions = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data?.suggestions) ? data.suggestions : []);
    state.suggestionMeta = data || null;
    state.suggestionOpen = true;
    state.activeSuggestion = state.suggestions.length ? 0 : -1;
    renderSuggestions();

    const top = state.suggestions[0];
    const corrected = top?.searchMatch?.type?.startsWith('fuzzy-') || top?.searchMatch?.type === 'code-fuzzy';
    const suffix = corrected ? ' · typo i korrigjuar' : fromCache ? ' · instant' : '';
    setStatus(`${formatNumber(state.suggestions.length)} sugjerime për «${query}»${suffix}`);
  }

  async function runSearch(query) {
    const value = clean(query);
    if (value.length < 2) return;

    const cached = cachedSuggestions(value);
    if (cached) applySuggestionData(value, cached, { fromCache:true });

    searchAbortController?.abort();
    const controller = new AbortController();
    searchAbortController = controller;
    const requestId = ++state.requestId;
    state.searching = true;
    state.query = value;
    state.suggestionOpen = true;
    state.suggestionLoading = true;

    if (!cached) {
      const preview = immediatePreview(value);
      if (preview.length) {
        state.suggestions = preview;
        state.activeSuggestion = 0;
      }
      setStatus(`Duke kërkuar «${value}»…`, 'busy');
      renderSuggestions();
    }

    try {
      const { payload } = await fetchJson(endpoint('suggest', { q:value }), 6000, controller.signal, 'default');
      if (requestId !== state.requestId) return;
      const data = payload.data || {};
      cacheSuggestions(value, data);
      applySuggestionData(value, data);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      if (requestId !== state.requestId) return;
      if (!state.suggestions.length) setStatus(error?.message || 'Kërkimi dështoi.', 'error');
    } finally {
      if (searchAbortController === controller) searchAbortController = null;
      if (requestId === state.requestId) {
        state.suggestionLoading = false;
        renderSuggestions();
      }
    }
  }

  function clearSearch({ preserveInput = false } = {}) {
    searchAbortController?.abort();
    searchAbortController = null;
    state.searching = false;
    state.query = '';
    state.suggestions = [];
    state.suggestionMeta = null;
    state.suggestionLoading = false;
    state.suggestionOpen = false;
    state.activeSuggestion = -1;
    if (!preserveInput && el.icdSearch?.value) el.icdSearch.value = '';
    renderSuggestions();
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
    const node = [...state.suggestions, ...state.rows].find(row => clean(row.code) === clean(code));
    if (!node) return false;

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
    state.reveal = true;

    if (!Number(node.childCount || 0)) {
      state.rows = [];
      state.loading = false;
      setStatus(`${clean(node.code)} · kodi i zgjedhur`);
      render();
      revealNodePanel();
      return true;
    }

    render();
    await loadChildren(clean(node.code));
    return true;
  }

  async function openHashCode(code) {
    const value = clean(code).toUpperCase();
    if (!value) return false;

    const chapter = state.chapters.find(item => clean(item.code).toUpperCase() === value);
    if (chapter) {
      selectChapter(clean(chapter.code));
      return true;
    }

    await runSearch(value);
    const exact = state.suggestions.find(row => clean(row.code).toUpperCase() === value)
      || state.rows.find(row => clean(row.code).toUpperCase() === value);
    if (exact) return openNode(clean(exact.code));

    return false;
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
        clearSearch({ preserveInput:true });
        setStatus(value ? 'Shkruaj edhe një karakter…' : `${formatNumber(state.chapters.length)} kapituj të ngarkuar`);
        return;
      }

      state.searching = true;
      state.query = value;
      state.suggestionOpen = true;
      const preview = immediatePreview(value);
      if (preview.length) {
        state.suggestions = preview;
        state.activeSuggestion = 0;
        renderSuggestions();
      }
      searchTimer = setTimeout(() => void runSearch(value), 35);
    });

    el.icdSearch.addEventListener('focus', () => {
      if (clean(el.icdSearch.value).length >= 2) {
        state.suggestionOpen = true;
        renderSuggestions();
      }
    });

    el.icdSearch.addEventListener('keydown', event => {
      if (!state.suggestionOpen || !state.suggestions.length) {
        if (event.key === 'Escape') { clearSearch({ preserveInput:true }); el.icdSearch.blur(); }
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const count = state.suggestions.length;
        state.activeSuggestion = (state.activeSuggestion + direction + count) % count;
        renderSuggestions();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const index = state.activeSuggestion >= 0 ? state.activeSuggestion : 0;
        const node = state.suggestions[index];
        if (node) void openNode(clean(node.code));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        state.suggestionOpen = false;
        renderSuggestions();
      }
    });

    el.icdSuggestions?.addEventListener('mousedown', event => event.preventDefault());
    el.icdSuggestions?.addEventListener('click', event => {
      const button = event.target.closest('[data-suggestion-index]');
      if (!button) return;
      const node = state.suggestions[Number(button.dataset.suggestionIndex)];
      if (node) void openNode(clean(node.code));
    });

    document.querySelectorAll('[data-search-example]').forEach(button => {
      button.addEventListener('click', () => {
        const value = clean(button.dataset.searchExample);
        el.icdSearch.value = value;
        el.icdSearch.focus();
        state.suggestionOpen = true;
        void runSearch(value);
      });
    });

    document.addEventListener('pointerdown', event => {
      if (event.target.closest('#icdSearchBox') || event.target.closest('#icdSuggestions')) return;
      state.suggestionOpen = false;
      renderSuggestions();
    });

    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        el.icdSearch.focus();
        el.icdSearch.select();
        if (clean(el.icdSearch.value).length >= 2) { state.suggestionOpen = true; renderSuggestions(); }
      }
    });

    el.menuButton?.addEventListener('click', () => { el.sidebar.classList.add('is-open'); el.sidebarBackdrop.hidden = false; });
    const closeSidebar = () => { el.sidebar.classList.remove('is-open'); el.sidebarBackdrop.hidden = true; };
    el.sidebarClose?.addEventListener('click', closeSidebar);
    el.sidebarBackdrop?.addEventListener('click', closeSidebar);

    el.logoutButton?.addEventListener('click', async () => {
      el.logoutButton.disabled = true;
      try {
        const response = await fetch('/api/auth', { method:'DELETE', credentials:'same-origin', headers:{ Accept:'application/json' } });
        if (!response.ok) throw new Error('Logout failed');
        location.replace('/landing.html');
      } catch {
        el.logoutButton.disabled = false;
        showToast('Dalja nuk u krye. Provo përsëri.');
      }
    });

    window.addEventListener('hashchange', () => {
      const code = readHash();
      if (!code) return;
      void openHashCode(code);
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
      const opened = hash ? await openHashCode(hash) : false;
      if (!opened && state.chapters.length) selectChapter(clean(state.chapters[0].code));
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
