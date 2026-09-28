'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WeightAge = require('../pediatric-weight-age-core.js');

const ROOT = path.resolve(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pediatric-weight-age-defaults.json'), 'utf8'));

assert.deepStrictEqual(WeightAge.DEFAULT_MAP, map, 'Browser default map must exactly match the committed/database source map');

assert.equal(map.bands.length, 14);
assert.deepStrictEqual(
  map.bands.map(b => [b.key,b.weightMinKg,b.weightMaxKg,b.ageMinMonths,b.ageMaxMonths]),
  [
    ['newborn',3.2,3.5,0,0],
    ['6m',7,7.5,6,6],
    ['1y',9,10.5,12,12],
    ['2y',12,13,24,24],
    ['3y',14,15,36,36],
    ['4_5y',16,20,48,60],
    ['6_7y',20,23,72,84],
    ['8_9y',25,28,96,108],
    ['10y',31,36,120,120],
    ['12y',40,45,144,144],
    ['13y',45,50,156,156],
    ['14y',50,55,168,168],
    ['15y',55,58,180,180],
    ['16plus',60,null,192,null],
  ]
);

const newborn = WeightAge.infer(3.35, map);
assert.equal(newborn.defaultMonths, 0);
assert.equal(newborn.minMonths, 0);
assert.equal(newborn.maxMonths, 0);
assert.equal(newborn.defaultLabel, '≈0 muaj');

const sixMonths = WeightAge.infer(7.2, map);
assert.equal(sixMonths.defaultMonths, 6);
assert.equal(sixMonths.minMonths, 6);
assert.equal(sixMonths.maxMonths, 6);

const oneYear = WeightAge.infer(10, map);
assert.equal(oneYear.defaultMonths, 12);

const fourFive = WeightAge.infer(18, map);
assert.equal(fourFive.minMonths, 48);
assert.equal(fourFive.maxMonths, 60);
assert.equal(fourFive.defaultMonths, 54);
assert.equal(fourFive.label, 'rreth 4–5 vjeç');
assert.equal(fourFive.defaultLabel, '≈4 vjeç 6 muaj');

const overlap20 = WeightAge.infer(20, map);
assert.equal(overlap20.kind, 'overlap');
assert.equal(overlap20.minMonths, 48);
assert.equal(overlap20.maxMonths, 84);
assert.equal(overlap20.defaultMonths, 66);
assert.equal(overlap20.label, '≈4–7 vjeç');
assert.equal(overlap20.defaultLabel, '≈5 vjeç 6 muaj');

const gap24 = WeightAge.infer(24, map);
assert.equal(gap24.kind, 'interpolated-gap');
assert.equal(gap24.minMonths, 84);
assert.equal(gap24.maxMonths, 96);
assert.ok(gap24.defaultMonths > 84 && gap24.defaultMonths < 96);

const tenYears = WeightAge.infer(33, map);
assert.equal(tenYears.defaultMonths, 120);

const overlap45 = WeightAge.infer(45, map);
assert.equal(overlap45.minMonths, 144);
assert.equal(overlap45.maxMonths, 156);

const sixteenPlus = WeightAge.infer(60, map);
assert.equal(sixteenPlus.minMonths, 192);
assert.equal(sixteenPlus.maxMonths, null);

const below = WeightAge.infer(3, map);
assert.equal(below.kind, 'below-range');
assert.equal(below.defaultMonths, null);

const montelukast45 = {minMonths:24,maxMonths:60,minInclusive:true,maxInclusive:true};
assert.equal(WeightAge.ageRangeFitsBand(fourFive,montelukast45), true);
assert.equal(WeightAge.ageRangeFitsBand(overlap20,montelukast45), false);

console.log('PASS: pediatric weight-to-age defaults are deterministic, gap-aware and ambiguity-aware');
