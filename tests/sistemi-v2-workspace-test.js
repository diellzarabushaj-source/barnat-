'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('sistemi.html');
const css = read('sistemi-v2.css');
const js = read('sistemi-v2.js');

assert.match(html, /data-drx-app="sistemi-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /sistemi-v2\.css\?v=1/);
assert.match(html, /sistemi-v2\.js\?v=1/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);

assert.deepEqual(styles, ['/sistemi-v2.css?v=1','/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v4']);
assert.deepEqual(scripts, ['/sistemi-v2.js?v=1']);
assert.doesNotMatch(html, /tailadmin-|auth-client\.js|system-health\.js|media-library\.js|admin-entry\.js/);

['systemHealth','systemOverallState','systemRefresh','systemDrugCount','systemDosageCount','systemIcdCount','systemLabCount',
 'systemSourceList','systemIcdProbeList','systemImportRows','mediaLibraryState','mediaGallery','systemUsersPanel']
 .forEach(id => assert.match(html, new RegExp(`id="${id}"`), `Missing #${id}`));

assert.match(css, /Sistemi V2 — consolidated operational dashboard/);
assert.match(css, /#1c1e54/);
assert.match(css, /#533afd/);
assert.match(css, /\.system-health/);
assert.match(css, /\.media-gallery/);
assert.match(css, /@media\(max-width:760px\)/);

assert.match(js, /Sistemi V2 — consolidated operational runtime/);
assert.match(js, /function loadSharedSidebarTaxonomy\(\)/);
assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v3/);
assert.match(js, /async function ensureAuth\(\)/);
assert.match(js, /\/api\/neon-status/);
assert.match(js, /const ENDPOINT = '\/api\/media'/);
assert.match(js, /systemUsersPanel/);
assert.match(js, /Supabase/);
assert.doesNotThrow(() => new Function(js));

console.log('Sistemi V2 unified standalone operational workspace contract passed.');
