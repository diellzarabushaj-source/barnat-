'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(ROOT, 'supabase/drx-dose-v3-additive-candidate.sql'), 'utf8');
const status = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/drx-dose-v3-supabase-candidate-status.json'), 'utf8'));
const proposal = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/drx-dose-v3-schema-proposal.json'), 'utf8'));

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  const header = Buffer.from('blob ' + body.length + '\0', 'utf8');
  return crypto.createHash('sha1').update(header).update(body).digest('hex');
}

const sqlTables = [...sql.matchAll(/create table if not exists public\.([a-z0-9_]+)\s*\(/gi)]
  .map(match => match[1]);
const rlsTables = [...sql.matchAll(/alter table public\.([a-z0-9_]+) enable row level security/gi)]
  .map(match => match[1]);
const proposalTables = proposal.tables.map(table => table.name);

assert.equal(status.applied, false);
assert.equal(status.publicationAllowed, false);
assert.equal(status.tableCount, 12);
assert.equal(proposal.tableCount, 12);
assert.equal(sqlTables.length, 12);
assert.deepEqual([...sqlTables].sort(), [...proposalTables].sort());
assert.deepEqual([...rlsTables].sort(), [...sqlTables].sort());

assert.equal(status.candidateGitBlobSha, gitBlobSha(sql));
assert.equal(status.security.rlsTableCount, 12);
assert.equal(status.repositoryStaticAudit.rlsCoverage, '12/12');
assert.equal(status.repositoryStaticAudit.directClientWriteGrants, 0);
assert.equal(status.repositoryStaticAudit.status, 'STATIC_VERIFIED_NOT_LIVE_APPLIED');

const publishedRead = proposal.tables
  .filter(table => table.exposure === 'published_read_only')
  .map(table => table.name)
  .sort();
assert.deepEqual([...status.security.publishedReadOnlyTables].sort(), publishedRead);

const nonClient = [
  ...status.security.serviceOnlyTables,
  ...status.security.adminOnlyTables,
].sort();
assert.deepEqual(
  nonClient,
  proposal.tables.filter(table => table.exposure !== 'published_read_only').map(table => table.name).sort()
);

assert.doesNotMatch(sql, /\bsecurity\s+definer\b/i);
assert.doesNotMatch(
  sql,
  /grant\s+(?:insert|update|delete|truncate|references|trigger|all(?:\s+privileges)?)\b[\s\S]*?\bto\s+(?:anon|authenticated)\b/i
);

console.log('DRx V3 candidate SQL/status/proposal parity passed.');
