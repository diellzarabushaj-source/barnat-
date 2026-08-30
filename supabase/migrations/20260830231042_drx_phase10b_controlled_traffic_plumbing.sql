create table if not exists drx_runtime.phase10_cutover_events_v1 (
  event_id bigint generated always as identity primary key,
  from_mode text not null check (from_mode in ('SHADOW','CONTROLLED','STRICT')),
  to_mode text not null check (to_mode in ('SHADOW','CONTROLLED')),
  from_percent integer not null check (from_percent between 0 and 100),
  to_percent integer not null check (to_percent between 0 and 10),
  from_version integer not null check (from_version>0),
  to_version integer not null check (to_version>from_version),
  db_role text not null,
  reason text not null check (char_length(reason) between 12 and 500),
  occurred_at timestamptz not null default now()
);

create table if not exists drx_runtime.phase10_runtime_events_v1 (
  event_id bigint generated always as identity primary key,
  selector_kind text not null check (selector_kind in ('product_key','drug_id','registry_number')),
  selector_sha256 text not null check (selector_sha256 ~ '^[0-9a-f]{64}$'),
  control_version integer not null check (control_version>0),
  mode text not null check (mode in ('SHADOW','CONTROLLED','STRICT')),
  traffic_bucket integer not null check (traffic_bucket between 0 and 99),
  selected_for_v3 boolean not null,
  runtime_served text not null check (runtime_served in ('v2','v2-shadow','v2-fallback','v3','none')),
  v3_available boolean,
  fallback_used boolean not null default false,
  outcome text not null check (outcome in ('SERVED','NOT_FOUND','ERROR','BLOCKED')),
  duration_ms integer not null check (duration_ms between 0 and 60000),
  occurred_at timestamptz not null default now()
);

create index if not exists phase10_runtime_events_time_idx
  on drx_runtime.phase10_runtime_events_v1(occurred_at desc);
create index if not exists phase10_runtime_events_mode_idx
  on drx_runtime.phase10_runtime_events_v1(mode,runtime_served,outcome,occurred_at desc);

alter table drx_runtime.phase10_cutover_events_v1 enable row level security;
alter table drx_runtime.phase10_cutover_events_v1 force row level security;
alter table drx_runtime.phase10_runtime_events_v1 enable row level security;
alter table drx_runtime.phase10_runtime_events_v1 force row level security;

revoke all on table drx_runtime.phase10_cutover_events_v1 from public,anon,authenticated,service_role;
revoke all on table drx_runtime.phase10_runtime_events_v1 from public,anon,authenticated,service_role;

drop trigger if exists phase10_cutover_events_append_only_v1 on drx_runtime.phase10_cutover_events_v1;
create trigger phase10_cutover_events_append_only_v1
before update or delete on drx_runtime.phase10_cutover_events_v1
for each row execute function drx_runtime.phase10_append_only_guard_v1();

drop trigger if exists phase10_runtime_events_append_only_v1 on drx_runtime.phase10_runtime_events_v1;
create trigger phase10_runtime_events_append_only_v1
before update or delete on drx_runtime.phase10_runtime_events_v1
for each row execute function drx_runtime.phase10_append_only_guard_v1();

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

create or replace function public.drx_phase10_set_controlled_traffic_v1(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
declare
  v_target text;
  v_percent integer;
  v_expected integer;
  v_reason text;
  v_current drx_runtime.phase10_cutover_control_v1%rowtype;
  v_p10 jsonb;
  v_from_mode text;
  v_from_percent integer;
  v_from_version integer;
begin
  if coalesce(p_request->>'requestVersion','')<>'drx-phase10-controlled-transition-v1' then
    raise exception 'Unsupported Phase 10 controlled transition request version';
  end if;

  v_target:=upper(btrim(coalesce(p_request->>'targetMode','')));
  if v_target='STRICT' then
    raise exception 'Strict cutover is locked until the final Phase 10 gate and 14-day soak pass';
  end if;
  if v_target not in ('SHADOW','CONTROLLED') then
    raise exception 'Phase 10 target mode must be SHADOW or CONTROLLED';
  end if;

  begin
    v_expected:=(p_request->>'expectedVersion')::integer;
  exception when others then
    raise exception 'expectedVersion must be an integer';
  end;

  v_reason:=btrim(coalesce(p_request->>'reason',''));
  if char_length(v_reason)<12 or char_length(v_reason)>500 then
    raise exception 'Phase 10 transition reason must contain 12..500 characters';
  end if;

  if v_target='SHADOW' then
    v_percent:=0;
  else
    begin
      v_percent:=(p_request->>'controlledPercent')::integer;
    exception when others then
      raise exception 'controlledPercent must be an integer';
    end;
    if v_percent not in (1,5,10) then
      raise exception 'Controlled traffic is limited to 1, 5, or 10 percent in Phase 10B';
    end if;
  end if;

  select * into v_current
  from drx_runtime.phase10_cutover_control_v1
  where singleton
  for update;

  if not found then
    raise exception 'Phase 10 cutover control row is missing';
  end if;
  if v_current.version_no<>v_expected then
    raise exception 'Stale Phase 10 control version: expected %, live %',v_expected,v_current.version_no;
  end if;

  v_from_mode:=v_current.mode;
  v_from_percent:=v_current.controlled_percent;
  v_from_version:=v_current.version_no;

  if v_target='CONTROLLED' then
    if v_current.mode='STRICT' then
      raise exception 'Rollback to SHADOW before entering CONTROLLED mode';
    end if;

    v_p10:=public.drx_phase10_status_v1();
    if coalesce((v_p10->>'phase9Closed')::boolean,false) is not true
       or coalesce((v_p10->>'phase10AllowedByPhase9')::boolean,false) is not true
       or coalesce((v_p10->>'effectiveParityCurrent')::boolean,false) is not true then
      raise exception 'Controlled traffic blocked: Phase 9 or current effective parity gate is not satisfied';
    end if;
  end if;

  update drx_runtime.phase10_cutover_control_v1
  set
    mode=v_target,
    controlled_percent=v_percent,
    strict_armed=false,
    updated_at=now(),
    version_no=version_no+1,
    note=v_reason
  where singleton
  returning * into v_current;

  insert into drx_runtime.phase10_cutover_events_v1(
    from_mode,to_mode,from_percent,to_percent,from_version,to_version,db_role,reason
  )
  values(
    v_from_mode,
    v_current.mode,
    v_from_percent,
    v_current.controlled_percent,
    v_from_version,
    v_current.version_no,
    current_user,
    v_reason
  );

  return public.drx_phase10_cutover_state_v1();
end
$$;

revoke all on function public.drx_phase10_set_controlled_traffic_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase10_set_controlled_traffic_v1(jsonb)
  to service_role;

create or replace function public.drx_phase10_record_runtime_event_v1(p_event jsonb)
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
declare
  v_id bigint;
  v_selector_kind text:=btrim(coalesce(p_event->>'selectorKind',''));
  v_selector_hash text:=lower(btrim(coalesce(p_event->>'selectorSha256','')));
  v_mode text:=upper(btrim(coalesce(p_event->>'mode','')));
  v_runtime text:=lower(btrim(coalesce(p_event->>'runtimeServed','')));
  v_outcome text:=upper(btrim(coalesce(p_event->>'outcome','')));
  v_control_version integer;
  v_bucket integer;
  v_duration integer;
begin
  if coalesce(p_event->>'eventVersion','')<>'drx-phase10-runtime-event-v1' then
    raise exception 'Unsupported Phase 10 runtime event version';
  end if;
  if v_selector_kind not in ('product_key','drug_id','registry_number') then
    raise exception 'Invalid Phase 10 runtime selector kind';
  end if;
  if v_selector_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid Phase 10 selector hash';
  end if;
  if v_mode not in ('SHADOW','CONTROLLED','STRICT') then
    raise exception 'Invalid Phase 10 runtime mode';
  end if;
  if v_runtime not in ('v2','v2-shadow','v2-fallback','v3','none') then
    raise exception 'Invalid Phase 10 served runtime';
  end if;
  if v_outcome not in ('SERVED','NOT_FOUND','ERROR','BLOCKED') then
    raise exception 'Invalid Phase 10 runtime outcome';
  end if;

  begin
    v_control_version:=(p_event->>'controlVersion')::integer;
    v_bucket:=(p_event->>'trafficBucket')::integer;
    v_duration:=(p_event->>'durationMs')::integer;
  exception when others then
    raise exception 'Phase 10 runtime numeric fields are invalid';
  end;
  if v_control_version<=0 or v_bucket<0 or v_bucket>99 or v_duration<0 or v_duration>60000 then
    raise exception 'Phase 10 runtime numeric field is out of range';
  end if;

  insert into drx_runtime.phase10_runtime_events_v1(
    selector_kind,selector_sha256,control_version,mode,traffic_bucket,
    selected_for_v3,runtime_served,v3_available,fallback_used,outcome,duration_ms
  )
  values(
    v_selector_kind,
    v_selector_hash,
    v_control_version,
    v_mode,
    v_bucket,
    coalesce((p_event->>'selectedForV3')::boolean,false),
    v_runtime,
    case when p_event ? 'v3Available' then (p_event->>'v3Available')::boolean else null end,
    coalesce((p_event->>'fallbackUsed')::boolean,false),
    v_outcome,
    v_duration
  )
  returning event_id into v_id;

  return v_id;
end
$$;

revoke all on function public.drx_phase10_record_runtime_event_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase10_record_runtime_event_v1(jsonb)
  to service_role;
