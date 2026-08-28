(() => {
  'use strict';

  const INDEX_QUERY = `*[_type == "learningTopic" && reviewStatus != "archived"] | order(title asc){
    _id,question,title,"slug":slug.current,keywords,icdCodes,summary,
    reviewStatus,reviewedBy,lastReviewedAt,version,
    "stepCount":count(steps),"prescriptionCount":count(prescriptions),"protocolCount":count(relatedProtocols)
  }`;

  const DETAIL_QUERY = `*[_type == "learningTopic" && _id == $id][0]{
    _id,question,title,"slug":slug.current,keywords,icdCodes,summary,
    steps[]{_key,title,action,why,setting,priority,note},
    prescriptions[]{_key,medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
    redFlags,whenToRefer,reviewStatus,reviewedBy,lastReviewedAt,version,
    relatedProtocols[]->{_id,title,"slug":slug.current,summary,reviewStatus}
  }`;

  const state = {
    items: [],
    filtered: [],
    selectedId: '',
    term: '',
    category: '',
  };

  const detailCache = new Map();
  const detailRequests = new Map();
  const searchIndex = new Map();
  let searchTimer = 0;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

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
    const explicitlySignedOut = response.status === 401
      || response.status === 403
      || (response.ok && payload.authenticated === false);

    if (explicitlySignedOut) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok) throw new Error('Sesioni nuk mund të verifikohet për momentin. Provo përsëri.');
    if (payload.authenticated !== true) throw new Error('Gjendja e sesionit nuk u konfirmua. Provo përsëri.');
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
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v5', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    void loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3', 'data-drx-sidebar-taxonomy');
  }

  async function ensureSanity() {
    if (window.MedIndexSanity) return window.MedIndexSanity;
    await loadRuntime('/sanity-clinical-client.js?v=20260805-1', 'data-drx-sanity-runtime');
    if (!window.MedIndexSanity) throw new Error('Sanity nuk u inicializua.');
    return window.MedIndexSanity;
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
        if (document.activeElement === $('#learningSearch') && state.term) {
          event.preventDefault();
          clearSearch();
          return;
        }
        closeSidebar();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#learningSearch')?.focus();
      }
    });
  }

  function currentItem() {
    return state.items.find(item => item._id === state.selectedId) || null;
  }

  function itemSearchText(item) {
    if (!item?._id) return '';
    if (searchIndex.has(item._id)) return searchIndex.get(item._id);
    const value = normalize([
      item.question,
      item.title,
      item.summary,
      ...(item.keywords || []),
      ...(item.icdCodes || []),
    ].join(' '));
    searchIndex.set(item._id, value);
    return value;
  }

  function applyFilterState() {
    const term = normalize(state.term);
    state.filtered = state.items.filter(item => {
      const inferredCategory = item.icdCodes?.[0]?.charAt(0) || '';
      return (!term || itemSearchText(item).includes(term))
        && (!state.category || inferredCategory === state.category);
    });

    if (!state.filtered.some(item => item._id === state.selectedId)) {
      state.selectedId = state.filtered[0]?._id || '';
    }
  }

  function syncUrl() {
    try {
      const url = new URL(window.location.href);
      const item = currentItem();
      if (item?.slug) url.searchParams.set('topic', item.slug);
      else url.searchParams.delete('topic');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  function restoreUrl() {
    try {
      const url = new URL(window.location.href);
      const slug = url.searchParams.get('topic') || '';
      const item = state.items.find(candidate => candidate.slug === slug);
      if (item) state.selectedId = item._id;
    } catch {}
  }

  function reviewMeta(status) {
    const value = clean(status).toLowerCase();
    if (value === 'verified') return { className:'is-verified', label:'I verifikuar' };
    if (value === 'review') return { className:'is-review', label:'Në rishikim' };
    if (value === 'draft') return { className:'is-draft', label:'Draft' };
    return { className:'', label:value || 'Pa status' };
  }

  function chip(label, className = '') {
    return `<span class="ck-chip ${className}">${esc(label)}</span>`;
  }

  function bulletMarkup(items) {
    return `<ul class="ck-bullets">${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  }

  function stepMarkup(step, index) {
    const meta = [step.priority, step.setting].filter(Boolean);
    return `
      <article class="ck-step">
        <span class="ck-step-number">${String(index + 1).padStart(2, '0')}</span>
        <div class="ck-step-copy">
          <div class="ck-step-title">
            <strong>${esc(step.title || 'Hapi')}</strong>
            ${meta.length ? `<small>${esc(meta.join(' · '))}</small>` : ''}
          </div>
          <p>${esc(step.action || '')}</p>
          ${step.why ? `<div class="ck-step-why"><span>Pse</span><p>${esc(step.why)}</p></div>` : ''}
          ${step.note ? `<small class="ck-step-note">${esc(step.note)}</small>` : ''}
        </div>
      </article>`;
  }

  function rxMarkup(rx) {
    const rows = [
      ['Substanca', rx.genericName],
      ['Forma', rx.form],
      ['Fortësia', rx.strength],
      ['Doza', rx.dose],
      ['Rruga', rx.route],
      ['Shpeshtësia', rx.frequency],
      ['Kohëzgjatja', rx.duration],
      ['Sasia', rx.quantity],
      ['Pacienti', rx.patientGroup],
    ].filter(([, value]) => value);

    return `
      <article class="ck-rx-card">
        <div class="ck-rx-title">
          <span>Rx</span>
          <strong>${esc(rx.medicine || 'Recetë')}</strong>
        </div>
        <dl>${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
        ${rx.instructions ? `<p class="ck-summary">${esc(rx.instructions)}</p>` : ''}
        ${rx.clinicalNote ? `<small>${esc(rx.clinicalNote)}</small>` : ''}
      </article>`;
  }

  function sectionEntries(item) {
    const entries = [];
    if (item.redFlags?.length) entries.push({ id:'hub-red-flags', label:'Red flags' });
    entries.push({ id:'hub-treatment', label:'Trajtimi hap pas hapi' });
    if (item.prescriptions?.length) entries.push({ id:'hub-prescriptions', label:'Shembuj recetash' });
    if (item.whenToRefer) entries.push({ id:'hub-referral', label:'Referimi' });
    if (item.relatedProtocols?.length) entries.push({ id:'hub-protocols', label:'Protokolle të lidhura' });
    return entries;
  }

  function scrollReaderToTop() {
    const root = $('#learningDetail');
    if (!root) return;
    root.scrollIntoView({
      block:'start',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  function renderTopicDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    const review = reviewMeta(item.reviewStatus);
    const sections = sectionEntries(item);
    const currentIndex = state.filtered.findIndex(candidate => candidate._id === item._id);
    const previous = currentIndex > 0 ? state.filtered[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < state.filtered.length - 1 ? state.filtered[currentIndex + 1] : null;

    detail.innerHTML = `
      <div class="ck-document-inner">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.question || 'Temë klinike')}</p>
              <h2>${esc(item.title)}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${(item.icdCodes || []).map(code => chip(code)).join('')}
            ${item.version ? chip(`v${item.version}`) : ''}
            ${item.reviewedBy ? chip(item.reviewedBy) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Në 20 sekonda</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${sections.length > 1 ? `
          <nav class="ck-section-index" aria-label="Përmbajtja e kësaj teme">
            <div class="ck-section-index-head"><span>Në këtë temë</span><small>${sections.length} pjesë</small></div>
            <div class="ck-section-index-list">
              ${sections.map((section, index) => `
                <button type="button" data-hub-section="${section.id}">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <strong>${esc(section.label)}</strong>
                </button>
              `).join('')}
            </div>
          </nav>
        ` : ''}

        <div class="ck-sections">
          ${item.redFlags?.length ? `
            <section class="ck-section ck-referral" id="hub-red-flags">
              <div class="ck-section-heading"><span>Urgjencë</span><h3>Red flags — ndalo dhe vlerëso urgjent</h3></div>
              ${bulletMarkup(item.redFlags)}
            </section>
          ` : ''}

          <section class="ck-section" id="hub-treatment">
            <div class="ck-section-heading"><span>Plan</span><h3>Trajtimi hap pas hapi</h3></div>
            <div class="ck-steps">
              ${(item.steps || []).map(stepMarkup).join('') || '<p class="ck-status">Ende pa hapa.</p>'}
            </div>
          </section>

          ${item.prescriptions?.length ? `
            <section class="ck-section" id="hub-prescriptions">
              <div class="ck-section-heading"><span>Rx</span><h3>Shembuj recetash</h3></div>
              <div class="ck-rx-grid">${item.prescriptions.map(rxMarkup).join('')}</div>
            </section>
          ` : ''}

          ${item.whenToRefer ? `
            <section class="ck-section ck-referral ck-referral-neutral" id="hub-referral">
              <div class="ck-section-heading"><span>Referim</span><h3>Kur të referohet</h3></div>
              <p class="ck-summary">${esc(item.whenToRefer)}</p>
            </section>
          ` : ''}

          ${item.relatedProtocols?.length ? `
            <section class="ck-section" id="hub-protocols">
              <div class="ck-section-heading"><span>Burime</span><h3>Protokolle të lidhura</h3></div>
              <div class="ck-protocol-list">
                ${item.relatedProtocols.map(protocol => `
                  <a href="/protokollet.html" class="ck-protocol-link">
                    <span>${esc(protocol.title)}</span>
                    <small>${esc(protocol.summary || 'Hap protokollet klinike')}</small>
                    <strong>Hap →</strong>
                  </a>
                `).join('')}
              </div>
            </section>
          ` : ''}
        </div>

        ${item.lastReviewedAt ? `
          <div class="ck-source-meta">
            <span>Rishikuar: ${esc(new Date(item.lastReviewedAt).toLocaleDateString('sq-AL'))}</span>
          </div>
        ` : ''}

        ${previous || next ? `
          <nav class="ck-document-pagination" aria-label="Navigimi mes temave">
            ${previous ? `
              <button type="button" class="ck-document-page" data-topic-jump="${esc(previous._id)}">
                <span>← Tema e kaluar</span>
                <strong>${esc(previous.title)}</strong>
              </button>
            ` : '<span></span>'}
            ${next ? `
              <button type="button" class="ck-document-page ck-document-page-next" data-topic-jump="${esc(next._id)}">
                <span>Tema tjetër →</span>
                <strong>${esc(next.title)}</strong>
              </button>
            ` : '<span></span>'}
          </nav>
        ` : ''}
      </div>`;

    detail.querySelectorAll('[data-hub-section]').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById(button.dataset.hubSection)?.scrollIntoView({
          block:'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
    });

    detail.querySelectorAll('[data-topic-jump]').forEach(button => {
      button.addEventListener('click', () => {
        selectTopic(button.dataset.topicJump, { scroll:true });
      });
    });
  }

  function renderEmptyState() {
    const detail = $('#learningDetail');
    if (!detail) return;
    const term = clean(state.term);
    const hasFilter = Boolean(term || state.category);

    detail.innerHTML = `
      <div class="ck-empty">
        <strong>${hasFilter ? 'Asnjë temë nuk u gjet.' : 'Nuk ka tema të disponueshme.'}</strong>
        <span>${hasFilter ? 'Ndrysho filtrat ose pastro kërkimin.' : 'Përmbajtja e Medical Hub do të shfaqet këtu.'}</span>
        ${hasFilter ? '<button class="ck-retry" type="button" data-clear-hub-filters>Pastro filtrat</button>' : ''}
      </div>`;

    detail.querySelector('[data-clear-hub-filters]')?.addEventListener('click', () => clearFilters());
  }

  async function ensureTopicDetail(id) {
    if (!id) return null;
    if (detailCache.has(id)) return detailCache.get(id);
    if (detailRequests.has(id)) return detailRequests.get(id);

    const request = window.MedIndexSanity
      .query(DETAIL_QUERY, { id }, { timeout:12000, cache:'no-cache' })
      .then(item => {
        if (item) detailCache.set(id, item);
        return item || null;
      })
      .finally(() => detailRequests.delete(id));

    detailRequests.set(id, request);
    return request;
  }

  async function renderSelectedDetail() {
    const id = state.selectedId;
    const detail = $('#learningDetail');
    if (!detail) return;

    if (!id) {
      renderEmptyState();
      return;
    }

    if (detailCache.has(id)) {
      renderTopicDetail(detailCache.get(id));
      return;
    }

    const indexItem = state.items.find(item => item._id === id);
    detail.innerHTML = `
      <div class="ck-empty ck-loading">
        <span class="ck-loading-spinner" aria-hidden="true"></span>
        <strong>${esc(indexItem?.title || 'Po ngarkohet tema…')}</strong>
        <span>Po merret vetëm përmbajtja e kësaj teme nga Sanity.</span>
      </div>`;

    try {
      const item = await ensureTopicDetail(id);
      if (state.selectedId !== id) return;
      if (!item) {
        renderEmptyState();
        return;
      }
      renderTopicDetail(item);
    } catch (error) {
      console.error('[Medical Hub v2] Detail:', error);
      if (state.selectedId !== id) return;
      detail.innerHTML = `
        <div class="ck-empty">
          <strong>Tema nuk u ngarkua.</strong>
          <span>Provo përsëri pa humbur filtrat.</span>
          <button class="ck-retry" type="button" data-topic-retry>Provo përsëri</button>
        </div>`;
      detail.querySelector('[data-topic-retry]')?.addEventListener('click', () => {
        detailCache.delete(id);
        void renderSelectedDetail();
      });
    }
  }

  function renderList() {
    const select = $('#learningTopic');
    if (!select) return;

    select.innerHTML = state.filtered.map(item => {
      const code = item.icdCodes?.length ? ` · ${esc(item.icdCodes.join(' · '))}` : '';
      return `<option value="${esc(item._id)}">${esc(item.question || item.title)}${code}</option>`;
    }).join('') || '<option value="">Asnjë temë</option>';

    select.value = state.selectedId;
    select.disabled = state.filtered.length === 0;
  }

  function renderReaderNavigation() {
    const index = state.filtered.findIndex(item => item._id === state.selectedId);
    const searchField = $('#learningSearchField');
    const result = $('#learningResultStatus');
    const position = $('#learningTopicPosition');
    const previous = $('#previousTopicButton');
    const next = $('#nextTopicButton');
    const term = clean(state.term);

    searchField?.classList.toggle('has-value', Boolean(term));

    if (result) {
      if (term) result.textContent = `${state.filtered.length} tema për “${term}”`;
      else if (state.category) result.textContent = `${state.filtered.length} tema në ICD ${state.category}`;
      else result.textContent = `${state.items.length} tema klinike`;
    }

    if (position) position.textContent = index >= 0 ? `${index + 1} / ${state.filtered.length}` : `0 / ${state.filtered.length}`;
    if (previous) previous.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= state.filtered.length - 1;

    const headingStatus = $('#learningStatus');
    if (headingStatus) headingStatus.textContent = `${state.items.length} tema`;
  }

  function selectTopic(id, { scroll = false } = {}) {
    if (!id || !state.filtered.some(item => item._id === id)) return;
    state.selectedId = id;
    renderList();
    renderReaderNavigation();
    syncUrl();
    void renderSelectedDetail();
    if (scroll) requestAnimationFrame(scrollReaderToTop);
  }

  function selectAdjacentTopic(delta) {
    const index = state.filtered.findIndex(item => item._id === state.selectedId);
    const item = state.filtered[index + delta];
    if (item) selectTopic(item._id, { scroll:true });
  }

  function applyFilters() {
    applyFilterState();
    renderList();
    renderReaderNavigation();
    syncUrl();
    void renderSelectedDetail();
  }

  function scheduleSearch(value) {
    state.term = value || '';
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      applyFilters();
    }, 90);
    $('#learningSearchField')?.classList.toggle('has-value', Boolean(clean(state.term)));
  }

  function clearSearch({ focus = true } = {}) {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.term = '';
    const input = $('#learningSearch');
    if (input) input.value = '';
    applyFilters();
    if (focus) input?.focus();
  }

  function clearFilters() {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.term = '';
    state.category = '';
    const input = $('#learningSearch');
    const category = $('#learningCategory');
    if (input) input.value = '';
    if (category) category.value = '';
    applyFilters();
    input?.focus();
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    bindShell();

    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);
      await ensureSanity();

      state.items = await window.MedIndexSanity.query(INDEX_QUERY);
      if (!Array.isArray(state.items)) state.items = [];

      const groups = [...new Set(
        state.items.map(item => item.icdCodes?.[0]?.charAt(0)).filter(Boolean)
      )].sort();

      $('#learningCategory')?.insertAdjacentHTML(
        'beforeend',
        groups.map(group => `<option value="${esc(group)}">ICD ${esc(group)}</option>`).join('')
      );

      state.selectedId = state.items[0]?._id || '';
      restoreUrl();
      applyFilterState();

      $('#learningSearch')?.addEventListener('input', event => scheduleSearch(event.target.value));
      $('#learningSearchClear')?.addEventListener('click', () => clearSearch());
      $('#learningCategory')?.addEventListener('change', event => {
        state.category = event.target.value || '';
        applyFilters();
      });
      $('#learningTopic')?.addEventListener('change', event => selectTopic(event.target.value));
      $('#previousTopicButton')?.addEventListener('click', () => selectAdjacentTopic(-1));
      $('#nextTopicButton')?.addEventListener('click', () => selectAdjacentTopic(1));

      if ($('#syncText')) $('#syncText').textContent = 'Sanity';

      renderList();
      renderReaderNavigation();
      syncUrl();
      await renderSelectedDetail();
      $('#appShell')?.setAttribute('aria-busy','false');
    } catch (error) {
      console.error('[Medical Hub v2]', error);
      if ($('#learningStatus')) $('#learningStatus').textContent = 'Temat nuk u ngarkuan.';
      if ($('#learningResultStatus')) $('#learningResultStatus').textContent = 'Gabim në ngarkim';
      if ($('#learningTopic')) $('#learningTopic').innerHTML = '<option>Gabim në ngarkim</option>';
      if ($('#learningDetail')) {
        $('#learningDetail').innerHTML = `
          <div class="ck-empty">
            <strong>Medical Hub nuk u ngarkua.</strong>
            <span>Provo përsëri pa humbur sesionin.</span>
            <button class="ck-retry" type="button" data-hub-retry>Provo përsëri</button>
          </div>`;
        $('#learningDetail').querySelector('[data-hub-retry]')?.addEventListener('click', () => window.location.reload());
      }
      $('#appShell')?.setAttribute('aria-busy','false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
