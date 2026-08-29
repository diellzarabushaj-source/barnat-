'use strict';

/* Porta e publikimit të dozologjisë.
 *
 * Runtime-i lexon vetëm rreshta të publikuar, prandaj një rregull i paplotë
 * nuk arrin te mjeku. Ky test ruan portën tjetër — atë që e ndalon një rregull
 * të papërfunduar të kalojë NË `verified`/`published` — sepse ajo portë jeton
 * në bazën e të dhënave dhe humbet pa u vënë re. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const MIGRATION_VERSION = '20260829002018';
const MIGRATION_NAME = 'harden_dose_rule_publication_gate';
const migration = read(`supabase/migrations/${MIGRATION_VERSION}_${MIGRATION_NAME}.sql`);
const history = JSON.parse(read('supabase/migration-history.json'));

const calculator = read('lib/dose-calculator-handler.js');
const safety = read('lib/dose-safety-handler.js');
const card = read('lib/dosage-card-handler.js');

/* ── Migrimi është në historinë e prodhimit ─────────────────────────────── */

assert.ok(
  history.migrations.some(item =>
    String(item.version) === MIGRATION_VERSION && String(item.name) === MIGRATION_NAME),
  'Publication gate migration must be present in the production migration history.'
);

/* ── Çdo kufizim i portës është i deklaruar ─────────────────────────────── */

const gatedConstraints = [
  'dose_rules_v2_published_frequency_complete_check',
  'dose_rules_v2_published_duration_complete_check',
  'dose_rules_v2_published_prn_ceiling_check',
  'dose_safety_v2_published_block_action_check',
];
const unconditionalConstraints = [
  'dose_rules_v2_dose_ceiling_order_check',
  'dose_rules_v2_daily_frequency_ceiling_check',
];

for (const name of [...gatedConstraints, ...unconditionalConstraints]) {
  assert.ok(
    migration.includes(`add constraint ${name} check`),
    `Migration must declare constraint ${name}.`
  );
}

/* Porta duhet të mbetet e varur nga statusi: `draft`/`in_review` guxojnë të
   jenë të paplota, përndryshe puna redaksionale detyrohet të shpikë vlera
   klinike vetëm që rreshti të ruhet. */
for (const name of gatedConstraints) {
  const body = migration.slice(migration.indexOf(`add constraint ${name} check`));
  const clause = body.slice(0, body.indexOf(');') + 2);
  assert.match(
    clause,
    /editorial_status not in \('verified', 'published'\)/,
    `${name} must only bind at the verified/published boundary.`
  );
}

/* Kufizimet pa kusht janë invariante; nuk guxojnë ta kenë atë dalje. */
for (const name of unconditionalConstraints) {
  const body = migration.slice(migration.indexOf(`add constraint ${name} check`));
  const clause = body.slice(0, body.indexOf(');') + 2);
  assert.doesNotMatch(
    clause,
    /editorial_status/,
    `${name} must hold in every editorial status.`
  );
}

/* ── Rregulli PRN: mbidozimi ka gjithmonë një tavan ─────────────────────── */

assert.match(
  migration,
  /or not \(prn or frequency_mode = 'prn'\)\s*\n\s*or interval_min_hours is not null\s*\n\s*or max_doses_24h is not null/,
  'A published PRN rule must carry either a minimum interval or a 24h dose ceiling.'
);

/* ── Indeksi mbulues i çelësit të huaj ──────────────────────────────────── */

assert.match(
  migration,
  /create index if not exists user_prescriptions_chapter_key_idx\s*\n\s*on public\.user_prescriptions \(chapter_key\)/,
  'The chapter foreign key must have a covering index.'
);

/* ── Runtime-i mbetet fail-closed ───────────────────────────────────────── */

for (const [name, source] of [['calculator', calculator], ['safety', safety], ['card', card]]) {
  assert.match(
    source,
    /params\.set\('editorial_status', 'eq\.published'\)/,
    `The ${name} handler must request published rows only.`
  );
}

assert.match(
  calculator,
  /const ALLOWED_STATUSES = new Set\(\['verified', 'published'\]\)/,
  'The calculator in-memory filter still admits verified rows, so the gate must bind there too.'
);
assert.match(
  safety,
  /const ALLOWED_STATUSES = new Set\(\['published'\]\)/,
  'Safety prompts stay published-only.'
);

console.log('Dosage publication gate passed: incoherent rules cannot reach verified or published.');
