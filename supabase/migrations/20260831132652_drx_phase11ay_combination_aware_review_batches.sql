
-- DRx Phase 11AY: make clinical-review batches work for both single substances
-- and combination ingredient sets.

drop view if exists drx_dose.clinical_review_batch_summary_v1;

create view drx_dose.clinical_review_batch_summary_v1 as
with base as (
  select
    r.regimen_key,
    r.dose_moiety_key,
    r.target_kind,
    r.review_status,
    p.clinical_review_ready,
    coalesce(
      nullif(array_to_string(t.dose_moiety_names,' + '),''),
      p.substance_name,
      r.dose_moiety_key
    ) as review_target_name,
    jsonb_array_length(p.supporting_evidence) as evidence_rows,
    jsonb_array_length(p.presentation_requirements) as presentation_rows,
    jsonb_array_length(p.administration_requirements) as administration_rows,
    jsonb_array_length(p.linked_indications) as linked_indication_rows,
    coalesce(t.product_count,0) as represented_product_count
  from drx_dose.source_regimen_candidates_v1 r
  join drx_dose.source_regimen_clinical_review_packet_v1 p
    on p.regimen_key=r.regimen_key
  left join drx_dose.dose_target_catalog_v1 t
    on t.dose_moiety_key=r.dose_moiety_key
)
select
  dose_moiety_key,
  max(target_kind) as target_kind,
  max(review_target_name) as review_target_name,
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
group by dose_moiety_key;

revoke all on drx_dose.clinical_review_batch_summary_v1 from public,anon,authenticated;
grant select on drx_dose.clinical_review_batch_summary_v1 to service_role;
