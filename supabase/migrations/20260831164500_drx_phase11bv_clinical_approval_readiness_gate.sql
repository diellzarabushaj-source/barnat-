
-- DRx Phase 11BV: explicit clinical-approval readiness gate.
-- Separates "ready for a human to approve" from promotion/runtime readiness.

create or replace view drx_dose.source_regimen_clinical_approval_gate_v1 as
with q as (
  select
    r.regimen_key,
    r.review_status,
    ready.structurally_complete,
    r.indication_id,
    i.editorial_status as indication_editorial_status,
    i.icd_verification_status,
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key) as evidence_count,
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key and e.evidence_role='PRIMARY') as primary_evidence_count,
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key and e.review_status='VERIFIED') as verified_evidence_count,
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=r.regimen_key and e.evidence_role='PRIMARY' and e.review_status='VERIFIED') as verified_primary_evidence_count,
    (select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1 p
      where p.regimen_key=r.regimen_key and p.review_status<>'VERIFIED') as pending_presentation_count,
    (select count(*) from drx_dose.source_regimen_step_administration_v1 a
      where a.regimen_key=r.regimen_key and a.review_status<>'VERIFIED') as pending_administration_count,
    (select count(*) from drx_dose.source_regimen_applicable_safety_v2 s
      where s.regimen_key=r.regimen_key and s.review_status not in ('APPROVED','PROMOTED','REJECTED')) as pending_safety_count,
    (select count(*) from drx_dose.source_regimen_indication_links_v1 l
      where l.regimen_key=r.regimen_key) as linked_indication_count,
    (select count(*) from drx_dose.source_regimen_indication_links_v1 l
      left join public.dose_indication_concepts_v3 li on li.indication_id=l.indication_id
      where l.regimen_key=r.regimen_key
        and (
          l.link_status<>'VERIFIED'
          or li.indication_id is null
          or li.editorial_status<>'published'
          or li.icd_verification_status<>'verified'
        )
    ) as pending_linked_indication_count
  from drx_dose.source_regimen_candidates_v1 r
  join drx_dose.source_regimen_candidate_readiness_v1 ready using(regimen_key)
  left join public.dose_indication_concepts_v3 i on i.indication_id=r.indication_id
)
select
  q.*,
  array_remove(array[
    case when not q.structurally_complete then 'REGIMEN_STRUCTURE' end,
    case when q.evidence_count=0 then 'SOURCE_EVIDENCE_MISSING' end,
    case when q.primary_evidence_count=0 then 'PRIMARY_EVIDENCE_MISSING' end,
    case when q.verified_evidence_count<>q.evidence_count then 'EVIDENCE_REVIEW_INCOMPLETE' end,
    case when q.verified_primary_evidence_count=0 then 'PRIMARY_EVIDENCE_NOT_VERIFIED' end,
    case when q.pending_presentation_count>0 then 'PRESENTATION_REVIEW_INCOMPLETE' end,
    case when q.pending_administration_count>0 then 'ADMINISTRATION_REVIEW_INCOMPLETE' end,
    case when q.pending_safety_count>0 then 'SAFETY_REVIEW_INCOMPLETE' end,
    case when q.indication_id is null then 'PRIMARY_INDICATION_MISSING' end,
    case when q.indication_id is not null and (
      q.indication_editorial_status<>'published'
      or q.icd_verification_status<>'verified'
    ) then 'PRIMARY_INDICATION_NOT_PUBLISHED_ICD_VERIFIED' end,
    case when q.pending_linked_indication_count>0 then 'LINKED_INDICATION_REVIEW_INCOMPLETE' end
  ],null) as clinical_approval_blockers,
  (
    q.structurally_complete
    and q.evidence_count>0
    and q.primary_evidence_count>0
    and q.verified_evidence_count=q.evidence_count
    and q.verified_primary_evidence_count>0
    and q.pending_presentation_count=0
    and q.pending_administration_count=0
    and q.pending_safety_count=0
    and q.indication_id is not null
    and q.indication_editorial_status='published'
    and q.icd_verification_status='verified'
    and q.pending_linked_indication_count=0
  ) as ready_for_clinical_approval,
  false::boolean as auto_approve_allowed
from q;

create or replace view drx_dose.source_regimen_clinical_approval_summary_v1 as
select
  count(*) as regimen_total,
  count(*) filter (where ready_for_clinical_approval) as ready_for_clinical_approval,
  count(*) filter (where review_status='APPROVED') as approved,
  count(*) filter (where review_status='PENDING') as pending,
  count(*) filter (where review_status='REJECTED') as rejected,
  false::boolean as auto_approve_allowed
from drx_dose.source_regimen_clinical_approval_gate_v1;

create or replace function public.drx_phase11_regimen_review_packet_v2(p_regimen_key text)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select
  public.drx_phase11_regimen_review_packet_v1(p_regimen_key)
  ||
  jsonb_build_object(
    'clinicalApprovalGate',
    (select to_jsonb(g)
     from drx_dose.source_regimen_clinical_approval_gate_v1 g
     where g.regimen_key=p_regimen_key),
    'reviewEvents',
    coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from drx_dose.phase11_review_events_v1 e
      where e.regimen_key=p_regimen_key
    ),'[]'::jsonb)
  );
$$;

revoke all on drx_dose.source_regimen_clinical_approval_gate_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_clinical_approval_summary_v1 from public,anon,authenticated;
grant select on drx_dose.source_regimen_clinical_approval_gate_v1 to service_role;
grant select on drx_dose.source_regimen_clinical_approval_summary_v1 to service_role;

revoke all on function public.drx_phase11_regimen_review_packet_v2(text) from public,anon,authenticated;
grant execute on function public.drx_phase11_regimen_review_packet_v2(text) to service_role;
