(() => {
  'use strict';

  const VERSION = 'registry-user-personalization-v2.0.0';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const PERSONAL_COLUMN_KEY = 'personal-note';
  const NOTE_MAX = 2000;
  const NOTE_SAVE_DELAY = 280;
  const NOTE_SYNC_DELAY = 650;

  let favoritesMode = location.hash.toLowerCase() === '#favoritet';
  let favorites = loadFavorites();
  let notes = loadNotes();
  let scheduled = false;
  let noteSyncTimer = 0;
  const noteTimers = new Map();

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  function loadFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch {}
  }

  function loadNotes() {
    try {
      const value = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      const output = {};
      Object.entries(value).forEach(([key, entry]) => {
        if (!key) return;
        const raw = typeof entry === 'string' ? { text:entry, updatedAt:'' } : entry;
        if (!raw || typeof raw !== 'object') return;
        const text = String(raw.text ?? '').slice(0, NOTE_MAX);
        if (!text.trim()) return;
        output[key] = { text, updatedAt:clean(raw.updatedAt) };
      });
      return output;
    } catch {
      return {};
    }
  }

  function saveNotes() {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
  }

  function headerIndex(matcher) {
    const headers = [...document.querySelectorAll('#headerRow > th')];
    return headers.findIndex(th => matcher(clean(th.dataset.registryColumnKey || th.dataset.columnKey || th.textContent).toLowerCase()));
  }

  function registryNumber(row) {
    const direct = clean(
      row?.dataset?.registryNumber
      || row?.querySelector?.('.drug-select')?.dataset?.registryNumber
      || row?.querySelector?.('[data-registry-number]')?.dataset?.registryNumber
    );
    if (direct) return direct;
    const index = headerIndex(value => value === 'number' || value === 'nr' || value === 'nr.' || value.includes('rendor'));
    if (index >= 0) return clean(row.children[index]?.textContent).match(/\d+/)?.[0] || '';
    return '';
  }

  function nameCell(row) {
    return row?.querySelector?.('td.name,[data-registry-column-key="trade-name"],[data-column-key="Emri tregtar"],[data-column-key="trade-name"]') || null;
  }

  function drugName(row) {
    const direct = clean(row?.dataset?.drugName);
    if (direct) return direct;
    const cell = nameCell(row);
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('button,input,textarea,.favorite-marker,[data-registry-ui-only]').forEach(node => node.remove());
    return clean(clone.textContent);
  }

  function atc(row) {
    const direct = clean(row?.dataset?.atcCode || row?.querySelector?.('[data-atc-code]')?.dataset?.atcCode);
    if (direct) return direct.toUpperCase();
    const cell = row?.querySelector?.('[data-registry-column-key="atc"],[data-registry-column-key="atc-code"],[data-column-key="ATC Code"],[data-column-key="atc"]');
    return clean(cell?.textContent).toUpperCase();
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

  function isFavoriteRow(row) {
    for (const candidate of favoriteCandidates(row)) {
      if (favorites.has(candidate)) return true;
    }
    return false;
  }

  function noteKey(row) {
    const nr = registryNumber(row);
    if (nr) return `registry:${nr}`;
    const drugKey = clean(row?.querySelector?.('.drug-select')?.dataset?.drugKey || row?.dataset?.drugKey);
    if (drugKey) return `drug:${drugKey}`.slice(0, 300);
    return `fallback:${drugName(row)}|${atc(row)}`.slice(0, 300);
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

  function paintFavorite(row) {
    const button = favoriteButton(row);
    if (!button) return;
    const active = isFavoriteRow(row);
    const name = drugName(row) || 'barin';
    button.classList.toggle('is-favorite', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? `Hiqe ${name} nga Favoritet` : `Shto ${name} te Favoritet`);
    button.title = active ? 'Hiqe nga Favoritet' : 'Shto te Favoritet';
    row.classList.toggle('is-favorite', active);
  }

  function ensureNoteHeader() {
    const header = document.getElementById('headerRow');
    if (!header) return;
    let th = header.querySelector(`[data-registry-column-key="${PERSONAL_COLUMN_KEY}"]`);
    if (th) return;
    th = document.createElement('th');
    th.scope = 'col';
    th.className = 'registry-personal-note-head';
    th.dataset.registryColumnKey = PERSONAL_COLUMN_KEY;
    th.dataset.columnKey = PERSONAL_COLUMN_KEY;
    th.dataset.registryUiOnly = 'true';
    th.innerHTML = '<span>Shënime personale</span><small>ruhen automatikisht</small>';
    header.appendChild(th);
  }

  function noteCell(row) {
    let cell = row.querySelector(`:scope > td[data-registry-column-key="${PERSONAL_COLUMN_KEY}"]`);
    if (cell) return cell;
    cell = document.createElement('td');
    cell.className = 'registry-personal-note-cell';
    cell.dataset.registryColumnKey = PERSONAL_COLUMN_KEY;
    cell.dataset.columnKey = PERSONAL_COLUMN_KEY;
    cell.dataset.registryUiOnly = 'true';
    row.appendChild(cell);
    return cell;
  }

  function autoSizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const max = matchMedia?.('(max-width:720px)')?.matches ? 92 : 104;
    textarea.style.height = `${Math.min(max, Math.max(38, textarea.scrollHeight))}px`;
    textarea.classList.toggle('has-content', Boolean(String(textarea.value || '').trim()));
  }

  function noteState(textarea, text, status = '') {
    const state = textarea?.closest('.registry-personal-note-wrap')?.querySelector('[data-personal-note-state]');
    if (!state) return;
    state.textContent = text;
    if (status) state.dataset.status = status;
    else delete state.dataset.status;
  }

  function updateClearButton(textarea) {
    const button = textarea?.closest('.registry-personal-note-wrap')?.querySelector('[data-clear-personal-note]');
    if (button) button.hidden = !String(textarea.value || '').trim();
  }

  function renderNoteCell(row) {
    if (!(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;
    const key = noteKey(row);
    if (!key) return;
    const cell = noteCell(row);
    const existing = notes[key]?.text || '';
    const current = cell.querySelector('[data-personal-note]');
    if (cell.dataset.noteReady === key && current) {
      if (document.activeElement !== current && current.value !== existing) {
        current.value = existing;
        autoSizeTextarea(current);
        updateClearButton(current);
      }
      return;
    }
    cell.dataset.noteReady = key;
    cell.innerHTML = `<div class="registry-personal-note-wrap">
      <textarea rows="1" maxlength="${NOTE_MAX}" data-personal-note="${escapeHtml(key)}" aria-label="Shënim personal për ${escapeHtml(drugName(row) || 'barin')}" placeholder="Shkruaj shënim…">${escapeHtml(existing)}</textarea>
      <button type="button" class="registry-personal-note-clear" data-clear-personal-note aria-label="Fshije shënimin" ${existing ? '' : 'hidden'}>×</button>
      <span class="registry-personal-note-state" data-personal-note-state>${existing ? 'Ruajtur' : ''}</span>
    </div>`;
    const textarea = cell.querySelector('[data-personal-note]');
    autoSizeTextarea(textarea);
  }

  function markFilledNotes(text, status) {
    document.querySelectorAll('[data-personal-note]').forEach(textarea => {
      if (!String(textarea.value || '').trim()) return;
      noteState(textarea, text, status);
    });
  }

  function scheduleUserLibrarySync() {
    clearTimeout(noteSyncTimer);
    noteSyncTimer = window.setTimeout(async () => {
      try {
        const synced = await window.MedIndexUserLibrary?.syncNow?.();
        if (synced) markFilledNotes('Sinkronizuar', 'synced');
      } catch {}
    }, NOTE_SYNC_DELAY);
  }

  function persistNote(textarea, { sync = true } = {}) {
    const key = clean(textarea?.dataset?.personalNote);
    if (!key) return;
    const text = String(textarea.value || '').slice(0, NOTE_MAX);
    if (text.trim()) notes[key] = { text, updatedAt:new Date().toISOString() };
    else delete notes[key];
    saveNotes();
    autoSizeTextarea(textarea);
    updateClearButton(textarea);
    noteState(textarea, text.trim() ? 'Ruajtur' : '', text.trim() ? 'saved' : '');
    window.dispatchEvent(new CustomEvent('medindex:personal-note-saved', { detail:{ key, hasText:Boolean(text.trim()) } }));
    if (sync) scheduleUserLibrarySync();
  }

  function queueNoteSave(textarea) {
    const key = clean(textarea?.dataset?.personalNote);
    if (!key) return;
    noteState(textarea, 'Duke ruajtur…', 'saving');
    autoSizeTextarea(textarea);
    updateClearButton(textarea);
    const old = noteTimers.get(key);
    if (old) clearTimeout(old);
    const timer = window.setTimeout(() => {
      noteTimers.delete(key);
      persistNote(textarea);
    }, NOTE_SAVE_DELAY);
    noteTimers.set(key, timer);
  }

  function flushNote(textarea) {
    const key = clean(textarea?.dataset?.personalNote);
    const timer = noteTimers.get(key);
    if (timer) clearTimeout(timer);
    noteTimers.delete(key);
    persistNote(textarea);
  }

  function runtime() {
    return window.MedIndexRegistryRuntime || null;
  }

  function filteredFavoriteCount() {
    if (!favoritesMode) return 0;
    try { return Number(runtime()?.getFilteredCount?.() || 0); }
    catch { return document.querySelectorAll('#tbody > tr:not([hidden])').length; }
  }

  function updateFavoriteCounters() {
    const count = favorites.size;
    document.querySelectorAll('#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],.nav-mini-count[data-favorites-count]').forEach(node => {
      node.textContent = String(count);
      node.setAttribute('aria-label', `${count} favorite`);
    });
  }

  function updateFavoriteNavState() {
    document.querySelectorAll('[data-nav="favorites"],[data-mi-shell-action="favorites"]').forEach(button => {
      button.classList.toggle('active', favoritesMode);
      button.classList.toggle('is-active', favoritesMode);
      button.setAttribute('aria-pressed', favoritesMode ? 'true' : 'false');
      if (favoritesMode) button.setAttribute('aria-current', 'true');
      else if (button.getAttribute('aria-current') === 'true') button.removeAttribute('aria-current');
    });
    document.body.classList.toggle('medindex-favorites-only', favoritesMode);
  }

  function ensureFavoritesBanner() {
    let banner = document.getElementById('registryFavoritesBanner');
    if (!favoritesMode) {
      banner?.remove();
      return;
    }
    if (!banner) {
      const toolbar = document.querySelector('.toolbar');
      if (!toolbar) return;
      banner = document.createElement('div');
      banner.id = 'registryFavoritesBanner';
      banner.className = 'registry-favorites-banner';
      banner.innerHTML = '<span><b>★ Favoritet</b><small data-favorites-banner-copy></small></span><button type="button" data-exit-favorites>Të gjitha barnat</button>';
      toolbar.insertAdjacentElement('afterend', banner);
    }
    const total = favorites.size;
    const filtered = filteredFavoriteCount();
    const copy = banner.querySelector('[data-favorites-banner-copy]');
    if (copy) {
      copy.textContent = filtered !== total
        ? `${filtered} në këtë filtër · ${total} gjithsej`
        : `${total} ${total === 1 ? 'bar i ruajtur' : 'barna të ruajtura'} · vetëm të tuat`;
    }
  }

  function updateFavoriteResultCopy() {
    if (!favoritesMode) return;
    const filtered = filteredFavoriteCount();
    const total = favorites.size;
    const badge = document.getElementById('countBadge');
    if (badge) badge.textContent = filtered === total ? `${filtered} favorite` : `${filtered} nga ${total} favorite`;
    const empty = document.querySelector('#tbody .empty-state');
    if (empty && filtered === 0) {
      empty.textContent = total === 0
        ? 'Nuk ke ende favorite. Shto një bar me ★ dhe do të shfaqet këtu.'
        : 'Asnjë nga favoritet nuk përputhet me filtrat aktualë.';
    }
  }

  function enterFavorites() {
    if (!favoritesMode) favoritesMode = true;
    updateFavoriteNavState();
    try { history.replaceState(null, '', `${location.pathname}${location.search}#favoritet`); } catch {}
    const api = runtime();
    if (api?.setFavoritesOnly) api.setFavoritesOnly(true);
    else schedule(2);
    ensureFavoritesBanner();
  }

  function exitFavorites() {
    if (!favoritesMode) return;
    favoritesMode = false;
    updateFavoriteNavState();
    ensureFavoritesBanner();
    try { history.replaceState(null, '', `${location.pathname}${location.search}`); } catch {}
    const api = runtime();
    if (api?.setFavoritesOnly) api.setFavoritesOnly(false);
    else schedule(2);
  }

  function toggleFavorite(row) {
    if (!(row instanceof HTMLElement)) return;
    const active = isFavoriteRow(row);
    if (active) favoriteCandidates(row).forEach(key => favorites.delete(key));
    else {
      const key = primaryFavoriteKey(row);
      if (!key) return;
      favorites.add(key);
    }
    saveFavorites();
    paintFavorite(row);
    updateFavoriteCounters();
    ensureFavoritesBanner();
    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', {
      detail:{ count:favorites.size, favorite:!active, key:primaryFavoriteKey(row) }
    }));
    if (runtime()?.refreshFavorites) runtime().refreshFavorites();
    else schedule(1);
    scheduleUserLibrarySync();
  }

  function refresh() {
    scheduled = false;
    ensureNoteHeader();
    document.querySelectorAll('#tbody > tr').forEach(row => {
      if (row.querySelector('.empty-state')) return;
      paintFavorite(row);
      renderNoteCell(row);
    });
    updateFavoriteCounters();
    updateFavoriteNavState();
    ensureFavoritesBanner();
    updateFavoriteResultCopy();
    document.documentElement.dataset.registryPersonalization = VERSION;
  }

  function schedule(frames = 1) {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      if (frames > 1) {
        frames -= 1;
        requestAnimationFrame(run);
      } else requestAnimationFrame(refresh);
    };
    run();
  }

  function bind() {
    document.addEventListener('click', event => {
      const favorite = event.target.closest('[data-row-favorite-toggle]');
      if (favorite) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleFavorite(favorite.closest('tr'));
        return;
      }
      const clear = event.target.closest('[data-clear-personal-note]');
      if (clear) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const textarea = clear.closest('.registry-personal-note-wrap')?.querySelector('[data-personal-note]');
        if (textarea) {
          textarea.value = '';
          flushNote(textarea);
          textarea.focus({ preventScroll:true });
        }
        return;
      }
      if (event.target.closest('[data-personal-note]')) {
        event.stopPropagation();
        return;
      }
      const favNav = event.target.closest('[data-nav="favorites"],[data-mi-shell-action="favorites"]');
      if (favNav) {
        event.preventDefault();
        event.stopImmediatePropagation();
        enterFavorites();
        return;
      }
      if (event.target.closest('[data-exit-favorites]')) {
        event.preventDefault();
        exitFavorites();
        return;
      }
      const home = event.target.closest('[data-nav="home"]');
      if (home && favoritesMode) {
        event.preventDefault();
        event.stopImmediatePropagation();
        exitFavorites();
      }
    }, true);

    document.addEventListener('input', event => {
      if (event.target.matches?.('[data-personal-note]')) queueNoteSave(event.target);
    }, true);

    document.addEventListener('blur', event => {
      if (event.target.matches?.('[data-personal-note]')) flushNote(event.target);
    }, true);

    document.addEventListener('keydown', event => {
      if (!event.target.matches?.('[data-personal-note]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        flushNote(event.target);
        event.target.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.target.blur();
      }
    }, true);

    window.addEventListener('medindex:registry-rendered', () => schedule(1));
    window.addEventListener('medindex:registry-ready', () => {
      if (favoritesMode) runtime()?.setFavoritesOnly?.(true);
      schedule(1);
    });
    window.addEventListener('medindex:library-ready', () => {
      favorites = loadFavorites();
      notes = loadNotes();
      if (favoritesMode) runtime()?.refreshFavorites?.();
      schedule(1);
    });
    window.addEventListener('medindex:library-synced', () => {
      favorites = loadFavorites();
      notes = loadNotes();
      markFilledNotes('Sinkronizuar', 'synced');
      schedule(1);
    });
    window.addEventListener('medindex:library-pending', event => {
      markFilledNotes(event.detail?.offline ? 'Offline · ruajtur' : 'Ruajtur lokalisht', 'local');
    });
    window.addEventListener('online', () => markFilledNotes('Duke sinkronizuar…', 'saving'));
    window.addEventListener('offline', () => markFilledNotes('Offline · ruajtur', 'local'));
    window.addEventListener('storage', event => {
      if (event.key === FAVORITES_KEY) {
        favorites = loadFavorites();
        runtime()?.refreshFavorites?.();
        schedule(1);
      }
      if (event.key === NOTES_KEY) {
        notes = loadNotes();
        schedule(1);
      }
    });

    schedule(1);
    if (favoritesMode) window.setTimeout(enterFavorites, 80);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  window.MedIndexRegistryPersonalization = Object.freeze({
    version:VERSION,
    refresh:() => schedule(1),
    showFavorites:enterFavorites,
    showAll:exitFavorites,
    isFavoritesMode:() => favoritesMode,
  });
})();