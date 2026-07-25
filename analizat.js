(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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

  const CATEGORY_ICONS = {
    1:'blood', 2:'microscope', 3:'platelet', 4:'coagulation', 5:'kidney', 6:'liver', 7:'glucose',
    8:'lipid', 9:'pancreas', 10:'inflammation', 11:'endocrine', 12:'bacteria', 13:'urine', 14:'flask'
  };

  const state = {
    data: null,
    categories: new Map(),
    searchable: [],
    activeTestId: '',
    lastFocused: null,
    renderTimer: 0,
    renderFrame: 0,
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
    const theme = ['dark', 'light'].includes(saved)
      ? saved
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    $('#themeButton')?.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  function categoryTheme(number) {
    const index = Math.max(0, Number(number || 1) - 1) % CATEGORY_THEMES.length;
    return CATEGORY_THEMES[index];
  }

  function themeStyle(number) {
    const theme = categoryTheme(number);
    return `--lab-accent:${theme.accent};--lab-strong:${theme.strong};--lab-soft:${theme.soft};--lab-ring:${theme.ring}`;
  }

  function svgIcon(name, className = '') {
    if (window.MedIndexIcons?.svg) return window.MedIndexIcons.svg(name, className);
    return `<svg${className ? ` class="${esc(className)}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 16h10"/></svg>`;
  }

  function iconForCategory(category) {
    const value = normalize(`${category?.title || ''} ${category?.label || ''}`);
    if (/eritrocit|hemoglobin|hematokrit/.test(value)) return 'blood';
    if (/leukocit|formula leukocitare/.test(value)) return 'microscope';
    if (/trombocit/.test(value)) return 'platelet';
    if (/koagul|hemostaz/.test(value)) return 'coagulation';
    if (/renal|veshk|protein.*urine/.test(value)) return 'kidney';
    if (/hepat|melci|bilirubin/.test(value)) return 'liver';
    if (/glukoz|diabet|insulin/.test(value)) return 'glucose';
    if (/lipid|kolesterol|triglicer/.test(value)) return 'lipid';
    if (/pankreas|amilaz|lipaz/.test(value)) return 'pancreas';
    if (/inflam|crp|sediment/.test(value)) return 'inflammation';
    if (/hormon|endokrin|tiroide/.test(value)) return 'endocrine';
    if (/infektiv|mikrobiolog|bakter|serolog/.test(value)) return 'bacteria';
    if (/urine|urines/.test(value)) return 'urine';
    return CATEGORY_ICONS[Number(category?.number)] || 'flask';
  }

  function iconForTest(test, category) {
    const value = normalize([
      test?.formName, test?.analysis, test?.albanianName, test?.englishName, category?.title
    ].join(' '));
    if (/sediment|crp|prokalciton|inflam/.test(value)) return 'inflammation';
    if (/eritrocit|hemoglobin|hematokrit|mcv|mch|mchc|rdw|retikulocit/.test(value)) return 'blood';
    if (/leukocit|neutrofil|limfocit|monocit|eozinofil|bazofil/.test(value)) return 'microscope';
    if (/trombocit|plt|mpv|pdw/.test(value)) return 'platelet';
    if (/inr|pt|aptt|fibrinogjen|d-dimer|koagul/.test(value)) return 'coagulation';
    if (/kreatinin|urea|egfr|renal|veshk|mikroalbumin/.test(value)) return 'kidney';
    if (/alt|ast|ggt|bilirubin|hepat|albumin/.test(value)) return 'liver';
    if (/glukoz|hba1c|insulin|c-peptid/.test(value)) return 'glucose';
    if (/kolesterol|hdl|ldl|triglicer|lipid/.test(value)) return 'lipid';
    if (/amilaz|lipaz|pankreas/.test(value)) return 'pancreas';
    if (/tsh|ft3|ft4|kortizol|prolaktin|testosteron|estradiol|hormon/.test(value)) return 'endocrine';
    if (/urin|sediment urinar/.test(value)) return 'urine';
    if (/bakter|virus|antigjen|antitrup|serolog|kultur/.test(value)) return 'bacteria';
    return iconForCategory(category);
  }

  function buildSearchIndex(test) {
    return normalize([
      test.formName,
      test.analysis,
      test.category,
      test.englishName,
      test.albanianName,
      test.whatItShows,
      test.highPositiveAbnormal,
      test.lowNegativeNormal,
    ].join(' '));
  }

  async function loadSheetDataset() {
    const encoded = window.MEDINDEX_LAB_SHEET_GZIP;
    if (!encoded) throw new Error('Dataset-i i Google Sheet-it mungon.');
    if (typeof DecompressionStream !== 'function') throw new Error('Shfletuesi nuk e mbështet ngarkimin e dataset-it.');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  function installData(data) {
    if (!data || !Array.isArray(data.tests) || !Array.isArray(data.categories)) {
      throw new Error('Dataset-i i Google Sheet-it nuk u ngarkua.');
    }
    state.data = data;
    state.categories = new Map(data.categories.map(category => [category.id, category]));
    state.searchable = data.tests.map(test => ({ test, index: buildSearchIndex(test) }));

    $('#heroTestCount').textContent = data.tests.length;
    $('#heroCategoryCount').textContent = data.categories.length;
    $('#sheetNote').innerHTML = `<strong>Shënim nga Sheet-i:</strong> ${esc(data.sourceNote)}`;
    $('#sheetLink').href = data.sourceUrl;
    renderCategoryControls();
    render();
  }

  function selectedTests() {
    const query = normalize($('#labSearch')?.value);
    const tokens = query.split(' ').filter(Boolean);
    const categoryId = $('#labCategory')?.value || '';
    return state.searchable
      .filter(({ test, index }) => (!categoryId || test.categoryId === categoryId)
        && (!tokens.length || tokens.every(token => index.includes(token))))
      .map(item => item.test);
  }

  function renderCategoryControls() {
    const select = $('#labCategory');
    const nav = $('#labCategoryNav');
    if (!select || !nav) return;
    select.innerHTML = '<option value="">Të gjitha kategoritë</option>' + state.data.categories.map(category =>
      `<option value="${esc(category.id)}">${esc(category.label)} (${category.count})</option>`
    ).join('');

    const allTheme = CATEGORY_THEMES[0];
    nav.innerHTML = `<button type="button" class="lab-category-tile is-active" data-category-jump="" style="--lab-accent:${allTheme.accent};--lab-strong:${allTheme.strong};--lab-soft:${allTheme.soft};--lab-ring:${allTheme.ring}">
        <span class="lab-category-tile-icon">${svgIcon('clipboard')}</span>
        <span class="lab-category-tile-copy"><small>Përmbledhje</small><strong>Të gjitha kategoritë</strong></span>
        <span class="lab-category-tile-count">${state.data.tests.length}</span>
      </button>`
      + state.data.categories.map(category =>
        `<button type="button" class="lab-category-tile" data-category-jump="${esc(category.id)}" style="${themeStyle(category.number)}" aria-label="Hap ${esc(category.title)}, ${category.count} analiza">
          <span class="lab-category-tile-icon">${svgIcon(iconForCategory(category))}</span>
          <span class="lab-category-tile-copy"><small>Kategoria ${category.number}</small><strong>${esc(category.title)}</strong></span>
          <span class="lab-category-tile-count">${category.count}</span>
        </button>`
      ).join('');
  }

  function card(test, category) {
    const icon = iconForTest(test, category);
    return `<article class="lab-card" data-test-id="${esc(test.id)}" style="${themeStyle(category.number)}">
      <button class="lab-card-open" type="button" data-open-test="${esc(test.id)}" aria-label="Hape ${esc(test.formName)}">
        <span class="lab-card-accent" aria-hidden="true"></span>
        <span class="lab-card-topline">
          <span class="lab-test-icon" aria-hidden="true">${svgIcon(icon)}</span>
          <span class="lab-card-order">${esc(test.analysis)}</span>
        </span>
        <h3>${esc(test.formName)}</h3>
        <span class="lab-card-sq">${esc(test.albanianName)}</span>
        <span class="lab-card-en" lang="en">${esc(test.englishName)}</span>
        <p>${esc(test.whatItShows)}</p>
        <span class="lab-card-action"><span>Detajet</span><span class="lab-card-arrow" aria-hidden="true">→</span></span>
      </button>
    </article>`;
  }

  function categoryHighlights(category, tests) {
    const values = tests
      .map(test => text(test.formName))
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .slice(0, 4);
    return values.map(value => `<span>${esc(value)}</span>`).join('');
  }

  function categorySection(category, tests, isSearch) {
    const gridId = `${category.id}-grid`;
    return `<section class="lab-category-section" id="${esc(category.id)}" aria-labelledby="${esc(category.id)}-title" style="${themeStyle(category.number)}">
      <header class="lab-category-head">
        <span class="lab-category-head-accent" aria-hidden="true"></span>
        <div class="lab-category-symbol" aria-hidden="true">${svgIcon(iconForCategory(category))}</div>
        <div class="lab-category-number" aria-hidden="true">${category.number}</div>
        <div class="lab-category-copy">
          <p>${esc(category.label)}</p>
          <h2 id="${esc(category.id)}-title">${esc(category.title)}</h2>
          <div class="lab-category-highlights" aria-label="Shembuj analizash">${categoryHighlights(category, tests)}</div>
        </div>
        <div class="lab-category-meta">
          <span class="lab-category-count">${tests.length}${isSearch ? ` / ${category.count}` : ''} analiza</span>
          <button type="button" class="lab-category-open" data-category-open="${esc(category.id)}" aria-controls="${esc(gridId)}">Shiko analizat <span aria-hidden="true">↓</span></button>
        </div>
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
      ? state.data.categories
          .filter(category => grouped.has(category.id))
          .map(category => categorySection(category, grouped.get(category.id), Boolean(query || categoryId)))
          .join('')
      : `<div class="med-empty lab-empty"><strong>Nuk u gjet asnjë analizë.</strong><span>Provo emrin në formular, shkurtesën ose një term më të përgjithshëm.</span></div>`;
    sections.setAttribute('aria-busy', 'false');

    $('#labCount').textContent = `${visible.length} / ${state.data.tests.length} analiza`;
    const category = state.categories.get(categoryId);
    $('#labSectionTitle').textContent = category?.label || (query ? 'Rezultatet e kërkimit' : 'Të gjitha kategoritë');
    $('#labSectionSubtitle').textContent = query
      ? `Rezultate për “${query}”, të kërkuara në të gjitha fushat e Sheet-it.`
      : category
        ? `${category.count} analiza; titulli kryesor është “Emri në formular”.`
        : `${state.data.tests.length} analiza të renditura në ${state.data.categories.length} kategori, pa hyrje shtesë.`;
    $('#labStatus').textContent = query ? `${visible.length} rezultate për “${query}”.` : '';
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
    state.renderTimer = setTimeout(() => {
      state.renderFrame = requestAnimationFrame(render);
    }, 35);
  }

  function detailBlock(label, body, className = '') {
    return `<section class="lab-detail-block ${className}"><h3>${esc(label)}</h3><p>${esc(body)}</p></section>`;
  }

  function openTest(id) {
    const test = state.data.tests.find(item => item.id === id);
    if (!test) return;
    state.activeTestId = id;
    state.lastFocused = document.activeElement;
    $('#detailKicker').textContent = `Emri në formular · ${test.analysis}`;
    $('#detailTitle').textContent = test.formName;
    $('#detailBody').innerHTML = `
      <div class="lab-name-grid">
        ${detailBlock('Emri i plotë në shqip', test.albanianName, 'is-primary')}
        ${detailBlock('Emri i plotë në anglisht', test.englishName)}
      </div>
      ${detailBlock('Çfarë tregon', test.whatItShows, 'is-full')}
      <div class="lab-interpret-grid">
        ${detailBlock(state.data.headers.highPositiveAbnormal, test.highPositiveAbnormal, 'is-high')}
        ${detailBlock(state.data.headers.lowNegativeNormal, test.lowNegativeNormal, 'is-low')}
      </div>
      <div class="lab-detail-source"><span>${esc(test.category)}</span><a href="${esc(test.sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape burimin ↗</a></div>`;
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
    if (state.lastFocused?.isConnected) state.lastFocused.focus({ preventScroll: true });
    state.lastFocused = null;
    state.activeTestId = '';
  }

  function clearSearch() {
    const input = $('#labSearch');
    if (!input) return;
    input.value = '';
    render();
    input.focus();
  }

  function chooseCategory(id, scroll = false) {
    const select = $('#labCategory');
    if (!select) return;
    select.value = id;
    render();
    if (scroll && id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function focusCategoryGrid(id) {
    const first = document.querySelector(`#${CSS.escape(id)}-grid [data-open-test]`);
    first?.focus({ preventScroll:true });
    first?.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function bindEvents() {
    $('#labSearch')?.addEventListener('input', scheduleRender, { passive: true });
    $('#labCategory')?.addEventListener('change', event => chooseCategory(event.target.value));
    $('#labClear')?.addEventListener('click', clearSearch);
    $('#labCategoryNav')?.addEventListener('click', event => {
      const button = event.target.closest('[data-category-jump]');
      if (button) chooseCategory(button.dataset.categoryJump, true);
    });
    $('#labSections')?.addEventListener('click', event => {
      const categoryButton = event.target.closest('[data-category-open]');
      if (categoryButton) return focusCategoryGrid(categoryButton.dataset.categoryOpen);
      const button = event.target.closest('[data-open-test]');
      if (button) openTest(button.dataset.openTest);
    });
    $('#detailClose')?.addEventListener('click', closeDetail);
    $('#detailDone')?.addEventListener('click', closeDetail);
    $('#detailOverlay')?.addEventListener('click', event => {
      if (event.target.id === 'detailOverlay') closeDetail();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#detailOverlay')?.hidden) return closeDetail();
      if (event.key === 'Escape' && text($('#labSearch')?.value)) return clearSearch();
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
      installData(await loadSheetDataset());
    } catch (error) {
      console.error(error);
      $('#labSections').innerHTML = '<div class="med-empty">Analizat nuk u ngarkuan. Rifresko faqen.</div>';
      $('#labStatus').textContent = error.message || 'Gabim gjatë ngarkimit.';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
