
-- DRx Phase 11BN: tighten safety inheritance to exact source context.
-- A safety statement is never generalized across a substance merely because the
-- active ingredient matches. Direct regimen-scoped rows remain valid; otherwise
-- the same source snapshot + same canonical dose moiety is required.

alter table drx_dose.source_restriction_candidates_v1
  add column if not exists measure_type text;

update drx_dose.source_restriction_candidates_v1
set measure_type='CrCl_mL_min'
where renal_threshold is not null
  and measure_type is null
  and restriction_text ~* '\mCrCl\M';

create or replace view drx_dose.source_regimen_applicable_safety_v2 as
select
  r.regimen_key,
  'ADJUSTMENT'::text as candidate_type,
  a.adjustment_key as candidate_key,
  a.review_status,
  a.target_kind,
  a.substance_concept_id,
  a.dose_moiety_key,
  a.regimen_key as directly_scoped_regimen_key,
  a.adjustment_domain as domain_or_type,
  a.condition_text as clinical_text,
  a.source_snapshot_id,
  case
    when a.regimen_key=r.regimen_key then 'DIRECT_REGIMEN'
    else 'SAME_SOURCE_MOIETY'
  end as applicability_scope
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_adjustment_candidates_v1 a
  on (
    a.regimen_key=r.regimen_key
    or (
      a.regimen_key is null
      and a.source_snapshot_id=r.source_snapshot_id
      and (
        (a.dose_moiety_key is not null and a.dose_moiety_key=r.dose_moiety_key)
        or (
          a.dose_moiety_key is null
          and a.target_kind='SUBSTANCE'
          and a.substance_concept_id is not null
          and a.substance_concept_id=r.substance_concept_id
        )
      )
    )
  )

union all

select
  r.regimen_key,
  'RESTRICTION',
  x.restriction_key,
  x.review_status,
  x.target_kind,
  x.substance_concept_id,
  x.dose_moiety_key,
  null::text,
  x.restriction_type,
  x.restriction_text,
  x.source_snapshot_id,
  'SAME_SOURCE_MOIETY'
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_restriction_candidates_v1 x
  on x.source_snapshot_id=r.source_snapshot_id
 and (
   (x.dose_moiety_key is not null and x.dose_moiety_key=r.dose_moiety_key)
   or (
     x.dose_moiety_key is null
     and x.target_kind='SUBSTANCE'
     and x.substance_concept_id is not null
     and x.substance_concept_id=r.substance_concept_id
   )
 )
 and (x.indication_key_candidate is null or x.indication_key_candidate=r.indication_key_candidate)
 and (
   x.patient_group is null
   or x.patient_group=r.patient_group
   or x.patient_group='pediatric_and_adult'
 );

create or replace view drx_dose.source_regimen_safety_review_summary_v2 as
select
  regimen_key,
  count(*) as applicable_safety_rows,
  count(*) filter (where candidate_type='ADJUSTMENT') as adjustment_rows,
  count(*) filter (where candidate_type='RESTRICTION') as restriction_rows,
  count(*) filter (where review_status in ('APPROVED','PROMOTED','REJECTED')) as reviewed_rows,
  count(*) filter (where review_status not in ('APPROVED','PROMOTED','REJECTED')) as pending_rows,
  count(*) filter (where applicability_scope='DIRECT_REGIMEN') as directly_scoped_rows,
  count(*) filter (where applicability_scope='SAME_SOURCE_MOIETY') as same_source_moiety_rows
from drx_dose.source_regimen_applicable_safety_v2
group by regimen_key;

create or replace view drx_dose.source_regimen_promotion_gate_v6 as
with d as (
  select
    g.*,
    x.intended_runtime_mode,
    (select count(*) from drx_dose.source_regimen_applicable_safety_v2 s
      where s.regimen_key=g.regimen_key) as applicable_safety_count,
    (select count(*) from drx_dose.source_regimen_applicable_safety_v2 s
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
  ) as promotion_blockers_v6,
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
  ) as text_only_review_ready,
  false::boolean as auto_publish_allowed_v6,
  false::boolean as runtime_ready_v6
from d;

revoke all on drx_dose.source_regimen_applicable_safety_v2 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_safety_review_summary_v2 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_promotion_gate_v6 from public,anon,authenticated;
grant select on drx_dose.source_regimen_applicable_safety_v2 to service_role;
grant select on drx_dose.source_regimen_safety_review_summary_v2 to service_role;
grant select on drx_dose.source_regimen_promotion_gate_v6 to service_role;
