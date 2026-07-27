'use strict';

const { execFileSync } = require('node:child_process');
const { neonRequest, exactCount } = require('../lib/neon-data-api');

const scopes = [
  ['registry', 'drugs'],
  ['dosage', 'dosage_regimens'],
  ['icd', 'icd_codes'],
  ['labs', 'lab_tests'],
];

async function tableCount(table) {
  const { response } = await neonRequest(`${table}?select=id&limit=1`, {
    headers:{ Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  return exactCount(response);
}

async function publishOfficialRegistry() {
  await neonRequest('drugs?editorial_status=neq.archived&editorial_override=eq.false', {
    method:'PATCH',
    body:{ editorial_status:'published', is_published:true },
    prefer:'return=minimal',
  });
}

async function latestCompletedSync(startedAt) {
  const { data } = await neonRequest(
    `sync_runs?select=id,status,completed_at,error_summary,metadata&status=eq.completed&completed_at=gte.${encodeURIComponent(startedAt)}&order=completed_at.desc&limit=1`
  );
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error('Sinkronizimi Neon nuk krijoi një sync_run të përfunduar për këtë ekzekutim.');
  return row;
}

async function publishVersions(syncRun, counts) {
  const now = new Date().toISOString();
  const rows = scopes.map(([label, table]) => ({
    source_type:'google_sheets',
    source_ref:table,
    label,
    status:'published',
    imported_at:now,
    published_at:now,
    metadata:{
      syncRunId:syncRun.id,
      rowCount:counts[label],
      vercelCommit:process.env.VERCEL_GIT_COMMIT_SHA || null,
    },
  }));
  await neonRequest('content_versions', {
    method:'POST',
    body:rows,
    prefer:'return=minimal',
  });
}

async function run() {
  if (!process.env.VERCEL) {
    console.log('MedIndex Neon sync pipeline skipped outside Vercel.');
    return;
  }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    await tableCount('drugs');
    console.log('MedIndex Neon preview connection verified; sync pipeline runs only in production.');
    return;
  }

  const startedAt = new Date(Date.now() - 1000).toISOString();
  execFileSync(process.execPath, ['scripts/sync-neon-from-sheets.js'], { stdio:'inherit' });
  execFileSync(process.execPath, ['scripts/sync-neon-structured-dosage.js'], { stdio:'inherit' });

  const syncRun = await latestCompletedSync(startedAt);
  await publishOfficialRegistry();

  const counts = Object.fromEntries(await Promise.all(scopes.map(async ([label, table]) => [label, await tableCount(table)])));
  if (Number(counts.registry) < 3500) throw new Error(`Registry sync gate failed: ${counts.registry} barna.`);
  if (Number(counts.dosage) < 1400) throw new Error(`Dosage sync gate failed: ${counts.dosage} regjime.`);
  if (Number(counts.icd) < 700) throw new Error(`ICD sync gate failed: ${counts.icd} kode.`);
  if (Number(counts.labs) < 110) throw new Error(`Lab sync gate failed: ${counts.labs} analiza.`);

  await publishVersions(syncRun, counts);
  console.log(`MedIndex Neon atomic publication completed: ${JSON.stringify(counts)}`);
}

run().catch(error => {
  console.error(`MedIndex Neon sync pipeline failed: ${error.message}`);
  process.exitCode = 1;
});
