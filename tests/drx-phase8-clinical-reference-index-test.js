'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname,'..');
const migration = fs.readFileSync(
  path.join(ROOT,'supabase','migrations','20260830195959_drx_phase8p_clinical_reference_fk_index.sql'),
  'utf8'
);
const rollback = fs.readFileSync(
  path.join(ROOT,'supabase','drx-phase8p-clinical-reference-fk-index-rollback.sql'),
  'utf8'
);

assert.match(
  migration,
  /create index if not exists drx_phase8_clinical_reference_discovery_idx[\s\S]*?phase8_pilot_clinical_references_v1\(exact_discovery_id\)/i
);
assert.doesNotMatch(migration,/drop\s+table/i);
assert.doesNotMatch(migration,/update\s+/i);
assert.doesNotMatch(migration,/delete\s+from/i);
assert.match(
  rollback,
  /drop index if exists drx_dose\.drx_phase8_clinical_reference_discovery_idx/i
);
assert.doesNotMatch(rollback,/\bcascade\b/i);

console.log('DRx Phase 8P clinical-reference FK index contract: PASS');
