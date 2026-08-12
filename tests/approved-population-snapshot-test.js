'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.resolve(__dirname, '..');
const endpointSource = fs.readFileSync(path.join(root, 'api/pediatric-only-population.js'), 'utf8');
const snapshot = require('../data/approved-population-snapshot.json');
const endpoint = require('../api/pediatric-only-population.js');

const allowed = new Set(['Adult only', 'Pediatric only', 'Pediatric and adult both']);
const items = endpoint.snapshotItems(snapshot);
const pediatricOnly = items.filter(item => item.approvedPopulation === 'Pediatric only');

assert(!endpointSource.includes('neonRequest'), 'Approved-population endpoint must stay Neon-free during outage mode.');
assert(endpointSource.includes("require('../data/approved-population-snapshot.json')"), 'Endpoint must read the Sheet-derived snapshot.');
assert.strictEqual(snapshot?.source?.spreadsheetId, '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE');
assert.strictEqual(snapshot?.source?.sheet, 'KARTELA_BARNAVE');
assert.strictEqual(snapshot?.source?.approvedPopulationColumn, 'S');
assert.strictEqual(items.length, snapshot?.counts?.classified, 'Snapshot classified count must match normalized items.');
assert.strictEqual(pediatricOnly.length, snapshot?.counts?.pediatricOnly, 'Pediatric-only count must match snapshot metadata.');
assert.strictEqual(new Set(items.map(item => item.registryNumber)).size, items.length, 'Registry numbers must be unique.');
assert(items.every(item => allowed.has(item.approvedPopulation)), 'Only the three approved population categories are allowed.');

for (const registryNumber of [44, 45, 46]) {
  assert.strictEqual(
    items.find(item => item.registryNumber === registryNumber)?.approvedPopulation,
    'Pediatric only',
    `Card ${registryNumber} must remain Pediatric only in the outage snapshot.`,
  );
}

console.log(`Approved-population Sheet snapshot passed: ${items.length} classified, ${pediatricOnly.length} pediatric only, Neon-free endpoint.`);
