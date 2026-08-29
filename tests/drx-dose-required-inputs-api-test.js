'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Handler = require('../lib/dose-calculator-handler.js');

const source = {
  source_key:'official',
  source_name:'Official SmPC',
  publisher:'Authority',
  source_type:'SmPC',
  source_url:'https://www.medicines.org.uk/emc/product/1/smpc',
  document_date:'2026-01-01',
  section_page:'4.2',
};

const indication = {
  indication_key:'fever',
  indication_name:'Fever',
  icd_code:'',
  min_age_months:6,
  max_age_months:144,
};

const link = {
  preferred:true,
  conversion_enabled:true,
  tablet_split_allowed:false,
  rounding_increment_value:null,
  rounding_increment_unit:'',
  conversion_status:'verified',
};

const perKg = Handler._test.rulePublic({
  rule_key:'ped-fever',
  indication_key:'fever',
  patient_group:'pediatric_only',
  calculation_method:'dose_per_kg_per_dose',
  dose_min_value:5,
  dose_max_value:10,
  dose_unit:'mg/kg',
  dose_basis:'per_dose',
  frequency_mode:'interval',
  interval_min_hours:6,
  min_age_months:6,
  max_age_months:144,
  route:'PO',
  renal_adjustment_required:false,
  specialist_only:false,
  editorial_status:'published',
  verified_by:'reviewer',
  verified_at:'2026-01-01T00:00:00Z',
}, indication, source, link);

assert.ok(perKg.requiredInputs.includes('weight_kg'));
assert.ok(perKg.requiredInputs.includes('age_months'));

const bsa = Handler._test.rulePublic({
  rule_key:'bsa',
  indication_key:'fever',
  patient_group:'pediatric_only',
  calculation_method:'dose_per_m2_per_dose',
  dose_min_value:10,
  dose_unit:'mg/m2',
  frequency_mode:'single',
  route:'IV',
  editorial_status:'published',
  verified_by:'reviewer',
  verified_at:'2026-01-01T00:00:00Z',
}, indication, source, link);
assert.ok(bsa.requiredInputs.includes('weight_kg'));
assert.ok(bsa.requiredInputs.includes('height_cm'));

const renal = Handler._test.rulePublic({
  rule_key:'renal',
  indication_key:'fever',
  patient_group:'adult_only',
  calculation_method:'fixed_dose',
  dose_min_value:100,
  dose_unit:'mg',
  frequency_mode:'single',
  route:'PO',
  renal_adjustment_required:true,
  editorial_status:'published',
  verified_by:'reviewer',
  verified_at:'2026-01-01T00:00:00Z',
}, indication, source, link);
assert.ok(renal.requiredInputs.includes('renal_function'));

const root = path.resolve(__dirname, '..');
const calculatorSource = fs.readFileSync(path.join(root, 'lib', 'dose-calculator-handler.js'), 'utf8');
const safetySource = fs.readFileSync(path.join(root, 'lib', 'dose-safety-handler.js'), 'utf8');
assert.match(calculatorSource, /dataSource:'supabase'/);
assert.match(safetySource, /dataSource:'supabase'/);
assert.doesNotMatch(calculatorSource, /dataSource:'neon'/);
assert.doesNotMatch(safetySource, /dataSource:'neon'/);

console.log('DRx dynamic required-input API contract passed.');
