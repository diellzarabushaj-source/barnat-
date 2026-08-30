-- DRx Phase 8T rollback.
-- Refuses to erase reviewer-attestation metadata once a decision exists.
do $$
begin
  if exists (
    select 1
    from drx_dose.phase8_clinical_rule_findings_v1
    where review_status<>'PENDING'
       or reviewed_by is not null
       or reviewed_at is not null
       or reviewer_role is not null
       or review_attestation_version is not null
  ) then
    raise exception 'Phase 8T rollback blocked: clinical finding review decisions exist';
  end if;
end;
$$;

drop function if exists public.drx_phase8_review_clinical_finding_v1(jsonb);

drop trigger if exists drx_phase8_clinical_finding_review_guard
  on drx_dose.phase8_clinical_rule_findings_v1;

drop function if exists drx_dose.guard_phase8_clinical_finding_review_v1();

alter table drx_dose.phase8_clinical_rule_findings_v1
  drop constraint if exists phase8_clinical_rule_findings_reviewer_role_check;

alter table drx_dose.phase8_clinical_rule_findings_v1
  drop column if exists review_attestation_version,
  drop column if exists reviewer_role;
