(() => {
  'use strict';

  const Engine = window.MedIndexDosageEngine;
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const formatNumber = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('sq-AL', { maximumFractionDigits:2 }).format(Number(value)) : '';
  let payload = { adult:[], pediatric:[], cards:[] };
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
    const rows = population === 'pediatric' ? payload.pediatric : payload.adult;
    return Engine?.exactMatches ? Engine.exactMatches(cardAsDrug(card), rows || []) : [];
  }

  function currentRegimen(section, matches) {
    if (matches.length === 1) return matches[0];
    const selectedId = section.querySelector('[data-indication-card]')?.value || '';
    return matches.find(item => item.regimenId === selectedId) || null;
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
    if (text(regimen.intervalHours)) details.push(['Intervali', `çdo ${text(regimen.intervalHours)} orë`]);
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
    if (population === 'pediatric' && regimen && (
      Number.isFinite(Number(regimen.mgPerKg)) || Number.isFinite(Number(regimen.fixedDoseMg)) || Number.isFinite(Number(regimen.fixedVolumeMl))
    )) return 'Formulë e verifikuar';
    return 'Skemë e verifikuar';
  }

  function enhanceCard(article) {
    const key = article.dataset.cardKey || '';
    const card = (payload.cards || []).find(item => item.cardKey === key);
    if (!card) return;

    article.querySelectorAll('.dosage-dose-field b').forEach(label => {
      if (text(label.textContent) === 'Doza e plotë') label.textContent = 'Regjimi i dozimit';
    });

    article.querySelectorAll('.dosage-population').forEach(section => {
      const population = section.classList.contains('is-pediatric') ? 'pediatric' : 'adult';
      if (section.classList.contains('is-empty')) return;
      const matches = exactRegimens(card, population);
      const regimen = currentRegimen(section, matches);
      const badge = section.querySelector('.dosage-population-badge');
      if (badge) badge.textContent = statusText(population, matches, regimen);

      section.querySelector('.dosage-structured-details')?.remove();
      const details = regimenDetails(regimen, population);
      if (details.length) {
        const block = document.createElement('div');
        block.className = 'dosage-structured-details';
        block.innerHTML = `<div class="dosage-structured-title">Detajet e skemës së zgjedhur</div><div class="dosage-structured-grid">${details.map(([label, value]) => `<div class="dosage-structured-item"><b>${esc(label)}</b><span>${esc(value)}</span></div>`).join('')}</div>`;
        const signature = section.querySelector('.dosage-signature');
        if (signature) signature.before(block); else section.appendChild(block);
      }
    });

    article.querySelectorAll('.dosage-card-actions button:not(:disabled)').forEach(button => {
      if (/Shto dozën e të rriturit/i.test(button.textContent)) button.textContent = 'Shto në recetë për rishikim';
    });

    const sources = article.querySelector('.dosage-card-sources');
    if (sources && !sources.querySelector('.dosage-source-meta')) {
      const count = Array.isArray(card.sourceUrls) ? card.sourceUrls.filter(Boolean).length : 0;
      const meta = document.createElement('span');
      meta.className = 'dosage-source-meta';
      meta.textContent = [count ? `${count} ${count === 1 ? 'burim' : 'burime'}` : 'Pa burim të lidhur', card.auditedAt ? `Kontrolluar më ${card.auditedAt}` : ''].filter(Boolean).join(' · ');
      sources.appendChild(meta);
    }
  }

  function enhanceAll() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => document.querySelectorAll('.dosage-card').forEach(enhanceCard));
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

    const population = $('#dosagePopulation');
    const sync = () => {
      if (population?.value === 'pediatric') panel.open = true;
    };
    population?.addEventListener('change', sync);
    sync();
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
    setupCalculatorPanel();
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