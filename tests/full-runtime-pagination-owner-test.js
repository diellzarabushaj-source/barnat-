'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'app-parts', 'part-04.txt'), 'utf8');
const chain = fs.readFileSync(path.join(ROOT, 'scripts', 'patch-phase1-mobile-owner-prebuild.js'), 'utf8');
const patch = fs.readFileSync(path.join(ROOT, 'scripts', 'patch-full-runtime-pagination-owner.js'), 'utf8');

assert.match(chain, /require\('\.\/patch-registry-pagination-v3\.js'\);[\s\S]*?require\('\.\/patch-full-runtime-pagination-owner\.js'\);/,
  'Full-runtime busy reset must run after pagination v3 materializes its canonical render function.');
assert.match(patch, /full-runtime-pagination-busy-reset-v1/,
  'The full-runtime pagination owner patch must carry a stable release marker.');
assert.match(patch, /pag\.classList\.remove\('is-loading'\)/,
  'Full-runtime pagination must clear inherited lightweight loading state.');
assert.match(patch, /pag\.removeAttribute\('aria-busy'\)/,
  'Full-runtime pagination must clear stale busy accessibility state.');
assert.match(patch, /dataTable'\)\?\.setAttribute\('aria-busy', 'false'\)/,
  'The canonical table must be announced idle when full runtime takes synchronous local pagination ownership.');
assert.match(source, /function renderPagination\(totalPages, totalItems = null\)/,
  'The canonical full-runtime pagination v3 render contract must remain available for the prebuild patch.');

console.log('✓ Full-runtime pagination owner contract passed: v3 local pagination clears inherited lite busy state before interaction.');
