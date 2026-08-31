-- Forward-only rollback guard for Phase 10D reconciliation.
-- Reverting this migration would reactivate two competing traffic control planes.

do $$
begin
  raise exception 'Rollback blocked: Phase 10D reconciliation is forward-only; reverting would reactivate conflicting runtime controls.';
end
$$;
