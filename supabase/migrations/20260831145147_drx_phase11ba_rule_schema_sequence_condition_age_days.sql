
-- DRx Phase 11BA: extend dose_rules_v3 so staged source regimens can preserve
-- neonatal age-in-days, sequence windows, branch identity and clinical-condition text.
-- Backward-compatible: new fields are nullable and runtime stays fail-closed.

alter table public.dose_rules_v3
  add column if not exists regimen_key text,
  add column if not exists regimen_kind text,
  add column if not exists branch_no integer,
  add column if not exists step_no integer,
  add column if not exists start_day integer,
  add column if not exists end_day integer,
  add column if not exists min_age_days numeric,
  add column if not exists max_age_days numeric,
  add column if not exists condition_text text,
  add column if not exists condition_review_required boolean not null default false,
  add column if not exists regimen_option_key text;

alter table public.dose_rules_v3
  drop constraint if exists dose_rules_v3_regimen_kind_check,
  add constraint dose_rules_v3_regimen_kind_check
    check (
      regimen_kind is null
      or regimen_kind in ('single_step','conditional','sequence','weight_band')
    ),
  drop constraint if exists dose_rules_v3_branch_no_check,
  add constraint dose_rules_v3_branch_no_check
    check (branch_no is null or branch_no >= 1),
  drop constraint if exists dose_rules_v3_step_no_check,
  add constraint dose_rules_v3_step_no_check
    check (step_no is null or step_no >= 1),
  drop constraint if exists dose_rules_v3_sequence_day_check,
  add constraint dose_rules_v3_sequence_day_check
    check (
      (start_day is null or start_day >= 1)
      and (end_day is null or end_day >= 1)
      and (start_day is null or end_day is null or start_day <= end_day)
    ),
  drop constraint if exists dose_rules_v3_age_days_check,
  add constraint dose_rules_v3_age_days_check
    check (
      (min_age_days is null or min_age_days >= 0)
      and (max_age_days is null or max_age_days >= 0)
      and (min_age_days is null or max_age_days is null or min_age_days <= max_age_days)
    ),
  drop constraint if exists dose_rules_v3_condition_review_check,
  add constraint dose_rules_v3_condition_review_check
    check (
      condition_review_required=false
      or nullif(btrim(condition_text),'') is not null
    );

create unique index if not exists dose_rules_v3_source_regimen_step_indication_uidx
  on public.dose_rules_v3(regimen_key,branch_no,step_no,indication_id)
  where regimen_key is not null and branch_no is not null and step_no is not null;

create index if not exists dose_rules_v3_sequence_idx
  on public.dose_rules_v3(regimen_key,start_day,end_day)
  where regimen_key is not null;

create index if not exists dose_rules_v3_age_days_idx
  on public.dose_rules_v3(min_age_days,max_age_days)
  where min_age_days is not null or max_age_days is not null;

drop view if exists drx_dose.source_regimen_rule_materialization_summary_v1;
drop view if exists drx_dose.source_regimen_rule_materialization_preview_v1;

create view drx_dose.source_regimen_rule_materialization_preview_v1 as
with base as (
  select
    r.regimen_key,r.target_kind,r.dose_moiety_key,r.substance_concept_id,
    r.indication_id,r.indication_key_candidate,r.indication_label,r.patient_group,
    r.route_key,r.form_family,r.regimen_kind,r.review_status as regimen_review_status,
    r.source_snapshot_id,r.source_section_sha256,r.source_url,
    snap.source_key,snap.document_version,snap.document_date,
    s.branch_no,s.step_no,s.start_day,s.end_day,
    s.min_age_days,s.max_age_days,s.min_age_months,s.max_age_months,
    s.min_weight_kg,s.max_weight_kg,s.calculation_method,
    s.dose_min_value,s.dose_max_value,s.dose_unit,
    s.frequency_mode,s.interval_min_hours,s.interval_max_hours,s.times_per_day,
    s.duration_min_days,s.duration_max_days,s.max_single_dose_mg,s.max_daily_dose_mg,
    s.condition_text,s.source_note,
    c.component_concept_id as dose_basis_component_concept_id
  from drx_dose.source_regimen_candidates_v1 r
  join drx_dose.source_regimen_steps_v1 s on s.regimen_key=r.regimen_key
  join public.dose_source_snapshots_v3 snap on snap.snapshot_id=r.source_snapshot_id
  left join lateral (
    select x.component_concept_id
    from drx_dose.source_regimen_step_components_v1 x
    where x.regimen_key=s.regimen_key
      and x.branch_no=s.branch_no
      and x.step_no=s.step_no
      and x.component_role='DOSE_BASIS'
    order by x.component_concept_id
    limit 1
  ) c on true
),
mapped as (
  select
    b.*,
    case
      when b.target_kind='SUBSTANCE' then b.substance_concept_id
      when b.target_kind='INGREDIENT_SET' then b.dose_basis_component_concept_id
      else null
    end as proposed_substance_concept_id,
    case when b.target_kind='INGREDIENT_SET' then 'component' else 'single_active' end
      as proposed_dose_basis_mode,
    case
      when b.calculation_method='dose_per_kg_per_day' then 'per_day'
      when b.calculation_method='dose_per_kg_per_dose' then 'per_dose'
      when b.calculation_method in ('fixed_dose','fixed_volume') then 'per_dose'
      else null
    end as proposed_dose_basis,
    case
      when b.calculation_method in ('dose_per_kg_per_day','dose_per_kg_per_dose') then 'kg'
      else 'none'
    end as proposed_weight_basis,
    case
      when b.duration_min_days is null and b.duration_max_days is null then 'none'
      when b.duration_min_days is not null and b.duration_max_days is not null
        and b.duration_min_days=b.duration_max_days then 'fixed_days'
      when b.duration_min_days is not null and b.duration_max_days is not null then 'range_days'
      else 'manual'
    end as proposed_duration_mode,
    array_remove(array[
      case when b.min_age_days is not null or b.max_age_days is not null then 'age_days' end,
      case when b.min_age_months is not null or b.max_age_months is not null then 'age_months' end,
      case
        when b.calculation_method in ('dose_per_kg_per_day','dose_per_kg_per_dose')
          or b.min_weight_kg is not null or b.max_weight_kg is not null
        then 'weight_kg'
      end,
      case when b.start_day is not null or b.end_day is not null then 'treatment_day' end,
      case
        when b.regimen_kind='conditional'
          and nullif(btrim(coalesce(b.condition_text,'')),'') is not null
        then 'clinical_variant'
      end
    ],null) as proposed_required_inputs,
    (
      b.regimen_kind='conditional'
      and nullif(btrim(coalesce(b.condition_text,'')),'') is not null
    ) as proposed_condition_review_required
  from base b
)
select
  m.*,
  upper(regexp_replace(
    concat('RULE-',m.regimen_key,'-B',m.branch_no,'-S',m.step_no),
    '[^A-Za-z0-9]+','-','g'
  )) as proposed_rule_key,
  concat(m.regimen_key,'-B',m.branch_no) as proposed_regimen_option_key,
  array_remove(array[
    case when m.indication_id is null then 'INDICATION_ID_MISSING' end,
    case when m.proposed_substance_concept_id is null then 'RULE_SUBSTANCE_OR_DOSE_BASIS_COMPONENT_MISSING' end,
    case when m.source_section_sha256 is null then 'SOURCE_SECTION_HASH_MISSING' end,
    case when m.calculation_method='manual_only' then 'MANUAL_ONLY_CANNOT_BE_PUBLISHED' end,
    case when m.frequency_mode='times_per_day' and m.times_per_day is null then 'TIMES_PER_DAY_MISSING' end,
    case when m.frequency_mode='interval' and m.interval_min_hours is null then 'INTERVAL_MIN_HOURS_MISSING' end
  ],null) as materialization_blockers,
  array_remove(array[
    case when m.min_age_days is not null or m.max_age_days is not null then 'AGE_DAYS_INPUT_REQUIRED' end,
    case when m.start_day is not null or m.end_day is not null then 'TREATMENT_DAY_INPUT_REQUIRED' end,
    case when m.proposed_condition_review_required then 'CLINICAL_VARIANT_SELECTION_REQUIRED' end
  ],null) as runtime_input_requirements,
  (
    m.indication_id is not null
    and m.proposed_substance_concept_id is not null
    and m.source_section_sha256 is not null
  ) as draft_shape_complete,
  false::boolean as auto_materialize_allowed,
  false::boolean as auto_publish_allowed
from mapped m;

create view drx_dose.source_regimen_rule_materialization_summary_v1 as
select
  count(*) as step_rows,
  count(*) filter (where draft_shape_complete) as draft_shape_complete_rows,
  count(*) filter (where cardinality(materialization_blockers)=0) as schema_modelled_rows,
  count(*) filter (where runtime_input_requirements @> array['AGE_DAYS_INPUT_REQUIRED']::text[]) as age_day_input_rows,
  count(*) filter (where runtime_input_requirements @> array['TREATMENT_DAY_INPUT_REQUIRED']::text[]) as sequence_input_rows,
  count(*) filter (where runtime_input_requirements @> array['CLINICAL_VARIANT_SELECTION_REQUIRED']::text[]) as clinical_variant_input_rows,
  count(*) filter (where materialization_blockers @> array['MANUAL_ONLY_CANNOT_BE_PUBLISHED']::text[]) as manual_only_rows,
  count(*) filter (where materialization_blockers @> array['RULE_SUBSTANCE_OR_DOSE_BASIS_COMPONENT_MISSING']::text[]) as identity_gap_rows,
  false::boolean as auto_materialize_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.source_regimen_rule_materialization_preview_v1;

revoke all on drx_dose.source_regimen_rule_materialization_preview_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_rule_materialization_summary_v1 from public,anon,authenticated;
grant select on drx_dose.source_regimen_rule_materialization_preview_v1 to service_role;
grant select on drx_dose.source_regimen_rule_materialization_summary_v1 to service_role;
