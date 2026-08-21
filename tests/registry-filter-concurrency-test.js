'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const desktop = read('registry-desktop-lite.js');
const patch = read('scripts/patch-phase17-desktop-filter-stability.js');
const packageJson = JSON.parse(read('package.json'));

execFileSync(process.execPath, ['--check', path.join(ROOT, 'scripts/patch-phase17-desktop-filter-stability.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-desktop-lite.js')], { stdio:'pipe' });

assert.match(desktop, /let pageRequestEpoch = 0/, 'Desktop registry must track a monotonic request epoch.');
assert.match(desktop, /const requestEpoch = \+\+pageRequestEpoch/, 'Every page/filter load must claim a new request epoch.');
assert.match(
  desktop,
  /requestEpoch !== pageRequestEpoch \|\| pageController !== controller \|\| controller\.signal\.aborted/,
  'Late or superseded responses must not be allowed to publish table state.',
);
assert.match(
  desktop,
  /if \(error\?\.name === 'AbortError' \|\| requestEpoch !== pageRequestEpoch\) return/,
  'Errors from superseded requests must stay silent and must not replace a newer table state.',
);

assert.match(desktop, /function syncDesktopSearchState\(\)/, 'Filters must share one settled search-state synchronizer.');
assert.match(desktop, /window\.clearTimeout\(searchTimer\);\s*searchTimer = 0;/, 'A filter change must cancel pending search debounce work before requesting rows.');
assert.match(desktop, /state\.q = raw\.length >= 2 \? raw : ''/, 'One-character search input must not leave a stale older query active.');

assert.match(
  desktop,
  /status\?\.addEventListener\('change',[\s\S]{0,260}syncDesktopSearchState\(\)[\s\S]{0,260}includeTotal:state\.q\.length === 0/,
  'Status filtering must coalesce with pending search and avoid exact count work for combined search.',
);
assert.match(
  desktop,
  /state\.pageSize = [\s\S]{0,300}includeTotal:state\.q\.length === 0/,
  'Page-size changes must retain the settled search and avoid count work while searching.',
);
assert.match(
  desktop,
  /if \(state\.formType === nextType && state\.formValue === nextValue\) return/,
  'Repeated selection of the active pharmaceutical-form filter must be a no-op.',
);
assert.match(
  desktop,
  /selectDesktopForm\(type, value\)[\s\S]{0,520}syncDesktopSearchState\(\)[\s\S]{0,520}includeTotal:state\.q\.length === 0/,
  'Form filtering must coalesce with pending search and skip exact counts for combined search.',
);

assert.match(patch, /Phase 17 desktop table stability passed/);
assert.match(
  packageJson.scripts['build:runtime'],
  /patch-phase17-desktop-filter-stability\.js/,
  'The final stability patch must run on every production build.',
);
assert.match(
  packageJson.scripts.test,
  /registry-filter-concurrency-test\.js/,
  'The filter concurrency regression gate must run in the main suite.',
);

console.log('Registry filter concurrency audit passed: newest request owns state, pending search coalesces with filters, and no-op form selections do not refetch.');
