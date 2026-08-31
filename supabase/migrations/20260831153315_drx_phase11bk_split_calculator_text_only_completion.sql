
-- DRx Phase 11BK: separate calculator promotion from intentional text-only
-- disposition and add a one-call reviewed-regimen preparation function.

create or replace view drx_dose.source_regimen_promotion_gate_v5 as
with d as (
  select
    g.*,
    x.intended_runtime_mode,
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
  join drx_dose.source_regimen_non_calculable_disposition_v1 x
    on x.regimen_key=g.regimen_key
)
select
  d.*,
  case
    when d.intended_runtime_mode='CALCULATOR_TARGET' then 'CALCULATOR_V3'
    else 'TEXT_ONLY_REFERENCE'
  end as promotion_destination,
  array_cat(
    d.promotion_blockers,
    array_remove(array[
      case when d.pending_safety_count>0 then 'SAFETY_CANDIDATE_REVIEW' end,
      case
        when d.intended_runtime_mode='CALCULATOR_TARGET'
         and d.materialization_step_count=0
        then 'RULE_MATERIALIZATION_SHAPE_MISSING'
      end,
      case
        when d.intended_runtime_mode='CALCULATOR_TARGET'
         and d.blocked_materialization_step_count>0
        then 'RULE_MATERIALIZATION_BLOCKED'
      end
    ],null)
  ) as promotion_blockers_v5,
  (
    d.intended_runtime_mode='CALCULATOR_TARGET'
    and cardinality(d.promotion_blockers)=0
    and d.pending_safety_count=0
    and d.materialization_step_count>0
    and d.blocked_materialization_step_count=0
  ) as calculator_promotion_ready,
  (
    d.intended_runtime_mode='REVIEWED_TEXT_ONLY_TARGET'
    and cardinality(d.promotion_blockers)=0
    and d.pending_safety_count=0
  ) as text_only_review_ready
from d;

create or replace function public.drx_phase11_prepare_reviewed_regimen_v1(
  p_regimen_key text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_gate drx_dose.source_regimen_promotion_gate_v5%rowtype;
  v_rules jsonb;
  v_targets jsonb;
begin
  if nullif(btrim(p_regimen_key),'') is null then
    raise exception 'regimen_key is required';
  end if;
  if nullif(btrim(p_actor),'') is null then
    raise exception 'actor is required';
  end if;

  select * into v_gate
  from drx_dose.source_regimen_promotion_gate_v5
  where regimen_key=p_regimen_key;

  if not found then
    raise exception 'Unknown source regimen: %',p_regimen_key;
  end if;

  if v_gate.intended_runtime_mode <> 'CALCULATOR_TARGET' then
    raise exception 'Regimen % is intentionally text-only and must not be materialized as calculator rules',
      p_regimen_key;
  end if;

  if v_gate.calculator_promotion_ready is not true then
    raise exception 'Regimen % is not calculator-promotion-ready. Blockers: %',
      p_regimen_key,array_to_string(v_gate.promotion_blockers_v5,',');
  end if;

  v_rules := public.drx_phase11_materialize_approved_regimen_to_draft_v1(
    p_regimen_key,p_actor
  );
  v_targets := public.drx_phase11_stage_rule_targets_for_regimen_v1(
    p_regimen_key,p_actor
  );

  return jsonb_build_object(
    'regimenKey',p_regimen_key,
    'destination','CALCULATOR_V3',
    'rules',v_rules,
    'targets',v_targets,
    'autoPublished',false,
    'autoVerifiedTargets',false,
    'productBindingsCreated',false
  );
end;
$$;

create or replace view drx_dose.phase11_completion_checklist_v2 as
with old as (
  select check_key,stage,current_value,target_value,ready,meaning,auto_override_allowed
  from drx_dose.phase11_completion_checklist_v1
  where check_key <> 'PROMOTION_GATE_READY'
),
calc as (
  select
    count(*) filter (where intended_runtime_mode='CALCULATOR_TARGET')::numeric as calculator_targets,
    count(*) filter (where intended_runtime_mode='REVIEWED_TEXT_ONLY_TARGET')::numeric as text_only_targets
  from drx_dose.source_regimen_non_calculable_disposition_v1
),
gate as (
  select
    count(*) filter (where calculator_promotion_ready)::numeric as calculator_ready,
    count(*) filter (where text_only_review_ready)::numeric as text_only_ready
  from drx_dose.source_regimen_promotion_gate_v5
),
mat as (
  select * from drx_dose.source_regimen_rule_materialization_summary_v2
),
shell as (
  select
    count(*)::numeric as strict_candidate_products,
    count(*) filter (where next_action='SHELL_PUBLISHED')::numeric as published_shells
  from drx_dose.product_shell_provisioning_queue_v1
)
select * from old
union all
select
  'CALCULATOR_RULE_SHAPE','foundation',
  mat.schema_modelled_rows::numeric,
  (mat.step_rows-mat.manual_only_rows)::numeric,
  mat.schema_modelled_rows=(mat.step_rows-mat.manual_only_rows),
  'All non-text-only source steps fit the typed calculator rule schema.',
  false
from mat
union all
select
  'TEXT_ONLY_DISPOSITION','foundation',
  calc.text_only_targets,2::numeric,
  calc.text_only_targets=2,
  'Intentionally non-calculable regimens are explicitly separated from calculator promotion.',
  false
from calc
union all
select
  'PRN_CEILINGS','foundation',
  (mat.prn_rows-mat.prn_ceiling_gap_rows)::numeric,
  mat.prn_rows::numeric,
  mat.prn_ceiling_gap_rows=0,
  'Every staged PRN regimen has an explicit interval or 24-hour ceiling.',
  false
from mat
union all
select
  'CALCULATOR_PROMOTION_READY','promotion',
  gate.calculator_ready,calc.calculator_targets,
  gate.calculator_ready=calc.calculator_targets,
  'All calculator-target regimens passed clinical, evidence, safety and materialization gates.',
  false
from gate cross join calc
union all
select
  'TEXT_ONLY_REVIEW_READY','promotion',
  gate.text_only_ready,calc.text_only_targets,
  gate.text_only_ready=calc.text_only_targets,
  'Text-only regimens completed clinical/evidence/safety review without being forced into a calculator.',
  false
from gate cross join calc
union all
select
  'STRICT_CANDIDATE_PRODUCT_SHELLS','promotion',
  shell.published_shells,shell.strict_candidate_products,
  shell.published_shells=shell.strict_candidate_products,
  'Every current strict product-inheritance candidate has a published V3 product shell.',
  false
from shell;

create or replace view drx_dose.phase11_completion_summary_v2 as
select
  bool_and(ready) filter (where stage='foundation') as foundation_complete,
  bool_and(ready) filter (where stage='clinical_review') as clinical_review_complete,
  bool_and(ready) filter (where stage='promotion') as promotion_complete,
  bool_and(ready) filter (where stage='runtime') as runtime_complete,
  count(*) filter (where stage='foundation' and not ready) as foundation_blockers,
  count(*) filter (where stage='clinical_review' and not ready) as clinical_review_blockers,
  count(*) filter (where stage='promotion' and not ready) as promotion_blockers,
  count(*) filter (where stage='runtime' and not ready) as runtime_blockers,
  array_agg(check_key order by stage,check_key) filter (where not ready) as blocking_checks,
  false::boolean as auto_finish_allowed
from drx_dose.phase11_completion_checklist_v2;

revoke all on drx_dose.source_regimen_promotion_gate_v5 from public,anon,authenticated;
revoke all on drx_dose.phase11_completion_checklist_v2 from public,anon,authenticated;
revoke all on drx_dose.phase11_completion_summary_v2 from public,anon,authenticated;
grant select on drx_dose.source_regimen_promotion_gate_v5 to service_role;
grant select on drx_dose.phase11_completion_checklist_v2 to service_role;
grant select on drx_dose.phase11_completion_summary_v2 to service_role;

revoke all on function public.drx_phase11_prepare_reviewed_regimen_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_prepare_reviewed_regimen_v1(text,text)
  to service_role;
