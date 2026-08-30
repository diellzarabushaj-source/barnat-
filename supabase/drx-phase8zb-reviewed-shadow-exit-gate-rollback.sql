-- Phase 8ZB reviewed shadow exit gate rollback.
-- Fail-closed by design after attested clinical review/materialization.
do $$
begin
  raise exception 'Phase 8ZB reviewed shadow exit gate rollback blocked: attested Phase 8 clinical evidence must not be destructively reverted; use a forward corrective migration or retire V3 pilot artifacts.';
end $$;
