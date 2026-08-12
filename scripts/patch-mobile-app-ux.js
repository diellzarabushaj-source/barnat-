'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const clinicalPages = [
  'index.html',
  'klasifikimi.html',
  'icd.html',
  'analizat.html',
  'dozologjia.html',
  'protokollet.html',
  'recetat.html',
];
const NAV_TAG = '<script src="mobile-app-navigation.js?v=20260812-1" defer></script>';
const FILTER_TAG = '<script src="registry-mobile-filters.js?v=20260812-1" defer></script>';
const STATE_TAG = '<script src="registry-mobile-state.js?v=20260812-1" defer></script>';

function injectOnce(source, tag, anchor = '</body>') {
  if (source.includes(tag)) return source;
  if (!source.includes(anchor)) throw new Error(`Anchor missing: ${anchor}`);
  return source.replace(anchor, `${tag}\n${anchor}`);
}

for (const page of clinicalPages) {
  const file = path.join(root, page);
  let source = fs.readFileSync(file, 'utf8');
  source = injectOnce(source, NAV_TAG);
  if (page === 'index.html') {
    const serverTagMatch = source.match(/<script src="registry-mobile-server\.js\?v=[^"]+" defer><\/script>/);
    if (!serverTagMatch) throw new Error('index.html: registry mobile server script missing');
    if (!source.includes(FILTER_TAG)) source = source.replace(serverTagMatch[0], `${serverTagMatch[0]}\n${FILTER_TAG}\n${STATE_TAG}`);
    else if (!source.includes(STATE_TAG)) source = source.replace(FILTER_TAG, `${FILTER_TAG}\n${STATE_TAG}`);
  }
  fs.writeFileSync(file, source, 'utf8');
}

console.log(`Injected mobile app navigation into ${clinicalPages.length} clinical pages and registry filters/state into index.html.`);
