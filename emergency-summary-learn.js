(() => {
  'use strict';

  const MODE_KEY = 'medindex_emergency_learning_mode_v1';
  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const TOKEN_LABELS = new Map([
    ['critical', 'Kritike'],
    ['very-urgent', 'Shumë urgjente'],
    ['urgent', 'Urgjente'],
    ['immediate', 'Menjëherë'],
    ['minutes', 'Brenda minutave'],
    ['after-stabilization', 'Pas stabilizimit'],
    ['primary', 'Kujdes parësor'],
    ['secondary', 'Kujdes sekondar'],
    ['draft', 'Draft'],
    ['review', 'Për verifikim'],
    ['verified', 'Verifikuar'],
    ['archived', 'Arkivuar'],
  ]);

  const normalize = value => String(value || '')
    .trim()
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const human = value => TOKEN_LABELS.get(normalize(value)) || String(value || '');

  function readMode() {
    try {
      const value = sessionStorage.getItem(MODE_KEY);
      return value === 'learn' ? 'learn' : 'summary';
    } catch {
      return 'summary';
    }
  }

  function writeMode(value) {
    try { sessionStorage.setItem(MODE_KEY, value); } catch {}
  }

  function captureSanityItems() {
    const client = window.MedIndexSanity;
    if (!client || typeof client.query !== 'function' || client.__summaryLearnWrapped) return;
    const original = client.query.bind(client);
    const wrappedQuery = async (...args) => {
      const result = await original(...args);
      if (Array.isArray(result) && result.some(item => Array.isArray(item?.primaryCareSteps))) {
        window.__medIndexEmergencyItems = result;
      }
      return result;
    };
    window.MedIndexSanity = Object.freeze({
      ...client,
      query: wrappedQuery,
      __summaryLearnWrapped: true,
    });
  }

  function currentItem(detail) {
    const items = Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
    const activeId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id;
    if (activeId) {
      const byId = items.find(item => String(item?._id || '') === String(activeId));
      if (byId) return byId;
    }
    const title = detail.querySelector('.ck-detail-head h2')?.textContent?.trim();
    if (!title) return null;
    return items.find(item => item?.title === title) || null;
  }

  function sourceCount(item) {
    const sources = [
      ...(Array.isArray(item?.sources) ? item.sources : []),
      ...(Array.isArray(item?.clinicalSources) ? item.clinicalSources : []),
      ...(Array.isArray(item?.references) ? item.references : []),
    ];
    const seen = new Set();
    return sources.filter(source => {
      const key = `${String(source?.url || '').trim()}|${String(source?.title || source?.label || '').trim()}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }

  function medicationStep(item) {
    const steps = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const medicationPattern = /(adrenalin|epinefr|nalokson|glukoz|aspirin|nitroglic|salbutamol|ipratrop|midazolam|diazepam|lorazepam|atropin|amiodaron|adenozin|magnesium|furosemid|hidrokortizon|dexametazon)/i;
    return steps.find(step => medicationPattern.test(`${step?.title || ''} ${step?.action || ''}`)) || null;
  }

  function firstActionStep(item) {
    const steps = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    return medicationStep(item)
      || steps.find(step => normalize(step?.priority) === 'immediate')
      || steps[0]
      || null;
  }

  function timing(step) {
    const priority = human(step?.priority);
    return priority || '';
  }

  function quickStepMarkup(step, index) {
    return `<article class="ck-sl-step${normalize(step?.priority) === 'immediate' ? ' is-immediate' : ''}">
      <span class="ck-sl-step-number" aria-hidden="true">${index + 1}</span>
      <div>
        <div class="ck-sl-step-head">
          <strong>${esc(step?.title || `Hapi ${index + 1}`)}</strong>
          ${timing(step) ? `<span>${esc(timing(step))}</span>` : ''}
        </div>
        <p>${esc(step?.action || '')}</p>
      </div>
    </article>`;
  }

  function quickSummaryMarkup(item) {
    const steps = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const medication = medicationStep(item);
    const firstAction = firstActionStep(item);
    const doNotDo = Array.isArray(item?.doNotDo) ? item.doNotDo : [];
    const referral = item?.referral || {};
    const leadLabel = medication && firstAction === medication ? 'Trajtimi i parë' : 'Veprimi i parë';
    const leadIcon = medication && firstAction === medication ? 'Rx' : '!';

    return `<section class="ck-sl-panel ck-sl-summary" data-ck-sl-panel="summary" aria-label="Përmbledhje praktike">
      ${firstAction ? `<article class="ck-sl-therapy">
        <div class="ck-sl-therapy-icon" aria-hidden="true">${leadIcon}</div>
        <div class="ck-sl-therapy-copy">
          <span>${leadLabel}</span>
          <h3>${esc(firstAction.title || 'Veprimi i menjëhershëm')}</h3>
          <p>${esc(firstAction.action || '')}</p>
        </div>
        ${timing(firstAction) ? `<strong class="ck-sl-now">${esc(timing(firstAction))}</strong>` : ''}
      </article>` : ''}

      <div class="ck-sl-section-heading">
        <div><span>PËRMBLEDHJE PRAKTIKE</span><h3>Çfarë bëj tani?</h3></div>
        <small>${steps.length} hapa</small>
      </div>
      <div class="ck-sl-step-list">${steps.map(quickStepMarkup).join('')}</div>

      ${doNotDo.length ? `<aside class="ck-sl-dont" aria-label="Gabimet që duhen shmangur">
        <div><span aria-hidden="true">!</span><strong>Mos bëj</strong></div>
        <ul>${doNotDo.slice(0, 4).map(text => `<li>${esc(text)}</li>`).join('')}</ul>
      </aside>` : ''}

      ${(referral.when || referral.destination) ? `<div class="ck-sl-transfer" role="note" aria-label="Transferimi ose referimi">
        <div><span>Transferimi / referimi</span><strong>${esc(referral.when || 'Vlerëso nevojën për referim.')}</strong></div>
        ${referral.destination ? `<p>${esc(referral.destination)}</p>` : ''}
      </div>` : ''}
    </section>`;
  }

  function lessonStepMarkup(step, index, kind) {
    return `<article class="ck-sl-lesson-step">
      <div class="ck-sl-lesson-index" aria-hidden="true">${index + 1}</div>
      <div>
        <div class="ck-sl-lesson-title">
          <h4>${esc(step?.title || `${kind} ${index + 1}`)}</h4>
          ${timing(step) ? `<span>${esc(timing(step))}</span>` : ''}
        </div>
        <p class="ck-sl-lesson-action">${esc(step?.action || '')}</p>
        ${step?.why ? `<div class="ck-sl-why"><strong>Pse?</strong><p>${esc(step.why)}</p></div>` : ''}
        ${step?.note ? `<div class="ck-sl-pearl"><strong>Mbaje mend</strong><p>${esc(step.note)}</p></div>` : ''}
      </div>
    </article>`;
  }

  function detailList(title, eyebrow, items, tone = '') {
    if (!Array.isArray(items) || !items.length) return '';
    return `<section class="ck-sl-lesson-block ${tone}">
      <div class="ck-sl-lesson-block-head"><span>${esc(eyebrow)}</span><h3>${esc(title)}</h3></div>
      <ul class="ck-sl-lesson-list">${items.map(text => `<li>${esc(text)}</li>`).join('')}</ul>
    </section>`;
  }

  function referralLesson(item) {
    const referral = item?.referral || {};
    if (!referral.when && !referral.destination && !referral.handover && !referral.beforeTransfer?.length) return '';
    return `<section class="ck-sl-lesson-block">
      <div class="ck-sl-lesson-block-head"><span>TRANSFERIMI</span><h3>Referimi dhe handover</h3></div>
      <div class="ck-sl-referral-grid">
        ${referral.when ? `<div><span>Kur?</span><p>${esc(referral.when)}</p></div>` : ''}
        ${referral.destination ? `<div><span>Ku?</span><p>${esc(referral.destination)}</p></div>` : ''}
        ${referral.urgency ? `<div><span>Urgjenca</span><p>${esc(human(referral.urgency))}</p></div>` : ''}
        ${referral.handover ? `<div class="is-wide"><span>Handover</span><p>${esc(referral.handover)}</p></div>` : ''}
      </div>
      ${Array.isArray(referral.beforeTransfer) && referral.beforeTransfer.length ? `<h4 class="ck-sl-mini-title">Para transferimit</h4><ul class="ck-sl-lesson-list">${referral.beforeTransfer.map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function buildFlashcards(item) {
    const cards = [];
    const primary = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const secondary = Array.isArray(item?.secondaryCareSteps) ? item.secondaryCareSteps : [];
    const redFlags = Array.isArray(item?.redFlags) ? item.redFlags : [];
    const doNotDo = Array.isArray(item?.doNotDo) ? item.doNotDo : [];
    const medication = medicationStep(item);
    const firstAction = firstActionStep(item);

    if (firstAction) cards.push({
      q: medication && firstAction === medication
        ? `Cili është trajtimi i parë te “${item.title}”?`
        : `Cili është veprimi i parë te “${item.title}”?`,
      a: firstAction.action,
      tag: medication && firstAction === medication ? 'Trajtimi' : 'Veprimi i parë',
    });

    primary.forEach((step, index) => {
      if (step === firstAction) return;
      cards.push({
        q: `Çfarë bëhet te hapi ${index + 1}: ${step.title || 'veprimi klinik'}?`,
        a: step.action,
        tag: 'Veprimi',
      });
      if (step.why && cards.length < 9) cards.push({
        q: `Pse ka rëndësi “${step.title || `hapi ${index + 1}`}”?`,
        a: step.why,
        tag: 'Arsyetimi',
      });
    });

    if (redFlags.length) cards.push({
      q: 'Cilat janë shenjat alarmuese kryesore?',
      a: redFlags.slice(0, 5).join(' • '),
      tag: 'Red flags',
    });

    secondary.slice(0, 3).forEach(step => cards.push({
      q: `Si menaxhohet më tej: ${step.title || 'kujdesi sekondar'}?`,
      a: [step.action, step.note].filter(Boolean).join(' '),
      tag: 'Thellim',
    }));

    if (doNotDo.length) cards.push({
      q: 'Cilat gabime duhet të shmangen?',
      a: doNotDo.slice(0, 4).join(' • '),
      tag: 'Mos bëj',
    });

    if (item?.referral?.handover) cards.push({
      q: 'Çfarë duhet të përmbajë handover-i?',
      a: item.referral.handover,
      tag: 'Handover',
    });

    return cards.slice(0, 12);
  }

  function flashState(itemId, count) {
    const fallback = {index: 0, revealed: false, known: []};
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${FLASH_KEY}${itemId}`) || 'null');
      if (!stored || !Number.isInteger(stored.index)) return fallback;
      return {
        index: Math.min(Math.max(stored.index, 0), Math.max(count - 1, 0)),
        revealed: Boolean(stored.revealed),
        known: Array.isArray(stored.known)
          ? [...new Set(stored.known.filter(value => Number.isInteger(value) && value >= 0 && value < count))]
          : [],
      };
    } catch {
      return fallback;
    }
  }

  function saveFlashState(itemId, state) {
    try { sessionStorage.setItem(`${FLASH_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function flashAnswerId(itemId, index) {
    const safe = String(itemId || 'item').replace(/[^a-zA-Z0-9_-]/g, '-');
    return `ck-flash-answer-${safe}-${index}`;
  }

  function flashMarkup(item, cards) {
    if (!cards.length) return '';
    const state = flashState(item._id, cards.length);
    const card = cards[state.index];
    const known = new Set(state.known);
    const answerId = flashAnswerId(item._id, state.index);
    const progress = Math.round(((state.index + 1) / cards.length) * 100);
    return `<section class="ck-sl-flashcards" data-ck-sl-flashcards data-item-id="${esc(item._id)}" aria-label="Flashcards për këtë mësim">
      <div class="ck-sl-flash-head">
        <div><span>FLASHCARDS</span><h3>Mbaje mend aktivisht</h3><p>Pyetje të krijuara vetëm nga ky mësim.</p></div>
        <strong aria-label="Karta ${state.index + 1} nga ${cards.length}">${state.index + 1} / ${cards.length}</strong>
      </div>
      <div class="ck-sl-flash-progress" role="progressbar" aria-label="Progresi i flashcards" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <article class="ck-sl-flashcard ${state.revealed ? 'is-revealed' : ''}" data-flash-card>
        <span>${esc(card.tag || 'Pyetje')}</span>
        <h4>${esc(card.q)}</h4>
        <div class="ck-sl-flash-answer" id="${esc(answerId)}" role="region" aria-live="polite" ${state.revealed ? '' : 'hidden'}>
          <small>Përgjigjja</small>
          <p>${esc(card.a)}</p>
        </div>
        <button type="button" data-flash-reveal aria-expanded="${state.revealed ? 'true' : 'false'}" aria-controls="${esc(answerId)}">${state.revealed ? 'Fshih përgjigjen' : 'Shfaq përgjigjen'}</button>
      </article>
      <div class="ck-sl-flash-controls ${state.revealed ? 'is-revealed' : 'is-hidden-answer'}">
        <button type="button" data-flash-prev ${state.index === 0 ? 'disabled' : ''} aria-label="Flashcard paraprak">← Para</button>
        ${state.revealed ? `<div class="ck-sl-recall" aria-label="Vlerëso rikujtimin">
          <button type="button" data-flash-repeat>Përsërite</button>
          <button type="button" data-flash-known class="is-known">${known.has(state.index) ? 'E dija ✓' : 'E dija'}</button>
        </div>` : '<span aria-hidden="true"></span>'}
        <button type="button" data-flash-next ${state.index === cards.length - 1 ? 'disabled' : ''} aria-label="Flashcard tjetër">Tjetra →</button>
      </div>
    </section>`;
  }

  function learnMarkup(item) {
    const primary = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const secondary = Array.isArray(item?.secondaryCareSteps) ? item.secondaryCareSteps : [];
    const cards = buildFlashcards(item);

    return `<section class="ck-sl-panel ck-sl-learn" data-ck-sl-panel="learn" aria-label="Mësimi i plotë">
      <div class="ck-sl-learn-intro">
        <span>MËSIMI I PLOTË</span>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.summary || '')}</p>
      </div>

      <section class="ck-sl-lesson-block">
        <div class="ck-sl-lesson-block-head"><span>01 · VEPRIMI</span><h3>Rendi klinik dhe arsyetimi</h3></div>
        <div class="ck-sl-lesson-steps">${primary.map((step, index) => lessonStepMarkup(step, index, 'Hapi')).join('')}</div>
      </section>

      ${detailList('Shenjat alarmuese', '02 · RED FLAGS', item.redFlags, 'is-danger')}
      ${secondary.length ? `<section class="ck-sl-lesson-block">
        <div class="ck-sl-lesson-block-head"><span>03 · THELLIMI</span><h3>Menaxhimi i avancuar / kujdesi sekondar</h3></div>
        <div class="ck-sl-lesson-steps">${secondary.map((step, index) => lessonStepMarkup(step, index, 'Hapi i avancuar')).join('')}</div>
      </section>` : ''}
      ${detailList('Gabimet që duhen shmangur', '04 · SIGURIA', item.doNotDo, 'is-danger')}
      ${referralLesson(item)}
      ${flashMarkup(item, cards)}
    </section>`;
  }

  function bindFlashcards(root, item) {
    const cards = buildFlashcards(item);
    if (!cards.length) return;
    const flash = root.querySelector('[data-ck-sl-flashcards]');
    if (!flash) return;

    const rerender = (next, focusSelector) => {
      saveFlashState(item._id, next);
      const wrapper = root.querySelector('[data-ck-sl-panel="learn"]');
      if (!wrapper) return;
      wrapper.outerHTML = learnMarkup(item);
      bindFlashcards(root, item);
      if (focusSelector) requestAnimationFrame(() => root.querySelector(focusSelector)?.focus({preventScroll:true}));
    };

    const state = flashState(item._id, cards.length);
    flash.querySelector('[data-flash-reveal]')?.addEventListener('click', () => rerender(
      {...state, revealed: !state.revealed},
      '[data-flash-reveal]',
    ));
    flash.querySelector('[data-flash-prev]')?.addEventListener('click', () => rerender(
      {...state, index: Math.max(0, state.index - 1), revealed: false},
      '[data-flash-reveal]',
    ));
    flash.querySelector('[data-flash-next]')?.addEventListener('click', () => rerender(
      {...state, index: Math.min(cards.length - 1, state.index + 1), revealed: false},
      '[data-flash-reveal]',
    ));
    flash.querySelector('[data-flash-repeat]')?.addEventListener('click', () => rerender(
      {...state, revealed: false},
      '[data-flash-reveal]',
    ));
    flash.querySelector('[data-flash-known]')?.addEventListener('click', () => {
      const known = new Set(state.known);
      known.add(state.index);
      rerender(
        {...state, known: [...known], index: Math.min(cards.length - 1, state.index + 1), revealed: false},
        '[data-flash-reveal]',
      );
    });
  }

  function applyMode(detail, mode) {
    const value = mode === 'learn' ? 'learn' : 'summary';
    writeMode(value);
    detail.dataset.ckLearningMode = value;
    detail.querySelectorAll('[data-ck-mode]').forEach(button => {
      const buttonMode = button.dataset.ckMode;
      if (buttonMode === 'simulation') {
        button.remove();
        return;
      }
      button.setAttribute('aria-pressed', buttonMode === value ? 'true' : 'false');
    });
    const caption = detail.querySelector('.ck-mode-caption');
    if (caption) caption.textContent = value === 'summary'
      ? 'Çfarë bëj dhe çfarë i jap pacientit'
      : 'Mësimi i plotë + flashcards';
  }

  function bindModeButtons(detail) {
    detail.querySelectorAll('[data-ck-mode="summary"],[data-ck-mode="learn"]').forEach(button => {
      if (button.dataset.ckSlBound === '1') return;
      button.dataset.ckSlBound = '1';
      button.addEventListener('click', () => {
        const mode = button.dataset.ckMode === 'learn' ? 'learn' : 'summary';
        requestAnimationFrame(() => {
          const current = document.getElementById('emergencyDetail');
          if (current?.querySelector('.ck-detail-head')) enhance(current, mode);
        });
      });
    });
  }

  function enhance(detail, forcedMode) {
    const head = detail.querySelector('.ck-detail-head');
    const originalSections = detail.querySelector('.ck-sections');
    if (!head || !originalSections) return;
    const item = currentItem(detail);
    if (!item) return;

    const mode = forcedMode || readMode();
    detail.querySelector('.ck-sl-experience')?.remove();
    originalSections.hidden = true;
    detail.querySelector('[data-ck-sim-progress]')?.remove();

    const modeWrap = detail.querySelector('.ck-mode-wrap');
    if (modeWrap) {
      modeWrap.querySelector('[data-ck-mode="summary"]')?.replaceChildren(document.createTextNode('Përmbledhje'));
      modeWrap.querySelector('[data-ck-mode="learn"]')?.replaceChildren(document.createTextNode('Mëso'));
    }

    const experience = document.createElement('div');
    experience.className = 'ck-sl-experience';
    experience.innerHTML = `${quickSummaryMarkup(item)}${learnMarkup(item)}`;
    originalSections.insertAdjacentElement('beforebegin', experience);

    applyMode(detail, mode);
    bindModeButtons(detail);
    bindFlashcards(experience, item);

    const count = sourceCount(item);
    const sourceLabel = `${count} ${count === 1 ? 'burim klinik' : 'burime klinike'}`;
    detail.querySelector('.ck-review-button')?.setAttribute('title', `${sourceLabel} · ${human(item.reviewStatus || '') || 'Status klinik'}`);
  }

  function observe() {
    const detail = document.getElementById('emergencyDetail');
    if (!detail) return;
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        enhance(detail);
      });
    };
    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
        node.nodeType === 1 && (node.matches?.('.ck-detail-head,.ck-sections') || node.querySelector?.('.ck-detail-head,.ck-sections'))
      ))) schedule();
    });
    observer.observe(detail, {childList: true, subtree: false});
    schedule();
  }

  captureSanityItems();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, {once: true});
  else observe();
})();
