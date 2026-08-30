-- Rollback DRx Phase 10C evidence.
-- This rollback deletes only the exact technical evidence inserted by 10C.
-- It is blocked once a later Phase 10 migration exists.

do $$
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where version>'20260830231548' and name like 'drx_phase10%'
  ) then
    raise exception 'Phase 10C rollback blocked: later Phase 10 migration history exists';
  end if;
end
$$;

-- The evidence table is append-only by trigger; disable only the exact
-- append-only trigger within this rollback transaction, remove exact rows,
-- then restore the trigger.
drop trigger if exists phase10_gate_evidence_append_only_v1
  on drx_runtime.phase10_gate_evidence_v1;

delete from drx_runtime.phase10_gate_evidence_v1
where (gate_key='GOLDEN_CLINICAL_100'
       and evidence_sha256='104287dc461790eeda49fef728f8ab6584e79a7e5e5575be7b83a1c439faa98e')
   or (gate_key='PARITY_100_PUBLISHED_V3'
       and evidence_sha256='6dc51366961a8d1e11b79ff187d0b3df97f7e2b04ab849b94ad9239d303d1a9c');

create trigger phase10_gate_evidence_append_only_v1
before update or delete on drx_runtime.phase10_gate_evidence_v1
for each row execute function drx_runtime.phase10_append_only_guard_v1();
