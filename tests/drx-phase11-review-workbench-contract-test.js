'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

const bp = read('supabase/migrations/20260831162108_drx_phase11bp_admin_review_read_model.sql');
const bq = read('supabase/migrations/20260831162250_drx_phase11bq_detailed_review_packets.sql');
const br = read('supabase/migrations/20260831162751_drx_phase11br_identity_candidate_suggestions.sql');
const backend = read('lib/phase11-review.js');
const api = read('api/phase11-review.js');
const html = read('admin.html');
const ui = read('admin-phase11-review.js');
const dashboard = read('admin-dashboard.js');

assert.match(bp, /drx_phase11_review_workbench_v1/);
assert.match(bp, /drx_phase11_regimen_review_packet_v1/);
assert.match(bp, /drx_phase11_identity_batch_packet_v1/);
assert.match(bp, /security definer/i);
assert.match(bp, /grant execute .* to service_role/is);

assert.match(bq, /drx_phase11_clinical_batch_packet_v1/);
assert.match(bq, /drx_phase11_indication_review_packet_v1/);
assert.match(bq, /grant execute .* to service_role/is);

assert.match(br, /ingredient_identity_term_candidates_v1/);
assert.match(br, /ingredient_identity_review_queue_v2/);
assert.match(br, /EXACT_PHRASE_IN_COMPOSITION/);
assert.match(br, /auto_resolve_allowed/);
assert.match(br, /false::boolean as auto_resolve_allowed/);
assert.doesNotMatch(br, /auto_resolve_allowed\s*=\s*true/i);

assert.match(backend, /AdminAccess\.requireAdminSession/);
assert.match(backend, /READ_ONLY_REVIEW_WORKBENCH/);
assert.match(backend, /req\.method !== 'GET'/);
assert.match(backend, /drx_phase11_identity_batch_packet_v2/);
assert.match(api, /Phase11Review\.handle/);

assert.match(html, /data-view="phase11"/);
assert.match(html, /data-panel="phase11"/);
assert.match(html, /id="phase11DetailDialog"/);
assert.match(html, /admin-phase11-review\.js/);
assert.match(dashboard, /phase11:\['Dose V3 Review','Phase 11 · review & cutover'\]/);

assert.match(ui, /\/api\/phase11-review/);
assert.match(ui, /identitySignature=/);
assert.match(ui, /clinicalBatchKey=/);
assert.match(ui, /indications=1/);
assert.match(ui, /Canonical suggestions/);
assert.doesNotMatch(ui, /method\s*:\s*['"]POST['"]/i);
assert.doesNotMatch(ui, /method\s*:\s*['"]PUT['"]/i);
assert.doesNotMatch(ui, /method\s*:\s*['"]PATCH['"]/i);

console.log('DRx Phase 11 admin review workbench contract passed.');
