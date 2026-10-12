'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../scripts/backup-private-manifest.sql'), 'utf8');
const tables = ['public.user_notes', 'public.user_favorites', 'public.user_prescriptions', 'public.medindex_users', 'note_write_private.receipts', 'prescription_write_private.receipts', 'note_write_private.control', 'prescription_write_private.control'];
async function main() {
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA note_write_private; CREATE SCHEMA prescription_write_private;');
    for (const table of tables) await db.exec(`CREATE TABLE ${table} (id int, payload jsonb);`);
    await assert.rejects(db.exec(sql), /salt is missing or invalid/);
    await db.query("SELECT set_config('drx.backup_fingerprint_salt', $1, false)", ['a'.repeat(64)]);
    const capture = async () => (await db.exec(sql)).at(-1).rows;
    const empty = await capture();
    assert.equal(empty.length, 16);
    for (const row of empty) assert.match(row.entry, /^\w+_private_(count=0|fingerprint=[a-f0-9]{64})$/);
    const payload = {text:'  Rreshti\nme ë dhe ç  ', nested:{deleted:true, revision:7}, secret:'SYNTHETIC_PRIVATE_MARKER'};
    for (const table of tables) await db.query(`INSERT INTO ${table} VALUES (1, $1), (2, $1)`, [payload]);
    const original = await capture();
    assert.ok(!JSON.stringify(original).includes(payload.secret));
    assert.ok(!JSON.stringify(original).includes('a'.repeat(64)));
    await db.exec('BEGIN; DELETE FROM public.user_notes WHERE id=1; INSERT INTO public.user_notes SELECT 1,payload FROM public.user_notes WHERE id=2;');
    assert.deepEqual(await capture(), original, 'Physical row order cannot affect parity');
    await db.exec('ROLLBACK;');
    for (const table of tables) {
      await db.exec('BEGIN;');
      await db.query(`UPDATE ${table} SET payload=$1 WHERE id=1`, [{...payload, text:payload.text.trim()}]);
      assert.notDeepEqual(await capture(), original, `Changed row detected in ${table}`);
      await db.exec('ROLLBACK; BEGIN;');
      await db.exec(`DELETE FROM ${table} WHERE id=1`);
      assert.notDeepEqual(await capture(), original, `Missing row detected in ${table}`);
      await db.exec('ROLLBACK;');
    }
    assert.deepEqual(await capture(), original, 'Read-only capture leaves all rows untouched');
    await db.query("SELECT set_config('drx.backup_fingerprint_salt', $1, false)", ['b'.repeat(64)]);
    assert.notDeepEqual(await capture(), original, 'Fresh salts prevent stable cross-run private fingerprints');
    await db.query("SELECT set_config('drx.backup_fingerprint_salt', $1, false)", ['invalid']);
    await assert.rejects(db.exec(sql), /salt is missing or invalid/);
    console.log('Private backup parity: all eight tables, empty rows, exact Unicode/whitespace, mutation/deletion, row ordering, ephemeral salt and output privacy passed in PostgreSQL.');
  } finally { await db.close(); }
}
main().catch(() => { console.error('Private backup parity regression failed.'); process.exitCode=1; });
