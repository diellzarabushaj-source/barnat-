(() => {
  'use strict';

  const VERSION = 'registry-table-integrity-v3';
  const STYLE_VERSION = '20260801-3';
  const DYNAMIC_ORDER = Object.freeze([
    '[data-clinical-editor-column="clinical-status"]',
    '[data-clinical-editor-column="clinical-action"]',
    '[data-registry-dosage-column="adult"]',
    '[data-registry-dosage-column="pediatric"]',
  ]);
  const LABEL_KEYS = Object.freeze({
    perrecete:'select',
    nr:'number',
    emritregtar:'trade-name',
    substancaaktive:'active-substance',
    atc:'atc',
    atccode:'atc',
    klasackaeshte:'drug-class',
    perdorimifjalekyce:'use',
    pdid:'pdid',
    protokolli:'protocol',
    fortesia:'strength',
    forma:'form',
    formafarmaceutike:'form',
    sishenohetnerecete:'prescription-label',
    paketimi:'packaging',
    bartesiiautorizimit:'mah',
    prodhuesi:'manufacturer',
    certifikatama:'ma-certificate',
    statusi:'status',
    cmshumice:'wholesale-price',
    cmmarzhe:'margin-price',
    tvsh:'vat',
    cmpakice:'retail-price',
    afati:'validity',
    verifikimi:'clinical-status',
    redakto:'clinical-action',
  });
  const WIDTHS = Object.freeze({
    select:52,
    number:74,
    'trade-name':286,
    'active-substance':264,
    atc:96,
    'drug-class':250,
    use:290,
    pdid:108,
    protocol:130,
    strength:132,
    form:270,
    'prescription-label':280,
    packaging:190,
    mah:230,
    manufacturer:220,
    'ma-certificate':150,
    status:128,
    'wholesale-price':126,
    'margin-price':126,
    vat:92,
    'retail-price':126,
    validity:150,
    'clinical-status':196,
    'clinical-action':100,
    'dosage-adult':316,
    'dosage-pediatric':316,
  });

  let observer = null;
  let resizeObserver = null;
  let scheduled = false;
  let enforcing = false;
  let lastLayoutSignature = '';
  let lastAuditSignature = '';
  let lastObservedWidth = 0;

  const normalize = value => String(value ?? '')
    .replace(/[▲▼↕]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');

  function promoteStylesheet() {
    let link = document.querySelector('link[data-registry-table-integrity-css]');
    if (!link) {
      link = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .find(node => /registry-table-integrity\.css/i.test(node.getAttribute('href') || ''));
    }
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.registryTableIntegrityCss = '1';
    }
    const href = `registry-table-integrity.css?v=${STYLE_VERSION}`;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    if (!link.dataset.registryTableIntegrityCss) link.dataset.registryTableIntegrityCss = '1';
    document.head.appendChild(link);
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
    if (cell.dataset.registryDosageColumn === 'adult') return 'dosage-adult';
    if (cell.dataset.registryDosageColumn === 'pediatric') return 'dosage-pediatric';
    if (cell.dataset.clinicalEditorColumn === 'clinical-status') return 'clinical-status';
    if (cell.dataset.clinicalEditorColumn === 'clinical-action') return 'clinical-action';
    if (cell.classList.contains('select-col')) return 'select';

    const label = cell.dataset.label || cell.textContent || '';
    const token = normalize(label);
    if (LABEL_KEYS[token]) return LABEL_KEYS[token];
    if (cell.classList.contains('price')) return `price-${index}`;
    if (cell.classList.contains('code')) return `code-${index}`;
    if (cell.classList.contains('wrap')) return `wrap-${index}`;
    return `column-${index}`;
  }

  function widthFor(cell, key) {
    if (WIDTHS[key]) return WIDTHS[key];
    if (cell?.classList.contains('price')) return 126;
    if (cell?.classList.contains('code')) return 122;
    if (cell?.classList.contains('wrap')) return 240;
    return 190;
  }

  function firstDataRow(tbody) {
    return Array.from(tbody?.children || []).find(row => !row.querySelector('.empty-state')) || null;
  }

  function headerModel(header) {
    return Array.from(header.children).map((cell, index) => {
      const key = keyForCell(cell, index);
      cell.dataset.registryColumnKey = key;
      cell.setAttribute('scope', 'col');
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
      if (emptyCell) emptyCell.colSpan = Math.max(model.length, 1);
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
    const changed = !sameNodes(current, ordered);
    if (changed) row.replaceChildren(...ordered);

    const actual = Array.from(row.children).map((cell, index) => keyForCell(cell, index));
    const expected = model.map(item => item.key);
    row.dataset.registryColumnCount = String(actual.length);
    row.dataset.registryColumnIntegrity = actual.length === expected.length
      && actual.every((key, index) => key === expected[index]) ? 'ok' : 'mismatch';
    return changed;
  }

  function cellIsVisible(cell) {
    if (!cell || cell.hidden) return false;
    return getComputedStyle(cell).display !== 'none';
  }

  function layoutModel(model, tbody, wrapper) {
    const sampleRow = firstDataRow(tbody);
    const sampleByKey = sampleRow ? rowMap(sampleRow) : new Map();
    const columns = model.map(({ cell, key, width }) => {
      const sampleCell = sampleByKey.get(key);
      const visible = cellIsVisible(cell) && (!sampleCell || cellIsVisible(sampleCell));
      return { key, width, visible };
    });
    const viewport = Math.max(0, Math.round(wrapper?.clientWidth || 0));
    const total = columns.reduce((sum, column) => sum + (column.visible ? column.width : 0), 0);
    const visibleKeys = columns.filter(column => column.visible).map(column => column.key);
    const signature = `${viewport}|${columns.map(column => `${column.key}:${column.width}:${column.visible ? 1 : 0}`).join('|')}`;
    return { columns, viewport, total, visibleKeys, signature };
  }

  function ensureColgroup(table, model, tbody, wrapper) {
    const layout = layoutModel(model, tbody, wrapper);
    let colgroup = table.querySelector(':scope > colgroup[data-registry-colgroup]');
    const needsRebuild = !colgroup
      || colgroup.dataset.registryColgroup !== VERSION
      || layout.signature !== lastLayoutSignature;

    if (needsRebuild) {
      if (!colgroup) {
        colgroup = document.createElement('colgroup');
        table.insertBefore(colgroup, table.firstChild);
      }
      colgroup.dataset.registryColgroup = VERSION;
      const fragment = document.createDocumentFragment();
      layout.columns.forEach(column => {
        const col = document.createElement('col');
        col.dataset.registryColumnKey = column.key;
        col.style.width = `${column.visible ? column.width : 0}px`;
        if (!column.visible) col.style.display = 'none';
        fragment.appendChild(col);
      });
      colgroup.replaceChildren(fragment);
      lastLayoutSignature = layout.signature;
    }

    const tableWidth = `${Math.max(layout.total, layout.viewport)}px`;
    if (table.style.getPropertyValue('--registry-table-width') !== tableWidth) {
      table.style.setProperty('--registry-table-width', tableWidth);
    }
    const visibleValue = layout.visibleKeys.join(',');
    if (table.dataset.registryVisibleColumns !== visibleValue) {
      table.dataset.registryVisibleColumns = visibleValue;
    }
    table.dataset.registryTableVersion = VERSION;
    return { ...layout, changed:needsRebuild };
  }

  function exposeAudit(table, tbody, model, layout) {
    const rows = Array.from(tbody.children).filter(row => !row.querySelector('.empty-state'));
    const mismatch = rows.filter(row => row.dataset.registryColumnIntegrity !== 'ok').length;
    const audit = {
      version:VERSION,
      columns:model.length,
      visibleColumns:layout.visibleKeys.length,
      width:layout.total,
      rows:rows.length,
      mismatchedRows:mismatch,
      stable:mismatch === 0,
      generatedAt:new Date().toISOString(),
    };
    window.MEDINDEX_REGISTRY_TABLE_AUDIT = audit;
    document.documentElement.dataset.registryTableIntegrity = audit.stable ? `${VERSION}-ok` : `${VERSION}-mismatch`;

    const signature = `${audit.columns}|${audit.visibleColumns}|${audit.width}|${audit.rows}|${audit.mismatchedRows}|${audit.stable}`;
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

    try {
      canonicalizeDynamic(header);
      Array.from(tbody.children).forEach(canonicalizeDynamic);

      const model = headerModel(header);
      Array.from(tbody.children).forEach(row => alignRow(row, model));
      const layout = ensureColgroup(table, model, tbody, wrapper);
      exposeAudit(table, tbody, model, layout);
    } finally {
      enforcing = false;
      observe();
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
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(header, { childList:true, subtree:true });
    observer.observe(tbody, { childList:true, subtree:true });
    observer.observe(document.documentElement, { attributes:true, attributeFilter:['class', 'data-theme'] });
  }

  function initResizeObserver() {
    const wrapper = document.querySelector('.table-wrap');
    if (!wrapper || !('ResizeObserver' in window)) return;
    resizeObserver?.disconnect();
    lastObservedWidth = Math.round(wrapper.getBoundingClientRect().width);
    resizeObserver = new ResizeObserver(entries => {
      const width = Math.round(entries[0]?.contentRect?.width || wrapper.getBoundingClientRect().width);
      if (Math.abs(width - lastObservedWidth) < 2) return;
      lastObservedWidth = width;
      schedule();
    });
    resizeObserver.observe(wrapper);
  }

  function init() {
    promoteStylesheet();
    schedule();
    initResizeObserver();
    ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:tailadmin-ready']
      .forEach(eventName => window.addEventListener(eventName, schedule));
    window.addEventListener('resize', schedule, { passive:true });
    requestAnimationFrame(() => {
      promoteStylesheet();
      schedule();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();