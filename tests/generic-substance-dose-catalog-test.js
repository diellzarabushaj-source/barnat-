'use strict';

const assert = require('assert');
const Generic = require('../lib/generic-substance-dose-catalog.js');

function calc(drugId, regimenId, body={}) {
  const result=Generic.calculate({drugId,regimenId,...body});
  assert(!result.error, result.error || 'unexpected error');
  return result.calculation;
}

assert.strictEqual(Generic.VERSION,'drx-generic-pediatric-dose-v1');
assert.deepStrictEqual(
  Generic.CATALOG.substances.map(item=>item.canonicalName),
  ['Amoxicillin','Amoxicillin + clavulanic acid','Ceftriaxone','Sulfamethoxazole + trimethoprim'],
);
for(const forbidden of ['Bactrim','Amoksiklav','Synopen','CO-ALMACIN']) {
  assert(!Generic.CATALOG.substances.some(item=>item.canonicalName.includes(forbidden)),`trade name leaked: ${forbidden}`);
}
for(const item of Generic.CATALOG.substances) {
  const source=Generic._test.sourceFor(item);
  assert(/^https:\/\//.test(source.url),`${item.canonicalName}: https source missing`);
  assert.strictEqual(source.section,'4.2');
}

assert(Generic.search('amoksicilin').results.some(item=>item.drugId==='GENERIC-AMOXICILLIN'));
assert(Generic.search('ceftriaxon').results.some(item=>item.drugId==='GENERIC-CEFTRIAXONE'));
assert(Generic.search('bactrim').results.some(item=>item.drugId==='GENERIC-SULFAMETHOXAZOLE-TRIMETHOPRIM'));

let r=calc('GENERIC-AMOXICILLIN','AMOX-TYPHOID',{weightKg:20,clinicalVariant:'gfr_gt_30'});
assert.strictEqual(r.outcome,'CALCULATED');
assert.strictEqual(r.daily.min,2000);
assert.strictEqual(r.daily.max,2000);
assert(Math.abs(r.perDose.min-666.6667)<1e-4);
assert.strictEqual(r.dosesPerDay,3);

r=calc('GENERIC-AMOXICILLIN','AMOX-ENDOCARDITIS-PROPHYLAXIS',{weightKg:20,clinicalVariant:'gfr_gt_30'});
assert.strictEqual(r.outcome,'CALCULATED');
assert.strictEqual(r.perDose.min,1000);
assert.strictEqual(r.daily,null);

r=calc('GENERIC-AMOXICILLIN','AMOX-TYPHOID',{weightKg:20,clinicalVariant:'gfr_10_30'});
assert.strictEqual(r.perDose.min,300);
assert.strictEqual(r.daily.min,600);
assert(r.warnings.some(x=>x.includes('15 mg/kg')));

r=calc('GENERIC-AMOXICILLIN','AMOX-TYPHOID',{weightKg:50,clinicalVariant:'gfr_gt_30'});
assert.strictEqual(r.outcome,'OUT_OF_RANGE');

r=calc('GENERIC-AMOXICILLIN-CLAVULANIC-ACID','COAMOX-7TO1-STANDARD',{
  weightKg:20,age:{value:5,unit:'vjet'},crClMlMin:90,
});
assert.strictEqual(r.outcome,'CALCULATED');
assert.deepStrictEqual(r.daily,{min:500,max:900});
assert.deepStrictEqual(r.perDose,{min:250,max:450});
assert.deepStrictEqual(r.componentBreakdown.daily,{min:72,max:128});
assert.deepStrictEqual(r.componentBreakdown.perDose,{min:36,max:64});
assert.strictEqual(r.doseUnit,'mg amoxicillin');

r=calc('GENERIC-AMOXICILLIN-CLAVULANIC-ACID','COAMOX-7TO1-STANDARD',{
  weightKg:20,age:{value:5,unit:'vjet'},crClMlMin:20,
});
assert.strictEqual(r.outcome,'NOT_CALCULABLE');

r=calc('GENERIC-AMOXICILLIN-CLAVULANIC-ACID','COAMOX-7TO1-STANDARD',{
  weightKg:5,age:{value:1,unit:'muaj'},crClMlMin:90,
});
assert.strictEqual(r.outcome,'OUT_OF_RANGE');

r=calc('GENERIC-AMOXICILLIN-CLAVULANIC-ACID','COAMOX-7TO1-UPPER-SELECTED',{
  weightKg:10,age:{value:18,unit:'muaj'},crClMlMin:90,
});
assert.strictEqual(r.outcome,'OUT_OF_RANGE');

r=calc('GENERIC-CEFTRIAXONE','CEFTRIAXONE-GENERAL',{
  weightKg:20,age:{value:5,unit:'vjet'},clinicalVariant:'standard_context',
});
assert.strictEqual(r.outcome,'CALCULATED');
assert.deepStrictEqual(r.perDose,{min:1000,max:1600});
assert.deepStrictEqual(r.daily,{min:1000,max:1600});

r=calc('GENERIC-CEFTRIAXONE','CEFTRIAXONE-MENINGITIS',{
  weightKg:30,age:{value:5,unit:'vjet'},clinicalVariant:'crcl_lt10_hepatic_not_impaired',
});
assert.strictEqual(r.outcome,'CALCULATED');
assert.deepStrictEqual(r.daily,{min:2000,max:2000});
assert.deepStrictEqual(r.perDose,{min:2000,max:2000});
assert(r.cappedBy.some(x=>x.includes('max_daily_dose_mg')));

r=calc('GENERIC-CEFTRIAXONE','CEFTRIAXONE-MENINGITIS',{
  weightKg:4,age:{value:10,unit:'ditë'},clinicalVariant:'standard_context',
});
assert.strictEqual(r.outcome,'OUT_OF_RANGE');

r=calc('GENERIC-CEFTRIAXONE','CEFTRIAXONE-GENERAL',{
  weightKg:20,age:{value:5,unit:'vjet'},clinicalVariant:'severe_renal_and_hepatic',
});
assert.strictEqual(r.outcome,'NOT_CALCULABLE');

r=calc('GENERIC-SULFAMETHOXAZOLE-TRIMETHOPRIM','COTRIMOX-STANDARD',{
  weightKg:20,age:{value:5,unit:'vjet'},clinicalVariant:'normal_renal_no_hepatic_impairment',
});
assert.strictEqual(r.outcome,'CALCULATED');
assert.deepStrictEqual(r.daily,{min:120,max:120});
assert.deepStrictEqual(r.perDose,{min:60,max:60});
assert.deepStrictEqual(r.componentBreakdown.daily,{min:600,max:600});
assert.deepStrictEqual(r.componentBreakdown.perDose,{min:300,max:300});
assert.strictEqual(r.doseUnit,'mg TMP');

r=calc('GENERIC-SULFAMETHOXAZOLE-TRIMETHOPRIM','COTRIMOX-STANDARD',{
  weightKg:4,age:{value:4,unit:'javë'},clinicalVariant:'normal_renal_no_hepatic_impairment',
});
assert.strictEqual(r.outcome,'OUT_OF_RANGE');

r=calc('GENERIC-SULFAMETHOXAZOLE-TRIMETHOPRIM','COTRIMOX-STANDARD',{
  weightKg:20,age:{value:5,unit:'vjet'},clinicalVariant:'renal_failure_or_hepatic_impairment',
});
assert.strictEqual(r.outcome,'NOT_CALCULABLE');

const injected=Generic.calculate({
  drugId:'GENERIC-AMOXICILLIN',regimenId:'AMOX-TYPHOID',weightKg:20,
  clinicalVariant:'gfr_gt_30',doseMinValue:999,
});
assert.strictEqual(injected.status,400);

const cefProduct=Generic.buildProduct('GENERIC-CEFTRIAXONE');
assert.strictEqual(cefProduct.name,'Ceftriaxone');
assert.strictEqual(cefProduct.form,'Substancë aktive');
assert(cefProduct.calculationOptions.length>=8);
assert(cefProduct.warnings.some(x=>x.includes('Neonatët')));

console.log('generic-substance-dose-catalog-test: OK');
