const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'offline-runtime.js');
const source = fs.readFileSync(runtimePath, 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

execFileSync(process.execPath, ['--check', runtimePath], { stdio:'pipe' });

assert.match(source, /LAST_WARM_KEY/, 'private cache warm timestamp is missing');
assert.match(source, /WARM_TTL_MS = 6 \* 60 \* 60 \* 1000/, 'private cache TTL must remain six hours');
assert.match(source, /cacheIsFresh\(\)/, 'fresh-cache guard is missing');
assert.match(source, /requestIdleCallback/, 'background warm must be deferred to browser idle time');
assert.match(source, /saveData/, 'background warm must respect Save-Data');
assert.match(source, /slow-2g\|2g/, 'background warm must avoid slow connections');
assert.match(source, /GET_CACHE_STATUS/, 'startup must inspect cache before warming APIs');
assert.match(source, /warmPrivateData\(\{ force:true \}\)/, 'manual sync must remain available');
assert.doesNotMatch(source, /await warmPrivateData\(\);\s*if \(!navigator\.onLine\)/, 'startup must not block on a full private-data warm');
assert.deepEqual(vercelConfig.regions, ['lhr1'], 'Vercel functions must stay in London near the eu-west-2 Supabase database.');

console.log('Hobby runtime efficiency and London data-region audit passed.');
