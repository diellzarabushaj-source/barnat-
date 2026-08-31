'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const stripe = read('drx-dashboard-stripe.css');
const design = read('.superdesign/design-system.md');
const shellCore = read('tailadmin-shell-core.js');

const standalone = ['index.html','klasifikimi.html','icd.html','dozologjia.html','urgjencat.html','analizat.html','protokollet.html','recetat.html','medical-hub.html','sistemi.html'];
const tailadmin = [];
const allPages = [...standalone, ...tailadmin];

assert.match(stripe, /DRx canonical sidebar shell v5/);
assert.match(stripe, /DRx clinical workspace system v6 — Urgjencat reference/);
assert.match(stripe, /--drx-type-page-title:32px/);
assert.match(stripe, /--drx-type-subtitle:14px/);
assert.match(stripe, /html\.drx-unified-sidebar \.page-heading h1\{[\s\S]*font-size:var\(--drx-type-page-title\)!important/);
assert.match(stripe, /--drx-nav:#1c1e54/);
assert.match(stripe, /--drx-nav-active:rgba\(83,58,253,\.20\)/);
assert.match(stripe, /--drx-shell-accent:#533afd/);
assert.match(stripe, /--drx-shell-sidebar-width:238px/);
assert.match(stripe, /--drx-shell-topbar-height:58px/);
assert.match(stripe, /--drx-shell-content-max:1360px/);
assert.match(stripe, /--drx-shell-page-x:36px/);
assert.match(stripe, /DRx canonical sidebar shell v5/);
assert.match(stripe, /html\.drx-unified-sidebar \.sidebar\{[\s\S]*position:fixed!important[\s\S]*display:flex!important[\s\S]*flex-direction:column!important/);
assert.match(stripe, /html\.drx-unified-sidebar \.nav-stack\{[\s\S]*flex:1 1 auto!important[\s\S]*overflow-y:auto!important/);
assert.match(stripe, /html\.drx-unified-sidebar \.nav-item\{[\s\S]*display:flex!important[\s\S]*text-decoration:none!important/);
assert.match(stripe, /html\.drx-unified-sidebar \.nav-icon \.icon,[\s\S]*width:var\(--drx-shell-nav-icon-glyph\)!important/);
assert.match(stripe, /html\.drx-unified-sidebar \.sidebar-foot\{[\s\S]*flex:0 0 auto!important/);
assert.match(stripe, /html\.drx-unified-sidebar \.main-shell\{[\s\S]*margin-left:var\(--drx-shell-sidebar-width\)!important/);
assert.match(stripe, /html\.drx-unified-sidebar \.icon-button\.menu-button,[\s\S]*display:none!important/);
assert.match(stripe, /@media\(max-width:1023px\)[\s\S]*html\.drx-unified-sidebar \.sidebar\.is-open\{transform:translateX\(0\)!important\}/);
assert.match(stripe, /html\.medindex-tailadmin \.mi-sidebar,[\s\S]*html\.drx-unified-sidebar \.sidebar/);
assert.match(stripe, /html\.medindex-tailadmin \.mi-topbar,[\s\S]*html\.drx-unified-sidebar \.topbar/);
assert.match(stripe, /html\.medindex-tailadmin \.mi-content-container,[\s\S]*html\.drx-unified-sidebar \.page-wrap/);

assert.match(design, /Canonical authenticated dashboard override/);
assert.match(design, /Sidebar: \*\*238px\*\*/);
assert.match(design, /Top bar: \*\*58px\*\*/);
assert.match(design, /drx-horizontal-on-dark\.svg/);
assert.match(design, /No page may introduce a second sidebar/);

assert.match(shellCore, /\/brand\/drx-horizontal-on-dark\.svg/);

for (const file of allPages) {
  const html = read(file);
  const stripeLinks = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']*drx-dashboard-stripe\.css[^"']*)["'])[^>]*>/gi)]
    .map(match => match[1]);

  assert.equal(stripeLinks.length, 1, `${file}: exactly one canonical dashboard shell stylesheet is required`);
  assert.match(stripeLinks[0], /drx-dashboard-stripe-v6/, `${file}: shell cache version must be v6`);
  assert.match(html, /<meta name="theme-color" content="#1c1e54">/, `${file}: browser chrome must match the navy shell`);
}

function normalizedStandaloneSidebar(html) {
  const start = html.indexOf('<aside class="sidebar"');
  const end = html.indexOf('</aside>', start);
  assert.ok(start >= 0 && end > start, 'Canonical standalone sidebar markup is missing');
  return html.slice(start, end + 8)
    .replace(/ class="nav-item is-active"/g, ' class="nav-item"')
    .replace(/ aria-current="page"/g, '')
    .replace(/(<details class="nav-group" id="atcNavGroup") open/g, '$1')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

const canonicalStandaloneSidebar = normalizedStandaloneSidebar(read('index.html'));

for (const file of standalone) {
  const html = read(file);
  assert.match(html, /drx-unified-sidebar/, `${file}: standalone page must opt into canonical sidebar shell`);
  assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/, `${file}: dark sidebar must use the white horizontal DRx logo`);
  assert.equal(
    normalizedStandaloneSidebar(html),
    canonicalStandaloneSidebar,
    `${file}: standalone sidebar must stay structurally identical to the canonical Registry sidebar`,
  );

  const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
    .map(match => match[1]);
  assert.ok(styles.at(-1)?.includes('drx-dashboard-stripe.css?v=drx-dashboard-stripe-v6'), `${file}: shell CSS must load last`);
}

for (const file of tailadmin) {
  const html = read(file);
  assert.match(html, /medindex-tailadmin/, `${file}: TailAdmin shell marker missing`);
  assert.match(html, /tailadmin-shell\.js\?v=shell-profile-v4/, `${file}: shared shell runtime missing`);

  const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
    .map(match => match[1]);
  assert.ok(styles.at(-1)?.includes('drx-dashboard-stripe.css?v=drx-dashboard-stripe-v6'), `${file}: canonical shell must be the final static stylesheet`);
}

console.log('Dashboard shell v6: canonical sidebar, typography and one visual authority passed.');
