'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'sw-resilient-v3.js');

if (!fs.existsSync(workerPath)) throw new Error('Mungon sw-resilient-v3.js; ekzekuto build-static-runtime fillimisht.');

const source = fs.readFileSync(workerPath, 'utf8');
const updated = source
  .replace(
    "const PRIVATE_DATA_PATHS = new Set([\n  '/api/registry', '/data/registry-data.js', '/api/dosage', '/api/icd',\n]);\nconst QUERY_DATA_PATHS = new Set(['/api/drug-search']);",
    "const PRIVATE_DATA_PATHS = new Set([\n  '/api/registry', '/data/registry-data.js', '/api/dosage',\n]);\nconst QUERY_DATA_PATHS = new Set(['/api/drug-search', '/api/icd']);"
  );

if (updated === source
    || !updated.includes("const QUERY_DATA_PATHS = new Set(['/api/drug-search', '/api/icd']);")
    || updated.includes("'/api/dosage', '/api/icd'")) {
  throw new Error('Service Worker-i nuk u patch-ua për cache të ndarë ICD/labs.');
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-sw-neon-'));
const temporary = path.join(directory, 'sw-resilient-v3.js');
try {
  fs.writeFileSync(temporary, updated, 'utf8');
  execFileSync(process.execPath, ['--check', temporary], { stdio:'pipe' });
  fs.writeFileSync(workerPath, updated, 'utf8');
} finally {
  fs.rmSync(directory, { recursive:true, force:true });
}

console.log('Patched Service Worker for isolated Neon ICD and laboratory query caches.');
