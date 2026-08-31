
-- DRx Phase 11AX: explicit completion gates + clinical-review batch summary.
-- This defines what "finished" means without auto-approving any clinical data.

create or replace view drx_dose.phase11_completion_checklist_v1 as
with s as (
  select public.drx_phase11_status_v2() j
),
items as (
  select * from (values
    ('PRODUCT_IDENTITY_COVERAGE'::text,'foundation'::text,
      (select count(*)::numeric from drx_dose.product_rule_targets_v1
       where ingredient_resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')),
      (select count(*)::numeric from drx_dose.product_rule_targets_v1),
      'All published products should have resolved ingredient identity before full completion.'::text),
    ('UNRESOLVED_PRODUCT_IDENTITY','foundation',
      (select count(*)::numeric from drx_dose.product_rule_targets_v1
       where ingredient_resolution_status in ('NEEDS_REVIEW','EXCLUDED')),
      0::numeric,
      'No unresolved/excluded product identity should remain for a full-universe completion claim.'),
    ('SOURCE_REGIMENS_STRUCTURALLY_COMPLETE','foundation',
      (select count(*)::numeric from drx_dose.source_regimen_candidate_readiness_v1
       where structurally_complete),
      (select count(*)::numeric from drx_dose.source_regimen_candidate_readiness_v1),
      'Every staged source regimen must be structurally complete.'),
    ('SEMANTIC_DUPLICATES','foundation',
      ((select count(*) from drx_dose.source_adjustment_semantic_duplicates_v1)
       +(select count(*) from drx_dose.source_restriction_semantic_duplicates_v1))::numeric,
      0::numeric,
      'No semantic duplicate safety candidates should remain.'),

    ('CLINICAL_REGIMEN_REVIEW','clinical_review',
      (select count(*)::numeric from drx_dose.source_regimen_candidates_v1
       where review_status='APPROVED'),
      (select count(*)::numeric from drx_dose.source_regimen_candidates_v1),
      'All source-backed regimens must receive explicit clinical approval before promotion.'),
    ('SOURCE_EVIDENCE_REVIEW','clinical_review',
      (select count(*)::numeric from drx_dose.source_regimen_supporting_evidence_v1
       where review_status='VERIFIED'),
      (select count(*)::numeric from drx_dose.source_regimen_supporting_evidence_v1),
      'Supporting evidence rows must be explicitly verified.'),
    ('PRESENTATION_REQUIREMENT_REVIEW','clinical_review',
      (select count(*)::numeric from drx_dose.source_regimen_step_presentation_requirements_v1
       where review_status='VERIFIED'),
      (select count(*)::numeric from drx_dose.source_regimen_step_presentation_requirements_v1),
      'Product-strength/form requirements must be explicitly reviewed.'),
    ('ADMINISTRATION_REQUIREMENT_REVIEW','clinical_review',
      (select count(*)::numeric from drx_dose.source_regimen_step_administration_v1
       where review_status='VERIFIED'),
      (select count(*)::numeric from drx_dose.source_regimen_step_administration_v1),
      'Food/timing administration requirements must be explicitly reviewed.'),
    ('INDICATION_PUBLICATION','clinical_review',
      (select count(*)::numeric from public.dose_indication_concepts_v3
       where editorial_status='published'),
      (select count(*)::numeric from public.dose_indication_concepts_v3),
      'Draft indication concepts must be reviewed/published or retired.'),
    ('ICD_VERIFICATION','clinical_review',
      (select count(*)::numeric from public.dose_indication_concepts_v3
       where icd_verification_status='verified'),
      (select count(*)::numeric from public.dose_indication_concepts_v3),
      'Indication ICD mappings must be explicitly verified when ICD is part of the final contract.'),

    ('PROMOTION_GATE_READY','promotion',
      (select count(*)::numeric from drx_dose.source_regimen_promotion_gate_v2
       where promotion_ready),
      (select count(*)::numeric from drx_dose.source_regimen_promotion_gate_v2),
      'Every approved regimen must clear source, indication, presentation and administration gates.'),
    ('RULE_PRODUCT_COMPATIBILITY_APPROVED','promotion',
      (select count(*)::numeric from drx_dose.rule_product_compatibility_reviews_v1
       where review_status='APPROVED'),
      (select count(*)::numeric from drx_dose.rule_product_compatibility_reviews_v1),
      'Compatibility review is required only where strict inheritance cannot be proven automatically.'),

    ('AUTO_PUBLISH_DISABLED','runtime',
      0::numeric,0::numeric,
      'Auto-publish must remain disabled for clinical safety.'),
    ('RUNTIME_CUTOVER','runtime',
      (case when coalesce((select (j->>'runtimeServeEnabledV2')::boolean from s),false) then 1 else 0 end)::numeric,
      1::numeric,
      'Runtime serving is the last gate and should be enabled only after clinical/promotion completion.')
  ) v(check_key,stage,current_value,target_value,meaning)
)
select
  check_key,stage,current_value,target_value,
  current_value=target_value as ready,
  meaning,
  false::boolean as auto_override_allowed
from items;

create or replace view drx_dose.phase11_completion_summary_v1 as
select
  bool_and(ready) filter (where stage='foundation') as foundation_complete,
  bool_and(ready) filter (where stage='clinical_review') as clinical_review_complete,
  bool_and(ready) filter (where stage='promotion') as promotion_complete,
  bool_and(ready) filter (where stage='runtime') as runtime_complete,
  count(*) filter (where not ready and stage='foundation') as foundation_blockers,
  count(*) filter (where not ready and stage='clinical_review') as clinical_review_blockers,
  count(*) filter (where not ready and stage='promotion') as promotion_blockers,
  count(*) filter (where not ready and stage='runtime') as runtime_blockers,
  array_agg(check_key order by stage,check_key) filter (where not ready) as blocking_checks,
  false::boolean as auto_finish_allowed
from drx_dose.phase11_completion_checklist_v1;

create or replace view drx_dose.clinical_review_batch_summary_v1 as
with base as (
  select
    p.regimen_key,
    p.substance_concept_id,
    p.substance_name,
    p.review_status,
    p.clinical_review_ready,
    jsonb_array_length(p.supporting_evidence) as evidence_rows,
    jsonb_array_length(p.presentation_requirements) as presentation_rows,
    jsonb_array_length(p.administration_requirements) as administration_rows,
    jsonb_array_length(p.linked_indications) as linked_indication_rows,
    coalesce(t.product_count,0) as represented_product_count
  from drx_dose.source_regimen_clinical_review_packet_v1 p
  left join drx_dose.dose_target_catalog_v1 t
    on t.dose_moiety_concept_ids=array[p.substance_concept_id]::uuid[]
)
select
  substance_concept_id,
  max(substance_name) as substance_name,
  count(*) as regimen_count,
  count(*) filter (where clinical_review_ready) as review_ready_regimens,
  count(*) filter (where review_status='APPROVED') as approved_regimens,
  sum(evidence_rows) as evidence_rows,
  sum(presentation_rows) as presentation_rows,
  sum(administration_rows) as administration_rows,
  sum(linked_indication_rows) as linked_indication_rows,
  max(represented_product_count) as represented_product_count,
  (
    max(represented_product_count)*100
    + count(*)*20
    + sum(evidence_rows)*2
  )::integer as batch_priority_score,
  case
    when count(*) filter (where review_status='APPROVED')=count(*)
      then 'REVIEW_COMPLETE'
    when count(*) filter (where clinical_review_ready)=count(*)
      then 'READY_FOR_CLINICAL_REVIEW'
    else 'COMPLETE_REVIEW_PACKETS'
  end as next_action,
  false::boolean as auto_approve_allowed
from base
group by substance_concept_id;

revoke all on drx_dose.phase11_completion_checklist_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_completion_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.clinical_review_batch_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_completion_checklist_v1 to service_role;
grant select on drx_dose.phase11_completion_summary_v1 to service_role;
grant select on drx_dose.clinical_review_batch_summary_v1 to service_role;
