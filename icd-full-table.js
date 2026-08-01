(() => {
  'use strict';

  const API = '/api/icd';
  const PAGE_SIZES = new Set([25, 50, 100]);
  const LEVEL_LABELS = Object.freeze({
    chapter:'Kapitull',
    block:'Bllok',
    category:'Kategori',
    subcategory:'Nënkategori',
  });
  const els = {};
  let state = null;
  let activeRequest = null;
  let suggestionRequest = null;
  let suggestionTimer = 0;
  let selectedSuggestion = -1;
  let lastPayload = null;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const normalizeLevel = value => ['category', 'subcategory'].includes(clean(value)) ? clean(value) : '';
  const clampPage = value => Math.max(1, Number(value) || 1);
  const pageSize = value => PAGE_SIZES.has(Number(value)) ? Number(value) : 50;

  function readState() {
    const params = new URLSearchParams(location.search);
    return {
      q:clean(params.get('q')),
      parent:clean(params.get('parent')),
      chapter:clean(params.get('chapter')),
      level:normalizeLevel(params.get('level')),
      page:clampPage(params.get('page')),
      pageSize:pageSize(params.get('pageSize')),
    };
  }

  function stateUrl(next = state) {
    const url = new URL('/icd.html', location.origin);
    if (next.q) url.searchParams.set('q', next.q);
    if (next.parent) url.searchParams.set('parent', next.parent);
    if (next.chapter) url.searchParams.set('chapter', next.chapter);
    if (next.level) url.searchParams.set('level', next.level);
    if (next.page > 1) url.searchParams.set('page', String(next.page));
    if (next.pageSize !== 50) url.searchParams.set('pageSize', String(next.pageSize));
    return `${url.pathname}${url.search}`;
  }

  function syncUrl({ replace = false } = {}) {
    const next = stateUrl();
    const current = `${location.pathname}${location.search}`;
    if (next === current) return;
    history[replace ? 'replaceState' : 'pushState']({ medindexIcd:true }, '', next);
  }

  function dispatchState() {
    window.dispatchEvent(new CustomEvent('medindex:icd-state', {
      detail:{ ...state, payload:lastPayload },
    }));
  }

  function apiUrl(view = 'table', overrides = {}) {
    const params = new URLSearchParams({ view });
    const source = { ...state, ...overrides };
    for (const key of ['q', 'parent', 'chapter']) if (source[key]) params.set(key, source[key]);
    if (source.level) params.set('levels', source.level);
    if (view === 'table') {
      params.set('page', String(source.page || 1));
      params.set('pageSize', String(source.pageSize || 50));
    }
    return `${API}?${params.toString()}`;
  }

  async function fetchJson(url, controller) {
    const response = await fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json' },
      signal:controller?.signal,
    });
    if (!response.ok) throw new Error(`ICD API ${response.status}`);
    const payload = await response.json();
    if (!payload?.ok || !payload?.data) throw new Error('Përgjigje e pavlefshme ICD.');
    return payload.data;
  }

  function setLoading() {
    els.body.innerHTML = '<tr><td colspan="7" class="icd-loading">Po ngarkohet hierarkia e plotë ICD-10…</td></tr>';
    els.count.textContent = 'Duke u ngarkuar…';
    els.pagination.hidden = true;
  }

  function levelLabel(level) {
    return LEVEL_LABELS[level] || level || '—';
  }

  function translationBadge(node) {
    if (node.translationStatus === 'missing') return '<span class="icd-translation-badge is-missing">Mungon shqipja</span>';
    return '<span class="icd-translation-badge is-draft">Draft automatik</span>';
  }

  function rowActions(node) {
    const actions = [];
    if (Number(node.childCount || 0) > 0) {
      actions.push(`<button class="icd-row-action is-primary" type="button" data-icd-open-branch="${esc(node.code)}" data-level="${esc(node.level)}">Hap degën</button>`);
    }
    actions.push(`<button class="icd-row-action" type="button" data-icd-copy="${esc(node.code)}">Kopjo kodin</button>`);
    actions.push(`<a class="icd-row-action" href="${esc(node.sourceUrl)}" target="_blank" rel="noopener noreferrer">WHO</a>`);
    return actions.join('');
  }

  function tableRow(node) {
    const albanian = node.albanianDraft
      ? `<span class="icd-title-main">${esc(node.albanianDraft)}</span>`
      : `<span class="icd-title-main">${esc(node.englishTitle)}</span><span class="icd-title-fallback">Përkthimi shqip nuk është verifikuar ende.</span>`;
    return `<tr data-icd-row="${esc(node.code)}">
      <td data-label="Kodi"><span class="icd-code">${esc(node.code)}</span></td>
      <td data-label="Titulli shqip">${albanian}</td>
      <td data-label="Titulli anglisht">${esc(node.englishTitle)}</td>
      <td data-label="Niveli"><span class="icd-level-badge">${esc(levelLabel(node.level))}</span></td>
      <td data-label="Kapitulli / blloku">${esc([node.chapter, node.block].filter(Boolean).join(' · ') || '—')}</td>
      <td data-label="Përkthimi">${translationBadge(node)}</td>
      <td data-label="Veprimet"><div class="icd-row-actions">${rowActions(node)}</div></td>
    </tr>`;
  }

  function renderTable(payload) {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    els.body.innerHTML = rows.length
      ? rows.map(tableRow).join('')
      : '<tr><td colspan="7" class="icd-empty">Nuk u gjet asnjë kod për këtë kërkim ose filtër.</td></tr>';
    const start = payload.total ? ((payload.page - 1) * payload.pageSize) + 1 : 0;
    const end = Math.min(payload.total, payload.page * payload.pageSize);
    els.count.textContent = `${payload.total.toLocaleString('sq-AL')} rezultate`;
    els.pageInfo.textContent = payload.total ? `${start.toLocaleString('sq-AL')}–${end.toLocaleString('sq-AL')} nga ${payload.total.toLocaleString('sq-AL')}` : '0 rezultate';
    els.pageCurrent.textContent = `Faqja ${payload.page} / ${payload.totalPages}`;
    els.prev.disabled = payload.page <= 1;
    els.next.disabled = payload.page >= payload.totalPages;
    els.pagination.hidden = false;
  }

  function renderMeta(meta) {
    const counts = meta?.counts || {};
    els.totalNodes.textContent = Number(counts.total || 0).toLocaleString('sq-AL');
    els.totalCategories.textContent = Number(counts.category || 0).toLocaleString('sq-AL');
    els.totalSubcategories.textContent = Number(counts.subcategory || 0).toLocaleString('sq-AL');
    els.translationCoverage.textContent = `${Number(meta?.quality?.translationCoverage || 0).toLocaleString('sq-AL')}%`;
  }

  function renderContext(payload) {
    const context = payload.context;
    const ancestors = Array.isArray(payload.ancestors) ? payload.ancestors : [];
    const hasContext = Boolean(context || state.chapter || state.q || state.level);
    els.context.hidden = !hasContext;
    if (!hasContext) return;

    let kicker = 'Filtri aktiv';
    let title = 'Të gjitha diagnozat ICD-10';
    const path = [];
    if (context) {
      kicker = levelLabel(context.level);
      title = `${context.code} — ${context.displayTitle}`;
      path.push(...ancestors.map(item => `${item.code} — ${item.displayTitle}`));
    } else if (state.chapter) {
      kicker = 'Kapitulli';
      title = `Kapitulli ${state.chapter}`;
    }
    if (state.q) path.push(`Kërkimi: “${state.q}”`);
    if (state.level) path.push(`Niveli: ${levelLabel(state.level)}`);
    els.contextKicker.textContent = kicker;
    els.contextTitle.textContent = title;
    els.contextPath.textContent = path.join(' › ') || 'Hierarkia ICD-10-WHO 2019';
  }

  async function load({ replaceUrl = false, keepFocus = false } = {}) {
    activeRequest?.abort();
    activeRequest = new AbortController();
    if (!keepFocus) setLoading();
    syncControls();
    syncUrl({ replace:replaceUrl });
    try {
      const payload = await fetchJson(apiUrl('table'), activeRequest);
      lastPayload = payload;
      if (payload.page > payload.totalPages && payload.totalPages > 0) {
        state.page = payload.totalPages;
        return load({ replaceUrl:true, keepFocus });
      }
      renderMeta(payload.meta);
      renderContext(payload);
      renderTable(payload);
      dispatchState();
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('ICD full table load failed:', error);
      els.body.innerHTML = '<tr><td colspan="7" class="icd-error">Të dhënat ICD-10 nuk u ngarkuan. Provo përsëri.</td></tr>';
      els.count.textContent = 'Gabim gjatë ngarkimit';
      els.pagination.hidden = true;
    }
  }

  function syncControls() {
    if (els.search.value !== state.q) els.search.value = state.q;
    els.clear.hidden = !state.q;
    els.level.value = state.level;
    els.pageSize.value = String(state.pageSize);
  }

  function updateState(patch, options = {}) {
    state = { ...state, ...patch };
    if (!Object.hasOwn(patch, 'page')) state.page = 1;
    return load(options);
  }

  function closeSuggestions() {
    els.suggestions.hidden = true;
    els.suggestions.innerHTML = '';
    selectedSuggestion = -1;
    els.search.setAttribute('aria-expanded', 'false');
  }

  function renderSuggestions(rows) {
    if (!rows.length) return closeSuggestions();
    els.suggestions.innerHTML = rows.map((node, index) => `<button class="icd-suggestion" type="button" role="option" aria-selected="${index === selectedSuggestion}" data-suggestion-index="${index}" data-code="${esc(node.code)}" data-level="${esc(node.level)}">
      <span class="icd-suggestion-code">${esc(node.code)}</span>
      <span class="icd-suggestion-copy"><strong>${esc(node.displayTitle)}</strong><small>${esc(node.englishTitle)}</small></span>
      <span class="icd-suggestion-level">${esc(levelLabel(node.level))}</span>
    </button>`).join('');
    els.suggestions.hidden = false;
    els.search.setAttribute('aria-expanded', 'true');
  }

  async function loadSuggestions(query) {
    suggestionRequest?.abort();
    const q = clean(query);
    if (q.length < 2) return closeSuggestions();
    suggestionRequest = new AbortController();
    try {
      const payload = await fetchJson(`${API}?view=suggest&q=${encodeURIComponent(q)}`, suggestionRequest);
      renderSuggestions(payload.rows || []);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('ICD suggestions failed:', error);
      closeSuggestions();
    }
  }

  function chooseNode(node) {
    if (!node) return;
    closeSuggestions();
    if (node.level === 'chapter') return updateState({ q:'', parent:'', chapter:node.code, level:'', page:1 });
    if (node.level === 'block' || node.level === 'category') return updateState({ q:'', parent:node.code, chapter:'', level:'', page:1 });
    return updateState({ q:node.code, parent:'', chapter:'', level:'', page:1 });
  }

  function suggestionNode(button) {
    const code = button?.dataset.code;
    const payloadRows = Array.from(els.suggestions.querySelectorAll('[data-code]'));
    const index = payloadRows.indexOf(button);
    const current = els.suggestionsPayload?.[index];
    return current || { code, level:button?.dataset.level };
  }

  async function refreshSuggestions() {
    const q = clean(els.search.value);
    suggestionRequest?.abort();
    if (q.length < 2) return closeSuggestions();
    suggestionRequest = new AbortController();
    try {
      const payload = await fetchJson(`${API}?view=suggest&q=${encodeURIComponent(q)}`, suggestionRequest);
      els.suggestionsPayload = payload.rows || [];
      selectedSuggestion = -1;
      renderSuggestions(els.suggestionsPayload);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('ICD suggestions failed:', error);
      closeSuggestions();
    }
  }

  async function copyCode(code, button) {
    try {
      await navigator.clipboard.writeText(code);
      const original = button.textContent;
      button.textContent = 'U kopjua';
      setTimeout(() => { button.textContent = original; }, 1200);
    } catch {
      window.prompt('Kopjo kodin ICD-10:', code);
    }
  }

  function bindEvents() {
    els.search.addEventListener('input', () => {
      state.q = clean(els.search.value);
      state.page = 1;
      els.clear.hidden = !state.q;
      clearTimeout(suggestionTimer);
      suggestionTimer = setTimeout(refreshSuggestions, 180);
      clearTimeout(els.searchTimer);
      els.searchTimer = setTimeout(() => load({ keepFocus:true }), 360);
    });
    els.search.addEventListener('keydown', event => {
      const options = [...els.suggestions.querySelectorAll('[role="option"]')];
      if (event.key === 'Escape') return closeSuggestions();
      if (!options.length || els.suggestions.hidden) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        selectedSuggestion = (selectedSuggestion + delta + options.length) % options.length;
        options.forEach((option, index) => option.setAttribute('aria-selected', String(index === selectedSuggestion)));
        options[selectedSuggestion].scrollIntoView({ block:'nearest' });
      } else if (event.key === 'Enter' && selectedSuggestion >= 0) {
        event.preventDefault();
        chooseNode(els.suggestionsPayload?.[selectedSuggestion]);
      }
    });
    els.suggestions.addEventListener('click', event => {
      const button = event.target.closest('[data-suggestion-index]');
      if (!button) return;
      chooseNode(els.suggestionsPayload?.[Number(button.dataset.suggestionIndex)]);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.icd-search-wrap')) closeSuggestions();
    });
    els.clear.addEventListener('click', () => {
      els.search.value = '';
      closeSuggestions();
      updateState({ q:'', page:1 }, { keepFocus:true });
      els.search.focus();
    });
    els.level.addEventListener('change', () => updateState({ level:normalizeLevel(els.level.value), page:1 }));
    els.pageSize.addEventListener('change', () => updateState({ pageSize:pageSize(els.pageSize.value), page:1 }));
    els.prev.addEventListener('click', () => updateState({ page:Math.max(1, state.page - 1) }));
    els.next.addEventListener('click', () => updateState({ page:state.page + 1 }));
    els.clearFilters.addEventListener('click', () => updateState({ q:'', parent:'', chapter:'', level:'', page:1 }));
    els.openSidebar.addEventListener('click', () => window.dispatchEvent(new CustomEvent('medindex:open-icd-sidebar', { detail:{ ...state } })));
    els.body.addEventListener('click', event => {
      const branch = event.target.closest('[data-icd-open-branch]');
      if (branch) {
        const code = branch.dataset.icdOpenBranch;
        const level = branch.dataset.level;
        if (level === 'chapter') updateState({ q:'', parent:'', chapter:code, level:'', page:1 });
        else updateState({ q:'', parent:code, chapter:'', level:'', page:1 });
        return;
      }
      const copy = event.target.closest('[data-icd-copy]');
      if (copy) copyCode(copy.dataset.icdCopy, copy);
    });
    window.addEventListener('popstate', () => {
      state = readState();
      closeSuggestions();
      load({ replaceUrl:true });
    });
  }

  function cacheElements() {
    Object.assign(els, {
      search:document.getElementById('icdSearch'),
      clear:document.getElementById('icdSearchClear'),
      suggestions:document.getElementById('icdSuggestions'),
      level:document.getElementById('icdLevelFilter'),
      pageSize:document.getElementById('icdPageSize'),
      count:document.getElementById('icdResultCount'),
      body:document.getElementById('icdTableBody'),
      pagination:document.getElementById('icdPagination'),
      pageInfo:document.getElementById('icdPageInfo'),
      pageCurrent:document.getElementById('icdPageCurrent'),
      prev:document.getElementById('icdPrevPage'),
      next:document.getElementById('icdNextPage'),
      context:document.getElementById('icdContext'),
      contextKicker:document.getElementById('icdContextKicker'),
      contextTitle:document.getElementById('icdContextTitle'),
      contextPath:document.getElementById('icdContextPath'),
      clearFilters:document.getElementById('icdClearFilters'),
      openSidebar:document.getElementById('icdOpenSidebar'),
      totalNodes:document.getElementById('icdTotalNodes'),
      totalCategories:document.getElementById('icdTotalCategories'),
      totalSubcategories:document.getElementById('icdTotalSubcategories'),
      translationCoverage:document.getElementById('icdTranslationCoverage'),
    });
    return Object.values(els).every(Boolean);
  }

  function init() {
    if (!cacheElements()) return;
    state = readState();
    bindEvents();
    syncControls();
    load({ replaceUrl:true });
    window.MedIndexIcdTable = Object.freeze({
      getState:() => ({ ...state }),
      openFilter:patch => updateState({ q:'', parent:'', chapter:'', level:'', page:1, ...patch }),
      reload:() => load({ replaceUrl:true }),
    });
    window.dispatchEvent(new CustomEvent('medindex:icd-table-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
