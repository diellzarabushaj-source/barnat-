(() => {
  'use strict';

  const GROUP_COLORS = Object.freeze({
    A:'#16857a', B:'#b4495a', C:'#3767c7', D:'#b67b24', G:'#b44f85', H:'#7655bf', J:'#18815c',
    L:'#6b50b6', M:'#c46b2c', N:'#533afd', P:'#8b6443', R:'#2787a8', S:'#2c8d86', V:'#6c7685',
  });


  const SEARCH_ALIASES = Object.freeze({
    'dhimbje':['N02'], 'analgjezik':['N02'], 'qetesues dhimbjeje':['N02'],
    'migrene':['N02C'], 'migrenë':['N02C'],
    'tension':['C02','C09'], 'hipertension':['C02','C09'], 'presion':['C02','C09'],
    'kolesterol':['C10'], 'lipide':['C10'],
    'diabet':['A10'], 'insuline':['A10A'], 'insulinë':['A10A'],
    'antibiotik':['J01'], 'antibakterial':['J01'], 'infeksion bakterial':['J01'],
    'antifungal':['J02','D01'], 'antimykotik':['J02','D01'],
    'astme':['R03'], 'astmë':['R03'], 'bronkodilator':['R03'],
    'kolle':['R05'], 'kollë':['R05'], 'ftohje':['R05'],
    'alergji':['R06'], 'antihistaminik':['R06'],
    'depresion':['N06A'], 'antidepresiv':['N06A'],
    'ankth':['N05B'], 'anksiolitik':['N05B'],
    'epilepsi':['N03'], 'antiepileptik':['N03'],
    'parkinson':['N04'], 'anestezi':['N01'], 'anestetik':['N01'],
    'tiroide':['H03'], 'tiroide':['H03'],
    'kortikosteroid':['H02','D07'],
    'kontracepsion':['G03A'], 'prostate':['G04C'], 'prostatë':['G04C'],
    'osteoporoze':['M05'], 'osteoporozë':['M05'], 'kocka':['M05'],
    'sy':['S01'], 'vesh':['S02'], 'veshë':['S02'],
  });

  const state = {
    group:'',
    category:'',
    subdivision:'',
    query:'',
    counts:null,
  };

  const $ = id => document.getElementById(id);
  const el = {
    appShell:$('appShell'), sidebar:$('sidebar'), sidebarBackdrop:$('sidebarBackdrop'), menuButton:$('menuButton'), sidebarClose:$('sidebarClose'),
    logoutButton:$('logoutButton'), sourceStatus:$('sourceStatus'), syncText:$('syncText'), avatarInitials:$('avatarInitials'),
    metricGroups:$('metricGroups'), metricCategories:$('metricCategories'), metricClassified:$('metricClassified'), metricCoverage:$('metricCoverage'), metricUnclassified:$('metricUnclassified'),
    atcSearch:$('atcSearch'), clearSearchButton:$('clearSearchButton'), atcStatusText:$('atcStatusText'), atcStatusMeta:$('atcStatusMeta'),
    groupList:$('groupList'), groupCount:$('groupCount'), categoryHero:$('categoryHero'), categoryPanelTitle:$('categoryPanelTitle'), categoryCount:$('categoryCount'), categoryList:$('categoryList'),
    categoryView:$('categoryView'), searchResultsView:$('searchResultsView'), searchResultCount:$('searchResultCount'), searchResults:$('searchResults'),
    atcPath:$('atcPath'), atcPathItems:$('atcPathItems'), atcPathRegistry:$('atcPathRegistry'), toast:$('toast'),
  };

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => clean(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const groups = () => window.MEDINDEX_ATC_GROUPS && typeof window.MEDINDEX_ATC_GROUPS === 'object' ? window.MEDINDEX_ATC_GROUPS : {};
  const categories = () => window.MEDINDEX_ATC_SUBGROUPS && typeof window.MEDINDEX_ATC_SUBGROUPS === 'object' ? window.MEDINDEX_ATC_SUBGROUPS : {};
  const subdivisions = () => window.MEDINDEX_ATC_SUBDIVISIONS && typeof window.MEDINDEX_ATC_SUBDIVISIONS === 'object' ? window.MEDINDEX_ATC_SUBDIVISIONS : {};
  const colorFor = code => GROUP_COLORS[String(code || '').charAt(0)] || '#64748d';
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatNumber = value => Number(value || 0).toLocaleString('sq-XK');

  async function fetchJson(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        ...options,
        signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error('Sesioni nuk është aktiv.');
      }
      if (!response.ok) throw new Error(payload.error || `Gabim ${response.status}`);
      return { payload, response };
    } finally {
      clearTimeout(timer);
    }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { payload } = await fetchJson('/api/auth', {}, 4200);
    if (!payload.authenticated) return redirectToLogin();
    const name = clean(payload.user?.name || payload.authUser?.name || payload.user?.email || 'DR');
    el.avatarInitials.textContent = name.split(/[\s@.]+/).filter(Boolean).slice(0,2).map(part => part[0]?.toUpperCase()).join('') || 'DR';
  }

  function categoryEntries(groupCode) {
    return Object.entries(categories())
      .filter(([code]) => code.startsWith(groupCode) && code.length === 3)
      .sort(([a],[b]) => a.localeCompare(b, 'sq'));
  }

  function subdivisionEntries(categoryCode) {
    return Object.entries(subdivisions())
      .filter(([code]) => code.startsWith(categoryCode) && (code.length === 4 || code.length === 5))
      .sort(([a],[b]) => a.length - b.length || a.localeCompare(b, 'sq'));
  }

  function groupCount(code) {
    return number(state.counts?.groupCounts?.[code]);
  }

  function categoryDrugCount(code) {
    return number(state.counts?.counts?.[code]);
  }

  function registryUrl(code) {
    const url = new URL('/index.html', location.origin);
    if (code) url.searchParams.set('atc', code);
    return url.pathname + url.search;
  }

  function readHash() {
    const hashValue = decodeURIComponent(location.hash.slice(1) || '');
    const queryValue = new URLSearchParams(location.search).get('atc') || '';
    const raw = clean(hashValue || queryValue).toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(raw)) {
      const subdivision = raw.slice(0,5);
      return { group:raw.charAt(0), category:raw.slice(0,3), subdivision:subdivisions()[subdivision] ? subdivision : '' };
    }
    if (/^[A-Z]\d{2}[A-Z]{1,2}$/.test(raw)) {
      return { group:raw.charAt(0), category:raw.slice(0,3), subdivision:subdivisions()[raw] ? raw : '' };
    }
    if (/^[A-Z]\d{2}$/.test(raw)) return { group:raw.charAt(0), category:raw, subdivision:'' };
    if (/^[A-Z]$/.test(raw)) return { group:raw, category:'', subdivision:'' };
    return { group:'', category:'', subdivision:'' };
  }

  function writeHash(code) {
    const url = new URL(location.href);
    url.searchParams.delete('atc');
    url.hash = code ? encodeURIComponent(code) : '';
    history.replaceState(code ? { atc:code } : {}, '', url.pathname + url.search + url.hash);
  }

  function renderGroups() {
    const entries = Object.entries(groups());
    el.metricGroups.textContent = String(entries.length);
    el.groupCount.textContent = String(entries.length);
    el.groupList.innerHTML = entries.map(([code,name]) => {
      const active = code === state.group;
      const count = groupCount(code);
      const children = categoryEntries(code).length;
      return `<button class="group-row ${active ? 'is-active' : ''}" type="button" role="option" aria-selected="${active ? 'true' : 'false'}" data-group-code="${code}" style="--group-accent:${colorFor(code)}">
        <span class="group-code">${code}</span>
        <span class="group-copy"><strong>${escapeHtml(name)}</strong><small>${children} kategori terapeutike</small></span>
        <span class="group-total" title="Barna në grup">${state.counts ? formatNumber(count) : '—'}</span>
      </button>`;
    }).join('');
  }

  function renderHero() {
    const name = groups()[state.group] || '';
    const count = groupCount(state.group);
    const color = colorFor(state.group);
    el.categoryHero.style.setProperty('--group-accent', color);
    el.categoryHero.innerHTML = `
      <span class="hero-code">${escapeHtml(state.group)}</span>
      <div class="hero-copy">
        <small>Grupi anatomik</small>
        <h2>${escapeHtml(name)}</h2>
        <p>${categoryEntries(state.group).length} kategori terapeutike në këtë grup.</p>
      </div>
      <div class="hero-actions">
        <span class="hero-count">${state.counts ? formatNumber(count) : '—'} barna</span>
        <a class="button button-secondary" href="${registryUrl(state.group)}">Hap barnat</a>
      </div>`;
  }

  function subdivisionTree(categoryCode) {
    const entries = subdivisionEntries(categoryCode);
    const level4 = entries.filter(([code]) => code.length === 4);
    const level5 = entries.filter(([code]) => code.length === 5);
    const claimed = new Set();
    const branches = level4.map(([code,name]) => {
      const children = level5.filter(([child]) => child.startsWith(code));
      children.forEach(([child]) => claimed.add(child));
      return { code, name, children };
    });
    level5.filter(([code]) => !claimed.has(code)).forEach(([code,name]) => {
      branches.push({ code, name, children:[] });
    });
    return branches;
  }

  function selectedSubdivisionMarkup(categoryCode) {
    const branches = subdivisionTree(categoryCode);
    const color = colorFor(categoryCode);
    const categoryName = categories()[categoryCode] || '';
    return `<div class="subdivision-block" style="--group-accent:${color}">
      <div class="subdivision-heading">
        <div><span>Nënndarjet ATC</span><small>Niveli farmakologjik → niveli kimik</small></div>
        <a class="button button-secondary" href="${registryUrl(categoryCode)}">Hap barnat ${escapeHtml(categoryCode)}</a>
      </div>
      ${branches.length ? `<div class="subdivision-tree">${branches.map(branch => {
        const level = branch.code.length === 4 ? 'Niveli 4' : 'Niveli 5';
        return `<section class="subdivision-branch ${state.subdivision === branch.code ? 'is-active' : ''}">
          <a class="subdivision-parent" href="${registryUrl(branch.code)}" data-subdivision-code="${escapeHtml(branch.code)}">
            <span class="subdivision-code">${escapeHtml(branch.code)}</span>
            <span class="subdivision-name"><strong>${escapeHtml(branch.name)}</strong><small>${level}${branch.children.length ? ` · ${branch.children.length} nënndarje kimike` : ''}</small></span>
            <span class="subdivision-open" aria-hidden="true">→</span>
          </a>
          ${branch.children.length ? `<div class="subdivision-children">${branch.children.map(([code,name]) => `
            <a class="subdivision-child ${state.subdivision === code ? 'is-active' : ''}" href="${registryUrl(code)}" data-subdivision-code="${escapeHtml(code)}">
              <span class="subdivision-code">${escapeHtml(code)}</span>
              <span class="subdivision-name">${escapeHtml(name)}</span>
              <span class="subdivision-open" aria-hidden="true">→</span>
            </a>`).join('')}</div>` : ''}
        </section>`;
      }).join('')}</div>` : `<div class="empty-state">Nuk ka nënndarje shtesë të kataloguara për ${escapeHtml(categoryCode)} — ${escapeHtml(categoryName)}.</div>`}
    </div>`;
  }

  function renderCategories() {
    const entries = categoryEntries(state.group);
    el.categoryPanelTitle.textContent = groups()[state.group] || 'Kategoritë ATC';
    el.categoryCount.textContent = String(entries.length);
    el.categoryList.innerHTML = entries.length ? entries.map(([code,name]) => {
      const active = code === state.category;
      const count = categoryDrugCount(code);
      const subCount = subdivisionEntries(code).length;
      return `<article class="category-row ${active ? 'is-active' : ''}" data-category-card="${code}" style="--group-accent:${colorFor(code)}">
        <button class="category-code" type="button" data-category-code="${code}" aria-label="Hap kategorinë ${escapeHtml(code)}">${escapeHtml(code)}</button>
        <button class="category-copy" type="button" data-category-code="${code}">
          <strong>${escapeHtml(name)}</strong>
          <small>${subCount ? `${subCount} nënndarje të kataloguara` : 'Pa nënndarje shtesë'}</small>
        </button>
        <div class="category-actions">
          <span class="category-count" title="Barna në kategori">${state.counts ? formatNumber(count) : '—'}</span>
          <button class="category-chevron" type="button" data-category-code="${code}" aria-label="${active ? 'Mbyll' : 'Hap'} ${escapeHtml(code)}">${active ? '⌃' : '›'}</button>
        </div>
        ${active ? selectedSubdivisionMarkup(code) : ''}
      </article>`;
    }).join('') : '<div class="empty-state">Nuk ka kategori të kataloguara për këtë grup.</div>';
  }


  function pathName(code) {
    if (!code) return '';
    if (code.length === 1) return groups()[code] || '';
    if (code.length === 3) return categories()[code] || '';
    return subdivisions()[code] || '';
  }

  function activePathCodes() {
    const codes = [];
    if (state.group) codes.push(state.group);
    if (state.category) codes.push(state.category);
    if (state.subdivision) {
      const level4 = state.subdivision.slice(0,4);
      if (subdivisions()[level4] && !codes.includes(level4)) codes.push(level4);
      const level5 = state.subdivision.slice(0,5);
      if (state.subdivision.length >= 5 && subdivisions()[level5] && !codes.includes(level5)) codes.push(level5);
    }
    return codes;
  }

  function renderPath() {
    const codes = activePathCodes();
    const finalCode = codes[codes.length - 1] || state.group || '';
    el.atcPathItems.innerHTML = codes.map((code,index) => {
      const name = pathName(code);
      const current = index === codes.length - 1;
      return `${index ? '<span class="atc-path-sep" aria-hidden="true">›</span>' : ''}<button class="atc-path-node ${current ? 'is-current' : ''}" type="button" data-path-code="${escapeHtml(code)}" title="${escapeHtml(name)}"><strong>${escapeHtml(code)}</strong><span>${escapeHtml(name)}</span></button>`;
    }).join('');
    el.atcPathRegistry.href = registryUrl(finalCode);
    el.atcPath.hidden = !codes.length;
  }

  function renderClassification() {
    if (!state.group || !groups()[state.group]) state.group = Object.keys(groups())[0] || 'A';
    renderGroups();
    renderHero();
    renderCategories();
    renderPath();
    const totalCategories = Object.keys(categories()).length;
    el.metricCategories.textContent = String(totalCategories);
    el.atcStatusText.textContent = state.category
      ? `${state.category} — ${categories()[state.category] || 'Kategoria ATC'}`
      : `${state.group} — ${groups()[state.group] || 'Grupi ATC'}`;
    el.atcStatusMeta.textContent = state.counts ? 'Numërimet nga Supabase' : 'Katalogu ATC';
  }

  function searchCatalog(query) {
    const needle = normalize(query);
    if (!needle) return [];
    const result = [];
    const seen = new Set();
    const add = item => {
      if (!item?.code || seen.has(item.code)) return;
      seen.add(item.code);
      result.push(item);
    };
    const aliasCodes = Object.entries(SEARCH_ALIASES)
      .filter(([alias]) => normalize(alias).includes(needle) || needle.includes(normalize(alias)))
      .flatMap(([,codes]) => codes);

    const score = (code, name) => {
      const codeText = normalize(code), nameText = normalize(name);
      if (codeText === needle) return 0;
      if (codeText.startsWith(needle)) return 1;
      if (nameText.startsWith(needle)) return 2;
      if (nameText.includes(needle)) return 3;
      return 9;
    };

    const direct = [];
    for (const [code,name] of Object.entries(groups())) {
      if (normalize(`${code} ${name}`).includes(needle)) direct.push({ type:'Grup', code, name, group:code, category:'', subdivision:'', score:score(code,name) });
    }
    for (const [code,name] of Object.entries(categories())) {
      if (normalize(`${code} ${name}`).includes(needle)) direct.push({ type:'Kategori', code, name, group:code.charAt(0), category:code, subdivision:'', score:score(code,name) });
    }
    for (const [code,name] of Object.entries(subdivisions())) {
      if (normalize(`${code} ${name}`).includes(needle)) direct.push({ type:'Nënndarje', code, name, group:code.charAt(0), category:code.slice(0,3), subdivision:code, score:score(code,name) });
    }
    direct.sort((a,b) => a.score - b.score || a.code.localeCompare(b.code,'sq')).forEach(add);

    aliasCodes.forEach(code => {
      const name = groups()[code] || categories()[code] || subdivisions()[code];
      if (!name) return;
      add({
        type:code.length === 1 ? 'Grup' : code.length === 3 ? 'Kategori' : 'Nënndarje',
        code, name, group:code.charAt(0), category:code.length >= 3 ? code.slice(0,3) : '', subdivision:code.length > 3 ? code : ''
      });
    });
    return result.slice(0,80);
  }


  function resultCount(item) {
    if (!state.counts || !item) return '';
    if (item.code.length === 1) return groupCount(item.code);
    if (item.code.length === 3) return categoryDrugCount(item.code);
    return '';
  }

  function moveFocus(container, selector, key) {
    const items = [...container.querySelectorAll(selector)].filter(node => node.offsetParent !== null);
    if (!items.length) return false;
    const current = items.indexOf(document.activeElement);
    let next = current;
    if (key === 'Home') next = 0;
    else if (key === 'End') next = items.length - 1;
    else if (key === 'ArrowDown' || key === 'ArrowRight') next = current < 0 ? 0 : Math.min(items.length - 1, current + 1);
    else if (key === 'ArrowUp' || key === 'ArrowLeft') next = current < 0 ? items.length - 1 : Math.max(0, current - 1);
    else return false;
    items[next]?.focus({ preventScroll:true });
    items[next]?.scrollIntoView({ block:'nearest', inline:'nearest' });
    return true;
  }

  function renderSearchResults() {
    const results = searchCatalog(state.query);
    el.categoryView.hidden = true;
    el.searchResultsView.hidden = false;
    el.searchResultCount.textContent = String(results.length);
    el.atcStatusText.textContent = results.length
      ? `${results.length} rezultate për “${state.query}”`
      : `Asnjë rezultat për “${state.query}”`;
    el.atcStatusMeta.textContent = 'Kod, grup, kategori dhe nënndarje';
    el.searchResults.innerHTML = results.length ? results.map(item => `
      <button class="search-result" type="button" data-search-code="${escapeHtml(item.code)}" data-search-group="${escapeHtml(item.group)}" data-search-category="${escapeHtml(item.category)}" data-search-subdivision="${escapeHtml(item.subdivision)}" style="--group-accent:${colorFor(item.group)}">
        <span class="search-result-code">${escapeHtml(item.code)}</span>
        <span class="search-result-copy"><strong>${escapeHtml(item.name)}</strong><small>${item.category ? `${escapeHtml(groups()[item.group] || '')}` : `${categoryEntries(item.group).length} kategori terapeutike`}</small></span>
        <span class="search-result-meta"><b>${escapeHtml(item.type)}</b>${resultCount(item) !== '' ? `<small>${formatNumber(resultCount(item))} barna</small>` : ''}</span>
      </button>`).join('') : '<div class="empty-state">Provo një kod si <strong>N02</strong> ose një term si <strong>diabet</strong>, <strong>antibiotik</strong>, <strong>respirator</strong>.</div>';
  }

  function applySearch() {
    state.query = clean(el.atcSearch.value);
    el.clearSearchButton.hidden = !state.query;
    if (state.query) renderSearchResults();
    else {
      el.categoryView.hidden = false;
      el.searchResultsView.hidden = true;
      renderClassification();
    }
  }

  function selectGroup(code, { updateHash = true } = {}) {
    if (!groups()[code]) return;
    state.group = code;
    state.category = '';
    state.subdivision = '';
    state.query = '';
    el.atcSearch.value = '';
    el.clearSearchButton.hidden = true;
    el.categoryView.hidden = false;
    el.searchResultsView.hidden = true;
    if (updateHash) writeHash(code);
    renderClassification();
    requestAnimationFrame(() => document.querySelector(`[data-group-code="${CSS.escape(code)}"]`)?.scrollIntoView({ block:'nearest' }));
  }

  function selectCategory(code, subdivision = '', { updateHash = true } = {}) {
    if (!categories()[code]) return;
    state.group = code.charAt(0);
    state.category = code;
    state.subdivision = subdivision;
    state.query = '';
    el.atcSearch.value = '';
    el.clearSearchButton.hidden = true;
    el.categoryView.hidden = false;
    el.searchResultsView.hidden = true;
    if (updateHash) writeHash(subdivision || code);
    renderClassification();
    requestAnimationFrame(() => {
      const target = subdivision
        ? document.querySelector(`[data-subdivision-code="${CSS.escape(subdivision)}"]`)
        : document.querySelector(`[data-category-card="${CSS.escape(code)}"]`);
      target?.scrollIntoView({ block:'center', behavior:'smooth' });
    });
  }

  function toggleCategory(code) {
    if (state.category === code) {
      state.category = '';
      state.subdivision = '';
      writeHash(state.group);
      renderClassification();
      return;
    }
    selectCategory(code);
  }

  async function loadCounts() {
    try {
      const { payload, response } = await fetchJson('/api/atc-counts', {}, 7000);
      state.counts = payload;
      const total = number(payload.total);
      const classified = number(payload.classifiedTotal);
      const unclassified = number(payload.unclassifiedTotal);
      const coverage = total ? ((classified / total) * 100).toFixed(1) : '100.0';
      el.metricClassified.textContent = formatNumber(classified);
      el.metricUnclassified.textContent = formatNumber(unclassified);
      el.metricCoverage.textContent = `${coverage}% e regjistrit`;
      const source = response.headers.get('X-MedIndex-Data-Source') || payload.source || 'Supabase';
      const sourceLabel = /supabase/i.test(source) ? 'Supabase' : clean(source);
      el.sourceStatus.textContent = `${sourceLabel} · aktiv`;
      el.syncText.textContent = 'Supabase';
      renderClassification();
    } catch (error) {
      console.warn('ATC counts unavailable:', error);
      el.metricClassified.textContent = '—';
      el.metricUnclassified.textContent = '—';
      el.metricCoverage.textContent = 'Numërimet s’u ngarkuan';
      el.sourceStatus.textContent = 'Katalogu ATC · aktiv';
      showToast('Klasifikimi u hap, por numërimet e barnave nuk u ngarkuan.');
    }
  }

  function openSidebar() { el.sidebar.classList.add('is-open'); el.sidebarBackdrop.hidden = false; }
  function closeSidebar() { el.sidebar.classList.remove('is-open'); el.sidebarBackdrop.hidden = true; }

  async function logout() {
    el.logoutButton.disabled = true;
    try {
      await fetch('/api/auth', { method:'DELETE', credentials:'same-origin', headers:{ Accept:'application/json' } });
      location.replace('/landing.html');
    } catch {
      el.logoutButton.disabled = false;
      showToast('Dalja nuk u krye. Provo përsëri.');
    }
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { el.toast.hidden = true; }, 3600);
  }

  function bindEvents() {
    el.groupList.addEventListener('click', event => {
      const button = event.target.closest('[data-group-code]');
      if (button) selectGroup(button.dataset.groupCode);
    });
    el.groupList.addEventListener('keydown', event => {
      if (!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      if (moveFocus(el.groupList, '[data-group-code]', event.key)) event.preventDefault();
    });

    el.categoryList.addEventListener('click', event => {
      const sub = event.target.closest('[data-subdivision-code]');
      if (sub) return;
      const button = event.target.closest('[data-category-code]');
      if (button) toggleCategory(button.dataset.categoryCode);
    });

    el.atcPathItems.addEventListener('click', event => {
      const button = event.target.closest('[data-path-code]');
      if (!button) return;
      const code = button.dataset.pathCode;
      if (code.length === 1) selectGroup(code);
      else selectCategory(code.slice(0,3), code.length > 3 ? code : '');
    });

    el.searchResults.addEventListener('keydown', event => {
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      if (moveFocus(el.searchResults, '[data-search-code]', event.key)) event.preventDefault();
    });

    el.searchResults.addEventListener('click', event => {
      const button = event.target.closest('[data-search-code]');
      if (!button) return;
      const group = button.dataset.searchGroup;
      const category = button.dataset.searchCategory;
      const subdivision = button.dataset.searchSubdivision;
      if (category) selectCategory(category, subdivision);
      else selectGroup(group);
    });

    el.atcSearch.addEventListener('input', applySearch);
    el.atcSearch.addEventListener('keydown', event => {
      if (event.key === 'Escape' && el.atcSearch.value) {
        el.atcSearch.value = '';
        applySearch();
        return;
      }
      if (event.key === 'ArrowDown' && state.query) {
        const first = el.searchResults.querySelector('[data-search-code]');
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    el.clearSearchButton.addEventListener('click', () => {
      el.atcSearch.value = '';
      applySearch();
      el.atcSearch.focus();
    });

    window.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        el.atcSearch.focus();
        el.atcSearch.select();
      }
      if (event.key === 'Escape') closeSidebar();
    });

    window.addEventListener('hashchange', () => {
      const next = readHash();
      if (next.category) selectCategory(next.category, next.subdivision, { updateHash:false });
      else if (next.group) selectGroup(next.group, { updateHash:false });
    });

    el.menuButton.addEventListener('click', openSidebar);
    el.sidebarClose.addEventListener('click', closeSidebar);
    el.sidebarBackdrop.addEventListener('click', closeSidebar);
    el.logoutButton.addEventListener('click', logout);
  }

  async function init() {
    bindEvents();
    const hash = readHash();
    state.group = hash.group && groups()[hash.group] ? hash.group : Object.keys(groups())[0] || 'A';
    state.category = hash.category && categories()[hash.category] ? hash.category : '';
    state.subdivision = hash.subdivision && subdivisions()[hash.subdivision] ? hash.subdivision : '';
    renderClassification();

    try {
      await ensureAuth();
      el.appShell.setAttribute('aria-busy', 'false');
      void loadCounts();
    } catch (error) {
      console.error('ATC classification bootstrap failed:', error);
      el.appShell.setAttribute('aria-busy', 'false');
      showToast(error?.message || 'Klasifikimi ATC nuk u inicializua.');
    }
  }

  init();
})();
