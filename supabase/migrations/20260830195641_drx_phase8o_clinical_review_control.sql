alter table drx_dose.phase8_pilot_clinical_references_v1
  add column if not exists reviewer_role text,
  add column if not exists review_attestation_version text;

alter table drx_dose.phase8_pilot_clinical_references_v1
  drop constraint if exists phase8_pilot_clinical_references_reviewer_role_check;
alter table drx_dose.phase8_pilot_clinical_references_v1
  add constraint phase8_pilot_clinical_references_reviewer_role_check
  check (reviewer_role is null or reviewer_role='CLINICAL_REVIEWER');

create or replace function drx_dose.guard_phase8_clinical_reference_review_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
begin
  new.updated_at := now();

  if new.evidence_review_status not in ('VERIFIED','REJECTED') then
    return new;
  end if;

  if nullif(btrim(new.reviewed_by),'') is null
     or new.reviewed_at is null
     or nullif(btrim(new.review_note),'') is null
     or new.reviewer_role<>'CLINICAL_REVIEWER'
     or new.review_attestation_version<>'drx-phase8-clinical-review-attestation-v1' then
    raise exception 'Phase 8 clinical reference review blocked: explicit clinical reviewer attestation is incomplete';
  end if;

  if new.evidence_review_status='REJECTED' then
    return new;
  end if;

  if new.source_status<>'INGESTED'
     or new.presentation_match_status<>'MATCHED'
     or new.source_snapshot_id is null then
    raise exception 'Phase 8 clinical reference verification blocked: source is not ingested and presentation-matched';
  end if;

  if not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    where s.snapshot_id=new.source_snapshot_id
      and s.source_key=new.source_key
      and s.source_tier=new.expected_source_tier
      and s.raw_sha256=new.source_snapshot_id
  ) then
    raise exception 'Phase 8 clinical reference verification blocked: snapshot provenance mismatch';
  end if;

  if not exists (
    select 1
    from public.dose_source_sections_v3 s2
    join public.dose_source_sections_v3 s41
      on s41.snapshot_id=s2.snapshot_id and s41.section_code='4.1'
    join public.dose_source_sections_v3 s42
      on s42.snapshot_id=s2.snapshot_id and s42.section_code='4.2'
    where s2.snapshot_id=new.source_snapshot_id
      and s2.section_code='2'
      and s2.extraction_status='extracted'
      and s41.extraction_status='extracted'
      and s42.extraction_status='extracted'
      and s2.section_sha256=new.section_2_sha256
      and s41.section_sha256=new.section_4_1_sha256
      and s42.section_sha256=new.section_4_2_sha256
  ) then
    raise exception 'Phase 8 clinical reference verification blocked: required extracted section hashes are missing or mismatched';
  end if;

  return new;
end;
$$;

create or replace function public.drx_phase8_clinical_review_packet_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'packetVersion','drx-phase8-clinical-review-packet-v1',
  'generatedAt',clock_timestamp(),
  'requiresHumanClinicalReviewer',true,
  'publicationAllowed',false,
  'pilots',coalesce(jsonb_agg(
    jsonb_build_object(
      'clinicalReferenceId',cr.clinical_reference_id,
      'drugId',cr.drug_id,
      'tradeName',r.trade_name,
      'pilotStatus',r.pilot_status,
      'exactProductIdentityVerified',r.exact_product_binding_verified,
      'exactMarketSource',jsonb_build_object(
        'url',r.source_url,
        'snapshotId',r.source_snapshot_id,
        'tier',r.source_tier
      ),
      'clinicalReference',jsonb_build_object(
        'sourceKey',cr.source_key,
        'url',cr.source_url,
        'tier',cr.expected_source_tier,
        'snapshotId',cr.source_snapshot_id,
        'sourceStatus',cr.source_status,
        'presentationMatchStatus',cr.presentation_match_status,
        'evidenceReviewStatus',cr.evidence_review_status,
        'sectionHashes',jsonb_build_object(
          '2',cr.section_2_sha256,
          '4.1',cr.section_4_1_sha256,
          '4.2',cr.section_4_2_sha256
        ),
        'sections',(
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'code',s.section_code,
              'heading',s.heading,
              'text',s.section_text,
              'sha256',s.section_sha256,
              'extractionStatus',s.extraction_status
            )
            order by case s.section_code when '2' then 1 when '4.1' then 2 when '4.2' then 3 else 9 end
          ),'[]'::jsonb)
          from public.dose_source_sections_v3 s
          where s.snapshot_id=cr.source_snapshot_id
            and s.section_code in ('2','4.1','4.2')
        )
      ),
      'reviewRequirements',jsonb_build_object(
        'reviewerRole','CLINICAL_REVIEWER',
        'attestationVersion','drx-phase8-clinical-review-attestation-v1',
        'snapshotAndSectionHashesMustMatch',true,
        'automaticVerificationAllowed',false,
        'automaticPublicationAllowed',false
      )
    )
    order by r.trade_name
  ),'[]'::jsonb)
)
from drx_dose.phase8_pilot_clinical_references_v1 cr
join drx_dose.phase8_pilot_readiness_v1 r
  on r.clinical_reference_id=cr.clinical_reference_id;
$$;

create or replace function public.drx_phase8_review_clinical_reference_v1(p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_row drx_dose.phase8_pilot_clinical_references_v1%rowtype;
  v_reference_id uuid;
  v_decision text := upper(coalesce(p_review->>'decision',''));
  v_snapshot_id text := lower(coalesce(p_review->>'snapshotId',''));
  v_s2 text := lower(coalesce(p_review->>'section2Sha256',''));
  v_s41 text := lower(coalesce(p_review->>'section41Sha256',''));
  v_s42 text := lower(coalesce(p_review->>'section42Sha256',''));
  v_reviewer text := nullif(btrim(p_review->>'reviewedBy'),'');
  v_note text := nullif(btrim(p_review->>'reviewNote'),'');
  v_role text := p_review->>'reviewerRole';
  v_attestation text := p_review->>'attestationVersion';
  v_attested boolean := coalesce((p_review->>'reviewerAttested')::boolean,false);
begin
  if coalesce(p_review->>'reviewVersion','')<>'drx-phase8-clinical-review-v1' then
    raise exception 'Phase 8 clinical review blocked: unsupported review payload version';
  end if;

  begin
    v_reference_id := (p_review->>'clinicalReferenceId')::uuid;
  exception when others then
    raise exception 'Phase 8 clinical review blocked: invalid clinicalReferenceId';
  end;

  if v_decision not in ('VERIFIED','REJECTED') then
    raise exception 'Phase 8 clinical review blocked: decision must be VERIFIED or REJECTED';
  end if;
  if v_role<>'CLINICAL_REVIEWER'
     or v_attestation<>'drx-phase8-clinical-review-attestation-v1'
     or not v_attested then
    raise exception 'Phase 8 clinical review blocked: clinical reviewer attestation is required';
  end if;
  if v_reviewer is null or v_note is null then
    raise exception 'Phase 8 clinical review blocked: reviewer identity and review note are required';
  end if;
  if v_snapshot_id !~ '^[0-9a-f]{64}$'
     or v_s2 !~ '^[0-9a-f]{64}$'
     or v_s41 !~ '^[0-9a-f]{64}$'
     or v_s42 !~ '^[0-9a-f]{64}$' then
    raise exception 'Phase 8 clinical review blocked: snapshot and section hashes must be SHA-256 digests';
  end if;

  select *
  into v_row
  from drx_dose.phase8_pilot_clinical_references_v1
  where clinical_reference_id=v_reference_id
  for update;

  if not found then
    raise exception 'Phase 8 clinical review blocked: clinical reference not found';
  end if;

  if v_row.source_status<>'INGESTED'
     or v_row.presentation_match_status<>'MATCHED'
     or v_row.source_snapshot_id is null then
    raise exception 'Phase 8 clinical review blocked: reference is not ready for review';
  end if;

  if v_row.source_snapshot_id<>v_snapshot_id
     or v_row.section_2_sha256<>v_s2
     or v_row.section_4_1_sha256<>v_s41
     or v_row.section_4_2_sha256<>v_s42 then
    raise exception 'Phase 8 clinical review blocked: stale review packet; snapshot or section hash changed';
  end if;

  update drx_dose.phase8_pilot_clinical_references_v1
  set evidence_review_status=v_decision,
      reviewed_by=v_reviewer,
      reviewed_at=now(),
      review_note=v_note,
      reviewer_role=v_role,
      review_attestation_version=v_attestation,
      automatic_product_identity_allowed=false,
      automatic_rule_publication_allowed=false
  where clinical_reference_id=v_reference_id
  returning * into v_row;

  return jsonb_build_object(
    'clinicalReferenceId',v_row.clinical_reference_id,
    'drugId',v_row.drug_id,
    'snapshotId',v_row.source_snapshot_id,
    'evidenceReviewStatus',v_row.evidence_review_status,
    'reviewedBy',v_row.reviewed_by,
    'reviewedAt',v_row.reviewed_at,
    'reviewerRole',v_row.reviewer_role,
    'automaticProductIdentityAllowed',false,
    'automaticRulePublicationAllowed',false
  );
end;
$$;

revoke all on function public.drx_phase8_clinical_review_packet_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase8_clinical_review_packet_v1()
  to service_role;

revoke all on function public.drx_phase8_review_clinical_reference_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase8_review_clinical_reference_v1(jsonb)
  to service_role;

comment on function public.drx_phase8_clinical_review_packet_v1() is
  'Service-only Phase 8 review packet including exact snapshot and section evidence. Does not verify or publish.';
comment on function public.drx_phase8_review_clinical_reference_v1(jsonb) is
  'Service-only explicit clinical reviewer decision endpoint. Requires current snapshot/section hashes and clinical-reviewer attestation; never publishes dosing rules.';
