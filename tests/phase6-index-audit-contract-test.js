'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(ROOT, 'sql/phase6-index-audit.sql'), 'utf8');

assert.match(sql, /begin\s+read\s+only/i);
assert.match(sql, /rollback\s*;/i);
assert.match(sql, /pg_stat_user_indexes/i);
assert.match(sql, /pg_stat_user_tables/i);
assert.match(sql, /extensions\.pg_stat_statements/i);
assert.match(sql, /pg_relation_size/i);
assert.match(sql, /foreign keys with no left-prefix supporting index/i);
assert.match(sql, /explain\s*\(analyze,\s*buffers/i);
assert.match(sql, /medindex_search_drugs_v2\('paracetamol',\s*20\)/i);

for (const indexName of [
  'drugs_search_idx',
  'sync_outbox_entity_idx',
  'sync_outbox_processing_idx',
  'drive_sheet_rows_hash_idx',
  'drive_sheet_rows_payload_gin_idx',
  'drive_sheet_rows_source_row_idx',
]) {
  assert.ok(sql.includes(indexName), indexName + ' must be present in the audit pack.');
}

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
  assert.doesNotMatch(sql, forbidden, 'Phase 6 evidence pack must remain read-only.');
}

console.log('Phase 6 read-only index audit contract passed.');
