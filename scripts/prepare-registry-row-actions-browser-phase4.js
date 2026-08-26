'use strict';

// Phase 4 runs against a real browser and the composed registry runtime. This
// preparation step keeps the checked-in scenario readable while making the
// async contracts explicit before Chromium executes it:
//  1) mutations start only after the personal library is authoritative;
//  2) optimistic aria-checked is asserted independently from persistence;
//  3) persistence settlement is read from runtime diagnostics, not from a menu
//     node that may intentionally be hidden/stale after a row rerender;
//  4) after settlement the canonical ⋯ is reopened and the new row must expose
//     the persisted state as enabled UI.
// No application source, CSP or timeout budget is weakened here.

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, 'audit-registry-row-actions-browser-phase4.js');
const MARKER = 'phase4-library-ready-and-rerender-aware-favorite-v2';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const oldWait = `async function waitFavoriteState(page, checked) {\n  const action = page.locator('#registryRowActionsMenu [data-row-menu-favorite]');\n  await poll(\`favorite aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked) && !(await action.isDisabled());\n  }, { timeout:15000 });\n}`;

  const newWait = `// ${MARKER}\nasync function waitFavoriteState(page, checked) {\n  const action = page.locator('#registryRowActionsMenu [data-row-menu-favorite]');\n  await poll(\`optimistic favorite aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked);\n  }, { timeout:5000 });\n}\n\nasync function waitFavoriteSettled(page, checked) {\n  await poll(\`favorite persistence settlement=\${checked}\`, async () => page.evaluate(() => {\n    const diagnostics = window.MedIndexRegistryPersonalization?.diagnostics?.();\n    return diagnostics?.favoriteInFlight === 0 && diagnostics?.librarySyncState === 'synced';\n  }), { timeout:20000 });\n\n  const menu = page.locator('#registryRowActionsMenu');\n  if (!(await menu.isVisible())) await openFirstMenu(page);\n\n  const action = menu.locator('[data-row-menu-favorite]');\n  await poll(\`settled favorite UI aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1 || !(await menu.isVisible())) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked) && !(await action.isDisabled());\n  }, { timeout:10000 });\n}\n\nasync function waitPersonalLibraryReady(page) {\n  await poll('personal library readiness', async () => page.evaluate(() => {\n    const diagnostics = window.MedIndexRegistryPersonalization?.diagnostics?.();\n    return diagnostics?.libraryReady === true && diagnostics?.librarySyncState !== 'loading';\n  }), { timeout:20000 });\n}`;

  if (!source.includes(oldWait)) throw new Error('Phase 4 preparation could not find the original favorite wait helper.');
  source = source.replace(oldWait, newWait);

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

  // Keep one favorite for the later canonical Favorites view. It must be fully
  // acknowledged before search/pagination/view transitions begin.
  const later = `    await favorite.click();\n    await waitFavoriteState(page, true);\n\n    // Search must close any stale menu`;
  const laterReplacement = `    await favorite.click();\n    await waitFavoriteState(page, true);\n    await waitFavoriteSettled(page, true);\n\n    // Search must close any stale menu`;
  if (!source.includes(later)) throw new Error('Phase 4 preparation could not find the retained-favorite anchor.');
  source = source.replace(later, laterReplacement);
}

if (!source.includes(MARKER)) throw new Error('Phase 4 v2 preparation marker missing after patch.');
if (!source.includes("diagnostics?.libraryReady === true")) throw new Error('Phase 4 library readiness gate missing after patch.');
if (!source.includes("diagnostics?.favoriteInFlight === 0")) throw new Error('Phase 4 Favorite in-flight settlement gate missing after patch.');
if (!source.includes("diagnostics?.librarySyncState === 'synced'")) throw new Error('Phase 4 authoritative Favorite sync gate missing after patch.');
if (!source.includes("if (!(await menu.isVisible())) await openFirstMenu(page);")) throw new Error('Phase 4 rerender-aware menu reopen gate missing after patch.');
if (!source.includes('settled favorite UI aria-checked=')) throw new Error('Phase 4 settled Favorite UI assertion missing after patch.');

fs.writeFileSync(FILE, source, 'utf8');
console.log('✓ Phase 4 audit prepared: library-ready start, optimistic Favorite state, authoritative sync settlement, rerender-aware ⋯ reopen and settled UI verification.');
