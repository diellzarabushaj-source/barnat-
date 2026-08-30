create table if not exists drx_dose.phase9_frontend_qa_evidence_v1 (
  evidence_id text primary key,
  evidence_version text not null
    check (evidence_version='drx-phase9-browser-qa-v1'),
  phase9_commit_sha text not null
    check (phase9_commit_sha ~ '^[0-9a-f]{40}$'),
  phase9_workflow_run_id bigint not null unique
    check (phase9_workflow_run_id > 0),
  phase9_workflow_conclusion text not null
    check (phase9_workflow_conclusion='success'),
  artifact_name text not null,
  artifact_id bigint not null unique check (artifact_id > 0),
  artifact_digest text not null
    check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  viewport_set jsonb not null
    check (
      jsonb_typeof(viewport_set)='array'
      and viewport_set @> '["390x844","768x1024","1440x1000"]'::jsonb
      and jsonb_array_length(viewport_set)=3
    ),
  browser_qa_pass boolean not null check (browser_qa_pass),
  owner_isolation_pass boolean not null check (owner_isolation_pass),
  phase9_gate_pass boolean not null check (phase9_gate_pass),
  safety_commit_sha text not null
    check (safety_commit_sha ~ '^[0-9a-f]{40}$'),
  safety_workflow_run_id bigint not null unique check (safety_workflow_run_id > 0),
  safety_gate_pass boolean not null check (safety_gate_pass),
  medindex_commit_sha text not null
    check (medindex_commit_sha ~ '^[0-9a-f]{40}$'),
  medindex_workflow_run_id bigint not null unique check (medindex_workflow_run_id > 0),
  medindex_validation_pass boolean not null check (medindex_validation_pass),
  clinical_attestation_used boolean not null default false
    check (clinical_attestation_used=false),
  recorded_at timestamptz not null default now(),
  note text not null
);

alter table drx_dose.phase9_frontend_qa_evidence_v1 enable row level security;
alter table drx_dose.phase9_frontend_qa_evidence_v1 force row level security;

revoke all on table drx_dose.phase9_frontend_qa_evidence_v1
  from public,anon,authenticated,service_role;

create or replace function drx_dose.guard_phase9_frontend_qa_evidence_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,drx_dose
as $$
begin
  raise exception 'Phase 9 frontend QA evidence is immutable';
end
$$;

revoke all on function drx_dose.guard_phase9_frontend_qa_evidence_immutable_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists phase9_frontend_qa_evidence_immutable_v1
  on drx_dose.phase9_frontend_qa_evidence_v1;

create trigger phase9_frontend_qa_evidence_immutable_v1
before update or delete on drx_dose.phase9_frontend_qa_evidence_v1
for each row execute function drx_dose.guard_phase9_frontend_qa_evidence_immutable_v1();

insert into drx_dose.phase9_frontend_qa_evidence_v1 (
  evidence_id,evidence_version,
  phase9_commit_sha,phase9_workflow_run_id,phase9_workflow_conclusion,
  artifact_name,artifact_id,artifact_digest,viewport_set,
  browser_qa_pass,owner_isolation_pass,phase9_gate_pass,
  safety_commit_sha,safety_workflow_run_id,safety_gate_pass,
  medindex_commit_sha,medindex_workflow_run_id,medindex_validation_pass,
  clinical_attestation_used,note
) values (
  'phase9-qa-8ecaa228',
  'drx-phase9-browser-qa-v1',
  '8ecaa2283e13c4626bf8125cd90b354700ca1172',
  33339677881,
  'success',
  'drx-phase9-foundation-evidence',
  9740145041,
  'sha256:10f50320135c925df73fe2ed31900fb4fafc087356bc67f1cfa4c59225099950',
  '["390x844","768x1024","1440x1000"]'::jsonb,
  true,true,true,
  'f89adcf71f575f6f7bcd88f27b0bac55ea3c7dd1',
  33339770836,
  true,
  'f89adcf71f575f6f7bcd88f27b0bac55ea3c7dd1',
  33339770831,
  true,
  false,
  'Technical Phase 9 exit evidence only. No clinical reviewer attestation is represented or implied.'
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
  select public.drx_phase8_status_v1() as status
),
qa as materialized (
  select *
  from drx_dose.phase9_frontend_qa_evidence_v1
  where evidence_id='phase9-qa-8ecaa228'
),
metrics as (
  select
    coalesce((p8.status->>'exit_gate_pass')::boolean,false) phase8_closed,
    coalesce((p8.status->>'v2_runtime_preserved')::boolean,false) v2_runtime_preserved,
    coalesce((p8.status->>'v3_cutover_enabled')::boolean,false) v3_cutover_enabled,
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
  from p8
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
  'statusVersion','drx-phase9-status-v2',
  'phase',9,
  'phase8Closed',g.phase8_closed,
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
