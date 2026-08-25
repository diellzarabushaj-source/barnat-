'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-desktop-lite.js');
const MARKER = 'registry-list-handoff-compat-v1';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(`${MARKER}: non-personal full-dataset handoff`)) {
  const before = [
    "    window.addEventListener('medindex:registry-full-dataset-needed', event => {",
    '      if (state.disabled) return;',
    "      const reason = clean(event?.detail?.reason) || 'full-dataset-requested';",
    '      // registry-personal-desktop-lite-v1: ignore legacy personal handoff',
    "      if (reason.startsWith('personal-view-')) return;",
    '      requestFullRegistry(reason);',
    '    });',
  ].join('\n');
  const after = [
    "    window.addEventListener('medindex:registry-full-dataset-needed', event => {",
    '      if (state.disabled) return;',
    "      const reason = clean(event?.detail?.reason) || 'full-dataset-requested';",
    '      // registry-personal-desktop-lite-v1: ignore legacy personal handoff',
    "      if (reason.startsWith('personal-view-')) return;",
    `      // ${MARKER}: non-personal full-dataset handoff`,
    "      requestFullRegistry(clean(event?.detail?.reason) || 'full-dataset-requested');",
    '    });',
  ].join('\n');

  const at = source.indexOf(before);
  if (at < 0) throw new Error(`${MARKER}: canonical handoff listener anchor not found.`);
  if (source.indexOf(before, at + before.length) >= 0) {
    throw new Error(`${MARKER}: canonical handoff listener anchor is ambiguous.`);
  }
  source = source.slice(0, at) + after + source.slice(at + before.length);
}

const markerAt = source.indexOf(`${MARKER}: non-personal full-dataset handoff`);
const personalGuard = source.lastIndexOf("if (reason.startsWith('personal-view-')) return;", markerAt);
const compatibleCall = source.indexOf("requestFullRegistry(clean(event?.detail?.reason) || 'full-dataset-requested');", markerAt);
if (!(personalGuard >= 0 && markerAt > personalGuard && compatibleCall > markerAt)) {
  throw new Error(`${MARKER}: personal guard must remain before the legacy-compatible list handoff.`);
}

fs.writeFileSync(FILE, source, 'utf8');
console.log('Registry List handoff compatibility preserved: non-personal requests use the existing full-dataset owner; personal views never hand off.');
