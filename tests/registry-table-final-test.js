'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const index = read('index.html');
const css = read('registry-table-final.css');
const runtime = read('registry-table-final.js');
const release = read('registry-ui-release.js');

assert.match(index,/data-registry-ui-release="20260801-12"/,'index must use the final table release');
assert.match(index,/registry-table-final\.css\?v=20260801-1/,'final table stylesheet must be wired');
assert.match(index,/registry-table-final\.js\?v=20260801-1/,'final table runtime must be wired');
assert.ok(index.indexOf('registry-table-final.css') < index.indexOf('tailadmin-professional.css'),'TailAdmin professional must remain the final static stylesheet');
assert.ok(index.indexOf('registry-table-final.js') > index.indexOf('registry-ui-release.js'),'final table runtime must execute after legacy registry controllers');
assert.match(release,/registry-ui-20260801-12/,'cache release must be bumped');

assert.doesNotThrow(() => new Function(runtime),'final table runtime must be valid JavaScript');
assert.match(runtime,/const MOBILE_BREAKPOINT = 760/,'runtime must have an explicit mobile breakpoint');
assert.match(runtime,/requestAnimationFrame\(reconcile\)/,'runtime work must be frame-bounded');
assert.match(runtime,/requestIdleCallback/,'non-critical pencil normalization must be idle');
assert.doesNotMatch(runtime,/observe\(document\.body/,'runtime must not observe the whole page');
assert.doesNotMatch(runtime,/observe\([^,]+,\s*\{[^}]*characterData:true/s,'runtime must not observe text mutations');
assert.match(runtime,/table\.querySelectorAll\(':scope > colgroup'\)/,'runtime must replace competing column geometry');
assert.match(runtime,/registry-table-final-width/,'runtime must publish one deterministic table width');

assert.match(css,/#dataTable thead th[\s\S]*background:#fff!important/,'header must remain white');
assert.match(css,/#dataTable :is\(th,td\)\[data-registry-column-key\][\s\S]*position:relative!important/,'all registry columns must be non-sticky');
assert.match(css,/#dataTable tbody tr \{[\s\S]*height:98px!important/,'compact rows must use stable geometry');
assert.match(css,/registry-row-expanded[\s\S]*max-height:none!important/,'expanded rows must show full inline content');
assert.match(css,/:is\(\.registry-dose-dialog,\.registry-cell-preview-dialog\)[\s\S]*display:none!important/,'legacy text modals must remain disabled');
assert.match(css,/\.clinical-editor-open \{[\s\S]*width:34px!important/,'edit action must be a compact pencil button');
assert.match(css,/\.population-verification-grid/,'strict population verification must remain visible');
assert.match(css,/@media \(max-width:760px\)[\s\S]*#dataTable tbody tr \{[\s\S]*display:grid!important/,'mobile rows must become cards');
assert.match(css,/#registryFilterPanel #search/,'search must remain part of the final filter surface');
assert.match(css,/\.col-panel\.open[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'desktop multi-column picker must be compact');
assert.doesNotMatch(css,/https?:\/\//,'final table styles must not load third-party assets');

console.log('Unified final registry table, filter, expansion, verification and responsive audit passed.');
