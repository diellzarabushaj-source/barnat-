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

assert.equal(status.applied, true);
assert.equal(status.publicationAllowed, false);
assert.equal(status.databaseGatewayEvidence.listMigrations, 'SUCCESS_80_MIGRATIONS');
assert.equal(status.databaseGatewayEvidence.ddlAttemptedByThisRun, true);
assert.equal(status.databaseGatewayEvidence.migrationAppliedByThisRun, true);
assert.match(status.databaseGatewayEvidence.postgresLogError, /No space left on device/);
assert.equal(status.tableCount, 12);
assert.equal(proposal.tableCount, 12);
assert.equal(sqlTables.length, 12);
assert.deepEqual([...sqlTables].sort(), [...proposalTables].sort());
assert.deepEqual([...rlsTables].sort(), [...sqlTables].sort());

assert.equal(status.candidateGitBlobSha, gitBlobSha(sql));
assert.equal(status.security.rlsTableCount, 12);
assert.equal(status.repositoryStaticAudit.rlsCoverage, '12/12');
assert.equal(status.repositoryStaticAudit.directClientWriteGrants, 0);
assert.equal(status.repositoryStaticAudit.status, 'LIVE_APPLIED_ADDITIVE_SHADOW_FAIL_CLOSED');
assert.equal(status.liveVerification.v3Tables, 12);
assert.equal(status.liveVerification.v3RlsEnabledTables, 12);
assert.equal(status.liveVerification.clientWriteGrants, 0);
assert.equal(status.liveVerification.sourceSnapshots, 25);
assert.equal(status.liveVerification.sourceSections, 0);
assert.equal(status.liveVerification.publishedRules, 0);
assert.equal(status.security.tablePublicRoleRevoked, true);
assert.equal(status.security.productPublicationTrigger, true);
assert.equal(status.security.rulePublicationTrigger, true);
assert.equal(status.security.insertPublicationGuard, true);
assert.equal(status.security.ruleSourceSection42ArtifactRequired, true);
assert.equal(status.security.preexistingShadowSchemaFailsClosed, true);
assert.equal(status.security.sourceSectionShaPinned, true);
assert.equal(status.security.runtimeProvenanceRevalidation, true);
assert.equal(status.security.publishedProvenanceMutationLocks, true);
assert.equal(status.repositoryStaticAudit.sourceSectionHashPinned, true);
assert.equal(status.repositoryStaticAudit.runtimeSnapshotAndSectionRevalidation, true);
assert.equal(status.repositoryStaticAudit.publishedProvenanceMutationLocks, true);
assert.equal(status.security.verifiedAdjustmentReadRls, true);
assert.equal(status.security.adjustmentSourceSectionShaPinned, true);
assert.equal(status.security.runtimeAdjustmentProvenanceRevalidation, true);
assert.equal(status.repositoryStaticAudit.verifiedAdjustmentReadRls, true);
assert.equal(status.repositoryStaticAudit.adjustmentSourceSectionHashPinned, true);
assert.equal(status.repositoryStaticAudit.runtimeAdjustmentProvenanceRevalidation, true);
assert.equal(status.security.adjustmentRequiredPublicationGate, true);
assert.equal(status.security.adjustmentRequiredRuntimeGate, true);
assert.equal(status.security.adjustmentRlsProvenanceRevalidation, true);
assert.equal(status.repositoryStaticAudit.adjustmentRequiredPublicationGate, true);
assert.equal(status.repositoryStaticAudit.adjustmentRequiredRuntimeGate, true);
assert.equal(status.repositoryStaticAudit.adjustmentRlsProvenanceRevalidation, true);
assert.equal(status.repositoryStaticAudit.publishedClientReadTables, 6);

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
