create table if not exists drx_dose.phase10_runtime_control_v1 (
  control_id text primary key check (control_id='primary'),
  mode text not null check (mode in ('V2_FALLBACK','SHADOW','CONTROLLED','V3_STRICT')),
  controlled_percent integer not null default 0 check (controlled_percent between 0 and 100),
  runtime_integration_active boolean not null default false,
  strict_unlocked boolean not null default false check (not strict_unlocked),
  phase9_status_version text not null,
  phase9_evidence_id text not null,
  phase9_exit_pass boolean not null check (phase9_exit_pass),
  controlled_started_at timestamptz,
  last_rollback_at timestamptz,
  rollback_count integer not null default 0 check (rollback_count >= 0),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  change_reason text not null
);

alter table drx_dose.phase10_runtime_control_v1 enable row level security;
alter table drx_dose.phase10_runtime_control_v1 force row level security;
revoke all on table drx_dose.phase10_runtime_control_v1
  from public,anon,authenticated,service_role;

create table if not exists drx_dose.phase10_runtime_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  change_id text not null unique check (char_length(change_id) between 8 and 120),
  from_mode text,
  to_mode text not null check (to_mode in ('V2_FALLBACK','SHADOW','CONTROLLED','V3_STRICT')),
  controlled_percent integer not null check (controlled_percent between 0 and 100),
  runtime_integration_active boolean not null,
  phase9_status_version text not null,
  phase9_evidence_id text not null,
  actor text not null,
  reason text not null check (char_length(reason) between 10 and 500),
  rollback_event boolean not null default false,
  created_at timestamptz not null default now()
);

alter table drx_dose.phase10_runtime_events_v1 enable row level security;
alter table drx_dose.phase10_runtime_events_v1 force row level security;
revoke all on table drx_dose.phase10_runtime_events_v1
  from public,anon,authenticated,service_role;

create or replace function drx_dose.guard_phase10_runtime_events_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,drx_dose
as $$
begin
  raise exception 'Phase 10 runtime events are immutable';
end
$$;

revoke all on function drx_dose.guard_phase10_runtime_events_immutable_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists phase10_runtime_events_immutable_v1
  on drx_dose.phase10_runtime_events_v1;

create trigger phase10_runtime_events_immutable_v1
before update or delete on drx_dose.phase10_runtime_events_v1
for each row execute function drx_dose.guard_phase10_runtime_events_immutable_v1();

insert into drx_dose.phase10_runtime_control_v1 (
  control_id,mode,controlled_percent,runtime_integration_active,strict_unlocked,
  phase9_status_version,phase9_evidence_id,phase9_exit_pass,
  updated_by,change_reason
)
select
  'primary',
  'V2_FALLBACK',
  0,
  false,
  false,
  s->>'statusVersion',
  s->>'technicalQaEvidenceId',
  coalesce((s->>'finalExitPass')::boolean,false),
  'phase10-bootstrap',
  'Phase 10 control plane initialized fail-closed; production runtime is not integrated yet.'
from (select public.drx_phase9_status_v1() s) q
where coalesce((s->>'finalExitPass')::boolean,false)
  and coalesce((s->>'phase10Allowed')::boolean,false)
on conflict (control_id) do nothing;

insert into drx_dose.phase10_runtime_events_v1 (
  change_id,from_mode,to_mode,controlled_percent,runtime_integration_active,
  phase9_status_version,phase9_evidence_id,actor,reason,rollback_event
)
select
  'phase10-bootstrap-v1',
  null,
  c.mode,
  c.controlled_percent,
  c.runtime_integration_active,
  c.phase9_status_version,
  c.phase9_evidence_id,
  'phase10-bootstrap',
  'Initial fail-closed Phase 10 control-plane state; no production traffic changed.',
  false
from drx_dose.phase10_runtime_control_v1 c
where c.control_id='primary'
on conflict (change_id) do nothing;

create or replace function public.drx_phase10_runtime_policy_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select jsonb_build_object(
  'policyVersion','drx-phase10-runtime-policy-v1',
  'mode',c.mode,
  'controlledPercent',c.controlled_percent,
  'runtimeIntegrationActive',c.runtime_integration_active,
  'strictUnlocked',c.strict_unlocked,
  'phase9StatusVersion',c.phase9_status_version,
  'phase9EvidenceId',c.phase9_evidence_id,
  'phase9ExitPass',c.phase9_exit_pass,
  'controlledStartedAt',c.controlled_started_at,
  'lastRollbackAt',c.last_rollback_at,
  'rollbackCount',c.rollback_count,
  'updatedAt',c.updated_at,
  'destructiveCleanupAllowed',false
)
from drx_dose.phase10_runtime_control_v1 c
where c.control_id='primary'
$$;

revoke all on function public.drx_phase10_runtime_policy_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase10_runtime_policy_v1()
  to service_role;

create or replace function public.drx_phase10_set_runtime_mode_v1(p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_version text := coalesce(p_change->>'version','');
  v_change_id text := btrim(coalesce(p_change->>'changeId',''));
  v_actor text := btrim(coalesce(p_change->>'actor',''));
  v_reason text := btrim(coalesce(p_change->>'reason',''));
  v_to text := upper(btrim(coalesce(p_change->>'toMode','')));
  v_percent integer := coalesce((p_change->>'controlledPercent')::integer,0);
  v_current drx_dose.phase10_runtime_control_v1%rowtype;
  v_p9 jsonb;
  v_rollback boolean := false;
begin
  if v_version <> 'drx-phase10-runtime-change-v1' then
    raise exception 'Unsupported Phase 10 runtime change payload version';
  end if;
  if char_length(v_change_id) < 8 or char_length(v_change_id) > 120 then
    raise exception 'Phase 10 changeId must be 8..120 characters';
  end if;
  if char_length(v_actor) < 2 or char_length(v_actor) > 120 then
    raise exception 'Phase 10 actor is required';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Phase 10 change reason must be 10..500 characters';
  end if;
  if v_to not in ('V2_FALLBACK','SHADOW','CONTROLLED','V3_STRICT') then
    raise exception 'Unsupported Phase 10 runtime mode';
  end if;

  if exists (
    select 1 from drx_dose.phase10_runtime_events_v1 where change_id=v_change_id
  ) then
    return public.drx_phase10_runtime_policy_v1();
  end if;

  select * into v_current
  from drx_dose.phase10_runtime_control_v1
  where control_id='primary'
  for update;

  if not found then
    raise exception 'Phase 10 runtime control is not initialized';
  end if;

  v_p9 := public.drx_phase9_status_v1();
  if coalesce((v_p9->>'finalExitPass')::boolean,false) is not true
     or coalesce((v_p9->>'phase10Allowed')::boolean,false) is not true then
    raise exception 'Phase 9 exit gate is not currently satisfied';
  end if;

  if v_to='V3_STRICT' then
    raise exception 'Phase 10 V3_STRICT is locked until final parity, rollback, soak, security, golden-test and restore gates pass';
  end if;

  if v_to='CONTROLLED' then
    if v_current.mode not in ('SHADOW','CONTROLLED') then
      raise exception 'CONTROLLED traffic requires current SHADOW or CONTROLLED mode';
    end if;
    if v_percent < 1 or v_percent > 50 then
      raise exception 'CONTROLLED traffic must be between 1 and 50 percent before strict gate';
    end if;
  else
    v_percent := 0;
  end if;

  if v_current.mode='V2_FALLBACK' and v_to not in ('V2_FALLBACK','SHADOW') then
    raise exception 'V2_FALLBACK may transition only to SHADOW before controlled traffic';
  end if;

  if v_current.mode='SHADOW' and v_to not in ('V2_FALLBACK','SHADOW','CONTROLLED') then
    raise exception 'SHADOW transition rejected';
  end if;

  if v_current.mode='CONTROLLED' and v_to not in ('V2_FALLBACK','SHADOW','CONTROLLED') then
    raise exception 'CONTROLLED transition rejected';
  end if;

  v_rollback := v_to='V2_FALLBACK' and v_current.mode <> 'V2_FALLBACK';

  update drx_dose.phase10_runtime_control_v1
  set
    mode=v_to,
    controlled_percent=v_percent,
    controlled_started_at=case
      when v_to='CONTROLLED' and controlled_started_at is null then now()
      when v_to<>'CONTROLLED' then null
      else controlled_started_at
    end,
    last_rollback_at=case when v_rollback then now() else last_rollback_at end,
    rollback_count=rollback_count + case when v_rollback then 1 else 0 end,
    phase9_status_version=v_p9->>'statusVersion',
    phase9_evidence_id=v_p9->>'technicalQaEvidenceId',
    phase9_exit_pass=true,
    updated_at=now(),
    updated_by=v_actor,
    change_reason=v_reason
  where control_id='primary';

  insert into drx_dose.phase10_runtime_events_v1 (
    change_id,from_mode,to_mode,controlled_percent,runtime_integration_active,
    phase9_status_version,phase9_evidence_id,actor,reason,rollback_event
  ) values (
    v_change_id,v_current.mode,v_to,v_percent,v_current.runtime_integration_active,
    v_p9->>'statusVersion',v_p9->>'technicalQaEvidenceId',v_actor,v_reason,v_rollback
  );

  return public.drx_phase10_runtime_policy_v1();
end
$$;

revoke all on function public.drx_phase10_set_runtime_mode_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase10_set_runtime_mode_v1(jsonb)
  to service_role;

create or replace function public.drx_phase10_status_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
with p as materialized (
  select public.drx_phase10_runtime_policy_v1() policy
)
select jsonb_build_object(
  'statusVersion','drx-phase10-status-v1',
  'phase',10,
  'mode',policy->>'mode',
  'controlledPercent',(policy->>'controlledPercent')::integer,
  'runtimeIntegrationActive',(policy->>'runtimeIntegrationActive')::boolean,
  'strictUnlocked',(policy->>'strictUnlocked')::boolean,
  'phase9ExitPass',(policy->>'phase9ExitPass')::boolean,
  'rollbackCount',(policy->>'rollbackCount')::integer,
  'controlPlaneReady',true,
  'controlledTrafficAllowed',(policy->>'mode') in ('SHADOW','CONTROLLED'),
  'strictAllowed',false,
  'goldenClinicalPass',false,
  'allPublishedParityPass',false,
  'zeroP0P1SecurityFindings',false,
  'zeroLegacyWrites',false,
  'zeroLegacyRuntimeConsumers',false,
  'rollbackProven',false,
  'soak14DaysComplete',false,
  'finalRestorePass',false,
  'destructiveCleanupAllowed',false,
  'finalExitPass',false
)
from p
$$;

revoke all on function public.drx_phase10_status_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase10_status_v1()
  to service_role;
