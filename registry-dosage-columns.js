(() => {
  'use strict';

  const DOSAGE_ENDPOINT = '/api/dosage';
  const VISIBILITY_KEY = 'medindex-registry-dosage-columns-v1';
  const COLUMN_DEFS = [
    { key: 'adult', label: '1. Dozimi për të rritur', empty: 'Nuk ka dozë të verifikuar për të rritur.' },
    { key: 'pediatric', label: '2. Dozimi për fëmijë', empty: 'Nuk ka dozë pediatrike të verifikuar.' },
  ];

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);

  const visibility = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VISIBILITY_KEY) || '{}');
      return {
        adult: saved.adult !== false,
        pediatric: saved.pediatric !== false,
      };
    } catch {
      return { adult: true, pediatric: true };
    }
  })();

  let dosageState = { status: 'loading', adult: new Map(), pediatric: new Map(), error: '' };
  let registryState = { status: 'loading', byNumber: new Map(), byDrugKey: new Map(), error: '' };
  let enhanceTimer = 0;
  let enhancing = false;

  function invalidateDosageCells() {
    document.querySelectorAll('#tbody [data-registry-dosage-column]').forEach(cell => cell.remove());
  }

  function saveVisibility() {
    try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibility)); } catch {}
  }

  function columnClass(key) {
    return `registry-dosage-column registry-dosage-${key}`;
  }

  function applyVisibility() {
    COLUMN_DEFS.forEach(column => {
      document.documentElement.classList.toggle(`hide-registry-dosage-${column.key}`, !visibility[column.key]);
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
        const preferred = ['data', 'rows', 'records', 'items', 'drugs', 'barnat', 'Sheet1', 'sheet1'];
        const key = preferred.find(name => Array.isArray(current[name]) || typeof current[name] === 'string');
        if (key) { current = current[key]; continue; }
        const nested = Object.values(current).find(Array.isArray);
        if (nested) { current = nested; continue; }
      }
      return [];
    }

    const fields = [
      'Nr rendor', 'PDID', 'ProtocolNo', 'Emri tregtar', 'Substanca aktive', 'ATC Code',
      'Klasa / Çka është', 'Përdorimi (fjalë kyçe)', 'Fortësia', 'Forma farmaceutike',
      'Madhësia e paketimit', 'Si të shënohet në recetë', 'Bartësi i Autorizim Marketingut',
      'Prodhuesi', 'MA certifikata', 'Statusi', 'Çmimi me shumicë', 'Çmimi me marzhë',
      'TVSH', 'Çmimi me pakicë', 'Afati i vlefshmërisë',
    ];

    return current.map((row, index) => {
      if (Array.isArray(row)) {
        return Object.fromEntries(fields.map((field, fieldIndex) => [field, row[fieldIndex] ?? '']));
      }
      if (row && typeof row === 'object') return row.data && typeof row.data === 'object' ? row.data : row;
      return { 'Nr rendor': index + 1, 'Emri tregtar': clean(row) };
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

  function addUniqueIndex(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, value);
    else map.set(key, null);
  }

  async function loadRegistryIndex() {
    try {
      const rows = await readRegistryRows();
      const byNumber = new Map();
      const byDrugKey = new Map();
      rows.forEach(row => {
        const number = clean(row['Nr rendor']);
        if (number) byNumber.set(number, row);
        const drugKey = [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|');
        addUniqueIndex(byDrugKey, drugKey, row);
      });
      registryState = { status: 'ready', byNumber, byDrugKey, error: '' };
    } catch (error) {
      console.error('Regjistri nuk u indeksua për dozimin:', error);
      registryState = { status: 'error', byNumber: new Map(), byDrugKey: new Map(), error: error.message || 'Gabim në regjistër.' };
    }
    invalidateDosageCells();
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

  async function loadDosageData() {
    try {
      const response = await fetch(DOSAGE_ENDPOINT, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Dozologjia nuk u ngarkua (${response.status}).`);
      const payload = await response.json();
      dosageState = {
        status: 'ready',
        adult: groupRegimens(payload.adult),
        pediatric: groupRegimens(payload.pediatric),
        error: '',
      };
    } catch (error) {
      console.error('Dozologjia nuk u ngarkua:', error);
      dosageState = { status: 'error', adult: new Map(), pediatric: new Map(), error: error.message || 'Gabim në dozologji.' };
    }
    invalidateDosageCells();
    scheduleEnhance();
  }

  function dosageMatchKey(row) {
    const engine = window.MedIndexDosageEngine;
    if (!engine || !row) return '';
    return engine.buildMatchKey({
      atc: row['ATC Code'],
      substance: row['Substanca aktive'],
      form: row['Forma farmaceutike'],
      strength: row['Fortësia'],
    });
  }

  function formatAge(months) {
    if (!Number.isFinite(Number(months))) return '';
    const numeric = Number(months);
    if (numeric < 24) return `${numeric} muaj`;
    const years = numeric / 12;
    return Number.isInteger(years) ? `${years} vjeç` : `${years.toFixed(1)} vjeç`;
  }

  function pediatricRule(regimen) {
    if (clean(regimen.signatura)) return clean(regimen.signatura);
    const parts = [];
    if (Number.isFinite(regimen.fixedDoseMg)) parts.push(`${regimen.fixedDoseMg} mg për dozë`);
    else if (Number.isFinite(regimen.fixedVolumeMl)) parts.push(`${regimen.fixedVolumeMl} mL për dozë`);
    else if (Number.isFinite(regimen.mgPerKg)) {
      const isDaily = /dit|day/i.test(clean(regimen.basis));
      parts.push(`${regimen.mgPerKg} mg/kg/${isDaily ? 'ditë' : 'dozë'}`);
      if (isDaily && Number.isFinite(regimen.dosesPerDay)) parts.push(`e ndarë në ${regimen.dosesPerDay} doza`);
    }
    if (clean(regimen.frequency)) parts.push(clean(regimen.frequency));
    if (clean(regimen.duration)) parts.push(clean(regimen.duration));

    const ageMin = formatAge(regimen.minAgeMonths);
    const ageMax = formatAge(regimen.maxAgeMonths);
    if (ageMin || ageMax) parts.push(`Mosha: ${ageMin || '—'}–${ageMax || 'pa kufi të sipërm'}`);
    const weightMin = Number.isFinite(regimen.minWeightKg) ? `${regimen.minWeightKg} kg` : '';
    const weightMax = Number.isFinite(regimen.maxWeightKg) ? `${regimen.maxWeightKg} kg` : '';
    if (weightMin || weightMax) parts.push(`Pesha: ${weightMin || '—'}–${weightMax || 'pa kufi të sipërm'}`);
    return parts.join(' · ') || 'Doza pediatrike kërkon verifikim individual.';
  }

  function fullDose(regimen, population) {
    if (population === 'pediatric') return pediatricRule(regimen);
    if (clean(regimen.signatura)) return clean(regimen.signatura);
    return [
      clean(regimen.unitCount) && clean(regimen.practicalUnit) ? `${clean(regimen.unitCount)} ${clean(regimen.practicalUnit)}` : clean(regimen.doseMg) ? `${clean(regimen.doseMg)} mg` : '',
      clean(regimen.frequency),
      clean(regimen.duration),
    ].filter(Boolean).join(' · ') || 'Doza kërkon verifikim individual.';
  }

  function regimenRow(regimen, population) {
    const source = clean(regimen.sourceUrl);
    const indication = clean(regimen.indication);
    const dose = fullDose(regimen, population);
    const sourceAttribute = source ? ` data-source-url="${escapeHtml(source)}" title="Burimi i verifikuar: ${escapeHtml(source)}"` : '';
    return `<div class="registry-dosage-grid registry-dosage-regimen"${sourceAttribute}>` +
      `<div><span class="registry-dosage-indication">${escapeHtml(indication || 'Skemë e verifikuar')}</span>${escapeHtml(dose)}</div>` +
      `<div class="registry-dosage-route">${escapeHtml(regimen.route || '—')}</div>` +
      `</div>`;
  }

  function dosageContent(regimens, population, emptyText) {
    if (dosageState.status === 'loading') return '<span class="registry-dosage-muted">Duke e ngarkuar dozimin…</span>';
    if (dosageState.status === 'error') return '<span class="registry-dosage-muted">Dozimi nuk u ngarkua.</span>';
    if (!Array.isArray(regimens) || !regimens.length) return `<span class="registry-dosage-muted">${escapeHtml(emptyText)}</span>`;

    if (regimens.length === 1) return regimenRow(regimens[0], population);
    return `<details class="registry-dosage-details"><summary>${regimens.length} skema sipas indikacionit</summary>${regimens.map(item => regimenRow(item, population)).join('')}</details>`;
  }

  function createDosageCell(column, row) {
    const cell = document.createElement('td');
    cell.className = columnClass(column.key);
    cell.dataset.registryDosageColumn = column.key;

    if (registryState.status === 'loading') {
      cell.innerHTML = '<span class="registry-dosage-muted">Duke e lidhur me barin…</span>';
      return cell;
    }
    if (!row) {
      cell.innerHTML = '<span class="registry-dosage-muted">Bari nuk u identifikua në mënyrë unike.</span>';
      return cell;
    }

    const matchKey = dosageMatchKey(row);
    const regimens = matchKey ? dosageState[column.key].get(matchKey) || [] : [];
    cell.innerHTML = dosageContent(regimens, column.key, column.empty);
    return cell;
  }

  function headerIndex(label) {
    const headers = Array.from(document.querySelectorAll('#headerRow > th'));
    return headers.findIndex(header => clean(header.textContent).replace(/[▲▼↕]/g, '').trim() === label);
  }

  function registryRowForTableRow(tableRow) {
    const numberIndex = headerIndex('Nr');
    if (numberIndex >= 0) {
      const number = clean(tableRow.children[numberIndex]?.textContent);
      const row = registryState.byNumber.get(number);
      if (row) return row;
    }
    const drugKey = clean(tableRow.querySelector('.drug-select')?.dataset.drugKey);
    return drugKey ? registryState.byDrugKey.get(drugKey) || null : null;
  }

  function enhanceHeader() {
    const header = document.getElementById('headerRow');
    if (!header) return;
    COLUMN_DEFS.forEach(column => {
      if (header.querySelector(`[data-registry-dosage-column="${column.key}"]`)) return;
      const th = document.createElement('th');
      th.className = columnClass(column.key);
      th.dataset.registryDosageColumn = column.key;
      th.innerHTML = `${escapeHtml(column.label)}<span class="registry-dosage-subhead">Doza e plotë&nbsp;&nbsp;|&nbsp;&nbsp;Rruga</span>`;
      header.appendChild(th);
    });
  }

  function enhanceRows() {
    const rows = document.querySelectorAll('#tbody > tr');
    rows.forEach(tableRow => {
      if (tableRow.querySelector('.empty-state')) {
        const emptyCell = tableRow.querySelector('td');
        if (emptyCell) emptyCell.colSpan = document.querySelectorAll('#headerRow > th').length || Number(emptyCell.colSpan || 1);
        return;
      }
      const registryRow = registryRowForTableRow(tableRow);
      COLUMN_DEFS.forEach(column => {
        const existing = tableRow.querySelector(`[data-registry-dosage-column="${column.key}"]`);
        if (!existing) tableRow.appendChild(createDosageCell(column, registryRow));
      });
    });
  }

  function appendColumnPickerItems() {
    const panel = document.getElementById('colPanel');
    if (!panel) return;
    COLUMN_DEFS.forEach(column => {
      if (panel.querySelector(`[data-registry-dosage-picker="${column.key}"]`)) return;
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
      panel.appendChild(label);
    });

    const buttons = panel.querySelectorAll('.col-panel-actions button');
    if (buttons[0] && !buttons[0].dataset.registryDosageBound) {
      buttons[0].dataset.registryDosageBound = '1';
      buttons[0].addEventListener('click', () => {
        COLUMN_DEFS.forEach(column => { visibility[column.key] = true; });
        saveVisibility();
        applyVisibility();
        setTimeout(appendColumnPickerItems, 0);
      });
    }
    if (buttons[1] && !buttons[1].dataset.registryDosageBound) {
      buttons[1].dataset.registryDosageBound = '1';
      buttons[1].addEventListener('click', () => {
        COLUMN_DEFS.forEach(column => { visibility[column.key] = false; });
        saveVisibility();
        applyVisibility();
        setTimeout(appendColumnPickerItems, 0);
      });
    }
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      enhanceHeader();
      enhanceRows();
      appendColumnPickerItems();
      applyVisibility();
    } finally {
      enhancing = false;
    }
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhance, 40);
  }

  const observer = new MutationObserver(mutations => {
    if (enhancing) return;
    if (mutations.some(mutation => mutation.target.closest?.('#dataTable, #colPanel') || mutation.target.id === 'dataTable' || mutation.target.id === 'colPanel')) {
      scheduleEnhance();
    }
  });

  applyVisibility();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleEnhance();
  void loadRegistryIndex();
  void loadDosageData();
})();