(() => {
  'use strict';

  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const Engine = window.MedIndexDosageEngine;
  const state = {
    payload:{ forms:[], adult:[], pediatric:[], cards:[] },
    population:'all',
    selectedRegimens:{},
  };
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

  function cards() {
    return Array.isArray(state.payload.cards) ? state.payload.cards : [];
  }

  function setOptions(selector, values, placeholder) {
    const node = $(selector);
    if (!node) return;
    const current = node.value;
    node.innerHTML = `<option value="">${placeholder}</option>${values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
    if (values.includes(current)) node.value = current;
  }

  function refreshFilters() {
    const rows = cards();
    setOptions('#dosageForm', [...new Set(rows.map(item => item.form).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sq')), 'Të gjitha format');
    setOptions('#dosageAtc', [...new Set(rows.map(item => item.atc).filter(Boolean))].sort(), 'Të gjitha ATC-të');
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
      route:card.adultRoute,
    };
  }

  function exactRegimens(card, population) {
    const source = population === 'pediatric' ? state.payload.pediatric : state.payload.adult;
    return Engine?.exactMatches ? Engine.exactMatches(cardAsDrug(card), source || []) : [];
  }

  function selectionKey(cardKey, population) {
    return `${cardKey}::${population}`;
  }

  function selectedRegimen(card, population, matches = exactRegimens(card, population)) {
    if (matches.length === 1) return matches[0];
    const selectedId = state.selectedRegimens[selectionKey(card.cardKey, population)] || '';
    return matches.find(item => item.regimenId === selectedId) || null;
  }

  function formatDose(value, unit) {
    if (!Number.isFinite(value)) return '';
    return `${new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(value)} ${unit}`;
  }

  function indicationMarkup(card, population, matches, regimen) {
    if (!matches.length) return '';
    const label = population === 'pediatric' ? 'Indikacioni pediatrik' : 'Indikacioni';
    if (matches.length === 1) {
      return `<div class="dosage-indication is-fixed"><b>${label}</b><span>${esc(regimen?.indication || 'Skema e vetme e strukturuar')}</span></div>`;
    }
    return `<label class="dosage-indication">
      <b>${label}</b>
      <select data-indication-card="${esc(card.cardKey)}" data-indication-population="${esc(population)}" aria-label="${esc(label)} për ${esc(card.tradeName || card.substance)}">
        <option value="">Zgjidh indikacionin…</option>
        ${matches.map(item => `<option value="${esc(item.regimenId)}" ${regimen?.regimenId === item.regimenId ? 'selected' : ''}>${esc(item.indication || 'Indikacion pa emër')}</option>`).join('')}
      </select>
    </label>`;
  }

  function pediatricCalculation(regimen) {
    return regimen && Engine?.calculatePediatricDose ? Engine.calculatePediatricDose(regimen, patient()) : null;
  }

  function calculationMarkup(card, matches, regimen) {
    if (!text(card.pediatricDose)) return '';
    if (!matches.length) {
      return '<div class="dosage-calculation"><strong>Dozë pediatrike e publikuar</strong><p class="dosage-calculation-note">Doza është publikuar si tekst. Kalkulatori aktivizohet pasi formula të strukturohet dhe të lidhet me burimin.</p></div>';
    }
    if (matches.length > 1 && !regimen) {
      return '<div class="dosage-calculation"><strong>Kalkulatori sipas kg</strong><p class="dosage-calculation-note">Zgjidh indikacionin për ta përdorur skemën e saktë.</p></div>';
    }

    const result = pediatricCalculation(regimen);
    if (!result || result.status === 'manual') {
      return '<div class="dosage-calculation"><strong>Rishikim manual</strong><p class="dosage-calculation-note">Kjo skemë nuk mund të llogaritet automatikisht pa interpretim klinik.</p></div>';
    }
    if (result.status === 'needs-patient-data') {
      const needs = [];
      if (result.missing?.includes('weightKg')) needs.push('peshën');
      if (result.missing?.includes('ageMonths')) needs.push('moshën');
      return `<div class="dosage-calculation"><strong>Kalkulatori sipas kg</strong><p class="dosage-calculation-note">Shëno ${esc(needs.join(' dhe ') || 'të dhënat e pacientit')} sipër.</p></div>`;
    }
    if (result.status === 'out-of-range') {
      return '<div class="dosage-calculation"><strong>Kërkohet rishikim klinik</strong><p class="dosage-calculation-note">Mosha ose pesha është jashtë kufijve të deklaruar të kësaj skeme.</p></div>';
    }

    const items = [
      result.perDoseMg != null ? ['Për një dozë', formatDose(result.perDoseMg, 'mg')] : null,
      result.perDoseMl != null ? ['Vëllimi për dozë', formatDose(result.perDoseMl, 'mL')] : null,
      result.dailyTotalMg != null ? ['Totali në 24 orë', formatDose(result.dailyTotalMg, 'mg')] : null,
      result.dosesPerDay != null ? ['Marrje në ditë', `${result.dosesPerDay}`] : null,
    ].filter(Boolean);
    if (!items.length) return '';
    const capped = result.cappedBy?.length ? ' Është zbatuar kufiri maksimal i publikuar.' : '';
    return `<div class="dosage-calculation">
      <strong>Rezultati për ${esc(formatDose(patient().weightKg, 'kg'))}</strong>
      <div class="dosage-calculation-grid">${items.map(([label, value]) => `<div class="dosage-calculation-item"><b>${esc(label)}</b>${esc(value)}</div>`).join('')}</div>
      <p class="dosage-calculation-note">Llogaritur nga formula e strukturuar e publikuar.${esc(capped)}</p>
    </div>`;
  }

  function signatureMarkup(population, matches, regimen) {
    if (!matches.length) {
      return '<div class="dosage-signature is-pending"><b>Signatura automatike</b><p>Në pritje të lidhjes me një skemë të strukturuar.</p></div>';
    }
    if (matches.length > 1 && !regimen) {
      return '<div class="dosage-signature is-pending"><b>Signatura automatike</b><p>Zgjidh indikacionin dhe signatura plotësohet vetë.</p></div>';
    }

    let calculation = null;
    if (population === 'pediatric') {
      calculation = pediatricCalculation(regimen);
      if (calculation?.status === 'needs-patient-data') {
        return '<div class="dosage-signature is-pending"><b>Signatura automatike</b><p>Shëno peshën dhe, vetëm kur kërkohet, moshën.</p></div>';
      }
      if (calculation?.status === 'out-of-range') {
        return '<div class="dosage-signature is-warning"><b>Signatura nuk u krijua</b><p>Pacienti është jashtë kufijve të deklaruar të skemës.</p></div>';
      }
    }

    const signature = Engine?.buildSignature?.(regimen, population, calculation) || text(regimen?.signatura);
    if (!signature) {
      return '<div class="dosage-signature is-pending"><b>Signatura automatike</b><p>Skema kërkon plotësim manual të signaturës.</p></div>';
    }
    return `<div class="dosage-signature"><b>Signatura automatike</b><p>${esc(signature)}</p><span>Bartet automatikisht në recetë dhe mund të redaktohet aty.</span></div>`;
  }

  function statusLabel(population, matches, regimen) {
    if (!matches.length) return 'Pa skemë të strukturuar';
    if (matches.length > 1 && !regimen) return 'Zgjidh indikacionin';
    if (population === 'pediatric' && (
      Number.isFinite(regimen?.mgPerKg)
      || Number.isFinite(regimen?.fixedDoseMg)
      || Number.isFinite(regimen?.fixedVolumeMl)
    )) return 'Kalkulim sipas kg';
    return /^https:\/\//i.test(text(regimen?.sourceUrl)) ? 'Skemë me burim' : 'Skemë e strukturuar';
  }

  function populationMarkup(card, population) {
    const pediatric = population === 'pediatric';
    const dose = pediatric ? text(card.pediatricDose) : text(card.adultDose);
    const route = pediatric ? text(card.pediatricRoute) : text(card.adultRoute);
    const label = pediatric ? 'Doza për fëmijë' : 'Doza për të rritur';
    if (!dose && pediatric) {
      return `<section class="dosage-population is-pediatric is-empty">
        <div class="dosage-population-head"><h3 class="dosage-population-title">${label}</h3><span class="dosage-population-badge">Në pritje të plotësimit</span></div>
        <p class="dosage-empty-text">Nuk ka dozë pediatrike të strukturuar dhe të publikuar për këtë kartelë.</p>
      </section>`;
    }

    const matches = exactRegimens(card, population);
    const regimen = selectedRegimen(card, population, matches);
    return `<section class="dosage-population ${pediatric ? 'is-pediatric' : 'is-adult'}">
      <div class="dosage-population-head"><h3 class="dosage-population-title">${label}</h3><span class="dosage-population-badge">${esc(statusLabel(population, matches, regimen))}</span></div>
      ${indicationMarkup(card, population, matches, regimen)}
      <div class="dosage-dose-grid">
        <div class="dosage-dose-field"><b>Doza e plotë</b>${esc(dose || 'Nuk është shënuar')}</div>
        <div class="dosage-dose-field"><b>Rruga</b>${esc(route || 'Kontrollo burimin')}</div>
      </div>
      ${pediatric ? calculationMarkup(card, matches, regimen) : ''}
      ${signatureMarkup(population, matches, regimen)}
    </section>`;
  }

  function linkedSources(card) {
    return Array.isArray(card.sourceUrls) ? card.sourceUrls.filter(url => /^https:\/\//i.test(url)) : [];
  }

  function provenanceChip(card) {
    const linked = linkedSources(card).length > 0;
    return `<span class="dosage-card-chip ${linked ? 'has-source' : 'is-unverified'}">${linked ? 'BURIM I LIDHUR' : 'PA BURIM TË LIDHUR'}</span>`;
  }

  function sourceMarkup(card) {
    const sources = linkedSources(card);
    if (!sources.length) return '<span class="dosage-card-chip">Burimi nuk është lidhur</span>';
    return sources.slice(0, 3).map((url, index) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Burimi${sources.length > 1 ? ` ${index + 1}` : ''}</a>`).join('');
  }

  function actionButton(card, population, label, className) {
    const matches = exactRegimens(card, population);
    const regimen = selectedRegimen(card, population, matches);
    if (!matches.length) return '';
    if (!regimen) return '<button type="button" disabled>Zgjidh indikacionin</button>';
    return `<button class="${className}" type="button" data-add-regimen="${esc(regimen.regimenId)}" data-population="${esc(population)}" data-card-key="${esc(card.cardKey)}">${esc(label)}</button>`;
  }

  function actionMarkup(card) {
    const buttons = [];
    buttons.push(actionButton(card, 'adult', 'Shto dozën e të rriturit', 'is-primary'));
    if (text(card.pediatricDose)) buttons.push(actionButton(card, 'pediatric', 'Shto në recetë për rishikim', 'is-child'));
    return buttons.filter(Boolean).join('');
  }

  function cardMarkup(card) {
    const title = [card.tradeName, card.strength].filter(Boolean).join(' ');
    const showAdult = state.population !== 'pediatric';
    const showPediatric = state.population !== 'adult';
    return `<article class="dosage-card" data-card-key="${esc(card.cardKey)}">
      <header class="dosage-card-head">
        <div>
          <h2 class="dosage-card-title">${esc(title || card.substance || 'Bar pa emërtim')}</h2>
          <p class="dosage-card-substance">${esc(card.substance || 'Substanca aktive nuk është shënuar')}</p>
          <div class="dosage-card-meta">
            ${card.atc ? `<span class="dosage-card-chip">${esc(card.atc)}</span>` : ''}
            ${card.form ? `<span class="dosage-card-chip">${esc(card.form)}</span>` : ''}
            ${card.pdid ? `<span class="dosage-card-chip">PDID ${esc(card.pdid)}</span>` : ''}
            ${provenanceChip(card)}
          </div>
        </div>
        <span class="dosage-card-number">Nr. ${esc(card.nr || '—')}</span>
      </header>
      ${(card.drugClass || card.use) ? `<div class="dosage-card-context">
        ${card.drugClass ? `<div class="dosage-context-item"><b>Klasa / Çka është</b>${esc(card.drugClass)}</div>` : ''}
        ${card.use ? `<div class="dosage-context-item"><b>Përdorimi</b>${esc(card.use)}</div>` : ''}
      </div>` : ''}
      <div class="dosage-populations">
        ${showAdult ? populationMarkup(card, 'adult') : ''}
        ${showPediatric ? populationMarkup(card, 'pediatric') : ''}
      </div>
      ${card.auditNote ? `<div class="dosage-card-context"><div class="dosage-context-item"><b>Shënim auditimi</b>${esc(card.auditNote)}</div>${card.auditedAt ? `<div class="dosage-context-item"><b>Kontrolluar më</b>${esc(card.auditedAt)}</div>` : ''}</div>` : ''}
      <footer class="dosage-card-footer">
        <div class="dosage-card-sources">${sourceMarkup(card)}</div>
        <div class="dosage-card-actions">${actionMarkup(card)}</div>
      </footer>
    </article>`;
  }

  function filteredCards() {
    const query = fold($('#dosageSearch')?.value);
    const form = $('#dosageForm')?.value || '';
    const atc = $('#dosageAtc')?.value || '';
    return cards().filter(card => {
      const haystack = fold([card.nr, card.tradeName, card.substance, card.strength, card.atc, card.form, card.drugClass, card.use, card.adultDose, card.pediatricDose].join(' '));
      const populationMatch = state.population !== 'pediatric' || Boolean(text(card.pediatricDose));
      return populationMatch && (!query || haystack.includes(query)) && (!form || card.form === form) && (!atc || card.atc === atc);
    });
  }

  function render() {
    const rows = filteredCards();
    const total = cards().length;
    const pediatricCount = cards().filter(card => text(card.pediatricDose)).length;
    const linkedSourceCount = cards().filter(card => linkedSources(card).length).length;
    $('#dosageCount').textContent = total;
    $('#dosageStatus').textContent = `${rows.length} nga ${total} kartela · ${linkedSourceCount} me burim të lidhur · ${pediatricCount} me dozë pediatrike`;
    $('#dosageList').innerHTML = rows.length ? rows.map(cardMarkup).join('') : '<div class="clinical-empty">Nuk u gjet asnjë kartelë për këta filtra.</div>';
  }

  function addToPrescription(regimenId, population, cardKey) {
    const collection = population === 'pediatric' ? state.payload.pediatric : state.payload.adult;
    const regimen = (collection || []).find(item => item.regimenId === regimenId);
    const card = cards().find(item => item.cardKey === cardKey);
    if (!regimen || !card) return;

    let calculation = null;
    if (population === 'pediatric') {
      const eligibility = Engine.pediatricEligibility(regimen, patient());
      if (eligibility.missing.length) {
        $('#dosageStatus').textContent = 'Plotëso peshën dhe, vetëm kur kërkohet, moshën para bartjes së skemës pediatrike.';
        (eligibility.missing.includes('weightKg') ? $('#patientWeightKg') : $('#patientAgeMonths'))?.focus();
        return;
      }
      if (!eligibility.eligible) {
        $('#dosageStatus').textContent = 'Pacienti është jashtë kufijve të deklaruar të kësaj skeme. Kërkohet rishikim klinik.';
        return;
      }
      calculation = Engine.calculatePediatricDose?.(regimen, patient()) || null;
      if (calculation?.status === 'manual' && !text(regimen.signatura)) {
        $('#dosageStatus').textContent = 'Kjo skemë nuk ka signaturë të sigurt për bartje automatike. Plotësoje manualisht në recetë.';
        return;
      }
    }

    const transfer = Engine.prescriptionTransfer(cardAsDrug(card), regimen, population, calculation);
    if (!text(transfer.signatura)) {
      $('#dosageStatus').textContent = 'Signatura nuk mund të krijohet automatikisht për këtë skemë.';
      return;
    }
    if (population === 'pediatric') {
      transfer.patient = patient();
      transfer.calculation = calculation;
      transfer.dosageStatus = 'requires-review';
    }
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify([transfer]));
    location.href = '/recetat.html';
  }

  async function load() {
    try {
      const response = await fetch('/api/dosage', { credentials:'same-origin', headers:{ Accept:'application/json' }, cache:'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `API ${response.status}`);
      state.payload = { forms:[], adult:[], pediatric:[], cards:[], ...payload };
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
      state.population = event.target.value || 'all';
      render();
    });
    $('#dosageForm')?.addEventListener('change', render);
    $('#dosageAtc')?.addEventListener('change', render);
    $('#patientWeightKg')?.addEventListener('input', render);
    $('#patientAgeMonths')?.addEventListener('input', render);
    $('#dosageList')?.addEventListener('change', event => {
      const select = event.target.closest('[data-indication-card]');
      if (!select) return;
      state.selectedRegimens[selectionKey(select.dataset.indicationCard, select.dataset.indicationPopulation)] = select.value;
      render();
    });
    $('#dosageList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-add-regimen]');
      if (button) addToPrescription(button.dataset.addRegimen, button.dataset.population, button.dataset.cardKey);
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
