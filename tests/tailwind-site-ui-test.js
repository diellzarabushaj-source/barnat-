const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const css = read('medindex-tailwind-ui.css');
assert.match(css, /--tw-teal-500:#147d7e/);
assert.match(css, /--tw-control:44px/);
assert.match(css, /html\.medindex-tailadmin/);
assert.match(css, /body:has\(\.info-shell\)/);
assert.match(css, /html\[data-mi-page="login"\]/);
assert.match(css, /html\[data-theme="dark"\]\.medindex-tailadmin/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /focus-visible/);
assert.doesNotMatch(css, /cdn\.tailwindcss\.com|fonts\.googleapis\.com/i);

const touch = read('medindex-tailwind-touch.css');
assert.match(touch, /min-height:40px/);
assert.match(touch, /min-height:44px/);

const professional = read('tailadmin-professional.css');
const stripe = read('drx-dashboard-stripe.css');
assert.match(stripe, /DRx Stripe Dashboard v2 — final visual authority/);
assert.match(stripe, /--drx-nav:#1c1e54/);
assert.match(stripe, /--drx-shell-accent:#533afd/);
assert.match(stripe, /width:238px!important/);
assert.match(stripe, /height:58px!important/);
assert.doesNotMatch(stripe, /https?:\/\//);

const coreIndex = professional.indexOf('tailadmin-professional-core.css');
const uiIndex = professional.indexOf('medindex-tailwind-ui.css');
const touchIndex = professional.indexOf('medindex-tailwind-touch.css');
assert.ok(coreIndex >= 0, 'professional core stylesheet is missing');
assert.ok(uiIndex > coreIndex, 'Tailwind UI must load after professional core');
assert.ok(touchIndex > uiIndex, 'touch-target corrections must be the final clinical layer');

const polish = read('app-polish.css');
assert.match(polish, /^@import url\("medindex-tailwind-ui\.css\?v=20260805-1"\);/);

const themePreload = read('theme-preload.js');
assert.match(themePreload, /medindex-tailwind-ui\.css\?v=20260805-1/);
assert.match(themePreload, /dataset\.miTailwindUi = '20260805-1'/);

const registryHtml = read('index.html');
assert.match(registryHtml, /data-drx-app="registry-v2"/);
assert.match(registryHtml, /registry-v2\.css\?v=1/);
assert.match(registryHtml, /registry-v2\.js\?v=1/);
assert.doesNotMatch(registryHtml, /tailadmin-professional\.css|tailadmin-shell\.js/,
  'Registry V2 must stay standalone instead of reintroducing legacy UI layers.');

/* ICD-10 u nda nga bundle-i i pajtueshmërisë njësoj si Barnat: nëntëmbëdhjetë
   fletë stili mbi një guaskë tjetër u zëvendësuan me një shtresë të vetme.
   Pohimi nuk u hoq — u drejtua nga arkitektura që ekziston vërtet. */
const icdHtml = read('icd.html');
assert.match(icdHtml, /data-drx-app="icd-v2"/);
assert.match(icdHtml, /icd-v2\.css\?v=1/);
assert.match(icdHtml, /icd-v2\.js\?v=1/);
assert.doesNotMatch(icdHtml, /tailadmin-professional\.css|tailadmin-shell\.js/,
  'ICD V2 must stay standalone instead of reintroducing legacy UI layers.');

const appPages = [
  'analizat.html', 'dozologjia.html',
  'recetat.html', 'protokollet.html', 'medical-hub.html',
  'urgjencat.html', 'sistemi.html',
];
for (const file of appPages) {
  const html = read(file);
  assert.match(html, /tailadmin-professional\.css/, `${file} does not load the professional compatibility bundle`);
  assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v2/, `${file} does not load the Stripe v2 authority`);
  assert.match(html, /class="[^"]*medindex-tailadmin/, `${file} is missing the shared TailAdmin root class`);
  const professionalIndex = html.indexOf('tailadmin-professional.css');
  const stripeIndex = html.indexOf('drx-dashboard-stripe.css');
  assert.ok(stripeIndex > professionalIndex, `${file}: Stripe v2 must load after professional compatibility CSS`);
}

for (const file of ['rreth-nesh.html', 'kontakt.html', 'blog.html']) {
  const html = read(file);
  assert.match(html, /medindex-tailwind-ui\.css\?v=20260805-1/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:brand|info-pages|login|rreth-nesh|kontakt|blog)/, `${file} still contains project-root-only public paths`);
}

for (const file of ['login.html', 'recovery.html']) {
  const html = read(file);
  assert.match(html, /theme-preload\.js/);
}

console.log('Unified Tailwind UI system, loading order, touch targets, responsive, dark-mode, public and clinical page contracts passed.');
