'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const ad = read('20260831105123_drx_phase11ad_ibuprofen_emc_product_scope_capture.sql');
const ae = read('20260831105331_drx_phase11ae_ibuprofen_scoped_regimens_and_applicability.sql');
const af = read('20260831105545_drx_phase11af_azithromycin_reusable_regimens.sql');

assert.match(ad, /EMC-PRODUCT-7020-SMPC/);
assert.match(ad, /EMC-PRODUCT-10952-SMPC/);
assert.match(ad, /EMC-PRODUCT-101385-SMPC/);
assert.match(ad, /children below 20 kg body weight or younger than 6 years/i);
assert.match(ad, /children younger than 12 years/i);
assert.match(ad, /section-4\.3/);

assert.match(ae, /create table if not exists drx_dose\.source_candidate_applicability_v1/);
assert.match(ae, /SOURCE_PRODUCT_ONLY/);
assert.match(ae, /EXACT_PRESENTATION_ONLY/);
assert.match(ae, /requires_scored boolean not null default false/);
assert.match(ae, /SRC-IBU-400POM-PF-20TO29KG/);
assert.match(ae, /SRC-IBU-POM-RHEUMATIC-ADOLESCENT-15TO17/);
assert.match(ae, /SRC-IBU-200GSL-PAIN-FEVER-12PLUS/);
assert.match(ae, /SRC-REST-IBU-10952-BELOW-12/);
assert.match(ae, /SRC-REST-IBU-7020-BELOW-6-OR-20KG/);

assert.match(af, /create table if not exists drx_dose\.source_regimen_supporting_evidence_v1/);
assert.match(af, /CONCORDANT/);
assert.match(af, /SRC-AZI-RESP-SKIN-3DAY-45KGPLUS/);
assert.match(af, /SRC-AZI-ERYTHEMA-MIGRANS-5DAY-45KGPLUS/);
assert.match(af, /SRC-AZI-CHLAMYDIA-SINGLE-45KGPLUS/);
assert.match(af, /SRC-AZI-ACNE-MODERATE-500MG/);
assert.match(af, /SRC-ADJ-AZI-GFR-BELOW-10-CAUTION/);
assert.match(af, /SRC-REST-AZI-SEVERE-HEPATIC/);

for (const sql of [ad, ae, af]) {
  assert.doesNotMatch(sql, /auto_bind_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_promote_allowed\s*=\s*true/i);
}

console.log('DRx Phase 11 scoped ibuprofen + reusable azithromycin contract passed.');
