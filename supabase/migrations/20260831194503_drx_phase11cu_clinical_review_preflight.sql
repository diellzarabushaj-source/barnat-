-- DRx Phase 11CU: final per-regimen clinical review preflight.
-- Separates technical integrity blockers from human clinical-review blockers.
-- No row is auto-reviewed, auto-approved, auto-published or runtime-enabled.

create or replace view drx_dose.phase11_clinical_review_preflight_v1
with (security_invoker=true)
as
select
  r.regimen_key,
  r.review_status,
  r.indication_id,
  g.structurally_complete,
  g.evidence_count,
  g.primary_evidence_count,
  g.verified_evidence_count,
  g.verified_primary_evidence_count,
  g.pending_presentation_count,
  g.pending_administration_count,
  g.pending_safety_count,
  g.linked_indication_count,
  g.pending_linked_indication_count,
  g.indication_editorial_status,
  g.icd_verification_status,
  array_remove(array[
    case when not g.structurally_complete then 'REGIMEN_STRUCTURE_INCOMPLETE' end,
    case when exists (
      select 1 from drx_dose.phase11_evidence_integrity_precheck_v1 e
      where e.regimen_key=r.regimen_key and cardinality(e.integrity_blockers)>0
    ) then 'EVIDENCE_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_safety_integrity_precheck_v1 s
      where s.regimen_key=r.regimen_key and cardinality(s.integrity_blockers)>0
    ) then 'SAFETY_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_presentation_integrity_precheck_v1 p
      where p.regimen_key=r.regimen_key and cardinality(p.integrity_blockers)>0
    ) then 'PRESENTATION_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_administration_integrity_precheck_v1 a
      where a.regimen_key=r.regimen_key and cardinality(a.integrity_blockers)>0
    ) then 'ADMINISTRATION_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_indication_icd_integrity_precheck_v1 i
      where i.indication_id=r.indication_id and cardinality(i.integrity_blockers)>0
    ) then 'INDICATION_ICD_INTEGRITY_BLOCKED' end
  ],null) as technical_integrity_blockers,
  array_remove(array[
    case when g.evidence_count=0 then 'SOURCE_EVIDENCE_MISSING' end,
    case when g.primary_evidence_count=0 then 'PRIMARY_EVIDENCE_MISSING' end,
    case when g.verified_evidence_count<>g.evidence_count
      or g.verified_primary_evidence_count=0
      then 'EVIDENCE_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_presentation_count>0
      then 'PRESENTATION_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_administration_count>0
      then 'ADMINISTRATION_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_safety_count>0
      then 'SAFETY_HUMAN_REVIEW_REQUIRED' end,
    case when r.indication_id is null
      or g.indication_editorial_status<>'published'
      or g.icd_verification_status<>'verified'
      then 'INDICATION_ICD_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_linked_indication_count>0
      then 'LINKED_INDICATION_HUMAN_REVIEW_REQUIRED' end
  ],null) as upstream_human_review_blockers,
  cardinality(array_remove(array[
    case when not g.structurally_complete then 'REGIMEN_STRUCTURE_INCOMPLETE' end,
    case when exists (
      select 1 from drx_dose.phase11_evidence_integrity_precheck_v1 e
      where e.regimen_key=r.regimen_key and cardinality(e.integrity_blockers)>0
    ) then 'EVIDENCE_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_safety_integrity_precheck_v1 s
      where s.regimen_key=r.regimen_key and cardinality(s.integrity_blockers)>0
    ) then 'SAFETY_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_presentation_integrity_precheck_v1 p
      where p.regimen_key=r.regimen_key and cardinality(p.integrity_blockers)>0
    ) then 'PRESENTATION_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_administration_integrity_precheck_v1 a
      where a.regimen_key=r.regimen_key and cardinality(a.integrity_blockers)>0
    ) then 'ADMINISTRATION_INTEGRITY_BLOCKED' end,
    case when exists (
      select 1 from drx_dose.phase11_indication_icd_integrity_precheck_v1 i
      where i.indication_id=r.indication_id and cardinality(i.integrity_blockers)>0
    ) then 'INDICATION_ICD_INTEGRITY_BLOCKED' end
  ],null))=0 as technical_integrity_ready,
  cardinality(array_remove(array[
    case when g.evidence_count=0 then 'SOURCE_EVIDENCE_MISSING' end,
    case when g.primary_evidence_count=0 then 'PRIMARY_EVIDENCE_MISSING' end,
    case when g.verified_evidence_count<>g.evidence_count
      or g.verified_primary_evidence_count=0
      then 'EVIDENCE_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_presentation_count>0
      then 'PRESENTATION_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_administration_count>0
      then 'ADMINISTRATION_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_safety_count>0
      then 'SAFETY_HUMAN_REVIEW_REQUIRED' end,
    case when r.indication_id is null
      or g.indication_editorial_status<>'published'
      or g.icd_verification_status<>'verified'
      then 'INDICATION_ICD_HUMAN_REVIEW_REQUIRED' end,
    case when g.pending_linked_indication_count>0
      then 'LINKED_INDICATION_HUMAN_REVIEW_REQUIRED' end
  ],null))=0 as upstream_human_review_complete,
  false::boolean as auto_approve_allowed
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_regimen_clinical_approval_gate_v1 g using(regimen_key);

create or replace view drx_dose.phase11_clinical_review_preflight_summary_v1
with (security_invoker=true)
as
select
  count(*) as regimen_total,
  count(*) filter (where technical_integrity_ready) as technical_integrity_ready,
  count(*) filter (where not technical_integrity_ready) as technical_integrity_blocked,
  count(*) filter (where upstream_human_review_complete) as upstream_human_review_complete,
  count(*) filter (
    where technical_integrity_ready
      and upstream_human_review_complete
      and review_status='PENDING'
  ) as ready_for_human_clinical_attestation,
  count(*) filter (where review_status='APPROVED') as clinically_approved,
  count(*) filter (where review_status='PENDING') as clinically_pending,
  false::boolean as auto_approve_allowed
from drx_dose.phase11_clinical_review_preflight_v1;

revoke all on drx_dose.phase11_clinical_review_preflight_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_clinical_review_preflight_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_clinical_review_preflight_v1 to service_role;
grant select on drx_dose.phase11_clinical_review_preflight_summary_v1 to service_role;
