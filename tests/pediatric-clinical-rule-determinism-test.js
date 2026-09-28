'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pediatric-clinical-audit-v1.json'), 'utf8'));

const finite = value => Number.isFinite(Number(value));
const needsDays = rule => finite(rule.minDays) || finite(rule.maxDays);
const needsAge = rule => needsDays(rule) || finite(rule.minMonths) || finite(rule.maxMonths);
const needsWeight = rule => rule.doseType === 'weight' || finite(rule.minKg) || finite(rule.maxKg);

function pass(value, bound, inclusive, side) {
  if (!finite(bound)) return true;
  const b = Number(bound);
  if (!Number.isFinite(value)) return false;
  if (side === 'min') return inclusive === false ? value > b : value >= b;
  return inclusive === false ? value < b : value <= b;
}

function matches(rule, point) {
  if (needsWeight(rule)) {
    if (!(point.weight > 0)) return false;
    if (!pass(point.weight, rule.minKg, rule.minKgInclusive, 'min')) return false;
    if (!pass(point.weight, rule.maxKg, rule.maxKgInclusive, 'max')) return false;
  }
  if (needsAge(rule)) {
    if (!pass(point.months, rule.minMonths, rule.minInclusive, 'min')) return false;
    if (!pass(point.months, rule.maxMonths, rule.maxInclusive, 'max')) return false;
    if (needsDays(rule)) {
      if (!pass(point.days, rule.minDays, rule.minDaysInclusive, 'min')) return false;
      if (!pass(point.days, rule.maxDays, rule.maxDaysInclusive, 'max')) return false;
    }
  }
  return true;
}

function candidateValues(rules, minKey, maxKey, defaults) {
  const out = new Set(defaults);
  for (const rule of rules) {
    for (const key of [minKey,maxKey]) {
      if (!finite(rule[key])) continue;
      const v = Number(rule[key]);
      out.add(v);
      out.add(Math.max(0, v - 0.01));
      out.add(v + 0.01);
    }
  }
  return [...out].filter(Number.isFinite).sort((a,b)=>a-b);
}

function midpoint(min, max, fallback) {
  const lo = finite(min) ? Number(min) : null;
  const hi = finite(max) ? Number(max) : null;
  if (lo != null && hi != null) return (lo + hi) / 2;
  if (lo != null) return lo + Math.max(0.5, Math.abs(lo) * 0.05);
  if (hi != null) return Math.max(0, hi - Math.max(0.5, Math.abs(hi) * 0.05));
  return fallback;
}

let optionsChecked = 0;
let rulesChecked = 0;
let pointsChecked = 0;

for (const [drugName, item] of Object.entries(audit.drugs || {})) {
  if (item.calculator?.disabled) continue;

  for (const [optionIndex, option] of item.calculator.options.entries()) {
    const rules = option.rules || [];
    assert.ok(rules.length, `${drugName} option ${optionIndex + 1}: no rules`);
    optionsChecked += 1;

    // Every authored rule must be reachable by at least one exact patient point,
    // and that representative point must select that rule uniquely.
    rules.forEach((rule, ruleIndex) => {
      const weight = midpoint(rule.minKg, rule.maxKg, 10);
      let days;
      let months;
      if (needsDays(rule)) {
        days = midpoint(rule.minDays, rule.maxDays, 14);
        months = days / 30.4375;
      } else {
        months = midpoint(rule.minMonths, rule.maxMonths, 60);
        days = months * 30.4375;
      }
      const point = { weight, months, days };
      const selected = rules.map((candidate,index)=>matches(candidate,point)?index:-1).filter(index=>index>=0);
      assert.deepStrictEqual(
        selected,
        [ruleIndex],
        `${drugName} option ${optionIndex + 1}: rule ${ruleIndex + 1} is unreachable or ambiguous at representative point ${JSON.stringify(point)}`
      );
      rulesChecked += 1;
    });

    // Boundary matrix: no exact age/weight point may activate more than one rule.
    const weights = candidateValues(rules,'minKg','maxKg',[0.5,1,3.5,4,7,10,15,20,23,30,40,50,60,80]);
    const months = candidateValues(rules,'minMonths','maxMonths',[0,0.25,1,3,6,12,24,72,144,180,216]);
    const days = candidateValues(rules,'minDays','maxDays',[0,1,6.99,7,28,28.99,29,30,59,59.99,60]);

    // Month-based exact ages.
    for (const weight of weights) for (const month of months) {
      const point={weight,months:month,days:month*30.4375};
      const count=rules.filter(rule=>matches(rule,point)).length;
      assert.ok(count <= 1, `${drugName} option ${optionIndex + 1}: overlapping rules at ${weight} kg / ${month} months`);
      pointsChecked += 1;
    }

    // Day-based exact ages, needed for neonatal cutoffs.
    if (rules.some(needsDays)) {
      for (const weight of weights) for (const day of days) {
        const point={weight,days:day,months:day/30.4375};
        const count=rules.filter(rule=>matches(rule,point)).length;
        assert.ok(count <= 1, `${drugName} option ${optionIndex + 1}: overlapping rules at ${weight} kg / ${day} days`);
        pointsChecked += 1;
      }
    }
  }
}

assert.ok(optionsChecked > 0 && rulesChecked > 0 && pointsChecked > 0);
console.log(`PASS: audited clinical-rule matrix is deterministic — ${optionsChecked} options, ${rulesChecked} rules, ${pointsChecked} boundary points`);
