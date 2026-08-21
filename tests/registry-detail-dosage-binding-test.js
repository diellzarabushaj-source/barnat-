'use strict';

// Adult and pediatric dosage on the opened drug — desktop List and phone.
//
// The regression this locks down is specific. In List mode the register is
// served by its own dataset (`MEDINDEX_REGISTRY_LIST_ROWS`, the whole thing),
// while the table keeps a 50-row page in `MEDINDEX_REGISTRY_ROWS`. A
// `data-rlv-open` position addresses the first one. Reading the second one with
// that position falls off the end for every drug past the page, no row is
// found, and the record opens with no dosage at all — the state in the
// screenshot: prescription notation, then straight on to the marketing holder.
//
// The dosage itself is never invented here. What the clinical tables hold for
// that exact drug id is what is shown; when they hold nothing, the record says
// so in as many words.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const listView = read('registry-list-view.js');
const listDosage = read('registry-list-detail-dosage.js');
const mobile = read('registry-mobile-lite.js');
const mobileCss = read('registry-mobile-lite.css');
const cardHandler = read('lib/dosage-card-handler.js');

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const row = (nr, name, id) => ({
  'Nr rendor':String(nr),
  'Emri tregtar':name,
  'Substanca aktive':'Substancë',
  'ATC Code':'R02AA20',
  'Fortësia':'20 mg',
  'Forma farmaceutike':'Spray',
  'Si të shënohet në recetë':`Spr. ${name}`,
  __neonDrugId:id,
});

// The page the table happens to hold, and the register the List is showing.
const PAGE_ROWS = [row(1, 'Faqja 1', UUID_A), row(2, 'Faqja 2', UUID_B)];
const LIST_ROWS = [
  ...PAGE_ROWS,
  ...Array.from({ length:830 }, (_, index) => row(index + 3, `Bari ${index + 3}`, '')),
  row(833, 'Lysobact P Spray', UUID_B),
];
const OPENED = LIST_ROWS.length - 1;

// --- the list publishes the row behind an open position ---------------------

{
  const listeners = new Map();
  const sandbox = {
    document:{
      documentElement:{ dataset:{ miPage:'barnat', miRegistryView:'list' } },
      readyState:'complete',
      getElementById:() => null,
      querySelector:() => null,
      addEventListener:(name, handler) => { listeners.set(name, handler); },
    },
    window:{
      addEventListener:() => {},
      MEDINDEX_REGISTRY_ROWS:PAGE_ROWS,
      MEDINDEX_REGISTRY_LIST_ROWS:LIST_ROWS,
      MEDINDEX_REGISTRY_LIST_READY:true,
    },
    localStorage:{ getItem:() => null, setItem:() => {} },
    setTimeout:() => 0,
    clearTimeout:() => {},
    CSS:{ escape:value => String(value) },
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(listView, sandbox, { filename:'registry-list-view.js' });

  const api = sandbox.window.MedIndexRegistryListView;
  assert.ok(api, 'the list view must publish its API');
  assert.equal(typeof api.rowAt, 'function',
    'the list must publish the row behind a data-rlv-open position');

  const opened = api.rowAt(OPENED);
  assert.ok(opened, 'a position inside the List dataset must resolve to a drug');
  assert.equal(opened['Emri tregtar'], 'Lysobact P Spray',
    'the resolved drug must be the one the doctor opened, not a row of the table page');
  assert.equal(api.rowAt(0)['Emri tregtar'], 'Faqja 1');
  assert.equal(api.rowAt(LIST_ROWS.length), null, 'a position past the dataset resolves to nothing');
  assert.equal(api.rowAt(-1), null);
  assert.equal(api.rowAt('x'), null);
}

// --- the opened record is read from the dataset that is on screen -----------

function bootListDosage({ view = 'list', listReady = true, owner = true } = {}) {
  const listeners = new Map();
  const sandbox = {
    document:{
      documentElement:{ dataset:{ miPage:'barnat', miRegistryView:view } },
      getElementById:() => null,
      querySelector:() => null,
      head:{ appendChild:() => {} },
      createElement:() => ({ dataset:{}, style:{}, appendChild:() => {}, setAttribute:() => {} }),
      addEventListener:(name, handler) => { listeners.set(name, handler); },
    },
    window:{
      MEDINDEX_REGISTRY_ROWS:PAGE_ROWS,
      MEDINDEX_REGISTRY_LIST_ROWS:LIST_ROWS,
      MEDINDEX_REGISTRY_LIST_READY:listReady,
    },
    queueMicrotask,
    AbortController,
    fetch:() => Promise.reject(new Error('no network in this test')),
    console,
  };
  if (owner) {
    sandbox.window.MedIndexRegistryListView = {
      rowAt:index => (Number.isInteger(index) && index >= 0 && index < LIST_ROWS.length ? LIST_ROWS[index] : null),
    };
  }
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(listDosage, sandbox, { filename:'registry-list-detail-dosage.js' });
  return { api:sandbox.window.MedIndexRegistryListDetailDosage, sandbox };
}

{
  const { api } = bootListDosage();
  const test = api?._test;
  assert.ok(test?.rowForOpen, 'the list-detail dosage must expose its row resolution');

  const opened = test.rowForOpen({ dataset:{ rlvOpen:String(OPENED) } });
  assert.ok(opened, 'the drug behind an open position must be found in List mode');
  assert.equal(opened['Emri tregtar'], 'Lysobact P Spray');
  assert.equal(test.directDrugId(opened), UUID_B,
    'the exact Neon UUID must be carried through to the dosage request');

  // Same position, the paged table window alone: this is what used to happen.
  assert.equal(
    Number(OPENED) < PAGE_ROWS.length ? PAGE_ROWS[OPENED] : null,
    null,
    'the table page cannot answer a List position — that is the bug being fixed',
  );
}

{
  // Without the list view present, the module still resolves through the same
  // dataset the list would have shown.
  const { api } = bootListDosage({ owner:false });
  const opened = api._test.rowForOpen({ dataset:{ rlvOpen:String(OPENED) } });
  assert.equal(opened?.['Emri tregtar'], 'Lysobact P Spray',
    'the List dataset must remain the fallback source in List mode');
  assert.equal(api._test.listRows().length, LIST_ROWS.length);
}

{
  // Table mode is the table's own dataset, and a List dataset that has not
  // finished loading is never treated as the register.
  const table = bootListDosage({ view:'table' }).api;
  assert.equal(table._test.listRows().length, PAGE_ROWS.length,
    'Table mode must keep reading the rows the table owns');

  const loading = bootListDosage({ listReady:false }).api;
  assert.equal(loading._test.listRows().length, PAGE_ROWS.length,
    'an unfinished List dataset must never be indexed as if it were complete');
}

// --- identity stays exact ---------------------------------------------------

{
  const { api } = bootListDosage();
  const { directDrugId } = api._test;
  assert.equal(directDrugId({ __neonDrugId:UUID_A }), UUID_A);
  assert.equal(directDrugId({ drugId:UUID_B }), UUID_B);
  assert.equal(directDrugId({ id:'832' }), '', 'a registry number is not a drug identity');
  assert.equal(directDrugId({ 'Emri tregtar':'Lysobact' }), '', 'a trade name is not a drug identity');
  assert.equal(directDrugId({}), '');

  assert.doesNotMatch(listDosage, /view=cards&nr=/,
    'the list detail must never fall back to an ambiguous registry-number lookup');
  assert.match(listDosage, /API \+ '\?view=card&id='/,
    'the list detail must address the backend by exact drug id');
}

// --- the phone record carries the same two populations ----------------------

const mobileDosage = (() => {
  const start = mobile.indexOf('  // --- clinical dosage');
  const end = mobile.indexOf('  async function openDetail');
  assert.ok(start >= 0 && end > start, 'the phone detail must own a clinical dosage block');
  const helpersStart = mobile.indexOf('  const clean = value =>');
  const helpersEnd = mobile.indexOf('  function authReady()');

  // The real block, run as written — helpers included — rather than a copy of
  // it that could drift away from what ships.
  const script = 'let detailSession = null;\n(() => {\n'
    + mobile.slice(helpersStart, helpersEnd)
    + mobile.slice(start, end)
    + '  return { regimenHasText, dosageMarkup, loadDosage, applyDosage,\n'
    + '    setSession(value) { detailSession = value; } };\n})()';

  const sandbox = { URLSearchParams, console, fetch:() => Promise.reject(new Error('no network')) };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { block:vm.runInContext(script, sandbox, { filename:'mobile-lite-dosage.js' }), sandbox };
})();

const phone = mobileDosage.block;

{
  const payload = {
    ok:true,
    drugId:UUID_B,
    adult:{ dose:'1 spray 3 herë në ditë', route:'Oromukozal', frequency:'çdo 8 orë', indication:'Inflamacion i mukozës orale' },
    pediatric:{ dose:'1 spray 2 herë në ditë', route:'Oromukozal', warnings:'Jo nën 3 vjeç' },
  };
  const markup = phone.dosageMarkup(payload);
  assert.match(markup, /Të rriturit/, 'the phone record must show the adult regimen');
  assert.match(markup, /Fëmijët/, 'the phone record must show the pediatric regimen');
  assert.match(markup, /1 spray 3 herë në ditë/);
  assert.match(markup, /Jo nën 3 vjeç/);
  assert.match(markup, /Oromukozal/);

  // Only what the backend returned. An absent population is absent, not an
  // empty card, and a drug the clinical tables do not cover says so.
  assert.doesNotMatch(phone.dosageMarkup({ ok:true, adult:payload.adult }), /Fëmijët/,
    'a population with no verified text must not be given an empty card');
  assert.match(phone.dosageMarkup({ ok:true }), /Dozimi nuk është i disponueshëm ende\./,
    'a drug with no clinical dosage must say so plainly');
  assert.equal(phone.regimenHasText({ dose:'' }), false);
  assert.equal(phone.regimenHasText({ warnings:'Kujdes' }), true);
  assert.match(phone.dosageMarkup({ ok:true, adult:{ dose:'<b>2 mg</b>' } }), /&lt;b&gt;2 mg&lt;\/b&gt;/,
    'stored clinical text is escaped, never parsed as markup');
}

{
  // A dosage that arrives after the sheet moved on is dropped rather than
  // written under another drug's name.
  const host = { innerHTML:'' };
  const dialog = { querySelector:() => host };
  const session = { id:UUID_A };
  phone.setSession(session);
  phone.applyDosage(dialog, session, '<p>ok</p>');
  assert.equal(host.innerHTML, '<p>ok</p>');

  phone.setSession({ id:UUID_B });
  phone.applyDosage(dialog, session, '<p>vjetër</p>');
  assert.equal(host.innerHTML, '<p>ok</p>',
    'a dosage answer for a closed sheet must never be rendered');
}

// --- the phone detail wires the two reads together --------------------------

{
  assert.match(mobile, /const DOSAGE_API = '\/api\/dosage';/);
  assert.match(mobile, /loadDosage\(id, detailController\.signal\)/,
    'the dosage read must share the detail abort controller');
  assert.match(mobile, /data-mobile-lite-dosage/,
    'the phone record must reserve a live region for the dosage');
  assert.match(mobile, /Duke ngarkuar dozimin…/);
  assert.match(mobile, /Dozimi nuk u ngarkua\./);
  assert.match(mobile, /resolved\.name !== 'AbortError'/,
    'closing the sheet must not surface an error to the doctor');
  assert.match(mobileCss, /\.mobile-lite-dosage-line\{/,
    'the dosage lines must be styled for the phone sheet');
}

// --- the backend contract behind both surfaces ------------------------------

{
  assert.match(cardHandler, /params\.set\('editorial_status', 'eq\.published'\)/,
    'only published clinical text may reach a drug record');
  assert.match(cardHandler, /calculation_status', 'in\.\(text_verified,calculable_verified\)/,
    'only verified regimens may reach a drug record');
  assert.match(cardHandler, /chooseRegimen\(regimens, 'adult'\)/);
  assert.match(cardHandler, /chooseRegimen\(regimens, 'pediatric'\)/);
  assert.match(cardHandler, /if \(!\(await authorized\(req\)\)\)/,
    'the dosage route must stay behind the session');
  assert.match(cardHandler, /UUID_RE\.test\(drugId\)/,
    'the single-drug route must refuse anything that is not an exact drug id');
}

// --- the request itself -----------------------------------------------------

async function requestContract() {
  const calls = [];
  mobileDosage.sandbox.fetch = (url, options) => {
    calls.push({ url, options });
    return Promise.resolve({ ok:true, json:() => Promise.resolve({ ok:true, drugId:UUID_A }) });
  };

  const payload = await phone.loadDosage(UUID_A);
  assert.equal(payload.drugId, UUID_A);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^\/api\/dosage\?view=card&id=11111111-1111-4111-8111-111111111111$/,
    'the phone must address the backend by exact drug id');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers.Accept, 'application/json');

  // The backend answered about another drug: refuse it rather than show it.
  await assert.rejects(phone.loadDosage(UUID_B), /pavlefshëm/);

  mobileDosage.sandbox.fetch = () => Promise.resolve({ ok:false, status:503 });
  await assert.rejects(phone.loadDosage(UUID_A), /503/);
}

requestContract().then(() => {
  console.log('Adult/pediatric dosage binding passed: List resolves the opened drug from the dataset on screen, the phone sheet loads the same verified regimens by exact id, and unverified or mismatched payloads are refused.');
}, error => {
  console.error(error);
  process.exit(1);
});
