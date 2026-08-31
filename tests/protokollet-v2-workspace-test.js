'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('protokollet.html');
const css = read('protokollet-v2.css');
const js = read('protokollet-v2.js');
const manifest = JSON.parse(read('data/protocols.json'));
const worker = read('sw.js');

assert.match(html, /data-drx-app="protokollet-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /protokollet-v2\.css\?v=1/);
assert.match(html, /protokollet-v2\.js\?v=1/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v5/);
assert.match(html, /id="protocolDirectory"/);
assert.match(html, /id="protocolReader"/);
assert.match(html, /id="protocolSearch"/);
assert.match(html, /id="protocolCategory"/);
assert.match(html, /id="protocolType"/);
assert.match(html, /id="protocolArchive"/);
assert.match(html, /id="protocolTotalCount"/);
assert.match(html, /id="protocolCategoryCount"/);
assert.match(html, /id="protocolCurrentCount"/);
assert.match(html, /id="protocolVisibleCount"/);
assert.match(html, /class="nav-item is-active" href="\/protokollet\.html" aria-current="page"/);

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);

assert.equal(styles.length, 2, 'Protokollet V2 must load only page CSS + canonical Stripe shell');
assert.ok(styles[0].includes('protokollet-v2.css?v=1'));
assert.ok(styles[1].includes('drx-dashboard-stripe.css?v=drx-dashboard-stripe-v5'));
assert.equal(scripts.length, 1, 'Protokollet V2 must own one bundled runtime');
assert.ok(scripts[0].includes('protokollet-v2.js?v=1'));

assert.doesNotMatch(html, /tailadmin-|auth-client\.js|medical-hub\.css|clinical-reference\.css|protocol-reader\.css|protocol-interactive\.css|protocol-workspace\.css|protokollet\.js/);

assert.match(css, /Protokollet V2 — consolidated clinical protocol workspace/);
assert.match(css, /Protokollet V2 — unified Stripe clinical library/);
assert.match(css, /\.protocol-metrics/);
assert.match(css, /\.protocol-toolbar-card/);
assert.match(css, /\.protocol-row-number/);
assert.match(css, /\.protocol-reader-layout/);
assert.match(css, /\.protocol-primary-care/);
assert.match(css, /\.protocol-audit-workspace/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

assert.match(js, /Protokollet V2 — consolidated runtime/);
assert.match(js, /window\.DRxProtocolShell/);
assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v3/);
assert.match(js, /medindex-brand-runtime\.js\?v=drx-brand-v5/);
assert.match(js, /async function ensureAuth\(\)/);
assert.match(js, /credentials:'same-origin'/);
assert.match(js, /fetch\('\/data\/protocols\.json'/);
assert.match(js, /fetch\('\/data\/protocol-elaborations\.json'/);
assert.match(js, /class="protocol-row-number"/);
assert.match(js, />Hap protokollin</);
assert.match(js, /protocolVisibleCount/);
assert.match(js, /protocolCurrentCount/);
assert.match(js, /Burime zyrtare/);
assert.match(js, /medindexPrescriptionProtocolDraft/);
assert.match(js, /Vazhdo te Recetat/);
assert.match(js, /sessionStorage\.setItem\(TRANSFER_KEY/);
assert.match(js, /recetat\.html\?from=protocol/);
assert.doesNotThrow(() => new Function(js));

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.categories.length, 12);
assert.equal(manifest.documents.length, 55);
assert.ok(manifest.documents.every(item => item.id && item.title && ['pdf','docx','html','txt'].includes(String(item.type).toLowerCase())));
assert.ok(manifest.documents.every(item => /^https:\/\/msh\.rks-gov\.net\/Documents\/DownloadDocument/.test(item.officialUrl || '')));

assert.match(worker, /\/protokollet-v2\.css/);
assert.match(worker, /\/protokollet-v2\.js/);
assert.doesNotMatch(worker, /['"]\/protokollet\.js['"]/);

console.log('Protokollet V2 unified Stripe workspace contract passed.');
