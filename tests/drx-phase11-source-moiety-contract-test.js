'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const phase11i = read('20260831095113_drx_phase11i_source_classification_and_replacement_queue.sql');
const phase11j = read('20260831095519_drx_phase11j_evidence_backed_dose_moiety_layer.sql');
const phase11k = read('20260831095553_drx_phase11k_null_safe_source_queue_filter.sql');
const phase11l = read('20260831095946_drx_phase11l_source_index_classification.sql');
const phase11m = read('20260831100100_drx_phase11m_emc_102127_ceftriaxone_capture.sql');
const phase11n = read('20260831100501_drx_phase11n_exact_source_overrides_hemomycin.sql');
const phase11o = read('20260831100532_drx_phase11o_restore_extended_status.sql');


assert.match(phase11i, /create table if not exists drx_dose\.source_url_classification_v1/);
assert.match(phase11i, /dose_source_eligible boolean not null/);
assert.match(phase11i, /REGISTRY_WORKBOOK_NOT_POSOLOGY_EVIDENCE/);
assert.match(phase11i, /create or replace view drx_dose\.source_replacement_queue_v1/);

assert.match(phase11j, /create table if not exists drx_dose\.component_moiety_map_v1/);
assert.match(phase11j, /source_snapshot_id text not null/);
assert.match(phase11j, /source_section_sha256 text not null/);
assert.match(phase11j, /mapping_status='VERIFIED'/);
assert.match(phase11j, /amoxicillintrihydrate','amoxicillin/);
assert.match(phase11j, /clavulanatepotassium','clavulanicacid/);
assert.match(phase11j, /create or replace function drx_dose\.resolve_dose_moiety_ids_v1/);
assert.match(phase11j, /t\.dose_moiety_key=p\.dose_moiety_key/);
assert.match(phase11j, /p\.strict_autoinherit_ready/);
assert.match(phase11j, /t\.strength_match_mode='EXACT_STRENGTH'/);

assert.match(phase11k, /not coalesce\(/);
assert.match(phase11k, /cls\.classification_status='VERIFIED'/);
assert.match(phase11k, /cls\.dose_source_eligible=false/);

assert.match(phase11l, /PRODUCT_CATALOG_NOT_POSOLOGY_EVIDENCE/);
assert.match(phase11l, /PRODUCT_INDEX_REQUIRES_EXACT_SMPC_LINK/);
assert.match(phase11l, /create or replace view drx_dose\.source_discovery_queue_v1/);
assert.match(phase11l, /FIND_EXACT_PRODUCT_SMPC/);

assert.match(phase11m, /EMC-PRODUCT-102127-SMPC/);
assert.match(phase11m, /section_code,'4\.2'/);
assert.match(phase11m, /ceftriaxonesodium/);
assert.match(phase11m, /'ceftriaxone'/);
assert.match(phase11m, /mapping_status/);
assert.match(phase11m, /'VERIFIED'/);


assert.match(phase11n, /create table if not exists drx_dose\.candidate_source_overrides_v1/);
assert.match(phase11n, /EXACT_PRODUCT_SMPC_FROM_MANUFACTURER_INDEX/);
assert.match(phase11n, /create or replace view drx_dose\.rule_candidate_effective_source_v1/);
assert.match(phase11n, /HEMOFARM-HEMOMYCIN-250-SMPC/);
assert.match(phase11n, /HEMOFARM-HEMOMYCIN-500-SMPC/);
assert.match(phase11n, /azithromycindihydrate/);
assert.match(phase11n, /q\.effective_source_url/);
assert.match(phase11n, /'draft',1/);
assert.match(phase11n, /'autoPublished',false/);
assert.match(phase11n, /'runtimeServed',false/);

assert.match(phase11o, /create or replace function public\.drx_phase11_status_v1/);
assert.match(phase11o, /verifiedCandidateSourceOverrides/);
assert.match(phase11o, /candidatesWithExact42Evidence/);
assert.match(phase11o, /'autoPublishAllowed',false/);
assert.match(phase11o, /'runtimeServeEnabled',false/);

for (const sql of [phase11i, phase11j, phase11k, phase11l, phase11m, phase11n, phase11o]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /runtimeServeEnabled'\s*,\s*true/i);
}

console.log('DRx Phase 11 source and dose-moiety safety contract passed.');
