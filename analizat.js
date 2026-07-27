(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const NEON_TIMEOUT_MS = 3500;
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));
  const normalize = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq')
    .replace(/[^a-z0-9%+./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const CATEGORY_THEMES = [
    { accent:'#0f766e', strong:'#115e59', soft:'#e6f6f3', ring:'#99d8cf' },
    { accent:'#2563eb', strong:'#1d4ed8', soft:'#eaf1ff', ring:'#b7cbff' },
    { accent:'#7c3aed', strong:'#6d28d9', soft:'#f2ebff', ring:'#d5c0ff' },
    { accent:'#d97706', strong:'#b45309', soft:'#fff4dd', ring:'#f4d08e' },
    { accent:'#0891b2', strong:'#0e7490', soft:'#e5f8fc', ring:'#a8dfe9' },
    { accent:'#15803d', strong:'#166534', soft:'#eaf8ee', ring:'#b8dfc4' },
    { accent:'#ea580c', strong:'#c2410c', soft:'#fff0e7', ring:'#ffc5a2' },
    { accent:'#dc2626', strong:'#b91c1c', soft:'#fff0f0', ring:'#ffc1c1' },
    { accent:'#4f46e5', strong:'#4338ca', soft:'#eeedff', ring:'#c9c6ff' },
    { accent:'#e11d48', strong:'#be123c', soft:'#fff0f4', ring:'#ffc2d0' },
    { accent:'#a21caf', strong:'#86198f', soft:'#faedfc', ring:'#e8b8ed' },
    { accent:'#65a30d', strong:'#4d7c0f', soft:'#f3f9e7', ring:'#cde5a2' },
    { accent:'#475569', strong:'#334155', soft:'#eef2f6', ring:'#cbd5e1' },
    { accent:'#0d9488', strong:'#0f766e', soft:'#e8f8f5', ring:'#a8ded6' },
  ];

  const state = {
    data:null,
    categories:new Map(),
    searchable:[],
    lastFocused:null,
    renderTimer:0,
    renderFrame:0,
    dataSource:'local',
  };

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', theme === 'dark' ? 'Aktivizo temën e çelët' : 'Aktivizo temën e errët');
    }
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    applyTheme(['dark', 'light'].includes(saved) ? saved : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function categoryTheme(number) {
    return CATEGORY_THEMES[Math.max(0, Number(number || 1) - 1) % CATEGORY_THEMES.length];
  }

  function themeStyle(number) {
    const theme = categoryTheme(number);
    return `--lab-accent:${theme.accent};--lab-strong:${theme.strong};--lab-soft:${theme.soft};--lab-ring:${theme.ring}`;
  }

  function svgIcon(name, className = '') {
    if (window.MedIndexIcons?.svg) return window.MedIndexIcons.svg(name, className);
    return `<svg${className ? ` class="${esc(className)}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 16h10"/></svg>`;
  }

  function iconFor(value) {
    const normalized = normalize(value);
    if (/eritrocit|hemoglobin|hematokrit|mcv|mch|mchc/.test(normalized)) return 'blood';
    if (/leukocit|neutrofil|limfocit|mikroskop/.test(normalized)) return 'microscope';
    if (/trombocit|plt|mpv|pdw/.test(normalized)) return 'platelet';
    if (/inr|pt|aptt|fibrinogjen|koagul/.test(normalized)) return 'coagulation';
    if (/kreatinin|urea|egfr|veshk|renal/.test(normalized)) return 'kidney';
    if (/alt|ast|ggt|bilirubin|melci|hepat/.test(normalized)) return 'liver';
    if (/glukoz|hba1c|insulin|diabet/.test(normalized)) return 'glucose';
    if (/kolesterol|hdl|ldl|triglicer|lipid/.test(normalized)) return 'lipid';
    if (/amilaz|lipaz|pankreas/.test(normalized)) return 'pancreas';
    if (/crp|sediment|inflam/.test(normalized)) return 'inflammation';
    if (/tsh|ft3|ft4|hormon|endokrin/.test(normalized)) return 'endocrine';
    if (/urin/.test(normalized)) return 'urine';
    if (/bakter|virus|serolog|kultur|infektiv/.test(normalized)) return 'bacteria';
    return 'flask';
  }

  async function loadLocalDataset() {
    const encoded = window.MEDINDEX_LAB_SHEET_GZIP;
    if (!encoded || typeof DecompressionStream !== 'function') throw new Error('Dataset-i lokal mungon.');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  async function loadNeonDataset() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NEON_TIMEOUT_MS);
    try {
      const response = await fetch('/api/icd?dataset=labs', {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal:controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.data?.tests?.length || !payload?.data?.categories?.length) {
        throw new Error(payload?.error || `API ${response.status}`);
      }
      return payload.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadDataset() {
    const localPromise = loadLocalDataset();
    if (!navigator.onLine) return { data:await localPromise, source:'local-offline' };
    try {
      return { data:await loadNeonDataset(), source:'neon' };
    } catch (error) {
      console.warn('Neon labs fallback:', error?.message || error);
      return { data:await localPromise, source:'local-fallback' };
    }
  }

  function buildSearchIndex(test) {
    return normalize([
      test.formName, test.analysis, test.category, test.englishName, test.albanianName,
      test.whatItShows, test.highPositiveAbnormal, test.lowNegativeNormal,
    ].join(' '));
  }

  function installData(data, source) {
    if (!data || !Array.isArray(data.tests) || !Array.isArray(data.categories)) throw new Error('Dataset-i i analizave nuk është i vlefshëm.');
    state.data = data;
    state.dataSource = source;
    state.categories = new Map(data.categories.map(category => [category.id, category]));
    state.searchable = data.tests.map(test => ({ test, index:buildSearchIndex(test) }));
    $('#heroTestCount').textContent = data.tests.length;
    $('#heroCategoryCount').textContent = data.categories.length;
    const sourceLabel = source === 'neon'
      ? 'Neon Postgres · sinkronizuar nga burimi editorial i aprovuar'
      : source === 'local-offline'
        ? 'Kopja lokale offline e verifikuar'
        : 'Kopja lokale e verifikuar · Neon përkohësisht i paarritshëm';
    $('#sheetNote').innerHTML = `<strong>Burimi runtime:</strong> ${esc(sourceLabel)}. ${esc(data.sourceNote || '')}`;
    const link = $('#sheetLink');
    if (link && data.sourceUrl) link.href = data.sourceUrl;
    renderCategoryControls();
    render();
  }

  function selectedTests() {
    const query = normalize($('#labSearch')?.value);
    const queryTokens = query.split(' ').filter(Boolean);
    const categoryId = $('#labCategory')?.value || '';
    return state.searchable
      .filter(({ test, index }) => (!categoryId || test.categoryId === categoryId)
        && (!queryTokens.length || queryTokens.every(item => index.includes(item))))
      .map(item => item.test);
  }

  function renderCategoryControls() {
    const select = $('#labCategory');
    const nav = $('#labCategoryNav');
    if (!select || !nav || !state.data) return;
    select.innerHTML = '<option value="">Të gjitha kategoritë</option>' + state.data.categories.map(category =>
      `<option value="${esc(category.id)}">${esc(category.label)} (${category.count})</option>`).join('');
    nav.innerHTML = state.data.categories.map(category =>
      `<button type="button" class="lab-category-tile" data-category-jump="${esc(category.id)}" style="${themeStyle(category.number)}" aria-label="Hap ${esc(category.title)}">
        <span class="lab-category-tile-icon">${svgIcon(iconFor(category.title))}</span>
        <span class="lab-category-tile-copy"><small>${esc(category.label)}</small><strong>${esc(category.title)}</strong></span>
        <span class="lab-category-tile-count">${category.count}</span>
      </button>`).join('');
  }

  function card(test, category) {
    return `<article class="lab-card" data-test-id="${esc(test.id)}" style="${themeStyle(category.number)}">
      <button class="lab-card-open" type="button" data-open-test="${esc(test.id)}" aria-label="Hape ${esc(test.formName)}">
        <span class="lab-card-accent" aria-hidden="true"></span>
        <span class="lab-card-topline"><span class="lab-test-icon" aria-hidden="true">${svgIcon(iconFor(`${test.formName} ${category.title}`))}</span><span class="lab-card-order">${esc(test.analysis)}</span></span>
        <h3>${esc(test.formName)}</h3>
        <span class="lab-card-sq">${esc(test.albanianName)}</span>
        <span class="lab-card-en" lang="en">${esc(test.englishName)}</span>
        <p>${esc(test.whatItShows)}</p>
        <span class="lab-card-action"><span>Detajet</span><span class="lab-card-arrow" aria-hidden="true">→</span></span>
      </button>
    </article>`;
  }

  function categorySection(category, tests) {
    const gridId = `${category.id}-grid`;
    return `<section class="lab-category-section" id="${esc(category.id)}" aria-labelledby="${esc(category.id)}-title" style="${themeStyle(category.number)}">
      <header class="lab-category-head">
        <span class="lab-category-head-accent" aria-hidden="true"></span>
        <div class="lab-category-symbol" aria-hidden="true">${svgIcon(iconFor(category.title))}</div>
        <div class="lab-category-number" aria-hidden="true">${category.number}</div>
        <div class="lab-category-copy"><p>${esc(category.label)}</p><h2 id="${esc(category.id)}-title">${esc(category.title)}</h2></div>
        <div class="lab-category-meta"><span class="lab-category-count">${tests.length} analiza</span><button type="button" class="lab-category-open" data-category-open="${esc(category.id)}" aria-controls="${esc(gridId)}">Shiko analizat <span aria-hidden="true">↓</span></button></div>
      </header>
      <div class="lab-grid" id="${esc(gridId)}">${tests.map(test => card(test, category)).join('')}</div>
    </section>`;
  }

  function render() {
    if (!state.data) return;
    const visible = selectedTests();
    const query = text($('#labSearch')?.value);
    const categoryId = $('#labCategory')?.value || '';
    const grouped = new Map();
    visible.forEach(test => {
      if (!grouped.has(test.categoryId)) grouped.set(test.categoryId, []);
      grouped.get(test.categoryId).push(test);
    });
    const sections = $('#labSections');
    sections.innerHTML = visible.length
      ? state.data.categories.filter(category => grouped.has(category.id)).map(category => categorySection(category, grouped.get(category.id))).join('')
      : '<div class="med-empty lab-empty"><strong>Nuk u gjet asnjë analizë.</strong><span>Provo një term më të përgjithshëm.</span></div>';
    sections.setAttribute('aria-busy', 'false');
    $('#labCount').textContent = `${visible.length} / ${state.data.tests.length} analiza`;
    const category = state.categories.get(categoryId);
    $('#labSectionTitle').textContent = category?.label || (query ? 'Rezultatet e kërkimit' : 'Të gjitha kategoritë');
    $('#labSectionSubtitle').textContent = query
      ? `Rezultate për “${query}”.`
      : category ? `${category.count} analiza në këtë kategori.` : `${state.data.tests.length} analiza në ${state.data.categories.length} kategori.`;
    $('#labStatus').textContent = query ? `${visible.length} rezultate.` : '';
    $('#labClear').hidden = !query;
    document.querySelectorAll('[data-category-jump]').forEach(button => {
      const active = button.dataset.categoryJump === categoryId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    cancelAnimationFrame(state.renderFrame);
    state.renderTimer = setTimeout(() => { state.renderFrame = requestAnimationFrame(render); }, 35);
  }

  function detailBlock(label, body, className = '') {
    return `<section class="lab-detail-block ${className}"><h3>${esc(label)}</h3><p>${esc(body || 'Nuk është shënuar.')}</p></section>`;
  }

  function openTest(id) {
    const test = state.data?.tests?.find(item => item.id === id);
    if (!test) return;
    state.lastFocused = document.activeElement;
    $('#detailKicker').textContent = `Emri në formular · ${test.analysis}`;
    $('#detailTitle').textContent = test.formName;
    const source = /^https:\/\//i.test(test.sourceUrl || '')
      ? `<a href="${esc(test.sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape burimin ↗</a>`
      : '<span>Burimi editorial i sinkronizuar në Neon</span>';
    $('#detailBody').innerHTML = `<div class="lab-name-grid">
      ${detailBlock('Emri i plotë në shqip', test.albanianName, 'is-primary')}
      ${detailBlock('Emri i plotë në anglisht', test.englishName)}
    </div>
    ${detailBlock('Çfarë tregon', test.whatItShows, 'is-full')}
    <div class="lab-interpret-grid">
      ${detailBlock(state.data.headers?.highPositiveAbnormal || 'Kur rritet', test.highPositiveAbnormal, 'is-high')}
      ${detailBlock(state.data.headers?.lowNegativeNormal || 'Kur ulet', test.lowNegativeNormal, 'is-low')}
    </div>
    <div class="lab-detail-source"><span>${esc(test.category)}</span>${source}</div>`;
    const overlay = $('#detailOverlay');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('#detailClose')?.focus();
  }

  function closeDetail() {
    const overlay = $('#detailOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (state.lastFocused?.isConnected) state.lastFocused.focus({ preventScroll:true });
    state.lastFocused = null;
  }

  function chooseCategory(id, scroll = false) {
    const select = $('#labCategory');
    if (!select) return;
    select.value = id;
    render();
    if (scroll && id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' }));
  }

  function bindEvents() {
    $('#labSearch')?.addEventListener('input', scheduleRender, { passive:true });
    $('#labCategory')?.addEventListener('change', event => chooseCategory(event.target.value));
    $('#labClear')?.addEventListener('click', () => {
      $('#labSearch').value = '';
      render();
      $('#labSearch').focus();
    });
    $('#labCategoryNav')?.addEventListener('click', event => {
      const button = event.target.closest('[data-category-jump]');
      if (button) chooseCategory(button.dataset.categoryJump, true);
    });
    $('#labSections')?.addEventListener('click', event => {
      const categoryButton = event.target.closest('[data-category-open]');
      if (categoryButton) return document.querySelector(`#${CSS.escape(categoryButton.dataset.categoryOpen)}-grid [data-open-test]`)?.focus();
      const button = event.target.closest('[data-open-test]');
      if (button) openTest(button.dataset.openTest);
    });
    $('#detailClose')?.addEventListener('click', closeDetail);
    $('#detailDone')?.addEventListener('click', closeDetail);
    $('#detailOverlay')?.addEventListener('click', event => { if (event.target.id === 'detailOverlay') closeDetail(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#detailOverlay')?.hidden) return closeDetail();
      if (event.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
        event.preventDefault();
        $('#labSearch')?.focus();
      }
    });
  }

  async function init() {
    initTheme();
    bindEvents();
    try {
      const result = await loadDataset();
      installData(result.data, result.source);
    } catch (error) {
      console.error(error);
      $('#labSections').innerHTML = '<div class="med-empty">Analizat nuk u ngarkuan. Rifresko faqen.</div>';
      $('#labStatus').textContent = error.message || 'Gabim gjatë ngarkimit.';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
