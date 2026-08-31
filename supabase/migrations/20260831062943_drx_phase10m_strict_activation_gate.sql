create or replace function public.drx_phase10_arm_strict_v1(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, drx_runtime
as $$
declare
  v_expected integer;
  v_reason text;
  v_status jsonb;
  v_runtime_ready boolean := false;
  v_current drx_runtime.phase10_cutover_control_v1%rowtype;
  v_from_version integer;
begin
  if coalesce(p_request->>'requestVersion','') <> 'drx-phase10-strict-activation-v1' then
    raise exception 'Unsupported Phase 10 strict activation request version';
  end if;

  begin
    v_expected := (p_request->>'expectedVersion')::integer;
  exception when others then
    raise exception 'expectedVersion must be an integer';
  end;

  v_reason := btrim(coalesce(p_request->>'reason',''));
  if char_length(v_reason) < 20 or char_length(v_reason) > 500 then
    raise exception 'Phase 10 strict activation reason must contain 20..500 characters';
  end if;

  select * into v_current
  from drx_runtime.phase10_cutover_control_v1
  where singleton
  for update;

  if not found then
    raise exception 'Phase 10 cutover control row is missing';
  end if;

  if v_current.mode='STRICT' and v_current.strict_armed is true then
    return public.drx_phase10_cutover_state_v1();
  end if;

  if v_current.version_no <> v_expected then
    raise exception 'Stale Phase 10 control version: expected %, live %', v_expected, v_current.version_no;
  end if;

  if v_current.mode <> 'CONTROLLED' or v_current.controlled_percent <> 10 or v_current.strict_armed is true then
    raise exception 'Strict activation requires CONTROLLED 10 percent with strict mode still disarmed';
  end if;

  v_status := public.drx_phase10_status_v1();

  select coalesce(e.passed,false)
  into v_runtime_ready
  from drx_runtime.phase10_gate_evidence_v1 e
  where e.gate_key='STRICT_RUNTIME_FAIL_CLOSED'
  order by e.recorded_at desc,e.evidence_id desc
  limit 1;

  if coalesce(v_runtime_ready,false) is not true then
    raise exception 'Strict activation blocked: fail-closed strict runtime evidence is missing';
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
     or coalesce((v_status->>'restoreTestEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'soak14DaysPass')::boolean,false) is not true
     or coalesce((v_status->>'legacyWriteEventsSincePhase10Start')::integer,0) <> 0 then
    raise exception 'Strict activation blocked: one or more pre-strict Phase 10 evidence gates are not satisfied';
  end if;

  v_from_version := v_current.version_no;

  update drx_runtime.phase10_cutover_control_v1
  set
    mode='STRICT',
    controlled_percent=0,
    strict_armed=true,
    updated_at=now(),
    version_no=version_no+1,
    note=v_reason
  where singleton
  returning * into v_current;

  insert into drx_runtime.phase10_cutover_events_v1(
    from_mode,to_mode,from_percent,to_percent,from_version,to_version,db_role,reason
  ) values (
    'CONTROLLED','STRICT',10,0,v_from_version,v_current.version_no,current_user,v_reason
  );

  return public.drx_phase10_cutover_state_v1();
end;
$$;

revoke all on function public.drx_phase10_arm_strict_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.drx_phase10_arm_strict_v1(jsonb)
  to service_role;
