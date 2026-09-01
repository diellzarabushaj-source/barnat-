with reviewed_source as (
  select distinct on (ip.indication_id)
    ip.indication_id,
    cr.reviewed_by,
    cr.reviewed_at,
    cr.review_note,
    cr.review_attestation_version
  from drx_dose.phase8_pilot_indication_provenance_v1 ip
  join drx_dose.phase8_pilot_clinical_references_v1 cr
    on cr.clinical_reference_id = ip.clinical_reference_id
  where cr.evidence_review_status = 'VERIFIED'
    and cr.reviewer_role = 'CLINICAL_REVIEWER'
    and nullif(btrim(cr.reviewed_by),'') is not null
    and cr.reviewed_at is not null
  order by ip.indication_id, cr.reviewed_at desc
)
update public.dose_indication_concepts_v3 i
set editorial_status = 'in_review',
    reviewed_by = r.reviewed_by,
    reviewed_at = r.reviewed_at,
    review_note = concat_ws(
      ' ',
      nullif(btrim(i.review_note),''),
      'Source-label review provenance retained from verified Phase 8 clinical reference (' ||
        coalesce(r.review_attestation_version,'attested-review') ||
      '); publication withdrawn pending ICD-10 verification.'
    ),
    updated_at = now()
from reviewed_source r
where i.indication_id = r.indication_id
  and i.editorial_status = 'published'
  and i.icd_verification_status <> 'verified';

alter table public.dose_indication_concepts_v3
  validate constraint dose_indication_concepts_v3_review_provenance_check;
