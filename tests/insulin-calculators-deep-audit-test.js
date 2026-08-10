'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = file => {
  const source = read(file);
  assert.doesNotThrow(() => new Function(source), `${file} must parse as JavaScript`);
  return source;
};

const index = read('index.html');
const novoRapid = compile('registry-novorapid-simple-calculator.js');
const novoMix = compile('registry-novomix30-simple-calculator.js');
const others = compile('registry-other-insulins-simple-calculator.js');
const finalSafety = compile('registry-insulin-final-safety.js');
const bridge = compile('registry-insulin-row-bridge.js');

// Only the audited simple stack should be active on the registry page.
for (const asset of [
  'registry-novorapid-simple-calculator.js',
  'registry-novomix30-simple-calculator.js',
  'registry-other-insulins-simple-calculator.js',
  'registry-insulin-final-safety.js',
  'registry-insulin-row-bridge.js'
]) assert(index.includes(asset), `index must load ${asset}`);
for (const legacy of [
  'registry-insulin-smart-calculator.js',
  'registry-insulin-pediatric-guards.js',
  'registry-insulin-language-polish.js'
]) assert(!index.includes(`<script src="${legacy}`), `index must not load legacy ${legacy}`);
assert(!index.includes('registry-insulin-smart-calculator.css'), 'legacy Smart Insulin CSS must not remain loaded');
assert(index.indexOf('registry-other-insulins-simple-calculator.js') < index.indexOf('registry-insulin-final-safety.js'), 'final insulin guard must load after calculators');
assert(index.indexOf('registry-insulin-final-safety.js') < index.indexOf('registry-insulin-row-bridge.js'), 'final insulin guard must be active before row bridge interactions');

// Registry bridge coverage: all insulin products currently in this registry group.
for (const id of ['2508','2509','2510','2511','2512','2965','3730']) {
  assert(bridge.includes(`registryNumber: '${id}'`), `row bridge missing registry ${id}`);
}
for (const ageLabel of ['≥1 vjeç','≥10 vjeç','≥2 vjeç','≥6 vjeç']) {
  assert(bridge.includes(ageLabel), `row bridge missing pediatric label ${ageLabel}`);
}

// NovoRapid: age is native, IOB is explicit, pediatrics do not derive ICR/ISF from TDD.
assert(novoRapid.includes('data-novorapid-age'), 'NovoRapid must have native age input');
assert(novoRapid.includes('if (age < 1)'), 'NovoRapid must block under age 1');
assert(novoRapid.includes('IOB është i detyrueshëm'), 'NovoRapid must make IOB explicit');
assert(!/data-novorapid-iob[^>]*value=["']0/.test(novoRapid), 'NovoRapid must not silently default IOB to 0');
assert(novoRapid.includes('if (age < 18)'), 'NovoRapid must protect pediatric factor derivation');
assert(novoRapid.includes('500 / tdd') && novoRapid.includes('100 / tdd'), 'NovoRapid adult TDD estimates must be explicit');
assert(novoRapid.includes('rounded > 60'), 'NovoRapid FlexPen must enforce 60 U single-injection limit');
assert(novoRapid.includes('protocol.ageGroup !== ageGroup(age)'), 'NovoRapid must prevent cross-age-group protocol reuse');

// NovoMix30: native age >=10, exact SmPC titration, weekly guard and hypo no-increase guard.
assert(novoMix.includes('data-nm-age'), 'NovoMix30 must have native age input');
assert(novoMix.includes('if (a < 10)'), 'NovoMix30 must block age <10');
assert(novoMix.includes('data-nm-week-ok'), 'NovoMix30 must require weekly titration interval confirmation');
assert(novoMix.includes('if (mmol < 4.4) return -2'), 'NovoMix30 low glucose titration mismatch');
assert(novoMix.includes('if (mmol <= 6.1) return 0'), 'NovoMix30 target titration mismatch');
assert(novoMix.includes('if (mmol <= 7.8) return 2'), 'NovoMix30 +2 titration mismatch');
assert(novoMix.includes('if (mmol <= 10) return 4'), 'NovoMix30 +4 titration mismatch');
assert(novoMix.includes('return 6'), 'NovoMix30 +6 titration mismatch');
assert(novoMix.includes('if (hypo && adjustment > 0) adjustment = 0'), 'NovoMix30 must not increase after recent hypoglycaemia');

// Remaining products: EU-first formulas and fail-closed behavior where SmPC does not give a universal start dose.
for (const term of ['ryzodeg','levemir','tresiba','apidra','semglee']) assert(others.includes(`key: '${term}'`), `missing ${term}`);
assert(others.includes('https://www.medicines.org.uk/emc/product/100785/smpc'), 'Semglee must use EU/UK SmPC source');
assert(!others.includes('dailymed.nlm.nih.gov'), 'Deep-audited stack must not mix US DailyMed Semglee dosing into EU-first workflow');
assert(!others.includes('0.2 U/kg ='), 'Semglee must not expose removed US fixed-start formula');
assert(!others.includes('tdd / 3'), 'Tresiba/Semglee must not invent one-third TDD product dosing');
assert(others.includes('current * 0.70') && others.includes('current * 0.80'), 'Semglee NPH BID switch must preserve 20–30% reduction range');
assert(others.includes("type === 'once' ? 1 : 0.8"), 'Tresiba adult T2 switch must distinguish unit-to-unit vs 20% reduction');
assert(others.includes('current * 0.8'), 'Tresiba T1 and glargine U300 switch reductions must be represented');
assert(others.includes('Pediatrik · Ryzodeg') || others.includes("pediatricManual('Ryzodeg'"), 'Ryzodeg pediatric workflow must fail closed where fixed adult T2 start is not applied');
assert(others.includes('data-api-confirm'), 'Apidra protocol requires clinical confirmation');
assert(!/data-api-iob[^>]*value=["']0/.test(others), 'Apidra must not silently default IOB to 0');
assert(others.includes('pr.ageGroup !== ageGroup(a)'), 'Apidra must prevent cross-age-group protocol reuse');
assert(others.includes('rounded > 80'), 'Apidra SoloStar must enforce 80 U single-injection limit');
assert(others.includes('dose > 80'), 'Semglee pen must enforce 80 U single-injection limit');

// Final fail-closed guard: never silently round pediatric rapid-insulin doses or incompatible pen doses.
assert(finalSafety.includes('guardNovoRapidPediatricPrecision'), 'NovoRapid pediatric precision guard missing');
assert(finalSafety.includes('guardApidraPediatricPrecision'), 'Apidra pediatric precision guard missing');
assert(finalSafety.includes('protocol?.ageGroup !== \'pediatric\''), 'pediatric rapid-insulin guard must require pediatric protocol');
assert(finalSafety.includes('kalkulatori nuk e rrumbullakos automatikisht'), 'pediatric dose rounding must fail closed');
assert(finalSafety.includes("product:'levemir flexpen'"), 'Levemir whole-unit pen guard missing');
assert(finalSafety.includes("product:'semglee'"), 'Semglee whole-unit pen guard missing');
assert(finalSafety.includes("option.value = 'premix'"), 'Tresiba premix must have a separate switch choice');
assert(finalSafety.includes("value === 'premix'"), 'Tresiba premix switch must be intercepted');
assert(finalSafety.includes('jo te i gjithë totali i premix-it'), 'Tresiba must not use whole premix total as prior basal dose');
assert(finalSafety.includes('Verifiko prezantimin e Tresiba'), 'Tresiba planned fractional dose must not be silently rounded');

console.log('Insulin calculators deep audit + final fail-closed guard: OK');
