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

assert(index.includes('registry-cell-preview.css?v=20260801-1'), 'Cell preview stylesheet is not wired.');
assert(index.includes('registry-cell-preview.js?v=20260801-1'), 'Cell preview controller is not wired.');
assert(
  index.indexOf('registry-cell-preview.js?v=20260801-1') < index.indexOf('registry-row-expand.js?v=20260801-3'),
  'Cell preview must initialize before row expansion.'
);
assert(index.includes('data-registry-ui-release="20260801-9"'), 'Registry UI release was not bumped.');

assert(controller.includes('data-lineicons-icon="expand-square-4"'), 'Lineicons expand-square-4 is missing.');
assert(controller.includes('data-lineicons-icon="xmark"'), 'Lineicons xmark is missing.');
assert(controller.includes("const DIALOG_ID = 'registryCellPreviewDialog'"), 'Accessible preview dialog is missing.');
assert(controller.includes("body.textContent = text"), 'Preview text must be inserted safely with textContent.');
assert(controller.includes('MutationObserver'), 'Cell previews must follow table rerenders.');
assert(!/https?:\/\//.test(controller), 'Cell preview controller must not load third-party runtime assets.');

assert(styles.includes('registry-cell-preview-dialog::backdrop'), 'Dialog backdrop styling is missing.');
assert(styles.includes('@media (max-width:680px)'), 'Mobile bottom-sheet styling is missing.');
assert(styles.includes('[data-theme="dark"]'), 'Dark-mode styling is missing.');
assert(styles.includes('prefers-reduced-motion:reduce'), 'Reduced-motion handling is missing.');

assert(rowExpand.includes("button, input, select, textarea"), 'Row expansion must ignore nested buttons.');
assert(rowExpand.includes("cell.dataset.registryCellPreview === 'true'"), 'Row expansion must defer to cell previews.');

console.log('Full-cell preview and local Lineicons integration audit passed.');
