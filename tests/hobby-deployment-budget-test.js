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
assert.ok(!functions.includes('api/icd.js'), 'ICD compatibility route must not consume its own Hobby function');
assert.ok(!functions.includes('api/medical-hub-image.js'), 'Medical Hub image proxy must not consume its own Hobby function');
assert.ok(fs.existsSync(path.join(root, 'lib/medical-hub-image-handler.js')), 'Medical Hub shared image handler is missing');

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
assert.ok(
  vercel.rewrites.some(item => item.source === '/api/icd' && item.destination === '/api/drug-search?_route=icd'),
  'ICD compatibility rewrite is missing'
);
assert.ok(
  vercel.rewrites.some(item => item.source === '/api/medical-hub-image' && item.destination === '/api/medical-hub?_route=image'),
  'Medical Hub image compatibility rewrite is missing'
);
assert.equal(
  vercel.functions?.['api/drug-search.js']?.includeFiles,
  'data/icd-hierarchy-snapshot.json.gz',
  'ICD snapshot must travel with the consolidated drug-search function'
);
assert.equal(vercel.functions?.['api/icd.js'], undefined, 'deleted ICD function must not remain in Vercel function config');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.engines?.node, '24.x', 'Node runtime must match the audited Vercel production major');
assert.match(pkg.packageManager || '', /^pnpm@10\./, 'pnpm major must be pinned for reproducible Vercel builds');

console.log(`Hobby deployment budget passed: ${functions.length}/${HOBBY_FUNCTION_LIMIT} functions with ${HOBBY_FUNCTION_LIMIT - functions.length} slot(s) free.`);
