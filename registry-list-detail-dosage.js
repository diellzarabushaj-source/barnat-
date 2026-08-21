(() => {
  'use strict';

  const ROOT = document.documentElement;
  if (ROOT.dataset.miPage !== 'barnat') return;

  const VERSION = 'registry-list-detail-dosage-v1';
  const API = '/api/dosage';
  const STYLE_ID = 'registryListDetailDosageStyles';
  const CACHE_LIMIT = 128;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const cache = new Map();
  const registryIdCache = new Map();
  const requests = new WeakMap();
  let requestSerial = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.rlv-dosage-detail{display:grid;gap:8px;min-width:0}',
      '.rlv-dosage-state{color:var(--mi-muted,#667085);font-size:12.5px;line-height:1.5}',
      '.rlv-dosage-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '.rlv-dosage-group{min-width:0;padding:9px 10px;border:1px solid var(--mi-border,#e4e7ec);border-radius:10px;background:var(--mi-surface,#fff)}',
      '.rlv-dosage-group-title{display:block;margin:0 0 6px;color:var(--mi-text,#101828);font-size:12.5px;font-weight:750}',
      '.rlv-dosage-line{display:grid;grid-template-columns:minmax(78px,.34fr) minmax(0,1fr);gap:6px;margin-top:4px;font-size:12.5px;line-height:1.5}',
      '.rlv-dosage-line b{color:var(--mi-muted,#667085);font-size:11.5px;font-weight:650}',
      '.rlv-dosage-line span{min-width:0;color:var(--mi-gray-700,#344054);overflow-wrap:anywhere}',
      '.rlv-dosage-source{margin-top:5px;color:var(--mi-muted,#667085);font-size:11px}',
      '@media(max-width:1000px){.rlv-dosage-groups{grid-template-columns:minmax(0,1fr)}}',
      '@media(prefers-reduced-motion:reduce){.rlv-dosage-group{scroll-behavior:auto}}',
    ].join('');
    document.head.appendChild(style);
  }

  function remember(map, key, value, limit = CACHE_LIMIT) {
    if (!key) return value;
    map.delete(key);
    map.set(key, value);
    while (map.size > limit) {
      const oldest = map.keys().next().value;
      if (oldest == null) break;
      map.delete(oldest);
    }
    return value;
  }

  function readCache(map, key) {
    if (!map.has(key)) return null;
    const value = map.get(key);
    map.delete(key);
    map.set(key, value);
    return value;
  }

  function rowForOpen(open) {
    const index = Number(open?.dataset?.rlvOpen);
    const rows = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
    return Number.isInteger(index) && index >= 0 && index < rows.length ? rows[index] : null;
  }

  function directDrugId(row) {
    const candidates = [row?.__neonDrugId, row?.drugId, row?.id];
    for (const candidate of candidates) {
      const id = clean(candidate);
      if (UUID_RE.test(id)) return id;
    }
    return '';
  }

  function registryNumber(row) {
    const value = clean(row?.['Nr rendor'] ?? row?.registryNumber);
    return /^\d{1,6}$/.test(value) ? value : '';
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, {
      credentials:'same-origin', cache:'no-store', signal,
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    if (!payload?.ok) throw new Error('Përgjigjja e dozimit është e pavlefshme.');
    return payload;
  }

  async function resolveDrugId(row, signal) {
    const direct = directDrugId(row);
    if (direct) return direct;

    const nr = registryNumber(row);
    if (!nr) return '';
    const cached = readCache(registryIdCache, nr);
    if (cached) return cached;

    const payload = await fetchJson(API + '?view=cards&nr=' + encodeURIComponent(nr), signal);
    const card = Array.isArray(payload.cards)
      ? payload.cards.find(item => clean(item?.registryNumber) === nr) || payload.cards[0]
      : null;
    const id = clean(card?.drugId);
    return UUID_RE.test(id) ? remember(registryIdCache, nr, id, 256) : '';
  }

  function dosageSlot(detail) {
    let label = detail.querySelector(':scope > dt[data-rlv-dosage-label]');
    let value = detail.querySelector(':scope > dd[data-rlv-dosage-value]');
    if (label && value) return { label, value };

    label = document.createElement('dt');
    label.dataset.rlvDosageLabel = 'true';
    label.textContent = 'Dozimi';
    value = document.createElement('dd');
    value.dataset.rlvDosageValue = 'true';
    value.className = 'rlv-dosage-detail';
    value.setAttribute('aria-live', 'polite');

    const labels = [...detail.querySelectorAll(':scope > dt')];
    const prescription = labels.find(node => clean(node.textContent) === 'Si të shënohet në recetë');
    const status = labels.find(node => clean(node.textContent) === 'Statusi');
    const price = labels.find(node => clean(node.textContent) === 'Çmimi me pakicë');
    const prescriptionValue = prescription?.nextElementSibling?.tagName === 'DD' ? prescription.nextElementSibling : null;

    if (prescriptionValue) prescriptionValue.after(label, value);
    else if (status) status.before(label, value);
    else if (price) price.before(label, value);
    else detail.append(label, value);
    return { label, value };
  }

  function stateText(value, text, state) {
    value.replaceChildren();
    value.dataset.rlvDosageState = state;
    const line = document.createElement('span');
    line.className = 'rlv-dosage-state';
    line.textContent = text;
    value.appendChild(line);
  }

  function regimenHasData(regimen) {
    return Boolean(regimen && [
      regimen.dose, regimen.route, regimen.frequency, regimen.duration,
      regimen.maximum, regimen.indication, regimen.warnings,
    ].some(item => clean(item)));
  }

  function addLine(group, label, rawValue) {
    const text = clean(rawValue);
    if (!text) return;
    const line = document.createElement('div');
    line.className = 'rlv-dosage-line';
    const key = document.createElement('b');
    key.textContent = label;
    const value = document.createElement('span');
    value.textContent = text;
    line.append(key, value);
    group.appendChild(line);
  }

  function regimenGroup(title, regimen) {
    if (!regimenHasData(regimen)) return null;
    const group = document.createElement('section');
    group.className = 'rlv-dosage-group';
    const heading = document.createElement('strong');
    heading.className = 'rlv-dosage-group-title';
    heading.textContent = title;
    group.appendChild(heading);
    addLine(group, 'Indikacioni', regimen.indication);
    addLine(group, 'Doza', regimen.dose);
    addLine(group, 'Rruga', regimen.route);
    addLine(group, 'Frekuenca', regimen.frequency);
    addLine(group, 'Kohëzgjatja', regimen.duration);
    addLine(group, 'Maksimumi', regimen.maximum);
    addLine(group, 'Paralajmërime', regimen.warnings);
    return group;
  }

  function renderDosage(value, payload) {
    const adult = regimenGroup('Të rriturit', payload?.adult);
    const pediatric = regimenGroup('Pediatrik', payload?.pediatric);
    value.replaceChildren();
    value.dataset.rlvDosageState = adult || pediatric ? 'ready' : 'empty';
    if (!adult && !pediatric) {
      stateText(value, 'Dozimi nuk është i disponueshëm ende.', 'empty');
      return;
    }
    const groups = document.createElement('div');
    groups.className = 'rlv-dosage-groups';
    if (adult) groups.appendChild(adult);
    if (pediatric) groups.appendChild(pediatric);
    value.appendChild(groups);
  }

  function requestIsCurrent(detail, token) {
    const request = requests.get(detail);
    return Boolean(request && request.token === token && detail.isConnected && !detail.hidden);
  }

  function abortDetail(detail) {
    const current = requests.get(detail);
    current?.controller?.abort();
    requests.delete(detail);
  }

  async function ensureDosage(open, detail, row) {
    ensureStyles();
    const { value } = dosageSlot(detail);
    abortDetail(detail);
    stateText(value, 'Duke ngarkuar dozimin…', 'loading');

    const controller = new AbortController();
    const token = ++requestSerial;
    requests.set(detail, { controller, token });

    try {
      const id = await resolveDrugId(row, controller.signal);
      if (!requestIsCurrent(detail, token)) return;
      if (!id) {
        stateText(value, 'Dozimi nuk është i disponueshëm ende.', 'empty');
        return;
      }
      detail.dataset.rlvDosageDrugId = id;
      const cached = readCache(cache, id);
      const payload = cached || await fetchJson(API + '?view=card&id=' + encodeURIComponent(id), controller.signal);
      if (!requestIsCurrent(detail, token)) return;
      if (open.getAttribute('aria-expanded') !== 'true' || open.getAttribute('aria-controls') !== detail.id) return;
      if (!cached) remember(cache, id, payload);
      renderDosage(value, payload);
    } catch (error) {
      if (error?.name === 'AbortError' || !requestIsCurrent(detail, token)) return;
      stateText(value, 'Dozimi nuk u ngarkua.', 'error');
    } finally {
      const current = requests.get(detail);
      if (current?.token === token) requests.delete(detail);
    }
  }

  function handleDrugToggle(open) {
    const detailId = open.getAttribute('aria-controls');
    const detail = detailId ? document.getElementById(detailId) : null;
    if (!detail) return;
    if (open.getAttribute('aria-expanded') !== 'true') {
      abortDetail(detail);
      return;
    }
    const row = rowForOpen(open);
    if (!row) return;
    void ensureDosage(open, detail, row);
  }

  document.addEventListener('click', event => {
    const open = event.target.closest?.('#registryListView [data-rlv-open]');
    if (!open) return;
    // The list-view panel handles the same bubbling click first: by the time this
    // microtask runs, its static key/value detail has been filled and the
    // aria-expanded state is final. Dosage can therefore append without owning
    // or duplicating the list renderer.
    queueMicrotask(() => handleDrugToggle(open));
  });

  window.MedIndexRegistryListDetailDosage = Object.freeze({
    version:VERSION,
    cacheSize:() => cache.size,
    clearCache() { cache.clear(); registryIdCache.clear(); },
    _test:{ directDrugId, registryNumber, regimenHasData },
  });
})();
