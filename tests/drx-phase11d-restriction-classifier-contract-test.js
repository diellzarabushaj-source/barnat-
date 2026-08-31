'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260831073800_drx_phase11d_restriction_classifier_hardening.sql'),
  'utf8',
);

assert.match(sql, /create or replace function drx_dose\.classify_restriction_only_v1/);
assert.match(sql, /RESTRICTION_ONLY/);
assert.match(sql, /RESTRICTION_ONLY_NO_DOSE_RULE/);
assert.match(sql, /parser_status='BLOCKED'/);
assert.match(sql, /calculable',false/);
assert.match(sql, /review_status='PENDING'/);
assert.match(sql, /create or replace view drx_dose\.restriction_only_candidates_v1/);
assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
assert.doesNotMatch(sql, /editorial_status\s*=\s*'published'/i);

console.log('DRx Phase 11D restriction classifier contract passed.');
