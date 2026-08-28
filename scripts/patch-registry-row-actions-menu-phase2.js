'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'registry-desktop-lite.js');
const UNIFIED = path.join(ROOT, 'registry-unified-table.js');
const PERSONAL = path.join(ROOT, 'registry-user-personalization.js');
const CSS = path.join(ROOT, 'registry-table-tools.css');
const MARKER = 'registry-row-actions-menu-phase2-v1';

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(file, source, 'utf8');

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Row actions phase 2 could not find ${label}.`);
  return source.replace(needle, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Row actions phase 2 could not find ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

let desktop = read(DESKTOP);
if (!desktop.includes(`${MARKER}: trigger is visible from first desktop render`)) {
  desktop = replaceOnce(
    desktop,
    'aria-haspopup="menu" aria-expanded="false" aria-hidden="true" hidden>⋯</button>',
    'aria-haspopup="menu" aria-expanded="false">⋯</button>',
    'desktop hidden canonical trigger'
  );
  desktop = replaceOnce(
    desktop,
    '// registry-row-actions-menu-phase1-v1: canonical trigger is rendered with the row; Phase 2 will reveal and wire the singleton menu.',
    '// registry-row-actions-menu-phase1-v1: canonical trigger is rendered with the row.\n  // registry-row-actions-menu-phase2-v1: trigger is visible from first desktop render and opens one singleton menu.',
    'desktop phase 1 marker'
  );
}
write(DESKTOP, desktop);

let unified = read(UNIFIED);
if (!unified.includes(`${MARKER}: unified reconciliation keeps the trigger visible`)) {
  unified = replaceOnce(
    unified,
    'aria-haspopup="menu" aria-expanded="false" aria-hidden="true" hidden>⋯</button>',
    'aria-haspopup="menu" aria-expanded="false">⋯</button>',
    'unified hidden canonical trigger'
  );
  unified = replaceOnce(
    unified,
    "      button.hidden = true;\n      button.setAttribute('aria-hidden', 'true');",
    "      button.hidden = false;\n      button.removeAttribute('aria-hidden');",
    'unified hidden trigger creation'
  );
  unified = replaceOnce(
    unified,
    "      host.prepend(button);\n    }\n    const key = clean(row.querySelector('.drug-select')?.dataset?.drugKey);",
    "      host.prepend(button);\n    }\n    button.hidden = false;\n    button.removeAttribute('aria-hidden');\n    const key = clean(row.querySelector('.drug-select')?.dataset?.drugKey);",
    'unified existing trigger reveal'
  );
  unified = replaceOnce(
    unified,
    '// registry-row-actions-menu-phase1-v1: unified rows retain the canonical trigger through rerenders/handoffs.',
    '// registry-row-actions-menu-phase1-v1: unified rows retain the canonical trigger through rerenders/handoffs.\n  // registry-row-actions-menu-phase2-v1: unified reconciliation keeps the trigger visible after every handoff.',
    'unified phase 1 marker'
  );
}
write(UNIFIED, unified);

let personal = read(PERSONAL);
if (!personal.includes(`${MARKER}: one delegated table listener owns the canonical trigger`)) {
  personal = replacePattern(
    personal,
    /const VERSION = 'registry-user-personalization-v[^']+';/,
    "const VERSION = 'registry-user-personalization-v3.4.0';",
    'personalization version'
  );

  const legacyActionsPattern = /  \/\* Butonat rrinë[\s\S]*?  function stripLegacyNoteColumn\(\) \{/;
  const replacement = `  // ${MARKER}: one delegated table listener owns the canonical trigger.
  // Favorite/note state is read only when the menu is painted; the ⋯ trigger itself
  // never depends on Supabase readiness and therefore cannot disappear during sync.
  let activeActionsRow = null;
  let activeActionsTrigger = null;

  function rowMoreButton(row) {
    return row?.querySelector?.('[data-row-actions-menu]') || null;
  }

  function ensureActionsMenu() {
    let menu = document.getElementById('registryRowActionsMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'registryRowActionsMenu';
    menu.className = 'registry-row-actions-menu';
    menu.dataset.registryRowActionsMenuSingleton = 'true';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Veprimet e barit');
    menu.hidden = true;
    menu.innerHTML = '<button type="button" class="registry-row-actions-menu-item" data-row-menu-favorite role="menuitem"><span class="registry-row-actions-menu-icon" data-row-menu-favorite-icon aria-hidden="true">☆</span><span data-row-menu-favorite-label>Ruaje si favorit</span></button><button type="button" class="registry-row-actions-menu-item" data-row-menu-note role="menuitem"><span class="registry-row-actions-menu-icon" aria-hidden="true">✎</span><span data-row-menu-note-label>Shto shënim</span></button><small class="registry-row-actions-menu-status" data-row-menu-status role="status" aria-live="polite" hidden></small>';
    document.body.appendChild(menu);
    return menu;
  }

  function closeActionsMenu({ restoreFocus = false } = {}) {
    const menu = document.getElementById('registryRowActionsMenu');
    if (menu) {
      menu.hidden = true;
      menu.removeAttribute('data-open');
    }
    const trigger = activeActionsTrigger;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    activeActionsRow = null;
    activeActionsTrigger = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll:true });
  }

  function renderActionsMenu(row) {
    if (!(row instanceof HTMLElement) || activeActionsRow !== row) return;
    const menu = ensureActionsMenu();
    const profile = rowProfile(row);
    const favoriteActive = isFavoriteRow(row);
    const noteActive = hasNoteKey(profile.noteKey);
    const favoriteBusy = favoriteInFlight.has(profile.favoriteKey);
    const noteBusy = noteInFlight.has(profile.noteKey);
    const favoritePending = pendingSync.has(syncToken('favorite', profile.favoriteKey));
    const notePending = pendingSync.has(syncToken('note', profile.noteKey));
    const favoriteAction = menu.querySelector('[data-row-menu-favorite]');
    const noteAction = menu.querySelector('[data-row-menu-note]');
    const favoriteIcon = menu.querySelector('[data-row-menu-favorite-icon]');
    const favoriteLabel = menu.querySelector('[data-row-menu-favorite-label]');
    const noteLabel = menu.querySelector('[data-row-menu-note-label]');
    const status = menu.querySelector('[data-row-menu-status]');

    favoriteAction.disabled = favoriteBusy;
    noteAction.disabled = noteBusy;
    favoriteIcon.textContent = favoriteActive ? '★' : '☆';
    favoriteLabel.textContent = favoriteBusy ? 'Duke ruajtur…' : favoriteActive ? 'Hiqe nga Favoritet' : 'Ruaje si favorit';
    noteLabel.textContent = noteBusy ? 'Duke ruajtur…' : noteActive ? 'Shiko / ndrysho shënimin' : 'Shto shënim';
    favoriteAction.setAttribute('aria-pressed', String(favoriteActive));
    noteAction.setAttribute('aria-pressed', String(noteActive));
    menu.dataset.favorite = String(favoriteActive);
    menu.dataset.hasNote = String(noteActive);

    let statusText = '';
    if (favoriteBusy || noteBusy || librarySyncState === 'saving') statusText = 'Duke ruajtur…';
    else if (favoritePending || notePending || librarySyncState === 'pending') statusText = navigator.onLine ? 'Ruajtur lokalisht · sinkronizimi në pritje' : 'Ruajtur lokalisht · offline';
    else if (librarySyncState === 'synced') statusText = '✓ Sinkronizuar';
    status.textContent = statusText;
    status.hidden = !statusText;
  }

  function positionActionsMenu(trigger) {
    const menu = ensureActionsMenu();
    if (!(trigger instanceof HTMLElement) || menu.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const edge = 8;
    const width = menu.offsetWidth || 244;
    const height = menu.offsetHeight || 96;
    let left = rect.right - width;
    left = Math.max(edge, Math.min(left, window.innerWidth - width - edge));
    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - edge && rect.top - height - gap >= edge) top = rect.top - height - gap;
    top = Math.max(edge, Math.min(top, window.innerHeight - height - edge));
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
  }

  function openActionsMenu(row, trigger) {
    if (phoneLiteOwnsViewport() || !(row instanceof HTMLElement) || !(trigger instanceof HTMLElement)) return;
    const menu = ensureActionsMenu();
    if (activeActionsRow === row && activeActionsTrigger === trigger && !menu.hidden) {
      closeActionsMenu({ restoreFocus:true });
      return;
    }
    closeActionsMenu();
    activeActionsRow = row;
    activeActionsTrigger = trigger;
    trigger.hidden = false;
    trigger.removeAttribute('aria-hidden');
    trigger.setAttribute('aria-expanded', 'true');
    renderActionsMenu(row);
    menu.hidden = false;
    menu.dataset.open = 'true';
    positionActionsMenu(trigger);
  }

  function paintRowActions(row) {
    if (phoneLiteOwnsViewport() || !(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;
    const profile = rowProfile(row);
    const favoriteActive = isFavoriteRow(row);
    const noteActive = hasNoteKey(profile.noteKey);
    row.classList.toggle('is-favorite', favoriteActive);

    const trigger = rowMoreButton(row);
    if (!trigger) return;
    trigger.hidden = false;
    trigger.removeAttribute('aria-hidden');
    trigger.dataset.drugKey = profile.key || profile.favoriteKey || '';
    if (profile.nr) trigger.dataset.registryNumber = profile.nr;
    trigger.classList.toggle('has-personal-state', favoriteActive || noteActive);
    trigger.setAttribute('aria-label', 'Veprime për ' + (profile.name || 'barin'));
    if (activeActionsRow === row) {
      trigger.setAttribute('aria-expanded', 'true');
      renderActionsMenu(row);
    } else {
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  function handleTableActionsClick(event) {
    if (phoneLiteOwnsViewport()) return;
    const trigger = event.target.closest?.('[data-row-actions-menu]');
    if (!trigger || !event.currentTarget.contains(trigger)) return;
    const row = trigger.closest('tr');
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    openActionsMenu(row, trigger);
  }

  function bindTableActions() {
    if (phoneLiteOwnsViewport()) return;
    const tbody = document.getElementById('tbody');
    if (!tbody || tbody.dataset.registryRowActionsBound === 'true') return;
    tbody.dataset.registryRowActionsBound = 'true';
    tbody.addEventListener('click', handleTableActionsClick);
  }

  function stripLegacyNoteColumn() {`;
  personal = replacePattern(personal, legacyActionsPattern, replacement, 'legacy star/pencil row-action block');

  personal = replaceOnce(
    personal,
    "    ensureSidebarNotes();\n    ensureToolbarViews();\n    stripLegacyNoteColumn();\n    document.querySelectorAll('#tbody > tr').forEach(paintRowActions);",
    "    ensureSidebarNotes();\n    ensureToolbarViews();\n    stripLegacyNoteColumn();\n    ensureActionsMenu();\n    bindTableActions();\n    document.querySelectorAll('#tbody > tr').forEach(paintRowActions);",
    'desktop refresh row-action wiring'
  );

  personal = replaceOnce(
    personal,
    `    document.addEventListener('click', event => {
      const favorite = event.target.closest('[data-row-favorite-toggle]');
      if (favorite) {
        event.preventDefault(); event.stopImmediatePropagation();
        void toggleFavorite(favorite.closest('tr'), favorite); return;
      }
      const note = event.target.closest('[data-row-note-toggle]');
      if (note) {
        event.preventDefault(); event.stopImmediatePropagation();
        openNoteDialog(note.closest('tr')); return;
      }`,
    `    document.addEventListener('click', event => {
      const menuFavorite = event.target.closest('[data-row-menu-favorite]');
      if (menuFavorite) {
        event.preventDefault(); event.stopImmediatePropagation();
        const row = activeActionsRow;
        if (row) void toggleFavorite(row, menuFavorite);
        return;
      }
      const menuNote = event.target.closest('[data-row-menu-note]');
      if (menuNote) {
        event.preventDefault(); event.stopImmediatePropagation();
        const row = activeActionsRow;
        closeActionsMenu();
        if (row) openNoteDialog(row);
        return;
      }
      if (!event.target.closest('#registryRowActionsMenu,[data-row-actions-menu]')) closeActionsMenu();`,
    'document click legacy row-action branches'
  );

  personal = replaceOnce(
    personal,
    `    document.addEventListener('keydown', event => {
      if (!event.target.matches?.('[data-note-dialog-text]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void persistActiveNote(); }
      else if (event.key === 'Escape' && !noteInFlight.has(activeNoteKey)) { event.preventDefault(); closeNoteDialog(); }
    }, true);`,
    `    document.addEventListener('keydown', event => {
      const menu = document.getElementById('registryRowActionsMenu');
      if (menu && !menu.hidden) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeActionsMenu({ restoreFocus:true });
          return;
        }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.target.closest?.('#registryRowActionsMenu')) {
          const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
          if (items.length) {
            event.preventDefault();
            const index = Math.max(0, items.indexOf(document.activeElement));
            const step = event.key === 'ArrowDown' ? 1 : -1;
            items[(index + step + items.length) % items.length].focus();
          }
          return;
        }
      }
      if (!event.target.matches?.('[data-note-dialog-text]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void persistActiveNote(); }
      else if (event.key === 'Escape' && !noteInFlight.has(activeNoteKey)) { event.preventDefault(); closeNoteDialog(); }
    }, true);`,
    'keyboard row-actions integration'
  );

  personal = replaceOnce(
    personal,
    "    window.addEventListener('hashchange', () => setView(viewFromLocation()));",
    "    window.addEventListener('hashchange', () => setView(viewFromLocation()));\n    window.addEventListener('pageshow', () => { closeActionsMenu(); schedule(1); });\n    window.addEventListener('resize', () => closeActionsMenu());\n    window.addEventListener('scroll', () => closeActionsMenu(), true);",
    'lifecycle row-actions recovery'
  );

  personal = replaceOnce(
    personal,
    "        ? '<strong>Ende nuk ke barna të ruajtura.</strong><span>Kliko yllin pranë një bari për ta shtuar në Favoritet.</span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>'\n        : '<strong>Nuk ke ende shënime.</strong><span>Kliko ikonën e lapsit pranë një bari për të shtuar një shënim personal.</span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>';",
    "        ? '<strong>Ende nuk ke barna të ruajtura.</strong><span>Hape menunë ⋯ pranë një bari dhe zgjidh “Ruaje si favorit”.</span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>'\n        : '<strong>Nuk ke ende shënime.</strong><span>Hape menunë ⋯ pranë një bari dhe zgjidh “Shto shënim”.</span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>';",
    'personal empty-state row-action guidance'
  );

  personal = replaceOnce(
    personal,
    "      librarySyncState,\n    }),",
    "      librarySyncState,\n      rowActionsMenuOpen:Boolean(activeActionsRow),\n    }),",
    'row-actions diagnostics'
  );
}
write(PERSONAL, personal);

let css = read(CSS);
if (!css.includes(`/* ${MARKER} */`)) {
  css += `

/* ${MARKER} */
/* Desktop row actions are now owned by one stable ⋯ trigger and one body-level
   singleton menu. The old per-row star/pencil surfaces are defensive-hidden. */
@media(min-width:768px){
  .registry-row-favorite-toggle,
  .registry-row-note-toggle{display:none!important}
}
.registry-row-more-toggle.has-personal-state::after{
  content:"";
  position:absolute;
  right:5px;
  top:5px;
  width:5px;
  height:5px;
  border-radius:999px;
  background:#0f766e;
  box-shadow:0 0 0 2px #fff;
}
.registry-row-actions-menu{
  position:fixed;
  z-index:2147483000;
  width:min(244px,calc(100vw - 16px));
  padding:6px;
  border:1px solid #dbe4ea;
  border-radius:12px;
  background:#fff;
  color:#0f172a;
  box-shadow:0 16px 42px rgba(15,23,42,.18);
}
.registry-row-actions-menu[hidden]{display:none!important}
.registry-row-actions-menu-item{
  width:100%;
  min-height:42px;
  padding:9px 10px;
  border:0;
  border-radius:8px;
  background:transparent;
  color:inherit;
  display:flex;
  align-items:center;
  gap:10px;
  font:inherit;
  font-size:.76rem;
  font-weight:800;
  text-align:left;
  cursor:pointer;
}
.registry-row-actions-menu-item:hover:not(:disabled),
.registry-row-actions-menu-item:focus-visible{
  outline:none;
  background:#f8fafc;
}
.registry-row-actions-menu-item:disabled{opacity:.58;cursor:progress}
.registry-row-actions-menu-icon{
  width:22px;
  flex:0 0 22px;
  display:grid;
  place-items:center;
  color:#0f766e;
  font-size:17px;
  line-height:1;
}
.registry-row-actions-menu-status{
  display:block;
  margin:5px 4px 2px;
  padding:6px 7px 2px;
  border-top:1px solid #eef2f6;
  color:#64748b;
  font-size:.64rem;
  font-weight:750;
  line-height:1.35;
}
.registry-row-actions-menu-status[hidden]{display:none!important}
html[data-theme="dark"] .registry-row-more-toggle.has-personal-state::after{background:#72d8cf;box-shadow:0 0 0 2px #172124}
html[data-theme="dark"] .registry-row-actions-menu{background:#172124;border-color:#344749;color:#e8f0ee;box-shadow:0 18px 46px rgba(0,0,0,.36)}
html[data-theme="dark"] .registry-row-actions-menu-item:hover:not(:disabled),
html[data-theme="dark"] .registry-row-actions-menu-item:focus-visible{background:#223033}
html[data-theme="dark"] .registry-row-actions-menu-icon{color:#72d8cf}
html[data-theme="dark"] .registry-row-actions-menu-status{border-color:#2b3b3e;color:#9fb4b7}
@media(max-width:767px){
  .registry-row-actions-menu,
  .registry-row-more-toggle{display:none!important}
}
@media(prefers-reduced-motion:reduce){
  .registry-row-actions-menu,
  .registry-row-more-toggle{transition:none!important;animation:none!important}
}
`;
}
write(CSS, css);

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-row-actions-menu-phase2-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
console.log('Registry row actions menu Phase 2 applied: ⋯ is visible from first desktop render, one delegated tbody listener opens one singleton Favorite/Note menu, and legacy row star/pencil injection is removed.');
