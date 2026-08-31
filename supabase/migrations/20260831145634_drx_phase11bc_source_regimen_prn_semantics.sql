
-- DRx Phase 11BC: preserve explicit PRN/as-required semantics from captured SmPCs.
-- Keep materialization preview v1 stable; expose richer semantics in preview v2.

alter table drx_dose.source_regimen_steps_v1
  add column if not exists prn boolean not null default false,
  add column if not exists max_doses_24h numeric;

alter table drx_dose.source_regimen_steps_v1
  drop constraint if exists source_regimen_steps_v1_max_doses_24h_check,
  add constraint source_regimen_steps_v1_max_doses_24h_check
    check (max_doses_24h is null or max_doses_24h > 0);

update drx_dose.source_regimen_steps_v1
set prn=true,max_doses_24h=4
where regimen_key='SRC-IBU-400P-PF-12PLUS' and branch_no=1 and step_no=1;

update drx_dose.source_regimen_steps_v1
set prn=true,max_doses_24h=3
where regimen_key='SRC-IBU-400P-MIGRAINE-12PLUS' and branch_no=1 and step_no=1;

update drx_dose.source_regimen_steps_v1
set prn=true,max_doses_24h=3
where regimen_key='SRC-IBU-400P-DYSMENORRHOEA-12PLUS' and branch_no=1 and step_no=1;

update drx_dose.source_regimen_steps_v1
set prn=true,max_doses_24h=3
where regimen_key='SRC-IBU-400POM-PF-20TO29KG' and branch_no=1 and step_no=1;

update drx_dose.source_regimen_steps_v1
set prn=true,max_doses_24h=4
where regimen_key='SRC-IBU-400POM-PF-30TO90KG-AGE10TO11' and branch_no=1 and step_no=1;

update drx_dose.source_regimen_steps_v1
set prn=true,max_doses_24h=3
where regimen_key='SRC-IBU-200GSL-PAIN-FEVER-12PLUS' and branch_no=1 and step_no=1;

update drx_dose.source_regimen_steps_v1
set prn=true,max_doses_24h=1
where regimen_key='SRC-PANTO20-GERD-SYMPTOMATIC-12PLUS' and branch_no=2 and step_no=1;

create or replace view drx_dose.source_regimen_rule_materialization_preview_v2 as
select
  v1.*,
  s.prn,
  s.max_doses_24h,
  array_remove(array[
    case
      when s.prn and s.interval_min_hours is null and s.max_doses_24h is null
      then 'PRN_CEILING_MISSING'
    end
  ],null) as additional_materialization_blockers,
  array_cat(
    v1.materialization_blockers,
    array_remove(array[
      case
        when s.prn and s.interval_min_hours is null and s.max_doses_24h is null
        then 'PRN_CEILING_MISSING'
      end
    ],null)
  ) as materialization_blockers_v2
from drx_dose.source_regimen_rule_materialization_preview_v1 v1
join drx_dose.source_regimen_steps_v1 s
  on s.regimen_key=v1.regimen_key
 and s.branch_no=v1.branch_no
 and s.step_no=v1.step_no;

create or replace view drx_dose.source_regimen_rule_materialization_summary_v2 as
select
  count(*) as step_rows,
  count(*) filter (where draft_shape_complete) as draft_shape_complete_rows,
  count(*) filter (where cardinality(materialization_blockers_v2)=0) as schema_modelled_rows,
  count(*) filter (where prn) as prn_rows,
  count(*) filter (where runtime_input_requirements @> array['AGE_DAYS_INPUT_REQUIRED']::text[]) as age_day_input_rows,
  count(*) filter (where runtime_input_requirements @> array['TREATMENT_DAY_INPUT_REQUIRED']::text[]) as sequence_input_rows,
  count(*) filter (where runtime_input_requirements @> array['CLINICAL_VARIANT_SELECTION_REQUIRED']::text[]) as clinical_variant_input_rows,
  count(*) filter (where materialization_blockers_v2 @> array['MANUAL_ONLY_CANNOT_BE_PUBLISHED']::text[]) as manual_only_rows,
  count(*) filter (where materialization_blockers_v2 @> array['PRN_CEILING_MISSING']::text[]) as prn_ceiling_gap_rows,
  false::boolean as auto_materialize_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.source_regimen_rule_materialization_preview_v2;

revoke all on drx_dose.source_regimen_rule_materialization_preview_v2 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_rule_materialization_summary_v2 from public,anon,authenticated;
grant select on drx_dose.source_regimen_rule_materialization_preview_v2 to service_role;
grant select on drx_dose.source_regimen_rule_materialization_summary_v2 to service_role;
