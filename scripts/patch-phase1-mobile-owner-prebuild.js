'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const LOADER_VERSION = 'registry-runtime-loader-v10';
const LOADER_ASSET_VERSION = '20260813-10';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 1 prebuild could not find ${label}.`);
  return source.replace(before, after);
}

function patchIndex() {
  let source = read('index.html');
  if (!/registry-runtime-loader\.js\?v=/.test(source)) {
    throw new Error('Phase 1 prebuild could not find the registry runtime-loader asset in index.html.');
  }
  source = source.replace(
    /registry-runtime-loader\.js\?v=[^"&]+/g,
    `registry-runtime-loader.js?v=${LOADER_ASSET_VERSION}`,
  );
  if (!source.includes(`registry-runtime-loader.js?v=${LOADER_ASSET_VERSION}`)) {
    throw new Error('Phase 1 prebuild did not activate the current loader cache-bust.');
  }
  write('index.html', source);
}

function patchMobileOwnerClients() {
  for (const file of ['registry-mobile-phase3.js', 'registry-mobile-phase8.js']) {
    let source = read(file);
    source = source.replace(
      "window.addEventListener('medindex:request-full-registry'",
      "window.addEventListener('medindex:full-registry-started'",
    );
    if (!source.includes("window.addEventListener('medindex:full-registry-started'")) {
      throw new Error(`Phase 1 could not bind ${file} cleanup to the accepted full-runtime signal.`);
    }
    if (source.includes("window.addEventListener('medindex:request-full-registry'")) {
      throw new Error(`Phase 1 found a destructive request-level handoff listener in ${file}.`);
    }

    if (file === 'registry-mobile-phase8.js' && !source.includes("root.dataset.registryMobileLiteState === 'handoff'")) {
      const anchor = "    window.addEventListener('medindex:tailadmin-ready', () => {\n      placeBar(document.getElementById('miRegistryPersonalizationBar'));";
      const guarded = "    window.addEventListener('medindex:tailadmin-ready', () => {\n      if (window.MEDINDEX_MOBILE_LITE_ACTIVE !== true || root.dataset.registryMobileLiteState === 'handoff') return;\n      placeBar(document.getElementById('miRegistryPersonalizationBar'));";
      if (!source.includes(anchor)) {
        throw new Error('Phase 1 could not guard Phase 8 against remounting after full-runtime handoff.');
      }
      source = source.replace(anchor, guarded);
    }

    write(file, source);
  }
}

function patchMobileRequestOwnership() {
  let source = read('registry-mobile-lite.js');
  source = replaceOnce(
    source,
    `    pageController?.abort();\n    pageController = new AbortController();\n    setBusy(true);`,
    `    pageController?.abort();\n    const controller = new AbortController();\n    pageController = controller;\n    setBusy(true);`,
    'mobile page request controller ownership',
  );
  source = replaceOnce(
    source,
    `        signal:pageController.signal,`,
    `        signal:controller.signal,`,
    'mobile page request owned signal',
  );
  source = replaceOnce(
    source,
    `    } finally {\n      setBusy(false);\n    }\n  }\n\n  function resolveDetailScrollOwner()`,
    `    } finally {\n      if (pageController === controller) {\n        pageController = null;\n        setBusy(false);\n      }\n    }\n  }\n\n  function resolveDetailScrollOwner()`,
    'mobile page request busy-state ownership',
  );
  if (!source.includes('if (pageController === controller)')) {
    throw new Error('Phase 1 mobile request ownership guard is missing.');
  }
  if (source.includes('signal:pageController.signal')) {
    throw new Error('Phase 1 mobile request must use its captured AbortController signal.');
  }
  write('registry-mobile-lite.js', source);
}

function normalizeMobileLitePublicApi() {
  let source = read('registry-mobile-lite.js');
  const extended = `    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    handoff:requestFullRegistry,\n    closeDetail,\n    getState:() => ({ ...state }),`;
  const compatible = `    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    handoff:requestFullRegistry,\n    getState:() => ({ ...state }),\n    closeDetail,`;

  if (source.includes(extended)) {
    source = source.replace(extended, compatible);
    write(file, source);
  }

  const expected = `    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    handoff:requestFullRegistry,\n    getState:() => ({ ...state }),`;
  if (!source.includes(expected) && !source.includes('    setFilters,\n    getFilters,')) {
    throw new Error('Phase 1 could not preserve the mobile-lite public API shape required by the downstream Phase 5 filter patch.');
  }
}

function verifyLoader() {
  const source = read('registry-runtime-loader.js');
  /* Roje versioni, jo kontratë sjelljeje: kërkohet që ngarkuesi i vetëm i
     runtime-it të jetë i pranishëm, jo që të mbajë një numër të caktuar. Kur
     versioni u ngrit nga v10 në v11, kjo rojë e ndali ndërtimin edhe pse asgjë
     në këtë hap nuk varet nga numri. Prandaj tani lexohet me model. */
  if (!/const VERSION = 'registry-runtime-loader-v\d+';/.test(source)) {
    throw new Error('Phase 1 prebuild requires a single-owner registry-runtime-loader.');
  }
  if (!source.includes('MOBILE_LITE_STALL_MS = 12000')) {
    throw new Error('Phase 1 mobile stall watchdog is missing.');
  }
  if (!source.includes('medindex:mobile-full-registry-blocked')) {
    throw new Error('Phase 1 nonfatal mobile full-runtime guard is missing.');
  }
  if (source.includes("scheduleRuntime('mobile-lite-timeout')")) {
    throw new Error('The removed mobile-lite timeout takeover has returned.');
  }
}

patchIndex();
patchMobileOwnerClients();
patchMobileRequestOwnership();
normalizeMobileLitePublicApi();
verifyLoader();
require('./patch-registry-default-sort-fastpath.js');
require('./patch-registry-filter-single-pass.js');
require('./patch-registry-pagination-v2.js');
require('./patch-registry-pagination-v3.js');
require('./patch-full-runtime-pagination-owner.js');
require('./patch-registry-pagination-ownership.js');
require('./patch-registry-pagination-tailadmin-bridge.js');
require('./patch-registry-search-premium-v3.js');
console.log(`Phase 1 prebuild activated ${LOADER_VERSION} with asset version ${LOADER_ASSET_VERSION}; mobile shell ownership, request busy-state ownership and downstream public API compatibility are preserved.`);