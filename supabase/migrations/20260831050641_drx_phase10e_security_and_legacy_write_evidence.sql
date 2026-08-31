do $$
declare
  v_started timestamptz;
  v_writes integer;
  v_status jsonb;
begin
  select phase10_started_at into v_started
  from drx_runtime.phase10_cutover_control_v1
  where singleton;

  select count(*)::integer into v_writes
  from drx_runtime.phase10_legacy_write_events_v1
  where occurred_at>=v_started;

  if v_writes<>0 then
    raise exception 'Phase 10E legacy-write evidence blocked: % write events observed since %',v_writes,v_started;
  end if;

  v_status:=public.drx_phase10_status_v1();
  if coalesce((v_status->>'phase9Closed')::boolean,false) is not true
     or coalesce((v_status->>'phase10AllowedByPhase9')::boolean,false) is not true
     or coalesce((v_status->>'effectiveParityCurrent')::boolean,false) is not true
     or coalesce((v_status->>'goldenClinicalEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'parityEvidencePass')::boolean,false) is not true then
    raise exception 'Phase 10E prerequisite gate changed before security/write evidence materialization';
  end if;
end
$$;

insert into drx_runtime.phase10_gate_evidence_v1(
  gate_key,passed,source_kind,source_ref,evidence_sha256,details
) values (
  'SECURITY_P0_P1_ZERO',
  true,
  'GITHUB_ACTION',
  'github-actions:33359238154:commit:5d4539727051d100e24aa7b660f1f3b76fe673c5:security-suite:success',
  'd16cfe564e5d8440db0f16ee330da53f5148fff4b2d2d585c9fc1f9c4380f449',
  jsonb_build_object(
    'workflowRunId',33359238154,
    'commitSha','5d4539727051d100e24aa7b660f1f3b76fe673c5',
    'artifactId',9746133660,
    'artifactDigest','sha256:d16cfe564e5d8440db0f16ee330da53f5148fff4b2d2d585c9fc1f9c4380f449',
    'p0DatabaseIntegrity','success',
    'publicSecurityContract','success',
    'apiSecurityDeepAudit','success',
    'drxSafetyGateRunId',33359238202,
    'drxSafetyGateConclusion','success',
    'medIndexValidationRunId',33359238137,
    'medIndexValidationConclusion','success'
  )
),(
  'LEGACY_WRITES_ZERO',
  true,
  'DB_AUDIT',
  'phase10-legacy-write-audit:events_since_phase10_start=0:commit=5d4539727051d100e24aa7b660f1f3b76fe673c5',
  'd16cfe564e5d8440db0f16ee330da53f5148fff4b2d2d585c9fc1f9c4380f449',
  jsonb_build_object(
    'phase10StartedAt',(select phase10_started_at from drx_runtime.phase10_cutover_control_v1 where singleton),
    'legacyWriteEvents',0,
    'auditedRelations',jsonb_build_array(
      'dose_products_v2','dose_rules_v2','dose_rule_products_v2','dose_indications_v2','dose_sources_v2'
    ),
    'auditTrigger','drx_runtime.phase10_audit_legacy_write_v1',
    'workflowRunId',33359238154,
    'commitSha','5d4539727051d100e24aa7b660f1f3b76fe673c5'
  )
)
on conflict (gate_key,evidence_sha256) do nothing;
