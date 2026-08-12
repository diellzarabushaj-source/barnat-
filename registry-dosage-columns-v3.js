(() => {
  'use strict';

  const VERSION = 'registry-dosage-visible-batch-v1';
  const ENDPOINT = '/api/dosage?view=cards';
  const STORAGE_KEY = 'medindex-registry-dosage-columns-v2';
  const PICKER_GROUP_ID = 'registryDosageColumnControls';
  const REGISTRY_WAIT_TIMEOUT_MS = 30000;
  const INDEX_BATCH_SIZE = 250;
  const REQUEST_BATCH_SIZE = 100;
  const COLUMNS = [
    { key:'adult', label:'Dozimi · të rritur', empty:'Nuk ka dozë të strukturuar për të rritur.' },
    { key:'pediatric', label:'Dozimi · fëmijë', empty:'Nuk ka dozë pediatrike të strukturuar.' },
  ];

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);
  const columnSelector = key => `[data-registry-dosage-column="${key}"]`;
  const yieldToBrowser = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

  const visibility = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { adult:stored.adult === true, pediatric:stored.pediatric === true };
    } catch {
      return { adult:false, pediatric:false };
    }
  })();

  let registry = { status:'loading', byNumber:new Map(), byDrugKey:new Map() };
  const clinical = {
    cardsByNumber:new Map(),
    cardsByKey:new Map(),
    cardsByPdid:new Map(),
    loadedNumbers:new Set(),
    pendingNumbers:new Set(),
    failedNumbers:new Set(),
  };
  let enhanceQueued = false;
  let enhancing = false;
  let pickerSyncing = false;
  let tbodyObserver = null;
  let headerObserver = null;
  let panelObserver = null;

  function saveVisibility() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility)); } catch {}
  }

  function applyVisibility() {
    COLUMNS.forEach(column => {
      document.documentElement.classList.toggle(`hide-registry-dosage-${column.key}`, !visibility[column.key]);
      document.querySelectorAll(`[data-registry-dosage-picker="${column.key}"] input`).forEach(input => {
        input.checked = visibility[column.key];
      });
    });
  }

  function waitForRegistryRows() {
    if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) return Promise.resolve(window.MEDINDEX_REGISTRY_ROWS);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        window.removeEventListener('medindex:registry-data-ready', onReady);
        callback(value);
      };
      const onReady = event => {
        const rows = event.detail?.rows || window.MEDINDEX_REGISTRY_ROWS;
        if (Array.isArray(rows)) finish(resolve, rows);
      };
      const timeout = setTimeout(() => finish(reject, new Error('Regjistri i përbashkët nuk u bë gati me kohë.')), REGISTRY_WAIT_TIMEOUT_MS);
      window.addEventListener('medindex:registry-data-ready', onReady);
      const current = window.MEDINDEX_REGISTRY_ROWS;
      if (Array.isArray(current)) finish(resolve, current);
    });
  }

  function addUnique(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, value);
    else if (map.get(key) !== value) map.set(key, null);
  }

  async function loadRegistry() {
    try {
      const rows = await waitForRegistryRows();
      const byNumber = new Map();
      const byDrugKey = new Map();
      for (let start = 0; start < rows.length; start += INDEX_BATCH_SIZE) {
        const end = Math.min(rows.length, start + INDEX_BATCH_SIZE);
        for (let index = start; index < end; index += 1) {
          const row = rows[index];
          const number = clean(row['Nr rendor']);
          if (number) byNumber.set(number, row);
          addUnique(byDrugKey, [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|'), row);
        }
        if (end < rows.length) await yieldToBrowser();
      }
      registry = { status:'ready', byNumber, byDrugKey };
    } catch (error) {
      console.error('Regjistri i përbashkët nuk u indeksua për dozimin:', error);
      registry = { status:'error', byNumber:new Map(), byDrugKey:new Map() };
    }
    scheduleEnhance();
  }

  function buildHeaderIndex() {
    const map = new Map();
    Array.from(document.querySelectorAll('#headerRow > th')).forEach((header, index) => {
      const label = clean(header.textContent).replace(/[▲▼↕]/g, '').trim();
      if (label && !map.has(label)) map.set(label, index);
    });
    return map;
  }

  function registryRowForTableRow(tableRow, headerIndex) {
    const numberIndex = headerIndex.get('Nr');
    if (Number.isInteger(numberIndex)) {
      const number = clean(tableRow.children[numberIndex]?.textContent);
      const row = registry.byNumber.get(number);
      if (row) return row;
    }
    const drugKey = clean(tableRow.querySelector('.drug-select')?.dataset.drugKey);
    return drugKey ? registry.byDrugKey.get(drugKey) || null : null;
  }

  function indexCard(card) {
    if (!card) return;
    const number = clean(card.registryNumber);
    const key = clean(card.cardKey);
    const pdid = clean(card.pdid);
    if (number) clinical.cardsByNumber.set(number, card);
    if (key) clinical.cardsByKey.set(key, card);
    if (pdid) addUnique(clinical.cardsByPdid, pdid, card);
  }

  function cardFor(row) {
    if (!row) return null;
    const number = clean(row['Nr rendor']);
    const key = [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|');
    return clinical.cardsByNumber.get(number)
      || clinical.cardsByKey.get(key)
      || clinical.cardsByPdid.get(clean(row.PDID))
      || null;
  }

  async function fetchCardBatch(numbers) {
    const url = `${ENDPOINT}&nr=${encodeURIComponent(numbers.join(','))}`;
    const response = await fetch(url, { cache:'no-store', credentials:'same-origin', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Dozat e faqes nuk u ngarkuan (${response.status}).`);
    const payload = await response.json();
    if (!payload?.ok || !Array.isArray(payload.cards)) throw new Error('Payload-i i dozave të faqes nuk është valid.');
    payload.cards.forEach(indexCard);
    return payload.cards;
  }

  function queueVisibleClinicalData(rows) {
    if (registry.status !== 'ready') return;
    const numbers = [...new Set((rows || []).map(row => clean(row?.['Nr rendor'])).filter(Boolean))]
      .filter(number => !clinical.loadedNumbers.has(number) && !clinical.pendingNumbers.has(number));
    if (!numbers.length) return;

    numbers.forEach(number => clinical.pendingNumbers.add(number));
    scheduleEnhance();

    void (async () => {
      for (let start = 0; start < numbers.length; start += REQUEST_BATCH_SIZE) {
        const batch = numbers.slice(start, start + REQUEST_BATCH_SIZE);
        try {
          await fetchCardBatch(batch);
          batch.forEach(number => {
            clinical.loadedNumbers.add(number);
            clinical.failedNumbers.delete(number);
          });
        } catch (error) {
          console.warn('Dozat e barnave të dukshme nuk u ngarkuan:', error);
          batch.forEach(number => clinical.failedNumbers.add(number));
        } finally {
          batch.forEach(number => clinical.pendingNumbers.delete(number));
          scheduleEnhance();
        }
        if (start + REQUEST_BATCH_SIZE < numbers.length) await yieldToBrowser();
      }
    })();
  }

  function dosageRow(dose, route, sources = []) {
    const sourceText = (Array.isArray(sources) ? sources : []).map(clean).filter(Boolean).join(' · ');
    const title = sourceText ? ` title="Burimet e lidhura: ${escapeHtml(sourceText)}"` : '';
    const fullDose = clean(dose);
    return `<div class="registry-dosage-grid registry-dosage-regimen"${title}>` +
      `<button type="button" class="registry-dosage-dose" aria-expanded="false" aria-label="Shfaq dozimin e plotë: ${escapeHtml(fullDose)}" title="${escapeHtml(fullDose)}">` +
      `<span class="registry-dosage-dose-text">${escapeHtml(fullDose)}</span>` +
      `<span class="registry-dosage-toggle" aria-hidden="true">Më shumë</span></button>` +
      `<div class="registry-dosage-route">${escapeHtml(route || '—')}</div>` +
      `</div>`;
  }

  function cellContent(row, card, population, emptyText) {
    const number = clean(row?.['Nr rendor']);
    if (card) {
      const dose = clean(population === 'adult' ? card.adultDose : card.pediatricDose);
      const route = clean(population === 'adult' ? card.adultRoute : card.pediatricRoute);
      if (dose) return dosageRow(dose, route, card.sourceUrls);
      return `<span class="registry-dosage-muted">${escapeHtml(emptyText)}</span>`;
    }
    if (!number || registry.status === 'loading' || clinical.pendingNumbers.has(number) || !clinical.loadedNumbers.has(number) && !clinical.failedNumbers.has(number)) {
      return '<span class="registry-dosage-muted">Duke e ngarkuar dozimin…</span>';
    }
    if (clinical.failedNumbers.has(number)) {
      return '<span class="registry-dosage-muted">Dozimi nuk u ngarkua. Rifresko faqen.</span>';
    }
    return `<span class="registry-dosage-muted">${escapeHtml(emptyText)}</span>`;
  }

  function createDosageCell(column, row, card) {
    const cell = document.createElement('td');
    cell.className = `registry-dosage-column registry-dosage-${column.key}`;
    cell.dataset.registryDosageColumn = column.key;
    cell.dataset.label = column.label;
    if (registry.status === 'loading') cell.innerHTML = '<span class="registry-dosage-muted">Duke e lidhur me barin…</span>';
    else if (!row) cell.innerHTML = '<span class="registry-dosage-muted">Bari nuk u identifikua në mënyrë unike.</span>';
    else cell.innerHTML = cellContent(row, card, column.key, column.empty);
    return cell;
  }

  function overlayCell(tableRow, headerIndex, label, value, card) {
    const next = clean(value);
    if (!next) return;
    const index = headerIndex.get(label);
    const cell = Number.isInteger(index) ? tableRow.children[index] : null;
    if (!cell) return;
    if (clean(cell.textContent) !== next) cell.textContent = next;
    if (cell.title !== next) cell.title = next;
    const marker = clean(card?.pdid || 'verified');
    if (cell.dataset.registryCardOverlay !== marker) cell.dataset.registryCardOverlay = marker;
  }

  function applyCardOverlay(tableRow, card, headerIndex) {
    if (!card) return;
    overlayCell(tableRow, headerIndex, 'Klasa / Çka është', card.drugClass, card);
    overlayCell(tableRow, headerIndex, 'Përdorimi / fjalë kyçe', card.use, card);
  }

  function ensureHeader() {
    const header = document.getElementById('headerRow');
    if (!header) return;
    COLUMNS.forEach(column => {
      const matches = Array.from(header.querySelectorAll(columnSelector(column.key)));
      matches.slice(1).forEach(node => node.remove());
      if (matches[0]) return;
      const th = document.createElement('th');
      th.className = `registry-dosage-column registry-dosage-${column.key}`;
      th.dataset.registryDosageColumn = column.key;
      th.setAttribute('scope', 'col');
      th.innerHTML = `${escapeHtml(column.label)}<span class="registry-dosage-subhead">Doza&nbsp;&nbsp;·&nbsp;&nbsp;Rruga</span>`;
      header.appendChild(th);
    });
  }

  function ensureRows() {
    const headerIndex = buildHeaderIndex();
    const visibleRows = [];
    document.querySelectorAll('#tbody > tr').forEach(tableRow => {
      if (tableRow.querySelector('.empty-state')) {
        const emptyCell = tableRow.querySelector('td');
        if (emptyCell) emptyCell.colSpan = document.querySelectorAll('#headerRow > th').length || Number(emptyCell.colSpan || 1);
        return;
      }
      const row = registryRowForTableRow(tableRow, headerIndex);
      if (row) visibleRows.push(row);
      const card = cardFor(row);
      applyCardOverlay(tableRow, card, headerIndex);
      COLUMNS.forEach(column => {
        const matches = Array.from(tableRow.querySelectorAll(columnSelector(column.key)));
        matches.slice(1).forEach(node => node.remove());
        const existing = matches[0];
        const desired = createDosageCell(column, row, card);
        if (!existing) tableRow.appendChild(desired);
        else if (existing.innerHTML !== desired.innerHTML) existing.replaceWith(desired);
      });
    });
    queueVisibleClinicalData(visibleRows);
  }

  function pickerLabel(column) {
    const label = document.createElement('label');
    label.dataset.registryDosagePicker = column.key;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = visibility[column.key];
    checkbox.addEventListener('change', () => {
      visibility[column.key] = checkbox.checked;
      saveVisibility();
      applyVisibility();
    });
    const span = document.createElement('span');
    span.textContent = column.label;
    label.append(checkbox, span);
    return label;
  }

  function bindPickerActions(panel) {
    const buttons = panel.querySelectorAll('.col-panel-actions button');
    if (buttons[0] && !buttons[0].dataset.registryDosageBound) {
      buttons[0].dataset.registryDosageBound = '1';
      buttons[0].addEventListener('click', () => {
        COLUMNS.forEach(column => { visibility[column.key] = true; });
        saveVisibility();
        requestAnimationFrame(() => { ensurePicker(); applyVisibility(); });
      });
    }
    if (buttons[1] && !buttons[1].dataset.registryDosageBound) {
      buttons[1].dataset.registryDosageBound = '1';
      buttons[1].addEventListener('click', () => {
        COLUMNS.forEach(column => { visibility[column.key] = false; });
        saveVisibility();
        requestAnimationFrame(() => { ensurePicker(); applyVisibility(); });
      });
    }
  }

  function ensurePicker() {
    const panel = document.getElementById('colPanel');
    if (!panel || pickerSyncing) return;
    pickerSyncing = true;
    panelObserver?.disconnect();
    try {
      const labels = Array.from(panel.querySelectorAll('label'));
      labels.forEach(label => {
        if (label.closest(`#${PICKER_GROUP_ID}`)) return;
        const labelText = clean(label.textContent);
        if (COLUMNS.some(column => labelText === column.label)) label.remove();
      });
      const groups = Array.from(panel.querySelectorAll(`#${PICKER_GROUP_ID}`));
      groups.slice(1).forEach(group => group.remove());
      let group = groups[0] || null;
      const validGroup = group && COLUMNS.every(column => group.querySelector(`[data-registry-dosage-picker="${column.key}"]`));
      if (!validGroup) {
        group?.remove();
        group = document.createElement('section');
        group.id = PICKER_GROUP_ID;
        group.className = 'registry-dosage-picker-group';
        const heading = document.createElement('div');
        heading.className = 'registry-dosage-picker-heading';
        heading.textContent = 'Dozimi';
        const note = document.createElement('p');
        note.className = 'registry-dosage-picker-note';
        note.textContent = 'Dozat ngarkohen vetëm për barnat në faqen që po shikon.';
        group.append(heading, note);
        COLUMNS.forEach(column => group.appendChild(pickerLabel(column)));
        const actions = panel.querySelector('.col-panel-actions');
        actions?.insertAdjacentElement('afterend', group) || panel.prepend(group);
      }
      bindPickerActions(panel);
    } finally {
      pickerSyncing = false;
      observePanel();
    }
  }

  function disconnectTableObservers() {
    tbodyObserver?.disconnect();
    headerObserver?.disconnect();
  }

  function observeTable() {
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');
    if (tbody) {
      if (!tbodyObserver) tbodyObserver = new MutationObserver(scheduleEnhance);
      tbodyObserver.observe(tbody, { childList:true });
    }
    if (header) {
      if (!headerObserver) headerObserver = new MutationObserver(scheduleEnhance);
      headerObserver.observe(header, { childList:true });
    }
  }

  function observePanel() {
    const panel = document.getElementById('colPanel');
    if (!panel) return;
    if (!panelObserver) panelObserver = new MutationObserver(() => {
      if (!pickerSyncing) requestAnimationFrame(ensurePicker);
    });
    panelObserver.observe(panel, { childList:true });
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    disconnectTableObservers();
    try {
      ensureHeader();
      ensureRows();
      ensurePicker();
      applyVisibility();
      document.documentElement.dataset.registryDosagePerformance = VERSION;
    } finally {
      enhancing = false;
      observeTable();
    }
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      enhance();
    });
  }

  function startObservers() {
    observeTable();
    observePanel();
    document.getElementById('colPickerBtn')?.addEventListener('click', () => requestAnimationFrame(ensurePicker));
    const tbody = document.getElementById('tbody');
    if (tbody && !tbody.dataset.registryDosageDisclosure) {
      tbody.dataset.registryDosageDisclosure = '1';
      tbody.addEventListener('click', event => {
        const trigger = event.target.closest('.registry-dosage-dose');
        if (!trigger) return;
        event.preventDefault();
        event.stopPropagation();
        const row = trigger.closest('tr');
        if (!row) return;
        const rowController = window.MedIndexRegistryRows;
        if (typeof rowController?.toggleRow === 'function') {
          rowController.toggleRow(row);
          return;
        }
        const expanded = !(row.classList.contains('registry-row-expanded') || row.dataset.registryRowExpanded === 'true');
        row.classList.toggle('registry-row-expanded', expanded);
        row.dataset.registryRowExpanded = String(expanded);
        row.querySelectorAll('.registry-dosage-regimen').forEach(regimen => {
          regimen.classList.toggle('is-expanded', expanded);
          const button = regimen.querySelector('.registry-dosage-dose');
          if (!button) return;
          button.setAttribute('aria-expanded', String(expanded));
          const toggle = button.querySelector('.registry-dosage-toggle');
          if (toggle) toggle.textContent = expanded ? 'Më pak' : 'Më shumë';
          const dose = clean(button.querySelector('.registry-dosage-dose-text')?.textContent);
          button.setAttribute('aria-label', `${expanded ? 'Mbyll' : 'Shfaq'} dozimin e plotë: ${dose}`);
        });
      });
    }
  }

  applyVisibility();
  startObservers();
  scheduleEnhance();
  void loadRegistry();

  window.MedIndexRegistryDosage = {
    version:VERSION,
    refresh:scheduleEnhance,
    registryStatus:() => registry.status,
    clinicalStatus:() => clinical.pendingNumbers.size ? 'loading' : clinical.failedNumbers.size ? 'degraded' : 'ready',
    loadedCount:() => clinical.loadedNumbers.size,
  };
})();
