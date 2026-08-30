(() => {
  'use strict';

  const INDEX_QUERY = `*[_type == "learningTopic" && reviewStatus != "archived"]{
    _id,question,title,"slug":slug.current,keywords,icdCodes,procedureCodes,summary,
    contentKind,chapterNumber,lessonNumber,reviewStatus,reviewedBy,lastReviewedAt,version,
    "stepCount":count(steps),"prescriptionCount":count(prescriptions),"protocolCount":count(relatedProtocols),
    "childCount":count(relatedTopics)
  }`;

  const DETAIL_QUERY = `*[_type == "learningTopic" && _id == $id][0]{
    _id,question,title,"slug":slug.current,keywords,icdCodes,procedureCodes,summary,
    contentKind,chapterNumber,lessonNumber,
    steps[]{_key,title,action,why,setting,priority,note},
    prescriptions[]{_key,medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
    figures[]{_key,title,caption,alt,url,sourceUrl,credit,kind,order},
    sources[]{_key,title,organization,url,publishedAt,note},
    redFlags,whenToRefer,reviewStatus,reviewedBy,lastReviewedAt,version,
    relatedProtocols[]->{_id,title,"slug":slug.current,summary,reviewStatus},
    relatedTopics[]->{_id,question,title,"slug":slug.current,summary,icdCodes,procedureCodes,reviewStatus,version}
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

  function chapterNumberFromId(id) {
    const match = String(id || '').match(/^medicalhub-dod-ch(\d{2})(?:-sub(\d+))?$/);
    return match ? Number(match[1]) : null;
  }

  function lessonNumberFromId(id) {
    const match = String(id || '').match(/^medicalhub-dod-ch\d{2}-sub(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function chapterKey(item) {
    const number = Number(item?.chapterNumber) || chapterNumberFromId(item?._id);
    return number ? String(number).padStart(2, '0') : '';
  }

  function isChapter(item) {
    return item?.contentKind === 'chapter'
      || /^medicalhub-dod-ch\d{2}$/.test(String(item?._id || ''));
  }

  function topicOrder(item) {
    const chapter = chapterNumberFromId(item?._id) || Number(item?.chapterNumber) || 999;
    const lesson = lessonNumberFromId(item?._id);
    return chapter * 1000 + (lesson == null ? 0 : lesson);
  }

  function procedureEntries(item) {
    return (item?.procedureCodes || []).map(entry => {
      if (typeof entry === 'string') return { code:entry, system:'Procedurë' };
      return entry || {};
    }).filter(entry => entry.code);
  }

  function itemSearchText(item) {
    if (!item?._id) return '';
    if (searchIndex.has(item._id)) return searchIndex.get(item._id);
    const procedureText = procedureEntries(item)
      .flatMap(entry => [entry.code, entry.system, entry.label])
      .filter(Boolean);
    const value = normalize([
      item.question,
      item.title,
      item.summary,
      ...(item.keywords || []),
      ...(item.icdCodes || []),
      ...procedureText,
    ].join(' '));
    searchIndex.set(item._id, value);
    return value;
  }

  function applyFilterState() {
    const term = normalize(state.term);
    state.filtered = state.items.filter(item => {
      const chapter = chapterKey(item);
      return (!term || itemSearchText(item).includes(term))
        && (!state.category || chapter === state.category);
    }).sort((a, b) => topicOrder(a) - topicOrder(b) || clean(a.title).localeCompare(clean(b.title), 'sq'));

    if (!state.filtered.some(item => item._id === state.selectedId)) {
      const preferred = state.filtered.find(isChapter) || state.filtered[0];
      state.selectedId = preferred?._id || '';
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

  function icdChip(code) {
    const value = clean(code);
    if (!value) return '';
    return `<a class="ck-chip ck-code-chip" href="/icd.html#${encodeURIComponent(value)}" title="Hap ${esc(value)} në ICD-10">ICD‑10 ${esc(value)}</a>`;
  }

  function procedureChip(entry) {
    const code = clean(entry?.code);
    if (!code) return '';
    const system = clean(entry?.system || 'Procedurë');
    const label = clean(entry?.label);
    const title = [system, label].filter(Boolean).join(' — ');
    return `<span class="ck-chip ck-procedure-chip" title="${esc(title)}">${esc(system)} ${esc(code)}</span>`;
  }

  function figureMarkup(figure, index) {
    const url = clean(figure?.url);
    if (!url) return '';
    const alt = clean(figure?.alt || figure?.title || `Figura ${index + 1}`);
    const caption = clean(figure?.caption || figure?.title);
    const sourceUrl = clean(figure?.sourceUrl);
    const credit = clean(figure?.credit);
    return `
      <figure class="ck-figure">
        <img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">
        ${caption || credit || sourceUrl ? `
          <figcaption>
            ${caption ? `<strong>${esc(caption)}</strong>` : ''}
            ${credit ? `<span>${esc(credit)}</span>` : ''}
            ${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Burimi ↗</a>` : ''}
          </figcaption>
        ` : ''}
      </figure>`;
  }

  function lessonBodyLabel(item) {
    const title = normalize(item?.title);
    if (/trajtim|menaxhim/.test(title)) return 'Trajtimi hap pas hapi';
    if (/procedur|kanulim|venepunksion|intubim|kateteriz|punksion|paracentez|toracentez|transfuzion|injeksion|aspirim|artrocentez/.test(title)) return 'Procedura hap pas hapi';
    return 'Pikat dhe hapat kryesorë';
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
    if (item.steps?.length) entries.push({ id:'hub-content', label:lessonBodyLabel(item) });
    if (item.figures?.length) entries.push({ id:'hub-figures', label:'Figura dhe ilustrime' });
    if (item.prescriptions?.length) entries.push({ id:'hub-prescriptions', label:'Shembuj recetash' });
    if (item.whenToRefer) entries.push({ id:'hub-referral', label:'Referimi' });
    if (item.relatedProtocols?.length) entries.push({ id:'hub-protocols', label:'Protokolle të lidhura' });
    if (item.sources?.length) entries.push({ id:'hub-sources', label:'Burimet' });
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

  function bindDetailNavigation(detail) {
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
        const id = button.dataset.topicJump;
        if (!state.filtered.some(item => item._id === id)) {
          const target = state.items.find(item => item._id === id);
          if (target) {
            state.category = chapterKey(target);
            const category = $('#learningCategory');
            if (category) category.value = state.category;
            applyFilterState();
          }
        }
        selectTopic(id, { scroll:true });
      });
    });
  }

  function renderChapterDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    const review = reviewMeta(item.reviewStatus);
    const children = (item.relatedTopics || []).slice().sort((a, b) => topicOrder(a) - topicOrder(b));
    const icdLessons = children.filter(child => child.icdCodes?.length).length;
    const procedureLessons = children.filter(child => procedureEntries(child).length).length;
    const populated = children.filter(child => clean(child.summary)).length;

    detail.innerHTML = `
      <div class="ck-document-inner ck-chapter-document">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.question || 'Kapitull')}</p>
              <h2>${esc(item.title)}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${chip(`${children.length} nënkapituj`)}
            ${icdLessons ? chip(`${icdLessons} me ICD‑10`, 'is-code-count') : ''}
            ${procedureLessons ? chip(`${procedureLessons} procedura`, 'is-procedure-count') : ''}
            ${item.version ? chip(item.version) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Përmbledhja e kapitullit</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${item.steps?.length ? `
          <section class="ck-section ck-chapter-overview">
            <div class="ck-section-heading"><span>Fokus</span><h3>Çfarë përfshin ky kapitull</h3></div>
            <div class="ck-chapter-focus-grid">
              ${item.steps.map((step, index) => `
                <article class="ck-chapter-focus-card">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>${esc(step.title || 'Pjesa')}</strong>
                    <p>${esc(step.action || '')}</p>
                  </div>
                </article>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <section class="ck-section ck-chapter-section">
          <div class="ck-section-heading"><span>Indeks</span><h3>Nënkapitujt e këtij kapitulli</h3></div>
          <div class="ck-chapter-progress">
            <span><strong>${populated}</strong> / ${children.length} me përmbajtje të plotësuar</span>
            <span>${icdLessons} të lidhur me ICD‑10</span>
          </div>
          <div class="ck-chapter-lessons">
            ${children.map((child, index) => {
              const childReview = reviewMeta(child.reviewStatus);
              return `
                <button type="button" class="ck-chapter-lesson" data-topic-jump="${esc(child._id)}">
                  <span class="ck-chapter-lesson-no">${String(index + 1).padStart(2, '0')}</span>
                  <span class="ck-chapter-lesson-copy">
                    <strong>${esc(child.title)}</strong>
                    ${child.summary ? `<small>${esc(child.summary)}</small>` : '<small>Përmbajtja do të plotësohet nga burimi.</small>'}
                    <span class="ck-chapter-lesson-meta">
                      ${(child.icdCodes || []).map(icdChip).join('')}
                      ${procedureEntries(child).map(procedureChip).join('')}
                      <span class="ck-mini-status ${childReview.className}"><i></i>${esc(childReview.label)}</span>
                    </span>
                  </span>
                  <span class="ck-chapter-lesson-arrow" aria-hidden="true">→</span>
                </button>`;
            }).join('') || '<p class="ck-status">Nuk ka nënkapituj të lidhur.</p>'}
          </div>
        </section>
      </div>`;
    bindDetailNavigation(detail);
  }

  function renderLessonDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    const review = reviewMeta(item.reviewStatus);
    const sections = sectionEntries(item);
    const currentIndex = state.filtered.findIndex(candidate => candidate._id === item._id);
    const previous = currentIndex > 0 ? state.filtered[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < state.filtered.length - 1 ? state.filtered[currentIndex + 1] : null;
    const procedures = procedureEntries(item);

    detail.innerHTML = `
      <div class="ck-document-inner">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.question || 'Mësim klinik')}</p>
              <h2>${esc(item.title)}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${(item.icdCodes || []).map(icdChip).join('')}
            ${procedures.map(procedureChip).join('')}
            ${item.version ? chip(item.version) : ''}
            ${item.reviewedBy ? chip(item.reviewedBy) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Në 20 sekonda</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${sections.length > 1 ? `
          <nav class="ck-section-index" aria-label="Përmbajtja e këtij mësimi">
            <div class="ck-section-index-head"><span>Në këtë mësim</span><small>${sections.length} pjesë</small></div>
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

          ${item.steps?.length ? `
            <section class="ck-section" id="hub-content">
              <div class="ck-section-heading"><span>Përmbajtje</span><h3>${esc(lessonBodyLabel(item))}</h3></div>
              <div class="ck-steps">${item.steps.map(stepMarkup).join('')}</div>
            </section>
          ` : ''}

          ${item.figures?.length ? `
            <section class="ck-section" id="hub-figures">
              <div class="ck-section-heading"><span>Figura</span><h3>Figura dhe ilustrime</h3></div>
              <div class="ck-figure-grid">${item.figures.slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(figureMarkup).join('')}</div>
            </section>
          ` : ''}

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

          ${item.sources?.length ? `
            <section class="ck-section" id="hub-sources">
              <div class="ck-section-heading"><span>Burime</span><h3>Burimet dhe referencat</h3></div>
              <div class="ck-source-list">
                ${item.sources.map(source => `
                  <article class="ck-source-card">
                    <div>
                      <strong>${esc(source.title || source.organization || 'Burim')}</strong>
                      ${source.organization ? `<span>${esc(source.organization)}</span>` : ''}
                    </div>
                    ${source.note ? `<p>${esc(source.note)}</p>` : ''}
                    ${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Hap burimin ↗</a>` : ''}
                  </article>
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
          <nav class="ck-document-pagination" aria-label="Navigimi mes mësimeve">
            ${previous ? `
              <button type="button" class="ck-document-page" data-topic-jump="${esc(previous._id)}">
                <span>← Mësimi i kaluar</span>
                <strong>${esc(previous.title)}</strong>
              </button>
            ` : '<span></span>'}
            ${next ? `
              <button type="button" class="ck-document-page ck-document-page-next" data-topic-jump="${esc(next._id)}">
                <span>Mësimi tjetër →</span>
                <strong>${esc(next.title)}</strong>
              </button>
            ` : '<span></span>'}
          </nav>
        ` : ''}
      </div>`;

    bindDetailNavigation(detail);
  }

  function renderTopicDetail(item) {
    if (isChapter(item)) renderChapterDetail(item);
    else renderLessonDetail(item);
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
      const codes = [
        ...(item.icdCodes || []).map(code => `ICD ${code}`),
        ...procedureEntries(item).map(entry => `${entry.system || 'Procedurë'} ${entry.code}`),
      ];
      const code = codes.length ? ` · ${esc(codes.join(' · '))}` : '';
      const prefix = isChapter(item) ? 'Kapitulli · ' : 'Mësimi · ';
      return `<option value="${esc(item._id)}">${prefix}${esc(item.title || item.question)}${code}</option>`;
    }).join('') || '<option value="">Asnjë mësim</option>';

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
    const chapterCount = state.items.filter(isChapter).length;
    const lessonCount = state.items.length - chapterCount;

    searchField?.classList.toggle('has-value', Boolean(term));

    if (result) {
      if (term) result.textContent = `${state.filtered.length} rezultate për “${term}”`;
      else if (state.category) {
        const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);
        result.textContent = chapter ? `${state.filtered.length - 1} mësime në ${chapter.question}` : `${state.filtered.length} rezultate`;
      } else result.textContent = `${chapterCount} kapituj · ${lessonCount} mësime`;
    }

    if (position) position.textContent = index >= 0 ? `${index + 1} / ${state.filtered.length}` : `0 / ${state.filtered.length}`;
    if (previous) previous.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= state.filtered.length - 1;

    const headingStatus = $('#learningStatus');
    if (headingStatus) headingStatus.textContent = `${chapterCount} kapituj · ${lessonCount} mësime`;
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
      state.items.sort((a, b) => topicOrder(a) - topicOrder(b) || clean(a.title).localeCompare(clean(b.title), 'sq'));

      const chapters = state.items.filter(isChapter);
      $('#learningCategory')?.insertAdjacentHTML(
        'beforeend',
        chapters.map(chapter => `<option value="${chapterKey(chapter)}">${esc(chapter.question || chapter.title)} — ${esc(chapter.title.replace(/^\d+\s*[—-]\s*/, ''))}</option>`).join('')
      );

      state.selectedId = chapters[0]?._id || state.items[0]?._id || '';
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
