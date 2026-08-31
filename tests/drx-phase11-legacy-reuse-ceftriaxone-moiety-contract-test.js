'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const av = read('20260831120101_drx_phase11av_legacy_text_reuse_proposal_staging.sql');
const aw = read('20260831120242_drx_phase11aw_ceftriaxone_disodium_active_moiety.sql');

assert.match(av, /legacy_rule_reuse_proposals_v1/);
assert.match(av, /legacy_rule_reuse_existing_match_v1/);
assert.match(av, /legacy_rule_reuse_review_queue_v1/);
assert.match(av, /REVIEW_MERGE_WITH_EXISTING_SOURCE_REGIMEN/);
assert.match(av, /REVIEW_NEW_SHARED_REGIMEN/);
assert.match(av, /auto_create_rule_allowed boolean not null default false/);
assert.match(av, /auto_merge_allowed/);

assert.match(aw, /KOSOVO-AKPPM-DESEFIN-CEFTRIAXONE-DISODIUM-MOIETY/);
assert.match(aw, /Ceftriaxone disodium \(Equivalent to 1 g Ceftriaxone base\)/);
assert.match(aw, /'KOSOVO_AKPPM'/);
assert.match(aw, /canonical_key='ceftriaxonedisodium'/);
assert.match(aw, /canonical_key='ceftriaxone'/);
assert.match(aw, /'ACTIVE_MOIETY'/);
assert.match(aw, /'VERIFIED'/);

for (const sql of [av, aw]) {
  assert.doesNotMatch(sql, /auto_create_rule_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_merge_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
}

console.log('DRx Phase 11 legacy reuse + ceftriaxone moiety contract passed.');
