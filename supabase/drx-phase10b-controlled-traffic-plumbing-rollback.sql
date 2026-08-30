-- Rollback DRx Phase 10B.
-- Safe only before controlled traffic/runtime telemetry has been used.

do $$
declare
  v_mode text;
  v_percent integer;
  v_version integer;
  v_strict boolean;
begin
  if exists (
    select 1
    from supabase_migrations.schema_migrations
    where version>'20260830231042'
      and name like 'drx_phase10%'
  ) then
    raise exception 'Phase 10B rollback blocked: later Phase 10 migration history exists';
  end if;

  if exists (select 1 from drx_runtime.phase10_cutover_events_v1)
     or exists (select 1 from drx_runtime.phase10_runtime_events_v1) then
    raise exception 'Phase 10B rollback blocked: cutover/runtime evidence exists';
  end if;

  select mode,controlled_percent,version_no,strict_armed
    into v_mode,v_percent,v_version,v_strict
  from drx_runtime.phase10_cutover_control_v1
  where singleton;

  if v_mode<>'SHADOW' or v_percent<>0 or v_version<>1 or v_strict then
    raise exception 'Phase 10B rollback blocked: cutover control has changed';
  end if;
end
$$;

drop function if exists public.drx_phase10_record_runtime_event_v1(jsonb);
drop function if exists public.drx_phase10_set_controlled_traffic_v1(jsonb);
drop function if exists public.drx_phase10_cutover_state_v1();

drop trigger if exists phase10_runtime_events_append_only_v1 on drx_runtime.phase10_runtime_events_v1;
drop trigger if exists phase10_cutover_events_append_only_v1 on drx_runtime.phase10_cutover_events_v1;

drop table if exists drx_runtime.phase10_runtime_events_v1;
drop table if exists drx_runtime.phase10_cutover_events_v1;
