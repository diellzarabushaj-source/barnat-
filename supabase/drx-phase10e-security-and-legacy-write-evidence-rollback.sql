-- Phase 10E evidence is append-only and intentionally not deletable.
do $$
begin
  raise exception 'Rollback blocked: Phase 10E gate evidence is immutable. Append newer evidence instead of deleting history.';
end
$$;
