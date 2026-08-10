(() => {
  'use strict';

  const VERSION = 'registry-user-personalization-v1.0.0';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const PERSONAL_COLUMN_KEY = 'personal-note';
  const ALL_ROWS_PAGE_SIZE = '10000';
  const NOTE_MAX = 2000;
  const NOTE_SAVE_DELAY = 550;

  let favoritesMode = false;
  let previousPageSize = '';
  let scheduled = false;
  let observer = null;
  let noteSyncTimer = 0;
  const noteTimers = new Map();

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  function readFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function readNotes() {
    try {
      const value = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      const output = {};
      Object.entries(value).forEach(([key, entry]) => {
        if (!key) return;
        if (typeof entry === 'string') {
          const text = entry.slice(0, NOTE_MAX);
          if (text) output[key] = { text, updatedAt:'' };
          return;
        }
        if (!entry || typeof entry !== 'object') return;
        const text = String(entry.text ?? '').slice(0, NOTE_MAX);
        if (text) output[key] = { text, updatedAt:clean(entry.updatedAt) };
      });
      return output;
    } catch {
      return {};
    }
  }

  function writeNotes(notes) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
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
    if (index >= 0) return clean(row.children[index]?.textContent).match(/\d+/)?.[0] || '';
    return '';
  }

  function drugName(row) {
    const direct = clean(row?.dataset?.drugName);
    if (direct) return direct;
    const cell = row?.querySelector?.('td.name,[data-registry-column-key="trade-name"],[data-column-key="trade-name"]');
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('button,input,.favorite-marker,[data-registry-ui-only]').forEach(node => node.remove());
    return clean(clone.textContent);
  }

  function atc(row) {
    const direct = clean(row?.dataset?.atcCode || row?.querySelector?.('[data-atc-code]')?.dataset?.atcCode);
    if (direct) return direct;
    const cell = row?.querySelector?.('[data-registry-column-key="atc"],[data-registry-column-key="atc-code"],[data-column-key="atc"]');
    return clean(cell?.textContent).toUpperCase();
  }

  function noteKey(row) {
    const nr = registryNumber(row);
    if (nr) return `registry:${nr}`;
    const rawDrugKey = clean(row?.querySelector?.('.drug-select')?.dataset?.drugKey || row?.dataset?.drugKey);
    if (rawDrugKey) return `drug:${rawDrugKey}`.slice(0, 300);
    return `fallback:${drugName(row)}|${atc(row)}`.slice(0, 300);
  }

  function favoriteCandidates(row) {
    const values = new Set();
    const add = value => { const v = clean(value); if (v) values.add(v); };
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

  function isFavoriteRow(row, favorites = readFavorites()) {
    if (row.classList.contains('is-favorite')) return true;
    for (const candidate of favoriteCandidates(row)) {
      if (favorites.has(candidate)) return true;
    }
    return false;
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
    th.innerHTML = '<span>Shënime personale</span><small>vetëm për ty</small>';
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

  function renderNoteCell(row, notes) {
    if (!(row instanceof HTMLElement) || row.querySelector('.empty-state') || row.dataset.personalizationEmpty === 'true') return;
    if (favoritesMode && row.hidden) return;
    const key = noteKey(row);
    if (!key) return;
    const cell = noteCell(row);
    if (cell.dataset.noteReady === key) return;
    const existing = notes[key]?.text || '';
    cell.dataset.noteReady = key;
    cell.innerHTML = `<div class="registry-personal-note-wrap">
      <textarea rows="2" maxlength="${NOTE_MAX}" data-personal-note="${escapeHtml(key)}" aria-label="Shënim personal për ${escapeHtml(drugName(row) || 'barin')}" placeholder="Shkruaj shënim…">${escapeHtml(existing)}</textarea>
      <span class="registry-personal-note-state" data-personal-note-state>${existing ? 'Ruajtur' : ''}</span>
    </div>`;
  }

  function scheduleUserLibrarySync() {
    clearTimeout(noteSyncTimer);
    noteSyncTimer = window.setTimeout(() => {
      try { window.MedIndexUserLibrary?.syncNow?.(); } catch {}
    }, 900);
  }

  function persistNote(textarea) {
    const key = clean(textarea?.dataset?.personalNote);
    if (!key) return;
    const text = String(textarea.value || '').slice(0, NOTE_MAX);
    const notes = readNotes();
    if (text.trim()) notes[key] = { text, updatedAt:new Date().toISOString() };
    else delete notes[key];
    writeNotes(notes);
    const state = textarea.closest('.registry-personal-note-wrap')?.querySelector('[data-personal-note-state]');
    if (state) {
      state.textContent = text.trim() ? 'Ruajtur' : '';
      state.dataset.saved = 'true';
      window.setTimeout(() => { if (state) delete state.dataset.saved; }, 1000);
    }
    scheduleUserLibrarySync();
  }

  function queueNoteSave(textarea) {
    const key = clean(textarea?.dataset?.personalNote);
    if (!key) return;
    const old = noteTimers.get(key);
    if (old) clearTimeout(old);
    const timer = window.setTimeout(() => {
      noteTimers.delete(key);
      persistNote(textarea);
    }, NOTE_SAVE_DELAY);
    noteTimers.set(key, timer);
  }

  function ensureAllRowsOption() {
    const select = document.getElementById('pageSize');
    if (!select) return null;
    let option = select.querySelector('[data-personalization-all]');
    if (!option) {
      option = document.createElement('option');
      option.value = ALL_ROWS_PAGE_SIZE;
      option.hidden = true;
      option.dataset.personalizationAll = 'true';
      option.textContent = 'Të gjitha për Favorite';
      select.appendChild(option);
    }
    return select;
  }

  function removeFavoriteEmptyRow() {
    document.querySelector('#tbody > tr[data-personalization-empty="true"]')?.remove();
  }

  function applyFavoriteFilter() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return 0;
    removeFavoriteEmptyRow();
    const favorites = readFavorites();
    let visible = 0;
    [...tbody.querySelectorAll(':scope > tr')].forEach(row => {
      if (row.querySelector('.empty-state')) return;
      const show = !favoritesMode || isFavoriteRow(row, favorites);
      row.hidden = !show;
      row.classList.toggle('personalization-favorite-match', favoritesMode && show);
      if (show) visible += 1;
    });
    if (favoritesMode && visible === 0) {
      const row = document.createElement('tr');
      row.dataset.personalizationEmpty = 'true';
      const cell = document.createElement('td');
      cell.colSpan = Math.max(1, document.querySelectorAll('#headerRow > th').length);
      cell.className = 'registry-personalization-empty';
      cell.innerHTML = '<strong>Nuk ke favorite në këtë rezultat.</strong><span>Shto një bar me ★ dhe do të shfaqet këtu menjëherë.</span>';
      row.appendChild(cell);
      tbody.appendChild(row);
    }
    return visible;
  }

  function updateFavoriteCounters() {
    const count = readFavorites().size;
    document.querySelectorAll('#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],.nav-mini-count[data-favorites-count]').forEach(node => {
      node.textContent = String(count);
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
    if (banner) return;
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    banner = document.createElement('div');
    banner.id = 'registryFavoritesBanner';
    banner.className = 'registry-favorites-banner';
    banner.innerHTML = '<span><b>★ Favoritet</b> · po shfaqen vetëm barnat e tua të ruajtura</span><button type="button" data-exit-favorites>Shfaq të gjitha</button>';
    toolbar.insertAdjacentElement('afterend', banner);
  }

  function enterFavorites() {
    const select = ensureAllRowsOption();
    if (!select) return;
    if (!favoritesMode) {
      previousPageSize = select.value && select.value !== ALL_ROWS_PAGE_SIZE ? select.value : '50';
      favoritesMode = true;
    }
    updateFavoriteNavState();
    ensureFavoritesBanner();
    if (select.value !== ALL_ROWS_PAGE_SIZE) {
      select.value = ALL_ROWS_PAGE_SIZE;
      select.dispatchEvent(new Event('change', { bubbles:true }));
    }
    try { history.replaceState(null, '', `${location.pathname}${location.search}#favoritet`); } catch {}
    schedule(2);
    window.setTimeout(() => document.getElementById('registryContent')?.focus({ preventScroll:true }), 80);
  }

  function exitFavorites() {
    if (!favoritesMode) return;
    favoritesMode = false;
    updateFavoriteNavState();
    ensureFavoritesBanner();
    removeFavoriteEmptyRow();
    const select = document.getElementById('pageSize');
    if (select) {
      const target = previousPageSize && previousPageSize !== ALL_ROWS_PAGE_SIZE ? previousPageSize : '50';
      select.value = [...select.options].some(option => option.value === target) ? target : '50';
      select.dispatchEvent(new Event('change', { bubbles:true }));
    }
    previousPageSize = '';
    try { history.replaceState(null, '', `${location.pathname}${location.search}`); } catch {}
    schedule(2);
  }

  function refresh() {
    scheduled = false;
    ensureNoteHeader();
    const visible = applyFavoriteFilter();
    const notes = readNotes();
    document.querySelectorAll('#tbody > tr').forEach(row => renderNoteCell(row, notes));
    updateFavoriteCounters();
    updateFavoriteNavState();
    ensureFavoritesBanner();
    if (favoritesMode) {
      const badge = document.getElementById('countBadge');
      if (badge) badge.textContent = `${visible} favorite`;
    }
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
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');
    if (tbody && !observer) {
      observer = new MutationObserver(() => schedule(1));
      observer.observe(tbody, { childList:true, subtree:false });
      if (header) observer.observe(header, { childList:true, subtree:false });
    }

    document.addEventListener('click', event => {
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
      if (event.target.matches('[data-personal-note]')) queueNoteSave(event.target);
    });
    document.addEventListener('blur', event => {
      if (!event.target.matches?.('[data-personal-note]')) return;
      const key = clean(event.target.dataset.personalNote);
      const timer = noteTimers.get(key);
      if (timer) clearTimeout(timer);
      noteTimers.delete(key);
      persistNote(event.target);
    }, true);

    document.addEventListener('change', event => {
      if (event.target.closest?.('.drug-action-item.favorite') || event.target.matches?.('.drug-action-item.favorite input')) {
        window.setTimeout(() => schedule(1), 30);
      }
    }, true);

    ['medindex:registry-data-ready','medindex:registry-ready','medindex:registry-table-stable','medindex:library-ready','medindex:library-synced']
      .forEach(name => window.addEventListener(name, () => schedule(1)));
    window.addEventListener('storage', event => {
      if ([FAVORITES_KEY, NOTES_KEY].includes(event.key)) schedule(1);
    });

    window.setInterval(() => {
      updateFavoriteCounters();
      if (favoritesMode) schedule(1);
    }, 1200);

    schedule(1);
    if (location.hash.toLowerCase() === '#favoritet') window.setTimeout(enterFavorites, 150);
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
