'use strict';

// Phase 4 runs against a real browser and the composed registry runtime. This
// preparation step keeps the checked-in scenario readable while making the
// async contracts explicit before Chromium executes it:
//  1) mutations start only after the personal library is authoritative;
//  2) optimistic aria-checked is asserted independently from persistence;
//  3) persistence settlement is read from runtime diagnostics, not from a menu
//     node that may intentionally be hidden/stale after a row rerender;
//  4) after settlement the canonical ⋯ is reopened and the new row must expose
//     the persisted state as enabled UI;
//  5) opening ⋯ itself is rerender-safe: a transient row handoff may close the
//     first click, but the gate retries only against the current connected row;
//  6) pagination hit-testing is captured from the real composed shell before
//     the normal pointer click so any overlap fix is evidence-based.
// No application source, CSP or timeout budget is weakened here.

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, 'audit-registry-row-actions-browser-phase4.js');
const MARKER = 'phase4-pagination-hit-target-diagnostics-v4';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const oldWait = `async function waitFavoriteState(page, checked) {\n  const action = page.locator('#registryRowActionsMenu [data-row-menu-favorite]');\n  await poll(\`favorite aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked) && !(await action.isDisabled());\n  }, { timeout:15000 });\n}`;

  const newWait = `// ${MARKER}\nasync function waitFavoriteState(page, checked) {\n  const action = page.locator('#registryRowActionsMenu [data-row-menu-favorite]');\n  await poll(\`optimistic favorite aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked);\n  }, { timeout:5000 });\n}\n\nasync function waitFavoriteSettled(page, checked) {\n  await poll(\`favorite persistence settlement=\${checked}\`, async () => page.evaluate(() => {\n    const diagnostics = window.MedIndexRegistryPersonalization?.diagnostics?.();\n    return diagnostics?.favoriteInFlight === 0 && diagnostics?.librarySyncState === 'synced';\n  }), { timeout:20000 });\n\n  const menu = page.locator('#registryRowActionsMenu');\n  if (!(await menu.isVisible())) await openFirstMenu(page);\n\n  const action = menu.locator('[data-row-menu-favorite]');\n  await poll(\`settled favorite UI aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1 || !(await menu.isVisible())) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked) && !(await action.isDisabled());\n  }, { timeout:10000 });\n}\n\nasync function waitPersonalLibraryReady(page) {\n  await poll('personal library readiness', async () => page.evaluate(() => {\n    const diagnostics = window.MedIndexRegistryPersonalization?.diagnostics?.();\n    return diagnostics?.libraryReady === true && diagnostics?.librarySyncState !== 'loading';\n  }), { timeout:20000 });\n}`;

  if (!source.includes(oldWait)) throw new Error('Phase 4 preparation could not find the original favorite wait helper.');
  source = source.replace(oldWait, newWait);

  const oldOpen = `async function openFirstMenu(page) {\n  const trigger = page.locator('#tbody > tr [data-row-actions-menu]').first();\n  await trigger.waitFor({ state:'visible', timeout:15000 });\n  await trigger.click();\n  await waitMenuState(page, true);\n  return trigger;\n}`;
  const newOpen = `async function openFirstMenu(page) {\n  const menu = page.locator('#registryRowActionsMenu');\n  const deadline = Date.now() + 12000;\n  let lastError = null;\n\n  while (Date.now() < deadline) {\n    try {\n      if (await menu.isVisible()) {\n        return page.locator('#tbody > tr [data-row-actions-menu]').first();\n      }\n      const trigger = page.locator('#tbody > tr [data-row-actions-menu]').first();\n      await trigger.waitFor({ state:'visible', timeout:2000 });\n      await trigger.click({ timeout:2000 });\n      await sleep(140);\n      if (await menu.isVisible()) {\n        const expanded = await trigger.getAttribute('aria-expanded');\n        if (expanded === 'true') return trigger;\n      }\n    } catch (error) {\n      lastError = error;\n    }\n    await sleep(120);\n  }\n\n  const detail = lastError ? \` Last error: \${lastError.message || lastError}\` : '';\n  throw new Error('Phase 4 could not open the canonical ⋯ menu on a settled connected row.' + detail);\n}`;
  if (!source.includes(oldOpen)) throw new Error('Phase 4 preparation could not find the original openFirstMenu helper.');
  source = source.replace(oldOpen, newOpen);

  const anchor = `    report.keyboard = true;\n\n    // Favorite optimistic write + authoritative acknowledgement + removal.`;
  const replacement = `    report.keyboard = true;\n\n    // First-render and keyboard semantics are intentionally independent from\n    // network state. Mutation acceptance begins only after the personal library\n    // has completed its authoritative startup handshake.\n    await waitPersonalLibraryReady(page);\n\n    // Favorite optimistic write + authoritative acknowledgement + removal.`;
  if (!source.includes(anchor)) throw new Error('Phase 4 preparation could not find the mutation-phase anchor.');
  source = source.replace(anchor, replacement);

  const addThenRemove = `    await waitFavoriteState(page, true);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'true');\n    await favorite.click();`;
  const addThenRemoveReplacement = `    await waitFavoriteState(page, true);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'true');\n    await waitFavoriteSettled(page, true);\n    await favorite.click();`;
  if (!source.includes(addThenRemove)) throw new Error('Phase 4 preparation could not find Favorite add settlement anchor.');
  source = source.replace(addThenRemove, addThenRemoveReplacement);

  const removeSettlement = `    await waitFavoriteState(page, false);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'false');\n    report.favoriteRoundTrip = true;`;
  const removeSettlementReplacement = `    await waitFavoriteState(page, false);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'false');\n    await waitFavoriteSettled(page, false);\n    report.favoriteRoundTrip = true;`;
  if (!source.includes(removeSettlement)) throw new Error('Phase 4 preparation could not find Favorite remove settlement anchor.');
  source = source.replace(removeSettlement, removeSettlementReplacement);

  const later = `    await favorite.click();\n    await waitFavoriteState(page, true);\n\n    // Search must close any stale menu`;
  const laterReplacement = `    await favorite.click();\n    await waitFavoriteState(page, true);\n    await waitFavoriteSettled(page, true);\n\n    // Search must close any stale menu`;
  if (!source.includes(later)) throw new Error('Phase 4 preparation could not find the retained-favorite anchor.');
  source = source.replace(later, laterReplacement);

  const paginationAnchor = `    assert.ok(await pageTwo.count(), 'Phase 4: the 4006-row fixture must expose page 2.');\n    await pageTwo.click();`;
  const paginationInstrumented = `    assert.ok(await pageTwo.count(), 'Phase 4: the 4006-row fixture must expose page 2.');\n    const paginationGeometry = await pageTwo.evaluate(button => {\n      const describe = element => {\n        if (!(element instanceof Element)) return null;\n        const rect = element.getBoundingClientRect();\n        const style = getComputedStyle(element);\n        return {\n          tag:element.tagName.toLowerCase(),\n          id:element.id || '',\n          className:typeof element.className === 'string' ? element.className : '',\n          rect:{ left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height },\n          position:style.position,\n          zIndex:style.zIndex,\n          pointerEvents:style.pointerEvents,\n          display:style.display,\n          visibility:style.visibility,\n          overflow:style.overflow,\n          overflowX:style.overflowX,\n          overflowY:style.overflowY,\n          transform:style.transform,\n          opacity:style.opacity,\n        };\n      };\n      const rect = button.getBoundingClientRect();\n      const center = { x:rect.left + rect.width / 2, y:rect.top + rect.height / 2 };\n      const hit = document.elementFromPoint(center.x, center.y);\n      const workspace = document.querySelector('.registry-page-workspace');\n      const pagination = document.getElementById('pagination');\n      const registry = document.getElementById('registryContent');\n      const pseudo = workspace ? ['::before', '::after'].map(selector => {\n        const style = getComputedStyle(workspace, selector);\n        return { selector, content:style.content, display:style.display, position:style.position, zIndex:style.zIndex, pointerEvents:style.pointerEvents, background:style.backgroundColor };\n      }) : [];\n      const parents = [];\n      let node = button.parentElement;\n      while (node && parents.length < 8) { parents.push(describe(node)); node = node.parentElement; }\n      return { center, button:describe(button), hit:describe(hit), pagination:describe(pagination), registry:describe(registry), workspace:describe(workspace), pseudo, parents };\n    });\n    console.log('REGISTRY_PHASE4_PAGINATION_GEOMETRY ' + JSON.stringify(paginationGeometry, null, 2));\n    await pageTwo.click();`;
  if (!source.includes(paginationAnchor)) throw new Error('Phase 4 preparation could not find the pagination click anchor.');
  source = source.replace(paginationAnchor, paginationInstrumented);
}

if (!source.includes(MARKER)) throw new Error('Phase 4 v4 preparation marker missing after patch.');
if (!source.includes("diagnostics?.libraryReady === true")) throw new Error('Phase 4 library readiness gate missing after patch.');
if (!source.includes("diagnostics?.favoriteInFlight === 0")) throw new Error('Phase 4 Favorite in-flight settlement gate missing after patch.');
if (!source.includes("diagnostics?.librarySyncState === 'synced'")) throw new Error('Phase 4 authoritative Favorite sync gate missing after patch.');
if (!source.includes("if (!(await menu.isVisible())) await openFirstMenu(page);")) throw new Error('Phase 4 rerender-aware menu reopen gate missing after patch.');
if (!source.includes('settled favorite UI aria-checked=')) throw new Error('Phase 4 settled Favorite UI assertion missing after patch.');
if (!source.includes('Phase 4 could not open the canonical ⋯ menu on a settled connected row.')) throw new Error('Phase 4 rerender-safe menu-open assertion missing after patch.');
if (!source.includes('REGISTRY_PHASE4_PAGINATION_GEOMETRY')) throw new Error('Phase 4 pagination hit-target diagnostics missing after patch.');

fs.writeFileSync(FILE, source, 'utf8');
console.log('✓ Phase 4 audit prepared: Favorite lifecycle, rerender-safe ⋯ interaction and evidence-based pagination hit-target diagnostics.');
