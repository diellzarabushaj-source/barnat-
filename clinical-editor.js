(() => {
  'use strict';

  const VERSION = 'clinical-editor-live-v1';
  const ENDPOINT = '/api/clinical-editor';
  const DOSAGE_STORAGE_KEY = 'medindex-registry-dosage-columns-v2';
  const STATUS_COLUMN = 'clinical-status';
  const ACTION_COLUMN = 'clinical-action';
  const statusLabels = { pending:'Pa kontrolluar', in_review:'Në verifikim', verified:'I verifikuar' };

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  try {
    const current = JSON.parse(localStorage.getItem(DOSAGE_STORAGE_KEY) || '{}');
    if (current.adult === undefined && current.pediatric === undefined) {
      localStorage.setItem(DOSAGE_STORAGE_KEY, JSON.stringify({ adult:true, pediatric:true }));
    }
    document.documentElement.classList.remove('hide-registry-dosage-adult', 'hide-registry-dosage-pediatric');
  } catch {}

  let summary = { total:0, pending:0, inReview:0, verified:0, adultVerified:0, pediatricVerified:0, items:[] };
  let summaryMap = new Map();
  let currentRegistryNumber = null;
  let enhanceQueued = false;
  let enhancing = false;
  let tableObserver = null;
  let dialog = null;
  let form = null;
  let message = null;
  let progressButton = null;

  function statusClass(status) {
    return ['pending', 'in_review', 'verified'].includes(status) ? status : 'pending';
  }

  function updateProgressButton() {
    if (!progressButton) return;
    progressButton.textContent = `Auditimi ${summary.verified || 0}/${summary.total || 4006}`;
    progressButton.title = `${summary.pending || 0} pa kontrolluar · ${summary.inReview || 0} në verifikim · ${summary.adultVerified || 0} me dozë të rriturish · ${summary.pediatricVerified || 0} me dozë pediatrike`;
  }

  function ensureProgressButton() {
    if (progressButton?.isConnected) return;
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    progressButton = document.createElement('button');
    progressButton.type = 'button';
    progressButton.className = 'clinical-editor-progress';
    progressButton.dataset.clinicalEditorProgress = VERSION;
    progressButton.addEventListener('click', () => {
      const next = nextIncomplete(null);
      if (next) openEditor(next.registryNumber);
    });
    toolbar.insertBefore(progressButton, document.getElementById('countBadge') || null);
    updateProgressButton();
  }

  function buildHeaderIndex() {
    const map = new Map();
    Array.from(document.querySelectorAll('#headerRow > th')).forEach((header, index) => {
      const label = clean(header.textContent).replace(/[▲▼↕]/g, '').trim();
      if (label && !map.has(label)) map.set(label, index);
    });
    return map;
  }

  function registryNumberForRow(tableRow, headerIndex) {
    const directNumber = Number(clean(tableRow.querySelector('td[data-label="Nr"]')?.textContent));
    if (Number.isInteger(directNumber)) return directNumber;
    const index = headerIndex.get('Nr');
    const indexed = Number(clean(Number.isInteger(index) ? tableRow.children[index]?.textContent : ''));
    return Number.isInteger(indexed) ? indexed : null;
  }

  function statusMarkup(item) {
    const status = statusClass(item?.verificationStatus);
    const adult = item?.adultVerified ? '<span class="clinical-dose-check ok">Të rritur ✓</span>' : '<span class="clinical-dose-check missing">Të rritur —</span>';
    const pediatric = item?.pediatricVerified ? '<span class="clinical-dose-check ok">Fëmijë ✓</span>' : '<span class="clinical-dose-check missing">Fëmijë —</span>';
    return `<span class="clinical-status-badge ${status}">${escapeHtml(statusLabels[status])}</span><span class="clinical-dose-checks">${adult}${pediatric}</span>`;
  }

  function ensureHeader() {
    const header = document.getElementById('headerRow');
    if (!header) return;
    if (!header.querySelector(`[data-clinical-editor-column="${STATUS_COLUMN}"]`)) {
      const status = document.createElement('th');
      status.scope = 'col';
      status.dataset.clinicalEditorColumn = STATUS_COLUMN;
      status.className = 'clinical-editor-status-column';
      status.textContent = 'Verifikimi';
      header.appendChild(status);
    }
    if (!header.querySelector(`[data-clinical-editor-column="${ACTION_COLUMN}"]`)) {
      const action = document.createElement('th');
      action.scope = 'col';
      action.dataset.clinicalEditorColumn = ACTION_COLUMN;
      action.className = 'clinical-editor-action-column';
      action.textContent = 'Redakto';
      header.appendChild(action);
    }
  }

  function ensureRows() {
    const headerIndex = buildHeaderIndex();
    document.querySelectorAll('#tbody > tr').forEach(tableRow => {
      if (tableRow.querySelector('.empty-state')) {
        const cell = tableRow.querySelector('td');
        if (cell) cell.colSpan = document.querySelectorAll('#headerRow > th').length || 1;
        return;
      }
      const number = registryNumberForRow(tableRow, headerIndex);
      if (!number) return;
      tableRow.dataset.registryNumber = String(number);
      const item = summaryMap.get(number) || { registryNumber:number, verificationStatus:'pending' };

      let statusCell = tableRow.querySelector(`[data-clinical-editor-column="${STATUS_COLUMN}"]`);
      if (!statusCell) {
        statusCell = document.createElement('td');
        statusCell.dataset.clinicalEditorColumn = STATUS_COLUMN;
        statusCell.dataset.label = 'Verifikimi';
        statusCell.className = 'clinical-editor-status-column';
        tableRow.appendChild(statusCell);
      }
      const markup = statusMarkup(item);
      if (statusCell.innerHTML !== markup) statusCell.innerHTML = markup;

      let actionCell = tableRow.querySelector(`[data-clinical-editor-column="${ACTION_COLUMN}"]`);
      if (!actionCell) {
        actionCell = document.createElement('td');
        actionCell.dataset.clinicalEditorColumn = ACTION_COLUMN;
        actionCell.dataset.label = 'Redakto';
        actionCell.className = 'clinical-editor-action-column';
        tableRow.appendChild(actionCell);
      }
      if (!actionCell.querySelector('button')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'clinical-editor-open';
        button.textContent = 'Hap';
        button.addEventListener('click', () => openEditor(number));
        actionCell.replaceChildren(button);
      }
    });
  }

  function observeTable() {
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');
    if (!tableObserver) tableObserver = new MutationObserver(scheduleEnhance);
    if (tbody) tableObserver.observe(tbody, { childList:true });
    if (header) tableObserver.observe(header, { childList:true });
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    tableObserver?.disconnect();
    try {
      ensureProgressButton();
      ensureHeader();
      ensureRows();
      document.documentElement.dataset.clinicalEditor = VERSION;
    } finally {
      enhancing = false;
      observeTable();
    }
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      enhance();
    });
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials:'same-origin', cache:'no-store', ...options,
      headers:{ Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Kërkesa dështoi (${response.status}).`);
    return payload;
  }

  async function loadSummary() {
    const payload = await api(`${ENDPOINT}?summary=1`);
    summary = payload.summary || summary;
    summaryMap = new Map((summary.items || []).map(item => [Number(item.registryNumber), item]));
    updateProgressButton();
    scheduleEnhance();
  }

  function field(name, label, options = {}) {
    const tag = options.area ? 'textarea' : 'input';
    const attrs = options.area ? 'rows="3"' : `type="${options.type || 'text'}"`;
    return `<label class="clinical-editor-field ${options.wide ? 'wide' : ''}"><span>${escapeHtml(label)}</span><${tag} name="${escapeHtml(name)}" ${attrs} ${options.required ? 'required' : ''}></${tag}></label>`;
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'clinical-editor-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="clinical-editor-shell" id="clinicalEditorForm">
        <header class="clinical-editor-header">
          <div><span class="clinical-editor-kicker">MedIndex · Redaktim permanent në Neon</span><h2 id="clinicalEditorTitle">Redakto barin</h2><p id="clinicalEditorMeta"></p></div>
          <button type="button" class="clinical-editor-close" aria-label="Mbyll editorin">×</button>
        </header>
        <div class="clinical-editor-body">
          <section class="clinical-editor-section">
            <div class="clinical-editor-section-title"><h3>Të dhënat kryesore</h3><p>Ndryshimet mbrohen nga mbishkrimi i Google Drive-it.</p></div>
            <div class="clinical-editor-grid">
              ${field('tradeName', 'Emri tregtar', { required:true, wide:true })}
              ${field('activeSubstance', 'Substanca aktive', { required:true, wide:true })}
              ${field('atcCode', 'ATC', { required:true })}
              ${field('strength', 'Fortësia', { required:true })}
              ${field('pharmaceuticalForm', 'Forma farmaceutike', { required:true, wide:true })}
              ${field('packaging', 'Paketimi', { wide:true })}
              ${field('drugClass', 'Klasa / Çka është', { area:true, wide:true })}
              ${field('useText', 'Përdorimi / fjalë kyçe', { area:true, wide:true })}
            </div>
          </section>

          <section class="clinical-editor-section">
            <div class="clinical-editor-section-title"><h3>Dozimi i verifikuar</h3><p>Publikimi kërkon dozë, rrugë dhe burim HTTPS.</p></div>
            <div class="clinical-editor-dose-grid">
              <fieldset><legend>Të rritur</legend>
                ${field('adultDose', 'Doza e plotë', { area:true, wide:true })}
                ${field('adultRoute', 'Rruga', { wide:true })}
                ${field('adultSourceUrl', 'Burimi HTTPS', { type:'url', wide:true })}
                ${field('adultNotes', 'Vërejtje / alarme', { area:true, wide:true })}
                <label class="clinical-editor-check"><input type="checkbox" name="adultVerified"> <span>Publiko si dozë e verifikuar</span></label>
              </fieldset>
              <fieldset><legend>Fëmijë</legend>
                ${field('pediatricDose', 'Doza e plotë', { area:true, wide:true })}
                ${field('pediatricRoute', 'Rruga', { wide:true })}
                ${field('pediatricSourceUrl', 'Burimi HTTPS', { type:'url', wide:true })}
                ${field('pediatricNotes', 'Vërejtje / alarme', { area:true, wide:true })}
                <label class="clinical-editor-check"><input type="checkbox" name="pediatricVerified"> <span>Publiko si dozë e verifikuar</span></label>
              </fieldset>
            </div>
          </section>

          <section class="clinical-editor-section">
            <div class="clinical-editor-section-title"><h3>Profili klinik</h3><p>Indikacionet: një për rresht. Opsionale: <code>Emri | ICD | adult</code>.</p></div>
            <div class="clinical-editor-grid">
              <label class="clinical-editor-field wide"><span>Statusi i kartelës</span><select name="verificationStatus"><option value="pending">Pa kontrolluar</option><option value="in_review">Në verifikim</option><option value="verified">I verifikuar</option></select></label>
              ${field('sourceUrls', 'Burimet HTTPS, një për rresht', { area:true, wide:true })}
              ${field('clinicalSummary', 'Përmbledhja klinike', { area:true, wide:true })}
              ${field('indicationsText', 'Indikacionet', { area:true, wide:true })}
              ${field('contraindications', 'Kundërindikacionet', { area:true, wide:true })}
              ${field('warnings', 'Paralajmërimet', { area:true, wide:true })}
              ${field('interactions', 'Ndërveprimet', { area:true, wide:true })}
              ${field('pregnancyLactation', 'Shtatzënia / gjidhënia', { area:true, wide:true })}
              ${field('renalAdjustment', 'Dozimi renal', { area:true, wide:true })}
              ${field('hepaticAdjustment', 'Dozimi hepatik', { area:true, wide:true })}
              ${field('monitoring', 'Monitorimi', { area:true, wide:true })}
              ${field('administrationNotes', 'Udhëzimet e administrimit', { area:true, wide:true })}
              ${field('editorialNotes', 'Shënime editoriale private', { area:true, wide:true })}
            </div>
          </section>

          <section class="clinical-editor-section"><div class="clinical-editor-section-title"><h3>Historia e ndryshimeve</h3></div><div id="clinicalEditorAudit" class="clinical-editor-audit"></div></section>
        </div>
        <footer class="clinical-editor-footer">
          <p id="clinicalEditorMessage" role="status" aria-live="polite"></p>
          <div><button type="button" class="clinical-editor-secondary" data-save-next>Ruaj dhe hap tjetrin</button><button type="submit" class="clinical-editor-primary">Ruaj ndryshimet</button></div>
        </footer>
      </form>`;
    document.body.appendChild(dialog);
    form = dialog.querySelector('#clinicalEditorForm');
    message = dialog.querySelector('#clinicalEditorMessage');
    dialog.querySelector('.clinical-editor-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    form.addEventListener('submit', event => { event.preventDefault(); saveEditor(false); });
    dialog.querySelector('[data-save-next]').addEventListener('click', () => saveEditor(true));
  }

  function setValue(name, value) {
    const control = form.elements.namedItem(name);
    if (!control) return;
    if (control.type === 'checkbox') control.checked = value === true;
    else control.value = value ?? '';
  }

  function populate(record) {
    const { drug, profile, dosage, audit } = record;
    currentRegistryNumber = Number(drug.registryNumber);
    dialog.querySelector('#clinicalEditorTitle').textContent = `${drug.registryNumber}. ${drug.tradeName}`;
    dialog.querySelector('#clinicalEditorMeta').textContent = `${drug.activeSubstance} · ${drug.strength} · ${drug.pharmaceuticalForm}`;
    Object.entries({
      tradeName:drug.tradeName, activeSubstance:drug.activeSubstance, atcCode:drug.atcCode,
      drugClass:drug.drugClass, useText:drug.useText, strength:drug.strength,
      pharmaceuticalForm:drug.pharmaceuticalForm, packaging:drug.packaging,
      verificationStatus:profile.verificationStatus, sourceUrls:(profile.sourceUrls || []).join('\n'),
      clinicalSummary:profile.clinicalSummary, indicationsText:profile.indicationsText,
      contraindications:profile.contraindications, warnings:profile.warnings, interactions:profile.interactions,
      pregnancyLactation:profile.pregnancyLactation, renalAdjustment:profile.renalAdjustment,
      hepaticAdjustment:profile.hepaticAdjustment, monitoring:profile.monitoring,
      administrationNotes:profile.administrationNotes, editorialNotes:profile.editorialNotes,
      adultDose:dosage.adult.dose, adultRoute:dosage.adult.route, adultSourceUrl:dosage.adult.sourceUrl,
      adultNotes:dosage.adult.notes, adultVerified:dosage.adult.verified,
      pediatricDose:dosage.pediatric.dose, pediatricRoute:dosage.pediatric.route,
      pediatricSourceUrl:dosage.pediatric.sourceUrl, pediatricNotes:dosage.pediatric.notes,
      pediatricVerified:dosage.pediatric.verified,
    }).forEach(([name, value]) => setValue(name, value));
    const auditContainer = dialog.querySelector('#clinicalEditorAudit');
    auditContainer.innerHTML = audit?.length
      ? audit.map(item => `<div><strong>${escapeHtml(item.action || 'Ndryshim')}</strong><span>${escapeHtml(item.changedBy || 'Editor')} · ${escapeHtml(item.changedAt ? new Date(item.changedAt).toLocaleString('sq-AL') : '')}</span></div>`).join('')
      : '<p>Nuk ka ende ndryshime editoriale.</p>';
    message.textContent = '';
  }

  function setBusy(busy, textValue = '') {
    form?.querySelectorAll('button, input, textarea, select').forEach(control => { control.disabled = busy; });
    if (message) message.textContent = textValue;
  }

  async function openEditor(registryNumber) {
    ensureDialog();
    currentRegistryNumber = Number(registryNumber);
    if (!dialog.open) dialog.showModal();
    setBusy(true, 'Duke e ngarkuar kartelën…');
    try {
      const payload = await api(`${ENDPOINT}?registryNumber=${encodeURIComponent(currentRegistryNumber)}`);
      populate(payload.record);
      setBusy(false);
      form.elements.namedItem('tradeName')?.focus();
    } catch (error) {
      setBusy(false, error.message);
    }
  }

  function controlValue(name) {
    const control = form.elements.namedItem(name);
    return control?.type === 'checkbox' ? control.checked : String(control?.value || '').trim();
  }

  function payloadFromForm() {
    return {
      registryNumber:currentRegistryNumber,
      drug:{
        tradeName:controlValue('tradeName'), activeSubstance:controlValue('activeSubstance'), atcCode:controlValue('atcCode'),
        drugClass:controlValue('drugClass'), useText:controlValue('useText'), strength:controlValue('strength'),
        pharmaceuticalForm:controlValue('pharmaceuticalForm'), packaging:controlValue('packaging'),
      },
      profile:{
        verificationStatus:controlValue('verificationStatus'), sourceUrls:controlValue('sourceUrls').split('\n'),
        clinicalSummary:controlValue('clinicalSummary'), indicationsText:controlValue('indicationsText'),
        contraindications:controlValue('contraindications'), warnings:controlValue('warnings'),
        interactions:controlValue('interactions'), pregnancyLactation:controlValue('pregnancyLactation'),
        renalAdjustment:controlValue('renalAdjustment'), hepaticAdjustment:controlValue('hepaticAdjustment'),
        monitoring:controlValue('monitoring'), administrationNotes:controlValue('administrationNotes'),
        editorialNotes:controlValue('editorialNotes'),
      },
      dosage:{
        adult:{ dose:controlValue('adultDose'), route:controlValue('adultRoute'), sourceUrl:controlValue('adultSourceUrl'), notes:controlValue('adultNotes'), verified:controlValue('adultVerified') },
        pediatric:{ dose:controlValue('pediatricDose'), route:controlValue('pediatricRoute'), sourceUrl:controlValue('pediatricSourceUrl'), notes:controlValue('pediatricNotes'), verified:controlValue('pediatricVerified') },
      },
    };
  }

  function setVisibleCell(tableRow, labels, value) {
    const normalizedLabels = labels.map(clean);
    Array.from(tableRow.querySelectorAll('td')).forEach(cell => {
      if (!normalizedLabels.includes(clean(cell.dataset.label))) return;
      const badge = cell.querySelector('.data-quality-badge');
      if (badge && cell.firstElementChild) cell.firstElementChild.textContent = value;
      else cell.textContent = value;
      cell.title = value;
    });
  }

  function updateRegistryRow(record) {
    const drug = record.drug;
    const row = Array.isArray(window.MEDINDEX_REGISTRY_ROWS)
      ? window.MEDINDEX_REGISTRY_ROWS.find(item => Number(item['Nr rendor']) === Number(drug.registryNumber))
      : null;
    if (row) Object.assign(row, {
      'Emri tregtar':drug.tradeName, 'Substanca aktive':drug.activeSubstance, 'ATC Code':drug.atcCode,
      'Klasa / Çka është':drug.drugClass, 'Përdorimi (fjalë kyçe)':drug.useText,
      Fortësia:drug.strength, 'Forma farmaceutike':drug.pharmaceuticalForm, 'Madhësia e paketimit':drug.packaging,
    });
    const tableRow = document.querySelector(`#tbody > tr[data-registry-number="${drug.registryNumber}"]`);
    if (!tableRow) return;
    const setDoseCell = (population, dose) => {
      const cell = tableRow.querySelector(`[data-registry-dosage-column="${population}"]`);
      if (!cell) return;
      cell.innerHTML = dose?.verified
        ? `<span class="registry-dosage-verified">✓ E verifikuar</span><div class="registry-dosage-grid registry-dosage-regimen"><div>${escapeHtml(dose.dose)}</div><div class="registry-dosage-route">${escapeHtml(dose.route || '—')}</div></div>`
        : '<span class="registry-dosage-muted">Pa dozë të verifikuar.</span>';
    };
    setDoseCell('adult', record.dosage?.adult);
    setDoseCell('pediatric', record.dosage?.pediatric);
    setVisibleCell(tableRow, ['Emri tregtar'], drug.tradeName);
    setVisibleCell(tableRow, ['Substanca aktive'], drug.activeSubstance);
    setVisibleCell(tableRow, ['ATC'], drug.atcCode);
    setVisibleCell(tableRow, ['Klasa / Çka është'], drug.drugClass);
    setVisibleCell(tableRow, ['Përdorimi / fjalë kyçe'], drug.useText);
    setVisibleCell(tableRow, ['Fortësia'], drug.strength);
    setVisibleCell(tableRow, ['Forma farmaceutike'], drug.pharmaceuticalForm);
    setVisibleCell(tableRow, ['Madhësia e paketimit'], drug.packaging);
  }

  function replaceSummaryItem(record) {
    const number = Number(record.drug.registryNumber);
    const next = {
      ...(summaryMap.get(number) || {}), registryNumber:number, drugId:record.drug.id, tradeName:record.drug.tradeName,
      verificationStatus:record.profile.verificationStatus, adultVerified:record.dosage.adult.verified === true,
      pediatricVerified:record.dosage.pediatric.verified === true, editorialOverride:true,
      reviewedAt:record.profile.reviewedAt || '', updatedAt:record.profile.updatedAt || '',
    };
    summaryMap.set(number, next);
    summary.items = [...summaryMap.values()].sort((a, b) => a.registryNumber - b.registryNumber);
    summary.pending = summary.items.filter(item => item.verificationStatus === 'pending').length;
    summary.inReview = summary.items.filter(item => item.verificationStatus === 'in_review').length;
    summary.verified = summary.items.filter(item => item.verificationStatus === 'verified').length;
    summary.adultVerified = summary.items.filter(item => item.adultVerified).length;
    summary.pediatricVerified = summary.items.filter(item => item.pediatricVerified).length;
    updateProgressButton();
  }

  function nextIncomplete(afterNumber) {
    const items = [...summaryMap.values()].sort((a, b) => a.registryNumber - b.registryNumber);
    return items.find(item => item.registryNumber > Number(afterNumber || 0) && item.verificationStatus !== 'verified')
      || items.find(item => item.verificationStatus !== 'verified') || null;
  }

  async function saveEditor(openNext) {
    const originalNumber = currentRegistryNumber;
    setBusy(true, 'Duke i ruajtur ndryshimet në Neon…');
    try {
      const payload = await api(ENDPOINT, { method:'PUT', body:JSON.stringify(payloadFromForm()) });
      updateRegistryRow(payload.record);
      replaceSummaryItem(payload.record);
      scheduleEnhance();
      if (openNext) {
        const next = nextIncomplete(originalNumber);
        if (next) return openEditor(next.registryNumber);
      }
      populate(payload.record);
      setBusy(false, 'U ruajt përgjithmonë në Neon. Ndryshimi është i mbrojtur nga sinkronizimi i Drive-it.');
    } catch (error) {
      setBusy(false, error.message);
    }
  }

  function start() {
    ensureDialog();
    ensureProgressButton();
    observeTable();
    scheduleEnhance();
    loadSummary().catch(error => {
      console.error('Përmbledhja e editorit nuk u ngarkua:', error);
      if (progressButton) progressButton.title = error.message;
    });
  }

  if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) start();
  else window.addEventListener('medindex:registry-ready', start, { once:true });

  window.MedIndexClinicalEditor = { version:VERSION, open:openEditor, refresh:loadSummary };
})();
