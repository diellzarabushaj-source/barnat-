create table if not exists drx_dose.phase9_phase8_exit_evidence_v1 (
  evidence_id text primary key,
  status_evidence_version text not null
    check (status_evidence_version='drx-phase8-status-evidence-v3'),
  exit_audit_evidence_version text not null
    check (exit_audit_evidence_version='drx-phase8-exit-audit-v2'),
  phase8_commit_sha text not null
    check (phase8_commit_sha ~ '^[0-9a-f]{40}$'),
  phase8_workflow_run_id bigint not null unique check (phase8_workflow_run_id>0),
  artifact_id bigint not null unique check (artifact_id>0),
  artifact_digest text not null
    check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  exit_gate_pass boolean not null check (exit_gate_pass),
  v2_runtime_preserved boolean not null check (v2_runtime_preserved),
  v3_cutover_enabled boolean not null check (not v3_cutover_enabled),
  preflight_pass boolean not null check (preflight_pass),
  clinical_reviews_verified integer not null check (clinical_reviews_verified=2),
  pilots_published_in_v3 integer not null check (pilots_published_in_v3=2),
  shadow_comparisons integer not null check (shadow_comparisons=2),
  shadow_matches integer not null check (shadow_matches=2),
  shadow_diffs integer not null check (shadow_diffs=0),
  server_performance_pass boolean not null check (server_performance_pass),
  search_server_p95_ms numeric not null check (search_server_p95_ms<=300),
  product_detail_server_p95_ms numeric not null check (product_detail_server_p95_ms<=400),
  publication_allowed boolean not null check (not publication_allowed),
  automatic_clinical_review_enabled boolean not null check (not automatic_clinical_review_enabled),
  materialized_at timestamptz not null default now(),
  note text not null
);

alter table drx_dose.phase9_phase8_exit_evidence_v1 enable row level security;
alter table drx_dose.phase9_phase8_exit_evidence_v1 force row level security;

revoke all on table drx_dose.phase9_phase8_exit_evidence_v1
  from public,anon,authenticated,service_role;

create or replace function drx_dose.guard_phase9_phase8_exit_evidence_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,drx_dose
as $$
begin
  raise exception 'Phase 8 exit evidence materialized for Phase 9 is immutable';
end
$$;

revoke all on function drx_dose.guard_phase9_phase8_exit_evidence_immutable_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists phase9_phase8_exit_evidence_immutable_v1
  on drx_dose.phase9_phase8_exit_evidence_v1;

create trigger phase9_phase8_exit_evidence_immutable_v1
before update or delete on drx_dose.phase9_phase8_exit_evidence_v1
for each row execute function drx_dose.guard_phase9_phase8_exit_evidence_immutable_v1();

insert into drx_dose.phase9_phase8_exit_evidence_v1 (
  evidence_id,status_evidence_version,exit_audit_evidence_version,
  phase8_commit_sha,phase8_workflow_run_id,artifact_id,artifact_digest,
  exit_gate_pass,v2_runtime_preserved,v3_cutover_enabled,
  preflight_pass,clinical_reviews_verified,pilots_published_in_v3,
  shadow_comparisons,shadow_matches,shadow_diffs,
  server_performance_pass,search_server_p95_ms,product_detail_server_p95_ms,
  publication_allowed,automatic_clinical_review_enabled,note
) values (
  'phase8-exit-bc124406',
  'drx-phase8-status-evidence-v3',
  'drx-phase8-exit-audit-v2',
  'bc124406656638b12b7a4bbad021028a04e59a75',
  33337806358,
  9739582132,
  'sha256:8c1f8e79597e6d789ed4d3e9e9ff03b8d4419b30c34ade954fd9fbf7bf11c760',
  true,true,false,
  true,2,2,
  2,2,0,
  true,6.707,1.889,
  false,false,
  'Materialized from the successful Phase 8 status and exit-audit artifacts. This does not create or alter any clinical review decision.'
)
on conflict (evidence_id) do nothing;

create or replace function public.drx_phase9_status_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
with p8 as materialized (
  select *
  from drx_dose.phase9_phase8_exit_evidence_v1
  where evidence_id='phase8-exit-bc124406'
),
qa as materialized (
  select *
  from drx_dose.phase9_frontend_qa_evidence_v1
  where evidence_id='phase9-qa-8ecaa228'
),
metrics as (
  select
    exists (
      select 1 from p8
      where status_evidence_version='drx-phase8-status-evidence-v3'
        and exit_audit_evidence_version='drx-phase8-exit-audit-v2'
        and phase8_commit_sha='bc124406656638b12b7a4bbad021028a04e59a75'
        and phase8_workflow_run_id=33337806358
        and artifact_id=9739582132
        and artifact_digest='sha256:8c1f8e79597e6d789ed4d3e9e9ff03b8d4419b30c34ade954fd9fbf7bf11c760'
        and exit_gate_pass
        and v2_runtime_preserved
        and not v3_cutover_enabled
        and preflight_pass
        and clinical_reviews_verified=2
        and pilots_published_in_v3=2
        and shadow_comparisons=2
        and shadow_matches=2
        and shadow_diffs=0
        and server_performance_pass
        and search_server_p95_ms<=300
        and product_detail_server_p95_ms<=400
        and not publication_allowed
        and not automatic_clinical_review_enabled
    ) phase8_closed,
    coalesce((select v2_runtime_preserved from p8 limit 1),false) v2_runtime_preserved,
    coalesce((select v3_cutover_enabled from p8 limit 1),true) v3_cutover_enabled,
    exists (
      select 1
      from pg_constraint c
      where c.conrelid='public.user_favorites'::regclass
        and c.conname='user_favorites_entity_type_check'
        and pg_get_constraintdef(c.oid) like '%substance%'
        and pg_get_constraintdef(c.oid) like '%variant%'
        and pg_get_constraintdef(c.oid) like '%product%'
    ) favorites_polymorphic,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='user_notes'
        and column_name='entity_type' and is_nullable='NO'
    ) notes_entity_type_ready,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='user_notes'
        and column_name='entity_key' and is_nullable='NO'
    ) notes_entity_key_ready,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='user_notes'
        and column_name='drug_id' and is_nullable='YES'
    ) notes_polymorphic_drug_nullable,
    (select count(*)::integer from pg_policies
      where schemaname='public' and tablename='user_favorites'
        and policyname like 'user_favorites_%_own_clinical') favorite_owner_policy_count,
    (select count(*)::integer from pg_policies
      where schemaname='public' and tablename='user_notes') note_owner_policy_count,
    to_regprocedure('public.drx_phase9_product_context_v1(uuid)') is not null context_rpc_exists,
    has_function_privilege('service_role','public.drx_phase9_product_context_v1(uuid)','EXECUTE') context_service_execute,
    has_function_privilege('anon','public.drx_phase9_product_context_v1(uuid)','EXECUTE') context_anon_execute,
    has_function_privilege('authenticated','public.drx_phase9_product_context_v1(uuid)','EXECUTE') context_auth_execute,
    exists (
      select 1 from qa
      where evidence_version='drx-phase9-browser-qa-v1'
        and phase9_commit_sha='8ecaa2283e13c4626bf8125cd90b354700ca1172'
        and phase9_workflow_run_id=33339677881
        and phase9_workflow_conclusion='success'
        and artifact_id=9740145041
        and artifact_digest='sha256:10f50320135c925df73fe2ed31900fb4fafc087356bc67f1cfa4c59225099950'
        and viewport_set @> '["390x844","768x1024","1440x1000"]'::jsonb
        and browser_qa_pass
        and owner_isolation_pass
        and phase9_gate_pass
        and safety_commit_sha='f89adcf71f575f6f7bcd88f27b0bac55ea3c7dd1'
        and safety_workflow_run_id=33339770836
        and safety_gate_pass
        and medindex_commit_sha='f89adcf71f575f6f7bcd88f27b0bac55ea3c7dd1'
        and medindex_workflow_run_id=33339770831
        and medindex_validation_pass
        and not clinical_attestation_used
    ) technical_qa_evidence_pass
),
gate as (
  select
    m.*,
    (
      m.phase8_closed
      and m.v2_runtime_preserved
      and not m.v3_cutover_enabled
      and m.favorites_polymorphic
      and m.notes_entity_type_ready
      and m.notes_entity_key_ready
      and m.notes_polymorphic_drug_nullable
      and m.favorite_owner_policy_count=4
      and m.note_owner_policy_count>=4
      and m.context_rpc_exists
      and m.context_service_execute
      and not m.context_anon_execute
      and not m.context_auth_execute
    ) backend_foundation_gate_pass
  from metrics m
)
select jsonb_build_object(
  'statusVersion','drx-phase9-status-v3',
  'phase',9,
  'phase8Closed',g.phase8_closed,
  'phase8EvidenceId','phase8-exit-bc124406',
  'phase8WorkflowRunId',33337806358,
  'phase8ArtifactId',9739582132,
  'v2FallbackRequired',true,
  'v2RuntimePreserved',g.v2_runtime_preserved,
  'v3CutoverEnabled',g.v3_cutover_enabled,
  'favoritesPolymorphic',g.favorites_polymorphic,
  'notesEntityTypeReady',g.notes_entity_type_ready,
  'notesEntityKeyReady',g.notes_entity_key_ready,
  'notesPolymorphicDrugNullable',g.notes_polymorphic_drug_nullable,
  'favoriteOwnerPolicyCount',g.favorite_owner_policy_count,
  'noteOwnerPolicyCount',g.note_owner_policy_count,
  'contextRpcExists',g.context_rpc_exists,
  'contextServiceExecute',g.context_service_execute,
  'contextAnonExecute',g.context_anon_execute,
  'contextAuthenticatedExecute',g.context_auth_execute,
  'backendFoundationGatePass',g.backend_foundation_gate_pass,
  'technicalQaEvidencePass',g.technical_qa_evidence_pass,
  'technicalQaEvidenceId','phase9-qa-8ecaa228',
  'phase9WorkflowRunId',33339677881,
  'phase9ArtifactId',9740145041,
  'clinicalAttestationUsed',false,
  'frontendQaRequired',true,
  'frontendQaPassed',g.technical_qa_evidence_pass,
  'finalExitPass',g.backend_foundation_gate_pass and g.technical_qa_evidence_pass,
  'phase10Allowed',g.backend_foundation_gate_pass and g.technical_qa_evidence_pass
)
from gate g
$$;

revoke all on function public.drx_phase9_status_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase9_status_v1()
  to service_role;
