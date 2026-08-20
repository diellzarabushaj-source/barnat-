'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ui = read('registry-user-personalization.js');
const client = read('user-library-client.js');
const css = read('registry-user-personalization.css');
const html = read('index.html');
const registrySource = read('app-parts/part-01.txt');
const registryRenderSource = read('app-parts/part-04.txt');

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
  [registrySource, "key:'Nr rendor', label:'Nr', mobileLabel:'Nr', type:'num', cls:'code', visible:true", 'Full-registry source must default Nr ON.'],
  [registrySource, "key:'Substanca aktive', label:'Substanca Aktive', mobileLabel:'Substanca aktive', type:'str', cls:'', visible:true", 'Full-registry source must default active substance ON.'],
  [registrySource, "key:'Emri tregtar', label:'Emri Tregtar', mobileLabel:'Emri tregtar', type:'str', cls:'name', visible:true", 'Full-registry source must default trade name ON.'],
  [registrySource, "key:'ATC Code', label:'ATC', mobileLabel:'ATC', type:'str', cls:'code', visible:false", 'Full-registry source must keep ATC opt-in.'],
  [registrySource, "key:'Klasa / Çka është', label:'Klasa / Çka është', mobileLabel:'Klasa', type:'str', cls:'wrap', visible:true", 'Full-registry source must default class ON.'],
  [registrySource, "key:'Përdorimi (fjalë kyçe)', label:'Përdorimi / fjalë kyçe', mobileLabel:'Përdorimi', type:'str', cls:'wrap', visible:true", 'Full-registry source must default use/keywords ON.'],
  [registrySource, "key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:true", 'Full-registry source must default prescription notation ON.'],
  [registrySource, "key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:false", 'Full-registry source must keep Statusi opt-in.'],
  [registrySource, "const REGISTRY_COLUMN_VISIBILITY_KEY = 'medindex.registry.columns.v20260820';", 'Full-registry source must own the canonical visibility storage key.'],
  [registrySource, 'function restoreRegistryColumnVisibility()', 'Full-registry source must restore explicit user column choices before render.'],
  [registrySource, 'function saveRegistryColumnVisibility()', 'Full-registry source must own persistence of explicit user column choices.'],
  [registryRenderSource, "if(col.key === 'Popullata e aprovuar')", 'Full-registry source must render approved population without a build-only injection.'],
  [registryRenderSource, 'registry-population-badge', 'Approved-population source rendering must keep its semantic badge.'],
  [registryRenderSource, 'COLUMNS.forEach(c => c.visible = true); saveRegistryColumnVisibility();', 'Full-registry show-all must persist at source.'],
  [registryRenderSource, 'COLUMNS.forEach(c => { c.visible = false; });', 'Full-registry hide-all must be source-owned.'],
  [registryRenderSource, 'col.visible = cb.checked;\n      saveRegistryColumnVisibility();', 'Full-registry individual column toggles must persist at source.'],
];

for (const [source, needle, message] of requirements) {
  if (!source.includes(needle)) throw new Error(message);
}

const nrPosition = registrySource.indexOf("key:'Nr rendor'");
const substancePosition = registrySource.indexOf("key:'Substanca aktive'");
const tradePosition = registrySource.indexOf("key:'Emri tregtar'");
if (!(nrPosition >= 0 && substancePosition > nrPosition && tradePosition > substancePosition)) {
  throw new Error('Full-registry canonical source order must be Nr → Substanca aktive → Emri tregtar.');
}

if (/const POLL_MS = 1200|window\.setInterval\(poll, POLL_MS\)/.test(client)) {
  throw new Error('Legacy aggressive Favorites/Notes polling returned to canonical source.');
}
if (/rowProfileCache\s*=\s*new Map/.test(ui)) {
  throw new Error('Canonical personalization must not strongly retain removed rows.');
}

console.log('Canonical source gate passed before build patches: registry defaults/order/persistence/population rendering, Favorites/Notes UX, recovery and long-session behavior are source-owned.');
