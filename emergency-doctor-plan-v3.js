(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  const search = document.getElementById('emergencySearch');
  if (!detail) return;

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const isTyping = target => Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
  const text = (root, selector) => root?.querySelector(selector)?.textContent?.trim() || '';

  function currentItem() {
    const items = Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
    const activeId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id;
    if (activeId) {
      const match = items.find(item => String(item?._id || '') === String(activeId));
      if (match) return match;
    }
    const title = text(detail, '.ck-detail-head h2');
    return title ? items.find(item => item?.title === title) || null : null;
  }

  function short(value, max = 150) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }

  function scrollToNode(node) {
    if (!node) return;
    node.scrollIntoView({behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start'});
  }

  function clickMode(mode) {
    const button = detail.querySelector(`[data-ck-mode="${mode}"]`);
    if (!button) return false;
    button.click();
    return true;
  }

  function jumpAfterLearn(label) {
    const go = () => {
      const learn = detail.querySelector('[data-ck-sl-panel="learn"]');
      if (!learn) return false;
      const button = [...learn.querySelectorAll('[data-ck-jump]')]
        .find(item => item.textContent?.trim() === label);
      if (button) {
        button.click();
        return true;
      }
      if (label === 'Flashcards') {
        const flash = learn.querySelector('[data-ck-sl-flashcards]');
        if (flash) {
          scrollToNode(flash);
          flash.querySelector('[data-flash-card]')?.focus({preventScroll: true});
          return true;
        }
      }
      return false;
    };

    if (go()) return;
    clickMode('learn');
    requestAnimationFrame(() => requestAnimationFrame(go));
  }

  function metric(label, value, action = '') {
    const tag = action ? 'button' : 'div';
    const actionAttr = action ? ` type="button" data-ck-scan-action="${action}"` : '';
    return `<${tag} class="ck-doctor-scan-metric"${actionAttr}><span>${label}</span><strong>${value}</strong></${tag}>`;
  }

  function installClinicalScan() {
    const summary = detail.querySelector('[data-ck-sl-panel="summary"]');
    if (!summary || summary.querySelector('[data-ck-doctor-scan]')) return;

    const item = currentItem();
    const therapy = summary.querySelector('.ck-sl-therapy');
    const firstTitle = text(therapy, '.ck-sl-therapy-copy h3') || 'Veprimi i parë';
    const firstAction = text(therapy, '.ck-sl-therapy-copy p');
    const steps = Array.isArray(item?.primaryCareSteps)
      ? item.primaryCareSteps.length
      : summary.querySelectorAll('.ck-sl-step').length;
    const redFlags = Array.isArray(item?.redFlags) ? item.redFlags.length : 0;
    const doNotDo = Array.isArray(item?.doNotDo) ? item.doNotDo.length : summary.querySelectorAll('.ck-sl-dont li').length;
    const hasTransfer = Boolean(
      item?.referral?.when || item?.referral?.destination || item?.referral?.handover || summary.querySelector('.ck-sl-transfer')
    );

    const scan = document.createElement('section');
    scan.className = 'ck-doctor-scan';
    scan.dataset.ckDoctorScan = '1';
    scan.setAttribute('aria-label', 'Orientimi i shpejtë klinik');
    scan.innerHTML = `
      <div class="ck-doctor-scan-main">
        <span>TANI · ORIENTIM 5–10 SEKONDA</span>
        <strong>${firstTitle}</strong>
        ${firstAction ? `<p>${short(firstAction)}</p>` : ''}
      </div>
      <div class="ck-doctor-scan-metrics">
        ${metric('Hapa', String(steps), 'steps')}
        ${metric('Red flags', String(redFlags), redFlags ? 'redflags' : '')}
        ${metric('Mos bëj', String(doNotDo), doNotDo ? 'dont' : '')}
        ${metric('Transferim', hasTransfer ? 'Po' : '—', hasTransfer ? 'transfer' : '')}
      </div>`;

    const nav = summary.querySelector('[data-ck-doctor-nav="summary"]');
    if (nav) nav.insertAdjacentElement('afterend', scan);
    else summary.prepend(scan);

    scan.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-scan-action]');
      if (!button) return;
      const action = button.dataset.ckScanAction;
      if (action === 'steps') {
        const target = summary.querySelector('.ck-sl-section-heading') || summary.querySelector('.ck-sl-step-list');
        scrollToNode(target);
      } else if (action === 'dont') {
        scrollToNode(summary.querySelector('.ck-sl-dont'));
      } else if (action === 'transfer') {
        scrollToNode(summary.querySelector('.ck-sl-transfer'));
      } else if (action === 'redflags') {
        jumpAfterLearn('Red flags');
      }
    });
  }

  function installSearchHint() {
    const toolbar = document.querySelector('.ck-toolbar');
    if (!toolbar || toolbar.querySelector('[data-ck-search-hint]')) return;
    const hint = document.createElement('span');
    hint.className = 'ck-doctor-search-hint';
    hint.dataset.ckSearchHint = '1';
    hint.innerHTML = '<kbd>/</kbd><span>Kërko</span>';
    toolbar.appendChild(hint);
  }

  function installShortcutLegend() {
    const head = detail.querySelector('.ck-detail-head');
    if (!head || head.querySelector('[data-ck-doctor-shortcuts]')) return;
    const legend = document.createElement('div');
    legend.className = 'ck-doctor-shortcuts';
    legend.dataset.ckDoctorShortcuts = '1';
    legend.setAttribute('aria-label', 'Shortcut-et e navigimit');
    legend.innerHTML = '<span><kbd>S</kbd> Përmbledhje</span><span><kbd>M</kbd> Mëso</span><span><kbd>F</kbd> Flashcards</span>';
    head.appendChild(legend);
  }

  function rememberFlashAnchor(event) {
    const flash = event.target.closest?.('[data-ck-sl-flashcards]');
    if (!flash) return;
    if (!event.target.closest?.('[data-flash-reveal],[data-flash-prev],[data-flash-next],[data-flash-repeat],[data-flash-known],[data-ck-flash-reset],[data-ck-flash-remaining]')) return;
    const rect = flash.getBoundingClientRect();
    window.__ckEmergencyFlashAnchor = {
      itemId: flash.dataset.itemId || '',
      top: rect.top,
      at: Date.now(),
    };
  }

  function restoreFlashAnchor() {
    const anchor = window.__ckEmergencyFlashAnchor;
    if (!anchor || Date.now() - anchor.at > 1500) return;
    const flash = [...detail.querySelectorAll('[data-ck-sl-flashcards]')]
      .find(node => (node.dataset.itemId || '') === anchor.itemId);
    if (!flash) return;
    const delta = flash.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) window.scrollBy({top: delta, behavior: 'auto'});
    window.__ckEmergencyFlashAnchor = null;
  }

  function enhanceFlashcardTouch() {
    const flash = detail.querySelector('[data-ck-sl-panel="learn"] [data-ck-sl-flashcards]');
    if (!flash || flash.dataset.ckPlanV3 === '1') return;
    flash.dataset.ckPlanV3 = '1';
    flash.addEventListener('click', event => {
      if (event.target.closest('button,a,input,textarea,select')) return;
      const card = event.target.closest('[data-flash-card]');
      if (!card || card.classList.contains('is-revealed')) return;
      const selection = window.getSelection?.()?.toString()?.trim();
      if (selection) return;
      rememberFlashAnchor({target: flash.querySelector('[data-flash-reveal]') || event.target});
      flash.querySelector('[data-flash-reveal]')?.click();
    });

    const card = flash.querySelector('[data-flash-card]');
    card?.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.target.closest('button,a,input,textarea,select')) return;
      const reveal = flash.querySelector('[data-flash-reveal]');
      if (!reveal) return;
      event.preventDefault();
      reveal.click();
    });
  }

  function enhance() {
    installClinicalScan();
    installSearchHint();
    installShortcutLegend();
    enhanceFlashcardTouch();
    restoreFlashAnchor();
  }

  detail.addEventListener('click', rememberFlashAnchor, true);

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event.target)) {
      if (event.key === 'Escape' && event.target === search && search?.value) {
        event.preventDefault();
        search.value = '';
        search.dispatchEvent(new Event('input', {bubbles: true}));
      }
      return;
    }

    if (event.key === '/') {
      if (!search) return;
      event.preventDefault();
      search.focus({preventScroll: false});
      search.select?.();
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      clickMode('summary');
    } else if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      clickMode('learn');
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      jumpAfterLearn('Flashcards');
    }
  });

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };

  const observer = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('.ck-detail-head,.ck-sl-experience,[data-ck-sl-panel],[data-ck-sl-flashcards]')
        || node.querySelector?.('.ck-detail-head,.ck-sl-experience,[data-ck-sl-panel],[data-ck-sl-flashcards]')
      )
    ));
    if (relevant) schedule();
  });

  observer.observe(detail, {childList: true, subtree: true});
  schedule();
  window.setTimeout(schedule, 150);
})();
