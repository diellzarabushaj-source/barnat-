'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const { supabaseRequest } = require('../lib/medindex-data-api.js');

async function rpc(name,body={}) {
  const { data } = await supabaseRequest('rpc/' + name,{
    method:'POST',
    body,
    timeoutMs:20000,
    label:'DRx Phase 8 clinical review ' + name
  },{ privileged:true });
  return data;
}

async function main() {
  const packet = await rpc('drx_phase8_clinical_review_packet_v1');
  assert.equal(packet.packetVersion,'drx-phase8-clinical-review-packet-v1');
  assert.equal(packet.requiresHumanClinicalReviewer,true);
  assert.equal(packet.publicationAllowed,false);
  assert.ok(Array.isArray(packet.pilots));
  assert.equal(packet.pilots.length,2);

  const allowed = new Set(['READY_FOR_REVIEW','VERIFIED','REJECTED']);
  const pilots = packet.pilots.map(item => {
    assert.equal(item.exactProductIdentityVerified,true);
    assert.ok(item.clinicalReference);
    assert.equal(item.clinicalReference.sourceStatus,'INGESTED');
    assert.equal(item.clinicalReference.presentationMatchStatus,'MATCHED');
    assert.ok(allowed.has(item.clinicalReference.evidenceReviewStatus));
    assert.match(item.clinicalReference.snapshotId,/^[0-9a-f]{64}$/);

    const hashes = item.clinicalReference.sectionHashes || {};
    for (const code of ['2','4.1','4.2']) assert.match(hashes[code],/^[0-9a-f]{64}$/);

    const sections = Array.isArray(item.clinicalReference.sections)
      ? item.clinicalReference.sections
      : [];
    assert.deepEqual(sections.map(section => section.code),['2','4.1','4.2']);
    for (const section of sections) {
      assert.equal(section.extractionStatus,'extracted');
      assert.match(section.sha256,/^[0-9a-f]{64}$/);
      assert.equal(section.sha256,hashes[section.code]);
      assert.ok(String(section.text || '').trim().length > 0);
    }

    assert.equal(item.reviewRequirements.reviewerRole,'CLINICAL_REVIEWER');
    assert.equal(
      item.reviewRequirements.attestationVersion,
      'drx-phase8-clinical-review-attestation-v1'
    );
    assert.equal(item.reviewRequirements.snapshotAndSectionHashesMustMatch,true);
    assert.equal(item.reviewRequirements.automaticVerificationAllowed,false);
    assert.equal(item.reviewRequirements.automaticPublicationAllowed,false);

    return {
      clinicalReferenceId:item.clinicalReferenceId,
      drugId:item.drugId,
      tradeName:item.tradeName,
      pilotStatus:item.pilotStatus,
      snapshotId:item.clinicalReference.snapshotId,
      evidenceReviewStatus:item.clinicalReference.evidenceReviewStatus,
      sectionHashes:hashes
    };
  });

  const counts = pilots.reduce((acc,item) => {
    acc[item.evidenceReviewStatus] = (acc[item.evidenceReviewStatus] || 0) + 1;
    return acc;
  },{});

  const evidence = {
    evidenceVersion:'drx-phase8-clinical-review-control-evidence-v1',
    generatedAt:new Date().toISOString(),
    requiresHumanClinicalReviewer:true,
    publicationAllowed:false,
    counts,
    pilots
  };
  fs.writeFileSync(
    'drx-phase8-clinical-review-control-evidence.json',
    JSON.stringify(evidence,null,2) + '\n'
  );
  console.log(JSON.stringify(evidence,null,2));
}

main().catch(error => {
  console.error(error);
  process.exitCode=1;
});
