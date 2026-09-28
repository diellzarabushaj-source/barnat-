'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../pediatric-common-liquid-core.js');
const WeightAge = require('../pediatric-weight-age-core.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('dozologjia.html');
const css = read('dozologjia-v2.css');
const client = read('dozologjia-master-client.js');
const reference = JSON.parse(read('data/pediatric-common-drugs-reference.json'));

assert.match(html, /<h1>Dozologjia pediatrike<\/h1>/);
assert.match(html, /Dozat pediatrike të barnave të zakonshme/);
assert.doesNotMatch(html, /id="drugPicker"|id="masterForm"|id="masterResult"|id="masterProvenance"/);
assert.doesNotMatch(client, /master-catalog|master-calculate|function payload\(/);

assert.equal(reference.sections.length, 10);
assert.equal(reference.sections.reduce((sum, section) => sum + section.drugs.length, 0), 50);

/* Visible clinical wording is Albanian while source JSON remains untouched. */
for (const section of reference.sections) {
  const sqTitle = Core.sectionTitleSq(section.title);
  assert.ok(sqTitle && sqTitle !== section.title, `Section not translated: ${section.title}`);

  for (const drug of section.drugs) {
    for (const line of drug.dose) {
      const sq = Core.doseTextSq(line);
      assert.ok(sq.trim());
      assert.doesNotMatch(sq, /Same as|Pneumonia|Meningitis|Prophylaxis|Can give upto|Half dose of|Nebulisation|single dose|next 4 days/i);
    }
    for (const line of drug.formulations) {
      const sq = Core.formulationTextSq(line);
      assert.ok(sq.trim());
      assert.doesNotMatch(sq, /\b(?:Syp|Cap|Dps|Respules?|Injection|Ampoule)\b/i);
    }
  }
}

assert.match(client, /Tabela bazë/);
assert.match(client, /Formula e dozimit/);
assert.match(client, /Format e disponueshme/);
assert.match(client, /Format praktike/);
assert.match(client, /Format tjera të disponueshme/);

/* Weight is the only default input. Exact age appears only when clinically needed. */
assert.match(client, /Pesha e fëmijës/);
assert.match(client, /MOSHA AUTO NGA PESHA/);
assert.match(client, /Mosha e saktë/);
assert.match(client, /function resolvedAgeInfo\(/);
assert.match(client, /function safeAgeBand\(/);
assert.doesNotMatch(client, /numberInput\('masterWeight'|numberInput\('masterAge'/);

const at10 = WeightAge.infer(10, WeightAge.DEFAULT_MAP);
assert.equal(at10.defaultMonths, 12);
const at18 = WeightAge.infer(18, WeightAge.DEFAULT_MAP);
assert.equal(at18.defaultMonths, 54);
assert.equal(at18.defaultLabel, '≈4 vjeç 6 muaj');

/* Liquids expose mL only from explicit source concentrations. */
const all = reference.sections.flatMap(section => section.drugs);
const find = name => {
  const drug = all.find(item => item.name === name);
  assert.ok(drug, `Missing ${name}`);
  return drug;
};

const amoxicillin = find('Amoxicillin');
const amox = Core.presentationsFor(amoxicillin, amoxicillin.calc[0]);
assert.deepStrictEqual(amox.map(item => [item.form,item.mg,item.mL]), [
  ['Shurup',125,5],['Shurup',250,5],['Pika',100,1],
]);
const amoxMl = Core.volumeConversions({
  doseMin:180,doseMax:180,doseUnit:'mg',dosePeriod:'dose',
  perDoseMin:180,perDoseMax:180,frequency:'q8h',
}, amox);
assert.equal(amoxMl[0].volumeMin, 7.2);
assert.equal(amoxMl[1].volumeMin, 3.6);
assert.equal(amoxMl[2].volumeMin, 1.8);

/* Dry vials are visible, but post-reconstitution mL is never invented. */
const meropenem = find('Meropenem');
const meroVial = Core.vialConversions({
  doseMin:400,doseMax:400,doseUnit:'mg',dosePeriod:'dose',
  perDoseMin:400,perDoseMax:400,frequency:'q8h',
}, meropenem, meropenem.calc[0])[0];
assert.equal(meroVial.convertible, true);
assert.equal(meroVial.vialMin, 0.4);

const coAmox = find('Amoxicillin + Clavulanic');
const coVial = Core.vialConversions({
  doseMin:800,doseMax:900,doseUnit:'mg',dosePeriod:'day',
}, coAmox, coAmox.calc[1])[0];
assert.equal(coVial.convertible, false);
assert.match(coVial.reason, /nuk e specifikon rrugën IV\/IM/);

assert.match(client, /Ekuivalenti i flakonit tregon vetëm sasinë e barit para rikonstituimit/);
assert.match(client, /Gjithmonë verifiko përqendrimin, rrugën dhe mënyrën e rikonstituimit/);

/* Phone-first clinical use. */
assert.match(html, /viewport-fit=cover/);
assert.match(html, /enterkeyhint="search"/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /\.dz-common-weight-quick button\{[\s\S]{0,200}?min-height:44px/);
assert.match(css, /\.dz-common-weight-field \.dz-number input\{[\s\S]{0,200}?font-size:30px/);
assert.match(css, /\.dz-common-volume-dose strong\{[\s\S]{0,200}?font-size:34px/);

console.log('PASS: pediatric-only Dozologjia is Albanian, weight-first, formulation-aware and mobile-safe');
