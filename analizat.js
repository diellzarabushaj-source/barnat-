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
    nav.innerHTML = `<button type="button" class="is-active" data-category-jump="">Të gjitha <span>${state.data.tests.length}</span></button>`
      + state.data.categories.map(category =>
        `<button type="button" data-category-jump="${esc(category.id)}"><b>${category.number}</b>${esc(category.title)}<span>${category.count}</span></button>`
      ).join('');
  }

  function card(test) {
    return `<article class="lab-card" data-test-id="${esc(test.id)}">
      <button class="lab-card-open" type="button" data-open-test="${esc(test.id)}" aria-label="Hape ${esc(test.formName)}">
        <span class="lab-card-order">${esc(test.analysis)}</span>
        <h3>${esc(test.formName)}</h3>
        <span class="lab-card-sq">${esc(test.albanianName)}</span>
        <span class="lab-card-en" lang="en">${esc(test.englishName)}</span>
        <p>${esc(test.whatItShows)}</p>
        <span class="lab-card-action">Detajet <span aria-hidden="true">→</span></span>
      </button>
    </article>`;
  }

  function categorySection(category, tests, isSearch) {
    return `<section class="lab-category-section" id="${esc(category.id)}" aria-labelledby="${esc(category.id)}-title">
      <header class="lab-category-head">
        <div class="lab-category-number" aria-hidden="true">${category.number}</div>
        <div><p>${esc(category.label)}</p><h2 id="${esc(category.id)}-title">${esc(category.title)}</h2></div>
        <span>${tests.length}${isSearch ? ` / ${category.count}` : ''} analiza</span>
      </header>
      <div class="lab-grid">${tests.map(card).join('')}</div>
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
      button.classList.toggle('is-active', button.dataset.categoryJump === categoryId);
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

  function bindEvents() {
    $('#labSearch')?.addEventListener('input', scheduleRender, { passive: true });
    $('#labCategory')?.addEventListener('change', event => chooseCategory(event.target.value));
    $('#labClear')?.addEventListener('click', clearSearch);
    $('#labCategoryNav')?.addEventListener('click', event => {
      const button = event.target.closest('[data-category-jump]');
      if (button) chooseCategory(button.dataset.categoryJump, true);
    });
    $('#labSections')?.addEventListener('click', event => {
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
