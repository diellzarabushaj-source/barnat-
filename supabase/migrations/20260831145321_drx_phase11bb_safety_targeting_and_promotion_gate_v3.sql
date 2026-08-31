
-- DRx Phase 11BB: make safety candidates explicitly targetable to a dose moiety,
-- then add a promotion gate that refuses to progress while applicable safety
-- adjustments/restrictions remain unreviewed.

alter table drx_dose.source_adjustment_candidates_v1
  add column if not exists dose_moiety_key text;

alter table drx_dose.source_restriction_candidates_v1
  add column if not exists dose_moiety_key text;

update drx_dose.source_adjustment_candidates_v1 a
set dose_moiety_key=r.dose_moiety_key
from drx_dose.source_regimen_candidates_v1 r
where a.regimen_key=r.regimen_key
  and a.dose_moiety_key is distinct from r.dose_moiety_key;

-- Explicit combination target for current co-amoxiclav safety restrictions.
update drx_dose.source_restriction_candidates_v1
set dose_moiety_key='c78c0bc2563c8e0a6e4656dbb992a0a8'
where restriction_key like 'SRC-REST-COAMOX-%'
  and dose_moiety_key is null;

create index if not exists source_adjustment_candidates_v1_moiety_idx
  on drx_dose.source_adjustment_candidates_v1(dose_moiety_key,review_status);

create index if not exists source_restriction_candidates_v1_moiety_idx
  on drx_dose.source_restriction_candidates_v1(dose_moiety_key,review_status);

create or replace view drx_dose.source_regimen_applicable_safety_v1 as
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
  a.condition_text as clinical_text
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_adjustment_candidates_v1 a
  on (
       a.regimen_key=r.regimen_key
       or (a.regimen_key is null and a.dose_moiety_key=r.dose_moiety_key and a.dose_moiety_key is not null)
       or (
         a.regimen_key is null
         and a.target_kind='SUBSTANCE'
         and a.substance_concept_id is not null
         and a.substance_concept_id=r.substance_concept_id
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
  x.restriction_text
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_restriction_candidates_v1 x
  on (
       (x.dose_moiety_key=r.dose_moiety_key and x.dose_moiety_key is not null)
       or (
         x.target_kind='SUBSTANCE'
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

create or replace view drx_dose.source_regimen_promotion_gate_v3 as
with q as (
  select
    g.*,
    (select count(*) from drx_dose.source_regimen_applicable_safety_v1 s
      where s.regimen_key=g.regimen_key) as applicable_safety_count,
    (select count(*) from drx_dose.source_regimen_applicable_safety_v1 s
      where s.regimen_key=g.regimen_key
        and s.review_status not in ('APPROVED','PROMOTED','REJECTED')) as pending_safety_count,
    (select count(*) from drx_dose.source_regimen_rule_materialization_preview_v1 m
      where m.regimen_key=g.regimen_key) as materialization_step_count,
    (select count(*) from drx_dose.source_regimen_rule_materialization_preview_v1 m
      where m.regimen_key=g.regimen_key
        and cardinality(m.materialization_blockers)>0) as blocked_materialization_step_count
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
  ) as promotion_blockers_v3,
  (
    cardinality(q.promotion_blockers)=0
    and q.pending_safety_count=0
    and q.materialization_step_count>0
    and q.blocked_materialization_step_count=0
  ) as promotion_ready_v3,
  false::boolean as auto_publish_allowed_v3,
  false::boolean as runtime_ready_v3
from q;

create or replace view drx_dose.source_regimen_safety_review_summary_v1 as
select
  regimen_key,
  count(*) as applicable_safety_rows,
  count(*) filter (where candidate_type='ADJUSTMENT') as adjustment_rows,
  count(*) filter (where candidate_type='RESTRICTION') as restriction_rows,
  count(*) filter (where review_status in ('APPROVED','PROMOTED','REJECTED')) as reviewed_rows,
  count(*) filter (where review_status not in ('APPROVED','PROMOTED','REJECTED')) as pending_rows
from drx_dose.source_regimen_applicable_safety_v1
group by regimen_key;

revoke all on drx_dose.source_regimen_applicable_safety_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_promotion_gate_v3 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_safety_review_summary_v1 from public,anon,authenticated;
grant select on drx_dose.source_regimen_applicable_safety_v1 to service_role;
grant select on drx_dose.source_regimen_promotion_gate_v3 to service_role;
grant select on drx_dose.source_regimen_safety_review_summary_v1 to service_role;
