'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.resolve(__dirname, '..');
const handlerSource = fs.readFileSync(path.join(root, 'lib/approved-population-handler.js'), 'utf8');
const snapshot = require('../data/approved-population-snapshot.json');
const overrides = require('../data/approved-population-overrides-1-500.json');
const handler = require('../lib/approved-population-handler.js');

const allowed = new Set(['Adult only', 'Pediatric only', 'Pediatric and adult both']);
const items = handler.snapshotItems(snapshot, overrides);
const byNumber = new Map(items.map(item => [item.registryNumber, item.approvedPopulation]));

assert(!handlerSource.includes('neonRequest'), 'Approved-population handler must stay Neon-free in snapshot/fallback mode.');
assert(handlerSource.includes("require('../data/approved-population-snapshot.json')"), 'Handler must retain the base Sheet snapshot.');
assert(handlerSource.includes("require('../data/approved-population-overrides-1-500.json')"), 'Handler must apply the explicit audited override range.');
assert.strictEqual(overrides?.source?.spreadsheetId, '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE');
assert.strictEqual(overrides?.source?.sheet, 'KARTELA_BARNAVE');
assert.strictEqual(overrides?.source?.registryNumberColumn, 'A');
assert.strictEqual(overrides?.source?.approvedPopulationColumn, 'S');
assert.strictEqual(overrides?.source?.mapping, 'explicit-A-to-S');
assert.strictEqual(overrides?.source?.range, '1-500');
assert.strictEqual(new Set(items.map(item => item.registryNumber)).size, items.length, 'Registry numbers must remain unique after override merge.');
assert(items.every(item => allowed.has(item.approvedPopulation)), 'Only the three approved population categories are allowed.');

const overrideGroups = [
  ['Adult only', overrides.adultOnly],
  ['Pediatric only', overrides.pediatricOnly],
  ['Pediatric and adult both', overrides.pediatricAndAdultBoth],
];
const overrideEntries = overrideGroups.flatMap(([population, numbers]) => numbers.map(registryNumber => [registryNumber, population]));
assert.strictEqual(overrideEntries.length, 483, 'Cards 1-500 must contain exactly 483 current classified rows from Sheet A→S.');
assert.strictEqual(new Set(overrideEntries.map(([registryNumber]) => registryNumber)).size, overrideEntries.length, '1-500 override registry numbers must be unique.');
assert(overrideEntries.every(([registryNumber]) => registryNumber >= 1 && registryNumber <= 500), '1-500 overrides must stay inside the declared range.');
overrideEntries.forEach(([registryNumber, population]) => {
  assert.strictEqual(byNumber.get(registryNumber), population, `Card ${registryNumber} must match the explicit Sheet A→S override.`);
});

const expectedPediatricOnly = [
  44,45,46,109,127,140,146,179,192,196,197,200,222,248,282,290,292,293,
  302,305,307,328,434,447,448,449,453,455,458,464,466,467,469,472,475,476,477,478,479,
];
assert.deepStrictEqual(overrides.pediatricOnly, expectedPediatricOnly, 'Pediatric-only cards 1-500 must match the audited Sheet list exactly.');
expectedPediatricOnly.forEach(registryNumber => {
  assert.strictEqual(byNumber.get(registryNumber), 'Pediatric only', `Card ${registryNumber} must remain Pediatric only.`);
});

for (const [registryNumber, expected] of [
  [433, 'Pediatric and adult both'],
  [435, 'Adult only'],
  [436, 'Adult only'],
  [450, 'Pediatric and adult both'],
  [462, 'Adult only'],
  [480, 'Pediatric and adult both'],
  [500, 'Pediatric and adult both'],
]) {
  assert.strictEqual(byNumber.get(registryNumber), expected, `Card ${registryNumber} sentinel detects population row shifts.`);
}

console.log(`Approved population A→S mapping passed: 483 classified in cards 1-500; ${expectedPediatricOnly.length} pediatric only.`);
