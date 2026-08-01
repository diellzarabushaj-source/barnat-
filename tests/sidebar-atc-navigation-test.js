const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const shell = read('tailadmin-shell.js');
const sidebar = read('atc-sidebar.js');
const styles = read('atc-sidebar.css');

assert.match(shell, /ATC_NAV_SRC = '\/atc-sidebar\.js\?v=atc-sidebar-v2'/, 'TailAdmin must load the polished ATC navigation runtime');
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
assert.match(sidebar, /href="\/index\.html" data-mi-atc-all-link/, 'All categories must link directly to the main table instead of the removed legacy page');
assert.match(sidebar, /aria-current="page"/, 'The active ATC subcategory needs aria-current');
assert.match(sidebar, /ensureActiveVisible/, 'The active ATC item must be brought into view without unnecessary jumps');
assert.match(sidebar, /SCROLL_STORAGE_KEY = 'medindex_atc_sidebar_scroll_v1'/, 'Sidebar scroll position must be preserved across category navigation');
assert.match(sidebar, /restoreSidebarScroll\(\)/, 'The saved sidebar scroll position must be restored');
assert.match(sidebar, /COUNTS_ENDPOINT = '\/api\/atc-counts'/, 'The sidebar must use the lightweight ATC counts route');
assert.match(sidebar, /data-mi-atc-category-count/, 'Subcategories must expose real count badges');
assert.match(sidebar, /data-mi-atc-group-count/, 'Groups must expose real count badges');
assert.match(sidebar, /COUNT_CACHE_TTL = 5 \* 60 \* 1000/, 'ATC counts must use a short browser cache');
assert.match(sidebar, /credentials:'same-origin'/, 'ATC count requests must preserve the private authenticated session');
assert.match(sidebar, /event\.key === 'ArrowRight'/, 'Keyboard expansion with ArrowRight is missing');
assert.match(sidebar, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/, 'Sequential keyboard navigation is missing');
assert.match(sidebar, /event\.key === 'Escape'/, 'Keyboard Escape behavior is missing');
assert.match(sidebar, /mi-sidebar-collapsed/, 'Collapsed desktop sidebar behavior is missing');
assert.match(sidebar, /MOBILE_BREAKPOINT = 1024/, 'The ATC sidebar must use the same desktop/mobile breakpoint');
assert.match(sidebar, /closeMobileSidebar\(\)/, 'Mobile drawer must close after a category selection');
assert.match(sidebar, /medindex:registry-atc-state/, 'The sidebar must follow the live registry ATC state');
assert.match(sidebar, /nested-v2/, 'The polished sidebar version marker is missing');
assert.doesNotMatch(sidebar, /createElement\(['"]aside['"]\)/, 'ATC navigation must not create a second sidebar element');
assert.doesNotMatch(sidebar, /appendChild\([^)]*miSidebar|insertAdjacentHTML\([^)]*<aside/i, 'ATC navigation must not mount another sidebar shell');

assert.match(styles, /\.mi-atc-root-panel/, 'Root submenu styles are missing');
assert.match(styles, /\.mi-atc-submenu/, 'Nested subgroup styles are missing');
assert.match(styles, /\.mi-atc-count/, 'Count badge styles are missing');
assert.match(styles, /grid-template-columns:28px minmax\(0,1fr\) auto 18px/, 'Group layout must reserve a stable count column');
assert.match(styles, /\.mi-atc-subcategory-link\.is-active/, 'Active subgroup styling is missing');
assert.match(styles, /\.mi-atc-subcategory-link\.is-active::after/, 'The active category needs a precise visual marker');
assert.match(styles, /body\.mi-sidebar-collapsed/, 'Collapsed sidebar styling is missing');
assert.match(styles, /html\[data-theme="dark"\]/, 'Dark mode styling is missing');
assert.match(styles, /@media \(max-width:1023px\)/, 'Mobile sidebar styling is missing');
assert.match(styles, /min-height:44px/, 'Mobile ATC items must satisfy touch-target sizing');
assert.match(styles, /:focus-visible/, 'Keyboard focus visibility is missing');
assert.match(styles, /prefers-reduced-motion:reduce/, 'Reduced-motion support is missing');

assert.match(styles, /contain:layout style/, 'ATC navigation must isolate layout/style work from the registry table');
assert.match(styles, /overscroll-behavior:contain/, 'Nested category scrolling must not leak into the page');
assert.match(styles, /\.mi-atc-menu:has\(\.mi-atc-group\.is-open\) \.mi-atc-group:not\(\.is-open\)/, 'Mobile focus mode must hide unrelated groups');
assert.match(styles, /content:"Kthehu te grupet"/, 'The open mobile group must expose a clear back affordance');
assert.match(styles, /position:sticky/, 'The mobile back/group header must remain visible while scrolling');
assert.match(styles, /grid-template-columns:24px minmax\(0,1fr\) auto 18px/, 'Mobile focus header geometry must remain stable');
assert.match(styles, /html\[data-theme="dark"\] \.mi-atc-menu:has/, 'Mobile focus mode needs a dark-theme contract');
assert.match(styles, /scrollbar-gutter:stable/, 'Mobile category scrolling must avoid width jumps');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'atc-sidebar.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'tailadmin-shell.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'api/drug-search.js')], { stdio:'pipe' });

console.log('Polished nested ATC sidebar navigation tests passed.');
