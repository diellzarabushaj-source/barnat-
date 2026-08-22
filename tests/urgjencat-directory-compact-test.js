'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const css = read('emergency-directory-compact.css');

assert.match(html, /emergency-directory-compact\.css\?v=20260822-1/);
assert.ok(
  html.indexOf('emergency-inter-typography.css') < html.indexOf('emergency-directory-compact.css')
  && html.indexOf('emergency-directory-compact.css') < html.indexOf('tailadmin-professional.css'),
  'Compact directory layer must follow emergency typography and keep TailAdmin as the final stylesheet.',
);

assert.match(css, /\.ck-layout\{[\s\S]*grid-template-columns:minmax\(238px,300px\)/);
assert.match(css, /\.ck-directory\{[\s\S]*padding:8px/);
assert.match(css, /\.ck-list-button\{[\s\S]*padding:9px 10px/);
assert.match(css, /\.ck-directory-chapter \+ \.ck-directory-chapter\{[\s\S]*border-top:2px/);
assert.match(css, /\.ck-directory-subchapter\{[\s\S]*border-left:2px/);
assert.match(css, /\.ck-directory-safety,[\s\S]*\.ck-directory-source-count,[\s\S]*\.ck-directory-active\{[\s\S]*display:none!important/);
assert.match(css, /\.ck-directory-tag\{[\s\S]*min-height:23px/);
assert.match(css, /html\[data-theme="dark"\]/);
assert.match(css, /@media\(max-width:900px\)/);

console.log('Urgjencat compact directory contract passed.');
