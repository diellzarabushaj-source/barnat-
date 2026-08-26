'use strict';

/* Phase 4 browser-gate compatibility: the legacy #statusFilter remains in the
 * DOM for runtime compatibility but is intentionally not a visible physician
 * control in the composed desktop shell. Exercise the canonical visible
 * pharmaceutical-form picker instead; it drives the same full-runtime render()
 * path and therefore keeps the row-actions filter-rerender assertion meaningful.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, 'audit-registry-row-actions-browser-phase4.js');
const MARKER = 'phase4-canonical-visible-filter-v1';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

const legacy = `    // Status filter is another independent table rerender path.\n    await openFirstMenu(page);\n    await page.locator('#statusFilter').selectOption('Origjinator');\n    await waitMenuState(page, false);\n    await waitForRegistry(page);\n    assert.equal(await page.locator('#registryRowActionsMenu').count(), 1);\n    report.filterRerender = true;\n    await page.locator('#statusFilter').selectOption('');\n    await waitForRegistry(page);`;

const canonical = `    // ${MARKER}: use the visible canonical pharmaceutical-form filter.\n    // #statusFilter is retained as a compatibility node but is intentionally\n    // hidden in the composed physician shell, so it is not a valid browser hit target.\n    await openFirstMenu(page);\n    const formButton = page.locator('#formPickerBtn');\n    const formPanel = page.locator('#formPanel');\n    await formButton.waitFor({ state:'visible', timeout:10000 });\n    await formButton.click();\n    await formPanel.waitFor({ state:'visible', timeout:10000 });\n    const formCategory = formPanel.locator('.form-cat-header').first();\n    await formCategory.waitFor({ state:'visible', timeout:10000 });\n    const categoryLabel = String(await formCategory.textContent() || '').replace(/\\s*\\(\\d+\\)\\s*$/, '').trim();\n    assert.ok(categoryLabel, 'Phase 4: canonical form filter needs a visible category.');\n    await formCategory.click();\n    await waitMenuState(page, false);\n    await waitForRegistry(page);\n    assert.equal(await page.locator('#registryRowActionsMenu').count(), 1);\n    assert.ok(String(await formButton.textContent() || '').includes(categoryLabel),\n      'Phase 4: canonical form filter must expose the selected category after rerender.');\n    report.filterRerender = true;\n\n    await formButton.click();\n    await formPanel.waitFor({ state:'visible', timeout:10000 });\n    const allForms = formPanel.locator('.form-item-all').first();\n    await allForms.waitFor({ state:'visible', timeout:10000 });\n    await allForms.click();\n    await waitForRegistry(page);`;

if (!source.includes(MARKER)) {
  if (!source.includes(legacy)) {
    throw new Error('Phase 4 canonical-filter preparation could not find the legacy hidden status-filter acceptance block.');
  }
  source = source.replace(legacy, canonical);
}

if (!source.includes(MARKER)) throw new Error('Phase 4 canonical visible-filter marker missing after preparation.');
if (source.includes("page.locator('#statusFilter').selectOption")) {
  throw new Error('Phase 4 acceptance still targets the hidden legacy #statusFilter control.');
}
if (!source.includes("formPanel.locator('.form-cat-header').first()")) {
  throw new Error('Phase 4 acceptance is missing the canonical pharmaceutical-form category interaction.');
}
if (!source.includes("formPanel.locator('.form-item-all').first()")) {
  throw new Error('Phase 4 acceptance is missing canonical form-filter reset coverage.');
}

fs.writeFileSync(FILE, source, 'utf8');
console.log('✓ Phase 4 canonical filter prepared: browser acceptance uses the visible pharmaceutical-form picker instead of hidden legacy #statusFilter.');
