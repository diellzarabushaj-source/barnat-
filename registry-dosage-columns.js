(() => {
  'use strict';

  const ENDPOINT = '/api/dosage';
  const STORAGE_KEY = 'medindex-registry-dosage-columns-v2';
  const PICKER_GROUP_ID = 'registryDosageColumnControls';
  const COLUMNS = [
    { key:'adult', label:'1. Dozimi për të rritur', empty:'Nuk ka dozë të verifikuar për të rritur.' },
    { key:'pediatric', label:'2. Dozimi për fëmijë', empty:'Nuk ka dozë pediatrike të verifikuar.' },
  ];

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);
  const columnSelector = key => `[data-registry-dosage-column="${key}"]`;

  const visibility = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { adult: stored.adult !== false, pediatric: stored.pediatric !== false };
    } catch {
      return { adult:true, pediatric:true };
    }
  })();

  let registry = { status:'loading', byNumber:new Map(), byDrugKey:new Map() };
  let clinical = {
    status:'loading',
    adult:new Map(),
    pediatric:new Map(),
    cardsByKey:new Map(),
    cardsByPdid:new Map(),
  };
  let enhanceQueued = false;
  let enhancing = false;
  let pickerSyncing = false;

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

  function normalizeRegistryRows(value) {
    let current = value;
    for (let depth = 0; depth < 5; depth += 1) {
      if (Array.isArray(current)) break;
      if (typeof current === 'string') {
        try { current = JSON.parse(current); continue; } catch { return []; }
      }
      if (current && typeof current === 'object') {
        const preferred = ['data','rows','records','items','drugs','barnat','Sheet1','sheet1'];
        const preferredKey = preferred.find(key => Array.isArray(current[key]) || typeof current[key] === 'string');
        if (preferredKey) { current = current[preferredKey]; continue; }
        const nested = Object.values(current).find(Array.isArray);
        if (nested) { current = nested; continue; }
      }
      return [];
    }

    const fields = [
      'Nr rendor','PDID','ProtocolNo','Emri tregtar','Substanca aktive','ATC Code',
      'Klasa / Çka është','Përdorimi (fjalë kyçe)','Fortësia','Forma farmaceutike',
      'Madhësia e paketimit','Si të shënohet në recetë','Bartësi i Autorizim Marketingut',
      'Prodhuesi','MA certifikata','Statusi','Çmimi me shumicë','Çmimi me marzhë',
      'TVSH','Çmimi me pakicë','Afati i vlefshmërisë',
    ];

    return current.map((row, index) => {
      if (Array.isArray(row)) return Object.fromEntries(fields.map((field, position) => [field, row[position] ?? '']));
      if (row && typeof row === 'object') return row.data && typeof row.data === 'object' ? row.data : row;
      return { 'Nr rendor':index + 1, 'Emri tregtar':clean(row) };
    });
  }

  async function readRegistryRows() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (Array.isArray(window.DRUG_DATA_PARTS) && window.DRUG_DATA_PARTS.length) {
        const encoded = window.DRUG_DATA_PARTS.join('');
        const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return normalizeRegistryRows(JSON.parse(await new Response(stream).text()));
      }
      const embedded = document.getElementById('drug-data');
      if (embedded?.textContent && embedded.textContent.trim() !== '[]') {
        return normalizeRegistryRows(JSON.parse(embedded.textContent));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Të dhënat e regjistrit nuk u gjetën.');
  }

  function addUnique(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, value);
    else map.set(key, null);
  }

  async function loadRegistry() {
    try {
      const rows = await readRegistryRows();
      const byNumber = new Map();
      const byDrugKey = new Map();
      rows.forEach(row => {
        const number = clean(row['Nr rendor']);
        if (number) byNumber.set(number, row);
        addUnique(byDrugKey, [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|'), row);
      });
      registry = { status:'ready', byNumber, byDrugKey };
    } catch (error) {
      console.error('Regjistri nuk u indeksua për dozimin:', error);
      registry = { status:'error', byNumber:new Map(), byDrugKey:new Map() };
    }
    scheduleEnhance();
  }

  function groupRegimens(regimens) {
    const grouped = new Map();
    (Array.isArray(regimens) ? regimens : []).forEach(regimen => {
      const key = clean(regimen.matchKey);
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(regimen);
    });
    return grouped;
  }

  function indexCards(cards) {
    const byKey = new Map();
    const byPdid = new Map();
    (Array.isArray(cards) ? cards : []).forEach(card => {
      const key = clean(card.cardKey);
      const pdid = clean(card.pdid);
      if (key) byKey.set(key, card);
      if (pdid) addUnique(byPdid, pdid, card);
    });
    return { byKey, byPdid };
  }

  async function loadClinicalData() {
    try {
      const response = await fetch(ENDPOINT, { cache:'no-store', credentials:'same-origin' });
      if (!response.ok) throw new Error(`Dozologjia nuk u ngarkua (${response.status}).`);
      const payload = await response.json();
      const cards = indexCards(payload.cards);
      clinical = {
        status:'ready',
        adult:groupRegimens(payload.adult),
        pediatric:groupRegimens(payload.pediatric),
        cardsByKey:cards.byKey,
        cardsByPdid:cards.byPdid,
      };
    } catch (error) {
      console.error('Dozologjia nuk u ngarkua:', error);
      clinical = {
        status:'error', adult:new Map(), pediatric:new Map(),
        cardsByKey:new Map(), cardsByPdid:new Map(),
      };
    }
    scheduleEnhance();
  }

  function headerIndex(label) {
    const headers = Array.from(document.querySelectorAll('#headerRow > th'));
    return headers.findIndex(header => clean(header.textContent).replace(/[▲▼↕]/g, '').trim() === label);
  }

  function registryRowForTableRow(tableRow) {
    const numberIndex = headerIndex('Nr');
    if (numberIndex >= 0) {
      const number = clean(tableRow.children[numberIndex]?.textContent);
      const row = registry.byNumber.get(number);
      if (row) return row;
    }
    const drugKey = clean(tableRow.querySelector('.drug-select')?.dataset.drugKey);
    return drugKey ? registry.byDrugKey.get(drugKey) || null : null;
  }

  function cardFor(row) {
    if (!row) return null;
    const key = [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|');
    return clinical.cardsByKey.get(key) || clinical.cardsByPdid.get(clean(row.PDID)) || null;
  }

  function dosageMatchKey(row) {
    const engine = window.MedIndexDosageEngine;
    if (!engine || !row) return '';
    return engine.buildMatchKey({
      atc:row['ATC Code'],
      substance:row['Substanca aktive'],
      form:row['Forma farmaceutike'],
      strength:row['Fortësia'],
    });
  }

  function formatAge(months) {
    if (!Number.isFinite(Number(months))) return '';
    const numeric = Number(months);
    if (numeric < 24) return `${numeric} muaj`;
    const years = numeric / 12;
    return Number.isInteger(years) ? `${years} vjeç` : `${years.toFixed(1)} vjeç`;
  }

  function pediatricDose(regimen) {
    if (clean(regimen.signatura)) return clean(regimen.signatura);
    const parts = [];
    if (Number.isFinite(regimen.fixedDoseMg)) parts.push(`${regimen.fixedDoseMg} mg për dozë`);
    else if (Number.isFinite(regimen.fixedVolumeMl)) parts.push(`${regimen.fixedVolumeMl} mL për dozë`);
    else if (Number.isFinite(regimen.mgPerKg)) {
      const daily = /dit|day/i.test(clean(regimen.basis));
      parts.push(`${regimen.mgPerKg} mg/kg/${daily ? 'ditë' : 'dozë'}`);
      if (daily && Number.isFinite(regimen.dosesPerDay)) parts.push(`e ndarë në ${regimen.dosesPerDay} doza`);
    }
    if (clean(regimen.frequency)) parts.push(clean(regimen.frequency));
    if (clean(regimen.duration)) parts.push(clean(regimen.duration));
    const minAge = formatAge(regimen.minAgeMonths);
    const maxAge = formatAge(regimen.maxAgeMonths);
    if (minAge || maxAge) parts.push(`Mosha: ${minAge || '—'}–${maxAge || 'pa kufi të sipërm'}`);
    return parts.join(' · ') || 'Doza pediatrike kërkon verifikim individual.';
  }

  function regimenDose(regimen, population) {
    if (population === 'pediatric') return pediatricDose(regimen);
    if (clean(regimen.signatura)) return clean(regimen.signatura);
    return [
      clean(regimen.unitCount) && clean(regimen.practicalUnit)
        ? `${clean(regimen.unitCount)} ${clean(regimen.practicalUnit)}`
        : clean(regimen.doseMg) ? `${clean(regimen.doseMg)} mg` : '',
      clean(regimen.frequency),
      clean(regimen.duration),
    ].filter(Boolean).join(' · ') || 'Doza kërkon verifikim individual.';
  }

  function dosageRow(dose, route, indication = '', sources = []) {
    const sourceText = (Array.isArray(sources) ? sources : []).map(clean).filter(Boolean).join(' · ');
    const title = sourceText ? ` title="Burimet e verifikuara: ${escapeHtml(sourceText)}"` : '';
    return `<div class="registry-dosage-grid registry-dosage-regimen"${title}>` +
      `<div>${indication ? `<span class="registry-dosage-indication">${escapeHtml(indication)}</span>` : ''}${escapeHtml(dose)}</div>` +
      `<div class="registry-dosage-route">${escapeHtml(route || '—')}</div>` +
      `</div>`;
  }

  function cellContent(row, card, population, emptyText) {
    if (clinical.status === 'loading') return '<span class="registry-dosage-muted">Duke e ngarkuar dozimin…</span>';
    if (clinical.status === 'error') return '<span class="registry-dosage-muted">Dozimi nuk u ngarkua.</span>';

    if (card) {
      const dose = clean(population === 'adult' ? card.adultDose : card.pediatricDose);
      const route = clean(population === 'adult' ? card.adultRoute : card.pediatricRoute);
      if (dose) return dosageRow(dose, route, '', card.sourceUrls);
    }

    const matchKey = dosageMatchKey(row);
    const regimens = matchKey ? clinical[population].get(matchKey) || [] : [];
    if (!regimens.length) return `<span class="registry-dosage-muted">${escapeHtml(emptyText)}</span>`;
    if (regimens.length === 1) {
      const regimen = regimens[0];
      return dosageRow(regimenDose(regimen, population), regimen.route, regimen.indication, [regimen.sourceUrl]);
    }
    return `<details class="registry-dosage-details"><summary>${regimens.length} skema sipas indikacionit</summary>` +
      regimens.map(regimen => dosageRow(regimenDose(regimen, population), regimen.route, regimen.indication, [regimen.sourceUrl])).join('') +
      '</details>';
  }

  function createDosageCell(column, row, card) {
    const cell = document.createElement('td');
    cell.className = `registry-dosage-column registry-dosage-${column.key}`;
    cell.dataset.registryDosageColumn = column.key;
    if (registry.status === 'loading') cell.innerHTML = '<span class="registry-dosage-muted">Duke e lidhur me barin…</span>';
    else if (!row) cell.innerHTML = '<span class="registry-dosage-muted">Bari nuk u identifikua në mënyrë unike.</span>';
    else cell.innerHTML = cellContent(row, card, column.key, column.empty);
    return cell;
  }

  function overlayCell(tableRow, label, value, card) {
    if (!clean(value)) return;
    const index = headerIndex(label);
    const cell = index >= 0 ? tableRow.children[index] : null;
    if (!cell) return;
    cell.textContent = clean(value);
    cell.title = clean(value);
    cell.dataset.registryCardOverlay = clean(card?.pdid || 'verified');
  }

  function applyCardOverlay(tableRow, card) {
    if (!card) return;
    overlayCell(tableRow, 'Klasa / Çka është', card.drugClass, card);
    overlayCell(tableRow, 'Përdorimi / fjalë kyçe', card.use, card);
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
      th.innerHTML = `${escapeHtml(column.label)}<span class="registry-dosage-subhead">Doza e plotë&nbsp;&nbsp;|&nbsp;&nbsp;Rruga</span>`;
      header.appendChild(th);
    });
  }

  function ensureRows() {
    document.querySelectorAll('#tbody > tr').forEach(tableRow => {
      if (tableRow.querySelector('.empty-state')) {
        const emptyCell = tableRow.querySelector('td');
        if (emptyCell) emptyCell.colSpan = document.querySelectorAll('#headerRow > th').length || Number(emptyCell.colSpan || 1);
        return;
      }
      const row = registryRowForTableRow(tableRow);
      const card = cardFor(row);
      applyCardOverlay(tableRow, card);
      COLUMNS.forEach(column => {
        const matches = Array.from(tableRow.querySelectorAll(columnSelector(column.key)));
        matches.slice(1).forEach(node => node.remove());
        if (!matches[0]) tableRow.appendChild(createDosageCell(column, row, card));
      });
    });
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
        group.appendChild(heading);
        COLUMNS.forEach(column => group.appendChild(pickerLabel(column)));
        const actions = panel.querySelector('.col-panel-actions');
        actions?.insertAdjacentElement('afterend', group) || panel.prepend(group);
      }
      bindPickerActions(panel);
    } finally {
      pickerSyncing = false;
    }
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      ensureHeader();
      ensureRows();
      ensurePicker();
      applyVisibility();
    } finally {
      enhancing = false;
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

  const tableObserver = new MutationObserver(() => {
    if (!enhancing) scheduleEnhance();
  });
  const panelObserver = new MutationObserver(() => {
    if (!pickerSyncing) requestAnimationFrame(ensurePicker);
  });

  function startObservers() {
    const table = document.getElementById('dataTable');
    const panel = document.getElementById('colPanel');
    if (table) tableObserver.observe(table, { childList:true, subtree:true });
    if (panel) panelObserver.observe(panel, { childList:true });
    document.getElementById('colPickerBtn')?.addEventListener('click', () => requestAnimationFrame(ensurePicker));
  }

  applyVisibility();
  startObservers();
  scheduleEnhance();
  void loadRegistry();
  void loadClinicalData();
})();