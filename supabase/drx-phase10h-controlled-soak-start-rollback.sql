-- Rollback DRx Phase 10H.
-- A started production soak is audit evidence and cannot be erased or backdated.

do $$
begin
  if exists (
    select 1
    from drx_runtime.phase10_soak_windows_v1
    where evidence_sha256='2fbc9f24da0f5126880273d56a44481d315d1b0ef305e9a16e17e487fbb4694d'
  ) then
    raise exception 'Phase 10H rollback blocked: production soak evidence exists and must be preserved';
  end if;
end
$$;

drop trigger if exists phase10_soak_guard_v1 on drx_runtime.phase10_soak_windows_v1;
drop function if exists drx_runtime.phase10_soak_guard_v1();
