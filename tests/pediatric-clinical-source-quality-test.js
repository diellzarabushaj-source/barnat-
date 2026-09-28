'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Liquid = require('../pediatric-common-liquid-core.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const audit = JSON.parse(read('data/pediatric-clinical-audit-v1.json'));
const reference = JSON.parse(read('data/pediatric-common-drugs-reference.json'));

const referenceNames = reference.sections.flatMap(section => section.drugs.map(drug => drug.name)).sort();
const auditNames = Object.keys(audit.drugs).sort();
assert.deepStrictEqual(auditNames, referenceNames, 'Every one of the 50 source-table drugs must have exactly one audit record');

const allowedHosts = new Set([
  'medicalguidelines.msf.org',
  'dailymed.nlm.nih.gov',
  'www.dailymed.nlm.nih.gov',
  'www.cdc.gov',
  'cdc.gov',
  'www.ema.europa.eu',
  'www.fda.gov',
  'www.medicines.org.uk',
  'www.who.int',
  'iris.who.int',
  'platform.who.int',
  'cdn.who.int',
  'cps.ca',
  'www.rch.org.au',
]);

let sourceCount = 0;
for (const [name, item] of Object.entries(audit.drugs)) {
  for (const source of item.sources || []) {
    sourceCount += 1;
    const match = String(source.url || '').match(/^https:\/\/([^/]+)/i);
    assert.ok(match, `${name}: source must use HTTPS`);
    assert.ok(allowedHosts.has(match[1]), `${name}: unapproved source host ${match[1]}`);
  }
}
assert.ok(sourceCount >= 60, 'The full 50-drug audit should retain a broad authoritative source set');

function bound(rule, key, fallback) {
  return Number.isFinite(rule[key]) ? Number(rule[key]) : fallback;
}
function inclusive(rule, key) {
  return rule[key] !== false;
}
function intervalsOverlap(aMin, aMax, aMinInc, aMaxInc, bMin, bMax, bMinInc, bMaxInc) {
  if (aMax < bMin || bMax < aMin) return false;
  if (aMax === bMin) return aMaxInc && bMinInc;
  if (bMax === aMin) return bMaxInc && aMinInc;
  return true;
}
function ageIntervalDays(rule) {
  const lower = [];
  const upper = [];
  if (Number.isFinite(rule.minDays)) lower.push([Number(rule.minDays), inclusive(rule,'minDaysInclusive')]);
  if (Number.isFinite(rule.minMonths)) lower.push([Number(rule.minMonths) * 30.4375, inclusive(rule,'minInclusive')]);
  if (Number.isFinite(rule.maxDays)) upper.push([Number(rule.maxDays), inclusive(rule,'maxDaysInclusive')]);
  if (Number.isFinite(rule.maxMonths)) upper.push([Number(rule.maxMonths) * 30.4375, inclusive(rule,'maxInclusive')]);

  const minValue = lower.length ? Math.max(...lower.map(item => item[0])) : -Infinity;
  const maxValue = upper.length ? Math.min(...upper.map(item => item[0])) : Infinity;
  const minInclusive = lower.filter(item => item[0] === minValue).every(item => item[1]);
  const maxInclusive = upper.filter(item => item[0] === maxValue).every(item => item[1]);
  return {minValue,maxValue,minInclusive,maxInclusive};
}
function ruleOverlap(a, b) {
  const aa=ageIntervalDays(a);
  const bb=ageIntervalDays(b);
  const age = intervalsOverlap(
    aa.minValue,aa.maxValue,aa.minInclusive,aa.maxInclusive,
    bb.minValue,bb.maxValue,bb.minInclusive,bb.maxInclusive
  );
  const weight = intervalsOverlap(
    bound(a,'minKg',-Infinity), bound(a,'maxKg',Infinity),
    inclusive(a,'minKgInclusive'), inclusive(a,'maxKgInclusive'),
    bound(b,'minKg',-Infinity), bound(b,'maxKg',Infinity),
    inclusive(b,'minKgInclusive'), inclusive(b,'maxKgInclusive')
  );
  return age && weight;
}

for (const [name, item] of Object.entries(audit.drugs)) {
  if (item.calculator?.disabled) continue;
  for (const option of item.calculator.options) {
    for (let i = 0; i < option.rules.length; i += 1) {
      const a = option.rules[i];
      for (let j = i + 1; j < option.rules.length; j += 1) {
        const b = option.rules[j];
        assert.equal(
          ruleOverlap(a,b),
          false,
          `${name} / ${option.label}: rules ${i+1} and ${j+1} overlap and could select two doses`
        );
      }
    }
  }
}

const byName = new Map(reference.sections.flatMap(section => section.drugs).map(drug => [drug.name, drug]));
for (const [name, item] of Object.entries(audit.drugs)) {
  if (item.calculator?.disabled) continue;
  const sourceDrug = byName.get(name);
  const practicalDrug = Object.prototype.hasOwnProperty.call(item, 'practicalFormulations')
    ? { ...sourceDrug, formulations:item.practicalFormulations }
    : sourceDrug;

  for (const option of item.calculator.options) {
    const states = Liquid.formulationAudit(practicalDrug, option);
    states.forEach(state => {
      assert.notEqual(state.status, 'unknown', `${name} / ${option.label}: unclassified formulation ${state.source}`);
    });

    const presentations = Liquid.presentationsFor(practicalDrug, option);
    presentations.forEach(presentation => {
      assert.ok(['oral','injectable','nebulized','rectal'].includes(presentation.kind), `${name}: unknown practical route ${presentation.kind}`);
      assert.ok(Number.isFinite(presentation.mg) && presentation.mg > 0, `${name}: invalid practical strength`);
      assert.ok(Number.isFinite(presentation.mL) && presentation.mL > 0, `${name}: invalid practical volume`);
    });
  }
}

// The three deliberately blocked drugs stay fail-closed.
assert.deepStrictEqual(
  Object.entries(audit.drugs).filter(([,item]) => item.calculator?.disabled).map(([name]) => name).sort(),
  ['Calcium','Cefoperazone','Ranitidine']
);

// Regression checks for high-risk safety semantics.
assert.equal(audit.drugs.Ranitidine.status, 'verified-blocked');
assert.match(audit.drugs.Ranitidine.summarySq, /pezull/i);
assert.equal(audit.drugs.Calcium.calculator.disabled, true);
assert.equal(audit.drugs.Cefoperazone.calculator.disabled, true);
assert.equal(audit.drugs.Domperidone.practicalFormulations.length, 0);
assert.equal(audit.drugs.Ivermectin.calculator.options[0].rules[0].minKg, 15);
assert.equal(audit.drugs.Ceftriaxone.calculator.options[0].rules[0].minMonths, 1);
assert.equal(audit.drugs.Linezolid.calculator.options[0].rules[0].minDays, 7);
assert.ok(audit.drugs.Hydroxyzine.calculator.options.every(option => option.rules[0].maxDailyPerKg === 2));

console.log(`PASS: all 50 pediatric audits use approved sources, non-overlapping clinical rules and classified practical formulations (${sourceCount} source links)`);
