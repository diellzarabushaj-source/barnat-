(() => {
  'use strict';

  const ICONS = {
    registry:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.4 4.2a4.5 4.5 0 0 1 6.4 0l5 5a4.5 4.5 0 0 1-6.4 6.4l-5-5a4.5 4.5 0 0 1 0-6.4Z"/><path d="m6.6 12.4 5.8-5.8"/><path d="M5.5 14.5h6a4 4 0 0 1 0 8h-6a4 4 0 0 1 0-8Z"/><path d="M8.5 14.5v8"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
    filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4"/></svg>',
    view:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>',
    table:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    reset:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7v5h5"/><path d="M5.5 16a8 8 0 1 0 .4-8.7L4 9"/></svg>',
  };

  const create = (tag, className, html = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;
    return node;
  };

  const text = value => String(value || '').replace(/\s+/g, ' ').trim();
  let initialized = false;

  function phoneOwnsFirstPage() {
    // The <=767px registry architecture is intentionally phone-specific and
    // lightweight. This decision must not depend on whether another deferred
    // script has already stamped its dataset marker; doing so creates an
    // execution-order race where the desktop enhancer can rewrite phone DOM.
    return window.matchMedia?.('(max-width: 767px)')?.matches === true;
  }

  function labelledGroup(label, icon, className = '') {
    const group = create('div', `registry-control-group ${className}`.trim());
    const heading = create('span', 'registry-control-label', `${icon}<span>${label}</span>`);
    const controls = create('div', 'registry-control-row');
    group.append(heading, controls);
    return { group, controls };
  }

  function syncPanelState(button, panel) {
    if (!button || !panel) return;
    const update = () => button.setAttribute('aria-expanded', String(panel.classList.contains('open')));
    new MutationObserver(update).observe(panel, { attributes:true, attributeFilter:['class'] });
    button.addEventListener('click', () => requestAnimationFrame(update));
    update();
  }

  function setColumnSemantics() {
    document.querySelectorAll('#headerRow th').forEach(cell => cell.setAttribute('scope', 'col'));
  }

  function initialize() {
    if (initialized) return true;

    // The phone registry has its own bounded renderer, filter sheet, bottom nav
    // and targeted detail surface. Rewriting that DOM with the desktop first-page
    // workspace creates duplicate chrome and pushes the first medicine hundreds
    // of pixels below the fold. Keep this enhancer unconditionally off <=767px.
    if (phoneOwnsFirstPage()) {
      const toolbar = document.querySelector('.toolbar');
      if (toolbar) toolbar.classList.add('registry-filter-panel-unified');
      initialized = true;
      document.documentElement.dataset.firstPageClinical = 'phone-skipped';
      window.dispatchEvent(new CustomEvent('medindex:first-page-audit-ready', {
        detail:{ skipped:true, owner:'phone-registry' },
      }));
      return true;
    }

    const content = document.querySelector('.mi-index-content');
    const toolbar = content?.querySelector('.toolbar') || document.querySelector('.toolbar');
    const tableWrap = content?.querySelector('#registryContent') || document.getElementById('registryContent');
    if (!content || !toolbar || !tableWrap) return false;

    const search = document.getElementById('search');
    const status = document.getElementById('statusFilter');
    const formPicker = document.querySelector('.form-picker');
    const formButton = document.getElementById('formPickerBtn');
    const formPanel = document.getElementById('formPanel');
    const pageSize = document.getElementById('pageSize');
    const columnPicker = document.querySelector('.col-picker');
    const columnButton = document.getElementById('colPickerBtn');
    const columnPanel = document.getElementById('colPanel');
    const selectionBadge = document.querySelector('.selection-badge');
    const prescriptionButton = document.getElementById('protocolsBtn');
    const countBadge = document.getElementById('countBadge');
    const selectedCount = document.getElementById('selectedCount');
    if (!search || !status || !formPicker || !pageSize || !columnPicker || !countBadge) return false;

    initialized = true;
    document.documentElement.classList.add('mi-first-page-audited');
    content.classList.add('registry-page-workspace');

    const legacyHeader = content.querySelector('header');
    if (legacyHeader) {
      legacyHeader.className = 'registry-overview registry-status-strip';
      legacyHeader.innerHTML = `
        <div class="registry-overview-icon">${ICONS.registry}</div>
        <div class="registry-overview-copy">
          <h2>Barnat e regjistruara</h2>
          <p>Kërkim klinik sipas emrit, substancës, ATC-së, përdorimit ose formës.</p>
        </div>
        <div class="registry-overview-meta" aria-label="Informacioni i regjistrit">
          <span><strong id="registryDatasetTotal">—</strong><small>barna</small></span>
          <span><small>Versioni</small><strong>1.2</strong></span>
          <span><small>Vlen deri</small><strong>31.12.2026</strong></span>
        </div>`;
    }

    toolbar.classList.add('registry-toolbar');
    toolbar.removeAttribute('role');
    toolbar.setAttribute('aria-label', 'Kërkimi, filtrat dhe veprimet e regjistrit');

    const searchBlock = create('section', 'registry-search-block');
    const searchHeading = create('div', 'registry-search-heading', '<strong>Kërko në regjistër</strong><span>Emër, substancë, ATC, përdorim ose formë</span>');
    const searchShell = create('label', 'registry-search-shell');
    searchShell.setAttribute('for', 'search');
    searchShell.innerHTML = `<span class="registry-search-icon">${ICONS.search}</span>`;
    search.placeholder = 'Kërko barin, substancën aktive, ATC-në ose përdorimin…';
    search.setAttribute('aria-describedby', 'registrySearchHelp');
    const searchShortcut = create('kbd', 'registry-search-shortcut', 'Alt + S');
    searchShell.append(search, searchShortcut);
    const searchHelp = create('span', 'registry-search-help', 'Rezultatet përditësohen menjëherë gjatë shkrimit.');
    searchHelp.id = 'registrySearchHelp';
    searchBlock.append(searchHeading, searchShell, searchHelp);

    const filterGroup = labelledGroup('Filtrat', ICONS.filter, 'registry-filter-group');
    status.title = 'Filtro sipas statusit të barit';
    formPicker.title = 'Filtro sipas formës farmaceutike';
    filterGroup.controls.append(status, formPicker);

    const viewGroup = labelledGroup('Pamja', ICONS.view, 'registry-view-group');
    pageSize.title = 'Cakto numrin e rreshtave për faqe';
    columnPicker.title = 'Zgjidh kolonat e dukshme';
    viewGroup.controls.append(pageSize, columnPicker);

    const actionGroup = labelledGroup('Veprimet', ICONS.check, 'registry-action-group');
    if (selectionBadge) actionGroup.controls.append(selectionBadge);
    if (prescriptionButton) actionGroup.controls.append(prescriptionButton);

    const secondary = create('div', 'registry-toolbar-secondary');
    secondary.append(filterGroup.group, viewGroup.group, actionGroup.group);
    toolbar.replaceChildren(searchBlock, secondary);

    const tableBar = create('section', 'registry-table-bar');
    const tableTitle = create('div', 'registry-table-title', `${ICONS.table}<div><h2>Lista e barnave</h2><p>Zgjidh një ose më shumë barna dhe vazhdo te krijimi i recetës.</p></div>`);
    const tableActions = create('div', 'registry-table-actions');
    const filterState = create('span', 'registry-filter-state');
    filterState.id = 'registryFilterState';
    const resetButton = create('button', 'registry-reset-filters', `${ICONS.reset}<span>Pastro filtrat</span>`);
    resetButton.type = 'button';
    resetButton.hidden = true;
    resetButton.addEventListener('click', () => {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles:true }));
      search.dispatchEvent(new Event('search', { bubbles:true }));
      status.value = '';
      status.dispatchEvent(new Event('change', { bubbles:true }));
      const allForms = document.querySelector('#formList .form-item-all');
      if (allForms) allForms.click();
      search.focus({ preventScroll:true });
    });
    countBadge.classList.add('registry-result-count');
    tableActions.append(filterState, resetButton, countBadge);
    tableBar.append(tableTitle, tableActions);
    tableWrap.before(tableBar);

    const table = document.getElementById('dataTable');
    if (table && !table.querySelector('caption')) {
      const caption = document.createElement('caption');
      caption.className = 'visually-hidden';
      caption.textContent = 'Regjistri i barnave me emër tregtar, substancë aktive, ATC, përdorim, fortësi dhe formë farmaceutike.';
      table.prepend(caption);
    }
    tableWrap.setAttribute('role', 'region');
    tableWrap.setAttribute('aria-label', 'Rezultatet e regjistrit të barnave');
    tableWrap.tabIndex = 0;
    const scrollHelp = create('p', 'visually-hidden');
    scrollHelp.id = 'registryScrollHelp';
    scrollHelp.textContent = 'Kur tabela vazhdon anash, fokusoje dhe përdor shigjetat majtas ose djathtas.';
    tableWrap.setAttribute('aria-describedby', scrollHelp.id);
    tableWrap.before(scrollHelp);

    const update = () => {
      const searchActive = Boolean(search.value.trim());
      const statusActive = Boolean(status.value);
      const formLabel = text(formButton?.textContent).replace(/▾/g, '').trim();
      const formActive = formLabel && !/të gjitha/i.test(formLabel);
      const activeCount = [searchActive, statusActive, formActive].filter(Boolean).length;
      filterState.textContent = activeCount ? `${activeCount} ${activeCount === 1 ? 'filtër aktiv' : 'filtra aktivë'}` : 'Pa filtra shtesë';
      filterState.classList.toggle('is-active', activeCount > 0);
      resetButton.hidden = activeCount === 0;

      const countText = text(countBadge.textContent);
      const match = countText.match(/([\d.,]+)\s*(?:\/|nga)\s*([\d.,]+)/);
      const datasetTotal = Number(countBadge.dataset.total || 0);
      const totalNode = document.getElementById('registryDatasetTotal');
      if (totalNode && datasetTotal > 0) totalNode.textContent = String(datasetTotal);
      else if (totalNode && match) totalNode.textContent = match[2];

      const selected = Number(selectedCount?.textContent || 0);
      tableWrap.classList.toggle('has-selection', selected > 0);
      if (selectionBadge) selectionBadge.classList.toggle('has-selection', selected > 0);
    };

    search.addEventListener('input', update);
    search.addEventListener('search', update);
    status.addEventListener('change', update);
    formButton?.addEventListener('click', () => setTimeout(update, 0));
    document.getElementById('formList')?.addEventListener('click', () => setTimeout(update, 0));
    new MutationObserver(update).observe(countBadge, { childList:true, characterData:true, subtree:true });
    if (selectedCount) new MutationObserver(update).observe(selectedCount, { childList:true, characterData:true, subtree:true });
    if (formButton) new MutationObserver(update).observe(formButton, { childList:true, characterData:true, subtree:true });

    const headerRow = document.getElementById('headerRow');
    if (headerRow) {
      new MutationObserver(setColumnSemantics).observe(headerRow, { childList:true });
      setColumnSemantics();
    }

    const syncScrollState = () => {
      const max = Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth);
      tableWrap.classList.toggle('has-horizontal-scroll', max > 4);
      tableWrap.classList.toggle('is-scrolled-x', tableWrap.scrollLeft > 4);
      tableWrap.classList.toggle('is-scroll-end', max > 0 && tableWrap.scrollLeft >= max - 4);
    };
    tableWrap.addEventListener('scroll', syncScrollState, { passive:true });
    tableWrap.addEventListener('keydown', event => {
      if (event.target !== tableWrap || !tableWrap.classList.contains('has-horizontal-scroll')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      tableWrap.scrollBy({ left:event.key === 'ArrowRight' ? 96 : -96, behavior:'auto' });
    });
    new ResizeObserver(syncScrollState).observe(tableWrap);
    new MutationObserver(() => requestAnimationFrame(syncScrollState))
      .observe(document.documentElement, { attributes:true, attributeFilter:['class'] });

    syncPanelState(formButton, formPanel);
    syncPanelState(columnButton, columnPanel);

    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        search.focus({ preventScroll:true });
        search.select();
      } else if (!typing && event.key === 'Escape') {
        formPanel?.classList.remove('open');
        columnPanel?.classList.remove('open');
      }
    });

    update();
    syncScrollState();
    window.dispatchEvent(new CustomEvent('medindex:first-page-audit-ready'));
    return true;
  }

  function boot() {
    if (initialize()) return;
    const observer = new MutationObserver(() => {
      if (!initialize()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    window.setTimeout(() => observer.disconnect(), 12000);
  }

  window.addEventListener('medindex:tailadmin-ready', boot, { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();