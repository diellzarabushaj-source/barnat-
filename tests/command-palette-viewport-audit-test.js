const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../tailadmin-professional.js'), 'utf8');
assert.match(source, /\.mi-command-palette\{[\s\S]*position:fixed!important/, 'Command palette must escape topbar/workspace clipping');
assert.match(source, /getBoundingClientRect\(\)/, 'Command palette must anchor to the visible search input');
assert.match(source, /--mi-command-left/, 'Command palette left position must be explicit');
assert.match(source, /--mi-command-top/, 'Command palette top position must be explicit');
assert.match(source, /--mi-command-width/, 'Command palette width must be constrained');
assert.match(source, /document\.body\.appendChild\(palette\)/, 'Command palette must be portaled outside the clipped workspace');
assert.match(source, /miPortalBound/, 'Command palette portal listeners must be idempotent');
assert.match(source, /window\.addEventListener\('resize', schedulePalettePosition/, 'Command palette must reposition on resize');
assert.match(source, /document\.addEventListener\('scroll', schedulePalettePosition/, 'Command palette must reposition on scrolling containers');
assert.match(source, /MutationObserver\(schedulePalettePosition\)/, 'Command palette must reposition when opened or rerendered');
assert.match(source, /medindex:clinical-workflow-ready/, 'Professional shell must bind after the clinical workflow creates the palette');
assert.match(source, /bindCommandPaletteViewport\(\)/, 'Palette viewport guard must be activated during stabilization');

assert.match(source, /#rxDrugPopover\[data-mi-viewport-picker/, 'Prescription drug picker must have viewport-owned styling');
assert.match(source, /position:fixed!important;[\s\S]*width:min\(640px/, 'Prescription drug picker must be fixed and width-constrained');
assert.match(source, /document\.body\.appendChild\(picker\)/, 'Prescription drug picker must be portaled outside the composer');
assert.match(source, /aria-modal/, 'Prescription drug picker must expose modal semantics while open');
assert.match(source, /closePrescriptionDrugPicker/, 'Prescription drug picker must support an explicit close path');
assert.match(source, /event\.key !== 'Escape'/, 'Prescription drug picker must close with Escape');
assert.match(source, /rxDrugSearch/, 'Prescription drug picker must return focus to its search field when opened');

assert.match(source, /\.mi-main\{scroll-behavior:auto!important;overflow-anchor:none!important\}/, 'Clinical content must use deterministic scrolling');
assert.match(source, /function normalizeContentScroll/, 'Clinical content scroll normalization is missing');
assert.match(source, /performance\.getEntriesByType\?\.\('navigation'\)/, 'Back/forward navigation must be distinguished');
assert.match(source, /main\.scrollTop = 0/, 'New section navigation must begin at the top');
assert.match(source, /\[data-open-code\]\{scroll-margin-block:96px\}/, 'ICD actions need a safe scroll margin');
console.log('Clinical command surfaces and content scrolling audit passed.');
