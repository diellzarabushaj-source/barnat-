(() => {
  'use strict';

  const page = document.querySelector('[data-mi-page="urgjencat"] .clinical-knowledge-page');
  const search = document.getElementById('emergencySearch');
  const searchPanel = page?.querySelector('.ck-rapid-search-panel');
  const list = document.getElementById('emergencyList');
  const quickHost = document.getElementById('emergencyQuickSearch');
  const engine = window.MedIndexEmergencySearchCore;
  if (!page || !search || !searchPanel || !list || !engine?.rankPrepared || !engine?.prepare) return;

  const USAGE_KEY = 'medindex_emergency_search_usage_v1';
  const MAX_RESULTS = 7;
  const QUICK_LIMIT = 4;
  let indexedSource = null;
  let preparedCorpus = [];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function preparedItems() {
    const source = items();
    if (source !== indexedSource || preparedCorpus.length !== source.length) {
      indexedSource = source;
      preparedCorpus = engine.prepare(source);
    }
    return preparedCorpus;
  }

  function readUsage() {
    try {
      const value = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function recordOpen(itemId) {
    if (!itemId) return;
    const usage = readUsage();
    const previous = usage[itemId] || {};
    usage[itemId] = {
      count:Math.min(Number(previous.count || 0) + 1, 999),
      lastAt:Date.now(),
    };
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch {}
    renderQuickAccess();
  }

  function triageLabel(value) {
    return ({critical:'Kritike','very-urgent':'Shumë urgjente',urgent:'Urgjente'})[value] || '';
  }

  function triageClass(value) {
    return ['critical','very-urgent','urgent'].includes(value) ? `is-${value}` : '';
  }

  function reviewLabel(value) {
    return ({verified:'Verifikuar',review:'Për verifikim',draft:'Draft'})[value] || '';
  }

  function strengthLabel(value) {
    return ({exact:'E saktë',strong:'Përputhje e fortë',supporting:'Mbështetëse'})[value] || '';
  }

  function ranked(query) {
    return engine.rankPrepared(preparedItems(), query, readUsage(), {limit:MAX_RESULTS});
  }

  let host = null;
  let quickAccessHost = null;
  let activeIndex = -1;
  let results = [];

  function ensureHost() {
    if (host?.isConnected) return host;
    host = document.createElement('div');
    host.id = 'emergencySmartResults';
    host.className = 'ck-v8-smart-results';
    host.hidden = true;
    host.setAttribute('role', 'listbox');
    host.setAttribute('aria-label', 'Përputhjet e urgjencave');
    searchPanel.appendChild(host);
    search.setAttribute('aria-controls', host.id);
    search.setAttribute('aria-autocomplete', 'list');
    host.addEventListener('mousedown', event => event.preventDefault());
    host.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-v8-id]');
      if (button) {
        openResult(button.dataset.ckV8Id || '');
        return;
      }
      const rescue = event.target.closest('[data-ck-v8-rescue-id]');
      if (rescue) openResult(rescue.dataset.ckV8RescueId || '');
    });
    return host;
  }

  function ensureQuickAccessHost() {
    if (quickAccessHost?.isConnected) return quickAccessHost;
    quickAccessHost = document.createElement('div');
    quickAccessHost.className = 'ck-v8-frequent ck-v8-quick-access';
    quickAccessHost.hidden = true;
    quickAccessHost.setAttribute('aria-label', 'Qasje e shpejtë te urgjencat');
    const anchor = quickHost || searchPanel.querySelector('.ck-status');
    if (anchor) anchor.insertAdjacentElement('beforebegin', quickAccessHost);
    else searchPanel.appendChild(quickAccessHost);
    quickAccessHost.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-v8-quick]');
      if (button) openResult(button.dataset.ckV8Quick || '');
    });
    return quickAccessHost;
  }

  function usageRows() {
    const usage = readUsage();
    const byId = new Map(items().map(item => [String(item?._id || ''), item]));
    return Object.entries(usage)
      .map(([id, data]) => ({item:byId.get(id), id, count:Number(data?.count || 0), lastAt:Number(data?.lastAt || 0)}))
      .filter(row => row.item && row.count > 0 && row.lastAt > 0);
  }

  function frequentItems(rows = usageRows()) {
    return rows
      .filter(row => row.count >= 2)
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, QUICK_LIMIT);
  }

  function recentItems(rows = usageRows(), excludeIds = new Set()) {
    return rows
      .filter(row => !excludeIds.has(row.id))
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, QUICK_LIMIT);
  }

  function quickSection(label, rows) {
    if (!rows.length) return '';
    return `<div class="ck-v8-quick-section"><span>${esc(label)}</span><div>${rows.map(row => `<button type="button" data-ck-v8-quick="${esc(row.item?._id || '')}">${esc(row.item?.title || 'Urgjencë')}</button>`).join('')}</div></div>`;
  }

  function renderQuickAccess() {
    ensureQuickAccessHost();
    const rows = usageRows();
    const frequent = frequentItems(rows);
    const frequentIds = new Set(frequent.map(row => row.id));
    const recent = recentItems(rows, frequentIds);
    const markup = [
      quickSection('Të fundit', recent),
      quickSection('Të shpeshtat', frequent),
    ].filter(Boolean).join('');
    quickAccessHost.hidden = Boolean(search.value.trim()) || !markup;
    quickAccessHost.innerHTML = markup;
  }

  function evidenceMarkup(result) {
    const terms = result.clinicalTerms?.length ? result.clinicalTerms : result.matchedTerms;
    if (!terms?.length || ['Diagnozë e saktë','ICD i saktë','ICD'].includes(result.reason)) return '';
    return `<span class="ck-v8-match"><span>Përputhen</span>${terms.slice(0,3).map(term => `<b>${esc(term)}</b>`).join('')}</span>`;
  }

  function renderResult(result, index) {
    const item = result.item || {};
    const meta = [...(item.icdCodes || []).slice(0,2), item.category].filter(Boolean).join(' · ');
    const triage = triageLabel(item.triageLevel);
    const triageTone = triageClass(item.triageLevel);
    const review = reviewLabel(item.reviewStatus);
    const strength = strengthLabel(result.strength);
    return `<button type="button" id="ck-v8-result-${index}" role="option" aria-selected="false" data-ck-v8-id="${esc(item._id || '')}" data-ck-v8-strength="${esc(result.strength || '')}" data-ck-v8-triage="${esc(item.triageLevel || '')}">
      <span class="ck-v8-result-body">
        <span class="ck-v8-result-title"><strong>${esc(item.title || 'Urgjencë')}</strong>${triage ? `<em class="${esc(triageTone)}">${esc(triage)}</em>` : ''}</span>
        ${meta ? `<small class="ck-v8-meta">${esc(meta)}</small>` : ''}
        ${evidenceMarkup(result)}
      </span>
      <span class="ck-v8-result-side"><small>${esc(result.reason)}</small>${strength ? `<b class="ck-v8-strength is-${esc(result.strength || 'supporting')}">${esc(strength)}</b>` : ''}${review ? `<b class="is-${esc(item.reviewStatus || 'unknown')}">${esc(review)}</b>` : ''}</span>
    </button>`;
  }

  function renderRescue(query) {
    if (!engine?.suggestPrepared) return '';
    const suggestions = engine.suggestPrepared(preparedItems(), query, {limit:3});
    if (!suggestions.length) return '';
    return `<div class="ck-v8-rescue" aria-label="Sugjerime drejtshkrimore">
      <span>Ndoshta kërkoje:</span>
      <div>${suggestions.map(result => `<button type="button" data-ck-v8-rescue-id="${esc(result.item?._id || '')}">${esc(result.item?.title || 'Urgjencë')}</button>`).join('')}</div>
      <small>Sugjerime drejtshkrimore · jo diagnozë automatike.</small>
    </div>`;
  }

  function setActive(index) {
    if (!host || !results.length) return;
    activeIndex = Math.max(0, Math.min(index, results.length - 1));
    host.querySelectorAll('[data-ck-v8-id]').forEach((button, buttonIndex) => {
      const active = buttonIndex === activeIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) search.setAttribute('aria-activedescendant', button.id);
    });
  }

  function render() {
    ensureHost();
    renderQuickAccess();
    const query = search.value.trim();
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
      const rescue = renderRescue(query);
      host.innerHTML = `<div class="ck-v8-empty"><strong>Asnjë përputhje e fortë.</strong><span>Provo emrin e diagnozës, ICD ose 2–3 shenja kryesore.</span></div>${rescue}`;
      host.hidden = false;
      activeIndex = -1;
      search.removeAttribute('aria-activedescendant');
      return;
    }

    host.innerHTML = `
      <div class="ck-v8-head"><span>${results.length === 1 ? 'Përputhja më e mirë' : 'Përputhjet më të mira'}</span><small>Forca e kërkimit · Nuk është diagnozë automatike</small></div>
      ${results.map(renderResult).join('')}
      <div class="ck-v8-keyhint"><span>↑↓ zgjidh</span><span>Enter hape</span></div>`;
    host.hidden = false;
    setActive(0);
  }

  function openResult(itemId) {
    const item = items().find(candidate => String(candidate?._id || '') === String(itemId || ''));
    if (!item) return;
    recordOpen(itemId);
    search.value = item.title || '';
    if (host) host.hidden = true;
    if (quickAccessHost) quickAccessHost.hidden = true;
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
  search.addEventListener('focus', render);
  search.addEventListener('blur', () => window.setTimeout(() => { if (host) host.hidden = true; }, 120));
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (host && !host.hidden) {
        event.preventDefault();
        host.hidden = true;
        search.removeAttribute('aria-activedescendant');
      }
      return;
    }
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
  ensureQuickAccessHost();
  renderQuickAccess();
  window.setTimeout(renderQuickAccess, 220);
})();