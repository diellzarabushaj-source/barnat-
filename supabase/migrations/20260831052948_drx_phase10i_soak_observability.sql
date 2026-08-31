create or replace function public.drx_phase10_soak_monitor_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
with control as materialized (
  select * from drx_runtime.phase10_cutover_control_v1 where singleton
),
soak as materialized (
  select *
  from drx_runtime.phase10_soak_windows_v1
  order by started_at desc
  limit 1
),
runtime as (
  select
    count(*)::integer total_events,
    count(*) filter(where selected_for_v3)::integer selected_v3_events,
    count(*) filter(where runtime_served='v3')::integer served_v3_events,
    count(*) filter(where selected_for_v3 and fallback_used)::integer selected_v3_fallbacks,
    count(*) filter(where outcome='ERROR')::integer error_events,
    count(*) filter(where outcome='BLOCKED')::integer blocked_events,
    coalesce(percentile_disc(0.95) within group(order by duration_ms),0)::integer p95_duration_ms,
    coalesce(max(duration_ms),0)::integer max_duration_ms
  from drx_runtime.phase10_runtime_events_v1 e
  cross join soak s
  where e.occurred_at>=s.started_at
),
legacy as (
  select count(*)::integer write_events
  from drx_runtime.phase10_legacy_write_events_v1 e
  cross join soak s
  where e.occurred_at>=s.started_at
),
p10 as materialized (
  select public.drx_phase10_status_v1() status
)
select jsonb_build_object(
  'monitorVersion','drx-phase10-soak-monitor-v1',
  'observedAt',now(),
  'mode',c.mode,
  'controlledPercent',c.controlled_percent,
  'controlVersion',c.version_no,
  'trafficBucketVersion',c.traffic_bucket_version,
  'strictArmed',c.strict_armed,
  'rollbackTarget',c.rollback_target,
  'soakId',s.soak_id,
  'soakMode',s.mode,
  'soakStartedAt',s.started_at,
  'soakAgeDays',round((extract(epoch from (coalesce(s.ended_at,now())-s.started_at))/86400.0)::numeric,6),
  'soakCompleted',s.completed,
  'criticalClinicalIncidents',s.critical_clinical_incidents,
  'criticalSecurityIncidents',s.critical_security_incidents,
  'runtimeEventsTotal',r.total_events,
  'selectedV3Events',r.selected_v3_events,
  'servedV3Events',r.served_v3_events,
  'selectedV3Fallbacks',r.selected_v3_fallbacks,
  'runtimeErrorEvents',r.error_events,
  'runtimeBlockedEvents',r.blocked_events,
  'runtimeP95Ms',r.p95_duration_ms,
  'runtimeMaxMs',r.max_duration_ms,
  'legacyWriteEventsSinceSoakStart',l.write_events,
  'trafficSampleAvailable',r.total_events>0,
  'phase9Closed',coalesce((p.status->>'phase9Closed')::boolean,false),
  'securityP0P1EvidencePass',coalesce((p.status->>'securityP0P1EvidencePass')::boolean,false),
  'goldenClinicalEvidencePass',coalesce((p.status->>'goldenClinicalEvidencePass')::boolean,false),
  'parityEvidencePass',coalesce((p.status->>'parityEvidencePass')::boolean,false),
  'effectiveParityCurrent',coalesce((p.status->>'effectiveParityCurrent')::boolean,false),
  'rollbackDrillPass',coalesce((p.status->>'rollbackDrillPass')::boolean,false),
  'legacyConsumersZeroEvidencePass',coalesce((p.status->>'legacyConsumersZeroEvidencePass')::boolean,false),
  'restoreTestEvidencePass',coalesce((p.status->>'restoreTestEvidencePass')::boolean,false),
  'soak14DaysPass',coalesce((p.status->>'soak14DaysPass')::boolean,false),
  'finalGatePass',coalesce((p.status->>'finalGatePass')::boolean,false),
  'reviewRequired',
    s.critical_clinical_incidents>0
    or s.critical_security_incidents>0
    or l.write_events>0
    or r.selected_v3_fallbacks>0
    or r.error_events>0
    or coalesce((p.status->>'effectiveParityCurrent')::boolean,false) is not true,
  'automaticIncidentClassification',false
)
from control c
cross join soak s
cross join runtime r
cross join legacy l
cross join p10 p
$$;

revoke all on function public.drx_phase10_soak_monitor_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase10_soak_monitor_v1()
  to service_role;
