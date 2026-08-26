'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'registry-dose-calculator.js'), 'utf8');
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-dose-calculator.js')], { stdio:'pipe' });

assert.match(source, /dose-calculator-visibility-lazy-v1/);
assert.match(source, /status:'deferred'/);
assert.match(source, /let registryPromise = null;/);
assert.match(source, /let catalogPromise = null;/);
assert.match(source, /function activateDoseRuntime\(reason = 'intent'\)/);
assert.match(source, /new IntersectionObserver\(entries =>/);
assert.match(source, /rootMargin:'120px'/);
assert.match(source, /addEventListener\('pointerover'/);
assert.match(source, /addEventListener\('touchstart'/);
assert.match(source, /addEventListener\('focusin'/);
assert.match(source, /bindDoseRuntimeActivation\(\);/);
assert.doesNotMatch(source, /ensureModal\(\);\s*observe\(\);\s*scheduleEnhance\(\);\s*void loadRegistry\(\);\s*void loadCatalog\(\);/s);

const listeners = new Map();
const tableListeners = new Map();
let observerCallback = null;
let fetchCalls = 0;
let observedHeader = null;
const header = {};
const registryContent = {};
const tbody = {
  addEventListener(type, fn) { tableListeners.set(type, fn); },
};
const documentElement = { dataset:{} };
const document = {
  documentElement,
  body:{ classList:{ add() {}, remove() {} }, appendChild() {} },
  getElementById(id) {
    if (id === 'tbody') return tbody;
    if (id === 'registryContent') return registryContent;
    if (id === 'headerRow') return null;
    return null;
  },
  querySelector(selector) {
    if (selector === '[data-registry-dose-calculator-column="dose-calculator"]') return header;
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { listeners.set(type, fn); },
  createElement() { throw new Error('Modal/header creation must not run during startup test.'); },
};

class FakeIntersectionObserver {
  constructor(callback) { observerCallback = callback; }
  observe(node) { observedHeader = node; }
  disconnect() {}
}
class FakeMutationObserver {
  constructor() {}
  observe() {}
  disconnect() {}
}

const windowObject = {
  MEDINDEX_REGISTRY_ROWS:[],
  addEventListener(type, fn) { listeners.set(`window:${type}`, fn); },
};
const fetch = async () => {
  fetchCalls += 1;
  return {
    ok:true,
    status:200,
    json:async () => ({ meta:{ failClosed:true, officialVerifiedOnly:true }, catalog:[] }),
  };
};
const context = {
  window:windowObject,
  document,
  console,
  Intl,
  Map,
  Set,
  WeakSet,
  URLSearchParams,
  IntersectionObserver:FakeIntersectionObserver,
  MutationObserver:FakeMutationObserver,
  fetch,
  requestAnimationFrame:callback => { callback(); return 1; },
  cancelAnimationFrame() {},
  navigator:{},
  HTMLElement:function HTMLElement() {},
  HTMLButtonElement:function HTMLButtonElement() {},
  setTimeout,
  clearTimeout,
  Promise,
};
context.window.window = context.window;
context.window.document = document;
context.window.requestAnimationFrame = context.requestAnimationFrame;
context.window.IntersectionObserver = FakeIntersectionObserver;

vm.runInNewContext(source, context, { filename:'registry-dose-calculator.js' });
assert.equal(fetchCalls, 0, 'Dose catalog must not be fetched while the registry merely boots.');
assert.equal(documentElement.dataset.doseCalculatorStartup, 'dose-calculator-visibility-lazy-v1');
assert.equal(observedHeader, header, 'The dose column should be visibility-armed after startup.');
assert.equal(typeof tableListeners.get('pointerover'), 'function');
assert.equal(typeof tableListeners.get('touchstart'), 'function');

(async () => {
  observerCallback([{ isIntersecting:true, intersectionRatio:1 }]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fetchCalls, 1, 'The first visible dose column must trigger exactly one catalog request.');
  assert.equal(documentElement.dataset.doseCalculatorActivation, 'visible');

  observerCallback?.([{ isIntersecting:true, intersectionRatio:1 }]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fetchCalls, 1, 'Repeated visibility must reuse the loaded catalog instead of refetching it.');

  console.log('✓ Dose calculator startup lazy gate passed: zero startup catalog/API work, visibility or explicit intent activates once, and clinical UI remains fail-closed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
