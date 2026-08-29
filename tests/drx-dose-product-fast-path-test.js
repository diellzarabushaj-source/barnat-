'use strict';

const assert = require('node:assert/strict');

const apiPath = require.resolve('../lib/medindex-data-api.js');
const originalApi = require(apiPath);
const requests = [];

const fixtures = {
  dose_products_v2:[{
    product_key:'p-ibu',
    drug_id:'11111111-1111-4111-8111-111111111111',
    registry_number:100,
    pdid:'pd-1',
    trade_name:'Ibuprofen Test',
    active_substance:'Ibuprofen',
    atc_code:'M01AE01',
    pharmaceutical_form:'film-coated tablet',
    route:'PO',
    patient_group:'pediatric_and_adult',
    numerator_value:400,
    numerator_unit:'mg',
    denominator_value:1,
    denominator_unit:'tablet',
    tablet_split_denominator:1,
    is_scored:false,
    measurable_increment_ml:null,
    rounding_mode:'exact',
    source_key:'src-product',
    editorial_status:'published',
    version_no:1,
  }],
  dose_rule_products_v2:[{
    rule_product_key:'bind-1',
    rule_key:'r-1',
    product_key:'p-ibu',
    preferred:true,
    conversion_enabled:false,
    tablet_split_allowed:false,
    rounding_increment_value:null,
    rounding_increment_unit:null,
    conversion_status:'manual_review',
    editorial_status:'published',
  }],
  dose_rules_v2:[{
    rule_key:'r-1',
    indication_key:'pain',
    patient_group:'adult_only',
    calculation_method:'fixed_dose',
    dose_min_value:400,
    dose_max_value:400,
    dose_unit:'mg',
    dose_basis:'per_dose',
    weight_basis:null,
    frequency_mode:'interval',
    interval_min_hours:6,
    interval_max_hours:8,
    times_per_day:null,
    max_single_dose_mg:400,
    max_daily_dose_mg:1200,
    max_doses_24h:3,
    duration_mode:'none',
    duration_min_days:null,
    duration_max_days:null,
    review_after_days:null,
    min_age_months:216,
    max_age_months:null,
    min_weight_kg:null,
    max_weight_kg:null,
    route:'PO',
    prn:true,
    renal_adjustment_required:false,
    specialist_only:false,
    out_of_range_action:'block',
    source_key:'src-rule',
    editorial_status:'published',
    verified_by:'reviewer',
    verified_at:'2026-08-29T00:00:00Z',
    clinical_notes:'',
    plain_language_template:'',
    version_no:1,
  }],
  dose_indications_v2:[{
    indication_key:'pain',
    indication_name:'Pain',
    icd_code:'R52',
    patient_group:'adult_only',
    min_age_months:216,
    max_age_months:null,
    min_weight_kg:null,
    max_weight_kg:null,
    source_key:'src-indication',
    editorial_status:'published',
  }],
  dose_sources_v2:[
    {
      source_key:'src-product',
      source_name:'Product SmPC',
      publisher:'Authority',
      source_type:'SmPC',
      source_url:'https://www.medicines.org.uk/emc/product/1/smpc',
      document_date:'2026-01-01',
      section_page:'4.2',
      official_source:true,
      editorial_status:'published',
    },
    {
      source_key:'src-rule',
      source_name:'Rule SmPC',
      publisher:'Authority',
      source_type:'SmPC',
      source_url:'https://www.medicines.org.uk/emc/product/1/smpc',
      document_date:'2026-01-01',
      section_page:'4.2',
      official_source:true,
      editorial_status:'published',
    },
    {
      source_key:'src-indication',
      source_name:'Indication SmPC',
      publisher:'Authority',
      source_type:'SmPC',
      source_url:'https://www.medicines.org.uk/emc/product/1/smpc',
      document_date:'2026-01-01',
      section_page:'4.1',
      official_source:true,
      editorial_status:'published',
    },
  ],
};

require.cache[apiPath].exports = {
  ...originalApi,
  neonRequest:async requestPath => {
    requests.push(requestPath);
    const table = requestPath.split('?')[0];
    return { data:fixtures[table] || [] };
  },
};
delete require.cache[require.resolve('../lib/dose-product-fast-path-handler.js')];
const Fast = require('../lib/dose-product-fast-path-handler.js');

(async () => {
  const payload = await Fast.buildProductPayload({ column:'product_key', value:'p-ibu' });

  assert.equal(requests.length, 5);
  assert.deepEqual(
    requests.map(item => item.split('?')[0]),
    ['dose_products_v2','dose_rule_products_v2','dose_rules_v2','dose_indications_v2','dose_sources_v2']
  );
  for (const request of requests) {
    assert.match(request, /editorial_status=eq\.published/);
    assert.doesNotMatch(request, /offset=/);
  }

  assert.equal(payload.schemaVersion, 'dose-product-fast-path-v1');
  assert.equal(payload.meta.dataSource, 'supabase');
  assert.equal(payload.meta.dbReads, 5);
  assert.equal(payload.meta.coverage, 'verified_rules_available');
  assert.equal(payload.product.productKey, 'p-ibu');
  assert.equal(payload.product.rules.length, 1);
  assert.ok(payload.product.rules[0].requiredInputs.includes('age_months'));

  assert.deepEqual(
    Fast._test.selectorFromRequest({ url:'/api/dosage?view=product-rules&registryNumber=100' }),
    { column:'registry_number', value:'100', publicKey:'100' }
  );
  assert.equal(
    Fast._test.selectorFromRequest({ url:'/api/dosage?view=product-rules&productKey=p&registryNumber=100' }),
    null
  );

  const dosageApi = require('../api/dosage.js');
  assert.equal(
    dosageApi.isProductFastPathRequest({ url:'/api/dosage?view=product-rules&productKey=p-ibu' }),
    true
  );

  console.log('DRx targeted product fast-path contract passed.');
})().finally(() => {
  require.cache[apiPath].exports = originalApi;
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
