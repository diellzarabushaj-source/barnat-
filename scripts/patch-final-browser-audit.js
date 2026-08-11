'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Final browser patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchDrawerInert() {
  let source = read('tailadmin-shell-core.js');
  source = replaceOnce(
    source,
    "    const sidebar = app.querySelector('#miSidebar');\n    const sidebarScroll = app.querySelector('.mi-sidebar-scroll');",
    "    const sidebar = app.querySelector('#miSidebar');\n    const workspace = app.querySelector('.mi-workspace');\n    const sidebarOverlay = app.querySelector('[data-mi-sidebar-overlay]');\n    const sidebarScroll = app.querySelector('.mi-sidebar-scroll');",
    'workspace and overlay lookup',
  );
  source = replaceOnce(
    source,
    "    const setMobileOpen = (open, returnFocus = false) => {\n      body.classList.toggle('mi-sidebar-open', Boolean(open));\n      updateSidebarA11y();",
    "    const setMobileOpen = (open, returnFocus = false) => {\n      const nextOpen = Boolean(open);\n      body.classList.toggle('mi-sidebar-open', nextOpen);\n      if (workspace) workspace.inert = nextOpen;\n      if (sidebarOverlay) {\n        sidebarOverlay.style.setProperty('position', 'fixed', 'important');\n        sidebarOverlay.style.setProperty('inset', '0', 'important');\n        sidebarOverlay.style.setProperty('z-index', '210', 'important');\n        sidebarOverlay.style.setProperty('pointer-events', nextOpen ? 'auto' : 'none', 'important');\n        sidebarOverlay.style.setProperty('visibility', nextOpen ? 'visible' : 'hidden', 'important');\n        sidebarOverlay.style.setProperty('opacity', nextOpen ? '1' : '0', 'important');\n      }\n      updateSidebarA11y();",
    'mobile inert and deterministic overlay toggle',
  );
  if (!source.includes('workspace.inert = nextOpen')) throw new Error('Mobile drawer inert contract missing.');
  if (!source.includes("sidebarOverlay.style.setProperty('pointer-events', nextOpen ? 'auto' : 'none', 'important')")) {
    throw new Error('Mobile drawer overlay hit-testing contract missing.');
  }
  write('tailadmin-shell-core.js', source);
}

function patchDoseWeightGate() {
  let source = read('registry-dose-calculator.js');
  source = replaceOnce(
    source,
    "    modal.weight.value = '';\n    modal.weightWrap.hidden = true;\n    modal.weightChips.hidden = true;",
    "    modal.weight.value = '';\n    modal.weight.disabled = true;\n    modal.weight.required = false;\n    modal.weightWrap.hidden = true;\n    modal.weightChips.hidden = true;",
    'dose weight initial safety gate',
  );
  if (!source.includes('modal.weight.disabled = true;') || !source.includes('modal.weight.disabled = !needsWeight;')) {
    throw new Error('Dose weight adaptive disabled-state contract missing.');
  }
  write('registry-dose-calculator.js', source);
}

function patchCellPreviewKeyboard() {
  let source = read('registry-cell-preview.js');
  source = replaceOnce(
    source,
    "  function init() {\n    document.addEventListener('click', onClick, true);",
    "  function onKeydown(event) {\n    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);\n    if (!trigger || !['Enter', ' '].includes(event.key)) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    toggleInline(trigger);\n  }\n\n  function init() {\n    document.addEventListener('click', onClick, true);\n    document.addEventListener('keydown', onKeydown, true);",
    'cell preview keyboard activation',
  );
  if (!source.includes("!['Enter', ' '].includes(event.key)") || !source.includes("document.addEventListener('keydown', onKeydown, true)")) {
    throw new Error('Cell preview Enter/Space keyboard contract missing.');
  }
  write('registry-cell-preview.js', source);
}

function auditStickyHeader() {
  const source = read('registry-full-text-expansion.css');
  if (!/thead th\[data-registry-column-key\][\s\S]*position:sticky!important;[\s\S]*top:0!important;/.test(source)) {
    throw new Error('Sticky registry header contract missing.');
  }
  if (!/thead th\[data-registry-column-key\][\s\S]*left:auto!important;[\s\S]*right:auto!important;/.test(source)) {
    throw new Error('Registry header must stay vertically sticky without freezing a data column.');
  }
}

patchDrawerInert();
patchDoseWeightGate();
patchCellPreviewKeyboard();
auditStickyHeader();
console.log('Final browser audit patch passed: adaptive dose weight gate, deterministic drawer overlay, keyboard row expansion and sticky-header/no-frozen-column contracts are active.');
