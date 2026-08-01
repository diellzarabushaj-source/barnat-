const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const html = read('klasifikimi.html');
const redirect = read('classification-redirect.js');
const vercel = JSON.parse(read('vercel.json'));

assert.doesNotMatch(html, /Barnat sipas klasifikimit ATC|id="cardGrid"|id="atcSearch"|atc-card|classification-v3\.js/, 'The obsolete card-based classification workspace must not be served');
assert.doesNotMatch(html, /<table|drugTableBody|drugResults/, 'The legacy classification route must not contain any medicine table or compatibility workspace');
assert.match(html, /classification-redirect\.js\?v=table-only-v1/, 'The offline-compatible redirect runtime must be loaded');
assert.match(html, /href="\/index\.html"/, 'The no-script fallback must point to the main registry table');

assert.match(redirect, /new URL\('\/index\.html'/, 'Legacy classification routes must target the main registry');
assert.match(redirect, /target\.searchParams\.set\('atc', legacyHash\.slice\(0, 3\)\)/, 'Legacy subgroup hashes such as #N02 must become the ATC table filter');
assert.match(redirect, /location\.replace/, 'Redirects must replace history rather than leave the obsolete page in browser history');

const redirects = Array.isArray(vercel.redirects) ? vercel.redirects : [];
assert.ok(redirects.some(rule => rule.source === '/klasifikimi.html' && rule.destination === '/index.html'), 'Vercel must redirect /klasifikimi.html to the main registry');
assert.ok(redirects.some(rule => rule.source === '/klasifikimi' && rule.destination === '/index.html'), 'Vercel must redirect the extensionless classification route');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'classification-redirect.js')], { stdio:'pipe' });

console.log('Legacy classification page removed; all classification routes now open the main registry table.');
