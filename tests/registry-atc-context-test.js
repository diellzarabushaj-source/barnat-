const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const html = read('index.html');
const script = read('registry-atc-context.js');
const styles = read('registry-table-tools.css');

assert.equal((html.match(/registry-atc-context\.css/g) || []).length, 0, 'ATC context CSS must not return as a standalone layer');
assert.equal((html.match(/registry-table-tools\.css/g) || []).length, 1, 'single registry CSS authority must load exactly once');
assert.equal((html.match(/registry-atc-context\.js/g) || []).length, 1, 'ATC context controller must load exactly once');
assert.ok(
  html.indexOf('tailadmin-professional.css') < html.indexOf('registry-table-tools.css'),
  'single registry CSS authority must remain after TailAdmin professional'
);

assert.match(script, /id = 'registryAtcContext'|PANEL_ID = 'registryAtcContext'/, 'The panel needs a stable ID');
assert.match(script, /panel\.hidden = true/, 'The panel must be hidden without an ATC category');
assert.match(script, /medindex:registry-atc-state/, 'The panel must consume the registry ATC state event');
assert.match(script, /data-atc-context-browse/, 'The panel must expose an in-place category browser action');
assert.match(script, /Shiko kategoritë/, 'The visible category browser label is missing');
assert.match(script, /openCategoryNavigation/, 'The panel must open category navigation without leaving the table');
assert.match(script, /\[data-mi-sidebar-toggle\]/, 'Mobile category browsing must open the existing sidebar drawer');
assert.match(script, /\[data-mi-atc-root-trigger\]/, 'The category browser must expand the existing Classification submenu');
assert.match(script, /\[data-mi-atc-code\]/, 'The active category must be focused in the existing submenu');
assert.match(script, /target\.focus/, 'The category browser must move keyboard focus to the active category');
assert.doesNotMatch(script, /classificationUrl|\/klasifikimi(?:\.html)?/, 'The active category panel must never navigate to the removed legacy page');
assert.match(script, /registryUrlFromState/, 'Clearing ATC must preserve the remaining URL state');
assert.match(script, /atc:''/, 'The clear action must remove only the ATC filter');
assert.match(script, /page:1/, 'Clearing ATC must reset pagination');
assert.match(script, /PopStateEvent\('popstate'/, 'The clear action must update the existing registry without a duplicate renderer');
assert.match(script, /categoryTotal/, 'The panel must show the real category result count');
assert.match(script, /filteredTotal/, 'The panel must distinguish category and search result counts');
assert.doesNotMatch(script, /innerHTML\s*=\s*.*<table|createElement\(['"]table['"]\)/s, 'The ATC context must never create a second medicines table');

assert.match(styles, /\.registry-atc-context\s*\{/, 'ATC context base styles are missing');
assert.match(styles, /\.registry-atc-context\[hidden\]/, 'Hidden-state styles are missing');
assert.match(styles, /html\[data-theme="dark"\]/, 'Dark mode support is missing');
assert.match(styles, /@media \(max-width:760px\)/, 'Mobile layout is missing');
assert.match(styles, /min-height:44px/, 'Mobile actions must meet the touch-target contract');
assert.match(styles, /:focus-visible/, 'Keyboard focus styling is missing');
assert.match(styles, /prefers-reduced-motion:reduce/, 'Reduced-motion support is missing');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-atc-context.js')], { stdio:'pipe' });

console.log('Active ATC category context panel tests passed.');