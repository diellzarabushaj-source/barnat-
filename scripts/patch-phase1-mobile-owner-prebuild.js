'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const LOADER_VERSION = 'registry-runtime-loader-v10';
const LOADER_ASSET_VERSION = '20260813-10';

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

function verifyLoader() {
  const source = read('registry-runtime-loader.js');
  if (!source.includes(`const VERSION = '${LOADER_VERSION}';`)) {
    throw new Error(`Phase 1 prebuild requires ${LOADER_VERSION}.`);
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
verifyLoader();
console.log(`Phase 1 prebuild activated ${LOADER_VERSION} with asset version ${LOADER_ASSET_VERSION}; mobile shell clients now release ownership only after the canonical full runtime starts.`);