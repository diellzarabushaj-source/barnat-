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

  function readFlash(itemId, count) {
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

  function saveFlash(itemId, state) {
    try { sessionStorage.setItem(`${FLASH_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function refreshLearn() {
    requestAnimationFrame(() => detail.querySelector('[data-ck-mode="learn"]')?.click());
  }

  function flashCount(flash) {
    const text = flash.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = text.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function nextUnknown(current, count, known) {
    if (!count) return 0;
    for (let offset = 1; offset <= count; offset += 1) {
      const candidate = (current + offset) % count;
      if (!known.has(candidate)) return candidate;
    }
    return current;
  }

  function setSectionId(node, prefix, label, index) {
    if (!node) return '';
    if (!node.id) node.id = `${prefix}-${safeId(label)}-${index}`;
    node.style.scrollMarginTop = '78px';
    return node.id;
  }

  function summaryTargets(panel) {
    const targets = [];
    const therapy = panel.querySelector('.ck-sl-therapy');
    if (therapy) targets.push({label: 'Tani', node: therapy});
    const stepsHeading = panel.querySelector('.ck-sl-section-heading');
    if (stepsHeading) targets.push({label: 'Hapat', node: stepsHeading});
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
    const entries = targets.map((target, index) => ({
      ...target,
      id: setSectionId(target.node, prefix, target.label, index + 1),
    }));
    const nav = document.createElement('nav');
    nav.className = 'ck-doctor-jumpbar';
    nav.dataset.ckDoctorNav = mode;
    nav.setAttribute('aria-label', mode === 'summary' ? 'Navigimi i përmbledhjes' : 'Navigimi i mësimit');
    nav.innerHTML = `<span>${mode === 'summary' ? 'Shko te' : 'Mëso sipas pjesës'}</span>${entries.map((entry, index) =>
      `<button type="button" data-ck-jump="${entry.id}"${index === 0 ? ' aria-current="true"' : ''}>${entry.label}</button>`
    ).join('')}`;

    if (mode === 'learn') {
      const intro = panel.querySelector('.ck-sl-learn-intro');
      intro?.insertAdjacentElement('afterend', nav);
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
        const visible = records
          .filter(record => record.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
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
    guide.innerHTML = '<strong>Si ta përsërisësh shpejt</strong><span>Lexo rendin klinik → kontrollo red flags / gabimet → provo flashcards pa parë përgjigjen.</span>';
    intro.appendChild(guide);
  }

  function enhanceFlashcards(flash) {
    if (!flash || flash.dataset.ckDoctorEnhanced === '1') return;
    flash.dataset.ckDoctorEnhanced = '1';
    const itemId = flash.dataset.itemId || '';
    const count = flashCount(flash);
    if (!itemId || !count) return;

    const state = readFlash(itemId, count);
    const known = new Set(state.known);
    const mastered = known.size;
    const remaining = Math.max(count - mastered, 0);
    const mastery = count ? Math.round((mastered / count) * 100) : 0;

    const head = flash.querySelector('.ck-sl-flash-head');
    if (head) {
      const tools = document.createElement('div');
      tools.className = 'ck-flash-session-tools';
      tools.innerHTML = `
        <div class="ck-flash-session-stats" aria-label="Progresi i mësimit">
          <span><strong>${mastered}</strong> të ditura</span>
          <span><strong>${remaining}</strong> për përsëritje</span>
        </div>
        ${mastered ? '<button type="button" data-ck-flash-reset>Rifillo</button>' : ''}`;
      head.insertAdjacentElement('afterend', tools);
    }

    const progress = flash.querySelector('.ck-sl-flash-progress');
    if (progress) {
      progress.setAttribute('aria-label', 'Kartat e mësuara');
      progress.setAttribute('aria-valuenow', String(mastery));
      progress.querySelector('span')?.setAttribute('style', `width:${mastery}%`);
    }

    const card = flash.querySelector('.ck-sl-flashcard');
    if (card) {
      card.tabIndex = 0;
      card.setAttribute('aria-label', 'Flashcard. Mendo përgjigjen, pastaj shfaqe dhe vlerëso rikujtimin.');
      if (!card.querySelector('.ck-flash-instruction')) {
        const instruction = document.createElement('p');
        instruction.className = 'ck-flash-instruction';
        instruction.textContent = state.revealed
          ? 'Krahasoje me përgjigjen tënde dhe zgjidh sa mirë e rikujtove.'
          : 'Thuaje përgjigjen me vete para se ta shfaqësh.';
        const reveal = card.querySelector('[data-flash-reveal]');
        reveal?.insertAdjacentElement('beforebegin', instruction);
      }
    }

    const reveal = flash.querySelector('[data-flash-reveal]');
    reveal?.setAttribute('aria-keyshortcuts', 'Space');
    const repeat = flash.querySelector('[data-flash-repeat]');
    if (repeat) {
      repeat.textContent = 'Nuk e dija — përsërite';
      repeat.setAttribute('aria-keyshortcuts', '1');
    }
    const knew = flash.querySelector('[data-flash-known]');
    if (knew) {
      knew.textContent = known.has(state.index) ? 'E dija ✓' : 'E dija';
      knew.setAttribute('aria-keyshortcuts', '2');
    }

    const controls = flash.querySelector('.ck-sl-flash-controls');
    if (controls && state.revealed && !controls.querySelector('.ck-flash-rating-label')) {
      const label = document.createElement('span');
      label.className = 'ck-flash-rating-label';
      label.textContent = 'Vlerëso rikujtimin';
      controls.prepend(label);
    }

    if (remaining === 0) {
      const complete = document.createElement('div');
      complete.className = 'ck-flash-complete';
      complete.innerHTML = '<span aria-hidden="true">✓</span><div><strong>Seti u përfundua</strong><p>I ke shënuar të gjitha kartat si të ditura. Rifillo për një raund të ri aktiv.</p></div><button type="button" data-ck-flash-reset>Rifillo setin</button>';
      flash.appendChild(complete);
    } else if (mastered > 0) {
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'ck-flash-review-remaining';
      review.dataset.ckFlashRemaining = '1';
      review.textContent = `Vazhdo vetëm me ${remaining} ${remaining === 1 ? 'kartën që mbeti' : 'kartat që mbetën'}`;
      flash.appendChild(review);
    }

    flash.addEventListener('click', event => {
      const reset = event.target.closest('[data-ck-flash-reset]');
      if (reset) {
        event.preventDefault();
        event.stopImmediatePropagation();
        try { sessionStorage.removeItem(`${FLASH_KEY}${itemId}`); } catch {}
        refreshLearn();
        return;
      }

      const remainingButton = event.target.closest('[data-ck-flash-remaining]');
      if (remainingButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = nextUnknown(state.index, count, known);
        saveFlash(itemId, {...state, index: next, revealed: false});
        refreshLearn();
        return;
      }

      const repeatButton = event.target.closest('[data-flash-repeat]');
      if (repeatButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        known.delete(state.index);
        const next = nextUnknown(state.index, count, known);
        saveFlash(itemId, {...state, known: [...known], index: next, revealed: false});
        refreshLearn();
        return;
      }

      const knownButton = event.target.closest('[data-flash-known]');
      if (knownButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        known.add(state.index);
        const next = nextUnknown(state.index, count, known);
        saveFlash(itemId, {...state, known: [...known], index: next, revealed: false});
        refreshLearn();
      }
    }, true);

    flash.addEventListener('keydown', event => {
      const interactive = event.target.closest('button,a,input,textarea,select');
      if (interactive) return;
      if (event.code === 'Space') {
        event.preventDefault();
        reveal?.click();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        flash.querySelector('[data-flash-prev]:not([disabled])')?.click();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        flash.querySelector('[data-flash-next]:not([disabled])')?.click();
      } else if (event.key === '1' && state.revealed) {
        event.preventDefault();
        repeat?.click();
      } else if (event.key === '2' && state.revealed) {
        event.preventDefault();
        knew?.click();
      }
    });
  }

  function addSummaryGuide(panel) {
    if (!panel || panel.querySelector('.ck-doctor-summary-guide')) return;
    const nav = panel.querySelector('[data-ck-doctor-nav="summary"]');
    if (!nav) return;
    const guide = document.createElement('p');
    guide.className = 'ck-doctor-summary-guide';
    guide.textContent = 'Në urgjencë: nis te “Tani”, ndiq hapat me radhë dhe kontrollo “Mos bëj” / transferimin para se ta mbyllësh protokollin.';
    nav.insertAdjacentElement('afterend', guide);
  }

  function enhance() {
    const summary = detail.querySelector('[data-ck-sl-panel="summary"]');
    const learn = detail.querySelector('[data-ck-sl-panel="learn"]');
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