(() => {
  'use strict';

  const search = document.getElementById('emergencySearch');
  const host = document.getElementById('emergencySmartResults');
  const list = document.getElementById('emergencyList');
  const detail = document.getElementById('emergencyDetail');
  const engine = window.MedIndexEmergencyActionSearchV12;
  if (!search || !host || !list || !detail || !engine?.buildEntries || !engine?.searchPrepared) return;

  const MAX_ACTION_RESULTS = 3;
  let indexedSource = null;
  let prepared = [];
  let latest = [];
  let frame = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const normalize = value => engine.normalize(value);

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function preparedEntries() {
    const source = items();
    if (source !== indexedSource) {
      indexedSource = source;
      prepared = engine.buildEntries(source);
    }
    return prepared;
  }

  function trimPreview(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    return value.length > 170 ? `${value.slice(0, 167).trim()}…` : value;
  }

  function rowMarkup(result, index) {
    const item = result.item || {};
    const meta = [
      'Verifikuar',
      result.version ? `v${result.version}` : '',
      `${result.sourceCount} ${result.sourceCount === 1 ? 'burim' : 'burime'}`,
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="ck-v12-action-row" data-ck-v12-action="${esc(result.id)}" data-ck-v12-index="${index}">
      <span class="ck-v12-action-main">
        <span class="ck-v12-action-eyebrow">${esc(result.label)} · ${esc(item.title || 'Urgjencë')}</span>
        <strong>${esc(result.heading || result.label)}</strong>
        <span>${esc(trimPreview(result.text))}</span>
        <small>${esc(meta)} · tekst nga protokolli</small>
      </span>
      <b>Hap te ky hap <span aria-hidden="true">→</span></b>
    </button>`;
  }

  function render() {
    host.querySelector('[data-ck-v12-actions]')?.remove();
    latest = [];
    const query = search.value.trim();
    if (!query || host.hidden) return;
    latest = engine.searchPrepared(preparedEntries(), query, {limit:MAX_ACTION_RESULTS});
    if (!latest.length) return;

    const section = document.createElement('section');
    section.className = 'ck-v12-actions';
    section.dataset.ckV12Actions = '1';
    section.setAttribute('aria-label', 'Hapat e verifikuar që përputhen me kërkimin');
    section.innerHTML = `
      <div class="ck-v12-actions-head">
        <div><span>HAP DIREKT</span><strong>Në protokollin e verifikuar</strong></div>
        <small>Jo gjenerim AI</small>
      </div>
      ${latest.map(rowMarkup).join('')}`;

    const head = host.querySelector('.ck-v8-head');
    if (head) head.insertAdjacentElement('afterend', section);
    else host.prepend(section);
  }

  function scheduleRender() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => requestAnimationFrame(render));
  }

  function textCandidates(result) {
    if (result.kind === 'primary') return [...detail.querySelectorAll('[data-ck-sl-panel="summary"] .ck-sl-step,[data-ck-sl-panel="summary"] .ck-sl-therapy')];
    if (result.kind === 'doNotDo') return [...detail.querySelectorAll('[data-ck-sl-panel="summary"] .ck-sl-dont li,[data-ck-sl-panel="learn"] .ck-sl-lesson-list li')];
    if (result.kind === 'redFlag') return [...detail.querySelectorAll('[data-ck-sl-panel="learn"] .ck-sl-lesson-list li,.ck-v4-cockpit .is-alert')];
    if (result.kind === 'secondary') return [...detail.querySelectorAll('[data-ck-sl-panel="learn"] .ck-sl-lesson-step')];
    if (result.kind === 'referral') return [...detail.querySelectorAll('[data-ck-sl-panel="summary"] .ck-sl-transfer,[data-ck-sl-panel="learn"] .ck-sl-referral-grid>div,[data-ck-sl-panel="learn"] .ck-sl-lesson-list li')];
    return [];
  }

  function bestTarget(result) {
    const needle = normalize(result.text);
    if (!needle) return null;
    const prefix = needle.slice(0, Math.min(72, needle.length));
    const candidates = textCandidates(result);
    return candidates.find(node => normalize(node.textContent || '').includes(prefix))
      || candidates.find(node => {
        const text = normalize(node.textContent || '');
        return result.matchedTerms?.some(term => text.includes(normalize(term)));
      })
      || null;
  }

  function showTarget(node) {
    if (!(node instanceof HTMLElement)) return;
    node.classList.add('ck-v12-jump-highlight');
    node.scrollIntoView({behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth', block:'center'});
    window.setTimeout(() => node.classList.remove('ck-v12-jump-highlight'), 2600);
  }

  function jumpWhenReady(result, attempt = 0) {
    const activeId = list.querySelector('.ck-list-button.is-active[data-id]')?.dataset.id || '';
    if (String(activeId) !== String(result.itemId)) {
      if (attempt < 12) window.setTimeout(() => jumpWhenReady(result, attempt + 1), 45);
      return;
    }

    const mode = result.mode === 'learn' ? 'learn' : 'summary';
    const modeButton = detail.querySelector(`.ck-mode-toggle [data-ck-mode="${mode}"]`);
    if (modeButton && detail.dataset.ckLearningMode !== mode) modeButton.click();

    requestAnimationFrame(() => {
      const target = bestTarget(result);
      if (target) {
        showTarget(target);
        return;
      }
      if (attempt < 12) window.setTimeout(() => jumpWhenReady(result, attempt + 1), 55);
      else detail.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }

  function openAction(result) {
    if (!result?.itemId) return;
    search.value = result.item?.title || '';
    search.dispatchEvent(new Event('input', {bubbles:true}));
    const open = () => {
      const button = list.querySelector(`.ck-list-button[data-id="${CSS.escape(result.itemId)}"]`);
      if (!button) return false;
      button.click();
      jumpWhenReady(result);
      return true;
    };
    if (!open()) window.setTimeout(open, 70);
  }

  host.addEventListener('click', event => {
    const button = event.target.closest('[data-ck-v12-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const result = latest[Number(button.dataset.ckV12Index || 0)];
    if (result) openAction(result);
  });

  search.addEventListener('input', scheduleRender, {capture:true});
  search.addEventListener('focus', scheduleRender);
  window.setTimeout(scheduleRender, 260);
})();