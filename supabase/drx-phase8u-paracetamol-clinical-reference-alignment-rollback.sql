-- DRx Phase 8U rollback.
-- The old eMC 13495 snapshot is preserved, but the binding returns to MISSING/PENDING.
do $$
declare
  v_row drx_dose.phase8_pilot_clinical_references_v1%rowtype;
begin
  select *
  into v_row
  from drx_dose.phase8_pilot_clinical_references_v1
  where drug_id='84a1cf4a-6568-41d7-8d13-0f2b7715acae'
  for update;

  if not found then
    raise exception 'Phase 8U rollback blocked: paracetamol clinical reference row not found';
  end if;

  if v_row.source_key<>'emc-13494-phase8-clinical-ref'
     or v_row.evidence_review_status not in ('PENDING','READY_FOR_REVIEW')
     or v_row.reviewed_by is not null
     or v_row.reviewed_at is not null
     or v_row.reviewer_role is not null
     or v_row.review_attestation_version is not null then
    raise exception 'Phase 8U rollback blocked: aligned reference has changed or has been reviewed';
  end if;

  update drx_dose.phase8_pilot_clinical_references_v1
  set source_key='emc-13495-phase8-clinical-ref',
      source_url='https://www.medicines.org.uk/emc/product/13495/smpc',
      expected_source_tier='EMC',
      source_snapshot_id=null,
      source_status='MISSING',
      presentation_match_status='PENDING',
      evidence_review_status='PENDING',
      section_2_sha256=null,
      section_4_1_sha256=null,
      section_4_2_sha256=null,
      reviewed_by=null,
      reviewed_at=null,
      review_note=null,
      reviewer_role=null,
      review_attestation_version=null,
      automatic_product_identity_allowed=false,
      automatic_rule_publication_allowed=false,
      updated_at=now()
  where clinical_reference_id=v_row.clinical_reference_id;
end;
$$;
