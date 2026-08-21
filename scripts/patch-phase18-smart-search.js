'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'registry-desktop-lite.js');
const SUGGEST = path.join(ROOT, 'registry-search-suggest.js');
const API = path.join(ROOT, 'api', 'drug-search.js');
const INDEX = path.join(ROOT, 'index.html');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}
function write(file, source) {
  fs.writeFileSync(file, source, 'utf8');
}

function tightenDesktopDebounce(source) {
  if (source.includes('const SEARCH_DEBOUNCE_MS = 80;')) return source;
  for (const value of [250, 180]) {
    const anchor = `const SEARCH_DEBOUNCE_MS = ${value};`;
    if (source.includes(anchor)) return source.replace(anchor, 'const SEARCH_DEBOUNCE_MS = 80;');
  }
  if (source.includes('const DEBOUNCE_MS = 320;')) {
    return source.replace('const DEBOUNCE_MS = 320;', 'const DEBOUNCE_MS = 80;');
  }
  throw new Error('Phase 18 could not find the desktop search debounce contract.');
}

let desktop = tightenDesktopDebounce(read(DESKTOP));
write(DESKTOP, desktop);
desktop = read(DESKTOP);
if (!/const (?:SEARCH_)?DEBOUNCE_MS = 80;/.test(desktop)) {
  throw new Error('Phase 18 desktop search must start after an 80ms debounce.');
}
if (desktop.includes('SEARCH_DEBOUNCE_MS') && !desktop.includes('includeTotal:false')) {
  throw new Error('Phase 18 indexed desktop search must not wait for an exact total count.');
}
if (!/AbortController|\.abort\(\)/.test(desktop)) {
  throw new Error('Phase 18 desktop search must cancel stale requests.');
}

const api = read(API);
if (desktop.includes('SEARCH_DEBOUNCE_MS')) {
  for (const required of ['registry_search_text', 'global_search_text']) {
    if (!api.includes(required)) throw new Error(`Phase 18 requires indexed ${required}.`);
  }
}

const suggest = read(SUGGEST);
for (const required of [
  "version:'registry-search-suggest-v2'",
  'const DEBOUNCE_MS = 36;',
  "const API = '/api/drug-search';",
  'const REMOTE_CACHE_LIMIT = 64;',
  'function abortRemote()',
  'function editDistance(',
  'function fuzzySuggestions(',
  'function fuzzyAnchor(',
  'signal.aborted',
  'while (state.remoteCache.size > REMOTE_CACHE_LIMIT)',
  "group:substanceWins ? 'substance' : 'name'",
]) {
  if (!suggest.includes(required)) throw new Error(`Phase 18 smart autocomplete contract missing: ${required}`);
}
if (/\/api\/registry|medindex:registry-full-dataset-needed|DRUG_DATA_PARTS/.test(suggest)) {
  throw new Error('Phase 18 autocomplete must never request or depend on the full registry payload.');
}
const fuzzyStart = suggest.indexOf('function fuzzySuggestions(');
const fuzzyEnd = suggest.indexOf('async function apiResults(', fuzzyStart);
const fuzzyBlock = fuzzyStart >= 0 && fuzzyEnd > fuzzyStart ? suggest.slice(fuzzyStart, fuzzyEnd) : '';
if (!fuzzyBlock || /result\?\.(?:use|drugClass|form)|indication/i.test(fuzzyBlock)) {
  throw new Error('Phase 18 fuzzy rescue must remain identity-only, never clinical-prose fuzzy matching.');
}

let html = read(INDEX);
const scriptPattern = /registry-search-suggest\.js\?v=[^"&]+/;
if (!scriptPattern.test(html)) throw new Error('Phase 18 could not find the registry suggestion script tag.');
html = html.replace(scriptPattern, 'registry-search-suggest.js?v=smart-v2');
write(INDEX, html);
if (!read(INDEX).includes('registry-search-suggest.js?v=smart-v2')) {
  throw new Error('Phase 18 smart-search cache version was not wired into index.html.');
}

console.log('Phase 18 smart search passed: 36ms local autocomplete, whole-registry bounded remote enrichment, identity-only typo rescue, 80ms stale-safe table search, and indexed non-blocking candidate paths.');
