create or replace function drx_runtime.phase10_soak_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,drx_runtime
as $$
begin
  if tg_op='DELETE' then
    raise exception 'Phase 10 soak evidence cannot be deleted';
  end if;

  if old.completed then
    raise exception 'Completed Phase 10 soak evidence is immutable';
  end if;

  if new.soak_id<>old.soak_id
     or new.mode<>old.mode
     or new.started_at<>old.started_at
     or new.evidence_sha256 is distinct from old.evidence_sha256 then
    raise exception 'Phase 10 soak identity/start evidence is immutable';
  end if;

  if new.critical_clinical_incidents<old.critical_clinical_incidents
     or new.critical_security_incidents<old.critical_security_incidents then
    raise exception 'Phase 10 incident counters cannot decrease';
  end if;

  if new.completed then
    if new.ended_at is null or new.ended_at-new.started_at<interval '14 days' then
      raise exception 'Phase 10 soak cannot complete before 14 elapsed days';
    end if;
  elsif new.ended_at is not null then
    raise exception 'Phase 10 ended_at requires completed=true';
  end if;

  return new;
end
$$;

revoke all on function drx_runtime.phase10_soak_guard_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists phase10_soak_guard_v1 on drx_runtime.phase10_soak_windows_v1;
create trigger phase10_soak_guard_v1
before update or delete on drx_runtime.phase10_soak_windows_v1
for each row execute function drx_runtime.phase10_soak_guard_v1();

do $$
declare
  v_state jsonb;
  v_status jsonb;
begin
  v_state:=public.drx_phase10_cutover_state_v1();
  v_status:=public.drx_phase10_status_v1();

  if v_state->>'stateVersion'<>'drx-phase10-cutover-state-v2'
     or v_state->>'mode'<>'CONTROLLED'
     or coalesce((v_state->>'controlledPercent')::integer,-1)<>5
     or coalesce((v_state->>'controlVersion')::integer,-1)<>4
     or coalesce((v_state->>'trafficBucketVersion')::integer,-1)<>2
     or coalesce((v_state->>'strictArmed')::boolean,true) then
    raise exception 'Phase 10H soak start requires CONTROLLED 5%% v4, stable bucket v2, strict off; live=%',v_state;
  end if;

  if coalesce((v_status->>'phase9Closed')::boolean,false) is not true
     or coalesce((v_status->>'phase10AllowedByPhase9')::boolean,false) is not true
     or coalesce((v_status->>'securityP0P1EvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'goldenClinicalEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'parityEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'effectiveParityCurrent')::boolean,false) is not true
     or coalesce((v_status->>'legacyWritesZeroEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'rollbackEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'rollbackDrillPass')::boolean,false) is not true
     or coalesce((v_status->>'legacyWriteEventsSincePhase10Start')::integer,-1)<>0 then
    raise exception 'Phase 10H pre-soak safety gates are not satisfied: %',v_status;
  end if;

  if exists (
    select 1 from drx_runtime.phase10_soak_windows_v1
    where not completed
  ) then
    raise exception 'An open Phase 10 soak window already exists';
  end if;

  insert into drx_runtime.phase10_soak_windows_v1(
    mode,started_at,ended_at,critical_clinical_incidents,
    critical_security_incidents,completed,evidence_sha256,note
  ) values (
    'CONTROLLED',now(),null,0,0,false,
    '2fbc9f24da0f5126880273d56a44481d315d1b0ef305e9a16e17e487fbb4694d',
    'Phase 10H controlled 5% production soak. Stable traffic bucket version 2. Start authorized by successful live controlled V3 canary on commit 283dcd41f96d8eb3fce332c7dfd1c71a13d5f90d, GitHub Actions run 33360299633, artifact 9746451841. Strict mode remains off and V2 fallback remains active.'
  );
end
$$;
