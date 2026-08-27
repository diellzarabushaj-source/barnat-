'use strict';

/* P1.18b — kur i njëjti përbërës shfaqet dy herë brenda një shprehjeje burimore
   ("Aprepitant; Aprepitant"), produkti nuk ka pse të mbetet në rishikim: identiteti
   është një, vetëm teksti është i dyfishuar. Ky migrim e palos dyfishimin, por
   ruan gjurmën — sa herë u shfaq dhe me çfarë fjalësh — që asgjë të mos zhduket
   pa u regjistruar. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827145654_p1_duplicate_component_identity_collapse.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827145654' &&
    item.name === 'p1_duplicate_component_identity_collapse'
  ),
  'Duplicate-collapse migration must be present in production migration history.'
);

/* Gjurma e dyfishimit ruhet, nuk hidhet. */
assert.match(MIGRATION, /add column if not exists source_occurrence_count integer not null default 1/i);
assert.match(MIGRATION, /add column if not exists source_terms text\[\] not null default/i);
assert.match(MIGRATION, /add column if not exists source_component_count integer/i);
assert.match(MIGRATION, /add column if not exists duplicate_component_count integer not null default 0/i);

/* Një rresht i palosur deklarohet si i tillë, jo si përputhje e saktë. */
assert.match(MIGRATION, /'DELIMITER_DEDUP'/);
assert.match(MIGRATION, /DUPLICATE_SOURCE_COMPONENT_COLLAPSED/);

/* Numërimi burimor nuk mund të jetë më i vogël se ai i pritur, dhe as negativ. */
assert.match(MIGRATION, /source_component_count\s*>=\s*expected_component_count/i);
assert.match(MIGRATION, /duplicate_component_count\s*>=\s*0/i);

/* Rifreskimi e verifikon vetë koherencën e numërimeve para se t'i besojë. */
assert.match(MIGRATION, /invalid source occurrence counts/i);

/* Shprehjet e ekuivalencës mbeten jashtë zgjidhjes automatike. */
assert.match(MIGRATION, /equivalent to\|corresponding to/i);

/* Rojet e P0: regjistri i papërpunuar dhe forma e barit nuk preken. */
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.18b duplicate component collapse contract passed.');
