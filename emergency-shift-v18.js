(() => {
  'use strict';

  const page = document.querySelector('[data-mi-page="urgjencat"] .clinical-knowledge-page');
  const list = document.getElementById('emergencyList');
  const detail = document.getElementById('emergencyDetail');
  const search = document.getElementById('emergencySearch');
  const engine = window.MedIndexEmergencyShiftV18;
  if (!page || !list || !detail || !search || !engine?.buildSession) return;

  const SCHEDULE_PREFIX = 'medindex_emergency_flashcards_v4schedule:';
  const SESSION_KEY = 'medindex_emergency_shift_v18';
  const MAX_QUESTIONS = 10;
  let dialog = null;
  let frame = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function readJson(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function schedulePriority(item) {
    const schedule = readJson(localStorage, `${SCHEDULE_PREFIX}${String(item?._id || '')}`, {});
    const entries = Object.values(schedule).filter(entry => entry && typeof entry === 'object');
    const now = Date.now();
    const unseen = entries.length === 0;
    const due = unseen || entries.some(entry => !Number(entry?.dueAt || 0) || Number(entry.dueAt) <= now);
    const weak = entries.some(entry => ['again', 'hard'].includes(String(entry?.rating || '')));
    let score = item?.triageLevel === 'critical' ? 500 : 300;
    if (unseen) score += 220;
    if (due) score += 180;
    if (weak) score += 240;
    return score;
  }

  function sessionData() {
    const currentItems = items();
    const priorityById = Object.fromEntries(currentItems.map(item => [String(item?._id || ''), schedulePriority(item)]));
    return engine.buildSession(currentItems, {limit:MAX_QUESTIONS, priorityById});
  }

  function ensureButton() {
    const actions = page.querySelector('#emergencyReadiness .ck-v6-readiness-actions');
    if (!actions || actions.querySelector('[data-ck-v18-start]')) return;
    const session = sessionData();
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ckV18Start = '1';
    button.className = 'ck-v18-start';
    button.textContent = 'Ready for Shift';
    button.disabled = !session.questions.length;
    button.title = session.questions.length
      ? `${session.questions.length} pyetje nga ${session.eligibleCount} protokolle kritike me review aktual`
      : 'Nuk ka protokolle kritike që kalojnë kushtet e review-t aktual.';
    button.addEventListener('click', startSession);
    actions.prepend(button);
  }

  function ensureDialog() {
    if (dialog?.isConnected) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'ck-v18-dialog';
    dialog.dataset.ckV18Dialog = '1';
    dialog.setAttribute('aria-labelledby', 'ckV18Title');
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeDialog();
      if (event.target.closest('[data-ck-v18-close]')) closeDialog();
      if (event.target.closest('[data-ck-v18-reveal]')) revealCurrent();
      const rate = event.target.closest('[data-ck-v18-rate]');
      if (rate) rateCurrent(rate.dataset.ckV18Rate || '');
      if (event.target.closest('[data-ck-v18-open]')) openCurrentProtocol();
      if (event.target.closest('[data-ck-v18-restart]')) startSession(true);
    });
    return dialog;
  }

  function readState(session) {
    const stored = readJson(sessionStorage, SESSION_KEY, {});
    const ids = session.questions.map(question => question.id);
    if (!Array.isArray(stored.questionIds) || stored.questionIds.join('|') !== ids.join('|')) {
      return {questionIds:ids,index:0,revealed:false,results:{},startedAt:Date.now()};
    }
    return {
      questionIds:ids,
      index:Math.min(Math.max(Number(stored.index || 0), 0), ids.length),
      revealed:Boolean(stored.revealed),
      results:stored.results && typeof stored.results === 'object' ? stored.results : {},
      startedAt:Number(stored.startedAt || Date.now()),
    };
  }

  function writeState(state) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch {}
  }

  function currentSessionAndState() {
    const session = sessionData();
    return {session,state:readState(session)};
  }

  function kindLabel(kind) {
    return ({
      firstAction:'Veprimi fillestar',
      redFlag:'Red flag',
      doNotDo:'Mos bëj',
      referralWhen:'Referimi',
      referralDestination:'Destinacioni',
    })[kind] || 'Pyetje';
  }

  function renderSession(session, state) {
    const root = ensureDialog();
    if (!session.questions.length) {
      root.innerHTML = `<div class="ck-v18-shell"><button type="button" class="ck-v18-close" data-ck-v18-close aria-label="Mbyll">×</button><h2 id="ckV18Title">Ready for Shift</h2><p>Nuk ka protokolle kritike që kalojnë kushtet e governance: verified, version, burim, reviewer dhe review klinik aktual.</p></div>`;
      return;
    }

    const total = session.questions.length;
    const completed = Math.min(state.index, total);
    if (state.index >= total) {
      const values = Object.values(state.results || {});
      const known = values.filter(value => value === 'known').length;
      const repeat = values.filter(value => value === 'repeat').length;
      root.innerHTML = `<div class="ck-v18-shell ck-v18-complete">
        <button type="button" class="ck-v18-close" data-ck-v18-close aria-label="Mbyll">×</button>
        <span class="ck-v18-kicker">PARA NDËRRIMIT</span><h2 id="ckV18Title">Sesioni u përfundua</h2>
        <div class="ck-v18-score"><strong>${known}/${total}</strong><span>të kujtuara pa hapur përgjigjen përsëri</span></div>
        <p>${repeat} pika u shënuan për përsëritje. Ky është vetëm vetëvlerësim i të nxënit dhe <strong>jo vlerësim i kompetencës klinike</strong>.</p>
        <button type="button" class="ck-v18-primary" data-ck-v18-restart>Rifillo sesionin</button>
      </div>`;
      return;
    }

    const question = session.questions[state.index];
    const progress = total ? Math.round((completed / total) * 100) : 0;
    root.innerHTML = `<div class="ck-v18-shell">
      <button type="button" class="ck-v18-close" data-ck-v18-close aria-label="Mbyll">×</button>
      <div class="ck-v18-head"><div><span class="ck-v18-kicker">READY FOR SHIFT</span><h2 id="ckV18Title">Review kritik i shpejtë</h2></div><strong>${state.index + 1}/${total}</strong></div>
      <div class="ck-v18-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <div class="ck-v18-meta"><span>${esc(question.protocolTitle)}</span><span>${esc(question.triageLevel)}</span><span>v${esc(question.version)}</span><span>${question.sourceCount} burime</span></div>
      <article class="ck-v18-card">
        <span>${esc(kindLabel(question.kind))}</span>
        <h3>${esc(question.prompt)}</h3>
        ${state.revealed ? `<div class="ck-v18-answer"><small>TEKST NGA PROTOKOLLI I VERIFIKUAR</small><strong>${esc(question.answer)}</strong></div>` : '<p class="ck-v18-recall">Përgjigju me mend para se ta zbulosh tekstin e protokollit.</p>'}
      </article>
      <div class="ck-v18-actions">
        ${state.revealed
          ? '<button type="button" data-ck-v18-rate="repeat">Përsërite</button><button type="button" class="ck-v18-primary" data-ck-v18-rate="known">E dija</button>'
          : '<button type="button" class="ck-v18-primary" data-ck-v18-reveal>Shfaq përgjigjen</button>'}
        <button type="button" class="ck-v18-secondary" data-ck-v18-open>Hape protokollin</button>
      </div>
      <p class="ck-v18-safety">Vetëm protokolle kritike/very-urgent me review klinik aktual. Përgjigjja merret fjalë për fjalë nga të dhënat e verifikuara; sesioni nuk gjeneron trajtim me AI.</p>
    </div>`;
  }

  function showDialog() {
    const root = ensureDialog();
    if (typeof root.showModal === 'function') {
      if (!root.open) root.showModal();
    } else {
      root.setAttribute('open', '');
    }
  }

  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function startSession(reset = false) {
    const session = sessionData();
    if (reset) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    }
    const state = readState(session);
    writeState(state);
    renderSession(session, state);
    showDialog();
  }

  function revealCurrent() {
    const {session,state} = currentSessionAndState();
    if (state.index >= session.questions.length) return;
    state.revealed = true;
    writeState(state);
    renderSession(session, state);
  }

  function rateCurrent(rating) {
    if (!['known','repeat'].includes(rating)) return;
    const {session,state} = currentSessionAndState();
    const question = session.questions[state.index];
    if (!question || !state.revealed) return;
    state.results[question.id] = rating;
    state.index += 1;
    state.revealed = false;
    writeState(state);
    renderSession(session, state);
  }

  function clearNavigationFilters() {
    if (search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', {bubbles:true}));
    }
    const reset = document.getElementById('emergencyChapterReset');
    if (reset && (document.getElementById('emergencyChapterSelect')?.value || document.getElementById('emergencySubchapterSelect')?.value)) reset.click();
    const triageAll = document.querySelector('.ck-triage-filter [data-ck-triage="all"]');
    if (triageAll && triageAll.getAttribute('aria-pressed') !== 'true') triageAll.click();
  }

  function fallbackOpenProtocol(question) {
    clearNavigationFilters();
    search.value = question.protocolTitle;
    search.dispatchEvent(new Event('input', {bubbles:true}));
    const attempt = count => {
      const button = [...list.querySelectorAll('.ck-list-button[data-id]')].find(node => node.dataset.id === question.protocolId);
      if (button) {
        button.click();
        window.setTimeout(() => detail.scrollIntoView({behavior:'smooth',block:'start'}), 60);
        return;
      }
      if (count < 8) window.setTimeout(() => attempt(count + 1), 60);
    };
    attempt(0);
  }

  function openCurrentProtocol() {
    const {session,state} = currentSessionAndState();
    const question = session.questions[Math.min(state.index, Math.max(session.questions.length - 1, 0))];
    if (!question) return;
    closeDialog();
    const actionEngine = window.MedIndexEmergencyActionSearchV12;
    if (actionEngine?.buildEntries) {
      const kindMap = {firstAction:'primary',redFlag:'redFlag',doNotDo:'doNotDo',referralWhen:'referral',referralDestination:'referral'};
      const entry = actionEngine.buildEntries(items()).find(row =>
        row.itemId === question.protocolId
        && row.kind === kindMap[question.kind]
        && String(row.text || '').trim() === question.answer
      );
      if (entry) {
        window.dispatchEvent(new CustomEvent('medindex:emergency-action-open', {detail:{actionId:entry.id,source:'ready-for-shift-v18'}}));
        return;
      }
    }
    fallbackOpenProtocol(question);
  }

  function hydrate() {
    ensureButton();
    if (dialog?.open) {
      const {session,state} = currentSessionAndState();
      renderSession(session, state);
    }
  }

  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(hydrate);
  });
  observer.observe(page, {childList:true,subtree:true});
  window.addEventListener('medindex:flashcard-rated', hydrate);
  window.addEventListener('storage', event => {
    if (String(event.key || '').startsWith(SCHEDULE_PREFIX)) hydrate();
  });

  hydrate();
  window.setTimeout(hydrate, 250);
  window.setTimeout(hydrate, 900);
})();
