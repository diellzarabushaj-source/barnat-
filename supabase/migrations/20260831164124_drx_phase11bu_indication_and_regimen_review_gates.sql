
-- DRx Phase 11BU: explicit indication publication and final regimen approval gates.
-- These functions require named reviewer attestations and refuse approval until
-- source evidence, presentation/administration, safety and indication review are complete.

create or replace function public.drx_phase11_publish_indication_v1(
  p_indication_id uuid,
  p_icd10_codes text[],
  p_reviewer text,
  p_attestation text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_codes text[];
  v_missing text[];
  v_before jsonb;
  v_after jsonb;
begin
  if p_indication_id is null then raise exception 'indication_id is required'; end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;
  if p_attestation <> 'ICD_AND_INDICATION_REVIEW_ATTESTED' then
    raise exception 'Explicit ICD/indication attestation is required';
  end if;

  select array_agg(distinct upper(btrim(x)) order by upper(btrim(x)))
    into v_codes
  from unnest(coalesce(p_icd10_codes,'{}'::text[])) x
  where nullif(btrim(x),'') is not null;

  if cardinality(coalesce(v_codes,'{}'::text[]))=0 then
    raise exception 'At least one ICD-10 code is required';
  end if;

  select array_agg(code order by code) into v_missing
  from unnest(v_codes) code
  where not exists (
    select 1 from public.icd_codes i
    where upper(i.code)=code
      and i.is_published
      and i.editorial_status='published'
  );

  if cardinality(coalesce(v_missing,'{}'::text[]))>0 then
    raise exception 'Unknown/unpublished ICD-10 code(s): %',array_to_string(v_missing,',');
  end if;

  select to_jsonb(i) into v_before
  from public.dose_indication_concepts_v3 i
  where i.indication_id=p_indication_id;
  if v_before is null then raise exception 'Indication not found'; end if;

  update public.dose_indication_concepts_v3 i
  set icd10_codes=v_codes,
      icd_verification_status='verified',
      editorial_status='published',
      reviewed_by=btrim(p_reviewer),
      reviewed_at=now(),
      review_note=p_review_note,
      updated_at=now()
  where i.indication_id=p_indication_id;

  select to_jsonb(i) into v_after
  from public.dose_indication_concepts_v3 i
  where i.indication_id=p_indication_id;

  update drx_dose.indication_icd_candidate_reviews_v1 c
  set review_status=case when c.icd_code=any(v_codes) then 'APPROVED' else 'REJECTED' end,
      reviewed_by=btrim(p_reviewer),
      reviewed_at=now(),
      updated_at=now()
  where c.indication_id=p_indication_id
    and c.review_status in ('PENDING','IN_REVIEW');

  insert into drx_dose.phase11_review_events_v1(
    entity_type,entity_key,decision,reviewer,review_note,before_state,after_state
  ) values (
    'INDICATION',p_indication_id::text,'PUBLISHED',btrim(p_reviewer),
    p_review_note,v_before,v_after
  );

  return jsonb_build_object(
    'ok',true,
    'entity','INDICATION',
    'decision','PUBLISHED',
    'icd10Codes',v_codes,
    'row',v_after
  );
end;
$$;

create or replace function public.drx_phase11_review_regimen_v1(
  p_regimen_key text,
  p_decision text,
  p_reviewer text,
  p_attestation text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_before jsonb;
  v_after jsonb;
  v_blockers text[] := '{}'::text[];
begin
  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'Regimen decision must be APPROVED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;
  if v_decision='APPROVED' and p_attestation <> 'CLINICAL_REGIMEN_REVIEW_ATTESTED' then
    raise exception 'Explicit clinical regimen attestation is required';
  end if;

  select to_jsonb(r) into v_before
  from drx_dose.source_regimen_candidates_v1 r
  where r.regimen_key=p_regimen_key;
  if v_before is null then raise exception 'Regimen not found'; end if;

  if v_decision='APPROVED' then
    if not exists (
      select 1 from drx_dose.source_regimen_candidate_readiness_v1 x
      where x.regimen_key=p_regimen_key and x.structurally_complete
    ) then
      v_blockers := array_append(v_blockers,'REGIMEN_STRUCTURE');
    end if;

    if not exists (
      select 1 from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=p_regimen_key
        and e.evidence_role='PRIMARY'
        and e.review_status='VERIFIED'
    ) then
      v_blockers := array_append(v_blockers,'PRIMARY_EVIDENCE_NOT_VERIFIED');
    end if;

    if exists (
      select 1 from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=p_regimen_key and e.review_status<>'VERIFIED'
    ) then
      v_blockers := array_append(v_blockers,'EVIDENCE_REVIEW_INCOMPLETE');
    end if;

    if exists (
      select 1 from drx_dose.source_regimen_step_presentation_requirements_v1 p
      where p.regimen_key=p_regimen_key and p.review_status<>'VERIFIED'
    ) then
      v_blockers := array_append(v_blockers,'PRESENTATION_REVIEW_INCOMPLETE');
    end if;

    if exists (
      select 1 from drx_dose.source_regimen_step_administration_v1 a
      where a.regimen_key=p_regimen_key and a.review_status<>'VERIFIED'
    ) then
      v_blockers := array_append(v_blockers,'ADMINISTRATION_REVIEW_INCOMPLETE');
    end if;

    if exists (
      select 1 from drx_dose.source_regimen_applicable_safety_v2 s
      where s.regimen_key=p_regimen_key
        and s.review_status not in ('APPROVED','PROMOTED','REJECTED')
    ) then
      v_blockers := array_append(v_blockers,'SAFETY_REVIEW_INCOMPLETE');
    end if;

    if not exists (
      select 1
      from drx_dose.source_regimen_candidates_v1 r
      join public.dose_indication_concepts_v3 i on i.indication_id=r.indication_id
      where r.regimen_key=p_regimen_key
        and i.editorial_status='published'
        and i.icd_verification_status='verified'
    ) then
      v_blockers := array_append(v_blockers,'PRIMARY_INDICATION_NOT_PUBLISHED_ICD_VERIFIED');
    end if;

    if exists (
      select 1
      from drx_dose.source_regimen_indication_links_v1 l
      left join public.dose_indication_concepts_v3 i on i.indication_id=l.indication_id
      where l.regimen_key=p_regimen_key
        and (
          l.link_status<>'VERIFIED'
          or i.indication_id is null
          or i.editorial_status<>'published'
          or i.icd_verification_status<>'verified'
        )
    ) then
      v_blockers := array_append(v_blockers,'LINKED_INDICATION_REVIEW_INCOMPLETE');
    end if;

    if cardinality(v_blockers)>0 then
      raise exception 'Regimen % cannot be approved. Blockers: %',
        p_regimen_key,array_to_string(v_blockers,',');
    end if;
  end if;

  update drx_dose.source_regimen_candidates_v1 r
  set review_status=v_decision,
      reviewed_by=btrim(p_reviewer),
      reviewed_at=now(),
      review_note=p_review_note,
      updated_at=now()
  where r.regimen_key=p_regimen_key;

  select to_jsonb(r) into v_after
  from drx_dose.source_regimen_candidates_v1 r
  where r.regimen_key=p_regimen_key;

  insert into drx_dose.phase11_review_events_v1(
    entity_type,entity_key,regimen_key,decision,reviewer,review_note,before_state,after_state
  ) values (
    'REGIMEN',p_regimen_key,p_regimen_key,v_decision,btrim(p_reviewer),
    p_review_note,v_before,v_after
  );

  return jsonb_build_object(
    'ok',true,
    'entity','REGIMEN',
    'decision',v_decision,
    'regimenKey',p_regimen_key,
    'row',v_after
  );
end;
$$;

create or replace view drx_dose.phase11_explicit_review_action_summary_v1 as
select
  (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 where review_status='VERIFIED') as verified_evidence,
  (select count(*) from drx_dose.source_regimen_supporting_evidence_v1) as evidence_total,
  (select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1 where review_status='VERIFIED') as verified_presentations,
  (select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1) as presentation_total,
  (select count(*) from drx_dose.source_regimen_step_administration_v1 where review_status='VERIFIED') as verified_administration,
  (select count(*) from drx_dose.source_regimen_step_administration_v1) as administration_total,
  (select count(*) from drx_dose.source_adjustment_candidates_v1 where review_status in ('APPROVED','PROMOTED','REJECTED')) as reviewed_adjustments,
  (select count(*) from drx_dose.source_adjustment_candidates_v1) as adjustment_total,
  (select count(*) from drx_dose.source_restriction_candidates_v1 where review_status in ('APPROVED','PROMOTED','REJECTED')) as reviewed_restrictions,
  (select count(*) from drx_dose.source_restriction_candidates_v1) as restriction_total,
  (select count(*) from public.dose_indication_concepts_v3 where editorial_status='published' and icd_verification_status='verified') as published_icd_verified_indications,
  (select count(*) from public.dose_indication_concepts_v3) as indication_total,
  (select count(*) from drx_dose.source_regimen_candidates_v1 where review_status='APPROVED') as approved_regimens,
  (select count(*) from drx_dose.source_regimen_candidates_v1) as regimen_total,
  (select count(*) from drx_dose.phase11_review_events_v1) as audit_events,
  false::boolean as auto_approve_allowed;

revoke all on drx_dose.phase11_explicit_review_action_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_explicit_review_action_summary_v1 to service_role;

revoke all on function public.drx_phase11_publish_indication_v1(uuid,text[],text,text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_review_regimen_v1(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.drx_phase11_publish_indication_v1(uuid,text[],text,text,text) to service_role;
grant execute on function public.drx_phase11_review_regimen_v1(text,text,text,text,text) to service_role;
