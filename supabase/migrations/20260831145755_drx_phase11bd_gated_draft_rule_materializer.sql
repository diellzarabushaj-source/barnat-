
-- DRx Phase 11BD: final promotion gate v4 + gated source-regimen -> dose_rules_v3
-- draft materializer. It cannot approve, verify, publish or bind products.

create or replace view drx_dose.source_regimen_promotion_gate_v4 as
with q as (
  select
    g.regimen_key,
    g.substance_concept_id,
    g.indication_id,
    g.indication_key_candidate,
    g.indication_label,
    g.patient_group,
    g.route_key,
    g.form_family,
    g.regimen_kind,
    g.review_status,
    g.structurally_complete,
    g.indication_editorial_status,
    g.icd_verification_status,
    g.evidence_count,
    g.primary_evidence_count,
    g.unverified_evidence_count,
    g.presentation_requirement_count,
    g.unverified_presentation_count,
    g.administration_requirement_count,
    g.unverified_administration_count,
    g.linked_indication_count,
    g.blocked_linked_indication_count,
    g.promotion_blockers,
    (select count(*) from drx_dose.source_regimen_applicable_safety_v1 s
      where s.regimen_key=g.regimen_key) as applicable_safety_count,
    (select count(*) from drx_dose.source_regimen_applicable_safety_v1 s
      where s.regimen_key=g.regimen_key
        and s.review_status not in ('APPROVED','PROMOTED','REJECTED')) as pending_safety_count,
    (select count(*) from drx_dose.source_regimen_rule_materialization_preview_v2 m
      where m.regimen_key=g.regimen_key) as materialization_step_count,
    (select count(*) from drx_dose.source_regimen_rule_materialization_preview_v2 m
      where m.regimen_key=g.regimen_key
        and cardinality(m.materialization_blockers_v2)>0) as blocked_materialization_step_count
  from drx_dose.source_regimen_promotion_gate_v2 g
)
select
  q.*,
  array_cat(
    q.promotion_blockers,
    array_remove(array[
      case when q.pending_safety_count>0 then 'SAFETY_CANDIDATE_REVIEW' end,
      case when q.materialization_step_count=0 then 'RULE_MATERIALIZATION_SHAPE_MISSING' end,
      case when q.blocked_materialization_step_count>0 then 'RULE_MATERIALIZATION_BLOCKED' end
    ],null)
  ) as promotion_blockers_v4,
  (
    cardinality(q.promotion_blockers)=0
    and q.pending_safety_count=0
    and q.materialization_step_count>0
    and q.blocked_materialization_step_count=0
  ) as promotion_ready_v4,
  false::boolean as auto_materialize_allowed,
  false::boolean as auto_publish_allowed,
  false::boolean as runtime_ready
from q;

create table if not exists drx_dose.source_regimen_materialization_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  regimen_key text not null
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete restrict,
  actor text not null check (nullif(btrim(actor),'') is not null),
  materialized_rule_count integer not null check (materialized_rule_count >= 0),
  rule_ids uuid[] not null default '{}'::uuid[],
  rule_keys text[] not null default '{}'::text[],
  gate_version text not null default 'source_regimen_promotion_gate_v4',
  gate_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.drx_phase11_materialize_approved_regimen_to_draft_v1(
  p_regimen_key text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_gate drx_dose.source_regimen_promotion_gate_v4%rowtype;
  v_rule_ids uuid[];
  v_rule_keys text[];
  v_count integer;
begin
  if nullif(btrim(p_regimen_key),'') is null then
    raise exception 'regimen_key is required';
  end if;
  if nullif(btrim(p_actor),'') is null then
    raise exception 'actor is required';
  end if;

  select * into v_gate
  from drx_dose.source_regimen_promotion_gate_v4
  where regimen_key=p_regimen_key;

  if not found then
    raise exception 'Unknown source regimen: %',p_regimen_key;
  end if;

  if v_gate.promotion_ready_v4 is not true then
    raise exception 'Source regimen % is not promotion-ready. Blockers: %',
      p_regimen_key, array_to_string(v_gate.promotion_blockers_v4,',');
  end if;

  with indications as (
    select r.indication_id
    from drx_dose.source_regimen_candidates_v1 r
    join public.dose_indication_concepts_v3 i
      on i.indication_id=r.indication_id
     and i.editorial_status='published'
    where r.regimen_key=p_regimen_key

    union

    select l.indication_id
    from drx_dose.source_regimen_indication_links_v1 l
    join public.dose_indication_concepts_v3 i
      on i.indication_id=l.indication_id
     and i.editorial_status='published'
    where l.regimen_key=p_regimen_key
      and l.link_status='VERIFIED'
  ),
  source_rows as (
    select
      m.*,
      i.indication_id as materialized_indication_id,
      upper(regexp_replace(
        concat(
          'RULE-',m.regimen_key,'-B',m.branch_no,'-S',m.step_no,
          '-I-',substr(md5(i.indication_id::text),1,10)
        ),
        '[^A-Za-z0-9]+','-','g'
      )) as materialized_rule_key
    from drx_dose.source_regimen_rule_materialization_preview_v2 m
    cross join indications i
    where m.regimen_key=p_regimen_key
      and cardinality(m.materialization_blockers_v2)=0
  ),
  inserted as (
    insert into public.dose_rules_v3(
      rule_key,substance_concept_id,indication_id,patient_group,
      calculation_method,dose_min_value,dose_max_value,dose_unit,
      dose_basis,weight_basis,frequency_mode,interval_min_hours,interval_max_hours,
      times_per_day,max_single_dose_mg,max_daily_dose_mg,max_doses_24h,
      duration_mode,duration_min_days,duration_max_days,
      min_age_months,max_age_months,min_age_days,max_age_days,
      min_weight_kg,max_weight_kg,route,pharmaceutical_form,prn,
      renal_adjustment_required,hepatic_adjustment_required,cardiac_adjustment_required,
      specialist_only,out_of_range_action,required_inputs,
      dose_basis_mode,dose_basis_component_concept_id,
      source_key,source_snapshot_id,source_section,source_section_sha256,
      source_evidence_hash,source_document_version,source_document_date,
      confidence_score,review_class,safety_validation_status,editorial_status,
      regimen_key,regimen_kind,branch_no,step_no,start_day,end_day,
      condition_text,condition_review_required,regimen_option_key
    )
    select
      s.materialized_rule_key,
      s.proposed_substance_concept_id,
      s.materialized_indication_id,
      s.patient_group,
      s.calculation_method,
      s.dose_min_value,s.dose_max_value,s.dose_unit,
      s.proposed_dose_basis,s.proposed_weight_basis,
      s.frequency_mode,s.interval_min_hours,s.interval_max_hours,s.times_per_day,
      s.max_single_dose_mg,s.max_daily_dose_mg,s.max_doses_24h,
      s.proposed_duration_mode,s.duration_min_days,s.duration_max_days,
      s.min_age_months,s.max_age_months,s.min_age_days,s.max_age_days,
      s.min_weight_kg,s.max_weight_kg,s.route_key,s.form_family,s.prn,
      exists (
        select 1 from drx_dose.source_regimen_applicable_safety_v1 x
        where x.regimen_key=s.regimen_key
          and x.candidate_type='ADJUSTMENT'
          and x.domain_or_type='RENAL'
          and x.review_status in ('APPROVED','PROMOTED')
      )
      or exists (
        select 1 from drx_dose.source_regimen_applicable_safety_v1 x
        where x.regimen_key=s.regimen_key
          and x.candidate_type='RESTRICTION'
          and x.domain_or_type='RENAL_RESTRICTION'
          and x.review_status in ('APPROVED','PROMOTED')
      ),
      exists (
        select 1 from drx_dose.source_regimen_applicable_safety_v1 x
        where x.regimen_key=s.regimen_key
          and x.candidate_type='ADJUSTMENT'
          and x.domain_or_type='HEPATIC'
          and x.review_status in ('APPROVED','PROMOTED')
      )
      or exists (
        select 1 from drx_dose.source_regimen_applicable_safety_v1 x
        where x.regimen_key=s.regimen_key
          and x.candidate_type='RESTRICTION'
          and x.domain_or_type='HEPATIC_RESTRICTION'
          and x.review_status in ('APPROVED','PROMOTED')
      ),
      false,
      false,
      case when s.proposed_condition_review_required then 'manual_review' else 'block' end,
      s.proposed_required_inputs,
      s.proposed_dose_basis_mode,
      case when s.proposed_dose_basis_mode='component'
        then s.dose_basis_component_concept_id else null end,
      s.source_key,s.source_snapshot_id,'4.2',s.source_section_sha256,
      s.source_snapshot_id,s.document_version,s.document_date,
      null,'phase11_source_regimen_materialized_draft','pending','draft',
      s.regimen_key,s.regimen_kind,s.branch_no,s.step_no,s.start_day,s.end_day,
      s.condition_text,s.proposed_condition_review_required,s.proposed_regimen_option_key
    from source_rows s
    on conflict (rule_key) do update set
      updated_at=now()
    where public.dose_rules_v3.editorial_status='draft'
    returning rule_id,rule_key
  )
  select
    coalesce(array_agg(rule_id order by rule_key),'{}'::uuid[]),
    coalesce(array_agg(rule_key order by rule_key),'{}'::text[]),
    count(*)::integer
  into v_rule_ids,v_rule_keys,v_count
  from inserted;

  insert into drx_dose.source_regimen_materialization_events_v1(
    regimen_key,actor,materialized_rule_count,rule_ids,rule_keys,gate_snapshot
  ) values (
    p_regimen_key,btrim(p_actor),v_count,v_rule_ids,v_rule_keys,
    to_jsonb(v_gate)
  );

  return jsonb_build_object(
    'regimenKey',p_regimen_key,
    'materializedDraftRules',v_count,
    'ruleIds',v_rule_ids,
    'ruleKeys',v_rule_keys,
    'editorialStatus','draft',
    'safetyValidationStatus','pending',
    'autoPublished',false,
    'productBindingsCreated',false
  );
end;
$$;

alter table drx_dose.source_regimen_materialization_events_v1 enable row level security;
revoke all on drx_dose.source_regimen_materialization_events_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_promotion_gate_v4 from public,anon,authenticated;
grant select on drx_dose.source_regimen_materialization_events_v1 to service_role;
grant select on drx_dose.source_regimen_promotion_gate_v4 to service_role;

revoke all on function public.drx_phase11_materialize_approved_regimen_to_draft_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_materialize_approved_regimen_to_draft_v1(text,text)
  to service_role;
