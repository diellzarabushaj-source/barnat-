(() => {
  'use strict';

  const page = document.querySelector('[data-mi-page="urgjencat"] .clinical-knowledge-page');
  const search = document.getElementById('emergencySearch');
  const searchPanel = page?.querySelector('.ck-rapid-search-panel');
  const list = document.getElementById('emergencyList');
  const quickHost = document.getElementById('emergencyQuickSearch');
  if (!page || !search || !searchPanel || !list) return;

  const USAGE_KEY = 'medindex_emergency_search_usage_v1';
  const MAX_RESULTS = 7;
  const STOP_WORDS = new Set([
    'pacient','pacienti','pacientes','eshte','është','jane','janë','dhe','apo','ose','por','me','ne','në','te','të','tek','nga','per','për','nje','një','që','qe','ka','kam','kemi','po','spo','nuk','pa','si','i','e','a',
    'patient','the','and','or','with','without','has','have','is','are','to','of','in','on','for','from'
  ]);
  const INDEX_CACHE = new Map();

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function allItems() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function readUsage() {
    try {
      const value = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function writeUsage(value) {
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(value)); } catch {}
  }

  function recordOpen(itemId) {
    if (!itemId) return;
    const usage = readUsage();
    const previous = usage[itemId] || {};
    usage[itemId] = {
      count: Math.min(Number(previous.count || 0) + 1, 999),
      lastAt: Date.now(),
    };
    writeUsage(usage);
    renderFrequent();
  }

  function meaningfulTokens(value) {
    return normalize(value).split(' ')
      .filter(token => token && !STOP_WORDS.has(token) && !/^\d+(?:\.\d+)?$/.test(token))
      .filter(token => token.length >= 3)
      .slice(0, 8);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > 2) return 3;
    const prev = Array.from({length:b.length + 1}, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let left = i;
      let diagonal = i - 1;
      for (let j = 1; j <= b.length; j += 1) {
        const above = prev[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const next = Math.min(left + 1, above + 1, diagonal + cost);
        diagonal = above;
        prev[j] = next;
        left = next;
      }
    }
    return prev[b.length];
  }

  function textTokens(values) {
    return normalize(values.filter(Boolean).join(' ')).split(' ').filter(Boolean);
  }

  function itemIndex(item) {
    const cacheKey = String(item?._id || item?.title || '');
    if (cacheKey && INDEX_CACHE.has(cacheKey)) return INDEX_CACHE.get(cacheKey);
    const primary = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const secondary = Array.isArray(item?.secondaryCareSteps) ? item.secondaryCareSteps : [];
    const index = {
      title: normalize(item?.title || ''),
      aliases: (item?.aliases || []).map(normalize).filter(Boolean),
      icd: (item?.icdCodes || []).map(normalize).filter(Boolean),
      high: textTokens([item?.title, ...(item?.aliases || []), ...(item?.icdCodes || []), item?.category, item?.chapterTitle, item?.subchapterTitle]),
      clinical: textTokens([
        item?.summary,
        ...(item?.redFlags || []),
        ...(item?.doNotDo || []),
        ...primary.flatMap(step => [step?.title, step?.action, step?.why, step?.note]),
        ...secondary.flatMap(step => [step?.title, step?.action, step?.why, step?.note]),
        item?.referral?.when,
        item?.referral?.destination,
      ]),
    };
    if (cacheKey) INDEX_CACHE.set(cacheKey, index);
    return index;
  }

  function tokenMatchScore(queryToken, candidate, weight) {
    if (!candidate) return 0;
    if (candidate === queryToken) return weight;
    if (candidate.startsWith(queryToken) || queryToken.startsWith(candidate)) return Math.round(weight * .84);
    if (candidate.includes(queryToken) || queryToken.includes(candidate)) return Math.round(weight * .68);
    if (queryToken.length >= 4 && candidate.length >= 4) {
      const threshold = Math.max(queryToken.length, candidate.length) >= 8 ? 2 : 1;
      if (levenshtein(queryToken, candidate) <= threshold) return Math.round(weight * .48);
    }
    return 0;
  }

  function usageBoost(itemId, usage) {
    const entry = usage[itemId] || {};
    const count = Math.min(Number(entry.count || 0), 20);
    const age = Date.now() - Number(entry.lastAt || 0);
    const recent = age >= 0 && age < 7 * 24 * 60 * 60 * 1000 ? 22 : age < 30 * 24 * 60 * 60 * 1000 ? 10 : 0;
    return count * 3 + recent;
  }

  function rankItem(item, rawQuery, usage) {
    const query = normalize(rawQuery);
    if (!query) return null;
    const index = itemIndex(item);
    const queryTokens = meaningfulTokens(query);
    let score = 0;
    let reason = '';

    if (index.title === query) { score += 1300; reason = 'Diagnozë e saktë'; }
    else if (index.title.startsWith(query)) { score += 1050; reason = 'Diagnozë'; }
    else if (index.title.includes(query)) { score += 850; reason = 'Diagnozë'; }

    if (index.aliases.some(alias => alias === query)) { score += 1150; reason ||= 'Sinonim'; }
    else if (index.aliases.some(alias => alias.startsWith(query) || alias.includes(query))) { score += 820; reason ||= 'Sinonim'; }

    if (index.icd.some(code => code === query || code.startsWith(query))) { score += 1200; reason = 'ICD'; }

    let matched = 0;
    let highMatches = 0;
    let clinicalMatches = 0;
    queryTokens.forEach(token => {
      let bestHigh = 0;
      for (const candidate of index.high) bestHigh = Math.max(bestHigh, tokenMatchScore(token, candidate, 120));
      let bestClinical = 0;
      for (const candidate of index.clinical) bestClinical = Math.max(bestClinical, tokenMatchScore(token, candidate, 72));
      const best = Math.max(bestHigh, bestClinical);
      if (best > 0) {
        matched += 1;
        score += best;
        if (bestHigh >= bestClinical) highMatches += 1;
        else clinicalMatches += 1;
      }
    });

    if (queryTokens.length) {
      const coverage = matched / queryTokens.length;
      score += Math.round(coverage * 330);
      if (!reason && matched) reason = clinicalMatches > highMatches ? 'Shenja / përmbajtje' : 'Përputhje klinike';
      if (matched === 0 && score < 700) return null;
      if (coverage < .34 && score < 850) return null;
    } else if (score === 0) {
      return null;
    }

    if (item?.triageLevel === 'critical') score += 38;
    else if (item?.triageLevel === 'very-urgent') score += 24;
    if (item?.reviewStatus === 'verified') score += 12;
    score += usageBoost(item?._id || '', usage);

    return {item, score, reason: reason || 'Përputhje'};
  }

  function ranked(rawQuery) {
    const usage = readUsage();
    return allItems()
      .map(item => rankItem(item, rawQuery, usage))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || String(a.item?.title || '').localeCompare(String(b.item?.title || ''), 'sq'))
      .slice(0, MAX_RESULTS);
  }

  function triageLabel(value) {
    return ({critical:'Kritike','very-urgent':'Shumë urgjente',urgent:'Urgjente'})[value] || '';
  }

  let host = null;
  let frequentHost = null;
  let activeIndex = -1;
  let results = [];

  function ensureHost() {
    if (host?.isConnected) return host;
    host = document.createElement('div');
    host.className = 'ck-v7-smart-results';
    host.id = 'emergencySmartResults';
    host.hidden = true;
    host.setAttribute('role', 'listbox');
    host.setAttribute('aria-label', 'Sugjerime inteligjente të urgjencave');
    searchPanel.appendChild(host);
    search.setAttribute('aria-controls', host.id);
    search.setAttribute('aria-autocomplete', 'list');
    host.addEventListener('mousedown', event => event.preventDefault());
    host.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-v7-id]');
      if (!button) return;
      openResult(button.dataset.ckV7Id || '');
    });
    return host;
  }

  function ensureFrequentHost() {
    if (frequentHost?.isConnected) return frequentHost;
    frequentHost = document.createElement('div');
    frequentHost.className = 'ck-v7-frequent';
    frequentHost.hidden = true;
    frequentHost.setAttribute('aria-label', 'Diagnozat e përdorura shpesh');
    const anchor = quickHost || searchPanel.querySelector('.ck-status');
    if (anchor) anchor.insertAdjacentElement('beforebegin', frequentHost);
    else searchPanel.appendChild(frequentHost);
    frequentHost.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-v7-frequent]');
      if (!button) return;
      openResult(button.dataset.ckV7Frequent || '');
    });
    return frequentHost;
  }

  function frequentItems() {
    const usage = readUsage();
    const byId = new Map(allItems().map(item => [String(item?._id || ''), item]));
    return Object.entries(usage)
      .map(([id, data]) => ({item:byId.get(id), count:Number(data?.count || 0), lastAt:Number(data?.lastAt || 0)}))
      .filter(row => row.item && row.count > 0)
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, 4);
  }

  function renderFrequent() {
    ensureFrequentHost();
    const rows = frequentItems();
    frequentHost.hidden = Boolean(search.value.trim()) || rows.length === 0;
    frequentHost.innerHTML = rows.length ? `
      <span>Të shpeshtat</span>
      <div>${rows.map(row => `<button type="button" data-ck-v7-frequent="${esc(row.item?._id || '')}">${esc(row.item?.title || 'Urgjencë')}</button>`).join('')}</div>` : '';
  }

  function setActive(index) {
    if (!host || !results.length) return;
    activeIndex = Math.max(0, Math.min(index, results.length - 1));
    host.querySelectorAll('[data-ck-v7-id]').forEach((button, buttonIndex) => {
      const active = buttonIndex === activeIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) search.setAttribute('aria-activedescendant', button.id);
    });
  }

  function render() {
    ensureHost();
    const query = search.value.trim();
    renderFrequent();
    if (!query) {
      results = [];
      activeIndex = -1;
      host.hidden = true;
      host.innerHTML = '';
      search.removeAttribute('aria-activedescendant');
      return;
    }
    results = ranked(query);
    if (!results.length) {
      host.innerHTML = '<div class="ck-v7-empty">Nuk u gjet përputhje inteligjente. Provo diagnozën, simptomën ose ICD.</div>';
      host.hidden = false;
      activeIndex = -1;
      return;
    }
    host.innerHTML = `
      <div class="ck-v7-result-label">${results.length === 1 ? 'Përputhja më e mirë' : 'Përputhjet më të mira'}</div>
      ${results.map((result, index) => {
        const item = result.item;
        const meta = [
          ...(item?.icdCodes || []).slice(0, 2),
          item?.category,
        ].filter(Boolean).join(' · ');
        const triage = triageLabel(item?.triageLevel);
        return `<button type="button" id="ck-v7-result-${index}" role="option" aria-selected="false" data-ck-v7-id="${esc(item?._id || '')}">
          <span class="ck-v7-result-main"><strong>${esc(item?.title || 'Urgjencë')}</strong><small>${esc(meta)}</small></span>
          <span class="ck-v7-result-side"><small>${esc(result.reason)}</small>${triage ? `<b>${esc(triage)}</b>` : ''}</span>
        </button>`;
      }).join('')}
      <div class="ck-v7-keyhint"><span>↑↓ zgjidh</span><span>Enter hape</span></div>`;
    host.hidden = false;
    setActive(0);
  }

  function openResult(itemId) {
    const item = allItems().find(candidate => String(candidate?._id || '') === String(itemId || ''));
    if (!item) return;
    recordOpen(itemId);
    search.value = item.title || '';
    host.hidden = true;
    if (frequentHost) frequentHost.hidden = true;
    search.removeAttribute('aria-activedescendant');
    search.dispatchEvent(new Event('input', {bubbles:true}));
    const open = () => {
      const button = list.querySelector(`.ck-list-button[data-id="${CSS.escape(itemId)}"]`);
      if (!button) return false;
      button.click();
      return true;
    };
    if (!open()) window.setTimeout(open, 60);
  }

  search.addEventListener('input', () => requestAnimationFrame(render), {capture:true});
  search.addEventListener('focus', () => render());
  search.addEventListener('blur', () => window.setTimeout(() => { if (host) host.hidden = true; }, 120));
  search.addEventListener('keydown', event => {
    if (!host || host.hidden || !results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setActive(activeIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const result = results[Math.max(activeIndex, 0)];
      if (result?.item?._id) openResult(result.item._id);
    }
  }, {capture:true});

  list.addEventListener('click', event => {
    const button = event.target.closest('.ck-list-button[data-id]');
    if (button && search.value.trim()) recordOpen(button.dataset.id || '');
  });

  ensureHost();
  ensureFrequentHost();
  renderFrequent();
  window.setTimeout(renderFrequent, 220);
})();