(() => {
  'use strict';

  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const Engine = window.MedIndexDosageEngine;
  const state = { payload:{ forms:[], adult:[], pediatric:[] }, population:'adult' };
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) button.textContent = theme === 'dark' ? '☀' : '☾';
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    applyTheme(['dark', 'light'].includes(saved) ? saved : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function activeRows() {
    return state.population === 'pediatric' ? state.payload.pediatric : state.payload.adult;
  }

  function setOptions(selector, values, placeholder) {
    const node = $(selector);
    const current = node.value;
    node.innerHTML = `<option value="">${placeholder}</option>${values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
    if (values.includes(current)) node.value = current;
  }

  function refreshFilters() {
    const rows = activeRows();
    setOptions('#dosageForm', [...new Set(rows.map(item => item.form).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sq')), 'Të gjitha format');
    setOptions('#dosageAtc', [...new Set(rows.map(item => item.atc).filter(Boolean))].sort(), 'Të gjitha ATC-të');
  }

  function patient() {
    return { ageMonths:Number($('#patientAgeMonths')?.value), weightKg:Number($('#patientWeightKg')?.value) };
  }

  function rowMarkup(item) {
    const strength = item.referenceStrength || item.concentration;
    const limits = [
      item.maxSingleMg != null ? `Maks. dozë ${item.maxSingleMg} mg` : '',
      item.max24hMg != null ? `Maks. 24h ${item.max24hMg} mg` : '',
      item.maxUnits24h ? `Maks. ${item.maxUnits24h}/24h` : '',
    ].filter(Boolean).join(' · ');
    return `<article class="clinical-row">
      <div>
        <h2>${esc(item.substance)} ${esc(strength)}</h2>
        <p>${esc(item.indication || 'Pa indikacion të shënuar')}</p>
        <div class="clinical-row-meta"><span class="clinical-chip">${esc(item.atc)}</span><span class="clinical-chip">${esc(item.form)}</span><span class="clinical-chip">VERIFIKUAR</span>${item.prn ? '<span class="clinical-chip is-warning">PRN</span>' : ''}</div>
        <div class="clinical-details">
          <div class="clinical-detail"><b>Doza</b>${esc(item.practicalUnit || (item.mgPerKg ? `${item.mgPerKg} mg/kg` : item.doseMg ? `${item.doseMg} mg` : 'Sipas skemës'))}</div>
          <div class="clinical-detail"><b>Rruga / shpeshtësia</b>${esc([item.route, item.frequency].filter(Boolean).join(' · '))}</div>
          <div class="clinical-detail"><b>Kohëzgjatja</b>${esc(item.duration || 'Sipas vlerësimit')}</div>
          <div class="clinical-detail"><b>Kufijtë</b>${esc(limits || 'Kontrollo burimin')}</div>
        </div>
        ${item.warnings ? `<p><strong>Kujdes:</strong> ${esc(item.warnings)}</p>` : ''}
      </div>
      <div class="clinical-actions">
        <a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Burimi</a>
        <button class="primary" type="button" data-add-regimen="${esc(item.regimenId)}">Shto në recetë</button>
      </div>
    </article>`;
  }

  function render() {
    const query = fold($('#dosageSearch')?.value);
    const form = $('#dosageForm')?.value || '';
    const atc = $('#dosageAtc')?.value || '';
    const rows = activeRows().filter(item => {
      const haystack = fold([item.substance, item.indication, item.atc, item.form, item.frequency, item.route].join(' '));
      return (!query || haystack.includes(query)) && (!form || item.form === form) && (!atc || item.atc === atc);
    });
    $('#dosageCount').textContent = rows.length;
    $('#dosageStatus').textContent = `${rows.length} nga ${activeRows().length} skema të verifikuara · ${state.population === 'pediatric' ? 'Pediatri' : 'Të rritur'}`;
    $('#dosageList').innerHTML = rows.length ? rows.map(rowMarkup).join('') : '<div class="clinical-empty">Nuk u gjet asnjë skemë për këta filtra.</div>';
  }

  function addToPrescription(regimenId) {
    const regimen = activeRows().find(item => item.regimenId === regimenId);
    if (!regimen) return;
    if (state.population === 'pediatric') {
      const eligibility = Engine.pediatricEligibility(regimen, patient());
      if (eligibility.missing.length) {
        $('#dosageStatus').textContent = 'Plotëso moshën dhe peshën para bartjes së kësaj skeme pediatrike.';
        (eligibility.missing.includes('ageMonths') ? $('#patientAgeMonths') : $('#patientWeightKg'))?.focus();
        return;
      }
      if (!eligibility.eligible) {
        $('#dosageStatus').textContent = 'Pacienti është jashtë kufijve të verifikuar të kësaj skeme. Kërkohet rishikim klinik.';
        return;
      }
    }
    const drug = { substance:regimen.substance, strength:regimen.referenceStrength || regimen.concentration, form:regimen.form, atc:regimen.atc };
    const transfer = Engine.prescriptionTransfer(drug, regimen, state.population);
    if (state.population === 'pediatric' && Engine.needsPediatricInputs(regimen)) {
      transfer.patient = patient();
      transfer.dosageStatus = 'requires-review';
    }
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify([transfer]));
    location.href = '/recetat.html';
  }

  async function load() {
    try {
      const response = await fetch('/api/dosage', { credentials:'same-origin', headers:{ Accept:'application/json' } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `API ${response.status}`);
      state.payload = payload;
      refreshFilters();
      render();
    } catch (error) {
      $('#dosageStatus').textContent = error.message;
      $('#dosageList').innerHTML = '<div class="clinical-empty">Dozologjia nuk mund të ngarkohet tani.</div>';
    }
  }

  function init() {
    initTheme();
    $('#dosageSearch')?.addEventListener('input', render);
    $('#dosagePopulation')?.addEventListener('change', event => {
      state.population = event.target.value;
      $('#pediatricInputs').hidden = state.population !== 'pediatric';
      refreshFilters();
      render();
    });
    $('#dosageForm')?.addEventListener('change', render);
    $('#dosageAtc')?.addEventListener('change', render);
    $('#dosageList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-add-regimen]');
      if (button) addToPrescription(button.dataset.addRegimen);
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
