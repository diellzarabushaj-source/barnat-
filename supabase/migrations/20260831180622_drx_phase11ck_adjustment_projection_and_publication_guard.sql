-- DRx Phase 11CK: reviewed adjustment projection + publication guard.
-- Fail-closed: no source adjustment is auto-approved, auto-materialized, auto-applied or auto-published.

alter table public.dose_renal_adjustments_v3
  add column if not exists max_daily_dose_mg numeric,
  add column if not exists phase11_source_adjustment_key text;

alter table public.dose_hepatic_adjustments_v3
  add column if not exists max_daily_dose_mg numeric,
  add column if not exists phase11_source_adjustment_key text;

alter table public.dose_renal_adjustments_v3
  drop constraint if exists dose_renal_adjustments_v3_action_check,
  add constraint dose_renal_adjustments_v3_action_check
    check (dose_action in ('no_adjustment','reduce_dose','extend_interval','avoid','contraindicated','specialist_review','max_daily_cap')),
  add constraint dose_renal_adjustments_v3_max_daily_cap_check
    check (dose_action <> 'max_daily_cap' or (max_daily_dose_mg is not null and max_daily_dose_mg > 0));

alter table public.dose_hepatic_adjustments_v3
  drop constraint if exists dose_hepatic_adjustments_v3_action_check,
  add constraint dose_hepatic_adjustments_v3_action_check
    check (dose_action in ('no_adjustment','reduce_dose','extend_interval','avoid','contraindicated','specialist_review','max_daily_cap')),
  add constraint dose_hepatic_adjustments_v3_max_daily_cap_check
    check (dose_action <> 'max_daily_cap' or (max_daily_dose_mg is not null and max_daily_dose_mg > 0));

create unique index if not exists dose_renal_adjustments_v3_phase11_source_uniq
  on public.dose_renal_adjustments_v3(rule_id,phase11_source_adjustment_key)
  where phase11_source_adjustment_key is not null;

create unique index if not exists dose_hepatic_adjustments_v3_phase11_source_uniq
  on public.dose_hepatic_adjustments_v3(rule_id,phase11_source_adjustment_key)
  where phase11_source_adjustment_key is not null;

create or replace view drx_dose.phase11_adjustment_materialization_preview_v1 as
with base as (
  select
    s.regimen_key,
    s.applicability_scope,
    a.adjustment_key,
    a.adjustment_domain,
    a.measure_type as source_measure_type,
    case
      when a.adjustment_domain='RENAL' and a.measure_type in ('CrCl_mL_min','eGFR_mL_min_1_73m2','dialysis_status') then a.measure_type
      when a.adjustment_domain='HEPATIC' and a.measure_type in ('Child_Pugh_class','hepatic_impairment_textual') then a.measure_type
      else null
    end as mapped_measure_type,
    a.min_value,a.max_value,a.min_inclusive,a.max_inclusive,a.accepted_values,
    a.action_type as source_action_type,
    case
      when a.action_type='NO_CHANGE' then 'no_adjustment'
      when a.action_type='REPLACE_DOSE' then 'reduce_dose'
      when a.action_type='MAX_DAILY_CAP' then 'max_daily_cap'
      when a.action_type='NOT_RECOMMENDED' then 'avoid'
      when a.action_type='CONTRAINDICATED' then 'contraindicated'
      when a.action_type in ('CONSIDER_REDUCTION','CAUTION','MONITOR','MANUAL_REVIEW') then 'specialist_review'
      else null
    end as mapped_dose_action,
    a.replacement_dose_min,a.replacement_dose_max,a.replacement_dose_unit,
    a.replacement_frequency_mode,a.replacement_times_per_day,a.max_daily_dose_mg,
    a.condition_text,a.source_snapshot_id,a.source_section_code,a.source_section_sha256,
    a.review_status,a.reviewed_by,a.reviewed_at,a.review_note,
    r.rule_id,r.rule_key,r.regimen_kind,r.branch_no,r.step_no,
    r.dose_unit as rule_dose_unit,r.frequency_mode as rule_frequency_mode,
    r.times_per_day as rule_times_per_day,r.editorial_status as rule_editorial_status,
    snap.source_key,snap.document_version,snap.document_date
  from drx_dose.source_regimen_applicable_safety_v2 s
  join drx_dose.source_adjustment_candidates_v1 a
    on a.adjustment_key=s.candidate_key
   and s.candidate_type='ADJUSTMENT'
   and s.source_snapshot_id=a.source_snapshot_id
  left join public.dose_rules_v3 r
    on r.regimen_key=s.regimen_key
   and r.source_snapshot_id=a.source_snapshot_id
  join public.dose_source_snapshots_v3 snap
    on snap.snapshot_id=a.source_snapshot_id
)
select
  b.*,
  array_remove(array[
    case when b.review_status<>'APPROVED' then 'SOURCE_ADJUSTMENT_NOT_APPROVED' end,
    case when b.review_status='APPROVED' and (nullif(btrim(b.reviewed_by),'') is null or b.reviewed_at is null) then 'SOURCE_REVIEW_PROVENANCE_MISSING' end,
    case when b.rule_id is null then 'V3_RULE_NOT_PREPARED' end,
    case when b.rule_id is not null and b.rule_editorial_status not in ('verified','published') then 'V3_RULE_NOT_VERIFIED' end,
    case when b.mapped_measure_type is null then 'MEASURE_TYPE_REQUIRES_NORMALIZATION_REVIEW' end,
    case when b.mapped_dose_action is null then 'ACTION_TYPE_NOT_MAPPABLE' end,
    case when b.source_section_code<>'4.2' then 'V3_ADJUSTMENT_SCHEMA_REQUIRES_SECTION_4_2' end,
    case when b.regimen_kind='sequence' then 'SEQUENCE_STEP_SCOPE_REQUIRES_REVIEW' end,
    case when b.source_action_type='REPLACE_DOSE'
          and (b.replacement_dose_min is null and b.replacement_dose_max is null)
      then 'REPLACEMENT_DOSE_MISSING' end,
    case when b.source_action_type='REPLACE_DOSE'
          and nullif(btrim(coalesce(b.replacement_dose_unit,'')),'') is null
      then 'REPLACEMENT_DOSE_UNIT_MISSING' end,
    case when b.source_action_type='REPLACE_DOSE'
          and b.rule_dose_unit is not null
          and b.replacement_dose_unit is not null
          and lower(btrim(b.rule_dose_unit))<>lower(btrim(b.replacement_dose_unit))
      then 'REPLACEMENT_DOSE_UNIT_MISMATCH' end,
    case when b.source_action_type='REPLACE_DOSE'
          and b.replacement_frequency_mode is not null
          and b.rule_frequency_mode is distinct from b.replacement_frequency_mode
      then 'REPLACEMENT_FREQUENCY_MODE_DIFFERS_FROM_RULE' end,
    case when b.source_action_type='REPLACE_DOSE'
          and b.replacement_frequency_mode='times_per_day'
          and b.replacement_times_per_day is not null
          and b.rule_times_per_day is distinct from b.replacement_times_per_day
      then 'REPLACEMENT_FREQUENCY_VALUE_DIFFERS_FROM_RULE' end,
    case when b.source_action_type='MAX_DAILY_CAP'
          and (b.max_daily_dose_mg is null or b.max_daily_dose_mg<=0)
      then 'MAX_DAILY_CAP_MISSING' end,
    case when b.adjustment_domain='HEPATIC'
          and b.mapped_measure_type in ('Child_Pugh_class','hepatic_impairment_textual')
          and cardinality(b.accepted_values)=0
      then 'HEPATIC_CATEGORY_VALUES_MISSING' end
  ],null) as materialization_blockers,
  false::boolean as auto_materialize_allowed,
  false::boolean as auto_apply_allowed,
  false::boolean as auto_publish_allowed
from base b;

create or replace view drx_dose.phase11_adjustment_materialization_summary_v1 as
select
  count(*) as preview_rows,
  count(*) filter (where review_status='APPROVED') as approved_source_rows,
  count(*) filter (where cardinality(materialization_blockers)=0) as ready_to_materialize,
  count(*) filter (where materialization_blockers @> array['MEASURE_TYPE_REQUIRES_NORMALIZATION_REVIEW']::text[]) as measure_normalization_review,
  count(*) filter (where materialization_blockers @> array['SEQUENCE_STEP_SCOPE_REQUIRES_REVIEW']::text[]) as sequence_scope_review,
  false::boolean as auto_materialize_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_adjustment_materialization_preview_v1;

create table if not exists drx_dose.phase11_adjustment_materialization_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  adjustment_key text not null references drx_dose.source_adjustment_candidates_v1(adjustment_key) on delete restrict,
  adjustment_domain text not null check (adjustment_domain in ('RENAL','HEPATIC')),
  v3_adjustment_id uuid not null,
  actor text not null check (nullif(btrim(actor),'') is not null),
  source_reviewer text not null check (nullif(btrim(source_reviewer),'') is not null),
  source_reviewed_at timestamptz not null,
  materialization_blockers text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique(rule_id,adjustment_key)
);

create or replace function public.drx_phase11_materialize_verified_adjustment_v1(
  p_rule_id uuid,
  p_adjustment_key text,
  p_actor text,
  p_attestation text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v drx_dose.phase11_adjustment_materialization_preview_v1%rowtype;
  v_adjustment_id uuid;
begin
  if p_rule_id is null then raise exception 'rule_id is required'; end if;
  if nullif(btrim(p_adjustment_key),'') is null then raise exception 'adjustment_key is required'; end if;
  if nullif(btrim(p_actor),'') is null then raise exception 'actor is required'; end if;
  if p_attestation <> 'V3_ADJUSTMENT_MATERIALIZATION_ATTESTED' then
    raise exception 'Explicit V3 adjustment materialization attestation is required';
  end if;

  perform 1
  from drx_dose.source_adjustment_candidates_v1 a
  where a.adjustment_key=p_adjustment_key
  for update;
  if not found then
    raise exception 'Unknown source adjustment candidate: %',p_adjustment_key;
  end if;

  select * into v
  from drx_dose.phase11_adjustment_materialization_preview_v1
  where rule_id=p_rule_id and adjustment_key=p_adjustment_key;

  if not found then
    raise exception 'No Phase 11 adjustment preview row for rule % and candidate %',p_rule_id,p_adjustment_key;
  end if;
  if cardinality(v.materialization_blockers)>0 then
    raise exception 'Adjustment materialization blocked: %',array_to_string(v.materialization_blockers,',');
  end if;

  if v.adjustment_domain='RENAL' then
    insert into public.dose_renal_adjustments_v3(
      rule_id,measure_type,min_value,max_value,accepted_values,min_inclusive,max_inclusive,
      dose_action,replacement_dose_min,replacement_dose_max,max_daily_dose_mg,
      source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
      source_document_version,source_document_date,review_status,verified_by,verified_at,
      phase11_source_adjustment_key
    ) values (
      v.rule_id,v.mapped_measure_type,v.min_value,v.max_value,v.accepted_values,v.min_inclusive,v.max_inclusive,
      v.mapped_dose_action,v.replacement_dose_min,v.replacement_dose_max,v.max_daily_dose_mg,
      v.source_key,v.source_snapshot_id,'4.2',v.source_section_sha256,v.source_snapshot_id,
      v.document_version,v.document_date,'verified',v.reviewed_by,v.reviewed_at,
      v.adjustment_key
    )
    on conflict (rule_id,phase11_source_adjustment_key) where phase11_source_adjustment_key is not null
    do update set updated_at=now()
    returning adjustment_id into v_adjustment_id;
  else
    insert into public.dose_hepatic_adjustments_v3(
      rule_id,measure_type,severity_or_class,dose_action,
      replacement_dose_min,replacement_dose_max,max_daily_dose_mg,
      source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
      source_document_version,source_document_date,review_status,verified_by,verified_at,
      phase11_source_adjustment_key
    ) values (
      v.rule_id,v.mapped_measure_type,v.accepted_values,v.mapped_dose_action,
      v.replacement_dose_min,v.replacement_dose_max,v.max_daily_dose_mg,
      v.source_key,v.source_snapshot_id,'4.2',v.source_section_sha256,v.source_snapshot_id,
      v.document_version,v.document_date,'verified',v.reviewed_by,v.reviewed_at,
      v.adjustment_key
    )
    on conflict (rule_id,phase11_source_adjustment_key) where phase11_source_adjustment_key is not null
    do update set updated_at=now()
    returning adjustment_id into v_adjustment_id;
  end if;

  insert into drx_dose.phase11_adjustment_materialization_events_v1(
    rule_id,adjustment_key,adjustment_domain,v3_adjustment_id,actor,
    source_reviewer,source_reviewed_at,materialization_blockers
  ) values (
    v.rule_id,v.adjustment_key,v.adjustment_domain,v_adjustment_id,btrim(p_actor),
    v.reviewed_by,v.reviewed_at,'{}'::text[]
  )
  on conflict (rule_id,adjustment_key) do nothing;

  return jsonb_build_object(
    'ok',true,'ruleId',v.rule_id,'adjustmentKey',v.adjustment_key,
    'domain',v.adjustment_domain,'v3AdjustmentId',v_adjustment_id,
    'reviewStatus','verified','autoApplied',false,'autoPublished',false
  );
end;
$$;

create or replace function drx_dose.guard_phase11_adjustment_publication_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.editorial_status<>'published' then return new; end if;
  if tg_op='UPDATE' and old.editorial_status='published' then return new; end if;

  if new.renal_adjustment_required and not exists (
    select 1 from public.dose_renal_adjustments_v3 a
    where a.rule_id=new.rule_id and a.review_status='verified'
  ) then
    raise exception 'DRx V3 rule publication blocked: renal adjustment is required but no verified renal adjustment exists';
  end if;

  if new.hepatic_adjustment_required and not exists (
    select 1 from public.dose_hepatic_adjustments_v3 a
    where a.rule_id=new.rule_id and a.review_status='verified'
  ) then
    raise exception 'DRx V3 rule publication blocked: hepatic adjustment is required but no verified hepatic adjustment exists';
  end if;

  if new.regimen_key is not null and exists (
    select 1
    from drx_dose.source_regimen_applicable_safety_v2 s
    join drx_dose.source_adjustment_candidates_v1 a
      on a.adjustment_key=s.candidate_key
     and s.candidate_type='ADJUSTMENT'
     and a.review_status='APPROVED'
     and s.source_snapshot_id=new.source_snapshot_id
    where s.regimen_key=new.regimen_key
      and not exists (
        select 1 from public.dose_renal_adjustments_v3 x
        where a.adjustment_domain='RENAL'
          and x.rule_id=new.rule_id
          and x.phase11_source_adjustment_key=a.adjustment_key
          and x.review_status='verified'
        union all
        select 1 from public.dose_hepatic_adjustments_v3 x
        where a.adjustment_domain='HEPATIC'
          and x.rule_id=new.rule_id
          and x.phase11_source_adjustment_key=a.adjustment_key
          and x.review_status='verified'
      )
  ) then
    raise exception 'DRx V3 rule publication blocked: an approved Phase 11 adjustment has not been materialized';
  end if;

  return new;
end;
$$;

drop trigger if exists dose_rules_v3_phase11_adjustment_publication_guard
  on public.dose_rules_v3;
create trigger dose_rules_v3_phase11_adjustment_publication_guard
before insert or update of editorial_status on public.dose_rules_v3
for each row execute function drx_dose.guard_phase11_adjustment_publication_v1();

alter table drx_dose.phase11_adjustment_materialization_events_v1 enable row level security;

revoke all on drx_dose.phase11_adjustment_materialization_preview_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_adjustment_materialization_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_adjustment_materialization_events_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_adjustment_materialization_preview_v1 to service_role;
grant select on drx_dose.phase11_adjustment_materialization_summary_v1 to service_role;
grant select on drx_dose.phase11_adjustment_materialization_events_v1 to service_role;

revoke all on function public.drx_phase11_materialize_verified_adjustment_v1(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_materialize_verified_adjustment_v1(uuid,text,text,text)
  to service_role;

revoke all on function drx_dose.guard_phase11_adjustment_publication_v1()
  from public,anon,authenticated;
