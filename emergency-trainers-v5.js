(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const META_KEY = 'medindex_emergency_flashcards_v3meta:';
  const SCHEDULE_KEY = 'medindex_emergency_flashcards_v4schedule:';
  const DOSE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:mg\/kg|mcg\/kg|µg\/kg|mg|mcg|µg|g|mL|ml|mmol|IU|UI|units?|njësi|%)\b/gi;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function currentItem() {
    const items = Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
    const activeId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id || '';
    return items.find(item => String(item?._id || '') === String(activeId)) || null;
  }

  function readJson(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function flashCount(panel) {
    const text = panel?.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = text.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function smartReview(itemId, count) {
    if (!itemId || !count) return;
    const state = readJson(sessionStorage, `${FLASH_KEY}${itemId}`, {index:0, known:[], revealed:false});
    const meta = readJson(sessionStorage, `${META_KEY}${itemId}`, {misses:{}});
    const schedule = readJson(localStorage, `${SCHEDULE_KEY}${itemId}`, {});
    const now = Date.now();
    const known = new Set(Array.isArray(state.known) ? state.known : []);
    const candidates = [];

    for (let index = 0; index < count; index += 1) {
      const dueAt = Number(schedule?.[index]?.dueAt || 0);
      const misses = Number(meta?.misses?.[index] || 0);
      const due = !dueAt || dueAt <= now;
      const learned = known.has(index);
      candidates.push({index, misses, due, learned});
    }

    candidates.sort((a, b) =>
      Number(b.due) - Number(a.due)
      || b.misses - a.misses
      || Number(a.learned) - Number(b.learned)
      || a.index - b.index
    );
    const target = candidates[0]?.index ?? 0;
    try {
      sessionStorage.setItem(`${FLASH_KEY}${itemId}`, JSON.stringify({...state, index:target, revealed:false}));
    } catch {}

    detail.querySelector('[data-ck-mode="learn"]')?.click();
    requestAnimationFrame(() => detail.querySelector('[data-ck-mode="test"]')?.click());
  }

  function firstClinicalStep(item) {
    const primary = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    return primary[0] || null;
  }

  function doseSteps(item) {
    const steps = [
      ...(Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : []),
      ...(Array.isArray(item?.secondaryCareSteps) ? item.secondaryCareSteps : []),
    ];
    return steps.filter(step => {
      const text = String(step?.action || '');
      DOSE_PATTERN.lastIndex = 0;
      return DOSE_PATTERN.test(text);
    });
  }

  function maskedDoseText(text) {
    DOSE_PATTERN.lastIndex = 0;
    return String(text || '').replace(DOSE_PATTERN, '____');
  }

  function trainerMarkup(item) {
    const first = firstClinicalStep(item);
    const doses = doseSteps(item);
    const doseStep = doses[0] || null;
    const version = item?.version ? `v${item.version}` : 'version pa shënuar';

    return `<section class="ck-v5-trainers" aria-label="Ushtrime klinike të protokollit">
      <div class="ck-v5-trainers-head">
        <div><span>PRAKTIKË</span><h3>Ushtroje si në situatë klinike</h3></div>
        <small>Vetëm nga protokolli · ${esc(version)}</small>
      </div>
      <div class="ck-v5-trainer-grid">
        ${first ? `<article class="ck-v5-trainer-card is-case" data-ck-v5-case>
          <span>CASE KLINIK</span>
          <h4>Pacienti paraqitet me “${esc(item.title || 'këtë urgjencë')}”. Cili është hapi i parë sipas këtij protokolli?</h4>
          ${item?.summary ? `<p class="ck-v5-context">${esc(item.summary)}</p>` : ''}
          <div class="ck-v5-answer" hidden><small>Përgjigjja nga protokolli</small><strong>${esc(first.title || 'Hapi i parë')}</strong><p>${esc(first.action || '')}</p></div>
          <button type="button" data-ck-v5-reveal="case">Shfaq përgjigjen</button>
        </article>` : ''}
        ${doseStep ? `<article class="ck-v5-trainer-card is-dose" data-ck-v5-dose>
          <span>DOSE TRAINER</span>
          <h4>${esc(doseStep.title || 'Plotëso dozën e dokumentuar')}</h4>
          <p class="ck-v5-cloze">${esc(maskedDoseText(doseStep.action || ''))}</p>
          <div class="ck-v5-answer" hidden><small>Teksti i saktë nga protokolli</small><p>${esc(doseStep.action || '')}</p></div>
          <button type="button" data-ck-v5-reveal="dose">Shfaq tekstin e plotë</button>
        </article>` : ''}
      </div>
      ${doses.length > 1 ? `<p class="ck-v5-dose-count">${doses.length} hapa në këtë protokoll përmbajnë sasi/doza të dokumentuara.</p>` : ''}
    </section>`;
  }

  function installToolbar(panel, item) {
    const flash = panel.querySelector('[data-ck-sl-flashcards]');
    if (!flash) return;
    const itemId = flash.dataset.itemId || item?._id || '';
    const count = flashCount(panel);
    if (!itemId || !count) return;

    let toolbar = panel.querySelector('.ck-v5-session-bar');
    if (!toolbar) {
      toolbar = document.createElement('nav');
      toolbar.className = 'ck-v5-session-bar';
      toolbar.setAttribute('aria-label', 'Mënyra e përsëritjes');
      toolbar.innerHTML = `
        <span>Sesion</span>
        <button type="button" data-ck-v5-smart>Smart review</button>
        <button type="button" data-ck-v5-jump="case">Case klinik</button>
        <button type="button" data-ck-v5-jump="dose">Dozat</button>
        <button type="button" data-ck-v5-full>Mësimi i plotë</button>`;
      panel.querySelector('.ck-v4-test-head')?.insertAdjacentElement('afterend', toolbar);

      toolbar.querySelector('[data-ck-v5-smart]')?.addEventListener('click', () => smartReview(itemId, count));
      toolbar.querySelector('[data-ck-v5-full]')?.addEventListener('click', () => detail.querySelector('[data-ck-mode="learn"]')?.click());
      toolbar.querySelectorAll('[data-ck-v5-jump]').forEach(button => {
        button.addEventListener('click', () => {
          const target = panel.querySelector(button.dataset.ckV5Jump === 'dose' ? '[data-ck-v5-dose]' : '[data-ck-v5-case]');
          target?.scrollIntoView({behavior:'smooth', block:'center'});
          target?.querySelector('button')?.focus({preventScroll:true});
        });
      });
    }

    const hasCase = Boolean(firstClinicalStep(item));
    const hasDose = doseSteps(item).length > 0;
    const caseButton = toolbar.querySelector('[data-ck-v5-jump="case"]');
    const doseButton = toolbar.querySelector('[data-ck-v5-jump="dose"]');
    if (caseButton) caseButton.hidden = !hasCase;
    if (doseButton) doseButton.hidden = !hasDose;
  }

  function installTrainers(panel, item) {
    if (panel.querySelector('.ck-v5-trainers')) return;
    const markup = trainerMarkup(item);
    panel.insertAdjacentHTML('beforeend', markup);
    panel.querySelectorAll('[data-ck-v5-reveal]').forEach(button => {
      button.addEventListener('click', () => {
        const card = button.closest('.ck-v5-trainer-card');
        const answer = card?.querySelector('.ck-v5-answer');
        if (!answer) return;
        const opening = answer.hidden;
        answer.hidden = !opening;
        button.textContent = opening ? 'Fshih përgjigjen' : (button.dataset.ckV5Reveal === 'dose' ? 'Shfaq tekstin e plotë' : 'Shfaq përgjigjen');
        button.setAttribute('aria-expanded', opening ? 'true' : 'false');
      });
    });
  }

  function enhance() {
    const panel = detail.querySelector('[data-ck-sl-panel="test"]');
    const item = currentItem();
    if (!panel || !item) return;
    installToolbar(panel, item);
    installTrainers(panel, item);
  }

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('[data-ck-sl-panel="test"],[data-ck-sl-flashcards]')
        || node.querySelector?.('[data-ck-sl-panel="test"],[data-ck-sl-flashcards]')
      )
    ))) schedule();
  });
  observer.observe(detail, {childList:true, subtree:true});
  schedule();
  window.setTimeout(schedule, 240);
})();