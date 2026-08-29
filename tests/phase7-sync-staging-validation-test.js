'use strict';

const assert = require('node:assert/strict');
const Sync = require('../lib/drive-supabase-sync.js');

const config = {
  entityScope:'drugs',
  keyColumn:'Nr rendor',
  headerRow:2,
};

const rows = Sync.normalizeRequestRows(config, [{
  rowKey:'17',
  rowNumber:3,
  sourceHash:'attacker-controlled-hash',
  values:{
    'Nr rendor':'17',
    'Emri tregtar':'Test Drug',
  },
}]);

assert.equal(rows.length, 1);
assert.equal(rows[0].rowKey, '17');
assert.match(rows[0].sourceHash, /^[0-9a-f]{64}$/);
assert.notEqual(rows[0].sourceHash, 'attacker-controlled-hash');

assert.throws(
  () => Sync.normalizeRequestRows(config, [{
    rowKey:'18',
    rowNumber:3,
    values:{ 'Nr rendor':'17', 'Emri tregtar':'Mismatch' },
  }]),
  /Row key nuk përputhet/
);

assert.throws(
  () => Sync.normalizeRequestRows(config, [
    { rowKey:'17', rowNumber:3, values:{ 'Nr rendor':'17' } },
    { rowKey:'17', rowNumber:4, values:{ 'Nr rendor':'17' } },
  ]),
  /Row key i dyfishuar/
);

assert.deepEqual(Sync.normalizeDeletedKeys(['21', '21', '22'], rows), ['21', '22']);
assert.throws(
  () => Sync.normalizeDeletedKeys(['17'], rows),
  /nuk mund të përditësohet dhe fshihet/
);

assert.equal(
  Sync.validateSourceConfig(
    { entity_scope:'drugs', key_column:'Nr rendor' },
    config
  ),
  true
);
assert.throws(
  () => Sync.validateSourceConfig(
    { entity_scope:'dosage_cards', key_column:'Nr rendor' },
    config
  ),
  /Konfigurimi i burimit nuk përputhet/
);
assert.throws(
  () => Sync.validateSourceConfig(
    { entity_scope:'drugs', key_column:'PDID' },
    config
  ),
  /Konfigurimi i burimit nuk përputhet/
);

console.log('Phase 7 staging validation contract passed.');
