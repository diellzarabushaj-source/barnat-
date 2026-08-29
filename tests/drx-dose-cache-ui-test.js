'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'registry-dose-calculator.js'), 'utf8');

assert.doesNotThrow(() => new Function(source));
assert.match(source, /FAST_ENDPOINT = '\/api\/dosage\?view=product-rules&productKey='/);
assert.match(source, /DOSE_CACHE_DB = 'drx-dose-cache-v1'/);
assert.match(source, /indexedDB\.open\(DOSE_CACHE_DB, 1\)/);
assert.match(source, /If-None-Match/);
assert.match(source, /response\.status === 304/);
assert.match(source, /OFFLINE_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(source, /__doseCacheState:'offline-cache'/);
assert.match(source, /void openProductByKey\(button\.dataset\.doseProductKey\)/);

assert.match(source, /function ruleRequiredInputs\(rule\)/);
assert.match(source, /required\.has\('weight_kg'\)/);
assert.match(source, /function unsupportedRequiredInputs\(rule\)/);
assert.match(source, /Kjo skemë kërkon të dhëna shtesë klinike/);
assert.match(source, /const supported = new Set\(\['age_months','weight_kg','height_cm'\]\)/);
assert.match(source, /SHARED_CORE_SRC = '\/dose-core\.js\?v=drx-dose-core-v1'/);
assert.match(source, /function ensureSharedDoseCore\(\)/);
assert.match(source, /window\.DRxDoseCore\?\.calculate/);
assert.match(source, /function ruleNeedsHeight\(rule\)/);
assert.match(source, /required\.has\('height_cm'\)/);
assert.match(source, /data-dose-height/);
assert.match(source, /const \[product\] = await Promise\.all\(\[loadFastProduct\(key\), ensureSharedDoseCore\(\)\]\)/);

const normalizer = fs.readFileSync(path.join(ROOT, 'lib', 'dose-rule-normalizer.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'dose-core.js'), 'utf8');
assert.match(normalizer, /\['adult_only','pediatric_only'\]\.includes\(patientGroup\)/);
assert.match(core, /\['adult_only','pediatric_only'\]\.includes\(patientGroup\)/);

console.log('DRx dose fast-cache and dynamic-input UI contract passed.');
