'use strict';

// Registry search suggestions — exercised against the real file.
//
// What matters here: the four categories are the ones a doctor thinks in, every
// suggestion is a value that really exists in the register, an indication match
// carries a verbatim slice of the stored sentence, and none of it is allowed to
// cost anything on the phone toolbar or on a keystroke.

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
  const listeners = new Map();
  const sandbox = {
    document:{
      documentElement:{ dataset:{ miPage:'barnat' } },
      readyState:'complete',
      getElementById:() => null,
      querySelector:() => null,
      createElement:() => ({ style:{}, setAttribute(){}, appendChild(){}, querySelector:() => null }),
      addEventListener:(name, handler) => { listeners.set(name, handler); },
      body:{ appendChild(){} },
    },
    window:{ addEventListener:() => {}, MEDINDEX_REGISTRY_ROWS:ROWS },
    localStorage:{ getItem:() => null, setItem:() => {} },
    setTimeout:() => 0,
    clearTimeout:() => {},
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

const rowsOf = query => [...api._test.suggest(query)].map(item => ({ ...item }));

// --- a name suggests the drug, not everything that mentions it -------------

{
  const hits = rowsOf('panad');
  assert.equal(hits.length, 1, 'one drug starts with this');
  assert.equal(hits[0].group, 'name');
  assert.equal(hits[0].term, 'Panadol', 'the suggestion is the register\'s own spelling');
}

// --- a substance is offered once, however many products carry it -----------

{
  const hits = rowsOf('paracetamol');
  const substances = hits.filter(item => item.group === 'substance');
  assert.equal(substances.length, 1, 'a shared substance is suggested once, not once per product');
  assert.equal(substances[0].term, 'Paracetamol');

  // Two products carry it, and both are still offered by name.
  const names = hits.filter(item => item.group === 'name').map(item => item.term).sort();
  assert.deepEqual(names, [], 'no trade name contains "paracetamol", so none is offered');
}

// --- ATC is offered as the levels the dataset actually names ---------------

{
  const atc = [...api._test.atcTerms()].map(item => ({ ...item }));
  const codes = atc.map(item => item.value).sort();
  assert.deepEqual(codes, ['A', 'A10', 'N', 'N02', 'R', 'R05'],
    'only the one and three character levels present in the data are offered');
  assert.ok(!codes.includes('N/A'), 'a placeholder is never offered as a category');

  for (const item of atc) {
    assert.ok(item.label, `${item.value} is offered with the name the dataset gives it`);
  }

  // Searchable by code and by the category's own name.
  assert.ok(rowsOf('r05').some(item => item.group === 'atc' && item.term === 'R05'));
  assert.ok(rowsOf('analgjez').some(item => item.group === 'atc' && item.term === 'N02'),
    'an ATC category is findable by its name, not only its code');
}

// --- an indication finds the drug the table could never surface ------------

{
  const hits = rowsOf('kolle');
  const uses = hits.filter(item => item.group === 'use');
  assert.equal(uses.length, 1, 'the symptom finds the drug that treats it');
  assert.equal(uses[0].term, 'Levotuss', 'choosing it searches for that drug');

  // The snippet is the stored sentence, marked — never reworded.
  const plain = uses[0].snippet.replace(/<\/?mark>/g, '').replace(/…/g, '').trim();
  assert.ok(ROWS[0]['Përdorimi (fjalë kyçe)'].includes(plain),
    `the snippet must be a verbatim slice of the stored text, got: ${plain}`);
  assert.match(uses[0].snippet, /<mark>/, 'the matched run is marked');

  assert.equal(rowsOf('KOLLËS').filter(item => item.group === 'use').length, 1,
    'accents and case are folded');
}

// --- a drug already offered by name is not repeated as an indication -------

{
  const hits = rowsOf('rrituri');
  const uses = hits.filter(item => item.group === 'use').map(item => item.term).sort();
  assert.deepEqual(uses, ['Ozempic', 'Panadol'], 'both indications that mention it are offered');

  // "Panadol" matches by name, so it must not also appear under indications.
  const both = rowsOf('panadol');
  assert.ok(both.some(item => item.group === 'name' && item.term === 'Panadol'));
  assert.equal(both.filter(item => item.group === 'use' && item.term === 'Panadol').length, 0,
    'a drug found by name is not listed again under indications');
}

// --- short and empty queries suggest nothing ------------------------------

{
  assert.deepEqual(rowsOf(''), []);
  assert.deepEqual(rowsOf('k'), [], 'a single character is not enough to suggest on');
}

// --- markup in the register can never reach the page as markup -------------

{
  const hostile = api._test.snippet(
    'Përdoret për <script>alert(1)</script> dhe kollë.',
    api._test.normalize('Përdoret për <script>alert(1)</script> dhe kollë.'),
    'kolle',
  );
  assert.ok(!hostile.includes('<script'), 'stored markup is escaped, never rendered');
}

// --- the cost is where it belongs ------------------------------------------

{
  const js = read('registry-search-suggest.js');

  // Two mobile gates hold the phone toolbar to 94px. The panel is fixed and
  // lives on the body, so it is out of flow and cannot add to it.
  assert.match(js, /document\.body\.appendChild\(panel\)/,
    'the panel hangs off the body, not the toolbar');
  assert.match(js, /position: fixed|rss-panel/, 'the panel is positioned, not in flow');
  assert.match(read('registry-search-suggest.css'), /\.rss-panel \{\s*position: fixed;/,
    'the panel is taken out of flow by CSS');

  // A keystroke must not be charged for the search. The input handler may only
  // set a timer; the work happens after typing stops.
  const handler = js.slice(js.indexOf("input.addEventListener('input'"));
  const synchronous = handler.slice(0, handler.indexOf('setTimeout('));
  assert.ok(handler.includes('setTimeout('), 'the keystroke handler defers its work to a timer');
  assert.ok(!/suggest\(|buildTerms\(|buildProse\(/.test(synchronous),
    'nothing is searched or indexed before the timer: a keystroke pays for a timer and nothing else');

  // Scroll and resize listeners exist only while the panel is open, so they
  // cannot show up in the interaction budget when it is shut.
  assert.ok(!/addEventListener\('scroll'[^)]*\)(?!.*once)/.test(js.replace(/\n/g, ' ')),
    'no permanent scroll listener is added');
  assert.match(js, /window\.addEventListener\('scroll', close, \{ once:true, passive:true \}\)/,
    'the scroll listener is one-shot and only armed while open');

  const html = read('index.html');
  assert.match(html, /registry-search-suggest\.js\?v=/, 'the registry page loads the suggestions');
  assert.match(html, /registry-search-suggest\.css\?v=/, 'and their stylesheet');
}

console.log('Registry search suggestions contract passed.');
