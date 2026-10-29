'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const sharedLoader = read('sidebar-taxonomy-v3.js');
// The loader owns the Antibiotikët nav entry and pulls in the canonical core,
// which owns the taxonomy, the worker cutover and the personal counts.
const shared = read('sidebar-taxonomy-core-v3.js');
const runtimeAssetManifest = JSON.parse(read('runtime-asset-manifest.json'));
const sidebarRelease = 'sidebar-taxonomy-v9-worker-ready-20261012';
for (const [page, assets] of Object.entries(runtimeAssetManifest)) {
  assert.equal(assets['sidebar-taxonomy-v3.js'], sidebarRelease, `${page}: the manifest must preserve the new shared sidebar release during build`);
  assert.ok(read(page).includes(`/sidebar-taxonomy-v3.js?v=${sidebarRelease}`), `${page}: the versioned sidebar loader is missing`);
}
assert.ok(sharedLoader.includes(`/sidebar-taxonomy-core-v3.js?v=${sidebarRelease}`), 'The loader must use the corresponding exact-url core release');
const icdSidebar = read('icd-sidebar-v3.js');
const shell = read('tailadmin-shell.js');
const shellCore = read('tailadmin-shell-core.js');
const stripe = read('drx-dashboard-stripe.css');
const hubCss = read('medical-hub-v2.css');
const hubRxCss = read('medical-hub-rx-source-v1.css');
const brucellosisOverride = JSON.parse(read('medical-hub-overrides/medicalhub-dod-ch05-sub07.json'));

assert.doesNotThrow(() => new Function(sharedLoader));
assert.doesNotThrow(() => new Function(shared));
assert.match(sharedLoader, /CORE_SRC = '\/sidebar-taxonomy-core-v3\.js\?v=/, 'the sidebar loader must pull in the canonical core');
assert.match(sharedLoader, /ANTIBIOTICS_HREF = '\/antibiotiket\.html'/, 'the loader owns the Antibiotikët nav entry');
assert.match(sharedLoader, /HUB_OVERRIDE_ID = 'medicalhub-dod-ch05-sub07'/, 'the temporary Brucellosis source override must stay narrowly scoped');
assert.match(sharedLoader, /sanity-published\+book-source-override/, 'the Medical Hub response must identify when the source override is active');
assert.match(sharedLoader, /decorateBrucellosisRx/, 'Brucellosis source connectors must be decorated after render');
assert.equal(brucellosisOverride._id, 'medicalhub-dod-ch05-sub07');
assert.equal(brucellosisOverride.sourceRxTitle, 'TRAJTIMI I BRUCELOZËS');
const brucellosisRx = brucellosisOverride.steps.filter(step => step.priority === 'rx-source');
assert.equal(brucellosisRx.length, 2, 'the source has two distinct treatment blocks: uncomplicated and complicated/focal');
assert.match(brucellosisRx[0].title, /PAKOMPLIKUAR/);
assert.match(brucellosisRx[0].action, /PLUS Inj\. Streptomycin 1 g/);
assert.match(brucellosisRx[0].action, /OSE Inj\. Gentamicin 40 mg\/ml/);
assert.match(brucellosisRx[0].action, /OSE Tab\. Rifampicin 300 mg/);
assert.match(brucellosisRx[1].title, /KOMPLIKUAR/);
assert.match(brucellosisRx[1].action, /PLUS Tab\. Rifampicin 300 mg/);
assert.match(brucellosisRx[1].action, /PLUS Inj\. Streptomycin 1 g/);
assert.match(brucellosisRx[1].action, /PËR NEUROBRUCELOZË: Inj\. Ceftriaxone/);
assert.match(hubCss, /medical-hub-rx-source-v1\.css\?v=4/);
assert.match(hubRxCss, /\.ck-book-rx-line\.is-source-connector/);
assert.match(hubRxCss, /\.ck-book-rx-line\.is-source-neuro/);
assert.doesNotThrow(() => new Function(icdSidebar));
assert.doesNotThrow(() => new Function(shell));
assert.doesNotThrow(() => new Function(shellCore));

assert.match(shared, /\/api\/icd\?view=nav/);
assert.match(shared, /id = 'icdNavGroup'|id='icdNavGroup'|details\.id = 'icdNavGroup'/);
assert.match(shared, /class="atc-group-link"/);
assert.match(shared, /class="atc-group-code"/);
assert.match(shared, /class="atc-group-name"/);
assert.match(shared, /Të gjithë kapitujt/);
assert.match(shared, /22/);
assert.match(shared, /data-icd-chapter/);
assert.match(shared, /canonicalize\(nav\)/);
assert.match(shared, /classification-data\.js\?v=atc-catalog-v2/);
assert.match(shared, /function enhanceAtc\(nav\)/);
assert.match(shared, /function syncAtc\(/);
assert.match(shared, /data-atc-details/);
assert.match(shared, /data-atc-sub/);
assert.match(shared, /class="atc-sub-list"/);
assert.match(shared, /class="atc-sub-link"/);
assert.match(shared, /other\.open = false/);
assert.match(shared, /window\.DRxSidebarTaxonomy/);
assert.match(shared, /CANONICAL_WORKER_URL = '\/sw\.js\?v=drx-workspace-v9-app-cache'/);
assert.match(shared, /navigator\.serviceWorker\.register\(CANONICAL_WORKER_URL/);
assert.match(shared, /updateViaCache:'none'/);
assert.match(shared, /dataset\.drxSidebarStructure = 'taxonomy-v5'/);
assert.match(shared, /PERSONAL_SUMMARY_API = '\/api\/user-library\?view=summary'/);
assert.match(shared, /syncPersonalCounts\(nav/);
assert.match(shared, /find\('\/index\.html#favorites'\), find\('\/index\.html#notes'\), find\('\/recetat\.html'\)/);

assert.match(icdSidebar, /\/api\/icd\?view=nav/);
assert.match(icdSidebar, /mi-atc-menu mi-icd-menu-shared/);
assert.match(icdSidebar, /mi-atc-subcategory-link/);
assert.match(icdSidebar, /Të gjithë kapitujt/);
assert.match(icdSidebar, /data-mi-icd-chapter/);

assert.match(shell, /ICD_NAV_SRC = '\/icd-sidebar-v3\.js\?v=icd-sidebar-v3'/);
assert.match(shell, /function loadIcdNavigation\(\)/);
assert.match(shell, /loadIcdNavigation\(\)/);

const order = [
  "label:'Barnat'",
  "label:'Klasifikimi ATC'",
  "label:'ICD‑10'",
  "label:'Dozologjia'",
  "label:'Protokollet'",
  "label:'Urgjencat'",
  "label:'Recetat'",
  "label:'Analizat'",
  "label:'Medical Hub'",
];
let cursor = -1;
for (const marker of order) {
  const next = shellCore.indexOf(marker, cursor + 1);
  assert.ok(next > cursor, `Sidebar order mismatch at ${marker}`);
  cursor = next;
}
assert.match(shellCore, />KLINIKE<\/p>/);
assert.match(shellCore, />PUNA IME<\/p>/);

const sidebarVersionForRuntime = file => file === 'recetat-v2.js'
  ? 'sidebar-taxonomy-v5'
  : 'sidebar-taxonomy-v4';

for (const file of ['registry-v2.js','classification-v2.js','icd-v2.js','dozologjia-v2.js','urgjencat-v2.js','analizat-v2.js','protokollet-v2.js','recetat-v2.js','medical-hub-v2.js','sistemi-v2.js']) {
  const source = read(file);
  const version = sidebarVersionForRuntime(file);
  assert.match(source, /function loadSharedSidebarTaxonomy\(\)/, `${file}: shared sidebar loader missing`);
  assert.match(source, new RegExp(`sidebar-taxonomy-v3\\.js\\?v=${version}`), `${file}: shared sidebar runtime missing`);
}

for (const [file, runtime] of [
  ['index.html','registry-v2.js'],
  ['klasifikimi.html','classification-v2.js'],
  ['icd.html','icd-v2.js'],
]) {
  const html = read(file);
  assert.match(html, new RegExp(runtime.replace('.', '\\.') + '\\?(?:v|build)=[^"\\s]+'), `${file}: V2 runtime cache-bust missing`);
}
for (const [htmlFile, runtime, version] of [
  ['dozologjia.html','dozologjia-v2.js','dynamic-v4+'],
  ['urgjencat.html','urgjencat-v2.js','11'],
  ['analizat.html','analizat-v2.js','3'],
  ['protokollet.html','protokollet-v2.js','2'],
  ['recetat.html','recetat-v2.js','dynamic'],
  ['medical-hub.html','medical-hub-v2.js','dynamic'],
  ['sistemi.html','sistemi-v2.js','2'],
]) {
  const html = read(htmlFile);
  const js = read(runtime);
  const runtimeVersionPattern = version === 'dynamic' || version === 'dynamic-v4+'
    ? new RegExp(runtime.replace('.', '\\.') + '\\?v=\\d+')
    : new RegExp(runtime.replace('.', '\\.') + '\\?v=' + version);
  assert.match(html, runtimeVersionPattern, `${htmlFile}: standalone V2 runtime missing`);
  if (version === 'dynamic-v4+') {
    const match = html.match(new RegExp(runtime.replace('.', '\\.') + '\\?v=(\\d+)'));
    assert.ok(match && Number(match[1]) >= 4, `${htmlFile}: runtime version must not regress below v4`);
  }
  const sidebarVersion = sidebarVersionForRuntime(runtime);
  assert.match(js, new RegExp(`sidebar-taxonomy-v3\\.js\\?v=${sidebarVersion}`), `${runtime}: shared taxonomy loader missing`);
}

for (const file of ['index.html','klasifikimi.html','icd.html','dozologjia.html','urgjencat.html','analizat.html','protokollet.html','recetat.html','medical-hub.html','sistemi.html']) {
  const html = read(file);
  assert.match(html, /drx-unified-sidebar/, `${file}: unified standalone sidebar marker missing`);
  assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v8/, `${file}: shared Stripe sidebar authority missing`);
  assert.match(html, /href="\/index\.html#favorites"[^>]*data-personal-nav="favorites"/, `${file}: Favorites navigation missing`);
  assert.match(html, /href="\/index\.html#notes"[^>]*data-personal-nav="notes"/, `${file}: Notes navigation missing`);
}

assert.match(stripe, /Shared taxonomy sidebar — ATC and ICD use one identical navy language/);
assert.match(stripe, /#appMenu :is\(\.mi-atc-root-panel,\.mi-atc-submenu\)/);
assert.match(stripe, /Canonical sidebar taxonomy depth — ATC groups\/subgroups/);
assert.match(stripe, /\.drx-unified-sidebar \.atc-sub-link/);
assert.match(stripe, /\.nav-count/);

const classificationHtml = read('klasifikimi.html');
const classificationJs = read('classification-v2.js');
const classificationCss = read('classification-v2.css');
assert.doesNotMatch(classificationHtml, /id="groupList"|class="group-panel"|id="groupCount"|id="atcStatusMeta"/);
assert.doesNotMatch(classificationJs, /el\.groupList|el\.groupCount|el\.atcStatusMeta|function renderGroups\(/);
assert.doesNotMatch(classificationCss, /\.group-panel|\.group-list|\.group-row/);
assert.match(classificationJs, /window\.DRxSidebarTaxonomy\?\.syncAtc\?\.\(\)/);
assert.match(classificationJs, /if \(!hadGroup\) writeHash/);

async function verifyDeviceReachability() {
  // Execute the real device and renewal owners together. Wi-Fi can remain
  // connected while the origin is unreachable, and return without an online
  // event; a cached session must never stand in for a reconnect probe.
  const start = shared.indexOf('  function initDeviceExperience() {');
  const end = shared.indexOf('\n  function init() {', start);
  assert.ok(start >= 0 && end > start, 'Device owners must remain available for the behavior fixture');
  const listeners = new Map();
  const listen = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  };
  const nodes = [];
  const element = () => {
    const children = new Map();
    const node = { dataset:{}, hidden:false, textContent:'', attributes:{},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener() {}, focus() {}, prepend() {}, append() {}, contains() { return false; },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      },
    };
    nodes.push(node);
    return node;
  };
  const host = element();
  const messages = [], requests = [];
  let available = false, responseStatus = 200, responseOffline = false;
  const scope = {
    AbortSignal, CustomEvent:class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    navigator:{ onLine:true, serviceWorker:{ controller:{ postMessage(message) { messages.push(message); } }, addEventListener() {}, ready:new Promise(() => {}) } },
    document:{ hidden:false, createElement:element,
      getElementById(id) { return nodes.find(node => node.id === id); },
      querySelector() { return host; }, addEventListener:listen,
    },
    location:{ href:'https://device.example/index.html', origin:'https://device.example' }, URL,
    window:{ DRxDeviceReachable:false, addEventListener:listen, setInterval() {},
      dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
      async fetch(url, options) {
        requests.push({url, options});
        if (!available) throw new TypeError('Origin unreachable');
        return { ok:responseStatus === 200, status:responseStatus, async json() { return { authenticated:responseStatus === 200, offline:responseOffline }; } };
      },
    },
  };
  vm.runInNewContext(shared.slice(start, end) + '\ninitSessionRenewal(); initDeviceExperience();', scope);
  const status = nodes.find(node => node.id === 'drxDeviceStatus');
  const latestOnline = () => messages.at(-1)?.online;
  assert.equal(status.textContent, 'Pa internet');
  assert.equal(status.dataset.offline, 'true');
  assert.equal(latestOnline(), false, 'An unreachable origin must also put the worker offline while navigator.onLine is true');
  const emit = type => scope.window.dispatchEvent({type});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  emit('pageshow'); emit('pageshow'); emit('visibilitychange');
  await settle();
  assert.equal(requests.length, 1, 'Concurrent resume signals must share one bounded probe');
  assert.equal(requests[0].url, '/api/auth?offline_probe=1');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.ok(requests[0].options.signal instanceof AbortSignal, 'Reconnect requests retain their timeout');
  assert.equal(status.textContent, 'Pa internet', 'A failed probe must keep the offline copy available');
  assert.equal(latestOnline(), false);

  available = true;
  responseOffline = true;
  emit('pageshow');
  await settle();
  assert.equal(latestOnline(), false, 'A sanitized offline session must never prove network recovery');
  assert.equal(status.textContent, 'Pa internet');
  responseOffline = false;
  emit('pageshow');
  await settle();
  assert.equal(requests.at(-1).url, '/api/auth?offline_probe=1', 'Same-Wi-Fi recovery must bypass the offline auth lease');
  assert.equal(scope.window.DRxDeviceReachable, true);
  assert.equal(status.textContent, 'Online');
  assert.equal(status.dataset.offline, 'false');
  assert.equal(latestOnline(), true, 'Recovered UI and worker must share their effective online state');
  emit('pageshow');
  await settle();
  assert.equal(requests.at(-1).url, '/api/auth', 'Normal renewal must resume after a confirmed reconnect');

  scope.navigator.onLine = false;
  emit('offline');
  assert.equal(status.textContent, 'Pa internet');
  assert.equal(latestOnline(), false);
  scope.navigator.onLine = true;
  emit('online');
  await settle();
  assert.equal(status.textContent, 'Online', 'Explicit physical reconnect remains available');
  assert.equal(latestOnline(), true);

  scope.window.DRxDeviceReachable = false;
  scope.window.dispatchEvent(new scope.CustomEvent('drx:device-network', {detail:{online:false}}));
  responseStatus = 503;
  emit('pageshow');
  await settle();
  assert.equal(status.textContent, 'Pa internet', 'An unavailable auth server must not confirm recovery');
  assert.equal(latestOnline(), false);
  responseStatus = 403;
  emit('pageshow');
  await settle();
  assert.equal(latestOnline(), true, 'A reachable but forbidden auth response confirms connectivity without authentication');
  assert.equal(status.textContent, 'Online');
}

verifyDeviceReachability().then(() => {
  console.log('Shared sidebar taxonomy v3: ATC + ICD nesting, strict runtime versions, Brucellosis source override, canonical page order and offline/reconnect behavior passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
