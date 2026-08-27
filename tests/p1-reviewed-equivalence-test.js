'use strict';

/* P1.20 — porta e shprehjeve të ekuivalencës.

   Deri tani çdo shprehje me "equivalent to" / "corresponding to" / " as " mbetej
   jashtë zgjidhjes automatike. Rregulli ishte i sigurt por i verbër: bllokonte
   edhe formën më të zakonshme të regjistrit — kripa si përbërës, ekuivalenca si
   riformulim i bazës ose i forcës.

   Porta nuk u hap; u bë e shqyrtueshme. Vetëm çelësat e lexuar një nga një dhe
   të regjistruar te `substance_equivalence_reviewed_v1` kalojnë; çdo shprehje
   tjetër mbetet e bllokuar si më parë. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827155937_p1_reviewed_equivalence_expressions.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827155937' &&
    item.name === 'p1_reviewed_equivalence_expressions'
  ),
  'P1.20 migration must be present in production migration history.'
);

/* Lejimi rri në një tabelë të vetën, me arsye dhe vendimmarrës për çdo rresht. */
assert.match(MIGRATION, /create table if not exists public\.substance_equivalence_reviewed_v1/i);
for (const column of ['source_key', 'canonical_key', 'reason', 'decided_by', 'reviewed_at', 'evidence_urls']) {
  assert.match(MIGRATION, new RegExp(`\\b${column}\\b`), `Reviewed-equivalence table must record ${column}.`);
}
assert.match(MIGRATION, /substance_equivalence_reviewed_not_self/);

/* Porta mbetet e mbyllur si parazgjedhje: shprehja kalon vetëm nëse çelësi i saj
   gjendet te tabela e shqyrtuar. Nëse ky kusht hiqet, çdo shprehje ekuivalence
   do të zgjidhej automatikisht — pikërisht rreziku që rregulli parandalon. */
assert.match(
  MIGRATION,
  /d\.active_substance\s*!~\*\s*'\(equivalent to\|corresponding to\|\\bas\\b\)'\s*or\s*exists\s*\(\s*select 1 from public\.substance_equivalence_reviewed_v1/i,
  'The equivalence gate must stay closed except for reviewed keys.'
);

/* Forca është atribut produkti, jo identitet substance: `drugs.strength` e mban
   veç. Prandaj refuzimet e bashkimit të bazuara në forcë hiqen — ato pohonin një
   dallim që skema tashmë e ruan diku tjetër. */
assert.match(
  MIGRATION,
  /delete from public\.substance_merge_rejections[\s\S]*?forcë e ndryshme[\s\S]*?explicit strength differs/i,
  'Strength-based merge rejections must be removed, not left contradicting the concept model.'
);

/* Disa vendime përfaqësuese, secili një formë e ndryshme shprehjeje. */
for (const [source, canonical] of [
  ['atorvastatincalciumequivalentto10mgatorvastatin', 'atorvastatincalcium'],
  ['atorvastatincalciumequivalentto80mgatorvastatin', 'atorvastatincalcium'],
  ['cefuroximeaxetilpotency8167with25overdoseequivalentto250mgcefuroxime', 'cefuroximeaxetil'],
  ['paracetamol90granulateequivalenttoparacetamol', 'paracetamol'],
  ['vitamind3cholecalciferolequivalentto1500iu', 'cholecalciferol'],
  ['ferrichydroxideincomplexwithsucroseequivalenttoelementaliron', 'ferrichydroxidesucrosecomplex'],
]) {
  assert.ok(
    MIGRATION.includes(`('${source}','${canonical}'`),
    `Reviewed equivalence decision missing: ${source} -> ${canonical}`
  );
}

/* Hidrati mbetet i ndarë nga kripa e thjeshtë: atorvastatin calcium trihydrate
   nuk bashkohet me atorvastatin calcium. */
assert.ok(
  MIGRATION.includes("('atorvastatincalciumtrihydrateform1equivalentto200mgatorvastatin','atorvastatincalciumtrihydrate'"),
  'The trihydrate must resolve to the trihydrate concept, not to the plain calcium salt.'
);

/* "Ibuprofen equivalent to Ibuprofen lysine" e thotë ekuivalencën së prapthi dhe
   nuk tregon dot cila anë është përbërësi. Mbetet për rishikim me qëllim. */
assert.doesNotMatch(MIGRATION, /\('ibuprofenequivalenttoibuprofenlysine'/);

/* Rojet e P0: regjistri i papërpunuar dhe forma e barit nuk preken. */
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.20 reviewed equivalence contract passed.');
