
-- DRx Phase 11AQ: ensure every source-regimen candidate carries its own captured
-- source as PRIMARY evidence, then rank clinical-review work by product impact.
-- Evidence remains PENDING until reviewed.

insert into drx_dose.source_regimen_supporting_evidence_v1(
  regimen_key,source_snapshot_id,source_section_code,source_section_sha256,
  source_url,evidence_role,review_status
)
select
  r.regimen_key,
  r.source_snapshot_id,
  '4.2',
  r.source_section_sha256,
  r.source_url,
  'PRIMARY',
  'PENDING'
from drx_dose.source_regimen_candidates_v1 r
where exists (
  select 1
  from public.dose_source_sections_v3 s
  where s.snapshot_id=r.source_snapshot_id
    and s.section_code='4.2'
    and s.section_sha256=r.source_section_sha256
    and s.extraction_status='extracted'
)
on conflict (regimen_key,source_snapshot_id,source_section_sha256) do nothing;

create or replace view drx_dose.source_regimen_review_priority_v1 as
select
  p.regimen_key,
  p.substance_concept_id,
  p.substance_name,
  p.indication_label,
  p.patient_group,
  p.route_key,
  p.form_family,
  p.regimen_kind,
  p.clinical_review_ready,
  p.review_status,
  coalesce(t.product_count,0) as represented_product_count,
  coalesce(t.strict_ready_product_count,0) as strict_ready_product_count,
  coalesce(t.verified_rule_target_count,0) as verified_rule_target_count,
  g.promotion_blockers,
  (
    coalesce(t.product_count,0) * 100
    + coalesce(t.strict_ready_product_count,0) * 10
    + case when p.clinical_review_ready then 500 else 0 end
    + case when p.patient_group='pediatric_only' then 100 else 0 end
  )::integer as review_priority_score,
  case
    when not p.clinical_review_ready then 'COMPLETE_REVIEW_PACKET'
    when p.review_status<>'APPROVED' then 'CLINICAL_REVIEW'
    when cardinality(g.promotion_blockers)>0 then 'CLEAR_PROMOTION_BLOCKERS'
    else 'PROMOTION_GATE_READY'
  end as next_action,
  false::boolean as auto_approve_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.source_regimen_clinical_review_packet_v1 p
left join drx_dose.dose_target_catalog_v1 t
  on t.dose_moiety_concept_ids = array[p.substance_concept_id]::uuid[]
left join drx_dose.source_regimen_promotion_gate_v2 g
  on g.regimen_key=p.regimen_key;

revoke all on drx_dose.source_regimen_review_priority_v1 from public,anon,authenticated;
grant select on drx_dose.source_regimen_review_priority_v1 to service_role;
