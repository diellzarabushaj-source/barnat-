'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const Pediatric=require('../lib/pediatric-dosage-handler.js');
const V3=require('../lib/pediatric-v3-runtime.js');
const Cutover=require('../lib/dose-v3-cutover-control.js');

const PARACETAMOL='84a1cf4a-6568-41d7-8d13-0f2b7715acae';
const COALMACIN='c8cd0467-da73-479c-b8e8-b785af833f59';

async function main(){
  const state=await Cutover.getState({force:true});
  assert.equal(state.stateAvailable,true);
  assert.equal(state.stateVersion,'drx-phase10-cutover-state-v2');
  assert.equal(state.trafficBucketVersion,2);
  assert.ok(['SHADOW','CONTROLLED'].includes(state.mode));

  if(state.mode==='SHADOW'){
    assert.equal(state.controlledPercent,0);
    const evidence={
      evidenceVersion:'drx-phase10-pediatric-v3-live-v2',
      generatedAt:new Date().toISOString(),
      applicable:false,
      reason:'V3_PUBLICATION_NOT_ACTIVE',
      cutover:{
        stateVersion:state.stateVersion,
        mode:state.mode,
        controlledPercent:state.controlledPercent,
        controlVersion:state.controlVersion,
        trafficBucketVersion:state.trafficBucketVersion,
      },
      pass:true,
    };
    fs.writeFileSync('drx-phase10-pediatric-v3-live-evidence.json',JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
    return;
  }

  const decision=Cutover.decision(state,{column:'drug_id',value:PARACETAMOL});
  assert.equal(decision.trafficBucket,2,'stable Phase 10G cohort changed for the Paracetamol canary');
  if(state.mode==='CONTROLLED' && state.controlledPercent>=5){
    assert.equal(decision.selectedForV3,true,'Paracetamol canary must be in the live V3 cohort at >=5%');
  }

  const productOutcome=await Pediatric.loadProduct(PARACETAMOL);
  assert.equal(productOutcome.error,undefined);
  const product=productOutcome.product;
  if(decision.selectedForV3){
    assert.equal(product.runtime,'v3');
    assert.equal(product.phase9Context?.v3Published,true);
    assert.equal(product.calculationOptions?.length,1,
      'two age bands of the same Paracetamol indication must render as one indication');
    assert.equal(product.calculationOptions[0].ruleCount,2);
  }

  const v3Product=await V3.buildProduct(PARACETAMOL);
  assert.ok(v3Product);
  assert.equal(v3Product.runtime,'v3');
  assert.equal(v3Product.calculationOptions.length,1);
  assert.equal(v3Product.calculationOptions[0].ruleCount,2);
  assert.match(v3Product.source.url,/^https:\/\//);

  const regimenId=v3Product.calculationOptions[0].selectionId;

  const age12=await V3.calculate({
    drugId:PARACETAMOL,
    regimenId,
    age:{value:12,unit:'vjet'},
  });
  assert.equal(age12.error,undefined);
  assert.equal(age12.calculation.outcome,'CALCULATED');
  assert.deepEqual(age12.calculation.perDose,{min:500,max:500});
  assert.equal(age12.calculation.measure?.min?.amount,1);
  assert.equal(age12.calculation.measure?.min?.unit,'tablet');

  const age16=await V3.calculate({
    drugId:PARACETAMOL,
    regimenId,
    age:{value:16,unit:'vjet'},
  });
  assert.equal(age16.error,undefined);
  assert.equal(age16.calculation.outcome,'CALCULATED');
  assert.deepEqual(age16.calculation.perDose,{min:500,max:1000});
  assert.equal(age16.calculation.measure?.min?.amount,1);
  assert.equal(age16.calculation.measure?.max?.amount,2);

  const age9=await V3.calculate({
    drugId:PARACETAMOL,
    regimenId,
    age:{value:9,unit:'vjet'},
  });
  assert.equal(age9.calculation.outcome,'OUT_OF_RANGE');

  if(decision.selectedForV3){
    const routed=await Pediatric.calculateDose({
      drugId:PARACETAMOL,
      regimenId,
      age:{value:12,unit:'vjet'},
    });
    assert.equal(routed.error,undefined);
    assert.equal(routed.calculation.runtime,'v3');
    assert.equal(routed.calculation.outcome,'CALCULATED');
    assert.deepEqual(routed.calculation.perDose,{min:500,max:500});
  }

  const co=await V3.buildProduct(COALMACIN);
  assert.ok(co);
  assert.equal(co.calculationOptions.length,2);
  for(const option of co.calculationOptions){
    assert.equal(option.requires.weight,true);
    assert.equal(option.requires.age,true);
    assert.ok(option.requires.advancedInputs.includes('CrCl_mL_min'));
    assert.ok(option.requires.advancedInputs.includes('hepatic_impairment_textual'));
  }

  const coLower=co.calculationOptions.find(option=>/lower-dose/i.test(option.indication))
    || co.calculationOptions[0];
  const coSafety=await V3.calculate({
    drugId:COALMACIN,
    regimenId:coLower.selectionId,
    age:{value:5,unit:'vjet'},
    weightKg:20,
    crClMlMin:80,
    hepaticImpairment:'hepatic impairment',
  });
  assert.equal(coSafety.error,undefined);
  assert.equal(coSafety.calculation.outcome,'NOT_CALCULABLE',
    'specialist-review hepatic adjustment must remain fail-closed');
  assert.ok((coSafety.calculation.reasons || []).includes('specialist_review'),
    'verified hepatic specialist_review must be the explicit blocking reason');
  assert.ok(!(coSafety.calculation.reasons || []).includes('invalid_adjustment_rows'),
    'verified V3 adjustment provenance must validate before clinical blocking');

  const coAvoid=await V3.calculate({
    drugId:COALMACIN,
    regimenId:coLower.selectionId,
    age:{value:5,unit:'vjet'},
    weightKg:20,
    crClMlMin:20,
    hepaticImpairment:'hepatic impairment',
  });
  assert.equal(coAvoid.calculation.outcome,'NOT_CALCULABLE');
  assert.ok((coAvoid.calculation.reasons || []).includes('avoid'),
    'verified renal avoid rule must block calculation');
  assert.ok((coAvoid.calculation.reasons || []).includes('specialist_review'),
    'concurrent hepatic specialist review must remain visible');

  const evidence={
    evidenceVersion:'drx-phase10-pediatric-v3-live-v1',
    generatedAt:new Date().toISOString(),
    cutover:{
      stateVersion:state.stateVersion,
      mode:state.mode,
      controlledPercent:state.controlledPercent,
      controlVersion:state.controlVersion,
      trafficBucketVersion:state.trafficBucketVersion,
      paracetamolBucket:decision.trafficBucket,
      paracetamolSelectedForV3:decision.selectedForV3,
    },
    paracetamol:{
      productKey:v3Product.phase9Context?.v3ProductKey,
      indicationOptions:v3Product.calculationOptions.length,
      ruleCount:v3Product.calculationOptions[0].ruleCount,
      age12:{outcome:age12.calculation.outcome,perDose:age12.calculation.perDose,measure:age12.calculation.measure},
      age16:{outcome:age16.calculation.outcome,perDose:age16.calculation.perDose,measure:age16.calculation.measure},
      age9:{outcome:age9.calculation.outcome},
    },
    coAlmacin:{
      indicationOptions:co.calculationOptions.length,
      advancedInputs:co.calculationOptions.map(option=>option.requires.advancedInputs),
      hepaticSafetyOutcome:coSafety.calculation.outcome,
      hepaticSafetyReasons:coSafety.calculation.reasons || [],
      renalAvoidOutcome:coAvoid.calculation.outcome,
      renalAvoidReasons:coAvoid.calculation.reasons || [],
    },
  };
  fs.writeFileSync('drx-phase10-pediatric-v3-live-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
