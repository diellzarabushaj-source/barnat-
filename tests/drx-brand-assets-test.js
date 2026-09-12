'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const nodePath = require('node:path');

const ROOT = nodePath.resolve(__dirname, '..');
const read = file => fs.readFileSync(nodePath.join(ROOT, file), 'utf8');
const manifest = JSON.parse(read('brand/drx-assets.json'));
const middleware = read('middleware.ts');

assert.equal(manifest.brand, 'DRx');
assert.deepEqual(Object.keys(manifest.assets).sort(), [
  'horizontalOnDark','horizontalOnLight','markOnDark','markOnLight',
].sort());

const expected = {
  horizontalOnDark:'/brand/drx-horizontal-on-dark.svg',
  horizontalOnLight:'/brand/drx-horizontal-on-light.svg',
  markOnDark:'/brand/drx-mark-on-dark.svg',
  markOnLight:'/brand/drx-mark-on-light.svg',
};

for (const [key, route] of Object.entries(expected)) {
  assert.equal(manifest.assets[key].route, route, `${key}: canonical route changed`);
  const absolute = nodePath.join(ROOT, route.replace(/^\//, ''));
  assert.ok(fs.existsSync(absolute), `${key}: canonical asset missing`);
  assert.match(fs.readFileSync(absolute, 'utf8'), /<svg\b/, `${key}: canonical asset must remain vector`);
  assert.ok(middleware.includes(`'${route}'`), `${key}: canonical asset must bypass auth middleware`);
}

for (const file of ['index.html','klasifikimi.html','icd.html','dozologjia.html','urgjencat.html','analizat.html','protokollet.html','recetat.html','medical-hub.html','sistemi.html']) {
  const html = read(file);
  assert.match(html, /src="\/brand\/drx-horizontal-on-dark\.svg"[^>]*width="112" height="33"/,
    `${file}: dark sidebar must use the same white DRx lockup at 112×33`);
  assert.doesNotMatch(html, /drx-horizontal-white\.svg|drx-horizontal-dark\.svg|drx-icon-silver\.svg|drx-icon-white\.svg/,
    `${file}: legacy DRx aliases must not be used by active V2 pages`);
}

for (const file of ['landing.html','login.html']) {
  const html = read(file);
  assert.match(html, /\/brand\/drx-horizontal-on-light\.svg/,
    `${file}: light auth surface must use the dark DRx lockup`);
  assert.match(html, /\/brand\/drx-mark-on-light\.svg/,
    `${file}: light auth surface must use the dark compact mark`);
}

const shell = read('tailadmin-shell-core.js');
assert.match(shell, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(shell, /\/brand\/drx-mark-on-light\.svg/);

const runtime = read('medindex-brand-runtime.js');
assert.match(runtime, /const VERSION = 'drx-brand-v7'/);
assert.match(runtime, /function sidebarPicture/);
assert.match(runtime, /kind === 'full' \? ASSETS\.horizontalOnDark : ASSETS\.markOnDark/);
assert.match(runtime, /sidebar\.innerHTML = `\$\{sidebarPicture\('full','medindex-brand-full'\)\}\$\{sidebarPicture\('icon','medindex-brand-icon'\)\}`/);
assert.match(runtime, /horizontalOnLight/);
assert.match(runtime, /horizontalOnDark/);
assert.match(runtime, /markOnLight/);
assert.match(runtime, /markOnDark/);
assert.match(runtime, /drx-horizontal-on-light\.svg/);
assert.match(runtime, /drx-horizontal-on-dark\.svg/);
assert.match(runtime, /drx-mark-on-light\.svg/);
assert.match(runtime, /drx-mark-on-dark\.svg/);
assert.match(runtime, /medindex-brand-full\{width:112px;height:33px\}/);

// Two owners drew the sidebar brand: this runtime replaced `.sidebar .brand`
// with `.mi-sidebar`-scoped markup, while sidebar-taxonomy-core-v3.js added the
// compact mark to the same element. The result was the wordmark and the mark on
// top of each other. The legacy runtime keeps the legacy rail only.
assert.match(
  runtime,
  /document\.querySelector\('\.mi-sidebar \.mi-brand'\)/,
  'the brand runtime must not claim the canonical .sidebar .brand rail',
);
assert.doesNotMatch(
  runtime,
  /querySelector\('[^']*\.sidebar \.brand'\)/,
  'the canonical rail is owned by the shell, not by the legacy brand runtime',
);

const shellCss = read('drx-dashboard-stripe.css');
// The rules that force the lockup visible must not catch the compact mark,
// or the mark can never be hidden in the expanded rail.
assert.doesNotMatch(
  shellCss,
  /html\.drx-unified-sidebar \.sidebar \.brand img\{/,
  'brand image rules must exclude the compact mark',
);
assert.match(shellCss, /html\.drx-unified-sidebar \.sidebar \.brand img:not\(\.brand-mark\)\{/);
assert.match(
  shellCss,
  /html\.drx-unified-sidebar\.drx-sidebar-collapsed \.sidebar \.brand img:not\(\.brand-mark\)/,
  'the collapsed rail must hide the lockup at a specificity that wins',
);
assert.match(
  shellCss,
  /html\.drx-unified-sidebar \.sidebar \.brand \.medindex-brand-picture\{display:none!important\}/,
  'legacy brand markup injected into the canonical rail must stay inert',
);
// A 30px mark beside a 30px button does not fit in the 56px content box of a
// 76px rail, so the collapsed head stacks.
const collapsedHead = shellCss.slice(shellCss.indexOf('.drx-sidebar-collapsed .sidebar-head{'));
assert.match(collapsedHead.slice(0, 320), /flex-direction:column!important/);

console.log('DRx brand gate passed: canonical on-dark/on-light assets and identical sidebar geometry.');
