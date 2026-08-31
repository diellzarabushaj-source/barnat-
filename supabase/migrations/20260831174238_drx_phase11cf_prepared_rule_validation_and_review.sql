
-- DRx Phase 11CF: prepared-rule structural validator + explicit target/rule review.
-- Clinical approval remains upstream and human. This layer only validates that
-- the prepared V3 draft faithfully represents the already-approved regimen.

create table if not exists drx_dose.prepared_rule_validation_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  actor text not null check (nullif(btrim(actor),'') is not null),
  validator_version text not null,
  validation_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists drx_dose.rule_target_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  rule_target_id uuid not null references drx_dose.rule_targets_v1(rule_target_id) on delete restrict,
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  decision text not null check (decision in ('VERIFIED','REJECTED')),
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text not null check (nullif(btrim(review_note),'') is not null),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists drx_dose.prepared_rule_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text not null check (nullif(btrim(review_note),'') is not null),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create or replace view drx_dose.phase11_prepared_rule_review_queue_v1 as
with q as (
  select
    r.rule_id,r.rule_key,r.regimen_key,r.branch_no,r.step_no,r.editorial_status,
    r.safety_validation_status,r.verified_by,r.verified_at,
    sr.review_status as regimen_review_status,
    m.materialization_blockers_v2,
    (
      r.substance_concept_id is not distinct from m.proposed_substance_concept_id
      and r.patient_group is not distinct from m.patient_group
      and r.calculation_method is not distinct from m.calculation_method
      and r.dose_min_value is not distinct from m.dose_min_value
      and r.dose_max_value is not distinct from m.dose_max_value
      and r.dose_unit is not distinct from m.dose_unit
      and r.dose_basis is not distinct from m.proposed_dose_basis
      and r.weight_basis is not distinct from m.proposed_weight_basis
      and r.frequency_mode is not distinct from m.frequency_mode
      and r.interval_min_hours is not distinct from m.interval_min_hours
      and r.interval_max_hours is not distinct from m.interval_max_hours
      and r.times_per_day is not distinct from m.times_per_day
      and r.max_single_dose_mg is not distinct from m.max_single_dose_mg
      and r.max_daily_dose_mg is not distinct from m.max_daily_dose_mg
      and r.max_doses_24h is not distinct from m.max_doses_24h
      and r.duration_mode is not distinct from m.proposed_duration_mode
      and r.duration_min_days is not distinct from m.duration_min_days
      and r.duration_max_days is not distinct from m.duration_max_days
      and r.min_age_months is not distinct from m.min_age_months
      and r.max_age_months is not distinct from m.max_age_months
      and r.min_age_days is not distinct from m.min_age_days
      and r.max_age_days is not distinct from m.max_age_days
      and r.min_weight_kg is not distinct from m.min_weight_kg
      and r.max_weight_kg is not distinct from m.max_weight_kg
      and r.route is not distinct from m.route_key
      and r.pharmaceutical_form is not distinct from m.form_family
      and r.prn is not distinct from m.prn
      and r.dose_basis_mode is not distinct from m.proposed_dose_basis_mode
      and r.dose_basis_component_concept_id is not distinct from
          case when m.proposed_dose_basis_mode='component' then m.dose_basis_component_concept_id end
      and r.source_key is not distinct from m.source_key
      and r.source_snapshot_id is not distinct from m.source_snapshot_id
      and r.source_section='4.2'
      and r.source_section_sha256 is not distinct from m.source_section_sha256
      and r.source_evidence_hash is not distinct from m.source_snapshot_id
      and r.regimen_kind is not distinct from m.regimen_kind
      and r.start_day is not distinct from m.start_day::integer
      and r.end_day is not distinct from m.end_day::integer
      and r.condition_text is not distinct from m.condition_text
      and r.condition_review_required is not distinct from m.proposed_condition_review_required
      and r.regimen_option_key is not distinct from m.proposed_regimen_option_key
    ) as structure_matches_preview,
    exists (
      select 1 from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key
        and e.source_snapshot_id=r.source_snapshot_id
        and e.source_section_sha256=r.source_section_sha256
        and e.review_status='VERIFIED'
    ) as exact_evidence_verified,
    not exists (
      select 1 from drx_dose.source_regimen_applicable_safety_v2 s
      where s.regimen_key=r.regimen_key
        and s.review_status not in ('APPROVED','PROMOTED','REJECTED')
    ) as safety_review_complete,
    (
      r.renal_adjustment_required = (
        exists (
          select 1 from drx_dose.source_regimen_applicable_safety_v2 s
          where s.regimen_key=r.regimen_key
            and s.review_status in ('APPROVED','PROMOTED')
            and s.candidate_type='ADJUSTMENT'
            and s.domain_or_type='RENAL'
        )
        or exists (
          select 1 from drx_dose.source_regimen_applicable_safety_v2 s
          where s.regimen_key=r.regimen_key
            and s.review_status in ('APPROVED','PROMOTED')
            and s.candidate_type='RESTRICTION'
            and s.domain_or_type='RENAL_RESTRICTION'
        )
      )
    ) as renal_flag_matches,
    (
      r.hepatic_adjustment_required = (
        exists (
          select 1 from drx_dose.source_regimen_applicable_safety_v2 s
          where s.regimen_key=r.regimen_key
            and s.review_status in ('APPROVED','PROMOTED')
            and s.candidate_type='ADJUSTMENT'
            and s.domain_or_type='HEPATIC'
        )
        or exists (
          select 1 from drx_dose.source_regimen_applicable_safety_v2 s
          where s.regimen_key=r.regimen_key
            and s.review_status in ('APPROVED','PROMOTED')
            and s.candidate_type='RESTRICTION'
            and s.domain_or_type='HEPATIC_RESTRICTION'
        )
      )
    ) as hepatic_flag_matches,
    exists (
      select 1 from drx_dose.rule_targets_v1 t
      where t.rule_id=r.rule_id and t.binding_status<>'RETIRED'
    ) as target_staged,
    exists (
      select 1 from drx_dose.rule_targets_v1 t
      where t.rule_id=r.rule_id and t.binding_status='VERIFIED'
    ) as target_verified,
    exists (
      select 1 from public.dose_indication_concepts_v3 i
      where i.indication_id=r.indication_id
        and i.editorial_status='published'
        and i.icd_verification_status='verified'
    ) as indication_verified
  from public.dose_rules_v3 r
  join drx_dose.source_regimen_candidates_v1 sr
    on sr.regimen_key=r.regimen_key
  join drx_dose.source_regimen_rule_materialization_preview_v2 m
    on m.regimen_key=r.regimen_key
   and m.branch_no=r.branch_no
   and m.step_no=r.step_no
  where r.regimen_key is not null
),
x as (
  select q.*,
    array_remove(array[
      case when q.regimen_review_status<>'APPROVED' then 'CLINICAL_REGIMEN_NOT_APPROVED' end,
      case when cardinality(q.materialization_blockers_v2)>0 then 'MATERIALIZATION_PREVIEW_BLOCKED' end,
      case when not q.structure_matches_preview then 'DRAFT_STRUCTURE_MISMATCH' end,
      case when not q.exact_evidence_verified then 'EXACT_EVIDENCE_NOT_VERIFIED' end,
      case when not q.safety_review_complete then 'SAFETY_REVIEW_INCOMPLETE' end,
      case when not q.renal_flag_matches then 'RENAL_FLAG_MISMATCH' end,
      case when not q.hepatic_flag_matches then 'HEPATIC_FLAG_MISMATCH' end,
      case when not q.target_staged then 'RULE_TARGET_NOT_STAGED' end,
      case when not q.indication_verified then 'INDICATION_NOT_PUBLISHED_ICD_VERIFIED' end
    ],null) as validation_blockers
  from q
)
select
  x.*,
  cardinality(x.validation_blockers)=0 as ready_for_structural_validation,
  (
    cardinality(x.validation_blockers)=0
    and x.safety_validation_status='passed'
    and x.target_verified
  ) as ready_for_rule_review,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from x;

create or replace function public.drx_phase11_validate_prepared_rule_v1(
  p_rule_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_gate drx_dose.phase11_prepared_rule_review_queue_v1%rowtype;
begin
  if p_rule_id is null then raise exception 'rule_id is required'; end if;
  if nullif(btrim(p_actor),'') is null then raise exception 'actor is required'; end if;

  select * into v_gate
  from drx_dose.phase11_prepared_rule_review_queue_v1
  where rule_id=p_rule_id;

  if not found then raise exception 'Prepared Phase 11 rule not found'; end if;
  if v_gate.editorial_status<>'draft' then
    raise exception 'Only DRAFT rules can run structural validation';
  end if;
  if v_gate.ready_for_structural_validation is not true then
    raise exception 'Prepared rule validation blocked: %',array_to_string(v_gate.validation_blockers,',');
  end if;

  update public.dose_rules_v3
  set safety_validation_status='passed',
      safety_validator_version='phase11-structural-v1',
      safety_validated_at=now(),
      updated_at=now()
  where rule_id=p_rule_id and editorial_status='draft';

  insert into drx_dose.prepared_rule_validation_events_v1(
    rule_id,actor,validator_version,validation_snapshot
  ) values (
    p_rule_id,btrim(p_actor),'phase11-structural-v1',to_jsonb(v_gate)
  );

  return jsonb_build_object(
    'ok',true,'ruleId',p_rule_id,'safetyValidationStatus','passed',
    'editorialStatus','draft','autoVerified',false,'autoPublished',false
  );
end;
$$;

create or replace function public.drx_phase11_review_rule_target_v1(
  p_rule_target_id uuid,
  p_decision text,
  p_reviewer text,
  p_attestation text,
  p_review_note text
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
  v_rule_id uuid;
  v_regimen_key text;
  v_branch integer;
  v_step integer;
  v_expected_moiety text;
  v_expected_kind text;
  v_expected_route text;
  v_expected_form text;
  v_expected_strength_mode text;
  v_expected_strength_value numeric;
  v_expected_strength_unit text;
begin
  if p_rule_target_id is null then raise exception 'rule_target_id is required'; end if;
  if v_decision not in ('VERIFIED','REJECTED') then
    raise exception 'Target decision must be VERIFIED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;
  if nullif(btrim(p_review_note),'') is null then raise exception 'review_note is required'; end if;
  if p_attestation<>'RULE_TARGET_REVIEW_ATTESTED' then
    raise exception 'Explicit rule-target review attestation is required';
  end if;

  select to_jsonb(t),t.rule_id,r.regimen_key,r.branch_no,r.step_no
  into v_before,v_rule_id,v_regimen_key,v_branch,v_step
  from drx_dose.rule_targets_v1 t
  join public.dose_rules_v3 r on r.rule_id=t.rule_id
  where t.rule_target_id=p_rule_target_id
  for update of t;

  if v_before is null then raise exception 'Rule target not found'; end if;

  if not exists (
    select 1 from drx_dose.source_regimen_candidates_v1
    where regimen_key=v_regimen_key and review_status='APPROVED'
  ) then
    raise exception 'Underlying clinical regimen is not APPROVED';
  end if;

  select
    sr.dose_moiety_key,
    sr.target_kind,
    coalesce(pr.required_route_key,sr.route_key),
    coalesce(pr.required_form_family,sr.form_family),
    case
      when sr.strength_match_mode='ANY_COMPATIBLE' then 'ANY_COMPATIBLE'
      when pr.presentation_policy='EXACT_STRENGTH' and pr.review_status='VERIFIED'
        then 'EXACT_STRENGTH'
      else 'MANUAL_REVIEW'
    end,
    case when pr.presentation_policy='EXACT_STRENGTH' and pr.review_status='VERIFIED'
      then pr.required_strength_value end,
    case when pr.presentation_policy='EXACT_STRENGTH' and pr.review_status='VERIFIED'
      then pr.required_strength_unit end
  into
    v_expected_moiety,v_expected_kind,v_expected_route,v_expected_form,
    v_expected_strength_mode,v_expected_strength_value,v_expected_strength_unit
  from drx_dose.source_regimen_candidates_v1 sr
  left join drx_dose.source_regimen_step_presentation_requirements_v1 pr
    on pr.regimen_key=sr.regimen_key
   and pr.branch_no=v_branch and pr.step_no=v_step
  where sr.regimen_key=v_regimen_key;

  if v_decision='VERIFIED' and not exists (
    select 1
    from drx_dose.rule_targets_v1 t
    where t.rule_target_id=p_rule_target_id
      and t.dose_moiety_key is not distinct from v_expected_moiety
      and t.target_kind is not distinct from v_expected_kind
      and cardinality(t.route_keys)=1
      and t.route_keys[1] is not distinct from v_expected_route
      and t.form_family is not distinct from v_expected_form
      and t.strength_match_mode is not distinct from v_expected_strength_mode
      and t.required_strength_value is not distinct from v_expected_strength_value
      and t.required_strength_unit is not distinct from v_expected_strength_unit
  ) then
    raise exception 'Rule target does not match reviewed source-regimen applicability';
  end if;

  update drx_dose.rule_targets_v1
  set binding_status=v_decision,
      verified_by=case when v_decision='VERIFIED' then btrim(p_reviewer) else null end,
      verified_at=case when v_decision='VERIFIED' then now() else null end,
      updated_at=now()
  where rule_target_id=p_rule_target_id;

  select to_jsonb(t) into v_after
  from drx_dose.rule_targets_v1 t
  where t.rule_target_id=p_rule_target_id;

  insert into drx_dose.rule_target_review_events_v1(
    rule_target_id,rule_id,decision,reviewer,review_note,before_state,after_state
  ) values (
    p_rule_target_id,v_rule_id,v_decision,btrim(p_reviewer),btrim(p_review_note),v_before,v_after
  );

  return jsonb_build_object(
    'ok',true,'ruleTargetId',p_rule_target_id,'decision',v_decision,
    'autoPublished',false
  );
end;
$$;

create or replace function public.drx_phase11_verify_prepared_rule_v1(
  p_rule_id uuid,
  p_reviewer text,
  p_attestation text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_gate drx_dose.phase11_prepared_rule_review_queue_v1%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if p_rule_id is null then raise exception 'rule_id is required'; end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;
  if nullif(btrim(p_review_note),'') is null then raise exception 'review_note is required'; end if;
  if p_attestation<>'PREPARED_RULE_REVIEW_ATTESTED' then
    raise exception 'Explicit prepared-rule review attestation is required';
  end if;

  select * into v_gate
  from drx_dose.phase11_prepared_rule_review_queue_v1
  where rule_id=p_rule_id;

  if not found then raise exception 'Prepared Phase 11 rule not found'; end if;
  if v_gate.editorial_status<>'draft' then
    raise exception 'Only DRAFT rules can be verified through this function';
  end if;
  if v_gate.ready_for_rule_review is not true then
    raise exception 'Prepared rule review blocked: %',
      array_to_string(
        array_cat(v_gate.validation_blockers,
          array_remove(array[
            case when v_gate.safety_validation_status<>'passed' then 'STRUCTURAL_VALIDATION_NOT_PASSED' end,
            case when not v_gate.target_verified then 'RULE_TARGET_NOT_VERIFIED' end
          ],null)
        ),','
      );
  end if;

  select to_jsonb(r) into v_before
  from public.dose_rules_v3 r where r.rule_id=p_rule_id;

  update public.dose_rules_v3
  set editorial_status='verified',
      verified_by=btrim(p_reviewer),
      verified_at=now(),
      updated_at=now()
  where rule_id=p_rule_id and editorial_status='draft';

  select to_jsonb(r) into v_after
  from public.dose_rules_v3 r where r.rule_id=p_rule_id;

  insert into drx_dose.prepared_rule_review_events_v1(
    rule_id,reviewer,review_note,before_state,after_state
  ) values (
    p_rule_id,btrim(p_reviewer),btrim(p_review_note),v_before,v_after
  );

  return jsonb_build_object(
    'ok',true,'ruleId',p_rule_id,'editorialStatus','verified',
    'autoPublished',false,'productBindingsCreated',false
  );
end;
$$;

create or replace view drx_dose.phase11_prepared_rule_summary_v1 as
select
  count(*) as prepared_rules,
  count(*) filter (where ready_for_structural_validation and safety_validation_status<>'passed')
    as structural_validation_ready,
  count(*) filter (where safety_validation_status='passed' and not target_verified)
    as target_review_required,
  count(*) filter (where ready_for_rule_review and editorial_status='draft')
    as rule_review_ready,
  count(*) filter (where editorial_status='verified') as verified_rules,
  count(*) filter (where editorial_status='published') as published_rules,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_prepared_rule_review_queue_v1;

alter table drx_dose.prepared_rule_validation_events_v1 enable row level security;
alter table drx_dose.rule_target_review_events_v1 enable row level security;
alter table drx_dose.prepared_rule_review_events_v1 enable row level security;

revoke all on drx_dose.prepared_rule_validation_events_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_target_review_events_v1 from public,anon,authenticated;
revoke all on drx_dose.prepared_rule_review_events_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_prepared_rule_review_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_prepared_rule_summary_v1 from public,anon,authenticated;
grant select on drx_dose.prepared_rule_validation_events_v1 to service_role;
grant select on drx_dose.rule_target_review_events_v1 to service_role;
grant select on drx_dose.prepared_rule_review_events_v1 to service_role;
grant select on drx_dose.phase11_prepared_rule_review_queue_v1 to service_role;
grant select on drx_dose.phase11_prepared_rule_summary_v1 to service_role;

revoke all on function public.drx_phase11_validate_prepared_rule_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_review_rule_target_v1(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_verify_prepared_rule_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.drx_phase11_validate_prepared_rule_v1(uuid,text) to service_role;
grant execute on function public.drx_phase11_review_rule_target_v1(uuid,text,text,text,text) to service_role;
grant execute on function public.drx_phase11_verify_prepared_rule_v1(uuid,text,text,text) to service_role;
