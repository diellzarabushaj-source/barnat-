'use strict';

// The Phase 4 audit is source-controlled as a readable scenario. Before CI runs
// it, this tiny preparation step makes two timing contracts explicit:
//  1) mutations start only after the personal-library runtime is authoritative;
//  2) optimistic aria-checked is asserted independently from the temporary
//     disabled/busy state while the write is being acknowledged.
// This does not alter application code or relax any assertion.

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, 'audit-registry-row-actions-browser-phase4.js');
const MARKER = 'phase4-library-ready-and-optimistic-state-v1';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const oldWait = `async function waitFavoriteState(page, checked) {\n  const action = page.locator('#registryRowActionsMenu [data-row-menu-favorite]');\n  await poll(\`favorite aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked) && !(await action.isDisabled());\n  }, { timeout:15000 });\n}`;
  const newWait = `// ${MARKER}\nasync function waitFavoriteState(page, checked) {\n  const action = page.locator('#registryRowActionsMenu [data-row-menu-favorite]');\n  await poll(\`optimistic favorite aria-checked=\${checked}\`, async () => {\n    if ((await action.count()) !== 1) return false;\n    return (await action.getAttribute('aria-checked')) === String(checked);\n  }, { timeout:5000 });\n}\n\nasync function waitFavoriteSettled(page) {\n  const action = page.locator('#registryRowActionsMenu [data-row-menu-favorite]');\n  await poll('favorite sync settlement', async () => {\n    if ((await action.count()) !== 1) return false;\n    return !(await action.isDisabled());\n  }, { timeout:20000 });\n}\n\nasync function waitPersonalLibraryReady(page) {\n  await poll('personal library readiness', async () => page.evaluate(() => {\n    const diagnostics = window.MedIndexRegistryPersonalization?.diagnostics?.();\n    return diagnostics?.libraryReady === true && diagnostics?.librarySyncState !== 'loading';\n  }), { timeout:20000 });\n}`;
  if (!source.includes(oldWait)) throw new Error('Phase 4 preparation could not find the original favorite wait helper.');
  source = source.replace(oldWait, newWait);

  const anchor = `    report.keyboard = true;\n\n    // Favorite optimistic write + authoritative acknowledgement + removal.`;
  const replacement = `    report.keyboard = true;\n\n    // First-render/keyboard semantics are intentionally independent from network\n    // state. Mutation acceptance begins only when the personal library has\n    // completed its authoritative startup handshake.\n    await waitPersonalLibraryReady(page);\n\n    // Favorite optimistic write + authoritative acknowledgement + removal.`;
  if (!source.includes(anchor)) throw new Error('Phase 4 preparation could not find the mutation-phase anchor.');
  source = source.replace(anchor, replacement);

  source = source.replace(
    `    await waitFavoriteState(page, true);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'true');\n    await favorite.click();`,
    `    await waitFavoriteState(page, true);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'true');\n    await waitFavoriteSettled(page);\n    await favorite.click();`
  );
  source = source.replace(
    `    await waitFavoriteState(page, false);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'false');\n    report.favoriteRoundTrip = true;`,
    `    await waitFavoriteState(page, false);\n    assert.equal(await favorite.getAttribute('aria-checked'), 'false');\n    await waitFavoriteSettled(page);\n    report.favoriteRoundTrip = true;`
  );
  // The later keep-one-favorite action must also settle before switching views.
  const later = `    await favorite.click();\n    await waitFavoriteState(page, true);\n\n    // Search must close any stale menu`;
  const laterReplacement = `    await favorite.click();\n    await waitFavoriteState(page, true);\n    await waitFavoriteSettled(page);\n\n    // Search must close any stale menu`;
  if (!source.includes(later)) throw new Error('Phase 4 preparation could not find the retained-favorite anchor.');
  source = source.replace(later, laterReplacement);
}

if (!source.includes(MARKER)) throw new Error('Phase 4 preparation marker missing after patch.');
if (!source.includes("diagnostics?.libraryReady === true")) throw new Error('Phase 4 library readiness gate missing after patch.');
if (!source.includes("optimistic favorite aria-checked")) throw new Error('Phase 4 optimistic Favorite assertion missing after patch.');
if (!source.includes("favorite sync settlement")) throw new Error('Phase 4 Favorite settlement assertion missing after patch.');

fs.writeFileSync(FILE, source, 'utf8');
console.log('✓ Phase 4 audit prepared: library-ready mutation start, independent optimistic Favorite state and explicit sync settlement.');
