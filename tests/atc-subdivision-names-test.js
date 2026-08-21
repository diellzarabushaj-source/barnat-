'use strict';

// ATC subdivisions must carry a name.
//
// The tree the doctor browses goes A → A10 → A10B → A10BJ. The catalog named
// the first two levels and stopped, so the rows below a therapeutic category
// read "Nënndarje ATC" three times over with nothing to tell them apart — the
// state in the report: N02A, N02B, N02C, each nameless under "Analgjetikë".
//
// Two rules hold here. Every code the register actually uses at level 4 must
// have its official ATC name in the catalog, in Albanian. And where the catalog
// is silent — a code outside official ATC, or a level-5 subgroup — the row is
// still never nameless: it falls back to the substances the register itself
// files beneath the code. Nothing is invented for a code either way.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'classification-data.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'atc-shared.js'))];
require(path.join(ROOT, 'classification-data.js'));
const ATC = require(path.join(ROOT, 'atc-shared.js'));

const GROUPS = global.window.MEDINDEX_ATC_GROUPS;
const CATEGORIES = global.window.MEDINDEX_ATC_SUBGROUPS;
const SUBDIVISIONS = global.window.MEDINDEX_ATC_SUBDIVISIONS;

// Level-4 codes carried by the published register. Kept here so that a code
// added upstream without a name fails this test instead of reaching a doctor as
// an unnamed row.
const REGISTER_LEVEL_4 = [
  'A01A', 'A02A', 'A02B', 'A03A', 'A03B', 'A03D', 'A03F', 'A04A', 'A05A', 'A05B',
  'A06A', 'A07A', 'A07B', 'A07C', 'A07D', 'A07E', 'A07F', 'A07X', 'A08A', 'A09A',
  'A10A', 'A10B', 'A11A', 'A11B', 'A11C', 'A11D', 'A11E', 'A11G', 'A11H', 'A12A',
  'A12B', 'A12C', 'A16A',
  'B01A', 'B02A', 'B02B', 'B03A', 'B03B', 'B03X', 'B05A', 'B05B', 'B05C', 'B05D', 'B05X',
  'C01A', 'C01B', 'C01C', 'C01D', 'C01E', 'C02A', 'C02C', 'C03A', 'C03B', 'C03C',
  'C03D', 'C03E', 'C04A', 'C05A', 'C05B', 'C05C', 'C07A', 'C07C', 'C08C', 'C08D',
  'C09A', 'C09B', 'C09C', 'C09D', 'C10A', 'C10B',
  'D01A', 'D01B', 'D03A', 'D04A', 'D05A', 'D05B', 'D06A', 'D06B', 'D07A', 'D07B',
  'D07C', 'D07X', 'D08A', 'D10A', 'D10B', 'D11A',
  'G01A', 'G01B', 'G02A', 'G02C', 'G03A', 'G03B', 'G03C', 'G03D', 'G03F', 'G03G',
  'G03H', 'G04B', 'G04C',
  'H01A', 'H01B', 'H01C', 'H02A', 'H03A', 'H03B', 'H05B',
  'J01A', 'J01C', 'J01D', 'J01E', 'J01F', 'J01G', 'J01M', 'J01R', 'J01X', 'J02A',
  'J05A', 'J06B', 'J07A', 'J07B', 'J07C',
  'L01A', 'L01B', 'L01C', 'L01D', 'L01E', 'L01F', 'L01X', 'L02A', 'L02B', 'L03A', 'L04A',
  'M01A', 'M01B', 'M02A', 'M03A', 'M03B', 'M04A', 'M05B', 'M09A',
  'N01A', 'N01B', 'N02A', 'N02B', 'N02C', 'N03A', 'N04A', 'N04B', 'N05A', 'N05B',
  'N05C', 'N06A', 'N06B', 'N06C', 'N06D', 'N07A', 'N07B', 'N07C',
  'P01A', 'P01B', 'P02C', 'P03A',
  'R01A', 'R01B', 'R02A', 'R03A', 'R03B', 'R03C', 'R03D', 'R05C', 'R05D', 'R05X',
  'R06A', 'R07A',
  'S01A', 'S01B', 'S01C', 'S01E', 'S01F', 'S01G', 'S01H', 'S01L', 'S01X', 'S02A',
  'S02C', 'S03A', 'S03B', 'S03C',
  'V03A', 'V06D', 'V07A', 'V08A', 'V08C',
];

// N05H is filed in the register but is not an official ATC code, so no ATC name
// exists for it. It is deliberately absent from the catalog and left to the
// register-derived fallback below.
const REGISTER_LEVEL_4_WITHOUT_ATC_NAME = ['N05H'];

// --- the catalog itself -----------------------------------------------------

{
  const codes = Object.keys(SUBDIVISIONS);
  assert.ok(codes.length >= 200, 'the subdivision catalog must cover the register, not a sample');

  for (const [code, name] of Object.entries(SUBDIVISIONS)) {
    assert.match(code, /^[A-Z]\d{2}[A-Z][A-Z]?$/, `Invalid ATC subdivision code: ${code}`);
    const text = String(name).trim();
    assert.ok(text, `ATC subdivision ${code} needs a visible name`);
    assert.ok(text.length > 3, `ATC subdivision ${code} needs a real name, not an abbreviation`);
    assert.doesNotMatch(text, /^Nënndarje|^Kategoria|^ATC\b/i,
      `ATC subdivision ${code} must be named, not labelled as a subdivision`);
    assert.ok(Object.hasOwn(CATEGORIES, code.slice(0, 3)),
      `ATC subdivision ${code} has no known parent category`);
    assert.ok(Object.hasOwn(GROUPS, code.charAt(0)),
      `ATC subdivision ${code} has no known parent group`);
    if (code.length === 5) {
      assert.ok(Object.hasOwn(SUBDIVISIONS, code.slice(0, 4)),
        `ATC chemical subgroup ${code} must sit under a named pharmacological subgroup`);
    }
  }

  const names = Object.values(SUBDIVISIONS).map(value => String(value).trim());
  assert.equal(new Set(names).size, names.length,
    'two subdivisions sharing one name would make the tree unreadable');
}

// --- every level-4 code the register uses is named --------------------------

{
  const missing = REGISTER_LEVEL_4.filter(code => !Object.hasOwn(SUBDIVISIONS, code));
  assert.deepEqual(missing, [], `unnamed ATC subdivisions in the register: ${missing.join(', ')}`);

  for (const code of REGISTER_LEVEL_4_WITHOUT_ATC_NAME) {
    assert.equal(Object.hasOwn(SUBDIVISIONS, code), false,
      `${code} is not an official ATC code and must not be given an invented name`);
  }

  // Spot checks against the official terminology, in the register's language.
  assert.equal(SUBDIVISIONS.N02A, 'Opioide');
  assert.equal(SUBDIVISIONS.N02B, 'Analgjezikë dhe antipiretikë të tjerë');
  assert.equal(SUBDIVISIONS.N02C, 'Preparate kundër migrenës');
  assert.equal(SUBDIVISIONS.J01D, 'Antibakterialë të tjerë beta-laktamikë – cefalosporina dhe karbapeneme');
  assert.equal(SUBDIVISIONS.M01AE, 'Derivate të acidit propionik');
}

// --- the shared ATC module answers for subdivisions -------------------------

{
  assert.equal(typeof ATC.getSubdivisionName, 'function',
    'the shared ATC module must own subdivision naming too');
  assert.equal(ATC.getSubdivisionName('N02A'), 'Opioide');
  assert.equal(ATC.getSubdivisionName('n02a'), 'Opioide', 'codes are matched case-insensitively');
  assert.equal(ATC.getSubdivisionName('J01DD'), 'Cefalosporina të gjeneratës së tretë');
  assert.equal(ATC.getSubdivisionName('N05H'), '', 'an uncatalogued code is not given a name');
  assert.equal(ATC.getSubdivisionName('N02'), '', 'a category is answered by getCategoryName');
  assert.equal(ATC.getSubdivisionName('N'), '');
  assert.equal(ATC.getSubdivisionName('N/A'), '');

  // The catalogs stay separate: the 81-category audit must remain true.
  assert.equal(Object.keys(CATEGORIES).length, 81,
    'subdivisions must not leak into the therapeutic-category catalog');
}

// --- the browsed rows are never nameless ------------------------------------

const ROWS = [
  {
    'Nr rendor':'1', 'Emri tregtar':'Oxycodon', 'Substanca aktive':'Oxycodone hydrochloride',
    'ATC Code':'N02AA05', 'Forma farmaceutike':'Tabletë', 'Klasa / Çka është':'Opioid',
  },
  {
    'Nr rendor':'2', 'Emri tregtar':'Panadol', 'Substanca aktive':'Paracetamol',
    'ATC Code':'N02BE01', 'Forma farmaceutike':'Tabletë', 'Klasa / Çka është':'Analgjezik',
  },
  {
    // Filed in the register, outside official ATC: no catalog name exists.
    'Nr rendor':'3', 'Emri tregtar':'Sedatif PC', 'Substanca aktive':'Avena sativa D2; Coffea arabica D12',
    'ATC Code':'N05H0001', 'Forma farmaceutike':'Tabletë', 'Klasa / Çka është':'Homeopatik',
  },
  {
    'Nr rendor':'4', 'Emri tregtar':'Sedatif B', 'Substanca aktive':'Passiflora incarnata D3',
    'ATC Code':'N05H0002', 'Forma farmaceutike':'Tabletë', 'Klasa / Çka është':'Homeopatik',
  },
];

function boot() {
  const sandbox = {
    document:{
      documentElement:{ dataset:{ miPage:'barnat' } },
      readyState:'complete',
      getElementById:() => null,
      querySelector:() => null,
      addEventListener:() => {},
    },
    window:{
      addEventListener:() => {},
      MEDINDEX_REGISTRY_ROWS:ROWS,
      MEDINDEX_ATC_GROUPS:GROUPS,
      MEDINDEX_ATC_SUBGROUPS:CATEGORIES,
      MEDINDEX_ATC_SUBDIVISIONS:SUBDIVISIONS,
    },
    localStorage:{ getItem:() => null, setItem:() => {} },
    setTimeout:() => 0,
    clearTimeout:() => {},
    CSS:{ escape:value => String(value) },
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('registry-list-view.js'), sandbox, { filename:'registry-list-view.js' });
  return sandbox.window.MedIndexRegistryListView;
}

{
  const api = boot();
  const label = path => api._test.categoryLabel(path);

  assert.equal(label(['N']), 'Sistemi nervor');
  assert.equal(label(['N', 'N02']), 'Analgjetikë – barna kundër dhimbjes');

  // The rows from the report: named, not "Nënndarje ATC".
  assert.equal(label(['N', 'N02', 'N02A']), 'Opioide');
  assert.equal(label(['N', 'N02', 'N02B']), 'Analgjezikë dhe antipiretikë të tjerë');
  assert.equal(label(['N', 'N02', 'N02A', 'N02AA']), 'Alkaloide natyrale të opiumit');

  // A code the catalog cannot name still says what it holds, in the register's
  // own words — the first substance of each product beneath it.
  const derived = label(['N', 'N05', 'N05H']);
  assert.ok(derived, 'a code outside official ATC must still describe itself');
  assert.match(derived, /Avena sativa D2/,
    'the fallback must quote the register rather than invent an ATC name');
  assert.match(derived, /Passiflora incarnata D3/);
  assert.doesNotMatch(derived, /Coffea/,
    'only the substance a combination is filed under is shown, not the whole list');
  assert.doesNotMatch(derived, /Nënndarje/);
}

{
  // The fallback stays bounded: a long node is summarised, never dumped.
  const many = Array.from({ length:40 }, (_, index) => ({
    'Nr rendor':String(index + 1),
    'Emri tregtar':`Bar ${index + 1}`,
    'Substanca aktive':`Substanca ${index + 1}`,
    'ATC Code':'N05H0001',
    'Forma farmaceutike':'Tabletë',
  }));
  const sandbox = {
    document:{
      documentElement:{ dataset:{ miPage:'barnat' } },
      readyState:'complete',
      getElementById:() => null,
      querySelector:() => null,
      addEventListener:() => {},
    },
    window:{
      addEventListener:() => {},
      MEDINDEX_REGISTRY_ROWS:many,
      MEDINDEX_ATC_GROUPS:GROUPS,
      MEDINDEX_ATC_SUBGROUPS:CATEGORIES,
      MEDINDEX_ATC_SUBDIVISIONS:SUBDIVISIONS,
    },
    localStorage:{ getItem:() => null, setItem:() => {} },
    setTimeout:() => 0,
    clearTimeout:() => {},
    CSS:{ escape:value => String(value) },
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('registry-list-view.js'), sandbox, { filename:'registry-list-view.js' });
  const derived = sandbox.window.MedIndexRegistryListView._test.categoryLabel(['N', 'N05', 'N05H']);
  assert.ok(derived.split('·').length <= 3, 'at most three substances stand in for a name');
  assert.match(derived, /…$/, 'a node holding more than that says so');
  assert.ok(derived.length < 120, 'a category row must stay a row');
}

// --- the placeholder is no longer what a doctor reads -----------------------

{
  const source = read('registry-list-view.js');
  assert.match(source, /rlv-category-substances/,
    'a register-derived label must be distinguishable from a catalogued one');
  assert.match(read('registry-list-view.css'), /\.rlv-category-substances\s*\{/,
    'the derived label needs its own styling');
  assert.equal((source.match(/Nënndarje ATC/g) || []).length, 1,
    'the placeholder may survive only as the last resort behind both sources');
}

console.log('ATC subdivision naming passed: every level-4 code in the register carries its official Albanian name, level-5 subgroups are named where they are browsed, and any code the catalog cannot name describes itself with the register\'s own substances.');
