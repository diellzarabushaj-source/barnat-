const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const shell = read('tailadmin-shell.js');
const sidebar = read('atc-sidebar.js');
const styles = read('atc-sidebar.css');

assert.match(shell, /ATC_NAV_SRC = '\/atc-sidebar\.js\?v=atc-sidebar-v1'/, 'TailAdmin must load the ATC navigation runtime');
assert.match(shell, /loadRuntime\(ATC_NAV_SRC, 'data-medindex-atc-sidebar'/, 'ATC navigation must load only after the existing shell is ready');
assert.match(shell, /warm\(ATC_NAV_SRC\)/, 'ATC navigation must participate in runtime warming/offline discovery');

assert.match(sidebar, /querySelector\('\[data-medical-nav="classification"\]'\)/, 'The existing Classification item must be enhanced, not duplicated');
assert.match(sidebar, /existing\.replaceWith\(menu\)/, 'The original Classification link must become one nested menu');
assert.match(sidebar, /data-mi-atc-root-trigger/, 'The Classification root trigger is missing');
assert.match(sidebar, /aria-controls="\$\{ROOT_PANEL_ID\}"/, 'The root trigger must control a named submenu');
assert.match(sidebar, /aria-expanded/, 'Expandable items must expose their state');
assert.match(sidebar, /setGroupOpen\(code, open\)/, 'Group toggling is missing');
assert.match(sidebar, /document\.querySelectorAll\('\[data-mi-atc-group\]'\)/, 'Opening one group must update every group and close the others');
assert.match(sidebar, /registryUrl\(\{ atc:child\.code \}\)/, 'ATC subcategories must link to the main registry table');
assert.match(sidebar, /aria-current="page"/, 'The active ATC subcategory needs aria-current');
assert.match(sidebar, /scrollIntoView/, 'The active ATC item must be brought into view');
assert.match(sidebar, /mi-sidebar-collapsed/, 'Collapsed desktop sidebar behavior is missing');
assert.match(sidebar, /MOBILE_BREAKPOINT = 1024/, 'The ATC sidebar must use the same desktop/mobile breakpoint');
assert.match(sidebar, /event\.key !== 'Escape'/, 'Keyboard Escape behavior is missing');
assert.match(sidebar, /medindex:registry-atc-state/, 'The sidebar must follow the live registry ATC state');
assert.doesNotMatch(sidebar, /createElement\(['"]aside['"]\)/, 'ATC navigation must not create a second sidebar element');
assert.doesNotMatch(sidebar, /appendChild\([^)]*miSidebar|insertAdjacentHTML\([^)]*<aside/i, 'ATC navigation must not mount another sidebar shell');

assert.match(styles, /\.mi-atc-root-panel/, 'Root submenu styles are missing');
assert.match(styles, /\.mi-atc-submenu/, 'Nested subgroup styles are missing');
assert.match(styles, /\.mi-atc-subcategory-link\.is-active/, 'Active subgroup styling is missing');
assert.match(styles, /body\.mi-sidebar-collapsed/, 'Collapsed sidebar styling is missing');
assert.match(styles, /html\[data-theme="dark"\]/, 'Dark mode styling is missing');
assert.match(styles, /@media \(max-width:1023px\)/, 'Mobile sidebar styling is missing');
assert.match(styles, /min-height:44px/, 'Mobile ATC items must satisfy touch-target sizing');
assert.match(styles, /:focus-visible/, 'Keyboard focus visibility is missing');
assert.match(styles, /prefers-reduced-motion:reduce/, 'Reduced-motion support is missing');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'atc-sidebar.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'tailadmin-shell.js')], { stdio:'pipe' });

console.log('Nested ATC sidebar navigation tests passed.');