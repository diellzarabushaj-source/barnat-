'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function walk(dir) {
  const full = path.join(ROOT, dir);
  return fs.readdirSync(full, { withFileTypes:true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return /\.(?:js|cjs|mjs|ts)$/.test(entry.name) ? [rel] : [];
  });
}

const runtimeFiles = [...walk('api'), ...walk('lib')]
  .filter(rel => rel !== path.join('lib', 'neon-data-api.js'));

const legacyImports = runtimeFiles.filter(rel => /(?:require\(|from\s+)['"][^'"]*neon-data-api(?:\.js)?['"]/.test(read(rel)));
assert.deepEqual(legacyImports, [], 'Active runtime files must not import the legacy Neon transport path.');

const legacyTransport = read('lib/neon-data-api.js');
assert.match(legacyTransport, /module\.exports\s*=\s*require\('\.\/medindex-data-api\.js'\)/);

const canonical = read('lib/medindex-data-api.js');
for (const marker of [
  "function readProvider() { return 'supabase'; }",
  "function writeProvider() { return 'supabase'; }",
  "async function neonRequest(path, options = {})",
  "return supabaseRequest(path, options, { privileged });",
]) {
  assert.ok(canonical.includes(marker), 'Canonical transport is missing: ' + marker);
}

const driveLegacy = read('lib/drive-neon-sync.js');
assert.match(driveLegacy, /module\.exports\s*=\s*require\('\.\/drive-supabase-sync\.js'\)/);

const driveApi = read('api/drive-sync.js');
assert.match(driveApi, /require\('\.\.\/lib\/drive-supabase-sync\.js'\)/);
assert.doesNotMatch(driveApi, /DriveNeonSync/);

console.log('Phase 7 Supabase sync cutover contract passed.');
