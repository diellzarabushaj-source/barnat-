(() => {
  'use strict';

  const CURRICULUM = Array.isArray(window.MEDINDEX_MEDICAL_HUB_CURRICULUM)
    ? window.MEDINDEX_MEDICAL_HUB_CURRICULUM
    : [];

  const QUERY = `*[_type == "learningTopic" && reviewStatus != "archived"] | order(title asc){
    _id,question,title,"slug":slug.current,keywords,icdCodes,summary,
    "chapterSlug":coalesce(chapterSlug,chapter->slug.current),
    "subchapterSlug":coalesce(subchapterSlug,subchapter->slug.current),
    "chapterTitle":chapter->title,"subchapterTitle":subchapter->title,
    steps[]{_key,title,action,why,setting,priority,note},
    prescriptions[]{_key,medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
    redFlags,whenToRefer,reviewStatus,reviewedBy,lastReviewedAt,version,
    relatedProtocols[]->{_id,title,"slug":slug.current,summary,reviewStatus}
  }`;

  const GROUPS = {
    foundation: 'Bazat klinike',
    symptoms: 'Simptomat',
    specialties: 'Specialitetet',
    practice: 'Praktika klinike',
  };

  const state = {
    lessons: [],
    selectedChapter: '',
    selectedSubchapter: '',
    selectedLesson: '',
    group: 'all',
    search: '',
  };

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  function getChapter(slug) {
    return CURRICULUM.find(item => item.slug === slug) || null;
  }

  function getSubchapter(chapter, slug) {
    return chapter?.subchapters?.find(item => item.slug === slug) || null;
  }

  function legacyPlacement(item) {
    const haystack = normalize([item.title, item.question, ...(item.icdCodes || [])].join(' '));
    if (haystack.includes('migren') || (item.icdCodes || []).some(code => String(code).toUpperCase().startsWith('G43'))) {
      return {chapterSlug:'neurologji', subchapterSlug:'kokedhimbja'};
    }
    return {chapterSlug:'', subchapterSlug:''};
  }

  function placement(item) {
    const legacy = legacyPlacement(item);
    return {
      chapterSlug: item.chapterSlug || legacy.chapterSlug || '',
      subchapterSlug: item.subchapterSlug || legacy.subchapterSlug || '',
    };
  }

  function lessonsFor(chapterSlug, subchapterSlug = '') {
    return state.lessons.filter(item => {
      const location = placement(item);
      return location.chapterSlug === chapterSlug && (!subchapterSlug || location.subchapterSlug === subchapterSlug);
    });
  }

  function totalSubchapters() {
    return CURRICULUM.reduce((sum, chapter) => sum + (chapter.subchapters?.length || 0), 0);
  }

  function setCounts() {
    $('#chapterCount').textContent = CURRICULUM.length;
    $('#subchapterCount').textContent = totalSubchapters();
    $('#lessonCount').textContent = state.lessons.length;
  }

  function parseHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!raw) return null;
    const [chapterSlug, subchapterSlug] = raw.split('/').filter(Boolean);
    if (!getChapter(chapterSlug)) return null;
    return {chapterSlug, subchapterSlug};
  }

  function writeHash() {
    const parts = [state.selectedChapter, state.selectedSubchapter].filter(Boolean);
    const next = parts.length ? `#${parts.map(encodeURIComponent).join('/')}` : location.pathname;
    history.replaceState(null, '', next);
  }

  function ensureSelection() {
    let chapter = getChapter(state.selectedChapter);
    if (!chapter) {
      chapter = CURRICULUM.find(item => state.group === 'all' || item.group === state.group) || CURRICULUM[0] || null;
      state.selectedChapter = chapter?.slug || '';
    }

    if (!chapter) {
      state.selectedSubchapter = '';
      return;
    }

    const subchapter = getSubchapter(chapter, state.selectedSubchapter);
    if (!subchapter) state.selectedSubchapter = chapter.subchapters?.[0]?.slug || '';
  }

  function chapterNumber(slug) {
    const index = CURRICULUM.findIndex(item => item.slug === slug);
    return index >= 0 ? String(index + 1).padStart(2, '0') : '--';
  }

  function renderChapters() {
    const container = $('#learningList');
    const chapters = CURRICULUM.filter(item => state.group === 'all' || item.group === state.group);
    const grouped = chapters.reduce((acc, item) => {
      (acc[item.group] ||= []).push(item);
      return acc;
    }, {});

    const html = Object.entries(GROUPS).map(([group, label]) => {
      const items = grouped[group] || [];
      if (!items.length) return '';
      return `
        <div class="mh-group-label">${esc(label)}</div>
        ${items.map(chapter => {
          const lessonCount = lessonsFor(chapter.slug).length;
          return `
            <button class="mh-chapter-button${chapter.slug === state.selectedChapter ? ' is-active' : ''}" type="button" data-chapter="${esc(chapter.slug)}">
              <span class="mh-chapter-index">${esc(chapterNumber(chapter.slug))}</span>
              <span>
                <span class="mh-chapter-title">${esc(chapter.title)}</span>
                <span class="mh-chapter-meta">${chapter.subchapters.length} nënkapituj${lessonCount ? ` · ${lessonCount} mësime` : ''}</span>
              </span>
              <span class="mh-count">${chapter.subchapters.length}</span>
            </button>`;
        }).join('')}`;
    }).join('');

    container.innerHTML = html || '<div class="mh-empty-lessons"><p>Nuk ka kapituj në këtë filtër.</p></div>';
    container.querySelectorAll('[data-chapter]').forEach(button => {
      button.addEventListener('click', () => selectChapter(button.dataset.chapter));
    });
  }

  function renderSubchapters() {
    const chapter = getChapter(state.selectedChapter);
    const overview = $('#chapterOverview');
    const list = $('#subchapterList');

    if (!chapter) {
      overview.innerHTML = '';
      list.innerHTML = '';
      return;
    }

    const chapterLessons = lessonsFor(chapter.slug).length;
    overview.innerHTML = `
      <div class="mh-chapter-overview">
        <span class="mh-number">KAPITULLI ${esc(chapterNumber(chapter.slug))}</span>
        <h2>${esc(chapter.title)}</h2>
        <p>${esc(chapter.description)}</p>
        <div class="mh-meta-row">
          <span class="mh-meta-chip">${chapter.subchapters.length} nënkapituj</span>
          <span class="mh-meta-chip">${chapterLessons} mësime</span>
        </div>
      </div>`;

    list.innerHTML = chapter.subchapters.map(subchapter => {
      const count = lessonsFor(chapter.slug, subchapter.slug).length;
      return `
        <button class="mh-subchapter-button${subchapter.slug === state.selectedSubchapter ? ' is-active' : ''}" type="button" data-subchapter="${esc(subchapter.slug)}">
          <span>
            <strong>${esc(subchapter.title)}</strong>
            <span>${count ? `${count} mësime` : 'Mësimet do të shtohen'}</span>
          </span>
          <span class="mh-subchapter-arrow" aria-hidden="true">›</span>
        </button>`;
    }).join('');

    list.querySelectorAll('[data-subchapter]').forEach(button => {
      button.addEventListener('click', () => selectSubchapter(button.dataset.subchapter));
    });
  }

  function renderBreadcrumbs() {
    const chapter = getChapter(state.selectedChapter);
    const subchapter = getSubchapter(chapter, state.selectedSubchapter);
    const nav = $('#hubBreadcrumbs');
    nav.innerHTML = `
      <button type="button" data-breadcrumb-home>Medical Hub</button>
      ${chapter ? `<span>/</span><button type="button" data-breadcrumb-chapter>${esc(chapter.title)}</button>` : ''}
      ${subchapter ? `<span>/</span><span>${esc(subchapter.title)}</span>` : ''}`;

    nav.querySelector('[data-breadcrumb-home]')?.addEventListener('click', () => {
      state.group = 'all';
      state.selectedChapter = CURRICULUM[0]?.slug || '';
      state.selectedSubchapter = CURRICULUM[0]?.subchapters?.[0]?.slug || '';
      state.selectedLesson = '';
      syncFilters();
      renderAll();
    });
    nav.querySelector('[data-breadcrumb-chapter]')?.addEventListener('click', () => {
      state.selectedLesson = '';
      renderLessonStage();
    });
  }

  function reviewLabel(status) {
    const labels = {draft:'Draft',review:'Për verifikim',verified:'Verifikuar',archived:'Arkivuar'};
    return labels[status] || status || 'Pa status';
  }

  function bulletMarkup(items) {
    return `<ul>${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  }

  function renderLessonDetail(item) {
    const stage = $('#lessonStage');
    const chapter = getChapter(state.selectedChapter);
    const subchapter = getSubchapter(chapter, state.selectedSubchapter);

    stage.innerHTML = `
      <div class="mh-detail-view">
        <div class="mh-detail-toolbar">
          <button class="mh-back" type="button" id="backToLessons">← Kthehu te nënkapitulli</button>
          <span class="mh-lesson-badge">${esc(subchapter?.title || 'Mësim')}</span>
        </div>
        <header class="mh-detail-head">
          <p class="mh-question">${esc(item.question || 'Mësim klinik')}</p>
          <h2>${esc(item.title || item.question || 'Mësim')}</h2>
          <div class="mh-meta-row">
            ${(item.icdCodes || []).map(code => `<span class="mh-meta-chip">${esc(code)}</span>`).join('')}
            <span class="mh-meta-chip">${esc(reviewLabel(item.reviewStatus))}</span>
            ${item.version ? `<span class="mh-meta-chip">v${esc(item.version)}</span>` : ''}
          </div>
          ${item.summary ? `<p class="mh-detail-summary">${esc(item.summary)}</p>` : ''}
        </header>
        <div class="mh-detail-sections">
          ${item.redFlags?.length ? `<section class="mh-detail-section is-alert"><h3>Red flags</h3>${bulletMarkup(item.redFlags)}</section>` : ''}
          ${(item.steps || []).length ? `<section class="mh-detail-section"><h3>Trajtimi hap pas hapi</h3>${item.steps.map((step, index) => `
            <div class="mh-step"><span class="mh-step-index">${index + 1}</span><div><strong>${esc(step.title || 'Hapi')}</strong><p>${esc(step.action || '')}</p>${step.why ? `<p>${esc(step.why)}</p>` : ''}</div></div>`).join('')}</section>` : ''}
          ${item.whenToRefer ? `<section class="mh-detail-section"><h3>Kur referohet</h3><p>${esc(item.whenToRefer)}</p></section>` : ''}
          ${item.relatedProtocols?.length ? `<section class="mh-detail-section"><h3>Protokolle të lidhura</h3>${bulletMarkup(item.relatedProtocols.map(protocol => protocol.title))}</section>` : ''}
        </div>
      </div>`;

    $('#backToLessons')?.addEventListener('click', () => {
      state.selectedLesson = '';
      renderLessonStage();
    });
  }

  function renderLessonStage() {
    const stage = $('#lessonStage');
    const chapter = getChapter(state.selectedChapter);
    const subchapter = getSubchapter(chapter, state.selectedSubchapter);

    if (!chapter || !subchapter) {
      stage.innerHTML = '<div class="mh-empty-lessons"><div><h3>Zgjidh një kapitull</h3><p>Zgjidh një kapitull dhe nënkapitull për të vazhduar.</p></div></div>';
      return;
    }

    const lessons = lessonsFor(chapter.slug, subchapter.slug);
    const selected = lessons.find(item => item._id === state.selectedLesson);
    if (selected) {
      renderLessonDetail(selected);
      return;
    }

    stage.innerHTML = `
      <div class="mh-lesson-stage-head">
        <div>
          <p class="mh-panel-kicker">Niveli 3 · Mësimet</p>
          <h2>${esc(subchapter.title)}</h2>
          <p>${esc(subchapter.description || `Hapësira e mësimeve për ${subchapter.title}. Struktura është gati; përmbajtjen mund ta shtosh më vonë.`)}</p>
        </div>
        <span class="mh-lesson-badge">${lessons.length} mësime</span>
      </div>
      ${lessons.length ? `
        <div class="mh-lessons-list">
          ${lessons.map(item => `
            <button class="mh-lesson-card" type="button" data-lesson="${esc(item._id)}">
              <span><strong>${esc(item.title || item.question)}</strong><span>${esc(item.summary || item.question || 'Mësim klinik')}</span></span>
              <em>Hap →</em>
            </button>`).join('')}
        </div>` : `
        <div class="mh-empty-lessons">
          <div>
            <div class="mh-empty-icon" aria-hidden="true">+</div>
            <h3>Struktura është gati</h3>
            <p>Nuk ka ende mësime në këtë nënkapitull. Mund t’i shtosh më vonë në Sanity pa ndryshuar navigimin e Medical Hub.</p>
            <small>${esc(chapter.title)} → ${esc(subchapter.title)}</small>
          </div>
        </div>`}`;

    stage.querySelectorAll('[data-lesson]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedLesson = button.dataset.lesson;
        renderLessonStage();
      });
    });
  }

  function renderSearchResults() {
    const container = $('#hubSearchResults');
    const term = normalize(state.search);
    if (!term) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    const chapters = CURRICULUM.filter(item => normalize(`${item.title} ${item.description}`).includes(term)).slice(0, 8);
    const subchapters = CURRICULUM.flatMap(chapter => chapter.subchapters.map(subchapter => ({chapter, subchapter})))
      .filter(({chapter, subchapter}) => normalize(`${chapter.title} ${subchapter.title} ${subchapter.description}`).includes(term))
      .slice(0, 12);
    const lessons = state.lessons.filter(item => normalize([
      item.title, item.question, item.summary, ...(item.keywords || []), ...(item.icdCodes || []),
    ].join(' ')).includes(term)).slice(0, 10);

    const sections = [];
    if (chapters.length) sections.push(`
      <div class="mh-search-group"><div class="mh-search-group-title">Kapituj</div>${chapters.map(chapter => `
        <button class="mh-search-hit" type="button" data-hit-chapter="${esc(chapter.slug)}"><span><strong>${esc(chapter.title)}</strong><span>${esc(chapter.description)}</span></span><span class="mh-search-type">Kapitull</span></button>`).join('')}</div>`);
    if (subchapters.length) sections.push(`
      <div class="mh-search-group"><div class="mh-search-group-title">Nënkapituj</div>${subchapters.map(({chapter, subchapter}) => `
        <button class="mh-search-hit" type="button" data-hit-chapter="${esc(chapter.slug)}" data-hit-subchapter="${esc(subchapter.slug)}"><span><strong>${esc(subchapter.title)}</strong><span>${esc(chapter.title)}</span></span><span class="mh-search-type">Nënkapitull</span></button>`).join('')}</div>`);
    if (lessons.length) sections.push(`
      <div class="mh-search-group"><div class="mh-search-group-title">Mësime</div>${lessons.map(item => {
        const loc = placement(item);
        return `<button class="mh-search-hit" type="button" data-hit-chapter="${esc(loc.chapterSlug)}" data-hit-subchapter="${esc(loc.subchapterSlug)}" data-hit-lesson="${esc(item._id)}"><span><strong>${esc(item.title || item.question)}</strong><span>${esc((item.icdCodes || []).join(' · ') || item.summary || 'Mësim klinik')}</span></span><span class="mh-search-type">Mësim</span></button>`;
      }).join('')}</div>`);

    container.innerHTML = sections.join('') || '<div class="mh-search-group"><div class="mh-search-hit"><span><strong>Nuk u gjet rezultat</strong><span>Provo një term tjetër.</span></span></div></div>';
    container.hidden = false;

    container.querySelectorAll('[data-hit-chapter]').forEach(button => {
      button.addEventListener('click', () => {
        const chapter = getChapter(button.dataset.hitChapter);
        if (!chapter) return;
        state.group = 'all';
        state.selectedChapter = chapter.slug;
        state.selectedSubchapter = button.dataset.hitSubchapter || chapter.subchapters?.[0]?.slug || '';
        state.selectedLesson = button.dataset.hitLesson || '';
        state.search = '';
        $('#learningSearch').value = '';
        syncFilters();
        renderAll();
        container.hidden = true;
      });
    });
  }

  function selectChapter(slug) {
    const chapter = getChapter(slug);
    if (!chapter) return;
    state.selectedChapter = chapter.slug;
    state.selectedSubchapter = chapter.subchapters?.[0]?.slug || '';
    state.selectedLesson = '';
    renderAll();
  }

  function selectSubchapter(slug) {
    const chapter = getChapter(state.selectedChapter);
    if (!getSubchapter(chapter, slug)) return;
    state.selectedSubchapter = slug;
    state.selectedLesson = '';
    renderAll();
  }

  function syncFilters() {
    document.querySelectorAll('[data-group]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.group === state.group));
    });
  }

  function renderAll() {
    ensureSelection();
    renderChapters();
    renderSubchapters();
    renderBreadcrumbs();
    renderLessonStage();
    setCounts();
    writeHash();
    $('#learningStatus').textContent = `${CURRICULUM.length} kapituj · ${totalSubchapters()} nënkapituj · ${state.lessons.length} mësime të publikuara`;
  }

  function bindEvents() {
    $('#learningSearch')?.addEventListener('input', event => {
      state.search = event.target.value;
      renderSearchResults();
    });

    $('#learningSearch')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        state.search = '';
        event.target.value = '';
        renderSearchResults();
        event.target.blur();
      }
    });

    $('#hubFilters')?.querySelectorAll('[data-group]').forEach(button => {
      button.addEventListener('click', () => {
        state.group = button.dataset.group;
        const current = getChapter(state.selectedChapter);
        if (state.group !== 'all' && current?.group !== state.group) {
          const first = CURRICULUM.find(item => item.group === state.group);
          state.selectedChapter = first?.slug || '';
          state.selectedSubchapter = first?.subchapters?.[0]?.slug || '';
          state.selectedLesson = '';
        }
        syncFilters();
        renderAll();
      });
    });

    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#learningSearch')?.focus();
      } else if (!typing && event.key === '/') {
        event.preventDefault();
        $('#learningSearch')?.focus();
      }
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.mh-search-shell')) $('#hubSearchResults').hidden = true;
    });
  }

  async function loadLessons() {
    if (!window.MedIndexSanity?.query) return [];
    try {
      const items = await window.MedIndexSanity.query(QUERY);
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error('Medical Hub: Sanity lessons could not be loaded.', error);
      return [];
    }
  }

  async function init() {
    const hashState = parseHash();
    if (hashState) {
      state.selectedChapter = hashState.chapterSlug;
      state.selectedSubchapter = hashState.subchapterSlug || '';
    } else {
      state.selectedChapter = CURRICULUM[0]?.slug || '';
      state.selectedSubchapter = CURRICULUM[0]?.subchapters?.[0]?.slug || '';
    }

    bindEvents();
    syncFilters();
    renderAll();

    state.lessons = await loadLessons();
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
