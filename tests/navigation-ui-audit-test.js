const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'recetat.html'];

pages.forEach(page => {
  const html = read(page);
  assert.match(html, /navigation-shell\.css/, `${page} must load the canonical navigation CSS`);
  assert.match(html, /navigation-consistency\.js/, `${page} must load the canonical navigation behavior`);
  assert.match(html, /app-stability\.js/, `${page} must load stability helpers`);
  assert.ok(html.indexOf('navigation-consistency.js') < html.indexOf('app-stability.js'), `${page}: navigation must initialize before stability observers`);
  assert.match(html, /skip-link/, `${page} needs a keyboard skip link`);
});

const navigation = read('navigation-consistency.js');
assert.match(navigation, /hasHashTarget/);
assert.match(navigation, /aria-current/);
assert.match(navigation, /keyboardNavigation/);
assert.match(navigation, /centerActiveItem/);
assert.match(navigation, /pageshow/);
assert.match(navigation, /popstate/);
assert.match(navigation, /hashchange/);
assert.match(navigation, /orientationchange/);

const css = read('navigation-shell.css');
assert.match(css, /100dvh/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /prefers-contrast/);
assert.match(css, /forced-colors/);
assert.match(css, /@media print/);
assert.match(css, /touch-action:manipulation/);

console.log('Navigation and frontend UI audit tests passed.');
