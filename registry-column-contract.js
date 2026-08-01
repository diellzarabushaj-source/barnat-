(() => {
  'use strict';

  const VERSION = 'registry-column-contract-20260801-1';
  const MAP = Object.freeze({
    perrecete:'select', zgjidh:'select', nr:'number', nrrendor:'number',
    emritregtar:'trade-name', emri:'trade-name', substancaaktive:'active-substance',
    atc:'atc', atccode:'atc', klasackaeshte:'drug-class', klasa:'drug-class',
    perdorimifjalekyce:'use', perdorimi:'use', pdid:'pdid', protocolno:'protocol',
    protokolli:'protocol', protokoli:'protocol', fortesia:'strength', forma:'form',
    formafarmaceutike:'form', sishenohetnerecete:'prescription-label',
    sheniminerecete:'prescription-label', paketimi:'packaging', madhesiaepaketimit:'packaging',
    bartesiiautorizimit:'mah', bartesiiautorizimmarketingut:'mah', prodhuesi:'manufacturer',
    certifikatama:'ma-certificate', macertifikata:'ma-certificate', statusi:'status',
    cmshumice:'wholesale-price', cmimimeshumice:'wholesale-price',
    cmmarzhe:'margin-price', cmimimemarzhe:'margin-price', tvsh:'vat',
    cmpakice:'retail-price', cmimimepakice:'retail-price', afati:'validity',
    afatiivlefshmerise:'validity', dozimiipertetritur:'dosage-adult',
    dozimiiperritur:'dosage-adult', dozimiiperfemije:'dosage-pediatric',
    dozimipediatrik:'dosage-pediatric', verifikimi:'clinical-status', redakto:'clinical-action',
  });

  let headerObserver = null;
  let bodyObserver = null;
  let scheduled = false;
  let pending = false;
  let fallbackTimer = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .replace(/[▲▼↕]/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');

  function infer(cell) {
    const existing = clean(cell?.dataset?.registryColumnKey);
    if (existing) return existing;
    if (cell?.dataset?.registryDosageColumn === 'adult') return 'dosage-adult';
    if (cell?.dataset?.registryDosageColumn === 'pediatric') return 'dosage-pediatric';
    if (cell?.dataset?.clinicalEditorColumn === 'clinical-status') return 'clinical-status';
    if (cell?.dataset?.clinicalEditorColumn === 'clinical-action') return 'clinical-action';
    if (cell?.classList?.contains('select-col')) return 'select';
    return MAP[normalize(cell?.dataset?.label || cell?.dataset?.sourceLabel || cell?.textContent)] || '';
  }

  function stampCell(cell) {
    const key = infer(cell);
    if (!key || cell.dataset.registryColumnKey === key) return false;
    cell.dataset.registryColumnKey = key;
    return true;
  }

  function stampTable() {
    let changed = 0;
    document.querySelectorAll('#headerRow > th').forEach(cell => { if (stampCell(cell)) changed += 1; });
    document.querySelectorAll('#tbody > tr > td').forEach(cell => { if (stampCell(cell)) changed += 1; });
    document.documentElement.dataset.registryColumnContract = VERSION;
    return changed;
  }

  function table() {
    return document.getElementById('dataTable');
  }

  function markPending() {
    const node = table();
    if (!node || pending) return;
    pending = true;
    node.dataset.registryUnifiedPending = 'true';
    node.style.visibility = 'hidden';
    window.clearTimeout(fallbackTimer);
    fallbackTimer = window.setTimeout(clearPending, 1200);
  }

  function clearPending() {
    const node = table();
    pending = false;
    window.clearTimeout(fallbackTimer);
    if (!node) return;
    delete node.dataset.registryUnifiedPending;
    node.style.removeProperty('visibility');
  }

  function reconcileContract() {
    scheduled = false;
    const changed = stampTable();
    if (!changed) return;
    markPending();
    window.MedIndexRegistryUnified?.refresh?.();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(reconcileContract);
  }

  function observe() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (header) {
      if (!headerObserver) headerObserver = new MutationObserver(schedule);
      headerObserver.observe(header, { childList:true });
    }
    if (tbody) {
      if (!bodyObserver) bodyObserver = new MutationObserver(schedule);
      bodyObserver.observe(tbody, { childList:true });
    }
  }

  function start() {
    stampTable();
    observe();
    window.addEventListener('medindex:registry-table-stable', clearPending);
    ['medindex:registry-data-ready', 'medindex:registry-ready', 'medindex:registry-dosage-ready']
      .forEach(name => window.addEventListener(name, schedule));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexRegistryColumnContract = Object.freeze({
    version:VERSION,
    refresh() { schedule(); },
  });
})();
