'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');

const html = read('index.html');
const loader = read('clinical-editor-interaction-loader.js');
const editor = read('clinical-editor.js');

assert.match(html, /clinical-editor-interaction-loader\.js/,
  'Barnat must publish the lightweight clinical editor interaction bridge');
assert.match(html, /data-clinical-editor-runtime="clinical-editor\.js\?[^\"]+"/,
  'The lazy bridge must retain the exact clinical editor runtime URL');
assert.doesNotMatch(html, /<script\s+src="clinical-editor\.js[^\"]*"[^>]*><\/script>/,
  'The full clinical editor must not execute during Barnat startup');
assert.match(editor, /clinical-editor-interaction-lazy-v1/,
  'The composed editor runtime must carry the lazy-release marker');
assert.match(editor, /let summaryPromise = null;/,
  'Clinical summary requests must deduplicate after interaction');
assert.match(editor, /data-clinical-editor-lazy-trigger/,
  'The full runtime must adopt the lightweight startup trigger');
assert.match(editor, /async function openNext\(\)/,
  'The lazy bridge needs one public first-click entry point');
assert.match(editor, /openNext, refresh:loadSummary/,
  'The public editor API must expose the lazy first-click entry point');

function element(tagName = 'div') {
  const listeners = new Map();
  const attributes = new Map();
  return {
    tagName:String(tagName).toUpperCase(),
    dataset:{},
    className:'',
    type:'',
    textContent:'',
    title:'',
    disabled:false,
    isConnected:false,
    parentElement:null,
    addEventListener(name, handler) { listeners.set(name, handler); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    _listeners:listeners,
    _attributes:attributes,
  };
}

async function behavior() {
  let trigger = null;
  let runtimeLoads = 0;
  let openNextCalls = 0;
  const toolbar = element('div');
  toolbar.isConnected = true;
  const countBadge = element('span');
  countBadge.isConnected = true;
  countBadge.parentElement = toolbar;
  const scripts = [];
  const windowListeners = new Map();

  toolbar.insertBefore = node => {
    node.isConnected = true;
    node.parentElement = toolbar;
    trigger = node;
  };
  toolbar.appendChild = node => {
    node.isConnected = true;
    node.parentElement = toolbar;
    trigger = node;
  };

  const document = {
    readyState:'complete',
    currentScript:{ dataset:{ clinicalEditorRuntime:'clinical-editor.js?v=test-lazy' } },
    documentElement:{ dataset:{} },
    scripts,
    head:{
      appendChild(script) {
        runtimeLoads += 1;
        script.isConnected = true;
        scripts.push(script);
        queueMicrotask(() => {
          window.MedIndexClinicalEditor = {
            openNext:async () => { openNextCalls += 1; },
          };
          script._listeners.get('load')?.();
        });
      },
    },
    querySelector(selector) {
      if (selector === '.toolbar') return toolbar;
      if (selector === '[data-clinical-editor-lazy-trigger]') return trigger;
      return null;
    },
    getElementById(id) { return id === 'countBadge' ? countBadge : null; },
    createElement(tagName) { return element(tagName); },
    addEventListener() {},
  };

  const window = {
    MedIndexClinicalEditor:null,
    addEventListener(name, handler) { windowListeners.set(name, handler); },
  };

  const context = { window, document, console, Object, Promise, Error, String, Boolean, queueMicrotask };
  vm.createContext(context);
  vm.runInContext(loader, context, { filename:'clinical-editor-interaction-loader.js' });

  assert.ok(trigger?.isConnected, 'The small Auditimi trigger must exist without loading the editor runtime');
  assert.equal(trigger.textContent, 'Auditimi');
  assert.equal(runtimeLoads, 0, 'Opening Barnat alone must not request clinical-editor.js');
  assert.equal(openNextCalls, 0, 'Opening Barnat alone must not open or fetch the editor');

  const firstClick = trigger._listeners.get('click');
  assert.equal(typeof firstClick, 'function', 'The Auditimi trigger must own the lazy interaction');
  await firstClick({ preventDefault() {} });
  assert.equal(runtimeLoads, 1, 'The first explicit Auditimi click loads the editor exactly once');
  assert.equal(openNextCalls, 1, 'The first click continues directly into the editor after loading');
  assert.equal(document.documentElement.dataset.clinicalEditorRuntime, 'ready');

  await firstClick({ preventDefault() {} });
  assert.equal(runtimeLoads, 1, 'Repeated clicks must reuse the loaded editor runtime');
}

behavior().then(() => {
  console.log('✓ Clinical editor lazy runtime passed: zero startup editor JS/API work, one interaction load, deduplicated summary, and direct first-click handoff.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
