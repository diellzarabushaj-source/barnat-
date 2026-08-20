(() => {
  'use strict';

  const VERSION = 'column-picker-tailwind-20260820-clean-columns-3';
  const PANEL_ID = 'colPanel';
  const BUTTON_ID = 'colPickerBtn';
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>';
  const COLUMNS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16M15 4v16"></path></svg>';
  const CHECKS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 2 2 4-4"></path><path d="m4 14 2 2 4-4"></path><path d="M13 7h7M13 14h7"></path></svg>';
  const CLEAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"></path></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3 3 7-7"></path></svg>';

  const COLUMN_PREFERENCE_VERSION = 'registry-column-preferences-20260820-1';
  const DESKTOP_QUERY = '(min-width: 768px)';
  const LITE_STORAGE_KEY = 'medindex.registry.desktop-columns.v20260820';
  const FULL_STORAGE_KEY = 'medindex.registry.columns.v20260820';
  const PRESCRIPTION_FULL_KEY = 'Si të shënohet në recetë';
  const DEFAULT_LITE_COLUMNS = Object.freeze([
    'number',
    'active-substance',
    'trade-name',
    'drug-class',
    'use',
    'strength',
    'form',
    'population',
    'prescription-label',
  ]);
  const LITE_TO_FULL = Object.freeze({
    number:'Nr rendor',
    'active-substance':'Substanca aktive',
    'trade-name':'Emri tregtar',
    atc:'ATC Code',
    'drug-class':'Klasa / Çka është',
    use:'Përdorimi (fjalë kyçe)',
    pdid:'PDID',
    protocol:'ProtocolNo',
    strength:'Fortësia',
    form:'Forma farmaceutike',
    population:'Popullata e aprovuar',
    'prescription-label':PRESCRIPTION_FULL_KEY,
    packaging:'Madhësia e paketimit',
    mah:'Bartësi i Autorizim Marketingut',
    manufacturer:'Prodhuesi',
    'ma-certificate':'MA certifikata',
    status:'Statusi',
    'wholesale-price':'Çmimi me shumicë',
    'margin-price':'Çmimi me marzhë',
    vat:'TVSH',
    'retail-price':'Çmimi me pakicë',
    validity:'Afati i vlefshmërisë',
  });
  const FULL_TO_LITE = Object.freeze(Object.fromEntries(
    Object.entries(LITE_TO_FULL).map(([lite, full]) => [full, lite]),
  ));
  const KNOWN_LITE_COLUMNS = new Set(Object.keys(LITE_TO_FULL));

  let observer = null;
  let enhancing = false;
  let enhanceFrame = 0;
  let preferenceApplied = false;
  let preferenceApplying = false;
  let preferenceTimer = 0;

  const panel = () => document.getElementById(PANEL_ID);
  const button = () => document.getElementById(BUTTON_ID);
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const desktop = () => window.matchMedia?.(DESKTOP_QUERY)?.matches === true;
  const liteActive = () => desktop()
    && window.MEDINDEX_DESKTOP_LITE_ACTIVE === true
    && document.documentElement.dataset.registryDesktopLiteState !== 'handoff';
  const liteColumns = () => window.MedIndexDesktopColumnLite || null;

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

  function placePopulationWithDosage(root = panel()) {
    if (!root) return false;
    const dosageGroup = root.querySelector('.registry-dosage-picker-group');
    if (!dosageGroup) return false;
    const populationLabel = allColumnLabels(root).find(label => {
      const text = clean(label.textContent).toLocaleLowerCase('sq');
      return text.includes('popullata') || (text.includes('adult') && text.includes('pediatric'));
    });
    if (!populationLabel) return false;
    populationLabel.dataset.miPopulationColumn = '1';
    populationLabel.style.gridColumn = '1 / -1';
    if (populationLabel.parentElement !== dosageGroup) dosageGroup.appendChild(populationLabel);
    return true;
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
      hideAll.setAttribute('aria-label', 'Fshih të gjitha kolonat opsionale');
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
        const population = label.dataset.miPopulationColumn === '1';
        const haystack = `${population ? 'popullata adult pediatric fëmijë të rritur' : 'dozimi'} ${clean(label.textContent)}`.toLocaleLowerCase('sq');
        const visible = !term || haystack.includes(term);
        label.hidden = !visible;
        if (visible) dosageVisible += 1;
      });
      const headingMatch = !term || 'dozimi popullata adult pediatric fëmijë të rritur'.includes(term);
      dosageGroup.hidden = dosageVisible === 0 && !headingMatch;
      if (!dosageGroup.hidden) visibleCount += dosageVisible || 1;
    }

    const empty = root.querySelector('.mi-column-picker-empty');
    if (empty) empty.hidden = visibleCount > 0;
  }

  function resetPanelPosition(root) {
    root?.style.removeProperty('left');
    root?.style.removeProperty('right');
  }

  function keepPanelInsideViewport(root) {
    if (!root || !root.classList.contains('open')) return;
    resetPanelPosition(root);
    if (window.matchMedia('(max-width: 640px)').matches) return;
    requestAnimationFrame(() => {
      if (!root.classList.contains('open')) return;
      const rect = root.getBoundingClientRect();
      const parentRect = root.offsetParent?.getBoundingClientRect() || { left:0, right:window.innerWidth };
      const margin = 12;
      if (rect.left < margin) {
        root.style.setProperty('left', `${Math.round(margin - parentRect.left)}px`, 'important');
        root.style.setProperty('right', 'auto', 'important');
      } else if (rect.right > window.innerWidth - margin) {
        root.style.setProperty('right', `${Math.round(parentRect.right - (window.innerWidth - margin))}px`, 'important');
        root.style.setProperty('left', 'auto', 'important');
      }
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
      resetPanelPosition(root);
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

  function readStoredArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? value.map(String) : null;
    } catch {
      return null;
    }
  }

  function uniqueKnownLiteColumns(keys) {
    const seen = new Set();
    return (Array.isArray(keys) ? keys : []).map(clean).filter(key => {
      if (!KNOWN_LITE_COLUMNS.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function storedColumnPreference() {
    const full = readStoredArray(FULL_STORAGE_KEY);
    if (full !== null) {
      return uniqueKnownLiteColumns(full.map(key => FULL_TO_LITE[key]).filter(Boolean));
    }
    const lite = readStoredArray(LITE_STORAGE_KEY);
    if (lite !== null) return uniqueKnownLiteColumns(lite);
    return [...DEFAULT_LITE_COLUMNS];
  }

  function writeLiteColumnPreference(keys) {
    const normalized = uniqueKnownLiteColumns(keys);
    try {
      localStorage.setItem(LITE_STORAGE_KEY, JSON.stringify(normalized));
      localStorage.setItem(
        FULL_STORAGE_KEY,
        JSON.stringify(normalized.map(key => LITE_TO_FULL[key]).filter(Boolean)),
      );
    } catch {}
    document.documentElement.dataset.registryColumnPreferences = COLUMN_PREFERENCE_VERSION;
  }

  function persistLiteColumnPreference() {
    const controller = liteColumns();
    if (!controller || !liteActive() || preferenceApplying) return;
    writeLiteColumnPreference(controller.visible?.() || []);
  }

  function applyLiteColumnPreference(keys, { persist = true } = {}) {
    const controller = liteColumns();
    if (!controller || !liteActive() || preferenceApplying) return false;
    const normalized = uniqueKnownLiteColumns(keys);
    preferenceApplying = true;
    try {
      controller.setVisible?.(normalized);
      scheduleEnhance();
      if (persist) writeLiteColumnPreference(normalized);
      document.documentElement.dataset.registryColumnPreferences = COLUMN_PREFERENCE_VERSION;
      return true;
    } finally {
      preferenceApplying = false;
    }
  }

  function applyInitialLiteColumnPreference() {
    if (preferenceApplied || !desktop()) return preferenceApplied;
    if (!liteColumns() || !liteActive()) return false;
    preferenceApplied = applyLiteColumnPreference(storedColumnPreference());
    return preferenceApplied;
  }

  function scheduleLiteColumnPreference(attempt = 0) {
    window.clearTimeout(preferenceTimer);
    if (applyInitialLiteColumnPreference() || attempt >= 80 || !desktop()) return;
    preferenceTimer = window.setTimeout(
      () => scheduleLiteColumnPreference(attempt + 1),
      Math.min(250, 40 + attempt * 4),
    );
  }

  function litePanelColumnKeys() {
    return [...document.querySelectorAll(`#${PANEL_ID} input[data-column-lite-key]`)]
      .map(input => clean(input.dataset.columnLiteKey))
      .filter(key => KNOWN_LITE_COLUMNS.has(key));
  }

  function handleLitePanelAction(event) {
    if (!liteActive()) return;
    const action = event.target.closest?.(`#${PANEL_ID} .col-panel-actions button`);
    if (!action) return;
    const label = clean(action.textContent).toLocaleLowerCase('sq');
    if (!label.includes('shfaqi') && !label.includes('fshihi')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const showAll = label.includes('shfaqi');
    applyLiteColumnPreference(showAll ? litePanelColumnKeys() : []);
    requestAnimationFrame(() => updateSelection());
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

      placePopulationWithDosage(root);
      decorateActions(root);
      // data-mi-technical-column-hidden: build marker + UX contract.
      allColumnLabels(root).forEach(label => {
        const optionText = clean(label.textContent).toLocaleLowerCase('sq');
        if (optionText === 'verifikimi' || optionText === 'redakto') {
          label.dataset.miTechnicalColumnHidden = '1';
          label.remove();
          return;
        }
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
    document.addEventListener('click', handleLitePanelAction, true);
    document.addEventListener('change', event => {
      if (!event.target.matches?.(`#${PANEL_ID} input[type="checkbox"]`)) return;
      requestAnimationFrame(() => updateSelection());
      if (event.target.dataset.columnLiteKey) queueMicrotask(persistLiteColumnPreference);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel()?.classList.contains('open')) {
        event.preventDefault();
        closePanel({ restoreFocus:true });
      }
    }, true);
    ['medindex:desktop-lite-ready', 'medindex:registry-page-ready'].forEach(name => {
      window.addEventListener(name, () => scheduleLiteColumnPreference(), { passive:true });
    });
    window.addEventListener('storage', event => {
      if (event.key !== LITE_STORAGE_KEY && event.key !== FULL_STORAGE_KEY) return;
      preferenceApplied = false;
      scheduleLiteColumnPreference();
    });
    window.addEventListener('resize', () => {
      syncOpenState();
      if (desktop()) scheduleLiteColumnPreference();
    }, { passive:true });
    window.addEventListener('pageshow', () => {
      scheduleEnhance();
      scheduleLiteColumnPreference();
    }, { passive:true });
    scheduleEnhance();
    scheduleLiteColumnPreference();
    setTimeout(scheduleEnhance, 600);
    setTimeout(scheduleEnhance, 1800);
  }

  window.MedIndexColumnPicker = {
    version:VERSION,
    refresh:scheduleEnhance,
    close:closePanel,
    columnPreferences:Object.freeze({
      version:COLUMN_PREFERENCE_VERSION,
      defaults:[...DEFAULT_LITE_COLUMNS],
      persist:persistLiteColumnPreference,
      refresh(){ preferenceApplied = false; scheduleLiteColumnPreference(); },
    }),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();