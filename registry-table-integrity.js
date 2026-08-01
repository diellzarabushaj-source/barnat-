(() => {
  'use strict';

  const VERSION = 'registry-table-integrity-v4';
  const STYLE_VERSION = '20260801-4';
  const PROBE_KEY = 'registry-number-probe';
  const DYNAMIC_ORDER = Object.freeze([
    '[data-clinical-editor-column="clinical-status"]',
    '[data-clinical-editor-column="clinical-action"]',
    '[data-registry-dosage-column="adult"]',
    '[data-registry-dosage-column="pediatric"]',
    '[data-registry-number-probe]',
  ]);
  const LABEL_KEYS = Object.freeze({
    perrecete:'select', nr:'number', emritregtar:'trade-name', substancaaktive:'active-substance',
    atc:'atc', atccode:'atc', klasackaeshte:'drug-class', perdorimifjalekyce:'use',
    pdid:'pdid', protokolli:'protocol', fortesia:'strength', forma:'form', formafarmaceutike:'form',
    sishenohetnerecete:'prescription-label', paketimi:'packaging', bartesiiautorizimit:'mah',
    prodhuesi:'manufacturer', certifikatama:'ma-certificate', statusi:'status',
    cmshumice:'wholesale-price', cmmarzhe:'margin-price', tvsh:'vat', cmpakice:'retail-price',
    afati:'validity', verifikimi:'clinical-status', redakto:'clinical-action',
  });
  const WIDTHS = Object.freeze({
    select:52, number:74, 'trade-name':270, 'active-substance':246, atc:96,
    'drug-class':240, use:270, pdid:108, protocol:130, strength:126, form:244,
    'prescription-label':270, packaging:180, mah:220, manufacturer:210,
    'ma-certificate':150, status:128, 'wholesale-price':126, 'margin-price':126,
    vat:92, 'retail-price':126, validity:150, 'clinical-status':184,
    'clinical-action':92, 'dosage-adult':292, 'dosage-pediatric':292, [PROBE_KEY]:0,
  });

  let observer = null;
  let resizeObserver = null;
  let headObserver = null;
  let scheduled = false;
  let enforcing = false;
  let numberIndex = new Map();
  let numberIndexSource = null;
  let lastLayoutSignature = '';
  let lastAuditSignature = '';
  let dosageDialog = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .replace(/[▲▼↕]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');

  function observeHead() {
    if (!document.head) return;
    if (!headObserver) {
      headObserver = new MutationObserver(() => {
        const link = document.querySelector('link[data-registry-table-integrity-css]');
        if (link && document.head.lastElementChild !== link) requestAnimationFrame(promoteStylesheet);
      });
    }
    headObserver.observe(document.head, { childList:true });
  }

  function promoteStylesheet() {
    headObserver?.disconnect();
    let link = document.querySelector('link[data-registry-table-integrity-css]');
    if (!link) {
      link = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .find(node => /registry-table-integrity\.css/i.test(node.getAttribute('href') || ''));
    }
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
    }
    link.dataset.registryTableIntegrityCss = '1';
    const href = `registry-table-integrity.css?v=${STYLE_VERSION}`;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
    observeHead();
  }

  function directMatches(container, selector) {
    return Array.from(container?.children || []).filter(node => node.matches?.(selector));
  }

  function sameNodes(left, right) {
    return left.length === right.length && left.every((node, index) => node === right[index]);
  }

  function canonicalizeDynamic(container) {
    if (!container) return false;
    const ordered = [];
    DYNAMIC_ORDER.forEach(selector => {
      const matches = directMatches(container, selector);
      matches.slice(1).forEach(node => node.remove());
      if (matches[0]) ordered.push(matches[0]);
    });
    const current = Array.from(container.children);
    const dynamic = new Set(ordered);
    const desired = current.filter(node => !dynamic.has(node)).concat(ordered);
    if (sameNodes(current, desired)) return false;
    container.replaceChildren(...desired);
    return true;
  }

  function keyForCell(cell, index = 0) {
    if (!cell) return `column-${index}`;
    if (cell.hasAttribute('data-registry-number-probe')) return PROBE_KEY;
    if (cell.dataset.registryDosageColumn === 'adult') return 'dosage-adult';
    if (cell.dataset.registryDosageColumn === 'pediatric') return 'dosage-pediatric';
    if (cell.dataset.clinicalEditorColumn === 'clinical-status') return 'clinical-status';
    if (cell.dataset.clinicalEditorColumn === 'clinical-action') return 'clinical-action';
    if (cell.classList.contains('select-col')) return 'select';
    const token = normalize(cell.dataset.label || cell.textContent || '');
    if (LABEL_KEYS[token]) return LABEL_KEYS[token];
    if (cell.classList.contains('price')) return `price-${index}`;
    if (cell.classList.contains('code')) return `code-${index}`;
    if (cell.classList.contains('wrap')) return `wrap-${index}`;
    return `column-${index}`;
  }

  function widthFor(cell, key) {
    if (Object.hasOwn(WIDTHS, key)) return WIDTHS[key];
    if (cell?.classList.contains('price')) return 126;
    if (cell?.classList.contains('code')) return 118;
    if (cell?.classList.contains('wrap')) return 230;
    return 184;
  }

  function refreshNumberIndex() {
    const source = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
    if (numberIndexSource === source && numberIndex.size) return;
    const next = new Map();
    source.forEach(row => {
      const key = [row?.PDID, row?.['Emri tregtar'], row?.['Fortësia']].map(clean).join('|');
      const number = Number(row?.['Nr rendor']);
      if (key && Number.isInteger(number) && number > 0 && !next.has(key)) next.set(key, number);
    });
    numberIndex = next;
    numberIndexSource = source;
  }

  function registryNumberForRow(row) {
    const existing = Number(row?.dataset?.registryNumber);
    if (Number.isInteger(existing) && existing > 0) return existing;
    const probe = Number(clean(row?.querySelector('[data-registry-number-probe]')?.textContent));
    if (Number.isInteger(probe) && probe > 0) return probe;
    refreshNumberIndex();
    const key = clean(row?.querySelector('.drug-select')?.dataset?.drugKey);
    const value = Number(numberIndex.get(key));
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function makeHeaderCell(kind) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    if (kind === 'clinical-status') {
      cell.dataset.clinicalEditorColumn = 'clinical-status';
      cell.className = 'clinical-editor-status-column';
      cell.textContent = 'Verifikimi';
    } else if (kind === 'clinical-action') {
      cell.dataset.clinicalEditorColumn = 'clinical-action';
      cell.className = 'clinical-editor-action-column';
      cell.textContent = 'Redakto';
    } else if (kind === 'dosage-adult' || kind === 'dosage-pediatric') {
      const population = kind === 'dosage-adult' ? 'adult' : 'pediatric';
      const label = population === 'adult' ? '1. Dozimi për të rritur' : '2. Dozimi për fëmijë';
      cell.dataset.registryDosageColumn = population;
      cell.className = `registry-dosage-column registry-dosage-${population}`;
      cell.innerHTML = `${label}<span class="registry-dosage-subhead">Doza e plotë&nbsp;&nbsp;|&nbsp;&nbsp;Rruga</span>`;
    } else if (kind === PROBE_KEY) {
      cell.dataset.registryNumberProbe = '1';
      cell.dataset.label = 'Nr';
      cell.hidden = true;
      cell.setAttribute('aria-hidden', 'true');
      cell.textContent = 'Nr';
    }
    return cell;
  }

  function ensureHeaderPlaceholders(header) {
    const definitions = [
      ['[data-clinical-editor-column="clinical-status"]', 'clinical-status'],
      ['[data-clinical-editor-column="clinical-action"]', 'clinical-action'],
      ['[data-registry-dosage-column="adult"]', 'dosage-adult'],
      ['[data-registry-dosage-column="pediatric"]', 'dosage-pediatric'],
      ['[data-registry-number-probe]', PROBE_KEY],
    ];
    definitions.forEach(([selector, kind]) => {
      if (!directMatches(header, selector).length) header.appendChild(makeHeaderCell(kind));
    });
    canonicalizeDynamic(header);
  }

  function placeholderMarkup(kind) {
    const suffix = kind.startsWith('dosage-') ? 'dose' : kind === 'clinical-status' ? 'status' : 'action';
    return `<span class="registry-cell-skeleton registry-cell-skeleton-${suffix}" aria-hidden="true"></span>`;
  }

  function makeRowCell(kind) {
    const cell = document.createElement('td');
    if (kind === 'clinical-status') {
      cell.dataset.clinicalEditorColumn = 'clinical-status';
      cell.dataset.label = 'Verifikimi';
      cell.className = 'clinical-editor-status-column registry-dynamic-placeholder';
      cell.innerHTML = placeholderMarkup(kind);
    } else if (kind === 'clinical-action') {
      cell.dataset.clinicalEditorColumn = 'clinical-action';
      cell.dataset.label = 'Redakto';
      cell.className = 'clinical-editor-action-column registry-dynamic-placeholder';
      cell.innerHTML = placeholderMarkup(kind);
    } else if (kind === 'dosage-adult' || kind === 'dosage-pediatric') {
      const population = kind === 'dosage-adult' ? 'adult' : 'pediatric';
      cell.dataset.registryDosageColumn = population;
      cell.dataset.label = population === 'adult' ? '1. Dozimi për të rritur' : '2. Dozimi për fëmijë';
      cell.className = `registry-dosage-column registry-dosage-${population} registry-dynamic-placeholder`;
      cell.innerHTML = placeholderMarkup(kind);
    } else if (kind === PROBE_KEY) {
      cell.dataset.registryNumberProbe = '1';
      cell.dataset.label = 'Nr';
      cell.hidden = true;
      cell.setAttribute('aria-hidden', 'true');
    }
    return cell;
  }

  function ensureRowPlaceholders(row) {
    if (!row || row.querySelector('.empty-state')) return false;
    let newlyResolved = false;
    const number = registryNumberForRow(row);
    let probe = directMatches(row, '[data-registry-number-probe]')[0];
    if (!probe) {
      probe = makeRowCell(PROBE_KEY);
      row.appendChild(probe);
    }
    if (number && row.dataset.registryNumber !== String(number)) {
      probe.textContent = String(number);
      row.dataset.registryNumber = String(number);
      newlyResolved = true;
    }
    const definitions = [
      ['[data-clinical-editor-column="clinical-status"]', 'clinical-status'],
      ['[data-clinical-editor-column="clinical-action"]', 'clinical-action'],
      ['[data-registry-dosage-column="adult"]', 'dosage-adult'],
      ['[data-registry-dosage-column="pediatric"]', 'dosage-pediatric'],
    ];
    definitions.forEach(([selector, kind]) => {
      if (!directMatches(row, selector).length) row.appendChild(makeRowCell(kind));
    });
    canonicalizeDynamic(row);
    return newlyResolved;
  }

  function wakeClinicalEditor(header) {
    const marker = document.createElement('th');
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    marker.dataset.registryEditorWake = VERSION;
    header.appendChild(marker);
    marker.remove();
  }

  function firstDataRow(tbody) {
    return Array.from(tbody?.children || []).find(row => !row.querySelector('.empty-state')) || null;
  }

  function headerModel(header) {
    return Array.from(header.children).map((cell, index) => {
      const key = keyForCell(cell, index);
      cell.dataset.registryColumnKey = key;
      if (!cell.hidden) cell.setAttribute('scope', 'col');
      return { cell, key, width:widthFor(cell, key) };
    });
  }

  function rowMap(row) {
    const map = new Map();
    Array.from(row.children).forEach((cell, index) => {
      const key = keyForCell(cell, index);
      if (!map.has(key)) map.set(key, cell);
      else cell.remove();
    });
    return map;
  }

  function alignRow(row, model) {
    if (!row || row.querySelector('.empty-state')) {
      const emptyCell = row?.querySelector('td');
      if (emptyCell) emptyCell.colSpan = Math.max(model.filter(item => !item.cell.hidden).length, 1);
      return false;
    }
    const cells = rowMap(row);
    const ordered = [];
    model.forEach(({ key }) => {
      const cell = cells.get(key);
      if (!cell) return;
      cell.dataset.registryColumnKey = key;
      ordered.push(cell);
      cells.delete(key);
    });
    cells.forEach(cell => ordered.push(cell));
    const current = Array.from(row.children);
    if (!sameNodes(current, ordered)) row.replaceChildren(...ordered);
    const actual = Array.from(row.children).map((cell, index) => keyForCell(cell, index));
    const expected = model.map(item => item.key);
    row.dataset.registryColumnCount = String(actual.length);
    row.dataset.registryColumnIntegrity = actual.length === expected.length
      && actual.every((key, index) => key === expected[index]) ? 'ok' : 'mismatch';
  }

  function cellIsVisible(cell) {
    return Boolean(cell && !cell.hidden && getComputedStyle(cell).display !== 'none');
  }

  function ensureColgroup(table, model, tbody, wrapper) {
    const sample = firstDataRow(tbody);
    const sampleMap = sample ? rowMap(sample) : new Map();
    const columns = model.map(({ cell, key, width }) => ({
      key,
      width,
      visible:cellIsVisible(cell) && (!sampleMap.get(key) || cellIsVisible(sampleMap.get(key))),
    }));
    const viewport = Math.max(0, Math.round(wrapper.clientWidth || 0));
    const total = columns.reduce((sum, column) => sum + (column.visible ? column.width : 0), 0);
    const signature = `${viewport}|${columns.map(column => `${column.key}:${column.width}:${column.visible ? 1 : 0}`).join('|')}`;
    let colgroup = table.querySelector(':scope > colgroup[data-registry-colgroup]');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      table.insertBefore(colgroup, table.firstChild);
    }
    if (signature !== lastLayoutSignature || colgroup.dataset.registryColgroup !== VERSION) {
      colgroup.dataset.registryColgroup = VERSION;
      colgroup.replaceChildren(...columns.map(column => {
        const col = document.createElement('col');
        col.dataset.registryColumnKey = column.key;
        col.style.width = `${column.visible ? column.width : 0}px`;
        if (!column.visible) col.style.display = 'none';
        return col;
      }));
      lastLayoutSignature = signature;
    }
    table.style.setProperty('--registry-table-width', `${Math.max(total, viewport)}px`);
    const visibleKeys = columns.filter(column => column.visible).map(column => column.key);
    table.dataset.registryVisibleColumns = visibleKeys.join(',');
    table.dataset.registryTableVersion = VERSION;
    return { total, visibleKeys };
  }

  function decorateDoseCells(tbody) {
    tbody.querySelectorAll('td.registry-dosage-column').forEach(cell => {
      const text = clean(cell.textContent);
      if (text && !/Duke e ngarkuar|Duke e lidhur/i.test(text)) cell.title = text;
      cell.querySelectorAll('.registry-dosage-route').forEach(route => {
        const routeText = clean(route.textContent);
        if (routeText) route.title = routeText;
      });
    });
  }

  function ensureDosageDialog() {
    if (dosageDialog) return dosageDialog;
    dosageDialog = document.createElement('dialog');
    dosageDialog.className = 'registry-dose-dialog';
    dosageDialog.innerHTML = '<div class="registry-dose-dialog-shell"><header><div><span>MedIndex · Dozimi i plotë</span><h2 id="registryDoseDialogTitle">Dozimi</h2></div><button type="button" aria-label="Mbyll">×</button></header><div class="registry-dose-dialog-body" id="registryDoseDialogBody"></div></div>';
    document.body.appendChild(dosageDialog);
    const close = () => dosageDialog.close();
    dosageDialog.querySelector('button')?.addEventListener('click', close);
    dosageDialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dosageDialog.addEventListener('click', event => { if (event.target === dosageDialog) close(); });
    return dosageDialog;
  }

  function openDosageDetails(details) {
    const row = details.closest('tr');
    const name = clean(row?.querySelector('[data-registry-column-key="trade-name"]')?.textContent) || 'Bari';
    const dialog = ensureDosageDialog();
    dialog.querySelector('#registryDoseDialogTitle').textContent = name;
    const body = dialog.querySelector('#registryDoseDialogBody');
    body.replaceChildren(...Array.from(details.children).filter(node => node.tagName !== 'SUMMARY').map(node => node.cloneNode(true)));
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('button')?.focus({ preventScroll:true }));
  }

  function exposeAudit(table, tbody, model, layout) {
    const rows = Array.from(tbody.children).filter(row => !row.querySelector('.empty-state'));
    const mismatch = rows.filter(row => row.dataset.registryColumnIntegrity !== 'ok').length;
    const unresolved = rows.filter(row => !Number(row.dataset.registryNumber)).length;
    const audit = {
      version:VERSION,
      columns:model.length,
      visibleColumns:layout.visibleKeys.length,
      width:layout.total,
      rows:rows.length,
      mismatchedRows:mismatch,
      unresolvedRows:unresolved,
      stable:mismatch === 0 && unresolved === 0,
      generatedAt:new Date().toISOString(),
    };
    window.MEDINDEX_REGISTRY_TABLE_AUDIT = audit;
    document.documentElement.dataset.registryTableIntegrity = audit.stable ? `${VERSION}-ok` : `${VERSION}-mismatch`;
    table.toggleAttribute('data-registry-layout-ready', audit.stable);
    const signature = `${audit.columns}|${audit.visibleColumns}|${audit.width}|${audit.rows}|${mismatch}|${unresolved}`;
    if (signature !== lastAuditSignature) {
      lastAuditSignature = signature;
      window.dispatchEvent(new CustomEvent('medindex:registry-table-stable', { detail:audit }));
    }
  }

  function enforce() {
    if (enforcing) return;
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    const table = document.getElementById('dataTable');
    const wrapper = table?.closest('.table-wrap');
    if (!header || !tbody || !table || !wrapper) return;

    enforcing = true;
    observer?.disconnect();
    const scrollLeft = wrapper.scrollLeft;
    try {
      refreshNumberIndex();
      ensureHeaderPlaceholders(header);
      let newlyResolved = false;
      Array.from(tbody.children).forEach(row => {
        newlyResolved = ensureRowPlaceholders(row) || newlyResolved;
      });
      const model = headerModel(header);
      Array.from(tbody.children).forEach(row => alignRow(row, model));
      const layout = ensureColgroup(table, model, tbody, wrapper);
      decorateDoseCells(tbody);
      exposeAudit(table, tbody, model, layout);
      if (newlyResolved) wakeClinicalEditor(header);
    } finally {
      enforcing = false;
      observe();
      requestAnimationFrame(() => {
        const maxLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        const target = Math.min(scrollLeft, maxLeft);
        if (Math.abs(wrapper.scrollLeft - target) > 1) wrapper.scrollLeft = target;
      });
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enforce();
    });
  }

  function observe() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return;
    if (!observer) {
      observer = new MutationObserver(records => {
        const structural = records.some(record => record.type === 'childList');
        if (structural) enforce();
        else schedule();
      });
    }
    observer.observe(header, { childList:true, subtree:true });
    observer.observe(tbody, { childList:true, subtree:true });
    observer.observe(document.documentElement, { attributes:true, attributeFilter:['class', 'data-theme'] });
  }

  function initResizeObserver() {
    const wrapper = document.querySelector('.table-wrap');
    if (!wrapper || !('ResizeObserver' in window)) return;
    let lastWidth = Math.round(wrapper.getBoundingClientRect().width);
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(entries => {
      const width = Math.round(entries[0]?.contentRect?.width || wrapper.getBoundingClientRect().width);
      if (Math.abs(width - lastWidth) < 2) return;
      lastWidth = width;
      schedule();
    });
    resizeObserver.observe(wrapper);
  }

  function bindDosageDetails() {
    document.addEventListener('click', event => {
      const summary = event.target.closest?.('.registry-dosage-details > summary');
      if (!summary) return;
      event.preventDefault();
      event.stopPropagation();
      openDosageDetails(summary.parentElement);
    }, true);
  }

  function init() {
    promoteStylesheet();
    enforce();
    initResizeObserver();
    bindDosageDetails();
    ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:tailadmin-ready']
      .forEach(eventName => window.addEventListener(eventName, enforce));
    window.addEventListener('resize', schedule, { passive:true });
    requestAnimationFrame(() => {
      promoteStylesheet();
      enforce();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();