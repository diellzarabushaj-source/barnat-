(() => {
  'use strict';

  const Engine = window.MedIndexDosageEngine;
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  let payload = { adult:[], pediatric:[], cards:[] };
  let calculableOnly = false;
  let frame = 0;

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
    const source = population === 'pediatric' ? payload.pediatric : payload.adult;
    return Engine?.exactMatches ? Engine.exactMatches(cardAsDrug(card), source || []) : [];
  }

  function selectedRegimen(article, population, matches) {
    if (matches.length === 1) return matches[0];
    const section = article.querySelector(`.dosage-population.${population === 'pediatric' ? 'is-pediatric' : 'is-adult'}`);
    const id = section?.querySelector('[data-indication-card]')?.value || '';
    return matches.find(item => item.regimenId === id) || null;
  }

  function hasStructuredRule(regimen) {
    return Boolean(regimen && (
      Number.isFinite(Number(regimen.mgPerKg))
      || Number.isFinite(Number(regimen.fixedDoseMg))
      || Number.isFinite(Number(regimen.fixedVolumeMl))
    ));
  }

  function sourceDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return ''; }
  }

  function provenanceMarkup(regimen) {
    if (!regimen) return '';
    const url = /^https:\/\//i.test(text(regimen.sourceUrl)) ? text(regimen.sourceUrl) : '';
    const date = text(regimen.sourceDate);
    const parts = [
      url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(sourceDomain(url) || 'Hape burimin')}</a>` : '<span>Burimi i skemës nuk është lidhur</span>',
      date ? `<span>Burimi: ${esc(date)}</span>` : '',
      text(regimen.regimenId) ? `<span>ID: ${esc(regimen.regimenId)}</span>` : '',
    ].filter(Boolean).join('');
    return `<div class="dosage-regimen-provenance"><b>Gjurmueshmëria e skemës</b><div>${parts}</div></div>`;
  }

  function readinessMarkup(card, population, matches, regimen) {
    const pediatric = population === 'pediatric';
    const items = [];
    items.push(['Doza', pediatric ? Boolean(text(card.pediatricDose)) : Boolean(text(card.adultDose))]);
    items.push(['Rruga', pediatric ? Boolean(text(card.pediatricRoute)) : Boolean(text(card.adultRoute))]);
    items.push(['Indikacioni', matches.length <= 1 || Boolean(regimen)]);
    items.push(['Burimi', Boolean(regimen?.sourceUrl || card.sourceUrls?.length)]);
    if (pediatric && regimen) items.push(['Formula', hasStructuredRule(regimen)]);
    const ready = items.every(([, status]) => status);
    return `<div class="dosage-readiness ${ready ? 'is-ready' : 'is-review'}">
      <div class="dosage-readiness-head"><b>${ready ? 'E gatshme për rishikim' : 'Kërkon plotësim/rishikim'}</b><span>${ready ? 'Kontrollo klinikisht para përdorimit' : 'Mos e përdor automatikisht'}</span></div>
      <div class="dosage-readiness-checks">${items.map(([label, status]) => `<span class="${status ? 'is-ok' : 'is-missing'}">${status ? '✓' : '–'} ${esc(label)}</span>`).join('')}</div>
    </div>`;
  }

  function enhanceMissingPediatric(section) {
    if (!section?.classList.contains('is-empty')) return;
    const paragraph = section.querySelector('.dosage-empty-text');
    if (paragraph) paragraph.innerHTML = '<strong>Nuk është publikuar në dataset.</strong> Kjo nuk do të thotë se bari është i kundërindikuar ose i autorizuar për fëmijë. Statusi klinik duhet kontrolluar në burimin zyrtar.';
    const badge = section.querySelector('.dosage-population-badge');
    if (badge) badge.textContent = 'Pa të dhëna të publikuara';
  }

  function enhanceArticle(article) {
    const card = (payload.cards || []).find(item => item.cardKey === article.dataset.cardKey);
    if (!card) return;

    const pediatricMatches = exactRegimens(card, 'pediatric');
    article.hidden = calculableOnly && !pediatricMatches.some(hasStructuredRule);
    article.dataset.calculablePediatric = pediatricMatches.some(hasStructuredRule) ? '1' : '0';

    article.querySelectorAll('.dosage-population').forEach(section => {
      const population = section.classList.contains('is-pediatric') ? 'pediatric' : 'adult';
      if (population === 'pediatric') enhanceMissingPediatric(section);
      if (section.classList.contains('is-empty')) return;
      const matches = exactRegimens(card, population);
      const regimen = selectedRegimen(article, population, matches);

      section.querySelector('.dosage-regimen-provenance')?.remove();
      section.querySelector('.dosage-readiness')?.remove();
      const signature = section.querySelector('.dosage-signature');
      const provenance = provenanceMarkup(regimen);
      if (provenance) {
        const holder = document.createElement('div');
        holder.innerHTML = provenance;
        const node = holder.firstElementChild;
        if (signature) signature.after(node); else section.appendChild(node);
      }
      const readinessHolder = document.createElement('div');
      readinessHolder.innerHTML = readinessMarkup(card, population, matches, regimen);
      section.appendChild(readinessHolder.firstElementChild);
    });
  }

  function updateFilterCount() {
    const visible = [...document.querySelectorAll('.dosage-card')].filter(card => !card.hidden).length;
    const status = $('#dosageStatus');
    if (calculableOnly && status) status.textContent = `${visible} kartela me formulë pediatrike të strukturuar dhe të llogaritshme`;
  }

  function enhanceAll() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      document.querySelectorAll('.dosage-card').forEach(enhanceArticle);
      updateFilterCount();
    });
  }

  function setupControls() {
    const toolbar = document.querySelector('.clinical-toolbar');
    if (toolbar && !$('#calculablePediatricOnly')) {
      const button = document.createElement('button');
      button.id = 'calculablePediatricOnly';
      button.className = 'dosage-calculable-filter';
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = '<span aria-hidden="true">∑</span><span>Vetëm me kalkulator</span>';
      toolbar.after(button);
      button.addEventListener('click', () => {
        calculableOnly = !calculableOnly;
        button.setAttribute('aria-pressed', String(calculableOnly));
        button.classList.toggle('is-active', calculableOnly);
        if (calculableOnly) {
          const population = $('#dosagePopulation');
          if (population && population.value !== 'pediatric') {
            population.value = 'pediatric';
            population.dispatchEvent(new Event('change', { bubbles:true }));
          }
          const panel = $('#dosageCalculatorPanel');
          if (panel) panel.open = true;
        }
        enhanceAll();
      });
    }

    const patient = $('#pediatricInputs');
    if (patient && !$('#clearPediatricPatient')) {
      const clear = document.createElement('button');
      clear.id = 'clearPediatricPatient';
      clear.className = 'dosage-patient-clear';
      clear.type = 'button';
      clear.textContent = 'Pastro të dhënat';
      patient.appendChild(clear);
      clear.addEventListener('click', () => {
        const weight = $('#patientWeightKg');
        const age = $('#patientAgeMonths');
        if (weight) weight.value = '';
        if (age) age.value = '';
        weight?.dispatchEvent(new Event('input', { bubbles:true }));
        weight?.focus();
      });
    }
  }

  async function loadPayload() {
    try {
      const response = await fetch('/api/dosage', { credentials:'same-origin', headers:{ Accept:'application/json' }, cache:'no-store' });
      const data = await response.json();
      if (response.ok) payload = { adult:[], pediatric:[], cards:[], ...data };
    } catch {}
    enhanceAll();
  }

  function init() {
    setupControls();
    const list = $('#dosageList');
    if (list) new MutationObserver(enhanceAll).observe(list, { childList:true, subtree:true });
    list?.addEventListener('change', enhanceAll);
    $('#patientWeightKg')?.addEventListener('input', enhanceAll);
    $('#patientAgeMonths')?.addEventListener('input', enhanceAll);
    loadPayload();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
