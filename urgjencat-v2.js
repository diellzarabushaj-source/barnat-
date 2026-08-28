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
  const lessonSearchIndex = new Map();
  let searchTimer = 0;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  const escapeRegExp = value => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let abbreviationTooltip = null;
  let activeAbbreviationButton = null;
  let abbreviationCloseTimer = 0;
  let figureLightbox = null;
  let figureLightboxReturnFocus = null;
  let figureLightboxState = null;

  function mobilePopoverMode() {
    return Boolean(window.matchMedia?.('(hover: none), (pointer: coarse)').matches);
  }

  function abbreviationByKey(lesson, key) {
    return (lesson?.abbreviations || []).find(item => String(item._key) === String(key)) || null;
  }

  function inlineClinicalText(lesson, value) {
    const text = String(value ?? '');
    const items = [...(lesson?.abbreviations || [])]
      .filter(item => item?.abbreviation && text.includes(item.abbreviation))
      .sort((a, b) => String(b.abbreviation).length - String(a.abbreviation).length);
    if (!items.length) return esc(text);
    const unique = [];
    const seen = new Set();
    for (const item of items) {
      const term = String(item.abbreviation);
      if (seen.has(term)) continue;
      seen.add(term); unique.push(item);
    }
    const byTerm = new Map(unique.map(item => [String(item.abbreviation), item]));
    const pattern = new RegExp(unique.map(item => escapeRegExp(item.abbreviation)).join('|'), 'g');
    let html = ''; let cursor = 0;
    const isWordChar = char => Boolean(char && /[\p{L}\p{N}]/u.test(char));
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      const term = match[0];
      const item = byTerm.get(term);
      const before = text[index - 1] || '';
      const after = text[index + term.length] || '';
      const partialWord = (isWordChar(term[0]) && isWordChar(before))
        || (isWordChar(term[term.length - 1]) && isWordChar(after));
      html += esc(text.slice(cursor, index));
      if (item && !partialWord) {
        const number = Number(item.footnoteNumber);
        html += '<button type="button" class="ec-abbr-token" data-abbr-key="' + esc(item._key) + '" aria-haspopup="true" aria-controls="ecAbbrTooltip" aria-expanded="false" aria-label="Shpjego ' + esc(term) + '">' + esc(term) + (Number.isFinite(number) ? '<sup aria-hidden="true">' + esc(number) + '</sup>' : '') + '</button>';
      } else html += esc(term);
      cursor = index + term.length;
    }
    html += esc(text.slice(cursor));
    return html;
  }

  function ensureAbbreviationTooltip() {
    if (abbreviationTooltip?.isConnected) return abbreviationTooltip;
    const tooltip = document.createElement('div');
    tooltip.className = 'ec-abbr-tooltip';
    tooltip.id = 'ecAbbrTooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    abbreviationTooltip = tooltip;
    return tooltip;
  }

  function positionAbbreviationTooltip(button, tooltip) {
    const coarse = mobilePopoverMode();
    const popover = coarse || tooltip.dataset.popover === '1';
    tooltip.classList.toggle('is-popover', popover);
    tooltip.setAttribute('role', popover ? 'dialog' : 'tooltip');
    if (coarse) {
      tooltip.style.width = '';
      tooltip.style.left = '12px';
      tooltip.style.right = '12px';
      tooltip.style.top = 'auto';
      tooltip.style.bottom = '12px';
      tooltip.classList.remove('is-above');
      return;
    }

    tooltip.style.right = '';
    tooltip.style.bottom = '';
    const rect = button.getBoundingClientRect();
    const gap = 8;
    const width = Math.min(320, Math.max(230, tooltip.offsetWidth || 280));
    let left = rect.left + (rect.width / 2) - (width / 2);
    left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
    tooltip.style.width = width + 'px';
    tooltip.style.left = left + 'px';
    const height = tooltip.offsetHeight || 110;
    const placeAbove = (window.innerHeight - rect.bottom) < height + 24 && rect.top > height + 24;
    tooltip.classList.toggle('is-above', placeAbove);
    tooltip.style.top = (placeAbove ? Math.max(10, rect.top - height - gap) : Math.min(window.innerHeight - height - 10, rect.bottom + gap)) + 'px';
  }

  function openAbbreviationTooltip(button) {
    window.clearTimeout(abbreviationCloseTimer);
    const item = abbreviationByKey(currentLesson(), button?.dataset?.abbrKey);
    if (!item || !button) return;
    if (activeAbbreviationButton && activeAbbreviationButton !== button) {
      activeAbbreviationButton.setAttribute('aria-expanded', 'false');
      activeAbbreviationButton.classList.remove('is-open');
    }
    const tooltip = ensureAbbreviationTooltip();
    const longExplanation = clean(item.explanationSq).length > 140 || clean(item.fullTermEn).length > 52;
    tooltip.dataset.popover = longExplanation ? '1' : '0';
    tooltip.innerHTML = '<button type="button" class="ec-abbr-tooltip-close" aria-label="Mbyll shpjegimin">×</button><div class="ec-abbr-tooltip-head"><strong>' + esc(item.abbreviation) + '</strong>' + (item.fullTermEn ? '<span>' + esc(item.fullTermEn) + '</span>' : '') + '</div>' + (item.explanationSq ? '<p>' + esc(item.explanationSq) + '</p>' : '');
    tooltip.querySelector('.ec-abbr-tooltip-close')?.addEventListener('click', () => closeAbbreviationTooltip());
    tooltip.hidden = false;
    activeAbbreviationButton = button;
    button.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => positionAbbreviationTooltip(button, tooltip));
  }

  function closeAbbreviationTooltip({ delay = 0 } = {}) {
    window.clearTimeout(abbreviationCloseTimer);
    const close = () => {
      if (activeAbbreviationButton) {
        activeAbbreviationButton.setAttribute('aria-expanded', 'false');
        activeAbbreviationButton.classList.remove('is-open');
      }
      activeAbbreviationButton = null;
      if (abbreviationTooltip) abbreviationTooltip.hidden = true;
    };
    if (delay) abbreviationCloseTimer = window.setTimeout(close, delay); else close();
  }

  function bindInlineAbbreviations(root) {
    (root?.querySelectorAll?.('.ec-abbr-token') || []).forEach(button => {
      button.addEventListener('mouseenter', () => openAbbreviationTooltip(button));
      button.addEventListener('mouseleave', () => closeAbbreviationTooltip({ delay:120 }));
      button.addEventListener('focus', () => openAbbreviationTooltip(button));
      button.addEventListener('blur', () => closeAbbreviationTooltip({ delay:100 }));
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        if (activeAbbreviationButton === button && !abbreviationTooltip?.hidden) closeAbbreviationTooltip();
        else openAbbreviationTooltip(button);
      });
    });
    const tooltip = ensureAbbreviationTooltip();
    if (tooltip.dataset.bound !== '1') {
      tooltip.dataset.bound = '1';
      tooltip.addEventListener('mouseenter', () => window.clearTimeout(abbreviationCloseTimer));
      tooltip.addEventListener('mouseleave', () => closeAbbreviationTooltip({ delay:100 }));
    }
  }

  document.addEventListener('pointerdown', event => {
    if (!activeAbbreviationButton) return;
    if (activeAbbreviationButton.contains(event.target) || abbreviationTooltip?.contains(event.target)) return;
    closeAbbreviationTooltip();
  });
  window.addEventListener('resize', () => {
    if (activeAbbreviationButton && abbreviationTooltip && !abbreviationTooltip.hidden) positionAbbreviationTooltip(activeAbbreviationButton, abbreviationTooltip);
  });
  window.addEventListener('scroll', () => {
    if (activeAbbreviationButton && abbreviationTooltip && !abbreviationTooltip.hidden) positionAbbreviationTooltip(activeAbbreviationButton, abbreviationTooltip);
  }, true);

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
        if (figureLightbox && !figureLightbox.hidden) {
          closeFigureLightbox();
          return;
        }
        if (activeAbbreviationButton) {
          closeAbbreviationTooltip();
          return;
        }
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
    const id = lesson?._id || '';
    if (id && lessonSearchIndex.has(id)) return lessonSearchIndex.get(id);

    const value = normalize([
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
    if (id) lessonSearchIndex.set(id, value);
    return value;
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
    window.clearTimeout(searchTimer);
    searchTimer = 0;
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
      const count = filteredLessonsForSection(section._id).length;
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

  function figuresForLesson(lesson) {
    if (!lesson?._id) return lesson?.figures || [];
    return figureCache.get(lesson._id) || lesson.figures || [];
  }

  async function ensureLessonFigures(lesson) {
    const id = lesson?._id;
    if (!id || !(lesson.figures || []).length) return [];
    if (figureCache.has(id)) return figureCache.get(id);
    if (figureRequests.has(id)) return figureRequests.get(id);

    const request = window.MedIndexSanity
      .query(FIGURE_DETAIL_QUERY, { id }, { timeout:15000, cache:'no-cache' })
      .then(payload => {
        const figures = Array.isArray(payload?.figures) ? payload.figures : [];
        figureCache.set(id, figures);
        return figures;
      })
      .catch(error => {
        console.warn('[Urgjencat v2] Figura nuk u ngarkua:', error);
        const fallback = lesson.figures || [];
        figureCache.set(id, fallback);
        return fallback;
      })
      .finally(() => {
        figureRequests.delete(id);
        if (state.selectedLessonId === id) renderDetail();
      });

    figureRequests.set(id, request);
    return request;
  }

  function figureByNumber(lesson, number) {
    return figuresForLesson(lesson).find(item => String(item.figureNumber) === String(number));
  }

  function tableByNumber(lesson, number) {
    return (lesson.translatedTables || []).find(item => String(item.tableNumber) === String(number));
  }

  function tableMarkup(lesson, table) {
    if (!table) return '';
    const columns = table.columnsSq || [];
    const rows = table.rows || [];
    const head = columns.length
      ? '<thead><tr>' + columns.map(col => '<th>' + inlineClinicalText(lesson, col) + '</th>').join('') + '</tr></thead>'
      : '';
    const body = '<tbody>' + rows.map(row =>
      '<tr>' + (row.cells || []).map(cell => '<td>' + inlineClinicalText(lesson, cell) + '</td>').join('') + '</tr>'
    ).join('') + '</tbody>';
    return '<section class="ec-table-card" aria-label="' + esc(table.titleSq || ('Tabela ' + table.tableNumber)) + '">' +
      '<div class="ec-table-head"><div>' +
        '<span class="ec-table-kicker">Tabela ' + esc(table.tableNumber) + '</span>' +
        '<h4>' + inlineClinicalText(lesson, table.titleSq || '') + '</h4>' +
        (table.sourceTitleEn ? '<small>' + inlineClinicalText(lesson, table.sourceTitleEn) + '</small>' : '') +
      '</div>' +
      (table.sourcePdfPage ? '<span class="ec-table-page">PDF f. ' + esc(table.sourcePdfPage) + '</span>' : '') +
      '</div>' +
      (table.descriptionSq ? '<p class="ec-table-description">' + inlineClinicalText(lesson, table.descriptionSq) + '</p>' : '') +
      '<div class="ec-table-scroll"><table class="ec-clinical-table">' + head + body + '</table></div>' +
      (table.clinicalHighlight ? '<div class="ec-table-highlight"><strong>Highlight:</strong> ' + inlineClinicalText(lesson, String(table.clinicalHighlight).replace(/^HIGHLIGHT\\s*[—:-]?\\s*/i, '')) + '</div>' : '') +
      (table.sourceNote ? '<p class="ec-table-note">' + inlineClinicalText(lesson, table.sourceNote) + '</p>' : '') +
    '</section>';
  }

  function normalizeFigureExternalUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    const repoRawPrefix = 'https://raw.githubusercontent.com/diellzarabushaj-source/barnat-/main/';
    if (url.startsWith(repoRawPrefix)) return '/' + url.slice(repoRawPrefix.length);
    return url;
  }

  function figureSrcCandidates(figure) {
    if (!figure) return [];
    const candidates = [];
    const add = value => {
      const src = String(value || '').trim();
      if (src && !candidates.includes(src)) candidates.push(src);
    };

    add(figure?.image?.asset?.url);

    const external = normalizeFigureExternalUrl(figure?.externalUrl);
    if (external.startsWith('/')) add(external);

    add(figure?.imageDataUrl);

    if ((figure?.imageDataChunks || []).length) {
      add(figure.imageDataChunks.join(''));
    }

    add(external);
    return candidates;
  }

  function figureSrc(figure) {
    return figureSrcCandidates(figure)[0] || '';
  }

  function ensureFigureLightbox() {
    if (figureLightbox?.isConnected) return figureLightbox;
    const overlay = document.createElement('div');
    overlay.className = 'ec-figure-lightbox';
    overlay.id = 'ecFigureLightbox';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Zmadhimi i figurës');
    overlay.innerHTML = `
      <div class="ec-figure-lightbox-card">
        <button type="button" class="ec-figure-lightbox-close" aria-label="Mbyll figurën">×</button>
        <div class="ec-figure-lightbox-stage">
          <img class="ec-figure-lightbox-image" alt="">
        </div>
        <div class="ec-figure-lightbox-caption"></div>
      </div>
    `;
    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) closeFigureLightbox();
    });
    overlay.querySelector('.ec-figure-lightbox-close')?.addEventListener('click', closeFigureLightbox);
    overlay.querySelector('.ec-figure-lightbox-image')?.addEventListener('error', () => {
      if (!figureLightboxState) return;
      figureLightboxState.index += 1;
      const next = figureLightboxState.candidates[figureLightboxState.index];
      if (next) overlay.querySelector('.ec-figure-lightbox-image').src = next;
    });
    document.body.appendChild(overlay);
    figureLightbox = overlay;
    return overlay;
  }

  function closeFigureLightbox() {
    if (!figureLightbox || figureLightbox.hidden) return;
    figureLightbox.hidden = true;
    figureLightboxState = null;
    document.body.classList.remove('ec-modal-open');
    const returnFocus = figureLightboxReturnFocus;
    figureLightboxReturnFocus = null;
    returnFocus?.focus?.({ preventScroll:true });
  }

  function openFigureLightbox(lesson, key, trigger) {
    const figure = figuresForLesson(lesson).find(item =>
      String(item?._key || item?.figureNumber || '') === String(key)
    );
    if (!figure) return;
    const candidates = figureSrcCandidates(figure);
    if (!candidates.length) return;

    closeAbbreviationTooltip();
    const overlay = ensureFigureLightbox();
    const image = overlay.querySelector('.ec-figure-lightbox-image');
    const caption = overlay.querySelector('.ec-figure-lightbox-caption');
    const label = figure.visualType === 'table' ? 'Tabela' : 'Figura';

    figureLightboxState = { candidates, index:0 };
    figureLightboxReturnFocus = trigger || document.activeElement;
    image.alt = figure.alt || figure.caption || `${label} ${figure.figureNumber || ''}`;
    image.src = candidates[0];
    caption.innerHTML =
      '<div><strong>' + esc(label + ' ' + (figure.figureNumber || '')) + '</strong>' +
      (figure.sourcePdfPage ? '<span>PDF f. ' + esc(figure.sourcePdfPage) + '</span>' : '') +
      '</div>' +
      (figure.caption ? '<p>' + inlineClinicalText(lesson, figure.caption) + '</p>' : '');

    bindInlineAbbreviations(caption);
    overlay.hidden = false;
    document.body.classList.add('ec-modal-open');
    requestAnimationFrame(() => overlay.querySelector('.ec-figure-lightbox-close')?.focus({ preventScroll:true }));
  }

  function bindFigureLightbox(root, lesson) {
    root?.querySelectorAll?.('[data-figure-open]')?.forEach(button => {
      button.addEventListener('click', () => openFigureLightbox(lesson, button.dataset.figureOpen, button));
    });
  }

  function figureMarkup(lesson, figure) {
    if (!figure) return '';
    const src = figureSrc(figure);
    const label = figure.visualType === 'table' ? 'Tabela' : 'Figura';
    if (!src) {
      return `<span class="ec-figure-chip">${label} ${esc(figure.figureNumber)}${figure.sourcePdfPage ? ` · PDF f. ${esc(figure.sourcePdfPage)}` : ''}</span>`;
    }
    const key = figure._key || figure.figureNumber || '';
    return `
      <figure class="ec-figure-card" data-figure-card="${esc(key)}">
        <button type="button" class="ec-figure-zoom" data-figure-open="${esc(key)}" aria-label="Zmadho ${esc(label)} ${esc(figure.figureNumber || '')}">
          <img
            src="${esc(src)}"
            data-figure-key="${esc(key)}"
            data-figure-src-index="0"
            alt="${esc(figure.alt || figure.caption || `${label} ${figure.figureNumber}`)}"
            loading="lazy"
            decoding="async"
          >
          <span class="ec-figure-zoom-hint" aria-hidden="true">Zmadho</span>
        </button>
        <figcaption>
          <div class="ec-figure-caption-head"><strong>${label} ${esc(figure.figureNumber)}.</strong>${figure.sourcePdfPage ? `<span>PDF f. ${esc(figure.sourcePdfPage)}</span>` : ''}</div>
          ${figure.caption ? `<p>${inlineClinicalText(lesson, figure.caption)}</p>` : ''}
        </figcaption>
      </figure>
    `;
  }

  function bindFigureFallbacks(root, lesson) {
    if (!root || !lesson) return;
    root.querySelectorAll('img[data-figure-key]').forEach(image => {
      image.addEventListener('error', () => {
        const key = image.dataset.figureKey;
        const figure = figuresForLesson(lesson).find(item =>
          String(item?._key || item?.figureNumber || '') === String(key)
        );
        const candidates = figureSrcCandidates(figure);
        const currentIndex = Number(image.dataset.figureSrcIndex || 0);
        const nextIndex = currentIndex + 1;

        if (nextIndex < candidates.length) {
          image.dataset.figureSrcIndex = String(nextIndex);
          image.src = candidates[nextIndex];
          return;
        }

        const card = image.closest('.ec-figure-card');
        const zoom = image.closest('.ec-figure-zoom');
        if (zoom) zoom.hidden = true; else image.hidden = true;
        if (card && !card.querySelector('.ec-figure-error')) {
          const fallback = document.createElement('div');
          fallback.className = 'ec-figure-error ec-figure-chip';
          fallback.textContent = `Figura ${figure?.figureNumber || ''} nuk u ngarkua. Burimi është ruajtur dhe mund të riprovohet pas rifreskimit.`;
          card.insertBefore(fallback, card.firstChild);
        }
        console.warn('[Urgjencat v2] Të gjitha burimet e figurës dështuan:', {
          lessonId: lesson._id,
          figureNumber: figure?.figureNumber,
          candidates: candidates.map(src => src.startsWith('data:') ? '[embedded-image]' : src),
        });
      });
    });
  }

  function renderLessonSection(lesson, section, index) {
    const rx = [...(section.rx || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
    const linkedFigures = (section.figureNumbers || []).map(number => figureByNumber(lesson, number)).filter(Boolean);
    const linkedTables = (section.tableNumbers || []).map(number => tableByNumber(lesson, number)).filter(Boolean);
    const anchorId = `ec-section-${String(index + 1).padStart(2, '0')}`;
    return `
      <section class="ec-section" id="${anchorId}">
        <div class="ec-section-number">${String(index + 1).padStart(2, '0')}</div>
        <h3>${esc(section.title)}</h3>
        ${section.sourceHeadingEn ? `<div class="ec-source-title">${inlineClinicalText(lesson, section.sourceHeadingEn)}</div>` : ''}
        ${section.explanation ? `<p class="ec-section-explanation">${inlineClinicalText(lesson, section.explanation)}</p>` : ''}

        ${rx.length ? `
          <ol class="ec-rx-list">
            ${rx.map(item => `
              <li class="ec-rx">
                <span class="ec-rx-badge">Rx.</span>
                <div>
                  <p>${inlineClinicalText(lesson, String(item.text || '').replace(/^Rx\.\s*/i, ''))}</p>
                  ${item.note ? `<small>${inlineClinicalText(lesson, item.note)}</small>` : ''}
                </div>
              </li>
            `).join('')}
          </ol>
        ` : ''}

        ${section.clinicalPearl ? `
          <div class="ec-pearl"><strong>Mbaje mend:</strong> ${inlineClinicalText(lesson, section.clinicalPearl)}</div>
        ` : ''}

        ${linkedTables.length ? linkedTables.map(table => tableMarkup(lesson, table)).join('') : ''}

        ${linkedFigures.length ? `
          <div class="ec-figure-strip" data-section-figures="${esc(section._key || anchorId)}">
            ${linkedFigures.map(figure => figureMarkup(lesson, figure)).join('')}
          </div>
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
    const mediaPending = (lesson.figures || []).length > 0 && !figureCache.has(lesson._id);
    const sequence = visibleLessonSequence();
    const lessonIndex = sequence.findIndex(item => item._id === lesson._id);
    const previousLesson = lessonIndex > 0 ? sequence[lessonIndex - 1] : null;
    const nextLesson = lessonIndex >= 0 && lessonIndex < sequence.length - 1 ? sequence[lessonIndex + 1] : null;
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
          ${lesson.sourceTitleEn ? `<p class="ec-source-title">${inlineClinicalText(lesson, lesson.sourceTitleEn)}</p>` : ''}
        </header>

        ${lesson.quickSummary ? `
          <div class="ec-quick-summary">
            <span>Në 20 sekonda</span>
            <p>${inlineClinicalText(lesson, lesson.quickSummary)}</p>
          </div>
        ` : ''}

        ${mediaPending ? `
          <div class="ec-media-loading" role="status">
            <span class="ec-media-spinner" aria-hidden="true"></span>
            <span>Po ngarkohen figurat vetëm për këtë mësim…</span>
          </div>
        ` : ''}

        ${sections.length > 1 ? `
          <nav class="ec-section-index" aria-label="Përmbajtja e këtij mësimi">
            <div class="ec-section-index-head">
              <span>Në këtë mësim</span>
              <small>${sections.length} pjesë</small>
            </div>
            <div class="ec-section-index-list">
              ${sections.map((item, index) => `
                <button type="button" data-section-jump="ec-section-${String(index + 1).padStart(2, '0')}">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <strong>${esc(item.title)}</strong>
                </button>
              `).join('')}
            </div>
          </nav>
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

        <div class="ec-source-meta">
          ${lesson.sourceBook ? `<span>${esc(lesson.sourceBook)}</span>` : ''}
          ${lesson.sourceEdition ? `<span>${esc(lesson.sourceEdition)}</span>` : ''}
          ${lesson.sourcePdfStartPage ? `<span>PDF f. ${esc(lesson.sourcePdfStartPage)}–${esc(lesson.sourcePdfEndPage || lesson.sourcePdfStartPage)}</span>` : ''}
          ${lesson.reviewStatus ? `<span>Rishikimi: ${esc(review.label)}</span>` : ''}
        </div>

        ${previousLesson || nextLesson ? `
          <nav class="ec-document-pagination" aria-label="Navigimi mes mësimeve">
            ${previousLesson ? `
              <button type="button" class="ec-document-page ec-document-page-prev" data-lesson-jump="${esc(previousLesson._id)}">
                <span>← Mësimi i kaluar</span>
                <strong>${esc(previousLesson.title)}</strong>
              </button>
            ` : '<span></span>'}
            ${nextLesson ? `
              <button type="button" class="ec-document-page ec-document-page-next" data-lesson-jump="${esc(nextLesson._id)}">
                <span>Mësimi tjetër →</span>
                <strong>${esc(nextLesson.title)}</strong>
              </button>
            ` : '<span></span>'}
          </nav>
        ` : ''}
      </div>
    `;

    bindFigureFallbacks(root, lesson);
    bindFigureLightbox(root, lesson);
    bindInlineAbbreviations(root);

    if (sections.length) {
      const linked = new Set(sections.flatMap(item => item.figureNumbers || []).map(String));
      const unlinked = figuresForLesson(lesson).filter(item => item?.figureNumber && !linked.has(String(item.figureNumber)));
      if (unlinked.length) {
        console.warn('[Urgjencat v2] Figura pa nënseksion nuk renderohen në fund të mësimit:', unlinked.map(item => item.figureNumber));
      }
    }

    root.querySelectorAll('[data-section-jump]').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.sectionJump);
        target?.scrollIntoView({
          block:'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
    });

    root.querySelectorAll('[data-lesson-jump]').forEach(button => {
      button.addEventListener('click', () => {
        selectLesson(button.dataset.lessonJump);
        requestAnimationFrame(scrollReaderToTop);
      });
    });

    if (mediaPending && !figureRequests.has(lesson._id)) {
      void ensureLessonFigures(lesson);
    }
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
    const previousLessonId = state.selectedLessonId;
    state.term = value || '';

    if (state.term) {
      applySearch();
      if (!state.visibleSections.some(section => section._id === state.selectedSectionId)) {
        const nextSection = state.visibleSections[0];
        state.selectedSectionId = nextSection?._id || '';
        const nextLesson = nextSection
          ? filteredLessonsForSection(nextSection._id)[0]
          : null;
        state.selectedLessonId = nextLesson?._id || '';
      }
    }

    renderChapters();
    renderLessons();
    if (state.selectedLessonId !== previousLessonId || !currentLesson()) renderDetail();
    renderReaderNavigation();
    syncUrl();
  }

  function scheduleSearch(value) {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      handleSearch(value);
    }, 90);
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

      $('#emergencySearch')?.addEventListener('input', event => scheduleSearch(event.target.value));
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