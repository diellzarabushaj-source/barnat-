const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const mobile = read('mobile-experience.js');
const cellPreview = read('registry-cell-preview.js');
const columnPicker = read('registry-column-picker-tailwind.js');
const columnPickerCss = read('registry-column-picker-tailwind.css');
const index = read('index.html');
const shell = read('tailadmin-shell.js');
const workflow = read('.github/workflows/physician-browser-audit.yml');
const browserSpec = read('tests/mobile-deep-audit.spec.js');
const registryMobile = read('registry-mobile-critical.css');
const rowExpand = read('registry-row-expand.js');
const doseButtonCss = read('registry-dose-table-button.css');
const drugNameHardening = read('registry-drug-name-hardening.js');
const nameDisplay = read('name-display.js');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'mobile-experience.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-cell-preview.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-column-picker-tailwind.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-row-expand.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-drug-name-hardening.js')], { stdio:'pipe' });

[
  /production-audit-v2/,
  /safe-area-inset-top/,
  /safe-area-inset-bottom/,
  /--mi-touch-target:44px/,
  /visualViewport/,
  /--mi-visual-height/,
  /data-mi-mobile-search/,
  /aria-label', 'Kërko në MedIndex'/,
  /aria-label', 'Recetë e re'/,
  /mi-mobile-search-open/,
  /workspace\.inert = sidebarOpen/,
  /main\.inert = searchOpen/,
  /orientationchange/,
  /max-height:500px/,
  /width:min\(var\(--mi-sidebar-width\),calc\(100vw - 44px\)\)/,
  /\.mi-topbar-actions\{[\s\S]*display:flex!important/,
  /\.mi-mobile-search-trigger\{[\s\S]*visibility:visible!important/,
  /syncTriggerVisibility/,
  /miMobileSearchBound/,
  /subtree: false/,
  /function mountMobileSearchSurface\(input\)/,
  /document\.body\.appendChild\(surface\)/,
  /input\.style\.setProperty\('display', 'block', 'important'\)/,
  /function restoreMobileSearchSurface\(\)/,
  /miCompactLandscape/,
  /mobileBrand\.style\.setProperty\('display', 'none', 'important'\)/,
].forEach(pattern => assert.match(mobile, pattern, `mobile-experience.js missing ${pattern}`));

assert.doesNotMatch(mobile, /fetch\(|\/api\//, 'mobile experience runtime must not touch backend APIs or the network');
assert.doesNotMatch(mobile, /bodyObserver\.observe\([^;]+subtree:\s*true/, 'mobile observer must not recursively observe its own descendant class writes');
assert.equal(fs.existsSync(path.join(ROOT, '.github/workflows/fix-mobile-observer.yml')), false, 'temporary mobile observer workflow must be removed');
assert.equal(fs.existsSync(path.join(ROOT, '.github/workflows/cancel-stale-browser-audits.yml')), false, 'temporary browser cancellation workflow must be removed');
assert.equal(fs.existsSync(path.join(ROOT, '.github/workflows/fix-mobile-search-surface.yml')), false, 'temporary mobile search patch workflow must be removed');
assert.equal(fs.existsSync(path.join(ROOT, '.github/workflows/fix-landscape-brand.yml')), false, 'temporary landscape patch workflow must be removed');
assert.equal(fs.existsSync(path.join(ROOT, '.github/workflows/finalize-column-picker-viewport.yml')), false, 'temporary column picker viewport workflow must be removed');
assert.equal(fs.existsSync(path.join(ROOT, '.github/workflows/harden-column-picker-clamp.yml')), false, 'temporary column picker clamp workflow must be removed');
assert.match(shell, /MOBILE_SRC = '\/mobile-experience\.js\?v=production-audit-v2'/, 'shell must load the audited mobile runtime');
assert.match(shell, /loadMobileExperience\(\)/, 'mobile runtime loader is missing');
assert.match(
  shell,
  /const assets = \[[\s\S]*MOBILE_SRC[\s\S]*\];/,
  'mobile runtime must remain in the shared warm asset set for offline reuse',
);
assert.match(
  shell,
  /Promise\.all\(assets\.map\(warm\)\)/,
  'shared runtime warmer must fetch the bounded asset set for offline reuse',
);
assert.match(
  shell,
  /if \(!isMobileLayout\(\)\) assets\.push\(ATC_NAV_SRC, ATC_SEARCH_SRC\)/,
  'phone startup must defer ATC enhancement bundles until user intent',
);

/* Long dosage text is often rendered inside a semantic button; preserve that text while cloning. */
assert.match(cellPreview, /input,select,textarea,\.drug-actions-trigger/, 'cell preview must keep semantic dosage button text');
assert.doesNotMatch(cellPreview, /input,select,textarea,button,\.drug-actions-trigger/, 'cell preview must not delete dosage button content');
assert.match(cellPreview, /\['dosage-adult', 'dosage-pediatric'\]\.includes\(key\)/, 'adult and pediatric dosage cells must remain previewable');

/* The Tailwind-style column picker must size itself and clamp to every viewport. */
assert.match(columnPicker, /column-picker-tailwind-20260820-clean-columns-2/);
assert.match(columnPicker, /function resetPanelPosition\(root\)/);
assert.match(columnPicker, /function keepPanelInsideViewport\(root\)/);
assert.match(columnPicker, /setProperty\('left',[\s\S]*'important'\)/);
assert.match(columnPicker, /setProperty\('right',[\s\S]*'important'\)/);
assert.match(columnPicker, /optionText === 'verifikimi' \|\| optionText === 'redakto'/, 'technical verification/editor columns must stay out of the user picker');
assert.match(columnPickerCss, /#colPanel\.col-panel \*/);
assert.match(columnPickerCss, /box-sizing: border-box/);
assert.match(columnPickerCss, /position: fixed !important/);
assert.match(columnPickerCss, /grid-template-columns: 1fr !important/);
assert.match(index, /registry-column-picker-tailwind\.css\?v=20260805-3/);
assert.match(index, /registry-column-picker-tailwind\.js\?v=20260820-registry-columns-v2/);

/* Mobile drug cards must expose both details and the verified calculator. */
assert.match(index, /registry-mobile-critical\.css\?v=20260810-1/);
assert.match(index, /registry-row-expand\.js\?v=20260810-1/);
assert.match(index, /registry-dose-table-button\.css\?v=20260810-1/);
assert.match(index, /registry-drug-name-hardening\.js\?v=20260810-1/);
assert.doesNotMatch(index, /ui-enhancements\.js/, 'Obsolete registry UI enhancement layer must not return to production');
assert.match(rowExpand, /registry-row-details-toggle/);
assert.match(rowExpand, /button\.setAttribute\('aria-expanded', String\(expanded\)\)/);
assert.match(rowExpand, /const detailsButton = event\.target\.closest/);
assert.match(rowExpand, /button\.dataset\.registryUiOnly = 'true'/);
assert.match(drugNameHardening, /rawKey\.slice\(firstSeparator \+ 1, lastSeparator\)/,
  'Drug names must be derived from immutable registry keys, never appended controls.');
assert.match(drugNameHardening, /\[data-registry-ui-only\]/);
assert.match(drugNameHardening, /row\.dataset\.drugName = canonicalName/);
assert.match(nameDisplay, /\[data-registry-ui-only\]/);
assert.match(registryMobile, /#dataTable\[data-registry-unified-table\] tbody tr\{[\s\S]*height:auto!important/);
assert.match(registryMobile, /content-visibility:auto/);
assert.match(registryMobile, /data-registry-column-key="dose-calculator"/);
assert.match(registryMobile, /\.registry-row-details-toggle\{[\s\S]*min-height:44px/);
assert.match(registryMobile, /width:100%!important;[\s\S]*justify-self:stretch/);
assert.match(doseButtonCss, /dose-calculator-open::after \{ content: "Kalkulo"; \}/);

assert.match(workflow, /mobile-deep-audit\.spec\.js/, 'browser workflow must execute the mobile audit');
assert.match(workflow, /column-picker-tailwind\.spec\.js/, 'browser workflow must execute the column picker audit');
[
  /viewport:PHONE/,
  /viewport:TABLET/,
  /hasTouch:true/,
  /expectNoDocumentOverflow/,
  /expectTouchTarget/,
  /mi-sidebar-open/,
  /mi-mobile-search-open/,
  /setViewportSize\(\{ width:844, height:390 \}\)/,
  /setViewportSize\(\{ width:1180, height:820 \}\)/,
  /context\.setOffline\(true\)/,
].forEach(pattern => assert.match(browserSpec, pattern, `mobile browser audit missing ${pattern}`));

console.log('Mobile, tablet, touch, safe-area, shared warm-set, immutable drug-name, clean Tailwind population column picker, dosage preview and orientation audit passed.');
