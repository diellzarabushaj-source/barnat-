do $$
begin
  if exists (
    select 1
    from drx_dose.phase8_pilot_clinical_references_v1
    where evidence_review_status in ('VERIFIED','REJECTED')
      and review_attestation_version='drx-phase8-clinical-review-attestation-v1'
  ) then
    raise exception 'Phase 8O rollback blocked: reviewed clinical-reference decisions exist';
  end if;
end
$$;

drop function if exists public.drx_phase8_review_clinical_reference_v1(jsonb);
drop function if exists public.drx_phase8_clinical_review_packet_v1();

create or replace function drx_dose.guard_phase8_clinical_reference_review_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
begin
  new.updated_at := now();

  if new.evidence_review_status<>'VERIFIED' then
    return new;
  end if;

  if new.source_status<>'INGESTED'
     or new.presentation_match_status<>'MATCHED'
     or new.source_snapshot_id is null then
    raise exception 'Phase 8 clinical reference verification blocked: source is not ingested and presentation-matched';
  end if;

  if not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    where s.snapshot_id=new.source_snapshot_id
      and s.source_key=new.source_key
      and s.source_tier=new.expected_source_tier
      and s.raw_sha256=new.source_snapshot_id
  ) then
    raise exception 'Phase 8 clinical reference verification blocked: snapshot provenance mismatch';
  end if;

  if not exists (
    select 1
    from public.dose_source_sections_v3 s2
    join public.dose_source_sections_v3 s41
      on s41.snapshot_id=s2.snapshot_id and s41.section_code='4.1'
    join public.dose_source_sections_v3 s42
      on s42.snapshot_id=s2.snapshot_id and s42.section_code='4.2'
    where s2.snapshot_id=new.source_snapshot_id
      and s2.section_code='2'
      and s2.extraction_status='extracted'
      and s41.extraction_status='extracted'
      and s42.extraction_status='extracted'
      and s2.section_sha256=new.section_2_sha256
      and s41.section_sha256=new.section_4_1_sha256
      and s42.section_sha256=new.section_4_2_sha256
  ) then
    raise exception 'Phase 8 clinical reference verification blocked: required extracted section hashes are missing or mismatched';
  end if;

  if nullif(btrim(new.reviewed_by),'') is null
     or new.reviewed_at is null
     or nullif(btrim(new.review_note),'') is null then
    raise exception 'Phase 8 clinical reference verification blocked: explicit reviewer decision is incomplete';
  end if;

  return new;
end;
$$;

alter table drx_dose.phase8_pilot_clinical_references_v1
  drop constraint if exists phase8_pilot_clinical_references_reviewer_role_check;

alter table drx_dose.phase8_pilot_clinical_references_v1
  drop column if exists review_attestation_version,
  drop column if exists reviewer_role;
