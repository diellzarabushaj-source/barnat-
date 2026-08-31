do $$
declare
  v_status jsonb;
  v_products integer;
  v_rules integer;
  v_bindings integer;
begin
  v_status:=public.drx_phase10_status_v1();

  if coalesce((v_status->>'phase9Closed')::boolean,false) is not true
     or coalesce((v_status->>'phase10AllowedByPhase9')::boolean,false) is not true
     or coalesce((v_status->>'securityP0P1EvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'goldenClinicalEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'parityEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'effectiveParityCurrent')::boolean,false) is not true
     or coalesce((v_status->>'legacyWritesZeroEvidencePass')::boolean,false) is not true
     or coalesce((v_status->>'rollbackDrillPass')::boolean,false) is not true then
    raise exception 'Phase 10K restore evidence prerequisites are not satisfied: %',v_status;
  end if;

  select count(*)::integer into v_products
  from public.dose_products_v3
  where editorial_status='published';

  select count(*)::integer into v_rules
  from public.dose_rules_v3
  where editorial_status='published';

  select count(*)::integer into v_bindings
  from public.dose_rule_products_v3
  where binding_status='verified';

  if v_products<>2 or v_rules<>4 or v_bindings<>4 then
    raise exception 'Phase 10K restore evidence V3 manifest drifted: products %, rules %, bindings %',
      v_products,v_rules,v_bindings;
  end if;
end
$$;

insert into drx_runtime.phase10_gate_evidence_v1(
  gate_key,passed,source_kind,source_ref,evidence_sha256,details
) values (
  'RESTORE_TEST_PASS',
  true,
  'GITHUB_ACTION',
  'github-actions:33362564597:commit:3639046090f78d8fd17cf25b93c6169f9f4833ea:artifact:9747261797',
  'f3493a6bc7d59a417d799747f68471a8d30d66f6a3cbfcd8582f21f4d6c27b48',
  jsonb_build_object(
    'evidenceVersion','drx-phase1-backup-restore-evidence-v2',
    'workflowRunId',33362564597,
    'jobId',99396696319,
    'commitSha','3639046090f78d8fd17cf25b93c6169f9f4833ea',
    'artifactId',9747261797,
    'artifactDigest','sha256:f3493a6bc7d59a417d799747f68471a8d30d66f6a3cbfcd8582f21f4d6c27b48',
    'credentialMode','db_url',
    'backupCreated',true,
    'restoreExecuted',true,
    'restoreVerified',true,
    'sourceRestoreParity',true,
    'backupRetention','runner_ephemeral_only_no_database_payload_uploaded',
    'sourceManifest',jsonb_build_object(
      'drugsCount',4015,
      'drugsFingerprint','6977815d930ef38951f0fbcd4a83ed5f',
      'dosageRegimensCount',8104,
      'dosageRegimensFingerprint','af4fc5c7da94fd0a4144b8c6feb4ecf4',
      'stageProductRegistryCount',4015,
      'stageProductRegistryFingerprint','ab4478e21dfb8a78dee11c9c5c3c7305',
      'stageVariantMasterCount',2674,
      'stageVariantMasterFingerprint','12a7967ecc9b85c3053f06e28d7f315a',
      'stageSubstanceMasterCount',1351,
      'stageSubstanceMasterFingerprint','fddb580993ac98849c2781e6888c3cc1',
      'sourceSnapshotsCount',114,
      'sourceSnapshotsFingerprint','8ce05b39f50e00b6e8be0e1443f48ba0',
      'sourceSectionsCount',675,
      'sourceSectionsFingerprint','32beeed0b220000986185c34c337935f',
      'v3ProductsCount',2,
      'v3ProductsFingerprint','18344bb531843ff0e0d31daaafcc8ee6',
      'v3RulesCount',4,
      'v3RulesFingerprint','e600170f884d8b82e7ac5c316103c8ba',
      'v3BindingsCount',4,
      'v3BindingsFingerprint','d835ca76b1585c90a418d20e4c3c4500',
      'publishedRulesCount',4
    )
  )
)
on conflict (gate_key,evidence_sha256) do nothing;
