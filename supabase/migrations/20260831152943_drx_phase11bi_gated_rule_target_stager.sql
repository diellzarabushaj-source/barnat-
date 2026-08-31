
-- DRx Phase 11BI: stage canonical rule targets after a regimen has passed promotion.
-- Creates DRAFT targets only. It never verifies a target or binds a product.

create table if not exists drx_dose.rule_target_staging_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  regimen_key text not null
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete restrict,
  actor text not null check (nullif(btrim(actor),'') is not null),
  staged_target_count integer not null check (staged_target_count >= 0),
  target_ids uuid[] not null default '{}'::uuid[],
  gate_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.drx_phase11_stage_rule_targets_for_regimen_v1(
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
  v_target_ids uuid[];
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
      p_regimen_key,array_to_string(v_gate.promotion_blockers_v4,',');
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
         and pr.review_status in ('APPROVED','PROMOTED')
          then 'EXACT_STRENGTH'
        else 'MANUAL_REVIEW'
      end as target_strength_match_mode,
      case
        when pr.presentation_policy='EXACT_STRENGTH'
         and pr.review_status in ('APPROVED','PROMOTED')
        then pr.required_strength_value
      end as target_strength_value,
      case
        when pr.presentation_policy='EXACT_STRENGTH'
         and pr.review_status in ('APPROVED','PROMOTED')
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
$$;

alter table drx_dose.rule_target_staging_events_v1 enable row level security;
revoke all on drx_dose.rule_target_staging_events_v1 from public,anon,authenticated;
grant select on drx_dose.rule_target_staging_events_v1 to service_role;

revoke all on function public.drx_phase11_stage_rule_targets_for_regimen_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_stage_rule_targets_for_regimen_v1(text,text)
  to service_role;
