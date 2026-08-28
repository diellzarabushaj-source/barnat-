(() => {
  'use strict';

  const QUERY = `{
    "sections": *[_type == "emergencySection" && reviewStatus != "archived"] | order(order asc){
      _id,title,sourceTitleEn,"slug":slug.current,sectionNumber,order,lessonCount,
      sourcePdfPage,sourceBook,sourceEdition,reviewStatus
    },
    "lessons": *[_type == "emergencyLesson" && reviewStatus != "archived"] | order(order asc){
      _id,title,sourceTitleEn,"slug":slug.current,chapterNumber,order,orderInSection,
      sourceSectionNumber,sourcePdfStartPage,sourcePdfEndPage,quickSummary,
      sourceBook,sourceEdition,reviewStatus,
      section->{_id,title,sectionNumber},
      subtopics[]{_key,order,title,sourceTitleEn},
      lessonSections[]{
        _key,order,title,sourceHeadingEn,explanation,clinicalPearl,figureNumbers,tableNumbers,
        rx[]{_key,order,text,note}
      },
      translatedTables[]{
        _key,tableNumber,titleSq,sourceTitleEn,sourcePdfPage,columnsSq,descriptionSq,clinicalHighlight,sourceNote,
        rows[]{_key,cells}
      },
      abbreviations[]{_key,footnoteNumber,abbreviation,fullTermEn,explanationSq},
      figures[]{_key,visualType,figureNumber,sourcePdfPage,caption,sourceCaptionEn,alt,externalUrl}
    }
  }`;

  const FIGURE_DETAIL_QUERY = `*[_type == "emergencyLesson" && _id == $id][0]{
    _id,
    figures[]{
      _key,visualType,figureNumber,sourcePdfPage,caption,sourceCaptionEn,alt,externalUrl,imageDataUrl,imageDataChunks,
      image{asset->{url},alt}
    }
  }`;

  const state = {
    sections: [],
    lessons: [],
    visibleSections: [],
    selectedSectionId: '',
    selectedLessonId: '',
    term: '',
  };

  const figureCache = new Map();
  const figureRequests = new Map();

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
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
        credentials:'same-origin', cache:'no-store', ...options, signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally { clearTimeout(timer); }
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
    if (!response.ok) {
      throw new Error('Sesioni nuk mund të verifikohet për momentin. Provo përsëri.');
    }
    if (payload.authenticated !== true) {
      throw new Error('Gjendja e sesionit nuk u konfirmua. Provo përsëri.');
    }
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return new Promise(resolve => {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', resolve, { once:true });
      setTimeout(resolve, 1800);
    });
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.defer = true; script.setAttribute(marker, '1');
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once:true });
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
        if (document.activeElement === $('#emergencySearch') && state.term) {
          event.preventDefault();
          clearSearch();
          return;
        }
        closeSidebar();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#emergencySearch')?.focus();
      }
    });
  }

  function sectionLessons(sectionId) {
    return state.lessons
      .filter(lesson => lesson?.section?._id === sectionId)
      .sort((a, b) =>
        (Number(a.orderInSection) || Number(a.chapterNumber) || 999) -
        (Number(b.orderInSection) || Number(b.chapterNumber) || 999)
      );
  }

  function haystackForLesson(lesson) {
    return normalize([
      lesson.title,
      lesson.sourceTitleEn,
      lesson.quickSummary,
      ...(lesson.lessonSections || []).flatMap(section => [
        section.title,
        section.sourceHeadingEn,
        section.explanation,
        section.clinicalPearl,
        ...(section.rx || []).flatMap(rx => [rx.text, rx.note]),
      ]),
      ...(lesson.subtopics || []).flatMap(item => [
        item.title,
        item.sourceTitleEn,
      ]),
      ...(lesson.translatedTables || []).flatMap(table => [
        table.tableNumber,
        table.titleSq,
        table.sourceTitleEn,
        table.descriptionSq,
        table.clinicalHighlight,
        table.sourceNote,
        ...(table.columnsSq || []),
        ...(table.rows || []).flatMap(row => row.cells || []),
      ]),
      ...(lesson.abbreviations || []).flatMap(item => [
        item.abbreviation,
        item.fullTermEn,
        item.explanationSq,
      ]),
    ].join(' '));
  }

  function currentSection() {
    return state.sections.find(section => section._id === state.selectedSectionId) || null;
  }

  function currentLesson() {
    return state.lessons.find(lesson => lesson._id === state.selectedLessonId) || null;
  }

  function filteredLessonsForSection(sectionId) {
    const lessons = sectionLessons(sectionId);
    const term = normalize(state.term);
    return term ? lessons.filter(lesson => haystackForLesson(lesson).includes(term)) : lessons;
  }

  function visibleLessonSequence() {
    return state.visibleSections.flatMap(section => filteredLessonsForSection(section._id));
  }

  function renderReaderNavigation() {
    const sequence = visibleLessonSequence();
    const index = sequence.findIndex(lesson => lesson._id === state.selectedLessonId);
    const searchField = $('#emergencySearchField');
    const result = $('#emergencyResultStatus');
    const position = $('#emergencyLessonPosition');
    const previous = $('#previousLessonButton');
    const next = $('#nextLessonButton');
    const term = String(state.term || '').trim();

    searchField?.classList.toggle('has-value', Boolean(term));

    if (result) {
      result.textContent = term
        ? `${sequence.length} mësime në ${state.visibleSections.length} kapituj për “${term}”`
        : `${state.sections.length} kapituj · ${state.lessons.length} mësime`;
    }

    if (position) {
      position.textContent = index >= 0 ? `${index + 1} / ${sequence.length}` : `0 / ${sequence.length}`;
    }

    if (previous) previous.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= sequence.length - 1;
  }

  function scrollReaderToTop() {
    const root = $('#emergencyDetail');
    if (!root) return;
    root.scrollIntoView({
      block:'start',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  function selectAdjacentLesson(delta) {
    const sequence = visibleLessonSequence();
    const index = sequence.findIndex(lesson => lesson._id === state.selectedLessonId);
    const lesson = sequence[index + delta];
    if (!lesson) return;

    state.selectedLessonId = lesson._id;
    if (lesson.section?._id) state.selectedSectionId = lesson.section._id;
    renderChapters();
    renderLessons();
    renderDetail();
    renderReaderNavigation();
    syncUrl();
    requestAnimationFrame(scrollReaderToTop);
  }

  function clearSearch({ focus = true } = {}) {
    state.term = '';
    const input = $('#emergencySearch');
    if (input) input.value = '';
    renderChapters();
    renderLessons();
    renderDetail();
    renderReaderNavigation();
    syncUrl();
    if (focus) input?.focus();
  }

  function reviewMeta(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'verified') {
      return {
        className:'is-verified',
        label:'I verifikuar',
        detail:'Përmbajtja është shënuar si e verifikuar në Sanity.',
      };
    }
    if (value === 'review') {
      return {
        className:'is-review',
        label:'Në rishikim',
        detail:'Përmbajtja është në proces rishikimi klinik.',
      };
    }
    if (value === 'source-imported') {
      return {
        className:'is-source',
        label:'Material burimor',
        detail:'Importuar nga burimi referues; ende jo i verifikuar klinikisht në DRx.',
      };
    }
    return {
      className:'',
      label:'Status i papërcaktuar',
      detail:'Statusi i rishikimit nuk është përcaktuar në Sanity.',
    };
  }

  function syncUrl() {
    try {
      const url = new URL(window.location.href);
      const section = currentSection();
      const lesson = currentLesson();

      if (section?.sectionNumber) url.searchParams.set('chapter', String(section.sectionNumber));
      else url.searchParams.delete('chapter');

      if (lesson?.slug) url.searchParams.set('lesson', lesson.slug);
      else url.searchParams.delete('lesson');

      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  function restoreUrl() {
    try {
      const url = new URL(window.location.href);
      const chapter = Number(url.searchParams.get('chapter'));
      const lessonSlug = url.searchParams.get('lesson') || '';
      const section = state.sections.find(item => Number(item.sectionNumber) === chapter);
      const lesson = state.lessons.find(item => item.slug === lessonSlug);

      if (section) state.selectedSectionId = section._id;
      if (lesson) {
        state.selectedLessonId = lesson._id;
        if (lesson.section?._id) state.selectedSectionId = lesson.section._id;
      }
    } catch {}
  }

  function applySearch() {
    const term = normalize(state.term);
    if (!term) {
      state.visibleSections = [...state.sections];
      return;
    }

    state.visibleSections = state.sections.filter(section => {
      if (normalize([section.title, section.sourceTitleEn].join(' ')).includes(term)) return true;
      return sectionLessons(section._id).some(lesson => haystackForLesson(lesson).includes(term));
    });
  }

  function renderChapters() {
    const select = $('#emergencyChapterSelect');
    const status = $('#chapterStatus');
    if (!select || !status) return;

    applySearch();
    if (!state.visibleSections.some(section => section._id === state.selectedSectionId)) {
      state.selectedSectionId = state.visibleSections[0]?._id || '';
      state.selectedLessonId = sectionLessons(state.selectedSectionId)[0]?._id || '';
    }

    select.innerHTML = state.visibleSections.map(section => {
      const count = sectionLessons(section._id).length;
      const number = String(section.sectionNumber || section.order || '').padStart(2, '0');
      return `<option value="${esc(section._id)}">Kapitulli ${number} — ${esc(section.title)} · ${count} mësime</option>`;
    }).join('') || '<option value="">Asnjë kapitull</option>';
    select.value = state.selectedSectionId;
    select.disabled = state.visibleSections.length === 0;
    status.textContent = `${state.visibleSections.length} nga ${state.sections.length} kapituj`;
  }

  function renderLessons() {
    const select = $('#emergencyLessonSelect');
    const status = $('#lessonStatus');
    const section = currentSection();
    if (!select || !status) return;

    if (!section) {
      select.innerHTML = '<option value="">Zgjidh kapitullin</option>';
      select.disabled = true;
      status.textContent = 'Zgjidh një kapitull';
      return;
    }

    const lessons = filteredLessonsForSection(section._id);

    if (!lessons.some(lesson => lesson._id === state.selectedLessonId)) {
      state.selectedLessonId = lessons[0]?._id || '';
    }

    select.innerHTML = lessons.map(lesson => {
      const number = String(lesson.chapterNumber || lesson.orderInSection || '').padStart(2, '0');
      return `<option value="${esc(lesson._id)}">Mësimi ${number} — ${esc(lesson.title)}</option>`;
    }).join('') || '<option value="">Asnjë mësim në këtë kërkim</option>';
    select.value = state.selectedLessonId;
    select.disabled = lessons.length === 0;
    status.textContent = `${lessons.length} mësime në ${section.title}`;
  }

  function figureByNumber(lesson, number) {
    return (lesson.figures || []).find(item => String(item.figureNumber) === String(number));
  }

  function tableByNumber(lesson, number) {
    return (lesson.translatedTables || []).find(item => String(item.tableNumber) === String(number));
  }

  function tableMarkup(table) {
    if (!table) return '';
    const columns = table.columnsSq || [];
    const rows = table.rows || [];
    const head = columns.length
      ? '<thead><tr>' + columns.map(col => '<th>' + esc(col) + '</th>').join('') + '</tr></thead>'
      : '';
    const body = '<tbody>' + rows.map(row =>
      '<tr>' + (row.cells || []).map(cell => '<td>' + esc(cell) + '</td>').join('') + '</tr>'
    ).join('') + '</tbody>';
    return '<section class="ec-table-card" aria-label="' + esc(table.titleSq || ('Tabela ' + table.tableNumber)) + '">' +
      '<div class="ec-table-head"><div>' +
        '<span class="ec-table-kicker">Tabela ' + esc(table.tableNumber) + '</span>' +
        '<h4>' + esc(table.titleSq || '') + '</h4>' +
        (table.sourceTitleEn ? '<small>' + esc(table.sourceTitleEn) + '</small>' : '') +
      '</div>' +
      (table.sourcePdfPage ? '<span class="ec-table-page">PDF f. ' + esc(table.sourcePdfPage) + '</span>' : '') +
      '</div>' +
      (table.descriptionSq ? '<p class="ec-table-description">' + esc(table.descriptionSq) + '</p>' : '') +
      '<div class="ec-table-scroll"><table class="ec-clinical-table">' + head + body + '</table></div>' +
      (table.clinicalHighlight ? '<div class="ec-table-highlight"><strong>Highlight:</strong> ' + esc(String(table.clinicalHighlight).replace(/^HIGHLIGHT\\s*[—:-]?\\s*/i, '')) + '</div>' : '') +
      (table.sourceNote ? '<p class="ec-table-note">' + esc(table.sourceNote) + '</p>' : '') +
    '</section>';
  }

  function figureSrc(figure) {
    return figure?.image?.asset?.url || figure?.externalUrl || figure?.imageDataUrl || ((figure?.imageDataChunks || []).length ? figure.imageDataChunks.join('') : '') || '';
  }

  function figureMarkup(figure) {
    if (!figure) return '';
    const src = figureSrc(figure);
    const label = figure.visualType === 'table' ? 'Tabela' : 'Figura';
    if (!src) {
      return `<span class="ec-figure-chip">${label} ${esc(figure.figureNumber)}${figure.sourcePdfPage ? ` · PDF f. ${esc(figure.sourcePdfPage)}` : ''}</span>`;
    }
    return `
      <figure class="ec-figure-card">
        <img src="${esc(src)}" alt="${esc(figure.alt || figure.caption || `${label} ${figure.figureNumber}`)}" loading="lazy" decoding="async">
        <figcaption><strong>${label} ${esc(figure.figureNumber)}.</strong> ${esc(figure.caption || '')}</figcaption>
      </figure>
    `;
  }

  function renderLessonSection(lesson, section, index) {
    const rx = [...(section.rx || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
    const linkedFigures = (section.figureNumbers || []).map(number => figureByNumber(lesson, number)).filter(Boolean);
    const linkedTables = (section.tableNumbers || []).map(number => tableByNumber(lesson, number)).filter(Boolean);
    return `
      <section class="ec-section">
        <div class="ec-section-number">${String(index + 1).padStart(2, '0')}</div>
        <h3>${esc(section.title)}</h3>
        ${section.sourceHeadingEn ? `<div class="ec-source-title">${esc(section.sourceHeadingEn)}</div>` : ''}
        ${section.explanation ? `<p class="ec-section-explanation">${esc(section.explanation)}</p>` : ''}

        ${rx.length ? `
          <ol class="ec-rx-list">
            ${rx.map(item => `
              <li class="ec-rx">
                <span class="ec-rx-badge">Rx.</span>
                <div>
                  <p>${esc(String(item.text || '').replace(/^Rx\.\s*/i, ''))}</p>
                  ${item.note ? `<small>${esc(item.note)}</small>` : ''}
                </div>
              </li>
            `).join('')}
          </ol>
        ` : ''}

        ${section.clinicalPearl ? `
          <div class="ec-pearl"><strong>Mbaje mend:</strong> ${esc(section.clinicalPearl)}</div>
        ` : ''}

        ${linkedTables.length ? linkedTables.map(tableMarkup).join('') : ''}

        ${linkedFigures.length ? `
          <div class="ec-figure-strip">
            ${linkedFigures.filter(f => !figureSrc(f)).map(figureMarkup).join('')}
          </div>
          ${linkedFigures.filter(f => figureSrc(f)).map(figureMarkup).join('')}
        ` : ''}
      </section>
    `;
  }

  function renderDetail() {
    const root = $('#emergencyDetail');
    const lesson = currentLesson();

    if (!root) return;

    if (!lesson) {
      const section = currentSection();
      const term = String(state.term || '').trim();
      const noSearchResults = Boolean(term) && visibleLessonSequence().length === 0;

      root.innerHTML = noSearchResults
        ? `
          <div class="ec-detail-placeholder">
            <div>
              <strong>Asnjë mësim nuk u gjet.</strong>
              <span>Nuk ka përputhje për “${esc(term)}”. Provo një term tjetër ose pastro kërkimin.</span>
              <button class="ec-retry ec-empty-clear" type="button">Pastro kërkimin</button>
            </div>
          </div>
        `
        : `
          <div class="ec-detail-placeholder">
            <div>
              <strong>${section ? esc(section.title) : 'Zgjidh një kapitull.'}</strong>
              <span>${section ? 'Zgjidh një mësim nga fusha “Mësimi”.' : 'Pastaj zgjidh mësimin që dëshiron të hapësh.'}</span>
            </div>
          </div>
        `;

      root.querySelector('.ec-empty-clear')?.addEventListener('click', () => clearSearch());
      return;
    }

    const section = lesson.section || currentSection();
    const sections = [...(lesson.lessonSections || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
    const subtopics = [...(lesson.subtopics || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
    const abbreviations = [...(lesson.abbreviations || [])].sort((a, b) => (Number(a.footnoteNumber) || 999) - (Number(b.footnoteNumber) || 999));
    const figures = [...(lesson.figures || [])];
    const review = reviewMeta(lesson.reviewStatus);

    root.innerHTML = `
      <div class="ec-detail-inner">
        <div class="ec-breadcrumb">
          <span>Kapitulli ${String(section?.sectionNumber || lesson.sourceSectionNumber || '').padStart(2, '0')}</span>
          <span>›</span>
          <span>Mësimi ${String(lesson.chapterNumber || lesson.orderInSection || '').padStart(2, '0')}</span>
        </div>

        <header class="ec-detail-title">
          <div class="ec-detail-title-row">
            <h2>${esc(lesson.title)}</h2>
            <span class="ec-review-banner ec-review-badge ${review.className}" role="note" aria-label="${esc(review.detail)}">
              <span class="ec-review-dot" aria-hidden="true"></span>
              <span class="ec-review-copy"><strong>${esc(review.label)}</strong></span>
            </span>
          </div>
          ${lesson.sourceTitleEn ? `<p class="ec-source-title">${esc(lesson.sourceTitleEn)}</p>` : ''}
        </header>

        ${lesson.quickSummary ? `
          <div class="ec-quick-summary">
            <span>Në 20 sekonda</span>
            <p>${esc(lesson.quickSummary)}</p>
          </div>
        ` : ''}

        ${sections.length
          ? sections.map((item, index) => renderLessonSection(lesson, item, index)).join('')
          : subtopics.length
            ? `
              <section class="ec-outline">
                <div class="ec-outline-head">
                  <span>Struktura nga PDF</span>
                  <h3>Nëntitujt e këtij mësimi</h3>
                  <p>Këta janë nëntitujt e kapitullit burimor. Përkthimi i thjeshtuar klinik do të plotësohet brenda secilit nëntitull.</p>
                </div>
                <ol class="ec-outline-list">
                  ${subtopics.map((item, index) => `
                    <li>
                      <span>${String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>${esc(item.title)}</strong>
                        ${item.sourceTitleEn ? `<small>${esc(item.sourceTitleEn)}</small>` : ''}
                      </div>
                    </li>
                  `).join('')}
                </ol>
              </section>
            `
            : `<div class="ec-quick-summary"><span>Përmbajtja</span><p>Ky mësim është krijuar në strukturën e re. Përmbajtja klinike do të plotësohet nga kapitulli përkatës i Tintinalli-t.</p></div>`}

        ${figures.length && !sections.length ? `
          <section class="ec-footnotes ec-lesson-figures">
            <h3>Figurat e kapitullit</h3>
            <div class="ec-figure-overview">
              ${figures.map(figureMarkup).join('')}
            </div>
          </section>
        ` : ''}

        ${abbreviations.length ? `
          <section class="ec-footnotes">
            <h3>Fusnota · shkurtesat</h3>
            <div class="ec-abbreviation-grid">
              ${abbreviations.map(item => `
                <div class="ec-abbreviation">
                  <b>${esc(item.footnoteNumber)}. ${esc(item.abbreviation)}</b>
                  ${item.fullTermEn ? ` <span>— ${esc(item.fullTermEn)}</span>` : ''}
                  ${item.explanationSq ? `<p>${esc(item.explanationSq)}</p>` : ''}
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <div class="ec-source-meta">
          ${lesson.sourceBook ? `<span>${esc(lesson.sourceBook)}</span>` : ''}
          ${lesson.sourceEdition ? `<span>${esc(lesson.sourceEdition)}</span>` : ''}
          ${lesson.sourcePdfStartPage ? `<span>PDF f. ${esc(lesson.sourcePdfStartPage)}–${esc(lesson.sourcePdfEndPage || lesson.sourcePdfStartPage)}</span>` : ''}
          ${lesson.reviewStatus ? `<span>Rishikimi: ${esc(review.label)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function selectSection(id, {preserveLesson = false} = {}) {
    if (!id) return;
    state.selectedSectionId = id;
    if (!preserveLesson || currentLesson()?.section?._id !== id) {
      state.selectedLessonId = filteredLessonsForSection(id)[0]?._id || '';
    }
    renderChapters();
    renderLessons();
    renderDetail();
    renderReaderNavigation();
    syncUrl();
  }

  function selectLesson(id) {
    const lesson = state.lessons.find(item => item._id === id);
    if (!lesson) return;
    state.selectedLessonId = id;
    if (lesson.section?._id) state.selectedSectionId = lesson.section._id;
    renderChapters();
    renderLessons();
    renderDetail();
    renderReaderNavigation();
    syncUrl();
  }

  function handleSearch(value) {
    state.term = value || '';

    if (state.term) {
      applySearch();
      if (!state.visibleSections.some(section => section._id === state.selectedSectionId)) {
        const nextSection = state.visibleSections[0];
        state.selectedSectionId = nextSection?._id || '';
        const nextLesson = nextSection
          ? sectionLessons(nextSection._id).find(lesson => haystackForLesson(lesson).includes(normalize(state.term)))
          : null;
        state.selectedLessonId = nextLesson?._id || sectionLessons(nextSection?._id || '')[0]?._id || '';
      }
    }

    renderChapters();
    renderLessons();
    renderDetail();
    renderReaderNavigation();
    syncUrl();
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    bindShell();
    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);
      await ensureSanity();

      const payload = await window.MedIndexSanity.query(QUERY);
      state.sections = Array.isArray(payload?.sections) ? payload.sections : [];
      state.lessons = Array.isArray(payload?.lessons) ? payload.lessons : [];

      $('#chapterTotal').textContent = String(state.sections.length || 0);
      $('#lessonTotal').textContent = String(state.lessons.length || 0);
      if ($('#syncText')) $('#syncText').textContent = 'Sanity';

      state.visibleSections = [...state.sections];
      state.selectedSectionId = state.sections[0]?._id || '';
      state.selectedLessonId = sectionLessons(state.selectedSectionId)[0]?._id || '';
      restoreUrl();

      $('#emergencySearch')?.addEventListener('input', event => handleSearch(event.target.value));
      $('#emergencySearchClear')?.addEventListener('click', () => clearSearch());
      $('#emergencyChapterSelect')?.addEventListener('change', event => selectSection(event.target.value));
      $('#emergencyLessonSelect')?.addEventListener('change', event => selectLesson(event.target.value));
      $('#previousLessonButton')?.addEventListener('click', () => selectAdjacentLesson(-1));
      $('#nextLessonButton')?.addEventListener('click', () => selectAdjacentLesson(1));

      renderChapters();
      renderLessons();
      renderDetail();
      renderReaderNavigation();
      syncUrl();
      $('#appShell')?.setAttribute('aria-busy','false');
    } catch (error) {
      console.error('[Urgjencat v2]', error);
      if ($('#chapterStatus')) $('#chapterStatus').textContent = 'Nuk u ngarkua';
      if ($('#lessonStatus')) $('#lessonStatus').textContent = 'Nuk u ngarkua';
      if ($('#emergencyChapterSelect')) $('#emergencyChapterSelect').innerHTML = '<option>Gabim në ngarkim</option>';
      if ($('#emergencyLessonSelect')) $('#emergencyLessonSelect').innerHTML = '<option>Gabim në ngarkim</option>';
      if ($('#emergencyDetail')) $('#emergencyDetail').innerHTML = '<div class="ec-detail-placeholder"><div><strong>Urgjencat nuk u ngarkuan.</strong><span>Provo përsëri pa humbur sesionin.</span><button class="ec-retry" type="button">Provo përsëri</button></div></div>';
      $('#emergencyDetail')?.querySelector('.ec-retry')?.addEventListener('click', () => window.location.reload());
      renderReaderNavigation();
      $('#appShell')?.setAttribute('aria-busy','false');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else {
    init();
  }
})();