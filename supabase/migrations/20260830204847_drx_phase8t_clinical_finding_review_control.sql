-- DRx Phase 8T: explicit clinical finding review control.
-- Review decisions are recorded only after clinical-reviewer attestation.
-- This migration never applies a dose correction and never enables publication.

alter table drx_dose.phase8_clinical_rule_findings_v1
  add column if not exists reviewer_role text,
  add column if not exists review_attestation_version text;

alter table drx_dose.phase8_clinical_rule_findings_v1
  drop constraint if exists phase8_clinical_rule_findings_reviewer_role_check;
alter table drx_dose.phase8_clinical_rule_findings_v1
  add constraint phase8_clinical_rule_findings_reviewer_role_check
  check (reviewer_role is null or reviewer_role='CLINICAL_REVIEWER');

create or replace function drx_dose.guard_phase8_clinical_finding_review_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,drx_dose
as $$
begin
  new.updated_at := now();

  if new.review_status in ('APPROVED','REJECTED','RESOLVED') then
    if nullif(btrim(new.reviewed_by),'') is null
       or new.reviewed_at is null
       or nullif(btrim(new.review_note),'') is null
       or new.reviewer_role<>'CLINICAL_REVIEWER'
       or new.review_attestation_version<>'drx-phase8-clinical-finding-attestation-v1' then
      raise exception 'Phase 8 clinical finding review blocked: complete clinical reviewer attestation is required';
    end if;
  end if;

  if new.review_status='RESOLVED' and old.review_status<>'APPROVED' then
    raise exception 'Phase 8 clinical finding resolution blocked: finding must first be APPROVED';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_phase8_clinical_finding_review_guard
  on drx_dose.phase8_clinical_rule_findings_v1;

create trigger drx_phase8_clinical_finding_review_guard
before insert or update
on drx_dose.phase8_clinical_rule_findings_v1
for each row execute function drx_dose.guard_phase8_clinical_finding_review_v1();

create or replace function public.drx_phase8_review_clinical_finding_v1(p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_row drx_dose.phase8_clinical_rule_findings_v1%rowtype;
  v_finding_id uuid;
  v_snapshot_id text := lower(coalesce(p_review->>'sourceSnapshotId',''));
  v_decision text := upper(coalesce(p_review->>'decision',''));
  v_reviewer text := nullif(btrim(p_review->>'reviewedBy'),'');
  v_note text := nullif(btrim(p_review->>'reviewNote'),'');
  v_role text := p_review->>'reviewerRole';
  v_attestation text := p_review->>'attestationVersion';
  v_attested boolean := coalesce((p_review->>'reviewerAttested')::boolean,false);
  v_status text;
begin
  if coalesce(p_review->>'reviewVersion','')<>'drx-phase8-clinical-finding-review-v1' then
    raise exception 'Phase 8 clinical finding review blocked: unsupported review payload version';
  end if;

  begin
    v_finding_id := (p_review->>'findingId')::uuid;
  exception when others then
    raise exception 'Phase 8 clinical finding review blocked: invalid findingId';
  end;

  if v_decision not in ('APPROVE_PROPOSED_ACTION','REJECT_FINDING') then
    raise exception 'Phase 8 clinical finding review blocked: unsupported decision';
  end if;

  if v_role<>'CLINICAL_REVIEWER'
     or v_attestation<>'drx-phase8-clinical-finding-attestation-v1'
     or not v_attested then
    raise exception 'Phase 8 clinical finding review blocked: clinical reviewer attestation is required';
  end if;

  if v_reviewer is null or v_note is null then
    raise exception 'Phase 8 clinical finding review blocked: reviewer identity and review note are required';
  end if;

  if v_snapshot_id !~ '^[0-9a-f]{64}$' then
    raise exception 'Phase 8 clinical finding review blocked: invalid source snapshot digest';
  end if;

  select *
  into v_row
  from drx_dose.phase8_clinical_rule_findings_v1
  where finding_id=v_finding_id
  for update;

  if not found then
    raise exception 'Phase 8 clinical finding review blocked: finding not found';
  end if;

  if v_row.review_status<>'PENDING' then
    raise exception 'Phase 8 clinical finding review blocked: finding is no longer pending';
  end if;

  if v_row.source_snapshot_id<>v_snapshot_id then
    raise exception 'Phase 8 clinical finding review blocked: stale or mismatched source snapshot';
  end if;

  v_status := case
    when v_decision='APPROVE_PROPOSED_ACTION' then 'APPROVED'
    else 'REJECTED'
  end;

  update drx_dose.phase8_clinical_rule_findings_v1
  set review_status=v_status,
      reviewed_by=v_reviewer,
      reviewed_at=now(),
      review_note=v_note,
      reviewer_role=v_role,
      review_attestation_version=v_attestation,
      automatic_resolution_allowed=false
  where finding_id=v_finding_id
  returning * into v_row;

  return jsonb_build_object(
    'findingId',v_row.finding_id,
    'drugId',v_row.drug_id,
    'ruleKey',v_row.v2_rule_key,
    'findingCode',v_row.finding_code,
    'severity',v_row.severity,
    'sourceSnapshotId',v_row.source_snapshot_id,
    'reviewStatus',v_row.review_status,
    'reviewedBy',v_row.reviewed_by,
    'reviewedAt',v_row.reviewed_at,
    'reviewerRole',v_row.reviewer_role,
    'correctionApplied',false,
    'publicationAllowed',false,
    'automaticResolutionAllowed',false
  );
end;
$$;

revoke all on function public.drx_phase8_review_clinical_finding_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase8_review_clinical_finding_v1(jsonb)
  to service_role;
