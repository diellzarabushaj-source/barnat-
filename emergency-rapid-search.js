(() => {
  'use strict';

  const page = document.querySelector('[data-mi-page="urgjencat"] .clinical-knowledge-page');
  const search = document.getElementById('emergencySearch');
  const list = document.getElementById('emergencyList');
  const quickHost = document.getElementById('emergencyQuickSearch');
  const browse = document.getElementById('emergencyBrowse');
  const explorer = document.getElementById('emergencyChapterExplorer');
  const chapterSelect = document.getElementById('emergencyChapterSelect');
  const subchapterSelect = document.getElementById('emergencySubchapterSelect');
  const reset = document.getElementById('emergencyChapterReset');

  if (!page || !search || !list || !quickHost) return;

  const QUICK_SEARCHES = [
    {label: 'Dhimbje gjoksi', terms: ['dhimbje gjoksi', 'gjoks', 'koronare', 'infarkt']},
    {label: 'Frymëmarrje', terms: ['frymemarr', 'dispne', 'astme', 'hipoksi']},
    {label: 'Vetëdije', terms: ['vetedij', 'sinkop', 'pa ndjenja']},
    {label: 'Sheqeri', terms: ['hipoglik', 'glukoz', 'sheqer']},
    {label: 'Konvulsione', terms: ['konvulsion', 'epilep', 'status epilepticus']},
    {label: 'Anafilaksi', terms: ['anafil']},
  ];

  const normalize = value => String(value || '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));

  let quickMatches = [];
  let quickBuilt = false;
  let quickFrame = 0;
  let initialTriageResetDone = false;

  function browseIsFiltered() {
    return Boolean(chapterSelect?.value || subchapterSelect?.value);
  }

  function clearBrowseFilterWithoutLosingSearchFocus() {
    if (!browseIsFiltered() || !reset) return;
    reset.click();
    if (browse) browse.open = false;
    requestAnimationFrame(() => search.focus({preventScroll: true}));
  }

  function triageControls() {
    return document.querySelector('.ck-triage-filter');
  }

  function setTriageToAll() {
    const controls = triageControls();
    const all = controls?.querySelector('[data-ck-triage="all"]');
    if (!all || all.getAttribute('aria-pressed') === 'true') return;
    all.click();
    requestAnimationFrame(() => search.focus({preventScroll: true}));
  }

  function keepAdvancedControlsSecondary() {
    const controls = triageControls();
    if (!controls) return;
    if (browse && controls.parentElement !== browse) browse.appendChild(controls);
    if (!initialTriageResetDone) {
      initialTriageResetDone = true;
      const all = controls.querySelector('[data-ck-triage="all"]');
      if (all && all.getAttribute('aria-pressed') !== 'true') all.click();
    }
  }

  function syncSearchState() {
    const active = Boolean(search.value.trim());
    page.dataset.ckRapidSearching = active ? 'true' : 'false';
    quickHost.hidden = active || quickMatches.length === 0;
  }

  function renderQuickSearches() {
    if (!quickMatches.length) {
      quickHost.hidden = true;
      quickHost.innerHTML = '';
      return;
    }

    quickHost.innerHTML = `
      <span class="ck-quick-label">Kërko shpejt</span>
      <div class="ck-quick-buttons">
        ${quickMatches.map(item => `<button type="button" data-ck-rapid-query="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`).join('')}
      </div>`;
    syncSearchState();
  }

  function buildQuickSearches() {
    cancelAnimationFrame(quickFrame);
    quickFrame = requestAnimationFrame(() => {
      if (quickBuilt || search.value.trim()) return;
      const rows = [...list.querySelectorAll('[data-id]')];
      if (!rows.length) return;
      const corpus = rows.map(row => normalize(row.textContent));

      quickMatches = QUICK_SEARCHES.map(candidate => {
        const query = candidate.terms.find(term => corpus.some(text => text.includes(normalize(term))));
        return query ? {label: candidate.label, query} : null;
      }).filter(Boolean).slice(0, 6);

      quickBuilt = true;
      renderQuickSearches();
    });
  }

  function runSearch(value) {
    clearBrowseFilterWithoutLosingSearchFocus();
    if (value) setTriageToAll();
    search.value = value;
    search.focus({preventScroll: true});
    search.dispatchEvent(new Event('input', {bubbles: true}));
  }

  search.addEventListener('input', () => {
    if (search.value.trim()) {
      clearBrowseFilterWithoutLosingSearchFocus();
      setTriageToAll();
    }
    syncSearchState();
  }, {capture: true});

  search.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !search.value) return;
    event.preventDefault();
    runSearch('');
  });

  quickHost.addEventListener('click', event => {
    const button = event.target.closest('[data-ck-rapid-query]');
    if (!button) return;
    runSearch(button.dataset.ckRapidQuery || '');
  });

  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    search.focus({preventScroll: true});
  });

  if (browse && explorer) {
    const syncBrowseVisibility = () => {
      browse.hidden = explorer.hidden;
    };
    new MutationObserver(syncBrowseVisibility).observe(explorer, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
    syncBrowseVisibility();
  }

  const listObserver = new MutationObserver(buildQuickSearches);
  listObserver.observe(list, {childList: true, subtree: true});

  const controlsObserver = new MutationObserver(keepAdvancedControlsSecondary);
  controlsObserver.observe(document.body, {childList: true, subtree: true});

  keepAdvancedControlsSecondary();
  syncSearchState();
  buildQuickSearches();
})();