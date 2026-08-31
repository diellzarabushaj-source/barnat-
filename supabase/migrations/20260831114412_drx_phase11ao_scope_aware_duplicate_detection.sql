
-- DRx Phase 11AO: refine semantic-duplicate detection with presentation scope.
-- Two clinically identical-looking restrictions can both be valid when they apply
-- to different strengths/forms/source presentations.

drop view if exists drx_dose.source_adjustment_semantic_duplicates_v1;
drop view if exists drx_dose.source_restriction_semantic_duplicates_v1;

create view drx_dose.source_adjustment_semantic_duplicates_v1 as
with keyed as (
  select
    a.*,
    app.scope_type,
    app.route_key as applicability_route_key,
    app.form_family as applicability_form_family,
    app.source_strength_value,
    app.source_strength_unit,
    app.release_key as applicability_release_key,
    md5(concat_ws('|',
      coalesce(a.regimen_key,''),
      coalesce(a.substance_concept_id::text,''),
      a.adjustment_domain,
      a.measure_type,
      coalesce(a.min_value::text,''),
      coalesce(a.max_value::text,''),
      a.min_inclusive::text,
      a.max_inclusive::text,
      a.action_type,
      coalesce(a.replacement_dose_min::text,''),
      coalesce(a.replacement_dose_max::text,''),
      coalesce(a.replacement_dose_unit,''),
      coalesce(a.replacement_frequency_mode,''),
      coalesce(a.replacement_times_per_day::text,''),
      coalesce(a.max_daily_dose_mg::text,''),
      coalesce(app.scope_type,''),
      coalesce(app.route_key,''),
      coalesce(app.form_family,''),
      coalesce(app.source_strength_value::text,''),
      coalesce(app.source_strength_unit,''),
      coalesce(app.release_key,'')
    )) as semantic_hash
  from drx_dose.source_adjustment_candidates_v1 a
  left join drx_dose.source_candidate_applicability_v1 app
    on app.candidate_type='ADJUSTMENT'
   and app.candidate_key=a.adjustment_key
  where a.review_status in ('PENDING','IN_REVIEW','APPROVED','PROMOTED')
),
dups as (
  select semantic_hash,count(*) n
  from keyed
  group by semantic_hash
  having count(*)>1
)
select
  k.semantic_hash,k.adjustment_key,k.regimen_key,k.substance_concept_id,
  k.adjustment_domain,k.measure_type,k.min_value,k.max_value,k.action_type,
  k.scope_type,k.applicability_route_key,k.applicability_form_family,
  k.source_strength_value,k.source_strength_unit,k.applicability_release_key,
  k.review_status,k.source_snapshot_id,k.source_url
from keyed k
join dups d using (semantic_hash);

create view drx_dose.source_restriction_semantic_duplicates_v1 as
with keyed as (
  select
    r.*,
    app.scope_type,
    app.route_key as applicability_route_key,
    app.form_family as applicability_form_family,
    app.source_strength_value,
    app.source_strength_unit,
    app.release_key as applicability_release_key,
    md5(concat_ws('|',
      coalesce(r.substance_concept_id::text,''),
      coalesce(r.indication_key_candidate,''),
      coalesce(r.patient_group,''),
      r.restriction_type,
      r.machine_action,
      coalesce(r.min_age_months::text,''),
      coalesce(r.max_age_months::text,''),
      coalesce(r.min_weight_kg::text,''),
      coalesce(r.max_weight_kg::text,''),
      coalesce(r.renal_operator,''),
      coalesce(r.renal_threshold::text,''),
      coalesce(r.renal_unit,''),
      coalesce(app.scope_type,''),
      coalesce(app.route_key,''),
      coalesce(app.form_family,''),
      coalesce(app.source_strength_value::text,''),
      coalesce(app.source_strength_unit,''),
      coalesce(app.release_key,'')
    )) as semantic_hash
  from drx_dose.source_restriction_candidates_v1 r
  left join drx_dose.source_candidate_applicability_v1 app
    on app.candidate_type='RESTRICTION'
   and app.candidate_key=r.restriction_key
  where r.review_status in ('PENDING','IN_REVIEW','APPROVED','PROMOTED')
),
dups as (
  select semantic_hash,count(*) n
  from keyed
  group by semantic_hash
  having count(*)>1
)
select
  k.semantic_hash,k.restriction_key,k.substance_concept_id,
  k.indication_key_candidate,k.patient_group,k.restriction_type,k.machine_action,
  k.renal_operator,k.renal_threshold,k.renal_unit,
  k.scope_type,k.applicability_route_key,k.applicability_form_family,
  k.source_strength_value,k.source_strength_unit,k.applicability_release_key,
  k.review_status,k.source_snapshot_id,k.source_url
from keyed k
join dups d using (semantic_hash);

revoke all on drx_dose.source_adjustment_semantic_duplicates_v1 from public,anon,authenticated;
revoke all on drx_dose.source_restriction_semantic_duplicates_v1 from public,anon,authenticated;
grant select on drx_dose.source_adjustment_semantic_duplicates_v1 to service_role;
grant select on drx_dose.source_restriction_semantic_duplicates_v1 to service_role;
