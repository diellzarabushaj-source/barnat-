'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'phase12-targeted-desktop-detail-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 12 targeted detail patch could not find ${label}.`);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) throw new Error(`Phase 12 targeted detail patch could not find ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchDesktopLite() {
  let source = read('registry-desktop-lite.js');
  if (source.includes(`const TARGETED_DESKTOP_DETAIL_RUNTIME = '${MARKER}';`)) return;

  source = replaceOnce(
    source,
    `  const HANDOFF_TIMEOUT_MS = 45000;`,
    `  const HANDOFF_TIMEOUT_MS = 45000;\n  const TARGETED_DESKTOP_DETAIL_RUNTIME = '${MARKER}';`,
    'desktop targeted-detail marker',
  );

  const oldBlockStart = `    tbody.querySelectorAll('[data-registry-column-key="trade-name"]').forEach(cell => {`;
  const oldBlockEnd = `  function renderCount() {`;
  const replacement = `    tbody.querySelectorAll('[data-registry-column-key="trade-name"]').forEach(cell => {
      cell.addEventListener('click', event => {
        if (event.target.closest('input,button,a')) return;
        const row = cell.closest('tr');
        if (!row) return;
        const toggled = window.MedIndexRegistryRows?.toggleRow?.(row);
        if (typeof toggled !== 'boolean') row.querySelector('.registry-row-details-toggle')?.click();
      });
    });
  }

  function renderCount() {`;
  source = replaceBlock(source, oldBlockStart, oldBlockEnd, replacement, 'desktop trade-name detail handoff');

  if (source.includes("requestFullRegistry('desktop-full-detail'")) throw new Error('Phase 12 trade-name click still triggers full registry.');
  if (!source.includes('window.MedIndexRegistryRows?.toggleRow?.(row)')) throw new Error('Phase 12 desktop row expander delegation missing.');
  write('registry-desktop-lite.js', source);
}

function patchRowExpand() {
  let source = read('registry-row-expand.js');
  if (source.includes(`const TARGETED_DETAIL_VERSION = '${MARKER}';`)) return;

  source = replaceOnce(
    source,
    `  const expandedRows = new Set();`,
    `  const expandedRows = new Set();\n  const TARGETED_DETAIL_VERSION = '${MARKER}';\n  const TARGETED_DETAIL_STYLE_ID = 'registryTargetedDetailStyles';\n  const targetedDetailCache = new Map();\n  const targetedDetailInflight = new Map();`,
    'targeted detail state',
  );

  const helperAnchor = `  function syncRowState(row) {`;
  const helpers = `  function desktopLiteDrugId(row) {
    return clean(row?.dataset?.desktopLiteRow);
  }

  function targetedDesktopRow(row) {
    const id = desktopLiteDrugId(row);
    return Boolean(window.MEDINDEX_DESKTOP_LITE_ACTIVE && /^[0-9a-f-]{36}$/i.test(id));
  }

  function ensureTargetedDetailStyles() {
    if (document.getElementById(TARGETED_DETAIL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TARGETED_DETAIL_STYLE_ID;
    style.textContent = `
      #tbody > tr.registry-targeted-detail-row > td{padding:0!important;border-top:0!important}
      .registry-targeted-detail-panel{padding:16px 18px 18px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);background:var(--card-bg,var(--surface,#fff));color:inherit}
      .registry-targeted-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
      .registry-targeted-detail-head strong{display:block;font-size:15px;line-height:1.35}
      .registry-targeted-detail-head span{display:block;margin-top:3px;font-size:12px;opacity:.7}
      .registry-targeted-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px}
      .registry-targeted-detail-section{min-width:0;padding:12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:10px}
      .registry-targeted-detail-section h4{margin:0 0 8px;font-size:12px;line-height:1.3;text-transform:uppercase;letter-spacing:.04em;opacity:.72}
      .registry-targeted-detail-field{display:grid;grid-template-columns:minmax(105px,.42fr) minmax(0,1fr);gap:8px;margin-top:7px;font-size:13px;line-height:1.45}
      .registry-targeted-detail-field:first-of-type{margin-top:0}
      .registry-targeted-detail-field b{font-weight:600;opacity:.76}
      .registry-targeted-detail-field span{min-width:0;overflow-wrap:anywhere}
      .registry-targeted-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .registry-targeted-detail-actions button,.registry-targeted-detail-sources a{min-height:36px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;padding:7px 10px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:none}
      .registry-targeted-detail-sources{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .registry-targeted-detail-status{font-size:13px;opacity:.75}
      @media(max-width:1100px){.registry-targeted-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:767px){.registry-targeted-detail-row{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function targetedDetailRow(row) {
    const drugId = desktopLiteDrugId(row);
    if (!drugId) return null;
    const next = row.nextElementSibling;
    if (next?.classList?.contains('registry-targeted-detail-row') && next.dataset.targetedDetailFor === drugId) return next;
    const detailRow = document.createElement('tr');
    detailRow.className = 'registry-targeted-detail-row';
    detailRow.dataset.targetedDetailFor = drugId;
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

  function detailField(container, label, value) {
    const text = clean(value);
    if (!text) return;
    const field = document.createElement('div');
    field.className = 'registry-targeted-detail-field';
    const key = document.createElement('b');
    key.textContent = label;
    const val = document.createElement('span');
    val.textContent = text;
    field.append(key, val);
    container.appendChild(field);
  }

  function detailSection(title, entries) {
    const section = document.createElement('section');
    section.className = 'registry-targeted-detail-section';
    const heading = document.createElement('h4');
    heading.textContent = title;
    section.appendChild(heading);
    let count = 0;
    entries.forEach(([label, value]) => {
      if (!clean(value)) return;
      detailField(section, label, value);
      count += 1;
    });
    return count ? section : null;
  }

  function regimenEntries(regimen) {
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

  function appendTargetedSources(panel, sources) {
    const safeSources = Array.isArray(sources) ? sources.filter(value => /^https:\/\//i.test(clean(value))).slice(0, 8) : [];
    if (!safeSources.length) return;
    const section = document.createElement('section');
    section.className = 'registry-targeted-detail-section';
    const heading = document.createElement('h4');
    heading.textContent = 'Burimet';
    const links = document.createElement('div');
    links.className = 'registry-targeted-detail-sources';
    safeSources.forEach((url, index) => {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `Burimi ${index + 1}`;
      links.appendChild(link);
    });
    section.append(heading, links);
    panel.appendChild(section);
  }

  function fullDetailButton(drugId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Hap funksionet e plota';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent('medindex:request-full-registry', { detail:{ reason:'desktop-targeted-detail-advanced', drugId } }));
    });
    return button;
  }

  function renderTargetedDetail(row, payload) {
    const detailRow = targetedDetailRow(row);
    const panel = detailRow?.querySelector('.registry-targeted-detail-panel');
    if (!detailRow || !panel) return;
    panel.replaceChildren();

    const registry = payload?.registry || {};
    const clinical = payload?.clinical || {};
    const profile = clinical.profile || {};
    const head = document.createElement('div');
    head.className = 'registry-targeted-detail-head';
    const titleWrap = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = clean(registry.tradeName) || clean(row.querySelector('.drug-name-text')?.textContent) || 'Detajet e barit';
    const subtitle = document.createElement('span');
    subtitle.textContent = [clean(registry.activeSubstance), clean(registry.strength), clean(registry.form)].filter(Boolean).join(' · ');
    titleWrap.append(title, subtitle);
    const state = document.createElement('span');
    state.className = 'registry-targeted-detail-status';
    state.textContent = 'Neon · detaj i kufizuar';
    head.append(titleWrap, state);
    panel.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'registry-targeted-detail-grid';
    const sections = [
      detailSection('Regjistri', [
        ['ATC', registry.atc], ['Klasa', registry.drugClass], ['Përdorimi', registry.use],
        ['Paketimi', registry.packaging], ['Prodhuesi', registry.manufacturer],
        ['Mbajtësi i autorizimit', registry.marketingAuthorizationHolder], ['Statusi', registry.productStatus],
        ['Çmimi me pakicë', registry.retailPrice], ['Vlefshmëria', registry.validity],
      ]),
      detailSection('Doza për të rritur', regimenEntries(clinical.adult)),
      detailSection('Doza pediatrike', regimenEntries(clinical.pediatric)),
      detailSection('Profili klinik', [
        ['Përmbledhje', profile.summary], ['Indikacionet', profile.indications],
        ['Kundërindikacionet', profile.contraindications], ['Paralajmërimet', profile.warnings],
        ['Ndërveprimet', profile.interactions],
      ]),
      detailSection('Përdorimi i sigurt', [
        ['Shtatzënia / gjidhënia', profile.pregnancyLactation], ['Përshtatja renale', profile.renalAdjustment],
        ['Përshtatja hepatike', profile.hepaticAdjustment], ['Monitorimi', profile.monitoring],
        ['Administrimi', profile.administrationNotes],
      ]),
    ].filter(Boolean);
    sections.forEach(section => grid.appendChild(section));
    if (sections.length) panel.appendChild(grid);

    if (payload?.registryError || payload?.clinicalError) {
      const warning = document.createElement('div');
      warning.className = 'registry-targeted-detail-status';
      warning.textContent = payload.registryError && payload.clinicalError
        ? 'Detajet nuk u ngarkuan plotësisht.'
        : payload.clinicalError ? 'Pjesa klinike nuk u ngarkua plotësisht.' : 'Pjesa e regjistrit nuk u ngarkua plotësisht.';
      panel.appendChild(warning);
    }

    appendTargetedSources(panel, clinical.sources);
    const actions = document.createElement('div');
    actions.className = 'registry-targeted-detail-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Riprovo';
    retry.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const id = desktopLiteDrugId(row);
      targetedDetailCache.delete(id);
      void ensureTargetedDetail(row, { force:true });
    });
    actions.append(retry, fullDetailButton(desktopLiteDrugId(row)));
    panel.appendChild(actions);
  }

  function renderTargetedLoading(row) {
    const detailRow = targetedDetailRow(row);
    const panel = detailRow?.querySelector('.registry-targeted-detail-panel');
    if (!detailRow || !panel) return;
    panel.replaceChildren();
    const status = document.createElement('div');
    status.className = 'registry-targeted-detail-status';
    status.textContent = 'Po ngarkohen detajet e barit…';
    panel.appendChild(status);
  }

  function renderTargetedError(row, message) {
    const detailRow = targetedDetailRow(row);
    const panel = detailRow?.querySelector('.registry-targeted-detail-panel');
    if (!detailRow || !panel) return;
    panel.replaceChildren();
    const status = document.createElement('div');
    status.className = 'registry-targeted-detail-status';
    status.textContent = clean(message) || 'Detajet nuk u ngarkuan.';
    const actions = document.createElement('div');
    actions.className = 'registry-targeted-detail-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Riprovo';
    retry.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      targetedDetailCache.delete(desktopLiteDrugId(row));
      void ensureTargetedDetail(row, { force:true });
    });
    actions.append(retry, fullDetailButton(desktopLiteDrugId(row)));
    panel.append(status, actions);
  }

  async function fetchTargetedJson(url) {
    const response = await fetch(url, { credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    if (!payload?.ok) throw new Error('Përgjigjja e detajit është e pavlefshme.');
    return payload;
  }

  async function loadTargetedDetail(drugId) {
    if (targetedDetailCache.has(drugId)) return targetedDetailCache.get(drugId);
    if (targetedDetailInflight.has(drugId)) return targetedDetailInflight.get(drugId);
    const task = (async () => {
      const encoded = encodeURIComponent(drugId);
      const [registryResult, clinicalResult] = await Promise.allSettled([
        fetchTargetedJson('/api/drug-search?view=registry-detail&id=' + encoded),
        fetchTargetedJson('/api/dosage?view=card&id=' + encoded),
      ]);
      if (registryResult.status === 'rejected' && clinicalResult.status === 'rejected') {
        throw new Error('Detajet e barit nuk u ngarkuan.');
      }
      const payload = {
        registry:registryResult.status === 'fulfilled' ? registryResult.value.row : null,
        clinical:clinicalResult.status === 'fulfilled' ? clinicalResult.value : null,
        registryError:registryResult.status === 'rejected',
        clinicalError:clinicalResult.status === 'rejected',
      };
      targetedDetailCache.set(drugId, payload);
      return payload;
    })().finally(() => targetedDetailInflight.delete(drugId));
    targetedDetailInflight.set(drugId, task);
    return task;
  }

  async function ensureTargetedDetail(row, { force = false } = {}) {
    if (!targetedDesktopRow(row)) return false;
    ensureTargetedDetailStyles();
    const drugId = desktopLiteDrugId(row);
    const detailRow = targetedDetailRow(row);
    if (detailRow) detailRow.hidden = !expandedRows.has(rowKey(row));
    if (force) targetedDetailCache.delete(drugId);
    if (targetedDetailCache.has(drugId)) {
      renderTargetedDetail(row, targetedDetailCache.get(drugId));
      return true;
    }
    renderTargetedLoading(row);
    try {
      const payload = await loadTargetedDetail(drugId);
      renderTargetedDetail(row, payload);
      return true;
    } catch (error) {
      renderTargetedError(row, error?.message);
      return false;
    }
  }

  function syncTargetedDetailVisibility(row, expanded) {
    if (!targetedDesktopRow(row)) return;
    const detailRow = targetedDetailRow(row);
    if (detailRow) detailRow.hidden = !expanded;
    if (expanded) void ensureTargetedDetail(row);
  }

${helperAnchor}`;
  source = replaceOnce(source, helperAnchor, helpers, 'targeted detail helpers');

  source = replaceOnce(
    source,
    `      if (row.querySelector('.empty-state')) return;`,
    `      if (row.querySelector('.empty-state') || row.classList.contains('registry-targeted-detail-row')) return;`,
    'skip targeted detail rows during enhancement',
  );

  const toggleBlock = `  function toggleRow(row, force) {
    if (!row || row.querySelector('.empty-state')) return false;
    const key = rowKey(row);
    if (!key) return false;
    const next = typeof force === 'boolean' ? force : !expandedRows.has(key);
    if (next) expandedRows.add(key);
    else expandedRows.delete(key);
    syncRowState(row);
    syncTargetedDetailVisibility(row, next);
    return next;
  }

`;
  source = replaceBlock(source, '  function toggleRow(row, force) {', '  function interactiveTarget', toggleBlock, 'targeted-aware row toggle');

  source = replaceOnce(
    source,
    `  function init() {\n    document.addEventListener('click', onClick, true);`,
    `  function init() {\n    ensureTargetedDetailStyles();\n    document.addEventListener('click', onClick, true);`,
    'targeted detail style initialization',
  );

  source = replaceOnce(
    source,
    `    toggleRow,\n    refresh:scheduleEnhance,`,
    `    toggleRow,\n    openTargetedDetail:row => ensureTargetedDetail(row, { force:false }),\n    refresh:scheduleEnhance,`,
    'targeted detail API export',
  );

  if (!source.includes(`const TARGETED_DETAIL_VERSION = '${MARKER}';`)) throw new Error('Phase 12 targeted detail runtime marker missing.');
  if (!source.includes("fetchTargetedJson('/api/drug-search?view=registry-detail&id=' + encoded)")) throw new Error('Phase 12 registry-detail fetch missing.');
  if (!source.includes("fetchTargetedJson('/api/dosage?view=card&id=' + encoded)")) throw new Error('Phase 12 targeted clinical-card fetch missing.');
  if (source.includes("requestFullRegistry('desktop-full-detail'")) throw new Error('Phase 12 must not restore automatic full-detail handoff.');
  write('registry-row-expand.js', source);
}

patchDesktopLite();
patchRowExpand();
console.log('Phase 12 desktop row detail uses one-drug registry + clinical reads, memory cache and explicit full-runtime fallback only.');
