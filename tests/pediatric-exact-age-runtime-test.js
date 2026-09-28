'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const clientPath = path.join(ROOT, 'dozologjia-master-client.js');
const auditPath = path.join(ROOT, 'data', 'pediatric-clinical-audit-v1.json');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

let source = fs.readFileSync(clientPath, 'utf8');
const marker = '})();';
const last = source.lastIndexOf(marker);
assert.ok(last > 0, 'Client IIFE terminator missing');
source = source.slice(0,last) + `
  window.__DRxExactAgeTest = {
    ageMonths,
    ageDays,
    ruleNeedsExactDays,
    ruleNeedsAge,
    exactAgeFitsRule,
    ageRangeFitsRule,
    clinicalRuleFor,
    resolvedAgeInfo,
  };
` + source.slice(last);

const context = {
  window:{
    DRxPediatricWeightAge:null,
    DRxPediatricLiquid:null,
    matchMedia:() => ({matches:false}),
  },
  document:{
    readyState:'loading',
    addEventListener:() => {},
    getElementById:() => null,
    createElement:() => ({ }),
  },
  setTimeout:() => {},
  console,
};
vm.runInNewContext(source, context, {filename:'dozologjia-master-client.js'});
const T = context.window.__DRxExactAgeTest;
assert.ok(T, 'Exact-age runtime test API was not exposed by instrumentation');

const manual = (value, unit='day') => T.resolvedAgeInfo({
  ageManual:true,
  age:String(value),
  ageUnit:unit,
  weight:'3.5',
});
const selected = (drugName, optionIndex, value, unit='day', weight=3.5) => {
  const option = audit.drugs[drugName].calculator.options[optionIndex];
  return T.clinicalRuleFor(option, weight, manual(value, unit));
};

// Conversion is exact for an explicitly entered day age.
assert.equal(T.ageDays('7','day'), 7);
assert.equal(T.ageDays('1','month'), 30.4375);
assert.equal(T.ageDays('1','year'), 365.25);
assert.equal(manual(7).exactDays, 7);
assert.equal(manual(7).label, '7 ditë');

// Cefalexin: <7 days vs 7–28 days is exact, not a 0.23-month approximation.
{
  const option=audit.drugs.Cephalexin.calculator.options[0];
  assert.equal(selected('Cephalexin',0,6).frequency,'2 herë/ditë');
  assert.equal(selected('Cephalexin',0,7).frequency,'3 herë/ditë');
  assert.equal(selected('Cephalexin',0,28).frequency,'3 herë/ditë');
  assert.equal(selected('Cephalexin',0,29),null);
  assert.equal(selected('Cephalexin',0,1,'month').frequency,'2 herë/ditë');

  const inferred={manual:false,defaultMonths:0,minMonths:0,maxMonths:0,label:'i porsalindur'};
  assert.equal(T.clinicalRuleFor(option,3.4,inferred),null,'Weight-derived newborn age may not cross a day-level boundary');
}

// Linezolid: day 7 activates q8h; <7 days stays fail-closed.
assert.equal(selected('Linezolid',0,6),null);
assert.equal(selected('Linezolid',0,7).frequency,'çdo 8 orë');
assert.equal(selected('Linezolid',0,1,'month').frequency,'çdo 8 orë');
assert.equal(selected('Linezolid',0,12,'year').frequency,'çdo 12 orë');

// WHO ampicillin young-infant boundary: first 7 completed days, then day 7–59.
assert.equal(selected('Ampicillin',0,6).frequency,'çdo 12 orë · IM/IV');
assert.equal(selected('Ampicillin',0,7).frequency,'çdo 8 orë · IM/IV');
assert.equal(selected('Ampicillin',0,59).frequency,'çdo 8 orë · IM/IV');
assert.equal(selected('Ampicillin',0,60),null);
assert.equal(selected('Ampicillin',1,2,'month').frequency,'çdo 6 orë · IM/IV');

// WHO gentamicin young-infant SBI: 5 mg/kg daily first week, 7.5 mg/kg daily thereafter to day 59.
assert.equal(selected('Gentamicin',0,6).min,5);
assert.equal(selected('Gentamicin',0,7).min,7.5);
assert.equal(selected('Gentamicin',0,59).min,7.5);
assert.equal(selected('Gentamicin',0,60),null);
assert.equal(selected('Gentamicin',1,2,'month').frequency,'çdo 8 orë · TDM');

console.log('PASS: exact neonatal day boundaries execute correctly in the real Dozologjia runtime');
