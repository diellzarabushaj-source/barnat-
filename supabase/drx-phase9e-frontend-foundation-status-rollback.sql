-- Rollback DRx Phase 9E.
-- Status RPC is read-only and additive.

drop function if exists public.drx_phase9_status_v1();
