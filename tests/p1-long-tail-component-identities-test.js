'use strict';

/* P1.21 — bishti i gjatë i përbërësve.

   Pas P1.20 nuk mbeti më asnjë levë e madhe: çdo përbërës i pazgjidhur bllokonte
   saktësisht një produkt. Ky batch e mbulon atë bisht — 39 substanca që thjesht
   nuk kishin ende identitet, dhe 37 variante shkrimi ku burimi thotë të njëjtën
   gjë me fjalë të tjera. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827163438_p1_long_tail_component_identities.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827163438' &&
    item.name === 'p1_long_tail_component_identities'
  ),
  'P1.21 migration must be present in production migration history.'
);

/* Substanca të zakonshme klinike që mungonin krejt nga katalogu. */
for (const key of [
  'chlortalidone', 'chlorzoxazone', 'calcipotriol', 'entacapone', 'methocarbamol',
  'perphenazine', 'triamterene', 'valproicacid', 'zincoxide', 'prilocaine',
  'guaifenesin', 'ceftazidime', 'ferroussulfate', 'neomycin',
]) {
  assert.ok(MIGRATION.includes(`('${key}','`), `Long-tail concept missing from P1.21: ${key}`);
}

/* Variante shkrimi: gabime shtypi, shkurtesa dhe shprehje burimore. */
for (const [variant, canonical] of [
  ['lizinopril', 'lisinopril'],
  ['vasartan', 'valsartan'],
  ['hydroclorothyazide', 'hydrochlorothiazide'],
  ['betamthasonediporpionate', 'betamethasonedipropionate'],
  ['ceftroaxonedisodiumhemiheptahydrate', 'ceftriaxonedisodium'],
  ['fluoxetinehcl', 'fluoxetinehydrochloride'],
  ['neomycinassulfate', 'neomycinsulfate'],
  ['perindoprilerbumine', 'perindopriltertbutylamine'],
  ['chlorhexidinegluconate012', 'chlorhexidinegluconate'],
  ['lidocainebase', 'lidocaine'],
]) {
  assert.ok(
    MIGRATION.includes(`('${variant}','${canonical}'`),
    `Long-tail alias missing from P1.21: ${variant} -> ${canonical}`
  );
}

/* Baza dhe kripa mbeten identitete të ndara — pa këto roje, një raund i
   mëvonshëm ngjashmërie do t'i bashkonte. */
for (const [base, salt] of [
  ['neomycin', 'neomycinsulfate'],
  ['calciumchloride', 'calciumchloridedihydrate'],
  ['lidocaine', 'lidocainehydrochloridemonohydrate'],
]) {
  assert.ok(
    MIGRATION.includes(`('${base}','${salt}'`),
    `Salt-separation guard missing from P1.21: ${base} vs ${salt}`
  );
}
assert.match(MIGRATION, /precise_ingredient_guard/);

/* "Sugar spheres" është bërthama e peletit, jo përbërës aktiv. Nuk shtohet. */
assert.doesNotMatch(MIGRATION, /\('sugarspheres'/);

/* Fluoksetina bazë mbetet jashtë edhe këtu, për të njëjtën arsye si te P1.19. */
assert.doesNotMatch(MIGRATION, /\('fluoxetine','/);

/* Rojet e P0: regjistri i papërpunuar dhe forma e barit nuk preken. */
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.21 long-tail component identity contract passed.');
