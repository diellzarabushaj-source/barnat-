'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'registry-desktop-lite.js');
const UNIFIED = path.join(ROOT, 'registry-unified-table.js');
const CSS = path.join(ROOT, 'registry-user-personalization.css');
const MARKER = 'registry-row-actions-menu-phase1-v1';

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(file, source, 'utf8');

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Row actions phase 1 could not find ${label}.`);
  return source.replace(needle, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Row actions phase 1 could not find ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

let desktop = read(DESKTOP);
if (!desktop.includes(`${MARKER}: canonical trigger is rendered with the row`)) {
  const tradeCellPattern = /<td class=\"name\" data-registry-column-key=\"trade-name\" data-label=\"Emri tregtar\"><span class=\"drug-name-text\">\$\{escapeHtml\(row\['Emri tregtar'\] \|\| '—'\)\}<\/span><\/td>/;
  const replacement = `<td class="name" data-registry-column-key="trade-name" data-label="Emri tregtar"><span class="drug-name-layout"><span class="drug-name-text">\${escapeHtml(row['Emri tregtar'] || '—')}</span><span class="registry-row-actions" data-registry-ui-only="true"><button type="button" class="registry-row-more-toggle" data-row-actions-menu="true" data-drug-key="\${escapeHtml(key)}" data-registry-number="\${escapeHtml(row['Nr rendor'])}" aria-label="Veprime për \${escapeHtml(row['Emri tregtar'] || 'barin')}" aria-haspopup="menu" aria-expanded="false" aria-hidden="true" hidden>⋯</button></span></span></td>`;
  desktop = replacePattern(desktop, tradeCellPattern, replacement, 'desktop trade-name cell');
  desktop = desktop.replace('  function renderRows(rows) {', `  // ${MARKER}: canonical trigger is rendered with the row; Phase 2 will reveal and wire the singleton menu.\n  function renderRows(rows) {`);
}
write(DESKTOP, desktop);

let unified = read(UNIFIED);
if (!unified.includes(`${MARKER}: unified rows retain the canonical trigger`)) {
  const tradeBranch = `    } else if (key === 'trade-name') {\n      cell.className = 'name';\n      cell.innerHTML = \`<span class="drug-name-text"></span>\`;\n      cell.querySelector('span').textContent = value || '—';`;
  const tradeReplacement = `    } else if (key === 'trade-name') {\n      cell.className = 'name';\n      cell.innerHTML = '<span class="drug-name-layout"><span class="drug-name-text"></span><span class="registry-row-actions" data-registry-ui-only="true"><button type="button" class="registry-row-more-toggle" data-row-actions-menu="true" aria-haspopup="menu" aria-expanded="false" aria-hidden="true" hidden>⋯</button></span></span>';\n      cell.querySelector('.drug-name-text').textContent = value || '—';`;
  unified = replaceOnce(unified, tradeBranch, tradeReplacement, 'unified synthetic trade-name cell');

  const helperAnchor = `  function stampHeader(header) {`;
  const helper = `  // ${MARKER}: unified rows retain the canonical trigger through rerenders/handoffs.\n  function ensureCanonicalRowActions(row) {\n    if (!row || window.innerWidth < 768) return;\n    const cell = row.querySelector('[data-registry-column-key="trade-name"],td.name');\n    if (!cell) return;\n    let text = cell.querySelector('.drug-name-text');\n    if (!text) return;\n    let layout = cell.querySelector(':scope > .drug-name-layout');\n    if (!layout) {\n      layout = document.createElement('span');\n      layout.className = 'drug-name-layout';\n      if (text.parentElement === cell) {\n        cell.insertBefore(layout, text);\n        layout.appendChild(text);\n      } else return;\n    }\n    let host = layout.querySelector(':scope > .registry-row-actions');\n    if (!host) {\n      host = document.createElement('span');\n      host.className = 'registry-row-actions';\n      host.dataset.registryUiOnly = 'true';\n      layout.appendChild(host);\n    }\n    let button = host.querySelector('[data-row-actions-menu]');\n    if (!button) {\n      button = document.createElement('button');\n      button.type = 'button';\n      button.className = 'registry-row-more-toggle';\n      button.dataset.rowActionsMenu = 'true';\n      button.hidden = true;\n      button.setAttribute('aria-hidden', 'true');\n      button.setAttribute('aria-haspopup', 'menu');\n      button.setAttribute('aria-expanded', 'false');\n      button.textContent = '⋯';\n      host.prepend(button);\n    }\n    const key = clean(row.querySelector('.drug-select')?.dataset?.drugKey);\n    const registryNumber = clean(row.dataset.registryNumber);\n    const name = clean(text.textContent) || 'barin';\n    if (key) button.dataset.drugKey = key;\n    if (registryNumber) button.dataset.registryNumber = registryNumber;\n    button.setAttribute('aria-label', \`Veprime për \${name}\`);\n  }\n\n${helperAnchor}`;
  unified = replaceOnce(unified, helperAnchor, helper, 'unified row-actions helper anchor');

  const stampTail = `    const number = Number(raw?.['Nr rendor']);\n    if (Number.isInteger(number) && number > 0) row.dataset.registryNumber = String(number);\n  }`;
  const stampReplacement = `    const number = Number(raw?.['Nr rendor']);\n    if (Number.isInteger(number) && number > 0) row.dataset.registryNumber = String(number);\n    ensureCanonicalRowActions(row);\n  }`;
  unified = replaceOnce(unified, stampTail, stampReplacement, 'unified stampRow completion');
}
write(UNIFIED, unified);

let css = read(CSS);
if (!css.includes(`/* ${MARKER} */`)) {
  css += `\n\n/* ${MARKER} */\n/* Phase 1 only establishes the stable canonical trigger. It stays hidden until\n   the singleton menu is wired in Phase 2, while the existing star/pencil remain\n   as a functional fallback. */\ntd.name > .drug-name-layout:has([data-row-actions-menu]){\n  display:grid;\n  grid-template-columns:minmax(0,1fr) auto;\n  align-items:center;\n  gap:6px;\n  min-width:0;\n  width:100%;\n}\ntd.name > .drug-name-layout > .drug-name-text{min-width:0}\n.registry-row-more-toggle{\n  width:36px;\n  height:36px;\n  padding:0;\n  border:1px solid transparent;\n  border-radius:9px;\n  background:transparent;\n  color:#64748b;\n  font:800 22px/1 system-ui,sans-serif;\n  cursor:pointer;\n  place-items:center;\n}\n.registry-row-more-toggle:not([hidden]){display:inline-grid}\n.registry-row-more-toggle:hover{background:#f8fafc;border-color:#dbe4ea;color:#0f172a}\n.registry-row-more-toggle:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(15,118,110,.16)}\nhtml[data-theme="dark"] .registry-row-more-toggle{color:#a8b7ba}\nhtml[data-theme="dark"] .registry-row-more-toggle:hover{background:#1e293b;border-color:#334155;color:#e8f0ee}\n`;
}
write(CSS, css);

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-row-actions-menu-phase1-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
// Phase 2 intentionally runs only after the migration-safe Phase 1 gate has
// proven that the canonical trigger exists while the legacy actions still work.
require('./patch-registry-row-actions-menu-phase2.js');
require('./patch-registry-row-actions-menu-phase2-mobile-contract.js');
// Phase 3 is intentionally last: it only hardens the already-validated singleton
// menu and must never change the frozen phone-owner contract or persistence path.
require('./patch-registry-row-actions-menu-phase3.js');
// Browser acceptance proved that aria-controls must exist on the trigger before
// personalization gets a chance to repaint it. Keep this as a source-path fix,
// after the singleton exists and without touching the frozen mobile owner.
require('./patch-registry-row-actions-first-render-aria.js');
console.log('Registry row actions menu Phase 1 foundation validated; Phase 2 cutover, Phase 3 accessibility/focus hardening and first-render ARIA ownership are active with the frozen mobile personalization contract preserved.');
