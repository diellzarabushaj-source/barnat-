-- Rollback DRx Phase 9D.
-- Context RPC is additive/read-only; removing it does not mutate clinical data.

drop function if exists public.drx_phase9_product_context_v1(uuid);
