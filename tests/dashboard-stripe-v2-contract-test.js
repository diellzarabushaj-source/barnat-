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
  'dozologjia.html','sistemi.html',
];

for (const file of pages) {
  const html = read(file);
  const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
    .map(match => match[1]);

  const base = styles.findIndex(href => /tailadmin-medindex\.css/.test(href));
  const professional = styles.findIndex(href => /tailadmin-professional\.css/.test(href));
  const stripeIndex = styles.findIndex(href => /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/.test(href));

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
assert.match(icdHtml, /icd-v2\.css\?v=profile-columns-v4/);
assert.match(icdHtml, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);
assert.match(icdHtml, /drx-unified-sidebar/);
assert.match(icdHtml, /icd-v2\.js\?v=profile-columns-v4/);
assert.doesNotMatch(icdHtml, /tailadmin-medindex\.css|tailadmin-professional\.css|tailadmin-shell\.js/);
assert.match(icdCss, /#1c1e54/i);
assert.match(icdCss, /#533afd/i);

for (const [htmlFile, cssFile, jsFile, markerName] of [
  ['urgjencat.html','urgjencat-v2.css','urgjencat-v2.js','urgjencat-v2'],
  ['analizat.html','analizat-v2.css','analizat-v2.js','analizat-v2'],
  ['protokollet.html','protokollet-v2.css','protokollet-v2.js','protokollet-v2'],
  ['recetat.html','recetat-v2.css','recetat-v2.js','recetat-v2'],
  ['medical-hub.html','medical-hub-v2.css','medical-hub-v2.js','medical-hub-v2'],
]) {
  const html = read(htmlFile);
  const css = read(cssFile);
  const js = read(jsFile);
  const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)].map(match => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  assert.match(html, new RegExp(`data-drx-app="${markerName}"`));
  assert.equal(styles.length, 2, `${htmlFile}: standalone V2 must load page CSS plus shared Stripe shell CSS`);
  assert.match(html, /drx-unified-sidebar/, `${htmlFile}: unified sidebar marker missing`);
  assert.equal(scripts.length, 1, `${htmlFile}: standalone V2 must own one runtime`);
  assert.ok(styles[0].includes(cssFile), `${htmlFile}: unexpected page stylesheet owner`);
  assert.ok(/drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/.test(styles[1]), `${htmlFile}: shared Stripe shell must load last`);
  assert.ok(scripts[0].includes(jsFile), `${htmlFile}: unexpected runtime owner`);
  assert.doesNotMatch(html, /tailadmin-|auth-client|emergency-curriculum|clinical-knowledge\.css|medical-hub\.css/);
  assert.match(css, /#1c1e54/i);
  assert.match(css, /#635bff|#533afd/i);
  assert.doesNotThrow(() => new Function(js));
}

const shell = read('tailadmin-shell.js');
assert.match(shell, /function stripeStylesheet\(\)/);
assert.match(shell, /drx-dashboard-stripe\\\.css/);
assert.match(shell, /document\.head\.append\(base, professional, stripe\)/);
assert.match(shell, /stripe\.after\(critical\)/);

const professionalRuntime = read('tailadmin-professional.js');
assert.match(professionalRuntime, /drx-dashboard-stripe\\\.css/);
assert.match(professionalRuntime, /document\.head\.append\(base, professional, stripe\)/);

console.log('Stripe dashboard v2: final cascade, shell geometry and runtime ownership passed.');
