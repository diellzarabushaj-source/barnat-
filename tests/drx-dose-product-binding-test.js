'use strict';

const assert = require('node:assert/strict');
const Binding = require('../lib/dose-product-binding.js');
const Combo = require('../lib/dose-combination-basis.js');

const ibuprofen = {
  productKey:'p-ibu',
  route:'PO',
  pharmaceuticalForm:'film-coated tablet',
  patientGroup:'pediatric_and_adult',
  ingredients:[{ conceptId:'c-ibu', canonicalKey:'ibuprofen', canonicalName:'Ibuprofen' }],
};

const rule = {
  ruleKey:'r-ibu',
  substanceConceptId:'c-ibu',
  route:'PO',
  pharmaceuticalForm:'film-coated tablet',
  patientGroup:'adult_only',
};

const bound = Binding.bindRuleToProduct(rule, ibuprofen);
assert.equal(bound.valid, true);
assert.equal(bound.matchMethod, 'concept_id_exact');
assert.equal(bound.combination, false);

const wrongRoute = Binding.bindRuleToProduct({ ...rule, route:'IV' }, ibuprofen);
assert.ok(wrongRoute.errors.includes('route_mismatch'));

const comboProduct = {
  productKey:'combo',
  route:'PO',
  patientGroup:'pediatric_and_adult',
  ingredients:[
    { conceptId:'amox', canonicalKey:'amoxicillin' },
    { conceptId:'clav', canonicalKey:'clavulanicacid' },
  ],
};

const ambiguous = Binding.bindRuleToProduct({
  ruleKey:'combo-rule',
  substanceConceptId:'amox',
  route:'PO',
  patientGroup:'adult_only',
}, comboProduct);
assert.ok(ambiguous.errors.includes('combination_dose_basis_missing'));

const explicit = Binding.bindRuleToProduct({
  ruleKey:'combo-rule',
  substanceConceptId:'amox',
  route:'PO',
  patientGroup:'adult_only',
  doseBasisComponentConceptId:'amox',
}, comboProduct);
assert.equal(explicit.valid, true);

assert.equal(
  Combo.resolveDoseBasis(comboProduct, {
    doseBasisMode:'component',
    doseBasisComponentConceptId:'amox',
    doseBasisExplicitInSource:false,
  }).valid,
  false
);
assert.equal(
  Combo.resolveDoseBasis(comboProduct, {
    doseBasisMode:'component',
    doseBasisComponentConceptId:'amox',
    doseBasisExplicitInSource:true,
  }).valid,
  true
);
assert.equal(
  Combo.resolveDoseBasis(comboProduct, {
    doseBasisMode:'combined_total',
    doseBasisExplicitInSource:false,
  }).valid,
  false
);
assert.equal(
  Combo.resolveDoseBasis(comboProduct, {
    doseBasisMode:'combined_total',
    doseBasisExplicitInSource:true,
  }).valid,
  true
);

console.log('DRx product binding and combination-dose-basis contract passed.');
