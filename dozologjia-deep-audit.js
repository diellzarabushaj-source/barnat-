(() => {
  'use strict';

  const Engine = window.MedIndexDosageEngine;
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const formatNumber = value => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('sq-AL', { maximumFractionDigits:Number(value) > 0 && Number(value) < 1 ? 3 : 2 }).format(Number(value))
    : '';

  let payload = { adult:[], pediatric:[], cards:[] };
  let calculableOnly = false;
  let frame = 0;

  function cardAsDrug(card, population = 'adult') {
    return {
      key:card.cardKey,
      drugKey:card.cardKey,
      tradeName:card.tradeName,
      substance:card.substance,
      strength:card.strength,
      form:card.form,
      atc:card.atc,
      pdid:card.pdid,
      route:population === 'pediatric' ? card.pediatricRoute : card.adultRoute,
    };
  }

  function exactRegimens(card, population) {
    const source = population === 'pediatric' ? payload.pediatric : payload.adult;
    return Engine?.exactMatches ? Engine.exactMatches(cardAsDrug(card, population), source || []) : [];
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
    catch { return '';
    }
  }

  function rangeText(min, max, unit) {
    const hasMin = Number.isFinite(Number(min));
    const hasMax = Number.isFinite(Number(max));
    if (!hasMin && !hasMax) return '';
    if (hasMin && hasMax) return `${formatNumber(min)}–${formatNumber(max)} ${unit}`;
    return hasMin ? `≥ ${formatNumber(min)} ${unit}` : `≤ ${formatNumber(max)} ${unit}`;
  }

  function regimenDetails(regimen, population) {
    if (!regimen) return [];
    const pediatric = population === 'pediatric';
    const details = [];
    if (pediatric) {
      if (Number.isFinite(Number(regimen.mgPerKg))) details.push(['Formula bazë', `${formatNumber(regimen.mgPerKg)} mg/kg/${/dit/i.test(text(regimen.basis)) ? 'ditë' : 'dozë'}`]);
      else if (Number.isFinite(Number(regimen.fixedDoseMg))) details.push(['Doza për marrje', `${formatNumber(regimen.fixedDoseMg)} mg`]);
      else if (Number.isFinite(Number(regimen.fixedVolumeMl))) details.push(['Vëllimi për marrje', `${formatNumber(regimen.fixedVolumeMl)} mL`]);
      if (text(regimen.concentration)) details.push(['Përqendrimi', text(regimen.concentration)]);
      const age = rangeText(regimen.minAgeMonths, regimen.maxAgeMonths, 'muaj');
      const weight = rangeText(regimen.minWeightKg, regimen.maxWeightKg, 'kg');
      if (age) details.push(['Kufiri i moshës', age]);
      if (weight) details.push(['Kufiri i peshës', weight]);
    } else {
      const dose = [text(regimen.doseMg), text(regimen.practicalUnit), text(regimen.unitCount)].filter(Boolean).join(' · ');
      if (dose) details.push(['Doza për marrje', dose]);
    }
    if (text(regimen.route)) details.push(['Rruga', text(regimen.route)]);
    if (text(regimen.frequency)) details.push(['Shpeshtësia', text(regimen.frequency)]);
    else if (Number.isFinite(Number(regimen.dosesPerDay))) details.push(['Marrje në ditë', formatNumber(regimen.dosesPerDay)]);
    if (Number.isFinite(Number(regimen.intervalHours))) details.push(['Intervali', `çdo ${formatNumber(regimen.intervalHours)} orë`]);
    if (text(regimen.duration)) details.push(['Kohëzgjatja', text(regimen.duration)]);
    if (Number.isFinite(Number(regimen.maxSingleMg))) details.push(['Maksimumi për dozë', `${formatNumber(regimen.maxSingleMg)} mg`]);
    if (Number.isFinite(Number(regimen.max24hMg))) details.push(['Maksimumi në 24 orë', `${formatNumber(regimen.max24hMg)} mg`]);
    if (text(regimen.maxUnits24h)) details.push(['Maksimumi i njësive', text(regimen.maxUnits24h)]);
    if (text(regimen.warnings)) details.push(['Kujdes', text(regimen.warnings)]);
    return details;
  }

  function statusText(population, matches, regimen) {
    if (!matches.length) return 'Tekst i verifikuar';
    if (matches.length > 1 && !regimen) return 'Zgjidh indikacionin';
    if (population === 'pediatric' && hasStructuredRule(regimen)) return 'Formulë e verifikuar';
    return 'Skemë e verifikuar';
  }

  function provenanceNode(regimen) {
    if (!regimen) return null;
    const url = /^https:\/\//i.test(text(regimen.sourceUrl)) ? text(regimen.sourceUrl) : '';
    const node = document.createElement('div');
    node.className = 'dosage-regimen-provenance';
    node.innerHTML = `<b>Gjurmueshmëria e skemës</b><div>
      ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(sourceDomain(url) || 'Hape burimin')}</a>` : '<span>Burimi i skemës nuk është lidhur</span>'}
      ${text(regimen.sourceDate) ? `<span>Data e burimit: ${esc(regimen.sourceDate)}</span>` : ''}
      ${text(regimen.regimenId) ? `<span>ID: ${esc(regimen.regimenId)}</span>` : ''}
    </div>`;
    return node;
  }

  function readinessNode(card, population, matches, regimen) {
    const pediatric = population === 'pediatric';
    const checks = [
      ['Doza', pediatric ? Boolean(text(card.pediatricDose)) : Boolean(text(card.adultDose))],
      ['Rruga', pediatric ? Boolean(text(card.pediatricRoute)) : Boolean(text(card.adultRoute))],
      ['Indikacioni', matches.length <= 1 || Boolean(regimen)],
      ['Burimi', Boolean(regimen?.sourceUrl || card.sourceUrls?.length)],
    ];
    if (pediatric && regimen) checks.push(['Formula', hasStructuredRule(regimen)]);
    const ready = checks.every(([, ok]) => ok);
    const node = document.createElement('div');
    node.className = `dosage-readiness ${ready ? 'is-ready' : 'is-review'}`;
    node.innerHTML = `<div class="dosage-readiness-head"><b>${ready ? 'E gatshme për rishikim' : 'Kërkon plotësim/rishikim'}</b><span>${ready ? 'Kontrollo klinikisht para përdorimit' : 'Mos e përdor automatikisht'}</span></div><div class="dosage-readiness-checks">${checks.map(([label, ok]) => `<span class="${ok ? 'is-ok' : 'is-missing'}">${ok ? '✓' : '–'} ${esc(label)}</span>`).join('')}</div>`;
    return node;
  }

  function enhanceMissingPediatric(section) {
    if (!section?.classList.contains('is-empty')) return;
    const paragraph = section.querySelector('.dosage-empty-text');
    if (paragraph) paragraph.innerHTML = '<strong>Nuk është publikuar në dataset.</strong> Kjo nuk do të thotë se bari është i kundërindikuar ose i autorizuar për fëmijë. Kontrollo SmPC-në ose burimin zyrtar.';
    const badge = section.querySelector('.dosage-population-badge');
    if (badge) badge.textContent = 'Pa të dhëna të publikuara';
  }

  function enhanceArticle(article) {
    const card = (payload.cards || []).find(item => item.cardKey === article.dataset.cardKey);
    if (!card) return;
    const pediatricMatches = exactRegimens(card, 'pediatric');
    const calculable = pediatricMatches.some(hasStructuredRule);
    article.hidden = calculableOnly && !calculable;
    article.dataset.calculablePediatric = calculable ? '1' : '0';

    article.querySelectorAll('.dosage-dose-field b').forEach(label => {
      if (text(label.textContent) === 'Doza e plotë') label.textContent = 'Regjimi i dozimit';
    });

    article.querySelectorAll('.dosage-population').forEach(section => {
      const population = section.classList.contains('is-pediatric') ? 'pediatric' : 'adult';
      if (population === 'pediatric') enhanceMissingPediatric(section);
      if (section.classList.contains('is-empty')) return;
      const matches = exactRegimens(card, population);
      const regimen = selectedRegimen(article, population, matches);
      const badge = section.querySelector('.dosage-population-badge');
      if (badge) badge.textContent = statusText(population, matches, regimen);

      section.querySelectorAll('.dosage-structured-details,.dosage-regimen-provenance,.dosage-readiness').forEach(node => node.remove());
      const details = regimenDetails(regimen, population);
      if (details.length) {
        const block = document.createElement('div');
        block.className = 'dosage-structured-details';
        block.innerHTML = `<div class="dosage-structured-title">Detajet e skemës së zgjedhur</div><div class="dosage-structured-grid">${details.map(([label, value]) => `<div class="dosage-structured-item"><b>${esc(label)}</b><span>${esc(value)}</span></div>`).join('')}</div>`;
        const signature = section.querySelector('.dosage-signature');
        if (signature) signature.before(block); else section.appendChild(block);
      }
      const signature = section.querySelector('.dosage-signature');
      const provenance = provenanceNode(regimen);
      if (provenance) signature ? signature.after(provenance) : section.appendChild(provenance);
      section.appendChild(readinessNode(card, population, matches, regimen));
    });

    article.querySelectorAll('.dosage-card-actions button:not(:disabled)').forEach(button => {
      if (/Shto dozën e të rriturit/i.test(button.textContent)) button.textContent = 'Shto në recetë për rishikim';
    });

    const sources = article.querySelector('.dosage-card-sources');
    if (sources) {
      sources.querySelector('.dosage-source-meta')?.remove();
      const count = Array.isArray(card.sourceUrls) ? card.sourceUrls.filter(Boolean).length : 0;
      const meta = document.createElement('span');
      meta.className = 'dosage-source-meta';
      meta.textContent = [count ? `${count} ${count === 1 ? 'burim' : 'burime'}` : 'Pa burim të lidhur', card.auditedAt ? `Kontrolluar më ${card.auditedAt}` : ''].filter(Boolean).join(' · ');
      sources.appendChild(meta);
    }
  }

  function updateCount() {
    const visible = [...document.querySelectorAll('.dosage-card')].filter(card => !card.hidden).length;
    if (calculableOnly && $('#dosageStatus')) $('#dosageStatus').textContent = `${visible} kartela me formulë pediatrike të strukturuar dhe të llogaritshme`;
  }

  function enhanceAll() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      document.querySelectorAll('.dosage-card').forEach(enhanceArticle);
      updateCount();
    });
  }

  function setupCalculatorPanel() {
    const inputs = $('#pediatricInputs');
    if (!inputs || inputs.closest('.dosage-calculator-panel')) return;
    const panel = document.createElement('details');
    panel.className = 'dosage-calculator-panel';
    panel.id = 'dosageCalculatorPanel';
    panel.innerHTML = '<summary><span><strong>Kalkulatori pediatrik</strong><small>Hape vetëm kur duhet llogaritje sipas peshës</small></span><i aria-hidden="true">⌄</i></summary>';
    inputs.before(panel);
    panel.appendChild(inputs);
    inputs.hidden = false;
    $('#dosagePopulation')?.addEventListener('change', event => { if (event.target.value === 'pediatric') panel.open = true; });
  }

  function setupControls() {
    setupCalculatorPanel();
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
    if (list) new MutationObserver(enhanceAll).observe(list, { childList:true });
    list?.addEventListener('change', enhanceAll);
    $('#patientWeightKg')?.addEventListener('input', enhanceAll);
    $('#patientAgeMonths')?.addEventListener('input', enhanceAll);
    loadPayload();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
