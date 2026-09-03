'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('recetat.html');
const css = read('recetat-v2.css');
const font = fs.readFileSync(path.join(ROOT, 'fonts/inter-latin-variable-normal.woff2'));
const authority = css.slice(css.indexOf('Recetat — Stripe typography authority'));

assert.match(html, /rel="preload" href="\/fonts\/inter-latin-variable-normal\.woff2" as="font" type="font\/woff2" crossorigin/,
  'Preload the actual bundled Inter asset');
assert.equal(font.toString('ascii', 0, 4), 'wOF2', 'The font must be a real WOFF2 asset, not a missing-file response');
assert.match(css, /@font-face\s*\{[^}]*font-family:Inter;[^}]*font-weight:100 900;/,
  'Use variable Inter with the real 300 display weight available');
assert.doesNotMatch(html, /https?:\/\/(?:fonts\.googleapis|fonts\.gstatic)/, 'Typography must not depend on a remote font request');
assert.match(html, /recetat-v2\.css\?v=20-stripe-type1/, 'Publish a new stylesheet cache revision');
assert.match(html, /recetat-v2\.js\?v=20/, 'Typography changes must not require changing the clinical runtime');
assert.ok(authority.length > 200, 'Keep one final, documented Stripe typography authority after legacy bridge styles');
assert.match(authority, /@media screen\s*\{/, 'Keep display changes out of prescription print/PDF typography');
assert.match(authority, /#rxWorkspace\s*\{[^}]*font-family:Inter[\s\S]*?font-feature-settings:"ss01"/);
assert.match(authority, /#rxWorkspace \.rx-page-heading h1\s*\{[^}]*font-size:var\(--drx-type-page-title,32px\)!important;[^}]*font-weight:var\(--drx-type-page-title-weight,300\)!important;/,
  'The workspace-scoped selector must defeat legacy heavy display headings');
assert.match(authority, /@media\(max-width:760px\)[\s\S]*?#rxWorkspace\s*\{[^}]*--drx-type-page-title:26px;/,
  'Compact display size must remain 26px');
assert.match(authority, /\.rx-source-nav-copy strong\s*\{[^}]*white-space:normal;[^}]*overflow-wrap:anywhere/,
  'Long clinical names must remain readable in the source navigation');
assert.match(authority, /\.rx-source-sig p\s*\{[^}]*font-size:var\(--rx-ui-body\)!important;[^}]*font-weight:400!important;[^}]*line-height:1\.65!important;/,
  'Clinical instructions need readable body typography, not display weight');
assert.match(authority, /:focus-visible\s*\{[^}]*outline:2px solid/,
  'A visible keyboard focus indicator is part of the typography/UI contract');
assert.match(authority, /select\s*\{height:44px!important;font-size:16px!important/,
  'Mobile chapter/lesson selectors must retain touch size and readable input text');

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const muted = authority.match(/--rx-ui-muted:(#[\da-f]{6})/i)?.[1];
assert.ok(muted, 'The scoped typography authority must define its muted text color');
for (const background of ['#ffffff', '#f6f9fc', '#f4f3ff']) {
  const ratio = (luminance(background) + 0.05) / (luminance(muted) + 0.05);
  assert.ok(ratio >= 4.5, `Muted text must meet 4.5:1 contrast on ${background}; got ${ratio.toFixed(2)}`);
}

console.log('Recetat Stripe typography contract passed: local variable Inter, scoped hierarchy, readable clinical text and mobile/focus safeguards.');
