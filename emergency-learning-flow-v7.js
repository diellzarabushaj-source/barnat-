(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const media = window.matchMedia?.('(max-width: 760px)');
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const modeLabels = {
    summary: {desktop: 'Përmbledhje', mobile: 'Përmbledhje', aria: 'Përmbledhje e protokollit'},
    learn: {desktop: 'Mëso hap pas hapi', mobile: 'Mëso', aria: 'Mëso protokollin hap pas hapi'},
    test: {desktop: 'Testo veten', mobile: 'Testo', aria: 'Testo veten me flashcards'},
  };

  function modeButton(mode) {
    return detail.querySelector(`.ck-mode-toggle [data-ck-mode="${mode}"]`);
  }

  function panel(mode) {
    return detail.querySelector(`[data-ck-sl-panel="${mode}"]`);
  }

  function updateModeLabels() {
    const compact = Boolean(media?.matches);
    Object.entries(modeLabels).forEach(([mode, labels]) => {
      const button = modeButton(mode);
      if (!button) return;
      const label = compact ? labels.mobile : labels.desktop;
      if (button.textContent !== label) button.textContent = label;
      if (button.getAttribute('aria-label') !== labels.aria) button.setAttribute('aria-label', labels.aria);
      if (button.dataset.ckV7Label !== '1') button.dataset.ckV7Label = '1';
    });
  }

  function syncNavContext(nav) {
    const buttons = [...nav.querySelectorAll('[data-ck-jump]')];
    const context = nav.previousElementSibling?.classList?.contains('ck-v3-nav-context')
      ? nav.previousElementSibling
      : null;
    if (!context || !buttons.length) return;
    const current = buttons.find(button => button.getAttribute('aria-current') === 'true') || buttons[0];
    const index = Math.max(buttons.indexOf(current), 0);
    const strong = context.querySelector('strong');
    const small = context.querySelector('small');
    const label = current.textContent?.trim() || 'Seksioni';
    const counter = `${index + 1} / ${buttons.length}`;
    const progress = `${Math.round(((index + 1) / buttons.length) * 100)}%`;
    if (strong && strong.textContent !== label) strong.textContent = label;
    if (small && small.textContent !== counter) small.textContent = counter;
    if (context.style.getPropertyValue('--ck-v3-progress') !== progress) {
      context.style.setProperty('--ck-v3-progress', progress);
    }
  }

  function fixLearnJumpbar() {
    const nav = detail.querySelector('[data-ck-doctor-nav="learn"]');
    const test = panel('test');
    if (!nav || !test) return;

    [...nav.querySelectorAll('[data-ck-jump]')].forEach(button => {
      const target = document.getElementById(button.dataset.ckJump || '');
      const label = button.textContent?.trim().toLocaleLowerCase('sq') || '';
      if (label === 'flashcards' || (target && test.contains(target))) button.remove();
    });

    if (nav.dataset.ckV7Clean !== '1') nav.dataset.ckV7Clean = '1';
    syncNavContext(nav);
  }

  function activateMode(mode, focusSelector) {
    const button = modeButton(mode);
    if (!button) return;
    button.click();
    requestAnimationFrame(() => {
      const targetPanel = panel(mode);
      targetPanel?.scrollIntoView({behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start'});
      const focus = focusSelector ? targetPanel?.querySelector(focusSelector) : targetPanel?.querySelector('h3,button,[tabindex]');
      if (focus instanceof HTMLElement) {
        if (!focus.matches('button,input,select,textarea,a,[tabindex]')) focus.tabIndex = -1;
        focus.focus({preventScroll: true});
      }
    });
  }

  function addFlowCta(sourceMode, targetMode, eyebrow, title, description, buttonText) {
    const source = panel(sourceMode);
    if (!source || source.querySelector(`[data-ck-v7-next="${targetMode}"]`)) return;

    const wrap = document.createElement('section');
    wrap.className = 'ck-v7-next-step';
    wrap.dataset.ckV7Next = targetMode;
    wrap.innerHTML = `
      <div>
        <span>${eyebrow}</span>
        <strong>${title}</strong>
        <p>${description}</p>
      </div>
      <button type="button">${buttonText}<span aria-hidden="true">→</span></button>`;
    wrap.querySelector('button')?.addEventListener('click', () => {
      activateMode(targetMode, targetMode === 'test' ? '[data-flash-reveal]' : '.ck-sl-lesson-block h3');
    });
    source.appendChild(wrap);
  }

  function addFlowCtas() {
    if (!modeButton('test') || !panel('test')) return;
    addFlowCta(
      'summary',
      'learn',
      'HAPI TJETËR',
      'Kuptoje arsyetimin',
      'Kur situata është stabilizuar, kalo te rendi klinik, red flags dhe gabimet që duhen shmangur.',
      'Vazhdo te Mëso',
    );
    addFlowCta(
      'learn',
      'test',
      'RIKUJTIM AKTIV',
      'Kontrollo çfarë të ka mbetur',
      'Mbylle protokollin me një raund të shkurtër flashcards dhe përsërit vetëm pikat që nuk i rikujton.',
      'Testo veten',
    );
  }

  function enhanceRatingShortcuts() {
    const test = panel('test');
    const flash = test?.querySelector('[data-ck-sl-flashcards]');
    if (!flash) return;

    const repeat = flash.querySelector('[data-flash-repeat]');
    const hard = flash.querySelector('[data-ck-rating="hard"]');
    const good = flash.querySelector('[data-flash-known]');
    const easy = flash.querySelector('[data-ck-rating="easy"]');
    const entries = [
      [repeat, '1', 'Përsërite'],
      [hard, '2', 'Vështirë'],
      [good, '3', 'E di'],
      [easy, '4', 'Shumë e lehtë'],
    ];

    entries.forEach(([button, key, label]) => {
      if (!button) return;
      if (button.getAttribute('aria-keyshortcuts') !== key) button.setAttribute('aria-keyshortcuts', key);
      const title = `${label} · tasti ${key}`;
      if (button.getAttribute('title') !== title) button.setAttribute('title', title);
    });

    const recall = flash.querySelector('.ck-sl-recall');
    if (recall && !flash.querySelector('.ck-v7-shortcuts')) {
      const hint = document.createElement('p');
      hint.className = 'ck-v7-shortcuts';
      hint.setAttribute('aria-hidden', 'true');
      hint.innerHTML = '<kbd>1</kbd> Përsërite <span>·</span> <kbd>2</kbd> Vështirë <span>·</span> <kbd>3</kbd> E di <span>·</span> <kbd>4</kbd> Shumë e lehtë';
      recall.insertAdjacentElement('afterend', hint);
    }
  }

  function enhance() {
    updateModeLabels();
    fixLearnJumpbar();
    addFlowCtas();
    enhanceRatingShortcuts();
  }

  detail.addEventListener('keydown', event => {
    if (!panel('test') || detail.dataset.ckLearningMode !== 'test') return;
    if (event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (!['1', '2', '3', '4'].includes(event.key)) return;

    const flash = event.target.closest?.('[data-ck-sl-flashcards]') || panel('test')?.querySelector('[data-ck-sl-flashcards]');
    if (!flash) return;
    const selector = event.key === '1' ? '[data-flash-repeat]'
      : event.key === '2' ? '[data-ck-rating="hard"]'
      : event.key === '3' ? '[data-flash-known]'
      : '[data-ck-rating="easy"]';
    const button = flash.querySelector(selector);
    if (!button || button.disabled) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    button.click();
  }, true);

  media?.addEventListener?.('change', updateModeLabels);

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.addedNodes.length || mutation.type === 'attributes')) schedule();
  });
  observer.observe(detail, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-ck-learning-mode']});

  schedule();
  window.setTimeout(schedule, 220);
})();