'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const js=fs.readFileSync('dozologjia-v2.js','utf8');
const css=fs.readFileSync('dozologjia-v2.css','utf8');
const flow=JSON.parse(fs.readFileSync('data/drx-frontend-flow-contract-v1.json','utf8'));

for(const label of ['Përmbledhje','Përdorimi','Dozimi','Siguria','Produktet','Shënime','Burime']){
  assert.ok(js.includes(label),label+' tab missing');
}
assert.match(js,/PRODUCT_TABS/);
assert.match(js,/phase9Flow/);
assert.match(js,/V2 fallback/);
assert.match(js,/Nuk ekspozohet nga V2 fallback/);
assert.match(js,/DRxPhase9Personal/);
assert.match(js,/toggleFavorite\('product'/);
assert.match(js,/saveNote\('product'/);
assert.match(js,/textNameAsIdentityForbidden|ID-të kanonike/);
assert.doesNotMatch(js,/eval\(/);

assert.match(css,/\.phase9-tabs/);
assert.match(css,/\.phase9-clinical-flow/);
assert.match(css,/@media\(max-width:520px\)/);

assert.deepEqual(flow.flow,[
  'substance','variant','population','indication','patient_inputs','dose','product','prescription'
]);
assert.equal(flow.runtime.clinicalCalculation,'server_side_only');
assert.equal(flow.runtime.v2FallbackActive,true);
assert.equal(flow.runtime.browserClinicalMathForbidden,true);
assert.equal(flow.personalEntities.ownerOnly,true);
assert.equal(flow.personalEntities.textNameAsIdentityForbidden,true);

cp.execFileSync(process.execPath,['--check','dozologjia-v2.js'],{stdio:'pipe'});
console.log('DRx Phase 9C drawer contract: PASS');
