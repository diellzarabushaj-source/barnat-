(() => {
  'use strict';

  const VERSION = 'registry-ux-phase3-v1.0.1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const MAX_RECENT_NOTES = 8;

  let rawSource = null;
  let rawByNumber = new Map();
  let rawByDrugKey = new Map();
  let scheduled = false;
  let noteStorageSnapshot = '';
  let noteEntryCache = [];

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function favoriteCount() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(value) ? value.length : 0;
    } catch {
      return 0;
    }
  }

  function noteEntries() {
    let serialized = '{}';
    try { serialized = localStorage.getItem(NOTES_KEY) || '{}'; } catch {}
    if (serialized === noteStorageSnapshot) return noteEntryCache;
    noteStorageSnapshot = serialized;
    try {
      const value = JSON.parse(serialized);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        noteEntryCache = [];
        return noteEntryCache;
      }
      noteEntryCache = Object.entries(value)
        .map(([key, raw]) => {
          const entry = typeof raw === 'string' ? { text:raw, updatedAt:'' } : (raw || {});
          return {
            key,
            text:String(entry.text ?? '').trim(),
            updatedAt:clean(entry.updatedAt),
          };
        })
        .filter(entry => entry.key && entry.text)
        .sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return noteEntryCache;
    } catch {
      noteEntryCache = [];
      return noteEntryCache;
    }
  }

  function refreshRawIndex() {
    const rows = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
    if (rows === rawSource) return;
    rawSource = rows;
    rawByNumber = new Map();
    rawByDrugKey = new Map();
    rows.forEach(row => {
      const number = clean(row?.['Nr rendor']);
      if (number && !rawByNumber.has(number)) rawByNumber.set(number, row);
      const drugKey = [row?.PDID, row?.['Emri tregtar'], row?.['Fortësia']].map(clean).join('|');
      if (drugKey && !rawByDrugKey.has(drugKey)) rawByDrugKey.set(drugKey, row);
    });
  }

  function rawForNoteKey(key) {
    refreshRawIndex();
    if (key.startsWith('registry:')) return rawByNumber.get(clean(key.slice(9))) || null;
    if (key.startsWith('drug:')) return rawByDrugKey.get(clean(key.slice(5))) || null;
    return null;
  }

  function noteLabel(entry) {
    const raw = rawForNoteKey(entry.key);
    const name = clean(raw?.['Emri tregtar']);
    const strength = clean(raw?.Fortësia);
    return {
      name:name || 'Bar i ruajtur',
      strength,
      subtitle:clean(raw?.['Substanca aktive']),
    };
  }

  function workspaceShell() {
    let shell = document.getElementById('registryPersonalWorkspace');
    if (shell) return shell;
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return null;

    shell = document.createElement('div');
    shell.id = 'registryPersonalWorkspace';
    shell.className = 'registry-personal-workspace';
    shell.dataset.registryUiOnly = 'true';
    shell.innerHTML = `
      <button type="button" class="registry-workspace-trigger" data-workspace-trigger aria-haspopup="dialog" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
        <span class="registry-workspace-label">Shënimet</span>
        <span class="registry-workspace-count" data-workspace-note-count>0</span>
      </button>
      <div class="registry-workspace-panel" data-workspace-panel role="dialog" aria-label="Shënimet personale" hidden>
        <div class="registry-workspace-panel-head">
          <span><strong>Shënimet personale</strong><small>Hap barin me një klik</small></span>
          <button type="button" data-workspace-close aria-label="Mbylle">×</button>
        </div>
        <div class="registry-workspace-list" data-workspace-list></div>
        <div class="registry-workspace-foot"><span data-workspace-favorite-count></span><span>Ruajtje automatike</span></div>
      </div>`;

    const quickFavorites = document.getElementById('registryQuickFavorites');
    if (quickFavorites) quickFavorites.insertAdjacentElement('afterend', shell);
    else {
      const pageSize = document.getElementById('pageSize');
      if (pageSize) pageSize.insertAdjacentElement('beforebegin', shell);
      else toolbar.appendChild(shell);
    }
    return shell;
  }

  function renderWorkspacePanel({ renderList = false, entries = noteEntries() } = {}) {
    const shell = workspaceShell();
    if (!shell) return;
    const count = shell.querySelector('[data-workspace-note-count]');
    if (count) count.textContent = String(entries.length);
    const fav = shell.querySelector('[data-workspace-favorite-count]');
    if (fav) fav.textContent = `★ ${favoriteCount()} favorite`;

    const panel = shell.querySelector('[data-workspace-panel]');
    if (!renderList && panel?.hidden) return;
    const list = shell.querySelector('[data-workspace-list]');
    if (!list) return;
    list.replaceChildren();

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'registry-workspace-empty';
      empty.innerHTML = '<strong>Ende s’ke shënime.</strong><span>Shkruaj direkt në kolonën “Shënime personale” dhe do të dalin këtu.</span>';
      list.appendChild(empty);
      return;
    }

    entries.slice(0, MAX_RECENT_NOTES).forEach(entry => {
      const label = noteLabel(entry);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'registry-workspace-note-item';
      button.dataset.workspaceNoteKey = entry.key;
      button.dataset.workspaceNoteName = label.name;
      button.innerHTML = '<span class="registry-workspace-note-icon" aria-hidden="true">✎</span><span class="registry-workspace-note-copy"><strong></strong><small></small><em></em></span><span class="registry-workspace-note-arrow" aria-hidden="true">›</span>';
      button.querySelector('strong').textContent = label.strength ? `${label.name} · ${label.strength}` : label.name;
      button.querySelector('small').textContent = label.subtitle || 'Shënim personal';
      button.querySelector('em').textContent = entry.text;
      list.appendChild(button);
    });

    if (entries.length > MAX_RECENT_NOTES) {
      const more = document.createElement('div');
      more.className = 'registry-workspace-more';
      more.textContent = `+${entries.length - MAX_RECENT_NOTES} shënime të tjera`;
      list.appendChild(more);
    }
  }

  function setPanelOpen(open) {
    const shell = workspaceShell();
    if (!shell) return;
    const trigger = shell.querySelector('[data-workspace-trigger]');
    const panel = shell.querySelector('[data-workspace-panel]');
    if (!trigger || !panel) return;
    if (open) renderWorkspacePanel({ renderList:true });
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    shell.classList.toggle('is-open', open);
  }

  function rowNoteTextarea(row) {
    return row?.querySelector?.('[data-personal-note]') || null;
  }

  function ensureRowNoteJump(row) {
    if (!(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;
    const nameCell = row.querySelector('[data-registry-column-key="trade-name"],td.name');
    const textarea = rowNoteTextarea(row);
    if (!nameCell || !textarea) return;

    let button = nameCell.querySelector(':scope > [data-row-note-jump]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'registry-row-note-jump';
      button.dataset.rowNoteJump = 'true';
      button.dataset.registryUiOnly = 'true';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h4l10-10a2.8 2.8 0 0 0-4-4L5 15v4Z"/><path d="m13.5 6.5 4 4"/></svg><span class="registry-row-note-dot" aria-hidden="true"></span>';
      const favorite = nameCell.querySelector(':scope > [data-row-favorite-toggle]');
      if (favorite) favorite.insertAdjacentElement('afterend', button);
      else nameCell.appendChild(button);
    }

    const hasNote = Boolean(String(textarea.value || '').trim());
    row.classList.toggle('has-personal-note', hasNote);
    button.classList.toggle('has-note', hasNote);
    button.dataset.noteKey = clean(textarea.dataset.personalNote);
    const name = clean(row.dataset.drugName) || clean(nameCell.querySelector('.drug-name-text')?.textContent) || 'barin';
    button.setAttribute('aria-label', hasNote ? `Hape shënimin personal për ${name}` : `Shto shënim personal për ${name}`);
    button.title = hasNote ? 'Ka shënim personal · hape' : 'Shto shënim';
  }

  function focusTextarea(textarea) {
    if (!textarea) return false;
    textarea.focus({ preventScroll:true });
    textarea.scrollIntoView({ block:'center', inline:'nearest', behavior:'auto' });
    const length = textarea.value.length;
    try { textarea.setSelectionRange(length, length); } catch {}
    return true;
  }

  function focusNoteByKey(key) {
    const selectorKey = window.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
    return focusTextarea(document.querySelector(`[data-personal-note="${selectorKey}"]`));
  }

  function navigateToNote(key, fallbackName = '') {
    setPanelOpen(false);
    if (focusNoteByKey(key)) return;

    const raw = rawForNoteKey(key);
    const name = clean(raw?.['Emri tregtar']) || clean(fallbackName);
    if (!name) return;

    window.MedIndexRegistryPersonalization?.showAll?.();
    const search = document.getElementById('search');
    if (!search) return;
    search.value = name;

    const tryFocus = () => {
      if (focusNoteByKey(key)) return;
      const byName = [...document.querySelectorAll('#tbody > tr')].find(row => clean(row.querySelector('.drug-name-text')?.textContent).toLowerCase() === name.toLowerCase());
      focusTextarea(rowNoteTextarea(byName));
    };
    window.addEventListener('medindex:registry-rendered', tryFocus, { once:true, passive:true });
    search.dispatchEvent(new Event('input', { bubbles:true }));
    requestAnimationFrame(tryFocus);
  }

  function enrichFavoritesBanner(noteCount) {
    const banner = document.getElementById('registryFavoritesBanner');
    if (!banner) return;
    let badge = banner.querySelector('[data-workspace-banner-notes]');
    if (!badge) {
      badge = document.createElement('em');
      badge.className = 'registry-workspace-banner-notes';
      badge.dataset.workspaceBannerNotes = 'true';
      const copy = banner.querySelector('[data-favorites-banner-copy]');
      if (copy) copy.insertAdjacentElement('afterend', badge);
    }
    if (badge) badge.textContent = `✎ ${noteCount} shënime`;
  }

  function refreshRows() {
    document.querySelectorAll('#tbody > tr').forEach(ensureRowNoteJump);
  }

  function refresh() {
    scheduled = false;
    const entries = noteEntries();
    workspaceShell();
    renderWorkspacePanel({ entries });
    refreshRows();
    enrichFavoritesBanner(entries.length);
    document.documentElement.dataset.registryUxPhase3 = VERSION;
    document.body?.classList.add('registry-ux-phase3-ready');
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  function bind() {
    scheduleRefresh();

    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-workspace-trigger]');
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        const shell = workspaceShell();
        setPanelOpen(!shell?.classList.contains('is-open'));
        return;
      }
      if (event.target.closest('[data-workspace-close]')) {
        event.preventDefault();
        setPanelOpen(false);
        return;
      }
      const noteItem = event.target.closest('[data-workspace-note-key]');
      if (noteItem) {
        event.preventDefault();
        navigateToNote(clean(noteItem.dataset.workspaceNoteKey), clean(noteItem.dataset.workspaceNoteName));
        return;
      }
      const rowJump = event.target.closest('[data-row-note-jump]');
      if (rowJump) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusTextarea(rowNoteTextarea(rowJump.closest('tr')));
        return;
      }
      const shell = document.getElementById('registryPersonalWorkspace');
      if (shell?.classList.contains('is-open') && !event.target.closest('#registryPersonalWorkspace')) setPanelOpen(false);
    }, true);

    document.addEventListener('input', event => {
      if (!event.target.matches?.('[data-personal-note]')) return;
      ensureRowNoteJump(event.target.closest('tr'));
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('registryPersonalWorkspace')?.classList.contains('is-open')) {
        setPanelOpen(false);
        document.querySelector('[data-workspace-trigger]')?.focus?.({ preventScroll:true });
      }
    }, true);

    ['medindex:registry-rendered','medindex:registry-ready','medindex:personal-note-saved','medindex:favorites-changed','medindex:library-ready','medindex:library-synced']
      .forEach(name => window.addEventListener(name, scheduleRefresh, { passive:true }));

    window.addEventListener('storage', event => {
      if (event.key === NOTES_KEY || event.key === FAVORITES_KEY) scheduleRefresh();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  window.MedIndexRegistryUXPhase3 = Object.freeze({
    version:VERSION,
    refresh:scheduleRefresh,
    openNotes:() => setPanelOpen(true),
  });
})();
