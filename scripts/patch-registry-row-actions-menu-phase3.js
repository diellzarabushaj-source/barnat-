'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PERSONAL = path.join(ROOT, 'registry-user-personalization.js');
const CSS = path.join(ROOT, 'registry-table-tools.css');
const MARKER = 'registry-row-actions-menu-phase3-v1';

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(file, source, 'utf8');

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Row actions phase 3 could not find ${label}.`);
  return source.replace(needle, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Row actions phase 3 could not find ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

let personal = read(PERSONAL);
if (!personal.includes('registry-row-actions-menu-phase2-v1')) {
  throw new Error('Row actions Phase 3 requires the Phase 2 singleton menu first.');
}
if (!personal.includes("const VERSION = 'registry-user-personalization-v3.3.0';")) {
  throw new Error('Row actions Phase 3 must preserve the frozen mobile personalization v3.3.0 contract.');
}

if (!personal.includes(`${MARKER}: accessible desktop menu hardening`)) {
  personal = replaceOnce(
    personal,
    `  function rowMoreButton(row) {\n    return row?.querySelector?.('[data-row-actions-menu]') || null;\n  }`,
    `  function rowMoreButton(row) {\n    return row?.querySelector?.('[data-row-actions-menu]') || null;\n  }\n\n  // ${MARKER}: accessible desktop menu hardening.\n  function rowActionsMenuItems(menu) {\n    return [...(menu?.querySelectorAll?.('[role="menuitem"],[role="menuitemcheckbox"]') || [])]\n      .filter(item => !item.disabled && !item.hidden);\n  }\n\n  function focusRowActionsMenuItem(menu, edge = 'first') {\n    const items = rowActionsMenuItems(menu);\n    if (!items.length) return;\n    const target = edge === 'last' ? items[items.length - 1] : items[0];\n    target.focus({ preventScroll:true });\n  }`,
    'row-menu accessibility helper anchor'
  );

  personal = replaceOnce(
    personal,
    `    menu.innerHTML = '<button type="button" class="registry-row-actions-menu-item" data-row-menu-favorite role="menuitem"><span class="registry-row-actions-menu-icon" data-row-menu-favorite-icon aria-hidden="true">☆</span><span data-row-menu-favorite-label>Ruaje si favorit</span></button><button type="button" class="registry-row-actions-menu-item" data-row-menu-note role="menuitem"><span class="registry-row-actions-menu-icon" aria-hidden="true">✎</span><span data-row-menu-note-label>Shto shënim</span></button><small class="registry-row-actions-menu-status" data-row-menu-status role="status" aria-live="polite" hidden></small>';`,
    `    menu.innerHTML = '<button type="button" class="registry-row-actions-menu-item" data-row-menu-favorite role="menuitemcheckbox" aria-checked="false"><span class="registry-row-actions-menu-icon" data-row-menu-favorite-icon aria-hidden="true">☆</span><span data-row-menu-favorite-label>Ruaje si favorit</span></button><button type="button" class="registry-row-actions-menu-item" data-row-menu-note role="menuitem"><span class="registry-row-actions-menu-icon" aria-hidden="true">✎</span><span data-row-menu-note-label>Shto shënim</span></button><small class="registry-row-actions-menu-status" data-row-menu-status role="status" aria-live="polite" hidden></small>';`,
    'favorite menu semantics'
  );

  personal = replaceOnce(
    personal,
    `  function renderActionsMenu(row) {\n    if (!(row instanceof HTMLElement) || activeActionsRow !== row) return;`,
    `  function renderActionsMenu(row) {\n    if (activeActionsRow && !activeActionsRow.isConnected) { closeActionsMenu(); return; }\n    if (!(row instanceof HTMLElement) || activeActionsRow !== row) return;`,
    'rerender-safe active row guard'
  );

  personal = replaceOnce(
    personal,
    `    const status = menu.querySelector('[data-row-menu-status]');\n\n    favoriteAction.disabled = favoriteBusy;`,
    `    const status = menu.querySelector('[data-row-menu-status]');\n\n    menu.setAttribute('aria-label', 'Veprimet për ' + (profile.name || 'barin'));\n    favoriteAction.disabled = favoriteBusy;`,
    'dynamic menu label'
  );

  personal = replaceOnce(
    personal,
    `    favoriteAction.setAttribute('aria-pressed', String(favoriteActive));\n    noteAction.setAttribute('aria-pressed', String(noteActive));`,
    `    favoriteAction.setAttribute('aria-checked', String(favoriteActive));\n    favoriteAction.removeAttribute('aria-pressed');\n    noteAction.removeAttribute('aria-pressed');\n    noteAction.dataset.hasNote = String(noteActive);`,
    'menu item state semantics'
  );

  personal = replacePattern(
    personal,
    /  function positionActionsMenu\(trigger\) \{[\s\S]*?\n  \}\n\n  function openActionsMenu/,
    `  function positionActionsMenu(trigger) {\n    const menu = ensureActionsMenu();\n    if (!(trigger instanceof HTMLElement) || menu.hidden) return;\n    const rect = trigger.getBoundingClientRect();\n    const gap = 6;\n    const edge = 8;\n    const width = menu.offsetWidth || 244;\n    const height = menu.offsetHeight || 96;\n    let left = rect.right - width;\n    left = Math.max(edge, Math.min(left, window.innerWidth - width - edge));\n    let top = rect.bottom + gap;\n    let placement = 'bottom';\n    if (top + height > window.innerHeight - edge && rect.top - height - gap >= edge) {\n      top = rect.top - height - gap;\n      placement = 'top';\n    }\n    top = Math.max(edge, Math.min(top, window.innerHeight - height - edge));\n    menu.dataset.placement = placement;\n    menu.style.left = Math.round(left) + 'px';\n    menu.style.top = Math.round(top) + 'px';\n  }\n\n  function openActionsMenu`,
    'viewport-aware menu positioning'
  );

  personal = replacePattern(
    personal,
    /  function openActionsMenu\(row, trigger\) \{[\s\S]*?\n  \}\n\n  function paintRowActions/,
    `  function openActionsMenu(row, trigger, { focus = '' } = {}) {\n    if (phoneLiteOwnsViewport() || !(row instanceof HTMLElement) || !(trigger instanceof HTMLElement)) return;\n    const menu = ensureActionsMenu();\n    if (activeActionsRow === row && activeActionsTrigger === trigger && !menu.hidden) {\n      closeActionsMenu({ restoreFocus:true });\n      return;\n    }\n    closeActionsMenu();\n    activeActionsRow = row;\n    activeActionsTrigger = trigger;\n    trigger.hidden = false;\n    trigger.removeAttribute('aria-hidden');\n    trigger.setAttribute('aria-expanded', 'true');\n    trigger.setAttribute('aria-controls', 'registryRowActionsMenu');\n    renderActionsMenu(row);\n    menu.hidden = false;\n    menu.dataset.open = 'true';\n    positionActionsMenu(trigger);\n    if (focus) focusRowActionsMenuItem(menu, focus);\n  }\n\n  function paintRowActions`,
    'keyboard-focus-aware menu open'
  );

  personal = replaceOnce(
    personal,
    `  function paintRowActions(row) {\n    if (phoneLiteOwnsViewport() || !(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;`,
    `  function paintRowActions(row) {\n    if (activeActionsRow && !activeActionsRow.isConnected) closeActionsMenu();\n    if (phoneLiteOwnsViewport() || !(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;`,
    'paint rerender recovery'
  );

  personal = replaceOnce(
    personal,
    `    trigger.hidden = false;\n    trigger.removeAttribute('aria-hidden');\n    trigger.dataset.drugKey = profile.key || profile.favoriteKey || '';`,
    `    trigger.hidden = false;\n    trigger.removeAttribute('aria-hidden');\n    trigger.setAttribute('aria-controls', 'registryRowActionsMenu');\n    trigger.dataset.drugKey = profile.key || profile.favoriteKey || '';`,
    'trigger aria-controls'
  );

  personal = replacePattern(
    personal,
    /    document\.addEventListener\('keydown', event => \{\n      const menu = document\.getElementById\('registryRowActionsMenu'\);[\s\S]*?\n    \}, true\);/,
    `    document.addEventListener('keydown', event => {\n      const trigger = event.target.closest?.('[data-row-actions-menu]');\n      if (trigger && !phoneLiteOwnsViewport() && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {\n        const row = trigger.closest('tr');\n        if (row) {\n          event.preventDefault();\n          const edge = event.key === 'ArrowUp' ? 'last' : 'first';\n          openActionsMenu(row, trigger, { focus:edge });\n          return;\n        }\n      }\n\n      const menu = document.getElementById('registryRowActionsMenu');\n      if (menu && !menu.hidden && event.target.closest?.('#registryRowActionsMenu')) {\n        if (event.key === 'Escape') {\n          event.preventDefault();\n          closeActionsMenu({ restoreFocus:true });\n          return;\n        }\n        const items = rowActionsMenuItems(menu);\n        if (items.length && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {\n          event.preventDefault();\n          if (event.key === 'Home') { items[0].focus(); return; }\n          if (event.key === 'End') { items[items.length - 1].focus(); return; }\n          const current = items.indexOf(document.activeElement);\n          const index = current >= 0 ? current : 0;\n          const step = event.key === 'ArrowDown' ? 1 : -1;\n          items[(index + step + items.length) % items.length].focus();\n          return;\n        }\n      } else if (menu && !menu.hidden && event.key === 'Escape') {\n        event.preventDefault();\n        closeActionsMenu({ restoreFocus:true });\n        return;\n      }\n\n      if (!event.target.matches?.('[data-note-dialog-text]')) return;\n      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void persistActiveNote(); }\n      else if (event.key === 'Escape' && !noteInFlight.has(activeNoteKey)) { event.preventDefault(); closeNoteDialog(); }\n    }, true);\n\n    document.addEventListener('focusin', event => {\n      const menu = document.getElementById('registryRowActionsMenu');\n      if (!menu || menu.hidden) return;\n      if (event.target.closest?.('#registryRowActionsMenu')) return;\n      if (activeActionsTrigger?.contains?.(event.target)) return;\n      closeActionsMenu();\n    }, true);`,
    'keyboard and focus navigation hardening'
  );
}
write(PERSONAL, personal);

let css = read(CSS);
if (!css.includes(`/* ${MARKER} */`)) {
  css += `\n\n/* ${MARKER} */\n.registry-row-actions-menu[data-placement="bottom"]{transform-origin:top right}\n.registry-row-actions-menu[data-placement="top"]{transform-origin:bottom right}\n.registry-row-actions-menu-item[role="menuitemcheckbox"][aria-checked="true"]{font-weight:800}\n.registry-row-actions-menu-item[role="menuitemcheckbox"][aria-checked="true"] .registry-row-actions-menu-icon{transform:scale(1.04)}\n.registry-row-more-toggle[aria-expanded="true"]{background:#f1f5f9;border-color:#cbd5e1;color:#0f172a}\nhtml[data-theme="dark"] .registry-row-more-toggle[aria-expanded="true"]{background:#223033;border-color:#405457;color:#e8f0ee}\n@media(prefers-reduced-motion:reduce){.registry-row-actions-menu-item[role="menuitemcheckbox"] .registry-row-actions-menu-icon{transform:none!important}}\n`;
}
write(CSS, css);

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-row-actions-menu-phase3-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
console.log('Registry row actions menu Phase 3 applied: correct menu semantics, keyboard navigation, focus recovery, viewport-aware placement and rerender-safe singleton behavior.');
