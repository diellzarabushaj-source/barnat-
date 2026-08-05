'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const index = read('index.html');
const css = read('registry-unified-table.css');
const fullTextCss = read('registry-full-text-expansion.css');
const runtime = read('registry-unified-table.js');
const loader = read('registry-runtime-loader.js');
const fast = read('registry-fast-start.js');
const release = read('registry-ui-release.js');

assert.match(index,/data-registry-ui-release="20260805-23"/,'index must use the manual-QA release');
assert.match(index,/registry-unified-table\.css\?v=20260801-1/,'unified table stylesheet must be wired');
assert.match(index,/registry-full-text-expansion\.css\?v=20260805-2/,'full-row text stylesheet must be wired');
assert.match(index,/registry-unified-table\.js\?v=20260801-1/,'unified table controller must be wired');
assert.match(index,/registry-runtime-loader\.js\?v=20260801-6/,'fast authenticated registry loader must be wired');
assert.ok(index.indexOf('registry-unified-table.css') < index.indexOf('registry-full-text-expansion.css'),'full-row reveal must follow compact unified geometry');
assert.ok(index.indexOf('registry-full-text-expansion.css') < index.indexOf('tailadmin-professional.css'),'TailAdmin professional must remain the final static stylesheet');
assert.ok(index.indexOf('registry-ui-release.js') < index.indexOf('registry-unified-table.js'),'unified controller must run after the release guard');
assert.doesNotMatch(index,/(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.(?:css|js)/,'competing table controllers must not be loaded');
assert.doesNotMatch(index,/registryTableFinalMobileCompatibility/,'legacy mobile compatibility patch must be removed');
assert.doesNotMatch(index,/<script src="app-performance\.js"/,'heavy registry bootstrap must remain dynamically loaded after authentication');
assert.match(release,/registry-ui-20260805-23/,'cache release must match the manual-QA contract');
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
assert.doesNotMatch(runtime,/registry-dose-dialog|registry-cell-preview-dialog/,'unified runtime must not contain a text modal');

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

assert.match(fullTextCss,/data-registry-column-key="active-substance"\] > span:first-child[\s\S]*display:block!important/,'long active-substance wrappers must be fully released');
assert.match(fullTextCss,/data-registry-column-key="dosage-adult"/,'adult dosage must be revealed with the row');
assert.match(fullTextCss,/data-registry-column-key="dosage-pediatric"/,'pediatric dosage must be revealed with the row');
assert.match(fullTextCss,/-webkit-line-clamp:unset!important/,'expanded text must never remain line-clamped');
assert.match(fullTextCss,/max-height:none!important/,'expanded text must never retain compact max-height');
assert.match(fullTextCss,/#registryContent\.table-wrap[\s\S]*overflow:auto!important/,'registry must scroll vertically and horizontally inside one surface');
assert.match(fullTextCss,/scrollbar-gutter:stable both-edges!important/,'both scrollbar rails must reserve stable space');
assert.match(fullTextCss,/touch-action:pan-x pan-y!important/,'touch users must be able to pan on both axes');
assert.match(fullTextCss,/thead th\[data-registry-column-key\][\s\S]*position:sticky!important[\s\S]*top:0!important/,'only the header row must remain visible during vertical scrolling');
assert.match(fullTextCss,/thead th\[data-registry-column-key\][\s\S]*left:auto!important[\s\S]*right:auto!important/,'sticky header must not freeze any data column horizontally');
assert.match(fullTextCss,/::-webkit-scrollbar[\s\S]*width:12px!important[\s\S]*height:12px!important/,'both native scrollbar axes must remain visible');
assert.match(fullTextCss,/data-theme="dark"[\s\S]*scrollbar-color:/,'dark mode must style the same scroll surface');
assert.doesNotMatch(fullTextCss,/https?:\/\//,'full-row text and scroll styles must not load third-party assets');

console.log('Single-controller registry table, full-row text reveal and bidirectional scroll audit passed.');
