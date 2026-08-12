'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('index.html');
const tools = read('registry-table-tools.js');
const styles = read('registry-table-tools.css');
const workspace = read('registry-ux-phase3.js');
const unified = read('registry-unified-table.js');
const worker = read('sw.js');

assert.doesNotThrow(() => new Function(tools), 'Registry table tools must be valid JavaScript');
assert.match(html, /registry-table-tools\.css\?v=20260812-1/);
assert.match(html, /registry-table-tools\.js\?v=20260812-1/);
assert.ok(html.indexOf('tailadmin-professional.css') < html.indexOf('registry-table-tools.css'), 'Table refinements must load after the professional dashboard bundle');
assert.ok(html.indexOf('registry-user-personalization.js') < html.indexOf('registry-table-tools.js'), 'The note component must reuse the existing per-user persistence controller');
assert.ok(html.indexOf('registry-table-tools.js') < html.indexOf('registry-ux-phase3.js'), 'Workspace actions must be able to open the note component');

assert.match(styles, /data-registry-column-key="clinical-status"/);
assert.match(styles, /data-registry-column-key="clinical-action"/);
assert.match(styles, /data-registry-column-key="personal-note"/);
assert.match(styles, /:not\(\[data-registry-dose-column-visible="true"\]\)/, 'Dose must be hidden by default');
assert.match(styles, /data-registry-dose-column-visible="true"/, 'Dose must have an explicit opt-in state');
assert.match(styles, /registry-note-dialog/);
assert.match(styles, /data-theme="dark"/);
assert.match(styles, /@media\(max-width:640px\)/);
assert.match(styles, /@media print/);
assert.doesNotMatch(styles, /https?:\/\//, 'The table component must not load third-party assets');

assert.match(tools, /medindex\.registry\.dose-calculator\.visible\.v1/);
assert.match(tools, /localStorage\.getItem\(DOSE_STORAGE_KEY\) === 'true'/, 'Dose must default to hidden without an opt-in preference');
assert.match(tools, /Kalkulatori i dozës/);
assert.match(tools, /text === 'verifikimi'/);
assert.match(tools, /text === 'redakto'/);
assert.match(tools, /text\.startsWith\('shënime personale'\)/);
assert.match(tools, /MedIndexPersonalNoteComponent/);
assert.match(tools, /data-note-dialog-editor/);
assert.match(tools, /activeSource\.dispatchEvent\(new Event\('input'/, 'Dialog edits must pass through the existing autosave controller');
assert.match(tools, /activeSource\.dispatchEvent\(new FocusEvent\('blur'/, 'Closing the dialog must flush the existing autosave controller');
assert.doesNotMatch(tools, /fetch\(|\/api\//, 'This visual change must not introduce a new backend path');

assert.match(workspace, /MedIndexPersonalNoteComponent\?\.openByKey/);
assert.match(workspace, /MedIndexPersonalNoteComponent\?\.openForRow/);
assert.doesNotMatch(unified, /dozat, rruga dhe verifikimi janë të prioritizuara/);
assert.ok(worker.includes('/registry-table-tools.css'));
assert.ok(worker.includes('/registry-table-tools.js'));

console.log('Optional dose column, removed verification/edit columns and personal-note dialog audit passed.');
