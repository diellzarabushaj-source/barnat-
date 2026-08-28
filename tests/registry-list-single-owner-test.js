'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('index.html');
const finalCss = read('registry-table-tools.css');
const guardStart = finalCss.indexOf('/* ===== consolidated from registry-list-owner-guard.css ===== */');
const guardEnd = finalCss.indexOf('/* ===== canonical final layer: registry-table-tools.css ===== */', guardStart);
assert.ok(guardStart >= 0 && guardEnd > guardStart, 'the consolidated List owner guard section must exist in final CSS');
const css = finalCss.slice(guardStart, guardEnd);
const owner = read('registry-list-owner-guard.js');
const bridge = read('registry-list-data-bridge.js');
const listView = read('registry-list-view.js');
const unified = read('registry-unified-table.js');
const api = read('api/drug-search.js');

// --- Final built asset contract ---------------------------------------------

{
  const cssAt = html.indexOf('registry-table-tools.css');
  const bridgeAt = html.indexOf('registry-list-data-bridge.js');
  const listAt = html.indexOf('registry-list-view.js');
  const ownerAt = html.indexOf('registry-list-owner-guard.js');
  const headClose = html.indexOf('</head>');

  assert.ok(cssAt >= 0 && cssAt < headClose,
    'the single registry stylesheet must be present in <head> before deferred runtimes can paint');
  assert.ok(bridgeAt >= 0 && bridgeAt < listAt,
    'the data-only bridge must be available before List can ask for the full browse dataset');
  assert.ok(ownerAt > listAt,
    'the ownership guard must follow the List controller it protects');

  const release = 'registry-list-stable-v1';
  for (const asset of [
    'registry-table-tools.css',
    'registry-list-data-bridge.js',
    'registry-list-view.js',
    'registry-list-owner-guard.js',
    'registry-list-detail-dosage.js',
  ]) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hits = html.match(new RegExp(`${escaped}[^"']*rlv=${release}`, 'g')) || [];
    assert.equal(hits.length, 1, `${asset} must carry the shared Registry List release marker exactly once`);
  }
  assert.equal((html.match(/name="medindex-registry-list-release"/g) || []).length, 1,
    'the Registry List release identity must be declared exactly once');
}

// --- The CSS layer alone makes the screenshot state impossible -------------

{
  assert.match(css,
    /html\[data-mi-page="barnat"\]\[data-mi-registry-view="list"\][\s\S]*#registryViewToolbar[\s\S]*display:\s*none\s*!important/,
    'List mode must hard-hide the table-only toolbar');
  assert.match(css, /#registryContent,[\s\S]*#pagination[\s\S]*display:\s*none\s*!important/,
    'List mode must hard-hide table and pagination');
  assert.doesNotMatch(css, /#registryFilterPanel(?:\.[^{,\s]+)?\s*\{[^}]*display:\s*none\s*!important/i,
    'the shared search/filter surface must remain available');
}

// --- List data is no longer a full-table UI handoff -------------------------

{
  assert.match(listView, /medindex:registry-list-dataset-needed/,
    'List must request its dedicated dataset');
  assert.match(listView, /MEDINDEX_REGISTRY_LIST_ROWS/,
    'List must consume its own dataset namespace');
  assert.doesNotMatch(
    listView,
    /dispatchEvent\(new CustomEvent\('medindex:registry-full-dataset-needed'/,
    'List must never wake the full table runtime merely to obtain data',
  );

  assert.match(bridge, /view:'registry-browse-page'/);
  assert.match(bridge, /const PAGE_SIZE = 400/);
  assert.match(bridge, /const CONCURRENCY = 3/);
  assert.match(bridge, /validateRows\(rawRows, total\)/,
    'the assembled dataset must be validated before publication');
  assert.match(bridge, /__neonDrugId:clean\(row\?\.id\)/,
    'exact Neon UUID identity must survive the data-only bridge');
  assert.doesNotMatch(bridge, /medindex:request-full-registry|\/api\/registry(?:\?|['"`])/,
    'the bridge must never request or activate the legacy full registry runtime');

  assert.match(api, /REGISTRY_BROWSE_MAX_PAGE_SIZE = 500/,
    'the server browse endpoint must stay bounded');
  assert.match(api, /view === 'registry-browse-page'/,
    'the data-only route must exist');
  assert.match(api, /params\.set\('select', REGISTRY_DETAIL_SELECT\)/,
    'the browse route must use an explicit field projection');
  const browseStart = api.indexOf('function buildRegistryBrowsePagePath');
  const browseEnd = api.indexOf('function buildRegistryDetailPath', browseStart);
  assert.ok(browseStart >= 0 && browseEnd > browseStart, 'browse route block must be present');
  assert.doesNotMatch(api.slice(browseStart, browseEnd), /select[^\n]*['"]\*['"]/,
    'the browse route must never regress to SELECT *');
}

// --- Full-table controller itself relinquishes ownership --------------------

{
  assert.match(unified, /listOwnsRegistrySurface = \(\) => document\.documentElement\.dataset\.miRegistryView === 'list'/);
  assert.match(unified, /function reconcile\(\) \{[\s\S]*?if \(listOwnsRegistrySurface\(\)\)/,
    'table reconciliation must stop while List owns the surface');
  assert.match(unified, /function schedule\(\) \{[\s\S]*?if \(listOwnsRegistrySurface\(\)\)/,
    'table scheduling must stop while List owns the surface');
  assert.match(unified, /function observeTable\(\) \{[\s\S]*?if \(listOwnsRegistrySurface\(\)\)/,
    'table mutation observation must stop while List owns the surface');
  assert.match(unified, /function ensureShell\(\) \{[\s\S]*?if \(listOwnsRegistrySurface\(\)\)/,
    'table toolbar creation must stop while List owns the surface');
  assert.match(unified, /attributeFilter:\['data-mi-registry-view'\]/,
    'the table controller must deterministically resume on a real view transition');
}

// --- Exact screenshot race: toolbar arrives late while List is active -------

{
  class FakeElement {
    constructor(id = '') {
      this.id = id;
      this.hidden = false;
      this.inert = false;
      this.isConnected = true;
      this.attributes = new Map();
      this.parentElement = null;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
  }

  const root = new FakeElement('html');
  root.dataset = { miPage:'barnat', miRegistryView:'list' };
  const parent = new FakeElement('registry-parent');
  const table = new FakeElement('registryContent');
  table.parentElement = parent;
  const pagination = new FakeElement('pagination');
  const listPanel = new FakeElement('registryListView');
  const nodes = new Map([
    ['registryContent', table],
    ['pagination', pagination],
    ['registryListView', listPanel],
  ]);
  const observers = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.options = null;
      this.disconnected = false;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
      this.disconnected = false;
    }
    disconnect() { this.disconnected = true; }
  }

  const listeners = new Map();
  const sandbox = {
    console,
    HTMLElement:FakeElement,
    MutationObserver:FakeMutationObserver,
    requestAnimationFrame:callback => { callback(); return 0; },
    cancelAnimationFrame:() => {},
    document:{
      documentElement:root,
      readyState:'complete',
      getElementById:id => nodes.get(id) || null,
      addEventListener:() => {},
    },
    window:{
      matchMedia:() => ({ matches:true, addEventListener:() => {} }),
      addEventListener:(name, callback) => listeners.set(name, callback),
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(owner, sandbox, { filename:'registry-list-owner-guard.js' });

  assert.equal(root.dataset.registrySurfaceOwner, 'list', 'List must own the surface immediately');
  assert.equal(table.getAttribute('aria-hidden'), 'true', 'table is hidden semantically in List mode');

  // This is the original bug: the full-table toolbar is inserted only after
  // the List is already visible. The parent observer must suppress it at once.
  const lateToolbar = new FakeElement('registryViewToolbar');
  nodes.set('registryViewToolbar', lateToolbar);
  const parentObserver = observers.find(item => item.target === parent && item.options?.childList);
  assert.ok(parentObserver, 'a narrow registry-parent observer must exist');
  parentObserver.callback([{ type:'childList', target:parent }]);

  assert.equal(lateToolbar.hidden, true, 'a late table toolbar must never become visible in List mode');
  assert.equal(lateToolbar.inert, true, 'a late table toolbar must never be interactive in List mode');
  assert.equal(lateToolbar.getAttribute('aria-hidden'), 'true', 'a late table toolbar must be hidden from assistive technology');

  // Returning to Table must restore the same toolbar, not leave the app stuck.
  root.dataset.miRegistryView = 'table';
  const rootObserver = observers.find(item => item.target === root && item.options?.attributes);
  assert.ok(rootObserver, 'a root view-state observer must exist');
  rootObserver.callback([{ type:'attributes', attributeName:'data-mi-registry-view', target:root }]);

  assert.equal(root.dataset.registrySurfaceOwner, 'table');
  assert.equal(lateToolbar.hidden, false, 'Table mode must restore its toolbar');
  assert.equal(lateToolbar.inert, false, 'Table mode must restore interaction');
  assert.equal(lateToolbar.getAttribute('aria-hidden'), 'false');

  // And a second Table → List transition must remain deterministic.
  root.dataset.miRegistryView = 'list';
  rootObserver.callback([{ type:'attributes', attributeName:'data-mi-registry-view', target:root }]);
  assert.equal(lateToolbar.hidden, true, 'Table → List → Table → List must remain single-owner');
}

// --- Bridge identity and completeness guards without a network request ------

{
  const root = { dataset:{ miPage:'barnat', miRegistryView:'list' } };
  class NoopMutationObserver { constructor() {} observe() {} disconnect() {} }
  const sandbox = {
    console,
    document:{ documentElement:root },
    MutationObserver:NoopMutationObserver,
    URLSearchParams,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    window:{
      addEventListener:() => {},
      setTimeout,
      clearTimeout,
      dispatchEvent:() => {},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(bridge, sandbox, { filename:'registry-list-data-bridge.js' });
  const test = sandbox.window.MedIndexRegistryListData?._test;
  assert.ok(test, 'the List data bridge must expose its bounded test surface');

  const id1 = '11111111-1111-4111-8111-111111111111';
  const id2 = '22222222-2222-4222-8222-222222222222';
  const canonical = test.canonicalRow({
    id:id1, registryNumber:7, tradeName:'Test', activeSubstance:'Substancë',
    strength:'10 mg', form:'Tabletë',
  });
  assert.equal(canonical.__neonDrugId, id1, 'canonical List rows must preserve exact UUID identity');
  assert.equal(canonical['Nr rendor'], 7);
  assert.equal(canonical['Emri tregtar'], 'Test');

  const url = test.pageUrl(1, true);
  assert.match(url, /view=registry-browse-page/);
  assert.match(url, /pageSize=400/);
  assert.match(url, /includeTotal=1/);

  assert.doesNotThrow(() => test.validateRows([{ id:id1 }, { id:id2 }], 2));
  assert.throws(() => test.validateRows([{ id:id1 }, { id:id1 }], 2), /dyfishuar/,
    'duplicate UUIDs must fail closed');
  assert.throws(() => test.validateRows([{ id:'not-a-uuid' }], 1), /UUID stabile/,
    'missing stable identity must fail closed');
  assert.throws(() => test.validateRows([{ id:id1 }], 2), /jo i plotë/,
    'an incomplete List dataset must never be published as complete');
}

console.log('Registry List single-owner regression gate passed: late-toolbar race, data-only handoff, controller ownership, identity and cache-release contracts are stable.');
