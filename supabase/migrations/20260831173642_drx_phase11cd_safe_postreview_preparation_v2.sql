CREATE OR REPLACE FUNCTION public.drx_phase11_materialize_approved_regimen_to_draft_v2(p_regimen_key text, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'drx_dose'
AS $function$
declare
  v_gate drx_dose.source_regimen_promotion_gate_v6%rowtype;
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

  if not exists (
    select 1 from drx_dose.source_regimen_candidates_v1
    where regimen_key=p_regimen_key and review_status='APPROVED'
  ) then
    raise exception 'Source regimen % must be clinically APPROVED before post-review preparation',p_regimen_key;
  end if;

  select * into v_gate
  from drx_dose.source_regimen_promotion_gate_v6
  where regimen_key=p_regimen_key;

  if not found then
    raise exception 'Unknown source regimen: %',p_regimen_key;
  end if;

  if v_gate.calculator_promotion_ready is not true then
    raise exception 'Source regimen % is not promotion-ready. Blockers: %',
      p_regimen_key, array_to_string(v_gate.promotion_blockers_v6,',');
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
        select 1 from drx_dose.source_regimen_applicable_safety_v2 x
        where x.regimen_key=s.regimen_key
          and x.candidate_type='ADJUSTMENT'
          and x.domain_or_type='RENAL'
          and x.review_status in ('APPROVED','PROMOTED')
      )
      or exists (
        select 1 from drx_dose.source_regimen_applicable_safety_v2 x
        where x.regimen_key=s.regimen_key
          and x.candidate_type='RESTRICTION'
          and x.domain_or_type='RENAL_RESTRICTION'
          and x.review_status in ('APPROVED','PROMOTED')
      ),
      exists (
        select 1 from drx_dose.source_regimen_applicable_safety_v2 x
        where x.regimen_key=s.regimen_key
          and x.candidate_type='ADJUSTMENT'
          and x.domain_or_type='HEPATIC'
          and x.review_status in ('APPROVED','PROMOTED')
      )
      or exists (
        select 1 from drx_dose.source_regimen_applicable_safety_v2 x
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
$function$
;

CREATE OR REPLACE FUNCTION public.drx_phase11_stage_rule_targets_for_regimen_v2(p_regimen_key text, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'drx_dose'
AS $function$
declare
  v_gate drx_dose.source_regimen_promotion_gate_v6%rowtype;
  v_target_ids uuid[];
  v_count integer;
begin
  if nullif(btrim(p_regimen_key),'') is null then
    raise exception 'regimen_key is required';
  end if;
  if nullif(btrim(p_actor),'') is null then
    raise exception 'actor is required';
  end if;

  if not exists (
    select 1 from drx_dose.source_regimen_candidates_v1
    where regimen_key=p_regimen_key and review_status='APPROVED'
  ) then
    raise exception 'Source regimen % must be clinically APPROVED before post-review preparation',p_regimen_key;
  end if;

  select * into v_gate
  from drx_dose.source_regimen_promotion_gate_v6
  where regimen_key=p_regimen_key;

  if not found then
    raise exception 'Unknown source regimen: %',p_regimen_key;
  end if;

  if v_gate.calculator_promotion_ready is not true then
    raise exception 'Source regimen % is not promotion-ready. Blockers: %',
      p_regimen_key,array_to_string(v_gate.promotion_blockers_v6,',');
  end if;

  with staged as (
    select
      r.rule_id,
      r.branch_no,
      r.step_no,
      r.dose_basis_component_concept_id,
      sr.target_kind,
      sr.substance_concept_id,
      sr.dose_moiety_concept_ids,
      coalesce(pr.required_form_family,sr.form_family) as target_form_family,
      pr.required_release_key as target_release_key,
      array[coalesce(pr.required_route_key,sr.route_key)]::text[] as target_route_keys,
      case
        when sr.strength_match_mode='ANY_COMPATIBLE' then 'ANY_COMPATIBLE'
        when pr.presentation_policy='EXACT_STRENGTH'
         and pr.review_status='VERIFIED'
          then 'EXACT_STRENGTH'
        else 'MANUAL_REVIEW'
      end as target_strength_match_mode,
      case
        when pr.presentation_policy='EXACT_STRENGTH'
         and pr.review_status='VERIFIED'
        then pr.required_strength_value
      end as target_strength_value,
      case
        when pr.presentation_policy='EXACT_STRENGTH'
         and pr.review_status='VERIFIED'
        then pr.required_strength_unit
      end as target_strength_unit,
      pr.presentation_policy
    from public.dose_rules_v3 r
    join drx_dose.source_regimen_candidates_v1 sr
      on sr.regimen_key=r.regimen_key
    left join drx_dose.source_regimen_step_presentation_requirements_v1 pr
      on pr.regimen_key=r.regimen_key
     and pr.branch_no=r.branch_no
     and pr.step_no=r.step_no
    where r.regimen_key=p_regimen_key
      and r.editorial_status in ('draft','in_review','verified','published')
  ),
  inserted as (
    insert into drx_dose.rule_targets_v1(
      rule_id,target_kind,substance_concept_id,ingredient_set_id,ingredient_concept_ids,
      dose_basis_component_concept_id,form_family,release_key,route_keys,
      required_clinical_variant_id,required_strength_hash,strength_match_mode,
      binding_status,verified_by,verified_at,
      dose_moiety_concept_ids,
      required_strength_value,required_strength_unit,presentation_policy
    )
    select
      s.rule_id,
      s.target_kind,
      case when s.target_kind='SUBSTANCE' then s.substance_concept_id end,
      null::uuid,
      '{}'::uuid[],
      s.dose_basis_component_concept_id,
      s.target_form_family,
      s.target_release_key,
      s.target_route_keys,
      null::uuid,
      null::text,
      s.target_strength_match_mode,
      'DRAFT',
      null::text,
      null::timestamptz,
      s.dose_moiety_concept_ids,
      s.target_strength_value,
      s.target_strength_unit,
      s.presentation_policy
    from staged s
    where not exists (
      select 1
      from drx_dose.rule_targets_v1 t
      where t.rule_id=s.rule_id
        and t.binding_status <> 'RETIRED'
    )
    returning rule_target_id
  )
  select
    coalesce(array_agg(rule_target_id order by rule_target_id),'{}'::uuid[]),
    count(*)::integer
  into v_target_ids,v_count
  from inserted;

  insert into drx_dose.rule_target_staging_events_v1(
    regimen_key,actor,staged_target_count,target_ids,gate_snapshot
  ) values (
    p_regimen_key,btrim(p_actor),v_count,v_target_ids,to_jsonb(v_gate)
  );

  return jsonb_build_object(
    'regimenKey',p_regimen_key,
    'stagedDraftTargets',v_count,
    'targetIds',v_target_ids,
    'bindingStatus','DRAFT',
    'autoVerified',false,
    'productBindingsCreated',false
  );
end;
$function$
;


create table if not exists drx_dose.text_only_regimen_finalizations_v1 (
  regimen_key text primary key
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete restrict,
  finalized_by text not null check (nullif(btrim(finalized_by),'') is not null),
  finalized_at timestamptz not null default now(),
  finalization_note text,
  calculator_rules_created boolean not null default false check (calculator_rules_created=false),
  runtime_mode text not null default 'TEXT_ONLY_REFERENCE'
    check (runtime_mode='TEXT_ONLY_REFERENCE')
);

create or replace function public.drx_phase11_finalize_reviewed_text_only_regimen_v1(
  p_regimen_key text,
  p_actor text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_gate drx_dose.source_regimen_promotion_gate_v6%rowtype;
  v_review_status text;
begin
  if nullif(btrim(p_regimen_key),'') is null then raise exception 'regimen_key is required'; end if;
  if nullif(btrim(p_actor),'') is null then raise exception 'actor is required'; end if;

  select review_status into v_review_status
  from drx_dose.source_regimen_candidates_v1
  where regimen_key=p_regimen_key;

  if not found then raise exception 'Unknown source regimen: %',p_regimen_key; end if;
  if v_review_status<>'APPROVED' then
    raise exception 'Text-only regimen % must be clinically APPROVED first',p_regimen_key;
  end if;

  select * into v_gate
  from drx_dose.source_regimen_promotion_gate_v6
  where regimen_key=p_regimen_key;

  if v_gate.intended_runtime_mode<>'REVIEWED_TEXT_ONLY_TARGET' then
    raise exception 'Regimen % is not an intentional text-only target',p_regimen_key;
  end if;
  if v_gate.text_only_review_ready is not true then
    raise exception 'Text-only regimen % is not review-ready. Blockers: %',
      p_regimen_key,array_to_string(v_gate.promotion_blockers_v6,',');
  end if;

  insert into drx_dose.text_only_regimen_finalizations_v1(
    regimen_key,finalized_by,finalized_at,finalization_note
  ) values (
    p_regimen_key,btrim(p_actor),now(),p_note
  )
  on conflict (regimen_key) do update
  set finalized_by=excluded.finalized_by,
      finalized_at=excluded.finalized_at,
      finalization_note=excluded.finalization_note;

  return jsonb_build_object(
    'ok',true,'regimenKey',p_regimen_key,'runtimeMode','TEXT_ONLY_REFERENCE',
    'calculatorRulesCreated',false,'autoPublished',false
  );
end;
$$;

create or replace function public.drx_phase11_prepare_reviewed_regimen_v2(
  p_regimen_key text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_gate drx_dose.source_regimen_promotion_gate_v6%rowtype;
  v_review_status text;
  v_rules jsonb;
  v_targets jsonb;
begin
  if nullif(btrim(p_regimen_key),'') is null then raise exception 'regimen_key is required'; end if;
  if nullif(btrim(p_actor),'') is null then raise exception 'actor is required'; end if;

  select review_status into v_review_status
  from drx_dose.source_regimen_candidates_v1
  where regimen_key=p_regimen_key;
  if not found then raise exception 'Unknown source regimen: %',p_regimen_key; end if;
  if v_review_status<>'APPROVED' then
    raise exception 'Regimen % must be clinically APPROVED before draft preparation',p_regimen_key;
  end if;

  select * into v_gate
  from drx_dose.source_regimen_promotion_gate_v6
  where regimen_key=p_regimen_key;
  if not found then raise exception 'Promotion gate missing for regimen %',p_regimen_key; end if;

  if v_gate.intended_runtime_mode<>'CALCULATOR_TARGET' then
    raise exception 'Regimen % is text-only; finalize it without calculator rules',p_regimen_key;
  end if;
  if v_gate.calculator_promotion_ready is not true then
    raise exception 'Regimen % is not calculator-promotion-ready. Blockers: %',
      p_regimen_key,array_to_string(v_gate.promotion_blockers_v6,',');
  end if;

  v_rules := public.drx_phase11_materialize_approved_regimen_to_draft_v2(p_regimen_key,p_actor);
  v_targets := public.drx_phase11_stage_rule_targets_for_regimen_v2(p_regimen_key,p_actor);

  return jsonb_build_object(
    'ok',true,'regimenKey',p_regimen_key,'destination','CALCULATOR_V3',
    'rules',v_rules,'targets',v_targets,'editorialStatus','draft',
    'autoPublished',false,'autoVerifiedTargets',false,'productBindingsCreated',false
  );
end;
$$;

create or replace view drx_dose.phase11_postreview_preparation_queue_v1 as
with prepared as (
  select regimen_key,count(*) as prepared_rule_count
  from public.dose_rules_v3
  where regimen_key is not null
    and editorial_status in ('draft','in_review','verified','published')
  group by regimen_key
),
finalized as (
  select regimen_key from drx_dose.text_only_regimen_finalizations_v1
)
select
  r.regimen_key,r.review_status,g.intended_runtime_mode,
  g.calculator_promotion_ready,g.text_only_review_ready,g.promotion_blockers_v6,
  coalesce(p.prepared_rule_count,0) as prepared_rule_count,
  (f.regimen_key is not null) as text_only_finalized,
  case
    when r.review_status<>'APPROVED' then 'CLINICAL_REVIEW_REQUIRED'
    when g.intended_runtime_mode='REVIEWED_TEXT_ONLY_TARGET'
      and f.regimen_key is null and g.text_only_review_ready then 'FINALIZE_TEXT_ONLY'
    when g.intended_runtime_mode='REVIEWED_TEXT_ONLY_TARGET'
      and f.regimen_key is not null then 'TEXT_ONLY_FINALIZED'
    when g.intended_runtime_mode='CALCULATOR_TARGET'
      and coalesce(p.prepared_rule_count,0)>0 then 'REVIEW_PREPARED_DRAFTS'
    when g.intended_runtime_mode='CALCULATOR_TARGET'
      and g.calculator_promotion_ready then 'PREPARE_CALCULATOR_DRAFTS'
    else 'BLOCKED_AFTER_APPROVAL'
  end as next_action,
  false::boolean as auto_publish_allowed
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_regimen_promotion_gate_v6 g using(regimen_key)
left join prepared p using(regimen_key)
left join finalized f using(regimen_key);

create or replace view drx_dose.phase11_postreview_preparation_summary_v1 as
select
  count(*) as regimen_total,
  count(*) filter (where next_action='CLINICAL_REVIEW_REQUIRED') as clinical_review_required,
  count(*) filter (where next_action='PREPARE_CALCULATOR_DRAFTS') as calculator_drafts_to_prepare,
  count(*) filter (where next_action='REVIEW_PREPARED_DRAFTS') as prepared_drafts_to_review,
  count(*) filter (where next_action='FINALIZE_TEXT_ONLY') as text_only_to_finalize,
  count(*) filter (where next_action='TEXT_ONLY_FINALIZED') as text_only_finalized,
  count(*) filter (where next_action='BLOCKED_AFTER_APPROVAL') as blocked_after_approval,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_postreview_preparation_queue_v1;

alter table drx_dose.text_only_regimen_finalizations_v1 enable row level security;
revoke all on drx_dose.text_only_regimen_finalizations_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_postreview_preparation_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_postreview_preparation_summary_v1 from public,anon,authenticated;
grant select on drx_dose.text_only_regimen_finalizations_v1 to service_role;
grant select on drx_dose.phase11_postreview_preparation_queue_v1 to service_role;
grant select on drx_dose.phase11_postreview_preparation_summary_v1 to service_role;

revoke all on function public.drx_phase11_materialize_approved_regimen_to_draft_v2(text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_stage_rule_targets_for_regimen_v2(text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_prepare_reviewed_regimen_v2(text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_finalize_reviewed_text_only_regimen_v1(text,text,text) from public,anon,authenticated;

grant execute on function public.drx_phase11_materialize_approved_regimen_to_draft_v2(text,text) to service_role;
grant execute on function public.drx_phase11_stage_rule_targets_for_regimen_v2(text,text) to service_role;
grant execute on function public.drx_phase11_prepare_reviewed_regimen_v2(text,text) to service_role;
grant execute on function public.drx_phase11_finalize_reviewed_text_only_regimen_v1(text,text,text) to service_role;
