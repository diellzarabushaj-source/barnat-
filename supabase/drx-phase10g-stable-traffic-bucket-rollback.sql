-- Rollback DRx Phase 10G.
-- Allowed only before stable-cohort runtime evidence or a later control transition exists.

do $$
declare
  v_mode text;
  v_version integer;
  v_events integer;
begin
  select mode,version_no into v_mode,v_version
  from drx_runtime.phase10_cutover_control_v1
  where singleton
  for update;

  select count(*)::integer into v_events
  from drx_runtime.phase10_runtime_events_v1;

  if v_mode<>'SHADOW' or v_version<>3 or v_events<>0 then
    raise exception 'Phase 10G rollback blocked: control has advanced or runtime evidence exists';
  end if;
end
$$;

create or replace function public.drx_phase10_cutover_state_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
select jsonb_build_object(
  'stateVersion','drx-phase10-cutover-state-v1',
  'mode',c.mode,
  'controlledPercent',c.controlled_percent,
  'strictArmed',c.strict_armed,
  'controlVersion',c.version_no,
  'rollbackTarget',c.rollback_target,
  'strictActivationSupported',false,
  'updatedAt',c.updated_at
)
from drx_runtime.phase10_cutover_control_v1 c
where c.singleton
$$;

revoke all on function public.drx_phase10_cutover_state_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase10_cutover_state_v1()
  to service_role;

alter table drx_runtime.phase10_cutover_control_v1
  drop constraint if exists phase10_cutover_control_traffic_bucket_version_check;

alter table drx_runtime.phase10_cutover_control_v1
  drop column if exists traffic_bucket_version;
