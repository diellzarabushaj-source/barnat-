'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-desktop-lite.js');
const MARKER = 'registry-personal-cache-policy-v1';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(`${MARKER}: server-authorized private cache`)) {
  const before = "      method:'POST', credentials:'same-origin', cache:'no-store', signal,";
  const after = [
    `      // ${MARKER}: server-authorized private cache`,
    "      // Let the authenticated endpoint's Cache-Control decide whether the",
    "      // personal response is cacheable. It currently returns private,no-store,",
    "      // so personal Favorites/Notes remain uncached without browser bypasses.",
    "      method:'POST', credentials:'same-origin', cache:'default', signal,",
  ].join('\n');

  const at = source.indexOf(before);
  if (at < 0) throw new Error(`${MARKER}: personal request cache anchor not found.`);
  if (source.indexOf(before, at + before.length) >= 0) {
    throw new Error(`${MARKER}: personal request cache anchor is ambiguous.`);
  }
  source = source.slice(0, at) + after + source.slice(at + before.length);
}

if (!source.includes("method:'POST', credentials:'same-origin', cache:'default', signal,")) {
  throw new Error(`${MARKER}: personal request does not honor the default/server cache policy.`);
}
if (source.includes("method:'POST', credentials:'same-origin', cache:'no-store', signal,")) {
  throw new Error(`${MARKER}: personal request still bypasses the server-authorized cache policy.`);
}

fs.writeFileSync(FILE, source, 'utf8');
console.log('Personal registry cache policy aligned: browser honors server Cache-Control; Favorites/Notes remain private no-store at the endpoint.');
