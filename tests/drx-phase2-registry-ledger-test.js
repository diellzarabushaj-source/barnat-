'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration1 = fs.readFileSync('supabase/migrations/20260830142544_drx_phase2_immutable_registry_ledger.sql','utf8');
const migration2 = fs.readFileSync('supabase/migrations/20260830143037_drx_phase2_correction_matching_guard.sql','utf8');
const bootstrap = fs.readFileSync('scripts/drx-phase2-bootstrap.js','utf8');
const sync = fs.readFileSync('scripts/sync-supabase-from-sheets.js','utf8');
const workflow = fs.readFileSync('.github/workflows/drx-phase2-bootstrap.yml','utf8');

assert.match(migration1,/create schema if not exists drx_raw/i);
assert.match(migration1,/registry_import_batches_v1/);
assert.match(migration1,/registry_rows_v1_immutable/);
assert.match(migration1,/registry_corrections_v1_immutable/);
assert.match(migration1,/registry_anomalies_v1/);
assert.match(migration1,/registry_effective_v1/);
assert.match(migration1,/registry_reconstruction_diff_v1/);
assert.match(migration1,/publication_allowed',false/);
assert.match(migration1,/grant execute on function public\.drx_registry_begin_import_v1[^;]+service_role/is);
assert.doesNotMatch(migration1,/grant execute on function public\.drx_registry_begin_import_v1[^;]+authenticated/is);

assert.match(migration2,/trade-first-v2/);
assert.match(migration2,/least\(length\(ctrade\),length\(dtrade\)\)>=6/);
assert.match(migration2,/field_match and atc_match/);
assert.match(migration2,/v_top_count<>1/);

assert.match(bootstrap,/EXPECTED_REGISTRY_ROWS = 4006/);
assert.match(bootstrap,/EXPECTED_CORRECTIONS = 107/);
assert.match(bootstrap,/EXPECTED_TOTAL_DRUGS = 4015/);
assert.match(bootstrap,/correctionsWithEvidence/);
assert.match(bootstrap,/reconstructionDiffsZero/);
assert.match(bootstrap,/anomaliesExpected/);
assert.match(bootstrap,/publicationClosed/);
assert.match(bootstrap,/drx-phase2-bootstrap-evidence-v1/);

assert.match(sync,/archiveRegistrySource\(registryBook\)/);
assert.match(sync,/applyRegistryCorrectionLedger\(\)/);
assert.match(sync,/drx_registry_begin_import_v1/);
assert.match(sync,/drx_registry_append_rows_v1/);
assert.match(sync,/drx_registry_finalize_import_v1/);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/drx-phase2-bootstrap-evidence/);

console.log('DRx Phase 2 immutable registry ledger contract: PASS');
