(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const reduceMotion = () => matchMedia('(prefers-reduced-motion:reduce)').matches;

  function dataCounts() {
    const data = window.MEDINDEX_ICD10 || {};
    const chapters = Array.isArray(data.chapters) ? data.chapters.length : 22;
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const critical = entries.filter(entry => entry?.isCritical).length;
    return { chapters, entries: entries.length, critical };
  }

  function updateHeroStats() {
    const counts = dataCounts();
    const chapterText = $('#chapterCount')?.textContent || '';
    const codeText = $('#icdCount')?.textContent || '';
    const currentChapters = Number.parseInt(chapterText, 10) || counts.chapters;
    const currentCodes = Number.parseInt(codeText, 10) || counts.entries;
    const values = {
      icdHeroChapterCount: currentChapters,
      icdHeroCodeCount: currentCodes,
      icdHeroCriticalCount: counts.critical,
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value);
    });
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({
      behavior: reduceMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function dispatchChange(element) {
    element?.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function dispatchInput(element) {
    element?.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function clearAllFilters({ focus = false } = {}) {
    const search = $('#icdSmartSearch');
    const level = $('#icdLevel');
    const context = $('#icdContext');
    if (search) search.value = '';
    if (level) level.value = '';
    if (context) context.value = '';
    dispatchInput(search);
    dispatchChange(level);
    dispatchChange(context);
    if (focus) search?.focus({ preventScroll:true });
  }

  function setContext(value) {
    const context = $('#icdContext');
    if (!context) return;
    context.value = value;
    dispatchChange(context);
  }

  function syncQuickButtons() {
    const context = $('#icdContext')?.value || '';
    const query = ($('#icdSmartSearch')?.value || '').trim();
    $$('[data-icd-quick]').forEach(button => {
      const action = button.dataset.icdQuick;
      const pressed = action === context || (action === 'all' && !context && !query);
      button.setAttribute('aria-pressed', String(pressed));
    });
  }

  function syncSelectedChapter() {
    const query = ($('#icdSmartSearch')?.value || '').trim().toUpperCase();
    $$('#chapterGrid [data-chapter-filter]').forEach(card => {
      const selected = query && card.dataset.chapterFilter?.toUpperCase() === query;
      card.classList.toggle('is-selected', Boolean(selected));
      card.setAttribute('aria-pressed', String(Boolean(selected)));
    });
  }

  function handleQuickAction(button) {
    const action = button.dataset.icdQuick;
    if (action === 'chapters') {
      scrollToSection('chapterSection');
      return;
    }
    if (action === 'codes') {
      scrollToSection('codeSection');
      return;
    }
    if (action === 'all') {
      clearAllFilters();
      scrollToSection('chapterSection');
      return;
    }
    if (['family', 'emergency', 'critical'].includes(action)) {
      setContext(action);
      scrollToSection('codeSection');
    }
  }

  function installToolbar() {
    const search = $('#icdSmartSearch');
    const level = $('#icdLevel');
    const context = $('#icdContext');
    if (!search) return;

    search.setAttribute('aria-describedby', 'icdSearchHelp');
    search.addEventListener('input', () => {
      syncQuickButtons();
      syncSelectedChapter();
    });
    search.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !search.value) return;
      event.preventDefault();
      clearAllFilters({ focus:true });
    });
    level?.addEventListener('change', syncQuickButtons);
    context?.addEventListener('change', syncQuickButtons);
    $$('[data-icd-quick]').forEach(button => button.addEventListener('click', () => handleQuickAction(button)));

    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (!typing && event.altKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        search.focus();
        search.select();
      }
    });
  }

  function installObservers() {
    const chapterGrid = $('#chapterGrid');
    const countNodes = [$('#chapterCount'), $('#icdCount'), $('#smartCount')].filter(Boolean);
    if (chapterGrid) {
      const observer = new MutationObserver(() => requestAnimationFrame(() => {
        syncSelectedChapter();
        updateHeroStats();
      }));
      observer.observe(chapterGrid, { childList:true });
    }
    countNodes.forEach(node => {
      new MutationObserver(updateHeroStats).observe(node, { childList:true, characterData:true, subtree:true });
    });
  }

  function init() {
    const main = $('#icdContent');
    main?.classList.add('icd-clinical-main');
    updateHeroStats();
    installToolbar();
    installObservers();
    syncQuickButtons();
    syncSelectedChapter();
    window.addEventListener('pageshow', () => {
      updateHeroStats();
      syncQuickButtons();
      syncSelectedChapter();
    }, { passive:true });
    window.dispatchEvent(new CustomEvent('medindex:icd-workspace-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
