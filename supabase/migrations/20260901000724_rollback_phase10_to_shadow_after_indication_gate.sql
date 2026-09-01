do $$
declare
  v_from_mode text;
  v_from_percent integer;
  v_from_version integer;
  v_to_version integer;
begin
  select mode, controlled_percent, version_no
    into v_from_mode, v_from_percent, v_from_version
  from drx_runtime.phase10_cutover_control_v1
  where singleton
  for update;

  v_to_version := v_from_version + 1;

  update drx_runtime.phase10_cutover_control_v1
  set mode = 'SHADOW',
      controlled_percent = 0,
      strict_armed = false,
      rollback_target = 'V2',
      updated_at = now(),
      version_no = v_to_version,
      note = 'Full-stack safety audit rollback: V3 indication publication was withdrawn pending ICD-10 verification; V2 remains the runtime safety path.'
  where singleton;

  insert into drx_runtime.phase10_cutover_events_v1(
    from_mode,to_mode,from_percent,to_percent,from_version,to_version,db_role,reason,occurred_at
  ) values (
    v_from_mode,'SHADOW',v_from_percent,0,v_from_version,v_to_version,current_user,
    'Safety rollback after unverified published indication integrity audit; V3 remains shadow-only until ICD-10 verification and publication gates pass.',
    now()
  );
end $$;
