const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'api');
const HOBBY_FUNCTION_LIMIT = 12;
const REQUIRED_HEADROOM = 1;

function deployableFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return deployableFiles(absolute);
    if (!entry.isFile() || !/\.(?:js|mjs|cjs|ts)$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) return [];
    return [path.relative(root, absolute).replace(/\\/g, '/')];
  });
}

const functions = deployableFiles(apiRoot).sort();
const operationalLimit = HOBBY_FUNCTION_LIMIT - REQUIRED_HEADROOM;
assert.ok(functions.length <= operationalLimit,
  `MedIndex reserves ${REQUIRED_HEADROOM} Hobby function slot; allowed ${operationalLimit}, found ${functions.length}: ${functions.join(', ')}`);
assert.ok(!functions.includes('api/registry-data.js'), 'redundant registry-data function must not return');
assert.ok(!functions.includes('api/health.js'), 'unused health function must not return');
assert.ok(!functions.includes('api/gemini-prescription.js'), 'Gemini core must remain a library, not a second function');
assert.ok(functions.includes('api/gemini-prescription-secure.js'), 'secure Gemini gateway is missing');
assert.ok(fs.existsSync(path.join(root, 'lib/gemini-prescription.js')), 'Gemini core library is missing');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.engines?.node, '22.x', 'Node runtime must be pinned to the audited LTS major');
assert.match(pkg.packageManager || '', /^pnpm@10\./, 'pnpm major must be pinned for reproducible Vercel builds');

console.log(`Hobby deployment budget passed: ${functions.length}/${HOBBY_FUNCTION_LIMIT} functions with ${HOBBY_FUNCTION_LIMIT - functions.length} slot(s) free.`);
