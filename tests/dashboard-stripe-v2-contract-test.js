'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const stripe = read('drx-dashboard-stripe.css');
assert.match(stripe, /DRx Stripe Dashboard v2 — final visual authority/);
assert.match(stripe, /--drx-nav:#1c1e54/);
assert.match(stripe, /--drx-shell-accent:#533afd/);
assert.match(stripe, /width:238px!important/);
assert.match(stripe, /height:58px!important/);
assert.match(stripe, /font-size:32px!important/);
assert.match(stripe, /border-radius:12px!important/);
assert.match(stripe, /border-radius:9999px!important/);
assert.match(stripe, /@media\(max-width:760px\)/);
assert.match(stripe, /prefers-reduced-motion:reduce/);

const pages = [
  'analizat.html','dozologjia.html','medical-hub.html',
  'protokollet.html','recetat.html','sistemi.html','urgjencat.html',
];

for (const file of pages) {
  const html = read(file);
  const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
    .map(match => match[1]);

  const base = styles.findIndex(href => /tailadmin-medindex\.css/.test(href));
  const professional = styles.findIndex(href => /tailadmin-professional\.css/.test(href));
  const stripeIndex = styles.findIndex(href => /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v2/.test(href));

  assert.ok(base >= 0, `${file}: TailAdmin base CSS is missing`);
  assert.ok(professional > base, `${file}: professional compatibility CSS must follow base`);
  assert.ok(stripeIndex > professional, `${file}: Stripe v2 must load after professional compatibility CSS`);
  assert.equal(stripeIndex, styles.length - 1, `${file}: Stripe v2 must be the final static stylesheet`);
  assert.match(html, /<meta name="theme-color" content="#1c1e54">/, `${file}: browser chrome must match the navy dashboard shell`);
}

/* ICD-10 is a standalone V2 shell, like Registry V2 and Classification V2.
   It shares the approved navy/indigo design system directly rather than
   loading the TailAdmin compatibility cascade. */
const icdHtml = read('icd.html');
const icdCss = read('icd-v2.css');
assert.match(icdHtml, /data-drx-app="icd-v2"/);
assert.match(icdHtml, /<meta name="theme-color" content="#1c1e54">/);
assert.match(icdHtml, /icd-v2\.css\?v=1/);
assert.match(icdHtml, /icd-v2\.js\?v=1/);
assert.doesNotMatch(icdHtml, /tailadmin-medindex\.css|tailadmin-professional\.css|drx-dashboard-stripe\.css|tailadmin-shell\.js/);
assert.match(icdCss, /#1c1e54/i);
assert.match(icdCss, /#533afd/i);

const shell = read('tailadmin-shell.js');
assert.match(shell, /function stripeStylesheet\(\)/);
assert.match(shell, /drx-dashboard-stripe\\\.css/);
assert.match(shell, /document\.head\.append\(base, professional, stripe\)/);
assert.match(shell, /stripe\.after\(critical\)/);

const professionalRuntime = read('tailadmin-professional.js');
assert.match(professionalRuntime, /drx-dashboard-stripe\\\.css/);
assert.match(professionalRuntime, /document\.head\.append\(base, professional, stripe\)/);

console.log('Stripe dashboard v2: final cascade, shell geometry and runtime ownership passed.');
