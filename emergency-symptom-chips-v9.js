(() => {
  'use strict';

  const page = document.querySelector('[data-mi-page="urgjencat"] .clinical-knowledge-page');
  const search = document.getElementById('emergencySearch');
  const panel = page?.querySelector('.ck-rapid-search-panel');
  const legacyQuick = document.getElementById('emergencyQuickSearch');
  const engine = window.MedIndexEmergencySearchCore;
  if (!page || !search || !panel || !engine?.rankPrepared || !engine?.prepare) return;

  const CANDIDATES = [
    {key:'chest', label:'Dhimbje gjoksi', query:'dhimbje gjoksi'},
    {key:'dyspnea', label:'Dispne', query:'dispne'},
    {key:'unconscious', label:'Pa vetëdije', query:'vetëdije'},
    {key:'seizure', label:'Konvulsione', query:'konvulsione'},
    {key:'palpitations', label:'Palpitacione', query:'palpitacione'},
    {key:'allergy', label:'Reaksion alergjik', query:'reaksion alergjik'},
    {key:'bleeding', label:'Gjakderdhje', query:'gjakderdhje'},
    {key:'abdomen', label:'Dhimbje barku', query:'dhimbje barku'},
    {key:'headache', label:'Dhimbje koke', query:'dhimbje koke'},
    {key:'fever', label:'Temperaturë', query:'temperaturë'},
  ];
  const MAX_VISIBLE = 8;
  const selected = new Set();
  let writing = false;
  let host = null;
  let availabilitySource = null;
  let availabilityLength = -1;
  let cachedAvailable = [];

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function availableCandidates() {
    const corpus = items();
    if (!corpus.length) {
      availabilitySource = corpus;
      availabilityLength = 0;
      cachedAvailable = [];
      return cachedAvailable;
    }
    if (corpus === availabilitySource && corpus.length === availabilityLength) return cachedAvailable;

    availabilitySource = corpus;
    availabilityLength = corpus.length;
    const prepared = engine.prepare(corpus);
    cachedAvailable = CANDIDATES
      .map(candidate => ({...candidate, hits:engine.rankPrepared(prepared, candidate.query, {}, {limit:20}).length}))
      .filter(candidate => candidate.hits > 0)
      .slice(0, MAX_VISIBLE);
    return cachedAvailable;
  }

  function ensureHost() {
    if (host?.isConnected) return host;
    host = document.createElement('div');
    host.className = 'ck-v9-symptoms';
    host.hidden = true;
    host.setAttribute('aria-label', 'Kërko sipas shenjave kryesore');
    const status = panel.querySelector('.ck-status');
    if (status) status.insertAdjacentElement('beforebegin', host);
    else panel.appendChild(host);

    host.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-v9-symptom]');
      if (button) {
        const key = button.dataset.ckV9Symptom || '';
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        applySelection();
        return;
      }
      if (event.target.closest('[data-ck-v9-clear]')) {
        selected.clear();
        applySelection();
      }
    });
    return host;
  }

  function selectionQuery(available) {
    return available.filter(item => selected.has(item.key)).map(item => item.query).join(' ').trim();
  }

  function render() {
    ensureHost();
    const available = availableCandidates();
    if (!available.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    for (const key of [...selected]) {
      if (!available.some(item => item.key === key)) selected.delete(key);
    }
    host.innerHTML = `
      <span class="ck-v9-label">Shenja kryesore</span>
      <div class="ck-v9-chip-row">
        ${available.map(item => `<button type="button" data-ck-v9-symptom="${item.key}" aria-pressed="${selected.has(item.key) ? 'true' : 'false'}">${item.label}</button>`).join('')}
        ${selected.size ? '<button type="button" class="ck-v9-clear" data-ck-v9-clear>Hiqi</button>' : ''}
      </div>`;
    host.hidden = false;
    /* Kërkimi i shpejtë fshihet vetëm kur këto shenja zënë vendin e tij, dhe
       vetëm nëse s'është tashmë i fshehur. `emergency-rapid-search.js` e
       zotëron të njëjtin atribut dhe e vëzhgon; një shkrim i pakushtëzuar këtu
       e nis një ping-pong që s'mbaron. Shih shënimin te vëzhguesi më poshtë. */
    if (legacyQuick && !legacyQuick.hidden) legacyQuick.hidden = true;
  }

  function applySelection() {
    const available = availableCandidates();
    const query = selectionQuery(available);
    writing = true;
    search.value = query;
    search.dispatchEvent(new Event('input', {bubbles:true}));
    writing = false;
    render();
    search.focus({preventScroll:true});
  }

  search.addEventListener('input', () => {
    if (writing || !selected.size) return;
    const generated = selectionQuery(availableCandidates());
    if (search.value.trim() !== generated) {
      selected.clear();
      render();
    }
  }, {capture:true});

  /* Vëzhguesi rindërton shenjat kur kërkimi i shpejtë ndryshon, por nuk shkruan
     vetë mbi `hidden`.
     Shkrimi i mëparshëm ishte i pakushtëzuar dhe mbi pikërisht atributin që ky
     vëzhgues dëgjon, ndërsa `emergency-rapid-search.js` e vendos të njëjtin
     atribut në `false` sa herë ka përputhje — dhe e vëzhgon edhe ai. Të dy
     shkrimet ushqenin njëri-tjetrin si microtask-e: fija kryesore nuk kthehej
     kurrë te event loop-i, ndaj faqja nuk mbërrinte kurrë te DOMContentLoaded.
     Ndizej vetëm kur kishte urgjenca reale, sepse pa to s'ka përputhje.
     Tani `render()` është i vetmi shkrues, dhe vetëm kur shenjat vërtet e zënë
     vendin e kërkimit të shpejtë. */
  const observer = new MutationObserver(() => {
    if (!host || host.hidden || !host.querySelector('[data-ck-v9-symptom]')) render();
  });
  if (legacyQuick) observer.observe(legacyQuick, {childList:true, subtree:true, attributes:true, attributeFilter:['hidden']});

  ensureHost();
  render();
  window.setTimeout(render, 220);
})();