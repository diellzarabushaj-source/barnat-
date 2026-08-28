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
      lessonSections[]{
        _key,order,title,sourceHeadingEn,explanation,clinicalPearl,figureNumbers,
        rx[]{_key,order,text,note}
      },
      abbreviations[]{_key,footnoteNumber,abbreviation,fullTermEn,explanationSq},
      figures[]{
        _key,figureNumber,sourcePdfPage,caption,sourceCaptionEn,alt,
        image{asset->{url},alt}
      }
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

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

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
    const root = $('#emergencyChapterList');
    const status = $('#chapterStatus');
    if (!root || !status) return;

    applySearch();

    status.textContent = `${state.visibleSections.length} nga ${state.sections.length} kapituj`;

    root.innerHTML = state.visibleSections.map(section => {
      const active = section._id === state.selectedSectionId;
      const activeLessons = sectionLessons(section._id);
      const expected = Number(section.lessonCount) || activeLessons.length;
      return `
        <button class="ec-chapter${active ? ' is-active' : ''}" type="button"
          data-section-id="${esc(section._id)}" aria-pressed="${active ? 'true' : 'false'}">
          <div class="ec-chapter-top">
            <span class="ec-index">Kapitulli ${String(section.sectionNumber || section.order || '').padStart(2, '0')}</span>
            <span class="ec-count">${activeLessons.length}/${expected}</span>
          </div>
          <strong>${esc(section.title)}</strong>
          ${section.sourceTitleEn ? `<small>${esc(section.sourceTitleEn)}</small>` : ''}
        </button>
      `;
    }).join('') || '<div class="ec-empty-pane">Nuk u gjet asnjë kapitull.</div>';

    root.querySelectorAll('[data-section-id]').forEach(button => {
      button.addEventListener('click', () => selectSection(button.dataset.sectionId));
    });
  }

  function renderLessons() {
    const root = $('#emergencyLessonList');
    const status = $('#lessonStatus');
    const section = currentSection();
    if (!root || !status) return;

    if (!section) {
      status.textContent = 'Zgjidh një kapitull';
      root.innerHTML = '<div class="ec-empty-pane">Zgjidh kapitullin në kolonën e parë.</div>';
      return;
    }

    let lessons = sectionLessons(section._id);
    const term = normalize(state.term);
    if (term) lessons = lessons.filter(lesson => haystackForLesson(lesson).includes(term));

    const expected = Number(section.lessonCount) || lessons.length;
    status.textContent = `${section.title} · ${lessons.length}/${expected} aktive`;

    if (!lessons.length) {
      root.innerHTML = `
        <div class="ec-empty-pane">
          <strong>Ende pa mësime të publikuara.</strong><br>
          Ky kapitull ka ${expected} mësime të planifikuara në strukturën e re të Sanity.
        </div>
      `;
      return;
    }

    root.innerHTML = lessons.map(lesson => {
      const active = lesson._id === state.selectedLessonId;
      const number = lesson.chapterNumber || lesson.orderInSection || '';
      return `
        <button class="ec-lesson${active ? ' is-active' : ''}" type="button"
          data-lesson-id="${esc(lesson._id)}" aria-pressed="${active ? 'true' : 'false'}">
          <div class="ec-lesson-top">
            <span class="ec-index">Mësimi ${String(number).padStart(2, '0')}</span>
            <span class="ec-count">${(lesson.lessonSections || []).length}</span>
          </div>
          <strong>${esc(lesson.title)}</strong>
          ${lesson.sourceTitleEn ? `<small>${esc(lesson.sourceTitleEn)}</small>` : ''}
        </button>
      `;
    }).join('');

    root.querySelectorAll('[data-lesson-id]').forEach(button => {
      button.addEventListener('click', () => selectLesson(button.dataset.lessonId));
    });
  }

  function figureByNumber(lesson, number) {
    return (lesson.figures || []).find(item => String(item.figureNumber) === String(number));
  }

  function figureMarkup(figure) {
    if (!figure) return '';
    const src = figure?.image?.asset?.url || '';
    if (!src) {
      return `<span class="ec-figure-chip">Figura ${esc(figure.figureNumber)}${figure.sourcePdfPage ? ` · PDF f. ${esc(figure.sourcePdfPage)}` : ''}</span>`;
    }
    return `
      <figure class="ec-figure-card">
        <img src="${esc(src)}" alt="${esc(figure.alt || figure.caption || `Figura ${figure.figureNumber}`)}" loading="lazy">
        <figcaption><strong>Figura ${esc(figure.figureNumber)}.</strong> ${esc(figure.caption || '')}</figcaption>
      </figure>
    `;
  }

  function renderLessonSection(lesson, section, index) {
    const rx = [...(section.rx || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
    const linkedFigures = (section.figureNumbers || []).map(number => figureByNumber(lesson, number)).filter(Boolean);
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

        ${linkedFigures.length ? `
          <div class="ec-figure-strip">
            ${linkedFigures.filter(f => !f?.image?.asset?.url).map(figureMarkup).join('')}
          </div>
          ${linkedFigures.filter(f => f?.image?.asset?.url).map(figureMarkup).join('')}
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
      root.innerHTML = `
        <div class="ec-detail-placeholder">
          <div>
            <strong>${section ? esc(section.title) : 'Zgjidh një kapitull.'}</strong>
            ${section ? 'Zgjidh një mësim nga kolona e dytë.' : 'Pastaj zgjidh mësimin që dëshiron të hapësh.'}
          </div>
        </div>
      `;
      return;
    }

    const section = lesson.section || currentSection();
    const sections = [...(lesson.lessonSections || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
    const abbreviations = [...(lesson.abbreviations || [])].sort((a, b) => (Number(a.footnoteNumber) || 999) - (Number(b.footnoteNumber) || 999));

    root.innerHTML = `
      <div class="ec-detail-inner">
        <div class="ec-breadcrumb">
          <span>Kapitulli ${String(section?.sectionNumber || lesson.sourceSectionNumber || '').padStart(2, '0')}</span>
          <span>›</span>
          <span>Mësimi ${String(lesson.chapterNumber || lesson.orderInSection || '').padStart(2, '0')}</span>
        </div>

        <header class="ec-detail-title">
          <h2>${esc(lesson.title)}</h2>
          ${lesson.sourceTitleEn ? `<p class="ec-source-title">${esc(lesson.sourceTitleEn)}</p>` : ''}
        </header>

        ${lesson.quickSummary ? `
          <div class="ec-quick-summary">
            <span>Në 20 sekonda</span>
            <p>${esc(lesson.quickSummary)}</p>
          </div>
        ` : ''}

        ${sections.map((item, index) => renderLessonSection(lesson, item, index)).join('')}

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
          ${lesson.reviewStatus ? `<span>Status: ${esc(lesson.reviewStatus)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function selectSection(id, {preserveLesson = false} = {}) {
    if (!id) return;
    state.selectedSectionId = id;

    if (!preserveLesson || currentLesson()?.section?._id !== id) {
      const first = sectionLessons(id)[0];
      state.selectedLessonId = first?._id || '';
    }

    renderChapters();
    renderLessons();
    renderDetail();
    syncUrl();

    if (matchMedia('(max-width: 900px)').matches) {
      $('#emergencyLessonList')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  function selectLesson(id) {
    const lesson = state.lessons.find(item => item._id === id);
    if (!lesson) return;

    state.selectedLessonId = id;
    if (lesson.section?._id) state.selectedSectionId = lesson.section._id;

    renderChapters();
    renderLessons();
    renderDetail();
    syncUrl();

    if (matchMedia('(max-width: 900px)').matches) {
      $('#emergencyDetail')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
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
  }

  async function init() {
    try {
      const payload = await window.MedIndexSanity.query(QUERY);
      state.sections = Array.isArray(payload?.sections) ? payload.sections : [];
      state.lessons = Array.isArray(payload?.lessons) ? payload.lessons : [];

      $('#chapterTotal').textContent = String(state.sections.length || 0);
      $('#lessonTotal').textContent = String(state.lessons.length || 0);

      state.visibleSections = [...state.sections];
      state.selectedSectionId = state.sections[0]?._id || '';
      state.selectedLessonId = sectionLessons(state.selectedSectionId)[0]?._id || '';

      restoreUrl();

      $('#emergencySearch')?.addEventListener('input', event => handleSearch(event.target.value));

      renderChapters();
      renderLessons();
      renderDetail();
      syncUrl();
    } catch (error) {
      console.error('[Urgjencat curriculum]', error);
      $('#chapterStatus').textContent = 'Gabim në ngarkim';
      $('#emergencyChapterList').innerHTML = '<div class="ec-empty-pane">Nuk u ngarkuan kapitujt nga Sanity.</div>';
      $('#emergencyLessonList').innerHTML = '<div class="ec-empty-pane">Kontrollo lidhjen me Sanity.</div>';
      $('#emergencyDetail').innerHTML = '<div class="ec-detail-placeholder"><div><strong>Urgjencat nuk u ngarkuan.</strong>Kontrollo Sanity dhe provo përsëri.</div></div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else {
    init();
  }
})();