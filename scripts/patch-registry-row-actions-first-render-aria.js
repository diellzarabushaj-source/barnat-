'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'registry-desktop-lite.js');
const UNIFIED = path.join(ROOT, 'registry-unified-table.js');
const MARKER = 'registry-row-actions-first-render-aria-v1';

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(file, source, 'utf8');

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`First-render row-actions ARIA patch could not find ${label}.`);
  return source.replace(needle, replacement);
}

let desktop = read(DESKTOP);
if (!desktop.includes(MARKER)) {
  desktop = replaceOnce(
    desktop,
    'aria-haspopup="menu" aria-expanded="false">⋯</button>',
    'aria-haspopup="menu" aria-expanded="false" aria-controls="registryRowActionsMenu">⋯</button>',
    'desktop canonical trigger markup'
  );
  desktop = desktop.replace(
    '// registry-row-actions-menu-phase2-v1: trigger is visible from first desktop render and opens one singleton menu.',
    '// registry-row-actions-menu-phase2-v1: trigger is visible from first desktop render and opens one singleton menu.\n  // registry-row-actions-first-render-aria-v1: trigger references the singleton before personalization enhancement runs.'
  );
}
write(DESKTOP, desktop);

let unified = read(UNIFIED);
if (!unified.includes(MARKER)) {
  unified = replaceOnce(
    unified,
    'aria-haspopup="menu" aria-expanded="false">⋯</button>',
    'aria-haspopup="menu" aria-expanded="false" aria-controls="registryRowActionsMenu">⋯</button>',
    'unified synthetic trigger markup'
  );

  unified = replaceOnce(
    unified,
    "      button.setAttribute('aria-haspopup', 'menu');\n      button.setAttribute('aria-expanded', 'false');\n      button.textContent = '⋯';",
    "      button.setAttribute('aria-haspopup', 'menu');\n      button.setAttribute('aria-expanded', 'false');\n      button.setAttribute('aria-controls', 'registryRowActionsMenu');\n      button.textContent = '⋯';",
    'unified dynamic trigger creation'
  );

  unified = replaceOnce(
    unified,
    "    button.hidden = false;\n    button.removeAttribute('aria-hidden');\n    const key = clean(row.querySelector('.drug-select')?.dataset?.drugKey);",
    "    button.hidden = false;\n    button.removeAttribute('aria-hidden');\n    button.setAttribute('aria-controls', 'registryRowActionsMenu');\n    const key = clean(row.querySelector('.drug-select')?.dataset?.drugKey);",
    'unified existing-trigger reconciliation'
  );

  unified = unified.replace(
    '// registry-row-actions-menu-phase2-v1: unified reconciliation keeps the trigger visible after every handoff.',
    '// registry-row-actions-menu-phase2-v1: unified reconciliation keeps the trigger visible after every handoff.\n  // registry-row-actions-first-render-aria-v1: every unified trigger references the singleton before any menu interaction.'
  );
}
write(UNIFIED, unified);

const desktopAfter = read(DESKTOP);
const unifiedAfter = read(UNIFIED);
if (!/data-row-actions-menu="true"[^>]*aria-controls="registryRowActionsMenu"[^>]*>⋯<\/button>/.test(desktopAfter)) {
  throw new Error('Desktop first-render ⋯ does not reference registryRowActionsMenu.');
}
if (!/data-row-actions-menu="true"[^>]*aria-controls="registryRowActionsMenu"[^>]*>⋯<\/button>/.test(unifiedAfter)) {
  throw new Error('Unified synthetic ⋯ does not reference registryRowActionsMenu.');
}
if (!/button\.setAttribute\('aria-controls', 'registryRowActionsMenu'\)/.test(unifiedAfter)) {
  throw new Error('Unified dynamic ⋯ creation does not reference registryRowActionsMenu.');
}

console.log('✓ Registry row actions first-render ARIA passed: desktop and unified ⋯ triggers reference the singleton before interaction, with no mobile-owner changes.');
