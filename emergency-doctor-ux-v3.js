(() => {
  'use strict';

  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const safeId = value => String(value || 'section')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';

  const uniqueIndexes = (values, count) => [...new Set(
    (Array.isArray(values) ? values : []).filter(value => Number.isInteger(value) && value >= 0 && value < count),
  )];

  function currentItem() {
    const items = Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
    const activeId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id;
    return activeId ? items.find(item => String(item?._id || '') === String(activeId)) || null : null;
  }

  function readFlash(itemId, count) {
    const fallback = {index: 0, revealed: false, known: [], hard: [], again: [], feedback: ''};
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${FLASH_KEY}${itemId}`) || 'null');
      if (!stored || !Number.isInteger(stored.index)) return fallback;
      const known = uniqueIndexes(stored.known, count);
      const knownSet = new Set(known);
      const hard = uniqueIndexes(stored.hard, count).filter(value => !knownSet.has(value));
      const hardSet = new Set(hard);
      const again = uniqueIndexes(stored.again, count).filter(value => !knownSet.has(value) && !hardSet.has(value));
      return {
        index: Math.min(Math.max(stored.index, 0), Math.max(count - 1, 0)),
        revealed: Boolean(stored.revealed),
        known,
        hard,
        again,
        feedback: typeof stored.feedback === 'string' ? stored.feedback.slice(0, 120) : '',
      };
    } catch {
      return fallback;
    }
  }

  function saveFlash(itemId, state) {
    try { sessionStorage.setItem(`${FLASH_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function refreshLearn(focusSelector = '[data-flash-reveal]') {
    requestAnimationFrame(() => {
      detail.querySelector('[data-ck-mode="learn"]')?.click();
      requestAnimationFrame(() => requestAnimationFrame(() => detail.querySelector(focusSelector)?.focus({preventScroll: true})));
    });
  }

  function flashCount(flash) {
    const text = flash.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = text.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function orderedCandidates(current, count, state) {
    const known = new Set(state.known);
    const again = new Set(state.again);
    const hard = new Set(state.hard);
    const unresolved = Array.from({length: count}, (_, index) => index).filter(index => !known.has(index));
    const rotate = values => values
      .filter(index => index !== current)
      .sort((a, b) => ((a - current + count) % count) - ((b - current + count) % count));
    const priorityAgain = rotate(unresolved.filter(index => again.has(index)));
    const priorityHard = rotate(unresolved.filter(index => hard.has(index) && !again.has(index)));
    const unseen = rotate(unresolved.filter(index => !again.has(index) && !hard.has(index)));
    return [...priorityAgain, ...priorityHard, ...unseen, ...(unresolved.includes(current) ? [current] : [])];
  }

  function nextUnresolved(current, count, state) {
    return orderedCandidates(current, count, state)[0] ?? current;
  }

  function setSectionId(node, prefix, label, index) {
    if (!node) return '';
    if (!node.id) node.id = `${prefix}-${safeId(label)}-${index}`;
    node.style.scrollMarginTop = '76px';
    return node.id;
  }

  function addSummaryRedFlags(panel) {
    if (!panel || panel.querySelector('.ck-doctor-redflags-quick')) return;
    const item = currentItem();
    const flags = Array.isArray(item?.redFlags) ? item.redFlags.filter(Boolean).slice(0, 3) : [];
    if (!flags.length) return;
    const block = document.createElement('aside');
    block.className = 'ck-doctor-redflags-quick';
    block.setAttribute('aria-label', 'Shenjat alarmuese kryesore');
    const head = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'RED FLAGS';
    const title = document.createElement('strong');
    title.textContent = 'Shenjat që ndryshojnë urgjencën';
    head.append(eyebrow, title);
    const list = document.createElement('ul');
    flags.forEach(flag => {
      const li = document.createElement('li');
      li.textContent = flag;
      list.appendChild(li);
    });
    block.append(head, list);
    const steps = panel.querySelector('.ck-sl-step-list');
    steps?.insertAdjacentElement('afterend', block);
  }

  function summaryTargets(panel) {
    const targets = [];
    const therapy = panel.querySelector('.ck-sl-therapy');
    if (therapy) targets.push({label: 'Tani', node: therapy});
    const stepsHeading = panel.querySelector('.ck-sl-section-heading');
    if (stepsHeading) targets.push({label: 'Hapat', node: stepsHeading});
    const redFlags = panel.querySelector('.ck-doctor-redflags-quick');
    if (redFlags) targets.push({label: 'Red flags', node: redFlags});
    const dont = panel.querySelector('.ck-sl-dont');
    if (dont) targets.push({label: 'Mos bëj', node: dont});
    const transfer = panel.querySelector('.ck-sl-transfer');
    if (transfer) targets.push({label: 'Transferimi', node: transfer});
    return targets;
  }

  function learnTargets(panel) {
    const targets = [];
    [...panel.querySelectorAll('.ck-sl-lesson-block')].forEach(block => {
      const title = block.querySelector('h3')?.textContent?.trim() || '';
      const eyebrow = block.querySelector('.ck-sl-lesson-block-head>span')?.textContent?.trim() || '';
      const haystack = `${eyebrow} ${title}`.toLocaleLowerCase('sq');
      let label = '';
      if (/veprimi|rendi klinik/.test(haystack)) label = 'Hapat';
      else if (/red flags|shenjat alarmuese/.test(haystack)) label = 'Red flags';
      else if (/thellimi|sekondar|avancuar/.test(haystack)) label = 'Thellim';
      else if (/siguria|gabimet/.test(haystack)) label = 'Mos bëj';
      else if (/transferimi|referimi|handover/.test(haystack)) label = 'Transferimi';
      if (label && !targets.some(item => item.label === label)) targets.push({label, node: block});
    });
    const flash = panel.querySelector('[data-ck-sl-flashcards]');
    if (flash) targets.push({label: 'Flashcards', node: flash});
    return targets;
  }

  function installJumpbar(panel, mode) {
    if (!panel || panel.querySelector(':scope > [data-ck-doctor-nav]')) return;
    const targets = mode === 'summary' ? summaryTargets(panel) : learnTargets(panel);
    if (targets.length < 2) return;

    const prefix = mode === 'summary' ? 'ck-summary' : 'ck-learn';
    const entries = targets.map((target, index) => ({...target, id: setSectionId(target.node, prefix, target.label, index + 1)}));
    const nav = document.createElement('nav');
    nav.className = 'ck-doctor-jumpbar';
    nav.dataset.ckDoctorNav = mode;
    nav.setAttribute('aria-label', mode === 'summary' ? 'Navigimi i përmbledhjes' : 'Navigimi i mësimit');

    const prefixLabel = document.createElement('span');
    prefixLabel.textContent = mode === 'summary' ? 'Shko te' : 'Përsërit';
    nav.appendChild(prefixLabel);
    entries.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ckJump = entry.id;
      button.textContent = entry.label;
      if (index === 0) button.setAttribute('aria-current', 'true');
      nav.appendChild(button);
    });

    if (mode === 'learn') {
      panel.querySelector('.ck-sl-learn-intro')?.insertAdjacentElement('afterend', nav);
    } else {
      panel.prepend(nav);
    }

    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-jump]');
      if (!button) return;
      const target = document.getElementById(button.dataset.ckJump || '');
      if (!target) return;
      nav.querySelectorAll('[data-ck-jump]').forEach(item => item.removeAttribute('aria-current'));
      button.setAttribute('aria-current', 'true');
      target.scrollIntoView({behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start'});
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(records => {
        const visible = records.filter(record => record.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target?.id) return;
        nav.querySelectorAll('[data-ck-jump]').forEach(button => {
          if (button.dataset.ckJump === visible.target.id) button.setAttribute('aria-current', 'true');
          else button.removeAttribute('aria-current');
        });
      }, {rootMargin: '-18% 0px -68% 0px', threshold: [0, .2, .5]});
      entries.forEach(entry => observer.observe(entry.node));
    }
  }

  function addLearningGuide(panel) {
    if (!panel || panel.querySelector('.ck-doctor-learning-guide')) return;
    const intro = panel.querySelector('.ck-sl-learn-intro');
    if (!intro) return;
    const guide = document.createElement('div');
    guide.className = 'ck-doctor-learning-guide';
    const strong = document.createElement('strong');
    strong.textContent = 'Rruga më e shpejtë';
    const span = document.createElement('span');
    span.textContent = 'Rendi klinik → red flags → gabimet → flashcards pa parë përgjigjen.';
    guide.append(strong, span);
    intro.appendChild(guide);
  }

  function addSummaryGuide(panel) {
    if (!panel || panel.querySelector('.ck-doctor-summary-guide')) return;
    const nav = panel.querySelector('[data-ck-doctor-nav="summary"]');
    if (!nav) return;
    const guide = document.createElement('p');
    guide.className = 'ck-doctor-summary-guide';
    guide.textContent = 'Në urgjencë: nis te “Tani”, ndiq hapat me radhë, kontrollo red flags dhe “Mos bëj”, pastaj transferimin.';
    nav.insertAdjacentElement('afterend', guide);
  }

  function addHardButton(flash) {
    const recall = flash.querySelector('.ck-sl-recall');
    if (!recall || recall.querySelector('[data-ck-flash-hard]')) return;
    const hard = document.createElement('button');
    hard.type = 'button';
    hard.dataset.ckFlashHard = '1';
    hard.textContent = 'Me ndihmë';
    hard.setAttribute('aria-keyshortcuts', '2');
    recall.querySelector('[data-flash-known]')?.insertAdjacentElement('beforebegin', hard);
  }

  function enhanceFlashcards(flash) {
    if (!flash || flash.dataset.ckDoctorV3 === '1') return;
    flash.dataset.ckDoctorV3 = '1';
    const itemId = flash.dataset.itemId || '';
    const count = flashCount(flash);
    if (!itemId || !count) return;

    const state = readFlash(itemId, count);
    const known = new Set(state.known);
    const hard = new Set(state.hard);
    const again = new Set(state.again);
    const mastered = known.size;
    const remaining = Math.max(count - mastered, 0);
    const mastery = count ? Math.round((mastered / count) * 100) : 0;

    addHardButton(flash);

    const head = flash.querySelector('.ck-sl-flash-head');
    if (head) {
      const tools = document.createElement('div');
      tools.className = 'ck-flash-session-tools';
      tools.innerHTML = `
        <div class="ck-flash-session-stats" aria-label="Progresi i rikujtimit">
          <span class="is-known"><strong>${mastered}</strong> të ditura</span>
          <span class="is-hard"><strong>${hard.size}</strong> me ndihmë</span>
          <span class="is-again"><strong>${again.size}</strong> përsëritje</span>
        </div>
        ${mastered || hard.size || again.size ? '<button type="button" data-ck-flash-reset>Rifillo</button>' : ''}`;
      head.insertAdjacentElement('afterend', tools);
    }

    if (state.feedback) {
      const feedback = document.createElement('div');
      feedback.className = 'ck-flash-feedback';
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      feedback.textContent = state.feedback;
      flash.querySelector('.ck-flash-session-tools')?.insertAdjacentElement('afterend', feedback);
    }

    const progress = flash.querySelector('.ck-sl-flash-progress');
    if (progress) {
      progress.setAttribute('aria-label', 'Kartat e rikujtuara pa ndihmë');
      progress.setAttribute('aria-valuenow', String(mastery));
      progress.querySelector('span')?.setAttribute('style', `width:${mastery}%`);
    }

    const card = flash.querySelector('.ck-sl-flashcard');
    if (card) {
      card.tabIndex = 0;
      card.setAttribute('aria-label', 'Flashcard. Mendo përgjigjen, shfaqe dhe vlerëso rikujtimin.');
      const instruction = document.createElement('p');
      instruction.className = 'ck-flash-instruction';
      instruction.textContent = state.revealed
        ? 'Krahasoje me përgjigjen tënde: 1 = përsërite, 2 = me ndihmë, 3 = e dija.'
        : 'Thuaje përgjigjen me vete para se ta shfaqësh.';
      card.querySelector('[data-flash-reveal]')?.insertAdjacentElement('beforebegin', instruction);
    }

    const reveal = flash.querySelector('[data-flash-reveal]');
    reveal?.setAttribute('aria-keyshortcuts', 'Space');
    const repeat = flash.querySelector('[data-flash-repeat]');
    if (repeat) {
      repeat.textContent = 'Nuk e dija';
      repeat.setAttribute('aria-keyshortcuts', '1');
    }
    const knew = flash.querySelector('[data-flash-known]');
    if (knew) {
      knew.textContent = known.has(state.index) ? 'E dija ✓' : 'E dija';
      knew.setAttribute('aria-keyshortcuts', '3');
    }

    const controls = flash.querySelector('.ck-sl-flash-controls');
    if (controls && state.revealed && !controls.querySelector('.ck-flash-rating-label')) {
      const label = document.createElement('span');
      label.className = 'ck-flash-rating-label';
      label.textContent = 'Sa mirë e rikujtove?';
      controls.prepend(label);
    }

    if (remaining === 0) {
      const complete = document.createElement('div');
      complete.className = 'ck-flash-complete';
      complete.innerHTML = '<span aria-hidden="true">✓</span><div><strong>Seti u përfundua</strong><p>Të gjitha kartat u rikujtuan pa ndihmë. Rifillo për një raund të ri.</p></div><button type="button" data-ck-flash-reset>Rifillo setin</button>';
      flash.appendChild(complete);
    } else {
      const footer = document.createElement('div');
      footer.className = 'ck-flash-review-footer';
      const message = document.createElement('span');
      message.textContent = hard.size || again.size
        ? 'Kartat e vështira dalin automatikisht të parat.'
        : `${remaining} ${remaining === 1 ? 'kartë ka mbetur' : 'karta kanë mbetur'}.`;
      footer.appendChild(message);
      if (hard.size || again.size) {
        const focusHard = document.createElement('button');
        focusHard.type = 'button';
        focusHard.dataset.ckFlashDifficult = '1';
        focusHard.textContent = `Përsërit të vështirat (${hard.size + again.size})`;
        footer.appendChild(focusHard);
      }
      flash.appendChild(footer);
    }

    const commit = (nextState, focusSelector = '[data-flash-reveal]') => {
      saveFlash(itemId, nextState);
      refreshLearn(focusSelector);
    };

    const rate = rating => {
      const nextKnown = new Set(state.known);
      const nextHard = new Set(state.hard);
      const nextAgain = new Set(state.again);
      let feedback = '';
      if (rating === 'known') {
        nextKnown.add(state.index);
        nextHard.delete(state.index);
        nextAgain.delete(state.index);
        feedback = 'E dija — karta u shënua si e mësuar.';
      } else if (rating === 'hard') {
        nextKnown.delete(state.index);
        nextAgain.delete(state.index);
        nextHard.add(state.index);
        feedback = 'Me ndihmë — karta do të rikthehet më herët.';
      } else {
        nextKnown.delete(state.index);
        nextHard.delete(state.index);
        nextAgain.add(state.index);
        feedback = 'Nuk e dija — karta u kthye në prioritet për përsëritje.';
      }
      const draft = {...state, known: [...nextKnown], hard: [...nextHard], again: [...nextAgain], revealed: false, feedback};
      draft.index = nextUnresolved(state.index, count, draft);
      commit(draft);
    };

    flash.addEventListener('click', event => {
      const control = event.target.closest('[data-ck-flash-reset],[data-ck-flash-difficult],[data-flash-reveal],[data-flash-prev],[data-flash-next],[data-flash-repeat],[data-ck-flash-hard],[data-flash-known]');
      if (!control) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      if (control.matches('[data-ck-flash-reset]')) {
        try { sessionStorage.removeItem(`${FLASH_KEY}${itemId}`); } catch {}
        refreshLearn();
        return;
      }
      if (control.matches('[data-ck-flash-difficult]')) {
        const difficult = [...state.again, ...state.hard].filter(index => !known.has(index));
        const next = difficult.find(index => index !== state.index) ?? difficult[0] ?? nextUnresolved(state.index, count, state);
        commit({...state, index: next, revealed: false, feedback: 'Fokus te kartat që kërkojnë përsëritje.'});
        return;
      }
      if (control.matches('[data-flash-reveal]')) {
        commit({...state, revealed: !state.revealed, feedback: ''}, '[data-flash-reveal]');
        return;
      }
      if (control.matches('[data-flash-prev]')) {
        commit({...state, index: Math.max(0, state.index - 1), revealed: false, feedback: ''});
        return;
      }
      if (control.matches('[data-flash-next]')) {
        commit({...state, index: Math.min(count - 1, state.index + 1), revealed: false, feedback: ''});
        return;
      }
      if (!state.revealed) return;
      if (control.matches('[data-flash-repeat]')) rate('again');
      else if (control.matches('[data-ck-flash-hard]')) rate('hard');
      else if (control.matches('[data-flash-known]')) rate('known');
    }, true);

    flash.addEventListener('keydown', event => {
      if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.code === 'Space' && !event.target.closest('button,a')) {
        event.preventDefault();
        reveal?.click();
      } else if (event.key === 'ArrowLeft' && !event.target.closest('[data-flash-prev],[data-flash-next]')) {
        event.preventDefault();
        flash.querySelector('[data-flash-prev]:not([disabled])')?.click();
      } else if (event.key === 'ArrowRight' && !event.target.closest('[data-flash-prev],[data-flash-next]')) {
        event.preventDefault();
        flash.querySelector('[data-flash-next]:not([disabled])')?.click();
      } else if (state.revealed && event.key === '1') {
        event.preventDefault();
        repeat?.click();
      } else if (state.revealed && event.key === '2') {
        event.preventDefault();
        flash.querySelector('[data-ck-flash-hard]')?.click();
      } else if (state.revealed && event.key === '3') {
        event.preventDefault();
        knew?.click();
      }
    });
  }

  function enhance() {
    const summary = detail.querySelector('[data-ck-sl-panel="summary"]');
    const learn = detail.querySelector('[data-ck-sl-panel="learn"]');
    addSummaryRedFlags(summary);
    installJumpbar(summary, 'summary');
    addSummaryGuide(summary);
    addLearningGuide(learn);
    installJumpbar(learn, 'learn');
    enhanceFlashcards(learn?.querySelector('[data-ck-sl-flashcards]'));
  }

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };

  const observer = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('.ck-sl-experience,[data-ck-sl-panel],[data-ck-sl-flashcards]')
        || node.querySelector?.('.ck-sl-experience,[data-ck-sl-panel],[data-ck-sl-flashcards]')
      )
    ));
    if (relevant) schedule();
  });
  observer.observe(detail, {childList: true, subtree: true});
  schedule();
  window.setTimeout(schedule, 120);
})();