'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const manifest = readJson('data/drx-clinical-priority-batch-v1.json');
const antimicrobial = readJson('data/drx-clinical-priority-antimicrobials-v1.json');
const acute = readJson('data/drx-clinical-priority-acute-care-v1.json');
const supportive = readJson('data/drx-clinical-priority-topical-supportive-v1.json');
const migration = read('supabase/migrations/20260911225000_drx_priority_cotrimoxazole_source_regimens.sql');

assert.strictEqual(manifest.publicationPolicy.failClosed, true);
assert.strictEqual(manifest.publicationPolicy.userNotesAreClinicalAuthority, false);
assert.strictEqual(manifest.publicationPolicy.highRiskAutoPublishAllowed, false);
assert.deepStrictEqual(manifest.priorityOrder, [
  'amoxicillin', 'amoxicillin_clavulanate', 'ceftriaxone', 'cotrimoxazole',
]);

const rows = [...antimicrobial.substances, ...acute.substances, ...supportive.substances];
assert.strictEqual(rows.length, 50, 'priority batch must keep all 50 curated user-list entities');
const byKey = new Map(rows.map(row => [row.key, row]));
for (const key of manifest.priorityOrder) assert.ok(byKey.has(key), `missing priority substance ${key}`);

assert.deepStrictEqual(byKey.get('cotrimoxazole').activeIngredients, ['Trimethoprim', 'Sulfamethoxazole']);
assert.ok(byKey.get('cotrimoxazole').clinicalNote.includes('combined tablet mass'));
assert.deepStrictEqual(byKey.get('amoxicillin_clavulanate').activeIngredients, ['Amoxicillin', 'Clavulanic acid']);
assert.ok(Number(byKey.get('ceftriaxone').backendRegimenCount) >= 17);

const atropine = JSON.stringify(byKey.get('atropine'));
assert.match(atropine, /1 mg IV bolus/i);
assert.doesNotMatch(atropine, /0\.5 mg IV/i, 'outdated adult atropine dose must not be encoded as active candidate');

const diclofenac = JSON.stringify(byKey.get('diclofenac'));
assert.match(diclofenac, /mg\/kg\/DAY/);
assert.doesNotMatch(diclofenac, /mg\/kg\/dose/i, 'paediatric suppository rule must remain per-day for selected SmPC');

const d5 = JSON.stringify(byKey.get('glucose_5')).toLowerCase();
assert.match(d5, /not a resuscitation crystalloid/);
assert.match(d5, /not encoded as a diuretic/);

const furosemide = JSON.stringify(byKey.get('furosemide')).toLowerCase();
assert.match(furosemide, /not automatically prescribed/);

const pyridoxine = JSON.stringify(byKey.get('pyridoxine')).toLowerCase();
assert.match(pyridoxine, /diazepam/);
assert.match(pyridoxine, /excluded/);

const ketoprofen = JSON.stringify(byKey.get('ketoprofen')).toLowerCase();
assert.match(ketoprofen, /hypoallergenic/);
assert.match(ketoprofen, /rejected/);

const sodiumBicarbonate = JSON.stringify(byKey.get('sodium_bicarbonate')).toLowerCase();
assert.match(sodiumBicarbonate, /no blanket 50 mmol/);

const ladderCorpus = rows.map(x => JSON.stringify(x)).join('\n').toLowerCase();
assert.doesNotMatch(ladderCorpus, /i lehtë.*amoxicillin.*mesatar.*amoksiklav.*i rëndë.*ceftriaxone/s);

assert.match(migration, /EMC-PRODUCT-11466-SMPC/);
assert.match(migration, /'INGREDIENT_SET'/);
assert.match(migration, /trimethoprim\+sulfamethoxazole/);
assert.match(migration, /SRC-COTRIM-FORTE-ADULT-ACUTE/);
assert.match(migration, /SRC-COTRIM-FORTE-ADOLESCENT-ACUTE/);
assert.match(migration, /SRC-COTRIM-PJP-TREATMENT-12PLUS/);
assert.match(migration, /20 mg trimethoprim plus 100 mg sulfamethoxazole per kg body weight per day/i);
assert.match(migration, /CrCl <15 mL\/min: not recommended/i);
assert.match(migration, /'PENDING'/);
assert.doesNotMatch(migration, /review_status\s*=\s*'PROMOTED'/i);
assert.doesNotMatch(migration, /auto_publish_allowed\s*=\s*true/i);
assert.doesNotMatch(migration, /editorial_status\s*=\s*'published'/i);

for (const row of rows) {
  assert.ok(row.key && row.name && row.status, `invalid batch row ${JSON.stringify(row)}`);
  for (const field of ['sourceUrl']) {
    if (row[field]) assert.match(row[field], /^https:\/\//, `${row.key} ${field} must use HTTPS`);
  }
}

console.log('drx-clinical-priority-batch-test: PASS');
