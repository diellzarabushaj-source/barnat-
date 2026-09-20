'use strict';
/*
 * Dozologjia speaks Albanian, and turns mg into something measurable.
 *
 * Two properties are worth pinning. First, the page has no English audience:
 * every string Master publishes must have an Albanian rendering, and the
 * engine must refuse to load rather than leak one. Second, the formulation
 * shelf must stay honest — templates are what the market usually carries, not
 * a verified label, and the volume they produce is arithmetic on a strength
 * the clinician is responsible for.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const engine = require('../lib/dozologjia-master');
const sq = require('../lib/dozologjia-sq');
const shelf = require('../lib/dozologjia-products');
const client = fs.readFileSync(path.join(ROOT, 'dozologjia-master-client.js'), 'utf8');
const catalog = engine.catalog();

/* ------------------------------------------------------------ 1 · Albanian */
assert.equal(catalog.regimens.length, 43);

/* The stored English must not survive into anything the catalog publishes. */
const ENGLISH = [
  'Cardiac arrest', 'Anaphylaxis', 'Fever / mild-moderate pain', 'Acute otitis media',
  'Nausea/vomiting', 'PONV prevention/treatment', 'IV fluid resuscitation', 'Cystitis',
  'Renal context must be checked before adjustment/output.', 'Hepatic context applies.',
  'QT-risk review/monitoring applies.', 'Exact product/formulation must be selected.',
  'Adult', 'Pediatric', 'Pediatric <40 kg', 'Adult/≥40 kg',
  'Solution for injection', 'Eye ointment', 'Prefilled syringe', 'Film-coated tablet',
  'q8h', 'q4–6h PRN', 'BID', 'TID', 'Single dose', 'Short course', 'Indication-dependent',
  'Initial bolus', 'After 3 shocks', 'cm_ribbon', 'application',
];
for (const row of catalog.regimens) {
  const shown = [row.indication, row.population, row.routeLabel, row.routeText, row.frequency,
    row.duration, row.safety, row.unitLabel, ...row.gates.map(gate => gate.text),
    ...row.steps.map(step => step.label), ...row.products.map(product => product.form)].filter(Boolean);
  for (const text of shown) {
    assert.ok(!ENGLISH.includes(text), `${row.id} still shows the stored English: ${JSON.stringify(text)}`);
    assert.ok(text.trim(), `${row.id} published an empty label`);
  }
  assert.ok(row.indication && row.population && row.routeLabel, `${row.id} is missing a rendered label`);
  /* Identifiers are for the wire, never for the clinician. */
  assert.doesNotMatch(shown.join(' '), /R2-\d{4}|F2-\d{4}|IND\d{3}|\bG\d{4}\b|SRC-/, `${row.id} leaks an internal identifier`);
}

/* Gate text reads as something a clinician can confirm, not as a rule dump. */
const gateTexts = new Set(catalog.regimens.flatMap(row => row.gates.map(gate => gate.text)));
assert.ok(gateTexts.size >= 4);
gateTexts.forEach(text => assert.match(text, /\.$/, `A confirmation must read as a sentence: ${text}`));

/* Fail-closed: a published string with no rendering stops the module. */
const missingTranslation = () => {
  const kept = sq.INDICATIONS.IND001;
  delete sq.INDICATIONS.IND001;
  try {
    delete require.cache[require.resolve('../lib/dozologjia-master')];
    require('../lib/dozologjia-master');
    return null;
  } catch (error) {
    return error;
  } finally {
    sq.INDICATIONS.IND001 = kept;
    delete require.cache[require.resolve('../lib/dozologjia-master')];
    require('../lib/dozologjia-master');
  }
};
const refusal = missingTranslation();
assert.ok(refusal, 'A missing Albanian rendering must stop the engine, not reach the page');
assert.match(String(refusal.message), /Missing Albanian indication/);

/* Errors the clinician reads are Albanian too, including the bounds. */
const cefuroxime = catalog.regimens.find(row => row.drugId === 'D037');
const overweight = engine.calculate({ regimenId:cefuroxime.id, drugId:cefuroxime.drugId,
  indicationId:cefuroxime.indicationId, scope:true, weight:70, age:8, ageUnit:'year', given24h:0,
  gates:Object.fromEntries(cefuroxime.gates.map(gate => [gate.id, 'PASS'])) });
assert.equal(overweight.outcome, 'BLOCKED');
assert.deepEqual(overweight.errors, ['Pesha duhet të jetë nën 40 kg.']);

/* ------------------------------------------------------------- 2 · the shelf */
const templates = Object.entries(shelf.TEMPLATES);
assert.ok(templates.length >= 10, 'Every drug the source leaves unbound needs a shelf to measure from');
const ids = new Set();
for (const [drugId, items] of templates) {
  assert.ok(catalog.regimens.some(row => row.drugId === drugId), `${drugId} is not a published drug`);
  assert.ok(items.length, `${drugId} has an empty shelf`);
  for (const item of items) {
    assert.ok(!ids.has(item.id), `Duplicate template id ${item.id}`);
    ids.add(item.id);
    assert.equal(item.marketTypical, true, `${item.id} must be flagged as a market strength, not a label`);
    assert.ok(!('sourceUrl' in item) && !('source' in item), `${item.id} must not claim a source`);
    assert.ok(item.mg > 0, `${item.id} needs a strength`);
    if (item.kind === 'liquid') assert.ok(item.mL > 0, `${item.id} needs a volume`);
    else { assert.equal(item.kind, 'solid'); assert.ok(item.form, `${item.id} needs a dosage form`); }
    assert.match(item.label, /^[\d,]+ mg( \/ [\d,]+ mL)?$/, `${item.id} label reads oddly: ${item.label}`);
  }
}
/* A drug whose dose lands in mg with no bound product is the whole reason the
   shelf exists, so those drugs must actually have one. */
const unbound = catalog.regimens.filter(row => !row.products.length && ['mg', 'mcg', 'g'].includes(row.unit));
const unstocked = [...new Set(unbound.map(row => row.drugId))].filter(id => !shelf.TEMPLATES[id]);
assert.deepEqual(unstocked, [], `These drugs give mg with nothing to measure it from: ${unstocked}`);

/* The page never presents a market strength as if it were audited. */
assert.match(client, /Fuqi tipike e tregut, pa etiketë të verifikuar/);
assert.match(client, /produkt i lidhur në Master/);

/* -------------------------------------------------- 3 · the default strength */
/* Re-derive the shipped rule rather than a copy of it. */
const sandbox = {};
new Function('exports', `
  ${client.match(/const MEASURABLE_ML = [\d.]+;/)[0]}
  const positive = value => Number.isFinite(value) && value > 0;
  ${client.match(/function mgPerML\(item\) \{[\s\S]*?\n  \}/)[0]}
  ${client.match(/function preferred\(items, mg\) \{[\s\S]*?\n  \}/)[0]}
  exports.preferred = preferred;
`)(sandbox);
const { preferred } = sandbox;

const paracetamol = shelf.TEMPLATES.D016;
assert.equal(preferred(paracetamol, 500).id, 'paracetamol-tab-500', 'A dose that is exactly one tablet is a tablet');
assert.equal(preferred(paracetamol, 210).kind, 'liquid', 'A dose that does not land on a tablet is measured');
assert.equal(preferred(paracetamol, 210).id, 'paracetamol-250-5', 'Take the smallest volume a syringe can still read');
const amoxicillin = shelf.TEMPLATES.D031;
assert.equal(preferred(amoxicillin, 500).id, 'amoxicillin-cap-500', 'One capsule beats ten millilitres');
assert.equal(preferred(amoxicillin, 875).kind, 'liquid', '3½ capsules is not a prescription');
/* Nothing measurable: take the largest volume rather than an unreadable one. */
const tiny = [{ id:'a', kind:'liquid', mg:100, mL:1 }, { id:'b', kind:'liquid', mg:500, mL:1 }];
assert.equal(preferred(tiny, 20).id, 'a');
assert.equal(preferred([], 100), null);

/* ------------------------------------------------------- 4 · the wire stays shut */
/* The clinician's own strength is arithmetic in the page; it must never be
   posted as if the server could be told a concentration. */
const body = client.match(/function payload\(\) \{[\s\S]*?\n  \}/)[0];
const posted = [...body.matchAll(/input\.([A-Za-z0-9]+) =/g)].map(match => match[1])
  .concat([...body.matchAll(/\{ ([^}]*?) \}/g)].flatMap(match => [...match[1].matchAll(/([A-Za-z0-9]+):/g)].map(k => k[1])));
const allowed = ['regimenId', 'drugId', 'indicationId', 'age', 'ageUnit', 'weight', 'scope', 'gates', 'productId', 'stepId', 'given24h', 'givenTotal'];
posted.forEach(key => assert.ok(allowed.includes(key), `The page must not send ${key} to the calculator`));
assert.ok(!/customStrength|mgPerMl:|concentration/i.test(client.replace(/mgPerML/g, '')), 'No strength may travel to the server');
assert.equal(engine.calculate({ regimenId:'R2-0022', drugId:'D016', indicationId:'IND018', scope:true, mgPerMl:25 }).outcome, 'BLOCKED');

console.log('PASS: Albanian rendering is complete and fail-closed, the shelf is honest, and the default strength is the practical one');

/* --------------------------------------------------- 5 · the page on a phone */
const html = fs.readFileSync(path.join(ROOT, 'dozologjia.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'dozologjia-v2.css'), 'utf8');
/* The page's own phone block is the last one in the file; earlier ones belong
   to the shared shell. */
const phone = css.slice(css.lastIndexOf('@media(max-width:760px)'));

/* Three choices, one patient block, one answer — nothing else on the page. */
['drugPicker', 'indicationPicker', 'regimenPicker'].forEach(id =>
  assert.match(html, new RegExp(`class="dz-picker" id="${id}"`), `${id} must be a foldable picker`));
assert.match(client, /const compact = window\.matchMedia\('\(max-width:760px\)'\)/);
assert.match(client, /function fold\(id\) \{\n\s*const picker = \$\(id\);\n\s*if \(picker && compact\.matches\) picker\.open = false;/,
  'A picker folds after a choice only when the screen is small');
/* A folded picker has to say what it is holding. */
assert.match(phone, /\.dz-picker-current\s*\{[\s\S]*?display\s*:\s*block\s*;/);
assert.match(css, /\.dz-picker-current\{display:none\}/);
/* ...and on a wide screen it cannot be clicked shut at all. */
assert.match(client, /if \(!compact\.matches && !picker\.open\) picker\.open = true;/);

/* Anything a finger has to hit is at least 44px on a phone. */
const size = (block, selector, property) => {
  const rule = block.match(new RegExp(`\\${selector}\\{[^}]*`));
  assert.ok(rule, `${selector} has no rule`);
  const found = rule[0].match(new RegExp(`${property}:(\\d+)px`));
  return found ? Number(found[1]) : 0;
};
assert.ok(size(css, '.dz-check', 'min-height') >= 44, 'A confirmation row must be tappable');
assert.ok(size(css, '.dz-none', 'height') >= 44, 'The "Asgjë" shortcut must be tappable');
assert.ok(size(css, '.dz-copy', 'min-height') >= 44, 'The copy button must be tappable');
assert.ok(size(phone, '.dz-picker>summary', 'min-height') >= 44, 'A folded picker row must be tappable');
assert.ok(size(css, '.dz-chip', 'min-height') >= 36, 'A chip must be comfortably tappable');

/* The answer is one number, not a stack of paragraphs. */
assert.equal((client.match(/'dz-dose'/g) || []).length, 1, 'There is exactly one headline dose');
assert.ok(size(css, '.dz-dose', 'font-size') >= 32, 'The dose must be readable at arm’s length');
assert.match(client, /'Kopjo përmbledhjen'/, 'The finished line must be copyable');

/* Plain words, not source shorthand, and no value asked for twice. */
['Bari', 'Indikacioni', 'Skema dhe mënyra e dhënies', 'Pesha', 'Mosha', 'Sasia për të matur']
  .forEach(word => assert.ok(html.includes(word) || client.includes(word), `The page must say "${word}"`));
assert.equal((client.match(/numberInput\('masterWeight'/g) || []).length, 1, 'Weight is entered once and reused');
assert.doesNotMatch(client, /Llogarit dozën/, 'The answer arrives on its own, without a submit step');

console.log('PASS: the page folds, reads and taps like the antibiotics one');

/* ------------------------------------------- 6 · the weight fills the age in */
/* Re-derive the shipped rule, not a copy of it. */
const ages = {};
new Function('exports', `
  const positive = value => Number.isFinite(value) && value > 0;
  ${client.match(/const REFERENCE_AGES = \[[\s\S]*?\n  \];/)[0]}
  ${client.match(/const HEAVIEST_BAND_KG = \d+;/)[0]}
  ${client.match(/function ageForWeight\(kg\) \{[\s\S]*?\n  \}/)[0]}
  exports.ageForWeight = ageForWeight;
`)(ages);
const { ageForWeight } = ages;

assert.deepEqual(ageForWeight(20), { value:6, unit:'year' }, '20 kg is the six-year band');
assert.deepEqual(ageForWeight(9), { value:1, unit:'year' }, '12 months reads as one year');
assert.deepEqual(ageForWeight(7), { value:6, unit:'month' }, 'under a year the answer is in months');
/* A weight between two bands takes the younger one — the same tie-break the
   antibiotics page uses, and the safer one against a minimum-age gate. */
assert.deepEqual(ageForWeight(14), { value:2, unit:'year' });
/* Neither end of the table is guessable: a neonate's age turns on days, and an
   adult's cannot be read off a weight at all. */
assert.equal(ageForWeight(3.4), null);
assert.equal(ageForWeight(70), null);
assert.equal(ageForWeight(0), null);
assert.equal(ageForWeight(NaN), null);
/* The estimate never silently becomes the clinician's own answer. */
assert.match(client, /state\.ageSource = 'chosen'/);
assert.match(client, /if \(!age \|\| state\.ageSource === 'chosen'\) return;/,
  'An age the clinician typed is never overwritten by a weight');
assert.match(client, /Plotësuar nga pesha/);
assert.match(css, /\.dz-field\[data-source="weight"\]/, 'A derived age must look different from a typed one');
/* Weight is asked first, because it is the number that fills the other in. */
assert.ok(client.indexOf("numberInput('masterWeight'") < client.indexOf("numberInput('masterAge'"),
  'The weight field must come before the age field');

console.log('PASS: the weight fills the age in, and never overwrites one the clinician typed');
