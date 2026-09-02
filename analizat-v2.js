(() => {
  'use strict';

  const TIER_ORDER = Object.freeze({ core:0, recommended:1, conditional:2, manual:3 });
  const TIER_META = Object.freeze({
    core:{ label:'Bazë', description:'Analiza kryesore të panelit' },
    recommended:{ label:'Të rekomanduara', description:'Plotësojnë vlerësimin klinik' },
    conditional:{ label:'Sipas situatës', description:'Varen nga konteksti i pacientit' },
    manual:{ label:'Shtuar manualisht', description:'Të shtuara nga katalogu' },
  });

  const state = {
    data:null,
    testsById:new Map(),
    categoriesById:new Map(),
    indicationsById:new Map(),
    selectedIndicationIds:new Set(),
    manualTestIds:new Set(),
    excludedTestIds:new Set(),
    diseaseTerm:'',
    manualTerm:'',
    searchTimer:0,
  };

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
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
      return { response, payload };
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
    const { response, payload } = await authJson();
    const signedOut = response.status === 401
      || response.status === 403
      || (response.ok && payload.authenticated === false);

    if (signedOut) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok) throw new Error('Sesioni nuk mund të verifikohet për momentin.');
    if (payload.authenticated !== true) throw new Error('Gjendja e sesionit nuk u konfirmua.');
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      return new Promise(resolve => {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once:true });
        setTimeout(resolve, 1800);
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(marker, '1');
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
      }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfileChrome(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v6', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    if (window.DRxSidebarTaxonomy || window.DRxSidebarCollapse) return Promise.resolve();
    const existing = document.querySelector('script[src^="/sidebar-taxonomy-v3.js"], script[data-drx-sidebar-taxonomy]');
    if (existing) return Promise.resolve();
    return loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v5', 'data-drx-sidebar-taxonomy');
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = false;
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  async function logout() {
    const button = $('#logoutButton');
    if (button) button.disabled = true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch {
      if (button) button.disabled = false;
    }
  }

  function bindShell() {
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!$('#labDiseasePopover')?.hidden) {
          closeDiseasePicker();
          return;
        }
        if (!$('#labManualResults')?.hidden) {
          hideManualResults();
          return;
        }
        closeSidebar();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#labManualSearch')?.focus();
      }
    });
  }

  async function loadDataset() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch('/api/icd?dataset=labs', {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal:controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `API ${response.status}`);
      const data = payload?.data;
      if (!data || !Array.isArray(data.tests) || !Array.isArray(data.categories) || !Array.isArray(data.indications)) {
        throw new Error('Dataset-i i analizave nuk është i plotë.');
      }
      if (!data.tests.length || !data.categories.length || !data.indications.length) {
        throw new Error('Katalogu ose profilet klinike janë bosh.');
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function installDataset(data) {
    state.data = data;
    state.testsById = new Map(data.tests.map(test => [test.id, test]));
    state.categoriesById = new Map(data.categories.map(category => [category.id, category]));
    state.indicationsById = new Map(data.indications.map(indication => [indication.id, indication]));

    $('#labTestTotal').textContent = String(data.tests.length);
    $('#labIndicationTotal').textContent = String(data.indications.length);
    $('#syncText').textContent = data.source || 'Supabase';
    $('#sourceStatus').textContent = `${data.source || 'Supabase'} · ${data.tests.length} analiza · ${data.indications.length} profile klinike`;

    restoreUrl();
    renderAll();
  }

  function selectedIndications() {
    return [...state.selectedIndicationIds]
      .map(id => state.indicationsById.get(id))
      .filter(Boolean)
      .sort((a, b) => (Number(a.sortOrder) || 100) - (Number(b.sortOrder) || 100));
  }

  function diseaseSearchText(indication) {
    return normalize([
      indication.title,
      indication.titleEn,
      ...(indication.icdCodes || []),
      ...(indication.aliases || []),
      indication.summary,
    ].join(' '));
  }

  function testSearchText(test) {
    return normalize([
      test.formName,
      test.albanianName,
      test.englishName,
      test.category,
      test.whatItShows,
    ].join(' '));
  }

  function tierOf(current, incoming) {
    if (!current) return incoming || 'recommended';
    const a = TIER_ORDER[current] ?? 99;
    const b = TIER_ORDER[incoming] ?? 99;
    return b < a ? incoming : current;
  }

  function buildPlanEntries() {
    const map = new Map();

    for (const indication of selectedIndications()) {
      for (const link of indication.tests || []) {
        const test = state.testsById.get(link.testId);
        if (!test) continue;

        if (!map.has(test.id)) {
          map.set(test.id, {
            test,
            tier:link.tier || 'recommended',
            reasons:[],
            manual:false,
          });
        }

        const entry = map.get(test.id);
        entry.tier = tierOf(entry.tier, link.tier || 'recommended');
        if (!entry.reasons.some(reason => reason.indicationId === indication.id)) {
          entry.reasons.push({
            indicationId:indication.id,
            disease:indication.title,
            icdCodes:indication.icdCodes || [],
            rationale:link.rationale || '',
            contextNote:link.contextNote || '',
          });
        }
      }
    }

    for (const testId of state.manualTestIds) {
      const test = state.testsById.get(testId);
      if (!test) continue;
      if (!map.has(testId)) {
        map.set(testId, { test, tier:'manual', reasons:[], manual:true });
      } else {
        map.get(testId).manual = true;
      }
    }

    return [...map.values()].sort((a, b) => {
      const tierDiff = (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
      if (tierDiff) return tierDiff;
      return clean(a.test.formName).localeCompare(clean(b.test.formName), 'sq');
    });
  }

  function syncUrl() {
    try {
      const url = new URL(window.location.href);
      const slugs = selectedIndications().map(item => item.slug).filter(Boolean);
      if (slugs.length) url.searchParams.set('dx', slugs.join(','));
      else url.searchParams.delete('dx');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  function restoreUrl() {
    try {
      const url = new URL(window.location.href);
      const slugs = (url.searchParams.get('dx') || '').split(',').map(clean).filter(Boolean);
      const bySlug = new Map((state.data?.indications || []).map(item => [item.slug, item.id]));
      slugs.forEach(slug => {
        const id = bySlug.get(slug);
        if (id) state.selectedIndicationIds.add(id);
      });
    } catch {}
  }

  function openDiseasePicker() {
    const popover = $('#labDiseasePopover');
    const trigger = $('#labDiseaseTrigger');
    if (!popover || !trigger) return;
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    renderDiseaseList();
    requestAnimationFrame(() => $('#labDiseaseSearch')?.focus());
  }

  function closeDiseasePicker() {
    const popover = $('#labDiseasePopover');
    const trigger = $('#labDiseaseTrigger');
    if (popover) popover.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    state.diseaseTerm = '';
    if ($('#labDiseaseSearch')) $('#labDiseaseSearch').value = '';
  }

  function toggleDiseasePicker() {
    if ($('#labDiseasePopover')?.hidden) openDiseasePicker();
    else closeDiseasePicker();
  }

  function diseaseOptionMarkup(indication) {
    const selected = state.selectedIndicationIds.has(indication.id);
    return `
      <button type="button" class="lab-disease-option${selected ? ' is-selected' : ''}" data-disease-id="${esc(indication.id)}" role="option" aria-selected="${selected}">
        <span class="lab-disease-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg>
        </span>
        <span class="lab-disease-copy">
          <strong>${esc(indication.title)}</strong>
          <small>${esc(indication.summary || indication.titleEn || '')}</small>
        </span>
        <span class="lab-disease-icd">${(indication.icdCodes || []).map(code => `<span>${esc(code)}</span>`).join('')}<small>${(indication.tests || []).length} analiza</small></span>
      </button>`;
  }

  function renderDiseaseList() {
    const root = $('#labDiseaseList');
    if (!root || !state.data) return;
    const term = normalize(state.diseaseTerm);
    const rows = state.data.indications.filter(indication => !term || diseaseSearchText(indication).includes(term));

    root.innerHTML = rows.length
      ? rows.map(diseaseOptionMarkup).join('')
      : '<div class="lab-picker-empty">Nuk u gjet diagnozë.</div>';
  }

  function renderSelectedDiseases() {
    const root = $('#labSelectedDiseases');
    const summary = $('#labSummaryDiseases');
    const triggerText = $('#labDiseaseTriggerText');
    const indications = selectedIndications();

    if (triggerText) {
      triggerText.textContent = indications.length === 0
        ? 'Zgjidh diagnoza…'
        : indications.length === 1
          ? indications[0].title
          : `${indications.length} diagnoza të zgjedhura`;
    }

    if (root) {
      root.innerHTML = indications.length
        ? indications.map(indication => `
          <span class="lab-disease-chip">
            <span>${esc(indication.title)}</span>
            <small>${esc((indication.icdCodes || []).join(' · '))}</small>
            <button type="button" data-remove-disease="${esc(indication.id)}" aria-label="Hiq ${esc(indication.title)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l10 10M17 7 7 17"/></svg>
            </button>
          </span>`).join('')
        : '<span class="lab-selected-empty">Nuk ke zgjedhur ende diagnozë.</span>';
    }

    if (summary) {
      summary.innerHTML = indications.length
        ? indications.map(indication => `
          <div class="lab-summary-dx-item">
            <strong>${esc(indication.title)}</strong>
            <span>${esc((indication.icdCodes || []).join(' · '))}</span>
          </div>`).join('')
        : '<span>—</span>';
    }

    $('#labDiagnosisCount').textContent = String(indications.length);
  }

  function pruneExcludedTests() {
    const activeIds = new Set(buildPlanEntries().map(entry => entry.test.id));
    for (const id of [...state.excludedTestIds]) {
      if (!activeIds.has(id)) state.excludedTestIds.delete(id);
    }
  }

  function toggleIndication(id) {
    if (!state.indicationsById.has(id)) return;
    if (state.selectedIndicationIds.has(id)) state.selectedIndicationIds.delete(id);
    else state.selectedIndicationIds.add(id);

    pruneExcludedTests();
    renderDiseaseList();
    renderSelectedDiseases();
    renderPlan();
    renderGaps();
    renderManualResults();
    syncUrl();
  }

  function removeIndication(id) {
    state.selectedIndicationIds.delete(id);
    pruneExcludedTests();
    renderDiseaseList();
    renderSelectedDiseases();
    renderPlan();
    renderGaps();
    renderManualResults();
    syncUrl();
  }

  function manualSearchResults() {
    const term = normalize(state.manualTerm);
    if (!term || !state.data) return [];
    const existing = new Set(buildPlanEntries().map(entry => entry.test.id));
    return state.data.tests
      .filter(test => !existing.has(test.id) && testSearchText(test).includes(term))
      .slice(0, 10);
  }

  function hideManualResults() {
    const root = $('#labManualResults');
    if (root) root.hidden = true;
  }

  function renderManualResults() {
    const root = $('#labManualResults');
    if (!root) return;
    const results = manualSearchResults();

    if (!clean(state.manualTerm)) {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }

    root.hidden = false;
    root.innerHTML = results.length
      ? results.map(test => `
        <button type="button" class="lab-manual-option" data-add-test="${esc(test.id)}" role="option">
          <span>
            <strong>${esc(test.formName)}</strong>
            <small>${esc(test.albanianName || test.englishName || test.category || '')}</small>
          </span>
          <em>Shto +</em>
        </button>`).join('')
      : '<div class="lab-picker-empty">Nuk u gjet analizë tjetër.</div>';
  }

  function addManualTest(id) {
    if (!state.testsById.has(id)) return;
    state.manualTestIds.add(id);
    state.excludedTestIds.delete(id);
    state.manualTerm = '';
    if ($('#labManualSearch')) $('#labManualSearch').value = '';
    hideManualResults();
    renderPlan();
    renderManualResults();
  }

  function removeManualTest(id) {
    state.manualTestIds.delete(id);
    state.excludedTestIds.delete(id);
    pruneExcludedTests();
    renderPlan();
    renderManualResults();
  }

  function tierSectionMarkup(tier, entries) {
    if (!entries.length) return '';
    const meta = TIER_META[tier] || TIER_META.recommended;

    return `
      <section class="lab-tier-section" data-tier="${esc(tier)}">
        <header class="lab-tier-head">
          <div class="lab-tier-title">
            <span class="lab-tier-marker" aria-hidden="true"></span>
            <strong>${esc(meta.label)}</strong>
            <small>${esc(meta.description)}</small>
          </div>
          <span>${entries.length} analiza</span>
        </header>
        <div class="lab-test-list">
          ${entries.map(testRowMarkup).join('')}
        </div>
      </section>`;
  }

  function testRowMarkup(entry) {
    const test = entry.test;
    const selected = !state.excludedTestIds.has(test.id);
    const category = state.categoriesById.get(test.categoryId);
    const detailLines = [
      test.whatItShows ? `<p><strong>Çfarë tregon:</strong> ${esc(test.whatItShows)}</p>` : '',
      test.highPositiveAbnormal ? `<p><strong>Kur rritet / jonormale:</strong> ${esc(test.highPositiveAbnormal)}</p>` : '',
      test.lowNegativeNormal ? `<p><strong>Kur ulet / normale:</strong> ${esc(test.lowNegativeNormal)}</p>` : '',
    ].filter(Boolean).join('');

    return `
      <article class="lab-test-row" data-test-id="${esc(test.id)}">
        <label class="lab-test-toggle" aria-label="${selected ? 'Hiq' : 'Shto'} ${esc(test.formName)}">
          <input type="checkbox" data-plan-toggle="${esc(test.id)}" ${selected ? 'checked' : ''}>
        </label>
        <div class="lab-test-main">
          <div class="lab-test-title">
            <strong>${esc(test.formName)}</strong>
            ${test.albanianName && test.albanianName !== test.formName ? `<small>${esc(test.albanianName)}</small>` : ''}
            <span class="lab-test-category">${esc(category?.title || test.category || 'Laborator')}</span>
          </div>

          ${entry.reasons.length ? `
            <div class="lab-test-rationales">
              ${entry.reasons.map(reason => `
                <div class="lab-rationale">
                  <span>${esc(reason.disease)}</span>
                  <div>
                    <p>${esc(reason.rationale || 'E përfshirë në panelin klinik.')}</p>
                    ${reason.contextNote ? `<p class="lab-test-context">${esc(reason.contextNote)}</p>` : ''}
                  </div>
                </div>`).join('')}
            </div>
          ` : '<p class="lab-test-context">Shtuar manualisht nga katalogu i analizave.</p>'}

          ${detailLines ? `
            <details class="lab-test-details">
              <summary>Detajet e analizës ↓</summary>
              <div class="lab-test-detail-body">${detailLines}</div>
            </details>
          ` : ''}
        </div>
        ${entry.manual ? `<button class="lab-test-remove" type="button" data-remove-manual="${esc(test.id)}">Hiq manualen</button>` : '<span></span>'}
      </article>`;
  }

  function renderPlan() {
    const root = $('#labPlanSections');
    if (!root) return;
    const entries = buildPlanEntries();
    const selectedEntries = entries.filter(entry => !state.excludedTestIds.has(entry.test.id));
    const dxCount = state.selectedIndicationIds.size;

    $('#labSelectedTestCount').textContent = String(selectedEntries.length);
    $('#labCopyPlan').disabled = selectedEntries.length === 0;

    const status = $('#labPlanStatus');
    if (status) {
      if (!entries.length) {
        status.textContent = dxCount
          ? 'Profilet e zgjedhura nuk kanë analiza të lidhura në katalog.'
          : 'Zgjidh një diagnozë ose shto analizë manualisht.';
      } else {
        status.textContent = `${dxCount} diagnoza · ${entries.length} analiza në panel · ${selectedEntries.length} të zgjedhura`;
      }
    }

    if (!entries.length) {
      root.innerHTML = `
        <div class="lab-plan-empty">
          <span class="lab-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 16h9"/></svg>
          </span>
          <strong>Zgjidh diagnozat sipër.</strong>
          <span>DRx do t’i bashkojë analizat e nevojshme dhe do ta shpjegojë pse sugjerohet secila.</span>
        </div>`;
      return;
    }

    const grouped = new Map(['core','recommended','conditional','manual'].map(tier => [tier, []]));
    entries.forEach(entry => {
      const tier = grouped.has(entry.tier) ? entry.tier : 'recommended';
      grouped.get(tier).push(entry);
    });

    root.innerHTML = [...grouped.entries()]
      .map(([tier, rows]) => tierSectionMarkup(tier, rows))
      .join('');
  }

  function renderGaps() {
    const root = $('#labGapList');
    if (!root) return;

    const merged = new Map();
    for (const indication of selectedIndications()) {
      for (const gap of indication.catalogGaps || []) {
        const name = clean(gap?.name);
        if (!name) continue;
        const key = normalize(name);
        if (!merged.has(key)) merged.set(key, { name, notes:[], diseases:[] });
        const item = merged.get(key);
        const note = clean(gap?.note);
        if (note && !item.notes.includes(note)) item.notes.push(note);
        if (!item.diseases.includes(indication.title)) item.diseases.push(indication.title);
      }
    }

    const gaps = [...merged.values()];
    $('#labGapCount').textContent = String(gaps.length);

    root.innerHTML = gaps.length
      ? gaps.map(gap => `
        <div class="lab-gap-item">
          <strong>${esc(gap.name)}</strong>
          ${gap.notes.length ? `<p>${esc(gap.notes.join(' '))}</p>` : ''}
          <small>${esc(gap.diseases.join(' · '))}</small>
        </div>`).join('')
      : '<p>Nuk ka boshllëqe të identifikuara për diagnozat e zgjedhura.</p>';
  }

  function renderAll() {
    renderDiseaseList();
    renderSelectedDiseases();
    renderPlan();
    renderGaps();
    renderManualResults();
  }

  function clearPlan() {
    state.selectedIndicationIds.clear();
    state.manualTestIds.clear();
    state.excludedTestIds.clear();
    state.diseaseTerm = '';
    state.manualTerm = '';

    if ($('#labDiseaseSearch')) $('#labDiseaseSearch').value = '';
    if ($('#labManualSearch')) $('#labManualSearch').value = '';

    closeDiseasePicker();
    hideManualResults();
    renderAll();
    syncUrl();
  }

  function togglePlannedTest(id, checked) {
    if (checked) state.excludedTestIds.delete(id);
    else state.excludedTestIds.add(id);
    renderPlan();
  }

  function copyPlanText() {
    const indications = selectedIndications();
    const entries = buildPlanEntries().filter(entry => !state.excludedTestIds.has(entry.test.id));
    const lines = [];

    if (indications.length) {
      lines.push('Diagnozat:');
      indications.forEach(item => {
        const codes = (item.icdCodes || []).join(', ');
        lines.push(`- ${item.title}${codes ? ` (${codes})` : ''}`);
      });
      lines.push('');
    }

    lines.push('Analizat:');
    entries.forEach(entry => lines.push(`- ${entry.test.formName}`));

    const gaps = [];
    indications.forEach(item => (item.catalogGaps || []).forEach(gap => {
      const name = clean(gap?.name);
      if (name && !gaps.includes(name)) gaps.push(name);
    }));

    if (gaps.length) {
      lines.push('', 'Mungojnë në katalog:');
      gaps.forEach(name => lines.push(`- ${name}`));
    }

    lines.push('', 'Shënim: Panel orientues klinik; përshtate sipas pacientit dhe protokollit lokal.');
    return lines.join('\n');
  }

  function showToast(message) {
    document.querySelector('.lab-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'lab-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  async function copyPlan() {
    const value = copyPlanText();
    try {
      await navigator.clipboard.writeText(value);
      showToast('Lista e analizave u kopjua.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      showToast(copied ? 'Lista e analizave u kopjua.' : 'Kopjimi nuk u krye.');
    }
  }

  function bindEvents() {
    $('#labDiseaseTrigger')?.addEventListener('click', toggleDiseasePicker);
    $('#labDiseaseTrigger')?.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      if ($('#labDiseasePopover')?.hidden) openDiseasePicker();
      else $('#labDiseaseSearch')?.focus();
    });

    $('#labDiseaseSearch')?.addEventListener('input', event => {
      state.diseaseTerm = event.target.value || '';
      renderDiseaseList();
    });
    $('#labDiseaseSearch')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'Enter'].includes(event.key)) return;
      const first = $('#labDiseaseList')?.querySelector('[data-disease-id]');
      if (!first) return;
      event.preventDefault();
      if (event.key === 'Enter') first.click();
      else first.focus();
    });

    $('#labDiseaseList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-disease-id]');
      if (button) toggleIndication(button.dataset.diseaseId);
    });
    $('#labDiseaseList')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const options = [...event.currentTarget.querySelectorAll('[data-disease-id]')];
      const index = options.indexOf(document.activeElement);
      if (index < 0 || !options.length) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, index + 1)
        : Math.max(0, index - 1);
      options[next]?.focus();
    });

    $('#labSelectedDiseases')?.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-disease]');
      if (button) removeIndication(button.dataset.removeDisease);
    });

    $('#labManualSearch')?.addEventListener('input', event => {
      state.manualTerm = event.target.value || '';
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.searchTimer = 0;
        renderManualResults();
      }, 70);
    });
    $('#labManualSearch')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'Enter'].includes(event.key)) return;
      const first = $('#labManualResults')?.querySelector('[data-add-test]');
      if (!first) return;
      event.preventDefault();
      if (event.key === 'Enter') first.click();
      else first.focus();
    });

    $('#labManualResults')?.addEventListener('click', event => {
      const button = event.target.closest('[data-add-test]');
      if (button) addManualTest(button.dataset.addTest);
    });
    $('#labManualResults')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const options = [...event.currentTarget.querySelectorAll('[data-add-test]')];
      const index = options.indexOf(document.activeElement);
      if (index < 0 || !options.length) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, index + 1)
        : Math.max(0, index - 1);
      options[next]?.focus();
    });

    $('#labPlanSections')?.addEventListener('change', event => {
      const input = event.target.closest('[data-plan-toggle]');
      if (input) togglePlannedTest(input.dataset.planToggle, input.checked);
    });

    $('#labPlanSections')?.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-manual]');
      if (button) removeManualTest(button.dataset.removeManual);
    });

    $('#labClearPlan')?.addEventListener('click', clearPlan);
    $('#labCopyPlan')?.addEventListener('click', copyPlan);

    document.addEventListener('click', event => {
      if (!event.target.closest('#labDiseasePicker')) closeDiseasePicker();
      if (!event.target.closest('#labManualPicker')) hideManualResults();
    });
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    bindShell();
    bindEvents();

    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);
      const data = await loadDataset();
      installDataset(data);
      $('#appShell')?.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error('[Analizat v2]', error);
      $('#syncText').textContent = 'Gabim';
      $('#labTestTotal').textContent = '—';
      $('#labIndicationTotal').textContent = '—';
      $('#labPlanSections').innerHTML = `
        <div class="lab-plan-empty">
          <span class="lab-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4.5 3.5 19.5h17L12 4.5Z"/><path d="M12 9v4M12 16.5h.01"/></svg>
          </span>
          <strong>Analizat nuk u ngarkuan.</strong>
          <span>Kontrollo lidhjen me Supabase dhe provo përsëri.</span>
          <button class="lab-clear-plan" type="button" data-lab-retry>Provo përsëri</button>
        </div>`;
      $('#labPlanSections')?.querySelector('[data-lab-retry]')?.addEventListener('click', () => window.location.reload());
      $('#appShell')?.setAttribute('aria-busy', 'false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
