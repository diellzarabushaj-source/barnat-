'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const LOADER_VERSION = 'registry-runtime-loader-v9';
const LOADER_ASSET_VERSION = '20260813-9';

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
    throw new Error('Phase 1 prebuild did not activate the v9 loader cache-bust.');
  }
  write('index.html', source);
}

function verifyLoader() {
  const source = read('registry-runtime-loader.js');
  if (!source.includes(`const VERSION = '${LOADER_VERSION}';`)) {
    throw new Error('Phase 1 prebuild requires registry-runtime-loader-v9.');
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
verifyLoader();
console.log(`Phase 1 prebuild activated ${LOADER_VERSION} with asset version ${LOADER_ASSET_VERSION} before offline-shell generation.`);
