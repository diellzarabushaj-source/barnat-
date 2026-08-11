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
    "    const sidebar = app.querySelector('#miSidebar');\n    const workspace = app.querySelector('.mi-workspace');\n    const sidebarOverlay = app.querySelector('[data-mi-sidebar-overlay]');\n    const sidebarScroll = app.querySelector('.mi-sidebar-scroll');\n    if (sidebarOverlay && sidebarOverlay.parentElement !== document.body) document.body.appendChild(sidebarOverlay);",
    'workspace, overlay lookup and body portal',
  );
  source = replaceOnce(
    source,
    "    const setMobileOpen = (open, returnFocus = false) => {\n      body.classList.toggle('mi-sidebar-open', Boolean(open));\n      updateSidebarA11y();",
    "    const setMobileOpen = (open, returnFocus = false) => {\n      const nextOpen = Boolean(open);\n      body.classList.toggle('mi-sidebar-open', nextOpen);\n      if (workspace) workspace.inert = nextOpen;\n      if (sidebarOverlay) {\n        sidebarOverlay.inert = false;\n        sidebarOverlay.style.setProperty('position', 'fixed', 'important');\n        sidebarOverlay.style.setProperty('inset', '0', 'important');\n        sidebarOverlay.style.setProperty('width', '100vw', 'important');\n        sidebarOverlay.style.setProperty('height', '100dvh', 'important');\n        sidebarOverlay.style.setProperty('z-index', '2147483000', 'important');\n        sidebarOverlay.style.setProperty('pointer-events', nextOpen ? 'auto' : 'none', 'important');\n        sidebarOverlay.style.setProperty('visibility', nextOpen ? 'visible' : 'hidden', 'important');\n        sidebarOverlay.style.setProperty('opacity', nextOpen ? '1' : '0', 'important');\n      }\n      if (sidebar) {\n        sidebar.style.setProperty('z-index', '2147483001', 'important');\n        sidebar.style.setProperty('pointer-events', 'auto', 'important');\n      }\n      updateSidebarA11y();",
    'mobile inert and deterministic overlay state',
  );
  source = replaceOnce(
    source,
    "    app.querySelector('[data-mi-sidebar-overlay]')?.addEventListener('click', () => setMobileOpen(false, true));",
    "    sidebarOverlay?.addEventListener('click', () => setMobileOpen(false, true));\n    document.addEventListener('pointerdown', event => {\n      if (!isMobile() || !body.classList.contains('mi-sidebar-open')) return;\n      if (sidebar?.contains(event.target)) return;\n      if (sidebarToggles.some(button => button.contains(event.target))) return;\n      setMobileOpen(false, true);\n    }, true);",
    'physical outside-click drawer close',
  );
  if (!source.includes('workspace.inert = nextOpen')) throw new Error('Mobile drawer inert contract missing.');
  if (!source.includes("document.addEventListener('pointerdown', event =>")) throw new Error('Physical outside-click drawer contract missing.');
  if (!source.includes('document.body.appendChild(sidebarOverlay)')) throw new Error('Mobile drawer overlay body portal missing.');
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
    '  let fallbackTimer = 0;',
    '  let fallbackTimer = 0;\n  let keyboardClickSuppressionUntil = 0;',
    'cell preview keyboard suppression state',
  );
  source = replaceOnce(
    source,
    "    button.dataset.lineiconsSource = 'Lineicons Basic / expand-square-4';\n    cell.appendChild(button);",
    "    button.dataset.lineiconsSource = 'Lineicons Basic / expand-square-4';\n    button.addEventListener('keydown', event => {\n      if (!['Enter', ' '].includes(event.key)) return;\n      event.preventDefault();\n      event.stopImmediatePropagation();\n      keyboardClickSuppressionUntil = Date.now() + 750;\n      toggleInline(button);\n    });\n    cell.appendChild(button);",
    'direct cell preview keyboard listener',
  );
  source = replaceOnce(
    source,
    "  function onClick(event) {\n    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);\n    if (!trigger) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    toggleInline(trigger);\n  }",
    "  function onClick(event) {\n    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);\n    if (!trigger) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    if (event.detail === 0 && Date.now() < keyboardClickSuppressionUntil) return;\n    toggleInline(trigger);\n  }",
    'keyboard synthetic-click suppression',
  );
  if (!source.includes('keyboardClickSuppressionUntil = Date.now() + 750')) throw new Error('Cell preview keyboard toggle contract missing.');
  if (!source.includes('event.detail === 0 && Date.now() < keyboardClickSuppressionUntil')) throw new Error('Cell preview synthetic-click suppression missing.');
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
console.log('Final browser audit patch passed: physical outside-click drawer close, adaptive dose weight, single keyboard row toggle and sticky-header/no-frozen-column contracts are active.');
