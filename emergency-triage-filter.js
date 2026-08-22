(() => {
  'use strict';

  const list = document.getElementById('emergencyList');
  const toolbar = document.querySelector('.ck-toolbar');
  if (!list || !toolbar) return;

  const QUERY = `*[_type == "emergencyProtocol" && reviewStatus != "archived"]{
    _id,triageLevel
  }`;
  const STORAGE_KEY = 'medindex_emergency_triage_filter_v1';
  const FILTERS = [
    {value: 'all', label: 'Të gjitha'},
    {value: 'critical', label: 'Kritike'},
    {value: 'very-urgent', label: 'Shumë urgjente'},
    {value: 'urgent', label: 'Urgjente'},
  ];
  const triageById = new Map();
  let activeFilter = readFilter();
  let controls = null;
  let frame = 0;
  let applying = false;

  function readFilter() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return FILTERS.some(item => item.value === saved) ? saved : 'all';
    } catch {
      return 'all';
    }
  }

  function saveFilter(value) {
    try { sessionStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  function ensureControls() {
    if (controls?.isConnected) return controls;
    controls = document.createElement('section');
    controls.className = 'ck-triage-filter';
    controls.setAttribute('aria-label', 'Filtro urgjencat sipas triazhit');
    controls.innerHTML = `
      <div class="ck-triage-filter-copy">
        <strong>Prioriteti klinik</strong>
        <span>Filtro listën pa ndryshuar përmbajtjen e protokollit.</span>
      </div>
      <div class="ck-triage-filter-group" role="group" aria-label="Niveli i triazhit">
        ${FILTERS.map(item => `<button type="button" data-ck-triage="${item.value}" aria-pressed="${item.value === activeFilter ? 'true' : 'false'}"><span>${item.label}</span><b data-ck-triage-count="${item.value}">0</b></button>`).join('')}
      </div>
      <span class="ck-triage-filter-status" aria-live="polite" aria-atomic="true"></span>`;

    const hint = document.querySelector('.ck-doctor-hint');
    (hint || toolbar).insertAdjacentElement('afterend', controls);

    controls.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-triage]');
      if (!button) return;
      setFilter(button.dataset.ckTriage || 'all', true);
    });

    controls.addEventListener('keydown', event => {
      const current = event.target.closest('[data-ck-triage]');
      if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...controls.querySelectorAll('[data-ck-triage]')];
      if (!buttons.length) return;
      event.preventDefault();
      let index = buttons.indexOf(current);
      if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = buttons.length - 1;
      else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    });

    return controls;
  }

  function renderedButtons() {
    return [...list.querySelectorAll('.ck-list-button[data-id]')];
  }

  function baseCounts(buttons) {
    const counts = {all: buttons.length, critical: 0, 'very-urgent': 0, urgent: 0};
    buttons.forEach(button => {
      const level = triageById.get(button.dataset.id) || '';
      if (Object.prototype.hasOwnProperty.call(counts, level)) counts[level] += 1;
    });
    return counts;
  }

  function updateControls(counts, visibleCount) {
    const root = ensureControls();
    root.querySelectorAll('[data-ck-triage]').forEach(button => {
      const value = button.dataset.ckTriage || 'all';
      button.setAttribute('aria-pressed', value === activeFilter ? 'true' : 'false');
      button.classList.toggle('is-active', value === activeFilter);
      const count = button.querySelector(`[data-ck-triage-count="${value}"]`);
      if (count) count.textContent = String(counts[value] || 0);
    });
    const status = root.querySelector('.ck-triage-filter-status');
    if (status) {
      const label = FILTERS.find(item => item.value === activeFilter)?.label || 'Të gjitha';
      status.textContent = `${label}: ${visibleCount} ${visibleCount === 1 ? 'urgjencë' : 'urgjenca'} në listën aktuale.`;
    }
  }

  function applyFilter({moveSelection = false} = {}) {
    if (applying) return;
    applying = true;
    try {
      const buttons = renderedButtons();
      const counts = baseCounts(buttons);
      let visibleCount = 0;

      buttons.forEach(button => {
        const level = triageById.get(button.dataset.id) || '';
        button.dataset.ckTriageLevel = level;
        const matches = activeFilter === 'all' || level === activeFilter;
        button.hidden = !matches;
        if (matches) visibleCount += 1;
      });

      updateControls(counts, visibleCount);

      if (moveSelection) {
        const active = list.querySelector('.ck-list-button.is-active[data-id]');
        if (active?.hidden) {
          const firstVisible = buttons.find(button => !button.hidden);
          firstVisible?.click();
        }
      }
    } finally {
      applying = false;
    }
  }

  function setFilter(value, moveSelection = false) {
    if (!FILTERS.some(item => item.value === value)) value = 'all';
    activeFilter = value;
    saveFilter(value);
    applyFilter({moveSelection});
  }

  async function loadTriage() {
    try {
      if (!window.MedIndexSanity?.query) return;
      const rows = await window.MedIndexSanity.query(QUERY);
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        if (row?._id) triageById.set(row._id, row.triageLevel || '');
      });
      applyFilter({moveSelection:true});
    } catch (error) {
      console.warn('Urgjencat: filtri i triazhit nuk u ngarkua.', error);
    }
  }

  const observer = new MutationObserver(() => {
    if (applying) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => applyFilter({moveSelection:true}));
  });
  observer.observe(list, {childList: true, subtree: true});

  ensureControls();
  applyFilter();
  loadTriage();
})();
