'use strict';

/* P1.19 — disa kombinime mbeteshin në rishikim jo se ishin të paqarta, por se
   emri bazë i një përbërësi nuk ekzistonte fare si koncept: regjistri shkruan
   "Fluticasone Propionate; Salmeterol", ndërsa e vetmja substancë e njohur ishte
   salmeterol xinafoat. Baza dhe kripa janë dy identitete; ky migrim shton bazën
   dhe e regjistron ndarjen, që askush të mos i bashkojë më vonë. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827145710_p1_base_ingredient_identities.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827145710' &&
    item.name === 'p1_base_ingredient_identities'
  ),
  'P1.19 migration must be present in production migration history.'
);

/* Identitetet bazë të shtuara. */
for (const key of [
  'salmeterol', 'enalapril', 'lercanidipine', 'piperacillin', 'tazobactam',
  'thiaminenitrate', 'sodiumhydroxide', 'disodiumphosphatedodecahydrate',
  'magnesiumacetatetetrahydrate', 'triglyceridesmediumchain',
]) {
  assert.ok(
    MIGRATION.includes(`'${key}','`),
    `Base identity missing from P1.19: ${key}`
  );
}

/* Variantet e shkrimit dhe sinonimi zyrtar. */
for (const [variant, canonical] of [
  ['epinephrine', 'adrenalineepinephrine'],
  ['lisinoprildehydrate', 'lisinoprildihydrate'],
  ['formoterolfumaratedehydrous', 'formoterolfumaratedihydrate'],
  ['piperacillinsodim', 'piperacillinsodium'],
]) {
  assert.ok(
    MIGRATION.includes(`('${variant}','${canonical}'`),
    `Alias missing from P1.19: ${variant} -> ${canonical}`
  );
}

/* Çdo bazë e re duhet të mbajë një refuzim bashkimi kundrejt kripës së vet:
   pa këtë, një raund i mëvonshëm ngjashmërie do t'i bashkonte. */
for (const [base, salt] of [
  ['salmeterol', 'salmeterolxinafoate'],
  ['enalapril', 'enalaprilmaleate'],
  ['lercanidipine', 'lercanidipinehydrochloride'],
  ['piperacillin', 'piperacillinsodium'],
  ['tazobactam', 'tazobactamsodium'],
  ['thiaminenitrate', 'thiaminehydrochloride'],
  ['adrenalineepinephrine', 'epinephrinebitartrate'],
]) {
  assert.ok(
    MIGRATION.includes(`('${base}','${salt}'`),
    `Salt-separation guard missing from P1.19: ${base} vs ${salt}`
  );
}
assert.match(MIGRATION, /precise_ingredient_guard/);

/* Fluoksetina bazë NUK shtohet këtu: një produkt e shkruan
   "Fluoxetine hydrochloride; Fluoxetine", pra e njëjta substancë dy herë, dhe do
   të zgjidhej gabimisht si kombinim me dy përbërës. Mbetet për rishikim. */
assert.doesNotMatch(MIGRATION, /\('fluoxetine','/);

/* Rojet e P0: regjistri i papërpunuar dhe forma e barit nuk preken. */
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.19 base ingredient identity contract passed.');
