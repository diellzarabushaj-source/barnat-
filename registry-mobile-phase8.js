(() => {
  'use strict';

  const VERSION = 'registry-mobile-phase8-v2';
  const MOBILE_QUERY = '(max-width: 767px)';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const FAVORITE_META_KEY = 'regjistriBarnave_favorite_meta_v1';
  const RECENTS_KEY = 'regjistriBarnave_teFundit_v1';
  const MAX_RECENTS = 20;
  const MAX_FAVORITE_META = 120;

  const media = window.matchMedia?.(MOBILE_QUERY);
  if (!media?.matches) return;

  const root = document.documentElement;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  let mode = 'all';
  let currentRows = [];
  let installed = false;
  const favoriteInFlight = new Set();

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  function loadFavorites() {
    const value = readJson(FAVORITES_KEY, []);
    return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);
  }

  function loadNotes() {
    const value = readJson(NOTES_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function noteCount() {
    return Object.values(loadNotes()).filter(entry => {
      const text = typeof entry === 'string' ? entry : entry?.text;
      return Boolean(String(text ?? '').trim());
    }).length;
  }

  function scheduleLibrarySync() {
    window.setTimeout(() => {
      try { void window.MedIndexUserLibrary?.syncNow?.(); }
      catch {}
    }, 0);
  }

  function saveFavorites(favorites) {
    if (!writeJson(FAVORITES_KEY, [...favorites])) return false;
    try {
      window.dispatchEvent(new StorageEvent('storage', { key:FAVORITES_KEY, newValue:JSON.stringify([...favorites]) }));
    } catch {}
    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', { detail:{ count:favorites.size, source:'mobile-lite' } }));
    scheduleLibrarySync();
    return true;
  }

  function snapshot(row) {
    if (!row || typeof row !== 'object') return null;
    const item = {
      id:clean(row.id),
      registryNumber:clean(row.registryNumber),
      pdid:clean(row.pdid),
      tradeName:clean(row.tradeName),
      activeSubstance:clean(row.activeSubstance),
      atc:clean(row.atc).toUpperCase(),
      strength:clean(row.strength),
      form:clean(row.form),
      productStatus:clean(row.productStatus),
    };
    if (!item.id || !item.tradeName) return null;
    return item;
  }

  function itemKey(row) {
    return clean(row?.registryNumber) || clean(row?.id) || `${clean(row?.tradeName)}|${clean(row?.atc).toUpperCase()}`;
  }

  function desktopDrugKey(row) {
    const pdid = clean(row?.pdid);
    const name = clean(row?.tradeName);
    const strength = clean(row?.strength);
    return pdid || name || strength ? `${pdid}|${name}|${strength}` : '';
  }

  function favoriteCandidates(row) {
    const nr = clean(row?.registryNumber);
    const name = clean(row?.tradeName);
    const atc = clean(row?.atc).toUpperCase();
    const values = new Set();
    [desktopDrugKey(row), nr, name, nr && name ? `${nr}|${name}` : '', name && atc ? `${name}|${atc}` : '']
      .forEach(value => {
        const normalized = clean(value);
        if (normalized) values.add(normalized);
      });
    return values;
  }

  function isFavorite(row, favorites = loadFavorites()) {
    for (const candidate of favoriteCandidates(row)) if (favorites.has(candidate)) return true;
    return false;
  }

  function noteKey(row) {
    const nr = clean(row?.registryNumber);
    if (nr) return `registry:${nr}`;
    const key = desktopDrugKey(row) || clean(row?.id);
    if (key) return `drug:${key}`.slice(0, 300);
    return `fallback:${clean(row?.tradeName)}|${clean(row?.atc).toUpperCase()}`.slice(0, 300);
  }

  function hasNote(row) {
    const entry = loadNotes()[noteKey(row)];
    const text = typeof entry === 'string' ? entry : entry?.text;
    return Boolean(String(text ?? '').trim());
  }

  function favoriteMeta() {
    const value = readJson(FAVORITE_META_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function rememberFavorite(row) {
    const item = snapshot(row);
    if (!item) return;
    const meta = favoriteMeta();
    meta[itemKey(item)] = item;
    writeJson(FAVORITE_META_KEY, Object.fromEntries(Object.entries(meta).slice(-MAX_FAVORITE_META)));
  }

  function forgetFavorite(row) {
    const meta = favoriteMeta();
    const key = itemKey(row);
    if (key && Object.prototype.hasOwnProperty.call(meta, key)) {
      delete meta[key];
      writeJson(FAVORITE_META_KEY, meta);
    }
  }

  function loadRecents() {
    const value = readJson(RECENTS_KEY, []);
    return Array.isArray(value) ? value.map(snapshot).filter(Boolean).slice(0, MAX_RECENTS) : [];
  }

  function saveRecent(row) {
    const item = snapshot(row);
    if (!item) return;
    const key = itemKey(item);
    const next = [item, ...loadRecents().filter(entry => itemKey(entry) !== key)].slice(0, MAX_RECENTS);
    writeJson(RECENTS_KEY, next);
    syncCounts();
    if (mode === 'recent') renderMode();
  }

  function allLocalRows() {
    const map = new Map();
    [...currentRows, ...loadRecents(), ...Object.values(favoriteMeta())].forEach(row => {
      const item = snapshot(row);
      if (!item) return;
      const key = itemKey(item);
      if (key && !map.has(key)) map.set(key, item);
    });
    return [...map.values()];
  }

  function api() { return window.MEDINDEX_MOBILE_LITE || null; }

  function handoffPersonalView(next) {
    const controller = window.MedIndexRegistryPersonalization;
    if (controller?.setView) {
      controller.setView(next);
      return true;
    }
    try {
      const hash = next === 'favorites' ? '#favoritet' : '#shenimet';
      history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    } catch {}
    return window.MEDINDEX_LOAD_FULL_REGISTRY?.(`personal-view-${next}`) !== false;
  }

  function setMode(next) {
    if (!['all','favorites','notes','recent'].includes(next)) next = 'all';
    mode = next;
    root.dataset.registryMobilePersonalizationMode = mode;
    syncControls();
    if (mode === 'favorites' || mode === 'notes') {
      handoffPersonalView(mode);
      return;
    }
    renderMode();
  }

  function renderMode() {
    const mobile = api();
    if (!mobile) return;
    if (mode === 'all') {
      mobile.restoreCurrentPage?.();
      requestAnimationFrame(decorateRows);
      return;
    }
    if (mode === 'favorites' || mode === 'notes') {
      handoffPersonalView(mode);
      return;
    }
    const rows = loadRecents();
    mobile.renderLocalRows?.(rows, `${rows.length} të fundit`);
    requestAnimationFrame(decorateRows);
  }

  async function toggleFavorite(row, button) {
    const item = snapshot(row);
    if (!item) return;
    const primary = desktopDrugKey(item) || clean(item.registryNumber) || `${item.tradeName}|${item.atc}`;
    if (!primary || favoriteInFlight.has(primary)) return;
    favoriteInFlight.add(primary);
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }

    const favorites = loadFavorites();
    const active = isFavorite(item, favorites);
    if (active) {
      favoriteCandidates(item).forEach(key => favorites.delete(key));
      forgetFavorite(item);
    } else {
      favorites.add(primary);
      rememberFavorite(item);
    }

    if (!saveFavorites(favorites)) {
      favoriteInFlight.delete(primary);
      decorateRows();
      return;
    }

    syncCounts();
    decorateRows();
    try { await window.MedIndexUserLibrary?.syncNow?.(); }
    catch {}
    favoriteInFlight.delete(primary);
    decorateRows();
  }

  function rowForCard(card) {
    const id = clean(card?.closest?.('[data-mobile-lite-row]')?.dataset?.mobileLiteRow);
    return allLocalRows().find(row => clean(row.id) === id) || null;
  }

  function ensureCardButton(card, selector, className, dataName, svg) {
    let button = card.querySelector(selector);
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset[dataName] = 'true';
    button.innerHTML = svg;
    const host = card.querySelector('.mobile-lite-actions') || card;
    host.appendChild(button);
    return button;
  }

  function decorateRows() {
    const favorites = loadFavorites();
    document.querySelectorAll('#tbody .mobile-lite-card').forEach(card => {
      const row = rowForCard(card);
      if (!row) return;
      let summary = card.querySelector('.mobile-lite-open');
      if (summary?.tagName === 'BUTTON') {
        const passiveSummary = document.createElement('div');
        passiveSummary.className = summary.className;
        passiveSummary.innerHTML = summary.innerHTML;
        passiveSummary.setAttribute('aria-label', clean(row.tradeName) || 'Përmbledhja e barit');
        summary.replaceWith(passiveSummary);
        summary = passiveSummary;
      }

      let actions = card.querySelector('.mobile-lite-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'mobile-lite-actions';
        actions.dataset.mobileLiteActions = 'true';
        const more = card.querySelector('.mobile-lite-more');
        if (more) actions.appendChild(more);
        card.appendChild(actions);
      }

      const favorite = ensureCardButton(
        card,
        '[data-mi-mobile-favorite]',
        'mi-mobile-favorite-toggle',
        'miMobileFavorite',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
      );
      if (favorite.parentElement !== actions) actions.appendChild(favorite);
      const favoriteKey = desktopDrugKey(row) || clean(row.registryNumber) || `${row.tradeName}|${row.atc}`;
      const favoriteActive = isFavorite(row, favorites);
      const favoriteBusy = favoriteInFlight.has(favoriteKey);
      favorite.disabled = favoriteBusy;
      favorite.classList.toggle('is-favorite', favoriteActive);
      favorite.setAttribute('aria-busy', String(favoriteBusy));
      favorite.setAttribute('aria-pressed', String(favoriteActive));
      favorite.setAttribute('aria-label', favoriteBusy ? `Duke ruajtur ${row.tradeName}` : favoriteActive ? `Hiqe ${row.tradeName} nga Favoritet` : `Shto ${row.tradeName} te Favoritet`);
      favorite.title = favoriteBusy ? 'Duke ruajtur…' : favoriteActive ? 'Hiqe nga Favoritet' : 'Shto te Favoritet';

      const note = ensureCardButton(
        card,
        '[data-mi-mobile-note]',
        'mi-mobile-note-toggle',
        'miMobileNote',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.7-10.7a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 7.5 3 3"/></svg>',
      );
      if (note.parentElement !== actions) actions.appendChild(note);
      const noteActive = hasNote(row);
      note.classList.toggle('has-note', noteActive);
      note.setAttribute('aria-pressed', String(noteActive));
      note.setAttribute('aria-label', noteActive ? `Shiko ose ndrysho shënimin për ${row.tradeName}` : `Shto shënim për ${row.tradeName}`);
      note.title = noteActive ? 'Shiko/ndrysho shënimin' : 'Shto shënim';
    });
  }

  function syncCounts() {
    const favoriteCount = loadFavorites().size;
    const notesTotal = noteCount();
    const recentCount = loadRecents().length;
    document.querySelectorAll('[data-mi-phase8-favorite-count]').forEach(node => { node.textContent = String(favoriteCount); });
    document.querySelectorAll('[data-mi-phase8-note-count]').forEach(node => { node.textContent = String(notesTotal); });
    document.querySelectorAll('[data-mi-phase8-recent-count]').forEach(node => { node.textContent = String(recentCount); });
  }

  function syncControls() {
    document.querySelectorAll('[data-mi-phase8-mode]').forEach(button => {
      const active = button.dataset.miPhase8Mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    syncCounts();
  }

  function keepStatusOutOfFlow() {
    const status = document.getElementById('miOfflineStatus');
    if (!status) return;
    status.style.setProperty('position', 'fixed', 'important');
    status.style.setProperty('top', 'calc(env(safe-area-inset-top) + 64px)', 'important');
    status.style.setProperty('right', 'max(8px,env(safe-area-inset-right))', 'important');
    status.style.setProperty('z-index', '1750', 'important');
    status.style.setProperty('margin', '0', 'important');
    root.dataset.registryMobileStatusLayout = 'overlay-v1';
  }

  function placeBar(bar) {
    if (!bar) return null;
    const filterBar = document.getElementById('miRegistryMobileFilterBar');
    if (filterBar) {
      if (bar.parentElement !== filterBar) filterBar.appendChild(bar);
      bar.dataset.miPhase8Inline = 'true';
      root.dataset.registryMobileActionRail = 'unified-v2';
      return bar;
    }
    const registry = document.getElementById('registryContent');
    if (registry && bar.parentElement !== registry.parentElement) registry.insertAdjacentElement('beforebegin', bar);
    delete bar.dataset.miPhase8Inline;
    return bar;
  }

  function ensureBar() {
    let bar = document.getElementById('miRegistryPersonalizationBar');
    if (bar) return placeBar(bar);
    const filterBar = document.getElementById('miRegistryMobileFilterBar');
    const registry = document.getElementById('registryContent');
    if (!filterBar && !registry) return null;
    bar = document.createElement('section');
    bar.id = 'miRegistryPersonalizationBar';
    bar.className = 'mi-registry-personalization-bar';
    bar.setAttribute('aria-label', 'Lista personale');
    bar.innerHTML = `
      <button type="button" class="is-active" data-mi-phase8-mode="all" aria-pressed="true">Të gjitha</button>
      <button type="button" data-mi-phase8-mode="favorites" aria-pressed="false">★ Favoritet <span data-mi-phase8-favorite-count>0</span></button>
      <button type="button" data-mi-phase8-mode="notes" aria-pressed="false">✎ Shënimet <span data-mi-phase8-note-count>0</span></button>
      <button type="button" data-mi-phase8-mode="recent" aria-pressed="false">Të fundit <span data-mi-phase8-recent-count>0</span></button>`;
    if (filterBar) filterBar.appendChild(bar);
    else registry.insertAdjacentElement('beforebegin', bar);
    bar.querySelectorAll('[data-mi-phase8-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.miPhase8Mode)));
    return placeBar(bar);
  }

  function handleCardAction(event) {
    const favorite = event.target.closest?.('[data-mi-mobile-favorite]');
    if (favorite) {
      event.preventDefault();
      event.stopPropagation();
      const row = rowForCard(favorite);
      if (row) void toggleFavorite(row, favorite);
      return;
    }

    const note = event.target.closest?.('[data-mi-mobile-note]');
    if (!note) return;
    event.preventDefault();
    event.stopPropagation();
    const row = rowForCard(note);
    if (!row) return;
    const opened = window.MedIndexRegistryPersonalization?.editNoteForData?.(row);
    if (opened !== false && opened !== undefined) return;
    window.setTimeout(() => {
      if (window.MedIndexRegistryPersonalization?.editNoteForData?.(row)) return;
      handoffPersonalView('notes');
    }, 80);
  }

  function onServerRows() {
    const rows = api()?.getRows?.();
    currentRows = Array.isArray(rows) ? rows.map(snapshot).filter(Boolean) : [];
    currentRows.forEach(row => { if (isFavorite(row)) rememberFavorite(row); });
    ensureBar();
    if (mode === 'all') decorateRows();
    else renderMode();
    syncControls();
    keepStatusOutOfFlow();
  }

  function syncPersonalState() {
    syncControls();
    if (mode === 'recent') renderMode();
    else if (mode === 'all') decorateRows();
  }

  function install() {
    if (installed || window.MEDINDEX_MOBILE_LITE_ACTIVE !== true) return;
    installed = true;
    root.dataset.registryMobilePhase8 = VERSION;
    root.dataset.registryMobilePersonalizationMode = mode;
    ensureBar();
    syncControls();
    onServerRows();
    keepStatusOutOfFlow();

    document.addEventListener('click', handleCardAction, true);
    window.addEventListener('medindex:mobile-lite-ready', onServerRows);
    window.addEventListener('medindex:registry-mobile-phase3-ready', () => placeBar(document.getElementById('miRegistryPersonalizationBar')));
    window.addEventListener('medindex:tailadmin-ready', () => {
      placeBar(document.getElementById('miRegistryPersonalizationBar'));
      keepStatusOutOfFlow();
    });
    window.addEventListener('medindex:offline-runtime-ready', keepStatusOutOfFlow);
    window.addEventListener('medindex:offline-status', keepStatusOutOfFlow);
    window.addEventListener('medindex:mobile-lite-detail-opened', event => saveRecent(event.detail?.row));
    window.addEventListener('medindex:favorites-changed', event => {
      if (event.detail?.source === 'mobile-lite') return;
      syncPersonalState();
    });
    window.addEventListener('medindex:notes-changed', syncPersonalState);
    window.addEventListener('medindex:library-ready', syncPersonalState);
    window.addEventListener('medindex:library-synced', syncPersonalState);
    window.addEventListener('storage', event => {
      if (![FAVORITES_KEY, NOTES_KEY, RECENTS_KEY, FAVORITE_META_KEY].includes(event.key)) return;
      syncPersonalState();
    });
    window.addEventListener('medindex:request-full-registry', () => {
      document.getElementById('miRegistryPersonalizationBar')?.remove();
      delete root.dataset.registryMobileActionRail;
      root.dataset.registryMobilePhase8State = 'handoff';
    }, { once:true });

    document.querySelector('[data-mi-registry-nav="home"]')?.addEventListener('click', () => {
      if (mode !== 'all') setMode('all');
    }, true);

    root.dataset.registryMobilePhase8State = 'ready';
    window.dispatchEvent(new CustomEvent('medindex:registry-mobile-phase8-ready', { detail:{ version:VERSION } }));
  }

  function start() {
    if (window.MEDINDEX_MOBILE_LITE_ACTIVE === true) install();
    window.addEventListener('medindex:mobile-lite-ready', install, { once:true });
  }

  media.addEventListener?.('change', event => {
    if (!event.matches) {
      document.getElementById('miRegistryPersonalizationBar')?.remove();
      delete root.dataset.registryMobileActionRail;
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();