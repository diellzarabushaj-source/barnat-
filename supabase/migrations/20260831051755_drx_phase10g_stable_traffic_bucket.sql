alter table drx_runtime.phase10_cutover_control_v1
  add column if not exists traffic_bucket_version integer;

update drx_runtime.phase10_cutover_control_v1
set traffic_bucket_version=2
where singleton and traffic_bucket_version is null;

alter table drx_runtime.phase10_cutover_control_v1
  alter column traffic_bucket_version set default 2,
  alter column traffic_bucket_version set not null;

alter table drx_runtime.phase10_cutover_control_v1
  drop constraint if exists phase10_cutover_control_traffic_bucket_version_check;

alter table drx_runtime.phase10_cutover_control_v1
  add constraint phase10_cutover_control_traffic_bucket_version_check
  check (traffic_bucket_version=2);

create or replace function public.drx_phase10_cutover_state_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
select jsonb_build_object(
  'stateVersion','drx-phase10-cutover-state-v2',
  'mode',c.mode,
  'controlledPercent',c.controlled_percent,
  'strictArmed',c.strict_armed,
  'controlVersion',c.version_no,
  'trafficBucketVersion',c.traffic_bucket_version,
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
