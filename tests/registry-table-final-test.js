'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const index = read('index.html');
const css = read('registry-table-final.css');
const runtime = read('registry-table-final.js');
const loader = read('registry-runtime-loader.js');
const release = read('registry-ui-release.js');

assert.match(index,/data-registry-ui-release="20260801-12"/,'index must use the final table release');
assert.match(index,/registry-table-final\.css\?v=20260801-1/,'final table stylesheet must be wired');
assert.match(index,/registry-table-final\.js\?v=20260801-3/,'final table runtime v3 must be wired');
assert.match(index,/registry-runtime-loader\.js\?v=20260801-1/,'cooperative registry runtime loader must be wired');
assert.doesNotMatch(index,/<script src="app-performance\.js"/,'the heavy registry bootstrap must not execute as a parser-ordered defer script');
assert.ok(index.indexOf('registry-table-final.css') < index.indexOf('tailadmin-professional.css'),'TailAdmin professional must remain the final static stylesheet');
assert.ok(index.indexOf('registry-table-final.js') > index.indexOf('registry-ui-release.js'),'final table runtime must execute after legacy registry controllers');
assert.match(index,/registryTableFinalMobileCompatibility[\s\S]*#dataTable tbody tr\{display:block!important\}/,'mobile registry cards must preserve the block-row contract');
assert.match(release,/registry-ui-20260801-12/,'cache release must be bumped');
assert.match(read('tests/population-verification-test.js'),/20260801-12/,'population verification audit must follow the current table release');
assert.match(read('tests/registry-fast-start-test.js'),/registry-runtime-loader\.js/,'fast-start audit must cover the cooperative loader');

assert.doesNotThrow(() => new Function(runtime),'final table runtime must be valid JavaScript');
assert.doesNotThrow(() => new Function(loader),'registry runtime loader must be valid JavaScript');
assert.match(loader,/INTERACTION_GRACE_MS = 220/,'shell must receive a bounded first-interaction grace period');
assert.match(loader,/classList\.contains\('auth-ready'\)/,'registry runtime must wait for the authenticated shell');
assert.match(loader,/requestAnimationFrame\(\(\) => requestAnimationFrame\(loadRuntime\)\)/,'heavy runtime startup must cross two paint opportunities');
assert.match(loader,/app-performance\.js\?v=20260801-1/,'loader must request the audited registry bootstrap');
assert.match(runtime,/registry-table-final-v2/,'runtime must expose the optimized v2 controller contract');
assert.match(runtime,/const MOBILE_BREAKPOINT = 760/,'runtime must have an explicit mobile breakpoint');
assert.match(runtime,/requestAnimationFrame\(reconcile\)/,'runtime work must be frame-bounded');
assert.match(runtime,/requestIdleCallback/,'non-critical pencil normalization must be idle');
assert.doesNotMatch(runtime,/observe\(document\.body/,'runtime must not observe the whole page');
assert.doesNotMatch(runtime,/tableObserver/,'runtime must not observe its own colgroup mutations');
assert.doesNotMatch(runtime,/requestAnimationFrame\(refreshObservers\)/,'observer discovery must not create a frame loop');
assert.match(runtime,/registryFinalGeometry === signature/,'column rebuilding must be idempotent');
assert.match(runtime,/if \(!registryReady\) return false/,'table geometry must wait for registry readiness');
assert.match(runtime,/attributeFilter:\['data-registry-ux-view'\]/,'theme changes must not trigger column geometry');
assert.match(runtime,/medindex:registry-ready',markRegistryReady/,'registry readiness must activate final geometry');
assert.match(runtime,/registry-table-final-width/,'runtime must publish one deterministic table width');

assert.match(css,/#dataTable thead th[\s\S]*background:#fff!important/,'header must remain white');
assert.match(css,/#dataTable :is\(th,td\)\[data-registry-column-key\][\s\S]*position:relative!important/,'all registry columns must be non-sticky');
assert.match(css,/#dataTable tbody tr \{[\s\S]*height:98px!important/,'compact rows must use stable geometry');
assert.match(css,/registry-row-expanded[\s\S]*max-height:none!important/,'expanded rows must show full inline content');
assert.match(css,/:is\(\.registry-dose-dialog,\.registry-cell-preview-dialog\)[\s\S]*display:none!important/,'legacy text modals must remain disabled');
assert.match(css,/\.clinical-editor-open \{[\s\S]*width:34px!important/,'edit action must be a compact pencil button');
assert.match(css,/\.population-verification-grid/,'strict population verification must remain visible');
assert.match(css,/@media \(max-width:760px\)[\s\S]*#dataTable tbody td[\s\S]*grid-template-columns:94px minmax\(0,1fr\)/,'mobile card cells must remain readable label/value grids');
assert.match(css,/#registryFilterPanel #search/,'search must remain part of the final filter surface');
assert.match(css,/\.col-panel\.open[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'desktop multi-column picker must be compact');
assert.doesNotMatch(css,/https?:\/\//,'final table styles must not load third-party assets');

console.log('Unified final registry table, filter, expansion, verification, cooperative startup and responsive audit passed.');
