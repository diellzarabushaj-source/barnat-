'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const index = read('index.html');
const mobile = read('registry-mobile-lite.js');
const mobileCss = read('registry-mobile-lite.css');
const desktop = read('registry-desktop-lite.js');
const css = read('registry-unified-table.css');
const fullTextCss = read('registry-full-text-expansion.css');
const runtime = read('registry-unified-table.js');
const generatedRuntime = read('app-runtime.js');
const picker = read('registry-column-picker-tailwind.js');
const loader = read('registry-runtime-loader.js');
const fast = read('registry-fast-start.js');
const release = read('registry-ui-release.js');

assert.match(index,/data-registry-ui-release="20260812-1"/,'index must use the current audited dose release');
assert.match(index,/registry-unified-table\.css\?v=20260820-registry-columns-v2/,'unified population-aware table stylesheet must be wired');
assert.match(index,/registry-full-text-expansion\.css\?v=20260805-2/,'full-row text stylesheet must be wired');
assert.match(index,/registry-unified-table\.js\?v=20260820-registry-columns-v2/,'unified population-aware table controller must be wired');
assert.match(index,/registry-mobile-lite\.js\?v=20260812-2/,'current phone lightweight registry client must be wired');
assert.match(index,/registry-mobile-lite\.css\?v=20260812-2/,'current phone lightweight registry stylesheet must be wired');
assert.match(index,/registry-desktop-lite\.js\?v=20260812-1/,'Phase 10 desktop lightweight registry client must be wired');
assert.match(index,/registry-runtime-loader\.js\?v=20260813-10/,'single-owner mobile-and-desktop-aware authenticated registry loader must be wired');
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-desktop-lite.js'),'mobile lightweight client must register before desktop lightweight startup');
assert.ok(index.indexOf('registry-desktop-lite.js') < index.indexOf('registry-runtime-loader.js'),'desktop lightweight client must register before the full registry loader');
assert.ok(index.indexOf('registry-unified-table.css') < index.indexOf('registry-full-text-expansion.css'),'full-row reveal must follow compact unified geometry');
assert.ok(index.indexOf('registry-full-text-expansion.css') < index.indexOf('tailadmin-professional.css'),'TailAdmin professional must remain the final static stylesheet');
assert.ok(index.indexOf('registry-ui-release.js') < index.indexOf('registry-unified-table.js'),'unified controller must run after the release guard');
assert.doesNotMatch(index,/(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.(?:css|js)/,'competing table controllers must not be loaded');
assert.doesNotMatch(index,/registryTableFinalMobileCompatibility/,'legacy mobile compatibility patch must be removed');
assert.doesNotMatch(index,/<script src="app-performance\.js"/,'heavy registry bootstrap must remain dynamically loaded after authentication');
assert.doesNotMatch(index,/rel="preload" href="app-runtime-performance\.js/,'full generated registry runtime must not be preloaded on normal lightweight startup');
assert.match(release,/registry-ui-20260812-1/,'cache release must match the current audited dose contract');
assert.match(fast,/releaseInteractiveShell/,'visual loader must release when authentication and shell are ready');
assert.match(fast,/loader\.style\.pointerEvents = 'none'/,'visual loader must never intercept the table after shell readiness');

assert.doesNotThrow(() => new Function(mobile),'mobile lightweight client must be valid JavaScript');
assert.doesNotThrow(() => new Function(desktop),'desktop lightweight client must be valid JavaScript');
assert.doesNotThrow(() => new Function(runtime),'unified table controller must be valid JavaScript');
assert.doesNotThrow(() => new Function(loader),'registry runtime loader must be valid JavaScript');
assert.match(mobile,/registry-mobile-lite-v2/,'mobile lightweight client must expose its current version');
assert.match(mobile,/\(max-width: 767px\)/,'mobile lightweight client must not activate on desktop');
assert.match(mobile,/DEFAULT_PAGE_SIZE = 25/,'mobile list must default to 25 records');
assert.match(mobile,/MAX_PAGE_SIZE = 50/,'mobile list must cap requests at 50 records');
assert.match(mobile,/view:'registry-page'/,'mobile list must use the lightweight registry gateway');
assert.match(mobile,/view:'registry-detail'/,'mobile detail must load one drug on demand');
assert.match(mobile,/fatal-mobile-lite-recovery/,'mobile list must keep an explicit fatal recovery path');
assert.doesNotMatch(mobile,/requestFullRegistry\('mobile-lite-error'\)|requestFullRegistry\('drug-full-detail'\)/,'ordinary mobile errors and detail actions must not replace the lightweight renderer');
assert.doesNotMatch(mobile,/MEDINDEX_REGISTRY_ROWS|medindex:registry-ready|medindex:registry-data-ready/,'lightweight mobile mode must not impersonate full registry readiness');
assert.doesNotMatch(mobile,/DRUG_DATA_PARTS|apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i,'mobile client must not contain full-registry or direct-Neon access');
assert.match(mobileCss,/@media \(max-width:767px\)/,'mobile lightweight CSS must be phone-scoped');
assert.match(mobileCss,/data-registry-unified-synthetic="true"/,'synthetic desktop cells must be hidden in lightweight phone rows');

assert.match(desktop,/registry-desktop-lite-v1/,'desktop lightweight client must expose its version');
assert.match(desktop,/\(min-width: 768px\)/,'desktop lightweight client must remain desktop-scoped');
assert.match(desktop,/DEFAULT_PAGE_SIZE = 50/,'desktop normal list must request 50 records');
assert.match(desktop,/view:'registry-page'/,'desktop normal list must use server-side pagination');
assert.match(desktop,/MEDINDEX_REGISTRY_ROWS = canonical/,'desktop lightweight page must expose only the current partial page to downstream clinical modules');
assert.match(desktop,/medindex:registry-page-ready/,'desktop lightweight page replacement must publish a targeted readiness event');
assert.match(desktop,/medindex:request-full-registry/,'advanced desktop actions must retain an explicit full-runtime handoff');
assert.doesNotMatch(desktop,/\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS|apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i,'desktop normal mode must not contain full-registry or direct-Neon access');

assert.match(loader,/registry-runtime-loader-v10/,'loader must expose the single-owner mobile-and-desktop-aware authenticated version');
assert.match(loader,/app-performance\.js\?v=20260801-2/,'loader must retain the current full registry bootstrap for explicit fatal/desktop handoff');
assert.match(loader,/classList\.contains\('auth-ready'\)/,'registry startup must wait for authentication');
assert.match(loader,/MOBILE_LITE_STALL_MS = 12000/,'slow mobile startup must stay observable without handing list ownership away');
assert.match(loader,/DESKTOP_LITE_GRACE_MS = 5000/,'desktop lightweight startup must retain a bounded fallback');
assert.match(loader,/mobile-lite-deferred/,'full runtime must be deferred while phone lightweight mode is healthy');
assert.match(loader,/mobile-lite-stalled/,'slow phone startup must remain in lightweight mode');
assert.match(loader,/medindex:mobile-lite-stalled/,'slow phone startup must publish an observable diagnostic event');
assert.match(loader,/medindex:mobile-full-registry-blocked/,'nonfatal phone requests for full runtime must be blocked');
assert.match(loader,/isExplicitMobileFullRequest/,'mobile full-runtime transition must be restricted to explicit fatal/desktop transition');
assert.doesNotMatch(loader,/MOBILE_LITE_GRACE_MS = 5000|scheduleRuntime\('mobile-lite-timeout'\)/,'the removed five-second mobile takeover must not return');
assert.match(loader,/desktop-lite-deferred/,'full runtime must be deferred while desktop lightweight mode is healthy');
assert.match(loader,/desktop-lite-timeout/,'desktop lightweight startup must retain a bounded full-runtime fallback');
assert.match(loader,/legacy-no-lite/,'unsupported environments must retain the audited legacy fallback');
assert.match(loader,/medindex:request-full-registry/,'explicit fatal/desktop lightweight transitions must still be observable');
assert.match(loader,/requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(/,'full registry startup must yield one paint before loading');
assert.doesNotMatch(loader,/scheduleRuntime\('desktop-or-legacy'\)/,'normal authenticated desktop must not eagerly load the full registry');
assert.doesNotMatch(loader,/FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/,'legacy interaction gates must remain removed');
assert.doesNotMatch(loader,/MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/,'loader must not create a circular readiness promise');

assert.match(runtime,/registry-unified-table-20260801-1/,'unified controller version is missing');
assert.match(runtime,/const FULL_ORDER = Object\.freeze/,'one canonical full-column order is required');
assert.match(runtime,/const CLINICAL_ORDER = Object\.freeze/,'one canonical clinical-column order is required');
assert.match(runtime,/'select', 'number', 'active-substance', 'trade-name'/,'Nr and active substance must precede the trade name');
assert.match(runtime,/'clinical-action', 'dose-calculator'/,'verified dose must be part of canonical clinical order');
assert.match(runtime,/DYNAMIC_KEYS = new Set\([\s\S]*'dose-calculator'/,'verified dose must be a canonical dynamic column');
assert.match(runtime,/clinical-action':54[\s\S]*'dose-calculator':128/,'edit and dose columns must remain compact');
assert.match(runtime,/dataset\.registryDoseCalculatorColumn === 'dose-calculator'/,'unified controller must recognize the dose column');
assert.match(runtime,/key === 'clinical-status' \|\| key === 'clinical-action'/,'verification/editor columns must stay out of the visible registry surface');
assert.match(runtime,/--registry-frozen-active-left/,'runtime must calculate the frozen active-substance offset');
assert.match(runtime,/let storedView = 'full'/,'the first visit must use the user-configurable full table view');
assert.match(runtime,/table\.querySelectorAll\(':scope > colgroup'\)\.forEach\(group => group\.remove\(\)\)/,'only one colgroup may survive');
assert.match(runtime,/observer\.observe\(header, \{ childList:true \}\)/,'header observer must be shallow');
assert.match(runtime,/observer\.observe\(tbody, \{ childList:true \}\)/,'body observer must watch only row replacement');
assert.doesNotMatch(runtime,/observe\(document\.body|subtree\s*:\s*true/,'unified controller must never scan the whole page or table subtree');
assert.match(runtime,/registryUnifiedIntegrity/,'runtime must expose row/header integrity');
assert.match(runtime,/MEDINDEX_REGISTRY_TABLE_AUDIT/,'runtime must expose a browser audit object');
assert.match(runtime,/normalizePencils/,'edit buttons must be normalized once by the unified controller');
assert.doesNotMatch(runtime,/registry-dose-dialog|registry-cell-preview-dialog/,'unified runtime must not contain a text modal');

const nrPosition = generatedRuntime.indexOf("key:'Nr rendor'");
const substancePosition = generatedRuntime.indexOf("key:'Substanca aktive'");
const tradePosition = generatedRuntime.indexOf("key:'Emri tregtar'");
assert.ok(nrPosition >= 0 && substancePosition > nrPosition && tradePosition > substancePosition,'generated registry order must be Nr → Substanca aktive → Emri tregtar');
assert.match(generatedRuntime,/key:'Nr rendor'[\s\S]{0,140}visible:true/,'Nr must be visible by default');
assert.match(generatedRuntime,/key:'Substanca aktive'[\s\S]{0,170}visible:true/,'active substance must be visible by default');
assert.match(generatedRuntime,/key:'Emri tregtar'[\s\S]{0,160}visible:true/,'trade name must be visible by default');
assert.match(generatedRuntime,/key:'ATC Code'[\s\S]{0,150}visible:false/,'ATC must stay opt-in');
assert.match(generatedRuntime,/key:'Klasa \/ Çka është'[\s\S]{0,170}visible:true/,'drug class must be visible by default');
assert.match(generatedRuntime,/key:'Përdorimi \(fjalë kyçe\)'[\s\S]{0,190}visible:true/,'use/keywords must be visible by default');
assert.match(generatedRuntime,/key:'Fortësia'[\s\S]{0,150}visible:true/,'strength must be visible by default');
assert.match(generatedRuntime,/key:'Forma farmaceutike'[\s\S]{0,180}visible:true/,'form must be visible by default');
assert.match(generatedRuntime,/key:'Popullata e aprovuar'[\s\S]{0,220}visible:true/,'approved population must be visible by default');
assert.match(generatedRuntime,/key:'Si të shënohet në recetë'[\s\S]{0,220}visible:true/,'prescription notation must be visible by default');
assert.match(generatedRuntime,/key:'Statusi'[\s\S]{0,160}visible:false/,'status must stay opt-in');
assert.match(generatedRuntime,/REGISTRY_COLUMN_VISIBILITY_KEY/,'user column choices must persist after explicit changes');
assert.match(picker,/optionText === 'verifikimi' \|\| optionText === 'redakto'/,'technical verification/editor columns must not be offered in the picker');

assert.match(css,/#dataTable\[data-registry-unified-table\] thead th[\s\S]*background:#fff!important/,'header must retain the base white surface');
assert.match(css,/#dataTable\[data-registry-unified-table\] :is\(th,td\)\[data-registry-column-key\][\s\S]*position:relative!important/,'base columns must begin with stable non-sticky geometry');
assert.match(css,/#dataTable\[data-registry-unified-table\] tbody tr \{[\s\S]*height:92px!important/,'rows must use compact stable geometry');
assert.match(css,/registry-row-expanded[\s\S]*max-height:none!important/,'expanded rows must reveal full inline content');
assert.match(css,/:is\(\.registry-dose-dialog,\.registry-cell-preview-dialog\)[\s\S]*display:none!important/,'legacy text modals must remain disabled');
assert.match(css,/\.clinical-editor-open \{[\s\S]*width:34px!important/,'edit action must be one compact pencil');
assert.match(css,/\.population-verification-grid/,'strict population verification styles may remain available for editor/internal surfaces');
assert.match(css,/@media \(max-width:760px\)[\s\S]*#dataTable tbody td\[data-registry-column-key\][\s\S]*grid-template-columns:94px minmax\(0,1fr\)/,'full-runtime mobile cards must remain readable after explicit fatal handoff');
assert.match(css,/#registryFilterPanel #search/,'search must remain visible in the unified full-runtime filter surface');
assert.match(css,/\.col-panel\.open[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'desktop multi-column picker must remain compact');
assert.match(css,/registry-frozen-columns-v2/,'the frozen-column contract must be explicit and auditable');
assert.match(css,/\[data-registry-column-key="number"\][\s\S]{0,180}position:sticky!important[\s\S]{0,120}left:0!important/,'Nr must be frozen at the left edge on desktop');
// A doctor reads a row by what goes on the prescription, so that is the column
// that stays put while the rest of the register scrolls sideways. This used to
// pin the active substance; registry-frozen-columns.css and the first-page
// audit had already moved to the prescription notation, and the two halves
// disagreed until now.
assert.match(css,/\[data-registry-column-key="prescription-label"\][\s\S]{0,220}position:sticky!important[\s\S]{0,140}left:var\(--registry-frozen-prescription-left,68px\)!important/,'the prescription notation must freeze immediately after Nr');
assert.doesNotMatch(css,/\[data-registry-column-key="active-substance"\]\s*\{[^}]*position:sticky!important/,'the active substance scrolls with the rest of the register');
assert.doesNotMatch(css,/\[data-registry-column-key="trade-name"\]\s*\{[^}]*position:sticky!important/,'trade name must never be frozen');
assert.doesNotMatch(css,/https?:\/\//,'unified table styles must not load third-party assets');

assert.match(fullTextCss,/data-registry-column-key="active-substance"\] > span:first-child[\s\S]*display:block!important/,'long active-substance wrappers must be fully released');
assert.match(fullTextCss,/data-registry-column-key="dosage-adult"/,'adult dosage must be revealed with the row');
assert.match(fullTextCss,/data-registry-column-key="dosage-pediatric"/,'pediatric dosage must be revealed with the row');
assert.match(fullTextCss,/-webkit-line-clamp:unset!important/,'expanded text must never remain line-clamped');
assert.match(fullTextCss,/max-height:none!important/,'expanded text must never retain compact max-height');
assert.match(fullTextCss,/#registryContent\.table-wrap[\s\S]*overflow:auto!important/,'registry must scroll vertically and horizontally inside one surface');
assert.match(fullTextCss,/scrollbar-gutter:stable both-edges!important/,'both scrollbar rails must reserve stable space');
assert.match(fullTextCss,/touch-action:pan-x pan-y!important/,'touch users must be able to pan on both axes');
assert.match(fullTextCss,/thead th\[data-registry-column-key\][\s\S]*position:sticky!important[\s\S]*top:0!important/,'the header row must remain visible during vertical scrolling');
assert.match(fullTextCss,/thead th\[data-registry-column-key\][\s\S]*left:auto!important[\s\S]*right:auto!important/,'the base sticky-header stylesheet must not horizontally freeze arbitrary columns');
assert.match(fullTextCss,/::-webkit-scrollbar[\s\S]*width:12px!important[\s\S]*height:12px!important/,'both native scrollbar axes must remain visible');
assert.match(fullTextCss,/data-theme="dark"[\s\S]*scrollbar-color:/,'dark mode must style the same scroll surface');
assert.doesNotMatch(fullTextCss,/https?:\/\//,'full-row text and scroll styles must not load third-party assets');

console.log('Single-controller registry table, requested 11-column defaults, persistent user choices, hidden technical verification columns, frozen Nr + active substance, mobile lightweight v2 and full-row reveal audit passed.');
