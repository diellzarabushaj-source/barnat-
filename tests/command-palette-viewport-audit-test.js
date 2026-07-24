const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../clinical-workflow.js'), 'utf8');
assert.match(source, /\.mi-command-palette\{position:fixed/, 'Command palette must escape topbar/workspace clipping');
assert.match(source, /getBoundingClientRect\(\)/, 'Command palette must anchor to the visible search input');
assert.match(source, /--mi-command-left/, 'Command palette left position must be explicit');
assert.match(source, /--mi-command-top/, 'Command palette top position must be explicit');
assert.match(source, /--mi-command-width/, 'Command palette width must be constrained');
assert.match(source, /window\.addEventListener\('resize', positionPalette/, 'Command palette must reposition on resize');
assert.match(source, /addEventListener\('scroll', positionPalette/, 'Command palette must reposition on content scroll');
assert.match(source, /positionPalette\(\);[\s\S]*aria-expanded/, 'Palette must be positioned whenever it opens');
console.log('Command palette viewport audit passed.');
