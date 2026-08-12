(() => {
  'use strict';

  const VERSION = 'registry-desktop-column-lite-v1';
  const API = '/api/drug-search';
  const DESKTOP_QUERY = '(min-width: 768px)';
  const CHUNK = 50;
  const CONCURRENCY = 3;
  const media = window.matchMedia?.(DESKTOP_QUERY);
  if (!media?.matches) return;

  const columns = Object.freeze([
    { key:'number', label:'Nr', raw:'Nr rendor', sort:'registry', default:false },
    { key:'trade-name', label:'Emri Tregtar', raw:'Emri tregtar', sort:'name', default:true, cls:'name' },
    { key:'active-substance', label:'Substanca Aktive', raw:'Substanca aktive', sort:'substance', default:true, cls:'quality-substance' },
    { key:'atc', label:'ATC', raw:'ATC Code', sort:'atc', default:true, cls:'code' },
    { key:'drug-class', label:'Klasa / Çka është', raw:'Klasa / Çka është', sort:'class', default:false, cls:'wrap' },
    { key:'use', label:'Përdorimi / fjalë kyçe', raw:'Përdorimi (fjalë kyçe)', sort:'use', default:false, cls:'wrap' },
    { key:'pdid', label:'PDID', raw:'PDID', sort:'pdid', default:false, cls:'code' },
    { key:'protocol', label:'Protokolli', remote:'protocol', sort:'protocol', default:false, cls:'code' },
    { key:'strength', label:'Fortësia', raw:'Fortësia', sort:'strength', default:true },
    { key:'form', label:'Forma', raw:'Forma farmaceutike', sort:'form', default:true, cls:'wrap registry-form-cell' },
    { key:'prescription-label', label:'Si shënohet në recetë', advanced:true, default:false, cls:'wrap' },
    { key:'packaging', label:'Paketimi', remote:'packaging', sort:'packaging', default:false, cls:'wrap' },
    { key:'mah', label:'Bartësi i Autorizimit', remote:'mah', sort:'mah', default:false, cls:'wrap' },
    { key:'manufacturer', label:'Prodhuesi', remote:'manufacturer', sort:'manufacturer', default:false, cls:'wrap' },
    { key:'ma-certificate', label:'Certifikata MA', remote:'ma-certificate', sort:'certificate', default:false, cls:'code' },
    { key:'status', label:'Statusi', raw:'Statusi', sort:'status', default:true },
    { key:'wholesale-price', label:'Çmimi me shumicë', remote:'wholesale-price', sort:'wholesale', default:false, cls:'price', price:true },
    { key:'margin-price', label:'Çmimi me marzhë', remote:'margin-price', sort:'margin', default:false, cls:'price', price:true },
    { key:'vat', label:'TVSH', remote:'vat', sort:'vat', default:false },
    { key:'retail-price', label:'Çmimi me pakicë', raw:'Çmimi me pakicë', sort:'price', default:false, cls:'price', price:true },
    { key:'validity', label:'Afati i vlefshmërisë', remote:'validity', sort:'validity', default:false, cls:'wrap' },
  ]);

  const byKey = new Map(columns.map(column => [column.key, column]));
  const visible = new Set(columns.filter(column => column.default).map(column => column.key));
  const remoteCache = new Map();
  let panelBuilt = false;
  let applying = false;
  let applyFrame = 0;
  let loadToken = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const active = () => Boolean(window.MEDINDEX_DESKTOP_LITE_ACTIVE && document.documentElement.dataset.registryDesktopLiteState !== 'handoff');

  function rawRows() {
    return Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
  }

  function rawById() {
    return new Map(rawRows().map(row => [clean(row?.__neonDrugId), row]).filter(([id]) => id));
  }

  function rowElements() {
    return [...document.querySelectorAll('#tbody > tr[data-desktop-lite-row]')];
  }

  function headerCell(key) {
    return document.querySelector(`#headerRow > [data-registry-column-key="${CSS.escape(key)}"]`);
  }

  function rowCell(row, key) {
    return row.querySelector(`:scope > [data-registry-column-key="${CSS.escape(key)}"]`);
  }

  function valueFor(rowData, id, column) {
    if (column.raw) return rowData?.[column.raw] ?? '';
    if (column.remote) return remoteCache.get(id)?.[column.remote] ?? '';
    return '';
  }

  function formatted(value, column) {
    if (!column.price) return clean(value) || '—';
    const number = Number(value);
    return value === '' || value == null || !Number.isFinite(number)
      ? '—'
      : number.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
  }

  function fillCell(cell, value, column) {
    const text = formatted(value, column);
    cell.className = column.cls || '';
    cell.dataset.registryColumnKey = column.key;
    cell.dataset.label = column.label;
    cell.title = clean(value);
    if (column.key === 'trade-name') {
      cell.replaceChildren();
      const span = document.createElement('span');
      span.className = 'drug-name-text';
      span.textContent = text;
      cell.appendChild(span);
    } else if (column.key === 'active-substance') {
      cell.replaceChildren();
      const span = document.createElement('span');
      span.textContent = text;
      cell.appendChild(span);
    } else if (column.key === 'form') {
      cell.replaceChildren();
      const span = document.createElement('span');
      span.className = 'registry-cell-value';
      span.textContent = text;
      cell.appendChild(span);
    } else if (column.key === 'status' && text !== '—') {
      cell.replaceChildren();
      const badge = document.createElement('span');
      badge.className = 'badge ' + (text === 'Gjenerik' ? 'gjenerik' : text === 'Origjinator' ? 'origjinator' : '');
      badge.textContent = text;
      cell.appendChild(badge);
    } else {
      cell.textContent = text;
    }
  }

  function makeHeader(column) {
    const cell = document.createElement('th');
    cell.dataset.registryColumnKey = column.key;
    cell.dataset.label = column.label;
    cell.scope = 'col';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'registry-sort-trigger';
    button.dataset.columnLiteSort = column.sort || '';
    button.textContent = column.label;
    if (column.sort) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '↕';
      button.appendChild(arrow);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void window.MEDINDEX_DESKTOP_LITE?.sortBy?.(column.sort);
      });
    } else button.disabled = true;
    cell.appendChild(button);
    return cell;
  }

  function ensureColumn(column, rowMap) {
    const header = document.getElementById('headerRow');
    if (!header) return;
    if (!headerCell(column.key)) header.appendChild(makeHeader(column));
    rowElements().forEach(row => {
      let cell = rowCell(row, column.key);
      if (!cell) {
        cell = document.createElement('td');
        row.appendChild(cell);
      }
      const id = clean(row.dataset.desktopLiteRow);
      fillCell(cell, valueFor(rowMap.get(id), id, column), column);
    });
  }

  function removeColumn(key) {
    headerCell(key)?.remove();
    rowElements().forEach(row => rowCell(row, key)?.remove());
  }

  function applyColumnsNow() {
    if (!active() || applying) return;
    applying = true;
    try {
      const rowMap = rawById();
      columns.forEach(column => {
        if (column.advanced) return;
        if (visible.has(column.key)) ensureColumn(column, rowMap);
        else removeColumn(column.key);
      });
      window.MedIndexRegistryUnified?.refresh?.();
      syncPanelChecks();
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (applyFrame) return;
    applyFrame = requestAnimationFrame(() => {
      applyFrame = 0;
      applyColumnsNow();
    });
  }

  function requiredRemoteColumns() {
    return [...visible].map(key => byKey.get(key)?.remote).filter(Boolean);
  }

  function missingRemote(ids, keys) {
    return ids.filter(id => keys.some(key => !Object.prototype.hasOwnProperty.call(remoteCache.get(id) || {}, key)));
  }

  async function fetchChunk(ids, keys) {
    const params = new URLSearchParams({
      view:'registry-columns',
      ids:ids.join(','),
      columns:keys.join(','),
    });
    const response = await fetch(API + '?' + params.toString(), {
      credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja e kolonave është e pavlefshme.');
    payload.rows.forEach(item => {
      const id = clean(item.id);
      if (!id) return;
      remoteCache.set(id, { ...(remoteCache.get(id) || {}), ...(item.values || {}) });
    });
  }

  async function hydrateVisibleColumns() {
    if (!active()) return;
    const keys = requiredRemoteColumns();
    if (!keys.length) return scheduleApply();
    const ids = rowElements().map(row => clean(row.dataset.desktopLiteRow)).filter(Boolean);
    const needed = missingRemote(ids, keys);
    if (!needed.length) return scheduleApply();
    const token = ++loadToken;
    const chunks = [];
    for (let i = 0; i < needed.length; i += CHUNK) chunks.push(needed.slice(i, i + CHUNK));
    let cursor = 0;
    const workers = Array.from({ length:Math.min(CONCURRENCY, chunks.length) }, async () => {
      while (cursor < chunks.length) {
        const index = cursor++;
        await fetchChunk(chunks[index], keys);
      }
    });
    try { await Promise.all(workers); }
    catch (error) { console.warn('Kolonat shtesë nuk u ngarkuan:', error?.message || error); }
    if (token === loadToken) scheduleApply();
  }

  function setVisible(next) {
    visible.clear();
    next.forEach(key => { if (byKey.has(key) && !byKey.get(key).advanced) visible.add(key); });
    window.MedIndexRegistryUnified?.setView?.('full');
    applyColumnsNow();
    void hydrateVisibleColumns();
  }

  function handleAdvanced(column, checkbox) {
    checkbox.checked = false;
    window.MEDINDEX_DESKTOP_LITE?.handoff?.('column-prescription-notation');
  }

  function buildPanel() {
    const panel = document.getElementById('colPanel');
    const button = document.getElementById('colPickerBtn');
    if (!panel || !button || panelBuilt) return;
    panelBuilt = true;
    panel.replaceChildren();

    const actions = document.createElement('div');
    actions.className = 'col-panel-actions';
    const all = document.createElement('button');
    all.type = 'button';
    all.textContent = 'Shfaqi të gjitha';
    all.addEventListener('click', event => {
      event.preventDefault();
      setVisible(columns.filter(column => !column.advanced).map(column => column.key));
    });
    const none = document.createElement('button');
    none.type = 'button';
    none.textContent = 'Fshihi të gjitha';
    none.addEventListener('click', event => {
      event.preventDefault();
      setVisible(['number']);
    });
    actions.append(all, none);
    panel.appendChild(actions);

    columns.forEach(column => {
      const label = document.createElement('label');
      label.dataset.columnLiteKey = column.key;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = visible.has(column.key);
      checkbox.dataset.columnLiteKey = column.key;
      if (column.advanced) checkbox.title = 'Kërkon funksionet e plota';
      checkbox.addEventListener('change', () => {
        if (column.advanced) return handleAdvanced(column, checkbox);
        const next = new Set(visible);
        if (checkbox.checked) next.add(column.key); else next.delete(column.key);
        setVisible([...next]);
      });
      const span = document.createElement('span');
      span.textContent = column.label + (column.advanced ? ' · avancuar' : '');
      label.append(checkbox, span);
      panel.appendChild(label);
    });

    button.addEventListener('click', event => {
      if (!active()) return;
      event.preventDefault();
      event.stopPropagation();
      panel.classList.toggle('open');
      button.setAttribute('aria-expanded', String(panel.classList.contains('open')));
      panel.setAttribute('aria-hidden', String(!panel.classList.contains('open')));
      window.MedIndexColumnPicker?.refresh?.();
    });
    document.addEventListener('click', event => {
      if (!active() || !panel.classList.contains('open')) return;
      if (!panel.contains(event.target) && event.target !== button) {
        panel.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
        panel.setAttribute('aria-hidden', 'true');
      }
    });
    window.MedIndexColumnPicker?.refresh?.();
  }

  function syncPanelChecks() {
    document.querySelectorAll('#colPanel input[data-column-lite-key]').forEach(input => {
      const column = byKey.get(input.dataset.columnLiteKey);
      if (!column?.advanced) input.checked = visible.has(column.key);
    });
  }

  function onPageReady() {
    requestAnimationFrame(() => {
      scheduleApply();
      void hydrateVisibleColumns();
    });
  }

  function init() {
    buildPanel();
    onPageReady();
    ['medindex:registry-page-ready', 'medindex:desktop-lite-ready'].forEach(name => window.addEventListener(name, onPageReady));
    window.addEventListener('medindex:registry-table-stable', () => {
      if (document.documentElement.dataset.registryUxView === 'full') scheduleApply();
    });
    document.documentElement.dataset.registryDesktopColumnLite = VERSION;
  }

  window.MedIndexDesktopColumnLite = Object.freeze({
    version:VERSION,
    visible:() => [...visible],
    setVisible,
    refresh() { scheduleApply(); return hydrateVisibleColumns(); },
    cacheSize:() => remoteCache.size,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
