(() => {
  'use strict';

  const VERSION = 'registry-desktop-targeted-detail-v1';
  const DESKTOP_QUERY = '(min-width: 768px)';
  const REGISTRY_DETAIL_API = '/api/drug-search';
  const CLINICAL_DETAIL_API = '/api/dosage';
  const STYLE_ID = 'registryDesktopTargetedDetailStyles';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const cache = new Map();
  const inflight = new Map();
  const media = window.matchMedia?.(DESKTOP_QUERY);
  if (!media?.matches) return;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function active() {
    return Boolean(window.MEDINDEX_DESKTOP_LITE_ACTIVE && document.documentElement.dataset.registryDesktopLiteState !== 'handoff');
  }

  function drugId(row) {
    const id = clean(row?.dataset?.desktopLiteRow);
    return UUID_RE.test(id) ? id : '';
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#tbody>tr.registry-targeted-detail-row>td{padding:0!important;border-top:0!important}',
      '.registry-targeted-detail-panel{padding:16px 18px 18px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);background:var(--card-bg,var(--surface,#fff));color:inherit}',
      '.registry-targeted-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}',
      '.registry-targeted-detail-head strong{display:block;font-size:15px;line-height:1.35}',
      '.registry-targeted-detail-head span{display:block;margin-top:3px;font-size:12px;opacity:.7}',
      '.registry-targeted-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px}',
      '.registry-targeted-detail-section{min-width:0;padding:12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:10px}',
      '.registry-targeted-detail-section h4{margin:0 0 8px;font-size:12px;line-height:1.3;text-transform:uppercase;letter-spacing:.04em;opacity:.72}',
      '.registry-targeted-detail-field{display:grid;grid-template-columns:minmax(105px,.42fr) minmax(0,1fr);gap:8px;margin-top:7px;font-size:13px;line-height:1.45}',
      '.registry-targeted-detail-field:first-of-type{margin-top:0}',
      '.registry-targeted-detail-field b{font-weight:600;opacity:.76}',
      '.registry-targeted-detail-field span{min-width:0;overflow-wrap:anywhere}',
      '.registry-targeted-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
      '.registry-targeted-detail-actions button,.registry-targeted-detail-sources a{min-height:36px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;padding:7px 10px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:none}',
      '.registry-targeted-detail-sources{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '.registry-targeted-detail-status{font-size:13px;opacity:.75}',
      '@media(max-width:1100px){.registry-targeted-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:767px){.registry-targeted-detail-row{display:none!important}}',
    ].join('');
    document.head.appendChild(style);
  }

  function detailRowFor(row) {
    const id = drugId(row);
    if (!id) return null;
    const next = row.nextElementSibling;
    if (next?.classList?.contains('registry-targeted-detail-row') && next.dataset.targetedDetailFor === id) return next;

    const detailRow = document.createElement('tr');
    detailRow.className = 'registry-targeted-detail-row';
    detailRow.dataset.targetedDetailFor = id;
    detailRow.dataset.registryUiOnly = 'true';
    detailRow.hidden = true;

    const cell = document.createElement('td');
    cell.colSpan = Math.max(1, row.children.length);
    const panel = document.createElement('div');
    panel.className = 'registry-targeted-detail-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-live', 'polite');
    cell.appendChild(panel);
    detailRow.appendChild(cell);
    row.insertAdjacentElement('afterend', detailRow);
    return detailRow;
  }

  function addField(container, label, value) {
    const text = clean(value);
    if (!text) return false;
    const item = document.createElement('div');
    item.className = 'registry-targeted-detail-field';
    const key = document.createElement('b');
    key.textContent = label;
    const val = document.createElement('span');
    val.textContent = text;
    item.append(key, val);
    container.appendChild(item);
    return true;
  }

  function makeSection(title, fields) {
    const section = document.createElement('section');
    section.className = 'registry-targeted-detail-section';
    const heading = document.createElement('h4');
    heading.textContent = title;
    section.appendChild(heading);
    let count = 0;
    fields.forEach(([label, value]) => { if (addField(section, label, value)) count += 1; });
    return count ? section : null;
  }

  function regimenFields(regimen) {
    if (!regimen) return [];
    return [
      ['Doza', regimen.dose],
      ['Rruga', regimen.route],
      ['Frekuenca', regimen.frequency],
      ['Kohëzgjatja', regimen.duration],
      ['Maksimumi', regimen.maximum],
      ['Indikacioni', regimen.indication],
      ['Paralajmërime', regimen.warnings],
    ];
  }

  function fullRuntimeButton(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Hap funksionet e plota';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent('medindex:request-full-registry', {
        detail:{ reason:'desktop-targeted-detail-advanced', drugId:id }
      }));
    });
    return button;
  }

  function retryButton(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Riprovo';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const id = drugId(row);
      if (!id) return;
      cache.delete(id);
      void ensureDetail(row, { force:true });
    });
    return button;
  }

  function renderLoading(row) {
    const panel = detailRowFor(row)?.querySelector('.registry-targeted-detail-panel');
    if (!panel) return;
    panel.replaceChildren();
    const status = document.createElement('div');
    status.className = 'registry-targeted-detail-status';
    status.textContent = 'Po ngarkohen detajet e barit…';
    panel.appendChild(status);
  }

  function renderError(row, message) {
    const id = drugId(row);
    const panel = detailRowFor(row)?.querySelector('.registry-targeted-detail-panel');
    if (!panel) return;
    panel.replaceChildren();
    const status = document.createElement('div');
    status.className = 'registry-targeted-detail-status';
    status.textContent = clean(message) || 'Detajet nuk u ngarkuan.';
    const actions = document.createElement('div');
    actions.className = 'registry-targeted-detail-actions';
    actions.append(retryButton(row), fullRuntimeButton(id));
    panel.append(status, actions);
  }

  function appendSources(panel, sources) {
    const safe = Array.isArray(sources)
      ? [...new Set(sources.map(clean).filter(value => /^https:\/\//i.test(value)))].slice(0, 8)
      : [];
    if (!safe.length) return;
    const section = document.createElement('section');
    section.className = 'registry-targeted-detail-section';
    const heading = document.createElement('h4');
    heading.textContent = 'Burimet';
    const links = document.createElement('div');
    links.className = 'registry-targeted-detail-sources';
    safe.forEach((url, index) => {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Burimi ' + (index + 1);
      links.appendChild(link);
    });
    section.append(heading, links);
    panel.appendChild(section);
  }

  function renderDetail(row, payload) {
    const id = drugId(row);
    const detailRow = detailRowFor(row);
    const panel = detailRow?.querySelector('.registry-targeted-detail-panel');
    if (!detailRow || !panel) return;
    panel.replaceChildren();

    const registry = payload.registry || {};
    const clinical = payload.clinical || {};
    const profile = clinical.profile || {};

    const head = document.createElement('div');
    head.className = 'registry-targeted-detail-head';
    const titleWrap = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = clean(registry.tradeName) || clean(row.querySelector('.drug-name-text')?.textContent) || 'Detajet e barit';
    const subtitle = document.createElement('span');
    subtitle.textContent = [registry.activeSubstance, registry.strength, registry.form].map(clean).filter(Boolean).join(' · ');
    titleWrap.append(title, subtitle);
    const source = document.createElement('span');
    source.className = 'registry-targeted-detail-status';
    source.textContent = 'Neon · vetëm ky bar';
    head.append(titleWrap, source);
    panel.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'registry-targeted-detail-grid';
    [
      makeSection('Regjistri', [
        ['ATC', registry.atc], ['Klasa', registry.drugClass], ['Përdorimi', registry.use],
        ['Paketimi', registry.packaging], ['Prodhuesi', registry.manufacturer],
        ['Mbajtësi i autorizimit', registry.marketingAuthorizationHolder], ['Statusi', registry.productStatus],
        ['Çmimi me pakicë', registry.retailPrice], ['Vlefshmëria', registry.validity],
      ]),
      makeSection('Doza për të rritur', regimenFields(clinical.adult)),
      makeSection('Doza pediatrike', regimenFields(clinical.pediatric)),
      makeSection('Profili klinik', [
        ['Përmbledhje', profile.summary], ['Indikacionet', profile.indications],
        ['Kundërindikacionet', profile.contraindications], ['Paralajmërimet', profile.warnings],
        ['Ndërveprimet', profile.interactions],
      ]),
      makeSection('Përdorimi i sigurt', [
        ['Shtatzënia / gjidhënia', profile.pregnancyLactation], ['Përshtatja renale', profile.renalAdjustment],
        ['Përshtatja hepatike', profile.hepaticAdjustment], ['Monitorimi', profile.monitoring],
        ['Administrimi', profile.administrationNotes],
      ]),
    ].filter(Boolean).forEach(section => grid.appendChild(section));
    if (grid.children.length) panel.appendChild(grid);

    if (payload.registryError || payload.clinicalError) {
      const warning = document.createElement('div');
      warning.className = 'registry-targeted-detail-status';
      warning.textContent = payload.registryError && payload.clinicalError
        ? 'Detajet nuk u ngarkuan plotësisht.'
        : payload.clinicalError ? 'Pjesa klinike nuk u ngarkua plotësisht.' : 'Pjesa e regjistrit nuk u ngarkua plotësisht.';
      panel.appendChild(warning);
    }

    appendSources(panel, clinical.sources);
    const actions = document.createElement('div');
    actions.className = 'registry-targeted-detail-actions';
    actions.append(retryButton(row), fullRuntimeButton(id));
    panel.appendChild(actions);
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    if (!payload?.ok) throw new Error('Përgjigjja e detajit është e pavlefshme.');
    return payload;
  }

  function loadDetail(id) {
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    if (inflight.has(id)) return inflight.get(id);
    const encoded = encodeURIComponent(id);
    const task = Promise.allSettled([
      fetchJson(REGISTRY_DETAIL_API + '?view=registry-detail&id=' + encoded),
      fetchJson(CLINICAL_DETAIL_API + '?view=card&id=' + encoded),
    ]).then(([registryResult, clinicalResult]) => {
      if (registryResult.status === 'rejected' && clinicalResult.status === 'rejected') {
        throw new Error('Detajet e barit nuk u ngarkuan.');
      }
      const payload = {
        registry:registryResult.status === 'fulfilled' ? registryResult.value.row : null,
        clinical:clinicalResult.status === 'fulfilled' ? clinicalResult.value : null,
        registryError:registryResult.status === 'rejected',
        clinicalError:clinicalResult.status === 'rejected',
      };
      cache.set(id, payload);
      return payload;
    }).finally(() => inflight.delete(id));
    inflight.set(id, task);
    return task;
  }

  async function ensureDetail(row, { force = false } = {}) {
    if (!active()) return false;
    const id = drugId(row);
    if (!id) return false;
    const detailRow = detailRowFor(row);
    if (!detailRow) return false;
    detailRow.hidden = row.dataset.registryRowExpanded !== 'true';
    if (force) cache.delete(id);
    if (cache.has(id)) {
      renderDetail(row, cache.get(id));
      return true;
    }
    renderLoading(row);
    try {
      renderDetail(row, await loadDetail(id));
      return true;
    } catch (error) {
      renderError(row, error?.message);
      return false;
    }
  }

  function syncRow(row) {
    if (!active()) return;
    const id = drugId(row);
    if (!id) return;
    const expanded = row.dataset.registryRowExpanded === 'true';
    const detailRow = expanded ? detailRowFor(row) : row.nextElementSibling;
    if (detailRow?.classList?.contains('registry-targeted-detail-row') && detailRow.dataset.targetedDetailFor === id) {
      detailRow.hidden = !expanded;
    }
    if (expanded) void ensureDetail(row);
  }

  function scan() {
    if (!active()) return;
    document.querySelectorAll('#tbody > tr[data-desktop-lite-row]').forEach(syncRow);
  }

  function interceptTradeName(event) {
    if (!active()) return;
    const cell = event.target.closest?.('#tbody > tr[data-desktop-lite-row] > td[data-registry-column-key="trade-name"]');
    if (!cell || event.target.closest('button,a,input,select,textarea')) return;
    if (event.target.closest('.drug-name-text')) return;
    const row = cell.closest('tr');
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.MedIndexRegistryRows?.toggleRow?.(row);
  }

  function observe() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    tbody.addEventListener('click', interceptTradeName, true);
    const observer = new MutationObserver(records => {
      let needsScan = false;
      records.forEach(record => {
        if (record.type === 'attributes') syncRow(record.target);
        else needsScan = true;
      });
      if (needsScan) queueMicrotask(scan);
    });
    observer.observe(tbody, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['data-registry-row-expanded'],
    });
    scan();
  }

  function init() {
    ensureStyles();
    observe();
    ['medindex:desktop-lite-ready', 'medindex:registry-page-ready', 'medindex:registry-table-stable']
      .forEach(name => window.addEventListener(name, scan));
    document.documentElement.dataset.registryDesktopTargetedDetail = VERSION;
  }

  window.MedIndexDesktopTargetedDetail = Object.freeze({
    version:VERSION,
    open(row) {
      if (!row) return false;
      window.MedIndexRegistryRows?.toggleRow?.(row, true);
      void ensureDetail(row);
      return true;
    },
    retry(row) { return ensureDetail(row, { force:true }); },
    cacheSize() { return cache.size; },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
