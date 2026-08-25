'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-desktop-lite.js');
const MARKER = 'registry-personal-supabase-immediate-v1';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const oldBlock = `    const syncNow = window.MedIndexUserLibrary?.syncNow;
    if (typeof syncNow === 'function' && navigator.onLine) {
      try {
        await Promise.race([
          Promise.resolve(syncNow.call(window.MedIndexUserLibrary)),
          new Promise(resolve => window.setTimeout(resolve, 1600)),
        ]);
      } catch {}
    }
`;
  const newBlock = `    // ${MARKER}: authoritative mutation barrier
    // Existing Favorites open immediately. Only a genuinely pending local
    // mutation waits for its exact revision to reach Supabase before rows are
    // read back. This removes the stale 1.6s race without creating sync loops.
    const library = window.MedIndexUserLibrary;
    const diagnostics = typeof library?.diagnostics === 'function' ? library.diagnostics() : null;
    const localRevision = Number(diagnostics?.localRevision || 0);
    const syncedRevision = Number(diagnostics?.syncedRevision || 0);
    const needsSync = Boolean(diagnostics?.dirty || localRevision > syncedRevision);
    if (needsSync && typeof library?.syncNow === 'function' && navigator.onLine) {
      try { await library.syncNow(); } catch {}
    }
`;
  const at = source.indexOf(oldBlock);
  if (at < 0) throw new Error(`${MARKER}: legacy timed personal sync barrier not found.`);
  source = source.slice(0, at) + newBlock + source.slice(at + oldBlock.length);
}

const personalAt = source.indexOf('async function fetchPersonalLogicalPage');
const personalEnd = source.indexOf('  function setBusy', personalAt);
if (personalAt < 0 || personalEnd < 0) throw new Error(`${MARKER}: personal request block missing.`);
const block = source.slice(personalAt, personalEnd);
if (!block.includes(MARKER)) throw new Error(`${MARKER}: deterministic mutation barrier missing.`);
if (!block.includes('library.diagnostics()')) throw new Error(`${MARKER}: pending-revision detection missing.`);
if (!block.includes('localRevision > syncedRevision')) throw new Error(`${MARKER}: revision ordering guard missing.`);
if (!block.includes('await library.syncNow()')) throw new Error(`${MARKER}: pending mutation is not flushed before Supabase read.`);
if (block.includes('Promise.race([') || block.includes('setTimeout(resolve, 1600)')) {
  throw new Error(`${MARKER}: stale timeout race is still present.`);
}

fs.writeFileSync(FILE, source, 'utf8');
console.log(`${MARKER}: personal rows wait only for pending revisions, then read Supabase authoritatively without a stale timeout race.`);
