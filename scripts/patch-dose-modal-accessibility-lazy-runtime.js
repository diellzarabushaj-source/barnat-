'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const LOADER_SRC = 'registry-dose-modal-accessibility-loader.js?v=dose-modal-accessibility-lazy-v1';
const MARKER = 'dose-modal-accessibility-lazy-v1';

let html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');
const directPattern = /<script\s+src="(registry-dose-modal-accessibility\.js[^\"]*)"\s+defer><\/script>/;
const existingLoaderPattern = /<script\s+src="registry-dose-modal-accessibility-loader\.js[^\"]*"[^>]*><\/script>/;

if (!existingLoaderPattern.test(html)) {
  const match = html.match(directPattern);
  if (!match) throw new Error('Dose modal accessibility lazy patch could not find the direct runtime tag.');
  const runtimeSrc = match[1];
  const loaderTag = `<script src="${LOADER_SRC}" data-dose-modal-accessibility-runtime="${runtimeSrc}" defer></script>`;
  html = html.replace(match[0], loaderTag);
}

if (directPattern.test(html)) {
  throw new Error('Dose modal accessibility runtime must not remain in the startup script path.');
}
if (!html.includes(MARKER) || !/data-dose-modal-accessibility-runtime="registry-dose-modal-accessibility\.js\?[^\"]+"/.test(html)) {
  throw new Error('Dose modal accessibility lazy loader lost its runtime handoff contract.');
}

const calculatorIndex = html.indexOf('registry-dose-calculator.js');
const loaderIndex = html.indexOf('registry-dose-modal-accessibility-loader.js');
if (calculatorIndex < 0 || loaderIndex < 0 || loaderIndex <= calculatorIndex) {
  throw new Error('Dose modal accessibility loader must remain after the dose calculator script and intercept clicks in capture phase.');
}

fs.writeFileSync(INDEX, html, 'utf8');

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'dose-modal-accessibility-lazy-runtime-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});

console.log('Dose modal accessibility startup cleanup applied: focus trap/restore runtime now loads only on the first calculator interaction.');
