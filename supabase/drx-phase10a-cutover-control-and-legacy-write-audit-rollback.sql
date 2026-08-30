-- Rollback DRx Phase 10A.
-- Refuse rollback after later Phase 10 work or after operational evidence exists.

do $$
begin
  if exists (
    select 1
    from supabase_migrations.schema_migrations
    where version>'20260830230458'
      and name like 'drx_phase10%'
  ) then
    raise exception 'Phase 10A rollback blocked: later Phase 10 migration history exists';
  end if;

  if exists (select 1 from drx_runtime.phase10_gate_evidence_v1)
     or exists (select 1 from drx_runtime.phase10_soak_windows_v1)
     or exists (select 1 from drx_runtime.phase10_rollback_drills_v1)
     or exists (select 1 from drx_runtime.phase10_legacy_write_events_v1) then
    raise exception 'Phase 10A rollback blocked: Phase 10 operational evidence exists';
  end if;
end
$$;

drop trigger if exists phase10_legacy_write_audit on public.dose_products_v2;
drop trigger if exists phase10_legacy_write_audit on public.dose_rules_v2;
drop trigger if exists phase10_legacy_write_audit on public.dose_rule_products_v2;
drop trigger if exists phase10_legacy_write_audit on public.dose_indications_v2;
drop trigger if exists phase10_legacy_write_audit on public.dose_sources_v2;

drop function if exists public.drx_phase10_status_v1();
drop function if exists drx_runtime.phase10_audit_legacy_write_v1();

drop trigger if exists phase10_gate_evidence_append_only_v1 on drx_runtime.phase10_gate_evidence_v1;
drop trigger if exists phase10_rollback_drills_append_only_v1 on drx_runtime.phase10_rollback_drills_v1;
drop trigger if exists phase10_legacy_write_events_append_only_v1 on drx_runtime.phase10_legacy_write_events_v1;

drop function if exists drx_runtime.phase10_append_only_guard_v1();

drop table if exists drx_runtime.phase10_legacy_write_events_v1;
drop table if exists drx_runtime.phase10_rollback_drills_v1;
drop table if exists drx_runtime.phase10_soak_windows_v1;
drop table if exists drx_runtime.phase10_gate_evidence_v1;
drop table if exists drx_runtime.phase10_cutover_control_v1;
