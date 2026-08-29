'use strict';

const assert = require('node:assert/strict');
const MapModel = require('../lib/dose-source-map.js');

const map = MapModel.loadSourceMap();
const result = MapModel.validateSourceMap(map);

assert.equal(result.schemaVersion, 'drx-dose-source-map-validation-v1');
assert.equal(result.summary.substances >= 1, true);
assert.equal(result.summary.candidates >= 4, true);

const ibuprofen = result.substances.find(item => item.canonicalKey === 'ibuprofen');
assert.ok(ibuprofen);
assert.equal(ibuprofen.archiveReadyCount >= 4, true);

const emc = ibuprofen.validations.filter(item => item.ranked.tier?.key === 'EMC');
const cima = ibuprofen.validations.filter(item => item.ranked.tier?.key === 'AEMPS_CIMA');
assert.equal(emc.length >= 2, true);
assert.equal(cima.length >= 2, true);
assert.equal(emc.every(item => item.publicationReady), true);
assert.equal(cima.every(item => item.publicationReady === false), true);

const queue = MapModel.archiveQueue(map);
assert.equal(queue.length >= 4, true);
assert.equal(queue[0].tier, 'EMC');

const publication = MapModel.publicationCandidates(map);
assert.equal(publication.length >= 2, true);
assert.equal(publication.every(item => item.candidate.documentDate || item.candidate.documentVersion), true);

const bad = JSON.parse(JSON.stringify(map));
bad.substances.ibuprofen.candidates[0].tier = 'EMA';
const invalid = MapModel.validateSourceMap(bad);
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.some(error => error.includes('declared_tier_mismatch')));

console.log('DRx dose source map contract passed.');
