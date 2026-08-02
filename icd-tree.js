(() => {
  'use strict';

  const API = '/api/icd';
  const CACHE_KEY = 'medindex_icd_tree_nav_v1';
  const CACHE_TTL = 15 * 60 * 1000;
  const LABELS = Object.freeze({ chapter:'Kapitull', block:'Bllok', category:'Kategori', subcategory:'Nënkategori' });
  const els = {};
  const nodes = new Map();
  const childrenCache = new Map();
  let nav = null;
  let selectedCode = '';
  let activeRequest = null;
  let suggestionRequest = null;
  let suggestionTimer = 0;
  let suggestionRows = [];
  let selectedSuggestion = -1;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const count = value => Number(value || 0).toLocaleString('sq-AL');
  const label = level => LABELS[level] || clean(level) || '—';

  function endpoint(view, values = {}) {
    const params = new URLSearchParams({ view });
    Object.entries(values).forEach(([key, value]) => { if (clean(value)) params.set(key, clean(value)); });
    return `${API}?${params}`;
  }

  async function getJson(url, controller) {
    const response = await fetch(url, {
      credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' }, signal:controller?.signal,
    });
    if (!response.ok) {
      let detail = '';
      try { detail = clean((await response.json())?.detail); } catch {}
      throw new Error(detail || `ICD API ${response.status}`);
    }
    const payload = await response.json();
    if (!payload?.ok || !payload?.data) throw new Error('Përgjigje e pavlefshme ICD-10.');
    return payload.data;
  }

  function remember(rows) {
    (rows || []).forEach(row => { if (row?.code) nodes.set(clean(row.code), row); });
  }

  function cachedNav() {
    try {
      const value = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      return value?.data && Date.now() - Number(value.savedAt || 0) < CACHE_TTL ? value.data : null;
    } catch { return null; }
  }

  function saveNav(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt:Date.now(), data })); } catch {}
  }

  function title(node) {
    return clean(node?.displayTitle || node?.albanianDraft || node?.englishTitle || node?.code);
  }

  function statusBadge(node) {
    const status = clean(node?.translationStatus);
    if (status === 'verified') return '<span class="icd-tree-translation is-verified">I verifikuar</span>';
    if (status === 'standardized') return '<span class="icd-tree-translation is-standardized">I standardizuar</span>';
    if (status === 'missing') return '<span class="icd-tree-translation is-missing">Vetëm anglisht</span>';
    return '<span class="icd-tree-translation is-draft">Draft</span>';
  }

  const chevron = () => '<span class="icd-tree-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>';

  function rowMarkup(node, depth = 1) {
    const code = clean(node.code);
    const expandable = Number(node.childCount || 0) > 0 && node.level !== 'subcategory';
    const english = clean(node.englishTitle);
    const display = title(node);
    const secondary = english && english.toLowerCase() !== display.toLowerCase();
    return `<div class="icd-tree-node level-${esc(node.level)}" role="treeitem" aria-level="${depth}"${expandable ? ' aria-expanded="false"' : ''} data-icd-tree-node="${esc(code)}" data-level="${esc(node.level)}">
      <div class="icd-tree-row${selectedCode === code ? ' is-selected' : ''}">
        <button class="icd-tree-toggle" type="button" data-tree-toggle="${esc(code)}" aria-label="${expandable ? 'Hap' : 'Shiko'} ${esc(code)}">
          ${expandable ? chevron() : '<span class="icd-tree-leaf" aria-hidden="true"></span>'}
          <span class="icd-tree-code">${esc(code)}</span>
          <span class="icd-tree-copy"><strong>${esc(display)}</strong>${secondary ? `<small>${esc(english)}</small>` : ''}</span>
          <span class="icd-tree-meta">${statusBadge(node)}${expandable ? `<span class="icd-tree-count">${count(node.childCount)}</span>` : ''}</span>
        </button>
        <button class="icd-tree-detail" type="button" data-open-code="${esc(code)}" aria-label="Hap detajet për ${esc(code)}">Detaje</button>
      </div>
      ${expandable ? `<div class="icd-tree-children" role="group" data-tree-children="${esc(code)}" hidden></div>` : ''}
    </div>`;
  }

  function renderMeta(meta) {
    const counts = meta?.counts || {};
    const quality = meta?.quality || {};
    els.total.textContent = count(counts.total);
    els.categories.textContent = count(counts.category);
    els.subcategories.textContent = count(counts.subcategory);
    els.standardized.textContent = count(quality.standardizedTranslations ?? quality.reviewedTranslations ?? 0);
  }

  function loading() {
    els.tree.setAttribute('aria-busy', 'true');
    els.tree.innerHTML = '<div class="icd-tree-loading"><span class="icd-tree-spinner" aria-hidden="true"></span><p>Po ngarkohet hierarkia ICD-10…</p></div>';
    els.status.textContent = 'Duke u ngarkuar…';
    els.status.classList.remove('is-error');
    els.retry.hidden = true;
  }

  function errorState(error) {
    console.error('ICD tree load failed:', error);
    els.tree.setAttribute('aria-busy', 'false');
    els.tree.innerHTML = `<div class="icd-tree-error" role="alert"><strong>Hierarkia ICD-10 nuk u ngarkua.</strong><p>${esc(error?.message || 'Provo përsëri.')}</p></div>`;
    els.status.textContent = 'Gabim gjatë ngarkimit';
    els.status.classList.add('is-error');
    els.retry.hidden = false;
  }

  function renderChapters() {
    const chapters = nav?.chapters || [];
    remember(chapters);
    els.tree.setAttribute('aria-busy', 'false');
    els.tree.innerHTML = chapters.map(chapter => rowMarkup(chapter, 1)).join('');
    els.status.textContent = `${count(chapters.length)} kapituj kryesorë`;
    els.status.classList.remove('is-error');
    els.retry.hidden = true;
  }

  async function loadNavigation({ force = false } = {}) {
    activeRequest?.abort();
    activeRequest = new AbortController();
    loading();
    try {
      nav = force ? null : cachedNav();
      if (!nav) {
        nav = await getJson(endpoint('nav'), activeRequest);
        saveNav(nav);
      }
      remember(nav.chapters);
      remember(nav.blocks);
      renderMeta(nav.meta);
      renderChapters();
      const params = new URLSearchParams(location.search);
      const code = clean(params.get('code') || params.get('parent'));
      const chapter = clean(params.get('chapter'));
      if (code) await revealCode(code, { history:false, focus:false });
      else if (chapter) await expandNode(chapter, false);
      document.documentElement.dataset.miIcdTree = 'ready';
      window.dispatchEvent(new CustomEvent('medindex:icd-tree-ready', { detail:{ counts:nav.meta?.counts || {} } }));
    } catch (error) {
      if (error.name !== 'AbortError') errorState(error);
    }
  }

  function blocksForChapter(code) {
    return (nav?.blocks || []).filter(block => clean(block.chapter) === clean(code));
  }

  async function loadChildren(code, node) {
    const key = clean(code);
    if (childrenCache.has(key)) return childrenCache.get(key);
    const rows = node?.level === 'chapter'
      ? blocksForChapter(key)
      : (await getJson(endpoint('children', { parent:key }))).rows || [];
    remember(rows);
    childrenCache.set(key, rows);
    return rows;
  }

  function item(code) {
    return els.tree.querySelector(`[data-icd-tree-node="${CSS.escape(clean(code))}"]`);
  }

  function collapseNode(code, recursive = false) {
    const target = item(code);
    if (!target || target.getAttribute('aria-expanded') === null) return;
    target.setAttribute('aria-expanded', 'false');
    target.classList.remove('is-open');
    const group = target.querySelector(':scope > [data-tree-children]');
    if (group) group.hidden = true;
    if (recursive) target.querySelectorAll('[data-icd-tree-node][aria-expanded="true"]').forEach(child => collapseNode(child.dataset.icdTreeNode, false));
  }

  function collapseSiblings(target) {
    [...(target.parentElement?.children || [])].forEach(sibling => {
      if (sibling !== target && sibling.matches?.('[data-icd-tree-node]')) collapseNode(sibling.dataset.icdTreeNode, true);
    });
  }

  async function expandNode(code, focus = true) {
    const target = item(code);
    if (!target || target.getAttribute('aria-expanded') === null) return false;
    if (target.getAttribute('aria-expanded') === 'true') {
      if (focus) target.querySelector('[data-tree-toggle]')?.focus({ preventScroll:true });
      return true;
    }
    collapseSiblings(target);
    target.setAttribute('aria-expanded', 'true');
    target.classList.add('is-open', 'is-loading');
    const group = target.querySelector(':scope > [data-tree-children]');
    group.hidden = false;
    if (!group.dataset.loaded) {
      group.innerHTML = '<div class="icd-tree-child-loading">Po ngarkohet…</div>';
      try {
        const rows = await loadChildren(code, nodes.get(clean(code)) || { code, level:target.dataset.level });
        const depth = Number(target.getAttribute('aria-level') || 1) + 1;
        group.innerHTML = rows.length ? rows.map(row => rowMarkup(row, depth)).join('') : '<div class="icd-tree-empty">Nuk ka nënkode direkte.</div>';
        group.dataset.loaded = 'true';
      } catch (error) {
        target.setAttribute('aria-expanded', 'false');
        target.classList.remove('is-open');
        group.hidden = true;
        group.innerHTML = '';
        throw error;
      } finally { target.classList.remove('is-loading'); }
    } else target.classList.remove('is-loading');
    if (focus) target.querySelector('[data-tree-toggle]')?.focus({ preventScroll:true });
    return true;
  }

  function select(code, { detail = false, history = true } = {}) {
    selectedCode = clean(code);
    els.tree.querySelectorAll('.icd-tree-row.is-selected').forEach(row => row.classList.remove('is-selected'));
    item(selectedCode)?.querySelector(':scope > .icd-tree-row')?.classList.add('is-selected');
    if (history) {
      const url = new URL('/icd.html', location.origin);
      if (selectedCode) url.searchParams.set('code', selectedCode);
      const q = clean(els.search.value);
      if (q) url.searchParams.set('q', q);
      window.history.pushState({ medindexIcdTree:true, code:selectedCode }, '', `${url.pathname}${url.search}`);
    }
    if (detail) window.dispatchEvent(new CustomEvent('medindex:icd-open-detail', { detail:{ code:selectedCode } }));
    window.dispatchEvent(new CustomEvent('medindex:icd-state', { detail:{ code:selectedCode, parent:selectedCode, node:nodes.get(selectedCode) || null } }));
  }

  async function toggle(code) {
    const target = item(code);
    if (!target) return;
    if (target.getAttribute('aria-expanded') === null) return select(code, { detail:true });
    if (target.getAttribute('aria-expanded') === 'true') collapseNode(code, true);
    else {
      try { await expandNode(code); }
      catch (error) {
        const row = target.querySelector(':scope > .icd-tree-row');
        const message = document.createElement('span');
        message.className = 'icd-tree-inline-error';
        message.textContent = clean(error?.message || 'Nuk u ngarkua.');
        row?.appendChild(message);
        setTimeout(() => message.remove(), 3000);
      }
    }
  }

  async function revealCode(code, { history = true, focus = true } = {}) {
    const key = clean(code);
    if (!key) return null;
    const data = await getJson(endpoint('resolve', { code:key }));
    const path = [...(data.ancestors || []), data.node].filter(Boolean);
    remember(path);
    for (const ancestor of path.slice(0, -1)) {
      if (item(ancestor.code)) await expandNode(ancestor.code, false);
    }
    const target = item(key);
    select(key, { history });
    target?.scrollIntoView({ behavior:'smooth', block:'center' });
    if (focus) target?.querySelector('[data-tree-toggle]')?.focus({ preventScroll:true });
    return target;
  }

  function closeSuggestions() {
    els.suggestions.hidden = true;
    els.suggestions.innerHTML = '';
    els.search.setAttribute('aria-expanded', 'false');
    suggestionRows = [];
    selectedSuggestion = -1;
  }

  function suggestionMarkup(node, index) {
    return `<button class="icd-suggestion" type="button" role="option" aria-selected="false" data-suggestion-index="${index}" data-code="${esc(node.code)}" data-level="${esc(node.level)}"><span class="icd-suggestion-code">${esc(node.code)}</span><span class="icd-suggestion-copy"><strong>${esc(title(node))}</strong><small>${esc(node.englishTitle || '')}</small></span><span class="icd-suggestion-level">${esc(node.searchMatch?.label || label(node.level))}</span></button>`;
  }

  async function loadSuggestions(query) {
    suggestionRequest?.abort();
    const q = clean(query);
    if (q.length < 2) return closeSuggestions();
    suggestionRequest = new AbortController();
    try {
      const data = await getJson(endpoint('suggest', { q }), suggestionRequest);
      suggestionRows = Array.isArray(data.rows) ? data.rows : [];
      remember(suggestionRows);
      if (!suggestionRows.length) return closeSuggestions();
      els.suggestions.innerHTML = suggestionRows.map(suggestionMarkup).join('');
      els.suggestions.hidden = false;
      els.search.setAttribute('aria-expanded', 'true');
      selectedSuggestion = -1;
    } catch (error) {
      if (error.name !== 'AbortError') console.error('ICD suggestions failed:', error);
      closeSuggestions();
    }
  }

  async function chooseSuggestion(index) {
    const node = suggestionRows[index];
    if (!node) return;
    els.search.value = node.code;
    els.clear.hidden = false;
    closeSuggestions();
    try {
      await revealCode(node.code, { history:true, focus:true });
      if (node.level === 'subcategory') select(node.code, { detail:true, history:false });
    } catch (error) { errorState(error); }
  }

  function visibleButtons() {
    return [...els.tree.querySelectorAll('[data-tree-toggle]')].filter(button => !button.closest('[data-tree-children][hidden]'));
  }

  function move(button, delta) {
    const buttons = visibleButtons();
    const index = buttons.indexOf(button);
    buttons[Math.max(0, Math.min(buttons.length - 1, index + delta))]?.focus();
  }

  function bindTree() {
    els.tree.addEventListener('click', async event => {
      const detail = event.target.closest('[data-open-code]');
      if (detail) return select(detail.dataset.openCode, { detail:true });
      const button = event.target.closest('[data-tree-toggle]');
      if (button) await toggle(button.dataset.treeToggle);
    });
    els.tree.addEventListener('keydown', async event => {
      const button = event.target.closest('[data-tree-toggle]');
      if (!button) return;
      const target = button.closest('[data-icd-tree-node]');
      const code = button.dataset.treeToggle;
      if (event.key === 'ArrowDown') { event.preventDefault(); move(button, 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(button, -1); }
      else if (event.key === 'Home') { event.preventDefault(); visibleButtons()[0]?.focus(); }
      else if (event.key === 'End') { event.preventDefault(); visibleButtons().at(-1)?.focus(); }
      else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (target?.getAttribute('aria-expanded') === 'false') await expandNode(code);
        else target?.querySelector(':scope > [data-tree-children] [data-tree-toggle]')?.focus();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (target?.getAttribute('aria-expanded') === 'true') collapseNode(code, true);
        else target?.parentElement?.closest('[data-icd-tree-node]')?.querySelector(':scope > .icd-tree-row [data-tree-toggle]')?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); await toggle(code); }
    });
  }

  function bindSearch() {
    els.search.addEventListener('input', () => {
      const q = clean(els.search.value);
      els.clear.hidden = !q;
      clearTimeout(suggestionTimer);
      suggestionTimer = setTimeout(() => loadSuggestions(q), 180);
    });
    els.search.addEventListener('keydown', event => {
      const options = [...els.suggestions.querySelectorAll('[role="option"]')];
      if (event.key === 'Escape') return closeSuggestions();
      if (!options.length || els.suggestions.hidden) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        selectedSuggestion = (selectedSuggestion + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => option.setAttribute('aria-selected', String(index === selectedSuggestion)));
        options[selectedSuggestion]?.scrollIntoView({ block:'nearest' });
      } else if (event.key === 'Enter') { event.preventDefault(); chooseSuggestion(selectedSuggestion >= 0 ? selectedSuggestion : 0); }
    });
    els.suggestions.addEventListener('click', event => {
      const option = event.target.closest('[data-suggestion-index]');
      if (option) chooseSuggestion(Number(option.dataset.suggestionIndex));
    });
    els.clear.addEventListener('click', () => {
      els.search.value = '';
      els.clear.hidden = true;
      closeSuggestions();
      els.search.focus();
      history.pushState({ medindexIcdTree:true }, '', '/icd.html');
    });
    document.addEventListener('click', event => { if (!event.target.closest('.icd-search-wrap')) closeSuggestions(); });
  }

  function collapseAll() {
    els.tree.querySelectorAll('[data-icd-tree-node][aria-expanded="true"]').forEach(node => collapseNode(node.dataset.icdTreeNode, true));
    els.tree.scrollTo({ top:0, behavior:'smooth' });
  }

  function cacheElements() {
    Object.assign(els, {
      tree:document.getElementById('icdTree'), status:document.getElementById('icdTreeStatus'), retry:document.getElementById('icdTreeRetry'), collapse:document.getElementById('icdCollapseAll'),
      search:document.getElementById('icdSearch'), clear:document.getElementById('icdSearchClear'), suggestions:document.getElementById('icdSuggestions'),
      total:document.getElementById('icdTotalNodes'), categories:document.getElementById('icdTotalCategories'), subcategories:document.getElementById('icdTotalSubcategories'), standardized:document.getElementById('icdTranslationCoverage'),
    });
    return Object.values(els).every(Boolean);
  }

  function compatibility() {
    window.MedIndexIcdTable = {
      openFilter:async ({ parent = '', chapter = '', q = '' } = {}) => {
        if (q) els.search.value = q;
        if (parent) return revealCode(parent, { history:true });
        if (chapter) return expandNode(chapter);
        collapseAll();
        return true;
      },
      revealCode,
      reload:() => loadNavigation({ force:true }),
      state:() => ({ code:selectedCode, q:clean(els.search.value) }),
    };
  }

  function init() {
    if (!cacheElements()) return;
    bindTree();
    bindSearch();
    els.retry.addEventListener('click', () => loadNavigation({ force:true }));
    els.collapse.addEventListener('click', collapseAll);
    window.addEventListener('popstate', () => {
      const params = new URLSearchParams(location.search);
      const code = clean(params.get('code') || params.get('parent'));
      if (code) revealCode(code, { history:false, focus:false }).catch(errorState);
      else collapseAll();
    });
    compatibility();
    loadNavigation();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
