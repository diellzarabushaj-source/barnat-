'use strict';

// Regression guard for SQL that can never execute.
//
// drx-dose-v3-additive-candidate.sql opened its preflight block with a single
// dollar sign (`do $` ... `$;`) instead of a valid dollar-quote delimiter.
// Postgres rejects that with 42601 "syntax error at or near $". Because the
// preflight is the first statement in the candidate, every apply attempt would
// have failed before creating a single table - while the repository still
// reported v3CandidateReady. Static structure tests passed throughout, because
// none of them asked Postgres whether the file parses.
//
// Valid delimiters are `$$` or `$tag$`. A lone `$` used as a delimiter is not.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function collectSqlFiles() {
  const roots = [
    path.join(ROOT, 'supabase'),
    path.join(ROOT, 'supabase', 'migrations'),
    path.join(ROOT, 'sql'),
  ];
  const files = [];
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.sql')) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files.sort();
}

// A delimiter line: `do $`, `as $`, `$;` or a bare `$` on its own line.
// Anything matching is a lone-dollar delimiter, which cannot parse.
const LONE_DOLLAR_OPEN = /^\s*(?:do|as|return|language\s+\w+\s+as)\s+\$\s*$/i;
const LONE_DOLLAR_CLOSE = /^\s*\$\s*;?\s*$/;

const files = collectSqlFiles();
assert.ok(files.length > 0, 'expected SQL files to scan.');

const offenders = [];
for (const file of files) {
  const relative = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (LONE_DOLLAR_OPEN.test(line) || LONE_DOLLAR_CLOSE.test(line)) {
      offenders.push(`${relative}:${index + 1}: lone "$" used as a dollar-quote delimiter -> ${line.trim()}`);
    }
  });
}

assert.deepEqual(offenders, [],
  'dollar-quoted blocks must use $$ or $tag$, never a lone $ (Postgres 42601):\n  '
    + offenders.join('\n  '));

// A token-pairing check was tried here and removed on purpose. Dollar-quoted
// bodies contain apostrophes, so stripping single-quoted literals first (needed
// to ignore regexes like '^[0-9a-f]{64}$') corrupts the token count and reports
// balanced files as unbalanced. The lone-dollar scan above is the reliable
// signal for this defect class; a flaky guard would be worse than none.

// Pin the candidate's preflight, which is what regressed.
const candidate = fs.readFileSync(
  path.join(ROOT, 'supabase', 'drx-dose-v3-additive-candidate.sql'), 'utf8');
assert.ok(candidate.includes('do $preflight$'),
  'the V3 preflight must keep a valid dollar-quote tag.');
assert.ok(candidate.includes('$preflight$;'),
  'the V3 preflight must close with the same tag.');
assert.ok(candidate.includes('DRX_V3_PREEXISTING_SHADOW_SCHEMA'),
  'the V3 preflight must still refuse a partial or stale shadow schema.');

console.log(`DRx SQL dollar-quoting guard passed (${files.length} files scanned).`);
