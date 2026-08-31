
-- DRx Phase 11BT: review provenance foundation + explicit item-level reviewer actions.
-- Existing historical published indication rows are not rewritten. New verified/published
-- indication updates must carry reviewer provenance through a NOT VALID constraint.

alter table drx_dose.source_regimen_supporting_evidence_v1
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table drx_dose.source_regimen_step_presentation_requirements_v1
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table drx_dose.source_regimen_step_administration_v1
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table drx_dose.source_regimen_candidates_v1
  add column if not exists review_note text;

alter table drx_dose.source_adjustment_candidates_v1
  add column if not exists review_note text;

alter table drx_dose.source_restriction_candidates_v1
  add column if not exists review_note text;

alter table public.dose_indication_concepts_v3
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table drx_dose.source_regimen_supporting_evidence_v1
  drop constraint if exists source_regimen_supporting_evidence_review_provenance_check,
  add constraint source_regimen_supporting_evidence_review_provenance_check check (
    review_status not in ('VERIFIED','REJECTED')
    or (
      nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
    )
  );

alter table drx_dose.source_regimen_step_presentation_requirements_v1
  drop constraint if exists source_regimen_presentation_review_provenance_check,
  add constraint source_regimen_presentation_review_provenance_check check (
    review_status not in ('VERIFIED','REJECTED')
    or (
      nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
    )
  );

alter table drx_dose.source_regimen_step_administration_v1
  drop constraint if exists source_regimen_administration_review_provenance_check,
  add constraint source_regimen_administration_review_provenance_check check (
    review_status not in ('VERIFIED','REJECTED')
    or (
      nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
    )
  );

alter table public.dose_indication_concepts_v3
  drop constraint if exists dose_indication_concepts_v3_review_provenance_check,
  add constraint dose_indication_concepts_v3_review_provenance_check check (
    editorial_status not in ('verified','published')
    or (
      nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
    )
  ) not valid;

create table if not exists drx_dose.phase11_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'REGIMEN','EVIDENCE','PRESENTATION','ADMINISTRATION',
    'SAFETY_ADJUSTMENT','SAFETY_RESTRICTION','INDICATION_LINK','INDICATION'
  )),
  entity_key text not null,
  regimen_key text,
  decision text not null,
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists phase11_review_events_entity_idx
  on drx_dose.phase11_review_events_v1(entity_type,entity_key,created_at desc);

create index if not exists phase11_review_events_regimen_idx
  on drx_dose.phase11_review_events_v1(regimen_key,created_at desc)
  where regimen_key is not null;

create or replace function public.drx_phase11_review_regimen_evidence_v1(
  p_regimen_key text,
  p_source_snapshot_id text,
  p_source_section_sha256 text,
  p_decision text,
  p_reviewer text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
begin
  if v_decision not in ('VERIFIED','REJECTED') then
    raise exception 'Evidence decision must be VERIFIED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;

  select to_jsonb(e) into v_before
  from drx_dose.source_regimen_supporting_evidence_v1 e
  where e.regimen_key=p_regimen_key
    and e.source_snapshot_id=p_source_snapshot_id
    and e.source_section_sha256=p_source_section_sha256;
  if v_before is null then raise exception 'Evidence row not found'; end if;

  update drx_dose.source_regimen_supporting_evidence_v1 e
  set review_status=v_decision,
      reviewed_by=btrim(p_reviewer),
      reviewed_at=now(),
      review_note=p_review_note
  where e.regimen_key=p_regimen_key
    and e.source_snapshot_id=p_source_snapshot_id
    and e.source_section_sha256=p_source_section_sha256;

  select to_jsonb(e) into v_after
  from drx_dose.source_regimen_supporting_evidence_v1 e
  where e.regimen_key=p_regimen_key
    and e.source_snapshot_id=p_source_snapshot_id
    and e.source_section_sha256=p_source_section_sha256;

  insert into drx_dose.phase11_review_events_v1(
    entity_type,entity_key,regimen_key,decision,reviewer,review_note,before_state,after_state
  ) values (
    'EVIDENCE',concat(p_regimen_key,'|',p_source_snapshot_id,'|',p_source_section_sha256),
    p_regimen_key,v_decision,btrim(p_reviewer),p_review_note,v_before,v_after
  );

  return jsonb_build_object('ok',true,'entity','EVIDENCE','decision',v_decision,'row',v_after);
end;
$$;

create or replace function public.drx_phase11_review_regimen_presentation_v1(
  p_regimen_key text,p_branch_no integer,p_step_no integer,
  p_decision text,p_reviewer text,p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
begin
  if v_decision not in ('VERIFIED','REJECTED') then
    raise exception 'Presentation decision must be VERIFIED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;

  select to_jsonb(x) into v_before
  from drx_dose.source_regimen_step_presentation_requirements_v1 x
  where x.regimen_key=p_regimen_key and x.branch_no=p_branch_no and x.step_no=p_step_no;
  if v_before is null then raise exception 'Presentation requirement not found'; end if;

  update drx_dose.source_regimen_step_presentation_requirements_v1 x
  set review_status=v_decision,reviewed_by=btrim(p_reviewer),reviewed_at=now(),review_note=p_review_note
  where x.regimen_key=p_regimen_key and x.branch_no=p_branch_no and x.step_no=p_step_no;

  select to_jsonb(x) into v_after
  from drx_dose.source_regimen_step_presentation_requirements_v1 x
  where x.regimen_key=p_regimen_key and x.branch_no=p_branch_no and x.step_no=p_step_no;

  insert into drx_dose.phase11_review_events_v1(
    entity_type,entity_key,regimen_key,decision,reviewer,review_note,before_state,after_state
  ) values (
    'PRESENTATION',concat(p_regimen_key,'|',p_branch_no,'|',p_step_no),
    p_regimen_key,v_decision,btrim(p_reviewer),p_review_note,v_before,v_after
  );

  return jsonb_build_object('ok',true,'entity','PRESENTATION','decision',v_decision,'row',v_after);
end;
$$;

create or replace function public.drx_phase11_review_regimen_administration_v1(
  p_regimen_key text,p_branch_no integer,p_step_no integer,
  p_decision text,p_reviewer text,p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
begin
  if v_decision not in ('VERIFIED','REJECTED') then
    raise exception 'Administration decision must be VERIFIED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;

  select to_jsonb(x) into v_before
  from drx_dose.source_regimen_step_administration_v1 x
  where x.regimen_key=p_regimen_key and x.branch_no=p_branch_no and x.step_no=p_step_no;
  if v_before is null then raise exception 'Administration requirement not found'; end if;

  update drx_dose.source_regimen_step_administration_v1 x
  set review_status=v_decision,reviewed_by=btrim(p_reviewer),reviewed_at=now(),review_note=p_review_note
  where x.regimen_key=p_regimen_key and x.branch_no=p_branch_no and x.step_no=p_step_no;

  select to_jsonb(x) into v_after
  from drx_dose.source_regimen_step_administration_v1 x
  where x.regimen_key=p_regimen_key and x.branch_no=p_branch_no and x.step_no=p_step_no;

  insert into drx_dose.phase11_review_events_v1(
    entity_type,entity_key,regimen_key,decision,reviewer,review_note,before_state,after_state
  ) values (
    'ADMINISTRATION',concat(p_regimen_key,'|',p_branch_no,'|',p_step_no),
    p_regimen_key,v_decision,btrim(p_reviewer),p_review_note,v_before,v_after
  );

  return jsonb_build_object('ok',true,'entity','ADMINISTRATION','decision',v_decision,'row',v_after);
end;
$$;

create or replace function public.drx_phase11_review_safety_candidate_v1(
  p_candidate_type text,p_candidate_key text,p_decision text,
  p_reviewer text,p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_type text := upper(btrim(coalesce(p_candidate_type,'')));
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_before jsonb;
  v_after jsonb;
  v_regimen_key text;
begin
  if v_type not in ('ADJUSTMENT','RESTRICTION') then
    raise exception 'candidate_type must be ADJUSTMENT or RESTRICTION';
  end if;
  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'Safety decision must be APPROVED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;

  if v_type='ADJUSTMENT' then
    select to_jsonb(a),a.regimen_key into v_before,v_regimen_key
    from drx_dose.source_adjustment_candidates_v1 a where a.adjustment_key=p_candidate_key;
    if v_before is null then raise exception 'Adjustment candidate not found'; end if;

    update drx_dose.source_adjustment_candidates_v1 a
    set review_status=v_decision,reviewed_by=btrim(p_reviewer),reviewed_at=now(),
        review_note=p_review_note,updated_at=now()
    where a.adjustment_key=p_candidate_key;

    select to_jsonb(a) into v_after
    from drx_dose.source_adjustment_candidates_v1 a where a.adjustment_key=p_candidate_key;
  else
    select to_jsonb(x) into v_before
    from drx_dose.source_restriction_candidates_v1 x where x.restriction_key=p_candidate_key;
    if v_before is null then raise exception 'Restriction candidate not found'; end if;

    update drx_dose.source_restriction_candidates_v1 x
    set review_status=v_decision,reviewed_by=btrim(p_reviewer),reviewed_at=now(),
        review_note=p_review_note,updated_at=now()
    where x.restriction_key=p_candidate_key;

    select to_jsonb(x) into v_after
    from drx_dose.source_restriction_candidates_v1 x where x.restriction_key=p_candidate_key;
  end if;

  insert into drx_dose.phase11_review_events_v1(
    entity_type,entity_key,regimen_key,decision,reviewer,review_note,before_state,after_state
  ) values (
    case when v_type='ADJUSTMENT' then 'SAFETY_ADJUSTMENT' else 'SAFETY_RESTRICTION' end,
    p_candidate_key,v_regimen_key,v_decision,btrim(p_reviewer),p_review_note,v_before,v_after
  );

  return jsonb_build_object('ok',true,'entity',v_type,'decision',v_decision,'row',v_after);
end;
$$;

create or replace function public.drx_phase11_review_indication_link_v1(
  p_regimen_key text,p_indication_key_candidate text,p_decision text,
  p_reviewer text,p_review_note text default null
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
begin
  if v_decision not in ('VERIFIED','REJECTED') then
    raise exception 'Indication-link decision must be VERIFIED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;

  select to_jsonb(l) into v_before
  from drx_dose.source_regimen_indication_links_v1 l
  where l.regimen_key=p_regimen_key and l.indication_key_candidate=p_indication_key_candidate;
  if v_before is null then raise exception 'Indication link not found'; end if;

  if v_decision='VERIFIED' and not exists (
    select 1
    from drx_dose.source_regimen_indication_links_v1 l
    join public.dose_indication_concepts_v3 i on i.indication_id=l.indication_id
    where l.regimen_key=p_regimen_key
      and l.indication_key_candidate=p_indication_key_candidate
      and l.indication_id is not null
      and i.editorial_status='published'
      and i.icd_verification_status='verified'
  ) then
    raise exception 'Linked indication must be published and ICD-verified before link verification';
  end if;

  update drx_dose.source_regimen_indication_links_v1 l
  set link_status=v_decision,reviewed_by=btrim(p_reviewer),reviewed_at=now()
  where l.regimen_key=p_regimen_key and l.indication_key_candidate=p_indication_key_candidate;

  select to_jsonb(l) into v_after
  from drx_dose.source_regimen_indication_links_v1 l
  where l.regimen_key=p_regimen_key and l.indication_key_candidate=p_indication_key_candidate;

  insert into drx_dose.phase11_review_events_v1(
    entity_type,entity_key,regimen_key,decision,reviewer,review_note,before_state,after_state
  ) values (
    'INDICATION_LINK',concat(p_regimen_key,'|',p_indication_key_candidate),
    p_regimen_key,v_decision,btrim(p_reviewer),p_review_note,v_before,v_after
  );

  return jsonb_build_object('ok',true,'entity','INDICATION_LINK','decision',v_decision,'row',v_after);
end;
$$;

alter table drx_dose.phase11_review_events_v1 enable row level security;
revoke all on drx_dose.phase11_review_events_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_review_events_v1 to service_role;

revoke all on function public.drx_phase11_review_regimen_evidence_v1(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_review_regimen_presentation_v1(text,integer,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_review_regimen_administration_v1(text,integer,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_review_safety_candidate_v1(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_review_indication_link_v1(text,text,text,text,text) from public,anon,authenticated;

grant execute on function public.drx_phase11_review_regimen_evidence_v1(text,text,text,text,text,text) to service_role;
grant execute on function public.drx_phase11_review_regimen_presentation_v1(text,integer,integer,text,text,text) to service_role;
grant execute on function public.drx_phase11_review_regimen_administration_v1(text,integer,integer,text,text,text) to service_role;
grant execute on function public.drx_phase11_review_safety_candidate_v1(text,text,text,text,text) to service_role;
grant execute on function public.drx_phase11_review_indication_link_v1(text,text,text,text,text) to service_role;
