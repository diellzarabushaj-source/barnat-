(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const META_KEY = 'medindex_emergency_flashcards_v3meta:';
  const FEEDBACK_KEY = 'medindex_emergency_flashcards_v3feedback:';

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const safeId = value => String(value || 'section')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';

  function currentItem() {
    const items = Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
    const activeId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id || '';
    return items.find(item => String(item?._id || '') === String(activeId)) || null;
  }

  function flashCount(flash) {
    const text = flash?.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = text.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function readState(itemId, count) {
    const fallback = {index:0, revealed:false, known:[]};
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${FLASH_KEY}${itemId}`) || 'null');
      if (!stored || !Number.isInteger(stored.index)) return fallback;
      return {
        index:Math.min(Math.max(stored.index, 0), Math.max(count - 1, 0)),
        revealed:Boolean(stored.revealed),
        known:Array.isArray(stored.known)
          ? [...new Set(stored.known.filter(value => Number.isInteger(value) && value >= 0 && value < count))]
          : [],
      };
    } catch {
      return fallback;
    }
  }

  function writeState(itemId, state) {
    try { sessionStorage.setItem(`${FLASH_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function readMeta(itemId, count) {
    const fallback = {misses:{}, ratings:0, round:1};
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${META_KEY}${itemId}`) || 'null');
      if (!stored || typeof stored !== 'object') return fallback;
      const misses = {};
      Object.entries(stored.misses || {}).forEach(([key, value]) => {
        const index = Number(key);
        const amount = Number(value);
        if (Number.isInteger(index) && index >= 0 && index < count && Number.isFinite(amount) && amount > 0) {
          misses[index] = Math.floor(amount);
        }
      });
      return {
        misses,
        ratings:Math.max(Number(stored.ratings || 0), 0),
        round:Math.max(Number(stored.round || 1), 1),
      };
    } catch {
      return fallback;
    }
  }

  function writeMeta(itemId, meta) {
    try { sessionStorage.setItem(`${META_KEY}${itemId}`, JSON.stringify(meta)); } catch {}
  }

  function setFeedback(itemId, text, tone = 'info') {
    try { sessionStorage.setItem(`${FEEDBACK_KEY}${itemId}`, JSON.stringify({text, tone})); } catch {}
  }

  function consumeFeedback(itemId) {
    try {
      const key = `${FEEDBACK_KEY}${itemId}`;
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      sessionStorage.removeItem(key);
      return value && value.text ? value : null;
    } catch {
      return null;
    }
  }

  function rerenderFlash(focusSelector = '[data-flash-reveal]') {
    const returnToTest = detail.dataset.ckLearningMode === 'test';
    requestAnimationFrame(() => {
      detail.querySelector('[data-ck-mode="learn"]')?.click();
      requestAnimationFrame(() => {
        if (returnToTest) detail.querySelector('[data-ck-mode="test"]')?.click();
        requestAnimationFrame(() => detail.querySelector(focusSelector)?.focus({preventScroll:true}));
      });
    });
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
    block.innerHTML = '<div><span>RED FLAGS</span><strong>Kontrolloji para se të vazhdosh</strong></div><ul></ul>';
    const list = block.querySelector('ul');
    flags.forEach(flag => {
      const li = document.createElement('li');
      li.textContent = String(flag);
      list.appendChild(li);
    });
    panel.querySelector('.ck-sl-step-list')?.insertAdjacentElement('afterend', block);
  }

  function summaryTargets(panel) {
    const targets = [];
    const therapy = panel?.querySelector('.ck-sl-therapy');
    const steps = panel?.querySelector('.ck-sl-section-heading');
    const redFlags = panel?.querySelector('.ck-doctor-redflags-quick');
    const dont = panel?.querySelector('.ck-sl-dont');
    const transfer = panel?.querySelector('.ck-sl-transfer');
    if (therapy) targets.push({label:'Tani', node:therapy});
    if (steps) targets.push({label:'Hapat', node:steps});
    if (redFlags) targets.push({label:'Red flags', node:redFlags});
    if (dont) targets.push({label:'Mos bëj', node:dont});
    if (transfer) targets.push({label:'Transferimi', node:transfer});
    return targets;
  }

  function learnTargets(panel) {
    const targets = [];
    [...panel?.querySelectorAll('.ck-sl-lesson-block') || []].forEach(block => {
      const title = block.querySelector('h3')?.textContent?.trim() || '';
      const eyebrow = block.querySelector('.ck-sl-lesson-block-head>span')?.textContent?.trim() || '';
      const haystack = `${eyebrow} ${title}`.toLocaleLowerCase('sq');
      let label = '';
      if (/veprimi|rendi klinik/.test(haystack)) label = 'Hapat';
      else if (/red flags|shenjat alarmuese/.test(haystack)) label = 'Red flags';
      else if (/thellimi|sekondar|avancuar/.test(haystack)) label = 'Thellim';
      else if (/siguria|gabimet/.test(haystack)) label = 'Mos bëj';
      else if (/transferimi|referimi|handover/.test(haystack)) label = 'Transferimi';
      if (label && !targets.some(item => item.label === label)) targets.push({label, node:block});
    });
    const flash = panel?.querySelector('[data-ck-sl-flashcards]');
    if (flash) targets.push({label:'Flashcards', node:flash});
    return targets;
  }

  function sectionCount(panel, label) {
    if (!panel) return 0;
    if (label === 'Hapat') return panel.querySelectorAll('.ck-sl-step,.ck-sl-lesson-step').length;
    if (label === 'Red flags') {
      const quick = panel.querySelectorAll('.ck-doctor-redflags-quick li').length;
      if (quick) return quick;
      const block = [...panel.querySelectorAll('.ck-sl-lesson-block')]
        .find(node => /red flags|shenjat alarmuese/i.test(node.textContent || ''));
      return block?.querySelectorAll('li').length || 0;
    }
    if (label === 'Mos bëj') {
      const summary = panel.querySelectorAll('.ck-sl-dont li').length;
      if (summary) return summary;
      const block = [...panel.querySelectorAll('.ck-sl-lesson-block')]
        .find(node => /siguria|gabimet (?:që|qe) duhen shmangur|mos bëj/i.test(node.textContent || ''));
      return block?.querySelectorAll('li').length || 0;
    }
    if (label === 'Flashcards') return flashCount(panel.querySelector('[data-ck-sl-flashcards]'));
    return 0;
  }

  function syncNavContext(nav) {
    const buttons = [...nav.querySelectorAll('[data-ck-jump]')];
    const context = nav.previousElementSibling?.classList?.contains('ck-v3-nav-context')
      ? nav.previousElementSibling
      : null;
    if (!context || !buttons.length) return;
    const current = buttons.find(button => button.getAttribute('aria-current') === 'true') || buttons[0];
    const index = Math.max(buttons.indexOf(current), 0);
    context.querySelector('strong').textContent = current.textContent?.replace(/\d+$/,'').trim() || 'Seksioni';
    context.querySelector('small').textContent = `${index + 1} / ${buttons.length}`;
    context.style.setProperty('--ck-v3-progress', `${Math.round(((index + 1) / buttons.length) * 100)}%`);
  }

  function decorateJumpbar(nav) {
    if (!nav || nav.dataset.ckV3Ready === '1') return;
    nav.dataset.ckV3Ready = '1';
    const panel = nav.closest('[data-ck-sl-panel]');
    const lead = nav.querySelector(':scope > span');
    if (lead) lead.textContent = nav.dataset.ckDoctorNav === 'summary' ? 'Vepro shpejt' : 'Rruga klinike';

    const buttons = [...nav.querySelectorAll('[data-ck-jump]')];
    buttons.forEach((button, index) => {
      const label = button.textContent.trim();
      button.dataset.ckRouteStep = String(index + 1);
      const count = sectionCount(panel, label);
      if (count > 0 && !button.querySelector('.ck-doctor-nav-count')) {
        const badge = document.createElement('span');
        badge.className = 'ck-doctor-nav-count';
        badge.textContent = String(count);
        badge.setAttribute('aria-hidden', 'true');
        button.appendChild(badge);
        button.setAttribute('aria-label', `${label}, ${count}`);
      }
    });

    nav.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? buttons.length - 1
        : event.key === 'ArrowLeft' ? Math.max(0, index - 1)
        : Math.min(buttons.length - 1, index + 1);
      buttons[next]?.focus({preventScroll:true});
    });
    syncNavContext(nav);
  }

  function installJumpbar(panel, mode) {
    if (!panel || panel.querySelector(':scope > [data-ck-doctor-nav]')) return;
    const targets = mode === 'summary' ? summaryTargets(panel) : learnTargets(panel);
    if (targets.length < 2) return;

    const entries = targets.map((target, index) => ({
      ...target,
      id:setSectionId(target.node, mode === 'summary' ? 'ck-summary' : 'ck-learn', target.label, index + 1),
    }));

    const context = document.createElement('div');
    context.className = 'ck-v3-nav-context';
    context.innerHTML = `<span>${mode === 'summary' ? 'TANI NË PROTOKOLL' : 'PJESA E MËSIMIT'}</span><strong>${entries[0].label}</strong><small>1 / ${entries.length}</small>`;

    const nav = document.createElement('nav');
    nav.className = 'ck-doctor-jumpbar';
    nav.dataset.ckDoctorNav = mode;
    nav.setAttribute('aria-label', mode === 'summary' ? 'Navigimi i përmbledhjes' : 'Navigimi i mësimit');
    const lead = document.createElement('span');
    lead.textContent = mode === 'summary' ? 'Vepro shpejt' : 'Rruga klinike';
    nav.appendChild(lead);

    entries.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ckJump = entry.id;
      button.textContent = entry.label;
      if (index === 0) button.setAttribute('aria-current', 'true');
      nav.appendChild(button);
    });

    if (mode === 'learn') {
      const intro = panel.querySelector('.ck-sl-learn-intro');
      intro?.insertAdjacentElement('afterend', context);
      context.insertAdjacentElement('afterend', nav);
    } else {
      panel.prepend(nav);
      panel.prepend(context);
    }

    decorateJumpbar(nav);
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-jump]');
      if (!button) return;
      const target = document.getElementById(button.dataset.ckJump || '');
      if (!target) return;
      nav.querySelectorAll('[data-ck-jump]').forEach(item => item.removeAttribute('aria-current'));
      button.setAttribute('aria-current', 'true');
      syncNavContext(nav);
      target.scrollIntoView({behavior:reducedMotion() ? 'auto' : 'smooth', block:'start'});
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(records => {
        const visible = records
          .filter(record => record.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target?.id) return;
        nav.querySelectorAll('[data-ck-jump]').forEach(button => {
          if (button.dataset.ckJump === visible.target.id) button.setAttribute('aria-current', 'true');
          else button.removeAttribute('aria-current');
        });
        syncNavContext(nav);
      }, {rootMargin:'-18% 0px -68% 0px', threshold:[0,.2,.5]});
      entries.forEach(entry => observer.observe(entry.node));
    }
  }

  function addGuides(summary, learn) {
    if (summary && !summary.querySelector('.ck-doctor-summary-guide')) {
      const nav = summary.querySelector('[data-ck-doctor-nav="summary"]');
      if (nav) {
        const note = document.createElement('p');
        note.className = 'ck-doctor-summary-guide';
        note.textContent = 'Nis te “Tani”, ndiq hapat, kontrollo red flags dhe “Mos bëj”, pastaj transferimin.';
        nav.insertAdjacentElement('afterend', note);
      }
    }
    if (learn && !learn.querySelector('.ck-doctor-learning-guide')) {
      const intro = learn.querySelector('.ck-sl-learn-intro');
      if (intro) {
        const guide = document.createElement('div');
        guide.className = 'ck-doctor-learning-guide';
        guide.innerHTML = '<strong>Rruga më e shpejtë</strong><span>Rendi klinik → red flags → gabimet → testo veten pa parë përgjigjen.</span>';
        intro.appendChild(guide);
      }
    }
  }

  function ensureSessionTools(flash, itemId, count, state, meta) {
    const known = new Set(state.known);
    const hard = Object.entries(meta.misses).filter(([,value]) => Number(value) > 0).map(([index]) => Number(index));
    let tools = flash.querySelector('.ck-flash-session-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'ck-flash-session-tools';
      flash.querySelector('.ck-sl-flash-head')?.insertAdjacentElement('afterend', tools);
    }

    let stats = tools.querySelector('.ck-flash-session-stats');
    if (!stats) {
      stats = document.createElement('div');
      stats.className = 'ck-flash-session-stats';
      stats.setAttribute('aria-label', 'Progresi i rikujtimit');
      tools.prepend(stats);
    }
    stats.innerHTML = `<span><strong>${known.size}</strong> të ditura</span><span><strong>${Math.max(count - known.size, 0)}</strong> për review</span>`;

    let session = tools.querySelector('.ck-flash-v3-session');
    if (!session) {
      session = document.createElement('div');
      session.className = 'ck-flash-v3-session';
      session.setAttribute('aria-label', 'Gjendja e sesionit të përsëritjes');
      tools.appendChild(session);
    }
    session.innerHTML = `<span>Raundi <strong>${meta.round}</strong></span><span class="${hard.length ? 'has-hard' : ''}">Të vështira <strong>${hard.length}</strong></span>`;

    let reset = tools.querySelector('[data-ck-flash-reset]');
    if ((known.size || meta.ratings || hard.length) && !reset) {
      reset = document.createElement('button');
      reset.type = 'button';
      reset.dataset.ckFlashReset = '1';
      reset.textContent = 'Rifillo setin';
      tools.appendChild(reset);
    } else if (!known.size && !meta.ratings && !hard.length && reset) {
      reset.remove();
    }

    return {tools, hard};
  }

  function enhanceFlash(flash) {
    if (!flash || flash.dataset.ckV3Ready === '1') return;
    const itemId = flash.dataset.itemId || '';
    const count = flashCount(flash);
    if (!itemId || !count) return;
    flash.dataset.ckV3Ready = '1';

    const state = readState(itemId, count);
    const meta = readMeta(itemId, count);
    const {tools, hard} = ensureSessionTools(flash, itemId, count, state, meta);

    const feedback = consumeFeedback(itemId);
    if (feedback) {
      const note = document.createElement('div');
      note.className = `ck-flash-feedback is-${feedback.tone || 'info'}`;
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      note.textContent = feedback.text;
      tools.insertAdjacentElement('afterend', note);
    }

    const progress = flash.querySelector('.ck-sl-flash-progress');
    if (progress) {
      const mastery = Math.round((state.known.length / count) * 100);
      progress.setAttribute('aria-label', 'Kartat e rikujtuara');
      progress.setAttribute('aria-valuenow', String(mastery));
      progress.querySelector('span')?.setAttribute('style', `width:${mastery}%`);
    }

    const card = flash.querySelector('.ck-sl-flashcard');
    if (card) {
      const misses = Number(meta.misses[state.index] || 0);
      card.tabIndex = 0;
      card.dataset.ckDifficulty = misses > 1 ? 'hard' : misses === 1 ? 'review' : 'new';
      card.setAttribute('aria-label', 'Flashcard. Mendo përgjigjen, shfaqe dhe vlerëso rikujtimin.');
      if (!card.querySelector('.ck-flash-v3-cardmeta')) {
        const metaRow = document.createElement('div');
        metaRow.className = 'ck-flash-v3-cardmeta';
        metaRow.innerHTML = `<span>Karta ${state.index + 1} / ${count}</span><span>${misses ? `${misses}× për review` : 'Pa gabime në këtë sesion'}</span>`;
        card.querySelector('h4')?.insertAdjacentElement('beforebegin', metaRow);
      }
      if (!card.querySelector('.ck-flash-instruction')) {
        const instruction = document.createElement('p');
        instruction.className = 'ck-flash-instruction';
        instruction.textContent = state.revealed
          ? 'Krahasoje me përgjigjen tënde dhe vlerëso sa mirë e rikujtove.'
          : 'Thuaje përgjigjen me vete para se ta shfaqësh.';
        card.querySelector('[data-flash-reveal]')?.insertAdjacentElement('beforebegin', instruction);
      }
    }

    flash.querySelector('[data-flash-reveal]')?.setAttribute('aria-keyshortcuts', 'Space');

    if (state.known.length === count && !flash.querySelector('.ck-flash-complete')) {
      const complete = document.createElement('div');
      complete.className = 'ck-flash-complete';
      complete.innerHTML = '<span aria-hidden="true">✓</span><div><strong>Raundi u përfundua</strong><p>I ke rikujtuar të gjitha kartat. Mund ta rifillosh ose të fokusohesh te kartat e vështira.</p></div><button type="button" data-ck-flash-reset>Rifillo setin</button>';
      if (hard.length) {
        const review = document.createElement('button');
        review.type = 'button';
        review.dataset.ckFlashHardReview = '1';
        review.className = 'ck-flash-hard-review';
        review.textContent = `Rishiko të vështirat (${hard.length})`;
        complete.appendChild(review);
      }
      flash.appendChild(complete);
    }
  }

  function recordRating(flash, rating) {
    const itemId = flash.dataset.itemId || '';
    const count = flashCount(flash);
    if (!itemId || !count) return;
    const state = readState(itemId, count);
    const meta = readMeta(itemId, count);
    const current = state.index;
    const misses = Number(meta.misses[current] || 0);

    if (rating === 'again') {
      meta.misses[current] = misses + 2;
      setFeedback(itemId, 'Përsërite — kjo kartë mbetet me prioritet në review.', 'review');
    } else if (rating === 'hard') {
      meta.misses[current] = misses + 1;
      setFeedback(itemId, 'Vështirë — kjo kartë do të dalë më herët në review.', 'review');
    } else if (rating === 'easy') {
      delete meta.misses[current];
      setFeedback(itemId, 'Shumë e lehtë — intervali i përsëritjes u zgjat.', 'known');
    } else {
      const nextMisses = Math.max(misses - 1, 0);
      if (nextMisses) meta.misses[current] = nextMisses;
      else delete meta.misses[current];
      setFeedback(itemId, 'E di — progresi u ruajt dhe intervali i review-t u rrit.', 'known');
    }
    meta.ratings += 1;
    writeMeta(itemId, meta);
  }

  function enhance() {
    const summary = detail.querySelector('[data-ck-sl-panel="summary"]');
    const learn = detail.querySelector('[data-ck-sl-panel="learn"]');
    addSummaryRedFlags(summary);
    installJumpbar(summary, 'summary');
    installJumpbar(learn, 'learn');
    addGuides(summary, learn);
    detail.querySelectorAll('[data-ck-doctor-nav]').forEach(decorateJumpbar);
    detail.querySelectorAll('[data-ck-sl-flashcards]').forEach(enhanceFlash);
  }

  detail.addEventListener('click', event => {
    const flash = event.target.closest?.('[data-ck-sl-flashcards]');
    if (!flash) return;
    const itemId = flash.dataset.itemId || '';
    const count = flashCount(flash);
    if (!itemId || !count) return;

    const reset = event.target.closest('[data-ck-flash-reset]');
    if (reset) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        sessionStorage.removeItem(`${FLASH_KEY}${itemId}`);
        sessionStorage.removeItem(`${META_KEY}${itemId}`);
        sessionStorage.removeItem(`${FEEDBACK_KEY}${itemId}`);
      } catch {}
      rerenderFlash();
      return;
    }

    const hardReview = event.target.closest('[data-ck-flash-hard-review]');
    if (hardReview) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = readState(itemId, count);
      const meta = readMeta(itemId, count);
      const hard = Object.keys(meta.misses)
        .map(Number)
        .filter(index => Number(meta.misses[index] || 0) > 0)
        .sort((a,b) => Number(meta.misses[b] || 0) - Number(meta.misses[a] || 0));
      if (!hard.length) return;
      const known = new Set(state.known);
      hard.forEach(index => known.delete(index));
      writeMeta(itemId, {...meta, round:meta.round + 1});
      writeState(itemId, {...state, known:[...known], index:hard[0], revealed:false});
      setFeedback(itemId, 'Po rishikon vetëm kartat që të kanë vështirësuar.', 'review');
      rerenderFlash();
    }
  });

  detail.addEventListener('click', event => {
    const flash = event.target.closest?.('[data-ck-sl-flashcards]');
    if (!flash) return;
    const control = event.target.closest?.('[data-ck-rating],[data-flash-repeat],[data-flash-known]');
    if (!control) return;

    const explicit = control.dataset.ckRating || '';
    const rating = explicit || (control.matches('[data-flash-repeat]') ? 'again' : 'good');
    if (!['again','hard','good','easy'].includes(rating)) return;

    if (rating === 'hard' || rating === 'easy') {
      flash.dataset.ckV3DelegatedRating = rating;
      recordRating(flash, rating);
      queueMicrotask(() => {
        if (flash.dataset.ckV3DelegatedRating === rating) delete flash.dataset.ckV3DelegatedRating;
      });
      return;
    }
    if (flash.dataset.ckV3DelegatedRating) return;
    recordRating(flash, rating);
  }, true);

  detail.addEventListener('keydown', event => {
    const flash = event.target.closest?.('[data-ck-sl-flashcards]');
    if (!flash || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;

    if (event.code === 'Space' && !event.target.closest?.('button,a')) {
      event.preventDefault();
      flash.querySelector('[data-flash-reveal]')?.click();
      return;
    }
    if (event.key === 'ArrowLeft' && !event.target.closest?.('[data-flash-prev],[data-flash-next]')) {
      event.preventDefault();
      flash.querySelector('[data-flash-prev]:not([disabled])')?.click();
      return;
    }
    if (event.key === 'ArrowRight' && !event.target.closest?.('[data-flash-prev],[data-flash-next]')) {
      event.preventDefault();
      flash.querySelector('[data-flash-next]:not([disabled])')?.click();
      return;
    }
    if (event.key.toLowerCase() === 'r' && flash.querySelector('[data-ck-flash-hard-review]')) {
      event.preventDefault();
      flash.querySelector('[data-ck-flash-hard-review]')?.click();
    }
  });

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('.ck-sl-experience,[data-ck-sl-panel],[data-ck-sl-flashcards]')
        || node.querySelector?.('.ck-sl-experience,[data-ck-sl-panel],[data-ck-sl-flashcards]')
      )
    ))) schedule();
  });
  observer.observe(detail, {childList:true, subtree:true});

  schedule();
  window.setTimeout(schedule, 160);
})();