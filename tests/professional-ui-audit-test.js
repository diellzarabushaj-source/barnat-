const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const count = (value, pattern) => [...value.matchAll(pattern)].length;

const pages = [
  'index.html',
  'klasifikimi.html',
  'icd.html',
  'analizat.html',
  'dozologjia.html',
  'protokollet.html',
  'recetat.html',
];

for (const fileName of pages) {
  const html = read(fileName);
  assert.equal(count(html, /tailadmin-professional\.css/gi), 1, `${fileName}: professional CSS must load once`);
  assert.equal(count(html, /tailadmin-professional\.js/gi), 1, `${fileName}: professional JS must load once`);
  assert.match(html, /data-tailadmin-professional-css/, `${fileName}: professional CSS marker missing`);

  const baseCss = html.indexOf('tailadmin-medindex.css');
  const proCss = html.indexOf('tailadmin-professional.css');
  const shellJs = html.indexOf('tailadmin-shell.js');
  const proJs = html.indexOf('tailadmin-professional.js');
  assert.ok(baseCss >= 0 && proCss > baseCss, `${fileName}: professional CSS must follow base TailAdmin CSS`);
  assert.ok(shellJs >= 0 && proJs > shellJs, `${fileName}: professional runtime must follow shell runtime`);
}

const shell = read('tailadmin-shell.js');
assert.match(shell, /document\.documentElement\.classList\.add\('medindex-tailadmin'\)/, 'TailAdmin marker must be installed before DOMContentLoaded');
assert.match(shell, /data-tailadmin-professional-css/, 'shell must keep professional CSS as the final cascade layer');

const enhancements = read('ui-enhancements.js');
assert.match(enhancements, /function hasTailAdmin/, 'legacy feature layer must detect TailAdmin deterministically');
assert.match(enhancements, /medindex:tailadmin-ready/, 'legacy feature layer must wait for the TailAdmin shell');
assert.match(enhancements, /hasTailAdmin\(\) \? '' :/, 'legacy navigation CSS must be disabled whenever TailAdmin assets exist');

const css = read('tailadmin-professional.css');
[
  /position:\s*fixed\s*!important;[\s\S]*inset:\s*0\s*!important;/,
  /#appMenu \.app-menu-link,[\s\S]*flex-direction:\s*row\s*!important;/,
  /overflow-x:\s*hidden\s*!important;/,
  /data-mi-page="barnat"/,
  /data-mi-page="klasifikimi"/,
  /data-mi-page="icd"/,
  /data-mi-page="analizat"/,
  /data-mi-page="dozologjia"/,
  /data-mi-page="protokollet"/,
  /data-mi-page="recetat"/,
  /@media \(max-width: 1023px\)/,
  /@media \(max-height: 760px\)/,
].forEach(pattern => assert.match(css, pattern, `professional CSS missing ${pattern}`));

const runtime = read('tailadmin-professional.js');
[
  /ROOT\.dataset\.miPage/,
  /tools\.appendChild\(logout\)/,
  /resetRootHorizontalOffset/,
  /orderStylesheets/,
  /MutationObserver/,
  /ResizeObserver/,
  /medindex:professional-ui-ready/,
].forEach(pattern => assert.match(runtime, pattern, `professional runtime missing ${pattern}`));

assert.doesNotMatch(runtime, /fetch\(|\/api\//, 'professional runtime must not touch backend APIs');

console.log('Professional TailAdmin shell and section audit passed.');
