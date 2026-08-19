'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const historicalPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260819165505_phase4_trusted_legacy_owner_claim.sql'
);
const safeOverridePath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260819193000_phase4_safe_owner_claim_mapping_only.sql'
);

const historicalSql = fs.readFileSync(historicalPath, 'utf8');
const sql = fs.readFileSync(safeOverridePath, 'utf8');

// The historical migration moved IDs. It remains immutable as migration history,
// but the later override must replace that behavior before any real owner claim.
assert.match(historicalSql, /update public\.user_prescriptions\s+set user_id = p_auth_user_id/i);

assert.match(sql, /create or replace function private\.claim_legacy_owner\s*\(/i);
assert.match(sql, /create or replace function private\.rollback_legacy_owner_claim\s*\(/i);
assert.match(sql, /security invoker/i);
assert.doesNotMatch(sql, /security definer/i);
assert.match(sql, /set search_path = ''/i);

assert.match(
  sql,
  /revoke execute on function private\.claim_legacy_owner\([\s\S]*?from public, anon, authenticated;/i
);
assert.match(
  sql,
  /revoke execute on function private\.rollback_legacy_owner_claim\([\s\S]*?from public, anon, authenticated;/i
);

for (const guard of [
  'PHASE4_AUTH_USER_NOT_FOUND',
  'PHASE4_AUTH_EMAIL_MISMATCH',
  'PHASE4_PROFILE_NOT_FOUND',
  'PHASE4_PROFILE_NOT_ACTIVE',
  'PHASE4_PROFILE_ALREADY_MAPPED',
  'PHASE4_LEGACY_UUID_ALREADY_CLAIMED',
  'PHASE4_LEGACY_COUNT_MISMATCH',
  'PHASE4_TARGET_NOT_EMPTY',
  'PHASE4_POST_CLAIM_VERIFICATION_FAILED',
  'PHASE4_ROLLBACK_PROFILE_STATE_MISMATCH',
  'PHASE4_ROLLBACK_COUNT_MISMATCH',
]) {
  assert.ok(sql.includes(guard), `Missing fail-closed guard ${guard}`);
}

// Phase 4 must never move encrypted personal rows. Prescription AAD includes
// the legacy UUID, so an ID-only remap would make ciphertext unreadable.
assert.doesNotMatch(sql, /update public\.user_favorites\s+set user_id\s*=/i);
assert.doesNotMatch(sql, /update public\.user_prescriptions\s+set user_id\s*=/i);
assert.match(sql, /encryption-aware rekey/i);
assert.match(sql, /set role = 'admin',[\s\S]*legacy_user_id = p_legacy_user_id/i);
assert.match(sql, /'data_moved', false/i);
assert.match(sql, /phase4_attach_legacy_owner/i);
assert.match(sql, /phase4_rollback_legacy_owner_mapping/i);
assert.match(sql, /insert into public\.audit_logs/i);

console.log('Phase 4 safe legacy owner mapping-only migration gate passed.');
