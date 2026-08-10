(() => {
  'use strict';

  const VERSION = 'registry-population-verification-20260810-1';
  const ENDPOINT = '/api/population-verification';
  const STATUS_COLUMN = 'clinical-status';
  const ACTION_COLUMN = 'clinical-action';
  const STATUS_WIDTH = 154;
  const ACTION_WIDTH = 54;
  const REQUEST_TIMEOUT_MS = 8000;
  const FAILURE_BACKOFF_BASE_MS = 15000;
  const FAILURE_BACKOFF_MAX_MS = 5 * 60 * 1000;
  const FAILURE_LOG_INTERVAL_MS = 60 * 1000;
  const decisionCache = new Map();
  const retryState = new Map();

  const ICONS = Object.freeze({
    yes:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.2 10.2 3.5 3.5 8.1-8.1"/></svg>',
    no:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.2 5.2 9.6 9.6M14.8 5.2l-9.6 9.6"/></svg>',
    unknown:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.7 7.2a2.7 2.7 0 1 1 4.3 2.2c-1.1.8-2 1.3-2 2.6M10 15.2h.01"/></svg>',
    conflict:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.2 17 16H3L10 3.2ZM10 7.3v4.5M10 14.2h.01"/></svg>',
    pencil:'<svg viewBox="0 0 20 20" aria-hidden="true" data-population-pencil><path d="m4 14.7-.7 2.8 2.8-.7L15.8 7 13 4.2 4 14.7Z"/><path d="m11.8 5.6 2.8 2.8M3.3 17.5h13.4"/></svg>',
  });

  let tableObserver = null;
  let dialogObserver = null;
  let scheduled = false;
  let fetching = false;
  let pendingRefresh = false;
  let editorRegistryNumber = null;
  let endpointFailures = 0;
  let endpointBackoffUntil = 0;
  let lastFailureLogAt = 0;
  let requestCount = 0;
  let requestFailures = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  async function api(url, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    requestCount += 1;
    try {
    const response = await fetch(url, {
      credentials:'same-origin', cache:'no-store', ...options,
      headers:{
        Accept:'application/json',
        ...(options.body ? { 'Content-Type':'application/json' } : {}),
        ...(options.headers || {}),
      },
      signal:controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Kërkesa dështoi (${response.status}).`);
    return payload;
    } catch (error) {
      requestFailures += 1;
      if (error?.name === 'AbortError') throw new Error('Verifikimi zgjati tepër; do të provohet më vonë.');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function retryDelay(failures) {
    return Math.min(FAILURE_BACKOFF_MAX_MS, FAILURE_BACKOFF_BASE_MS * (2 ** Math.max(0, failures - 1)));
  }

  function retryAllowed(number, now = Date.now()) {
    return (retryState.get(number)?.nextRetryAt || 0) <= now;
  }

  function clearRetryState(numbers) {
    numbers.forEach(number => retryState.delete(number));
    endpointFailures = 0;
    endpointBackoffUntil = 0;
  }

  function rememberFailure(numbers, error) {
    const now = Date.now();
    endpointFailures += 1;
    const endpointDelay = retryDelay(endpointFailures);
    endpointBackoffUntil = now + endpointDelay;
    numbers.forEach(number => {
      const failures = (retryState.get(number)?.failures || 0) + 1;
      retryState.set(number, { failures, nextRetryAt:now + retryDelay(failures) });
    });
    if (now - lastFailureLogAt >= FAILURE_LOG_INTERVAL_MS) {
      lastFailureLogAt = now;
      console.warn(`Verifikimi i popullatës nuk u ngarkua; tentativa tjetër pas ${Math.ceil(endpointDelay / 1000)}s.`, error);
    }
  }

  function registryNumberForRow(row) {
    const direct = Number(row?.dataset?.registryNumber);
    if (Number.isInteger(direct) && direct > 0) return direct;
    const value = Number(clean(row?.querySelector('.drug-select')?.dataset?.drugKey).split('|')[0]);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function visibleRegistryNumbers() {
    return [...document.querySelectorAll('#tbody > tr:not([hidden])')]
      .map(registryNumberForRow)
      .filter(number => Number.isInteger(number));
  }

  function stateTitle(decision, populationLabel) {
    const label = clean(decision?.label || 'Pa të dhëna');
    const reason = clean(decision?.reason || 'Nuk ka të dhëna të mjaftueshme.');
    return `${populationLabel}: ${label}. ${reason}`;
  }

  function populationRow(decision, label) {
    const state = ['yes', 'no', 'unknown', 'conflict'].includes(decision?.state) ? decision.state : 'unknown';
    const title = stateTitle(decision, label);
    return `<span class="population-verification-row state-${state}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
      <span class="population-verification-label">${escapeHtml(label)}</span>
      <span class="population-verification-icon">${ICONS[state]}</span>
    </span>`;
  }

  function statusMarkup(item) {
    const adult = item?.adult || { state:'unknown' };
    const pediatric = item?.pediatric || { state:'unknown' };
    return `<div class="population-verification-grid" data-population-verification-ui="${VERSION}">
      ${populationRow(adult, 'Të rritur')}
      ${populationRow(pediatric, 'Fëmijë')}
    </div>`;
  }

  function ensurePencil(row, registryNumber) {
    const cell = row.querySelector(`[data-registry-column-key="${ACTION_COLUMN}"], [data-clinical-editor-column="${ACTION_COLUMN}"]`);
    const button = cell?.querySelector('.clinical-editor-open');
    if (!button) return;
    button.dataset.registryNumber = String(registryNumber);
    button.setAttribute('aria-label', `Redakto barin ${registryNumber}`);
    button.title = 'Redakto';
    if (!button.querySelector('[data-population-pencil]')) button.innerHTML = ICONS.pencil;
  }

  function applyDecision(row, registryNumber) {
    const cell = row.querySelector(`[data-registry-column-key="${STATUS_COLUMN}"], [data-clinical-editor-column="${STATUS_COLUMN}"]`);
    if (!cell) return;
    const item = decisionCache.get(registryNumber);
    const key = `${item?.adult?.state || 'unknown'}:${item?.adult?.code || ''}|${item?.pediatric?.state || 'unknown'}:${item?.pediatric?.code || ''}`;
    if (cell.dataset.populationDecisionKey === key && cell.querySelector('[data-population-verification-ui]')) return;
    cell.dataset.populationDecisionKey = key;
    cell.innerHTML = statusMarkup(item);
  }

  function compactColumns() {
    const table = document.getElementById('dataTable');
    const wrapper = table?.closest('.table-wrap');
    if (!table || !wrapper) return;
    const widths = new Map([[STATUS_COLUMN, STATUS_WIDTH], [ACTION_COLUMN, ACTION_WIDTH]]);
    widths.forEach((width, key) => {
      const col = table.querySelector(`col[data-registry-column-key="${key}"]`);
      if (col) col.style.setProperty('width', `${width}px`, 'important');
    });

    if (!matchMedia('(min-width:761px)').matches) return;
    const total = [...table.querySelectorAll('col[data-registry-column-key]')].reduce((sum, col) => {
      if (col.style.display === 'none') return sum;
      const width = Number.parseFloat(col.style.width || '0');
      return sum + (Number.isFinite(width) ? width : 0);
    }, 0);
    const width = Math.max(Math.round(wrapper.clientWidth || 0), Math.round(total));
    table.style.setProperty('--registry-table-width', `${width}px`);
    table.style.setProperty('width', `${width}px`, 'important');
    table.style.setProperty('min-width', `${width}px`, 'important');
  }

  function enhanceRows() {
    document.querySelectorAll('#tbody > tr:not([hidden])').forEach(row => {
      if (row.querySelector('.empty-state')) return;
      const registryNumber = registryNumberForRow(row);
      if (!registryNumber) return;
      ensurePencil(row, registryNumber);
      applyDecision(row, registryNumber);
    });
    compactColumns();
    document.documentElement.dataset.populationVerificationUi = VERSION;
  }

  async function fetchVisibleDecisions({ force = false } = {}) {
    if (fetching) {
      pendingRefresh = pendingRefresh || force;
      return;
    }
    const visible = [...new Set(visibleRegistryNumbers())];
    const now = Date.now();
    const candidates = force ? visible : visible.filter(number => !decisionCache.has(number));
    const numbers = candidates.filter(number => retryAllowed(number, now));
    if (now < endpointBackoffUntil) {
      enhanceRows();
      return;
    }
    if (!numbers.length) {
      enhanceRows();
      return;
    }

    fetching = true;
    let succeeded = false;
    try {
      const payload = await api(`${ENDPOINT}?registryNumbers=${encodeURIComponent(numbers.join(','))}`);
      (payload.items || []).forEach(item => decisionCache.set(Number(item.registryNumber), item));
      numbers.forEach(number => {
        if (!decisionCache.has(number)) decisionCache.set(number, { registryNumber:number });
      });
      clearRetryState(numbers);
      succeeded = true;
      enhanceRows();
    } catch (error) {
      rememberFailure(numbers, error);
      enhanceRows();
    } finally {
      fetching = false;
      if (pendingRefresh && succeeded) {
        const refresh = pendingRefresh;
        pendingRefresh = false;
        void fetchVisibleDecisions({ force:refresh });
      } else {
        pendingRefresh = false;
      }
    }
  }

  function schedule({ force = false } = {}) {
    pendingRefresh = pendingRefresh || force;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceRows();
      const shouldForce = pendingRefresh;
      pendingRefresh = false;
      void fetchVisibleDecisions({ force:shouldForce });
      ensureEditorControls();
    });
  }

  function connectTableObserver() {
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');
    if (!tableObserver) tableObserver = new MutationObserver(() => schedule());
    if (tbody) tableObserver.observe(tbody, { childList:true });
    if (header) tableObserver.observe(header, { childList:true });
  }

  function editorNumber() {
    const fromState = Number(editorRegistryNumber);
    if (Number.isInteger(fromState) && fromState > 0) return fromState;
    const title = clean(document.getElementById('clinicalEditorTitle')?.textContent);
    const parsed = Number(title.match(/^(\d+)\./)?.[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function editorMessage(value, isError = false) {
    const message = document.getElementById('clinicalEditorMessage');
    if (!message) return;
    message.textContent = value;
    message.classList.toggle('population-decision-error', isError);
  }

  function populationPrefix(population) {
    return population === 'adult' ? 'adult' : 'pediatric';
  }

  function decisionControlMarkup(population) {
    const id = `populationDecision-${population}`;
    return `<div class="population-decision-control" data-population-decision-control="${population}">
      <label for="${id}">Përshtatshmëria</label>
      <div class="population-decision-row">
        <select id="${id}" aria-label="Përshtatshmëria për ${population === 'adult' ? 'të rritur' : 'fëmijë'}">
          <option value="auto">Automatik nga doza</option>
          <option value="not_recommended">Nuk rekomandohet</option>
          <option value="contraindicated">Kundërindikuar</option>
        </select>
        <button type="button" data-save-population-decision="${population}">Ruaj statusin</button>
      </div>
      <p>“Po” jepet vetëm nga dozë + rrugë + burim HTTPS. “Jo” kërkon burim dhe arsyetim te vërejtjet.</p>
    </div>`;
  }

  function updateEditorControls(item) {
    if (!item) return;
    decisionCache.set(Number(item.registryNumber), item);
    ['adult', 'pediatric'].forEach(population => {
      const decision = item[population] || {};
      const select = document.getElementById(`populationDecision-${population}`);
      if (!select) return;
      select.value = ['not_recommended', 'contraindicated'].includes(decision.code) ? decision.code : 'auto';
      const control = select.closest('.population-decision-control');
      control?.setAttribute('data-current-state', decision.state || 'unknown');
    });
    enhanceRows();
  }

  async function loadEditorDecision({ force = true } = {}) {
    const number = editorNumber();
    const dialog = document.querySelector('.clinical-editor-dialog');
    if (!number || !dialog?.open) return;
    if (!force && decisionCache.has(number)) {
      updateEditorControls(decisionCache.get(number));
      return;
    }
    try {
      const payload = await api(`${ENDPOINT}?registryNumber=${encodeURIComponent(number)}`);
      updateEditorControls(payload.items?.[0]);
    } catch (error) {
      editorMessage(error.message, true);
    }
  }

  async function savePopulationDecision(population, button) {
    const number = editorNumber();
    const form = document.getElementById('clinicalEditorForm');
    const select = document.getElementById(`populationDecision-${population}`);
    if (!number || !form || !select) return;
    const prefix = populationPrefix(population);
    const decision = select.value;
    const sourceUrl = clean(form.elements.namedItem(`${prefix}SourceUrl`)?.value);
    const evidence = clean(form.elements.namedItem(`${prefix}Notes`)?.value);
    if (decision !== 'auto' && (!/^https:\/\//i.test(sourceUrl) || evidence.length < 12)) {
      editorMessage('Për “Nuk rekomandohet” ose “Kundërindikuar” plotëso burimin HTTPS dhe arsyetimin te vërejtjet.', true);
      return;
    }

    button.disabled = true;
    editorMessage('Po ruhet vendimi strikt…');
    try {
      const payload = await api(ENDPOINT, {
        method:'PUT',
        body:JSON.stringify({ registryNumber:number, population, decision, sourceUrl, evidence }),
      });
      updateEditorControls(payload.item);
      editorMessage('Statusi i popullatës u ruajt me audit dhe burim.');
    } catch (error) {
      editorMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  function ensureEditorControls() {
    const dialog = document.querySelector('.clinical-editor-dialog');
    const form = document.getElementById('clinicalEditorForm');
    if (!dialog || !form) return;
    const fieldsets = [...dialog.querySelectorAll('.clinical-editor-dose-grid fieldset')];
    fieldsets.forEach((fieldset, index) => {
      const population = /fëmij/i.test(clean(fieldset.querySelector('legend')?.textContent)) || index === 1 ? 'pediatric' : 'adult';
      if (!fieldset.querySelector(`[data-population-decision-control="${population}"]`)) {
        fieldset.insertAdjacentHTML('beforeend', decisionControlMarkup(population));
      }
    });
    dialog.querySelectorAll('[data-save-population-decision]').forEach(button => {
      if (button.dataset.boundPopulationDecision === 'true') return;
      button.dataset.boundPopulationDecision = 'true';
      button.addEventListener('click', () => void savePopulationDecision(button.dataset.savePopulationDecision, button));
    });

    if (!dialogObserver) {
      dialogObserver = new MutationObserver(() => {
        if (dialog.open) setTimeout(() => void loadEditorDecision({ force:true }), 80);
      });
      dialogObserver.observe(dialog, { attributes:true, attributeFilter:['open'], subtree:false });
      const title = dialog.querySelector('#clinicalEditorTitle');
      if (title) dialogObserver.observe(title, { childList:true, characterData:true, subtree:true });
    }
  }

  document.addEventListener('click', event => {
    const editButton = event.target.closest?.('.clinical-editor-open');
    if (editButton) {
      const number = Number(editButton.dataset.registryNumber || editButton.closest('tr')?.dataset.registryNumber);
      if (Number.isInteger(number)) editorRegistryNumber = number;
      setTimeout(() => void loadEditorDecision({ force:true }), 120);
    }
    const saveNext = event.target.closest?.('[data-save-next]');
    if (saveNext) setTimeout(() => schedule({ force:true }), 1400);
  }, true);

  document.addEventListener('submit', event => {
    if (event.target?.id === 'clinicalEditorForm') {
      setTimeout(() => schedule({ force:true }), 1400);
      setTimeout(() => schedule({ force:true }), 3000);
    }
  }, true);

  function start() {
    connectTableObserver();
    ensureEditorControls();
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
  window.addEventListener('medindex:registry-ready', () => schedule());
  window.addEventListener('medindex:registry-table-stable', () => schedule());
  window.addEventListener('medindex:registry-dosage-ready', () => schedule());
  window.addEventListener('resize', () => schedule());

  window.MedIndexPopulationVerification = Object.freeze({
    version:VERSION,
    refresh:() => schedule({ force:true }),
    metrics:() => Object.freeze({
      requests:requestCount,
      failures:requestFailures,
      cached:decisionCache.size,
      retrying:retryState.size,
      backoffMs:Math.max(0, endpointBackoffUntil - Date.now()),
    }),
  });
})();
