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
  source = replaceOnce(
    source,
    "      detailRow('Rregulli:', doseText(rule)),",
    "      detailRow('Doza zyrtare:', doseText(rule)),",
    'clear official dose detail label',
  );
  if (!source.includes('modal.weight.disabled = true;') || !source.includes('modal.weight.disabled = !needsWeight;')) {
    throw new Error('Dose weight adaptive disabled-state contract missing.');
  }
  if (!source.includes("detailRow('Doza zyrtare:', doseText(rule))")) throw new Error('Official dose detail label missing.');
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
    "    button.dataset.lineiconsSource = 'Lineicons Basic / expand-square-4';\n    button.addEventListener('keydown', event => {\n      if (!['Enter', ' '].includes(event.key)) return;\n      event.preventDefault();\n      event.stopImmediatePropagation();\n      keyboardClickSuppressionUntil = Date.now() + 900;\n      toggleInline(button);\n    });\n    cell.appendChild(button);",
    'direct cell preview keyboard listener',
  );
  source = replaceOnce(
    source,
    "  function onClick(event) {\n    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);\n    if (!trigger) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    toggleInline(trigger);\n  }",
    "  function onClick(event) {\n    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);\n    if (!trigger) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    if (Date.now() < keyboardClickSuppressionUntil) return;\n    toggleInline(trigger);\n  }",
    'keyboard synthetic-click suppression',
  );
  if (!source.includes('keyboardClickSuppressionUntil = Date.now() + 900')) throw new Error('Cell preview keyboard toggle contract missing.');
  if (!source.includes('if (Date.now() < keyboardClickSuppressionUntil) return;')) throw new Error('Cell preview synthetic-click suppression missing.');
  write('registry-cell-preview.js', source);
}

function patchBrowserSafetyFixture() {
  let source = read('tests/clinical-smoke-server.js');
  source = replaceOnce(
    source,
    "  if (url.pathname === '/api/dosage') return send(res, 200, JSON.stringify(dosage), 'application/json; charset=utf-8');",
    "  if (url.pathname === '/api/dosage') {\n    if (url.searchParams.get('view') === 'safety') {\n      return send(res, 200, JSON.stringify({\n        ok:true,\n        meta:{ schemaVersion:'2.0.0', failClosed:true, officialVerifiedOnly:true, generatedAt:'2026-08-11T00:00:00Z' },\n        catalog:[],\n      }), 'application/json; charset=utf-8');\n    }\n    return send(res, 200, JSON.stringify(dosage), 'application/json; charset=utf-8');\n  }",
    'browser safety API fixture',
  );
  if (!source.includes("url.searchParams.get('view') === 'safety'")) throw new Error('Browser safety fixture is not view-aware.');
  write('tests/clinical-smoke-server.js', source);
}

function patchDrawerBrowserTest() {
  let source = read('tests/mobile-deep-audit.spec.js');
  source = replaceOnce(
    source,
    "  await page.locator('[data-mi-sidebar-overlay]').click({ position:{ x:Math.max(1, (await page.viewportSize()).width - 8), y:80 } });",
    "  const viewport = await page.viewportSize();\n  await page.mouse.click(Math.max(1, viewport.width - 8), 80);",
    'physical drawer outside-click test',
  );
  if (!source.includes('page.mouse.click(Math.max(1, viewport.width - 8), 80)')) throw new Error('Drawer browser test is not using a physical outside click.');
  write('tests/mobile-deep-audit.spec.js', source);
}

function patchDarkModeClsGate() {
  let source = read('tests/phase5-final-performance.spec.js');
  source = replaceOnce(
    source,
    "  test('dark mode does not change registry geometry', async ({ page }) => {\n    await page.setViewportSize(VIEWPORTS.desktopLarge);\n    await installPerfProbe(page);\n    await openReady(page);\n    await waitRegistry(page);\n\n    const measure = () => page.evaluate(() => {",
    "  test('dark mode does not change registry geometry', async ({ page }) => {\n    await page.setViewportSize(VIEWPORTS.desktopLarge);\n    await installPerfProbe(page);\n    await openReady(page);\n    await waitRegistry(page);\n    await expect.poll(\n      () => page.evaluate(() => window.MEDINDEX_REGISTRY_TABLE_AUDIT?.stable === true),\n      { timeout:10000, message:'registry did not stabilize before dark-mode CLS audit' }\n    ).toBe(true);\n    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));\n\n    const measure = () => page.evaluate(() => {",
    'dark-mode stable-registry wait',
  );
  if (!source.includes('registry did not stabilize before dark-mode CLS audit')) throw new Error('Dark-mode CLS stabilization gate missing.');
  write('tests/phase5-final-performance.spec.js', source);
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
patchBrowserSafetyFixture();
patchDrawerBrowserTest();
patchDarkModeClsGate();
auditStickyHeader();
console.log('Final browser audit patch passed: official dose label, physical drawer outside-click, valid safety fixture, single keyboard row toggle, stable dark-mode CLS and sticky-header/no-frozen-column contracts are active.');
