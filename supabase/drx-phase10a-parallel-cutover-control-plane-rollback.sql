-- Forward-only audit rollback for the superseded parallel Phase 10 control plane.
-- This migration is intentionally retained because 20260831050214 reconciles it
-- to the canonical drx_runtime control plane. Removing it would destroy audit history.

do $$
begin
  raise exception 'Rollback blocked: 20260831045759 is superseded and retained for audit; canonical control is drx_runtime.phase10_cutover_control_v1.';
end
$$;
