(() => {
  'use strict';

  const VERSION = 'registry-ux-phase2-v1.0.1';
  let rawSource = null;
  let rawByDrugKey = new Map();
  let scheduled = false;
  let scrollFrame = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function drugKeyFromRaw(row) {
    return [row?.PDID, row?.['Emri tregtar'], row?.['Fortësia']].map(clean).join('|');
  }

  function refreshRawIndex() {
    const rows = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
    if (rows === rawSource) return;
    rawSource = rows;
    rawByDrugKey = new Map();
    rows.forEach(row => {
      const key = drugKeyFromRaw(row);
      if (key && !rawByDrugKey.has(key)) rawByDrugKey.set(key, row);
    });
  }

  function rawForRow(row) {
    refreshRawIndex();
    const key = clean(row?.querySelector?.('.drug-select')?.dataset?.drugKey || row?.dataset?.drugKey);
    return key ? rawByDrugKey.get(key) || null : null;
  }

  function statusClass(status) {
    const value = clean(status).toLowerCase();
    if (value.includes('gjenerik')) return 'is-generic';
    if (value.includes('origjinator')) return 'is-originator';
    return '';
  }

  function ensureScanMeta(row) {
    if (!(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;
    const nameCell = row.querySelector('[data-registry-column-key="trade-name"],td.name');
    if (!nameCell) return;

    const raw = rawForRow(row);
    const atc = clean(raw?.['ATC Code']);
    const status = clean(raw?.Statusi);
    if (!atc && !status) return;

    let meta = nameCell.querySelector(':scope > .registry-scan-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'registry-scan-meta';
      meta.dataset.registryUiOnly = 'true';
      nameCell.appendChild(meta);
    }

    const signature = `${atc}|${status}`;
    if (meta.dataset.signature === signature) return;
    meta.dataset.signature = signature;
    meta.replaceChildren();

    if (atc) {
      const chip = document.createElement('span');
      chip.className = 'registry-scan-atc';
      chip.textContent = atc;
      chip.title = `ATC ${atc}`;
      meta.appendChild(chip);
    }

    if (status) {
      const chip = document.createElement('span');
      chip.className = ['registry-scan-status', statusClass(status)].filter(Boolean).join(' ');
      chip.textContent = status;
      meta.appendChild(chip);
    }

    row.dataset.registryScanReady = 'true';
  }

  function decorateHeaders() {
    const header = document.getElementById('headerRow');
    if (!header) return;
    const groups = {
      'trade-name':'identity',
      'active-substance':'identity',
      strength:'identity',
      form:'identity',
      'dosage-adult':'adult-dose',
      'dosage-pediatric':'pediatric-dose',
      'clinical-status':'safety',
      'clinical-action':'safety',
      'dose-calculator':'action',
      'personal-note':'personal',
    };
    header.querySelectorAll('[data-registry-column-key]').forEach(cell => {
      const key = clean(cell.dataset.registryColumnKey);
      const group = groups[key];
      if (group) cell.dataset.registryScanGroup = group;
    });
  }

  function updateHorizontalState() {
    const wrapper = document.getElementById('registryContent');
    if (!wrapper) return;
    wrapper.classList.toggle('is-scrolled-x', wrapper.scrollLeft > 4);
    wrapper.classList.toggle('is-scrollable-x', wrapper.scrollWidth > wrapper.clientWidth + 2);
  }

  function decorateVisibleRows() {
    decorateHeaders();
    document.querySelectorAll('#tbody > tr').forEach(ensureScanMeta);
    updateHorizontalState();
    document.documentElement.dataset.registryUxPhase2 = VERSION;
    document.body?.classList.add('registry-ux-phase2-ready');
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateVisibleRows();
    });
  }

  function bindScroller() {
    const wrapper = document.getElementById('registryContent');
    if (!wrapper || wrapper.dataset.registryPhase2ScrollBound === 'true') return;
    wrapper.dataset.registryPhase2ScrollBound = 'true';
    wrapper.addEventListener('scroll', () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(updateHorizontalState);
    }, { passive:true });
    window.addEventListener('resize', updateHorizontalState, { passive:true });
    updateHorizontalState();
  }

  function bind() {
    bindScroller();
    scheduleDecorate();
    ['medindex:registry-rendered','medindex:registry-ready','medindex:registry-data-ready']
      .forEach(name => window.addEventListener(name, scheduleDecorate, { passive:true }));
    window.addEventListener('medindex:personal-note-saved', scheduleDecorate, { passive:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  window.MedIndexRegistryUXPhase2 = Object.freeze({
    version:VERSION,
    refresh:scheduleDecorate,
  });
})();
