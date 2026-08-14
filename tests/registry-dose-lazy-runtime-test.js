'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-dose-interaction-loader.js', 'scripts/patch-phase15-lazy-dose-runtimes.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const index = read('index.html');
const loader = read('registry-dose-interaction-loader.js');
const patch = read('scripts/patch-phase15-lazy-dose-runtimes.js');
const packageJson = JSON.parse(read('package.json'));

const lazyStyles = [
  'registry-novorapid-simple-calculator.css',
  'registry-novomix30-simple-calculator.css',
  'registry-other-insulins-simple-calculator.css',
];
const lazyScripts = [
  'registry-novorapid-simple-calculator.js',
  'registry-novomix30-simple-calculator.js',
  'registry-other-insulins-simple-calculator.js',
  'registry-insulin-final-safety.js',
];

assert.match(index, /registry-dose-interaction-loader\.js\?v=20260814-1/,
  'The small interaction loader must stay in the static registry startup path.');
assert.ok(index.indexOf('registry-dose-interaction-loader.js') < index.indexOf('registry-insulin-row-bridge.js'),
  'The interaction loader must register before visible Smart Insulin row controls.');
assert.match(index, /registry-insulin-row-bridge\.js\?v=/,
  'Visible Smart Insulin row controls must remain available without loading modal runtimes.');
assert.match(index, /registry-insulin-deep-audit\.css\?v=/,
  'Visible Smart Insulin table styling must remain eager to avoid first-click/first-paint FOUC.');

for (const asset of lazyStyles) {
  assert.doesNotMatch(index, new RegExp(`<link\\s+[^>]*href="${asset.replace(/\./g, '\\.')}`),
    `${asset} must not block normal registry startup.`);
  assert(loader.includes(asset), `${asset} must remain available through the interaction loader.`);
}
for (const asset of lazyScripts) {
  assert.doesNotMatch(index, new RegExp(`<script\\s+[^>]*src="${asset.replace(/\./g, '\\.')}`),
    `${asset} must not execute during normal registry startup.`);
  assert(loader.includes(asset), `${asset} must remain available through the interaction loader.`);
}

assert.match(loader, /const INSULIN_TRIGGER = '\[data-insulin-smart-open\]'/);
assert.match(loader, /document\.addEventListener\('click', onDocumentClick, true\)/,
  'Lazy insulin activation must be capture-phase so the original click can be safely delayed and replayed.');
assert.match(loader, /let insulinRuntimePromise = null/,
  'Concurrent first clicks must share one runtime-load promise.');
assert.match(loader, /if \(insulinRuntimePromise\) return insulinRuntimePromise/);
assert.match(loader, /for \(const src of INSULIN_SCRIPT_URLS\) await loadScript\(src\)/,
  'Insulin calculator scripts must preserve deterministic execution order.');
assert.match(loader, /replaying = new WeakSet\(\)/);
assert.match(loader, /trigger\.click\(\)/,
  'The original Smart Insulin action must be replayed after the runtime becomes ready.');
assert.doesNotMatch(loader, /\bfetch\s*\(|XMLHttpRequest|setInterval|MutationObserver|requestIdleCallback/,
  'The interaction loader itself must not poll, prefetch data or observe the DOM.');

let lastIndex = -1;
for (const asset of lazyScripts) {
  const indexInManifest = loader.indexOf(asset);
  assert.ok(indexInManifest > lastIndex, `${asset} must keep the audited insulin script order.`);
  lastIndex = indexInManifest;
}

assert.match(patch, /INSULIN_STYLES/);
assert.match(patch, /INSULIN_SCRIPTS/);
assert.match(patch, /registry-insulin-row-bridge\.js/);
assert.match(patch, /registry-insulin-deep-audit\.css/);
assert.match(packageJson.scripts['build:runtime'], /patch-phase15-lazy-dose-runtimes\.js/,
  'The lazy insulin startup contract must be regenerated on every production build.');
assert.match(packageJson.scripts.test, /registry-dose-lazy-runtime-test\.js/,
  'The lazy insulin startup regression must run in the main suite.');

console.log('Phase 15 insulin modal runtimes are interaction-gated without changing visible registry controls or clinical execution order.');
