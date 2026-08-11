'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Final browser patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchDrawerInert() {
  let source = read('tailadmin-shell-core.js');
  source = replaceOnce(
    source,
    "    const sidebar = app.querySelector('#miSidebar');\n    const sidebarScroll = app.querySelector('.mi-sidebar-scroll');",
    "    const sidebar = app.querySelector('#miSidebar');\n    const workspace = app.querySelector('.mi-workspace');\n    const sidebarScroll = app.querySelector('.mi-sidebar-scroll');",
    'workspace lookup',
  );
  source = replaceOnce(
    source,
    "    const setMobileOpen = (open, returnFocus = false) => {\n      body.classList.toggle('mi-sidebar-open', Boolean(open));\n      updateSidebarA11y();",
    "    const setMobileOpen = (open, returnFocus = false) => {\n      const nextOpen = Boolean(open);\n      body.classList.toggle('mi-sidebar-open', nextOpen);\n      if (workspace) workspace.inert = nextOpen;\n      updateSidebarA11y();",
    'mobile inert toggle',
  );
  if (!source.includes('workspace.inert = nextOpen')) throw new Error('Mobile drawer inert contract missing.');
  write('tailadmin-shell-core.js', source);
}

function patchNoFrozenHeader() {
  let source = read('registry-full-text-expansion.css');
  source = source.replace(
    /(#registryContent #dataTable\[data-registry-unified-table\] thead th\[data-registry-column-key\] \{\n)  position:sticky!important;\n  top:0!important;/,
    '$1  position:relative!important;\n  top:auto!important;',
  );
  if (!source.includes('position:relative!important;\n  top:auto!important;')) {
    throw new Error('No-frozen-header contract missing.');
  }
  write('registry-full-text-expansion.css', source);
}

patchDrawerInert();
patchNoFrozenHeader();
console.log('Final browser audit patch passed: drawer inert and no-frozen-header contracts are active.');
