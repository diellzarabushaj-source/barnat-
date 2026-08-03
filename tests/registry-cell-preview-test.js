'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const controller = read('registry-cell-preview.js');
const styles = read('registry-cell-preview.css');
const fullTextStyles = read('registry-full-text-expansion.css');
const dosageDisclosureStyles = read('registry-dosage-disclosure-fix.css');
const rowExpandPath = path.join(root, 'registry-row-expand.js');
const rowExpand = fs.readFileSync(rowExpandPath, 'utf8');

execFileSync(process.execPath, ['--check', rowExpandPath], { stdio:'pipe' });

assert(index.includes('registry-cell-preview.css?v=20260801-3'), 'Inline cell expansion stylesheet v3 is not wired.');
assert(index.includes('registry-full-text-expansion.css?v=20260801-1'), 'Full-row text reveal contract is not wired.');
assert(index.includes('registry-dosage-disclosure-fix.css?v=20260803-4'), 'Polished dosage disclosure stylesheet is not wired.');
assert(index.includes('registry-cell-preview.js?v=20260801-6'), 'Inline cell expansion controller is not wired.');
assert(index.includes('registry-row-expand.js?v=20260803-8'), 'Polished row expansion controller is not wired.');
assert(
  index.indexOf('registry-cell-preview.js?v=20260801-6') < index.indexOf('registry-row-expand.js?v=20260803-8'),
  'Cell expansion trigger must initialize before row expansion.'
);
assert(index.includes('data-registry-ui-release="20260801-14"'), 'Registry UI release was not preserved.');
assert(index.includes('registry-column-contract.js?v=20260801-2'), 'Column contract v2 is not wired.');
assert(index.includes('registry-unified-table.js?v=20260801-1'), 'Unified table controller is not wired.');
assert(
  index.indexOf('registry-unified-table.css?v=20260801-1') < index.indexOf('registry-full-text-expansion.css?v=20260801-1'),
  'Full-row reveal must load after the unified compact geometry.'
);

assert(controller.includes("const VERSION = 'registry-cell-preview-20260801-7'"), 'Cell preview runtime version is stale.');
assert(controller.includes('data-lineicons-icon="expand-square-4"'), 'Lineicons expand-square-4 source markup is missing.');
assert(controller.includes('rowController.toggleRow(row)'), 'Cell trigger must expand the table row inline.');
assert(controller.includes("trigger.setAttribute('aria-expanded'"), 'Inline trigger must expose its expanded state.');
assert(controller.includes("window.addEventListener('medindex:registry-table-stable', activate)"), 'Cell triggers must be rebuilt whenever the unified table stabilizes.');
assert(controller.includes('function refreshNow()'), 'Manual cell-preview refresh must be synchronous.');
assert(controller.includes('refresh:refreshNow'), 'Public refresh must use the synchronous path.');
assert(controller.includes("['select', 'trade-name', 'clinical-status', 'clinical-action'].includes(key)"), 'Preview exclusions must use the canonical column key.');
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

assert(rowExpand.includes("const VERSION = 'registry-row-expand-20260803-8'"), 'Row expansion runtime version is stale.');
assert(rowExpand.includes("const dosageTrigger = event.target.closest?.('.registry-dosage-dose')"), 'Më shumë must be handled by the row controller.');
assert(rowExpand.includes('event.stopImmediatePropagation()'), 'The legacy dosage listener must not toggle the same disclosure twice.');
assert(rowExpand.includes('syncDosageControls(row, expanded)'), 'Row expansion must synchronize dosage controls.');
assert(rowExpand.includes("toggle.textContent = expanded ? 'Më pak' : 'Më shumë'"), 'Disclosure label must match the actual state.');
assert(rowExpand.includes("regimen.dataset.dosageExpanded = String(expanded && needed)"), 'Expanded dosage state must be exposed to CSS without relying only on :has().');
assert(rowExpand.includes("link[data-registry-dosage-disclosure-fix-css]"), 'The dosage disclosure stylesheet must be protected from later compact styles.');
assert(rowExpand.includes('const desiredTail = [finalStyle, fullText, dosageDisclosure].filter(Boolean)'), 'Protected styles need one canonical tail order.');
assert(rowExpand.includes('const alreadyStable = desiredTail.length > 0'), 'Cascade stabilization needs a no-write steady state.');
assert(rowExpand.includes('if (!alreadyStable) desiredTail.forEach(node => document.head.appendChild(node))'), 'Protected styles must move only when their order is wrong.');
assert(!rowExpand.includes("document.head.lastElementChild !== finalStyle"), 'The observer must not repeatedly move the compact style after the disclosure styles.');
assert(rowExpand.includes('function rowKey(row)'), 'Expanded row identity must be stable across rerenders.');
assert(rowExpand.includes("return fallback ? `row:${fallback}` : ''"), 'Rows without registry identifiers need a deterministic fallback key.');
assert(rowExpand.includes('function isOverflowing(element)'), 'Disclosure controls must be based on real overflow.');
assert(rowExpand.includes("trigger.setAttribute('aria-controls', textId)"), 'The disclosure button must identify the controlled text.');
assert(rowExpand.includes('trigger.disabled = !needed'), 'Short text must not expose a fake disclosure button.');
assert(rowExpand.includes('function preserveRowAnchor(row, beforeTop)'), 'Expanding a row must preserve the reader position.');
assert(rowExpand.includes("if (event.key === 'Escape')"), 'Escape must close the expanded row.');
assert(rowExpand.includes('interactiveTarget(event.target, cell)'), 'The root keyboard-operable cell must not block itself.');
assert(rowExpand.includes('candidate && candidate !== root'), 'Nested controls must be ignored without disabling the root cell.');
assert(rowExpand.includes("event.key !== 'Enter' && event.key !== ' '"), 'Enter and Space keyboard disclosure is missing.');
assert(rowExpand.includes('ensureStatusRegion()'), 'Disclosure changes need an accessible live status.');
assert(rowExpand.includes("new CustomEvent('medindex:registry-row-toggle'"), 'Row state changes must be observable by other UI layers.');

assert(dosageDisclosureStyles.includes('[data-dosage-expanded="true"]'), 'CSS must have an explicit expanded-state fallback.');
assert(dosageDisclosureStyles.includes('contain:none!important'), 'Expanded cells must not remain clipped by containment.');
assert(dosageDisclosureStyles.includes('-webkit-line-clamp:unset!important'), 'Expanded dosage text must lose WebKit line clamp.');
assert(dosageDisclosureStyles.includes('line-clamp:unset!important'), 'Expanded dosage text must lose standards line clamp.');
assert(dosageDisclosureStyles.includes('max-height:none!important'), 'Expanded dosage text must lose compact max-height.');
assert(dosageDisclosureStyles.includes('overflow:visible!important'), 'Expanded dosage text must not remain hidden.');
assert(dosageDisclosureStyles.includes('.registry-dosage-toggle::after'), 'Disclosure state needs a visible directional affordance.');
assert(dosageDisclosureStyles.includes('data-disclosure-needed="false"'), 'Short text disclosure controls must remain hidden.');
assert(dosageDisclosureStyles.includes('.registry-disclosure-status'), 'Accessible disclosure status styling is missing.');
assert(dosageDisclosureStyles.includes('overflow-anchor:none!important'), 'Expanded rows must not trigger browser scroll jumps.');
assert(dosageDisclosureStyles.includes('@media (max-width:760px)'), 'Mobile disclosure rules are missing.');
assert(dosageDisclosureStyles.includes('@media (prefers-reduced-motion:reduce)'), 'Reduced-motion disclosure behavior is missing.');
assert(!/https?:\/\//.test(dosageDisclosureStyles), 'Dosage disclosure must not load third-party assets.');

console.log('Polished dosage disclosure reveals complete text with keyboard, focus, overflow and scroll stability.');
