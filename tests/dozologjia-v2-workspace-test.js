'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('dozologjia.html');
const css = read('dozologjia-v2.css');
const js = read('dozologjia-v2.js');
const client = read('pediatric-calculator-client.js');
const worker = read('sw.js');

assert.match(html, /data-drx-app="dozologjia-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /class="nav-item is-active" href="\/dozologjia\.html" aria-current="page"/);
assert.match(html, /dozologjia-v2\.css\?v=\d+/);
assert.match(html, /dozologjia-v2\.js\?v=\d+/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v8/);

['dosageContent','dosageSearch','masterDrugs','masterIndication','masterRegimens','masterForm','masterFields','masterGates','masterResult','masterErrors','masterProvenance']
  .forEach(id=>assert.match(html,new RegExp(`id="${id}"`),`Dozologjia is missing #${id}`));

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);
const pageRuntimes = scripts.filter(src => !/(?:phase9-personal-entities-client|sidebar-taxonomy-v3)\.js/.test(src));

assert.equal(styles.length, 2, 'Dozologjia must keep exactly two stylesheet owners');
assert.equal(styles[1], '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8-polish2');
assert.ok(scripts.includes('/phase9-personal-entities-client.js?v=phase9b'), 'Dozologjia personal entity runtime is missing');
assert.ok(scripts.includes('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v5-polish1'), 'Dozologjia shared sidebar runtime is missing');
assert.equal(pageRuntimes.length, 1, 'Dozologjia must own exactly one page runtime in addition to shared runtimes');

const dosageCssVersion = styles[0]?.match(/^\/dozologjia-v2\.css\?v=(\d+)$/)?.[1] || '';
const dosageJsVersion = pageRuntimes[0]?.match(/^\/dozologjia-v2\.js\?v=(\d+)$/)?.[1] || '';
assert.ok(dosageCssVersion, 'Dozologjia stylesheet must use a numeric cache version');
assert.ok(dosageJsVersion, 'Dozologjia runtime must use a numeric cache version');
assert.equal(dosageCssVersion, dosageJsVersion, 'Dozologjia CSS and JS cache versions must stay synchronized');
assert.ok(Number(dosageCssVersion) >= 28, 'Dozologjia asset version must not regress below v28');
assert.doesNotMatch(html, /tailadmin-|auth-client\.js|dozologjia\.js|dozologjia-deep-audit\.js|style-loader|pediatric-calculator\.css|pediatric-calculator-client\.js/);
assert.match(html, /phase9-personal-entities-client\.js\?v=phase9b/);


assert.match(js,/master-catalog/);
assert.match(js,/master-calculate/);
/* Every input change retires the standing answer before a new one is asked
   for, so a stale dose can never sit beside fresh patient values. */
assert.match(js,/token !== state\.revision/);
assert.match(js,/function invalidate\(\)/);
/* The page reads as one column of decisions, not as a form to submit. */
assert.doesNotMatch(html,/master-submit|Llogarit dozën/);
assert.match(html,/class="dz-column"/);
assert.match(css,/\.dz-card/);
assert.match(css,/@media\(max-width:760px\)/);
assert.ok(js.endsWith(read('dozologjia-master-client.js')));
assert.doesNotMatch(js,/innerHTML|mgPerKg/);
assert.doesNotThrow(()=>new Function(js));
console.log('PASS: Master frontend ownership, shell, API wiring and invalidation');
