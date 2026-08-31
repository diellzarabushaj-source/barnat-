'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const ag = read('20260831105930_drx_phase11ag_diclofenac_route_form_regimens.sql');
const ah = read('20260831110121_drx_phase11ah_amoxicillin_concordant_sources.sql');
const ai = read('20260831110241_drx_phase11ai_amoxicillin_reusable_multi_indication_regimens.sql');

assert.match(ag, /EMC-PRODUCT-2661-SMPC/);
assert.match(ag, /EMC-PRODUCT-13852-SMPC/);
assert.match(ag, /EMC-PRODUCT-15192-SMPC/);
assert.match(ag, /Diclofenac diethylamine content as the corresponding diclofenac sodium amount/i);
assert.match(ag, /mapping_kind[^\n]*EQUIVALENT_ACTIVE|EQUIVALENT_ACTIVE/);
assert.match(ag, /SRC-DICLO-SR75-ADULT-PAIN-INFLAMMATION/);
assert.match(ag, /SRC-DICLO-GEL116-TRAUMA-14PLUS/);
assert.match(ag, /SRC-DICLO-GEL232-TRAUMA-14PLUS/);
assert.match(ag, /EXACT_PRESENTATION_ONLY/);

assert.match(ah, /EMC-PRODUCT-13501-SMPC/);
assert.match(ah, /EMC-PRODUCT-10891-SMPC/);
assert.match(ah, /500 mg Capsules/);
assert.match(ah, /250 mg\/5 mL Powder for Oral Suspension/);
assert.match(ah, /Children <40 kg/);
assert.match(ah, /GFR 10-30/);

assert.match(ai, /create table if not exists drx_dose\.source_regimen_indication_links_v1/);
assert.match(ai, /SRC-AMOX-ADULT-GROUP-A-Q8Q12/);
assert.match(ai, /SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS/);
assert.match(ai, /SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY/);
assert.match(ai, /SRC-AMOX-PED-ENDOCARDITIS-PROPHYLAXIS/);
assert.match(ai, /PRIMARY/);
assert.match(ai, /CONCORDANT/);
assert.match(ai, /SRC-ADJ-AMOX-ADULT-GFR10TO30-MAX500BID/);
assert.match(ai, /SRC-ADJ-AMOX-PED-GFRLT10-MANUAL/);
assert.match(ai, /auto_publish_allowed boolean not null default false/);

for (const sql of [ag, ah, ai]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_bind_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /runtimeServeEnabled'\s*,\s*true/i);
}

console.log('DRx Phase 11 diclofenac + amoxicillin reusable-regimen contract passed.');
