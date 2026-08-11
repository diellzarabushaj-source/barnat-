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
  source = replaceOnce(
    source,
    "    const ageRules = ageMatchedRules(ageMonths);\n    if (!ageRules.length) {\n      showError('Nuk ka rregull doze për këtë moshë dhe indikacion.');\n      return false;\n    }",
    "    const ageRules = ageMatchedRules(ageMonths);\n    if (!ageRules.length) {\n      const group = productGroup(activeProduct);\n      if (group === 'adult_only' && ageMonths < 216) {\n        showError('Ky preparat nuk përdoret te fëmijët sipas burimit zyrtar. Doza nuk mund të kalkulohet.');\n      } else if (group === 'pediatric_only' && ageMonths >= 216) {\n        showError('Ky preparat nuk përdoret te të rriturit sipas burimit zyrtar. Doza nuk mund të kalkulohet.');\n      } else {\n        showError('Nuk ka rregull doze për këtë moshë dhe indikacion.');\n      }\n      return false;\n    }",
    'symmetric population fail-closed message',
  );
  if (!source.includes('modal.weight.disabled = true;') || !source.includes('modal.weight.disabled = !needsWeight;')) {
    throw new Error('Dose weight adaptive disabled-state contract missing.');
  }
  if (!source.includes("detailRow('Doza zyrtare:', doseText(rule))")) throw new Error('Official dose detail label missing.');
  if (!source.includes('Ky preparat nuk përdoret te fëmijët sipas burimit zyrtar. Doza nuk mund të kalkulohet.')) {
    throw new Error('Adult-only pediatric safety message missing.');
  }
  if (!source.includes('Ky preparat nuk përdoret te të rriturit sipas burimit zyrtar. Doza nuk mund të kalkulohet.')) {
    throw new Error('Pediatric-only adult safety message missing.');
  }
  write('registry-dose-calculator.js', source);
}

function patchRowKeyboardOwnership() {
  let rowSource = read('registry-row-expand.js');
  rowSource = replaceOnce(
    rowSource,
    "  function onKeydown(event) {\n    if (event.key !== 'Enter' && event.key !== ' ') return;\n    const cell = event.target.closest?.('td[data-registry-expandable=\"true\"]');\n    if (!cell || cell.dataset.registryCellPreview === 'true' || interactiveTarget(event.target)) return;\n    event.preventDefault();\n    toggleRow(cell.closest('tr'));\n  }",
    "  function onKeydown(event) {\n    if (event.key !== 'Enter' && event.key !== ' ') return;\n    const previewTrigger = event.target.closest?.('.registry-cell-preview-trigger');\n    if (previewTrigger) {\n      const row = previewTrigger.closest('tr');\n      if (!row) return;\n      event.preventDefault();\n      event.stopImmediatePropagation();\n      const key = rowKey(row);\n      const next = !Boolean(key && expandedRows.has(key));\n      toggleRow(row, next);\n      return;\n    }\n    const cell = event.target.closest?.('td[data-registry-expandable=\"true\"]');\n    if (!cell || cell.dataset.registryCellPreview === 'true' || interactiveTarget(event.target)) return;\n    event.preventDefault();\n    toggleRow(cell.closest('tr'));\n  }",
    'row-controller preview keyboard ownership',
  );
  if (!rowSource.includes("const previewTrigger = event.target.closest?.('.registry-cell-preview-trigger')")) throw new Error('Row keyboard preview ownership missing.');
  if (!rowSource.includes('toggleRow(row, next)')) throw new Error('Row keyboard must force an explicit expansion state.');
  write('registry-row-expand.js', rowSource);

  let previewSource = read('registry-cell-preview.js');
  previewSource = replaceOnce(
    previewSource,
    "  function onClick(event) {\n    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);\n    if (!trigger) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    toggleInline(trigger);\n  }",
    "  function onClick(event) {\n    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);\n    if (!trigger) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    if (event.detail === 0 && typeof window.MedIndexRegistryRows?.toggleRow === 'function') return;\n    toggleInline(trigger);\n  }",
    'cell preview synthetic keyboard click suppression',
  );
  if (!previewSource.includes("event.detail === 0 && typeof window.MedIndexRegistryRows?.toggleRow === 'function'")) {
    throw new Error('Cell preview synthetic keyboard click suppression missing.');
  }
  write('registry-cell-preview.js', previewSource);
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
    "async function waitForPageFlag(page, reader, expected = true, timeout = 10000) {\n  await expect.poll(() => page.evaluate(reader), { timeout }).toBe(expected);\n}",
    "async function waitForPageFlag(page, reader, expected = true, timeout = 10000) {\n  await expect.poll(async () => {\n    try {\n      return await page.evaluate(reader);\n    } catch (error) {\n      const message = String(error?.message || error || '');\n      if (/Execution context was destroyed|Cannot find context with specified id|most likely because of a navigation/i.test(message)) {\n        return '__navigation_pending__';\n      }\n      throw error;\n    }\n  }, { timeout }).toBe(expected);\n}",
    'navigation-safe mobile readiness poll',
  );
  source = replaceOnce(
    source,
    "async function viewportReport(page) {\n  return page.evaluate(() => {\n    const rect = selector => {\n      const node = document.querySelector(selector);\n      if (!node) return null;\n      const value = node.getBoundingClientRect();\n      return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height };\n    };\n    return {\n      width:innerWidth,\n      height:innerHeight,\n      htmlScrollWidth:document.documentElement.scrollWidth,\n      bodyScrollWidth:document.body.scrollWidth,\n      shell:rect('.mi-app-shell'),\n      topbar:rect('.mi-topbar'),\n      main:rect('.mi-main'),\n      mobileVersion:document.documentElement.dataset.miMobileExperience || null,\n    };\n  });\n}",
    "async function viewportReport(page) {\n  let lastError = null;\n  for (let attempt = 0; attempt < 10; attempt += 1) {\n    try {\n      return await page.evaluate(() => {\n        const rect = selector => {\n          const node = document.querySelector(selector);\n          if (!node) return null;\n          const value = node.getBoundingClientRect();\n          return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height };\n        };\n        return {\n          width:innerWidth,\n          height:innerHeight,\n          htmlScrollWidth:document.documentElement.scrollWidth,\n          bodyScrollWidth:document.body.scrollWidth,\n          shell:rect('.mi-app-shell'),\n          topbar:rect('.mi-topbar'),\n          main:rect('.mi-main'),\n          mobileVersion:document.documentElement.dataset.miMobileExperience || null,\n        };\n      });\n    } catch (error) {\n      const message = String(error?.message || error || '');\n      if (!/Execution context was destroyed|Cannot find context with specified id|most likely because of a navigation/i.test(message)) throw error;\n      lastError = error;\n      await page.waitForTimeout(50);\n    }\n  }\n  throw lastError || new Error('Viewport report could not acquire a stable browsing context.');\n}",
    'navigation-safe viewport geometry report',
  );
  source = replaceOnce(
    source,
    "  await page.locator('[data-mi-sidebar-overlay]').click({ position:{ x:Math.max(1, (await page.viewportSize()).width - 8), y:80 } });",
    "  const viewport = await page.viewportSize();\n  await page.mouse.click(Math.max(1, viewport.width - 8), 80);",
    'physical drawer outside-click test',
  );
  if (!source.includes("return '__navigation_pending__';")) throw new Error('Mobile readiness poll does not tolerate navigation context replacement.');
  if (!source.includes('for (let attempt = 0; attempt < 10; attempt += 1)')) throw new Error('Viewport report navigation retry is missing.');
  if (!source.includes('page.mouse.click(Math.max(1, viewport.width - 8), 80)')) throw new Error('Drawer browser test is not using a physical outside click.');
  write('tests/mobile-deep-audit.spec.js', source);
}

function patchCellPreviewResizeAudit() {
  let source = read('tests/registry-cell-preview.spec.js');
  source = replaceOnce(
    source,
    "  await page.setViewportSize({ width:390, height:844 });\n  await trigger.press('Enter');\n  await expect(row).toHaveAttribute('data-registry-row-expanded', 'true');\n  await expect(trigger).toHaveAttribute('aria-expanded', 'true');\n  await expect(page.locator('#registryCellPreviewDialog')).toHaveCount(0);\n  await expect(page.locator('dialog.registry-cell-preview-dialog')).toHaveCount(0);\n\n  const mobileGeometry = await row.evaluate(node => {\n    const rect = node.getBoundingClientRect();\n    return { left:rect.left, right:rect.right, height:rect.height, viewport:window.innerWidth };\n  });\n  expect(mobileGeometry.height).toBeGreaterThan(compactHeight);\n  expect(mobileGeometry.left).toBeGreaterThanOrEqual(-1);\n  expect(mobileGeometry.right).toBeLessThanOrEqual(mobileGeometry.viewport + 1);",
    "  await page.setViewportSize({ width:390, height:844 });\n  await expect.poll(\n    () => page.evaluate(() => ({\n      stable:window.MEDINDEX_REGISTRY_TABLE_AUDIT?.stable === true,\n      pending:document.getElementById('dataTable')?.dataset.registryUnifiedPending === 'true',\n      preview:window.MedIndexCellPreview?.version || '',\n    })),\n    { timeout:10000, message:'registry did not stabilize after the mobile viewport transition' }\n  ).toEqual({ stable:true, pending:false, preview:PREVIEW_VERSION });\n  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));\n\n  const mobileTrigger = page.locator('#tbody > tr .registry-cell-preview-trigger:visible').first();\n  await expect(mobileTrigger).toBeVisible({ timeout:10000 });\n  const mobileRow = mobileTrigger.locator('xpath=ancestor::tr');\n  const mobileCompactHeight = await mobileRow.evaluate(node => node.getBoundingClientRect().height);\n  await expect(mobileTrigger).toHaveAttribute('aria-expanded', 'false');\n  await mobileTrigger.press('Enter');\n  await expect(mobileRow).toHaveAttribute('data-registry-row-expanded', 'true');\n  await expect(mobileTrigger).toHaveAttribute('aria-expanded', 'true');\n  await expect(page.locator('#registryCellPreviewDialog')).toHaveCount(0);\n  await expect(page.locator('dialog.registry-cell-preview-dialog')).toHaveCount(0);\n\n  const mobileGeometry = await mobileRow.evaluate(node => {\n    const rect = node.getBoundingClientRect();\n    return { left:rect.left, right:rect.right, height:rect.height, viewport:window.innerWidth };\n  });\n  expect(mobileGeometry.height).toBeGreaterThan(mobileCompactHeight);\n  expect(mobileGeometry.left).toBeGreaterThanOrEqual(-1);\n  expect(mobileGeometry.right).toBeLessThanOrEqual(mobileGeometry.viewport + 1);",
    'visible mobile keyboard expansion audit',
  );
  if (!source.includes("const mobileTrigger = page.locator('#tbody > tr .registry-cell-preview-trigger:visible').first();")) {
    throw new Error('Visible mobile cell preview keyboard gate missing.');
  }
  write('tests/registry-cell-preview.spec.js', source);
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

function patchModalMetricsGate() {
  let source = read('tests/dose-calculator-manual-qa-v2.spec.js');
  source = replaceOnce(
    source,
    '  expect(metrics.modal.translatedBlocks).toBeGreaterThanOrEqual(2);',
    '  expect(metrics.modal.nativePopulationBlocks).toBeGreaterThanOrEqual(2);',
    'native population safety observability gate',
  );
  if (!source.includes('metrics.modal.nativePopulationBlocks')) throw new Error('Native population block metric gate missing.');
  write('tests/dose-calculator-manual-qa-v2.spec.js', source);
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
patchRowKeyboardOwnership();
patchBrowserSafetyFixture();
patchDrawerBrowserTest();
patchCellPreviewResizeAudit();
patchDarkModeClsGate();
patchModalMetricsGate();
auditStickyHeader();
console.log('Final browser audit patch passed: single-owner keyboard expansion, visible mobile keyboard audit, synthetic-click suppression, navigation-safe mobile readiness and viewport geometry, native population metrics, physical drawer outside-click, valid safety fixture, stable dark-mode CLS and sticky-header/no-frozen-column contracts are active.');
