(() => {
  'use strict';

  const CACHE_KEY = 'medindex_labs_cache_v3';
  const CACHE_MAX_AGE = 8 * 60 * 60 * 1000;
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq')
    .replace(/[^a-z0-9%+<>=./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  const state = {
    data: { systems: [], tests: [] },
    systems: new Map(),
    searchable: [],
    activeTestId: '',
    lastFocused: null,
    renderTimer: 0,
    renderFrame: 0,
    loading: true
  };

  function setStatus(message, type = '') {
    const node = $('#labStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `lab-status${type ? ` ${type}` : ''}`;
  }

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

  async function waitForAuthentication() {
    if (document.documentElement.classList.contains('auth-ready')) return true;
    if (window.MEDINDEX_AUTH_READY) {
      const result = await window.MEDINDEX_AUTH_READY;
      return result?.authenticated === true;
    }
    const response = await fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    return response.ok && payload.authenticated === true;
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (!cached || !cached.savedAt || Date.now() - cached.savedAt > CACHE_MAX_AGE || !cached.data) return null;
      return cached.data;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
  }

  async function fetchDataset() {
    const response = await fetch('/api/labs', {
      method: 'GET',
      cache: 'no-cache',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sesioni nuk është aktiv.' : `Analizat nuk u ngarkuan (${response.status}).`);
    const payload = await response.json();
    if (!payload?.ok || !payload.data || !Array.isArray(payload.data.tests)) throw new Error('Serveri ktheu dataset laboratorik të pavlefshëm.');
    return payload.data;
  }

  function enrichDataset(data) {
    const enrich = window.MEDINDEX_LAB_CLINICAL?.enrichDataset;
    return typeof enrich === 'function' ? enrich(data) : data;
  }

  function hasPrintedReference(test) {
    return text(test.reference) && !normalize(test.reference).startsWith('nuk eshte shenuar');
  }

  function systemById(id) {
    return state.systems.get(id) || { title: id || 'Seksion i panjohur', description: '' };
  }

  function buildSearchIndex(test) {
    return normalize([
      test.name, test.abbr, test.reference, test.unit, test.specimen,
      test.alternateReference, test.referenceNote, test.sourceLabel,
      test.why, test.high, test.low, test.preparation,
      ...(test.searchAliases || []),
      systemById(test.system).title
    ].join(' '));
  }

  function installDataset(rawData, source = 'server') {
    const data = enrichDataset(rawData);
    state.data = data;
    state.systems = new Map((data.systems || []).map(system => [system.id, system]));
    state.searchable = (data.tests || []).map(test => ({ test, index: buildSearchIndex(test) }));
    state.loading = false;
    renderSystems();
    renderAudit();
    render();
    setStatus(source === 'cache'
      ? 'Të dhënat u hapën nga cache-i i sesionit; po kontrollohet versioni në server…'
      : `U ngarkuan ${state.searchable.length} analiza nga dataset-i i audituar.`);
  }

  function renderSkeletons() {
    const grid = $('#labGrid');
    if (grid) grid.innerHTML = Array.from({ length: 8 }, () => '<div class="lab-skeleton" aria-hidden="true"></div>').join('');
    setStatus('Duke i ngarkuar analizat e mbrojtura…');
  }

  function rangeMarkup(test, compact = false) {
    const primary = `<div class="med-range${hasPrintedReference(test) ? '' : ' is-missing'}">
      ${esc(test.reference || 'Nuk është shënuar në formular')}
      ${test.unit ? `<span>${esc(test.unit)}</span>` : ''}
      ${compact ? `<small>${esc(test.specimen || 'Mostra nuk është shënuar')}</small>` : ''}
    </div>`;
    const alternate = test.alternateReference
      ? `<div class="lab-alt-range"><strong>Intervali i aparatit:</strong> ${esc(test.alternateReference)}</div>`
      : '';
    return primary + alternate;
  }

  function testCard(test) {
    const system = systemById(test.system);
    const flagged = Array.isArray(test.qualityFlags) && test.qualityFlags.length > 0;
    const verified = test.clinicalStatus === 'verified';
    return `<article class="med-card lab-card${flagged ? ' is-flagged' : ''}" data-test-id="${esc(test.id)}">
      <div class="lab-card-head">
        <span class="med-card-code">${esc(test.abbr || test.name)}</span>
        <span class="med-chip ${verified ? 'lab-clinical-badge' : 'lab-source-badge'}">${verified ? 'Interpretim i verifikuar' : 'Vetëm formulari'}</span>
      </div>
      <h3>${esc(test.name)}</h3>
      ${rangeMarkup(test, true)}
      <div class="med-card-meta"><span class="med-chip">${esc(system.title)}</span></div>
      ${flagged ? '<div class="lab-quality">Verifiko njësinë ose intervalin</div>' : ''}
      <button type="button" data-open-test="${esc(test.id)}" aria-label="Shiko detajet për ${esc(test.name)}">Shiko detajet</button>
    </article>`;
  }

  function selectedTests() {
    const query = normalize($('#labSearch')?.value);
    const tokens = query.split(' ').filter(Boolean);
    const system = $('#labSystem')?.value || '';
    const scope = $('#labScope')?.value || '';
    return state.searchable
      .filter(({ test, index }) =>
        (!tokens.length || tokens.every(token => index.includes(token)))
        && (!system || test.system === system)
        && (scope !== 'with-reference' || hasPrintedReference(test))
        && (scope !== 'without-reference' || !hasPrintedReference(test))
        && (scope !== 'verified' || test.clinicalStatus === 'verified')
        && (scope !== 'flagged' || test.qualityFlags?.length)
      )
      .map(item => item.test);
  }

  function renderSystems() {
    const select = $('#labSystem');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Të gjitha seksionet</option>' + (state.data.systems || []).map(system =>
      `<option value="${esc(system.id)}">${esc(system.title)}</option>`
    ).join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function renderAudit() {
    const audit = state.data.audit || {};
    const clinical = state.data.clinicalAudit || {};
    const values = {
      total: audit.totalTests ?? state.searchable.length,
      references: audit.withReference ?? state.searchable.filter(item => hasPrintedReference(item.test)).length,
      verified: clinical.verified ?? state.searchable.filter(item => item.test.clinicalStatus === 'verified').length,
      flagged: clinical.flagged ?? state.searchable.filter(item => item.test.qualityFlags?.length).length
    };
    $('#labAudit').innerHTML = `
      <div class="lab-audit-card"><strong>${values.total}</strong><span>Analiza gjithsej</span></div>
      <div class="lab-audit-card"><strong>${values.references}</strong><span>Me interval të transkriptuar</span></div>
      <div class="lab-audit-card"><strong>${values.verified}</strong><span>Me interpretim të verifikuar</span></div>
      <div class="lab-audit-card${values.flagged ? ' warn' : ''}"><strong>${values.flagged}</strong><span>Kërkojnë verifikim të njësisë/intervalit</span></div>`;
  }

  function render() {
    if (state.loading) return;
    const visible = selectedTests();
    const grid = $('#labGrid');
    if (!grid) return;
    grid.innerHTML = visible.length
      ? visible.map(testCard).join('')
      : '<div class="med-empty">Nuk u gjet asnjë analizë për këtë kërkim ose filtër.</div>';
    $('#labCount').textContent = `${visible.length} / ${state.searchable.length} analiza`;

    const systemId = $('#labSystem')?.value || '';
    const heading = systemId ? systemById(systemId) : null;
    $('#labSectionTitle').textContent = heading?.title || 'Analizat laboratorike';
    $('#labSectionSubtitle').textContent = heading?.description || 'Intervalet lokale ruhen veçmas nga interpretimi klinik i verifikuar.';
    $('#labClear').hidden = !text($('#labSearch')?.value);
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    cancelAnimationFrame(state.renderFrame);
    state.renderTimer = setTimeout(() => {
      state.renderFrame = requestAnimationFrame(render);
    }, 30);
  }

  function detail(label, body, full = false) {
    if (!text(body)) return '';
    return `<section class="med-detail${full ? ' full' : ''}"><strong>${esc(label)}</strong><p>${esc(body)}</p></section>`;
  }

  function qualityMarkup(test) {
    if (!test.qualityFlags?.length) return '';
    return `<div class="lab-quality-box"><strong>Verifikim i nevojshëm</strong><ul>${test.qualityFlags.map(flag => `<li>${esc(flag)}</li>`).join('')}</ul></div>`;
  }

  function openTest(id) {
    const test = state.searchable.find(item => item.test.id === id)?.test;
    if (!test) return;
    state.activeTestId = id;
    state.lastFocused = document.activeElement;
    const system = systemById(test.system);
    $('#detailKicker').textContent = `${system.title} · ${test.abbr || test.name}`;
    $('#detailTitle').textContent = test.name;
    $('#detailBody').innerHTML = `
      <div class="med-detail-grid">
        <section class="med-detail full"><strong>Vlera referente e transkriptuar</strong>${rangeMarkup(test)}</section>
        ${detail('Pse bëhet', test.why, true)}
        ${detail('Kur është e rritur / pozitive', test.high)}
        ${detail('Kur është e ulët / negative', test.low)}
        ${detail('Përgatitja dhe kujdesi', test.preparation, true)}
        ${detail('Mostra', test.specimen)}
        ${detail('Shënim i transkriptimit', test.referenceNote, true)}
        ${detail('Burimi lokal', test.sourceLabel, true)}
      </div>
      ${qualityMarkup(test)}
      <div class="med-source">
        <strong>Kujdes:</strong> ${esc(state.data.disclaimer || 'Intervali i raportit aktual të laboratorit ka përparësi.')}
        ${test.sourceUrl ? `<br><a href="${esc(test.sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape burimin e interpretimit klinik</a>` : '<br>Interpretimi klinik i jashtëm ende nuk është verifikuar për këtë analizë.'}
      </div>`;
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

  function bindEvents() {
    $('#labSearch')?.addEventListener('input', scheduleRender, { passive: true });
    $('#labSystem')?.addEventListener('change', render);
    $('#labScope')?.addEventListener('change', render);
    $('#labClear')?.addEventListener('click', clearSearch);
    $('#labGrid')?.addEventListener('click', event => {
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

  async function load() {
    renderSkeletons();
    const authenticated = await waitForAuthentication();
    if (!authenticated) return;

    const cached = readCache();
    if (cached) installDataset(cached, 'cache');

    try {
      const fresh = await fetchDataset();
      writeCache(fresh);
      installDataset(fresh, 'server');
    } catch (error) {
      console.error(error);
      if (!cached) {
        state.loading = false;
        $('#labGrid').innerHTML = '<div class="med-empty">Analizat nuk u ngarkuan. Rifresko faqen ose kontrollo lidhjen.</div>';
        setStatus(error.message || 'Gabim gjatë ngarkimit.', 'error');
      } else {
        setStatus('Po përdoret kopja e ruajtur e sesionit, sepse serveri nuk u arrit.', 'error');
      }
    }
  }

  function init() {
    initTheme();
    bindEvents();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
