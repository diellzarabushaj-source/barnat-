'use strict';

require('./phase3-env-check.js');

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ui = read('registry-user-personalization.js');
const client = read('user-library-client.js');
const css = read('registry-user-personalization.css');
const html = read('index.html');

const requirements = [
  [ui, "PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1'", 'Phase 8 UX must live in canonical personalization source.'],
  [ui, "LONG_SESSION_VERSION = 'registry-personal-long-session-v1'", 'Phase 10 must live in canonical personalization source.'],
  [ui, 'const PERSONALIZATION_INSTANCE_KEY', 'Canonical personalization singleton guard is missing.'],
  [ui, 'const rowProfileCache = new WeakMap();', 'Canonical personalization WeakMap row cache is missing.'],
  [ui, 'favoritesStorageRaw', 'Canonical Favorites storage parse cache is missing.'],
  [ui, 'notesStorageRaw', 'Canonical Notes storage parse cache is missing.'],
  [client, "EVENT_SYNC_VERSION = 'user-library-event-sync-v1'", 'Event-driven user-library source is missing.'],
  [client, "RECOVERY_VERSION = 'user-library-recovery-v1'", 'Phase 7 recovery must live in canonical user-library source.'],
  [client, "LONG_SESSION_VERSION = 'registry-personal-long-session-v1'", 'Phase 10 must live in canonical user-library source.'],
  [client, 'const LIBRARY_INSTANCE_KEY', 'Canonical user-library singleton guard is missing.'],
  [client, 'const API_TIMEOUT_MS = 15_000', 'Canonical user-library timeout is missing.'],
  [client, 'let localRevision = 0', 'Canonical local revision state is missing.'],
  [client, 'let syncedRevision = 0', 'Canonical synced revision state is missing.'],
  [client, 'async function flushThroughRevision(targetRevision)', 'Revision-safe sync must live in canonical source.'],
  [client, 'const prescriptions = parseArray(PRESCRIPTIONS_KEY);', 'Legacy poll must remain prescription-only in canonical source.'],
  [css, '/* registry-personal-ux-phase8-v1 */', 'Phase 8 personal UX CSS must be materialized.'],
  [html, 'registry-user-personalization.css?v=20260816-7&ux=20260817-1', 'Canonical Phase 8 CSS asset publication is missing.'],
  [html, 'user-library-client.js?v=20260817-event-sync-1', 'Canonical user-library asset publication is missing.'],
];

for (const [source, needle, message] of requirements) {
  if (!source.includes(needle)) throw new Error(message);
}

if (/const POLL_MS = 1200|window\.setInterval\(poll, POLL_MS\)/.test(client)) {
  throw new Error('Legacy aggressive Favorites/Notes polling returned to canonical source.');
}
if (/rowProfileCache\s*=\s*new Map/.test(ui)) {
  throw new Error('Canonical personalization must not strongly retain removed rows.');
}

console.log('Phase 12 canonical source gate passed before build patches: Favorites/Notes UX, recovery and long-session behavior are source-owned.');
