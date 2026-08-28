(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const MODE_KEY = 'medindex_emergency_learning_v4_mode';
  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const META_KEY = 'medindex_emergency_flashcards_v3meta:';
  const SCHEDULE_KEY = 'medindex_emergency_flashcards_v4schedule:';
  const DAY = 24 * 60 * 60 * 1000;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function activeItem() {
    const items = Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
    const activeId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id || '';
    return items.find(item => String(item?._id || '') === String(activeId)) || null;
  }

  function cardCount(flash) {
    const label = flash?.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = label.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function readFlash(itemId, count) {
    try {
      const value = JSON.parse(sessionStorage.getItem(`${FLASH_KEY}${itemId}`) || 'null');
      if (!value || !Number.isInteger(value.index)) return {index:0, known:[], revealed:false};
      return {
        index: Math.min(Math.max(value.index, 0), Math.max(count - 1, 0)),
        known: Array.isArray(value.known) ? value.known : [],
        revealed: Boolean(value.revealed),
      };
    } catch {
      return {index:0, known:[], revealed:false};
    }
  }

  function readMeta(itemId) {
    try {
      const value = JSON.parse(sessionStorage.getItem(`${META_KEY}${itemId}`) || 'null');
      return value && typeof value === 'object' ? value : {misses:{}};
    } catch {
      return {misses:{}};
    }
  }

  function readSchedule(itemId) {
    try {
      const value = JSON.parse(localStorage.getItem(`${SCHEDULE_KEY}${itemId}`) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function writeSchedule(itemId, value) {
    try { localStorage.setItem(`${SCHEDULE_KEY}${itemId}`, JSON.stringify(value)); } catch {}
  }

  function scheduleRating(itemId, index, rating) {
    const schedule = readSchedule(itemId);
    const previous = schedule[index] || {};
    const oldDays = Math.max(Number(previous.intervalDays || 0), 0);
    const nextDays = rating === 'again' ? 0
      : rating === 'hard' ? Math.max(1, Math.round(oldDays * 1.2) || 1)
      : rating === 'good' ? Math.max(3, Math.round(oldDays * 2.2) || 3)
      : Math.max(7, Math.round(oldDays * 3.2) || 7);
    const dueAt = rating === 'again' ? Date.now() + (10 * 60 * 1000) : Date.now() + (nextDays * DAY);
    schedule[index] = {rating, intervalDays:nextDays, dueAt, reviewedAt:Date.now()};
    writeSchedule(itemId, schedule);
  }

  function dueCount(itemId, count) {
    const schedule = readSchedule(itemId);
    const now = Date.now();
    let due = 0;
    for (let index = 0; index < count; index += 1) {
      const entry = schedule[index];
      if (!entry || Number(entry.dueAt || 0) <= now) due += 1;
    }
    return due;
  }

  function weakCount(itemId, count) {
    const meta = readMeta(itemId);
    let weak = 0;
    for (let index = 0; index < count; index += 1) {
      if (Number(meta?.misses?.[index] || 0) > 0) weak += 1;
    }
    return weak;
  }

  function nextDueLabel(itemId) {
    const values = Object.values(readSchedule(itemId))
      .map(entry => Number(entry?.dueAt || 0))
      .filter(value => value > Date.now())
      .sort((a, b) => a - b);
    if (!values.length) return 'Sot';
    const diff = values[0] - Date.now();
    if (diff < DAY) return 'Brenda 24 orëve';
    const days = Math.max(1, Math.ceil(diff / DAY));
    return `Pas ${days} ${days === 1 ? 'dite' : 'ditësh'}`;
  }

  function readMode() {
    try {
      const value = sessionStorage.getItem(MODE_KEY);
      return ['summary','learn','test'].includes(value) ? value : 'summary';
    } catch {
      return 'summary';
    }
  }

  function writeMode(value) {
    try { sessionStorage.setItem(MODE_KEY, value); } catch {}
  }

  function applyMode(mode) {
    const value = ['summary','learn','test'].includes(mode) ? mode : 'summary';
    writeMode(value);
    detail.dataset.ckLearningMode = value;
    detail.querySelectorAll('.ck-mode-toggle [data-ck-mode]').forEach(button => {
      button.setAttribute('aria-pressed', button.dataset.ckMode === value ? 'true' : 'false');
    });
    const caption = detail.querySelector('.ck-mode-caption');
    if (caption) caption.textContent = value === 'summary'
      ? 'Veprimi i menjëhershëm dhe hapat kryesorë'
      : value === 'learn'
        ? 'Arsyetimi klinik hap pas hapi'
        : 'Rikujtim aktiv dhe përsëritje e mençur';
  }

  function ensureModes() {
    const toggle = detail.querySelector('.ck-mode-toggle');
    if (!toggle) return;
    const summary = toggle.querySelector('[data-ck-mode="summary"]');
    const learn = toggle.querySelector('[data-ck-mode="learn"]');
    if (summary) summary.textContent = 'Përmbledhje';
    if (learn) learn.textContent = 'Mëso hap pas hapi';

    let test = toggle.querySelector('[data-ck-mode="test"]');
    if (!test) {
      test = document.createElement('button');
      test.type = 'button';
      test.dataset.ckMode = 'test';
      test.textContent = 'Testo veten';
      toggle.appendChild(test);
      test.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        applyMode('test');
        requestAnimationFrame(() => detail.querySelector('[data-ck-sl-panel="test"] [data-flash-reveal]')?.focus({preventScroll:true}));
      });
    }

    [summary, learn].filter(Boolean).forEach(button => {
      if (button.dataset.ckV4Bound === '1') return;
      button.dataset.ckV4Bound = '1';
      button.addEventListener('click', () => requestAnimationFrame(() => applyMode(button.dataset.ckMode)));
    });

    toggle.setAttribute('aria-label', 'Mënyra e përdorimit të protokollit');
  }

  function quickCockpit(item) {
    const summary = detail.querySelector('[data-ck-sl-panel="summary"]');
    if (!summary || summary.querySelector('.ck-v4-cockpit')) return;
    const therapy = summary.querySelector('.ck-sl-therapy');
    const actionTitle = therapy?.querySelector('h3')?.textContent?.trim() || '';
    const actionText = therapy?.querySelector('p')?.textContent?.trim() || '';
    const redFlags = Array.isArray(item?.redFlags) ? item.redFlags : [];
    const referral = item?.referral || {};

    const cockpit = document.createElement('section');
    cockpit.className = 'ck-v4-cockpit';
    cockpit.setAttribute('aria-label', 'Pamja e shpejtë klinike');
    cockpit.innerHTML = `
      <article class="is-now">
        <span>TANI</span>
        <strong>${esc(actionTitle || 'Ndiq veprimin e parë të protokollit')}</strong>
        ${actionText ? `<p>${esc(actionText)}</p>` : ''}
      </article>
      <article class="is-alert">
        <span>RED FLAGS</span>
        <strong>${redFlags.length ? `${redFlags.length} për t’u kontrolluar` : 'Pa listë të veçantë'}</strong>
        ${redFlags.length ? `<p>${esc(redFlags.slice(0, 2).join(' · '))}</p>` : '<p>Shiko hapat dhe sigurinë e protokollit.</p>'}
      </article>
      <article class="is-transfer">
        <span>REFERIMI</span>
        <strong>${esc(referral.when || 'Sipas gjendjes klinike')}</strong>
        ${referral.destination ? `<p>${esc(referral.destination)}</p>` : '<p>Detajet e transferimit shfaqen kur janë të dokumentuara.</p>'}
      </article>`;
    (therapy || summary.firstElementChild)?.insertAdjacentElement('afterend', cockpit);
  }

  function ensureTestPanel(item) {
    const experience = detail.querySelector('.ck-sl-experience');
    const learn = experience?.querySelector('[data-ck-sl-panel="learn"]');
    if (!experience || !learn) return;
    let panel = experience.querySelector('[data-ck-sl-panel="test"]');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'ck-sl-panel ck-v4-test';
      panel.dataset.ckSlPanel = 'test';
      panel.setAttribute('aria-label', 'Testo veten');
      experience.appendChild(panel);
    }

    const learnedFlash = learn.querySelector('[data-ck-sl-flashcards]');
    const panelFlash = panel.querySelector('[data-ck-sl-flashcards]');
    const flash = learnedFlash || panelFlash;
    if (!flash) return;
    if (learnedFlash && panelFlash && learnedFlash !== panelFlash) panelFlash.remove();
    if (flash.parentElement !== panel) panel.appendChild(flash);

    const itemId = flash.dataset.itemId || item?._id || '';
    const count = cardCount(flash);
    if (!itemId || !count) return;

    let head = panel.querySelector('.ck-v4-test-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'ck-v4-test-head';
      panel.prepend(head);
    }
    const known = new Set(readFlash(itemId, count).known).size;
    head.innerHTML = `
      <div>
        <span>TESTO VETEN</span>
        <h3>${esc(item?.title || 'Rikujtim aktiv')}</h3>
        <p>Pyetjet dhe përgjigjet vijnë vetëm nga ky protokoll.</p>
      </div>
      <div class="ck-v4-metrics" aria-label="Progresi i përsëritjes">
        <span><strong>${dueCount(itemId, count)}</strong> për sot</span>
        <span><strong>${weakCount(itemId, count)}</strong> të vështira</span>
        <span><strong>${known}/${count}</strong> të ditura</span>
      </div>`;

    const card = flash.querySelector('.ck-sl-flashcard');
    const cardMeta = card?.querySelector('.ck-v4-source-meta') || document.createElement('div');
    if (card && !card.querySelector('.ck-v4-source-meta')) {
      cardMeta.className = 'ck-v4-source-meta';
      card.prepend(cardMeta);
    }
    if (cardMeta) {
      const version = item?.version ? `v${item.version}` : 'version pa shënuar';
      const status = item?.reviewStatus === 'verified' ? 'Verifikuar' : item?.reviewStatus === 'review' ? 'Për verifikim' : (item?.reviewStatus || 'Pa status');
      cardMeta.textContent = `Nga protokolli · ${version} · ${status}`;
    }

    enhanceRatings(flash, itemId, count);
    enhanceReviewLink(flash);
  }

  function enhanceRatings(flash, itemId, count) {
    const state = readFlash(itemId, count);
    const repeat = flash.querySelector('[data-flash-repeat]');
    const known = flash.querySelector('[data-flash-known]');
    if (!repeat || !known || !state.revealed) return;

    repeat.textContent = 'Përsërite';
    known.textContent = 'E di';
    repeat.dataset.ckRating = 'again';
    known.dataset.ckRating = 'good';

    const recall = repeat.closest('.ck-sl-recall');
    if (!recall) return;
    let hard = recall.querySelector('[data-ck-rating="hard"]');
    if (!hard) {
      hard = document.createElement('button');
      hard.type = 'button';
      hard.dataset.ckRating = 'hard';
      hard.textContent = 'Vështirë';
      repeat.insertAdjacentElement('afterend', hard);
      hard.addEventListener('click', event => {
        event.preventDefault();
        scheduleRating(itemId, state.index, 'hard');
        repeat.click();
      });
    }
    let easy = recall.querySelector('[data-ck-rating="easy"]');
    if (!easy) {
      easy = document.createElement('button');
      easy.type = 'button';
      easy.dataset.ckRating = 'easy';
      easy.textContent = 'Shumë e lehtë';
      known.insertAdjacentElement('afterend', easy);
      easy.addEventListener('click', event => {
        event.preventDefault();
        scheduleRating(itemId, state.index, 'easy');
        known.click();
      });
    }

    if (repeat.dataset.ckV4ScheduleBound !== '1') {
      repeat.dataset.ckV4ScheduleBound = '1';
      repeat.addEventListener('click', () => scheduleRating(itemId, state.index, 'again'));
    }
    if (known.dataset.ckV4ScheduleBound !== '1') {
      known.dataset.ckV4ScheduleBound = '1';
      known.addEventListener('click', () => scheduleRating(itemId, state.index, 'good'));
    }

    let hint = flash.querySelector('.ck-v4-next-review');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'ck-v4-next-review';
      recall.insertAdjacentElement('afterend', hint);
    }
    hint.textContent = `Përsëritja e ardhshme: ${nextDueLabel(itemId)}.`;
  }

  function enhanceReviewLink(flash) {
    const feedback = flash.querySelector('.ck-flash-feedback.is-review');
    if (!feedback || feedback.querySelector('[data-ck-v4-open-learn]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ckV4OpenLearn = '1';
    button.textContent = 'Hape pjesën në mësim';
    button.addEventListener('click', () => {
      applyMode('learn');
      requestAnimationFrame(() => {
        const learn = detail.querySelector('[data-ck-sl-panel="learn"]');
        const tag = flash.querySelector('.ck-sl-flashcard>span')?.textContent?.toLowerCase() || '';
        const target = /red flags/.test(tag)
          ? [...learn?.querySelectorAll('.ck-sl-lesson-block') || []].find(node => /red flags|shenjat alarmuese/i.test(node.textContent || ''))
          : /mos bëj/.test(tag)
            ? [...learn?.querySelectorAll('.ck-sl-lesson-block') || []].find(node => /siguria|gabimet/i.test(node.textContent || ''))
            : learn?.querySelector('.ck-sl-lesson-block');
        target?.scrollIntoView({behavior:'smooth', block:'start'});
      });
    });
    feedback.appendChild(button);
  }

  function enhance() {
    const head = detail.querySelector('.ck-detail-head');
    const experience = detail.querySelector('.ck-sl-experience');
    if (!head || !experience) return;
    const item = activeItem();
    if (!item) return;

    ensureModes();
    quickCockpit(item);
    ensureTestPanel(item);
    applyMode(readMode());
  }

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('.ck-detail-head,.ck-sl-experience,[data-ck-sl-flashcards]')
        || node.querySelector?.('.ck-detail-head,.ck-sl-experience,[data-ck-sl-flashcards]')
      )
    ))) schedule();
  });
  observer.observe(detail, {childList:true, subtree:true});

  schedule();
  window.setTimeout(schedule, 180);
})();