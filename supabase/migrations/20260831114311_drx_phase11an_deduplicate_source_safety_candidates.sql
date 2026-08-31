
-- DRx Phase 11AN: remove exact semantic duplicate rivaroxaban candidates introduced
-- by overlapping staging passes, and add a duplicate-audit view so future passes
-- can detect equivalent pending candidates before insertion.

delete from drx_dose.source_candidate_applicability_v1
where candidate_type='ADJUSTMENT'
  and candidate_key in (
    'SRC-ADJ-RIVA-NVAF-CRCL15TO49-15QD',
    'SRC-ADJ-RIVA-DVTPE-AFTER-DAY21-CONSIDER15QD'
  );

delete from drx_dose.source_adjustment_candidates_v1
where adjustment_key in (
  'SRC-ADJ-RIVA-NVAF-CRCL15TO49-15QD',
  'SRC-ADJ-RIVA-DVTPE-AFTER-DAY21-CONSIDER15QD'
)
and review_status='PENDING';

delete from drx_dose.source_candidate_applicability_v1
where candidate_type='RESTRICTION'
  and candidate_key in (
    'SRC-REST-RIVA-ADULT-CRCL-LT15',
    'SRC-REST-RIVA-PED-GFR-LT50'
  );

delete from drx_dose.source_restriction_candidates_v1
where restriction_key in (
  'SRC-REST-RIVA-ADULT-CRCL-LT15',
  'SRC-REST-RIVA-PED-GFR-LT50'
)
and review_status='PENDING';

create or replace view drx_dose.source_adjustment_semantic_duplicates_v1 as
with keyed as (
  select
    a.*,
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
      coalesce(a.max_daily_dose_mg::text,'')
    )) as semantic_hash
  from drx_dose.source_adjustment_candidates_v1 a
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
  k.review_status,k.source_snapshot_id,k.source_url
from keyed k
join dups d using (semantic_hash);

create or replace view drx_dose.source_restriction_semantic_duplicates_v1 as
with keyed as (
  select
    r.*,
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
      coalesce(r.renal_unit,'')
    )) as semantic_hash
  from drx_dose.source_restriction_candidates_v1 r
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
  k.renal_operator,k.renal_threshold,k.renal_unit,k.review_status,
  k.source_snapshot_id,k.source_url
from keyed k
join dups d using (semantic_hash);

revoke all on drx_dose.source_adjustment_semantic_duplicates_v1 from public,anon,authenticated;
revoke all on drx_dose.source_restriction_semantic_duplicates_v1 from public,anon,authenticated;
grant select on drx_dose.source_adjustment_semantic_duplicates_v1 to service_role;
grant select on drx_dose.source_restriction_semantic_duplicates_v1 to service_role;
