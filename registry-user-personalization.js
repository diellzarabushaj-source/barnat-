(() => {
  'use strict';

  const VERSION = 'registry-user-personalization-v3.2.0';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const PERSONAL_COLUMN_KEY = 'personal-note';
  const NOTE_MAX = 2000;
  const VIEW_ALL = 'all';
  const VIEW_FAVORITES = 'favorites';
  const VIEW_NOTES = 'notes';

  let favorites = loadFavorites();
  let notes = loadNotes();
  let activeView = viewFromLocation();
  let scheduled = false;
  let activeNoteKey = '';
  let activeNoteRow = null;
  let personalRuntimeRequested = false;

  const favoriteInFlight = new Set();
  const noteInFlight = new Set();
  const pendingSync = new Set();

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const syncToken = (kind, key) => `${kind}:${clean(key)}`;

  function viewFromLocation() {
    const hash = location.hash.toLowerCase();
    if (hash === '#favoritet') return VIEW_FAVORITES;
    if (hash === '#shenimet' || hash === '#shënimet') return VIEW_NOTES;
    return VIEW_ALL;
  }

  function loadFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);
    } catch { return new Set(); }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); return true; }
    catch { return false; }
  }

  function loadNotes() {
    try {
      const value = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      const output = {};
      Object.entries(value).forEach(([key, entry]) => {
        const safeKey = clean(key).slice(0, 300);
        if (!safeKey) return;
        const raw = typeof entry === 'string' ? { text:entry, updatedAt:'' } : entry;
        if (!raw || typeof raw !== 'object') return;
        const text = String(raw.text ?? '').slice(0, NOTE_MAX);
        if (!text.trim()) return;
        output[safeKey] = { text, updatedAt:clean(raw.updatedAt) };
      });
      return output;
    } catch { return {}; }
  }

  function saveNotes() {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); return true; }
    catch { return false; }
  }

  function runtime() { return window.MedIndexRegistryRuntime || null; }

  function registryNumber(row) {
    const direct = clean(
      row?.dataset?.registryNumber
      || row?.querySelector?.('.drug-select')?.dataset?.registryNumber
      || row?.querySelector?.('[data-registry-number]')?.dataset?.registryNumber
    );
    if (direct) return direct;
    const cell = row?.querySelector?.('[data-registry-column-key="number"],[data-column-key="Nr rendor"]');
    return clean(cell?.textContent).match(/\d+/)?.[0] || '';
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
    return clean(row?.querySelector?.('[data-registry-column-key="atc"],[data-registry-column-key="atc-code"],[data-column-key="ATC Code"],[data-column-key="atc"]')?.textContent).toUpperCase();
  }

  function drugKey(row) {
    return clean(row?.querySelector?.('.drug-select')?.dataset?.drugKey || row?.dataset?.drugKey);
  }

  function primaryFavoriteKey(row) {
    return drugKey(row)
      || registryNumber(row)
      || (drugName(row) && atc(row) ? `${drugName(row)}|${atc(row)}` : drugName(row));
  }

  function favoriteCandidates(row) {
    const values = new Set();
    const add = value => { const item = clean(value); if (item) values.add(item); };
    add(primaryFavoriteKey(row));
    add(drugKey(row));
    add(row?.dataset?.registryNumber);
    add(row?.querySelector?.('.drug-select')?.dataset?.registryNumber);
    const nr = registryNumber(row);
    const name = drugName(row);
    const code = atc(row);
    add(nr); add(name);
    if (nr && name) add(`${nr}|${name}`);
    if (name && code) add(`${name}|${code}`);
    return values;
  }

  function isFavoriteRow(row) {
    for (const candidate of favoriteCandidates(row)) if (favorites.has(candidate)) return true;
    return false;
  }

  function noteKey(row) {
    const nr = registryNumber(row);
    if (nr) return `registry:${nr}`;
    const key = drugKey(row);
    if (key) return `drug:${key}`.slice(0, 300);
    return `fallback:${drugName(row)}|${atc(row)}`.slice(0, 300);
  }

  function hasNoteRow(row) {
    const entry = notes[noteKey(row)];
    return Boolean(entry && String(entry.text || '').trim());
  }

  function noteCount() {
    return Object.values(notes).filter(entry => String(entry?.text || '').trim()).length;
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
    cell.appendChild(button);
    return button;
  }

  function noteButton(row) {
    const cell = nameCell(row);
    if (!cell) return null;
    let button = cell.querySelector(':scope > [data-row-note-toggle]');
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'registry-row-note-toggle';
    button.dataset.rowNoteToggle = 'true';
    button.dataset.registryUiOnly = 'true';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.7-10.7a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 7.5 3 3"/></svg>';
    cell.appendChild(button);
    return button;
  }

  function paintRowActions(row) {
    if (!(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;
    const favoriteKey = primaryFavoriteKey(row);
    const favorite = favoriteButton(row);
    if (favorite) {
      const active = isFavoriteRow(row);
      const name = drugName(row) || 'barin';
      const inFlight = favoriteInFlight.has(favoriteKey);
      const pending = pendingSync.has(syncToken('favorite', favoriteKey));
      favorite.disabled = inFlight;
      favorite.classList.toggle('is-favorite', active);
      favorite.classList.toggle('is-syncing', inFlight);
      favorite.classList.toggle('is-pending-sync', pending && !inFlight);
      favorite.setAttribute('aria-busy', String(inFlight));
      favorite.setAttribute('aria-pressed', String(active));
      favorite.setAttribute('aria-label', inFlight
        ? `Duke ruajtur Favoritet për ${name}`
        : active ? `Hiqe ${name} nga Favoritet${pending ? ' · sinkronizimi në pritje' : ''}` : `Shto ${name} te Favoritet${pending ? ' · sinkronizimi në pritje' : ''}`);
      favorite.title = inFlight ? 'Duke ruajtur…' : pending ? 'Ruajtur lokalisht · sinkronizimi në pritje' : active ? 'Hiqe nga Favoritet' : 'Shto te Favoritet';
      row.classList.toggle('is-favorite', active);
    }

    const key = noteKey(row);
    const note = noteButton(row);
    if (note) {
      const active = hasNoteRow(row);
      const name = drugName(row) || 'barin';
      const inFlight = noteInFlight.has(key);
      const pending = pendingSync.has(syncToken('note', key));
      note.disabled = inFlight;
      note.classList.toggle('has-note', active);
      note.classList.toggle('is-syncing', inFlight);
      note.classList.toggle('is-pending-sync', pending && !inFlight);
      note.setAttribute('aria-busy', String(inFlight));
      note.setAttribute('aria-pressed', String(active));
      note.setAttribute('aria-label', inFlight
        ? `Duke ruajtur shënimin për ${name}`
        : active ? `Shiko ose ndrysho shënimin për ${name}${pending ? ' · sinkronizimi në pritje' : ''}` : `Shto shënim për ${name}`);
      note.title = inFlight ? 'Duke ruajtur…' : pending ? 'Ruajtur lokalisht · sinkronizimi në pritje' : active ? 'Shiko/ndrysho shënimin' : 'Shto shënim';
    }
  }

  function stripLegacyNoteColumn() {
    document.querySelectorAll(`[data-registry-column-key="${PERSONAL_COLUMN_KEY}"], [data-column-key="${PERSONAL_COLUMN_KEY}"]`).forEach(node => {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
    });
  }

  function ensureNoteDialog() {
    let dialog = document.getElementById('registryNoteDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'registryNoteDialog';
    dialog.className = 'registry-note-dialog';
    dialog.innerHTML = `<form method="dialog" class="registry-note-dialog-card" data-note-dialog-form>
      <div class="registry-note-dialog-head">
        <div><small>Shënim personal</small><h2 data-note-dialog-title>Shënim</h2></div>
        <button type="button" class="registry-note-dialog-close" data-note-dialog-close aria-label="Mbyll">×</button>
      </div>
      <textarea rows="6" maxlength="${NOTE_MAX}" data-note-dialog-text placeholder="Shkruaj shënimin tënd personal…"></textarea>
      <div class="registry-note-dialog-meta"><span data-note-dialog-status aria-live="polite"></span><span data-note-dialog-length>0 / ${NOTE_MAX}</span></div>
      <div class="registry-note-dialog-actions">
        <button type="button" class="registry-note-delete" data-note-dialog-delete>Fshije</button>
        <span></span>
        <button type="button" class="registry-note-cancel" data-note-dialog-close>Anulo</button>
        <button type="button" class="registry-note-save" data-note-dialog-save>Ruaj shënimin</button>
      </div>
    </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function setDialogBusy(busy, message = '') {
    const dialog = ensureNoteDialog();
    dialog.querySelectorAll('[data-note-dialog-save],[data-note-dialog-delete],[data-note-dialog-close]').forEach(button => { button.disabled = Boolean(busy); });
    const textarea = dialog.querySelector('[data-note-dialog-text]');
    if (textarea) textarea.readOnly = Boolean(busy);
    const status = dialog.querySelector('[data-note-dialog-status]');
    if (status && message) status.textContent = message;
    dialog.setAttribute('aria-busy', String(Boolean(busy)));
  }

  function closeNoteDialog() {
    const dialog = document.getElementById('registryNoteDialog');
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
    setDialogBusy(false);
    activeNoteKey = '';
    activeNoteRow = null;
  }

  function openNoteDialog(row) {
    if (!(row instanceof HTMLElement)) return;
    const key = noteKey(row);
    if (!key || noteInFlight.has(key)) return;
    activeNoteKey = key;
    activeNoteRow = row;
    const dialog = ensureNoteDialog();
    const textarea = dialog.querySelector('[data-note-dialog-text]');
    const existing = notes[key]?.text || '';
    textarea.readOnly = false;
    textarea.value = existing;
    dialog.querySelector('[data-note-dialog-title]').textContent = drugName(row) || 'Bari';
    dialog.querySelector('[data-note-dialog-status]').textContent = pendingSync.has(syncToken('note', key))
      ? 'Ruajtur lokalisht · sinkronizimi është në pritje.'
      : existing ? 'Shënimi ruhet vetëm në bibliotekën tënde.' : 'Vetëm për ty.';
    dialog.querySelector('[data-note-dialog-length]').textContent = `${textarea.value.length} / ${NOTE_MAX}`;
    dialog.querySelector('[data-note-dialog-delete]').hidden = !existing.trim();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    requestAnimationFrame(() => textarea.focus({ preventScroll:true }));
  }

  async function syncMutation(kind, key) {
    const token = syncToken(kind, key);
    pendingSync.add(token);
    schedule(1);
    try {
      const sync = window.MedIndexUserLibrary?.syncNow;
      if (typeof sync !== 'function') return false;
      const synced = await sync();
      if (synced) pendingSync.delete(token);
      return Boolean(synced);
    } catch {
      return false;
    } finally {
      schedule(1);
    }
  }

  async function persistActiveNote({ remove = false } = {}) {
    if (!activeNoteKey || noteInFlight.has(activeNoteKey)) return;
    const key = activeNoteKey;
    const row = activeNoteRow;
    const dialog = ensureNoteDialog();
    const textarea = dialog.querySelector('[data-note-dialog-text]');
    const text = remove ? '' : String(textarea.value || '').slice(0, NOTE_MAX);
    const previous = notes[key] ? { ...notes[key] } : null;

    noteInFlight.add(key);
    setDialogBusy(true, 'Duke ruajtur…');
    if (text.trim()) notes[key] = { text, updatedAt:new Date().toISOString() };
    else delete notes[key];

    if (!saveNotes()) {
      if (previous) notes[key] = previous;
      else delete notes[key];
      noteInFlight.delete(key);
      setDialogBusy(false, 'Shënimi nuk u ruajt në këtë pajisje. Provo përsëri.');
      return;
    }

    updateCounts();
    updateViewBanner();
    paintRowActions(row);
    runtime()?.refreshNotes?.();
    window.dispatchEvent(new CustomEvent('medindex:personal-note-saved', { detail:{ key, hasText:Boolean(text.trim()) } }));
    window.dispatchEvent(new CustomEvent('medindex:notes-changed', { detail:{ key, count:noteCount(), hasNote:Boolean(text.trim()) } }));

    const synced = await syncMutation('note', key);
    noteInFlight.delete(key);
    paintRowActions(row);
    setDialogBusy(false, synced ? 'Sinkronizuar.' : 'Ruajtur lokalisht · sinkronizimi është në pritje.');
    closeNoteDialog();
    schedule(2);
  }

  async function toggleFavorite(row, button) {
    if (!(row instanceof HTMLElement)) return;
    const key = primaryFavoriteKey(row);
    if (!key || favoriteInFlight.has(key) || button?.disabled) return;

    const before = new Set(favorites);
    const active = isFavoriteRow(row);
    favoriteInFlight.add(key);
    if (active) favoriteCandidates(row).forEach(candidate => favorites.delete(candidate));
    else favorites.add(key);

    if (!saveFavorites()) {
      favorites = before;
      favoriteInFlight.delete(key);
      paintRowActions(row);
      return;
    }

    paintRowActions(row);
    updateCounts();
    updateViewBanner();
    runtime()?.refreshFavorites?.();
    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', {
      detail:{ count:favorites.size, favorite:!active, key }
    }));

    await syncMutation('favorite', key);
    favoriteInFlight.delete(key);
    paintRowActions(row);
    schedule(2);
  }

  function ensureSidebarNotes() {
    const favorite = document.querySelector('[data-nav="favorites"]');
    if (!favorite || document.querySelector('[data-nav="notes"]')) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = favorite.className;
    item.dataset.nav = 'notes';
    item.setAttribute('aria-label', 'Shënimet');
    item.innerHTML = `<span class="app-menu-icon mi-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span class="app-menu-title mi-menu-label">Shënimet</span><span class="nav-mini-count mi-menu-badge" id="notesNavCount">${noteCount()}</span>`;
    favorite.insertAdjacentElement('afterend', item);
  }

  function ensureToolbarViews() {
    if (document.getElementById('registryPersonalViews')) return;
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    const group = document.createElement('div');
    group.id = 'registryPersonalViews';
    group.className = 'registry-personal-view-actions';
    group.setAttribute('aria-label', 'Pamja personale');
    group.innerHTML = `<button type="button" data-personal-view="favorites"><span aria-hidden="true">☆</span> Favoritet <b data-toolbar-favorite-count>${favorites.size}</b></button><button type="button" data-personal-view="notes"><span aria-hidden="true">✎</span> Shënimet <b data-toolbar-note-count>${noteCount()}</b></button>`;
    const countBadge = document.getElementById('countBadge');
    if (countBadge) countBadge.insertAdjacentElement('beforebegin', group);
    else toolbar.appendChild(group);
  }

  function updateCounts() {
    document.querySelectorAll('#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],[data-toolbar-favorite-count]').forEach(node => {
      node.textContent = String(favorites.size);
      node.setAttribute('aria-label', `${favorites.size} favorite`);
    });
    const total = noteCount();
    document.querySelectorAll('#notesNavCount,[data-note-count],[data-toolbar-note-count]').forEach(node => {
      node.textContent = String(total);
      node.setAttribute('aria-label', `${total} shënime`);
    });
  }

  function updateViewNav() {
    const set = (selector, active) => document.querySelectorAll(selector).forEach(button => {
      button.classList.toggle('active', active);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    set('[data-nav="favorites"],[data-mi-shell-action="favorites"],[data-personal-view="favorites"]', activeView === VIEW_FAVORITES);
    set('[data-nav="notes"],[data-mi-shell-action="notes"],[data-personal-view="notes"]', activeView === VIEW_NOTES);
    document.body.classList.toggle('medindex-favorites-only', activeView === VIEW_FAVORITES);
    document.body.classList.toggle('medindex-notes-only', activeView === VIEW_NOTES);
  }

  function ensureViewBanner() {
    let banner = document.getElementById('registryPersonalViewBanner');
    if (activeView === VIEW_ALL) { banner?.remove(); return null; }
    if (!banner) {
      const toolbar = document.querySelector('.toolbar');
      if (!toolbar) return null;
      banner = document.createElement('div');
      banner.id = 'registryPersonalViewBanner';
      banner.className = 'registry-personal-view-banner';
      banner.innerHTML = '<span><b data-personal-banner-title></b><small data-personal-banner-copy></small></span><button type="button" data-personal-view="all">Të gjitha barnat</button>';
      toolbar.insertAdjacentElement('afterend', banner);
    }
    return banner;
  }

  function updateViewBanner() {
    const banner = ensureViewBanner();
    if (!banner) return;
    const title = banner.querySelector('[data-personal-banner-title]');
    const copy = banner.querySelector('[data-personal-banner-copy]');
    const loading = document.body.classList.contains('medindex-personal-view-loading');
    if (activeView === VIEW_FAVORITES) {
      title.textContent = '★ Favoritet';
      copy.textContent = loading ? 'Duke përgatitur Favoritet…' : `${favorites.size} ${favorites.size === 1 ? 'bar i ruajtur' : 'barna të ruajtura'} · vetëm të tuat`;
    } else {
      const total = noteCount();
      title.textContent = '✎ Shënimet';
      copy.textContent = loading ? 'Duke përgatitur Shënimet…' : total ? `${total} ${total === 1 ? 'bar me shënim' : 'barna me shënime'} · vetëm të tuat` : 'Nuk ke ende shënime.';
    }
  }

  function updateEmptyState() {
    document.getElementById('registryPersonalEmpty')?.remove();
    if (activeView === VIEW_ALL || document.body.classList.contains('medindex-personal-view-loading')) return;
    const total = activeView === VIEW_FAVORITES ? favorites.size : noteCount();
    if (total) return;
    const empty = document.createElement('div');
    empty.id = 'registryPersonalEmpty';
    empty.className = 'registry-personal-empty';
    empty.innerHTML = activeView === VIEW_FAVORITES
      ? '<strong>Ende nuk ke barna të ruajtura.</strong><span>Kliko yllin pranë një bari për ta shtuar në Favoritet.</span><button type="button" data-personal-view="all">Të gjitha barnat</button>'
      : '<strong>Nuk ke ende shënime.</strong><span>Kliko ikonën e lapsit pranë një bari për të shtuar një shënim personal.</span><button type="button" data-personal-view="all">Të gjitha barnat</button>';
    document.getElementById('registryContent')?.insertAdjacentElement('beforebegin', empty);
  }

  function applyRuntimeView() {
    const api = runtime();
    if (!api) return false;
    document.body.classList.remove('medindex-personal-view-loading');
    if (api.setPersonalView) api.setPersonalView(activeView);
    else {
      api.setFavoritesOnly?.(activeView === VIEW_FAVORITES);
      api.setNotesOnly?.(activeView === VIEW_NOTES);
    }
    personalRuntimeRequested = false;
    updateViewBanner();
    updateEmptyState();
    return true;
  }

  function requestPersonalRuntime() {
    if (activeView === VIEW_ALL || runtime()) return;
    document.body.classList.add('medindex-personal-view-loading');
    updateViewBanner();
    if (personalRuntimeRequested) return;
    personalRuntimeRequested = true;
    const requested = window.MEDINDEX_LOAD_FULL_REGISTRY?.(`personal-view-${activeView}`);
    if (requested === false) personalRuntimeRequested = false;
  }

  function setView(view) {
    activeView = [VIEW_ALL, VIEW_FAVORITES, VIEW_NOTES].includes(view) ? view : VIEW_ALL;
    try {
      const suffix = activeView === VIEW_FAVORITES ? '#favoritet' : activeView === VIEW_NOTES ? '#shenimet' : '';
      history.replaceState(null, '', `${location.pathname}${location.search}${suffix}`);
    } catch {}
    document.getElementById('registryPersonalEmpty')?.remove();
    updateViewNav();
    updateViewBanner();
    if (!applyRuntimeView()) {
      if (activeView === VIEW_ALL) document.body.classList.remove('medindex-personal-view-loading');
      else requestPersonalRuntime();
    }
    updateEmptyState();
    schedule(2);
  }

  function refresh() {
    scheduled = false;
    favorites = loadFavorites();
    notes = loadNotes();
    ensureSidebarNotes();
    ensureToolbarViews();
    stripLegacyNoteColumn();
    document.querySelectorAll('#tbody > tr').forEach(paintRowActions);
    updateCounts();
    updateViewNav();
    updateViewBanner();
    updateEmptyState();
    document.documentElement.dataset.registryPersonalization = VERSION;
  }

  function schedule(frames = 1) {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      if (frames > 1) { frames -= 1; requestAnimationFrame(run); }
      else requestAnimationFrame(refresh);
    };
    run();
  }

  function bind() {
    ensureNoteDialog();
    document.addEventListener('click', event => {
      const favorite = event.target.closest('[data-row-favorite-toggle]');
      if (favorite) {
        event.preventDefault(); event.stopImmediatePropagation();
        void toggleFavorite(favorite.closest('tr'), favorite); return;
      }
      const note = event.target.closest('[data-row-note-toggle]');
      if (note) {
        event.preventDefault(); event.stopImmediatePropagation();
        openNoteDialog(note.closest('tr')); return;
      }
      if (event.target.closest('[data-note-dialog-close]')) { event.preventDefault(); closeNoteDialog(); return; }
      if (event.target.closest('[data-note-dialog-save]')) { event.preventDefault(); void persistActiveNote(); return; }
      if (event.target.closest('[data-note-dialog-delete]')) { event.preventDefault(); void persistActiveNote({ remove:true }); return; }
      const viewButton = event.target.closest('[data-personal-view]');
      if (viewButton) { event.preventDefault(); setView(viewButton.dataset.personalView || VIEW_ALL); return; }
      if (event.target.closest('[data-nav="favorites"],[data-mi-shell-action="favorites"]')) {
        event.preventDefault(); event.stopImmediatePropagation(); setView(VIEW_FAVORITES); return;
      }
      if (event.target.closest('[data-nav="notes"],[data-mi-shell-action="notes"]')) {
        event.preventDefault(); event.stopImmediatePropagation(); setView(VIEW_NOTES); return;
      }
      const home = event.target.closest('[data-nav="home"]');
      if (home && activeView !== VIEW_ALL) {
        event.preventDefault(); event.stopImmediatePropagation(); setView(VIEW_ALL);
      }
    }, true);

    document.addEventListener('input', event => {
      if (!event.target.matches?.('[data-note-dialog-text]')) return;
      const length = document.querySelector('#registryNoteDialog [data-note-dialog-length]');
      if (length) length.textContent = `${event.target.value.length} / ${NOTE_MAX}`;
    }, true);

    document.addEventListener('keydown', event => {
      if (!event.target.matches?.('[data-note-dialog-text]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void persistActiveNote(); }
      else if (event.key === 'Escape' && !noteInFlight.has(activeNoteKey)) { event.preventDefault(); closeNoteDialog(); }
    }, true);

    window.addEventListener('medindex:tailadmin-ready', () => schedule(1));
    window.addEventListener('medindex:registry-rendered', () => schedule(1));
    window.addEventListener('medindex:registry-page-ready', () => schedule(1));
    window.addEventListener('medindex:desktop-lite-ready', () => {
      if (activeView !== VIEW_ALL) requestPersonalRuntime();
      schedule(1);
    });
    window.addEventListener('medindex:registry-ready', () => {
      applyRuntimeView();
      schedule(1);
    });
    window.addEventListener('medindex:library-ready', () => schedule(1));
    window.addEventListener('medindex:library-synced', () => {
      pendingSync.clear();
      schedule(1);
    });
    window.addEventListener('medindex:library-pending', () => schedule(1));
    window.addEventListener('storage', event => {
      if (event.key === FAVORITES_KEY || event.key === NOTES_KEY) {
        if (event.key === FAVORITES_KEY) runtime()?.refreshFavorites?.();
        if (event.key === NOTES_KEY) runtime()?.refreshNotes?.();
        schedule(1);
      }
    });
    window.addEventListener('hashchange', () => setView(viewFromLocation()));

    schedule(1);
    if (activeView !== VIEW_ALL) window.setTimeout(() => setView(activeView), 80);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  window.MedIndexRegistryPersonalization = Object.freeze({
    version:VERSION,
    refresh:() => schedule(1),
    showFavorites:() => setView(VIEW_FAVORITES),
    showNotes:() => setView(VIEW_NOTES),
    showAll:() => setView(VIEW_ALL),
    setView,
    getView:() => activeView,
    isFavoritesMode:() => activeView === VIEW_FAVORITES,
    isNotesMode:() => activeView === VIEW_NOTES,
    favoriteCount:() => favorites.size,
    noteCount,
    pendingSyncCount:() => pendingSync.size,
  });
})();