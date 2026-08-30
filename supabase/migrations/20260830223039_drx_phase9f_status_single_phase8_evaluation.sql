-- DRx Phase 9F: evaluate the expensive Phase 8 status exactly once.
-- This is a performance-only replacement of the Phase 9 status RPC.

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
    has_function_privilege('authenticated','public.drx_phase9_product_context_v1(uuid)','EXECUTE') context_auth_execute
  from p8
)
select jsonb_build_object(
  'statusVersion','drx-phase9-status-v1',
  'phase',9,
  'phase8Closed',m.phase8_closed,
  'v2FallbackRequired',true,
  'v2RuntimePreserved',m.v2_runtime_preserved,
  'v3CutoverEnabled',m.v3_cutover_enabled,
  'favoritesPolymorphic',m.favorites_polymorphic,
  'notesEntityTypeReady',m.notes_entity_type_ready,
  'notesEntityKeyReady',m.notes_entity_key_ready,
  'notesPolymorphicDrugNullable',m.notes_polymorphic_drug_nullable,
  'favoriteOwnerPolicyCount',m.favorite_owner_policy_count,
  'noteOwnerPolicyCount',m.note_owner_policy_count,
  'contextRpcExists',m.context_rpc_exists,
  'contextServiceExecute',m.context_service_execute,
  'contextAnonExecute',m.context_anon_execute,
  'contextAuthenticatedExecute',m.context_auth_execute,
  'backendFoundationGatePass',
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
    and not m.context_auth_execute,
  'frontendQaRequired',true,
  'finalExitPass',false
)
from metrics m
$$;

revoke all on function public.drx_phase9_status_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase9_status_v1()
  to service_role;
