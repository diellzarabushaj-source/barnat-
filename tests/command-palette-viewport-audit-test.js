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
console.log('Command palette viewport audit passed.');
