'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const nodePath = require('node:path');

const ROOT = nodePath.resolve(__dirname, '..');
const read = file => fs.readFileSync(nodePath.join(ROOT, file), 'utf8');
const manifest = JSON.parse(read('brand/drx-assets.json'));

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
}

for (const file of ['index.html','klasifikimi.html','icd.html','dozologjia.html','urgjencat.html','analizat.html','protokollet.html','recetat.html','medical-hub.html']) {
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
assert.match(runtime, /horizontalOnLight/);
assert.match(runtime, /horizontalOnDark/);
assert.match(runtime, /markOnLight/);
assert.match(runtime, /markOnDark/);
assert.match(runtime, /drx-horizontal-on-light\.svg/);
assert.match(runtime, /drx-horizontal-on-dark\.svg/);
assert.match(runtime, /drx-mark-on-light\.svg/);
assert.match(runtime, /drx-mark-on-dark\.svg/);
assert.match(runtime, /medindex-brand-full\{width:112px;height:33px\}/);

console.log('DRx brand gate passed: canonical on-dark/on-light assets and identical sidebar geometry.');
