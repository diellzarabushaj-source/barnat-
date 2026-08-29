'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(ROOT, 'sql/phase8-identity-rekey-audit.sql'), 'utf8');

assert.match(sql, /begin\s+read\s+only/i);
assert.match(sql, /rollback\s*;/i);
assert.match(sql, /profiles\.legacy_user_id/i);
assert.match(sql, /auth\.users/i);
assert.match(sql, /user_favorites/i);
assert.match(sql, /user_prescriptions/i);
assert.match(sql, /user_drugs/i);
assert.match(sql, /user_notes/i);
assert.match(sql, /medindex_users/i);
assert.match(sql, /encrypted_prescriptions_requiring_runtime_rekey/i);

for (const forbidden of [
  /\bdrop\s+(table|index|view|function|schema)\b/i,
  /\bcreate\s+(table|index|view|function|schema)\b/i,
  /\balter\s+(table|index|view|function|schema)\b/i,
  /\btruncate\b/i,
  /\breindex\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+[a-z_"][a-z0-9_".]*\s+set\b/i,
  /\bdelete\s+from\b/i,
]) {
  assert.doesNotMatch(sql, forbidden, 'Phase 8 identity audit must remain read-only.');
}

console.log('Phase 8 read-only identity re-key audit contract passed.');
