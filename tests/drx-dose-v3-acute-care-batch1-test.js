'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'data', 'drx-dose-v3', 'acute-care', 'batch1');
const read = name => JSON.parse(fs.readFileSync(path.join(BASE, name), 'utf8'));

const index = read('index.v1.json');
assert.equal(index.schemaVersion, 'drx-dose-v3-acute-care-batch-index-v1');
assert.equal(index.publicationEligible, false);
assert.equal(index.humanClinicalReviewRequired, true);
assert.equal(index.governance.userSuppliedDoseTextUsedAsSource, false);
assert.equal(index.governance.highRiskRulesMayAutoPublish, false);

for (const record of index.records) {
  const full = path.join(ROOT, record.path);
  assert.ok(fs.existsSync(full), `missing indexed acute-care file: ${record.path}`);
}

const core = read('acute-care-core.v1.json');
assert.equal(core.publicationEligible, false);
assert.equal(core.humanClinicalReviewRequired, true);
assert.equal(core.userSuppliedDoseTextUsedAsSource, false);
assert.ok(Array.isArray(core.records) && core.records.length >= 10, 'acute-care core is unexpectedly small');

const byId = new Map(core.records.map(x => [x.id, x]));
for (const id of ['adrenaline','atropine','dopamine','amiodarone','verapamil','labetalol','tramadol','morphine','diclofenac','ibuprofen','metoclopramide']) {
  assert.ok(byId.has(id), `missing acute-care core record: ${id}`);
}

for (const item of core.records) {
  assert.ok(Array.isArray(item.sources) && item.sources.length > 0, `${item.id}: missing sources`);
  assert.ok(Array.isArray(item.rules) && item.rules.length > 0, `${item.id}: missing rules`);
  const sourceIds = new Set(item.sources.map(s => s.id));
  for (const rule of item.rules) {
    assert.ok(rule.id, `${item.id}: rule missing id`);
    assert.ok(rule.dose, `${rule.id}: missing dose`);
    const refs = rule.sourceIds || (rule.sourceId ? [rule.sourceId] : []);
    assert.ok(refs.length > 0, `${rule.id}: missing source reference`);
    for (const ref of refs) assert.ok(sourceIds.has(ref), `${rule.id}: unknown source ${ref}`);
  }
}

const atropine = byId.get('atropine');
const atropineRule = atropine.rules.find(r => r.id === 'atropine-adult-symptomatic-bradycardia');
assert.equal(atropineRule.dose.dose, 1);
assert.equal(atropineRule.dose.unit, 'mg');
assert.equal(atropineRule.dose.maxTotalDose, 3);

const diclofenac = byId.get('diclofenac');
for (const rule of diclofenac.rules) {
  assert.match(String(rule.dose.basis), /\/day$/i, `${rule.id}: paediatric diclofenac must remain per-day`);
}
assert.match(diclofenac.criticalCorrection, /per day/i);

const labetalol = byId.get('labetalol');
assert.equal(labetalol.brandMapping.forbiddenRegionalAlias, 'Presolol');
assert.ok(!Array.isArray(labetalol.aliases) || !labetalol.aliases.includes('Presolol'));

const adrenaline = byId.get('adrenaline');
assert.ok(adrenaline.safety.some(x => /first-line/i.test(x)));
assert.ok(adrenaline.safety.some(x => /must not delay adrenaline/i.test(x)));

const unresolved = read('source-required.v1.json');
assert.equal(unresolved.schemaVersion, 'drx-dose-v3-source-required-v1');
assert.equal(unresolved.publicationEligible, false);
assert.equal(unresolved.calculatorEligible, false);
assert.equal(unresolved.humanClinicalReviewRequired, true);
assert.equal(unresolved.userSuppliedDoseTextUsedAsSource, false);
assert.ok(unresolved.entries.length >= 20);
for (const item of unresolved.entries) {
  assert.ok(item.status, `${item.id}: missing status`);
  assert.ok(item.reason, `${item.id}: missing fail-closed reason`);
  assert.deepEqual(item.rules, [], `${item.id}: unresolved item must not carry dosing rules`);
}

const unresolvedById = new Map(unresolved.entries.map(x => [x.id, x]));
assert.ok(unresolvedById.get('sodium-bicarbonate').forbiddenAliases.includes('Lemod-Solu'));
assert.match(unresolvedById.get('glucose-iv').reason, /not encoded as a diuretic for hypertension/i);
assert.match(unresolvedById.get('pyridoxine').reason, /not encoded as a routine method to discontinue diazepam/i);
assert.match(unresolvedById.get('ketoprofen').reason, /hypoallergenic/i);
assert.equal(unresolvedById.get('pediacide').status, 'UNRESOLVED_PRODUCT');

const all = `${JSON.stringify(core)}\n${JSON.stringify(unresolved)}`.toLowerCase();
for (const forbidden of [
  'mild infection -> amoxicillin',
  'medium -> co-amoxiclav',
  'severe -> ceftriaxone',
  'i lehtë → amoxicillin',
  'mesatar → amoksiklav',
  'i rëndë → ceftriaxone'
]) assert.equal(all.includes(forbidden.toLowerCase()), false, `unsafe treatment ladder leaked: ${forbidden}`);

console.log('DRx Dose V3 acute-care batch 1 fail-closed candidate gate passed.');
