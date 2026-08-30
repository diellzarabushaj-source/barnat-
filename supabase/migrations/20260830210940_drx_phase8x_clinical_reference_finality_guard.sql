create or replace function drx_dose.guard_phase8_clinical_reference_finality_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
begin
  if old.evidence_review_status in ('VERIFIED','REJECTED') then
    if new.evidence_review_status is distinct from old.evidence_review_status
       or new.source_key is distinct from old.source_key
       or new.source_url is distinct from old.source_url
       or new.expected_source_tier is distinct from old.expected_source_tier
       or new.source_snapshot_id is distinct from old.source_snapshot_id
       or new.source_status is distinct from old.source_status
       or new.presentation_match_status is distinct from old.presentation_match_status
       or new.section_2_sha256 is distinct from old.section_2_sha256
       or new.section_4_1_sha256 is distinct from old.section_4_1_sha256
       or new.section_4_2_sha256 is distinct from old.section_4_2_sha256
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.review_note is distinct from old.review_note
       or new.reviewer_role is distinct from old.reviewer_role
       or new.review_attestation_version is distinct from old.review_attestation_version
       or new.automatic_product_identity_allowed is distinct from old.automatic_product_identity_allowed
       or new.automatic_rule_publication_allowed is distinct from old.automatic_rule_publication_allowed
    then
      raise exception 'Phase 8 clinical reference finality guard: reviewed evidence is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aa_drx_phase8_clinical_reference_finality_guard
  on drx_dose.phase8_pilot_clinical_references_v1;
create trigger aa_drx_phase8_clinical_reference_finality_guard
before update on drx_dose.phase8_pilot_clinical_references_v1
for each row execute function drx_dose.guard_phase8_clinical_reference_finality_v1();

create or replace function public.drx_phase8_register_clinical_reference_v1(p_reference jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_row drx_dose.phase8_pilot_clinical_references_v1%rowtype;
  v_snapshot_id text := lower(p_reference->>'snapshotId');
  v_drug_id uuid := (p_reference->>'drugId')::uuid;
  v_source_url text := p_reference->>'sourceUrl';
  v_presentation_status text := p_reference->>'presentationMatchStatus';
  v_s2 text;
  v_s41 text;
  v_s42 text;
begin
  if coalesce(p_reference->>'registrationVersion','')<>'drx-phase8-clinical-reference-v1' then
    raise exception 'Phase 8 clinical reference registration blocked: unsupported payload version';
  end if;
  if v_snapshot_id is null or v_snapshot_id !~ '^[0-9a-f]{64}$' then
    raise exception 'Phase 8 clinical reference registration blocked: invalid snapshot digest';
  end if;
  if v_presentation_status<>'MATCHED' then
    raise exception 'Phase 8 clinical reference registration blocked: presentation has not been matched';
  end if;

  select *
  into v_row
  from drx_dose.phase8_pilot_clinical_references_v1
  where drug_id=v_drug_id
    and lower(btrim(source_url))=lower(btrim(v_source_url))
  for update;

  if not found then
    raise exception 'Phase 8 clinical reference registration blocked: seeded reference row not found';
  end if;

  if not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    where s.snapshot_id=v_snapshot_id
      and s.raw_sha256=v_snapshot_id
      and s.source_key=v_row.source_key
      and s.source_tier=v_row.expected_source_tier
      and lower(btrim(s.source_url))=lower(btrim(v_row.source_url))
  ) then
    raise exception 'Phase 8 clinical reference registration blocked: snapshot provenance does not match seeded reference';
  end if;

  select section_sha256 into v_s2
  from public.dose_source_sections_v3
  where snapshot_id=v_snapshot_id and section_code='2' and extraction_status='extracted';
  select section_sha256 into v_s41
  from public.dose_source_sections_v3
  where snapshot_id=v_snapshot_id and section_code='4.1' and extraction_status='extracted';
  select section_sha256 into v_s42
  from public.dose_source_sections_v3
  where snapshot_id=v_snapshot_id and section_code='4.2' and extraction_status='extracted';

  if v_s2 is null or v_s41 is null or v_s42 is null then
    raise exception 'Phase 8 clinical reference registration blocked: sections 2, 4.1 and 4.2 must all be extracted';
  end if;

  if v_row.evidence_review_status in ('VERIFIED','REJECTED') then
    if v_row.source_snapshot_id<>v_snapshot_id
       or v_row.section_2_sha256<>v_s2
       or v_row.section_4_1_sha256<>v_s41
       or v_row.section_4_2_sha256<>v_s42 then
      raise exception 'Phase 8 clinical reference registration blocked: reviewed snapshot is immutable; create a new review cycle';
    end if;

    return jsonb_build_object(
      'clinicalReferenceId',v_row.clinical_reference_id,
      'drugId',v_drug_id,
      'snapshotId',v_row.source_snapshot_id,
      'sourceKey',v_row.source_key,
      'sourceStatus',v_row.source_status,
      'presentationMatchStatus',v_row.presentation_match_status,
      'evidenceReviewStatus',v_row.evidence_review_status,
      'reviewPreserved',true,
      'automaticProductIdentityAllowed',false,
      'automaticRulePublicationAllowed',false
    );
  end if;

  update drx_dose.phase8_pilot_clinical_references_v1
  set source_snapshot_id=v_snapshot_id,
      source_status='INGESTED',
      presentation_match_status='MATCHED',
      evidence_review_status='READY_FOR_REVIEW',
      section_2_sha256=v_s2,
      section_4_1_sha256=v_s41,
      section_4_2_sha256=v_s42,
      reviewed_by=null,reviewed_at=null,review_note=null,
      reviewer_role=null,review_attestation_version=null,
      automatic_product_identity_allowed=false,
      automatic_rule_publication_allowed=false,
      updated_at=now()
  where clinical_reference_id=v_row.clinical_reference_id;

  return jsonb_build_object(
    'clinicalReferenceId',v_row.clinical_reference_id,
    'drugId',v_drug_id,
    'snapshotId',v_snapshot_id,
    'sourceKey',v_row.source_key,
    'sourceStatus','INGESTED',
    'presentationMatchStatus','MATCHED',
    'evidenceReviewStatus','READY_FOR_REVIEW',
    'reviewPreserved',false,
    'automaticProductIdentityAllowed',false,
    'automaticRulePublicationAllowed',false
  );
end;
$$;

revoke all on function public.drx_phase8_register_clinical_reference_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase8_register_clinical_reference_v1(jsonb)
  to service_role;
