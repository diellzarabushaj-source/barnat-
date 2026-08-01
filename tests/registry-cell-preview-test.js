'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const controller = read('registry-cell-preview.js');
const styles = read('registry-cell-preview.css');
const rowExpand = read('registry-row-expand.js');

assert(index.includes('registry-cell-preview.css?v=20260801-2'), 'Inline cell expansion stylesheet is not wired.');
assert(index.includes('registry-cell-preview.js?v=20260801-2'), 'Inline cell expansion controller is not wired.');
assert(
  index.indexOf('registry-cell-preview.js?v=20260801-2') < index.indexOf('registry-row-expand.js?v=20260801-4'),
  'Cell expansion trigger must initialize before row expansion.'
);
assert(index.includes('data-registry-ui-release="20260801-10"'), 'Registry UI release was not bumped.');

assert(controller.includes('data-lineicons-icon="expand-square-4"'), 'Lineicons expand-square-4 is missing.');
assert(controller.includes('rowController.toggleRow(row)'), 'Cell trigger must expand the table row inline.');
assert(controller.includes("trigger.setAttribute('aria-expanded'"), 'Inline trigger must expose its expanded state.');
assert(controller.includes('MutationObserver'), 'Cell triggers must follow table rerenders.');
assert(!controller.includes('showModal'), 'Cell expansion must not open a modal.');
assert(!controller.includes('registryCellPreviewDialog'), 'Legacy preview dialog must be removed.');
assert(!controller.includes('data-lineicons-icon="xmark"'), 'Legacy modal close icon must be removed.');
assert(!/https?:\/\//.test(controller), 'Cell expansion controller must not load third-party runtime assets.');

assert(styles.includes('tr.registry-row-expanded td[data-registry-cell-preview="true"]'), 'Expanded row height styling is missing.');
assert(styles.includes('.registry-cell-preview-trigger[aria-expanded="true"]'), 'Expanded trigger styling is missing.');
assert(!styles.includes('registry-cell-preview-dialog'), 'Legacy dialog styling must be removed.');
assert(!styles.includes('::backdrop'), 'Legacy modal backdrop styling must be removed.');
assert(styles.includes('@media (max-width:680px)'), 'Mobile inline expansion styling is missing.');
assert(styles.includes('[data-theme="dark"]'), 'Dark-mode styling is missing.');
assert(styles.includes('prefers-reduced-motion:reduce'), 'Reduced-motion handling is missing.');

assert(rowExpand.includes("button, input, select, textarea"), 'Row expansion must ignore nested controls.');
assert(rowExpand.includes('syncPreviewTriggers(row, expanded)'), 'Row expansion must synchronize the cell trigger state.');

console.log('Inline full-cell row expansion and local Lineicons integration audit passed.');
