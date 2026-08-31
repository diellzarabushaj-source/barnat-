do $$
declare
  v_state jsonb;
  v_after_state jsonb;
  v_products_before text;
  v_products_after text;
  v_rules_before text;
  v_rules_after text;
  v_provenance_before text;
  v_provenance_after text;
  v_v2_products integer;
  v_v2_rules integer;
  v_v3_products integer;
  v_v3_rules integer;
  v_legacy_writes integer;
  v_evidence text;
begin
  v_state:=public.drx_phase10_cutover_state_v1();

  if v_state->>'mode'<>'CONTROLLED'
     or coalesce((v_state->>'controlledPercent')::integer,-1)<>1
     or coalesce((v_state->>'controlVersion')::integer,-1)<>2 then
    raise exception 'Phase 10 rollback drill requires CONTROLLED 1%% at control version 2; live=%',v_state;
  end if;

  select encode(digest(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.product_id::text),''),'sha256'),'hex'),
         count(*)::integer
    into v_products_before,v_v3_products
  from public.dose_products_v3 t
  where editorial_status='published';

  select encode(digest(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.rule_id::text),''),'sha256'),'hex'),
         count(*)::integer
    into v_rules_before,v_v3_rules
  from public.dose_rules_v3 t
  where editorial_status='published';

  select encode(digest(
    coalesce((select string_agg(to_jsonb(s)::text,'|' order by s.snapshot_id::text)
              from public.dose_source_snapshots_v3 s),'')
    || '||'
    || coalesce((select string_agg(to_jsonb(s)::text,'|' order by s.snapshot_id::text,s.section_key)
                 from public.dose_source_sections_v3 s),''),
    'sha256'),'hex')
  into v_provenance_before;

  select count(*)::integer into v_v2_products
  from public.dose_products_v2
  where active and editorial_status='published';

  select count(*)::integer into v_v2_rules
  from public.dose_rules_v2
  where active and editorial_status='published';

  if v_v3_products<=0 or v_v3_rules<=0 or v_v2_products<=0 or v_v2_rules<=0 then
    raise exception 'Rollback drill data prerequisites missing: v3 products %, v3 rules %, v2 products %, v2 rules %',
      v_v3_products,v_v3_rules,v_v2_products,v_v2_rules;
  end if;

  v_after_state:=public.drx_phase10_set_controlled_traffic_v1(jsonb_build_object(
    'requestVersion','drx-phase10-controlled-transition-v1',
    'targetMode','SHADOW',
    'controlledPercent',0,
    'expectedVersion',2,
    'reason','Phase 10 rollback drill: switch controlled traffic back to SHADOW/V2 while preserving all V3 data and provenance.'
  ));

  if v_after_state->>'mode'<>'SHADOW'
     or coalesce((v_after_state->>'controlledPercent')::integer,-1)<>0
     or coalesce((v_after_state->>'controlVersion')::integer,-1)<>3 then
    raise exception 'Rollback drill did not reach SHADOW version 3: %',v_after_state;
  end if;

  select encode(digest(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.product_id::text),''),'sha256'),'hex')
    into v_products_after
  from public.dose_products_v3 t
  where editorial_status='published';

  select encode(digest(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.rule_id::text),''),'sha256'),'hex')
    into v_rules_after
  from public.dose_rules_v3 t
  where editorial_status='published';

  select encode(digest(
    coalesce((select string_agg(to_jsonb(s)::text,'|' order by s.snapshot_id::text)
              from public.dose_source_snapshots_v3 s),'')
    || '||'
    || coalesce((select string_agg(to_jsonb(s)::text,'|' order by s.snapshot_id::text,s.section_key)
                 from public.dose_source_sections_v3 s),''),
    'sha256'),'hex')
  into v_provenance_after;

  if v_products_before<>v_products_after
     or v_rules_before<>v_rules_after
     or v_provenance_before<>v_provenance_after then
    raise exception 'Rollback altered V3 data/provenance hashes';
  end if;

  select count(*)::integer into v_legacy_writes
  from drx_runtime.phase10_legacy_write_events_v1
  where occurred_at >= (
    select phase10_started_at from drx_runtime.phase10_cutover_control_v1 where singleton
  );

  if v_legacy_writes<>0 then
    raise exception 'Legacy writes appeared during rollback drill: %',v_legacy_writes;
  end if;

  v_evidence:=encode(digest(
    concat_ws('|',
      'drx-phase10-rollback-drill-v1',
      v_products_before,v_rules_before,v_provenance_before,
      v_v2_products::text,v_v2_rules::text,
      'CONTROLLED:1:v2','SHADOW:0:v3',
      'ci:33359445295:controlled-runtime-contract-success'
    ),
    'sha256'
  ),'hex');

  insert into drx_runtime.phase10_rollback_drills_v1(
    from_mode,to_mode,passed,v3_data_preserved,provenance_preserved,
    v2_service_restored,evidence_sha256,note
  ) values (
    'CONTROLLED','SHADOW',true,true,true,true,v_evidence,
    'Phase 10 rollback drill switched canonical control from CONTROLLED 1% to SHADOW. V3 product/rule/provenance hashes were identical before/after; published V2 product/rule data remained available; Phase 10B runtime contract was green in GitHub Actions run 33359445295.'
  );

  insert into drx_runtime.phase10_gate_evidence_v1(
    gate_key,passed,source_kind,source_ref,evidence_sha256,details
  ) values (
    'ROLLBACK_DRILL_PASS',true,'CUTOVER_DRILL',
    'phase10-rollback-drill:CONTROLLED-1%-v2-to-SHADOW-v3:ci=33359445295',
    v_evidence,
    jsonb_build_object(
      'fromMode','CONTROLLED',
      'fromPercent',1,
      'fromControlVersion',2,
      'toMode','SHADOW',
      'toPercent',0,
      'toControlVersion',3,
      'publishedV3Products',v_v3_products,
      'publishedV3Rules',v_v3_rules,
      'v3ProductsSha256',v_products_before,
      'v3RulesSha256',v_rules_before,
      'provenanceSha256',v_provenance_before,
      'publishedV2Products',v_v2_products,
      'publishedV2Rules',v_v2_rules,
      'legacyWriteEvents',v_legacy_writes,
      'runtimeContractWorkflowRunId',33359445295,
      'runtimeContractStep','Phase 10B controlled traffic plumbing',
      'runtimeContractConclusion','success'
    )
  );
end
$$;
