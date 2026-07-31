(() => {
  'use strict';

  const VERSION = 'registry-table-integrity-v2';
  const STYLE_VERSION = '20260801-2';
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

  function canonicalizeDynamic(container) {
    if (!container) return;
    const ordered = [];
    DYNAMIC_ORDER.forEach(selector => {
      const matches = directMatches(container, selector);
      matches.slice(1).forEach(node => node.remove());
      if (matches[0]) ordered.push(matches[0]);
    });
    ordered.forEach(node => {
      if (container.lastElementChild !== node) container.appendChild(node);
    });
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
      return;
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
    ordered.forEach(cell => {
      if (row.lastElementChild !== cell) row.appendChild(cell);
    });

    const actual = Array.from(row.children).map((cell, index) => keyForCell(cell, index));
    const expected = model.map(item => item.key);
    row.dataset.registryColumnCount = String(actual.length);
    row.dataset.registryColumnIntegrity = actual.length === expected.length
      && actual.every((key, index) => key === expected[index]) ? 'ok' : 'mismatch';
  }

  function cellIsVisible(cell) {
    if (!cell || cell.hidden) return false;
    return getComputedStyle(cell).display !== 'none';
  }

  function ensureColgroup(table, model, tbody) {
    let colgroup = table.querySelector(':scope > colgroup[data-registry-colgroup]');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      colgroup.dataset.registryColgroup = VERSION;
      table.insertBefore(colgroup, table.firstChild);
    }
    colgroup.replaceChildren();

    const sampleRow = firstDataRow(tbody);
    const sampleByKey = sampleRow ? rowMap(sampleRow) : new Map();
    let total = 0;
    const visibleKeys = [];

    model.forEach(({ cell, key, width }) => {
      const sampleCell = sampleByKey.get(key);
      const visible = cellIsVisible(cell) && (!sampleCell || cellIsVisible(sampleCell));
      const col = document.createElement('col');
      col.dataset.registryColumnKey = key;
      col.style.width = `${visible ? width : 0}px`;
      if (!visible) col.style.display = 'none';
      colgroup.appendChild(col);
      if (visible) {
        total += width;
        visibleKeys.push(key);
      }
    });

    const wrapper = table.closest('.table-wrap');
    const viewport = Math.max(0, wrapper?.clientWidth || 0);
    table.style.setProperty('--registry-table-width', `${Math.max(total, viewport)}px`);
    table.dataset.registryVisibleColumns = visibleKeys.join(',');
    table.dataset.registryTableVersion = VERSION;
    return { total, visibleKeys };
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
    window.dispatchEvent(new CustomEvent('medindex:registry-table-stable', { detail:audit }));
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
    const scrollTop = wrapper.scrollTop;

    try {
      canonicalizeDynamic(header);
      Array.from(tbody.children).forEach(canonicalizeDynamic);

      const model = headerModel(header);
      Array.from(tbody.children).forEach(row => alignRow(row, model));
      const layout = ensureColgroup(table, model, tbody);
      exposeAudit(table, tbody, model, layout);
    } finally {
      enforcing = false;
      observe();
      requestAnimationFrame(() => {
        const maxLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        wrapper.scrollLeft = Math.min(scrollLeft, maxLeft);
        wrapper.scrollTop = scrollTop;
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
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(header, { childList:true, subtree:true });
    observer.observe(tbody, { childList:true, subtree:true });
    observer.observe(document.documentElement, { attributes:true, attributeFilter:['class', 'data-theme'] });
  }

  function initResizeObserver() {
    const wrapper = document.querySelector('.table-wrap');
    if (!wrapper || !('ResizeObserver' in window)) return;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => schedule());
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
