'use strict';

// Regression guard for a defect that cost a production migration.
//
// 20260829012500_phase5_system_health_snapshot declared a plpgsql variable
// named `started_at` while its recent-runs subquery ordered by the
// sync_runs.started_at column. Postgres could not tell the two apart and
// raised 42702 "column reference started_at is ambiguous". Because that
// migration ends by calling the function it defines, it failed on every
// apply attempt - the disk-full incident hid the defect rather than caused
// it. The variable is now fn_started_at.
//
// This test rejects any migration that declares a plpgsql variable whose
// bare name is also a column name the same file selects or orders by.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations');

// Column names that appear unqualified inside subqueries across these
// migrations. A plpgsql variable sharing one of these names is ambiguous.
const AMBIGUOUS_COLUMN_NAMES = new Set([
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
  'changed_at',
  'applied_at',
  'refreshed_at',
  'dirty_at',
  'last_synced_at',
  'status',
  'source',
  'id',
]);

// `name type := expr;` or `name type;` inside a DECLARE block.
const DECLARE_LINE = /^\s*([a-z_][a-z0-9_]*)\s+[a-z][a-z0-9_ ().,]*?\s*(?::=|;)/i;

function declaredVariables(sql) {
  const found = new Set();
  let inDeclare = false;
  for (const rawLine of sql.split('\n')) {
    const line = rawLine.trim();
    if (/^declare\b/i.test(line)) { inDeclare = true; continue; }
    if (/^begin\b/i.test(line)) { inDeclare = false; continue; }
    if (!inDeclare || !line || line.startsWith('--')) continue;
    const match = DECLARE_LINE.exec(line);
    if (match) found.add(match[1].toLowerCase());
  }
  return found;
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
assert.ok(files.length > 0, 'expected migration files to scan.');

const offenders = [];
for (const file of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  if (!/language\s+plpgsql/i.test(sql)) continue;
  for (const variable of declaredVariables(sql)) {
    if (AMBIGUOUS_COLUMN_NAMES.has(variable)) {
      offenders.push(`${file}: plpgsql variable "${variable}" collides with a column of the same name`);
    }
  }
}

assert.deepEqual(offenders, [],
  'plpgsql variables must not shadow column names (Postgres 42702):\n  ' + offenders.join('\n  '));

// Pin the specific migration that regressed.
const phase5 = fs.readFileSync(
  path.join(MIGRATIONS_DIR, '20260829012500_phase5_system_health_snapshot.sql'), 'utf8');
assert.ok(phase5.includes('fn_started_at timestamptz := clock_timestamp();'),
  'phase 5 snapshot must keep the renamed fn_started_at variable.');
assert.ok(!/^\s*started_at\s+timestamptz/m.test(phase5),
  'phase 5 snapshot must not re-declare a bare started_at variable.');
assert.ok(phase5.includes('order by r.started_at desc'),
  'the recent-runs aggregate must still order by the sync_runs column.');

console.log(`DRx migration plpgsql collision guard passed (${files.length} migrations scanned).`);
