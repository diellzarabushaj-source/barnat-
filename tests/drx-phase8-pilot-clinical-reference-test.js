'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Builder=require('../scripts/build-drx-phase8-pilot-clinical-extraction.js');

const ROOT=path.resolve(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'data','drx-phase8-pilot-clinical-sources-v1.json'),'utf8'));
assert.equal(config.schemaVersion,'drx-phase8-pilot-clinical-sources-v1');
assert.equal(config.sources.length,2);
assert.equal(config.publicationAllowed,false);
assert.equal(config.automaticVerificationAllowed,false);
assert.deepEqual(config.sources.map(x=>x.clinicalSourceKey).sort(),[
  'emc-10038-phase8-clinical-ref',
  'emc-13494-phase8-clinical-ref'
]);
for(const source of config.sources){
  assert.equal(source.expectedTier,'EMC');
  assert.equal(source.referenceRole,'CLINICAL_REFERENCE_ONLY');
  assert.match(source.exactMarketSnapshotId,/^[0-9a-f]{64}$/);
  assert.match(source.url,/^https:\/\/www\.medicines\.org\.uk\/emc\/product\/\d+\/smpc$/);
}
const para=config.sources.find(x=>x.drugId==='84a1cf4a-6568-41d7-8d13-0f2b7715acae');
assert.equal(para.url,'https://www.medicines.org.uk/emc/product/13494/smpc');
assert.deepEqual(para.clinicalTokens,[
  '16 years and over',
  '10 - 15 years',
  'Not suitable for children under 10',
  'Not more than 4 doses'
]);

const sample={
  sourceTier:'EMC',
  snapshotId:'a'.repeat(64),
  rawSha256:'a'.repeat(64),
  sourceDocument:{documentDate:'2026-01-14',productName:'Augmentin Duo 400/57 powder for oral suspension'},
  composition:{text:'5 ml contains 400 mg amoxicillin and 57 mg clavulanic acid'},
  parsed:{
    indicationsSectionPresent:true,
    doseSectionPresent:true,
    sections:{
      '4.1':{text:'Therapeutic indications'},
      '4.2':{text:'25 mg/3.6 mg/kg/day and 45 mg/6.4 mg/kg/day in two divided doses. Renal impairment.'}
    }
  }
};
const result=Builder.validateSnapshot(config.sources[0],sample);
assert.equal(result.presentationMatchStatus,'MATCHED');
assert.equal(result.productIdentityVerifiedByThisSource,false);
assert.equal(result.rulePublicationAllowed,false);
assert.equal(result.automaticVerificationAllowed,false);

const m8m=fs.readFileSync(path.join(ROOT,'supabase','migrations','20260830192720_drx_phase8m_clinical_reference_pipeline.sql'),'utf8');
const m8n=fs.readFileSync(path.join(ROOT,'supabase','migrations','20260830192855_drx_phase8n_exact_product_identity_review.sql'),'utf8');
const m8u=fs.readFileSync(path.join(ROOT,'supabase','migrations','20260830205203_drx_phase8u_paracetamol_clinical_reference_alignment.sql'),'utf8');
const rollbackU=fs.readFileSync(path.join(ROOT,'supabase','drx-phase8u-paracetamol-clinical-reference-alignment-rollback.sql'),'utf8');
const workflow=fs.readFileSync(path.join(ROOT,'.github','workflows','drx-phase8-pilot-clinical-reference.yml'),'utf8');
const ingest=fs.readFileSync(path.join(ROOT,'scripts','ingest-drx-phase8-pilot-clinical-sources.js'),'utf8');

assert.match(m8m,/phase8_pilot_clinical_references_v1/);
assert.match(m8n,/product identity only; it does not verify or publish dosing rules/i);
assert.match(m8u,/emc-13495-phase8-clinical-ref/);
assert.match(m8u,/emc-13494-phase8-clinical-ref/);
assert.match(m8u,/source_status='MISSING'|source_status='MISSING'/);
assert.match(m8u,/evidence_review_status='PENDING'|evidence_review_status='PENDING'/);
assert.doesNotMatch(m8u,/evidence_review_status\s*=\s*'VERIFIED'/i);
assert.doesNotMatch(rollbackU,/\bcascade\b/i);
assert.match(rollbackU,/rollback blocked: aligned reference has changed or has been reviewed/i);

assert.match(workflow,/archive:/);
assert.match(workflow,/ingest:/);
assert.match(workflow,/needs: archive/);
const archiveBlock=workflow.split(/^  ingest:/m)[0];
assert.doesNotMatch(archiveBlock,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/20260830205203_drx_phase8u_paracetamol_clinical_reference_alignment\.sql/);
assert.doesNotMatch(ingest,/fetchSourceSnapshot/);
assert.match(ingest,/drx_phase8_register_clinical_reference_v1/);
assert.match(ingest,/productIdentityVerifiedByClinicalReference:false/);
assert.match(ingest,/automaticRulePublicationAllowed:false/);

console.log('DRx Phase 8 pilot clinical-reference contract: PASS');
