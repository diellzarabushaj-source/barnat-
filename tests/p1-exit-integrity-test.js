'use strict';

/* P1.23 — mbyllja e P1-shit.

   Auditi i daljes gjeti gjashtë gjëra që testet e gjelbra nuk i kapnin:

   1. `formoterolfumaratedehydrous` ishte njëkohësisht alias dhe refuzim
      bashkimi — dy vendime të kundërta për të njëjtin çift.
   2. 118 produkte të zgjidhura mbanin ende `EQUIVALENCE_EXPRESSION`, një kod
      që do të thotë "bllokuar", mbi rreshta që nuk ishin bllokuar.
   3. Njëmbëdhjetë shprehje ku pikëpresja ndan një substancë nga klauzola e vet
      e ekuivalencës rrinin në radhë sepse ndarësi i lexonte si kombinim.
   4. Të tetë tabelat e kuruara u jepnin `anon` dhe `authenticated` INSERT,
      UPDATE, DELETE dhe TRUNCATE. RLS-ja i mbulon tri të parat; TRUNCATE
      nuk i nënshtrohet fare RLS-së.
   5. `benzocaina` kishte mbetur si koncept pa asnjë term.
   6. Nuk kishte një komandë të vetme për të ekzekutuar kontratat e P1-shit.

   Ky test i mban të mbyllura të gjashta. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');
const EXIT = fs.readFileSync(path.join(DIR, '20260827221057_p1_exit_integrity_and_privileges.sql'), 'utf8');
const VIEWS = fs.readFileSync(path.join(DIR, '20260827221219_p1_exit_revoke_inert_view_write_grants.sql'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

for (const [version, name] of [
  ['20260827221057', 'p1_exit_integrity_and_privileges'],
  ['20260827221219', 'p1_exit_revoke_inert_view_write_grants'],
]) {
  assert.ok(
    manifest.migrations.some(item => String(item.version) === version && item.name === name),
    `P1.23 migration ${name} must be present in production migration history.`
  );
}

/* 4 — TRUNCATE hiqet shprehimisht. Është pika që RLS-ja nuk e mbulon: një rol
   me privilegjin TRUNCATE e zbraz tabelën pa e prekur asnjë politikë rreshti. */
assert.match(
  EXIT,
  /revoke insert, update, delete, truncate, references, trigger/,
  'The revoke must name TRUNCATE — RLS does not apply to it.'
);
for (const table of [
  'substance_concepts_v1',
  'substance_terms_v1',
  'substance_aliases',
  'substance_merge_rejections',
  'substance_equivalence_reviewed_v1',
  'substance_equivalence_cleared_v1',
  'product_ingredients_v1',
  'product_ingredient_resolution_v1',
  'substance_single_expression_override_v1',
]) {
  assert.ok(EXIT.includes(table), `Curated table ${table} must lose public write privileges.`);
}
assert.match(
  EXIT,
  /privilege_type in \('INSERT','UPDATE','DELETE','TRUNCATE'\)/,
  'The exit invariant must assert on all four write privileges.'
);

/* Tabela e re mbetet e lexueshme nga të gjithë — vendimet janë publike, vetëm
   shkrimi është i mbyllur. */
assert.match(EXIT, /create policy substance_single_expression_override_read/);
assert.match(EXIT, /for select\s*\n\s*to anon, authenticated using \(true\)/);

/* 3 — të njëmbëdhjetë shprehjet, secila me arsyen e vet. */
const OVERRIDES = [
  'cefiximetrihydrateequivalenttocefixime',
  'amlodipinebesilateequivalenttoamlodipine',
  'betamethasonedipropionateequivalnttobetmethasone',
  'betamethasoneipropionateequivalenttobetamethasone',
  'clopidogrelbisulfateequivalenttoclopidogrel',
  'clyndamycinphosphateequivalenttoclindamycin',
  'dextrosemonohydrateequivtodextroseanhydrous',
  'pantoprazolesodiumsesquihydrateequivalenttopantoprazole',
  'salbutamolsulfateequivalenttosalbutamol',
  'theophyllineethylendiamineanhydrouscorrespondingtheophyllineanhydrous',
  'moxifloxacinequivalenttomoxifloxacinhydrochloride',
];
for (const key of OVERRIDES) {
  assert.ok(EXIT.includes(`('${key}',`), `Single-expression override missing: ${key}`);
}
assert.match(
  EXIT,
  /constraint substance_single_expression_override_not_self check \(source_key <> canonical_key\)/,
  'An override must never point a key at itself.'
);

/* Vetëm dega e override-it e kapërcen përjashtimin e pikëpresjes; dega e
   zakonshme mbetet e mbyllur ndaj `;`, `+`, `&`, `/` dhe " and ". */
assert.match(EXIT, /d\.active_substance !~ '\(;\|\\\+\|&\)'/);
assert.match(
  EXIT,
  /or exists \(\s*\n\s*select 1 from public\.substance_single_expression_override_v1 o/,
  'The override branch must be a disjunct, not a replacement for the delimiter guard.'
);
/* Dhe ndarësi duhet t'i lërë jashtë, që i njëjti produkt të mos numërohet dy herë. */
assert.match(
  EXIT,
  /and not exists \(\s*\n\s*select 1 from public\.substance_single_expression_override_v1 o/,
  'The delimiter view must exclude overridden keys or the product is counted twice.'
);

/* Kufiri i fjalës mbetet `\y`. `\b` është backspace dhe e fik rojen heshtazi. */
assert.doesNotMatch(EXIT, /\\bas\\b/);
assert.ok((EXIT.match(/\\yas\\y/g) || []).length >= 3);

/* 1 — refuzimi kontradiktor hiqet dhe një trigger e ndalon rikthimin e tij nga
   të dyja anët: alias mbi refuzim, dhe refuzim mbi alias. */
assert.match(EXIT, /delete from public\.substance_merge_rejections/);
assert.ok(EXIT.includes("least(key_a,key_b)='formoterolfumaratedehydrous'"));
assert.match(EXIT, /create trigger substance_aliases_no_rejection_conflict/);
assert.match(EXIT, /create trigger substance_rejections_no_alias_conflict/);
assert.match(EXIT, /P1 exit: % alias\/rejection contradictions remain/);

/* 2 — kodi bllokues nuk mbetet mbi rreshta të zgjidhur. Rreshtat e shqyrtuar e
   mbajnë gjurmën, por me emrin e vet: EQUIVALENCE_REVIEWED. */
assert.match(EXIT, /then 'EQUIVALENCE_REVIEWED'\s*\n\s*else 'EQUIVALENCE_EXPRESSION' end end/);
assert.match(EXIT, /P1 exit: % resolved products still carry a blocker code/);

/* 5 — asnjë koncept pa term. Fshirja prek vetëm ata që s'i referon asgjë. */
assert.match(
  EXIT,
  /delete from public\.substance_concepts_v1 c\s*\nwhere not exists \(select 1 from public\.substance_terms_v1/,
  'Dead concepts are deleted, not given a synthetic term.'
);
assert.match(
  EXIT,
  /and not exists \(select 1 from public\.product_ingredients_v1 i where i\.concept_id=c\.concept_id\)/,
  'A concept still referenced by an ingredient row must never be deleted.'
);
assert.match(EXIT, /P1 exit: % orphan concepts remain/);

/* Radha e rishikimit nuk lejohet të rritet. */
assert.match(EXIT, /P1 exit: review queue grew to/);
assert.match(EXIT, /P1 exit: % overridden expressions still in review/);

/* Migrimi i dytë e mbyll edhe sipërfaqen e pamjeve, që auditi të kthejë zero
   pa përjashtime. */
assert.match(VIEWS, /revoke insert, update, delete, truncate, references, trigger/);
for (const view of ['substance_canonical', 'active_substances', 'medindex_product_ingredient_sets_v1']) {
  assert.ok(VIEWS.includes(view), `View ${view} must lose its inert write grants.`);
}
assert.match(VIEWS, /P1 exit: % public write grants remain on the curated surface/);

/* Rojet e P0: forma farmaceutike, `drugs` e papërpunuar dhe harta bazë nuk
   preken nga asnjëri prej të dy migrimeve. */
for (const migration of [EXIT, VIEWS]) {
  assert.doesNotMatch(migration, /update\s+public\.drugs\b/i);
  assert.doesNotMatch(migration, /pharmaceutical_form\s*=/i);
  assert.doesNotMatch(migration, /update\s+public\.medindex_drug_core_map_v1\b/i);
}

console.log('P1.23 exit integrity contract passed.');
