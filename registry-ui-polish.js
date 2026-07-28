(() => {
  'use strict';

  const VERSION = 'registry-ui-polish-20260728-1';
  const STYLE_ID = 'registryUiPolishStyles';
  const STYLE_HREF = '/registry-ui-polish.css?v=20260728-1';
  const HEADER_CLASSES = ['registry-sticky-name', 'registry-active-substance'];
  let headerObserver = null;
  let tbodyObserver = null;
  let headObserver = null;
  let enhanceQueued = false;
  let clinicalTimer = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const headerLabel = cell => clean(cell?.textContent).replace(/[▲▼↕]/g, '').trim();

  function ensureStyles() {
    let link = document.getElementById(STYLE_ID);
    if (!link) {
      link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.dataset.registryUiPolish = VERSION;
    }
    if (link.getAttribute('href') !== STYLE_HREF) link.href = STYLE_HREF;
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  function tagHeader() {
    document.querySelectorAll('#headerRow > th').forEach(cell => {
      cell.setAttribute('scope', 'col');
      HEADER_CLASSES.forEach(className => cell.classList.remove(className));
      const label = headerLabel(cell);
      if (label === 'Emri Tregtar') cell.classList.add('registry-sticky-name');
      else if (label === 'Substanca Aktive') cell.classList.add('registry-active-substance');
    });
  }

  function compactSingleDosage(cell) {
    if (cell.dataset.registryUiPolished === VERSION) return;
    const regimen = cell.querySelector(':scope > .registry-dosage-regimen');
    if (!regimen) return;

    const dose = clean(regimen.firstElementChild?.textContent);
    const route = clean(regimen.querySelector('.registry-dosage-route')?.textContent);
    if (!dose) return;

    const details = document.createElement('details');
    details.className = 'registry-dosage-details registry-dosage-compact registry-dosage-single';

    const summary = document.createElement('summary');
    const preview = document.createElement('span');
    preview.className = 'registry-dosage-preview';
    preview.textContent = route && route !== '—' ? `${dose} · ${route}` : dose;
    const more = document.createElement('span');
    more.className = 'registry-dosage-more';
    more.textContent = 'Më shumë';
    summary.append(preview, more);

    const expanded = document.createElement('div');
    expanded.className = 'registry-dosage-expanded';
    expanded.append(...Array.from(cell.childNodes));
    details.append(summary, expanded);
    cell.appendChild(details);
    cell.dataset.registryUiPolished = VERSION;
  }

  function compactMultipleDosage(details) {
    if (details.dataset.registryUiPolished === VERSION) return;
    details.classList.add('registry-dosage-compact', 'registry-dosage-multiple');
    const summary = details.querySelector(':scope > summary');
    if (summary && !summary.querySelector('.registry-dosage-more')) {
      const label = clean(summary.textContent).replace(/\s*·?\s*Më shumë$/i, '');
      summary.textContent = '';
      const preview = document.createElement('span');
      preview.className = 'registry-dosage-preview';
      preview.textContent = label;
      const more = document.createElement('span');
      more.className = 'registry-dosage-more';
      more.textContent = 'Më shumë';
      summary.append(preview, more);
    }
    details.dataset.registryUiPolished = VERSION;
  }

  function polishDosageCells() {
    document.querySelectorAll('#tbody > tr > td.registry-dosage-column').forEach(cell => {
      const existingDetails = cell.querySelector(':scope > .registry-dosage-details');
      if (existingDetails) compactMultipleDosage(existingDetails);
      else compactSingleDosage(cell);
    });
  }

  function enhance() {
    enhanceQueued = false;
    ensureStyles();
    tagHeader();
    polishDosageCells();
    document.documentElement.dataset.registryUiPolish = VERSION;
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => requestAnimationFrame(enhance));
  }

  function waitForClinicalData(attempt = 0) {
    clearTimeout(clinicalTimer);
    const dosage = window.MedIndexRegistryDosage;
    if (dosage?.clinicalStatus?.() && dosage.clinicalStatus() !== 'loading') {
      scheduleEnhance();
      return;
    }
    if (attempt >= 120) return;
    clinicalTimer = window.setTimeout(() => waitForClinicalData(attempt + 1), 250);
  }

  function watchDosageRuntime() {
    const bind = script => {
      if (!script || script.dataset.registryUiPolishBound) return;
      script.dataset.registryUiPolishBound = '1';
      script.addEventListener('load', () => waitForClinicalData(), { once:true });
      if (window.MedIndexRegistryDosage) waitForClinicalData();
    };

    bind(document.querySelector('script[data-registry-dosage-runtime]'));
    if (headObserver) return;
    headObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLScriptElement && node.matches('[data-registry-dosage-runtime]')) bind(node);
        }
      }
    });
    headObserver.observe(document.head, { childList:true });
  }

  function observeTable() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (header && !headerObserver) {
      headerObserver = new MutationObserver(scheduleEnhance);
      headerObserver.observe(header, { childList:true });
    }
    if (tbody && !tbodyObserver) {
      tbodyObserver = new MutationObserver(scheduleEnhance);
      tbodyObserver.observe(tbody, { childList:true });
    }
  }

  function boot() {
    ensureStyles();
    observeTable();
    watchDosageRuntime();
    scheduleEnhance();
    waitForClinicalData();
  }

  window.addEventListener('medindex:tailadmin-ready', boot);
  window.addEventListener('medindex:registry-ready', boot, { once:true });
  window.addEventListener('medindex:registry-data-ready', scheduleEnhance);
  window.addEventListener('pageshow', scheduleEnhance, { passive:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.MedIndexRegistryUiPolish = { version:VERSION, refresh:scheduleEnhance };
})();
