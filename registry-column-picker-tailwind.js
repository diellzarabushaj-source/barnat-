(() => {
  'use strict';

  const VERSION = 'column-picker-tailwind-20260805-2';
  const PANEL_ID = 'colPanel';
  const BUTTON_ID = 'colPickerBtn';
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>';
  const COLUMNS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16M15 4v16"></path></svg>';
  const CHECKS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 2 2 4-4"></path><path d="m4 14 2 2 4-4"></path><path d="M13 7h7M13 14h7"></path></svg>';
  const CLEAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"></path></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3 3 7-7"></path></svg>';

  let observer = null;
  let enhancing = false;
  let enhanceFrame = 0;

  const panel = () => document.getElementById(PANEL_ID);
  const button = () => document.getElementById(BUTTON_ID);
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function directColumnLabels(root = panel()) {
    return root ? [...root.querySelectorAll(':scope > label:not([data-mi-column-picker-chrome])')] : [];
  }

  function allColumnLabels(root = panel()) {
    if (!root) return [];
    return [
      ...directColumnLabels(root),
      ...root.querySelectorAll('.registry-dosage-picker-group > label'),
    ];
  }

  function allColumnInputs(root = panel()) {
    return allColumnLabels(root)
      .map(label => label.querySelector('input[type="checkbox"]'))
      .filter(Boolean);
  }

  function makeHeader() {
    const header = document.createElement('div');
    header.className = 'mi-column-picker-head';
    header.dataset.miColumnPickerChrome = 'header';
    header.innerHTML = `
      <span class="mi-column-picker-head-icon">${COLUMNS_ICON}</span>
      <span>
        <strong class="mi-column-picker-title">Zgjidh kolonat</strong>
        <span class="mi-column-picker-subtitle">Personalizo tabelën pa humbur të dhënat.</span>
      </span>
      <span class="mi-column-picker-count" aria-live="polite">0 / 0</span>`;
    return header;
  }

  function makeSearch() {
    const wrapper = document.createElement('div');
    wrapper.className = 'mi-column-picker-search';
    wrapper.dataset.miColumnPickerChrome = 'search';
    wrapper.innerHTML = `
      <span class="mi-column-picker-search-icon">${SEARCH_ICON}</span>
      <input type="search" autocomplete="off" spellcheck="false" placeholder="Kërko kolonën…" aria-label="Kërko kolonën">
    `;
    wrapper.querySelector('input').addEventListener('input', event => applyFilter(event.currentTarget.value));
    return wrapper;
  }

  function makeFooter() {
    const footer = document.createElement('div');
    footer.className = 'mi-column-picker-footer';
    footer.dataset.miColumnPickerChrome = 'footer';
    footer.innerHTML = `
      <span class="mi-column-picker-footer-status" aria-live="polite">0 kolona aktive</span>
      <button type="button" class="mi-column-picker-close">${CLOSE_ICON}<span>Ruaj dhe mbyll</span></button>`;
    footer.querySelector('.mi-column-picker-close').addEventListener('click', () => closePanel({ restoreFocus:true }));
    return footer;
  }

  function makeEmptyState() {
    const empty = document.createElement('div');
    empty.className = 'mi-column-picker-empty';
    empty.dataset.miColumnPickerChrome = 'empty';
    empty.hidden = true;
    empty.textContent = 'Nuk u gjet asnjë kolonë me këtë kërkim.';
    return empty;
  }

  function decorateActions(root) {
    const actions = root.querySelector(':scope > .col-panel-actions');
    if (!actions) return;
    const [showAll, hideAll] = actions.querySelectorAll('button');
    if (showAll && showAll.dataset.miColumnAction !== 'all') {
      showAll.dataset.miColumnAction = 'all';
      showAll.innerHTML = `${CHECKS_ICON}<span>Shfaqi të gjitha</span>`;
      showAll.setAttribute('aria-label', 'Shfaq të gjitha kolonat');
    }
    if (hideAll && hideAll.dataset.miColumnAction !== 'none') {
      hideAll.dataset.miColumnAction = 'none';
      hideAll.innerHTML = `${CLEAR_ICON}<span>Fshihi të gjitha</span>`;
      hideAll.setAttribute('aria-label', 'Fshih kolonat jo të domosdoshme');
    }
  }

  function updateSelection(root = panel()) {
    if (!root) return;
    const inputs = allColumnInputs(root);
    const selected = inputs.filter(input => input.checked).length;
    root.querySelector('.mi-column-picker-count')?.replaceChildren(document.createTextNode(`${selected} / ${inputs.length}`));
    root.querySelector('.mi-column-picker-footer-status')?.replaceChildren(
      document.createTextNode(`${selected} nga ${inputs.length} kolona aktive`),
    );
    const trigger = button();
    trigger?.setAttribute('aria-label', `Zgjidh kolonat. ${selected} nga ${inputs.length} aktive.`);
    root.dataset.miSelectedColumns = String(selected);
    root.dataset.miTotalColumns = String(inputs.length);
  }

  function applyFilter(value) {
    const root = panel();
    if (!root) return;
    const term = clean(value).toLocaleLowerCase('sq');
    let visibleCount = 0;

    directColumnLabels(root).forEach(label => {
      const visible = !term || clean(label.textContent).toLocaleLowerCase('sq').includes(term);
      label.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    const dosageGroup = root.querySelector('.registry-dosage-picker-group');
    if (dosageGroup) {
      let dosageVisible = 0;
      dosageGroup.querySelectorAll(':scope > label').forEach(label => {
        const haystack = `dozimi ${clean(label.textContent)}`.toLocaleLowerCase('sq');
        const visible = !term || haystack.includes(term);
        label.hidden = !visible;
        if (visible) dosageVisible += 1;
      });
      const headingMatch = !term || 'dozimi'.includes(term);
      dosageGroup.hidden = dosageVisible === 0 && !headingMatch;
      if (!dosageGroup.hidden) visibleCount += dosageVisible || 1;
    }

    const empty = root.querySelector('.mi-column-picker-empty');
    if (empty) empty.hidden = visibleCount > 0;
  }

  function keepPanelInsideViewport(root) {
    if (!root || !root.classList.contains('open')) return;
    root.style.setProperty('--mi-column-picker-shift-x', '0px');
    if (window.matchMedia('(max-width: 640px)').matches) return;
    requestAnimationFrame(() => {
      if (!root.classList.contains('open')) return;
      const rect = root.getBoundingClientRect();
      const margin = 12;
      let shift = 0;
      if (rect.left < margin) shift = margin - rect.left;
      else if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
      root.style.setProperty('--mi-column-picker-shift-x', `${Math.round(shift)}px`);
    });
  }
  function syncOpenState() {
    const root = panel();
    const trigger = button();
    if (!root || !trigger) return;
    const open = root.classList.contains('open');
    trigger.setAttribute('aria-expanded', String(open));
    root.setAttribute('aria-hidden', String(!open));
    document.body?.classList.toggle('mi-column-picker-open', open);
    if (open) {
      keepPanelInsideViewport(root);
      updateSelection(root);
      const search = root.querySelector('.mi-column-picker-search input');
      if (search && window.matchMedia('(max-width: 640px)').matches) {
        requestAnimationFrame(() => search.focus({ preventScroll:true }));
      }
    } else {
      root.style.removeProperty('--mi-column-picker-shift-x');
    }
  }

  function closePanel({ restoreFocus = false } = {}) {
    const root = panel();
    if (!root) return;
    const wasOpen = root.classList.contains('open');
    root.classList.remove('open');
    syncOpenState();
    if (restoreFocus && wasOpen) button()?.focus({ preventScroll:true });
  }

  function enhance() {
    const root = panel();
    const trigger = button();
    if (!root || !trigger || enhancing) return;
    enhancing = true;
    observer?.disconnect();
    try {
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', PANEL_ID);
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', 'Zgjedhja e kolonave të regjistrit');

      if (!root.querySelector('[data-mi-column-picker-chrome="header"]')) root.prepend(makeHeader());
      const header = root.querySelector('[data-mi-column-picker-chrome="header"]');
      if (!root.querySelector('[data-mi-column-picker-chrome="search"]')) header?.insertAdjacentElement('afterend', makeSearch());
      if (!root.querySelector('[data-mi-column-picker-chrome="empty"]')) root.appendChild(makeEmptyState());
      if (!root.querySelector('[data-mi-column-picker-chrome="footer"]')) root.appendChild(makeFooter());

      decorateActions(root);
      allColumnLabels(root).forEach(label => {
        label.dataset.miColumnOption = '1';
        const input = label.querySelector('input[type="checkbox"]');
        if (input && !input.getAttribute('aria-label')) input.setAttribute('aria-label', clean(label.textContent));
      });
      updateSelection(root);
      applyFilter(root.querySelector('.mi-column-picker-search input')?.value || '');
      syncOpenState();
      root.dataset.miColumnPicker = VERSION;
      document.documentElement.dataset.miColumnPicker = VERSION;
    } finally {
      enhancing = false;
      observe();
    }
  }

  function scheduleEnhance() {
    if (enhanceFrame) return;
    enhanceFrame = requestAnimationFrame(() => {
      enhanceFrame = 0;
      enhance();
    });
  }

  function observe() {
    const root = panel();
    if (!root) return;
    if (!observer) {
      observer = new MutationObserver(mutations => {
        const classChanged = mutations.some(mutation => mutation.type === 'attributes' && mutation.attributeName === 'class');
        if (classChanged) syncOpenState();
        if (mutations.some(mutation => mutation.type === 'childList')) scheduleEnhance();
      });
    }
    observer.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  }

  function init() {
    document.addEventListener('click', event => {
      if (event.target.closest?.(`#${BUTTON_ID}`)) requestAnimationFrame(() => { scheduleEnhance(); syncOpenState(); });
      if (event.target.closest?.(`#${PANEL_ID} input[type="checkbox"], #${PANEL_ID} .col-panel-actions button`)) {
        requestAnimationFrame(() => { scheduleEnhance(); updateSelection(); });
      }
    });
    document.addEventListener('change', event => {
      if (event.target.matches?.(`#${PANEL_ID} input[type="checkbox"]`)) requestAnimationFrame(() => updateSelection());
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel()?.classList.contains('open')) {
        event.preventDefault();
        closePanel({ restoreFocus:true });
      }
    }, true);
    window.addEventListener('resize', syncOpenState, { passive:true });
    window.addEventListener('pageshow', scheduleEnhance, { passive:true });
    scheduleEnhance();
    setTimeout(scheduleEnhance, 600);
    setTimeout(scheduleEnhance, 1800);
  }

  window.MedIndexColumnPicker = {
    version:VERSION,
    refresh:scheduleEnhance,
    close:closePanel,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
