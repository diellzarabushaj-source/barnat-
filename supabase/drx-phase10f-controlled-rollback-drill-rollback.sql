-- Phase 10F is immutable operational evidence.
do $$
begin
  raise exception 'Rollback blocked: Phase 10F rollback-drill evidence and cutover events are append-only.';
end
$$;
