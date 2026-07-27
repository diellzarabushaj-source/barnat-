'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'sw-resilient-v3.js');

function checkSyntax(source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-neon-worker-'));
  const file = path.join(directory, 'sw-resilient-v3.js');
  try {
    fs.writeFileSync(file, source, 'utf8');
    execFileSync(process.execPath, ['--check', file], { stdio:'pipe' });
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
}

if (!fs.existsSync(workerPath)) throw new Error('sw-resilient-v3.js was not generated.');
const original = fs.readFileSync(workerPath, 'utf8');
let source = original;

source = source.replace(
  "  '/auth-client.js', '/offline-runtime.js', '/manifest.webmanifest', '/medindex-icon.svg',",
  "  '/auth-client.js', '/offline-runtime.js', '/manifest.webmanifest', '/medindex-icon.svg', '/lab-neon-bootstrap.js',"
);

source = source.replace(
`function normalizedPrivateKey(url) {
  const path = url.pathname === '/data/registry-data.js' ? '/api/registry' : url.pathname;
  const accept = path === '/api/registry' ? 'application/javascript' : 'application/json';
  return requestFor(path, { headers:{ Accept:accept } });
}`,
`function normalizedPrivateKey(url) {
  const path = url.pathname === '/data/registry-data.js' ? '/api/registry' : url.pathname;
  const normalized = new URL(path, self.location.origin);
  if (path === '/api/icd' && url.searchParams.get('scope') === 'labs') normalized.searchParams.set('scope', 'labs');
  const accept = path === '/api/registry' ? 'application/javascript' : 'application/json';
  return requestFor(normalized.href, { headers:{ Accept:accept } });
}`
);

if (source === original
    || !source.includes("'/lab-neon-bootstrap.js'")
    || !source.includes("url.searchParams.get('scope') === 'labs'")
    || !source.includes("normalized.searchParams.set('scope', 'labs')")) {
  throw new Error('Neon runtime patch did not apply completely.');
}

checkSyntax(source);
fs.writeFileSync(workerPath, source, 'utf8');
console.log('Patched Service Worker v3 for Neon lab bootstrap and scope-isolated private caching.');
