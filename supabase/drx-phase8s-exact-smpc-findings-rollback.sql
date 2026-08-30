-- DRx Phase 8S rollback.
-- Exact SmPC snapshot provenance is intentionally retained.
do $$
begin
  if to_regclass('drx_dose.phase8_clinical_rule_findings_v1') is not null
     and exists (
       select 1 from drx_dose.phase8_clinical_rule_findings_v1
       where review_status<>'PENDING' or reviewed_by is not null or reviewed_at is not null
     ) then
    raise exception 'Phase 8S rollback blocked: reviewed clinical findings exist';
  end if;
end;
$$;

drop function if exists public.drx_phase8_clinical_correction_packet_v1();



drop table if exists drx_dose.phase8_clinical_rule_findings_v1;
