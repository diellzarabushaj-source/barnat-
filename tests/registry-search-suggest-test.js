'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ROWS = [
  {
    'Emri tregtar':'Levotuss', 'Substanca aktive':'Levodropropizine', 'ATC Code':'R05DB27',
    'Fortësia':'30 mg/5 mL', 'Forma farmaceutike':'Shurup oral',
    'Përdorimi (fjalë kyçe)':'I indikuar për trajtimin simptomatik të kollës së thatë dhe jo-produktive.',
  },
  {
    'Emri tregtar':'Ozempic', 'Substanca aktive':'Semaglutide', 'ATC Code':'A10BJ06',
    'Fortësia':'1 mg/dozë', 'Forma farmaceutike':'Solucion për injeksion',
    'Përdorimi (fjalë kyçe)':'Diabeti mellitus tip 2 te të rriturit.',
  },
  {
    'Emri tregtar':'Panadol', 'Substanca aktive':'Paracetamol', 'ATC Code':'N02BE01',
    'Fortësia':'500 mg', 'Forma farmaceutike':'Tabletë',
    'Përdorimi (fjalë kyçe)':'Dhimbje dhe temperaturë te të rriturit.',
  },
  {
    'Emri tregtar':'Paldon', 'Substanca aktive':'Paracetamol', 'ATC Code':'N02BE01',
    'Fortësia':'1 g', 'Forma farmaceutike':'Tabletë',
    'Përdorimi (fjalë kyçe)':'Dhimbje koke.',
  },
  {
    'Emri tregtar':'Pa klasifikim', 'Substanca aktive':'X', 'ATC Code':'N/A',
    'Fortësia':'', 'Forma farmaceutike':'Tabletë', 'Përdorimi (fjalë kyçe)':'',
  },
];

function boot() {
  const sandbox = {
    document:{
      documentElement:{ dataset:{ miPage:'barnat' } },
      readyState:'complete',
      getElementById:() => null,
      createElement:() => ({ style:{}, setAttribute(){}, appendChild(){}, querySelector:() => null }),
      addEventListener(){},
      body:{ appendChild(){} },
    },
    window:{ addEventListener(){}, MEDINDEX_REGISTRY_ROWS:ROWS },
    setTimeout:() => 0,
    clearTimeout(){},
    console,
  };
  sandbox.window.MEDINDEX_ATC_GROUPS = { R:'Sistemi respirator', A:'Trakti alimentar dhe metabolizmi', N:'Sistemi nervor' };
  sandbox.window.MEDINDEX_ATC_SUBGROUPS = { R05:'Preparatet për kollë dhe ftohje', A10:'Barnat për diabetin', N02:'Analgjezikët' };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('registry-search-suggest.js'), sandbox, { filename:'registry-search-suggest.js' });
  return sandbox.window.MedIndexRegistrySuggest;
}

const api = boot();
assert.ok(api, 'the suggestions must publish their API');
const t = api._test;
const rowsOf = query => [...t.suggest(query)].map(item => ({ ...item }));

{
  const name = rowsOf('panad');
  assert.equal(name.length, 1);
  assert.equal(name[0].group, 'name');
  assert.equal(name[0].term, 'Panadol');
  const substances = rowsOf('paracetamol').filter(item => item.group === 'substance');
  assert.equal(substances.length, 1);
  assert.equal(substances[0].term, 'Paracetamol');
  const atc = [...t.atcTerms()].map(item => ({ ...item }));
  assert.deepEqual(atc.map(item => item.value).sort(), ['A', 'A10', 'N', 'N02', 'R', 'R05']);
  assert.ok(rowsOf('analgjez').some(item => item.group === 'atc' && item.term === 'N02'));
  const uses = rowsOf('kolle').filter(item => item.group === 'use');
  assert.equal(uses.length, 1);
  assert.equal(uses[0].term, 'Levotuss');
  assert.match(uses[0].snippet, /<mark>/);
  assert.equal(rowsOf('KOLLËS').filter(item => item.group === 'use').length, 1);
  assert.deepEqual(rowsOf(''), []);
  assert.deepEqual(rowsOf('k'), []);
}

{
  const source = 'Përdoret për <script>alert(1)</script> dhe kollë.';
  const output = t.snippet(source, t.normalize(source), 'kolle');
  assert.ok(!output.includes('<script'));
}

{
  assert.equal(t.directSuggestionFromResult({ tradeName:'Ozempic', substance:'Semaglutide', strength:'1 mg', form:'Injeksion' }, 'ozem').group, 'name');
  assert.equal(t.directSuggestionFromResult({ tradeName:'Panadol', substance:'Paracetamol' }, 'paracetamol').group, 'substance');
  assert.equal(t.directSuggestionFromResult({ tradeName:'Levotuss', substance:'Levodropropizine', use:'Kollë e thatë' }, 'kolle').group, 'use');
}

{
  assert.equal(t.editDistance('ozmpic', 'ozempic', 2), 1);
  assert.equal(t.editDistance('paracetmol', 'paracetamol', 2), 1);
  assert.equal(t.fuzzyThreshold('abc'), 0);
  assert.equal(t.fuzzyThreshold('ozmpic'), 1);
  assert.equal(t.fuzzyThreshold('paracetmol'), 2);
  assert.equal(t.fuzzyAnchor('paracetmol'), 'par');
  const hit = [...t.fuzzySuggestions([
    { tradeName:'Ozempic', substance:'Semaglutide', use:'Diabeti mellitus tip 2' },
    { tradeName:'Panadol', substance:'Paracetamol', use:'Dhimbje' },
  ], 'ozmpic')][0];
  assert.equal(hit.term, 'Ozempic');
  assert.equal(hit.group, 'name');
  assert.equal(hit.fuzzy, true);
  assert.deepEqual([...t.fuzzySuggestions([{ tradeName:'Levotuss', substance:'Levodropropizine', use:'kollë e thatë' }], 'kollee')], []);
  assert.deepEqual([...t.fuzzySuggestions([{ tradeName:'Test', substance:'X' }], 'R05D')], []);
}

{
  const merged = [...t.mergeSuggestions(
    [{ group:'name', term:'Panadol', primary:'Panadol' }],
    [
      { group:'name', term:'Panadol', primary:'Panadol' },
      { group:'name', term:'Paldon', primary:'Paldon' },
      { group:'substance', term:'Paracetamol', primary:'Paracetamol' },
    ],
  )].map(item => ({ ...item }));
  assert.equal(merged.filter(item => item.term === 'Panadol').length, 1);
  assert.ok(merged.some(item => item.term === 'Paldon'));
  assert.ok(merged.some(item => item.term === 'Paracetamol'));
}

{
  const js = read('registry-search-suggest.js');
  const css = read('registry-search-suggest.css');
  const premium = /version:'registry-search-suggest-v(?:3|[4-9]|\d{2,})'/.test(js);

  assert.match(js, /version:'registry-search-suggest-v(?:2|[3-9]|\d{2,})'/,
    'Search suggest runtime must expose the hardened v2-or-newer contract.');
  assert.match(js, /const DEBOUNCE_MS = (?:32|36);/);
  assert.match(js, /const API = '\/api\/drug-search';/);
  assert.match(js, /const REMOTE_CACHE_LIMIT = 64;/);
  assert.match(js, /while \(state\.remoteCache\.size > REMOTE_CACHE_LIMIT\)/);
  assert.match(js, /state\.controller\?\.abort/);
  assert.match(js, /seq !== state\.requestSeq \|\| signal\.aborted/);
  assert.ok(!/\/api\/registry|medindex:registry-full-dataset-needed|DRUG_DATA_PARTS/.test(js));

  const handler = js.slice(js.indexOf("input.addEventListener('input'"));
  const firstTimer = handler.indexOf('setTimeout(');
  assert.ok(firstTimer > 0, 'Remote enrichment must remain delayed and abortable.');
  const synchronous = handler.slice(0, firstTimer);

  if (premium) {
    assert.match(js, /const PROSE_MIN_CHARS = 3;/,
      'Premium search must avoid prose indexing for very short queries.');
    assert.match(js, /typeof requestIdleCallback === 'function'/,
      'Premium search indexes should prewarm only during idle time.');
    assert.match(js, /state\.termsSource === sourceRows/,
      'Identity index must invalidate when the registry dataset swaps.');
    assert.match(js, /state\.proseSource === sourceRows/,
      'Prose index must invalidate when the registry dataset swaps.');
    assert.match(synchronous, /const localItems = suggest\(query\);/,
      'Local autocomplete must paint before the remote debounce.');
    assert.match(synchronous, /render\(localItems, query\)/,
      'Immediate local matches must be rendered synchronously.');
    assert.ok(!/fetch\(/.test(synchronous),
      'Network work must never enter the synchronous typing path.');
    assert.match(js, /rss-topline/);
    assert.match(js, /rss-footer/);
    assert.match(js, /aria-keyshortcuts', 'Control\+K Meta\+K \/'/);
    assert.ok(!/gemini|openai|anthropic/i.test(js),
      'The registry search hot path must remain deterministic and AI-free.');
  } else {
    assert.ok(!/suggest\(|buildTerms\(|buildProse\(|fetch\(/.test(synchronous));
  }

  assert.match(js, /document\.body\.appendChild\(panel\)/);
  assert.match(css, /\.rss-panel \{\s*position: fixed;/);
  assert.match(js, /window\.addEventListener\('scroll', close, \{ once:true, passive:true \}\)/);
}

console.log('Registry smart search suggestions v2+ contract passed.');
