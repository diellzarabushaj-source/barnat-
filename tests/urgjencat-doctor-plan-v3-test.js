'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const js = read('emergency-doctor-plan-v3.js');
const css = read('emergency-doctor-plan-v3.css');
const readability = read('emergency-doctor-readability-v3.css');

assert.match(html, /emergency-doctor-plan-v3\.css\?v=20260822-1/);
assert.match(html, /emergency-doctor-readability-v3\.css\?v=20260822-1/);
assert.match(html, /emergency-doctor-plan-v3\.js\?v=20260822-1/);
assert.ok(
  html.indexOf('emergency-doctor-ux-v2.js') < html.indexOf('emergency-doctor-plan-v3.js'),
  'Doctor plan v3 must enhance the existing v2 layer, not race it.',
);
assert.ok(
  html.indexOf('emergency-doctor-plan-v3.css') < html.indexOf('emergency-doctor-readability-v3.css'),
  'Readability guardrails must load after the v3 visual layer.',
);
assert.ok(
  html.indexOf('emergency-doctor-readability-v3.css') < html.indexOf('tailadmin-professional.css'),
  'Canonical TailAdmin must remain the final stylesheet.',
);

assert.match(js, /TANI · ORIENTIM 5–10 SEKONDA/);
assert.match(js, /data-ck-doctor-scan/);
assert.match(js, /primaryCareSteps/);
assert.match(js, /item\?\.redFlags/);
assert.match(js, /item\?\.doNotDo/);
assert.match(js, /item\?\.referral/);
assert.match(js, /data-ck-scan-action="\$\{action\}"/);
assert.match(js, /jumpAfterLearn\('Red flags'\)/);
assert.match(js, /jumpAfterLearn\('Flashcards'\)/);
assert.match(js, /event\.key === '\/'/);
assert.match(js, /event\.key\.toLowerCase\(\) === 's'/);
assert.match(js, /event\.key\.toLowerCase\(\) === 'm'/);
assert.match(js, /event\.key\.toLowerCase\(\) === 'f'/);
assert.match(js, /event\.key === 'Escape'/);
assert.match(js, /event\.key !== 'Enter'/);
assert.match(js, /window\.getSelection/);
assert.match(js, /window\.scrollBy/);
assert.match(js, /prefers-reduced-motion/);
assert.doesNotMatch(js, /dose|mg\/kg|adrenalin|epinefrin|aspirin/i, 'UX layer must not invent treatment content or doses.');

assert.match(css, /\.ck-doctor-scan\{/);
assert.match(css, /grid-template-columns:minmax\(0,1\.7fr\)/);
assert.match(css, /\.ck-doctor-scan-metrics\{/);
assert.match(css, /\.ck-doctor-search-hint\{/);
assert.match(css, /\.ck-doctor-shortcuts\{/);
assert.match(css, /\.ck-sl-flashcard\[data-flash-card\]/);
assert.match(css, /@media\(max-width:620px\)/);
assert.match(css, /@media\(pointer:coarse\)/);
assert.match(css, /html\[data-theme="dark"\]/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /font-weight:(?:700|800|900)/, 'v3 should preserve the lighter Inter hierarchy.');

assert.match(readability, /\.ck-directory-tag/);
assert.match(readability, /\.ck-list-button strong/);
assert.match(readability, /font-size:11px!important/);
assert.match(readability, /font-size:14px!important/);
assert.match(readability, /\.ck-sl-experience button/);
assert.match(readability, /min-height:44px/);
assert.doesNotMatch(readability, /font-size:(?:[0-9](?:\.[0-9]+)?|10(?:\.[0-9]+)?)px/, 'Readability layer must not introduce sub-11px type.');

console.log('Urgjencat doctor plan v3 contract passed.');
