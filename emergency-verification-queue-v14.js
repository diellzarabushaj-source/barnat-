(() => {
  'use strict';

  const reviewMode = (() => {
    try { return new URL(window.location.href).searchParams.get('review') === '1'; } catch { return false; }
  })();
  if (!reviewMode) return;

  const searchPanel = document.querySelector('[data-mi-page="urgjencat"] .ck-rapid-search-panel');
  const search = document.getElementById('emergencySearch');
  const list = document.getElementById('emergencyList');
  const detail = document.getElementById('emergencyDetail');
  const engine = window.MedIndexEmergencyVerificationQueueV14;
  if (!searchPanel || !search || !list || !detail || !engine?.queue || !engine?.summary) return;

  const STORAGE_PREFIX = 'medindex_emergency_verification_v14:';
  let panel = null;
  let selectedId = '';
  let frame = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function rows() {
    return engine.queue(items());
  }

  function stateKey(row) {
    return `${STORAGE_PREFIX}${row.reviewKey}`;
  }

  function readState(row) {
    try {
      const value = JSON.parse(localStorage.getItem(stateKey(row)) || 'null');
      return value && typeof value === 'object' ? value : {checks:{}, completedAt:0};
    } catch {
      return {checks:{}, completedAt:0};
    }
  }

  function writeState(row, value) {
    try { localStorage.setItem(stateKey(row), JSON.stringify(value)); } catch {}
  }

  function completed(row, state = readState(row)) {
    return row.checklist.length > 0 && row.checklist.every(check => state?.checks?.[check.id] === true);
  }

  function progress(row, state = readState(row)) {
    const done = row.checklist.filter(check => state?.checks?.[check.id] === true).length;
    return {done, total:row.checklist.length};
  }

  function selectedRow(queue) {
    return queue.find(row => row.id === selectedId) || queue.find(row => !completed(row)) || queue[0] || null;
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;
    panel = document.createElement('details');
    panel.className = 'ck-v14-review';
    panel.dataset.ckV14Review = '1';
    panel.open = true;
    searchPanel.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function issueLabel(issue) {
    return ({
      'missing-version':'pa version',
      'missing-source':'pa burim',
      'missing-primary-actions':'pa hapa primarë',
      'missing-red-flags':'pa red flags',
      'missing-do-not-do':'pa “Mos bëj”',
      'missing-referral':'pa referim',
    })[issue] || issue;
  }

  function queueMarkup(queue, active) {
    return queue.map((row, index) => {
      const state = readState(row);
      const p = progress(row, state);
      const done = completed(row, state);
      return `<button type="button" class="ck-v14-queue-row${row.id === active?.id ? ' is-active' : ''}" data-ck-v14-select="${esc(row.id)}">
        <span><b>${index + 1}. ${esc(row.title)}</b><small>${esc(row.triageLevel)} · v${esc(row.version || '—')} · ${row.sourceCount} burime</small></span>
        <em class="${done ? 'is-done' : ''}">${done ? 'Checklistë ✓' : `${p.done}/${p.total}`}</em>
      </button>`;
    }).join('');
  }

  function checklistMarkup(row) {
    const state = readState(row);
    const isDone = completed(row, state);
    const issues = row.structuralIssues || [];
    const studioUrl = engine.studioIntent(window.MedIndexSanity?.studioUrl || '', row.item);
    return `<section class="ck-v14-review-card" data-ck-v14-card="${esc(row.id)}">
      <div class="ck-v14-card-head">
        <div><span>PROTOKOLLI NË RISHIKIM</span><h3>${esc(row.title)}</h3></div>
        <span class="ck-v14-status ${row.structurallyReady ? 'is-ready' : 'is-blocked'}">${row.structurallyReady ? 'Struktura e plotë' : 'Ka boshllëqe'}</span>
      </div>
      <div class="ck-v14-meta">
        <span>v${esc(row.version || '—')}</span><span>${row.sourceCount} burime</span><span>${esc(row.triageLevel)}</span><span>Status: ${esc(row.reviewStatus || '—')}</span>
      </div>
      ${issues.length ? `<p class="ck-v14-warning">Bllokues strukturorë: ${esc(issues.map(issueLabel).join(' · '))}</p>` : ''}
      <div class="ck-v14-checks">
        ${row.checklist.map(check => `<label><input type="checkbox" data-ck-v14-check="${esc(check.id)}" ${state?.checks?.[check.id] ? 'checked' : ''}><span>${esc(check.label)}</span></label>`).join('')}
      </div>
      <p class="ck-v14-note">Kjo checklistë ruhet vetëm në këtë browser. Plotësimi i saj <strong>nuk</strong> e ndryshon statusin klinik në “verified”.</p>
      <div class="ck-v14-actions">
        <button type="button" data-ck-v14-open>Hape protokollin</button>
        ${studioUrl ? `<a href="${esc(studioUrl)}" target="_blank" rel="noopener">Hape në Sanity për aprovim</a>` : ''}
        <button type="button" class="is-secondary" data-ck-v14-reset>Rivendos checklistën</button>
      </div>
      <div class="ck-v14-ready ${isDone && row.structurallyReady ? 'is-ready' : ''}">
        <strong>${isDone && row.structurallyReady ? 'Gati për vendim klinik' : 'Ende në rishikim'}</strong>
        <span>${isDone && row.structurallyReady ? 'Checklistë lokale e plotë; aprovimi final bëhet vetëm në Sanity.' : 'Kontrollo pikat e kërkuara para aprovimit.'}</span>
      </div>
    </section>`;
  }

  function render() {
    const all = items();
    if (!all.length) return;
    const queue = rows();
    const summary = engine.summary(all);
    const root = ensurePanel();
    if (!queue.length) {
      root.innerHTML = `<summary><span>Verifikimi klinik</span><b>${summary.verified}/${summary.total} verified</b></summary><div class="ck-v14-empty">Nuk ka protokolle në radhë për rishikim.</div>`;
      return;
    }
    const active = selectedRow(queue);
    selectedId = active?.id || '';
    root.innerHTML = `<summary>
        <span>Verifikimi klinik</span>
        <b>${summary.pending} në radhë · ${summary.criticalPending} kritike</b>
      </summary>
      <div class="ck-v14-shell">
        <div class="ck-v14-overview">
          <div><span>NË RADHË</span><strong>${summary.pending}</strong></div>
          <div><span>STRUKTURË E PLOTË</span><strong>${summary.structurallyReady}</strong></div>
          <div><span>BLLOKUARA</span><strong>${summary.blocked}</strong></div>
          <div><span>VERIFIED</span><strong>${summary.verified}</strong></div>
        </div>
        <p class="ck-v14-safety">Prioriteti është kritik → urgjent. Ky panel organizon rishikimin; nuk aprovon automatikisht asnjë protokoll.</p>
        <div class="ck-v14-workspace">
          <nav class="ck-v14-queue" aria-label="Radha e protokolleve për verifikim">${queueMarkup(queue, active)}</nav>
          ${checklistMarkup(active)}
        </div>
      </div>`;
  }

  function scheduleRender() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function openProtocol(row) {
    if (!row?.id) return;
    search.value = row.title;
    search.dispatchEvent(new Event('input', {bubbles:true}));
    const attempt = count => {
      const button = list.querySelector(`.ck-list-button[data-id="${CSS.escape(row.id)}"]`);
      if (!button) {
        if (count < 10) window.setTimeout(() => attempt(count + 1), 60);
        return;
      }
      button.click();
      window.setTimeout(() => detail.scrollIntoView({behavior:'smooth', block:'start'}), 80);
    };
    attempt(0);
  }

  document.addEventListener('click', event => {
    const root = event.target.closest('[data-ck-v14-review]');
    if (!root) return;
    const queue = rows();
    const select = event.target.closest('[data-ck-v14-select]');
    if (select) {
      selectedId = select.dataset.ckV14Select || '';
      render();
      return;
    }
    const row = queue.find(item => item.id === selectedId) || queue[0];
    if (!row) return;
    if (event.target.closest('[data-ck-v14-open]')) {
      openProtocol(row);
      return;
    }
    if (event.target.closest('[data-ck-v14-reset]')) {
      writeState(row, {checks:{}, completedAt:0});
      render();
    }
  });

  document.addEventListener('change', event => {
    const input = event.target.closest('[data-ck-v14-check]');
    if (!input || !event.target.closest('[data-ck-v14-review]')) return;
    const row = rows().find(item => item.id === selectedId);
    if (!row) return;
    const state = readState(row);
    state.checks = {...(state.checks || {}), [input.dataset.ckV14Check]:Boolean(input.checked)};
    state.completedAt = completed(row, state) ? Date.now() : 0;
    writeState(row, state);
    render();
  });

  const observer = new MutationObserver(scheduleRender);
  observer.observe(list, {childList:true});
  render();
  window.setTimeout(render, 300);
  window.setTimeout(render, 1000);
})();
