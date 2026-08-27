'use strict';

/* P1.22 — roja e ekuivalencës bëhet e vërtetë.

   Rregulli `'\bas\b'` nuk përputhi kurrë asgjë: në PostgreSQL `\b` është
   backspace, jo kufi fjale — kufiri shkruhet `\y`. Krahu " as " i rojes ka
   qenë i vdekur që kur u shkrua, ndaj 56 produkte u zgjidhën automatikisht pa
   kaluar kurrë nga rishikimi.

   Rezultatet ishin të sakta, por për fat: të 40 shprehjet ishin i njëjti model
   `<baza> (as <kripa>)`. Ky migrim e ndez rojen dhe njëkohësisht i regjistron
   ato shprehje si të lexuara, që të mbeten të zgjidhura — tani me shqyrtim. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'supabase', 'migrations', '20260827164722_p1_make_equivalence_guard_live.sql');
const MIGRATION = fs.readFileSync(FILE, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827164722' &&
    item.name === 'p1_make_equivalence_guard_live'
  ),
  'P1.22 migration must be present in production migration history.'
);

/* Kufiri i fjalës duhet të jetë `\y`. Nëse ndonjëherë kthehet `\b`, roja
   heshtazi ndalon së punuari dhe çdo shprehje me " as " zgjidhet vetvetiu. */
assert.doesNotMatch(
  MIGRATION,
  /\\bas\\b/,
  'PostgreSQL word boundary is \\y — \\b is backspace and silently matches nothing.'
);
assert.ok(
  (MIGRATION.match(/\\yas\\y/g) || []).length >= 3,
  'All three guard sites (single view, delimiter view, reason code) must use \\y.'
);

/* Porta rri e mbyllur si parazgjedhje te të dyja pamjet. */
for (const view of ['medindex_p1_safe_single_v1', 'medindex_p1_resolved_delimiter_parts_v2']) {
  assert.ok(MIGRATION.includes(`create or replace view public.${view}`), `${view} must be redefined.`);
}
assert.ok(
  (MIGRATION.match(/from public\.substance_equivalence_cleared_v1 e/g) || []).length >= 2,
  'Both the single and the delimiter gate must consult the cleared list.'
);

/* Pamja e pjesëve grupon edhe sipas `active_substance_key`, përndryshe kushti i
   ri te `having` do të ishte i pavlefshëm. */
assert.match(
  MIGRATION,
  /group by p\.source_drug_id,d\.active_substance,d\.active_substance_key/,
  'The eligible CTE must group by the key its HAVING clause reads.'
);

/* Lista e pastruar mban arsyen dhe vendimmarrësin për çdo rresht. */
assert.match(MIGRATION, /create table if not exists public\.substance_equivalence_cleared_v1/i);
for (const column of ['source_key', 'reason', 'decided_by', 'reviewed_at', 'evidence_urls']) {
  assert.match(MIGRATION, new RegExp(`\\b${column}\\b`), `Cleared list must record ${column}.`);
}

/* Vendimet e mëparshme nuk humbin: të 53 shprehjet e shqyrtuara te P1.20
   trashëgohen te lista e re. */
assert.match(
  MIGRATION,
  /from public\.substance_equivalence_reviewed_v1 e\s*\non conflict \(source_key\) do nothing/,
  'The P1.20 reviewed expressions must carry over into the cleared list.'
);

/* Disa nga 40 shprehjet e lexuara në këtë raund. */
for (const key of [
  'neomycinassulfatebacitracin',
  'piperacillinassodiumsalttazobactamassodiumsalt',
  'fentanylascitrate',
  'goserelinacetatecalcas100peptidebase',
  'montelukastas416mgmontelukastsodium',
]) {
  assert.ok(MIGRATION.includes(`('${key}')`), `Cleared expression missing from P1.22: ${key}`);
}

/* Rojet e P0. */
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.22 live equivalence guard contract passed.');
