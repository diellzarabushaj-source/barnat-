'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const controller = read('registry-cell-preview.js');
const styles = read('registry-cell-preview.css');
const fullTextStyles = read('registry-full-text-expansion.css');
const rowExpand = read('registry-row-expand.js');
const dosageRuntime = read('registry-dosage-columns-v2.js');

assert(index.includes('registry-cell-preview.css?v=20260805-4'), 'Inline cell expansion stylesheet v3 is not wired.');
assert(index.includes('registry-full-text-expansion.css?v=20260805-2'), 'Full-row text reveal contract is not wired.');
assert(index.includes('registry-cell-preview.js?v=20260811-2'), 'Inline cell expansion controller is not wired.');
assert(
  index.indexOf('registry-cell-preview.js?v=20260811-2') < index.indexOf('registry-row-expand.js?v=20260810-1'),
  'Cell expansion trigger must initialize before row expansion.'
);
assert(index.includes('data-registry-ui-release="20260812-1"'), 'Registry UI release was not bumped.');
assert(index.includes('registry-column-contract.js?v=20260801-2'), 'Column contract v2 is not wired.');
assert(index.includes('registry-unified-table.js?v=20260812-population-column-1'), 'Unified table population controller is not wired.');
assert(
  index.indexOf('registry-unified-table.css?v=20260812-population-column-1') < index.indexOf('registry-full-text-expansion.css?v=20260805-2'),
  'Full-row reveal must load after the unified compact population geometry.'
);
assert(
  index.indexOf('registry-full-text-expansion.css?v=20260805-2') < index.indexOf('tailadmin-professional.css'),
  'TailAdmin professional must remain the final static stylesheet.'
);

assert(controller.includes("const VERSION = 'registry-cell-preview-20260811-9'"), 'Cell preview runtime version is stale.');
assert(controller.includes('function restoreCanonicalSource(cell)'), 'Canonical active-substance restore is missing.');
assert(controller.includes("raw?.['Substanca aktive']"), 'Cell preview must restore the full active-substance field from the canonical registry row.');
assert(controller.includes('data-lineicons-icon="expand-square-4"'), 'Lineicons expand-square-4 source markup is missing.');
assert(controller.includes('rowController.toggleRow(row)'), 'Cell trigger must expand the table row inline.');
assert(controller.includes("trigger.setAttribute('aria-expanded'"), 'Inline trigger must expose its expanded state.');
assert(controller.includes("window.addEventListener('medindex:registry-table-stable', activate)"), 'Cell triggers must be rebuilt whenever the unified table stabilizes.');
assert(controller.includes('function refreshNow()'), 'Manual cell-preview refresh must be synchronous.');
assert(controller.includes('refresh:refreshNow'), 'Public refresh must use the synchronous path.');
assert(controller.includes("['select', 'trade-name', 'clinical-status', 'clinical-action', 'dose-calculator'].includes(key)"), 'Preview exclusions must protect canonical action columns.');
assert(controller.includes('.dose-calculator-open'), 'Verified dose actions must be excluded from text extraction and preview controls.');
assert(!controller.includes("cell.matches('.registry-verification-column,.registry-editor-column,.registry-actions-column')"), 'Legacy CSS classes must not block a valid preview cell.');
assert(controller.includes('function ensureExpandIcon(trigger)'), 'The nested SVG may still self-heal for graceful fallback.');
assert(controller.includes('MutationObserver'), 'Cell triggers must follow table rerenders.');
assert(!controller.includes('showModal'), 'Cell expansion must not open a modal.');
assert(!controller.includes('registryCellPreviewDialog'), 'Legacy preview dialog must be removed.');
assert(!controller.includes('data-lineicons-icon="xmark"'), 'Legacy modal close icon must be removed.');
assert(!/https?:\/\//.test(controller), 'Cell expansion controller must not load third-party runtime assets.');

assert(styles.includes('.registry-cell-preview-trigger::before'), 'The immutable CSS icon layer is missing.');
assert(styles.includes('-webkit-mask-image:url("data:image/svg+xml'), 'Lineicons CSS mask is missing.');
assert(styles.includes('mask-image:url("data:image/svg+xml'), 'Standards-based Lineicons mask is missing.');
assert(styles.includes('.registry-cell-preview-trigger svg'), 'Nested SVG fallback must be explicitly controlled.');
assert(styles.includes('display:none!important'), 'Nested SVG must be hidden to avoid duplicate icons.');
assert(styles.includes('tr.registry-row-expanded[data-registry-row-expanded="true"]'), 'Expanded row height styling is missing.');
assert(styles.includes('.registry-cell-preview-trigger[aria-expanded="true"]'), 'Expanded trigger styling is missing.');
assert(!styles.includes('registry-cell-preview-dialog'), 'Legacy dialog styling must be removed.');
assert(!styles.includes('::backdrop'), 'Legacy modal backdrop styling must be removed.');
assert(styles.includes('@media (max-width:680px)'), 'Mobile inline expansion styling is missing.');
assert(styles.includes('[data-theme="dark"]'), 'Dark-mode styling is missing.');
assert(styles.includes('prefers-reduced-motion:reduce'), 'Reduced-motion handling is missing.');

assert(fullTextStyles.includes('data-registry-column-key="active-substance"] > span:first-child'), 'Anonymous active-substance wrapper must be released.');
assert(fullTextStyles.includes('data-registry-column-key="trade-name"] .drug-name-text'), 'Trade-name wrapper must be released.');
assert(fullTextStyles.includes('data-registry-column-key="dosage-adult"'), 'Adult dosage must participate in row-level reveal.');
assert(fullTextStyles.includes('data-registry-column-key="dosage-pediatric"'), 'Pediatric dosage must participate in row-level reveal.');
assert(fullTextStyles.includes('-webkit-line-clamp:unset!important'), 'Every expanded text wrapper must lose line clamp.');
assert(fullTextStyles.includes('max-height:none!important'), 'Every expanded text wrapper must lose max-height.');
assert(fullTextStyles.includes('.registry-dosage-details[open] > :not(summary)'), 'Expanded dosage details must reveal their full body.');
assert(!/https?:\/\//.test(fullTextStyles), 'Full-text expansion must not load third-party assets.');

assert(rowExpand.includes("button, input, select, textarea"), 'Row expansion must ignore nested controls.');
assert(rowExpand.includes('syncPreviewTriggers(row, expanded)'), 'Row expansion must synchronize every trigger in the row.');
assert(rowExpand.includes('function syncDosageDisclosures(row, expanded)'), 'Row expansion must synchronize dosage disclosure controls.');
assert(rowExpand.includes("regimen.classList.toggle('is-expanded', expanded)"), 'All dosage regimens must follow the canonical row state.');
assert(dosageRuntime.includes("rowController.toggleRow(row)"), 'The Më shumë control must release the containing table row.');
assert(!dosageRuntime.includes("regimen?.classList.toggle('is-expanded')"), 'The dosage control must not expand only a clipped inner element.');
assert(!styles.includes('height:132px!important;\n  min-height:132px!important'), 'Expanded desktop rows must not have a fixed height ceiling.');
assert(fullTextStyles.includes('.registry-dosage-regimen.is-expanded .registry-dosage-dose-text'), 'Expanded dosage text must have an explicit unclamped contract.');

console.log('Full-row zoom restores canonical active-substance text, population-aware unified geometry, verified dose actions and every textual column without modal or clamp.');
