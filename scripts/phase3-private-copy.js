'use strict';

const DataApi = require('../lib/neon-data-api.js');

const PREVIEW_BRANCH = 'supabase-write-cutover-20260819';
const PAGE_SIZE = 200;
const WRITE_BATCH = 50;
const TABLES = [
  'medindex_users',
  'user_favorites',
  'user_prescriptions',
  'drive_sync_sources',
  'drive_sheet_rows',
  'sync_runs',
  'sync_outbox',
  'audit_logs',
];

function active() {
  return process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === PREVIEW_BRANCH;
}

function chunks(rows, size) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) output.push(rows.slice(index, index + size));
  return output;
}

async function readAllFromNeon(table) {
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await DataApi.neonRequest(
      `${table}?select=*&order=${encodeURIComponent('id.asc')}&limit=${PAGE_SIZE}&offset=${offset}`,
      { timeoutMs:15_000, label:`Phase 3 Neon ${table}` }
    );
    const rows = Array.isArray(data) ? data : [];
    output.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (output.length > 10000) throw new Error(`Phase 3 ${table}: unexpected row count > 10000.`);
  }
  return output;
}

async function writeSupabase(table, rows) {
  if (!rows.length) return;
  for (const batch of chunks(rows, WRITE_BATCH)) {
    await DataApi.supabaseRequest(
      `${table}?on_conflict=id`,
      {
        method:'POST',
        body:batch,
        prefer:'resolution=merge-duplicates,return=minimal',
        timeoutMs:15_000,
        label:`Phase 3 Supabase ${table}`,
      },
      { privileged:true }
    );
  }
}

async function readSupabaseIds(table) {
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await DataApi.supabaseRequest(
      `${table}?select=id&order=${encodeURIComponent('id.asc')}&limit=${PAGE_SIZE}&offset=${offset}`,
      { timeoutMs:15_000, label:`Phase 3 verify ${table}` },
      { privileged:true }
    );
    const rows = Array.isArray(data) ? data : [];
    output.push(...rows.map(row => String(row.id)));
    if (rows.length < PAGE_SIZE) break;
  }
  return output;
}

async function main() {
  if (!active()) {
    console.log('[phase3-private-copy] skipped outside protected Preview branch');
    return;
  }
  if (DataApi.writeProvider() !== 'neon') {
    throw new Error('Phase 3 copy requires writes to remain on Neon during source extraction.');
  }

  const result = {};
  for (const table of TABLES) {
    const sourceRows = await readAllFromNeon(table);
    await writeSupabase(table, sourceRows);
    const targetIds = await readSupabaseIds(table);
    const sourceIds = sourceRows.map(row => String(row.id)).sort();
    const targetSorted = targetIds.sort();
    if (sourceIds.length !== targetSorted.length || sourceIds.some((id, index) => id !== targetSorted[index])) {
      throw new Error(`Phase 3 parity failed for ${table}: Neon=${sourceIds.length}, Supabase=${targetSorted.length}.`);
    }
    result[table] = sourceIds.length;
    console.log(`[phase3-private-copy] ${table}: ${sourceIds.length}/${targetSorted.length}`);
  }
  console.log('[phase3-private-copy] COMPLETE', JSON.stringify(result));
}

main().catch(error => {
  console.error('[phase3-private-copy] FAILED', error?.message || error);
  process.exitCode = 1;
});
