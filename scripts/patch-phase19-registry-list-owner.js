'use strict';

/* Phase 19 — registry list single-owner contract.
 *
 * The bug this closes is a lifecycle race: List mode asks the desktop-lite
 * owner for the full dataset, the full registry runtime wakes up, and its
 * unified-table toolbar can be inserted while List is already the active
 * surface. The data handoff is valid; the second visible UI owner is not.
 *
 * This patch installs two deliberately small assets:
 *   1) a head-loaded CSS fail-safe, so a late toolbar cannot flash visibly;
 *   2) a runtime ownership guard, so hidden/ARIA/inert state follows the view.
 *
 * The shared search/filter panel is intentionally not hidden. Both Table and
 * List use the same search input, and removing it would regress List search.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const CSS_FILE = path.join(ROOT, 'registry-list-owner-guard.css');
const JS_FILE = path.join(ROOT, 'registry-list-owner-guard.js');
const VERSION = 'list-owner-v1';

const CSS_TAG = `<link rel="stylesheet" href="registry-list-owner-guard.css?v=${VERSION}" data-registry-list-owner-guard-css>`;
const JS_TAG = `<script src="registry-list-owner-guard.js?v=${VERSION}" defer data-registry-list-owner-guard></script>`;

for (const file of [INDEX, CSS_FILE, JS_FILE]) {
  if (!fs.existsSync(file)) throw new Error(`Registry list owner: mungon ${path.basename(file)}.`);
}

let html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');

// Idempotent: remove any prior guard tag/version before inserting the canonical
// pair. This prevents duplicate execution after repeated build:runtime runs.
html = html
  .replace(/^.*data-registry-list-owner-guard-css.*\n?/gm, '')
  .replace(/^.*data-registry-list-owner-guard(?:>|\s).*\n?/gm, '');

const cssAnchor = html.match(/^.*registry-list-view\.css[^\n]*\n/m);
if (!cssAnchor) throw new Error('Registry list owner: nuk u gjet registry-list-view.css në index.html.');
html = html.replace(cssAnchor[0], `${cssAnchor[0]}${CSS_TAG}\n`);

const jsAnchor = html.match(/^.*registry-list-view\.js[^\n]*\n/m);
if (!jsAnchor) throw new Error('Registry list owner: nuk u gjet registry-list-view.js në index.html.');
html = html.replace(jsAnchor[0], `${jsAnchor[0]}${JS_TAG}\n`);

fs.writeFileSync(INDEX, html, 'utf8');

// Build-time contract audit. A malformed or accidentally broadened guard must
// fail the build rather than ship a layout that only fails under a race.
const written = fs.readFileSync(INDEX, 'utf8');
const css = fs.readFileSync(CSS_FILE, 'utf8');
const js = fs.readFileSync(JS_FILE, 'utf8');

const count = (source, needle) => source.split(needle).length - 1;
if (count(written, 'data-registry-list-owner-guard-css') !== 1) {
  throw new Error('Registry list owner: CSS guard duhet të ngarkohet saktësisht një herë.');
}
if (count(written, 'data-registry-list-owner-guard></script>') !== 1) {
  throw new Error('Registry list owner: JS guard duhet të ngarkohet saktësisht një herë.');
}
if (written.indexOf('registry-list-owner-guard.css') > written.indexOf('</head>')) {
  throw new Error('Registry list owner: CSS guard duhet të jetë në <head>.');
}
if (written.indexOf('registry-list-owner-guard.js') < written.indexOf('registry-list-view.js')) {
  throw new Error('Registry list owner: runtime guard duhet të vijë pas list-view runtime.');
}
if (!/data-mi-registry-view="list"[\s\S]*#registryViewToolbar/.test(css)
    || !/display:\s*none\s*!important/.test(css)) {
  throw new Error('Registry list owner: CSS nuk garanton fshehjen e table toolbar në List mode.');
}
if (/#registryFilterPanel[\s\S]{0,160}display:\s*none\s*!important/.test(css)) {
  throw new Error('Registry list owner: shared search/filter panel nuk guxon të fshihet.');
}
if (!js.includes("attributeFilter:['data-mi-registry-view']")
    || !js.includes("document.getElementById('registryViewToolbar')")
    || !js.includes("ROOT.dataset.registrySurfaceOwner")) {
  throw new Error('Registry list owner: runtime ownership contract është i paplotë.');
}

console.log('Registry list owner Phase 1: CSS fail-safe + runtime ownership guard u instaluan dhe u audituan.');
