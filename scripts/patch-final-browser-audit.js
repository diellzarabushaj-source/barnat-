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
    "    const setMobileOpen = (open, returnFocus = false) => {\n      const nextOpen = Boolean(open);\n      body.classList.toggle('mi-sidebar-open', nextOpen);\n      if (workspace) workspace.inert = nextOpen;\n      document.documentElement.style.setProperty('pointer-events', nextOpen ? 'none' : 'auto', 'important');\n      body.style.setProperty('pointer-events', nextOpen ? 'none' : 'auto', 'important');\n      if (sidebarOverlay) {\n        sidebarOverlay.inert = false;\n        sidebarOverlay.style.setProperty('position', 'fixed', 'important');\n        sidebarOverlay.style.setProperty('inset', '0', 'important');\n        sidebarOverlay.style.setProperty('width', '100vw', 'important');\n        sidebarOverlay.style.setProperty('height', '100dvh', 'important');\n        sidebarOverlay.style.setProperty('z-index', '2147483000', 'important');\n        sidebarOverlay.style.setProperty('pointer-events', nextOpen ? 'auto' : 'none', 'important');\n        sidebarOverlay.style.setProperty('visibility', nextOpen ? 'visible' : 'hidden', 'important');\n        sidebarOverlay.style.setProperty('opacity', nextOpen ? '1' : '0', 'important');\n      }\n      if (sidebar) {\n        sidebar.style.setProperty('z-index', '2147483001', 'important');\n        sidebar.style.setProperty('pointer-events', 'auto', 'important');\n      }\n      updateSidebarA11y();",
    'mobile root hit-test isolation and deterministic overlay toggle',
  );
  source = replaceOnce(
    source,
    "    app.querySelector('[data-mi-sidebar-overlay]')?.addEventListener('click', () => setMobileOpen(false, true));",
    "    sidebarOverlay?.addEventListener('click', () => setMobileOpen(false, true));",
    'body-portal overlay listener',
  );
  if (!source.includes('workspace.inert = nextOpen')) throw new Error('Mobile drawer inert contract missing.');
  if (!source.includes("document.documentElement.style.setProperty('pointer-events', nextOpen ? 'none' : 'auto', 'important')")) {
    throw new Error('Root hit-test isolation contract missing.');
  }
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
  source = replaceOnce(
    source,
    "    modal.details.replaceChildren(...rows);\n    modal.actions.hidden = false;",
    "    modal.details.replaceChildren(...rows);\n    const calculationDisclosure = modal.details.closest('details');\n    const calculationSummary = calculationDisclosure?.querySelector(':scope > summary');\n    if (calculationDisclosure) {\n      calculationDisclosure.hidden = false;\n      calculationDisclosure.style.setProperty('display', 'block', 'important');\n      calculationDisclosure.style.setProperty('visibility', 'visible', 'important');\n      calculationDisclosure.style.setProperty('min-height', '40px', 'important');\n    }\n    if (calculationSummary) {\n      calculationSummary.hidden = false;\n      calculationSummary.style.setProperty('display', 'list-item', 'important');\n      calculationSummary.style.setProperty('visibility', 'visible', 'important');\n      calculationSummary.style.setProperty('opacity', '1', 'important');\n      calculationSummary.style.setProperty('pointer-events', 'auto', 'important');\n      calculationSummary.style.setProperty('min-height', '32px', 'important');\n      calculationSummary.style.setProperty('line-height', '32px', 'important');\n    }\n    modal.actions.hidden = false;",
    'dose disclosure physical visibility',
  );
  if (!source.includes('modal.weight.disabled = true;') || !source.includes('modal.weight.disabled = !needsWeight;')) {
    throw new Error('Dose weight adaptive disabled-state contract missing.');
  }
  if (!source.includes("calculationSummary.style.setProperty('min-height', '32px', 'important')")) {
    throw new Error('Dose calculation disclosure physical visibility contract missing.');
  }
  write('registry-dose-calculator.js', source);
}

function patchDoseDisclosureVisibility() {
  let source = read('registry-dose-10s-flow.js');
  source = replaceOnce(
    source,
    "      #${MODAL_ID} .dose-calculator-result details{margin-top:10px;padding-top:9px}",
    "      #${MODAL_ID} .dose-calculator-result details{display:block!important;visibility:visible!important;opacity:1!important;min-height:40px!important;margin-top:10px;padding-top:9px}\n      #${MODAL_ID} .dose-calculator-result:not([hidden]) details>summary{display:list-item!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;min-height:32px!important;line-height:32px!important}",
    'dose calculation disclosure visibility',
  );
  if (!source.includes('.dose-calculator-result:not([hidden]) details>summary{display:list-item!important')) {
    throw new Error('Dose calculation details disclosure visibility contract missing.');
  }
  write('registry-dose-10s-flow.js', source);
}

function patchCellPreviewKeyboard() {
  let source = read('registry-cell-preview.js');
  source = replaceOnce(
    source,
    "    button.dataset.lineiconsSource = 'Lineicons Basic / expand-square-4';\n    cell.appendChild(button);",
    "    button.dataset.lineiconsSource = 'Lineicons Basic / expand-square-4';\n    button.addEventListener('keydown', event => {\n      if (!['Enter', ' '].includes(event.key)) return;\n      event.preventDefault();\n      event.stopImmediatePropagation();\n      toggleInline(button);\n    });\n    cell.appendChild(button);",
    'direct cell preview keyboard listener',
  );
  if (!source.includes("button.addEventListener('keydown', event =>")) {
    throw new Error('Direct cell preview keyboard listener missing.');
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
patchDoseDisclosureVisibility();
patchCellPreviewKeyboard();
auditStickyHeader();
console.log('Final browser audit patch passed: root-isolated drawer hit-testing, physical dose disclosure visibility, direct keyboard row expansion and sticky-header/no-frozen-column contracts are active.');
