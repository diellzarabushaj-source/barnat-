(() => {
  'use strict';

  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const PEDIATRIC_POPULATIONS = new Set(['Pediatric only', 'Pediatric and adult both']);
  const SEARCH_LIMIT = 12;
  const Engine = window.MedIndexDosageEngine;
  const state = {
    payload:{ forms:[], adult:[], pediatric:[], cards:[] },
    population:'pediatric',
    approvedPopulationByNr:new Map(),
    populationReady:false,
    selectedRegimens:{},
    selectedCardKey:'',
  };

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const finite = value => Number.isFinite(Number(value));

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

  function cards() {
    return Array.isArray(state.payload.cards) ? state.payload.cards : [];
  }

  function approvedPopulation(card) {
    const registryNumber = Number(text(card?.nr));
    return Number.isInteger(registryNumber) ? state.approvedPopulationByNr.get(registryNumber) || '' : '';
  }

  function pediatricEligible(card) {
    return state.populationReady
      && PEDIATRIC_POPULATIONS.has(approvedPopulation(card))
      && Boolean(text(card?.pediatricDose));
  }

  function eligibleCards() {
    return cards().filter(pediatricEligible);
  }

  function numericInput(selector) {
    const raw = text($(selector)?.value);
    if (!raw) return NaN;
    const value = Number(raw.replace(',', '.'));
    return Number.isFinite(value) ? value : NaN;
  }

  function patient() {
    return { ageMonths:numericInput('#patientAgeMonths'), weightKg:numericInput('#patientWeightKg') };
  }

  function cardAsDrug(card) {
    return {
      key:card.cardKey,
      drugKey:card.cardKey,
      tradeName:card.tradeName,
      substance:card.substance,
      strength:card.strength,
      form:card.form,
      atc:card.atc,
      pdid:card.pdid,
      route:card.pediatricRoute,
    };
  }

  function exactRegimens(card) {
    return Engine?.exactMatches ? Engine.exactMatches(cardAsDrug(card), state.payload.pediatric || []) : [];
  }

  function selectionKey(cardKey) {
    return `${cardKey}::pediatric`;
  }

  function selectedRegimen(card, matches = exactRegimens(card)) {
    if (matches.length === 1) return matches[0];
    const selectedId = state.selectedRegimens[selectionKey(card.cardKey)] || '';
    return matches.find(item => item.regimenId === selectedId) || null;
  }

  function regimenVerified(regimen) {
    return text(regimen?.status).toUpperCase() === 'VERIFIKUAR' && /^https:\/\//i.test(text(regimen?.sourceUrl));
  }

  function formatDose(value, unit) {
    if (!finite(value)) return '';
    return `${new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(Number(value))} ${unit}`;
  }

  function formatRange(minimum, maximum, unit) {
    if (!finite(minimum) || !finite(maximum)) return '';
    const min = new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(Number(minimum));
    const max = new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(Number(maximum));
    return Number(minimum) === Number(maximum) ? `${min} ${unit}` : `${min}–${max} ${unit}`;
  }

  function indicationMarkup(card, matches, regimen) {
    if (!matches.length) return '';
    if (matches.length === 1) {
      return `<div class="dosage-indication is-fixed"><b>Indikacioni pediatrik</b><span>${esc(regimen?.indication || 'Skema e vetme e strukturuar')}</span></div>`;
    }
    return `<label class="dosage-indication">
      <b>Indikacioni pediatrik</b>
      <select data-indication-card="${esc(card.cardKey)}" aria-label="Indikacioni pediatrik për ${esc(card.tradeName || card.substance)}">
        <option value="">Zgjidh indikacionin…</option>
        ${matches.map(item => `<option value="${esc(item.regimenId)}" ${regimen?.regimenId === item.regimenId ? 'selected' : ''}>${esc(item.indication || 'Indikacion pa emër')}</option>`).join('')}
      </select>
    </label>`;
  }

  function pediatricCalculation(regimen) {
    if (!regimen || !regimenVerified(regimen)) return null;
    return Engine?.calculatePediatricDose ? Engine.calculatePediatricDose(regimen, patient()) : null;
  }

  function calculationMarkup(card, matches, regimen) {
    if (!text(card.pediatricDose)) return '';
    if (!matches.length) {
      return '<div class="dosage-calculation is-manual"><strong>Doza pediatrike është publikuar</strong><p class="dosage-calculation-note">Për këtë preparat nuk ka ende skemë të strukturuar të përshtatshme për kalkulim automatik. Teksti origjinal mbetet i dukshëm për rishikim.</p></div>';
    }
    if (matches.length > 1 && !regimen) {
      return '<div class="dosage-calculation is-pending"><strong>Zgjidh indikacionin</strong><p class="dosage-calculation-note">Kalkulatori nuk zgjedh vetë mes skemave të ndryshme pediatrike.</p></div>';
    }
    if (!regimenVerified(regimen)) {
      return '<div class="dosage-calculation is-manual"><strong>Kalkulatori është i bllokuar</strong><p class="dosage-calculation-note">Skema nuk ka status dhe burim të verifikuar për llogaritje automatike.</p></div>';
    }

    const result = pediatricCalculation(regimen);
    if (!result || result.status === 'manual') {
      return '<div class="dosage-calculation is-manual"><strong>Rishikim manual</strong><p class="dosage-calculation-note">Kjo skemë nuk mund të llogaritet automatikisht pa interpretim klinik.</p></div>';
    }
    if (result.status === 'needs-patient-data') {
      const needs = [];
      if (result.missing?.includes('weightKg')) needs.push('peshën');
      if (result.missing?.includes('ageMonths')) needs.push('moshën');
      return `<div class="dosage-calculation is-pending"><strong>Plotëso të dhënat e pacientit</strong><p class="dosage-calculation-note">Shëno ${esc(needs.join(' dhe ') || 'të dhënat e kërkuara')} për këtë skemë.</p></div>`;
    }
    if (result.status === 'out-of-range') {
      return '<div class="dosage-calculation is-warning"><strong>Jashtë intervalit të verifikuar</strong><p class="dosage-calculation-note">Mosha ose pesha është jashtë kufijve të deklaruar të kësaj skeme. Nuk jepet rezultat automatik.</p></div>';
    }

    const range = result.status === 'range-calculated';
    const items = range ? [
      finite(result.perDoseMgMin) && finite(result.perDoseMgMax) ? ['Për një dozë', formatRange(result.perDoseMgMin, result.perDoseMgMax, 'mg')] : null,
      finite(result.perDoseMlMin) && finite(result.perDoseMlMax) ? ['Vëllimi për dozë', formatRange(result.perDoseMlMin, result.perDoseMlMax, 'mL')] : null,
      finite(result.dailyTotalMgMin) && finite(result.dailyTotalMgMax) ? ['Totali në 24 orë', formatRange(result.dailyTotalMgMin, result.dailyTotalMgMax, 'mg')] : null,
      result.dosesPerDay != null ? ['Marrje në ditë', `${result.dosesPerDay}`] : null,
    ].filter(Boolean) : [
      result.perDoseMg != null ? ['Për një dozë', formatDose(result.perDoseMg, 'mg')] : null,
      result.perDoseMl != null ? ['Vëllimi për dozë', formatDose(result.perDoseMl, 'mL')] : null,
      result.dailyTotalMg != null ? ['Totali në 24 orë', formatDose(result.dailyTotalMg, 'mg')] : null,
      result.dosesPerDay != null ? ['Marrje në ditë', `${result.dosesPerDay}`] : null,
    ].filter(Boolean);

    if (!items.length) {
      return '<div class="dosage-calculation is-manual"><strong>Rishikim manual</strong><p class="dosage-calculation-note">Skema është e strukturuar, por nuk prodhon një rezultat numerik të sigurt për këtë pacient.</p></div>';
    }

    const capped = result.cappedBy?.length ? ' Është zbatuar kufiri maksimal i publikuar.' : '';
    const rangeNote = range ? ' Rezultati është interval; kalkulatori nuk zgjedh automatikisht një vlerë brenda tij.' : '';
    return `<div class="dosage-calculation is-calculated">
      <strong>Rezultati për ${esc(formatDose(patient().weightKg, 'kg'))}</strong>
      <div class="dosage-calculation-grid">${items.map(([label, value]) => `<div class="dosage-calculation-item"><b>${esc(label)}</b>${esc(value)}</div>`).join('')}</div>
      <p class="dosage-calculation-note">Llogaritur vetëm nga formula pediatrike e strukturuar dhe e verifikuar.${esc(capped + rangeNote)}</p>
    </div>`;
  }

  function signatureMarkup(matches, regimen) {
    if (!matches.length) return '';
    if (matches.length > 1 && !regimen) {
      return '<div class="dosage-signature is-pending"><b>Signatura</b><p>Zgjidh indikacionin para krijimit të signaturës.</p></div>';
    }
    if (!regimenVerified(regimen)) return '';

    const calculation = pediatricCalculation(regimen);
    if (calculation?.status === 'needs-patient-data') {
      return '<div class="dosage-signature is-pending"><b>Signatura</b><p>Plotëso të dhënat e pacientit.</p></div>';
    }
    if (calculation?.status === 'out-of-range') {
      return '<div class="dosage-signature is-warning"><b>Signatura nuk u krijua</b><p>Pacienti është jashtë kufijve të deklaruar të skemës.</p></div>';
    }
    if (calculation?.status === 'range-calculated' || calculation?.requiresDoseSelection) {
      return '<div class="dosage-signature is-pending"><b>Signatura kërkon zgjedhje klinike</b><p>Rezultati është interval dhe nuk bartet automatikisht si një dozë e vetme.</p></div>';
    }

    const signature = Engine?.buildSignature?.(regimen, 'pediatric', calculation) || text(regimen?.signatura);
    if (!signature) return '';
    return `<div class="dosage-signature"><b>Signatura për rishikim</b><p>${esc(signature)}</p><span>Mund të bartet në recetë vetëm për rishikim klinik.</span></div>`;
  }

  function statusLabel(matches, regimen) {
    if (!matches.length) return 'Dozë tekstuale';
    if (matches.length > 1 && !regimen) return 'Zgjidh indikacionin';
    if (!regimenVerified(regimen)) return 'Rishikim manual';
    if (finite(regimen?.mgPerKg) || finite(regimen?.mgPerKgMin) || finite(regimen?.mgPerKgMax)) return 'Kalkulim sipas kg';
    if (finite(regimen?.fixedDoseMg) || finite(regimen?.fixedVolumeMl)) return 'Skemë e strukturuar';
    return 'Rishikim manual';
  }

  function linkedSources(card, regimen) {
    const urls = new Set((Array.isArray(card?.sourceUrls) ? card.sourceUrls : []).filter(url => /^https:\/\//i.test(text(url))));
    if (/^https:\/\//i.test(text(regimen?.sourceUrl))) urls.add(text(regimen.sourceUrl));
    return [...urls];
  }

  function sourceMarkup(card, regimen) {
    const sources = linkedSources(card, regimen);
    if (!sources.length) return '<span class="dosage-card-chip is-unverified">Pa burim të lidhur</span>';
    return sources.slice(0, 3).map((url, index) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Burimi${sources.length > 1 ? ` ${index + 1}` : ''}</a>`).join('');
  }

  function populationMarkup(card) {
    const dose = text(card.pediatricDose);
    const route = text(card.pediatricRoute);
    const matches = exactRegimens(card);
    const regimen = selectedRegimen(card, matches);
    return `<section class="dosage-population is-pediatric">
      <div class="dosage-population-head"><h3 class="dosage-population-title">Doza pediatrike</h3><span class="dosage-population-badge">${esc(statusLabel(matches, regimen))}</span></div>
      ${indicationMarkup(card, matches, regimen)}
      <div class="dosage-dose-grid">
        <div class="dosage-dose-field"><b>Doza e publikuar</b>${esc(dose || 'Nuk është shënuar')}</div>
        <div class="dosage-dose-field"><b>Rruga</b>${esc(route || 'Kontrollo burimin')}</div>
      </div>
      ${calculationMarkup(card, matches, regimen)}
      ${signatureMarkup(matches, regimen)}
    </section>`;
  }

  function actionMarkup(card) {
    const matches = exactRegimens(card);
    const regimen = selectedRegimen(card, matches);
    if (!regimen || !regimenVerified(regimen)) return '';
    return `<button class="is-child" type="button" data-add-regimen="${esc(regimen.regimenId)}" data-card-key="${esc(card.cardKey)}">Shto në recetë për rishikim</button>`;
  }

  function cardMarkup(card) {
    const title = [card.tradeName, card.strength].filter(Boolean).join(' ');
    const matches = exactRegimens(card);
    const regimen = selectedRegimen(card, matches);
    return `<article class="dosage-card pediatric-calculator-card" data-card-key="${esc(card.cardKey)}">
      <header class="dosage-card-head">
        <div>
          <div class="dosage-card-meta"><span class="dosage-card-chip is-verified">${esc(approvedPopulation(card))}</span></div>
          <h2 class="dosage-card-title">${esc(title || card.substance || 'Bar pa emërtim')}</h2>
          <p class="dosage-card-substance">${esc(card.substance || 'Substanca aktive nuk është shënuar')}</p>
          <div class="dosage-card-meta">
            ${card.atc ? `<span class="dosage-card-chip">${esc(card.atc)}</span>` : ''}
            ${card.form ? `<span class="dosage-card-chip">${esc(card.form)}</span>` : ''}
            ${card.pdid ? `<span class="dosage-card-chip">PDID ${esc(card.pdid)}</span>` : ''}
            <span class="dosage-card-chip ${regimenVerified(regimen) ? 'has-source' : 'is-unverified'}">${regimenVerified(regimen) ? 'SKEMË E VERIFIKUAR' : 'PA KALKULIM AUTOMATIK'}</span>
          </div>
        </div>
        <div class="pediatric-card-head-actions">
          <span class="dosage-card-number">Nr. ${esc(card.nr || '—')}</span>
          <button type="button" class="pediatric-change-drug" data-change-pediatric-card>Ndrysho barin</button>
        </div>
      </header>
      ${(card.drugClass || card.use) ? `<div class="dosage-card-context">
        ${card.drugClass ? `<div class="dosage-context-item"><b>Klasa / Çka është</b>${esc(card.drugClass)}</div>` : ''}
        ${card.use ? `<div class="dosage-context-item"><b>Përdorimi</b>${esc(card.use)}</div>` : ''}
      </div>` : ''}
      <div class="dosage-populations pediatric-only-population">${populationMarkup(card)}</div>
      <footer class="dosage-card-footer">
        <div class="dosage-card-sources">${sourceMarkup(card, regimen)}</div>
        <div class="dosage-card-actions">${actionMarkup(card)}</div>
      </footer>
    </article>`;
  }

  function candidateMarkup(card) {
    const title = [card.tradeName, card.strength].filter(Boolean).join(' ') || card.substance || 'Bar pa emërtim';
    const matches = exactRegimens(card);
    const ready = matches.some(regimenVerified);
    return `<button type="button" class="pediatric-search-result" data-select-pediatric-card="${esc(card.cardKey)}">
      <span class="pediatric-search-result-main"><strong>${esc(title)}</strong><small>${esc(card.substance || '')}</small></span>
      <span class="pediatric-search-result-meta">${card.atc ? `<span>${esc(card.atc)}</span>` : ''}${card.form ? `<span>${esc(card.form)}</span>` : ''}<span>${ready ? 'Kalkulator i strukturuar' : 'Dozë pediatrike tekstuale'}</span></span>
    </button>`;
  }

  function searchMatches() {
    const query = fold($('#dosageSearch')?.value);
    if (query.length < 2) return [];
    return eligibleCards().filter(card => {
      const haystack = fold([card.nr, card.tradeName, card.substance, card.strength, card.atc, card.form, card.drugClass, card.use, card.pediatricDose].join(' '));
      return haystack.includes(query);
    });
  }

    function syncPatientInputs(card) {
    const ageInput = $('#patientAgeMonths');
    const weightInput = $('#patientWeightKg');
    const ageLabel = ageInput?.closest('label');
    const weightLabel = weightInput?.closest('label');
    if (!ageLabel || !weightLabel) return;
    if (!card) {
      ageLabel.hidden = true;
      weightLabel.hidden = true;
      return;
    }
    const matches = exactRegimens(card);
    const regimen = selectedRegimen(card, matches);
    const needsAge = Boolean(regimen && (finite(regimen.minAgeMonths) || finite(regimen.maxAgeMonths)));
    const needsWeight = Boolean(regimen && (
      finite(regimen.mgPerKg) || finite(regimen.mgPerKgMin) || finite(regimen.mgPerKgMax)
      || finite(regimen.minWeightKg) || finite(regimen.maxWeightKg)
    ));
    ageLabel.hidden = !needsAge;
    weightLabel.hidden = !needsWeight;
  }

  function render() {
    const eligible = eligibleCards();
    const list = $('#dosageList');
    const status = $('#dosageStatus');
    $('#dosageCount').textContent = eligible.length;

    const selected = eligible.find(card => card.cardKey === state.selectedCardKey) || null;
    if (selected) {
      syncPatientInputs(selected);
      const matches = exactRegimens(selected);
      const ready = matches.some(regimenVerified);
      status.textContent = ready
        ? 'Skema pediatrike e strukturuar u gjet. Plotëso të dhënat e pacientit dhe zgjidh indikacionin kur kërkohet.'
        : 'Ky bar ka dozë pediatrike të publikuar, por nuk ka ende formulë të verifikuar për kalkulim automatik.';
      list.innerHTML = cardMarkup(selected);
      return;
    }

    syncPatientInputs(null);
    const query = fold($('#dosageSearch')?.value);
    if (query.length < 2) {
      status.textContent = `${eligible.length} barna me popullatë pediatrike të aprovuar dhe dozë pediatrike të publikuar.`;
      list.innerHTML = '<div class="clinical-empty pediatric-search-empty"><strong>Kërko një bar për të filluar</strong><span>Shkruaj së paku 2 karaktere nga emri tregtar, substanca aktive ose ATC-ja.</span></div>';
      return;
    }

    const rows = searchMatches();
    status.textContent = rows.length
      ? `${rows.length} rezultate pediatrike. Zgjidh preparatin e saktë para llogaritjes.`
      : 'Nuk u gjet bar pediatrik i aprovuar për këtë kërkim.';
    list.innerHTML = rows.length
      ? `<div class="pediatric-search-results">${rows.slice(0, SEARCH_LIMIT).map(candidateMarkup).join('')}</div>${rows.length > SEARCH_LIMIT ? `<p class="pediatric-search-more">Shfaqen ${SEARCH_LIMIT} rezultatet e para. Saktëso kërkimin për të ngushtuar listën.</p>` : ''}`
      : '<div class="clinical-empty">Nuk u gjet bar pediatrik i aprovuar për këtë kërkim.</div>';
  }

  function addToPrescription(regimenId, cardKey) {
    const regimen = (state.payload.pediatric || []).find(item => item.regimenId === regimenId);
    const card = eligibleCards().find(item => item.cardKey === cardKey);
    if (!regimen || !card || !regimenVerified(regimen)) return;

    const eligibility = Engine?.pediatricEligibility?.(regimen, patient());
    if (!eligibility || eligibility.missing?.length) {
      $('#dosageStatus').textContent = 'Plotëso të dhënat e kërkuara të pacientit para bartjes së skemës pediatrike.';
      (eligibility?.missing?.includes('weightKg') ? $('#patientWeightKg') : $('#patientAgeMonths'))?.focus();
      return;
    }
    if (!eligibility.eligible) {
      $('#dosageStatus').textContent = 'Pacienti është jashtë kufijve të deklaruar të kësaj skeme. Nuk u krijua bartje automatike.';
      return;
    }

    const calculation = Engine?.calculatePediatricDose?.(regimen, patient()) || null;
    if (!calculation || calculation.status === 'manual' || calculation.status === 'out-of-range') {
      $('#dosageStatus').textContent = 'Kjo skemë kërkon rishikim manual dhe nuk bartet automatikisht.';
      return;
    }
    if (calculation.status === 'range-calculated' || calculation.requiresDoseSelection) {
      $('#dosageStatus').textContent = 'Rezultati është interval. Zgjidhja e dozës brenda intervalit kërkon vendim klinik dhe nuk bartet automatikisht.';
      return;
    }

    const transfer = Engine?.prescriptionTransfer?.(cardAsDrug(card), regimen, 'pediatric', calculation);
    if (!transfer || !text(transfer.signatura)) {
      $('#dosageStatus').textContent = 'Signatura nuk mund të krijohet automatikisht për këtë skemë.';
      return;
    }

    transfer.patient = patient();
    transfer.calculation = calculation;
    transfer.dosageStatus = 'requires-review';
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify([transfer]));
    location.href = '/recetat.html';
  }

  async function load() {
    try {
      const requestOptions = { credentials:'same-origin', headers:{ Accept:'application/json' }, cache:'no-store' };
      const [dosageResponse, populationResponse] = await Promise.all([
        fetch('/api/dosage', requestOptions),
        fetch('/api/dosage?view=approved-population', requestOptions),
      ]);
      const [payload, populationPayload] = await Promise.all([dosageResponse.json(), populationResponse.json()]);
      if (!dosageResponse.ok) throw new Error(payload.error || `API ${dosageResponse.status}`);
      if (!populationResponse.ok || !populationPayload?.ok || !Array.isArray(populationPayload.items)) {
        throw new Error(populationPayload?.error || 'Klasifikimi i popullatës nuk u ngarkua.');
      }

      state.payload = { forms:[], adult:[], pediatric:[], cards:[], ...payload };
      state.approvedPopulationByNr = new Map(populationPayload.items
        .map(item => [Number(item?.registryNumber), text(item?.approvedPopulation)])
        .filter(([registryNumber, population]) => Number.isInteger(registryNumber) && registryNumber > 0 && population));
      state.populationReady = true;
      render();
    } catch (error) {
      state.populationReady = false;
      state.selectedCardKey = '';
      $('#dosageCount').textContent = '0';
      $('#dosageStatus').textContent = error.message || 'Kalkulatori pediatrik nuk mund të ngarkohet tani.';
      $('#dosageList').innerHTML = '<div class="clinical-empty"><strong>Kalkulatori u ndal për siguri.</strong><span>Nuk shfaqet rezultat numerik pa të dhënat e dozimit dhe klasifikimin e popullatës.</span></div>';
    }
  }

  function init() {
    initTheme();
    /* Kalkulatori me llogaritje në server e merr pronësinë e kësaj faqeje kur
       është i pranishëm. Ky kontrollues e ngarkonte të gjithë katalogun e
       dozimit në shfletues dhe llogariste vendi; të dy bashkë do të shkruanin
       mbi të njëjtin `#dosageList` dhe do të tregonin dy të vërteta. Tema
       mbetet këtu sepse është e faqes, jo e kalkulatorit. */
    if (document.documentElement.dataset.pediatricCalculator === 'server') return;
    $('#dosageSearch')?.addEventListener('input', () => {
      state.selectedCardKey = '';
      render();
    });
    $('#patientWeightKg')?.addEventListener('input', render);
    $('#patientAgeMonths')?.addEventListener('input', render);
    $('#dosageList')?.addEventListener('change', event => {
      const select = event.target.closest('[data-indication-card]');
      if (!select) return;
      state.selectedRegimens[selectionKey(select.dataset.indicationCard)] = select.value;
      render();
    });
    $('#dosageList')?.addEventListener('click', event => {
      const candidate = event.target.closest('[data-select-pediatric-card]');
      if (candidate) {
        state.selectedCardKey = candidate.dataset.selectPediatricCard || '';
        render();
        $('#patientWeightKg')?.focus();
        return;
      }
      if (event.target.closest('[data-change-pediatric-card]')) {
        state.selectedCardKey = '';
        render();
        $('#dosageSearch')?.focus();
        return;
      }
      const button = event.target.closest('[data-add-regimen]');
      if (button) addToPrescription(button.dataset.addRegimen, button.dataset.cardKey);
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
