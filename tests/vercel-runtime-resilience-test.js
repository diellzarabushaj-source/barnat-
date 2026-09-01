'use strict';

const assert = require('node:assert/strict');
const MedIndex = require('../lib/medindex-data-api.js');
const fs = require('node:fs');

const retryable = MedIndex._test.isRetryableSupabaseReadError;
const delay = MedIndex._test.retryDelayMs;

assert.equal(retryable({status:521}, 'GET'), true);
assert.equal(retryable({status:503}, 'GET'), true);
assert.equal(retryable({status:409}, 'GET'), false);
assert.equal(retryable({status:521}, 'POST'), false, 'writes must never be auto-retried');
assert.equal(retryable(Object.assign(new TypeError('fetch failed'), {status:0}), 'GET'), true);
assert.ok(delay({payload:{retry_after:120}}, 1) <= 750, 'provider backoff must stay inside serverless budget');
assert.ok(delay({}, 2) >= 100);

for (const file of ['lib/user-ui-preferences.js','lib/profile-avatar.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /status >= 500/);
  assert.match(source, /instanceof (?:PreferencesError|ProfileAvatarError)/);
}

console.log('Vercel runtime resilience contract passed: transient reads retry safely and expected 4xx states stay out of error logs.');
