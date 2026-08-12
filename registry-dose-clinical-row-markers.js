(() => {
  'use strict';

  const VERSION = 'dose-clinical-row-markers-v4-approved-population-column';
  const ROW_SELECTOR = '#tbody > tr';
  const EMPTY_SELECTOR = '.empty-state';
  const FORM_CELL_SELECTOR = '[data-registry-column-key="form"]';
  const ROUTE_SELECTOR = '.registry-dosage-route';
  const POPULATION_ENDPOINT = '/api/pediatric-only-population';
  const FRAME_BUDGET_MS = 6;
  const IDLE_TIMEOUT_MS = 120;
  const PARENTERAL_PATTERN = /(?:^|\b)(?:parenteral|intraven|intramusk|subkutan|subcutan|injeksion|injection|injectable|infuzion|infusion|ampul|ampoule|vial|i\.?\s*v\.?|i\.?\s*m\.?|s\.?\s*c\.?)(?:\b|$)/i;
  const APPROVED_POPULATIONS = new Set(['Adult only', 'Pediatric only', 'Pediatric and adult both']);

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const pendingRows = new Set();
  const pediatricOnlyRegistryNumbers = new Set();
  const approvedPopulationByRegistryNumber = new Map();
  let scheduled = false;
  let tbodyObserver = null;
  let headerObserver = null;
  let cachedFormIndex = -1;
  let populationRequest = null;
  let populationReady = false;
  let processedRows = 0;
  let queueRuns = 0;
  let maxRunMs = 0;

  function isRealRow(row) {
    return row instanceof HTMLTableRowElement && !row.querySelector(EMPTY_SELECTOR);
  }

  function formColumnIndex() {
    if (cachedFormIndex >= 0) return cachedFormIndex;
    const headers = Array.from(document.querySelectorAll('#headerRow > th'));
    cachedFormIndex = headers.findIndex(header => {
      if (header.dataset.registryColumnKey === 'form') return true;
      const label = normalize(header.dataset.label || header.textContent);
      return label.includes('forma farmaceutike') || label === 'forma';
    });
    return cachedFormIndex;
  }

  function formText(row) {
    const stamped = row.querySelector(FORM_CELL_SELECTOR);
    if (stamped) return clean(stamped.textContent);
    const index = formColumnIndex();
    return index >= 0 ? clean(row.children[index]?.textContent) : '';
  }

  function routeText(row) {
    return Array.from(row.querySelectorAll(ROUTE_SELECTOR))
      .map(node => clean(node.textContent))
      .filter(Boolean)
      .join(' ');
  }

  function patientGroup(row) {
    if (row.querySelector('.dose-calculator-group-pediatric_only')) return 'pediatric_only';
    if (row.querySelector('.dose-calculator-group-adult_only')) return 'adult_only';
    if (row.querySelector('.dose-calculator-group-pediatric_and_adult')) return 'pediatric_and_adult';
    return '';
  }

  function registryNumber(row) {
    const stamped = Number(row?.dataset?.registryNumber);
    if (Number.isInteger(stamped) && stamped > 0) return stamped;

    const numberCell = row?.querySelector('[data-registry-column-key="number"]');
    const fromCell = Number(clean(numberCell?.textContent).replace(/[^0-9]/g, ''));
    if (Number.isInteger(fromCell) && fromCell > 0) return fromCell;

    const drugKey = clean(row?.querySelector('.drug-select')?.dataset?.drugKey);
    if (!drugKey || !Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) return 0;
    const raw = window.MEDINDEX_REGISTRY_ROWS.find(item => {
      const key = [item?.PDID, item?.['Emri tregtar'], item?.Fortësia].map(clean).join('|');
      return key === drugKey;
    });
    const fromRaw = Number(raw?.['Nr rendor']);
    return Number.isInteger(fromRaw) && fromRaw > 0 ? fromRaw : 0;
  }

  function rawRowByRegistryNumber(number) {
    if (!Number.isInteger(number) || number <= 0 || !Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) return null;
    return window.MEDINDEX_REGISTRY_ROWS.find(item => Number(item?.['Nr rendor']) === number) || null;
  }

  function approvedPopulationForRow(row) {
    const number = registryNumber(row);
    if (!number) return '';
    const fromApi = approvedPopulationByRegistryNumber.get(number);
    if (APPROVED_POPULATIONS.has(fromApi)) return fromApi;
    const fromRegistry = clean(rawRowByRegistryNumber(number)?.['Popullata e aprovuar']);
    return APPROVED_POPULATIONS.has(fromRegistry) ? fromRegistry : '';
  }

  function approvedPediatricOnly(row) {
    return approvedPopulationForRow(row) === 'Pediatric only';
  }

  function applyPopulationToRegistryRows() {
    const rows = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
    let changed = 0;
    rows.forEach(item => {
      const number = Number(item?.['Nr rendor']);
      if (!Number.isInteger(number) || number <= 0) return;

      const approvedPopulation = approvedPopulationByRegistryNumber.get(number);
      if (APPROVED_POPULATIONS.has(approvedPopulation) && item['Popullata e aprovuar'] !== approvedPopulation) {
        item['Popullata e aprovuar'] = approvedPopulation;
        changed += 1;
      }

      const pediatricOnly = approvedPopulation === 'Pediatric only'
        || clean(item['Popullata e aprovuar']) === 'Pediatric only'
        || pediatricOnlyRegistryNumbers.has(number);
      const legacyValue = pediatricOnly ? 'Pediatric only' : '';
      if (item['Pediatric only'] !== legacyValue) {
        item['Pediatric only'] = legacyValue;
        changed += 1;
      }
    });
    window.MEDINDEX_PEDIATRIC_ONLY_REGISTRY_NUMBERS = Object.freeze([...pediatricOnlyRegistryNumbers].sort((a, b) => a - b));
    window.MEDINDEX_APPROVED_POPULATION = Object.freeze(Object.fromEntries(
      [...approvedPopulationByRegistryNumber.entries()].sort((left, right) => left[0] - right[0])
    ));
    return changed;
  }

  function announcePopulationReady(reason = 'loaded') {
    const changed = applyPopulationToRegistryRows();
    document.documentElement.dataset.pediatricOnlyPopulationMarkers = String(pediatricOnlyRegistryNumbers.size);
    document.documentElement.dataset.approvedPopulationMarkers = String(approvedPopulationByRegistryNumber.size);
    window.dispatchEvent(new CustomEvent('medindex:pediatric-only-population-ready', {
      detail:{
        count:pediatricOnlyRegistryNumbers.size,
        classifiedCount:approvedPopulationByRegistryNumber.size,
        changed,
        reason,
      },
    }));
    if (changed) window.MEDINDEX_REFRESH_REGISTRY?.();
  }

  function isParenteral(row) {
    return PARENTERAL_PATTERN.test(normalize(`${formText(row)} ${routeText(row)}`));
  }

  function updateAccessibleLabel(row, group, parenteral) {
    const button = row.querySelector('.dose-calculator-open');
    if (!(button instanceof HTMLButtonElement)) return;
    const details = ['Kalkulo dozën'];
    if (group === 'pediatric_only') details.push('bar vetëm për fëmijë');
    else if (group === 'adult_only') details.push('bar vetëm për të rritur');
    if (parenteral) details.push('administrim parenteral');
    button.setAttribute('aria-label', details.join('. '));
  }

  function classifyRow(row) {
    if (!isRealRow(row)) return;
    const calculatorGroup = patientGroup(row);
    const approvedPopulation = approvedPopulationForRow(row);
    const explicitPediatricOnly = approvedPopulation === 'Pediatric only';
    const group = explicitPediatricOnly ? 'pediatric_only' : calculatorGroup;
    const pediatricOnly = group === 'pediatric_only';
    const parenteral = isParenteral(row);
    const signature = `${VERSION}|${populationReady ? 'population-ready' : 'population-loading'}|${approvedPopulation || group}|${parenteral ? 'parenteral' : 'other'}|${normalize(formText(row))}|${normalize(routeText(row))}`;
    if (row.dataset.doseClinicalSignature === signature) return;

    row.dataset.doseClinicalSignature = signature;
    row.dataset.dosePatientGroup = group || 'unverified';
    row.dataset.doseAdministration = parenteral ? 'parenteral' : 'non-parenteral';
    if (approvedPopulation) row.dataset.approvedPopulation = normalize(approvedPopulation).replace(/\s+/g, '_');
    else delete row.dataset.approvedPopulation;

    row.classList.toggle('mi-dose-row--pediatric-only', pediatricOnly);
    row.classList.toggle('mi-population-row--pediatric-only', explicitPediatricOnly);
    row.classList.toggle('mi-dose-row--parenteral', parenteral);
    row.classList.toggle('mi-dose-row--pediatric-parenteral', pediatricOnly && parenteral);
    updateAccessibleLabel(row, group, parenteral);
    processedRows += 1;
  }

  function enqueue(row) {
    if (!isRealRow(row)) return;
    pendingRows.add(row);
    schedule();
  }

  function enqueueFromNode(node) {
    if (!(node instanceof Element)) return;
    const ownRow = node.matches(ROW_SELECTOR) ? node : node.closest(ROW_SELECTOR);
    if (ownRow) enqueue(ownRow);
    node.querySelectorAll?.(ROW_SELECTOR).forEach(enqueue);
  }

  function processQueue(deadline) {
    scheduled = false;
    queueRuns += 1;
    const startedAt = performance.now();
    while (pendingRows.size) {
      const row = pendingRows.values().next().value;
      pendingRows.delete(row);
      classifyRow(row);
      const elapsed = performance.now() - startedAt;
      const remaining = typeof deadline?.timeRemaining === 'function' ? deadline.timeRemaining() : 0;
      if (elapsed >= FRAME_BUDGET_MS && remaining < 2) break;
    }
    maxRunMs = Math.max(maxRunMs, performance.now() - startedAt);
    if (pendingRows.size) schedule();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(processQueue, { timeout:IDLE_TIMEOUT_MS });
    } else {
      window.requestAnimationFrame(() => processQueue(null));
    }
  }

  function scan() {
    document.querySelectorAll(ROW_SELECTOR).forEach(enqueue);
  }

  function applyPopulationMetadata(payload) {
    approvedPopulationByRegistryNumber.clear();
    pediatricOnlyRegistryNumbers.clear();

    (Array.isArray(payload?.items) ? payload.items : []).forEach(item => {
      const registryNumber = Number(item?.registryNumber);
      const approvedPopulation = clean(item?.approvedPopulation);
      if (!Number.isInteger(registryNumber) || registryNumber <= 0 || !APPROVED_POPULATIONS.has(approvedPopulation)) return;
      approvedPopulationByRegistryNumber.set(registryNumber, approvedPopulation);
      if (approvedPopulation === 'Pediatric only') pediatricOnlyRegistryNumbers.add(registryNumber);
    });

    (Array.isArray(payload?.registryNumbers) ? payload.registryNumbers : []).forEach(value => {
      const number = Number(value);
      if (!Number.isInteger(number) || number <= 0) return;
      pediatricOnlyRegistryNumbers.add(number);
      if (!approvedPopulationByRegistryNumber.has(number)) {
        approvedPopulationByRegistryNumber.set(number, 'Pediatric only');
      }
    });
  }

  async function loadApprovedPopulation() {
    if (populationRequest) return populationRequest;
    populationRequest = fetch(POPULATION_ENDPOINT, {
      method:'GET',
      credentials:'same-origin',
      headers:{ Accept:'application/json' },
      cache:'no-cache',
    }).then(async response => {
      if (!response.ok) throw new Error(`population marker ${response.status}`);
      const payload = await response.json();
      applyPopulationMetadata(payload);
      populationReady = true;
      announcePopulationReady('api');
      scan();
      return approvedPopulationByRegistryNumber;
    }).catch(error => {
      populationReady = false;
      document.documentElement.dataset.pediatricOnlyPopulationMarkers = 'error';
      document.documentElement.dataset.approvedPopulationMarkers = 'error';
      console.warn('Approved-population row markers were not loaded:', error);
      return approvedPopulationByRegistryNumber;
    });
    return populationRequest;
  }

  function observe() {
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');
    if (tbody && !tbodyObserver) {
      tbodyObserver = new MutationObserver(records => {
        records.forEach(record => {
          record.addedNodes.forEach(enqueueFromNode);
          if (record.target instanceof Element) enqueueFromNode(record.target);
        });
      });
      tbodyObserver.observe(tbody, { childList:true, subtree:true });
    }
    if (header && !headerObserver) {
      headerObserver = new MutationObserver(() => {
        cachedFormIndex = -1;
        scan();
      });
      headerObserver.observe(header, { childList:true });
    }
  }

  function onRegistryDataReady() {
    if (populationReady) announcePopulationReady('registry-data-ready');
    scan();
  }

  function start() {
    observe();
    scan();
    loadApprovedPopulation();
    document.documentElement.dataset.doseClinicalRowMarkers = VERSION;
    window.addEventListener('medindex:registry-data-ready', onRegistryDataReady);
    [
      'medindex:registry-ready',
      'medindex:registry-dosage-ready',
      'medindex:registry-table-stable',
    ].forEach(name => window.addEventListener(name, scan));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }

  window.MedIndexDoseClinicalRowMarkers = Object.freeze({
    version:VERSION,
    refresh:scan,
    refreshPopulation:loadApprovedPopulation,
    applyToRegistryRows:applyPopulationToRegistryRows,
    isPediatricOnly:number => pediatricOnlyRegistryNumbers.has(Number(number)),
    approvedPopulation:number => approvedPopulationByRegistryNumber.get(Number(number)) || '',
    metrics:() => Object.freeze({
      pendingRows:pendingRows.size,
      processedRows,
      queueRuns,
      maxRunMs:Number(maxRunMs.toFixed(2)),
      pediatricOnlyRegistryNumbers:pediatricOnlyRegistryNumbers.size,
      approvedPopulationRegistryNumbers:approvedPopulationByRegistryNumber.size,
      populationReady,
    }),
  });
})();
