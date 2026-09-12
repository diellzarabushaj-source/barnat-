(() => {
  'use strict';

  const API = '/api/drug-search';
  const PAGE_SIZE = 50;
  const ATC_PREFIX = 'J01';

  const categoryLabels = Object.freeze({
    penicillins:'Penicilina',
    'beta-lactams':'β-laktame të tjera',
    macrolides:'Makrolide & lincosamide',
    tetracyclines:'Tetraciklina',
    quinolones:'Kinolone',
    other:'Të tjera',
  });

  const state = {
    rows:[],
    query:'',
    filter:'all',
    loading:false,
    controller:null,
  };

  const $ = id => document.getElementById(id);
  const el = {
    search:$('antibioticSearch'),
    filterRow:$('filterRow'),
    list:$('antibioticList'),
    loading:$('loadingState'),
    error:$('errorState'),
    errorMessage:$('errorMessage'),
    empty:$('emptyState'),
    retry:$('retryButton'),
    refresh:$('refreshButton'),
    resultsMeta:$('resultsMeta'),
    productCount:$('productCount'),
    substanceCount:$('substanceCount'),
  };

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function searchable(value) {
    return clean(value)
      .toLocaleLowerCase('sq')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function categoryOf(row) {
    const atc = clean(row?.atc).toUpperCase();
    if (atc.startsWith('J01C')) return 'penicillins';
    if (atc.startsWith('J01D')) return 'beta-lactams';
    if (atc.startsWith('J01F')) return 'macrolides';
    if (atc.startsWith('J01A')) return 'tetracyclines';
    if (atc.startsWith('J01M')) return 'quinolones';
    return 'other';
  }

  function uniqueSubstanceCount(rows) {
    return new Set(rows.map(row => searchable(row.activeSubstance)).filter(Boolean)).size;
  }

  function endpoint(page, includeTotal = false) {
    const params = new URLSearchParams({
      view:'registry-page',
      atc:ATC_PREFIX,
      page:String(page),
      pageSize:String(PAGE_SIZE),
      sort:'substance',
      direction:'asc',
    });
    if (includeTotal) params.set('includeTotal', 'true');
    return `${API}?${params.toString()}`;
  }

  async function fetchPage(page, includeTotal, signal) {
    const response = await fetch(endpoint(page, includeTotal), {
      credentials:'same-origin',
      cache:'no-store',
      signal,
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(clean(payload?.error) || `Gabim ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Regjistri ktheu përgjigje të pavlefshme.');
    return payload;
  }

  async function fetchAllAntibiotics(signal) {
    const first = await fetchPage(1, true, signal);
    const totalPages = Math.max(1, Number(first?.pagination?.totalPages) || 1);
    const rows = [...first.rows];

    for (let start = 2; start <= totalPages; start += 4) {
      const pages = [];
      for (let page = start; page < start + 4 && page <= totalPages; page += 1) pages.push(page);
      const batch = await Promise.all(pages.map(page => fetchPage(page, false, signal)));
      batch.forEach(payload => rows.push(...payload.rows));
    }

    const seen = new Set();
    return rows.filter(row => {
      const key = clean(row.id) || [row.registryNumber, row.tradeName, row.activeSubstance, row.strength, row.form].map(clean).join('|');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return clean(row.atc).toUpperCase().startsWith(ATC_PREFIX);
    });
  }

  function visibleRows() {
    const needle = searchable(state.query);
    return state.rows.filter(row => {
      if (state.filter !== 'all' && categoryOf(row) !== state.filter) return false;
      if (!needle) return true;
      const haystack = searchable([
        row.tradeName,
        row.activeSubstance,
        row.atc,
        row.drugClass,
        row.strength,
        row.form,
      ].join(' '));
      return haystack.includes(needle);
    });
  }

  function makeText(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = clean(text) || '—';
    return node;
  }

  function buildRow(row) {
    const article = document.createElement('article');
    article.className = 'antibiotic-row';

    const main = document.createElement('div');
    main.className = 'drug-main';
    main.append(
      makeText('strong', '', row.tradeName || row.activeSubstance),
      makeText('small', '', row.registryNumber ? `Nr. regjistri: ${row.registryNumber}` : clean(row.atc) || 'Antibakterial sistemik')
    );

    const substance = document.createElement('div');
    substance.className = 'drug-substance';
    substance.append(
      makeText('strong', '', row.activeSubstance || 'Substanca aktive e papërcaktuar'),
      makeText('small', '', clean(row.atc) || 'ATC —')
    );

    const meta = document.createElement('div');
    meta.className = 'drug-meta';
    meta.append(
      makeText('small', '', [row.strength, row.form].map(clean).filter(Boolean).join(' · ') || '—'),
      makeText('small', '', row.drugClass || '—')
    );

    const badge = makeText('span', 'class-badge', categoryLabels[categoryOf(row)] || categoryLabels.other);
    article.append(main, substance, meta, badge);
    return article;
  }

  function render() {
    const rows = visibleRows();
    el.list.replaceChildren();

    const fragment = document.createDocumentFragment();
    rows.forEach(row => fragment.append(buildRow(row)));
    el.list.append(fragment);

    el.empty.hidden = rows.length > 0;
    el.list.hidden = rows.length === 0;

    const filterName = state.filter === 'all' ? 'Të gjitha klasat' : categoryLabels[state.filter] || 'Të tjera';
    const queryText = clean(state.query) ? ` · kërkimi “${clean(state.query)}”` : '';
    el.resultsMeta.textContent = `${rows.length} nga ${state.rows.length} produkte · ${filterName}${queryText}`;
  }

  function setLoading(value) {
    state.loading = value;
    el.loading.hidden = !value;
    el.refresh.disabled = value;
    if (value) {
      el.error.hidden = true;
      el.empty.hidden = true;
      el.list.hidden = true;
      el.resultsMeta.textContent = 'Duke ngarkuar të dhënat nga regjistri…';
    }
  }

  function showError(error) {
    el.loading.hidden = true;
    el.list.hidden = true;
    el.empty.hidden = true;
    el.error.hidden = false;
    if (Number(error?.status) === 401) {
      el.errorMessage.textContent = 'Sesioni nuk është aktiv. Kyçu në DRx dhe provo përsëri.';
    } else {
      el.errorMessage.textContent = clean(error?.message) || 'Provo përsëri.';
    }
    el.resultsMeta.textContent = 'Të dhënat nuk u ngarkuan.';
  }

  async function load() {
    if (state.controller) state.controller.abort();
    const controller = new AbortController();
    state.controller = controller;
    setLoading(true);

    try {
      const rows = await fetchAllAntibiotics(controller.signal);
      rows.sort((a, b) => {
        const substance = clean(a.activeSubstance).localeCompare(clean(b.activeSubstance), 'sq', { sensitivity:'base' });
        if (substance) return substance;
        return clean(a.tradeName).localeCompare(clean(b.tradeName), 'sq', { sensitivity:'base' });
      });
      if (controller.signal.aborted) return;
      state.rows = rows;
      el.productCount.textContent = String(rows.length);
      el.substanceCount.textContent = String(uniqueSubstanceCount(rows));
      el.error.hidden = true;
      setLoading(false);
      render();
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setLoading(false);
      showError(error);
    } finally {
      if (state.controller === controller) state.controller = null;
    }
  }

  function selectFilter(value) {
    state.filter = value || 'all';
    el.filterRow.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    render();
  }

  el.search.addEventListener('input', event => {
    state.query = event.target.value;
    render();
  });

  el.filterRow.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    selectFilter(button.dataset.filter);
  });

  el.refresh.addEventListener('click', load);
  el.retry.addEventListener('click', load);

  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      el.search.focus();
      el.search.select();
    }
    if (event.key === 'Escape' && document.activeElement === el.search && el.search.value) {
      el.search.value = '';
      state.query = '';
      render();
    }
  });

  load();
})();
