(() => {
  'use strict';

  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const Engine = window.MedIndexDosageEngine;
  const state = { payload:{ forms:[], adult:[], pediatric:[], cards:[] }, population:'all' };
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

  function formatDose(value, unit) {
    if (!Number.isFinite(value)) return '';
    return `${new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(value)} ${unit}`;
  }

  function calculationMarkup(card) {
    if (!text(card.pediatricDose)) return '';
    const matches = exactRegimens(card, 'pediatric');
    if (!matches.length) {
      return '<div class="dosage-calculation"><strong>Kalkulatori sipas kg</strong><p class="dosage-calculation-note">Doza pediatrike është e publikuar si tekst, por nuk ka ende formulë të strukturuar për llogaritje automatike.</p></div>';
    }
    if (matches.length > 1) {
      return '<div class="dosage-calculation"><strong>Kalkulatori sipas kg</strong><p class="dosage-calculation-note">Ekzistojnë disa skema sipas indikacionit. Llogaritja automatike kërkon zgjedhjen klinike të skemës.</p></div>';
    }

    const regimen = matches[0];
    const result = Engine.calculatePediatricDose?.(regimen, patient());
    if (!result || result.status === 'manual') {
      return '<div class="dosage-calculation"><strong>Kalkulatori sipas kg</strong><p class="dosage-calculation-note">Kjo skemë kërkon llogaritje ose rishikim klinik manual.</p></div>';
    }
    if (result.status === 'needs-patient-data') {
      const needs = [];
      if (result.missing?.includes('weightKg')) needs.push('peshën');
      if (result.missing?.includes('ageMonths')) needs.push('moshën');
      return `<div class="dosage-calculation"><strong>Kalkulatori sipas kg</strong><p class="dosage-calculation-note">Shëno ${esc(needs.join(' dhe ') || 'të dhënat e pacientit')} sipër për ta llogaritur këtë skemë.</p></div>`;
    }
    if (result.status === 'out-of-range') {
      return '<div class="dosage-calculation"><strong>Kërkohet rishikim klinik</strong><p class="dosage-calculation-note">Mosha ose pesha është jashtë kufijve të verifikuar të kësaj skeme.</p></div>';
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
      <p class="dosage-calculation-note">Llogaritur nga formula e strukturuar e verifikuar.${esc(capped)}</p>
    </div>`;
  }

  function populationMarkup(card, population) {
    const pediatric = population === 'pediatric';
    const dose = pediatric ? text(card.pediatricDose) : text(card.adultDose);
    const route = pediatric ? text(card.pediatricRoute) : text(card.adultRoute);
    const label = pediatric ? 'Doza për fëmijë' : 'Doza për të rritur';
    if (!dose && pediatric) {
      return `<section class="dosage-population is-pediatric is-empty">
        <div class="dosage-population-head"><h3 class="dosage-population-title">${label}</h3><span class="dosage-population-badge">Jo e publikuar</span></div>
        <p class="dosage-empty-text">Nuk ka dozë pediatrike të verifikuar dhe të publikuar për këtë kartelë.</p>
      </section>`;
    }
    return `<section class="dosage-population ${pediatric ? 'is-pediatric' : 'is-adult'}">
      <div class="dosage-population-head"><h3 class="dosage-population-title">${label}</h3><span class="dosage-population-badge">VERIFIKUAR</span></div>
      <div class="dosage-dose-grid">
        <div class="dosage-dose-field"><b>Doza e plotë</b>${esc(dose || 'Nuk është shënuar')}</div>
        <div class="dosage-dose-field"><b>Rruga</b>${esc(route || 'Kontrollo burimin')}</div>
      </div>
      ${pediatric ? calculationMarkup(card) : ''}
    </section>`;
  }

  function sourceMarkup(card) {
    const sources = Array.isArray(card.sourceUrls) ? card.sourceUrls.filter(url => /^https:\/\//i.test(url)) : [];
    if (!sources.length) return '<span class="dosage-card-chip">Burimi nuk është lidhur</span>';
    return sources.slice(0, 3).map((url, index) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Burimi${sources.length > 1 ? ` ${index + 1}` : ''}</a>`).join('');
  }

  function actionMarkup(card) {
    const buttons = [];
    const adult = exactRegimens(card, 'adult');
    const pediatric = exactRegimens(card, 'pediatric');
    if (adult.length === 1) buttons.push(`<button class="is-primary" type="button" data-add-regimen="${esc(adult[0].regimenId)}" data-population="adult" data-card-key="${esc(card.cardKey)}">Shto dozën e të rriturit</button>`);
    if (text(card.pediatricDose) && pediatric.length === 1) buttons.push(`<button class="is-child" type="button" data-add-regimen="${esc(pediatric[0].regimenId)}" data-population="pediatric" data-card-key="${esc(card.cardKey)}">Shto dozën pediatrike</button>`);
    return buttons.join('');
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
            <span class="dosage-card-chip is-verified">VERIFIKUAR</span>
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
    $('#dosageCount').textContent = total;
    $('#dosageStatus').textContent = `${rows.length} nga ${total} kartela të verifikuara · ${pediatricCount} me dozë pediatrike të publikuar`;
    $('#dosageList').innerHTML = rows.length ? rows.map(cardMarkup).join('') : '<div class="clinical-empty">Nuk u gjet asnjë kartelë për këta filtra.</div>';
  }

  function addToPrescription(regimenId, population, cardKey) {
    const collection = population === 'pediatric' ? state.payload.pediatric : state.payload.adult;
    const regimen = (collection || []).find(item => item.regimenId === regimenId);
    const card = cards().find(item => item.cardKey === cardKey);
    if (!regimen || !card) return;

    if (population === 'pediatric') {
      const eligibility = Engine.pediatricEligibility(regimen, patient());
      if (eligibility.missing.length) {
        $('#dosageStatus').textContent = 'Plotëso peshën dhe, kur kërkohet, moshën para bartjes së skemës pediatrike.';
        (eligibility.missing.includes('weightKg') ? $('#patientWeightKg') : $('#patientAgeMonths'))?.focus();
        return;
      }
      if (!eligibility.eligible) {
        $('#dosageStatus').textContent = 'Pacienti është jashtë kufijve të verifikuar të kësaj skeme. Kërkohet rishikim klinik.';
        return;
      }
    }

    const transfer = Engine.prescriptionTransfer(cardAsDrug(card), regimen, population);
    if (population === 'pediatric') {
      transfer.patient = patient();
      transfer.calculation = Engine.calculatePediatricDose?.(regimen, patient()) || null;
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
    $('#dosageList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-add-regimen]');
      if (button) addToPrescription(button.dataset.addRegimen, button.dataset.population, button.dataset.cardKey);
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
