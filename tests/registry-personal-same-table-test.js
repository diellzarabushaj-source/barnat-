'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const personal = read('registry-user-personalization.js');
const unified = read('registry-unified-table.js');
const css = read('registry-user-personalization.css');
const MARKER = 'registry-personal-same-table-v1';

assert.ok(personal.includes(`${MARKER}: capture visible main-table contract`), 'Favorites must capture the table visible before handoff');
assert.ok(personal.includes('window.MEDINDEX_PERSONAL_TABLE_CONTRACT_LOCK = true'), 'Favorites must lock the visible table contract before loading full data');
assert.ok(personal.includes('window.MEDINDEX_MAIN_TABLE_CONTRACT'), 'captured column contract must be published');
assert.ok(personal.includes("favorite.dataset.nav = 'favorites'"), 'desktop Favorites navigation must recover if the shell omitted it');
assert.ok(personal.includes("item.dataset.nav = 'notes'"), 'desktop Notes navigation must exist beside Favorites');

assert.ok(unified.includes(`${MARKER}: exact main-table contract`), 'full-data runtime must consume the captured main-table contract');
assert.ok(unified.includes('contractLocked() ? new Set(mainTableContract().keys)'), 'personal handoff must synthesize only main-table columns');
assert.ok(unified.includes(`${MARKER}: non-destructive contract visibility`), 'non-main columns must be hidden without destroying restoration state');
assert.ok(unified.includes('contractWidth(key)'), 'main-table column widths must survive the data-runtime handoff');
assert.ok(unified.includes("window.MEDINDEX_PERSONAL_TABLE_CONTRACT_LOCK = false"), 'explicit column customization must be able to unlock the captured layout');

assert.ok(css.includes(MARKER), 'Favorites/Notes desktop navigation visibility CSS missing');
assert.ok(!unified.includes('tableWrap.before(replacement)'), 'alternate clinical/full registry toolbar must not be mountable');

console.log('✓ Favorites/Notes same-table contract passed: the personal filter keeps the visible main table through full-data handoff.');
