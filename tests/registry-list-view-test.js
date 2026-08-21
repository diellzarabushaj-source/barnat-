'use strict';

// Registry list view — exercised against the real file, not its source text.
//
// The rules that matter clinically are the ones asserted here: a search must
// find a drug by its indication, the snippet shown must be a verbatim slice of
// the stored text, and the ATC tree must be built from real codes rather than
// invented labels. The table is untouched, and that is asserted too.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ROWS = [
  {
    'Nr rendor':'1', 'Emri tregtar':'Levotuss', 'Substanca aktive':'Levodropropizine',
    'ATC Code':'R05DB27', 'Fortësia':'30 mg/5 mL', 'Forma farmaceutike':'Shurup oral',
    'Klasa / Çka është':'Antitusiv periferik', 'Prodhuesi':'Dompé',
    'Përdorimi (fjalë kyçe)':'I indikuar për trajtimin simptomatik të kollës së thatë dhe jo-produktive. Nuk rekomandohet te fëmijët nën 2 vjeç.',
  },
  {
    'Nr rendor':'2', 'Emri tregtar':'Ozempic', 'Substanca aktive':'Semaglutide',
    'ATC Code':'A10BJ06', 'Fortësia':'1 mg/dozë', 'Forma farmaceutike':'Solucion për injeksion',
    'Klasa / Çka është':'Analog i GLP-1', 'Prodhuesi':'Novo Nordisk',
    'Përdorimi (fjalë kyçe)':'Diabeti mellitus tip 2 te të rriturit.',
  },
  {
    'Nr rendor':'3', 'Emri tregtar':'Panadol', 'Substanca aktive':'Paracetamol',
    'ATC Code':'N02BE01', 'Fortësia':'500 mg', 'Forma farmaceutike':'Tabletë e veshur me film',
    'Klasa / Çka është':'Analgjezik', 'Prodhuesi':'GSK',
    'Përdorimi (fjalë kyçe)':'Dhimbje dhe temperaturë.',
  },
  {
    'Nr rendor':'4', 'Emri tregtar':'Pa klasifikim', 'Substanca aktive':'X',
    'ATC Code':'N/A', 'Fortësia':'', 'Forma farmaceutike':'Tabletë',
    'Klasa / Çka është':'', 'Prodhuesi':'', 'Përdorimi (fjalë kyçe)':'',
  },
];

// A DOM stub with only what the module touches before it gives up mounting.
function boot() {
  const listeners = new Map();
  const documentStub = {
    documentElement:{ dataset:{ miPage:'barnat' } },
    readyState:'complete',
    getElementById:() => null,
    querySelector:() => null,
    addEventListener:(name, handler) => { listeners.set(name, handler); },
  };
  const sandbox = {
    document:documentStub,
    window:{ addEventListener:() => {}, MEDINDEX_REGISTRY_ROWS:ROWS },
    localStorage:{ getItem:() => null, setItem:() => {} },
    setTimeout:() => 0,
    clearTimeout:() => {},
    CSS:{ escape:v => String(v) },
    console,
  };
  sandbox.window.MEDINDEX_ATC_GROUPS = { R:'Sistemi respirator', A:'Trakti alimentar dhe metabolizmi', N:'Sistemi nervor' };
  sandbox.window.MEDINDEX_ATC_SUBGROUPS = { R05:'Preparatet për kollë dhe ftohje', A10:'Barnat për diabetin', N02:'Analgjezikët' };
  sandbox.globalThis = sandbox;
  Object.assign(sandbox, {
    MEDINDEX_REGISTRY_ROWS:ROWS,
    MEDINDEX_ATC_GROUPS:sandbox.window.MEDINDEX_ATC_GROUPS,
    MEDINDEX_ATC_SUBGROUPS:sandbox.window.MEDINDEX_ATC_SUBGROUPS,
  });
  vm.createContext(sandbox);
  vm.runInContext(read('registry-list-view.js'), sandbox, { filename:'registry-list-view.js' });
  return sandbox.window.MedIndexRegistryListView;
}

const api = boot();
assert.ok(api, 'the list view must publish its API');

// --- the ATC tree comes from real codes ----------------------------------

{
  // Arrays cross out of the vm carrying the sandbox's prototype, so each one is
  // copied into a host array before a strict comparison.
  const levels = code => [...api._test.levelsOf(code)];

  assert.deepEqual(levels('R05DB27'), ['R', 'R05', 'R05D', 'R05DB'],
    'a full ATC code carries four browsable levels');
  assert.deepEqual(levels('A10BJ06'), ['A', 'A10', 'A10B', 'A10BJ']);
  assert.deepEqual(levels('N02'), ['N', 'N02'], 'a short code stops where the code stops');

  // The register carries placeholders. Filing them would invent a category.
  assert.deepEqual(levels('N/A'), [], 'a placeholder is not a category');
  assert.deepEqual(levels(''), []);
  assert.deepEqual(levels('NOTATC'), [], 'a code without the letter-and-two-digits opening is refused');
}

// --- browsing reaches every drug, without anonymous detours ---------------

{
  const { browseAt } = api._test;

  const root = browseAt([]);
  assert.deepEqual([...root.children], ['A', 'N', 'R'],
    'the top level lists the ATC groups present, and only those');
  assert.equal(root.entries, 0, 'no drug is listed loose at the top level');
  assert.equal(root.count, ROWS.length, 'the total counts every row, placeholders included');

  // Levels four and five have no names in this dataset. A category small enough
  // to read must therefore open straight to its drugs rather than make the
  // doctor tap through a bare code.
  const respiratory = browseAt(['R']);
  assert.deepEqual([...respiratory.children], [],
    'a small category opens to drugs, not to an unlabelled ATC code');
  assert.equal(respiratory.entries, 1, 'and the drug is listed there');

  // The invariant that matters: browsing must reach every classified drug
  // exactly once, and a category's stated count must match what opening it
  // yields. A count that lies is worse than no count.
  let reached = 0;
  const walk = path => {
    const view = browseAt(path);
    reached += view.entries;
    [...view.children].forEach(code => walk([...path, code]));
  };
  walk([]);
  const classified = ROWS.filter(row => [...api._test.levelsOf(row['ATC Code'])].length).length;
  assert.equal(reached, classified, 'every classified drug is reachable by browsing, exactly once');
  assert.equal(reached, ROWS.length - 1, 'the one placeholder row is the only row outside the tree');

  for (const code of [...root.children]) {
    let sum = 0;
    const total = path => {
      const view = browseAt(path);
      sum += view.entries;
      [...view.children].forEach(child => total([...path, child]));
    };
    total([code]);
    assert.equal(sum, browseAt([code]).count, `the count shown on ${code} matches what it contains`);
  }
}

// --- searching by indication finds the drug ------------------------------

{
  const { search } = api._test;
  const hits = search('kollë');
  assert.equal(hits.length, 1, 'a symptom must find the drug whose indication mentions it');
  assert.equal(hits[0].entry.row['Emri tregtar'], 'Levotuss');
  assert.equal(hits[0].rule.prose, true, 'the match is reported as coming from prose, so a snippet is shown');

  // Accent folding: what a doctor types in a hurry must still match.
  assert.equal(search('kolle').length, 1, 'the search folds accents');
  assert.equal(search('KOLLË').length, 1, 'the search folds case');
}

// --- identity always outranks a mention in prose -------------------------

{
  const { search } = api._test;
  const hits = search('paracetamol');
  assert.equal(hits[0].entry.row['Emri tregtar'], 'Panadol');
  assert.equal(hits[0].rule.key, 'substance', 'an exact substance match is the reason, not a prose hit');

  const byAtc = api._test.search('A10BJ');
  assert.equal(byAtc[0].entry.row['Emri tregtar'], 'Ozempic', 'an ATC prefix finds its drug');

  const byForm = api._test.search('Shurup oral');
  assert.equal(byForm[0].entry.row['Emri tregtar'], 'Levotuss', 'the pharmaceutical form is searchable in full');
}

// --- the filter row narrows without lying ---------------------------------

{
  const { setFilter, clearFilters, filtered, optionsFor } = api._test;

  // Options are counted from the rows in play, so a doctor can see how much a
  // filter would leave before choosing it.
  const forms = [...optionsFor('form', '')];
  assert.ok(forms.includes('Tabletë:1'), `each distinct form is offered with its count, got ${forms.join(', ')}`);
  assert.ok(forms.includes('Tabletë e veshur me film:1'),
    'a coated tablet is its own form, not folded into the plain one');
  assert.ok(!forms.some(entry => entry.startsWith(':')), 'a blank value is never offered as a filter');

  // The empty strength on the unclassified row must not become an option.
  const strengths = [...optionsFor('strength', '')];
  assert.equal(strengths.length, 3, `only the three rows that state a strength are offered, got ${strengths.join(', ')}`);

  // Filtering applies to everything the search matched, not just the first page
  // of it — otherwise a filter would only search the top of the list.
  clearFilters();
  assert.deepEqual([...filtered('tablet')].sort(), ['Pa klasifikim', 'Panadol'],
    'both tablets match before filtering');

  setFilter('substance', 'Paracetamol');
  assert.deepEqual([...filtered('tablet')], ['Panadol'], 'the substance filter narrows the result');
  assert.deepEqual([...filtered('kolle')], [], 'a filter that excludes everything returns nothing, not everything');

  // Combining filters narrows further; clearing restores.
  setFilter('form', 'Shurup oral');
  assert.deepEqual([...filtered('tablet')], [], 'contradictory filters return nothing');
  clearFilters();
  assert.deepEqual([...filtered('tablet')].sort(), ['Pa klasifikim', 'Panadol'], 'clearing restores everything');

  // A drug with no ATC is still reachable by filtering — the tree excludes it,
  // but the register still holds it.
  setFilter('form', 'Tabletë');
  assert.ok([...filtered('tablet')].includes('Pa klasifikim'),
    'a row the ATC tree cannot file is still reachable through search and filters');

  // A chosen value must stay in its own dropdown even when the other filters
  // would otherwise exclude it, or it would keep filtering while looking unset.
  setFilter('substance', 'Levodropropizine');
  assert.ok([...optionsFor('form', '')].includes('Tabletë:0'),
    'the chosen form stays listed, counted honestly at zero, rather than looking unset while it filters');
  clearFilters();
}

// --- the snippet is the stored text, marked and never rewritten ----------

{
  const { snippet } = api._test;
  const source = ROWS[0]['Përdorimi (fjalë kyçe)'];
  const out = snippet(source, 'kolles');

  assert.match(out, /<mark>/, 'the matched run is marked');
  assert.equal((out.match(/<mark>/g) || []).length, 1, 'exactly one run is marked');

  // Strip the markup and the ellipses: what remains must appear verbatim in the
  // original. Nothing is paraphrased, reordered or generated.
  const plain = out.replace(/<\/?mark>/g, '').replace(/…/g, '').trim();
  assert.ok(source.includes(plain), `the snippet must be a verbatim slice of the stored text, got: ${plain}`);

  assert.equal(snippet(source, 'nuk-ekziston'), '', 'no hit means no snippet');
  assert.equal(snippet('', 'kolle'), '');

  // The stored text is escaped, so a register that ever contained markup could
  // not inject it into the page.
  const hostile = snippet('Përdoret për <script>alert(1)</script> dhe kollë.', 'kolle');
  assert.ok(!hostile.includes('<script'), 'stored markup is escaped, never rendered');
}

// --- an opened row shows the stored record whole --------------------------

{
  const { detailFields } = api._test;
  const pairs = [...detailFields(ROWS[0])].map(pair => [...pair]);
  const keys = pairs.map(([key]) => key);

  assert.deepEqual(keys.slice(0, 3), ['Substanca aktive', 'Fortësia', 'Forma farmaceutike'],
    'the fields a doctor reads first come first');
  assert.ok(keys.includes('Përdorimi (fjalë kyçe)'), 'the indication is shown in the opened record');

  // Values are the stored strings, not summaries of them.
  const use = pairs.find(([key]) => key === 'Përdorimi (fjalë kyçe)')[1];
  assert.equal(use, ROWS[0]['Përdorimi (fjalë kyçe)'],
    'the opened record repeats the stored text verbatim');

  assert.equal(new Set(keys).size, keys.length, 'no field is listed twice');
  assert.ok(!keys.some(key => key.startsWith('__')),
    'runtime-injected flags are not part of the register and are not shown');

  // The fourth fixture row is mostly blank; empty columns must not render as
  // empty labelled rows.
  assert.ok([...detailFields(ROWS[3])].every(([, value]) => value !== ''), 'blank fields are left out');

  // A column the sheet gains upstream still reaches the reader.
  const extended = [...detailFields({ ...ROWS[1], 'Kolonë e re':'Vlerë e re' })].map(pair => [...pair]);
  assert.ok(extended.some(([key, value]) => key === 'Kolonë e re' && value === 'Vlerë e re'),
    'an unknown column is still shown rather than silently dropped');
}

// --- the table is left alone ---------------------------------------------

{
  const js = read('registry-list-view.js');
  assert.ok(!/\.innerHTML\s*=\s*[^;]*dataTable/.test(js), 'the list view must never write into the table');

  // The table is paginated, so a drug found in the list is usually not on the
  // page the table is showing. The list must open it in place instead of
  // pointing at a row that is not rendered.
  assert.ok(!/dataTable tbody tr\[/.test(js),
    'the list must not try to hand off to a table row that pagination may not have rendered');
  assert.match(js, /panel\.id = 'registryListView'/, 'the list lives in its own panel');
  assert.match(js, /ROOT\.dataset\.miRegistryView = next/,
    'the switch is a root attribute, so CSS decides what is shown rather than the script tearing anything down');

  // The phone toolbar has a height budget (94px) that two separate mobile gates
  // enforce. A control added inside it takes a whole row there and blows both,
  // so the toggle lives above the registry instead — it must never move back.
  assert.ok(!/toolbar\.appendChild/.test(js),
    'the view toggle must not be added into the search toolbar: it has a height budget on phones');
  assert.match(js, /registry\.insertAdjacentElement\('beforebegin', bar\)/,
    'the toggle sits above the registry, outside the toolbar');

  const css = read('registry-list-view.css');
  assert.match(css, /html\[data-mi-registry-view="list"\] #registryContent \{ display: none !important; \}/,
    'the table is hidden by CSS rather than dismantled');

  // The switch belongs to the screens that show a table. On a phone the
  // registry is already a card list, and two mobile gates budget that layout
  // tightly — so the surface starts hidden and is only turned on from the table
  // breakpoint up. Hiding the table must be scoped the same way, or a
  // preference set on a desktop would leave a phone with no registry at all.
  assert.match(css, /\.rlv-bar,\s*\n\.rlv-panel \{ display: none; \}/,
    'the list surface is off by default and opted into by width');
  const desktopOnly = css.slice(css.indexOf('@media (min-width: 768px)'));
  assert.ok(desktopOnly.includes('html[data-mi-registry-view="list"] #registryContent'),
    'the rule that hides the table lives inside the width query, not outside it');
  for (const token of ['--mi-border', '--mi-surface', '--mi-brand-600', '--mi-text']) {
    assert.ok(css.includes(token), `the list must build on the shared token ${token}`);
  }

  const html = read('index.html');
  assert.match(html, /registry-list-view\.js\?v=/, 'the registry page loads the list runtime');
  assert.match(html, /registry-list-view\.css\?v=/, 'the registry page loads the list stylesheet');
  assert.match(html, /id="registryContent"/, 'the table wrapper is still there, untouched');
  assert.match(html, /id="dataTable"/, 'the table itself is still there, untouched');
}

{
  // The register arrives one page at a time on desktop, so the rows the table is
  // showing are not the register. Browsing and searching answer over all of it,
  // and a paged window silently under-reports every count: the tree said "50
  // barna" against a register of 4012. The list asks for the whole dataset, and
  // the module that owns the paging answers.
  const listView = read('registry-list-view.js');
  assert.match(listView, /window\.MEDINDEX_REGISTRY_PARTIAL/,
    'the list must notice when it has been given a page instead of the register');
  assert.match(listView, /medindex:registry-full-dataset-needed/,
    'the list asks for the full dataset rather than reaching for the network itself');

  const lite = read('registry-desktop-lite.js');
  assert.match(lite, /medindex:registry-full-dataset-needed/,
    'the paging owner listens for that request');
  assert.match(lite, /requestFullRegistry\(clean\(event\?\.detail\?\.reason\)/,
    'and satisfies it through the existing handoff instead of a second fetch');
  assert.match(
    lite,
    /addEventListener\('medindex:registry-ready',\s*\(\)\s*=>\s*\{\s*\n?\s*window\.MEDINDEX_REGISTRY_PARTIAL = false;/,
    'the partial flag is cleared once the full registry lands, or it lies forever',
  );
}

{
  // Verification and editing are retired from the table, and the calculator is
  // opt-in. Each was hidden at the <col> while its th/td kept rendering, so the
  // registry carried three columns nobody asked for — one of them blank — and
  // reserved 336px for them.
  const unified = read('registry-unified-table.css');
  const clinicalShow = unified.slice(unified.indexOf('[data-registry-ux-view="clinical"] body #dataTable :is(th,td):is('));
  const whitelist = clinicalShow.slice(0, clinicalShow.indexOf('}'));
  for (const key of ['clinical-status', 'clinical-action']) {
    assert.ok(
      !whitelist.includes(`"${key}"`),
      `clinical view must not force ${key} back on top of the rule that retires it`,
    );
  }

  const doseCss = read('registry-dose-table-button.css');
  assert.match(
    doseCss,
    /\[data-registry-ux-view="clinical"\]\[data-registry-dose-column-visible="true"\]/,
    'the clinical-view dose column follows the opt-in flag instead of outranking it',
  );
}

console.log('Registry list view contract passed.');
