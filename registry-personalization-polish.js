(() => {
  'use strict';

  const VERSION = 'registry-personalization-polish-v1.0.0';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  let observer = null;
  let scheduled = false;
  let syncTimer = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function readFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function writeFavorites(favorites) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch {}
  }

  function headerIndex(matcher) {
    const headers = [...document.querySelectorAll('#headerRow > th')];
    return headers.findIndex(th => matcher(clean(th.dataset.registryColumnKey || th.textContent).toLowerCase()));
  }

  function registryNumber(row) {
    const direct = clean(
      row?.dataset?.registryNumber
      || row?.querySelector?.('.drug-select')?.dataset?.registryNumber
      || row?.querySelector?.('[data-registry-number]')?.dataset?.registryNumber
    );
    if (direct) return direct;
    const index = headerIndex(value => value === 'number' || value === 'nr' || value === 'nr.' || value.includes('rendor'));
    return index >= 0 ? clean(row.children[index]?.textContent).match(/\d+/)?.[0] || '' : '';
  }

  function nameCell(row) {
    return row?.querySelector?.('td.name,[data-registry-column-key="trade-name"],[data-column-key="trade-name"]') || null;
  }

  function drugName(row) {
    const direct = clean(row?.dataset?.drugName);
    if (direct) return direct;
    const cell = nameCell(row);
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('button,input,.favorite-marker,[data-registry-ui-only]').forEach(node => node.remove());
    return clean(clone.textContent);
  }

  function atc(row) {
    const direct = clean(row?.dataset?.atcCode || row?.querySelector?.('[data-atc-code]')?.dataset?.atcCode);
    if (direct) return direct.toUpperCase();
    return clean(row?.querySelector?.('[data-registry-column-key="atc"],[data-registry-column-key="atc-code"],[data-column-key="atc"]')?.textContent).toUpperCase();
  }

  function primaryFavoriteKey(row) {
    return clean(
      row?.querySelector?.('.drug-select')?.dataset?.drugKey
      || row?.dataset?.drugKey
      || row?.dataset?.registryNumber
      || row?.querySelector?.('.drug-select')?.dataset?.registryNumber
      || registryNumber(row)
      || (drugName(row) && atc(row) ? `${drugName(row)}|${atc(row)}` : drugName(row))
    );
  }

  function favoriteCandidates(row) {
    const values = new Set();
    const add = value => { const item = clean(value); if (item) values.add(item); };
    add(primaryFavoriteKey(row));
    add(row?.dataset?.drugKey);
    add(row?.querySelector?.('.drug-select')?.dataset?.drugKey);
    add(row?.dataset?.registryNumber);
    add(row?.querySelector?.('.drug-select')?.dataset?.registryNumber);
    const nr = registryNumber(row);
    const name = drugName(row);
    const code = atc(row);
    add(nr);
    add(name);
    if (nr && name) add(`${nr}|${name}`);
    if (name && code) add(`${name}|${code}`);
    return values;
  }

  function isFavorite(row, favorites = readFavorites()) {
    for (const candidate of favoriteCandidates(row)) {
      if (favorites.has(candidate)) return true;
    }
    return false;
  }

  function favoriteButton(row) {
    const cell = nameCell(row);
    if (!cell) return null;
    let button = cell.querySelector(':scope > [data-row-favorite-toggle]');
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'registry-row-favorite-toggle';
    button.dataset.rowFavoriteToggle = 'true';
    button.dataset.registryUiOnly = 'true';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>';
    const actions = cell.querySelector('.drug-actions-trigger');
    if (actions) actions.insertAdjacentElement('beforebegin', button);
    else cell.appendChild(button);
    return button;
  }

  function paintFavorite(row, favorites = readFavorites()) {
    const button = favoriteButton(row);
    if (!button) return;
    const active = isFavorite(row, favorites);
    button.classList.toggle('is-favorite', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? `Hiqe ${drugName(row) || 'barin'} nga Favoritet` : `Shto ${drugName(row) || 'barin'} te Favoritet`);
    button.title = active ? 'Hiqe nga Favoritet' : 'Shto te Favoritet';
    row.classList.toggle('is-favorite', active);
  }

  function updateCounter() {
    const count = readFavorites().size;
    document.querySelectorAll('#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],.nav-mini-count[data-favorites-count]').forEach(node => {
      node.textContent = String(count);
      node.setAttribute('aria-label', `${count} favorite`);
    });
    const banner = document.getElementById('registryFavoritesBanner');
    const copy = banner?.querySelector('span');
    if (copy) copy.innerHTML = `<b>★ Favoritet</b><small>${count} ${count === 1 ? 'bar i ruajtur' : 'barna të ruajtura'} · vetëm të tuat</small>`;
  }

  function scheduleLibrarySync() {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(async () => {
      let synced = false;
      try { synced = Boolean(await window.MedIndexUserLibrary?.syncNow?.()); } catch {}
      window.dispatchEvent(new CustomEvent('medindex:favorites-sync-result', { detail:{ synced } }));
    }, 120);
  }

  function toggleFavorite(row) {
    if (!(row instanceof HTMLElement)) return;
    const favorites = readFavorites();
    const active = isFavorite(row, favorites);
    if (active) {
      favoriteCandidates(row).forEach(key => favorites.delete(key));
    } else {
      const key = primaryFavoriteKey(row);
      if (!key) return;
      favorites.add(key);
    }
    writeFavorites(favorites);
    document.querySelectorAll('#tbody > tr').forEach(item => paintFavorite(item, favorites));
    updateCounter();
    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', {
      detail:{ count:favorites.size, favorite:!active, key:primaryFavoriteKey(row) }
    }));
    window.MedIndexRegistryPersonalization?.refresh?.();
    scheduleLibrarySync();
  }

  function noteState(textarea, text, status) {
    const state = textarea?.closest('.registry-personal-note-wrap')?.querySelector('[data-personal-note-state]');
    if (!state) return;
    state.textContent = text;
    if (status) state.dataset.status = status;
    else delete state.dataset.status;
  }

  function markAllNoteStates(text, status, onlyFilled = true) {
    document.querySelectorAll('[data-personal-note]').forEach(textarea => {
      if (onlyFilled && !String(textarea.value || '').trim()) return;
      noteState(textarea, text, status);
    });
  }

  function syncLegacyFavoriteInput(target) {
    if (!target?.matches?.('.drug-action-item.favorite input')) return;
    window.setTimeout(() => {
      const row = document.querySelector('.drug-row:has(.drug-actions-trigger[aria-expanded="true"])') || null;
      if (row) paintFavorite(row);
      updateCounter();
      window.MedIndexRegistryPersonalization?.refresh?.();
      scheduleLibrarySync();
    }, 30);
  }

  function refresh() {
    scheduled = false;
    const favorites = readFavorites();
    document.querySelectorAll('#tbody > tr').forEach(row => {
      if (row.querySelector('.empty-state') || row.dataset.personalizationEmpty === 'true') return;
      paintFavorite(row, favorites);
    });
    updateCounter();
    document.documentElement.dataset.registryPersonalizationPolish = VERSION;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(refresh));
  }

  function bind() {
    const tbody = document.getElementById('tbody');
    if (tbody) {
      observer = new MutationObserver(schedule);
      observer.observe(tbody, { childList:true, subtree:false });
    }

    document.addEventListener('click', event => {
      const button = event.target.closest('[data-row-favorite-toggle]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const row = button.closest('tr');
      toggleFavorite(row);
    }, true);

    document.addEventListener('change', event => syncLegacyFavoriteInput(event.target), true);

    document.addEventListener('input', event => {
      if (!event.target.matches?.('[data-personal-note]')) return;
      noteState(event.target, 'Duke ruajtur…', 'saving');
    }, true);

    window.addEventListener('medindex:library-synced', () => markAllNoteStates('Sinkronizuar', 'synced'));
    window.addEventListener('medindex:library-pending', event => {
      markAllNoteStates(event.detail?.offline ? 'Offline · ruajtur lokalisht' : 'Ruajtur lokalisht', 'local');
    });
    window.addEventListener('online', () => markAllNoteStates('Duke sinkronizuar…', 'saving'));
    window.addEventListener('offline', () => markAllNoteStates('Offline · ruajtur lokalisht', 'local'));

    ['medindex:registry-data-ready','medindex:registry-ready','medindex:registry-table-stable','medindex:library-ready','medindex:favorites-changed']
      .forEach(name => window.addEventListener(name, schedule));
    window.addEventListener('storage', event => { if (event.key === FAVORITES_KEY) schedule(); });

    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  window.MedIndexRegistryPersonalizationPolish = Object.freeze({
    version:VERSION,
    refresh:schedule,
  });
})();
