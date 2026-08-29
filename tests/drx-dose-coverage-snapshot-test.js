'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drx-dose-coverage-snapshot.json'), 'utf8'));
const source = fs.readFileSync(path.join(ROOT, 'scripts', 'build-drx-dose-coverage.js'), 'utf8');

assert.equal(snapshot.schemaVersion, 'drx-dose-coverage-snapshot-v1');
assert.equal(snapshot.denominatorState.liveDatabaseAvailable, false);
assert.equal(snapshot.denominatorState.canonicalSubstances, null);
assert.equal(snapshot.global.sourcedPercent, null);
assert.equal(snapshot.global.publishedPercent, null);
assert.equal(snapshot.safety.failClosed, true);
assert.equal(snapshot.safety.globalCoverageUnknownIsNotZero, true);
assert.equal(snapshot.pilots.publicationEnabledPilots, 0);
assert.equal(snapshot.pilots.publishedRules, 0);

assert.match(source, /globalCoverageUnknownIsNotZero:true/);
assert.match(source, /canonicalSubstances:null/);
assert.match(source, /Supabase SQL gateway unavailable/);

console.log('DRx honest coverage snapshot contract passed.');
