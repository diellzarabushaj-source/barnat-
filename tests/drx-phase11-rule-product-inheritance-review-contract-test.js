'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260831111414_drx_phase11al_rule_product_inheritance_review_layer.sql'),
  'utf8'
);

assert.match(sql, /create table if not exists drx_dose\.rule_product_compatibility_reviews_v1/);
assert.match(sql, /create or replace view drx_dose\.rule_product_inheritance_review_v1/);
assert.match(sql, /create or replace view drx_dose\.rule_product_inheritance_gap_summary_v1/);
assert.match(sql, /create or replace view drx_dose\.rule_product_inheritance_action_queue_v1/);

assert.match(sql, /RELEASE_UNRESOLVED/);
assert.match(sql, /STRENGTH_MISMATCH/);
assert.match(sql, /FORM_MISMATCH/);
assert.match(sql, /ROUTE_MISMATCH/);
assert.match(sql, /POPULATION_MISMATCH/);
assert.match(sql, /VARIANT_NOT_BOUND/);
assert.match(sql, /VARIANT_ANOMALY/);

assert.match(sql, /STRICT_MATCH/);
assert.match(sql, /COMPATIBILITY_REVIEW_GAP/);
assert.match(sql, /DO_NOT_INHERIT/);
assert.match(sql, /auto_apply_allowed boolean not null default false/);
assert.match(sql, /false::boolean as runtime_auto_apply/);

assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
assert.doesNotMatch(sql, /runtime_auto_apply\s*=\s*true/i);

console.log('DRx Phase 11 rule/product inheritance review contract passed.');
