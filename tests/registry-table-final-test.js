'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const index = read('index.html');
const css = read('registry-unified-table.css');
const runtime = read('registry-unified-table.js');
const loader = read('registry-runtime-loader.js');
const fast = read('registry-fast-start.js');
const release = read('registry-ui-release.js');

assert.match(index,/data-registry-ui-release="20260801-13"/,'index must use the unified table release');
assert.match(index,/registry-unified-table\.css\?v=20260801-1/,'unified table stylesheet must be wired');
assert.match(index,/registry-unified-table\.js\?v=20260801-1/,'unified table controller must be wired');
assert.match(index,/registry-runtime-loader\.js\?v=20260801-6/,'fast authenticated registry loader must be wired');
assert.ok(index.indexOf('registry-unified-table.css') < index.indexOf('tailadmin-professional.css'),'TailAdmin professional must remain the final static stylesheet');
assert.ok(index.indexOf('registry-ui-release.js') < index.indexOf('registry-unified-table.js'),'unified controller must run after the release guard');
assert.doesNotMatch(index,/(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.(?:css|js)/,'competing table controllers must not be loaded');
assert.doesNotMatch(index,/registryTableFinalMobileCompatibility/,'legacy mobile compatibility patch must be removed');
assert.doesNotMatch(index,/<script src="app-performance\.js"/,'heavy registry bootstrap must remain dynamically loaded after authentication');
assert.match(release,/registry-ui-20260801-13/,'cache release must match the unified table');
assert.match(fast,/releaseInteractiveShell/,'visual loader must release when authentication and shell are ready');
assert.match(fast,/loader\.style\.pointerEvents = 'none'/,'visual loader must never intercept the table after shell readiness');

assert.doesNotThrow(() => new Function(runtime),'unified table controller must be valid JavaScript');
assert.doesNotThrow(() => new Function(loader),'registry runtime loader must be valid JavaScript');
assert.match(loader,/registry-runtime-loader-v6/,'loader must expose the immediate authenticated version');
assert.match(loader,/app-performance\.js\?v=20260801-2/,'loader must request the current registry bootstrap');
assert.match(loader,/classList\.contains\('auth-ready'\)/,'registry startup must wait for authentication');
assert.match(loader,/requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(\)/,'registry startup must yield one paint without an artificial multi-second wait');
assert.doesNotMatch(loader,/FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/,'interaction gates and five-second fallbacks must be removed');
assert.doesNotMatch(loader,/MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/,'loader must not create a circular readiness promise');

assert.match(runtime,/registry-unified-table-20260801-1/,'unified controller version is missing');
assert.match(runtime,/const FULL_ORDER = Object\.freeze/,'one canonical full-column order is required');
assert.match(runtime,/const CLINICAL_ORDER = Object\.freeze/,'one canonical clinical-column order is required');
assert.match(runtime,/clinical-action':54/,'edit column must remain compact');
assert.match(runtime,/table\.querySelectorAll\(':scope > colgroup'\)\.forEach\(group => group\.remove\(\)\)/,'only one colgroup may survive');
assert.match(runtime,/observer\.observe\(header, \{ childList:true \}\)/,'header observer must be shallow');
assert.match(runtime,/observer\.observe\(tbody, \{ childList:true \}\)/,'body observer must watch only row replacement');
assert.doesNotMatch(runtime,/observe\(document\.body|subtree\s*:\s*true/,'unified controller must never scan the whole page or table subtree');
assert.match(runtime,/registryUnifiedIntegrity/,'runtime must expose row/header integrity');
assert.match(runtime,/MEDINDEX_REGISTRY_TABLE_AUDIT/,'runtime must expose a browser audit object');
assert.match(runtime,/normalizePencils/,'edit buttons must be normalized once by the unified controller');
assert.match(runtime,/registry-dose-dialog|registry-cell-preview-dialog/,'',);

assert.match(css,/#dataTable\[data-registry-unified-table\] thead th[\s\S]*background:#fff!important/,'header must remain white');
assert.match(css,/#dataTable\[data-registry-unified-table\] :is\(th,td\)\[data-registry-column-key\][\s\S]*position:relative!important/,'columns must be non-sticky');
assert.match(css,/#dataTable\[data-registry-unified-table\] tbody tr \{[\s\S]*height:92px!important/,'rows must use compact stable geometry');
assert.match(css,/registry-row-expanded[\s\S]*max-height:none!important/,'expanded rows must reveal full inline content');
assert.match(css,/:is\(\.registry-dose-dialog,\.registry-cell-preview-dialog\)[\s\S]*display:none!important/,'legacy text modals must remain disabled');
assert.match(css,/\.clinical-editor-open \{[\s\S]*width:34px!important/,'edit action must be one compact pencil');
assert.match(css,/\.population-verification-grid/,'strict population verification must remain visible');
assert.match(css,/@media \(max-width:760px\)[\s\S]*#dataTable tbody td\[data-registry-column-key\][\s\S]*grid-template-columns:94px minmax\(0,1fr\)/,'mobile cards must remain readable');
assert.match(css,/#registryFilterPanel #search/,'search must remain visible in the unified filter surface');
assert.match(css,/\.col-panel\.open[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'desktop multi-column picker must remain compact');
assert.doesNotMatch(css,/position:sticky|position:fixed[^;]*!important;[\s\S]{0,80}data-registry-column-key/,'table columns must never be frozen');
assert.doesNotMatch(css,/https?:\/\//,'unified table styles must not load third-party assets');

console.log('Single-controller registry table, immediate startup and column-integrity audit passed.');
