'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const LOADER_SRC = 'registry-dose-interaction-loader.js?v=20260814-1';
const INSULIN_STYLES = Object.freeze([
  'registry-novorapid-simple-calculator.css',
  'registry-novomix30-simple-calculator.css',
  'registry-other-insulins-simple-calculator.css',
]);
const INSULIN_SCRIPTS = Object.freeze([
  'registry-novorapid-simple-calculator.js',
  'registry-novomix30-simple-calculator.js',
  'registry-other-insulins-simple-calculator.js',
  'registry-insulin-final-safety.js',
]);

let source = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeStaticStyle(asset) {
  const pattern = new RegExp(`^[ \\t]*<link\\s+[^>]*href="${escapeRegExp(asset)}[^\"]*"[^>]*>\\n?`, 'm');
  source = source.replace(pattern, '');
}

function removeStaticScript(asset) {
  const pattern = new RegExp(`^[ \\t]*<script\\s+[^>]*src="${escapeRegExp(asset)}[^\"]*"[^>]*><\\/script>\\n?`, 'm');
  source = source.replace(pattern, '');
}

INSULIN_STYLES.forEach(removeStaticStyle);
INSULIN_SCRIPTS.forEach(removeStaticScript);

const rowBridgePattern = /<script src="registry-insulin-row-bridge\.js\?[^\"]+" defer><\/script>/;
const rowBridge = source.match(rowBridgePattern)?.[0] || '';
if (!rowBridge) throw new Error('Phase 15 lazy dose runtime patch could not find the insulin row bridge anchor.');

const buildQuery = rowBridge.match(/&build=[^\"]+/)?.[0] || '';
const loaderTag = `<script src="${LOADER_SRC}${buildQuery}" defer></script>`;
const existingLoaderPattern = /<script src="registry-dose-interaction-loader\.js\?[^\"]+" defer><\/script>/;
if (existingLoaderPattern.test(source)) source = source.replace(existingLoaderPattern, loaderTag);
else source = source.replace(rowBridge, `${loaderTag}\n${rowBridge}`);

for (const asset of INSULIN_STYLES) {
  const staticPattern = new RegExp(`<link\\s+[^>]*href="${escapeRegExp(asset)}[^\"]*"`, 'i');
  if (staticPattern.test(source)) throw new Error(`Phase 15 must not statically load ${asset}.`);
}
for (const asset of INSULIN_SCRIPTS) {
  const staticPattern = new RegExp(`<script\\s+[^>]*src="${escapeRegExp(asset)}[^\"]*"`, 'i');
  if (staticPattern.test(source)) throw new Error(`Phase 15 must not statically load ${asset}.`);
}
if (!source.includes('registry-insulin-row-bridge.js')) {
  throw new Error('Phase 15 must keep the insulin row bridge in the startup path so visible Smart Insulin controls remain unchanged.');
}
if (!source.includes('registry-insulin-deep-audit.css')) {
  throw new Error('Phase 15 must keep the visible Smart Insulin table styling in the startup path.');
}
if (source.indexOf('registry-dose-interaction-loader.js') > source.indexOf('registry-insulin-row-bridge.js')) {
  throw new Error('Phase 15 interaction loader must initialize before the insulin row bridge.');
}

fs.writeFileSync(INDEX, source, 'utf8');
console.log('Phase 15 lazy dose runtime: insulin modal CSS/JS is interaction-gated while visible table controls stay eager.');
