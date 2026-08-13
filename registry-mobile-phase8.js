(() => {
  'use strict';

  const VERSION = 'registry-mobile-phase8-v1';
  const MOBILE_QUERY = '(max-width: 767px)';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
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

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }

  function loadFavorites() {
    const value = readJson(FAVORITES_KEY, []);
    return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);
  }

  function saveFavorites(favorites) {
    writeJson(FAVORITES_KEY, [...favorites]);
    try {
      window.dispatchEvent(new StorageEvent('storage', { key:FAVORITES_KEY, newValue:JSON.stringify([...favorites]) }));
    } catch {}
    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', { detail:{ count:favorites.size, source:'mobile-lite' } }));
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
    [
      desktopDrugKey(row),
      nr,
      name,
      nr && name ? `${nr}|${name}` : '',
      name && atc ? `${name}|${atc}` : '',
    ].forEach(value => {
      const normalized = clean(value);
      if (normalized) values.add(normalized);
    });
    return values;
  }

  function isFavorite(row, favorites = loadFavorites()) {
    for (const candidate of favoriteCandidates(row)) {
      if (favorites.has(candidate)) return true;
    }
    return false;
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
    const entries = Object.entries(meta).slice(-MAX_FAVORITE_META);
    writeJson(FAVORITE_META_KEY, Object.fromEntries(entries));
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

  function favoriteRows() {
    const favorites = loadFavorites();
    return allLocalRows().filter(row => isFavorite(row, favorites));
  }

  function api() {
    return window.MEDINDEX_MOBILE_LITE || null;
  }

  function setMode(next) {
    if (!['all','favorites','recent'].includes(next)) next = 'all';
    mode = next;
    root.dataset.registryMobilePersonalizationMode = mode;
    syncControls();
    renderMode();
  }

  function renderMode() {
    const mobile = api();
    if (!mobile) return;
    if (mode === 'all') {
      mobile.restoreCurrentPage?.();
      decorateRows();
      return;
    }
    const rows = mode === 'favorites' ? favoriteRows() : loadRecents();
    const label = mode === 'favorites'
      ? `${rows.length} favorite lokale`
      : `${rows.length} të fundit`;
    mobile.renderLocalRows?.(rows, label);
    requestAnimationFrame(decorateRows);
  }

  function toggleFavorite(row) {
    const item = snapshot(row);
    if (!item) return;
    const favorites = loadFavorites();
    const active = isFavorite(item, favorites);
    if (active) {
      favoriteCandidates(item).forEach(key => favorites.delete(key));
      forgetFavorite(item);
    } else {
      const primary = desktopDrugKey(item) || clean(item.registryNumber) || `${item.tradeName}|${item.atc}`;
      if (!primary) return;
      favorites.add(primary);
      rememberFavorite(item);
    }
    saveFavorites(favorites);
    syncCounts();
    if (mode === 'favorites') renderMode();
    else decorateRows();
  }

  function rowForCard(card) {
    const id = clean(card?.closest?.('[data-mobile-lite-row]')?.dataset?.mobileLiteRow);
    return allLocalRows().find(row => clean(row.id) === id) || null;
  }

  function decorateRows() {
    const favorites = loadFavorites();
    document.querySelectorAll('#tbody .mobile-lite-card').forEach(card => {
      const row = rowForCard(card);
      if (!row) return;
      let button = card.querySelector('[data-mi-mobile-favorite]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'mi-mobile-favorite-toggle';
        button.dataset.miMobileFavorite = 'true';
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>';
        card.appendChild(button);
      }
      const active = isFavorite(row, favorites);
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? `Hiqe ${row.tradeName} nga Favoritet` : `Shto ${row.tradeName} te Favoritet`);
      button.title = active ? 'Hiqe nga Favoritet' : 'Shto te Favoritet';
    });
  }

  function syncCounts() {
    const favoriteCount = loadFavorites().size;
    const recentCount = loadRecents().length;
    document.querySelectorAll('[data-mi-phase8-favorite-count]').forEach(node => { node.textContent = String(favoriteCount); });
    document.querySelectorAll('[data-mi-phase8-recent-count]').forEach(node => { node.textContent = String(recentCount); });
  }

  function syncControls() {
    document.querySelectorAll('[data-mi-phase8-mode]').forEach(button => {
      const active = button.dataset.miPhase8Mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
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
      root.dataset.registryMobileActionRail = 'unified-v1';
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
      <button type="button" data-mi-phase8-mode="recent" aria-pressed="false">Të fundit <span data-mi-phase8-recent-count>0</span></button>`;
    if (filterBar) filterBar.appendChild(bar);
    else registry.insertAdjacentElement('beforebegin', bar);
    bar.querySelectorAll('[data-mi-phase8-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.miPhase8Mode)));
    return placeBar(bar);
  }

  function handleFavoriteClick(event) {
    const button = event.target.closest?.('[data-mi-mobile-favorite]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const row = rowForCard(button);
    if (row) toggleFavorite(row);
  }

  function onServerRows() {
    const rows = api()?.getRows?.();
    currentRows = Array.isArray(rows) ? rows.map(snapshot).filter(Boolean) : [];
    currentRows.forEach(row => {
      if (isFavorite(row)) rememberFavorite(row);
    });
    ensureBar();
    if (mode === 'all') decorateRows();
    else renderMode();
    syncControls();
    keepStatusOutOfFlow();
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

    document.addEventListener('click', handleFavoriteClick, true);
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
      syncControls();
      if (mode === 'favorites') renderMode();
      else decorateRows();
    });
    window.addEventListener('storage', event => {
      if (event.key !== FAVORITES_KEY && event.key !== RECENTS_KEY && event.key !== FAVORITE_META_KEY) return;
      syncControls();
      if (mode !== 'all') renderMode();
      else decorateRows();
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