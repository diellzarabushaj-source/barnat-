do $$
declare
  v_rules integer;
  v_comparisons integer;
  v_effective integer;
  v_approved integer;
  v_raw_diffs integer;
begin
  with latest_shadow as (
    select distinct on (selector_kind,selector_sha256)
      comparison_id,comparison_status,v3_rule_count
    from drx_runtime.shadow_comparisons_v1
    order by selector_kind,selector_sha256,created_at desc,comparison_id desc
  )
  select
    (select count(*)::integer from public.dose_rules_v3 where editorial_status='published'),
    count(*)::integer,
    count(*) filter(
      where comparison_status='MATCH'
         or (
           comparison_status='DIFF'
           and exists (
             select 1 from drx_runtime.shadow_diff_classifications_v1 c
             where c.comparison_id=latest_shadow.comparison_id
               and c.classification_status='APPROVED_CLINICAL_CORRECTION'
           )
         )
    )::integer,
    count(*) filter(
      where comparison_status='DIFF'
        and exists (
          select 1 from drx_runtime.shadow_diff_classifications_v1 c
          where c.comparison_id=latest_shadow.comparison_id
            and c.classification_status='APPROVED_CLINICAL_CORRECTION'
        )
    )::integer,
    count(*) filter(where comparison_status='DIFF')::integer
  into v_rules,v_comparisons,v_effective,v_approved,v_raw_diffs
  from latest_shadow;

  if v_rules<>4 or v_comparisons<>2 or v_effective<>2 or v_approved<>2 or v_raw_diffs<>2 then
    raise exception
      'Phase 10 parity evidence changed: rules %, comparisons %, effective %, approved %, raw diffs %',
      v_rules,v_comparisons,v_effective,v_approved,v_raw_diffs;
  end if;
end
$$;

insert into drx_runtime.phase10_gate_evidence_v1(
  gate_key,passed,source_kind,source_ref,evidence_sha256,details
) values (
  'GOLDEN_CLINICAL_100',
  true,
  'GITHUB_ACTION',
  'github-actions:33341199441:commit:c8680d8e89ce473a441665d410f0b143a06381de:step:Golden clinical cases:success',
  '104287dc461790eeda49fef728f8ab6584e79a7e5e5575be7b83a1c439faa98e',
  jsonb_build_object(
    'workflowRunId',33341199441,
    'commitSha','c8680d8e89ce473a441665d410f0b143a06381de',
    'workflow','DRx Phase 10 cutover gate',
    'step','Golden clinical cases',
    'conclusion','success',
    'artifactId',9740585689,
    'artifactDigest','sha256:64d19069c75dab1a4c378ac4e07cd620575c218af6098cdfcda2b43d2036df2a'
  )
),(
  'PARITY_100_PUBLISHED_V3',
  true,
  'DB_AUDIT',
  'phase10-parity:v3_rules=4:comparisons=2:effective_matches=2:approved_corrections=2:raw_diffs=2',
  '6dc51366961a8d1e11b79ff187d0b3df97f7e2b04ab849b94ad9239d303d1a9c',
  jsonb_build_object(
    'publishedV3Rules',4,
    'shadowComparisons',2,
    'effectiveShadowMatches',2,
    'approvedClinicalCorrections',2,
    'rawShadowDiffs',2,
    'rawShadowMatches',0,
    'interpretation','Raw RULE_SEMANTICS diffs are preserved; both are approved clinical corrections.'
  )
)
on conflict (gate_key,evidence_sha256) do nothing;
