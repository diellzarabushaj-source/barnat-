
-- DRx Phase 11AP: clinical-review packet + conservative promotion gate v2.
-- This is the bridge between source-backed structured candidates and eventual
-- dose_rules_v3 promotion. It never auto-publishes and never serves runtime data.

create or replace view drx_dose.source_regimen_clinical_review_packet_v1 as
select
  r.regimen_key,
  r.substance_concept_id,
  sc.canonical_name as substance_name,
  r.indication_id,
  r.indication_key_candidate,
  r.indication_label,
  r.patient_group,
  r.route_key,
  r.form_family,
  r.regimen_kind,
  r.review_status,
  ready.structurally_complete,
  r.source_snapshot_id,
  r.source_section_sha256,
  r.source_url,
  (
    select jsonb_agg(
      jsonb_build_object(
        'branch',s.branch_no,
        'step',s.step_no,
        'startDay',s.start_day,
        'endDay',s.end_day,
        'minAgeDays',s.min_age_days,
        'maxAgeDays',s.max_age_days,
        'minAgeMonths',s.min_age_months,
        'maxAgeMonths',s.max_age_months,
        'minWeightKg',s.min_weight_kg,
        'maxWeightKg',s.max_weight_kg,
        'calculationMethod',s.calculation_method,
        'doseMin',s.dose_min_value,
        'doseMax',s.dose_max_value,
        'doseUnit',s.dose_unit,
        'frequencyMode',s.frequency_mode,
        'intervalMinHours',s.interval_min_hours,
        'intervalMaxHours',s.interval_max_hours,
        'timesPerDay',s.times_per_day,
        'durationMinDays',s.duration_min_days,
        'durationMaxDays',s.duration_max_days,
        'maxSingleDoseMg',s.max_single_dose_mg,
        'maxDailyDoseMg',s.max_daily_dose_mg,
        'condition',s.condition_text,
        'sourceNote',s.source_note
      )
      order by s.branch_no,s.step_no
    )
    from drx_dose.source_regimen_steps_v1 s
    where s.regimen_key=r.regimen_key
  ) as steps,
  (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'branch',p.branch_no,
        'step',p.step_no,
        'strengthValue',p.required_strength_value,
        'strengthUnit',p.required_strength_unit,
        'formFamily',p.required_form_family,
        'route',p.required_route_key,
        'release',p.required_release_key,
        'policy',p.presentation_policy,
        'sourceProduct',p.source_product_label,
        'reviewStatus',p.review_status
      )
      order by p.branch_no,p.step_no
    ),'[]'::jsonb)
    from drx_dose.source_regimen_step_presentation_requirements_v1 p
    where p.regimen_key=r.regimen_key
  ) as presentation_requirements,
  (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'branch',a.branch_no,
        'step',a.step_no,
        'foodRequirement',a.food_requirement,
        'timingRequirement',a.timing_requirement,
        'note',a.administration_note,
        'reviewStatus',a.review_status
      )
      order by a.branch_no,a.step_no
    ),'[]'::jsonb)
    from drx_dose.source_regimen_step_administration_v1 a
    where a.regimen_key=r.regimen_key
  ) as administration_requirements,
  (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'sourceSnapshotId',e.source_snapshot_id,
        'sourceSectionSha256',e.source_section_sha256,
        'sourceUrl',e.source_url,
        'role',e.evidence_role,
        'reviewStatus',e.review_status
      )
      order by e.evidence_role,e.source_url
    ),'[]'::jsonb)
    from drx_dose.source_regimen_supporting_evidence_v1 e
    where e.regimen_key=r.regimen_key
  ) as supporting_evidence,
  (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'indicationKey',l.indication_key_candidate,
        'indicationLabel',l.indication_label,
        'indicationId',l.indication_id,
        'linkStatus',l.link_status,
        'indicationEditorialStatus',i.editorial_status,
        'icdVerificationStatus',i.icd_verification_status
      )
      order by l.indication_label
    ),'[]'::jsonb)
    from drx_dose.source_regimen_indication_links_v1 l
    left join public.dose_indication_concepts_v3 i on i.indication_id=l.indication_id
    where l.regimen_key=r.regimen_key
  ) as linked_indications,
  (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'adjustmentKey',a.adjustment_key,
        'domain',a.adjustment_domain,
        'measureType',a.measure_type,
        'minValue',a.min_value,
        'maxValue',a.max_value,
        'actionType',a.action_type,
        'replacementDoseMin',a.replacement_dose_min,
        'replacementDoseMax',a.replacement_dose_max,
        'replacementDoseUnit',a.replacement_dose_unit,
        'replacementFrequencyMode',a.replacement_frequency_mode,
        'replacementTimesPerDay',a.replacement_times_per_day,
        'condition',a.condition_text,
        'reviewStatus',a.review_status
      )
      order by a.adjustment_key
    ),'[]'::jsonb)
    from drx_dose.source_adjustment_candidates_v1 a
    where a.regimen_key=r.regimen_key
       or (
         a.regimen_key is null
         and a.substance_concept_id=r.substance_concept_id
       )
  ) as safety_adjustments,
  (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'restrictionKey',x.restriction_key,
        'patientGroup',x.patient_group,
        'restrictionType',x.restriction_type,
        'machineAction',x.machine_action,
        'renalOperator',x.renal_operator,
        'renalThreshold',x.renal_threshold,
        'renalUnit',x.renal_unit,
        'text',x.restriction_text,
        'reviewStatus',x.review_status
      )
      order by x.restriction_key
    ),'[]'::jsonb)
    from drx_dose.source_restriction_candidates_v1 x
    where x.substance_concept_id=r.substance_concept_id
      and (
        x.indication_key_candidate is null
        or x.indication_key_candidate=r.indication_key_candidate
      )
      and (
        x.patient_group is null
        or x.patient_group=r.patient_group
        or x.patient_group='pediatric_and_adult'
      )
  ) as safety_restrictions,
  (
    ready.structurally_complete
    and r.indication_id is not null
    and exists (
      select 1
      from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key
        and e.evidence_role='PRIMARY'
    )
  ) as clinical_review_ready,
  false::boolean as auto_approve_allowed,
  false::boolean as auto_publish_allowed,
  false::boolean as runtime_ready
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_regimen_candidate_readiness_v1 ready
  on ready.regimen_key=r.regimen_key
left join public.substance_concepts_v1 sc
  on sc.concept_id=r.substance_concept_id;

create or replace view drx_dose.source_regimen_promotion_gate_v2 as
with q as (
  select
    r.regimen_key,
    r.substance_concept_id,
    r.indication_id,
    r.indication_key_candidate,
    r.indication_label,
    r.patient_group,
    r.route_key,
    r.form_family,
    r.regimen_kind,
    r.review_status,
    ready.structurally_complete,
    i.editorial_status as indication_editorial_status,
    i.icd_verification_status,
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key) as evidence_count,
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key and e.evidence_role='PRIMARY') as primary_evidence_count,
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key and e.review_status not in ('VERIFIED')) as unverified_evidence_count,
    (select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1 p
      where p.regimen_key=r.regimen_key) as presentation_requirement_count,
    (select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1 p
      where p.regimen_key=r.regimen_key and p.review_status<>'VERIFIED') as unverified_presentation_count,
    (select count(*) from drx_dose.source_regimen_step_administration_v1 a
      where a.regimen_key=r.regimen_key) as administration_requirement_count,
    (select count(*) from drx_dose.source_regimen_step_administration_v1 a
      where a.regimen_key=r.regimen_key and a.review_status<>'VERIFIED') as unverified_administration_count,
    (select count(*) from drx_dose.source_regimen_indication_links_v1 l
      where l.regimen_key=r.regimen_key) as linked_indication_count,
    (select count(*) from drx_dose.source_regimen_indication_links_v1 l
      left join public.dose_indication_concepts_v3 li on li.indication_id=l.indication_id
      where l.regimen_key=r.regimen_key
        and (
          l.link_status<>'VERIFIED'
          or l.indication_id is null
          or li.editorial_status<>'published'
        )
    ) as blocked_linked_indication_count
  from drx_dose.source_regimen_candidates_v1 r
  join drx_dose.source_regimen_candidate_readiness_v1 ready
    on ready.regimen_key=r.regimen_key
  left join public.dose_indication_concepts_v3 i
    on i.indication_id=r.indication_id
)
select
  q.*,
  array_remove(array[
    case when not q.structurally_complete then 'REGIMEN_STRUCTURE' end,
    case when q.indication_id is null then 'INDICATION_OBJECT' end,
    case when q.indication_id is not null and q.indication_editorial_status<>'published'
      then 'PRIMARY_INDICATION_REVIEW_PUBLICATION' end,
    case when q.review_status<>'APPROVED' then 'CLINICAL_REGIMEN_REVIEW' end,
    case when q.primary_evidence_count=0 then 'PRIMARY_SOURCE_EVIDENCE' end,
    case when q.evidence_count>0 and q.unverified_evidence_count>0
      then 'SOURCE_EVIDENCE_REVIEW' end,
    case when q.presentation_requirement_count>0 and q.unverified_presentation_count>0
      then 'PRESENTATION_REQUIREMENT_REVIEW' end,
    case when q.administration_requirement_count>0 and q.unverified_administration_count>0
      then 'ADMINISTRATION_REQUIREMENT_REVIEW' end,
    case when q.linked_indication_count>0 and q.blocked_linked_indication_count>0
      then 'LINKED_INDICATION_REVIEW' end
  ],null) as promotion_blockers,
  cardinality(array_remove(array[
    case when not q.structurally_complete then 'REGIMEN_STRUCTURE' end,
    case when q.indication_id is null then 'INDICATION_OBJECT' end,
    case when q.indication_id is not null and q.indication_editorial_status<>'published'
      then 'PRIMARY_INDICATION_REVIEW_PUBLICATION' end,
    case when q.review_status<>'APPROVED' then 'CLINICAL_REGIMEN_REVIEW' end,
    case when q.primary_evidence_count=0 then 'PRIMARY_SOURCE_EVIDENCE' end,
    case when q.evidence_count>0 and q.unverified_evidence_count>0
      then 'SOURCE_EVIDENCE_REVIEW' end,
    case when q.presentation_requirement_count>0 and q.unverified_presentation_count>0
      then 'PRESENTATION_REQUIREMENT_REVIEW' end,
    case when q.administration_requirement_count>0 and q.unverified_administration_count>0
      then 'ADMINISTRATION_REQUIREMENT_REVIEW' end,
    case when q.linked_indication_count>0 and q.blocked_linked_indication_count>0
      then 'LINKED_INDICATION_REVIEW' end
  ],null))=0 as promotion_ready,
  false::boolean as auto_publish_allowed,
  false::boolean as runtime_ready
from q;

create or replace view drx_dose.source_regimen_review_dashboard_v1 as
select
  count(*) as total_regimens,
  count(*) filter (where clinical_review_ready) as clinical_review_ready,
  count(*) filter (where review_status='APPROVED') as clinically_approved,
  count(*) filter (where not structurally_complete) as structurally_incomplete,
  count(*) filter (where jsonb_array_length(presentation_requirements)>0) as with_presentation_requirements,
  count(*) filter (where jsonb_array_length(administration_requirements)>0) as with_administration_requirements,
  count(*) filter (where jsonb_array_length(linked_indications)>0) as with_multi_indication_links,
  count(*) filter (
    where exists (
      select 1 from drx_dose.source_regimen_promotion_gate_v2 g
      where g.regimen_key=source_regimen_clinical_review_packet_v1.regimen_key
        and g.promotion_ready
    )
  ) as promotion_ready,
  false::boolean as auto_publish_allowed,
  false::boolean as runtime_ready
from drx_dose.source_regimen_clinical_review_packet_v1;

revoke all on drx_dose.source_regimen_clinical_review_packet_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_promotion_gate_v2 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_review_dashboard_v1 from public,anon,authenticated;
grant select on drx_dose.source_regimen_clinical_review_packet_v1 to service_role;
grant select on drx_dose.source_regimen_promotion_gate_v2 to service_role;
grant select on drx_dose.source_regimen_review_dashboard_v1 to service_role;
